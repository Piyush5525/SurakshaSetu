import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { db, storage } from '@common/lib/firebase';
import type { Role } from './Admin';
import { useCol, type EventDoc } from './data';

const RULE = {
  forklift_person_gap: 'Forklift–person near miss',
  hand_in_danger_zone: 'Hand in machine danger zone while running',
  person_in_forklift_lane: 'Person in forklift-only lane',
  idle_machine: 'Machine running with nobody present (energy)',
} as const;

function Snapshot({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    getDownloadURL(ref(storage, path)).then(setUrl, () => setUrl(null));
  }, [path]);
  return url ? (
    <img src={url} alt="Pixelated snapshot (people blurred)" className="w-full rounded" />
  ) : (
    <div className="grid h-32 place-items-center rounded bg-slate-200 text-sm text-slate-500">
      no snapshot
    </div>
  );
}

export default function EventsTab({ role }: { role: Role }) {
  const events = useCol<EventDoc>('events', 'detectedAt');
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'dismissed'>('pending');
  const rows = events.rows.filter((e) => e.status === filter);

  const review = (id: string, status: 'confirmed' | 'dismissed') =>
    updateDoc(doc(db, 'events', id), {
      status,
      reviewedByRole: role,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

  return (
    <div>
      <p className="mb-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
        <b>Auto-detected — needs confirmation.</b> The camera service only flags sustained,
        high-confidence events. People in snapshots are pixelated; snapshots are deleted after the
        retention period. A dismissed event keeps only the verdict. Confirming creates a normal
        report that goes through triage.
      </p>
      <div className="mb-3 flex gap-2">
        {(['pending', 'confirmed', 'dismissed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded px-3 py-1 ${filter === s ? 'bg-slate-900 text-white' : 'bg-slate-200'}`}
          >
            {s} ({events.rows.filter((e) => e.status === s).length})
          </button>
        ))}
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((e) => (
          <li key={e.id} className="rounded-2xl bg-white p-3 shadow">
            <p className="font-bold">{RULE[e.rule]}</p>
            <p className="text-sm text-slate-600">
              {e.locationId} · zone {e.zoneId} · {e.detectedAt.toLocaleString()}
              {e.confidence !== null && ` · confidence ${Math.round(e.confidence * 100)}%`}
              {e.measure !== null &&
                ` · ${e.rule === 'forklift_person_gap' ? `gap ${e.measure}px` : e.rule === 'idle_machine' ? `${e.measure} min idle` : `${e.measure}s in zone`}`}
              {e.simulated && ' · machine-running signal SIMULATED'}
            </p>
            <div className="my-2">
              {e.snapshotPath ? (
                <Snapshot path={e.snapshotPath} />
              ) : (
                <p className="text-sm text-slate-500">No snapshot stored.</p>
              )}
            </div>
            {e.status === 'pending' ? (
              <div className="flex gap-2">
                <button
                  className="rounded bg-green-700 px-3 py-2 font-semibold text-white"
                  onClick={() => void review(e.id, 'confirmed')}
                >
                  Confirm: real near miss
                </button>
                <button
                  className="rounded bg-slate-300 px-3 py-2 font-semibold"
                  onClick={() => void review(e.id, 'dismissed')}
                >
                  Dismiss: false alarm
                </button>
              </div>
            ) : (
              <p className="text-sm">
                Verdict: <b>{e.status}</b>
                {e.reportId ? ` → report ${e.reportId}` : ''}
              </p>
            )}
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="text-slate-500">Nothing here.</p>}
    </div>
  );
}
