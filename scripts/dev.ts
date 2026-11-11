// Starts Q-smart v2 on your PC: the database, sign-in, the server and the pages. Then it opens the browser.
// Ctrl+C (or closing the window) stops everything.
//   npm run dev       (Start Q-smart v2.cmd): Firebase's local test version, with the five test accounts
//   npm run dev:real  (Start Q-smart v2 (real sign-in).cmd): the real "Q-smart Demo" Firebase project, Google sign-in;
//                     people listed in invites.local.txt ("e-mail role" per line, kept out of Git) are invited
import { type ChildProcess, spawn, type SpawnOptions, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createDb,
  DEMO_OWNER,
  DEMO_PEOPLE,
  inviteToDemo,
  type LocalPostgres,
  runMigrations,
  seedDemo,
  seedDemoConversations,
  seedDemoReviews,
  startLocalPostgres,
} from '@qsmart/db';
import { roleSchema } from '@qsmart/shared';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const REAL = process.argv.includes('--real');
// "demo-qsmart" always means Firebase's local test version; "qsmart-demo" is your real Q-smart Demo project
const PROJECT = REAL ? 'qsmart-demo' : 'demo-qsmart';
const FIREBASE_TOOLS = 'firebase-tools@15.35.0';
const AUTH_HOST = '127.0.0.1:9099';
const PG_PORT = 54329;
const API_PORT = 3200;
const WEB_URL = 'http://localhost:5173/';
const INVITES = 'invites.local.txt';
// The database files live outside OneDrive, so OneDrive never touches a running database.
const PG_DATA = join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'qsmart-v2', 'postgres');
// The master key that encrypts the companies' AI keys: made once, kept on this PC only (outside OneDrive and Git).
const MASTER_KEY_FILE = join(PG_DATA, '..', 'master-key.txt');
const windows = process.platform === 'win32';

const children: ChildProcess[] = [];
let database: LocalPostgres | undefined;
let stopping = false;

function run(name: string, command: string, args: string[], env: Record<string, string> = {}): ChildProcess {
  // Windows starts npm and npx through its shell; the arguments are fixed words of this file, never typed input.
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (REAL) delete childEnv.FIREBASE_AUTH_EMULATOR_HOST;
  const options: SpawnOptions = { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] };
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

/** invites.local.txt: one person per line, "e-mail role" (role: admin, reviewer, lead, trainer or agent). */
async function readInvites() {
  if (!existsSync(INVITES)) return [];
  return (await readFile(INVITES, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      // "owner" = admin of the demo company and owner of Q-smart (the platform owner area)
      const [email = '', role = 'admin'] = line.split(/\s+/);
      const platformAdmin = role === 'owner';
      return {
        email,
        name: email.split('@')[0] ?? email,
        role: roleSchema.parse(platformAdmin ? 'admin' : role),
        platformAdmin,
      };
    });
}

async function startLocalSignIn(): Promise<void> {
  run('sign-in', 'npx', ['--yes', FIREBASE_TOOLS, 'emulators:start', '--only', 'auth', '--project', PROJECT]);
  await waitFor(`http://${AUTH_HOST}/`, "Firebase's local sign-in", 900); // the first start downloads it
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  const auth = getAuth(initializeApp({ projectId: PROJECT }, 'qsmart-dev'));
  for (const person of [...DEMO_PEOPLE, DEMO_OWNER]) {
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
}

const inUse = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });

async function main(): Promise<void> {
  for (const port of [PG_PORT, API_PORT, 5173]) {
    if (await inUse(port)) {
      throw new Error('Q-smart v2 is already running in another window. Close that window first, then start again.');
    }
  }
  console.log('1/4 The database (PostgreSQL on this PC)…');
  await mkdir(PG_DATA, { recursive: true });
  database = await startLocalPostgres({ dataDir: PG_DATA, port: PG_PORT });
  await runMigrations(database.ownerUrl);
  const owner = createDb(database.ownerUrl);
  await seedDemo(owner);
  const added = await seedDemoReviews(owner);
  if (added) console.log(`  today's demo reviews added to the demo company: ${added}`);
  const talks = await seedDemoConversations(owner);
  if (talks) console.log(`  today's demo transcripts added as conversations: ${talks}`);
  if (REAL) {
    for (const person of await readInvites()) {
      await inviteToDemo(owner, person);
      console.log(`  invited ${person.email} as ${person.platformAdmin ? 'owner of Q-smart and admin' : person.role}`);
    }
  }
  await owner.$client.end();

  if (REAL) console.log('2/4 Sign-in: your real Firebase project "Q-smart Demo" (Google sign-in).');
  else {
    console.log("2/4 Sign-in: Firebase's local test version (the first start downloads it once)…");
    await startLocalSignIn();
  }

  const masterKey = process.env.QSMART_MASTER_KEY ?? (await ensureMasterKey());

  console.log('3/4 The server…');
  run('server', 'node', ['--enable-source-maps', 'apps/api/dist/main.js'], {
    DATABASE_URL: database.appUrl,
    FIREBASE_PROJECT_ID: PROJECT,
    API_PORT: String(API_PORT),
    QSMART_MASTER_KEY: masterKey,
    ...(REAL ? {} : { FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST }),
  });
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`, 'The server');

  console.log('4/4 The pages…');
  run('pages', 'npm', ['run', REAL ? 'dev:real' : 'dev', '-w', '@qsmart/web']);
  await waitFor(WEB_URL, 'The pages');

  console.log(`\nQ-smart v2 is running: ${WEB_URL}`);
  if (REAL) console.log('Sign in with Google, using an e-mail listed in invites.local.txt.');
  else console.log(`Test accounts: ${DEMO_PEOPLE.map((p) => p.email).join(', ')} (password: password)`);
  console.log('Close this window, or press Ctrl+C, to stop it.\n');
  if (windows && !process.env.QSMART_NO_BROWSER) spawn('cmd', ['/c', 'start', '', WEB_URL], { stdio: 'ignore' });
}

main().catch(async (error: unknown) => {
  const why = error instanceof Error ? error.message : 'the database did not start (see the lines above)';
  console.error(`\nQ-smart v2 could not start: ${why}`);
  await stop(1);
});

/** The master key for AI keys: read from this PC, or made the first time (32 random bytes). */
async function ensureMasterKey(): Promise<string> {
  if (existsSync(MASTER_KEY_FILE)) return (await readFile(MASTER_KEY_FILE, 'utf8')).trim();
  const key = randomBytes(32).toString('base64');
  await writeFile(MASTER_KEY_FILE, `${key}\n`, { flag: 'wx' });
  console.log('  a master key for AI keys was made on this PC (kept outside OneDrive and Git)');
  return key;
}
