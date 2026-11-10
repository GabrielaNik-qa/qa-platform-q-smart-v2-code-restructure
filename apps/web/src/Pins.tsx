// Coaching › Pins, as today: moments of reviewed conversations saved to talk about with the agent in a coaching
// session. "To talk about" and "Talked about" (the last 40). Staff pin, change, mark talked about and delete; an agent
// sees their own pins and opens the review.
import { can } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Icon } from './icon';
import type { ReviewRow } from './QAEntry';
import { card, type CompanyRef, field, Notice, primaryButton, smallButton, useAction } from './ui';

type Status = 'todo' | 'done';
interface Pin {
  id: string;
  reviewId: string | null;
  leadId: string;
  reviewedOn: string;
  agentName: string;
  moment: string;
  note: string;
  status: Status;
  byName: string;
}

export function Pins({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const writer = can(company.role, 'pins.write');
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [editing, setEditing] = useState<Pin | 'new' | null>(null);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<Pin[]>('/pins', company.id),
      writer ? api<ReviewRow[]>('/reviews', company.id) : Promise.resolve([]),
    ]).then(([p, r]) => {
      setPins(p);
      setReviews(r);
    }, fail);
  }, [company.id, writer, fail]);
  useEffect(load, [load]);

  const todo = (pins ?? []).filter((p) => p.status !== 'done');
  const done = (pins ?? []).filter((p) => p.status === 'done');
  const iconButton = 'inline-grid place-items-center size-8 rounded-s hover:bg-pn2';

  const row = (p: Pin) => (
    <li key={p.id} className="grid gap-1 border-t border-bd pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <b>{p.agentName}</b>{' '}
          <small className="text-mu">
            {t('pins.lead', { id: p.leadId })} · {p.reviewedOn}
            {p.moment && ` · ${p.moment}`}
          </small>
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {p.reviewId && (
            <Link to="/review/$id" params={{ id: p.reviewId }} className={smallButton}>
              {t('pins.openReview')}
            </Link>
          )}
          {writer && p.status !== 'done' && (
            <button
              type="button"
              className={smallButton}
              onClick={() =>
                void run(
                  () => api(`/pins/${p.id}`, company.id, { method: 'PUT', body: { status: 'done' } }),
                  t('pins.saved'),
                  load,
                )
              }
            >
              ✓ {t('pins.markDone')}
            </button>
          )}
          {writer && (
            <>
              <button
                type="button"
                className={iconButton}
                title={t('pins.change')}
                aria-label={`${t('pins.change')}: ${p.leadId}`}
                onClick={() => setEditing(p)}
              >
                <Icon name="pen" />
              </button>
              <button
                type="button"
                className={`${iconButton} text-bad`}
                title={t('common.delete')}
                aria-label={`${t('common.delete')}: ${p.leadId}`}
                onClick={() => {
                  if (window.confirm(t('pins.confirmDelete')))
                    void run(() => api(`/pins/${p.id}`, company.id, { method: 'DELETE' }), t('pins.deleted'), load);
                }}
              >
                <Icon name="bin" />
              </button>
            </>
          )}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{p.note}</p>
    </li>
  );
  const list = (title: string, items: Pin[], id: string) => (
    <section className={`${card} grid gap-2`} aria-labelledby={id}>
      <h2 id={id} className="font-display text-lg font-bold flex items-center gap-2">
        {title}
        <span className="rounded-full bg-pn2 border border-bd px-2 text-sm font-normal">{items.length}</span>
      </h2>
      {items.length ? (
        <ul className="grid gap-2">{items.map(row)}</ul>
      ) : (
        <p className="text-sm text-mu">{t('pins.none')}</p>
      )}
    </section>
  );

  return (
    <section className="grid gap-4" aria-labelledby="pins-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="pins-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.cs_pins')}
          </h1>
          <p className="text-sm text-mu">{t('pins.intro')}</p>
        </div>
        {writer && (
          <button type="button" className={primaryButton} onClick={() => setEditing('new')}>
            {t('pins.pin')}
          </button>
        )}
      </div>
      <Notice message={message} />
      {!pins && <p className="text-mu">{t('common.loading')}</p>}
      {pins && list(t('pins.todo'), todo, 'pins-todo')}
      {pins && done.length > 0 && list(t('pins.done'), done.slice(0, 40), 'pins-done')}
      {editing && (
        <PinWindow
          company={company}
          editing={editing === 'new' ? undefined : editing}
          reviews={reviews}
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

/** "Pin a moment" / "Change the pin" (today's form): the review, the moment, what to talk about and the status. */
function PinWindow({
  company,
  editing,
  reviews,
  onClose,
  onSaved,
}: {
  company: CompanyRef;
  editing: Pin | undefined;
  reviews: ReviewRow[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [d, setD] = useState({
    reviewId: editing?.reviewId ?? '',
    moment: editing?.moment ?? '',
    note: editing?.note ?? '',
    status: editing?.status ?? ('todo' as Status),
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
    if (busy) return; // a double-click on Save must not pin twice
    setBusy(true);
    try {
      const { reviewId: _review, ...change } = d;
      if (editing) await api(`/pins/${editing.id}`, company.id, { method: 'PUT', body: change });
      else await api('/pins', company.id, { method: 'POST', body: d });
      onSaved(editing ? t('pins.saved') : t('pins.added'));
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
        aria-labelledby="pin-window-title"
        className="w-full max-w-[520px] max-h-[90vh] overflow-auto rounded-l border border-bd bg-pn shadow-card grid gap-4 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="pin-window-title" className="font-display text-xl font-bold">
            {editing ? t('pins.editTitle') : t('pins.newTitle')}
          </h2>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('pins.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {editing ? (
          <p className="text-sm">
            <b>{editing.agentName}</b>{' '}
            <small className="text-mu">
              {t('pins.lead', { id: editing.leadId })} · {editing.reviewedOn}
            </small>
            <br />
            <small className="text-mu">{t('pins.by', { name: editing.byName })}</small>
          </p>
        ) : (
          <label className={label}>
            {t('pins.review')}
            <select
              className={field}
              required
              value={d.reviewId}
              onChange={(e) => setD({ ...d, reviewId: e.target.value })}
            >
              <option value="">{t('pins.pickReview')}</option>
              {reviews.slice(0, 120).map((r) => (
                <option key={r.id} value={r.id}>
                  {`${r.leadId} · ${r.reviewedOn} · ${r.agentName}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            {t('pins.moment')}
            <input
              className={field}
              placeholder="02:15"
              pattern="(\d{1,2}:)?\d{1,3}:[0-5]\d"
              maxLength={10}
              value={d.moment}
              onChange={(e) => setD({ ...d, moment: e.target.value })}
            />
          </label>
          <label className={label}>
            {t('pins.status')}
            <select
              className={field}
              value={d.status}
              onChange={(e) => setD({ ...d, status: e.target.value as Status })}
            >
              {(['todo', 'done'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`pins.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          {t('pins.note')}
          <textarea
            className={field}
            rows={3}
            required
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
