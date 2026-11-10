// The dashboards count exactly as today's app: v2's numbers next to today's, on today's own 842 demo reviews
// (current-app/data.json). Two references: today's report engine itself (current-app/public/js/rpt-engine.js, which
// today's server also uses), and today's dashboard formulas, copied here word for word from widgets.js.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  averageReviewTime,
  calendarWindow,
  chartBuckets,
  averageScore,
  categoryAverages,
  change,
  groups,
  hasComment,
  isPass,
  lastTenWeeks,
  periodWindow,
  scoreBand,
  share,
  type StatReview,
  trend,
} from './stats.js';

const require = createRequire(import.meta.url);
interface TodayReview {
  rid: string;
  id: string;
  agent: string;
  tid: string;
  d: string;
  sc: number;
  scid: string;
  ch?: string;
  rv?: string;
  fl?: string;
  cm?: string;
  seen?: boolean;
  rt?: number;
  at?: string;
  cs: { n: string; e: number; m: number; it?: { cm?: string }[] }[];
}
const data = JSON.parse(readFileSync(new URL('../../../current-app/data.json', import.meta.url), 'utf8')) as {
  evaluations: TodayReview[];
  users: { username: string; name: string; team: string }[];
  teams: { id: string; name: string }[];
};
const RPT = require('../../../current-app/public/js/rpt-engine.js') as {
  run: (
    cfg: object,
    data: object,
  ) => { rows: { key: string; cells: Record<string, number | null>[] }[]; grand: Record<string, number | null> };
};

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** today's review, as v2 keeps it */
const v2 = (e: TodayReview): StatReview => ({
  id: e.rid,
  leadId: e.id,
  agentId: e.agent,
  teamId: e.tid,
  channel: e.ch ?? 'call',
  scorecardId: e.scid,
  reviewerName: e.rv ?? '',
  reviewedOn: localDay(new Date(e.d)),
  createdAt: e.at ?? e.d,
  score: e.sc,
  notScored: false,
  categories: e.cs.map((c) => ({
    name: c.n,
    earned: c.e,
    possible: c.m,
    questions: c.it?.map((q) => ({ comment: q.cm })),
  })),
  comment: e.cm ?? '',
  flag: e.fl ?? '',
  seenAt: e.seen ? e.d : null,
  reviewSeconds: e.rt ?? null,
});
const reviews = data.evaluations.map(v2);
const rates = { general: 85, teams: {} };
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
/** today's report engine over all of today's reviews (each counted for the team it was made in, as v2 does) */
const todayRun = (rows: string) =>
  RPT.run(
    { src: 'reviews', metrics: ['count', 'avg', 'pass'], rows, period: { p: 'all' } },
    { ev: data.evaluations.map((e) => ({ ...e, tm: e.tid })), users: data.users, teams: data.teams, pass: () => 85 },
  );
const grouped = (key: (r: StatReview) => string) => {
  const by = new Map<string, StatReview[]>();
  for (const r of reviews) by.set(key(r), [...(by.get(key(r)) ?? []), r]);
  return by;
};

describe('the dashboard numbers, next to today’s report engine', () => {
  it('has today’s reviews to compare with', () => {
    expect(reviews.length).toBeGreaterThan(500);
  });

  it('gives the same count, average and pass rate overall', () => {
    const today = todayRun('none').grand;
    expect(reviews.length).toBe(today['count']);
    expect(r1(averageScore(reviews))).toBe(today['avg']);
    expect(r1(share(reviews, (r) => isPass(r, rates)))).toBe(today['pass']);
  });

  for (const [dim, key] of [
    ['team', (r: StatReview) => data.teams.find((t) => t.id === r.teamId)?.name ?? r.teamId ?? ''],
    ['type', (r: StatReview) => ({ call: 'Calls', chat: 'Chats', email: 'Emails', other: 'Other' })[r.channel] ?? ''],
    ['agent', (r: StatReview) => data.users.find((u) => u.username === r.agentId)?.name ?? r.agentId ?? ''],
  ] as const)
    it(`gives the same numbers per ${dim}`, () => {
      const today = todayRun(dim).rows;
      const mine = grouped(key);
      expect([...mine.keys()].sort()).toEqual(today.map((r) => r.key).sort());
      for (const row of today) {
        const list = mine.get(row.key) ?? [];
        const cell = row.cells[0] ?? {};
        expect([list.length, r1(averageScore(list)), r1(share(list, (r) => isPass(r, rates)))]).toEqual([
          cell['count'],
          cell['avg'],
          cell['pass'],
        ]);
      }
    });

  it('gives the same average per category', () => {
    const today = todayRun('category').rows;
    const mine = categoryAverages(reviews);
    expect(mine.map((c) => c.name).sort()).toEqual(today.map((r) => r.key).sort());
    for (const c of mine) expect(r1(c.value)).toBe(today.find((r) => r.key === c.name)?.cells[0]?.['avg']);
  });
});

