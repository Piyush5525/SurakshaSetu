import { Fragment, useEffect, useState } from 'react';
import { api } from '@common/lib/api';
import { Badge, Button, ErrorState, Panel, Skeleton, Textarea } from '@common/ui/primitives';
import { useToast } from '@common/ui/overlay';
import { PageHeader } from '../components/shared';
import { useGet } from '../data';
import { ago } from '../labels';
import type { Det } from './AiMonitoring';

type Full = Det & { repo: string; model: string; licence: string; note: string };
interface Cam {
  id: string;
  name: string;
  kind: string;
  online: boolean;
  detectors: string[];
}

const MATURITY: Record<string, { tone: 'ok' | 'info' | 'warn' | 'neutral'; text: string }> = {
  trained: { tone: 'ok', text: 'Trained, checked on footage' },
  external: { tone: 'info', text: 'Third-party weights' },
  rules: { tone: 'info', text: 'Rules on a general model' },
  heuristic: { tone: 'warn', text: 'Heuristic' },
  open_vocab: { tone: 'warn', text: 'Zero-shot' },
  simulated: { tone: 'neutral', text: 'Simulated only' },
};
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

function state(d: Full): { text: string; tone: 'ok' | 'warn' | 'crit' | 'neutral' } {
  if (!d.implemented) return { text: 'Not available', tone: 'neutral' };
  if (!d.enabled) return { text: 'Disabled', tone: 'neutral' };
  const v = Object.values(d.load_status);
  if (!v.length) return { text: 'Worker not started', tone: 'warn' };
  const bad = v.find((s) => s !== 'ready');
  return bad
    ? { text: 'Error', tone: 'crit' }
    : { text: `Loaded on ${v.length} camera${v.length > 1 ? 's' : ''}`, tone: 'ok' };
}

