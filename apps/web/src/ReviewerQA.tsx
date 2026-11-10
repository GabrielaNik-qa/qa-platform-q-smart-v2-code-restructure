// Quality › Reviewer QA, as today: checks of reviews made by someone else (four yes/no questions and a note). The
// "Reviewers" table gives each reviewer's score (the share of "yes"); "Latest checks" lists the last 50. Admins,
// reviewers and team leads check, change and delete; trainers read. Nobody checks their own reviews.
import { can } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Icon } from './icon';
import type { ReviewRow } from './QAEntry';
import { useSession } from './session';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, smallButton, useAction } from './ui';

const QUESTIONS = ['fair', 'follows', 'critical', 'useful'] as const;
type Question = (typeof QUESTIONS)[number];
interface Check {
  id: string;
  reviewId: string | null;
  leadId: string;
  reviewedOn: string;
  agentName: string;
  reviewerId: string | null;
  reviewerName: string;
  fair: boolean;
  follows: boolean;
  critical: boolean;
  useful: boolean;
  note: string;
  byName: string;
}
/** today's score of a check: the share of "yes" */
const scoreOf = (c: Pick<Check, Question>) =>
  Math.round((QUESTIONS.filter((q) => c[q]).length / QUESTIONS.length) * 100);
const average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
const color = (score: number) => (score >= 80 ? 'text-ok' : score >= 60 ? 'text-wn' : 'text-bad');
const th = 'py-1 pr-3 font-semibold uppercase text-xs tracking-wide text-left text-mu';
const td = 'py-1.5 pr-3 align-top';

