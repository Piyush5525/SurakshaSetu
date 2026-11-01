import { useEffect, useState } from 'react';
import { ApiError, api } from './api';
import { queue, type QueuedReport } from './queue';

/** Local id so a queued report has an address (receipt URL) before the server has seen it. */
export function newReportId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Save to the local queue immediately (nothing is lost), then try to send. */
export async function submitReport(r: Omit<QueuedReport, 'state' | 'attempts'>): Promise<void> {
  await queue.put({ ...r, state: 'waiting', attempts: 0 });
  window.dispatchEvent(new Event('sw-queue-changed'));
  void flushQueue();
}

let flushing = false;
/** Try to send everything waiting. Safe to call often. Runs while the app is open (no Background Sync API). */
export async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (const q of (await queue.all()).filter((x) => x.state === 'waiting')) await sendOne(q);
  } catch {
    /* offline or server down: reports stay queued */
  } finally {
    flushing = false;
    window.dispatchEvent(new Event('sw-queue-changed'));
  }
}

async function sendOne(q: QueuedReport): Promise<void> {
  try {
    q.attempts += 1;
    const f = q.fields;
    const form = new FormData();
    form.set('source', f.source);
    if (f.qrToken) form.set('qr_token', f.qrToken);
    else if (f.assetId) form.set('asset_id', f.assetId);
    if (f.category) form.set('category', f.category);
    if (f.hazardType) form.set('hazard_type', f.hazardType);
    form.set('description', f.description.slice(0, 2000));
    form.set('serious_harm', String(f.seriousHarm));
    form.set('injury_now', String(f.injuryNow));
    form.set('lang', f.lang);
    if (f.reporterName) form.set('reporter_name', f.reporterName.slice(0, 60));
    if (q.photo) form.append('files', q.photo, 'photo.jpg');
    if (q.video) form.append('files', q.video, `video.${q.video.type.includes('webm') ? 'webm' : 'mp4'}`);
    if (q.audio) form.append('files', q.audio, `voice.${q.audio.type.includes('mp4') ? 'm4a' : 'webm'}`);
    const r = await api<{ id: string; tracking_code: string }>('/public/reports', {
      form,
      authed: true,
    });
    q.state = 'sent';
    q.serverId = r.id;
    q.trackingCode = r.tracking_code;
    q.lastError = undefined;
    delete q.audio;
    delete q.photo;
    delete q.video;
    await queue.put(q);
  } catch (e) {
    q.lastError = e instanceof Error ? e.message : String(e);
    // A 4xx means the server rejected this report for good (bad QR, file type): do not retry forever.
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
      q.attempts = 99;
    }
    await queue.put(q);
  }
}

export function startQueueWatcher(): void {
  window.addEventListener('online', () => void flushQueue());
  setInterval(() => void flushQueue(), 15000);
  void flushQueue();
}

const MANUAL = 'sw.manual';
function manualTracks(): { id: string; code: string }[] {
  try {
    return JSON.parse(localStorage.getItem(MANUAL) ?? '[]') as { id: string; code: string }[];
  } catch {
    return [];
  }
}
/** A report found by reference number + access code is remembered on this device. */
export function saveManualTrack(id: string, code: string): void {
  const rest = manualTracks().filter((p) => p.id !== id);
  localStorage.setItem(MANUAL, JSON.stringify([{ id, code }, ...rest].slice(0, 20)));
}

export interface Tracked {
  id: string;
  category_label: string;
  created_at: string;
  status: string;
  status_label: string;
  department: string | null;
  asset_id: string | null;
  public_update: string;
  history: { status: string; label: string; ts: string }[];
}

/** Reports sent from this phone (kept locally) with live status from the server. */
export function useMyReports(pollMs = 10000): {
  items: Tracked[];
  waiting: QueuedReport[];
  refresh: () => void;
} {
  const [items, setItems] = useState<Tracked[]>([]);
  const [waiting, setWaiting] = useState<QueuedReport[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = await queue.all();
      if (!alive) return;
      setWaiting(all.filter((x) => x.state === 'waiting'));
      const sent = all.filter((x) => x.state === 'sent' && x.serverId && x.trackingCode);
      const pairs = [...sent.map((s) => ({ id: s.serverId as string, code: s.trackingCode as string })), ...manualTracks()];
      const uniq = [...new Map(pairs.map((p) => [p.id, p])).values()];
      if (!uniq.length) return setItems([]);
      try {
        const res = await api<Tracked[]>('/public/track', {
          json: uniq,
          authed: false,
        });
        if (alive) setItems(res.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      } catch {
        /* offline: keep what we have */
      }
    };
    void load();
    const t = setInterval(() => void load(), pollMs);
    window.addEventListener('sw-queue-changed', load as () => void);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('sw-queue-changed', load as () => void);
    };
  }, [pollMs, tick]);
  return { items, waiting, refresh: () => setTick((n) => n + 1) };
}
