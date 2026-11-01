# Computer-vision model evaluation (Phases 1 and 2)

Date: 2026-11-01. Phase 2 was read-only; after the owner approved using all repositories (including those without a licence file, for local use with credit and no redistribution), the weights were downloaded and tested. Results are in the last section. A model is marked _integrated_ only if it loaded, printed its class names and produced valid output on a sample.

## Phase 1: existing system (what the new models plug into)

The current system is already one pipeline, not nine: `3-auto-cv/vision_service/worker.py` (frame → people/vehicle pre-pass → plugins → N-of-M confirmation → cooldown → pixelated evidence → `POST /api/worker/detections`) and one central backend (`backend/`, one incident table, severity + routing + Telegram/call alerts, WebSocket, admin dashboard with a detector table). Workers **never** send alerts themselves; only the backend does. See [architecture.md](architecture.md). Models 1-3 exist today:

| #   | Capability         | Plugin in `plugins.py`                                | Honest status                                                                                                                                                 |
| --- | ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fire / smoke       | `FirePlugin` (`models/fire_smoke.pt`, YOLOv8n)        | **Trained, verified** (`{0: Fire, 1: Smoke}`, event on `fire.mp4`)                                                                                            |
| 2   | Fall               | `ActionPlugin("fall")` (pose rules)                   | **Not a trained model**; loads and runs, no fall clip to test                                                                                                 |
| 3   | Violence           | `ActionPlugin("violence")` (pose gate + CLIP)         | **Not a trained model**; missed the only fight clip; needs human verification                                                                                 |
| 4-9 | the six new models | partly covered by rules / zero-shot (`OpenVocabPlugin`) | see below                                                                                                                                                     |

Gap vs. the new brief: per-model dashboard controls for zones (danger, storage, waste-bin → allowed category, forklift thresholds), per-model counters (detected / confirmed / false positives), and model load status. The detector table (enable, min confidence) and live event feed exist.

## Phase 2: candidate repositories

| #   | Capability           | Repository                                       | Licence (repo)  | Weights actually in the repo                                                                                                   | Documented classes                                                                       | Verdict                                                                                                                                                                              |
| --- | -------------------- | ------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4   | Machinery proximity  | `nisha572/ai-construction-safety-detection`      | **none**        | **None.** "Built entirely from pretrained models, no custom training" (downloads stock models at run time)                       | person, PPE, machinery, activity; geometric zone/proximity/fall rules                    | No weights to integrate. Reuse the _idea_ (zones + proximity + temporal rules) in our own code; do not copy code (no licence). Machinery detection must come from Model 7 / COCO `truck`. |
| 5   | Chemical leak        | `MSunusi/pipeline-leak-detection`                | **none**        | `pipeline leak detection.pt` (5.5 MB, YOLO11n per README)                                                                       | **Gas Leak, Water Leak** (Roboflow dataset, CC BY 4.0), oil-and-gas **pipelines**         | Domain mismatch: trained on pipelines, not floor spills or chemicals. Evaluate on our footage first; likely only "visible leak at equipment". Uses Gemini (paid) for extras: not used. |
| 5b  | Liquid (reference)   | `IsiPaz/LiquidMonitorAI`                         | **MIT**         | `weights/lmai-11{n,s,m}-seg.pt` (6 / 20 / 45 MB, YOLO11 segmentation)                                                           | liquid-in-container segmentation (verify at load)                                        | Licence is clean and it is a segmentation model; may help with liquid regions. Not a floor-spill model: verify.                                                                      |
| 6   | Unstable storage     | `reyansh7/InventoryVerification`                 | **none**        | **None in the repo** (dataset config only; trained weights path `runs/train_results_yolo11l/...` is not committed)               | `box`, `pallet` (Roboflow dataset, CC BY 4.0)                                            | **Cannot integrate: no downloadable weights.** Needs an alternative source of box/pallet weights, or train on the CC BY 4.0 dataset (training is outside the current no-training scope).    |
| 7   | Forklift-pedestrian  | `sounak-sarkar-gwc/Forklift-pedestrian-proximity` | **none**        | `models/warehouse_yolo11_v2/weights/best.pt` (5.5 MB, YOLO11n fine-tuned on a Roboflow warehouse set)                            | `forklift`, `person`                                                                      | **Best fit and highest priority.** ByteTrack + pairwise distance + closing speed + SAFE/CAUTION/CRITICAL. Its defaults (3 m / 1.5 m) need camera calibration; we must not call pixels "metres" without it. |
| 7b  | (reference)          | `shrirag10/VIGIL`                                 | **none**        | **None**                                                                                                                       | n/a                                                                                      | Not usable as a model source (gRPC/Kafka service).                                                                                                                                   |
| 8   | Package damage       | `AdityaNeutron147/package-defect-detector`       | **none**        | `models/package_defect_v2.pt` (6.2 MB)                                                                                          | **dent, dirt, hole**                                                                     | Usable if permitted. Trained on small/staged data (conveyor demo): expect weak transfer to real shipments.                                                                          |
| 8b  | Package damage (alt) | `bbKurt11/SDG_CardboardBox_detect`               | **MIT**         | 3 × `best.pt` (YOLO11n, ~6.2 MB each: `production_v1_hybrid_v2`, `production_v1_realonly_fair`, `production_v2_HN`)              | two-stage (box, then defect); trained mostly on **4,000 synthetic Blender images + 44 real** | **Clean licence; best-documented.** Primary candidate for Model 8 if the unlicensed one is not approved.                                                                              |
| 9   | Waste classification | `siyad23/waste-sorting-model`                    | **AGPL-3.0**    | `weights/best.pt` (5.5 MB, YOLO11n)                                                                                             | 19 classes (aluminumCan, battery, bottle, banana, paper, plasticPacket, …) in 4 sorting groups (biodegradable, plastic, metal, hazardous) | **Clean licence (same AGPL as our Ultralytics use); cite the paper.** Classifies items, so improper disposal needs our own bin-zone + allowed-category rule.                              |
| 9b  | (reference)          | `esvinth/Waste-Segregation`                      | **none**        | **None**                                                                                                                       | n/a                                                                                      | Not usable as a model source.                                                                                                                                                        |

