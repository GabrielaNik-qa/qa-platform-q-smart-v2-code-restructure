// Tasks' numbers against today's formulas (tasks.js: tkStats, tkTeam, tkTime; perf.js: the leaderboard's Task XP).
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dueRound,
  isWorkingDay,
  periodDay,
  type RepeatEvery,
  type RepeatRule,
  dayProgress,
  daysLate,
  doneOnTime,
  inTaskPeriod,
  isOverdueOn,
  mondayOf,
  monthTaskPoints,
  type TaskFacts,
  taskStats,
  timelineSpan,
} from './tasks.js';

const TODAY = '2026-11-12';
const task = (over: Partial<TaskFacts> = {}): TaskFacts => ({
  status: 'todo',
  startOn: null,
  dueOn: null,
  points: 0,
  steps: [],
  archivedAt: null,
  createdAt: '2026-11-01T09:00:00',
  completedAt: null,
  ...over,
});

/** Today's tkStats, written as it is in tasks.js. */
function theirs(l: TaskFacts[], td: string) {
  const isOver = (t: TaskFacts) => !!t.dueOn && t.dueOn < td && t.status !== 'done';
  const iso = (d: string | Date) => new Date(d).toLocaleDateString('sv-SE');
  const done = l.filter((t) => t.status === 'done'),
    on = done.filter((t) => t.dueOn && t.completedAt && iso(t.completedAt) <= t.dueOn).length,
    over = l.filter(isOver).length;
  const comp = l.length ? (done.length / l.length) * 100 : 0,
    ont = done.length ? (on / done.length) * 100 : 0;
  return {
    total: l.length,
    done: done.length,
    on,
    over,
    score: l.length ? Math.max(0, Math.min(100, Math.round(0.7 * comp + 0.3 * ont - 2 * over))) : 0,
  };
}

describe("tasks' numbers", () => {
  it('give the same score as today: 70% completion + 30% on time - 2 per overdue task', () => {
    const lists: TaskFacts[][] = [
      [],
      [task()],
      [task({ status: 'done', dueOn: '2026-11-10', completedAt: '2026-11-09T15:00:00' })],
      [
        task({ status: 'done', dueOn: '2026-11-10', completedAt: '2026-11-11T15:00:00' }),
        task({ status: 'doing', dueOn: '2026-11-01' }),
        task({ status: 'todo', dueOn: '2026-11-02' }),
        task({ status: 'review', dueOn: '2026-11-20' }),
        task({ status: 'done', completedAt: '2026-11-05T10:00:00' }),
      ],
    ];
    for (let i = 0; i < 40; i++)
      lists.push(
        Array.from({ length: (i % 7) + 1 }, (_, j) =>
          task({
            status: (['todo', 'doing', 'review', 'done'] as const)[(i + j) % 4],
            dueOn: (i + j) % 3 ? addDays(TODAY, ((i * j) % 9) - 4) : null,
            completedAt: (i + j) % 4 === 3 ? `${addDays(TODAY, ((i + j) % 5) - 3)}T10:00:00` : null,
          }),
        ),
      );
    for (const l of lists) {
      const mine = taskStats(l, TODAY);
      const old = theirs(l, TODAY);
      expect({ total: mine.total, done: mine.done, on: mine.onTime, over: mine.overdue, score: mine.score }).toEqual(
        old,
      );
    }
    // the example of the help text: 4 of 5 done, 3 of them on time, 1 overdue
    const five = [
      ...Array.from({ length: 3 }, () => task({ status: 'done', dueOn: TODAY, completedAt: `${TODAY}T10:00:00` })),
      task({ status: 'done', dueOn: '2026-11-01', completedAt: '2026-11-03T10:00:00' }),
      task({ dueOn: '2026-11-11' }),
    ];
    expect(taskStats(five, TODAY)).toMatchObject({ completion: 80, onTime: 3, overdue: 1, score: 77 });
  });

  it('know overdue, on time and how many days late', () => {
    expect(isOverdueOn(task({ dueOn: '2026-11-11' }), TODAY)).toBe(true);
    expect(isOverdueOn(task({ dueOn: TODAY }), TODAY)).toBe(false);
    expect(isOverdueOn(task({ dueOn: '2026-11-11', status: 'done' }), TODAY)).toBe(false);
    const late = task({ status: 'done', dueOn: '2026-11-10', completedAt: '2026-11-12T08:00:00' });
    expect(doneOnTime(late)).toBe(false);
    expect(daysLate(late)).toBe(2);
    expect(doneOnTime(task({ status: 'done', dueOn: '2026-11-10', completedAt: '2026-11-10T22:00:00' }))).toBe(true);
    expect(doneOnTime(task({ status: 'done' }))).toBeNull();
  });

  it("count today's progress by checklist lines, a task without one as one", () => {
    const p = dayProgress(
      [
        task({ status: 'doing', steps: [{ done: true }, { done: false }, { done: false }] }),
        task({ status: 'todo' }),
        task({ status: 'done', completedAt: `${TODAY}T09:00:00`, steps: [{ done: true }, { done: true }] }),
        task({ status: 'todo', startOn: '2026-11-20' }), // not yet
        task({ status: 'done', completedAt: '2026-11-01T09:00:00' }), // an older one
        task({ status: 'todo', archivedAt: '2026-11-11T09:00:00' }),
      ],
      TODAY,
    );
    expect(p).toEqual({ units: 6, done: 3, percent: 50 });
    expect(dayProgress([], TODAY).percent).toBe(100);
  });

  it('draw a bar from the start to the deadline, or to the day it was done', () => {
    expect(timelineSpan(task({ startOn: '2026-11-10', dueOn: '2026-11-14' }), TODAY)).toEqual([
      '2026-11-10',
      '2026-11-14',
    ]);
    expect(timelineSpan(task({ createdAt: '2026-11-05T10:00:00' }), TODAY)).toEqual(['2026-11-05', TODAY]);
    expect(timelineSpan(task({ startOn: '2026-11-20' }), TODAY)).toEqual(['2026-11-20', '2026-11-20']);
    expect(
      timelineSpan(task({ status: 'done', startOn: '2026-11-03', completedAt: '2026-11-06T10:00:00' }), TODAY),
    ).toEqual(['2026-11-03', '2026-11-06']);
    expect(mondayOf(TODAY)).toBe('2026-11-09');
  });

  it("add up the points of the tasks finished in the month, and keep a period's tasks", () => {
    const l = [
      task({ status: 'done', points: 20, completedAt: '2026-11-03T10:00:00' }),
      task({ status: 'done', points: 5, completedAt: '2026-10-30T10:00:00' }),
      task({ status: 'review', points: 50 }),
    ];
    expect(monthTaskPoints(l, '2026-11')).toBe(20);
    const now = new Date(`${TODAY}T12:00:00`).getTime();
    expect(inTaskPeriod(task({ createdAt: '2026-11-08T10:00:00' }), 'week', now)).toBe(true);
    expect(inTaskPeriod(task({ createdAt: '2026-10-01T10:00:00' }), 'month', now)).toBe(false);
    expect(
      inTaskPeriod(task({ createdAt: '2026-10-01T10:00:00', completedAt: '2026-11-01T10:00:00' }), 'month', now),
    ).toBe(true);
  });
});

