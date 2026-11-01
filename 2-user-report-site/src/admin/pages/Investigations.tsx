import { Check, Minus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, Panel, Segmented, Spinner, Stat } from '@common/ui/primitives';
import { PageHeader, StatusBadge } from '../components/shared';
import { useGet, type Incident } from '../data';
import { CATEGORY, ago } from '../labels';

const Cell = ({ on }: { on: boolean }) =>
  on ? (
    <Check size={16} className="text-ok" aria-label="recorded" />
  ) : (
    <Minus size={16} className="text-line-strong" aria-label="missing" />
  );

export default function Investigations() {
  const nav = useNavigate();
  const [view, setView] = useState('open');
  const all = useGet<{ items: Incident[] }>(
    '/incidents?limit=500&date_from=' +
      new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
  );
  if (all.error) return <ErrorState message={all.error} onRetry={all.reload} />;
  if (!all.data) return <Spinner />;
  const items = all.data.items.filter(
    (i) => !['false_positive', 'duplicate', 'rejected'].includes(i.status),
  );
  const active = items.filter((i) =>
    ['acknowledged', 'assigned', 'in_progress'].includes(i.status),
  );
  const resolved = items.filter((i) => ['resolved', 'closed'].includes(i.status));
  const missingRoot = active.filter((i) => !i.root_cause?.trim());
  const missingAction = resolved.filter((i) => !i.corrective_action?.trim());
  const rows =
    view === 'open' ? active : view === 'missing' ? [...missingRoot, ...missingAction] : resolved;
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Investigations"
        subtitle="Cases being worked, and whether the learning has been written down: root cause, corrective action and preventive action."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Under investigation" value={active.length} onClick={() => setView('open')} />
        <Stat
          label="Without a root cause yet"
          value={missingRoot.length}
          tone={missingRoot.length ? 'warn' : undefined}
          onClick={() => setView('missing')}
        />
        <Stat label="Resolved" value={resolved.length} onClick={() => setView('resolved')} />
        <Stat
          label="Resolved without corrective action"
          value={missingAction.length}
          tone={missingAction.length ? 'warn' : undefined}
          onClick={() => setView('missing')}
        />
      </div>
      <Panel
        pad={false}
        action={
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'open', label: 'In progress' },
              { value: 'missing', label: 'Missing learning' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
        }
        title="Cases (last 90 days)"
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing here"
            hint="Cases appear once an incident is acknowledged, assigned or resolved."
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Incident</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Root cause</th>
                <th className="px-3 py-2 font-medium">Corrective</th>
                <th className="px-3 py-2 font-medium">Preventive</th>
                <th className="px-3 py-2 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr
                  key={i.id}
                  tabIndex={0}
                  onClick={() => nav(`/admin/incidents/${i.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && nav(`/admin/incidents/${i.id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken"
                >
                  <td className="px-3 py-2.5 font-mono text-xs">{i.id}</td>
                  <td className="px-3 py-2.5">{CATEGORY[i.category]}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge s={i.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Cell on={!!i.root_cause?.trim()} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Cell on={!!i.corrective_action?.trim()} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Cell on={!!i.preventive_action?.trim()} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">{ago(i.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
