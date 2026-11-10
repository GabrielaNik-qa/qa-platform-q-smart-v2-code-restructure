// Today's 842 demo reviews in v2's demo company (packages/db/demo/reviews.json, made by scripts/make-demo-reviews.ts):
// made-up agents and reviewers, the same answers, comments, root causes, flags, "seen" and disputes, each review scored
// again with v2's scoring. So the dashboards have six months of reviews to show, and can be compared with today's.
// Only the start file (scripts/dev.ts) adds them; the automatic tests keep their own small demo company.
import { readFileSync } from 'node:fs';
import { type GivenAnswer, scoreReview } from '@qsmart/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  companies,
  disputeMessages,
  disputes,
  memberships,
  reviews,
  scorecards,
  teams,
  users,
  workspaces,
  workspaceStaff,
  workspaceTeams,
} from './schema.js';
import { DEMO_COMPANY } from './seed.js';

interface DemoReview {
  lead: string;
  agent: number;
  reviewer: number;
  team: string;
  day: string;
  at: string;
  channel: 'call' | 'chat' | 'email' | 'other';
  card: string;
  campaign: string;
  /** one letter per question: y, n, or a (N/A) */
  answers: string;
  /** the critical settings it was scored with (1 = critical), when they differ from the scorecard's today */
  critical?: { categories: string; questions: string };
  notes?: Record<string, string>;
  causes?: Record<string, string>;
  comment: string;
  flag: '' | 'green' | 'red';
  seen: boolean;
  /** today's score of it */
  score: number;
  dispute?: {
    openedAt: string;
    outcome: 'kept' | 'changed' | 'partly' | null;
    note: string;
    resolvedAt: string | null;
    messages: { by: 'agent' | 'reviewer'; text: string; at: string }[];
  };
}
export interface DemoReviews {
  agents: { name: string; email: string; team: string }[];
  reviewers: { name: string; email: string }[];
  reviews: DemoReview[];
}

/** The file with today's demo reviews (the same place from src/ and from dist/). */
export const demoReviews = (): DemoReviews =>
  JSON.parse(readFileSync(new URL('../demo/reviews.json', import.meta.url), 'utf8')) as DemoReviews;

/** The scorecard as the review was scored with it: today's categories and items, with the review's own critical settings. */
export function asScoredWith<C extends { critical: boolean; questions: { critical: boolean }[] }>(
  categories: C[],
  critical: DemoReview['critical'],
): C[] {
  if (!critical) return categories;
  let i = 0;
  return categories.map((c, ci) => ({
    ...c,
    critical: critical.categories[ci] === '1',
    questions: c.questions.map((q) => ({ ...q, critical: critical.questions[i++] === '1' })),
  }));
}

/** The answers of a review, as v2's scoring takes them: one list per category. */
export function givenAnswers(
  review: Pick<DemoReview, 'answers' | 'notes' | 'causes'>,
  categories: { questions: unknown[] }[],
): GivenAnswer[][] {
  let i = 0;
  return categories.map((c) =>
    c.questions.map(() => {
      const code = review.answers[i];
      const at = String(i++);
      return {
        answer: code === 'a' ? 'na' : code === 'n' ? 'n' : 'y',
        comment: review.notes?.[at] ?? '',
        rootCause: review.causes?.[at] ?? '',
      };
    }),
  );
}

/**
 * Adds today's demo reviews to the demo company, once (when its first made-up agent isn't there yet). Returns how many
 * reviews were added. Runs as qsmart_owner, like the rest of the demo seed.
 */
