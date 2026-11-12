// Tasks (Phase 4, today's Tasks › My Tasks), with today's rules:
// - admins, reviewers, team leads and trainers give tasks and targets to people or whole teams of their workspaces
//   (admins: everyone); each person gets their own card, and is told in the bell;
// - a card goes To Do → In Progress → Done; ticking its checklist moves it (the first tick starts it, the last finishes
//   it); with "needs review", the person's "done" waits In review until someone who gives tasks and sees them approves
//   it (Done) or sends it back with a comment;
// - the person pins and archives their own cards; the ones who give tasks change everything else, give a card to
//   someone else or delete it;
// - every card keeps a short history (given, started, sent for review, approved, sent back, done, deadline moved …).
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addTasks,
  type Db,
  deleteTask,
  getTask,
  listPeople,
  listTasks,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  type Person,
  type ReviewScope,
  type Task,
  type TaskChange,
  type TaskEvent,
  type TaskStatus,
  updateTask,
  withCompany,
  withEvent,
} from '@qsmart/db';
import { type Scope, scopeOf } from '@qsmart/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { giveRepeats } from './task-library.controller.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const STATUSES = ['todo', 'doing', 'review', 'done'] as const;
const step = z.object({
  text: z.string().trim().min(1).max(150),
  minutes: z.number().int().min(0).max(600).default(0),
  done: z.boolean().default(false),
});
const labelList = z
  .array(z.string().trim().min(1).max(30))
  .max(8)
  .transform((l) => [...new Set(l)]);
