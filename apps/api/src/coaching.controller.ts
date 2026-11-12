// Coaching sessions (Phase 4, today's Coaching), with today's rules:
// - admins, reviewers and trainers document individual coaching, group coaching and trainings for the agents of their
//   workspaces (admins: everyone); team leads read them; one-to-ones come with step 5;
// - a session has its date, held or planned, its agents, the categories worked on, other topics, goals, notes, a
//   follow-up date and action items; "also create a task" gives each action with a person to them as a task;
// - the agents of a held session read it and sign "I have read it and I agree" (with an optional comment); the person
//   who wrote it is told. Agents are told when a session is planned with them, and when one is ready to sign.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addSession,
  addTasks,
  type CoachingSession,
  type Db,
  deleteSession,
  getSession,
  listPeople,
  listSessions,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  type Person,
  type ReviewScope,
  type SessionAction,
  type Tx,
  updateSession,
  withCompany,
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
import { DB } from './tokens.js';

const idParam = z.uuid();
const sessionInput = z
  .object({
    kind: z.enum(['coaching', 'group', 'training']),
    heldOn: z.iso.date(),
    title: z.string().trim().min(1).max(150),
    status: z.enum(['planned', 'done']).default('done'),
    agentIds: z.array(z.uuid()).min(1).max(60),
    focus: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    topics: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    goals: z.string().trim().max(4000).default(''),
    notes: z.string().trim().max(8000).default(''),
    followUpOn: z.iso.date().nullable().default(null),
    actions: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(200),
          ownerId: z.union([z.uuid(), z.literal('')]).default(''),
          dueOn: z.iso.date().nullable().default(null),
          done: z.boolean().default(false),
          taskId: z.uuid().nullable().default(null),
        }),
      )
      .max(20)
      .default([]),
    /** also give each action with a person to them as a task */
    makeTasks: z.boolean().default(false),
  })
  .strict();
const signInput = z.object({ comment: z.string().trim().max(500).default('') }).strict();

const inReach = (reach: ReviewScope, p: Pick<Person, 'teamId'>) =>
  'all' in reach || ('teamIds' in reach && !!p.teamId && reach.teamIds.includes(p.teamId));

/**
 * Gives each action with a person and no task yet to that person as a task (they're told, and it's on their board);
 * the action keeps its task's id, so it's never given twice. Used by coaching sessions and one-to-ones.
 */
export async function giveActionsAsTasks(
  tx: Tx,
  membership: Membership,
  me: string | null,
  actions: SessionAction[],
  from: string,
  people: Person[],
) {
  const now = new Date().toISOString();
  for (const a of actions) {
    if (a.taskId || !a.ownerId) continue;
    const owner = people.find((x) => x.membershipId === a.ownerId);
    if (!owner) continue;
    const [taskId] = await addTasks(tx, [
      {
        groupId: randomUUID(),
        title: a.text.slice(0, 150),
        description: from.slice(0, 1500),
        kind: 'task',
        priority: 'med',
        points: 0,
        startOn: null,
        dueOn: a.dueOn,
        status: a.done ? 'done' : 'todo',
        needsReview: false,
        assigneeId: owner.membershipId,
        assigneeName: owner.name,
        teamId: owner.teamId,
        teamName: owner.teamName ?? '',
        steps: [],
        labels: [],
        colour: '',
        category: '',
        history: [{ at: now, byName: membership.userName, action: 'given' }],
        byId: me,
        byName: membership.userName,
      },
    ]);
    a.taskId = taskId ?? null;
    if (owner.membershipId !== me && taskId)
      await notify(
        tx,
        owner.membershipId,
        'taskGiven',
        { name: membership.userName, title: a.text.slice(0, 80), due: a.dueOn ?? '' },
        `/quality/tasks?task=${taskId}`,
      );
  }
}

/** Where a session opens: a one-to-one on the One-to-One page, the others on their own page. */
/** An agent sees a one-to-one once it is sent or completed, never while it is a draft. */
const hiddenFrom = (reach: ReviewScope, s: Pick<CoachingSession, 'kind' | 'state'>) =>
  'agentId' in reach && s.kind === 'o2o' && s.state === 'draft';

export const sessionLink = (s: Pick<CoachingSession, 'id' | 'kind'>) =>
  s.kind === 'o2o' ? `/quality/one-to-one?session=${s.id}` : `/session/${s.id}`;

