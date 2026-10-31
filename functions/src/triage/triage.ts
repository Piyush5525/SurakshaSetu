import type { EcoTag, HazardType, Route } from '../domain';
import {
  ACTION_DUE_DAYS,
  ACTION_MIN_SEVERITY,
  ACTION_OWNER,
  BASE_SEVERITY,
  ECO_RULES,
  FAST_TRACK_SEVERITY,
  HAZARD_LABEL,
  HIGH_RISK_LOCATION_WEIGHT,
  SEVERE_KEYWORDS,
} from './config';
import { findTerms } from './match';

export interface TriageInput {
  hazardType: HazardType;
  seriousHarmFlag: boolean;
  injuryNow: boolean;
  transcript?: string | null;
}

export interface TriageLocation {
  name: string;
  riskWeight: number;
}

export interface SeverityComponent {
  key: 'base' | 'seriousHarm' | 'locationWeight' | 'keyword';
  label: string;
  points: number;
  detail?: string;
}

export interface ActionPlan {
  owner: string;
  dueInDays: number;
  title: string;
}

export interface TriageResult {
  severity: number;
  severityRaw: number;
  severityReason: string;
  severityBreakdown: SeverityComponent[];
  ecoTag: EcoTag;
  ecoReason: string;
  route: Route;
  action: ActionPlan | null;
}

const clamp = (n: number) => Math.min(5, Math.max(1, n));

export function triageReport(input: TriageInput, location: TriageLocation): TriageResult {
  const hits = findTerms(input.transcript, SEVERE_KEYWORDS);
  const highRiskLocation = location.riskWeight >= HIGH_RISK_LOCATION_WEIGHT;

  const severityBreakdown: SeverityComponent[] = [
    {
      key: 'base',
      label: 'Hazard type',
      points: BASE_SEVERITY[input.hazardType],
      detail: HAZARD_LABEL[input.hazardType],
    },
    {
      key: 'seriousHarm',
      label: 'Worker flagged potential for serious harm',
      points: input.seriousHarmFlag ? 1 : 0,
    },
    {
      key: 'locationWeight',
      label: 'High-risk location',
      points: highRiskLocation ? 1 : 0,
      detail: `${location.name}, risk weight ${location.riskWeight}`,
    },
    {
      key: 'keyword',
      label: 'Severe keyword in transcript',
      points: hits.length > 0 ? 1 : 0,
      ...(hits.length > 0 ? { detail: hits.join(', ') } : {}),
    },
  ];

  const severityRaw = severityBreakdown.reduce((sum, c) => sum + c.points, 0);
  const severity = clamp(severityRaw);

  const route: Route = input.injuryNow
    ? 'emergency'
    : severity >= FAST_TRACK_SEVERITY
      ? 'supervisor_fast_track'
      : 'standard';

  const eco = ecoTag(input);
  return {
    severity,
    severityRaw,
    severityReason: buildReason(severityBreakdown, severityRaw, severity, route),
    severityBreakdown,
    ecoTag: eco.tag,
    ecoReason: eco.reason,
    route,
    action:
      severity >= ACTION_MIN_SEVERITY
        ? {
            owner: ACTION_OWNER[input.hazardType],
            dueInDays: ACTION_DUE_DAYS[severity] ?? 7,
            title: `Fix: ${HAZARD_LABEL[input.hazardType]} at ${location.name}`,
          }
        : null,
  };
}

function buildReason(
  parts: SeverityComponent[],
  raw: number,
  severity: number,
  route: Route,
): string {
  const base = parts[0];
  const extras = parts
    .slice(1)
    .filter((p) => p.points > 0)
    .map((p) => `+${p.points} ${p.label.toLowerCase()}${p.detail ? ` (${p.detail})` : ''}`);
  let s = `Base ${base?.points} (${base?.detail})`;
  if (extras.length) s += ` ${extras.join(' ')}`;
  else s += ', no extra factors';
  s += ` = ${raw}`;
  if (raw !== severity) s += `, capped to ${severity}`;
  s += '.';
  if (route === 'emergency') s += ' Injury reported now: emergency path (simulated dispatch).';
  else if (route === 'supervisor_fast_track')
    s += ' High potential, nobody hurt: fast-tracked to supervisor.';
  return s;
}

function ecoTag(input: TriageInput): { tag: EcoTag; reason: string } {
  for (const rule of ECO_RULES) {
    const hits = findTerms(input.transcript, rule.keywords);
    if (hits.length) return { tag: rule.tag, reason: `Transcript mentions "${hits[0]}"` };
    if (rule.tag === 'spill' && input.hazardType === 'chemical_spill') {
      return { tag: 'spill', reason: 'Hazard icon: chemical / spill' };
    }
  }
  return { tag: 'none', reason: 'No eco-relevant signal' };
}
