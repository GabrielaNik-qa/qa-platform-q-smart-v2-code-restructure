/**
 * Performance (today's perf.js): how far a monthly goal is, and the points of the recognition leaderboard. The server
 * counts the values from the real data (an agent's browser only has their own reviews); these rules turn them into
 * what the pages show, the same for everyone.
 */

/** What a goal can measure, and its unit. Tasks and CSAT count once Tasks and Surveys exist (later phases). */
export const GOAL_METRICS = ['avg', 'pass', 'reviews', 'tasks', 'csat', 'kudos'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
/** The measures that can be counted today. */
export const COUNTED_METRICS: readonly GoalMetric[] = ['avg', 'pass', 'reviews', 'kudos'];
export const GOAL_UNIT: Record<GoalMetric, string> = {
  avg: '%',
  pass: '%',
  reviews: '',
  tasks: '%',
  csat: '',
  kudos: '',
};

export type GoalState = 'met' | 'close' | 'risk' | 'missed' | 'nodata';

/**
 * Today's `goalProgress`: met when the value reaches the target; a past month that didn't is missed; no value yet is
 * "no data yet"; 90% of the way or more is "almost there", else "at risk".
 */
export function goalState(
  value: number | null,
  target: number,
  month: string,
  thisMonth: string,
): { pct: number; state: GoalState } {
  const pct = value === null || !target ? 0 : Math.min(100, (value / target) * 100);
  const state: GoalState =
    value !== null && value >= target
      ? 'met'
      : month < thisMonth
        ? 'missed'
        : value === null
          ? 'nodata'
          : pct >= 90
            ? 'close'
            : 'risk';
  return { pct, state };
}

/**
 * Today's leaderboard points (`kudosBoard`): kudos ×5, green flags ×3, task points, +10 when the average reaches the
 * team's target, and the average ÷ 10 (rounded); the average counts from 3 reviews in the month.
 */
export function leaderboardPoints(x: {
  kudos: number;
  green: number;
  taskPoints: number;
  average: number | null;
  target: number;
}): number {
  const av = x.average;
  return (
    x.kudos * 5 +
    x.green * 3 +
    x.taskPoints +
    (av !== null && av >= x.target ? 10 : 0) +
    (av !== null ? Math.round(av / 10) : 0)
  );
}

/** The month of a date or moment, YYYY-MM. */
export const monthOf = (at: string | Date): string =>
  typeof at === 'string' && /^\d{4}-\d{2}/.test(at) ? at.slice(0, 7) : new Date(at).toISOString().slice(0, 7);
