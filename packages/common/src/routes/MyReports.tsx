import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from '../components/Shell';
import { api } from '../lib/api';
import { saveManualTrack, useMyReports, type Tracked } from '../lib/submit';
import { cx } from '../ui/primitives';

const STEPS = [
  'Received',
  'Sent to the safety team',
  'Seen by the team',
  'Assigned',
  'Being fixed',
  'Fixed',
];
// Plain-language progress shown to workers. Several internal statuses map onto five visible steps.
function progress(i: Tracked): number {
  const s = i.status;
  if (['resolved', 'closed'].includes(s)) return 5;
  if (s === 'in_progress') return 4;
  if (s === 'assigned') return 3;
  if (['acknowledged', 'escalated'].includes(s)) return 2;
  return 1;
}

function Card({ i }: { i: Tracked }) {
  const { t } = useTranslation();
  const p = progress(i);
  const labels = [
    t('w.track.s1'),
    t('w.track.s2'),
    t('w.track.s3'),
    t('w.track.s4'),
    t('w.track.s5'),
  ];
  const rejected = ['rejected', 'false_positive', 'duplicate'].includes(i.status);
  return (
    <li className="rounded-lg border border-line bg-surface p-5">
      <p className="font-mono text-sm text-muted">{i.id}</p>
      <p className="text-xl font-bold">{i.category_label}</p>
      <p className="text-sm text-muted">{new Date(i.created_at).toLocaleString()}</p>
      {rejected ? (
        <p className="mt-3 rounded-md bg-sunken p-3 text-lg font-semibold">{i.status_label}</p>
      ) : (
        <ol className="mt-4 grid gap-2">
          {labels.map((l, n) => (
            <li
              key={l}
              className={cx(
                'flex items-center gap-3 text-lg',
                n + 1 <= p ? 'font-semibold text-ink' : 'text-muted',
              )}
            >
              <span
                className={cx(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2',
                  n + 1 < p
                    ? 'border-ok bg-ok text-white'
                    : n + 1 === p
                      ? 'border-brand bg-brand text-white'
                      : 'border-line-strong',
                )}
              >
                {n + 1 < p || (n + 1 === p && p === 5) ? <Check size={16} /> : n + 1}
              </span>
              {l}
            </li>
          ))}
        </ol>
      )}
      {i.public_update && (
        <p className="mt-4 rounded-md border border-ok/30 bg-ok-soft p-3 text-lg">
          <span className="block text-sm font-semibold text-ok">{t('w.track.update')}</span>
          {i.public_update}
        </p>
      )}
    </li>
  );
}

/** Track my report: reports from this phone, plus a lookup by reference number and access code. */
export default function MyReports() {
  const { t } = useTranslation();
  const { items, waiting, refresh } = useMyReports(8000);
  const [ref, setRef] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const find = async () => {
    setMsg('');
    try {
      const r = await api<Tracked[]>('/public/track', {
        json: [{ id: ref.trim().toUpperCase(), code: code.trim() }],
        authed: false,
      });
      if (!r.length) return setMsg(t('w.track.notFound'));
      saveManualTrack(ref.trim().toUpperCase(), code.trim());
      setRef('');
      setCode('');
      refresh();
    } catch {
      setMsg(t('w.track.notFound'));
    }
  };
  return (
    <Shell>
      <h1 className="mb-5 text-3xl font-bold">{t('w.track.title')}</h1>
      {waiting.map((w) => (
        <div
          key={w.id}
          className="mb-3 rounded-lg border-2 border-warn bg-warn-soft p-4 text-lg font-semibold text-warn"
        >
          ⏳ {t('w.done.waiting')}
        </div>
      ))}
      {items.length === 0 && waiting.length === 0 && (
        <p className="mb-4 text-lg text-muted">{t('w.track.none')}</p>
      )}
      <ul className="grid gap-4">
        {items.map((i) => (
          <Card key={i.id} i={i} />
        ))}
      </ul>

      <section className="mt-8 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-xl font-bold">{t('w.track.enter')}</h2>
        <label className="mb-1 block text-base font-semibold" htmlFor="ref">
          {t('w.track.ref')}
        </label>
        <input
          id="ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="INC-20260101-AB3D"
          className="mb-3 h-14 w-full rounded-lg border-2 border-line-strong px-4 text-xl"
        />
        <label className="mb-1 block text-base font-semibold" htmlFor="code">
          {t('w.track.code')}
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mb-3 h-14 w-full rounded-lg border-2 border-line-strong px-4 font-mono text-xl"
        />
        <button
          disabled={!ref || !code}
          onClick={() => void find()}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-ink text-lg font-semibold text-white disabled:border-line-strong disabled:bg-line-strong"
        >
          <Search size={20} /> {t('w.track.find')}
        </button>
        {msg && (
          <p role="alert" className="mt-3 text-lg font-semibold text-crit">
            {msg}
          </p>
        )}
      </section>
      <span className="hidden">{STEPS.length}</span>
    </Shell>
  );
}
