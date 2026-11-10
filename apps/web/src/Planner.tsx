// Planning › Review planner (today's planning.js `PG.planner`): how many reviews each agent should get this month, who
// reviews whom, and who is behind. Admins and reviewers change the plan (the default target, an agent's own target,
// the reviewer of each agent, or "Share agents between reviewers"); team leads read it. Counted with the shared rules
// (packages/shared/src/planner.ts), from the reviews the person may see.
import { can, type PlannerSettings, type PlanState, planRows, planTotals } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { AgentLink, BAND_SOFT, TeamLink } from './bits';
import { monthName } from './Goals';
import type { ReviewRow } from './QAEntry';
import { card, type CompanyRef, field, Notice, type PersonRow, smallButton, type TeamRow, useAction } from './ui';

const today = () => new Date().toLocaleDateString('sv-SE');
export const shiftMonth = (m: string, by: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const STATE_LOOK: Record<PlanState, string> = {
  done: BAND_SOFT.ok,
  ok: 'bg-ac/15 text-ac',
  behind: BAND_SOFT.bad,
  none: BAND_SOFT.wn,
};
const ORDER: Record<PlanState, number> = { behind: 0, ok: 1, none: 2, done: 3 };

export function Planner({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, run, fail } = useAction();
  const editor = can(company.role, 'planner.write');
  const reviewer = can(company.role, 'reviews.write');
  const [plan, setPlan] = useState<PlannerSettings | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [team, setTeam] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    void Promise.all([
      api<PlannerSettings>('/planner', company.id),
      api<PersonRow[]>('/people', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<ReviewRow[]>('/reviews', company.id),
    ]).then(([p, ppl, tm, r]) => {
      setPlan(p);
      setPeople(ppl);
      setTeams(tm.filter((x) => !x.isAdministration));
      setReviews(r);
    }, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const save = (next: PlannerSettings, done: string) =>
    void run(
      async () => setPlan(await api<PlannerSettings>('/planner', company.id, { method: 'PUT', body: next })),
      done,
    );
  const agents = people.filter((p) => p.role === 'agent' && p.active).sort((a, b) => a.name.localeCompare(b.name));
  const reviewers = people.filter((p) => p.active && (p.role === 'admin' || p.role === 'reviewer'));
  const p = plan ?? {};
  const needle = q.trim().toLowerCase();
  const shown = agents.filter(
    (a) => (!team || a.teamId === team) && (!needle || a.name.toLowerCase().includes(needle)),
  );
  const byId = new Map(agents.map((a) => [a.membershipId, a]));
  const rows = planRows(
    shown.map((a) => ({ id: a.membershipId, teamId: a.teamId })),
    reviews,
    p,
    month,
    today(),
  ).sort((x, y) => ORDER[x.state] - ORDER[y.state]);
  const totals = planTotals(rows);
  const share = () => {
    if (!reviewers.length) return fail(new Error(t('planner.noReviewers')));
    const assign: Record<string, string> = {};
    agents.forEach((a, i) => {
      assign[a.membershipId] = reviewers[i % reviewers.length]?.membershipId ?? '';
    });
    save({ ...p, assign }, t('planner.shared', { count: agents.length, reviewers: reviewers.length }));
  };
  const kpi = (title: string, value: ReactNode, sub: string, look = '') => (
    <div className={`${card} !p-4 grid content-start gap-1`}>
      <span className="text-sm">{title}</span>
      <b className={`font-display text-3xl ${look}`}>{value}</b>
      <small className="text-xs text-mu">{sub || ' '}</small>
    </div>
  );
  const th = 'py-1 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-mu';

  return (
    <section className="grid gap-4" aria-labelledby="planner-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="planner-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.planner')}
          </h1>
          <p className="text-sm text-mu">{t('planner.intro')}</p>
        </div>
        {editor && (
          <button type="button" className={smallButton} title={t('planner.shareHelp')} onClick={share}>
            {t('planner.share')}
          </button>
        )}
      </div>
      <Notice message={message} />
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <div className="grid gap-1 text-sm font-medium">
          {t('goals.form.month')}
          <div className="flex items-center rounded-full border border-bd">
            <button
              type="button"
              className="px-3 py-1"
              aria-label={t('goals.previous')}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <b className="min-w-40 text-center text-sm">{monthName(month)}</b>
            <button
              type="button"
              className="px-3 py-1"
              aria-label={t('goals.next')}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          {t('team.team')}
          <select className={field} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{t('team.allTeams')}</option>
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('agents.search')}
          <input
            type="search"
            className={field}
            placeholder={t('planner.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {editor && plan && (
          <label className="grid gap-1 text-sm font-medium">
            {t('planner.perAgent')}
            <input
              type="number"
              min={0}
              max={100}
              className={`${field} w-28`}
              defaultValue={p.target ?? 4}
              key={p.target ?? 4}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v !== (p.target ?? 4)) save({ ...p, target: v }, t('planner.defaultSaved'));
              }}
            />
          </label>
        )}
      </div>
      {!plan ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi(t('planner.kpi.planned'), totals.planned, monthName(month))}
            {kpi(
              t('planner.kpi.done'),
              totals.done,
              totals.planned
                ? t('planner.kpi.ofPlan', { value: Math.round((totals.done / totals.planned) * 100) })
                : '',
              'text-ok',
            )}
            {kpi(t('planner.kpi.left'), Math.max(0, totals.planned - totals.done), t('planner.kpi.reviews'), 'text-wn')}
            {kpi(t('planner.kpi.behind'), totals.behind, t('planner.kpi.ofAgents', { count: rows.length }), 'text-bad')}
          </div>
          {reviewers.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {reviewers.map((u) => {
                const mine = rows.filter((r) => r.reviewerId === u.membershipId);
                const target = mine.reduce((s, r) => s + r.target, 0);
                const done = reviews.filter(
                  (r) => r.reviewerId === u.membershipId && r.reviewedOn.slice(0, 7) === month,
                ).length;
                return (
                  <div key={u.membershipId} className={`${card} !p-4 grid content-start gap-1.5`}>
                    <div className="flex justify-between gap-2">
                      <b>{u.name}</b>
                      <small className="text-mu">{t('team.agentCount', { count: mine.length })}</small>
                    </div>
                    <b className="font-display text-2xl">
                      {done}
                      <small className="text-sm text-mu"> / {target}</small>
                    </b>
                    <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
                      <div
                        className="h-full rounded-full bg-ac"
                        style={{ width: `${target ? Math.min(100, (done / target) * 100) : 0}%` }}
                      />
                    </div>
                    <small className="text-xs text-mu">{t('planner.reviewerDone')}</small>
                  </div>
                );
              })}
            </div>
          )}
          <div className={`${card} grid gap-2`}>
            <h2 className="flex items-center gap-2 font-semibold">
              {t('team.cols.agents')}
              <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">{rows.length}</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>{t('cats.agent')}</th>
                    <th className={th}>{t('team.team')}</th>
                    <th className={th}>{t('cats.reviewer')}</th>
                    <th className={th}>{t('planner.cols.target')}</th>
                    <th className={th}>{t('planner.cols.done')}</th>
                    <th className={th}>{t('planner.cols.progress')}</th>
                    <th className={th}>{t('team.cols.status')}</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = byId.get(r.agentId);
                    if (!a) return null;
                    return (
                      <tr key={r.agentId} className="border-t border-bd">
                        <td className="py-1.5 pr-3">
                          <AgentLink id={a.membershipId} name={a.name} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TeamLink id={a.teamId} name={a.teamName ?? ''} />
                        </td>
                        <td className="py-1.5 pr-3">
                          {editor ? (
                            <select
                              className={field}
                              aria-label={t('planner.reviewerOf', { name: a.name })}
                              value={r.reviewerId}
                              onChange={(e) => {
                                const assign = Object.fromEntries(
                                  Object.entries(p.assign ?? {}).filter(([k]) => k !== a.membershipId),
                                );
                                if (e.target.value) assign[a.membershipId] = e.target.value;
                                save({ ...p, assign }, t('goals.saved'));
                              }}
                            >
                              <option value="">- {t('planner.nobody')} -</option>
                              {reviewers.map((u) => (
                                <option key={u.membershipId} value={u.membershipId}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            (reviewers.find((u) => u.membershipId === r.reviewerId)?.name ?? '-')
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          {editor ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className={`${field} w-20`}
                              aria-label={t('planner.targetOf', { name: a.name })}
                              title={t('planner.targetHelp')}
                              defaultValue={p.agents?.[a.membershipId] ?? ''}
                              placeholder={String(r.target)}
                              key={`${a.membershipId}-${p.agents?.[a.membershipId] ?? ''}`}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const agentsPlan = Object.fromEntries(
                                  Object.entries(p.agents ?? {}).filter(([k]) => k !== a.membershipId),
                                );
                                if (raw !== '') agentsPlan[a.membershipId] = Number(raw);
                                if ((p.agents?.[a.membershipId] ?? '') === (raw === '' ? '' : Number(raw))) return;
                                save({ ...p, agents: agentsPlan }, t('goals.saved'));
                              }}
                            />
                          ) : (
                            r.target
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          <b>{r.done}</b>
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-sunk">
                            <div
                              className={`h-full rounded-full ${r.state === 'behind' ? 'bg-bad' : 'bg-ok'}`}
                              style={{ width: `${r.pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-1.5 pr-3">
                          <span
                            className={`rounded-full px-2 text-xs font-semibold whitespace-nowrap ${STATE_LOOK[r.state]}`}
                          >
                            {t(`planner.states.${r.state}`)}
                          </span>
                        </td>
                        <td className="py-1.5 whitespace-nowrap">
                          {reviewer && r.state !== 'done' && (
                            <Link
                              to="/$app/$page"
                              params={{ app: 'quality', page: 'qa-entry' }}
                              search={{ agent: a.membershipId }}
                              className={smallButton}
                            >
                              + {t('planner.reviewNow')}
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
