// Calibration sessions, always behind the company wall (inside withCompany). Who may see or change what is decided by
// the server (today's rules: participants and admins; the blind scores are hidden there too).
import type { Role } from '@qsmart/shared';
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import {
  type CalibrationDecision,
  calibrationParticipants,
  calibrationReviews,
  calibrations,
  calibrationScores,
  memberships,
  reviews,
  users,
} from './schema.js';

const thisCompany = sql<string>`app_company()`;

export type CalibrationStatus = 'planned' | 'held' | 'closed';
export type { CalibrationDecision };

export interface CalibrationParticipant {
  /** the participant row (used by the scores and the reference) */
  id: string;
  membershipId: string;
  name: string;
  role: Role;
  impression: string;
  done: string;
  wroteAt: Date | null;
}
export interface CalibrationReview {
  id: string;
  leadId: string;
  agentName: string;
  teamId: string | null;
  teamName: string;
  score: number | null;
  notScored: boolean;
  scorecardName: string;
  reviewerName: string;
}
export interface CalibrationScore {
  reviewId: string;
  participantId: string;
  score: number;
  note: string;
  at: Date;
}
export interface Calibration {
  id: string;
  title: string;
  heldOn: string;
  status: CalibrationStatus;
  notes: string;
  teamIds: string[];
  decisions: CalibrationDecision[];
  reference: Record<string, string>;
  byId: string | null;
  byName: string;
  createdAt: Date;
  updatedAt: Date;
  participants: CalibrationParticipant[];
  reviews: CalibrationReview[];
  scores: CalibrationScore[];
}
export type CalibrationFields = Pick<Calibration, 'title' | 'heldOn' | 'status' | 'notes' | 'teamIds'>;

