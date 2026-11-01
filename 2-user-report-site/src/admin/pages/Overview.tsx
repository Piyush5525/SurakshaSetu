import { Camera, Info } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarList, Columns, Donut, type Datum } from '@common/ui/charts';
import {
  Badge,
  ErrorState,
  Panel,
  SeverityBadge,
  Skeleton,
  StatusDot,
  Segmented,
  Stat,
} from '@common/ui/primitives';
import { IncidentTable, PageHeader, SimTag } from '../components/shared';
import { qs, useGet, type Incident } from '../data';
import { CATEGORY, DETECTION_LABEL, SEV_COLOR, SOURCE, SOURCE_COLOR, ago } from '../labels';

interface KV {
  key: string;
  n: number;
}
interface Dash {
  days: number;
  kpi: Record<string, number | null>;
  definitions: Record<string, string>;
  by_category: KV[];
  by_department: KV[];
  by_severity: KV[];
  by_source: KV[];
  trend: { day: string; source: string; n: number }[];
  heat: { id: string; name: string; zone: string; total: number; open: number }[];
  recent_incidents: Incident[];
  recent_ai: Incident[];
  pending: Incident[];
}
interface Cam {
  id: string;
  name: string;
  online: boolean;
  simulated: number;
  active_alerts: number;
  kind: string;
  zone: string;
}

const CAT_COLORS = [
  '#c8102e',
  '#44403c',
  '#0369a1',
  '#ca8a04',
  '#15803d',
  '#7c3aed',
  '#ea580c',
  '#0f766e',
  '#a8a29e',
  '#9f0d25',
];

