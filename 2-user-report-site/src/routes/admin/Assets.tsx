import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE, api, auth } from '@common/lib/api';
import { Card, useGet } from './hooks';

interface Asset {
  id: string;
  name: string;
  kind: string;
  zone: string;
  department: string;
  qr_token: string;
  qr_active: number;
  incident_count: number;
  open_count: number;
}

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

/** Fetch with the sign-in token (the file endpoints are staff-only), then hand the browser a blob. */
async function fetchBlob(path: string): Promise<Blob> {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${auth.token() ?? ''}` },
  });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  return r.blob();
}
function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function QrImg({ id, token }: { id: string; token: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    fetchBlob(`/assets/${id}/qr.png?scale=6&base=${encodeURIComponent(stickerBase())}`)
      .then((b) => setSrc((url = URL.createObjectURL(b))))
      .catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, token]);
  return src ? (
    <img src={src} alt={`QR for ${id}`} className="h-28 w-28 bg-white" />
  ) : (
    <div className="h-28 w-28 bg-slate-200" />
  );
}

declare const __LAN_IPS__: string[];
/** Phones need this computer's network address, not "localhost". */
function stickerBase(): string {
  const saved = localStorage.getItem('sw.stickerBase');
  if (saved) return saved;
  const ip = __LAN_IPS__.find((i) => !i.startsWith('192.168.137.')) ?? __LAN_IPS__[0];
  return ip ? `http://${ip}:5174` : 'http://localhost:5174';
}

export default function Assets() {
  const list = useGet<Asset[]>('/assets');
  const [base, setBase] = useState(stickerBase());
  const [form, setForm] = useState({
    id: '',
    name: '',
    zone: '',
    department: 'EHS',
    kind: 'machine',
  });
  const [msg, setMsg] = useState('');
  const act = async (p: () => Promise<unknown>) => {
    setMsg('');
    try {
      await p();
      list.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  };
  return (
    <div className="grid gap-4">
      <Card title="QR stickers">
        <label className="block text-sm font-semibold">
          Address a phone opens when it scans (this computer on your Wi-Fi, port 5174)
          <input
            className="mt-1 w-full max-w-md rounded border p-2"
            value={base}
            onChange={(e) => {
              setBase(e.target.value);
              localStorage.setItem('sw.stickerBase', e.target.value);
            }}
          />
        </label>
        {/localhost|127\.0\.0\.1/.test(base) && (
          <p className="mt-1 text-sm text-amber-700">
            Only works on this computer. Use your Wi-Fi address (for example{' '}
            {__LAN_IPS__[0] ? `http://${__LAN_IPS__[0]}:5174` : 'http://192.168.1.20:5174'}).
          </p>
        )}
        <button
          className="mt-3 rounded bg-yellow-300 px-4 py-2 font-bold"
          onClick={() =>
            void act(async () =>
              download(
                await fetchBlob(`/assets/qr-sheet.pdf?base=${encodeURIComponent(base)}`),
                'qr-stickers.pdf',
              ),
            )
          }
        >
          Download all stickers (PDF)
        </button>
        {msg && <p className="mt-2 font-bold text-red-700">{msg}</p>}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((a) => (
          <Card key={a.id} className={a.qr_active ? '' : 'opacity-60'}>
            <div className="flex gap-3">
              <QrImg id={a.id} token={a.qr_token} />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">{a.name}</p>
                <p className="text-xs text-slate-500">
                  {a.id} · {a.kind} · {a.zone} · {a.department}
                </p>
                <p className="mt-1 text-sm">
                  {a.incident_count} incidents, <b>{a.open_count}</b> open
                </p>
                <p className="text-xs font-bold">{a.qr_active ? 'QR active' : 'QR DISABLED'}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-xs font-bold">
              <button
                className="rounded border px-2 py-1"
                onClick={() =>
                  void act(async () =>
                    download(
                      await fetchBlob(`/assets/${a.id}/qr.png?base=${encodeURIComponent(base)}`),
                      `qr-${a.id}.png`,
                    ),
                  )
                }
              >
                PNG
              </button>
              <button
                className="rounded border px-2 py-1"
                onClick={() =>
                  void act(() =>
                    api(`/assets/${a.id}`, { method: 'PATCH', json: { qr_active: !a.qr_active } }),
                  )
                }
              >
                {a.qr_active ? 'Disable' : 'Enable'}
              </button>
              <button
                className="rounded border px-2 py-1"
                onClick={() =>
                  confirm('Old sticker stops working. Continue?') &&
                  void act(() => api(`/assets/${a.id}/regenerate-qr`, { method: 'POST' }))
                }
              >
                Regenerate
              </button>
              <Link className="rounded border px-2 py-1" to={`/admin/incidents?asset=${a.id}`}>
                Incidents
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Register a machine / location">
        <form
          className="grid gap-2 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api('/assets', {
                json: { ...form, x: 5 + Math.random() * 60, y: 5 + Math.random() * 70 },
              });
              setForm({ ...form, id: '', name: '' });
            });
          }}
        >
          <input
            required
            pattern="[a-z0-9_-]{2,40}"
            placeholder="id (a-z, 0-9, _ -)"
            className="rounded border p-2"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
          <input
            required
            placeholder="Name"
            className="rounded border p-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Zone"
            className="rounded border p-2"
            value={form.zone}
            onChange={(e) => setForm({ ...form, zone: e.target.value })}
          />
          <select
            className="rounded border p-2"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            {['machine', 'area', 'lab'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <select
            className="rounded border p-2"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          >
            {DEPTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <button className="rounded bg-slate-900 p-2 font-bold text-white">
            Create + generate QR
          </button>
        </form>
        <p className="mt-1 text-xs text-slate-500">
          Requires manager or admin. A random QR token is generated; it holds no machine
          information.
        </p>
      </Card>
    </div>
  );
}
