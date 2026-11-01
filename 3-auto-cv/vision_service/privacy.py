"""Privacy by design: people are pixelated BEFORE anything is saved or uploaded. Raw frames never leave memory.

Missing one person would leak them, so the blur uses a LOWER confidence threshold than the alert rules
(favour recall for privacy, precision for alerts), expands boxes, and the saved image is downscaled.
"""

from __future__ import annotations

from collections.abc import Sequence

import cv2
import numpy as np
import supervision as sv

from .geometry import Box, expand

PRIVACY_CONF = 0.15
PIXEL_SIZE = 24
MAX_WIDTH = 640


def pixelate(frame: np.ndarray, person_boxes: Sequence[Box]) -> np.ndarray:
    """Return a copy of `frame` with every person box pixelated (boxes are expanded 15%)."""
    h, w = frame.shape[:2]
    img = frame.copy()
    if person_boxes:
        xyxy = np.array([expand(b, 0.15, w, h) for b in person_boxes], dtype=float)
        img = sv.PixelateAnnotator(pixel_size=PIXEL_SIZE).annotate(scene=img, detections=sv.Detections(xyxy=xyxy))
    return img


def pixelated_jpeg(
    frame: np.ndarray,
    person_boxes: Sequence[Box],
    highlight: Sequence[Box] = (),
    quality: int = 60,
) -> bytes:
    """Return a small JPEG with every person box pixelated. `highlight` boxes are outlined (not blurred)."""
    h, w = frame.shape[:2]
    img = frame.copy()
    if person_boxes:
        xyxy = np.array([expand(b, 0.15, w, h) for b in person_boxes], dtype=float)
        det = sv.Detections(xyxy=xyxy)
        img = sv.PixelateAnnotator(pixel_size=PIXEL_SIZE).annotate(scene=img, detections=det)
    for b in highlight:
        cv2.rectangle(img, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), (0, 255, 255), 3)
    if w > MAX_WIDTH:
        img = cv2.resize(img, (MAX_WIDTH, int(h * MAX_WIDTH / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("could not encode snapshot")
    return buf.tobytes()
