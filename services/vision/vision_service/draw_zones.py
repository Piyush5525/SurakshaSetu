"""Tiny helper to draw a zone polygon on the first frame of your footage and print it as YAML.

  python -m vision_service.draw_zones --source demo.mp4

Left-click adds a point, N starts a new polygon, S prints the YAML, Q quits.
Needs a desktop OpenCV build (opencv-python), not the headless one.
"""

from __future__ import annotations

import argparse

import cv2


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    args = ap.parse_args()
    cap = cv2.VideoCapture(int(args.source) if args.source.isdigit() else args.source)
    ok, frame = cap.read()
    if not ok:
        raise SystemExit("cannot read a frame")
    polys: list[list[list[int]]] = [[]]

    def on_mouse(event: int, x: int, y: int, *_: object) -> None:
        if event == cv2.EVENT_LBUTTONDOWN:
            polys[-1].append([x, y])

    cv2.namedWindow("zones")
    cv2.setMouseCallback("zones", on_mouse)
    while True:
        img = frame.copy()
        for poly in polys:
            for pt in poly:
                cv2.circle(img, tuple(pt), 4, (0, 255, 255), -1)
            if len(poly) > 1:
                cv2.polylines(img, [__import__("numpy").array(poly)], True, (0, 255, 255), 2)
        cv2.imshow("zones", img)
        k = cv2.waitKey(30) & 0xFF
        if k == ord("n"):
            polys.append([])
        elif k == ord("s"):
            print("zones:")
            for i, poly in enumerate(p for p in polys if len(p) >= 3):
                print(
                    f"  - id: zone-{i + 1}\n    type: machine_danger   # or forklift_lane\n    polygon: {poly}"
                )
        elif k == ord("q"):
            break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
