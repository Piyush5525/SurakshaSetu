import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Flame,
  Paperclip,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { absUrl, api } from '@common/lib/api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  Select,
  SeverityBadge,
  Spinner,
  Textarea,
} from '@common/ui/primitives';
import { Modal, useToast } from '@common/ui/overlay';
import { SimTag, StatusBadge } from '../components/shared';
import { useGet, type Incident } from '../data';
import { CATEGORY, DETECTION_LABEL, SOURCE, STATUS, ago, when } from '../labels';

interface Detail extends Incident {
  evidence: { id: string; kind: string; url: string; note: string | null; created_at: string }[];
  history: { status: string; ts: string; actor: string | null; note: string | null }[];
  notifications: {
    id: number;
    channel: string;
    recipient: string;
    status: string;
    simulated: number;
    level: number;
    created_at: string;
    acknowledged_at: string | null;
    detail: string;
  }[];
  responder: { id: number; name: string; department: string } | null;
  reporter_name?: string | null;
}
interface Responder {
  id: number;
  name: string;
  department: string;
  available: number;
}

const NEXT: Record<string, string[]> = {
  reported: ['acknowledged'],
  analysed: ['acknowledged'],
  alerted: ['acknowledged'],
  escalated: ['acknowledged'],
  acknowledged: ['in_progress', 'resolved'],
  assigned: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
  resolved: ['closed', 'in_progress'],
};
const CLOSED = ['closed', 'rejected', 'false_positive', 'duplicate'];

