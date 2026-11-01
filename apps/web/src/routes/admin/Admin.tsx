import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import ActionsTab from './ActionsTab';
import DispatchTab from './DispatchTab';
import EventsTab from './EventsTab';
import Inbox from './Inbox';
import Overview from './Overview';
import Stickers from './Stickers';

export type Role = 'supervisor' | 'ehs_admin';

function useStaff(): { user: User | null; role: Role | null; ready: boolean } {
  const [state, setState] = useState<{ user: User | null; role: Role | null; ready: boolean }>({
    user: null,
    role: null,
    ready: false,
  });
  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        if (!u || u.isAnonymous) return setState({ user: null, role: null, ready: true });
        const t = await u.getIdTokenResult(true);
        const r = t.claims.role;
        setState({
          user: u,
          role: r === 'supervisor' || r === 'ehs_admin' ? r : null,
          ready: true,
        });
      }),
    [],
  );
  return state;
}

function Login() {
  const [email, setEmail] = useState('supervisor@demo.local');
  const [password, setPassword] = useState('demo1234');
  const [err, setErr] = useState('');
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-white p-6 shadow">
      <h1 className="text-2xl font-bold">Staff sign-in</h1>
      <p className="mb-4 text-sm text-slate-600">
        Demo Plant — Line 3 (fictional). Emulator accounts: supervisor@demo.local or ehs@demo.local,
        password demo1234.
      </p>
      <input
        className="mb-2 w-full rounded border p-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email"
      />
      <input
        className="mb-3 w-full rounded border p-2"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="Password"
      />
      {err && <p className="mb-2 text-sm text-red-700">{err}</p>}
      <button
        className="w-full rounded bg-slate-900 p-2 font-semibold text-white"
        onClick={() =>
          void signInWithEmailAndPassword(auth, email, password).catch(() =>
            setErr('Sign-in failed. Are the emulators running and seeded?'),
          )
        }
      >
        Sign in
      </button>
      <Link to="/" className="mt-4 block text-center text-sm text-slate-600 underline">
        Back to worker app
      </Link>
    </div>
  );
}

const tabs = [
  ['', 'Overview'],
  ['inbox', 'Inbox'],
  ['actions', 'Actions'],
  ['events', 'Camera events'],
  ['stickers', 'QR stickers'],
  ['dispatch', 'Dispatch (simulated)'],
] as const;

export default function Admin() {
  const { user, role, ready } = useStaff();
  if (!ready) return <p className="p-6">Loading…</p>;
  if (!user) return <Login />;
  if (!role)
    return (
      <div className="p-6">
        <p>This account has no staff role.</p>
        <button className="underline" onClick={() => void signOut(auth)}>
          Sign out
        </button>
      </div>
    );
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white print:hidden">
        <div>
          <h1 className="text-lg font-bold">Safer Work — EHS dashboard</h1>
          <p className="text-xs text-slate-300">
            Demo Plant — Line 3 (fictional) · {user.email} · {role}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/board" className="underline">
            Board
          </Link>
          <button className="underline" onClick={() => void signOut(auth)}>
            Sign out
          </button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1 border-b bg-white px-4 print:hidden">
        {tabs.map(([to, label]) => (
          <NavLink
            key={to}
            to={`/admin/${to}`}
            end
            className={({ isActive }) =>
              `px-3 py-3 text-sm font-semibold ${isActive ? 'border-b-4 border-yellow-400' : 'text-slate-600'}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mx-auto max-w-7xl p-4">
        <Routes>
          <Route index element={<Overview role={role} />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="actions" element={<ActionsTab />} />
          <Route path="events" element={<EventsTab role={role} />} />
          <Route path="stickers" element={<Stickers />} />
          <Route path="dispatch" element={<DispatchTab />} />
        </Routes>
      </div>
    </div>
  );
}
