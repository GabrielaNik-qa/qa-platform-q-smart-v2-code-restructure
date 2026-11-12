// Tasks' Library (Phase 4, today's Library), for those who give tasks:
// - templates: saved tasks, used by hand ("Use template") or repeating by themselves every day, week, month or
//   quarter for chosen people and teams, until a date if chosen. A repeating card comes the first time anybody of the
//   company opens their tasks on a working day of its period (today's rule), once per person and period; until
//   Workforce (Phase 6) brings rotas and time off, Saturdays and Sundays are the days off (12 November);
// - sequences: steps given together, each a number of days after the start; given to people and teams from a start
//   date, once or again every month or quarter (only the latest round: missed ones never pile up), until it's stopped.
// The history ("give again") is read from the tasks themselves.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addRepeatingTask,
  addSequenceRun,
  addTaskSequence,
  addTaskTemplate,
  type Db,
  deleteTaskSequence,
  deleteTaskTemplate,
  getTaskSequence,
  getTaskTemplate,
  listPeople,
  listSequenceRuns,
  listTaskSequences,
  listTaskTemplates,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  type Person,
  type ReviewScope,
  type SequenceRun,
  type TaskSequence,
  type Tx,
  updateSequenceRun,
  updateTaskSequence,
  updateTaskTemplate,
  withCompany,
} from '@qsmart/db';
import { addDays, dueRound, isWorkingDay, localDay, periodDay, type Scope } from '@qsmart/shared';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const line = z.object({
  text: z.string().trim().min(1).max(150),
  minutes: z.number().int().min(0).max(600).default(0),
});
const priority = z.enum(['low', 'med', 'high']).default('med');
const labels = z
  .array(z.string().trim().min(1).max(30))
  .max(8)
  .default([])
  .transform((l) => [...new Set(l)]);
const people = { userIds: z.array(z.uuid()).max(200).default([]), teamIds: z.array(z.uuid()).max(50).default([]) };
const templateInput = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(1500).default(''),
    kind: z.enum(['task', 'checklist', 'target']).default('checklist'),
    priority,
    points: z.number().int().min(0).max(1000).default(0),
    steps: z.array(line).max(30).default([]),
    labels,
    colour: z
      .string()
      .regex(/^(#[0-9a-fA-F]{6})?$/)
      .default(''),
    category: z.string().trim().max(40).default(''),
    needsReview: z.boolean().default(false),
    freq: z.enum(['none', 'daily', 'weekly', 'monthly', 'quarterly']).default('none'),
    weekday: z.number().int().min(0).max(6).default(1),
    monthday: z.number().int().min(1).max(28).default(1),
    untilOn: z.iso.date().nullable().default(null),
    ...people,
  })
  .strict();
const sequenceInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(600).default(''),
    steps: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(150),
          description: z.string().trim().max(600).default(''),
          day: z.number().int().min(0).max(365),
          days: z.number().int().min(1).max(90).default(1),
          kind: z.enum(['task', 'target']).default('task'),
          priority,
          points: z.number().int().min(0).max(1000).default(0),
          needsReview: z.boolean().default(false),
          steps: z.array(line).max(30).default([]),
        }),
      )
      .min(1)
      .max(30)
      .transform((s) => [...s].sort((a, b) => a.day - b.day)),
  })
  .strict();
const giveInput = z
  .object({
    startOn: z.iso.date(),
    repeat: z.enum(['none', 'monthly', 'quarterly']).default('none'),
    untilOn: z.iso.date().nullable().default(null),
    ...people,
  })
  .strict()
  .refine((v) => !v.untilOn || v.untilOn >= v.startOn);

