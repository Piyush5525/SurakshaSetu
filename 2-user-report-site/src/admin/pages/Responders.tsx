import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@common/lib/api';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  Spinner,
} from '@common/ui/primitives';
import { Modal, useToast } from '@common/ui/overlay';
import { IncidentTable, PageHeader } from '../components/shared';
import { useGet, type Incident } from '../data';

interface W {
  id: number;
  name: string;
  department: string;
  role: string;
  available: number;
  open: number;
  handled: number;
  resolved: number;
  avg_ack_min: number | null;
  escalations: number;
}
interface Dept {
  name: string;
  description: string;
  active: number;
  responders: number;
}

export default function Responders() {
  const nav = useNavigate();
  const toast = useToast();
  const w = useGet<W[]>('/responders/workload');
  const depts = useGet<Dept[]>('/departments');
  const esc = useGet<{ items: Incident[] }>('/incidents?status=escalated&limit=20');
  const [dept, setDept] = useState('');
  const [modal, setModal] = useState<'resp' | 'dept' | null>(null);
  const [rf, setRf] = useState({ name: '', department: 'EHS', telegram_chat_id: '' });
  const [df, setDf] = useState({ name: '', description: '' });
  const rows = (w.data ?? []).filter((r) => !dept || r.department === dept);

  const act = async (p: () => Promise<unknown>, ok: string) => {
    try {
      await p();
      toast(ok);
      w.reload();
      depts.reload();
      setModal(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'crit');
    }
  };
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5">
      <PageHeader
        title="Responders"
        subtitle="People and departments that receive alerts. Assignment follows department and availability, never just who is nearest."
        actions={
          <>
            <Button onClick={() => setModal('dept')}>
              <Plus size={16} /> Department
            </Button>
            <Button variant="primary" onClick={() => setModal('resp')}>
              <Plus size={16} /> Responder
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <Panel
          title="Directory and workload"
          pad={false}
          action={
            <Select
              aria-label="Department"
              className="h-8 w-48"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
            >
              <option value="">All departments</option>
              {depts.data?.map((d) => (
                <option key={d.name}>{d.name}</option>
              ))}
            </Select>
          }
        >
          {w.loading && !w.data ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState title="No responders" />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  {[
                    'Name',
                    'Department',
                    'Availability',
                    'Open',
                    'Handled',
                    'Resolved',
                    'Avg to acknowledge',
                    'Escalations',
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 font-medium">
                      {r.name}
                      {r.role === 'manager' && (
                        <span className="ml-1.5 text-xs text-muted">manager</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{r.department}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() =>
                          void act(
                            () =>
                              api(`/responders/${r.id}?available=${!r.available}`, {
                                method: 'PATCH',
                              }),
                            `${r.name} is now ${r.available ? 'unavailable' : 'available'}`,
                          )
                        }
                        aria-pressed={!!r.available}
                      >
                        <Badge tone={r.available ? 'ok' : 'neutral'}>
                          {r.available ? 'Available' : 'Unavailable'}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 tabular">{r.open}</td>
                    <td className="px-3 py-2.5 tabular">{r.handled}</td>
                    <td className="px-3 py-2.5 tabular">{r.resolved}</td>
                    <td className="px-3 py-2.5 tabular">
                      {r.avg_ack_min != null ? `${r.avg_ack_min} min` : '—'}
                    </td>
                    <td className="px-3 py-2.5 tabular">{r.escalations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Departments">
          <ul className="grid gap-2">
            {depts.data?.map((d) => (
              <li key={d.name} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{d.name}</span>
                  <span className="block text-xs text-muted">
                    {d.responders} responder{d.responders === 1 ? '' : 's'}
                  </span>
                </span>
                <button
                  onClick={() =>
                    void act(
                      () =>
                        api(`/departments/${encodeURIComponent(d.name)}?active=${!d.active}`, {
                          method: 'PATCH',
                        }),
                      `${d.name} ${d.active ? 'deactivated' : 'activated'}`,
                    )
                  }
                >
                  <Badge tone={d.active ? 'ok' : 'neutral'}>
                    {d.active ? 'Active' : 'Inactive'}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Escalation history" pad={false}>
        <IncidentTable
          items={esc.data?.items ?? []}
          onOpen={(id) => nav(`/admin/incidents/${id}`)}
          compact
          empty="No incident is currently escalated. A critical alert that nobody acknowledges within the configured time is escalated automatically."
        />
      </Panel>

      <Modal open={modal === 'resp'} onClose={() => setModal(null)} title="Register responder">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () =>
                api('/responders', {
                  json: {
                    name: rf.name,
                    department: rf.department,
                    telegram_chat_id: rf.telegram_chat_id || null,
                  },
                }),
              'Responder added',
            );
          }}
        >
          <Field label="Name">
            <Input
              required
              value={rf.name}
              onChange={(e) => setRf({ ...rf, name: e.target.value })}
            />
          </Field>
          <Field label="Department">
            <Select
              value={rf.department}
              onChange={(e) => setRf({ ...rf, department: e.target.value })}
            >
              {depts.data
                ?.filter((d) => d.active)
                .map((d) => (
                  <option key={d.name}>{d.name}</option>
                ))}
            </Select>
          </Field>
          <Field
            label="Telegram chat ID (optional)"
            hint="Alerts for this person's department go to this chat."
          >
            <Input
              value={rf.telegram_chat_id}
              onChange={(e) => setRf({ ...rf, telegram_chat_id: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary">Add</Button>
          </div>
        </form>
      </Modal>
      <Modal open={modal === 'dept'} onClose={() => setModal(null)} title="Create department">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api('/departments', { json: df }), 'Department created');
          }}
        >
          <Field label="Name">
            <Input
              required
              minLength={2}
              value={df.name}
              onChange={(e) => setDf({ ...df, name: e.target.value })}
            />
          </Field>
          <Field label="Description (optional)">
            <Input
              value={df.description}
              onChange={(e) => setDf({ ...df, description: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary">Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
