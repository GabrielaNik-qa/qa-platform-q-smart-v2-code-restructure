// Phase 6, piece 1: Learning › Knowledge Base. Who writes and who reads, folders open to some teams only (the others
// never receive them), a lesson test (agents never receive the right answers; passing marks the article as read),
// reading, stars, reactions and comments, deleting a folder (keep or delete what is inside), and the company wall.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createDb,
  type Db,
  DEMO_COMPANY,
  type LocalPostgres,
  runMigrations,
  schema,
  SECOND_COMPANY,
  seedDemo,
  startLocalPostgres,
} from '@qsmart/db';
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

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  for (const c of await owner.select().from(schema.companies)) company[c.name] = c.id;
  db = createDb(server.appUrl);
  app = await createApp({ db, verifier });
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

interface Question {
  q: string;
  opts: string[];
  a: number;
  why: string;
}
interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  teams: string[];
}
interface Article {
  id: string;
  title: string;
  folderId: string | null;
  quiz: { pass: number; questions: Question[] } | null;
  reactions: Record<string, string[]>;
  comments: { id: string; name: string; text: string }[];
}
interface Kb {
  folders: Folder[];
  articles: Article[];
  me: { id: string | null; teamId: string | null; staff: boolean };
  reads: Record<string, string>;
  stars: string[];
  attempts: { articleId: string; score: number; passed: boolean }[];
}
const kb = async (who: string, at = DEMO_COMPANY) => (await call('GET', '/kb', who, undefined, at)).json<Kb>();
const folder = async (who: string, name: string, over: object = {}) =>
  (await call('POST', '/kb/folders', who, { name, ...over })).json<{ id: string }>().id;
const article = async (who: string, title: string, over: object = {}) =>
  (await call('POST', '/kb/articles', who, { title, body: '## Hello', ...over })).json<{ id: string }>().id;
const test: { questions: Question[]; pass: number } = {
  pass: 70,
  questions: [
    { q: 'First?', opts: ['yes', 'no'], a: 0, why: 'because' },
    { q: 'Second?', opts: ['a', 'b', 'c'], a: 2, why: '' },
  ],
};

describe('who writes and who reads', () => {
  it('lets staff write folders and articles, and everyone read what is open to them', async () => {
    for (const who of ['admin', 'reviewer', 'lead', 'trainer']) {
      const f = await call('POST', '/kb/folders', who, { name: `By ${who}` });
      expect(f.statusCode, who).toBe(201);
    }
    expect((await call('POST', '/kb/folders', 'agent', { name: 'Nope' })).statusCode).toBe(403);
    expect((await call('POST', '/kb/articles', 'agent', { title: 'Nope' })).statusCode).toBe(403);
    const agent = await kb('agent');
    expect(agent.folders.map((f) => f.name)).toEqual(expect.arrayContaining(['By admin', 'By trainer']));
    expect(agent.me.staff).toBe(false);
    expect((await kb('admin')).me.staff).toBe(true);
  });

  it('checks what is sent', async () => {
    for (const body of [
      {},
      { name: '' },
      { name: 'x'.repeat(61) },
      { name: 'A', colour: 'red' },
      { name: 'A', extra: 1 },
    ])
      expect((await call('POST', '/kb/folders', 'admin', body)).statusCode, JSON.stringify(body)).toBe(400);
    expect((await call('POST', '/kb/folders', 'admin', { name: 'A', parentId: crypto.randomUUID() })).statusCode).toBe(
      400,
    );
    expect((await call('POST', '/kb/articles', 'admin', { title: '' })).statusCode).toBe(400);
    expect(
      (await call('POST', '/kb/articles', 'admin', { title: 'A', folderId: crypto.randomUUID() })).statusCode,
    ).toBe(400);
  });
});

describe('folders open to some teams only', () => {
  it('never reach agents of other teams, nor their sub-folders and articles', async () => {
    const mine = (await kb('agent')).me.teamId;
    expect(mine).toBeTruthy();
    const teams = (await call('GET', '/teams', 'admin')).json<{ id: string; isAdministration: boolean }[]>();
    const other = teams.find((t) => t.id !== mine && !t.isAdministration)?.id;
    expect(other).toBeTruthy();
    const closed = await folder('admin', 'Closed to my team', { teams: [other] });
    const inside = await folder('admin', 'Inside the closed one', { parentId: closed });
    const hidden = await article('admin', 'Hidden article', { folderId: inside });
    const open = await folder('admin', 'Open to my team', { teams: [mine] });
    const visible = await article('admin', 'Visible article', { folderId: open });
    const agent = await kb('agent');
    expect(agent.folders.map((f) => f.id)).toEqual(expect.arrayContaining([open]));
    expect(agent.folders.map((f) => f.id)).not.toContain(closed);
    expect(agent.folders.map((f) => f.id)).not.toContain(inside);
    expect(agent.articles.map((a) => a.id)).toContain(visible);
    expect(agent.articles.map((a) => a.id)).not.toContain(hidden);
    // and they cannot reach it by its address either
    expect((await call('POST', '/kb/read', 'agent', { id: hidden })).statusCode).toBe(404);
    expect((await call('POST', `/kb/articles/${hidden}/comments`, 'agent', { t: 'hi' })).statusCode).toBe(404);
    expect((await call('POST', '/kb/star', 'agent', { id: hidden })).statusCode).toBe(404);
    // staff see everything
    expect((await kb('trainer')).articles.map((a) => a.id)).toContain(hidden);
  });
});

