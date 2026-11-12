// Tasks' other views (today's tasks.js): "My score", the timeline (five weeks, one bar per card, a line for today),
// the list, Team Progress (how far everybody is today, who is behind first) and Evaluation (each agent's score).
// The numbers come from @qsmart/shared, the same rules the server uses for the leaderboard's Task XP.
import {
  addDays,
  dayProgress,
  inTaskPeriod,
  isOverdueOn,
  type Language,
  mondayOf,
  type TaskPeriod,
  taskStats,
  timelineSpan,
} from '@qsmart/shared';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentLink, Bar, Empty, td, th } from './bits';
import type { Task } from './Tasks';
import { card, type PersonRow, smallButton } from './ui';

export const todayHere = () => new Date().toLocaleDateString('sv-SE');
const tone = (v: number) => (v >= 80 ? 'ok' : v >= 60 ? 'wn' : 'bad');
const TONE_TEXT = { ok: 'text-ok', wn: 'text-wn', bad: 'text-bad' } as const;
const STATUS_FILL = {
  todo: 'bg-mu',
  doing: 'bg-wn',
  review: 'bg-ac',
  done: 'bg-ok',
  overdue: 'bg-bad',
} as const;
const shortDay = (day: string, lang: Language) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(lang === 'bg' ? 'bg-BG' : lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });

