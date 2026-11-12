// Quality › Analytics › Agents: one place for everything about an agent (today's agents.js). Agents see only
// themselves ("My Performance"), team leads, trainers and reviewers the agents of their workspaces, admins every agent.
// The page only reads what the other pages store, so every number matches Reviews and the Dashboard: the same shared
// counting (packages/shared/src/stats.ts), here with calendar periods (this week from Monday, this month, quarter,
// year) as today. Its tabs: Performance (categories, agent against team), Reviews & Trends (a column per day, week or
// month, and the reviews), Flags (red and green flags, disputes), One-to-One (one-to-ones, coaching and open tasks)
// and Growth (goals, improvement plans, kudos). Simulations join with their own phase.
import {
  average,
  averageScore,
  type Bucket,
  type CalendarPeriod,
  calendarWindow,
  categoryNames,
  categoryValue,
  chartBuckets,
  dayOf,
  isPass,
  passRateOf,
  scoredOnly,
  type Window,
} from '@qsmart/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CoachingTab } from './AgentCoaching';
import { api, apiFile } from './api';
import { band, BAND_FILL, BAND_SOFT, BAND_TEXT, Empty, ReviewLink, TeamLink } from './bits';
import { Radar, type ScoreColumn, ScoreColumns } from './charts';
import type { SessionRow } from './Coaching';
import type { Dispute } from './Disputes';
import { type Goal, GoalCard, monthName } from './Goals';
import { type Plan, planOpen, PlanRow } from './ImprovementPlans';
import type { Kudos } from './Recognition';
import { currentLanguage } from './i18n';
import { pageOf, Pager } from './Pager';
import type { PassRates, ReviewRow } from './QAEntry';
import { useSession } from './session';
import type { Task } from './Tasks';
import { card, type CompanyRef, field, Notice, type PersonRow, smallButton, type TeamRow, useAction } from './ui';

const CHANNELS = ['call', 'chat', 'email', 'other'] as const;
type Channel = (typeof CHANNELS)[number];
type Tab = 'perf' | 'calls' | 'flags' | 'o2o' | 'growth';
const PERIODS: CalendarPeriod[] = ['week', 'month', 'quarter', 'year', 'all'];
const LOCALES = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' } as const;
const DAY = 864e5;
const ymd = (at: number) => new Date(at).toLocaleDateString('sv-SE');
const daysAgo = (n: number) => ymd(Date.now() - n * DAY);
const inside = (r: ReviewRow, w: Window | null) => {
  if (!w) return false;
  const at = dayOf(r);
  return at >= w[0] && at < w[1];
};
/** today's agent level of a category: excellent at the pass rate, good from 70, else needs improvement */
const level = (v: number, pass: number) => (v >= pass ? 'excellent' : v >= 70 ? 'good' : 'needs');
const LEVEL_TONE = { excellent: 'ok', good: 'wn', needs: 'bad' } as const;

/** The team's numbers for an agent: counted here for staff, sent by the server (totals only) for an agent. */
interface TeamAverage {
  reviews: number;
  average: number | null;
  categories: { name: string; value: number }[];
}

