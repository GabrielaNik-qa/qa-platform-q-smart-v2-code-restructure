// The Agents page's One-to-One tab (today's agents.js `agO2oTab`): the agent's one-to-ones and coaching sessions of the
// chosen period (with their actions), and their open tasks. An agent sees it on their own page: it is their list of
// sessions, as Agents can't open the Coaching page. Each line opens the session (a one-to-one on One-to-One, the
// others on their own page), where the agent reads and signs it.
import { isOverdueOn, type Window } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty } from './bits';
import type { SessionRow } from './Coaching';
import { type OneToOneRow, stateOf } from './OneToOne';
import type { Task } from './Tasks';
import type { PersonRow } from './ui';

const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';
const KIND_LOOK = { coaching: 'bg-ac/15 text-ac', group: 'bg-wn/15 text-wn', training: 'bg-ok/15 text-ok', o2o: '' };
const today = () => new Date().toLocaleDateString('sv-SE');
const inWindow = (day: string, w: Window | null) => {
  if (!w) return false;
  const at = new Date(`${day}T12:00:00`).getTime();
  return at >= w[0] && at < w[1];
};

/** A link that opens a session: a one-to-one on the One-to-One page, the others on their own page. */
export function SessionLink({
  s,
  className,
  children,
}: {
  s: Pick<SessionRow, 'id' | 'kind'>;
  className?: string;
  children: ReactNode;
}) {
  return s.kind === 'o2o' ? (
    <Link
      to="/$app/$page"
      params={{ app: 'quality', page: 'one-to-one' }}
      search={{ session: s.id }}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <Link to="/session/$id" params={{ id: s.id }} className={className}>
      {children}
    </Link>
  );
}

/** Held (a one-to-one: sent or signed), or still planned (a draft). */
const held = (s: SessionRow) => (s.kind === 'o2o' ? stateOf(s as OneToOneRow) !== 'draft' : s.status === 'done');

export function CoachingTab({
  agent,
  sessions,
  tasks,
  window,
  label,
}: {
  agent: PersonRow;
  sessions: SessionRow[];
  tasks: Task[];
  window: Window | null;
  label: string;
}) {
  const { t } = useTranslation();
  const mine = sessions
    .filter((s) => s.agents.some((a) => a.id === agent.membershipId) && inWindow(s.heldOn, window))
    .sort((a, b) => b.heldOn.localeCompare(a.heldOn));
  const o2o = mine.filter((s) => s.kind === 'o2o');
  const coach = mine.filter((s) => s.kind !== 'o2o');
  const actions = mine.flatMap((s) => s.actions);
  const open = tasks.filter((x) => x.assigneeId === agent.membershipId && x.status !== 'done' && !x.archivedAt);
  const now = today();
  const stat = (value: string | number, name: string, look: string) => (
    <div className="rounded-s bg-pn2 p-3">
      <b className={`font-display text-2xl ${look}`}>{value}</b>
      <small className="block text-xs text-mu">{name}</small>
    </div>
  );
  const row = (s: SessionRow) => {
    const done = s.actions.filter((a) => a.done).length;
    const state =
      s.kind === 'o2o'
        ? t(`o2o.state.${stateOf(s as OneToOneRow)}`)
        : s.status === 'planned'
          ? t('coaching.planned')
          : t('coaching.held');
    return (
      <SessionLink
        key={s.id}
        s={s}
        className="flex flex-wrap items-center gap-3 rounded-s bg-pn2 px-3 py-2 text-sm hover:ring-1 hover:ring-bd2"
      >
        <span className={held(s) ? 'text-ok' : 'text-wn'} aria-hidden="true">
          {held(s) ? '✓' : '◷'}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <b>{s.title}</b>
            <span className={`${pill} ${held(s) ? 'bg-ok/15 text-ok' : 'bg-wn/15 text-wn'}`}>{state}</span>
            {s.kind !== 'o2o' && (
              <span className={`${pill} ${KIND_LOOK[s.kind]}`}>{t(`coaching.kinds.${s.kind}`)}</span>
            )}
          </span>
          <small className="text-mu">
            {t('agents.o2o.by', { name: s.byName || '-' })} · {s.heldOn}
            {s.topics.length > 0 && ` · ${s.topics.join(', ')}`}
          </small>
        </span>
        {s.actions.length > 0 && (
          <span className={`${pill} ${done === s.actions.length ? 'bg-ok/15 text-ok' : 'bg-wn/15 text-wn'}`}>
            {t('agents.o2o.actions', { done, of: s.actions.length })}
          </span>
        )}
      </SessionLink>
    );
  };
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(o2o.length, t('agents.o2o.total'), 'text-ac')}
        {stat(o2o.filter(held).length, t('agents.o2o.completed'), 'text-ok')}
        {stat(o2o.filter((s) => !held(s)).length, t('agents.o2o.planned'), 'text-wn')}
        {stat(`${actions.filter((a) => a.done).length}/${actions.length}`, t('agents.o2o.actionsDone'), '')}
      </div>
      <div className="grid gap-2">{o2o.length ? o2o.map(row) : <Empty>{t('agents.o2o.none', { label })}</Empty>}</div>
      {coach.length > 0 && (
        <div className="grid gap-2">
          <h3 className="flex items-center gap-2 font-semibold">
            {t('agents.o2o.coaching')} <span className="rounded-full bg-bd/60 px-1.5 text-xs">{coach.length}</span>
          </h3>
          {coach.map(row)}
        </div>
      )}
      <div className="grid gap-2">
        <h3 className="flex flex-wrap items-center gap-3 font-semibold">
          {t('agents.o2o.tasks')}{' '}
          <span className="rounded-full bg-bd/60 px-1.5 text-xs">{t('agents.o2o.open', { count: open.length })}</span>
          <Link
            to="/$app/$page"
            params={{ app: 'quality', page: 'tasks' }}
            className="text-sm font-medium text-ac hover:underline"
          >
            {t('topics.open')} ›
          </Link>
        </h3>
        {open.length ? (
          open
            .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
            .slice(0, 6)
            .map((x) => (
              <Link
                key={x.id}
                to="/$app/$page"
                params={{ app: 'quality', page: 'tasks' }}
                search={{ task: x.id }}
                className="flex flex-wrap items-center gap-3 rounded-s bg-pn2 px-3 py-2 text-sm hover:ring-1 hover:ring-bd2"
              >
                <span aria-hidden="true">{x.kind === 'target' ? '★' : '☐'}</span>
                <span className="grid flex-1">
                  <b>{x.title}</b>
                  <small className="text-mu">
                    {x.dueOn ? t('agents.o2o.due', { date: x.dueOn }) : t('agents.o2o.noDue')}
                  </small>
                </span>
                {isOverdueOn(x, now) ? (
                  <span className={`${pill} bg-bad/15 text-bad`}>{t('agents.o2o.overdue')}</span>
                ) : (
                  <span className={`${pill} bg-ac/15 text-ac`}>{t(`tasks.statuses.${x.status}`)}</span>
                )}
              </Link>
            ))
        ) : (
          <small className="text-mu">{t('agents.o2o.noTasks')}</small>
        )}
      </div>
    </div>
  );
}
