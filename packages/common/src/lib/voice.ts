import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceNote {
  recording: boolean;
  audio: Blob | null;
  transcript: string;
  /** Transcription needs browser support AND a connection. Audio is always stored either way. */
  canTranscribe: boolean;
  error: boolean;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/** Records audio with MediaRecorder (always kept) and, when possible, transcribes with the Web Speech API. */
export function useVoiceNote(lang: 'en' | 'hi'): VoiceNote {
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const sr = useRef<RecognitionLike | null>(null);
  const chunks = useRef<Blob[]>([]);
  const finalText = useRef('');

  const canTranscribe = recognitionCtor() !== null && navigator.onLine;

  const start = useCallback(async () => {
    setError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudio(new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }));
      };
      mr.start();
      rec.current = mr;
      finalText.current = '';
      setTranscript('');
      const Ctor = recognitionCtor();
      if (Ctor && navigator.onLine) {
        const r = new Ctor();
        r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
        r.continuous = true;
        r.interimResults = true;
        r.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i]!;
            const text = res[0].transcript;
            if (res.isFinal) finalText.current += text + ' ';
            else interim += text;
          }
          setTranscript((finalText.current + interim).trim());
        };
        r.onerror = () => undefined; // audio is still saved
        r.onend = () => undefined;
        r.start();
        sr.current = r;
      }
      setRecording(true);
    } catch {
      setError(true);
    }
  }, [lang]);

  const stop = useCallback(() => {
    sr.current?.stop();
    if (rec.current?.state === 'recording') rec.current.stop();
    setRecording(false);
  }, []);

  const reset = useCallback(() => {
    setAudio(null);
    setTranscript('');
    finalText.current = '';
  }, []);

  useEffect(
    () => () => {
      sr.current?.stop();
      if (rec.current?.state === 'recording') rec.current.stop();
    },
    [],
  );

  return { recording, audio, transcript, canTranscribe, error, start, stop, reset };
}
