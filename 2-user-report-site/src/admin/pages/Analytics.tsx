import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarList, Columns, Donut } from '@common/ui/charts';
import { ErrorState, Panel, Progress, Segmented, Spinner, Stat } from '@common/ui/primitives';
import { PageHeader } from '../components/shared';
import { qs, useGet } from '../data';
import { CATEGORY, SOURCE, SOURCE_COLOR } from '../labels';

interface Perf {
  key: string;
  total: number;
  resolved: number;
  avg_ack_min: number | null;
  avg_resolve_min: number | null;
}
interface KV {
  key: string;
  n: number;
}
interface Dash {
  kpi: Record<string, number | null>;
  dept_perf: Perf[];
  zone_perf: Perf[];
  by_category: KV[];
  by_severity: KV[];
  trend: { day: string; source: string; n: number }[];
  investigation: {
    resolved: number;
    with_root_cause: number;
    with_corrective: number;
    with_preventive: number;
    open_without_root_cause: number;
    root_causes: KV[];
  };
}
interface Old {
  repeat_locations: KV[];
  false_positive_rate: number | null;
  ai_events: number;
  ai_reviewed: number;
  false_positive_note: string;
}

const PAL = [
  '#c8102e',
  '#44403c',
  '#0369a1',
  '#ca8a04',
  '#15803d',
  '#7c3aed',
  '#ea580c',
  '#0f766e',
  '#a8a29e',
];

function PerfTable({ rows, onPick }: { rows: Perf[]; onPick: (k: string) => void }) {
  if (!rows.length) return <p className="py-3 text-sm text-muted">No data in this period.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="py-1 font-medium">Name</th>
          <th className="font-medium">Incidents</th>
          <th className="font-medium">Resolved</th>
          <th className="font-medium">Avg to acknowledge</th>
          <th className="font-medium">Avg to resolve</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className="cursor-pointer border-t border-line hover:bg-sunken"
            onClick={() => onPick(r.key)}
          >
            <td className="py-2 font-medium">{r.key}</td>
            <td className="tabular">{r.total}</td>
            <td className="w-40">
              <div className="flex items-center gap-2">
                <Progress value={(r.resolved / r.total) * 100} tone="ok" />
                <span className="tabular text-xs">{Math.round((r.resolved / r.total) * 100)}%</span>
              </div>
            </td>
            <td className="tabular">{r.avg_ack_min != null ? `${r.avg_ack_min} min` : '—'}</td>
            <td className="tabular">
              {r.avg_resolve_min != null ? `${r.avg_resolve_min} min` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Analytics() {
  const nav = useNavigate();
  const [days, setDays] = useState('30');
  const d = useGet<Dash>(`/analytics/dashboard?days=${days}`);
  const o = useGet<Old>(`/analytics?days=${days}`);
  const from = new Date(Date.now() - Number(days) * 86400000).toISOString().slice(0, 10);
  const go = (p: Record<string, string>) => nav(`/admin/incidents${qs({ ...p, date_from: from })}`);
  if (d.error) return <ErrorState message={d.error} onRetry={d.reload} />;
  if (!d.data) return <Spinner />;
  const x = d.data;
  const inv = x.investigation;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const dayList = [...new Set(x.trend.map((t) => t.day))];
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5">
      <PageHeader
        title="Analytics"
        subtitle="Reports built from the incident database. Synthetic demonstration records are included and flagged on the Overview page."
        actions={
          <Segmented
            label="Period"
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
            ]}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Avg response (acknowledge)"
          value={x.kpi.avg_response_min != null ? `${x.kpi.avg_response_min} min` : '—'}
        />
        <Stat
          label="Avg resolution"
          value={x.kpi.avg_resolve_min != null ? `${x.kpi.avg_resolve_min} min` : '—'}
        />
        <Stat
          label="False-positive rate (AI, reviewed)"
          value={
            o.data?.false_positive_rate == null
              ? '—'
              : `${Math.round(o.data.false_positive_rate * 100)}%`
          }
          hint={`${o.data?.ai_reviewed ?? 0} of ${o.data?.ai_events ?? 0} AI events reviewed`}
          definition={o.data?.false_positive_note}
        />
        <Stat
          label="Corrective action recorded"
          value={pct(inv.with_corrective, inv.resolved)}
          hint={`of ${inv.resolved} resolved incidents`}
          definition="Share of resolved or closed incidents that have a corrective action written down. It measures documentation, not whether the action worked."
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Incident trend by source" className="xl:col-span-2">
          <Columns
            days={dayList}
            series={Object.keys(SOURCE).map((s) => ({
              key: s,
              label: SOURCE[s]!,
              color: SOURCE_COLOR[s]!,
              values: dayList.map(
                (day) => x.trend.find((t) => t.day === day && t.source === s)?.n ?? 0,
              ),
            }))}
            onPick={(day) => nav(`/admin/incidents${qs({ date_from: day, date_to: day })}`)}
          />
        </Panel>
        <Panel title="Severity breakdown">
          <BarList
            data={[5, 4, 3, 2, 1].map((s) => ({
              key: String(s),
              label: `Severity ${s}`,
              value: x.by_severity.find((v) => String(v.key) === String(s))?.n ?? 0,
            }))}
            onPick={(v) => go({ severity_min: v.key })}
          />
        </Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Category breakdown">
          <Donut
            data={x.by_category.map((c, i) => ({
              key: c.key,
              label: CATEGORY[c.key] ?? c.key,
              value: c.n,
              color: PAL[i % PAL.length],
            }))}
            onPick={(v) => go({ category: v.key })}
          />
        </Panel>
        <Panel title="Repeat incident locations (3 or more)">
          {o.data?.repeat_locations.length ? (
            <BarList
              data={o.data.repeat_locations.map((r) => ({ key: r.key, label: r.key, value: r.n }))}
              onPick={(v) => go({ asset_id: v.key })}
            />
          ) : (
            <p className="text-sm text-muted">No machine has 3 or more incidents in this period.</p>
          )}
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Department performance">
          <PerfTable rows={x.dept_perf} onPick={(k) => go({ department: k })} />
        </Panel>
        <Panel title="Factory zone comparison (single demo site)">
          <PerfTable rows={x.zone_perf} onPick={(k) => go({ zone: k })} />
        </Panel>
      </div>
      <Panel title="Root causes and corrective actions">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm text-muted">
              Resolved incidents with the investigation recorded
            </p>
            {[
              ['Root cause', inv.with_root_cause],
              ['Corrective action', inv.with_corrective],
              ['Preventive action', inv.with_preventive],
            ].map(([l, n]) => (
              <div key={l as string} className="mb-3">
                <p className="mb-1 flex justify-between text-sm">
                  <span>{l}</span>
                  <span className="tabular">
                    {n} of {inv.resolved} ({pct(n as number, inv.resolved)})
                  </span>
                </p>
                <Progress
                  value={inv.resolved ? ((n as number) / inv.resolved) * 100 : 0}
                  tone="ok"
                />
              </div>
            ))}
            <p className="text-sm">
              <b>{inv.open_without_root_cause}</b> open incident
              {inv.open_without_root_cause === 1 ? '' : 's'} in progress without a root cause yet.
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted">
              Incidents with a root cause recorded, by category
            </p>
            <BarList
              data={inv.root_causes.map((r) => ({
                key: r.key,
                label: CATEGORY[r.key] ?? r.key,
                value: r.n,
              }))}
              onPick={(v) => go({ category: v.key })}
              empty="No root causes recorded yet."
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}
