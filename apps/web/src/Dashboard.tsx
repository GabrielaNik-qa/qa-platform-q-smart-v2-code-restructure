// Quality › Home › Dashboard, as today (current-app: widgets.js, dashboards.js): the welcome line, the filters in one row
// above everything ("Date is …", then "+ Filter" for type, team, agent, reviewer and scorecard), and the widgets, laid
// out as today (number tiles share their own rows, at most five; the other cards fill their rows).
// Phase 3, step 1 brings the number tiles and the two charts over time; the other quality widgets and Personalize come
// in step 2, and the widgets of tasks, coaching, workforce and AI with their own phases. Each role starts with today's
// dashboard for it; a widget that isn't built yet is simply left out, as today.
import {
  averageReviewTime,
  averageScore,
  can,
  categoryAverages,
  change,
  type DateBase,
  type Grouping,
  groups,
  hasComment,
  inWindow,
  isPass,
  lastTenWeeks,
  passRateOf,
  type Period,
  periodWindow,
  ROLE_LABELS,
  share,
  type StatFilters,
  trend,
  type Window,
} from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { CategoriesOverTime, ScoresOverTime, Sparkline } from './charts';
import type { Dispute } from './Disputes';
import { currentLanguage } from './i18n';
import type { PassRates, ReviewRow } from './QAEntry';
import type { QuickFlag } from './QuickFlags';
import { useSession } from './session';
import { card, type CompanyRef, field, type PersonRow, primaryButton, smallButton, type TeamRow } from './ui';

/** Today's widgets of this step, in today's order on the page. */
const TILES = [
  'kpi_avg',
  'kpi_total',
  'kpi_conv',
  'kpi_rtime',
  'kpi_agents',
  'kpi_disputed',
  'kpi_comments',
  'kpi_unseen',
  'kpi_pass',
  'kpi_fail',
  'kpi_trend',
  'kpi_flags',
  'kpi_disputes',
] as const;
const CHARTS = ['qtime', 'cattime'] as const;
type WidgetId = (typeof TILES)[number] | (typeof CHARTS)[number];
const ORDER: WidgetId[] = [...TILES, ...CHARTS];
/** today's width of each widget, of 60 columns */
const WIDTH: Record<WidgetId, number> = {
  ...Object.fromEntries(TILES.map((k) => [k, 15])),
  qtime: 60,
  cattime: 60,
} as Record<WidgetId, number>;
/**
 * Today's ready-made dashboard of each role (dashboards.js): Overall for admins, reviewers and team leads, Trainer for
 * trainers, "my progress" for agents. Only the widgets built so far show.
 */
const DEFAULTS: Record<string, string[]> = {
  admin: ['brief', 'kpi_avg', 'kpi_pass', 'plan_kpi', 'kpi_disputes', 'inbox', 'heat', 'qtime'],
  reviewer: ['brief', 'kpi_avg', 'kpi_pass', 'plan_kpi', 'kpi_disputes', 'inbox', 'heat', 'qtime'],
  lead: ['brief', 'kpi_avg', 'kpi_pass', 'plan_kpi', 'kpi_disputes', 'inbox', 'heat', 'qtime'],
  trainer: ['brief', 'ai_train', 'needs', 'cat0', 'heat', 'learn_prog', 'strong', 'cattime'],
  agent: ['att_me', 'cap_me', 'kpi_avg', 'kpi_pass', 'kpi_trend', 'coach_new', 'todo', 'strong', 'needs', 'last5'],
};
const isWidget = (id: string): id is WidgetId => (ORDER as string[]).includes(id);

/**
 * Today's layout: a run of number tiles takes the fewest rows of at most five, as even as possible; other cards fill
 * their row (each grows in proportion, so no row has an empty end). Returns each widget's width of 60 columns.
 */
export function pack(ids: WidgetId[]): { id: WidgetId; span: number }[] {
  const out: { id: WidgetId; span: number }[] = [];
  const fill = (row: { id: WidgetId; w: number }[]) => {
    const total = row.reduce((a, x) => a + x.w, 0);
    let used = 0;
    row.forEach((x, i) => {
      const span = i === row.length - 1 ? 60 - used : Math.round((x.w * 60) / total);
      used += span;
      out.push({ id: x.id, span });
    });
  };
  const tile = (id: WidgetId) => WIDTH[id] <= 15;
  for (let i = 0; i < ids.length;) {
    const id = ids[i] as WidgetId;
    if (tile(id)) {
      let j = i;
      while (j < ids.length && tile(ids[j] as WidgetId)) j++;
      const run = ids.slice(i, j);
      const rows = Math.ceil(run.length / 5);
      let a = 0;
      for (let k = 0; k < rows; k++) {
        const n = Math.ceil((run.length - a) / (rows - k));
        fill(run.slice(a, a + n).map((x) => ({ id: x, w: 1 })));
        a += n;
      }
      i = j;
      continue;
    }
    const row: { id: WidgetId; w: number }[] = [];
    let w = 0;
    while (i < ids.length && !tile(ids[i] as WidgetId) && w + WIDTH[ids[i] as WidgetId] <= 60) {
      const next = ids[i] as WidgetId;
      row.push({ id: next, w: WIDTH[next] });
      w += WIDTH[next];
      i++;
    }
    fill(row);
  }
  return out;
}

