"""Rule logic with synthetic numbers (these test the rules, not model accuracy)."""

from vision_service.rules_ext import (
    CAUTION,
    CRITICAL,
    SAFE,
    ClosingSpeed,
    FallingObjectDetector,
    bin_mismatch,
    classify_proximity,
    to_metres,
    waste_group,
)


def test_levels_follow_distance_and_closing_speed():
    assert classify_proximity(6.0, 0.0) == SAFE
    assert classify_proximity(2.0, 0.0) == CAUTION  # standing still inside 3 m: caution only
    assert classify_proximity(1.2, 0.0) == CAUTION  # close but not converging
    assert classify_proximity(1.2, 0.8) == CRITICAL  # close and converging
    assert classify_proximity(2.5, 2.5) == CRITICAL  # fast approach inside caution range
    assert classify_proximity(5.0, 1.5) == CAUTION  # still far but closing fast
    assert classify_proximity(5.0, -1.0) == SAFE  # moving away


def test_metres_need_calibration_or_are_labelled_estimates():
    m, basis = to_metres(120, 240, px_per_m=100)
    assert m == 1.2 and basis == "calibrated"
    m, basis = to_metres(120, 240)
    assert m == 1.0 and basis.startswith("estimated")  # half a forklift-height gap ~ 1 m


def test_closing_speed_positive_when_approaching():
    c = ClosingSpeed()
    for i in range(6):
        v = c.update((1, 2), i * 0.2, 5.0 - i * 0.4)  # 2 m/s closing
    assert 1.5 < v < 2.5
    c2 = ClosingSpeed()
    for i in range(6):
        v2 = c2.update((1, 2), i * 0.2, 2.0 + i * 0.4)
    assert v2 < 0


def _box(cy, h=40.0, cx=100.0):
    return (cx - 20, cy - h / 2, cx + 20, cy + h / 2)


def test_falling_object_detected_from_a_fast_drop_only():
    d = FallingObjectDetector()
    ev = []
    cy = 100.0
    for i in range(12):
        t = i * 0.1
        cy += 0 if i < 4 else 20  # sits, then drops 20 px per 0.1 s (= 5 box-heights/s)
        ev += d.update(t, {1: _box(cy)})
    assert [e.kind for e in ev] == ["falling_object"]


def test_slow_drift_and_jitter_do_not_alert():
    d = FallingObjectDetector()
    ev = []
    for i in range(60):
        jitter = 2 if i % 2 else -2
        ev += d.update(i * 0.2, {1: _box(100 + i * 0.3 + jitter)})  # drifts 18 px over 12 s
    assert ev == []


def test_displaced_object_after_settling():
    d = FallingObjectDetector()
    ev = []
    for i in range(40):  # 4 s still
        ev += d.update(i * 0.1, {1: _box(100.0)})
    for i in range(20):  # then slides sideways by 60 px (1.5 box heights), slowly
        ev += d.update(4.0 + i * 0.1, {1: _box(100.0, cx=100.0 + i * 3.2)})
    assert [e.kind for e in ev] == ["displaced_object"]


def test_displacement_ignored_outside_storage_zone():
    d = FallingObjectDetector()
    ev = []
    for i in range(40):
        ev += d.update(i * 0.1, {1: _box(100.0)}, in_storage=lambda p: False)
    for i in range(20):
        ev += d.update(4.0 + i * 0.1, {1: _box(100.0, cx=100.0 + i * 3.2)}, in_storage=lambda p: False)
    assert ev == []


def test_waste_groups_match_authors_grouping():
    assert waste_group("battery_awss") == "hazardous"
    assert waste_group("bottle_awss") == "plastic"
    assert waste_group("banana_awss") == "biodegradable"
    assert waste_group("aluminumCan_awss") == "metal"
    assert waste_group("unknown_awss") is None


def test_bin_mismatch_needs_a_known_class_and_a_rule():
    assert bin_mismatch("bottle_awss", ["plastic"]) is None
    assert bin_mismatch("battery_awss", ["plastic", "metal"]) == "hazardous"
    assert bin_mismatch("bottle_awss", []) is None  # no rule configured: never claim a mismatch
    assert bin_mismatch("mystery", ["plastic"]) is None
