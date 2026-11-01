import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { queue, type QueuedReport } from '../lib/queue';
import { flushQueue, useMyReports } from '../lib/submit';

export default function Receipt() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [rec, setRec] = useState<QueuedReport | null>(null);
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
  return (
    <Shell>
      <div className="rounded-3xl bg-green-900 p-5 text-center">
        <p className="text-5xl" aria-hidden>
          ✅
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">{t('receipt.thanks')}</h1>
        <p className="mt-4 text-sm text-green-200">{t('receipt.ref')}</p>
        <p className="break-all text-3xl font-black tracking-wider" data-testid="ref">
          {rec?.serverId ?? '…'}
        </p>
        <p className={`mt-3 text-base font-bold ${sent ? 'text-green-200' : 'text-amber-300'}`}>
          {sent ? `✓ ${t('receipt.sent')}` : `⏳ ${t('receipt.waiting')}`}
        </p>
        {rec?.lastError && !sent && <p className="mt-1 text-xs text-amber-200">{rec.lastError}</p>}
        {tracked && (
          <p className="mt-2 rounded-xl bg-green-950 p-2 text-base font-bold text-white">
            {tracked.status_label}
          </p>
        )}
        <p className="mt-2 text-sm text-green-100">{t('receipt.reviewHint')}</p>
      </div>

      <Link
        to="/my"
        className="mt-5 block rounded-2xl bg-yellow-300 py-4 text-center text-lg font-extrabold text-slate-950"
      >
        {t('my.title')}
      </Link>
      <Link
        to={rec?.fields.source === 'qr' ? `/q/${rec.fields.qrToken}` : '/report'}
        className="mt-3 block rounded-2xl border-2 border-slate-500 py-4 text-center text-lg font-bold"
      >
        {t('receipt.another')}
      </Link>
    </Shell>
  );
}