export default function ModelConfig() {
  const toast = useToast();
  const dets = useGet<Full[]>('/detectors');
  const cams = useGet<Cam[]>('/cameras');
  const [open, setOpen] = useState('');
  const [cam, setCam] = useState('');
  const [text, setText] = useState('');
  const cameras = cams.data?.filter((c) => c.kind === 'camera') ?? [];

  useEffect(() => {
    if (!cam) return;
    api<{ config: object }>(`/cameras/${cam}/config`)
      .then((r) =>
        setText(JSON.stringify(Object.keys(r.config).length ? r.config : EXAMPLE, null, 2)),
      )
      .catch(() => setText(''));
  }, [cam]);

  const run = async (p: () => Promise<unknown>, ok: string) => {
    try {
      await p();
      toast(ok);
      dets.reload();
      cams.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'crit');
    }
  };

  if (dets.error) return <ErrorState message={dets.error} onRetry={dets.reload} />;
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5">
      <PageHeader
        title="Model Configuration"
        subtitle="Every detector, its real status and its thresholds. A model is shown as loaded only after the CV worker reports it ready. No accuracy figures are shown because none have been measured on this plant."
      />
      <Panel title="Detectors" pad={false}>
        {dets.loading && !dets.data ? (
          <div className="grid gap-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  {[
                    '#',
                    'Capability',
                    'Type',
                    'Status',
                    'Cameras',
                    'Last event',
                    'Events',
                    'Confirmed / false +',
                    'Min confidence',
                    'Enabled',
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dets.data?.map((d) => {
                  const st = state(d);
                  const m = MATURITY[d.maturity] ?? MATURITY.rules!;
                  const assigned = cameras.filter((c) => c.detectors.includes(d.name));
                  return (
                    <Fragment key={d.name}>
                      <tr className="border-b border-line align-top">
                        <td className="px-3 py-2.5 font-medium text-muted">{d.number ?? '+'}</td>
                        <td className="px-3 py-2.5">
                          <button
                            className="text-left font-semibold underline-offset-2 hover:underline"
                            onClick={() => setOpen(open === d.name ? '' : d.name)}
                            aria-expanded={open === d.name}
                          >
                            {d.label}
                          </button>
                          {d.requires_verification && (
                            <span className="ml-1.5 text-xs text-warn">verify</span>
                          )}
                          <span className="block text-xs text-muted">
                            {d.category.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={m.tone}>{m.text}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={st.tone}>{st.text}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {assigned.length ? (
                            assigned.map((c) => c.name).join(', ')
                          ) : (
                            <span className="text-muted">none</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted">
                          {d.last_detection ? ago(d.last_detection) : 'never'}
                        </td>
                        <td className="px-3 py-2.5 tabular">{d.events_seen}</td>
                        <td className="px-3 py-2.5 tabular">
                          {d.confirmed} / {d.false_positives}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            step="0.05"
                            min="0.05"
                            max="0.99"
                            aria-label={`Minimum confidence for ${d.label}`}
                            className="h-8 w-20 rounded border border-line-strong px-2"
                            defaultValue={d.min_conf ?? ''}
                            placeholder="default"
                            onBlur={(e) =>
                              e.target.value &&
                              void run(
                                () =>
                                  api(`/detectors/${d.name}`, {
                                    method: 'PATCH',
                                    json: { min_conf: Number(e.target.value) },
                                  }),
                                'Threshold saved',
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Button
                            size="sm"
                            variant={d.enabled ? 'primary' : 'secondary'}
                            disabled={!d.implemented}
                            onClick={() =>
                              void run(
                                () =>
                                  api(`/detectors/${d.name}`, {
                                    method: 'PATCH',
                                    json: { enabled: !d.enabled },
                                  }),
                                d.enabled ? 'Disabled' : 'Enabled',
                              )
                            }
                          >
                            {d.enabled ? 'On' : 'Off'}
                          </Button>
                        </td>
                      </tr>
                      {open === d.name && (
                        <tr className="border-b border-line bg-sunken">
                          <td colSpan={10} className="px-4 py-3 text-sm">
                            <dl className="grid gap-x-8 gap-y-1.5 md:grid-cols-[9rem_1fr]">
                              <dt className="text-muted">Source</dt>
                              <dd>{d.repo}</dd>
                              <dt className="text-muted">Model</dt>
                              <dd>{d.model}</dd>
                              <dt className="text-muted">Weights</dt>
                              <dd className="font-mono text-xs">{d.weights}</dd>
                              <dt className="text-muted">Supported classes</dt>
                              <dd>{d.classes.join(', ') || '—'}</dd>
                              <dt className="text-muted">Licence</dt>
                              <dd>{d.licence}</dd>
                              <dt className="text-muted">Limitations</dt>
                              <dd>{d.note}</dd>
                              <dt className="text-muted">Per-camera status</dt>
                              <dd>
                                {Object.keys(d.load_status).length
                                  ? Object.entries(d.load_status).map(([c, s]) => (
                                      <span key={c} className="mr-3">
                                        <b>{c}</b>: {s}
                                      </span>
                                    ))
                                  : 'No worker has reported this model.'}
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
        )}
      </Panel>

      <Panel
        title="Camera assignment"
        action={
          <span className="text-xs text-muted">applies the next time the CV worker starts</span>
        }
      >
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="pr-6 text-left font-medium text-muted">Detector</th>
                {cameras.map((c) => (
                  <th key={c.id} className="px-3 text-center text-xs font-medium">
                    {c.name}
                    <span className="block font-normal text-muted">
                      {c.online ? 'streaming' : 'offline'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dets.data
                ?.filter((d) => d.implemented)
                .map((d) => (
                  <tr key={d.name} className="border-t border-line">
                    <td className="py-1.5 pr-6">{d.label}</td>
                    {cameras.map((c) => (
                      <td key={c.id} className="text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand"
                          aria-label={`${d.label} on ${c.name}`}
                          checked={c.detectors.includes(d.name)}
                          onChange={() =>
                            void run(
                              () =>
                                api(`/cameras/${c.id}`, {
                                  method: 'PATCH',
                                  json: {
                                    detectors: c.detectors.includes(d.name)
                                      ? c.detectors.filter((x) => x !== d.name)
                                      : [...c.detectors, d.name],
                                  },
                                }),
                              'Assignment saved',
                            )
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Zones, calibration and thresholds">
        <p className="mb-3 max-w-4xl text-sm text-muted">
          Zone types: <code>machine_danger</code>, <code>forklift_lane</code>,{' '}
          <code>ppe_required</code>, <code>no_waste</code>, <code>waste_bin</code> (with{' '}
          <code>allowed</code> groups and <code>capacity</code>), <code>storage</code>,{' '}
          <code>spill_watch</code>. Coordinates are pixels of that camera.
          <code> calibration.px_per_m</code> turns forklift distances into real metres; without it
          they are labelled estimates. Draw polygons with{' '}
          <code>python -m vision_service.draw_zones --source VIDEO</code>.
        </p>
        <select
          value={cam}
          onChange={(e) => setCam(e.target.value)}
          aria-label="Camera to configure"
          className="mb-3 h-10 rounded-md border border-line-strong px-3"
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
            <Textarea
              rows={14}
              className="font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Camera configuration JSON"
            />
            <Button
              className="mt-3"
              variant="primary"
              onClick={() => {
                try {
                  void run(
                    () => api(`/cameras/${cam}/config`, { method: 'PUT', json: JSON.parse(text) }),
                    'Configuration saved; restart the worker to apply',
                  );
                } catch {
                  toast('That is not valid JSON', 'crit');
                }
              }}
            >
              Save configuration
            </Button>
          </>
        )}
      </Panel>
    </div>
  );
}
