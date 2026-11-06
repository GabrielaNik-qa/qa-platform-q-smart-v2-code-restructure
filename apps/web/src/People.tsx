// The people of a company (Admin › Users). Everyone sees the list; admins invite people and change roles, teams
// and accounts. The rules (staff in Administration, every agent in a team, admins keep their own access) are the
// server's; this page only shows the choices that make sense.
import { can, isStaff, ROLE_LABELS, ROLES, type Role } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';

export interface CompanyRef {
  id: string;
  name: string;
  role: Role;
}
export interface TeamRef {
  id: string;
  name: string;
  isAdministration: boolean;
}
interface PersonRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  active: boolean;
  accepted: boolean;
}

export function People({ company, teams, myEmail }: { company: CompanyRef; teams: TeamRef[]; myEmail: string | null }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const admin = can(company.role, 'people.manage');
  const agentTeams = teams.filter((x) => !x.isAdministration);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'agent' as Role, teamId: '' });

  const load = useCallback(() => {
    api<PersonRow[]>('/people', company.id).then(setPeople, (e: Error) => setMessage({ ok: false, text: e.message }));
  }, [company.id]);
  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: done });
      load();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }

  const change = (p: PersonRow, body: object) =>
    run(
      () => api(`/people/${p.membershipId}`, company.id, { method: 'PATCH', body }),
      t('people.saved', { name: p.name }),
    );

  async function invite(event: FormEvent) {
    event.preventDefault();
    const teamId = isStaff(form.role) ? undefined : form.teamId || agentTeams[0]?.id;
    await run(
      () => api('/people', company.id, { body: { name: form.name, email: form.email, role: form.role, teamId } }),
      t('people.invited', { email: form.email }),
    );
    setForm({ name: '', email: '', role: 'agent', teamId: '' });
  }

  const status = (p: PersonRow) =>
    !p.active ? t('people.off') : p.accepted ? t('people.active') : t('people.waiting');
  const field = 'rounded-s border border-bd2 bg-pn px-2 py-1.5 text-tx focus:border-brand';
  return (
    <section className="bg-pn border border-bd rounded-m p-5 grid gap-4" aria-labelledby="people-title">
      <h2 id="people-title" className="font-display text-xl font-bold">
        {t('people.title', { company: company.name })}
      </h2>
      {!people && <p className="text-mu">{t('common.loading')}</p>}
      {people && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-mu">
              <tr>
                <th className="py-1 pr-3 font-semibold">{t('people.name')}</th>
                <th className="py-1 pr-3 font-semibold">{t('people.role')}</th>
                <th className="py-1 pr-3 font-semibold">{t('people.team')}</th>
                <th className="py-1 pr-3 font-semibold">{t('people.status')}</th>
                {admin && <th className="py-1 font-semibold sr-only">{t('people.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const me = p.email === myEmail?.toLowerCase();
                return (
                  <tr key={p.membershipId} className={`border-t border-bd ${p.active ? '' : 'text-mu'}`}>
                    <td className="py-2 pr-3">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-mu">{p.email}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {admin && !me ? (
                        <select
                          className={field}
                          aria-label={t('people.roleOf', { name: p.name })}
                          value={p.role}
                          onChange={(e) =>
                            void change(p, { role: e.target.value, teamId: p.teamId ?? agentTeams[0]?.id })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[lang][r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ROLE_LABELS[lang][p.role]
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {admin && p.role === 'agent' ? (
                        <select
                          className={field}
                          aria-label={t('people.teamOf', { name: p.name })}
                          value={p.teamId ?? ''}
                          onChange={(e) => void change(p, { teamId: e.target.value })}
                        >
                          {agentTeams.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        p.teamName
                      )}
                    </td>
                    <td className="py-2 pr-3">{status(p)}</td>
                    {admin && (
                      <td className="py-2 whitespace-nowrap">
                        {!me && (
                          <>
                            <button
                              type="button"
                              className="rounded-s border border-bd px-2 py-1 text-xs font-semibold hover:border-tx mr-2"
                              onClick={() => void change(p, { active: !p.active })}
                            >
                              {p.active ? t('people.switchOff') : t('people.switchOn')}
                            </button>
                            <button
                              type="button"
                              className="rounded-s border border-bd px-2 py-1 text-xs font-semibold text-bad hover:border-bad"
                              onClick={() => {
                                // a question before removing anything is always asked (today's rule)
                                if (window.confirm(t('people.confirmRemove', { name: p.name, company: company.name })))
                                  void run(
                                    () => api(`/people/${p.membershipId}`, company.id, { method: 'DELETE' }),
                                    t('people.removed', { name: p.name }),
                                  );
                              }}
                            >
                              {t('people.remove')}
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {admin && (
        <form onSubmit={invite} className="grid gap-3 sm:grid-cols-4 items-end border-t border-bd pt-4">
          <h3 className="sm:col-span-4 font-semibold">{t('people.invite')}</h3>
          <label className="grid gap-1 text-sm font-medium">
            {t('people.name')}
            <input
              className={field}
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('signIn.email')}
            <input
              className={field}
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('people.role')}
            <select
              className={field}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[lang][r]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('people.team')}
            {isStaff(form.role) ? (
              <span className="py-1.5 text-mu">{t('people.staffInAdministration')}</span>
            ) : (
              <select
                className={field}
                value={form.teamId || agentTeams[0]?.id || ''}
                onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              >
                {agentTeams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <button
            type="submit"
            className="sm:col-span-4 justify-self-start rounded-m bg-brand text-on-brand font-semibold px-4 py-2"
          >
            {t('people.sendInvitation')}
          </button>
          <p className="sm:col-span-4 text-xs text-mu">{t('people.howInvitationsWork')}</p>
        </form>
      )}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-ok' : 'text-bad'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
