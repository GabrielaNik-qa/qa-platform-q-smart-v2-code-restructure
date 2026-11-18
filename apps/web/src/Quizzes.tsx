// Learning › Quizzes (Phase 6, piece 2; today's Quizzes): weekly, monthly, category and custom quizzes. Staff write them
// (by hand or with the AI question writer), give them to all agents, to some teams or to chosen people, with a deadline,
// a pass mark and a number of tries, and see who took them. Agents see the quizzes given to them and take them: the right
// answers come back only once passed or when no try is left.
import { can, localDay } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Empty } from './bits';
import { blankQuestion, type Question, QuestionsEditor } from './QuestionsEditor';
import {
  card,
  CheckList,
  type CompanyRef,
  dangerButton,
  field,
  Notice,
  type PersonRow,
  primaryButton,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

type Kind = 'weekly' | 'monthly' | 'category' | 'custom';
const KINDS: Kind[] = ['weekly', 'monthly', 'category', 'custom'];
interface Quiz {
  id: string;
  title: string;
  description: string;
  kind: Kind;
  topics: string[];
  articleIds: string[];
  pass: number;
  dueOn: string | null;
  assignAll: boolean;
  assignTeams: string[];
  assignPeople: string[];
  status: 'draft' | 'published';
  tries: number;
  questions: Question[];
  stats?: { takers: number; passed: number; average: number | null };
}
interface Listed {
  staff: boolean;
  quizzes: Quiz[];
  attempts: { quizId: string; score: number; passed: boolean; at: string }[];
}
interface Draft {
  id?: string;
  title: string;
  description: string;
  kind: Kind;
  dueOn: string;
  pass: number;
  tries: number;
  topics: string;
  assignAll: boolean;
  assignTeams: string[];
  assignPeople: string[];
  articleIds: string[];
  questions: Question[];
}
interface Result {
  score: number;
  passed: boolean;
  pass: number;
  left: number | null;
  results: { ok: boolean; a?: number; why?: string }[];
}
interface TestState {
  quiz: Quiz;
  answers: (number | null)[];
  result: Result | null;
}
interface ArticleRef {
  id: string;
  title: string;
  updatedAt: string;
}

const blank = (): Draft => ({
  title: '',
  description: '',
  kind: 'weekly',
  dueOn: '',
  pass: 80,
  tries: 3,
  topics: '',
  assignAll: true,
  assignTeams: [],
  assignPeople: [],
  articleIds: [],
  questions: [blankQuestion()],
});
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDay(d);
};

