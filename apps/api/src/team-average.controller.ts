// The team's average for the Agents page (today's "Team Avg" and the radar's team line). Staff already have their
// teams' reviews in the page; an agent only receives their own reviews, so the server counts their team's numbers and
// sends the totals only, never a colleague's review. With fewer than 3 reviews in the period it sends no average, so a
// short period can't show one colleague's score.
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { type Db, listReviews, type Membership, membershipOfUser, withCompany } from '@qsmart/db';
import { averageScore, categoryAverages, type Scope, scoredOnly, type StatReview } from '@qsmart/shared';
import { z } from 'zod';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope } from './decorators.js';
import { badRequest } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { DB } from './tokens.js';

/** the fewest reviews a team average is shown for */
export const TEAM_AVERAGE_MIN = 3;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const question = z.object({
  teamId: z.uuid().optional(),
  /** the first day of the period, included */
  from: day.optional(),
  /** the day after the period */
  to: day.optional(),
  channel: z.enum(['call', 'chat', 'email', 'other']).optional(),
  scorecardId: z.uuid().optional(),
});

export interface TeamAverage {
  teamId: string | null;
  reviews: number;
  average: number | null;
  categories: { name: string; value: number }[];
}

@Controller('team-average')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TeamAverageController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('reviews.read')
  get(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Query() query: unknown,
  ): Promise<TeamAverage> {
    const input = question.safeParse(query);
    if (!input.success) throw badRequest('nothingToChange');
    const q = input.data;
    return withCompany(this.db, membership.companyId, async (tx) => {
      // an agent: always their own team; staff: a team they reach
      let teamId = q.teamId ?? null;
      if (scope === 'own') teamId = (await membershipOfUser(tx, membership.userId))?.teamId ?? null;
      else {
        const reach = await reachOf(tx, membership, scope);
        if (teamId && 'teamIds' in reach && !reach.teamIds.includes(teamId)) teamId = null;
      }
      if (!teamId) return { teamId: null, reviews: 0, average: null, categories: [] };
      const list = scoredOnly((await listReviews(tx, { teamIds: [teamId] })) as unknown as StatReview[]).filter(
        (r) =>
          (!q.from || r.reviewedOn >= q.from) &&
          (!q.to || r.reviewedOn < q.to) &&
          (!q.channel || r.channel === q.channel) &&
          (!q.scorecardId || r.scorecardId === q.scorecardId),
      );
      if (list.length < TEAM_AVERAGE_MIN) return { teamId, reviews: list.length, average: null, categories: [] };
      return { teamId, reviews: list.length, average: averageScore(list), categories: categoryAverages(list) };
    });
  }
}
