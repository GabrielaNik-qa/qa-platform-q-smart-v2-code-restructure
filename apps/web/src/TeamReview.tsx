// Quality › Analytics › Team Review (today's analytics.js `PG.team`): one card per team (its numbers, category scores,
// best agents, agents who need help, the last 8 weeks) and every agent ranked. Three views, each person's choice saved
// with their account: Cards, Compact (every card folded to its key numbers) and Table (one row per team). Staff see the
// teams of their workspaces, admins every team. Counted with the shared rules (packages/shared/src/stats.ts): rolling
// periods as today (the last 7, 30 or 365 days), each review for the team the agent was in when it was reviewed.
import { averageScore, inWindow, isPass, passRateOf, type Period, periodWindow, share } from '@qsmart/shared';
import { useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiFile } from './api';
import { AgentLink, band, BAND_SOFT, BAND_TEXT, Bar, colour, Empty, Table, TeamLink } from './bits';
import type { PassRates, ReviewRow } from './QAEntry';
import { useSession } from './session';
import { card, type CompanyRef, field, Notice, type PersonRow, smallButton, type TeamRow, useAction } from './ui';

const CHANNELS = ['call', 'chat', 'email', 'other'] as const;
type View = 'cards' | 'compact' | 'table';
const PERIODS: Period[] = ['week', 'month', 'year', 'all'];
const DAY = 864e5;
const pct1 = (v: number) => `${v.toFixed(1)}%`;

/** today's ↗ 1.2 / ↘ 0.8 pill: the period's average against the period before */
function TrendPill({ value }: { value: number | null }) {
  if (value === null) return <small className="text-mu">-</small>;
  return (
    <span
      className={`rounded-full px-2 text-xs font-semibold whitespace-nowrap ${BAND_SOFT[value >= 0 ? 'ok' : 'bad']}`}
    >
      {value >= 0 ? '↗' : '↘'} {Math.abs(value).toFixed(1)}
    </span>
  );
}

