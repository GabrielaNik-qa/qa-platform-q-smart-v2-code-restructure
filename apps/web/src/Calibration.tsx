// Quality › Calibration, as today:
// - the list: "Reviewer consistency" (do reviewers score alike?) and a card per session the person takes part in;
// - a session (its own page, /calibration/<id>): the reviews discussed, the agenda, each participant's own part,
//   blind scoring with a reference score and how far each person is from it, and the decisions and actions;
// - the session window to make or change one (its maker or an admin).
import { ROLE_LABELS, type Role } from '@qsmart/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';
import type { Dispute } from './Disputes';
import { NotFound } from './PageView';
import type { ReviewRow } from './QAEntry';
import { useSession } from './session';
import {
  card,
  CheckList,
  Chips,
  type CompanyRef,
  dangerButton,
  field,
  Notice,
  type PersonRow,
  primaryButton,
  smallButton,
  type TeamRow,
  useAction,
} from './ui';

type Status = 'planned' | 'held' | 'closed';
interface Participant {
  id: string;
  membershipId: string;
  name: string;
  role: Role;
  impression: string;
  done: string;
  wroteAt: string | null;
}
interface Discussed {
  id: string;
  leadId: string;
  agentName: string;
  teamId: string | null;
  score: number | null;
  notScored: boolean;
  scorecardName: string;
  reviewerName: string;
}
interface Decision {
  text: string;
  ownerId: string;
  due: string;
  done: boolean;
}
export interface Session {
  id: string;
  title: string;
  heldOn: string;
  status: Status;
  notes: string;
  teamIds: string[];
  teamNames: string[];
  decisions: Decision[];
  reference: Record<string, string>;
  byName: string;
  owner: boolean;
  myParticipantId: string | null;
  participants: Participant[];
  reviews: Discussed[];
  scores: { reviewId: string; participantId: string; score: number; note: string }[];
  scoredCount: Record<string, number>;
}
const STATUS_STYLE: Record<Status, string> = {
  planned: 'bg-wn/15 text-wn',
  held: 'bg-ac/15 text-ac',
  closed: 'bg-ok/15 text-ok',
};
const pill = 'rounded-full px-2 text-xs font-semibold whitespace-nowrap';
const STAFF = ['admin', 'reviewer', 'lead', 'trainer'];
const th = 'py-1 pr-3 font-semibold uppercase text-xs tracking-wide text-left text-mu';
const td = 'py-1.5 pr-3';

// ------------------------------------------------------------------------------------------- the list

