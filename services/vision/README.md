# Vision service — the camera as an automatic near-miss reporter

Python 3.11+ (tested on 3.12). **Pretrained weights only, no training.** Every event is "auto-detected, needs confirmation":
a supervisor confirms or dismisses it on the dashboard.

## What it does (MVP rules)
1. **Forklift–person near miss.** Gap measured between the **box edges** (not centres). Fires only if the gap stays under
   `--gap-px` for `--gap-sustain` seconds; one event per episode. A *seated driver* (person mostly inside the vehicle box with feet
   well above its bottom edge) is excluded; a pedestrian standing in front of a forklift is not.
2. **Hand in machine danger zone while the machine is "running".** A wrist keypoint (from `yolov8n-pose`) inside a
   `machine_danger` polygon for `--hand-sustain` seconds. The "running" signal is **SIMULATED** (see `machine.py`: `on`, `off`,
   `schedule:on:0-30,off:30-60`, or a local HTTP endpoint you flip live). There is no PLC or stack-light connection.

Precision over recall: detections below `--min-conf` (0.5) never fire; sustained conditions only; people tracked with ByteTrack.

## Privacy by design
- People are **pixelated before anything is saved or uploaded** (`privacy.py`, supervision `PixelateAnnotator`). Raw frames stay in memory.
- The blur uses a lower confidence threshold (0.15) than the alert rules, boxes are expanded 15%, images are downscaled to 640 px.
  A test checks that detail inside a person box is destroyed.
- No faces stored, no identification, no per-person data. Events are aggregated by zone and shift.
- Retention is enforced by the backend (default 30 days; dismissed events lose their snapshot immediately). See `docs/data-model.md`.
- Known gap: a person the detector misses is not pixelated. Review snapshots before sharing them outside the plant.

## Models and licences (printed with `model.names` on every start)
| Use | Model | Licence |
|---|---|---|
| people | `yolov8n.pt` (COCO `person`) | Ultralytics, **AGPL-3.0** (fine for the hackathon demo) |
| wrists | `yolov8n-pose.pt` (keypoints 9, 10) | Ultralytics, **AGPL-3.0** |
| forklift | COCO `truck` as a stand-in (default) | same weights |
| forklift (optional) | HF `keremberke/yolov8n-forklift-detection` via `--forklift-model` | **model card declares no licence** and it was not downloaded or tested here. Check the licence before using it. |

Production would use an Apache-licensed detector (e.g. RF-DETR, YOLOX) or an Ultralytics enterprise licence.
If SH17 or any dataset is used for fine-tuning: SH17 is **CC BY-NC-SA 4.0 (non-commercial)**. No dataset is downloaded by this repo.

## Run
```
cd services/vision
pip install -r requirements.txt          # reuse an existing torch install if you have one
python -m vision_service --print-model-names

# Plumbing test (NOT a realistic demo; see below), with the emulators running (npm run dev, npm run seed):
python tools/make_plumbing_clip.py ../../demo-assets/plumbing_test.mp4 plumbing_zones.yaml
python -m vision_service --source ../../demo-assets/plumbing_test.mp4 --zones plumbing_zones.yaml \
       --vehicle-classes bus --gap-px 100 --sink firestore

# Your own footage:
python -m vision_service.draw_zones --source my_forklift_aisle.mp4      # click polygons, S prints YAML
python -m vision_service --source my_forklift_aisle.mp4 --zones zones.yaml --machine-running schedule:on:0-20,off:20-40
python -m vision_service --source 0 ...                                  # webcam;  rtsp://... for IP cameras
python -m vision_service ... --sink local --out-dir out-events           # dry run, no network
```
Tests and lint: `python -m pytest` and `ruff check .` in this folder (17 tests, no model needed).

## Honest limitations
- **No real plant footage was available.** The bundled plumbing test is a static photo of people next to a bus (Ultralytics' sample
  `bus.jpg`), repeated for 6 s, with the bus standing in for a forklift. It proves the pipeline, **not** accuracy.
- Only one forklift-vs-person geometry (2D image boxes): perspective changes what a pixel gap means. Calibrate `--gap-px` per camera.
- COCO `truck` is a weak stand-in for a forklift; expect misses. Use a purpose-trained detector with a clear licence for real use.
- Pose wrists can be occluded or flip left/right; hand-in-zone needs a clear view of the machine opening.
- `.env` in this repo has `GCLOUD_PROJECT=demo-safer-work`; the emulator project here is `demo-plant-line3`, so the service ignores it (prints a note).
