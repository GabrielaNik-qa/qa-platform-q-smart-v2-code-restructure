import type { Role } from '@qsmart/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client.js';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const companyIdSchema = z.uuid();

/**
 * Runs `work` behind the company wall of one company: inside it, PostgreSQL shows, changes and accepts
 * only that company's rows. The company is named per transaction, so it can never leak into another request.
 */
export function withCompany<T>(db: Db, companyId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  const id = companyIdSchema.parse(companyId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.company_id', ${id}, true)`);
    return work(tx);
  });
}

export interface Membership {
  companyId: string;
  companyName: string;
  role: Role;
  userId: string;
  userName: string;
}

/**
 * Accepts an invitation: links the invited e-mail to the Firebase account. Call it only with an account and a
 * *verified* e-mail that Firebase has just confirmed. Returns true when an invitation was taken.
 */
export async function claimInvitation(db: Db, firebaseUid: string, verifiedEmail: string): Promise<boolean> {
  const result = await db.execute<{ claimed: number }>(
    sql`select claim_invitation(${firebaseUid}, ${verifiedEmail}) as claimed`,
  );
  return (result.rows[0]?.claimed ?? 0) > 0;
}

/** The companies a signed-in person belongs to, used at sign-in before a company is chosen. */
export async function membershipsFor(db: Db, firebaseUid: string): Promise<Membership[]> {
  const result = await db.execute<{
    company_id: string;
    company_name: string;
    role: Role;
    user_id: string;
    user_name: string;
  }>(sql`select company_id, company_name, role, user_id, user_name from memberships_for(${firebaseUid})`);
  return result.rows.map((r) => ({
    companyId: r.company_id,
    companyName: r.company_name,
    role: r.role,
    userId: r.user_id,
    userName: r.user_name,
  }));
}
