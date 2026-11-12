// One-to-ones (Phase 4, today's One-to-One), with today's rules:
// - admins, reviewers and team leads write one-to-ones with the agents of their workspaces (admins: everyone); trainers
//   read them; an agent reads and signs their own;
// - a one-to-one follows a form template (sections of 8 kinds; the team's template comes first) and keeps its own copy
//   of the sections, so a template changed later never changes it; it looks at a period (week, month, year or custom);
// - it is a draft, then either sent to the agent (they read and sign it from their own account) or completed with the
//   agent there ("in person": both sign on the team lead's screen); the team lead signs when it is sent or completed;
// - its objectives can become the agent's tasks; the monthly target (per person, per team if needed) is set by an admin.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  addOneToOneTemplate,
  addSession,
  type CoachingSession,
  type Db,
  deleteOneToOneTemplate,
  deleteSession,
  getOneToOneTarget,
  getOneToOneTemplate,
  getSession,
  listOneToOneTemplates,
  listPeople,
  listTeams,
  logActivity,
  type Membership,
  membershipOfUser,
  notify,
  type Person,
  type ReviewScope,
  saveOneToOneTarget,
  type SessionAction,
  type Tx,
  updateOneToOneTemplate,
  updateSession,
  withCompany,
} from '@qsmart/db';
import { type Scope, scopeOf } from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { giveActionsAsTasks, sessionLink } from './coaching.controller.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const idParam = z.uuid();
const SECTION_TYPES = ['text', 'check', 'yesno', 'objectives', 'rating', 'metrics', 'table', 'agree'] as const;
const line = z.string().trim().min(1).max(200);
const section = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,20}$/),
  type: z.enum(SECTION_TYPES),
  title: z.string().trim().min(1).max(80),
  items: z.array(line).max(30).default([]),
  cols: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  units: z.array(z.string().trim().max(20)).max(30).default([]),
});
const sections = z
  .array(section)
  .min(1)
  .max(30)
  .refine((l) => new Set(l.map((x) => x.id)).size === l.length, 'section ids are unique');
const templateInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    teamIds: z.array(z.uuid()).max(30).default([]),
    sections,
  })
  .strict();
const oneToOneInput = z
  .object({
    agentId: z.uuid(),
    heldOn: z.iso.date(),
    title: z.string().trim().min(1).max(150),
    templateId: z.uuid().nullable().default(null),
    period: z.enum(['week', 'month', 'year', 'custom']).default('month'),
    periodFrom: z.iso.date().nullable().default(null),
    periodTo: z.iso.date().nullable().default(null),
    sections,
    answers: z
      .record(z.string().max(20), z.unknown())
      .default({})
      .refine((a) => JSON.stringify(a).length <= 60000, 'answers too long'),
    followUpOn: z.iso.date().nullable().default(null),
    /** draft: saved for later; sent: to the agent to read and sign; signed: completed with the agent there */
    state: z.enum(['draft', 'sent', 'signed']),
    inPerson: z.boolean().default(false),
    /** also give each objective to the agent as a task (with its deadline) */
    makeTasks: z.boolean().default(false),
  })
  .strict()
  .refine((v) => !v.periodFrom || !v.periodTo || v.periodFrom <= v.periodTo);
const targetInput = z
  .object({
    target: z.number().int().min(1).max(10),
    teams: z.record(z.uuid(), z.number().int().min(0).max(10)).default({}),
  })
  .strict();

const inReach = (reach: ReviewScope, p: Pick<Person, 'teamId'>) =>
  'all' in reach || ('teamIds' in reach && !!p.teamId && reach.teamIds.includes(p.teamId));

