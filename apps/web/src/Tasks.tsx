// Quality › Tasks (today's tasks.js, My Tasks): the board of To Do, In Progress, In review and Done. Staff give tasks
// and targets to people or whole teams; each person moves their own cards (drag them, or tick the checklist: the first
// tick starts a card, the last finishes it); a card given with "needs review" waits In review until someone who gives
// tasks approves it or sends it back with a comment. Each card opens with its dates, checklist and history.
// Staff also have Team Progress (how far everybody is today) and Evaluation (each agent's score); everyone sees their
// own score and chooses the board, the timeline or the list; the Library (history, templates, sequences) is in
// TaskLibrary.tsx.
import { can, isOverdueOn, type Language } from '@qsmart/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { type DragEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { when } from './Activity';
import { api } from './api';
import { Empty } from './bits';
import { currentLanguage } from './i18n';
import { useSession } from './session';
import { TaskLibrary } from './TaskLibrary';
import { Evaluation, MyScore, TaskList, TeamProgress, Timeline, todayHere } from './TaskViews';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, smallButton, useAction } from './ui';

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
export interface TaskStep {
  text: string;
  minutes: number;
  done: boolean;
}
export interface TaskEvent {
  at: string;
  byName: string;
  action: string;
  note?: string;
}
export interface Task {
  id: string;
  groupId: string;
  title: string;
  description: string;
  kind: 'task' | 'target';
  priority: 'low' | 'med' | 'high';
  points: number;
  startOn: string | null;
  dueOn: string | null;
  status: TaskStatus;
  needsReview: boolean;
  assigneeId: string | null;
  assigneeName: string;
  teamId: string | null;
  teamName: string;
  steps: TaskStep[];
  labels: string[];
  colour: string;
  category: string;
  pinned: boolean;
  archivedAt: string | null;
  startedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  history: TaskEvent[];
  /** a repeating template's card */
  templateId: string | null;
  /** a sequence's card: step n of how many, and the sequence's name */
  runId: string | null;
  stepNo: number | null;
  stepCount: number | null;
  sequenceName: string;
  byId: string | null;
  byName: string;
  createdAt: string;
}

export const STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'done'];
const PRIORITY_LOOK = { high: 'text-bad', med: 'text-wn', low: 'text-ok' } as const;
type Show = 'all' | 'todo' | 'active' | 'done' | 'overdue' | 'archived';
const SHOWS: Show[] = ['all', 'todo', 'active', 'done', 'overdue', 'archived'];
type Tab = 'my' | 'team' | 'eval' | 'library';
type View = 'board' | 'timeline' | 'list';
const VIEWS: View[] = ['board', 'timeline', 'list'];
export const isOverdue = (t: Pick<Task, 'dueOn' | 'status'>) => isOverdueOn(t, todayHere());
const fits = (x: Task, show: Show) =>
  show === 'archived'
    ? !!x.archivedAt
    : !x.archivedAt &&
      (show === 'all' ||
        (show === 'todo' && x.status === 'todo') ||
        (show === 'active' && (x.status === 'doing' || x.status === 'review')) ||
        (show === 'done' && x.status === 'done') ||
        (show === 'overdue' && isOverdue(x)));
const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';

