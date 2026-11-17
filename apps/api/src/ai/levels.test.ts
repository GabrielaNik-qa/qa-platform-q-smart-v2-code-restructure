// Effort levels: each task gets the models of its level (the owner's list, or the default), of the kind it needs.
import { describe, expect, it } from 'vitest';
import { AI_TASKS, DEFAULT_LEVELS, modelsFor } from './levels.js';

const none = { levels: [], tasks: [] };

describe('effort levels', () => {
  it('gives each task its default level and only the kind of model it needs', () => {
    expect(modelsFor('autoqa.score', none)).toEqual({
      level: 'standard',
      models: DEFAULT_LEVELS.standard.filter((id) => !id.includes('whisper')),
    });
    expect(modelsFor('speech.transcribe', none)?.models.every((id) => id.includes('whisper'))).toBe(true);
    expect(modelsFor('qtrainer.voice', none)).toEqual({ level: 'standard', models: [] }); // no voice model yet
    expect(modelsFor('something.else', none)).toBeNull();
    expect(AI_TASKS.filter((t) => t.live).map((t) => t.feature)).toEqual([
      'autoqa.score',
      'speech.transcribe',
      'speech.speakers',
    ]);
  });

  it("follows the owner's level for a task and the owner's models for a level, in their order", () => {
    const owner = {
      levels: [{ level: 'thorough' as const, models: ['cloudflare/@cf/openai/gpt-oss-120b', 'groq/whisper-large-v3'] }],
      tasks: [{ feature: 'autoqa.score', level: 'thorough' as const }],
    };
    expect(modelsFor('autoqa.score', owner)).toEqual({
      level: 'thorough',
      models: ['cloudflare/@cf/openai/gpt-oss-120b'],
    });
    // a level the owner didn't set keeps its default
    expect(modelsFor('speech.speakers', owner)?.models).toEqual(
      DEFAULT_LEVELS.light.filter((id) => !id.includes('whisper')),
    );
  });
});
