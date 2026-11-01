import {
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  Grid3x3,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Rows3,
  Search,
  Square,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { absUrl, api } from '@common/lib/api';
import { Button, ErrorState, Segmented, Skeleton, cx } from '@common/ui/primitives';
import { useToast } from '@common/ui/overlay';
import {
  CameraFeed,
  DET_STYLE,
  FeedBadge,
  detState,
  feedKind,
  type Cam,
} from '../components/CameraFeed';
import { qs, useGet, type Incident } from '../data';
import { DETECTION_LABEL, SEV_COLOR, ago, when } from '../labels';

const NIGHT_FIELD =
  'h-9 rounded-md border border-night-line bg-night px-2 text-sm text-night-text placeholder:text-night-muted focus:border-brand';

type Layout = 'focus' | '1' | '2' | '4' | '9';
const GRID: Record<Exclude<Layout, 'focus'>, { cols: string; n: number }> = {
  '1': { cols: 'grid-cols-1', n: 1 },
  '2': { cols: 'grid-cols-1 md:grid-cols-2', n: 2 },
  '4': { cols: 'grid-cols-1 sm:grid-cols-2', n: 4 },
  '9': { cols: 'grid-cols-2 lg:grid-cols-3', n: 9 },
};
const SIM_KINDS = [
  'fire',
  'fall',
  'violence',
  'spill',
  'forklift_critical',
  'package',
  'storage',
  'machinery',
  'waste',
];

function ListCam(): { cams: Cam[]; loading: boolean; error: string; reload: () => void } {
  const r = useGet<Cam[]>('/cameras');
  useEffect(() => {
    const t = setInterval(r.reload, 240000); // renew signed stream links before they expire
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    cams: (r.data ?? []).filter((c) => c.kind === 'camera'),
    loading: r.loading,
    error: r.error,
    reload: r.reload,
  };
}

function Tile({ cam, onOpen, selected }: { cam: Cam; onOpen: () => void; selected?: boolean }) {
  const d = cam.last_detection;
  const st = d ? DET_STYLE[detState({ status: d.status, requires_verification: 1 })] : null;
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${cam.name}`}
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-night-2 text-left transition-colors',
        selected
          ? 'border-brand'
          : cam.active_alerts
            ? 'border-crit/60'
            : 'border-night-line hover:border-night-muted',
      )}
    >
      <div className="relative aspect-video w-full bg-black">
        <CameraFeed cam={cam} />
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <FeedBadge cam={cam} />
        </div>
        {cam.active_alerts > 0 && (
          <span className="absolute right-2 top-2 rounded bg-crit px-1.5 py-0.5 text-[10px] font-bold text-white">
            {cam.active_alerts} ALERT{cam.active_alerts > 1 ? 'S' : ''}
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 size={14} />
        </span>
      </div>
      <div className="grid gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-night-text">{cam.name}</p>
          <span className="shrink-0 font-mono text-[11px] text-night-muted">{cam.id}</span>
        </div>
        <p className="truncate text-xs text-night-muted">
          {cam.zone || '—'} · {cam.building} · Floor {cam.floor}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-night-muted">
          <span>
            {cam.detectors.length
              ? `AI: ${cam.detectors.length} detector${cam.detectors.length > 1 ? 's' : ''}`
              : 'AI: none assigned'}
          </span>
          <span>
            {cam.incidents_total} incident{cam.incidents_total === 1 ? '' : 's'}
          </span>
        </div>
        {d && st && (
          <div className="flex items-center justify-between gap-2 border-t border-night-line pt-1.5 text-[11px]">
            <span className="truncate text-night-muted">
              Last: {d.ai_class?.replace(/_/g, ' ')} · {ago(d.created_at)}
            </span>
            <span className={cx('shrink-0 rounded border px-1.5 py-px font-semibold', st.cls)}>
              {st.label}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

function Timeline({
  cam,
  incidents,
  hours,
  onHours,
  onPlay,
  playing,
}: {
  cam: Cam;
  incidents: Incident[];
  hours: number;
  onHours: (h: number) => void;
  onPlay: (id: string | null) => void;
  playing: string | null;
}) {
  const end = Date.now();
  const start = end - hours * 3600_000;
  const marks = incidents.filter((i) => new Date(i.created_at).getTime() >= start);
  return (
    <div className="border-t border-night-line bg-night-2 px-4 py-2">
      <div className="mb-1 flex items-center justify-between text-xs text-night-muted">
        <span>
          Event timeline · <b className="text-night-text">{marks.length}</b> event
          {marks.length === 1 ? '' : 's'} in the last {hours} h
          <span className="ml-2">(no continuous recording: event clips only)</span>
        </span>
        <span className="flex items-center gap-2">
          {playing && (
            <Button size="sm" variant="night" onClick={() => onPlay(null)}>
              Back to live
            </Button>
          )}
          <Segmented
            night
            label="Timeline range"
            value={String(hours)}
            onChange={(v) => onHours(Number(v))}
            options={[
              { value: '1', label: '1 h' },
              { value: '6', label: '6 h' },
              { value: '24', label: '24 h' },
            ]}
          />
        </span>
      </div>
      <div
        className="relative h-9 rounded bg-night"
        role="group"
        aria-label={`Events for ${cam.name}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <span
            key={p}
            className="absolute top-0 h-full w-px bg-night-line"
            style={{ left: `${p * 100}%` }}
          />
        ))}
        {marks.map((i) => {
          const left = ((new Date(i.created_at).getTime() - start) / (end - start)) * 100;
          return (
            <button
              key={i.id}
              onClick={() => onPlay(i.id)}
              title={`${i.id} · ${i.ai_class ?? ''} · ${when(i.created_at)} · severity ${i.severity}`}
              aria-label={`Play event ${i.id}`}
              className={cx(
                'absolute top-1 h-7 w-2.5 -translate-x-1/2 rounded-sm ring-1 ring-black/40 hover:scale-110',
                playing === i.id && 'ring-2 ring-white',
              )}
              style={{ left: `${left}%`, background: SEV_COLOR[i.severity] }}
            />
          );
        })}
        <span className="absolute right-0 top-0 h-full w-0.5 bg-ok" title="Now" />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-night-muted">
        <span>-{hours} h</span>
        <span>-{(hours * 0.5).toFixed(hours === 1 ? 1 : 0)} h</span>
        <span>now</span>
      </div>
    </div>
  );
}

