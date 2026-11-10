// Performance (today's perf.js), with today's rules:
// - Goals & KPIs: admins, reviewers and team leads set monthly goals for the company, a team or one agent; everyone
//   sees the progress, an agent only of the company's goals, their team's and their own. The progress is counted
//   here, from every review of the company (an agent's browser only has their own), and only the totals are sent.
// - Improvement plans: staff start them for an agent (goals, check-ins, outcome); the agent reads their own and signs.
// - Recognition: everyone gives kudos (never to themselves) and reads the wall and this month's leaderboard; the person
//   who gave kudos, or an admin, deletes them. The leaderboard is counted here too.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  addGoals,
  addKudos,
  addPlan,
  type Db,
  deleteGoal,
  deleteKudos,
  deletePlan,
  findMembership,
  getGoal,
  getKudos,
  getPerson,
  getPlan,
  type Goal,
  type GoalInput,
  listGoals,
  listKudos,
  listPeople,
  listPlans,
  listQuickFlags,
  listReviews,
  listTeams,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  passRates,
  type Tx,
  updateGoal,
  updatePlan,
  withCompany,
} from '@qsmart/db';
import {
  averageScore,
  COUNTED_METRICS,
  goalState,
  isPass,
  leaderboardPoints,
  monthOf,
  passRateOf,
  type Scope,
  scoredOnly,
  share,
  type StatReview,
} from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const thisMonth = () => new Date().toISOString().slice(0, 7);
/** today's ten badges */
export const BADGES = ['⭐', '🏆', '🎯', '💚', '🚀', '🔥', '👏', '🧠', '💬', '🤝'];

const goalInput = z.object({
  title: z.string().trim().max(150).default(''),
  scope: z.enum(['all', 'team', 'agent']),
  teamId: z.uuid().nullish(),
  agentId: z.uuid().nullish(),
  metric: z.enum(COUNTED_METRICS as ['avg', 'pass', 'reviews', 'kudos']),
  value: z.number().positive().max(100000),
  channel: z.enum(['', 'call', 'chat', 'email', 'other']).default(''),
  month,
});
const planGoalText = z.string().trim().min(1).max(200);
const newPlan = z.object({
  agentId: z.uuid(),
  title: z.string().trim().min(1).max(150),
  reason: z.string().trim().max(2000).default(''),
  startOn: day,
  endOn: day,
  goals: z.array(planGoalText).max(20).default([]),
});
const planChange = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    reason: z.string().trim().max(2000).optional(),
    startOn: day.optional(),
    endOn: day.optional(),
    goals: z
      .array(z.object({ text: planGoalText, done: z.boolean() }))
      .max(20)
      .optional(),
    status: z.enum(['active', 'extended', 'passed', 'failed', 'cancelled']).optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined));
const checkIn = z.object({ date: day, note: z.string().trim().min(1).max(1000) });
const signature = z.object({ note: z.string().trim().max(1000).default('') });
const newKudos = z.object({
  toId: z.uuid(),
  badge: z.string().refine((b) => BADGES.includes(b)),
  text: z.string().trim().min(1).max(500),
});

/** The reviews that count for numbers: scored ones, by the month of the conversation. */
async function scoredReviews(tx: Tx): Promise<StatReview[]> {
  return scoredOnly((await listReviews(tx, { all: true })) as unknown as StatReview[]);
}

/** Checks who a goal is for, and keeps their name. */
async function goalTarget(tx: Tx, g: z.infer<typeof goalInput>): Promise<GoalInput> {
  const base = { title: g.title, scope: g.scope, metric: g.metric, value: g.value, channel: g.channel, month: g.month };
  if (g.scope === 'team') {
    const team = (await listTeams(tx)).find((t) => t.id === g.teamId);
    if (!team || team.isAdministration) throw badRequest('goalInvalid');
    return { ...base, teamId: team.id, agentId: null, targetName: team.name };
  }
  if (g.scope === 'agent') {
    const agent = g.agentId ? await findMembership(tx, g.agentId) : undefined;
    if (!agent || agent.role !== 'agent') throw badRequest('goalInvalid');
    return { ...base, teamId: null, agentId: agent.id, targetName: (await getPerson(tx, agent.id))?.name ?? '' };
  }
  return { ...base, teamId: null, agentId: null, targetName: '' };
}

