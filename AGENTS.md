# AGENTS.md — Safer Work, Better Work (L'Oréal Manufacturing & Plant hackathon, Option 01)

Standing rules for every session. Keep this file under 12,000 characters. Details live in `docs/`.

## Read first (every new session)
1. `docs/MASTER_PROMPT.md` — the full brief: what to build, scope tiers, acceptance criteria, working agreements.
2. `docs/CONTEXT.md` — research background, model/repo/licence notes, decisions, open questions, sources.
If they conflict with this file, tell the user before proceeding.

## What this project is
A near-miss and hazard reporting system for a cosmetics manufacturing plant: **Scan · Speak · See**.
- Worker PWA opened by QR stickers (icon + voice note + photo, under 30 s, anonymous by default).
- Firebase backend with explainable triage (severity 1-5 with a reason, plus an eco-tag).
- Admin dashboard, plus a public "You said, we did" board that closes the loop.
- AI camera service (pretrained YOLOv8 + supervision zones, no training) that posts auto-detected events needing human confirmation.
- Later (Phase 2): offline queue, simulated emergency escalation router.
- Vision only (do NOT build): Bluetooth mesh relay. Write a roadmap doc instead.

Hero risk: clearing jams and changeovers on filling/packaging lines (our assumption, not L'Oréal data). Secondary: forklift-pedestrian conflict.

Deliverables are graded too: `docs/risk-analysis.md`, `docs/implementation-plan.md`, `docs/metrics.md`, `docs/eco-impact.md`, `docs/privacy-and-ethics.md`, `docs/limitations.md`, `docs/demo-script.md`. Keep them matching the real implementation.

## Stack and layout
- `apps/web` React + Vite + TypeScript PWA (Tailwind, react-i18next; English + Hindi).
- `functions/` Firebase Cloud Functions (TypeScript). Firestore, Storage, Auth.
- `services/vision/` Python 3.11: ultralytics (yolov8n, yolov8n-pose), supervision, OpenCV, firebase-admin.
- `docs/`, `scripts/seed`, `firebase.json`.
- Develop and demo on the **Firebase Emulator Suite** (offline, no billing). Provide `.env.example`; never commit secrets.
- Strict TypeScript, Prettier/ESLint; Python with ruff. Few dependencies, boring idiomatic code.
- Run commands (need Java 21+ on PATH for the emulators): `npm install`; `npm run dev` (emulators + web; UI :4000, web :5173); `npm run seed` (second terminal, emulators up); `npm run lint | typecheck | test | build | format`; `npm run test:rules` (rules tests, starts emulators); `npm run smoke` (E2E trigger check, needs dev + seed running). Vision: `cd services/vision && python -m vision_service --source <video> --zones zones.yaml` (see its README); `python -m pytest`; `ruff check .`. Browser E2E: `python scripts/e2e/ui_flow.py` (Playwright + Chrome).
- Repo conventions: project id `demo-plant-line3`; `.env` is gitignored, never read or commit it; LF line endings (`.gitattributes`).

## Hard rules
- **Privacy:** anonymous reports by default; never store faces; pixelate people in any saved image; no per-person scoring, ranking or leaderboards; aggregate by zone and shift.
- **Honesty:** label anything simulated (dispatch, machine "running" signal, savings estimates, demo accuracy) as simulated/estimated in UI and docs. Never claim real police/ambulance integration. Never invent statistics: every number cites a source or is flagged as an assumption.
- **Branding:** fictional "Demo Plant — Line 3". No L'Oréal logos or marks.
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
