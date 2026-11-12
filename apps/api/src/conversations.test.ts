// Quality › Conversations and Admin › Fields: who adds and sees conversations, fields like Zendesk's (add, rename,
// reorder, hide, delete safely), values checked against them, customers, the transcript days and their deletion,
// today's 540 demo transcripts, and the company wall.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createDb,
  type Db,
  deleteOldTranscripts,
  DEMO_COMPANY,
  type LocalPostgres,
  runMigrations,
  schema,
  SECOND_COMPANY,
  seedDemo,
  seedDemoConversations,
  seedDemoOutcomeGuides,
  seedDemoReviews,
  startLocalPostgres,
} from '@qsmart/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { TokenVerifier } from './auth/token-verifier.js';

const verifier: TokenVerifier = {
  async verify(token) {
    if (!['admin', 'reviewer', 'lead', 'trainer', 'agent'].includes(token)) throw new Error('invalid token');
    return { uid: `demo-${token}`, email: `${token}@demo.test`, emailVerified: true };
  },
};

let server: LocalPostgres;
let owner: Db;
let db: Db;
let app: NestFastifyApplication;
const company: Record<string, string> = {};
let agentId = '';

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
  const people = (await call('GET', '/people', 'admin')).json<{ membershipId: string; email: string }[]>();
  agentId = people.find((p) => p.email === 'agent@demo.test')?.membershipId ?? '';
}, 180_000);

afterAll(async () => {
  await app?.close();
  await owner?.$client.end();
  await db?.$client.end();
  await server?.stop();
});

const call = (
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  at = DEMO_COMPANY,
) =>
  app.inject({
    method,
    url: `/api${url}`,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });
interface Field {
  key: string;
  builtIn: boolean;
  labels: Record<string, string>;
  type: string;
  options: { id: string }[];
  required: boolean;
  hidden: boolean;
}
interface Conv {
  id: string;
  agentName: string;
  teamName: string;
  values: Record<string, unknown>;
  transcript: string | null;
  hasTranscript: boolean;
  customer: { id: string; externalId: string; values: Record<string, unknown> } | null;
  customerId: string | null;
  reviewIds: string[];
}
const fieldsNow = async () =>
  (await call('GET', '/fields', 'admin')).json<{ customer: Field[]; conversation: Field[] }>();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const conversation = (over: object = {}) => ({
  channel: 'chat',
  startedAt: daysAgo(1),
  agentId,
  transcript: 'Customer: Hello, my order did not arrive.\nAgent: I am sorry, let me check it for you.',
  values: { direction: 'in', outcome: 'resolved', language: 'en' },
  ...over,
});

let productField = '';
let noteField = '';

describe('Admin › Fields', () => {
  it("starts with Q-smart's universal fields, and only admins change them", async () => {
    const list = await fieldsNow();
    expect(list.conversation.map((f) => f.key)).toContain('outcome');
    expect(list.customer.map((f) => f.key)).toContain('externalId');
    for (const who of ['reviewer', 'lead', 'trainer', 'agent'])
      expect(
        (await call('POST', '/fields/conversation', who, { labels: { en: 'X' }, type: 'text' })).statusCode,
        who,
      ).toBe(403);
    expect((await call('GET', '/fields', 'agent')).statusCode).toBe(200);
  });

  it("adds the company's own fields, with Zendesk's kinds, and refuses an incomplete one", async () => {
    const product = await call('POST', '/fields/conversation', 'admin', {
      labels: { en: 'Product', bg: 'Продукт' },
      type: 'dropdown',
      options: [
        { id: 'basic', labels: { en: 'Basic plan' } },
        { id: 'plus', labels: { en: 'Plus plan' } },
      ],
      required: true,
      ai: true,
    });
    expect(product.statusCode).toBe(201);
    productField = product.json<Field>().key;
    expect(product.json()).toMatchObject({ builtIn: false, type: 'dropdown', required: true });
    noteField = (
      await call('POST', '/fields/customer', 'admin', { labels: { fr: 'Remarque' }, type: 'longText' })
    ).json<Field>().key;
    for (const bad of [
      { labels: { en: 'No options' }, type: 'dropdown' },
      { labels: {}, type: 'text' },
      { labels: { en: 'Odd' }, type: 'colour' },
      { labels: { en: 'Text with options' }, type: 'text', options: [{ id: 'a', labels: { en: 'A' } }] },
    ])
      expect((await call('POST', '/fields/conversation', 'admin', bad)).json(), JSON.stringify(bad)).toMatchObject({
        code: 'fieldInvalid',
      });
  });

  it('renames a built-in field and changes its options, reorders, and never hides the fixed ones', async () => {
    const renamed = await call('PUT', '/fields/conversation/outcome', 'admin', {
      labels: { en: 'Call result' },
      options: [
        { id: 'resolved', labels: { en: 'Solved' } },
        { id: 'sale', labels: { en: 'Sale made' } },
      ],
    });
    expect(renamed.json()).toMatchObject({
      builtIn: true,
      labels: { en: 'Call result' },
      options: [{ id: 'resolved' }, { id: 'sale' }],
    });
    expect((await call('PUT', '/fields/conversation/channel', 'admin', { hidden: true })).json()).toMatchObject({
      hidden: false,
      required: true,
    });
    const keys = (await fieldsNow()).conversation.map((f) => f.key);
    const order = [productField, ...keys.filter((k) => k !== productField)];
    const after = (await call('PUT', '/fields/conversation', 'admin', { keys: order })).json<Field[]>();
    expect(after[0]?.key).toBe(productField);
    expect((await call('PUT', '/fields/conversation', 'admin', { keys: order.slice(1) })).statusCode).toBe(400);
  });
});

