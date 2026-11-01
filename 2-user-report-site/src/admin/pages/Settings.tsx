import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { api } from '@common/lib/api';
import {
  Badge,
  Button,
  ErrorState,
  Panel,
  Segmented,
  Select,
  Spinner,
} from '@common/ui/primitives';
import { useToast } from '@common/ui/overlay';
import { PageHeader } from '../components/shared';
import { useGet } from '../data';
import { when } from '../labels';

interface Route {
  category: string;
  label: string;
  department: string;
  secondary: string | null;
  customised: boolean;
  min_severity: number;
  call_min_severity: number;
}
interface Status {
  demo_mode: boolean;
  telegram_configured: boolean;
  calls_configured: boolean;
  calls_enabled: boolean;
  escalate_after_s: number;
  evidence_retention_days: number;
  mode_text: string;
}
interface Fact {
  key: string;
  group: string;
  label: string;
  value: string;
  unit: string;
  year: string;
  context: string;
  source_title: string;
  source_url: string;
  verified: string;
}
interface Notif {
  id: number;
  incident_id: string;
  channel: string;
  status: string;
  simulated: number;
  level: number;
  created_at: string;
  acknowledged_at: string | null;
  detail: string;
}

export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState('alerts');
  const status = useGet<Status>('/system/status', false);
  const routing = useGet<Route[]>('/routing', false);
  const depts = useGet<{ name: string; active: number }[]>('/departments', false);
  const facts = useGet<{ retrieved: string; facts: Fact[]; not_verified: string[] }>(
    tab === 'data' ? '/public/facts' : null,
    false,
  );
  const notifs = useGet<Notif[]>(tab === 'alerts' ? '/notifications?limit=40' : null);
  const [test, setTest] = useState('');

  const save = async (r: Route, patch: Partial<Route>) => {
    const n = { ...r, ...patch };
    try {
      await api(`/routing/${r.category}`, {
        method: 'PUT',
        json: {
          department: n.department,
          secondary: n.secondary || null,
          min_severity: n.min_severity,
          call_min_severity: n.call_min_severity,
        },
      });
      toast('Routing saved');
      routing.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'crit');
    }
  };
  const sendTest = async (channel: 'telegram' | 'call') => {
    try {
      const r = await api<{ status: string; reason?: string }>('/system/test-alert', {
        json: { channel },
      });
      setTest(`Test ${channel}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
      notifs.reload();
    } catch (e) {
      setTest(e instanceof Error ? e.message : 'Failed');
    }
  };
  const groups = [...new Set(facts.data?.facts.map((f) => f.group))];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Settings"
        subtitle="Alert routing, notification status, and the public information this demo is based on."
        actions={
          <Segmented
            label="Section"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'alerts', label: 'Alerts & routing' },
              { value: 'data', label: 'Public data & sources' },
              { value: 'system', label: 'System' },
            ]}
          />
        }
      />

      {tab === 'alerts' && (
        <div className="grid gap-5">
          <Panel title="Notification channels">
            {status.error ? (
              <ErrorState message={status.error} />
            ) : !status.data ? (
              <Spinner />
            ) : (
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Mode</dt>
                    <dd>
                      <Badge tone={status.data.demo_mode ? 'sim' : 'crit'}>
                        {status.data.mode_text}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Telegram</dt>
                    <dd>
                      {status.data.telegram_configured
                        ? 'Bot and chat configured'
                        : 'Not configured'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Voice call</dt>
                    <dd>
                      {status.data.calls_configured
                        ? status.data.calls_enabled
                          ? 'Configured and enabled'
                          : 'Configured, disabled'
                        : 'Not configured'}
                      . Never dials emergency services.
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Escalation</dt>
                    <dd>
                      Unacknowledged critical alerts escalate after {status.data.escalate_after_s} s
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button onClick={() => void sendTest('telegram')}>Send test Telegram</Button>
                    <Button onClick={() => void sendTest('call')}>Test voice call</Button>
                  </div>
                  {test && <p className="text-xs font-medium">{test}</p>}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              Credentials live only in the server's environment file (.env), never in the browser.
              Real messages are sent only when DEMO_MODE is turned off there.
            </p>
          </Panel>

          <Panel title="Routing by category and severity" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Primary department</th>
                    <th className="px-3 py-2 font-medium">Also notify</th>
                    <th className="px-3 py-2 font-medium">Telegram from severity</th>
                    <th className="px-3 py-2 font-medium">Call from severity</th>
                  </tr>
                </thead>
                <tbody>
                  {routing.data?.map((r) => (
                    <tr key={r.category} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        {r.label}
                        {r.customised && (
                          <Badge tone="info" className="ml-2">
                            custom
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          aria-label={`Primary department for ${r.label}`}
                          className="h-8"
                          value={r.department}
                          onChange={(e) => void save(r, { department: e.target.value })}
                        >
                          {depts.data
                            ?.filter((d) => d.active)
                            .map((d) => (
                              <option key={d.name}>{d.name}</option>
                            ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          aria-label={`Secondary department for ${r.label}`}
                          className="h-8"
                          value={r.secondary ?? ''}
                          onChange={(e) => void save(r, { secondary: e.target.value || null })}
                        >
                          <option value="">None</option>
                          {depts.data
                            ?.filter((d) => d.active)
                            .map((d) => (
                              <option key={d.name}>{d.name}</option>
                            ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          aria-label={`Minimum severity for Telegram, ${r.label}`}
                          className="h-8 w-24"
                          value={r.min_severity}
                          onChange={(e) => void save(r, { min_severity: Number(e.target.value) })}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          aria-label={`Minimum severity for calls, ${r.label}`}
                          className="h-8 w-24"
                          value={r.call_min_severity}
                          onChange={(e) =>
                            void save(r, { call_min_severity: Number(e.target.value) })
                          }
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Alert history" pad={false}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Incident</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Delivery</th>
                  <th className="px-3 py-2 font-medium">Escalation</th>
                  <th className="px-3 py-2 font-medium">Acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {notifs.data?.map((n) => (
                  <tr key={n.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-muted">{when(n.created_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{n.incident_id}</td>
                    <td className="px-3 py-2 capitalize">{n.channel}</td>
                    <td className="px-3 py-2" title={n.detail}>
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
                    </td>
                    <td className="px-3 py-2">{n.level ? `Level ${n.level}` : '—'}</td>
                    <td className="px-3 py-2 text-muted">
                      {n.acknowledged_at ? when(n.acknowledged_at) : 'No'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === 'data' && (
        <div className="grid gap-5">
          <Panel title="What is real and what is simulated">
            <ul className="grid gap-2 text-sm">
              <li className="flex gap-2">
                <Badge tone="ok">Public</Badge> Figures below come from published L'Oréal documents,
                each with its source link.
              </li>
              <li className="flex gap-2">
                <Badge tone="sim">Simulated</Badge> Every incident, camera feed, machine, responder
                and map in this demo is synthetic or a sample video, on a fictional plant. No
                accident or incident is claimed for any real L'Oréal site.
              </li>
              <li className="flex gap-2">
                <Badge tone="warn">Not used</Badge> Anything we could not corroborate is listed
                under "Not verified" and left out.
              </li>
            </ul>
          </Panel>
          {facts.error ? (
            <ErrorState message={facts.error} />
          ) : !facts.data ? (
            <Spinner />
          ) : (
            <>
              {groups.map((g) => (
                <Panel key={g} title={g} pad={false}>
                  <ul>
                    {facts
                      .data!.facts.filter((f) => f.group === g)
                      .map((f) => (
                        <li
                          key={f.key}
                          className="grid gap-1 border-b border-line px-4 py-3 last:border-0 md:grid-cols-[1fr_8rem]"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {f.label} <span className="text-muted">· {f.year}</span>
                            </p>
                            <p className="text-xs text-ink-2">{f.context}</p>
                            <a
                              href={f.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-info underline"
                            >
                              {f.source_title}
                              <ExternalLink size={11} />
                            </a>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {f.verified} · retrieved {facts.data!.retrieved}
                            </p>
                          </div>
                          <p className="text-right text-2xl font-semibold tabular">
                            {f.value}
                            <span className="block text-[11px] font-normal text-muted">
                              {f.unit}
                            </span>
                          </p>
                        </li>
                      ))}
                  </ul>
                </Panel>
              ))}
              <Panel title="Not verified, therefore not shown">
                <ul className="grid gap-2 text-sm">
                  {facts.data.not_verified.map((t) => (
                    <li key={t} className="flex gap-2">
                      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
                      {t}
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          )}
        </div>
      )}

      {tab === 'system' && (
        <Panel title="System">
          {status.data ? (
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Evidence retention</dt>
                <dd>{status.data.evidence_retention_days} days, then deleted automatically</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">API documentation</dt>
                <dd>
                  <a
                    className="underline"
                    href={`${window.location.protocol}//${window.location.hostname}:8000/api/docs`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenAPI docs
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Roles</dt>
                <dd>
                  worker, responder, manager, admin. Department staff see their department only.
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Privacy</dt>
                <dd>
                  No face or emotion recognition. People in camera evidence are pixelated. No
                  per-person scoring.
                </dd>
              </div>
            </dl>
          ) : (
            <Spinner />
          )}
        </Panel>
      )}
    </div>
  );
}
