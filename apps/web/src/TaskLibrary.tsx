// Tasks › Library (today's tasks.js Library), for those who give tasks:
// - History: every task given (a task given to several people at once is one line), to give it again with new dates,
//   or to save it as a template;
// - Templates: saved tasks, used by hand or repeating by themselves (every day, week, month or quarter, Monday to
//   Friday until Workforce brings rotas), and six ready-made ones written for any industry;
// - Sequences: steps given together, each a number of days after the start, once or every month or quarter.
import { localDay } from '@qsmart/shared';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Empty, td, th } from './bits';
import { currentLanguage } from './i18n';
import { type Draft, PeoplePicker, stepsFrom, stepsText, type Task, type TaskStep } from './Tasks';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, smallButton, useAction } from './ui';

type Kind = 'task' | 'checklist' | 'target';
type Freq = 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly';
type Priority = 'low' | 'med' | 'high';
export interface Template {
  id: string;
  title: string;
  description: string;
  kind: Kind;
  priority: Priority;
  points: number;
  steps: { text: string; minutes: number }[];
  labels: string[];
  colour: string;
  category: string;
  needsReview: boolean;
  freq: Freq;
  weekday: number;
  monthday: number;
  untilOn: string | null;
  userIds: string[];
  teamIds: string[];
  byName: string;
}
interface SeqStep {
  title: string;
  description: string;
  day: number;
  days: number;
  kind: 'task' | 'target';
  priority: Priority;
  points: number;
  needsReview: boolean;
  steps: { text: string; minutes: number }[];
}
interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: SeqStep[];
  byName: string;
}
interface Run {
  id: string;
  sequenceId: string;
  startOn: string;
  repeat: 'none' | 'monthly' | 'quarterly';
  untilOn: string | null;
  userIds: string[];
  teamIds: string[];
  cycles: string[];
  active: boolean;
}
type Section = 'history' | 'templates' | 'sequences';
const FREQS: Freq[] = ['none', 'daily', 'weekly', 'monthly', 'quarterly'];
const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';
const PRIORITY_LOOK = { high: 'text-bad', med: 'text-wn', low: 'text-ok' } as const;
const minutesOf = (steps: { minutes: number }[]) => steps.reduce((s, x) => s + x.minutes, 0);
const toSteps = (lines: TaskStep[]) => lines.map(({ text, minutes }) => ({ text, minutes }));

/** Six ready-made templates for any industry: "Add" opens the New template form filled in, to change and save. */
const READY: { key: string; kind: Kind; priority: Priority; colour: string; usually: Freq }[] = [
  { key: 'start', kind: 'checklist', priority: 'high', colour: '#3b82f6', usually: 'daily' },
  { key: 'end', kind: 'checklist', priority: 'med', colour: '#14b8a6', usually: 'daily' },
  { key: 'review', kind: 'target', priority: 'med', colour: '#a855f7', usually: 'weekly' },
  { key: 'update', kind: 'task', priority: 'high', colour: '#f97316', usually: 'none' },
  { key: 'followUp', kind: 'target', priority: 'high', colour: '#ef4444', usually: 'none' },
  { key: 'customers', kind: 'checklist', priority: 'med', colour: '#22c55e', usually: 'monthly' },
];

interface TemplateDraft {
  id?: string;
  title: string;
  description: string;
  kind: Kind;
  priority: Priority;
  points: number;
  steps: string;
  labels: string;
  colour: string;
  category: string;
  needsReview: boolean;
  freq: Freq;
  weekday: number;
  monthday: number;
  untilOn: string;
  userIds: string[];
  teamIds: string[];
}
const emptyTemplate = (): TemplateDraft => ({
  title: '',
  description: '',
  kind: 'checklist',
  priority: 'med',
  points: 0,
  steps: '',
  labels: '',
  colour: '#7c3aed',
  category: '',
  needsReview: false,
  freq: 'none',
  weekday: 1,
  monthday: 1,
  untilOn: '',
  userIds: [],
  teamIds: [],
});
interface SequenceDraft {
  id?: string;
  name: string;
  description: string;
  /** one line per step: "day | title | days" (the first day is 1) */
  steps: string;
  /** what the lines don't hold (priority, points, review, checklist) is kept for steps whose title stays */
  old: SeqStep[];
}
interface GiveDraft {
  sequence: Sequence;
  startOn: string;
  repeat: 'none' | 'monthly' | 'quarterly';
  untilOn: string;
  userIds: string[];
  teamIds: string[];
}
const seqLines = (steps: SeqStep[]) =>
  steps.map((s) => `${s.day + 1} | ${s.title}${s.days > 1 ? ` | ${s.days}` : ''}`).join('\n');
