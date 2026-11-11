// Home › Personalize: shared dashboards (who shares, who sees, who changes), a role's home dashboard, my own dashboards
// saved with my account, and the company wall.
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

const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, who: string, payload?: object, at = DEMO_COMPANY) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who}`, 'x-company-id': company[at] ?? '' },
    ...(payload ? { payload } : {}),
  });
type Shared = { id: string; name: string; roles: string[]; byName: string; items: string[] };
const list = async (who: string, at = DEMO_COMPANY) =>
  (await call('GET', '/api/dashboards', who, undefined, at)).json<{
    shared: Shared[];
    roles: Record<string, string[]>;
  }>();

describe('Personalize', () => {
  it('lets admins and reviewers share a dashboard; everyone of those roles sees it', async () => {
    const made = await call('PUT', '/api/dashboards/shared/agents-week', 'reviewer', {
      name: 'Agents this week',
      items: ['kpi_avg', 'last5'],
      roles: ['agent'],
    });
    expect(made.json<Shared>()).toMatchObject({ name: 'Agents this week', roles: ['agent'], byName: 'Rita Reviewer' });
    expect((await list('agent')).shared.map((v) => v.name)).toEqual(['Agents this week']);
    expect((await list('lead')).shared).toEqual([]);
    expect((await list('admin')).shared).toHaveLength(1);
    for (const who of ['lead', 'trainer', 'agent'])
      expect(
        (await call('PUT', '/api/dashboards/shared/mine', who, { name: 'Mine', items: [], roles: ['all'] })).statusCode,
      ).toBe(403);
    expect(
      (
        await call('PUT', '/api/dashboards/shared/bad', 'reviewer', { name: '', items: ['<script>'], roles: [] })
      ).json(),
    ).toMatchObject({ code: 'dashboardInvalid' });
  });

  it('lets only its sharer, or an admin, change or delete a shared dashboard', async () => {
    await call('PUT', '/api/dashboards/shared/team-pulse', 'admin', {
      name: 'Team pulse',
      items: ['brief'],
      roles: ['all'],
    });
    expect(
      (
        await call('PUT', '/api/dashboards/shared/team-pulse', 'reviewer', { name: 'Mine now', items: [], roles: [] })
      ).json(),
    ).toMatchObject({ code: 'dashboardNotYours' });
    expect((await call('DELETE', '/api/dashboards/shared/team-pulse', 'reviewer')).statusCode).toBe(403);
    const renamed = await call('PUT', '/api/dashboards/shared/agents-week', 'admin', {
      name: 'Agents, this week',
      items: ['kpi_avg'],
      roles: ['agent', 'lead'],
    });
    // the admin changed it, but it stays Rita's
    expect(renamed.json<Shared>()).toMatchObject({ name: 'Agents, this week', byName: 'Rita Reviewer' });
    expect((await list('lead')).shared.map((v) => v.name)).toEqual(['Agents, this week', 'Team pulse']);
    expect((await call('DELETE', '/api/dashboards/shared/agents-week', 'reviewer')).statusCode).toBe(204);
    expect((await list('admin')).shared.map((v) => v.name)).toEqual(['Team pulse']);
  });

  it("lets an admin set a role's home dashboard, and go back to the ready-made one", async () => {
    expect((await call('PUT', '/api/dashboards/roles/agent', 'reviewer', { items: ['kpi_avg'] })).statusCode).toBe(403);
    await call('PUT', '/api/dashboards/roles/agent', 'admin', { items: ['kpi_avg', 'last5'] });
    expect((await list('agent')).roles).toEqual({ agent: ['kpi_avg', 'last5'] });
    expect((await call('DELETE', '/api/dashboards/roles/agent', 'admin')).statusCode).toBe(204);
    expect((await list('agent')).roles).toEqual({});
    const log = (await call('GET', '/api/activity', 'admin')).json<{ action: string }[]>();
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(['dashboardShared', 'dashboardRoleHome']));
  });

  it('saves my own dashboards with my account, per company', async () => {
    const mine = {
      dashboards: {
        [company[DEMO_COMPANY] ?? '']: {
          home: ['kpi_avg', 'qtime'],
          views: [{ id: 'v-1', name: 'My categories', items: ['catins', 'heat'] }],
          base: 'review',
          grouping: 'month',
        },
      },
    };
    expect((await call('PUT', '/api/me/prefs', 'lead', mine)).statusCode).toBe(204);
    const me = (await call('GET', '/api/me', 'lead')).json<{ prefs: typeof mine }>();
    expect(me.prefs.dashboards).toEqual(mine.dashboards);
    const bad = { dashboards: { [company[DEMO_COMPANY] ?? '']: { home: ['DROP TABLE'] } } };
    expect((await call('PUT', '/api/me/prefs', 'lead', bad)).statusCode).toBe(400);
  });

  it('keeps a dashboard an admin arranged by hand (widths and heights), and refuses impossible sizes', async () => {
    const items = ['heat@30x400', 'kpi_avg@15', 'qtime@60'];
    const saved = await call('PUT', '/api/dashboards/shared/arranged', 'admin', {
      name: 'Arranged',
      items,
      roles: ['lead'],
    });
    expect(saved.statusCode).toBe(200);
    expect((await list('lead')).shared.find((d) => d.id === 'arranged')?.items).toEqual(items);
    for (const bad of ['heat@3', 'heat@61', 'heat@30x50', 'heat@30x9999', 'heat@'])
      expect(
        (
          await call('PUT', '/api/dashboards/shared/arranged', 'admin', {
            name: 'Arranged',
            items: [bad],
            roles: ['lead'],
          })
        ).statusCode,
        bad,
      ).toBe(400);
  });

  it("never shows another company's dashboards", async () => {
    expect(await list('admin', SECOND_COMPANY)).toEqual({ shared: [], roles: {} });
  });
});
