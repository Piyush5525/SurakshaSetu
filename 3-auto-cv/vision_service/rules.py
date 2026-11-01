"""The two MVP camera rules. Pure logic: detections in, at most one event per episode out.

Design goals (false alarms destroy trust, so favour precision):
  * a violation must be SUSTAINED before it fires
  * one episode = one event (not one per frame)
  * low-confidence detections never fire
  * every event still needs a human to confirm or dismiss it
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from .geometry import Box, Point, box_gap, foot_point, inside_fraction, point_in_polygon


@dataclass
class Detection:
    box: Box
    conf: float
    label: str = ""


@dataclass
class Zone:
    id: str
    type: str  # forklift_lane | machine_danger | ppe_required
    polygon: list[Point]
    location_id: str = "unknown"
    forklift_only: bool = False  # forklift_lane zones: pedestrians must not enter (Phase 2 rule)


@dataclass
class RuleEvent:
    rule: str
    zone_id: str
    location_id: str
    confidence: float
    measure: float
    boxes: list[Box] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


class EpisodeDebouncer:
    """Fires once when a condition has been active for `sustain_s`; re-arms after `cooldown_s` of inactivity.

    `grace_s` tolerates brief detection dropouts (a missed frame) without restarting the clock.
    """

    def __init__(self, sustain_s: float, cooldown_s: float = 5.0, grace_s: float = 0.5) -> None:
        self.sustain_s = sustain_s
        self.cooldown_s = cooldown_s
        self.grace_s = grace_s
        self._first: float | None = None
        self._last: float | None = None
        self._fired = False

    def update(self, active: bool, t: float) -> bool:
        """Returns True exactly once per episode, at the moment the sustain time is reached."""
        if active:
            if self._first is None:
                self._first = t
            self._last = t
            if not self._fired and t - self._first >= self.sustain_s:
                self._fired = True
                return True
            return False
        if self._last is not None:
            gap = t - self._last
            limit = self.cooldown_s if self._fired else self.grace_s
            if gap > limit:
                self._first = self._last = None
                self._fired = False
        return False

    @property
    def dwell(self) -> float:
        return 0.0 if self._first is None or self._last is None else self._last - self._first


class ForkliftGapRule:
    """Rule 1: a person within `gap_px` (edge to edge) of a forklift, sustained for `sustain_s`.

    The forklift driver (a person mostly inside the vehicle box) is excluded.
    """

    name = "forklift_person_gap"

    def __init__(
        self,
        gap_px: float = 80.0,
        sustain_s: float = 0.6,
        min_conf: float = 0.5,
        driver_overlap: float = 0.6,
        seated_margin: float = 0.2,
        cooldown_s: float = 5.0,
        lanes: Sequence[Zone] = (),
    ) -> None:
        self.gap_px = gap_px
        self.min_conf = min_conf
        self.driver_overlap = driver_overlap
        self.seated_margin = seated_margin
        self.lanes = list(lanes)
        self._deb = EpisodeDebouncer(sustain_s, cooldown_s)

    def _is_driver(self, person: Box, vehicle: Box) -> bool:
        """A driver sits INSIDE the cab: the person box is mostly inside the vehicle box AND its feet are
        well above the vehicle's bottom edge. A pedestrian standing in front of a forklift also overlaps its
        box in 2D, but their feet reach the floor line, so they are NOT excluded (that is the dangerous case)."""
        if inside_fraction(person, vehicle) < self.driver_overlap:
            return False
        vehicle_h = vehicle[3] - vehicle[1]
        return person[3] <= vehicle[3] - self.seated_margin * vehicle_h

    def _in_lane(self, b: Box) -> Zone | None:
        for z in self.lanes:
            if point_in_polygon(foot_point(b), z.polygon):
                return z
        return None

    def update(
        self, vehicles: Sequence[Detection], persons: Sequence[Detection], t: float
    ) -> RuleEvent | None:
        best: tuple[float, Detection, Detection] | None = None
        for v in vehicles:
            if v.conf < self.min_conf:
                continue
            for p in persons:
                if p.conf < self.min_conf:
                    continue
                if self._is_driver(p.box, v.box):
                    continue  # the seated driver, not a pedestrian
                if self.lanes and not (self._in_lane(p.box) or self._in_lane(v.box)):
                    continue
                gap = box_gap(v.box, p.box)
                if best is None or gap < best[0]:
                    best = (gap, v, p)
        active = best is not None and best[0] <= self.gap_px
        if not self._deb.update(active, t) or best is None:
            return None
        gap, v, p = best
        zone = self._in_lane(p.box) or self._in_lane(v.box)
        return RuleEvent(
            rule=self.name,
            zone_id=zone.id if zone else "frame",
            location_id=zone.location_id if zone else "forklift-lane",
            confidence=round(min(v.conf, p.conf), 3),
            measure=round(gap, 1),
            boxes=[v.box, p.box],
        )


class HandInZoneRule:
    """Rule 2: a wrist keypoint inside a machine_danger polygon while the machine is flagged running.

    The "running" signal is SIMULATED in the demo (a stack-light stand-in); see machine.py.
    """

    name = "hand_in_danger_zone"

    def __init__(
        self,
        zones: Sequence[Zone],
        sustain_s: float = 1.5,
        min_conf: float = 0.5,
        cooldown_s: float = 8.0,
    ) -> None:
        self.zones = [z for z in zones if z.type == "machine_danger"]
        self.min_conf = min_conf
        self._deb = {z.id: EpisodeDebouncer(sustain_s, cooldown_s) for z in self.zones}
        self.sustain_s = sustain_s

    def update(self, wrists: Sequence[tuple[Point, float]], running: bool, t: float) -> list[RuleEvent]:
        """`wrists` = [(xy, keypoint_confidence)]. Returns events fired this frame (usually none)."""
        out: list[RuleEvent] = []
        for z in self.zones:
            hits = [c for (xy, c) in wrists if c >= self.min_conf and point_in_polygon(xy, z.polygon)]
            active = running and bool(hits)
            if self._deb[z.id].update(active, t):
                out.append(
                    RuleEvent(
                        rule=self.name,
                        zone_id=z.id,
                        location_id=z.location_id,
                        confidence=round(min(hits), 3),
                        measure=round(self.sustain_s, 1),
                    )
                )
        return out


class PersonInForkliftLaneRule:
    """Phase 2: a person's feet inside a `forklift_only` lane for `sustain_s` seconds."""

    name = "person_in_forklift_lane"

    def __init__(
        self, zones: Sequence[Zone], sustain_s: float = 2.0, min_conf: float = 0.5, cooldown_s: float = 10.0
    ):
        self.zones = [z for z in zones if z.type == "forklift_lane" and z.forklift_only]
        self.min_conf = min_conf
        self._deb = {z.id: EpisodeDebouncer(sustain_s, cooldown_s) for z in self.zones}
        self.sustain_s = sustain_s

    def update(self, persons: Sequence[Detection], t: float) -> list[RuleEvent]:
        out: list[RuleEvent] = []
        for z in self.zones:
            inside = [
                p
                for p in persons
                if p.conf >= self.min_conf and point_in_polygon(foot_point(p.box), z.polygon)
            ]
            if self._deb[z.id].update(bool(inside), t):
                out.append(
                    RuleEvent(
                        rule=self.name,
                        zone_id=z.id,
                        location_id=z.location_id,
                        confidence=round(min(p.conf for p in inside), 3),
                        measure=round(self.sustain_s, 1),
                        boxes=[p.box for p in inside],
                    )
                )
        return out


