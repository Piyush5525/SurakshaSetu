"""Pure rule logic for the extended detectors. No models in here: everything is testable with synthetic numbers.

  * forklift-pedestrian proximity levels (SAFE / CAUTION / CRITICAL) from distance and closing speed
  * falling / displaced object tracking from box tracks
  * waste group lookup and bin-zone mismatch

Image-space distance is NOT real distance. `to_metres` uses an explicit calibration (px per metre) when the
camera has one, otherwise a clearly labelled estimate that assumes a forklift is about 2 m tall.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field

from .geometry import inside_fraction

SAFE, CAUTION, CRITICAL = "SAFE", "CAUTION", "CRITICAL"
ASSUMED_FORKLIFT_HEIGHT_M = 2.0


def to_metres(gap_px: float, forklift_h_px: float, px_per_m: float | None = None) -> tuple[float, str]:
    """(metres, basis). basis is 'calibrated' or 'estimated (forklift ~2 m tall)'."""
    if px_per_m and px_per_m > 0:
        return gap_px / px_per_m, "calibrated"
    if forklift_h_px <= 0:
        return float("inf"), "estimated (forklift ~2 m tall)"
    return gap_px / forklift_h_px * ASSUMED_FORKLIFT_HEIGHT_M, "estimated (forklift ~2 m tall)"


def classify_proximity(
    gap_m: float,
    closing_mps: float,
    caution_m: float = 3.0,
    critical_m: float = 1.5,
    closing_caution_mps: float = 1.0,
) -> str:
    """Warning level for one forklift-pedestrian pair. closing_mps > 0 means the distance is shrinking.

    CRITICAL: within critical_m and converging, or within caution_m and converging fast (2x the caution speed).
    CAUTION : within caution_m, or converging at caution speed while still within twice that distance.
    A pedestrian standing still at 2 m therefore reads CAUTION, not CRITICAL.
    """
    if gap_m <= critical_m and closing_mps > 0.2:
        return CRITICAL
    if gap_m <= caution_m and closing_mps >= 2 * closing_caution_mps:
        return CRITICAL
    if gap_m <= caution_m or (closing_mps >= closing_caution_mps and gap_m <= 2 * caution_m):
        return CAUTION
    return SAFE


class ClosingSpeed:
    """Smoothed rate at which a pair's distance shrinks (units/s of whatever the gap is measured in)."""

    def __init__(self, window_s: float = 0.8) -> None:
        self.window_s = window_s
        self.h: dict[tuple[int, int], deque[tuple[float, float]]] = defaultdict(deque)

    def update(self, pair: tuple[int, int], t: float, gap: float) -> float:
        q = self.h[pair]
        q.append((t, gap))
        while q and t - q[0][0] > self.window_s:
            q.popleft()
        if len(q) < 2 or q[-1][0] - q[0][0] < 0.2:
            return 0.0
        return (q[0][1] - q[-1][1]) / (q[-1][0] - q[0][0])

    def forget_missing(self, alive: set[tuple[int, int]]) -> None:
        for k in [k for k in self.h if k not in alive]:
            del self.h[k]


# ---------------------------------------------------------------------------------------------------------------
@dataclass
class _Track:
    anchor: tuple[float, float]  # where the object last stood still
    anchor_t: float  # when it was anchored
    moving_since: float | None = None
    hist: deque = field(default_factory=lambda: deque(maxlen=40))  # (t, cx, cy, h)
    flagged: bool = False


@dataclass
class ObjectEvent:
    kind: str  # falling_object | displaced_object
    track_id: int
    measure: float  # box heights fallen / moved
    box: tuple[float, float, float, float]


