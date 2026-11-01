import { Phone, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { api } from '../lib/api';

/** Emergency guidance. It does not place calls itself: a phone link appears only if the plant configured a number. */
export default function Help() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<{ contact: string; assembly_point: string } | null>(null);
  useEffect(() => {
    api<{ contact: string; assembly_point: string }>('/public/help', { authed: false })
      .then(setInfo)
      .catch(() => undefined);
  }, []);
  const tel = info?.contact.replace(/[^\d+]/g, '');
  return (
    <Shell>
      <div className="rounded-lg border-2 border-crit bg-crit-soft p-5">
        <div className="flex items-center gap-3 text-crit">
          <ShieldAlert size={36} />
          <h1 className="text-3xl font-bold leading-tight">{t('w.help.title')}</h1>
        </div>
        <p className="mt-3 text-xl font-semibold">{t('w.help.lead')}</p>
      </div>
      <ol className="mt-5 grid gap-3">
        {['n1', 'n2', 'n3', 'n4'].map((k, i) => (
          <li key={k} className="flex gap-4 rounded-lg border border-line bg-surface p-4 text-xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-lg font-bold text-white">
              {i + 1}
            </span>
            {t(`w.help.${k}`)}
          </li>
        ))}
      </ol>
      {info?.assembly_point && (
        <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-lg">
          <b>Assembly point:</b> {info.assembly_point}
        </p>
      )}
      {tel && (
        <a
          href={`tel:${tel}`}
          className="mt-4 flex min-h-16 items-center justify-center gap-3 rounded-lg border-2 border-crit bg-crit text-xl font-bold text-white"
        >
          <Phone size={24} /> Site emergency number: {info?.contact}
        </a>
      )}
      <p className="mt-4 text-lg font-semibold">{t('w.help.india')}</p>
      <p className="mt-2 rounded-lg bg-sunken p-4 text-base text-ink-2">{t('w.help.notice')}</p>
      <p className="mt-6 text-lg">{t('w.help.after')}</p>
      <Link
        to="/report"
        className="mt-2 flex min-h-14 items-center justify-center rounded-lg border-2 border-brand bg-brand text-lg font-semibold text-white"
      >
        {t('w.help.reportAfter')}
      </Link>
    </Shell>
  );
}