type FilterKey = 'type' | 'team' | 'agent' | 'reviewer' | 'scorecard';
interface Filters {
  period: Period;
  from: string;
  to: string;
  type: string;
  team: string;
  agent: string;
  reviewer: string;
  scorecard: string;
}
const NO_FILTERS: Filters = {
  period: 'all',
  from: '',
  to: '',
  type: '',
  team: '',
  agent: '',
  reviewer: '',
  scorecard: '',
};
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE');

export function Dashboard({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { me } = useSession();
  const agentView = company.role === 'agent';
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  /** the moment the numbers are counted at: when the data arrived */
  const [now, setNow] = useState(() => Date.now());
  const [rates, setRates] = useState<PassRates | null>(null);
  const [flags, setFlags] = useState<QuickFlag[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [scorecards, setScorecards] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, from: daysAgo(30), to: daysAgo(0) });
  const [added, setAdded] = useState<FilterKey[]>([]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  // how the charts group dates, and which date counts: today's defaults (Personalize changes them, step 2)
  const grouping = 'week' as Grouping;
  const base = 'conversation' as DateBase;

  useEffect(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      api<QuickFlag[]>('/flags', company.id).catch(() => []),
      api<Dispute[]>('/disputes', company.id).catch(() => []),
      agentView ? Promise.resolve([]) : api<TeamRow[]>('/teams', company.id),
      agentView ? Promise.resolve([]) : api<PersonRow[]>('/people', company.id),
      api<{ id: string; name: string }[]>('/scorecards', company.id).catch(() => []),
    ]).then(
      ([r, pr, f, d, tm, ppl, sc]) => {
        setNow(Date.now());
        setReviews(r);
        setRates(pr);
        setFlags(f);
        setDisputes(d);
        setTeams(tm.filter((x) => !x.isAdministration));
        setPeople(ppl);
        setScorecards(sc);
      },
      () => setReviews([]),
    );
  }, [company.id, agentView]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const statFilters: StatFilters = {
    teamId: filters.team || undefined,
    channel: filters.type || undefined,
    reviewerName: filters.reviewer || undefined,
    scorecardId: filters.scorecard || undefined,
    agentId: filters.agent || undefined,
  };
  const custom = { from: filters.from, to: filters.to };
  const window = periodWindow(filters.period, now, custom) as Window;
  const before = periodWindow(filters.period, now, custom, true);
  const all = reviews ?? [];
  const ctx = {
    d: inWindow(all, window, statFilters, base),
    pv: before ? inWindow(all, before, statFilters, base) : null,
    target: passRateOf(rates, filters.team || null),
  };
  const disputed = useMemo(() => new Map(disputes.map((x) => [x.reviewId, x])), [disputes]);

  const ids = useMemo(() => {
    const wanted = (DEFAULTS[company.role] ?? DEFAULTS['admin'] ?? []).filter(isWidget);
    return wanted.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }, [company.role]);

  // ---- the filters
  const options: Record<FilterKey, [string, string][]> = {
    type: (['call', 'chat', 'email', 'other'] as const).map((c) => [c, t(`reviews.channels.${c}`)]),
    team: teams.map((x) => [x.id, x.name]),
    agent: people
      .filter((p) => p.role === 'agent' && (!filters.team || p.teamId === filters.team))
      .map((p) => [p.membershipId, p.name]),
    reviewer: people
      .filter((p) => p.active && (p.role === 'admin' || p.role === 'reviewer'))
      .map((p) => [p.name, p.name]),
    scorecard: scorecards.map((s) => [s.id, s.name]),
  };
  const keys: FilterKey[] = agentView ? ['type', 'scorecard'] : ['type', 'team', 'agent', 'reviewer', 'scorecard'];
  const shown = keys.filter((k) => filters[k] || added.includes(k));
  const addable = keys.filter((k) => !shown.includes(k));
  const anySet = shown.length > 0 || filters.period !== 'all';
  const set = (k: FilterKey, v: string) => setFilters({ ...filters, [k]: v, ...(k === 'team' ? { agent: '' } : {}) });
  const chip = 'inline-flex items-center gap-1 rounded-s pl-3 pr-1 text-sm';
  const chipLook = (on: boolean) => (on ? 'bg-ac/15 text-tx' : 'bg-bd/55 text-mu');
  const chipSelect = 'bg-transparent py-1.5 px-1 font-semibold text-tx cursor-pointer max-w-56 [field-sizing:content]';

  // ---- the widgets
  const goReviews = { to: '/$app/$page', params: { app: 'quality', page: 'reviews' } } as const;
  const changeOf = (fn: (l: ReviewRow[]) => number | null, good: 1 | -1): ReactNode => {
    const r = ctx.pv ? change(fn(ctx.d), fn(ctx.pv)) : null;
    if (r === null)
      return (
        <small className="text-xs text-mu" title={t('dash.noCompare')}>
          ∅
        </small>
      );
    if (r === 0) return <small className="text-xs text-mu">▲ 0%</small>;
    return (
      <small className={`text-xs ${r > 0 === good > 0 ? 'text-ok' : 'text-bad'}`}>
        {r > 0 ? '▲' : '▼'} {Math.abs(r)}%
      </small>
    );
  };
  const percent = (v: number | null) =>
    v === null ? (
      '—'
    ) : (
      <>
        {v.toFixed(1)}
        <small className="ml-0.5 text-sm opacity-70">%</small>
      </>
    );
  const duration = (s: number | null) =>
    s === null ? '—' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
  const avgOf = (l: ReviewRow[]) => averageScore(l);
  const passOf = (l: ReviewRow[]) => share(l, (r) => isPass(r, rates));
  const n = ctx.d.length;
  const average = avgOf(ctx.d);
  const pass = passOf(ctx.d) ?? 0;
  const flagWindow = (f: QuickFlag) => {
    const at = new Date(`${f.flaggedOn}T12:00:00`).getTime();
    return at >= window[0] && at < window[1] && (!filters.team || f.teamId === filters.team);
  };

  const tile = (
    id: WidgetId,
    value: ReactNode,
    below: ReactNode,
    link?: { to: string; params?: Record<string, string> },
    band: '' | 'ok' | 'bad' | 'wn' = '',
  ) => {
    const look = `${card} !p-3.5 flex h-full min-h-32 flex-col items-center justify-between gap-1.5 text-center`;
    const body = (
      <>
        <small className="text-[12.5px] text-mu">{t(`dash.tiles.${id}.title`)}</small>
        <div
          className={`self-stretch rounded-s px-2.5 py-1 font-display text-[30px] font-semibold leading-tight ${
            band === 'ok' ? 'bg-ok/12' : band === 'bad' ? 'bg-bad/12' : band === 'wn' ? 'text-wn' : ''
          }`}
        >
          {value}
        </div>
        {below}
      </>
    );
    return link ? (
      <Link
        to={link.to as '/$app/$page'}
        params={link.params as { app: string; page: string }}
        title={t(`dash.tiles.${id}.help`)}
        className={`${look} hover:border-tx`}
      >
        {body}
      </Link>
    ) : (
      <div title={t(`dash.tiles.${id}.help`)} className={look}>
        {body}
      </div>
    );
  };
  const page = (p: string) => ({ to: '/$app/$page', params: { app: 'quality', page: p } });
  const groupLabel = (key: string) =>
    grouping === 'month'
      ? new Date(`${key}-01T12:00:00`).toLocaleString(lang, { month: 'short', year: '2-digit' })
      : grouping === 'quarter'
        ? key
        : `${key.slice(8, 10)}/${key.slice(5, 7)}`;

  const widget = (id: WidgetId): ReactNode => {
    switch (id) {
      case 'kpi_avg':
        return tile(
          id,
          n ? percent(average) : '—',
          changeOf(avgOf, 1),
          goReviews,
          n ? ((average ?? 0) >= ctx.target ? 'ok' : 'bad') : '',
        );
      case 'kpi_total':
        return tile(
          id,
          n,
          changeOf((l) => l.length, 1),
          goReviews,
        );
      case 'kpi_conv':
        return tile(
          id,
          new Set(ctx.d.map((r) => r.leadId)).size,
          changeOf((l) => new Set(l.map((r) => r.leadId)).size, 1),
          goReviews,
        );
      case 'kpi_rtime':
        return tile(id, duration(averageReviewTime(ctx.d)), changeOf(averageReviewTime, -1), goReviews);
      case 'kpi_agents':
        return tile(
          id,
          new Set(ctx.d.map((r) => r.agentId)).size,
          changeOf((l) => new Set(l.map((r) => r.agentId)).size, 1),
          page('team-review'),
        );
      case 'kpi_disputed':
        return tile(
          id,
          ctx.d.filter((r) => disputed.has(r.id)).length,
          changeOf((l) => l.filter((r) => disputed.has(r.id)).length, -1),
          page('disputes'),
        );
      case 'kpi_comments':
        return tile(
          id,
          percent(share(ctx.d, hasComment)),
          changeOf((l) => share(l, hasComment), 1),
          goReviews,
        );
      case 'kpi_unseen':
        return tile(
          id,
          percent(share(ctx.d, (r) => !r.seenAt)),
          changeOf((l) => share(l, (r) => !r.seenAt), -1),
          goReviews,
        );
      case 'kpi_pass':
        return tile(id, percent(pass), changeOf(passOf, 1), goReviews);
      case 'kpi_fail':
        return tile(
          id,
          percent(n ? 100 - pass : 0),
          changeOf((l) => share(l, (r) => !isPass(r, rates)), -1),
          goReviews,
        );
      case 'kpi_trend': {
        const tr = trend(ctx.d, base);
        return tile(
          id,
          <span className="text-xl">{t(`dash.trend.${tr.direction}`)}</span>,
          <>
            <Sparkline values={lastTenWeeks(ctx.d, now, base)} />
            <small className="text-xs text-mu">
              {t('dash.delta', { n: `${tr.delta >= 0 ? '+' : ''}${tr.delta.toFixed(1)}` })}
            </small>
          </>,
          page('category-stats'),
        );
      }
      case 'kpi_flags': {
        const quick = flags.filter(flagWindow);
        const red = ctx.d.filter((r) => r.flag === 'red').length + quick.filter((f) => f.type === 'red').length;
        const green = ctx.d.filter((r) => r.flag === 'green').length + quick.filter((f) => f.type === 'green').length;
        return tile(
          id,
          <>
            <span className="text-bad">{red}</span> · <span className="text-ok">{green}</span>
          </>,
          <small className="text-xs text-mu">{t('dash.redGreen')}</small>,
          can(company.role, 'flags.write') ? page('quick-flags') : undefined,
        );
      }
      case 'kpi_disputes': {
        const open = ctx.d.filter((r) => {
          const x = disputed.get(r.id);
          return x && x.state !== 'resolved';
        }).length;
        return tile(
          id,
          open,
          <small className="text-xs text-mu">{open ? t('dash.waiting') : t('dash.nothingOpen')}</small>,
          page('disputes'),
          open ? 'wn' : '',
        );
      }
      case 'qtime':
        return chartCard(
          id,
          <ScoresOverTime
            title={t('dash.charts.qtime')}
            points={groups(ctx.d, grouping, base).map((g) => ({
              key: g.key,
              label: groupLabel(g.key),
              average: averageScore(g.reviews),
              count: g.reviews.length,
            }))}
          />,
        );
      case 'cattime': {
        const names = categoryAverages(ctx.d).map((c) => c.name);
        return chartCard(
          id,
          <CategoriesOverTime
            title={t('dash.charts.cattime')}
            categories={names}
            points={groups(ctx.d, grouping, base).map((g) => ({
              key: g.key,
              label: groupLabel(g.key),
              values: Object.fromEntries(categoryAverages(g.reviews).map((c) => [c.name, c.value])),
            }))}
          />,
        );
      }
    }
  };
  const chartCard = (id: WidgetId, body: ReactNode) => (
    <section className={`${card} grid h-full gap-2 content-start`} aria-labelledby={`w-${id}`}>
      <h2 id={`w-${id}`} className="font-semibold" title={t(`dash.charts.${id}Help`)}>
        {t(`dash.charts.${id}`)} <small className="font-normal text-mu">{t(`dash.charts.by.${grouping}`)}</small>
      </h2>
      {body}
    </section>
  );
  const latest = (reviews ?? []).reduce((m, r) => Math.max(m, new Date(r.createdAt).getTime()), 0);

  return (
    <section className="grid gap-4" aria-labelledby="dash-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="dash-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('dash.title')}
          </h1>
          <p className="text-sm text-mu">{t('dash.intro')}</p>
        </div>
        {can(company.role, 'reviews.write') && (
          <Link to="/$app/$page" params={{ app: 'quality', page: 'qa-entry' }} className={primaryButton}>
            + {t('dash.newEvaluation')}
          </Link>
        )}
      </div>
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {t('dash.welcome', { name: me.name ?? '' })}
          <span className="rounded-full bg-ac/15 px-2 text-xs font-semibold text-ac">
            {ROLE_LABELS[lang][company.role]}
          </span>
        </h2>
        <p className="text-sm text-mu">{t('dash.overview')}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-1 flex-wrap items-center gap-2" role="group" aria-label={t('dash.filters')}>
          <label className={`${chip} ${chipLook(filters.period !== 'all')}`}>
            {t('dash.dateIs')}
            <select
              className={chipSelect}
              value={filters.period}
              onChange={(e) => setFilters({ ...filters, period: e.target.value as Period })}
            >
              {(['week', 'month', 'year', 'all', 'custom'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`dash.periods.${p}`)}
                </option>
              ))}
            </select>
          </label>
          {filters.period === 'custom' && (
            <>
              <input
                type="date"
                aria-label={t('list.from')}
                className={field}
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              />
              <input
                type="date"
                aria-label={t('list.to')}
                className={field}
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </>
          )}
          {shown.map((k) => (
            <label key={k} className={`${chip} ${chipLook(Boolean(filters[k]))}`}>
              {t('dash.chip', { name: t(`dash.filter.${k}`) })}
              <select className={chipSelect} value={filters[k]} onChange={(e) => set(k, e.target.value)}>
                <option value="">{t('list.all')}</option>
                {options[k].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-1 text-mu hover:text-tx"
                title={t('dash.removeFilter')}
                aria-label={`${t('dash.removeFilter')}: ${t(`dash.filter.${k}`)}`}
                onClick={() => {
                  set(k, '');
                  setAdded(added.filter((x) => x !== k));
                }}
              >
                ✕
              </button>
            </label>
          ))}
          {addable.length > 0 && (
            <span ref={menuRef} className="relative">
              <button
                type="button"
                className={`${chip} ${chipLook(false)} py-1.5 pr-3`}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                + {t('dash.filterButton')}
              </button>
              {menu && (
                <div
                  role="menu"
                  className="absolute left-0 top-10 z-20 grid min-w-40 rounded-m border border-bd bg-pn p-1 shadow-card"
                >
                  {addable.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      className="rounded-s px-3 py-1.5 text-left text-sm hover:bg-sunk"
                      onClick={() => {
                        setAdded([...added, k]);
                        setMenu(false);
                      }}
                    >
                      {t(`dash.filter.${k}`)}
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
          {anySet && (
            <button
              type="button"
              className="text-sm font-semibold text-ac hover:underline"
              onClick={() => {
                setFilters({ ...NO_FILTERS, from: daysAgo(30), to: daysAgo(0) });
                setAdded([]);
              }}
            >
              {t('dash.reset')}
            </button>
          )}
        </div>
        <Link
          to="/$app/$page"
          params={{ app: 'quality', page: 'personalize' }}
          className={smallButton}
          title={t('dash.personalizeHelp')}
        >
          ⚙ {t('dash.personalize')}
        </Link>
      </div>

      {!reviews && <p className="text-mu">{t('common.loading')}</p>}
      {reviews && ids.length === 0 && (
        <div className={`${card} text-center`}>
          <b>{t('dash.empty')}</b>
          <br />
          <Link to="/$app/$page" params={{ app: 'quality', page: 'personalize' }} className="text-ac hover:underline">
            {t('dash.emptyLink')}
          </Link>
        </div>
      )}
      {reviews && ids.length > 0 && (
        // 60 columns without gaps between them (14px of space comes from each widget's own padding); where the dashboard
        // is narrower than 42rem, number tiles take half the width and the other cards all of it
        <div className="@container">
          <div className="-mx-[7px] grid grid-cols-60 gap-y-3.5">
            {pack(ids).map(({ id, span }) => (
              <div
                key={id}
                className="min-w-0 px-[7px] [grid-column:span_var(--sp)/span_var(--sp)] @max-2xl:[grid-column:span_var(--spm)/span_var(--spm)]"
                style={{ '--sp': span, '--spm': WIDTH[id] <= 15 ? 30 : 60 } as React.CSSProperties}
              >
                {widget(id)}
              </div>
            ))}
          </div>
        </div>
      )}
      {latest > 0 && (
        <p className="flex flex-wrap justify-end gap-2 text-xs text-mu" title={new Date(latest).toLocaleString(lang)}>
          <b>{t('dash.updated')}</b>
          <span className="font-mono">{new Date(latest).toISOString().slice(0, 19).replace('T', ' ')}</span>
        </p>
      )}
    </section>
  );
}
