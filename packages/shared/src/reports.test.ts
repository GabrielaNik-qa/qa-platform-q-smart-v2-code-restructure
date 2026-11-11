// The report engine counts as today's: v2's engine next to today's own (current-app/public/js/rpt-engine.js) on
// today's 842 demo reviews (current-app/data.json), for every metric, every way of splitting rows and columns, and
// several periods; also quick flags. Each review counts for the team it was made in, as v2 does.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { type ReportConfig, type ReportDim, type ReportReview, reportDue, runReport } from './reports.js';

const require = createRequire(import.meta.url);
interface TodayReview {
  rid: string;
  id: string;
  agent: string;
  tid: string;
  d: string;
  sc: number;
  scid: string;
  scn?: string;
  ch?: string;
  rv?: string;
  fl?: string;
  cp?: string;
  ns?: boolean;
  dp?: object;
  at?: string;
  cs: { n: string; e: number; m: number }[];
}
interface TodayFlag {
  date: string;
  agent: string;
  tid?: string;
  ch?: string;
  type: 'red' | 'green';
  byName?: string;
  by?: string;
}
const data = JSON.parse(readFileSync(new URL('../../../current-app/data.json', import.meta.url), 'utf8')) as {
  evaluations: TodayReview[];
  qflags?: TodayFlag[];
  users: { username: string; name: string; team: string }[];
  teams: { id: string; name: string }[];
};
type Cell = Record<string, number | null>;
const RPT = require('../../../current-app/public/js/rpt-engine.js') as {
  run: (
    cfg: object,
    data: object,
  ) => {
    rows: { key: string; cells: Cell[]; total: Cell | null }[];
    colKeys: string[];
    grand: Cell;
    n: number;
  };
};

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nameOf = (u: string) => data.users.find((x) => x.username === u)?.name ?? u;
const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? id;
const CHN: Record<string, string> = { call: 'Calls', chat: 'Chats', email: 'Emails', other: 'Other' };
const pass = (team: string | null) => (team === 't-b2c' ? 90 : 85);

const ev = data.evaluations.filter((e) => !e.ns);
const reviews: ReportReview[] = ev.map((e) => ({
  id: e.rid,
  leadId: e.id,
  agentId: e.agent,
  agentName: nameOf(e.agent),
  teamId: e.tid,
  teamName: teamName(e.tid),
  channel: e.ch ?? 'call',
  scorecardId: e.scid,
  scorecardName: e.scn ?? '',
  reviewerName: e.rv ?? '',
  campaign: e.cp ?? '',
  disputed: Boolean(e.dp),
  reviewedOn: localDay(new Date(e.d)),
  createdAt: e.at ?? e.d,
  score: e.sc,
  notScored: false,
  categories: e.cs.map((c) => ({ name: c.n, earned: c.e, possible: c.m })),
  comment: '',
  flag: e.fl ?? '',
  seenAt: null,
  reviewSeconds: null,
}));
// today's demo data has no quick flags: both engines get the same 60 made up from the reviews
const qflags: TodayFlag[] = data.qflags?.length
  ? data.qflags
  : ev.slice(0, 60).map((e, i) => ({
      date: localDay(new Date(e.d)),
      agent: e.agent,
      tid: e.tid,
      ch: e.ch ?? 'call',
      type: i % 3 ? 'green' : 'red',
      byName: i % 2 ? 'Ada Admin' : 'Rita Reviewer',
    }));
const flags = qflags.map((f) => ({
  flaggedOn: f.date,
  agentId: f.agent,
  agentName: nameOf(f.agent),
  teamId: f.tid ?? null,
  teamName: f.tid ? teamName(f.tid) : '',
  channel: f.ch ?? 'call',
  type: f.type,
  byName: f.byName ?? f.by ?? '',
}));
const NOW = new Date(2026, 10, 15, 12).getTime();
// today's engine reads "now" itself: give it the same moment
const RealDate = Date;
function atNow<T>(fn: () => T): T {
  const Fixed = class extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length) super(...(args as [string]));
      else super(NOW);
    }
    static override now() {
      return NOW;
    }
  };
  globalThis.Date = Fixed as DateConstructor;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
}
const todayData = {
  ev: ev.map((e) => ({ ...e, tm: e.tid })),
  qf: qflags,
  users: data.users,
  teams: data.teams,
  pass,
};
const mineData = { reviews, flags, passRate: pass };
/** v2 keeps the review type as a code; today's engine names it */
const named = (dim: ReportDim, key: string) => (dim === 'type' ? (CHN[key] ?? key) : key);

