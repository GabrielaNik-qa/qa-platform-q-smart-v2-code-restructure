// Quality › Performance › Goals & KPIs (today's perf.js `PG.goals`): monthly targets for the company, teams and agents.
// The progress is counted by the server from the real data (an agent's browser only has their own reviews), with
// today's states: met, almost there, at risk, missed, no data yet. Admins, reviewers and team leads set goals; an
// agent sees the company's goals, their team's and their own.
import { can, COUNTED_METRICS, GOAL_UNIT, type GoalMetric, type GoalState } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { BAND_SOFT } from './bits';
import { currentLanguage } from './i18n';
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

export interface Goal {
  id: string;
  title: string;
  scope: 'all' | 'team' | 'agent';
  teamId: string | null;
  agentId: string | null;
  targetName: string;
  metric: GoalMetric;
  value: number;
  channel: string;
  month: string;
  progress: number | null;
  pct: number;
  state: GoalState;
}
const LOCALES = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' } as const;
export const STATE_LOOK: Record<GoalState, string> = {
  met: BAND_SOFT.ok,
  close: 'bg-ac/15 text-ac',
  risk: BAND_SOFT.wn,
  missed: BAND_SOFT.bad,
  nodata: BAND_SOFT.wn,
};
const thisMonth = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);
const shift = (m: string, by: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** A goal's value as today: CSAT with 2 decimals, the rest rounded to 1 decimal with its unit. */
export const goalValue = (g: Pick<Goal, 'metric'>, v: number | null) =>
  v === null ? '-' : g.metric === 'csat' ? v.toFixed(2) : `${Math.round(v * 10) / 10}${GOAL_UNIT[g.metric]}`;
export const monthName = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleString(LOCALES[currentLanguage()], {
    month: 'long',
    year: 'numeric',
  });

/** One goal's card: its value against the target, its state and its bar. */
export function GoalCard({ g, onEdit, onDelete }: { g: Goal; onEdit?: () => void; onDelete?: () => void }) {
  const { t } = useTranslation();
  const who = g.scope === 'all' ? t('goals.everyone') : g.targetName;
  return (
    <div className={`${card} grid content-start gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <b>{g.title || t(`goals.metrics.${g.metric}`)}</b>
        <span className={`rounded-full px-2 text-xs font-semibold whitespace-nowrap ${STATE_LOOK[g.state]}`}>
          {t(`goals.states.${g.state}`)}
        </span>
      </div>
      <small className="text-mu">
        {who} · {t(`goals.metrics.${g.metric}`)}
        {g.channel ? ` · ${t(`reviews.channels.${g.channel}`)}` : ''} · {monthName(g.month)}
      </small>
      <div className="flex items-baseline gap-2">
        <b
          className={`font-display text-3xl ${g.state === 'met' ? 'text-ok' : g.state === 'missed' ? 'text-bad' : ''}`}
        >
          {goalValue(g, g.progress)}
        </b>
        <small className="text-mu">{t('goals.target', { value: goalValue(g, g.value) })}</small>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunk">
        <div
          className={`h-full rounded-full ${g.state === 'met' ? 'bg-ok' : g.state === 'missed' ? 'bg-bad' : 'bg-ac'}`}
          style={{ width: `${g.pct}%` }}
        />
      </div>
      {(onEdit || onDelete) && (
        <div className="flex justify-end gap-1">
          {onEdit && (
            <button type="button" className={smallButton} onClick={onEdit}>
              {t('goals.edit')}
            </button>
          )}
          {onDelete && (
            <button type="button" className={`${smallButton} text-bad`} onClick={onDelete}>
              {t('goals.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Draft {
  id?: string;
  title: string;
  scope: Goal['scope'];
  teamId: string;
  agentId: string;
  metric: GoalMetric;
  value: string;
  channel: string;
  month: string;
}

export function Goals({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, run, fail } = useAction();
  const writer = can(company.role, 'goals.write');
  const [month, setMonth] = useState(thisMonth);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [rates, setRates] = useState<{ general: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(() => {
    setGoals(null);
    api<Goal[]>(`/goals?month=${month}`, company.id).then(setGoals, fail);
  }, [company.id, month, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!writer) return;
    void Promise.all([
      api<TeamRow[]>('/teams', company.id),
      api<PersonRow[]>('/people', company.id),
      api<{ general: number }>('/pass-rates', company.id),
    ]).then(([tm, ppl, pr]) => {
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl.filter((p) => p.role === 'agent' && p.active).sort((a, b) => a.name.localeCompare(b.name)));
      setRates(pr);
    }, fail);
  }, [company.id, writer, fail]);

  const list = goals ?? [];
  const count = (f: (g: Goal) => boolean) => list.filter(f).length;
  const blank = (): Draft => ({
    title: '',
    scope: 'team',
    teamId: '',
    agentId: '',
    metric: 'avg',
    value: String(rates?.general ?? 85),
    channel: '',
    month,
  });
  const edit = (g: Goal): Draft => ({
    id: g.id,
    title: g.title,
    scope: g.scope,
    teamId: g.teamId ?? '',
    agentId: g.agentId ?? '',
    metric: g.metric,
    value: String(g.value),
    channel: g.channel,
    month: g.month,
  });
  const remove = (g: Goal) => {
    if (!window.confirm(t('goals.confirmDelete'))) return;
    void run(() => api(`/goals/${g.id}`, company.id, { method: 'DELETE' }), t('goals.deleted'), load);
  };
  const copy = () =>
    void run(
      async () => {
        const res = await api<{ copied: number }>('/goals/copy', company.id, {
          method: 'POST',
          body: { from: shift(month, -1), to: month },
        });
        if (!res.copied) throw new Error(t('goals.nothingToCopy', { month: monthName(shift(month, -1)) }));
      },
      t('goals.copied'),
      load,
    );
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const body = {
      title: draft.title,
      scope: draft.scope,
      teamId: draft.scope === 'team' ? draft.teamId || null : null,
      agentId: draft.scope === 'agent' ? draft.agentId || null : null,
      metric: draft.metric,
      value: Number(draft.value),
      channel: draft.channel,
      month: draft.month,
    };
    const ok = await run(
      () =>
        api(draft.id ? `/goals/${draft.id}` : '/goals', company.id, {
          method: draft.id ? 'PUT' : 'POST',
          body,
        }),
      t('goals.saved'),
      load,
    );
    if (ok) setDraft(null);
  }

  const kpi = (title: string, value: number, look = '', sub = '') => (
    <div className={`${card} !p-4 grid content-start gap-1`}>
      <span className="text-sm">{title}</span>
      <b className={`font-display text-3xl ${look}`}>{value}</b>
      <small className="text-xs text-mu">{sub || ' '}</small>
    </div>
  );
  const label = 'grid gap-1 text-sm font-medium';

  return (
    <section className="grid gap-4" aria-labelledby="goals-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="goals-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.goals')}
          </h1>
          <p className="text-sm text-mu">{company.role === 'agent' ? t('goals.introAgent') : t('goals.intro')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-bd">
            <button
              type="button"
              className="px-3 py-1"
              aria-label={t('goals.previous')}
              onClick={() => setMonth(shift(month, -1))}
            >
              ‹
            </button>
            <b className="min-w-40 text-center text-sm">{monthName(month)}</b>
            <button
              type="button"
              className="px-3 py-1"
              aria-label={t('goals.next')}
              onClick={() => setMonth(shift(month, 1))}
            >
              ›
            </button>
          </div>
          {writer && (
            <>
              <button type="button" className={smallButton} onClick={copy} title={t('goals.copyHelp')}>
                {t('goals.copy')}
              </button>
              <button type="button" className={primaryButton} onClick={() => setDraft(blank())}>
                + {t('goals.new')}
              </button>
            </>
          )}
        </div>
      </div>
      <Notice message={message} />
      {!goals ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi(t('goals.kpi.goals'), list.length, '', monthName(month))}
            {kpi(
              t('goals.kpi.met'),
              count((g) => g.state === 'met'),
              'text-ok',
            )}
            {kpi(
              t('goals.kpi.risk'),
              count((g) => g.state === 'risk' || g.state === 'close'),
              'text-wn',
            )}
            {kpi(
              t('goals.kpi.missed'),
              count((g) => g.state === 'missed'),
              'text-bad',
            )}
          </div>
          {list.length ? (
            (['all', 'team', 'agent'] as const).map((scope) => {
              const mine = list.filter((g) => g.scope === scope);
              return mine.length ? (
                <div key={scope} className="grid gap-2">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {t(`goals.groups.${scope}`)}
                    <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">{mine.length}</span>
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {mine.map((g) => (
                      <GoalCard
                        key={g.id}
                        g={g}
                        {...(writer ? { onEdit: () => setDraft(edit(g)), onDelete: () => remove(g) } : {})}
                      />
                    ))}
                  </div>
                </div>
              ) : null;
            })
          ) : (
            <p className={`${card} text-mu`}>
              {t('goals.none', { month: monthName(month) })}{' '}
              {writer && (
                <button
                  type="button"
                  className="font-semibold text-ac hover:underline"
                  onClick={() => setDraft(blank())}
                >
                  {t('goals.addFirst')}
                </button>
              )}
            </p>
          )}
        </>
      )}
      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDraft(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-form-title"
            className="grid max-h-[90vh] w-full max-w-[560px] gap-3 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void save(e)}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="goal-form-title" className="font-display text-xl font-bold">
                {draft.id ? t('goals.editTitle') : t('goals.newTitle')}
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
            <label className={label}>
              {t('goals.form.name')}
              <input
                className={field}
                maxLength={150}
                placeholder={t('goals.form.namePlaceholder')}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className={label}>
              {t('goals.form.for')}
              <select
                className={field}
                value={draft.scope}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value as Goal['scope'] })}
              >
                <option value="all">{t('goals.form.company')}</option>
                <option value="team">{t('goals.form.team')}</option>
                <option value="agent">{t('goals.form.agent')}</option>
              </select>
            </label>
            {draft.scope === 'team' && (
              <label className={label}>
                {t('team.team')}
                <select
                  className={field}
                  required
                  value={draft.teamId}
                  onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}
                >
                  <option value="">{t('goals.form.choose')}</option>
                  {teams.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.scope === 'agent' && (
              <label className={label}>
                {t('cats.agent')}
                <select
                  className={field}
                  required
                  value={draft.agentId}
                  onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
                >
                  <option value="">{t('goals.form.choose')}</option>
                  {people.map((p) => (
                    <option key={p.membershipId} value={p.membershipId}>
                      {p.name} · {p.teamName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={label}>
              {t('goals.form.measure')}
              <select
                className={field}
                value={draft.metric}
                onChange={(e) => setDraft({ ...draft, metric: e.target.value as GoalMetric })}
              >
                {COUNTED_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {t(`goals.metrics.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {t('goals.form.value')}
              <input
                className={field}
                type="number"
                min="0.1"
                step="any"
                required
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
              <small className="font-normal text-mu">{t('goals.form.valueHelp')}</small>
            </label>
            <label className={label}>
              {t('team.type')}
              <select
                className={field}
                value={draft.channel}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
              >
                <option value="">{t('team.allTypes')}</option>
                {(['call', 'chat', 'email', 'other'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`reviews.channels.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {t('goals.form.month')}
              <input
                className={field}
                type="month"
                required
                value={draft.month}
                onChange={(e) => setDraft({ ...draft, month: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={smallButton} onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className={primaryButton}>
                {t('goals.form.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
