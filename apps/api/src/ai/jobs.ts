// The AI engine's job types: for each, what the answer must look like (a zod schema), what the model must manage
// (structured output, size, wait, the quality bar from the test sets) and the ranked models to choose from. More job
// types come with their features (autoqa.score in step 4 of Phase 3b, Quinn's in Phase 4).
import { z } from 'zod';

export interface JobType<T = unknown> {
  /** area.task, e.g. autoqa.score (the usage figures count per job type) */
  feature: string;
  /** the answer, checked before anything uses it */
  schema: z.ZodType<T>;
  /** the answer must be JSON (always true for now: every answer is checked against its schema) */
  structured: boolean;
  /** 0 for the same answer every time (AI reviews) */
  temperature: number;
  maxOutputTokens: number;
  /** how long one model may take before the next is tried */
  maxWaitMs: number;
  /** how much a model that thinks before answering may think (default: low, the quickest) */
  effort?: 'low' | 'medium' | 'high';
  /** the lowest test-set score (0-100) a model needs for this job; none: no test set yet */
  minQuality?: number;
  /** the models to choose from, best first (the engine still picks the cheapest that passes everything) */
  candidates: string[];
}

/** Admin › AI's "Test" button: one short answer, to see that a key works. No company data in it. */
export const AI_TEST: JobType<{ reply: string }> = {
  feature: 'ai.test',
  schema: z.object({ reply: z.string().min(1).max(200) }),
  structured: true,
  temperature: 0,
  // room for the models that think before answering (gpt-oss)
  maxOutputTokens: 400,
  maxWaitMs: 20_000,
  candidates: [
    'groq/openai/gpt-oss-20b',
    'groq/openai/gpt-oss-120b',
    'cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct',
    'cloudflare/@cf/openai/gpt-oss-120b',
    'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  ],
};
