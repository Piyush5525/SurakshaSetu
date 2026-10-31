# MASTER PROMPT — "Safer Work, Better Work" (L'Oréal Manufacturing & Plant hackathon, Option 01)

You are my senior engineer and pair-programmer for a hackathon entry. Read this whole brief, then follow the **Working agreements** and start at **Step 0**.

---

## 1. The challenge (from the organisers)

Option 01 — *Safer Work, Better Work*. A plant wants to make everyday work safer while keeping operations practical and efficient. We must **identify a workplace risk and propose an improvement** that helps prevent incidents and supports a strong safety culture.

Questions the judges want answered:
1. How can employees spot and report risks easily?
2. Could equipment design, training, visual controls, or digital tools help?
3. How will we ensure the solution works in daily practice?
4. How could the safety improvement also reduce energy use, material waste, or other environmental impacts?

**Required deliverables:** risk analysis, proposed improvement, implementation plan, and measures (near-miss reporting, task-risk reduction, employee feedback).

> The app is the *proof* of the improvement. The written deliverables are graded too. Treat `docs/` as first-class work, not an afterthought.

## 2. Our solution: "Scan · Speak · See"

A near-miss and hazard reporting system for a cosmetics manufacturing plant, built around one **hero risk**:

> **Clearing jams and doing changeovers on filling/packaging lines** (pinch points, unexpected start-up, hands inside machine zones) — plus a secondary risk of **forklift–pedestrian conflict** in shared aisles.

