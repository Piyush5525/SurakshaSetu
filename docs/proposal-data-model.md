# Proposal — Firestore data model and repo structure (awaiting approval)

## Collections
All docs have `createdAt`, `updatedAt` (Timestamp) unless noted. Plant is single-tenant ("Demo Plant — Line 3"), so no plant-id prefix.

**locations** `{id}`
`name`, `nameHi`, `zoneType` (machine|forklift_lane|storage), `riskWeight` (1.0–2.0), `floorPlan: {x,y,w,h}` (SVG coords), `assemblyPoint`, `active`

**reports** `{id}`
`receiptCode` (short, unique), `locationId`, `shift` (A|B|C), `hazardType` (pinch_jam|forklift|chemical_spill|slip_trip|manual_handling|electrical_lockout|other), `seriousHarmFlag` (bool), `transcript`, `transcriptLang`, `audioPath`, `photoPath`, `reporterName?`, `lang`, `source` ("worker"), `severity` (1–5), `severityReason` (string), `severityBreakdown` {base, harmBoost, locationWeight, keywordHits[]}, `ecoTag` (none|air_leak|steam_leak|spill|idle_machine|material_waste), `status` (received|being_fixed|fixed|dismissed), `actionId?`, `publicSummary` (anonymised text for board), `triagedBy` (rules|llm)
Worker identity is never stored (anonymous Auth uid is not written to the report); `reporterName` is optional and hidden from the board.

**events** `{id}` (camera detections)
`rule` (forklift_person_gap|hand_in_danger_zone), `zoneId`, `locationId`, `shift`, `detectedAt`, `confidence`, `measure` (gap px / dwell s), `snapshotPath` (pixelated only), `status` (pending|confirmed|dismissed), `reviewedByRole`, `reviewedAt`, `reportId?` (set on confirm), `simulated` (bool, true for demo machine-running signal)

**actions** `{id}`
`reportId`, `locationId`, `title`, `owner` (role/team, not a named worker), `dueDate`, `status` (open|in_progress|closed), `fixDescription`, `visibleFix` (bool), `closedAt`, `controlLevel` (eliminate|substitute|engineer|admin|ppe)

**escalations** `{id}` (P2, simulated) `reportId`, `chain[]` {step, role, dueAt, state}, `dispatchLog[]`, `simulated: true`

**assumptions** `{key}` `value`, `unit`, `label`, `source` ("assumption" or citation), used for kWh/material estimates

**kpiSnapshots** `{yyyy-ww}` weekly aggregates by location and shift only: `reportsCount`, `byLocation`, `byShift`, `medianHoursToClose`, `pctClosedWithFix`, `repeatHotspots`, `lockoutConfirmed`(simulated), `pulseScore`, `estKwhSaved`, `estMaterialSaved`

**feedback** `{id}` (extra, small) `reportId`, `score` (1–5, "did it feel safe to report / was it fixed?"), `createdAt`. Feeds the pulse score.

**Not stored:** faces, raw frames, per-worker ids or rankings.

## Access (security rules sketch)
- worker (anonymous auth): create `reports`/`feedback`; read `locations`; read own report by receipt code through a callable/query by `receiptCode` only
- public: read `board` projection only (`publicSummary`, status, fix text, location name). Implemented as a Cloud Function-maintained `boardItems` collection so private fields never leave the server
- supervisor: read/update reports, actions, events (confirm/dismiss)
- ehs_admin: all of the above plus locations, assumptions, kpiSnapshots, escalations

(`boardItems` is the one addition beyond the brief's collection list.)

## Repo structure
```
/
├─ CLAUDE.md                 repo guide (renamed from master prompt)
├─ PLAN.md
├─ README.md  .env.example  firebase.json  firestore.rules  storage.rules
├─ package.json              npm workspaces: apps/*, functions
├─ apps/web/                 React + Vite + TS + Tailwind, PWA, react-i18next
│  └─ src/{routes/{report,admin,board},components,lib,i18n/{en,hi},kpi}
├─ functions/                Cloud Functions (TS): triage/, board/, escalation/ (P2)
│  └─ src/triage/{rules.ts,matrix.ts,llm.ts}  + tests
├─ services/vision/          Python 3.11: main.py, rules/, zones.yaml, privacy.py, requirements.txt, ruff
├─ scripts/seed/             seed.ts: locations, 8 weeks of reports, sample events
├─ docs/                     CONTEXT.md, risk-analysis.md, implementation-plan.md, metrics.md,
│                            eco-impact.md, privacy-and-ethics.md, limitations.md, demo-script.md, roadmap-mesh.md
└─ demo-assets/              placeholder videos (licence noted per file)
```

## Points where the brief conflicts or needs a call
1. **File names:** you referred to `CLAUDE.md` and `docs/CONTEXT.md`; they currently exist as `claude-code-master-prompt.md` and `CONTEXT.md` at the root. No real conflict in content. I'll rename in M0 unless you object.
2. **Public board vs private reports:** the brief says reports are anonymised on `/board` but also that rules protect data. Hence the `boardItems` projection above.
3. **Hindi voice:** Web Speech API Hindi support varies by browser and typically needs internet; offline demo may only store audio. Plan: store audio always, transcribe when available.
4. **Cloud Functions in the emulator** work offline, but the LLM triage flag needs internet and an API key (costs money), so it stays off by default.
5. **Stack-light "running" signal and footage** are simulated; labelled as such.
