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
import { Logo, Settings } from './chrome';
import { DEMO_ACCOUNTS } from './demo-accounts';
import { auth, usesTestSignIn } from './firebase';

const WRONG = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];
/** As in today's app: at least 10 characters. */
export const MIN_PASSWORD = 10;

type Mode = 'signIn' | 'create' | 'forgot';

/** The sign-in screen: centred, light or dark, with the language globe, as in today's app.
 *  Invited people without Google create their own password here; Firebase then checks their e-mail. */
export function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const field = 'w-full rounded-s border border-bd2 bg-pn px-3 py-2 text-tx focus:border-brand';
  const link = 'text-sm text-ac font-semibold hover:underline justify-self-start';
  const title = { signIn: t('signIn.title'), create: t('signIn.createTitle'), forgot: t('signIn.forgotTitle') }[mode];
  const submitText = { signIn: t('signIn.submit'), create: t('signIn.createSubmit'), forgot: t('signIn.forgotSubmit') }[
    mode
  ];
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-end p-4">
        <Settings />
      </div>
      <main className="flex-1 grid place-items-center px-4 pb-16">
        <form
          onSubmit={submit}
          aria-labelledby="sign-in-title"
          className="w-full max-w-sm bg-pn border border-bd rounded-l p-8 shadow-card grid gap-4"
        >
          <Logo />
          <h1 id="sign-in-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {title}
          </h1>
          {mode === 'create' && <p className="text-sm text-mu">{t('signIn.createIntro')}</p>}
          {mode === 'forgot' && <p className="text-sm text-mu">{t('signIn.forgotIntro')}</p>}
          <label className="grid gap-1 text-sm font-medium">
            {t('signIn.email')}
            <input
              className={field}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== 'forgot' && (
            <label className="grid gap-1 text-sm font-medium">
              {t('signIn.password')}
              <input
                className={field}
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'create' ? MIN_PASSWORD : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'create' && (
                <span className="text-xs text-mu font-normal">{t('signIn.passwordRule', { count: MIN_PASSWORD })}</span>
              )}
            </label>
          )}
          {error && (
            <p role="alert" className="text-bad text-sm">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="text-ok text-sm">
              {info}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-m bg-brand text-on-brand font-semibold py-2.5 hover:brightness-95 disabled:opacity-60"
          >
            {busy ? t('signIn.busy') : submitText}
          </button>
          {mode === 'signIn' ? (
            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" className={link} onClick={() => go('forgot')}>
                {t('signIn.forgot')}
              </button>
              <button type="button" className={link} onClick={() => go('create')}>
                {t('signIn.newHere')}
              </button>
            </div>
          ) : (
            <button type="button" className={link} onClick={() => go('signIn')}>
              {t('signIn.back')}
            </button>
          )}
          {mode !== 'forgot' && (
            <>
              <div className="flex items-center gap-3 text-xs text-mu" aria-hidden="true">
                <span className="h-px flex-1 bg-bd" />
                {t('signIn.or')}
                <span className="h-px flex-1 bg-bd" />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void withGoogle()}
                className="flex items-center justify-center gap-2 rounded-m border border-bd2 bg-pn py-2.5 font-semibold hover:border-tx disabled:opacity-60"
              >
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
                {t('signIn.google')}
              </button>
            </>
          )}
          {usesTestSignIn && mode === 'signIn' && (
            <p className="text-xs text-mu">
              {t('signIn.testAccounts', { accounts: DEMO_ACCOUNTS.join(', '), password: 'password' })}
            </p>
          )}
        </form>
      </main>
      <p className="text-center text-xs text-mu pb-4">{t('common.preview')}</p>
    </div>
  );
}