class FallingObjectDetector:
    """Works on tracked box centres (image y grows downward). One detection proves nothing; it needs a track.

    falling   : within `fall_window_s` the centre dropped >= `fall_heights` box heights at >= `fall_speed` heights/s
    displaced : an object that stood still for >= `settle_s` later moves >= `move_heights` box heights from where
                it stood (only judged if it was inside a storage zone when zones are supplied)
    Small drifts (detector jitter, slow settling) re-anchor the object and never alert.
    """

    def __init__(
        self,
        fall_window_s: float = 0.8,
        fall_heights: float = 0.8,
        fall_speed: float = 1.5,
        settle_s: float = 3.0,
        move_heights: float = 0.7,
        still_heights: float = 0.15,
        reanchor_s: float = 1.5,
    ) -> None:
        self.fw, self.fh, self.fs = fall_window_s, fall_heights, fall_speed
        self.ss, self.mh, self.sh, self.ra = settle_s, move_heights, still_heights, reanchor_s
        self.tracks: dict[int, _Track] = {}

    def update(self, t: float, boxes: dict[int, tuple[float, float, float, float]], in_storage=None) -> list[ObjectEvent]:
        events: list[ObjectEvent] = []
        for tid, b in boxes.items():
            cx, cy, h = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, max(1.0, b[3] - b[1])
            tr = self.tracks.get(tid)
            if tr is None:
                tr = self.tracks[tid] = _Track(anchor=(cx, cy), anchor_t=t)
            tr.hist.append((t, cx, cy, h))
            if tr.flagged:
                continue
            old = next((s for s in tr.hist if t - s[0] <= self.fw), None)
            if old is not None and t - old[0] >= 0.25:
                drop_h = (cy - old[2]) / h
                if drop_h >= self.fh and drop_h / (t - old[0]) >= self.fs:
                    tr.flagged = True
                    events.append(ObjectEvent("falling_object", tid, round(drop_h, 2), b))
                    continue
            dist_h = ((cx - tr.anchor[0]) ** 2 + (cy - tr.anchor[1]) ** 2) ** 0.5 / h
            if t - tr.anchor_t >= self.ss and dist_h >= self.mh:
                if in_storage is None or in_storage(tr.anchor):
                    tr.flagged = True
                    events.append(ObjectEvent("displaced_object", tid, round(dist_h, 2), b))
                    continue
            if dist_h > self.sh:
                tr.moving_since = tr.moving_since if tr.moving_since is not None else t
                if dist_h < self.mh and t - tr.moving_since >= self.ra:  # small, finished move: new resting place
                    tr.anchor, tr.anchor_t, tr.moving_since = (cx, cy), t, None
            else:
                tr.moving_since = None
        for tid in [k for k, v in self.tracks.items() if k not in boxes and t - v.hist[-1][0] > 3.0]:
            del self.tracks[tid]
        return events


# ---------------------------------------------------------------------------------------------------------------
WASTE_GROUPS: dict[str, str] = {
    # grouping as published by the model authors (siyad23/waste-sorting-model README)
    **{k: "biodegradable" for k in ("paperBag", "orange", "leaf", "cigarette", "paperCup", "banana", "apple", "paper", "juiceBox", "egg")},
    **{k: "plastic" for k in ("plasticPacket", "bottle", "plasticFoodPacket", "foodContainer")},
    **{k: "metal" for k in ("bolt", "nut", "aluminumCan", "aluminumFoil")},
    "battery": "hazardous",
}


def waste_group(class_name: str) -> str | None:
    return WASTE_GROUPS.get(class_name.removesuffix("_awss"))


def bin_mismatch(item_class: str, allowed: list[str]) -> str | None:
    """Return the item's group when it does not belong in a bin that accepts `allowed`; None when fine/unknown."""
    g = waste_group(item_class)
    if g is None or not allowed:
        return None
    return None if g in allowed else g


def is_driver(person: tuple[float, float, float, float], vehicle: tuple[float, float, float, float]) -> bool:
    """Driver = mostly inside the vehicle box AND feet well above its bottom edge. A pedestrian standing in front
    of a forklift overlaps its box in 2D but their feet reach the floor line, so they are NOT excluded."""
    if inside_fraction(person, vehicle) < 0.6:
        return False
    return person[3] <= vehicle[3] - 0.2 * (vehicle[3] - vehicle[1])
