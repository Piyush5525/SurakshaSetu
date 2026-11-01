import type { ReactNode } from 'react';
import { Badge, SeverityBadge } from '@common/ui/primitives';
import { CATEGORY, SOURCE, STATUS, STATUS_TONE, ago } from '../labels';
import type { Incident } from '../data';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ s }: { s: string }) {
  return <Badge tone={STATUS_TONE[s] ?? 'neutral'}>{STATUS[s] ?? s}</Badge>;
}
export function SimTag({ on }: { on: number | boolean }) {
  return on ? <Badge tone="sim">Simulated</Badge> : null;
}

export function Where({
  i,
}: {
  i: Pick<Incident, 'asset_id' | 'camera_id' | 'audio_id' | 'zone' | 'building'>;
}) {
  const main = i.asset_id ?? i.camera_id ?? i.audio_id ?? '—';
  return (
    <span>
      {main}
      {i.zone && <span className="text-muted"> · {i.zone}</span>}
    </span>
  );
}

export function IncidentTable({
  items,
  onOpen,
  compact = false,
  empty = 'No incidents match.',
}: {
  items: Incident[];
  onOpen: (id: string) => void;
  compact?: boolean;
  empty?: string;
}) {
  if (!items.length) return <p className="p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Incident</th>
            <th className="px-3 py-2 font-medium">Severity</th>
            <th className="px-3 py-2 font-medium">Category</th>
            {!compact && <th className="px-3 py-2 font-medium">Source</th>}
            <th className="px-3 py-2 font-medium">Location</th>
            {!compact && <th className="px-3 py-2 font-medium">Department</th>}
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr
              key={i.id}
              tabIndex={0}
              onClick={() => onOpen(i.id)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(i.id)}
              className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken focus-visible:bg-sunken"
            >
              <td className="px-3 py-2.5 font-mono text-xs">{i.id}</td>
              <td className="px-3 py-2.5">
                <SeverityBadge n={i.severity} />
              </td>
              <td className="px-3 py-2.5">
                {CATEGORY[i.category] ?? i.category}
                {i.requires_verification ? (
                  <span className="ml-1.5 text-xs text-warn">needs verification</span>
                ) : null}
                <SimTag on={i.simulated} />
              </td>
              {!compact && <td className="px-3 py-2.5 text-ink-2">{SOURCE[i.source]}</td>}
              <td className="px-3 py-2.5 text-ink-2">
                <Where i={i} />
              </td>
              {!compact && <td className="px-3 py-2.5 text-ink-2">{i.department}</td>}
              <td className="px-3 py-2.5">
                <StatusBadge s={i.status} />
              </td>
              <td className="px-3 py-2.5 text-muted" title={i.created_at}>
                {ago(i.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
