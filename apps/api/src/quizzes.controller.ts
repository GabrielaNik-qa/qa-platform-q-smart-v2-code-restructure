// Learning › Quizzes, My Learning and the progress report (Phase 6, piece 2), with today's rules:
// - staff (admins, reviewers, team leads, trainers) write quizzes; weekly, monthly, category or custom; given to all
//   agents, to some teams or to chosen people; a deadline, a pass mark and a number of tries (3 unless set: decision 15);
// - a draft is seen by staff only; publishing tells the agents it is given to (the bell);
// - an agent sees the quizzes given to them, without the right answers; after a try they get the score, and the right
//   answers only once they passed (or used all their tries: never earlier, so the answers can't be copied);
//   staff can try a quiz out, and that is not recorded;
// - the progress report (staff, in their workspaces): for every agent the required reading left, the lesson tests
//   not passed and the quizzes not passed;
// - the AI question writer (Phase 6): questions written from articles or pasted text, through the AI engine.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addQuiz,
  addQuizAttempt,
  allReading,
  type Db,
  deleteQuiz,
  getQuiz,
  isDemoCompany,
  listKbArticles,
  listKbFolders,
  listPeople,
  listQuizAttempts,
  listQuizzes,
  listTeams,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  type Quiz,
  type QuizInput,
  type Tx,
  updateQuiz,
  withCompany,
} from '@qsmart/db';
import { can, cleanQuestions, gradeAnswers, learningProgress, quizGivenTo, type Scope } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { AiError, type AiEngine } from './ai/engine.js';
import { quizWriterJob, quizWriterPrompt } from './ai/learning.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { AI_ENGINE, DB } from './tokens.js';

const id = z.uuid();
const question = z.object({
  q: z.string().max(400),
  opts: z.array(z.string().max(200)).max(6),
  a: z.number().int().min(0).max(5),
  why: z.string().max(400).default(''),
});
const quizInput = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(400).default(''),
    kind: z.enum(['weekly', 'monthly', 'category', 'custom']).default('custom'),
    topics: z
      .array(z.string().trim().min(1).max(40))
      .max(10)
      .transform((t) => [...new Set(t)])
      .default([]),
    articleIds: z.array(z.uuid()).max(30).default([]),
    pass: z.number().int().min(1).max(100).default(80),
    dueOn: z.iso.date().nullable().default(null),
    assignAll: z.boolean().default(true),
    assignTeams: z.array(z.uuid()).max(30).default([]),
    assignPeople: z.array(z.uuid()).max(300).default([]),
    status: z.enum(['draft', 'published']).default('draft'),
    tries: z.number().int().min(1).max(20).default(3),
    questions: z.array(question).max(50),
  })
  .strict();

/** The agents' copy of a quiz: the questions and options, never the right answers. */
const forAgent = (q: Quiz): Quiz => ({
  ...q,
  questions: q.questions.map((x) => ({ q: x.q, opts: x.opts, a: -1, why: '' })),
});

async function viewerOf(tx: Tx, membership: Membership) {
  const me = await membershipOfUser(tx, membership.userId);
  return { me, staff: can(membership.role, 'learning.write') };
}

/** Tells the agents a quiz is given to that it is waiting (when it is published). */
async function tellAgents(tx: Tx, quiz: Quiz, by: string) {
  for (const p of await listPeople(tx))
    if (p.role === 'agent' && quizGivenTo(quiz, { id: p.membershipId, teamId: p.teamId, active: p.active }))
      await notify(
        tx,
        p.membershipId,
        'quizGiven',
        { name: by, title: quiz.title.slice(0, 80), due: quiz.dueOn ?? '' },
        '/learning/quizzes',
      );
}

