// A free plan's limits before a call is sent: the AI company's own figures first, its published ones with our own
// count otherwise; the wait until a window is free; and the status shown in Admin › AI.
import type { AiUseWindow, SeenLimits } from '@qsmart/db';
import { describe, expect, it } from 'vitest';
import type { FreeLimits } from './catalogue.js';
import { durationMs, expectedTokens, paceOf } from './pacing.js';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms);
const GROQ: FreeLimits = { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200_000, checked: '2026-11-13', source: 'test' };
const quiet: AiUseWindow = {
  minute: { requests: 0, tokens: 0, since: null },
  hour: { audioSeconds: 0, since: null },
  day: { requests: 0, tokens: 0, audioSeconds: 0, since: null },
  outputTokens: null,
};
const seen = (limits: Record<string, string>, at = ago(5000)): SeenLimits => ({
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  limits,
  seenAt: at,
});

describe('a free plan’s limits', () => {
  it('reads Groq’s durations', () => {
    expect(durationMs('25.5s')).toBe(25_500);
    expect(durationMs('41m45.6s')).toBe(2_505_600);
    expect(durationMs('450ms')).toBe(450);
    expect(durationMs('soon')).toBeNull();
  });

  it('lets a call go when every limit has room, and says which figures are the account’s own', () => {
    const p = paceOf({
      limits: GROQ,
      use: quiet,
      seen: seen({
        'x-ratelimit-limit-requests': '1000',
        'x-ratelimit-remaining-requests': '992',
        'x-ratelimit-reset-requests': '11m31.2s',
        'x-ratelimit-limit-tokens': '8000',
        'x-ratelimit-remaining-tokens': '7000',
        'x-ratelimit-reset-tokens': '7.5s',
      }),
      tokens: 3000,
      now: NOW,
    });
    expect(p).toMatchObject({ waitMs: 0, status: 'available' });
    expect(p.rows.map((r) => [r.kind, r.source, r.used])).toEqual([
      ['rpm', 'published', 0],
      ['rpd', 'account', 8],
      ['tpm', 'account', 1000],
      ['tpd', 'published', 0],
    ]);
  });

  it('waits for Groq’s own tokens per minute when the call would not fit', () => {
    const p = paceOf({
      limits: GROQ,
      use: quiet,
      seen: seen({
        'x-ratelimit-limit-tokens': '8000',
        'x-ratelimit-remaining-tokens': '1508',
        'x-ratelimit-reset-tokens': '48.69s',
      }),
      tokens: 3000,
      now: NOW,
    });
    // seen 5 seconds ago, full again 48.69 seconds after that
    expect(p.waitMs).toBe(43_690);
    expect(p.status).toBe('reached');
  });

  it('uses the published limits with our own count once Groq’s figures are out of date', () => {
    const old = seen(
      { 'x-ratelimit-limit-tokens': '8000', 'x-ratelimit-remaining-tokens': '0', 'x-ratelimit-reset-tokens': '30s' },
      ago(120_000),
    );
    const busy: AiUseWindow = {
      ...quiet,
      minute: { requests: 2, tokens: 6500, since: ago(20_000) },
      day: { requests: 2, tokens: 6500, audioSeconds: 0, since: ago(20_000) },
    };
    const p = paceOf({ limits: GROQ, use: busy, seen: old, tokens: 3000, now: NOW });
    // Groq's figure is past its reset: 0 used of its own 8,000; then the call may go
    expect(p.rows.find((r) => r.kind === 'tpm')).toMatchObject({ source: 'account', used: 0 });
    expect(p.waitMs).toBe(0);
    // with no figure from Groq at all: 6,500 + 3,000 > 8,000, wait until the oldest call is a minute old
    expect(paceOf({ limits: GROQ, use: busy, seen: undefined, tokens: 3000, now: NOW }).waitMs).toBe(40_000);
  });

  it('stops at the tokens per day and the requests per minute, and says when it is close', () => {
    const day: AiUseWindow = {
      ...quiet,
      day: { requests: 60, tokens: 198_000, audioSeconds: 0, since: ago(3_600_000) },
    };
    expect(paceOf({ limits: GROQ, use: day, seen: undefined, tokens: 3000, now: NOW }).waitMs).toBe(82_800_000);
    const minute: AiUseWindow = { ...quiet, minute: { requests: 30, tokens: 100, since: ago(50_000) } };
    expect(paceOf({ limits: GROQ, use: minute, seen: undefined, tokens: 10, now: NOW }).waitMs).toBe(10_000);
    const close: AiUseWindow = { ...quiet, day: { requests: 10, tokens: 170_000, audioSeconds: 0, since: ago(1000) } };
    expect(paceOf({ limits: GROQ, use: close, seen: undefined, tokens: 10, now: NOW }).status).toBe('approaching');
  });

  it('counts audio per hour and per day for speech, and nothing for a model without published limits', () => {
    const speech: FreeLimits = { rpm: 20, rpd: 2000, ash: 7200, asd: 28_800, checked: '2026-11-13', source: 'test' };
    const hour: AiUseWindow = { ...quiet, hour: { audioSeconds: 7200, since: ago(600_000) } };
    expect(paceOf({ limits: speech, use: hour, seen: undefined, tokens: 0, audioSeconds: 60, now: NOW }).waitMs).toBe(
      3_000_000,
    );
    expect(paceOf({ limits: undefined, use: quiet, seen: undefined, tokens: 99_999, now: NOW })).toEqual({
      rows: [],
      waitMs: 0,
      status: 'available',
    });
  });

  it('expects a call to use what is sent plus the model’s usual answer, at most the job’s maximum', () => {
    expect(expectedTokens(2000, 900, 4000)).toBe(2900);
    expect(expectedTokens(2000, null, 4000)).toBe(3500);
    expect(expectedTokens(2000, 900, 500)).toBe(2500);
  });
});
