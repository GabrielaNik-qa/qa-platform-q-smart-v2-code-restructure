// Phase 4's demo data: tasks, coaching sessions, a form template and one-to-ones, added once, within the database's
// own limits (its checks would refuse anything else), only in the demo company and only for made-up people.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { type LocalPostgres, startLocalPostgres } from './local-postgres.js';
import { runMigrations } from './migrate.js';
import { coachingSessions, companies, oneToOneTemplates, tasks } from './schema.js';
import { DEMO_COMPANY, seedDemo } from './seed.js';
import { seedDemoCoaching } from './seed-coaching.js';
import { seedDemoReviews } from './seed-reviews.js';

let server: LocalPostgres;
let owner: Db;

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
  await seedDemoReviews(owner);
}, 180_000);

afterAll(async () => {
  await owner?.$client.end();
  await server?.stop();
});

describe("Phase 4's demo data", () => {
  it('adds tasks, coaching sessions and one-to-ones once, in the demo company', async () => {
    expect(await seedDemoCoaching(owner)).toBe(17);
    expect(await seedDemoCoaching(owner)).toBe(0);
    const [demo] = await owner.select().from(companies).where(eq(companies.name, DEMO_COMPANY));
    const all = await owner.select().from(coachingSessions);
    expect(all.every((s) => s.companyId === demo?.id)).toBe(true);
    const o2o = all.filter((s) => s.kind === 'o2o');
    expect(o2o.map((s) => s.state).sort()).toEqual(['draft', 'sent', 'signed', 'signed', 'signed', 'signed']);
    // a draft is planned and unsigned; the others are held and signed by the team lead
    for (const s of o2o) {
      expect(s.status).toBe(s.state === 'draft' ? 'planned' : 'done');
      expect(!!s.leadSignature).toBe(s.state !== 'draft');
      expect(Object.keys(s.signatures).length > 0).toBe(s.state === 'signed');
    }
    expect(
      all
        .filter((s) => s.kind !== 'o2o')
        .map((s) => s.kind)
        .sort(),
    ).toEqual(['coaching', 'group', 'training']);
    expect(await owner.select().from(oneToOneTemplates)).toHaveLength(1);
    const given = await owner.select().from(tasks);
    expect(given).toHaveLength(7);
    expect(given.map((x) => x.status).sort()).toEqual(['doing', 'doing', 'done', 'done', 'review', 'todo', 'todo']);
    // made-up people only: the demo company's own
    expect(given.every((x) => x.byName.length > 0 && x.companyId === demo?.id)).toBe(true);
  });
});