/** Checklist lines typed one per line, "Check the e-mails | 5" (5 = minutes), as today. */
export const stepsFrom = (text: string, old: TaskStep[] = []): TaskStep[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((line) => {
      const [name = '', mins = ''] = line.split('|').map((x) => x.trim());
      const minutes = Math.min(600, Math.max(0, Number.parseInt(mins, 10) || 0));
      return { text: name.slice(0, 150), minutes, done: old.find((s) => s.text === name)?.done ?? false };
    })
    .filter((s) => s.text);
export const stepsText = (steps: TaskStep[]) =>
  steps.map((s) => (s.minutes ? `${s.text} | ${s.minutes}` : s.text)).join('\n');

/** Pinned first, then by deadline (none last), then the newest. */
const order = (a: Task, b: Task) =>
  Number(b.pinned) - Number(a.pinned) ||
  (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') ||
  b.createdAt.localeCompare(a.createdAt);

export interface Draft {
  id?: string;
  title: string;
  description: string;
  kind: 'task' | 'target';
  priority: 'low' | 'med' | 'high';
  points: number;
  startOn: string;
  dueOn: string;
  needsReview: boolean;
  steps: string;
  labels: string;
  colour: string;
  category: string;
  /** a new task: the people and teams; a change: the one person */
  assigneeIds: string[];
  teamIds: string[];
  assigneeId: string;
}
export const emptyDraft = (): Draft => ({
  title: '',
  description: '',
  kind: 'task',
  priority: 'med',
  points: 0,
  startOn: '',
  dueOn: '',
  needsReview: false,
  steps: '',
  labels: '',
  colour: '',
  category: '',
  assigneeIds: [],
  teamIds: [],
  assigneeId: '',
});

export function Tasks({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string };
  const session = useSession();
  const me = session.company?.membershipId ?? null;
  const gives = can(company.role, 'tasks.write');
  const { message, run, fail } = useAction();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [tab, setTab] = useState<Tab>('my');
  const [who, setWho] = useState<string>(gives ? '' : 'me');
  const [team, setTeam] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  // the view is each person's choice, saved with their account (today: the board, the timeline or the list)
  const view = (session.me.prefs.choices?.['tasks.view'] as View | undefined) ?? 'board';
  const choose = (v: View) =>
    void api('/me/prefs', undefined, {
      method: 'PUT',
      body: { ...session.me.prefs, choices: { ...session.me.prefs.choices, 'tasks.view': v } },
    }).then(session.reloadMe, fail);
  const [dragged, setDragged] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const open = search.task ?? null;

  const load = useCallback(() => {
    api<Task[]>('/tasks', company.id).then(setTasks, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!gives) return;
    api<PersonRow[]>('/people', company.id).then(
      (list) => setPeople(list.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name))),
      fail,
    );
  }, [company.id, gives, fail]);

  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of people) if (p.role === 'agent' && p.teamId) seen.set(p.teamId, p.teamName ?? '');
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);

  const all = tasks ?? [];
  const agents = people.filter((p) => p.role === 'agent');
  // the person and team chosen (staff), before the status filter: the number cards count these
  const base = all
    .filter((x) => (who === 'me' ? x.assigneeId === me : who ? x.assigneeId === who : true))
    .filter((x) => !team || x.teamId === team)
    .filter((x) => {
      const q = query.trim().toLowerCase();
      return (
        !q || [x.title, x.description, x.assigneeName, x.category, ...x.labels].some((v) => v.toLowerCase().includes(q))
      );
    });
  const shown = base.filter((x) => fits(x, show));
  const task = all.find((x) => x.id === open);
  const mine = (x: Task) => !!me && x.assigneeId === me;
  /** the ones who give tasks change a card; an admin even their own, others not the cards given to them */
  const edits = (x: Task) => gives && (company.role === 'admin' || !mine(x));
  const moves = (x: Task) => mine(x) || edits(x);
  const setOpen = (id: string | null) =>
    void navigate({
      to: '/$app/$page',
      params: { app: 'quality', page: 'tasks' },
      search: id ? { task: id } : {},
      replace: !id,
    });

  const put = (x: Task, body: object, done = '') =>
    run(() => api(`/tasks/${x.id}`, company.id, { method: 'PUT', body }), done, load);
  const drop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    const x = all.find((y) => y.id === dragged);
    setDragged(null);
    if (!x || x.status === status || !moves(x)) return;
    if (status === 'todo' && x.status === 'review' && edits(x)) {
      // sending back asks for a comment: in the card
      setOpen(x.id);
      setReturning(x.id);
      return;
    }
    void put(x, { status }, t(`tasks.moved.${status}`));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const old = all.find((x) => x.id === draft.id);
    const common = {
      title: draft.title,
      description: draft.description,
      kind: draft.kind,
      priority: draft.priority,
      points: Number(draft.points) || 0,
      startOn: draft.startOn || null,
      dueOn: draft.dueOn || null,
      needsReview: draft.needsReview,
      steps: stepsFrom(draft.steps, old?.steps),
      labels: draft.labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8),
      colour: draft.colour,
      category: draft.category,
    };
    const ok = await run(
      () =>
        draft.id
          ? api(`/tasks/${draft.id}`, company.id, {
              method: 'PUT',
              body: {
                ...common,
                ...(draft.assigneeId && draft.assigneeId !== old?.assigneeId ? { assigneeId: draft.assigneeId } : {}),
              },
            })
          : api('/tasks', company.id, {
              method: 'POST',
              body: { ...common, assigneeIds: draft.assigneeIds, teamIds: draft.teamIds },
            }),
      draft.id ? t('tasks.saved') : t('tasks.given'),
      load,
    );
    if (ok) setDraft(null);
  }
  const editDraft = (x: Task): Draft => ({
    id: x.id,
    title: x.title,
    description: x.description,
    kind: x.kind,
    priority: x.priority,
    points: x.points,
    startOn: x.startOn ?? '',
    dueOn: x.dueOn ?? '',
    needsReview: x.needsReview,
    steps: stepsText(x.steps),
    labels: x.labels.join(', '),
    colour: x.colour,
    category: x.category,
    assigneeIds: [],
    teamIds: [],
    assigneeId: x.assigneeId ?? '',
  });

  const live = base.filter((x) => !x.archivedAt);
  const numbers: { show: Show; label: string; value: number; note: string; look: string }[] = [
    { show: 'all', label: t('tasks.cards.total'), value: live.length, note: t('tasks.cards.totalNote'), look: '' },
    {
      show: 'done',
      label: t('tasks.cards.done'),
      value: live.filter((x) => x.status === 'done').length,
      note: t('tasks.cards.doneNote', {
        rate: live.length ? Math.round((live.filter((x) => x.status === 'done').length / live.length) * 100) : 0,
      }),
      look: 'text-ok',
    },
    {
      show: 'active',
      label: t('tasks.cards.active'),
      value: live.filter((x) => x.status === 'doing' || x.status === 'review').length,
      note: t('tasks.cards.activeNote'),
      look: 'text-wn',
    },
    {
      show: 'overdue',
      label: t('tasks.cards.overdue'),
      value: live.filter(isOverdue).length,
      note: t('tasks.cards.overdueNote'),
      look: 'text-bad',
    },
    {
      show: 'archived',
      label: t('tasks.cards.archived'),
      value: base.filter((x) => x.archivedAt).length,
      note: t('tasks.cards.archivedNote'),
      look: 'text-mu',
    },
  ];
  const openPerson = (id: string) => {
    setTab('my');
    setWho(id);
    setTeam('');
    setShow('all');
  };
  const tabButton = (on: boolean) =>
    `rounded-s px-3 py-1.5 text-sm font-semibold ${on ? 'bg-brand text-on-brand' : 'border border-bd hover:border-tx'}`;

  return (
    <section className="grid gap-4" aria-labelledby="tasks-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="tasks-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('tasks.title')}
          </h1>
          <p className="text-sm text-mu">{gives ? t('tasks.intro') : t('tasks.introAgent')}</p>
        </div>
        {gives && (
          <button type="button" className={primaryButton} onClick={() => setDraft(emptyDraft())}>
            + {t('tasks.new')}
          </button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,28rem)] lg:items-end lg:justify-between">
        {gives ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('tasks.title')}>
            {(['my', 'team', 'eval', 'library'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={tabButton(tab === k)}
                onClick={() => setTab(k)}
              >
                {t(`tasks.tabs.${k}`)}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        {tasks && <MyScore tasks={all.filter(mine)} />}
      </div>
      <Notice message={message} />

      {!tasks ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : tab === 'team' && gives ? (
        <TeamProgress tasks={all} agents={agents} onPerson={openPerson} />
      ) : tab === 'eval' && gives ? (
        <Evaluation tasks={all} agents={agents} />
      ) : tab === 'library' && gives ? (
        <TaskLibrary
          company={company}
          tasks={all}
          people={people}
          teams={teams}
          startTask={(d) => setDraft({ ...emptyDraft(), ...d })}
          openTask={setOpen}
        />
      ) : (
        <>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {numbers.map((n) => (
              <button
                key={n.show}
                type="button"
                aria-pressed={show === n.show}
                className={`${card} grid gap-0.5 p-3 text-left ${show === n.show ? 'border-brand' : 'hover:border-tx'}`}
                onClick={() => setShow(show === n.show && n.show !== 'all' ? 'all' : n.show)}
                title={t('tasks.cards.show')}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-mu">{n.label}</span>
                <b className={`font-display text-2xl ${n.look}`}>{n.value}</b>
                <small className="text-mu">{n.note}</small>
              </button>
            ))}
          </div>
          <details className={`${card} p-3 text-sm`}>
            <summary className="cursor-pointer font-semibold">
              <span className="text-hot">★</span> {t('tasks.points.title')}
            </summary>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              {(['what', 'when', 'month', 'board', 'reset'] as const).map((k) => (
                <li key={k}>{t(`tasks.points.${k}`)}</li>
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap items-end gap-3 text-sm">
            {gives && (
              <label className="grid gap-1 font-medium">
                {t('tasks.filters.team')}
                <select className={field} value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="">{t('tasks.filters.allTeams')}</option>
                  {teams.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {gives && (
              <label className="grid gap-1 font-medium">
                {t('tasks.filters.person')}
                <select className={field} value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">{t('tasks.filters.everyone')}</option>
                  <option value="me">{t('tasks.filters.mine')}</option>
                  {people
                    .filter((p) => !team || p.teamId === team)
                    .map((p) => (
                      <option key={p.membershipId} value={p.membershipId}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="grid gap-1 font-medium">
              {t('tasks.filters.show')}
              <select className={field} value={show} onChange={(e) => setShow(e.target.value as Show)}>
                {SHOWS.map((s) => (
                  <option key={s} value={s}>
                    {t(`tasks.filters.shows.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 font-medium">
              {t('tasks.filters.search')}
              <input className={field} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="ml-auto grid gap-1 font-medium">
              {t('tasks.views.title')}
              <div className="flex gap-1" role="group" aria-label={t('tasks.views.title')}>
                {VIEWS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    className={tabButton(view === v)}
                    onClick={() => choose(v)}
                  >
                    {t(`tasks.views.${v}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {view === 'timeline' ? (
            <Timeline tasks={shown} byPerson={gives && who !== 'me'} lang={lang} onOpen={setOpen} />
          ) : view === 'list' ? (
            <TaskList tasks={[...shown].sort(order)} showPerson={gives && who !== 'me'} onOpen={setOpen} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label={t('tasks.board')}>
              {STATUSES.map((status) => {
                const list = shown.filter((x) => x.status === status).sort(order);
                return (
                  <section
                    key={status}
                    aria-label={t(`tasks.statuses.${status}`)}
                    className={`grid content-start gap-2 rounded-m border border-bd bg-sunk p-2 min-h-40 ${dragged ? 'outline-dashed outline-1 outline-bd2' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={drop(status)}
                  >
                    <h2 className="flex items-center justify-between px-1 text-sm font-semibold uppercase tracking-wide">
                      {t(`tasks.statuses.${status}`)}
                      <span className="rounded-full bg-pn px-2 text-xs">{list.length}</span>
                    </h2>
                    {list.map((x) => (
                      <TaskCard
                        key={x.id}
                        task={x}
                        showPerson={gives && who !== 'me'}
                        draggable={moves(x)}
                        onDrag={() => setDragged(x.id)}
                        onOpen={() => setOpen(x.id)}
                      />
                    ))}
                    {!list.length && <Empty>{t('tasks.empty')}</Empty>}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {task && (
        <TaskWindow
          task={task}
          lang={lang}
          mine={mine(task)}
          edits={edits(task)}
          returning={returning === task.id}
          setReturning={(v) => setReturning(v ? task.id : null)}
          onClose={() => {
            setOpen(null);
            setReturning(null);
          }}
          onPut={(body, done) => put(task, body, done)}
          onEdit={() => setDraft(editDraft(task))}
          onDelete={() => {
            if (!window.confirm(t('tasks.confirmDelete'))) return;
            void run(() => api(`/tasks/${task.id}`, company.id, { method: 'DELETE' }), t('tasks.deleted'), load).then(
              (ok) => ok && setOpen(null),
            );
          }}
        />
      )}
      {draft && (
        <TaskForm
          draft={draft}
          setDraft={setDraft}
          people={people}
          teams={teams}
          message={message}
          onSave={(e) => void save(e)}
        />
      )}
    </section>
  );
}

/** One card of the board: its colour, kind, title, person, deadline, checklist progress and labels. */
function TaskCard({
  task: x,
  showPerson,
  draggable,
  onDrag,
  onOpen,
}: {
  task: Task;
  showPerson: boolean;
  draggable: boolean;
  onDrag: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const ticked = x.steps.filter((s) => s.done).length;
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', x.id);
        onDrag();
      }}
      onClick={onOpen}
      className="grid gap-1 rounded-s border border-bd bg-pn p-2 text-left text-sm shadow-sm hover:border-tx"
      style={x.colour ? { borderLeft: `4px solid ${x.colour}` } : undefined}
      aria-label={`${x.title}${showPerson ? `, ${x.assigneeName}` : ''}`}
    >
      <span className="flex items-start justify-between gap-2">
        <b className="leading-snug">
          {x.kind === 'target' && (
            <span className="text-hot" title={t('tasks.kinds.target')} aria-label={t('tasks.kinds.target')}>
              ★{' '}
            </span>
          )}
          {x.title}
        </b>
        {x.pinned && (
          <span className="text-xs text-mu" title={t('tasks.pinned')}>
            ●
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-mu">
        {showPerson && <span>{x.assigneeName}</span>}
        <span className={PRIORITY_LOOK[x.priority]}>{t(`tasks.priorities.${x.priority}`)}</span>
        {x.dueOn && (
          <span className={isOverdue(x) ? 'font-semibold text-bad' : ''}>
            {isOverdue(x) ? t('tasks.late', { date: x.dueOn }) : t('tasks.due', { date: x.dueOn })}
          </span>
        )}
        {x.steps.length > 0 && <span>{t('tasks.stepsDone', { done: ticked, of: x.steps.length })}</span>}
        {x.needsReview && <span>{t('tasks.needsReviewShort')}</span>}
        {x.sequenceName && <span className="max-w-40 truncate text-ac">{x.sequenceName}</span>}
        {x.templateId && <span className="text-ac">{t('tasks.library.repeating')}</span>}
      </span>
      {x.labels.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {x.labels.map((l) => (
            <span key={l} className={`${pill} bg-sunk text-mu`}>
              {l}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** A card, opened: its details, checklist, what can be done with it, and its history. */
function TaskWindow({
  task: x,
  lang,
  mine,
  edits,
  returning,
  setReturning,
  onClose,
  onPut,
  onEdit,
  onDelete,
}: {
  task: Task;
  lang: Language;
  mine: boolean;
  edits: boolean;
  returning: boolean;
  setReturning: (v: boolean) => void;
  onClose: () => void;
  onPut: (body: object, done: string) => Promise<boolean>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  const checker = edits && !mine;
  const tick = (i: number) =>
    void onPut({ steps: x.steps.map((s, j) => ({ ...s, done: j === i ? !s.done : s.done })) }, t('tasks.stepSaved'));
  const dates: [string, string | null][] = [
    [t('tasks.dates.given'), when(x.createdAt, lang)],
    [t('tasks.dates.start'), x.startOn],
    [t('tasks.dates.due'), x.dueOn],
    [t('tasks.dates.started'), x.startedAt && when(x.startedAt, lang)],
    [t('tasks.dates.sent'), x.sentAt && when(x.sentAt, lang)],
    [t('tasks.dates.done'), x.completedAt && when(x.completedAt, lang)],
  ];
  const onTime = x.completedAt && x.dueOn ? x.completedAt.slice(0, 10) <= x.dueOn : null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-window-title"
        className="grid max-h-[90vh] w-full max-w-[680px] gap-3 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
        style={x.colour ? { borderTop: `6px solid ${x.colour}` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-xs text-mu">
              {t(`tasks.kinds.${x.kind}`)} · {t(`tasks.statuses.${x.status}`)}
              {x.category && ` · ${x.category}`}
            </p>
            <h2 id="task-window-title" className="font-display text-xl font-bold">
              {x.title}
            </h2>
            <p className="text-sm">
              {t('tasks.for', { name: x.assigneeName })} · {t('tasks.givenBy', { name: x.byName })}
            </p>
            {x.sequenceName && (
              <p className="text-xs text-ac">
                {t('tasks.fromSequence', { name: x.sequenceName, n: x.stepNo ?? 0, of: x.stepCount ?? 0 })}
              </p>
            )}
            {x.templateId && <p className="text-xs text-ac">{t('tasks.fromTemplate')}</p>}
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
        <p className="flex flex-wrap gap-2 text-xs">
          <span className={`${pill} bg-sunk ${PRIORITY_LOOK[x.priority]}`}>{t(`tasks.priorities.${x.priority}`)}</span>
          {x.points > 0 && <span className={`${pill} bg-sunk`}>{t('tasks.points', { count: x.points })}</span>}
          {x.needsReview && <span className={`${pill} bg-ac/15 text-ac`}>{t('tasks.needsReview')}</span>}
          {isOverdue(x) && <span className={`${pill} bg-bad/15 text-bad`}>{t('tasks.overdue')}</span>}
          {onTime !== null && (
            <span className={`${pill} ${onTime ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}>
              {onTime ? t('tasks.onTime') : t('tasks.lateDone')}
            </span>
          )}
          {x.labels.map((l) => (
            <span key={l} className={`${pill} bg-sunk text-mu`}>
              {l}
            </span>
          ))}
        </p>
        {x.description && <p className="whitespace-pre-wrap text-sm">{x.description}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {dates
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-mu">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>

        {x.steps.length > 0 && (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">
              {t('tasks.checklist')} ({x.steps.filter((s) => s.done).length}/{x.steps.length})
            </legend>
            {x.steps.map((s, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={s.done}
                  disabled={!(mine || edits)}
                  onChange={() => tick(i)}
                />
                <span className={s.done ? 'text-mu line-through' : ''}>{s.text}</span>
                {s.minutes > 0 && <small className="text-mu">{t('tasks.minutes', { count: s.minutes })}</small>}
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex flex-wrap gap-2 border-t border-bd pt-3">
          {(mine || edits) && x.status === 'todo' && (
            <button
              type="button"
              className={primaryButton}
              onClick={() => void onPut({ status: 'doing' }, t('tasks.moved.doing'))}
            >
              {t('tasks.actions.start')}
            </button>
          )}
          {(mine || edits) && (x.status === 'todo' || x.status === 'doing') && (
            <button
              type="button"
              className={x.status === 'doing' ? primaryButton : smallButton}
              onClick={() =>
                void onPut(
                  { status: 'done' },
                  x.needsReview && !checker ? t('tasks.moved.review') : t('tasks.moved.done'),
                )
              }
            >
              {x.needsReview && !checker ? t('tasks.actions.sendForReview') : t('tasks.actions.done')}
            </button>
          )}
          {checker && x.status === 'review' && !returning && (
            <>
              <button
                type="button"
                className={primaryButton}
                onClick={() => void onPut({ status: 'done' }, t('tasks.approved'))}
              >
                {t('tasks.actions.approve')}
              </button>
              <button type="button" className={smallButton} onClick={() => setReturning(true)}>
                {t('tasks.actions.sendBack')}
              </button>
            </>
          )}
          {(mine || edits) && x.status === 'done' && (
            <button
              type="button"
              className={smallButton}
              onClick={() => void onPut({ status: 'doing' }, t('tasks.moved.doing'))}
            >
              {t('tasks.actions.reopen')}
            </button>
          )}
          {(mine || edits) && (
            <>
              <button type="button" className={smallButton} onClick={() => void onPut({ pinned: !x.pinned }, '')}>
                {x.pinned ? t('tasks.actions.unpin') : t('tasks.actions.pin')}
              </button>
              <button
                type="button"
                className={smallButton}
                onClick={() =>
                  void onPut({ archived: !x.archivedAt }, x.archivedAt ? t('tasks.restored') : t('tasks.archived'))
                }
              >
                {x.archivedAt ? t('tasks.actions.restore') : t('tasks.actions.archive')}
              </button>
            </>
          )}
          {edits && (
            <>
              <button type="button" className={smallButton} onClick={onEdit}>
                {t('common.edit')}
              </button>
              <button type="button" className={`${smallButton} text-bad`} onClick={onDelete}>
                {t('common.delete')}
              </button>
            </>
          )}
        </div>
        {returning && (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void onPut({ status: 'doing', note }, t('tasks.sentBack')).then((ok) => {
                if (ok) {
                  setReturning(false);
                  setNote('');
                }
              });
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              {t('tasks.sendBackWhy')}
              <textarea
                className={field}
                rows={2}
                maxLength={300}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <span className="flex gap-2">
              <button type="submit" className={primaryButton}>
                {t('tasks.actions.sendBack')}
              </button>
              <button type="button" className={smallButton} onClick={() => setReturning(false)}>
                {t('common.cancel')}
              </button>
            </span>
          </form>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">{t('tasks.history')}</summary>
          <ol className="mt-2 grid gap-1">
            {[...x.history].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="text-mu">{when(h.at, lang)}</span>
                <span>
                  {t(`tasks.events.${h.action}`, { name: h.byName, note: h.note ?? '', defaultValue: h.action })}
                </span>
                {h.note && h.action !== 'assigned' && h.action !== 'due' && <q className="italic text-mu">{h.note}</q>}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}

/** Give a task (to people and whole teams), or change one. */
function TaskForm({
  draft,
  setDraft,
  people,
  teams,
  message,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  people: PersonRow[];
  teams: { id: string; name: string }[];
  message: { ok: boolean; text: string } | null;
  onSave: (e: FormEvent) => void;
}) {
  const { t } = useTranslation();
  const set = (change: Partial<Draft>) => setDraft({ ...draft, ...change });
  const chosen = draft.assigneeIds.length + draft.teamIds.length;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDraft(null)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
        className="grid max-h-[90vh] w-full max-w-[680px] gap-3 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSave}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="task-form-title" className="font-display text-xl font-bold">
            {draft.id ? t('tasks.form.editTitle') : t('tasks.form.newTitle')}
          </h2>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('cats.close')}
            onClick={() => setDraft(null)}
          >
            ×
          </button>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          {t('tasks.form.title')}
          <input
            className={field}
            required
            maxLength={150}
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('tasks.form.description')}
          <textarea
            className={field}
            rows={3}
            maxLength={1500}
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.kind')}
            <select
              className={field}
              value={draft.kind}
              onChange={(e) => set({ kind: e.target.value as Draft['kind'] })}
            >
              <option value="task">{t('tasks.kinds.task')}</option>
              <option value="target">{t('tasks.kinds.target')}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.priority')}
            <select
              className={field}
              value={draft.priority}
              onChange={(e) => set({ priority: e.target.value as Draft['priority'] })}
            >
              {(['high', 'med', 'low'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`tasks.priorities.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.points')}
            <input
              className={field}
              type="number"
              min={0}
              max={1000}
              value={draft.points}
              onChange={(e) => set({ points: Math.trunc(Number(e.target.value)) || 0 })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.start')}
            <input
              className={field}
              type="date"
              value={draft.startOn}
              onChange={(e) => set({ startOn: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.due')}
            <input
              className={field}
              type="date"
              min={draft.startOn || undefined}
              value={draft.dueOn}
              onChange={(e) => set({ dueOn: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.category')}
            <input
              className={field}
              maxLength={40}
              value={draft.category}
              onChange={(e) => set({ category: e.target.value })}
            />
          </label>
        </div>
        <label className="inline-flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-[var(--brand)]"
            checked={draft.needsReview}
            onChange={(e) => set({ needsReview: e.target.checked })}
          />
          <span>
            <b>{t('tasks.needsReview')}</b>
            <br />
            <small className="text-mu">{t('tasks.form.needsReviewHelp')}</small>
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('tasks.form.steps')}
          <textarea
            className={`${field} font-mono text-sm`}
            rows={4}
            placeholder={t('tasks.form.stepsPlaceholder')}
            value={draft.steps}
            onChange={(e) => set({ steps: e.target.value })}
          />
          <small className="font-normal text-mu">{t('tasks.form.stepsHelp')}</small>
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.labels')}
            <input
              className={field}
              placeholder={t('tasks.form.labelsPlaceholder')}
              value={draft.labels}
              onChange={(e) => set({ labels: e.target.value })}
            />
          </label>
          <fieldset className="grid gap-1 text-sm font-medium">
            <legend className="mb-1">{t('tasks.form.colour')}</legend>
            <span className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t('tasks.form.colour')}
                value={draft.colour || '#2f80ed'}
                onChange={(e) => set({ colour: e.target.value })}
              />
              {draft.colour && (
                <button type="button" className={smallButton} onClick={() => set({ colour: '' })}>
                  {t('tasks.form.noColour')}
                </button>
              )}
            </span>
          </fieldset>
        </div>

        {draft.id ? (
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.person')}
            <select className={field} value={draft.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
              {!people.some((p) => p.membershipId === draft.assigneeId) && <option value={draft.assigneeId}>-</option>}
              {people.map((p) => (
                <option key={p.membershipId} value={p.membershipId}>
                  {p.name} · {p.teamName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <PeoplePicker
            people={people}
            teams={teams}
            assigneeIds={draft.assigneeIds}
            teamIds={draft.teamIds}
            onChange={(assigneeIds, teamIds) => set({ assigneeIds, teamIds })}
          />
        )}
        <Notice message={message?.ok ? null : message} />
        <div className="flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={() => setDraft(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton} disabled={!draft.id && !chosen}>
            {draft.id ? t('tasks.form.save') : t('tasks.form.give')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Whole teams (each active agent gets their own card) and people, to give a task, a template or a sequence to. */
export function PeoplePicker({
  people,
  teams,
  assigneeIds,
  teamIds,
  onChange,
}: {
  people: PersonRow[];
  teams: { id: string; name: string }[];
  assigneeIds: string[];
  teamIds: string[];
  onChange: (assigneeIds: string[], teamIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const [find, setFind] = useState('');
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const matching = people.filter((p) => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase()));
  const chosen = assigneeIds.length + teamIds.length;
  return (
    <fieldset className="grid gap-2 rounded-s border border-bd p-3">
      <legend className="px-1 text-sm font-semibold">
        {t('tasks.form.giveTo')} {chosen > 0 && <span className="text-mu">({chosen})</span>}
      </legend>
      {teams.length > 0 && (
        <div className="grid gap-1">
          <span className="text-xs font-semibold uppercase text-mu">{t('tasks.form.teams')}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {teams.map((tm) => (
              <label key={tm.id} className="inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={teamIds.includes(tm.id)}
                  onChange={() => onChange(assigneeIds, toggle(teamIds, tm.id))}
                />
                {tm.name}
              </label>
            ))}
          </div>
          <small className="text-mu">{t('tasks.form.teamsHelp')}</small>
        </div>
      )}
      <div className="grid gap-1">
        <span className="text-xs font-semibold uppercase text-mu">{t('tasks.form.people')}</span>
        <input
          className={field}
          type="search"
          aria-label={t('tasks.form.findPerson')}
          placeholder={t('tasks.form.findPerson')}
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
        <div className="grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">
          {matching.map((p) => (
            <label key={p.membershipId} className="inline-flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={assigneeIds.includes(p.membershipId)}
                onChange={() => onChange(toggle(assigneeIds, p.membershipId), teamIds)}
              />
              {p.name} <small className="text-mu">· {p.teamName}</small>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
