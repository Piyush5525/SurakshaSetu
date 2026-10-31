import { describe, expect, it } from 'vitest';
import { BOARD_FIELDS, dayString, projectBoardItem, shouldPublish } from './board';

const created = new Date('2026-10-20T21:45:00Z'); // 03:15 on the 21st in Asia/Kolkata
const loc = { name: 'Filler', nameHi: 'फिलर' };

describe('projectBoardItem', () => {
  it('emits exactly the whitelisted keys', () => {
    const item = projectBoardItem(
      'abc',
      { hazardType: 'pinch_jam', status: 'fixed', shift: 'B', createdAt: created },
      loc,
      {
        publicFixText: 'Added interlock',
        featured: true,
        closedAt: new Date('2026-10-22T10:00:00Z'),
      },
    );
    expect(Object.keys(item).sort()).toEqual([...BOARD_FIELDS].sort());
  });

  it('never carries severity, harm flags, times or report text, even if the input has them', () => {
    const dirty = {
      hazardType: 'forklift',
      status: 'being_fixed',
      shift: 'A',
      createdAt: created,
      severity: 5,
      severityReason: 'x',
      seriousHarmFlag: true,
      injuryNow: true,
      transcript: 'secret words',
      reporterName: 'Asha',
      audioPath: 'a',
      photoPath: 'p',
      route: 'emergency',
      receiptCode: 'SW-1',
    } as const;
    const item = projectBoardItem('abc', dirty, loc, null);
    const json = JSON.stringify(item);
    for (const bad of [
      'severity',
      'seriousHarm',
      'injuryNow',
      'secret',
      'Asha',
      'audio',
      'photo',
      'route',
      'SW-1',
    ]) {
      expect(json).not.toContain(bad);
    }
    expect(Object.keys(item).sort()).toEqual([...BOARD_FIELDS].sort());
  });

  it('shows a plant-time day and a shift, not a time', () => {
    const item = projectBoardItem(
      'abc',
      { hazardType: 'forklift', status: 'being_fixed', shift: 'C', createdAt: created },
      loc,
      null,
    );
    expect(item.day).toBe('2026-10-21');
    expect(item.shift).toBe('C');
    expect(JSON.stringify(item)).not.toMatch(/\d{2}:\d{2}/);
    expect(dayString(created, 'UTC')).toBe('2026-10-20');
  });

  it('hides fix text until work starts, and fixedDay until fixed', () => {
    const act = { publicFixText: 'Guard fitted', closedAt: new Date('2026-10-25T05:00:00Z') };
    const r = { hazardType: 'pinch_jam', shift: 'A', createdAt: created } as const;
    expect(projectBoardItem('a', { ...r, status: 'received' }, loc, act).fixText).toBe('');
    expect(projectBoardItem('a', { ...r, status: 'being_fixed' }, loc, act).fixedDay).toBeNull();
    const fixed = projectBoardItem('a', { ...r, status: 'fixed' }, loc, act);
    expect(fixed.fixText).toBe('Guard fitted');
    expect(fixed.fixedDay).toBe('2026-10-25');
  });
});

describe('shouldPublish', () => {
  const now = new Date('2026-10-22T00:00:00Z');
  it('publishes when being fixed or fixed', () => {
    expect(shouldPublish('being_fixed', now, now)).toBe(true);
    expect(shouldPublish('fixed', now, now)).toBe(true);
  });
  it('holds fresh received reports and releases them after the delay', () => {
    expect(shouldPublish('received', new Date('2026-10-21T12:00:00Z'), now, 48)).toBe(false);
    expect(shouldPublish('received', new Date('2026-10-19T23:00:00Z'), now, 48)).toBe(true);
  });
  it('respects a configurable delay', () => {
    expect(shouldPublish('received', new Date('2026-10-21T12:00:00Z'), now, 6)).toBe(true);
  });
  it('never publishes dismissed reports', () => {
    expect(shouldPublish('dismissed', new Date('2020-01-01'), now, 0)).toBe(false);
  });
});