@Controller('quizzes')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class QuizzesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Staff: every quiz with its results. Agents: the quizzes given to them, and their own tries. */
  @Get()
  @Allow('learning.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, staff } = await viewerOf(tx, membership);
      const all = await listQuizzes(tx);
      const attempts = await listQuizAttempts(tx);
      if (staff)
        return {
          staff: true,
          quizzes: all.map((q) => {
            const tries = attempts.filter((a) => a.quizId === q.id);
            const takers = new Set(tries.map((a) => a.membershipId));
            const passed = new Set(tries.filter((a) => a.passed).map((a) => a.membershipId));
            const average = tries.length ? Math.round(tries.reduce((n, a) => n + a.score, 0) / tries.length) : null;
            return { ...q, stats: { takers: takers.size, passed: passed.size, average } };
          }),
          attempts: [],
        };
      const person = me ? (await listPeople(tx)).find((p) => p.membershipId === me.id) : undefined;
      const given = all
        .filter((q) => quizGivenTo(q, { id: me?.id ?? null, teamId: person?.teamId ?? null, active: person?.active }))
        .map(forAgent);
      return {
        staff: false,
        quizzes: given,
        attempts: attempts
          .filter((a) => a.membershipId === me?.id)
          .map((a) => ({ quizId: a.quizId, score: a.score, passed: a.passed, at: a.at })),
      };
    });
  }

  private async check(tx: Tx, input: z.infer<typeof quizInput>): Promise<QuizInput> {
    const questions = cleanQuestions(input.questions);
    if (!questions.length) throw badRequest('quizNoQuestions');
    const knownTeams = new Set((await listTeams(tx)).map((t) => t.id));
    const agents = new Set((await listPeople(tx)).filter((p) => p.role === 'agent').map((p) => p.membershipId));
    const articles = new Set((await listKbArticles(tx)).map((a) => a.id));
    return {
      ...input,
      questions,
      assignTeams: input.assignTeams.filter((t) => knownTeams.has(t)),
      assignPeople: input.assignPeople.filter((p) => agents.has(p)),
      articleIds: input.articleIds.filter((a) => articles.has(a)),
    };
  }

  @Post()
  @Allow('learning.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = quizInput.safeParse(body);
    if (!input.success) throw badRequest('quizInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const saved = await this.check(tx, input.data);
      const quizId = await addQuiz(tx, saved, membership.userName);
      const quiz = await getQuiz(tx, quizId);
      if (quiz?.status === 'published') await tellAgents(tx, quiz, membership.userName);
      await logActivity(tx, actorOf(membership), { action: 'quizAdded', targetName: saved.title });
      return { id: quizId };
    });
  }

  @Put(':id')
  @Allow('learning.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') quizId: string, @Body() body: unknown) {
    const input = quizInput.safeParse(body);
    if (!input.success || !id.safeParse(quizId).success) throw badRequest('quizInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const before = await getQuiz(tx, quizId);
      if (!before) throw notFound('quizNotFound');
      const saved = await this.check(tx, input.data);
      await updateQuiz(tx, quizId, saved);
      const quiz = await getQuiz(tx, quizId);
      if (quiz && before.status !== 'published' && quiz.status === 'published')
        await tellAgents(tx, quiz, membership.userName);
      await logActivity(tx, actorOf(membership), { action: 'quizChanged', targetName: saved.title });
      return { id: quizId };
    });
  }

  @Delete(':id')
  @Allow('learning.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') quizId: string) {
    if (!id.safeParse(quizId).success) throw notFound('quizNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const quiz = await getQuiz(tx, quizId);
      if (!quiz) throw notFound('quizNotFound');
      await deleteQuiz(tx, quizId);
      await logActivity(tx, actorOf(membership), { action: 'quizDeleted', targetName: quiz.title });
    });
  }

  /**
   * Takes a quiz. An agent has a number of tries (until they pass); the right answers come back only once passed or when
   * no try is left. Staff trying it out are not recorded and always see the right answers.
   */
  @Post(':id/attempt')
  @Allow('learning.read')
  @HttpCode(200)
  async attempt(@CurrentMembership() membership: Membership, @Param('id') quizId: string, @Body() body: unknown) {
    const input = z
      .object({ answers: z.array(z.number().int().min(0).max(5).nullable()).max(50) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('quizInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const { me, staff } = await viewerOf(tx, membership);
      const quiz = id.safeParse(quizId).success ? await getQuiz(tx, quizId) : undefined;
      const person = me ? (await listPeople(tx)).find((p) => p.membershipId === me.id) : undefined;
      const given =
        quiz && quizGivenTo(quiz, { id: me?.id ?? null, teamId: person?.teamId ?? null, active: person?.active });
      if (!quiz || !(staff || given)) throw notFound('quizNotFound');
      const graded = gradeAnswers(quiz.questions, input.data.answers);
      const passed = graded.score >= quiz.pass;
      if (staff) return { score: graded.score, passed, pass: quiz.pass, left: null, results: graded.results };
      if (!me) throw forbidden('notAllowed');
      const mine = (await listQuizAttempts(tx)).filter((a) => a.quizId === quizId && a.membershipId === me.id);
      if (!mine.some((a) => a.passed) && mine.length >= quiz.tries) throw forbidden('quizNoTriesLeft');
      await addQuizAttempt(tx, quizId, me.id, graded.score, passed);
      const left = Math.max(0, quiz.tries - mine.length - 1);
      const showAnswers = passed || left === 0;
      return {
        score: graded.score,
        passed,
        pass: quiz.pass,
        left,
        results: showAnswers ? graded.results : graded.results.map((r) => ({ ok: r.ok })),
      };
    });
  }
}