export async function seedDemoReviews(owner: Db): Promise<number> {
  const data = demoReviews();
  return owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) return 0;
    const companyId = demo.id;
    const first = data.agents[0];
    if (!first) return 0;
    const [done] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.companyId, companyId), eq(users.email, first.email)));
    if (done) return 0;

    // the teams: today's demo data also has a Support team; it joins the first workspace with the others
    const teamRows = await tx.select().from(teams).where(eq(teams.companyId, companyId));
    const teamId = new Map(teamRows.map((t) => [t.name, t.id]));
    const [workspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.companyId, companyId))
      .orderBy(workspaces.createdAt)
      .limit(1);
    for (const name of new Set([...data.agents.map((a) => a.team), ...data.reviews.map((r) => r.team)])) {
      if (teamId.has(name)) continue;
      const [made] = await tx
        .insert(teams)
        .values({ companyId, name, description: 'Customer support', color: '#7c3aed' })
        .returning({ id: teams.id });
      if (!made) continue;
      teamId.set(name, made.id);
      if (workspace) await tx.insert(workspaceTeams).values({ companyId, workspaceId: workspace.id, teamId: made.id });
    }
    const administration = teamRows.find((t) => t.isAdministration)?.id ?? null;

    // the people: made-up agents, and the reviewers (the demo admin and reviewer exist; two more are made up)
    const person = async (name: string, email: string, role: 'agent' | 'reviewer', team: string | null) => {
      await tx
        .insert(users)
        .values({ email, name, firebaseUid: `demo-${email.split('@')[0] ?? email}` })
        .onConflictDoNothing({ target: users.email });
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!user) throw new Error(`No user ${email}`);
      const [existing] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, user.id)));
      if (existing) return existing.id;
      const [made] = await tx
        .insert(memberships)
        .values({ companyId, userId: user.id, role, teamId: team })
        .returning({ id: memberships.id });
      if (!made) throw new Error(`No membership for ${email}`);
      if (role === 'reviewer' && workspace)
        await tx
          .insert(workspaceStaff)
          .values({ companyId, workspaceId: workspace.id, membershipId: made.id })
          .onConflictDoNothing();
      return made.id;
    };
    const agentIds: string[] = [];
    for (const a of data.agents) agentIds.push(await person(a.name, a.email, 'agent', teamId.get(a.team) ?? null));
    const reviewerIds: string[] = [];
    for (const r of data.reviewers) reviewerIds.push(await person(r.name, r.email, 'reviewer', administration));

    // the reviews, scored again by v2
    const cards = new Map(
      (await tx.select().from(scorecards).where(eq(scorecards.companyId, companyId))).map((c) => [c.name, c]),
    );
    let added = 0;
    for (let start = 0; start < data.reviews.length; start += 200) {
      const chunk = data.reviews.slice(start, start + 200);
      const rows = chunk.map((r) => {
        const card = cards.get(r.card);
        if (!card) throw new Error(`The demo company has no scorecard "${r.card}"`);
        const categories = asScoredWith(card.categories, r.critical);
        const scored = scoreReview(categories, givenAnswers(r, categories));
        const agent = data.agents[r.agent];
        const reviewer = data.reviewers[r.reviewer];
        const open = r.dispute && !r.dispute.outcome;
        return {
          companyId,
          leadId: r.lead,
          agentId: agentIds[r.agent] ?? null,
          agentName: agent?.name ?? '',
          teamId: teamId.get(r.team) ?? null,
          teamName: r.team,
          reviewedOn: r.day,
          channel: r.channel,
          scorecardId: card.id,
          scorecardName: card.name,
          categories: scored.categories,
          score: scored.score,
          zero: scored.zero,
          notScored: scored.notScored,
          status: open ? 'disputed' : 'ok',
          flag: r.flag,
          campaign: r.campaign,
          comment: r.comment,
          reviewerId: reviewerIds[r.reviewer] ?? null,
          reviewerName: reviewer?.name ?? '',
          seenAt: r.seen ? new Date(r.at) : null,
          createdAt: new Date(r.at),
          updatedAt: new Date(r.at),
        };
      });
      const made = await tx.insert(reviews).values(rows).returning({ id: reviews.id });
      added += made.length;
      // the disputes of this chunk
      for (const [i, r] of chunk.entries()) {
        const d = r.dispute;
        const reviewId = made[i]?.id;
        if (!d || !reviewId) continue;
        const agentId = agentIds[r.agent] ?? null;
        const reviewerId = reviewerIds[r.reviewer] ?? null;
        const agentName = data.agents[r.agent]?.name ?? '';
        const reviewerName = data.reviewers[r.reviewer]?.name ?? '';
        const [dispute] = await tx
          .insert(disputes)
          .values({
            companyId,
            reviewId,
            agentId,
            openedAt: new Date(d.openedAt),
            ...(d.outcome && d.resolvedAt
              ? {
                  outcome: d.outcome,
                  note: d.note,
                  resolvedAt: new Date(d.resolvedAt),
                  resolvedById: reviewerId,
                  resolvedByName: reviewerName,
                }
              : {}),
          })
          .returning({ id: disputes.id });
        if (!dispute) continue;
        const messages = d.messages.map((m) => ({
          companyId,
          disputeId: dispute.id,
          authorId: m.by === 'agent' ? agentId : reviewerId,
          authorName: m.by === 'agent' ? agentName : reviewerName,
          authorRole: m.by === 'agent' ? 'agent' : 'reviewer',
          system: false,
          text: m.text,
          at: new Date(m.at),
        }));
        if (d.outcome && d.resolvedAt)
          messages.push({
            companyId,
            disputeId: dispute.id,
            authorId: reviewerId,
            authorName: reviewerName,
            authorRole: 'reviewer',
            system: true,
            text: d.outcome,
            at: new Date(d.resolvedAt),
          });
        if (messages.length) await tx.insert(disputeMessages).values(messages);
      }
    }
    return added;
  });
}
