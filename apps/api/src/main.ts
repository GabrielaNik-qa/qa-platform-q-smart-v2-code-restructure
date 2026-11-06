// Starts the Q-smart server.
import 'reflect-metadata';
import { createDb } from '@qsmart/db';
import { createApp } from './app.js';
import { firebaseVerifier } from './auth/token-verifier.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApp({
  db: createDb(config.DATABASE_URL),
  verifier: firebaseVerifier(config.FIREBASE_PROJECT_ID),
});
app.enableShutdownHooks();
await app.listen({ port: config.API_PORT, host: '127.0.0.1' });
console.log(`Q-smart server: http://localhost:${config.API_PORT}/api/health`);
