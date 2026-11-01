# Data model — Firestore + Storage (M1, APPROVED with additions A–F)

> **Note (2026-11-01):** the backend was switched from Firebase to a central FastAPI + SQLite service. Sections that mention Firestore, Cloud Functions, emulators or Firebase describe the archived first version (`legacy-firebase/`); the current design is in [docs/architecture.md](architecture.md) and [README.md](../README.md).


Single plant ("Demo Plant — Line 3", fictional), so no plant-id prefix. Project id `demo-plant-line3`. Timestamps are Firestore `Timestamp`.
**W** = who writes: `client` (rules-validated), `fn` (Cloud Function, admin SDK), `vision` (Python service, admin SDK), `seed`.

## Roles
Firebase Auth. `worker` = anonymous sign-in, no claim. Staff = custom claim `role` = `supervisor` | `ehs_admin` (ehs_admin ⊇ supervisor). Claims are set by the seed script in the Auth emulator (demo logins in README). Unauthenticated visitors can only read `boardItems`.

## Collections

### `locations/{slug}` — W: seed / ehs_admin
`name`, `nameHi`, `zoneType` (`machine`|`forklift_lane`|`storage`), `riskWeight` (1.0–2.0, used by triage), `floorPlan {x,y,w,h}` (SVG coords), `assemblyPoint`, `active`, `createdAt`, `updatedAt`.
Read: any signed-in user (the worker app needs the name from the QR link).

### `reports/{clientId}` — W: client creates; fn triages
**Client-generated ID (C):** the client creates the document ID itself (Firestore auto-ID or UUID, 20–40 chars of `[A-Za-z0-9_-]`), so the Phase 2 offline queue can reference a report (and its Storage paths) before it syncs. Rules enforce the ID pattern. Re-sending the same report fails with "already exists", which the client treats as success (idempotent). Unguessable ID = the worker's handle for following progress.

Client-supplied (rules enforce `hasOnly`, types, `status == 'received'`, `createdAt <= request.time`):
`locationId`, `hazardType` (`pinch_jam`|`forklift`|`chemical_spill`|`slip_trip`|`manual_handling`|`electrical_lockout`|`other`), `seriousHarmFlag` (bool: "someone could have been hurt badly"), **`injuryNow`** (bool, **A**: "someone is hurt right now"), `transcript` (≤ 1000 chars, may be ""), `transcriptStatus` (`transcribed`|`not_transcribed`|`no_audio`), `audioPath?`, `photoPath?`, `lang` (`en`|`hi`), `shift` (`A`|`B`|`C`), `reporterName?` (optional, ≤ 60), `status` = `received`, `createdAt` (capture time; may be earlier than arrival when queued offline).

Function-added by triage (clients may never write these):
`receiptCode` (e.g. `SW-7K2Q9`, derived from the ID), `source` (`worker`|`camera`), `severity` (1–5), `severityReason` (sentence), **`severityBreakdown` (D)**: list of components, always these four in order, each `{ key, label, points, detail? }` with `key` ∈ `base`|`seriousHarm`|`locationWeight`|`keyword`; plus `severityRaw` (sum before the 1–5 clamp), `ecoTag` (`none`|`air_leak`|`steam_leak`|`spill`|`idle_machine`|`material_waste`), `ecoReason`, **`route`** (**A**: `emergency`|`supervisor_fast_track`|`standard`), `actionId?`, `triagedBy` (`rules`|`llm`), `updatedAt`.
Later changes by staff: `status` (`received`→`being_fixed`→`fixed`, or `dismissed`).

**Routing (A):** only `injuryNow = true` sets `route = 'emergency'` (the P2 simulated escalation path; never real emergency services). A high-potential near miss (severity ≥ 4, nobody hurt) gets `supervisor_fast_track` and never reaches the emergency path, regardless of `seriousHarmFlag`.

Not stored, ever: auth uid, IP, device id. `reporterName` is staff-only and is never copied anywhere.
Read/update: staff only. Workers cannot read reports, including their own.

### `boardItems/{reportId}` — W: **fn only**; Read: **anyone, including unauthenticated**
Built field by field by `projectBoardItem` (never by spreading a report). **Exact key set (B):**
`id`, `locationLabel`, `locationLabelHi`, `hazardIcon`, `status` (`received`|`being_fixed`|`fixed`), `fixText` (staff-written `actions.publicFixText`, "" until set), `featured` (bool, staff "top fix" flag), `day` (`YYYY-MM-DD` in plant time zone), `shift`, `fixedDay` (`YYYY-MM-DD` or null).
- **No exact times** (no timestamps at all): only the day and the shift.
- **No severity, no seriousHarmFlag, no injuryNow, no route**, no transcript, audio/photo, `reporterName`, `lang`, `receiptCode`, or any other report text.
- **Publication (B):** a board item exists only once the report reaches `being_fixed` or `fixed`, **or** the report is older than `board_publish_delay_hours` (assumption, default 48, configurable in `assumptions`) and not dismissed. Late publication avoids exposing a report while it is still unreviewed and makes it harder to link to one person. A callable `publishDueBoardItems` applies the delay (in production this would be a scheduled function).
- Dismissed reports have their board item removed.
- Tests: unit test asserts the exact key set; rules test reads a projected doc as an unauthenticated client and asserts the same key set and that severity/serious-harm keys are absent.

### `actions/{reportId}` — W: fn creates (severity ≥ 3); staff update
The action ID equals the report ID (idempotent creation, 1:1).
`reportId`, `locationId`, `title`, `owner` (team label, not a named person), `dueDate`, `status` (`open`|`in_progress`|`closed`), `controlLevel?` (`eliminate`|`substitute`|`engineer`|`admin`|`ppe`), `internalNotes` (staff only), `publicFixText` (what the board shows), `visibleFix` (bool), `featured`, `closedAt?`, `createdAt`, `updatedAt`.
Sync (fn): action `in_progress` → report `being_fixed`; `closed` → `fixed`. Read: staff.

