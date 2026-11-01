import { shiftForHour, type HazardType } from '@shared/domain';
import { HAZARD_TYPES } from '@shared/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { HAZARD_ICONS } from '../lib/hazards';
import { compressImage } from '../lib/image';
import { newReportId, submitReport } from '../lib/submit';
import { useLocationInfo } from '../lib/useLocation';
import { useVoiceNote } from '../lib/voice';

type Shift = 'A' | 'B' | 'C';

export default function Report() {
  const { locationId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'hi' ? 'hi' : 'en';
  const nav = useNavigate();
  const loc = useLocationInfo(locationId);
  const voice = useVoiceNote(lang);
  const [hazard, setHazard] = useState<HazardType | null>(null);
  const [harm, setHarm] = useState(false);
  const [hurtNow, setHurtNow] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [shift, setShift] = useState<Shift>(shiftForHour(new Date().getHours()));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [started] = useState(() => Date.now());

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const blob = await compressImage(file);
    setPhoto(blob);
    setPhotoUrl(URL.createObjectURL(blob));
  }

  async function onSubmit() {
    if (!hazard || busy) return;
    setBusy(true);
    if (voice.recording) voice.stop();
    const id = newReportId();
    const transcript = voice.transcript;
    await submitReport({
      id,
      createdAtMs: started,
      fields: {
        locationId,
        hazardType: hazard,
        seriousHarmFlag: harm,
        injuryNow: hurtNow,
        transcript,
        transcriptStatus: voice.audio
          ? transcript
            ? 'transcribed'
            : 'not_transcribed'
          : 'no_audio',
        lang,
        shift,
        ...(name.trim() ? { reporterName: name.trim() } : {}),
      },
      ...(voice.audio ? { audio: voice.audio } : {}),
      ...(photo ? { photo } : {}),
    });
    nav(`/receipt/${id}`);
  }

  const locLabel = lang === 'hi' ? (loc?.nameHi ?? locationId) : (loc?.name ?? locationId);

  return (
    <Shell>
      <p className="text-sm text-slate-300">{t('report.where')}</p>
      <h1 className="mb-4 text-3xl font-extrabold">{locLabel}</h1>

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

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div>
          <button
            onClick={() => (voice.recording ? voice.stop() : void voice.start())}
            className={`min-h-20 w-full rounded-2xl border-4 p-3 text-base font-bold ${
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
        </div>
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-4 border-slate-700 bg-slate-800 p-3 text-center text-base font-bold">
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
      </div>
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

      <div className="mt-5">
        <p className="mb-2 text-sm text-slate-300">{t('report.shift')}</p>
        <div className="grid grid-cols-3 gap-2">
          {(['A', 'B', 'C'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setShift(s)}
              className={`rounded-xl py-3 text-lg font-bold ${shift === s ? 'bg-yellow-300 text-slate-950' : 'bg-slate-800'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

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
        disabled={!hazard || busy}
        onClick={() => void onSubmit()}
        className="mt-3 w-full rounded-2xl bg-yellow-300 py-5 text-xl font-extrabold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
      >
        {busy ? t('report.sending') : hazard ? t('report.submit') : t('report.pickHazard')}
      </button>
    </Shell>
  );
}
