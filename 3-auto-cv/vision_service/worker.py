"""Detection worker: reads registered cameras / video files / webcam, runs the enabled detector plugins,
confirms events over several frames, attaches PIXELATED evidence (best frame + short clip) and posts to the
central backend. Inference lives here, never in the web apps.

  python -m vision_service.worker --source cam-store=../demo-assets/fire.mp4 --loop --realtime
  python -m vision_service.worker --source cam-line3=0              # laptop webcam
  python -m vision_service.worker                                   # every enabled camera registered in the dashboard

Pipeline: frame -> people/vehicle pre-pass -> plugins -> N-of-M confirmation -> cooldown -> evidence -> backend.
"""

from __future__ import annotations

import argparse
import os
import tempfile
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from . import plugins as P
from .client import BackendClient
from .machine import MachineState
from .privacy import PRIVACY_CONF, pixelate, pixelated_jpeg
from .rules import Detection
from .zones import CameraConfig, load_camera_config, parse_camera_config

ROOT = Path(__file__).resolve().parent.parent
CLIP_BEFORE_S, CLIP_AFTER_S = 4.0, 3.0
PREVIEW_EVERY_S = 1.0


class StillCap:
    """Feeds one image as a short fixed video so image samples can run through the same pipeline."""

    def __init__(self, path: str, seconds: float = 9.0, fps: float = 24.0) -> None:
        self.img = cv2.imread(path)
        self.n = int(seconds * fps)
        self.fps = fps
        self.i = 0

    def isOpened(self) -> bool:  # noqa: N802 (mirrors cv2.VideoCapture)
        return self.img is not None

    def read(self) -> tuple[bool, Any]:
        if self.i >= self.n:
            return False, None
        self.i += 1
        return True, self.img.copy()

    def get(self, prop: int) -> float:
        return self.fps if prop == cv2.CAP_PROP_FPS else 0.0

    def release(self) -> None:
        pass


IMAGE_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


class Confirmer:
    """N of the last M observations must contain the candidate (reduces single-frame false positives)."""

    def __init__(self) -> None:
        self.hist: deque[bool] = deque(maxlen=15)

    def update(self, seen: bool, n: int, m: int) -> bool:
        self.hist.append(seen)
        return sum(list(self.hist)[-m:]) >= n


class Shared:
    """Pre-pass model + live settings (enabled flags, thresholds) refreshed from the dashboard."""

    def __init__(self, vehicle_classes: set[str]) -> None:
        self.coco = P._load_yolo("yolov8n.pt")
        self.vehicle_classes = vehicle_classes
        self.settings: dict[str, dict[str, Any]] = {}
        self.names = {int(k): v for k, v in self.coco.names.items()}
        print(f"[worker] yolov8n model.names (people/vehicles): person={self.names.get(0)}, vehicles={sorted(vehicle_classes)}")

    def prepass(self, frame: np.ndarray) -> tuple[list[Detection], list[Detection]]:
        with P._model_lock:
            r = self.coco.predict(frame, conf=PRIVACY_CONF, classes=[0, 2, 5, 7], verbose=False)[0]
        people: list[Detection] = []
        vehicles: list[Detection] = []
        for b, c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist(), strict=False):
            name = self.names[int(k)]
            if name == "person":
                people.append(Detection(tuple(b), float(c), "person"))  # type: ignore[arg-type]
            elif name in self.vehicle_classes:
                vehicles.append(Detection(tuple(b), float(c), "forklift"))  # type: ignore[arg-type]
        return people, vehicles


