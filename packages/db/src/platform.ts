// The platform owner area: the database functions in migrations/0005_platform_functions.sql. Each one checks again,
// inside the database, that the given Firebase account (verified by the server) is a platform owner.
import { sql } from 'drizzle-orm';
import type { Db } from './client.js';

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
