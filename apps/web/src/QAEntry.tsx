// Quality › QA Entry, as today: the review type, team, agent, lead ID, date, campaign and scorecard; Yes/No/N/A with a
// comment for every item (and the root cause of a No); the links, the transcript of chats and e-mails; the general
// comments and the flag; the score shown live while answering. Also used to edit a review.
import {
  type Answer,
  type GivenAnswer,
  passes,
  type ScorecardCategory,
  type ScoredCategory,
  scoreReview,
} from '@qsmart/shared';
import { useSearch } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import type { ScorecardRow } from './Scorecards';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, type TeamRow, useAction } from './ui';

export type Channel = 'call' | 'chat' | 'email' | 'other';
export type Flag = '' | 'green' | 'red';
export interface ReviewRow {
  id: string;
  leadId: string;
  agentId: string | null;
  agentName: string;
  teamId: string | null;
  teamName: string;
  reviewedOn: string;
  channel: Channel;
  channelName: string;
  scorecardId: string | null;
  scorecardName: string;
  categories: ScoredCategory[];
  score: number | null;
  zero: boolean;
  notScored: boolean;
  status: string;
  flag: Flag;
  campaign: string;
  comment: string;
  leadLink: string;
  recordingLink: string;
  conversationLink: string;
  transcript: string;
  emailSubject: string;
  reviewerId: string | null;
  reviewerName: string;
  seenAt: string | null;
  reviewSeconds: number | null;
  /** the conversation it reviewed (Quality › Conversations) */
  conversationId?: string | null;
  /** a person's review, or AutoQA's: marked as AI, with its proof */
  source?: 'human' | 'ai';
  ai?: {
    provider: string;
    model: string;
    promptVersion: string;
    proof: { quote: string; why: string; tip: string }[][];
    summary: string;
    /** the outcome check (when the company's outcomes have a guide) */
    outcome?: {
      chosen: string | null;
      chosenName: string;
      expected: string;
      expectedName: string;
      ok: boolean;
      quote: string;
      why: string;
    };
  } | null;
  createdAt: string;
}
interface RootCause {
  id: string;
  name: string;
  active: boolean;
}
export interface PassRates {
  general: number;
  teams: Record<string, number>;
}

interface Form {
  channel: Channel;
  channelName: string;
  teamId: string;
  agentId: string;
  leadId: string;
  reviewedOn: string;
  campaign: string;
  scorecardId: string;
  leadLink: string;
  recordingLink: string;
  conversationLink: string;
  transcript: string;
  emailSubject: string;
  comment: string;
  flag: Flag;
  answers: GivenAnswer[][];
}

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in the person's time zone
/** today's QA Entry starts with every item on Yes */
const allYes = (categories: ScorecardCategory[]): GivenAnswer[][] =>
  categories.map((c) => c.questions.map(() => ({ answer: 'y' as Answer, comment: '', rootCause: '' })));
const scorecardOf = (scored: ScoredCategory[]): ScorecardCategory[] =>
  scored.map((c) => ({
    name: c.name,
    critical: c.critical,
    questions: c.questions.map(({ text, points, critical, compliance }) => ({ text, points, critical, compliance })),
  }));

export const passRateFor = (rates: PassRates | null, teamId: string | null) =>
  (teamId ? rates?.teams[teamId] : undefined) ?? rates?.general ?? 85;

