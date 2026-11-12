// The Dashboard's widgets of tasks and coaching (Phase 4), as today's (widgets.js and learn.js `myWork`):
// - Tasks overview: open, active and overdue tasks and the share done, of the tasks the person may see (and the team
//   filter);
// - Your to-do list: your own open tasks (overdue, due today) and the sessions waiting for your signature (reading and
//   quizzes join with Learning);
// - Latest coaching update: your newest coaching session or one-to-one, its goals and your open next steps.
import { isOverdueOn, taskStats } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SessionLink } from './AgentCoaching';
import { Empty } from './bits';
import type { SessionRow } from './Coaching';
import { type OneToOneRow, stateOf } from './OneToOne';
import type { Task } from './Tasks';
import { card, type PersonRow } from './ui';

export interface WorkContext {
  tasks: Task[] | null;
  sessions: SessionRow[] | null;
  /** the person's own membership */
  me: string;
  teamFilter: string;
  people: PersonRow[];
}

const today = () => new Date().toLocaleDateString('sv-SE');
const link = 'text-sm font-semibold text-ac hover:underline';

function W({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className={`${card} grid h-full content-start gap-2`} aria-labelledby={`w-${id}`}>
      <h2 id={`w-${id}`} className="font-semibold" title={t(`widgets.${id}.help`)}>
        {t(`widgets.${id}.title`)}
      </h2>
      {children}
    </section>
  );
}
const TasksLink = ({ children }: { children: ReactNode }) => (
  <Link to="/$app/$page" params={{ app: 'quality', page: 'tasks' }} className={link}>
    {children}
  </Link>
);

/** The tasks the dashboard counts: not archived, and of the filtered team (by the team of the person it is for). */
export function tasksOf(c: WorkContext) {
  const teamOf = new Map(c.people.map((p) => [p.membershipId, p.teamId]));
  return (c.tasks ?? []).filter(
    (x) => !x.archivedAt && (!c.teamFilter || (x.assigneeId && teamOf.get(x.assigneeId) === c.teamFilter)),
  );
}

export function TasksOverview({ c }: { c: WorkContext }) {
  const { t } = useTranslation();
  if (!c.tasks)
    return (
      <W id="tasks">
        <Empty>{t('widgets.common.noData')}</Empty>
      </W>
    );
  const list = tasksOf(c);
  const s = taskStats(list, today());
  const cell = (value: string | number, name: string, look = '') => (
    <div className="grid rounded-s bg-pn2 p-2 text-center">
      <b className={`font-display text-2xl ${look}`}>{value}</b>
      <small className="text-xs text-mu">{name}</small>
    </div>
  );
  return (
    <W id="tasks">
      <div className="grid grid-cols-4 gap-2">
        {cell(list.filter((x) => x.status !== 'done').length, t('widgets.tasks.open'))}
        {cell(
          list.filter((x) => x.status === 'doing' || x.status === 'review').length,
          t('widgets.tasks.active'),
          'text-wn',
        )}
        {cell(s.overdue, t('widgets.tasks.overdue'), s.overdue ? 'text-bad' : '')}
        {cell(`${Math.round(s.completion)}%`, t('widgets.tasks.done'), 'text-ok')}
      </div>
      <TasksLink>{t('widgets.tasks.go')} ›</TasksLink>
    </W>
  );
}

/** Sessions that wait for this person's signature: held (a one-to-one sent), theirs, not signed yet. */
export const toSign = (c: WorkContext) =>
  (c.sessions ?? []).filter(
    (s) =>
      s.agents.some((a) => a.id === c.me) &&
      !s.signatures[c.me] &&
      s.status === 'done' &&
      (s.kind !== 'o2o' || stateOf(s as OneToOneRow) !== 'draft'),
  );

export function ToDo({ c }: { c: WorkContext }) {
  const { t } = useTranslation();
  const now = today();
  const mine = (c.tasks ?? []).filter((x) => x.assigneeId === c.me && x.status !== 'done' && !x.archivedAt);
  const sign = toSign(c);
  const row = (icon: string, title: string, sub: string) => (
    <span className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-full bg-pn2 text-lg" aria-hidden="true">
        {icon}
      </span>
      <span className="grid flex-1">
        <b>{title}</b>
        <small className="text-mu">{sub}</small>
      </span>
      <span aria-hidden="true">›</span>
    </span>
  );
  return (
    <W id="todo">
      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/$app/$page"
          params={{ app: 'quality', page: 'tasks' }}
          className="rounded-s border border-bd p-2 text-sm hover:border-tx"
        >
          {row(
            '☐',
            t('widgets.todo.tasks', { count: mine.length }),
            t('widgets.todo.tasksLine', {
              overdue: mine.filter((x) => isOverdueOn(x, now)).length,
              today: mine.filter((x) => x.dueOn === now).length,
            }),
          )}
        </Link>
        {sign[0] ? (
          <SessionLink s={sign[0]} className="rounded-s border border-bd p-2 text-sm hover:border-tx">
            {row('✍', t('widgets.todo.sign', { count: sign.length }), sign[0].title)}
          </SessionLink>
        ) : (
          <span className="rounded-s border border-bd p-2 text-sm">
            {row('✍', t('widgets.todo.sign', { count: 0 }), t('widgets.todo.signNone'))}
          </span>
        )}
      </div>
    </W>
  );
}

export function LatestCoaching({ c }: { c: WorkContext }) {
  const { t } = useTranslation();
  const mine = (c.sessions ?? [])
    .filter((s) => s.agents.some((a) => a.id === c.me))
    .sort((a, b) => b.heldOn.localeCompare(a.heldOn) || b.createdAt.localeCompare(a.createdAt))[0];
  if (!mine)
    return (
      <W id="coach_new">
        <Empty>{t('widgets.coach_new.none')}</Empty>
      </W>
    );
  const open = mine.actions.filter((a) => !a.done);
  return (
    <W id="coach_new">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <b>{mine.title}</b>{' '}
          <small className="text-mu">
            {mine.heldOn} · {mine.byName}
          </small>
        </span>
        <SessionLink s={mine} className={link}>
          {t('widgets.coach_new.open')} ›
        </SessionLink>
      </div>
      {mine.goals && <p className="text-sm">{mine.goals}</p>}
      {open.length ? (
        <div className="grid gap-1 text-sm">
          <b>{t('widgets.coach_new.next')}</b>
          {open.map((a, i) => (
            <span key={i}>
              • {a.text}
              {a.dueOn && <small className="text-mu"> {t('widgets.coach_new.due', { date: a.dueOn })}</small>}
            </span>
          ))}
        </div>
      ) : (
        <small className="text-mu">{t('widgets.coach_new.noActions')}</small>
      )}
    </W>
  );
}