describe('folders', () => {
  it('nest, refuse a loop, and are deleted keeping or deleting what is inside', async () => {
    const top = await folder('admin', 'Top');
    const mid = await folder('admin', 'Mid', { parentId: top });
    const low = await folder('admin', 'Low', { parentId: mid });
    const a1 = await article('admin', 'In mid', { folderId: mid });
    const a2 = await article('admin', 'In low', { folderId: low });
    // a folder cannot go inside itself or below itself
    const loop = await call('PUT', `/kb/folders/${top}`, 'admin', { name: 'Top', parentId: low });
    expect(loop.statusCode).toBe(400);
    expect((await call('PUT', `/kb/folders/${mid}`, 'admin', { name: 'Mid', parentId: mid })).statusCode).toBe(400);
    expect((await call('PUT', `/kb/folders/${mid}`, 'admin', { name: 'Middle', parentId: top })).statusCode).toBe(200);
    // keep: the content moves up one level
    expect((await call('DELETE', `/kb/folders/${mid}`, 'admin')).statusCode).toBe(204);
    const after = await kb('admin');
    expect(after.folders.find((f) => f.id === low)?.parentId).toBe(top);
    expect(after.articles.find((a) => a.id === a1)?.folderId).toBe(top);
    // cascade: everything inside goes
    expect((await call('DELETE', `/kb/folders/${top}?mode=cascade`, 'admin')).statusCode).toBe(204);
    const gone = await kb('admin');
    expect(gone.folders.map((f) => f.id)).not.toContain(low);
    expect(gone.articles.map((a) => a.id)).not.toEqual(expect.arrayContaining([a1]));
    expect(gone.articles.map((a) => a.id)).not.toContain(a2);
    expect((await call('DELETE', `/kb/folders/${top}`, 'admin')).statusCode).toBe(404);
    expect((await call('DELETE', `/kb/folders/${low}`, 'agent')).statusCode).toBe(403);
  });
});

describe('lesson tests', () => {
  it('hide the right answers from agents, grade the answers, and mark the article read when passed', async () => {
    const id = await article('admin', 'With a test', { quiz: test });
    const asAdmin = (await kb('admin')).articles.find((a) => a.id === id);
    expect(asAdmin?.quiz?.questions[0]?.a).toBe(0);
    const asAgent = (await kb('agent')).articles.find((a) => a.id === id);
    expect(asAgent?.quiz?.questions.map((q) => q.a)).toEqual([-1, -1]);
    expect(asAgent?.quiz?.questions.map((q) => q.why)).toEqual(['', '']);
    // a failed try is kept, but does not mark the article as read
    const bad = await call('POST', `/kb/articles/${id}/test`, 'agent', { answers: [1, 0] });
    expect(bad.json()).toMatchObject({ score: 0, passed: false, pass: 70 });
    expect((await kb('agent')).reads[id]).toBeUndefined();
    // the right answers pass, and the article counts as read
    const good = await call('POST', `/kb/articles/${id}/test`, 'agent', { answers: [0, 2] });
    expect(good.json()).toMatchObject({ score: 100, passed: true });
    expect(good.json<{ results: { a: number; why: string }[] }>().results[0]).toMatchObject({ a: 0, why: 'because' });
    const after = await kb('agent');
    expect(after.reads[id]).toBeTruthy();
    expect(after.attempts.filter((t) => t.articleId === id).map((t) => t.score)).toEqual([0, 100]);
    expect((await call('POST', `/kb/articles/${id}/test`, 'agent', { answers: ['x'] })).statusCode).toBe(400);
  });

  it('drop unusable questions, and an article without usable questions has no test', async () => {
    const id = await article('admin', 'Half a test', {
      quiz: { pass: 80, questions: [{ q: 'Only one option?', opts: ['x'], a: 0, why: '' }] },
    });
    expect((await kb('admin')).articles.find((a) => a.id === id)?.quiz).toBeNull();
    expect((await call('POST', `/kb/articles/${id}/test`, 'agent', { answers: [0] })).statusCode).toBe(404);
  });
});

