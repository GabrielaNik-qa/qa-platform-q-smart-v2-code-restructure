// Goals and the leaderboard count as today's perf.js: its formulas are copied here word for word and compared.
import { describe, expect, it } from 'vitest';
import { goalState, leaderboardPoints } from './performance.js';

// today's goalProgress, from the value on (perf.js)
function todayState(v: number | null, value: number, m: string, now: string) {
  const tg = +value || 0,
    pct = v == null || !tg ? 0 : Math.min(100, (v / tg) * 100);
  const st = v != null && v >= tg ? 'met' : m < now ? 'missed' : v == null ? 'nodata' : pct >= 90 ? 'close' : 'risk';
  return { pct, st };
}

describe('goals and the leaderboard, next to today’s', () => {
  it('give every goal the same progress and state', () => {
    const months = ['2026-10', '2026-11', '2026-12'];
    for (let i = 0; i < 3000; i++) {
      const v = Math.random() < 0.15 ? null : Math.round(Math.random() * 1200) / 10;
      const target = [1, 4.5, 20, 85, 90, 100][i % 6] ?? 85;
      const m = months[i % 3] ?? '2026-11';
      const mine = goalState(v, target, m, '2026-11');
      const theirs = todayState(v, target, m, '2026-11');
      expect(mine.state).toBe(theirs.st);
      expect(mine.pct).toBeCloseTo(theirs.pct, 9);
    }
  });

  it('give the same leaderboard points', () => {
    for (let i = 0; i < 2000; i++) {
      const k = i % 7;
      const gr = i % 5;
      const xp = (i % 3) * 10;
      const av = i % 4 === 0 ? null : 60 + (i % 41);
      const target = 85;
      const theirs =
        k * 5 + gr * 3 + xp + (av != null && av >= target ? 10 : 0) + (av != null ? Math.round(av / 10) : 0);
      expect(leaderboardPoints({ kudos: k, green: gr, taskPoints: xp, average: av, target })).toBe(theirs);
    }
  });
});
