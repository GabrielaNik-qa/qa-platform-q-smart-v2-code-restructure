// Today's demo reviews in v2's demo company: all of them, each with today's own score (v2 scores them again), with
// their disputes, made-up people only, and added once.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { type LocalPostgres, startLocalPostgres } from './local-postgres.js';
import { runMigrations } from './migrate.js';
import { companies, disputes, memberships, reviews, users } from './schema.js';
import { DEMO_COMPANY, seedDemo } from './seed.js';
import { demoReviews, seedDemoReviews } from './seed-reviews.js';
import { eq } from 'drizzle-orm';

let server: LocalPostgres;
let owner: Db;

beforeAll(async () => {
  server = await startLocalPostgres();
  await runMigrations(server.ownerUrl);
  owner = createDb(server.ownerUrl);
  await seedDemo(owner);
}, 180_000);

afterAll(async () => {
  await owner?.$client.end();
  await server?.stop();
});

describe("today's demo reviews in v2's demo company", () => {
  const data = demoReviews();

  it('adds every review once, scored exactly as today', async () => {
    expect(await seedDemoReviews(owner)).toBe(data.reviews.length);
    expect(await seedDemoReviews(owner)).toBe(0);
    const [demo] = await owner.select().from(companies).where(eq(companies.name, DEMO_COMPANY));
    const rows = await owner
      .select({
        leadId: reviews.leadId,
        agentName: reviews.agentName,
        reviewedOn: reviews.reviewedOn,
        score: reviews.score,
      })
      .from(reviews)
      .where(eq(reviews.companyId, demo?.id ?? ''));
    expect(rows).toHaveLength(data.reviews.length);
    // every review of today's demo data, found with today's score
    const key = (lead: string, agent: string, day: string) => `${lead}|${agent}|${day}`;
    const v2 = new Map<string, number[]>();
    for (const r of rows) {
      const k = key(r.leadId, r.agentName, r.reviewedOn);
      v2.set(k, [...(v2.get(k) ?? []), Number(r.score)]);
    }
    for (const r of data.reviews) {
      const scores = v2.get(key(r.lead, data.agents[r.agent]?.name ?? '', r.day)) ?? [];
      expect(scores).toContain(Math.round(r.score * 10) / 10);
    }
  });

  it('keeps the disputes, and only made-up people', async () => {
    const all = await owner.select().from(disputes);
    expect(all).toHaveLength(data.reviews.filter((r) => r.dispute).length);
    const people = await owner
      .select({ name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId));
    for (const p of people) expect(p.email).toMatch(/@(demo|second)\.test$|@qsmart\.test$/);
    expect(people.map((p) => p.name)).toEqual(expect.arrayContaining(data.agents.map((a) => a.name)));
  });
});
