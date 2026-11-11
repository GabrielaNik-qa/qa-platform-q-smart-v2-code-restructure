// AutoQA's AI reviews (Phase 3b, step 4; V2_PLAN §7): an admin or reviewer asks the AI to review a conversation with a
// scorecard. The AI review counts on its own, like a person's: it is scored with the same rules, marked as AI, keeps
// its proof (the model, the prompt and scorecard versions, a quote for every answer), the agent is told, and the agent
// can dispute it (a person then decides). It runs only when the company's AI is on, the agents were told in advance
// (Admin › AI › AI on or off) and the conversation's channel is allowed. A conversation with what looks like
// instructions to the AI is held for a person instead.
import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  addReview,
  aiReviewOf,
  type Db,
  getAiRules,
  getConversation,
  getReview,
  isDemoCompany,
  listStoredFields,
  logActivity,
  type Membership,
  myProfile,
  notify,
  setAiHold,
  updateReview,
  visibleScorecards,
  withCompany,
} from '@qsmart/db';
import {
  type FieldDef,
  fieldLabel,
  fieldsOf,
  LANGUAGES,
  type Language,
  type Scope,
  scopeOf,
  scoreReview,
} from '@qsmart/shared';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { AUTOQA_PROMPT_VERSION, autoqaJob, looksLikeTrick } from './ai/autoqa.js';
import { AiError, type AiEngine } from './ai/engine.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, CurrentScope, Person } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { reachOf } from './reviews.controller.js';
import { AI_ENGINE, DB } from './tokens.js';

const input = z.object({ scorecardId: z.uuid() }).strict();
const ANSWER = { yes: 'y', no: 'n', na: 'na' } as const;

