import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './i18n';
import './lib/firebase';
import './index.css';
import { startQueueWatcher } from './lib/submit';
import Home from './routes/Home';
import Receipt from './routes/Receipt';
import Report from './routes/Report';

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
          <Route path="/r/:locationId" element={<Report />} />
          <Route path="/receipt/:id" element={<Receipt />} />
          <Route path="/board" element={<Board />} />
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
