// The quality widgets of the Dashboard (Phase 3, step 2), as today's (current-app: widgets.js, dashboards.js): lists,
// categories, people, review tables, the team heat map, "Needs you now" and the team briefing. Each counts with the
// shared rules (packages/shared/src/stats.ts) on the reviews the dashboard's filters picked. Agent and team names become
// links when their own pages arrive (step 3).
import {
  average,
  averageReviewTime,
  averageScore,
  categoryAverages,
  categoryValue,
  change,
  hasComment,
  isPass,
  passRateOf,
  share,
  type StatFilters,
  trend,
} from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CategoryDots, Donut } from './charts';
import type { Dispute } from './Disputes';
import type { PassRates, ReviewRow } from './QAEntry';
import type { QuickFlag } from './QuickFlags';
import { card, type PersonRow, type TeamRow, type WorkspaceRow } from './ui';

/** What every widget gets: the reviews of the dashboard's filters, the period before, and the company's lists. */
export interface WidgetContext {
  d: ReviewRow[];
  pv: ReviewRow[] | null;
  /** the pass rate the dashboard compares with: the filtered team's, or the company's */
  target: number;
  rates: PassRates | null;
  /** the same period with other filters (Teams compared: each team; Review types compared: every type) */
  slice: (change: Partial<StatFilters>) => ReviewRow[];
  /** every scored review the person may see, whatever the filters (the briefing's week-on-week) */
  all: ReviewRow[];
  teamFilter: string;
  people: PersonRow[];
  teams: TeamRow[];
  workspaces: WorkspaceRow[];
  flags: QuickFlag[];
  disputes: Map<string, Dispute>;
  staff: boolean;
  agentView: boolean;
  now: number;
}

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const DAY = 864e5;
const ageDays = (r: ReviewRow, now: number) => (now - new Date(`${r.reviewedOn}T12:00:00`).getTime()) / DAY;

/** Today's pass/below/fail colour of a score, against a team's pass rate (today's `sp` and `scol`). */
function band(value: number, rates: PassRates | null, teamId: string | null) {
  const p = passRateOf(rates, teamId);
  return value >= p ? 'ok' : value >= Math.min(70, p) ? 'wn' : 'bad';
}
const BAND_TEXT = { ok: 'text-ok', wn: 'text-wn', bad: 'text-bad', hot: 'text-hot' } as const;
const BAND_FILL = { ok: 'bg-ok', wn: 'bg-wn', bad: 'bg-bad', hot: 'bg-hot' } as const;
const BAND_SOFT = {
  ok: 'bg-ok/12 text-ok',
  wn: 'bg-wn/15 text-wn',
  bad: 'bg-bad/12 text-bad',
  hot: 'bg-hot/12 text-hot',
} as const;
/** today's colour of a value against the target: at it, below it, low, failing */
const colour = (v: number, target: number) => (v >= target ? 'ok' : v >= 70 ? 'wn' : v >= 50 ? 'hot' : 'bad');