export default function IncidentDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const d = useGet<Detail>(`/incidents/${id}`);
  const depts = useGet<{ name: string }[]>('/departments', false);
  const [modal, setModal] = useState<'assign' | 'resolve' | 'duplicate' | 'note' | null>(null);
  const [dept, setDept] = useState('');
  const [resp, setResp] = useState<number | ''>('');
  const [text, setText] = useState('');
  const [pub, setPub] = useState('');
  const [dupOf, setDupOf] = useState('');
  const [notes, setNotes] = useState({
    investigation_notes: '',
    root_cause: '',
    corrective_action: '',
    preventive_action: '',
  });
  const [zoom, setZoom] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const x = d.data;
  const responders = useGet<Responder[]>(
    modal === 'assign'
      ? `/responders?department=${encodeURIComponent(dept || x?.department || '')}`
      : null,
    false,
  );

  useEffect(() => {
    if (x) {
      setNotes({
        investigation_notes: x.investigation_notes ?? '',
        root_cause: x.root_cause ?? '',
        corrective_action: x.corrective_action ?? '',
        preventive_action: x.preventive_action ?? '',
      });
      setPub(x.public_update ?? '');
    }
  }, [x?.id, x?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (d.error && !x) return <ErrorState message={d.error} onRetry={d.reload} />;
  if (!x) return <Spinner />;

  const act = async (p: () => Promise<unknown>, ok: string, close = false) => {
    try {
      await p();
      toast(ok, 'ok');
      d.reload();
      if (close) setModal(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'crit');
    }
  };
  const setStatus = (status: string, note = '', close = false) =>
    act(
      () => api(`/incidents/${id}/status`, { json: { status, note } }),
      `Status: ${STATUS[status]}`,
      close,
    );
  const closed = CLOSED.includes(x.status);
  const det = x.ai_meta?.detector as string | undefined;
  const isAi = x.source === 'cctv' || x.source === 'audio';

  return (
    <div className="mx-auto max-w-[1500px]">
      <button
        onClick={() => nav(-1)}
        className="mb-3 flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold">{x.id}</h1>
            <StatusBadge s={x.status} />
            <SeverityBadge n={x.severity} />
            <SimTag on={x.simulated} />
            {x.injury_now ? <Badge tone="crit">Someone hurt now (reported)</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {CATEGORY[x.category] ?? x.category} · {SOURCE[x.source]} · {when(x.created_at)} (
            {ago(x.created_at)})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(NEXT[x.status] ?? []).map((s) => (
            <Button
              key={s}
              variant={s === 'acknowledged' ? 'primary' : 'secondary'}
              onClick={() => (s === 'resolved' ? setModal('resolve') : void setStatus(s))}
            >
              {s === 'acknowledged' && <UserCheck size={16} />}
              {s === 'resolved' && <CheckCircle2 size={16} />}
              {STATUS[s]}
            </Button>
          ))}
          {!closed && (
            <Button
              onClick={() => {
                setDept(x.department ?? '');
                setModal('assign');
              }}
            >
              Assign
            </Button>
          )}
          {!closed && x.status !== 'escalated' && (
            <Button onClick={() => void setStatus('escalated', 'Escalated manually')}>
              <ShieldAlert size={16} /> Escalate
            </Button>
          )}
          {!closed && (
            <>
              <Button onClick={() => void setStatus('false_positive')}>
                <XCircle size={16} /> False positive
              </Button>
              <Button onClick={() => setModal('duplicate')}>
                <Copy size={16} /> Duplicate
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="grid content-start gap-5 xl:col-span-2">
          <Panel title="Report">
            <p className="text-base">{x.description || 'No description was provided.'}</p>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                [
                  'Location',
                  [x.site, x.building, x.floor && `Floor ${x.floor}`, x.zone]
                    .filter(Boolean)
                    .join(' · ') || '—',
                ],
                ['Machine / asset', x.asset_id ?? '—'],
                ['Camera / audio source', x.camera_id ?? x.audio_id ?? '—'],
                ['Department', x.department ?? '—'],
                ['Responder', x.responder?.name ?? 'Unassigned'],
                [
                  'Reporter',
                  x.reporter_name
                    ? x.reporter_name
                    : x.source === 'cctv' || x.source === 'audio'
                      ? 'Automatic detection'
                      : 'Anonymous',
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {isAi && (
            <Panel
              title="AI detection"
              action={
                x.requires_verification ? (
                  <Badge tone="warn">Human verification required</Badge>
                ) : (
                  <Badge tone="info">Trained model</Badge>
                )
              }
            >
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Detector</dt>
                  <dd className="font-medium">{DETECTION_LABEL[det ?? ''] ?? det ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Model</dt>
                  <dd className="font-medium">{x.ai_model}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Class</dt>
                  <dd className="font-medium">{x.ai_class}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Model confidence</dt>
                  <dd className="font-medium">
                    {x.ai_confidence != null ? `${Math.round(x.ai_confidence * 100)}%` : 'n/a'}
                  </dd>
                </div>
              </dl>
              {x.ai_meta && (
                <p className="mt-3 break-words rounded-md bg-sunken p-2 font-mono text-[11px] text-ink-2">
                  {JSON.stringify(x.ai_meta)}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">
                Confidence is how sure the model is. Severity ({x.severity}) comes from the rules
                below and from people; the two are independent.
              </p>
            </Panel>
          )}

          <Panel
            title={`Evidence (${x.evidence.length})`}
            action={
              <>
                <input
                  ref={file}
                  type="file"
                  multiple
                  hidden
                  accept="image/*,video/*,audio/*"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    if (!fs.length) return;
                    const form = new FormData();
                    fs.forEach((f) => form.append('files', f));
                    void act(() => api(`/incidents/${id}/evidence`, { form }), 'Evidence added');
                    e.target.value = '';
                  }}
                />
                <Button size="sm" onClick={() => file.current?.click()}>
                  <Paperclip size={14} /> Add evidence
                </Button>
              </>
            }
          >
            {x.evidence.length === 0 ? (
              <EmptyState
                title="No files attached"
                hint="Photos, video and voice notes sent with a report appear here."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {x.evidence.map((e) => (
                  <figure key={e.id} className="overflow-hidden rounded-md border border-line">
                    {e.kind === 'image' && (
                      <button className="block w-full" onClick={() => setZoom(absUrl(e.url))}>
                        <img
                          src={absUrl(e.url)}
                          alt="evidence"
                          className="h-44 w-full bg-sunken object-contain"
                        />
                      </button>
                    )}
                    {e.kind === 'video' && (
                      <video src={absUrl(e.url)} controls className="h-44 w-full bg-ink" />
                    )}
                    {e.kind === 'audio' && (
                      <div className="flex h-44 items-center p-3">
                        <audio src={absUrl(e.url)} controls className="w-full" />
                      </div>
                    )}
                    <figcaption className="border-t border-line px-2 py-1 text-xs text-muted">
                      {e.kind}
                      {e.note ? ` · ${e.note}` : ''}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              People in camera evidence are pixelated. Links expire after 10 minutes.
            </p>
          </Panel>

          <Panel
            title="Investigation and resolution"
            action={
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  void act(
                    () => api(`/incidents/${id}`, { method: 'PATCH', json: notes }),
                    'Notes saved',
                  )
                }
              >
                Save notes
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ['investigation_notes', 'Investigation notes'],
                  ['root_cause', 'Root cause'],
                  ['corrective_action', 'Corrective action'],
                  ['preventive_action', 'Preventive action'],
                ] as const
              ).map(([k, l]) => (
                <Field key={k} label={l}>
                  <Textarea
                    rows={3}
                    value={notes[k]}
                    onChange={(e) => setNotes({ ...notes, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <div className="mt-4 grid items-end gap-3 md:grid-cols-[1fr_auto]">
              <Field label="Public update (shown to the reporter and on the “You said, we did” board once resolved)">
                <Input maxLength={300} value={pub} onChange={(e) => setPub(e.target.value)} />
              </Field>
              <Button
                onClick={() =>
                  void act(
                    () =>
                      api(`/incidents/${id}`, { method: 'PATCH', json: { public_update: pub } }),
                    'Public update saved',
                  )
                }
              >
                Save update
              </Button>
            </div>
          </Panel>
        </div>

        <div className="grid content-start gap-5">
          <Panel title="Why this severity">
            <ul className="grid gap-1.5 text-sm">
              {x.severity_reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <Flame size={14} className="mt-0.5 shrink-0 text-muted" />
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Rules are advisory. A manager can change severity; the change is logged.
            </p>
          </Panel>
          <Panel title="Timeline">
            <ol className="relative grid gap-4 border-l border-line-strong pl-4">
              {x.history.map((h, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-ink-2" />
                  <p className="font-medium">{STATUS[h.status] ?? h.status}</p>
                  <p className="text-xs text-muted">
                    {when(h.ts)} · {h.actor}
                  </p>
                  {h.note && <p className="mt-0.5 text-xs text-ink-2">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Notifications">
            {x.notifications.length === 0 ? (
              <p className="text-sm text-muted">No alerts were sent for this incident.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {x.notifications.map((n) => (
                  <li key={n.id} className="rounded-md border border-line p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{n.channel}</span>
                      <Badge
                        tone={
                          n.status === 'failed' || n.status === 'blocked'
                            ? 'crit'
                            : n.simulated
                              ? 'sim'
                              : 'ok'
                        }
                      >
                        {n.simulated && n.status === 'simulated'
                          ? 'simulated'
                          : `${n.status}${n.simulated ? ' (simulated)' : ''}`}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {when(n.created_at)}
                      {n.level ? ` · escalation level ${n.level}` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      {n.acknowledged_at
                        ? `Acknowledged ${when(n.acknowledged_at)}`
                        : 'Not acknowledged'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/admin/settings" className="mt-2 inline-block text-xs underline">
              Alert routing rules
            </Link>
          </Panel>
          <Panel title="Other actions">
            <div className="grid gap-2">
              <Button onClick={() => setModal('note')}>Add investigation note</Button>
              {x.status === 'closed' && (
                <Button onClick={() => void setStatus('in_progress', 'Re-opened')}>Re-open</Button>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Modal open={modal === 'assign'} onClose={() => setModal(null)} title="Assign incident">
        <Field label="Department">
          <Select
            value={dept}
            onChange={(e) => {
              setDept(e.target.value);
              setResp('');
            }}
          >
            {depts.data?.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Responder (only available people in this department)" className="mt-4">
          <Select value={resp} onChange={(e) => setResp(Number(e.target.value) || '')}>
            <option value="">Route to the department only</option>
            {responders.data
              ?.filter((r) => r.available)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setModal(null)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              void act(
                () =>
                  api(`/incidents/${id}/assign`, {
                    json: { department: dept, responder_id: resp || null },
                  }),
                'Assigned',
                true,
              )
            }
          >
            Assign
          </Button>
        </div>
      </Modal>
      <Modal open={modal === 'resolve'} onClose={() => setModal(null)} title="Resolve incident">
        <Field label="What was done? (kept in the timeline)">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label="Public update for the reporter (optional, 300 characters)" className="mt-4">
          <Input maxLength={300} value={pub} onChange={(e) => setPub(e.target.value)} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setModal(null)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              void act(
                async () => {
                  if (pub)
                    await api(`/incidents/${id}`, {
                      method: 'PATCH',
                      json: { public_update: pub },
                    });
                  await api(`/incidents/${id}/status`, {
                    json: { status: 'resolved', note: text },
                  });
                },
                'Resolved',
                true,
              )
            }
          >
            Mark resolved
          </Button>
        </div>
      </Modal>
      <Modal open={modal === 'duplicate'} onClose={() => setModal(null)} title="Mark as duplicate">
        <Field label="Original incident ID" hint="For example INC-20261101-AB3D">
          <Input value={dupOf} onChange={(e) => setDupOf(e.target.value.toUpperCase())} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setModal(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!dupOf}
            onClick={() => void setStatus('duplicate', `Duplicate of ${dupOf}`, true)}
          >
            Mark duplicate
          </Button>
        </div>
      </Modal>
      <Modal open={modal === 'note'} onClose={() => setModal(null)} title="Add investigation note">
        <Field label="Note">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setModal(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!text.trim()}
            onClick={() =>
              void act(
                () =>
                  api(`/incidents/${id}`, {
                    method: 'PATCH',
                    json: {
                      investigation_notes: `${notes.investigation_notes}${notes.investigation_notes ? '\n' : ''}[${new Date().toLocaleString()}] ${text.trim()}`,
                    },
                  }),
                'Note added',
                true,
              )
            }
          >
            Add note
          </Button>
        </div>
      </Modal>
      <Modal open={!!zoom} onClose={() => setZoom(null)} title="Evidence" wide>
        {zoom && (
          <img src={zoom} alt="evidence enlarged" className="max-h-[70vh] w-full object-contain" />
        )}
      </Modal>
    </div>
  );
}
