// Teams, workspaces, skills and languages: today's rules, who sees what, and the company wall around them.
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
import type { TokenVerifier, VerifiedPerson } from './auth/token-verifier.js';

const PEOPLE: Record<string, VerifiedPerson> = Object.fromEntries(
  ['admin', 'reviewer', 'lead', 'trainer', 'agent'].map((role) => [
    role,
    { uid: `demo-${role}`, email: `${role}@demo.test`, emailVerified: true },
  ]),
);
const verifier: TokenVerifier = {
  async verify(token) {
    const person = PEOPLE[token];
    if (!person) throw new Error('invalid token');
    return person;
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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  at = DEMO_COMPANY,
) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });

type Team = {
  id: string;
  name: string;
  isAdministration: boolean;
  leadId: string | null;
  leadName: string | null;
  members: number;
  skillIds: string[];
};
type Workspace = { id: string; name: string; teamIds: string[]; staffIds: string[] };
type Skill = { id: string; kind: string; name: string; people: number; teams: number };
type Person = { membershipId: string; name: string; role: string; skillIds: string[]; workspaceIds: string[] };

const json = <T>(response: { json: () => unknown }) => response.json() as T;
const teams = async (who = 'admin', at = DEMO_COMPANY) =>
  json<Team[]>(await call('GET', '/api/teams', who, undefined, at));
const workspaces = async (who = 'admin', at = DEMO_COMPANY) =>
  json<Workspace[]>(await call('GET', '/api/workspaces', who, undefined, at));
const skills = async () => json<Skill[]>(await call('GET', '/api/skills', 'admin'));
const people = async (who = 'admin') => json<Person[]>(await call('GET', '/api/people', who));
const named = <T extends { name: string }>(list: T[], name: string): T => {
  const row = list.find((x) => x.name === name);
  if (!row) throw new Error(`${name} missing`);
  return row;
};
const names = (list: { name: string }[]) => list.map((x) => x.name);

describe('the demo company', () => {
  it('starts with a workspace, team leads, skills and languages', async () => {
    const list = await teams();
    expect(names(list)).toEqual(['Administration', 'B2B', 'B2C']);
    expect(named(list, 'B2C').leadName).toBe('Leo Lead');
    expect(named(list, 'Administration').leadId).toBeNull();
    expect(names(await workspaces())).toEqual(['Customer care']);
    const all = await skills();
    expect(all.filter((s) => s.kind === 'language').map((s) => s.name)).toEqual(['Bulgarian', 'English', 'French']);
    expect(named(all, 'Sales').people).toBe(1);
    expect(named(await people(), 'Rita Reviewer').workspaceIds).toHaveLength(1);
  });
});

