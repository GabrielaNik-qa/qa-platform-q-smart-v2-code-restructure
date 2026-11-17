// Learning › Knowledge Base (Phase 6, piece 1; today's Learning page): folders in a tree (Confluence-like), articles in
// Markdown, topics, search, "mark as read" for an article or a whole folder, stars, reactions and comments, required
// reading, and an optional test at the end of a lesson. Staff write; everyone reads what is open to their team (the
// server decides what each person receives).
import { articleRequired, can, folderChain, folderTree, KB_REACTIONS } from '@qsmart/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { when } from './Activity';
import { api } from './api';
import { Empty } from './bits';
import { currentLanguage } from './i18n';
import { Markdown } from './Markdown';
import {
  card,
  CheckList,
  type CompanyRef,
  dangerButton,
  field,
  Notice,
  primaryButton,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

interface Question {
  q: string;
  opts: string[];
  a: number;
  why: string;
}
interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  colour: string;
  icon: string;
  description: string;
  reqOn: boolean;
  reqTeams: string[];
  teams: string[];
}
interface Article {
  id: string;
  folderId: string | null;
  title: string;
  emoji: string;
  topics: string[];
  body: string;
  reqOn: boolean;
  reqTeams: string[];
  quiz: { pass: number; questions: Question[] } | null;
  reactions: Record<string, string[]>;
  comments: { id: string; byId: string | null; name: string; text: string; at: string }[];
  authorName: string;
  editorName: string;
  createdAt: string;
  updatedAt: string;
}
interface Kb {
  folders: Folder[];
  articles: Article[];
  me: { id: string | null; teamId: string | null; staff: boolean };
  reads: Record<string, string>;
  stars: string[];
  attempts: { articleId: string; score: number; passed: boolean; at: string }[];
}
interface FolderDraft {
  id?: string;
  parentId: string;
  name: string;
  colour: string;
  icon: string;
  description: string;
  reqOn: boolean;
  reqTeams: string[];
  teams: string[];
}
interface ArticleDraft {
  id?: string;
  folderId: string;
  title: string;
  emoji: string;
  topics: string;
  body: string;
  reqOn: boolean;
  reqTeams: string[];
  quizOn: boolean;
  pass: number;
  questions: Question[];
  view: 'write' | 'preview';
}
interface TestState {
  article: Article;
  answers: (number | null)[];
  result: { score: number; passed: boolean; pass: number; results: { ok: boolean; a: number; why: string }[] } | null;
}

const COLOURS = ['#2563eb', '#7c3aed', '#0d9488', '#e11d48', '#ea580c', '#16a34a', '#ca8a04'];
const ICONS = ['📁', '📘', '📗', '📙', '📕', '🧭', '💡', '🎯'];
const blankQuestion = (): Question => ({ q: '', opts: ['', '', '', ''], a: 0, why: '' });
const blankFolder = (parentId: string): FolderDraft => ({
  parentId,
  name: '',
  colour: '#ea580c',
  icon: '📁',
  description: '',
  reqOn: false,
  reqTeams: [],
  teams: [],
});
const blankArticle = (folderId: string): ArticleDraft => ({
  folderId,
  title: '',
  emoji: '📄',
  topics: '',
  body: '',
  reqOn: false,
  reqTeams: [],
  quizOn: false,
  pass: 80,
  questions: [blankQuestion()],
  view: 'write',
});

