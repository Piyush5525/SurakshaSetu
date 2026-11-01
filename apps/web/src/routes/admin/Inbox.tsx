import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { db, storage } from '../../lib/firebase';
import { useCol, type LocationDoc, type ReportDoc } from './data';

const SEV = [
  '',
  'bg-lime-200',
  'bg-lime-300',
  'bg-yellow-300',
  'bg-orange-400',
  'bg-red-500 text-white',
];
const ROUTE = {
  emergency: 'EMERGENCY PATH (simulated)',
  supervisor_fast_track: 'Fast-track to supervisor',
  standard: '',
} as const;

function Media({ path, kind }: { path: string; kind: 'audio' | 'image' }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    getDownloadURL(ref(storage, path)).then(setUrl, () => setUrl(null));
  }, [path]);
  if (!url) return <p className="text-xs text-slate-500">(loading {kind}…)</p>;
  return kind === 'audio' ? (
    <audio controls src={url} className="w-full" />
  ) : (
    <img src={url} alt="Report" className="max-h-56 rounded" />
  );
}

export default function Inbox() {
  const reports = useCol<ReportDoc>('reports', 'createdAt');
  const locations = useCol<LocationDoc>('locations');
  const [status, setStatus] = useState('all');
  const [loc, setLoc] = useState('all');
  const [minSev, setMinSev] = useState(1);
  const [eco, setEco] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const name = (id: string) => locations.rows.find((l) => l.id === id)?.name ?? id;

  const rows = reports.rows.filter(
    (r) =>
      (status === 'all' || r.status === status) &&
      (loc === 'all' || r.locationId === loc) &&
      (r.severity ?? 0) >= minSev &&
      (!eco || (r.ecoTag && r.ecoTag !== 'none')),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow">
        <select
          className="rounded border p-1"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status filter"
        >
          {['all', 'received', 'being_fixed', 'fixed', 'dismissed'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="rounded border p-1"
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          aria-label="Location filter"
        >
          <option value="all">all locations</option>
          {locations.rows.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label className="text-sm">
          Min severity{' '}
          <select
            className="rounded border p-1"
            value={minSev}
            onChange={(e) => setMinSev(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <input type="checkbox" checked={eco} onChange={(e) => setEco(e.target.checked)} />{' '}
          eco-tagged only
        </label>
        <span className="ml-auto text-sm text-slate-500">{rows.length} reports</span>
      </div>

      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-3 shadow">
            <button
              className="flex w-full flex-wrap items-center gap-3 text-left"
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              <span
                className={`rounded px-2 py-1 text-lg font-black ${SEV[r.severity ?? 0] ?? ''}`}
              >
                {r.severity ?? '…'}
              </span>
              <span className="font-bold">{name(r.locationId)}</span>
              <span>{r.hazardType.replace('_', ' ')}</span>
              {r.ecoTag && r.ecoTag !== 'none' && (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                  🌱 {r.ecoTag}
                </span>
              )}
              {r.source === 'camera' && (
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs">camera</span>
              )}
              {r.route && r.route !== 'standard' && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${r.route === 'emergency' ? 'bg-red-600 text-white' : 'bg-orange-200'}`}
                >
                  {ROUTE[r.route]}
                </span>
              )}
              <span className="ml-auto text-sm text-slate-500">
                {r.status} · {r.createdAt.toLocaleString()} · shift {r.shift}
              </span>
            </button>
            {open === r.id && (
              <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-2">
                <div className="text-sm">
                  <p className="font-bold">Why this severity</p>
                  <p>{r.severityReason ?? 'Waiting for triage…'}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {r.severityBreakdown?.map((c) => (
                      <li key={c.key}>
                        {c.label}: <b>+{c.points}</b> {c.detail ? `(${c.detail})` : ''}
                      </li>
                    ))}
                  </ul>
                  {r.ecoTag && r.ecoTag !== 'none' && (
                    <p className="mt-2">
                      Eco-tag: {r.ecoTag} — {r.ecoReason}
                    </p>
                  )}
                  <p className="mt-2">
                    Receipt <b>{r.receiptCode}</b> · serious-harm flag: {String(r.seriousHarmFlag)}{' '}
                    · injury now: {String(r.injuryNow)}
                  </p>
                  {r.reporterName && <p>Reporter-provided name: {r.reporterName}</p>}
                  <p className="mt-2 font-bold">Transcript ({r.transcriptStatus})</p>
                  <p>{r.transcript || '—'}</p>
                </div>
                <div className="grid gap-2">
                  {r.audioPath && <Media path={r.audioPath} kind="audio" />}
                  {r.photoPath && <Media path={r.photoPath} kind="image" />}
                  <div className="flex gap-2">
                    {r.status !== 'dismissed' ? (
                      <button
                        className="rounded bg-slate-200 px-3 py-1 text-sm"
                        onClick={() => {
                          if (
                            confirm(
                              'Dismiss this report? It will be removed from the public board.',
                            )
                          )
                            void updateDoc(doc(db, 'reports', r.id), {
                              status: 'dismissed',
                              updatedAt: serverTimestamp(),
                            });
                        }}
                      >
                        Dismiss
                      </button>
                    ) : (
                      <button
                        className="rounded bg-slate-200 px-3 py-1 text-sm"
                        onClick={() =>
                          void updateDoc(doc(db, 'reports', r.id), {
                            status: 'received',
                            updatedAt: serverTimestamp(),
                          })
                        }
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
