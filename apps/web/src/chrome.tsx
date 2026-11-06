// The small parts every page shares: the Q-smart mark, the language picker and the light/dark switch.
// Icons are drawn as lines, as in today's app (no emoji).
import { LANGUAGES, type Language } from '@qsmart/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, setLanguage } from './i18n';

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="15.5" cy="15.5" r="10.5" fill="none" stroke="#FF6B00" strokeWidth="4.6" />
        <path d="M22 22l7.5 7.5" stroke="#FFD447" strokeWidth="4.6" strokeLinecap="round" />
      </svg>
      <span className="font-display text-2xl font-bold tracking-wide uppercase">Q-smart</span>
    </span>
  );
}

const NAMES: Record<Language, string> = { en: 'English', bg: 'Български', fr: 'Français' };

export function LanguagePicker() {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Language>(currentLanguage);
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-mu">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
      <span className="sr-only">{t('common.language')}</span>
      <select
        className="bg-transparent text-tx rounded-s border border-bd px-1.5 py-1"
        value={lang}
        onChange={(e) => {
          const next = e.target.value as Language;
          setLanguage(next);
          setLang(next);
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

const THEME_KEY = 'qsmart.theme'; // a setting the person chose: strictly necessary (plan, section 13)

const shownTheme = (): 'light' | 'dark' => {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Puts back the light/dark choice saved on this computer (called once, before the first page shows). */
export function restoreTheme(): void {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch {
    // private window: follow the system setting
  }
}

export function ThemeSwitch() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(shownTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="inline-grid place-items-center size-9 rounded-s border border-bd text-tx hover:border-tx"
      title={t('common.lightDark')}
      aria-label={t('common.lightDark')}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // private window
        }
        setTheme(next);
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        )}
      </svg>
    </button>
  );
}

export function Settings() {
  return (
    <div className="flex items-center gap-2">
      <LanguagePicker />
      <ThemeSwitch />
    </div>
  );
}
