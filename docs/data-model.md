# Data model — Firestore + Storage (M1, FINAL DRAFT for approval)

Single plant ("Demo Plant — Line 3", fictional), so no plant-id prefix. Project id `demo-plant-line3`. Timestamps are Firestore `Timestamp`.
**W** = who writes: `client` (rules-validated), `fn` (Cloud Function, admin SDK), `vision` (Python service, admin SDK), `seed`.

## Roles
Firebase Auth. `worker` = anonymous sign-in, no claim. Staff = custom claim `role` = `supervisor` | `ehs_admin` (ehs_admin ⊇ supervisor). Claims are set by the seed script in the emulator (demo logins listed in README at M3). Unauthenticated visitors can only read `boardItems`.

## Collections

### `locations/{slug}` — W: seed / ehs_admin
`name`, `nameHi`, `zoneType` (`machine`|`forklift_lane`|`storage`), `riskWeight` (number 1.0–2.0, used by triage), `floorPlan {x,y,w,h}` (SVG coords), `assemblyPoint`, `active`, `createdAt`, `updatedAt`.
Read: any signed-in user (the worker app needs the name from the QR link).

### `reports/{autoId}` — W: client creates; fn triages
Client-supplied (rules enforce `hasOnly`, exact types, `status == 'received'`):
`locationId`, `hazardType` (`pinch_jam`|`forklift`|`chemical_spill`|`slip_trip`|`manual_handling`|`electrical_lockout`|`other`), `seriousHarmFlag` (bool), `transcript` (string ≤ 1000, may be ""), `transcriptStatus` (`transcribed`|`not_transcribed`|`no_audio`), `audioPath?`, `photoPath?` (Storage paths), `lang` (`en`|`hi`), `shift` (`A`|`B`|`C`), `reporterName?` (optional, ≤ 60), `status` = `received`, `createdAt`.
Function-added by triage (clients may never write these):
`receiptCode` (e.g. `SW-7K2Q`), `source` (`worker`|`camera`), `severity` 1–5, `severityReason` (string), `severityBreakdown {base, harmBoost, locationBoost, keywordBoost, keywordHits[], raw, capped}`, `ecoTag` (`none`|`air_leak`|`steam_leak`|`spill`|`idle_machine`|`material_waste`), `ecoReason`, `actionId?`, `triagedBy` (`rules`|`llm`), `updatedAt`.
Later changes by staff: `status` (`received`→`being_fixed`→`fixed`, or `dismissed`).
Not stored, ever: auth uid, IP, device id. `reporterName` is optional, staff-only, never copied anywhere else.
Read/update: staff only. Workers cannot read reports (including their own); they follow progress on `boardItems/{reportId}` using the id their device remembers.

### `boardItems/{reportId}` — W: **fn only**; Read: **anyone, including unauthenticated**
Written by a Cloud Function that copies ONLY this whitelist (function code builds the object field by field; it never spreads a report):
`id` (= report id), `locationLabel` (location `name`), `locationLabelHi`, `hazardIcon` (= `hazardType`), `status` (`received`|`being_fixed`|`fixed`), `fixText` (from `actions.publicFixText`, staff-written, "" until fixed), `featured` (bool, staff "top fix" flag), `createdAt`, `updatedAt`, `fixedAt?`.
Never included: transcript, audio/photo paths, `reporterName`, `shift`, `lang`, severity, reason, receiptCode, notes, or any other report free text.
Dismissed reports are removed from boardItems. A test asserts the exact key set.

### `actions/{autoId}` — W: fn creates (severity ≥ 3); staff update
`reportId`, `locationId`, `title`, `owner` (team label, e.g. "Maintenance" — not a named person), `dueDate`, `status` (`open`|`in_progress`|`closed`), `controlLevel?` (`eliminate`|`substitute`|`engineer`|`admin`|`ppe`), `internalNotes` (staff only), `publicFixText` (what the board shows; staff-written), `visibleFix` (bool, fix physically visible on the floor), `featured`, `closedAt?`, `createdAt`, `updatedAt`.
Status sync (fn): action `in_progress` → report/boardItem `being_fixed`; `closed` → `fixed`.
Read: staff.

### `events/{autoId}` — W: vision (create); staff (review fields only)
Camera detections, always "auto-detected — needs confirmation".
`rule` (`forklift_person_gap`|`hand_in_danger_zone`), `zoneId`, `locationId`, `shift`, `detectedAt`, `confidence`, `measure` (gap px or dwell seconds), `snapshotPath?` (**pixelated** image only, `events/{id}.jpg`), `status` (`pending`|`confirmed`|`dismissed`), `reviewedByRole?`, `reviewedAt?`, `reportId?` (set when confirmation creates a camera-sourced report), `simulated` (bool; true when the "machine running" signal is simulated), `createdAt`.
On `confirmed`, a function creates a `source: 'camera'` report and runs the same triage. Dismissed events are kept as labelled negatives. Read: staff.

