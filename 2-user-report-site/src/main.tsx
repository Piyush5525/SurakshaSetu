import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@common/i18n';
import './index.css';
import { startQueueWatcher } from '@common/lib/submit';
import MyReports from '@common/routes/MyReports';
import Receipt from '@common/routes/Receipt';
import Report from '@common/routes/Report';
import Home from './routes/Home';

const Board = lazy(() => import('./routes/Board'));
const Admin = lazy(() => import('./routes/admin/Admin'));

startQueueWatcher();
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/sw.js');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<p className="p-6 text-white">…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/report" element={<Report />} />
          <Route path="/q/:token" element={<Report />} />
          <Route path="/receipt/:id" element={<Receipt />} />
          <Route path="/my" element={<MyReports />} />
          <Route path="/board" element={<Board />} />
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
