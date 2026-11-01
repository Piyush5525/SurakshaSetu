# Safer Work, Better Work: "Scan · Speak · See"

Hackathon entry for *Option 01: Safer Work, Better Work*. A near-miss and hazard reporting system for a cosmetics plant: **workers scan a QR sticker, speak or tap, and see what changed**.
Built around one hero risk (**clearing jams and changeovers on filling/packaging lines**, our assumption, not L'Oréal data) plus forklift–pedestrian conflict.
Fictional **Demo Plant — Line 3**; no real-company branding, data or endorsement. Everything runs offline on the Firebase emulators (no billing).

| Part | Where | What |
|---|---|---|
| Worker PWA | `apps/web` `/r/:locationId` | QR → icon + voice note + photo, anonymous, EN/HI, offline queue, receipt, 1-tap pulse |
| Backend | `functions/`, `firestore.rules`, `storage.rules` | rules-tested access, explainable triage (severity + reason, eco-tag), actions, public board projection, simulated escalation |
| Admin dashboard | `/admin` | inbox with severity reason, actions, KPIs, floor-plan hotspots, camera events, QR stickers, simulated dispatch |
| Public board | `/board` | "You said, we did", readable from 3 m, no login, no private data |
| Camera service | `services/vision` | pretrained YOLOv8 + supervision: forklift near miss, hand in danger zone, pixelated snapshots, human confirmation |
| Docs (graded) | `docs/` | risk analysis, implementation plan, metrics, eco impact, privacy, limitations, demo script |

## Run it
Prerequisites: Node 20+, **Java 21+ on PATH** (Firebase emulators), Python 3.11+ (vision only).
```
npm install
npm run dev        # emulators (UI http://localhost:4000) + web http://localhost:5173
npm run seed       # second terminal, once the emulators are ready: synthetic plant, 8 weeks of reports
```
Open `http://localhost:5173/r/filler` (worker, phone-size), `/admin` (staff: `supervisor@demo.local` or `ehs@demo.local`, password `demo1234`, emulator only), `/board`.
To open it on a phone, use your computer's network address (print QR stickers from `/admin/stickers` after setting that base URL).

Camera demo (optional): see `services/vision/README.md` (plumbing-test clip, or your own footage).

## Verify
```
npm run lint && npm run typecheck && npm test      # 62 unit tests (triage, board, KPI, escalation, retention, pulse)
npm run test:rules                                  # 23 security-rules tests (stop `npm run dev` first: same ports)
npm run smoke                                       # with dev + seed running: Cloud Function triggers end to end
python scripts/e2e/ui_flow.py [screenshot_dir]      # Playwright + Chrome: worker -> inbox -> board -> camera -> dispatch
cd services/vision && python -m pytest && ruff check .   # 19 vision tests (no model needed)
```
Lighthouse (mobile, `/r/filler`, production build): accessibility 100, best practices 100 (PWA category no longer exists in Lighthouse 12; the app has a manifest, icons and an app-shell service worker).

## Notes
- Cloud Functions in production need a paid Firebase plan (Blaze); the demo is emulator-only. `.env` is gitignored; `.env.example` lists the optional variables.
- Optional LLM triage (`TRIAGE_LLM`) is **not built**; rules-based triage is the only path and is fully explainable. No LLM key was available.
- Honest limitations are in `docs/limitations.md`: no real plant footage, no measured accuracy, simulated dispatch, machine signal, lockout KPI and savings.
- Licences: Ultralytics YOLO is AGPL-3.0 (fine for the demo). SH17 (CC BY-NC-SA) is not used. The Hugging Face forklift model declares no licence and is not used.
- Docs: [PLAN.md](PLAN.md) · [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md) · [docs/CONTEXT.md](docs/CONTEXT.md) · [docs/data-model.md](docs/data-model.md)
