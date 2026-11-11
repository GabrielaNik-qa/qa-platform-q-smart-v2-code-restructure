// Quality › Reports › Report builder (today's reports.js `PG.rbuild`): pick the data, metrics, rows and columns, and the
// report updates as you click. It counts with the shared engine (packages/shared/src/reports.ts), the same as the
// server's Excel files and scheduled reports, on what the person may see. Save it (and share it with the staff),
// export it to Excel, or print it as a PDF. Sources so far: reviews and quick flags.
import {
  passRateOf,
  PERCENT_METRICS,
  REPORT_PERIODS,
  REPORT_SOURCES,
  type ReportConfig,
  type ReportData,
  type ReportDim,
  type ReportResult,
  type ReportSource,
  runReport,
  TIME_DIMS,
} from '@qsmart/shared';
import { useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiFile } from './api';
import { BAND_TEXT, colour, Empty } from './bits';
import type { PassRates } from './QAEntry';
import { useSession } from './session';
import {
  card,
  type CompanyRef,
  field,
  Notice,
  type PersonRow,
  primaryButton,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

export interface SavedReport {
  id: string;
  name: string;
  cfg: ReportConfig;
  shared: boolean;
  schedule: {
    freq: 'none' | 'daily' | 'weekly' | 'monthly';
    weekday?: number;
    day?: number;
    hour?: number;
    timeZone?: string;
    email?: boolean;
    to?: string;
  };
  lastSentAt: string | null;
  byId: string | null;
  byName: string;
}
export const NEW_REPORT = (): ReportConfig => ({
  src: 'reviews',
  metrics: ['count', 'avg', 'pass'],
  rows: 'agent',
  cols: 'none',
  period: { p: 'month', f: '', t: '' },
  filters: { team: '', agent: '', ch: '', sc: '' },
  chart: 'bars',
  sort: 'desc',
});
/** Today's templates (the task, CSAT and complaint ones join with their phases). */
const TEMPLATES: { id: string; cfg: Partial<ReportConfig> }[] = [
  {
    id: 'monthly',
    cfg: {
      src: 'reviews',
      metrics: ['count', 'avg', 'pass', 'red'],
      rows: 'agent',
      cols: 'none',
      period: { p: 'lastmonth' },
      chart: 'bars',
    },
  },
  {
    id: 'teamsMonths',
    cfg: { src: 'reviews', metrics: ['avg'], rows: 'team', cols: 'month', period: { p: 'year' }, chart: 'table' },
  },
  {
    id: 'categoriesTeams',
    cfg: { src: 'reviews', metrics: ['avg'], rows: 'category', cols: 'team', period: { p: 'quarter' }, chart: 'table' },
  },
  {
    id: 'trendWeeks',
    cfg: {
      src: 'reviews',
      metrics: ['avg', 'count'],
      rows: 'week',
      cols: 'none',
      period: { p: 'quarter' },
      chart: 'line',
    },
  },
  {
    id: 'types',
    cfg: {
      src: 'reviews',
      metrics: ['count', 'avg', 'pass'],
      rows: 'type',
      cols: 'none',
      period: { p: 'month' },
      chart: 'bars',
    },
  },
  {
    id: 'reviewers',
    cfg: {
      src: 'reviews',
      metrics: ['count', 'avg'],
      rows: 'reviewer',
      cols: 'month',
      period: { p: 'quarter' },
      chart: 'table',
    },
  },
  {
    id: 'flags',
    cfg: {
      src: 'flags',
      metrics: ['count', 'red', 'green'],
      rows: 'agent',
      cols: 'none',
      period: { p: 'month' },
      chart: 'bars',
    },
  },
];

/** The data a report counts (from the server: what the person may see). */
export function useReportData(companyId: string) {
  const [data, setData] = useState<ReportData | null>(null);
  useEffect(() => {
    api<{ reviews: ReportData['reviews']; flags: ReportData['flags']; rates: PassRates }>(
      '/reports/data',
      companyId,
    ).then(
      (d) => setData({ reviews: d.reviews, flags: d.flags, passRate: (teamId) => passRateOf(d.rates, teamId) }),
      () => setData({ reviews: [], flags: [], passRate: () => 85 }),
    );
  }, [companyId]);
  return data;
}

/** A value as today: percentages with one decimal and %, counts as they are. */
export const formatValue = (m: string, v: number | null | undefined) =>
  v === null || v === undefined ? '-' : PERCENT_METRICS.includes(m) ? `${v.toFixed(1)}%` : String(v);

/** The words of a report in the person's language. */
export function useReportWords() {
  const { t } = useTranslation();
  return {
    metric: (src: ReportSource, m: string) => t(`reports.metrics.${src}.${m}`),
    dim: (d: ReportDim) => t(`reports.dims.${d}`),
    key: (d: ReportDim, k: string) => (d === 'type' ? t(`team.channels.${k}`) : d === 'none' ? t('reports.total') : k),
    period: (p: string) => t(`reports.periods.${p}`),
    source: (s: ReportSource) => t(`reports.sources.${s}`),
  };
}

/** The result as a table (and, without columns, a total line), as today's. */
export function ReportTable({ res }: { res: ReportResult }) {
  const { t } = useTranslation();
  const w = useReportWords();
  const th = 'py-1 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-mu';
  if (!res.rows.length) return <Empty>{t('reports.noData')}</Empty>;
  const first = res.metrics[0] ?? 'count';
  const tone = (m: string, v: number | null | undefined) =>
    PERCENT_METRICS.includes(m) && v !== null && v !== undefined && m !== 'fail' ? BAND_TEXT[colour(v, 85)] : '';
  return (
    <div className="overflow-x-auto">
      {res.colDim !== 'none' && (
        <small className="text-mu">{t('reports.values', { metric: w.metric(res.src, first) })}</small>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>{w.dim(res.rowDim)}</th>
            {res.colDim === 'none'
              ? res.metrics.map((m) => (
                  <th key={m} className={th}>
                    {w.metric(res.src, m)}
                  </th>
                ))
              : [...res.colKeys.map((k) => w.key(res.colDim, k)), t('reports.total')].map((k) => (
                  <th key={k} className={th}>
                    {k}
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {res.rows.map((r) => (
            <tr key={r.key} className="border-t border-bd">
              <td className="py-1.5 pr-3">{w.key(res.rowDim, r.key)}</td>
              {res.colDim === 'none'
                ? res.metrics.map((m) => (
                    <td key={m} className={`py-1.5 pr-3 font-mono ${tone(m, r.cells[0]?.[m])}`}>
                      {formatValue(m, r.cells[0]?.[m])}
                    </td>
                  ))
                : [
                    ...r.cells.map((c, i) => (
                      <td key={i} className={`py-1.5 pr-3 font-mono ${tone(first, c[first])}`}>
                        {c._n ? formatValue(first, c[first]) : <span className="text-mu">-</span>}
                      </td>
                    )),
                    <td key="total" className="py-1.5 pr-3 font-mono font-bold">
                      {formatValue(first, r.total?.[first])}
                    </td>,
                  ]}
            </tr>
          ))}
          {res.colDim === 'none' && (
            <tr className="border-t-2 border-bd font-bold">
              <td className="py-1.5 pr-3">{t('reports.total')}</td>
              {res.metrics.map((m) => (
                <td key={m} className="py-1.5 pr-3 font-mono">
                  {formatValue(m, res.grand[m])}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Today's chart of a result: a bar per row (the first metric), or a line through the rows. */
function ReportChart({ res, chart }: { res: ReportResult; chart: ReportConfig['chart'] }) {
  const w = useReportWords();
  const m = res.metrics[0] ?? 'count';
  const rows = res.rows.filter(
    (r) => (r.total ?? r.cells[0])?.[m] !== null && (r.total ?? r.cells[0])?.[m] !== undefined,
  );
  if (!rows.length || chart === 'table') return null;
  const value = (r: (typeof rows)[number]) => (r.total ?? r.cells[0])?.[m] ?? 0;
  const pct = PERCENT_METRICS.includes(m);
  const top = pct ? 100 : Math.max(1, ...rows.map(value));
  if (chart === 'line' && rows.length > 1) {
    const W = 760;
    const H = 220;
    const L = 44;
    const B = 30;
    const pw = W - L - 16;
    const ph = H - B - 10;
    const x = (i: number) => L + (i * pw) / (rows.length - 1);
    const y = (v: number) => 10 + ph * (1 - v / top);
    const every = Math.max(1, Math.ceil(rows.length / 12));
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={w.metric(res.src, m)}
        className="block font-sans"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - 16} y1={y(top * f)} y2={y(top * f)} stroke="var(--bd)" />
            <text x={L - 6} y={y(top * f) + 4} fontSize={11} textAnchor="end" fill="var(--mu)">
              {Math.round(top * f)}
              {pct ? '%' : ''}
            </text>
          </g>
        ))}
        <polyline
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          points={rows.map((r, i) => `${x(i)},${y(value(r))}`).join(' ')}
        />
        {rows.map((r, i) => (
          <g key={r.key}>
            <circle cx={x(i)} cy={y(value(r))} r={4} fill="var(--series-1)" stroke="var(--pn)" strokeWidth={2}>
              <title>{`${w.key(res.rowDim, r.key)}: ${formatValue(m, value(r))}`}</title>
            </circle>
            {i % every === 0 && (
              <text x={x(i)} y={H - 8} fontSize={11} textAnchor="middle" fill="var(--mu)">
                {w.key(res.rowDim, r.key).slice(-8)}
              </text>
            )}
          </g>
        ))}
      </svg>
    );
  }
  return (
    <div className="grid gap-1.5">
      {rows.slice(0, 25).map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(80px,180px)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate" title={w.key(res.rowDim, r.key)}>
            {w.key(res.rowDim, r.key)}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-sunk">
            <span
              className={`block h-full rounded-r-[4px] ${pct ? { ok: 'bg-ok', wn: 'bg-wn', hot: 'bg-hot', bad: 'bg-bad' }[colour(value(r), 85)] : 'bg-[var(--series-1)]'}`}
              style={{ width: `${(value(r) / top) * 100}%` }}
            />
          </span>
          <b className="font-mono">{formatValue(m, value(r))}</b>
        </div>
      ))}
    </div>
  );
}

export function ReportBuilder({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const w = useReportWords();
  const { message, run, fail } = useAction();
  const { company: session } = useSession();
  const search = useSearch({ from: '/$app/$page' });
  const data = useReportData(company.id);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [scorecards, setScorecards] = useState<{ id: string; name: string }[]>([]);
  const [report, setReport] = useState<{
    id: string;
    name: string;
    cfg: ReportConfig;
    shared: boolean;
    byId?: string | null;
  }>({
    id: '',
    name: '',
    cfg: NEW_REPORT(),
    shared: false,
  });
  const [saving, setSaving] = useState<{ name: string; shared: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<TeamRow[]>('/teams', company.id).catch(() => []),
      api<PersonRow[]>('/people', company.id).catch(() => []),
      api<{ id: string; name: string }[]>('/scorecards', company.id).catch(() => []),
    ]).then(([tm, ppl, sc]) => {
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl.filter((p) => p.role === 'agent').sort((a, b) => a.name.localeCompare(b.name)));
      setScorecards(sc);
    });
  }, [company.id]);
  // a saved report opened from "Saved & scheduled"
  useEffect(() => {
    if (!search.report) return;
    api<SavedReport[]>('/reports', company.id).then((list) => {
      const r = list.find((x) => x.id === search.report);
      if (r) setReport({ id: r.id, name: r.name, cfg: { ...NEW_REPORT(), ...r.cfg }, shared: r.shared, byId: r.byId });
    }, fail);
  }, [company.id, search.report, fail]);

  const cfg = report.cfg;
  const res = useMemo(() => (data ? runReport(cfg, data, Date.now()) : null), [cfg, data]);
  const set = (change: Partial<ReportConfig>) => {
    const next = { ...cfg, ...change };
    if (change.src) {
      const s = REPORT_SOURCES[change.src];
      next.metrics = [s.metrics[0]];
      if (!(s.dims as readonly string[]).includes(next.rows)) next.rows = s.dims[0];
      if (
        !(s.dims as readonly string[]).includes(next.cols) &&
        next.cols !== 'none' &&
        !(TIME_DIMS as readonly string[]).includes(next.cols)
      )
        next.cols = 'none';
    }
    setReport({ ...report, cfg: next });
  };
  const setFilter = (k: 'team' | 'agent' | 'ch' | 'sc', v: string) =>
    set({ filters: { ...cfg.filters, [k]: v, ...(k === 'team' ? { agent: '' } : {}) } });
  const toggle = (m: string) =>
    set({
      metrics: cfg.metrics.includes(m)
        ? cfg.metrics.length > 1
          ? cfg.metrics.filter((x) => x !== m)
          : cfg.metrics
        : [...cfg.metrics, m],
    });
  const dims: ReportDim[] = ['none', ...REPORT_SOURCES[cfg.src].dims, ...TIME_DIMS];

  async function exportExcel() {
    setExporting(true);
    await run(async () => {
      const name = report.name.trim() || t('reports.untitled');
      const file = await apiFile('/reports/export', company.id, { name: name.slice(0, 80), cfg });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `${name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${new Date().toLocaleDateString('sv-SE')}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('list.export'));
    setExporting(false);
  }
  function print() {
    if (!res) return;
    const win = window.open('', '_blank');
    if (!win) return fail(new Error(t('agents.report.popup')));
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const first = res.metrics[0] ?? 'count';
    const head =
      res.colDim === 'none'
        ? res.metrics.map((m) => `<th>${esc(w.metric(res.src, m))}</th>`).join('')
        : [...res.colKeys.map((k) => w.key(res.colDim, k)), t('reports.total')]
            .map((k) => `<th>${esc(k)}</th>`)
            .join('');
    const body = res.rows
      .map(
        (r) =>
          `<tr><td>${esc(w.key(res.rowDim, r.key))}</td>${
            res.colDim === 'none'
              ? res.metrics.map((m) => `<td>${esc(formatValue(m, r.cells[0]?.[m]))}</td>`).join('')
              : [...r.cells.map((c) => formatValue(first, c[first])), formatValue(first, r.total?.[first])]
                  .map((v) => `<td>${esc(v)}</td>`)
                  .join('')
          }</tr>`,
      )
      .join('');
    const title = report.name || t('reports.untitled');
    win.document.write(
      `<!doctype html><meta charset=utf-8><title>${esc(title)}</title><body style="margin:30px;font-family:sans-serif"><h2>${esc(title)}</h2><p style="color:#555">${esc(w.source(res.src))} · ${esc(w.period(cfg.period.p))} · ${res.n}</p><table border=1 cellpadding=6 style="border-collapse:collapse;font-size:13px"><tr><th>${esc(w.dim(res.rowDim))}</th>${head}</tr>${body}</table><p style="font-size:12px;color:#888">Q-smart · ${esc(new Date().toLocaleString())}</p></body>`,
    );
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
  const save = () =>
    void run(async () => {
      if (!saving) return;
      const body = { name: saving.name.trim(), cfg, shared: saving.shared };
      const saved = await api<SavedReport>(report.id ? `/reports/${report.id}` : '/reports', company.id, {
        method: report.id ? 'PUT' : 'POST',
        body,
      });
      setReport({ id: saved.id, name: saved.name, cfg, shared: saved.shared, byId: saved.byId });
      setSaving(null);
    }, t('reports.saved'));

  const select = (
    label: string,
    value: string,
    options: [string, string][],
    change: (v: string) => void,
  ): ReactNode => (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select className={field} value={value} onChange={(e) => change(e.target.value)}>
        {options.map(([k, n]) => (
          <option key={k} value={k}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
  const cap = 'text-xs font-semibold uppercase tracking-wide text-mu';
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`;
  // someone else's shared report is saved as your own copy (only its owner, or an admin, changes it)
  const owner = !report.id || company.role === 'admin' || report.byId === session?.membershipId;

  return (
    <section className="grid gap-4" aria-labelledby="rbuild-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="rbuild-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.rbuild')}
          </h1>
          <p className="text-sm text-mu">{t('reports.intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={smallButton}
            onClick={() => setReport({ id: '', name: '', cfg: NEW_REPORT(), shared: false })}
          >
            + {t('reports.new')}
          </button>
          <button
            type="button"
            className={smallButton}
            disabled={exporting || !res?.rows.length}
            onClick={() => void exportExcel()}
          >
            {exporting ? t('list.exporting') : t('reports.excel')}
          </button>
          <button type="button" className={smallButton} disabled={!res} onClick={print}>
            {t('reports.pdf')}
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              if (!owner) setReport({ ...report, id: '', byId: null, shared: false });
              setSaving({ name: report.name, shared: owner ? report.shared : false });
            }}
          >
            {!owner ? t('reports.saveCopy') : report.id ? t('reports.saveChanges') : t('reports.save')}
          </button>
        </div>
      </div>
      <Notice message={message} />
      <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr]">
        <aside className={`${card} grid gap-3`}>
          <p className={cap}>{t('reports.quickStart')}</p>
          <select
            className={field}
            value=""
            aria-label={t('reports.fromTemplate')}
            onChange={(e) => {
              const tpl = TEMPLATES.find((x) => x.id === e.target.value);
              if (tpl)
                setReport({
                  id: '',
                  name: t(`reports.templates.${tpl.id}`),
                  cfg: { ...NEW_REPORT(), ...tpl.cfg, filters: { team: '', agent: '', ch: '', sc: '' } },
                  shared: false,
                });
            }}
          >
            <option value="">{t('reports.fromTemplate')}</option>
            {TEMPLATES.map((x) => (
              <option key={x.id} value={x.id}>
                {t(`reports.templates.${x.id}`)}
              </option>
            ))}
          </select>
          {select(
            t('reports.data'),
            cfg.src,
            (Object.keys(REPORT_SOURCES) as ReportSource[]).map((s) => [s, w.source(s)]),
            (v) => set({ src: v as ReportSource }),
          )}
          <div className="grid gap-1 text-sm font-medium">
            {t('reports.metricsLabel')}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('reports.metricsLabel')}>
              {REPORT_SOURCES[cfg.src].metrics.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={cfg.metrics.includes(m)}
                  className={chip(cfg.metrics.includes(m))}
                  onClick={() => toggle(m)}
                >
                  {w.metric(cfg.src, m)}
                </button>
              ))}
            </div>
          </div>
          {select(
            t('reports.rows'),
            cfg.rows,
            dims.map((d) => [d, w.dim(d)]),
            (v) => set({ rows: v as ReportDim }),
          )}
          {select(
            t('reports.cols'),
            cfg.cols,
            dims.map((d) => [d, w.dim(d)]),
            (v) => set({ cols: v as ReportDim }),
          )}
          {select(
            t('team.period'),
            cfg.period.p,
            REPORT_PERIODS.map((p) => [p, w.period(p)]),
            (v) => set({ period: { ...cfg.period, p: v as ReportConfig['period']['p'] } }),
          )}
          {cfg.period.p === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className={field}
                aria-label={t('agents.from')}
                value={cfg.period.f ?? ''}
                onChange={(e) => set({ period: { ...cfg.period, f: e.target.value } })}
              />
              <input
                type="date"
                className={field}
                aria-label={t('agents.to')}
                value={cfg.period.t ?? ''}
                onChange={(e) => set({ period: { ...cfg.period, t: e.target.value } })}
              />
            </div>
          )}
          <p className={cap}>{t('reports.filters')}</p>
          {select(
            t('team.team'),
            cfg.filters?.team ?? '',
            [['', t('team.allTeams')], ...teams.map((x): [string, string] => [x.id, x.name])],
            (v) => setFilter('team', v),
          )}
          {select(
            t('cats.agent'),
            cfg.filters?.agent ?? '',
            [
              ['', t('reports.allAgents')],
              ...people
                .filter((p) => !cfg.filters?.team || p.teamId === cfg.filters.team)
                .map((p): [string, string] => [p.membershipId, p.name]),
            ],
            (v) => setFilter('agent', v),
          )}
          {select(
            t('team.type'),
            cfg.filters?.ch ?? '',
            [
              ['', t('team.allTypes')],
              ...(['call', 'chat', 'email', 'other'] as const).map((k): [string, string] => [
                k,
                t(`team.channels.${k}`),
              ]),
            ],
            (v) => setFilter('ch', v),
          )}
          {cfg.src === 'reviews' &&
            select(
              t('cats.scorecard'),
              cfg.filters?.sc ?? '',
              [['', t('cats.allScorecards')], ...scorecards.map((s): [string, string] => [s.id, s.name])],
              (v) => setFilter('sc', v),
            )}
          <p className={cap}>{t('reports.showAs')}</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('reports.showAs')}>
            {(['bars', 'line', 'table'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={cfg.chart === k}
                className={chip(cfg.chart === k)}
                onClick={() => set({ chart: k })}
              >
                {t(`reports.charts.${k}`)}
              </button>
            ))}
          </div>
          {select(
            t('reports.sort'),
            cfg.sort ?? 'desc',
            (['desc', 'asc', 'az'] as const).map((k): [string, string] => [k, t(`reports.sorts.${k}`)]),
            (v) => set({ sort: v as ReportConfig['sort'] }),
          )}
        </aside>
        <div className={`${card} grid content-start gap-4`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <input
                className="border-b border-transparent bg-transparent font-display text-2xl font-bold outline-none focus:border-bd"
                aria-label={t('reports.name')}
                placeholder={t('reports.untitled')}
                maxLength={80}
                value={report.name}
                onChange={(e) => setReport({ ...report, name: e.target.value })}
              />
              {res && (
                <small className="text-mu">
                  {w.source(res.src)} · {w.period(cfg.period.p)}
                  {cfg.period.p !== 'all' &&
                    ` · ${new Date(res.from).toLocaleDateString('sv-SE')} - ${new Date(Math.min(res.to - 1, Date.now())).toLocaleDateString('sv-SE')}`}
                </small>
              )}
            </div>
            {report.id && <span className="rounded-full bg-bd/60 px-2 text-xs">{t('reports.savedBadge')}</span>}
          </div>
          {!res ? (
            <p className="text-mu">{t('common.loading')}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                {res.metrics.map((m) => (
                  <div key={m} className="rounded-s bg-pn2 px-3 py-2">
                    <small className="block text-xs text-mu">{w.metric(res.src, m)}</small>
                    <b className="font-display text-2xl">{formatValue(m, res.grand[m])}</b>
                  </div>
                ))}
                <div className="rounded-s bg-pn2 px-3 py-2">
                  <small className="block text-xs text-mu">{t('reports.records')}</small>
                  <b className="font-display text-2xl">{res.n}</b>
                </div>
              </div>
              <ReportChart res={res} chart={cfg.chart} />
              <ReportTable res={res} />
            </>
          )}
        </div>
      </div>
      {saving && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setSaving(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="rsave-title"
            className="grid w-full max-w-[520px] gap-3 rounded-l border border-bd bg-pn p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <h2 id="rsave-title" className="font-display text-xl font-bold">
              {report.id ? t('reports.saveChanges') : t('reports.saveTitle')}
            </h2>
            <label className="grid gap-1 text-sm font-medium">
              {t('reports.name')}
              <input
                className={field}
                required
                maxLength={80}
                value={saving.name}
                onChange={(e) => setSaving({ ...saving, name: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={saving.shared}
                onChange={(e) => setSaving({ ...saving, shared: e.target.checked })}
              />
              {t('reports.shareWithStaff')}
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={smallButton} onClick={() => setSaving(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className={primaryButton}>
                {t('goals.form.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
