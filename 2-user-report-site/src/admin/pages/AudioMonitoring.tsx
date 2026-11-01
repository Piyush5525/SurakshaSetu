import { Mic, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@common/lib/api';
import { Badge, Button, EmptyState, Panel, StatusDot } from '@common/ui/primitives';
import { useToast } from '@common/ui/overlay';
import { IncidentTable, PageHeader } from '../components/shared';
import { useGet, type Incident } from '../data';

interface Source {
  id: string;
  name: string;
  kind: string;
  zone: string;
  building: string;
  simulated: number;
  online: boolean;
  last_seen: string | null;
  incidents_total: number;
}
const EVENTS: [string, string][] = [
  ['audio_alarm', 'Fire alarm / siren'],
  ['audio_scream', 'Scream / distress'],
  ['audio_glass', 'Glass breaking'],
  ['audio_impact', 'Heavy impact'],
];

export default function AudioMonitoring() {
  const nav = useNavigate();
  const toast = useToast();
  const cams = useGet<Source[]>('/cameras');
  const ev = useGet<{ items: Incident[] }>('/incidents?source=audio&limit=50');
  const status = useGet<{ evidence_retention_days: number }>('/system/status', false);
  const mics = cams.data?.filter((c) => c.kind === 'microphone') ?? [];
  const sim = async (kind: string) => {
    try {
      await api('/demo/simulate', { json: { kind } });
      toast('Simulated audio event created (labelled SIMULATED)', 'info');
      ev.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'crit');
    }
  };
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5">
      <PageHeader
        title="Audio Monitoring"
        subtitle="Authorised audio sources and the events they raise. No audio detection model is connected in this prototype, so every audio event below is simulated and labelled."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Audio sources" className="lg:col-span-2">
          {mics.length === 0 ? (
            <EmptyState icon={<Mic size={28} />} title="No audio sources registered" />
          ) : (
            <ul className="grid gap-3">
              {mics.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
                >
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <StatusDot on={m.online} tone={m.simulated ? 'warn' : undefined} /> {m.name}
                    </p>
                    <p className="text-xs text-muted">
                      {m.id} · {m.zone} · {m.building}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="sim">
                      {m.simulated ? 'Simulated source' : m.online ? 'Receiving' : 'No signal'}
                    </Badge>
                    <span className="text-xs text-muted">{m.incidents_total} events</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
            Demo trigger (creates a labelled SIMULATED event)
          </h3>
          <div className="flex flex-wrap gap-2">
            {EVENTS.map(([k, l]) => (
              <Button key={k} size="sm" onClick={() => void sim(k)}>
                {l}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Detectable event types in a real deployment: emergency words, sirens, screams, glass
            breaking, explosion-like sounds, heavy impacts, abnormal machinery sounds. Loudness
            alone is never treated as violence or an emergency.
          </p>
        </Panel>
        <Panel title="Privacy controls in force">
          <ul className="grid gap-2.5 text-sm">
            {[
              'Audio is never recorded continuously: only a short clip around a detected event.',
              `Evidence is deleted automatically after ${status.data?.evidence_retention_days ?? 30} days.`,
              'Speech content is not transcribed or stored from monitoring sources.',
              'Every event needs a person to verify it before it is treated as confirmed.',
              'Access is limited to signed-in responders, managers and admins; access to evidence is logged.',
              'Microphones are only for authorised zones with a privacy notice and worker consultation.',
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
                {t}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Audio events" pad={false}>
        <IncidentTable
          items={ev.data?.items ?? []}
          onOpen={(id) => nav(`/admin/incidents/${id}`)}
          empty="No audio events yet. Use the demo trigger above."
        />
      </Panel>
    </div>
  );
}
