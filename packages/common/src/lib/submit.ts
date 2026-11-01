import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, ensureAnonymous, storage } from './firebase';
import { queue, type QueuedReport } from './queue';

const MY_KEY = 'sw.mine';
export interface MineEntry {
  id: string;
  locationId: string;
  at: number;
}

/** Reports made on this phone (ids only, stored locally; never sent anywhere). */
export function myReports(): MineEntry[] {
  try {
    return JSON.parse(localStorage.getItem(MY_KEY) ?? '[]') as MineEntry[];
  } catch {
    return [];
  }
}
function remember(e: MineEntry): void {
  localStorage.setItem(MY_KEY, JSON.stringify([e, ...myReports()].slice(0, 20)));
}

/** Client-generated ID (21 chars, matches the rules pattern) so a queued report has an ID before it syncs. */
export function newReportId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  return Array.from(bytes, (b) => chars[b % 64]).join('');
}

/** Save to the local queue immediately (nothing is lost), then try to send. */
export async function submitReport(r: Omit<QueuedReport, 'state' | 'attempts'>): Promise<void> {
  await queue.put({ ...r, state: 'waiting', attempts: 0 });
  remember({ id: r.id, locationId: r.fields.locationId, at: r.createdAtMs });
  window.dispatchEvent(new Event('sw-queue-changed'));
  void flushQueue();
}

let flushing = false;
/** Try to send everything waiting. Safe to call often. Runs while the app is open (no Background Sync API). */
export async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    await ensureAnonymous();
    for (const q of (await queue.all()).filter((x) => x.state === 'waiting')) await sendOne(q);
  } catch {
    /* offline or emulator down: reports stay queued */
  } finally {
    flushing = false;
    window.dispatchEvent(new Event('sw-queue-changed'));
  }
}

async function sendOne(q: QueuedReport): Promise<void> {
  try {
    q.attempts += 1;
    let audioPath: string | null = null;
    let photoPath: string | null = null;
    if (q.audio) {
      audioPath = `reports/${q.id}/audio.${q.audio.type.includes('mp4') ? 'm4a' : 'webm'}`;
      if (!q.audioUploaded) {
        await uploadBytes(ref(storage, audioPath), q.audio, {
          contentType: q.audio.type || 'audio/webm',
        });
        q.audioUploaded = true;
        await queue.put(q);
      }
    }
    if (q.photo) {
      photoPath = `reports/${q.id}/photo.jpg`;
      if (!q.photoUploaded) {
        await uploadBytes(ref(storage, photoPath), q.photo, { contentType: 'image/jpeg' });
        q.photoUploaded = true;
        await queue.put(q);
      }
    }
    const f = q.fields;
    await setDoc(doc(db, 'reports', q.id), {
      locationId: f.locationId,
      hazardType: f.hazardType,
      seriousHarmFlag: f.seriousHarmFlag,
      injuryNow: f.injuryNow,
      transcript: f.transcript.slice(0, 1000),
      transcriptStatus: f.transcriptStatus,
      audioPath,
      photoPath,
      lang: f.lang,
      shift: f.shift,
      ...(f.reporterName ? { reporterName: f.reporterName.slice(0, 60) } : {}),
      status: 'received',
      createdAt: Timestamp.fromMillis(Math.min(q.createdAtMs, Date.now())),
    });
    q.state = 'sent';
    q.lastError = undefined;
    delete q.audio; // keep the small record so the receipt page can show "Sent"
    delete q.photo;
    await queue.put(q);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    q.lastError = code || String(e);
    // A retry after a lost acknowledgement hits the update rule (denied): the first write already landed.
    if (
      code === 'permission-denied' &&
      q.attempts > 1 &&
      (q.audioUploaded || !q.audio) &&
      (q.photoUploaded || !q.photo)
    ) {
      q.state = 'sent';
      delete q.audio;
      delete q.photo;
    }
    await queue.put(q);
  }
}

export function startQueueWatcher(): void {
  window.addEventListener('online', () => void flushQueue());
  setInterval(() => void flushQueue(), 15000);
  void flushQueue();
}
