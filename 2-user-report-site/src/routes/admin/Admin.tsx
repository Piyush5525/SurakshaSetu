import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { currentUser, login, logout, type User } from '@common/lib/api';
import Analytics from './Analytics';
import Assets from './Assets';
import CvMonitor from './CvMonitor';
import Incidents from './Incidents';
import Live from './Live';
import MapView from './MapView';
import Notifications from './Notifications';
import Overview from './Overview';
import { LiveProvider, useGet, useLive } from './hooks';

const TABS: [string, string, string][] = [
  ['', 'Overview', 'responder'],
  ['live', 'Live monitoring', 'responder'],
  ['cv', 'Computer vision', 'responder'],
  ['incidents', 'Incidents', 'responder'],
  ['map', 'Factory map', 'responder'],
  ['assets', 'Machines & QR', 'responder'],
  ['notifications', 'Notifications & team', 'responder'],
  ['analytics', 'Analytics', 'responder'],
];

function SignIn({ onDone }: { onDone: (u: User) => void }) {
  const [u, setU] = useState('admin');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-white p-6 shadow">
      <h1 className="text-2xl font-extrabold">Control centre sign in</h1>
      <p className="mb-4 text-sm text-slate-600">
        Staff only. Authorised use: camera and audio monitoring is restricted.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login(u, p)
            .then(onDone)
            .catch((x: unknown) => setErr(x instanceof Error ? x.message : 'Failed'));
        }}
      >
        <label className="block text-sm font-semibold">
          Username
          <input
            className="mt-1 w-full rounded border p-2"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          Password
          <input
            className="mt-1 w-full rounded border p-2"
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {err && <p className="mt-2 text-sm font-bold text-red-700">{err}</p>}
        <button className="mt-4 w-full rounded bg-slate-900 py-2 font-bold text-white">
          Sign in
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        Demo accounts (local only): admin, manager.ehs, responder.maint. Password: demo1234 (set
        DEMO_PASSWORD to change).
      </p>
      <Link to="/" className="mt-3 block text-center text-sm underline">
        Back to reporting
      </Link>
    </div>
  );
}

function Banner() {
  const { data } = useGet<{
    mode_text: string;
    demo_mode: boolean;
    telegram_configured: boolean;
    calls_configured: boolean;
    calls_enabled: boolean;
  }>('/system/status', false);
  const { connected } = useLive();
  if (!data) return null;
  return (
    <div
      className={`px-4 py-1 text-center text-sm font-bold ${data.demo_mode ? 'bg-purple-700 text-white' : 'bg-red-700 text-white'}`}
    >
      {data.mode_text}
      {data.demo_mode
        ? ` · Telegram ${data.telegram_configured ? 'configured' : 'not set'} · calls ${data.calls_configured ? 'configured' : 'not set'} (calls ${data.calls_enabled ? 'on' : 'off'})`
        : ''}
      {' · '}
      <span className={connected ? 'text-green-200' : 'text-yellow-200'}>
        {connected ? 'live updates on' : 'reconnecting…'}
      </span>
    </div>
  );
}

function Shell2({ user, onOut }: { user: User; onOut: () => void }) {
  return (
    <LiveProvider>
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <Banner />
        <header className="flex flex-wrap items-center gap-3 bg-slate-900 px-4 py-3 text-white">
          <Link to="/admin" className="text-xl font-black text-yellow-300">
            Control centre
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {TABS.map(([to, label]) => (
              <NavLink
                key={to}
                to={`/admin/${to}`}
                end={to === ''}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-bold ${isActive ? 'bg-yellow-300 text-slate-950' : 'bg-slate-700'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <span className="text-sm text-slate-300">
            {user.username} ({user.role})
          </span>
          <button onClick={onOut} className="rounded bg-slate-700 px-3 py-1 text-sm font-bold">
            Sign out
          </button>
        </header>
        <main className="mx-auto max-w-7xl p-4">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="live" element={<Live />} />
            <Route path="cv" element={<CvMonitor />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<Incidents />} />
            <Route path="map" element={<MapView />} />
            <Route path="assets" element={<Assets />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </LiveProvider>
  );
}

export default function Admin() {
  const [user, setUser] = useState<User | null>(currentUser());
  const nav = useNavigate();
  if (!user || user.role === 'worker') {
    return <SignIn onDone={(u) => setUser(u)} />;
  }
  return (
    <Shell2
      user={user}
      onOut={() => {
        logout();
        setUser(null);
        nav('/admin');
      }}
    />
  );
}