@Controller('goals')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class GoalsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The goals of a month, each with its progress (the real value, how far, and its state). */
  @Get()
  @Allow('goals.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Query('month') asked?: string) {
    const m = month.safeParse(asked ?? thisMonth());
    if (!m.success) throw badRequest('goalInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      const reach = scope === 'own' ? { agentId: me?.id ?? '', teamId: me?.teamId ?? null } : null;
      const list = await listGoals(tx, reach, m.data);
      if (!list.length) return [];
      const [reviews, rates, people, kudos] = await Promise.all([
        scoredReviews(tx),
        passRates(tx),
        listPeople(tx),
        listKudos(tx),
      ]);
      const teamOf = new Map(people.map((p) => [p.membershipId, p.teamId]));
      return list.map((g) => ({ ...g, ...progress(g, reviews, rates, teamOf, kudos) }));
    });
  }

  @Post()
  @Allow('goals.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = goalInput.safeParse(body);
    if (!input.success) throw badRequest('goalInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const goal = await goalTarget(tx, input.data);
      const me = await membershipOfUser(tx, membership.userId);
      const [id] = await addGoals(tx, [goal], { byId: me?.id ?? null, byName: membership.userName });
      if (goal.agentId) await notify(tx, goal.agentId, 'goalNew', { month: goal.month }, '/quality/goals-and-kpis');
      await logActivity(tx, actorOf(membership), {
        action: 'goalAdded',
        targetName: goal.targetName,
        details: { title: goal.title, month: goal.month },
      });
      return id ? getGoal(tx, id) : undefined;
    });
  }

  /** Today's "Copy last month": the goals of one month into another. */
  @Post('copy')
  @Allow('goals.write')
  async copy(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z.object({ from: month, to: month }).safeParse(body);
    if (!input.success || input.data.from === input.data.to) throw badRequest('goalInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const from = await listGoals(tx, null, input.data.from);
      const me = await membershipOfUser(tx, membership.userId);
      const ids = await addGoals(
        tx,
        from.map((g) => ({
          title: g.title,
          scope: g.scope,
          teamId: g.teamId,
          agentId: g.agentId,
          targetName: g.targetName,
          metric: g.metric,
          value: g.value,
          channel: g.channel,
          month: input.data.to,
        })),
        { byId: me?.id ?? null, byName: membership.userName },
      );
      return { copied: ids.length };
    });
  }

  @Put(':id')
  @Allow('goals.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = goalInput.safeParse(body);
    if (!target.success || !input.success) throw badRequest('goalInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const goal = await getGoal(tx, target.data);
      if (!goal) throw notFound('goalNotFound');
      await updateGoal(tx, goal.id, await goalTarget(tx, input.data));
      return getGoal(tx, goal.id);
    });
  }

  @Delete(':id')
  @Allow('goals.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('goalNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const goal = await getGoal(tx, target.data);
      if (!goal) throw notFound('goalNotFound');
      await deleteGoal(tx, goal.id);
      await logActivity(tx, actorOf(membership), {
        action: 'goalDeleted',
        targetName: goal.targetName,
        details: { title: goal.title, month: goal.month },
      });
    });
  }
}

/** Today's `goalProgress`: the real value for the goal's people in its month, and how far it is. */
function progress(
  g: Goal,
  reviews: StatReview[],
  rates: Awaited<ReturnType<typeof passRates>>,
  teamOf: Map<string, string | null>,
  kudos: { toId: string | null; createdAt: Date }[],
) {
  const forThem = (agentId: string | null, teamId: string | null) =>
    g.scope === 'agent' ? agentId === g.agentId : g.scope === 'team' ? teamId === g.teamId : true;
  const ev = reviews.filter(
    (r) =>
      r.reviewedOn.slice(0, 7) === g.month && forThem(r.agentId, r.teamId) && (!g.channel || r.channel === g.channel),
  );
  let value: number | null = null;
  if (g.metric === 'avg') value = averageScore(ev);
  if (g.metric === 'pass') value = share(ev, (r) => isPass(r, rates));
  if (g.metric === 'reviews') value = ev.length;
  if (g.metric === 'kudos')
    value = kudos.filter(
      (k) => monthOf(k.createdAt) === g.month && forThem(k.toId, k.toId ? (teamOf.get(k.toId) ?? null) : null),
    ).length;
  return { progress: value, ...goalState(value, g.value, g.month, thisMonth()) };
}

