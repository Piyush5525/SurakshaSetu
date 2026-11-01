# Metrics

All KPIs are **aggregate by location and shift**. No worker identity is stored, so nothing here can rank or expose an individual.
The functions are in `functions/src/kpi.ts` and `functions/src/pulse.ts` (unit-tested) and the dashboard is `/admin`.
Targets are **assumptions** for a pilot to agree with the plant; none is a benchmark or a published figure.

| # | KPI | Definition and formula | Data source | Target (assumption) | Notes |
|---|---|---|---|---|---|
| 1 | Near-miss reports per 100 workers per month | non-dismissed reports in the last 30 days ÷ headcount × 100 | `reports`, `assumptions.workers_on_line` | rising for the first 8–12 weeks, then stable | **More is better early on** (flat pyramid = under-reporting). Headcount 40 is a fictional assumption |
| 2 | Median hours to close | median of (`closedAt` − action `createdAt`) over closed actions | `actions` | < 72 h for severity ≥ 4 | The report-to-fix clock for severity ≥ 3 |
| 3 | % closed with a visible fix | closed actions with `visibleFix = true` ÷ closed actions | `actions` | ≥ 70% | A visible fix is what keeps reporting alive ("reports that go nowhere" kill it) |
| 4 | Repeat hotspots | location × hazard pairs with ≥ 3 reports in 28 days | `reports` | trending to 0 | The 3-in-28-days threshold is an assumption |
| 5 | Jam-clearing with confirmed lockout | share of jam-clearing events with lockout confirmed | **SIMULATED in the demo**: value from `assumptions.simulated_lockout_confirmed_pct` | 100% in a real pilot | Shown with a dashed "SIMULATED" tile. A real pilot needs a checklist or sensor |
| 6 | Employee pulse | mean of 1–5 "did it feel safe and easy to report / do I see fixes" | `feedback` (anonymous) | stable or rising | Shown only for groups with **≥ 5** responses; groups below that are hidden |
| 7 | Estimated energy / material saved | fixed reports with an eco-tag × per-event assumption | `reports`, `assumptions.*_per_event` | n/a | **ESTIMATE**, not measured. Replace the assumptions with measured values before quoting |
| 8 | Reports per week (trend) | non-dismissed reports per ISO week, last 8 weeks | `reports` | see #1 | Chart on the overview |
| 9 | Camera events: confirmed vs dismissed | `events.status` counts | `events` | confirmed share rising as zones are tuned | Dismissed = false alarm; this is the labelled set for future tuning |
| 10 | Open vs closed actions | counts by `actions.status`; overdue = open and past `dueDate` | `actions` | no severity ≥ 4 action overdue | |

### Task-risk reduction
For the hero risk the plant re-scores L × S from `docs/risk-analysis.md` at day 0, 30, 60 and 90 using KPIs 1–5 as evidence. The demo
shows the method; the before/after scores are targets, not results.

### Employee feedback loop
1. After every report the worker sees a one-tap 5-face question (anonymous, no link to the report).
2. The weekly review reads the pulse, free-text transcripts of recurring issues, and the board.
3. The monthly "top fix" is announced on the board and by the supervisor.
4. If the pulse falls, the first questions are: did actions close, did supervisors react well, is reporting still easy?

### Data hygiene
- A dismissed report is excluded from counts and removed from the public board.
- The public board shows day and shift only (no time of day), never severity or the serious-harm flag.
- Quality caveat: reports and severity are self-reported and rules-based; severity weights are a judgement call (`docs/limitations.md`).
