// Quality › Conversations and Admin › Fields (Phase 3b, step 3; V2_PLAN §7 "Universal"):
// - Fields, like Zendesk's: Q-smart's universal fields for customers and conversations, which a company renames,
//   reorders and hides, and its own fields (admins). A field is hidden before it can be deleted, and built-in fields
//   are never deleted. Every value is checked against the company's field list.
// - Conversations: calls, chats, e-mails and others, with their transcript (only the text, deleted after the company's
//   days), the customer and the fields. The same reach as reviews: agents their own, staff their workspaces, admins
//   all; admins and reviewers add, change and delete them.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  addConversation,
  type Db,
  deleteConversation,
  deleteStoredField,
  findCustomer,
  getConversation,
  getCustomer,
  getReview,
  linkReviews,
  listConversations,
  listStoredFields,
  logActivity,
  type Membership,
  membershipOfUser,
  saveCustomer,
  saveStoredFields,
  setTranscript,
  setTranscriptDays,
  TRANSCRIPT_DAYS,
  transcriptDays,
  type Tx,
  updateConversation,
  withCompany,
} from '@qsmart/db';
import {
  checkValues,
  FIELD_OBJECTS,
  FIELD_TYPES,
  type FieldDef,
  fieldsOf,
  builtInOptionIds,
  isBuiltInField,
  isFixedField,
  labelsSchema,
  optionSchema,
  type Scope,
  type StoredField,
} from '@qsmart/shared';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { agentFor, reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const objectParam = z.enum(FIELD_OBJECTS);
const options = z
  .array(optionSchema)
  .max(200)
  .refine((o) => new Set(o.map((x) => x.id)).size === o.length, 'option ids are unique');
const newField = z
  .object({
    labels: labelsSchema,
    type: z.enum(FIELD_TYPES),
    options: options.default([]),
    required: z.boolean().default(false),
    ai: z.boolean().default(false),
  })
  .strict();
/** On a change, Q-smart's own options may come back without a name of the company's (checked in the route). */
const changedOptions = z
  .array(optionSchema.extend({ labels: z.union([labelsSchema, z.object({}).strict()]) }))
  .max(200)
  .refine((o) => new Set(o.map((x) => x.id)).size === o.length, 'option ids are unique');
const fieldChange = z
  .object({
    labels: z.union([labelsSchema, z.object({}).strict()]),
    options: changedOptions,
    required: z.boolean(),
    ai: z.boolean(),
    hidden: z.boolean(),
  })
  .partial()
  .strict();
const needsOptions = (type: string) => type === 'dropdown' || type === 'multi';
/** The conversation's fields kept in their own columns (the rest are checked as values). */
const COLUMNS = new Set(['channel', 'startedAt', 'agent', 'team']);

async function fieldList(tx: Tx): Promise<StoredField[]> {
  return listStoredFields(tx);
}
const asStored = ({ builtIn: _b, ...f }: FieldDef): StoredField => f;

@Controller('fields')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class FieldsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The company's fields for customers and conversations, in its order (hidden ones too, marked). */
  @Get()
  @Allow('conversations.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const stored = await fieldList(tx);
      return { customer: fieldsOf('customer', stored), conversation: fieldsOf('conversation', stored) };
    });
  }

  /** A new field of the company's own. */
  @Post(':object')
  @Allow('fields.manage')
  async add(@CurrentMembership() membership: Membership, @Param('object') object: string, @Body() body: unknown) {
    const kind = objectParam.safeParse(object);
    const input = newField.safeParse(body);
    if (!kind.success || !input.success) throw badRequest('fieldInvalid');
    if (needsOptions(input.data.type) !== input.data.options.length > 0) throw badRequest('fieldInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const current = fieldsOf(kind.data, await fieldList(tx));
      if (current.filter((f) => !f.builtIn).length >= 100) throw badRequest('fieldInvalid');
      const field: StoredField = {
        object: kind.data,
        key: `f${randomBytes(5).toString('hex')}`,
        ...input.data,
        hidden: false,
        position: Math.max(0, ...current.map((f) => f.position)) + 10,
      };
      await saveStoredFields(tx, [field]);
      await logActivity(tx, actorOf(membership), {
        action: 'fieldSaved',
        targetName: Object.values(field.labels)[0] ?? '',
      });
      return fieldsOf(kind.data, await fieldList(tx)).find((f) => f.key === field.key);
    });
  }

  /** Rename a field, change its options, required or "the AI may read it", hide it or show it again. */
  @Put(':object/:key')
  @Allow('fields.manage')
  async change(
    @CurrentMembership() membership: Membership,
    @Param('object') object: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    const kind = objectParam.safeParse(object);
    const input = fieldChange.safeParse(body);
    if (!kind.success || !input.success) throw badRequest('fieldInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const current = fieldsOf(kind.data, await fieldList(tx));
      const field = current.find((f) => f.key === key);
      if (!field) throw notFound('fieldNotFound');
      const fixed = isFixedField(kind.data, key);
      const changed: FieldDef = {
        ...field,
        ...input.data,
        required: fixed ? true : (input.data.required ?? field.required),
        hidden: fixed ? false : (input.data.hidden ?? field.hidden),
        // the channel's options are Q-smart's own (the reviews use the same four)
        options: key === 'channel' && field.builtIn ? field.options : (input.data.options ?? field.options),
      };
      if (needsOptions(changed.type) && !changed.options.length) throw badRequest('fieldInvalid');
      // an option without a name of the company's must be one of Q-smart's own (named by the pages)
      const ours = field.builtIn ? builtInOptionIds(kind.data, key) : [];
      if (changed.options.some((o) => !Object.values(o.labels).some(Boolean) && !ours.includes(o.id)))
        throw badRequest('fieldInvalid');
      if (!field.builtIn && !Object.values(changed.labels).some(Boolean)) throw badRequest('fieldInvalid');
      await saveStoredFields(tx, [asStored(changed)]);
      await logActivity(tx, actorOf(membership), {
        action: 'fieldSaved',
        targetName: Object.values(changed.labels)[0] ?? key,
      });
      return fieldsOf(kind.data, await fieldList(tx)).find((f) => f.key === key);
    });
  }

  /** A new order: every field's key, top first. */
  @Put(':object')
  @Allow('fields.manage')
  async order(@CurrentMembership() membership: Membership, @Param('object') object: string, @Body() body: unknown) {
    const kind = objectParam.safeParse(object);
    const input = z
      .object({ keys: z.array(z.string()).max(200) })
      .strict()
      .safeParse(body);
    if (!kind.success || !input.success) throw badRequest('fieldInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const current = fieldsOf(kind.data, await fieldList(tx));
      const keys = input.data.keys;
      if (keys.length !== current.length || current.some((f) => !keys.includes(f.key)))
        throw badRequest('fieldInvalid');
      await saveStoredFields(
        tx,
        current.map((f) => asStored({ ...f, position: keys.indexOf(f.key) * 10 })),
      );
      return fieldsOf(kind.data, await fieldList(tx));
    });
  }

  /** Deletes one of the company's own fields for good, with its values (it must be hidden first). */
  @Delete(':object/:key')
  @Allow('fields.manage')
  @HttpCode(204)
  async remove(
    @CurrentMembership() membership: Membership,
    @Param('object') object: string,
    @Param('key') key: string,
  ) {
    const kind = objectParam.safeParse(object);
    if (!kind.success) throw notFound('fieldNotFound');
    if (isBuiltInField(kind.data, key)) throw badRequest('fieldBuiltIn');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const field = fieldsOf(kind.data, await fieldList(tx)).find((f) => f.key === key);
      if (!field) throw notFound('fieldNotFound');
      if (!field.hidden) throw badRequest('fieldNotHidden');
      await deleteStoredField(tx, kind.data, key);
      await logActivity(tx, actorOf(membership), {
        action: 'fieldDeleted',
        targetName: Object.values(field.labels)[0] ?? key,
      });
    });
  }
}

