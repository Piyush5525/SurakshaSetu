import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toggleLanguage } from '../i18n';

/** Common frame for worker pages: high contrast, big targets, language toggle. */
export function Shell({ children, back }: { children: ReactNode; back?: string }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-4 py-3">
        <div className="min-w-0">
          <Link to={back ?? '/'} className="block truncate text-lg font-extrabold text-yellow-300">
            {t('app.name')}
          </Link>
          <p className="truncate text-xs text-slate-300">{t('app.plant')}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/board"
            className="rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold"
          >
            {t('common.board')}
          </Link>
          <button
            onClick={toggleLanguage}
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold"
          >
            {t('common.language')}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-10 pt-4">{children}</main>
    </div>
  );
}