const colourCode = z.string().regex(/^(#[0-9a-fA-F]{6})?$/);
const fields = {
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1500).default(''),
  kind: z.enum(['task', 'target']).default('task'),
  priority: z.enum(['low', 'med', 'high']).default('med'),
  points: z.number().int().min(0).max(1000).default(0),
  startOn: z.iso.date().nullable().default(null),
  dueOn: z.iso.date().nullable().default(null),
  needsReview: z.boolean().default(false),
  steps: z.array(step).max(30).default([]),
  labels: labelList.default([]),
  colour: colourCode.default(''),
  category: z.string().trim().max(40).default(''),
};
const datesInOrder = (v: { startOn?: string | null; dueOn?: string | null }) =>
  !v.startOn || !v.dueOn || v.startOn <= v.dueOn;
const newTask = z
  .object({
    ...fields,
    assigneeIds: z.array(z.uuid()).max(200).default([]),
    teamIds: z.array(z.uuid()).max(50).default([]),
  })
  .strict()
  .refine(datesInOrder);
const change = z
  .object({
    title: fields.title,
    description: z.string().trim().max(1500),
    kind: z.enum(['task', 'target']),
    priority: z.enum(['low', 'med', 'high']),
    points: z.number().int().min(0).max(1000),
    startOn: z.iso.date().nullable(),
    dueOn: z.iso.date().nullable(),
    needsReview: z.boolean(),
    steps: z.array(step).max(30),
    // no defaults here: a change carries only what it changes
    labels: labelList,
    colour: colourCode,
    category: z.string().trim().max(40),
    assigneeId: z.uuid(),
    status: z.enum(STATUSES),
    /** why it is sent back */
    note: z.string().trim().max(300),
    pinned: z.boolean(),
    archived: z.boolean(),
  })
  .partial()
  .strict();
/** What the person a task is given to may change on their own card (everything else is for the ones who give tasks). */
const OWN_CHANGES = new Set(['status', 'steps', 'pinned', 'archived']);

const inReach = (reach: ReviewScope, p: Pick<Person, 'teamId'>) =>
  'all' in reach || ('teamIds' in reach && !!p.teamId && reach.teamIds.includes(p.teamId));

@Controller('tasks')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TasksController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Staff: their own tasks and those of their workspaces' people (admins all); agents: their own. */
  @Get()
  @Allow('tasks.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      // the repeating cards due today come the first time anybody opens their tasks (today's rule)
      await giveRepeats(tx);
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      return listTasks(tx, await reachOf(tx, membership, scope), me);
    });
  }

  /** Gives a task to people and whole teams (their active agents): one card each, and each is told. */
  @Post()
  @Allow('tasks.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const parsed = newTask.safeParse(body);
    if (!parsed.success) throw badRequest('taskInvalid');
    const { assigneeIds, teamIds, ...input } = parsed.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const people = (await listPeople(tx)).filter((p) => p.active && inReach(reach, p));
      const chosen = people.filter(
        (p) => assigneeIds.includes(p.membershipId) || (p.role === 'agent' && !!p.teamId && teamIds.includes(p.teamId)),
      );
      if (!chosen.length) throw badRequest('taskNobody');
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const groupId = randomUUID();
      const given: TaskEvent = { at: new Date().toISOString(), byName: membership.userName, action: 'given' };
      const ids = await addTasks(
        tx,
        chosen.map((p) => ({
          ...input,
          groupId,
          status: 'todo' as const,
          assigneeId: p.membershipId,
          assigneeName: p.name,
          teamId: p.teamId,
          teamName: p.teamName ?? '',
          history: [given],
          byId: me,
          byName: membership.userName,
        })),
      );
      for (const [i, p] of chosen.entries())
        if (p.membershipId !== me)
          await notify(
            tx,
            p.membershipId,
            input.kind === 'target' ? 'targetGiven' : 'taskGiven',
            { name: membership.userName, title: input.title.slice(0, 80), due: input.dueOn ?? '' },
            `/quality/tasks?task=${ids[i]}`,
          );
      await logActivity(tx, actorOf(membership), {
        action: 'tasksGiven',
        targetName: input.title,
        details: { count: String(chosen.length) },
      });
      return Promise.all(ids.map((id) => getTask(tx, id, { all: true }, null)));
    });
  }

  /**
   * Changes a card. Its person moves it, ticks its checklist, pins or archives it; the ones who give tasks (and see
   * the person) change the rest, give it to someone else, and approve it or send it back when it waits In review.
   */
  @Put(':id')
  @Allow('tasks.progress')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const target = idParam.safeParse(id);
    const parsed = change.safeParse(body);
    if (!target.success || !parsed.success) throw badRequest('taskInvalid');
    const input = parsed.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const task = await getTask(tx, target.data, await reachOf(tx, membership, scope), me);
      if (!task) throw notFound('taskNotFound');
      const mine = !!me && task.assigneeId === me;
      // the ones who give tasks, for the people they reach (a reviewer's own card from someone else: only as its person)
      const writeScope = scopeOf(membership.role, 'tasks.write');
      const editor = !!writeScope && !!(await getTask(tx, task.id, await reachOf(tx, membership, writeScope), null));
      if (!editor && Object.keys(input).some((k) => !OWN_CHANGES.has(k))) throw forbidden('notAllowed');
      if (!editor && !mine) throw forbidden('notAllowed');
      const set: TaskChange = {};
      let history = task.history;
      const now = new Date().toISOString();
      const event = (action: TaskEvent['action'], note?: string) => {
        history = withEvent(history, { at: now, byName: membership.userName, action, ...(note ? { note } : {}) });
      };
      const tell: { to: string; kind: string; details: Record<string, string> }[] = [];
      const title = (input.title ?? task.title).slice(0, 80);

      if (editor) {
        const {
          title: t,
          description,
          kind,
          priority,
          points,
          startOn,
          dueOn,
          needsReview,
          labels,
          colour,
          category,
        } = input;
        Object.assign(
          set,
          Object.fromEntries(
            Object.entries({
              title: t,
              description,
              kind,
              priority,
              points,
              startOn,
              dueOn,
              needsReview,
              labels,
              colour,
              category,
            }).filter(([, v]) => v !== undefined),
          ),
        );
        if (!datesInOrder({ startOn: set.startOn ?? task.startOn, dueOn: set.dueOn ?? task.dueOn }))
          throw badRequest('taskInvalid');
        if (dueOn !== undefined && dueOn !== task.dueOn) event('due', `${task.dueOn ?? '-'} → ${dueOn ?? '-'}`);
        if (input.assigneeId && input.assigneeId !== task.assigneeId) {
          const reach = await reachOf(tx, membership, writeScope ?? scope);
          const person = (await listPeople(tx)).find((p) => p.membershipId === input.assigneeId);
          if (!person || !person.active || !inReach(reach, person)) throw badRequest('taskNobody');
          Object.assign(set, {
            assigneeId: person.membershipId,
            assigneeName: person.name,
            teamId: person.teamId,
            teamName: person.teamName ?? '',
          });
          event('assigned', person.name);
          if (person.membershipId !== me)
            tell.push({
              to: person.membershipId,
              kind: task.kind === 'target' ? 'targetGiven' : 'taskGiven',
              details: { name: membership.userName, title, due: set.dueOn ?? task.dueOn ?? '' },
            });
        }
      }

      // the checklist: the ones who give tasks change it; the person only ticks its lines
      let steps = task.steps;
      if (input.steps) {
        if (editor) steps = input.steps;
        else if (input.steps.length === task.steps.length)
          steps = task.steps.map((s, i) => ({ ...s, done: input.steps?.[i]?.done ?? s.done }));
        else throw badRequest('taskInvalid');
        set.steps = steps;
      }

      // the status: asked for, or moved by the checklist (first tick starts the card, the last finishes it)
      let to: TaskStatus | undefined = input.status;
      if (!to && input.steps && steps.length) {
        const ticked = steps.filter((s) => s.done).length;
        if (ticked === steps.length && task.status !== 'done' && task.status !== 'review') to = 'done';
        else if (ticked > 0 && task.status === 'todo') to = 'doing';
      }
      const checker = editor && !mine;
      if (to === 'done' && (set.needsReview ?? task.needsReview) && !checker) to = 'review';
      if (to && to !== task.status) {
        const was = task.status;
        set.status = to;
        if (to === 'doing' && !task.startedAt) set.startedAt = new Date(now);
        set.completedAt = to === 'done' ? new Date(now) : null;
        if (to === 'review') {
          set.sentAt = new Date(now);
          event('review');
          if (task.byId && task.byId !== me)
            tell.push({ to: task.byId, kind: 'taskReview', details: { name: membership.userName, title } });
        } else if (was === 'review' && checker) {
          event(to === 'done' ? 'approved' : 'returned', to === 'done' ? undefined : input.note);
          if (task.assigneeId)
            tell.push({
              to: task.assigneeId,
              kind: to === 'done' ? 'taskApproved' : 'taskReturned',
              details: { name: membership.userName, title, note: (input.note ?? '').slice(0, 80) },
            });
        } else {
          event(to === 'doing' ? 'started' : to);
          if (to === 'done' && !checker && task.byId && task.byId !== me)
            tell.push({ to: task.byId, kind: 'taskDone', details: { name: membership.userName, title } });
        }
      }

      if (input.pinned !== undefined) set.pinned = input.pinned;
      if (input.archived !== undefined && input.archived !== !!task.archivedAt) {
        set.archivedAt = input.archived ? new Date(now) : null;
        event(input.archived ? 'archived' : 'restored');
      }
      if (history !== task.history) set.history = history;
      if (Object.keys(set).length) await updateTask(tx, task.id, set);
      for (const n of tell) await notify(tx, n.to, n.kind, n.details, `/quality/tasks?task=${task.id}`);
      return getTask(tx, task.id, { all: true }, null);
    });
  }

  @Delete(':id')
  @Allow('tasks.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('taskNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const task: Task | undefined = await getTask(tx, target.data, await reachOf(tx, membership, scope), me);
      if (!task) throw notFound('taskNotFound');
      await deleteTask(tx, task.id);
      await logActivity(tx, actorOf(membership), {
        action: 'taskDeleted',
        targetName: task.assigneeName,
        details: { title: task.title },
      });
    });
  }
}
