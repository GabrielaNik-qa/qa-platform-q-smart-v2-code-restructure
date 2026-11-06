import { LANGUAGES, type Language } from '@qsmart/shared';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { messages } from './messages';

const KEY = 'qsmart.lang'; // a setting the person chose: strictly necessary, so no consent needed (plan, section 13)

const isLanguage = (value: string | null | undefined): value is Language =>
  (LANGUAGES as readonly string[]).includes(value ?? '');

function savedLanguage(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const saved = savedLanguage();
const fromBrowser = navigator.language.slice(0, 2);
const initial: Language = isLanguage(saved) ? saved : isLanguage(fromBrowser) ? fromBrowser : 'en';
document.documentElement.lang = initial;

void i18next.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map((lang) => [lang, { translation: messages[lang] }])),
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes everything it writes into the page
});

export function setLanguage(lang: Language): void {
  void i18next.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // private window: the choice lasts until the page is closed
  }
}

export const currentLanguage = (): Language => (isLanguage(i18next.language) ? i18next.language : 'en');