let first: Conv;

describe('Quality › Conversations', () => {
  it('lets admins and reviewers add a conversation with its transcript, fields and customer', async () => {
    for (const who of ['lead', 'trainer', 'agent'])
      expect((await call('POST', '/conversations', who, conversation())).statusCode, who).toBe(403);
    const made = await call('POST', '/conversations', 'reviewer', {
      ...conversation({ link: 'https://crm.example.com/c/1' }),
      values: { direction: 'in', outcome: 'sale', [productField]: 'plus' },
      customer: {
        values: { name: 'Maya Example', externalId: 'C-1001', country: 'Bulgaria', [noteField]: 'Prefers e-mail' },
      },
    });
    expect(made.statusCode).toBe(201);
    first = made.json<Conv>();
    expect(first).toMatchObject({
      agentName: 'Alex Agent',
      hasTranscript: true,
      values: { outcome: 'sale', [productField]: 'plus' },
      customer: { externalId: 'C-1001', values: { name: 'Maya Example', [noteField]: 'Prefers e-mail' } },
    });
    expect(first.transcript).toContain('my order did not arrive');
  });

  it('checks every value against the fields, and says which ones are wrong', async () => {
    const bad = await call('POST', '/conversations', 'admin', {
      ...conversation(),
      values: { outcome: 'maybe', duration: 'long', unknown: 1 },
      customer: { values: { since: 'yesterday' } },
    });
    expect(bad.statusCode).toBe(400);
    const body = bad.json<{ code: string; fields: string[] }>();
    expect(body.code).toBe('fieldValues');
    // the product is required; the outcome isn't an option; the duration isn't a number; "since" isn't a date
    expect(body.fields.sort()).toEqual(['customer.since', 'duration', 'outcome', productField, 'unknown'].sort());
    for (const wrong of [
      { ...conversation(), channel: 'fax' },
      { ...conversation(), startedAt: 'soon' },
      { ...conversation(), link: 'javascript:alert(1)' },
      { ...conversation(), transcript: 'x'.repeat(100_001) },
      { ...conversation(), agentId: '00000000-0000-4000-8000-000000000000' },
    ])
      expect((await call('POST', '/conversations', 'admin', wrong)).statusCode).toBe(400);
  });

  it('finds the same customer again by their ID, and keeps one customer for both conversations', async () => {
    const second = (
      await call('POST', '/conversations', 'admin', {
        ...conversation({ channel: 'call', transcript: '' }),
        values: { outcome: 'resolved', [productField]: 'basic' },
        customer: { values: { externalId: 'C-1001', name: 'Maya Example', segment: 'Gold' } },
      })
    ).json<Conv>();
    expect(second.customerId).toBe(first.customerId);
    expect(second.hasTranscript).toBe(false);
    expect(second.customer?.values).toMatchObject({ segment: 'Gold' });
  });

  it('shows agents their own conversations, staff those of their workspaces', async () => {
    const mine = (await call('GET', '/conversations', 'agent')).json<Conv[]>();
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((c) => c.agentName === 'Alex Agent')).toBe(true);
    expect((await call('GET', `/conversations/${first.id}`, 'agent')).json<Conv>().transcript).toContain('order');
    for (const who of ['lead', 'trainer', 'reviewer'])
      expect((await call('GET', '/conversations', who)).json<Conv[]>().length, who).toBeGreaterThanOrEqual(2);
    const filtered = (await call('GET', '/conversations?channel=call', 'admin')).json<Conv[]>();
    expect(filtered.every((c) => (c as unknown as { channel: string }).channel === 'call')).toBe(true);
    expect((await call('GET', '/conversations?from=tomorrow', 'admin')).statusCode).toBe(400);
  });

  it('changes a conversation and its transcript; deleting it keeps the reviews', async () => {
    const changed = (
      await call('PUT', `/conversations/${first.id}`, 'reviewer', {
        ...conversation({ transcript: 'Agent: Hello again.' }),
        values: { outcome: 'resolved', [productField]: 'basic' },
        customer: { id: first.customer?.id, values: { name: 'Maya E.', externalId: 'C-1001' } },
      })
    ).json<Conv>();
    expect(changed.transcript).toBe('Agent: Hello again.');
    expect(changed.customer?.values).toMatchObject({ name: 'Maya E.' });
    expect((await call('DELETE', `/conversations/${first.id}`, 'agent')).statusCode).toBe(403);
    const log = (await call('GET', '/activity', 'admin')).json<{ action: string }[]>();
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(['conversationAdded', 'conversationChanged', 'fieldSaved']),
    );
  });

  it('hides a field before deleting it for good, with its values; built-in fields are never deleted', async () => {
    expect((await call('DELETE', `/fields/conversation/${productField}`, 'admin')).json()).toMatchObject({
      code: 'fieldNotHidden',
    });
    expect((await call('DELETE', '/fields/conversation/outcome', 'admin')).json()).toMatchObject({
      code: 'fieldBuiltIn',
    });
    await call('PUT', `/fields/conversation/${productField}`, 'admin', { hidden: true });
    // hidden: no longer asked for, and its values are kept
    const kept = (
      await call('PUT', `/conversations/${first.id}`, 'admin', { ...conversation(), values: { outcome: 'resolved' } })
    ).json<Conv>();
    expect(kept.values[productField]).toBe('basic');
    expect((await call('DELETE', `/fields/conversation/${productField}`, 'admin')).statusCode).toBe(204);
    const gone = (await call('GET', `/conversations/${first.id}`, 'admin')).json<Conv>();
    expect(gone.values[productField]).toBeUndefined();
    expect((await fieldsNow()).conversation.some((f) => f.key === productField)).toBe(false);
  });
});

