import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorText } from './api';

interface PlatformCompany {
  id: string;
  name: string;
  createdAt: string;
  people: number;
  admins: number;
}

/** The platform owner area (only for the owner of Q-smart): all client companies, and the AI they may use. */
export function Platform() {
  return (
    <div className="grid gap-4">
      <Companies />
      <AiOffers />
    </div>
  );
}

interface OfferedModel {
  id: string;
  provider: string;
  model: string;
  kind?: 'text' | 'speech';
  offered: boolean;
  recommended: boolean;
}
type Level = 'light' | 'standard' | 'thorough';
const LEVELS: Level[] = ['light', 'standard', 'thorough'];
interface OfferList {
  providers: { id: string; name: string; terms: string; freePlan: boolean; checked: string }[];
  models: OfferedModel[];
  levels: { level: Level; models: string[]; own: boolean }[];
  tasks: { feature: string; kind: 'text' | 'speech' | 'voice'; level: Level; live: boolean; models: string[] }[];
  accounts: OwnAccount[];
  canStoreKeys: boolean;
}
interface OwnAccount {
  provider: string;
  plan: 'free' | 'paid';
  keyHint: string;
  accountId: string | null;
  enabled: boolean;
}
type OnMessage = (m: { ok: boolean; text: string } | null) => void;

/**
 * Which AI companies' models Q-smart offers to client companies (17 November): a model switched off is never used by
 * any company and isn't listed in their choices; the star is the owner's recommended pick.
 */
