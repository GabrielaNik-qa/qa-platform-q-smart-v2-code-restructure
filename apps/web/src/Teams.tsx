// The teams of a company (Admin › Teams). Everyone sees the teams of their own workspaces; admins add, change and
// delete teams. The rules (a lead for every working team, Administration can't go, …) are the server's.
import { can, isStaff, ROLE_LABELS } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';
import {
  card,
  CheckList,
  Chips,
  type CompanyRef,
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

interface Draft {
  name: string;
  description: string;
  color: string;
  leadId: string;
  skillIds: string[];
  workspaceId: string;
}
const EMPTY: Draft = { name: '', description: '', color: '#2563eb', leadId: '', skillIds: [], workspaceId: '' };

export function Teams({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const admin = can(company.role, 'people.manage');
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [editing, setEditing] = useState<TeamRow | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<TeamRow[]>('/teams', company.id),
      api<SkillRow[]>('/skills', company.id),
      api<WorkspaceRow[]>('/workspaces', company.id),
      api<PersonRow[]>('/people', company.id),
    ]).then(
      ([teamRows, skillRows, workspaceRows, personRows]) => {
        setTeams(teamRows);
        setSkills(skillRows);
        setWorkspaces(workspaceRows);
        setPeople(personRows);
      },
      (e: unknown) => fail(e),
    );
  }, [company.id, fail]);
  useEffect(load, [load]);

  const leads = people.filter((p) => isStaff(p.role) && p.active);
  const skillOptions = (kind: SkillRow['kind']) =>
    skills.filter((s) => s.kind === kind).map((s) => ({ id: s.id, label: s.name }));

  function open(team: TeamRow | 'new') {
    setEditing(team);
    setDraft(
      team === 'new'
        ? { ...EMPTY, workspaceId: workspaces[0]?.id ?? '' }
        : {
            name: team.name,
            description: team.description,
            color: team.color,
            leadId: team.leadId ?? '',
            skillIds: team.skillIds,
            workspaceId: '',
          },
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const body = {
      name: draft.name,
      description: draft.description,
      color: draft.color,
      leadId: draft.leadId || null,
      skillIds: draft.skillIds,
      ...(editing === 'new' && draft.workspaceId ? { workspaceId: draft.workspaceId } : {}),
    };
    const ok = await run(
      () =>
        editing === 'new'
          ? api('/teams', company.id, { body })
          : api(`/teams/${editing.id}`, company.id, { method: 'PUT', body }),
      t('teams.saved', { name: draft.name }),
      load,
    );
    if (ok) setEditing(null);
  }

  const editor = editing && (
    <form onSubmit={save} className={`${card} grid gap-3`} aria-labelledby="team-editor-title">
      <h3 id="team-editor-title" className="font-display text-lg font-bold">
        {editing === 'new' ? t('teams.new') : t('teams.editTitle', { name: editing.name })}
      </h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm font-medium">
          {t('fields.name')}
          <input
            className={field}
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('fields.color')}
          <input
            type="color"
            className="h-9 w-16 rounded-s border border-bd2 bg-pn"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        {t('fields.description')}
        <textarea
          className={field}
          rows={2}
          maxLength={600}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          {t('teams.lead')}
          <select
            className={field}
            value={draft.leadId}
            onChange={(e) => setDraft({ ...draft, leadId: e.target.value })}
          >
            <option value="">{t('teams.chooseLead')}</option>
            {leads.map((p) => (
              <option key={p.membershipId} value={p.membershipId}>
                {p.name} · {ROLE_LABELS[lang][p.role]}
              </option>
            ))}
          </select>
        </label>
        {editing === 'new' && workspaces.length > 0 && (
          <label className="grid gap-1 text-sm font-medium">
            {t('teams.workspace')}
            <select
              className={field}
              value={draft.workspaceId}
              onChange={(e) => setDraft({ ...draft, workspaceId: e.target.value })}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <CheckList
        legend={t('fields.skills')}
        options={skillOptions('skill')}
        value={draft.skillIds}
        onChange={(skillIds) => setDraft({ ...draft, skillIds })}
      />
      <CheckList
        legend={t('fields.languages')}
        options={skillOptions('language')}
        value={draft.skillIds}
        onChange={(skillIds) => setDraft({ ...draft, skillIds })}
      />
      <div className="flex gap-2">
        <button type="submit" className={primaryButton}>
          {t('common.save')}
        </button>
        <button type="button" className={smallButton} onClick={() => setEditing(null)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );

  return (
    <section className="grid gap-4" aria-labelledby="teams-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="teams-title" className="font-display text-xl font-bold">
          {t('teams.title', { company: company.name })}
        </h2>
        {admin && !editing && (
          <button type="button" className={primaryButton} onClick={() => open('new')}>
            {t('teams.new')}
          </button>
        )}
      </div>
      <Notice message={message} />
      {editing === 'new' && editor}
      {!teams && <p className="text-mu">{t('common.loading')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {teams?.map((team) =>
          editing !== 'new' && editing?.id === team.id ? (
            <li key={team.id} className="sm:col-span-2">
              {editor}
            </li>
          ) : (
            <li
              key={team.id}
              className={`${card} grid gap-2 content-start border-l-4`}
              style={{ borderLeftColor: team.color }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-lg">{team.name}</h3>
                {team.isAdministration && (
                  <span className="rounded-full bg-yellow px-2 text-xs font-semibold text-ink">
                    {t('teams.staffTeam')}
                  </span>
                )}
              </div>
              {team.description && <p className="text-sm text-mu">{team.description}</p>}
              <p className="text-sm">
                {team.leadName
                  ? t('teams.leadIs', { name: team.leadName })
                  : !team.isAdministration && <span className="text-wn font-semibold">{t('teams.noLead')}</span>}
              </p>
              <p className="text-sm text-mu">{t('teams.members', { count: team.members })}</p>
              <Chips items={namesOf(team.skillIds, skills)} />
              {team.isAdministration && <p className="text-xs text-mu">{t('teams.administrationNote')}</p>}
              {admin && !editing && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className={smallButton}
                    aria-label={t('teams.editOf', { name: team.name })}
                    onClick={() => open(team)}
                  >
                    {t('common.edit')}
                  </button>
                  {!team.isAdministration && (
                    <button
                      type="button"
                      className={dangerButton}
                      aria-label={t('teams.deleteOf', { name: team.name })}
                      onClick={() => {
                        if (window.confirm(t('teams.confirmDelete', { name: team.name })))
                          void run(
                            () => api(`/teams/${team.id}`, company.id, { method: 'DELETE' }),
                            t('teams.deleted', { name: team.name }),
                            load,
                          );
                      }}
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
