"""Pure geometry helpers (no model, no OpenCV needed), so they are easy to unit test."""

from __future__ import annotations

import math
from collections.abc import Sequence

Box = tuple[float, float, float, float]  # x1, y1, x2, y2
Point = tuple[float, float]


def box_gap(a: Box, b: Box) -> float:
    """Shortest distance between the EDGES of two boxes (0 if they touch or overlap).

    Edge distance, not centre distance: centre distance overestimates proximity when the boxes differ
    a lot in size (a forklift is much bigger than a person).
    """
    dx = max(b[0] - a[2], a[0] - b[2], 0.0)
    dy = max(b[1] - a[3], a[1] - b[3], 0.0)
    return math.hypot(dx, dy)


def inside_fraction(inner: Box, outer: Box) -> float:
    """Fraction of `inner`'s area that lies inside `outer` (used to spot a forklift driver)."""
    ix = max(0.0, min(inner[2], outer[2]) - max(inner[0], outer[0]))
    iy = max(0.0, min(inner[3], outer[3]) - max(inner[1], outer[1]))
    area = max(1e-9, (inner[2] - inner[0]) * (inner[3] - inner[1]))
    return (ix * iy) / area


def point_in_polygon(p: Point, poly: Sequence[Point]) -> bool:
    """Ray casting. Points on an edge may count either way."""
    x, y = p
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside


def foot_point(b: Box) -> Point:
    """Bottom-centre of a box: where a person or vehicle touches the floor."""
    return ((b[0] + b[2]) / 2, b[3])


def expand(b: Box, ratio: float, width: int, height: int) -> Box:
    w, h = b[2] - b[0], b[3] - b[1]
    return (
        max(0.0, b[0] - w * ratio),
        max(0.0, b[1] - h * ratio),
        min(float(width), b[2] + w * ratio),
        min(float(height), b[3] + h * ratio),
    )
