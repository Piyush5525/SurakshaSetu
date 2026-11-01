import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Shell } from '@common/components/Shell';
import { useMyReports } from '@common/lib/submit';

export default function Home() {
  const { t } = useTranslation();
  const { items, waiting } = useMyReports(15000);
  return (
    <Shell>
      <h1 className="text-3xl font-extrabold">{t('home.title')}</h1>
      <p className="mb-5 mt-1 text-lg text-yellow-300">{t('app.tagline')}</p>
      <Link
        to="/report"
        className="mb-4 block rounded-2xl bg-yellow-300 py-6 text-center text-2xl font-extrabold text-slate-950"
      >
        {t('home.reportCta')}
      </Link>
      <p className="mb-4 text-sm text-slate-300">{t('home.scanHint')}</p>

      <h2 className="mb-2 mt-6 text-sm text-slate-300">{t('home.recent')}</h2>
      {items.length === 0 && waiting.length === 0 ? (
        <p className="text-slate-400">{t('home.none')}</p>
      ) : (
        <ul className="grid gap-2">
          {waiting.length > 0 && (
            <li className="rounded-xl bg-amber-950 p-3 font-bold text-amber-100">
              ⏳ {waiting.length} {t('my.waiting')}
            </li>
          )}
          {items.slice(0, 4).map((i) => (
            <li key={i.id} className="rounded-xl bg-slate-800 p-3">
              <span className="text-sm text-slate-300">{i.id}</span>
              <span className="block font-bold">{i.category_label}</span>
              <span className="font-bold text-yellow-300">{i.status_label}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/my"
        className="mt-3 block text-center text-base font-bold text-yellow-300 underline"
      >
        {t('my.title')}
      </Link>
      <Link to="/admin" className="mt-10 block text-center text-sm text-slate-400 underline">
        {t('home.staff')}
      </Link>
    </Shell>
  );
}
