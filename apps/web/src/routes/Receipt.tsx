import { isoWeekKey, shiftForHour } from '@shared/domain';
import { receiptCode } from '@shared/receipt';
import { Timestamp, addDoc, collection } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { db, ensureAnonymous } from '../lib/firebase';
import { queue, type QueuedReport } from '../lib/queue';
import { flushQueue } from '../lib/submit';

export default function Receipt() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [rec, setRec] = useState<QueuedReport | null>(null);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    const load = () => void queue.get(id).then((r) => setRec(r ?? null));
    load();
    window.addEventListener('sw-queue-changed', load);
    void flushQueue();
    return () => window.removeEventListener('sw-queue-changed', load);
  }, [id]);

  async function sendPulse(s: number) {
    setScore(s);
    try {
      await ensureAnonymous();
      const now = new Date();
      await addDoc(collection(db, 'feedback'), {
        score: s,
        locationId: rec?.fields.locationId ?? 'unknown',
        shift: rec?.fields.shift ?? shiftForHour(now.getHours()),
        weekKey: isoWeekKey(now),
        createdAt: Timestamp.fromDate(now),
      });
    } catch {
      /* feedback is optional; ignore failures */
    }
  }

  const sent = rec?.state === 'sent';
  return (
    <Shell>
      <div className="rounded-3xl bg-green-900 p-5 text-center">
        <p className="text-5xl" aria-hidden>
          ✅
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">{t('receipt.thanks')}</h1>
        <p className="mt-4 text-sm text-green-200">{t('receipt.code')}</p>
        <p className="text-4xl font-black tracking-widest">{receiptCode(id)}</p>
        <p className={`mt-3 text-base font-bold ${sent ? 'text-green-200' : 'text-amber-300'}`}>
          {sent ? `✓ ${t('receipt.sent')}` : `⏳ ${t('receipt.waiting')}`}
        </p>
        <p className="mt-2 text-sm text-green-100">{t('receipt.reviewHint')}</p>
      </div>

      <div className="mt-5 rounded-2xl bg-slate-800 p-4">
        <p className="mb-3 text-base font-bold">{t('receipt.pulseQ')}</p>
        {score === null ? (
          <div className="grid grid-cols-5 gap-2">
            {['😟', '😕', '😐', '🙂', '😀'].map((e, i) => (
              <button
                key={e}
                onClick={() => void sendPulse(i + 1)}
                className="rounded-xl bg-slate-700 py-3 text-3xl"
                aria-label={`${i + 1}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-green-300">{t('receipt.pulseThanks')}</p>
        )}
      </div>

      <Link
        to={`/board?mine=${id}`}
        className="mt-5 block rounded-2xl bg-yellow-300 py-4 text-center text-lg font-extrabold text-slate-950"
      >
        {t('receipt.watch')}
      </Link>
      <Link
        to={rec ? `/r/${rec.fields.locationId}` : '/'}
        className="mt-3 block rounded-2xl border-2 border-slate-500 py-4 text-center text-lg font-bold"
      >
        {t('receipt.another')}
      </Link>
    </Shell>
  );
}
