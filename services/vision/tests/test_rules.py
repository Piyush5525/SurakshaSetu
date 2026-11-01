import numpy as np
import pytest

from vision_service.geometry import box_gap, inside_fraction, point_in_polygon
from vision_service.machine import MachineState
from vision_service.privacy import pixelated_jpeg
from vision_service.rules import (
    Detection,
    EpisodeDebouncer,
    ForkliftGapRule,
    HandInZoneRule,
    IdleMachineRule,
    PersonInForkliftLaneRule,
    Zone,
)
from vision_service.zones import load_zones


# ---- geometry -------------------------------------------------------------------------------
def test_box_gap_is_edge_distance_not_centre_distance():
    big = (0, 0, 400, 400)  # forklift
    person = (430, 100, 470, 300)
    assert box_gap(big, person) == 30  # edges, not the ~255px between centres
    assert box_gap(big, (100, 100, 200, 200)) == 0  # overlap
    assert box_gap((0, 0, 10, 10), (13, 14, 20, 20)) == 5  # diagonal 3-4-5


def test_inside_fraction_and_polygon():
    assert inside_fraction((10, 10, 20, 20), (0, 0, 100, 100)) == 1
    assert inside_fraction((90, 90, 110, 110), (0, 0, 100, 100)) == 0.25
    sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert point_in_polygon((5, 5), sq)
    assert not point_in_polygon((15, 5), sq)


# ---- debouncer ------------------------------------------------------------------------------
def test_debouncer_fires_once_per_episode():
    d = EpisodeDebouncer(sustain_s=1.0, cooldown_s=2.0)
    fired = [d.update(True, t / 10) for t in range(0, 50)]  # 5 seconds continuous
    assert sum(fired) == 1
    assert fired.index(True) == 10  # at t = 1.0 s


def test_debouncer_needs_sustained_activity_and_tolerates_dropouts():
    d = EpisodeDebouncer(sustain_s=1.0, cooldown_s=2.0, grace_s=0.3)
    assert not any(d.update(True, t / 10) for t in range(0, 8))  # only 0.7 s
    assert not d.update(False, 0.9)
    assert not d.update(False, 1.5)  # gap > grace: clock restarts
    assert not any(d.update(True, 2.0 + t / 10) for t in range(0, 8))
    d2 = EpisodeDebouncer(sustain_s=1.0, cooldown_s=2.0, grace_s=0.3)
    ev = [d2.update(a, t / 10) for t, a in enumerate([True] * 5 + [False] + [True] * 8)]  # one-frame dropout
    assert sum(ev) == 1


def test_debouncer_rearms_after_cooldown():
    d = EpisodeDebouncer(sustain_s=0.5, cooldown_s=1.0)
    assert sum(d.update(True, t / 10) for t in range(0, 20)) == 1
    d.update(False, 3.5)  # > cooldown (1 s) since last active
    assert sum(d.update(True, 3 + t / 10) for t in range(0, 20)) == 1


# ---- rule 1: forklift-person ----------------------------------------------------------------
def fk(box=(0, 0, 400, 400), conf=0.9):
    return Detection(box, conf, "truck")


def person(box, conf=0.9):
    return Detection(box, conf, "person")


def run_gap(rule, vehicles, persons, seconds=3.0, fps=10):
    events = []
    for i in range(int(seconds * fps)):
        e = rule.update(vehicles, persons, i / fps)
        if e:
            events.append(e)
    return events


def test_forklift_near_miss_fires_once_with_gap():
    rule = ForkliftGapRule(gap_px=50, sustain_s=0.5)
    ev = run_gap(rule, [fk()], [person((430, 100, 470, 300))])
    assert len(ev) == 1 and ev[0].rule == "forklift_person_gap" and ev[0].measure == 30


def test_forklift_far_person_does_not_fire():
    assert run_gap(ForkliftGapRule(gap_px=50), [fk()], [person((600, 100, 640, 300))]) == []


def test_forklift_driver_is_excluded():
    driver = person((100, 100, 200, 300))  # fully inside the vehicle box
    assert run_gap(ForkliftGapRule(gap_px=50), [fk()], [driver]) == []


def test_pedestrian_standing_in_front_of_forklift_is_not_mistaken_for_the_driver():
    # Overlaps the vehicle box in 2D, but feet reach the floor line (bottom beyond the vehicle's bottom).
    walker = person((150, 150, 250, 420))
    ev = run_gap(ForkliftGapRule(gap_px=50), [fk()], [walker])
    assert len(ev) == 1 and ev[0].measure == 0


def test_forklift_low_confidence_never_fires():
    assert (
        run_gap(ForkliftGapRule(gap_px=50, min_conf=0.5), [fk()], [person((430, 100, 470, 300), 0.3)]) == []
    )
    assert (
        run_gap(ForkliftGapRule(gap_px=50, min_conf=0.5), [fk(conf=0.3)], [person((430, 100, 470, 300))])
        == []
    )


def test_forklift_brief_pass_is_ignored():
    rule = ForkliftGapRule(gap_px=50, sustain_s=1.0)
    near, far = [person((430, 100, 470, 300))], [person((900, 100, 940, 300))]
    events = []
    for i in range(30):
        e = rule.update([fk()], near if 5 <= i < 8 else far, i / 10)  # near for 0.3 s only
        if e:
            events.append(e)
    assert events == []


