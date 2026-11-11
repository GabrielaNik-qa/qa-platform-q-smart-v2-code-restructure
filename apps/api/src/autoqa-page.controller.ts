// Quality › Home › AutoQA (today's AutoQA dashboard, with v2's AI reviews): the AI reviews a person can see (agents:
// their own) with their averages, categories, agents, trend and lowest scores; for staff also the accuracy score
// against reviewers (overall, per category with the brake, per model, language, scorecard and month) and the
// biggest disagreements. Admins set the brake's bar and pause AI reviews for a category; admins and reviewers get a
// random sample of AI-reviewed conversations to review themselves (spread across agents, channels and languages).
import { Body, Controller, Get, Inject, Put, Query, UseGuards } from '@nestjs/common';
import {
  type Db,
  getAiRules,
  logActivity,
  listConversations,
  listReviews,
  type Membership,
  type Review,
  saveAiRules,
  withCompany,
} from '@qsmart/db';
import {
  agreementBy,
  BRAKE_MIN_CONVERSATIONS,
  biggestDisagreements,
  categoryKey,
  overallAgreement,
  type Scope,
  stratifiedSample,
} from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { barOf, checkBrake, pairsOf } from './autoqa-insights.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

const avg = (list: number[]) =>
  list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null;
const scored = (r: Review) => (!r.notScored && r.score !== null ? r.score : null);