function compare(cfg: ReportConfig) {
  const theirs = atNow(() => RPT.run(cfg, todayData));
  const mine = runReport(cfg, mineData, NOW);
  expect(mine.n, JSON.stringify(cfg)).toBe(theirs.n);
  expect(mine.grand).toEqual(theirs.grand);
  expect(mine.colKeys.map((k) => named(cfg.cols, k)).sort()).toEqual([...theirs.colKeys].sort());
  const rowsMine = new Map(mine.rows.map((r) => [named(cfg.rows, r.key), r]));
  expect([...rowsMine.keys()].sort()).toEqual(theirs.rows.map((r) => r.key).sort());
  for (const row of theirs.rows) {
    const m = rowsMine.get(row.key);
    expect(m?.total ?? null, `${JSON.stringify(cfg)} ${row.key}`).toEqual(row.total);
    const byCol = new Map(mine.colKeys.map((k, i) => [named(cfg.cols, k), m?.cells[i]]));
    theirs.colKeys.forEach((ck, i) => expect(byCol.get(ck)).toEqual(row.cells[i]));
  }
}

describe('the report engine, next to today’s', () => {
  it('has today’s reviews to compare with', () => {
    expect(reviews.length).toBeGreaterThan(500);
  });

  const metrics = ['count', 'avg', 'pass', 'fail', 'min', 'max', 'red', 'green', 'disputed'];
  const rows: ReportDim[] = [
    'none',
    'agent',
    'team',
    'reviewer',
    'type',
    'scorecard',
    'category',
    'campaign',
    'week',
    'month',
    'quarter',
  ];
  const periods: ReportConfig['period'][] = [
    { p: 'all' },
    { p: 'quarter' },
    { p: 'lastmonth' },
    { p: 'custom', f: '2026-06-01', t: '2026-08-31' },
  ];
  for (const period of periods)
    it(`gives the same reviews report for ${period.p}, split every way`, () => {
      for (const r of rows)
        for (const c of ['none', 'month', 'team', 'category'] as ReportDim[]) {
          if (r === c && r !== 'none') continue;
          compare({ src: 'reviews', metrics, rows: r, cols: c, period });
        }
    }, 60_000); // hundreds of reports: more time when every test runs at once

  it('gives the same with filters and sorting', () => {
    const team = 't-b2c';
    const agent = ev[0]?.agent ?? '';
    for (const sort of ['desc', 'asc', 'az'] as const) {
      compare({
        src: 'reviews',
        metrics: ['avg', 'count'],
        rows: 'agent',
        cols: 'none',
        period: { p: 'all' },
        sort,
        filters: { team },
      });
      compare({
        src: 'reviews',
        metrics: ['pass'],
        rows: 'category',
        cols: 'none',
        period: { p: 'all' },
        sort,
        filters: { agent, ch: 'call' },
      });
    }
  }, 60_000);

  it('gives the same quick flags report', () => {
    for (const r of ['none', 'agent', 'type', 'flagger', 'month'] as ReportDim[])
      compare({ src: 'flags', metrics: ['count', 'red', 'green'], rows: r, cols: 'none', period: { p: 'all' } });
  }, 60_000);
});

describe('scheduled reports', () => {
  // Wednesday 11 November 2026, 07:30 in Sofia (05:30 UTC)
  const wed0730 = Date.UTC(2026, 10, 11, 5, 30);
  const wed0930 = Date.UTC(2026, 10, 11, 7, 30);
  const tz = 'Europe/Sofia';

  it('arrives once its hour has come, in the time zone of the person who chose it', () => {
    expect(reportDue({ freq: 'daily', hour: 8, timeZone: tz }, null, wed0730)).toBe(false);
    expect(reportDue({ freq: 'daily', hour: 8, timeZone: tz }, null, wed0930)).toBe(true);
    expect(reportDue({ freq: 'daily', hour: 6, timeZone: 'UTC' }, null, wed0730)).toBe(false);
  });

  it('arrives once a day at most, and only on its weekday or day of the month', () => {
    expect(reportDue({ freq: 'daily', hour: 8, timeZone: tz }, new Date(wed0930 - 60e3), wed0930)).toBe(false);
    expect(reportDue({ freq: 'daily', hour: 8, timeZone: tz }, new Date(wed0930 - 864e5), wed0930)).toBe(true);
    expect(reportDue({ freq: 'weekly', weekday: 3, hour: 8, timeZone: tz }, null, wed0930)).toBe(true);
    expect(reportDue({ freq: 'weekly', weekday: 1, hour: 8, timeZone: tz }, null, wed0930)).toBe(false);
    expect(reportDue({ freq: 'monthly', day: 11, hour: 8, timeZone: tz }, null, wed0930)).toBe(true);
    expect(reportDue({ freq: 'monthly', day: 1, hour: 8, timeZone: tz }, null, wed0930)).toBe(false);
    expect(reportDue({ freq: 'none' }, null, wed0930)).toBe(false);
  });

  it('counts in UTC when the time zone is unknown', () => {
    expect(reportDue({ freq: 'daily', hour: 7, timeZone: 'Mars/Olympus' }, null, wed0930)).toBe(true);
    expect(reportDue({ freq: 'daily', hour: 8, timeZone: 'Mars/Olympus' }, null, wed0930)).toBe(false);
  });
});