export function QAEntry({
  company,
  editing,
  onDone,
}: {
  company: CompanyRef;
  /** a review to edit (from its page); without it, a new review */
  editing?: ReviewRow;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  // a link may choose the agent (today's "Review now" of the Review planner)
  const search = useSearch({ strict: false }) as { agent?: string; conversation?: string; scorecard?: string };
  const preset = search.agent;
  /** AutoQA's sample: a person reviews the same conversation (without seeing AutoQA's answers), linked on save */
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [cards, setCards] = useState<ScorecardRow[] | null>(null);
  const [causes, setCauses] = useState<RootCause[]>([]);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<TeamRow[]>('/teams', company.id),
      api<PersonRow[]>('/people', company.id),
      api<ScorecardRow[]>('/scorecards', company.id),
      api<RootCause[]>('/root-causes', company.id),
      api<PassRates>('/pass-rates', company.id),
    ]).then(([teamRows, personRows, cardRows, causeRows, rateRows]) => {
      setTeams(teamRows.filter((x) => !x.isAdministration));
      setPeople(personRows.filter((p) => p.role === 'agent' && p.active));
      setCards(cardRows);
      setCauses(causeRows.filter((c) => c.active));
      setRates(rateRows);
      const first = cardRows[0];
      const chosen = personRows.find((p) => p.membershipId === preset && p.role === 'agent' && p.active);
      const fromSample = !editing && search.conversation ? search.conversation : null;
      setForm(
        editing
          ? {
              channel: editing.channel,
              channelName: editing.channelName,
              teamId: editing.teamId ?? '',
              agentId: editing.agentId ?? '',
              leadId: editing.leadId,
              reviewedOn: editing.reviewedOn,
              campaign: editing.campaign,
              scorecardId: editing.scorecardId ?? '',
              leadLink: editing.leadLink,
              recordingLink: editing.recordingLink,
              conversationLink: editing.conversationLink,
              transcript: editing.transcript,
              emailSubject: editing.emailSubject,
              comment: editing.comment,
              flag: editing.flag,
              answers: editing.categories.map((c) =>
                c.questions.map((q) => ({ answer: q.answer, comment: q.comment, rootCause: q.rootCause })),
              ),
            }
          : {
              channel: 'call',
              channelName: '',
              teamId: chosen?.teamId ?? '',
              agentId: chosen?.membershipId ?? '',
              leadId: '',
              reviewedOn: today(),
              campaign: '',
              scorecardId: first?.id ?? '',
              leadLink: '',
              recordingLink: '',
              conversationLink: '',
              transcript: '',
              emailSubject: '',
              comment: '',
              flag: '',
              answers: first ? allYes(first.categories) : [],
            },
      );
      if (fromSample)
        void api<{
          id: string;
          channel: Channel;
          channelName: string;
          agentId: string | null;
          link: string;
          transcript: string | null;
          values: Record<string, unknown>;
        }>(`/conversations/${fromSample}`, company.id).then((c) => {
          const agent = personRows.find((p) => p.membershipId === c.agentId);
          const card = cardRows.find((x) => x.id === search.scorecard) ?? first;
          setConversationId(c.id);
          setForm((f) =>
            f
              ? {
                  ...f,
                  channel: c.channel,
                  channelName: c.channelName,
                  teamId: agent?.teamId ?? '',
                  agentId: c.agentId ?? '',
                  leadId: String(c.values['reference'] ?? '') || c.id.slice(0, 8),
                  conversationLink: c.link,
                  transcript: c.channel === 'call' ? '' : (c.transcript ?? ''),
                  emailSubject: c.channel === 'email' ? String(c.values['subject'] ?? '') : '',
                  scorecardId: card?.id ?? '',
                  answers: card ? allYes(card.categories) : [],
                }
              : f,
          );
        }, fail);
    }, fail);
  }, [company.id, editing, preset, search.conversation, search.scorecard, fail]);
  useEffect(load, [load]);

  // today's warning before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  const categories = useMemo(() => {
    if (editing) return scorecardOf(editing.categories);
    return cards?.find((c) => c.id === form?.scorecardId)?.categories ?? [];
  }, [editing, cards, form?.scorecardId]);
  const live = useMemo(() => {
    if (!form || !categories.length) return null;
    try {
      return scoreReview(categories, form.answers);
    } catch {
      return null;
    }
  }, [categories, form]);

  if (!form || !cards) return <p className="text-mu">{t('common.loading')}</p>;
  if (!editing && cards.length === 0) return <p className={card}>{t('reviews.noScorecard')}</p>;

  // each change builds on the latest form, so quick changes one after another never undo each other
  const set = (change: Partial<Form>) => {
    setForm((latest) => (latest ? { ...latest, ...change } : latest));
    setDirty(true);
  };
  const answer = (ci: number, qi: number, change: Partial<GivenAnswer>) => {
    setForm((latest) =>
      latest
        ? {
            ...latest,
            answers: latest.answers.map((row, r) =>
              r === ci ? row.map((a, q) => (q === qi ? { ...a, ...change } : a)) : row,
            ),
          }
        : latest,
    );
    setDirty(true);
  };
  const agents = people.filter((p) => !form.teamId || p.teamId === form.teamId);
  const passRate = passRateFor(
    rates,
    form.teamId || people.find((p) => p.membershipId === form.agentId)?.teamId || null,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (editing && live && live.score !== editing.score && !window.confirm(t('reviews.confirmScore'))) return;
    const body = {
      channel: form.channel,
      channelName: form.channelName,
      agentId: form.agentId,
      leadId: form.leadId,
      reviewedOn: form.reviewedOn,
      campaign: form.campaign,
      leadLink: form.leadLink,
      recordingLink: form.recordingLink,
      conversationLink: form.conversationLink,
      transcript: form.transcript,
      emailSubject: form.emailSubject,
      comment: form.comment,
      flag: form.flag,
      answers: form.answers,
    };
    setBusy(true);
    const ok = await run(
      () =>
        editing
          ? api(`/reviews/${editing.id}`, company.id, { method: 'PUT', body })
          : api('/reviews', company.id, {
              body: {
                ...body,
                scorecardId: form.scorecardId,
                reviewSeconds: Math.round((Date.now() - startedAt) / 1000),
                ...(conversationId ? { conversationId } : {}),
              },
            }),
      editing ? t('reviews.changesSaved') : t('reviews.saved'),
    );
    setBusy(false);
    if (!ok) return;
    setDirty(false);
    setConversationId(null);
    if (editing) onDone?.();
    // the next review: the same type, team and scorecard (as today), fresh answers
    else
      setForm({
        ...form,
        agentId: '',
        leadId: '',
        campaign: '',
        leadLink: '',
        recordingLink: '',
        conversationLink: '',
        transcript: '',
        emailSubject: '',
        comment: '',
        flag: '',
        answers: allYes(categories),
      });
  }

  const label = 'grid gap-1 text-sm font-medium';
  const segment = (on: boolean, color = 'border-brand bg-pn2') =>
    `rounded-s border px-3 py-1.5 text-sm font-semibold ${on ? color : 'border-bd hover:border-tx'}`;
  return (
    <form onSubmit={submit} className="grid gap-4" aria-labelledby="entry-title">
      <div className="grid gap-1">
        <h1 id="entry-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {editing ? t('reviews.editTitle') : t('menu.pages.entry')}
        </h1>
        <p className="text-sm text-mu">{editing ? t('reviews.editIntro') : t('reviews.entryIntro')}</p>
        {conversationId && (
          <p role="status" className="rounded-s bg-ac/15 px-3 py-2 text-sm">
            {t('autoqa.fromSample')}
          </p>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_300px] items-start">
        <div className="grid gap-4 min-w-0">
          <section className={`${card} grid gap-3`}>
            <div className="grid gap-1 text-sm">
              <b>{t('reviews.reviewType')}</b>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('reviews.reviewType')}>
                {(['call', 'chat', 'email', 'other'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={form.channel === c}
                    className={segment(form.channel === c)}
                    onClick={() => set({ channel: c })}
                  >
                    {t(`reviews.channels.${c}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {form.channel === 'other' && (
                <label className={label}>
                  {t('reviews.channel')}
                  <input
                    className={field}
                    maxLength={40}
                    placeholder={t('reviews.channelHelp')}
                    value={form.channelName}
                    onChange={(e) => set({ channelName: e.target.value })}
                  />
                </label>
              )}
              <label className={label}>
                {t('reviews.team')}
                <select
                  className={field}
                  value={form.teamId}
                  onChange={(e) => set({ teamId: e.target.value, agentId: '' })}
                >
                  <option value="">{t('reviews.selectTeam')}</option>
                  {teams.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                {t('reviews.agent')}
                <select
                  className={field}
                  required
                  value={form.agentId}
                  onChange={(e) => {
                    const agent = people.find((p) => p.membershipId === e.target.value);
                    set({ agentId: e.target.value, teamId: form.teamId || agent?.teamId || '' });
                  }}
                >
                  <option value="">{t('reviews.selectAgent')}</option>
                  {agents.map((p) => (
                    <option key={p.membershipId} value={p.membershipId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                {t('reviews.leadId')}
                <input
                  className={field}
                  required
                  maxLength={60}
                  placeholder={t('reviews.leadIdHelp')}
                  value={form.leadId}
                  onChange={(e) => set({ leadId: e.target.value })}
                />
              </label>
              <label className={label}>
                {t('reviews.date')}
                <input
                  type="date"
                  className={field}
                  required
                  value={form.reviewedOn}
                  onChange={(e) => set({ reviewedOn: e.target.value })}
                />
              </label>
              <label className={label}>
                {t('reviews.campaign')}
                <input
                  className={field}
                  maxLength={80}
                  placeholder={t('reviews.campaignHelp')}
                  value={form.campaign}
                  onChange={(e) => set({ campaign: e.target.value })}
                />
              </label>
              {!editing && (
                <label className={label}>
                  {t('reviews.scorecard')}
                  <select
                    className={field}
                    required
                    value={form.scorecardId}
                    onChange={(e) => {
                      const next = cards.find((c) => c.id === e.target.value);
                      set({ scorecardId: e.target.value, answers: next ? allYes(next.categories) : [] });
                    }}
                  >
                    <option value="">{t('reviews.selectScorecard')}</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={label}>
                {t('reviews.leadLink')}
                <input
                  type="url"
                  className={field}
                  maxLength={500}
                  value={form.leadLink}
                  onChange={(e) => set({ leadLink: e.target.value })}
                />
              </label>
              {form.channel === 'call' ? (
                <label className={label}>
                  {t('reviews.recordingLink')}
                  <input
                    type="url"
                    className={field}
                    maxLength={500}
                    value={form.recordingLink}
                    onChange={(e) => set({ recordingLink: e.target.value })}
                  />
                  <small className="text-xs text-mu font-normal">{t('reviews.recordingNote')}</small>
                </label>
              ) : (
                <label className={label}>
                  {t(`reviews.conversationLink.${form.channel}`)}
                  <input
                    type="url"
                    className={field}
                    maxLength={500}
                    value={form.conversationLink}
                    onChange={(e) => set({ conversationLink: e.target.value })}
                  />
                </label>
              )}
              {form.channel === 'email' && (
                <label className={label}>
                  {t('reviews.emailSubject')}
                  <input
                    className={field}
                    maxLength={200}
                    value={form.emailSubject}
                    onChange={(e) => set({ emailSubject: e.target.value })}
                  />
                </label>
              )}
            </div>
            {form.channel !== 'call' && (
              <label className={label}>
                {t(`reviews.transcript.${form.channel}`)}
                <textarea
                  className={field}
                  rows={5}
                  maxLength={20000}
                  placeholder={t(`reviews.transcriptHelp.${form.channel}`)}
                  value={form.transcript}
                  onChange={(e) => set({ transcript: e.target.value })}
                />
              </label>
            )}
          </section>

          {categories.map((c, ci) => (
            <section key={ci} className={`${card} grid gap-3`} aria-label={c.name}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {c.name}
                  {c.critical && (
                    <span className="ml-2 rounded-full bg-bad/10 px-2 text-xs text-bad">
                      {t('quality.criticalCategory')}
                    </span>
                  )}
                </h2>
                {live && (
                  <b className="font-mono text-sm">
                    {live.categories[ci]?.earned ?? 0} / {live.categories[ci]?.possible ?? 0}
                  </b>
                )}
              </div>
              {c.questions.map((q, qi) => {
                const given = form.answers[ci]?.[qi];
                return (
                  <div key={qi} className="grid gap-2 border-t border-bd pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        {q.text} <small className="text-mu font-mono">({t('quality.pts', { count: q.points })})</small>
                        {q.critical && (
                          <span className="ml-1 rounded-full bg-wn/10 px-2 text-xs text-wn">
                            {t('quality.critical')}
                          </span>
                        )}
                      </span>
                      <div className="flex gap-1" role="group" aria-label={q.text}>
                        {(['y', 'n', 'na'] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            aria-pressed={given?.answer === a}
                            className={segment(
                              given?.answer === a,
                              a === 'y'
                                ? 'border-ok bg-ok/10'
                                : a === 'n'
                                  ? 'border-bad bg-bad/10'
                                  : 'border-tx bg-pn2',
                            )}
                            onClick={() => answer(ci, qi, { answer: a })}
                          >
                            {t(`reviews.${a === 'y' ? 'yes' : a === 'n' ? 'no' : 'na'}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className={`${field} flex-1 min-w-48`}
                        aria-label={`${t('reviews.comment')}: ${q.text}`}
                        placeholder={t('reviews.comment')}
                        maxLength={300}
                        value={given?.comment ?? ''}
                        onChange={(e) => answer(ci, qi, { comment: e.target.value })}
                      />
                      {given?.answer === 'n' && causes.length > 0 && (
                        <select
                          className={field}
                          aria-label={`${t('reviews.rootCause')}: ${q.text}`}
                          value={given.rootCause ?? ''}
                          onChange={(e) => answer(ci, qi, { rootCause: e.target.value })}
                        >
                          <option value="">{t('reviews.chooseRootCause')}</option>
                          {causes.map((cause) => (
                            <option key={cause.id} value={cause.name}>
                              {cause.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}

          <section className={card}>
            <label className={label}>
              {t('reviews.generalComments')} <span className="text-mu font-normal">{t('quality.optional')}</span>
              <textarea
                className={field}
                rows={4}
                maxLength={1000}
                placeholder={t('reviews.generalCommentsHelp')}
                value={form.comment}
                onChange={(e) => set({ comment: e.target.value })}
              />
            </label>
          </section>
        </div>

        <aside className={`${card} grid gap-3 xl:sticky xl:top-4`} aria-live="polite">
          <div className="text-center">
            <div className="text-sm text-mu">{t('reviews.score')}</div>
            <div
              className={`font-display text-5xl font-bold ${
                live && !live.notScored ? (passes(live.score, passRate) ? 'text-ok' : 'text-bad') : ''
              }`}
            >
              {live?.notScored ? '-' : `${live?.score ?? 0}%`}
            </div>
            {live && !live.notScored && (
              <div className="text-sm font-semibold">
                {passes(live.score, passRate) ? t('reviews.passed') : t('reviews.failed')}
              </div>
            )}
            <small className="text-mu">{t('reviews.passRate', { rate: passRate })}</small>
            {live?.zero && <p className="text-sm text-bad font-semibold">{t('reviews.criticalFailure')}</p>}
            {live?.notScored && <p className="text-sm text-mu">{t('reviews.notScored')}</p>}
          </div>
          <hr className="border-bd" />
          <div className="grid gap-1 text-sm">
            <b>{t('reviews.flag')}</b>
            <div className="flex gap-1" role="group" aria-label={t('reviews.flag')}>
              {(['', 'green', 'red'] as const).map((f) => (
                <button
                  key={f || 'none'}
                  type="button"
                  aria-pressed={form.flag === f}
                  className={segment(form.flag === f)}
                  onClick={() => set({ flag: f })}
                >
                  {t(`reviews.flags.${f || 'none'}`)}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? t('reviews.saving') : editing ? t('reviews.saveChanges') : t('reviews.submit')}
          </button>
          {editing && (
            <button
              type="button"
              className="text-sm text-ac font-semibold hover:underline"
              onClick={() => {
                if (!dirty || window.confirm(t('reviews.unsaved'))) onDone?.();
              }}
            >
              {t('common.cancel')}
            </button>
          )}
          <Notice message={message} />
        </aside>
      </div>
    </form>
  );
}
