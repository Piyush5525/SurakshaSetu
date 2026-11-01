# Risk analysis: Safer Work, Better Work (Option 01)

Fictional "Demo Plant — Line 3" (filling and packaging line). **The hazard list and all scores below are our assumptions from general
industry knowledge, not L'Oréal data and not measurements from a real plant.** They are a structured starting point for a
site risk assessment, which a real pilot would redo with the plant's EHS team and the people who do the work.

## 1. Method
- Likelihood (L) 1–5 × Severity (S) 1–5 = risk score 1–25. Bands: 1–4 low, 5–9 medium, 10–16 high, 17–25 critical (a common
  convention; the bands are a choice, not a standard we are quoting).
- Likelihood scale: 1 rare, 2 unlikely, 3 possible, 4 likely, 5 expected in a normal month. Severity: 1 first aid, 2 medical
  treatment, 3 lost time, 4 serious injury, 5 fatality or permanent disability.
- Controls follow the hierarchy of controls: eliminate, substitute, engineering, administrative, PPE (most to least effective).
- Near-miss reports are a *leading* indicator. A flat pyramid (few near misses against injuries) suggests under-reporting
  (CONTEXT §3.2). We do not claim a precise injury reduction from more reports (Heinrich ratios are a model, not a law).

## 2. Hazard register (before the improvement)
| # | Hazard (Line 3) | Typical harm | L | S | Score | Band |
|---|---|---|---|---|---|---|
| 1 | **Clearing jams / changeovers on filling and packaging machines** (pinch points, unexpected start-up, hands in the machine zone) — **hero risk** | crush, amputation | 4 | 4 | **16** | high |
| 2 | **Forklift–pedestrian conflict** in shared aisles — secondary risk | struck-by, crush | 3 | 5 | **15** | high |
| 3 | Chemical / raw-material spill and splash | burn, irritation, slip | 3 | 3 | 9 | medium |
| 4 | Slips and trips (wet floor, cables, packaging waste) | sprain, fracture | 4 | 2 | 8 | medium |
| 5 | Manual handling (cartons, drums, case packing) | musculoskeletal injury | 4 | 2 | 8 | medium |
| 6 | Electrical / stored energy (incl. compressed air, pneumatic) during maintenance | shock, whiplash of hose | 2 | 5 | 10 | high |

Why #1 is the hero risk: pinch points on packaging lines and unexpected energisation while clearing jams are standard,
well-documented hazards (CONTEXT §3.3, Coaction/SafetyNow sheet), jams are frequent by nature, and the exposure is a hand inside
a machine. The choice itself is **[assumption]**.

## 3. Hero risk: controls and before/after
| Level | Control | In this project |
|---|---|---|
| Eliminate | Remove the need to reach in (better infeed design, jam-proof format parts) | Raised through reports; owned by Maintenance (action `controlLevel = eliminate`) |
| Substitute | Quick-release tooling that avoids hands-in changeovers | Same |
| Engineering | Interlocked guards; lockout of ALL energy sources including pneumatic and hydraulic; light curtains | Same; the camera rule *detects* hands in a danger zone and prompts a review of the guard |
| Administrative | Lockout/tagout (LOTO) procedure, no-blame reporting, supervisor behaviour, training, visual controls (floor markings, QR stickers) | **Scan · Speak · See** reporting, "You said, we did" board, 30-60-90 plan |
| PPE | Cut-resistant gloves, safety footwear | Unchanged; last line of defence |

**Risk score for the hero risk, estimated:**
| | L | S | Score | Reasoning (assumption) |
|---|---|---|---|---|
| Before | 4 | 4 | 16 (high) | jams are frequent, hand-in-machine exposure, reliance on procedure |
| After the pilot targets are met | 2 | 4 | 8 (medium) | more hazards found and fixed earlier, visible fixes and LOTO checks reduce likelihood; severity of the *worst case* is unchanged until engineering controls remove the exposure |

The "after" score is a **target**, not a result. The pilot measures the real movement with the KPIs in `docs/metrics.md`.
A secondary risk (#2) follows the same method; the camera "forklift near-miss" rule gives data on where aisle conflicts happen.

## 4. How the system maps to the four judge questions
1. **Spot and report easily:** QR sticker on each machine, no login or app, anonymous, icon first, voice note, English + Hindi, under 30 s.
2. **Equipment design, training, visual controls, digital tools:** reports feed engineering actions; the camera rules support, never replace, the guard and LOTO.
3. **Works in daily practice:** closed-loop board, supervisor fast-track, no-blame policy, weekly review (`docs/implementation-plan.md`).
4. **Environmental benefit:** every report gets an eco-tag (air leak, steam leak, spill, idle machine, material waste); see `docs/eco-impact.md`.

## 5. What this analysis does not cover
Task-level job hazard analyses, noise, dust/ventilation, fire and explosion, ergonomics measurement and contractor risks. A real
rollout starts from the plant's existing risk register; L'Oréal's own system is strong (CONTEXT §2), and this project is meant to make
its near-miss and hazard reporting easier to use on the floor, not to replace it.
