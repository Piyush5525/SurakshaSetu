"""Model evaluation harness: load each weight file, print its real class names, run it on sample images and
record latency. Output is what docs/model-evaluation.md quotes. Run from 3-auto-cv:

  python tools/evaluate_models.py
"""

from __future__ import annotations

import glob
import json
import os
import time
from pathlib import Path

import cv2
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT.parent / "demo-assets" / "samples"
IMAGES = sorted(glob.glob(str(SAMPLES / "*.*")))
# (name, weights, sample prefixes that match what the model was made for, confidence floor)
MODELS = [
    ("fire", "models/fire_smoke.pt", [], 0.25),
    ("forklift", "models/third_party/forklift/best.pt", ["fp_"], 0.35),
    ("leak", "models/third_party/leak/best.pt", [], 0.25),
    ("liquid-seg", "models/third_party/liquid/best.pt", [], 0.25),
    ("package", "models/third_party/package/best.pt", ["pkg_"], 0.25),
    ("sdg-box (stage 1)", "models/third_party/sdg_v2_HN_yolo1/best.pt", ["pkg_", "fp_"], 0.25),
    ("sdg-defect (stage 2)", "models/third_party/sdg_hybrid_v2_yolo2/best.pt", ["pkg_"], 0.25),
    ("waste", "models/third_party/waste/best.pt", [], 0.25),
]


def main() -> None:
    results = []
    for name, w, prefixes, conf in MODELS:
        p = ROOT / w
        if not p.exists():
            print(f"[{name}] weights missing: {w}")
            results.append({"model": name, "status": "weights missing"})
            continue
        t0 = time.time()
        m = YOLO(str(p))
        load_s = time.time() - t0
        row = {"model": name, "weights": w, "task": m.task, "classes": dict(m.names), "load_s": round(load_s, 2), "runs": []}
        imgs = [i for i in IMAGES if any(os.path.basename(i).startswith(pr) for pr in prefixes)] or IMAGES[:3]
        for img in imgs:
            frame = cv2.imread(img)
            if frame is None:
                continue
            m.predict(frame, verbose=False)  # warm-up
            t1 = time.time()
            r = m.predict(frame, conf=conf, verbose=False)[0]
            ms = (time.time() - t1) * 1000
            dets = [(m.names[int(k)], round(float(c), 2)) for k, c in zip(r.boxes.cls.tolist(), r.boxes.conf.tolist(), strict=False)]
            row["runs"].append({"image": os.path.basename(img), "ms": round(ms), "detections": dets[:8], "n": len(dets)})
            print(f"[{name}] {os.path.basename(img)}: {len(dets)} det, {ms:.0f} ms, {dets[:5]}")
        results.append(row)
    out = ROOT / "tools" / "evaluation_results.json"
    out.write_text(json.dumps(results, indent=1), encoding="utf-8")
    print("saved", out)


if __name__ == "__main__":
    main()
