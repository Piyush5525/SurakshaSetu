# UI/UX audit, design research and design system

Date: 2026-11-01. Written against the code that ships in this repository.

## 1. Audit of the previous UI (before this redesign)

| Area                    | Problem found                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Look                    | Dark yellow/black worker theme and plain white admin tables; no shared tokens, so the three portals did not look related |
| Admin navigation        | Flat row of pill tabs, no site/search/notification/health area, no way to jump to an incident                           |
| CCTV                    | A grid of still-refreshing JPEGs; no expanded view, filmstrip, layouts, timeline, overlays or honest feed labelling     |
| Dashboard               | Counts without definitions; charts not clickable; no severity, response-time or QR metrics                              |
| Incident handling       | Worked, but a dense single page; no dialogs for assign/resolve; free-text status buttons                                 |
| Worker portal           | One long form with 7 hazard icons, a shift picker and a name box: too much for a first-time user                        |
| QR                      | Sticker was a screen printout; no scan history; no templates; PNG only through the browser print dialog                 |
| Accessibility/readiness | Small text, low contrast on the yellow theme, no empty/error/loading states, no keyboard handling in modals             |

## 2. Reference study (what was actually read)

| Reference                                                                                  | Licence (read on its page)  | What it is, verified                                                                                                                                              | What we adopted                                                                                                                                    | What we did not                                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) (primary)                | MIT                         | Vite + TanStack Router + shadcn/ui (Radix, Tailwind), Lucide icons, light/dark, sidebar, global search command, responsive                                          | Sidebar layout with grouped, icon-led items; top bar with search; command-style global search (Ctrl K); restrained neutral palette; Lucide icons    | No code copied. We do not use TanStack Router, Radix or Clerk; primitives are our own |
| [CoffeESIME/react-scada-hmi](https://github.com/CoffeESIME/react-scada-hmi)                | MIT                         | Next.js 14 SCADA HMI builder; its README documents four alarm priority levels mapped to ISA-101 colours, gauges with HH/H/L/LL limits, trends. Component internals not verified from the page | The idea of a strict alarm hierarchy: colour encodes urgency only (severity ramp 1-5), never decoration; status shown as state dots + words          | Drag-and-drop builder, MQTT, ReactFlow: out of scope                                |
| [JoshKing15/Open-Source-IP-Camera-Surveillance-Platform](https://github.com/JoshKing15/Open-Source-IP-Camera-Surveillance-Platform) | README says MIT           | Only a folder skeleton is visible (4 commits, 0 stars); the README lists a camera grid, timeline playback, WebRTC/ONVIF, but **no feature could be verified as working** | Vocabulary and concepts only: camera grid, event timeline, event-linked clips, health indicators                                                  | Nothing reused; we do not claim any behaviour from its README                       |
| [TailAdmin/free-react-tailwind-admin-dashboard](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard) (secondary) | MIT              | React 19, Tailwind v4, ApexCharts, MapLibre/Leaflet, TanStack Table, many dashboard pages                                                                          | Card/KPI-strip and chart-plus-table layout rhythm; compact tables with row hover                                                                   | Chart/map libraries (we keep small dependency-free SVG charts and an SVG plan)      |

No reference code is included. Libraries added to the project: `lucide-react` (ISC licence, the same icon set shadcn-admin uses). Nothing else.

## 3. Design direction as built

- **Admin:** warm white canvas, white panels with a 1 px warm-grey border and almost no shadow, near-black text, 6-8 px radii, one red accent used for the active item, primary actions and the brand mark. Dense but calm tables; every KPI and chart element is a link into a pre-filtered list.
- **CCTV:** a separate dark theme (`night` tokens): charcoal panels, green = streaming, amber = potential, red = confirmed or alert. It is the only dark screen.
- **Worker / QR:** the same light tokens at larger sizes: 18-30 px text, 56-72 px targets, one primary action per screen, a 3-5 step progress bar, plain words. English and Hindi.
- **Honesty is part of the design:** every simulated thing carries a visible "Simulated" or "SAMPLE VIDEO · SIMULATED FEED" tag; "LIVE" appears only when a real device is streaming; "Potential / Confirmed / False positive / Resolved" are different colours and words.
- **Branding:** the product title "L'ORÉAL Industrial Safety Operations Centre" is plain text in the UI font, as requested. **No L'Oréal logo, wordmark artwork or official colours are used**, the plant is fictional, and every portal and sticker states it is a hackathon prototype, not an official L'Oréal product.

### Tokens (`packages/common/src/ui/theme.css`)

Neutrals `canvas surface sunken line line-strong ink ink-2 muted`, accent `brand`, states `ok warn crit info` (+ soft tints), severity ramp `sev1…sev5`, dark theme `night night-2 night-3 night-line night-text night-muted`. Focus ring is always visible; `prefers-reduced-motion` is honoured.

### Components (`packages/common/src/ui`)

`Button` (primary / secondary / ghost / danger / night), `Badge`, `SeverityBadge`, `StatusDot`, `Panel`, `Stat` (KPI with definition tooltip and click-through), `Field` / `Input` / `Select` / `Textarea`, `Segmented`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `Modal` (focus trap, Esc, focus return), `ToastProvider`, and SVG charts `BarList`, `Donut`, `Columns`, `Sparkline`.

## 4. Information architecture

```
/                worker portal home: Report an incident · Track my report · Get emergency help
/report          guided report (5 steps) · /receipt/:id · /track · /help · /board
:5174/q/:token   QR report (3 steps, place prefilled from the sticker, validated server-side)
/admin           Overview · Live CCTV · AI Monitoring · Incidents (+/:id) · QR Management · Factory Map ·
                 Audio Monitoring · Responders · Analytics · Investigations · Model Configuration · Settings
```

Code layout: `packages/common/src/{ui,components,routes,lib,i18n}` (shared), `2-user-report-site/src/{worker,routes,admin/{pages,components}}`, `1-sticker-app/src`.

## 5. What was verified

`npm run e2e` drives Chrome through: QR report, worker report and tracking (including lookup by reference + access code and a wrong code), emergency page, offline queue, Hindi, the 12-section sidebar, KPI click-through, live update without refresh, the full response workflow, the board, the CCTV workspace (search filter, expanded view, prev/next, filmstrip, layouts, return to grid), AI review, QR preview/PNG download/disable/enable, and all remaining admin pages. Screens were also reviewed visually from screenshots.