/** The same id every time for the same words: the cards of one round or period share a group. */
const groupOf = (text: string) => {
  const h = createHash('sha1').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const inReach = (reach: ReviewScope, teamId: string | null) =>
  'all' in reach || ('teamIds' in reach && !!teamId && reach.teamIds.includes(teamId));
/** Who gets the cards: the chosen active people, and every active agent of the chosen teams. */
const recipients = (all: Person[], userIds: string[], teamIds: string[]) =>
  all.filter(
    (p) =>
      p.active &&
      (userIds.includes(p.membershipId) || (p.role === 'agent' && !!p.teamId && teamIds.includes(p.teamId))),
  );
/** Only people and teams the person reaches can be chosen. */
async function checkPeople(tx: Tx, reach: ReviewScope, userIds: string[], teamIds: string[]) {
  const all = await listPeople(tx);
  for (const id of userIds) {
    const p = all.find((x) => x.membershipId === id);
    if (!p || !p.active || !inReach(reach, p.teamId)) throw badRequest('taskNobody');
  }
  for (const id of teamIds) if (!inReach(reach, id)) throw badRequest('taskNobody');
}

/** One round of a sequence: every step for every person, each with its own start and deadline; each is told. */
async function giveRound(tx: Tx, run: SequenceRun, seq: TaskSequence, start: string, people: Person[]) {
  const who = recipients(people, run.userIds, run.teamIds);
  const given = { at: new Date().toISOString(), byName: run.byName, action: 'given' as const };
  for (const p of who) {
    for (const [i, s] of seq.steps.entries()) {
      const startOn = addDays(start, s.day);
      await addRepeatingTask(tx, {
        groupId: groupOf(`${run.id}:${start}:${i}`),
        recurKey: `${run.id}:${start}:${i}:${p.membershipId}`,
        title: s.title,
        description: s.description,
        kind: s.kind,
        priority: s.priority,
        points: s.points,
        startOn,
        dueOn: addDays(startOn, Math.max(1, s.days) - 1),
        status: 'todo',
        needsReview: s.needsReview,
        assigneeId: p.membershipId,
        assigneeName: p.name,
        teamId: p.teamId,
        teamName: p.teamName ?? '',
        steps: s.steps.map((x) => ({ ...x, done: false })),
        labels: [],
        colour: '',
        category: '',
        history: [given],
        runId: run.id,
        stepNo: i + 1,
        stepCount: seq.steps.length,
        sequenceName: seq.name,
        byId: run.byId,
        byName: run.byName,
      });
    }
    await notify(
      tx,
      p.membershipId,
      'sequenceGiven',
      { name: seq.name.slice(0, 80), count: String(seq.steps.length), start },
      '/quality/tasks',
    );
  }
  await updateSequenceRun(tx, run.id, { cycles: [...run.cycles, start].slice(-50) });
  return who.length;
}

/**
 * The repeating cards due today (today's `recurring`): each repeating template's card for its period, once per person,
 * on a working day; and the latest round of each repeating sequence. Runs inside the company's wall whenever anybody
 * opens their tasks. Returns how many template cards it added.
 */
export async function giveRepeats(tx: Tx, today = localDay(new Date())): Promise<number> {
  const templates = (await listTaskTemplates(tx)).filter((t) => t.freq !== 'none' && !(t.untilOn && today > t.untilOn));
  const runs = (await listSequenceRuns(tx)).filter((r) => r.active && r.repeat !== 'none');
  if (!templates.length && !runs.length) return 0;
  const all = await listPeople(tx);
  let added = 0;
  // on a day off, the card waits for the next working day of the same period
  if (isWorkingDay(today))
    for (const tpl of templates) {
      const day = periodDay(tpl, today);
      if (!day || day < localDay(tpl.createdAt)) continue; // nothing for periods before the template existed
      const given = { at: new Date().toISOString(), byName: tpl.byName, action: 'given' as const };
      for (const p of recipients(all, tpl.userIds, tpl.teamIds))
        if (
          await addRepeatingTask(tx, {
            groupId: groupOf(`${tpl.id}:${day}`),
            recurKey: `${tpl.id}:${day}:${p.membershipId}`,
            templateId: tpl.id,
            title: tpl.title,
            description: tpl.description,
            kind: tpl.kind === 'target' ? 'target' : 'task',
            priority: tpl.priority,
            points: tpl.points,
            startOn: null,
            dueOn: today,
            status: 'todo',
            needsReview: tpl.needsReview,
            assigneeId: p.membershipId,
            assigneeName: p.name,
            teamId: p.teamId,
            teamName: p.teamName ?? '',
            steps: tpl.steps.map((s) => ({ ...s, done: false })),
            labels: tpl.labels,
            colour: tpl.colour,
            category: tpl.category,
            history: [given],
            byId: tpl.byId,
            byName: tpl.byName,
          })
        )
          added++;
    }
  for (const r of runs) {
    const round = dueRound(r.startOn, r.repeat, today, r.untilOn);
    if (!round || r.cycles.includes(round)) continue;
    const seq = await getTaskSequence(tx, r.sequenceId);
    if (seq) await giveRound(tx, r, seq, round, all);
  }
  return added;
}

@Controller('task-templates')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TaskTemplatesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('tasks.write')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listTaskTemplates(tx));
  }

  @Post()
  @Allow('tasks.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const input = this.parse(body);
    return withCompany(this.db, membership.companyId, async (tx) => {
      await checkPeople(tx, await reachOf(tx, membership, scope), input.userIds, input.teamIds);
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const id = await addTaskTemplate(tx, input, { id: me, name: membership.userName });
      await logActivity(tx, actorOf(membership), { action: 'taskTemplateSaved', targetName: input.title });
      return getTaskTemplate(tx, id);
    });
  }

  @Put(':id')
  @Allow('tasks.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('templateNotFound');
    const input = this.parse(body);
    return withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await getTaskTemplate(tx, target.data))) throw notFound('templateNotFound');
      await checkPeople(tx, await reachOf(tx, membership, scope), input.userIds, input.teamIds);
      await updateTaskTemplate(tx, target.data, input);
      await logActivity(tx, actorOf(membership), { action: 'taskTemplateSaved', targetName: input.title });
      return getTaskTemplate(tx, target.data);
    });
  }

  @Delete(':id')
  @Allow('tasks.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('templateNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const tpl = await getTaskTemplate(tx, target.data);
      if (!tpl) throw notFound('templateNotFound');
      await deleteTaskTemplate(tx, tpl.id);
      await logActivity(tx, actorOf(membership), { action: 'taskTemplateDeleted', targetName: tpl.title });
    });
  }

  private parse(body: unknown) {
    const parsed = templateInput.safeParse(body);
    if (!parsed.success) throw badRequest('templateInvalid');
    // a repeating template needs someone to give its cards to
    if (parsed.data.freq !== 'none' && !parsed.data.userIds.length && !parsed.data.teamIds.length)
      throw badRequest('templateNobody');
    return parsed.data;
  }
}

