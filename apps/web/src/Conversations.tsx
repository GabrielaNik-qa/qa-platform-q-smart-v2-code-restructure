// Quality › Conversations (today: "all the calls, chats and tickets to choose from for a review"): the conversations
// of the agents a person can see (agents: their own), with filters; admins and reviewers add one by pasting or
// uploading its transcript, with the conversation's and the customer's fields (Admin › Fields), change and delete it.
// A transcript is only text, deleted after the company's days (Admin › System settings); recordings are never stored.
import { can, type FieldDef } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from './api';
import { AiReviewBulk, AiReviewPanel, type ScorecardChoice } from './AiReview';
import { type FieldLists, FieldInput, useFieldNames, useFieldValue } from './Fields';
import { currentLanguage } from './i18n';
import {
  card,
  type CompanyRef,
  dangerButton,
  field,
  Notice,
  type PersonRow,
  primaryButton,
  smallButton,
  useAction,
} from './ui';

type Channel = 'call' | 'chat' | 'email' | 'other';
interface Row {
  id: string;
  channel: Channel;
  channelName: string;
  startedAt: string;
  agentId: string | null;
  agentName: string;
  teamName: string;
  customerId: string | null;
  link: string;
  values: Record<string, unknown>;
  hasTranscript: boolean;
  reviewIds: string[];
  aiReviewed: boolean;
  aiHold: string;
  humanScorecardId: string | null;
}
interface Full extends Row {
  transcript: string | null;
  customer: { id: string; externalId: string; values: Record<string, unknown> } | null;
}
/** The conversation's fields kept in their own columns (drawn by hand in the form). */
const COLUMNS = new Set(['channel', 'startedAt', 'agent', 'team']);
const LOCALES = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' } as const;
const th = 'py-1 pr-3 font-semibold';
const td = 'py-2 pr-3';