function AiOffers() {
  const { t } = useTranslation();
  const [data, setData] = useState<OfferList | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api<OfferList>('/platform/ai-models').then(setData, (e: unknown) =>
      setMessage({ ok: false, text: errorText(t, e) }),
    );
  }, [t]);
  async function set(m: OfferedModel, change: Partial<Pick<OfferedModel, 'offered' | 'recommended'>>) {
    setMessage(null);
    try {
      const next = { offered: m.offered, recommended: m.recommended, ...change };
      setData(
        await api<OfferList>('/platform/ai-models', undefined, {
          method: 'PUT',
          body: { modelId: m.id, offered: next.offered, recommended: next.offered && next.recommended },
        }),
      );
      setMessage({ ok: true, text: t('platform.ai.saved') });
    } catch (e) {
      setMessage({ ok: false, text: errorText(t, e) });
    }
  }
  return (
    <section className="bg-pn border border-bd rounded-m p-5 grid gap-4" aria-labelledby="platform-ai-title">
      <div>
        <h2 id="platform-ai-title" className="font-display text-xl font-bold">
          {t('platform.ai.title')}
        </h2>
        <p className="text-sm text-mu">{t('platform.ai.intro')}</p>
      </div>
      {!data && !message && <p className="text-mu">{t('common.loading')}</p>}
      {data?.providers.map((p) => (
        <div key={p.id} className="grid gap-1">
          <h3 className="font-semibold">
            {p.name}{' '}
            <small className="font-normal text-mu">
              {p.terms === 'no-train-dpa' ? t('platform.ai.noTrain') : t('platform.ai.termsOpen')}
            </small>
          </h3>
          <ul className="grid gap-1">
            {data.models
              .filter((m) => m.provider === p.id)
              .map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 border-t border-bd py-1.5 text-sm">
                  <label className="inline-flex flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)]"
                      checked={m.offered}
                      onChange={(e) => void set(m, { offered: e.target.checked })}
                    />
                    <span className="font-mono text-xs">{m.model}</span>
                    <small className="text-mu">{t(`platform.ai.kind.${m.kind ?? 'text'}`)}</small>
                  </label>
                  <button
                    type="button"
                    disabled={!m.offered}
                    aria-pressed={m.recommended}
                    title={t('platform.ai.recommend')}
                    className={`rounded-full border px-2 text-xs font-semibold disabled:opacity-40 ${m.recommended ? 'border-wn bg-wn/15 text-wn' : 'border-bd text-mu hover:text-tx'}`}
                    onClick={() => void set(m, { recommended: !m.recommended })}
                  >
                    ★ {m.recommended ? t('platform.ai.recommended') : t('platform.ai.recommend')}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {data && <Accounts data={data} onSaved={setData} onMessage={setMessage} />}
      {data && <Levels data={data} onSaved={setData} onMessage={setMessage} />}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-ok' : 'text-bad'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

/**
 * Q-smart's own AI accounts (17 November): one key per AI company, serving every client company. The key itself never
 * comes back from the server, only its last 4 characters.
 */
function Accounts({
  data,
  onSaved,
  onMessage,
}: {
  data: OfferList;
  onSaved: (d: OfferList) => void;
  onMessage: OnMessage;
}) {
  const { t } = useTranslation();
  async function move() {
    onMessage(null);
    try {
      const result = await api<OfferList & { moved: number }>(
        '/platform/ai-models/accounts/move-from-companies',
        undefined,
        { method: 'POST', body: {} },
      );
      onSaved(result);
      onMessage({ ok: true, text: t('platform.ai.accounts.moved', { count: result.moved }) });
    } catch (e) {
      onMessage({ ok: false, text: errorText(t, e) });
    }
  }
  return (
    <div className="grid gap-3 border-t border-bd pt-4">
      <div>
        <h3 className="font-semibold">{t('platform.ai.accounts.title')}</h3>
        <p className="text-sm text-mu">{t('platform.ai.accounts.intro')}</p>
      </div>
      {!data.canStoreKeys && (
        <p role="alert" className="text-sm text-bad">
          {t('platform.ai.accounts.noMasterKey')}
        </p>
      )}
      <ul className="grid gap-2">
        {data.providers.map((p) => (
          <AccountRow
            key={p.id}
            provider={p}
            account={data.accounts.find((a) => a.provider === p.id)}
            disabled={!data.canStoreKeys}
            onSaved={onSaved}
            onMessage={onMessage}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!data.canStoreKeys}
          className="rounded-s border border-bd px-3 py-1.5 text-sm font-semibold hover:bg-bg disabled:opacity-40"
          onClick={() => void move()}
        >
          {t('platform.ai.accounts.move')}
        </button>
        <small className="text-mu">{t('platform.ai.accounts.moveIntro')}</small>
      </div>
    </div>
  );
}

function AccountRow({
  provider,
  account,
  disabled,
  onSaved,
  onMessage,
}: {
  provider: OfferList['providers'][number];
  account: OwnAccount | undefined;
  disabled: boolean;
  onSaved: (d: OfferList) => void;
  onMessage: OnMessage;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [accountId, setAccountId] = useState(account?.accountId ?? '');
  const [plan, setPlan] = useState<'free' | 'paid'>(account?.plan ?? 'free');
  const [enabled, setEnabled] = useState(account?.enabled ?? true);
  useEffect(() => {
    setAccountId(account?.accountId ?? '');
    setPlan(account?.plan ?? 'free');
    setEnabled(account?.enabled ?? true);
  }, [account]);
  const needsId = provider.id === 'cloudflare';
  async function send(method: 'PUT' | 'DELETE', body?: object) {
    onMessage(null);
    try {
      onSaved(
        await api<OfferList>(`/platform/ai-models/accounts/${provider.id}`, undefined, {
          method,
          ...(body ? { body } : {}),
        }),
      );
      setApiKey('');
      onMessage({ ok: true, text: t('platform.ai.saved') });
    } catch (e) {
      onMessage({ ok: false, text: errorText(t, e) });
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void send('PUT', {
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(needsId ? { accountId: accountId.trim() || null } : {}),
      plan,
      enabled,
    });
  }
  const idBase = `own-ai-${provider.id}`;
  return (
    <li className="grid gap-2 rounded-s border border-bd p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <strong>{provider.name}</strong>
        <small className="text-mu">{account ? `•••• ${account.keyHint}` : t('platform.ai.accounts.none')}</small>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={save}>
        <label className="grid gap-1" htmlFor={`${idBase}-key`}>
          <span className="text-xs text-mu">{t('platform.ai.accounts.key')}</span>
          <input
            id={`${idBase}-key`}
            type="password"
            autoComplete="off"
            className="rounded-s border border-bd bg-bg px-2 py-1"
            placeholder={account ? t('platform.ai.accounts.keyKeep') : ''}
            value={apiKey}
            disabled={disabled}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        {needsId && (
          <label className="grid gap-1" htmlFor={`${idBase}-id`}>
            <span className="text-xs text-mu">{t('platform.ai.accounts.accountId')}</span>
            <input
              id={`${idBase}-id`}
              className="rounded-s border border-bd bg-bg px-2 py-1 font-mono text-xs"
              value={accountId}
              disabled={disabled}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </label>
        )}
        <label className="grid gap-1" htmlFor={`${idBase}-plan`}>
          <span className="text-xs text-mu">{t('platform.ai.accounts.plan')}</span>
          <select
            id={`${idBase}-plan`}
            className="rounded-s border border-bd bg-bg px-2 py-1"
            value={plan}
            disabled={disabled}
            onChange={(e) => setPlan(e.target.value === 'paid' ? 'paid' : 'free')}
          >
            <option value="free">{t('platform.ai.accounts.free')}</option>
            <option value="paid">{t('platform.ai.accounts.paid')}</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 pb-1.5">
          <input
            type="checkbox"
            className="accent-[var(--brand)]"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {t('platform.ai.accounts.enabled')}
        </label>
        <button
          type="submit"
          disabled={disabled || (!account && !apiKey.trim())}
          className="rounded-s bg-[var(--brand)] px-3 py-1.5 font-semibold text-white disabled:opacity-40"
        >
          {t('platform.ai.accounts.save')}
        </button>
        {account && (
          <button
            type="button"
            className="rounded-s border border-bd px-3 py-1.5 text-bad hover:bg-bg"
            onClick={() => {
              if (window.confirm(t('platform.ai.accounts.removeConfirm'))) void send('DELETE');
            }}
          >
            {t('platform.ai.accounts.remove')}
          </button>
        )}
      </form>
    </li>
  );
}

/**
 * Effort levels (17 November): behind each level, the models that serve it, best first; and each AI task's level.
 * Clients never see any of it.
 */
function Levels({
  data,
  onSaved,
  onMessage,
}: {
  data: OfferList;
  onSaved: (d: OfferList) => void;
  onMessage: (m: { ok: boolean; text: string } | null) => void;
}) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const nameOf = (id: string) => data.models.find((m) => m.id === id)?.model ?? id;
  const kindOf = (id: string) => data.models.find((m) => m.id === id)?.kind ?? 'text';
  const listOf = (l: Level) => drafts[l] ?? data.levels.find((x) => x.level === l)?.models ?? [];
  const setList = (l: Level, models: string[]) => setDrafts({ ...drafts, [l]: models });
  async function send(path: string, body: object, after?: () => void) {
    onMessage(null);
    try {
      onSaved(await api<OfferList>(`/platform/ai-models/${path}`, undefined, { method: 'PUT', body }));
      after?.();
      onMessage({ ok: true, text: t('platform.ai.saved') });
    } catch (e) {
      onMessage({ ok: false, text: errorText(t, e) });
    }
  }
  return (
    <div className="grid gap-4 border-t border-bd pt-4">
      <div>
        <h3 className="font-semibold">{t('platform.ai.levels.title')}</h3>
        <p className="text-sm text-mu">{t('platform.ai.levels.intro')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {LEVELS.map((l) => {
          const list = listOf(l);
          const free = data.models.filter((m) => m.offered && !list.includes(m.id));
          return (
            <section
              key={l}
              className="grid content-start gap-2 rounded-s border border-bd p-3"
              aria-label={t(`platform.ai.level.${l}`)}
            >
              <b>{t(`platform.ai.level.${l}`)}</b>
              <ol className="grid gap-1 text-sm">
                {list.map((id, i) => (
                  <li key={id} className="flex items-center gap-1">
                    <span className="w-4 text-mu">{i + 1}.</span>
                    <span className="flex-1 font-mono text-xs">{nameOf(id)}</span>
                    <small className="text-mu">{t(`platform.ai.kind.${kindOf(id)}`)}</small>
                    <button
                      type="button"
                      className="px-1 text-mu hover:text-tx disabled:opacity-30"
                      disabled={!i}
                      aria-label={t('platform.ai.levels.up')}
                      onClick={() =>
                        setList(
                          l,
                          list.map((x, j) => (j === i - 1 ? id : j === i ? (list[i - 1] ?? x) : x)),
                        )
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="px-1 text-mu hover:text-bad"
                      aria-label={t('platform.ai.levels.remove')}
                      onClick={() =>
                        setList(
                          l,
                          list.filter((x) => x !== id),
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
              {free.length > 0 && (
                <select
                  className="rounded-s border border-bd2 bg-pn px-2 py-1 text-sm"
                  aria-label={t('platform.ai.levels.add')}
                  value=""
                  onChange={(e) => e.target.value && setList(l, [...list, e.target.value])}
                >
                  <option value="">+ {t('platform.ai.levels.add')}</option>
                  {free.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.model}
                    </option>
                  ))}
                </select>
              )}
              {drafts[l] && (
                <button
                  type="button"
                  className="justify-self-start rounded-m bg-brand px-3 py-1 text-sm font-semibold text-on-brand"
                  onClick={() =>
                    void send('levels', { level: l, models: list }, () =>
                      setDrafts(Object.fromEntries(Object.entries(drafts).filter(([k]) => k !== l))),
                    )
                  }
                >
                  {t('platform.ai.levels.save')}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <div>
        <h3 className="font-semibold">{t('platform.ai.tasks.title')}</h3>
        <p className="text-sm text-mu">{t('platform.ai.tasks.intro')}</p>
      </div>
      <ul className="grid gap-1">
        {data.tasks.map((task) => (
          <li key={task.feature} className="flex flex-wrap items-center gap-3 border-t border-bd py-1.5 text-sm">
            <span className="flex-1">
              <b>{t(`platform.ai.task.${task.feature.replace('.', '_')}`)}</b>{' '}
              {!task.live && <small className="text-mu">({t('platform.ai.tasks.later')})</small>}
              <small className="block text-mu">
                {task.models.length ? task.models.map(nameOf).join(' › ') : t('platform.ai.tasks.noModel')}
              </small>
            </span>
            <select
              className="rounded-s border border-bd2 bg-pn px-2 py-1 text-sm"
              aria-label={t(`platform.ai.task.${task.feature.replace('.', '_')}`)}
              value={task.level}
              onChange={(e) => void send('tasks', { feature: task.feature, level: e.target.value })}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`platform.ai.level.${l}`)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** All client companies, and a new one with its first admin invited. */
function Companies() {
  const { t, i18n } = useTranslation();
  const [companies, setCompanies] = useState<PlatformCompany[] | null>(null);
  const [name, setName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api<PlatformCompany[]>('/platform/companies').then(setCompanies, (e: unknown) =>
      setMessage({ ok: false, text: errorText(t, e) }),
    );
  }, [t]);
  useEffect(load, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api('/platform/companies', undefined, { body: { name, adminName, adminEmail } });
      setMessage({ ok: true, text: t('platform.created', { company: name, email: adminEmail }) });
      setName('');
      setAdminName('');
      setAdminEmail('');
      load();
    } catch (e) {
      setMessage({ ok: false, text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-s border border-bd2 bg-pn px-3 py-2 text-tx focus:border-brand';
  return (
    <section className="bg-pn border border-bd rounded-m p-5 grid gap-4" aria-labelledby="platform-title">
      <div>
        <h2 id="platform-title" className="font-display text-xl font-bold">
          {t('platform.title')}
        </h2>
        <p className="text-sm text-mu">{t('platform.intro')}</p>
      </div>
      {!companies && <p className="text-mu">{t('common.loading')}</p>}
      {companies && (
        <table className="w-full text-sm">
          <thead className="text-left text-mu">
            <tr>
              <th className="py-1 font-semibold">{t('platform.company')}</th>
              <th className="py-1 font-semibold">{t('platform.people')}</th>
              <th className="py-1 font-semibold">{t('platform.admins')}</th>
              <th className="py-1 font-semibold">{t('platform.since')}</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-t border-bd">
                <td className="py-2 font-semibold">{c.name}</td>
                <td className="py-2">{c.people}</td>
                <td className="py-2">{c.admins}</td>
                <td className="py-2">{new Date(c.createdAt).toLocaleDateString(i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-3 items-end border-t border-bd pt-4">
        <h3 className="sm:col-span-3 font-semibold">{t('platform.new')}</h3>
        <label className="grid gap-1 text-sm font-medium">
          {t('platform.company')}
          <input className={field} required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('platform.adminName')}
          <input
            className={field}
            required
            minLength={2}
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('platform.adminEmail')}
          <input
            className={field}
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="sm:col-span-3 justify-self-start rounded-m bg-brand text-on-brand font-semibold px-4 py-2 disabled:opacity-60"
        >
          {t('platform.create')}
        </button>
        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={`sm:col-span-3 text-sm ${message.ok ? 'text-ok' : 'text-bad'}`}
          >
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}
