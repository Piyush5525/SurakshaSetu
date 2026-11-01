import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@common/i18n';
import '@common/lib/firebase';
import './index.css';
import { startQueueWatcher } from '@common/lib/submit';
import Receipt from '@common/routes/Receipt';
import Report from '@common/routes/Report';
import Stickers from './Stickers';

startQueueWatcher();

/** The public board lives in the user site (another port). */
function ToSite({ path }: { path: string }) {
  useEffect(() => {
    window.location.replace(`${window.location.protocol}//${window.location.hostname}:5173${path}`);
  }, [path]);
  return <p className="p-6 text-white">…</p>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Stickers />} />
        <Route path="/r/:locationId" element={<Report />} />
        <Route path="/receipt/:id" element={<Receipt />} />
        <Route path="/board" element={<ToSite path="/board" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
