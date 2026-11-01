import { useTranslation } from 'react-i18next';
import { Shell } from '../components/Shell';
import { useMyReports } from '../lib/submit';

const STEPS = [
  'Received',
  'Sent to the safety team',
  'Seen by the team',
  'Assigned',
  'Being fixed',
  'Fixed',
];

/** The reporter's own reports (kept on this phone) with live status and updates from the team. */
export default function MyReports() {
  const { t } = useTranslation();
  const { items, waiting } = useMyReports(8000);
  return (
    <Shell>
      <h1 className="mb-4 text-3xl font-extrabold">{t('my.title')}</h1>
      {waiting.map((w) => (
        <div
          key={w.id}
          className="mb-3 rounded-2xl border-2 border-amber-400 bg-amber-950 p-4 font-bold text-amber-100"
        >
          ⏳ {t('my.waiting')}: {w.assetName || w.fields.assetId || ''}
        </div>
      ))}
      {items.length === 0 && waiting.length === 0 && (
        <p className="text-slate-400">{t('my.none')}</p>
      )}
      <ul className="grid gap-3">
        {items.map((i) => {
          const step = Math.max(0, STEPS.indexOf(i.status_label));
          return (
            <li key={i.id} className="rounded-2xl bg-slate-800 p-4">
              <p className="text-sm text-slate-300">
                {i.id} · {new Date(i.created_at).toLocaleString()}
              </p>
              <p className="text-lg font-bold">{i.category_label}</p>
              <p className="mt-1 text-base font-extrabold text-yellow-300">{i.status_label}</p>
              <div className="mt-2 flex gap-1" aria-hidden>
                {STEPS.map((s, n) => (
                  <span
                    key={s}
                    className={`h-2 flex-1 rounded ${n <= step ? 'bg-yellow-300' : 'bg-slate-600'}`}
                  />
                ))}
              </div>
              {i.public_update && (
                <p className="mt-3 rounded-xl bg-green-950 p-3 text-green-100">
                  <span className="block text-xs text-green-300">{t('my.update')}</span>
                  {i.public_update}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
