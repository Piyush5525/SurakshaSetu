import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@common/lib/api';
import { Card, useGet } from './hooks';

interface N {
  id: number;
  incident_id: string;
  channel: string;
  recipient: string;
  status: string;
  simulated: number;
  level: number;
  detail: string;
  created_at: string;
  acknowledged_at: string | null;
}
interface R {
  id: number;
  name: string;
  department: string;
  role: string;
  available: number;
  has_telegram: number;
}
const DEPTS = [
  'Maintenance',
  'EHS',
  'Security',
  'Quality Assurance',
  'Laboratory',
  'Warehouse',
  'Logistics',
  'Waste Management',
];

export default function Notifications() {
  const ns = useGet<N[]>('/notifications?limit=150');
  const rs = useGet<R[]>('/responders');
  const [f, setF] = useState({ name: '', department: 'EHS', telegram_chat_id: '' });
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Alert history (Telegram + voice call)">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(['telegram', 'call'] as const).map((ch) => (
            <button
              key={ch}
              className="rounded border px-3 py-1 text-sm font-bold"
              onClick={() =>
                void api<{ status: string; reason?: string }>('/system/test-alert', {
                  json: { channel: ch },
                })
                  .then((r) =>
                    setTestMsg(`Test ${ch}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`),
                  )
                  .then(() => ns.reload())
                  .catch((x: unknown) => setTestMsg(x instanceof Error ? x.message : 'Failed'))
              }
            >
              Send test {ch}
            </button>
          ))}
          {testMsg && <span className="text-sm font-bold">{testMsg}</span>}
        </div>
        <p className="mb-2 text-sm text-slate-600">
          “simulated” means DEMO_MODE logged the message but nothing was sent. Calls only ever go to
          the configured on-call number, never to emergency services.
        </p>
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th>Time</th>
              <th>Incident</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Esc.</th>
              <th>Ack</th>
            </tr>
          </thead>
          <tbody>
            {ns.data?.map((n) => (
              <tr key={n.id} className="border-t">
                <td>{new Date(n.created_at).toLocaleTimeString()}</td>
                <td>
                  <Link className="font-mono underline" to={`/admin/incidents/${n.incident_id}`}>
                    {n.incident_id}
                  </Link>
                </td>
                <td>{n.channel}</td>
                <td
                  className={
                    n.status === 'failed' || n.status === 'blocked' ? 'font-bold text-red-700' : ''
                  }
                  title={n.detail}
                >
                  {n.status}
                  {n.simulated ? ' (sim)' : ''}
                </td>
                <td>{n.level || ''}</td>
                <td>
                  {n.acknowledged_at ? new Date(n.acknowledged_at).toLocaleTimeString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid content-start gap-4">
        <Card title="Responders">
          <ul className="grid gap-1 text-sm">
            {rs.data?.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded bg-slate-100 p-2">
                <span>
                  <b>{r.name}</b> · {r.department}
                  {r.role === 'manager' ? ' (manager)' : ''}
                  {r.has_telegram ? ' · Telegram' : ''}
                </span>
                <button
                  className={`rounded px-2 py-1 text-xs font-bold ${r.available ? 'bg-green-600 text-white' : 'bg-slate-300'}`}
                  onClick={() =>
                    void api(`/responders/${r.id}?available=${!r.available}`, {
                      method: 'PATCH',
                    }).then(rs.reload)
                  }
                >
                  {r.available ? 'Available' : 'Unavailable'}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Add responder">
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              api('/responders', {
                json: {
                  name: f.name,
                  department: f.department,
                  telegram_chat_id: f.telegram_chat_id || null,
                },
              })
                .then(() => (setF({ ...f, name: '', telegram_chat_id: '' }), rs.reload()))
                .catch((x: unknown) => setMsg(x instanceof Error ? x.message : 'Failed'));
            }}
          >
            <input
              required
              className="rounded border p-2"
              placeholder="Name"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
            <select
              className="rounded border p-2"
              value={f.department}
              onChange={(e) => setF({ ...f, department: e.target.value })}
            >
              {DEPTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <input
              className="rounded border p-2"
              placeholder="Telegram chat id (optional)"
              value={f.telegram_chat_id}
              onChange={(e) => setF({ ...f, telegram_chat_id: e.target.value })}
            />
            <button className="rounded bg-slate-900 p-2 font-bold text-white">Add</button>
            {msg && <p className="text-sm font-bold text-red-700">{msg}</p>}
          </form>
        </Card>
      </div>
    </div>
  );
}
