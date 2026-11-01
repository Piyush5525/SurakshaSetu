import { Download, FileText, Plus, Power, QrCode, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE, api, auth } from '@common/lib/api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  Select,
  Spinner,
} from '@common/ui/primitives';
import { Modal, useToast } from '@common/ui/overlay';
import { PageHeader } from '../components/shared';
import { useGet } from '../data';
import { CATEGORY, STATUS, ago, when } from '../labels';

declare const __LAN_IPS__: string[];

interface Asset {
  id: string;
  name: string;
  kind: string;
  site: string;
  building: string;
  floor: string;
  zone: string;
  department: string;
  qr_active: number;
  created_at: string;
  incident_count: number;
  open_count: number;
  qr_report_count: number;
  scan_count: number;
  last_scanned_at: string | null;
}
interface Template {
  id: string;
  label: string;
  tip: string;
  color: string;
}

async function blobOf(path: string): Promise<Blob> {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${auth.token() ?? ''}` },
  });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  return r.blob();
}
function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function defaultBase(): string {
  const saved = localStorage.getItem('sw.stickerBase');
  if (saved) return saved;
  const ip = __LAN_IPS__.find((i) => !i.startsWith('192.168.137.')) ?? __LAN_IPS__[0];
  return ip ? `http://${ip}:5174` : 'http://localhost:5174';
}
const TEMPLATE_FOR_KIND: Record<string, string> = {
  machine: 'machinery',
  lab: 'laboratory',
  area: 'warehouse',
};

function Preview({
  asset,
  template,
  base,
  nonce,
}: {
  asset: Asset;
  template: string;
  base: string;
  nonce: number;
}) {
  const [src, setSrc] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let url = '';
    let alive = true; // an older, slower response must never replace a newer one
    setErr('');
    setSrc(''); // show the spinner while the new sticker renders
    blobOf(`/assets/${asset.id}/sticker.png?template=${template}&base=${encodeURIComponent(base)}`)
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch((e: unknown) => alive && setErr(e instanceof Error ? e.message : 'Preview failed'));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset.id, template, base, nonce]);
  if (err) return <ErrorState message={err} />;
  return src ? (
    <img
      src={src}
      alt={`Sticker preview for ${asset.name}`}
      className="mx-auto w-full max-w-[19rem] rounded-md border border-line shadow-card"
    />
  ) : (
    <Spinner label="Rendering sticker…" />
  );
}

