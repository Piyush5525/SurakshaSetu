import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@common/i18n';
import './index.css';
import { startQueueWatcher } from '@common/lib/submit';
import Help from '@common/routes/Help';
import MyReports from '@common/routes/MyReports';
import Receipt from '@common/routes/Receipt';
import Report from '@common/routes/Report';
import Home from './worker/Home';

const Board = lazy(() => import('./routes/Board'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

startQueueWatcher();
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/sw.js');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<p className="p-6">…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/report" element={<Report />} />
          <Route path="/q/:token" element={<Report />} />
          <Route path="/receipt/:id" element={<Receipt />} />
          <Route path="/track" element={<MyReports />} />
          <Route path="/my" element={<Navigate to="/track" replace />} />
          <Route path="/help" element={<Help />} />
          <Route path="/board" element={<Board />} />
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