export function ReviewerQA({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { me } = useSession();
  const writer = can(company.role, 'reviewerQa.write');
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [myId, setMyId] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<Check | 'new' | null>(null);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<Check[]>('/reviewer-checks', company.id),
      api<ReviewRow[]>('/reviews', company.id),
      api<PersonRow[]>('/people', company.id),
    ]).then(([c, r, ppl]) => {
      setChecks(c);
      setReviews(r);
      setMyId(ppl.find((p) => p.email === me.email)?.membershipId);
    }, fail);
  }, [company.id, me.email, fail]);
  useEffect(load, [load]);

  /** each reviewer's checks, best score first */
  const byReviewer = new Map<string, number[]>();
  for (const c of checks ?? []) byReviewer.set(c.reviewerName, [...(byReviewer.get(c.reviewerName) ?? []), scoreOf(c)]);
  const reviewerRows = [...byReviewer.entries()].sort((a, b) => average(b[1]) - average(a[1]));
  const mine = (c: Check) => Boolean(myId && c.reviewerId === myId);

  return (
    <section className="grid gap-4" aria-labelledby="revqa-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="revqa-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.cs_revqa')}
          </h1>
          <p className="text-sm text-mu">{t('revqa.intro')}</p>
        </div>
        {writer && (
          <button type="button" className={primaryButton} onClick={() => setEditing('new')}>
            {t('revqa.check')}
          </button>
        )}
      </div>
      <Notice message={message} />
      {!checks && <p className="text-mu">{t('common.loading')}</p>}
      {checks && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start">
          <section className={`${card} grid gap-2`} aria-labelledby="revqa-reviewers">
            <h2 id="revqa-reviewers" className="font-display text-lg font-bold">
              {t('revqa.reviewers')}
            </h2>
            {reviewerRows.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>{t('revqa.reviewer')}</th>
                    <th className={th}>{t('revqa.checks')}</th>
                    <th className={th}>{t('revqa.score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewerRows.map(([name, scores]) => (
                    <tr key={name} className="border-t border-bd">
                      <td className={td}>
                        <b>{name}</b>
                      </td>
                      <td className={td}>{scores.length}</td>
                      <td className={`${td} font-mono font-bold ${color(average(scores))}`}>
                        {Math.round(average(scores))}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-mu">{t('revqa.none')}</p>
            )}
          </section>
          <section className={`${card} grid gap-2`} aria-labelledby="revqa-latest">
            <h2 id="revqa-latest" className="font-display text-lg font-bold">
              {t('revqa.latest')}
            </h2>
            {checks.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>{t('revqa.review')}</th>
                      <th className={th}>{t('revqa.score')}</th>
                      <th className={th}>{t('revqa.note')}</th>
                      {writer && <th className={th} />}
                    </tr>
                  </thead>
                  <tbody>
                    {checks.slice(0, 50).map((c) => (
                      <tr key={c.id} className="border-t border-bd">
                        <td className={td}>
                          {c.reviewId ? (
                            <Link
                              to="/review/$id"
                              params={{ id: c.reviewId }}
                              className="font-semibold text-ac hover:underline"
                            >
                              {t('revqa.lead', { id: c.leadId })}
                            </Link>
                          ) : (
                            <b>{t('revqa.lead', { id: c.leadId })}</b>
                          )}
                          <br />
                          <small className="text-mu">
                            {c.agentName} · {c.reviewerName}
                          </small>
                        </td>
                        <td className={`${td} font-mono font-bold ${color(scoreOf(c))}`}>{scoreOf(c)}%</td>
                        <td className={td}>
                          <small className="whitespace-pre-wrap">{c.note}</small>
                        </td>
                        {writer && (
                          <td className={`${td} whitespace-nowrap`}>
                            {!mine(c) && (
                              <>
                                <button
                                  type="button"
                                  className="inline-grid place-items-center size-8 rounded-s hover:bg-pn2"
                                  title={t('revqa.change')}
                                  aria-label={`${t('revqa.change')}: ${c.leadId}`}
                                  onClick={() => setEditing(c)}
                                >
                                  <Icon name="pen" />
                                </button>
                                <button
                                  type="button"
                                  className="inline-grid place-items-center size-8 rounded-s text-bad hover:bg-pn2"
                                  title={t('common.delete')}
                                  aria-label={`${t('common.delete')}: ${c.leadId}`}
                                  onClick={() => {
                                    if (window.confirm(t('revqa.confirmDelete')))
                                      void run(
                                        () => api(`/reviewer-checks/${c.id}`, company.id, { method: 'DELETE' }),
                                        t('revqa.deleted'),
                                        load,
                                      );
                                  }}
                                >
                                  <Icon name="bin" />
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-mu">{t('revqa.none')}</p>
            )}
          </section>
        </div>
      )}
      {editing && (
        <CheckWindow
          company={company}
          editing={editing === 'new' ? undefined : editing}
          reviews={reviews.filter((r) => r.reviewerId !== myId)}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            void run(async () => undefined, text, load);
          }}
        />
      )}
    </section>
  );
}

/** "Check a review" / "Change the check": the review, the four questions and the note. */
function CheckWindow({
  company,
  editing,
  reviews,
  onClose,
  onSaved,
}: {
  company: CompanyRef;
  editing: Check | undefined;
  reviews: ReviewRow[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [d, setD] = useState({
    reviewId: editing?.reviewId ?? '',
    fair: editing?.fair ?? true,
    follows: editing?.follows ?? true,
    critical: editing?.critical ?? true,
    useful: editing?.useful ?? true,
    note: editing?.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const { message, fail } = useAction();

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return; // a double-click on Save must not add the check twice
    setBusy(true);
    try {
      const { reviewId: _review, ...answers } = d;
      if (editing) await api(`/reviewer-checks/${editing.id}`, company.id, { method: 'PUT', body: answers });
      else await api('/reviewer-checks', company.id, { method: 'POST', body: d });
      onSaved(editing ? t('revqa.saved') : t('revqa.added'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  const label = 'grid gap-1 text-sm font-medium';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-window-title"
        className="w-full max-w-[520px] max-h-[90vh] overflow-auto rounded-l border border-bd bg-pn shadow-card grid gap-4 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="check-window-title" className="font-display text-xl font-bold">
            {editing ? t('revqa.editTitle') : t('revqa.newTitle')}
          </h2>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('revqa.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {editing ? (
          <p className="text-sm">
            <b>{t('revqa.lead', { id: editing.leadId })}</b>{' '}
            <small className="text-mu">
              {editing.reviewedOn} · {editing.agentName} · {editing.reviewerName}
            </small>
            <br />
            <small className="text-mu">{t('revqa.by', { name: editing.byName })}</small>
          </p>
        ) : (
          <label className={label}>
            {t('revqa.review')}
            <select
              className={field}
              required
              value={d.reviewId}
              onChange={(e) => setD({ ...d, reviewId: e.target.value })}
            >
              <option value="">{t('revqa.pickReview')}</option>
              {reviews.slice(0, 80).map((r) => (
                <option key={r.id} value={r.id}>
                  {`${r.leadId} · ${r.reviewedOn} · ${r.agentName} · ${r.reviewerName} · ${r.notScored ? '-' : `${r.score}%`}`}
                </option>
              ))}
            </select>
            {reviews.length === 0 && <small className="text-mu font-normal">{t('revqa.noReviews')}</small>}
            <small className="text-mu font-normal">{t('revqa.yours')}</small>
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {QUESTIONS.map((q) => (
            <label key={q} className={label}>
              {t(`revqa.questions.${q}`)}
              <select
                className={field}
                value={d[q] ? 'yes' : 'no'}
                onChange={(e) => setD({ ...d, [q]: e.target.value === 'yes' })}
              >
                <option value="yes">{t('revqa.yes')}</option>
                <option value="no">{t('revqa.no')}</option>
              </select>
            </label>
          ))}
        </div>
        <label className={label}>
          {t('revqa.noteFor')}
          <textarea
            className={field}
            rows={3}
            maxLength={2000}
            value={d.note}
            onChange={(e) => setD({ ...d, note: e.target.value })}
          />
        </label>
        <Notice message={message} />
        <div className="flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton} disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
