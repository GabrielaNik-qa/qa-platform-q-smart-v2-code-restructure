// Quality › Coaching (today's work.js `PG.coach`), for admins, reviewers, team leads and trainers:
// - Insights: the team's focus (the weakest categories of the last 30 days, and who is below the pass rate in each,
//   with "Plan group coaching"), and what each agent should work on, who needs it most first, with "Plan coaching";
// - Sessions log: the overview (held, coming, overdue, signed, the score 30 days after against 30 days before, the
//   coaches) and every coaching session, group coaching and training, with search and type.
// A session opens on its own page (/session/…), where its agents read and sign it. One-to-ones: step 5.
import { can, categoryNames, coachingOverview, insightOf, type PassRates, passRateOf, teamFocus } from '@qsmart/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { when } from './Activity';
import { api } from './api';
import { AgentLink, Bar, colour, Empty, td, th } from './bits';
import { currentLanguage } from './i18n';
import { NotFound } from './PageView';
import type { ReviewRow } from './QAEntry';
import { useSession } from './session';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, smallButton, useAction } from './ui';

export type SessionKind = 'coaching' | 'group' | 'training' | 'o2o';
export interface SessionRow {
  id: string;
  kind: SessionKind;
  heldOn: string;
  title: string;
  status: 'planned' | 'done';
  agents: { id: string; name: string; teamId: string | null; teamName: string }[];
  focus: string[];
  topics: string[];
  goals: string;
  notes: string;
  followUpOn: string | null;
  actions: {
    text: string;
    ownerId: string;
    ownerName: string;
    dueOn: string | null;
    done: boolean;
    taskId: string | null;
  }[];
  signatures: Record<string, { at: string; comment: string; inPerson?: boolean }>;
  byId: string | null;
  byName: string;
  createdAt: string;
}
const KINDS = ['coaching', 'group', 'training'] as const;
const KIND_LOOK: Record<SessionKind, string> = {
  coaching: 'bg-ac/15 text-ac',
  group: 'bg-wn/15 text-wn',
  training: 'bg-ok/15 text-ok',
  o2o: 'bg-ac/15 text-ac',
};
const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';
const today = () => new Date().toLocaleDateString('sv-SE');

/** Signed by all its agents, some, none yet, or planned. */
export function SignatureState({ s }: { s: SessionRow }) {
  const { t } = useTranslation();
  const n = s.agents.filter((a) => s.signatures[a.id]).length;
  if (s.status === 'planned') return <span className={`${pill} bg-wn/15 text-wn`}>{t('coaching.planned')}</span>;
  if (n === s.agents.length) return <span className={`${pill} bg-ok/15 text-ok`}>{t('coaching.signed')}</span>;
  return (
    <span className={`${pill} bg-wn/15 text-wn`}>
      {n ? t('coaching.signedSome', { n, of: s.agents.length }) : t('coaching.awaiting')}
    </span>
  );
}

