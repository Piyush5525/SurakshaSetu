import {
  estimatedSavings,
  hotspotCounts,
  medianHoursToClose,
  pctClosedWithVisibleFix,
  repeatHotspots,
  reportsPer100WorkersPerMonth,
  weeklyTrend,
  type KpiAction,
  type KpiReport,
} from '@shared/kpi';
import { MIN_GROUP_SIZE } from '@shared/domain';
import { pulseBy } from '@shared/pulse';
import { useMemo, useState } from 'react';
import type { Role } from './Admin';
import {
  useCol,
  type ActionDoc,
  type AssumptionDoc,
  type EventDoc,
  type FeedbackDoc,
  type LocationDoc,
  type ReportDoc,
} from './data';

function heat(n: number, max: number): string {
  if (!max || !n) return '#e2e8f0';
  const x = n / max;
  return x > 0.75 ? '#dc2626' : x > 0.5 ? '#f97316' : x > 0.25 ? '#facc15' : '#bef264';
}

export default function Overview({ role }: { role: Role }) {
  const reports = useCol<ReportDoc>('reports', 'createdAt');
  const actions = useCol<ActionDoc>('actions');
  const events = useCol<EventDoc>('events');
  const locations = useCol<LocationDoc>('locations');
  const assumptions = useCol<AssumptionDoc>('assumptions');
  const feedback = useCol<FeedbackDoc>('feedback', undefined, role === 'ehs_admin');
  const [shift, setShift] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const now = useMemo(() => new Date(), []);

  const kr: KpiReport[] = reports.rows.map((r) => ({
    locationId: r.locationId,
    hazardType: r.hazardType,
    shift: r.shift,
    status: r.status,
    createdAt: r.createdAt,
    ecoTag: r.ecoTag ?? 'none',
  }));
  const ka: KpiAction[] = actions.rows.map((a) => ({
    reportId: a.reportId,
    status: a.status,
    createdAt: a.createdAt,
    closedAt: a.closedAt,
    visibleFix: a.visibleFix,
  }));
  const A = (k: string, d: number) => assumptions.rows.find((x) => x.id === k)?.value ?? d;
  const workers = A('workers_on_line', 40);
  const per100 = reportsPer100WorkersPerMonth(kr, workers, now);
  const median = medianHoursToClose(ka);
  const visible = pctClosedWithVisibleFix(ka);
  const repeats = repeatHotspots(kr, now);
  const trend = weeklyTrend(kr, now, 8);
  const trendMax = Math.max(1, ...trend.map((t) => t.count));
  const counts = hotspotCounts(kr, shift === 'all' ? undefined : shift);
  const maxCount = Math.max(0, ...Object.values(counts));
  const savings = estimatedSavings(kr, {
    air_leak_kwh_per_event: A('air_leak_kwh_per_event', 0),
    steam_leak_kwh_per_event: A('steam_leak_kwh_per_event', 0),
    idle_machine_kwh_per_event: A('idle_machine_kwh_per_event', 0),
    spill_kg_per_event: A('spill_kg_per_event', 0),
  });
  const pulseAll = pulseBy(feedback.rows, () => 'all');
  const pulseShift = pulseBy(feedback.rows, (f) => `Shift ${f.shift}`);
  const open = actions.rows.filter((a) => a.status !== 'closed').length;
  const closed = actions.rows.length - open;
  const pendingEvents = events.rows.filter((e) => e.status === 'pending').length;
  const locName = (id: string) => locations.rows.find((l) => l.id === id)?.name ?? id;
  const err = reports.error ?? actions.error;

  return (
    <div className="grid gap-4">
      {err && <p className="rounded bg-red-100 p-3 text-red-800">Cannot load data: {err}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Reports / 100 workers / month"
          value={per100 ?? '–'}
          note={`headcount ${workers} (assumption)`}
        />
        <Kpi label="Median hours to close" value={median ?? '–'} note="action created → closed" />
        <Kpi
          label="Closed with visible fix"
          value={visible === null ? '–' : `${visible}%`}
          note="of closed actions"
        />
        <Kpi label="Repeat hotspots" value={repeats.length} note="same hazard ≥3× in 28 days" />
        <Kpi label="Open actions" value={open} note={`${closed} closed`} />
        <Kpi
          label="Camera events to confirm"
          value={pendingEvents}
          note="auto-detected, needs a human"
        />
        <Kpi
          label="Lockout confirmed on jam clearing"
          value={`${A('simulated_lockout_confirmed_pct', 0)}%`}
          note="SIMULATED in demo (no real sensor)"
          sim
        />
        <Kpi
          label="Est. saved (fixed eco-tagged)"
          value={`${savings.kwh} kWh · ${savings.kg} kg`}
          note="ESTIMATE from assumptions, not measured"
          sim
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Hotspot map: Line 3 (fictional plan)</h2>
            <div className="flex gap-1 text-sm">
              {(['all', 'A', 'B', 'C'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setShift(s)}
                  className={`rounded px-2 py-1 ${shift === s ? 'bg-slate-900 text-white' : 'bg-slate-200'}`}
                >
                  {s === 'all' ? 'All shifts' : `Shift ${s}`}
                </button>
              ))}
            </div>
          </div>
          <svg viewBox="0 0 580 310" className="w-full" role="img" aria-label="Floor plan heat map">
            {locations.rows.map((l) => (
              <g key={l.id}>
                <rect
                  x={l.floorPlan.x}
                  y={l.floorPlan.y}
                  width={l.floorPlan.w}
                  height={l.floorPlan.h}
                  rx={8}
                  fill={heat(counts[l.id] ?? 0, maxCount)}
                  stroke="#0f172a"
                  strokeWidth={2}
                />
                <text x={l.floorPlan.x + 8} y={l.floorPlan.y + 20} fontSize={13} fontWeight={700}>
                  {l.name}
                </text>
                <text x={l.floorPlan.x + 8} y={l.floorPlan.y + 40} fontSize={22} fontWeight={800}>
                  {counts[l.id] ?? 0}
                </text>
              </g>
            ))}
          </svg>
          <p className="text-xs text-slate-500">
            Counts = reports per location (aggregate; never per person). Colour scales to the
            busiest location.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 font-bold">Reports per week (more early on = healthy reporting)</h2>
          <svg viewBox="0 0 400 180" className="w-full" role="img" aria-label="Weekly reports">
            {trend.map((t, i) => {
              const h = (t.count / trendMax) * 130;
              return (
                <g key={t.week}>
                  <rect x={15 + i * 47} y={150 - h} width={36} height={h} fill="#0f172a" rx={4} />
                  <text
                    x={33 + i * 47}
                    y={145 - h}
                    fontSize={12}
                    textAnchor="middle"
                    fontWeight={700}
                  >
                    {t.count}
                  </text>
                  <text x={33 + i * 47} y={168} fontSize={9} textAnchor="middle">
                    {t.week.slice(5)}
                  </text>
                </g>
              );
            })}
          </svg>
          <h3 className="mt-3 text-sm font-bold">Repeat hotspots</h3>
          {repeats.length === 0 ? (
            <p className="text-sm text-slate-500">None right now.</p>
          ) : (
            <ul className="text-sm">
              {repeats.map((r) => (
                <li key={r.locationId + r.hazardType}>
                  {locName(r.locationId)} · {r.hazardType.replace('_', ' ')} · {r.count}×
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow">
        <h2 className="font-bold">Employee pulse (anonymous, aggregate only)</h2>
        {role !== 'ehs_admin' ? (
          <p className="text-sm text-slate-500">Visible to EHS admins only.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-6 text-sm">
            {[...pulseAll, ...pulseShift].map((g) => (
              <div key={g.key}>
                <p className="font-semibold">{g.key === 'all' ? 'Whole line' : g.key}</p>
                <p className="text-2xl font-black">{g.mean === null ? 'n<5' : `${g.mean} / 5`}</p>
                <p className="text-slate-500">
                  {g.n} responses{g.mean === null ? ` (hidden below ${MIN_GROUP_SIZE})` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  sim,
}: {
  label: string;
  value: string | number;
  note: string;
  sim?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow ${sim ? 'border-2 border-dashed border-amber-500 bg-amber-50' : 'bg-white'}`}
    >
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="text-3xl font-black">{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}
