import { Fragment, useEffect, useState } from 'react';
import { api } from '@common/lib/api';
import { Card, useGet } from './hooks';

interface Det {
  name: string;
  number: number | null;
  label: string;
  category: string;
  maturity: string;
  repo: string;
  weights: string;
  classes: string[];
  model: string;
  licence: string;
  note: string;
  implemented: boolean;
  enabled: boolean;
  min_conf: number | null;
  requires_verification: boolean;
  incidents_total: number;
  confirmed: number;
  false_positives: number;
  events_seen: number;
  last_detection: string | null;
  load_status: Record<string, string>;
}
interface Cam {
  id: string;
  name: string;
  kind: string;
  online: boolean;
  detectors: string[];
}
interface Route {
  category: string;
  label: string;
  department: string;
  secondary: string | null;
  customised: boolean;
}

const MATURITY: Record<string, { cls: string; text: string }> = {
  trained: { cls: 'bg-green-100 text-green-800', text: 'trained, checked' },
  external: { cls: 'bg-sky-100 text-sky-800', text: 'third-party weights' },
  rules: { cls: 'bg-indigo-100 text-indigo-800', text: 'rules' },
  heuristic: { cls: 'bg-amber-100 text-amber-800', text: 'heuristic' },
  open_vocab: { cls: 'bg-orange-100 text-orange-800', text: 'zero-shot' },
  simulated: { cls: 'bg-purple-100 text-purple-800', text: 'simulated' },
};
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
const EXAMPLE = {
  zones: [
    {
      id: 'danger-1',
      type: 'machine_danger',
      location_id: 'filler',
      polygon: [
        [360, 200],
        [620, 200],
        [620, 460],
        [360, 460],
      ],
    },
    {
      id: 'bin-plastic',
      type: 'waste_bin',
      allowed: ['plastic', 'metal'],
      capacity: 6,
      polygon: [
        [0, 200],
        [200, 200],
        [200, 400],
        [0, 400],
      ],
    },
  ],
  calibration: { px_per_m: 120 },
  forklift: { caution_m: 3.0, critical_m: 1.5, closing_caution_mps: 1.0 },
};

function statusOf(d: Det): { text: string; cls: string } {
  if (!d.implemented) return { text: 'not available', cls: 'bg-slate-200' };
  const v = Object.values(d.load_status);
  if (v.length === 0) return { text: 'worker not started', cls: 'bg-slate-200' };
  if (v.every((s) => s === 'ready'))
    return { text: `loaded on ${v.length} camera(s)`, cls: 'bg-green-200' };
  return { text: v.find((s) => s !== 'ready') ?? 'unavailable', cls: 'bg-red-200' };
}

