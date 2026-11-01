# AGENTS.md — Safer Work, Better Work (L'Oréal Manufacturing & Plant hackathon, Option 01)

Standing rules for every session. Keep this file under 12,000 characters. Details live in `docs/`.

## Read first (every new session)
1. `docs/MASTER_PROMPT.md` — the full brief: what to build, scope tiers, acceptance criteria, working agreements.
2. `docs/CONTEXT.md` — research background, model/repo/licence notes, decisions, open questions, sources.
If they conflict with this file, tell the user before proceeding.

## What this project is
A near-miss and incident reporting and response platform for a cosmetics plant: **Scan · Speak · See**. Three user-facing products, one FastAPI backend, one incident database (the owner chose FastAPI over Firebase; the Firebase version is archived in `legacy-firebase/`).
- `1-sticker-app` (:5174): QR sticker per machine, opens a quick report form (EN/HI, photo/video/voice, offline queue, anonymous).
- `2-user-report-site` (:5173): worker portal (report, track status, public "You said, we did" board) + admin control centre `/admin` (live monitoring, incidents, workflow, map, QR/asset management, alerts, analytics).
- `3-auto-cv`: Python worker with detector plugins (fire/smoke trained weights; fall, violence heuristics; forklift/hand rules; YOLO-World zero-shot PPE/spill/aisle/waste); N-of-M confirmation, pixelated evidence, posts to the backend. No training.
- `backend` (:8000): FastAPI + SQLite, JWT roles, evidence, Telegram + OmniDimension call alerts (simulated unless `DEMO_MODE=false`), escalation, analytics, WebSocket.
- `packages/common`: shared React code (report form, offline queue, i18n). Vision only (do NOT build): Bluetooth mesh relay (roadmap doc).
Hero risk: clearing jams and changeovers on filling/packaging lines (our assumption, not L'Oréal data). Secondary: forklift-pedestrian conflict.
Deliverables are graded too: `docs/risk-analysis.md`, `implementation-plan.md`, `metrics.md`, `eco-impact.md`, `privacy-and-ethics.md`, `limitations.md`, `demo-script.md`, `architecture.md`. Keep them matching the real implementation.

## Stack and layout
- Web: React + Vite + TypeScript (Tailwind, react-i18next; English + Hindi). Backend: Python 3.11+ FastAPI, SQLite. CV: ultralytics, supervision, OpenCV, CLIP.
- Strict TypeScript, Prettier/ESLint; Python with ruff and pytest. Few dependencies, boring idiomatic code. No paid services.
- Commands: `npm install`; `npm run dev` (API + both web apps); `npm run seed`; `npm run lint | typecheck | test | build | format`; `npm run e2e` (Playwright + Chrome, needs `npm run dev`); `python -m pytest backend/tests`; CV: `cd 3-auto-cv && python -m vision_service.worker --source CAM=VIDEO` and `python -m pytest`, `ruff check .`.
- Conventions: `.env` is gitignored, never read or commit it (use `.env.example`); LF line endings; runtime data in `backend/data/` is gitignored; `demo-assets/*.mp4` and `*.pt` are gitignored.

## Hard rules
- **Privacy:** anonymous reports by default; never store faces; pixelate people in any saved image; no per-person scoring, ranking or leaderboards; aggregate by zone and shift.
- **Honesty:** label anything simulated (dispatch, machine "running" signal, savings estimates, demo accuracy) as simulated/estimated in UI and docs. Never claim real police/ambulance integration. Never invent statistics: every number cites a source or is flagged as an assumption.
- **Branding:** the product is named **SurakshaSetu** (Suraksha = safety, Setu = bridge); logo and banner are original SVGs in `docs/assets/`. Fictional "Demo Plant — Line 3". No L'Oréal logos, wordmark artwork or official colours; every portal, sticker and the README say it is a hackathon prototype, not an official L'Oréal product.
- **Licences:** Ultralytics is AGPL-3.0 (fine for the demo; note in docs). SH17 is CC BY-NC-SA. State the licence before downloading any model or dataset.
- **Models:** confirm class names by loading each model and printing `model.names` before writing rules. Hugging Face models were not verified; fall back to COCO `truck` for forklifts if needed and document it.
- **Camera rules (MVP):** (1) forklift-person near-miss measured between box edges, debounced into episodes; (2) wrist keypoint inside a machine danger zone while the machine is flagged running, sustained for N seconds. Favour precision; every auto-detected event needs human confirm/dismiss.

## How to work
- Plan first: write `PLAN.md` (milestones M0-M7, time estimates, what to cut first). Show the Firestore data model and folder structure and wait for approval before coding.
- Finish and demo one milestone before the next. Commit per milestone with clear messages. Run tests and linters before calling anything done, and tell the user exactly how to verify it.
- Add unit tests for triage rules and KPI functions.
- Ask before decisions that cost money, change scope, or involve licences; otherwise decide and record it in `PLAN.md`.
- If the brief is wrong, infeasible or self-contradictory, say so plainly and propose a fix.
- Keep chat replies short; put detail in files.
- Build order: M0 scaffold + seed, M1 data model + rules + triage tests, M2 worker app, M3 admin dashboard, M4 `/board`, M5 vision service, M6 docs, M7 Phase 2 items.
