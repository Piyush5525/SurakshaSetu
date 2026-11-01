# Demo script (5 minutes)

**Setup (before the audience):** Java 21 on PATH → `npm run dev`, then in a second terminal `npm run seed`. Optionally run the vision plumbing test once (see `3-auto-cv/README.md`)
so there are camera events with snapshots. Open three windows: phone-size browser on `http://localhost:5173/r/filler`, the dashboard `/admin` signed in as `supervisor@demo.local` (password `demo1234`),
and `/board` full-screen on a second screen. Everything runs offline on the emulators; data is synthetic and the plant is fictional.

| Time | Say / do | Shows |
|---|---|---|
| 0:00 | "Workers under-report near misses: fear of blame, hassle, and reports that go nowhere. We fix those three." One line on the hero risk: clearing jams and changeovers on packaging lines (our assumption, general industry evidence). | Problem, judge Q1 |
| 0:30 | Scan the QR sticker (or open `/r/filler`). Tap the **✋ Jam / pinch point** icon, record a 3-second voice note, take a photo, tick "could have been hurt badly", **Send**. Point at the clock: under 30 seconds, no login, anonymous. Toggle Hindi. | Worker PWA, anonymity, EN/HI |
| 1:15 | Show the receipt code and "Sent". Mention: with no network it says "Waiting to send" and sends itself later (turn the network off in dev tools to prove it). Tap one emoji for the anonymous pulse. | Offline queue, feedback |
| 1:45 | Switch to the dashboard **Inbox**: the new report is on top with severity and **a visible reason** ("Base 3 + 1 high-risk location + 1 serious harm…"), route "Fast-track to supervisor", transcript status, audio and photo. | Explainable triage, judge Q2 |
| 2:30 | **Actions** tab: move the action to *in progress*, type the public fix: "Added interlocked guard on filler infeed". Switch to **/board** on the big screen: the card moves to "Being fixed" within seconds with the fix text. "You said, we did." Show the **Top fix** banner. | Closed loop, judge Q3 |
| 3:15 | **Overview**: KPIs, floor-plan hotspot map by shift, weekly trend ("more reports early on is healthy"), repeat hotspots, pulse (hidden below 5 answers), the dashed SIMULATED and ESTIMATE tiles. Point out the eco-tag on a leak report and the *estimated* saving. | KPIs, privacy, eco, judge Q4 |
| 4:00 | **Camera events**: a forklift near-miss and a hand-in-zone event with **pixelated** snapshots, "auto-detected, needs confirmation". Click **Confirm** → it becomes a normal triaged report. Say plainly: pretrained models, no accuracy claimed, test clip is a plumbing test, machine signal is simulated. | AI as automatic reporter, honesty |
| 4:40 | **Dispatch (simulated)**: file a report with "someone is hurt right now" to show the emergency chain; point at the red SIMULATED banner. High-potential near misses only reach the supervisor. | Routing, honesty |
| 4:55 | Close: 30-60-90 pilot, no-blame policy, metrics, limitations are in `docs/`. Ask for worker consultation before cameras. | Wrap-up |

## If something fails
- Emulators not ready: wait for "All emulators ready", re-run `npm run seed`.
- No camera events: run the vision service on the plumbing clip (`3-auto-cv/README.md`) or on your own footage.
- A report does not appear on the board right away: by design it appears when work starts (or after the delay). Move its action to *in progress*.
- Phone cannot reach the laptop: use the laptop's LAN address and set it as the address on the sticker app page (port 5174).

## Verification before presenting
`npm test`, `npm run test:rules`, `npm run smoke` (emulators + seed running), `python scripts/e2e/ui_flow.py` (Playwright + Chrome), `python -m pytest` in `3-auto-cv`.
