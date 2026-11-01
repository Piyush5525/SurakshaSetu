"""Detector plugins. Each takes a frame context and returns zero or more raw candidates.

A candidate is NOT an incident: the runner confirms it over several frames (N of M), de-duplicates it, attaches
pixelated evidence and only then posts it to the backend. To add a model: write a Plugin subclass, register it
in PLUGIN_FACTORIES, and add it to backend/app/detectors_catalog.py.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from .geometry import Box, inside_fraction, point_in_polygon
from .rules import Detection, ForkliftGapRule, HandInZoneRule, Zone

ROOT = Path(__file__).resolve().parent.parent
LEFT_WRIST, RIGHT_WRIST = 9, 10
_model_lock = threading.Lock()  # YOLO models are shared by every camera thread


@dataclass
class Candidate:
    detector: str
    cls: str
    confidence: float
    boxes: list[Box] = field(default_factory=list)
    description: str = ""
    meta: dict[str, Any] = field(default_factory=dict)
    model: str = ""
    version: str = ""
    # N-of-M confirmation (overridable from the dashboard)
    confirm_n: int = 3
    confirm_m: int = 5
    already_confirmed: bool = False  # rules with their own debouncer need no extra confirmation


@dataclass
class FrameCtx:
    frame: np.ndarray
    t: float
    ts: datetime
    persons: list[Detection]  # all people at low confidence (privacy-grade)
    vehicles: list[Detection]
    zones: list[Zone]
    machine_running: bool
    camera_id: str


class Plugin:
    name = ""
    interval_s = 0.0  # minimum seconds between runs (cost control)
    model_name = ""
    version = "1"

    def __init__(self) -> None:
        self._last = -1e9

    def due(self, t: float) -> bool:
        if t - self._last >= self.interval_s:
            self._last = t
            return True
        return False

    def process(self, ctx: FrameCtx) -> list[Candidate]:  # pragma: no cover - interface
        raise NotImplementedError


_MODEL_CACHE: dict[tuple[str, bool], Any] = {}


def _load_yolo(path: str | Path, world: bool = False, fresh: bool = False):
    """Models are loaded once per process and shared by every camera thread (callers hold _model_lock)."""
    from ultralytics import YOLO

    p = Path(path)
    if not p.is_absolute() and (ROOT / p).exists():
        p = ROOT / p
    key = (str(p), world)
    if not fresh and key in _MODEL_CACHE:
        return _MODEL_CACHE[key]
    if world:
        from ultralytics import YOLOWorld

        m = YOLOWorld(str(p))
    else:
        m = YOLO(str(p))
    if not fresh:
        _MODEL_CACHE[key] = m
    return m


# ---------------------------------------------------------------------------------------------------------------
class FirePlugin(Plugin):
    """The team's trained fire/smoke model (classes verified at load: {0: Fire, 1: Smoke})."""

    name = "fire"
    interval_s = 0.34
    version = "best_nano_111"

    def __init__(self, weights: str = "models/fire_smoke.pt", fire_conf: float = 0.5, smoke_conf: float = 0.75) -> None:
        super().__init__()
        self.model = _load_yolo(weights)
        self.model_name = Path(weights).name
        names = {int(k): str(v).lower() for k, v in self.model.names.items()}
        if set(names.values()) != {"fire", "smoke"}:
            raise RuntimeError(f"unexpected fire model classes {names}; refusing to guess")
        self.names = names
        self.fire_conf, self.smoke_conf = fire_conf, smoke_conf
        print(f"[fire] {self.model_name} model.names = {self.model.names}")

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        with _model_lock:
            res = self.model.predict(ctx.frame, conf=min(self.fire_conf, self.smoke_conf), iou=0.2, verbose=False)[0]
        best: dict[str, tuple[float, Box]] = {}
        for b, c, k in zip(res.boxes.xyxy.tolist(), res.boxes.conf.tolist(), res.boxes.cls.tolist(), strict=False):
            n = self.names[int(k)]
            need = self.fire_conf if n == "fire" else self.smoke_conf
            if c >= need and c > best.get(n, (0.0, (0, 0, 0, 0)))[0]:
                best[n] = (float(c), tuple(b))  # type: ignore[assignment]
        return [
            Candidate(
                "fire", n.capitalize(), c, [bx], f"{n.capitalize()} detected by the fire/smoke model",
                {"class": n}, self.model_name, self.version, confirm_n=3, confirm_m=5,
            )
            for n, (c, bx) in best.items()
        ]


