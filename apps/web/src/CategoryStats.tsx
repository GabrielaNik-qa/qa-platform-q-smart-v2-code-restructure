// Quality › Analytics › Category Stats (today's analytics.js `PG.cats` and `CSPM`): category performance across teams,
// the averages and trends, the most common mistakes (questions answered No) and their root causes. A click on a
// category, a mistake or a root cause opens where it comes from (teams, questions, agents, reviews). Staff see the
// reviews of their workspaces, admins all. Counted with the shared rules (packages/shared/src/stats.ts), with rolling
// periods as today (the last 7, 30 or 365 days).
import {
  average,
  averageScore,
  categoryNames,
  categoryValue,
  groupKey,
  inWindow,
  isPass,
  passRateOf,
  type Period,
  periodWindow,
  type StatFilters,
} from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiFile } from './api';
import { AgentLink, BAND_FILL, BAND_TEXT, colour, Empty, Table } from './bits';
import { Sparkline } from './charts';
import type { PassRates, ReviewRow } from './QAEntry';
import { card, type CompanyRef, field, Notice, smallButton, type TeamRow, useAction } from './ui';

const CHANNELS = ['call', 'chat', 'email', 'other'] as const;
const PERIODS: Period[] = ['week', 'month', 'year', 'all'];
const DAY = 864e5;
const pct1 = (v: number) => `${v.toFixed(1)}%`;

/** What was clicked: a category, a question of a category, or a root cause. */
type Pick = { kind: 'cat'; cat: string } | { kind: 'item'; cat: string; item: string } | { kind: 'rc'; rc: string };