## What this means

- **Integrable now (clear licence):** Model 9 (waste, AGPL-3.0), Model 8 via the SDG repo (MIT), reference liquid segmentation (MIT).
- **Integrable only with the authors' permission (no licence = all rights reserved):** Model 7 forklift (priority), Model 5 pipeline leak, Model 8 primary.
- **Cannot be integrated as asked:** Model 4 (no weights; rules-only, reimplement ourselves) and Model 6 (no weights). Model 6 needs another weight source; until then the existing zero-shot `blocked_aisle` plugin plus a motion rule is the honest stop-gap, labelled experimental.
- **Not a model:** Models 2 and 3 in the existing repo are heuristics, not trained detectors (already documented in `limitations.md`).

## Planned design for the remaining phases (unchanged architecture)

New detectors are added as plugins in `3-auto-cv/vision_service/plugins.py` with the same `Candidate` result and the same N-of-M confirmation, evidence and backend path (no new pipeline, no new database, no direct notifications). Rules that are not model outputs (zone proximity, displaced-object tracking, bin-category mismatch, forklift SAFE/CAUTION/CRITICAL) are pure functions with unit tests. Backend additions: per-detector zone/threshold configuration and counters (detected, confirmed, false positive) on the existing detector settings API and admin Live page.

## Decisions needed from the project owner

1. **Licences / permission** for the four repositories with no licence (7, 5, 8-primary, and the code of 4): download weights for local, non-redistributed evaluation only (kept out of git, credited), or ask the authors first, or skip them?
2. **Model 6** has no weights: accept the zero-shot + motion stop-gap, or point me to another box/pallet weight source?
3. **Forklift distances:** the forklift model's thresholds are in metres; we need a camera calibration (two points a known distance apart) per camera, or we report pixel-based CAUTION/CRITICAL, clearly labelled.

## Results: weights loaded and run (2026-11-01, CPU, `python tools/evaluate_models.py`)

