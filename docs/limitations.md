# Limitations (started in M1; completed in M6)

Honest list of what is simulated, assumed or unvalidated. Extended as features land.

## Triage
- Severity weights (hazard base 1–3, +1 serious-harm flag, +1 location risk weight >= 1.5, +1 severe keyword) are a transparent judgement call, **not calibrated to any plant's data**. They are an assumption.
- Keyword lists (English, Hindi, Hinglish) are hand-written and crude: they can mis-fire (e.g. "stuck" in a harmless sentence) or miss spelling variants. Severity is advisory; staff review every report.
- Action due dates (1/3/7 days by severity) and owner teams are assumed service levels.
- `injuryNow` routes to the *simulated* emergency path only (Phase 2). No real emergency service is contacted.

## Privacy and data
- Snapshot retention (30 days) and board publication delay (48 h) are configurable assumptions, not legal advice. Dismissed camera events lose their image immediately, so fewer labelled images are available for future model tuning (accepted trade-off).
- Pulse feedback shows averages only for groups of at least 5 entries; this is a design choice, not a statistical guarantee of anonymity.

## Platform
- Everything runs on the Firebase emulators. Cloud Functions in production need a paid (Blaze) plan; not tested against real Firebase.
- Scheduled cleanup (board delay, snapshot retention) exists as staff-only callables; scheduling them is a production step.
- Storage rules are create-only for worker uploads, but overwrite protection could not be confirmed in the Storage emulator (a repeat upload to the same path succeeded in our test). Re-verify against real Firebase before relying on it.
- Fictional "Demo Plant — Line 3"; all seed data is synthetic.
