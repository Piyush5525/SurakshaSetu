import { useState } from 'react';
import { Card, useGet } from './hooks';

interface KV {
  key: string;
  n: number;
}
interface A {
  days: number;
  total: number;
  by_category: KV[];
  by_department: KV[];
  by_location: KV[];
  by_source: KV[];
  trend: { day: string; n: number }[];
  avg_ack_minutes: number | null;
  avg_resolve_minutes: number | null;
  repeat_locations: KV[];
  ai_events: number;
  ai_reviewed: number;
  false_positive_rate: number | null;
  false_positive_note: string;
  simulated_count: number;
}

function Bars({ rows }: { rows: KV[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="grid gap-1">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="truncate">{(r.key ?? 'unknown').replace(/_/g, ' ')}</span>
          <span className="h-4 rounded bg-slate-200">
            <span
              className="block h-4 rounded bg-slate-800"
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-bold">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data: a } = useGet<A>(`/analytics?days=${days}`);
  if (!a) return <p>Loading…</p>;
  const maxDay = Math.max(1, ...a.trend.map((t) => t.n));
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold">Period</label>
        <select
          className="rounded border p-1"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        {a.simulated_count > 0 && (
          <span className="rounded border border-dashed border-purple-500 px-2 text-xs font-bold text-purple-700">
            {a.simulated_count} of {a.total} incidents are SAMPLE/SIMULATED data
          </span>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Card title="Avg time to acknowledge">
          <p className="text-3xl font-black">
            {a.avg_ack_minutes ?? '—'}
            <span className="text-base"> min</span>
          </p>
        </Card>
        <Card title="Avg time to resolve">
          <p className="text-3xl font-black">
            {a.avg_resolve_minutes ?? '—'}
            <span className="text-base"> min</span>
          </p>
        </Card>
        <Card title="AI events">
          <p className="text-3xl font-black">{a.ai_events}</p>
          <p className="text-xs text-slate-500">{a.ai_reviewed} reviewed</p>
        </Card>
        <Card title="False-positive rate (AI)">
          <p className="text-3xl font-black">
            {a.false_positive_rate == null ? '—' : `${Math.round(a.false_positive_rate * 100)}%`}
          </p>
          <p className="text-xs text-slate-500">{a.false_positive_note}</p>
        </Card>
      </div>
      <Card title="Incidents per day">
        <div className="flex h-32 items-end gap-1" role="img" aria-label="Incidents per day">
          {a.trend.map((t) => (
            <div
              key={t.day}
              title={`${t.day}: ${t.n}`}
              className="flex-1 rounded-t bg-slate-800"
              style={{ height: `${(t.n / maxDay) * 100}%` }}
            />
          ))}
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="By category">
          <Bars rows={a.by_category} />
        </Card>
        <Card title="By department">
          <Bars rows={a.by_department} />
        </Card>
        <Card title="By location">
          <Bars rows={a.by_location} />
        </Card>
        <Card title="By source (QR, portal, CCTV, audio, admin)">
          <Bars rows={a.by_source} />
        </Card>
        <Card title="Repeat incident locations (3+)">
          {a.repeat_locations.length ? (
            <Bars rows={a.repeat_locations} />
          ) : (
            <p className="text-sm text-slate-500">None.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
