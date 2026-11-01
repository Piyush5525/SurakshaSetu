import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { absUrl, api } from '@common/lib/api';
import { Card, SOURCE_LABEL, STATUS_LABEL, Sev, SimTag, useGet, type Incident } from './hooks';

interface Detail extends Incident {
  evidence: { id: string; kind: string; url: string; note: string | null }[];
  history: { status: string; ts: string; actor: string | null; note: string | null }[];
  notifications: {
    id: number;
    channel: string;
    recipient: string;
    status: string;
    simulated: number;
    level: number;
    created_at: string;
    acknowledged_at: string | null;
    detail: string;
  }[];
  responder: { id: number; name: string; department: string } | null;
}
interface Responder {
  id: number;
  name: string;
  department: string;
  available: number;
}

const NEXT: Record<string, string[]> = {
  reported: ['acknowledged'],
  analysed: ['acknowledged'],
  alerted: ['acknowledged'],
  escalated: ['acknowledged'],
  acknowledged: ['in_progress', 'resolved'],
  assigned: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
  resolved: ['closed', 'in_progress'],
};
const SIDE = ['false_positive', 'duplicate', 'rejected'];
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

function DetailPanel({ id }: { id: string }) {
  const d = useGet<Detail>(`/incidents/${id}`);
  const [dept, setDept] = useState('');
  const [msg, setMsg] = useState('');
  const resp = useGet<Responder[]>(
    `/responders?department=${encodeURIComponent(dept || d.data?.department || '')}`,
    false,
  );
  const [notes, setNotes] = useState({
    investigation_notes: '',
    root_cause: '',
    corrective_action: '',
    preventive_action: '',
    public_update: '',
  });
  useEffect(() => {
    if (d.data)
      setNotes({
        investigation_notes: d.data.investigation_notes ?? '',
        root_cause: d.data.root_cause ?? '',
        corrective_action: d.data.corrective_action ?? '',
        preventive_action: d.data.preventive_action ?? '',
        public_update: d.data.public_update ?? '',
      });
  }, [d.data?.id, d.data?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data) return <p>{d.error || 'Loading…'}</p>;
  const x = d.data;
  const act = async (p: () => Promise<unknown>) => {
    setMsg('');
    try {
      await p();
      d.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  };
  const setStatus = (status: string) =>
    act(() => api(`/incidents/${id}/status`, { json: { status } }));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 lg:col-span-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-2xl font-black">{x.id}</h2>
            <Sev n={x.severity} />
            <span className="rounded bg-slate-200 px-2 py-0.5 text-sm font-bold">
              {STATUS_LABEL[x.status]}
            </span>
            <SimTag on={x.simulated} />
            {x.requires_verification ? (
              <span className="rounded bg-amber-300 px-2 py-0.5 text-sm font-bold">
                AI event: human verification required
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-lg">{x.description || '(no description)'}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
            <dt className="text-slate-500">Category</dt>
            <dd className="font-bold">{x.category.replace(/_/g, ' ')}</dd>
            <dt className="text-slate-500">Source</dt>
            <dd className="font-bold">{SOURCE_LABEL[x.source]}</dd>
            <dt className="text-slate-500">Machine / camera</dt>
            <dd className="font-bold">{x.asset_id ?? x.camera_id ?? x.audio_id ?? '—'}</dd>
            <dt className="text-slate-500">Location</dt>
            <dd className="font-bold">
              {[x.site, x.building, x.zone].filter(Boolean).join(' / ') || '—'}
            </dd>
            <dt className="text-slate-500">Department</dt>
            <dd className="font-bold">{x.department}</dd>
            <dt className="text-slate-500">Responder</dt>
            <dd className="font-bold">{x.responder?.name ?? 'unassigned'}</dd>
            <dt className="text-slate-500">Reported</dt>
            <dd className="font-bold">{new Date(x.created_at).toLocaleString()}</dd>
            {x.ai_model && (
              <>
                <dt className="text-slate-500">AI model</dt>
                <dd className="font-bold">{x.ai_model}</dd>
                <dt className="text-slate-500">AI class / confidence</dt>
                <dd className="font-bold">
                  {x.ai_class} ·{' '}
                  {x.ai_confidence != null ? `${Math.round(x.ai_confidence * 100)}%` : 'n/a'}
                </dd>
              </>
            )}
          </dl>
          <p className="mt-3 text-sm font-bold">
            Why severity {x.severity} (confidence never sets severity):
          </p>
          <ul className="list-disc pl-6 text-sm">
            {x.severity_reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>

        <Card title="Evidence">
          {x.evidence.length === 0 && <p className="text-slate-500">No files attached.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {x.evidence.map((e) => (
              <figure key={e.id} className="rounded-xl border p-2">
                {e.kind === 'image' && (
                  <img
                    src={absUrl(e.url)}
                    alt="evidence"
                    className="max-h-72 w-full rounded object-contain"
                  />
                )}
                {e.kind === 'video' && (
                  <video src={absUrl(e.url)} controls className="max-h-72 w-full rounded" />
                )}
                {e.kind === 'audio' && <audio src={absUrl(e.url)} controls className="w-full" />}
                <figcaption className="text-xs text-slate-500">
                  {e.kind}
                  {e.note ? ` · ${e.note}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Links expire after 10 minutes. Snapshots of people are pixelated by the camera service;
            evidence is deleted after the retention period.
          </p>
        </Card>

        <Card title="Investigation and resolution">
          {(
            ['investigation_notes', 'root_cause', 'corrective_action', 'preventive_action'] as const
          ).map((k) => (
            <label key={k} className="mb-2 block text-sm font-semibold capitalize">
              {k.replace(/_/g, ' ')}
              <textarea
                className="mt-1 w-full rounded border p-2 font-normal"
                rows={k === 'investigation_notes' ? 3 : 2}
                value={notes[k]}
                onChange={(e) => setNotes({ ...notes, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="mb-2 block text-sm font-semibold">
            Public update shown to the reporter and on the “You said, we did” board once resolved
            <input
              className="mt-1 w-full rounded border p-2 font-normal"
              maxLength={300}
              value={notes.public_update}
              onChange={(e) => setNotes({ ...notes, public_update: e.target.value })}
            />
          </label>
          <button
            className="rounded bg-slate-900 px-4 py-2 font-bold text-white"
            onClick={() =>
              void act(() => api(`/incidents/${id}`, { method: 'PATCH', json: notes }))
            }
          >
            Save notes
          </button>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card title="Workflow">
          <div className="flex flex-wrap gap-2">
            {(NEXT[x.status] ?? []).map((s) => (
              <button
                key={s}
                className="rounded bg-yellow-300 px-3 py-2 font-bold"
                onClick={() => void setStatus(s)}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {!['closed', 'rejected', 'false_positive', 'duplicate'].includes(x.status) && (
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              {SIDE.map((s) => (
                <button
                  key={s}
                  className="rounded border px-3 py-1 text-sm font-semibold"
                  onClick={() => void setStatus(s)}
                >
                  Mark {(STATUS_LABEL[s] ?? s).toLowerCase()}
                </button>
              ))}
            </div>
          )}
          {msg && <p className="mt-2 text-sm font-bold text-red-700">{msg}</p>}
        </Card>

        <Card title="Assign">
          <label className="block text-sm font-semibold">
            Department
            <select
              className="mt-1 w-full rounded border p-2"
              value={dept || x.department || ''}
              onChange={(e) => setDept(e.target.value)}
            >
              {DEPTS.map((d2) => (
                <option key={d2}>{d2}</option>
              ))}
            </select>
          </label>
          <button
            className="mt-2 rounded border px-3 py-1 text-sm font-bold"
            onClick={() =>
              void act(() =>
                api(`/incidents/${id}/assign`, { json: { department: dept || x.department } }),
              )
            }
          >
            Route to department
          </button>
          <p className="mt-3 text-sm font-semibold">
            Responders (by department and availability, not by distance)
          </p>
          <ul className="mt-1 grid gap-1">
            {resp.data?.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded bg-slate-100 p-2 text-sm"
              >
                <span>
                  {r.name}
                  {r.available ? '' : ' (unavailable)'}
                </span>
                <button
                  disabled={!r.available}
                  className="rounded bg-slate-900 px-2 py-1 text-xs font-bold text-white disabled:opacity-40"
                  onClick={() =>
                    void act(() =>
                      api(`/incidents/${id}/assign`, {
                        json: { department: dept || x.department, responder_id: r.id },
                      }),
                    )
                  }
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Timeline">
          <ol className="grid gap-1 text-sm">
            {x.history.map((h, n) => (
              <li key={n} className="border-l-4 border-slate-300 pl-2">
                <b>{STATUS_LABEL[h.status] ?? h.status}</b> · {new Date(h.ts).toLocaleTimeString()}{' '}
                · {h.actor}
                {h.note ? <span className="block text-slate-500">{h.note}</span> : null}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Alerts sent">
          {x.notifications.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <ul className="grid gap-1 text-sm">
            {x.notifications.map((n) => (
              <li key={n.id} className="rounded bg-slate-100 p-2">
                <b>{n.channel}</b> → {n.recipient} · <b>{n.status}</b>
                {n.simulated ? ' (simulated)' : ''}
                {n.level ? ` · escalation ${n.level}` : ''}
                <span className="block text-xs text-slate-500">
                  {n.acknowledged_at
                    ? `acknowledged ${new Date(n.acknowledged_at).toLocaleTimeString()}`
                    : 'not yet acknowledged'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function Incidents() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [f, setF] = useState({
    asset_id: sp.get('asset') ?? '',
    q: '',
    status: '',
    category: '',
    source: '',
    severity_min: '',
    open_only: false,
  });
  const qs = new URLSearchParams(
    Object.entries(f)
      .filter(([, v]) => v !== '' && v !== false)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  const list = useGet<{ total: number; items: Incident[] }>(`/incidents?limit=100&${qs}`);
  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <select
      className="rounded border p-2 text-sm"
      aria-label={label}
      value={String(f[k])}
      onChange={(e) => setF({ ...f, [k]: e.target.value })}
    >
      <option value="">{label}</option>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  if (id) {
    return (
      <div>
        <button
          className="mb-3 rounded border bg-white px-3 py-1 font-bold"
          onClick={() => nav('/admin/incidents')}
        >
          ← All incidents
        </button>
        <DetailPanel id={id} />
      </div>
    );
  }
  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="rounded border p-2 text-sm"
          placeholder="Search ID or text"
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
        />
        {sel('status', 'Any status', Object.entries(STATUS_LABEL))}
        {sel('source', 'Any source', Object.entries(SOURCE_LABEL))}
        {sel('severity_min', 'Any severity', [
          ['3', 'S3+'],
          ['4', 'S4+'],
          ['5', 'S5'],
        ])}
        <input
          className="rounded border p-2 text-sm"
          placeholder="Category (e.g. fire_explosion)"
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={f.open_only}
            onChange={(e) => setF({ ...f, open_only: e.target.checked })}
          />{' '}
          Open only
        </label>
        <span className="ml-auto text-sm text-slate-500">{list.data?.total ?? 0} incidents</span>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1">ID</th>
            <th>Sev</th>
            <th>Category</th>
            <th>Source</th>
            <th>Where</th>
            <th>Dept</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.items.map((i) => (
            <tr
              key={i.id}
              className="cursor-pointer border-t hover:bg-yellow-50"
              onClick={() => nav(`/admin/incidents/${i.id}`)}
            >
              <td className="py-2 font-mono">{i.id}</td>
              <td>
                <Sev n={i.severity} />
              </td>
              <td>
                {i.category.replace(/_/g, ' ')}
                <SimTag on={i.simulated} />
                {i.requires_verification ? (
                  <span className="ml-1 text-xs font-bold text-amber-700">verify</span>
                ) : null}
              </td>
              <td>{SOURCE_LABEL[i.source]}</td>
              <td>{i.asset_id ?? i.camera_id ?? i.audio_id ?? ''}</td>
              <td>{i.department}</td>
              <td>{STATUS_LABEL[i.status]}</td>
              <td>{new Date(i.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
