import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = { title: 'Spot it. Scan it. Say it.', plant: 'Demo Plant — Line 3 (fictional)' };
const hi = { title: 'देखें। स्कैन करें। बताएं।', plant: 'डेमो प्लांट — लाइन 3 (काल्पनिक)' };

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
export default i18n;
