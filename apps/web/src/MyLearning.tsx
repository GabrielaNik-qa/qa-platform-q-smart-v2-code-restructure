// Learning › My Learning (Phase 6, piece 2; today's "My Learning"): what is left for me to read (required articles, and
// lesson tests to pass) and the quizzes waiting for me, the required folders with how far I am, and, for staff, the
// progress report: every agent they reach, with what they still have to do.
import { can, folderSeen, folderTree, learningProgress, localDay } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Empty } from './bits';
import { card, type CompanyRef, field, Notice, smallButton, type TeamRow, useAction } from './ui';

interface Kb {
  folders: {
    id: string;
    parentId: string | null;
    name: string;
    icon: string;
    colour: string;
    teams: string[];
    reqOn: boolean;
    reqTeams: string[];
  }[];
  articles: {
    id: string;
    title: string;
    folderId: string | null;
    reqOn: boolean;
    reqTeams: string[];
    quiz: unknown;
  }[];
  me: { id: string | null; teamId: string | null; staff: boolean };
  reads: Record<string, string>;
  attempts: { articleId: string; passed: boolean }[];
}
interface Quizzes {
  quizzes: {
    id: string;
    title: string;
    status: string;
    dueOn: string | null;
    assignAll: boolean;
    assignTeams: string[];
    assignPeople: string[];
  }[];
  attempts: { quizId: string; passed: boolean }[];
}
interface Row {
  membershipId: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  required: number;
  completed: number;
  left: { id: string; title: string; why: 'notRead' | 'testNotPassed' }[];
  quizzes: number;
  quizzesPassed: number;
  quizzesLeft: { id: string; title: string; dueOn: string | null }[];
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sunk" role="presentation">
      <div
        className={`h-full rounded-full ${value >= 100 ? 'bg-ok' : 'bg-brand'}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

export function MyLearning({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, fail } = useAction();
  const [kb, setKb] = useState<Kb | null>(null);
  const [quizzes, setQuizzes] = useState<Quizzes | null>(null);
  const [report, setReport] = useState<Row[] | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [team, setTeam] = useState('');
  const load = useCallback(() => {
    api<Kb>('/kb', company.id).then(setKb, fail);
    api<Quizzes>('/quizzes', company.id).then(setQuizzes, fail);
    if (can(company.role, 'learning.progress')) {
      api<Row[]>('/learning/progress', company.id).then(setReport, fail);
      api<TeamRow[]>('/teams', company.id).then((l) => setTeams(l.filter((x) => !x.isAdministration)), fail);
    }
  }, [company.id, company.role, fail]);
  useEffect(load, [load]);

  const mine = useMemo(() => {
    if (!kb || !quizzes) return null;
    return learningProgress({
      folders: kb.folders,
      articles: kb.articles.map((a) => ({ ...a, hasTest: !!a.quiz })),
      quizzes: quizzes.quizzes.map((q) => ({ ...q, status: q.status })),
      person: { id: kb.me.id ?? '', teamId: kb.me.teamId },
      read: new Set(Object.keys(kb.reads)),
      testsPassed: new Set(kb.attempts.filter((a) => a.passed).map((a) => a.articleId)),
      quizzesPassed: new Set(quizzes.attempts.filter((a) => a.passed).map((a) => a.quizId)),
    });
  }, [kb, quizzes]);

  const today = localDay(new Date());
  const header = (
    <div className="grid gap-1">
      <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.acad')}</h1>
      <p className="text-sm text-mu">{t('learn.intro')}</p>
    </div>
  );
  if (!kb || !quizzes || !mine)
    return (
      <section className="grid gap-4">
        {header}
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );

  // the folders that matter to me: required for my team, or holding required articles
  const viewer = { staff: kb.me.staff, teamId: kb.me.teamId };
  const requiredIds = new Set(
    kb.articles.filter((a) => mine.left.some((l) => l.id === a.id) || a.reqOn).map((a) => a.id),
  );
  const requiredFolders = kb.folders.filter((f) => {
    if (!folderSeen(kb.folders, f.id, viewer)) return false;
    const inside = folderTree(kb.folders, f.id);
    return f.reqOn || kb.articles.some((a) => a.folderId && inside.has(a.folderId) && requiredIds.has(a.id));
  });
  const shownReport = (report ?? []).filter((r) => !team || r.teamId === team);
  const allDone = shownReport.filter((r) => r.required > 0 && r.completed === r.required).length;

  return (
    <section className="grid gap-4">
      {header}
      <Notice message={message} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${card} grid gap-1`}>
          <small className="text-mu">{t('learn.requiredArticles')}</small>
          <b className="text-3xl">
            {mine.completed}/{mine.required}
          </b>
          <Bar value={mine.required ? (mine.completed / mine.required) * 100 : 100} />
        </div>
        <div className={`${card} grid gap-1`}>
          <small className="text-mu">{t('learn.quizzesToTake')}</small>
          <b className={`text-3xl ${mine.quizzesLeft.length ? 'text-wn' : 'text-ok'}`}>{mine.quizzesLeft.length}</b>
        </div>
        <div className={`${card} grid gap-1`}>
          <small className="text-mu">{t('learn.articlesRead')}</small>
          <b className="text-3xl">{Object.keys(kb.reads).length}</b>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${card} grid gap-2`}>
          <h2 className="font-semibold">{t('learn.todo')}</h2>
          {mine.left.length + mine.quizzesLeft.length === 0 ? (
            <p className="text-ok">✓ {t('learn.caughtUp')}</p>
          ) : (
            <ul className="grid gap-1">
              {mine.left.map((l) => (
                <li key={l.id}>
                  <Link
                    to="/$app/$page"
                    params={{ app: 'learning', page: 'knowledge-base' }}
                    search={{ article: l.id }}
                    className="flex items-center justify-between gap-3 rounded-s border border-bd px-3 py-2 text-sm hover:border-tx"
                  >
                    <span>
                      <b>{l.title}</b>
                      <small className="block text-mu">
                        {t(l.why === 'notRead' ? 'learn.notRead' : 'learn.testNotPassed')}
                      </small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
              {mine.quizzesLeft.map((q) => (
                <li key={q.id}>
                  <Link
                    to="/$app/$page"
                    params={{ app: 'learning', page: 'quizzes' }}
                    className="flex items-center justify-between gap-3 rounded-s border border-bd px-3 py-2 text-sm hover:border-tx"
                  >
                    <span>
                      <b>{q.title}</b>
                      <small className={`block ${q.dueOn && q.dueOn < today ? 'text-bad' : 'text-mu'}`}>
                        {q.dueOn ? t('quizzes.due', { date: q.dueOn }) : t('quizzes.quiz')}
                      </small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${card} grid gap-2`}>
          <h2 className="font-semibold">{t('kb.folders')}</h2>
          {requiredFolders.length === 0 ? (
            <Empty>{t('learn.noFolders')}</Empty>
          ) : (
            <ul className="grid gap-2">
              {requiredFolders.map((f) => {
                const inside = folderTree(kb.folders, f.id);
                const arts = kb.articles.filter((a) => a.folderId && inside.has(a.folderId));
                const read = arts.filter((a) => kb.reads[a.id]).length;
                return (
                  <li key={f.id} className="grid gap-1">
                    <span className="flex items-center justify-between text-sm">
                      <span>
                        <span style={{ color: f.colour }}>{f.icon}</span> {f.name}
                      </span>
                      <b className="font-mono">
                        {read}/{arts.length}
                      </b>
                    </span>
                    <Bar value={arts.length ? (read / arts.length) * 100 : 0} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {report && (
        <div className={`${card} grid gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t('learn.report.title')}</h2>
              <p className="text-sm text-mu">{t('learn.report.help')}</p>
            </div>
            <label className="text-sm">
              <span className="sr-only">{t('learn.report.team')}</span>
              <select className={field} value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">{t('learn.report.allTeams')}</option>
                {teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-sm">{t('learn.report.completed', { done: allDone, total: shownReport.length })}</p>
          {shownReport.length === 0 ? (
            <Empty>{t('learn.report.none')}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-mu">
                  <tr>
                    {['agent', 'team', 'required', 'quizzes', 'open'].map((h) => (
                      <th key={h} className="py-1 pr-3 font-semibold">
                        {t(`learn.report.cols.${h}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownReport.map((r) => (
                    <tr key={r.membershipId} className="border-t border-bd align-top">
                      <td className="py-2 pr-3 font-semibold">{r.name}</td>
                      <td className="py-2 pr-3">{r.teamName ?? '-'}</td>
                      <td className="w-40 py-2 pr-3">
                        <Bar value={r.required ? (r.completed / r.required) * 100 : 100} />
                        <small>
                          {r.completed}/{r.required}
                        </small>
                      </td>
                      <td className="py-2 pr-3">
                        {r.quizzesPassed}/{r.quizzes}
                      </td>
                      <td className="py-2 pr-3">
                        {r.left.length + r.quizzesLeft.length === 0 ? (
                          <span className="text-ok">✓ {t('learn.report.allDone')}</span>
                        ) : (
                          <ul>
                            {r.left.map((l) => (
                              <li key={l.id}>
                                {l.title}{' '}
                                <small className="text-mu">
                                  ({t(l.why === 'notRead' ? 'learn.notRead' : 'learn.testNotPassed')})
                                </small>
                              </li>
                            ))}
                            {r.quizzesLeft.map((q) => (
                              <li key={q.id}>
                                {t('learn.report.quizLine', { title: q.title })}
                                {q.dueOn && <small className="text-mu"> ({t('quizzes.due', { date: q.dueOn })})</small>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <button type="button" className={smallButton} onClick={load}>
              ↻ {t('learn.report.refresh')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
