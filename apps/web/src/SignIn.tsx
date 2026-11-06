import { DEMO_ACCOUNTS } from './demo-accounts';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo, Settings } from './chrome';
import { auth, usesTestSignIn } from './firebase';

const WRONG = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];

/** The sign-in screen: centred, light or dark, with the language globe, as in today's app. */
export function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(WRONG.includes(code) ? t('signIn.wrong') : t('signIn.failed'));
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-s border border-bd2 bg-pn px-3 py-2 text-tx focus:border-brand';
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
            {t('signIn.title')}
          </h1>
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
          <label className="grid gap-1 text-sm font-medium">
            {t('signIn.password')}
            <input
              className={field}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-bad text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-m bg-brand text-on-brand font-semibold py-2.5 hover:brightness-95 disabled:opacity-60"
          >
            {busy ? t('signIn.busy') : t('signIn.submit')}
          </button>
          {usesTestSignIn && (
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