(The hero-risk choice is our assumption from general industry knowledge, not L'Oréal data. Say so in the docs.)

Why this design (research findings to reflect in the docs and UI):
- Workers under-report near misses because of **fear of blame, hassle, and reports that go nowhere**. So: anonymous by default, under 30 seconds, no login, and a visible **"You said, we did"** board that closes the loop.
- A **flat Heinrich pyramid** (few near misses vs injuries) signals under-reporting, so near-miss volume is a *leading* indicator and *more is better* early on.
- Safety fixes can also cut waste: compressed-air/steam leaks (often 20–30% of compressed air), spills, machines idling with nobody present. Every report gets an **eco-tag** and the dashboard shows an estimated saving.
- Camera AI can act as an **automatic reporter** feeding the same pipeline — but only with **privacy by design** and **human confirmation**.

## 3. What to build (scope tiers)

Legend: **MVP** = build first and make it excellent. **P2** = Phase 2, build if MVP is done. **Vision** = do NOT build; write a roadmap doc/slide only.

| # | Component | Tier |
|---|---|---|
| A | Worker reporting app (PWA) opened via QR stickers | MVP |
| B | Cloud backend: data model, triage (severity + eco-tag), roles | MVP |
| C | Admin/EHS dashboard | MVP |
| D | "You said, we did" closed-loop board (public, worker-facing) | MVP |
| E | AI camera service (YOLOv8 + zones → auto-detected events) | MVP (2 rules), P2 (rest) |
| F | Offline queue + background sync for the PWA | P2 |
| G | Emergency escalation router (simulated dispatch) | P2 |
| H | Bluetooth/low-network mesh relay | Vision only |
| I | Written deliverables in `docs/` (risk analysis, plan, metrics) | MVP, grows with the code |

### A. Worker app (React PWA)
- Each machine/zone has a **QR sticker** → URL like `/r/:locationId`. No login, no app install.
- Form: location is pre-filled from the QR; worker picks **one hazard icon** (pinch point/jam clearing, forklift/vehicle, chemical/spill, slip/trip, manual handling, electrical/lockout, other), optionally records a **voice note**, adds a **photo**, and optionally taps "someone could have been hurt badly". Target: under 30 seconds, large touch targets, minimal text, icon-first, **English + Hindi** strings (i18n-ready for more).
- **Anonymous by default**; optional name/shift field.
- After submit: show a receipt code and link to the board so the worker can watch the report's status.
- Voice: use the browser Web Speech API for quick transcription when available; always also store the raw audio blob so nothing is lost when transcription is unavailable.
- Generate printable **QR sticker sheets** (PDF) per location from the admin side, with the location name and a short "Spot it. Scan it. Say it." line.

### B. Backend (Firebase)
- Firestore + Storage + Auth (roles: `worker` anonymous, `supervisor`, `ehs_admin`) + Cloud Functions (TypeScript).
- **Develop and demo entirely on the Firebase Emulator Suite** so it runs offline with no billing (Cloud Functions in production needs a paid plan; note this in the README).
- Collections (propose exact fields in Step 1): `locations`, `reports`, `events` (CV), `actions` (corrective actions), `escalations`, `assumptions`, `kpiSnapshots`.
- **Triage function** on new report/event:
  1. Severity 1–5 from a transparent rules matrix (hazard type × "potential for serious harm" flag × location risk weight × keywords in transcript). Store the *reason* string for every score so judges can see it is explainable.
  2. Eco-tag: `none | air_leak | steam_leak | spill | idle_machine | material_waste`, from icon + keywords.
  3. Optional LLM triage behind a feature flag (`TRIAGE_LLM=true`, Anthropic API key from env). Rules must work with the flag off.
- Create an `action` (owner, due date, status) automatically for severity ≥ 3.

### C. Admin dashboard (React, same repo, `/admin`)
- Auth-gated. Panels: reports inbox with filters; **hotspot map** by location and shift (simple floor-plan SVG with heat colouring — the layout can be a fictional "Line 3" plan); trend of reports per week; **time-to-close**; open vs closed actions; auto-detected (camera) events awaiting confirmation; eco-tag savings estimate; feedback pulse score.
- KPI definitions (document each in `docs/metrics.md`): near-miss reports per 100 workers per month (aggregate only), median hours to close, % reports closed with visible fix, repeat-hotspot count, jam-clearing events done with confirmed lockout (simulated in demo), employee pulse score, estimated kWh / material saved (clearly labelled *estimate*).
- **Never rank or expose individual workers.** Aggregate by location and shift only.

### D. "You said, we did" board (public route `/board`)
- Large-screen friendly. Shows recent reports (anonymised), status (received → being fixed → fixed), what was changed, and a monthly "top fix" highlight. This is the culture mechanism, so make it good-looking and readable from 3 metres away.

### E. AI camera service (Python, `services/vision/`)
- Python 3.11, `ultralytics` (YOLOv8n and `yolov8n-pose`), `supervision` (ByteTrack, PolygonZone), `firebase-admin`, OpenCV. **No training**: use pretrained weights only.
  - People: stock COCO `yolov8n.pt` (class `person`).
  - Hands: `yolov8n-pose.pt` wrist keypoints (no custom hand model).
  - Forklift: try the Hugging Face model `keremberke/yolov8n-forklift-detection` (classes forklift, person); if it will not load on the current Ultralytics release, fall back to COCO `truck`/`car` as a stand-in and document the limitation.
  - PPE (optional, P2): `Nexus3/yolov8n-ppe-detection-6classes` or similar. Confirm class names by loading the model, do not assume.
- Input: video file (for demo), webcam, or RTSP URL, via CLI flags. Zones are defined in `zones.yaml` (polygons with type: `forklift_lane`, `machine_danger`, `ppe_required`).
- **MVP rules (implement exactly these two first):**
  1. **Forklift–person near-miss:** gap measured **between bounding-box edges**, not centres; threshold configurable; debounce so one event = one episode, not one per frame.
  2. **Hand in machine danger zone while machine is "running":** wrist keypoint inside a `machine_danger` polygon. "Running" comes from a config flag/endpoint for the demo (simulate a stack-light signal); persist for N seconds before firing.
- P2 rules: person in forklift-only lane; PPE missing in PPE zone (only after persisting several seconds); **idle-energy**: machine running with zero people in its zone for N minutes → eco-tag `idle_machine`.
- Every event is posted to Firestore `events` with: rule, zone, timestamp, confidence, and a **pixelated snapshot** (people blurred with `supervision` PixelateAnnotator before upload). **Never store faces or raw frames of people. Never identify individuals.**
- Events appear on the dashboard as "auto-detected — needs confirmation". A supervisor/worker **confirms or dismisses**; the verdict is stored (this builds a labelled set for future fine-tuning).
- Alert only on sustained violations; low-confidence detections must not fire. False alarms destroy trust, so favour precision.
- Provide `README` notes on licensing: Ultralytics is AGPL-3.0 (fine for the hackathon demo; production would use an Apache-licensed detector such as RF-DETR or an Ultralytics enterprise licence). If SH17 or any dataset is mentioned, note SH17 is CC BY-NC-SA (non-commercial).

### F. Offline queue (P2)
- IndexedDB queue (e.g. `idb`) + service worker background sync. Reports (including photo/audio blobs) are saved locally, shown as "waiting to send", and retried automatically. Show clear status to the worker.

### G. Emergency escalation router (P2, simulated)
- Cloud Function triggered when severity ≥ 4 or the worker flags serious harm.
- Configurable escalation chain with timers: on-site first-aider / emergency response team → shift supervisor → plant medical room/ambulance → national emergency number (**112 in India**) → site head.
- Define a `Notifier` interface with a **simulated implementation** (writes to a "dispatch log" and shows on a mock dispatcher screen at `/admin/dispatch`) and a stub for Twilio SMS/call, to be swapped in later. The payload: location, severity, photo, time, nearest assembly point.
- **Do not claim integration with real police/ambulance systems.** State clearly in the UI and docs that dispatch is simulated.

### H. Low-network mesh (Vision only)
- Do not implement. Write `docs/roadmap-mesh.md`: the offline queue is the real feature; a phone-to-phone Bluetooth mesh would need native apps (e.g. Android Nearby Connections or a mesh SDK) or LoRa devices, because browser-based Web Bluetooth cannot do background mesh and is not supported in iOS Safari. Mark that as general knowledge to verify before promising it.

### I. Written deliverables (`docs/`)
Create and keep updated as features land:
- `docs/risk-analysis.md` — 5–6 hazards, 5×5 risk matrix (likelihood × severity), before/after score for the hero risk, controls using the hierarchy of controls (eliminate, substitute, engineer, administrative, PPE).
- `docs/implementation-plan.md` — a 30-60-90 day pilot on one line: week-by-week actions, roles, training, no-blame policy, supervisor behaviour, rollout criteria.
- `docs/metrics.md` — every KPI with definition, formula, data source, target, and how it is measured; includes employee feedback loop.
- `docs/eco-impact.md` — how safety fixes cut energy/material/water loss; every number sourced or labelled as an assumption in `assumptions` config.
- `docs/privacy-and-ethics.md` — anonymity, camera safeguards, data retention, worker consultation.
- `docs/limitations.md` — honest list of what is simulated or unvalidated.
- `docs/demo-script.md` — a 5-minute demo walkthrough.

## 4. Tech stack and repo layout

- Monorepo. `apps/web` (React + Vite + TypeScript, PWA, Tailwind, `react-i18next`), `functions/` (Firebase Cloud Functions, TypeScript), `services/vision/` (Python), `docs/`, `scripts/seed`, `firebase.json` and emulator config.
- I know React, Firebase and Python well; keep the code idiomatic and boring. Prefer few dependencies. Strict TypeScript. Format with Prettier/ESLint; Python with `ruff`.
- A single `npm run dev` (or `make dev`) should start emulators + web app. Provide `npm run seed` to load a **fictional "Demo Plant — Line 3"** with locations (Filler, Capper, Labeller, Case packer, Forklift lane, Raw-material store), sample reports across 8 weeks, and sample camera events.
- **Branding:** use a generic fictional plant name. Do not use L'Oréal logos or marks, and do not imply endorsement.

## 5. Quality bar and acceptance criteria

The MVP is "done" when all of these pass in a live demo with emulators and no internet:
1. Scan (or open) a QR URL on a phone-sized viewport → submit a report with icon + photo + voice note in under 30 seconds.
2. Report appears on the admin inbox with a severity score **and a visible reason**, and an eco-tag when relevant.
3. Admin assigns/closes an action; the change shows on `/board` within seconds.
4. Run the vision service on a demo video → a forklift–person near-miss and a hand-in-zone event appear on the dashboard with pixelated snapshots; confirming/dismissing works.
5. Dashboard KPIs compute correctly from seed data (add unit tests for KPI functions and triage rules).
6. Lighthouse PWA/accessibility basics pass; the worker app is usable one-handed on a small phone; text is readable on a plant floor (high contrast).
7. `docs/` files exist and match what the app actually does.

## 6. Hard constraints and ethics

- **Privacy by design:** anonymous worker reports by default; no face storage; blur people in saved images; no per-person scoring or leaderboards; camera data processed locally; events aggregated by zone/shift.
- **Honesty:** label anything simulated (dispatch, machine "running" signal, savings estimates, demo accuracy) as simulated/estimated in both UI and docs. Do not invent statistics. Any number in docs must cite a source or be flagged as an assumption.
- **No secrets in git.** Provide `.env.example`. Use the emulator by default.
- Do not scrape, and do not download datasets or models without telling me the licence.
- Do not add Vision-tier items to the build.

## 7. Working agreements (how I want you to work)

1. **Step 0 — Ask me first (once, briefly):** (a) the submission deadline and how many people are building, (b) whether I have a demo video or camera footage of a forklift aisle or filling line (if not, you will find or generate placeholder footage options for me to supply), and (c) which language(s) beyond English/Hindi I want. Then proceed with sensible defaults if I don't answer.
2. **Plan before coding:** write `PLAN.md` with milestones. `AGENTS.md` already exists in the repo root (standing rules); keep it under 12,000 characters and update its run commands and conventions as the project grows. Keep both updated.
3. **Milestones** (finish and demo each before the next; commit at each):
   - M0 Scaffold: monorepo, emulators, CI-style lint/test scripts, seed script.
   - M1 Data model + security rules + triage function with tests.
   - M2 Worker app (QR flow, form, voice, photo, receipt).
   - M3 Admin dashboard + floor-plan hotspot map + actions.
   - M4 `/board` closed-loop display.
   - M5 Vision service, two MVP rules, pixelated events, confirm/dismiss.
   - M6 `docs/` completed against the real implementation + demo script.
   - M7 (P2) Offline queue, then emergency router (simulated), then extra vision rules.
4. Small, reviewable commits with clear messages. Run tests and linters before saying a milestone is done. Tell me exactly how to run and verify each milestone.
5. When a choice is genuinely mine to make (scope, trade-offs, licences, anything costing money), ask with options and a recommendation. Otherwise decide, and note the decision in `PLAN.md`.
6. If something in this brief is wrong, infeasible, or conflicts with itself, say so plainly and propose a fix rather than quietly working around it.
7. Be concise in chat. Put detail in files.

Now begin with Step 0.