export function TeamReview({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { me, reloadMe } = useSession();
  const search = useSearch({ from: '/$app/$page' });
  const { message, run, fail } = useAction();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [channel, setChannel] = useState('');
  const [team, setTeam] = useState(search.team ?? '');
  const [period, setPeriod] = useState<Period>('month');
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const view = (me.prefs.choices?.['team.view'] as View | undefined) ?? 'cards';
  const agentsOpen = me.prefs.choices?.['team.agents'] !== 'closed';

  useEffect(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id),
      api<PassRates>('/pass-rates', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<PersonRow[]>('/people', company.id),
    ]).then(([r, pr, tm, ppl]) => {
      setNow(Date.now());
      setReviews(r);
      setRates(pr);
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl);
    }, fail);
  }, [company.id, fail]);
  useEffect(() => {
    if (search.team) setTeam(search.team);
  }, [search.team]);

  // the views are saved with the account, so they're the same on every computer
  const choose = (key: string, value: string) =>
    void api('/me/prefs', undefined, {
      method: 'PUT',
      body: { ...me.prefs, choices: { ...me.prefs.choices, [key]: value } },
    }).then(reloadMe, fail);

  // the teams a person reaches: the server sends only theirs (admins: all)
  const reached = teams.filter(
    (x) => people.some((p) => p.teamId === x.id) || (reviews ?? []).some((r) => r.teamId === x.id),
  );
  const shownTeams = reached.filter((x) => !team || x.id === team);
  const win = periodWindow(period, now) ?? [-Infinity, Infinity];
  const before = periodWindow(period, now, undefined, true);
  const filters = { channel: channel || undefined };
  const all = reviews ?? [];
  const cur = (teamId?: string, agentId?: string) => inWindow(all, win, { ...filters, teamId, agentId });
  const prev = (teamId?: string, agentId?: string) =>
    before ? inWindow(all, before, { ...filters, teamId, agentId }) : [];
  const change = (now: ReviewRow[], then: ReviewRow[]) => {
    const a = averageScore(now);
    const b = averageScore(then);
    return now.length && then.length && a !== null && b !== null ? a - b : null;
  };

  // ---- every agent of the shown teams (by the team they are in today), best first
  const rows = people
    .filter((p) => p.role === 'agent' && shownTeams.some((x) => x.id === p.teamId))
    .map((p) => {
      const l = cur(undefined, p.membershipId);
      return {
        p,
        n: l.length,
        av: averageScore(l) ?? 0,
        pc: share(l, (r) => isPass(r, rates)) ?? 0,
        tr: change(l, prev(undefined, p.membershipId)),
        red: l.filter((r) => r.flag === 'red').length,
      };
    })
    .sort((a, b) => b.av - a.av);
  const target = (teamId: string | null) => passRateOf(rates, teamId);
  const everything = shownTeams.flatMap((x) => cur(x.id));
  const aa = averageScore(everything);
  const ap = share(everything, (r) => isPass(r, rates));
  const withReviews = rows.filter((r) => r.n);

  async function exportExcel() {
    setExporting(true);
    await run(async () => {
      const file = await apiFile('/reviews/export', company.id, {
        ids: everything.map((r) => r.id),
        name: 'Team Review',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `Team_Review_${new Date().toLocaleDateString('sv-SE')}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('list.export'));
    setExporting(false);
  }

  const kpi = (title: string, value: ReactNode, sub: string, tone = '') => (
    <div className={`${card} !p-4 grid content-start gap-1`}>
      <span className="text-sm">{title}</span>
      <b className={`font-display text-3xl ${tone}`}>{value}</b>
      <small className="text-xs text-mu">{sub}</small>
    </div>
  );
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`;
  const Fold = ({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) => (
    <button
      type="button"
      className={`${smallButton} !px-1.5`}
      aria-expanded={open}
      title={open ? t('team.minimise') : t('team.expand')}
      aria-label={`${open ? t('team.minimise') : t('team.expand')}: ${label}`}
      onClick={onClick}
    >
      <span aria-hidden="true" className={`inline-block transition-transform ${open ? '' : '-rotate-90'}`}>
        ⌄
      </span>
    </button>
  );
  const reviewsWord = channel ? t(`team.channels.${channel}`) : t('team.reviews');

  // ---- one team's card
  const teamCard = (x: TeamRow) => {
    const l = cur(x.id);
    const a = averageScore(l);
    const p = share(l, (r) => isPass(r, rates));
    const mine = rows.filter((r) => r.p.teamId === x.id && r.n);
    const low = mine.filter((r) => r.av < target(x.id));
    const open = (view !== 'compact') !== folded.has(x.id);
    const cats = [...new Set(l.flatMap((r) => r.categories.map((c) => c.name)))]
      .map((name) => {
        const s = l.flatMap((r) => r.categories.filter((c) => c.name === name && c.possible > 0));
        if (!s.length) return null;
        const e = s.reduce((sum, c) => sum + c.earned, 0) / s.length;
        const m = s.reduce((sum, c) => sum + c.possible, 0) / s.length;
        return { name, e, m };
      })
      .filter((c): c is { name: string; e: number; m: number } => c !== null);
    const used = CHANNELS.filter((k) => l.some((r) => r.channel === k));
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const k = 7 - i;
      const w = inWindow(all, [now - (k + 1) * 7 * DAY, now - k * 7 * DAY], { ...filters, teamId: x.id });
      return { k, n: w.length, a: averageScore(w) };
    });
    const flip = () => {
      const next = new Set(folded);
      if (next.has(x.id)) next.delete(x.id);
      else next.add(x.id);
      setFolded(next);
    };
    return (
      <div key={x.id} className={`${card} grid content-start gap-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <i className="inline-block size-3 rounded-full" style={{ background: x.color }} aria-hidden="true" />
            {x.name}
          </h2>
          <span className="flex items-center gap-1.5">
            <TrendPill value={change(l, prev(x.id))} />
            <Fold open={open} onClick={flip} label={x.name} />
          </span>
        </div>
        <small className="text-mu">
          {t('team.cardLine', {
            lead: x.leadName ?? '-',
            count: rows.filter((r) => r.p.teamId === x.id).length,
            target: target(x.id),
          })}
        </small>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-s bg-pn2 p-2">
            <small className="block text-xs text-mu">{reviewsWord}</small>
            <b className="font-mono text-lg">{l.length}</b>
          </div>
          <div className="rounded-s bg-pn2 p-2">
            <small className="block text-xs text-mu">{t('team.avgScore')}</small>
            <b className={`font-mono text-lg ${a === null ? 'text-mu' : BAND_TEXT[band(a, rates, x.id)]}`}>
              {a === null ? '-' : pct1(a)}
            </b>
          </div>
          <div className="rounded-s bg-pn2 p-2">
            <small className="block text-xs text-mu">{t('team.passRate')}</small>
            <b className="font-mono text-lg">{p === null ? '-' : pct1(p)}</b>
          </div>
        </div>
        {open && (
          <>
            {!channel && used.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {used.map((k) => {
                  const z = l.filter((r) => r.channel === k);
                  return (
                    <span key={k} className="rounded-full border border-bd px-2 py-0.5 text-xs">
                      {t(`reviews.channels.${k}`)} {pct1(averageScore(z) ?? 0)} · {z.length}
                    </span>
                  );
                })}
              </div>
            )}
            {cats.length ? (
              <div className="grid gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-mu">{t('team.categoryScores')}</p>
                {cats.map((c) => {
                  const v = (c.e / c.m) * 100;
                  return (
                    <div
                      key={c.name}
                      className="flex justify-between gap-2 border-t border-bd py-1 text-sm first:border-t-0"
                    >
                      <span>{c.name}</span>
                      <b className={`font-mono ${BAND_TEXT[colour(v, passRateOf(rates, null))]}`}>
                        {Math.round(c.e)}/{Math.round(c.m)}
                      </b>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty>{t('team.noReviews')}</Empty>
            )}
            {mine.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid content-start gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-mu">{t('team.top')}</p>
                  {mine.slice(0, 3).map((r, i) => (
                    <div key={r.p.membershipId} className="flex justify-between gap-2 text-sm">
                      <span>
                        {i + 1}. <AgentLink id={r.p.membershipId} name={r.p.name} />
                      </span>
                      <b className="font-mono text-ok">{pct1(r.av)}</b>
                    </div>
                  ))}
                </div>
                <div className="grid content-start gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-mu">{t('team.needs')}</p>
                  {low.length ? (
                    low
                      .slice(-3)
                      .reverse()
                      .map((r) => (
                        <div key={r.p.membershipId} className="flex justify-between gap-2 text-sm">
                          <AgentLink id={r.p.membershipId} name={r.p.name} />
                          <b className="font-mono text-bad">{pct1(r.av)}</b>
                        </div>
                      ))
                  ) : (
                    <small className="text-ok">✓ {t('team.allReach')}</small>
                  )}
                </div>
              </div>
            )}
            <div className="grid gap-1">
              <small className="text-mu">{t('team.lastWeeks')}</small>
              <div className="flex h-24 items-end gap-1.5" role="img" aria-label={t('team.lastWeeks')}>
                {weeks.map((w) => (
                  <div
                    key={w.k}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={
                      w.a === null
                        ? t('team.weekNone', { count: w.n })
                        : t('team.weekTip', { count: w.n, value: w.a.toFixed(1) })
                    }
                  >
                    <i
                      className={`block w-full max-w-8 rounded-t-[4px] ${w.a === null ? 'bg-bd' : { ok: 'bg-ok', wn: 'bg-wn', hot: 'bg-hot', bad: 'bg-bad' }[colour(w.a, passRateOf(rates, null))]}`}
                      style={{ height: `${w.a === null ? 3 : Math.max(4, w.a * 0.7)}px` }}
                    />
                    <small className="text-[11px] text-mu">{w.k ? `-${w.k}${t('team.w')}` : t('team.now')}</small>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ---- the table view: one row per team
  const teamTable = (
    <div className={card}>
      <Table
        head={[
          t('team.cols.team'),
          t('team.cols.lead'),
          t('team.cols.agents'),
          t('team.cols.reviews'),
          t('team.cols.average'),
          t('team.cols.pass'),
          t('team.cols.trend'),
          t('team.cols.best'),
          t('team.cols.needsHelp'),
        ]}
        rows={shownTeams.map((x) => {
          const l = cur(x.id);
          const a = averageScore(l);
          const p = share(l, (r) => isPass(r, rates));
          const mine = rows.filter((r) => r.p.teamId === x.id && r.n);
          const low = mine.filter((r) => r.av < target(x.id));
          const worst = low.at(-1);
          const best = mine[0];
          return [
            <span key="t" className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-full" style={{ background: x.color }} aria-hidden="true" />
              {x.name}
            </span>,
            x.leadName ?? '-',
            rows.filter((r) => r.p.teamId === x.id).length,
            l.length,
            a === null ? (
              '-'
            ) : (
              <b key="a" className={`font-mono ${BAND_TEXT[band(a, rates, x.id)]}`}>
                {pct1(a)}
              </b>
            ),
            p === null ? '-' : pct1(p),
            <TrendPill key="tr" value={change(l, prev(x.id))} />,
            best ? (
              <span key="b">
                <AgentLink id={best.p.membershipId} name={best.p.name} />{' '}
                <small className="font-mono">{pct1(best.av)}</small>
              </span>
            ) : (
              '-'
            ),
            worst ? (
              <span key="w">
                <AgentLink id={worst.p.membershipId} name={worst.p.name} />{' '}
                <small className="font-mono">{pct1(worst.av)}</small>
                {low.length > 1 && <small className="text-mu"> +{low.length - 1}</small>}
              </span>
            ) : (
              <small key="w" className="text-ok">
                ✓ {t('team.none')}
              </small>
            ),
          ];
        })}
      />
    </div>
  );

  return (
    <section className="grid gap-4" aria-labelledby="team-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="team-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.team')}
          </h1>
          <p className="text-sm text-mu">{t('team.intro')}</p>
        </div>
        <button
          type="button"
          className={smallButton}
          disabled={exporting || !everything.length}
          onClick={() => void exportExcel()}
        >
          {exporting ? t('list.exporting') : t('list.export')}
        </button>
      </div>
      <Notice message={message} />
      <div className={`${card} flex flex-wrap items-end gap-3`}>
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
            {reached.map((x) => (
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
        <div className="grid gap-1 text-sm font-medium">
          {t('team.view')}
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('team.view')}>
            {(['cards', 'compact', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                className={chip(view === v)}
                onClick={() => {
                  setFolded(new Set());
                  choose('team.view', v);
                }}
              >
                {t(`team.views.${v}`)}
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
            {kpi(reviewsWord, everything.length, t('team.kpi.teams', { count: shownTeams.length }))}
            {kpi(
              t('team.kpi.average'),
              aa === null ? '-' : pct1(aa),
              t('team.kpi.target', { value: passRateOf(rates, null) }),
              aa === null ? '' : BAND_TEXT[band(aa, rates, null)],
            )}
            {kpi(
              t('team.kpi.pass'),
              ap === null ? '-' : pct1(ap),
              t('team.kpi.passed', { count: everything.filter((r) => isPass(r, rates)).length }),
              'text-ok',
            )}
            {kpi(
              t('team.kpi.below'),
              withReviews.filter((r) => r.av < target(r.p.teamId)).length,
              t('team.kpi.ofAgents', { count: withReviews.length }),
              'text-wn',
            )}
          </div>
          {view === 'table' ? (
            teamTable
          ) : shownTeams.length ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">{shownTeams.map(teamCard)}</div>
          ) : (
            <p className={`${card} text-mu`}>{t('team.noTeams')}</p>
          )}
          <div className={`${card} grid gap-3`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {t('team.allAgents')}
                <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">
                  {t('team.agentCount', { count: withReviews.length })}
                </span>
              </h2>
              <Fold
                open={agentsOpen}
                label={t('team.allAgents')}
                onClick={() => choose('team.agents', agentsOpen ? 'closed' : 'open')}
              />
            </div>
            {!agentsOpen ? (
              <small className="text-mu">{t('team.minimised')}</small>
            ) : (
              <Table
                head={[
                  '#',
                  t('team.cols.agent'),
                  t('team.cols.team'),
                  t('team.cols.reviews'),
                  t('team.cols.average'),
                  t('team.cols.pass'),
                  t('team.cols.trend'),
                  t('team.cols.red'),
                  t('team.cols.performance'),
                  t('team.cols.status'),
                ]}
                rows={rows.map((r, i) => {
                  const tone = band(r.av, rates, r.p.teamId);
                  return [
                    i + 1,
                    <AgentLink key="a" id={r.p.membershipId} name={r.p.name} />,
                    <TeamLink key="t" id={r.p.teamId} name={r.p.teamName ?? ''} />,
                    r.n,
                    r.n ? (
                      <b key="v" className={`font-mono ${BAND_TEXT[tone]}`}>
                        {pct1(r.av)}
                      </b>
                    ) : (
                      '-'
                    ),
                    r.n ? `${r.pc.toFixed(0)}%` : '-',
                    <TrendPill key="tr" value={r.tr} />,
                    r.red || '-',
                    <div key="b" className="w-28">
                      <Bar value={r.av} tone={r.n ? tone : 'mu'} />
                    </div>,
                    !r.n ? (
                      <small key="s" className="text-mu">
                        {t('team.noReviewsShort')}
                      </small>
                    ) : (
                      <span
                        key="s"
                        className={`rounded-full px-2 text-xs font-semibold ${BAND_SOFT[r.av >= target(r.p.teamId) ? 'ok' : 'bad']}`}
                      >
                        {r.av >= target(r.p.teamId) ? t('team.passLabel') : t('team.failLabel')}
                      </span>
                    ),
                  ];
                })}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
