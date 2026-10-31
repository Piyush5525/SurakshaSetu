import type { HazardType, ReportStatus, Shift } from './domain';
import { DEFAULTS } from './domain';

/** The ONLY fields that may appear in a public boardItem. Do not add severity, harm flags, times or text from reports. */
export const BOARD_FIELDS = [
  'id',
  'locationLabel',
  'locationLabelHi',
  'hazardIcon',
  'status',
  'fixText',
  'featured',
  'day',
  'shift',
  'fixedDay',
] as const;

export interface BoardItem {
  id: string;
  locationLabel: string;
  locationLabelHi: string;
  hazardIcon: HazardType;
  status: 'received' | 'being_fixed' | 'fixed';
  fixText: string;
  featured: boolean;
  day: string;
  shift: Shift;
  fixedDay: string | null;
}

export interface BoardReportInput {
  hazardType: HazardType;
  status: ReportStatus;
  shift: Shift;
  createdAt: Date;
}
export interface BoardLocationInput {
  name: string;
  nameHi: string;
}
export interface BoardActionInput {
  publicFixText?: string;
  featured?: boolean;
  closedAt?: Date | null;
}

/** YYYY-MM-DD in the plant time zone. Deliberately drops the time of day. */
export function dayString(d: Date, timeZone: string = DEFAULTS.plantTimeZone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Published once it reaches "being fixed"/"fixed", or when older than the configured delay.
 * Dismissed reports are never published.
 */
export function shouldPublish(
  status: ReportStatus,
  createdAt: Date,
  now: Date,
  delayHours: number = DEFAULTS.boardPublishDelayHours,
): boolean {
  if (status === 'dismissed') return false;
  if (status === 'being_fixed' || status === 'fixed') return true;
  return now.getTime() - createdAt.getTime() >= delayHours * 3_600_000;
}

/** Whitelisted projection, built field by field. Never spreads the report. */
export function projectBoardItem(
  id: string,
  report: BoardReportInput,
  location: BoardLocationInput,
  action: BoardActionInput | null,
  timeZone: string = DEFAULTS.plantTimeZone,
): BoardItem {
  const status = report.status === 'dismissed' ? 'received' : report.status;
  return {
    id,
    locationLabel: location.name,
    locationLabelHi: location.nameHi,
    hazardIcon: report.hazardType,
    status,
    fixText: status === 'fixed' || status === 'being_fixed' ? (action?.publicFixText ?? '') : '',
    featured: action?.featured === true,
    day: dayString(report.createdAt, timeZone),
    shift: report.shift,
    fixedDay: status === 'fixed' && action?.closedAt ? dayString(action.closedAt, timeZone) : null,
  };
}