describe('reading, stars, reactions and comments', () => {
  it("mark an article, and a whole folder, as read and unread, only for the person's own", async () => {
    const f = await folder('admin', 'Reading');
    const a = await article('admin', 'Read me', { folderId: f });
    const b = await article('admin', 'Read me too', { folderId: f });
    expect((await call('POST', '/kb/read', 'agent', { id: a })).statusCode).toBe(200);
    expect((await kb('agent')).reads[a]).toBeTruthy();
    expect((await kb('lead')).reads[a]).toBeUndefined();
    await call('POST', '/kb/read', 'agent', { id: a, read: false });
    expect((await kb('agent')).reads[a]).toBeUndefined();
    const all = await call('POST', '/kb/read-folder', 'agent', { id: f });
    expect(all.json()).toEqual({ count: 2 });
    const state = await kb('agent');
    expect([a, b].every((x) => state.reads[x])).toBe(true);
    await call('POST', '/kb/read-folder', 'agent', { id: f, read: false });
    expect(Object.keys((await kb('agent')).reads)).not.toContain(b);
  });

  it('star, react and comment, and tell the author about a comment', async () => {
    const id = await article('trainer', 'Discuss me');
    expect((await call('POST', '/kb/star', 'agent', { id })).json()).toMatchObject({ stars: [id] });
    expect((await call('POST', '/kb/star', 'agent', { id, on: false })).json()).toEqual({ stars: [] });
    const react = await call('POST', `/kb/articles/${id}/react`, 'agent', { e: '👍' });
    expect(react.json<{ reactions: Record<string, string[]> }>().reactions['👍']).toHaveLength(1);
    expect((await call('POST', `/kb/articles/${id}/react`, 'agent', { e: '👍' })).json()).toEqual({ reactions: {} });
    expect((await call('POST', `/kb/articles/${id}/react`, 'agent', { e: '🔥' })).statusCode).toBe(400);
    const posted = await call('POST', `/kb/articles/${id}/comments`, 'agent', { t: 'Thank you' });
    const comments = posted.json<{ comments: { id: string; text: string }[] }>().comments;
    expect(comments.map((c) => c.text)).toEqual(['Thank you']);
    expect((await call('POST', `/kb/articles/${id}/comments`, 'agent', { t: '   ' })).statusCode).toBe(400);
    const bell = (await call('GET', '/notifications', 'trainer')).json<
      { kind: string }[] | { items: { kind: string }[] }
    >();
    const kinds = (Array.isArray(bell) ? bell : bell.items).map((n) => n.kind);
    expect(kinds).toContain('kbComment');
    // only its writer (or staff) removes a comment
    const commentId = comments[0]?.id ?? '';
    expect((await call('DELETE', `/kb/articles/${id}/comments/${commentId}`, 'lead')).statusCode).toBe(200);
    const mine = await call('POST', `/kb/articles/${id}/comments`, 'agent', { t: 'Again' });
    const again = mine.json<{ comments: { id: string }[] }>().comments[0]?.id ?? '';
    expect((await call('DELETE', `/kb/articles/${id}/comments/${again}`, 'agent')).statusCode).toBe(200);
  });

  it('let only staff change or delete articles', async () => {
    const id = await article('admin', 'Mine');
    expect((await call('PUT', `/kb/articles/${id}`, 'agent', { title: 'x' })).statusCode).toBe(403);
    expect((await call('DELETE', `/kb/articles/${id}`, 'agent')).statusCode).toBe(403);
    expect((await call('PUT', `/kb/articles/${id}`, 'reviewer', { title: 'Renamed', body: 'new' })).statusCode).toBe(
      200,
    );
    const changed = (await kb('admin')).articles.find((a) => a.id === id);
    expect(changed?.title).toBe('Renamed');
    expect((await call('DELETE', `/kb/articles/${id}`, 'lead')).statusCode).toBe(204);
    expect((await call('DELETE', `/kb/articles/${id}`, 'lead')).statusCode).toBe(404);
  });
});

describe('the company wall', () => {
  it("keeps one company's folders, articles and reading out of another's", async () => {
    const own = await article('admin', 'Only in the demo');
    const ownFolder = await folder('admin', 'Only in the demo folder');
    const other = await kb('admin', SECOND_COMPANY);
    expect(other.articles.map((a) => a.id)).not.toContain(own);
    expect(other.folders.map((f) => f.id)).not.toContain(ownFolder);
    // by address too: it is not found there, and cannot be changed or deleted
    expect((await call('PUT', `/kb/articles/${own}`, 'admin', { title: 'x' }, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('DELETE', `/kb/articles/${own}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('POST', '/kb/read', 'admin', { id: own }, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await call('DELETE', `/kb/folders/${ownFolder}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(404);
    expect((await kb('admin')).articles.map((a) => a.id)).toContain(own);
  });
});
