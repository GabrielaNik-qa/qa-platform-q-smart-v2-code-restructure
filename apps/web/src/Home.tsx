import { ROLE_LABELS, type Role } from '@qsmart/shared';
import { signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Logo, Settings } from './chrome';
import { auth } from './firebase';
import { currentLanguage } from './i18n';
import { Platform } from './Platform';

interface Company {
  id: string;
  name: string;
  role: Role;
}
interface Me {
  email: string | null;
  name: string | null;
  platformAdmin: boolean;
  companies: Company[];
}
interface Team {
  id: string;
  name: string;
  isAdministration: boolean;
}

/** The first page after sign-in: who you are, your companies, and a company's teams (read behind the company wall). */
export function Home({ user }: { user: User }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const [me, setMe] = useState<Me | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Me>('/me').then(setMe, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!company) return;
    setTeams(null);
    api<Team[]>('/teams', company.id).then(setTeams, (e: Error) => setError(e.message));
  }, [company]);

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
            onClick={() => void signOut(auth)}
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

        {me?.platformAdmin && <Platform />}

        <section className="bg-pn border border-bd rounded-m p-5" aria-labelledby="companies-title">
          <h2 id="companies-title" className="font-display text-xl font-bold mb-3">
            {t('home.companies')}
          </h2>
          {!me && <p className="text-mu">{t('common.loading')}</p>}
          {me && me.companies.length === 0 && <p className="text-mu">{t('home.noCompanies')}</p>}
          <ul className="grid gap-2">
            {me?.companies.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={company?.id === c.id}
                  onClick={() => setCompany(c)}
                  className={`w-full flex items-center justify-between rounded-s border px-4 py-3 text-left hover:border-tx ${
                    company?.id === c.id ? 'border-brand bg-pn2' : 'border-bd'
                  }`}
                >
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-sm text-ac font-semibold uppercase tracking-wide">
                    {ROLE_LABELS[lang][c.role]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={`bg-pn border border-bd rounded-m p-5 ${me && me.companies.length === 0 ? 'hidden' : ''}`}
          aria-live="polite"
        >
          {!company && <p className="text-mu">{t('home.choose')}</p>}
          {company && (
            <>
              <h2 className="font-display text-xl font-bold mb-3">{t('home.teams', { company: company.name })}</h2>
              {!teams && <p className="text-mu">{t('common.loading')}</p>}
              <ul className="grid gap-1">
                {teams?.map((team) => (
                  <li key={team.id} className="flex items-center gap-2 border-b border-bd py-2 last:border-0">
                    {team.name}
                    {team.isAdministration && (
                      <span className="rounded-full bg-yellow px-2 text-xs font-semibold text-ink">
                        {t('home.staffTeam')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
      <p className="text-center text-xs text-mu pb-4">{t('common.preview')}</p>
    </div>
  );
}
