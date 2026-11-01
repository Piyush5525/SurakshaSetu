/** Display names and colours used across the control centre. One place, so words and colours never drift. */
export const CATEGORY: Record<string, string> = {
  machinery_accident: 'Machinery accident',
  chemical_spill: 'Chemical spill / leak',
  fire_explosion: 'Fire / explosion',
  production_quality: 'Production quality',
  lab_contamination: 'Lab contamination',
  storage_handling: 'Storage & handling',
  warehouse_accident: 'Warehouse accident',
  logistics: 'Logistics / packaging',
  waste_disposal: 'Waste disposal',
  worker_safety: 'Worker safety',
  security: 'Security',
  other: 'Other',
};

export const STATUS: Record<string, string> = {
  reported: 'Reported',
  analysed: 'Analysed',
  alerted: 'Alerted',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  false_positive: 'False positive',
  duplicate: 'Duplicate',
  escalated: 'Escalated',
};
export const STATUS_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'crit' | 'info'> = {
  reported: 'warn',
  analysed: 'warn',
  alerted: 'warn',
  escalated: 'crit',
  acknowledged: 'info',
  assigned: 'info',
  in_progress: 'info',
  resolved: 'ok',
  closed: 'neutral',
  rejected: 'neutral',
  false_positive: 'neutral',
  duplicate: 'neutral',
};
export const OPEN = [
  'reported',
  'analysed',
  'alerted',
  'escalated',
  'acknowledged',
  'assigned',
  'in_progress',
];

export const SOURCE: Record<string, string> = {
  qr: 'QR sticker',
  portal: 'Worker portal',
  cctv: 'CCTV AI',
  audio: 'Audio AI',
  admin: 'Admin',
};
export const SOURCE_COLOR: Record<string, string> = {
  qr: '#44403c',
  portal: '#0369a1',
  cctv: '#c8102e',
  audio: '#7c3aed',
  admin: '#a8a29e',
};
export const SEV_COLOR = ['', '#78716c', '#0369a1', '#ca8a04', '#ea580c', '#b91c1c'];

export const DETECTION_LABEL: Record<string, string> = {
  fire: 'Fire',
  fall: 'Person fall',
  violence: 'Possible violence',
  machinery_proximity: 'Machinery danger zone',
  hand_in_zone: 'Hand in danger zone',
  spill: 'Leak',
  storage_instability: 'Unstable storage',
  forklift_person: 'Forklift proximity',
  package_damage: 'Package damage',
  waste: 'Waste disposal',
  ppe: 'Missing PPE',
  blocked_aisle: 'Blocked aisle',
  audio: 'Audio event',
};

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
