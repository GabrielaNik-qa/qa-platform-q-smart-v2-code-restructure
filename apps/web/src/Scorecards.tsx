// Quality set-up › Scorecards, as today: the list (filtered by tag) and the editor. Everyone sees the scorecards of
// their own workspaces; only admins create, change, duplicate and delete them. The points add up to exactly 100.
import { can, type ScorecardCategory, type ScorecardQuestion, totalPoints } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { card, Chips, type CompanyRef, dangerButton, field, Notice, primaryButton, smallButton, useAction } from './ui';

export interface ScorecardRow {
  id: string;
  name: string;
  description: string;
  tags: string[];
  categories: ScorecardCategory[];
  workspaceIds: string[];
}
export interface LibraryRow {
  id: string;
  name: string;
  description: string;
  critical: boolean;
  questions: ScorecardQuestion[];
  active: boolean;
}
interface WorkspaceRef {
  id: string;
  name: string;
}
interface Draft {
  id: string | null;
  name: string;
  description: string;
  tags: string[];
  categories: ScorecardCategory[];
  workspaceId: string;
}

export const emptyQuestion = (): ScorecardQuestion => ({ text: '', points: 0, critical: false, compliance: false });
const emptyCategory = (): ScorecardCategory => ({ name: '', critical: false, questions: [emptyQuestion()] });
const points = (c: ScorecardCategory) => c.questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
const move = <T,>(list: T[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
};

/** The items of one category: text, points, critical and compliance (shared with the library). */
export function QuestionsEditor({
  questions,
  onChange,
}: {
  questions: ScorecardQuestion[];
  onChange: (next: ScorecardQuestion[]) => void;
}) {
  const { t } = useTranslation();
  const set = (i: number, change: Partial<ScorecardQuestion>) =>
    onChange(questions.map((q, qi) => (qi === i ? { ...q, ...change } : q)));
  return (
    <div className="grid gap-2">
      {questions.map((q, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            className={`${field} flex-1 min-w-56`}
            aria-label={t('quality.item')}
            placeholder={t('quality.item')}
            required
            maxLength={300}
            value={q.text}
            onChange={(e) => set(i, { text: e.target.value })}
          />
          <input
            type="number"
            className={`${field} w-20`}
            aria-label={t('quality.pts', { count: q.points })}
            min={0}
            max={100}
            step={1}
            value={q.points}
            onChange={(e) => set(i, { points: Math.trunc(Number(e.target.value)) || 0 })}
          />
          <label className="inline-flex items-center gap-1 text-sm" title={t('quality.criticalHelp')}>
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              checked={q.critical}
              onChange={(e) => set(i, { critical: e.target.checked })}
            />
            {t('quality.critical')}
          </label>
          <label className="inline-flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              checked={q.compliance}
              onChange={(e) => set(i, { compliance: e.target.checked })}
            />
            {t('quality.compliance')}
          </label>
          <button
            type="button"
            className={dangerButton}
            aria-label={t('quality.remove')}
            title={t('quality.remove')}
            onClick={() => onChange(questions.length > 1 ? questions.filter((_, qi) => qi !== i) : [emptyQuestion()])}
          >
            ×
          </button>
        </div>
      ))}
      <div>
        <button type="button" className={smallButton} onClick={() => onChange([...questions, emptyQuestion()])}>
          + {t('quality.addItem')}
        </button>
      </div>
    </div>
  );
}

export function Scorecards({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const admin = can(company.role, 'scorecards.write');
  const [list, setList] = useState<ScorecardRow[] | null>(null);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [tag, setTag] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newTag, setNewTag] = useState('');
  const [fromLibrary, setFromLibrary] = useState('');
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<ScorecardRow[]>('/scorecards', company.id),
      admin ? api<LibraryRow[]>('/category-library', company.id) : Promise.resolve([]),
      admin ? api<WorkspaceRef[]>('/workspaces', company.id) : Promise.resolve([]),
    ]).then(([cards, lib, ws]) => {
      setList(cards);
      setLibrary(lib);
      setWorkspaces(ws);
    }, fail);
  }, [company.id, admin, fail]);
  useEffect(load, [load]);

  const tags = [...new Set((list ?? []).flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b));
  const shown = (list ?? []).filter((s) => !tag || s.tags.includes(tag));
  const open = (s: ScorecardRow | null, copy = false) =>
    setDraft(
      s
        ? {
            id: copy ? null : s.id,
            name: copy ? t('quality.copyOf', { name: s.name }).slice(0, 80) : s.name,
            description: s.description,
            tags: [...s.tags],
            categories: structuredClone(s.categories),
            workspaceId: s.workspaceIds[0] ?? workspaces[0]?.id ?? '',
          }
        : {
            id: null,
            name: '',
            description: '',
            tags: [],
            categories: [emptyCategory()],
            workspaceId: workspaces[0]?.id ?? '',
          },
    );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const body = {
      name: draft.name,
      description: draft.description,
      tags: draft.tags,
      categories: draft.categories,
      ...(draft.id ? {} : { workspaceId: draft.workspaceId || undefined }),
    };
    const ok = await run(
      () =>
        draft.id
          ? api(`/scorecards/${draft.id}`, company.id, { method: 'PUT', body })
          : api('/scorecards', company.id, { body }),
      t('quality.saved'),
      load,
    );
    if (ok) setDraft(null);
  }

  if (draft) {
    const total = totalPoints(draft.categories);
    const setCategory = (i: number, change: Partial<ScorecardCategory>) =>
      setDraft({ ...draft, categories: draft.categories.map((c, ci) => (ci === i ? { ...c, ...change } : c)) });
    const addTag = () => {
      const tagText = newTag.replace(/,/g, ' ').trim().slice(0, 30);
      if (tagText && draft.tags.length < 12 && !draft.tags.some((x) => x.toLowerCase() === tagText.toLowerCase()))
        setDraft({ ...draft, tags: [...draft.tags, tagText] });
      setNewTag('');
    };
    return (
      <form onSubmit={save} className="grid gap-4" aria-labelledby="scorecard-editor">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h1 id="scorecard-editor" className="lane font-display text-3xl font-bold uppercase tracking-wide">
              {draft.id ? t('quality.editScorecard') : t('quality.newScorecard')}
            </h1>
            <p className="text-sm text-mu">{t('quality.editorIntro')}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={smallButton} onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={primaryButton}>
              {t('quality.save')}
            </button>
          </div>
        </div>
        <Notice message={message} />
        <section className={`${card} grid gap-3`}>
          <h2 className="font-semibold">{t('quality.details')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              {t('fields.name')}
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
                maxLength={200}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-1 text-sm">
            <b>{t('quality.tags')}</b>
            <small className="text-mu">{t('quality.tagsHelp')}</small>
            <div className="flex flex-wrap items-center gap-2">
              {draft.tags.map((x, i) => (
                <span
                  key={x}
                  className="inline-flex items-center gap-1 rounded-full border border-bd bg-pn2 px-2 py-0.5 text-xs"
                >
                  {x}
                  <button
                    type="button"
                    aria-label={`${t('quality.remove')} ${x}`}
                    onClick={() => setDraft({ ...draft, tags: draft.tags.filter((_, ti) => ti !== i) })}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className={`${field} w-40`}
                aria-label={t('quality.addTag')}
                placeholder={t('quality.addTag')}
                value={newTag}
                maxLength={30}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
              />
            </div>
          </div>
          {!draft.id && workspaces.length > 0 && (
            <label className="grid gap-1 text-sm font-medium max-w-xs">
              {t('quality.workspace')}
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
        </section>
        {draft.categories.map((c, ci) => (
          <section key={ci} className={`${card} grid gap-3`} aria-label={c.name || t('quality.categoryName')}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${field} flex-1 min-w-52 font-semibold`}
                aria-label={t('quality.categoryName')}
                placeholder={t('quality.categoryName')}
                required
                maxLength={80}
                value={c.name}
                onChange={(e) => setCategory(ci, { name: e.target.value })}
              />
              <label className="inline-flex items-center gap-1 text-sm" title={t('quality.criticalCategoryHelp')}>
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={c.critical}
                  onChange={(e) => setCategory(ci, { critical: e.target.checked })}
                />
                {t('quality.criticalCategory')}
              </label>
              <b className="font-mono text-sm">{t('quality.pts', { count: points(c) })}</b>
              <button
                type="button"
                className={smallButton}
                aria-label={t('quality.moveUp')}
                title={t('quality.moveUp')}
                onClick={() => setDraft({ ...draft, categories: move(draft.categories, ci, ci - 1) })}
              >
                ↑
              </button>
              <button
                type="button"
                className={smallButton}
                aria-label={t('quality.moveDown')}
                title={t('quality.moveDown')}
                onClick={() => setDraft({ ...draft, categories: move(draft.categories, ci, ci + 1) })}
              >
                ↓
              </button>
              <button
                type="button"
                className={dangerButton}
                disabled={draft.categories.length <= 1}
                onClick={() => setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== ci) })}
              >
                {t('quality.remove')}
              </button>
            </div>
            <QuestionsEditor questions={c.questions} onChange={(questions) => setCategory(ci, { questions })} />
          </section>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={smallButton}
              disabled={draft.categories.length >= 20}
              onClick={() => setDraft({ ...draft, categories: [...draft.categories, emptyCategory()] })}
            >
              + {t('quality.addCategory')}
            </button>
            {library.some((c) => c.active) && (
              <>
                <select
                  className={field}
                  aria-label={t('quality.fromLibrary')}
                  value={fromLibrary}
                  onChange={(e) => setFromLibrary(e.target.value)}
                >
                  <option value="">{t('quality.fromLibrary')}</option>
                  {library
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className={smallButton}
                  disabled={!fromLibrary}
                  onClick={() => {
                    const c = library.find((x) => x.id === fromLibrary);
                    if (!c) return;
                    // a copy: changing the library later never changes this scorecard (as today)
                    setDraft({
                      ...draft,
                      categories: [
                        ...draft.categories,
                        { name: c.name, critical: c.critical, questions: structuredClone(c.questions) },
                      ],
                    });
                    setFromLibrary('');
                  }}
                >
                  {t('quality.addToScorecard')}
                </button>
              </>
            )}
          </div>
          <b className={`font-mono ${total === 100 ? 'text-ok' : 'text-bad'}`} aria-live="polite">
            {t('quality.total', { count: total })}
          </b>
        </div>
      </form>
    );
  }

  const count = (f: (s: ScorecardRow) => number) => (list ?? []).reduce((sum, s) => sum + f(s), 0);
  return (
    <section className="grid gap-4" aria-labelledby="scorecards-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="scorecards-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.sco')}
          </h1>
          <p className="text-sm text-mu">{t('quality.scorecardsIntro')}</p>
        </div>
        {admin && (
          <button type="button" className={primaryButton} onClick={() => open(null)}>
            + {t('quality.newScorecard')}
          </button>
        )}
      </div>
      <Notice message={message} />
      {list && (
        <div className="flex flex-wrap gap-3">
          {[
            [t('menu.pages.sco'), list.length],
            [t('quality.categories'), count((s) => s.categories.length)],
            [t('quality.items'), count((s) => s.categories.reduce((n, c) => n + c.questions.length, 0))],
          ].map(([label, value]) => (
            <div key={String(label)} className={`${card} min-w-36`}>
              <div className="text-sm text-mu">{label}</div>
              <div className="font-display text-3xl font-bold">{value}</div>
            </div>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('quality.tags')}>
          {['', ...tags].map((x) => (
            <button
              key={x || 'all'}
              type="button"
              aria-pressed={tag === x}
              className={`rounded-full border px-3 py-1 text-sm ${tag === x ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`}
              onClick={() => setTag(x)}
            >
              {x || t('quality.allTags')} ({(list ?? []).filter((s) => !x || s.tags.includes(x)).length})
            </button>
          ))}
        </div>
      )}
      {!list && <p className="text-mu">{t('common.loading')}</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {shown.map((s) => (
          <li key={s.id} className={`${card} grid gap-2 content-start`}>
            <h2 className="font-semibold text-lg">{s.name}</h2>
            <Chips items={s.tags} />
            {s.description && <p className="text-sm text-mu">{s.description}</p>}
            <small>
              {t('quality.summary', {
                categories: s.categories.length,
                items: s.categories.reduce((n, c) => n + c.questions.length, 0),
              })}
            </small>
            <ul className="grid gap-1 text-sm">
              {s.categories.map((c, i) => (
                <li key={i} className="flex justify-between gap-3 border-t border-bd pt-1">
                  <span>
                    {c.name}
                    {c.critical && (
                      <span className="ml-2 rounded-full bg-bad/10 px-2 text-xs text-bad">
                        {t('quality.criticalCategory')}
                      </span>
                    )}
                    {c.questions.some((q) => q.critical) && (
                      <span className="ml-2 rounded-full bg-wn/10 px-2 text-xs text-wn">{t('quality.critical')}</span>
                    )}
                  </span>
                  <b className="font-mono">{t('quality.pts', { count: points(c) })}</b>
                </li>
              ))}
            </ul>
            {admin && (
              <div className="flex gap-2 pt-1">
                <button type="button" className={smallButton} onClick={() => open(s)}>
                  {t('common.edit')}
                </button>
                <button type="button" className={smallButton} onClick={() => open(s, true)}>
                  {t('quality.duplicate')}
                </button>
                <button
                  type="button"
                  className={dangerButton}
                  onClick={() => {
                    if (window.confirm(t('quality.confirmDelete')))
                      void run(
                        () => api(`/scorecards/${s.id}`, company.id, { method: 'DELETE' }),
                        t('quality.deleted'),
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
