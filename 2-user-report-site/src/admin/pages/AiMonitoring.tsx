import { CheckCircle2, ImageOff, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { absUrl, api } from '@common/lib/api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Panel,
  Segmented,
  Select,
  SeverityBadge,
  Spinner,
  cx,
} from '@common/ui/primitives';
import { useToast } from '@common/ui/overlay';
import { DET_STYLE, detState, type DetState } from '../components/CameraFeed';
import { PageHeader, SimTag } from '../components/shared';
import { qs, useGet, type Incident } from '../data';
import { DETECTION_LABEL, ago, when } from '../labels';

export interface Det {
  name: string;
  number: number | null;
  label: string;
  category: string;
  maturity: string;
  weights: string;
  classes: string[];
  implemented: boolean;
  enabled: boolean;
  min_conf: number | null;
  requires_verification: boolean;
  incidents_total: number;
  confirmed: number;
  false_positives: number;
  events_seen: number;
  last_detection: string | null;
  load_status: Record<string, string>;
}
type Item = Incident & { thumb_url: string | null };

const LIGHT: Record<DetState, { label: string; tone: 'warn' | 'crit' | 'neutral' | 'ok' }> = {
  potential: { label: 'Potential: needs review', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'crit' },
  false_positive: { label: 'False positive', tone: 'neutral' },
  resolved: { label: 'Resolved', tone: 'ok' },
};

