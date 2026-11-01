# Architecture

## One backend, one database
`backend/` (FastAPI + SQLite, WAL) is the only service that owns incidents. The QR sticker app, the worker portal, the admin control centre and the CV worker are all clients of its REST/WebSocket API. SQL is plain and portable: moving to PostgreSQL means swapping `backend/app/db.py` (JSON blobs are TEXT `*_json` columns).

Tables: `incidents`, `status_history`, `evidence`, `notifications`, `responders`, `assets` (machines + QR tokens + map position + risk weight), `cameras` (also microphones), `detector_settings`, `users`, `audit_log`, `events_raw` (every AI event before it becomes an incident).

## Incident model
Every source creates an incident through `services/incidents.create_incident`: category (12), description, source (`qr | portal | cctv | audio | admin`), site/building/floor/zone, machine/camera/audio id, timestamps, evidence, AI model/version/class/**confidence** (separate from severity), **severity 1-5 with a stored reason list**, department, responder, status, investigation notes, root cause, corrective + preventive action, acknowledged/resolved/closed timestamps, and a `simulated` flag for sample/simulated data.

**Lifecycle:** reported → analysed → alerted → acknowledged → assigned → in_progress → resolved → closed; side states rejected, false_positive, duplicate, escalated. Invalid jumps are refused (`domain.can_move`).

**Severity** = base by category + serious-harm flag + high-risk location + severe keyword (English, Hindi, Hinglish), clamped 1-5, every step listed. Model confidence never changes severity; managers can override it (logged). `injury_now` selects the emergency route but does not change severity.

**Routing** (`domain.DEPARTMENT_BY_CATEGORY` + secondary): machinery → Maintenance/EHS, chemical → EHS, fire → EHS/Security, quality → QA, lab → Laboratory/QA, storage/warehouse → Warehouse/EHS, logistics → Logistics, waste → Waste Management/EHS, security → Security. Assignment checks department and availability, never distance.

## Alerts
`services/notify.py`: on creation the department's responders (and the default chat) get a Telegram message with id, category, severity, location, time and a dashboard link (no images by default). Severity ≥ 4 also triggers a voice call to the on-call number. A critical incident nobody acknowledges within `ESCALATE_AFTER_S` is escalated once (managers + call). Every attempt is logged in `notifications` with status `sent | simulated | blocked | failed`, escalation level and acknowledgement time. `DEMO_MODE=true` (default) simulates everything.

## Security and privacy
Login-free reporting is rate-limited, size/type-checked (extension **and** MIME) and the machine is resolved server-side from an opaque QR token. Staff endpoints use JWT roles `worker < responder < manager < admin`; department users see only their department. Evidence is served through short-lived signed links, kept for `EVIDENCE_RETENTION_DAYS`, then purged. All privileged actions are written to `audit_log`. Reporter tracking uses a secret code held on the reporter's phone, so anonymous reporters can follow their report. The board shows only fixed items with a public update, no reporter data. Camera previews, snapshots and clips pixelate people before anything leaves the worker; there is no face or emotion recognition and no per-person scoring.

## Real time
Backend publishes `incident.created / incident.updated / notification / camera / ai_event` over `/api/ws` (staff token required). The admin app refetches on every event, so new incidents appear without a manual refresh.

## CV worker pipeline (`3-auto-cv/vision_service/worker.py`)
frame → person/vehicle pre-pass (YOLOv8n) → each enabled plugin → **N-of-M confirmation** (default 3 of 5; fall/violence use their own) → cooldown → pixelated best frame + ~7 s pixelated clip → `POST /api/worker/detections`. The backend re-checks that the detector is enabled and above its confidence, de-duplicates against open incidents for the same camera/class, stores model name/version/class/confidence, and creates the incident. Plugins live in `plugins.py`; adding a model = one class + one catalogue entry (`backend/app/detectors_catalog.py`). Detectors can be toggled and tuned live from the dashboard.
