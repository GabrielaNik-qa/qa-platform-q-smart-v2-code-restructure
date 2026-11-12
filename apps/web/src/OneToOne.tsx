// Quality › One-to-One (today's o2o.js): monthly conversations between a team lead and an agent.
// - The list: who is still missing a one-to-one this month (against the target per person, set by an admin, per team if
//   needed), how far every team lead is, and every one-to-one with its state (draft, waiting for the agent, signed).
// - The form follows a template (the team's own first; sections of 8 kinds), shows the agent's numbers for the period
//   and the objectives of the last one-to-one, and ends with the signatures: both on the team lead's screen when the
//   agent is there, or "Send to the agent" so they read and sign it from their own account.
// - Form templates: add, rename, reorder and remove sections, and choose the teams that use it.
// Admins, reviewers and team leads write them; trainers read them; an agent reads and signs their own.
import { averageScore, can, categoryNames, categoryValue, isPass, type PassRates } from '@qsmart/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { when } from './Activity';
import { api } from './api';
import { Bar, colour, Empty } from './bits';
import type { SessionRow } from './Coaching';
import { currentLanguage } from './i18n';
import type { ReviewRow } from './QAEntry';
import { useSession } from './session';
import type { Task } from './Tasks';
import {
  card,
  type CompanyRef,
  field,
  Notice,
  type PersonRow,
  primaryButton,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

const TYPES = ['text', 'check', 'yesno', 'objectives', 'rating', 'metrics', 'table', 'agree'] as const;
type SectionType = (typeof TYPES)[number];
export interface Section {
  id: string;
  type: SectionType;
  title: string;
  items: string[];
  cols: string[];
  units: string[];
}
interface Template {
  id: string;
  name: string;
  teamIds: string[];
  sections: Section[];
}
interface Target {
  target: number;
  teams: Record<string, number>;
}
type Period = 'week' | 'month' | 'year' | 'custom';
type State = 'draft' | 'sent' | 'signed';
export type OneToOneRow = SessionRow & {
  templateId: string | null;
  period: Period;
  periodFrom: string | null;
  periodTo: string | null;
  sections: Section[];
  answers: Record<string, unknown>;
  state: '' | State;
  leadSignature: { at: string; name: string } | null;
};
interface Draft {
  id?: string;
  teamId: string;
  agentId: string;
  templateId: string;
  heldOn: string;
  period: Period;
  periodFrom: string;
  periodTo: string;
  sections: Section[];
  answers: Record<string, unknown>;
  followUpOn: string;
  state: '' | State;
  inPerson: boolean;
  makeTasks: boolean;
  leadSignature: OneToOneRow['leadSignature'];
  signatures: SessionRow['signatures'];
}

const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';
const STATE_LOOK: Record<State, string> = {
  draft: 'bg-wn/15 text-wn',
  sent: 'bg-ac/15 text-ac',
  signed: 'bg-ok/15 text-ok',
};
const today = () => new Date().toLocaleDateString('sv-SE');
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const objectives = (v: unknown): { text: string; dueOn: string }[] =>
  Array.isArray(v) ? v.map((o) => ({ text: String(obj(o)['text'] ?? ''), dueOn: String(obj(o)['dueOn'] ?? '') })) : [];
const stateOf = (s: OneToOneRow): State =>
  s.state || (s.status === 'planned' ? 'draft' : s.agents.every((a) => s.signatures[a.id]) ? 'signed' : 'sent');
const newId = () => `s${Math.random().toString(36).slice(2, 8)}`;
const blank = (type: SectionType, title: string, items: string[] = []): Section => ({
  id: newId(),
  type,
  title,
  items,
  cols: [],
  units: [],
});
/** How many one-to-ones a person of this team should have per month. */
const targetOf = (target: Target | null, teamId: string | null) =>
  Math.max(1, (teamId ? target?.teams[teamId] : undefined) ?? target?.target ?? 1);
/** The days a one-to-one looks at: [from, to). */
function windowOf(heldOn: string, period: Period, from: string, to: string): [string, string] {
  const d = new Date(`${heldOn}T12:00:00`);
  const day = (x: Date) => x.toLocaleDateString('sv-SE');
  const next = day(new Date(d.getTime() + 864e5));
  if (period === 'custom' && from)
    return [from, to ? day(new Date(new Date(`${to}T12:00:00`).getTime() + 864e5)) : next];
  if (period === 'week') return [day(new Date(d.getTime() - 7 * 864e5)), next];
  if (period === 'year') return [`${heldOn.slice(0, 4)}-01-01`, next];
  return [`${heldOn.slice(0, 7)}-01`, next];
}

/** The sections of a one-to-one without a template (also the start of a new template), in the writer's language. */
function useDefaults() {
  const { t } = useTranslation();
  return useCallback(
    (): Section[] => [
      { ...blank('text', t('o2o.defaults.strengths')), id: 'str' },
      { ...blank('text', t('o2o.defaults.improve')), id: 'imp' },
      { ...blank('objectives', t('o2o.defaults.objectives')), id: 'obj' },
      { ...blank('text', t('o2o.defaults.plan')), id: 'plan' },
      { ...blank('text', t('o2o.defaults.comments')), id: 'acm' },
      {
        ...blank('agree', t('o2o.defaults.agreement'), [t('o2o.defaults.agree1'), t('o2o.defaults.agree2')]),
        id: 'agr',
      },
    ],
    [t],
  );
}

export function OneToOne({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { session?: string };
  const agentView = company.role === 'agent';
  const writes = can(company.role, 'oneToOnes.write');
  const defaults = useDefaults();
  const { message, run, fail } = useAction();
  const [view, setView] = useState<'list' | 'edit' | 'read' | 'templates'>('list');
  const [sessions, setSessions] = useState<OneToOneRow[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState('');
  const [targetForm, setTargetForm] = useState(false);
  /** what the form just did (the form itself closes) */
  const [done, setDone] = useState('');
  const [per, setPer] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [team, setTeam] = useState('');
  const [agent, setAgent] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api<OneToOneRow[]>('/coaching-sessions', company.id).then(
      (l) => setSessions(l.filter((s) => s.kind === 'o2o')),
      fail,
    );
    api<Template[]>('/one-to-ones/templates', company.id).then(setTemplates, fail);
    api<Target>('/one-to-ones/target', company.id).then(setTarget, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    if (agentView) return;
    void Promise.all([
      api<PersonRow[]>('/people', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      api<Task[]>('/tasks', company.id),
    ]).then(([ppl, tm, r, pr, tk]) => {
      setPeople(ppl.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)));
      setTeams(tm.filter((x) => !x.isAdministration).sort((a, b) => a.name.localeCompare(b.name)));
      setReviews(r);
      setRates(pr);
      setTasks(tk);
    }, fail);
  }, [company.id, agentView, fail]);

  const agents = people.filter((p) => p.role === 'agent');
  const all = useMemo(() => sessions ?? [], [sessions]);
  const templateFor = (teamId: string) => templates.find((x) => x.teamIds.includes(teamId));
  const startNew = (agentId = '') => {
    setDone('');
    const teamId = agents.find((a) => a.membershipId === agentId)?.teamId ?? team;
    const tpl = teamId ? templateFor(teamId) : undefined;
    setDraft({
      teamId,
      agentId,
      templateId: tpl?.id ?? '',
      heldOn: today(),
      period: 'month',
      periodFrom: '',
      periodTo: '',
      sections: structuredClone(tpl?.sections ?? defaults()),
      answers: {},
      followUpOn: '',
      state: '',
      inPerson: false,
      makeTasks: false,
      leadSignature: null,
      signatures: {},
    });
    setView('edit');
    window.scrollTo(0, 0);
  };
  const edit = (s: OneToOneRow) => {
    setDraft({
      id: s.id,
      teamId: s.agents[0]?.teamId ?? '',
      agentId: s.agents[0]?.id ?? '',
      templateId: s.templateId ?? '',
      heldOn: s.heldOn,
      period: s.period,
      periodFrom: s.periodFrom ?? '',
      periodTo: s.periodTo ?? '',
      sections: structuredClone(s.sections.length ? s.sections : defaults()),
      answers: structuredClone(s.answers),
      followUpOn: s.followUpOn ?? '',
      state: s.state,
      inPerson: false,
      makeTasks: false,
      leadSignature: s.leadSignature,
      signatures: s.signatures,
    });
    setView('edit');
    window.scrollTo(0, 0);
  };
  const open = useCallback(
    (s: OneToOneRow) => {
      if (stateOf(s) === 'draft' && writes) return edit(s);
      setOpenId(s.id);
      setView('read');
      window.scrollTo(0, 0);
    },
    [writes, templates],
  );
  // the bell's link: /quality/one-to-one?session=…
  useEffect(() => {
    if (!search.session || !sessions) return;
    const s = sessions.find((x) => x.id === search.session);
    if (s) open(s);
    void navigate({
      to: '/$app/$page',
      params: { app: 'quality', page: 'one-to-one' },
      search: {},
      replace: true,
    });
  }, [search.session, sessions, open, navigate]);
  const remove = (s: OneToOneRow) => {
    if (!window.confirm(t('o2o.confirmDelete'))) return;
    void run(
      () => api(`/one-to-ones/${s.id}`, company.id, { method: 'DELETE' }),
      t('o2o.deleted'),
      () => {
        setView('list');
        load();
      },
    );
  };
  const back = () => {
    setView('list');
    setDraft(null);
  };

  if (!sessions) return <p className="text-mu">{t('common.loading')}</p>;
  if (view === 'templates' && writes)
    return (
      <Templates
        company={company}
        templates={templates}
        teams={teams}
        defaults={defaults}
        onBack={back}
        onSaved={load}
      />
    );
  if (view === 'edit' && draft)
    return (
      <Editor
        company={company}
        draft={draft}
        setDraft={setDraft}
        templates={templates}
        teams={teams}
        agents={agents}
        sessions={all}
        reviews={reviews}
        rates={rates}
        tasks={tasks}
        defaults={defaults}
        onBack={back}
        onSaved={(text) => {
          back();
          setDone(text);
          load();
        }}
      />
    );
  const opened = all.find((s) => s.id === openId);
  if (view === 'read' && opened)
    return (
      <Reader company={company} s={opened} writes={writes} onBack={back} onEdit={() => edit(opened)} onSigned={load} />
    );

  const month = today().slice(0, 7);
  const ago = (s: OneToOneRow) => (Date.now() - new Date(`${s.heldOn}T12:00:00`).getTime()) / 864e5;
  const q = query.trim().toLowerCase();
  const list = all
    .filter((s) =>
      per === 'all'
        ? true
        : per === 'year'
          ? s.heldOn.slice(0, 4) === month.slice(0, 4)
          : per === 'month'
            ? s.heldOn.slice(0, 7) === month
            : ago(s) < 7,
    )
    .filter((s) => !team || s.agents.some((a) => a.teamId === team))
    .filter((s) => !agent || s.agents.some((a) => a.id === agent))
    .filter((s) => !q || [s.title, s.byName, ...s.agents.map((a) => a.name)].some((v) => v.toLowerCase().includes(q)));

  return (
    <section className="grid gap-4" aria-labelledby="o2o-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="o2o-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('o2o.title')}
          </h1>
          <p className="text-sm text-mu">{agentView ? t('o2o.introAgent') : t('o2o.intro')}</p>
        </div>
        {!agentView && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${pill} bg-ac/15 text-ac`} title={t('o2o.target.help')}>
              {t('o2o.target.pill', { count: target?.target ?? 1 })}
            </span>
            {can(company.role, 'settings.write') && (
              <button type="button" className={smallButton} onClick={() => setTargetForm(true)}>
                {t('o2o.target.change')}
              </button>
            )}
            {writes && (
              <>
                <button type="button" className={smallButton} onClick={() => setView('templates')}>
                  {t('o2o.templates.open')}
                </button>
                <button type="button" className={primaryButton} onClick={() => startNew()}>
                  + {t('o2o.new')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <Notice message={message ?? (done ? { ok: true, text: done } : null)} />
      {!agentView && (
        <ThisMonth
          sessions={all}
          agents={agents.filter((a) => !team || a.teamId === team)}
          people={people}
          teams={teams}
          target={target}
          writes={writes}
          onWrite={startNew}
        />
      )}
      <section className={`${card} grid gap-3 p-3`} aria-label={t('o2o.list')}>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <b className="mr-auto">{t('o2o.count', { count: list.length })}</b>
          <div className="flex gap-1" role="group" aria-label={t('o2o.period.label')}>
            {(['week', 'month', 'year', 'all'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={per === k}
                className={`rounded-s px-2 py-1 font-semibold ${per === k ? 'bg-brand text-on-brand' : 'border border-bd hover:border-tx'}`}
                onClick={() => setPer(k)}
              >
                {t(`o2o.period.${k}`)}
              </button>
            ))}
          </div>
          {!agentView && (
            <>
              <label className="grid gap-1 font-medium">
                {t('tasks.filters.team')}
                <select
                  className={field}
                  value={team}
                  onChange={(e) => {
                    setTeam(e.target.value);
                    setAgent('');
                  }}
                >
                  <option value="">{t('tasks.filters.allTeams')}</option>
                  {teams.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 font-medium">
                {t('o2o.agent')}
                <select className={field} value={agent} onChange={(e) => setAgent(e.target.value)}>
                  <option value="">{t('o2o.allAgents')}</option>
                  {agents
                    .filter((a) => !team || a.teamId === team)
                    .map((a) => (
                      <option key={a.membershipId} value={a.membershipId}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label className="grid gap-1 font-medium">
            {t('tasks.filters.search')}
            <input className={field} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        {!list.length ? (
          <Empty>{t('o2o.none')}</Empty>
        ) : (
          <ul className="grid gap-1">
            {list.map((s) => {
              const st = stateOf(s);
              const tpl = templates.find((x) => x.id === s.templateId);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-2 border-t border-bd pt-2 text-sm">
                  <button type="button" className="grid min-w-0 flex-1 text-left hover:text-ac" onClick={() => open(s)}>
                    <span>
                      <b>{s.agents.map((a) => a.name).join(', ')}</b>{' '}
                      <small className="text-mu">{[...new Set(s.agents.map((a) => a.teamName))].join(', ')}</small>
                    </span>
                    <small className="text-mu">
                      {t('o2o.lead')}: {s.leadSignature?.name ?? s.byName} · {s.heldOn} · <PeriodText s={s} />
                    </small>
                  </button>
                  {tpl && <span className={`${pill} bg-bd/40`}>{tpl.name}</span>}
                  <span className={`${pill} ${STATE_LOOK[st]}`}>{t(`o2o.state.${st}`)}</span>
                  {writes && (
                    <span className="flex gap-1">
                      <button type="button" className={smallButton} onClick={() => edit(s)}>
                        {t('common.edit')}
                      </button>
                      <button type="button" className={`${smallButton} text-bad`} onClick={() => remove(s)}>
                        {t('common.delete')}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {targetForm && target && (
        <TargetForm
          company={company}
          target={target}
          teams={teams}
          onClose={() => setTargetForm(false)}
          onSaved={(x) => {
            setTarget(x);
            setTargetForm(false);
            setDone(t('o2o.target.saved'));
          }}
        />
      )}
    </section>
  );
}

function PeriodText({ s }: { s: Pick<OneToOneRow, 'period' | 'periodFrom' | 'periodTo' | 'heldOn'> }) {
  const { t } = useTranslation();
  if (s.period === 'custom' && s.periodFrom) return <>{`${s.periodFrom} → ${s.periodTo ?? '…'}`}</>;
  const p = s.period === 'custom' ? 'month' : s.period;
  return <>{`${t(`o2o.period.${p}`)} · ${p === 'year' ? s.heldOn.slice(0, 4) : s.heldOn.slice(0, 7)}`}</>;
}

/** This month: who is below the target (a name writes one) and how far every team lead is. */
function ThisMonth({
  sessions,
  agents,
  people,
  teams,
  target,
  writes,
  onWrite,
}: {
  sessions: OneToOneRow[];
  agents: PersonRow[];
  people: PersonRow[];
  teams: TeamRow[];
  target: Target | null;
  writes: boolean;
  onWrite: (agentId: string) => void;
}) {
  const { t } = useTranslation();
  const month = today().slice(0, 7);
  const count: Record<string, number> = {};
  for (const s of sessions)
    if (stateOf(s) !== 'draft' && s.heldOn.slice(0, 7) === month)
      for (const a of s.agents) count[a.id] = (count[a.id] ?? 0) + 1;
  const missing = agents.filter((a) => (count[a.membershipId] ?? 0) < targetOf(target, a.teamId));
  const leads = people
    .filter((p) => p.role === 'lead')
    .map((l) => {
      const own = teams.filter((x) => x.leadId === l.membershipId);
      const mine = agents.filter((a) => own.some((x) => x.id === a.teamId));
      const need = mine.reduce((n, a) => n + targetOf(target, a.teamId), 0);
      const got = mine.reduce((n, a) => n + Math.min(count[a.membershipId] ?? 0, targetOf(target, a.teamId)), 0);
      return { l, own, n: mine.length, need, got };
    })
    .filter((x) => x.n);
  return (
    <>
      {missing.length ? (
        <section className={`${card} grid gap-2`} aria-label={t('o2o.missing')}>
          <h2 className="font-semibold">
            {t('o2o.missing')} <span className={`${pill} bg-bad/15 text-bad`}>{missing.length}</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {missing.map((a) => {
              const n = targetOf(target, a.teamId);
              const label = (
                <>
                  {a.name}{' '}
                  <small className="text-mu">
                    ({a.teamName}){n > 1 ? ` · ${count[a.membershipId] ?? 0}/${n}` : ''}
                  </small>
                </>
              );
              return writes ? (
                <button
                  key={a.membershipId}
                  type="button"
                  className={smallButton}
                  title={t('o2o.write')}
                  onClick={() => onWrite(a.membershipId)}
                >
                  {label}
                </button>
              ) : (
                <span key={a.membershipId} className="rounded-s border border-bd px-2 py-1 text-xs">
                  {label}
                </span>
              );
            })}
          </div>
        </section>
      ) : (
        agents.length > 0 && <p className={`${card} text-sm text-ok`}>✓ {t('o2o.allReached')}</p>
      )}
      {leads.length > 0 && (
        <section className={`${card} grid gap-2`} aria-label={t('o2o.completion', { month })}>
          <h2 className="font-semibold">{t('o2o.completion', { month })}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((x) => {
              const p = x.need ? (x.got / x.need) * 100 : 0;
              return (
                <div key={x.l.membershipId} className="grid gap-1 text-sm">
                  <span className="flex justify-between gap-2">
                    <b>{x.l.name}</b>
                    <b className="font-mono">{Math.round(p)}%</b>
                  </span>
                  <small className="text-mu">{x.own.map((o) => o.name).join(', ')}</small>
                  <Bar value={p} tone={colour(p, 85)} />
                  <small className="text-mu">{t('o2o.completionLine', { got: x.got, need: x.need, count: x.n })}</small>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------- one section

/** One section of a one-to-one: written in the form, or read (the agent's view, a signed one). */
function SectionView({
  x,
  n,
  answers,
  setAnswer,
}: {
  x: Section;
  n: number;
  answers: Record<string, unknown>;
  /** missing: read only */
  setAnswer?: (v: unknown) => void;
}) {
  const { t } = useTranslation();
  const v = answers[x.id];
  const ro = !setAnswer;
  const at = (k: string | number) => obj(v)[String(k)];
  const put = (k: string | number, value: unknown) => setAnswer?.({ ...obj(v), [String(k)]: value });
  let body: ReactNode = null;
  if (x.type === 'text')
    body = ro ? (
      <p className="whitespace-pre-wrap text-sm">{typeof v === 'string' && v ? v : '-'}</p>
    ) : (
      <textarea
        className={field}
        rows={3}
        maxLength={4000}
        aria-label={x.title}
        value={typeof v === 'string' ? v : ''}
        onChange={(e) => setAnswer(e.target.value)}
      />
    );
  else if (x.type === 'check')
    body = x.items.map((it, i) => {
      const c = obj(at(i));
      return (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="inline-flex flex-1 items-center gap-2">
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              disabled={ro}
              checked={c['c'] === true}
              onChange={(e) => put(i, { ...c, c: e.target.checked })}
            />
            {it}
          </label>
          {ro ? (
            c['n'] ? (
              <small className="text-mu">{String(c['n'])}</small>
            ) : null
          ) : (
            <input
              className={`${field} flex-1`}
              maxLength={200}
              aria-label={t('o2o.note')}
              placeholder={t('o2o.note')}
              value={String(c['n'] ?? '')}
              onChange={(e) => put(i, { ...c, n: e.target.value })}
            />
          )}
        </div>
      );
    });
  else if (x.type === 'yesno')
    body = x.items.map((it, i) => (
      <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{it}</span>
        <span className="flex gap-1" role="group" aria-label={it}>
          {(['y', 'n', 'na'] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={ro}
              aria-pressed={at(i) === k}
              className={`rounded-s px-2 py-0.5 text-xs font-semibold ${at(i) === k ? 'bg-brand text-on-brand' : 'border border-bd'}`}
              onClick={() => put(i, k)}
            >
              {t(`o2o.yesno.${k}`)}
            </button>
          ))}
        </span>
      </div>
    ));
  else if (x.type === 'objectives') {
    const l = objectives(v);
    body = ro ? (
      l.length ? (
        <ol className="grid gap-1 text-sm">
          {l.map((o, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {i + 1}. {o.text}
              </span>
              <small className="text-mu">{o.dueOn}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-mu">-</p>
      )
    ) : (
      <>
        {l.map((o, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <b className="font-mono text-sm">{i + 1}.</b>
            <input
              className={`${field} min-w-40 flex-[2]`}
              maxLength={200}
              aria-label={t('o2o.objective')}
              placeholder={t('o2o.objective')}
              value={o.text}
              onChange={(e) => setAnswer(l.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))}
            />
            <input
              className={`${field} flex-1`}
              type="date"
              aria-label={t('o2o.deadline')}
              value={o.dueOn}
              onChange={(e) => setAnswer(l.map((y, j) => (j === i ? { ...y, dueOn: e.target.value } : y)))}
            />
            <button
              type="button"
              className="text-mu hover:text-bad"
              aria-label={t('o2o.remove')}
              onClick={() => setAnswer(l.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className={`${smallButton} justify-self-start`}
          onClick={() => setAnswer([...l, { text: '', dueOn: '' }])}
        >
          + {t('o2o.addObjective')}
        </button>
      </>
    );
  } else if (x.type === 'rating') {
    const stars = (value: number, onPick: (s: number) => void, label: string) => (
      <span className="flex gap-0.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={ro}
            aria-label={`${s}`}
            aria-pressed={value >= s}
            className={`text-lg leading-none ${value >= s ? 'text-wn' : 'text-bd2'}`}
            onClick={() => onPick(s)}
          >
            ★
          </button>
        ))}
      </span>
    );
    body = x.items.length
      ? x.items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{it}</span>
            {stars(Number(at(i) ?? 0), (s) => put(i, s), it)}
          </div>
        ))
      : stars(Number(v ?? 0), (s) => setAnswer?.(s), x.title);
  } else if (x.type === 'metrics')
    body = (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {x.items.map((it, i) => (
          <label key={i} className="grid gap-1 text-sm">
            <small className="text-mu">{it}</small>
            {ro ? (
              <b>
                {at(i) === undefined || at(i) === null ? '-' : String(at(i))} {x.units[i] ?? ''}
              </b>
            ) : (
              <span className="flex items-center gap-1">
                <input
                  className={`${field} w-full`}
                  type="number"
                  value={at(i) === undefined || at(i) === null ? '' : String(at(i))}
                  onChange={(e) => put(i, e.target.value === '' ? null : Number(e.target.value))}
                />
                <small>{x.units[i] ?? ''}</small>
              </span>
            )}
          </label>
        ))}
      </div>
    );
  else if (x.type === 'table') {
    const cols = x.cols.length ? x.cols : [t('o2o.value')];
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c} className="px-1 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {x.items.map((r, i) => (
              <tr key={i} className="border-t border-bd">
                <td className="px-1 font-semibold">{r}</td>
                {cols.map((c, j) => (
                  <td key={c} className="px-1 py-0.5">
                    {ro ? (
                      String(at(`${i}_${j}`) ?? '')
                    ) : (
                      <input
                        className={`${field} w-full`}
                        maxLength={200}
                        aria-label={`${r}: ${c}`}
                        value={String(at(`${i}_${j}`) ?? '')}
                        onChange={(e) => put(`${i}_${j}`, e.target.value)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (x.type === 'agree')
    body = (
      <>
        <ul className="list-disc pl-5 text-sm">
          {x.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
        <small className="text-mu">{t('o2o.agreeHelp')}</small>
      </>
    );
  return (
    <section className={`${card} grid gap-2`} aria-label={x.title}>
      <h2 className="flex flex-wrap items-baseline gap-2 font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs text-on-brand">{n}</span>
        {x.title} <small className="font-normal text-mu">{t(`o2o.types.${x.type}.name`)}</small>
      </h2>
      {body}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- the form

function Editor({
  company,
  draft,
  setDraft,
  templates,
  teams,
  agents,
  sessions,
  reviews,
  rates,
  tasks,
  defaults,
  onBack,
  onSaved,
}: {
  company: CompanyRef;
  draft: Draft;
  setDraft: (d: Draft) => void;
  templates: Template[];
  teams: TeamRow[];
  agents: PersonRow[];
  sessions: OneToOneRow[];
  reviews: ReviewRow[];
  rates: PassRates | null;
  tasks: Task[];
  defaults: () => Section[];
  onBack: () => void;
  onSaved: (text: string) => void;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { me: myself } = useSession();
  const { message, run, fail } = useAction();
  const set = (change: Partial<Draft>) => setDraft({ ...draft, ...change });
  const signed = draft.state === 'signed';
  const tpl = templates.find((x) => x.id === draft.templateId);
  const me = agents.find((a) => a.membershipId === draft.agentId);
  const agentSigned = !!draft.signatures[draft.agentId];
  const pickTemplate = (id: string) => {
    const x = templates.find((y) => y.id === id);
    set({ templateId: id, sections: structuredClone(x?.sections ?? defaults()) });
  };
  async function save(state: State) {
    if (!draft.agentId) return fail(new Error(t('o2o.chooseAgent')));
    if (state === 'signed' && !draft.inPerson && !agentSigned) return fail(new Error(t('errors.oneToOneSign')));
    const body = {
      agentId: draft.agentId,
      heldOn: draft.heldOn,
      title: tpl?.name ?? t('o2o.one'),
      templateId: draft.templateId || null,
      period: draft.period,
      periodFrom: draft.periodFrom || null,
      periodTo: draft.periodTo || null,
      sections: draft.sections,
      answers: draft.answers,
      followUpOn: draft.followUpOn || null,
      state,
      inPerson: draft.inPerson,
      makeTasks: draft.makeTasks,
    };
    const text = t(`o2o.saved.${signed ? 'signed' : state}`);
    await run(
      () =>
        api(draft.id ? `/one-to-ones/${draft.id}` : '/one-to-ones', company.id, {
          method: draft.id ? 'PUT' : 'POST',
          body,
        }),
      text,
      () => onSaved(text),
    );
  }
  const shownAgents = agents.filter((a) => !draft.teamId || a.teamId === draft.teamId);
  return (
    <section className="grid gap-4" aria-labelledby="o2o-edit-title">
      <div className="grid gap-1">
        <h1 id="o2o-edit-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {draft.id ? t('o2o.editTitle') : t('o2o.new')}
        </h1>
        <p className="text-sm text-mu">{t('o2o.editIntro')}</p>
      </div>
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        <button type="button" className={smallButton} onClick={onBack}>
          ← {t('o2o.back')}
        </button>
        {tpl && <span className={`${pill} bg-bd/40`}>{tpl.name}</span>}
        <span className="flex-1" />
        {!signed && (
          <>
            <button type="button" className={smallButton} onClick={() => void save('draft')}>
              {t('o2o.saveDraft')}
            </button>
            <button type="button" className={smallButton} onClick={() => void save('sent')}>
              {t('o2o.send')}
            </button>
          </>
        )}
        <button type="button" className={primaryButton} onClick={() => void save('signed')}>
          ✓ {signed ? t('o2o.save') : t('o2o.complete')}
        </button>
      </div>
      <Notice message={message} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3">
          <section className={`${card} grid gap-3`} aria-label={t('o2o.details')}>
            <h2 className="font-semibold">{t('o2o.details')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                {t('tasks.filters.team')}
                <select
                  className={field}
                  value={draft.teamId}
                  disabled={signed}
                  onChange={(e) => {
                    const x = templates.find((y) => y.teamIds.includes(e.target.value));
                    set({
                      teamId: e.target.value,
                      agentId: '',
                      ...(x && !draft.id ? { templateId: x.id, sections: structuredClone(x.sections) } : {}),
                    });
                  }}
                >
                  <option value="">{t('tasks.filters.allTeams')}</option>
                  {teams.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t('o2o.template')}
                <select
                  className={field}
                  value={draft.templateId}
                  disabled={signed}
                  onChange={(e) => {
                    if (Object.keys(draft.answers).length && !window.confirm(t('o2o.changeTemplate'))) return;
                    pickTemplate(e.target.value);
                  }}
                >
                  <option value="">{t('o2o.noTemplate')}</option>
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.teamIds.includes(draft.teamId) ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t('o2o.agent')}
                <select
                  className={field}
                  value={draft.agentId}
                  disabled={signed}
                  onChange={(e) => {
                    const a = agents.find((p) => p.membershipId === e.target.value);
                    const teamId = draft.teamId || a?.teamId || '';
                    const x =
                      !draft.templateId && teamId ? templates.find((y) => y.teamIds.includes(teamId)) : undefined;
                    set({
                      agentId: e.target.value,
                      teamId,
                      ...(x ? { templateId: x.id, sections: structuredClone(x.sections) } : {}),
                    });
                  }}
                >
                  <option value="">{t('o2o.chooseAgent')}</option>
                  {shownAgents.map((a) => (
                    <option key={a.membershipId} value={a.membershipId}>
                      {a.name} · {a.teamName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t('o2o.date')}
                <input
                  className={field}
                  type="date"
                  required
                  value={draft.heldOn}
                  onChange={(e) => set({ heldOn: e.target.value })}
                />
              </label>
              <div className="grid gap-1 text-sm font-medium">
                {t('o2o.period.label')}
                <span className="flex flex-wrap gap-1" role="group" aria-label={t('o2o.period.label')}>
                  {(['week', 'month', 'year', 'custom'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={draft.period === k}
                      className={`rounded-s px-2 py-1 text-xs font-semibold ${draft.period === k ? 'bg-brand text-on-brand' : 'border border-bd hover:border-tx'}`}
                      onClick={() => set({ period: k })}
                    >
                      {t(`o2o.period.${k}`)}
                    </button>
                  ))}
                </span>
              </div>
              {draft.period === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-sm font-medium">
                    {t('o2o.from')}
                    <input
                      className={field}
                      type="date"
                      value={draft.periodFrom}
                      onChange={(e) => set({ periodFrom: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    {t('o2o.to')}
                    <input
                      className={field}
                      type="date"
                      value={draft.periodTo}
                      onChange={(e) => set({ periodTo: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </div>
          </section>
          {draft.sections.map((x, i) => (
            <SectionView
              key={x.id}
              x={x}
              n={i + 1}
              answers={draft.answers}
              setAnswer={(v) => set({ answers: { ...draft.answers, [x.id]: v } })}
            />
          ))}
          <section className={`${card} grid gap-2`} aria-label={t('o2o.signatures')}>
            <h2 className="font-semibold">{t('o2o.signatures')}</h2>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="grid gap-0.5">
                <small className="text-mu">{t('o2o.lead')}</small>
                <b>{draft.leadSignature?.name ?? myself.name ?? ''}</b>
                <small className="text-mu">
                  {draft.leadSignature ? `✍ ${when(draft.leadSignature.at, lang)}` : t('o2o.leadSigns')}
                </small>
              </div>
              <div className="grid gap-0.5">
                <small className="text-mu">{t('o2o.agent')}</small>
                <b>{me?.name ?? '-'}</b>
                {agentSigned ? (
                  <small className="text-mu">✍ {when(draft.signatures[draft.agentId]?.at ?? '', lang)}</small>
                ) : (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)]"
                      checked={draft.inPerson}
                      onChange={(e) => set({ inPerson: e.target.checked })}
                    />
                    {t('o2o.inPerson')}
                  </label>
                )}
              </div>
            </div>
            <small className="text-mu">{t('o2o.howToSign')}</small>
            <label className="inline-flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--brand)]"
                checked={draft.makeTasks}
                onChange={(e) => set({ makeTasks: e.target.checked })}
              />
              <span>{t('o2o.makeTasks')}</span>
            </label>
            <label className="grid max-w-xs gap-1 text-sm font-medium">
              {t('o2o.next')}
              <input
                className={field}
                type="date"
                value={draft.followUpOn}
                onChange={(e) => set({ followUpOn: e.target.value })}
              />
            </label>
          </section>
        </div>
        <Snapshot draft={draft} agent={me} sessions={sessions} reviews={reviews} rates={rates} tasks={tasks} />
      </div>
    </section>
  );
}

/** The agent's numbers for the period of the one-to-one, and what was agreed last time. */
function Snapshot({
  draft,
  agent,
  sessions,
  reviews,
  rates,
  tasks,
}: {
  draft: Draft;
  agent: PersonRow | undefined;
  sessions: OneToOneRow[];
  reviews: ReviewRow[];
  rates: PassRates | null;
  tasks: Task[];
}) {
  const { t } = useTranslation();
  if (!agent)
    return (
      <aside className={`${card} grid gap-2 text-sm`}>
        <h2 className="font-semibold">{t('o2o.snapshot.title')}</h2>
        <p className="text-mu">{t('o2o.snapshot.choose')}</p>
      </aside>
    );
  const [from, to] = windowOf(draft.heldOn, draft.period, draft.periodFrom, draft.periodTo);
  const mine = reviews.filter(
    (r) => r.agentId === agent.membershipId && r.reviewedOn >= from && r.reviewedOn < to && !r.notScored,
  );
  const avg = averageScore(mine);
  const passed = mine.length ? (mine.filter((r) => isPass(r, rates)).length / mine.length) * 100 : null;
  const open = tasks.filter((x) => x.assigneeId === agent.membershipId && x.status !== 'done' && !x.archivedAt).length;
  const weak = categoryNames(mine)
    .map((name) => {
      const l = mine.map((r) => categoryValue(r, name)).filter((v): v is number => v !== null);
      return { name, value: l.reduce((a, b) => a + b, 0) / (l.length || 1) };
    })
    .sort((a, b) => a.value - b.value)
    .slice(0, 3);
  const last = sessions
    .filter((s) => s.id !== draft.id && s.agents.some((a) => a.id === agent.membershipId) && stateOf(s) !== 'draft')
    .sort((a, b) => b.heldOn.localeCompare(a.heldOn))[0];
  const tiles: [string, string][] = [
    [t('o2o.snapshot.reviews'), String(mine.length)],
    [t('o2o.snapshot.average'), avg === null ? '-' : `${avg.toFixed(1)}%`],
    [t('o2o.snapshot.passed'), passed === null ? '-' : `${Math.round(passed)}%`],
    [t('o2o.snapshot.openTasks'), String(open)],
  ];
  return (
    <aside
      className={`${card} grid content-start gap-3 text-sm lg:sticky lg:top-4`}
      aria-label={t('o2o.snapshot.title')}
    >
      <h2 className="font-semibold">
        {t('o2o.snapshot.title')} <small className="font-normal text-mu">{agent.name}</small>
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(([k, v]) => (
          <div key={k} className="grid rounded-s border border-bd p-2">
            <small className="text-mu">{k}</small>
            <b className="font-display text-lg">{v}</b>
          </div>
        ))}
      </div>
      {weak.length ? (
        <div className="grid gap-1">
          <small className="text-mu">{t('o2o.snapshot.weakest')}</small>
          {weak.map((w) => (
            <div key={w.name} className="grid gap-0.5">
              <span className="flex justify-between gap-2">
                <span>{w.name}</span>
                <b className="font-mono">{Math.round(w.value)}%</b>
              </span>
              <Bar value={w.value} tone={colour(w.value, 85)} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-mu">{t('o2o.snapshot.noReviews')}</p>
      )}
      {last && last.actions.length > 0 && (
        <div className="grid gap-1">
          <small className="text-mu">{t('o2o.snapshot.last', { date: last.heldOn })}</small>
          {last.actions.map((a, i) => (
            <span key={i} className="flex gap-2">
              <span className={a.done ? 'text-ok' : 'text-mu'}>{a.done ? '☑' : '☐'}</span>
              <span>{a.text}</span>
              {a.dueOn && <small className="text-mu">{a.dueOn}</small>}
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------------------------- reading one

/** A one-to-one to read: the agent reads and signs it here. */
function Reader({
  company,
  s,
  writes,
  onBack,
  onEdit,
  onSigned,
}: {
  company: CompanyRef;
  s: OneToOneRow;
  writes: boolean;
  onBack: () => void;
  onEdit: () => void;
  onSigned: () => void;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { message, run } = useAction();
  const [comment, setComment] = useState('');
  const me = useSession().company?.membershipId ?? '';
  const st = stateOf(s);
  const toSign = s.agents.some((a) => a.id === me) && !s.signatures[me] && s.status === 'done';
  return (
    <section className="grid max-w-3xl gap-4" aria-labelledby="o2o-read-title">
      <div className="grid gap-1">
        <h1 id="o2o-read-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {s.title}
        </h1>
        <p className="text-sm text-mu">
          {s.agents.map((a) => a.name).join(', ')} · {s.heldOn} · <PeriodText s={s} />
        </p>
      </div>
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        <button type="button" className={smallButton} onClick={onBack}>
          ← {t('o2o.back')}
        </button>
        <span className="flex-1" />
        {writes && (
          <button type="button" className={smallButton} onClick={onEdit}>
            {t('common.edit')}
          </button>
        )}
      </div>
      <Notice message={message} />
      {s.sections.map((x, i) => (
        <SectionView key={x.id} x={x} n={i + 1} answers={s.answers} />
      ))}
      <section className={`${card} grid gap-2`} aria-label={t('o2o.signatures')}>
        <h2 className="flex flex-wrap items-center gap-2 font-semibold">
          {t('o2o.signatures')} <span className={`${pill} ${STATE_LOOK[st]}`}>{t(`o2o.state.${st}`)}</span>
        </h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="grid gap-0.5">
            <small className="text-mu">{t('o2o.lead')}</small>
            <b>{s.leadSignature?.name ?? s.byName}</b>
            {s.leadSignature && <small className="text-mu">✍ {when(s.leadSignature.at, lang)}</small>}
          </div>
          {s.agents.map((a) => {
            const g = s.signatures[a.id];
            return (
              <div key={a.id} className="grid gap-0.5">
                <small className="text-mu">{t('o2o.agent')}</small>
                <b>{a.name}</b>
                <small className="text-mu">
                  {g
                    ? `✍ ${when(g.at, lang)}${g.inPerson ? ` · ${t('o2o.inPersonShort')}` : ''}`
                    : t('coaching.notSigned')}
                </small>
                {g?.comment && <q className="text-xs italic">{g.comment}</q>}
              </div>
            );
          })}
        </div>
        {toSign && (
          <form
            className="grid gap-2 border-t border-bd pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api(`/coaching-sessions/${s.id}/sign`, company.id, { method: 'POST', body: { comment } }),
                t('coaching.thanks'),
                onSigned,
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
              ✍ {t('coaching.sign')}
            </button>
          </form>
        )}
      </section>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- templates

function Templates({
  company,
  templates,
  teams,
  defaults,
  onBack,
  onSaved,
}: {
  company: CompanyRef;
  templates: Template[];
  teams: TeamRow[];
  defaults: () => Section[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { message, run } = useAction();
  const fresh = (): Template => ({ id: '', name: '', teamIds: [], sections: defaults() });
  const [T, setT] = useState<Template>(() => structuredClone(templates[0] ?? fresh()));
  const [adding, setAdding] = useState(false);
  const setSection = (i: number, change: Partial<Section>) =>
    setT({ ...T, sections: T.sections.map((x, j) => (j === i ? { ...x, ...change } : x)) });
  const move = (i: number, d: number) => {
    const l = [...T.sections];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j] as Section, l[i] as Section];
    setT({ ...T, sections: l });
  };
  const usedBy = (teamId: string) =>
    templates.filter((x) => x.id !== T.id && x.teamIds.includes(teamId)).map((x) => x.name);
  const save = () =>
    void run(
      async () => {
        const body = { name: T.name, teamIds: T.teamIds, sections: T.sections };
        const out = await api<Template>(
          T.id ? `/one-to-ones/templates/${T.id}` : '/one-to-ones/templates',
          company.id,
          {
            method: T.id ? 'PUT' : 'POST',
            body,
          },
        );
        setT(structuredClone(out));
      },
      t('o2o.templates.saved'),
      onSaved,
    );
  const remove = () => {
    if (!window.confirm(t('o2o.templates.confirmDelete'))) return;
    void run(
      () => api(`/one-to-ones/templates/${T.id}`, company.id, { method: 'DELETE' }),
      t('o2o.templates.deleted'),
      () => {
        setT(fresh());
        onSaved();
      },
    );
  };
  const itemsText = (x: Section) =>
    x.type === 'metrics'
      ? x.items.map((it, j) => it + (x.units[j] ? ` | ${x.units[j]}` : '')).join('\n')
      : x.items.join('\n');
  const setItems = (i: number, x: Section, v: string) => {
    const l = v.split('\n').map((s) => s.trimStart());
    if (x.type === 'metrics')
      setSection(i, {
        items: l.map((s) => s.split('|')[0] ?? ''),
        units: l.map((s) => (s.split('|')[1] ?? '').trim()),
      });
    else setSection(i, { items: l });
  };
  return (
    <section className="grid gap-4" aria-labelledby="o2o-tpl-title">
      <div className="grid gap-1">
        <h1 id="o2o-tpl-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('o2o.templates.title')}
        </h1>
        <p className="text-sm text-mu">{t('o2o.templates.intro')}</p>
      </div>
      <div className={card}>
        <button type="button" className={smallButton} onClick={onBack}>
          ← {t('o2o.back')}
        </button>
      </div>
      <Notice message={message} />
      <div className="grid items-start gap-4 lg:grid-cols-[260px_1fr]">
        <nav className={`${card} grid gap-1`} aria-label={t('o2o.templates.list')}>
          <span className="flex justify-between text-sm">
            <b>{t('o2o.templates.list')}</b>
            <small className="text-mu">{templates.length}</small>
          </span>
          {templates.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={T.id === x.id}
              className={`grid rounded-s border p-2 text-left text-sm ${T.id === x.id ? 'border-brand' : 'border-bd hover:border-tx'}`}
              onClick={() => setT(structuredClone(x))}
            >
              <b>{x.name}</b>
              <small className="text-mu">
                {x.teamIds
                  .map((id) => teams.find((y) => y.id === id)?.name ?? '')
                  .filter(Boolean)
                  .join(', ') || t('o2o.templates.noTeam')}{' '}
                · {t('o2o.templates.sections', { count: x.sections.length })}
              </small>
            </button>
          ))}
          <button type="button" className={`${smallButton} justify-self-start`} onClick={() => setT(fresh())}>
            + {t('o2o.templates.new')}
          </button>
        </nav>
        <section className={`${card} grid gap-3`} aria-label={T.name || t('o2o.templates.new')}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid flex-1 gap-1 text-sm font-medium">
              {t('o2o.templates.name')}
              <input
                className={field}
                maxLength={80}
                placeholder={t('o2o.one')}
                value={T.name}
                onChange={(e) => setT({ ...T, name: e.target.value })}
              />
            </label>
            <button type="button" className={primaryButton} disabled={!T.name.trim()} onClick={save}>
              {t('o2o.save')}
            </button>
            {T.id && (
              <button type="button" className={`${smallButton} text-bad`} onClick={remove}>
                {t('common.delete')}
              </button>
            )}
          </div>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">{t('o2o.templates.teams')}</legend>
            <div className="flex flex-wrap gap-2">
              {teams.map((x) => {
                const on = T.teamIds.includes(x.id);
                const other = usedBy(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    className={`rounded-s px-2 py-1 text-xs font-semibold ${on ? 'bg-brand text-on-brand' : 'border border-bd hover:border-tx'}`}
                    onClick={() =>
                      setT({ ...T, teamIds: on ? T.teamIds.filter((y) => y !== x.id) : [...T.teamIds, x.id] })
                    }
                  >
                    {x.name}
                    {other.length > 0 && <small> ({other.join(', ')})</small>}
                  </button>
                );
              })}
            </div>
            <small className="text-mu">{t('o2o.templates.teamsHelp')}</small>
          </fieldset>
          <b className="text-sm">
            {t('o2o.templates.sectionsTitle')} <small className="text-mu">{T.sections.length}</small>
          </b>
          {T.sections.map((x, i) => (
            <div key={x.id} className="grid gap-2 rounded-s border border-bd p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs text-on-brand">
                  {i + 1}
                </span>
                <input
                  className={`${field} min-w-40 flex-1`}
                  maxLength={80}
                  aria-label={t('o2o.templates.sectionName')}
                  value={x.title}
                  onChange={(e) => setSection(i, { title: e.target.value })}
                />
                <span className={`${pill} bg-bd/40`}>{t(`o2o.types.${x.type}.name`)}</span>
                <button
                  type="button"
                  className={smallButton}
                  disabled={!i}
                  aria-label={t('o2o.templates.up')}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={smallButton}
                  disabled={i === T.sections.length - 1}
                  aria-label={t('o2o.templates.down')}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="text-mu hover:text-bad"
                  aria-label={t('o2o.remove')}
                  onClick={() => setT({ ...T, sections: T.sections.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
              {x.type !== 'text' && x.type !== 'objectives' && (
                <label className="grid gap-1 text-sm">
                  {t(
                    `o2o.templates.items.${x.type === 'table' || x.type === 'metrics' || x.type === 'rating' ? x.type : 'list'}`,
                  )}
                  <textarea
                    className={field}
                    rows={3}
                    value={itemsText(x)}
                    onChange={(e) => setItems(i, x, e.target.value)}
                    onBlur={() =>
                      setSection(i, {
                        items: x.items.map((s) => s.trim()).filter(Boolean),
                        units: x.units.filter((_, j) => (x.items[j] ?? '').trim()),
                      })
                    }
                  />
                </label>
              )}
              {x.type === 'table' && (
                <label className="grid gap-1 text-sm">
                  {t('o2o.templates.columns')}
                  <input
                    className={field}
                    value={x.cols.join(', ')}
                    onChange={(e) =>
                      setSection(i, {
                        cols: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              )}
            </div>
          ))}
          {adding ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TYPES.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="grid rounded-s border border-bd p-2 text-left text-sm hover:border-tx"
                  onClick={() => {
                    setT({ ...T, sections: [...T.sections, blank(k, t(`o2o.types.${k}.name`))] });
                    setAdding(false);
                  }}
                >
                  <b>{t(`o2o.types.${k}.name`)}</b>
                  <small className="text-mu">{t(`o2o.types.${k}.help`)}</small>
                </button>
              ))}
              <button
                type="button"
                className="rounded-s border border-bd p-2 text-sm font-semibold"
                onClick={() => setAdding(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`${smallButton} justify-self-start`}
              disabled={T.sections.length >= 30}
              onClick={() => setAdding(true)}
            >
              + {t('o2o.templates.addSection')}
            </button>
          )}
        </section>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- the target

/** One number for everybody, and a different one for chosen teams (empty: the same as everybody). */
function TargetForm({
  company,
  target,
  teams,
  onClose,
  onSaved,
}: {
  company: CompanyRef;
  target: Target;
  teams: TeamRow[];
  onClose: () => void;
  onSaved: (t: Target) => void;
}) {
  const { t } = useTranslation();
  const { message, run } = useAction();
  const [n, setN] = useState(String(target.target));
  const [own, setOwn] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(target.teams).map(([k, v]) => [k, String(v)])),
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="o2o-target-title"
        className="grid max-h-[90vh] w-full max-w-[520px] gap-3 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const teamsOut = Object.fromEntries(
            Object.entries(own)
              .filter(([, v]) => v.trim() !== '')
              .map(([k, v]) => [k, Number(v)]),
          );
          void run(
            () =>
              api<Target>('/one-to-ones/target', company.id, {
                method: 'PUT',
                body: { target: Number(n), teams: teamsOut },
              }).then(onSaved),
            t('o2o.target.saved'),
          );
        }}
      >
        <h2 id="o2o-target-title" className="font-display text-xl font-bold">
          {t('o2o.target.title')}
        </h2>
        <label className="grid gap-1 text-sm font-medium">
          {t('o2o.target.each')}
          <input
            className={field}
            type="number"
            min={1}
            max={10}
            required
            value={n}
            onChange={(e) => setN(e.target.value)}
          />
        </label>
        <b className="text-sm">{t('o2o.target.perTeam')}</b>
        {teams.map((x) => (
          <label key={x.id} className="grid grid-cols-[1fr_100px] items-center gap-2 text-sm">
            {x.name}
            <input
              className={field}
              type="number"
              min={0}
              max={10}
              value={own[x.id] ?? ''}
              onChange={(e) => setOwn({ ...own, [x.id]: e.target.value })}
            />
          </label>
        ))}
        <Notice message={message?.ok ? null : message} />
        <div className="flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton}>
            {t('o2o.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
