// My account: a person's own name and language (migrations/0011_account_functions.sql). Call these only with the
// Firebase uid the server has just verified.
import type { Language } from '@qsmart/shared';
import { sql } from 'drizzle-orm';
import type { Db } from './client.js';

export interface MyProfile {
  name: string;
  email: string;
  language: Language | null;
}

export async function myProfile(db: Db, firebaseUid: string): Promise<MyProfile | undefined> {
  const result = await db.execute<{ name: string; email: string; language: Language | null }>(
    sql`select name, email, language from my_profile(${firebaseUid})`,
  );
  return result.rows[0];
}

export async function updateMyProfile(
  db: Db,
  firebaseUid: string,
  change: { name?: string; language?: Language },
): Promise<void> {
  await db.execute(sql`select update_my_profile(${firebaseUid}, ${change.name ?? null}, ${change.language ?? null})`);
}