// ---- today's dashboard formulas, copied word for word from current-app/public/js/widgets.js (only `this.` names
// and types added), to run next to v2's on the same reviews
const todayAvg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const todayKtr = (cur: number | null, prev: number | null): number | null => {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
};
type T = { sc: number; d: Date };
const todayTrend = (d: T[]) => {
  const n = d.length;
  const s = [...d].sort((x, y) => +y.d - +x.d);
  const h = Math.ceil(n / 2);
  const dl = n > 1 ? todayAvg(s.slice(0, h).map((e) => e.sc)) - todayAvg(s.slice(h).map((e) => e.sc)) : 0;
  return { dl, tr: Math.abs(dl) < 1.5 ? 'stable' : dl > 0 ? 'improving' : 'declining' };
};
const todayWeeks = (d: T[], now: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const l = d.filter((e) => {
      const age = (now - +e.d) / 864e5 / 7;
      return age >= 9 - i && age < 10 - i;
    });
    return l.length ? todayAvg(l.map((e) => e.sc)) : null;
  });
const iso = (x: Date) => localDay(x);
const todayKey = (d: Date, DGR: string) => {
  const x = new Date(d);
  if (DGR === 'day') return iso(x);
  if (DGR === 'month') return iso(x).slice(0, 7);
  if (DGR === 'quarter') return x.getFullYear() + ' Q' + (Math.floor(x.getMonth() / 3) + 1);
  const m = new Date(x);
  m.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return iso(m);
};
const todayCol = (v: number, g: number) => (v >= g ? 'ok' : v >= 70 ? 'wn' : v >= 50 ? 'hot' : 'bad');

/** a small random number generator with a seed, so every run checks the same samples */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('the dashboard formulas, next to today’s', () => {
  const at = (r: StatReview) => new Date(`${r.reviewedOn}T12:00:00`);
  const random = seeded(7);
  const sample = (n: number) =>
    Array.from({ length: n }, () => reviews[Math.floor(random() * reviews.length)] as StatReview);

  it('gives the same trend (newer half against older half) for 500 random sets of reviews', () => {
    for (let i = 0; i < 500; i++) {
      const list = sample(1 + Math.floor(random() * 60));
      const today = todayTrend(list.map((r) => ({ sc: r.score ?? 0, d: at(r) })));
      const mine = trend(list);
      expect(mine.delta).toBeCloseTo(today.dl, 9);
      expect(mine.direction).toBe(today.tr);
    }
  });

  it('gives the same 10-week line', () => {
    const now = Math.max(...reviews.map((r) => +at(r))) + 864e5;
    const today = todayWeeks(
      reviews.map((r) => ({ sc: r.score ?? 0, d: at(r) })),
      now,
    );
    expect(lastTenWeeks(reviews, now)).toEqual(today);
  });

  it('gives the same change against the period before', () => {
    for (let i = 0; i < 2000; i++) {
      const cur = random() < 0.1 ? null : Math.round(random() * 1000) / 10;
      const prev = random() < 0.1 ? (random() < 0.5 ? null : 0) : Math.round(random() * 1000) / 10;
      expect(change(cur, prev)).toBe(todayKtr(cur, prev));
    }
  });

  it('puts every review in the same day, week, month and quarter', () => {
    for (const grouping of ['day', 'week', 'month', 'quarter'] as const) {
      const mine = groups(reviews, grouping);
      const keys = [...new Set(reviews.map((r) => todayKey(at(r), grouping)))].sort().slice(-16);
      expect(mine.map((g) => g.key)).toEqual(keys);
      for (const g of mine)
        expect(g.reviews.length).toBe(reviews.filter((r) => todayKey(at(r), grouping) === g.key).length);
    }
  });

  it('colours a score as today', () => {
    for (let v = 0; v <= 100; v += 0.5) for (const g of [70, 85, 90]) expect(scoreBand(v, g)).toBe(todayCol(v, g));
  });

  it('counts comments and review time as today', () => {
    const withComment = reviews.filter(hasComment).length;
    const today = data.evaluations.filter(
      (e) =>
        !!String(e.cm || '').trim() || (e.cs || []).some((k) => (k.it || []).some((q) => String(q.cm || '').trim())),
    ).length;
    expect(withComment).toBe(today);
    const times = data.evaluations.map((e) => +(e.rt ?? 0)).filter((x) => x > 0);
    expect(averageReviewTime(reviews)).toBe(times.length ? todayAvg(times) : null);
  });

  it('covers the rolling periods of today’s dashboard', () => {
    const now = Date.UTC(2026, 10, 10, 12);
    expect(periodWindow('week', now)).toEqual([now - 7 * 864e5, Infinity]);
    expect(periodWindow('week', now, undefined, true)).toEqual([now - 14 * 864e5, now - 7 * 864e5]);
    expect(periodWindow('month', now)?.[0]).toBe(now - 30 * 864e5);
    expect(periodWindow('year', now)?.[0]).toBe(now - 365 * 864e5);
    expect(periodWindow('all', now)).toEqual([-Infinity, Infinity]);
    expect(periodWindow('all', now, undefined, true)).toBeNull();
    const custom = periodWindow('custom', now, { from: '2026-11-01', to: '2026-11-07' });
    expect(custom?.[1] && custom[0] && (custom[1] - custom[0]) / 864e5).toBeCloseTo(7, 5);
  });
});

