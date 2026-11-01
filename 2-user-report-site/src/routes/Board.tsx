import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toggleLanguage } from '@common/i18n';
import { api } from '@common/lib/api';

interface Item {
  id: string;
  category: string;
  fix_text: string;
  resolved_at: string | null;
  location: string | null;
  location_hi: string | null;
}

/** Public "You said, we did" board: readable from a distance, no login, no private data. */
export default function Board() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const load = () =>
      api<Item[]>('/public/board', { authed: false })
        .then(setItems)
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, []);
  const top = items[0];
  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-yellow-300">{t('board.title')}</h1>
          <p className="text-xl text-slate-300">{t('board.sub')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/" className="rounded-lg border border-slate-500 px-4 py-2 text-lg font-bold">
            {t('app.name')}
          </Link>
          <button
            onClick={toggleLanguage}
            className="rounded-lg bg-slate-700 px-4 py-2 text-lg font-bold"
          >
            {t('common.language')}
          </button>
        </div>
      </header>
      {top && (
        <section className="mt-6 rounded-3xl bg-green-800 p-6">
          <p className="text-lg font-bold uppercase tracking-wide text-green-200">
            {t('board.topFix')}
          </p>
          <p className="mt-1 text-4xl font-black">{top.fix_text}</p>
          <p className="mt-2 text-xl text-green-100">
            {(i18n.language === 'hi' ? top.location_hi : top.location) ?? ''}
          </p>
        </section>
      )}
      {items.length === 0 ? (
        <p className="mt-10 text-2xl text-slate-400">{t('board.empty')}</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {items.slice(top ? 1 : 0).map((i) => (
            <li key={i.id} className="rounded-2xl border-4 border-green-700 bg-slate-900 p-5">
              <p className="text-lg font-bold text-green-300">
                {(i18n.language === 'hi' ? i.location_hi : i.location) ?? ''}
              </p>
              <p className="mt-1 text-2xl font-extrabold">{i.fix_text}</p>
              <p className="mt-2 text-base text-slate-300">
                {t('board.fixedOn')}{' '}
                {i.resolved_at ? new Date(i.resolved_at).toLocaleDateString() : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-base text-slate-400">{t('board.note')}</p>
    </div>
  );
}