/** A field's value as plain text for the AI (only the fields the company lets the AI read). */
const asText = (def: FieldDef, value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (def.type === 'dropdown' || def.type === 'multi') {
    const ids = Array.isArray(value) ? value : [value];
    return ids
      .map((id) => {
        const o = def.options.find((x) => x.id === id);
        return o ? Object.values(o.labels).find(Boolean) || o.id : String(id);
      })
      .join(', ');
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

@Controller('conversations')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class AutoqaController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  /**
   * The AI reviews the conversation with the scorecard: a new AI review, or the same one scored again. Answers
   * { status: 'reviewed', reviewId } or { status: 'held' } (looks like instructions to the AI: a person reviews it).
   */
  @Post(':id/ai-review')
  @Allow('conversations.write')
  async review(
    @CurrentMembership() membership: Membership,
    @CurrentScope() scope: Scope,
    @Person() person: VerifiedPerson,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = input.safeParse(body);
    if (!parsed.success || !z.uuid().safeParse(id).success) throw badRequest('conversationInvalid');
    const language: Language = await myProfile(this.db, person.uid).then((p) =>
      p && (LANGUAGES as readonly string[]).includes(p.language ?? '') ? (p.language as Language) : 'en',
    );

    // 1. What the AI may see, and whether it may run (behind the company wall).
    const ready = await withCompany(this.db, membership.companyId, async (tx) => {
      const reach = await reachOf(tx, membership, scope);
      const conversation = await getConversation(tx, id, reach);
      if (!conversation) throw notFound('conversationNotFound');
      if (!conversation.transcript) throw badRequest('aiReviewNoTranscript');
      if (!conversation.agentId) throw badRequest('reviewAgent');
      const rules = await getAiRules(tx);
      if (!rules.reviews.announcedAt) throw badRequest('aiReviewsNotAnnounced');
      const channels = rules.reviews.channels ?? [];
      if (channels.length && !channels.includes(conversation.channel)) throw badRequest('aiReviewsChannelOff');
      const cardScope = scopeOf(membership.role, 'scorecards.read') ?? 'own';
      const card = (await visibleScorecards(tx, membership.userId, cardScope)).find(
        (s) => s.id === parsed.data.scorecardId,
      );
      if (!card) throw badRequest('reviewScorecard');
      const defs = fieldsOf('conversation', await listStoredFields(tx)).filter((d) => d.ai && !d.hidden);
      const details = defs
        .map((d) => ({
          name: fieldLabel(d, 'en', d.builtIn ? d.key : ''),
          value: asText(d, conversation.values[d.key]),
        }))
        .filter((d) => d.value);
      if (conversation.channel !== 'other') details.unshift({ name: 'channel', value: conversation.channel });
      else if (conversation.channelName) details.unshift({ name: 'channel', value: conversation.channelName });
      return { conversation, card, details, demo: await isDemoCompany(tx) };
    });
    const { conversation, card } = ready;

    const hold = async () => {
      await withCompany(this.db, membership.companyId, async (tx) => {
        await setAiHold(tx, conversation.id, 'injection');
        await logActivity(tx, actorOf(membership), { action: 'aiReviewHeld', targetName: conversation.agentName });
      });
      return { status: 'held' as const };
    };

    // 2. A trick written into the conversation: held for a person before the AI even sees it.
    if (looksLikeTrick(conversation.transcript ?? '')) return hold();

    // 3. The AI review (outside the company's transaction: it can take a while).
    const job = autoqaJob({
      categories: card.categories,
      transcript: conversation.transcript ?? '',
      details: ready.details,
      language,
    });
    let result;
    try {
      result = await this.engine.run({
        type: job.type,
        companyId: membership.companyId,
        dataClass: ready.demo ? 'test' : 'client',
        teamId: conversation.teamId,
        system: job.system,
        prompt: job.prompt,
        language,
      });
    } catch (e) {
      if (e instanceof AiError) throw badRequest(e.code, e.detail ? [e.detail] : undefined);
      throw e;
    }
    if (result.data.injection) return hold();

    // 4. Scored with the same rules as a person's review, then saved as an AI review with its proof.
    const byId = new Map(result.data.answers.map((a) => [a.id, a]));
    const answers = card.categories.map((c, ci) =>
      c.questions.map((_, qi) => {
        const a = byId.get(`c${ci + 1}q${qi + 1}`);
        return {
          answer: ANSWER[a?.answer ?? 'no'],
          comment: [a?.why ?? '', a?.answer === 'no' && a.tip ? a.tip : ''].filter(Boolean).join(' '),
        };
      }),
    );
    const proof = card.categories.map((c, ci) =>
      c.questions.map((_, qi) => {
        const a = byId.get(`c${ci + 1}q${qi + 1}`);
        return { quote: a?.quote ?? '', why: a?.why ?? '', tip: a?.answer === 'no' ? (a.tip ?? '') : '' };
      }),
    );
    const scored = scoreReview(card.categories, answers);
    const ai = {
      provider: result.provider,
      model: result.model,
      promptVersion: AUTOQA_PROMPT_VERSION,
      scorecardUpdatedAt: card.updatedAt.toISOString(),
      proof,
      summary: result.data.summary,
      attempt: result.attempt,
    };

    return withCompany(this.db, membership.companyId, async (tx) => {
      const existing = await aiReviewOf(tx, conversation.id, card.id);
      const fields = {
        categories: scored.categories,
        score: scored.score,
        zero: scored.zero,
        notScored: scored.notScored,
        comment: result.data.summary,
        ai,
      };
      let reviewId = existing;
      if (existing) await updateReview(tx, existing, fields);
      else
        reviewId = await addReview(tx, {
          leadId: String(conversation.values['reference'] ?? '').slice(0, 60) || conversation.id.slice(0, 8),
          agentId: conversation.agentId,
          agentName: conversation.agentName,
          teamId: conversation.teamId,
          teamName: conversation.teamName,
          reviewedOn: new Date().toISOString().slice(0, 10),
          channel: conversation.channel,
          channelName: conversation.channelName,
          scorecardId: card.id,
          scorecardName: card.name,
          flag: '',
          campaign: '',
          leadLink: '',
          recordingLink: '',
          conversationLink: conversation.link,
          transcript: '',
          emailSubject: '',
          reviewerId: null,
          reviewerName: 'AutoQA',
          reviewSeconds: null,
          conversationId: conversation.id,
          source: 'ai',
          ...fields,
        });
      if (!reviewId) throw new Error('The AI review was not saved.');
      await setAiHold(tx, conversation.id, '');
      if (conversation.agentId)
        await notify(
          tx,
          conversation.agentId,
          'aiReviewNew',
          {
            lead: String(conversation.values['reference'] ?? ''),
            score: scored.notScored || scored.score === null ? '' : String(scored.score),
            channel: conversation.channel,
          },
          `/review/${reviewId}`,
        );
      await logActivity(tx, actorOf(membership), {
        action: existing ? 'aiReviewAgain' : 'aiReviewAdded',
        targetName: conversation.agentName,
        details: { model: result.model },
      });
      return { status: 'reviewed' as const, reviewId, review: await getReview(tx, reviewId, { all: true }) };
    });
  }
}