def test_forklift_lane_restriction():
    lane = Zone("lane-1", "forklift_lane", [(0, 0), (1000, 0), (1000, 500), (0, 500)], "forklift-lane")
    inside = ForkliftGapRule(gap_px=50, sustain_s=0.3, lanes=[lane])
    ev = run_gap(inside, [fk()], [person((430, 100, 470, 300))])
    assert ev and ev[0].zone_id == "lane-1" and ev[0].location_id == "forklift-lane"
    outside = ForkliftGapRule(
        gap_px=50, sustain_s=0.3, lanes=[Zone("l", "forklift_lane", [(2000, 0), (2100, 0), (2100, 100)])]
    )
    assert run_gap(outside, [fk()], [person((430, 100, 470, 300))]) == []


# ---- rule 2: hand in danger zone ------------------------------------------------------------
DANGER = Zone("filler-danger-1", "machine_danger", [(0, 0), (100, 0), (100, 100), (0, 100)], "filler")


def run_hand(rule, wrists, running, seconds=4.0, fps=10):
    out = []
    for i in range(int(seconds * fps)):
        out += rule.update(wrists, running, i / fps)
    return out


def test_hand_in_zone_fires_only_while_running_and_sustained():
    ev = run_hand(HandInZoneRule([DANGER], sustain_s=1.0), [((50, 50), 0.9)], True)
    assert len(ev) == 1 and ev[0].zone_id == "filler-danger-1" and ev[0].location_id == "filler"
    assert (
        run_hand(HandInZoneRule([DANGER], sustain_s=1.0), [((50, 50), 0.9)], False) == []
    )  # machine stopped
    assert run_hand(HandInZoneRule([DANGER], sustain_s=1.0), [((500, 50), 0.9)], True) == []  # outside
    assert run_hand(HandInZoneRule([DANGER], sustain_s=1.0), [((50, 50), 0.2)], True) == []  # low conf
    assert (
        run_hand(HandInZoneRule([DANGER], sustain_s=5.0), [((50, 50), 0.9)], True, seconds=3) == []
    )  # too short


def test_hand_rule_ignores_non_danger_zones():
    lane = Zone("l", "forklift_lane", [(0, 0), (100, 0), (100, 100)])
    assert HandInZoneRule([lane]).zones == []


# ---- machine signal, zones file, privacy ----------------------------------------------------
def test_machine_modes_are_flagged_simulated():
    assert MachineState("on").running(0) and not MachineState("off").running(0)
    m = MachineState("schedule:on:0-10,off:10-20")
    assert m.running(5) and not m.running(15) and m.running(25) and m.simulated


def test_zones_yaml_validation(tmp_path):
    f = tmp_path / "z.yaml"
    f.write_text("zones:\n  - {id: a, type: machine_danger, polygon: [[0,0],[1,0],[1,1]]}\n")
    assert load_zones(f)[0].id == "a"
    f.write_text("zones:\n  - {id: a, type: nope, polygon: [[0,0],[1,0],[1,1]]}\n")
    with pytest.raises(ValueError):
        load_zones(f)
    f.write_text("zones:\n  - {id: a, type: machine_danger, polygon: [[0,0],[1,0]]}\n")
    with pytest.raises(ValueError):
        load_zones(f)


def test_snapshot_pixelates_people_and_downsizes():
    import cv2

    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    rng = np.random.default_rng(0)
    frame[100:400, 200:400] = rng.integers(0, 255, (300, 200, 3), dtype=np.uint8)  # noisy "person"
    jpeg = pixelated_jpeg(frame, [(200, 100, 400, 400)])
    img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[1] == 640  # downscaled
    region = cv2.cvtColor(img[60:190, 110:190], cv2.COLOR_BGR2GRAY)
    raw = cv2.cvtColor(cv2.resize(frame, (640, 360))[60:190, 110:190], cv2.COLOR_BGR2GRAY)
    # Pixelation leaves flat blocks, so fine detail (Laplacian variance) collapses.
    assert cv2.Laplacian(region, cv2.CV_64F).var() < 0.25 * cv2.Laplacian(raw, cv2.CV_64F).var()


# ---- Phase 2 rules --------------------------------------------------------------------------
LANE = Zone(
    "lane-1", "forklift_lane", [(0, 0), (500, 0), (500, 500), (0, 500)], "forklift-lane", forklift_only=True
)


def test_person_in_forklift_only_lane_fires_after_sustain():
    rule = PersonInForkliftLaneRule([LANE], sustain_s=1.0)
    inside = [person((100, 100, 150, 300))]  # feet at (125, 300)
    ev = [e for i in range(30) for e in rule.update(inside, i / 10)]
    assert len(ev) == 1 and ev[0].rule == "person_in_forklift_lane"
    rule2 = PersonInForkliftLaneRule([LANE], sustain_s=1.0)
    assert [e for i in range(30) for e in rule2.update([person((700, 100, 750, 300))], i / 10)] == []
    plain = Zone("lane-2", "forklift_lane", LANE.polygon)  # not forklift_only: pedestrians allowed
    assert PersonInForkliftLaneRule([plain]).zones == []


def test_idle_machine_needs_running_and_nobody_present_for_minutes():
    rule = IdleMachineRule([DANGER], idle_minutes=0.5)  # 30 s
    fired = [e for i in range(0, 400) for e in rule.update([], True, i / 10)]  # 40 s empty and running
    assert len(fired) == 1 and fired[0].rule == "idle_machine" and fired[0].measure == 0.5
    assert [
        e for i in range(400) for e in IdleMachineRule([DANGER], 0.5).update([], False, i / 10)
    ] == []  # not running
    worker = [person((20, 20, 60, 90))]  # standing in the zone
    assert [e for i in range(400) for e in IdleMachineRule([DANGER], 0.5).update(worker, True, i / 10)] == []
