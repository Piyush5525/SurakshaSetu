# Safer Work, Better Work: Scan · Speak · See

One incident platform for a (fictional) cosmetics plant, **Demo Plant — Line 3**. Three ways in, one central backend, one incident database:

| # | Folder | Port | What it is |
|---|---|---|---|
| 1 | `1-sticker-app` | 5174 | **QR sticker reporting.** A sticker on each machine opens a one-screen form for _that_ machine (no login, EN/HI, photo/video/voice, offline queue). |
| 2 | `2-user-report-site` | 5173 | **Worker portal** (report from anywhere, track status, "You said, we did" board) and the **admin control centre** at `/admin` (live monitoring, incidents, map, QR management, alerts, analytics). |
| 3 | `3-auto-cv` | worker | **Camera/CV worker.** Runs detector plugins on cameras, video files or a webcam and posts confirmed, pixelated events to the backend. |
| – | `backend` | 8000 | **Central FastAPI backend** (SQLite): incidents, workflow, roles, evidence, Telegram/voice alerts, escalation, analytics, WebSocket. API docs at `/api/docs`. |

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

Detectors (see **Admin → Live monitoring**, where each can be switched off and its confidence set):

| Detector                                 | Method                                                          | Maturity                                                                              |
| ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `fire` (fire + smoke)                    | your trained `best_nano_111.pt` (classes verified: Fire, Smoke) | **trained**; seen working on `fire.mp4`                                               |
| `fall`                                   | pose rules (ported from your repo)                              | heuristic; no real fall clip available to test, accuracy unknown                      |
| `violence`                               | pose gate + CLIP (ported)                                       | heuristic; **missed** the one fight clip available; always needs human verification   |
| `forklift_person`, `hand_in_zone`        | YOLOv8 + geometry rules inside configured zones                 | rules; machine-running signal is simulated                                            |
| `ppe`, `spill`, `blocked_aisle`, `waste` | YOLO-World zero-shot                                            | experimental, zone-gated, no measured accuracy                                       |
| audio (alarm, scream, glass, impact)     | none connected                                                  | **simulated only**, labelled                                                          |

Categories without a reliable detector stay manual-report only (production quality, lab contamination, logistics) and are marked "AI pending". Ordinary CCTV cannot identify a spill's chemical or confirm product or lab contamination.

## Alerts (Telegram and voice call)

Everything is **simulated** until you set `DEMO_MODE=false` in `.env` (see `.env.example`). The dashboard banner always shows the current mode, and **Admin → Notifications → Send test telegram / call** sends one labelled test message. Voice calls need `CALLS_ENABLED=true`, go only to `ALERT_PHONE_NUMBER` / `CALL_ALLOWLIST`, and **never** to emergency-service numbers (100, 101, 102, 108, 112, 911…): we do not integrate with police or ambulance services.

## Verify

```
npm run lint && npm run typecheck          # web apps
npm test                                   # web unit tests + 21 backend tests
cd 3-auto-cv && python -m pytest && ruff check .     # 24 vision tests
npm run dev  (one terminal)   then   npm run e2e     # Playwright + Chrome: QR, portal, offline, live dashboard, workflow, board, CV post
```

## Docs

[docs/architecture.md](docs/architecture.md) · [docs/limitations.md](docs/limitations.md) · [docs/privacy-and-ethics.md](docs/privacy-and-ethics.md) · [docs/integration-audit.md](docs/integration-audit.md) · [docs/demo-script.md](docs/demo-script.md) · [PLAN.md](PLAN.md)

The first Firebase-emulator backend is archived in `legacy-firebase/`.
Licences: Ultralytics YOLO / YOLO-World is AGPL-3.0 (fine for a demo; production needs an enterprise licence or a permissive detector). OpenAI CLIP is MIT. Your fire weights and the source repo's demo clips have no licence on record and are kept out of git.
