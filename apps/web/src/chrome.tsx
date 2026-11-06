// The small parts every page shares: the Q-smart mark and big logo, the language pickers and the light/dark switches.
// Icons are drawn as lines, as in today's app (no emoji).
import { LANGUAGES, type Language } from '@qsmart/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, setLanguage } from './i18n';

/** Today's small mark: the Q ring with its yellow tail (current-app/public/js/core.js, `mark`). */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="15.5" cy="15.5" r="10.5" fill="none" style={{ stroke: 'var(--brand)' }} strokeWidth="4.6" />
      <path d="M22 22l7.5 7.5" stroke="#FFD447" strokeWidth="4.6" strokeLinecap="round" />
    </svg>
  );
}

/** Today's big sign-in logo: the Q ring with sound waves going out to both sides (current-app/public/js/main.js). */
export function BigLogo() {
  return (
    <svg viewBox="0 0 480 130" width="100%" style={{ maxWidth: 560 }} aria-hidden="true">
      <defs>
        <linearGradient id="qs-lq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB020" />
          <stop offset=".55" stopColor="#FF6B00" />
          <stop offset="1" stopColor="#FF5C8A" />
        </linearGradient>
        <linearGradient id="qs-lr" gradientUnits="userSpaceOnUse" x1="340" y1="0" x2="476" y2="0">
          <stop offset="0" stopColor="#FF6B00" />
          <stop offset="1" stopColor="#FF6B00" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="qs-ll" gradientUnits="userSpaceOnUse" x1="140" y1="0" x2="4" y2="0">
          <stop offset="0" stopColor="#FF6B00" />
          <stop offset="1" stopColor="#FF6B00" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round">
        <path d="M298,42 Q308,62 298,82" stroke="#FFD447" strokeWidth="6" />
        <path d="M314,32 Q328,62 314,92" stroke="#FF9A1F" strokeWidth="6" />
        <path d="M330,24 Q348,62 330,100" stroke="#FF6B00" strokeWidth="6" />
        <path d="M182,42 Q172,62 182,82" stroke="#FFD447" strokeWidth="6" />
        <path d="M166,32 Q152,62 166,92" stroke="#FF9A1F" strokeWidth="6" />
        <path d="M150,24 Q132,62 150,100" stroke="#FF5C8A" strokeWidth="6" />
        <path
          d="M352,62 q8,-16 16,0 q8,12 16,0 q8,-9 16,0 q8,6 16,0 q8,-4 16,0 q8,2 16,0 L476,62"
          stroke="url(#qs-lr)"
          strokeWidth="3"
        />
        <path
          d="M128,62 q-8,-16 -16,0 q-8,12 -16,0 q-8,-9 -16,0 q-8,6 -16,0 q-8,-4 -16,0 q-8,2 -16,0 L4,62"
          stroke="url(#qs-ll)"
          strokeWidth="3"
        />
      </g>
      <circle cx="240" cy="62" r="40" fill="none" stroke="url(#qs-lq)" strokeWidth="10" />
      <path d="M266,90 L286,110" stroke="#FF5C8A" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

/** Today's line icons (current-app/public/js/core.js, `IC`). */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const MoonIcon = () => (
  <Icon>
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </Icon>
);
export const EyeIcon = () => (
  <Icon>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
const GlobeIcon = ({ size }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </svg>
);

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} />
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
      <GlobeIcon size={18} />
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

/** Today's round language globe on the sign-in screen, with the language's code on it and the list below. */
export function RoundLanguageMenu() {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Language>(currentLanguage);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // a click anywhere else closes the list
    const close = (event: MouseEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <details className="lglang" ref={menu}>
      <summary className="lgic" aria-label={t('common.languageIs', { name: NAMES[lang] })} title={t('common.language')}>
        <GlobeIcon />
        <span>{lang.toUpperCase()}</span>
      </summary>
      <div className="lglangl">
        {LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            className={l === lang ? 'on' : ''}
            onClick={() => {
              setLanguage(l);
              setLang(l);
              if (menu.current) menu.current.open = false;
            }}
          >
            {NAMES[l]}
          </button>
        ))}
      </div>
    </details>
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

export type ThemeMode = 'light' | 'dark' | 'system';

const chosenMode = (): ThemeMode => {
  const chosen = document.documentElement.dataset.theme;
  return chosen === 'light' || chosen === 'dark' ? chosen : 'system';
};

/** Today's three choices (menu and My account › Appearance): light, dark, or the computer's setting. */
export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(chosenMode);
  useEffect(() => {
    // another switch on the page changed it
    const watch = new MutationObserver(() => setMode(chosenMode()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);
  const choose = (next: ThemeMode) => {
    try {
      if (next === 'system') {
        delete document.documentElement.dataset.theme;
        localStorage.removeItem(THEME_KEY);
      } else {
        document.documentElement.dataset.theme = next;
        localStorage.setItem(THEME_KEY, next);
      }
    } catch {
      // private window: the choice lasts until the page closes
    }
    setMode(next);
  };
  return { mode, choose };
}

/** The light or dark mode shown, and a way to switch it (the choice is kept on this computer). */
function useTheme() {
  const [theme, setTheme] = useState(shownTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // private window
    }
    setTheme(next);
  };
  return { theme, toggle };
}

/** Today's round light/dark button on the sign-in screen: it shows what it switches to. */
export function RoundThemeButton() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? t('common.lightMode') : t('common.darkMode');
  return (
    <button type="button" className="lgic" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function ThemeSwitch() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="inline-grid place-items-center size-9 rounded-s border border-bd text-tx hover:border-tx"
      title={t('common.lightDark')}
      aria-label={t('common.lightDark')}
      onClick={toggle}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
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
