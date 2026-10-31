import { describe, expect, it } from 'vitest';
import { reportFromEvent } from './camera';
import { receiptCode } from './receipt';

describe('receiptCode', () => {
  it('is stable per id and well-formed', () => {
    expect(receiptCode('abc')).toBe(receiptCode('abc'));
    expect(receiptCode('abc')).toMatch(/^SW-[2-9A-HJ-NP-Z]{5}$/);
    expect(receiptCode('abc')).not.toBe(receiptCode('abd'));
  });
});

describe('reportFromEvent', () => {
  it('maps rules to hazards and carries no image or person data', () => {
    const r = reportFromEvent({
      rule: 'forklift_person_gap',
      locationId: 'forklift-lane',
      shift: 'A',
      detectedAt: new Date(),
    });
    expect(r.hazardType).toBe('forklift');
    expect(r.source).toBe('camera');
    expect(r.injuryNow).toBe(false);
    expect(r.photoPath).toBeNull();
    const h = reportFromEvent({
      rule: 'hand_in_danger_zone',
      locationId: 'filler',
      shift: 'B',
      detectedAt: new Date(),
    });
    expect(h.hazardType).toBe('pinch_jam');
  });
});
