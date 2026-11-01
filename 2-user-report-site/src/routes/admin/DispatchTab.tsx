import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { db, functions } from '@common/lib/firebase';
import type { Role } from './Admin';
import { useCol } from './data';

interface Step {
  step: number;
  role: string;
  label: string;
  afterMinutes: number;
  state: 'pending' | 'notified' | 'skipped';
  dueAt: Date;
  notifiedAt: Date | null;
}
interface Esc {
  reportId: string;
  kind: 'emergency' | 'fast_track';
  status: 'active' | 'acknowledged' | 'resolved';
  locationName: string;
  severity: number;
  assemblyPoint: string;
  startedAt: Date;
  chain: Step[];
  dispatchLog: { message: string; label: string; at: { toDate(): Date } | Date }[];
}

const when = (v: { toDate(): Date } | Date) =>
  (v instanceof Date ? v : v.toDate()).toLocaleTimeString();

/** Mock dispatcher screen. EVERYTHING here is simulated: no real emergency service is ever contacted. */
export default function DispatchTab({ role }: { role: Role }) {
  const escs = useCol<Esc>('escalations', 'createdAt');
  const [scale, setScale] = useState(1);
  const hasActive = escs.rows.some((e) => e.status === 'active');

  useEffect(() => {
    if (!hasActive) return;
    const call = () =>
      void httpsCallable(
        functions,
        'advanceEscalations',
      )({ timeScale: scale }).catch(() => undefined);
    call();
    const i = setInterval(call, 4000);
    return () => clearInterval(i);
  }, [hasActive, scale]);

  const act = (id: string, status: 'acknowledged' | 'resolved') =>
    updateDoc(doc(db, 'escalations', id), {
      status,
      acknowledgedByRole: role,
      acknowledgedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

  return (
    <div>
      <div className="mb-4 rounded-2xl border-4 border-amber-500 bg-amber-50 p-4">
        <p className="text-lg font-black text-amber-900">
          SIMULATED DISPATCH: nothing is sent to police, ambulance or any real number.
        </p>
        <p className="text-sm text-amber-900">
          This screen shows what an escalation chain would do. Only &quot;someone is hurt right
          now&quot; starts the emergency chain. A high-potential near miss with nobody hurt goes to
          the supervisor only. A real Twilio SMS/call notifier is a stub for later.
        </p>
        <label className="mt-2 block text-sm">
          Demo clock speed{' '}
          <select
            className="rounded border p-1"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            <option value={1}>real time (1 min = 1 min)</option>
            <option value={30}>30× (1 min ≈ 2 s)</option>
            <option value={60}>60× (1 min ≈ 1 s)</option>
          </select>
        </label>
      </div>

      {escs.rows.length === 0 && <p className="text-slate-500">No escalations yet.</p>}
      <ul className="grid gap-3">
        {escs.rows
          .filter((e) => e.status === 'active')
          .map((e) => (
            <li key={e.id} className="rounded-2xl bg-white p-4 shadow">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded px-2 py-1 text-sm font-black ${e.kind === 'emergency' ? 'bg-red-600 text-white' : 'bg-orange-200'}`}
                >
                  {e.kind === 'emergency' ? 'EMERGENCY (simulated)' : 'FAST-TRACK to supervisor'}
                </span>
                <b>{e.locationName}</b>
                <span>severity {e.severity}</span>
                <span className="text-sm text-slate-500">assembly point: {e.assemblyPoint}</span>
                <span className="ml-auto font-bold">{e.status}</span>
              </div>
              <ol className="mt-3 grid gap-1 text-sm">
                {e.chain.map((s) => (
                  <li
                    key={s.step}
                    className={`rounded p-2 ${s.state === 'notified' ? 'bg-green-100' : 'bg-slate-100'}`}
                  >
                    <b>T+{s.afterMinutes} min</b> · {s.label} ·{' '}
                    {s.state === 'notified'
                      ? `notified ${s.notifiedAt ? when(s.notifiedAt) : ''} (simulated)`
                      : e.status === 'active'
                        ? 'pending'
                        : 'not needed'}
                  </li>
                ))}
              </ol>
              {e.dispatchLog.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-semibold">
                    Dispatch log ({e.dispatchLog.length})
                  </summary>
                  <ul className="mt-1 list-disc pl-5">
                    {e.dispatchLog.map((l, i) => (
                      <li key={i}>
                        {when(l.at)}: {l.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {e.status === 'active' && (
                <div className="mt-3 flex gap-2">
                  <button
                    className="rounded bg-green-700 px-3 py-2 font-semibold text-white"
                    onClick={() => void act(e.id, 'acknowledged')}
                  >
                    Acknowledge (stops further escalation)
                  </button>
                  <button
                    className="rounded bg-slate-300 px-3 py-2 font-semibold"
                    onClick={() => void act(e.id, 'resolved')}
                  >
                    Resolve
                  </button>
                </div>
              )}
            </li>
          ))}
      </ul>
      <details className="mt-6">
        <summary className="cursor-pointer font-semibold">
          History ({escs.rows.filter((e) => e.status !== 'active').length} acknowledged or resolved)
        </summary>
        <ul className="mt-2 grid gap-1 text-sm">
          {escs.rows
            .filter((e) => e.status !== 'active')
            .slice(0, 30)
            .map((e) => (
              <li key={e.id} className="rounded bg-white p-2 shadow">
                {e.kind === 'emergency' ? 'EMERGENCY (simulated)' : 'Fast-track'} · {e.locationName}{' '}
                · severity {e.severity} · {e.status}
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