/** The objectives written in a one-to-one's objectives sections, as the agent's actions (kept from before by text). */
function objectivesOf(input: z.infer<typeof oneToOneInput>, agent: Person, old: SessionAction[]): SessionAction[] {
  return input.sections
    .filter((s) => s.type === 'objectives')
    .flatMap((s) => {
      const list = input.answers[s.id];
      return Array.isArray(list) ? list : [];
    })
    .map((o: unknown) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : {}))
    .map((o) => ({
      text: String(o['text'] ?? '')
        .trim()
        .slice(0, 200),
      dueOn: String(o['dueOn'] ?? ''),
    }))
    .filter((o) => o.text)
    .slice(0, 20)
    .map((o) => {
      const before = old.find((x) => x.text === o.text);
      return {
        text: o.text,
        ownerId: agent.membershipId,
        ownerName: agent.name,
        dueOn: /^\d{4}-\d{2}-\d{2}$/.test(o.dueOn) ? o.dueOn : null,
        done: before?.done ?? false,
        taskId: before?.taskId ?? null,
      };
    });
}

@Controller('one-to-ones')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class OneToOneController {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ---------------------------------------------------------------------------------------------- the target

  /** How many one-to-ones each person should have per month, and per team where it differs. */
  @Get('target')
  @Allow('coaching.read')
  target(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => getOneToOneTarget(tx));
  }

  @Put('target')
  @Allow('settings.write')
  async setTarget(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = targetInput.safeParse(body);
    if (!input.success) throw badRequest('oneToOneTarget');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const teams = new Set((await listTeams(tx)).map((t) => t.id));
      const own = Object.fromEntries(Object.entries(input.data.teams).filter(([id]) => teams.has(id)));
      await saveOneToOneTarget(tx, input.data.target, own);
      await logActivity(tx, actorOf(membership), {
        action: 'oneToOneTargetSaved',
        targetName: '',
        details: { target: String(input.data.target) },
      });
      return getOneToOneTarget(tx);
    });
  }

  // ---------------------------------------------------------------------------------------------- templates

  @Get('templates')
  @Allow('coaching.read')
  templates(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listOneToOneTemplates(tx));
  }

  @Post('templates')
  @Allow('oneToOnes.write')
  async addTemplate(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = templateInput.safeParse(body);
    if (!input.success) throw badRequest('oneToOneTemplateInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
      const id = await addOneToOneTemplate(tx, input.data, { id: me, name: membership.userName });
      await logActivity(tx, actorOf(membership), { action: 'oneToOneTemplateSaved', targetName: input.data.name });
      return getOneToOneTemplate(tx, id);
    });
  }

  @Put('templates/:id')
  @Allow('oneToOnes.write')
  async changeTemplate(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = templateInput.safeParse(body);
    if (!target.success) throw notFound('oneToOneTemplateNotFound');
    if (!input.success) throw badRequest('oneToOneTemplateInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      if (!(await getOneToOneTemplate(tx, target.data))) throw notFound('oneToOneTemplateNotFound');
      await updateOneToOneTemplate(tx, target.data, input.data);
      await logActivity(tx, actorOf(membership), { action: 'oneToOneTemplateSaved', targetName: input.data.name });
      return getOneToOneTemplate(tx, target.data);
    });
  }

  @Delete('templates/:id')
  @Allow('oneToOnes.write')
  @HttpCode(204)
  async removeTemplate(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw notFound('oneToOneTemplateNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const t = await getOneToOneTemplate(tx, target.data);
      if (!t) throw notFound('oneToOneTemplateNotFound');
      await deleteOneToOneTemplate(tx, t.id);
      await logActivity(tx, actorOf(membership), { action: 'oneToOneTemplateDeleted', targetName: t.name });
    });
  }

  // ---------------------------------------------------------------------------------------------- one-to-ones

  @Post()
  @Allow('oneToOnes.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const input = this.parse(body);
    return withCompany(this.db, membership.companyId, async (tx) => this.save(tx, membership, scope, input, null));
  }

  @Put(':id')
  @Allow('oneToOnes.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = this.parse(body);
    return withCompany(this.db, membership.companyId, async (tx) => {
      const old = await this.find(tx, membership, scope, id);
      return this.save(tx, membership, scope, input, old);
    });
  }

  @Delete(':id')
  @Allow('oneToOnes.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    await withCompany(this.db, membership.companyId, async (tx) => {
      const s = await this.find(tx, membership, scope, id);
      await deleteSession(tx, s.id);
      await logActivity(tx, actorOf(membership), {
        action: 'oneToOneDeleted',
        targetName: s.agents.map((a) => a.name).join(', '),
      });
    });
  }

  private parse(body: unknown) {
    const input = oneToOneInput.safeParse(body);
    if (!input.success) throw badRequest('oneToOneInvalid');
    return input.data;
  }

  private async find(tx: Tx, membership: Membership, scope: Scope, id: string): Promise<CoachingSession> {
    const target = idParam.safeParse(id);
    const s = target.success ? await getSession(tx, target.data, await reachOf(tx, membership, scope)) : undefined;
    if (!s) throw notFound('sessionNotFound');
    if (s.kind !== 'o2o') throw forbidden('notAllowed');
    return s;
  }

  private async save(
    tx: Tx,
    membership: Membership,
    scope: Scope,
    input: z.infer<typeof oneToOneInput>,
    old: CoachingSession | null,
  ) {
    const reach = await reachOf(tx, membership, scopeOf(membership.role, 'oneToOnes.write') ?? scope);
    const people = (await listPeople(tx)).filter((p) => p.active);
    const agent = people.find((p) => p.membershipId === input.agentId && p.role === 'agent');
    if (!agent || !inReach(reach, agent)) throw badRequest('sessionAgents');
    if (input.templateId && !(await getOneToOneTemplate(tx, input.templateId)))
      throw notFound('oneToOneTemplateNotFound');
    const me = (await membershipOfUser(tx, membership.userId))?.id ?? null;
    const now = new Date().toISOString();
    // a signed one-to-one stays signed when it is changed
    const state = old?.state === 'signed' ? 'signed' : input.state;
    const signatures = { ...(old?.signatures ?? {}) };
    if (state === 'signed' && !signatures[agent.membershipId]) {
      if (!input.inPerson) throw badRequest('oneToOneSign');
      signatures[agent.membershipId] = { at: now, comment: '', inPerson: true };
    }
    const actions = objectivesOf(input, agent, old?.actions ?? []);
    if (input.makeTasks) await giveActionsAsTasks(tx, membership, me, actions, input.title, people);
    const session = {
      kind: 'o2o' as const,
      heldOn: input.heldOn,
      title: input.title,
      status: state === 'draft' ? ('planned' as const) : ('done' as const),
      agents: [{ id: agent.membershipId, name: agent.name, teamId: agent.teamId, teamName: agent.teamName ?? '' }],
      focus: [],
      topics: [],
      goals: '',
      notes: '',
      followUpOn: input.followUpOn,
      actions,
      signatures,
      templateId: input.templateId,
      period: input.period,
      periodFrom: input.period === 'custom' ? input.periodFrom : null,
      periodTo: input.period === 'custom' ? input.periodTo : null,
      sections: input.sections,
      answers: input.answers,
      state,
      // the team lead signs when it is sent or completed
      leadSignature: old?.leadSignature ?? (state === 'draft' ? null : { at: now, id: me, name: membership.userName }),
      sentAt: old?.sentAt ?? (state === 'sent' ? new Date(now) : null),
    };
    let id = old?.id;
    if (old) await updateSession(tx, old.id, session);
    else id = await addSession(tx, session, { id: me, name: membership.userName });
    if (!id) throw new Error('The one-to-one was not saved.');
    if (state === 'sent' && old?.state !== 'sent' && agent.membershipId !== me)
      await notify(
        tx,
        agent.membershipId,
        'oneToOneToSign',
        { name: membership.userName, title: input.title.slice(0, 80) },
        sessionLink({ id, kind: 'o2o' }),
      );
    await logActivity(tx, actorOf(membership), {
      action: 'oneToOneSaved',
      targetName: agent.name,
      details: { state },
    });
    return getSession(tx, id, { all: true });
  }
}
