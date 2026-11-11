// Starts the Q-smart server.
import 'reflect-metadata';
import { createDb } from '@qsmart/db';
import { createApp } from './app.js';
import { firebaseVerifier } from './auth/token-verifier.js';
import { loadConfig } from './config.js';
import { runScheduledReports } from './reports.controller.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = await createApp({ db, verifier: firebaseVerifier(config.FIREBASE_PROJECT_ID) });
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
}
