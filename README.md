# Safer Work, Better Work: "Scan · Speak · See"

Hackathon entry for *Option 01: Safer Work, Better Work*. A near-miss and hazard reporting system for a cosmetics plant: **workers scan a QR sticker, speak or tap, and see what changed**.
Built around one hero risk (**clearing jams and changeovers on filling/packaging lines**, our assumption, not L'Oréal data) plus forklift–pedestrian conflict.
Fictional **Demo Plant — Line 3**; no real-company branding, data or endorsement. Everything runs offline on the Firebase emulators (no billing).

| Part | Where | What |
|---|---|---|
| Worker PWA | `2-user-report-site` `/r/:locationId` | QR → icon + voice note + photo, anonymous, EN/HI, offline queue, receipt, 1-tap pulse |
| Backend | `functions/`, `firestore.rules`, `storage.rules` | rules-tested access, explainable triage (severity + reason, eco-tag), actions, public board projection, simulated escalation |
| Admin dashboard | `/admin` | inbox with severity reason, actions, KPIs, floor-plan hotspots, camera events, simulated dispatch |
| Public board | `/board` | "You said, we did", readable from 3 m, no login, no private data |
| Camera service | `3-auto-cv` | pretrained YOLOv8 + supervision: forklift near miss, hand in danger zone, pixelated snapshots, human confirmation |
| Docs (graded) | `docs/` | risk analysis, implementation plan, metrics, eco impact, privacy, limitations, demo script |

## Three products, three folders
| Folder | What | Start alone |
|---|---|---|
| `1-sticker-app` | Print a QR sticker per machine. Scanning opens a one-screen report form for that machine on the worker's phone (http://YOUR-PC-IP:5174). | `npm run dev:sticker` |
| `2-user-report-site` | Worker site (manual report: pick machine, icon, details, photo, voice), receipt, public "You said, we did" board, staff dashboard with triage reasons and owners. | `npm run dev:site` |
| `3-auto-cv` | Camera service: YOLOv8 spots a hazard and files a report by itself. | `npm run cv:demo` / `npm run cv:webcam` |

Shared: `packages/common` (form, offline queue, language), `functions/` + `firestore.rules` (backend, triage), `scripts/` (seed, tests).
All three write to the same Firebase emulator, so a report from any of them appears in the dashboard.

## Run it
Prerequisites: Node 20+, a free JDK 21 for the Firebase emulators (the start script finds `~/.jdk/jdk-*` or `JAVA_HOME`; otherwise install Temurin 21 from adoptium.net), Python 3.11+ (camera only).
```
npm install
npm run dev        # emulators (UI :4000) + user site :5173 + sticker app :5174
npm run seed       # second terminal, once the emulators are ready: synthetic plant, 8 weeks of reports
```
- Worker site: `http://localhost:5173` (button **Report an incident**). Staff: `/admin` (`supervisor@demo.local` or `ehs@demo.local`, password `demo1234`, emulator only). Board: `/board`.
- Stickers: `http://localhost:5174` -> Print / Save as PDF. For a phone, the page uses this computer's Wi-Fi address (pick it if several are shown); phone and computer must be on the same Wi-Fi. Camera/microphone access on a phone needs HTTPS, so over plain http the voice button may be refused; the photo button and the typed details box still work.
- Camera: `npm run cv:demo` (test clip, reports appear by themselves) or `npm run cv:webcam` (laptop webcam; hand in the red zone). Add review with `npm run cv:webcam:review` (events wait for a supervisor to confirm; recommended for real use).

## Verify
```
npm run lint && npm run typecheck && npm test      # 62 unit tests (triage, board, KPI, escalation, retention, pulse)
npm run test:rules                                  # 23 security-rules tests (stop `npm run dev` first: same ports)
npm run smoke                                       # with dev + seed running: Cloud Function triggers end to end
python scripts/e2e/ui_flow.py [screenshot_dir]      # Playwright + Chrome: worker -> inbox -> board -> camera -> dispatch
cd 3-auto-cv && python -m pytest && ruff check .   # 19 vision tests (no model needed)
```
Lighthouse (mobile, `/r/filler`, production build): accessibility 100, best practices 100 (PWA category no longer exists in Lighthouse 12; the app has a manifest, icons and an app-shell service worker).

## Notes
- Cloud Functions in production need a paid Firebase plan (Blaze); the demo is emulator-only. `.env` is gitignored; `.env.example` lists the optional variables.
- Optional LLM triage (`TRIAGE_LLM`) is **not built**; rules-based triage is the only path and is fully explainable. No LLM key was available.
- Honest limitations are in `docs/limitations.md`: no real plant footage, no measured accuracy, simulated dispatch, machine signal, lockout KPI and savings.
- Licences: Ultralytics YOLO is AGPL-3.0 (fine for the demo). SH17 (CC BY-NC-SA) is not used. The Hugging Face forklift model declares no licence and is not used.
- Docs: [PLAN.md](PLAN.md) · [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md) · [docs/CONTEXT.md](docs/CONTEXT.md) · [docs/data-model.md](docs/data-model.md)
