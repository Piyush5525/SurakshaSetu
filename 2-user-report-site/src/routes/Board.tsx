import type { BoardItem } from '@shared/board';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '@common/lib/firebase';
import { HAZARD_ICONS } from '@common/lib/hazards';
import { toggleLanguage } from '@common/i18n';
import { myReports } from '@common/lib/submit';

const COLS = [
  { key: 'received', tone: 'border-slate-400', head: 'bg-slate-700' },
  { key: 'being_fixed', tone: 'border-amber-400', head: 'bg-amber-600' },
  { key: 'fixed', tone: 'border-green-400', head: 'bg-green-700' },
] as const;

/** Public "You said, we did" board. Reads only the sanitised boardItems collection; no login. */
export default function Board() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const [items, setItems] = useState<BoardItem[]>([]);
  const mine = useMemo(
    () => new Set([...myReports().map((m) => m.id), params.get('mine') ?? '']),
    [params],
  );

  useEffect(() => {
    const q = query(collection(db, 'boardItems'), orderBy('day', 'desc'), limit(90));
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => d.data() as BoardItem)));
  }, []);

  const hi = i18n.language === 'hi';
  const label = (i: BoardItem) => (hi ? i.locationLabelHi : i.locationLabel);
  const fixed = items.filter((i) => i.status === 'fixed');
  const inProgress = items.filter((i) => i.status === 'being_fixed');
  const top = fixed.find((i) => i.featured && i.fixText) ?? fixed.find((i) => i.fixText) ?? null;

  return (
    <div className="min-h-screen bg-slate-950 p-5 text-white lg:p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-yellow-300 lg:text-7xl">{t('board.title')}</h1>
          <p className="mt-2 text-xl text-slate-300 lg:text-3xl">{t('board.sub')}</p>
        </div>
        <div className="flex items-center gap-6 text-center">
          <Stat n={fixed.length} label={t('board.fixedCount')} tone="text-green-400" />
          <Stat n={inProgress.length} label={t('board.inProgressCount')} tone="text-amber-400" />
          <button
            onClick={toggleLanguage}
            className="rounded-xl bg-slate-700 px-4 py-3 text-lg font-bold"
          >
            {t('common.language')}
          </button>
          <Link to="/" className="rounded-xl border border-slate-500 px-4 py-3 text-lg">
            ←
          </Link>
        </div>
      </header>

      {top && (
        <section className="mb-8 rounded-3xl border-4 border-yellow-300 bg-yellow-300/10 p-6 lg:p-8">
          <p className="text-xl font-bold uppercase tracking-wide text-yellow-300 lg:text-2xl">
            ★ {t('board.topFix')}
          </p>
          <p className="mt-2 text-3xl font-black lg:text-5xl">
            {HAZARD_ICONS[top.hazardIcon].icon} {label(top)} — {t(`hazards.${top.hazardIcon}`)}
          </p>
          <p className="mt-3 text-2xl text-green-300 lg:text-4xl">
            {t('board.changed')}: {top.fixText}
          </p>
        </section>
      )}

      {items.length === 0 ? (
        <p className="mt-20 text-center text-3xl text-slate-400">{t('board.empty')}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {COLS.map((c) => (
            <section key={c.key} className={`rounded-3xl border-4 ${c.tone} bg-slate-900`}>
              <h2 className={`rounded-t-2xl px-5 py-3 text-3xl font-black lg:text-4xl ${c.head}`}>
                {t(`board.${c.key}`)} ({items.filter((i) => i.status === c.key).length})
              </h2>
              <ul className="grid gap-4 p-4">
                {items
                  .filter((i) => i.status === c.key)
                  .slice(0, 8)
                  .map((i) => (
                    <li
                      key={i.id}
                      className={`rounded-2xl bg-slate-800 p-4 ${mine.has(i.id) ? 'ring-4 ring-yellow-300' : ''}`}
                    >
                      <p className="text-2xl font-extrabold lg:text-3xl">
                        <span aria-hidden>{HAZARD_ICONS[i.hazardIcon].icon}</span> {label(i)}
                      </p>
                      <p className="text-lg text-slate-300 lg:text-2xl">
                        {t(`hazards.${i.hazardIcon}`)}
                      </p>
                      {i.fixText && (
                        <p className="mt-2 text-xl font-bold text-green-300 lg:text-3xl">
                          ✔ {i.fixText}
                        </p>
                      )}
                      <p className="mt-2 text-base text-slate-400 lg:text-xl">
                        {t('board.day')} {i.day} · {t('board.shift')} {i.shift}
                        {i.fixedDay ? ` · ${t('board.fixedOn')} ${i.fixedDay}` : ''}
                      </p>
                      {mine.has(i.id) && (
                        <p className="mt-1 font-bold text-yellow-300">★ {t('board.mine')}</p>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-8 text-center text-lg text-slate-400">{t('board.note')}</p>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div>
      <p className={`text-5xl font-black lg:text-7xl ${tone}`}>{n}</p>
      <p className="text-lg text-slate-300 lg:text-2xl">{label}</p>
    </div>
  );
}
