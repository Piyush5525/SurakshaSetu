import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Shell } from '@common/components/Shell';
import { db, ensureAnonymous } from '@common/lib/firebase';
import { myReports } from '@common/lib/submit';

interface Loc {
  id: string;
  name: string;
  nameHi: string;
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const [locs, setLocs] = useState<Loc[]>([]);
  useEffect(() => {
    ensureAnonymous()
      .then(() => getDocs(collection(db, 'locations')))
      .then((s) =>
        setLocs(
          s.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name),
            nameHi: String(d.data().nameHi ?? d.data().name),
          })),
        ),
      )
      .catch(() => undefined);
  }, []);
  const mine = myReports();
  const label = (l: Loc) => (i18n.language === 'hi' ? l.nameHi : l.name);

  return (
    <Shell>
      <h1 className="text-3xl font-extrabold">{t('home.title')}</h1>
      <p className="mb-4 mt-1 text-lg text-yellow-300">{t('app.tagline')}</p>
      <Link
        to="/report"
        className="mb-5 block rounded-2xl bg-yellow-300 py-5 text-center text-2xl font-extrabold text-slate-950"
      >
        {t('home.reportCta')}
      </Link>
      <p className="mb-2 text-sm text-slate-300">{t('home.scanHint')}</p>
      <div className="grid gap-3">
        {locs.map((l) => (
          <Link
            key={l.id}
            to={`/r/${l.id}`}
            className="rounded-2xl border-4 border-slate-700 bg-slate-800 p-4 text-xl font-bold"
          >
            {label(l)}
          </Link>
        ))}
      </div>
      <h2 className="mb-2 mt-8 text-sm text-slate-300">{t('home.recent')}</h2>
      {mine.length === 0 ? (
        <p className="text-slate-400">{t('home.none')}</p>
      ) : (
        <ul className="grid gap-2">
          {mine.map((m) => (
            <li key={m.id}>
              <Link to={`/receipt/${m.id}`} className="block rounded-xl bg-slate-800 p-3">
                {m.locationId} · {new Date(m.at).toLocaleDateString()}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/admin" className="mt-10 block text-center text-sm text-slate-400 underline">
        {t('home.staff')}
      </Link>
    </Shell>
  );
}
