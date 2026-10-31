import { describe, expect, it } from 'vitest';
import { DISMISSED_SCRUB, expiredSnapshots, type SnapshotEvent } from './retention';

const now = new Date('2026-11-01T00:00:00Z');
const ev = (
  id: string,
  daysAgo: number,
  snapshotPath: string | null = `events/${id}.jpg`,
): SnapshotEvent => ({
  id,
  snapshotPath,
  status: 'confirmed',
  detectedAt: new Date(now.getTime() - daysAgo * 86_400_000),
});

describe('snapshot retention', () => {
  it('selects snapshots older than the configured days', () => {
    const out = expiredSnapshots(
      [ev('a', 31), ev('b', 30), ev('c', 5), ev('d', 90, null)],
      now,
      30,
    );
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('is configurable', () => {
    expect(expiredSnapshots([ev('a', 8), ev('b', 2)], now, 7).map((e) => e.id)).toEqual(['a']);
  });
  it('dismissed scrub removes image and detection details', () => {
    expect(DISMISSED_SCRUB).toEqual({ snapshotPath: null, measure: null, confidence: null });
  });
});