export function Coaching({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const writes = can(company.role, 'coaching.write');
  const { message, run, fail } = useAction();
  const [tab, setTab] = useState<'insights' | 'sessions'>('insights');
  const [team, setTeam] = useState('');
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [reviews, setReviews] = useState<(ReviewRow & { status?: string })[]>([]);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');

  const load = useCallback(() => {
    api<SessionRow[]>('/coaching-sessions', company.id).then(setSessions, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      api<PersonRow[]>('/people', company.id),
    ]).then(([r, pr, ppl]) => {
      setReviews(r);
      setRates(pr);
      setPeople(ppl.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)));
    }, fail);
  }, [company.id, fail]);

  const agents = people.filter((p) => p.role === 'agent');
  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of people) if (p.role === 'agent' && p.teamId) seen.set(p.teamId, p.teamName ?? '');
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);
  const shown = agents.filter((a) => !team || a.teamId === team);
  const now = Date.now();
  const all = sessions ?? [];
  const insights = shown
    .map((a) => ({ a, i: insightOf(a, reviews, all, rates, now) }))
    .sort((x, y) => y.i.priority - x.i.priority || x.a.name.localeCompare(y.a.name));
  const focus = teamFocus(shown, reviews, rates, now);
  const plan = (
    agentIds: string[],
    categories: string[],
    k: SessionKind = agentIds.length > 1 ? 'group' : 'coaching',
  ) => setDraft({ ...emptySession(), kind: k as SessionDraft['kind'], agentIds, focus: categories });

  return (
    <section className="grid gap-4" aria-labelledby="coaching-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="coaching-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('coaching.title')}
          </h1>
          <p className="text-sm text-mu">{t('coaching.intro')}</p>
        </div>
        {writes && (
          <button type="button" className={primaryButton} onClick={() => setDraft(emptySession())}>
            + {t('coaching.new')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex gap-2" role="tablist" aria-label={t('coaching.title')}>
          {(['insights', 'sessions'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`rounded-s px-3 py-1.5 font-semibold ${tab === k ? 'bg-brand text-on-brand' : 'border border-bd hover:border-tx'}`}
              onClick={() => setTab(k)}
            >
              {t(`coaching.tabs.${k}`)}
            </button>
          ))}
        </div>
        <label className="grid gap-1 font-medium">
          {t('tasks.filters.team')}
          <select className={field} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{t('tasks.filters.allTeams')}</option>
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Notice message={message} />

      {!sessions ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : tab === 'insights' ? (
        <>
          <section className={`${card} grid gap-2`} aria-label={t('coaching.focus.title')}>
            <h2 className="font-semibold">{t('coaching.focus.title')}</h2>
            {!focus.length ? (
              <p className="text-sm text-mu">{t('coaching.focus.none')}</p>
            ) : (
              focus.map((f) => (
                <div
                  key={f.name}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-bd pt-2 text-sm"
                >
                  <span>
                    <b>{f.name}</b>{' '}
                    <small className="text-mu">
                      {t('coaching.focus.line', { value: f.value.toFixed(1), count: f.below.length })}
                    </small>
                  </span>
                  {writes && f.below.length > 0 && (
                    <button type="button" className={smallButton} onClick={() => plan(f.below, [f.name], 'group')}>
                      {t('coaching.focus.plan')}
                    </button>
                  )}
                </div>
              ))
            )}
          </section>
          {!insights.length ? (
            <Empty>{t('tasks.progress.nobody')}</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {insights.map(({ a, i }) => {
                const pass = passRateOf(rates, a.teamId);
                return (
                  <section key={a.membershipId} className={`${card} grid content-start gap-2 p-4`} aria-label={a.name}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <AgentLink id={a.membershipId} name={a.name} /> <small className="text-mu">{a.teamName}</small>
                      </span>
                      {i.trend !== null && (
                        <span className={`${pill} ${i.trend >= 0 ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}>
                          {i.trend >= 0 ? '↗' : '↘'} {t('coaching.points', { n: i.trend.toFixed(1) })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">
                      {i.reviews && i.average !== null ? (
                        t('coaching.average', { value: i.average.toFixed(1), count: i.reviews })
                      ) : (
                        <span className="text-mu">{t('coaching.noReviews')}</span>
                      )}
                    </p>
                    {i.weak.length > 0 ? (
                      <div className="grid gap-2">
                        <b className="text-sm">{t('coaching.workOn')}</b>
                        {i.weak.map((w) => (
                          <div key={w.name} className="grid gap-0.5 text-sm">
                            <span className="flex justify-between gap-2">
                              <span>{w.name}</span>
                              <b className="font-mono">{Math.round(w.value)}%</b>
                            </span>
                            <Bar value={w.value} tone={colour(w.value, pass)} />
                            {w.team !== null && (
                              <small className="text-mu">
                                {t('coaching.teamAverage', { value: Math.round(w.team) })}
                              </small>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      i.reviews > 0 && <p className="text-sm text-ok">{t('coaching.allAbove')}</p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-bd pt-2">
                      <small className="text-mu">
                        {i.lastCoached
                          ? t('coaching.lastCoached', { date: i.lastCoached })
                          : t('coaching.neverCoached')}
                        {i.disputes > 0 && ` · ${t('coaching.disputes', { count: i.disputes })}`}
                      </small>
                      {writes && (
                        <button
                          type="button"
                          className={smallButton}
                          onClick={() =>
                            plan(
                              [a.membershipId],
                              i.weak.map((w) => w.name),
                            )
                          }
                        >
                          {t('coaching.plan')}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <SessionsLog
          sessions={all.filter((s) => s.kind !== 'o2o' && (!team || s.agents.some((a) => a.teamId === team)))}
          reviews={reviews}
          query={query}
          setQuery={setQuery}
          kind={kind}
          setKind={setKind}
          writes={writes}
          onEdit={(s) => setDraft(draftOf(s))}
          onDelete={(s) => {
            if (!window.confirm(t('coaching.confirmDelete'))) return;
            void run(
              () => api(`/coaching-sessions/${s.id}`, company.id, { method: 'DELETE' }),
              t('coaching.deleted'),
              load,
            );
          }}
        />
      )}
      {draft && (
        <SessionForm
          company={company}
          draft={draft}
          setDraft={setDraft}
          agents={agents}
          people={people}
          categories={categoryNames(reviews)}
          onSaved={load}
        />
      )}
    </section>
  );
}

function SessionsLog({
  sessions,
  reviews,
  query,
  setQuery,
  kind,
  setKind,
  writes,
  onEdit,
  onDelete,
}: {
  sessions: SessionRow[];
  reviews: ReviewRow[];
  query: string;
  setQuery: (v: string) => void;
  kind: string;
  setKind: (v: string) => void;
  writes: boolean;
  onEdit: (s: SessionRow) => void;
  onDelete: (s: SessionRow) => void;
}) {
  const { t } = useTranslation();
  const o = coachingOverview(sessions, reviews, today());
  const q = query.trim().toLowerCase();
  const list = sessions
    .filter((s) => !kind || s.kind === kind)
    .filter((s) => !q || [s.title, s.notes, ...s.agents.map((a) => a.name)].some((v) => v.toLowerCase().includes(q)));
  const tile = (label: string, value: string, note: string, look = ''): ReactNode => (
    <div className={`${card} grid gap-0.5 p-3`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-mu">{label}</span>
      <b className={`font-display text-2xl ${look}`}>{value}</b>
      <small className="text-mu">{note}</small>
    </div>
  );
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tile(t('coaching.overview.held'), String(o.held), '')}
        {tile(t('coaching.overview.coming'), String(o.coming), '', 'text-ac')}
        {tile(
          t('coaching.overview.overdue'),
          String(o.overdue),
          t('coaching.overview.overdueNote'),
          o.overdue ? 'text-bad' : '',
        )}
        {tile(
          t('coaching.overview.signed'),
          o.toSign ? `${Math.round((o.signed / o.toSign) * 100)}%` : '-',
          `${o.signed}/${o.toSign}`,
        )}
        {tile(
          t('coaching.overview.after'),
          o.change === null ? '-' : t('coaching.points', { n: `${o.change > 0 ? '+' : ''}${o.change.toFixed(1)}` }),
          t('coaching.overview.afterNote'),
          o.change === null ? '' : o.change >= 0 ? 'text-ok' : 'text-bad',
        )}
      </div>
      {o.coaches.length > 0 && (
        <section className={`${card} overflow-x-auto p-3`} aria-label={t('coaching.overview.coaches')}>
          <h2 className="mb-2 font-semibold">{t('coaching.overview.coaches')}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>{t('coaching.overview.coach')}</th>
                <th className={th}>{t('coaching.overview.sessions')}</th>
                <th className={th}>{t('coaching.overview.agents')}</th>
                <th className={th}>{t('coaching.overview.after')}</th>
              </tr>
            </thead>
            <tbody>
              {o.coaches.map((c) => (
                <tr key={c.name} className="border-t border-bd">
                  <td className={`${td} font-semibold`}>{c.name}</td>
                  <td className={td}>{c.sessions}</td>
                  <td className={td}>{c.agents}</td>
                  <td
                    className={`${td} font-semibold ${c.change === null ? '' : c.change >= 0 ? 'text-ok' : 'text-bad'}`}
                  >
                    {c.change === null
                      ? '-'
                      : t('coaching.points', { n: `${c.change > 0 ? '+' : ''}${c.change.toFixed(1)}` })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className={`${card} grid gap-3 p-3`} aria-label={t('coaching.log')}>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <b className="mr-auto">{t('coaching.count', { count: list.length })}</b>
          <label className="grid gap-1 font-medium">
            {t('tasks.filters.search')}
            <input className={field} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="grid gap-1 font-medium">
            {t('coaching.form.kind')}
            <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('coaching.allKinds')}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`coaching.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!list.length ? (
          <Empty>{t('coaching.none')}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {(['date', 'kind', 'title', 'agents', 'signature', 'focus', 'actions', 'by'] as const).map((k) => (
                    <th key={k} className={th}>
                      {t(`coaching.cols.${k}`)}
                    </th>
                  ))}
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-t border-bd">
                    <td className={`${td} whitespace-nowrap`}>{s.heldOn}</td>
                    <td className={td}>
                      <span className={`${pill} ${KIND_LOOK[s.kind]}`}>{t(`coaching.kinds.${s.kind}`)}</span>
                    </td>
                    <td className={td}>
                      <Link to="/session/$id" params={{ id: s.id }} className="font-semibold text-ac hover:underline">
                        {s.title}
                      </Link>
                    </td>
                    <td className={td}>{s.agents.map((a) => a.name).join(', ')}</td>
                    <td className={td}>
                      <SignatureState s={s} />
                    </td>
                    <td className={td}>{s.focus.join(', ') || '-'}</td>
                    <td className={td}>
                      {s.actions.length
                        ? t('coaching.actionsDone', {
                            done: s.actions.filter((a) => a.done).length,
                            of: s.actions.length,
                          })
                        : '-'}
                    </td>
                    <td className={td}>{s.byName}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {writes && (
                        <>
                          <button type="button" className={smallButton} onClick={() => onEdit(s)}>
                            {t('common.edit')}
                          </button>{' '}
                          <button type="button" className={`${smallButton} text-bad`} onClick={() => onDelete(s)}>
                            {t('common.delete')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <small className="text-mu">{t('coaching.logHelp')}</small>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the form

export interface SessionDraft {
  id?: string;
  kind: 'coaching' | 'group' | 'training';
  heldOn: string;
  title: string;
  status: 'planned' | 'done';
  agentIds: string[];
  focus: string[];
  topics: string;
  goals: string;
  notes: string;
  followUpOn: string;
  actions: { text: string; ownerId: string; dueOn: string; done: boolean; taskId: string | null }[];
  makeTasks: boolean;
}
export const emptySession = (): SessionDraft => ({
  kind: 'coaching',
  heldOn: today(),
  title: '',
  status: 'done',
  agentIds: [],
  focus: [],
  topics: '',
  goals: '',
  notes: '',
  followUpOn: '',
  actions: [],
  makeTasks: false,
});
export const draftOf = (s: SessionRow): SessionDraft => ({
  id: s.id,
  kind: s.kind === 'o2o' ? 'coaching' : s.kind,
  heldOn: s.heldOn,
  title: s.title,
  status: s.status,
  agentIds: s.agents.map((a) => a.id),
  focus: s.focus,
  topics: s.topics.join(', '),
  goals: s.goals,
  notes: s.notes,
  followUpOn: s.followUpOn ?? '',
  actions: s.actions.map((a) => ({
    text: a.text,
    ownerId: a.ownerId,
    dueOn: a.dueOn ?? '',
    done: a.done,
    taskId: a.taskId,
  })),
  makeTasks: false,
});

export function SessionForm({
  company,
  draft,
  setDraft,
  agents,
  people,
  categories,
  onSaved,
}: {
  company: CompanyRef;
  draft: SessionDraft;
  setDraft: (d: SessionDraft | null) => void;
  agents: PersonRow[];
  people: PersonRow[];
  categories: string[];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { message, run } = useAction();
  const [find, setFind] = useState('');
  const set = (change: Partial<SessionDraft>) => setDraft({ ...draft, ...change });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const allCategories = [...new Set([...categories, ...draft.focus])];
  async function save(e: FormEvent) {
    e.preventDefault();
    const body = {
      kind: draft.kind,
      heldOn: draft.heldOn,
      title: draft.title,
      status: draft.status,
      agentIds: draft.agentIds,
      focus: draft.focus,
      topics: draft.topics
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 20),
      goals: draft.goals,
      notes: draft.notes,
      followUpOn: draft.followUpOn || null,
      actions: draft.actions.filter((a) => a.text.trim()).map((a) => ({ ...a, dueOn: a.dueOn || null })),
      makeTasks: draft.makeTasks,
    };
    const ok = await run(
      () =>
        api(draft.id ? `/coaching-sessions/${draft.id}` : '/coaching-sessions', company.id, {
          method: draft.id ? 'PUT' : 'POST',
          body,
        }),
      t('coaching.saved'),
      onSaved,
    );
    if (ok) setDraft(null);
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDraft(null)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-form-title"
        className="grid max-h-[90vh] w-full max-w-[720px] gap-3 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="session-form-title" className="font-display text-xl font-bold">
            {draft.id ? t('coaching.editTitle') : t('coaching.new')}
          </h2>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('cats.close')}
            onClick={() => setDraft(null)}
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium">
            {t('coaching.form.kind')}
            <select
              className={field}
              value={draft.kind}
              onChange={(e) => set({ kind: e.target.value as SessionDraft['kind'] })}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`coaching.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('coaching.form.date')}
            <input
              className={field}
              type="date"
              required
              value={draft.heldOn}
              onChange={(e) => set({ heldOn: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('coaching.form.status')}
            <select
              className={field}
              value={draft.status}
              onChange={(e) => set({ status: e.target.value as SessionDraft['status'] })}
            >
              <option value="done">{t('coaching.held')}</option>
              <option value="planned">{t('coaching.planned')}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('coaching.form.followUp')}
            <input
              className={field}
              type="date"
              value={draft.followUpOn}
              onChange={(e) => set({ followUpOn: e.target.value })}
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          {t('coaching.form.title')}
          <input
            className={field}
            required
            maxLength={150}
            placeholder={t('coaching.form.titlePlaceholder')}
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <fieldset className="grid gap-1 rounded-s border border-bd p-3">
          <legend className="px-1 text-sm font-semibold">
            {t('coaching.form.agents')}{' '}
            {draft.agentIds.length > 0 && <span className="text-mu">({draft.agentIds.length})</span>}
          </legend>
          <input
            className={field}
            type="search"
            aria-label={t('tasks.form.findPerson')}
            placeholder={t('tasks.form.findPerson')}
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          <div className="grid max-h-40 gap-1 overflow-auto sm:grid-cols-2">
            {agents
              .filter((p) => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase()))
              .map((p) => (
                <label key={p.membershipId} className="inline-flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)]"
                    checked={draft.agentIds.includes(p.membershipId)}
                    onChange={() => set({ agentIds: toggle(draft.agentIds, p.membershipId) })}
                  />
                  {p.name} <small className="text-mu">· {p.teamName}</small>
                </label>
              ))}
          </div>
        </fieldset>
        {allCategories.length > 0 && (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">{t('coaching.form.focus')}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {allCategories.map((c) => (
                <label key={c} className="inline-flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)]"
                    checked={draft.focus.includes(c)}
                    onChange={() => set({ focus: toggle(draft.focus, c) })}
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="grid gap-1 text-sm font-medium">
          {t('coaching.form.topics')}
          <input
            className={field}
            placeholder={t('coaching.form.topicsPlaceholder')}
            value={draft.topics}
            onChange={(e) => set({ topics: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('coaching.form.goals')}
          <textarea
            className={field}
            rows={2}
            maxLength={4000}
            value={draft.goals}
            onChange={(e) => set({ goals: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('coaching.form.notes')}
          <textarea
            className={field}
            rows={4}
            maxLength={8000}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{t('coaching.form.actions')}</legend>
          {draft.actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className={`${field} min-w-40 flex-[2]`}
                maxLength={200}
                aria-label={t('coaching.form.actionText')}
                placeholder={t('coaching.form.actionText')}
                value={a.text}
                onChange={(e) =>
                  set({ actions: draft.actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })
                }
              />
              <select
                className={`${field} flex-1`}
                aria-label={t('coaching.form.who')}
                value={a.ownerId}
                onChange={(e) =>
                  set({ actions: draft.actions.map((x, j) => (j === i ? { ...x, ownerId: e.target.value } : x)) })
                }
              >
                <option value="">{t('coaching.form.who')}</option>
                {people.map((p) => (
                  <option key={p.membershipId} value={p.membershipId}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className={`${field} flex-1`}
                type="date"
                aria-label={t('coaching.form.due')}
                value={a.dueOn}
                onChange={(e) =>
                  set({ actions: draft.actions.map((x, j) => (j === i ? { ...x, dueOn: e.target.value } : x)) })
                }
              />
              <label className="inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={a.done}
                  onChange={(e) =>
                    set({ actions: draft.actions.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })
                  }
                />
                {t('coaching.form.done')}
              </label>
              {a.taskId && <small className="text-ac">{t('coaching.form.isTask')}</small>}
              <button
                type="button"
                className="text-mu hover:text-bad"
                aria-label={t('coaching.form.removeAction')}
                onClick={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className={`${smallButton} justify-self-start`}
            onClick={() =>
              set({ actions: [...draft.actions, { text: '', ownerId: '', dueOn: '', done: false, taskId: null }] })
            }
          >
            + {t('coaching.form.addAction')}
          </button>
          <label className="inline-flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--brand)]"
              checked={draft.makeTasks}
              onChange={(e) => set({ makeTasks: e.target.checked })}
            />
            <span>{t('coaching.form.makeTasks')}</span>
          </label>
        </fieldset>
        <Notice message={message?.ok ? null : message} />
        <div className="flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={() => setDraft(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton} disabled={!draft.agentIds.length}>
            {t('coaching.form.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- one session

/** One session (from the bell and the Sessions log): its agents read it and sign it here; its writers change it. */
export function SessionView() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const navigate = useNavigate();
  const { id } = useParams({ from: '/session/$id' });
  const { company } = useSession();
  const [s, setS] = useState<SessionRow | null | undefined>(undefined);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [comment, setComment] = useState('');
  const { message, run } = useAction();
  const load = useCallback(() => {
    if (!company) return;
    api<SessionRow>(`/coaching-sessions/${id}`, company.id).then(setS, () => setS(null));
  }, [company, id]);
  useEffect(load, [load]);
  const writes = !!company && can(company.role, 'coaching.write') && s?.kind !== 'o2o';
  useEffect(() => {
    if (!company || !writes) return;
    void Promise.all([api<PersonRow[]>('/people', company.id), api<ReviewRow[]>('/reviews', company.id)]).then(
      ([ppl, r]) => {
        setPeople(ppl.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)));
        setReviews(r);
      },
      () => undefined,
    );
  }, [company, writes]);
  if (!company || s === null) return <NotFound />;
  if (!s) return <p className="text-mu">{t('common.loading')}</p>;
  const me = company.membershipId;
  const mine = !!me && s.agents.some((a) => a.id === me);
  const toSign = mine && s.status === 'done' && !s.signatures[me ?? ''];
  const facts: [string, ReactNode][] = [
    [t('coaching.cols.date'), s.heldOn],
    [t('coaching.cols.by'), s.byName],
    [t('coaching.cols.agents'), s.agents.map((a) => a.name).join(', ')],
    [t('coaching.form.followUp'), s.followUpOn ?? '-'],
  ];
  return (
    <section className="grid max-w-3xl gap-4" aria-labelledby="session-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-mu">
            <span className={`${pill} ${KIND_LOOK[s.kind]}`}>{t(`coaching.kinds.${s.kind}`)}</span>
          </p>
          <h1 id="session-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {s.title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallButton} onClick={() => history.back()}>
            {t('reviews.back')}
          </button>
          {writes && (
            <>
              <button type="button" className={smallButton} onClick={() => setDraft(draftOf(s))}>
                {t('common.edit')}
              </button>
              <button
                type="button"
                className={`${smallButton} text-bad`}
                onClick={() => {
                  if (!window.confirm(t('coaching.confirmDelete'))) return;
                  void run(
                    () => api(`/coaching-sessions/${s.id}`, company.id, { method: 'DELETE' }),
                    t('coaching.deleted'),
                  ).then(
                    (ok) => ok && void navigate({ to: '/$app/$page', params: { app: 'quality', page: 'coaching' } }),
                  );
                }}
              >
                {t('common.delete')}
              </button>
            </>
          )}
        </div>
      </div>
      <Notice message={message} />
      <dl className={`${card} grid gap-3 text-sm sm:grid-cols-2`}>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-mu">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {(s.focus.length > 0 || s.topics.length > 0) && (
        <section className={`${card} grid gap-2 text-sm`}>
          {s.focus.length > 0 && (
            <p>
              <span className="text-mu">{t('coaching.form.focus')}: </span>
              {s.focus.join(', ')}
            </p>
          )}
          {s.topics.length > 0 && (
            <p>
              <span className="text-mu">{t('coaching.form.topics')}: </span>
              {s.topics.join(', ')}
            </p>
          )}
        </section>
      )}
      {s.goals && (
        <section className={card}>
          <h2 className="font-semibold">{t('coaching.form.goals')}</h2>
          <p className="whitespace-pre-wrap text-sm">{s.goals}</p>
        </section>
      )}
      {s.notes && (
        <section className={card}>
          <h2 className="font-semibold">{t('coaching.form.notes')}</h2>
          <p className="whitespace-pre-wrap text-sm">{s.notes}</p>
        </section>
      )}
      {s.actions.length > 0 && (
        <section className={`${card} grid gap-1`}>
          <h2 className="font-semibold">{t('coaching.form.actions')}</h2>
          <ul className="grid gap-1 text-sm">
            {s.actions.map((a, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 border-t border-bd pt-1">
                <span className={a.done ? 'text-mu line-through' : ''}>
                  {a.text}
                  {a.ownerName && <small className="text-mu"> · {a.ownerName}</small>}
                </span>
                <span className="flex gap-2">
                  {a.dueOn && <small className="text-mu">{a.dueOn}</small>}
                  {a.taskId && (
                    <Link
                      to="/$app/$page"
                      params={{ app: 'quality', page: 'tasks' }}
                      search={{ task: a.taskId }}
                      className="text-xs font-semibold text-ac hover:underline"
                    >
                      {t('coaching.openTask')}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={`${card} grid gap-2`} aria-label={t('coaching.signatures')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('coaching.signatures')}</h2>
          <SignatureState s={s} />
        </div>
        <ul className="grid gap-1 text-sm">
          {s.agents.map((a) => {
            const g = s.signatures[a.id];
            return (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-t border-bd pt-1">
                <span>
                  {a.name}
                  {g?.comment && <q className="block text-xs italic text-mu">{g.comment}</q>}
                </span>
                <small className={g ? 'text-ok' : 'text-mu'}>
                  {g ? t('coaching.signedOn', { date: when(g.at, lang) }) : t('coaching.notSigned')}
                </small>
              </li>
            );
          })}
        </ul>
        {toSign && (
          <form
            className="grid gap-2 border-t border-bd pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api(`/coaching-sessions/${s.id}/sign`, company.id, { method: 'POST', body: { comment } }),
                t('coaching.thanks'),
                load,
              );
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              {t('coaching.comment')}
              <textarea
                className={field}
                rows={2}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <button type="submit" className={`${primaryButton} justify-self-start`}>
              {t('coaching.sign')}
            </button>
          </form>
        )}
        {mine && s.status === 'planned' && <small className="text-mu">{t('coaching.signLater')}</small>}
      </section>
      {draft && (
        <SessionForm
          company={company}
          draft={draft}
          setDraft={setDraft}
          agents={people.filter((p) => p.role === 'agent')}
          people={people}
          categories={categoryNames(reviews)}
          onSaved={load}
        />
      )}
    </section>
  );
}
