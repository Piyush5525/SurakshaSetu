import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  ClipboardList,
  Cpu,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Mic,
  QrCode,
  Search,
  Settings,
  ShieldAlert,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, logout, type User } from '@common/lib/api';
import { Badge, Button, StatusDot, cx } from '@common/ui/primitives';
import { Modal } from '@common/ui/overlay';
import { LiveProvider, qs, useGet, useLive, type Incident } from './data';
import { CATEGORY, ago } from './labels';

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/admin/cctv', label: 'Live CCTV', icon: <Video size={18} /> },
  { to: '/admin/ai', label: 'AI Monitoring', icon: <Bot size={18} /> },
  { to: '/admin/incidents', label: 'Incidents', icon: <ShieldAlert size={18} /> },
  { to: '/admin/qr', label: 'QR Management', icon: <QrCode size={18} /> },
  { to: '/admin/map', label: 'Factory Map', icon: <Map size={18} /> },
  { to: '/admin/audio', label: 'Audio Monitoring', icon: <Mic size={18} /> },
  { to: '/admin/responders', label: 'Responders', icon: <Users size={18} /> },
  { to: '/admin/analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  { to: '/admin/investigations', label: 'Investigations', icon: <ClipboardList size={18} /> },
  { to: '/admin/models', label: 'Model Configuration', icon: <Cpu size={18} /> },
  { to: '/admin/settings', label: 'Settings', icon: <Settings size={18} /> },
];

interface Status {
  demo_mode: boolean;
  mode_text: string;
  telegram_configured: boolean;
  calls_configured: boolean;
  calls_enabled: boolean;
}

function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const res = useGet<{ items: Incident[] }>(
    open && q.length >= 2 ? `/incidents${qs({ q, limit: 6 })}` : null,
    false,
  );
  const pages = useMemo(
    () => NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  const go = (to: string) => {
    onClose();
    setQ('');
    nav(to);
  };
  return (
    <Modal open={open} onClose={onClose} title="Search">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Incident ID, description, or a page name…"
        aria-label="Search incidents and pages"
        className="h-11 w-full rounded-md border border-line-strong px-3"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const first = res.data?.items[0];
          go(first ? `/admin/incidents/${first.id}` : (pages[0]?.to ?? '/admin'));
        }}
      />
      <div className="mt-3 grid gap-1">
        {res.data?.items.map((i) => (
          <button
            key={i.id}
            onClick={() => go(`/admin/incidents/${i.id}`)}
            className="flex items-center justify-between rounded px-2 py-2 text-left hover:bg-sunken"
          >
            <span>
              <span className="font-mono text-xs">{i.id}</span>
              <span className="ml-2 text-sm">{CATEGORY[i.category] ?? i.category}</span>
            </span>
            <span className="text-xs text-muted">{ago(i.created_at)}</span>
          </button>
        ))}
        {pages.map((p) => (
          <button
            key={p.to}
            onClick={() => go(p.to)}
            className="flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-sunken"
          >
            {p.icon} Go to {p.label}
          </button>
        ))}
        {q.length >= 2 && !res.data?.items.length && !pages.length && (
          <p className="p-2 text-sm text-muted">No matches.</p>
        )}
      </div>
    </Modal>
  );
}

