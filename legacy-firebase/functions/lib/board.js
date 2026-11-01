"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOARD_FIELDS = void 0;
exports.dayString = dayString;
exports.shouldPublish = shouldPublish;
exports.projectBoardItem = projectBoardItem;
const domain_1 = require("./domain");
/** The ONLY fields that may appear in a public boardItem. Do not add severity, harm flags, times or text from reports. */
exports.BOARD_FIELDS = [
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
];
/** YYYY-MM-DD in the plant time zone. Deliberately drops the time of day. */
function dayString(d, timeZone = domain_1.DEFAULTS.plantTimeZone) {
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
function shouldPublish(status, createdAt, now, delayHours = domain_1.DEFAULTS.boardPublishDelayHours) {
    if (status === 'dismissed')
        return false;
    if (status === 'being_fixed' || status === 'fixed')
        return true;
    return now.getTime() - createdAt.getTime() >= delayHours * 3_600_000;
}
/** Whitelisted projection, built field by field. Never spreads the report. */
function projectBoardItem(id, report, location, action, timeZone = domain_1.DEFAULTS.plantTimeZone) {
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
