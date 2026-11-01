/**
 * Offline queue (IndexedDB, no dependency). Every report is saved here first, then sent.
 * If the network is down the report stays "waiting to send" and is retried (see submit.ts).
 */
export interface ReportFields {
  source: 'qr' | 'portal';
  qrToken?: string;
  assetId?: string;
  category?: string;
  hazardType?: string;
  description: string;
  seriousHarm: boolean;
  injuryNow: boolean;
  lang: 'en' | 'hi';
  reporterName?: string;
}

export interface QueuedReport {
  id: string; // local id (also the receipt URL)
  fields: ReportFields;
  createdAtMs: number;
  assetName?: string;
  audio?: Blob;
  photo?: Blob;
  video?: Blob;
  state: 'waiting' | 'sent';
  attempts: number;
  serverId?: string; // INC-… once accepted
  trackingCode?: string; // secret that lets this phone read the status
  lastError?: string;
}

const DB = 'safer-work-v2';
const STORE = 'reports';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const queue = {
  put: (r: QueuedReport) => tx('readwrite', (s) => s.put(r)),
  get: (id: string) => tx<QueuedReport | undefined>('readonly', (s) => s.get(id)),
  all: () => tx<QueuedReport[]>('readonly', (s) => s.getAll()),
  del: (id: string) => tx('readwrite', (s) => s.delete(id)),
};
