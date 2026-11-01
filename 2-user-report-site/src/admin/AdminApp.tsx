import { ShieldCheck } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { currentUser, login, type User } from '@common/lib/api';
import { Button, Field, Input, Spinner } from '@common/ui/primitives';
import { ToastProvider } from '@common/ui/overlay';
import AdminLayout from './AdminLayout';

const Overview = lazy(() => import('./pages/Overview'));
const LiveCctv = lazy(() => import('./pages/LiveCctv'));
const AiMonitoring = lazy(() => import('./pages/AiMonitoring'));
const Incidents = lazy(() => import('./pages/Incidents'));
const IncidentDetail = lazy(() => import('./pages/IncidentDetail'));
const QrManagement = lazy(() => import('./pages/QrManagement'));
const FactoryMap = lazy(() => import('./pages/FactoryMap'));
const AudioMonitoring = lazy(() => import('./pages/AudioMonitoring'));
const Responders = lazy(() => import('./pages/Responders'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Investigations = lazy(() => import('./pages/Investigations'));
const ModelConfig = lazy(() => import('./pages/ModelConfig'));
const Settings = lazy(() => import('./pages/Settings'));

function SignIn({ onDone }: { onDone: (u: User) => void }) {
  const [u, setU] = useState('admin');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-night p-12 text-night-text lg:flex">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] text-brand">L'ORÉAL</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">
            Industrial Safety Operations Centre
          </h1>
          <p className="mt-4 max-w-md text-night-muted">
            One place to see every report, camera detection and response across the plant: QR
            stickers, the worker portal, CCTV AI and audio.
          </p>
        </div>
        <ul className="grid gap-3 text-sm text-night-muted">
          <li className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-ok" /> Every AI event is a potential event until
            a person verifies it
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-ok" /> People in camera evidence are pixelated
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-ok" /> Simulated data is always labelled
          </li>
        </ul>
      </div>
      <div className="flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            login(u, p)
              .then(onDone)
              .catch((x: unknown) => setErr(x instanceof Error ? x.message : 'Sign-in failed'))
              .finally(() => setBusy(false));
          }}
        >
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted">
            Staff only. Camera and audio monitoring is for authorised use.
          </p>
          <Field label="Username">
            <Input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password" className="mt-4">
            <Input
              type="password"
              value={p}
              onChange={(e) => setP(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          {err && (
            <p role="alert" className="mt-3 text-sm font-medium text-crit">
              {err}
            </p>
          )}
          <Button variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="mt-6 text-xs text-muted">
            Demo accounts (local only): admin, manager.ehs, responder.maint. Password: demo1234 (set
            DEMO_PASSWORD to change).
          </p>
          <Link to="/" className="mt-4 inline-block text-sm text-ink-2 underline">
            Back to the reporting portal
          </Link>
        </form>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(currentUser());
  if (!user || user.role === 'worker') return <SignIn onDone={setUser} />;
  return (
    <ToastProvider>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<AdminLayout user={user} onOut={() => setUser(null)} />}>
            <Route index element={<Overview />} />
            <Route path="cctv" element={<LiveCctv />} />
            <Route path="ai" element={<AiMonitoring />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="qr" element={<QrManagement />} />
            <Route path="assets" element={<Navigate to="/admin/qr" replace />} />
            <Route path="map" element={<FactoryMap />} />
            <Route path="audio" element={<AudioMonitoring />} />
            <Route path="responders" element={<Responders />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="investigations" element={<Investigations />} />
            <Route path="models" element={<ModelConfig />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