// Today's Agents page (current-app/public/js/agents.js), copied word for word but for the "now" and custom dates it
// reads from the page.
function todayRange(p: string, shift: number, n: Date, AG: { f: string; to: string }) {
  const y = n.getFullYear(),
    m = n.getMonth();
  if (p === 'week') {
    const d = new Date(y, m, n.getDate() - ((n.getDay() + 6) % 7) - 7 * shift),
      e = new Date(d);
    e.setDate(d.getDate() + 7);
    return [d, e];
  }
  if (p === 'month') return [new Date(y, m - shift, 1), new Date(y, m - shift + 1, 1)];
  if (p === 'q') {
    const q = Math.floor(m / 3) * 3 - 3 * shift;
    return [new Date(y, q, 1), new Date(y, q + 3, 1)];
  }
  if (p === 'year') return [new Date(y - shift, 0, 1), new Date(y - shift + 1, 0, 1)];
  if (p === 'custom') {
    const a = new Date(AG.f + 'T00:00:00'),
      b = new Date(AG.to + 'T00:00:00');
    b.setDate(b.getDate() + 1);
    const L = +b - +a;
    return [new Date(+a - L * shift), new Date(+b - L * shift)];
  }
  return shift ? null : [new Date(0), new Date(8.64e15)];
}
function todayBuckets(a: Date, b: Date, p: string) {
  const DAY = 864e5,
    days = Math.max(1, Math.round((+b - +a) / DAY)),
    out: { s: Date; e: Date; w?: number }[] = [];
  const unit =
    p === 'week'
      ? 'day'
      : p === 'month'
        ? 'mweek'
        : p === 'q'
          ? 'week'
          : p === 'year' || p === 'all'
            ? 'month'
            : days <= 14
              ? 'day'
              : days <= 92
                ? 'week'
                : 'month';
  if (unit === 'month')
    for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d < b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
      out.push({ s: d, e: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
  else if (unit === 'mweek')
    for (let i = 0; i < 4; i++) {
      const s = new Date(a.getFullYear(), a.getMonth(), 1 + 7 * i),
        e = i < 3 ? new Date(a.getFullYear(), a.getMonth(), 8 + 7 * i) : new Date(b);
      out.push({ s, e, w: i + 1 });
    }
  else {
    const step = unit === 'day' ? 1 : 7;
    for (let d = new Date(a); d < b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)) {
      const e = new Date(Math.min(+b, +new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)));
      out.push({ s: d, e });
    }
  }
  const last = out[out.length - 1],
    prev = out[out.length - 2];
  if (unit === 'week' && prev && last && +last.e - +last.s < 4 * DAY) {
    prev.e = last.e;
    out.pop();
  }
  return out;
}

describe('the Agents page periods, next to today’s', () => {
  const OURS = { week: 'week', month: 'month', q: 'quarter', year: 'year', all: 'all', custom: 'custom' } as const;
  // every day of two years (both leap and not), at a random hour
  const days = Array.from({ length: 730 }, (_, i) => new Date(2027, 0, 1 + i, Math.floor(Math.random() * 24)));
  const customs = [
    { f: '2026-11-01', to: '2026-11-07' },
    { f: '2026-10-01', to: '2026-12-31' },
    { f: '2026-02-10', to: '2026-03-02' },
    { f: '2025-01-15', to: '2026-11-10' },
  ];

  it('gives the same windows, this one and the ones before, for every day of two years', () => {
    for (const n of days)
      for (const [p, ours] of Object.entries(OURS))
        for (const shift of [0, 1, 2]) {
          const c = customs[n.getDate() % customs.length] ?? { f: '', to: '' };
          const a = todayRange(p, shift, n, c);
          const b = calendarWindow(ours, n.getTime(), shift, { from: c.f, to: c.to });
          if (!a) expect(b).toBeNull();
          else if (p === 'all') expect(b).toEqual([-Infinity, Infinity]);
          else expect(b).toEqual([Number(a[0]), Number(a[1])]);
        }
  });

  it('gives the same chart columns for every period', () => {
    for (const n of days.filter((_, i) => i % 3 === 0))
      for (const [p, ours] of Object.entries(OURS)) {
        if (p === 'all') continue;
        const c = customs[n.getDate() % customs.length] ?? { f: '', to: '' };
        const a = todayRange(p, 0, n, c);
        if (!a) continue;
        const theirs = todayBuckets(a[0] as Date, a[1] as Date, p).map((k) => [+k.s, +k.e, k.w]);
        const mine = chartBuckets([+(a[0] as Date), +(a[1] as Date)], ours).map((k) => [k.from, k.to, k.week]);
        expect(mine).toEqual(theirs);
      }
  });
});