/** "Customer: …" / "Agent: …" lines as a conversation; anything else stays as written. */
function Transcript({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const isChat = lines.filter((l) => /^[\p{L} .'-]{1,30}:\s/u.test(l)).length >= 2;
  if (!isChat) return <pre className="whitespace-pre-wrap rounded-s bg-sunk p-3 text-sm">{text}</pre>;
  return (
    <ol className="grid gap-2">
      {lines
        .filter((l) => l.trim())
        .map((line, i) => {
          const m = /^([\p{L} .'-]{1,30}):\s?(.*)$/u.exec(line);
          const who = m?.[1] ?? '';
          const agent = /agent|агент/i.test(who);
          return (
            <li key={i} className={`flex ${agent ? 'justify-end' : ''}`}>
              <span className={`max-w-[85%] rounded-m px-3 py-2 text-sm ${agent ? 'bg-ac/15' : 'bg-sunk'}`}>
                {who && <b className="block text-xs text-mu">{who}</b>}
                {m ? m[2] : line}
              </span>
            </li>
          );
        })}
    </ol>
  );
}

interface Draft {
  id: string | null;
  channel: Channel;
  channelName: string;
  startedAt: string;
  agentId: string;
  link: string;
  transcript: string;
  values: Record<string, unknown>;
  customerId: string | null;
  customer: Record<string, unknown>;
}
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const toLocal = (iso: string) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function Conversations({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const names = useFieldNames();
  const show = useFieldValue();
  const writer = can(company.role, 'conversations.write');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fields, setFields] = useState<FieldLists | null>(null);
  const [agents, setAgents] = useState<PersonRow[]>([]);
  const [filter, setFilter] = useState({ from: '', to: '', agent: '', channel: '' });
  const [open, setOpen] = useState<Full | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardChoice[]>([]);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    api<Row[]>(`/conversations${q.size ? `?${q}` : ''}`, company.id).then(setRows, fail);
  }, [company.id, filter, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    api<FieldLists>('/fields', company.id).then(setFields, fail);
    if (writer) api<ScorecardChoice[]>('/scorecards', company.id).then(setScorecards, () => setScorecards([]));
    if (writer || company.role !== 'agent')
      api<PersonRow[]>('/people', company.id)
        .then((p) => setAgents(p.filter((x) => x.role === 'agent' && x.active)))
        .catch(() => setAgents([]));
  }, [company.id, company.role, writer, fail]);

  const convFields = useMemo(
    () => (fields?.conversation ?? []).filter((f) => !f.hidden && !COLUMNS.has(f.key)),
    [fields],
  );
  const customerFields = useMemo(() => (fields?.customer ?? []).filter((f) => !f.hidden), [fields]);
  const outcome = fields?.conversation.find((f) => f.key === 'outcome');
  const when = (iso: string) =>
    new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const channelName = (r: Pick<Row, 'channel' | 'channelName'>) =>
    r.channel === 'other' && r.channelName ? r.channelName : t(`cfields.options.channel.${r.channel}`);

  async function openOne(id: string) {
    setDraft(null);
    try {
      setOpen(await api<Full>(`/conversations/${id}`, company.id));
    } catch (e) {
      fail(e);
    }
  }
  function startNew() {
    setOpen(null);
    setBad([]);
    setDraft({
      id: null,
      channel: 'chat',
      channelName: '',
      startedAt: nowLocal(),
      agentId: agents[0]?.membershipId ?? '',
      link: '',
      transcript: '',
      values: {},
      customerId: null,
      customer: {},
    });
  }
  function startEdit(c: Full) {
    setBad([]);
    setDraft({
      id: c.id,
      channel: c.channel,
      channelName: c.channelName,
      startedAt: toLocal(c.startedAt),
      agentId: c.agentId ?? '',
      link: c.link,
      transcript: c.transcript ?? '',
      values: c.values,
      customerId: c.customer?.id ?? null,
      customer: c.customer?.values ?? {},
    });
    setOpen(null);
  }
  async function upload(file: File | undefined) {
    if (!file || !draft) return;
    if (file.size > 400_000) {
      fail(new Error(t('conversations.tooBig')));
      return;
    }
    const text = await file.text();
    setDraft({ ...draft, transcript: text.slice(0, 100_000) });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const hasCustomer = draft.customerId || Object.values(draft.customer).some((v) => v !== '' && v !== undefined);
    const body = {
      channel: draft.channel,
      channelName: draft.channelName,
      startedAt: new Date(draft.startedAt).toISOString(),
      agentId: draft.agentId,
      link: draft.link.trim(),
      transcript: draft.transcript,
      values: draft.values,
      customer: hasCustomer ? { ...(draft.customerId ? { id: draft.customerId } : {}), values: draft.customer } : null,
    };
    setBad([]);
    try {
      const saved = await api<Full>(draft.id ? `/conversations/${draft.id}` : '/conversations', company.id, {
        method: draft.id ? 'PUT' : 'POST',
        body,
      });
      await run(async () => saved, draft.id ? t('conversations.saved') : t('conversations.added'), load);
      setDraft(null);
      setOpen(saved);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setBad(e.fields);
      await run(() => Promise.reject(e), '');
    }
  }
  async function remove(c: Full) {
    if (!window.confirm(t('conversations.confirmDelete'))) return;
    const ok = await run(
      () => api(`/conversations/${c.id}`, company.id, { method: 'DELETE' }),
      t('conversations.deleted'),
      load,
    );
    if (ok) setOpen(null);
  }

  const fieldRows = (defs: FieldDef[], values: Record<string, unknown>) =>
    defs
      .map((d) => [d, show(d, values[d.key])] as const)
      .filter(([, v]) => v)
      .map(([d, v]) => (
        <div key={d.key} className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-3 text-sm">
          <dt className="text-mu">{names.field(d)}</dt>
          <dd>
            {d.type === 'link' ? (
              <a href={v} target="_blank" rel="noreferrer" className="underline">
                {v}
              </a>
            ) : (
              v
            )}
          </dd>
        </div>
      ));

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.cs_conv')}</h1>
          <p className="text-sm text-mu">{t('conversations.intro')}</p>
        </div>
        {writer && !draft && (
          <button type="button" className={primaryButton} onClick={startNew}>
            + {t('conversations.add')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3" role="group" aria-label={t('conversations.filters')}>
        <label className="grid gap-1 text-xs text-mu">
          {t('conversations.from')}
          <input
            type="date"
            className={field}
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-mu">
          {t('conversations.to')}
          <input
            type="date"
            className={field}
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          />
        </label>
        {company.role !== 'agent' && (
          <label className="grid gap-1 text-xs text-mu">
            {t('conversations.agent')}
            <select
              className={field}
              value={filter.agent}
              onChange={(e) => setFilter({ ...filter, agent: e.target.value })}
            >
              <option value="">{t('conversations.allAgents')}</option>
              {agents.map((a) => (
                <option key={a.membershipId} value={a.membershipId}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-xs text-mu">
          {t('conversations.channel')}
          <select
            className={field}
            value={filter.channel}
            onChange={(e) => setFilter({ ...filter, channel: e.target.value })}
          >
            <option value="">{t('conversations.allChannels')}</option>
            {(['call', 'chat', 'email', 'other'] as const).map((c) => (
              <option key={c} value={c}>
                {t(`cfields.options.channel.${c}`)}
              </option>
            ))}
          </select>
        </label>
        {Object.values(filter).some(Boolean) && (
          <button
            type="button"
            className={smallButton}
            onClick={() => setFilter({ from: '', to: '', agent: '', channel: '' })}
          >
            {t('conversations.reset')}
          </button>
        )}
      </div>
      <Notice message={message} />

      {draft && fields && (
        <form
          onSubmit={(e) => void save(e)}
          className={`${card} grid gap-4`}
          aria-labelledby="conv-form-title"
          noValidate
        >
          <h2 id="conv-form-title" className="text-lg font-semibold">
            {draft.id ? t('conversations.editTitle') : t('conversations.addTitle')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              {names.field(fields.conversation.find((f) => f.key === 'channel') as FieldDef)}
              <select
                className={field}
                value={draft.channel}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value as Channel })}
              >
                {(['call', 'chat', 'email', 'other'] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`cfields.options.channel.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            {draft.channel === 'other' && (
              <label className="grid gap-1 text-sm font-medium">
                {t('conversations.channelName')}
                <input
                  className={field}
                  maxLength={60}
                  placeholder="WhatsApp, SMS …"
                  value={draft.channelName}
                  onChange={(e) => setDraft({ ...draft, channelName: e.target.value })}
                />
              </label>
            )}
            <label className="grid gap-1 text-sm font-medium">
              {names.field(fields.conversation.find((f) => f.key === 'startedAt') as FieldDef)}
              <input
                type="datetime-local"
                className={field}
                required
                value={draft.startedAt}
                onChange={(e) => setDraft({ ...draft, startedAt: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {names.field(fields.conversation.find((f) => f.key === 'agent') as FieldDef)}
              <select
                className={field}
                required
                value={draft.agentId}
                onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
              >
                <option value="">{t('cfields.choose')}</option>
                {agents.map((a) => (
                  <option key={a.membershipId} value={a.membershipId}>
                    {a.name} {a.teamName ? `(${a.teamName})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('conversations.link')}
              <input
                type="url"
                className={field}
                placeholder="https://"
                value={draft.link}
                onChange={(e) => setDraft({ ...draft, link: e.target.value })}
              />
            </label>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('conversations.transcript')}</legend>
            <textarea
              className={`${field} font-mono text-sm`}
              rows={8}
              maxLength={100_000}
              placeholder={t('conversations.transcriptHint')}
              aria-label={t('conversations.transcript')}
              value={draft.transcript}
              onChange={(e) => setDraft({ ...draft, transcript: e.target.value })}
            />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className={`${smallButton} cursor-pointer`}>
                {t('conversations.upload')}
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="sr-only"
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              <small className="text-mu">{t('conversations.transcriptHelp')}</small>
            </div>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1 font-semibold">{t('conversations.fieldsTitle')}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {convFields.map((d) => (
                <div key={d.key} className="grid gap-1 text-sm font-medium">
                  <label htmlFor={`cf-${d.key}`}>
                    {names.field(d)}
                    {d.required && <span className="text-bad"> *</span>}
                  </label>
                  <FieldInput
                    id={`cf-${d.key}`}
                    def={d}
                    bad={bad.includes(d.key)}
                    value={draft.values[d.key]}
                    onChange={(v) => setDraft({ ...draft, values: { ...draft.values, [d.key]: v } })}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1 font-semibold">{t('conversations.customerTitle')}</legend>
            <p className="text-xs text-mu">{t('conversations.customerHelp')}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customerFields.map((d) => (
                <div key={d.key} className="grid gap-1 text-sm font-medium">
                  <label htmlFor={`cu-${d.key}`}>
                    {names.field(d)}
                    {d.required && <span className="text-bad"> *</span>}
                  </label>
                  <FieldInput
                    id={`cu-${d.key}`}
                    def={d}
                    bad={bad.includes(`customer.${d.key}`)}
                    value={draft.customer[d.key]}
                    onChange={(v) => setDraft({ ...draft, customer: { ...draft.customer, [d.key]: v } })}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton}>
              {draft.id ? t('common.save') : t('conversations.addIt')}
            </button>
            <button type="button" className={smallButton} onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {open && fields && (
        <article className={`${card} grid gap-4`} aria-labelledby="conv-title">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="conv-title" className="text-lg font-semibold">
                {channelName(open)} · {open.agentName}
              </h2>
              <p className="text-sm text-mu">
                {when(open.startedAt)}
                {open.teamName ? ` · ${open.teamName}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {open.reviewIds.map((id, i) => (
                <Link key={id} to="/review/$id" params={{ id }} className={smallButton}>
                  {t('conversations.openReview', { n: open.reviewIds.length > 1 ? i + 1 : '' })} ›
                </Link>
              ))}
              {writer && (
                <>
                  <button type="button" className={smallButton} onClick={() => startEdit(open)}>
                    {t('common.edit')}
                  </button>
                  <button type="button" className={dangerButton} onClick={() => void remove(open)}>
                    {t('common.delete')}
                  </button>
                </>
              )}
              <button
                type="button"
                className={smallButton}
                onClick={() => setOpen(null)}
                aria-label={t('conversations.close')}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="grid content-start gap-2">
              <h3 className="text-sm font-semibold">{t('conversations.transcript')}</h3>
              {open.transcript ? (
                <Transcript text={open.transcript} />
              ) : (
                <p className="text-sm text-mu">{t('conversations.noTranscript')}</p>
              )}
            </div>
            <div className="grid content-start gap-4">
              <dl className="grid gap-1.5">
                <h3 className="text-sm font-semibold">{t('conversations.fieldsTitle')}</h3>
                {fieldRows(convFields, open.values)}
                {open.link && (
                  <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-3 text-sm">
                    <dt className="text-mu">{t('conversations.link')}</dt>
                    <dd>
                      <a href={open.link} target="_blank" rel="noreferrer" className="underline">
                        {t('conversations.openLink')} ↗
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              {writer && (
                <AiReviewPanel
                  key={open.id}
                  company={company}
                  conversation={open}
                  scorecards={scorecards}
                  onDone={() => {
                    load();
                    void api<Full>(`/conversations/${open.id}`, company.id).then(setOpen, fail);
                  }}
                />
              )}
              {open.customer && (
                <dl className="grid gap-1.5">
                  <h3 className="text-sm font-semibold">{t('conversations.customerTitle')}</h3>
                  {fieldRows(customerFields, open.customer.values)}
                </dl>
              )}
            </div>
          </div>
        </article>
      )}

      {writer && rows && !draft && <AiReviewBulk company={company} rows={rows} scorecards={scorecards} onDone={load} />}

      {!rows ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className={`${card} text-sm text-mu`}>{t('conversations.none')}</p>
      ) : (
        <div className={`${card} overflow-x-auto p-3`}>
          <p className="mb-2 text-xs text-mu">{t('conversations.count', { count: rows.length })}</p>
          <table className="w-full text-sm">
            <thead className="text-left text-mu">
              <tr>
                <th className={th}>{t('conversations.when')}</th>
                <th className={th}>{t('conversations.agent')}</th>
                <th className={th}>{t('conversations.channel')}</th>
                <th className={th}>{outcome ? names.field(outcome) : ''}</th>
                <th className={th}>{t('conversations.transcript')}</th>
                <th className={th}>{t('conversations.review')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((r) => (
                <tr key={r.id} className={`border-t border-bd ${open?.id === r.id ? 'bg-sunk' : ''}`}>
                  <td className={`${td} whitespace-nowrap`}>
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={() => void openOne(r.id)}
                    >
                      {when(r.startedAt)}
                    </button>
                  </td>
                  <td className={td}>
                    {r.agentName}
                    {r.teamName && <small className="block text-mu">{r.teamName}</small>}
                  </td>
                  <td className={td}>{channelName(r)}</td>
                  <td className={td}>{outcome ? show(outcome, r.values['outcome']) : ''}</td>
                  <td className={td}>
                    {r.hasTranscript ? <span className="text-ok">✓</span> : <span className="text-mu">-</span>}
                  </td>
                  <td className={td}>
                    {r.reviewIds[0] ? (
                      <Link to="/review/$id" params={{ id: r.reviewIds[0] }} className="text-ok underline">
                        {t('conversations.reviewed')}
                      </Link>
                    ) : (
                      <span className="text-mu">-</span>
                    )}
                    {r.aiReviewed && (
                      <span className="ml-1 rounded-full bg-ac/15 px-1.5 text-xs" title={t('autoqa.badge')}>
                        AI
                      </span>
                    )}
                    {r.aiHold && <span className="ml-1 text-xs text-bad">{t('autoqa.heldShort')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p className="mt-2 text-xs text-mu">{t('conversations.first500')}</p>}
        </div>
      )}
    </section>
  );
}

/** Admin › System settings: how long transcripts are kept (today's choices; 0 keeps them until deleted by hand). */
export function TranscriptDaysCard({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ days: number; choices: number[] } | null>(null);
  const { message, run, fail } = useAction();
  const load = useCallback(() => {
    api<{ days: number; choices: number[] }>('/transcript-days', company.id).then(setState, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  if (!state) return null;
  return (
    <div className={`${card} grid gap-3`}>
      <h2 className="font-semibold">{t('conversations.daysTitle')}</h2>
      <p className="text-sm text-mu">{t('conversations.daysHelp')}</p>
      <label className="grid max-w-xs gap-1 text-sm font-medium">
        {t('conversations.daysLabel')}
        <select
          className={field}
          value={state.days}
          onChange={(e) => {
            const days = Number(e.target.value);
            void run(
              () => api('/transcript-days', company.id, { method: 'PUT', body: { days } }),
              t('conversations.daysSaved'),
              load,
            );
          }}
        >
          {state.choices.map((d) => (
            <option key={d} value={d}>
              {d === 0
                ? t('conversations.keepForEver')
                : d === 365
                  ? t('conversations.oneYear')
                  : t('conversations.days', { count: d })}
            </option>
          ))}
        </select>
      </label>
      <Notice message={message} />
    </div>
  );
}