// ---------------------------------------------------------------------------------------------- conversations

const values = z.record(z.string().max(40), z.unknown());
const conversationInput = z
  .object({
    channel: z.enum(['call', 'chat', 'email', 'other']),
    channelName: z.string().trim().max(60).default(''),
    startedAt: z
      .string()
      .max(40)
      .refine((s) => !Number.isNaN(Date.parse(s))),
    agentId: z.uuid(),
    link: z
      .string()
      .trim()
      .max(1000)
      .regex(/^(https?:\/\/\S+)?$/)
      .default(''),
    transcript: z.string().max(100_000).default(''),
    values: values.default({}),
    customer: z
      .object({ id: z.uuid().optional(), values: values.default({}) })
      .strict()
      .nullable()
      .default(null),
    reviewIds: z.array(z.uuid()).max(20).default([]),
  })
  .strict();
const filterInput = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  agent: z.uuid().optional(),
  channel: z.enum(['call', 'chat', 'email', 'other']).optional(),
});

@Controller('conversations')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class ConversationsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('conversations.read')
  list(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Query() query: unknown) {
    const filter = filterInput.safeParse(query);
    if (!filter.success) throw badRequest('conversationInvalid');
    const { agent, ...rest } = filter.data;
    return withCompany(this.db, membership.companyId, async (tx) =>
      listConversations(tx, await reachOf(tx, membership, scope), { ...rest, ...(agent ? { agentId: agent } : {}) }),
    );
  }

  @Get(':id')
  @Allow('conversations.read')
  async one(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound('conversationNotFound');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const found = await getConversation(tx, id, await reachOf(tx, membership, scope));
      if (!found) throw notFound('conversationNotFound');
      return found;
    });
  }

  @Post()
  @Allow('conversations.write')
  async add(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Body() body: unknown) {
    const input = conversationInput.safeParse(body);
    if (!input.success) throw badRequest('conversationInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const ready = await this.prepare(tx, membership, scope, input.data, {});
      const me = await membershipOfUser(tx, membership.userId);
      const id = await addConversation(
        tx,
        { ...ready.row, byId: me?.id ?? null, byName: membership.userName },
        input.data.transcript.trim(),
      );
      await linkReviews(tx, id, ready.reviewIds);
      await logActivity(tx, actorOf(membership), { action: 'conversationAdded', targetName: ready.row.agentName });
      return getConversation(tx, id, { all: true });
    });
  }

  @Put(':id')
  @Allow('conversations.write')
  async change(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = conversationInput.safeParse(body);
    if (!input.success || !z.uuid().safeParse(id).success) throw badRequest('conversationInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const before = await getConversation(tx, id, await reachOf(tx, membership, scope));
      if (!before) throw notFound('conversationNotFound');
      const ready = await this.prepare(tx, membership, scope, input.data, before.values);
      await updateConversation(tx, id, ready.row);
      await setTranscript(tx, id, input.data.transcript.trim());
      await linkReviews(tx, id, ready.reviewIds);
      await logActivity(tx, actorOf(membership), { action: 'conversationChanged', targetName: ready.row.agentName });
      return getConversation(tx, id, { all: true });
    });
  }

  @Delete(':id')
  @Allow('conversations.write')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Param('id') id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound('conversationNotFound');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const found = await getConversation(tx, id, await reachOf(tx, membership, scope));
      if (!found) throw notFound('conversationNotFound');
      await deleteConversation(tx, id);
      await logActivity(tx, actorOf(membership), { action: 'conversationDeleted', targetName: found.agentName });
    });
  }

  /** Checks a conversation against the company's fields, the agent the person can reach, the customer and reviews. */
  private async prepare(
    tx: Tx,
    membership: Membership,
    scope: Scope,
    input: z.infer<typeof conversationInput>,
    keptValues: Record<string, unknown>,
  ) {
    const reach = await reachOf(tx, membership, scope);
    const agent = await agentFor(tx, reach, input.agentId);
    const stored = await fieldList(tx);
    const convDefs = fieldsOf('conversation', stored).filter((f) => !COLUMNS.has(f.key));
    const checked = checkValues(convDefs, input.values, keptValues);
    const customerDefs = fieldsOf('customer', stored);
    let customerId: string | null = null;
    if (input.customer) {
      const existing = input.customer.id
        ? await getCustomer(tx, input.customer.id)
        : await findCustomer(tx, String(input.customer.values['externalId'] ?? '').trim());
      if (input.customer.id && !existing) throw badRequest('fieldValues');
      const customer = checkValues(customerDefs, input.customer.values, existing?.values ?? {});
      if (customer.problems.length || checked.problems.length)
        throw badRequest('fieldValues', [...checked.problems, ...customer.problems.map((k) => `customer.${k}`)]);
      if (Object.keys(customer.values).length || existing)
        customerId = await saveCustomer(tx, {
          ...(existing ? { id: existing.id } : {}),
          externalId: String(customer.values['externalId'] ?? ''),
          values: customer.values,
        });
    } else if (checked.problems.length) throw badRequest('fieldValues', checked.problems);
    for (const reviewId of input.reviewIds)
      if (!(await getReview(tx, reviewId, reach))) throw badRequest('conversationInvalid');
    return {
      reviewIds: input.reviewIds,
      row: {
        channel: input.channel,
        channelName: input.channel === 'other' ? input.channelName : '',
        startedAt: new Date(input.startedAt),
        agentId: agent.id,
        agentName: agent.name,
        teamId: agent.teamId,
        teamName: agent.teamName,
        customerId,
        link: input.link,
        values: checked.values,
      },
    };
  }
}

// ---------------------------------------------------------------------------------------------- transcript days

@Controller('transcript-days')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TranscriptDaysController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('conversations.read')
  get(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, async (tx) => ({
      days: await transcriptDays(tx),
      choices: TRANSCRIPT_DAYS,
    }));
  }

  @Put()
  @Allow('settings.write')
  async set(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({ days: z.number().int() })
      .strict()
      .refine((b) => (TRANSCRIPT_DAYS as readonly number[]).includes(b.days))
      .safeParse(body);
    if (!input.success) throw badRequest('transcriptDaysInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      await setTranscriptDays(tx, input.data.days);
      await logActivity(tx, actorOf(membership), {
        action: 'transcriptDaysChanged',
        details: { days: String(input.data.days) },
      });
      return { days: input.data.days, choices: TRANSCRIPT_DAYS };
    });
  }
}
