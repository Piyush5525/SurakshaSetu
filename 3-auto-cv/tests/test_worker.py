"""Worker logic that needs no model: N-of-M confirmation, privacy pixelation, zone gating."""

import numpy as np

from vision_service.geometry import point_in_polygon
from vision_service.privacy import pixelate
from vision_service.worker import Confirmer
from vision_service.zones import VALID_TYPES


def test_confirmer_needs_n_of_m():
    c = Confirmer()
    assert not c.update(True, 3, 5)
    assert not c.update(True, 3, 5)
    assert c.update(True, 3, 5)


def test_single_frame_never_confirms_and_misses_decay():
    c = Confirmer()
    assert not c.update(True, 3, 5)
    for _ in range(5):
        c.update(False, 3, 5)
    assert not c.update(True, 3, 5)  # earlier hit has aged out of the last 5


def test_pixelation_destroys_detail_inside_the_box_only():
    rng = np.random.default_rng(1)
    img = rng.integers(0, 255, (200, 200, 3), dtype=np.uint8)
    out = pixelate(img, [(50, 50, 120, 150)])
    inside = out[70:130, 70:100].astype(float)
    outside = out[0:30, 0:30].astype(float)
    # Pixelation makes neighbouring pixels equal inside the box; the outside stays noisy.
    assert np.abs(np.diff(inside, axis=1)).mean() < np.abs(np.diff(outside, axis=1)).mean() / 2
    assert (out[0:30, 0:30] == img[0:30, 0:30]).all()
    assert (img != out).any() and img.shape == out.shape  # original untouched (copy)


def test_zone_types_include_waste_and_ppe():
    assert {"no_waste", "ppe_required", "forklift_lane", "machine_danger"} <= VALID_TYPES


def test_point_in_polygon_for_zone_gating():
    poly = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert point_in_polygon((5, 5), poly) and not point_in_polygon((15, 5), poly)
