import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Camera,
  CircleHelp,
  Cog,
  Droplets,
  Flame,
  Forklift,
  HeartPulse,
  ImagePlus,
  MapPin,
  Mic,
  PackageX,
  ShieldAlert,
  Square,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { compressImage } from '../lib/image';
import { newReportId, submitReport } from '../lib/submit';
import { useAssets, useQr } from '../lib/useLocation';
import { useVoiceNote } from '../lib/voice';
import { cx } from '../ui/primitives';

const CATS: { id: string; key: string; icon: ReactNode; backend: string }[] = [
  { id: 'fire', key: 'fire', icon: <Flame size={34} />, backend: 'fire_explosion' },
  { id: 'injury', key: 'injury', icon: <HeartPulse size={34} />, backend: 'worker_safety' },
  { id: 'violence', key: 'violence', icon: <ShieldAlert size={34} />, backend: 'security' },
  { id: 'machine', key: 'machine', icon: <Cog size={34} />, backend: 'machinery_accident' },
  { id: 'leak', key: 'leak', icon: <Droplets size={34} />, backend: 'chemical_spill' },
  { id: 'storage', key: 'storage', icon: <Boxes size={34} />, backend: 'storage_handling' },
  { id: 'forklift', key: 'forklift', icon: <Forklift size={34} />, backend: 'warehouse_accident' },
  { id: 'packaging', key: 'packaging', icon: <PackageX size={34} />, backend: 'logistics' },
  { id: 'waste', key: 'waste', icon: <Trash2 size={34} />, backend: 'waste_disposal' },
  { id: 'other', key: 'other', icon: <CircleHelp size={34} />, backend: 'other' },
];

const BIG =
  'flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 px-4 text-lg font-semibold';

/**
 * One guided report flow, two entry points:
 *  - QR sticker (/q/:token): the place is read from the sticker, so there are 3 steps.
 *  - Worker portal (/report): 5 steps including the place.
 * Both create the same kind of incident through the same endpoint.
 */
