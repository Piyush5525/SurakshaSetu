import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, wsUrl } from '@common/lib/api';

export interface Incident {
  id: string;
  category: string;
  description: string;
  source: 'qr' | 'portal' | 'cctv' | 'audio' | 'admin';
  asset_id: string | null;
  camera_id: string | null;
  audio_id: string | null;
  site: string | null;
  building: string | null;
  zone: string | null;
  created_at: string;
  updated_at: string;
  severity: number;
  severity_reasons: string[];
  ai_model: string | null;
  ai_class: string | null;
  ai_confidence: number | null;
  ai_meta: Record<string, unknown> | null;
  requires_verification: number;
  simulated: number;
  department: string | null;
  assigned_responder_id: number | null;
  status: string;
  injury_now: number;
  serious_harm: number;
  eco_tag: string | null;
  investigation_notes: string;
  root_cause: string;
  corrective_action: string;
  preventive_action: string;
  public_update: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

interface Live {
  tick: number; // bumps on every server event: use as a refetch key
  last: { type: string; incident?: Incident } | null;
  connected: boolean;
}
const Ctx = createContext<Live>({ tick: 0, last: null, connected: false });
export const useLive = () => useContext(Ctx);

/** One WebSocket for the whole admin portal; reconnects by itself. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Live>({ tick: 0, last: null, connected: false });
  const stop = useRef(false);
  useEffect(() => {
    stop.current = false;
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    const open = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => setS((p) => ({ ...p, connected: true }));
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data as string) as Live['last'];
          setS((p) => ({ tick: p.tick + 1, last: m, connected: true }));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setS((p) => ({ ...p, connected: false }));
        if (!stop.current) timer = window.setTimeout(open, 3000);
      };
    };
    open();
    const ping = window.setInterval(() => ws?.readyState === 1 && ws.send('ping'), 25000);
    return () => {
      stop.current = true;
      clearTimeout(timer);
      clearInterval(ping);
      ws?.close();
    };
  }, []);
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}

/** GET that refetches whenever the server pushes an event (no manual refresh needed). */
export function useGet<T>(
  path: string,
  live = true,
): { data: T | null; error: string; reload: () => void } {
  const { tick } = useLive();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    api<T>(path)
      .then((d) => alive && (setData(d), setError('')))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [path, live ? tick : 0, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: () => setN((x) => x + 1) };
}

export const SEV_COLOR = [
  '',
  'bg-slate-500',
  'bg-sky-600',
  'bg-amber-500',
  'bg-orange-600',
  'bg-red-600',
];
export const STATUS_LABEL: Record<string, string> = {
  reported: 'Reported',
  analysed: 'Analysed',
  alerted: 'Alerted',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  false_positive: 'False positive',
  duplicate: 'Duplicate',
  escalated: 'Escalated',
};
export const SOURCE_LABEL: Record<string, string> = {
  qr: 'QR sticker',
  portal: 'Worker portal',
  cctv: 'CCTV AI',
  audio: 'Audio AI',
  admin: 'Admin',
};

export function Sev({ n }: { n: number }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-sm font-black text-white ${SEV_COLOR[n]}`}
    >
      S{n}
    </span>
  );
}
export function SimTag({ on }: { on: number | boolean }) {
  return on ? (
    <span className="ml-1 rounded border border-dashed border-purple-500 px-1.5 text-xs font-bold text-purple-700">
      SIMULATED / SAMPLE
    </span>
  ) : null;
}
export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow ${className}`}>
      {title && <h2 className="mb-2 text-lg font-extrabold">{title}</h2>}
      {children}
    </section>
  );
}
