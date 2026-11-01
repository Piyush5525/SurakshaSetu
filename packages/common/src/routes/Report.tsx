import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { HAZARD_ICONS, HAZARD_TYPES, type HazardType } from '../lib/hazards';
import { compressImage } from '../lib/image';
import { newReportId, submitReport } from '../lib/submit';
import { useAssets, useCategories, useQr } from '../lib/useLocation';
import { useVoiceNote } from '../lib/voice';

/**
 * One report form, two entry points:
 *  - QR sticker  (/q/:token)  -> machine is resolved from the sticker, nothing to pick
 *  - Worker portal (/report)  -> pick the machine / area from a list
 * Both send to the same endpoint and become the same kind of incident.
 */
export default function Report() {
  const { token } = useParams();
  const qr = useQr(token);
  const manual = !token;
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'hi' ? 'hi' : 'en';
  const nav = useNavigate();
  const assets = useAssets();
  const categories = useCategories();
  const voice = useVoiceNote(lang);
  const [picked, setPicked] = useState('');
  const [hazard, setHazard] = useState<HazardType | null>(null);
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [harm, setHarm] = useState(false);
  const [hurtNow, setHurtNow] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const blob = await compressImage(file);
    setPhoto(blob);
    setPhotoUrl(URL.createObjectURL(blob));
  }

  function onVideo(file: File | undefined) {
    if (!file) return;
    if (file.size > 60 * 1024 * 1024)
      return setErr('Video is larger than 60 MB. Please choose a shorter clip.');
    setErr('');
    setVideo(file);
  }

  const qrOk = !manual && (qr.state === 'ok' || (qr.state === 'error' && qr.offline));
  const asset = qr.state === 'ok' ? qr.asset : assets.find((a) => a.id === picked);
  const machine = asset ? (lang === 'hi' ? (asset.name_hi ?? asset.name) : asset.name) : '';
  const ready = (manual ? !!picked : qrOk) && (!!hazard || !!category);

  async function onSubmit() {
    if (!ready || busy) return;
    setBusy(true);
    if (voice.recording) voice.stop();
    const id = newReportId();
    const text = [details.trim(), voice.transcript].filter(Boolean).join(' — ');
    await submitReport({
      id,
      createdAtMs: Date.now(),
      assetName: machine,
      fields: {
        source: manual ? 'portal' : 'qr',
        ...(manual ? { assetId: picked } : { qrToken: token }),
        ...(category ? { category } : {}),
        ...(hazard ? { hazardType: hazard } : {}),
        description: text,
        seriousHarm: harm,
        injuryNow: hurtNow,
        lang,
        ...(name.trim() ? { reporterName: name.trim() } : {}),
      },
      ...(voice.audio ? { audio: voice.audio } : {}),
      ...(photo ? { photo } : {}),
      ...(video ? { video } : {}),
    });
    nav(`/receipt/${id}`);
  }

  if (!manual && qr.state === 'loading') {
    return (
      <Shell>
        <p className="mt-10 text-center text-lg">{t('common.loading')}</p>
      </Shell>
    );
  }
  if (!manual && qr.state === 'error' && !qr.offline) {
    return (
      <Shell>
        <div className="mt-6 rounded-2xl border-2 border-amber-400 bg-amber-950 p-5 text-lg font-bold text-amber-100">
          {qr.message}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-slate-300">{t('report.where')}</p>
      {manual ? (
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          aria-label={t('report.pickMachine')}
          className="mb-4 w-full rounded-2xl border-4 border-slate-700 bg-slate-800 p-4 text-xl font-bold"
        >
          <option value="">{t('report.pickMachine')}</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {lang === 'hi' ? (a.name_hi ?? a.name) : a.name}
            </option>
          ))}
        </select>
      ) : (
        <>
          <h1 className="mb-1 text-3xl font-extrabold">{machine || '…'}</h1>
          {qr.state === 'error' && (
            <p className="mb-3 text-sm text-amber-300">{t('report.offlineMachine')}</p>
          )}
          <div className="mb-3" />
        </>
      )}

      <h2 className="mb-2 text-lg font-bold">{t('report.whatSaw')}</h2>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('report.whatSaw')}>
        {HAZARD_TYPES.map((h) => (
          <button
            key={h}
            role="radio"
            aria-checked={hazard === h}
            onClick={() => setHazard(h)}
            className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-4 p-3 text-center text-base font-bold ${
              hazard === h
                ? `${HAZARD_ICONS[h].ring} bg-yellow-300 text-slate-950`
                : 'border-slate-700 bg-slate-800'
            } ${h === 'other' ? 'col-span-2' : ''}`}
          >
            <span className="text-4xl" aria-hidden>
              {HAZARD_ICONS[h].icon}
            </span>
            {t(`hazards.${h}`)}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-sm text-slate-300">
        {t('report.category')}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full rounded-xl border-2 border-slate-700 bg-slate-800 p-3 text-base font-semibold text-white"
        >
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {t(`cat.${c.id}`, c.label)}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-5 block text-base font-bold">
        {t('report.details')}
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 600))}
          rows={3}
          placeholder={t('report.detailsHint')}
          className="mt-2 w-full rounded-2xl border-4 border-slate-700 bg-slate-800 p-3 text-base font-normal"
        />
      </label>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button
          onClick={() => (voice.recording ? voice.stop() : void voice.start())}
          className={`min-h-20 rounded-2xl border-4 p-2 text-sm font-bold ${
            voice.recording
              ? 'animate-pulse border-red-500 bg-red-700'
              : 'border-slate-700 bg-slate-800'
          }`}
        >
          <span className="block text-3xl" aria-hidden>
            🎙️
          </span>
          {voice.recording
            ? t('report.voiceStop')
            : voice.audio
              ? t('report.voiceRedo')
              : t('report.voiceStart')}
        </button>
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-4 border-slate-700 bg-slate-800 p-2 text-center text-sm font-bold">
          <span className="text-3xl" aria-hidden>
            📷
          </span>
          {photo ? t('report.photoRetake') : t('report.photoAdd')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void onPhoto(e.target.files?.[0])}
          />
        </label>
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-4 border-slate-700 bg-slate-800 p-2 text-center text-sm font-bold">
          <span className="text-3xl" aria-hidden>
            🎥
          </span>
          {video ? t('report.videoAttached') : t('report.videoAdd')}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="sr-only"
            onChange={(e) => onVideo(e.target.files?.[0])}
          />
        </label>
      </div>
      {err && <p className="mt-2 text-sm text-amber-300">{err}</p>}
      {voice.error && <p className="mt-2 text-sm text-amber-300">{t('report.micDenied')}</p>}
      {voice.audio && !voice.recording && (
        <p className="mt-2 text-sm text-green-300">
          ✓ {t('report.voiceRecorded')} ·{' '}
          {voice.transcript
            ? `${t('report.transcribed')}: "${voice.transcript}"`
            : t('report.notTranscribed')}
        </p>
      )}
      {voice.recording && voice.transcript && (
        <p className="mt-2 text-sm text-slate-300">“{voice.transcript}”</p>
      )}
      {photoUrl && (
        <div className="mt-3">
          <img src={photoUrl} alt="" className="max-h-40 rounded-xl" />
          <p className="mt-1 text-sm text-amber-300">{t('report.photoFaces')}</p>
        </div>
      )}

      <label className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-800 p-4 text-base font-bold">
        <input
          type="checkbox"
          checked={harm}
          onChange={(e) => setHarm(e.target.checked)}
          className="h-7 w-7 accent-yellow-300"
        />
        {t('report.hurtBadly')}
      </label>
      <label className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-800 p-4 text-base font-bold">
        <input
          type="checkbox"
          checked={hurtNow}
          onChange={(e) => setHurtNow(e.target.checked)}
          className="h-7 w-7 accent-red-500"
        />
        {t('report.hurtNow')}
      </label>
      {hurtNow && (
        <p className="mt-2 rounded-xl border-2 border-red-500 bg-red-950 p-3 text-base font-bold text-red-100">
          {t('report.hurtNowWarn')}
        </p>
      )}

      <details className="mt-4 rounded-2xl bg-slate-900 p-3">
        <summary className="cursor-pointer text-sm text-slate-300">{t('report.name')}</summary>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-base"
        />
        <p className="mt-1 text-xs text-slate-400">{t('report.namePrivacy')}</p>
      </details>

      <p className="mt-4 text-center text-sm text-slate-300">{t('report.anonymous')}</p>
      <button
        disabled={!ready || busy}
        onClick={() => void onSubmit()}
        className="mt-3 w-full rounded-2xl bg-yellow-300 py-5 text-xl font-extrabold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
      >
        {busy
          ? t('report.sending')
          : manual && !picked
            ? t('report.pickMachine')
            : ready
              ? t('report.submit')
              : t('report.pickHazard')}
      </button>
    </Shell>
  );
}
