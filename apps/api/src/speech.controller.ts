// Speech-to-text (V2_PLAN, Phase 3b, brought forward on 11 November): a call recording uploaded on Conversations
// becomes a transcript. The recording arrives as the request's body, stays in memory for the AI call and is never
// written anywhere (CLAUDE.md: call recordings are never stored); only the transcript goes back to the page, which
// saves it with the conversation like a pasted one. Admins and reviewers only (the same right as adding a
// conversation), through the AI engine and its rules: no-training AI companies only, the company's choices, limits.
import { Body, Controller, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { type Db, isDemoCompany, type Membership, withCompany } from '@qsmart/db';
import { z } from 'zod';
import { AiError, type AiEngine } from './ai/engine.js';
import { SPEECH_TO_TEXT } from './ai/jobs.js';
import { MAX_SPEAKER_SEGMENTS, type Speaker, speakersJob, transcriptOf } from './ai/speech.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest } from './errors.js';
import { AI_ENGINE, DB } from './tokens.js';

/** The largest recording (Groq's free plan takes 25 MB). */
export const MAX_RECORDING_BYTES = 25 * 1024 * 1024;
/** The kinds of recording accepted (the browser's type for the file, or "any file"). */
export const RECORDING_TYPES = /^(audio\/[\w.+-]+|video\/(mp4|webm|mpeg)|application\/octet-stream)$/;

const query = z.object({
  language: z
    .string()
    .regex(/^[a-z]{2}$/)
    .optional(),
});

@Controller('speech')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class SpeechController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  /** The recording in, its transcript out: "[0:05] Agent: …" lines, with the speakers named when that worked. */
  @Post('transcribe')
  @Allow('conversations.write')
  @HttpCode(200)
  async transcribe(
    @CurrentMembership() membership: Membership,
    @Query() raw: Record<string, string>,
    @Body() body: unknown,
  ) {
    const params = query.safeParse(raw);
    if (!params.success) throw badRequest('recordingInvalid');
    if (!Buffer.isBuffer(body) || body.length < 100) throw badRequest('recordingInvalid');
    if (body.length > MAX_RECORDING_BYTES) throw badRequest('recordingTooBig');
    const dataClass = (await withCompany(this.db, membership.companyId, (tx) => isDemoCompany(tx))) ? 'test' : 'client';
    const common = { companyId: membership.companyId, dataClass } as const;

    let heard;
    try {
      heard = await this.engine.transcribe({
        ...common,
        type: SPEECH_TO_TEXT,
        audio: new Uint8Array(body.buffer, body.byteOffset, body.length),
        ...(params.data.language ? { speechLanguage: params.data.language } : {}),
      });
    } catch (e) {
      if (e instanceof AiError) throw badRequest(e.code, e.detail ? [e.detail] : undefined);
      throw e;
    }
    const segments = heard.segments.length ? heard.segments : [{ start: 0, end: heard.seconds, text: heard.text }];

    // who speaks each part: best effort (without it, the transcript keeps its times)
    let speakers: Speaker[] | undefined;
    if (segments.length >= 2 && segments.length <= MAX_SPEAKER_SEGMENTS) {
      const job = speakersJob(segments);
      speakers = await this.engine
        .run({ ...common, type: job.type, system: job.system, prompt: job.prompt })
        .then((r) => r.data.speakers)
        .catch(() => undefined);
    }
    return {
      transcript: transcriptOf(segments, speakers),
      language: /^[a-z]{2}$/.test(heard.language ?? '') ? heard.language : (params.data.language ?? ''),
      seconds: heard.seconds,
      provider: heard.provider,
      model: heard.model,
      speakers: Boolean(speakers),
    };
  }
}
