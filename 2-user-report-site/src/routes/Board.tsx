import { Languages } from 'lucide-react';
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

/** Public "You said, we did" board for a wall screen: large type, no login, no private data. */
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
  const place = (i: Item) => (i18n.language === 'hi' ? i.location_hi : i.location) ?? '';
  const top = items[0];
  return (
    <div className="min-h-screen bg-canvas p-8 text-ink">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-brand">SurakshaSetu</p>
          <h1 className="text-5xl font-bold">{t('board.title')}</h1>
          <p className="mt-1 text-xl text-ink-2">{t('board.sub')}</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/"
            className="flex h-12 items-center rounded-md border border-line-strong px-4 text-lg font-semibold hover:bg-sunken"
          >
            {t('app.name')}
          </Link>
          <button
            onClick={toggleLanguage}
            className="flex h-12 items-center gap-2 rounded-md border border-line-strong px-4 text-lg font-semibold hover:bg-sunken"
          >
            <Languages size={20} /> {t('common.language')}
          </button>
        </div>
      </header>
      {top && (
        <section className="mt-6 rounded-lg border-l-8 border-ok bg-ok-soft p-6">
          <p className="text-base font-bold uppercase tracking-wide text-ok">{t('board.topFix')}</p>
          <p className="mt-1 text-4xl font-bold">{top.fix_text}</p>
          <p className="mt-2 text-xl text-ink-2">{place(top)}</p>
        </section>
      )}
      {items.length === 0 ? (
        <p className="mt-10 text-2xl text-muted">{t('board.empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {items.slice(top ? 1 : 0).map((i) => (
            <li
              key={i.id}
              className="rounded-lg border border-line border-l-8 border-l-ok bg-surface p-5"
            >
              <p className="text-lg font-semibold text-ok">{place(i)}</p>
              <p className="mt-1 text-2xl font-bold">{i.fix_text}</p>
              <p className="mt-2 text-base text-muted">
                {t('board.fixedOn')}{' '}
                {i.resolved_at ? new Date(i.resolved_at).toLocaleDateString() : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-base text-muted">{t('board.note')}</p>
    </div>
  );
}
