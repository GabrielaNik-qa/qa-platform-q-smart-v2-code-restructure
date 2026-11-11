// Starts the Q-smart server.
import 'reflect-metadata';
import { createDb, deleteOldTranscripts } from '@qsmart/db';
import { readMasterKey } from './ai/secrets.js';
import { createApp } from './app.js';
import { firebaseVerifier } from './auth/token-verifier.js';
import { loadConfig } from './config.js';
import { runScheduledReports } from './reports.controller.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const masterKey = readMasterKey(config.QSMART_MASTER_KEY);
if (!masterKey) console.log('No master key (QSMART_MASTER_KEY): AI keys cannot be stored.');
const app = await createApp({ db, verifier: firebaseVerifier(config.FIREBASE_PROJECT_ID), masterKey });
app.enableShutdownHooks();
await app.listen({ port: config.API_PORT, host: '127.0.0.1' });
console.log(`Q-smart server: http://localhost:${config.API_PORT}/api/health`);

// Scheduled reports (today's scheduler): on this PC the server looks every 10 minutes; online, Cloud Scheduler calls
// POST /api/jobs/scheduled-reports instead, so a sleeping server is woken only when there is work.
if (process.env['QSMART_TIMERS'] !== 'off') {
  const tick = () =>
    void runScheduledReports(db, Date.now()).catch((error: unknown) =>
      console.log('Scheduled reports problem:', error instanceof Error ? error.message : error),
    );
  setTimeout(tick, 20_000);
  setInterval(tick, 10 * 60_000);
  // transcripts older than each company's days: deleted every 12 hours (as today), and once at the start
  const purge = () =>
    void deleteOldTranscripts(db)
      .then((n) => n && console.log(`Old transcripts deleted: ${n}`))
      .catch((error: unknown) =>
        console.log('Transcript deletion problem:', error instanceof Error ? error.message : error),
      );
  setTimeout(purge, 30_000);
  setInterval(purge, 12 * 60 * 60_000);
}
