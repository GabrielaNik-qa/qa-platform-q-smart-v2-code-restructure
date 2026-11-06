// The workspaces of a company (Admin › Workspaces). Admins see and change them all; everyone else sees their own.
// A workspace groups working teams with their reviewers, team leads and trainers (the server keeps only those).
import { can, isWorkspaceStaff, ROLE_LABELS } from '@qsmart/shared';
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
  smallButton,
  type TeamRow,
  useAction,
  type WorkspaceRow,
} from './ui';

type Draft = Omit<WorkspaceRow, 'id'>;
const EMPTY: Draft = { name: '', description: '', color: '#0d9488', teamIds: [], staffIds: [], scorecardIds: [] };

export function Workspaces({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const admin = can(company.role, 'people.manage');
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[] | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [scorecards, setScorecards] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<WorkspaceRow | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<WorkspaceRow[]>('/workspaces', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<PersonRow[]>('/people', company.id),
      api<{ id: string; name: string }[]>('/scorecards', company.id),
    ]).then(([workspaceRows, teamRows, personRows, cards]) => {
      setWorkspaces(workspaceRows);
      setTeams(teamRows);
      setPeople(personRows);
      setScorecards(cards);
    }, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const staffNames = (ids: string[]) =>
    people.filter((p) => ids.includes(p.membershipId)).map((p) => `${p.name} · ${ROLE_LABELS[lang][p.role]}`);

  function open(workspace: WorkspaceRow | 'new') {
    setEditing(workspace);
    setDraft(workspace === 'new' ? EMPTY : { ...workspace });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const ok = await run(
      () =>
        editing === 'new'
          ? api('/workspaces', company.id, { body: draft })
          : api(`/workspaces/${editing.id}`, company.id, { method: 'PUT', body: draft }),
      t('workspaces.saved', { name: draft.name }),
      load,
    );
    if (ok) setEditing(null);
  }

  const editor = editing && (
    <form onSubmit={save} className={`${card} grid gap-3`} aria-labelledby="workspace-editor-title">
      <h3 id="workspace-editor-title" className="font-display text-lg font-bold">
        {editing === 'new' ? t('workspaces.new') : t('workspaces.editTitle', { name: editing.name })}
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
          maxLength={400}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <CheckList
        legend={t('workspaces.teams')}
        options={teams.filter((x) => !x.isAdministration).map((x) => ({ id: x.id, label: x.name }))}
        value={draft.teamIds}
        onChange={(teamIds) => setDraft({ ...draft, teamIds })}
      />
      <CheckList
        legend={t('workspaces.staff')}
        options={people
          .filter((p) => isWorkspaceStaff(p.role))
          .map((p) => ({ id: p.membershipId, label: `${p.name} · ${ROLE_LABELS[lang][p.role]}` }))}
        value={draft.staffIds}
        onChange={(staffIds) => setDraft({ ...draft, staffIds })}
      />
      <CheckList
        legend={t('quality.scorecardsUsedHere')}
        options={scorecards.map((s) => ({ id: s.id, label: s.name }))}
        value={draft.scorecardIds}
        onChange={(scorecardIds) => setDraft({ ...draft, scorecardIds })}
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
    <section className="grid gap-4" aria-labelledby="workspaces-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="workspaces-title" className="font-display text-xl font-bold">
          {t('workspaces.title', { company: company.name })}
        </h2>
        {admin && !editing && (
          <button type="button" className={primaryButton} onClick={() => open('new')}>
            {t('workspaces.new')}
          </button>
        )}
      </div>
      <p className="text-sm text-mu">{t('workspaces.intro')}</p>
      <Notice message={message} />
      {editing === 'new' && editor}
      {!workspaces && <p className="text-mu">{t('common.loading')}</p>}
      {workspaces?.length === 0 && <p className="text-mu">{t('workspaces.noneYet')}</p>}
      <ul className="grid gap-3">
        {workspaces?.map((w) =>
          editing !== 'new' && editing?.id === w.id ? (
            <li key={w.id}>{editor}</li>
          ) : (
            <li key={w.id} className={`${card} grid gap-2 border-l-4`} style={{ borderLeftColor: w.color }}>
              <h3 className="font-semibold text-lg">{w.name}</h3>
              {w.description && <p className="text-sm text-mu">{w.description}</p>}
              <div className="grid gap-1">
                <span className="text-sm text-mu">{t('workspaces.teams')}</span>
                {w.teamIds.length ? (
                  <Chips items={namesOf(w.teamIds, teams)} />
                ) : (
                  <span className="text-sm">{t('common.none')}</span>
                )}
              </div>
              <div className="grid gap-1">
                <span className="text-sm text-mu">{t('workspaces.staff')}</span>
                {w.staffIds.length ? (
                  <Chips items={staffNames(w.staffIds)} />
                ) : (
                  <span className="text-sm">{t('common.none')}</span>
                )}
              </div>
              {w.scorecardIds.length > 0 && (
                <div className="grid gap-1">
                  <span className="text-sm text-mu">{t('quality.scorecardsUsedHere')}</span>
                  <Chips items={namesOf(w.scorecardIds, scorecards)} />
                </div>
              )}
              {admin && !editing && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className={smallButton}
                    aria-label={t('workspaces.editOf', { name: w.name })}
                    onClick={() => open(w)}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className={dangerButton}
                    aria-label={t('workspaces.deleteOf', { name: w.name })}
                    onClick={() => {
                      if (window.confirm(t('workspaces.confirmDelete', { name: w.name })))
                        void run(
                          () => api(`/workspaces/${w.id}`, company.id, { method: 'DELETE' }),
                          t('workspaces.deleted', { name: w.name }),
                          load,
                        );
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
