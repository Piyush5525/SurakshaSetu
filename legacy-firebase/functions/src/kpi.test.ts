import { describe, expect, it } from 'vitest';
import {
  estimatedSavings,
  hotspotCounts,
  medianHoursToClose,
  pctClosedWithVisibleFix,
  repeatHotspots,
  reportsPer100WorkersPerMonth,
  weeklyTrend,
  type KpiAction,
  type KpiReport,
} from './kpi';

const now = new Date('2026-11-01T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const rep = (over: Partial<KpiReport> = {}): KpiReport => ({
  locationId: 'filler',
  hazardType: 'pinch_jam',
  shift: 'A',
  status: 'received',
  createdAt: daysAgo(1),
  ecoTag: 'none',
  ...over,
});
const act = (over: Partial<KpiAction> = {}): KpiAction => ({
  reportId: 'r',
  status: 'closed',
  createdAt: daysAgo(3),
  closedAt: daysAgo(2),
  visibleFix: true,
  ...over,
});

describe('reportsPer100WorkersPerMonth', () => {
  it('counts the last 30 days, excludes dismissed, scales per 100 workers', () => {
    const rs = [
      rep(),
      rep({ createdAt: daysAgo(10) }),
      rep({ createdAt: daysAgo(40) }),
      rep({ status: 'dismissed' }),
    ];
    expect(reportsPer100WorkersPerMonth(rs, 40, now)).toBe(5); // 2 of 40 workers = 5 per 100
  });
  it('is null without a headcount', () => {
    expect(reportsPer100WorkersPerMonth([rep()], 0, now)).toBeNull();
  });
});

describe('medianHoursToClose', () => {
  it('takes the median of closed actions only', () => {
    const as = [
      act({ createdAt: daysAgo(1), closedAt: new Date(daysAgo(1).getTime() + 2 * 3_600_000) }),
      act({ createdAt: daysAgo(1), closedAt: new Date(daysAgo(1).getTime() + 10 * 3_600_000) }),
      act({ createdAt: daysAgo(1), closedAt: new Date(daysAgo(1).getTime() + 4 * 3_600_000) }),
      act({ status: 'open', closedAt: null }),
    ];
    expect(medianHoursToClose(as)).toBe(4);
  });
  it('averages the middle pair for an even count and is null when none closed', () => {
    const h = (n: number) =>
      act({ createdAt: daysAgo(1), closedAt: new Date(daysAgo(1).getTime() + n * 3_600_000) });
    expect(medianHoursToClose([h(2), h(4)])).toBe(3);
    expect(medianHoursToClose([act({ status: 'open', closedAt: null })])).toBeNull();
  });
});

describe('pctClosedWithVisibleFix', () => {
  it('is the share of closed actions with a visible fix', () => {
    expect(
      pctClosedWithVisibleFix([
        act(),
        act(),
        act({ visibleFix: false }),
        act({ status: 'open', closedAt: null }),
      ]),
    ).toBe(67);
  });
  it('is null when nothing is closed', () => {
    expect(pctClosedWithVisibleFix([])).toBeNull();
  });
});

describe('repeatHotspots', () => {
  it('flags location x hazard pairs with 3+ reports in 28 days', () => {
    const rs = [
      rep(),
      rep(),
      rep(),
      rep({ locationId: 'capper' }),
      rep({ createdAt: daysAgo(40) }),
    ];
    expect(repeatHotspots(rs, now)).toEqual([
      { locationId: 'filler', hazardType: 'pinch_jam', count: 3 },
    ]);
  });
  it('ignores dismissed reports', () => {
    expect(repeatHotspots([rep(), rep(), rep({ status: 'dismissed' })], now)).toEqual([]);
  });
});

describe('weeklyTrend and hotspotCounts', () => {
  it('returns 8 weeks including empty ones', () => {
    const t = weeklyTrend([rep(), rep({ createdAt: daysAgo(30) })], now, 8);
    expect(t).toHaveLength(8);
    expect(t.reduce((s, w) => s + w.count, 0)).toBe(2);
  });
  it('counts per location and filters by shift', () => {
    const rs = [rep(), rep({ shift: 'B' }), rep({ locationId: 'capper' })];
    expect(hotspotCounts(rs)).toEqual({ filler: 2, capper: 1 });
    expect(hotspotCounts(rs, 'B')).toEqual({ filler: 1 });
  });
});

describe('estimatedSavings', () => {
  const a = {
    air_leak_kwh_per_event: 50,
    steam_leak_kwh_per_event: 80,
    idle_machine_kwh_per_event: 20,
    spill_kg_per_event: 5,
  };
  it('multiplies FIXED eco-tagged reports by the assumptions', () => {
    const rs = [
      rep({ status: 'fixed', ecoTag: 'air_leak' }),
      rep({ status: 'fixed', ecoTag: 'air_leak' }),
      rep({ status: 'fixed', ecoTag: 'steam_leak' }),
      rep({ status: 'fixed', ecoTag: 'spill' }),
      rep({ status: 'received', ecoTag: 'air_leak' }),
    ];
    const s = estimatedSavings(rs, a);
    expect(s.kwh).toBe(180);
    expect(s.kg).toBe(5);
    expect(s.events.air_leak).toBe(2);
  });
});
