import { Languages } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toggleLanguage } from '../i18n';

/** Frame for the worker and QR experiences: light, high contrast, large targets, one clear way back home. */
export function Shell({
  children,
  back,
  wide = false,
}: {
  children: ReactNode;
  back?: string;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div
          className={`mx-auto flex items-center justify-between gap-3 px-4 py-3 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
        >
          <Link to={back ?? '/'} className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
              Safer Work
            </span>
            <span className="block truncate text-base font-semibold">{t('app.plant')}</span>
          </Link>
          <button
            onClick={toggleLanguage}
            className="flex h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-base font-semibold hover:bg-sunken"
            aria-label="Change language"
          >
            <Languages size={18} /> {t('common.language')}
          </button>
        </div>
      </header>
      <main className={`mx-auto px-4 pb-12 pt-6 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        {children}
      </main>
    </div>
  );
}
