// One review (today's review pop-up, as a page): the score and whether it passed, every answer with its comment and
// root cause, the links and the transcript. Staff edit it (admins and reviewers), remind the agent or delete it; the
// agent opening their own review marks it as seen.
import { can, passes } from '@qsmart/shared';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { when } from './Activity';
import { DisputeBox } from './Disputes';
import { currentLanguage } from './i18n';
import { NotFound } from './PageView';
import { type PassRates, passRateFor, QAEntry, type ReviewRow } from './QAEntry';
import { useSession } from './session';
import { card, dangerButton, Notice, smallButton, useAction } from './ui';

export function ReviewView() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const navigate = useNavigate();
  const { id } = useParams({ from: '/review/$id' });
  const { company } = useSession();
  const [review, setReview] = useState<ReviewRow | null | undefined>(undefined);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [editing, setEditing] = useState(false);
  const { message, run } = useAction();

  const load = useCallback(() => {
    if (!company) return;
    api<ReviewRow>(`/reviews/${id}`, company.id).then(
      (r) => {
        setReview(r);
        // the agent opening their own review marks it as seen (today's rule)
        if (company.role === 'agent' && !r.seenAt)
          void api(`/reviews/${id}/seen`, company.id, { method: 'POST', body: {} }).catch(() => undefined);
      },
      () => setReview(null),
    );
    api<PassRates>('/pass-rates', company.id).then(setRates, () => undefined);
  }, [company, id]);
  useEffect(load, [load]);

  if (!company || review === null) return <NotFound />;
  if (!review) return <p className="text-mu">{t('common.loading')}</p>;
  if (editing)
    return (
      <QAEntry
        company={company}
        editing={review}
        onDone={() => {
          setEditing(false);
          load();
        }}
      />
    );

  const staff = can(company.role, 'reviews.write');
  const rate = passRateFor(rates, review.teamId);
  const passed = passes(review.score, rate);
  const answer = (a: string) => t(`reviews.${a === 'y' ? 'yes' : a === 'n' ? 'no' : 'na'}`);
  const facts: [string, string][] = [
    [t('reviews.agent'), review.agentName],
    [t('reviews.team'), review.teamName || '-'],
    [t('reviews.date'), review.reviewedOn],
    [
      t('reviews.reviewType'),
      t(`reviews.channels.${review.channel}`) + (review.channelName ? ` (${review.channelName})` : ''),
    ],
    [t('reviews.scorecard'), review.scorecardName],
    [t('reviews.reviewer'), review.reviewerName],
    [t('reviews.campaign'), review.campaign || '-'],
    [t('reviews.seen'), review.seenAt ? when(review.seenAt, lang) : t('reviews.notSeen')],
  ];
  const links: [string, string][] = (
    [
      [t('reviews.leadLink'), review.leadLink],
      [t('reviews.recordingLink'), review.recordingLink],
      [review.channel === 'call' ? '' : t(`reviews.conversationLink.${review.channel}`), review.conversationLink],
    ] as [string, string][]
  ).filter(([, url]) => url);
  return (
    <section className="grid gap-4 max-w-4xl" aria-labelledby="review-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-mu">{t('menu.pages.calls')}</p>
          <h1 id="review-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('reviews.lead', { id: review.leadId })}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallButton} onClick={() => history.back()}>
            {t('reviews.back')}
          </button>
          {staff && (
            <>
              <button type="button" className={smallButton} onClick={() => setEditing(true)}>
                {t('common.edit')}
              </button>
              {!review.seenAt && review.agentId && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() =>
                    void run(
                      () => api(`/reviews/${review.id}/remind`, company.id, { method: 'POST', body: {} }),
                      t('reviews.reminded'),
                    )
                  }
                >
                  {t('reviews.remind')}
                </button>
              )}
              <button
                type="button"
                className={dangerButton}
                onClick={() => {
                  if (!window.confirm(t('reviews.confirmDelete'))) return;
                  void run(
                    () => api(`/reviews/${review.id}`, company.id, { method: 'DELETE' }),
                    t('reviews.deleted'),
                  ).then((ok) => {
                    if (ok) void navigate({ to: '/$app/$page', params: { app: 'quality', page: 'reviews' } });
                  });
                }}
              >
                {t('common.delete')}
              </button>
            </>
          )}
        </div>
      </div>
      <Notice message={message} />
      <div className="grid gap-4 md:grid-cols-[220px_1fr] items-start">
        <div className={`${card} text-center grid gap-1`}>
          <div className="text-sm text-mu">{t('reviews.score')}</div>
          <div className={`font-display text-5xl font-bold ${review.notScored ? '' : passed ? 'text-ok' : 'text-bad'}`}>
            {review.notScored ? '-' : `${review.score}%`}
          </div>
          {!review.notScored && (
            <div className="font-semibold">{passed ? t('reviews.passed') : t('reviews.failed')}</div>
          )}
          <small className="text-mu">{t('reviews.passRate', { rate })}</small>
          {review.zero && <p className="text-sm text-bad font-semibold">{t('reviews.criticalFailure')}</p>}
          {review.notScored && <p className="text-sm text-mu">{t('reviews.notScored')}</p>}
          {review.flag && (
            <p className={`text-sm font-semibold ${review.flag === 'red' ? 'text-bad' : 'text-ok'}`}>
              {t('reviews.flag')}: {t(`reviews.flags.${review.flag}`)}
            </p>
          )}
        </div>
        <dl className={`${card} grid gap-3 sm:grid-cols-2 text-sm`}>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-mu">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
          {links.map(([k, url]) => (
            <div key={k}>
              <dt className="text-mu">{k}</dt>
              <dd>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ac font-semibold break-all hover:underline"
                >
                  {url}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {review.source === 'ai' && review.ai && (
        <section className={`${card} grid gap-1 border-ac`} aria-label={t('autoqa.badge')}>
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="rounded-full bg-ac/15 px-2 py-0.5 text-xs">{t('autoqa.badge')}</span>
            {t('autoqa.madeBy', { model: review.ai.model })}
          </p>
          <p className="text-sm text-mu">{t('autoqa.counts')}</p>
          <p className="text-xs text-mu">{t('autoqa.versions', { prompt: review.ai.promptVersion })}</p>
        </section>
      )}
      {review.categories.map((c, ci) => (
        <section key={ci} className={`${card} grid gap-2`} aria-label={c.name}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{c.name}</h2>
            <b className={`font-mono text-sm ${c.zeroed ? 'text-bad' : ''}`}>
              {c.earned} / {c.possible}
            </b>
          </div>
          <ul className="grid gap-1 text-sm">
            {c.questions.map((q, qi) => (
              <li key={qi} className="grid gap-0.5 border-t border-bd pt-1">
                <div className="flex justify-between gap-3">
                  <span>{q.text}</span>
                  <b className={q.answer === 'n' ? 'text-bad' : q.answer === 'y' ? 'text-ok' : 'text-mu'}>
                    {answer(q.answer)}
                  </b>
                </div>
                {review.ai?.proof[ci]?.[qi]?.quote && (
                  <q className="text-xs italic text-mu" title={t('autoqa.quote')}>
                    {review.ai.proof[ci]?.[qi]?.quote}
                  </q>
                )}
                {(q.comment || q.rootCause) && (
                  <small className="text-mu">
                    {q.comment}
                    {q.rootCause && ` · ${t('reviews.rootCause')}: ${q.rootCause}`}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {review.comment && (
        <section className={card}>
          <h2 className="font-semibold">{t('reviews.generalComments')}</h2>
          <p className="text-sm whitespace-pre-wrap">{review.comment}</p>
        </section>
      )}
      {review.transcript && (
        <details className={card}>
          <summary className="font-semibold cursor-pointer">
            {t(`reviews.transcript.${review.channel === 'call' ? 'other' : review.channel}`)}
          </summary>
          <p className="text-sm whitespace-pre-wrap mt-2">{review.transcript}</p>
        </details>
      )}
      <DisputeBox company={company} review={review} onChange={load} />
    </section>
  );
}
