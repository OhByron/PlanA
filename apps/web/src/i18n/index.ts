import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'da', label: 'Dansk', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', dir: 'ltr' },
  { code: 'et', label: 'Eesti', dir: 'ltr' },
  { code: 'el', label: 'Ελληνικά', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { code: 'hr', label: 'Hrvatski', dir: 'ltr' },
  { code: 'hu', label: 'Magyar', dir: 'ltr' },
  { code: 'is', label: 'Íslenska', dir: 'ltr' },
  { code: 'it', label: 'Italiano', dir: 'ltr' },
  { code: 'ja', label: '日本語', dir: 'ltr' },
  { code: 'ko', label: '한국어', dir: 'ltr' },
  { code: 'lv', label: 'Latviešu', dir: 'ltr' },
  { code: 'lt', label: 'Lietuvių', dir: 'ltr' },
  { code: 'nl', label: 'Nederlands', dir: 'ltr' },
  { code: 'nb', label: 'Norsk', dir: 'ltr' },
  { code: 'pl', label: 'Polski', dir: 'ltr' },
  { code: 'pt', label: 'Português', dir: 'ltr' },
  { code: 'ru', label: 'Русский', dir: 'ltr' },
  { code: 'sr', label: 'Srpski', dir: 'ltr' },
  { code: 'sv', label: 'Svenska', dir: 'ltr' },
  { code: 'tr', label: 'Türkçe', dir: 'ltr' },
  { code: 'zh', label: '中文', dir: 'ltr' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

// Lazy-load non-English translations
const lazyLoadTranslation = async (lang: string) => {
  if (lang === 'en') return en;
  const mod = await import(`./locales/${lang}.json`);
  return mod.default;
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    supportedLngs: LANGUAGE_CODES,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'plana_language',
      caches: ['localStorage'],
    },
  });

// Load a language on demand
export async function loadLanguage(lang: string) {
  if (!LANGUAGE_CODES.includes(lang as LanguageCode)) return;
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    const translations = await lazyLoadTranslation(lang);
    i18n.addResourceBundle(lang, 'translation', translations);
  }
  await i18n.changeLanguage(lang);
  // Update document direction for RTL languages
  const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
  document.documentElement.dir = langConfig?.dir ?? 'ltr';
  document.documentElement.lang = lang;
}

export function getLanguageDir(lang: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr';
}

export default i18n;