describe('repeats', () => {
  it("find the day of today's period, as today", () => {
    const rule = (freq: RepeatEvery, weekday = 1, monthday = 1): RepeatRule => ({ freq, weekday, monthday });
    expect(periodDay(rule('daily'), TODAY)).toBe(TODAY);
    expect(periodDay(rule('weekly', 1), TODAY)).toBe('2026-11-09'); // this Monday
    expect(periodDay(rule('weekly', 5), TODAY)).toBe(''); // Friday hasn't come yet
    expect(periodDay(rule('monthly', 1, 5), TODAY)).toBe('2026-11-05');
    expect(periodDay(rule('monthly', 1, 20), TODAY)).toBe('');
    expect(periodDay(rule('quarterly', 1, 3), TODAY)).toBe('2026-10-03');
    expect(periodDay(rule('none'), TODAY)).toBe('');
  });

  it('skip Saturdays and Sundays, and add months within the month', () => {
    expect(isWorkingDay('2026-11-13')).toBe(true); // Friday
    expect(isWorkingDay('2026-11-14')).toBe(false);
    expect(isWorkingDay('2026-11-15')).toBe(false);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('give only the latest round of a repeating sequence, never after its end', () => {
    expect(dueRound('2026-08-20', 'monthly', TODAY, null)).toBe('2026-10-20');
    expect(dueRound('2026-08-12', 'monthly', TODAY, null)).toBe(TODAY);
    expect(dueRound('2026-05-12', 'quarterly', TODAY, null)).toBe(TODAY);
    expect(dueRound('2026-05-13', 'quarterly', TODAY, null)).toBe('2026-08-13');
    expect(dueRound('2026-08-20', 'monthly', TODAY, '2026-09-30')).toBe('');
    expect(dueRound('2026-12-01', 'monthly', TODAY, null)).toBe('');
    expect(dueRound('2026-08-20', 'none', TODAY, null)).toBe('');
  });
});
