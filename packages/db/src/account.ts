// My account: a person's own name, language and choices of messages (migrations/0011 and 0013). Call these only
// with the Firebase uid the server has just verified.
import type { Language } from '@qsmart/shared';
import { sql } from 'drizzle-orm';
import type { Db } from './client.js';
import type { Prefs } from './schema.js';

export interface MyProfile {
  name: string;
  email: string;
  language: Language | null;
  prefs: Prefs;
}

export async function myProfile(db: Db, firebaseUid: string): Promise<MyProfile | undefined> {
  const result = await db.execute<{ name: string; email: string; language: Language | null; prefs: Prefs }>(
    sql`select name, email, language, prefs from my_profile(${firebaseUid})`,
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

/** My account › Notifications & Confirmations, saved with the account. */
export async function updateMyPrefs(db: Db, firebaseUid: string, prefs: Prefs): Promise<void> {
  await db.execute(sql`select update_my_prefs(${firebaseUid}, ${JSON.stringify(prefs)}::jsonb)`);
}