export default function CvMonitor() {
  const dets = useGet<Det[]>('/detectors');
  const cams = useGet<Cam[]>('/cameras');
  const routing = useGet<Route[]>('/routing', false);
  const [open, setOpen] = useState('');
  const [cam, setCam] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const cameras = cams.data?.filter((c) => c.kind === 'camera') ?? [];

  useEffect(() => {
    if (!cam) return;
    api<{ config: object }>(`/cameras/${cam}/config`)
      .then((r) =>
        setText(JSON.stringify(Object.keys(r.config).length ? r.config : EXAMPLE, null, 2)),
      )
      .catch(() => setText(''));
  }, [cam]);

  const run = async (p: () => Promise<unknown>, ok = '') => {
    try {
      await p();
      setMsg(ok);
      dets.reload();
      cams.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  };
  const toggleCam = (c: Cam, name: string) =>
    run(() =>
      api(`/cameras/${c.id}`, {
        method: 'PATCH',
        json: {
          detectors: c.detectors.includes(name)
            ? c.detectors.filter((x) => x !== name)
            : [...c.detectors, name],
        },
      }),
    );
  const numbered = (dets.data ?? []).filter((d) => d.number !== null);
  const extras = (dets.data ?? []).filter((d) => d.number === null);

  return (
    <div className="grid gap-4">
      <p className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">
        Every detector only creates a <b>potential</b> event: it is confirmed over several frames,
        then handed to the central incident engine (severity, routing, alerts). No detector sends a
        notification by itself. “Third-party weights” means trained by someone else on their data:
        it loads and runs here, but accuracy on this plant is unmeasured.
      </p>
      {msg && <p className="font-bold">{msg}</p>}

      <Card title="Computer vision capabilities (live)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1">#</th>
                <th>Capability</th>
                <th>Maturity</th>
                <th>Model status</th>
                <th>Events</th>
                <th>Confirmed</th>
                <th>False +</th>
                <th>Last detection</th>
                <th>Min conf</th>
                <th>On</th>
              </tr>
            </thead>
            <tbody>
              {[...numbered, ...extras].map((d) => {
                const st = statusOf(d);
                const m = MATURITY[d.maturity] ?? MATURITY.rules!;
                return (
                  <Fragment key={d.name}>
                    <tr key={d.name} className="border-t align-top">
                      <td className="py-2 font-bold">{d.number ?? '+'}</td>
                      <td>
                        <button
                          className="text-left font-bold underline"
                          onClick={() => setOpen(open === d.name ? '' : d.name)}
                        >
                          {d.label}
                        </button>
                        {d.requires_verification && (
                          <span className="ml-1 text-xs font-bold text-amber-700">
                            human verification
                          </span>
                        )}
                        <span className="block text-xs text-slate-500">
                          {d.category.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`rounded px-1.5 text-xs font-bold ${m.cls}`}>
                          {m.text}
                        </span>
                      </td>
                      <td>
                        <span className={`rounded px-1.5 text-xs ${st.cls}`}>{st.text}</span>
                      </td>
                      <td>{d.events_seen}</td>
                      <td>{d.confirmed}</td>
                      <td>{d.false_positives}</td>
                      <td className="text-xs">
                        {d.last_detection ? new Date(d.last_detection).toLocaleString() : '—'}
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.05"
                          min="0.05"
                          max="0.99"
                          className="w-16 rounded border p-1"
                          defaultValue={d.min_conf ?? ''}
                          aria-label={`Minimum confidence for ${d.label}`}
                          onBlur={(e) =>
                            e.target.value &&
                            void run(
                              () =>
                                api(`/detectors/${d.name}`, {
                                  method: 'PATCH',
                                  json: { min_conf: Number(e.target.value) },
                                }),
                              'Saved',
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          disabled={!d.implemented}
                          className={`rounded px-3 py-1 text-sm font-bold ${d.enabled ? 'bg-green-600 text-white' : 'bg-slate-300'}`}
                          onClick={() =>
                            void run(() =>
                              api(`/detectors/${d.name}`, {
                                method: 'PATCH',
                                json: { enabled: !d.enabled },
                              }),
                            )
                          }
                        >
                          {d.enabled ? 'On' : 'Off'}
                        </button>
                      </td>
                    </tr>
                    {open === d.name && (
                      <tr key={`${d.name}-detail`} className="bg-slate-50">
                        <td colSpan={10} className="p-3 text-sm">
                          <dl className="grid gap-x-6 gap-y-1 md:grid-cols-[10rem_1fr]">
                            <dt className="text-slate-500">Source repository</dt>
                            <dd>{d.repo}</dd>
                            <dt className="text-slate-500">Model / weights</dt>
                            <dd>
                              {d.model} · <code>{d.weights}</code>
                            </dd>
                            <dt className="text-slate-500">Classes</dt>
                            <dd>{d.classes.join(', ') || '—'}</dd>
                            <dt className="text-slate-500">Licence</dt>
                            <dd>{d.licence}</dd>
                            <dt className="text-slate-500">Limitations</dt>
                            <dd>{d.note}</dd>
                            <dt className="text-slate-500">Load status</dt>
                            <dd>
                              {Object.keys(d.load_status).length
                                ? Object.entries(d.load_status)
                                    .map(([c, s]) => `${c}: ${s}`)
                                    .join(' · ')
                                : 'start the CV worker'}
                            </dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Camera assignment (which detectors run on which camera)">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="pr-4 text-left">Detector</th>
                {cameras.map((c) => (
                  <th key={c.id} className="px-2 text-xs">
                    {c.name}
                    <span className={`block ${c.online ? 'text-green-700' : 'text-slate-400'}`}>
                      {c.online ? 'LIVE' : 'offline'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {numbered
                .concat(extras)
                .filter((d) => d.implemented)
                .map((d) => (
                  <tr key={d.name} className="border-t">
                    <td className="py-1 pr-4">{d.label}</td>
                    {cameras.map((c) => (
                      <td key={c.id} className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`${d.label} on ${c.name}`}
                          checked={c.detectors.includes(d.name)}
                          onChange={() => void toggleCam(c, d.name)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Changes apply the next time the CV worker starts.
        </p>
      </Card>

      <Card title="Zones, calibration and thresholds (per camera)">
        <p className="mb-2 text-sm text-slate-600">
          Zone types: <code>machine_danger</code>, <code>forklift_lane</code>,{' '}
          <code>ppe_required</code>, <code>no_waste</code>, <code>waste_bin</code> (with{' '}
          <code>allowed</code> groups biodegradable / plastic / metal / hazardous and optional{' '}
          <code>capacity</code>), <code>storage</code>, <code>spill_watch</code>. Coordinates are
          pixels of that camera. <code>calibration.px_per_m</code> turns forklift distances into
          real metres; without it they are labelled estimates. Draw polygons with{' '}
          <code>python -m vision_service.draw_zones --source VIDEO</code> and paste the points.
        </p>
        <select
          className="mb-2 rounded border p-2"
          value={cam}
          onChange={(e) => setCam(e.target.value)}
          aria-label="Camera to configure"
        >
          <option value="">Choose a camera…</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {cam && (
          <>
            <textarea
              className="h-72 w-full rounded border p-2 font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Camera configuration JSON"
            />
            <button
              className="mt-2 rounded bg-slate-900 px-4 py-2 font-bold text-white"
              onClick={() => {
                let parsed: unknown;
                try {
                  parsed = JSON.parse(text);
                } catch {
                  return setMsg('Not valid JSON');
                }
                void run(
                  () => api(`/cameras/${cam}/config`, { method: 'PUT', json: parsed }),
                  'Configuration saved (restart the worker to apply)',
                );
              }}
            >
              Save configuration
            </button>
          </>
        )}
      </Card>

      <Card title="Department routing (editable by admin)">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th>Category</th>
              <th>Primary department</th>
              <th>Also notify</th>
            </tr>
          </thead>
          <tbody>
            {routing.data?.map((r) => (
              <tr key={r.category} className="border-t">
                <td className="py-1">
                  {r.label}
                  {r.customised && <span className="ml-1 text-xs text-sky-700">customised</span>}
                </td>
                {(['department', 'secondary'] as const).map((k) => (
                  <td key={k}>
                    <select
                      className="rounded border p-1"
                      value={r[k] ?? ''}
                      aria-label={`${k} for ${r.label}`}
                      onChange={(e) =>
                        void run(
                          () =>
                            api(`/routing/${r.category}`, {
                              method: 'PUT',
                              json: {
                                department: k === 'department' ? e.target.value : r.department,
                                secondary:
                                  (k === 'secondary' ? e.target.value : r.secondary) || null,
                              },
                            }).then(routing.reload),
                          'Routing saved',
                        )
                      }
                    >
                      {k === 'secondary' && <option value="">—</option>}
                      {DEPTS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