async function fill(tx: Tx, rows: (typeof calibrations.$inferSelect)[]): Promise<Calibration[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const people = await tx
    .select({
      calibrationId: calibrationParticipants.calibrationId,
      id: calibrationParticipants.id,
      membershipId: calibrationParticipants.membershipId,
      name: users.name,
      role: memberships.role,
      impression: calibrationParticipants.impression,
      done: calibrationParticipants.done,
      wroteAt: calibrationParticipants.wroteAt,
    })
    .from(calibrationParticipants)
    .innerJoin(memberships, eq(memberships.id, calibrationParticipants.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(calibrationParticipants.calibrationId, ids))
    .orderBy(asc(users.name));
  const discussed = await tx
    .select({
      calibrationId: calibrationReviews.calibrationId,
      id: reviews.id,
      leadId: reviews.leadId,
      agentName: reviews.agentName,
      teamId: reviews.teamId,
      teamName: reviews.teamName,
      score: reviews.score,
      notScored: reviews.notScored,
      scorecardName: reviews.scorecardName,
      reviewerName: reviews.reviewerName,
    })
    .from(calibrationReviews)
    .innerJoin(reviews, eq(reviews.id, calibrationReviews.reviewId))
    .where(inArray(calibrationReviews.calibrationId, ids))
    .orderBy(asc(calibrationReviews.addedAt));
  const scores = await tx.select().from(calibrationScores).where(inArray(calibrationScores.calibrationId, ids));
  return rows.map(({ companyId: _company, ...c }) => ({
    ...c,
    participants: people.filter((p) => p.calibrationId === c.id).map(({ calibrationId: _c, ...p }) => p),
    reviews: discussed.filter((r) => r.calibrationId === c.id).map(({ calibrationId: _c, ...r }) => r),
    scores: scores.filter((s) => s.calibrationId === c.id).map(({ companyId: _co, calibrationId: _c, ...s }) => s),
  }));
}

/** Newest first: every session (admins), or those a person takes part in. */
export async function listCalibrations(tx: Tx, participant: string | null): Promise<Calibration[]> {
  const mine = participant
    ? inArray(
        calibrations.id,
        tx
          .select({ id: calibrationParticipants.calibrationId })
          .from(calibrationParticipants)
          .where(eq(calibrationParticipants.membershipId, participant)),
      )
    : undefined;
  const rows = await tx
    .select()
    .from(calibrations)
    .where(mine)
    .orderBy(desc(calibrations.heldOn), desc(calibrations.createdAt));
  return fill(tx, rows);
}

export async function getCalibration(tx: Tx, id: string): Promise<Calibration | undefined> {
  const rows = await tx.select().from(calibrations).where(eq(calibrations.id, id));
  return (await fill(tx, rows))[0];
}

export async function addCalibration(
  tx: Tx,
  fields: CalibrationFields,
  by: { id: string | null; name: string },
  participantIds: string[],
): Promise<string> {
  const [row] = await tx
    .insert(calibrations)
    .values({ companyId: thisCompany, ...fields, byId: by.id, byName: by.name })
    .returning({ id: calibrations.id });
  if (!row) throw new Error('The calibration was not saved.');
  await setParticipants(tx, row.id, participantIds);
  return row.id;
}

export async function updateCalibration(
  tx: Tx,
  id: string,
  change: Partial<CalibrationFields & Pick<Calibration, 'decisions' | 'reference'>>,
): Promise<void> {
  await tx
    .update(calibrations)
    .set({ ...change, updatedAt: sql`now()` })
    .where(eq(calibrations.id, id));
}

/** Who takes part: people taken off lose their part and their scores. Returns the newly added ones. */
export async function setParticipants(tx: Tx, id: string, membershipIds: string[]): Promise<string[]> {
  await tx
    .delete(calibrationParticipants)
    .where(
      and(
        eq(calibrationParticipants.calibrationId, id),
        membershipIds.length ? notInArray(calibrationParticipants.membershipId, membershipIds) : undefined,
      ),
    );
  if (!membershipIds.length) return [];
  const added = await tx
    .insert(calibrationParticipants)
    .values(membershipIds.map((membershipId) => ({ companyId: thisCompany, calibrationId: id, membershipId })))
    .onConflictDoNothing()
    .returning({ membershipId: calibrationParticipants.membershipId });
  return added.map((a) => a.membershipId);
}

export async function deleteCalibration(tx: Tx, id: string): Promise<void> {
  await tx.delete(calibrations).where(eq(calibrations.id, id));
}

/** A participant's own part: their impressions of the team(s) and what they have done. */
export async function writeMyPart(tx: Tx, participantId: string, impression: string, done: string): Promise<void> {
  await tx
    .update(calibrationParticipants)
    .set({ impression, done, wroteAt: sql`now()` })
    .where(eq(calibrationParticipants.id, participantId));
}

export async function addCalibrationReview(tx: Tx, id: string, reviewId: string): Promise<void> {
  await tx
    .insert(calibrationReviews)
    .values({ companyId: thisCompany, calibrationId: id, reviewId })
    .onConflictDoNothing();
}

/** Taking a review off the session also takes off its scores. */
export async function removeCalibrationReview(tx: Tx, id: string, reviewId: string): Promise<void> {
  await tx
    .delete(calibrationScores)
    .where(and(eq(calibrationScores.calibrationId, id), eq(calibrationScores.reviewId, reviewId)));
  await tx
    .delete(calibrationReviews)
    .where(and(eq(calibrationReviews.calibrationId, id), eq(calibrationReviews.reviewId, reviewId)));
}

/** A participant's own score of a review (saved again when they change it). */
export async function setCalibrationScore(
  tx: Tx,
  id: string,
  reviewId: string,
  participantId: string,
  score: number,
  note: string,
): Promise<void> {
  await tx
    .insert(calibrationScores)
    .values({ companyId: thisCompany, calibrationId: id, reviewId, participantId, score, note })
    .onConflictDoUpdate({
      target: [calibrationScores.calibrationId, calibrationScores.reviewId, calibrationScores.participantId],
      set: { score, note, at: sql`now()` },
    });
}
