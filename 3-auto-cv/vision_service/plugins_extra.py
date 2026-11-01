"""Detector plugins built on third-party weights (credits and licences: models/third_party/SOURCES.md).

Same contract as plugins.py: return raw Candidates; the runner confirms, de-duplicates, pixelates evidence and
posts to the backend. Nothing here talks to Telegram or the database.
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Any

import numpy as np

from .geometry import Box, box_gap, foot_point, point_in_polygon
from .plugins import ROOT, Candidate, FrameCtx, Plugin, _load_yolo, _model_lock
from .rules import EpisodeDebouncer
from .rules_ext import (
    CAUTION,
    CRITICAL,
    SAFE,
    ClosingSpeed,
    FallingObjectDetector,
    bin_mismatch,
    classify_proximity,
    is_driver,
    to_metres,
)
from .zones import CameraConfig

TP = "models/third_party"


def have(rel: str) -> bool:
    return (ROOT / rel).exists()


def _tracker(fps: float = 8.0):
    import supervision as sv

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return sv.ByteTrack(frame_rate=int(fps))


def _track(tracker, boxes: list[Box], confs: list[float], classes: list[int]):
    """ByteTrack over detections; returns [(track_id, box, conf, class_id)]."""
    import supervision as sv

    if not boxes:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            tracker.update_with_detections(sv.Detections.empty())
        return []
    det = sv.Detections(
        xyxy=np.array(boxes, dtype=float),
        confidence=np.array(confs, dtype=float),
        class_id=np.array(classes, dtype=int),
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        out = tracker.update_with_detections(det)
    ids = out.tracker_id if out.tracker_id is not None else []
    return [
        (int(i), tuple(b), float(c), int(k))
        for i, b, c, k in zip(ids, out.xyxy.tolist(), out.confidence.tolist(), out.class_id.tolist(), strict=False)
    ]


class ForkliftPedestrianPlugin(Plugin):
    """Model 7. Fine-tuned YOLO11n (classes forklift, person) + ByteTrack + pairwise distance and closing speed.

    Weights: sounak-sarkar-gwc/Forklift-pedestrian-proximity (no licence on file; used with the owner's approval).
    Levels SAFE / CAUTION / CRITICAL come from our own rule (rules_ext.classify_proximity). Distances are metres only
    with a camera calibration (`calibration.px_per_m`); otherwise they are ESTIMATES that assume a ~2 m forklift.
    """

    name = "forklift_person"
    interval_s = 0.12
    version = "warehouse_yolo11_v2"

    def __init__(self, weights: str = f"{TP}/forklift/best.pt", conf: float = 0.35) -> None:
        super().__init__()
        self.model = _load_yolo(weights)
        names = {int(k): str(v).lower() for k, v in self.model.names.items()}
        if set(names.values()) != {"forklift", "person"}:
            raise RuntimeError(f"unexpected forklift model classes {names}; refusing to guess")
        self.names, self.conf = names, conf
        self.model_name = "warehouse_yolo11_v2 (YOLO11n) + ByteTrack"
        self.tracker = _tracker()
        self.closing = ClosingSpeed()
        print(f"[forklift_person] {Path(weights).name} model.names = {self.model.names}")

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        with _model_lock:
            r = self.model.predict(ctx.frame, conf=self.conf, verbose=False)[0]
        tracked = _track(
            self.tracker,
            [tuple(b) for b in r.boxes.xyxy.tolist()],
            r.boxes.conf.tolist(),
            [int(k) for k in r.boxes.cls.tolist()],
        )
        forks = [t for t in tracked if self.names[t[3]] == "forklift"]
        people = [t for t in tracked if self.names[t[3]] == "person"]
        cfg = ctx.cfg or CameraConfig()
        th = cfg.forklift
        caution_m, critical_m = th.get("caution_m", 3.0), th.get("critical_m", 1.5)
        closing_th = th.get("closing_caution_mps", 1.0)
        rank = {SAFE: 0, CAUTION: 1, CRITICAL: 2}
        alive: set[tuple[int, int]] = set()
        worst: dict[str, Any] | None = None
        for fid, fb, fc, _ in forks:
            for pid, pb, pc, _ in people:
                if is_driver(pb, fb):
                    continue
                gap_px = box_gap(pb, fb)
                gap_m, basis = to_metres(gap_px, fb[3] - fb[1], cfg.px_per_m)
                alive.add((fid, pid))
                closing = self.closing.update((fid, pid), ctx.t, gap_m)
                level = classify_proximity(gap_m, closing, caution_m, critical_m, closing_th)
                if level == SAFE:
                    continue
                if worst is None or (rank[level], -gap_m) > (rank[worst["level"]], -worst["distance_m"]):
                    worst = {
                        "level": level,
                        "distance_m": round(gap_m, 2),
                        "distance_basis": basis,
                        "closing_mps": round(closing, 2),
                        "forklift_track": fid,
                        "person_track": pid,
                        "gap_px": round(gap_px),
                        "_boxes": [fb, pb],
                        "_conf": min(fc, pc),
                    }
        self.closing.forget_missing(alive)
        if worst is None:
            return []
        meta = {k: v for k, v in worst.items() if not k.startswith("_")}
        return [
            Candidate(
                "forklift_person",
                f"forklift_pedestrian_{worst['level'].lower()}",
                float(worst["_conf"]),
                list(worst["_boxes"]),
                f"{worst['level']}: pedestrian {worst['distance_m']} m from a forklift ({worst['distance_basis']}), "
                f"closing {worst['closing_mps']} m/s",
                meta,
                self.model_name,
                self.version,
                confirm_n=3,
                confirm_m=5,
            )
        ]


class MachineryProximityPlugin(Plugin):
    """Model 4. A tracked person inside a configured `machine_danger` zone while the machine is flagged running.

    No machinery detector is needed (the zone IS the machine's danger area); the running state is a SIMULATED
    signal unless wired to a real one. Standing near a stopped machine never alerts. The idea (zones + temporal
    rules) follows nisha572/ai-construction-safety-detection, which ships no weights; the code is our own.
    """

    name = "machinery_proximity"
    interval_s = 0.1
    model_name = "yolov8n person + ByteTrack + machine_danger zone rule"
    version = "rules-1"

    def __init__(self, sustain_s: float = 1.5) -> None:
        super().__init__()
        self.tracker = _tracker()
        self.deb: dict[str, EpisodeDebouncer] = {}
        self.sustain_s = sustain_s

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        zones = [z for z in ctx.zones if z.type == "machine_danger"]
        if not zones:
            return []
        strong = [d for d in ctx.persons if d.conf >= 0.5]
        tracked = _track(self.tracker, [d.box for d in strong], [d.conf for d in strong], [0] * len(strong))
        out: list[Candidate] = []
        for z in zones:
            inside = [t for t in tracked if point_in_polygon(foot_point(t[1]), z.polygon)]
            deb = self.deb.setdefault(z.id, EpisodeDebouncer(self.sustain_s, 8.0))
            if deb.update(bool(inside) and ctx.machine_running, ctx.t):
                out.append(
                    Candidate(
                        "machinery_proximity",
                        "person_in_machine_danger_zone",
                        min(t[2] for t in inside),
                        [t[1] for t in inside],
                        f"Person inside danger zone {z.id} while the machine is flagged running "
                        "(running signal may be simulated)",
                        {"zone": z.id, "sustained_s": self.sustain_s, "person_tracks": [t[0] for t in inside]},
                        self.model_name,
                        self.version,
                        already_confirmed=True,
                    )
                )
        return out


class PackagePlugin(Plugin):
    """Model 8. Primary: package_defect_v2 (dent, dirt, hole). Secondary two-stage SDG model (box -> Stain/Puncture).

    Visible carton damage only. It cannot tell wrong quantities or contents: that needs barcode/OCR/inventory data.
    """

    name = "package_damage"
    interval_s = 0.3
    version = "package_defect_v2 + SDG"

    def __init__(self, conf: float = 0.4, sdg_conf: float = 0.5) -> None:
        super().__init__()
        self.conf, self.sdg_conf = conf, sdg_conf
        self.primary = _load_yolo(f"{TP}/package/best.pt") if have(f"{TP}/package/best.pt") else None
        self.box = _load_yolo(f"{TP}/sdg_v2_HN_yolo1/best.pt") if have(f"{TP}/sdg_v2_HN_yolo1/best.pt") else None
        self.defect = (
            _load_yolo(f"{TP}/sdg_hybrid_v2_yolo2/best.pt") if have(f"{TP}/sdg_hybrid_v2_yolo2/best.pt") else None
        )
        if self.primary is None and not (self.box and self.defect):
            raise RuntimeError("no package-damage weights found in models/third_party")
        self.model_name = "package_defect_v2 (YOLO) / SDG two-stage"
        for tag, m in (("package", self.primary), ("sdg-box", self.box), ("sdg-defect", self.defect)):
            if m is not None:
                print(f"[package_damage] {tag} model.names = {m.names}")

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        found: dict[str, tuple[float, Box, str]] = {}
        with _model_lock:
            if self.primary is not None:
                r = self.primary.predict(ctx.frame, conf=self.conf, verbose=False)[0]
                for b, c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist(), strict=False):
                    n = f"package_{self.primary.names[int(k)]}"
                    if c > found.get(n, (0.0, (0, 0, 0, 0), ""))[0]:
                        found[n] = (float(c), tuple(b), "package_defect_v2")  # type: ignore[assignment]
            if self.box is not None and self.defect is not None:
                rb = self.box.predict(ctx.frame, conf=0.3, verbose=False)[0]
                for bb in rb.boxes.xyxy.tolist()[:4]:
                    x1, y1, x2, y2 = (int(max(0, v)) for v in bb)
                    crop = ctx.frame[y1:y2, x1:x2]
                    if crop.size == 0:
                        continue
                    rd = self.defect.predict(crop, conf=self.sdg_conf, verbose=False)[0]
                    for d, c, k in zip(rd.boxes.xyxy.tolist(), rd.boxes.conf.tolist(), rd.boxes.cls.tolist(), strict=False):
                        n = f"package_{self.defect.names[int(k)].lower()}"
                        if c > found.get(n, (0.0, (0, 0, 0, 0), ""))[0]:
                            found[n] = (float(c), (x1 + d[0], y1 + d[1], x1 + d[2], y1 + d[3]), "sdg_two_stage")  # type: ignore[assignment]
        return [
            Candidate(
                "package_damage",
                n,
                c,
                [bx],
                f"Visible package damage: {n.removeprefix('package_')} (verify)",
                {"source_model": src},
                self.model_name,
                self.version,
                confirm_n=2,
                confirm_m=3,
            )
            for n, (c, bx, src) in found.items()
        ]


class WastePlugin(Plugin):
    """Model 9. 19-class YOLO11n waste classifier (siyad23/waste-sorting-model, AGPL-3.0) + our bin-zone rules.

    Classification alone never raises anything: an item must lie in a `waste_bin` zone whose `allowed` groups
    (biodegradable / plastic / metal / hazardous) do not include it, or in a `no_waste` zone, or a bin must hold
    more items than its `capacity`.
    """

    name = "waste"
    interval_s = 0.8
    version = "yolo11n-waste19"

    def __init__(self, conf: float = 0.45, weights: str = f"{TP}/waste/best.pt") -> None:
        super().__init__()
        self.model = _load_yolo(weights)
        self.conf = conf
        self.model_name = "waste-sorting-model YOLO11n (19 classes)"
        print(f"[waste] {Path(weights).name} classes: {len(self.model.names)}")

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        zones = [z for z in ctx.zones if z.type in ("waste_bin", "no_waste")]
        if not zones:
            return []  # no bin layout configured: classification alone proves nothing
        with _model_lock:
            r = self.model.predict(ctx.frame, conf=self.conf, verbose=False)[0]
        items = [
            (tuple(b), float(c), str(self.model.names[int(k)]))
            for b, c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist(), strict=False)
        ]
        out: list[Candidate] = []
        for z in zones:
            inside = [
                i for i in items if point_in_polygon(((i[0][0] + i[0][2]) / 2, (i[0][1] + i[0][3]) / 2), z.polygon)
            ]
            if z.type == "no_waste" and inside:
                top = max(inside, key=lambda i: i[1])
                out.append(
                    Candidate(
                        "waste",
                        "waste_outside_bin",
                        top[1],
                        [i[0] for i in inside],
                        f"Waste ({top[2].removesuffix('_awss')}) in no-waste zone {z.id}",
                        {"zone": z.id, "classes": [i[2] for i in inside]},
                        self.model_name,
                        self.version,
                    )
                )
            if z.type == "waste_bin":
                bad = [(i, bin_mismatch(i[2], z.allowed)) for i in inside]
                bad = [(i, g) for i, g in bad if g]
                if bad:
                    top = max(bad, key=lambda x: x[0][1])
                    out.append(
                        Candidate(
                            "waste",
                            f"wrong_bin_{top[1]}",
                            top[0][1],
                            [b[0][0] for b in bad],
                            f"{top[0][2].removesuffix('_awss')} ({top[1]}) in bin {z.id} that accepts "
                            f"{', '.join(z.allowed)}",
                            {"zone": z.id, "group": top[1], "allowed": z.allowed, "hazardous": top[1] == "hazardous"},
                            self.model_name,
                            self.version,
                        )
                    )
                if z.capacity and len(inside) > z.capacity:
                    out.append(
                        Candidate(
                            "waste",
                            "bin_overflow",
                            max(i[1] for i in inside),
                            [i[0] for i in inside],
                            f"Bin {z.id} holds {len(inside)} visible items (capacity {z.capacity})",
                            {"zone": z.id, "count": len(inside)},
                            self.model_name,
                            self.version,
                        )
                    )
        return out


class LeakPlugin(Plugin):
    """Model 5. MSunusi/pipeline-leak-detection YOLO11n (classes crack, gas, leak, no leak, water).

    Trained on oil-and-gas PIPELINE imagery: it can flag a visible leak at equipment. It cannot identify a
    chemical, and a puddle on a floor is outside its training domain. `no leak` and `crack` never alert.
    A future custom spill-segmentation model plugs in here (same Candidate output). The LiquidMonitorAI
    segmentation weights were evaluated and rejected: they raised `liquid` on a dry warehouse floor.
    """

    name = "spill"
    interval_s = 0.5
    version = "pipeline-leak-yolo11n"
    ALERT = {"gas", "leak", "water"}

    def __init__(self, conf: float = 0.45, weights: str = f"{TP}/leak/best.pt") -> None:
        super().__init__()
        self.model = _load_yolo(weights)
        self.conf = conf
        self.model_name = "pipeline-leak-detection YOLO11n"
        print(f"[spill] {Path(weights).name} model.names = {self.model.names}")

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        with _model_lock:
            r = self.model.predict(ctx.frame, conf=self.conf, verbose=False)[0]
        watch = [z for z in ctx.zones if z.type == "spill_watch"]
        hits = []
        for b, c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist(), strict=False):
            n = str(self.model.names[int(k)]).lower()
            if n not in self.ALERT:
                continue
            if watch and not any(point_in_polygon(((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), z.polygon) for z in watch):
                continue
            hits.append((tuple(b), float(c), n))
        if not hits:
            return []
        top = max(hits, key=lambda h: h[1])
        return [
            Candidate(
                "spill",
                f"visible_{top[2]}",
                top[1],
                [h[0] for h in hits],
                f"Visible {top[2]} detected (cannot identify the substance; verify on site)",
                {"label": top[2], "count": len(hits), "zone_gated": bool(watch)},
                self.model_name,
                self.version,
                confirm_n=4,
                confirm_m=6,
            )
        ]


class StoragePlugin(Plugin):
    """Model 6. Box detection + ByteTrack + falling/displaced-object rules.

    No box/pallet weights exist in reyansh7/InventoryVerification, so boxes come from the MIT-licensed SDG
    `The_Box` detector (trained mostly on synthetic data): recall on real shelves is unmeasured. A detected box
    never proves a stack is unstable; only motion over time does. Displacement is only judged inside `storage`
    zones when any are configured.
    """

    name = "storage_instability"
    interval_s = 0.1
    version = "sdg-the_box + rules-1"

    def __init__(self, conf: float = 0.3, weights: str = f"{TP}/sdg_v2_HN_yolo1/best.pt") -> None:
        super().__init__()
        self.model = _load_yolo(weights)
        self.conf = conf
        self.tracker = _tracker()
        self.det = FallingObjectDetector()
        self.model_name = "SDG The_Box YOLO11n + ByteTrack + motion rules"
        print(f"[storage_instability] {Path(weights).name} model.names = {self.model.names}")

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        with _model_lock:
            r = self.model.predict(ctx.frame, conf=self.conf, verbose=False)[0]
        tr = _track(self.tracker, [tuple(b) for b in r.boxes.xyxy.tolist()], r.boxes.conf.tolist(), [0] * len(r.boxes))
        zones = [z for z in ctx.zones if z.type == "storage"]
        gate = (lambda p: any(point_in_polygon(p, z.polygon) for z in zones)) if zones else None
        evs = self.det.update(ctx.t, {t[0]: t[1] for t in tr}, gate)
        conf = {t[0]: t[2] for t in tr}
        return [
            Candidate(
                "storage_instability",
                e.kind,
                conf.get(e.track_id, 0.5),
                [e.box],
                f"{e.kind.replace('_', ' ').capitalize()} ({e.measure} box heights): verify the stack",
                {"track": e.track_id, "box_heights": e.measure},
                self.model_name,
                self.version,
                already_confirmed=True,
            )
            for e in evs
        ]


FACTORIES = {
    "forklift_person": lambda: ForkliftPedestrianPlugin(),
    "machinery_proximity": lambda: MachineryProximityPlugin(),
    "package_damage": lambda: PackagePlugin(),
    "waste": lambda: WastePlugin(),
    "spill": lambda: LeakPlugin(),
    "storage_instability": lambda: StoragePlugin(),
}
