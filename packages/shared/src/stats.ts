/**
 * The quality numbers of the dashboards, counted exactly as today's app counts them (current-app: widgets.js `dashCtx`,
 * `ktr`, `kAvg`, `dgBuckets`; core.js `isPass`, `col`; pages.js `cpv`, `CATS`). The same functions serve every page and,
 * later, the reports and the MCP server, so a number is never counted two ways.
 *
 * - Only scored reviews count: "not scored" (every question N/A) stays out of every average (decision 14).
 * - A review passes at its team's pass rate or above (the company's when the team has none, 85 by default).
 * - Each review counts for the team the agent was in when it was reviewed (v2 keeps it with the review).
 */

/** What the numbers need of a review. */
export interface StatReview {
  id: string;
  leadId: string;
  agentId: string | null;
  teamId: string | null;
  channel: string;
  scorecardId: string | null;
  reviewerName: string;
  /** the date of the conversation, YYYY-MM-DD */
  reviewedOn: string;
  /** when it was reviewed */
  createdAt: string | Date;
  score: number | null;
  notScored: boolean;
  categories: { name: string; earned: number; possible: number; questions?: { comment?: string }[] }[];
  comment: string;
  flag: string;
  seenAt: string | Date | null;
  /** how long QA Entry took, in seconds */
  reviewSeconds: number | null;
}

/** The time a dashboard covers: rolling windows ending now, as today's dashboard. */
export type Period = 'week' | 'month' | 'year' | 'all' | 'custom';
/** Which date a review counts by: of the conversation (today's default), or when it was reviewed. */
export type DateBase = 'conversation' | 'review';
export type Grouping = 'day' | 'week' | 'month' | 'quarter';
/** A window [from, to) in milliseconds. */
export type Window = [number, number];

const DAY = 864e5;
const PERIOD_DAYS: Partial<Record<Period, number>> = { week: 7, month: 30, year: 365 };

export const average = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** The reviews that count: scored ones only. */
export const scoredOnly = <T extends StatReview>(reviews: T[]): T[] =>
  reviews.filter((r) => !r.notScored && r.score !== null);

/** The moment a review counts at. The conversation's date counts at noon, so a date is the same day everywhere. */
export function dayOf(review: StatReview, base: DateBase = 'conversation'): number {
  if (base === 'review') return new Date(review.createdAt).getTime();
  return new Date(`${review.reviewedOn}T12:00:00`).getTime();
}

/**
 * The window of a period, or with `previous` the window of the same length just before it (for the ▲ ▼ changes).
 * "All time" has no window before it. Custom dates are whole days, both included.
 */
export function periodWindow(
  period: Period,
  now: number,
  custom?: { from: string; to: string },
  previous = false,
): Window | null {
  if (period === 'custom') {
    if (!custom?.from || !custom.to) return previous ? null : [-Infinity, Infinity];
    const a = new Date(`${custom.from}T00:00:00`).getTime();
    const b = new Date(`${custom.to}T23:59:59`).getTime() + 1000;
    return previous ? [a - (b - a), a] : [a, b];
  }
  const days = PERIOD_DAYS[period];
  if (!days) return previous ? null : [-Infinity, Infinity];
  return previous ? [now - 2 * days * DAY, now - days * DAY] : [now - days * DAY, Infinity];
}

export interface StatFilters {
  teamId?: string;
  channel?: string;
  reviewerName?: string;
  scorecardId?: string;
  agentId?: string;
}

/** The scored reviews of a window and the dashboard's filters. */
export function inWindow<T extends StatReview>(
  reviews: T[],
  window: Window,
  filters: StatFilters = {},
  base: DateBase = 'conversation',
): T[] {
  const f = filters;
  return scoredOnly(reviews).filter((r) => {
    const at = dayOf(r, base);
    return (
      (!f.teamId || r.teamId === f.teamId) &&
      (!f.channel || r.channel === f.channel) &&
      (!f.reviewerName || r.reviewerName === f.reviewerName) &&
      (!f.scorecardId || r.scorecardId === f.scorecardId) &&
      (!f.agentId || r.agentId === f.agentId) &&
      at >= window[0] &&
      at < window[1]
    );
  });
}

