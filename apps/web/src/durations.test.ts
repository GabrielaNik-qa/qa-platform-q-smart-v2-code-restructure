// Groq says when a limit resets as "2m59.56s", "7.66s" or "120ms": read as milliseconds.
import { describe, expect, it } from 'vitest';
import { durationMs } from './durations';

describe('durations', () => {
  it("reads Groq's reset times", () => {
    expect(durationMs('7.66s')).toBe(7660);
    expect(durationMs('2m59.56s')).toBe(179_560);
    expect(durationMs('1h2m3s')).toBe(3_723_000);
    expect(durationMs('120ms')).toBe(120);
    expect(durationMs('soon')).toBeNull();
    expect(durationMs(undefined)).toBeNull();
  });
});
