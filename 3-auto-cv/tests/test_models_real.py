"""Per-model tests with the REAL weights on real sample images. Skipped when weights/samples are not present.

These prove each model loads, reports the expected classes, runs, and (where a matching sample exists) produces
valid detections. They do NOT measure accuracy: no labelled evaluation set is available for most of them.
"""

from datetime import datetime
from pathlib import Path

import cv2
import pytest

from vision_service import plugins_extra as X
from vision_service.plugins import FrameCtx
from vision_service.rules import Detection, Zone
from vision_service.zones import CameraConfig

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT.parent / "demo-assets" / "samples"


def _img(name: str):
    p = SAMPLES / name
    if not p.exists():
        pytest.skip(f"sample {name} not available")
    return cv2.imread(str(p))


def _ctx(frame, t=0.0, zones=None, cfg=None, persons=None, running=True):
    return FrameCtx(frame, t, datetime.now(), persons or [], [], zones or [], running, "test", cfg)


needs = lambda rel: pytest.mark.skipif(not X.have(rel), reason=f"{rel} not downloaded")  # noqa: E731


@needs(f"{X.TP}/forklift/best.pt")
def test_forklift_model_classes_and_detects_forklift_and_person():
    pl = X.ForkliftPedestrianPlugin()
    assert set(pl.names.values()) == {"forklift", "person"}
    r = pl.model.predict(_img("fp_frame_0000.jpg"), conf=0.35, verbose=False)[0]
    got = {pl.names[int(k)] for k in r.boxes.cls.tolist()}
    assert {"forklift", "person"} <= got
    assert all(0.35 <= c <= 1 for c in r.boxes.conf.tolist())


@needs(f"{X.TP}/forklift/best.pt")
def test_forklift_pedestrian_candidate_has_level_and_labelled_distance_basis():
    pl = X.ForkliftPedestrianPlugin()
    frame = _img("fp_frame_0000.jpg")
    out = []
    for i in range(4):  # same frame repeated: tracker needs history, pair is static
        out = pl.process(_ctx(frame, t=i * 0.2, cfg=CameraConfig()))
    for c in out:
        assert c.detector == "forklift_person" and c.cls.startswith("forklift_pedestrian_")
        assert c.meta["level"] in ("CAUTION", "CRITICAL")
        assert c.meta["distance_basis"].startswith("estimated")  # no calibration given: never pretend metres are exact


@needs(f"{X.TP}/package/best.pt")
def test_package_defects_found_on_sample_boxes():
    pl = X.PackagePlugin()
    found = set()
    for n in ("pkg_01.png", "pkg_02.png", "pkg_03.png"):
        for c in pl.process(_ctx(_img(n))):
            found.add(c.cls)
            assert 0 < c.confidence <= 1 and c.boxes
    assert found & {"package_hole", "package_dent", "package_dirt", "package_stain", "package_puncture"}


@needs(f"{X.TP}/leak/best.pt")
def test_leak_model_classes_and_no_leak_never_alerts():
    pl = X.LeakPlugin()
    assert {"gas", "leak", "water", "no leak", "crack"} == {str(v).lower() for v in pl.model.names.values()}
    # a warehouse frame with no leak must not produce a leak candidate
    assert pl.process(_ctx(_img("fp_frame_0030.jpg"))) == []


@needs(f"{X.TP}/waste/best.pt")
def test_waste_needs_zones_and_loads_19_classes():
    pl = X.WastePlugin()
    assert len(pl.model.names) == 19
    frame = _img("fp_frame_0000.jpg")
    assert pl.process(_ctx(frame)) == []  # no bin zones configured: classification alone raises nothing
    z = Zone("bin1", "waste_bin", [(0, 0), (frame.shape[1], 0), (frame.shape[1], frame.shape[0]), (0, frame.shape[0])], allowed=["plastic"])
    assert isinstance(pl.process(_ctx(frame, zones=[z])), list)  # runs; a warehouse frame holds no waste items


@needs(f"{X.TP}/sdg_v2_HN_yolo1/best.pt")
def test_storage_plugin_runs_and_a_static_scene_raises_nothing():
    pl = X.StoragePlugin()
    frame = _img("fp_frame_0000.jpg")
    for i in range(10):
        assert pl.process(_ctx(frame, t=i * 0.2)) == []  # nothing moves: no falling or displaced object


def test_machinery_proximity_needs_running_machine_and_sustained_presence():
    pl = X.MachineryProximityPlugin(sustain_s=1.0)
    z = Zone("m1", "machine_danger", [(0, 0), (200, 0), (200, 200), (0, 200)])
    person = Detection((60, 20, 120, 150), 0.9, "person")  # feet at (90, 150): inside
    dummy = _img("fp_frame_0000.jpg") if (SAMPLES / "fp_frame_0000.jpg").exists() else None
    if dummy is None:
        pytest.skip("no frame")
    fired = []
    for i in range(12):  # machine OFF: standing there is allowed
        fired += pl.process(_ctx(dummy, t=i * 0.2, zones=[z], persons=[person], running=False))
    assert fired == []
    pl2 = X.MachineryProximityPlugin(sustain_s=1.0)
    for i in range(12):
        fired += pl2.process(_ctx(dummy, t=i * 0.2, zones=[z], persons=[person], running=True))
    assert len(fired) == 1 and fired[0].cls == "person_in_machine_danger_zone" and fired[0].already_confirmed