describe('How long transcripts are kept', () => {
  it('lets admins choose the days from the list', async () => {
    expect((await call('GET', '/transcript-days', 'admin')).json()).toMatchObject({ days: 90 });
    expect((await call('PUT', '/transcript-days', 'reviewer', { days: 30 })).statusCode).toBe(403);
    expect((await call('PUT', '/transcript-days', 'admin', { days: 45 })).json()).toMatchObject({
      code: 'transcriptDaysInvalid',
    });
    expect((await call('PUT', '/transcript-days', 'admin', { days: 7 })).json()).toMatchObject({ days: 7 });
  });

  it('deletes only the text of older conversations; the conversation and its fields stay', async () => {
    const old = (
      await call('POST', '/conversations', 'admin', {
        ...conversation({ startedAt: daysAgo(10), transcript: 'Customer: An old chat.' }),
      })
    ).json<Conv>();
    const fresh = (await call('POST', '/conversations', 'admin', conversation({ startedAt: daysAgo(2) }))).json<Conv>();
    // the second company keeps transcripts for ever: nothing of it is deleted
    await call('PUT', '/transcript-days', 'admin', { days: 0 }, SECOND_COMPANY);
    expect(await deleteOldTranscripts(db)).toBeGreaterThanOrEqual(1);
    const after = (await call('GET', `/conversations/${old.id}`, 'admin')).json<Conv>();
    expect(after).toMatchObject({ transcript: null, hasTranscript: false, values: { outcome: 'resolved' } });
    expect((await call('GET', `/conversations/${fresh.id}`, 'admin')).json<Conv>().transcript).toContain('order');
    // the timed job's door, with its key only
    process.env['QSMART_JOB_KEY'] = 'job-test-key';
    expect((await app.inject({ method: 'POST', url: '/api/jobs/transcripts' })).statusCode).toBe(403);
    const job = await app.inject({
      method: 'POST',
      url: '/api/jobs/transcripts',
      headers: { 'x-job-key': 'job-test-key' },
    });
    expect(job.json()).toEqual({ deleted: 0 });
    await call('PUT', '/transcript-days', 'admin', { days: 90 });
  });
});

