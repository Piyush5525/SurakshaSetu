import type { EcoTag, HazardType, ReportStatus, Shift } from './domain';
import { isoWeekKey } from './domain';

/** Pure KPI functions. Aggregates only: nothing here can single out a worker (no worker identity exists). */

export interface KpiReport {
  locationId: string;
  hazardType: HazardType;
  shift: Shift;
  status: ReportStatus;
  createdAt: Date;
  ecoTag: EcoTag;
}
export interface KpiAction {
  reportId: string;
  status: 'open' | 'in_progress' | 'closed';
  createdAt: Date;
  closedAt: Date | null;
  visibleFix: boolean;
}

const DAY = 86_400_000;

/** Near-miss reports per 100 workers in the 30 days before `now`. `workers` is an assumption for the demo plant. */
export function reportsPer100WorkersPerMonth(
  reports: readonly KpiReport[],
  workers: number,
  now: Date,
): number | null {
  if (workers <= 0) return null;
  const since = now.getTime() - 30 * DAY;
  const n = reports.filter(
    (r) => r.status !== 'dismissed' && r.createdAt.getTime() >= since && r.createdAt <= now,
  ).length;
  return Math.round((n / workers) * 100 * 10) / 10;
}

/** Median hours from action creation to closure, over closed actions. null when none. */
export function medianHoursToClose(actions: readonly KpiAction[]): number | null {
  const hrs = actions
    .filter((a) => a.status === 'closed' && a.closedAt)
    .map((a) => (a.closedAt!.getTime() - a.createdAt.getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  if (!hrs.length) return null;
  const mid = Math.floor(hrs.length / 2);
  const m = hrs.length % 2 ? hrs[mid]! : (hrs[mid - 1]! + hrs[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

/** Share of closed actions where a visible fix was made on the floor (0-100). null when none closed. */
export function pctClosedWithVisibleFix(actions: readonly KpiAction[]): number | null {
  const closed = actions.filter((a) => a.status === 'closed');
  if (!closed.length) return null;
  return Math.round((closed.filter((a) => a.visibleFix).length / closed.length) * 100);
}

export const REPEAT_HOTSPOT_MIN = 3; // ASSUMPTION: 3+ reports of the same hazard at a location in 28 days
export const REPEAT_HOTSPOT_DAYS = 28;

/** Location x hazard pairs with at least REPEAT_HOTSPOT_MIN reports in the last 28 days. */
export function repeatHotspots(
  reports: readonly KpiReport[],
  now: Date,
): { locationId: string; hazardType: HazardType; count: number }[] {
  const since = now.getTime() - REPEAT_HOTSPOT_DAYS * DAY;
  const counts = new Map<string, number>();
  for (const r of reports) {
    if (r.status === 'dismissed' || r.createdAt.getTime() < since) continue;
    const k = `${r.locationId}|${r.hazardType}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= REPEAT_HOTSPOT_MIN)
    .map(([k, count]) => {
      const [locationId, hazardType] = k.split('|') as [string, HazardType];
      return { locationId, hazardType, count };
    })
    .sort((a, b) => b.count - a.count);
}

/** Reports per ISO week, oldest first, including empty weeks between first and last. */
export function weeklyTrend(
  reports: readonly KpiReport[],
  now: Date,
  weeks = 8,
): { week: string; count: number }[] {
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) keys.push(isoWeekKey(new Date(now.getTime() - i * 7 * DAY)));
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const r of reports) {
    if (r.status === 'dismissed') continue;
    const k = isoWeekKey(r.createdAt);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return keys.map((week) => ({ week, count: counts.get(week) ?? 0 }));
}

/** Report counts by location, optionally limited to one shift: drives the floor-plan heat map. */
export function hotspotCounts(
  reports: readonly KpiReport[],
  shift?: Shift,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reports) {
    if (r.status === 'dismissed' || (shift && r.shift !== shift)) continue;
    out[r.locationId] = (out[r.locationId] ?? 0) + 1;
  }
  return out;
}

export interface EcoAssumptions {
  air_leak_kwh_per_event: number;
  steam_leak_kwh_per_event: number;
  idle_machine_kwh_per_event: number;
  spill_kg_per_event: number;
}

/** ESTIMATE only: fixed reports with an eco-tag x per-event assumption. Not a measurement. */
export function estimatedSavings(
  reports: readonly KpiReport[],
  a: EcoAssumptions,
): { kwh: number; kg: number; events: Record<string, number> } {
  const fixed = reports.filter((r) => r.status === 'fixed');
  const n = (t: EcoTag) => fixed.filter((r) => r.ecoTag === t).length;
  const air = n('air_leak');
  const steam = n('steam_leak');
  const idle = n('idle_machine');
  const spill = n('spill');
  return {
    kwh:
      air * a.air_leak_kwh_per_event +
      steam * a.steam_leak_kwh_per_event +
      idle * a.idle_machine_kwh_per_event,
    kg: spill * a.spill_kg_per_event,
    events: { air_leak: air, steam_leak: steam, idle_machine: idle, spill },
  };
}
