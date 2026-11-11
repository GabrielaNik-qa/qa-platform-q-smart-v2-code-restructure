// Quality set-up, as today: the categories library (admins change it; reviewers read it), root causes (admins and
// reviewers change them) and System settings (pass rates, admins).
import { can, type ScorecardQuestion } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { TranscriptDaysCard } from './Conversations';
import { emptyQuestion, type LibraryRow, QuestionsEditor } from './Scorecards';
import {
  card,
  type CompanyRef,
  dangerButton,
  field,
  Notice,
  primaryButton,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

const header = (title: string, intro: string, action?: React.ReactNode) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="grid gap-1">
      <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{title}</h1>
      <p className="text-sm text-mu">{intro}</p>
    </div>
    {action}
  </div>
);

type LibraryDraft = Omit<LibraryRow, 'id'> & { id: string | null };

export function Library({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const admin = can(company.role, 'scorecards.write');
  const [list, setList] = useState<LibraryRow[] | null>(null);
  const [draft, setDraft] = useState<LibraryDraft | null>(null);
  const { message, run, fail } = useAction();
  const load = useCallback(() => {
    api<LibraryRow[]>('/category-library', company.id).then(setList, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const { id, ...body } = draft;
    const ok = await run(
      () =>
        id
          ? api(`/category-library/${id}`, company.id, { method: 'PUT', body })
          : api('/category-library', company.id, { body }),
      t('quality.categorySaved'),
      load,
    );
    if (ok) setDraft(null);
  }

  const empty = (): LibraryDraft => ({
    id: null,
    name: '',
    description: '',
    critical: false,
    questions: [emptyQuestion()],
    active: true,
  });
  return (
    <section className="grid gap-4">
      {header(
        t('menu.pages.scat'),
        t('quality.libraryIntro'),
        admin && !draft && (
          <button type="button" className={primaryButton} onClick={() => setDraft(empty())}>
            + {t('quality.newCategory')}
          </button>
        ),
      )}
      <Notice message={message} />
      {draft && (
        <form onSubmit={save} className={`${card} grid gap-3`}>
          <h2 className="font-semibold">{draft.id ? t('quality.editCategory') : t('quality.newCategory')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              {t('quality.categoryName')}
              <input
                className={field}
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('fields.description')} <span className="text-mu font-normal">{t('quality.optional')}</span>
              <input
                className={field}
                maxLength={300}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-1" title={t('quality.criticalCategoryHelp')}>
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={draft.critical}
                onChange={(e) => setDraft({ ...draft, critical: e.target.checked })}
              />
              {t('quality.criticalCategory')}
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              {t('quality.activeForReviewers')}
            </label>
          </div>
          <QuestionsEditor
            questions={draft.questions}
            onChange={(questions: ScorecardQuestion[]) => setDraft({ ...draft, questions })}
          />
          <div className="flex gap-2">
            <button type="submit" className={primaryButton}>
              {t('common.save')}
            </button>
            <button type="button" className={smallButton} onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
      {!list && <p className="text-mu">{t('common.loading')}</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {list?.map((c) => (
          <li key={c.id} className={`${card} grid gap-2 content-start ${c.active ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-lg">{c.name}</h2>
              {c.critical && (
                <span className="rounded-full bg-bad/10 px-2 text-xs text-bad">{t('quality.criticalCategory')}</span>
              )}
              {!c.active && <span className="rounded-full bg-pn2 px-2 text-xs">{t('quality.inactive')}</span>}
            </div>
            {c.description && <p className="text-sm text-mu">{c.description}</p>}
            <ul className="text-sm grid gap-1">
              {c.questions.map((q, i) => (
                <li key={i} className="flex justify-between gap-3 border-t border-bd pt-1">
                  <span>{q.text}</span>
                  <b className="font-mono">{t('quality.pts', { count: q.points })}</b>
                </li>
              ))}
            </ul>
            {admin && (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => setDraft({ ...structuredClone(c), id: c.id })}
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  className={dangerButton}
                  onClick={() => {
                    if (window.confirm(t('quality.confirmDeleteCategory')))
                      void run(
                        () => api(`/category-library/${c.id}`, company.id, { method: 'DELETE' }),
                        t('quality.categorySaved'),
                        load,
                      );
                  }}
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface RootCauseRow {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export function RootCauses({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const editor = can(company.role, 'rootCauses.write');
  const [list, setList] = useState<RootCauseRow[] | null>(null);
  const [draft, setDraft] = useState<(Omit<RootCauseRow, 'id'> & { id: string | null }) | null>(null);
  const { message, run, fail } = useAction();
  const load = useCallback(() => {
    api<RootCauseRow[]>('/root-causes', company.id).then(setList, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const { id, ...body } = draft;
    const ok = await run(
      () =>
        id ? api(`/root-causes/${id}`, company.id, { method: 'PUT', body }) : api('/root-causes', company.id, { body }),
      t('quality.rootCauseSaved'),
      load,
    );
    if (ok) setDraft(null);
  }

  const form = draft && (
    <form onSubmit={save} className={`${card} grid gap-3`}>
      <h2 className="font-semibold">{draft.id ? t('quality.editRootCause') : t('quality.newRootCause')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          {t('quality.rootCause')}
          <input
            className={field}
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('quality.whatItMeans')}
          <input
            className={field}
            maxLength={300}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
      </div>
      <label className="inline-flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--brand)]"
          checked={draft.active}
          onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
        />
        {t('quality.activeForReviewers')}
      </label>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton}>
          {t('common.save')}
        </button>
        <button type="button" className={smallButton} onClick={() => setDraft(null)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
  return (
    <section className="grid gap-4">
      {header(
        t('menu.pages.roots'),
        t('quality.rootCausesIntro'),
        editor && !draft && (
          <button
            type="button"
            className={primaryButton}
            onClick={() => setDraft({ id: null, name: '', description: '', active: true })}
          >
            + {t('quality.newRootCause')}
          </button>
        ),
      )}
      <Notice message={message} />
      {form}
      {!list && <p className="text-mu">{t('common.loading')}</p>}
      {list && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="text-left text-mu">
              <tr>
                <th className="py-1 pr-3 font-semibold">{t('quality.rootCause')}</th>
                <th className="py-1 pr-3 font-semibold">{t('quality.whatItMeans')}</th>
                <th className="py-1 pr-3 font-semibold">{t('people.status')}</th>
                {editor && <th className="py-1 font-semibold sr-only">{t('people.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t border-bd">
                  <td className="py-2 pr-3 font-semibold">{c.name}</td>
                  <td className="py-2 pr-3">{c.description}</td>
                  <td className="py-2 pr-3">{c.active ? t('quality.active') : t('quality.inactive')}</td>
                  {editor && (
                    <td className="py-2 whitespace-nowrap">
                      <button type="button" className={`${smallButton} mr-2`} onClick={() => setDraft({ ...c })}>
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className={dangerButton}
                        onClick={() => {
                          if (window.confirm(t('quality.confirmDeleteRootCause')))
                            void run(
                              () => api(`/root-causes/${c.id}`, company.id, { method: 'DELETE' }),
                              t('quality.rootCauseSaved'),
                              load,
                            );
                        }}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface PassRates {
  general: number;
  teams: Record<string, number>;
}

export function SystemSettings({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const [rates, setRates] = useState<{ general: string; teams: Record<string, string> } | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const { message, run, fail } = useAction();
  const load = useCallback(() => {
    void Promise.all([api<PassRates>('/pass-rates', company.id), api<TeamRow[]>('/teams', company.id)]).then(
      ([r, tm]) => {
        setRates({
          general: String(r.general),
          teams: Object.fromEntries(Object.entries(r.teams).map(([k, v]) => [k, String(v)])),
        });
        setTeams(tm.filter((x) => !x.isAdministration));
      },
      fail,
    );
  }, [company.id, fail]);
  useEffect(load, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!rates) return;
    const body = {
      general: Number(rates.general),
      teams: Object.fromEntries(
        Object.entries(rates.teams)
          .filter(([, v]) => v.trim() !== '')
          .map(([k, v]) => [k, Number(v)]),
      ),
    };
    await run(() => api('/pass-rates', company.id, { method: 'PUT', body }), t('quality.settingsSaved'), load);
  }

  return (
    <section className="grid gap-4 max-w-2xl">
      {header(t('menu.pages.sysset'), t('quality.systemIntro'))}
      {!rates && <p className="text-mu">{t('common.loading')}</p>}
      {rates && (
        <form onSubmit={save} className={`${card} grid gap-3`}>
          <h2 className="font-semibold">{t('quality.passTitle')}</h2>
          <p className="text-sm text-mu">{t('quality.passHelp')}</p>
          <label className="grid gap-1 text-sm font-medium max-w-xs">
            {t('quality.general')}
            <input
              type="number"
              className={field}
              required
              min={1}
              max={100}
              step={1}
              value={rates.general}
              onChange={(e) => setRates({ ...rates, general: e.target.value })}
            />
          </label>
          {teams.map((team) => (
            <label key={team.id} className="grid gap-1 text-sm font-medium max-w-xs">
              <span>
                {team.name} <span className="text-mu font-normal">{t('quality.optional')}</span>
              </span>
              <input
                type="number"
                className={field}
                min={1}
                max={100}
                step={1}
                placeholder={t('quality.sameAsGeneral')}
                value={rates.teams[team.id] ?? ''}
                onChange={(e) => setRates({ ...rates, teams: { ...rates.teams, [team.id]: e.target.value } })}
              />
            </label>
          ))}
          <div>
            <button type="submit" className={primaryButton}>
              {t('quality.saveSettings')}
            </button>
          </div>
          <Notice message={message} />
        </form>
      )}
      <TranscriptDaysCard company={company} />
    </section>
  );
}