export function Agents({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const locale = LOCALES[lang];
  const { me, company: session } = useSession();
  const search = useSearch({ from: '/$app/$page' });
  const navigate = useNavigate();
  const agentView = company.role === 'agent';
  const { message, run, fail } = useAction();

  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [serverTeam, setServerTeam] = useState<TeamAverage | null>(null);
  const [growth, setGrowth] = useState<{ goals: Goal[]; plans: Plan[]; kudos: Kudos[] }>({
    goals: [],
    plans: [],
    kudos: [],
  });

  const [work, setWork] = useState<{ sessions: SessionRow[]; tasks: Task[] }>({ sessions: [], tasks: [] });
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [agent, setAgent] = useState(search.agent ?? '');
  const [period, setPeriod] = useState<CalendarPeriod>('month');
  const [custom, setCustom] = useState({ from: daysAgo(30), to: daysAgo(0) });
  const [channel, setChannel] = useState<'' | Channel>('');
  const [scorecard, setScorecard] = useState('');
  const [tab, setTab] = useState<Tab>('perf');
  const [sort, setSort] = useState<{ key: 'lead' | 'campaign' | 'date' | 'score'; dir: 1 | -1 }>({
    key: 'date',
    dir: -1,
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      api<PersonRow[]>('/people', company.id).catch(() => []),
      agentView ? Promise.resolve([]) : api<TeamRow[]>('/teams', company.id).catch(() => []),
      api<Dispute[]>('/disputes', company.id).catch(() => []),
    ]).then(([r, pr, ppl, tm, d]) => {
      setNow(Date.now());
      setReviews(r);
      setRates(pr);
      setPeople(ppl);
      setTeams(tm.filter((x) => !x.isAdministration));
      setDisputes(d);
    }, fail);
  }, [company.id, agentView, fail]);

  // the Growth tab: this month's goals, the improvement plans and the kudos (each only as far as the person may read)
  useEffect(() => {
    const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
    void Promise.all([
      api<Goal[]>(`/goals?month=${month}`, company.id).catch(() => []),
      api<Plan[]>('/improvement-plans', company.id).catch(() => []),
      api<Kudos[]>('/kudos', company.id).catch(() => []),
    ]).then(([goals, plans, kudos]) => setGrowth({ goals, plans, kudos }));
    // the One-to-One tab: sessions and tasks, as far as the person may read them
    void Promise.all([
      api<SessionRow[]>('/coaching-sessions', company.id).catch(() => []),
      api<Task[]>('/tasks', company.id).catch(() => []),
    ]).then(([sessions, tasks]) => setWork({ sessions, tasks }));
  }, [company.id]);

  // a link from elsewhere (today's openAgent): open that agent, with the filters of the page reset
  useEffect(() => {
    if (!search.agent) return;
    setAgent(search.agent);
    setTeam('');
    setScorecard('');
    setQ('');
    setPage(1);
  }, [search.agent]);

  // ---- who may be looked at: an agent only themselves, staff the agents the server lets them see
  const options = useMemo<PersonRow[]>(() => {
    const agents = people.filter((p) => p.role === 'agent').sort((a, b) => a.name.localeCompare(b.name));
    if (!agentView) return agents;
    const mine = agents.find((p) => p.membershipId === session?.membershipId);
    if (mine) return [mine];
    const first = reviews?.[0];
    return session?.membershipId
      ? [
          {
            membershipId: session.membershipId,
            userId: '',
            name: me.name ?? '',
            email: me.email ?? '',
            role: 'agent',
            teamId: first?.teamId ?? null,
            teamName: first?.teamName ?? null,
            active: true,
            accepted: true,
            skillIds: [],
            workspaceIds: [],
          },
        ]
      : [];
  }, [people, agentView, session?.membershipId, reviews, me.name, me.email]);
  const inTeam = options.filter((a) => !team || a.teamId === team);
  const u = inTeam.find((a) => a.membershipId === agent) ?? inTeam[0] ?? options[0];

  // ---- the chosen agent's data for the chosen period (everything the page shows comes from this)
  const w = calendarWindow(period, now, 0, custom);
  const wp = calendarWindow(period, now, 1, custom);
  const all = scoredOnly(reviews ?? []);
  const mine = all.filter((r) => u && r.agentId === u.membershipId);
  const inCur = mine.filter((r) => inside(r, w));
  const inPrev = mine.filter((r) => inside(r, wp));
  const scorecards = [...new Map(inCur.map((r) => [r.scorecardId ?? '', r.scorecardName])).entries()].map(
    ([id, name]) => ({ id, name, list: inCur.filter((r) => (r.scorecardId ?? '') === id) }),
  );
  const sc = scorecards.some((s) => s.id === scorecard) ? scorecard : '';
  const ok = (r: ReviewRow) => (!sc || (r.scorecardId ?? '') === sc) && (!channel || r.channel === channel);
  const chBase = inCur.filter((r) => !sc || (r.scorecardId ?? '') === sc);
  const cur = inCur.filter(ok);
  const prev = inPrev.filter(ok);
  const teamList = agentView ? [] : all.filter((r) => u?.teamId && r.teamId === u.teamId && inside(r, w) && ok(r));
  const flagged = cur.filter((r) => r.flag === 'red' || r.flag === 'green');
  const disputeOf = useMemo(() => new Map(disputes.map((x) => [x.reviewId, x])), [disputes]);
  const disputed = cur.filter((r) => disputeOf.has(r.id));
  const pass = passRateOf(rates, u?.teamId ?? null);
  const general = passRateOf(rates, null);

  // an agent's team numbers come from the server (totals only)
  const from = w && Number.isFinite(w[0]) ? ymd(w[0]) : '';
  const to = w && Number.isFinite(w[1]) ? ymd(w[1]) : '';
  useEffect(() => {
    if (!agentView) return;
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (channel) query.set('channel', channel);
    if (sc) query.set('scorecardId', sc);
    api<TeamAverage>(`/team-average?${query.toString()}`, company.id).then(setServerTeam, () => setServerTeam(null));
  }, [agentView, company.id, from, to, channel, sc]);
  const teamAvg = agentView ? (serverTeam?.average ?? null) : averageScore(teamList);
  const teamCategory = (name: string): number | null =>
    agentView
      ? (serverTeam?.categories.find((c) => c.name === name)?.value ?? null)
      : average(teamList.map((r) => categoryValue(r, name)).filter((v): v is number => v !== null));

  // ---- the period's names (today's agLabel, agPrevLabel, agTitle)
  const month = (at: number) => new Date(at).toLocaleString(locale, { month: 'short' });
  const date = (at: number) =>
    new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const short = (at: number) => `${new Date(at).getDate()} ${month(at)}`;
  const quarter = (at: number) => `Q${Math.floor(new Date(at).getMonth() / 3) + 1}`;
  const label = (() => {
    if (!w) return '';
    const [a, b] = w;
    if (period === 'week') return t('agents.weekOf', { date: short(a) });
    if (period === 'month') return `${month(a)} ${new Date(a).getFullYear()}`;
    if (period === 'quarter') return `${quarter(a)} ${new Date(a).getFullYear()}`;
    if (period === 'year') return String(new Date(a).getFullYear());
    if (period === 'custom' && Number.isFinite(a)) return `${date(a)} - ${date(b - DAY)}`;
    return t('agents.allTime');
  })();
  const prevLabel = (() => {
    if (!wp) return '';
    const a = wp[0];
    if (period === 'week') return t('agents.lastWeek');
    if (period === 'month') return month(a);
    if (period === 'quarter') return quarter(a);
    if (period === 'year') return String(new Date(a).getFullYear());
    return t('agents.previousPeriod');
  })();

  // ---- the numbers of the cards
  const n = cur.length;
  const a = averageScore(cur);
  const pa = averageScore(prev);
  const passed = cur.filter((r) => isPass(r, rates)).length;
  const pc = n ? (passed / n) * 100 : null;
  const pp = prev.length ? (prev.filter((r) => isPass(r, rates)).length / prev.length) * 100 : null;
  const red = flagged.filter((r) => r.flag === 'red').length;
  const green = flagged.length - red;
  const diff = n && a !== null && teamAvg !== null ? a - teamAvg : null;

  const colourOf = (v: number) => BAND_TEXT[band(v, rates, u?.teamId ?? null)];
  const delta = (d: number | null, unit: string) => {
    if (d === null || !prevLabel) return null;
    const flat = Math.abs(d) < 0.05;
    return (
      <small className={`text-xs ${flat ? 'text-mu' : d > 0 ? 'text-ok' : 'text-bad'}`}>
        {flat ? '=' : d > 0 ? '↑' : '↓'}{' '}
        {t('agents.vs', { value: `${Math.abs(d).toFixed(1)}${unit}`, label: prevLabel })}
      </small>
    );
  };
  const kpi = (title: string, value: ReactNode, tone: string, sub: ReactNode, extra?: ReactNode, icon?: ReactNode) => (
    <div className={`${card} !p-4 grid content-start gap-1`}>
      <div className="flex items-center justify-between text-sm">
        <span>{title}</span>
        {icon}
      </div>
      <b className={`font-display text-3xl ${tone}`}>{value}</b>
      <small className="text-xs text-mu">{sub || ' '}</small>
      {extra}
    </div>
  );

  async function exportExcel() {
    if (!u || !cur.length) return;
    setExporting(true);
    await run(async () => {
      const file = await apiFile('/reviews/export', company.id, {
        ids: cur.map((r) => r.id),
        name: u.name.slice(0, 30),
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `${u.name.replace(/[^\p{L}\p{N} _-]/gu, '')}_${ymd(Date.now())}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('list.export'));
    setExporting(false);
  }

  // ---- the categories (Performance tab and the report)
  const rows = categoryNames(cur)
    .map((name) => {
      const scored = cur.flatMap((r) => r.categories.filter((c) => c.name === name && c.possible > 0));
      return {
        name,
        n: scored.length,
        a: average(cur.map((r) => categoryValue(r, name)).filter((v): v is number => v !== null)),
        t: teamCategory(name),
        e: average(scored.map((c) => c.earned)) ?? 0,
        m: average(scored.map((c) => c.possible)) ?? 0,
      };
    })
    .filter((r): r is typeof r & { a: number } => r.a !== null);

  function report() {
    if (!u) return;
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
    const sorted = [...rows].sort((x, y) => y.a - x.a);
    // the sessions of the period, as the One-to-One tab counts them
    const held = work.sessions.filter(
      (s) =>
        s.agents.some((x) => x.id === u.membershipId) &&
        w !== null &&
        new Date(`${s.heldOn}T12:00:00`).getTime() >= w[0] &&
        new Date(`${s.heldOn}T12:00:00`).getTime() < w[1],
    );
    const strong = sorted.slice(0, 3);
    const weak = [...sorted]
      .reverse()
      .slice(0, 3)
      .filter((r) => r.a < general);
    const li = (r: (typeof rows)[number]) =>
      `<li><b>${esc(r.name)}</b>: ${Math.round(r.a)}%${r.t !== null ? ` (${esc(t('agents.report.team'))} ${Math.round(r.t)}%)` : ''}</li>`;
    const recent = [...cur].sort((x, y) => dayOf(y) - dayOf(x)).slice(0, 12);
    const html =
      `<!doctype html><meta charset=utf-8><title>${esc(t('agents.report.title', { name: u.name }))}</title>` +
      '<style>body{font:14px/1.5 system-ui,sans-serif;max-width:780px;margin:30px auto;color:#0f1b2d;padding:0 20px}h1{margin:0}h2{margin:26px 0 8px;font-size:16px;border-bottom:1px solid #e3e8ef;padding-bottom:4px}.k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k div{border:1px solid #e3e8ef;border-radius:10px;padding:10px}.k b{display:block;font-size:22px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px 6px;border-bottom:1px solid #e3e8ef}small{color:#5f6f86}</style>' +
      `<h1>${esc(u.name)}</h1><small>${esc(u.teamName ?? '')} · ${esc(label)} · ${esc(t('agents.report.created', { date: new Date().toLocaleString(locale) }))}</small>` +
      `<h2>${esc(t('agents.report.summary'))}</h2><div class=k><div><small>${esc(t('agents.report.average'))}</small><b>${a !== null ? `${Math.round(a)}%` : '-'}</b></div><div><small>${esc(t('agents.report.pass'))}</small><b>${pc !== null ? `${Math.round(pc)}%` : '-'}</b></div><div><small>${esc(t('agents.report.reviews'))}</small><b>${n}</b></div><div><small>${esc(t('agents.report.flags'))}</small><b>${red} / ${green}</b></div></div>` +
      `<h2>${esc(t('agents.report.strengths'))}</h2><ul>${strong.map(li).join('') || `<li>${esc(t('agents.report.noData'))}</li>`}</ul>` +
      `<h2>${esc(t('agents.report.focus'))}</h2><ul>${weak.map(li).join('') || `<li>${esc(t('agents.report.allAbove'))}</li>`}</ul>` +
      `<h2>${esc(t('agents.report.categories'))}</h2><table><tr><th>${esc(t('agents.report.category'))}</th><th>${esc(t('agents.report.agent'))}</th><th>${esc(t('agents.report.team'))}</th></tr>${sorted.map((r) => `<tr><td>${esc(r.name)}</td><td>${Math.round(r.a)}%</td><td>${r.t === null ? '-' : `${Math.round(r.t)}%`}</td></tr>`).join('')}</table>` +
      `<h2>${esc(t('agents.report.disputesTitle'))}</h2><p>${esc(t('agents.report.disputes', { count: disputed.length }))}</p>` +
      `<h2>${esc(t('agents.report.coachingTitle'))}</h2><p>${esc(t('agents.report.coaching', { o2o: held.filter((s) => s.kind === 'o2o').length, coach: held.filter((s) => s.kind !== 'o2o').length }))}</p>` +
      `<h2>${esc(t('agents.report.recent'))}</h2><table><tr><th>${esc(t('agents.report.lead'))}</th><th>${esc(t('agents.report.date'))}</th><th>${esc(t('agents.report.score'))}</th></tr>${recent.map((r) => `<tr><td>${esc(r.leadId)}</td><td>${esc(r.reviewedOn)}</td><td>${r.score ?? 0}%</td></tr>`).join('')}</table>` +
      `<p><small>${esc(t('agents.report.note'))}</small></p>`;
    const win = window.open('', '_blank');
    if (!win) {
      fail(new Error(t('agents.report.popup')));
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }

  // ---- the page
  const title = agentView ? t('agents.myTitle') : t('menu.pages.agents');
  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{title}</h1>
        <p className="text-sm text-mu">{t('agents.intro')}</p>
      </div>
      {u && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallButton} onClick={report} disabled={!reviews}>
            {t('agents.reportPdf')}
          </button>
          <button
            type="button"
            className={smallButton}
            onClick={() => void exportExcel()}
            disabled={exporting || !cur.length}
          >
            {exporting ? t('list.exporting') : t('list.export')}
          </button>
        </div>
      )}
    </div>
  );
  if (!reviews)
    return (
      <section className="grid gap-4">
        {head}
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );
  if (!u)
    return (
      <section className="grid gap-4">
        {head}
        <p className={`${card} text-mu`}>{company.role === 'lead' ? t('agents.noneLead') : t('agents.none')}</p>
      </section>
    );

  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${on ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`;
  const pick = (k: 'agent' | 'team', v: string) => {
    setPage(1);
    setScorecard('');
    if (k === 'agent') {
      setAgent(v);
      setQ('');
      if (search.agent) void navigate({ to: '/$app/$page', params: { app: 'quality', page: 'agents' }, search: {} });
    } else {
      setTeam(v);
      const left = options.filter((x) => !v || x.teamId === v);
      if (!left.some((x) => x.membershipId === u.membershipId)) setAgent(left[0]?.membershipId ?? '');
    }
  };
  const teamsWithAgents = teams.filter((x) => options.some((o) => o.teamId === x.id));

  const filters = (
    <div className={`${card} grid gap-3`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid flex-1 gap-1 text-sm font-medium min-w-52">
          {t('agents.search')}
          <input
            type="search"
            className={field}
            placeholder={t('agents.searchPlaceholder')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
              if (e.target.value) setTab('calls');
            }}
          />
        </label>
        {!agentView && (
          <>
            <label className="grid gap-1 text-sm font-medium">
              {t('agents.team')}
              <select className={field} value={team} onChange={(e) => pick('team', e.target.value)}>
                <option value="">{t('agents.allTeams')}</option>
                {teamsWithAgents.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('agents.agent')}
              <select className={field} value={u.membershipId} onChange={(e) => pick('agent', e.target.value)}>
                {inTeam.map((x) => (
                  <option key={x.membershipId} value={x.membershipId}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="grid gap-1 text-sm font-medium">
          {t('agents.period')}
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('agents.period')}>
            {[...PERIODS, 'custom' as const].map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                className={chip(period === p)}
                onClick={() => {
                  setPeriod(p);
                  setPage(1);
                }}
              >
                {t(`agents.periods.${p}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm font-medium">
            {t('agents.from')}
            <input
              type="date"
              className={field}
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('agents.to')}
            <input
              type="date"
              className={field}
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </label>
        </div>
      )}
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-mu">
          {t('agents.reviewType')} <span className="normal-case tracking-normal">{t('agents.reviewTypeNote')}</span>
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('agents.reviewType')}>
          {(['', ...CHANNELS] as const).map((c) => {
            const l = chBase.filter((r) => !c || r.channel === c);
            const v = averageScore(l);
            return (
              <button
                key={c || 'all'}
                type="button"
                aria-pressed={channel === c}
                className={`${chip(channel === c)} ${l.length ? '' : 'opacity-55'}`}
                onClick={() => {
                  setChannel(c);
                  setPage(1);
                }}
              >
                {c ? t(`reviews.channels.${c}`) : t('agents.allTypes')} <b>({l.length})</b>
                {v !== null && <b className={`font-mono ${colourOf(v)}`}>{Math.round(v)}%</b>}
              </button>
            );
          })}
        </div>
      </div>
      {scorecards.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-mu">
            {t('agents.scorecardFilter')}{' '}
            <span className="normal-case tracking-normal">
              {t('agents.scorecardCount', { count: scorecards.length })}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('agents.scorecardFilter')}>
            <button
              type="button"
              aria-pressed={!sc}
              className={chip(!sc)}
              onClick={() => {
                setScorecard('');
                setPage(1);
              }}
            >
              {t('agents.all')} <b>({inCur.length})</b>
            </button>
            {scorecards.map((s) => {
              const v = averageScore(s.list) ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sc === s.id}
                  className={chip(sc === s.id)}
                  title={s.name}
                  onClick={() => {
                    setScorecard(s.id);
                    setPage(1);
                  }}
                >
                  <span className="max-w-48 truncate">{s.name}</span> <b>({s.list.length})</b>
                  <b className={`font-mono ${colourOf(v)}`}>{Math.round(v)}%</b>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const selected = sc ? scorecards.find((s) => s.id === sc)?.name : '';
  const profile = (
    <div className={`${card} flex flex-wrap items-center gap-4`}>
      <span
        className="grid size-13 place-items-center rounded-full bg-ac/15 text-lg font-bold text-ac"
        aria-hidden="true"
      >
        {u.name
          .split(' ')
          .map((x) => x[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <div className="grid gap-1">
        <b className="text-2xl">{u.name}</b>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {u.teamName && <TeamLink id={u.teamId} name={u.teamName} />}
          <small className="text-mu">
            {t('agents.reviewCount', { count: n })} • {label}
          </small>
          {selected && <span className="rounded-full bg-pn2 border border-bd px-2 text-xs">{selected}</span>}
        </div>
      </div>
    </div>
  );

  const kpis = (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {kpi(
        t('agents.kpi.avg'),
        a !== null ? `${Math.round(a)}%` : '-',
        a !== null ? colourOf(a) : '',
        label,
        a !== null && pa !== null ? delta(a - pa, t('agents.pts')) : null,
      )}
      {kpi(
        t('agents.kpi.teamAvg'),
        teamAvg !== null ? `${Math.round(teamAvg)}%` : '-',
        '',
        u.teamName ?? '-',
        diff === null ? (
          agentView && serverTeam && serverTeam.average === null ? (
            <small className="text-xs text-mu">{t('agents.kpi.teamFew')}</small>
          ) : null
        ) : (
          <small className={`text-xs ${Math.abs(diff) < 0.05 ? 'text-mu' : diff > 0 ? 'text-ok' : 'text-bad'}`}>
            {Math.abs(diff) < 0.05
              ? t('agents.kpi.onPar')
              : diff > 0
                ? t('agents.kpi.above', { value: Math.abs(diff).toFixed(1) })
                : t('agents.kpi.below', { value: Math.abs(diff).toFixed(1) })}
          </small>
        ),
      )}
      {kpi(
        t('agents.kpi.pass'),
        pc !== null ? `${Math.round(pc)}%` : '-',
        pc !== null ? colourOf(pc) : '',
        t('agents.kpi.passedFailed', { passed, failed: n - passed }),
        pc !== null && pp !== null ? delta(pc - pp, '%') : null,
      )}
      {kpi(
        channel ? t(`agents.kpi.totals.${channel}`) : t('agents.kpi.total'),
        n,
        '',
        t('agents.kpi.scored', { count: n }),
        n && prev.length ? delta(((n - prev.length) / prev.length) * 100, '%') : null,
      )}
      {kpi(
        t('agents.kpi.red'),
        red,
        'text-bad',
        '',
        null,
        <span className="text-bad" aria-hidden="true">
          ⚑
        </span>,
      )}
      {kpi(
        t('agents.kpi.green'),
        green,
        'text-ok',
        '',
        null,
        <span className="text-ok" aria-hidden="true">
          ⚑
        </span>,
      )}
    </div>
  );

  const tabs: [Tab, string, number | null][] = [
    ['perf', t('agents.tabs.perf'), null],
    ['calls', t('agents.tabs.calls'), n],
    ['flags', t('agents.tabs.flags'), flagged.length],
    [
      'o2o',
      t('agents.tabs.o2o'),
      work.sessions.filter(
        (s) =>
          s.kind === 'o2o' &&
          s.agents.some((a) => a.id === u.membershipId) &&
          w !== null &&
          new Date(`${s.heldOn}T12:00:00`).getTime() >= w[0] &&
          new Date(`${s.heldOn}T12:00:00`).getTime() < w[1],
      ).length,
    ],
    [
      'growth',
      t('agents.tabs.growth'),
      growth.plans.filter((p) => p.agentId === u.membershipId && planOpen(p)).length +
        growth.goals.filter((g) => g.scope === 'agent' && g.agentId === u.membershipId).length,
    ],
  ];
  const body =
    tab === 'perf' ? (
      <Performance rows={rows} label={label} general={general} />
    ) : tab === 'calls' ? (
      <ReviewsTab
        list={cur}
        all={mine}
        window={w}
        period={period}
        label={label}
        pass={pass}
        rates={rates}
        teamId={u.teamId}
        disputed={disputeOf}
        q={q}
        setQ={(v) => {
          setQ(v);
          setPage(1);
        }}
        sort={sort}
        setSort={(s) => {
          setSort(s);
          setPage(1);
        }}
        page={page}
        setPage={setPage}
        perPage={perPage}
        setPerPage={setPerPage}
        locale={locale}
        now={now}
        onZoom={(from, to) => {
          setPeriod('custom');
          setCustom({ from, to });
          setPage(1);
        }}
        onOpen={(id) => void navigate({ to: '/review/$id', params: { id } })}
      />
    ) : tab === 'flags' ? (
      <Flags flagged={flagged} disputed={disputed} disputeOf={disputeOf} label={label} />
    ) : tab === 'o2o' ? (
      <CoachingTab agent={u} sessions={work.sessions} tasks={work.tasks} window={w} label={label} />
    ) : (
      <Growth agent={u} growth={growth} agentView={agentView} />
    );

  return (
    <section className="grid gap-4" aria-labelledby="agents-title">
      <span id="agents-title" className="sr-only">
        {title}
      </span>
      {head}
      <Notice message={message} />
      {filters}
      {profile}
      {kpis}
      <div className={`${card} grid gap-4`}>
        <div className="flex flex-wrap gap-1 border-b border-bd pb-2" role="tablist">
          {tabs.map(([k, name, count]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`rounded-s px-3 py-1.5 text-sm ${tab === k ? 'bg-pn2 font-semibold text-tx' : 'text-mu hover:text-tx'}`}
              onClick={() => setTab(k)}
            >
              {name}
              {count !== null && <span className="ml-1.5 rounded-full bg-bd/60 px-1.5 text-xs">{count}</span>}
            </button>
          ))}
        </div>
        <div role="tabpanel">{body}</div>
      </div>
    </section>
  );
}

/** Performance: the categories, agent against team (radar, breakdown, comparison). */
function Performance({
  rows,
  label,
  general,
}: {
  rows: { name: string; n: number; a: number; t: number | null; e: number; m: number }[];
  label: string;
  general: number;
}) {
  const { t } = useTranslation();
  if (!rows.length) return <Empty>{t('agents.perf.none', { label })}</Empty>;
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <h3 className="font-semibold">{t('agents.perf.radarTitle')}</h3>
          {rows.length >= 3 ? (
            <Radar
              names={rows.map((r) => r.name)}
              series={[
                { label: t('agents.perf.agent'), values: rows.map((r) => r.a), color: 'var(--series-1)' },
                { label: t('agents.perf.teamAverage'), values: rows.map((r) => r.t), color: 'var(--series-2)' },
              ]}
              title={t('agents.perf.radarTitle')}
            />
          ) : (
            <Empty>{t('agents.perf.notEnough')}</Empty>
          )}
        </div>
        <div className="grid content-start gap-3">
          <h3 className="font-semibold">{t('agents.perf.breakdown')}</h3>
          {rows.map((r) => {
            const lv = level(r.a, general);
            const tone = LEVEL_TONE[lv];
            return (
              <div key={r.name} className="grid gap-1">
                <div className="flex justify-between gap-2 text-sm">
                  <b>{r.name}</b>
                  <b className={`font-mono ${BAND_TEXT[tone]}`}>
                    {Math.round(r.e)}/{Math.round(r.m)}
                  </b>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sunk">
                  <div
                    className={`h-full rounded-full ${BAND_FILL[tone]}`}
                    style={{ width: `${Math.min(100, r.a)}%` }}
                  />
                </div>
                <small className="text-xs text-mu">
                  {t(`agents.perf.levels.${lv}`)} ({Math.round(r.a)}%)
                </small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid gap-3">
        <h3 className="font-semibold">{t('agents.perf.compare')}</h3>
        {rows.map((r) => {
          const d = r.t === null ? null : Math.round(r.a) - Math.round(r.t);
          const tone = LEVEL_TONE[level(r.a, general)];
          return (
            <div key={r.name} className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <b>{r.name}</b> <small className="text-mu">{t('agents.perf.evals', { count: r.n })}</small>
                </span>
                <span className="flex items-center gap-3">
                  <small>
                    {t('agents.perf.agent')}: <b className="font-mono">{Math.round(r.a)}%</b>
                  </small>
                  <small>
                    {t('agents.perf.team')}: <b className="font-mono">{r.t === null ? '-' : `${Math.round(r.t)}%`}</b>
                  </small>
                  {d !== null && (
                    <span className={`rounded-full px-2 text-xs font-semibold ${BAND_SOFT[d >= 0 ? 'ok' : 'bad']}`}>
                      {d >= 0 ? '+' : ''}
                      {d}%
                    </span>
                  )}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-sunk">
                <div className={`h-full rounded-full ${BAND_FILL[tone]}`} style={{ width: `${Math.min(100, r.a)}%` }} />
                {r.t !== null && (
                  <span
                    className="absolute -top-1 h-4 w-0.5 rounded-full bg-tx"
                    style={{ left: `${Math.min(100, r.t)}%` }}
                    title={t('agents.perf.teamMark', { value: Math.round(r.t) })}
                  />
                )}
              </div>
            </div>
          );
        })}
        <small className="flex items-center gap-1.5 text-xs text-mu">
          <span className="inline-block h-3 w-0.5 rounded-full bg-tx" aria-hidden="true" /> {t('agents.perf.markNote')}
        </small>
      </div>
    </div>
  );
}

type SortKey = 'lead' | 'campaign' | 'date' | 'score';

/** Reviews & Trends: the score chart (a column per day, week or month) and the agent's reviews. */
function ReviewsTab(props: {
  list: ReviewRow[];
  all: ReviewRow[];
  window: Window | null;
  period: CalendarPeriod;
  label: string;
  pass: number;
  rates: PassRates | null;
  teamId: string | null;
  disputed: Map<string, Dispute>;
  q: string;
  setQ: (v: string) => void;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  page: number;
  setPage: (p: number) => void;
  perPage: number;
  setPerPage: (p: number) => void;
  locale: string;
  now: number;
  onZoom: (from: string, to: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { list, period, label, pass, rates, teamId, locale } = props;
  const month = (at: number) => new Date(at).toLocaleString(locale, { month: 'short' });
  const dm = (at: number) => `${new Date(at).getDate()} ${month(at)}`;

  // the window of the chart: "all time" runs from the first month with a review to today
  let win: Window | null = props.window;
  if (period === 'all' || !win || !Number.isFinite(win[0])) {
    const days = props.all.map((r) => dayOf(r));
    const first = days.length ? Math.min(...days) : props.now;
    const start = new Date(first);
    win = [new Date(start.getFullYear(), start.getMonth(), 1).getTime(), Math.max(props.now, ...days) + DAY];
  }
  const span = Math.round((win[1] - win[0]) / DAY);
  const buckets: (Bucket & { reviews: ReviewRow[] })[] = chartBuckets(win, period).map((b) => ({
    ...b,
    reviews: list.filter((r) => {
      const at = dayOf(r);
      return at >= b.from && at < b.to;
    }),
  }));
  const longOf = (b: Bucket) =>
    b.unit === 'month'
      ? new Date(b.from).toLocaleString(locale, { month: 'long', year: 'numeric' })
      : b.unit === 'day'
        ? new Date(b.from).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
        : `${dm(b.from)} - ${dm(b.to - DAY)}`;
  const columns: ScoreColumn[] = buckets.map((b) => ({
    key: String(b.from),
    label:
      b.unit === 'month'
        ? `${month(b.from)}${span > 400 ? ` '${String(new Date(b.from).getFullYear()).slice(2)}` : ''}`
        : b.unit === 'monthWeek'
          ? t('agents.calls.week', { n: b.week })
          : b.unit === 'day'
            ? new Date(b.from).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
            : dm(b.from),
    long: longOf(b),
    average: averageScore(b.reviews),
    count: b.reviews.length,
  }));
  const tip = (i: number) => {
    const b = buckets[i];
    if (!b) return null;
    const l = b.reviews;
    if (!l.length)
      return (
        <>
          <b className="block">{longOf(b)}</b>
          <span className="text-mu">{t('agents.tip.none')}</span>
        </>
      );
    const avg = averageScore(l) ?? 0;
    const cats = categoryNames(l)
      .map((name) => ({
        name,
        v: average(l.map((r) => categoryValue(r, name)).filter((v): v is number => v !== null)),
      }))
      .filter((c): c is { name: string; v: number } => c.v !== null);
    const row = (k: string, v: ReactNode) => (
      <div className="flex justify-between gap-4">
        <span className="text-mu">{k}</span>
        {v}
      </div>
    );
    const tone = (v: number) => BAND_TEXT[band(v, rates, teamId)];
    return (
      <div className="grid gap-0.5 min-w-52">
        <b>{longOf(b)}</b>
        {row(t('agents.tip.average'), <b className={`font-mono ${tone(avg)}`}>{avg.toFixed(1)}%</b>)}
        {row(t('agents.tip.reviews'), <b className="font-mono">{l.length}</b>)}
        {row(
          t('agents.tip.pass'),
          <b className="font-mono">{Math.round((l.filter((r) => isPass(r, rates)).length / l.length) * 100)}%</b>,
        )}
        {cats.length > 0 && (
          <div className="mt-1 grid gap-0.5 border-t border-bd pt-1">
            <small className="text-xs text-mu">{t('agents.tip.categories')}</small>
            {cats.map((c) => (
              <div key={c.name} className="flex justify-between gap-4 text-xs">
                <span>{c.name}</span>
                <b className={`font-mono ${tone(c.v)}`}>{Math.round(c.v)}%</b>
              </div>
            ))}
          </div>
        )}
        <small className="mt-1 text-xs text-mu">{t('agents.tip.click')}</small>
      </div>
    );
  };
  // a click zooms into the period (a day with one review opens it), as today
  const zoom = (i: number) => {
    const b = buckets[i];
    if (!b?.reviews.length) return;
    const only = b.reviews[0];
    if (b.to - b.from <= DAY + 36e5 && b.reviews.length === 1 && only) return props.onOpen(only.id);
    props.onZoom(ymd(b.from), ymd(b.to - DAY));
  };

  // the table of reviews: its own search, sorting and pages
  const campaignOf = (r: ReviewRow) => r.campaign || 'general';
  const needle = props.q.trim().toLowerCase();
  const by: Record<SortKey, (r: ReviewRow) => string | number> = {
    lead: (r) => r.leadId.toLowerCase(),
    campaign: (r) => campaignOf(r).toLowerCase(),
    date: (r) => dayOf(r),
    score: (r) => r.score ?? 0,
  };
  const key = by[props.sort.key];
  const shown = list
    .filter((r) => !needle || r.leadId.toLowerCase().includes(needle) || campaignOf(r).toLowerCase().includes(needle))
    .sort((x, y) => {
      const a = key(x);
      const b = key(y);
      return (a > b ? 1 : a < b ? -1 : 0) * props.sort.dir;
    });
  const { slice } = pageOf(shown, props.page, props.perPage);
  const sortable = (k: SortKey, name: string) => (
    <th
      className="py-1 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-mu"
      aria-sort={props.sort.key === k ? (props.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() =>
          props.setSort(
            props.sort.key === k
              ? { key: k, dir: props.sort.dir > 0 ? -1 : 1 }
              : { key: k, dir: k === 'date' || k === 'score' ? -1 : 1 },
          )
        }
      >
        {name}{' '}
        <span aria-hidden="true" className={props.sort.key === k ? '' : 'opacity-40'}>
          {props.sort.key === k ? (props.sort.dir > 0 ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
  const plain = 'py-1 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-mu';
  const titles = {
    week: t('agents.titles.week'),
    month: t('agents.titles.month'),
    quarter: t('agents.titles.quarter'),
    year: t('agents.titles.year'),
    all: t('agents.titles.all'),
    custom: t('agents.titles.custom'),
  };
  return (
    <div className="grid gap-4">
      <h3 className="font-semibold">{t('agents.calls.evolution', { title: titles[period] })}</h3>
      {list.length ? (
        <ScoreColumns
          columns={columns}
          pass={pass}
          title={t('agents.calls.evolution', { title: titles[period] })}
          tip={tip}
          onPick={zoom}
        />
      ) : (
        <Empty>{t('agents.calls.none', { label })}</Empty>
      )}
      <label className="grid max-w-80 gap-1 text-sm font-medium">
        <span className="sr-only">{t('agents.search')}</span>
        <input
          type="search"
          className={field}
          placeholder={t('agents.calls.search')}
          value={props.q}
          onChange={(e) => props.setQ(e.target.value)}
        />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {sortable('lead', t('agents.calls.cols.lead'))}
              <th className={plain}>{t('agents.calls.cols.type')}</th>
              {sortable('campaign', t('agents.calls.cols.campaign'))}
              {sortable('date', t('agents.calls.cols.date'))}
              {sortable('score', t('agents.calls.cols.score'))}
              <th className={plain}>{t('agents.calls.cols.flag')}</th>
              <th className={plain}>{t('agents.calls.cols.status')}</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id} className="border-t border-bd">
                <td className="py-2 pr-3">
                  <ReviewLink r={r} />
                </td>
                <td className="py-2 pr-3">{t(`reviews.channels.${r.channel}`)}</td>
                <td className="py-2 pr-3">{campaignOf(r)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{r.reviewedOn}</td>
                <td className="py-2 pr-3">
                  <b className={`font-mono ${BAND_TEXT[band(r.score ?? 0, rates, r.teamId)]}`}>
                    {Math.round(r.score ?? 0)}%
                  </b>
                </td>
                <td className="py-2 pr-3">
                  {r.flag ? (
                    <span className={r.flag === 'red' ? 'text-bad' : 'text-ok'} title={t(`reviews.flags.${r.flag}`)}>
                      ⚑
                    </span>
                  ) : (
                    <span className="text-mu">-</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {props.disputed.has(r.id) ? (
                    <span className={`rounded-full px-2 text-xs font-semibold ${BAND_SOFT.wn}`}>
                      {t('agents.calls.disputed')}
                    </span>
                  ) : (
                    <span className={`rounded-full px-2 text-xs font-semibold ${BAND_SOFT.ok}`}>
                      {t('agents.calls.completed')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!slice.length && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-mu">
                  {t('agents.calls.noMatch')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager
        count={shown.length}
        page={props.page}
        perPage={props.perPage}
        onPage={props.setPage}
        onPerPage={props.setPerPage}
      />
    </div>
  );
}

const STATE_STYLE = { disputed: BAND_SOFT.bad, progress: 'bg-ac/15 text-ac', resolved: BAND_SOFT.ok } as const;

/** Flags: the agent's red and green flagged reviews, and their disputes. */
function Flags({
  flagged,
  disputed,
  disputeOf,
  label,
}: {
  flagged: ReviewRow[];
  disputed: ReviewRow[];
  disputeOf: Map<string, Dispute>;
  label: string;
}) {
  const { t } = useTranslation();
  const red = flagged.filter((r) => r.flag === 'red').length;
  const list = [...flagged].sort((a, b) => dayOf(b) - dayOf(a));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-bad">
          ⚑ <b>{t('agents.flags.red', { count: red })}</b>
        </span>
        <span className="text-ok">
          ⚑ <b>{t('agents.flags.green', { count: flagged.length - red })}</b>
        </span>
      </div>
      {list.length ? (
        <ul className="grid gap-1.5">
          {list.map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center gap-3 rounded-s border-l-4 bg-pn2 px-3 py-2 text-sm ${r.flag === 'red' ? 'border-bad' : 'border-ok'}`}
            >
              <span className={r.flag === 'red' ? 'text-bad' : 'text-ok'} aria-label={t(`reviews.flags.${r.flag}`)}>
                ⚑
              </span>
              <span>
                {t('agents.flags.lead')} <ReviewLink r={r} />
              </span>
              <small className="text-mu">
                {t('agents.flags.qaReview')}
                {r.comment ? ` · ${r.comment.slice(0, 80)}` : ''}
              </small>
              <small className="ml-auto text-mu">{r.reviewedOn}</small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('agents.flags.none', { label })}</Empty>
      )}
      {disputed.length > 0 && (
        <div className="grid gap-1.5 pt-3">
          <h3 className="flex items-center gap-2 font-semibold">
            {t('agents.flags.disputes')}
            <span className="rounded-full bg-bd/60 px-1.5 text-xs">{disputed.length}</span>
          </h3>
          {disputed.map((r) => {
            const d = disputeOf.get(r.id);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-s bg-pn2 px-3 py-2 text-sm">
                <span>
                  {t('agents.flags.lead')} <ReviewLink r={r} />
                </span>
                <small className="text-mu">
                  {t('agents.flags.disputedOn', {
                    date: d ? d.openedAt.slice(0, 10) : '',
                    score: Math.round(r.score ?? 0),
                  })}
                </small>
                {d && (
                  <span className={`ml-auto rounded-full px-2 text-xs font-semibold ${STATE_STYLE[d.state]}`}>
                    {t(`disputes.states.${d.state}`)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Growth: everything from Performance about this agent (today's agGrowthTab): this month's goals, improvement plans, kudos. */
function Growth({
  agent,
  growth,
  agentView,
}: {
  agent: PersonRow;
  growth: { goals: Goal[]; plans: Plan[]; kudos: Kudos[] };
  agentView: boolean;
}) {
  const { t } = useTranslation();
  const goals = growth.goals.filter(
    (g) =>
      g.scope === 'all' ||
      (g.scope === 'team' && g.teamId === agent.teamId) ||
      (g.scope === 'agent' && g.agentId === agent.membershipId),
  );
  const plans = growth.plans.filter((p) => p.agentId === agent.membershipId);
  const kudos = growth.kudos.filter((k) => k.toId === agent.membershipId);
  const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  const stat = (value: string | number, name: string, look: string) => (
    <div className="rounded-s bg-pn2 p-3">
      <b className={`font-display text-2xl ${look}`}>{value}</b>
      <small className="block text-xs text-mu">{name}</small>
    </div>
  );
  const page = (id: string, text: string) => (
    <Link
      to="/$app/$page"
      params={{ app: 'quality', page: id }}
      className="text-sm font-medium text-ac hover:underline"
    >
      {text} ›
    </Link>
  );
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-2">
        {stat(
          `${goals.filter((g) => g.state === 'met').length}/${goals.length}`,
          t('agents.growth.goalsMet'),
          'text-ok',
        )}
        {stat(plans.filter(planOpen).length, t('agents.growth.activePlans'), 'text-wn')}
        {stat(kudos.length, t('agents.growth.kudos'), '')}
      </div>
      <div className="grid gap-2">
        <h3 className="flex items-center gap-3 font-semibold">
          {t('agents.growth.goals', { month: monthName(month) })} {page('goals-and-kpis', t('topics.open'))}
        </h3>
        {goals.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {goals.map((g) => (
              <GoalCard key={g.id} g={g} />
            ))}
          </div>
        ) : (
          <Empty>{t('agents.growth.noGoals')}</Empty>
        )}
      </div>
      <div className="grid gap-2">
        <h3 className="flex items-center gap-3 font-semibold">
          {t('menu.pages.pips')} {page('improvement-plans', t('topics.open'))}
        </h3>
        {plans.length ? plans.map((p) => <PlanRow key={p.id} p={p} />) : <Empty>{t('agents.growth.noPlans')}</Empty>}
      </div>
      <div className="grid gap-2">
        <h3 className="flex items-center gap-3 font-semibold">
          {t('agents.growth.kudosTitle')} {page('recognition', t('topics.open'))}
        </h3>
        {kudos.length ? (
          kudos.slice(0, 6).map((k) => (
            <div key={k.id} className="flex items-start gap-3 rounded-s bg-pn2 px-3 py-2 text-sm">
              <span className="text-xl" aria-hidden="true">
                {k.badge}
              </span>
              <span className="grid flex-1">
                <b>{k.byName}</b>
                <span>{k.text}</span>
              </span>
              <small className="text-mu">{k.createdAt.slice(0, 10)}</small>
            </div>
          ))
        ) : (
          <Empty>{agentView ? t('agents.growth.noKudosMine') : t('agents.growth.noKudos')}</Empty>
        )}
      </div>
    </div>
  );
}
