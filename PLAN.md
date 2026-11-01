# PLAN — Safer Work, Better Work ("Scan · Speak · See")

> **Note (2026-11-01):** the backend was switched from Firebase to a central FastAPI + SQLite service. Sections that mention Firestore, Cloud Functions, emulators or Firebase describe the archived first version (`legacy-firebase/`); the current design is in [docs/architecture.md](docs/architecture.md) and [README.md](README.md).


Status: M0–M7 built (see decisions). Remaining risk: no real footage, no measured accuracy. Deadline: **unknown** (placeholder not filled in). Estimates are focused builder-hours for one main builder; others handle docs/pitch in parallel.
Defaults assumed: English + Hindi, emulators only (no billing), demo footage TBD.

| # | Milestone | Est. | Done when |
|---|---|---|---|
| M0 | Scaffold: monorepo, emulators, lint/test scripts, seed ("Demo Plant — Line 3") | 3h | `npm run dev` starts emulators + web; `npm run seed` loads 8 weeks of data |
| M1 | Data model, security rules, triage function (severity + reason, eco-tag, auto action) + unit tests | 5h | Rules tests and triage tests pass |
| M2 | Worker PWA: `/r/:locationId`, icon form, voice, photo, receipt, EN/HI | 6h | Report in <30s on phone viewport |
| M3 | Admin: auth, inbox, floor-plan hotspots, actions, KPIs (+ tests), QR sticker PDF | 9h | Acceptance #2, #3, #5 |
| M4 | `/board` "You said, we did", 3-metre readable | 3h | Status change shows within seconds |
| M5 | Vision service: forklift gap rule, hand-in-zone rule, pixelated events, confirm/dismiss | 10h | Acceptance #4 on demo video |
| M6 | docs/ completed against real behaviour + demo script; Lighthouse pass | 8h (shared) | Acceptance #6, #7 |
| M7 | P2: offline queue → simulated escalation router → extra vision rules | 10h+ | Only if M0–M6 are done |

MVP total is about 44h of build time. The written deliverables (risk analysis, implementation plan, metrics, eco-impact, privacy, limitations) can start now in parallel with M0–M2, because they don't depend on code. Docs are graded, so teammates should start them early.

## Cut order if time runs short (first cut first)
1. All of M7 (offline queue, escalation router, extra vision rules)
2. Optional LLM triage flag, PPE/idle-energy rules, trend chart polish
3. QR sticker PDF styling (keep a plain printable page)
4. Hindi voice transcription (keep Hindi UI strings)
5. Vision rule 2 (hand-in-zone). Keep forklift gap, the more visual demo. If footage is missing, vision becomes a pre-recorded clip plus roadmap slide.
6. Never cut: anonymous report flow, triage reason, board, risk analysis, implementation plan, metrics doc, limitations doc.

## Decisions made (note here as they happen)
- boardItems approved: Cloud Function writes whitelisted fields only; M1 adds a rules test (unauthenticated: read boardItems OK, reports/events/feedback denied).
- Hindi STT: always store audio; transcribe only if supported and online; else show "not transcribed".
- No CLAUDE.md. Old brief/context moved to `docs/MASTER_PROMPT.md` and `docs/CONTEXT.md`; user's new AGENTS.md and replacement docs were not in the folder at M0 (pending).
- M0: Firebase emulators need Java 21+; portable Temurin 21 (GPLv2+CE) installed user-locally at ~/.jdk. Vite pinned to ^5.4 (single copy; vitest 3).
- M1: schema approved with additions A–F (injuryNow routing, board whitelist + delayed publication, client IDs, breakdown list, HI/Hinglish keywords, snapshot retention). Details in `docs/data-model.md`.
- M1: `publishDueBoardItems` and `purgeExpiredSnapshots` are callables (staff only); in production they would be scheduled functions. Scheduled triggers need the Pub/Sub emulator, so they are not used in the offline demo.
- M1: Storage overwrite protection is create-only in the rules but could not be verified in the emulator (see docs/limitations.md).
- Git repo initialised in M0, commit per milestone.

- M2–M4: worker PWA, admin, board built together. Offline queue (IndexedDB, retries while open; no Background Sync API) shipped in M2 since it shaped submission. QR stickers print via the browser (Save as PDF).
- M5: vision service; `.env` has `GCLOUD_PROJECT=demo-safer-work`, which does not match the repo's emulator project `demo-plant-line3`, so the service ignores it and prints a note. Forklift = COCO `truck` stand-in; the HF forklift model declares no licence and was not downloaded. Test clip is a plumbing test only.
- M5: driver exclusion requires feet well above the vehicle's bottom edge, otherwise a pedestrian standing in front of a forklift would be mistaken for the driver (found while testing).
- M7: simulated escalation router + dispatcher screen; only `injuryNow` starts the emergency chain, high-potential near misses go to the supervisor only. Phase 2 vision rules (forklift-only lane, idle machine) behind `--p2-rules`. PPE detection not built (cut order). Optional LLM triage not built (no key, rules path is the explainable one).
- M6: docs written against the real implementation; Lighthouse mobile run: accessibility 100, best practices 100.

## Open items for the user
Deadline; team size and who owns docs/pitch; **real demo footage** (forklift aisle and filling line) and permission to try a forklift model with a clear licence; whether to align `.env` GCLOUD_PROJECT with `demo-plant-line3`; organiser confirmation that our discipline is eligible (CONTEXT §1); judging format.