| Model | Task | Real class names (`model.names`) | Sample runs (conf floor 0.25) | Load |
|---|---|---|---|---|
| fire | `detect` | Fire, Smoke | constr_truck.jpg: 0 det (none), 137 ms; fp_frame_0000.jpg: 0 det (none), 37 ms; fp_frame_0030.jpg: 0 det (none), 40 ms | 0.12 s |
| forklift | `detect` | forklift, person | fp_frame_0000.jpg: 3 det (forklift 0.92, person 0.84, person 0.76), 33 ms; fp_frame_0030.jpg: 2 det (forklift 0.97, person 0.61), 36 ms | 0.06 s |
| leak | `detect` | crack, gas, leak, no leak, water | constr_truck.jpg: 0 det (none), 37 ms; fp_frame_0000.jpg: 1 det (no leak 0.25), 38 ms; fp_frame_0030.jpg: 1 det (no leak 0.42), 36 ms | 0.06 s |
| liquid-seg | `segment` | bottle, glass, liquid, wine-glass | constr_truck.jpg: 0 det (none), 48 ms; fp_frame_0000.jpg: 2 det (liquid 0.28, liquid 0.28), 48 ms; fp_frame_0030.jpg: 4 det (liquid 0.78, liquid 0.55, liquid 0.45), 45 ms | 0.06 s |
| package | `detect` | dent, dirt, hole | pkg_01.png: 2 det (hole 0.44, dent 0.3), 34 ms; pkg_02.png: 3 det (hole 0.62, dent 0.33, dent 0.27), 34 ms; pkg_03.png: 2 det (dent 0.49, dent 0.37), 28 ms | 0.04 s |
| sdg-box (stage 1) | `detect` | The_Box | fp_frame_0000.jpg: 1 det (The_Box 0.45), 32 ms; fp_frame_0030.jpg: 1 det (The_Box 0.32), 32 ms; pkg_01.png: 1 det (The_Box 0.38), 44 ms | 0.04 s |
| sdg-defect (stage 2) | `detect` | Stain, Puncture | pkg_01.png: 2 det (Stain 0.68, Puncture 0.52), 45 ms; pkg_02.png: 2 det (Stain 0.63, Puncture 0.51), 43 ms; pkg_03.png: 0 det (none), 35 ms | 0.04 s |
| waste | `detect` | aluminumCan_awss, aluminumFoil_awss, apple_awss, banana_awss, battery_awss, bolt_awss, bottle_awss, cigarette_awss, egg_awss, foodContainer_awss, juiceBox_awss, leaf_awss, nut_awss, orange_awss, paperBag_awss, paperCup_awss, paper_awss, plasticFoodPacket_awss, plasticPacket_awss | constr_truck.jpg: 0 det (none), 37 ms; fp_frame_0000.jpg: 0 det (none), 38 ms; fp_frame_0030.jpg: 0 det (none), 36 ms | 0.05 s |

Samples: two eye-level warehouse frames from the forklift repo (people + forklift), three packaging photos from the package repo, and the same frames as negatives for the other models. **No positive sample exists for the leak, waste or liquid models**, so for them only loading, correct classes and "no false alarm on unrelated frames" were verified, not detection of a real leak or waste item.

## Integration status (all through the same worker, confirmation, evidence and central incident path)

| # | Capability | Plugin | Status | Evidence | Limits found |
|---|---|---|---|---|---|
| 1 | Fire / smoke | `fire` | **integrated, verified on footage** | `fire.mp4` -> 1 confirmed incident, evidence frame + clip | confidence 0.4-0.7 on that clip; small fires may be missed |
| 2 | Fall | `fall` | integrated, **unverified** (heuristic) | loads, runs, no false alarm on a fight clip | no fall footage exists to test it |
| 3 | Violence | `violence` | integrated, **weak** (heuristic) | loads, runs | missed the only fight clip; human verification required |
| 4 | Machinery proximity | `machinery_proximity` | **integrated** (rule) | people video + dashboard-configured danger zone -> 1 incident; stopped machine never alerts (unit test) | no machinery detector: the zone is the machine; running signal simulated |
| 5 | Chemical leak | `spill` (leak model) | integrated, **detection unverified** | classes verified; `no leak` on warehouse frames; never alerts on `no leak`/`crack` | pipeline domain, no positive sample, cannot identify a chemical |
| 6 | Storage instability | `storage_instability` | integrated as **stop-gap** (rules on SDG box detector) | loads; static scene raises nothing; synthetic-track unit tests for falling/displaced rules | requested repo has **no weights**; box detector is mostly synthetic-trained; no pallet class; not tested on real falling boxes |
| 7 | Forklift-pedestrian | `forklift_person` | **integrated, verified on frames** | forklift 0.92-0.97, person 0.61-0.84; sample frame -> CAUTION incident; repeat de-duplicated; CRITICAL escalates | distances are estimates unless `calibration.px_per_m` is set; tested on still frames, not moving video |
| 8 | Package damage | `package_damage` | **integrated, verified on samples** | pkg photos -> hole 0.44-0.62, dent 0.3-0.49; SDG two-stage -> stain 0.63-0.68 | small staged/synthetic training data; visible damage only (no quantity/content check) |
| 9 | Waste | `waste` | integrated, **detection unverified** | 19 classes verified; zero-alert without bin zones (test) | no positive sample; rules need configured bin zones; AGPL-3.0, cite the paper |
| - | LiquidMonitorAI segmentation | none | **evaluated, rejected** | `liquid` 0.78 on a dry warehouse floor | not usable as a spill detector |

## Decisions made
1. All listed repositories were used, weights kept out of git, credits in `3-auto-cv/models/third_party/SOURCES.md`.
2. Storage: no box/pallet weights exist in the requested repo, so the MIT SDG box detector plus motion rules is the stop-gap, labelled third-party / unverified.
3. Forklift distances: shown as **estimates** (assumes a ~2 m forklift) unless a camera has `calibration.px_per_m`; the basis is stored with every event.
