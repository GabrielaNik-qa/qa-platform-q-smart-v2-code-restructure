// AutoQA on Quality › Conversations (admins and reviewers): score one conversation with AI, or several at once. An AI
// review counts on its own, is marked as AI and the agent can dispute it; a conversation with what looks like
// instructions to the AI is held for a person. The scorecard of the conversation's review by a person is used by
// default, so the two can be compared.
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, errorText } from './api';
import { card, type CompanyRef, field, primaryButton, smallButton } from './ui';

export interface ScorecardChoice {
  id: string;
  name: string;
}
interface AiRow {
  id: string;
  hasTranscript: boolean;
  aiReviewed: boolean;
  aiHold: string;
  humanScorecardId: string | null;
}
type Outcome =
  { status: 'reviewed'; reviewId: string; review: { score: number | null; notScored: boolean } } | { status: 'held' };

/** The reason as the person reads it (the AI company's own reason when there is one). */
function useReason() {
  const { t } = useTranslation();
  return (e: unknown) => {
    const base = errorText(t, e);
    const detail = e instanceof ApiError ? e.fields?.[0] : undefined;
    return detail
      ? `${base} ${t(`ai.problems.${detail}`, { name: 'AI', defaultValue: t('ai.problems.other', { code: detail }) })}`
      : base;
  };
}

export function AiReviewPanel({
  company,
  conversation,
  scorecards,
  onDone,
}: {
  company: CompanyRef;
  conversation: AiRow & { reviewIds: string[] };
  scorecards: ScorecardChoice[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const reason = useReason();
  const [scorecardId, setScorecardId] = useState(conversation.humanScorecardId ?? scorecards[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; reviewId?: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const out = await api<Outcome>(`/conversations/${conversation.id}/ai-review`, company.id, {
        method: 'POST',
        body: { scorecardId },
      });
      setResult(
        out.status === 'held'
          ? { ok: false, text: t('autoqa.held') }
          : {
              ok: true,
              reviewId: out.reviewId,
              text:
                out.review.notScored || out.review.score === null
                  ? t('autoqa.doneNotScored')
                  : t('autoqa.done', { score: out.review.score }),
            },
      );
      onDone();
    } catch (e) {
      setResult({ ok: false, text: reason(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!conversation.hasTranscript) return null;
  return (
    <section className="grid gap-2 rounded-s border border-bd p-3" aria-label={t('autoqa.title')}>
      <h3 className="text-sm font-semibold">{t('autoqa.title')}</h3>
      {conversation.aiHold && <p className="text-sm text-bad">{t('autoqa.heldNote')}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-mu">
          {t('autoqa.scorecard')}
          <select className={field} value={scorecardId} onChange={(e) => setScorecardId(e.target.value)}>
            {scorecards.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === conversation.humanScorecardId ? ` (${t('autoqa.sameAsPerson')})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={primaryButton} disabled={busy || !scorecardId} onClick={() => void run()}>
          {busy ? t('autoqa.running') : conversation.aiReviewed ? t('autoqa.again') : t('autoqa.score')}
        </button>
      </div>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-ok' : 'text-bad'}`}>
          {result.text}{' '}
          {result.reviewId && (
            <Link to="/review/$id" params={{ id: result.reviewId }} className="underline">
              {t('autoqa.open')} ›
            </Link>
          )}
        </p>
      )}
      <p className="text-xs text-mu">{t('autoqa.note')}</p>
    </section>
  );
}

/** Several at once: the conversations shown that have a transcript and no AI review yet, one after another. */
export function AiReviewBulk({
  company,
  rows,
  scorecards,
  onDone,
}: {
  company: CompanyRef;
  rows: AiRow[];
  scorecards: ScorecardChoice[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const reason = useReason();
  const [count, setCount] = useState(5);
  const [scorecardId, setScorecardId] = useState('same');
  const [progress, setProgress] = useState<{
    done: number;
    of: number;
    held: number;
    failed: number;
    last: string;
  } | null>(null);
  const waiting = rows.filter((r) => r.hasTranscript && !r.aiReviewed && !r.aiHold);
  if (!waiting.length || !scorecards.length) return null;

  async function run() {
    const batch = waiting.slice(0, count);
    const state = { done: 0, of: batch.length, held: 0, failed: 0, last: '' };
    setProgress({ ...state });
    for (const r of batch) {
      const card = scorecardId === 'same' ? (r.humanScorecardId ?? scorecards[0]?.id) : scorecardId;
      try {
        const out = await api<Outcome>(`/conversations/${r.id}/ai-review`, company.id, {
          method: 'POST',
          body: { scorecardId: card },
        });
        if (out.status === 'held') state.held++;
      } catch (e) {
        state.failed++;
        state.last = reason(e);
        if (e instanceof ApiError && (e.code === 'aiOff' || e.code === 'aiLimit' || e.code === 'aiReviewsNotAnnounced'))
          break;
      }
      state.done++;
      setProgress({ ...state });
    }
    onDone();
  }

  const running = progress !== null && progress.done < progress.of && !progress.last;
  return (
    <section className={`${card} grid gap-2`} aria-label={t('autoqa.bulkTitle')}>
      <h2 className="font-semibold">{t('autoqa.bulkTitle')}</h2>
      <p className="text-sm text-mu">{t('autoqa.bulkHelp', { count: waiting.length })}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-mu">
          {t('autoqa.howMany')}
          <select className={field} value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-mu">
          {t('autoqa.scorecard')}
          <select className={field} value={scorecardId} onChange={(e) => setScorecardId(e.target.value)}>
            <option value="same">{t('autoqa.sameAsPersonAll')}</option>
            {scorecards.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={smallButton} disabled={running} onClick={() => void run()}>
          {running ? t('autoqa.running') : t('autoqa.bulkRun')}
        </button>
      </div>
      {progress && (
        <p role="status" className="text-sm">
          {t('autoqa.progress', progress)}
          {progress.last && <span className="block text-bad">{progress.last}</span>}
        </p>
      )}
    </section>
  );
}
