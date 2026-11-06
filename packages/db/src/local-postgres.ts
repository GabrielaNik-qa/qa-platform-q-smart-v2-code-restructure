// A real PostgreSQL on this computer, started by the tests (a throw-away copy each time) and by the start file
// (a lasting copy outside OneDrive). Nothing to install and no admin rights needed.
// Local only: these role passwords protect nothing outside this computer.
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

export interface LocalPostgres {
  /** qsmart_owner: owns the tables and runs the migrations */
  ownerUrl: string;
  /** qsmart_app: what the server uses, always behind the company wall */
  appUrl: string;
  /** postgres: the superuser, only for setting up */
  adminUrl: string;
  stop(): Promise<void>;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port')),
      );
    });
  });

/** Creates the two roles and the database if they don't exist yet (safe to run every time). */
export async function prepareDatabase(adminUrl: string, database: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error(`Unexpected database name: ${database}`);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qsmart_owner') THEN
        CREATE ROLE qsmart_owner LOGIN PASSWORD 'qsmart_owner';
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qsmart_app') THEN
        CREATE ROLE qsmart_app LOGIN PASSWORD 'qsmart_app';
      END IF;
    END $$`);
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (!found.rowCount) await admin.query(`CREATE DATABASE ${database} OWNER qsmart_owner ENCODING 'UTF8'`);
  } finally {
    await admin.end();
  }
}

/**
 * Starts PostgreSQL. Without `dataDir` it's a throw-away copy in the temp folder, removed by stop().
 * With `dataDir` (outside OneDrive) the data stays between starts.
 */
export async function startLocalPostgres(
  options: { dataDir?: string; port?: number; database?: string } = {},
): Promise<LocalPostgres> {
  const throwAway = !options.dataDir;
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'qsmart-pg-')));
  const port = options.port ?? (await freePort());
  const database = options.database ?? 'qsmart';
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'postgres',
    password: 'postgres',
    authMethod: 'scram-sha-256',
    persistent: !throwAway,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(join(dataDir, 'PG_VERSION'))) await server.initialise();
  await server.start();
  const host = `localhost:${port}/${database}`;
  const adminUrl = `postgres://postgres:postgres@localhost:${port}/postgres`;
  try {
    await prepareDatabase(adminUrl, database);
  } catch (error) {
    await server.stop();
    throw error;
  }
  return {
    adminUrl,
    ownerUrl: `postgres://qsmart_owner:qsmart_owner@${host}`,
    appUrl: `postgres://qsmart_app:qsmart_app@${host}`,
    async stop() {
      await server.stop();
      if (throwAway) await rm(dataDir, { recursive: true, force: true });
    },
  };
}
