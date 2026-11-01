import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useCol, type LocationDoc } from './data';

declare const __LAN_IP__: string;

/** Phones cannot open localhost, so prefer this computer's Wi-Fi address. */
function defaultBase(): string {
  const { hostname, port, protocol } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return window.location.origin;
  return __LAN_IP__ ? `${protocol}//${__LAN_IP__}:${port}` : window.location.origin;
}

/** Printable QR sticker sheet. Use the browser's Print → "Save as PDF". */
export default function Stickers() {
  const locations = useCol<LocationDoc>('locations');
  const [base, setBase] = useState(defaultBase());
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    void Promise.all(
      locations.rows.map(
        async (l) =>
          [l.id, await QRCode.toDataURL(`${base}/r/${l.id}`, { margin: 1, width: 360 })] as const,
      ),
    ).then((pairs) => setCodes(Object.fromEntries(pairs)));
  }, [locations.rows, base]);

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-white p-4 shadow print:hidden">
        <label className="block text-sm font-semibold">
          Address phones will open (use your computer&apos;s network address so phones can reach it,
          e.g. http://192.168.1.20:5173)
          <input
            className="mt-1 w-full rounded border p-2"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </label>
        <button
          className="mt-3 rounded bg-slate-900 px-4 py-2 font-semibold text-white"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 print:gap-2">
        {locations.rows.map((l) => (
          <div
            key={l.id}
            className="break-inside-avoid rounded-2xl border-4 border-slate-900 bg-yellow-300 p-4 text-center text-slate-950"
          >
            <p className="text-3xl font-black">{l.name}</p>
            <p className="text-lg font-bold">{l.nameHi}</p>
            {codes[l.id] && (
              <img
                src={codes[l.id]}
                alt={`QR for ${l.name}`}
                className="mx-auto my-2 w-48 bg-white p-1"
              />
            )}
            <p className="text-2xl font-black">Spot it. Scan it. Say it.</p>
            <p className="text-sm">देखें। स्कैन करें। बताएं। · anonymous · 30 seconds</p>
            <p className="mt-1 text-xs">Demo Plant — Line 3 (fictional)</p>
          </div>
        ))}
      </div>
    </div>
  );
}