describe('the company wall', () => {
  it("never shows or uses another company's conversations, fields, agents or reviews", async () => {
    expect((await call('GET', '/conversations', 'admin', undefined, SECOND_COMPANY)).json()).toEqual([]);
    expect((await call('GET', `/conversations/${first.id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('POST', '/conversations', 'admin', conversation(), SECOND_COMPANY)).statusCode).toBe(400);
    const second = await call('GET', '/fields', 'admin', undefined, SECOND_COMPANY);
    expect(second.json<{ conversation: Field[] }>().conversation.every((f) => f.builtIn)).toBe(true);
    const otherReview = '00000000-0000-4000-8000-000000000001';
    expect(
      (await call('POST', '/conversations', 'admin', { ...conversation(), reviewIds: [otherReview] })).statusCode,
    ).toBe(400);
  });
});

describe("today's demo transcripts", () => {
  it('adds the 540 once, each linked to its review, with made-up names only, kept for a year', async () => {
    await seedDemoReviews(owner);
    expect(await seedDemoConversations(owner)).toBe(0); // the demo company already has conversations here
    await owner.delete(schema.conversations).where(eq(schema.conversations.companyId, company[DEMO_COMPANY] ?? ''));
    expect(await seedDemoConversations(owner)).toBe(540);
    expect(await seedDemoConversations(owner)).toBe(0);
    const linked = await owner
      .select({ id: schema.reviews.id })
      .from(schema.reviews)
      .where(eq(schema.reviews.companyId, company[DEMO_COMPANY] ?? ''));
    const withConversation = (await owner.select({ c: schema.reviews.conversationId }).from(schema.reviews)).filter(
      (r) => r.c,
    ).length;
    expect(linked.length).toBe(842);
    expect(withConversation).toBe(540);
    const texts = JSON.stringify(await owner.select({ t: schema.transcripts.text }).from(schema.transcripts));
    for (const real of ['Viktoria', 'Deyan', 'Kamelia', 'Sandra', 'Gabriela']) expect(texts).not.toContain(real);
    // universal wording: no industry's words in the demo (11 November)
    expect(texts).not.toMatch(/bonus|deposit|withdraw|casino|wager/i);
    expect((await call('GET', '/transcript-days', 'admin')).json()).toMatchObject({ days: 365 });
    const list = (await call('GET', '/conversations', 'admin')).json<Conv[]>();
    expect(list.filter((c) => c.reviewIds.length === 1)).toHaveLength(540);
  }, 120_000);
});

describe("the demo company's outcome guide", () => {
  it('is added once, while the demo company never changed its outcomes, and only there', async () => {
    const demo = company[DEMO_COMPANY] ?? '';
    await owner
      .delete(schema.fields)
      .where(
        and(
          eq(schema.fields.companyId, demo),
          eq(schema.fields.object, 'conversation'),
          eq(schema.fields.key, 'outcome'),
        ),
      );
    expect(await seedDemoOutcomeGuides(owner)).toBe(true);
    expect(await seedDemoOutcomeGuides(owner)).toBe(false);
    const rows = await owner.select().from(schema.fields).where(eq(schema.fields.key, 'outcome'));
    expect(rows.map((r) => r.companyId)).toEqual([demo]);
    expect(rows[0]?.options.map((o) => o.id)).toEqual(['resolved', 'followUp', 'notResolved', 'noAnswer']);
    expect(rows[0]?.options.every((o) => (o.guide ?? '').length > 20)).toBe(true);
  });
});
