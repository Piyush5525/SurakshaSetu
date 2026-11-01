import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { hi } from './hi';

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('sw.lang') : null;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: saved === 'hi' ? 'hi' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function toggleLanguage(): void {
  const next = i18n.language === 'hi' ? 'en' : 'hi';
  localStorage.setItem('sw.lang', next);
  void i18n.changeLanguage(next);
}
export default i18n;
