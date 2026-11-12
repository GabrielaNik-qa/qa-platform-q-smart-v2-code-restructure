// Coaching's numbers against today's rules (work.js: insight, Team focus, coachOverview).
import { describe, expect, it } from 'vitest';
import { coachingOverview, insightOf, type SessionFacts, teamFocus } from './coaching.js';
import type { StatReview } from './stats.js';

const NOW = new Date('2026-11-12T12:00:00').getTime();
const day = (n: number) => new Date(NOW - n * 864e5).toLocaleDateString('sv-SE');
const rates = { general: 85, teams: { b2c: 80 } };
const review = (
  agentId: string,
  teamId: string,
  ago: number,
  cats: [string, number][],
  over: Partial<StatReview & { status: string }> = {},
): StatReview & { status?: string } => ({
  id: `${agentId}-${ago}-${cats.length}`,
  leadId: 'L',
  agentId,
  teamId,
  channel: 'call',
  scorecardId: 's',
  reviewerName: 'R',
  reviewedOn: day(ago),
  createdAt: `${day(ago)}T12:00:00`,
  score: Math.round(cats.reduce((s, [, v]) => s + v, 0) / cats.length),
  notScored: false,
  categories: cats.map(([name, v]) => ({ name, earned: v, possible: 100 })),
  comment: '',
  flag: '',
  seenAt: null,
  reviewSeconds: null,
  ...over,
});
const session = (over: Partial<SessionFacts>): SessionFacts => ({
  kind: 'coaching',
  heldOn: day(10),
  status: 'done',
  agents: [{ id: 'ana', teamId: 'b2b' }],
  signatures: {},
  byId: 'tina',
  byName: 'Tina Trainer',
  ...over,
});

describe('coaching', () => {
  const reviews = [
    review('ana', 'b2b', 2, [
      ['Greeting', 60],
      ['Closing', 90],
      ['Empathy', 70],
    ]),
    review(
      'ana',
      'b2b',
      5,
      [
        ['Greeting', 70],
        ['Closing', 95],
        ['Empathy', 80],
      ],
      { status: 'disputed' },
    ),
    review('ana', 'b2b', 40, [
      ['Greeting', 90],
      ['Closing', 95],
      ['Empathy', 90],
    ]),
    review('bo', 'b2b', 3, [
      ['Greeting', 95],
      ['Closing', 70],
      ['Empathy', 90],
    ]),
    review('cy', 'b2c', 3, [
      ['Greeting', 85],
      ['Closing', 85],
      ['Empathy', 85],
    ]),
  ];

  it("shows what an agent should work on: up to 3 categories under their pass rate, with the team's average", () => {
    const i = insightOf({ membershipId: 'ana', teamId: 'b2b' }, reviews, [session({ heldOn: day(20) })], rates, NOW);
    expect(i.reviews).toBe(2);
    expect(i.weak.map((w) => w.name)).toEqual(['Greeting', 'Empathy']);
    expect(i.weak[0]).toMatchObject({ value: 65, team: (60 + 70 + 95) / 3 });
    expect(i.trend).toBeLessThan(-2);
    expect(i.disputes).toBe(1);
    expect(i.lastCoached).toBe(day(20));
    // today's priority: pass rate - average + 3 per weak category + 2 per dispute + 3 when falling
    expect(i.priority).toBeCloseTo(85 - (i.average ?? 0) + 2 * 3 + 2 + 3);
    // the team's own pass rate counts: 80 for B2C, so 85 there is fine
    expect(insightOf({ membershipId: 'cy', teamId: 'b2c' }, reviews, [], rates, NOW).weak).toEqual([]);
    // without reviews, last
    expect(insightOf({ membershipId: 'zed', teamId: 'b2b' }, reviews, [], rates, NOW).priority).toBe(-99);
  });

  it("finds the team's focus: the weakest categories and who is below the pass rate in each", () => {
    const focus = teamFocus(
      [
        { membershipId: 'ana', teamId: 'b2b' },
        { membershipId: 'bo', teamId: 'b2b' },
      ],
      reviews,
      rates,
      NOW,
    );
    expect(focus.map((f) => f.name)).toEqual(['Greeting', 'Empathy', 'Closing']);
    expect(focus.find((f) => f.name === 'Greeting')?.below).toEqual(['ana']);
    expect(focus.find((f) => f.name === 'Closing')?.below).toEqual(['bo']);
  });

  it('sums up the sessions: held, coming, overdue, signed, and the score after against before', () => {
    const today = day(0);
    const o = coachingOverview(
      [
        session({ heldOn: day(4), signatures: { ana: {} } }),
        session({ heldOn: day(-3), status: 'planned' }),
        session({ heldOn: day(1), status: 'planned' }),
        session({ kind: 'o2o', heldOn: day(2) }),
        session({ heldOn: day(30), agents: [{ id: 'bo', teamId: 'b2b' }], byId: 'rita', byName: 'Rita Reviewer' }),
      ],
      reviews,
      today,
    );
    expect(o).toMatchObject({ held: 2, coming: 1, overdue: 1, signed: 1, toSign: 2 });
    // Ana, coached 4 days ago: the review 2 days ago is after the session, the one 5 days ago (82) before it
    const after = review('ana', 'b2b', 2, [
      ['Greeting', 60],
      ['Closing', 90],
      ['Empathy', 70],
    ]).score;
    expect(o.change).toBeCloseTo((after ?? 0) - 82);
    expect(o.coaches.map((c) => c.name)).toEqual(['Rita Reviewer', 'Tina Trainer']);
  });
});
