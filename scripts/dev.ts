// Starts Q-smart v2 on your PC, in four steps: the database, Firebase's local test version for sign-in, the server
// and the pages. Then it opens the browser. Ctrl+C (or closing the window) stops everything.
// Run it with `npm run dev`, or double-click "Start Q-smart v2.cmd".
import { type ChildProcess, spawn, type SpawnOptions, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createDb, DEMO_PEOPLE, type LocalPostgres, runMigrations, seedDemo, startLocalPostgres } from '@qsmart/db';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT = 'demo-qsmart'; // a "demo-" project always means Firebase's local test version, never a real one
const FIREBASE_TOOLS = 'firebase-tools@15.35.0';
const AUTH_HOST = '127.0.0.1:9099';
const PG_PORT = 54329;
const API_PORT = 3200;
const WEB_URL = 'http://localhost:5173/';
// The database files live outside OneDrive, so OneDrive never touches a running database.
const PG_DATA = join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'qsmart-v2', 'postgres');
const windows = process.platform === 'win32';

const children: ChildProcess[] = [];
let database: LocalPostgres | undefined;
let stopping = false;

function run(name: string, command: string, args: string[], env: Record<string, string> = {}): ChildProcess {
  // Windows starts npm and npx through its shell; the arguments are fixed words of this file, never typed input.
  const options: SpawnOptions = { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] };
  const child: ChildProcess = windows
    ? spawn([command, ...args].join(' '), { ...options, shell: true })
    : spawn(command, args, options);
  const show = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) console.log(`  [${name}] ${line}`);
  };
  child.stdout?.on('data', show);
  child.stderr?.on('data', show);
  child.on('exit', (code) => {
    if (!stopping) console.log(`  [${name}] stopped (code ${code ?? '-'}).`);
  });
  children.push(child);
  return child;
}

async function waitFor(url: string, what: string, seconds = 180): Promise<void> {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${what} did not start within ${seconds} seconds (${url}).`);
}

async function stop(exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping Q-smart v2…');
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  await database?.stop().catch(() => undefined);
  console.log('Stopped.');
  process.exit(exitCode);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) process.on(signal, () => void stop());

async function main(): Promise<void> {
  console.log('1/4 The database (PostgreSQL on this PC)…');
  await mkdir(PG_DATA, { recursive: true });
  database = await startLocalPostgres({ dataDir: PG_DATA, port: PG_PORT });
  await runMigrations(database.ownerUrl);
  const owner = createDb(database.ownerUrl);
  await seedDemo(owner);
  await owner.$client.end();

  console.log("2/4 Sign-in: Firebase's local test version (the first start downloads it once)…");
  run('sign-in', 'npx', ['--yes', FIREBASE_TOOLS, 'emulators:start', '--only', 'auth', '--project', PROJECT]);
  await waitFor(`http://${AUTH_HOST}/`, "Firebase's local sign-in", 900); // the first start downloads it
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  const auth = getAuth(initializeApp({ projectId: PROJECT }, 'qsmart-dev'));
  for (const person of DEMO_PEOPLE) {
    await auth.getUser(person.firebaseUid).catch(() =>
      auth.createUser({
        uid: person.firebaseUid,
        email: person.email,
        password: 'password',
        displayName: person.name,
        emailVerified: true,
      }),
    );
  }

  console.log('3/4 The server…');
  run('server', 'node', ['--enable-source-maps', 'apps/api/dist/main.js'], {
    DATABASE_URL: database.appUrl,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
    FIREBASE_PROJECT_ID: PROJECT,
    API_PORT: String(API_PORT),
  });
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`, 'The server');

  console.log('4/4 The pages…');
  run('pages', 'npm', ['run', 'dev', '-w', '@qsmart/web']);
  await waitFor(WEB_URL, 'The pages');

  console.log(`\nQ-smart v2 is running: ${WEB_URL}`);
  console.log(`Test accounts: ${DEMO_PEOPLE.map((p) => p.email).join(', ')} (password: password)`);
  console.log('Close this window, or press Ctrl+C, to stop it.\n');
  if (windows && !process.env.QSMART_NO_BROWSER) spawn('cmd', ['/c', 'start', '', WEB_URL], { stdio: 'ignore' });
}

main().catch(async (error: unknown) => {
  console.error(`\nQ-smart v2 could not start: ${error instanceof Error ? error.message : String(error)}`);
  await stop(1);
});
