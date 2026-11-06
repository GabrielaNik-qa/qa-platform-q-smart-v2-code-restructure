import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/** packages/db/migrations, found from src/ (tests) and from dist/ (the built server) alike. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Brings a database up to date. Runs as qsmart_owner, the role that owns the tables. */
export async function runMigrations(ownerUrl: string): Promise<void> {
  const db = drizzle(ownerUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end();
  }
}
