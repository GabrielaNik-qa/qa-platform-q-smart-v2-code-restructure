// Tasks' numbers (today's tasks.js), the same on the pages and the server:
// - overdue: a deadline before today and not done;
// - a person's score (0-100) = 70% completion + 30% done on time (by the deadline) - 2 points for every overdue task;
// - today's progress (Team Progress): the checklist lines of today's tasks (a task without a checklist counts as one);
// - the timeline: a bar from the start (or the day it was given) to the deadline (or the day it was done);
// - the points (XP) of the tasks finished in a month, for the leaderboard.

export type TaskStatusValue = 'todo' | 'doing' | 'review' | 'done';
/** What the numbers need of a task (the pages and the server have more). */
export interface TaskFacts {
  status: TaskStatusValue;
  startOn: string | null;
  dueOn: string | null;
  points: number;
  steps: { done: boolean }[];
  archivedAt: string | Date | null;
  createdAt: string | Date;
  completedAt: string | Date | null;
}

/** A moment as its day here (yyyy-mm-dd, in this computer's time zone), as today. */
export const localDay = (at: string | Date) =>
  typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : new Date(at).toLocaleDateString('sv-SE');
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
/** The Monday of a day's week. */
export const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7));

export const isOverdueOn = (t: Pick<TaskFacts, 'dueOn' | 'status'>, today: string) =>
  !!t.dueOn && t.dueOn < today && t.status !== 'done';
/** Done by its deadline (null: not done, or no deadline). */
export const doneOnTime = (t: Pick<TaskFacts, 'status' | 'dueOn' | 'completedAt'>): boolean | null =>
  t.status === 'done' && t.dueOn && t.completedAt ? localDay(t.completedAt) <= t.dueOn : null;
/** Days late when it was done after its deadline (0 when on time; null: not done or no deadline). */
export const daysLate = (t: Pick<TaskFacts, 'status' | 'dueOn' | 'completedAt'>): number | null => {
  if (t.status !== 'done' || !t.dueOn || !t.completedAt) return null;
  const late = Math.round(
    (new Date(`${localDay(t.completedAt)}T12:00:00`).getTime() - new Date(`${t.dueOn}T12:00:00`).getTime()) / 864e5,
  );
  return Math.max(0, late);
};

export interface TaskStats {
  total: number;
  done: number;
  /** done by the deadline */
  onTime: number;
  overdue: number;
  /** 0-100 */
  completion: number;
  score: number;
}
/** The numbers of a list of tasks (a person's): today's tkStats. */
export function taskStats(list: TaskFacts[], today: string): TaskStats {
  const done = list.filter((t) => t.status === 'done');
  const onTime = done.filter((t) => doneOnTime(t) === true).length;
  const overdue = list.filter((t) => isOverdueOn(t, today)).length;
  const completion = list.length ? (done.length / list.length) * 100 : 0;
  const onTimeShare = done.length ? (onTime / done.length) * 100 : 0;
  const score = list.length
    ? Math.max(0, Math.min(100, Math.round(0.7 * completion + 0.3 * onTimeShare - 2 * overdue)))
    : 0;
  return { total: list.length, done: done.length, onTime, overdue, completion, score };
}

export type TaskPeriod = 'week' | 'month' | 'all';
/** In the period: given or done in the last 7 or 30 days (today's tkInP). */
export const inTaskPeriod = (t: Pick<TaskFacts, 'createdAt' | 'completedAt'>, period: TaskPeriod, now: number) =>
  period === 'all' ||
  [t.createdAt, t.completedAt].some((d) => d && now - new Date(d).getTime() <= (period === 'week' ? 7 : 30) * 864e5);

/**
 * Today's progress of one person (Team Progress): the tasks of today (due today, open and already started, or done
 * today), counted by their checklist lines (a task without one counts as one). 100 when there is nothing for today.
 */
export function dayProgress(list: TaskFacts[], today: string): { units: number; done: number; percent: number } {
  const todays = list.filter(
    (t) =>
      !t.archivedAt &&
      (t.dueOn === today ||
        (t.status !== 'done' && (!t.startOn || t.startOn <= today)) ||
        (t.completedAt && localDay(t.completedAt) === today)),
  );
  let units = 0;
  let done = 0;
  for (const t of todays) {
    if (t.steps.length) {
      units += t.steps.length;
      done += t.status === 'done' ? t.steps.length : t.steps.filter((s) => s.done).length;
    } else {
      units += 1;
      if (t.status === 'done') done += 1;
    }
  }
  return { units, done, percent: units ? (done / units) * 100 : 100 };
}

/** A card's bar on the timeline: from its start (or the day it was given) to its deadline (or the day it was done). */
export function timelineSpan(t: TaskFacts, today: string): [string, string] {
  const start = t.startOn ?? localDay(t.createdAt);
  let end =
    t.status === 'done'
      ? t.completedAt
        ? localDay(t.completedAt)
        : (t.dueOn ?? start)
      : (t.dueOn ?? (start > today ? start : today));
  if (end < start) end = start;
  return [start, end];
}

/** The points (XP) of the tasks a person finished in a month (yyyy-mm): the leaderboard's Task XP. */
export const monthTaskPoints = (list: TaskFacts[], month: string) =>
  list
    .filter((t) => t.status === 'done' && t.completedAt && localDay(t.completedAt).slice(0, 7) === month)
    .reduce((sum, t) => sum + t.points, 0);