/** Every answered question of the reviews, with its review and category. */
function answers(list: ReviewRow[]) {
  return list.flatMap((r) =>
    r.categories.flatMap((c) =>
      c.questions
        .filter((q) => q.answer !== 'na')
        .map((q) => ({ r, cat: c.name, item: q.text, no: q.answer === 'n', rc: q.rootCause })),
    ),
  );
}
const countBy = <T,>(list: T[], key: (x: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const x of list) {
    const k = key(x);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function CategoryStats({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, run, fail } = useAction();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [scorecards, setScorecards] = useState<{ id: string; name: string }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [scorecard, setScorecard] = useState('');
  const [channel, setChannel] = useState('');
  const [team, setTeam] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [picked, setPicked] = useState<Pick | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<{ id: string; name: string }[]>('/scorecards', company.id).catch(() => []),
    ]).then(([r, pr, tm, sc]) => {
      setNow(Date.now());
      setReviews(r);
      setRates(pr);
      setTeams(tm.filter((x) => !x.isAdministration));
      setScorecards(sc);
    }, fail);
  }, [company.id, fail]);

  const all = reviews ?? [];
  const target = passRateOf(rates, null);
  const tone = (v: number) => colour(v, target);
  const filters: StatFilters = {
    teamId: team || undefined,
    channel: channel || undefined,
    scorecardId: scorecard || undefined,
  };
  const win = periodWindow(period, now) ?? [-Infinity, Infinity];
  const before = periodWindow(period, now, undefined, true);
  const ev = inWindow(all, win, filters);
  const pv = before ? inWindow(all, before, filters) : [];
  const names = categoryNames(ev);
  const valuesOf = (list: ReviewRow[], name: string) =>
    list.map((r) => categoryValue(r, name)).filter((v): v is number => v !== null);
  // the last 8 weeks of each category, oldest first (today: the chosen team and type, every scorecard)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const k = 7 - i;
    return inWindow(all, [now - (k + 1) * 7 * DAY, now - k * 7 * DAY], {
      teamId: filters.teamId,
      channel: filters.channel,
    });
  });
  const cats = names.map((name) => {
    const v = valuesOf(ev, name);
    const p = valuesOf(pv, name);
    const a = average(v) ?? 0;
    return {
      name,
      a,
      low: v.length ? Math.round((v.filter((x) => x < target).length / v.length) * 100) : 0,
      trend: p.length ? a - (average(p) ?? 0) : null,
      weeks: weeks.map((w) => average(valuesOf(w, name))),
    };
  });
  const sorted = [...cats].sort((x, y) => y.a - x.a);
  const given = answers(ev);
  const totals = countBy(given, (x) => `${x.cat}\u0001${x.item}`);
  const mistakes = countBy(
    given.filter((x) => x.no),
    (x) => `${x.cat}\u0001${x.item}`,
  )
    .slice(0, 10)
    .map(([key, n]) => {
      const [cat = '', item = ''] = key.split('\u0001');
      const of = totals.find(([k]) => k === key)?.[1] ?? 1;
      const causes = countBy(
        given.filter((x) => x.no && x.cat === cat && x.item === item),
        (x) => x.rc,
      ).slice(0, 2);
      return { cat, item, n, share: (n / of) * 100, causes };
    });
  const causes = countBy(
    given.filter((x) => x.no),
    (x) => x.rc,
  );
  const passed = ev.filter((r) => isPass(r, rates)).length;
  const avg = averageScore(ev);

  async function exportExcel() {
    setExporting(true);
    await run(async () => {
      const file = await apiFile('/reviews/export', company.id, { ids: ev.map((r) => r.id), name: 'Category Stats' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `Category_Stats_${new Date().toLocaleDateString('sv-SE')}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('list.export'));
    setExporting(false);
  }

  const kpi = (title: string, value: ReactNode, sub: string, look = '') => (
    <div className={`${card} !p-4 grid content-start gap-1`}>
      <span className="text-sm">{title}</span>
      <b className={`font-display text-3xl ${look}`}>{value}</b>
      <small className="text-xs text-mu">{sub}</small>
    </div>
  );
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`;
  const clickRow = 'flex w-full items-start justify-between gap-3 rounded-s px-2 py-1.5 text-left text-sm hover:bg-pn2';
  const rank = (list: typeof cats, look: string) =>
    list.length ? (
      list.map((x, i) => (
        <button key={x.name} type="button" className={clickRow} onClick={() => setPicked({ kind: 'cat', cat: x.name })}>
          <span>
            {i + 1}. {x.name}
          </span>
          <b className={`font-mono ${look}`}>{pct1(x.a)}</b>
        </button>
      ))
    ) : (
      <Empty>{t('cats.noData')}</Empty>
    );
  const trendPill = (v: number | null) =>
    v === null ? (
      <small className="text-mu">-</small>
    ) : (
      <span className={`rounded-full px-2 text-xs font-semibold ${v >= 0 ? 'bg-ok/12 text-ok' : 'bg-bad/12 text-bad'}`}>
        {v >= 0 ? '↗' : '↘'} {Math.abs(v).toFixed(1)}
      </span>
    );

  return (
    <section className="grid gap-4" aria-labelledby="cats-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="cats-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.cats')}
          </h1>
          <p className="text-sm text-mu">{t('cats.intro')}</p>
        </div>
        <button
          type="button"
          className={smallButton}
          disabled={exporting || !ev.length}
          onClick={() => void exportExcel()}
        >
          {exporting ? t('list.exporting') : t('list.export')}
        </button>
      </div>
      <Notice message={message} />
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="grid gap-1 text-sm font-medium">
          {t('cats.scorecard')}
          <select className={field} value={scorecard} onChange={(e) => setScorecard(e.target.value)}>
            <option value="">{t('cats.allScorecards')}</option>
            {scorecards.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('team.type')}
          <select className={field} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">{t('team.allTypes')}</option>
            {CHANNELS.map((k) => (
              <option key={k} value={k}>
                {t(`reviews.channels.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('team.team')}
          <select className={field} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{t('team.allTeams')}</option>
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-1 text-sm font-medium">
          {t('team.period')}
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('team.period')}>
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                className={chip(period === p)}
                onClick={() => setPeriod(p)}
              >
                {t(`dash.periods.${p}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!reviews ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi(
              channel ? t(`cats.evaluated.${channel}`) : t('cats.evaluated.all'),
              ev.length,
              t('cats.categoryCount', { count: names.length }),
            )}
            {kpi(
              t('team.kpi.average'),
              avg === null ? '-' : pct1(avg),
              t('team.kpi.target', { value: target }),
              avg === null ? '' : BAND_TEXT[tone(avg)],
            )}
            {kpi(
              t('team.kpi.pass'),
              ev.length ? pct1((passed / ev.length) * 100) : '-',
              t('team.kpi.passed', { count: passed }),
              'text-ok',
            )}
            {kpi(
              t('cats.fail'),
              ev.length ? pct1(100 - (passed / ev.length) * 100) : '-',
              t('cats.failed', { count: ev.length - passed }),
              'text-bad',
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`${card} grid content-start gap-2`}>
              <h2 className="font-semibold">▲ {t('cats.strongest')}</h2>
              {rank(sorted.slice(0, 3), 'text-ok')}
            </div>
            <div className={`${card} grid content-start gap-2`}>
              <h2 className="font-semibold">▼ {t('cats.weakest')}</h2>
              {rank([...sorted].reverse().slice(0, 3), 'text-bad')}
            </div>
          </div>
          <div className={`${card} grid gap-3`}>
            <h2 className="font-semibold">
              {t('cats.categories')} <small className="font-normal text-mu">{t('cats.clickOne')}</small>
            </h2>
            {cats.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cats.map((x) => (
                  <button
                    key={x.name}
                    type="button"
                    className="grid gap-1.5 rounded-m border border-bd p-3 text-left hover:border-brand"
                    onClick={() => setPicked({ kind: 'cat', cat: x.name })}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{x.name}</span>
                      <b className={`font-mono ${BAND_TEXT[tone(x.a)]}`}>{pct1(x.a)}</b>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {trendPill(x.trend)}
                      <small className="text-xs text-mu">{t('cats.below', { share: x.low, target })}</small>
                    </span>
                    <Sparkline values={x.weeks} width={150} height={26} />
                    <span className="h-1.5 overflow-hidden rounded-full bg-sunk">
                      <span
                        className={`block h-full rounded-full ${BAND_FILL[tone(x.a)]}`}
                        style={{ width: `${Math.min(100, x.a)}%` }}
                      />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty>{t('cats.noData')}</Empty>
            )}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className={`${card} grid gap-1`}>
              <h2 className="mb-1 font-semibold">{t('cats.mistakes')}</h2>
              {mistakes.length ? (
                mistakes.map((x, i) => (
                  <button
                    key={`${x.cat}${x.item}`}
                    type="button"
                    className={clickRow}
                    onClick={() => setPicked({ kind: 'item', cat: x.cat, item: x.item })}
                  >
                    <span>
                      {i + 1}. {x.item}
                      <br />
                      <small className="text-mu">
                        {x.cat}
                        {x.causes.length ? ` · ${x.causes.map(([k, v]) => `${k} ×${v}`).join(', ')}` : ''}
                      </small>
                    </span>
                    <span className="text-right">
                      <b className="font-mono">{x.n}×</b>
                      <br />
                      <small className="whitespace-nowrap text-mu">
                        {t('cats.ofAnswers', { share: x.share.toFixed(0) })}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <Empty>{t('cats.noMistakes')}</Empty>
              )}
            </div>
            <div className={`${card} grid gap-2`}>
              <h2 className="font-semibold">{t('cats.rootCauses')}</h2>
              {causes.length ? (
                causes.map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className="grid gap-1 rounded-s px-2 py-1 text-left text-sm hover:bg-pn2"
                    onClick={() => setPicked({ kind: 'rc', rc: k })}
                  >
                    <span className="flex justify-between gap-2">
                      <span>{k}</span>
                      <b className="font-mono">{v}</b>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-sunk">
                      <span
                        className="block h-full rounded-full bg-wn"
                        style={{ width: `${(v / (causes[0]?.[1] ?? 1)) * 100}%` }}
                      />
                    </span>
                  </button>
                ))
              ) : (
                <Empty>{t('cats.noRootCauses')}</Empty>
              )}
            </div>
          </div>
          <RootCauseWho list={ev} />
          <div className={`${card} grid gap-2`}>
            <h2 className="font-semibold">{t('cats.byTeam')}</h2>
            {names.length ? (
              <Table
                head={[t('cats.category'), ...teams.map((x) => x.name)]}
                rows={names.map((name) => [
                  <button
                    key="c"
                    type="button"
                    className="text-left font-semibold text-ac hover:underline"
                    onClick={() => setPicked({ kind: 'cat', cat: name })}
                  >
                    {name}
                  </button>,
                  ...teams.map((x) => {
                    const v = average(
                      valuesOf(
                        ev.filter((r) => r.teamId === x.id),
                        name,
                      ),
                    );
                    return v === null ? (
                      '-'
                    ) : (
                      <span
                        key={x.id}
                        className={`rounded-[6px] px-2 py-0.5 font-mono ${tone(v) === 'ok' ? 'bg-ok/12' : tone(v) === 'wn' ? 'bg-wn/15' : 'bg-bad/12'}`}
                      >
                        {v.toFixed(0)}%
                      </span>
                    );
                  }),
                ])}
              />
            ) : (
              <Empty>{t('cats.noData')}</Empty>
            )}
          </div>
        </>
      )}
      {picked && (
        <Detail
          pick={picked}
          list={ev}
          teams={teams}
          target={target}
          onPick={setPicked}
          onClose={() => setPicked(null)}
        />
      )}
    </section>
  );
}

/** Today's `catRootCauses`: the root causes chosen per week, and who chose them for whom (the 6 most chosen). */
function RootCauseWho({ list }: { list: ReviewRow[] }) {
  const { t } = useTranslation();
  const hits = answers(list).filter((x) => x.no && x.rc);
  if (!hits.length) return null;
  const top = countBy(hits, (x) => x.rc)
    .slice(0, 6)
    .map(([k]) => k);
  const perWeek = countBy(hits, (x) => groupKey(new Date(`${x.r.reviewedOn}T12:00:00`).getTime(), 'week'))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-12);
  const most = Math.max(1, ...perWeek.map(([, n]) => n));
  const matrix = (by: (x: (typeof hits)[number]) => string, name: string, link: boolean) => {
    const rows = countBy(hits, by).slice(0, 12);
    return (
      <Table
        head={[name, ...top, t('cats.total')]}
        rows={rows.map(([who, n]) => {
          const mine = hits.filter((x) => by(x) === who);
          const first = mine[0]?.r;
          return [
            link && first ? <AgentLink key="w" id={first.agentId} name={first.agentName} /> : who,
            ...top.map((k) => mine.filter((x) => x.rc === k).length || '-'),
            <b key="n">{n}</b>,
          ];
        })}
      />
    );
  };
  return (
    <div className={`${card} grid gap-3`}>
      <h2 className="font-semibold">
        {t('cats.rootCauses')} <small className="font-normal text-mu">{t('cats.chosen', { count: hits.length })}</small>
      </h2>
      <div className="flex h-28 items-end gap-1.5" role="img" aria-label={t('cats.perWeek')}>
        {perWeek.map(([week, n]) => (
          <div key={week} className="flex flex-1 flex-col items-center gap-1" title={`${week}: ${n}`}>
            <i className="block w-full max-w-8 rounded-t-[4px] bg-wn" style={{ height: `${(n / most) * 80}px` }} />
            <small className="text-[11px] text-mu">
              {week.slice(8, 10)}/{week.slice(5, 7)}
            </small>
          </div>
        ))}
      </div>
      <small className="text-mu">{t('cats.perWeek')}</small>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="grid content-start gap-1">
          <h3 className="text-sm font-semibold">{t('cats.byReviewer')}</h3>
          {matrix((x) => x.r.reviewerName || '-', t('cats.reviewer'), false)}
        </div>
        <div className="grid content-start gap-1">
          <h3 className="text-sm font-semibold">{t('cats.byAgent')}</h3>
          {matrix((x) => x.r.agentId ?? x.r.agentName, t('cats.agent'), true)}
        </div>
      </div>
    </div>
  );
}

/** Today's pop-up (`CSPM`): where a category, a mistake or a root cause comes from. */
function Detail({
  pick,
  list,
  teams,
  target,
  onPick,
  onClose,
}: {
  pick: Pick;
  list: ReviewRow[];
  teams: TeamRow[];
  target: number;
  onPick: (p: Pick) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const tone = (v: number) => colour(v, target);
  const cap = 'text-xs font-semibold uppercase tracking-wide text-mu';
  const hbar = (
    label: ReactNode,
    value: number,
    max: number,
    fill: string,
    shown: string,
    key: string,
    click?: () => void,
  ) => {
    const inner = (
      <>
        <span className="flex justify-between gap-2 text-sm">
          <span>{label}</span>
          <b className="font-mono">{shown}</b>
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-sunk">
          <span
            className={`block h-full rounded-full ${fill}`}
            style={{ width: `${max ? (value / max) * 100 : 0}%` }}
          />
        </span>
      </>
    );
    return click ? (
      <button key={key} type="button" className="grid gap-1 rounded-s py-1 text-left hover:bg-pn2" onClick={click}>
        {inner}
      </button>
    ) : (
      <div key={key} className="grid gap-1 py-1">
        {inner}
      </div>
    );
  };
  const reviewList = (rows: { r: ReviewRow; v: number | null }[]) =>
    rows.length ? (
      <ul className="grid">
        {rows.map(({ r, v }) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 border-t border-bd py-1.5 text-sm first:border-t-0"
          >
            <span>
              <Link to="/review/$id" params={{ id: r.id }} className="font-mono font-semibold text-ac hover:underline">
                {r.leadId}
              </Link>{' '}
              <small className="text-mu">
                {r.agentName} · {r.reviewedOn}
              </small>
            </span>
            {v !== null && <b className={`font-mono ${BAND_TEXT[tone(v)]}`}>{v.toFixed(0)}%</b>}
          </li>
        ))}
      </ul>
    ) : (
      <Empty>{t('cats.noReviews')}</Empty>
    );
  const numbers = (items: [string, string, string, string?][]) => (
    <div className="grid grid-cols-3 gap-2">
      {items.map(([title, value, sub, look]) => (
        <div key={title} className="rounded-s bg-pn2 p-3">
          <small className="block text-xs text-mu">{title}</small>
          <b className={`font-display text-2xl ${look ?? ''}`}>{value}</b>
          <small className="block text-xs text-mu">{sub}</small>
        </div>
      ))}
    </div>
  );
  const given = answers(list);
  let title: string;
  let sub: string;
  let body: ReactNode;

  if (pick.kind === 'cat') {
    const vals = list
      .map((r) => ({ r, v: categoryValue(r, pick.cat) }))
      .filter((x): x is { r: ReviewRow; v: number } => x.v !== null);
    const av = average(vals.map((x) => x.v));
    const below = vals.filter((x) => x.v < target).length;
    const byTeam = teams
      .map((z) => {
        const l = vals.filter((x) => x.r.teamId === z.id);
        return { z, n: l.length, v: average(l.map((x) => x.v)) ?? 0 };
      })
      .filter((x) => x.n);
    const agents = countBy(vals, (x) => x.r.agentId ?? x.r.agentName)
      .map(([id]) => {
        const l = vals.filter((x) => (x.r.agentId ?? x.r.agentName) === id);
        return {
          id: l[0]?.r.agentId ?? null,
          name: l[0]?.r.agentName ?? '',
          n: l.length,
          v: average(l.map((x) => x.v)) ?? 0,
        };
      })
      .sort((a, b) => b.v - a.v);
    const items = countBy(
      given.filter((x) => x.cat === pick.cat),
      (x) => x.item,
    )
      .map(([item, n]) => ({ item, n, no: given.filter((x) => x.cat === pick.cat && x.item === item && x.no).length }))
      .sort((a, b) => b.no / b.n - a.no / a.n);
    const agentRow = (x: (typeof agents)[number]) => (
      <div key={x.name} className="flex justify-between gap-2 text-sm">
        <span>
          <AgentLink id={x.id} name={x.name} /> <small className="text-mu">{x.n}</small>
        </span>
        <b className={`font-mono ${BAND_TEXT[tone(x.v)]}`}>{pct1(x.v)}</b>
      </div>
    );
    title = pick.cat;
    sub = t('cats.ratings', { count: vals.length });
    body = (
      <>
        {numbers([
          [
            t('cats.average'),
            av === null ? '-' : pct1(av),
            t('team.kpi.target', { value: target }),
            av === null ? '' : BAND_TEXT[tone(av)],
          ],
          [t('cats.lowest'), vals.length ? `${Math.min(...vals.map((x) => x.v)).toFixed(0)}%` : '-', ''],
          [
            t('cats.belowTarget'),
            vals.length ? `${Math.round((below / vals.length) * 100)}%` : '-',
            t('cats.reviewsCount', { count: below }),
            'text-wn',
          ],
        ])}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.byTeamShort')}</p>
            {byTeam.length ? (
              byTeam.map((x) =>
                hbar(
                  <>
                    <span style={{ color: x.z.color }}>●</span> {x.z.name} <small className="text-mu">{x.n}</small>
                  </>,
                  x.v,
                  100,
                  BAND_FILL[tone(x.v)],
                  pct1(x.v),
                  x.z.id,
                ),
              )
            ) : (
              <Empty>{t('cats.noData')}</Empty>
            )}
          </div>
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.itemsNo')}</p>
            {items.length ? (
              items.map((x) =>
                hbar(x.item, x.no, x.n, x.no ? 'bg-bad' : 'bg-ok', `${x.no}/${x.n}`, x.item, () =>
                  onPick({ kind: 'item', cat: pick.cat, item: x.item }),
                ),
              )
            ) : (
              <Empty>{t('cats.noItems')}</Empty>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.bestAgents')}</p>
            {agents.slice(0, 5).map(agentRow)}
          </div>
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.needsSupport')}</p>
            {agents
              .filter((x) => x.v < target)
              .slice(-5)
              .reverse()
              .map(agentRow)}
            {!agents.some((x) => x.v < target) && <small className="text-ok">✓ {t('team.allReach')}</small>}
          </div>
        </div>
        <div className="grid gap-1">
          <p className={cap}>{t('cats.lowestReviews')}</p>
          {reviewList([...vals].sort((a, b) => a.v - b.v).slice(0, 5))}
        </div>
      </>
    );
  } else if (pick.kind === 'item') {
    const rows = given.filter((x) => x.cat === pick.cat && x.item === pick.item);
    const no = rows.filter((x) => x.no);
    const who = countBy(no, (x) => x.r.agentId ?? x.r.agentName);
    const why = countBy(no, (x) => x.rc);
    title = pick.item;
    sub = pick.cat;
    body = (
      <>
        {numbers([
          [t('cats.answeredNo'), String(no.length), t('cats.ofAnswersCount', { count: rows.length }), 'text-bad'],
          [t('cats.share'), rows.length ? `${Math.round((no.length / rows.length) * 100)}%` : '-', ''],
          [t('cats.agents'), String(who.length), t('cats.withANo')],
        ])}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.whoMisses')}</p>
            {who.length ? (
              who.slice(0, 8).map(([id, n]) => {
                const r = no.find((x) => (x.r.agentId ?? x.r.agentName) === id)?.r;
                return hbar(
                  <AgentLink id={r?.agentId ?? null} name={r?.agentName ?? ''} />,
                  n,
                  who[0]?.[1] ?? 1,
                  'bg-bad',
                  `${n}×`,
                  id,
                );
              })
            ) : (
              <Empty>{t('cats.nobody')}</Empty>
            )}
          </div>
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.rootCauses')}</p>
            {why.length ? (
              why.map(([k, n]) => hbar(k, n, no.length, 'bg-wn', `${n}×`, k, () => onPick({ kind: 'rc', rc: k })))
            ) : (
              <Empty>{t('cats.noCauseForItem')}</Empty>
            )}
          </div>
        </div>
        <div className="grid gap-1">
          <p className={cap}>{t('cats.latestNo')}</p>
          {reviewList(
            [...no]
              .sort((a, b) => (a.r.reviewedOn < b.r.reviewedOn ? 1 : -1))
              .slice(0, 6)
              .map((x) => ({ r: x.r, v: categoryValue(x.r, pick.cat) })),
          )}
        </div>
      </>
    );
  } else {
    const hits = given.filter((x) => x.no && x.rc === pick.rc);
    const items = countBy(hits, (x) => `${x.cat}\u0001${x.item}`);
    const who = countBy(hits, (x) => x.r.agentId ?? x.r.agentName);
    title = pick.rc;
    sub = t('cats.causeChosen', { count: hits.length });
    body = (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.forItems')}</p>
            {items.slice(0, 8).map(([key, n]) => {
              const [cat = '', item = ''] = key.split('\u0001');
              return hbar(
                <>
                  {item} <small className="text-mu">{cat}</small>
                </>,
                n,
                items[0]?.[1] ?? 1,
                'bg-wn',
                `${n}×`,
                key,
                () => onPick({ kind: 'item', cat, item }),
              );
            })}
          </div>
          <div className="grid content-start gap-1">
            <p className={cap}>{t('cats.agents')}</p>
            {who.slice(0, 8).map(([id, n]) => {
              const r = hits.find((x) => (x.r.agentId ?? x.r.agentName) === id)?.r;
              return hbar(
                <AgentLink id={r?.agentId ?? null} name={r?.agentName ?? ''} />,
                n,
                who[0]?.[1] ?? 1,
                'bg-wn',
                `${n}×`,
                id,
              );
            })}
          </div>
        </div>
        <div className="grid gap-1">
          <p className={cap}>{t('cats.latest')}</p>
          {reviewList(
            [...hits]
              .sort((a, b) => (a.r.reviewedOn < b.r.reviewedOn ? 1 : -1))
              .filter((x, i, l) => l.findIndex((y) => y.r.id === x.r.id) === i)
              .slice(0, 6)
              .map((x) => ({ r: x.r, v: null })),
          )}
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cats-detail-title"
        className="grid max-h-[90vh] w-full max-w-[780px] gap-4 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="cats-detail-title" className="font-display text-xl font-bold">
              {title}
            </h2>
            <small className="text-mu">{sub}</small>
          </div>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('cats.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