function Bell_({ onOpen }: { onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const pend = useGet<{ pending: Incident[]; kpi: { awaiting_ack: number } }>(
    '/analytics/dashboard?days=30',
  );
  const count = pend.data?.kpi.awaiting_ack ?? 0;
  return (
    <div className="relative">
      <button
        aria-label={`Notifications, ${count} awaiting acknowledgement`}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-ink-2 hover:bg-sunken"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-white">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 rounded-lg border border-line bg-surface shadow-xl">
          <p className="border-b border-line px-4 py-2 text-sm font-semibold">
            Awaiting acknowledgement
          </p>
          {pend.data?.pending.length ? (
            pend.data.pending.map((i) => (
              <button
                key={i.id}
                onClick={() => {
                  setOpen(false);
                  onOpen(i.id);
                }}
                className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-sunken"
              >
                <span
                  className={cx(
                    'mt-1 h-2.5 w-2.5 rounded-full',
                    i.severity >= 4 ? 'bg-crit' : 'bg-warn',
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {CATEGORY[i.category] ?? i.category}
                  </span>
                  <span className="block text-xs text-muted">
                    {i.id} · {ago(i.created_at)}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-muted">Nothing waiting. All alerts are acknowledged.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ user, onOut }: { user: User; onOut: () => void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { connected } = useLive();
  const status = useGet<Status>('/system/status', false);
  const dash = useGet<{ kpi: { cameras_online: number; cameras_total: number } }>(
    '/analytics/dashboard?days=30',
  );
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [site, setSite] = useState('Demo Plant — Line 3');
  const night = loc.pathname.startsWith('/admin/cctv');

  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  const health = !connected ? 'warn' : 'ok';
  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col bg-surface">
      <div className="border-b border-line px-5 py-4">
        <p className="text-[10px] font-bold tracking-[0.22em] text-brand">SURAKSHASETU</p>
        <p className="text-sm font-semibold leading-tight">Industrial Safety Operations Centre</p>
      </div>
      <ul className="flex-1 overflow-auto p-3">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'relative mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'bg-sunken text-ink before:absolute before:left-0 before:top-1.5 before:h-6 before:w-0.5 before:rounded before:bg-brand'
                    : 'text-ink-2 hover:bg-sunken',
                )
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <p className="border-t border-line p-4 text-[11px] leading-snug text-muted">
        Hackathon prototype on a fictional plant. Not an official L'Oréal product; no real L'Oréal
        data is internal data.
      </p>
    </nav>
  );

  return (
    <div className="flex h-screen bg-canvas text-ink">
      <aside className="hidden w-64 shrink-0 border-r border-line lg:block">{sidebar}</aside>
      {drawer && (
        <div
          className="fixed inset-0 z-40 flex bg-ink/40 lg:hidden"
          onClick={() => setDrawer(false)}
        >
          <aside className="w-64 border-r border-line" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <button
            className="rounded-md p-2 hover:bg-sunken lg:hidden"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
          >
            <Menu size={20} />
          </button>
          <select
            value={site}
            onChange={(e) => setSite(e.target.value)}
            aria-label="Site"
            className="hidden h-9 rounded-md border border-line-strong bg-surface px-2 text-sm font-medium sm:block"
          >
            <option>Demo Plant — Line 3</option>
          </select>
          <button
            onClick={() => setSearch(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line-strong bg-sunken px-3 text-left text-sm text-muted sm:max-w-md"
          >
            <Search size={16} /> Search incidents, pages…
            <kbd className="ml-auto hidden rounded border border-line-strong px-1.5 text-[11px] sm:block">
              Ctrl K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div
              className="hidden items-center gap-3 rounded-md border border-line px-3 py-1.5 text-xs md:flex"
              title="System health"
            >
              <span className="flex items-center gap-1.5">
                <StatusDot tone={health} /> {connected ? 'Live updates' : 'Reconnecting'}
              </span>
              <span className="flex items-center gap-1.5">
                <Activity size={13} /> Cameras {dash.data?.kpi.cameras_online ?? '–'}/
                {dash.data?.kpi.cameras_total ?? '–'}
              </span>
              {status.data && (
                <Badge tone={status.data.demo_mode ? 'sim' : 'crit'}>
                  {status.data.demo_mode ? 'Alerts simulated' : 'Alerts LIVE'}
                </Badge>
              )}
            </div>
            <Bell_ onOpen={(id) => nav(`/admin/incidents/${id}`)} />
            <div className="relative">
              <button
                onClick={() => setMenu((v) => !v)}
                className="flex items-center gap-2 rounded-md p-1 hover:bg-sunken"
                aria-label="User menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                  {user.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden text-left text-xs leading-tight sm:block">
                  <span className="block font-semibold">{user.name ?? user.username}</span>
                  <span className="text-muted">
                    {user.role}
                    {user.department ? ` · ${user.department}` : ''}
                  </span>
                </span>
              </button>
              {menu && (
                <div className="absolute right-0 z-40 mt-2 w-48 rounded-lg border border-line bg-surface p-1 shadow-xl">
                  <Button variant="ghost" className="w-full justify-start" onClick={onOut}>
                    <LogOut size={16} /> Sign out
                  </Button>
                </div>
              )}
            </div>
          </div>
        </header>
        {status.data?.demo_mode && (
          <p className="border-b border-line bg-sunken px-4 py-1 text-center text-xs text-ink-2">
            Demo mode: Telegram and voice-call alerts are <b>simulated</b> (logged, not sent).
            Telegram {status.data.telegram_configured ? 'is configured' : 'is not configured'}.
          </p>
        )}
        <main
          className={cx('min-h-0 flex-1 overflow-auto', night ? 'bg-night text-night-text' : 'p-5')}
        >
          <Outlet />
        </main>
      </div>
      <SearchPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}

export default function AdminLayout({ user, onOut }: { user: User; onOut: () => void }) {
  return (
    <LiveProvider>
      <Shell
        user={user}
        onOut={() => {
          logout();
          onOut();
        }}
      />
    </LiveProvider>
  );
}

export { api };