@Controller('learning')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class LearningController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  /** Who has read and passed what: every agent the person reaches, with what they still have to do. */
  @Get('progress')
  @Allow('learning.progress')
  progress(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const folders = await listKbFolders(tx);
      const articles = await listKbArticles(tx);
      const quizzes = (await listQuizzes(tx)).filter((q) => q.status === 'published');
      const attempts = await listQuizAttempts(tx);
      const reading = await allReading(tx);
      const agents = (await listPeople(tx)).filter(
        (p) =>
          p.role === 'agent' &&
          p.active &&
          (!('teamIds' in reach) || (p.teamId !== null && reach.teamIds.includes(p.teamId))),
      );
      return agents.map((p) => {
        const progress = learningProgress({
          folders,
          articles: articles.map((a) => ({ ...a, hasTest: !!a.quiz })),
          quizzes,
          person: { id: p.membershipId, teamId: p.teamId, active: p.active },
          read: new Set(reading.reads.filter((r) => r.membershipId === p.membershipId).map((r) => r.articleId)),
          testsPassed: new Set(
            reading.testsPassed.filter((r) => r.membershipId === p.membershipId).map((r) => r.articleId),
          ),
          quizzesPassed: new Set(
            attempts.filter((a) => a.membershipId === p.membershipId && a.passed).map((a) => a.quizId),
          ),
        });
        return { membershipId: p.membershipId, name: p.name, teamId: p.teamId, teamName: p.teamName, ...progress };
      });
    });
  }

  /** The AI question writer: multiple-choice questions from articles or pasted text, to check before they are used. */
  @Post('quiz-questions')
  @Allow('learning.write')
  @HttpCode(200)
  async writeQuestions(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({
        text: z.string().max(30_000).default(''),
        articleIds: z.array(z.uuid()).max(30).default([]),
        count: z.number().int().min(1).max(10).default(5),
      })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('quizInvalid');
    const { companyId } = membership;
    const prepared = await withCompany(this.db, companyId, async (tx) => {
      const chosen = (await listKbArticles(tx)).filter((a) => input.data.articleIds.includes(a.id));
      const me = await membershipOfUser(tx, membership.userId);
      const material = [input.data.text, ...chosen.map((a) => `# ${a.title}\n${a.body}`)]
        .filter((x) => x.trim())
        .join('\n\n')
        .slice(0, 30_000);
      return {
        material,
        dataClass: (await isDemoCompany(tx)) ? ('test' as const) : ('client' as const),
        byId: me?.id ?? null,
      };
    });
    if (!prepared.material.trim()) throw badRequest('quizAiNoMaterial');
    try {
      const result = await this.engine.run({
        companyId,
        dataClass: prepared.dataClass,
        byId: prepared.byId,
        type: quizWriterJob(input.data.count),
        system: quizWriterPrompt(input.data.count),
        prompt: `<material>\n${prepared.material}\n</material>`,
      });
      const questions = cleanQuestions(result.data.questions);
      if (!questions.length) throw badRequest('quizAiUnusable');
      return { questions };
    } catch (e) {
      if (e instanceof AiError) throw badRequest(e.code, e.detail ? [e.detail] : undefined);
      throw e;
    }
  }
}
