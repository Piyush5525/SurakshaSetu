# L'ORÉAL Industrial Safety Operations Centre (hackathon prototype)

_Scan · Speak · See._ One incident platform for a fictional cosmetics plant, **Demo Plant — Line 3**. It is a hackathon prototype: **not an official L'Oréal product**, no L'Oréal logos or marks, and no real L'Oréal incident data. Three ways in, one central backend, one incident database:

| #   | Folder               | Port   | Experience                                                                                                                                                                                       |
| --- | -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `1-sticker-app`      | 5174   | **QR reporting.** A sticker on each machine opens a 3-step report with the machine already filled in. No login, English/Hindi, photo/video/voice, offline queue, access code for tracking.        |
| 2   | `2-user-report-site`  | 5173   | **Worker portal** (report in 5 guided steps, track by plain-language progress, emergency guidance, public "You said, we did" board) and the **Control Centre** at `/admin` (12 sections, below). |
| 3   | `3-auto-cv`          | worker | **Camera/CV worker.** Nine detector capabilities on cameras, video files or a webcam; confirmed, pixelated events go to the backend.                                                              |
| –   | `backend`            | 8000   | **Central FastAPI backend** (SQLite): incidents, workflow, roles, evidence, Telegram/voice alerts, escalation, analytics, WebSocket, sticker rendering. API docs at `/api/docs`.                  |

**Control Centre sections:** Overview (10 defined KPIs, trend by source, severity, category, department, hotspots, click-through to filtered lists) · Live CCTV (dark workspace: grid 1/2/4/9, expanded view with filmstrip, prev/next, full screen, event timeline and event-clip playback, overlays) · AI Monitoring (evidence-frame cards, verify / false positive) · Incidents (filters saved in the URL, case management) · QR Management (4 printable sticker templates, PNG/PDF, scan history, disable/regenerate) · Factory Map · Audio Monitoring (simulated, labelled) · Responders and departments · Analytics · Investigations · Model Configuration · Settings (alert routing by category and severity, verified public data and sources).

```
QR report / worker portal / CCTV detection / audio detection
   -> backend (one incident table) -> triage (severity + reason) -> department routing
   -> Telegram (+ voice call) alert -> responder assignment -> acknowledge -> investigate -> resolve -> close
   -> analytics, public board
```

## Run it (Windows, macOS, Linux)

Prerequisites: Node 20+, Python 3.11+. No Java, no Firebase, no paid services.

```
npm install
pip install -r backend/requirements.txt        # the start script also does this once if needed
npm run dev          # API :8000, user site :5173, sticker app :5174  (first start seeds machines + demo logins)
npm run seed         # optional: 40 synthetic past incidents (flagged SAMPLE data) so analytics have content
```

- Demo cameras (sample videos through the real pipeline, labelled "SAMPLE VIDEO · SIMULATED FEED"): in a second terminal `npm run demo:cameras`.
- Worker portal: <http://localhost:5173> · Sticker app: <http://localhost:5174> · Public board: `/board` · API docs: <http://localhost:8000/api/docs>
- Control centre: <http://localhost:5173/admin>. Demo accounts (local only): `admin`, `manager.ehs`, `responder.maint`, password `demo1234`.
- **Phones:** put phone and PC on the same Wi-Fi. In **Admin → Machines & QR** set the address to your PC's Wi-Fi IP (it suggests one), then download the sticker PDF. Phones cannot open `localhost`.
  Browsers only allow the microphone over HTTPS, so on plain `http://` the voice button may be refused; photo, video and typed details still work.

## Camera / CV worker

```
pip install -r 3-auto-cv/requirements.txt
cd 3-auto-cv
python -m vision_service.worker --source cam-store=../demo-assets/fire.mp4 --detectors fire --loop --realtime   # video file
python -m vision_service.worker --source cam-line3=0                                                           # laptop webcam
python -m vision_service.worker                                                                                # every camera registered in the dashboard
```

