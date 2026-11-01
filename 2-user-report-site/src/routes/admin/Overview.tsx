import { Link } from 'react-router-dom';
import { Card, STATUS_LABEL, SOURCE_LABEL, Sev, SimTag, useGet, type Incident } from './hooks';

export interface Stats {
  total: number;
  open: number;
  critical: number;
  awaiting_ack: number;
  resolved: number;
  ai_events: number;
}

function Kpi({
  label,
  value,
  tone = '',
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow ${tone}`}>
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="text-4xl font-black">{value}</p>
    </div>
  );
}

export default function Overview() {
  const stats = useGet<Stats>('/analytics?days=30');
  const recent = useGet<{ items: Incident[] }>('/incidents?limit=8');
  const cams = useGet<{ id: string; online: boolean; enabled: number }[]>('/cameras');
  const s = stats.data;
  return (
    <div className="grid gap-4">
      {stats.error && <p className="font-bold text-red-700">{stats.error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total (30 days)" value={s?.total ?? '…'} />
        <Kpi label="Open" value={s?.open ?? '…'} />
        <Kpi
          label="Critical open"
          value={s?.critical ?? '…'}
          tone={s?.critical ? 'ring-4 ring-red-500' : ''}
        />
        <Kpi
          label="Awaiting acknowledgement"
          value={s?.awaiting_ack ?? '…'}
          tone={s?.awaiting_ack ? 'ring-4 ring-amber-400' : ''}
        />
        <Kpi label="Resolved" value={s?.resolved ?? '…'} />
        <Kpi
          label="Cameras online"
          value={
            cams.data ? `${cams.data.filter((c) => c.online).length}/${cams.data.length}` : '…'
          }
        />
      </div>
      <Card title="Latest incidents (updates live, no refresh needed)">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1">ID</th>
              <th>Sev</th>
              <th>Category</th>
              <th>Source</th>
              <th>Where</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {recent.data?.items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="py-2 font-mono">
                  <Link className="underline" to={`/admin/incidents/${i.id}`}>
                    {i.id}
                  </Link>
                </td>
                <td>
                  <Sev n={i.severity} />
                </td>
                <td>
                  {i.category.replace(/_/g, ' ')}
                  <SimTag on={i.simulated} />
                </td>
                <td>{SOURCE_LABEL[i.source]}</td>
                <td>{i.asset_id ?? i.zone ?? i.camera_id ?? ''}</td>
                <td>{STATUS_LABEL[i.status] ?? i.status}</td>
                <td>{new Date(i.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