/** The pass rates of a company: its own, and each team's own if it has one. */
export interface PassRates {
  general: number;
  teams: Record<string, number>;
}
export const passRateOf = (rates: PassRates | null, teamId: string | null): number =>
  (teamId ? rates?.teams[teamId] : undefined) ?? rates?.general ?? 85;
export const isPass = (review: StatReview, rates: PassRates | null): boolean =>
  (review.score ?? 0) >= passRateOf(rates, review.teamId);

export const averageScore = (reviews: StatReview[]): number | null => average(reviews.map((r) => r.score ?? 0));

/** The share (0–100) of reviews that match, or null when there are none. */
export const share = <T>(list: T[], test: (item: T) => boolean): number | null =>
  list.length ? (list.filter(test).length / list.length) * 100 : null;

/** A comment anywhere: the general comment, or one on any question. */
export const hasComment = (review: StatReview): boolean =>
  Boolean(review.comment.trim()) ||
  review.categories.some((c) => (c.questions ?? []).some((q) => Boolean(q.comment?.trim())));

/** The average review time in QA Entry, in seconds (reviews without one don't count). */
export const averageReviewTime = (reviews: StatReview[]): number | null =>
  average(reviews.map((r) => r.reviewSeconds ?? 0).filter((s) => s > 0));

/**
 * The change against the period before, in whole percent, as today's tiles show it (▲ 12%). Null when there is nothing
 * to compare with (no period before, or it was 0).
 */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/** Newer reviews against older ones: the newer half's average minus the older half's, and what it means. */
export function trend(
  reviews: StatReview[],
  base: DateBase = 'conversation',
): { delta: number; direction: 'stable' | 'improving' | 'declining' } {
  const sorted = [...reviews].sort((a, b) => dayOf(b, base) - dayOf(a, base));
  const half = Math.ceil(sorted.length / 2);
  const delta =
    sorted.length > 1 ? (averageScore(sorted.slice(0, half)) ?? 0) - (averageScore(sorted.slice(half)) ?? 0) : 0;
  return { delta, direction: Math.abs(delta) < 1.5 ? 'stable' : delta > 0 ? 'improving' : 'declining' };
}

/** The average of each of the last 10 weeks, oldest first (null for a week without reviews): the small trend line. */
export function lastTenWeeks(reviews: StatReview[], now: number, base: DateBase = 'conversation'): (number | null)[] {
  return Array.from({ length: 10 }, (_, i) => {
    const week = reviews.filter((r) => {
      const age = (now - dayOf(r, base)) / DAY / 7;
      return age >= 9 - i && age < 10 - i;
    });
    return averageScore(week);
  });
}

/** A category's score in one review (earned of possible, in %), or null when it wasn't scored there. */
export function categoryValue(review: StatReview, name: string): number | null {
  const c = review.categories.find((x) => x.name === name);
  return c && c.possible ? (c.earned / c.possible) * 100 : null;
}

/** Every category of the reviews, in the order they first appear. */
export const categoryNames = (reviews: StatReview[]): string[] => [
  ...new Set(reviews.flatMap((r) => r.categories.map((c) => c.name))),
];

