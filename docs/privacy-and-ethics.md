# Privacy and ethics

Principle: people will only report, and accept a camera on the line, if they trust that the system cannot be used against them. Privacy is a prerequisite,
not a feature (CONTEXT §4.5, privacy-preserving CV case studies).

## Worker reporting
- **Anonymous by default.** No login. The app signs in with an anonymous Firebase session that is never written to a report. No uid, IP or device id is stored.
- An optional name (≤ 60 chars) is visible to staff only and never copied to the public board.
- Workers cannot read reports, even their own (rules). They follow progress on the public board via an unguessable report ID kept on their phone (the "your report" highlight is local).
- **Pulse feedback** has no link to a report; groups below 5 answers are hidden, so a small shift cannot be singled out.
- **Photos** are staff-only, but a photo could contain a face. The form tells workers to keep faces out. We do not blur worker photos automatically (limitation).
- The public board shows hazard icon, location, status, day and shift, and a staff-written fix text. It **never** shows time of day, severity, the serious-harm flag, the injury flag, transcripts, audio or photos.
  Reports are held off the board until work starts or 48 h pass (configurable), so an unreviewed report is not exposed at once.

## Camera safeguards
- Pretrained models, processed locally; no cloud video. Raw frames never leave memory.
- **People are pixelated before saving**, with a lower detection threshold for blurring than for alerting, expanded boxes and a downscaled image. A missed person is a leak risk, so snapshots should be reviewed.
- No face recognition, no identification, no tracking across cameras or days. ByteTrack IDs exist only inside one running session to smooth detections and are never stored.
- Events are by zone and shift. A **human confirms or dismisses every event**; a dismissed event keeps only the verdict (snapshot and detection details removed immediately).
- Alerts only for sustained, high-confidence conditions. False alarms destroy trust, so we favour precision.
- **Retention:** pixelated snapshots deleted after 30 days (assumption, configurable `snapshot_retention_days`). Production would run this on a schedule.
- **No discipline use.** Camera data must not be used to discipline individuals; this must be in the signed policy before go-live.

## Worker consultation
Worker representatives are consulted before any camera is placed: what it sees, what is stored, who can see it, for how long, and how to switch it off. In India, check applicable
law (for example data-protection and labour requirements) with the plant's legal team; this repo is not legal advice **[general knowledge, verify]**.

## Fairness and safety of the AI
- Models are pretrained on general datasets and untested on this plant's people, clothing, lighting and cameras; error rates will differ across conditions. We report no accuracy figures (`docs/limitations.md`).
- The app never claims to call emergency services; dispatch is simulated and labelled so everywhere in the UI and docs.
- Severity is rules-based with a visible reason; it is advisory, and staff can always override by dismissing or re-reading a report.

## Data we hold (summary)
| Data | Who can read | Retention |
|---|---|---|
| Reports (incl. optional name, transcript, audio, photo) | supervisors, EHS | plant policy (not set by the demo) |
| Board items | anyone | while the report is on the board |
| Feedback (score, location, shift, week) | EHS admins (aggregates shown ≥ 5) | plant policy |
| Camera events | supervisors, EHS | snapshot 30 days; verdict kept |
| Auth sessions | Firebase Auth | anonymous sessions have no personal data |

## Licences and data sources
Ultralytics YOLO is AGPL-3.0 (fine for the demo; production needs an Apache/MIT detector or an enterprise licence). SH17 is CC BY-NC-SA 4.0 (non-commercial) and is **not used**.
The Hugging Face forklift model declares no licence and is **not used** by default. No dataset was scraped or downloaded.
