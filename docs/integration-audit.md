# Phase 1 audit: `vjn6805/Detection-Models` and the master prompt

Status: **read-only audit from the GitHub API and raw docs. Nothing from that repo was downloaded or run.** Date: 2026-11-01.

## What the repo actually is
- One project folder, `WomenSafety/`: FastAPI + SQLite + React (JSX) + Telegram/Twilio-call alerts, camera workers, event pipeline, evidence clips, WebSocket-style live updates. Same shape as the prompt describes, aimed at a different domain (public safety, with automatic-call logic).
- **No licence file** (GitHub reports `license: null`). By default that means all rights reserved. Reusing code or weights needs the owner's permission. If you are the owner (or have it in writing), say so and it is fine.
- Weights present: `models/best_nano_111.pt` (5.5 MB, presumably fire), `models/crash_best.pt` (22.5 MB, crash), plus stock `yolov8n.pt` / `yolov8n-pose.pt` (Ultralytics, AGPL-3.0). Whether `best_nano_111.pt` loads and what its `names` are is **unverified** until we load it.

## The prompt's assumption does not match the repo
The prompt says trained fire, violence and fall models exist. Per the repo's own `docs/ACTION_DETECTORS_STATUS.md`:

| Detector | Method in repo | Honest status (their doc) |
|---|---|---|
| Fire | trained YOLO (`best_nano_111.pt`) | fires on `fire.mp4` (0.761); only trained model besides crash |
| Fall | **rules on YOLOv8n-pose keypoints, no training** | "no fall footage exists in the repo"; logic verified on synthetic data only |
| Violence | **CLIP zero-shot gated by pose proximity and motion, no training** | "does not detect the available fight clips" (2 of 2 missed); thresholds tuned on one clip |
| Snatch | rules on tracked boxes | 3 of 3 clips missed |

So only fire (and crash) are trained detectors. Fall and violence are experimental heuristics. They can be wired in and labelled "experimental, needs human verification", but we must not describe them as trained or accurate. Violence in particular must stay a "potential event, human verifies" as the prompt itself requires.

## Conflicts with this project
1. **Backend.** Our working system is Firebase emulators + TypeScript functions (triage, board, retention, rules tests: 62 + 23 passing). Their stack is FastAPI + SQLite. The prompt forbids duplicate databases and three backends, so one must be the single source of truth.
2. **Scope/licence rules** in `AGENTS.md`: ask before scope or licence decisions; state licences before downloading models. The repo has no licence, so I have not downloaded it.
3. **Safety rule:** their repo can place phone calls. We keep emergency dispatch **simulated only**; that code is not to be ported.
4. Branding: keep the fictional plant name; no L'Oréal marks even though the prompt title uses the name.

## Recommended plan (keeps what works, smallest rewrite)
Keep Firebase as the one central backend and database. Port detectors, not the server.

| Phase | Work | Reuses |
|---|---|---|
| 2 | Extend the shared incident model: categories (9 listed), source (qr / portal / cctv / audio / admin), department routing table, lifecycle (add `analysed, alerted, acknowledged, assigned, resolved, closed, false_positive, duplicate`), severity separate from model confidence, machine/camera/zone fields, audit log | existing triage, rules, seed |
| 3 | `3-auto-cv` becomes a plugin pipeline: each detector is a module (`fire`, `fall`, `violence`, existing forklift/hand rules). Port their fire/crash weights and pose-fall rules **after licence confirmation**, each verified with `model.names` and a real clip first. Add multi-frame confirmation (N of M), evidence frame + short clip, model name/version/confidence stored, per-model enable flag, uploaded-video and webcam sources | current rules, pixelation, sinks |
| 4 | Notification service: Telegram (free Bot API) with simulated mode by default, delivery log, acknowledgement, escalation timer; responders collection with department and availability; assignment (never "nearest only") | existing escalation chains, simulated notifier |
| 5 | Sticker app: machine registry with unique opaque QR ids, enable/disable/regenerate, PNG/PDF download. Worker portal: login-free reporting plus "my reports" status tracking and updates | current apps |
| 6 | Admin: live camera list/preview, AI event feed, audio status, floor map with machines/cameras/incidents, analytics (by category/department/location, ack and resolve times, false-positive rate), notification history | current dashboard |
| 7 | Audio: pluggable detector interface; start with **simulated, clearly labelled** events plus a free open model (for example YAMNet, Apache-2.0) if time allows; loudness alone never raises an incident | none |
| 8 | Roles (worker, responder, manager, admin), upload limits, rate limits, privacy notice, retention; end-to-end tests 1-7 from the prompt | rules tests |

Categories that stay manual-report only, labelled "AI pending": production quality, laboratory contamination, chemical spill composition, waste disposal, logistics, most of machinery/storage/warehouse. No suitable pretrained model is known for them; I will not fake detection.

## Decisions I need from you
1. **Backend:** keep Firebase (recommended; everything already works and is tested) or switch to the FastAPI backend from your repo (large rewrite, drops tested code)?
2. **Licence:** is `vjn6805/Detection-Models` yours (or do you have the owner's permission) so I may download and reuse its weights and code?
3. **Telegram:** a free bot token from @BotFather (kept in `.env`, never committed) for real alerts, or simulated alerts only for now?
4. **Priority:** the prompt is far larger than one pass. If time is short, my cut order is: audio (simulated only), PDF export, analytics extras, then roles beyond admin/worker.