class IdleMachineRule:
    """Phase 2 (energy): machine flagged running with nobody in its zone for `idle_minutes`.

    The running signal is SIMULATED. Triage tags the resulting report `idle_machine` (an eco-tag), and any
    kWh figure shown for it is an ESTIMATE from the `assumptions` collection, never a measurement.
    """

    name = "idle_machine"

    def __init__(
        self,
        zones: Sequence[Zone],
        idle_minutes: float = 5.0,
        min_conf: float = 0.4,
        cooldown_s: float = 60.0,
    ):
        self.zones = [z for z in zones if z.type == "machine_danger"]
        self.min_conf = min_conf
        self.idle_minutes = idle_minutes
        # grace_s = 3 s: ignore brief detection dropouts, but a person standing there resets the clock.
        self._deb = {z.id: EpisodeDebouncer(idle_minutes * 60, cooldown_s, grace_s=3.0) for z in self.zones}

    def update(self, persons: Sequence[Detection], running: bool, t: float) -> list[RuleEvent]:
        out: list[RuleEvent] = []
        for z in self.zones:
            present = any(
                p.conf >= self.min_conf
                and (
                    point_in_polygon(foot_point(p.box), z.polygon)
                    or point_in_polygon(((p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2), z.polygon)
                )
                for p in persons
            )
            if self._deb[z.id].update(running and not present, t):
                out.append(
                    RuleEvent(
                        rule=self.name,
                        zone_id=z.id,
                        location_id=z.location_id,
                        confidence=1.0,
                        measure=self.idle_minutes,
                    )
                )
        return out