export function Calibrations({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [making, setMaking] = useState(false);
  const { message, fail } = useAction();

  useEffect(() => {
    void Promise.all([
      api<Session[]>('/calibrations', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<PersonRow[]>('/people', company.id),
      api<ReviewRow[]>('/reviews', company.id),
      api<Dispute[]>('/disputes', company.id),
    ]).then(([s, tm, ppl, r, d]) => {
      setSessions(s);
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl);
      setReviews(r);
      setDisputes(d);
    }, fail);
  }, [company.id, fail]);

  return (
    <section className="grid gap-4" aria-labelledby="cal-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="cal-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.cal')}
          </h1>
          <p className="text-sm text-mu">{t('calibration.intro')}</p>
        </div>
        <button type="button" className={primaryButton} onClick={() => setMaking(true)}>
          {t('calibration.new')}
        </button>
      </div>
      <Notice message={message} />
      <ReviewerConsistency reviews={reviews} disputes={disputes} />
      {!sessions && <p className="text-mu">{t('common.loading')}</p>}
      {sessions?.length === 0 && <p className="text-mu">{t('calibration.none')}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {sessions?.map((s) => (
          <Link key={s.id} to="/calibration/$id" params={{ id: s.id }} className={`${card} grid gap-2 hover:border-tx`}>
            <h2 className="font-display text-lg font-bold">{s.title}</h2>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={`${pill} ${STATUS_STYLE[s.status]}`}>{t(`calibration.statuses.${s.status}`)}</span>
                <small className="text-mu">{s.heldOn}</small>
              </span>
              <small className="text-mu">
                {t('calibration.wrote', {
                  n: s.participants.filter((p) => p.wroteAt).length,
                  of: s.participants.length,
                })}
              </small>
            </div>
            <div className="grid gap-1.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{t('calibration.people')}</b> <Chips items={s.participants.map((p) => p.name)} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <b>{t('calibration.teams')}</b> <Chips items={s.teamNames} />
              </div>
              <div>
                <b>{t('calibration.decisions')}</b>{' '}
                {t('calibration.decided', { n: s.decisions.filter((d) => d.done).length, of: s.decisions.length })}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {making && (
        <SessionWindow
          company={company}
          teams={teams}
          people={people}
          onClose={() => setMaking(false)}
          onSaved={(s) => void navigate({ to: '/calibration/$id', params: { id: s.id } })}
        />
      )}
    </section>
  );
}

/**
 * Do reviewers score alike? Each reviewer's average against everyone's, and how often their scores had to change after
 * a dispute (today's card). Big gaps are a good reason to calibrate.
 */
function ReviewerConsistency({ reviews, disputes }: { reviews: ReviewRow[]; disputes: Dispute[] }) {
  const { t } = useTranslation();
  const scored = reviews.filter((r) => !r.notScored && r.score !== null && r.reviewerName);
  const average = scored.length ? scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length : 0;
  const byReview = new Map(disputes.map((d) => [d.reviewId, d]));
  const rows = [...new Set(scored.map((r) => r.reviewerName))]
    .map((name) => {
      const mine = scored.filter((r) => r.reviewerName === name);
      const avg = mine.reduce((a, r) => a + (r.score ?? 0), 0) / mine.length;
      const disputed = mine.filter((r) => byReview.has(r.id));
      const changed = disputed.filter((r) => byReview.get(r.id)?.outcome === 'changed').length;
      return { name, count: mine.length, avg, gap: avg - average, disputed: disputed.length, changed };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const rate = (r: (typeof rows)[number]) => {
    const x = Math.abs(r.gap) + (r.disputed ? (r.changed / r.count) * 40 : 0);
    return x < 3
      ? ['consistent', 'bg-ok/15 text-ok']
      : x < 7
        ? ['watch', 'bg-wn/15 text-wn']
        : ['calibrate', 'bg-bad/15 text-bad'];
  };
  return (
    <section className={`${card} grid gap-3`} aria-labelledby="consistency-title">
      <h2 id="consistency-title" className="font-display text-lg font-bold">
        {t('calibration.consistency')}
      </h2>
      <p className="text-sm text-mu">{t('calibration.consistencyHelp', { n: average.toFixed(1) })}</p>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['reviewer', 'reviewsCount', 'averageScore', 'vsAll', 'disputed', 'changedAfter'].map((k) => (
                  <th key={k} className={th}>
                    {t(`calibration.${k}`)}
                  </th>
                ))}
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [label, look] = rate(r);
                return (
                  <tr key={r.name} className="border-t border-bd">
                    <td className={td}>
                      <b>{r.name}</b>
                    </td>
                    <td className={td}>{r.count}</td>
                    <td className={`${td} font-mono`}>{r.avg.toFixed(1)}%</td>
                    <td className={`${td} font-mono`}>
                      {t('calibration.pts', { n: `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)}` })}
                    </td>
                    <td className={td}>{r.disputed}</td>
                    <td className={td}>
                      {r.disputed ? `${r.changed} (${Math.round((r.changed / r.disputed) * 100)}%)` : '-'}
                    </td>
                    <td className={td}>
                      <span className={`${pill} ${look}`}>{t(`calibration.${label}`)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-mu">{t('calibration.noReviews')}</p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------- the session window

function SessionWindow({
  company,
  teams,
  people,
  editing,
  onClose,
  onSaved,
}: {
  company: CompanyRef;
  teams: TeamRow[];
  people: PersonRow[];
  editing?: Session;
  onClose: () => void;
  onSaved: (s: Session) => void;
}) {
  const { t } = useTranslation();
  const { me } = useSession();
  const [d, setD] = useState({
    title: editing?.title ?? '',
    heldOn: editing?.heldOn ?? new Date().toLocaleDateString('sv-SE'),
    status: editing?.status ?? ('planned' as Status),
    notes: editing?.notes ?? '',
    teamIds: editing?.teamIds ?? [],
    participantIds:
      editing?.participants.map((p) => p.membershipId) ??
      people.filter((p) => p.email === me.email).map((p) => p.membershipId),
  });
  const [busy, setBusy] = useState(false);
  const { message, fail } = useAction();
  const staff = people.filter((p) => p.active && STAFF.includes(p.role));

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const saved = await api<Session>(editing ? `/calibrations/${editing.id}` : '/calibrations', company.id, {
        method: editing ? 'PUT' : 'POST',
        body: d,
      });
      onSaved(saved);
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
        aria-labelledby="session-window-title"
        className="w-full max-w-[600px] max-h-[90vh] overflow-auto rounded-l border border-bd bg-pn shadow-card grid gap-4 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="session-window-title" className="font-display text-xl font-bold">
            {editing ? t('calibration.editTitle') : t('calibration.newTitle')}
          </h2>
          <button
            type="button"
            className="text-xl text-mu hover:text-tx"
            aria-label={t('calibration.closeWindow')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <label className={label}>
          {t('calibration.title')}
          <input
            className={field}
            maxLength={150}
            placeholder={t('calibration.titlePlaceholder')}
            value={d.title}
            onChange={(e) => setD({ ...d, title: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            {t('calibration.date')}
            <input
              type="date"
              required
              className={field}
              value={d.heldOn}
              onChange={(e) => setD({ ...d, heldOn: e.target.value })}
            />
          </label>
          <label className={label}>
            {t('calibration.status')}
            <select
              className={field}
              value={d.status}
              onChange={(e) => setD({ ...d, status: e.target.value as Status })}
            >
              {(['planned', 'held', 'closed'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`calibration.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CheckList
          legend={t('calibration.participants')}
          options={staff.map((p) => ({ id: p.membershipId, label: p.name }))}
          value={d.participantIds}
          onChange={(participantIds) => setD({ ...d, participantIds })}
        />
        <CheckList
          legend={t('calibration.teamsDiscussed')}
          options={teams.map((x) => ({ id: x.id, label: x.name }))}
          value={d.teamIds}
          onChange={(teamIds) => setD({ ...d, teamIds })}
        />
        <label className={label}>
          {t('calibration.notes')}
          <textarea
            className={field}
            rows={4}
            maxLength={5000}
            value={d.notes}
            onChange={(e) => setD({ ...d, notes: e.target.value })}
          />
        </label>
        <Notice message={message} />
        <div className="flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton} disabled={busy}>
            {editing ? t('common.save') : t('calibration.create')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- one session

export function CalibrationView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ from: '/calibration/$id' });
  const { company } = useSession();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [editing, setEditing] = useState(false);
  const { message, run, fail } = useAction();

  useEffect(() => {
    if (!company) return;
    api<Session>(`/calibrations/${id}`, company.id).then(setSession, () => setSession(null));
    void Promise.all([
      api<TeamRow[]>('/teams', company.id),
      api<PersonRow[]>('/people', company.id),
      api<ReviewRow[]>('/reviews', company.id),
    ]).then(([tm, ppl, r]) => {
      setTeams(tm.filter((x) => !x.isAdministration));
      setPeople(ppl);
      setReviews(r);
    }, fail);
  }, [company, id, fail]);

  if (!company || session === null) return <NotFound />;
  if (!session) return <p className="text-mu">{t('common.loading')}</p>;

  /** every change answers with the session as this person may see it */
  const send = (path: string, method: 'POST' | 'PUT' | 'DELETE', body: object | undefined, done: string) =>
    run(async () => {
      setSession(await api<Session>(`/calibrations/${session.id}${path}`, company.id, { method, body }));
    }, done);
  const member = Boolean(session.myParticipantId);

  return (
    <section className="grid gap-4" aria-labelledby="session-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-mu">{t('menu.pages.cal')}</p>
          <h1 id="session-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {session.title}
          </h1>
          <p className="text-sm text-mu">
            {session.heldOn} · {t(`calibration.statuses.${session.status}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/$app/$page" params={{ app: 'quality', page: 'calibration' }} className={smallButton}>
            {t('calibration.back')}
          </Link>
          {session.owner && (
            <>
              <button type="button" className={smallButton} onClick={() => setEditing(true)}>
                {t('common.edit')}
              </button>
              <button
                type="button"
                className={dangerButton}
                onClick={() => {
                  if (!window.confirm(t('calibration.confirmDelete'))) return;
                  void run(
                    () => api(`/calibrations/${session.id}`, company.id, { method: 'DELETE' }),
                    t('calibration.deleted'),
                  ).then((ok) => {
                    if (ok) void navigate({ to: '/$app/$page', params: { app: 'quality', page: 'calibration' } });
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

      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewsDiscussed session={session} reviews={reviews} member={member} send={send} />
        <section className={`${card} grid gap-2 content-start`}>
          <h2 className="font-semibold">{t('calibration.notes')}</h2>
          <p className="text-sm whitespace-pre-wrap">{session.notes || '-'}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>{t('calibration.teams')}</b>
            <Chips items={session.teamNames} />
          </div>
        </section>
      </div>

      <Parts session={session} send={send} />
      {session.reviews.length > 0 && <BlindScores session={session} member={member} send={send} />}
      <Decisions session={session} member={member} send={send} />

      {editing && (
        <SessionWindow
          company={company}
          teams={teams}
          people={people}
          editing={session}
          onClose={() => setEditing(false)}
          onSaved={(s) => {
            setSession(s);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

type Send = (
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: object | undefined,
  done: string,
) => Promise<boolean>;

function ReviewsDiscussed({
  session,
  reviews,
  member,
  send,
}: {
  session: Session;
  reviews: ReviewRow[];
  member: boolean;
  send: Send;
}) {
  const { t } = useTranslation();
  const [lead, setLead] = useState('');
  const [missing, setMissing] = useState(false);
  return (
    <section className={`${card} grid gap-2 content-start`} aria-labelledby="discussed-title">
      <h2 id="discussed-title" className="font-semibold">
        {t('calibration.reviews')}
      </h2>
      {session.reviews.length === 0 && <p className="text-sm text-mu">{t('calibration.noneAdded')}</p>}
      <ul className="grid gap-1 text-sm">
        {session.reviews.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 border-t border-bd pt-1">
            <Link to="/review/$id" params={{ id: r.id }} className="hover:underline">
              <b className="font-mono text-ac">{r.leadId}</b> <small>{r.agentName}</small>
            </Link>
            <span className="flex items-center gap-2">
              <b className="font-mono">{r.notScored ? '-' : `${r.score}%`}</b>
              {session.owner && (
                <button
                  type="button"
                  className="text-mu hover:text-bad"
                  title={t('calibration.removeReview')}
                  aria-label={`${t('calibration.removeReview')}: ${r.leadId}`}
                  onClick={() => void send(`/reviews/${r.id}`, 'DELETE', undefined, t('calibration.saved'))}
                >
                  ×
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {(member || session.owner) && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const found = reviews.find((r) => r.leadId.trim().toLowerCase() === lead.trim().toLowerCase());
            setMissing(!found);
            if (found)
              void send('/reviews', 'POST', { reviewId: found.id }, t('calibration.saved')).then(
                (ok) => ok && setLead(''),
              );
          }}
        >
          <input
            className={`${field} flex-1`}
            list="calibration-leads"
            aria-label={t('calibration.leadToAdd')}
            placeholder={t('calibration.leadToAdd')}
            value={lead}
            onChange={(e) => setLead(e.target.value)}
          />
          <datalist id="calibration-leads">
            {reviews.slice(0, 80).map((r) => (
              <option key={r.id} value={r.leadId} />
            ))}
          </datalist>
          <button type="submit" className={smallButton} disabled={!lead.trim()}>
            {t('calibration.add')}
          </button>
        </form>
      )}
      {missing && <p className="text-sm text-bad">{t('calibration.noLead')}</p>}
    </section>
  );
}

function Parts({ session, send }: { session: Session; send: Send }) {
  const { t } = useTranslation();
  const mine = session.participants.find((p) => p.id === session.myParticipantId);
  const [impression, setImpression] = useState(mine?.impression ?? '');
  const [done, setDone] = useState(mine?.done ?? '');
  return (
    <section className={`${card} grid gap-3`} aria-labelledby="parts-title">
      <h2 id="parts-title" className="font-semibold">
        {t('calibration.parts')}
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {session.participants.map((p) => (
          <div key={p.id} className="rounded-m border border-bd p-3 grid gap-2 content-start">
            <div>
              <b>{p.name}</b> <small className="text-mu">{ROLE_LABELS[currentLanguage()][p.role]}</small>
            </div>
            {p.id === session.myParticipantId ? (
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send('/my-part', 'PUT', { impression, done }, t('calibration.partSaved'));
                }}
              >
                <label className="grid gap-1 text-sm font-medium">
                  {t('calibration.impressionsOf')}
                  <textarea
                    className={field}
                    rows={4}
                    maxLength={4000}
                    value={impression}
                    onChange={(e) => setImpression(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  {t('calibration.whatIDid')}
                  <textarea
                    className={field}
                    rows={3}
                    maxLength={4000}
                    value={done}
                    onChange={(e) => setDone(e.target.value)}
                  />
                </label>
                <button type="submit" className={`${primaryButton} justify-self-start`}>
                  {t('calibration.saveMyPart')}
                </button>
              </form>
            ) : (
              <>
                <p className="text-sm">
                  <small className="text-mu block">{t('calibration.impressions')}</small>
                  <span className="whitespace-pre-wrap">{p.impression || '-'}</span>
                </p>
                <p className="text-sm">
                  <small className="text-mu block">{t('calibration.hasDone')}</small>
                  <span className="whitespace-pre-wrap">{p.done || '-'}</span>
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Blind scoring (from Zendesk QA calibration): every participant scores the same reviews on their own; the reference is
 * the review itself or one participant's score (the maker chooses); each score shows its difference from the reference.
 */
function BlindScores({ session, member, send }: { session: Session; member: boolean; send: Send }) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, { score: string; note: string }>>({});
  const names = useMemo(() => new Map(session.participants.map((p) => [p.id, p.name])), [session.participants]);
  const gaps: Record<string, number[]> = {};
  const color = (d: number) => (Math.abs(d) <= 5 ? 'text-ok' : Math.abs(d) <= 10 ? 'text-wn' : 'text-bad');
  const referenceButton = (reviewId: string, who: string) =>
    session.owner ? (
      <button
        type="button"
        className={smallButton}
        onClick={() => void send(`/reference/${reviewId}`, 'PUT', { who }, t('calibration.saved'))}
      >
        {t('calibration.makeReference')}
      </button>
    ) : null;
  const referencePill = <span className={`${pill} bg-ac/15 text-ac`}>{t('calibration.reference')}</span>;

  const blocks = session.reviews.map((r) => {
    const scores = session.scores.filter((s) => s.reviewId === r.id);
    const mine = scores.find((s) => s.participantId === session.myParticipantId);
    const who = session.reference[r.id] ?? 'review';
    const ref =
      who === 'review' ? (r.notScored ? null : r.score) : (scores.find((s) => s.participantId === who)?.score ?? null);
    const draft = drafts[r.id] ?? { score: '', note: '' };
    const others = (session.scoredCount[r.id] ?? 0) - (mine ? 1 : 0);
    for (const s of scores)
      if (ref !== null && s.participantId !== who) (gaps[s.participantId] ??= []).push(Math.abs(s.score - ref));
    return (
      <div key={r.id} className="grid gap-2 border-t border-bd pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <b className="font-mono text-ac">{r.leadId}</b>{' '}
            <small>
              {r.agentName} · {r.scorecardName}
            </small>
          </span>
          <Link to="/review/$id" params={{ id: r.id }} className={smallButton}>
            {t('calibration.openReview')}
          </Link>
        </div>
        {member && !mine && session.status !== 'closed' && (
          <form
            className="grid gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void send(
                `/scores/${r.id}`,
                'PUT',
                { score: Number(draft.score), note: draft.note },
                t('calibration.scoreSaved'),
              );
            }}
          >
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min={0}
                max={100}
                required
                className={`${field} w-36`}
                aria-label={t('calibration.yourScore')}
                placeholder={t('calibration.yourScore')}
                value={draft.score}
                onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, score: e.target.value } })}
              />
              <input
                className={`${field} flex-1 min-w-40`}
                maxLength={500}
                aria-label={t('calibration.why')}
                placeholder={t('calibration.why')}
                value={draft.note}
                onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...draft, note: e.target.value } })}
              />
              <button type="submit" className={primaryButton}>
                {t('calibration.saveScore')}
              </button>
            </div>
            <small className="text-mu">
              {t('calibration.scoreFirst')} {others > 0 && t('calibration.alreadyScored', { count: others })}
            </small>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>{t('calibration.who')}</th>
                <th className={th}>{t('calibration.score')}</th>
                <th className={th}>{t('calibration.difference')}</th>
                <th className={th}>{t('calibration.note')}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-bd">
                <td className={td}>
                  <b>{t('calibration.theReview')}</b> <small className="text-mu">{r.reviewerName}</small>
                </td>
                <td className={`${td} font-mono font-bold`}>{r.notScored ? '-' : `${r.score}%`}</td>
                <td className={td}>{who === 'review' ? referencePill : '-'}</td>
                <td className={td} />
                <td className={td}>{who !== 'review' && referenceButton(r.id, 'review')}</td>
              </tr>
              {scores.map((s) => {
                const d = ref === null ? null : s.score - ref;
                return (
                  <tr key={s.participantId} className="border-t border-bd">
                    <td className={td}>{names.get(s.participantId)}</td>
                    <td className={`${td} font-mono font-bold`}>{s.score}%</td>
                    <td className={td}>
                      {who === s.participantId ? (
                        referencePill
                      ) : d === null ? (
                        '-'
                      ) : (
                        <b className={color(d)}>{t('calibration.pts', { n: `${d > 0 ? '+' : ''}${Math.round(d)}` })}</b>
                      )}
                    </td>
                    <td className={td}>{s.note}</td>
                    <td className={td}>{who !== s.participantId && referenceButton(r.id, s.participantId)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  });
  const summary = Object.entries(gaps)
    .map(([id, list]) => ({ id, n: list.length, d: list.reduce((a, b) => a + b, 0) / list.length }))
    .sort((a, b) => b.d - a.d);
  return (
    <section className={`${card} grid gap-3`} aria-labelledby="blind-title">
      <h2 id="blind-title" className="font-semibold">
        {t('calibration.scoreSame')} <small className="text-mu font-normal">{t('calibration.blind')}</small>
      </h2>
      {blocks}
      {summary.length > 0 && (
        <>
          <h3 className="font-semibold mt-2">{t('calibration.howFar')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>{t('calibration.who')}</th>
                <th className={th}>{t('calibration.reviewsCount')}</th>
                <th className={th}>{t('calibration.averageDifference')}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {summary.map((x) => (
                <tr key={x.id} className="border-t border-bd">
                  <td className={td}>{names.get(x.id)}</td>
                  <td className={td}>{x.n}</td>
                  <td className={`${td} font-mono font-bold`}>{t('calibration.pts', { n: x.d.toFixed(1) })}</td>
                  <td className={td}>
                    {x.d <= 5 ? (
                      <span className={`${pill} bg-ok/15 text-ok`}>{t('calibration.aligned')}</span>
                    ) : x.d <= 10 ? (
                      <span className={`${pill} bg-wn/15 text-wn`}>{t('calibration.close')}</span>
                    ) : (
                      <span className={`${pill} bg-bad/15 text-bad`}>{t('calibration.calibrate')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Decisions({ session, member, send }: { session: Session; member: boolean; send: Send }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ text: '', ownerId: '', due: '' });
  const can = member || session.owner;
  const save = (decisions: Decision[]) => send('/decisions', 'PUT', { decisions }, t('calibration.saved'));
  const nameOf = (id: string) => session.participants.find((p) => p.membershipId === id)?.name;
  return (
    <section className={`${card} grid gap-2`} aria-labelledby="decisions-title">
      <h2 id="decisions-title" className="font-semibold">
        {t('calibration.decisionsTitle')}
      </h2>
      <ul className="grid gap-1 text-sm">
        {session.decisions.map((d, i) => (
          <li key={i} className="flex items-center justify-between gap-2 border-t border-bd pt-1">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={d.done}
                disabled={!can}
                onChange={(e) =>
                  void save(session.decisions.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))
                }
              />
              <span className={d.done ? 'line-through opacity-60' : ''}>
                {d.text}{' '}
                <small className="text-mu">
                  {d.ownerId && `- ${nameOf(d.ownerId) ?? ''}`} {d.due}
                </small>
              </span>
            </label>
            {can && (
              <button
                type="button"
                className="text-mu hover:text-bad"
                title={t('calibration.removeDecision')}
                aria-label={`${t('calibration.removeDecision')}: ${d.text}`}
                onClick={() => void save(session.decisions.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {can && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.text.trim()) return;
            void save([...session.decisions, { ...draft, done: false }]).then(
              (ok) => ok && setDraft({ text: '', ownerId: '', due: '' }),
            );
          }}
        >
          <input
            className={`${field} flex-[2] min-w-48`}
            maxLength={250}
            aria-label={t('calibration.newDecision')}
            placeholder={t('calibration.newDecision')}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
          <select
            className={`${field} flex-1`}
            aria-label={t('calibration.owner')}
            value={draft.ownerId}
            onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
          >
            <option value="">{t('calibration.owner')}</option>
            {session.participants.map((p) => (
              <option key={p.membershipId} value={p.membershipId}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={`${field} flex-1`}
            aria-label={t('calibration.due')}
            value={draft.due}
            onChange={(e) => setDraft({ ...draft, due: e.target.value })}
          />
          <button type="submit" className={primaryButton} disabled={!draft.text.trim()}>
            {t('calibration.add')}
          </button>
        </form>
      )}
    </section>
  );
}
