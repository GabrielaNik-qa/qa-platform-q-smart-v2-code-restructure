/**
 * The review planner (today's planning.js `plRows`): how many reviews each agent should get in a month, who reviews
 * whom, and who is behind. An agent's target is their own, else their team's, else the company's default (4).
 */

/** The company's plan (Planning › Review planner). */
export interface PlannerSettings {
  /** reviews per agent per month, by default */
  target?: number;
  /** a team's own target, by team id */
  teams?: Record<string, number>;
  /** an agent's own target, by membership id */
  agents?: Record<string, number>;
  /** who reviews whom: agent's membership id → reviewer's membership id */
  assign?: Record<string, string>;
}

export const DEFAULT_TARGET = 4;
export type PlanState = 'done' | 'ok' | 'behind' | 'none';

/** An agent's target: their own, else their team's, else the default. */
export function targetOf(plan: PlannerSettings, agentId: string, teamId: string | null): number {
  const own = plan.agents?.[agentId];
  if (own !== undefined) return own;
  const team = teamId ? plan.teams?.[teamId] : undefined;
  if (team !== undefined) return team;
  return plan.target ?? DEFAULT_TARGET;
}

/**
 * Each agent's row for a month: target, reviews done (by the conversation's date), the share of the month gone (a past
 * month counts whole, a future one not at all), and the state: done, on track (at least the expected share), behind,
 * or no target.
 */
export function planRows(
  agents: { id: string; teamId: string | null }[],
  reviews: { agentId: string | null; reviewedOn: string }[],
  plan: PlannerSettings,
  month: string,
  today: string,
): { agentId: string; target: number; done: number; reviewerId: string; pct: number; state: PlanState }[] {
  const thisMonth = today.slice(0, 7);
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const day = month < thisMonth ? days : month > thisMonth ? 0 : Number(today.slice(8, 10));
  const share = day / days;
  return agents.map((a) => {
    const done = reviews.filter((r) => r.agentId === a.id && r.reviewedOn.slice(0, 7) === month).length;
    const target = targetOf(plan, a.id, a.teamId);
    const expected = Math.round(target * share);
    return {
      agentId: a.id,
      target,
      done,
      reviewerId: plan.assign?.[a.id] ?? '',
      pct: target ? Math.min(100, (done / target) * 100) : 100,
      state: !target ? 'none' : done >= target ? 'done' : done >= expected ? 'ok' : 'behind',
    };
  });
}

/** The plan's totals: planned, done (never more than an agent's target counts), and agents behind. */
export function planTotals(rows: { target: number; done: number; state: PlanState }[]) {
  return {
    planned: rows.reduce((s, r) => s + r.target, 0),
    done: rows.reduce((s, r) => s + Math.min(r.done, r.target || r.done), 0),
    behind: rows.filter((r) => r.state === 'behind').length,
  };
}