export function Quizzes({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const staff = can(company.role, 'learning.write');
  const { message, run, fail } = useAction();
  const [data, setData] = useState<Listed | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [agents, setAgents] = useState<PersonRow[]>([]);
  const [articles, setArticles] = useState<ArticleRef[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(() => {
    api<Listed>('/quizzes', company.id).then(setData, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!staff) return;
    api<TeamRow[]>('/teams', company.id).then((l) => setTeams(l.filter((x) => !x.isAdministration)), fail);
    api<PersonRow[]>('/people', company.id).then(
      (l) => setAgents(l.filter((p) => p.role === 'agent' && p.active)),
      fail,
    );
    api<{ articles: ArticleRef[] }>('/kb', company.id).then((k) => setArticles(k.articles), fail);
  }, [company.id, staff, fail]);

  const today = localDay(new Date());
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name ?? '';

  function edit(q: Quiz) {
    setDraft({
      id: q.id,
      title: q.title,
      description: q.description,
      kind: q.kind,
      dueOn: q.dueOn ?? '',
      pass: q.pass,
      tries: q.tries,
      topics: q.topics.join(', '),
      assignAll: q.assignAll,
      assignTeams: q.assignTeams,
      assignPeople: q.assignPeople,
      articleIds: q.articleIds,
      questions: q.questions.length ? q.questions.map((x) => ({ ...x, opts: [...x.opts] })) : [blankQuestion()],
    });
  }
  async function save(d: Draft, status: 'draft' | 'published') {
    const body = {
      title: d.title,
      description: d.description,
      kind: d.kind,
      topics: d.topics
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      articleIds: d.articleIds,
      pass: d.pass,
      dueOn: d.dueOn || null,
      assignAll: d.assignAll,
      assignTeams: d.assignAll ? [] : d.assignTeams,
      assignPeople: d.assignAll ? [] : d.assignPeople,
      status,
      tries: d.tries,
      questions: d.questions,
    };
    const ok = await run(
      () => api(d.id ? `/quizzes/${d.id}` : '/quizzes', company.id, { method: d.id ? 'PUT' : 'POST', body }),
      t(status === 'published' ? 'quizzes.published' : 'quizzes.savedDraft'),
      load,
    );
    if (ok) setDraft(null);
  }
  async function remove(q: Quiz) {
    if (!window.confirm(t('quizzes.confirmDelete', { name: q.title }))) return;
    await run(() => api(`/quizzes/${q.id}`, company.id, { method: 'DELETE' }), t('kb.deleted'), load);
  }
  /** The AI question writer: questions from the ticked articles, added for the author to check. */
  async function write(d: Draft, ids = d.articleIds) {
    setWriting(true);
    try {
      const out = await api<{ questions: Question[] }>('/learning/quiz-questions', company.id, {
        method: 'POST',
        body: { articleIds: ids, count: 5 },
      });
      setDraft((cur) =>
        cur ? { ...cur, questions: [...cur.questions.filter((x) => x.q.trim()), ...out.questions] } : cur,
      );
    } catch (e) {
      fail(e);
    }
    setWriting(false);
  }
  /** "This week's articles" or "this month's": the articles added or changed lately, and questions from them. */
  async function recent(d: Draft, kind: 'weekly' | 'monthly') {
    const since = Date.now() - (kind === 'monthly' ? 30 : 7) * 86_400_000;
    const ids = articles.filter((a) => Date.parse(a.updatedAt) >= since).map((a) => a.id);
    if (!ids.length) return void fail(new Error(t('quizzes.noRecent', { days: kind === 'monthly' ? 30 : 7 })));
    const next = { ...d, kind, articleIds: ids, dueOn: d.dueOn || addDays(kind === 'monthly' ? 14 : 5) };
    setDraft(next);
    await write(next, ids);
  }
  async function submit() {
    if (!test) return;
    if (test.answers.some((x) => x === null)) return void fail(new Error(t('kb.test.answerAll')));
    try {
      const result = await api<Result>(`/quizzes/${test.quiz.id}/attempt`, company.id, {
        method: 'POST',
        body: { answers: test.answers },
      });
      setTest({ ...test, result });
      load();
    } catch (e) {
      fail(e);
    }
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.quiz')}</h1>
        <p className="text-sm text-mu">{t(staff ? 'quizzes.introStaff' : 'quizzes.introAgent')}</p>
      </div>
      {staff && !draft && !test && (
        <button type="button" className={primaryButton} onClick={() => setDraft(blank())}>
          + {t('quizzes.new')}
        </button>
      )}
    </div>
  );
  if (!data)
    return (
      <section className="grid gap-4">
        {header}
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );

  // ------------------------------------------------------------------------------------------ taking a quiz
  if (test) {
    const q = test.quiz;
    const r = test.result;
    return (
      <section className="grid gap-4">
        {header}
        <div className={`${card} grid gap-4`} aria-labelledby="quiz-test-title">
          <div>
            <span className="text-xs font-semibold uppercase text-mu">{t('quizzes.quiz')}</span>
            <h2 id="quiz-test-title" className="font-display text-xl font-bold">
              {q.title}
            </h2>
          </div>
          {r ? (
            <>
              <p role="status" className="text-center">
                <span className={`block text-4xl font-bold ${r.passed ? 'text-ok' : 'text-bad'}`}>{r.score}%</span>
                {r.passed ? t('kb.test.passed') : t('kb.test.notPassed', { pass: r.pass })}
                {r.left !== null && (
                  <small className="block text-mu">{t('quizzes.triesLeft', { count: r.left })}</small>
                )}
              </p>
              {q.questions.map((x, i) => (
                <div key={i} className="grid gap-1 rounded-s border border-bd p-3 text-sm">
                  <b>
                    {i + 1}. {x.q}
                  </b>
                  {x.opts.map((o, j) => {
                    const right = r.results[i]?.a === j;
                    const wrong = j === test.answers[i] && !right;
                    return (
                      <span key={j} className={right ? 'font-semibold text-ok' : wrong ? 'text-bad' : ''}>
                        {right ? '✓' : wrong ? '✗' : '○'} {o}
                      </span>
                    );
                  })}
                  {r.results[i]?.a === undefined && (
                    <small className={r.results[i]?.ok ? 'text-ok' : 'text-bad'}>
                      {t(r.results[i]?.ok ? 'quizzes.right' : 'quizzes.wrong')}
                    </small>
                  )}
                  {r.results[i]?.why && <small className="text-mu">{r.results[i]?.why}</small>}
                </div>
              ))}
              {r.left === 0 && !r.passed && <p className="text-sm text-bad">{t('quizzes.noTriesLeft')}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className={smallButton} onClick={() => setTest(null)}>
                  {t('kb.test.close')}
                </button>
                {!r.passed && r.left !== 0 && (
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() => setTest({ quiz: q, answers: q.questions.map(() => null), result: null })}
                  >
                    {t('kb.test.again')}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-mu">{t('quizzes.testIntro', { pass: q.pass, tries: q.tries })}</p>
              {q.questions.map((x, i) => (
                <fieldset key={i} className="grid gap-1 rounded-s border border-bd p-3 text-sm">
                  <legend className="px-1 font-semibold">
                    {i + 1}. {x.q}
                  </legend>
                  {x.opts.map((o, j) => (
                    <label key={j} className="inline-flex items-center gap-2 py-0.5">
                      <input
                        type="radio"
                        name={`quiz-q${i}`}
                        className="accent-[var(--brand)]"
                        checked={test.answers[i] === j}
                        onChange={() => setTest({ ...test, answers: test.answers.map((a, k) => (k === i ? j : a)) })}
                      />
                      {o}
                    </label>
                  ))}
                </fieldset>
              ))}
              <div className="flex justify-end gap-2">
                <button type="button" className={smallButton} onClick={() => setTest(null)}>
                  {t('kb.cancel')}
                </button>
                <button type="button" className={primaryButton} onClick={() => void submit()}>
                  {t('kb.test.submit')}
                </button>
              </div>
            </>
          )}
        </div>
        <Notice message={message} />
      </section>
    );
  }

  // ------------------------------------------------------------------------------------------ writing a quiz
  if (draft) {
    const d = draft;
    const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
    return (
      <section className="grid gap-4">
        {header}
        <form
          className={`${card} grid gap-4`}
          aria-labelledby="quiz-edit-title"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save(d, 'draft');
          }}
        >
          <h2 id="quiz-edit-title" className="text-lg font-semibold">
            {d.id ? t('quizzes.edit') : t('quizzes.new')}
          </h2>
          <label className="grid gap-1 text-sm font-medium">
            {t('kb.articleTitle')}
            <input
              className={field}
              value={d.title}
              maxLength={150}
              required
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('kb.description')}
            <input
              className={field}
              value={d.description}
              maxLength={400}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              {t('quizzes.type')}
              <select className={field} value={d.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`quizzes.kinds.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('quizzes.deadline')}
              <input type="date" className={field} value={d.dueOn} onChange={(e) => set({ dueOn: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('kb.passMark')}
              <input
                type="number"
                min={1}
                max={100}
                className={field}
                value={d.pass}
                onChange={(e) => set({ pass: Number(e.target.value) })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('quizzes.tries')}
              <input
                type="number"
                min={1}
                max={20}
                className={field}
                value={d.tries}
                onChange={(e) => set({ tries: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            {t('kb.topics')}
            <input className={field} value={d.topics} onChange={(e) => set({ topics: e.target.value })} />
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t('quizzes.giveTo')}</legend>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={d.assignAll}
                onChange={(e) => set({ assignAll: e.target.checked })}
              />
              {t('quizzes.allAgents')}
            </label>
            {!d.assignAll && (
              <>
                <CheckList
                  legend={t('quizzes.teams')}
                  options={teams.map((x) => ({ id: x.id, label: x.name }))}
                  value={d.assignTeams}
                  onChange={(v) => set({ assignTeams: v })}
                />
                <CheckList
                  legend={t('quizzes.people')}
                  options={agents.map((p) => ({ id: p.membershipId, label: p.name }))}
                  value={d.assignPeople}
                  onChange={(v) => set({ assignPeople: v })}
                />
              </>
            )}
          </fieldset>
          <CheckList
            legend={t('quizzes.basedOn')}
            options={articles.map((a) => ({ id: a.id, label: a.title }))}
            value={d.articleIds}
            onChange={(v) => set({ articleIds: v })}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} disabled={writing} onClick={() => void recent(d, 'weekly')}>
              ✨ {t('quizzes.thisWeek')}
            </button>
            <button type="button" className={smallButton} disabled={writing} onClick={() => void recent(d, 'monthly')}>
              ✨ {t('quizzes.thisMonth')}
            </button>
          </div>
          <QuestionsEditor
            name="quiz"
            questions={d.questions}
            onChange={(questions) => set({ questions })}
            writing={writing}
            onWrite={() => void write(d)}
          />
          <Notice message={message} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={smallButton}>
              {t('quizzes.saveDraft')}
            </button>
            <button type="button" className={primaryButton} onClick={() => void save(d, 'published')}>
              {t('quizzes.publish')}
            </button>
            <button type="button" className={smallButton} onClick={() => setDraft(null)}>
              {t('kb.cancel')}
            </button>
          </div>
        </form>
      </section>
    );
  }

  // ------------------------------------------------------------------------------------------ the lists
  if (staff)
    return (
      <section className="grid gap-4">
        {header}
        <Notice message={message} />
        {data.quizzes.length === 0 ? (
          <Empty>{t('quizzes.none')}</Empty>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-mu">
                <tr>
                  {['quiz', 'type', 'deadline', 'givenTo', 'status', 'takenBy', 'passed', 'average'].map((h) => (
                    <th key={h} className="py-1 pr-3 font-semibold">
                      {t(`quizzes.cols.${h}`)}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.quizzes.map((q) => (
                  <tr key={q.id} className="border-t border-bd align-top">
                    <td className="py-2 pr-3">
                      <button type="button" className="font-semibold text-brand underline" onClick={() => edit(q)}>
                        {q.title}
                      </button>
                      <small className="block text-mu">
                        {t('quizzes.facts', { n: q.questions.length, pass: q.pass })}
                      </small>
                    </td>
                    <td className="py-2 pr-3">{t(`quizzes.kinds.${q.kind}`)}</td>
                    <td className="py-2 pr-3">{q.dueOn ?? '-'}</td>
                    <td className="py-2 pr-3">
                      {q.assignAll
                        ? t('quizzes.allAgents')
                        : [
                            ...q.assignTeams.map(teamName).filter(Boolean),
                            q.assignPeople.length ? t('quizzes.peopleCount', { count: q.assignPeople.length }) : '',
                          ]
                            .filter(Boolean)
                            .join(', ') || '-'}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 text-xs ${q.status === 'published' ? 'bg-ok/15 text-ok' : 'bg-wn/15 text-wn'}`}
                      >
                        {t(`quizzes.status.${q.status}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{q.stats?.takers ?? 0}</td>
                    <td className="py-2 pr-3">{q.stats?.passed ?? 0}</td>
                    <td className="py-2 pr-3">{q.stats?.average == null ? '-' : `${q.stats.average}%`}</td>
                    <td className="flex gap-1 py-2">
                      <button type="button" className={smallButton} onClick={() => edit(q)}>
                        {t('kb.edit')}
                      </button>
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() => setTest({ quiz: q, answers: q.questions.map(() => null), result: null })}
                      >
                        {t('quizzes.tryOut')}
                      </button>
                      <button type="button" className={dangerButton} onClick={() => void remove(q)}>
                        {t('kb.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );

  return (
    <section className="grid gap-4">
      {header}
      <Notice message={message} />
      {data.quizzes.length === 0 ? (
        <Empty>{t('quizzes.noneAgent')}</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.quizzes.map((q) => {
            const mine = data.attempts.filter((a) => a.quizId === q.id);
            const best = Math.max(0, ...mine.map((a) => a.score));
            const passed = mine.some((a) => a.passed);
            const left = Math.max(0, q.tries - mine.length);
            const overdue = !!q.dueOn && q.dueOn < today && !passed;
            return (
              <li key={q.id} className={`${card} grid gap-2`}>
                <h2 className="font-semibold">{q.title}</h2>
                <p className="flex flex-wrap gap-1 text-xs">
                  <span className="rounded-full bg-brand/10 px-2 text-brand">{t(`quizzes.kinds.${q.kind}`)}</span>
                  {q.dueOn && (
                    <span className={`rounded-full px-2 ${overdue ? 'bg-bad/15 text-bad' : 'bg-wn/15 text-wn'}`}>
                      {t(overdue ? 'quizzes.overdue' : 'quizzes.due', { date: q.dueOn })}
                    </span>
                  )}
                  {passed ? (
                    <span className="rounded-full bg-ok/15 px-2 text-ok">✓ {t('kb.test.passed')}</span>
                  ) : mine.length ? (
                    <span className="rounded-full bg-wn/15 px-2 text-wn">{t('quizzes.best', { n: best })}</span>
                  ) : (
                    <span className="rounded-full bg-bad/15 px-2 text-bad">{t('quizzes.notTaken')}</span>
                  )}
                </p>
                {q.description && <p className="text-sm text-mu">{q.description}</p>}
                <p className="text-sm text-mu">
                  {t('quizzes.facts', { n: q.questions.length, pass: q.pass })} ·{' '}
                  {t('quizzes.triesLeft', { count: passed ? q.tries : left })}
                </p>
                <div>
                  <button
                    type="button"
                    className={passed ? smallButton : primaryButton}
                    disabled={!passed && left === 0}
                    onClick={() => setTest({ quiz: q, answers: q.questions.map(() => null), result: null })}
                  >
                    {mine.length ? t('quizzes.retake') : t('quizzes.start')}
                  </button>
                  {!passed && left === 0 && <small className="ml-2 text-bad">{t('quizzes.noTriesLeft')}</small>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
