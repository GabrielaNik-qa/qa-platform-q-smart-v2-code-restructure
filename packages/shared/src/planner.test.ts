// The review planner counts as today's planning.js: its formulas are copied here (with "now" and the data passed in)
// and compared on random plans, months and days.
import { describe, expect, it } from 'vitest';
import { type PlannerSettings, planRows, planTotals } from './planner.js';

// today's plTarget and plRows, word for word but for their inputs
function todayRows(
  agents: { username: string; team: string }[],
  EV: { agent: string; d: string }[],
  p: { target: number; teams: Record<string, number | ''>; agents: Record<string, number | ''> },
  m: string,
  todayS: string,
) {
  const plTarget = (a: { username: string; team: string }) =>
    p.agents[a.username] != null && p.agents[a.username] !== ''
      ? Number(p.agents[a.username])
      : p.teams[a.team] != null && p.teams[a.team] !== ''
        ? Number(p.teams[a.team])
        : +p.target || 0;
  const now = todayS.slice(0, 7),
    dim = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(),
    day = m < now ? dim : m > now ? 0 : +todayS.slice(8, 10),
    share = day / dim;
  return agents.map((a) => {
    const done = EV.filter((e) => e.agent === a.username && e.d.slice(0, 7) === m).length,
      tg = plTarget(a),
      exp = Math.round(tg * share);
    return { tg, done, st: !tg ? 'none' : done >= tg ? 'done' : done >= exp ? 'ok' : 'behind' };
  });
}

describe('the review planner, next to today’s', () => {
  it('gives every agent the same target, reviews done and state', () => {
    const agents = Array.from({ length: 12 }, (_, i) => ({ username: `a${i}`, team: `t${i % 3}` }));
    for (let round = 0; round < 300; round++) {
      const teams: Record<string, number> = {};
      const own: Record<string, number> = {};
      if (round % 2) teams.t1 = round % 9;
      if (round % 3) own[`a${round % 12}`] = round % 7;
      const target = round % 6;
      const EV = Array.from({ length: 60 }, (_, i) => ({
        agent: `a${(i * 7 + round) % 12}`,
        d: `2026-${String(9 + (i % 4)).padStart(2, '0')}-${String(1 + ((i * 3) % 28)).padStart(2, '0')}`,
      }));
      const m = ['2026-09', '2026-10', '2026-11', '2026-12'][round % 4] ?? '2026-11';
      const today = `2026-11-${String(1 + (round % 30)).padStart(2, '0')}`;
      const plan: PlannerSettings = { target, teams, agents: own };
      const mine = planRows(
        agents.map((a) => ({ id: a.username, teamId: a.team })),
        EV.map((e) => ({ agentId: e.agent, reviewedOn: e.d })),
        plan,
        m,
        today,
      );
      const theirs = todayRows(agents, EV, { target, teams, agents: own }, m, today);
      expect(mine.map((r) => [r.target, r.done, r.state])).toEqual(theirs.map((r) => [r.tg, r.done, r.st]));
    }
  });

  it('adds up the plan as today (done never counts more than the target)', () => {
    const rows = [
      { target: 4, done: 6, state: 'done' as const },
      { target: 4, done: 1, state: 'behind' as const },
      { target: 0, done: 2, state: 'none' as const },
    ];
    expect(planTotals(rows)).toEqual({ planned: 8, done: 4 + 1 + 2, behind: 1 });
  });
});
