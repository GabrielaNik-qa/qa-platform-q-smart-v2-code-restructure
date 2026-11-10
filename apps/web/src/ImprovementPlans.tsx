// Quality › Performance › Improvement plans (today's perf.js `PG.pips`): a clear plan with goals and check-ins for an
// agent below target, its outcome, and the agent's signature. Staff (admins, reviewers, team leads, trainers) start and
// keep plans; an agent reads their own and signs that they read it and agree.
import { averageScore, can, dayOf, scoredOnly } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { BAND_SOFT, BAND_TEXT, band, Empty } from './bits';
import type { PassRates, ReviewRow } from './QAEntry';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, smallButton, useAction } from './ui';

type Status = 'active' | 'extended' | 'passed' | 'failed' | 'cancelled';
export interface Plan {
  id: string;
  agentId: string | null;
  agentName: string;
  title: string;
  reason: string;
  startOn: string;
  endOn: string;
  goals: { text: string; done: boolean }[];
  checkIns: { date: string; note: string; byName: string }[];
  status: Status;
  signedAt: string | null;
  agentNote: string;
  byName: string;
}
const STATUSES: Status[] = ['active', 'extended', 'passed', 'failed', 'cancelled'];
export const PLAN_LOOK: Record<Status, string> = {
  active: 'bg-ac/15 text-ac',
  extended: BAND_SOFT.wn,
  passed: BAND_SOFT.ok,
  failed: BAND_SOFT.bad,
  cancelled: BAND_SOFT.wn,
};
export const planOpen = (p: Pick<Plan, 'status'>) => p.status === 'active' || p.status === 'extended';
const today = () => new Date().toLocaleDateString('sv-SE');
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');
const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';

interface Draft {
  id?: string;
  agentId: string;
  title: string;
  reason: string;
  startOn: string;
  endOn: string;
  goals: string;
}

