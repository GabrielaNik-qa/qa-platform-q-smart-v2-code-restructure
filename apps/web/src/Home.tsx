// After sign-in: loads who you are and your companies (with today's heartbeat), then opens the app (the menu as apps).
// Before that, two simple screens: confirming the e-mail of an invitation, and "no company yet".
import { RouterProvider } from '@tanstack/react-router';
import type { User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorText } from './api';
import { Logo, Settings } from './chrome';
import { currentLanguage, setLanguage } from './i18n';
import { QLoader, useAtLeast } from './QLoader';
import { router } from './router';
import { type Me, type Session, SessionContext, signOutAndClear } from './session';
import { VerifyEmail } from './VerifyEmail';

export function Home({ user }: { user: User }) {
  const { t } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // today's heartbeat until the first page is ready: a full beat at least, so it never flickers
  const loading = useAtLeast(!me && !error, 1600);

  const loadMe = useCallback(() => {
    api<Me>('/me').then(setMe, (e: unknown) => setError(errorText(t, e)));
  }, [t]);
  useEffect(loadMe, [loadMe]);

  // the language is saved with the account (docs/i18n-glossary.md): the saved one is used; with none saved yet, the
  // one shown now (picked on the sign-in screen, or English) is saved
  const savedLanguage = me?.language;
  useEffect(() => {
    if (me === null) return;
    if (savedLanguage) {
      if (savedLanguage !== currentLanguage()) setLanguage(savedLanguage);
    } else
      void api('/me', undefined, { method: 'PATCH', body: { language: currentLanguage() } }).catch(() => undefined);
  }, [me, savedLanguage]);

  const session = useMemo<Session | null>(() => {
    if (!me) return null;
    const company = me.companies.find((c) => c.id === companyId) ?? me.companies[0] ?? null;
    return { user, me, company, setCompany: setCompanyId, reloadMe: loadMe };
  }, [me, companyId, user, loadMe]);

  const ready = session && (session.company || me?.platformAdmin);
  if (ready)
    return (
      <SessionContext.Provider value={session}>
        <RouterProvider router={router} />
        <QLoader on={loading} />
      </SessionContext.Provider>
    );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-bd bg-pn px-6 py-3">
        <Logo size={28} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-mu">{me?.email ?? user.email}</span>
          <Settings />
          <button
            type="button"
            className="rounded-s border border-bd px-3 py-1.5 text-sm font-semibold hover:border-tx"
            onClick={() => void signOutAndClear()}
          >
            {t('home.signOut')}
          </button>
        </div>
      </header>
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 grid gap-6 content-start">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('home.welcome', { name: me?.name ?? user.email ?? '' })}
        </h1>
        {error && (
          <p role="alert" className="text-bad">
            {t('common.error', { message: error })}
          </p>
        )}
        {me && !user.emailVerified && <VerifyEmail user={user} onConfirmed={loadMe} />}
        {me && user.emailVerified && (
          <p className="bg-pn border border-bd rounded-m p-5 text-mu">{t('home.noCompanies')}</p>
        )}
      </main>
      <QLoader on={loading} />
    </div>
  );
}
