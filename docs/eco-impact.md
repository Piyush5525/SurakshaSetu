# Eco impact: how safety fixes also save energy and material

Every report gets an **eco-tag**: `air_leak`, `steam_leak`, `spill`, `idle_machine`, `material_waste` or `none`, set by transparent rules from the
hazard icon and keywords (English, Hindi, Hinglish; see `functions/src/triage/config.ts`), with the reason stored in `ecoReason`.
The dashboard shows an **estimated** saving: number of *fixed* eco-tagged reports × a per-event assumption.
**Nothing in this app is a measured saving.**

## Why these tags (sourced background, from `docs/CONTEXT.md` §3.4)
- **Compressed-air and steam leaks.** Compressed-air leaks are typically **20–30%** of compressed air in industrial facilities, and up to ~50% in poorly
  maintained systems (summaries by National Bar / Industrial Air Centers). Smart monitoring has been reported to cut compressed-air energy spend by
  10–20% (Fluid Power Journal; **vendor-sourced, treat as indicative**). A leaking hose near a pinch point is also a hazard: the safety fix and the
  energy fix are the same job.
- **Lockout/tagout must isolate all energy sources**, including pneumatic and hydraulic, which links safety to energy management.
- **Spills and material waste** are a safety hazard (slips, exposure) and a loss of product and cleaning water, connecting to L'Oréal's 2030 waste and water
  ambitions (100% site waste recycled or reused; 100% recycled/reused industrial water). Their 2023 results were 61% of site waste recycled/reused and
  14% of factories waterloop (L'Oréal 2023 annual report), so water and waste are the largest gaps. We do not claim to move these figures.
- **Idle machines** (running with nobody present) are an idea we propose: the same camera zones could detect it. **[design idea, not a cited result]**

## Estimation (all `assumptions`, editable, labelled estimate)
| Key | Value in demo | Meaning | Source |
|---|---|---|---|
| `air_leak_kwh_per_event` | 50 kWh | energy saved per compressed-air leak fixed | **assumption**: placeholder to be replaced by a measured value from a plant leak survey |
| `steam_leak_kwh_per_event` | 80 kWh | per steam leak fixed | **assumption** |
| `idle_machine_kwh_per_event` | 20 kWh | per idle-machine episode avoided | **assumption** |
| `spill_kg_per_event` | 5 kg | material saved per spill prevented | **assumption** |

`estimatedSavings()` multiplies only reports whose status is `fixed`. Example on seed data: shown on the overview as "Est. saved … ESTIMATE".
In a real pilot: measure leak flow (ultrasonic survey) before and after each air-leak fix, record kWh from the plant's meters, and replace the placeholders.

## Camera: idle-machine rule (Phase 2)
`IdleMachineRule` fires when a machine is flagged running (**simulated** signal in the demo) and nobody is in its zone for N minutes (default 5). A confirmed event
becomes a report tagged `idle_machine`. It needs a real machine-state signal (stack light or PLC) to be meaningful.

## What would make the numbers real
Plant meter data, a leak survey, waste and water records, and a before/after period of at least a few weeks, validated by the plant's energy team.