### `feedback/{autoId}` — W: client create; Read: ehs_admin only
Anonymous pulse. `score` (int 1–5: "I felt safe reporting and I see things get fixed"), `locationId?`, `shift?`, `weekKey` (`YYYY-Www`), `createdAt`.
**Changed from the proposal:** no `reportId`, so a score cannot be linked back to a report or person. Only aggregates are ever shown (min group size 5 before a location/shift average is displayed).

### `escalations/{autoId}` — P2, simulated. W: fn
`reportId`, `chain[] {step, role, dueAt, state}`, `dispatchLog[]`, `simulated: true`. Read: staff. Not built in M1; rules reserve staff-read/no-client-write.

### `assumptions/{key}` — W: ehs_admin / seed
`value`, `unit`, `label`, `source` (`assumption` or a citation). Used for estimated kWh/material savings (always labelled "estimate"). Read: staff.

### `kpiSnapshots/{YYYY-Www}` — W: fn (M3); Read: staff
Weekly aggregates by location and shift only: `reportsCount`, `byLocation`, `byShift`, `medianHoursToClose`, `pctClosedWithFix`, `repeatHotspots`, `lockoutConfirmed` (simulated), `pulseScore`, `estKwhSaved`, `estMaterialSaved`, `computedAt`. No per-person data exists to aggregate.

## Storage
- `reports/{reportId}/audio.*`, `reports/{reportId}/photo.*`: signed-in create only (content-type `audio/*` or `image/*`, ≤ 10 MB), no update/delete, read by staff only.
- `events/{eventId}.jpg`: written by vision service (admin SDK), read by staff.

## Security rules summary (tested in M1 with the rules-unit-testing library)
| Collection | Unauthenticated | Worker (anonymous) | Supervisor | EHS admin |
|---|---|---|---|---|
| boardItems | **read** | read | read | read |
| locations | – | read | read | read/write |
| reports | – (denied) | create (validated) | read/update status | read/update |
| events | – (denied) | – | read/review | read/review |
| feedback | – (denied) | create (validated) | – | read |
| actions | – | – | read/update | read/update |
| assumptions, kpiSnapshots, escalations | – | – | read | read/write (assumptions) |
Required test: an unauthenticated client can read `boardItems` but is denied reads of `reports`, `events` and `feedback`; and a `boardItems` write from any client is denied.

## Triage (functions/src/triage, pure and unit-tested)
Rules-only; `TRIAGE_LLM=true` is a later optional add-on and is not built in M1.
1. **Severity** = clamp(1..5, `base` + `harmBoost` + `locationBoost` + `keywordBoost`)
   - `base` by hazard: `pinch_jam` 3, `electrical_lockout` 3, `forklift` 3, `chemical_spill` 2, `slip_trip` 2, `manual_handling` 2, `other` 1
   - `harmBoost` +1 if `seriousHarmFlag`
   - `locationBoost` +1 if the location `riskWeight` ≥ 1.5
   - `keywordBoost` +1 if the transcript has a severe keyword (EN + HI list, e.g. "trapped", "stuck", "fire", "sparks", "almost hit", "bleeding"), else 0
   - `severityReason` is a plain sentence listing each contribution, e.g. "Base 3 (jam clearing / pinch point) + 1 (worker flagged serious harm) + 1 (location risk weight 1.5) = 5".
   These weights are a transparent judgement call, not calibrated to any plant data. They are flagged as an assumption in `docs/limitations.md`.
2. **Eco-tag** from hazard icon + transcript keywords: "hiss"/"air leak" → `air_leak`; "steam" → `steam_leak`; `chemical_spill` icon or "spill" → `spill`; "running empty"/"left on"/"nobody" → `idle_machine`; "waste"/"scrap" → `material_waste`; else `none`. `ecoReason` records the match. Estimated savings come only from `assumptions`.
3. **Action** for severity ≥ 3: `owner` by hazard (pinch/electrical → Maintenance, forklift → Logistics, chemical/slip → EHS/Housekeeping, manual handling → EHS), due in 1 day (sev 5), 3 days (sev 4), 7 days (sev 3). These service levels are assumptions.
4. Every report gets a `boardItems` doc (status `received`), via the whitelisted projection.

## Seed changes (M1)
Seed reports will be run through the real triage code instead of placeholder values; seed will also create the demo staff users in the Auth emulator and write `boardItems` through the same projection function.
