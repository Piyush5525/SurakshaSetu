# Implementation plan: 30-60-90 day pilot on one line

Scope: one filling/packaging line (Line 3 in the demo), about 40 people across 3 shifts (the headcount is an **assumption**, editable in
`assumptions`). Everything below is a proposal for a plant to adapt; durations and targets are assumptions, not benchmarks.

## Roles
| Role | Responsibility |
|---|---|
| Line manager (sponsor) | Protects time for fixes, reads the board every week |
| Shift supervisors (x3) | First responder to reports; **behaviour is the culture**: thank, never blame |
| EHS lead | Owns triage review, actions, KPIs, privacy rules |
| Maintenance lead | Owns engineering fixes and LOTO verification |
| Worker representatives (2 per shift) | Co-design, test, challenge. Consulted before any camera goes live |
| IT / OT | Network, device policy, camera hardware, retention |

## No-blame policy (signed by the site head before day 1)
- A report is never grounds for discipline of the reporter. Anonymous by default; names are optional and staff-only.
- Supervisors acknowledge every report within one shift and tell the reporter (via the board) what happens.
- Camera events are never used to discipline an individual; they are reviewed as *events at a place*, never as a person.
- Nobody is ranked, scored or compared by reports. KPIs are only aggregate by location and shift.

## Days 0–30: set up and earn trust
| Week | Actions |
|---|---|
| 1 | Walk the line with workers; confirm hero risk and hazards (`risk-analysis.md`); agree the no-blame policy; baseline: last 12 months of recorded near misses and injuries from the plant's own system |
| 2 | Print and place QR stickers at each machine and the forklift aisle; show the app on the board screen; 10-minute toolbox talk per shift ("Spot it. Scan it. Say it.") |
| 3 | Go live for reporting only (no camera). Supervisors triage daily; first visible fixes within 7 days (cheap, quick wins on purpose) |
| 4 | First "You said, we did" review with the whole line; collect pulse feedback; fix usability problems; confirm severity weights with EHS |

## Days 31–60: close the loop and tighten
- Weekly 20-minute review (EHS, maintenance, supervisors, two worker reps): top hotspots, overdue actions, repeat hotspots.
- Start LOTO verification checks for jam clearing (manual checks first; the dashboard figure is simulated in the demo).
- Add Hindi and any other needed languages; review keyword lists with workers.
- **Camera pilot, only if worker representatives agree:** one forklift aisle, pixelated snapshots, human confirmation, retention 30 days (assumption).
  Evaluate false-alarm rate; turn it off if it erodes trust.

## Days 61–90: embed and decide
- Move recurring fixes from administrative to engineering controls (guards, interlocks, tooling).
- Review the energy/material eco-tags with maintenance; verify any savings by measurement before reporting them.
- Compare KPIs to the baseline and decide on rollout.

## Training
- Workers: 10 minutes, practised on the phone, in their language. Supervisors: 1 hour on responding to a report and what no-blame looks like in practice.
- Maintenance: LOTO for all energy sources, using reports as input.

## Rollout criteria (go / adjust / stop), all assumptions to be agreed with the plant
- Go: reporting continues to grow or hold for 4 weeks AND at least 70% of actions with severity ≥ 3 are closed within their due date AND the pulse score is stable or rising with no unresolved privacy complaint.
- Adjust: reports flat or pulse falling: talk to workers first, look at reporting friction, supervisor behaviour and unclosed loops.
- Stop or pause the camera component: any credible privacy concern, or false alarms that workers say are unfair.

## Risks to the plan
Reports that go nowhere (mitigation: board, due dates, weekly review); supervisor blame reactions (mitigation: training, policy, aggregate-only data);
over-trust in AI (mitigation: human confirmation of every event); device access on the floor (mitigation: QR stickers, offline queue, shared kiosk phone).