export function ImprovementPlans({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, run, fail } = useAction();
  const staff = can(company.role, 'improvementPlans.write');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [agents, setAgents] = useState<PersonRow[]>([]);
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [checkIn, setCheckIn] = useState({ date: today(), note: '' });
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    api<Plan[]>('/improvement-plans', company.id).then(setPlans, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id).catch(() => []),
      api<PassRates>('/pass-rates', company.id).catch(() => null),
      staff ? api<PersonRow[]>('/people', company.id) : Promise.resolve([]),
    ]).then(([r, pr, ppl]) => {
      setReviews(r);
      setRates(pr);
      setAgents(ppl.filter((p) => p.role === 'agent' && p.active).sort((a, b) => a.name.localeCompare(b.name)));
    }, fail);
  }, [company.id, staff, fail]);

  const list = plans ?? [];
  const plan = list.find((p) => p.id === open);
  const change = (p: Plan, body: object, done: string) =>
    void run(() => api(`/improvement-plans/${p.id}`, company.id, { method: 'PUT', body }), done, load);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const goals = draft.goals
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const old = list.find((p) => p.id === draft.id);
    const body = draft.id
      ? {
          title: draft.title,
          reason: draft.reason,
          startOn: draft.startOn,
          endOn: draft.endOn,
          goals: goals.map((text) => ({ text, done: old?.goals.find((g) => g.text === text)?.done ?? false })),
        }
      : { ...draft, goals };
    const ok = await run(
      () =>
        api(draft.id ? `/improvement-plans/${draft.id}` : '/improvement-plans', company.id, {
          method: draft.id ? 'PUT' : 'POST',
          body,
        }),
      t('plans.saved'),
      load,
    );
    if (ok) setDraft(null);
  }

  const head = (title: string, intro: string, extra?: ReactNode) => (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 id="plans-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {title}
        </h1>
        <p className="text-sm text-mu">{intro}</p>
      </div>
      <div className="flex flex-wrap gap-2">{extra}</div>
    </div>
  );
  const form = draft && (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDraft(null)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-form-title"
        className="grid max-h-[90vh] w-full max-w-[620px] gap-3 overflow-auto rounded-l border border-bd bg-pn p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="plan-form-title" className="font-display text-xl font-bold">
            {draft.id ? t('plans.editTitle') : t('plans.newTitle')}
          </h2>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('cats.close')}
            onClick={() => setDraft(null)}
          >
            ×
          </button>
        </div>
        {!draft.id && (
          <label className="grid gap-1 text-sm font-medium">
            {t('cats.agent')}
            <select
              className={field}
              required
              value={draft.agentId}
              onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
            >
              <option value="">{t('goals.form.choose')}</option>
              {agents.map((p) => (
                <option key={p.membershipId} value={p.membershipId}>
                  {p.name} · {p.teamName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-sm font-medium">
          {t('plans.form.title')}
          <input
            className={field}
            required
            maxLength={150}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('plans.form.reason')}
          <textarea
            className={field}
            rows={3}
            maxLength={2000}
            placeholder={t('plans.form.reasonPlaceholder')}
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-medium">
            {t('plans.form.start')}
            <input
              className={field}
              type="date"
              required
              value={draft.startOn}
              onChange={(e) => setDraft({ ...draft, startOn: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t('plans.form.end')}
            <input
              className={field}
              type="date"
              required
              value={draft.endOn}
              onChange={(e) => setDraft({ ...draft, endOn: e.target.value })}
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          {t('plans.form.goals')}
          <textarea
            className={field}
            rows={4}
            placeholder={t('plans.form.goalsPlaceholder')}
            value={draft.goals}
            onChange={(e) => setDraft({ ...draft, goals: e.target.value })}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={() => setDraft(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton}>
            {draft.id ? t('plans.form.save') : t('plans.form.start2')}
          </button>
        </div>
      </form>
    </div>
  );

  // ---- one plan
  if (plan) {
    const mine = company.role === 'agent';
    const done = plan.goals.filter((g) => g.done).length;
    const during = scoredOnly(reviews).filter(
      (r) => r.agentId === plan.agentId && r.reviewedOn >= plan.startOn && r.reviewedOn <= plan.endOn,
    );
    const avg = averageScore(during);
    return (
      <section className="grid gap-4" aria-labelledby="plans-title">
        {head(
          t('plans.detailTitle', { name: plan.agentName }),
          `${plan.title} · ${plan.startOn} → ${plan.endOn} · ${t('plans.by', { name: plan.byName })}`,
          <>
            <button type="button" className={smallButton} onClick={() => setOpen(null)}>
              ‹ {t('plans.all')}
            </button>
            {staff && (
              <button
                type="button"
                className={smallButton}
                onClick={() =>
                  setDraft({
                    id: plan.id,
                    agentId: plan.agentId ?? '',
                    title: plan.title,
                    reason: plan.reason,
                    startOn: plan.startOn,
                    endOn: plan.endOn,
                    goals: plan.goals.map((g) => g.text).join('\n'),
                  })
                }
              >
                {t('goals.edit')}
              </button>
            )}
            {!mine && plan.agentId && (
              <Link
                to="/$app/$page"
                params={{ app: 'quality', page: 'agents' }}
                search={{ agent: plan.agentId }}
                className={smallButton}
              >
                {t('plans.profile')} ›
              </Link>
            )}
            {staff && (
              <button
                type="button"
                className={`${smallButton} text-bad`}
                onClick={() => {
                  if (!window.confirm(t('plans.confirmDelete'))) return;
                  void run(
                    () => api(`/improvement-plans/${plan.id}`, company.id, { method: 'DELETE' }),
                    t('goals.deleted'),
                    () => {
                      setOpen(null);
                      load();
                    },
                  );
                }}
              >
                {t('goals.delete')}
              </button>
            )}
          </>,
        )}
        <Notice message={message} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="grid gap-4">
            <div className={`${card} grid gap-2`}>
              <h2 className="font-semibold">{t('plans.why')}</h2>
              <p className="whitespace-pre-wrap">{plan.reason || '-'}</p>
            </div>
            <div className={`${card} grid gap-2`}>
              <h2 className="flex items-center gap-2 font-semibold">
                {t('plans.goals')}
                <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">
                  {done}/{plan.goals.length}
                </span>
              </h2>
              {plan.goals.length ? (
                plan.goals.map((g, i) => (
                  <label key={i} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)]"
                      checked={g.done}
                      disabled={!staff}
                      onChange={(e) =>
                        change(
                          plan,
                          { goals: plan.goals.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) },
                          t('goals.saved'),
                        )
                      }
                    />
                    <span className={g.done ? 'line-through opacity-60' : ''}>{g.text}</span>
                  </label>
                ))
              ) : (
                <Empty>{t('plans.noGoals')}</Empty>
              )}
            </div>
            <div className={`${card} grid gap-2`}>
              <h2 className="font-semibold">{t('plans.outcome')}</h2>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('plans.outcome')}>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={plan.status === s}
                    disabled={!staff}
                    className={`rounded-full border px-3 py-1 text-sm ${plan.status === s ? 'border-brand bg-pn2 font-semibold' : 'border-bd'} disabled:cursor-default`}
                    onClick={() => change(plan, { status: s }, t('plans.statusChanged'))}
                  >
                    {t(`plans.statuses.${s}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            <div className={`${card} grid gap-2`}>
              <h2 className="flex items-center gap-2 font-semibold">
                {t('plans.scores')}
                <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">
                  {t('cats.reviewsCount', { count: during.length })}
                </span>
              </h2>
              {avg === null ? (
                <Empty>{t('plans.noScores')}</Empty>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>{t('cats.average')}</span>
                    <b className={`font-mono ${BAND_TEXT[band(avg, rates, during[0]?.teamId ?? null)]}`}>
                      {avg.toFixed(1)}%
                    </b>
                  </div>
                  <ul className="grid text-sm">
                    {[...during]
                      .sort((a, b) => dayOf(b) - dayOf(a))
                      .slice(0, 8)
                      .map((r) => (
                        <li key={r.id} className="flex justify-between gap-2 border-t border-bd py-1 first:border-t-0">
                          <span>
                            <Link to="/review/$id" params={{ id: r.id }} className="font-mono text-ac hover:underline">
                              {r.leadId}
                            </Link>{' '}
                            <small className="text-mu">{r.reviewedOn}</small>
                          </span>
                          <b className={`font-mono ${BAND_TEXT[band(r.score ?? 0, rates, r.teamId)]}`}>
                            {Math.round(r.score ?? 0)}%
                          </b>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
            <div className={`${card} grid gap-2`}>
              <h2 className="flex items-center gap-2 font-semibold">
                {t('plans.checkIns')}
                <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">{plan.checkIns.length}</span>
              </h2>
              {plan.checkIns.map((c, i) => (
                <div key={i} className="border-t border-bd py-1.5 first:border-t-0">
                  <small className="text-mu">
                    {c.date} · {c.byName}
                  </small>
                  <p className="whitespace-pre-wrap">{c.note}</p>
                </div>
              ))}
              {staff && (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        api(`/improvement-plans/${plan.id}/check-ins`, company.id, { method: 'POST', body: checkIn }),
                      t('plans.checkInAdded'),
                      () => {
                        setCheckIn({ date: today(), note: '' });
                        load();
                      },
                    );
                  }}
                >
                  <input
                    className={field}
                    type="date"
                    aria-label={t('plans.checkInDate')}
                    value={checkIn.date}
                    onChange={(e) => setCheckIn({ ...checkIn, date: e.target.value })}
                  />
                  <input
                    className={`${field} min-w-48 flex-1`}
                    required
                    maxLength={1000}
                    placeholder={t('plans.checkInPlaceholder')}
                    value={checkIn.note}
                    onChange={(e) => setCheckIn({ ...checkIn, note: e.target.value })}
                  />
                  <button type="submit" className={primaryButton}>
                    {t('plans.add')}
                  </button>
                </form>
              )}
            </div>
            <div className={`${card} grid gap-2`}>
              <h2 className="font-semibold">{t('plans.signature')}</h2>
              {plan.signedAt ? (
                <>
                  <p className="text-ok">✍ {t('plans.signedOn', { date: plan.signedAt.slice(0, 10) })}</p>
                  {plan.agentNote && <p>“{plan.agentNote}”</p>}
                </>
              ) : mine ? (
                <>
                  <textarea
                    className={field}
                    rows={2}
                    maxLength={1000}
                    placeholder={t('plans.commentPlaceholder')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() =>
                      void run(
                        () => api(`/improvement-plans/${plan.id}/sign`, company.id, { method: 'POST', body: { note } }),
                        t('plans.thanks'),
                        load,
                      )
                    }
                  >
                    ✍ {t('plans.sign')}
                  </button>
                </>
              ) : (
                <p className="text-mu">{t('plans.waitingSignature')}</p>
              )}
            </div>
          </div>
        </div>
        {form}
      </section>
    );
  }

  // ---- every plan
  const shown = list.filter((p) => (tab === 'active' ? planOpen(p) : !planOpen(p)));
  return (
    <section className="grid gap-4" aria-labelledby="plans-title">
      {head(
        t('menu.pages.pips'),
        company.role === 'agent' ? t('plans.introAgent') : t('plans.intro'),
        staff && (
          <button
            type="button"
            className={primaryButton}
            onClick={() =>
              setDraft({
                agentId: '',
                title: t('plans.defaultTitle'),
                reason: '',
                startOn: today(),
                endOn: inDays(30),
                goals: '',
              })
            }
          >
            + {t('plans.new')}
          </button>
        ),
      )}
      <Notice message={message} />
      <div className="flex gap-1" role="tablist">
        {(['active', 'closed'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`rounded-s px-3 py-1.5 text-sm ${tab === k ? 'bg-pn2 font-semibold' : 'text-mu hover:text-tx'}`}
            onClick={() => setTab(k)}
          >
            {t(`plans.tabs.${k}`, { count: list.filter((p) => (k === 'active' ? planOpen(p) : !planOpen(p))).length })}
          </button>
        ))}
      </div>
      {!plans ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : shown.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const done = p.goals.filter((g) => g.done).length;
            const left = Math.ceil((new Date(`${p.endOn}T23:59:00`).getTime() - Date.now()) / 864e5);
            return (
              <button
                key={p.id}
                type="button"
                className={`${card} grid content-start gap-2 text-left hover:border-brand`}
                onClick={() => setOpen(p.id)}
              >
                <span className="flex items-start justify-between gap-2">
                  <b>{p.agentName}</b>
                  <span className={`${pill} ${PLAN_LOOK[p.status]}`}>{t(`plans.statuses.${p.status}`)}</span>
                </span>
                <small className="text-mu">
                  {p.title} · {p.startOn} → {p.endOn}
                </small>
                <span className="flex justify-between gap-2 text-sm">
                  <small>
                    {t('plans.progress', { done, count: p.goals.length })} ·{' '}
                    {t('plans.checkInCount', { count: p.checkIns.length })}
                  </small>
                  {planOpen(p) && (
                    <small className={left < 0 ? 'text-bad' : 'text-mu'}>
                      {left < 0 ? t('plans.late', { count: -left }) : t('plans.left', { count: left })}
                    </small>
                  )}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-sunk">
                  <span
                    className="block h-full rounded-full bg-ac"
                    style={{ width: `${p.goals.length ? (done / p.goals.length) * 100 : 0}%` }}
                  />
                </span>
                {p.signedAt ? (
                  <small className="text-ok">✍ {t('plans.signed')}</small>
                ) : planOpen(p) ? (
                  <small className="text-wn">{t('plans.waiting')}</small>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className={`${card} text-mu`}>{tab === 'active' ? t('plans.noneActive') : t('plans.noneClosed')}</p>
      )}
      {form}
    </section>
  );
}

/** For the Agents page: an agent's plans, each opening its page. */
export function PlanRow({ p }: { p: Plan }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-s bg-pn2 px-3 py-2 text-sm">
      <span>
        <b>{p.title}</b>{' '}
        <small className="text-mu">
          {p.startOn} → {p.endOn} ·{' '}
          {t('plans.progress', { done: p.goals.filter((g) => g.done).length, count: p.goals.length })}
        </small>
      </span>
      <span className={`${pill} ${PLAN_LOOK[p.status]}`}>{t(`plans.statuses.${p.status}`)}</span>
    </div>
  );
}
