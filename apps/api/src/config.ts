import { z } from 'zod';

/** The server's settings, from its environment (on your PC: set by the start file; online: Secret Manager). */
const settings = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is missing: the database address of qsmart_app'),
  FIREBASE_PROJECT_ID: z.string().min(1).default('demo-qsmart'),
  API_PORT: z.coerce.number().int().positive().default(3200),
});

export type Config = z.infer<typeof settings>;

export const loadConfig = (env: Record<string, string | undefined> = process.env): Config => settings.parse(env);
