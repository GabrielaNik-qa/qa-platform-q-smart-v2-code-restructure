import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BigLogo, EyeIcon, Mark, RoundLanguageMenu, RoundThemeButton } from './chrome';
import { DEMO_ACCOUNTS } from './demo-accounts';
import { auth, usesTestSignIn } from './firebase';
import { QLoader } from './QLoader';
import './signin.css';

const WRONG = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];
/** As in today's app: at least 10 characters. */
export const MIN_PASSWORD = 10;

type Mode = 'signIn' | 'create' | 'forgot';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
    />
  </svg>
);

/**
 * The sign-in screen, as today's (4 November): the Q-SMART name, the light/dark switch and the language globe on top;
 * the big Q logo with sound waves; a warm card in light mode, the dark stage in dark mode; the heartbeat after
 * "Sign in". New in v2: invited people without Google create their own password (Firebase then checks their e-mail),
 * and "Sign in with Google"; both look like today's "Register" button.
 */
export function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'signIn') await signInWithEmailAndPassword(auth, email.trim(), password);
      else if (mode === 'forgot') {
        // the same answer whether the account exists or not, so nobody can find out who has one
        await sendPasswordResetEmail(auth, email.trim()).catch(() => undefined);
        setInfo(t('signIn.resetSent'));
      } else {
        if (password.length < MIN_PASSWORD) {
          setError(t('signIn.passwordRule', { count: MIN_PASSWORD }));
          return;
        }
        const created = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(created.user);
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/email-already-in-use') setError(t('signIn.alreadyHasAccount'));
      else if (code === 'auth/weak-password') setError(t('signIn.passwordRule', { count: MIN_PASSWORD }));
      else setError(WRONG.includes(code) ? t('signIn.wrong') : t('signIn.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      // closing Google's window is not an error
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setError(t('signIn.failed'));
    } finally {
      setBusy(false);
    }
  }

  const title = { signIn: t('signIn.title'), create: t('signIn.createTitle'), forgot: t('signIn.forgotTitle') }[mode];
  const submitText = { signIn: t('signIn.submit'), create: t('signIn.createSubmit'), forgot: t('signIn.forgotSubmit') }[
    mode
  ];
  const intro = { signIn: '', create: t('signIn.createIntro'), forgot: t('signIn.forgotIntro') }[mode];
  return (
    <div className="lg">
      <header className="lgtop">
        <div className="lgb">
          <Mark size={30} />
          <b>Q-SMART</b>
        </div>
        <div className="lgtools">
          <RoundThemeButton />
          <RoundLanguageMenu />
        </div>
      </header>
      <main className="lgc">
        <div className="lgw">
          <BigLogo />
        </div>
        <form className="lgf" onSubmit={submit} aria-labelledby="sign-in-title">
          <h1 id="sign-in-title">{title}</h1>
          {intro && <p className="lgs">{intro}</p>}
          <label>
            {t('signIn.email')}
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== 'forgot' && (
            <label>
              {t('signIn.password')}
              <div className="pw">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  required
                  minLength={mode === 'create' ? MIN_PASSWORD : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="eye"
                  aria-label={t('signIn.showPassword')}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <EyeIcon />
                </button>
              </div>
              {mode === 'create' && <small className="rule">{t('signIn.passwordRule', { count: MIN_PASSWORD })}</small>}
            </label>
          )}
          {info && (
            <small className="lgok" role="status">
              {info}
            </small>
          )}
          <div role="alert">{error && <small className="lgerr">{error}</small>}</div>
          <button type="submit" className="sbtn" disabled={busy}>
            {busy ? t('signIn.busy') : submitText}
          </button>
          {mode === 'signIn' ? (
            <button type="button" className="lgk" onClick={() => go('forgot')}>
              {t('signIn.forgot')}
            </button>
          ) : (
            <button type="button" className="lgk" onClick={() => go('signIn')}>
              {t('signIn.back')}
            </button>
          )}
          {mode === 'signIn' && (
            <button type="button" className="rgb" onClick={() => go('create')}>
              {t('signIn.newHere')}
            </button>
          )}
          {mode !== 'forgot' && (
            <>
              <div className="lgor" aria-hidden="true">
                {t('signIn.or')}
              </div>
              <button type="button" className="rgb" disabled={busy} onClick={() => void withGoogle()}>
                <GoogleIcon />
                {t('signIn.google')}
              </button>
            </>
          )}
          {usesTestSignIn && mode === 'signIn' && (
            <div className="lgnote">
              <p>{t('signIn.testAccounts', { accounts: DEMO_ACCOUNTS.join(', '), password: 'password' })}</p>
            </div>
          )}
        </form>
      </main>
      <footer className="lgfoot">
        <span>© {new Date().getFullYear()} Q-smart</span>
      </footer>
      {/* today's heartbeat from "Sign in" until the first page is ready (the home page takes it over) */}
      <QLoader on={busy && mode === 'signIn'} />
    </div>
  );
}