@Controller('autoqa')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class AutoqaPageController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('autoqa.read')
  page(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope) {
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const reviews = await listReviews(tx, reach);
      const ai = reviews.filter((r) => r.source === 'ai');
      const conversations = await listConversations(tx, reach);
      const scores = ai.map(scored).filter((s): s is number => s !== null);

      // categories: AutoQA's average per category (earned / possible)
      const cats = new Map<string, { earned: number; possible: number }>();
      for (const r of ai)
        for (const c of r.categories) {
          const t = cats.get(c.name) ?? { earned: 0, possible: 0 };
          t.earned += c.earned;
          t.possible += c.possible;
          cats.set(c.name, t);
        }
      const agents = new Map<string, number[]>();
      for (const r of ai) {
        const s = scored(r);
        if (s !== null) agents.set(r.agentName, [...(agents.get(r.agentName) ?? []), s]);
      }
      const week = 7 * 86_400_000;
      const now = Date.now();
      const trend = Array.from({ length: 8 }, (_, i) => {
        const k = 7 - i;
        const inWeek = ai.filter((r) => {
          const age = now - Date.parse(`${r.reviewedOn}T12:00:00Z`);
          return age >= k * week && age < (k + 1) * week;
        });
        const s = inWeek.map(scored).filter((x): x is number => x !== null);
        return { weeksAgo: k, reviews: inWeek.length, average: avg(s) };
      });
      const base = {
        tiles: {
          aiReviews: ai.length,
          conversations: new Set(ai.map((r) => r.conversationId)).size,
          agents: new Set(ai.map((r) => r.agentId)).size,
          average: avg(scores),
          disputed: ai.filter((r) => r.status === 'disputed').length,
          held: conversations.filter((c) => c.aiHold).length,
        },
        categories: [...cats]
          .map(([name, t]) => ({ name, average: t.possible ? Math.round((t.earned / t.possible) * 1000) / 10 : null }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        agents: [...agents]
          .map(([name, s]) => ({ name, reviews: s.length, average: avg(s) }))
          .sort((a, b) => (a.average ?? 0) - (b.average ?? 0)),
        trend,
        lowest: [...ai]
          .filter((r) => scored(r) !== null)
          .sort((a, b) => (scored(a) ?? 0) - (scored(b) ?? 0))
          .slice(0, 6)
          .map((r) => ({ id: r.id, agentName: r.agentName, day: r.reviewedOn, score: scored(r), channel: r.channel })),
      };
      if (membership.role === 'agent') return base;

      // the accuracy score (staff only)
      const language = new Map(conversations.map((c) => [c.id, String(c.values['language'] ?? '')]));
      const pairs = pairsOf(reviews, (id) => language.get(id) ?? '');
      const rules = await getAiRules(tx);
      const bar = barOf(rules.reviews);
      const paused = new Set(rules.reviews.paused ?? []);
      const flagged = new Set(rules.reviews.flagged ?? []);
      const list = (m: Map<string, ReturnType<typeof overallAgreement>>) =>
        [...m].map(([key, a]) => ({ key, ...a })).sort((x, y) => (x.score ?? 0) - (y.score ?? 0));
      const byCategory = [...agreementBy(pairs, (p, c) => categoryKey(p.scorecardId, c))].map(([key, a]) => {
        const [scorecardId = '', category = ''] = key.split('|');
        const card = pairs.find((p) => p.scorecardId === scorecardId)?.scorecardName ?? '';
        return {
          key,
          scorecard: card,
          category,
          ...a,
          braked: a.conversations >= BRAKE_MIN_CONVERSATIONS && a.score !== null && a.score < bar,
          paused: paused.has(key),
          told: flagged.has(key),
        };
      });
      // categories paused that have no comparison here still show, so they can be switched back on
      for (const key of paused)
        if (!byCategory.some((c) => c.key === key)) {
          const [, category = ''] = key.split('|');
          byCategory.push({
            key,
            scorecard: '',
            category,
            same: 0,
            compared: 0,
            conversations: 0,
            score: null,
            band: null,
            braked: false,
            paused: true,
            told: false,
          });
        }
      return {
        ...base,
        accuracy: {
          bar,
          minConversations: BRAKE_MIN_CONVERSATIONS,
          compared: pairs.length,
          overall: overallAgreement(pairs),
          byCategory: byCategory.sort((a, b) => (a.score ?? 101) - (b.score ?? 101)),
          byModel: list(agreementBy(pairs, (p) => p.model)),
          byLanguage: list(agreementBy(pairs, (p) => p.language)),
          byScorecard: list(agreementBy(pairs, (p) => p.scorecardName)),
          byMonth: list(agreementBy(pairs, (p) => p.day.slice(0, 7))).sort((a, b) => a.key.localeCompare(b.key)),
          disagreements: biggestDisagreements(pairs),
        },
      };
    });
  }

  /** The brake: the bar (1-100) and the categories where AI reviews are paused. */
  @Put('brake')
  @Allow('ai.manage')
  async brake(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({
        bar: z.number().int().min(1).max(100),
        paused: z.array(z.string().min(3).max(300)).max(500),
      })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('aiRulesInvalid');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const rules = await getAiRules(tx);
      await saveAiRules(tx, {
        reviews: { ...rules.reviews, bar: input.data.bar, paused: [...new Set(input.data.paused)] },
      });
      await logActivity(tx, actorOf(membership), { action: 'aiReviewsChanged' });
      await checkBrake(tx);
      return (await getAiRules(tx)).reviews;
    });
  }

  /**
   * A random sample of conversations AutoQA reviewed and no person has yet, spread across agents, channels and
   * languages, for reviewers to score (their reviews feed the accuracy score).
   */
  @Get('sample')
  @Allow('conversations.write')
  sample(@CurrentMembership() membership: Membership, @CurrentScope() scope: Scope, @Query('n') n?: string) {
    const count = Math.min(50, Math.max(1, Number(n) || 10));
    return withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const reviews = await listReviews(tx, reach);
      const byPerson = new Set(
        reviews.filter((r) => r.source !== 'ai' && r.conversationId).map((r) => r.conversationId),
      );
      const waiting = (await listConversations(tx, reach)).filter((c) => c.aiReviewed && !byPerson.has(c.id));
      return stratifiedSample(
        waiting,
        (c) => `${c.agentId}|${c.channel}|${String(c.values['language'] ?? '')}`,
        count,
      ).map((c) => ({
        id: c.id,
        agentName: c.agentName,
        teamName: c.teamName,
        channel: c.channel,
        channelName: c.channelName,
        startedAt: c.startedAt,
        language: String(c.values['language'] ?? ''),
        // the scorecard AutoQA used: the person scores with the same one, so the two can be compared
        scorecardId: reviews.find((r) => r.source === 'ai' && r.conversationId === c.id)?.scorecardId ?? null,
      }));
    });
  }
}