@Controller('coaching-sessions')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class CoachingController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Staff: the sessions of their workspaces' agents (admins all); agents: their own. One-to-ones too (step 5). */
  @Get()
  @Allow('coaching.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      return (await listSessions(tx, reach)).filter((s) => !hiddenFrom(reach, s));
    });
  }

  @Get(':id')
  @Allow('coaching.read')
  async one(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    return withCompany(this.db, membership.companyId, async (tx) => this.session(tx, membership, scope, id));
  }

  @Post()
  @Allow('coaching.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const parsed = sessionInput.safeParse(body);
    if (!parsed.success) throw badRequest('sessionInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const ready = await this.prepare(tx, membership, scope, parsed.data, me);
      const id = await addSession(tx, ready.session, { id: me, name: membership.userName });
      await this.tell(tx, membership, id, ready.session, null, me);
      await logActivity(tx, actorOf(membership), {
        action: 'sessionSaved',
        targetName: ready.session.title,
        details: { kind: ready.session.kind },
      });
      return getSession(tx, id, { all: true });
    });
  }

  @Put(':id')
  @Allow('coaching.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = sessionInput.safeParse(body);
    if (!parsed.success) throw badRequest('sessionInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const old = await this.session(tx, membership, scope, id);
      if (old.kind === 'o2o') throw forbidden('notAllowed');
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const ready = await this.prepare(tx, membership, scope, parsed.data, me);
      await updateSession(tx, old.id, ready.session);
      await this.tell(tx, membership, old.id, ready.session, old, me);
      await logActivity(tx, actorOf(membership), {
        action: 'sessionSaved',
        targetName: ready.session.title,
        details: { kind: ready.session.kind },
      });
      return getSession(tx, old.id, { all: true });
    });
  }

  @Delete(':id')
  @Allow('coaching.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    await withCompany(this.db, membership.companyId, async (tx) => {
      const s = await this.session(tx, membership, scope, id);
      if (s.kind === 'o2o') throw forbidden('notAllowed');
      await deleteSession(tx, s.id);
      await logActivity(tx, actorOf(membership), {
        action: 'sessionDeleted',
        targetName: s.title,
        details: { kind: s.kind },
      });
    });
  }

  /** An agent of a held session signs it: "I have read it and I agree", with an optional comment. */
  @Post(':id/sign')
  @Allow('sessions.sign')
  @HttpCode(200)
  async sign(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = signInput.safeParse(body ?? {});
    if (!parsed.success) throw badRequest('sessionInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const s = await this.session(tx, membership, scope, id);
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? '';
      if (!s.agents.some((a) => a.id === me)) throw forbidden('notAllowed');
      if (s.status !== 'done') throw badRequest('sessionNotHeld');
      const signatures = { ...s.signatures, [me]: { at: new Date().toISOString(), comment: parsed.data.comment } };
      await updateSession(tx, s.id, {
        signatures,
        // a one-to-one is signed when every agent of it signed
        ...(s.kind === 'o2o' && s.agents.every((a) => signatures[a.id]) ? { state: 'signed' as const } : {}),
      });
      if (s.byId && s.byId !== me)
        await notify(
          tx,
          s.byId,
          'sessionSigned',
          { name: membership.userName, title: s.title.slice(0, 80) },
          sessionLink(s),
        );
      return getSession(tx, s.id, { all: true });
    });
  }

  private async session(tx: Tx, membership: Membership, scope: Scope, id: string): Promise<CoachingSession> {
    const target = idParam.safeParse(id);
    const reach = await reachOf(tx, membership, scope);
    const s = target.success ? await getSession(tx, target.data, reach) : undefined;
    if (!s || hiddenFrom(reach, s)) throw notFound('sessionNotFound');
    return s;
  }

  /** The session as saved: its agents and action owners checked against the writer's reach; tasks made if asked. */
  private async prepare(
    tx: Tx,
    membership: Membership,
    scope: Scope,
    input: z.infer<typeof sessionInput>,
    me: string | null,
  ) {
    const reach = await reachOf(tx, membership, scopeOf(membership.role, 'coaching.write') ?? scope);
    const people = (await listPeople(tx)).filter((p) => p.active);
    const agents = input.agentIds.map((id) => {
      const p = people.find((x) => x.membershipId === id && x.role === 'agent');
      if (!p || !inReach(reach, p)) throw badRequest('sessionAgents');
      return { id: p.membershipId, name: p.name, teamId: p.teamId, teamName: p.teamName ?? '' };
    });
    const actions: SessionAction[] = input.actions.map((a) => {
      const owner = a.ownerId ? people.find((x) => x.membershipId === a.ownerId) : undefined;
      if (a.ownerId && (!owner || !inReach(reach, owner))) throw badRequest('sessionAgents');
      return {
        text: a.text,
        ownerId: owner?.membershipId ?? '',
        ownerName: owner?.name ?? '',
        dueOn: a.dueOn,
        done: a.done,
        taskId: a.taskId,
      };
    });
    if (input.makeTasks) await giveActionsAsTasks(tx, membership, me, actions, input.title, people);
    const { agentIds: _a, makeTasks: _m, ...rest } = input;
    return { session: { ...rest, agents, actions } };
  }

  /** The agents are told: of a session planned with them, and of one held, ready to read and sign. */
  private async tell(
    tx: Tx,
    membership: Membership,
    id: string,
    s: Pick<CoachingSession, 'status' | 'title' | 'heldOn' | 'agents'>,
    old: CoachingSession | null,
    me: string | null,
  ) {
    const before = new Set(old?.agents.map((a) => a.id) ?? []);
    for (const a of s.agents) {
      if (a.id === me || old?.signatures[a.id]) continue;
      const fresh = !before.has(a.id);
      const nowHeld = s.status === 'done' && (fresh || old?.status !== 'done');
      const nowPlanned = s.status === 'planned' && fresh;
      if (nowHeld)
        await notify(
          tx,
          a.id,
          'sessionToSign',
          { name: membership.userName, title: s.title.slice(0, 80) },
          `/session/${id}`,
        );
      else if (nowPlanned)
        await notify(
          tx,
          a.id,
          'sessionPlanned',
          { name: membership.userName, title: s.title.slice(0, 80), date: s.heldOn },
          `/session/${id}`,
        );
    }
  }
}
