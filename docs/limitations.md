# Limitations

An honest list of what is simulated, assumed or unvalidated. If a claim is not here as validated, it is not.

## Simulated (labelled in the UI and docs)

- **Notifications** run in `DEMO_MODE` (default): Telegram and voice-call messages are logged as `simulated`, nothing is sent. With `DEMO_MODE=false` and credentials set they are real; the dashboard banner shows which mode is active. Not tested against the live Telegram/OmniDimension services in this build (credentials were only checked for presence).
- **No police / ambulance / fire-brigade integration.** Voice calls go only to the configured on-call duty number or allowlist and never to emergency-service numbers (hard-blocked in code and tested). `injury_now` only selects the emergency _route_ inside the app.
- **Audio intelligence:** no audio model is connected. Alarm / scream / glass / impact events can only be **simulated** from the dashboard and are tagged `SIMULATED`. Loudness alone never raises an incident.
- **Machine "running" signal** for the hand-in-zone rule is a flag (`--machine-running`), not a PLC or stack light.
- **Sample data:** `npm run seed` creates 40 synthetic past incidents with `simulated=1`, shown with a SAMPLE tag and counted separately in analytics. No L'Oréal data, logos or marks; the plant is fictional.

## Computer vision: what is and is not validated

- **Fire/smoke** (your `best_nano_111.pt`; classes verified `{0: Fire, 1: Smoke}`): detected and confirmed on the one clip available (`fire.mp4`, 1 event, confidence 0.54 at confirmation). Fire confidence on that clip hovers around 0.4-0.7, so a 0.5 threshold with 3-of-5 confirmation fires late and could miss small fires. **No accuracy figures exist**; no negative footage was evaluated.
- **Fall:** ported pose rules. The source repo contains **no fall clip**, so the detector was only checked for loading and running; real-world recall and false-alarm rate are unknown.
- **Violence:** ported pose gate + CLIP. On the only fight clip available (`office_fight.mp4`) it produced **no event** (a miss), the same finding as the source repo's own notes. It is a _potential security event_ that always requires human verification and is not a substitute for machinery-accident detection.
- **Forklift-person / hand-in-zone:** rules on a general COCO detector; COCO has no forklift class (`truck` is a weak stand-in). Zones must be drawn per camera. Tested earlier only on a plumbing clip (a still photo of people beside a bus).
- **PPE, spill, blocked aisle, waste:** YOLO-World **zero-shot** prompts. They load and run, but have no measured accuracy; on an office clip PPE raised a false "no hard hat" until it was restricted to configured `ppe_required` zones. They only alert inside configured zones and always need human verification.
- **Third-party models (Models 4-9)** were trained by other people on their data (pipelines, a warehouse set, a conveyor demo, synthetic cartons, food/waste items). They load and run here and were checked on a few sample images, but **no accuracy is measured on this plant**. There is no positive sample for the leak, waste or storage detectors. Several repositories have no licence file: their weights were used locally with the owner's approval, kept out of git, and must be re-cleared before any redistribution or commercial use.
- **Forklift-pedestrian:** levels use distance and closing speed; metres are **estimates** (forklift assumed ~2 m tall) unless the camera has `calibration.px_per_m`; the basis is stored with each event. Only still frames were tested, not moving forklift footage.
- **Storage instability:** the requested repository has no weights; boxes come from a mostly synthetic-trained detector with no pallet class. A box is never "unstable" by detection alone: only a fast drop or a move from a settled place raises an event, and those rules were tested on synthetic tracks only.
- **Waste:** classification alone never alerts; bins must be configured with allowed groups, and wrong groupings depend on the model's 19 food/packaging classes (it will not recognise typical plant waste such as drums or gloves).
- **Package damage** covers visible carton damage only, not wrong quantities or contents (needs barcode/OCR/inventory data).
- **Leak:** trained on oil-and-gas pipeline images; it cannot identify a chemical and floor puddles are outside its domain. LiquidMonitorAI was tested and rejected (a false `liquid` on a dry floor).
- **Categories with no reliable detector** (production quality, laboratory contamination, distribution/logistics, most of machinery/storage/warehouse) are manual-report only, marked "AI pending". Ordinary RGB CCTV cannot identify a chemical, confirm product composition, microbial contamination or lab sample integrity; temperature/humidity needs IoT sensors.
- 2D image geometry: pixel gaps mean different distances at different depths; calibrate per camera. Keypoints can be occluded.
- **Pixelation** relies on the person detector (low threshold 0.15, boxes expanded): a missed person is not blurred. Review snapshots before sharing. Live preview is pixelated by default (`--clear-preview` disables it for authorised use).
- The source repo's demo clips have no licence/permission on record; they are kept out of git and used for local testing only.
- Licences: Ultralytics YOLO/YOLO-World is AGPL-3.0 (fine for a demo; production needs an enterprise licence or a permissive detector such as RF-DETR). OpenAI CLIP is MIT.