describe('teams', () => {
  it('only admins change them; everyone else may only read', async () => {
    for (const who of ['reviewer', 'lead', 'trainer', 'agent']) {
      expect((await call('GET', '/api/teams', who)).statusCode).toBe(200);
      expect((await call('POST', '/api/teams', who, { name: 'Mine' })).statusCode).toBe(403);
      expect((await call('POST', '/api/skills', who, { kind: 'skill', name: 'Mine' })).statusCode).toBe(403);
      expect((await call('POST', '/api/workspaces', who, { name: 'Mine' })).statusCode).toBe(403);
    }
  });

  it('needs a unique name and a lead who is active staff', async () => {
    const leo = named(await people(), 'Leo Lead').membershipId;
    const alex = named(await people(), 'Alex Agent').membershipId;
    expect((await call('POST', '/api/teams', 'admin', { name: 'b2c', leadId: leo })).statusCode).toBe(409);
    const noLead = await call('POST', '/api/teams', 'admin', { name: 'Support' });
    expect(noLead.statusCode).toBe(400);
    // the reason comes as a code, so the page can show it in English, Bulgarian or French
    expect(noLead.json()).toEqual({ code: 'teamNeedsLead', message: 'Every team needs a team lead. Choose one.' });
    expect((await call('POST', '/api/teams', 'admin', { name: 'Support', leadId: alex })).statusCode).toBe(400);
    const b2c = named(await teams(), 'B2C');
    expect((await call('PUT', `/api/teams/${b2c.id}`, 'admin', { name: 'B2C', leadId: null })).statusCode).toBe(400);
    const admin = named(await teams(), 'Administration');
    const renamed = await call('PUT', `/api/teams/${admin.id}`, 'admin', { name: 'Administration', leadId: null });
    expect(renamed.statusCode).toBe(200);
  });

  it('puts a new team in the workspace chosen, and shows it only to that workspace', async () => {
    const leo = named(await people(), 'Leo Lead').membershipId;
    const desk = await call('POST', '/api/workspaces', 'admin', { name: 'Support desk' });
    expect(desk.statusCode).toBe(201);
    const deskId = json<Workspace>(desk).id;
    const made = await call('POST', '/api/teams', 'admin', {
      name: 'Support',
      leadId: leo,
      color: 'not a colour',
      workspaceId: deskId,
    });
    expect(made.statusCode).toBe(201);
    expect(named(await workspaces(), 'Support desk').teamIds).toEqual([json<Team>(made).id]);
    expect(names(await teams('admin'))).toContain('Support');
    for (const who of ['reviewer', 'lead', 'trainer', 'agent'])
      expect(names(await teams(who))).not.toContain('Support');
    expect(names(await workspaces('reviewer'))).toEqual(['Customer care']);
    expect(names(await workspaces('agent'))).toEqual(['Customer care']);
  });

  it("can't delete Administration, a team with people, or the last working team", async () => {
    const list = await teams();
    expect((await call('DELETE', `/api/teams/${named(list, 'Administration').id}`, 'admin')).statusCode).toBe(400);
    expect((await call('DELETE', `/api/teams/${named(list, 'B2C').id}`, 'admin')).statusCode).toBe(400);
    expect((await call('DELETE', `/api/teams/${named(list, 'Support').id}`, 'admin')).statusCode).toBe(204);
    // the second company has only Administration: its first working team can't be deleted
    const ada = json<Person[]>(await call('GET', '/api/people', 'admin', undefined, SECOND_COMPANY))[0];
    const only = await call(
      'POST',
      '/api/teams',
      'admin',
      { name: 'Only team', leadId: ada?.membershipId },
      SECOND_COMPANY,
    );
    expect(only.statusCode).toBe(201);
    const id = json<Team>(only).id;
    expect((await call('DELETE', `/api/teams/${id}`, 'admin', undefined, SECOND_COMPANY)).statusCode).toBe(400);
  });

  it("never reaches another company's team", async () => {
    const theirs = named(await teams('admin', SECOND_COMPANY), 'Only team');
    expect(names(await teams())).not.toContain('Only team');
    const leo = named(await people(), 'Leo Lead').membershipId;
    expect((await call('PUT', `/api/teams/${theirs.id}`, 'admin', { name: 'Taken', leadId: leo })).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/api/teams/${theirs.id}`, 'admin')).statusCode).toBe(404);
    const mine = named(await workspaces(), 'Customer care');
    const linked = await call('PUT', `/api/workspaces/${mine.id}`, 'admin', {
      name: 'Customer care',
      teamIds: [...mine.teamIds, theirs.id],
      staffIds: mine.staffIds,
    });
    expect(json<Workspace>(linked).teamIds).not.toContain(theirs.id);
  });
});

describe('workspaces', () => {
  it('hold only working teams and reviewers, team leads and trainers', async () => {
    const list = await teams();
    const everyone = await people();
    const desk = named(await workspaces(), 'Support desk');
    const saved = await call('PUT', `/api/workspaces/${desk.id}`, 'admin', {
      name: 'Support desk',
      teamIds: [named(list, 'Administration').id, named(list, 'B2B').id],
      staffIds: everyone.map((p) => p.membershipId),
    });
    expect(saved.statusCode).toBe(200);
    const result = json<Workspace>(saved);
    expect(result.teamIds).toEqual([named(list, 'B2B').id]);
    const staff = everyone.filter((p) => result.staffIds.includes(p.membershipId)).map((p) => p.role);
    expect(staff.sort()).toEqual(['lead', 'reviewer', 'trainer']);
    expect((await call('POST', '/api/workspaces', 'admin', { name: 'customer CARE' })).statusCode).toBe(409);
  });

  it('keeps at least one', async () => {
    expect(
      (await call('DELETE', `/api/workspaces/${named(await workspaces(), 'Support desk').id}`, 'admin')).statusCode,
    ).toBe(204);
    const last = named(await workspaces(), 'Customer care');
    expect((await call('DELETE', `/api/workspaces/${last.id}`, 'admin')).statusCode).toBe(400);
  });
});

describe('skills and languages', () => {
  it('are unique, rename everywhere, and leave everybody when deleted', async () => {
    expect((await call('POST', '/api/skills', 'admin', { kind: 'skill', name: 'sales' })).statusCode).toBe(409);
    expect((await call('POST', '/api/skills', 'admin', { kind: 'colour', name: 'Blue' })).statusCode).toBe(400);
    const made = await call('POST', '/api/skills', 'admin', { kind: 'language', name: 'Spanish' });
    expect(made.statusCode).toBe(201);
    const spanish = json<Skill>(made).id;
    const alex = named(await people(), 'Alex Agent');
    const saved = await call('PATCH', `/api/people/${alex.membershipId}`, 'admin', {
      skillIds: [...alex.skillIds, spanish, spanish, '00000000-0000-4000-8000-000000000000'],
    });
    expect(json<Person>(saved).skillIds).toHaveLength(alex.skillIds.length + 1);
    expect((await call('PATCH', `/api/skills/${spanish}`, 'admin', { name: 'English' })).statusCode).toBe(409);
    expect((await call('PATCH', `/api/skills/${spanish}`, 'admin', { name: 'Español' })).statusCode).toBe(200);
    expect(named(await skills(), 'Español').people).toBe(1);
    expect((await call('DELETE', `/api/skills/${spanish}`, 'admin')).statusCode).toBe(204);
    expect(named(await people(), 'Alex Agent').skillIds).toEqual(alex.skillIds);
    expect((await call('GET', '/api/skills', 'agent')).statusCode).toBe(200);
  });
});

describe('people, workspaces and team leads', () => {
  it('puts invited reviewers, team leads and trainers in the first workspace', async () => {
    const invited = await call('POST', '/api/people', 'admin', {
      name: 'Rob Reviewer',
      email: 'rob@demo.test',
      role: 'reviewer',
    });
    expect(invited.statusCode).toBe(201);
    const first = (await workspaces())[0];
    expect(named(await people(), 'Rob Reviewer').workspaceIds).toEqual([first?.id]);
  });

  it('shows staff and agents only the people of their own workspaces', async () => {
    const leo = named(await people(), 'Leo Lead').membershipId;
    const desk = json<Workspace>(await call('POST', '/api/workspaces', 'admin', { name: 'Night shift' }));
    const night = json<Team>(
      await call('POST', '/api/teams', 'admin', { name: 'Night', leadId: leo, workspaceId: desk.id }),
    );
    await call('POST', '/api/people', 'admin', {
      name: 'Nora Night',
      email: 'nora@demo.test',
      role: 'agent',
      teamId: night.id,
    });
    expect(names(await people('admin'))).toContain('Nora Night');
    for (const who of ['reviewer', 'lead', 'trainer', 'agent']) {
      const seen = names(await people(who));
      expect(seen).not.toContain('Nora Night');
      expect(seen).toContain('Ada Admin');
    }
    // a reviewer added to the night shift sees Nora too
    const rita = named(await people(), 'Rita Reviewer');
    await call('PATCH', `/api/people/${rita.membershipId}`, 'admin', {
      workspaceIds: [...rita.workspaceIds, desk.id],
    });
    expect(names(await people('reviewer'))).toContain('Nora Night');
  });

  it('a team lead who becomes an agent no longer leads a team', async () => {
    const leo = named(await people(), 'Leo Lead');
    const b2c = named(await teams(), 'B2C');
    const changed = await call('PATCH', `/api/people/${leo.membershipId}`, 'admin', {
      role: 'agent',
      teamId: b2c.id,
    });
    expect(changed.statusCode).toBe(200);
    expect(json<Person>(changed).workspaceIds).toEqual(
      json<Workspace[]>(await call('GET', '/api/workspaces', 'admin'))
        .filter((w) => w.teamIds.includes(b2c.id))
        .map((w) => w.id),
    );
    expect(named(await teams(), 'B2C').leadId).toBeNull();
    expect(named(await teams(), 'Night').leadId).toBeNull();
  });
});
