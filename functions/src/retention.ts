import { DEFAULTS } from './domain';

export interface SnapshotEvent {
  id: string;
  snapshotPath: string | null;
  status: 'pending' | 'confirmed' | 'dismissed';
  detectedAt: Date;
}

/** Events whose pixelated snapshot is older than the retention window and still stored. */
export function expiredSnapshots(
  events: readonly SnapshotEvent[],
  now: Date,
  retentionDays: number = DEFAULTS.snapshotRetentionDays,
): SnapshotEvent[] {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return events.filter((e) => e.snapshotPath !== null && e.detectedAt.getTime() <= cutoff);
}

/** A dismissed event keeps only the verdict: the image and detection details are removed. */
export const DISMISSED_SCRUB = { snapshotPath: null, measure: null, confidence: null } as const;
