/**
 * The report engine (today's rpt-engine.js): a report is what to count (a source and its metrics), split into rows and
 * columns, limited by a period and filters. The pages show it, and the server uses the same engine for Excel files and
 * scheduled reports, so a report is never counted two ways. Sources so far: reviews and quick flags; tasks, surveys and
 * complaints join with their phases. The names of things (agents, teams …) are the data's; the words around them
 * (metric names, "Total") are translated by the pages.
 */
import { average, dayOf, scoredOnly, type StatReview } from './stats.js';

export const REPORT_SOURCES = {
  reviews: {
    metrics: ['count', 'avg', 'pass', 'fail', 'min', 'max', 'red', 'green', 'disputed'],
    dims: ['agent', 'team', 'reviewer', 'type', 'scorecard', 'category', 'campaign'],
  },
  flags: { metrics: ['count', 'red', 'green'], dims: ['agent', 'team', 'type', 'flagger'] },
} as const;
export type ReportSource = keyof typeof REPORT_SOURCES;
export type ReportDim =
  | 'none'
  | 'agent'
  | 'team'
  | 'reviewer'
  | 'type'
  | 'scorecard'
  | 'category'
  | 'campaign'
  | 'flagger'
  | 'week'
  | 'month'
  | 'quarter';
export const TIME_DIMS = ['week', 'month', 'quarter'] as const;
export const REPORT_PERIODS = [
  'week',
  'lastweek',
  'month',
  'lastmonth',
  'quarter',
  'year',
  'last30',
  'all',
  'custom',
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
/** metrics shown as a percentage */
export const PERCENT_METRICS = ['avg', 'pass', 'fail', 'min', 'max'];

export interface ReportConfig {
  src: ReportSource;
  metrics: string[];
  rows: ReportDim;
  cols: ReportDim;
  period: { p: ReportPeriod; f?: string; t?: string };
  filters?: { team?: string; agent?: string; ch?: string; sc?: string };
  chart?: 'bars' | 'line' | 'table';
  sort?: 'desc' | 'asc' | 'az';
  limit?: number;
}

/** What a report needs of a review (a scored review with its names). */
export interface ReportReview extends StatReview {
  agentName: string;
  teamName: string;
  scorecardName: string;
  campaign: string;
  disputed: boolean;
}
export interface ReportFlag {
  flaggedOn: string;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  channel: string;
  type: 'red' | 'green';
  byName: string;
}
export interface ReportData {
  reviews: ReportReview[];
  flags: ReportFlag[];
  /** a team's pass rate (the company's when the team has none) */
  passRate: (teamId: string | null) => number;
}

export type Cell = Record<string, number | null> & { _n?: number };
export interface ReportResult {
  src: ReportSource;
  metrics: string[];
  rowDim: ReportDim;
  colDim: ReportDim;
  rows: { key: string; cells: Cell[]; total: Cell | null }[];
  colKeys: string[];
  grand: Cell;
  /** the records counted */
  n: number;
  from: number;
  to: number;
}

const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, '0');
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** Today's report periods: calendar ones (this week from Monday …), the last 30 days, all time, or chosen dates. */
export function reportRange(
  p: ReportPeriod,
  f: string | undefined,
  t: string | undefined,
  now: number,
): [number, number] {
  const n = new Date(now);
  const y = n.getFullYear();
  const m = n.getMonth();
  const at = (yy: number, mm: number, dd = 1) => new Date(yy, mm, dd).getTime();
  const monday = n.getDate() - ((n.getDay() + 6) % 7);
  if (p === 'week') return [at(y, m, monday), at(y, m, monday) + 7 * DAY];
  if (p === 'lastweek') return [at(y, m, monday - 7), at(y, m, monday - 7) + 7 * DAY];
  if (p === 'month') return [at(y, m), at(y, m + 1)];
  if (p === 'lastmonth') return [at(y, m - 1), at(y, m)];
  if (p === 'quarter') {
    const q = Math.floor(m / 3) * 3;
    return [at(y, q), at(y, q + 3)];
  }
  if (p === 'year') return [at(y, 0), at(y + 1, 0)];
  if (p === 'last30') return [now - 30 * DAY, now + DAY];
  if (p === 'custom' && f && t) {
    const b = new Date(`${t}T00:00:00`);
    b.setDate(b.getDate() + 1);
    return [new Date(`${f}T00:00:00`).getTime(), b.getTime()];
  }
  return [0, 8.64e15];
}

