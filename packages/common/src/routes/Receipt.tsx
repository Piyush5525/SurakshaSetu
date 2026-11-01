import { CheckCircle2, Clock, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { queue, type QueuedReport } from '../lib/queue';
import { flushQueue, useMyReports } from '../lib/submit';
import { cx } from '../ui/primitives';

/** Confirmation: reference number, access code, what happens next. Works while the report is still waiting to send. */
export default function Receipt() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [rec, setRec] = useState<QueuedReport | null>(null);
  const [copied, setCopied] = useState(false);
  const { items } = useMyReports(5000);

  useEffect(() => {
    const load = () => void queue.get(id).then((r) => setRec(r ?? null));
    load();
    window.addEventListener('sw-queue-changed', load);
    void flushQueue();
    return () => window.removeEventListener('sw-queue-changed', load);
  }, [id]);

  const sent = rec?.state === 'sent';
  const tracked = items.find((i) => i.id === rec?.serverId);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(`${rec?.serverId} ${rec?.trackingCode}`)
      .then(() => setCopied(true));
  };
  return (
    <Shell>
      <div
        className={cx(
          'rounded-lg border-2 p-6 text-center',
          sent ? 'border-ok bg-ok-soft' : 'border-warn bg-warn-soft',
        )}
      >
        {sent ? (
          <CheckCircle2 size={56} className="mx-auto text-ok" />
        ) : (
          <Clock size={56} className="mx-auto text-warn" />
        )}
        <h1 className="mt-3 text-3xl font-bold leading-tight">
          {sent ? t('w.done.title') : t('w.done.waiting')}
        </h1>
        {sent && (
          <>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-2">
              {t('w.done.ref')}
            </p>
            <p className="break-all text-3xl font-bold tracking-wide" data-testid="ref">
              {rec?.serverId}
            </p>
            <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-ink-2">
              {t('w.done.code')}
            </p>
            <p className="break-all font-mono text-xl font-semibold" data-testid="code">
              {rec?.trackingCode}
            </p>
            <button
              onClick={copy}
              className="mx-auto mt-3 flex min-h-12 items-center gap-2 rounded-lg border-2 border-line-strong bg-surface px-4 text-lg font-semibold"
            >
              <Copy size={18} /> {copied ? '✓' : ''} Copy
            </button>
            <p className="mt-2 text-base text-ink-2">{t('w.done.codeHint')}</p>
            {tracked && (
              <p className="mt-4 rounded-md bg-surface p-3 text-lg font-semibold">
                {tracked.status_label}
              </p>
            )}
          </>
        )}
        {!sent && (
          <p data-testid="ref" className="mt-2 text-lg">
            …
          </p>
        )}
        {rec?.lastError && !sent && <p className="mt-2 text-sm text-ink-2">{rec.lastError}</p>}
      </div>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-xl font-bold">{t('w.done.next')}</h2>
        <ol className="mt-3 grid gap-3 text-lg">
          {['next1', 'next2', 'next3'].map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-base font-bold text-white">
                {i + 1}
              </span>
              {t(`w.done.${k}`)}
            </li>
          ))}
        </ol>
      </section>

      <Link
        to="/track"
        className="mt-6 flex min-h-14 items-center justify-center rounded-lg border-2 border-brand bg-brand text-lg font-semibold text-white"
      >
        {t('w.done.track')}
      </Link>
      <Link
        to={rec?.fields.source === 'qr' ? `/q/${rec.fields.qrToken}` : '/report'}
        className="mt-3 flex min-h-14 items-center justify-center rounded-lg border-2 border-line-strong bg-surface text-lg font-semibold"
      >
        {t('w.done.another')}
      </Link>
    </Shell>
  );
}
