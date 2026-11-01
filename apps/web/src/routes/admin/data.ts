import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';

/** Firestore Timestamps -> Date (top level only). */
function convert<T>(id: string, data: Record<string, unknown>): T & { id: string } {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) out[k] = v instanceof Timestamp ? v.toDate() : v;
  return out as T & { id: string };
}

export interface Col<T> {
  rows: (T & { id: string })[];
  error: string | null;
  loading: boolean;
}

/** Live collection (staff only; rules enforce this). Optionally ordered by one field, descending. */
export function useCol<T>(name: string, orderByField?: string, enabled = true): Col<T> {
  const [state, setState] = useState<Col<T>>({ rows: [], error: null, loading: true });
  useEffect(() => {
    if (!enabled) return;
    const cons: QueryConstraint[] = orderByField ? [orderBy(orderByField, 'desc')] : [];
    return onSnapshot(
      query(collection(db, name), ...cons),
      (s) =>
        setState({
          rows: s.docs.map((d) => convert<T>(d.id, d.data())),
          error: null,
          loading: false,
        }),
      (e) => setState({ rows: [], error: e.code, loading: false }),
    );
  }, [name, orderByField, enabled]);
  return state;
}

export interface LocationDoc {
  name: string;
  nameHi: string;
  zoneType: string;
  riskWeight: number;
  floorPlan: { x: number; y: number; w: number; h: number };
  assemblyPoint: string;
}
export interface ReportDoc {
  locationId: string;
  hazardType: import('@shared/domain').HazardType;
  shift: 'A' | 'B' | 'C';
  status: import('@shared/domain').ReportStatus;
  createdAt: Date;
  ecoTag: import('@shared/domain').EcoTag;
  ecoReason?: string;
  severity?: number;
  severityReason?: string;
  severityBreakdown?: { key: string; label: string; points: number; detail?: string }[];
  route?: 'emergency' | 'supervisor_fast_track' | 'standard';
  transcript: string;
  transcriptStatus: string;
  seriousHarmFlag: boolean;
  injuryNow: boolean;
  receiptCode?: string;
  audioPath: string | null;
  photoPath: string | null;
  reporterName?: string;
  source?: 'worker' | 'camera';
  actionId?: string | null;
}
export interface ActionDoc {
  reportId: string;
  locationId: string;
  title: string;
  owner: string;
  dueDate: Date;
  status: 'open' | 'in_progress' | 'closed';
  controlLevel: string | null;
  internalNotes: string;
  publicFixText: string;
  visibleFix: boolean;
  featured: boolean;
  closedAt: Date | null;
  createdAt: Date;
}
export interface EventDoc {
  rule: 'forklift_person_gap' | 'hand_in_danger_zone';
  zoneId: string;
  locationId: string;
  shift: string;
  detectedAt: Date;
  confidence: number | null;
  measure: number | null;
  snapshotPath: string | null;
  status: 'pending' | 'confirmed' | 'dismissed';
  simulated: boolean;
  reportId?: string | null;
}
export interface FeedbackDoc {
  score: number;
  locationId: string;
  shift: string;
  weekKey: string;
}
export interface AssumptionDoc {
  value: number;
  unit: string;
  label: string;
  source: string;
}
