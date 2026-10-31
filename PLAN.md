# PLAN — Safer Work, Better Work ("Scan · Speak · See")

Status: APPROVED. M0 done. Deadline: **unknown** (placeholder not filled in). Estimates are focused builder-hours for one main builder; others handle docs/pitch in parallel.
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
- Git repo initialised in M0, commit per milestone.

## Open items for the user
Deadline; team size and who owns docs/pitch; demo footage; organiser confirmation that our discipline is eligible (CONTEXT §1); judging format.
