// The platform owner area: the database functions in migrations/0005_platform_functions.sql. Each one checks again,
// inside the database, that the given Firebase account (verified by the server) is a platform owner.
import { sql } from 'drizzle-orm';
import type { Db } from './client.js';
import type { Tx } from './company.js';

export async function isPlatformAdmin(db: Db, firebaseUid: string): Promise<boolean> {
  const result = await db.execute<{ yes: boolean }>(sql`select is_platform_admin(${firebaseUid}) as yes`);
  return result.rows[0]?.yes === true;
}

export interface PlatformCompany {
  id: string;
  name: string;
  createdAt: string;
  people: number;
  admins: number;
}

export async function platformCompanies(db: Db, firebaseUid: string): Promise<PlatformCompany[]> {
  const result = await db.execute<{ id: string; name: string; created_at: Date; people: string; admins: string }>(
    sql`select id, name, created_at, people, admins from platform_companies(${firebaseUid})`,
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: new Date(r.created_at).toISOString(),
    people: Number(r.people),
    admins: Number(r.admins),
  }));
}

/** A new client company, with its Administration team and its first admin invited by e-mail. */
export async function platformCreateCompany(
  db: Db,
  firebaseUid: string,
  company: { name: string; adminEmail: string; adminName: string },
): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`select platform_create_company(${firebaseUid}, ${company.name}, ${company.adminEmail}, ${company.adminName}) as id`,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('The company was not created.');
  return id;
}

/** The owner's choices of AI models offered to client companies (models missing from it are offered). */
export interface AiOffer {
  modelId: string;
  offered: boolean;
  recommended: boolean;
}
export async function listAiOffers(db: Db | Tx): Promise<AiOffer[]> {
  const result = await db.execute<{ model_id: string; offered: boolean; recommended: boolean }>(
    sql`select model_id, offered, recommended from ai_offers order by model_id`,
  );
  return result.rows.map((r) => ({ modelId: r.model_id, offered: r.offered, recommended: r.recommended }));
}
/** The owner switches a model on or off for client companies, and marks it recommended (checked in the database). */
export async function platformSetAiOffer(db: Db, firebaseUid: string, offer: AiOffer): Promise<void> {
  await db.execute(
    sql`select platform_set_ai_offer(${firebaseUid}, ${offer.modelId}, ${offer.offered}, ${offer.recommended})`,
  );
}

export type AiLevel = 'light' | 'standard' | 'thorough';
/** The owner's model lists per effort level, and each task's level (rows that exist; the engine has defaults). */
export async function listAiLevels(db: Db | Tx): Promise<{
  levels: { level: AiLevel; models: string[] }[];
  tasks: { feature: string; level: AiLevel }[];
}> {
  const levels = await db.execute<{ level: AiLevel; models: string[] }>(
    sql`select level, models from ai_levels order by level`,
  );
  const tasks = await db.execute<{ feature: string; level: AiLevel }>(
    sql`select feature, level from ai_task_levels order by feature`,
  );
  return { levels: levels.rows, tasks: tasks.rows };
}
export async function platformSetAiLevel(db: Db, firebaseUid: string, level: AiLevel, models: string[]): Promise<void> {
  await db.execute(sql`select platform_set_ai_level(${firebaseUid}, ${level}, ${JSON.stringify(models)}::jsonb)`);
}
export async function platformSetAiTaskLevel(db: Db, firebaseUid: string, feature: string, level: AiLevel) {
  await db.execute(sql`select platform_set_ai_task_level(${firebaseUid}, ${feature}, ${level})`);
}

/** Q-smart's own AI accounts (the key stays encrypted; pages only ever get its last 4 characters). */
export interface PlatformAiAccount {
  provider: string;
  plan: 'free' | 'paid';
  keyCipher: string;
  keyHint: string;
  accountId: string | null;
  enabled: boolean;
  updatedAt: Date;
}
export async function listPlatformAiAccounts(db: Db | Tx): Promise<PlatformAiAccount[]> {
  const result = await db.execute<{
    provider: string;
    plan: string;
    key_cipher: string;
    key_hint: string;
    account_id: string | null;
    enabled: boolean;
    updated_at: Date;
  }>(
    sql`select provider, plan, key_cipher, key_hint, account_id, enabled, updated_at from platform_ai_accounts order by provider`,
  );
  return result.rows.map((r) => ({
    provider: r.provider,
    plan: r.plan === 'paid' ? 'paid' : 'free',
    keyCipher: r.key_cipher,
    keyHint: r.key_hint,
    accountId: r.account_id,
    enabled: r.enabled,
    updatedAt: new Date(r.updated_at),
  }));
}
export async function platformSaveAiAccount(
  db: Db,
  firebaseUid: string,
  a: Omit<PlatformAiAccount, 'updatedAt'>,
): Promise<void> {
  await db.execute(
    sql`select platform_save_ai_account(${firebaseUid}, ${a.provider}, ${a.plan}, ${a.keyCipher}, ${a.keyHint}, ${a.accountId}, ${a.enabled})`,
  );
}
export async function platformDeleteAiAccount(db: Db, firebaseUid: string, provider: string): Promise<void> {
  await db.execute(sql`select platform_delete_ai_account(${firebaseUid}, ${provider})`);
}
