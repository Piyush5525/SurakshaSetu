import { MIN_GROUP_SIZE } from './domain';

export interface FeedbackEntry {
  score: number;
  locationId: string;
  shift: string;
  weekKey: string;
}

export interface PulseGroup {
  key: string;
  n: number;
  /** null when the group is smaller than the minimum (suppressed to protect anonymity). */
  mean: number | null;
}

/** Aggregate-only pulse: groups below MIN_GROUP_SIZE are suppressed, never shown. */
export function pulseBy(
  entries: readonly FeedbackEntry[],
  keyOf: (e: FeedbackEntry) => string,
  minGroup: number = MIN_GROUP_SIZE,
): PulseGroup[] {
  const groups = new Map<string, number[]>();
  for (const e of entries) {
    const k = keyOf(e);
    groups.set(k, [...(groups.get(k) ?? []), e.score]);
  }
  return [...groups.entries()]
    .map(([key, scores]) => ({
      key,
      n: scores.length,
      mean:
        scores.length >= minGroup
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
          : null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