# ---------------------------------------------------------------------------------------------------------------
class ActionPlugin(Plugin):
    """Fall (pose rules) and violence (pose gates + CLIP) from the team's earlier repo. EXPERIMENTAL."""

    interval_s = 0.0  # the engine paces itself

    def __init__(self, which: str) -> None:
        super().__init__()
        from .actions.engine import ActionEngine

        self.name = which
        self.which = which
        self.engine = ActionEngine(f"worker-{which}", [which])
        if not self.engine.enabled:
            raise RuntimeError(f"{which}: pose model or detector unavailable")
        d = self.engine.detectors[0]
        self.d = d
        self.model_name = {"fall": "yolov8n-pose + fall rules", "violence": "yolov8n-pose gate + CLIP ViT-B/32"}.get(which, which)
        self.version = "ported-from-Detection-Models"

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        out = self.engine.process(ctx.frame, ctx.t, ctx.ts)
        cands: list[Candidate] = []
        for det, res in out:
            if res.detected:
                label = {"fall": "fall", "violence": "possible_altercation"}.get(self.which, self.which)
                cands.append(
                    Candidate(
                        self.which, label, float(res.score),
                        [tuple(b["box"]) for b in res.boxes],  # type: ignore[misc]
                        f"Possible {label.replace('_', ' ')} (experimental detector, verify before acting)",
                        {"signals": res.signals, "threshold": det.threshold}, self.model_name, self.version,
                        confirm_n=det.confirm_n, confirm_m=det.confirm_m,
                    )
                )
        return cands


# ---------------------------------------------------------------------------------------------------------------
class ForkliftPlugin(Plugin):
    """Forklift-person edge gap (rule on COCO truck/bus stand-in unless a forklift class is available)."""

    name = "forklift_person"
    model_name = "yolov8n (COCO) + edge-gap rule"
    version = "rules-1"

    def __init__(self, gap_px: float = 80.0, sustain_s: float = 0.6) -> None:
        super().__init__()
        self.rule: ForkliftGapRule | None = None
        self.gap_px, self.sustain_s = gap_px, sustain_s

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        if self.rule is None:
            lanes = [z for z in ctx.zones if z.type == "forklift_lane"]
            self.rule = ForkliftGapRule(gap_px=self.gap_px, sustain_s=self.sustain_s, lanes=lanes)
        strong = [p for p in ctx.persons if p.conf >= 0.5]
        ev = self.rule.update(ctx.vehicles, strong, ctx.t)
        if not ev:
            return []
        return [
            Candidate(
                "forklift_person", "forklift_person_gap", ev.confidence, list(ev.boxes),
                f"Person within {ev.measure:g}px of a vehicle (edge gap)", {"gap_px": ev.measure},
                self.model_name, self.version, already_confirmed=True,
            )
        ]


class HandInZonePlugin(Plugin):
    name = "hand_in_zone"
    model_name = "yolov8n-pose wrist + zone polygon"
    version = "rules-1"
    interval_s = 0.1

    def __init__(self, pose_weights: str = "models/yolov8n-pose.pt") -> None:
        super().__init__()
        self.pose = _load_yolo(pose_weights)
        self.rule: HandInZoneRule | None = None

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        zones = [z for z in ctx.zones if z.type == "machine_danger"]
        if not zones:
            return []
        if self.rule is None:
            self.rule = HandInZoneRule(zones)
        wrists: list[tuple[tuple[float, float], float]] = []
        if ctx.machine_running:
            with _model_lock:
                pr = self.pose.predict(ctx.frame, conf=0.25, verbose=False)[0]
            if pr.keypoints is not None and pr.keypoints.xy is not None and len(pr.keypoints.xy):
                kxy = pr.keypoints.xy.tolist()
                kcf = pr.keypoints.conf.tolist() if pr.keypoints.conf is not None else None
                for i, pts in enumerate(kxy):
                    for j in (LEFT_WRIST, RIGHT_WRIST):
                        wrists.append(((pts[j][0], pts[j][1]), float(kcf[i][j]) if kcf else 1.0))
        evs = self.rule.update(wrists, ctx.machine_running, ctx.t)
        return [
            Candidate(
                "hand_in_zone", "hand_in_danger_zone", e.confidence, [],
                f"Hand inside machine danger zone {e.zone_id} while the machine is flagged running (running signal may be simulated)",
                {"zone": e.zone_id, "sustained_s": e.measure}, self.model_name, self.version, already_confirmed=True,
            )
            for e in evs
        ]


