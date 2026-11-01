import { Camera, Mic, QrCode } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, ErrorState, Panel, Segmented, Select, Spinner } from '@common/ui/primitives';
import { PageHeader } from '../components/shared';
import { qs, useGet, type Incident } from '../data';
import { CATEGORY, SEV_COLOR, ago } from '../labels';

interface MapData {
  assets: {
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
    w: number;
    h: number;
    zone: string;
    open_count: number;
    total_count: number;
  }[];
  cameras: {
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
    status: string;
    simulated: number;
    zone: string;
  }[];
}

export default function FactoryMap() {
  const nav = useNavigate();
  const map = useGet<MapData>('/map');
  const [range, setRange] = useState('30');
  const [cat, setCat] = useState('');
  const [sev, setSev] = useState('');
  const [layer, setLayer] = useState<'heat' | 'pins'>('heat');
  const [pick, setPick] = useState('');
  const from = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
  const inc = useGet<{ items: Incident[] }>(
    `/incidents${qs({ limit: 500, date_from: from, category: cat, severity_min: sev })}`,
  );

  const byAsset = useMemo(() => {
    const m = new Map<string, Incident[]>();
    for (const i of inc.data?.items ?? []) {
      const k =
        i.asset_id ??
        (i.camera_id ? map.data?.cameras.find((c) => c.id === i.camera_id)?.zone : '') ??
        '';
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return m;
  }, [inc.data, map.data]);
  const zones = useMemo(() => {
    const z = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
    for (const a of map.data?.assets ?? []) {
      const b = z.get(a.zone) ?? { x1: 100, y1: 100, x2: 0, y2: 0 };
      z.set(a.zone, {
        x1: Math.min(b.x1, a.x),
        y1: Math.min(b.y1, a.y),
        x2: Math.max(b.x2, a.x + a.w),
        y2: Math.max(b.y2, a.y + a.h),
      });
    }
    return [...z.entries()];
  }, [map.data]);
  const max = Math.max(1, ...[...byAsset.values()].map((v) => v.length));
  const sel = map.data?.assets.find((a) => a.id === pick);
  const selInc = sel ? (byAsset.get(sel.id) ?? []) : [];

  if (map.error) return <ErrorState message={map.error} onRetry={map.reload} />;
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Factory Map"
        subtitle="A clearly labelled demo layout of a fictional plant (not a real L'Oréal site). Machines, QR stickers, cameras and microphones are drawn from the registered assets; incidents come from the database."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: '1', label: '24 h' },
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
        <Select
          aria-label="Category"
          className="w-52"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="">All categories</option>
          {Object.entries(CATEGORY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Severity"
          className="w-44"
          value={sev}
          onChange={(e) => setSev(e.target.value)}
        >
          <option value="">Any severity</option>
          <option value="3">3 and above</option>
          <option value="4">4 and above</option>
          <option value="5">5 only</option>
        </Select>
        <Segmented
          label="Layer"
          value={layer}
          onChange={setLayer}
          options={[
            { value: 'heat', label: 'Hotspot heat' },
            { value: 'pins', label: 'Incident pins' },
          ]}
        />
        <span className="ml-auto text-sm text-muted">
          {inc.data?.items.length ?? 0} incidents in view
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Panel pad={false}>
          {map.loading && !map.data ? (
            <Spinner />
          ) : (
            <svg
              viewBox="0 0 100 94"
              className="w-full"
              role="img"
              aria-label="Demo factory floor plan"
            >
              <rect
                x="1"
                y="1"
                width="98"
                height="92"
                rx="1.2"
                fill="#faf9f7"
                stroke="#a8a29e"
                strokeWidth="0.5"
              />
              <text x="3" y="5" fontSize="2.2" fill="#78716c">
                Demo Plant — Line 3 · ground floor · fictional layout
              </text>
              {zones.map(([z, b]) => (
                <g key={z}>
                  <rect
                    x={b.x1 - 1.2}
                    y={b.y1 - 4}
                    width={b.x2 - b.x1 + 2.4}
                    height={b.y2 - b.y1 + 5.2}
                    rx="1"
                    fill="none"
                    stroke="#d3cdc7"
                    strokeWidth="0.3"
                    strokeDasharray="1.2 1"
                  />
                  <text
                    x={b.x1 - 0.6}
                    y={b.y1 - 1.6}
                    fontSize="1.9"
                    fontWeight="600"
                    fill="#78716c"
                  >
                    {z.toUpperCase()}
                  </text>
                </g>
              ))}
              {map.data?.assets.map((a) => {
                const n = byAsset.get(a.id)?.length ?? 0;
                return (
                  <g
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => setPick(a.id)}
                    role="button"
                    aria-label={`${a.name}, ${n} incidents`}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setPick(a.id)}
                  >
                    <rect
                      x={a.x}
                      y={a.y}
                      width={a.w}
                      height={a.h}
                      rx="0.8"
                      fill={layer === 'heat' ? `rgba(200,16,46,${0.04 + (n / max) * 0.5})` : '#fff'}
                      stroke={pick === a.id ? '#c8102e' : '#78716c'}
                      strokeWidth={pick === a.id ? 0.7 : 0.3}
                    />
                    <text
                      x={a.x + a.w / 2}
                      y={a.y + a.h / 2 - 0.5}
                      textAnchor="middle"
                      fontSize="2.1"
                      fontWeight="600"
                      fill="#1c1917"
                    >
                      {a.name}
                    </text>
                    <text
                      x={a.x + a.w / 2}
                      y={a.y + a.h / 2 + 2.6}
                      textAnchor="middle"
                      fontSize="1.7"
                      fill="#57534e"
                    >
                      {n} incident{n === 1 ? '' : 's'}
                    </text>
                    <rect x={a.x + 0.8} y={a.y + 0.8} width="2.2" height="2.2" fill="#1c1917" />
                    <title>{`${a.name}: QR sticker location`}</title>
                  </g>
                );
              })}
              {map.data?.cameras.map((c) => (
                <g key={c.id}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="1.5"
                    fill={
                      c.kind === 'microphone'
                        ? '#7c3aed'
                        : c.status === 'running'
                          ? '#15803d'
                          : '#78716c'
                    }
                  />
                  <text x={c.x + 2} y={c.y + 0.6} fontSize="1.6" fill="#44403c">
                    {c.id}
                    {c.simulated ? ' (sim)' : ''}
                  </text>
                </g>
              ))}
              {layer === 'pins' &&
                map.data?.assets.flatMap((a) =>
                  (byAsset.get(a.id) ?? []).slice(0, 8).map((i, k) => (
                    <circle
                      key={i.id}
                      cx={a.x + a.w - 2 - (k % 4) * 2.4}
                      cy={a.y + a.h - 2 - Math.floor(k / 4) * 2.4}
                      r="1"
                      fill={SEV_COLOR[i.severity]}
                      stroke="#fff"
                      strokeWidth="0.3"
                      className="cursor-pointer"
                      onClick={() => nav(`/admin/incidents/${i.id}`)}
                    >
                      <title>{`${i.id} · ${CATEGORY[i.category]} · severity ${i.severity}`}</title>
                    </circle>
                  )),
                )}
            </svg>
          )}
          <ul className="flex flex-wrap gap-4 border-t border-line px-4 py-2 text-xs text-ink-2">
            <li className="flex items-center gap-1">
              <QrCode size={12} /> small black square = QR sticker
            </li>
            <li className="flex items-center gap-1">
              <Camera size={12} className="text-ok" /> green dot = camera streaming
            </li>
            <li className="flex items-center gap-1">
              <Mic size={12} className="text-[#7c3aed]" /> purple = microphone (simulated)
            </li>
            <li>Red tint / pins = incidents in the selected range</li>
          </ul>
        </Panel>
        <Panel title={sel ? sel.name : 'Select a machine'}>
          {!sel ? (
            <p className="text-sm text-muted">Click a machine or area to see its incidents.</p>
          ) : (
            <div className="grid gap-3 text-sm">
              <p className="text-muted">
                {sel.zone} · {sel.kind}
              </p>
              <p>
                <b>{selInc.length}</b> incidents in range, <b>{sel.open_count}</b> open now
              </p>
              <ul className="grid gap-1.5">
                {selInc.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <Link
                      to={`/admin/incidents/${i.id}`}
                      className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-sunken"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: SEV_COLOR[i.severity] }}
                        />
                        {CATEGORY[i.category]}
                      </span>
                      <span className="text-xs text-muted">{ago(i.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link className="text-xs underline" to={`/admin/incidents?asset_id=${sel.id}`}>
                All incidents for this machine
              </Link>
              <Badge tone="sim">Demo layout, fictional plant</Badge>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
