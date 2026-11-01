import { Timestamp, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { db } from '@common/lib/firebase';
import { useCol, type ActionDoc, type LocationDoc } from './data';

const LEVELS = ['', 'eliminate', 'substitute', 'engineer', 'admin', 'ppe'];

function Row({ a, locName }: { a: ActionDoc & { id: string }; locName: string }) {
  const [fix, setFix] = useState(a.publicFixText);
  const [owner, setOwner] = useState(a.owner);
  const overdue = a.status !== 'closed' && a.dueDate < new Date();

  const save = (patch: Record<string, unknown>) =>
    updateDoc(doc(db, 'actions', a.id), { ...patch, updatedAt: serverTimestamp() });

  return (
    <li className="rounded-2xl bg-white p-3 shadow">
      <div className="flex flex-wrap items-center gap-3">
        <b>{a.title}</b>
        <span className="text-sm text-slate-500">{locName}</span>
        <span
          className={`ml-auto text-sm ${overdue ? 'font-bold text-red-700' : 'text-slate-500'}`}
        >
          due {a.dueDate.toLocaleDateString()} {overdue ? '(overdue)' : ''}
        </span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-4">
        <label className="text-sm">
          Status
          <select
            className="block w-full rounded border p-1"
            value={a.status}
            onChange={(e) =>
              void save({
                status: e.target.value,
                closedAt: e.target.value === 'closed' ? Timestamp.now() : null,
              })
            }
          >
            <option value="open">open</option>
            <option value="in_progress">in progress</option>
            <option value="closed">closed</option>
          </select>
        </label>
        <label className="text-sm">
          Owner (team)
          <input
            className="block w-full rounded border p-1"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            onBlur={() => owner !== a.owner && void save({ owner })}
          />
        </label>
        <label className="text-sm">
          Control level
          <select
            className="block w-full rounded border p-1"
            value={a.controlLevel ?? ''}
            onChange={(e) => void save({ controlLevel: e.target.value || null })}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l || '—'}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3 text-sm">
          <label>
            <input
              type="checkbox"
              checked={a.visibleFix}
              onChange={(e) => void save({ visibleFix: e.target.checked })}
            />{' '}
            visible fix
          </label>
          <label>
            <input
              type="checkbox"
              checked={a.featured}
              onChange={(e) => void save({ featured: e.target.checked })}
            />{' '}
            top fix
          </label>
        </div>
      </div>
      <label className="mt-2 block text-sm">
        What we changed (shown PUBLICLY on the board — no names, no private details)
        <input
          className="block w-full rounded border p-2"
          value={fix}
          onChange={(e) => setFix(e.target.value)}
          onBlur={() => fix !== a.publicFixText && void save({ publicFixText: fix })}
          placeholder="e.g. Added an interlocked guard on the filler infeed"
        />
      </label>
    </li>
  );
}

export default function ActionsTab() {
  const actions = useCol<ActionDoc>('actions', 'createdAt');
  const locations = useCol<LocationDoc>('locations');
  const [show, setShow] = useState<'active' | 'closed'>('active');
  const rows = actions.rows.filter((a) =>
    show === 'closed' ? a.status === 'closed' : a.status !== 'closed',
  );
  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(['active', 'closed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setShow(s)}
            className={`rounded px-3 py-1 ${show === s ? 'bg-slate-900 text-white' : 'bg-slate-200'}`}
          >
            {s} ({actions.rows.filter((a) => (s === 'closed') === (a.status === 'closed')).length})
          </button>
        ))}
      </div>
      <ul className="grid gap-2">
        {rows.map((a) => (
          <Row
            key={a.id}
            a={a}
            locName={locations.rows.find((l) => l.id === a.locationId)?.name ?? a.locationId}
          />
        ))}
      </ul>
    </div>
  );
}