/** A score as today's coloured pill. */
function ScorePill({ value, rates, teamId }: { value: number; rates: PassRates | null; teamId: string | null }) {
  return (
    <span className={`rounded-full px-2 text-xs font-semibold font-mono ${BAND_SOFT[band(value, rates, teamId)]}`}>
      {Math.round(value * 10) / 10}%
    </span>
  );
}
/** A value against the target, as today's tinted cell (green at the target or above, red below). */
function Versus({ value, target }: { value: number | null; target: number }) {
  if (value === null) return <span className="text-mu">—</span>;
  return (
    <span
      className={`inline-block min-w-16 rounded-[6px] px-2 py-0.5 text-right font-mono tabular-nums ${value >= target ? 'bg-ok/12' : 'bg-bad/12'}`}
    >
      {pct1(value)}
    </span>
  );
}
/** Today's thin bar under a row. */
function Bar({ value, tone }: { value: number; tone: keyof typeof BAND_FILL | 'mu' }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunk">
      <div
        className={`h-full rounded-full ${tone === 'mu' ? 'bg-mu/40' : BAND_FILL[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-mu">{children}</p>;
}
const th = 'py-1 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-mu';
const td = 'py-1.5 pr-3';
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-bd">
              {r.map((cell, j) => (
                <td key={j} className={td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const ReviewLink = ({ r }: { r: ReviewRow }) => (
  <Link to="/review/$id" params={{ id: r.id }} className="font-mono font-semibold text-ac hover:underline">
    {r.leadId}
  </Link>
);
const PageLink = ({ page, children }: { page: string; children: ReactNode }) => (
  <Link to="/$app/$page" params={{ app: 'quality', page }} className="font-semibold text-ac hover:underline">
    {children}
  </Link>
);

/** Per agent: reviews, average and pass rate (today's `agS`, over the agents of the company). */
function agentStats(c: WidgetContext, list: ReviewRow[]) {
  return c.people
    .filter((p) => p.role === 'agent')
    .map((p) => {
      const mine = list.filter((r) => r.agentId === p.membershipId);
      return {
        id: p.membershipId,
        name: p.name,
        teamId: p.teamId,
        count: mine.length,
        average: averageScore(mine) ?? 0,
        pass: share(mine, (r) => isPass(r, c.rates)) ?? 0,
      };
    })
    .filter((a) => a.count > 0);
}
/** The agents who need support: at least two reviews and an average below their team's pass rate, lowest first. */
const needSupport = (c: WidgetContext, list: ReviewRow[]) =>
  agentStats(c, list)
    .filter((a) => a.count >= 2 && a.average < passRateOf(c.rates, a.teamId))
    .filter((a) => !c.teamFilter || a.teamId === c.teamFilter)
    .sort((a, b) => a.average - b.average);
/** The open disputes of the reviews the person may see (and of the filtered team). */
const openDisputes = (c: WidgetContext) =>
  c.all.filter((r) => {
    const x = c.disputes.get(r.id);
    return x && x.state !== 'resolved' && (!c.teamFilter || r.teamId === c.teamFilter);
  });
const groupBy = <T,>(list: T[], key: (item: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};
const duration = (s: number | null) =>
  s === null ? '—' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
/** A category's score in a list of reviews (the reviews that scored it). */
const categoryOf = (list: ReviewRow[], name: string) =>
  average(list.map((r) => categoryValue(r, name)).filter((v): v is number => v !== null));

/** The change of a value against the period before, as today's small ▲ ▼ text. */
function Change({ cur, prev }: { cur: number | null; prev: number | null }) {
  const { t } = useTranslation();
  const r = change(cur, prev);
  if (r === null)
    return (
      <small className="text-xs text-mu" title={t('dash.noCompare')}>
        ∅
      </small>
    );
  return (
    <small className={`text-xs ${r === 0 ? 'text-mu' : r > 0 ? 'text-ok' : 'text-bad'}`}>
      {r >= 0 ? '▲' : '▼'} {Math.abs(r)}%
    </small>
  );
}

/** The widgets, by today's id, with today's width (of 60 columns) and group (Home › Personalize). */
export interface WidgetSpec {
  width: number;
  group: 'Numbers' | 'Charts' | 'Categories' | 'People' | 'Lists' | 'Work' | 'Performance' | 'Customers' | 'More';
  render: (c: WidgetContext, span: number) => ReactNode;
}

function W({ id, extra, children }: { id: string; extra?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className={`${card} grid h-full content-start gap-2`} aria-labelledby={`w-${id}`}>
      <h2 id={`w-${id}`} className="flex flex-wrap items-center gap-2 font-semibold" title={t(`widgets.${id}.help`)}>
        {t(`widgets.${id}.title`)}
        {extra}
      </h2>
      {children}
    </section>
  );
}

function Last5({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const list = [...c.d].sort((a, b) => (a.reviewedOn < b.reviewedOn ? 1 : -1)).slice(0, 5);
  return (
    <W id="last5">
      {list.length ? (
        <ul className="grid">
          {list.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 border-t border-bd py-1.5 first:border-t-0"
            >
              <span className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-sunk text-xs font-semibold">
                  {r.agentName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <span>
                  <ReviewLink r={r} /> <small className="text-mu">{t(`reviews.channels.${r.channel}`)}</small>
                  <br />
                  <small className="text-mu">{r.agentName}</small>
                </span>
              </span>
              <ScorePill value={r.score ?? 0} rates={c.rates} teamId={r.teamId} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('widgets.common.noEvaluations')}</Empty>
      )}
    </W>
  );
}

function Distribution({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const n = c.d.length;
  const edges = [...new Set([0, 50, 70, c.target, 101])].sort((a, b) => a - b);
  return (
    <W
      id="distribution"
      extra={<small className="ml-auto font-normal text-mu">{t('widgets.common.reviews', { count: n })}</small>}
    >
      {edges.slice(0, -1).map((lo, i) => {
        const hi = edges[i + 1] ?? 101;
        const k = c.d.filter((r) => (r.score ?? 0) >= lo && (r.score ?? 0) < hi).length;
        return (
          <div key={lo}>
            <div className="flex justify-between text-sm">
              <span>
                {lo}-{hi > 100 ? 100 : hi - 1}%
              </span>
              <b className="font-mono">
                {t('widgets.distribution.row', { count: k, share: n ? Math.round((k / n) * 100) : 0 })}
              </b>
            </div>
            <Bar value={n ? (k / n) * 100 : 0} tone={colour(lo, c.target)} />
          </div>
        );
      })}
    </W>
  );
}

function CategoryList({ c, strong }: { c: WidgetContext; strong: boolean }) {
  const { t } = useTranslation();
  const all = categoryAverages(c.d);
  const list = all.filter((x) => (strong ? x.value >= c.target : x.value < c.target));
  return (
    <W
      id={strong ? 'strong' : 'needs'}
      extra={
        <span className={`rounded-full px-2 text-xs font-semibold ${strong ? 'bg-ok/12 text-ok' : 'bg-wn/15 text-wn'}`}>
          {strong ? '≥' : '<'} {c.target}%
        </span>
      }
    >
      {list.length ? (
        list.map((x) => (
          <div key={x.name}>
            <div className="flex justify-between gap-2 text-sm">
              <span>{x.name}</span>
              <b className="font-mono">{pct1(x.value)}</b>
            </div>
            <Bar value={x.value} tone={colour(x.value, c.target)} />
          </div>
        ))
      ) : (
        <Empty>{strong || !all.length ? t('widgets.common.nothing') : t('widgets.needs.allGood')}</Empty>
      )}
    </W>
  );
}

function People({ c, top }: { c: WidgetContext; top: boolean }) {
  const { t } = useTranslation();
  const list = agentStats(c, c.d)
    .sort((a, b) => (top ? b.average - a.average : a.average - b.average))
    .slice(0, 5);
  return (
    <W id={top ? 'top' : 'low'}>
      {list.length ? (
        <ul className="grid">
          {list.map((a, i) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 border-t border-bd py-1.5 first:border-t-0 text-sm"
            >
              <span>
                {top && `#${i + 1} `}
                <b>{a.name}</b>{' '}
                <small className="text-mu">
                  {top
                    ? t('widgets.common.evaluations', { count: a.count })
                    : t('widgets.low.detail', { count: a.count, pass: a.pass.toFixed(0) })}
                </small>
              </span>
              <b className={`font-mono ${BAND_TEXT[band(a.average, c.rates, a.teamId)]}`}>{pct1(a.average)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('widgets.common.noData')}</Empty>
      )}
    </W>
  );
}

