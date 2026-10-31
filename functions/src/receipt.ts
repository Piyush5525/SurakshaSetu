import { createHash } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I

/** Short human-readable reference derived from the report ID (stable across retries). Not a secret. */
export function receiptCode(reportId: string): string {
  const h = createHash('sha256').update(reportId).digest();
  let out = '';
  for (let i = 0; i < 5; i++) out += ALPHABET[(h[i] ?? 0) % ALPHABET.length];
  return `SW-${out}`;
}
