# Safer Work, Better Work — "Scan · Speak · See"

Hackathon entry (Option 01). Fictional **Demo Plant — Line 3**; no real-company branding or data. See `PLAN.md`, `docs/MASTER_PROMPT.md`, `docs/CONTEXT.md`.

## Prerequisites
- Node 20+ (tested on 24), npm 10+
- **Java 21+** on PATH (Firebase Firestore/Storage emulators require it; Java 8 will not work)
- Python 3.11+ only for `services/vision` (M5)

## Run (emulators only: offline, no billing)
```
npm install
npm run dev      # Firebase emulators (UI http://localhost:4000) + web app http://localhost:5173
npm run seed     # in a second terminal, once emulators are up
```
Staff logins (Auth emulator only, synthetic): `supervisor@demo.local` / `ehs@demo.local`, password `demo1234`.

Verify M1 (Java 21+ on PATH):
```
npm test            # unit tests: triage, board projection, retention, pulse (41 tests)
npm run test:rules  # starts Firestore+Storage emulators and runs security-rules tests
npm run smoke       # with `npm run dev` + `npm run seed` running: end-to-end trigger check
```
Other scripts: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run format`.

## Notes
- Cloud Functions in production need a paid Firebase plan (Blaze); the demo runs entirely on the emulator.
- Copy `.env.example` to `.env.local` if you want optional features; none are required.
- Seed data is synthetic. Severity values in seed are placeholders until the triage function lands (M1).