/** The ISO week of a day, like 2026-W45. */
export function isoWeek(at: number): string {
  const d = new Date(at);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t.getTime() - y0.getTime()) / DAY + 1) / 7))}`;
}

interface Rec {
  d: number;
  agent: string | null;
  team: string | null;
  ch: string;
  sc: string | null;
  keys: Record<string, string>;
  review?: ReportReview;
  flag?: ReportFlag;
}

function records(src: ReportSource, data: ReportData): Rec[] {
  if (src === 'flags')
    return data.flags.map((f) => ({
      d: new Date(`${f.flaggedOn}T12:00:00`).getTime(),
      agent: f.agentId,
      team: f.teamId,
      ch: f.channel,
      sc: null,
      flag: f,
      keys: { agent: f.agentName || '-', team: f.teamName || 'No team', type: f.channel, flagger: f.byName || '-' },
    }));
  return scoredOnly(data.reviews).map((r) => ({
    d: dayOf(r),
    agent: r.agentId,
    team: r.teamId,
    ch: r.channel,
    sc: r.scorecardId,
    review: r,
    keys: {
      agent: r.agentName || '-',
      team: r.teamName || 'No team',
      reviewer: r.reviewerName || '-',
      type: r.channel,
      scorecard: r.scorecardName || '-',
      campaign: r.campaign || 'general',
    },
  }));
}

/** One metric for a group of records. With a category, every number is about the reviews in which it was scored. */
function metric(src: ReportSource, k: string, list: Rec[], data: ReportData, cat: string | null): number | null {
  if (src === 'flags') {
    if (k === 'count') return list.length;
    if (k === 'red') return list.filter((r) => r.flag?.type === 'red').length;
    if (k === 'green') return list.filter((r) => r.flag?.type === 'green').length;
    return null;
  }
  let l = list;
  if (cat) l = l.filter((r) => r.review?.categories.some((c) => c.name === cat && c.possible));
  const scores = cat
    ? l
        .map((r) => {
          const c = r.review?.categories.find((x) => x.name === cat);
          return c && c.possible ? (c.earned / c.possible) * 100 : null;
        })
        .filter((v): v is number => v !== null)
    : l.map((r) => r.review?.score ?? 0);
  const passed = l.filter((r) => (r.review?.score ?? 0) >= data.passRate(r.team)).length;
  switch (k) {
    case 'count':
      return cat ? scores.length : l.length;
    case 'avg':
      return r1(average(scores));
    case 'pass':
      return l.length ? r1((passed / l.length) * 100) : null;
    case 'fail':
      return l.length ? r1(100 - (passed / l.length) * 100) : null;
    case 'min':
      return scores.length ? r1(Math.min(...scores)) : null;
    case 'max':
      return scores.length ? r1(Math.max(...scores)) : null;
    case 'red':
      return l.filter((r) => r.review?.flag === 'red').length;
    case 'green':
      return l.filter((r) => r.review?.flag === 'green').length;
    case 'disputed':
      return l.filter((r) => r.review?.disputed).length;
    default:
      return null;
  }
}

/** Today's `run`: the report's rows (each with a cell per column and a total), the grand total and the period. */
export function runReport(cfg: ReportConfig, data: ReportData, now: number): ReportResult {
  const src: ReportSource = cfg.src in REPORT_SOURCES ? cfg.src : 'reviews';
  const known: readonly string[] = REPORT_SOURCES[src].metrics;
  const mets = (cfg.metrics ?? []).filter((m) => known.includes(m));
  if (!mets.length) mets.push(known[0] ?? 'count');
  const [a, b] = reportRange(cfg.period?.p ?? 'month', cfg.period?.f, cfg.period?.t, now);
  const fl = cfg.filters ?? {};
  const l = records(src, data).filter(
    (r) =>
      r.d >= a &&
      r.d < b &&
      (!fl.team || r.team === fl.team) &&
      (!fl.agent || r.agent === fl.agent) &&
      (!fl.ch || r.ch === fl.ch) &&
      (!fl.sc || r.sc === fl.sc),
  );
  const rowDim = cfg.rows ?? 'none';
  const colDim = cfg.cols ?? 'none';
  const keyOf = (r: Rec, dim: ReportDim): string => {
    const d = new Date(r.d);
    if (dim === 'week') return isoWeek(r.d);
    if (dim === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    if (dim === 'quarter') return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
    if (dim === 'none') return 'Total';
    return r.keys[dim] ?? '-';
  };
  const cats =
    src === 'reviews' && (rowDim === 'category' || colDim === 'category')
      ? [...new Set(l.flatMap((r) => r.review?.categories.map((c) => c.name) ?? []))]
      : [];
  const rowKeys = rowDim === 'category' ? cats : [...new Set(l.map((r) => keyOf(r, rowDim)))];
  const colKeys = colDim === 'category' ? cats : [...new Set(l.map((r) => keyOf(r, colDim)))].sort();
  const cellOf = (sub: Rec[], cat: string | null): Cell => {
    const o: Cell = {};
    for (const m of mets) o[m] = metric(src, m, sub, data, cat);
    return o;
  };
  let rows = rowKeys.map((rk) => ({
    key: rk,
    cells: colKeys.map((ck) => {
      const sub = l.filter(
        (r) => (rowDim === 'category' || keyOf(r, rowDim) === rk) && (colDim === 'category' || keyOf(r, colDim) === ck),
      );
      const cell = cellOf(sub, rowDim === 'category' ? rk : colDim === 'category' ? ck : null);
      cell._n = sub.length;
      return cell;
    }),
    total:
      colDim === 'none'
        ? null
        : cellOf(
            l.filter((r) => rowDim === 'category' || keyOf(r, rowDim) === rk),
            rowDim === 'category' ? rk : null,
          ),
  }));
  const first = mets[0] ?? 'count';
  const val = (r: (typeof rows)[number]) => (r.total ?? r.cells[0] ?? {})[first] ?? -1e9;
  if ((TIME_DIMS as readonly string[]).includes(rowDim)) rows.sort((x, y) => x.key.localeCompare(y.key));
  else if (cfg.sort === 'asc') rows.sort((x, y) => val(x) - val(y));
  else if (cfg.sort === 'az') rows.sort((x, y) => x.key.localeCompare(y.key));
  else rows.sort((x, y) => val(y) - val(x));
  if (cfg.limit) rows = rows.slice(0, cfg.limit);
  return { src, metrics: mets, rowDim, colDim, rows, colKeys, grand: cellOf(l, null), n: l.length, from: a, to: b };
}

/** A saved report's schedule (today's): never, every day, every week on a weekday, or every month on a day (1-28). */
export interface ScheduleRule {
  freq: 'none' | 'daily' | 'weekly' | 'monthly';
  weekday?: number;
  day?: number;
  hour?: number;
  /** the time zone of the person who chose it (their browser's), so "8:00" is their 8:00 */
  timeZone?: string;
}

/** The date, hour, weekday (0 Sunday) and day of the month of a moment, in a time zone (UTC if it is unknown). */
export function localParts(
  now: number,
  timeZone?: string,
): { date: string; hour: number; weekday: number; day: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(new Date(now));
  } catch {
    return localParts(now, 'UTC');
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    weekday,
    day: Number(get('day')),
  };
}

/**
 * Today's scheduler: a report is due once its hour has come on its day (every day, its weekday, or its day of the
 * month), and it has not arrived yet that day.
 */
export function reportDue(s: ScheduleRule, lastSentAt: Date | string | null, now: number): boolean {
  if (s.freq === 'none') return false;
  const here = localParts(now, s.timeZone);
  if (here.hour < (s.hour ?? 8)) return false;
  if (s.freq === 'weekly' && here.weekday !== (s.weekday ?? 1)) return false;
  if (s.freq === 'monthly' && here.day !== (s.day ?? 1)) return false;
  return !lastSentAt || localParts(new Date(lastSentAt).getTime(), s.timeZone).date !== here.date;
}

/** Today's English names, for the Excel files (always in English, as today's). The pages translate their own. */
export const REPORT_NAMES = {
  metrics: {
    reviews: {
      count: 'Number of reviews',
      avg: 'Average score (%)',
      pass: 'Pass rate (%)',
      fail: 'Fail rate (%)',
      min: 'Lowest score (%)',
      max: 'Highest score (%)',
      red: 'Red flags',
      green: 'Green flags',
      disputed: 'Disputes',
    },
    flags: { count: 'Number of flags', red: 'Red flags', green: 'Green flags' },
  } as Record<ReportSource, Record<string, string>>,
  dims: {
    none: '- nothing -',
    agent: 'Agent',
    team: 'Team',
    reviewer: 'Reviewer',
    type: 'Review type',
    scorecard: 'Scorecard',
    category: 'Category',
    campaign: 'Campaign',
    flagger: 'Flagged by',
    week: 'Week',
    month: 'Month',
    quarter: 'Quarter',
  } as Record<ReportDim, string>,
  channels: { call: 'Calls', chat: 'Chats', email: 'Emails', other: 'Other' } as Record<string, string>,
};

/** A result as a plain table (today's Excel of a report): a row per row, the metrics or the columns. */
export function reportTable(res: ReportResult): (string | number)[][] {
  const name = (dim: ReportDim, key: string) => (dim === 'type' ? (REPORT_NAMES.channels[key] ?? key) : key);
  const value = (v: number | null | undefined) => (v === null || v === undefined ? '' : v);
  const metricNames = res.metrics.map((m) => REPORT_NAMES.metrics[res.src][m] ?? m);
  const first = res.metrics[0] ?? 'count';
  if (res.colDim === 'none')
    return [
      [REPORT_NAMES.dims[res.rowDim], ...metricNames],
      ...res.rows.map((r) => [name(res.rowDim, r.key), ...res.metrics.map((m) => value(r.cells[0]?.[m]))]),
    ];
  return [
    [REPORT_NAMES.dims[res.rowDim], ...res.colKeys.map((k) => name(res.colDim, k)), 'Total'],
    ...res.rows.map((r) => [name(res.rowDim, r.key), ...r.cells.map((c) => value(c[first])), value(r.total?.[first])]),
  ];
}