function Playback({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useGet<{
    evidence: { id: string; kind: string; url: string }[];
    ai_class: string | null;
    created_at: string;
  }>(`/incidents/${id}`, false);
  const ev = d.data?.evidence ?? [];
  const clip = ev.find((e) => e.kind === 'video');
  const img = ev.find((e) => e.kind === 'image');
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black">
      <div className="flex items-center justify-between bg-night-2 px-3 py-1.5 text-xs">
        <span className="text-night-text">
          Playback · <span className="font-mono">{id}</span> ·{' '}
          {d.data?.ai_class?.replace(/_/g, ' ')} · {when(d.data?.created_at)} ·{' '}
          <b className="text-warn">event clip</b>
        </span>
        <Button size="sm" variant="night" onClick={onClose}>
          <X size={14} /> Back to live
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {clip ? (
          <video
            key={clip.id}
            src={absUrl(clip.url)}
            controls
            autoPlay
            className="max-h-full max-w-full"
          />
        ) : img ? (
          <img
            src={absUrl(img.url)}
            alt="event frame"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-sm text-night-muted">
            {d.loading ? 'Loading evidence…' : 'This incident has no clip or frame attached.'}
          </p>
        )}
      </div>
    </div>
  );
}

function SidePanel({
  cam,
  incidents,
  onOpenIncident,
}: {
  cam: Cam;
  incidents: Incident[];
  onOpenIncident: (id: string) => void;
}) {
  const dets = useGet<
    { name: string; label: string; maturity: string; load_status: Record<string, string> }[]
  >('/detectors', false);
  const kind = feedKind(cam);
  const age = cam.last_seen ? (Date.now() - new Date(cam.last_seen).getTime()) / 1000 : null;
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-auto border-l border-night-line bg-night-2 text-night-text">
      <section className="border-b border-night-line p-4">
        <h3 className="text-sm font-semibold">{cam.name}</h3>
        <p className="font-mono text-xs text-night-muted">{cam.id}</p>
        <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
          <dt className="text-night-muted">Site</dt>
          <dd>{cam.site}</dd>
          <dt className="text-night-muted">Building</dt>
          <dd>
            {cam.building} · Floor {cam.floor}
          </dd>
          <dt className="text-night-muted">Zone</dt>
          <dd>{cam.zone || '—'}</dd>
          <dt className="text-night-muted">Machine / area</dt>
          <dd>{cam.asset_name ?? '—'}</dd>
          <dt className="text-night-muted">Department</dt>
          <dd>{cam.department ?? '—'}</dd>
        </dl>
      </section>
      <section className="border-b border-night-line p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-night-muted">
          Camera health
        </h3>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
          <dt className="text-night-muted">Feed</dt>
          <dd>
            <FeedBadge cam={cam} />
          </dd>
          <dt className="text-night-muted">Frame rate</dt>
          <dd>{cam.online && cam.fps ? `${cam.fps.toFixed(1)} frames/s processed` : '—'}</dd>
          <dt className="text-night-muted">Last signal</dt>
          <dd>
            {age === null ? 'never' : age < 60 ? `${Math.round(age)} s ago` : ago(cam.last_seen)}
          </dd>
          <dt className="text-night-muted">Recording</dt>
          <dd>Event clips only</dd>
        </dl>
        {kind === 'sample' && (
          <p className="mt-2 rounded bg-warn/15 p-2 text-[11px] text-[#f3b45a]">
            This camera is playing a sample video through the real pipeline. Detections are real
            model outputs on that video, not on a plant.
          </p>
        )}
      </section>
      <section className="border-b border-night-line p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-night-muted">
          AI monitoring
        </h3>
        {cam.detectors.length === 0 ? (
          <p className="text-xs text-night-muted">No detectors are assigned to this camera.</p>
        ) : (
          <ul className="grid gap-1.5 text-xs">
            {cam.detectors.map((n) => {
              const meta = dets.data?.find((d) => d.name === n);
              const st = meta?.load_status[cam.id];
              return (
                <li key={n} className="flex items-center justify-between gap-2">
                  <span>{DETECTION_LABEL[n] ?? n}</span>
                  <span
                    className={cx(
                      'rounded px-1.5 py-px text-[10px]',
                      st === 'ready' ? 'bg-ok/20 text-[#6fd39a]' : 'bg-night-3 text-night-muted',
                    )}
                  >
                    {st === 'ready' ? 'active' : st ? 'unavailable' : 'worker off'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="p-4">
        <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-night-muted">
          <span>Recent detections</span>
          <button
            className="normal-case underline"
            onClick={() => onOpenIncident(`?camera_id=${cam.id}`)}
          >
            All incidents
          </button>
        </h3>
        {incidents.length === 0 ? (
          <p className="text-xs text-night-muted">No detections from this camera yet.</p>
        ) : (
          <ul className="grid gap-2">
            {incidents.slice(0, 6).map((i) => {
              const s = DET_STYLE[detState(i)];
              return (
                <li key={i.id}>
                  <button
                    onClick={() => onOpenIncident(i.id)}
                    className="w-full rounded-md border border-night-line p-2 text-left hover:bg-night-3"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">
                        {i.ai_class?.replace(/_/g, ' ') ?? i.category}
                      </span>
                      <span
                        className={cx(
                          'shrink-0 rounded border px-1.5 py-px text-[10px] font-semibold',
                          s.cls,
                        )}
                      >
                        {s.label}
                      </span>
                    </span>
                    <span className="block text-[11px] text-night-muted">
                      {i.id} · {ago(i.created_at)} ·{' '}
                      {i.ai_confidence != null ? `${Math.round(i.ai_confidence * 100)}%` : ''}
                      {i.simulated ? ' · simulated' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

export default function LiveCctv() {
  const nav = useNavigate();
  const toast = useToast();
  const { cams, loading, error, reload } = ListCam();
  const [layout, setLayout] = useState<Layout>(
    (localStorage.getItem('sw.cctv.layout') as Layout) || '4',
  );
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [zone, setZone] = useState('');
  const [dept, setDept] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [page, setPage] = useState(0);
  const [panel, setPanel] = useState(true);
  const [hours, setHours] = useState(24);
  const [play, setPlay] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => localStorage.setItem('sw.cctv.layout', layout), [layout]);
  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const opts = (k: keyof Cam) =>
    [...new Set(cams.map((c) => String(c[k] ?? '')).filter(Boolean))].sort();
  const filtered = useMemo(
    () =>
      cams.filter(
        (c) =>
          (!q || `${c.name} ${c.id} ${c.zone}`.toLowerCase().includes(q.toLowerCase())) &&
          (status === 'all' ||
            (status === 'online' && c.online) ||
            (status === 'offline' && !c.online) ||
            (status === 'alerts' && c.active_alerts > 0)) &&
          (!zone || c.zone === zone) &&
          (!dept || c.department === dept) &&
          (!building || c.building === building) &&
          (!floor || c.floor === floor),
      ),
    [cams, q, status, zone, dept, building, floor],
  );
  const cam = cams.find((c) => c.id === sel) ?? null;
  const idx = cam ? filtered.findIndex((c) => c.id === cam.id) : -1;
  const camIncidents = useGet<{ items: Incident[] }>(
    cam ? `/incidents${qs({ camera_id: cam.id, limit: 50 })}` : null,
  );
  const step = (d: number) => {
    if (!filtered.length) return;
    const next = filtered[(Math.max(idx, 0) + d + filtered.length) % filtered.length];
    if (next) {
      setSel(next.id);
      setPlay(null);
    }
  };
  useEffect(() => {
    if (!cam) return;
    const k = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'SELECT'
      )
        return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const toggleFull = () =>
    document.fullscreenElement
      ? void document.exitFullscreen()
      : void wrap.current?.requestFullscreen();
  const sim = async (kind: string) => {
    try {
      await api('/demo/simulate', { json: { kind, camera_id: cam?.id } });
      toast(
        `Simulated ${kind.replace('_', ' ')} event created on ${cam?.name ?? 'a camera'} (labelled SIMULATED)`,
        'info',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'crit');
    }
  };

  const grid = layout === 'focus' ? GRID['4'] : GRID[layout];
  const pages = Math.max(1, Math.ceil(filtered.length / grid.n));
  const shown = filtered.slice(page * grid.n, page * grid.n + grid.n);
  const inFocus = !!cam && layout === 'focus';

  return (
    <div ref={wrap} className="flex h-full min-h-[34rem] flex-col bg-night text-night-text">
      <div className="flex flex-wrap items-center gap-2 border-b border-night-line bg-night-2 px-4 py-2">
        <Video size={18} className="text-brand" />
        <h1 className="mr-2 text-sm font-semibold">Live CCTV</h1>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-3 text-night-muted" />
          <input
            aria-label="Search cameras"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(0))}
            placeholder="Search cameras"
            className={cx(NIGHT_FIELD, 'w-44 pl-8')}
          />
        </div>
        <Segmented
          night
          label="Camera status"
          value={status}
          onChange={(v) => (setStatus(v), setPage(0))}
          options={[
            { value: 'all', label: `All ${cams.length}` },
            { value: 'online', label: `Online ${cams.filter((c) => c.online).length}` },
            { value: 'offline', label: `Offline ${cams.filter((c) => !c.online).length}` },
            { value: 'alerts', label: `Alerts ${cams.filter((c) => c.active_alerts).length}` },
          ]}
        />
        {(
          [
            ['Building', building, setBuilding, 'building'],
            ['Floor', floor, setFloor, 'floor'],
            ['Zone', zone, setZone, 'zone'],
            ['Department', dept, setDept, 'department'],
          ] as const
        ).map(([label, val, set, key]) => (
          <select
            key={label}
            aria-label={label}
            value={val}
            onChange={(e) => (set(e.target.value), setPage(0))}
            className={cx(NIGHT_FIELD, 'w-36')}
          >
            <option value="">{label}: all</option>
            {opts(key as keyof Cam).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Segmented
            night
            label="Layout"
            value={layout}
            onChange={(v) => {
              setLayout(v);
              setPage(0);
              if (v !== 'focus') setSel(null);
              else if (!sel && filtered[0]) setSel(filtered[0].id);
            }}
            options={[
              {
                value: 'focus',
                label: <Rows3 size={16} />,
                title: 'Selected camera with filmstrip',
              },
              { value: '1', label: <Square size={16} />, title: 'Single camera' },
              { value: '2', label: '2', title: '2 cameras' },
              { value: '4', label: <Grid2x2 size={16} />, title: '4 cameras' },
              { value: '9', label: <Grid3x3 size={16} />, title: '9 cameras' },
            ]}
          />
          <Button variant="night" size="sm" onClick={toggleFull} aria-label="Toggle full screen">
            {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{' '}
            {full ? 'Exit' : 'Full screen'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4">
          <ErrorState message={`Cannot load cameras: ${error}`} onRetry={reload} />
        </div>
      )}

      {!inFocus ? (
        <div className="flex-1 overflow-auto p-4">
          {loading && !cams.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-video bg-night-2" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <Video size={32} className="text-night-muted" />
              <p className="text-sm font-semibold">No cameras match these filters</p>
              <p className="text-xs text-night-muted">
                Clear a filter, or register a camera in AI Monitoring / Settings.
              </p>
            </div>
          ) : (
            <>
              <div className={cx('grid gap-4', grid.cols)}>
                {shown.map((c) => (
                  <Tile
                    key={c.id}
                    cam={c}
                    onOpen={() => {
                      setSel(c.id);
                      setLayout('focus');
                      setPlay(null);
                    }}
                  />
                ))}
              </div>
              {pages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3 text-xs text-night-muted">
                  <Button
                    size="sm"
                    variant="night"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft size={14} /> Previous
                  </Button>
                  Page {page + 1} / {pages}
                  <Button
                    size="sm"
                    variant="night"
                    disabled={page + 1 >= pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next <ChevronRight size={14} />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  size="sm"
                  variant="night"
                  onClick={() => {
                    setSel(null);
                    setLayout(layout === 'focus' ? '4' : layout);
                    setPlay(null);
                  }}
                >
                  <Grid2x2 size={14} /> Return to grid
                </Button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{cam.name}</p>
                  <p className="truncate text-xs text-night-muted">
                    {cam.id} · {cam.zone} · {cam.building} · Floor {cam.floor}
                  </p>
                </div>
                <FeedBadge cam={cam} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="night"
                  onClick={() => step(-1)}
                  aria-label="Previous camera"
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-xs text-night-muted">
                  {idx + 1} / {filtered.length}
                </span>
                <Button size="sm" variant="night" onClick={() => step(1)} aria-label="Next camera">
                  <ChevronRight size={16} />
                </Button>
                <Button
                  size="sm"
                  variant="night"
                  onClick={() => setPanel(!panel)}
                  aria-label="Toggle details panel"
                >
                  {panel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                </Button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-black">
              <CameraFeed cam={cam} />
              {play && <Playback id={play} onClose={() => setPlay(null)} />}
              {!play && (camIncidents.data?.items.length ?? 0) > 0 && (
                <ul className="pointer-events-none absolute bottom-3 left-3 grid gap-1">
                  {camIncidents
                    .data!.items.filter(
                      (i) =>
                        Date.now() - new Date(i.created_at).getTime() < 60_000 &&
                        detState(i) !== 'resolved',
                    )
                    .slice(0, 3)
                    .map((i) => (
                      <li
                        key={i.id}
                        className={cx(
                          'rounded border px-2 py-1 text-xs font-semibold backdrop-blur',
                          DET_STYLE[detState(i)].cls,
                        )}
                      >
                        {DET_STYLE[detState(i)].label.toUpperCase()} ·{' '}
                        {(
                          DETECTION_LABEL[(i.ai_meta?.detector as string) ?? ''] ??
                          i.ai_class ??
                          ''
                        ).toUpperCase()}{' '}
                        {i.ai_confidence != null && `· ${Math.round(i.ai_confidence * 100)}%`}
                      </li>
                    ))}
                </ul>
              )}
              {cam.online && (
                <div className="absolute right-3 top-3 flex flex-col items-end gap-1 text-[10px] text-white/80">
                  <span className="rounded bg-black/50 px-1.5 py-0.5">
                    Potential = amber · Confirmed = red · People pixelated
                  </span>
                </div>
              )}
            </div>

            <Timeline
              cam={cam}
              incidents={camIncidents.data?.items ?? []}
              hours={hours}
              onHours={setHours}
              onPlay={setPlay}
              playing={play}
            />

            <div className="flex items-center gap-1 border-t border-night-line bg-night-2 px-2 py-2">
              <Button
                size="sm"
                variant="night"
                onClick={() => strip.current?.scrollBy({ left: -360, behavior: 'smooth' })}
                aria-label="Scroll cameras left"
              >
                <ChevronLeft size={16} />
              </Button>
              <div
                ref={strip}
                className="flex flex-1 gap-2 overflow-x-auto scroll-smooth"
                role="listbox"
                aria-label="Cameras"
              >
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    role="option"
                    aria-selected={c.id === cam.id}
                    onClick={() => {
                      setSel(c.id);
                      setPlay(null);
                    }}
                    className={cx(
                      'relative w-44 shrink-0 overflow-hidden rounded-md border bg-black text-left',
                      c.id === cam.id
                        ? 'border-brand ring-1 ring-brand'
                        : c.active_alerts
                          ? 'border-crit/60'
                          : 'border-night-line hover:border-night-muted',
                    )}
                  >
                    <div className="aspect-video">
                      <CameraFeed cam={c} snapshot />
                    </div>
                    <span className="absolute left-1 top-1">
                      <span
                        className={cx(
                          'block h-2 w-2 rounded-full',
                          c.online ? 'bg-ok' : 'bg-night-line',
                        )}
                      />
                    </span>
                    {c.active_alerts > 0 && (
                      <span className="absolute right-1 top-1 rounded bg-crit px-1 text-[9px] font-bold">
                        {c.active_alerts}
                      </span>
                    )}
                    <p className="truncate bg-night-2 px-2 py-1 text-[11px]">{c.name}</p>
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="night"
                onClick={() => strip.current?.scrollBy({ left: 360, behavior: 'smooth' })}
                aria-label="Scroll cameras right"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </section>
          {panel && (
            <SidePanel
              cam={cam}
              incidents={camIncidents.data?.items ?? []}
              onOpenIncident={(id) =>
                nav(id.startsWith('?') ? `/admin/incidents${id}` : `/admin/incidents/${id}`)
              }
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-night-line bg-night-2 px-4 py-2 text-xs text-night-muted">
        <span className="font-semibold text-night-text">Demo trigger</span>
        <span>creates a clearly labelled SIMULATED event{cam ? ` on ${cam.name}` : ''}:</span>
        {SIM_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => void sim(k)}
            className="rounded border border-dashed border-night-muted px-2 py-0.5 hover:bg-night-3"
          >
            {k.replace('_', ' ')}
          </button>
        ))}
      </div>
    </div>
  );
}
