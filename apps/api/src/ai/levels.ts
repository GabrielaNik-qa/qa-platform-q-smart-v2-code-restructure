// Effort levels (17 November): Q-smart is the mediator, so clients never see AI companies or models. Every AI task has an
// effort level, light, standard or thorough; behind each level the owner lists the models that serve it, best first
// (text and speech models in one list: each task takes the kind it needs). These are the defaults until the owner
// changes them in the owner area; the engine still uses the cheapest model of the list that passes every rule.
import type { AiLevel } from '@qsmart/db';
import { CATALOGUE } from './catalogue.js';

export const LEVELS: AiLevel[] = ['light', 'standard', 'thorough'];

/** Every AI task, the kind of model it needs, its default level, and whether it exists yet (live). */
export interface AiTask {
  feature: string;
  kind: 'text' | 'speech' | 'voice';
  level: AiLevel;
  live: boolean;
}
export const AI_TASKS: AiTask[] = [
  { feature: 'autoqa.score', kind: 'text', level: 'standard', live: true },
  { feature: 'speech.transcribe', kind: 'speech', level: 'standard', live: true },
  { feature: 'speech.speakers', kind: 'text', level: 'light', live: true },
  { feature: 'learning.quiz', kind: 'text', level: 'standard', live: true },
  { feature: 'learning.import', kind: 'text', level: 'standard', live: true },
  { feature: 'transcript.translate', kind: 'text', level: 'light', live: true },
  // coming with their phases: listed so the owner can plan their levels
  { feature: 'autoqa.scorable', kind: 'text', level: 'light', live: false },

  { feature: 'coaching.advice', kind: 'text', level: 'standard', live: false },
  { feature: 'agents.answer', kind: 'text', level: 'thorough', live: false },
  { feature: 'quinn.answer', kind: 'text', level: 'light', live: false },
  { feature: 'qtrainer.customer', kind: 'text', level: 'standard', live: false },
  { feature: 'qtrainer.voice', kind: 'voice', level: 'standard', live: false },
];

/** The default models behind each level (until the owner sets their own), best first. */
export const DEFAULT_LEVELS: Record<AiLevel, string[]> = {
  light: [
    'groq/openai/gpt-oss-20b',
    'cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct',
    'groq/openai/gpt-oss-120b',
    'groq/whisper-large-v3-turbo',
    'cloudflare/@cf/openai/whisper-large-v3-turbo',
  ],
  standard: [
    'groq/openai/gpt-oss-120b',
    'cloudflare/@cf/openai/gpt-oss-120b',
    'groq/openai/gpt-oss-20b',
    'cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct',
    'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'groq/whisper-large-v3',
    'groq/whisper-large-v3-turbo',
    'cloudflare/@cf/openai/whisper-large-v3-turbo',
  ],
  thorough: [
    'groq/openai/gpt-oss-120b',
    'cloudflare/@cf/openai/gpt-oss-120b',
    'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'groq/whisper-large-v3',
  ],
};

const kindOf = (modelId: string) => CATALOGUE.models.find((m) => m.id === modelId)?.kind ?? 'text';

/**
 * The models a task may use, best first: its level (the owner's, else its default), and that level's models (the
 * owner's list, else the default), of the kind the task needs. Null: not a known task (its job type's own list
 * applies).
 */
export function modelsFor(
  feature: string,
  owner: { levels: { level: AiLevel; models: string[] }[]; tasks: { feature: string; level: AiLevel }[] },
): { level: AiLevel; models: string[] } | null {
  const task = AI_TASKS.find((t) => t.feature === feature);
  if (!task) return null;
  const level = owner.tasks.find((t) => t.feature === feature)?.level ?? task.level;
  const list = owner.levels.find((l) => l.level === level)?.models ?? DEFAULT_LEVELS[level];
  return { level, models: list.filter((id) => kindOf(id) === task.kind) };
}
