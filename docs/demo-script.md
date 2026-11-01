# Demo script (6 minutes)

**Setup:** `npm run dev` (API :8000, site :5173, sticker app :5174); the first start seeds machines and demo logins. Optional: `npm run seed` for 40 labelled sample incidents. Optional camera, in a second terminal:
`cd 3-auto-cv && python -m vision_service.worker --source cam-store=../demo-assets/fire.mp4 --detectors fire --loop --realtime`.
Open a phone-size browser on a sticker link (print stickers from **Admin → Machines & QR**; scan with a phone on the same Wi-Fi), the control centre `/admin` (`admin` / `demo1234`) on the big screen, and `/board` on a second screen.
Notifications are **simulated** (purple banner) unless `DEMO_MODE=false`; say so.

| Time | Say / do                                                                                                                                                                                                                                                                         | Shows                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 0:00 | "Workers under-report near misses: fear of blame, hassle, and reports that go nowhere. One platform fixes the three." Hero risk (our assumption): clearing jams and changeovers on packaging lines.                                                                              | Problem                               |
| 0:30 | **Module 1, QR sticker.** Scan the sticker on the Filler. The form already knows the machine. Tap ✋ Jam, type a line, add a photo, tick "could have been hurt badly", **Send**. Under 30 s, no login. Toggle Hindi. Show the reference number.                                   | QR → machine, anonymous, EN/HI        |
| 1:15 | Turn the network off, send another: "Waiting to send"; back online → sent by itself.                                                                                                                                                                                             | Offline queue                         |
| 1:40 | **Module 2, worker portal.** `/` → **Report an incident**: choose machine, category, details, photo. Open **My reports**: status steps and the team's update.                                                                                                                    | Portal + tracking                     |
| 2:10 | **Module 3, control centre.** The new incident appears **without refreshing**. Open it: severity **with its reason**, evidence, department, the simulated Telegram/call log. Acknowledge → assign a responder (same department, available only) → in progress.                    | Explainable triage, routing, workflow |
| 3:00 | Resolve with a public update, then **Close**. The reporter's phone shows the update; `/board` shows it ("You said, we did").                                                                                                                                                     | Closed loop                           |
| 3:40 | **Live monitoring.** With the worker running, the camera tile is LIVE (people pixelated). A fire event arrives: incident with model name, confidence, pixelated frame and clip, critical alert. Show the model table with maturity labels; switch a detector off; set min confidence. | CV pipeline, honesty                  |
| 4:30 | **Audio and simulator:** "No real audio model is connected, so these are labelled SIMULATED." Trigger a scream and a violence event: both say "human verification required".                                                                                                    | Audio module, human in the loop       |
| 5:00 | **Escalation:** leave a critical incident unacknowledged; after the delay it escalates (managers + call, simulated). **Factory map** (heat = incidents, pins = open), **Analytics** (acknowledge/resolve times, false-positive rate, repeat locations).                          | Escalation, map, analytics            |
| 5:40 | Close: limitations are in `docs/limitations.md`: fall and violence are experimental, spill/PPE zero-shot, no accuracy measured, no real police/ambulance integration. Ask for worker consultation before cameras.                                                                | Wrap-up                               |

## If something fails

- API not reachable: check the `[api]` lines of `npm run dev`; run `pip install -r backend/requirements.txt`.
- Phone cannot open the sticker: set your PC's Wi-Fi address in **Machines & QR** and reprint; both devices on the same network; allow ports 5174 and 8000 in the Windows firewall.
- No camera tile LIVE: the worker is not running, or the camera has no source; pass `--source CAM=VIDEO`.
- Real alerts wanted: set `DEMO_MODE=false` and the Telegram/OmniDimension variables in `.env`, restart, press **Send test telegram** first.

## Verification before presenting

`npm test`, `cd 3-auto-cv && python -m pytest`, `npm run e2e` (with `npm run dev` running).