## Assumed (judgement calls, not calibrated to any plant)

- Severity weights, department routing, 120 s escalation delay, 30-day evidence retention, 3-of-5 confirmation, cooldowns. Severity is advisory; managers can override and the override is logged.
- Severe-keyword lists (English, Hindi, Hinglish) are hand-written and can mis-fire or miss dialect.
- Hero risk = jam clearing on packaging lines, secondary = forklift-pedestrian: from general industry sources, not L'Oréal data.

## Platform

- **SQLite**, single process: fine for a demo and a small site; use PostgreSQL and several workers for production. Background escalation runs in-process (one thread) and is lost if the server stops.
- **Auth:** demo accounts share a documented password (`demo1234`, overridable); the JWT secret is random per start unless `JWT_SECRET` is set. There is no password reset, MFA or SSO. Workers report without accounts; "My reports" uses a secret code kept on the phone (lost if the browser storage is cleared).
- **Evidence** is stored on local disk and served by short-lived signed links; not encrypted at rest. Evidence video is WebM (VP8) written by OpenCV; playback was verified by reading it back, not on every browser.
- **Offline queue:** IndexedDB, retried while the app is open or when the browser comes back online; no Background Sync API. A report queued on a closed phone sends next time the app opens.
- **Voice:** audio is always stored; transcription uses the browser Web Speech API only when supported and online. Microphone capture needs HTTPS on phones, so over plain `http://` on the LAN the voice button may be refused (photo, video and typed details still work). Not tested on real devices.
- **Telegram acknowledgement** is done in the dashboard; there are no inline buttons or webhook, so a message cannot be acknowledged from inside Telegram.
- **QR stickers** are generated server-side as PNG/PDF; phones must reach the PC on the Wi-Fi (set the address in the QR page).
- **Not built:** Bluetooth mesh relay (roadmap only, `docs/roadmap-mesh.md`), PostgreSQL migration scripts, email/SMS channels (the notifier is structured to add them), real audio model, PPE model trained on plant data.
- Not tested on a real mid-range Android phone on a plant network, nor against real CCTV/RTSP streams.

## Eligibility and scope

The competition lists mechanical, chemical, electrical, food-tech, metallurgy and production disciplines. This team is software and communications heavy; confirm eligibility with the organisers and consider a mechanical/production teammate to validate the risk analysis. No judging weights or dates were found publicly; we invent none.

## UI and demo experience
- **No continuous recording.** The CCTV timeline shows event markers and plays the short clip stored for each event; there is no recorded footage to scrub between events.
- **Camera feeds in the demo are sample videos** run through the real pipeline and labelled "SAMPLE VIDEO · SIMULATED FEED". "LIVE" is shown only for a real device (webcam/RTSP). Overlays are drawn by the worker onto the pixelated preview (amber potential, red confirmed); RTSP cameras were not tested.
- **Zone editor is a JSON box**, not a drawing tool; polygons come from `python -m vision_service.draw_zones`.
- **Tracking is per app.** A report made through the QR app is tracked in the QR app on that phone (or anywhere with the reference number and access code); the worker portal is a different browser origin with its own storage.
- **Public L'Oréal figures** (Settings → Public data) were read from search excerpts of the 2025 Universal Registration Document because the page text could not be fetched; each is flagged with how it was checked. The total factory count and ISO 45001 coverage could not be corroborated and are not shown. No real L'Oréal incident is used or implied.
- **Analytics are only as good as the data:** most incidents in a fresh demo are synthetic (flagged, and the Overview says what share). Averages mix synthetic and test records.
- **Not tested** on screen readers, on iOS Safari, or at tablet breakpoints beyond a quick visual check; contrast follows the token palette but was not audited with a tool.