The nine capabilities (**Admin → Computer vision**: model status, counters, enable/disable, confidence, camera assignment, zones, routing). Every one only creates a _potential_ event that goes to the central incident engine; none sends alerts itself.

| #   | Capability                    | Source / weights                                                                       | Status                                                                  |
| --- | ----------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Fire + smoke                  | your `best_nano_111.pt` (Fire, Smoke)                                                  | **trained, verified** on `fire.mp4`                                     |
| 2   | Fall                          | pose rules (your repo)                                                                 | heuristic; no fall clip to test                                         |
| 3   | Violence                      | pose gate + CLIP (your repo)                                                           | heuristic; missed the one fight clip; human verification                |
| 4   | Machinery proximity           | tracked people + configured danger zone + running state                                | rule; verified on a people video; running signal simulated              |
| 5   | Chemical / liquid leak        | `MSunusi/pipeline-leak-detection` (gas, leak, water; `no leak` ignored)                | loads, runs; pipeline domain, no positive sample                        |
| 6   | Falling / displaced boxes     | SDG `The_Box` detector + ByteTrack + motion rules (the requested repo has no weights)  | stop-gap; rules unit-tested, not tested on real falls                   |
| 7   | Forklift-pedestrian proximity | `sounak-sarkar-gwc/Forklift-pedestrian-proximity` (forklift, person) + ByteTrack       | **verified on frames**; SAFE/CAUTION/CRITICAL; metres need calibration  |
| 8   | Damaged packaging             | `package-defect-detector` (dent, dirt, hole) + SDG two-stage (Stain, Puncture)         | **verified on samples**; visible damage only                            |
| 9   | Improper waste disposal       | `siyad23/waste-sorting-model` (19 classes, 4 groups) + bin zones                       | loads, runs; no positive sample; needs configured bins                  |
| +   | PPE, hand-in-zone, aisle      | YOLO-World zero-shot / pose wrist rules                                                | experimental                                                            |
| +   | Audio (alarm, scream, glass)  | none connected                                                                         | **simulated only**                                                      |

Full evaluation, real class names and limits: [docs/model-evaluation.md](docs/model-evaluation.md). Weight credits and licences: `3-auto-cv/models/third_party/SOURCES.md` (weights are not in git).

Categories without a reliable detector stay manual-report only (production quality, lab contamination, logistics) and are marked "AI pending". Ordinary CCTV cannot identify a spill's chemical or confirm product or lab contamination.

## Alerts (Telegram and voice call)

Everything is **simulated** until you set `DEMO_MODE=false` in `.env` (see `.env.example`). The dashboard banner always shows the current mode, and **Admin → Notifications → Send test telegram / call** sends one labelled test message. Voice calls need `CALLS_ENABLED=true`, go only to `ALERT_PHONE_NUMBER` / `CALL_ALLOWLIST`, and **never** to emergency-service numbers (100, 101, 102, 108, 112, 911…): we do not integrate with police or ambulance services.

## Verify

```
npm run lint && npm run typecheck          # web apps
npm test                                   # web unit tests + 28 backend tests
cd 3-auto-cv && python -m pytest && ruff check .     # 40 vision tests (rules + real-weight model tests)
npm run dev  (one terminal)   then   npm run e2e     # Playwright + Chrome: QR, portal, offline, live dashboard, workflow, board, CV post
```

## Docs

[docs/architecture.md](docs/architecture.md) · [docs/limitations.md](docs/limitations.md) · [docs/privacy-and-ethics.md](docs/privacy-and-ethics.md) · [docs/integration-audit.md](docs/integration-audit.md) · [docs/demo-script.md](docs/demo-script.md) · [PLAN.md](PLAN.md)

The first Firebase-emulator backend is archived in `legacy-firebase/`.
Licences: Ultralytics YOLO / YOLO-World is AGPL-3.0 (fine for a demo; production needs an enterprise licence or a permissive detector). OpenAI CLIP is MIT. Your fire weights and the source repo's demo clips have no licence on record and are kept out of git.