class CameraRunner(threading.Thread):
    def __init__(self, cam: dict[str, Any], source: str, detectors: list[str], cfg: CameraConfig, client: BackendClient,
                 shared: Shared, args: argparse.Namespace, machine: MachineState) -> None:
        super().__init__(daemon=True, name=f"cam-{cam['id']}")
        self.cam, self.source, self.client, self.shared, self.args, self.machine = cam, source, client, shared, args, machine
        self.cfg = cfg
        self.zones = cfg.zones
        self.stop = threading.Event()
        self.plugins: list[P.Plugin] = []
        statuses: dict[str, str] = {}
        for d in detectors:
            try:
                self.plugins.append(P.PLUGIN_FACTORIES[d]())
                statuses[d] = "ready"
                print(f"[{cam['id']}] detector '{d}' ready")
            except Exception as e:  # missing weights, no CLIP, etc: say so, keep the others running
                statuses[d] = f"unavailable: {type(e).__name__}: {e}"
                print(f"[{cam['id']}] detector '{d}' NOT available: {type(e).__name__}: {e}")
        client.detector_status(cam["id"], statuses)
        self.conf: dict[tuple[str, str], Confirmer] = {}
        self.cool: dict[tuple[str, str], float] = {}
        self.ring: deque[tuple[float, np.ndarray, list[tuple[float, float, float, float]]]] = deque()
        self.pending: list[dict[str, Any]] = []
        self.posted = 0

    # -- helpers ---------------------------------------------------------------------------------------------
    def _open(self) -> cv2.VideoCapture | StillCap:
        src: int | str = int(self.source) if self.source.isdigit() else self.source
        if isinstance(src, str) and not src.startswith(("rtsp://", "http://", "https://")):
            p = Path(src)
            src = str(p if p.is_absolute() else (Path.cwd() / p if (Path.cwd() / p).exists() else ROOT / p))
        if isinstance(src, str) and src.lower().endswith(IMAGE_EXT):
            return StillCap(src)
        cap = cv2.VideoCapture(src)
        if isinstance(src, int):
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        return cap

    def _settings(self, name: str) -> dict[str, Any]:
        return self.shared.settings.get(name, {"enabled": True})

    def _clip(self, t_from: float, t_to: float) -> bytes | None:
        frames = [(t, f, b) for t, f, b in self.ring if t_from <= t <= t_to]
        if len(frames) < 4:
            return None
        h, w = frames[0][1].shape[:2]
        dur = max(0.5, frames[-1][0] - frames[0][0])
        fps = max(2.0, min(12.0, len(frames) / dur))
        fd, path = tempfile.mkstemp(suffix=".webm")
        os.close(fd)
        try:
            vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"VP80"), fps, (w, h))
            if not vw.isOpened():
                return None
            for _, f, boxes in frames:
                vw.write(pixelate(f, boxes))  # every saved frame is pixelated
            vw.release()
            data = Path(path).read_bytes()
            return data if 0 < len(data) < 55 * 1024 * 1024 else None
        finally:
            Path(path).unlink(missing_ok=True)

    def _finish(self, ev: dict[str, Any], t_now: float) -> None:
        clip = self._clip(ev["t"] - CLIP_BEFORE_S, t_now)
        cand: P.Candidate = ev["cand"]

        def send() -> None:
            res = self.client.detection(
                camera_id=self.cam["id"], detector=cand.detector, model=cand.model, version=cand.version, cls=cand.cls,
                confidence=cand.confidence, description=cand.description,
                meta={**cand.meta, "confirm": f"{cand.confirm_n} of {cand.confirm_m}", "pixelated": True, "source": "worker"},
                frame_jpeg=ev["jpeg"], clip=clip,
            )
            print(f"[{self.cam['id']}] EVENT {cand.detector}/{cand.cls} conf={cand.confidence:.2f} -> {res}")

        threading.Thread(target=send, daemon=True).start()
        self.posted += 1

    # -- main loop ---------------------------------------------------------------------------------------------
    def run(self) -> None:
        cap = self._open()
        if not cap.isOpened():
            print(f"[{self.cam['id']}] cannot open source {self.source!r}")
            self.client.heartbeat(self.cam["id"], "error", None)
            return
        is_file = not (self.source.isdigit() or self.source.startswith(("rtsp://", "http")))
        vfps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        step = max(1, round(vfps / self.args.fps)) if is_file else 1
        start = time.monotonic()
        idx, last_proc, last_prev, last_hb, n_proc = 0, -1e9, -1e9, 0.0, 0
        t0_proc = time.monotonic()
        print(f"[{self.cam['id']}] reading {self.source!r} ({'file' if is_file else 'live'}), machine-running signal is SIMULATED")
        while not self.stop.is_set():
            ok, frame = cap.read()
            if not ok:
                if is_file and self.args.loop:
                    cap.release()
                    cap = self._open()
                    idx = 0
                    start = time.monotonic()
                    continue
                break
            idx += 1
            t = idx / vfps if is_file else time.monotonic() - start
            if is_file and idx % step:
                continue
            if not is_file and t - last_proc < 1.0 / self.args.fps:
                continue
            if self.args.max_seconds and t > self.args.max_seconds:
                break
            if is_file and self.args.realtime:
                lag = t - (time.monotonic() - start)
                if lag > 0:
                    time.sleep(min(lag, 1.0))
            last_proc = t
            n_proc += 1
            people, vehicles = self.shared.prepass(frame)
            pboxes = [p.box for p in people]
            ctx = P.FrameCtx(frame, t, datetime.now(), people, vehicles, self.zones, self.machine.running(t), self.cam["id"], self.cfg)
            small = frame if frame.shape[1] <= 640 else cv2.resize(frame, (640, int(frame.shape[0] * 640 / frame.shape[1])))
            k = small.shape[1] / frame.shape[1]
            self.ring.append((t, small, [tuple(v * k for v in b) for b in pboxes]))  # type: ignore[misc]
            while self.ring and t - self.ring[0][0] > CLIP_BEFORE_S + CLIP_AFTER_S + 6:
                self.ring.popleft()

            seen_keys: set[tuple[str, str]] = set()
            ran: set[str] = set()  # plugins that actually evaluated this frame
            for pl in self.plugins:
                cfg = self._settings(pl.name)
                if not cfg.get("enabled", True) or not pl.due(t):
                    continue
                ran.add(pl.name)
                try:
                    cands = pl.process(ctx)
                except Exception as e:  # one bad plugin must not stop the camera
                    print(f"[{self.cam['id']}] {pl.name} error: {type(e).__name__}: {e}")
                    continue
                for c in cands:
                    min_conf = cfg.get("min_conf")
                    if min_conf and c.confidence < min_conf:
                        continue
                    key = (c.detector, c.cls)
                    seen_keys.add(key)
                    n = cfg.get("confirm_n") or c.confirm_n
                    m = cfg.get("confirm_m") or c.confirm_m
                    ok_ev = True if c.already_confirmed else self.conf.setdefault(key, Confirmer()).update(True, n, m)
                    if ok_ev and t - self.cool.get(key, -1e9) > self.args.cooldown:
                        self.cool[key] = t
                        jpeg = pixelated_jpeg(frame, pboxes, highlight=c.boxes)
                        self.pending.append({"t": t, "cand": c, "jpeg": jpeg, "due": t + CLIP_AFTER_S})
            for key, cf in self.conf.items():
                if key not in seen_keys and key[0] in ran:
                    cf.hist.append(False)
            for ev in [e for e in self.pending if t >= e["due"]]:
                self.pending.remove(ev)
                self._finish(ev, t)

            now = time.monotonic()
            if now - last_prev >= PREVIEW_EVERY_S:
                last_prev = now
                shown = small if self.args.clear_preview else pixelate(small, [tuple(v * k for v in b) for b in pboxes])  # type: ignore[misc]
                okj, buf = cv2.imencode(".jpg", shown, [cv2.IMWRITE_JPEG_QUALITY, 55])
                if okj:
                    self.client.preview(self.cam["id"], buf.tobytes())
            if now - last_hb >= 5:
                last_hb = now
                self.client.heartbeat(self.cam["id"], "running", n_proc / max(0.1, now - t0_proc))
        for ev in self.pending:  # flush events whose clip window was cut short by the end of a file
            self._finish(ev, ev["t"] + CLIP_AFTER_S)
        time.sleep(1.0)  # let posting threads finish
        self.client.heartbeat(self.cam["id"], "stopped", None)
        cap.release()
        print(f"[{self.cam['id']}] done, {self.posted} event(s) posted")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api", default=os.getenv("API_URL", "http://127.0.0.1:8000/api"))
    p.add_argument("--key", default=os.getenv("CV_WORKER_KEY", "dev-worker-key"))
    p.add_argument("--source", action="append", default=[], metavar="CAM=SRC", help="override a camera's source (file, 0, rtsp://...)")
    p.add_argument("--detectors", default="", help="comma list; default = the detectors configured for each camera")
    p.add_argument("--zones", action="append", default=[], metavar="CAM=FILE", help="zones yaml per camera (default zones/<cam>.yaml)")
    p.add_argument("--fps", type=float, default=6.0, help="target processing rate per camera")
    p.add_argument("--loop", action="store_true", help="restart video files at the end")
    p.add_argument("--realtime", action="store_true", help="pace video files at their own speed (for live dashboard demos)")
    p.add_argument("--max-seconds", type=float, default=0)
    p.add_argument("--cooldown", type=float, default=30.0, help="seconds before the same event may be sent again")
    p.add_argument("--machine-running", default="on", help="SIMULATED signal: on | off | schedule:on:0-20,off:20-40")
    p.add_argument("--vehicle-classes", default="truck", help="COCO classes used as forklift stand-in")
    p.add_argument("--clear-preview", action="store_true", help="send the live preview WITHOUT pixelating people (authorised use only)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    client = BackendClient(args.api, args.key)
    cfg = client.config()
    overrides = dict(s.split("=", 1) for s in args.source)
    zone_files = dict(s.split("=", 1) for s in args.zones)
    only = {d for d in args.detectors.split(",") if d}
    shared = Shared({v.strip() for v in args.vehicle_classes.split(",") if v.strip()})
    shared.settings = cfg["detectors"]
    machine = MachineState(args.machine_running, port=8765)
    runners: list[CameraRunner] = []
    for cam in cfg["cameras"]:
        src = overrides.get(cam["id"]) or (cam.get("source") or "")
        if overrides and cam["id"] not in overrides:
            continue
        if not src or cam["kind"] != "camera":
            continue
        dets = [d for d in cam["detectors"] if d in P.PLUGIN_FACTORIES and (not only or d in only)]
        zf = zone_files.get(cam["id"]) or (ROOT / "zones" / f"{cam['id']}.yaml")
        if cam.get("config"):  # configured in the dashboard: wins over local files
            cfg = parse_camera_config(cam["config"])
        elif Path(zf).exists():
            cfg = load_camera_config(zf)
        else:
            cfg = CameraConfig()
        r = CameraRunner(cam, src, dets, cfg, client, shared, args, machine)
        runners.append(r)
    if not runners:
        print("No camera to run. Register a camera with a source in the dashboard or pass --source CAM=VIDEO.")
        return 1

    def refresh() -> None:
        while True:
            time.sleep(15)
            try:
                shared.settings = client.config()["detectors"]
            except Exception:
                pass

    threading.Thread(target=refresh, daemon=True).start()
    for r in runners:
        r.start()
    try:
        while any(r.is_alive() for r in runners):
            time.sleep(0.5)
    except KeyboardInterrupt:
        for r in runners:
            r.stop.set()
        time.sleep(1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