@Controller('improvement-plans')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ImprovementPlansController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('improvementPlans.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      if (scope !== 'own') return listPlans(tx, null);
      const me = await membershipOfUser(tx, membership.userId);
      return me ? listPlans(tx, me.id) : [];
    });
  }

  @Post()
  @Allow('improvementPlans.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = newPlan.safeParse(body);
    if (!input.success || input.data.endOn < input.data.startOn) throw badRequest('planInvalid');
    const p = input.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      const agent = await findMembership(tx, p.agentId);
      if (!agent || agent.role !== 'agent') throw badRequest('planInvalid');
      const me = await membershipOfUser(tx, membership.userId);
      const agentName = (await getPerson(tx, agent.id))?.name ?? '';
      const id = await addPlan(tx, {
        agentId: agent.id,
        agentName,
        title: p.title,
        reason: p.reason,
        startOn: p.startOn,
        endOn: p.endOn,
        goals: p.goals.map((text) => ({ text, done: false })),
        status: 'active',
        byId: me?.id ?? null,
        byName: membership.userName,
      });
      await notify(
        tx,
        agent.id,
        'planNew',
        { name: membership.userName, title: p.title },
        '/quality/improvement-plans',
      );
      await logActivity(tx, actorOf(membership), {
        action: 'planStarted',
        targetName: agentName,
        details: { title: p.title },
      });
      return getPlan(tx, id);
    });
  }

  @Put(':id')
  @Allow('improvementPlans.write')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = planChange.safeParse(body);
    if (!target.success || !input.success) throw badRequest('planInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const plan = await getPlan(tx, target.data);
      if (!plan) throw notFound('planNotFound');
      const startOn = input.data.startOn ?? plan.startOn;
      const endOn = input.data.endOn ?? plan.endOn;
      if (endOn < startOn) throw badRequest('planInvalid');
      await updatePlan(tx, plan.id, input.data);
      return getPlan(tx, plan.id);
    });
  }

  @Post(':id/check-ins')
  @Allow('improvementPlans.write')
  async addCheckIn(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = checkIn.safeParse(body);
    if (!target.success || !input.success) throw badRequest('planInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const plan = await getPlan(tx, target.data);
      if (!plan) throw notFound('planNotFound');
      if (plan.checkIns.length >= 100) throw badRequest('planInvalid');
      await updatePlan(tx, plan.id, {
        checkIns: [...plan.checkIns, { ...input.data, byName: membership.userName }],
      });
      return getPlan(tx, plan.id);
    });
  }

  /** The agent signs that they read the plan and agree (today's signature), with an optional comment. */
  @Post(':id/sign')
  @Allow('improvementPlans.read')
  async sign(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = signature.safeParse(body ?? {});
    if (!target.success || !input.success) throw badRequest('planInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const plan = await getPlan(tx, target.data);
      const me = await membershipOfUser(tx, membership.userId);
      if (!plan || (membership.role === 'agent' && plan.agentId !== me?.id)) throw notFound('planNotFound');
      if (!me || plan.agentId !== me.id) throw forbidden('planSignOwn');
      await updatePlan(tx, plan.id, { signedAt: new Date(), agentNote: input.data.note });
      return getPlan(tx, plan.id);
    });
  }

  @Delete(':id')
  @Allow('improvementPlans.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('planNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const plan = await getPlan(tx, target.data);
      if (!plan) throw notFound('planNotFound');
      await deletePlan(tx, plan.id);
      await logActivity(tx, actorOf(membership), {
        action: 'planDeleted',
        targetName: plan.agentName,
        details: { title: plan.title },
      });
    });
  }
}

@Controller('kudos')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class KudosController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('recognition.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listKudos(tx));
  }

  /**
   * This month's leaderboard (today's `kudosBoard`): every active agent with their kudos, green flags (on reviews and
   * quick flags), average (from 3 reviews) and points, best first.
   */
  @Get('board')
  @Allow('recognition.read')
  board(@CurrentMembership() membership: Membership, @Query('month') asked?: string) {
    const m = month.safeParse(asked ?? thisMonth());
    if (!m.success) throw badRequest('nothingToChange');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const [people, reviews, flags, kudos, rates] = await Promise.all([
        listPeople(tx),
        scoredReviews(tx),
        listQuickFlags(tx, { all: true }),
        listKudos(tx),
        passRates(tx),
      ]);
      return people
        .filter((p) => p.role === 'agent' && p.active)
        .map((p) => {
          const ev = reviews.filter((r) => r.agentId === p.membershipId && r.reviewedOn.slice(0, 7) === m.data);
          const k = kudos.filter((x) => x.toId === p.membershipId && monthOf(x.createdAt) === m.data).length;
          const green =
            ev.filter((r) => r.flag === 'green').length +
            flags.filter(
              (f) => f.agentId === p.membershipId && f.type === 'green' && f.flaggedOn.slice(0, 7) === m.data,
            ).length;
          const average = ev.length >= 3 ? averageScore(ev) : null;
          const target = passRateOf(rates, p.teamId);
          return {
            membershipId: p.membershipId,
            name: p.name,
            teamId: p.teamId,
            teamName: p.teamName ?? '',
            reviews: ev.length,
            kudos: k,
            green,
            taskPoints: 0,
            average,
            points: leaderboardPoints({ kudos: k, green, taskPoints: 0, average, target }),
          };
        })
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    });
  }

  @Post()
  @Allow('recognition.write')
  async add(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = newKudos.safeParse(body);
    if (!input.success) throw badRequest('kudosInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      const to = await findMembership(tx, input.data.toId);
      if (!to || !to.active) throw badRequest('kudosInvalid');
      if (to.id === me?.id) throw badRequest('kudosSelf');
      const toName = (await getPerson(tx, to.id))?.name ?? '';
      const id = await addKudos(tx, {
        toId: to.id,
        toName,
        badge: input.data.badge,
        text: input.data.text,
        byId: me?.id ?? null,
        byName: membership.userName,
      });
      await notify(
        tx,
        to.id,
        'kudosGiven',
        { name: membership.userName, badge: input.data.badge, text: input.data.text.slice(0, 90) },
        '/quality/recognition',
      );
      return getKudos(tx, id);
    });
  }

  @Delete(':id')
  @Allow('recognition.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('kudosNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const k = await getKudos(tx, target.data);
      if (!k) throw notFound('kudosNotFound');
      const me = await membershipOfUser(tx, membership.userId);
      if (membership.role !== 'admin' && k.byId !== me?.id) throw forbidden('kudosNotYours');
      await deleteKudos(tx, k.id);
    });
  }
}
