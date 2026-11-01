"""Builds a PLUMBING-TEST clip from the sample image bundled with Ultralytics (bus.jpg, AGPL-3.0).

This is NOT a realistic demo and says nothing about accuracy: it is a static photo of people next to a bus,
repeated for a few seconds, so the whole pipeline (detect -> rules -> pixelate -> upload -> dashboard) can be
exercised without real plant footage. The bus stands in for a forklift (--vehicle-classes bus).

  python tools/make_plumbing_clip.py ../../demo-assets/plumbing_test.mp4 plumbing_zones.yaml
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
from ultralytics import YOLO
from ultralytics.utils import ASSETS


def main(out_video: str, out_zones: str, seconds: int = 6, fps: int = 10) -> None:
    img = cv2.imread(str(ASSETS / "bus.jpg"))
    h, w = img.shape[:2]
    vw = cv2.VideoWriter(out_video, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for _ in range(seconds * fps):
        vw.write(img)
    vw.release()

    # Put a machine_danger polygon around the most confident wrist so the hand-in-zone rule has a target.
    pose = YOLO("yolov8n-pose.pt")
    r = pose.predict(img, conf=0.25, verbose=False)[0]
    best = None
    for pts, cf in zip(r.keypoints.xy.tolist(), r.keypoints.conf.tolist(), strict=False):
        for j in (9, 10):
            if best is None or cf[j] > best[2]:
                best = (pts[j][0], pts[j][1], cf[j])
    assert best is not None, "no wrist found in sample image"
    x, y, _ = best
    Path(out_zones).write_text(
        "zones:\n"
        "  - id: plumbing-danger-1\n    type: machine_danger\n    location_id: filler\n"
        f"    polygon: [[{x - 60:.0f}, {y - 60:.0f}], [{x + 60:.0f}, {y - 60:.0f}], "
        f"[{x + 60:.0f}, {y + 60:.0f}], [{x - 60:.0f}, {y + 60:.0f}]]\n",
        encoding="utf-8",
    )
    print(
        f"wrote {out_video} ({w}x{h}, {seconds}s) and {out_zones}; wrist at ({x:.0f},{y:.0f}) conf {best[2]:.2f}"
    )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
