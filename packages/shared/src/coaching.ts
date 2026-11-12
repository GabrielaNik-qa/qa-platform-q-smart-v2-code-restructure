// Coaching's numbers (today's work.js), the same on the pages and the server:
// - what each agent should work on: their last 30 days against their team's and their pass rate, with who needs
//   coaching most first;
// - the team's focus: the weakest categories of the last 30 days and who is below the pass rate in each;
// - the overview (like Zendesk QA's coaching dashboard): sessions held, coming and overdue, how many agents signed,
//   and the coached agents' average 30 days after each session against the 30 days before.
import {
  average,
  averageScore,
  categoryAverages,
  categoryValue,
  type PassRates,
  passRateOf,
  type StatReview,
} from './stats.js';

const DAY = 864e5;
const at = (r: Pick<StatReview, 'reviewedOn'>) => new Date(`${r.reviewedOn}T12:00:00`).getTime();
const ageDays = (r: Pick<StatReview, 'reviewedOn'>, now: number) => (now - at(r)) / DAY;
const inLast = (r: Pick<StatReview, 'reviewedOn'>, now: number, from: number, to: number) => {
  const a = ageDays(r, now);
  return a >= from && a < to;
};

export interface CoachingAgent {
  membershipId: string;
  teamId: string | null;
}
/** What the coaching numbers need of a session (the pages and the server have more). */
export interface SessionFacts {
  kind: 'coaching' | 'group' | 'training' | 'o2o';
  heldOn: string;
  status: 'planned' | 'done';
  agents: { id: string; teamId: string | null }[];
  signatures: Record<string, unknown>;
  byId: string | null;
  byName: string;
}

export interface Insight {
  /** reviews in the last 30 days */
  reviews: number;
  average: number | null;
  /** the change against the 30 days before (null without them) */
  trend: number | null;
  /** up to 3 categories under the pass rate, weakest first, with the team's average */
  weak: { name: string; value: number; team: number | null }[];
  disputes: number;
  /** the last coaching session (not one-to-ones), or empty */
  lastCoached: string;
  /** who needs coaching most comes first (today's priority) */
  priority: number;
}

/** What one agent should work on (today's `insight`). */
export function insightOf(
  agent: CoachingAgent,
  reviews: (StatReview & { status?: string })[],
  sessions: SessionFacts[],
  rates: PassRates | null,
  now: number,
): Insight {
  const own = reviews.filter((r) => r.agentId === agent.membershipId);
  const mine = own.filter((r) => inLast(r, now, 0, 30));
  const before = own.filter((r) => inLast(r, now, 30, 60));
  const team = reviews.filter((r) => r.teamId === agent.teamId && inLast(r, now, 0, 30));
  const pass = passRateOf(rates, agent.teamId);
  const weak = categoryAverages(mine)
    .filter((c) => c.value < pass)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3)
    .map((c) => ({
      ...c,
      team: average(team.map((r) => categoryValue(r, c.name)).filter((v): v is number => v !== null)),
    }));
  const avg = averageScore(mine);
  const trend = before.length && avg !== null ? avg - (averageScore(before) ?? 0) : null;
  const disputes = own.filter((r) => r.status === 'disputed').length;
  const lastCoached =
    sessions
      .filter((s) => s.kind !== 'o2o' && s.agents.some((a) => a.id === agent.membershipId))
      .map((s) => s.heldOn)
      .sort()
      .pop() ?? '';
  const priority =
    mine.length && avg !== null
      ? pass - avg + weak.length * 3 + disputes * 2 + (trend !== null && trend < -2 ? 3 : 0)
      : -99;
  return { reviews: mine.length, average: avg, trend, weak, disputes, lastCoached, priority };
}

/**
 * The team's focus (today's "Team focus"): the 3 weakest categories of the last 30 days that are under the pass rate
 * plus 5, each with the agents whose own average is under the pass rate.
 */
export function teamFocus(
  agents: CoachingAgent[],
  reviews: StatReview[],
  rates: PassRates | null,
  now: number,
): { name: string; value: number; below: string[] }[] {
  const ids = new Set(agents.map((a) => a.membershipId));
  const recent = reviews.filter((r) => r.agentId && ids.has(r.agentId) && inLast(r, now, 0, 30));
  return categoryAverages(recent)
    .map((c) => ({
      name: c.name,
      value: c.value,
      below: agents
        .filter((a) => {
          const own = average(
            recent
              .filter((r) => r.agentId === a.membershipId)
              .map((r) => categoryValue(r, c.name))
              .filter((v): v is number => v !== null),
          );
          return own !== null && own < passRateOf(rates, a.teamId);
        })
        .map((a) => a.membershipId),
    }))
    .filter((c) => c.value < passRateOf(rates, null) + 5)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3);
}

export interface CoachingOverview {
  held: number;
  coming: number;
  overdue: number;
  /** agents who signed, of the agents of the sessions held */
  signed: number;
  toSign: number;
  /** the coached agents' average 30 days after a session minus the 30 days before (null: nothing to compare) */
  change: number | null;
  coaches: { name: string; sessions: number; agents: number; change: number | null }[];
}
/** The overview of coaching sessions (one-to-ones left out), like Zendesk QA's coaching dashboard. */
export function coachingOverview(sessions: SessionFacts[], reviews: StatReview[], today: string): CoachingOverview {
  const list = sessions.filter((s) => s.kind !== 'o2o');
  const held = list.filter((s) => s.status === 'done');
  const pairs = held.flatMap((s) => s.agents.map((a) => ({ s, a })));
  const changes = pairs
    .map(({ s, a }) => {
      const t = new Date(`${s.heldOn}T12:00:00`).getTime();
      const own = reviews.filter((r) => r.agentId === a.id);
      const before = own.filter((r) => at(r) < t && t - at(r) < 30 * DAY);
      const after = own.filter((r) => at(r) >= t && at(r) - t < 30 * DAY);
      return before.length && after.length
        ? { coach: s.byId ?? s.byName, diff: (averageScore(after) ?? 0) - (averageScore(before) ?? 0) }
        : null;
    })
    .filter((x): x is { coach: string; diff: number } => x !== null);
  const coaches = new Map<string, { name: string; sessions: number; agents: Set<string>; diffs: number[] }>();
  for (const s of held) {
    const key = s.byId ?? s.byName;
    const c = coaches.get(key) ?? { name: s.byName, sessions: 0, agents: new Set<string>(), diffs: [] };
    c.sessions += 1;
    for (const a of s.agents) c.agents.add(a.id);
    coaches.set(key, c);
  }
  for (const x of changes) coaches.get(x.coach)?.diffs.push(x.diff);
  return {
    held: held.length,
    coming: list.filter((s) => s.status === 'planned' && s.heldOn >= today).length,
    overdue: list.filter((s) => s.status === 'planned' && s.heldOn < today).length,
    signed: pairs.filter(({ s, a }) => a.id in s.signatures).length,
    toSign: pairs.length,
    change: average(changes.map((x) => x.diff)),
    coaches: [...coaches.values()]
      .map((c) => ({ name: c.name, sessions: c.sessions, agents: c.agents.size, change: average(c.diffs) }))
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)),
  };
}
