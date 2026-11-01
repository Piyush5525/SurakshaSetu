import { QrCode } from 'lucide-react';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import '@common/i18n';
import './index.css';
import { Shell } from '@common/components/Shell';
import { startQueueWatcher } from '@common/lib/submit';
import Help from '@common/routes/Help';
import MyReports from '@common/routes/MyReports';
import Receipt from '@common/routes/Receipt';
import Report from '@common/routes/Report';

startQueueWatcher();

/** The worker portal, board and admin live in the user site (another port of the same computer). */
function ToSite({ path }: { path: string }) {
  useEffect(() => {
    window.location.replace(`${window.location.protocol}//${window.location.hostname}:5173${path}`);
  }, [path]);
  return <p className="p-6">…</p>;
}

function Landing() {
  return (
    <Shell>
      <div className="rounded-lg border-2 border-ink bg-ink p-6 text-white">
        <QrCode size={44} />
        <h1 className="mt-3 text-3xl font-bold">Scan the QR sticker on the machine</h1>
        <p className="mt-2 text-lg text-white/80">
          Your phone camera opens the report form for that machine. No app, no login, under 30
          seconds.
        </p>
      </div>
      <ol className="mt-6 grid gap-3 text-xl">
        {[
          'Scan the sticker',
          'Tap what you saw',
          'Add a photo, a voice note or a few words',
          'Send',
        ].map((s, i) => (
          <li
            key={s}
            className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <Link
        to="/track"
        className="mt-6 flex min-h-14 items-center justify-center rounded-lg border-2 border-ink bg-surface text-lg font-semibold"
      >
        Track my report
      </Link>
      <Link
        to="/help"
        className="mt-3 flex min-h-14 items-center justify-center rounded-lg border-2 border-crit bg-crit-soft text-lg font-semibold text-crit"
      >
        Emergency help
      </Link>
      <a href="/staff" className="mt-8 block text-center text-base text-muted underline">
        Staff: manage and print QR stickers
      </a>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/q/:token" element={<Report />} />
        <Route path="/receipt/:id" element={<Receipt />} />
        <Route path="/track" element={<MyReports />} />
        <Route path="/my" element={<Navigate to="/track" replace />} />
        <Route path="/help" element={<Help />} />
        <Route path="/board" element={<ToSite path="/board" />} />
        <Route path="/staff" element={<ToSite path="/admin/qr" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
