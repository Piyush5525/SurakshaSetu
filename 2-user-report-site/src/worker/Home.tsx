import { ClipboardList, LifeBuoy, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Shell } from '@common/components/Shell';
import { useMyReports } from '@common/lib/submit';

/** Worker portal landing: one headline, three large actions, nothing else competing for attention. */
export default function Home() {
  const { t } = useTranslation();
  const { items, waiting } = useMyReports(15000);
  const open = items.filter((i) => !['resolved', 'closed'].includes(i.status)).length;
  const actions = [
    {
      to: '/report',
      icon: <Megaphone size={40} />,
      title: t('w.home.report'),
      hint: t('w.home.reportHint'),
      cls: 'border-brand bg-brand text-white',
      hintCls: 'text-white/85',
    },
    {
      to: '/track',
      icon: <ClipboardList size={40} />,
      title: t('w.home.track'),
      hint: open || waiting.length ? `${open + waiting.length} open` : t('w.home.trackHint'),
      cls: 'border-ink bg-surface text-ink',
      hintCls: 'text-muted',
    },
    {
      to: '/help',
      icon: <LifeBuoy size={40} />,
      title: t('w.home.help'),
      hint: t('w.home.helpHint'),
      cls: 'border-crit bg-crit-soft text-crit',
      hintCls: 'text-crit/80',
    },
  ];
  return (
    <Shell>
      <h1 className="text-4xl font-bold leading-tight">{t('w.home.headline')}</h1>
      <p className="mb-8 mt-3 text-xl text-ink-2">{t('w.home.sub')}</p>
      <div className="grid gap-4">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className={`flex min-h-32 items-center gap-5 rounded-lg border-2 p-6 ${a.cls}`}
          >
            {a.icon}
            <span>
              <span className="block text-2xl font-bold">{a.title}</span>
              <span className={`block text-lg ${a.hintCls}`}>{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-10 flex flex-wrap justify-between gap-3 text-base text-muted">
        <Link to="/board" className="underline">
          {t('common.board')}
        </Link>
        <Link to="/admin" className="underline">
          {t('home.staff')}
        </Link>
      </p>
    </Shell>
  );
}
