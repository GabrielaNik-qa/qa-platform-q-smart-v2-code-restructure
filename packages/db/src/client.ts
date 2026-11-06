import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

/** A connection pool to one database. The server uses qsmart_app's address, so the company wall applies. */
export function createDb(connectionString: string): Db {
  return drizzle(new pg.Pool({ connectionString, max: 10 }), { schema });
}
