// Which calls enter the app (Phase 6): the minimum call length a company sets, and the count of calls left out.
// Always behind the company wall (inside withCompany).
import { sql } from 'drizzle-orm';
import type { Tx } from './company.js';
import { companyIntake } from './schema.js';

const thisCompany = sql<string>`app_company()`;

export interface Intake {
  /** a call shorter than this many seconds never enters (null: all calls enter) */
  minCallSeconds: number | null;
  /** how many calls were left out for being too short */
  callsLeftOut: number;
}

export async function getIntake(tx: Tx): Promise<Intake> {
  const [row] = await tx.select().from(companyIntake);
  return { minCallSeconds: row?.minCallSeconds ?? null, callsLeftOut: row?.callsLeftOut ?? 0 };
}

/** Sets the minimum call length (null: every call enters). The count of calls left out is kept. */
export async function setMinCallSeconds(tx: Tx, seconds: number | null): Promise<void> {
  await tx
    .insert(companyIntake)
    .values({ companyId: thisCompany, minCallSeconds: seconds })
    .onConflictDoUpdate({ target: companyIntake.companyId, set: { minCallSeconds: seconds, updatedAt: sql`now()` } });
}

/** One more call was left out for being too short. */
export async function countCallLeftOut(tx: Tx): Promise<void> {
  await tx
    .insert(companyIntake)
    .values({ companyId: thisCompany, callsLeftOut: 1 })
    .onConflictDoUpdate({
      target: companyIntake.companyId,
      set: { callsLeftOut: sql`${companyIntake.callsLeftOut} + 1`, updatedAt: sql`now()` },
    });
}