function Teams({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const list = c.teams.filter((x) => !c.teamFilter || x.id === c.teamFilter);
  return (
    <W id="teams">
      {list.map((team) => {
        const l = c.slice({ teamId: team.id });
        const a = averageScore(l);
        const tone = a === null ? 'mu' : band(a, c.rates, team.id);
        return (
          <div key={team.id}>
            <div className="flex justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <i
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: team.color }}
                  aria-hidden="true"
                />
                {team.name} <small className="text-mu">{t('widgets.common.reviews', { count: l.length })}</small>
              </span>
              <b className={`font-mono ${a === null ? 'text-mu' : BAND_TEXT[band(a, c.rates, team.id)]}`}>
                {a === null ? '—' : pct1(a)}
              </b>
            </div>
            <Bar value={a ?? 0} tone={tone} />
          </div>
        );
      })}
    </W>
  );
}

function QuickFlagList({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const list = c.flags.filter((f) => !c.teamFilter || f.teamId === c.teamFilter).slice(0, 5);
  return (
    <W
      id="qflags"
      extra={
        c.staff ? (
          <span className="ml-auto text-sm font-normal">
            <PageLink page="quick-flags">›</PageLink>
          </span>
        ) : null
      }
    >
      {list.length ? (
        <ul className="grid">
          {list.map((f) => (
            <li key={f.id} className="border-t border-bd py-1.5 text-sm first:border-t-0">
              <span className={f.type === 'red' ? 'text-bad' : 'text-ok'} aria-label={t(`flags.${f.type}`)}>
                ⚑
              </span>{' '}
              <b className="font-mono">{f.leadId}</b>{' '}
              <small className="text-mu">
                {f.agentName} · {f.flaggedOn}
              </small>
              {f.comment && (
                <>
                  <br />
                  <small>{f.comment.slice(0, 70)}</small>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('widgets.qflags.none')}</Empty>
      )}
    </W>
  );
}

function Targets({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const a = averageScore(c.d) ?? 0;
  const ok = a >= c.target;
  const open = openDisputes(c).slice(0, 4);
  return (
    <W id="targets">
      <Link
        to="/$app/$page"
        params={{ app: 'quality', page: 'reviews' }}
        className={`rounded-m p-3 ${ok ? 'bg-ok/12' : 'bg-bad/12'} hover:brightness-95`}
      >
        <b>
          {ok ? t('widgets.targets.reached', { target: c.target }) : t('widgets.targets.below', { target: c.target })}
        </b>
        <br />
        <small>{t('widgets.targets.current', { value: a.toFixed(1) })}</small>
      </Link>
      {open.length ? (
        open.map((r) => (
          <Link key={r.id} to="/review/$id" params={{ id: r.id }} className="text-sm hover:underline">
            • {t('widgets.targets.disputed', { name: r.agentName, lead: r.leadId })}
          </Link>
        ))
      ) : (
        <Empty>{t('widgets.targets.noDisputes')}</Empty>
      )}
    </W>
  );
}

function Channels({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const l = c.slice({ channel: undefined });
  const used = (['call', 'chat', 'email', 'other'] as const).filter((k) => l.some((r) => r.channel === k));
  return (
    <W id="channels">
      {used.length ? (
        used.map((k) => {
          const z = l.filter((r) => r.channel === k);
          const a = averageScore(z) ?? 0;
          const pass = Math.round(share(z, (r) => isPass(r, c.rates)) ?? 0);
          return (
            <div key={k}>
              <div className="flex justify-between gap-2 text-sm">
                <span>
                  <b>{t(`reviews.channels.${k}`)}</b>{' '}
                  <small className="text-mu">{t('widgets.channels.detail', { count: z.length, pass })}</small>
                </span>
                <b className={`font-mono ${BAND_TEXT[band(a, c.rates, c.teamFilter || null)]}`}>{pct1(a)}</b>
              </div>
              <Bar value={a} tone={band(a, c.rates, c.teamFilter || null)} />
            </div>
          );
        })
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

function Attention({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const list = c.d
    .filter((r) => !isPass(r, c.rates))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 5);
  return (
    <W id="attention">
      {list.length ? (
        <ul className="grid">
          {list.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 border-t border-bd py-1.5 text-sm first:border-t-0"
            >
              <span>
                <ReviewLink r={r} />{' '}
                <small className="text-mu">
                  {r.agentName} · {r.reviewedOn}
                </small>
              </span>
              <ScorePill value={r.score ?? 0} rates={c.rates} teamId={r.teamId} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('widgets.attention.none')}</Empty>
      )}
    </W>
  );
}

function CategoryInsights({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const sorted = [...c.d].sort((a, b) => (a.reviewedOn < b.reviewedOn ? -1 : 1));
  const h = Math.floor(sorted.length / 2);
  const old = sorted.slice(0, h);
  const recent = sorted.slice(h);
  const cats = categoryAverages(c.d);
  return (
    <W id="catins">
      {cats.length ? (
        <Table
          head={[
            t('widgets.h.category'),
            t('widgets.h.average'),
            t('widgets.h.trend'),
            t('widgets.h.ratings'),
            t('widgets.h.belowTarget'),
            t('widgets.h.scored0'),
            t('widgets.h.disputes'),
          ]}
          rows={cats.map((x) => {
            const values = c.d.map((r) => categoryValue(r, x.name)).filter((v): v is number => v !== null);
            const a1 = categoryOf(old, x.name);
            const a2 = categoryOf(recent, x.name);
            const zero = c.d.filter((r) =>
              r.categories.some((k) => k.name === x.name && k.possible && k.earned === 0),
            ).length;
            const d = a1 !== null && a2 !== null && old.length && recent.length ? a2 - a1 : null;
            return [
              x.name,
              <b key="a" className={`font-mono ${BAND_TEXT[colour(x.value, c.target)]}`}>
                {pct1(x.value)}
              </b>,
              d === null ? (
                <small key="t" className="text-mu">
                  —
                </small>
              ) : (
                <span
                  key="t"
                  className={`rounded-full px-2 text-xs font-semibold ${d >= 0 ? 'bg-ok/12 text-ok' : 'bg-bad/12 text-bad'}`}
                >
                  {d >= 0 ? '↗' : '↘'} {Math.abs(d).toFixed(1)}
                </span>
              ),
              values.length,
              values.filter((v) => v < c.target).length,
              zero ? (
                <span key="z" className="text-bad">
                  {zero}
                </span>
              ) : (
                0
              ),
              c.d.filter(
                (r) => c.disputes.has(r.id) && r.categories.some((k) => k.name === x.name && k.earned < k.possible),
              ).length,
            ];
          })}
        />
      ) : (
        <Empty>{t('widgets.common.noData')}</Empty>
      )}
    </W>
  );
}

/** Today's `countBy`: in how many reviews each category matched, most first. */
function countBy(list: ReviewRow[], test: (k: ReviewRow['categories'][number]) => boolean) {
  const m = new Map<string, number>();
  for (const r of list) for (const k of r.categories) if (test(k)) m.set(k.name, (m.get(k.name) ?? 0) + 1);
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function RootCauses({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const m = new Map<string, { cause: string; category: string; n: number }>();
  for (const r of c.d)
    for (const k of r.categories)
      for (const q of k.questions)
        if (q.rootCause && q.answer !== 'y') {
          const key = `${q.rootCause}\u0001${k.name}`;
          const x = m.get(key) ?? { cause: q.rootCause, category: k.name, n: 0 };
          x.n++;
          m.set(key, x);
        }
  const rows = [...m.values()].sort((a, b) => b.n - a.n).slice(0, 30);
  return (
    <W id="rootc">
      {rows.length ? (
        <Table
          head={[t('widgets.h.rootCause'), t('widgets.h.category'), t('widgets.h.count')]}
          rows={rows.map((x) => [
            x.cause,
            x.category,
            <b key="n" className="font-mono">
              {x.n}
            </b>,
          ])}
        />
      ) : (
        <Empty>{t('widgets.rootc.none')}</Empty>
      )}
    </W>
  );
}

function Scorecards({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const rows = [...groupBy(c.d, (r) => r.scorecardName).entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <W id="scperf">
      {rows.length ? (
        <Table
          head={[t('widgets.h.scorecard'), t('widgets.h.average'), t('widgets.h.reviews'), t('widgets.h.passRate')]}
          rows={rows.map(([name, l]) => [
            name,
            <Versus key="a" value={averageScore(l)} target={c.target} />,
            l.length,
            `${Math.round(share(l, (r) => isPass(r, c.rates)) ?? 0)}%`,
          ])}
        />
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

function Workspaces({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const rows = c.workspaces
    .map((w) => ({ w, l: c.d.filter((r) => r.teamId !== null && w.teamIds.includes(r.teamId)) }))
    .filter((z) => z.l.length);
  return (
    <W id="wsperf">
      {rows.length ? (
        <Table
          head={[t('widgets.h.workspace'), t('widgets.h.average'), t('widgets.h.reviews')]}
          rows={[
            ...rows.map((z) => [z.w.name, <Versus key="a" value={averageScore(z.l)} target={c.target} />, z.l.length]),
            [
              <b key="t">{t('widgets.h.totals')}</b>,
              <Versus key="a" value={averageScore(c.d)} target={c.target} />,
              <b key="n">{c.d.length}</b>,
            ],
          ]}
        />
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

function Reviewers({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const now = groupBy(c.d, (r) => r.reviewerName);
  const before = groupBy(c.pv ?? [], (r) => r.reviewerName);
  const rows = [...now.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <W id="revperf">
      {rows.length ? (
        <Table
          head={[
            t('widgets.h.reviewer'),
            t('widgets.h.average'),
            t('widgets.h.change'),
            t('widgets.h.reviews'),
            t('widgets.h.disputes'),
            t('widgets.h.reviewTime'),
            t('widgets.h.withComments'),
          ]}
          rows={rows.map(([name, l]) => [
            <b key="n">{name || '—'}</b>,
            <Versus key="a" value={averageScore(l)} target={c.target} />,
            before.has(name) ? (
              <Change key="c" cur={averageScore(l)} prev={averageScore(before.get(name) ?? [])} />
            ) : (
              <small key="c" className="text-mu">
                ∅
              </small>
            ),
            l.length,
            l.filter((r) => c.disputes.has(r.id)).length,
            duration(averageReviewTime(l)),
            l.filter(hasComment).length,
          ])}
        />
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

function Agents({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const now = groupBy(c.d, (r) => r.agentId ?? r.agentName);
  const before = groupBy(c.pv ?? [], (r) => r.agentId ?? r.agentName);
  const rows = [...now.entries()].map(([id, l]) => ({ id, l, a: averageScore(l) ?? 0 })).sort((a, b) => b.a - a.a);
  return (
    <W id="agperf">
      {rows.length ? (
        <Table
          head={[
            t('widgets.h.agent'),
            t('widgets.h.average'),
            t('widgets.h.change'),
            t('widgets.h.reviews'),
            t('widgets.h.notSeen'),
            t('widgets.h.withComments'),
          ]}
          rows={rows.map((z) => [
            z.l[0]?.agentName ?? '',
            <Versus key="a" value={z.a} target={c.target} />,
            before.has(z.id) ? (
              <Change key="c" cur={z.a} prev={averageScore(before.get(z.id) ?? [])} />
            ) : (
              <small key="c" className="text-mu">
                ∅
              </small>
            ),
            z.l.length,
            z.l.filter((r) => !r.seenAt).length,
            z.l.filter(hasComment).length,
          ])}
        />
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

function CategoryPivot({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const cats = [...new Set(c.d.flatMap((r) => r.categories.map((k) => k.name)))];
  const agents = [...groupBy(c.d, (r) => r.agentId ?? r.agentName).values()].sort((a, b) =>
    (a[0]?.agentName ?? '').localeCompare(b[0]?.agentName ?? ''),
  );
  return (
    <W id="catpivot">
      {cats.length ? (
        <Table
          head={[t('widgets.h.agent'), t('widgets.h.total'), ...cats]}
          rows={[
            ...agents.map((l) => [
              l[0]?.agentName ?? '',
              <Versus key="t" value={averageScore(l)} target={c.target} />,
              ...cats.map((n) => <Versus key={n} value={categoryOf(l, n)} target={c.target} />),
            ]),
            [
              <b key="t">{t('widgets.h.totals')}</b>,
              <Versus key="a" value={averageScore(c.d)} target={c.target} />,
              ...cats.map((n) => <Versus key={n} value={categoryOf(c.d, n)} target={c.target} />),
            ],
          ]}
        />
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

function ByReview({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const list = [...c.d].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const dispute = (r: ReviewRow) => {
    const x = c.disputes.get(r.id);
    return !x ? (
      '0'
    ) : x.state !== 'resolved' ? (
      <span key="d" className="text-wn">
        {t('widgets.byreview.open')}
      </span>
    ) : (
      t('widgets.byreview.resolved')
    );
  };
  return (
    <W id="byreview">
      {list.length ? (
        <>
          <Table
            head={[
              t('widgets.h.lead'),
              t('widgets.h.reviewDate'),
              t('widgets.h.conversationDate'),
              t('widgets.h.reviewer'),
              t('widgets.h.agent'),
              t('widgets.h.score'),
              t('widgets.h.reviewTime'),
              t('widgets.h.seen'),
              t('widgets.h.dispute'),
            ]}
            rows={list
              .slice(0, 50)
              .map((r) => [
                <ReviewLink key="l" r={r} />,
                r.createdAt.slice(0, 10),
                r.reviewedOn,
                r.reviewerName,
                r.agentName,
                <ScorePill key="s" value={r.score ?? 0} rates={c.rates} teamId={r.teamId} />,
                duration(r.reviewSeconds && r.reviewSeconds > 0 ? r.reviewSeconds : null),
                r.seenAt ? t('widgets.common.yes') : t('widgets.common.no'),
                dispute(r),
              ])}
          />
          {list.length > 50 && (
            <small className="text-mu">{t('widgets.byreview.newest', { count: list.length })}</small>
          )}
        </>
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

function RootCausesByReview({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const lost = (r: ReviewRow) => r.categories.filter((k) => k.possible && k.earned < k.possible);
  const list = c.d
    .filter((r) => lost(r).length)
    .sort((a, b) => (a.reviewedOn < b.reviewedOn ? 1 : -1))
    .slice(0, 30);
  return (
    <W id="rcreview">
      {list.length ? (
        <Table
          head={[t('widgets.h.lead'), t('widgets.h.agent'), t('widgets.h.score'), t('widgets.h.lostWhy')]}
          rows={list.map((r) => [
            <ReviewLink key="l" r={r} />,
            r.agentName,
            <ScorePill key="s" value={r.score ?? 0} rates={c.rates} teamId={r.teamId} />,
            <span key="c" className="flex flex-wrap gap-1">
              {lost(r).map((k) => {
                const causes = [
                  ...new Set(k.questions.filter((q) => q.answer !== 'y' && q.rootCause).map((q) => q.rootCause)),
                ];
                const v = (k.earned / k.possible) * 100;
                return (
                  <span
                    key={k.name}
                    className={`rounded-[6px] px-2 py-0.5 text-xs ${v >= passRateOf(c.rates, r.teamId) ? 'bg-wn/15' : 'bg-bad/12'}`}
                  >
                    <b>{k.name}</b> {Math.round(v)}%{causes.length ? ` · ${causes.join(', ')}` : ''}
                  </span>
                );
              })}
            </span>,
          ])}
        />
      ) : (
        <Empty>{t('widgets.rcreview.none')}</Empty>
      )}
    </W>
  );
}

function HeatMap({ c, span }: { c: WidgetContext; span: number }) {
  const { t } = useTranslation();
  const counts = new Map<string, number>();
  for (const r of c.d) for (const k of r.categories) counts.set(k.name, (counts.get(k.name) ?? 0) + 1);
  const cats = [...counts.keys()]
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, span >= 40 ? 8 : 5);
  const rows = agentStats(c, c.d)
    .filter((a) => !c.teamFilter || a.teamId === c.teamFilter)
    .sort((a, b) => a.average - b.average);
  return (
    <W id="heat" extra={<small className="font-normal text-mu">{t('widgets.heat.axes')}</small>}>
      {!cats.length || !rows.length ? (
        <Empty>{t('widgets.heat.none')}</Empty>
      ) : (
        <>
          <div
            className="grid items-center gap-1 text-[13px]"
            style={{ gridTemplateColumns: `minmax(90px,1.4fr) repeat(${cats.length},minmax(0,1fr))` }}
          >
            <span />
            {cats.map((n) => (
              <small key={n} title={n} className="truncate text-center text-mu">
                {n}
              </small>
            ))}
            {rows.slice(0, 8).map((a) => (
              <div key={a.id} className="contents">
                <span className="truncate">{a.name}</span>
                {cats.map((n) => {
                  const z = categoryOf(
                    c.d.filter((r) => r.agentId === a.id),
                    n,
                  );
                  return z === null ? (
                    <i key={n} className="text-center not-italic text-mu">
                      —
                    </i>
                  ) : (
                    <span
                      key={n}
                      title={`${a.name} · ${n}: ${pct1(z)}`}
                      className={`rounded-[7px] px-1 py-0.5 text-center font-mono text-xs font-semibold ${BAND_SOFT[colour(z, c.target)]}`}
                    >
                      {Math.round(z)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {rows.length > 8 && <small className="text-mu">{t('widgets.heat.more', { count: rows.length - 8 })}</small>}
        </>
      )}
    </W>
  );
}

function NeedsYou({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const items: { key: string; tone: string; text: string; to: ReactNode }[] = [];
  const old = openDisputes(c).filter((r) => {
    const x = c.disputes.get(r.id);
    return x && (c.now - new Date(x.openedAt).getTime()) / DAY > 2;
  }).length;
  if (old && c.staff)
    items.push({
      key: 'disputes',
      tone: 'text-wn',
      text: t('widgets.inbox.disputes', { count: old }),
      to: <PageLink page="disputes">{t('widgets.inbox.decide')}</PageLink>,
    });
  if (!c.agentView)
    for (const a of needSupport(
      c,
      c.all.filter((r) => (!c.teamFilter || r.teamId === c.teamFilter) && ageDays(r, c.now) < 14),
    ).slice(0, 2))
      items.push({ key: `low-${a.id}`, tone: 'text-bad', text: t('widgets.inbox.low', { name: a.name }), to: null });
  const critical = c.d.filter((r) => r.score === 0 && ageDays(r, c.now) < 7).length;
  if (critical)
    items.push({
      key: 'critical',
      tone: 'text-bad',
      text: t('widgets.inbox.critical', { count: critical }),
      to: <PageLink page="reviews">{t('widgets.inbox.open')}</PageLink>,
    });
  const unseen = c.d.filter((r) => !r.seenAt).length;
  if (unseen && c.staff)
    items.push({
      key: 'unseen',
      tone: 'text-mu',
      text: t('widgets.inbox.unseen', { count: unseen }),
      to: <PageLink page="reviews">{t('widgets.inbox.remind')}</PageLink>,
    });
  return (
    <W
      id="inbox"
      extra={
        items.length ? <span className="rounded-full bg-pn2 border border-bd px-2 text-xs">{items.length}</span> : null
      }
    >
      {items.length ? (
        <ul className="grid">
          {items.map((x) => (
            <li key={x.key} className="flex items-center gap-2.5 border-t border-bd py-2 text-sm first:border-t-0">
              <span className={x.tone} aria-hidden="true">
                ●
              </span>
              <span className="flex-1">{x.text}</span>
              {x.to}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('widgets.inbox.none')}</Empty>
      )}
    </W>
  );
}

function Briefing({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  if (!c.d.length)
    return (
      <W id="brief">
        <Empty>{t('widgets.heat.none')}</Empty>
      </W>
    );
  const a = averageScore(c.d) ?? 0;
  const tr = trend(c.d);
  const parts: ReactNode[] = [t(`widgets.brief.${tr.direction}`, { value: a.toFixed(1), target: c.target })];
  // the review type that slipped most this week against last week (at least 3 reviews in each)
  const week = (k: string, from: number, to: number) => {
    const l = c.all.filter(
      (r) =>
        r.channel === k &&
        (!c.teamFilter || r.teamId === c.teamFilter) &&
        ageDays(r, c.now) >= from &&
        ageDays(r, c.now) < to,
    );
    return l.length >= 3 ? averageScore(l) : null;
  };
  const drop = (['call', 'chat', 'email', 'other'] as const)
    .map((k) => {
      const now = week(k, 0, 7);
      const before = week(k, 7, 14);
      return { k, d: now !== null && before !== null ? now - before : 0 };
    })
    .sort((x, y) => x.d - y.d)[0];
  if (drop && drop.d <= -1)
    parts.push(
      t('widgets.brief.slipped', { type: t(`reviews.channels.${drop.k}`), points: Math.abs(drop.d).toFixed(1) }),
    );
  if (!c.agentView) {
    const low = needSupport(c, c.d).length;
    if (low) parts.push(t('widgets.brief.low', { count: low }));
  }
  const open = openDisputes(c).length;
  if (open && c.staff)
    parts.push(
      <PageLink key="d" page="disputes">
        {t('widgets.brief.disputes', { count: open })}
      </PageLink>,
    );
  return (
    <section className={`${card} flex gap-3 text-[15px] leading-relaxed`} aria-label={t('widgets.brief.title')}>
      <span className="text-ac" aria-hidden="true">
        ◆
      </span>
      <p>
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 && ' '}
            {p}
          </span>
        ))}
      </p>
    </section>
  );
}

function CategoryDonut({ c, zero }: { c: WidgetContext; zero: boolean }) {
  const { t } = useTranslation();
  const rows = countBy(
    c.d,
    (k) => Boolean(k.possible) && (zero ? k.earned === 0 : (k.earned / k.possible) * 100 >= c.target),
  );
  return (
    <W id={zero ? 'cat0' : 'catover'}>
      <Donut
        rows={rows}
        empty={zero ? t('widgets.cat0.none') : t('widgets.catover.none')}
        label={t(`widgets.${zero ? 'cat0' : 'catover'}.title`)}
      />
    </W>
  );
}

function CategoryAverages({ c }: { c: WidgetContext }) {
  const { t } = useTranslation();
  const cats = categoryAverages(c.d).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <W id="catavg" extra={<small className="font-normal text-mu">{t('widgets.catavg.line')}</small>}>
      {cats.length ? (
        <CategoryDots categories={cats} target={c.target} title={t('widgets.catavg.title')} />
      ) : (
        <Empty>{t('widgets.common.noReviews')}</Empty>
      )}
    </W>
  );
}

export const WIDGETS: Record<string, WidgetSpec> = {
  brief: { width: 60, group: 'Numbers', render: (c) => <Briefing c={c} /> },
  inbox: { width: 30, group: 'Lists', render: (c) => <NeedsYou c={c} /> },
  catavg: { width: 60, group: 'Charts', render: (c) => <CategoryAverages c={c} /> },
  catover: { width: 30, group: 'Categories', render: (c) => <CategoryDonut c={c} zero={false} /> },
  cat0: { width: 30, group: 'Categories', render: (c) => <CategoryDonut c={c} zero /> },
  catins: { width: 60, group: 'Categories', render: (c) => <CategoryInsights c={c} /> },
  heat: { width: 60, group: 'Categories', render: (c, span) => <HeatMap c={c} span={span} /> },
  strong: { width: 30, group: 'Categories', render: (c) => <CategoryList c={c} strong /> },
  needs: { width: 30, group: 'Categories', render: (c) => <CategoryList c={c} strong={false} /> },
  rootc: { width: 30, group: 'Categories', render: (c) => <RootCauses c={c} /> },
  scperf: { width: 30, group: 'Categories', render: (c) => <Scorecards c={c} /> },
  revperf: { width: 60, group: 'People', render: (c) => <Reviewers c={c} /> },
  agperf: { width: 60, group: 'People', render: (c) => <Agents c={c} /> },
  wsperf: { width: 30, group: 'People', render: (c) => <Workspaces c={c} /> },
  catpivot: { width: 60, group: 'People', render: (c) => <CategoryPivot c={c} /> },
  teams: { width: 30, group: 'People', render: (c) => <Teams c={c} /> },
  channels: { width: 30, group: 'Charts', render: (c) => <Channels c={c} /> },
  distribution: { width: 30, group: 'Charts', render: (c) => <Distribution c={c} /> },
  top: { width: 30, group: 'People', render: (c) => <People c={c} top /> },
  low: { width: 30, group: 'People', render: (c) => <People c={c} top={false} /> },
  last5: { width: 30, group: 'Lists', render: (c) => <Last5 c={c} /> },
  attention: { width: 60, group: 'Lists', render: (c) => <Attention c={c} /> },
  byreview: { width: 60, group: 'Lists', render: (c) => <ByReview c={c} /> },
  rcreview: { width: 60, group: 'Lists', render: (c) => <RootCausesByReview c={c} /> },
  qflags: { width: 30, group: 'Lists', render: (c) => <QuickFlagList c={c} /> },
  targets: { width: 30, group: 'Numbers', render: (c) => <Targets c={c} /> },
};