@Controller('task-sequences')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TaskSequencesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The sequences and their rounds (the active ones say who gets them and how often). */
  @Get()
  @Allow('tasks.write')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => ({
      sequences: await listTaskSequences(tx),
      runs: await listSequenceRuns(tx),
    }));
  }

  @Post()
  @Allow('tasks.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const parsed = sequenceInput.safeParse(body);
    if (!parsed.success) throw badRequest('sequenceInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const id = await addTaskSequence(tx, parsed.data, { id: me, name: membership.userName });
      await logActivity(tx, actorOf(membership), { action: 'sequenceSaved', targetName: parsed.data.name });
      return getTaskSequence(tx, id);
    });
  }

  @Put(':id')
  @Allow('tasks.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const parsed = sequenceInput.safeParse(body);
    if (!target.success) throw notFound('sequenceNotFound');
    if (!parsed.success) throw badRequest('sequenceInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await getTaskSequence(tx, target.data))) throw notFound('sequenceNotFound');
      await updateTaskSequence(tx, target.data, parsed.data);
      await logActivity(tx, actorOf(membership), { action: 'sequenceSaved', targetName: parsed.data.name });
      return getTaskSequence(tx, target.data);
    });
  }

  @Delete(':id')
  @Allow('tasks.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('sequenceNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const seq = await getTaskSequence(tx, target.data);
      if (!seq) throw notFound('sequenceNotFound');
      await deleteTaskSequence(tx, seq.id);
      await logActivity(tx, actorOf(membership), { action: 'sequenceDeleted', targetName: seq.name });
    });
  }

  /** Gives a sequence: its first round now (each task starts on its own day), then again every month or quarter. */
  @Post(':id/give')
  @Allow('tasks.write')
  async give(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const target = idParam.safeParse(id);
    const parsed = giveInput.safeParse(body);
    if (!target.success) throw notFound('sequenceNotFound');
    if (!parsed.success) throw badRequest('sequenceInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const seq = await getTaskSequence(tx, target.data);
      if (!seq) throw notFound('sequenceNotFound');
      const reach = await reachOf(tx, membership, scope);
      await checkPeople(tx, reach, parsed.data.userIds, parsed.data.teamIds);
      const all = await listPeople(tx);
      const who = recipients(all, parsed.data.userIds, parsed.data.teamIds).filter((p) => inReach(reach, p.teamId));
      if (!who.length) throw badRequest('taskNobody');
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const run = await addSequenceRun(tx, {
        sequenceId: seq.id,
        ...parsed.data,
        byId: me,
        byName: membership.userName,
      });
      const people = await giveRound(tx, run, seq, run.startOn, all);
      await logActivity(tx, actorOf(membership), {
        action: 'sequenceGiven',
        targetName: seq.name,
        details: { count: String(people) },
      });
      return { run, people, tasks: people * seq.steps.length };
    });
  }

  /** Stops a repeating round: no more rounds (the cards already given stay). */
  @Put('runs/:id')
  @Allow('tasks.write')
  async stop(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('sequenceNotFound');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const run = (await listSequenceRuns(tx)).find((r) => r.id === target.data);
      if (!run) throw notFound('sequenceNotFound');
      await updateSequenceRun(tx, run.id, { active: false });
      const seq = await getTaskSequence(tx, run.sequenceId);
      await logActivity(tx, actorOf(membership), { action: 'sequenceStopped', targetName: seq?.name ?? '' });
      return { ...run, active: false };
    });
  }
}