const seqSteps = (text: string, old: SeqStep[]): SeqStep[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((l) => {
      const parts = l.split('|').map((x) => x.trim());
      const [first = '', second = '', third = ''] = parts;
      const numbered = /^\d+$/.test(first);
      const title = (numbered ? second : first).slice(0, 150);
      const day = numbered ? Math.min(365, Math.max(0, Number(first) - 1)) : 0;
      const days = Math.min(90, Math.max(1, Number.parseInt(numbered ? third : second, 10) || 1));
      const kept = old.find((s) => s.title === title);
      return {
        title,
        description: kept?.description ?? '',
        day,
        days,
        kind: kept?.kind ?? 'task',
        priority: kept?.priority ?? 'med',
        points: kept?.points ?? 0,
        needsReview: kept?.needsReview ?? false,
        steps: kept?.steps ?? [],
      };
    })
    .filter((s) => s.title);

export function TaskLibrary({
  company,
  tasks,
  people,
  teams,
  startTask,
  openTask,
}: {
  company: CompanyRef;
  tasks: Task[];
  people: PersonRow[];
  teams: { id: string; name: string }[];
  startTask: (draft: Partial<Draft>) => void;
  openTask: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { message, run, fail } = useAction();
  const [section, setSection] = useState<Section>('history');
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [library, setLibrary] = useState<{ sequences: Sequence[]; runs: Run[] } | null>(null);
  const [tpl, setTpl] = useState<TemplateDraft | null>(null);
  const [seq, setSeq] = useState<SequenceDraft | null>(null);
  const [give, setGive] = useState<GiveDraft | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api<Template[]>('/task-templates', company.id).then(setTemplates, fail);
    api<{ sequences: Sequence[]; runs: Run[] }>('/task-sequences', company.id).then(setLibrary, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const nameOf = (id: string) => people.find((p) => p.membershipId === id)?.name ?? '-';
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name ?? '-';
  const whoText = (userIds: string[], teamIds: string[]) =>
    [...teamIds.map(teamName), ...userIds.map(nameOf)].join(', ') || '-';
  const repeatText = (x: Pick<Template, 'freq' | 'weekday' | 'monthday'>) =>
    x.freq === 'weekly'
      ? t('tasks.library.repeats.weeklyOn', { day: t(`tasks.library.weekdays.${x.weekday}`) })
      : x.freq === 'monthly' || x.freq === 'quarterly'
        ? t(`tasks.library.repeats.${x.freq}On`, { day: x.monthday })
        : t(`tasks.library.repeats.${x.freq}`);

  // ---- History: one line per group of tasks given together
  const history = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const x of tasks) groups.set(x.groupId, [...(groups.get(x.groupId) ?? []), x]);
    const q = query.trim().toLowerCase();
    return [...groups.values()]
      .map((list) => ({ list, first: list[0] as Task }))
      .filter(
        ({ list, first }) =>
          !q || [first.title, ...list.map((x) => x.assigneeName)].some((v) => v.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt));
  }, [tasks, query]);
  const again = (first: Task, list: Task[]) =>
    startTask({
      title: first.title,
      description: first.description,
      kind: first.kind,
      priority: first.priority,
      points: first.points,
      needsReview: first.needsReview,
      steps: stepsText(first.steps),
      labels: first.labels.join(', '),
      colour: first.colour,
      category: first.category,
      assigneeIds: [...new Set(list.map((x) => x.assigneeId).filter((id): id is string => !!id))],
      teamIds: [],
      startOn: '',
      dueOn: '',
    });
  const toTemplate = (x: Task) =>
    setTpl({
      ...emptyTemplate(),
      title: x.title,
      description: x.description,
      kind: x.kind === 'target' ? 'target' : x.steps.length ? 'checklist' : 'task',
      priority: x.priority,
      points: x.points,
      steps: stepsText(x.steps),
      labels: x.labels.join(', '),
      colour: x.colour || '#7c3aed',
      category: x.category,
      needsReview: x.needsReview,
    });
  const applyTemplate = (x: Template) =>
    startTask({
      title: x.title,
      description: x.description,
      kind: x.kind === 'target' ? 'target' : 'task',
      priority: x.priority,
      points: x.points,
      needsReview: x.needsReview,
      steps: stepsText(x.steps.map((s) => ({ ...s, done: false }))),
      labels: x.labels.join(', '),
      colour: x.colour,
      category: x.category,
      assigneeIds: x.userIds,
      teamIds: x.teamIds,
    });
  const addReady = (r: (typeof READY)[number]) =>
    setTpl({
      ...emptyTemplate(),
      title: t(`tasks.ready.${r.key}.title`),
      description: t(`tasks.ready.${r.key}.description`),
      category: t(`tasks.ready.${r.key}.category`),
      steps: t(`tasks.ready.${r.key}.steps`),
      kind: r.kind,
      priority: r.priority,
      colour: r.colour,
    });

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    if (!tpl) return;
    const body = {
      title: tpl.title,
      description: tpl.description,
      kind: tpl.kind,
      priority: tpl.priority,
      points: Number(tpl.points) || 0,
      steps: toSteps(stepsFrom(tpl.steps)),
      labels: tpl.labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8),
      colour: tpl.colour,
      category: tpl.category,
      needsReview: tpl.needsReview,
      freq: tpl.freq,
      weekday: Number(tpl.weekday),
      monthday: Number(tpl.monthday),
      untilOn: tpl.freq !== 'none' && tpl.untilOn ? tpl.untilOn : null,
      userIds: tpl.freq === 'none' ? [] : tpl.userIds,
      teamIds: tpl.freq === 'none' ? [] : tpl.teamIds,
    };
    const ok = await run(
      () =>
        api(tpl.id ? `/task-templates/${tpl.id}` : '/task-templates', company.id, {
          method: tpl.id ? 'PUT' : 'POST',
          body,
        }),
      t('tasks.library.templateSaved'),
      load,
    );
    if (ok) {
      setTpl(null);
      setSection('templates');
    }
  }
  async function saveSequence(e: FormEvent) {
    e.preventDefault();
    if (!seq) return;
    const body = { name: seq.name, description: seq.description, steps: seqSteps(seq.steps, seq.old) };
    const ok = await run(
      () =>
        api(seq.id ? `/task-sequences/${seq.id}` : '/task-sequences', company.id, {
          method: seq.id ? 'PUT' : 'POST',
          body,
        }),
      t('tasks.library.sequenceSaved'),
      load,
    );
    if (ok) setSeq(null);
  }
  async function giveSequence(e: FormEvent) {
    e.preventDefault();
    if (!give) return;
    const ok = await run(
      () =>
        api(`/task-sequences/${give.sequence.id}/give`, company.id, {
          method: 'POST',
          body: {
            startOn: give.startOn,
            repeat: give.repeat,
            untilOn: give.repeat !== 'none' && give.untilOn ? give.untilOn : null,
            userIds: give.userIds,
            teamIds: give.teamIds,
          },
        }),
      t('tasks.library.sequenceGiven'),
      load,
    );
    if (ok) setGive(null);
  }

  const tabButton = (on: boolean) =>
    `rounded-s px-3 py-1.5 text-sm font-semibold ${on ? 'bg-brand text-on-brand' : 'border border-bd hover:border-tx'}`;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('tasks.tabs.library')}>
          {(['history', 'templates', 'sequences'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={section === k}
              className={tabButton(section === k)}
              onClick={() => setSection(k)}
            >
              {t(`tasks.library.sections.${k}`)}
            </button>
          ))}
        </div>
        {section === 'templates' && (
          <button type="button" className={primaryButton} onClick={() => setTpl(emptyTemplate())}>
            + {t('tasks.library.newTemplate')}
          </button>
        )}
        {section === 'sequences' && (
          <button
            type="button"
            className={primaryButton}
            onClick={() => setSeq({ name: '', description: '', steps: '', old: [] })}
          >
            + {t('tasks.library.newSequence')}
          </button>
        )}
      </div>
      <Notice message={message} />

      {section === 'history' && (
        <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="grid gap-1 font-medium">
              {t('tasks.filters.search')}
              <input className={field} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <small className="pb-1.5 text-mu">{t('tasks.library.historyHelp', { count: history.length })}</small>
          </div>
          {!history.length ? (
            <Empty>{t('tasks.library.noHistory')}</Empty>
          ) : (
            <div className={`${card} overflow-x-auto p-3`}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>{t('tasks.cols.task')}</th>
                    <th className={th}>{t('tasks.library.givenTo')}</th>
                    <th className={th}>{t('tasks.library.givenOn')}</th>
                    <th className={th}>{t('tasks.cols.due')}</th>
                    <th className={th}>{t('tasks.cols.progress')}</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 150).map(({ list, first }) => {
                    const people = [...new Set(list.map((x) => x.assigneeName))];
                    const done = list.filter((x) => x.status === 'done').length;
                    return (
                      <tr key={first.groupId} className="border-t border-bd">
                        <td className={td}>
                          <button
                            type="button"
                            className="text-left font-semibold hover:underline"
                            onClick={() => openTask(first.id)}
                          >
                            {first.title}
                          </button>{' '}
                          {first.sequenceName && (
                            <span className={`${pill} bg-sunk text-mu`}>{first.sequenceName}</span>
                          )}
                          {first.templateId && (
                            <span className={`${pill} bg-ac/15 text-ac`}>{t('tasks.library.repeating')}</span>
                          )}
                        </td>
                        <td className={td}>
                          {people.length === 1 ? people[0] : t('tasks.library.people', { count: people.length })}
                        </td>
                        <td className={`${td} whitespace-nowrap`}>{localDay(first.createdAt)}</td>
                        <td className={`${td} whitespace-nowrap`}>{first.dueOn ?? '-'}</td>
                        <td className={td}>
                          <span className={`${pill} ${done === list.length ? 'bg-ok/15 text-ok' : 'bg-sunk text-mu'}`}>
                            {t('tasks.library.doneOf', { done, of: list.length })}
                          </span>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          <button type="button" className={smallButton} onClick={() => again(first, list)}>
                            {t('tasks.library.giveAgain')}
                          </button>{' '}
                          <button type="button" className={smallButton} onClick={() => toTemplate(first)}>
                            {t('tasks.library.saveAsTemplate')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {section === 'templates' && (
        <>
          <p className="text-sm text-mu">{t('tasks.library.templatesHelp', { count: templates?.length ?? 0 })}</p>
          {!templates ? (
            <p className="text-mu">{t('common.loading')}</p>
          ) : !templates.length ? (
            <Empty>{t('tasks.library.noTemplates')}</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((x) => (
                <LibraryCard
                  key={x.id}
                  colour={x.colour}
                  title={x.title}
                  description={x.description}
                  lines={x.steps.map((s) => [s.text, s.minutes ? t('tasks.minutes', { count: s.minutes }) : ''])}
                  chips={[
                    [t(`tasks.priorities.${x.priority}`), PRIORITY_LOOK[x.priority]],
                    [t(`tasks.library.kinds.${x.kind}`), ''],
                    ...(x.category ? [[x.category, ''] as [string, string]] : []),
                    ...(x.freq !== 'none' ? [[repeatText(x), 'text-ac'] as [string, string]] : []),
                  ]}
                  foot={
                    <>
                      <small className="text-mu">
                        {x.steps.length
                          ? t('tasks.library.steps', { count: x.steps.length })
                          : t('tasks.library.single')}
                        {minutesOf(x.steps) > 0 && ` · ${t('tasks.minutes', { count: minutesOf(x.steps) })}`}
                        {x.freq !== 'none' && (
                          <>
                            <br />
                            {t('tasks.library.goesTo', { who: whoText(x.userIds, x.teamIds) })}
                            {x.untilOn && ` · ${t('tasks.library.until', { date: x.untilOn })}`}
                          </>
                        )}
                        <br />
                        {t('tasks.library.madeBy', { name: x.byName })}
                      </small>
                      <span className="flex flex-wrap gap-2">
                        <button type="button" className={primaryButton} onClick={() => applyTemplate(x)}>
                          {t('tasks.library.use')}
                        </button>
                        <button
                          type="button"
                          className={smallButton}
                          onClick={() =>
                            setTpl({
                              id: x.id,
                              title: x.title,
                              description: x.description,
                              kind: x.kind,
                              priority: x.priority,
                              points: x.points,
                              steps: stepsText(x.steps.map((s) => ({ ...s, done: false }))),
                              labels: x.labels.join(', '),
                              colour: x.colour,
                              category: x.category,
                              needsReview: x.needsReview,
                              freq: x.freq,
                              weekday: x.weekday,
                              monthday: x.monthday,
                              untilOn: x.untilOn ?? '',
                              userIds: x.userIds,
                              teamIds: x.teamIds,
                            })
                          }
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          className={`${smallButton} text-bad`}
                          onClick={() => {
                            if (!window.confirm(t('tasks.library.confirmDeleteTemplate'))) return;
                            void run(
                              () => api(`/task-templates/${x.id}`, company.id, { method: 'DELETE' }),
                              t('tasks.library.templateDeleted'),
                              load,
                            );
                          }}
                        >
                          {t('common.delete')}
                        </button>
                      </span>
                    </>
                  }
                />
              ))}
            </div>
          )}
          <h2 className="mt-2 font-display text-lg font-bold">{t('tasks.library.readyTitle')}</h2>
          <p className="text-sm text-mu">{t('tasks.library.readyHelp')}</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {READY.map((r) => {
              const lines = stepsFrom(t(`tasks.ready.${r.key}.steps`));
              return (
                <LibraryCard
                  key={r.key}
                  colour={r.colour}
                  title={t(`tasks.ready.${r.key}.title`)}
                  description={t(`tasks.ready.${r.key}.description`)}
                  lines={lines.map((s) => [s.text, s.minutes ? t('tasks.minutes', { count: s.minutes }) : ''])}
                  chips={[
                    [t(`tasks.priorities.${r.priority}`), PRIORITY_LOOK[r.priority]],
                    [t(`tasks.library.kinds.${r.kind}`), ''],
                    [t(`tasks.ready.${r.key}.category`), ''],
                    ...(r.usually !== 'none'
                      ? [
                          [t('tasks.library.usually', { how: t(`tasks.library.repeats.${r.usually}`) }), 'text-ac'] as [
                            string,
                            string,
                          ],
                        ]
                      : []),
                  ]}
                  foot={
                    <button type="button" className={primaryButton} onClick={() => addReady(r)}>
                      + {t('tasks.library.add')}
                    </button>
                  }
                />
              );
            })}
          </div>
        </>
      )}

      {section === 'sequences' && (
        <>
          <p className="text-sm text-mu">{t('tasks.library.sequencesHelp')}</p>
          {!library ? (
            <p className="text-mu">{t('common.loading')}</p>
          ) : !library.sequences.length ? (
            <Empty>{t('tasks.library.noSequences')}</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {library.sequences.map((s) => {
                const runs = library.runs.filter((r) => r.sequenceId === s.id && r.active && r.repeat !== 'none');
                const length = Math.max(...s.steps.map((x) => x.day + x.days));
                return (
                  <LibraryCard
                    key={s.id}
                    colour="#a855f7"
                    title={s.name}
                    description={s.description}
                    lines={s.steps.map((x) => [
                      `${t('tasks.library.day', { n: x.day + 1 })} · ${x.title}`,
                      t('tasks.library.days', { count: x.days }),
                    ])}
                    chips={[]}
                    foot={
                      <>
                        {runs.map((r) => (
                          <small key={r.id} className="flex flex-wrap items-center gap-2 text-mu">
                            {t('tasks.library.runText', {
                              who: whoText(r.userIds, r.teamIds),
                              start: r.startOn,
                              how: t(`tasks.library.every.${r.repeat}`),
                            })}
                            {r.untilOn && ` · ${t('tasks.library.until', { date: r.untilOn })}`}
                            <button
                              type="button"
                              className={smallButton}
                              onClick={() => {
                                if (!window.confirm(t('tasks.library.confirmStop'))) return;
                                void run(
                                  () => api(`/task-sequences/runs/${r.id}`, company.id, { method: 'PUT', body: {} }),
                                  t('tasks.library.stopped'),
                                  load,
                                );
                              }}
                            >
                              {t('tasks.library.stop')}
                            </button>
                          </small>
                        ))}
                        <small className="text-mu">
                          {t('tasks.library.steps', { count: s.steps.length })} ·{' '}
                          {t('tasks.library.days', { count: length })}
                        </small>
                        <span className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={primaryButton}
                            onClick={() =>
                              setGive({
                                sequence: s,
                                startOn: localDay(new Date()),
                                repeat: 'none',
                                untilOn: '',
                                userIds: [],
                                teamIds: [],
                              })
                            }
                          >
                            {t('tasks.library.give')}
                          </button>
                          <button
                            type="button"
                            className={smallButton}
                            onClick={() =>
                              setSeq({
                                id: s.id,
                                name: s.name,
                                description: s.description,
                                steps: seqLines(s.steps),
                                old: s.steps,
                              })
                            }
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            className={`${smallButton} text-bad`}
                            onClick={() => {
                              if (!window.confirm(t('tasks.library.confirmDeleteSequence'))) return;
                              void run(
                                () => api(`/task-sequences/${s.id}`, company.id, { method: 'DELETE' }),
                                t('tasks.library.sequenceDeleted'),
                                load,
                              );
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        </span>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {tpl && (
        <Dialog
          title={tpl.id ? t('tasks.library.editTemplate') : t('tasks.library.newTemplate')}
          onClose={() => setTpl(null)}
          onSubmit={saveTemplate}
        >
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.library.form.name')}
            <input
              className={field}
              required
              maxLength={150}
              value={tpl.title}
              onChange={(e) => setTpl({ ...tpl, title: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.description')}
            <textarea
              className={field}
              rows={2}
              maxLength={1500}
              value={tpl.description}
              onChange={(e) => setTpl({ ...tpl, description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">
              {t('tasks.form.kind')}
              <select
                className={field}
                value={tpl.kind}
                onChange={(e) => setTpl({ ...tpl, kind: e.target.value as Kind })}
              >
                {(['task', 'checklist', 'target'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`tasks.library.kinds.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('tasks.form.priority')}
              <select
                className={field}
                value={tpl.priority}
                onChange={(e) => setTpl({ ...tpl, priority: e.target.value as Priority })}
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
                value={tpl.points}
                onChange={(e) => setTpl({ ...tpl, points: Math.trunc(Number(e.target.value)) || 0 })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('tasks.form.category')}
              <input
                className={field}
                maxLength={40}
                value={tpl.category}
                onChange={(e) => setTpl({ ...tpl, category: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('tasks.form.colour')}
              <input
                type="color"
                className="h-9"
                value={tpl.colour || '#7c3aed'}
                onChange={(e) => setTpl({ ...tpl, colour: e.target.value })}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.steps')}
            <textarea
              className={`${field} font-mono text-sm`}
              rows={4}
              placeholder={t('tasks.form.stepsPlaceholder')}
              value={tpl.steps}
              onChange={(e) => setTpl({ ...tpl, steps: e.target.value })}
            />
            <small className="font-normal text-mu">{t('tasks.form.stepsHelp')}</small>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.labels')}
            <input
              className={field}
              placeholder={t('tasks.form.labelsPlaceholder')}
              value={tpl.labels}
              onChange={(e) => setTpl({ ...tpl, labels: e.target.value })}
            />
          </label>
          <label className="inline-flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--brand)]"
              checked={tpl.needsReview}
              onChange={(e) => setTpl({ ...tpl, needsReview: e.target.checked })}
            />
            <span>
              <b>{t('tasks.needsReview')}</b>
              <br />
              <small className="text-mu">{t('tasks.form.needsReviewHelp')}</small>
            </span>
          </label>
          <fieldset className="grid gap-2 rounded-s border border-bd p-3">
            <legend className="px-1 text-sm font-semibold">{t('tasks.library.form.repeats')}</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium">
                {t('tasks.library.form.repeats')}
                <select
                  className={field}
                  value={tpl.freq}
                  onChange={(e) => setTpl({ ...tpl, freq: e.target.value as Freq })}
                >
                  {FREQS.map((f) => (
                    <option key={f} value={f}>
                      {t(`tasks.library.freqs.${f}`)}
                    </option>
                  ))}
                </select>
              </label>
              {tpl.freq === 'weekly' && (
                <label className="grid gap-1 text-sm font-medium">
                  {t('tasks.library.form.on')}
                  <select
                    className={field}
                    value={tpl.weekday}
                    onChange={(e) => setTpl({ ...tpl, weekday: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {t(`tasks.library.weekdays.${d}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(tpl.freq === 'monthly' || tpl.freq === 'quarterly') && (
                <label className="grid gap-1 text-sm font-medium">
                  {t('tasks.library.form.monthday')}
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={28}
                    value={tpl.monthday}
                    onChange={(e) =>
                      setTpl({ ...tpl, monthday: Math.min(28, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) })
                    }
                  />
                </label>
              )}
              {tpl.freq !== 'none' && (
                <label className="grid gap-1 text-sm font-medium">
                  {t('tasks.library.form.until')}
                  <input
                    className={field}
                    type="date"
                    value={tpl.untilOn}
                    onChange={(e) => setTpl({ ...tpl, untilOn: e.target.value })}
                  />
                </label>
              )}
            </div>
            <small className="text-mu">
              {tpl.freq === 'none' ? t('tasks.library.form.byHand') : t('tasks.library.form.repeatHelp')}
              {tpl.freq === 'quarterly' && ` ${t('tasks.library.form.quarterHelp')}`}
            </small>
            {tpl.freq !== 'none' && (
              <PeoplePicker
                people={people}
                teams={teams}
                assigneeIds={tpl.userIds}
                teamIds={tpl.teamIds}
                onChange={(userIds, teamIds) => setTpl({ ...tpl, userIds, teamIds })}
              />
            )}
          </fieldset>
          <Notice message={message?.ok ? null : message} />
          <div className="flex justify-end gap-2">
            <button type="button" className={smallButton} onClick={() => setTpl(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={primaryButton}
              disabled={tpl.freq !== 'none' && !tpl.userIds.length && !tpl.teamIds.length}
            >
              {t('tasks.form.save')}
            </button>
          </div>
        </Dialog>
      )}

      {seq && (
        <Dialog
          title={seq.id ? t('tasks.library.editSequence') : t('tasks.library.newSequence')}
          onClose={() => setSeq(null)}
          onSubmit={saveSequence}
        >
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.library.form.name')}
            <input
              className={field}
              required
              maxLength={80}
              placeholder={t('tasks.library.form.sequencePlaceholder')}
              value={seq.name}
              onChange={(e) => setSeq({ ...seq, name: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.form.description')}
            <textarea
              className={field}
              rows={2}
              maxLength={600}
              value={seq.description}
              onChange={(e) => setSeq({ ...seq, description: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('tasks.library.form.sequenceSteps')}
            <textarea
              className={`${field} font-mono text-sm`}
              rows={6}
              required
              placeholder={t('tasks.library.form.sequenceStepsPlaceholder')}
              value={seq.steps}
              onChange={(e) => setSeq({ ...seq, steps: e.target.value })}
            />
            <small className="font-normal text-mu">{t('tasks.library.form.sequenceStepsHelp')}</small>
          </label>
          <Notice message={message?.ok ? null : message} />
          <div className="flex justify-end gap-2">
            <button type="button" className={smallButton} onClick={() => setSeq(null)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={primaryButton}>
              {t('tasks.form.save')}
            </button>
          </div>
        </Dialog>
      )}

      {give && (
        <Dialog
          title={t('tasks.library.giveTitle', { name: give.sequence.name })}
          onClose={() => setGive(null)}
          onSubmit={giveSequence}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">
              {t('tasks.form.start')}
              <input
                className={field}
                type="date"
                required
                value={give.startOn}
                onChange={(e) => setGive({ ...give, startOn: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('tasks.library.form.again')}
              <select
                className={field}
                value={give.repeat}
                onChange={(e) => setGive({ ...give, repeat: e.target.value as GiveDraft['repeat'] })}
              >
                {(['none', 'monthly', 'quarterly'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`tasks.library.every.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            {give.repeat !== 'none' && (
              <label className="grid gap-1 text-sm font-medium">
                {t('tasks.library.form.until')}
                <input
                  className={field}
                  type="date"
                  min={give.startOn}
                  value={give.untilOn}
                  onChange={(e) => setGive({ ...give, untilOn: e.target.value })}
                />
              </label>
            )}
          </div>
          <small className="text-mu">{t('tasks.library.giveHelp', { count: give.sequence.steps.length })}</small>
          <PeoplePicker
            people={people}
            teams={teams}
            assigneeIds={give.userIds}
            teamIds={give.teamIds}
            onChange={(userIds, teamIds) => setGive({ ...give, userIds, teamIds })}
          />
          <Notice message={message?.ok ? null : message} />
          <div className="flex justify-end gap-2">
            <button type="button" className={smallButton} onClick={() => setGive(null)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={primaryButton} disabled={!give.userIds.length && !give.teamIds.length}>
              {t('tasks.library.give')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** One template, ready-made template or sequence: its colour, title, lines and what can be done with it. */
function LibraryCard({
  colour,
  title,
  description,
  lines,
  chips,
  foot,
}: {
  colour: string;
  title: string;
  description: string;
  lines: [string, string][];
  chips: [string, string][];
  foot: ReactNode;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  return (
    <section
      className={`${card} grid content-start gap-2 p-4`}
      style={{ borderTop: `4px solid ${colour || '#94a3b8'}` }}
      aria-label={title}
    >
      <div>
        <b className="text-base">{title}</b>
        {description && <p className="text-sm text-mu">{description}</p>}
      </div>
      {lines.length > 0 ? (
        <ul className="grid gap-0.5 text-sm" lang={lang}>
          {lines.slice(0, 6).map(([text, note], i) => (
            <li key={i} className="flex justify-between gap-2 border-t border-bd pt-0.5">
              <span>{text}</span>
              {note && <small className="whitespace-nowrap text-mu">{note}</small>}
            </li>
          ))}
          {lines.length > 6 && (
            <small className="text-mu">{t('tasks.library.more', { count: lines.length - 6 })}</small>
          )}
        </ul>
      ) : (
        <small className="text-mu">{t('tasks.library.single')}</small>
      )}
      {chips.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {chips.map(([text, look], i) => (
            <span key={i} className={`${pill} bg-sunk ${look}`}>
              {text}
            </span>
          ))}
        </p>
      )}
      <div className="mt-auto grid gap-2 border-t border-bd pt-2">{foot}</div>
    </section>
  );
}

function Dialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="grid max-h-[90vh] w-full max-w-[680px] gap-3 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('cats.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </form>
    </div>
  );
}