### `events/{autoId}` — W: vision (create); staff (review fields only)
Camera detections, always "auto-detected — needs confirmation".
`rule` (`forklift_person_gap`|`hand_in_danger_zone`), `zoneId`, `locationId`, `shift`, `detectedAt`, `confidence`, `measure` (gap px or dwell s), `snapshotPath?` (**pixelated** only, `events/{id}.jpg`), `snapshotPurgedAt?`, `status` (`pending`|`confirmed`|`dismissed`), `reviewedByRole?`, `reviewedAt?`, `reportId?`, `simulated` (true when the "machine running" signal is simulated), `createdAt`, `updatedAt`.
- `confirmed` → fn creates report `cam_<eventId>` (`source: 'camera'`, hazard `forklift` or `pinch_jam`) and runs the same triage.
- **Retention (F):** pixelated snapshots are deleted from Storage after `snapshot_retention_days` (assumption, default 30, configurable in `assumptions`); `snapshotPath` is set to null and `snapshotPurgedAt` recorded. Callable `purgeExpiredSnapshots` (scheduled in production). **Dismissed events keep only the verdict:** on dismissal the snapshot is deleted immediately and `snapshotPath`, `measure` and `confidence` are nulled; only rule, zone, location, shift, detection day, status and review fields remain. (Trade-off: fewer labelled images for future fine-tuning, accepted for privacy.)
Read: staff.

### `feedback/{autoId}` — W: client create; Read: ehs_admin only
Anonymous pulse. `score` (int 1–5), `locationId`, `shift`, `weekKey` (`YYYY-Www`), `createdAt`. No `reportId`, no uid. Aggregate-only: a group (location × shift, or week) shows an average only when it has **at least 5** entries (`MIN_GROUP_SIZE`, implemented in `functions/src/pulse.ts`, tested).

### `escalations/{autoId}` — P2, simulated. W: fn
`reportId`, `chain[]`, `dispatchLog[]`, `simulated: true`. Triggered only by `route = 'emergency'`. Not built in M1; rules reserve staff-read/no-client-write.

### `assumptions/{key}` — W: ehs_admin / seed
`value`, `unit`, `label`, `source` (`assumption` or citation). Includes `board_publish_delay_hours` (48), `snapshot_retention_days` (30), savings estimates (always labelled "estimate"). Read: staff (functions read via admin SDK).

### `kpiSnapshots/{YYYY-Www}` — W: fn (M3); Read: staff
Weekly aggregates by location and shift only. No per-person data exists to aggregate.

## Storage
- `reports/{reportId}/audio.*`, `reports/{reportId}/photo.*`: signed-in **create** only (`audio/*` or `image/*`, < 10 MB, report ID pattern), no update/delete, read by staff only.
- `events/{eventId}.jpg`: written by vision service (admin SDK), read by staff, deleted per retention.

## Security rules summary (tested with `@firebase/rules-unit-testing`)
| Collection | Unauthenticated | Worker (anonymous) | Supervisor | EHS admin |
|---|---|---|---|---|
| boardItems | **read** | read | read | read |
| locations | – | read | read | read/write |
| reports | – | create (validated) | read, update status | read, update status |
| events | – | – | read, review | read, review |
| feedback | – | create (validated) | – | read |
| actions | – | – | read, update | read, update |
| assumptions, kpiSnapshots, escalations | – | – | read | read (+write assumptions) |
No client may write `boardItems`, `kpiSnapshots`, `escalations`, or triage fields.

## Triage (`functions/src/triage`, pure functions, unit-tested; rules-only)
`TRIAGE_LLM` is a later optional add-on, not built in M1.
1. **Severity** = clamp(1..5, sum of components):
   - `base` by hazard: `pinch_jam` 3, `electrical_lockout` 3, `forklift` 3, `chemical_spill` 2, `slip_trip` 2, `manual_handling` 2, `other` 1
   - `seriousHarm` +1 if `seriousHarmFlag`
   - `locationWeight` +1 if location `riskWeight` ≥ 1.5
   - `keyword` +1 if the transcript contains a severe keyword (English, Hindi in Devanagari, and romanised Hinglish; list in `triage/config.ts`). **No transcript (or "not transcribed") → no keyword bonus, no error.**
   - `severityReason` is a sentence listing each non-zero contribution, the raw sum, and any clamp. These weights are a judgement call, not calibrated to plant data (assumption, listed in `docs/limitations.md`). Keyword matching is substring/word based and can mis-fire or miss; severity is advisory and staff can review everything.
2. **Eco-tag** from icon + keywords (EN/HI/Hinglish): air hiss/leak → `air_leak`; steam → `steam_leak`; `chemical_spill` icon or spill words → `spill`; "running empty"/"left on"/"nobody" → `idle_machine`; waste/scrap → `material_waste`; else `none`. `ecoReason` records the match.
3. **Route** (A): see above.
4. **Action** for severity ≥ 3: owner by hazard (pinch/electrical → Maintenance, forklift → Logistics, chemical/slip → Housekeeping & EHS, manual handling → EHS), due in 1 day (sev 5), 3 days (sev 4), 7 days (sev 3). Service levels are assumptions.

## Seed (M1)
Seed runs the real triage and board-projection code, creates 18 location×shift feedback groups with 8 entries each (≥ 5), writes `assumptions`, and creates demo staff users in the Auth emulator. Seed data is synthetic.