export default function Report() {
  const { token } = useParams();
  const qrMode = !!token;
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'hi' ? 'hi' : 'en';
  const nav = useNavigate();
  const qr = useQr(token);
  const assets = useAssets();
  const voice = useVoiceNote(lang);
  const steps = qrMode ? ['what', 'tell', 'review'] : ['what', 'where', 'tell', 'review'];
  const [step, setStep] = useState(0);
  const [cat, setCat] = useState('');
  const [assetId, setAssetId] = useState('');
  const [other, setOther] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [hurt, setHurt] = useState(false);
  const [harm, setHarm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const place = qrMode
    ? qr.state === 'ok'
      ? lang === 'hi'
        ? (qr.asset.name_hi ?? qr.asset.name)
        : qr.asset.name
      : ''
    : assetId === '__other'
      ? other
      : ((lang === 'hi' ? assets.find((a) => a.id === assetId)?.name_hi : undefined) ??
        assets.find((a) => a.id === assetId)?.name ??
        '');
  const where = (qrMode ? qr.state === 'ok' && qr.asset : assets.find((a) => a.id === assetId)) as
    { zone?: string } | false | undefined;
  const key = steps[step]!;
  const canNext =
    key === 'what'
      ? !!cat
      : key === 'where'
        ? !!assetId && (assetId !== '__other' || other.trim().length > 1)
        : true;

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    const b = await compressImage(f);
    setPhoto(b);
    setPhotoUrl(URL.createObjectURL(b));
  }
  function onVideo(f: File | undefined) {
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) return setErr(t('w.ev.big'));
    setErr('');
    setVideo(f);
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    if (voice.recording) voice.stop();
    const id = newReportId();
    const body = [text.trim(), voice.transcript, assetId === '__other' ? `Place: ${other}` : '']
      .filter(Boolean)
      .join(' — ');
    await submitReport({
      id,
      createdAtMs: Date.now(),
      assetName: place,
      fields: {
        source: qrMode ? 'qr' : 'portal',
        ...(qrMode ? { qrToken: token } : assetId && assetId !== '__other' ? { assetId } : {}),
        category: CATS.find((c) => c.id === cat)?.backend ?? 'other',
        description: body,
        seriousHarm: harm,
        injuryNow: hurt,
        lang,
      },
      ...(voice.audio ? { audio: voice.audio } : {}),
      ...(photo ? { photo } : {}),
      ...(video ? { video } : {}),
    });
    nav(`/receipt/${id}`);
  }

  if (qrMode && qr.state === 'loading')
    return (
      <Shell>
        <p className="mt-16 text-center text-xl">{t('common.loading')}</p>
      </Shell>
    );
  if (qrMode && qr.state === 'error' && !qr.offline)
    return (
      <Shell>
        <div
          role="alert"
          className="mt-8 rounded-lg border-2 border-warn bg-warn-soft p-6 text-xl font-semibold text-warn"
        >
          {qr.message}
        </div>
      </Shell>
    );

  return (
    <Shell>
      {qrMode && (
        <div className="mb-5 rounded-lg border-2 border-ink bg-ink p-4 text-white">
          <p className="text-sm text-white/70">{t('w.loc.at')}</p>
          <p className="text-2xl font-bold">{place || '…'}</p>
          {where && where.zone ? <p className="text-sm text-white/70">{where.zone}</p> : null}
          {qr.state === 'error' && (
            <p className="mt-1 text-sm text-warn-soft">{t('w.loc.qrOffline')}</p>
          )}
        </div>
      )}

      <div className="mb-5">
        <p className="mb-2 text-base font-semibold text-ink-2">
          {t('w.step', { n: step + 1, total: steps.length })}
        </p>
        <div className="flex gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s}
              className={cx('h-2 flex-1 rounded-full', i <= step ? 'bg-brand' : 'bg-line-strong')}
            />
          ))}
        </div>
      </div>
      <h1 className="mb-5 text-3xl font-bold leading-tight">{t(`w.steps.${key}`)}</h1>

      {key === 'what' && (
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('w.steps.what')}>
          {CATS.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={cat === c.id}
              onClick={() => setCat(c.id)}
              className={cx(
                'flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 p-3 text-center text-lg font-semibold transition-colors',
                cat === c.id
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line-strong bg-surface hover:bg-sunken',
                c.id === 'other' && 'col-span-2 min-h-24',
              )}
            >
              {c.icon}
              {t(`w.cats.${c.key}`)}
            </button>
          ))}
        </div>
      )}

      {key === 'where' && (
        <div className="grid gap-3">
          <label className="text-lg font-semibold" htmlFor="place">
            {t('w.loc.pick')}
          </label>
          <select
            id="place"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className="h-16 w-full rounded-lg border-2 border-line-strong bg-surface px-4 text-xl"
          >
            <option value="">—</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {lang === 'hi' ? (a.name_hi ?? a.name) : a.name}
                {a.zone ? ` · ${a.zone}` : ''}
              </option>
            ))}
            <option value="__other">{t('w.loc.unknown')}</option>
          </select>
          {assetId === '__other' && (
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder={t('w.loc.other')}
              aria-label={t('w.loc.other')}
              className="h-16 rounded-lg border-2 border-line-strong px-4 text-xl"
            />
          )}
          <p className="flex items-center gap-2 text-sm text-muted">
            <MapPin size={16} /> Demo Plant — Line 3
          </p>
        </div>
      )}

      {key === 'tell' && (
        <div className="grid gap-5">
          <div>
            <label htmlFor="what" className="mb-2 block text-lg font-semibold">
              {t('w.tell.label')}
            </label>
            <textarea
              id="what"
              rows={4}
              maxLength={600}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('w.tell.placeholder')}
              className="w-full rounded-lg border-2 border-line-strong p-4 text-xl"
            />
          </div>
          <button
            onClick={() => (voice.recording ? voice.stop() : void voice.start())}
            className={cx(
              BIG,
              voice.recording
                ? 'animate-pulse border-crit bg-crit text-white'
                : 'border-line-strong bg-surface',
            )}
          >
            {voice.recording ? <Square size={22} /> : <Mic size={22} />}
            {voice.recording
              ? t('w.tell.voiceStop')
              : voice.audio
                ? `${t('w.tell.voiceDone')} ✓`
                : t('w.tell.voice')}
          </button>
          {voice.error && <p className="text-base text-warn">{t('w.tell.voiceDenied')}</p>}
          {voice.recording && voice.transcript && (
            <p className="text-base text-ink-2">“{voice.transcript}”</p>
          )}

          <div>
            <h2 className="mb-2 text-lg font-semibold">{t('w.steps.evidence')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className={cx(BIG, 'cursor-pointer border-line-strong bg-surface')}>
                <Camera size={22} /> {t('w.ev.photo')}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => void onPhoto(e.target.files?.[0])}
                />
              </label>
              <label className={cx(BIG, 'cursor-pointer border-line-strong bg-surface')}>
                <ImagePlus size={22} /> {t('w.ev.upload')}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void onPhoto(e.target.files?.[0])}
                />
              </label>
              <label className={cx(BIG, 'cursor-pointer border-line-strong bg-surface')}>
                <Video size={22} /> {t('w.ev.video')}
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => onVideo(e.target.files?.[0])}
                />
              </label>
              <label className={cx(BIG, 'cursor-pointer border-line-strong bg-surface')}>
                <Video size={22} /> {t('w.ev.file')}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="sr-only"
                  onChange={(e) => onVideo(e.target.files?.[0])}
                />
              </label>
            </div>
            {err && (
              <p role="alert" className="mt-2 text-base text-crit">
                {err}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {photoUrl && (
                <div className="relative">
                  <img
                    src={photoUrl}
                    alt=""
                    className="h-24 rounded-md border border-line object-cover"
                  />
                  <button
                    aria-label={t('w.ev.remove')}
                    onClick={() => (setPhoto(null), setPhotoUrl(''))}
                    className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {video && (
                <span className="rounded-md bg-ok-soft px-3 py-2 text-base text-ok">
                  {video.name} · {t('w.ev.added')}{' '}
                  <button className="ml-2 underline" onClick={() => setVideo(null)}>
                    {t('w.ev.remove')}
                  </button>
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted">{t('w.ev.faces')}</p>
          </div>
        </div>
      )}

      {key === 'review' && (
        <div className="grid gap-4">
          <dl className="grid gap-3 rounded-lg border border-line bg-surface p-4 text-lg">
            <div>
              <dt className="text-sm text-muted">{t('w.review.type')}</dt>
              <dd className="font-semibold">{t(`w.cats.${cat}`)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('w.review.place')}</dt>
              <dd className="font-semibold">{place || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('w.review.details')}</dt>
              <dd>
                {[text.trim(), voice.transcript].filter(Boolean).join(' — ') || t('w.review.none')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('w.review.files')}</dt>
              <dd>
                {[photo && 'Photo', video && 'Video', voice.audio && 'Voice note']
                  .filter(Boolean)
                  .join(', ') || t('w.review.none')}
              </dd>
            </div>
          </dl>
          <label className="flex items-center gap-4 rounded-lg border-2 border-line-strong bg-surface p-4 text-lg font-semibold">
            <input
              type="checkbox"
              checked={harm}
              onChange={(e) => setHarm(e.target.checked)}
              className="h-7 w-7 accent-brand"
            />{' '}
            {t('w.review.harm')}
          </label>
          <label className="flex items-center gap-4 rounded-lg border-2 border-line-strong bg-surface p-4 text-lg font-semibold">
            <input
              type="checkbox"
              checked={hurt}
              onChange={(e) => setHurt(e.target.checked)}
              className="h-7 w-7 accent-brand"
            />{' '}
            {t('w.review.hurt')}
          </label>
          {hurt && (
            <p
              role="alert"
              className="rounded-lg border-2 border-crit bg-crit-soft p-4 text-lg font-semibold text-crit"
            >
              {t('w.review.hurtWarn')}
            </p>
          )}
          <p className="text-base text-muted">{t('w.review.anon')}</p>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className={cx(BIG, 'border-line-strong bg-surface px-6')}
          >
            <ArrowLeft size={20} /> {t('w.back')}
          </button>
        )}
        {key !== 'review' ? (
          <button
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
            className={cx(
              BIG,
              'flex-1 border-brand bg-brand text-white disabled:border-line-strong disabled:bg-line-strong disabled:text-muted',
            )}
          >
            {t('w.next')} <ArrowRight size={20} />
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => void send()}
            className={cx(BIG, 'flex-1 border-brand bg-brand text-white disabled:bg-line-strong')}
          >
            {busy ? t('w.sending') : t('w.send')}
          </button>
        )}
      </div>
    </Shell>
  );
}
