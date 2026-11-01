# Limitations

An honest list of what is simulated, assumed or unvalidated. If a claim is not here as validated, it is not.

## Simulated (clearly labelled in the UI and docs)
- **Emergency dispatch** (`/admin/dispatch`): no real police, ambulance or national-number integration; nothing is sent or dialled. The Twilio notifier is a stub.
- **Machine "running" signal** for the camera rules: a flag/endpoint/schedule, not a PLC or stack light.
- **Lockout-confirmed KPI**: a simulated value (`assumptions`), no real checklist or sensor.
- **Estimated savings**: placeholders in `assumptions`; no measured kWh or material.
- **All data**: the fictional "Demo Plant — Line 3" and seed data are synthetic. No L'Oréal data, logos or marks are used; the plant name is generic.

## Assumed (judgement calls, not calibrated to any plant)
- Hero risk = jam clearing and changeovers on packaging lines; secondary = forklift–pedestrian. From general industry sources, not L'Oréal data.
- Risk matrix scores in `docs/risk-analysis.md` and the "after" targets.
- **Triage weights:** base severity by hazard (1–3), +1 serious-harm flag, +1 location risk weight ≥ 1.5, +1 severe keyword; action due dates 1/3/7 days; owner teams.
- Severe-keyword and eco-keyword lists (English, Hindi, Hinglish) are hand-written, crude, and not validated with workers. They can mis-fire (e.g. "stuck" in a harmless sentence) or miss spellings and dialect.
- Shift boundaries (A 06–14, B 14–22, C 22–06), headcount 40, repeat-hotspot rule (3 in 28 days), pulse minimum group 5, board delay 48 h, snapshot retention 30 days.
- `injuryNow` does not change the severity score; it only selects the (simulated) emergency route.

## AI and camera
- **No accuracy has been measured.** The only test clip is a *plumbing test*: a static sample photo (Ultralytics `bus.jpg`) of people beside a bus (bus as forklift stand-in), repeated for 6 s. It proves the pipeline works end to end, nothing more. **No real plant or forklift footage was available.**
- COCO `truck`/`bus` is a weak stand-in for a forklift. The Hugging Face forklift model was not tried: its card declares no licence. PPE detection is not implemented (public PPE datasets are mostly construction, and results are expected to drop on cosmetics-line footage).
- 2D image geometry: a pixel gap means different distances at different depths. Calibrate per camera. A fixed overhead or angled camera view is assumed.
- Wrist keypoints can be occluded or swapped; the hand-in-zone rule needs a clear view.
- Pixelation relies on the detector: a missed person is not blurred. Snapshots should be reviewed before sharing.
- The published accuracies we cite in `docs/CONTEXT.md` are on the authors' own datasets, not ours. Vendor marketing figures ("94% fewer near-misses") were deliberately not used.
- Licences: Ultralytics is AGPL-3.0 (fine for the demo; production needs an Apache/MIT detector such as RF-DETR or YOLOX, or an enterprise licence). SH17 is CC BY-NC-SA 4.0 (non-commercial) and is not used.

## Platform
- Runs on the Firebase **emulators** only (offline, no billing). Cloud Functions in production need the paid Blaze plan; nothing was deployed or tested against real Firebase. Security rules are tested in the emulator.
- Scheduled cleanup (board delay, snapshot retention, escalation timers) exists as staff-only callables; scheduling them is a production step. The dispatcher screen calls the escalation advance while it is open.
- **Offline queue:** reports are queued in IndexedDB and retried while the app is open or when the browser comes back online. We do **not** use the Background Sync API, so a report queued on a phone that is then closed is sent next time the app is opened. A retry after a lost acknowledgement is treated as "already sent" on a permission-denied reply, which could in rare cases hide a real denial.
- **Storage rules** are create-only for worker uploads, but the Storage emulator allowed a second upload to the same path in our test, so overwrite protection is **not verified** (one test is left as a `todo`).
- **Voice:** audio is always stored. Transcription uses the browser Web Speech API only when supported **and** online; Hindi support varies by browser and usually needs a connection. Otherwise the UI shows "Not transcribed (audio saved)". Safari/iOS support differs; not tested on devices.
- **QR stickers** are printed via the browser (Print → Save as PDF), not generated server-side. Phones need to reach the dashboard host on the network (the sticker app picks the Wi-Fi address; change it on its page if needed).
- **Accessibility/PWA:** manual checks only (high contrast, large targets, one-handed layout). A Lighthouse run is documented in the README if performed; no certification is claimed.
- Not built, by design: Bluetooth mesh relay (roadmap only, `docs/roadmap-mesh.md`).
- Not tested on a real mid-range Android phone on a plant network.

## Eligibility and scope
The competition lists mechanical, chemical, electrical, food-tech, metallurgy and production disciplines. Our team is software and communications heavy; confirm eligibility with the organisers
and consider a mechanical/production teammate to validate the risk analysis (CONTEXT §1). No judging weights or dates were found publicly; we invent none.

## Auto-report mode (camera)
`--auto-report` (`npm run cv:webcam`, `npm run cv:demo`) skips the human confirm step on request of the team: each detection becomes a triaged report at once, marked `reviewedByRole: auto`. This departs from the default (every auto-detected event needs human confirm/dismiss) and **will produce false alarms** because no accuracy has been measured. Use review mode (`npm run cv:webcam:review`) for anything beyond a demo.
