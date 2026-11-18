// The Knowledge Base's rules (today's learning rules), the same on the pages and the server:
// - who sees a folder: staff see everything; an agent sees a folder when it and every folder above it is open to
//   everybody or to the agent's team (an article follows its folder);
// - required reading: an article is required for a person when it, or a folder above it, is required for their team
//   (no team chosen: for all agents); only agents have required reading;
// - a lesson test: every question is checked, the score is the share answered right, and passing marks the article read.

export interface KbFolderFacts {
  id: string;
  parentId: string | null;
  /** open to these teams only (empty: everybody) */
  teams: string[];
  reqOn: boolean;
  reqTeams: string[];
}
export interface KbViewer {
  /** staff (admins, reviewers, team leads, trainers) see every folder and article */
  staff: boolean;
  teamId: string | null;
}

/** A folder and the folders above it, nearest first (a loop or a broken link ends it). */
export function folderChain<T extends { id: string; parentId: string | null }>(
  folders: readonly T[],
  folderId: string | null,
): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: T[] = [];
  let at = folderId ? byId.get(folderId) : undefined;
  while (at && chain.length < 30 && !chain.includes(at)) {
    chain.push(at);
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return chain;
}

/** Whether a viewer sees this folder (null: the top level, seen by everybody). */
export function folderSeen(folders: readonly KbFolderFacts[], folderId: string | null, viewer: KbViewer): boolean {
  if (viewer.staff) return true;
  return folderChain(folders, folderId).every(
    (f) => !f.teams.length || (!!viewer.teamId && f.teams.includes(viewer.teamId)),
  );
}

/** A required-reading setting applies to a person of this team (no team chosen: to all). */
export const requirementApplies = (req: { on: boolean; teams: readonly string[] }, teamId: string | null): boolean =>
  req.on && (!req.teams.length || (!!teamId && req.teams.includes(teamId)));

/** Whether an article is required reading for an agent of this team (its own setting, or a folder above it). */
export function articleRequired(
  folders: readonly KbFolderFacts[],
  article: { folderId: string | null; reqOn: boolean; reqTeams: readonly string[] },
  teamId: string | null,
): boolean {
  if (requirementApplies({ on: article.reqOn, teams: article.reqTeams }, teamId)) return true;
  return folderChain(folders, article.folderId).some((f) =>
    requirementApplies({ on: f.reqOn, teams: f.reqTeams }, teamId),
  );
}

/** A folder and everything below it. */
export function folderTree(folders: readonly { id: string; parentId: string | null }[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders)
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
  }
  return ids;
}

export interface KbQuestionInput {
  q: string;
  opts: string[];
  a: number;
  why: string;
}
/** Drops questions without a text or with fewer than two options, and keeps the right answer pointing at its option. */
export function cleanQuestions(raw: readonly KbQuestionInput[]): KbQuestionInput[] {
  return raw
    .map((x) => {
      const opts = x.opts.map((o) => o.trim());
      const right = opts[x.a];
      const kept = opts.filter(Boolean);
      return { q: x.q.trim(), opts: kept, a: right ? kept.indexOf(right) : -1, why: x.why.trim() };
    })
    .filter((x) => x.q && x.opts.length >= 2 && x.a >= 0);
}

/** Checks a person's answers (one chosen option per question, or nothing). */
export function gradeAnswers(
  questions: readonly KbQuestionInput[],
  answers: readonly (number | null | undefined)[],
): { results: { ok: boolean; a: number; why: string }[]; score: number } {
  const results = questions.map((q, i) => ({ ok: answers[i] === q.a, a: q.a, why: q.why }));
  return {
    results,
    score: questions.length ? Math.round((results.filter((r) => r.ok).length / questions.length) * 100) : 0,
  };
}

/** The reactions a person may leave on an article. */
export const KB_REACTIONS = ['👍', '❤️', '🎉', '👏', '💡'] as const;

// ---------------------------------------------------------------------------------------------- quizzes and progress

export interface QuizFacts {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  assignAll: boolean;
  assignTeams: readonly string[];
  assignPeople: readonly string[];
}
/** Whether a published quiz is given to this person (draft quizzes are seen by staff only). */
export const quizGivenTo = (
  quiz: Pick<QuizFacts, 'status' | 'assignAll' | 'assignTeams' | 'assignPeople'>,
  person: { id: string | null; teamId: string | null; active?: boolean },
): boolean =>
  quiz.status === 'published' &&
  person.active !== false &&
  (quiz.assignAll ||
    (!!person.teamId && quiz.assignTeams.includes(person.teamId)) ||
    (!!person.id && quiz.assignPeople.includes(person.id)));

export interface ProgressArticle {
  id: string;
  title: string;
  folderId: string | null;
  reqOn: boolean;
  reqTeams: readonly string[];
  hasTest: boolean;
}
export interface Progress {
  /** the articles required of this person, and how many are done (read, and the test passed when there is one) */
  required: number;
  completed: number;
  left: { id: string; title: string; why: 'notRead' | 'testNotPassed' }[];
  quizzes: number;
  quizzesPassed: number;
  quizzesLeft: { id: string; title: string; dueOn: string | null }[];
}

/** What one person still has to read and pass (today's "My Learning" and the trainers' progress report). */
export function learningProgress(input: {
  folders: readonly KbFolderFacts[];
  articles: readonly ProgressArticle[];
  quizzes: readonly QuizFacts[];
  person: { id: string; teamId: string | null; active?: boolean };
  /** article ids this person read, and article ids whose lesson test they passed */
  read: ReadonlySet<string>;
  testsPassed: ReadonlySet<string>;
  /** quiz ids this person passed */
  quizzesPassed: ReadonlySet<string>;
}): Progress {
  const { folders, person } = input;
  const viewer: KbViewer = { staff: false, teamId: person.teamId };
  const required = input.articles.filter(
    (a) => folderSeen(folders, a.folderId, viewer) && articleRequired(folders, a, person.teamId),
  );
  const left: Progress['left'] = [];
  for (const a of required) {
    if (!input.read.has(a.id)) left.push({ id: a.id, title: a.title, why: 'notRead' });
    else if (a.hasTest && !input.testsPassed.has(a.id)) left.push({ id: a.id, title: a.title, why: 'testNotPassed' });
  }
  const given = input.quizzes.filter((q) => quizGivenTo(q, person));
  const quizzesLeft = given
    .filter((q) => !input.quizzesPassed.has(q.id))
    .map((q) => ({ id: q.id, title: q.title, dueOn: q.dueOn }));
  return {
    required: required.length,
    completed: required.length - left.length,
    left,
    quizzes: given.length,
    quizzesPassed: given.length - quizzesLeft.length,
    quizzesLeft,
  };
}