export function KnowledgeBase({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { article?: string };
  const { message, run, fail } = useAction();
  const [data, setData] = useState<Kb | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [folderId, setFolderId] = useState('');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [group, setGroup] = useState<'none' | 'topic' | 'folder'>('none');
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [editor, setEditor] = useState<ArticleDraft | null>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [mode, setMode] = useState<'move' | 'cascade'>('move');
  const writes = can(company.role, 'learning.write');
  const open = search.article ?? null;

  const load = useCallback(() => {
    api<Kb>('/kb', company.id).then(setData, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    if (writes) api<TeamRow[]>('/teams', company.id).then((l) => setTeams(l.filter((x) => !x.isAdministration)), fail);
  }, [company.id, writes, fail]);

  const folders = useMemo(() => data?.folders ?? [], [data]);
  const articles = useMemo(() => data?.articles ?? [], [data]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const isAgent = company.role === 'agent';
  const required = (a: Article) =>
    isAgent &&
    articleRequired(folders, { folderId: a.folderId, reqOn: a.reqOn, reqTeams: a.reqTeams }, data?.me.teamId ?? null);
  const folderRequired = (f: Folder) =>
    isAgent && articleRequired(folders, { folderId: f.id, reqOn: false, reqTeams: [] }, data?.me.teamId ?? null);
  const isRead = (a: Article) => !!data?.reads[a.id];
  const attemptsOf = (a: Article) => data?.attempts.filter((x) => x.articleId === a.id) ?? [];
  const path = (id: string | null) => folderChain(folders, id).reverse();
  const below = (id: string) => {
    const inside = folderTree(folders, id);
    return articles.filter((a) => a.folderId && inside.has(a.folderId));
  };
  const topics = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) for (const x of a.topics) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [articles]);

  const shown = useMemo(() => {
    let list = articles;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length)
      list = list.filter((a) => {
        const hay =
          `${a.title} ${a.topics.join(' ')} ${a.body} ${folderById.get(a.folderId ?? '')?.name ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    else if (folderId) {
      const inside = folderTree(folders, folderId);
      list = list.filter((a) => a.folderId && inside.has(a.folderId));
    }
    if (topic) list = list.filter((a) => a.topics.includes(topic));
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [articles, query, folderId, topic, folders, folderById]);

  const article = open ? (articles.find((a) => a.id === open) ?? null) : null;
  const go = (id: string | null) => void navigate({ to: '.', search: (s) => ({ ...s, article: id ?? undefined }) });

  // ------------------------------------------------------------------------------------------ actions
  const post = (url: string, body: object, done: string) =>
    run(() => api(url, company.id, { method: 'POST', body }), done, load);
  const toggleRead = (a: Article) =>
    void post('/kb/read', { id: a.id, read: !isRead(a) }, t(isRead(a) ? 'kb.markedUnread' : 'kb.markedRead'));
  const toggleStar = (a: Article) => {
    const on = !data?.stars.includes(a.id);
    void post('/kb/star', { id: a.id, on }, t(on ? 'kb.starred' : 'kb.unstarred'));
  };
  const readFolder = (f: Folder, read: boolean) =>
    void post('/kb/read-folder', { id: f.id, read }, t(read ? 'kb.folderRead' : 'kb.folderUnread'));

  async function saveFolder(event: FormEvent) {
    event.preventDefault();
    if (!folderDraft) return;
    const { id, parentId, ...rest } = folderDraft;
    const ok = await run(
      () =>
        api(id ? `/kb/folders/${id}` : '/kb/folders', company.id, {
          method: id ? 'PUT' : 'POST',
          body: { ...rest, parentId: parentId || null },
        }),
      t('kb.saved'),
      load,
    );
    if (ok) setFolderDraft(null);
  }
  async function deleteFolder() {
    if (!deleting) return;
    const ok = await run(
      () => api(`/kb/folders/${deleting.id}?mode=${mode}`, company.id, { method: 'DELETE' }),
      t('kb.deleted'),
      load,
    );
    if (ok) {
      if (folderId === deleting.id) setFolderId(deleting.parentId ?? '');
      setDeleting(null);
      setMode('move');
    }
  }
  async function saveArticle(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const body = {
      folderId: editor.folderId || null,
      title: editor.title,
      emoji: editor.emoji,
      topics: editor.topics
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      body: editor.body,
      reqOn: editor.reqOn,
      reqTeams: editor.reqTeams,
      quiz: editor.quizOn ? { pass: editor.pass, questions: editor.questions } : null,
    };
    const ok = await run(
      () =>
        api<{ id: string }>(editor.id ? `/kb/articles/${editor.id}` : '/kb/articles', company.id, {
          method: editor.id ? 'PUT' : 'POST',
          body,
        }).then((r) => go(r.id)),
      t('kb.saved'),
      load,
    );
    if (ok) setEditor(null);
  }
  async function removeArticle(a: Article) {
    if (!window.confirm(t('kb.confirmDelete', { name: a.title }))) return;
    const ok = await run(() => api(`/kb/articles/${a.id}`, company.id, { method: 'DELETE' }), t('kb.deleted'), load);
    if (ok) go(null);
  }
  async function react(a: Article, e: string) {
    await run(() => api(`/kb/articles/${a.id}/react`, company.id, { method: 'POST', body: { e } }), '', load);
  }
  const editArticle = (a: Article) =>
    setEditor({
      id: a.id,
      folderId: a.folderId ?? '',
      title: a.title,
      emoji: a.emoji,
      topics: a.topics.join(', '),
      body: a.body,
      reqOn: a.reqOn,
      reqTeams: a.reqTeams,
      quizOn: !!a.quiz,
      pass: a.quiz?.pass ?? 80,
      questions: a.quiz?.questions.length
        ? a.quiz.questions.map((x) => ({ ...x, opts: [...x.opts] }))
        : [blankQuestion()],
      view: 'write',
    });
  async function submitTest() {
    if (!test) return;
    if (test.answers.some((x) => x === null) || test.answers.length < (test.article.quiz?.questions.length ?? 0)) {
      return void fail(new Error(t('kb.test.answerAll')));
    }
    try {
      const result = await api<NonNullable<TestState['result']>>(`/kb/articles/${test.article.id}/test`, company.id, {
        method: 'POST',
        body: { answers: test.answers },
      });
      setTest({ ...test, result });
      load();
    } catch (e) {
      fail(e);
    }
  }

  // ------------------------------------------------------------------------------------------ pieces
  const treeRow = (f: Folder, depth: number): React.ReactNode => {
    const arts = below(f.id);
    const read = arts.filter(isRead).length;
    return (
      <li key={f.id}>
        <button
          type="button"
          onClick={() => {
            setFolderId(f.id);
            setQuery('');
            go(null);
          }}
          aria-current={folderId === f.id && !query ? 'true' : undefined}
          className={`flex w-full items-center gap-2 rounded-s px-2 py-1.5 text-left text-sm hover:bg-sunk ${folderId === f.id && !query ? 'bg-sunk font-semibold' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <span aria-hidden="true" style={{ color: f.colour }}>
            {f.icon}
          </span>
          <span className="flex-1 truncate">{f.name}</span>
          {folderRequired(f) && (
            <span title={t('kb.required')} className="text-bad" aria-label={t('kb.required')}>
              ●
            </span>
          )}
          {arts.length > 0 && (
            <small className="text-mu">
              {read}/{arts.length}
            </small>
          )}
        </button>
        <ul>
          {folders
            .filter((c) => c.parentId === f.id)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => treeRow(c, depth + 1))}
        </ul>
      </li>
    );
  };

  const articleCard = (a: Article) => (
    <li key={a.id}>
      <button
        type="button"
        onClick={() => go(a.id)}
        className={`${card} grid w-full gap-1.5 text-left hover:border-tx`}
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <b>
            {a.emoji} {a.title}
          </b>
          <span className="flex gap-1 text-xs">
            {isRead(a) && <span className="rounded-full bg-ok/15 px-2 text-ok">✓ {t('kb.readTag')}</span>}
            {!isRead(a) && required(a) && (
              <span className="rounded-full bg-bad/15 px-2 text-bad">{t('kb.required')}</span>
            )}
          </span>
        </span>
        {a.topics.length > 0 && <span className="text-xs text-brand">{a.topics.join(' · ')}</span>}
        <small className="text-mu">
          {folderById.get(a.folderId ?? '')?.name ?? t('kb.topLevel')} ·{' '}
          {t('kb.updated', { date: when(a.updatedAt, lang) })}
          {a.quiz ? ` · ${t('kb.lessonTestTag')}` : ''}
        </small>
      </button>
    </li>
  );

  function list() {
    if (!shown.length)
      return (
        <Empty>
          {t('kb.noMatch')} {writes ? t('kb.createFirst') : ''}
        </Empty>
      );
    if (group === 'none') return <ul className="grid gap-3 sm:grid-cols-2">{shown.map(articleCard)}</ul>;
    const groups = new Map<string, Article[]>();
    for (const a of shown) {
      const keys =
        group === 'topic'
          ? a.topics.length
            ? a.topics
            : [t('kb.noTopic')]
          : [
              path(a.folderId)
                .map((f) => f.name)
                .join(' / ') || t('kb.topLevel'),
            ];
      for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), a]);
    }
    return (
      <div className="grid gap-4">
        {[...groups.entries()]
          .sort((x, y) => x[0].localeCompare(y[0]))
          .map(([k, items]) => (
            <section key={k} className="grid gap-2">
              <h3 className="font-semibold">
                {k} <small className="text-mu">{items.length}</small>
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2">{items.map(articleCard)}</ul>
            </section>
          ))}
      </div>
    );
  }

  function articleView(a: Article) {
    const best = Math.max(0, ...attemptsOf(a).map((x) => x.score));
    const passed = attemptsOf(a).some((x) => x.passed);
    const starred = data?.stars.includes(a.id);
    return (
      <div className="grid gap-4">
        <nav aria-label={t('kb.breadcrumb')} className="flex flex-wrap gap-1 text-sm">
          <button type="button" className="text-brand underline" onClick={() => (setFolderId(''), go(null))}>
            {t('menu.pages.kb')}
          </button>
          {path(a.folderId).map((f) => (
            <span key={f.id}>
              {' › '}
              <button type="button" className="text-brand underline" onClick={() => (setFolderId(f.id), go(null))}>
                {f.name}
              </button>
            </span>
          ))}
        </nav>
        <article className={`${card} grid gap-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <h1 className="font-display text-2xl font-bold">
                {a.emoji} {a.title}
              </h1>
              {a.topics.length > 0 && <p className="text-sm text-brand">{a.topics.join(' · ')}</p>}
              <small className="text-mu">
                {a.authorName} · {t('kb.updated', { date: when(a.updatedAt, lang) })}
                {a.editorName ? ` ${t('kb.updatedBy', { name: a.editorName })}` : ''}
              </small>
            </div>
            <div className="flex flex-wrap gap-2">
              {required(a) && (
                <span className="rounded-full bg-bad/15 px-2 py-1 text-xs text-bad">{t('kb.requiredForYou')}</span>
              )}
              {data?.me.id && (
                <>
                  <button type="button" className={smallButton} onClick={() => toggleRead(a)} aria-pressed={isRead(a)}>
                    ✓ {isRead(a) ? t('kb.readUndo') : t('kb.markRead')}
                  </button>
                  <button type="button" className={smallButton} onClick={() => toggleStar(a)} aria-pressed={!!starred}>
                    {starred ? '★' : '☆'} {t('kb.star')}
                  </button>
                </>
              )}
              {writes && (
                <>
                  <button type="button" className={smallButton} onClick={() => editArticle(a)}>
                    {t('kb.edit')}
                  </button>
                  <button type="button" className={dangerButton} onClick={() => void removeArticle(a)}>
                    {t('kb.delete')}
                  </button>
                </>
              )}
            </div>
          </div>
          <hr className="border-bd" />
          {a.body.trim() ? <Markdown source={a.body} /> : <Empty>{t('kb.emptyArticle')}</Empty>}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('kb.reactions')}>
            {KB_REACTIONS.map((e) => {
              const mine = !!data?.me.id && (a.reactions[e] ?? []).includes(data.me.id);
              return (
                <button
                  key={e}
                  type="button"
                  disabled={!data?.me.id}
                  aria-pressed={mine}
                  onClick={() => void react(a, e)}
                  className={`rounded-full border px-2 py-0.5 text-sm ${mine ? 'border-brand bg-brand/10' : 'border-bd'}`}
                >
                  {e} {(a.reactions[e] ?? []).length || ''}
                </button>
              );
            })}
          </div>
        </article>
        {a.quiz && (
          <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div className="grid gap-1">
              <h2 className="font-semibold">{t('kb.testTitle')}</h2>
              <p className="text-sm text-mu">
                {t('kb.test.facts', { n: a.quiz.questions.length, pass: a.quiz.pass })}
                {best > 0 && ` · ${t('kb.test.best', { n: best })}`}{' '}
                {passed && <b className="text-ok">{t('kb.test.passed')}</b>}
              </p>
            </div>
            {data?.me.id && (
              <button
                type="button"
                className={primaryButton}
                onClick={() => setTest({ article: a, answers: a.quiz?.questions.map(() => null) ?? [], result: null })}
              >
                {best ? t('kb.test.retake') : t('kb.test.take')}
              </button>
            )}
          </div>
        )}
        {commentsCard(a)}
      </div>
    );
  }

  function commentsCard(a: Article) {
    return (
      <Comments
        key={a.id}
        article={a}
        meId={data?.me.id ?? null}
        staff={!!data?.me.staff}
        company={company}
        onChange={load}
      />
    );
  }

  function testView(s: TestState) {
    const quiz = s.article.quiz;
    if (!quiz) return null;
    return (
      <section className={`${card} grid gap-4`} aria-labelledby="kb-test-title">
        <div>
          <span className="text-xs font-semibold uppercase text-mu">{t('kb.test.title')}</span>
          <h2 id="kb-test-title" className="font-display text-xl font-bold">
            {s.article.title}
          </h2>
        </div>
        {s.result ? (
          <>
            <p role="status" className="text-center">
              <span className={`block text-4xl font-bold ${s.result.passed ? 'text-ok' : 'text-bad'}`}>
                {s.result.score}%
              </span>
              {s.result.passed ? t('kb.test.passed') : t('kb.test.notPassed', { pass: s.result.pass })}
            </p>
            {quiz.questions.map((q, i) => (
              <div key={i} className="grid gap-1 rounded-s border border-bd p-3 text-sm">
                <b>
                  {i + 1}. {q.q}
                </b>
                {q.opts.map((o, j) => {
                  const right = j === s.result?.results[i]?.a;
                  const wrong = j === s.answers[i] && !right;
                  return (
                    <span key={j} className={right ? 'font-semibold text-ok' : wrong ? 'text-bad' : ''}>
                      {right ? '✓' : wrong ? '✗' : '○'} {o}
                    </span>
                  );
                })}
                {s.result?.results[i]?.why && <small className="text-mu">{s.result.results[i]?.why}</small>}
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" className={smallButton} onClick={() => setTest(null)}>
                {t('kb.test.close')}
              </button>
              {!s.result.passed && (
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => setTest({ article: s.article, answers: quiz.questions.map(() => null), result: null })}
                >
                  {t('kb.test.again')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-mu">{t('kb.test.intro', { pass: quiz.pass })}</p>
            {quiz.questions.map((q, i) => (
              <fieldset key={i} className="grid gap-1 rounded-s border border-bd p-3 text-sm">
                <legend className="px-1 font-semibold">
                  {i + 1}. {q.q}
                </legend>
                {q.opts.map((o, j) => (
                  <label key={j} className="inline-flex items-center gap-2 py-0.5">
                    <input
                      type="radio"
                      name={`kb-q${i}`}
                      className="accent-[var(--brand)]"
                      checked={s.answers[i] === j}
                      onChange={() => setTest({ ...s, answers: s.answers.map((x, k) => (k === i ? j : x)) })}
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
              <button type="button" className={primaryButton} onClick={() => void submitTest()}>
                {t('kb.test.submit')}
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  function folderForm(d: FolderDraft) {
    const set = (patch: Partial<FolderDraft>) => setFolderDraft({ ...d, ...patch });
    const options = folders.filter((f) => !d.id || !folderTree(folders, d.id).has(f.id));
    const teamOptions = teams.map((x) => ({ id: x.id, label: x.name }));
    return (
      <form onSubmit={(e) => void saveFolder(e)} className={`${card} grid gap-3`} aria-labelledby="kb-folder-title">
        <h2 id="kb-folder-title" className="text-lg font-semibold">
          {d.id ? t('kb.editFolder') : t('kb.newFolder')}
        </h2>
        <label className="grid gap-1 text-sm font-medium">
          {t('kb.folderName')}
          <input
            className={field}
            value={d.name}
            maxLength={60}
            required
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('kb.inside')}
          <select className={field} value={d.parentId} onChange={(e) => set({ parentId: e.target.value })}>
            <option value="">{t('kb.topLevelOption')}</option>
            {options.map((f) => (
              <option key={f.id} value={f.id}>
                {path(f.id)
                  .map((x) => x.name)
                  .join(' › ')}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-4">
          <fieldset className="grid gap-1 text-sm font-medium">
            <legend>{t('kb.icon')}</legend>
            <div className="flex flex-wrap gap-1">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={d.icon === i}
                  className={`rounded-s border px-2 py-1 ${d.icon === i ? 'border-brand' : 'border-bd'}`}
                  onClick={() => set({ icon: i })}
                >
                  {i}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-1 text-sm font-medium">
            <legend>{t('kb.colour')}</legend>
            <div className="flex flex-wrap gap-1">
              {COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={d.colour === c}
                  className={`h-7 w-7 rounded-full border-2 ${d.colour === c ? 'border-tx' : 'border-transparent'}`}
                  style={{ background: c }}
                  onClick={() => set({ colour: c })}
                />
              ))}
            </div>
          </fieldset>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          {t('kb.description')}
          <textarea
            className={field}
            rows={2}
            maxLength={400}
            value={d.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--brand)]"
            checked={d.reqOn}
            onChange={(e) => set({ reqOn: e.target.checked })}
          />
          <span>
            <b>{t('kb.required')}</b> <small className="text-mu">{t('kb.requiredHelp')}</small>
          </span>
        </label>
        {d.reqOn && (
          <CheckList
            legend={t('kb.requiredFor')}
            options={teamOptions}
            value={d.reqTeams}
            onChange={(v) => set({ reqTeams: v })}
          />
        )}
        <CheckList legend={t('kb.shownTo')} options={teamOptions} value={d.teams} onChange={(v) => set({ teams: v })} />
        <p className="text-xs text-mu">{t('kb.shownHelp')}</p>
        <div className="flex gap-2">
          <button type="submit" className={primaryButton}>
            {d.id ? t('kb.save') : t('kb.create')}
          </button>
          <button type="button" className={smallButton} onClick={() => setFolderDraft(null)}>
            {t('kb.cancel')}
          </button>
        </div>
      </form>
    );
  }

  function editorForm(d: ArticleDraft) {
    const set = (patch: Partial<ArticleDraft>) => setEditor({ ...d, ...patch });
    const setQuestion = (i: number, patch: Partial<Question>) =>
      set({ questions: d.questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
    const teamOptions = teams.map((x) => ({ id: x.id, label: x.name }));
    return (
      <form onSubmit={(e) => void saveArticle(e)} className={`${card} grid gap-4`} aria-labelledby="kb-editor-title">
        <h2 id="kb-editor-title" className="text-lg font-semibold">
          {d.id ? t('kb.edit') : t('kb.newArticle')}
        </h2>
        <div className="flex gap-3">
          <label className="grid w-20 gap-1 text-sm font-medium">
            {t('kb.emoji')}
            <input
              className={`${field} text-center text-lg`}
              value={d.emoji}
              maxLength={8}
              onChange={(e) => set({ emoji: e.target.value })}
            />
          </label>
          <label className="grid flex-1 gap-1 text-sm font-medium">
            {t('kb.articleTitle')}
            <input
              className={field}
              value={d.title}
              maxLength={150}
              required
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            {t('kb.folder')}
            <select className={field} value={d.folderId} onChange={(e) => set({ folderId: e.target.value })}>
              <option value="">{t('kb.topLevelOption')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {path(f.id)
                    .map((x) => x.name)
                    .join(' › ')}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('kb.topics')}
            <input className={field} value={d.topics} onChange={(e) => set({ topics: e.target.value })} />
          </label>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--brand)]"
            checked={d.reqOn}
            onChange={(e) => set({ reqOn: e.target.checked })}
          />
          <b>{t('kb.required')}</b>
        </label>
        {d.reqOn && (
          <CheckList
            legend={t('kb.requiredFor')}
            options={teamOptions}
            value={d.reqTeams}
            onChange={(v) => set({ reqTeams: v })}
          />
        )}
        <div className="grid gap-2">
          <div role="tablist" aria-label={t('kb.body')} className="flex gap-1">
            {(['write', 'preview'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={d.view === v}
                className={`rounded-s border px-3 py-1 text-sm font-semibold ${d.view === v ? 'border-brand text-brand' : 'border-bd'}`}
                onClick={() => set({ view: v })}
              >
                {t(`kb.${v}`)}
              </button>
            ))}
          </div>
          {d.view === 'write' ? (
            <>
              <textarea
                aria-label={t('kb.body')}
                className={`${field} font-mono text-sm`}
                rows={16}
                maxLength={200000}
                value={d.body}
                onChange={(e) => set({ body: e.target.value })}
              />
              <p className="text-xs text-mu">{t('kb.bodyHelp')}</p>
            </>
          ) : (
            <div className="min-h-40 rounded-s border border-bd p-3">
              {d.body.trim() ? <Markdown source={d.body} /> : <Empty>{t('kb.nothingYet')}</Empty>}
            </div>
          )}
        </div>
        <div className="grid gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              checked={d.quizOn}
              onChange={(e) => set({ quizOn: e.target.checked })}
            />
            <b>{t('kb.addTest')}</b>
          </label>
          {d.quizOn && (
            <div className="grid gap-3">
              <label className="grid max-w-[12rem] gap-1 text-sm font-medium">
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
              {d.questions.map((q, i) => (
                <fieldset key={i} className="grid gap-2 rounded-s border border-bd p-3">
                  <legend className="px-1 text-sm font-semibold">{t('kb.question', { n: i + 1 })}</legend>
                  <div className="flex gap-2">
                    <input
                      aria-label={t('kb.question', { n: i + 1 })}
                      className={`${field} flex-1`}
                      maxLength={300}
                      value={q.q}
                      onChange={(e) => setQuestion(i, { q: e.target.value })}
                    />
                    <button
                      type="button"
                      className={dangerButton}
                      onClick={() => set({ questions: d.questions.filter((_, k) => k !== i) })}
                    >
                      {t('kb.removeQuestion')}
                    </button>
                  </div>
                  {q.opts.map((o, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`kb-correct-${i}`}
                        title={t('kb.correct')}
                        aria-label={t('kb.correct')}
                        className="accent-[var(--brand)]"
                        checked={q.a === j}
                        onChange={() => setQuestion(i, { a: j })}
                      />
                      <input
                        aria-label={t('kb.answer', { n: j + 1 })}
                        placeholder={t('kb.answer', { n: j + 1 })}
                        className={`${field} flex-1`}
                        maxLength={200}
                        value={o}
                        onChange={(e) => setQuestion(i, { opts: q.opts.map((x, k) => (k === j ? e.target.value : x)) })}
                      />
                    </div>
                  ))}
                  <input
                    aria-label={t('kb.why')}
                    placeholder={t('kb.why')}
                    className={field}
                    maxLength={400}
                    value={q.why}
                    onChange={(e) => setQuestion(i, { why: e.target.value })}
                  />
                </fieldset>
              ))}
              {d.questions.length < 30 && (
                <div>
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => set({ questions: [...d.questions, blankQuestion()] })}
                  >
                    + {t('kb.addQuestion')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="submit" className={primaryButton}>
            {d.id ? t('kb.saveChanges') : t('kb.publish')}
          </button>
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              if (window.confirm(t('kb.discard'))) setEditor(null);
            }}
          >
            {t('kb.cancel')}
          </button>
        </div>
      </form>
    );
  }

  // ------------------------------------------------------------------------------------------ the page
  if (!data)
    return (
      <section className="grid gap-4">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.kb')}</h1>
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );

  const folder = folderId ? (folderById.get(folderId) ?? null) : null;
  const folderArticles = folder ? below(folder.id) : articles;
  const folderRead = folderArticles.filter(isRead).length;
  const main = (() => {
    if (editor) return editorForm(editor);
    if (folderDraft) return folderForm(folderDraft);
    if (test) return testView(test);
    if (article) return articleView(article);
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            aria-label={t('kb.search')}
            placeholder={t('kb.search')}
            className={`${field} min-w-[14rem] flex-1`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label={t('kb.groupLabel')}
            className={field}
            value={group}
            onChange={(e) => setGroup(e.target.value as typeof group)}
          >
            <option value="none">{t('kb.group.none')}</option>
            <option value="topic">{t('kb.group.topic')}</option>
            <option value="folder">{t('kb.group.folder')}</option>
          </select>
        </div>
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('kb.allTopics')}>
            <button
              type="button"
              aria-pressed={!topic}
              className={`${smallButton} ${!topic ? 'border-brand text-brand' : ''}`}
              onClick={() => setTopic('')}
            >
              {t('kb.allTopics')}
            </button>
            {topics.map(([x, n]) => (
              <button
                key={x}
                type="button"
                aria-pressed={topic === x}
                className={`${smallButton} ${topic === x ? 'border-brand text-brand' : ''}`}
                onClick={() => setTopic(x)}
              >
                {x} <small className="text-mu">{n}</small>
              </button>
            ))}
          </div>
        )}
        {folder && !query && (
          <div className={`${card} grid gap-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <b className="text-lg">
                  <span style={{ color: folder.colour }}>{folder.icon}</span> {folder.name}
                </b>{' '}
                {folderRequired(folder) && (
                  <span className="rounded-full bg-bad/15 px-2 text-xs text-bad">{t('kb.required')}</span>
                )}
                {folder.description && <p className="text-sm text-mu">{folder.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.me.id && folderArticles.length > 0 && (
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => readFolder(folder, folderRead !== folderArticles.length)}
                  >
                    ✓ {folderRead === folderArticles.length ? t('kb.markAllUnread') : t('kb.markAllRead')}
                  </button>
                )}
                {writes && (
                  <>
                    <button
                      type="button"
                      className={smallButton}
                      onClick={() => setFolderDraft(blankFolder(folder.id))}
                    >
                      + {t('kb.newSub')}
                    </button>
                    <button type="button" className={smallButton} onClick={() => setEditor(blankArticle(folder.id))}>
                      + {t('kb.newArticle')}
                    </button>
                    <button
                      type="button"
                      className={smallButton}
                      onClick={() =>
                        setFolderDraft({
                          id: folder.id,
                          parentId: folder.parentId ?? '',
                          name: folder.name,
                          colour: folder.colour,
                          icon: folder.icon,
                          description: folder.description,
                          reqOn: folder.reqOn,
                          reqTeams: folder.reqTeams,
                          teams: folder.teams,
                        })
                      }
                    >
                      {t('kb.editFolder')}
                    </button>
                    <button type="button" className={dangerButton} onClick={() => setDeleting(folder)}>
                      {t('kb.deleteFolder')}
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm">{t('kb.readOf', { done: folderRead, total: folderArticles.length })}</p>
            <div className="h-2 overflow-hidden rounded-full bg-sunk" role="presentation">
              <div
                className="h-full rounded-full bg-ok"
                style={{ width: `${folderArticles.length ? (folderRead / folderArticles.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
        {deleting && (
          <div className={`${card} grid gap-3`} role="alertdialog" aria-labelledby="kb-del-title">
            <h2 id="kb-del-title" className="font-semibold">
              {t('kb.deleteTitle', { name: deleting.name })}
            </h2>
            {below(deleting.id).length === 0 && !folders.some((f) => f.parentId === deleting.id) ? (
              <p className="text-sm">{t('kb.deleteEmpty')}</p>
            ) : (
              <fieldset className="grid gap-1 text-sm">
                <legend>
                  {t('kb.deleteContains', {
                    articles: below(deleting.id).length,
                    folders: folderTree(folders, deleting.id).size - 1,
                  })}
                </legend>
                {(['move', 'cascade'] as const).map((m) => (
                  <label key={m} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="kb-del-mode"
                      className="accent-[var(--brand)]"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                    />
                    {t(m === 'move' ? 'kb.deleteMove' : 'kb.deleteCascade')}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex gap-2">
              <button type="button" className={dangerButton} onClick={() => void deleteFolder()}>
                {t('kb.delete')}
              </button>
              <button type="button" className={smallButton} onClick={() => setDeleting(null)}>
                {t('kb.cancel')}
              </button>
            </div>
          </div>
        )}
        {list()}
      </div>
    );
  })();

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.kb')}</h1>
          <p className="text-sm text-mu">{t('kb.intro')}</p>
        </div>
        {writes && !editor && !folderDraft && (
          <div className="flex gap-2">
            <button type="button" className={smallButton} onClick={() => setFolderDraft(blankFolder(folderId))}>
              + {t('kb.newFolder')}
            </button>
            <button type="button" className={primaryButton} onClick={() => setEditor(blankArticle(folderId))}>
              + {t('kb.newArticle')}
            </button>
          </div>
        )}
      </div>
      <Notice message={message} />
      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <aside className={`${card} h-fit p-2`} aria-label={t('kb.folders')}>
          <button
            type="button"
            onClick={() => {
              setFolderId('');
              setQuery('');
              go(null);
            }}
            aria-current={!folderId && !query ? 'true' : undefined}
            className={`flex w-full items-center gap-2 rounded-s px-2 py-1.5 text-left text-sm hover:bg-sunk ${!folderId && !query ? 'bg-sunk font-semibold' : ''}`}
          >
            <span aria-hidden="true">🗂️</span>
            <span className="flex-1">{t('kb.allArticles')}</span>
            <small className="text-mu">{articles.length}</small>
          </button>
          <ul>
            {folders
              .filter((f) => !f.parentId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((f) => treeRow(f, 0))}
          </ul>
        </aside>
        <div className="min-w-0">{main}</div>
      </div>
    </section>
  );
}

function Comments({
  article,
  meId,
  staff,
  company,
  onChange,
}: {
  article: Article;
  meId: string | null;
  staff: boolean;
  company: CompanyRef;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { message, run } = useAction();
  const [text, setText] = useState('');
  return (
    <section className={`${card} grid gap-3`} aria-labelledby={`kb-c-${article.id}`}>
      <h2 id={`kb-c-${article.id}`} className="font-semibold">
        {t('kb.comments.title')} <small className="text-mu">{article.comments.length}</small>
      </h2>
      {article.comments.length === 0 ? (
        <Empty>{t('kb.comments.none')}</Empty>
      ) : (
        <ul className="grid gap-2">
          {article.comments.map((c) => (
            <li key={c.id} className="grid gap-0.5 border-t border-bd pt-2 text-sm first:border-t-0 first:pt-0">
              <span>
                <b>{c.name}</b> <small className="text-mu">{when(c.at, lang)}</small>
              </span>
              <span className="whitespace-pre-wrap">{c.text}</span>
              {(staff || (meId && c.byId === meId)) && (
                <button
                  type="button"
                  className="w-fit text-xs text-bad underline"
                  onClick={() =>
                    void run(
                      () => api(`/kb/articles/${article.id}/comments/${c.id}`, company.id, { method: 'DELETE' }),
                      t('kb.deleted'),
                      onChange,
                    )
                  }
                >
                  {t('kb.comments.delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {meId && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => api(`/kb/articles/${article.id}/comments`, company.id, { method: 'POST', body: { t: text } }),
              t('kb.comments.posted'),
              () => {
                setText('');
                onChange();
              },
            );
          }}
        >
          <input
            aria-label={t('kb.comments.add')}
            placeholder={t('kb.comments.add')}
            className={`${field} flex-1`}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={!text.trim()} className={primaryButton}>
            {t('kb.comments.post')}
          </button>
        </form>
      )}
      <Notice message={message} />
    </section>
  );
}
