import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorText } from './api';

interface PlatformCompany {
  id: string;
  name: string;
  createdAt: string;
  people: number;
  admins: number;
}

/** The platform owner area (only for the owner of Q-smart): all client companies, and a new one. */
export function Platform() {
  const { t, i18n } = useTranslation();
  const [companies, setCompanies] = useState<PlatformCompany[] | null>(null);
  const [name, setName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api<PlatformCompany[]>('/platform/companies').then(setCompanies, (e: unknown) =>
      setMessage({ ok: false, text: errorText(t, e) }),
    );
  }, [t]);
  useEffect(load, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api('/platform/companies', undefined, { body: { name, adminName, adminEmail } });
      setMessage({ ok: true, text: t('platform.created', { company: name, email: adminEmail }) });
      setName('');
      setAdminName('');
      setAdminEmail('');
      load();
    } catch (e) {
      setMessage({ ok: false, text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-s border border-bd2 bg-pn px-3 py-2 text-tx focus:border-brand';
  return (
    <section className="bg-pn border border-bd rounded-m p-5 grid gap-4" aria-labelledby="platform-title">
      <div>
        <h2 id="platform-title" className="font-display text-xl font-bold">
          {t('platform.title')}
        </h2>
        <p className="text-sm text-mu">{t('platform.intro')}</p>
      </div>
      {!companies && <p className="text-mu">{t('common.loading')}</p>}
      {companies && (
        <table className="w-full text-sm">
          <thead className="text-left text-mu">
            <tr>
              <th className="py-1 font-semibold">{t('platform.company')}</th>
              <th className="py-1 font-semibold">{t('platform.people')}</th>
              <th className="py-1 font-semibold">{t('platform.admins')}</th>
              <th className="py-1 font-semibold">{t('platform.since')}</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-t border-bd">
                <td className="py-2 font-semibold">{c.name}</td>
                <td className="py-2">{c.people}</td>
                <td className="py-2">{c.admins}</td>
                <td className="py-2">{new Date(c.createdAt).toLocaleDateString(i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-3 items-end border-t border-bd pt-4">
        <h3 className="sm:col-span-3 font-semibold">{t('platform.new')}</h3>
        <label className="grid gap-1 text-sm font-medium">
          {t('platform.company')}
          <input className={field} required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('platform.adminName')}
          <input
            className={field}
            required
            minLength={2}
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('platform.adminEmail')}
          <input
            className={field}
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="sm:col-span-3 justify-self-start rounded-m bg-brand text-on-brand font-semibold px-4 py-2 disabled:opacity-60"
        >
          {t('platform.create')}
        </button>
        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={`sm:col-span-3 text-sm ${message.ok ? 'text-ok' : 'text-bad'}`}
          >
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}
