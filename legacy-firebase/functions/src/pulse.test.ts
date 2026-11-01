import { describe, expect, it } from 'vitest';
import { pulseBy, type FeedbackEntry } from './pulse';

const e = (score: number, shift = 'A'): FeedbackEntry => ({
  score,
  locationId: 'filler',
  shift,
  weekKey: '2026-W40',
});

describe('pulseBy', () => {
  it('suppresses groups below 5 entries', () => {
    expect(pulseBy([e(5), e(4), e(3), e(5)], (x) => x.shift)).toEqual([
      { key: 'A', n: 4, mean: null },
    ]);
  });
  it('shows the mean from 5 entries up', () => {
    expect(pulseBy([e(5), e(4), e(3), e(5), e(3)], (x) => x.shift)).toEqual([
      { key: 'A', n: 5, mean: 4 },
    ]);
  });
  it('decides per group', () => {
    const entries = [e(4), e(4), e(4), e(4), e(4), e(1, 'B'), e(1, 'B')];
    const out = pulseBy(entries, (x) => x.shift);
    expect(out.find((g) => g.key === 'B')?.mean).toBeNull();
    expect(out.find((g) => g.key === 'A')?.mean).toBe(4);
  });
});