export default function Overview() {
  const nav = useNavigate();
  const [days, setDays] = useState('30');
  const d = useGet<Dash>(`/analytics/dashboard?days=${days}`);
  const cams = useGet<Cam[]>('/cameras');
  const go = (p: Record<string, string | number | boolean>) =>
    nav(`/admin/incidents${qs({ ...p, date_from: dateFrom(Number(days)) })}`);
  const k = d.data?.kpi;
  const def = d.data?.definitions ?? {};
  const v = (x: number | null | undefined, suffix = '') =>
    x === null || x === undefined ? '—' : `${x}${suffix}`;

  if (d.error)
    return <ErrorState message={`Cannot reach the backend: ${d.error}`} onRetry={d.reload} />;

  const sources = ['qr', 'portal', 'cctv', 'audio', 'admin'];
  const days_ = [...new Set(d.data?.trend.map((t) => t.day))];
  const series = sources.map((s) => ({
    key: s,
    label: SOURCE[s]!,
    color: SOURCE_COLOR[s]!,
    values: days_.map((day) => d.data?.trend.find((t) => t.day === day && t.source === s)?.n ?? 0),
  }));
  const catData: Datum[] = (d.data?.by_category ?? []).map((c, i) => ({
    key: c.key,
    label: CATEGORY[c.key] ?? c.key,
    value: c.n,
    color: CAT_COLORS[i % CAT_COLORS.length],
  }));

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5">
      <PageHeader
        title="Overview"
        subtitle="Live picture of reports, detections and response. Every figure is computed from the incident database; hover the ? for its definition."
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {d.loading ? (
          Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Stat
              label="Total incidents"
              value={v(k?.total)}
              definition={def.total}
              onClick={() => go({})}
            />
            <Stat
              label="Active"
              value={v(k?.active)}
              definition={def.active}
              onClick={() => go({ open_only: true })}
            />
            <Stat
              label="Critical"
              value={v(k?.critical)}
              tone={k?.critical ? 'crit' : undefined}
              definition={def.critical}
              onClick={() => go({ critical_only: true, open_only: true })}
            />
            <Stat
              label="Awaiting acknowledgement"
              value={v(k?.awaiting_ack)}
              tone={k?.awaiting_ack ? 'warn' : undefined}
              definition={def.awaiting_ack}
              onClick={() => go({ awaiting_ack: true })}
            />
            <Stat
              label="Resolved"
              value={v(k?.resolved)}
              definition={def.resolved}
              onClick={() => go({ status: 'resolved' })}
            />
            <Stat
              label="Active cameras"
              value={`${v(k?.cameras_online)} / ${v(k?.cameras_total)}`}
              definition={def.cameras_online}
              hint="with a running CV worker"
              onClick={() => nav('/admin/cctv')}
            />
            <Stat
              label="AI detections today"
              value={v(k?.ai_today)}
              definition={def.ai_today}
              onClick={() => nav('/admin/ai')}
            />
            <Stat
              label="QR-generated reports"
              value={v(k?.qr_reports)}
              definition={def.qr_reports}
              onClick={() => go({ source: 'qr' })}
            />
            <Stat
              label="Avg response time"
              value={v(k?.avg_response_min, ' min')}
              definition={def.avg_response_min}
              hint="creation → acknowledged"
            />
            <Stat
              label="Resolution rate"
              value={k?.resolution_rate == null ? '—' : `${Math.round(k.resolution_rate * 100)}%`}
              definition={def.resolution_rate}
              hint={`avg ${v(k?.avg_resolve_min, ' min')} to resolve`}
            />
          </>
        )}
      </div>

      {k?.simulated_share ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed border-line-strong bg-surface px-3 py-2 text-xs text-ink-2">
          <Info size={14} /> {Math.round((k.simulated_share ?? 0) * 100)}% of incidents in this
          period are <b>synthetic demonstration records</b> (flagged “Simulated”). No incident here
          is a real L'Oréal event.{' '}
          <Link to="/admin/settings" className="underline">
            Public data and sources
          </Link>
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel
          title="Incident trend by source"
          className="xl:col-span-2"
          action={<span className="text-xs text-muted">click a day to open it</span>}
        >
          <Columns
            days={days_}
            series={series}
            onPick={(day) => nav(`/admin/incidents${qs({ date_from: day, date_to: day })}`)}
          />
        </Panel>
        <Panel title="Severity distribution">
          <BarList
            data={[5, 4, 3, 2, 1].map((s) => ({
              key: String(s),
              label: `Severity ${s}`,
              value: d.data?.by_severity.find((x) => String(x.key) === String(s))?.n ?? 0,
            }))}
            onPick={(x) => go({ severity_min: Number(x.key) })}
            color="bg-ink-2"
          />
          <div className="mt-3 flex gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} className="h-1.5 flex-1 rounded" style={{ background: SEV_COLOR[s] }} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Severity is set by triage rules and people, never by AI confidence.
          </p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="By category">
          <Donut data={catData} onPick={(x) => go({ category: x.key })} />
        </Panel>
        <Panel title="By department">
          <BarList
            data={(d.data?.by_department ?? []).map((x) => ({
              key: x.key,
              label: x.key ?? 'Unassigned',
              value: x.n,
            }))}
            onPick={(x) => go({ department: x.key })}
          />
        </Panel>
        <Panel
          title="Location hotspots"
          action={
            <Link to="/admin/map" className="text-xs underline">
              Open map
            </Link>
          }
        >
          <BarList
            data={[...(d.data?.heat ?? [])]
              .sort((a, b) => b.total - a.total)
              .slice(0, 7)
              .map((h) => ({
                key: h.id,
                label: h.name,
                value: h.total,
                color: h.open ? 'bg-brand' : 'bg-ink-2',
              }))}
            onPick={(x) => go({ asset_id: x.key })}
          />
          <p className="mt-2 text-xs text-muted">Red = machine has open incidents.</p>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel
          title="Recent incidents"
          pad={false}
          className="xl:col-span-2"
          action={
            <Link to="/admin/incidents" className="text-xs underline">
              All incidents
            </Link>
          }
        >
          <IncidentTable
            items={d.data?.recent_incidents ?? []}
            onOpen={(id) => nav(`/admin/incidents/${id}`)}
            compact
          />
        </Panel>
        <Panel title="Needs acknowledgement" pad={false}>
          {d.data?.pending.length ? (
            <ul>
              {d.data.pending.map((i) => (
                <li key={i.id} className="border-b border-line last:border-0">
                  <button
                    onClick={() => nav(`/admin/incidents/${i.id}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sunken"
                  >
                    <span>
                      <span className="block text-sm font-medium">
                        {CATEGORY[i.category] ?? i.category}
                      </span>
                      <span className="block text-xs text-muted">
                        {i.id} · {ago(i.created_at)}
                      </span>
                    </span>
                    <SeverityBadge n={i.severity} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-muted">
              Nothing is waiting. Every alert has been acknowledged.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel
          title="Recent AI detections"
          className="xl:col-span-2"
          action={
            <Link to="/admin/ai" className="text-xs underline">
              AI monitoring
            </Link>
          }
        >
          {d.data?.recent_ai.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {d.data.recent_ai.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => nav(`/admin/incidents/${i.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-line p-3 text-left hover:bg-sunken"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {DETECTION_LABEL[(i.ai_meta?.detector as string) ?? ''] ??
                          CATEGORY[i.category]}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {i.camera_id ?? i.audio_id} · {i.ai_model} ·{' '}
                        {i.ai_confidence != null
                          ? `${Math.round(i.ai_confidence * 100)}% confidence`
                          : ''}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <Badge
                        tone={
                          i.status === 'false_positive'
                            ? 'neutral'
                            : i.requires_verification &&
                                ['alerted', 'reported', 'analysed'].includes(i.status)
                              ? 'warn'
                              : 'info'
                        }
                      >
                        {i.status === 'false_positive'
                          ? 'False positive'
                          : ['alerted', 'reported', 'analysed'].includes(i.status)
                            ? 'Potential'
                            : 'Confirmed'}
                      </Badge>
                      <SimTag on={i.simulated} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">
              No AI detections yet. Start the CV worker or use the simulator on the CCTV page.
            </p>
          )}
        </Panel>
        <Panel
          title="Camera health"
          action={
            <Link to="/admin/cctv" className="text-xs underline">
              Open CCTV
            </Link>
          }
        >
          <ul className="grid gap-2">
            {cams.data
              ?.filter((c) => c.kind === 'camera')
              .map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <StatusDot on={c.online} /> {c.name}
                  </span>
                  <span className="text-xs text-muted">
                    {c.online ? 'streaming' : c.simulated ? 'simulated' : 'offline'}
                    {c.active_alerts ? ` · ${c.active_alerts} alert(s)` : ''}
                  </span>
                </li>
              ))}
          </ul>
          {!cams.data?.length && (
            <p className="text-sm text-muted">
              <Camera size={14} className="mr-1 inline" />
              No cameras registered.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function dateFrom(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}
