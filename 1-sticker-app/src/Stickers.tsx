import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useLocations } from '@common/lib/useLocation';

declare const __LAN_IPS__: string[];

/** Phones cannot open localhost, so prefer this computer's Wi-Fi address. */
function defaultBase(): string {
  const { hostname, port, protocol } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return window.location.origin;
  const ip = __LAN_IPS__.find((i) => !i.startsWith('192.168.137.')) ?? __LAN_IPS__[0];
  return ip ? `${protocol}//${ip}:${port}` : window.location.origin;
}

/** Printable QR sticker sheet, one sticker per machine. Use the browser's Print → "Save as PDF". */
export default function Stickers() {
  const locations = useLocations();
  const [base, setBase] = useState(defaultBase());
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    void Promise.all(
      locations.map(
        async (l) =>
          [l.id, await QRCode.toDataURL(`${base}/r/${l.id}`, { margin: 1, width: 360 })] as const,
      ),
    ).then((pairs) => setCodes(Object.fromEntries(pairs)));
  }, [locations, base]);

  return (
    <div className="mx-auto max-w-4xl p-4 text-white print:text-black">
      <div className="mb-4 rounded-2xl bg-slate-800 p-4 print:hidden">
        <h1 className="text-2xl font-extrabold text-yellow-300">Machine QR stickers</h1>
        <p className="mt-1 text-sm text-slate-300">
          Print one per machine. Scanning opens a 30-second report form for that machine on the
          worker&apos;s phone (same Wi-Fi as this computer).
        </p>
        <label className="mt-3 block text-sm font-semibold">
          Address phones will open
          <input
            className="mt-1 w-full rounded bg-white p-2 text-black"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </label>
        {__LAN_IPS__.length > 1 && (
          <p className="mt-2 text-sm text-slate-300">
            This computer has several addresses; pick the one on your Wi-Fi:{' '}
            {__LAN_IPS__.map((ip) => (
              <button
                key={ip}
                className="mr-2 rounded bg-slate-600 px-2 py-1"
                onClick={() =>
                  setBase(`${window.location.protocol}//${ip}:${window.location.port}`)
                }
              >
                {ip}
              </button>
            ))}
          </p>
        )}
        {/localhost|127\.0\.0\.1/.test(base) && (
          <p className="mt-2 text-sm text-amber-300">
            This address only works on this computer. Connect the computer to Wi-Fi and reload, or
            type its network address (for example http://192.168.1.20:5174).
          </p>
        )}
        <button
          className="mt-3 rounded bg-yellow-300 px-4 py-2 font-bold text-slate-950"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 print:gap-2">
        {locations.map((l) => (
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
