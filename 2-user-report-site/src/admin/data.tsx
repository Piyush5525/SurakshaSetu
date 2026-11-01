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
  floor: string | null;
  zone: string | null;
  created_at: string;
  updated_at: string;
  severity: number;
  severity_reasons: string[];
  ai_model: string | null;
  ai_model_version: string | null;
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
  tick: number;
  last: { type: string; incident?: Incident; camera_id?: string } | null;
  connected: boolean;
}
const Ctx = createContext<Live>({ tick: 0, last: null, connected: false });
export const useLive = () => useContext(Ctx);

/** One WebSocket for the whole control centre. Reconnects by itself; `connected` drives the health pill. */
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
          /* ignore malformed */
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

/** GET that refetches whenever the server pushes an event. Keeps the old data while reloading (no flicker). */
export function useGet<T>(path: string | null, live = true) {
  const { tick } = useLive();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (path === null) return;
    let alive = true;
    api<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError('');
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, live ? tick : 0, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
