import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import '@common/i18n';
import './index.css';
import { Shell } from '@common/components/Shell';
import { startQueueWatcher } from '@common/lib/submit';
import MyReports from '@common/routes/MyReports';
import Receipt from '@common/routes/Receipt';
import Report from '@common/routes/Report';

startQueueWatcher();

/** The site (worker portal, board, admin) lives on another port of the same computer. */
function ToSite({ path }: { path: string }) {
  useEffect(() => {
    window.location.replace(`${window.location.protocol}//${window.location.hostname}:5173${path}`);
  }, [path]);
  return <p className="p-6 text-white">…</p>;
}

function Landing() {
  return (
    <Shell>
      <h1 className="text-3xl font-extrabold">Scan a machine sticker</h1>
      <p className="mt-3 text-lg text-slate-200">
        Point your phone camera at the QR sticker on the machine. The report form opens for that
        machine, ready to fill in under 30 seconds. No login.
      </p>
      <ol className="mt-5 list-decimal space-y-2 pl-6 text-lg">
        <li>Scan the sticker</li>
        <li>Tap what you saw, add a photo or voice note</li>
        <li>Send. You get a reference number you can track.</li>
      </ol>
      <Link
        to="/my"
        className="mt-6 block rounded-2xl bg-yellow-300 py-4 text-center text-lg font-extrabold text-slate-950"
      >
        My reports
      </Link>
      <a href="/staff" className="mt-8 block text-center text-sm text-slate-400 underline">
        Staff: print or manage QR stickers
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
        <Route path="/my" element={<MyReports />} />
        <Route path="/board" element={<ToSite path="/board" />} />
        <Route path="/staff" element={<ToSite path="/admin/assets" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