/** Each category's average over the reviews that scored it, best first. */
export function categoryAverages(reviews: StatReview[]): { name: string; value: number }[] {
  return categoryNames(reviews)
    .map((name) => ({
      name,
      value: average(reviews.map((r) => categoryValue(r, name)).filter((v): v is number => v !== null)),
    }))
    .filter((c): c is { name: string; value: number } => c.value !== null)
    .sort((a, b) => b.value - a.value);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The key of the day, week (its Monday), month or quarter a moment falls in. */
export function groupKey(at: number, grouping: Grouping): string {
  const d = new Date(at);
  if (grouping === 'day') return ymd(d);
  if (grouping === 'month') return ymd(d).slice(0, 7);
  if (grouping === 'quarter') return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(monday);
}

/** The reviews per day, week, month or quarter: the last 16 groups, oldest first (today's charts over time). */
export function groups<T extends StatReview>(
  reviews: T[],
  grouping: Grouping,
  base: DateBase = 'conversation',
): { key: string; reviews: T[] }[] {
  const by = new Map<string, T[]>();
  for (const r of reviews) {
    const key = groupKey(dayOf(r, base), grouping);
    by.set(key, [...(by.get(key) ?? []), r]);
  }
  return [...by.keys()]
    .sort()
    .slice(-16)
    .map((key) => ({ key, reviews: by.get(key) ?? [] }));
}

/**
 * The periods of the Agents page (today's agents.js `agRange`): calendar ones, so "this month" starts on the 1st and
 * "this week" on Monday; "quarter" is the calendar quarter.
 */
export type CalendarPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';

/**
 * The window of a calendar period, or with `shift` 1 the one before it (2 the one before that …). Custom dates are
 * whole days, both included, and the window before them has the same length. "All time" has nothing before it.
 */
export function calendarWindow(
  period: CalendarPeriod,
  now: number,
  shift = 0,
  custom?: { from: string; to: string },
): Window | null {
  const n = new Date(now);
  const y = n.getFullYear();
  const m = n.getMonth();
  const at = (year: number, month: number, day = 1) => new Date(year, month, day).getTime();
  if (period === 'week') {
    const monday = n.getDate() - ((n.getDay() + 6) % 7) - 7 * shift;
    return [at(y, m, monday), at(y, m, monday + 7)];
  }
  if (period === 'month') return [at(y, m - shift), at(y, m - shift + 1)];
  if (period === 'quarter') {
    const q = Math.floor(m / 3) * 3 - 3 * shift;
    return [at(y, q), at(y, q + 3)];
  }
  if (period === 'year') return [at(y - shift, 0), at(y - shift + 1, 0)];
  if (period === 'custom' && custom?.from && custom.to) {
    const a = new Date(`${custom.from}T00:00:00`);
    const b = new Date(`${custom.to}T00:00:00`);
    b.setDate(b.getDate() + 1);
    const length = b.getTime() - a.getTime();
    return [a.getTime() - length * shift, b.getTime() - length * shift];
  }
  return shift ? null : [-Infinity, Infinity];
}

/** One column of the Agents page's score chart: a day, a week of the month (1–7, 8–14, 15–21, 22 to the end), a week, or a month. */
export interface Bucket {
  from: number;
  to: number;
  unit: 'day' | 'monthWeek' | 'week' | 'month';
  /** 1–4 for the weeks of a month */
  week?: number;
}

/**
 * The columns of the score chart (today's `agBuckets`): one per period, never one per review. A week shows its days, a
 * month its four weeks, a quarter its weeks, a year (or all time) its months; custom dates choose by their length. A
 * few days left at the end of a quarter (fewer than 4) join the week before instead of a tiny column of their own.
 */
export function chartBuckets(window: Window, period: CalendarPeriod): Bucket[] {
  const [a, b] = window;
  const days = Math.max(1, Math.round((b - a) / DAY));
  const unit: Bucket['unit'] =
    period === 'week'
      ? 'day'
      : period === 'month'
        ? 'monthWeek'
        : period === 'quarter'
          ? 'week'
          : period === 'year' || period === 'all'
            ? 'month'
            : days <= 14
              ? 'day'
              : days <= 92
                ? 'week'
                : 'month';
  const out: Bucket[] = [];
  const start = new Date(a);
  if (unit === 'month') {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d.getTime() < b;) {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      out.push({ from: d.getTime(), to: next.getTime(), unit });
      d = next;
    }
  } else if (unit === 'monthWeek') {
    for (let i = 0; i < 4; i++) {
      const from = new Date(start.getFullYear(), start.getMonth(), 1 + 7 * i).getTime();
      const to = i < 3 ? new Date(start.getFullYear(), start.getMonth(), 8 + 7 * i).getTime() : b;
      out.push({ from, to, unit, week: i + 1 });
    }
  } else {
    const step = unit === 'day' ? 1 : 7;
    for (let d = new Date(start); d.getTime() < b;) {
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
      out.push({ from: d.getTime(), to: Math.min(b, next.getTime()), unit });
      d = next;
    }
    const last = out.at(-1);
    const before = out.at(-2);
    if (unit === 'week' && last && before && last.to - last.from < 4 * DAY) {
      before.to = last.to;
      out.pop();
    }
  }
  return out;
}

/** Today's colour of a score: at the target or above, below it, low (under 70), failing (under 50). */
export type ScoreBand = 'ok' | 'wn' | 'hot' | 'bad';
export const scoreBand = (value: number, target: number): ScoreBand =>
  value >= target ? 'ok' : value >= 70 ? 'wn' : value >= 50 ? 'hot' : 'bad';
