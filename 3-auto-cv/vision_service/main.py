"""Camera service CLI. Pretrained weights only, no training.

  python -m vision_service --source demo.mp4 --zones zones.yaml --sink firestore

Models (all pretrained):
  people    yolov8n.pt          COCO class "person"                   Ultralytics, AGPL-3.0
  wrists    yolov8n-pose.pt     COCO keypoints 9/10 = wrists          Ultralytics, AGPL-3.0
  forklift  COCO "truck" as a stand-in unless --forklift-model is given (see README: the Hugging Face
            forklift model declares no licence, so it is NOT downloaded automatically).
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import supervision as sv
from dotenv import load_dotenv

from .machine import MachineState
from .privacy import PRIVACY_CONF, pixelated_jpeg
from .rules import (
    Detection,
    ForkliftGapRule,
    HandInZoneRule,
    IdleMachineRule,
    PersonInForkliftLaneRule,
    RuleEvent,
)
from .sink import FirestoreSink, LocalSink, Sink
from .zones import load_zones

logging.getLogger("dotenv.main").setLevel(logging.ERROR)  # unparsable lines in .env are not ours
LEFT_WRIST, RIGHT_WRIST = 9, 10
ROOT = Path(__file__).resolve().parents[3]
PROJECT_ID = "demo-plant-line3"  # must match firebase.json / npm scripts / the web app


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    load_dotenv(ROOT / ".env")  # optional; real env vars win
    e = os.environ.get
    if e("GCLOUD_PROJECT") and e("GCLOUD_PROJECT") != PROJECT_ID:
        print(
            f"note: ignoring GCLOUD_PROJECT={e('GCLOUD_PROJECT')!r}; the emulator project is {PROJECT_ID!r} "
            "(pass --project to override)",
            file=sys.stderr,
        )
    p = argparse.ArgumentParser(prog="vision_service", description=__doc__.split("\n")[0])
    p.add_argument("--source", default=e("VIDEO_SOURCE", ""), help="video file, webcam index (0) or RTSP URL")
    p.add_argument("--zones", default=e("ZONES_FILE", "zones.yaml"))
    p.add_argument(
        "--machine-running",
        default=e("MACHINE_RUNNING", "on"),
        help="SIMULATED signal: on | off | http | schedule:on:0-30,off:30-60",
    )
    p.add_argument("--sink", choices=["firestore", "local"], default="firestore")
    p.add_argument("--out-dir", default="out-events", help="folder for --sink local")
    p.add_argument("--project", default=PROJECT_ID, help="Firebase emulator project id (fixed for this repo)")
    p.add_argument("--bucket", default=None, help="default: <project>.appspot.com")
    p.add_argument("--gap-px", type=float, default=80.0, help="forklift-person edge gap threshold (pixels)")
    p.add_argument("--gap-sustain", type=float, default=0.6, help="seconds the gap must hold")
    p.add_argument("--hand-sustain", type=float, default=1.5, help="seconds a wrist must stay in the zone")
    p.add_argument("--min-conf", type=float, default=0.5, help="detections below this never fire an alert")
    p.add_argument("--vehicle-classes", default="truck", help="COCO classes used as forklift stand-in")
    p.add_argument(
        "--forklift-model", default=None, help="optional forklift weights (check its licence first)"
    )
    p.add_argument("--forklift-class", default="forklift")
    p.add_argument("--stride", type=int, default=1, help="process every Nth frame (CPU saver)")
    p.add_argument(
        "--max-seconds", type=float, default=0.0, help="stop after this many video seconds (0 = all)"
    )
    p.add_argument(
        "--p2-rules",
        action="store_true",
        help="also run Phase 2 rules: person in forklift-only lane, idle machine (energy)",
    )
    p.add_argument("--lane-sustain", type=float, default=2.0)
    p.add_argument(
        "--idle-minutes", type=float, default=5.0, help="idle machine rule: minutes with nobody present"
    )
    p.add_argument(
        "--auto-report",
        action="store_true",
        help="skip human confirmation: every detection becomes a report at once (marked 'auto'; expect false alarms)",
    )
    p.add_argument("--print-model-names", action="store_true", help="load models, print model.names, exit")
    args = p.parse_args(argv)
    args.source = _resolve(args.source)
    args.zones = _resolve(args.zones)
    args.machine_running = {"true": "on", "false": "off"}.get(
        args.machine_running.lower(), args.machine_running
    )
    return args


def _resolve(path: str) -> str:
    """Paths from .env are written relative to the repo root; accept them from any working directory."""
    if not path or path.isdigit() or "://" in path or Path(path).exists():
        return path
    alt = ROOT / path
    return str(alt) if alt.exists() else path


def load_models(args: argparse.Namespace):
    from ultralytics import YOLO

    det, pose = YOLO("yolov8n.pt"), YOLO("yolov8n-pose.pt")
    print("yolov8n.pt model.names:", det.names)
    print("yolov8n-pose.pt model.names:", pose.names)
    fk = None
    if args.forklift_model:
        fk = YOLO(args.forklift_model)
        print(f"{args.forklift_model} model.names:", fk.names)
        if args.forklift_class not in fk.names.values():
            sys.exit(f"class {args.forklift_class!r} not in forklift model names; refusing to guess")
    return det, pose, fk


def make_sink(args: argparse.Namespace) -> Sink:
    if args.sink == "local":
        return LocalSink(args.out_dir)
    return FirestoreSink(
        args.project, args.bucket or f"{args.project}.appspot.com", auto_report=args.auto_report
    )


def run(args: argparse.Namespace) -> Counter:
    det_model, pose_model, fk_model = load_models(args)
    if args.print_model_names:
        return Counter()
    if args.source == "":
        sys.exit("no --source (or VIDEO_SOURCE). Give a video file, webcam index or RTSP URL.")
    zones = load_zones(args.zones)
    machine = MachineState(args.machine_running)
    sink = make_sink(args)
    gap_rule = ForkliftGapRule(
        args.gap_px, args.gap_sustain, args.min_conf, lanes=[z for z in zones if z.type == "forklift_lane"]
    )
    hand_rule = HandInZoneRule(zones, args.hand_sustain, args.min_conf)
    lane_rule = PersonInForkliftLaneRule(zones, args.lane_sustain, args.min_conf) if args.p2_rules else None
    idle_rule = IdleMachineRule(zones, args.idle_minutes) if args.p2_rules else None
    vehicle_names = {s.strip() for s in args.vehicle_classes.split(",")}

    src: int | str = int(args.source) if args.source.isdigit() else args.source
    live = isinstance(src, int) or str(src).startswith(("rtsp://", "http"))
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        sys.exit(f"cannot open source {args.source!r}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    tracker = sv.ByteTrack(frame_rate=max(1, int(fps / max(1, args.stride))))
    counts: Counter = Counter()
    start = time.monotonic()
    idx = -1
    print(
        f"processing {args.source!r} at {fps:.1f} fps; machine-running signal is SIMULATED ({args.machine_running})"
    )

    def emit(ev: RuleEvent, frame: np.ndarray, people: list[Detection]) -> None:
        jpeg = pixelated_jpeg(frame, [p.box for p in people], highlight=ev.boxes)
        eid = sink.emit(ev, jpeg, simulated=machine.simulated)
        counts[ev.rule] += 1
        print(f"EVENT {ev.rule} zone={ev.zone_id} conf={ev.confidence} measure={ev.measure} -> {eid}")

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        idx += 1
        if idx % max(1, args.stride):
            continue
        t = (time.monotonic() - start) if live else idx / fps
        if args.max_seconds and t > args.max_seconds:
            break

        res = det_model.predict(frame, conf=PRIVACY_CONF, verbose=False)[0]
        people_all: list[Detection] = []
        vehicles: list[Detection] = []
        for b, c, k in zip(
            res.boxes.xyxy.tolist(), res.boxes.conf.tolist(), res.boxes.cls.tolist(), strict=False
        ):
            name = det_model.names[int(k)]
            if name == "person":
                people_all.append(Detection(tuple(b), float(c), name))  # type: ignore[arg-type]
            elif fk_model is None and name in vehicle_names:
                vehicles.append(Detection(tuple(b), float(c), name))  # type: ignore[arg-type]
        if fk_model is not None:
            fr = fk_model.predict(frame, conf=args.min_conf, verbose=False)[0]
            for b, c, k in zip(
                fr.boxes.xyxy.tolist(), fr.boxes.conf.tolist(), fr.boxes.cls.tolist(), strict=False
            ):
                if fk_model.names[int(k)] == args.forklift_class:
                    vehicles.append(Detection(tuple(b), float(c), "forklift"))  # type: ignore[arg-type]

        # Track people (ByteTrack) so one flickering box does not restart an episode.
        strong = [p for p in people_all if p.conf >= args.min_conf]
        tracked: list[Detection] = strong
        if strong:
            sdet = sv.Detections(
                xyxy=np.array([p.box for p in strong], dtype=float),
                confidence=np.array([p.conf for p in strong], dtype=float),
                class_id=np.zeros(len(strong), dtype=int),
            )
            out = tracker.update_with_detections(sdet)
            tracked = [
                Detection(tuple(x), float(c or 0.0), "person")  # type: ignore[arg-type]
                for x, c in zip(out.xyxy.tolist(), out.confidence.tolist(), strict=False)
            ]

        ev = gap_rule.update(vehicles, tracked, t)
        if ev:
            emit(ev, frame, people_all)

        running = machine.running(t)
        if lane_rule:
            for lev in lane_rule.update(tracked, t):
                emit(lev, frame, people_all)
        if idle_rule:
            for iev in idle_rule.update(tracked, running, t):
                emit(iev, frame, people_all)
        if hand_rule.zones and running:
            pr = pose_model.predict(frame, conf=0.25, verbose=False)[0]
            wrists: list[tuple[tuple[float, float], float]] = []
            if pr.keypoints is not None and pr.keypoints.xy is not None and len(pr.keypoints.xy):
                kxy = pr.keypoints.xy.tolist()
                kcf = pr.keypoints.conf.tolist() if pr.keypoints.conf is not None else None
                for i, pts in enumerate(kxy):
                    for j in (LEFT_WRIST, RIGHT_WRIST):
                        cf = kcf[i][j] if kcf else 1.0
                        wrists.append(((pts[j][0], pts[j][1]), float(cf)))
            for hev in hand_rule.update(wrists, running, t):
                emit(hev, frame, people_all)
        else:
            hand_rule.update([], running, t)  # keeps episodes timing out correctly

    cap.release()
    print("done.", dict(counts) or "no events")
    return counts


def main(argv: list[str] | None = None) -> int:
    run(parse_args(argv))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
