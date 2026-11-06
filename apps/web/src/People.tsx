// The people of a company (Admin › Users). Everyone sees the people of their own workspaces; admins invite people
// and change roles, teams, skills, workspaces and accounts. The rules (staff in Administration, every agent in a team,
// admins keep their own access) are the server's; this page only shows the choices that make sense.
import { can, isStaff, isWorkspaceStaff, ROLE_LABELS, ROLES, type Role } from '@qsmart/shared';
import { Fragment, type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';
import {
  CheckList,
  Chips,
  type CompanyRef,
  card,
  dangerButton,
  field,
  namesOf,
  Notice,
  type PersonRow,
  primaryButton,
  type SkillRow,
  smallButton,
  type TeamRow,
  useAction,
  type WorkspaceRow,
} from './ui';

export function People({ company, myEmail }: { company: CompanyRef; myEmail: string | null }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const admin = can(company.role, 'people.manage');
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'agent' as Role, teamId: '' });
  const [details, setDetails] = useState<{ id: string; skillIds: string[]; workspaceIds: string[] } | null>(null);
  const { message, run, fail } = useAction();
  const agentTeams = teams.filter((x) => !x.isAdministration);

  const load = useCallback(() => {
    void Promise.all([
      api<PersonRow[]>('/people', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<SkillRow[]>('/skills', company.id),
      api<WorkspaceRow[]>('/workspaces', company.id),
    ]).then(([personRows, teamRows, skillRows, workspaceRows]) => {
      setPeople(personRows);
      setTeams(teamRows);
      setSkills(skillRows);
      setWorkspaces(workspaceRows);
    }, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const change = (p: PersonRow, body: object) =>
    run(
      () => api(`/people/${p.membershipId}`, company.id, { method: 'PATCH', body }),
      t('people.saved', { name: p.name }),
      load,
    );

  async function invite(event: FormEvent) {
    event.preventDefault();
    const teamId = isStaff(form.role) ? undefined : form.teamId || agentTeams[0]?.id;
    const ok = await run(
      () => api('/people', company.id, { body: { name: form.name, email: form.email, role: form.role, teamId } }),
      t('people.invited', { email: form.email }),
      load,
    );
    if (ok) setForm({ name: '', email: '', role: 'agent', teamId: '' });
  }

  async function saveDetails(event: FormEvent, p: PersonRow) {
    event.preventDefault();
    if (!details) return;
    const ok = await change(p, {
      skillIds: details.skillIds,
      ...(isWorkspaceStaff(p.role) ? { workspaceIds: details.workspaceIds } : {}),
    });
    if (ok) setDetails(null);
  }

  const status = (p: PersonRow) =>
    !p.active ? t('people.off') : p.accepted ? t('people.active') : t('people.waiting');
  const skillOptions = (kind: SkillRow['kind']) =>
    skills.filter((s) => s.kind === kind).map((s) => ({ id: s.id, label: s.name }));
  const columns = admin ? 5 : 4;
  return (
    <section className={`${card} grid gap-4`} aria-labelledby="people-title">
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
                const open = details?.id === p.membershipId;
                return (
                  <Fragment key={p.membershipId}>
                    <tr className={`border-t border-bd align-top ${p.active ? '' : 'text-mu'}`}>
                      <td className="py-2 pr-3 grid gap-1">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-mu">{p.email}</div>
                        <Chips items={namesOf(p.skillIds, skills)} />
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
                          <button
                            type="button"
                            className={`${smallButton} mr-2`}
                            aria-expanded={open}
                            aria-label={t('people.detailsOf', { name: p.name })}
                            onClick={() =>
                              setDetails(
                                open
                                  ? null
                                  : { id: p.membershipId, skillIds: p.skillIds, workspaceIds: p.workspaceIds },
                              )
                            }
                          >
                            {t('people.details')}
                          </button>
                          {!me && (
                            <>
                              <button
                                type="button"
                                className={`${smallButton} mr-2`}
                                onClick={() => void change(p, { active: !p.active })}
                              >
                                {p.active ? t('people.switchOff') : t('people.switchOn')}
                              </button>
                              <button
                                type="button"
                                className={dangerButton}
                                onClick={() => {
                                  // a question before removing anything is always asked (today's rule)
                                  if (
                                    window.confirm(t('people.confirmRemove', { name: p.name, company: company.name }))
                                  )
                                    void run(
                                      () => api(`/people/${p.membershipId}`, company.id, { method: 'DELETE' }),
                                      t('people.removed', { name: p.name }),
                                      load,
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
                    {open && details && (
                      <tr>
                        <td colSpan={columns} className="pb-4">
                          <form
                            onSubmit={(e) => void saveDetails(e, p)}
                            className="grid gap-3 rounded-m border border-bd bg-pn2 p-4"
                            aria-label={t('people.detailsOf', { name: p.name })}
                          >
                            <CheckList
                              legend={t('fields.skills')}
                              options={skillOptions('skill')}
                              value={details.skillIds}
                              onChange={(skillIds) => setDetails({ ...details, skillIds })}
                            />
                            <CheckList
                              legend={t('fields.languages')}
                              options={skillOptions('language')}
                              value={details.skillIds}
                              onChange={(skillIds) => setDetails({ ...details, skillIds })}
                            />
                            {isWorkspaceStaff(p.role) ? (
                              <div className="grid gap-1">
                                <CheckList
                                  legend={t('people.workspaces')}
                                  options={workspaces.map((w) => ({ id: w.id, label: w.name }))}
                                  value={details.workspaceIds}
                                  onChange={(workspaceIds) => setDetails({ ...details, workspaceIds })}
                                />
                                <p className="text-xs text-mu">{t('people.firstWorkspace')}</p>
                              </div>
                            ) : (
                              p.role === 'agent' && (
                                <div className="grid gap-1 text-sm">
                                  <span className="font-medium">{t('people.workspaces')}</span>
                                  <Chips items={namesOf(p.workspaceIds, workspaces)} />
                                  <p className="text-xs text-mu">{t('people.agentWorkspaces')}</p>
                                </div>
                              )
                            )}
                            <div className="flex gap-2">
                              <button type="submit" className={primaryButton}>
                                {t('common.save')}
                              </button>
                              <button type="button" className={smallButton} onClick={() => setDetails(null)}>
                                {t('common.cancel')}
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
          <button type="submit" className={`sm:col-span-4 justify-self-start ${primaryButton}`}>
            {t('people.sendInvitation')}
          </button>
          <p className="sm:col-span-4 text-xs text-mu">{t('people.howInvitationsWork')}</p>
        </form>
      )}
      <Notice message={message} />
    </section>
  );
}