export default function QrManagement() {
  const toast = useToast();
  const assets = useGet<Asset[]>('/assets');
  const templates = useGet<Template[]>('/sticker-templates', false);
  const depts = useGet<{ name: string }[]>('/departments', false);
  const [sel, setSel] = useState<string>('');
  const [template, setTemplate] = useState('');
  const [base, setBase] = useState(defaultBase());
  const [nonce, setNonce] = useState(0);
  const [create, setCreate] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    id: '',
    name: '',
    kind: 'machine',
    building: 'Line 3',
    floor: 'G',
    zone: '',
    department: 'Maintenance',
  });
  const scans = useGet<{
    scans: { ts: string; outcome: string }[];
    reports: {
      id: string;
      category: string;
      severity: number;
      status: string;
      created_at: string;
    }[];
  }>(sel ? `/assets/${sel}/scans` : null);

  const list = (assets.data ?? []).filter(
    (a) => !q || `${a.name} ${a.id} ${a.zone}`.toLowerCase().includes(q.toLowerCase()),
  );
  const cur = assets.data?.find((a) => a.id === sel) ?? null;
  useEffect(() => {
    if (!sel && assets.data?.[0]) setSel(assets.data[0].id);
  }, [assets.data, sel]);
  useEffect(() => {
    if (cur) setTemplate((t) => t || TEMPLATE_FOR_KIND[cur.kind] || 'general');
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (p: () => Promise<unknown>, ok: string) => {
    try {
      await p();
      toast(ok);
      assets.reload();
      setNonce((n) => n + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'crit');
    }
  };
  const local = /localhost|127\.0\.0\.1/.test(base);

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="QR Management"
        subtitle="One sticker per machine or area. Scanning opens a report form already filled with the location. A disabled sticker refuses new reports but keeps its history."
        actions={
          <Button variant="primary" onClick={() => setCreate(true)}>
            <Plus size={16} /> New sticker
          </Button>
        }
      />
      <Panel className="mb-5">
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_auto]">
          <Field
            label="Address a phone opens when it scans"
            hint={
              local
                ? 'localhost only works on this computer. Use this computer’s Wi-Fi address so phones can reach the sticker app (port 5174).'
                : 'Phones must be on the same network as this computer.'
            }
          >
            <Input
              value={base}
              onChange={(e) => {
                setBase(e.target.value);
                localStorage.setItem('sw.stickerBase', e.target.value);
              }}
            />
          </Field>
          <Field label="Template for sheets">
            <Select value={template || 'general'} onChange={(e) => setTemplate(e.target.value)}>
              {templates.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label.charAt(0) + t.label.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            onClick={() =>
              void act(
                async () =>
                  save(
                    await blobOf(
                      `/assets/stickers.pdf?template=${template || 'general'}&base=${encodeURIComponent(base)}`,
                    ),
                    `stickers-${template || 'general'}.pdf`,
                  ),
                'Sheet downloaded',
              )
            }
          >
            <FileText size={16} /> Print sheet (all active)
          </Button>
        </div>
        {__LAN_IPS__.length > 1 && (
          <p className="mt-2 text-xs text-muted">
            This computer has several addresses:{' '}
            {__LAN_IPS__.map((ip) => (
              <button
                key={ip}
                className="mr-2 rounded border border-line-strong px-1.5 hover:bg-sunken"
                onClick={() => {
                  setBase(`http://${ip}:5174`);
                  localStorage.setItem('sw.stickerBase', `http://${ip}:5174`);
                }}
              >
                {ip}
              </button>
            ))}
          </p>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Panel
          pad={false}
          title={`Stickers (${assets.data?.length ?? 0})`}
          action={
            <Input
              aria-label="Search stickers"
              placeholder="Search"
              className="h-8 w-44"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          }
        >
          {assets.error ? (
            <div className="p-4">
              <ErrorState message={assets.error} onRetry={assets.reload} />
            </div>
          ) : assets.loading && !assets.data ? (
            <Spinner />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<QrCode size={32} />}
              title="No stickers yet"
              hint="Create one for a machine or area."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Asset</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">QR</th>
                    <th className="px-3 py-2 font-medium">Scans</th>
                    <th className="px-3 py-2 font-medium">Reports</th>
                    <th className="px-3 py-2 font-medium">Last scan</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => setSel(a.id)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSel(a.id)}
                      className={`cursor-pointer border-b border-line last:border-0 hover:bg-sunken ${sel === a.id ? 'bg-sunken' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-medium">{a.name}</span>
                        <span className="block font-mono text-xs text-muted">{a.id}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {a.zone || '—'}
                        <span className="block text-xs text-muted">{a.department}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={a.qr_active ? 'ok' : 'neutral'}>
                          {a.qr_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 tabular">{a.scan_count}</td>
                      <td className="px-3 py-2.5 tabular">
                        {a.qr_report_count}
                        {a.open_count ? (
                          <span className="text-xs text-warn"> ({a.open_count} open)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {a.last_scanned_at ? ago(a.last_scanned_at) : 'never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {cur && (
          <div className="grid content-start gap-5">
            <Panel
              title={cur.name}
              action={
                <Badge tone={cur.qr_active ? 'ok' : 'neutral'}>
                  {cur.qr_active ? 'Active' : 'Disabled'}
                </Badge>
              }
            >
              <div className="mb-3 flex flex-wrap gap-2">
                {templates.data?.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${(template || 'general') === t.id ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken'}`}
                    title={t.tip}
                  >
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full"
                      style={{ background: t.color }}
                    />
                    {t.label.charAt(0) + t.label.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <Preview asset={cur} template={template || 'general'} base={base} nonce={nonce} />
              <p className="mt-2 text-center text-xs text-muted">
                100 × 140 mm at 300 dpi.{' '}
                {templates.data?.find((t) => t.id === (template || 'general'))?.tip}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  onClick={() =>
                    void act(
                      async () =>
                        save(
                          await blobOf(
                            `/assets/${cur.id}/sticker.png?template=${template || 'general'}&base=${encodeURIComponent(base)}`,
                          ),
                          `sticker-${cur.id}.png`,
                        ),
                      'PNG downloaded',
                    )
                  }
                >
                  <Download size={16} /> PNG
                </Button>
                <Button
                  onClick={() =>
                    void act(
                      async () =>
                        save(
                          await blobOf(
                            `/assets/stickers.pdf?template=${template || 'general'}&ids=${cur.id}&base=${encodeURIComponent(base)}`,
                          ),
                          `sticker-${cur.id}.pdf`,
                        ),
                      'PDF downloaded',
                    )
                  }
                >
                  <FileText size={16} /> PDF
                </Button>
                <Button
                  onClick={() =>
                    void act(
                      () =>
                        api(`/assets/${cur.id}`, {
                          method: 'PATCH',
                          json: { qr_active: !cur.qr_active },
                        }),
                      cur.qr_active
                        ? 'Sticker disabled. New scans are refused.'
                        : 'Sticker enabled',
                    )
                  }
                >
                  <Power size={16} /> {cur.qr_active ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  onClick={() =>
                    confirm(
                      'The printed sticker will stop working and a new code is issued. Continue?',
                    ) &&
                    void act(
                      () => api(`/assets/${cur.id}/regenerate-qr`, { method: 'POST' }),
                      'New QR code issued; reprint the sticker',
                    )
                  }
                >
                  <RefreshCw size={16} /> Regenerate
                </Button>
              </div>
            </Panel>
            <Panel title="Scan history and reports">
              <dl className="mb-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Scans</dt>
                  <dd className="text-lg font-semibold">{cur.scan_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Reports</dt>
                  <dd className="text-lg font-semibold">{cur.qr_report_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Created</dt>
                  <dd className="text-sm font-medium">{when(cur.created_at).split(',')[0]}</dd>
                </div>
              </dl>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Reports from this sticker
              </h3>
              {scans.data?.reports.length ? (
                <ul className="mb-3 grid gap-1 text-sm">
                  {scans.data.reports.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <Link
                        className="flex justify-between rounded px-1 hover:bg-sunken"
                        to={`/admin/incidents/${r.id}`}
                      >
                        <span>
                          <span className="font-mono text-xs">{r.id}</span> ·{' '}
                          {CATEGORY[r.category] ?? r.category}
                        </span>
                        <span className="text-xs text-muted">{STATUS[r.status]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-sm text-muted">No reports yet.</p>
              )}
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Recent scans
              </h3>
              {scans.data?.scans.length ? (
                <ul className="grid gap-0.5 text-xs text-ink-2">
                  {scans.data.scans.slice(0, 6).map((s, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{when(s.ts)}</span>
                      <span className={s.outcome === 'ok' ? '' : 'text-crit'}>
                        {s.outcome === 'ok' ? 'opened form' : 'refused: disabled'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nobody has scanned this sticker yet.</p>
              )}
            </Panel>
          </div>
        )}
      </div>

      <Modal open={create} onClose={() => setCreate(false)} title="New sticker">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api('/assets', {
                json: { ...form, x: 6 + Math.random() * 60, y: 6 + Math.random() * 70 },
              });
              setCreate(false);
              setSel(form.id);
              setForm({ ...form, id: '', name: '' });
            }, 'Sticker created');
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asset ID" hint="Letters, digits, - and _">
              <Input
                required
                pattern="[a-z0-9_-]{2,40}"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Machine or area name">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="machine">Machine</option>
                <option value="area">Area</option>
                <option value="lab">Laboratory</option>
              </Select>
            </Field>
            <Field label="Department">
              <Select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              >
                {depts.data?.map((d) => (
                  <option key={d.name}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Building">
              <Input
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
              />
            </Field>
            <Field label="Floor">
              <Input
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
              />
            </Field>
            <Field label="Zone" className="sm:col-span-2">
              <Input
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-muted">
            A random QR token is generated. It contains no machine information; the server looks the
            machine up when the sticker is scanned.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setCreate(false)}>
              Cancel
            </Button>
            <Button variant="primary">Create sticker</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