# ---------------------------------------------------------------------------------------------------------------
class OpenVocabPlugin(Plugin):
    """Zero-shot YOLO-World detectors (PPE, spill, blocked aisle, waste). No training, no measured accuracy."""

    interval_s = 1.0
    version = "yolov8s-worldv2"
    SPECS: dict[str, dict[str, Any]] = {
        "ppe": {"prompts": ["person", "hard hat", "safety vest"], "conf": 0.3, "cls": "no_hard_hat"},
        "spill": {"prompts": ["liquid spill on floor", "puddle of liquid"], "conf": 0.35, "cls": "liquid_spill"},
        "blocked_aisle": {"prompts": ["fallen cardboard box", "pallet", "box on the floor"], "conf": 0.35, "cls": "blocking_item", "zone": "forklift_lane"},
        "waste": {"prompts": ["garbage bag", "pile of trash"], "conf": 0.35, "cls": "waste_out_of_bin", "zone": "no_waste"},
    }

    def __init__(self, which: str, weights: str = "yolov8s-worldv2.pt") -> None:
        super().__init__()
        self.name = which
        self.spec = self.SPECS[which]
        self.model = _load_yolo(weights, world=True, fresh=True)  # set_classes() mutates the model: one per spec
        self.model.set_classes(self.spec["prompts"])
        self.model_name = f"YOLO-World zero-shot {self.spec['prompts']}"

    def process(self, ctx: FrameCtx) -> list[Candidate]:
        with _model_lock:
            res = self.model.predict(ctx.frame, conf=self.spec["conf"], verbose=False)[0]
        dets = [
            (tuple(b), float(c), self.spec["prompts"][int(k)])
            for b, c, k in zip(res.boxes.xyxy.tolist(), res.boxes.conf.tolist(), res.boxes.cls.tolist(), strict=False)
        ]
        if self.name == "ppe":
            zs = [z for z in ctx.zones if z.type == "ppe_required"]
            if not zs:
                return []  # PPE is only judged inside a configured ppe_required zone: never anywhere in the frame
            heads = [d for d in dets if d[2] in ("hard hat",)]
            persons = [
                d
                for d in dets
                if d[2] == "person"
                and d[1] >= 0.5
                and any(point_in_polygon(((d[0][0] + d[0][2]) / 2, d[0][3]), z.polygon) for z in zs)
            ]
            bad = []
            for pbox, pc, _ in persons:
                top = (pbox[0], pbox[1], pbox[2], pbox[1] + (pbox[3] - pbox[1]) * 0.3)  # head region
                if not any(inside_fraction(h[0], top) > 0.3 or inside_fraction(top, h[0]) > 0.3 for h in heads):
                    bad.append((pbox, pc))
            if not bad:
                return []
            return [
                Candidate("ppe", "no_hard_hat", max(c for _, c in bad), [b for b, _ in bad],
                          f"{len(bad)} person(s) without a detected hard hat (zero-shot, verify)", {"people": len(bad)},
                          self.model_name, self.version, confirm_n=4, confirm_m=6)
            ]
        zone_type = self.spec.get("zone")
        zs = [z for z in ctx.zones if zone_type and z.type == zone_type]
        if zone_type and not zs:
            return []  # needs a configured zone: never alert anywhere in the frame
        hits = []
        for box, c, label in dets:
            if zs:
                cx, cy = (box[0] + box[2]) / 2, box[3]
                if not any(point_in_polygon((cx, cy), z.polygon) for z in zs):
                    continue
            hits.append((box, c, label))
        if not hits:
            return []
        top = max(hits, key=lambda h: h[1])
        return [
            Candidate(self.name, self.spec["cls"], top[1], [h[0] for h in hits], f"{top[2]} detected (zero-shot, verify)",
                      {"label": top[2], "count": len(hits)}, self.model_name, self.version, confirm_n=3, confirm_m=5)
        ]


PLUGIN_FACTORIES = {
    "fire": lambda: FirePlugin(),
    "fall": lambda: ActionPlugin("fall"),
    "violence": lambda: ActionPlugin("violence"),
    "forklift_person": lambda: ForkliftPlugin(),
    "hand_in_zone": lambda: HandInZonePlugin(),
    "ppe": lambda: OpenVocabPlugin("ppe"),
    "spill": lambda: OpenVocabPlugin("spill"),
    "blocked_aisle": lambda: OpenVocabPlugin("blocked_aisle"),
    "waste": lambda: OpenVocabPlugin("waste"),
}
