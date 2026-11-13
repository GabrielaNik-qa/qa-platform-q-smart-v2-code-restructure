// A free plan's limits, checked before a call is sent (Phase 5, step 1 of the AI work): requests and tokens per minute
// and per day (and audio per hour and per day for speech), per model, never one AI company's figures for another.
// Where each figure comes from, in this order:
// 1. the AI company's own figures for the account, sent with its last answer (Groq: requests per day and tokens per
//    minute, with what is left and when it is full again) while they are still current;
// 2. the limits it publishes for the model (catalogue.ts, with the date they were read), against Q-smart's own count
//    of the calls in its log.
// A call that would go over a limit is not sent: the engine tries the next model, or says how long to wait. Only for a
// free plan; a paid plan's limits are much higher and are left to the AI company's own "too many requests".
import type { AiUseWindow, SeenLimits } from '@qsmart/db';
import type { FreeLimits } from './catalogue.js';

export type LimitKind = 'rpm' | 'rpd' | 'tpm' | 'tpd' | 'ash' | 'asd';
export type LimitStatus = 'available' | 'approaching' | 'reached';
export interface LimitRow {
  kind: LimitKind;
  limit: number;
  used: number;
  /** account: the AI company's own figure for this account; published: its published limit with our own count */
  source: 'account' | 'published';
  /** when the window is free again (null: nothing used in it) */
  freeAt: Date | null;
}
export interface Pace {
  rows: LimitRow[];
  /** 0: the call may go now; otherwise how long until it may */
  waitMs: number;
  status: LimitStatus;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Groq's own durations: "25.5s", "41m45.6s", "450ms" */
export function durationMs(text: string | undefined): number | null {
  const t = text?.trim();
  if (!t) return null;
  const parts = [...t.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (!parts.length || parts.map((p) => p[0]).join('') !== t) return null;
  const unit = { h: HOUR, m: MINUTE, s: 1000, ms: 1 } as const;
  return Math.round(parts.reduce((sum, p) => sum + Number(p[1]) * unit[p[2] as keyof typeof unit], 0));
}

/** "Approaching" from 80% of a limit. */
const APPROACHING = 0.8;

/**
 * Whether a call of about `tokens` tokens (and `audioSeconds` of audio) may go now, and every limit as it stands.
 * `seen` is the AI company's last figures for this model (or undefined).
 */
export function paceOf(input: {
  limits: FreeLimits | undefined;
  use: AiUseWindow;
  seen: SeenLimits | undefined;
  tokens: number;
  audioSeconds?: number;
  now: number;
}): Pace {
  const { limits, use, seen, now } = input;
  const rows: LimitRow[] = [];
  let waitMs = 0;
  const after = (since: Date | null, span: number) => (since ? new Date(since.getTime() + span) : null);
  const wait = (until: Date | null) => {
    if (until) waitMs = Math.max(waitMs, until.getTime() - now);
  };
  // the AI company's own figure, while it is current: limit, what is left, and when it is full again
  const account = (kind: 'requests' | 'tokens') => {
    if (!seen) return null;
    const limit = Number(seen.limits[`x-ratelimit-limit-${kind}`]);
    const left = Number(seen.limits[`x-ratelimit-remaining-${kind}`]);
    const reset = durationMs(seen.limits[`x-ratelimit-reset-${kind}`]);
    if (!Number.isFinite(limit) || !Number.isFinite(left) || limit <= 0 || reset === null) return null;
    const fullAt = new Date(seen.seenAt.getTime() + reset);
    // past its reset time, the account's window is full again: Q-smart's own count takes over
    return fullAt.getTime() > now ? { limit, left, fullAt } : { limit, left: limit, fullAt: null };
  };

  // requests per minute (published), with our own count
  if (limits?.rpm) {
    const freeAt = after(use.minute.since, MINUTE);
    rows.push({ kind: 'rpm', limit: limits.rpm, used: use.minute.requests, source: 'published', freeAt });
    if (use.minute.requests + 1 > limits.rpm) wait(freeAt);
  }
  // requests per day: Groq's own figure (x-ratelimit-*-requests is per day), else published with our own count
  const rpd = account('requests');
  if (rpd) {
    rows.push({ kind: 'rpd', limit: rpd.limit, used: rpd.limit - rpd.left, source: 'account', freeAt: rpd.fullAt });
    if (rpd.left < 1) wait(rpd.fullAt);
  } else if (limits?.rpd) {
    const freeAt = after(use.day.since, DAY);
    rows.push({ kind: 'rpd', limit: limits.rpd, used: use.day.requests, source: 'published', freeAt });
    if (use.day.requests + 1 > limits.rpd) wait(freeAt);
  }
  // tokens per minute: Groq's own figure (x-ratelimit-*-tokens is per minute), else published with our own count
  const tpm = account('tokens');
  if (tpm) {
    rows.push({ kind: 'tpm', limit: tpm.limit, used: tpm.limit - tpm.left, source: 'account', freeAt: tpm.fullAt });
    if (input.tokens > tpm.left) wait(tpm.fullAt);
  } else if (limits?.tpm) {
    const freeAt = after(use.minute.since, MINUTE);
    rows.push({ kind: 'tpm', limit: limits.tpm, used: use.minute.tokens, source: 'published', freeAt });
    if (use.minute.tokens + input.tokens > limits.tpm) wait(freeAt);
  }
  // tokens per day (published only: no AI company sends it), with our own count
  if (limits?.tpd) {
    const freeAt = after(use.day.since, DAY);
    rows.push({ kind: 'tpd', limit: limits.tpd, used: use.day.tokens, source: 'published', freeAt });
    if (use.day.tokens + input.tokens > limits.tpd) wait(freeAt);
  }
  // audio seconds per hour and per day (speech), with our own count
  const audio = input.audioSeconds ?? 0;
  if (limits?.ash) {
    const freeAt = after(use.hour.since, HOUR);
    rows.push({ kind: 'ash', limit: limits.ash, used: use.hour.audioSeconds, source: 'published', freeAt });
    if (use.hour.audioSeconds + audio > limits.ash) wait(freeAt);
  }
  if (limits?.asd) {
    const freeAt = after(use.day.since, DAY);
    rows.push({ kind: 'asd', limit: limits.asd, used: use.day.audioSeconds, source: 'published', freeAt });
    if (use.day.audioSeconds + audio > limits.asd) wait(freeAt);
  }
  // a wait that is due already (the window has just freed up): nothing to wait for
  if (waitMs > 0) waitMs = Math.max(1000, waitMs);
  const status: LimitStatus =
    waitMs > 0 || rows.some((r) => r.used >= r.limit)
      ? 'reached'
      : rows.some((r) => r.used >= r.limit * APPROACHING)
        ? 'approaching'
        : 'available';
  return { rows, waitMs, status };
}

/** The tokens a call will probably use: what is sent, and the model's usual answer (at most the job's maximum). */
export const expectedTokens = (inputTokens: number, usualOutput: number | null, maxOutput: number) =>
  inputTokens + Math.min(maxOutput, usualOutput ?? Math.min(maxOutput, 1500));
