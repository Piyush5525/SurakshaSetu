import { Download, FilterX, Search } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Panel,
  Select,
  Spinner,
} from '@common/ui/primitives';
import { IncidentTable, PageHeader } from '../components/shared';
import { qs, useGet, type Incident } from '../data';
import { CATEGORY, SOURCE, STATUS } from '../labels';

const PAGE = 25;
const KEYS = [
  'q',
  'status',
  'category',
  'source',
  'department',
  'severity_min',
  'asset_id',
  'zone',
  'camera_id',
  'date_from',
  'date_to',
  'open_only',
  'critical_only',
  'awaiting_ack',
  'simulated',
] as const;

export default function Incidents() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ''])) as Record<
    (typeof KEYS)[number],
    string
  >;
  const page = Number(sp.get('page') ?? 0);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    n.delete('page');
    setSp(n, { replace: true });
  };
  const list = useGet<{ total: number; items: Incident[] }>(
    `/incidents${qs({ ...f, limit: PAGE, offset: page * PAGE })}`,
  );
  const depts = useGet<{ name: string }[]>('/departments', false);
  const active = KEYS.filter((k) => f[k]);
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE));

  const csv = () => {
    const rows = list.data?.items ?? [];
    const head = [
      'id',
      'created_at',
      'category',
      'severity',
      'source',
      'status',
      'department',
      'location',
      'simulated',
    ];
    const body = rows.map((i) =>
      [
        i.id,
        i.created_at,
        i.category,
        i.severity,
        i.source,
        i.status,
        i.department ?? '',
        i.asset_id ?? i.camera_id ?? '',
        i.simulated,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const url = URL.createObjectURL(
      new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'incidents.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const chips = useMemo(
    () =>
      active.map((k) => {
        const raw = f[k];
        const label =
          k === 'category'
            ? (CATEGORY[raw] ?? raw)
            : k === 'status'
              ? (STATUS[raw] ?? raw)
              : k === 'source'
                ? (SOURCE[raw] ?? raw)
                : raw === 'true'
                  ? k.replace(/_/g, ' ')
                  : `${k.replace(/_/g, ' ')}: ${raw}`;
        return { k, label };
      }),
    [active, f],
  );

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Incidents"
        subtitle="All sources in one list: QR stickers, worker portal, CCTV AI, audio and admin. Filters are saved in the address so you can share a view."
        actions={
          <Button onClick={csv} disabled={!list.data?.items.length}>
            <Download size={16} /> Export CSV
          </Button>
        }
      />
      <Panel pad={false}>
        <div className="grid gap-2 border-b border-line p-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-3 text-muted" />
            <Input
              aria-label="Search"
              placeholder="Search ID or description"
              className="pl-9"
              value={f.q}
              onChange={(e) => set('q', e.target.value)}
            />
          </div>
          <Select
            aria-label="Status"
            value={f.status}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Severity"
            value={f.severity_min}
            onChange={(e) => set('severity_min', e.target.value)}
          >
            <option value="">Any severity</option>
            <option value="3">3 and above</option>
            <option value="4">4 and above</option>
            <option value="5">5 only</option>
          </Select>
          <Select
            aria-label="Category"
            value={f.category}
            onChange={(e) => set('category', e.target.value)}
          >
            <option value="">Any category</option>
            {Object.entries(CATEGORY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Source"
            value={f.source}
            onChange={(e) => set('source', e.target.value)}
          >
            <option value="">Any source</option>
            {Object.entries(SOURCE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Department"
            value={f.department}
            onChange={(e) => set('department', e.target.value)}
          >
            <option value="">Any department</option>
            {depts.data?.map((d) => (
              <option key={d.name}>{d.name}</option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="From date"
              value={f.date_from}
              onChange={(e) => set('date_from', e.target.value)}
            />
            <Input
              type="date"
              aria-label="To date"
              value={f.date_to}
              onChange={(e) => set('date_to', e.target.value)}
            />
          </div>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            {chips.map((c) => (
              <button
                key={c.k}
                onClick={() => set(c.k, '')}
                className="rounded-full border border-line-strong bg-sunken px-2.5 py-0.5 text-xs font-medium hover:bg-line"
              >
                {c.label} ×
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSp({}, { replace: true })}>
              <FilterX size={14} /> Clear all
            </Button>
          </div>
        )}
        {list.error ? (
          <div className="p-4">
            <ErrorState message={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Spinner />
        ) : list.data && list.data.items.length === 0 ? (
          <EmptyState
            title="No incidents match these filters"
            hint="Clear a filter or widen the date range."
          />
        ) : (
          <IncidentTable
            items={list.data?.items ?? []}
            onOpen={(id) => nav(`/admin/incidents/${id}`)}
          />
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm text-muted">
          <span>{list.data?.total ?? 0} incidents</span>
          <span className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={page <= 0}
              onClick={() =>
                setSp(new URLSearchParams({ ...Object.fromEntries(sp), page: String(page - 1) }))
              }
            >
              Previous
            </Button>
            Page {page + 1} of {pages}
            <Button
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() =>
                setSp(new URLSearchParams({ ...Object.fromEntries(sp), page: String(page + 1) }))
              }
            >
              Next
            </Button>
          </span>
        </div>
      </Panel>
    </div>
  );
}