/** My score: my own tasks' numbers (today's tkMyScore). */
export function MyScore({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation();
  const s = taskStats(tasks, todayHere());
  const look = s.total ? tone(s.score) : 'bad';
  if (!s.total)
    return (
      <section className={`${card} grid gap-1 p-3`} aria-label={t('tasks.my.title')}>
        <span className="text-xs font-semibold uppercase tracking-wide text-mu">{t('tasks.my.title')}</span>
        <small className="text-mu">{t('tasks.my.none')}</small>
      </section>
    );
  return (
    <section className={`${card} grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center`} aria-label={t('tasks.my.title')}>
      <div className="grid gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-mu">{t('tasks.my.title')}</span>
        <span>
          <b className={`font-display text-4xl ${TONE_TEXT[look]}`}>{s.score}</b>
          <small className="text-mu">/100</small>
        </span>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Bar value={s.completion} tone={look} />
          </div>
          <small>{Math.round(s.completion)}%</small>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="text-xs text-mu">{t('tasks.my.done')}</dt>
            <dd className="font-semibold">
              {s.done}/{s.total}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mu">{t('tasks.my.onTime')}</dt>
            <dd className="font-semibold">{s.onTime}</dd>
          </div>
          <div>
            <dt className="text-xs text-mu">{t('tasks.my.overdue')}</dt>
            <dd className={`font-semibold ${s.overdue ? 'text-bad' : ''}`}>{s.overdue}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** The timeline: five weeks at a time, one bar per card, grouped by person for those who give tasks. */
export function Timeline({
  tasks,
  byPerson,
  lang,
  onOpen,
}: {
  tasks: Task[];
  byPerson: boolean;
  lang: Language;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState(0);
  const today = todayHere();
  const N = 35;
  const from = addDays(mondayOf(today), 7 * (weeks - 1));
  const to = addDays(from, N - 1);
  const pos = (day: string) =>
    Math.max(
      0,
      Math.min(N, Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 864e5)),
    );
  const rows = tasks
    .map((x) => ({ x, span: timelineSpan(x, today) }))
    .filter(({ span }) => span[1] >= from && span[0] <= to)
    .sort((a, b) => a.span[0].localeCompare(b.span[0]));
  const fill = (x: Task) =>
    x.status === 'done'
      ? STATUS_FILL.done
      : x.status === 'review'
        ? STATUS_FILL.review
        : isOverdueOn(x, today)
          ? STATUS_FILL.overdue
          : STATUS_FILL[x.status];
  const todayAt = today >= from && today <= to ? ((pos(today) + 0.5) / N) * 100 : null;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = byPerson ? r.x.assigneeName : '';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const legend: [keyof typeof STATUS_FILL, string][] = [
    ['todo', t('tasks.statuses.todo')],
    ['doing', t('tasks.statuses.doing')],
    ['review', t('tasks.statuses.review')],
    ['done', t('tasks.statuses.done')],
    ['overdue', t('tasks.overdue')],
  ];
  const line = (r: (typeof rows)[number]) => {
    const [s, e] = r.span;
    const a = pos(s < from ? from : s);
    const b = pos(e > to ? to : e) + 1;
    return (
      <div key={r.x.id} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-2 text-sm">
        <button
          type="button"
          className="truncate text-left hover:underline"
          title={r.x.title}
          onClick={() => onOpen(r.x.id)}
        >
          {r.x.title}
        </button>
        <div className="relative h-6 rounded-s bg-sunk">
          {todayAt !== null && <i className="absolute inset-y-0 w-px bg-bad" style={{ left: `${todayAt}%` }} />}
          <button
            type="button"
            className={`absolute inset-y-1 truncate rounded-s px-1 text-left text-xs font-semibold text-pn ${fill(r.x)}`}
            style={{ left: `${(a / N) * 100}%`, width: `${(Math.max(1, b - a) / N) * 100}%` }}
            title={`${r.x.title} · ${shortDay(s, lang)} - ${shortDay(e, lang)}`}
            aria-label={`${r.x.title}: ${shortDay(s, lang)} - ${shortDay(e, lang)}`}
            onClick={() => onOpen(r.x.id)}
          >
            {b - a > 3 ? r.x.title : ''}
          </button>
        </div>
      </div>
    );
  };
  return (
    <section className={`${card} grid gap-3`} aria-label={t('tasks.views.timeline')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label={t('tasks.timeline.move')}>
          <button type="button" className={smallButton} onClick={() => setWeeks(weeks - 4)}>
            ‹ {t('tasks.timeline.earlier')}
          </button>
          <button type="button" className={smallButton} aria-pressed={weeks === 0} onClick={() => setWeeks(0)}>
            {t('tasks.timeline.today')}
          </button>
          <button type="button" className={smallButton} onClick={() => setWeeks(weeks + 4)}>
            {t('tasks.timeline.later')} ›
          </button>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs">
          {legend.map(([k, name]) => (
            <li key={k} className="inline-flex items-center gap-1">
              <i className={`inline-block size-2.5 rounded-full ${STATUS_FILL[k]}`} />
              {name}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2 text-xs text-mu">
        <span />
        <div className="relative h-4">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="absolute" style={{ left: `${((i * 7) / N) * 100}%` }}>
              {shortDay(addDays(from, i * 7), lang)}
            </span>
          ))}
        </div>
      </div>
      {!rows.length ? (
        <Empty>{t('tasks.timeline.empty')}</Empty>
      ) : (
        [...groups].map(([name, list]) => (
          <div key={name} className="grid gap-1">
            {byPerson && (
              <p className="text-sm font-semibold">
                {name} <small className="font-normal text-mu">{list.length}</small>
              </p>
            )}
            {list.map(line)}
          </div>
        ))
      )}
    </section>
  );
}

/** The list: one row per card. */
export function TaskList({
  tasks,
  showPerson,
  onOpen,
}: {
  tasks: Task[];
  showPerson: boolean;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const today = todayHere();
  if (!tasks.length) return <Empty>{t('tasks.empty')}</Empty>;
  return (
    <div className={`${card} overflow-x-auto p-3`}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>{t('tasks.cols.task')}</th>
            {showPerson && <th className={th}>{t('tasks.cols.for')}</th>}
            <th className={th}>{t('tasks.cols.status')}</th>
            <th className={th}>{t('tasks.cols.priority')}</th>
            <th className={th}>{t('tasks.cols.due')}</th>
            <th className={th}>{t('tasks.cols.progress')}</th>
            <th className={th}>{t('tasks.cols.points')}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((x) => {
            const ticked = x.steps.filter((s) => s.done).length;
            return (
              <tr key={x.id} className="border-t border-bd">
                <td className={td}>
                  <button
                    type="button"
                    className="text-left font-semibold hover:underline"
                    onClick={() => onOpen(x.id)}
                  >
                    {x.kind === 'target' && <span className="text-hot">★ </span>}
                    {x.title}
                  </button>
                </td>
                {showPerson && <td className={td}>{x.assigneeName}</td>}
                <td className={td}>{t(`tasks.statuses.${x.status}`)}</td>
                <td className={td}>{t(`tasks.priorities.${x.priority}`)}</td>
                <td className={`${td} whitespace-nowrap ${isOverdueOn(x, today) ? 'font-semibold text-bad' : ''}`}>
                  {x.dueOn ?? '-'}
                </td>
                <td className={td}>{x.steps.length ? `${ticked}/${x.steps.length}` : '-'}</td>
                <td className={td}>{x.points || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const teamsOf = (agents: PersonRow[]) => {
  const seen = new Map<string, string>();
  for (const p of agents) if (p.teamId) seen.set(p.teamId, p.teamName ?? '');
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
};
function TeamPicker({ agents, team, setTeam }: { agents: PersonRow[]; team: string; setTeam: (v: string) => void }) {
  const { t } = useTranslation();
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`;
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('tasks.filters.team')}>
      <button type="button" className={chip(!team)} aria-pressed={!team} onClick={() => setTeam('')}>
        {t('tasks.filters.allTeams')}
      </button>
      {teamsOf(agents).map((x) => (
        <button
          key={x.id}
          type="button"
          className={chip(team === x.id)}
          aria-pressed={team === x.id}
          onClick={() => setTeam(x.id)}
        >
          {x.name}
        </button>
      ))}
    </div>
  );
}

/** Team Progress: how far every agent is today, who is behind first; a team's cards add theirs up. */
export function TeamProgress({
  tasks,
  agents,
  onPerson,
}: {
  tasks: Task[];
  agents: PersonRow[];
  onPerson: (membershipId: string) => void;
}) {
  const { t } = useTranslation();
  const [team, setTeam] = useState('');
  const today = todayHere();
  const people = agents
    .filter((a) => !team || a.teamId === team)
    .map((a) => {
      const own = tasks.filter((x) => x.assigneeId === a.membershipId && !x.archivedAt);
      const p = dayProgress(own, today);
      return {
        a,
        ...p,
        todo: own.filter((x) => x.status === 'todo').length,
        active: own.filter((x) => x.status === 'doing' || x.status === 'review').length,
        overdue: own.filter((x) => isOverdueOn(x, today)).length,
      };
    })
    .sort((x, y) => x.percent - y.percent || y.overdue - x.overdue || x.a.name.localeCompare(y.a.name));
  const teams = teamsOf(agents)
    .filter((x) => !team || x.id === team)
    .map((x) => {
      const p = people.filter((r) => r.a.teamId === x.id);
      const units = p.reduce((s, r) => s + r.units, 0);
      const done = p.reduce((s, r) => s + r.done, 0);
      return {
        ...x,
        n: p.length,
        percent: units ? (done / units) * 100 : null,
        overdue: p.reduce((s, r) => s + r.overdue, 0),
      };
    })
    .filter((x) => x.n);
  return (
    <div className="grid gap-4">
      <TeamPicker agents={agents} team={team} setTeam={setTeam} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {teams.map((x) => (
          <section key={x.id} className={`${card} grid gap-1 p-4`} aria-label={x.name}>
            <p className="flex justify-between gap-2 text-sm">
              <b>{x.name}</b>
              <small className="text-mu">{t('tasks.progress.agents', { count: x.n })}</small>
            </p>
            <b className={`font-display text-3xl ${x.percent === null ? 'text-mu' : TONE_TEXT[tone(x.percent)]}`}>
              {x.percent === null ? '-' : `${Math.round(x.percent)}%`}
            </b>
            <Bar value={x.percent ?? 0} tone={x.percent === null ? 'mu' : tone(x.percent)} />
            <small className="text-mu">
              {t('tasks.progress.doneToday')}
              {x.overdue > 0 && <span className="text-bad"> · {t('tasks.counts.overdue', { count: x.overdue })}</span>}
            </small>
          </section>
        ))}
      </div>
      {!people.length ? (
        <Empty>{t('tasks.progress.nobody')}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((r) => (
            <button
              key={r.a.membershipId}
              type="button"
              className={`${card} grid gap-2 p-4 text-left hover:border-tx`}
              onClick={() => onPerson(r.a.membershipId)}
              title={t('tasks.progress.open', { name: r.a.name })}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <b className="block truncate">{r.a.name}</b>
                  <small className="text-mu">{r.a.teamName}</small>
                </span>
                <b className={`text-lg ${TONE_TEXT[tone(r.percent)]}`}>{Math.round(r.percent)}%</b>
              </span>
              <Bar value={r.percent} tone={tone(r.percent)} />
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mu">
                <span>{t('tasks.progress.today', { done: r.done, of: r.units })}</span>
                <span>{t('tasks.progress.toDo', { count: r.todo })}</span>
                <span>{t('tasks.progress.active', { count: r.active })}</span>
                {r.overdue > 0 && <span className="text-bad">{t('tasks.counts.overdue', { count: r.overdue })}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type SortKey = 'name' | 'total' | 'done' | 'onTime' | 'overdue' | 'completion' | 'score';
const PERIODS: TaskPeriod[] = ['week', 'month', 'all'];
/** Evaluation: every agent's numbers and score for the week, the month or all time; click a column to sort. */
export function Evaluation({ tasks, agents }: { tasks: Task[]; agents: PersonRow[] }) {
  const { t } = useTranslation();
  const [team, setTeam] = useState('');
  const [period, setPeriod] = useState<TaskPeriod>('month');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 });
  const today = todayHere();
  const now = Date.now();
  const rows = agents
    .filter((a) => !team || a.teamId === team)
    .map((a) => ({
      a,
      s: taskStats(
        tasks.filter((x) => x.assigneeId === a.membershipId && inTaskPeriod(x, period, now)),
        today,
      ),
    }));
  const value = (r: (typeof rows)[number]): string | number => (sort.key === 'name' ? r.a.name : r.s[sort.key]);
  rows.sort((x, y) => {
    const a = value(x);
    const b = value(y);
    return (a > b ? 1 : a < b ? -1 : 0) * sort.dir || x.a.name.localeCompare(y.a.name);
  });
  const head = (key: SortKey, label: string): ReactNode => (
    <th
      className={`${th} ${key === 'name' ? '' : 'text-center'}`}
      aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="uppercase"
        onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 })}
      >
        {label} {sort.key === key ? (sort.dir > 0 ? '↑' : '↓') : '↕'}
      </button>
    </th>
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <TeamPicker agents={agents} team={team} setTeam={setTeam} />
        <div className="flex gap-1" role="group" aria-label={t('tasks.eval.period')}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={smallButton}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              <span className={period === p ? 'font-bold' : ''}>{t(`tasks.eval.periods.${p}`)}</span>
            </button>
          ))}
        </div>
      </div>
      {!rows.length ? (
        <Empty>{t('tasks.progress.nobody')}</Empty>
      ) : (
        <div className={`${card} overflow-x-auto p-3`}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {head('name', t('tasks.eval.agent'))}
                {head('total', t('tasks.eval.total'))}
                {head('done', t('tasks.eval.done'))}
                {head('onTime', t('tasks.eval.onTime'))}
                {head('overdue', t('tasks.eval.overdue'))}
                {head('completion', t('tasks.eval.completion'))}
                {head('score', t('tasks.eval.score'))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, s }) => (
                <tr key={a.membershipId} className="border-t border-bd">
                  <td className={td}>
                    <AgentLink id={a.membershipId} name={a.name} />
                    <br />
                    <small className="text-mu">{a.teamName}</small>
                  </td>
                  <td className={`${td} text-center`}>{s.total}</td>
                  <td className={`${td} text-center text-ok`}>{s.done}</td>
                  <td className={`${td} text-center`}>{s.onTime}</td>
                  <td className={`${td} text-center ${s.overdue ? 'text-bad' : ''}`}>{s.overdue}</td>
                  <td className={`${td} text-center`}>{Math.round(s.completion)}%</td>
                  <td className={`${td} text-center font-bold ${s.total ? TONE_TEXT[tone(s.score)] : 'text-mu'}`}>
                    {s.total ? s.score : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <small className="text-mu">{t('tasks.eval.rule')}</small>
    </div>
  );
}