export default function AiMonitoring() {
  const nav = useNavigate();
  const toast = useToast();
  const dets = useGet<Det[]>('/detectors');
  const [detector, setDetector] = useState('');
  const [state, setState] = useState('all');
  const [sim, setSim] = useState('all');
  const [q, setQ] = useState('');
  const list = useGet<{ total: number; items: Item[] }>(
    `/incidents${qs({ limit: 60, q, simulated: sim === 'sim' ? true : sim === 'real' ? false : undefined })}&source=cctv`,
  );
  const audio = useGet<{ items: Item[] }>(
    `/incidents${qs({ limit: 60, q, simulated: sim === 'sim' ? true : sim === 'real' ? false : undefined })}&source=audio`,
  );
  const items = [...(list.data?.items ?? []), ...(audio.data?.items ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(
      (i) =>
        (!detector || (i.ai_meta?.detector as string) === detector) &&
        (state === 'all' || detState(i) === state),
    );

  const review = async (i: Item, status: 'acknowledged' | 'false_positive') => {
    try {
      await api(`/incidents/${i.id}/status`, {
        json: {
          status,
          note:
            status === 'false_positive'
              ? 'Reviewed in AI Monitoring: not a real event'
              : 'Verified in AI Monitoring',
        },
      });
      toast(
        status === 'acknowledged'
          ? `${i.id} verified and acknowledged`
          : `${i.id} marked false positive`,
      );
      list.reload();
      audio.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'crit');
    }
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="AI Monitoring"
        subtitle="Detections from the camera and audio models. Each one starts as a potential event; a person verifies it. Confidence is the model's certainty, not the incident's severity."
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {dets.data
          ?.filter((d) => d.number !== null)
          .map((d) => {
            const loaded = Object.values(d.load_status);
            const ok = loaded.length > 0 && loaded.every((s) => s === 'ready');
            return (
              <button
                key={d.name}
                onClick={() => setDetector(detector === d.name ? '' : d.name)}
                className={cx(
                  'rounded-lg border bg-surface p-3 text-left transition-colors hover:bg-sunken',
                  detector === d.name ? 'border-brand ring-1 ring-brand' : 'border-line',
                )}
                title={`${d.label}: ${d.confirmed} confirmed, ${d.false_positives} false positive`}
              >
                <span className="flex items-center justify-between text-[11px] text-muted">
                  <span>#{d.number}</span>
                  <span
                    className={cx(
                      'h-2 w-2 rounded-full',
                      !d.enabled ? 'bg-line-strong' : ok ? 'bg-ok' : 'bg-warn',
                    )}
                    title={!d.enabled ? 'disabled' : ok ? 'model loaded' : 'worker not started'}
                  />
                </span>
                <span className="mt-1 block text-xs font-semibold leading-tight">{d.label}</span>
                <span className="mt-1 block text-[11px] text-muted">
                  {d.incidents_total} events
                </span>
              </button>
            );
          })}
      </div>

      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Input
            aria-label="Search detections"
            placeholder="Search detections"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-56"
          />
          <Select
            aria-label="Detector"
            value={detector}
            onChange={(e) => setDetector(e.target.value)}
            className="w-52"
          >
            <option value="">All detectors</option>
            {dets.data?.map((d) => (
              <option key={d.name} value={d.name}>
                {d.label}
              </option>
            ))}
          </Select>
          <Segmented
            label="Review state"
            value={state}
            onChange={setState}
            options={[
              { value: 'all', label: 'All' },
              { value: 'potential', label: 'Needs review' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'false_positive', label: 'False positive' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
          <Segmented
            label="Origin"
            value={sim}
            onChange={setSim}
            options={[
              { value: 'all', label: 'All origins' },
              { value: 'real', label: 'Real detections' },
              { value: 'sim', label: 'Simulated' },
            ]}
          />
          <span className="ml-auto text-sm text-muted">{items.length} shown</span>
        </div>
        {list.error ? (
          <div className="p-4">
            <ErrorState message={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title="No detections match"
            hint="Start the CV worker (README) or use the demo trigger on the Live CCTV page to create a labelled simulated event."
          />
        ) : (
          <ul className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((i) => {
              const s = detState(i);
              const det = (i.ai_meta?.detector as string) ?? '';
              return (
                <li key={i.id} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <button
                    onClick={() => nav(`/admin/incidents/${i.id}`)}
                    className="relative block aspect-video w-full bg-sunken"
                    aria-label={`Open ${i.id}`}
                  >
                    {i.thumb_url ? (
                      <img
                        src={absUrl(i.thumb_url)}
                        alt={`Evidence frame for ${i.id}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted">
                        <ImageOff size={22} /> No evidence frame
                        {i.simulated ? ' (simulated event)' : ''}
                      </span>
                    )}
                    <span
                      className={cx(
                        'absolute left-2 top-2 rounded border px-1.5 py-0.5 text-[11px] font-bold',
                        DET_STYLE[s].cls.replace('text-[#', 'text-[#'),
                      )}
                    >
                      <span className="rounded bg-ink/70 px-1 text-white">
                        {DET_STYLE[s].label.toUpperCase()}
                      </span>
                    </span>
                  </button>
                  <div className="grid gap-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {DETECTION_LABEL[det] ?? i.ai_class?.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-muted">
                          {i.ai_class?.replace(/_/g, ' ')} · {ago(i.created_at)}
                        </p>
                      </div>
                      <SeverityBadge n={i.severity} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted">Where</dt>
                      <dd className="truncate">
                        {i.camera_id ?? i.audio_id} · {i.zone}
                      </dd>
                      <dt className="text-muted">Model</dt>
                      <dd className="truncate" title={i.ai_model ?? ''}>
                        {i.ai_model}
                      </dd>
                      <dt className="text-muted">Confidence</dt>
                      <dd>
                        {i.ai_confidence != null ? `${Math.round(i.ai_confidence * 100)}%` : 'n/a'}{' '}
                        <span className="text-muted">(model certainty)</span>
                      </dd>
                      <dt className="text-muted">When</dt>
                      <dd>{when(i.created_at)}</dd>
                      <dt className="text-muted">Incident</dt>
                      <dd className="font-mono">{i.id}</dd>
                    </dl>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={LIGHT[s].tone}>{LIGHT[s].label}</Badge>
                      {i.requires_verification ? (
                        <Badge tone="warn">Human verification required</Badge>
                      ) : (
                        <Badge tone="info">Trained model</Badge>
                      )}
                      <SimTag on={i.simulated} />
                    </div>
                    {s === 'potential' && (
                      <div className="flex gap-2 border-t border-line pt-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => void review(i, 'acknowledged')}
                        >
                          <CheckCircle2 size={14} /> Verify
                        </Button>
                        <Button size="sm" onClick={() => void review(i, 'false_positive')}>
                          <XCircle size={14} /> False positive
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => nav(`/admin/incidents/${i.id}`)}
                        >
                          Open
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
