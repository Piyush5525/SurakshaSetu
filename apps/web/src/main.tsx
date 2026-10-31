import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n';
import './firebase';
import './index.css';

function Home() {
  const { t, i18n } = useTranslation();
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-slate-600">{t('plant')}</p>
      <button
        className="mt-4 rounded bg-slate-900 px-4 py-3 text-white"
        onClick={() => void i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')}
      >
        EN / हिं
      </button>
      <ul className="mt-6 list-disc pl-5">
        <li>
          <Link to="/r/filler">/r/:locationId (M2)</Link>
        </li>
        <li>
          <Link to="/admin">/admin (M3)</Link>
        </li>
        <li>
          <Link to="/board">/board (M4)</Link>
        </li>
      </ul>
    </main>
  );
}
const Stub = ({ name }: { name: string }) => (
  <main className="p-6 text-2xl">{name} — not built yet</main>
);
function Report() {
  const { locationId } = useParams();
  return <Stub name={`Report form for ${locationId ?? '?'}`} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:locationId" element={<Report />} />
        <Route path="/admin/*" element={<Stub name="Admin" />} />
        <Route path="/board" element={<Stub name="Board" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
