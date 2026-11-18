// Admin › AI (admins only), simple: no AI company or model names and no place to connect keys, because Q-smart is
// the mediator (17 November). Four tabs: Overview, Usage & limits, Rules and Quality. The detailed AI views (the free
// allowance per model, every call with its model, the AI companies allowed) and the test set live in the owner area
// (AiOwnerDetails), on the demo company.
import type { Language } from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { AutoQAOverview } from './AutoQA';
import { currentLanguage } from './i18n';
import { TestSet } from './TestSet';
import { CheckList, card, type CompanyRef, dangerButton, field, Notice, primaryButton, useAction } from './ui';

interface AiLimit {
  microUsd?: number;
  calls?: number;
}
interface Rules {
  enabled: boolean;
  euOnly: boolean;
  allowedProviders: string[];
  allowPaid: boolean;
  limits: { company?: AiLimit; teams?: Record<string, AiLimit> };
  reviews: { announcedAt?: string; announcedBy?: string; channels?: Channel[] };
}
type Channel = 'call' | 'chat' | 'email' | 'other';
interface Account {
  provider: string;
  plan: 'free' | 'paid';
  keyHint: string;
  accountId: string | null;
  enabled: boolean;
  byName: string;
  updatedAt: string;
}
interface Provider {
  id: string;
  name: string;
  terms: 'may-train' | 'no-train-dpa';
  euProcessing: boolean;
  freePlan: boolean;
  checked: string;
  sources: string[];
}
interface Model {
  id: string;
  provider: string;
  model: string;
  priceIn: number;
  priceOut: number;
  context: number;
}
interface Use {
  feature: string;
  teamId: string | null;
  provider: string | null;
  microUsd: number;
  calls: number;
}
interface Call {
  id: string;
  feature: string;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  /** speech-to-text: the recording's length (the recording itself is never kept) */
  audioSeconds?: number;
  costMicroUsd: number;
  waitMs: number;
  status: string;
  attempt: number;
  error: string | null;
  createdAt: string;
}
interface Overview {
  rules: Rules;
  accounts: Account[];
  providers: Provider[];
  models: Model[];
  canStoreKeys: boolean;
  use: Use[];
  teams: { id: string; name: string }[];
  recent: Call[];
  allowance: {
    now: string;
    nextUtcMidnight: string;
    seen: { provider: string; model: string; limits: Record<string, string>; seenAt: string }[];
    today: { provider: string; model: string; calls: number; inputTokens: number; outputTokens: number }[];
    cloudflare: { neuronsUsed: number; neuronsFree: number };
  };
  /** each free-plan model's limits, as the engine checks them before every call */
  limits: ModelLimits[];
  /** each AI task's use since 00:00 UTC */
  tasksToday: {
    feature: string;
    calls: number;
    failed: number;
    cached: number;
    inputTokens: number;
    outputTokens: number;
    audioSeconds: number;
    microUsd: number;
  }[];
  /** the latest calls without a usable answer */
  errors: Call[];
}
type LimitKind = 'rpm' | 'rpd' | 'tpm' | 'tpd' | 'ash' | 'asd';
interface ModelLimits {
  provider: string;
  model: string;
  status: 'available' | 'approaching' | 'reached' | 'unavailable';
  waitMs: number;
  rows: { kind: LimitKind; limit: number; used: number; source: 'account' | 'published'; freeAt: string | null }[];
  checked: string;
  source: string;
}
const STATUS_LOOK: Record<ModelLimits['status'], string> = {
  available: 'bg-ok/15 text-ok',
  approaching: 'bg-wn/15 text-wn',
  reached: 'bg-bad/15 text-bad',
  unavailable: 'bg-bd/40 text-mu',
};

const LOCALES: Record<Language, string> = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' };
const dollars = (microUsd: number, lang: Language) =>
  new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(
    microUsd / 1_000_000,
  );
const number = (n: number, lang: Language) => new Intl.NumberFormat(LOCALES[lang]).format(n);
const when = (at: string, lang: Language) =>
  new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'short', timeStyle: 'short' }).format(new Date(at));
const th = 'py-1 pr-3 font-semibold';
const td = 'py-2 pr-3';

const header = (title: string, intro: string) => (
  <div className="grid gap-1">
    <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{title}</h1>
    <p className="text-sm text-mu">{intro}</p>
  </div>
);

function useOverview(company: CompanyRef) {
  const [data, setData] = useState<Overview | null>(null);
  const action = useAction();
  const { fail } = action;
  const load = useCallback(() => {
    api<Overview>('/ai', company.id).then(setData, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  return { data, load, ...action };
}

/** A task's name (job type), e.g. ai.test → "Connection test". */
function useNames() {
  const { t } = useTranslation();
  return {
    feature: (f: string) => t(`ai.features.${f.replace('.', '_')}`, { defaultValue: f }),
    status: (s: string) => t(`ai.status.${s}`, { defaultValue: s }),
  };
}

function RulesCard({
  company,
  data,
  run,
  reload,
}: {
  company: CompanyRef;
  data: Overview;
  run: ReturnType<typeof useAction>['run'];
  reload: () => void;
}) {
  const { t } = useTranslation();
  const [euOnly, setEuOnly] = useState(data.rules.euOnly);
  const [allowed, setAllowed] = useState(data.rules.allowedProviders);
  const [allowPaid, setAllowPaid] = useState(data.rules.allowPaid);

  async function save(event: FormEvent) {
    event.preventDefault();
    await run(
      () =>
        api('/ai/rules', company.id, {
          method: 'PUT',
          body: { euOnly, allowedProviders: allowed, allowPaid },
        }),
      t('ai.rulesSaved'),
      reload,
    );
  }

  return (
    <form onSubmit={save} className={`${card} grid gap-3`}>
      <h2 className="text-lg font-semibold">{t('ai.rulesTitle')}</h2>
      <p className="text-sm text-mu">{t('ai.rulesIntro')}</p>
      <CheckList
        legend={t('ai.allowed')}
        options={data.providers.map((p) => ({ id: p.id, label: p.name }))}
        value={allowed}
        onChange={setAllowed}
      />
      <p className="text-xs text-mu">{t('ai.allowedHelp')}</p>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--brand)]"
          checked={euOnly}
          onChange={(e) => setEuOnly(e.target.checked)}
        />
        {t('ai.euOnly')}
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--brand)]"
          checked={allowPaid}
          onChange={(e) => setAllowPaid(e.target.checked)}
        />
        {t('ai.allowPaid')}
      </label>
      <p className="text-xs text-mu">{t('ai.alwaysRule')}</p>
      <div>
        <button type="submit" className={primaryButton}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------- AI usage limits

const asText = (n: number | undefined, scale = 1) => (n === undefined ? '' : String(n / scale));
const asLimit = (calls: string, usd: string): AiLimit => ({
  ...(calls.trim() !== '' ? { calls: Number(calls) } : {}),
  ...(usd.trim() !== '' ? { microUsd: Math.round(Number(usd) * 1_000_000) } : {}),
});

export function AiUsage({ company, view = 'owner' }: { company: CompanyRef; view?: 'owner' | 'client' }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const names = useNames();
  const { data, load, message, run } = useOverview(company);
  const [limits, setLimits] = useState<Record<string, { calls: string; usd: string }> | null>(null);

  useEffect(() => {
    if (!data) return;
    const all: Record<string, { calls: string; usd: string }> = {
      company: {
        calls: asText(data.rules.limits.company?.calls),
        usd: asText(data.rules.limits.company?.microUsd, 1_000_000),
      },
    };
    for (const team of data.teams)
      all[team.id] = {
        calls: asText(data.rules.limits.teams?.[team.id]?.calls),
        usd: asText(data.rules.limits.teams?.[team.id]?.microUsd, 1_000_000),
      };
    setLimits(all);
  }, [data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!limits || !data) return;
    const teams = Object.fromEntries(
      data.teams
        .map((team) => [team.id, asLimit(limits[team.id]?.calls ?? '', limits[team.id]?.usd ?? '')] as const)
        .filter(([, l]) => Object.keys(l).length),
    );
    const own = asLimit(limits.company?.calls ?? '', limits.company?.usd ?? '');
    await run(
      () =>
        api('/ai/rules', company.id, {
          method: 'PUT',
          body: { limits: { ...(Object.keys(own).length ? { company: own } : {}), teams } },
        }),
      t('ai.limitsSaved'),
      load,
    );
  }

  const total = (rows: Use[]) => ({
    calls: rows.reduce((s, r) => s + r.calls, 0),
    microUsd: rows.reduce((s, r) => s + r.microUsd, 0),
  });
  const groupBy = (key: (u: Use) => string) => {
    const groups = new Map<string, Use[]>();
    for (const u of data?.use ?? []) groups.set(key(u), [...(groups.get(key(u)) ?? []), u]);
    return [...groups.entries()].map(([k, rows]) => ({ key: k, ...total(rows) })).sort((a, b) => b.calls - a.calls);
  };
  const providerName = (id: string | null) => data?.providers.find((p) => p.id === id)?.name ?? '-';
  const teamName = (id: string | null) => data?.teams.find((x) => x.id === id)?.name ?? t('ai.noTeam');
  const limitRow = (id: string, label: string) =>
    limits && (
      <tr key={id} className="border-t border-bd">
        <td className={`${td} font-medium`}>{label}</td>
        <td className={td}>
          <input
            type="number"
            min={0}
            step={1}
            className={`${field} w-28`}
            aria-label={`${label}: ${t('ai.calls')}`}
            placeholder={t('ai.noLimit')}
            value={limits[id]?.calls ?? ''}
            onChange={(e) => setLimits({ ...limits, [id]: { calls: e.target.value, usd: limits[id]?.usd ?? '' } })}
          />
        </td>
        <td className={td}>
          <input
            type="number"
            min={0}
            step={0.01}
            className={`${field} w-28`}
            aria-label={`${label}: ${t('ai.dollars')}`}
            placeholder={t('ai.noLimit')}
            value={limits[id]?.usd ?? ''}
            onChange={(e) => setLimits({ ...limits, [id]: { usd: e.target.value, calls: limits[id]?.calls ?? '' } })}
          />
        </td>
      </tr>
    );

  if (!data)
    return (
      <section className="grid gap-4 max-w-4xl">
        {view === 'owner' && header(t('menu.pages.cs_ailimit'), t('ai.usageIntro'))}
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );
  const all = total(data.use);
  const tables: {
    title: string;
    rows: { key: string; calls: number; microUsd: number }[];
    label: (k: string) => string;
  }[] = [
    { title: t('ai.byTask'), rows: groupBy((u) => u.feature), label: names.feature },
    { title: t('ai.byCompany'), rows: groupBy((u) => u.provider ?? ''), label: (k) => providerName(k || null) },
    { title: t('ai.byTeam'), rows: groupBy((u) => u.teamId ?? ''), label: (k) => teamName(k || null) },
  ];
  const shown = view === 'owner' ? tables : tables.filter((x) => x.title !== t('ai.byCompany'));
  return (
    <section className="grid gap-4 max-w-4xl">
      {view === 'owner' && header(t('menu.pages.cs_ailimit'), t('ai.usageIntro'))}
      <div className={`${card} grid gap-3`}>
        <h2 className="text-lg font-semibold">{t('ai.thisMonth')}</h2>
        <div className="flex flex-wrap gap-6">
          <p>
            <span className="block text-3xl font-bold">{number(all.calls, lang)}</span>
            <span className="text-sm text-mu">{t('ai.calls')}</span>
          </p>
          <p>
            <span className="block text-3xl font-bold">{dollars(all.microUsd, lang)}</span>
            <span className="text-sm text-mu">{t('ai.cost')}</span>
          </p>
        </div>
        <p className="text-xs text-mu">{t('ai.costHelp')}</p>
        {data.use.length === 0 ? (
          <p className="text-sm text-mu">{t('ai.noUse')}</p>
        ) : (
          <div className={`grid gap-4 ${view === 'owner' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {shown.map((x) => (
              <div key={x.title} className="overflow-x-auto">
                <h3 className="text-sm font-semibold">{x.title}</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {x.rows.map((r) => (
                      <tr key={r.key} className="border-t border-bd">
                        <td className={td}>{x.label(r.key)}</td>
                        <td className={`${td} text-right`}>{number(r.calls, lang)}</td>
                        <td className={`${td} text-right`}>{dollars(r.microUsd, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {view === 'owner' && (
        <>
          <div className={`${card} grid gap-3`}>
            <h2 className="text-lg font-semibold">{t('ai.today.title')}</h2>
            <p className="text-sm text-mu">{t('ai.today.intro')}</p>
            {data.tasksToday.length === 0 ? (
              <p className="text-sm text-mu">{t('ai.noUse')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-mu">
                    <tr>
                      <th className={th}>{t('ai.task')}</th>
                      <th className={`${th} text-right`}>{t('ai.today.calls')}</th>
                      <th className={`${th} text-right`}>{t('ai.today.failed')}</th>
                      <th className={`${th} text-right`}>{t('ai.today.cached')}</th>
                      <th className={`${th} text-right`}>{t('ai.today.input')}</th>
                      <th className={`${th} text-right`}>{t('ai.today.output')}</th>
                      <th className={`${th} text-right`}>{t('ai.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tasksToday.map((x) => (
                      <tr key={x.feature} className="border-t border-bd">
                        <td className={td}>{names.feature(x.feature)}</td>
                        <td className={`${td} text-right`}>{number(x.calls, lang)}</td>
                        <td className={`${td} text-right ${x.failed ? 'text-bad' : ''}`}>{number(x.failed, lang)}</td>
                        <td className={`${td} text-right`}>{number(x.cached, lang)}</td>
                        <td className={`${td} text-right`}>
                          {x.audioSeconds
                            ? t('ai.audio', { n: number(x.audioSeconds, lang) })
                            : number(x.inputTokens, lang)}
                        </td>
                        <td className={`${td} text-right`}>{number(x.outputTokens, lang)}</td>
                        <td className={`${td} text-right`}>{dollars(x.microUsd, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <FreeAllowance data={data} />

          <div className={`${card} grid gap-3`}>
            <h2 className="text-lg font-semibold">{t('ai.trouble.title')}</h2>
            <p className="text-sm text-mu">{t('ai.trouble.intro')}</p>
            {data.errors.length === 0 ? (
              <p className="text-sm text-ok">✓ {t('ai.trouble.none')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-mu">
                    <tr>
                      <th className={th}>{t('ai.when')}</th>
                      <th className={th}>{t('ai.task')}</th>
                      <th className={th}>{t('ai.model')}</th>
                      <th className={th}>{t('ai.result')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.errors.map((c) => (
                      <tr key={c.id} className="border-t border-bd align-top">
                        <td className={`${td} whitespace-nowrap font-mono text-xs`}>{when(c.createdAt, lang)}</td>
                        <td className={td}>{names.feature(c.feature)}</td>
                        <td className={td}>
                          {c.provider ? (
                            <>
                              {providerName(c.provider)} <span className="font-mono text-xs text-mu">{c.model}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className={td}>
                          {names.status(c.status)}
                          {c.error && <span className="block font-mono text-xs text-mu">{c.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <form onSubmit={save} className={`${card} grid gap-3`}>
        <h2 className="text-lg font-semibold">{t('ai.limitsTitle')}</h2>
        <p className="text-sm text-mu">{t('ai.limitsIntro')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-mu">
              <tr>
                <th className={th}>{t('ai.who')}</th>
                <th className={th}>{t('ai.callsPerMonth')}</th>
                <th className={th}>{t('ai.dollarsPerMonth')}</th>
              </tr>
            </thead>
            <tbody>
              {limitRow('company', t('ai.wholeCompany'))}
              {data.teams.map((team) => limitRow(team.id, team.name))}
            </tbody>
          </table>
        </div>
        <div>
          <button type="submit" className={primaryButton}>
            {t('common.save')}
          </button>
        </div>
        <Notice message={message} />
      </form>

      {view === 'owner' && (
        <div className={`${card} grid gap-3`}>
          <h2 className="text-lg font-semibold">{t('ai.recentTitle')}</h2>
          <p className="text-sm text-mu">{t('ai.recentIntro')}</p>
          {data.recent.length === 0 ? (
            <p className="text-sm text-mu">{t('ai.noUse')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-mu">
                  <tr>
                    <th className={th}>{t('ai.when')}</th>
                    <th className={th}>{t('ai.task')}</th>
                    <th className={th}>{t('ai.model')}</th>
                    <th className={th}>{t('ai.result')}</th>
                    <th className={`${th} text-right`}>{t('ai.tokensCol')}</th>
                    <th className={`${th} text-right`}>{t('ai.wait')}</th>
                    <th className={`${th} text-right`}>{t('ai.cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((c) => (
                    <tr key={c.id} className="border-t border-bd align-top">
                      <td className={`${td} whitespace-nowrap font-mono text-xs`}>{when(c.createdAt, lang)}</td>
                      <td className={td}>{names.feature(c.feature)}</td>
                      <td className={td}>
                        {c.provider ? (
                          <>
                            {providerName(c.provider)} <span className="font-mono text-xs text-mu">{c.model}</span>
                          </>
                        ) : (
                          '-'
                        )}
                        {c.attempt > 1 && (
                          <span className="block text-xs text-mu">{t('ai.fallback', { n: c.attempt })}</span>
                        )}
                      </td>
                      <td className={c.status === 'ok' ? `${td} text-ok` : td}>
                        {names.status(c.status)}
                        {c.error && <span className="block font-mono text-xs text-mu">{c.error}</span>}
                      </td>
                      <td className={`${td} text-right`}>
                        {c.audioSeconds
                          ? t('ai.audio', { n: number(c.audioSeconds, lang) })
                          : number(c.inputTokens + c.outputTokens, lang)}
                      </td>
                      <td className={`${td} text-right`}>{t('ai.seconds', { n: (c.waitMs / 1000).toFixed(1) })}</td>
                      <td className={`${td} text-right`}>{dollars(c.costMicroUsd, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- AI on or off

export function AiSwitch({ company, embedded = false }: { company: CompanyRef; embedded?: boolean }) {
  const { t } = useTranslation();
  const { data, load, message, run } = useOverview(company);
  const on = data?.rules.enabled ?? false;
  return (
    <section className="grid gap-4 max-w-2xl">
      {!embedded && header(t('menu.pages.cs_aionoff'), t('ai.switchIntro'))}
      {!data ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <div className={`${card} grid gap-3`}>
          <p className="text-lg font-semibold">
            <span className={on ? 'text-ok' : 'text-bad'}>{on ? '●' : '○'}</span> {on ? t('ai.isOn') : t('ai.isOff')}
          </p>
          <p className="text-sm text-mu">{on ? t('ai.onHelp') : t('ai.offHelp')}</p>
          <div>
            <button
              type="button"
              className={on ? dangerButton : primaryButton}
              onClick={() =>
                void run(
                  () => api('/ai/rules', company.id, { method: 'PUT', body: { enabled: !on } }),
                  on ? t('ai.switchedOff') : t('ai.switchedOn'),
                  load,
                )
              }
            >
              {on ? t('ai.switchOff') : t('ai.switchOn')}
            </button>
          </div>
          <p className="text-xs text-mu">{t('ai.switchLater')}</p>
        </div>
      )}
      {data && <EuOnlyCard company={company} data={data} run={run} reload={load} />}
      {data && <AiReviewRules company={company} rules={data.rules.reviews} reload={load} />}
      <Notice message={message} />
    </section>
  );
}

/** AI reviews (AutoQA): they start only after an admin confirms the agents were told; the channels they run on. */
function AiReviewRules({
  company,
  rules,
  reload,
}: {
  company: CompanyRef;
  rules: Rules['reviews'];
  reload: () => void;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const [announced, setAnnounced] = useState(!!rules.announcedAt);
  const [channels, setChannels] = useState<string[]>(rules.channels ?? []);
  const { message, run } = useAction();
  return (
    <form
      className={`${card} grid gap-3`}
      aria-labelledby="ai-reviews-title"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => api('/ai/reviews', company.id, { method: 'PUT', body: { announced, channels } }),
          t('autoqa.rulesSaved'),
          reload,
        );
      }}
    >
      <h2 id="ai-reviews-title" className="text-lg font-semibold">
        {t('autoqa.rulesTitle')}
      </h2>
      <p className="text-sm text-mu">{t('autoqa.rulesIntro')}</p>
      <p className={`text-sm font-semibold ${rules.announcedAt ? 'text-ok' : 'text-bad'}`}>
        {rules.announcedAt
          ? t('autoqa.announced', { when: when(rules.announcedAt, lang), name: rules.announcedBy ?? '' })
          : t('autoqa.notAnnounced')}
      </p>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--brand)]"
          checked={announced}
          onChange={(e) => setAnnounced(e.target.checked)}
        />
        {t('autoqa.announce')}
      </label>
      <CheckList
        legend={t('autoqa.channels')}
        options={(['call', 'chat', 'email', 'other'] as const).map((c) => ({
          id: c,
          label: t(`cfields.options.channel.${c}`),
        }))}
        value={channels}
        onChange={setChannels}
      />
      <p className="text-xs text-mu">{t('autoqa.channelsHelp')}</p>
      <div>
        <button type="submit" className={primaryButton}>
          {t('common.save')}
        </button>
      </div>
      <Notice message={message} />
    </form>
  );
}

function Meter({ used, of }: { used: number; of: number }) {
  const share = of > 0 ? Math.min(1, used / of) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sunk" role="presentation">
      <div
        className={`h-full rounded-full ${share >= 0.9 ? 'bg-bad' : share >= 0.7 ? 'bg-wn' : 'bg-ok'}`}
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}

/**
 * The free plans' allowance: what is used, what is left and when it resets. Groq's figures are its own (sent with
 * every answer); Cloudflare's Neurons are counted from Q-smart's own calls.
 */
function FreeAllowance({ data }: { data: Overview }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const a = data.allowance;
  const connected = new Set(data.accounts.filter((x) => x.enabled).map((x) => x.provider));
  const clock = (at: string | number) =>
    new Intl.DateTimeFormat(LOCALES[lang], { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
  const inTime = (ms: number) => {
    const min = Math.round(ms / 60_000);
    if (ms < 60_000) return t('ai.free.seconds', { n: Math.max(1, Math.round(ms / 1000)) });
    if (min < 60) return t('ai.free.minutes', { n: min });
    return t('ai.free.hours', { h: Math.floor(min / 60), m: min % 60 });
  };
  const used = (provider: string) => {
    const rows = a.today.filter((u) => u.provider === provider);
    return {
      calls: number(
        rows.reduce((n, r) => n + r.calls, 0),
        lang,
      ),
      tokens: number(
        rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0),
        lang,
      ),
    };
  };
  if (!connected.size) return null;
  const now = Date.parse(a.now);
  const neurons = a.cloudflare;
  return (
    <section className={`${card} grid gap-4`} aria-labelledby="free-title">
      <div className="grid gap-1">
        <h2 id="free-title" className="text-lg font-semibold">
          {t('ai.free.title')}
        </h2>
        <p className="text-sm text-mu">{t('ai.free.intro')}</p>
      </div>
      {connected.has('groq') && (
        <div className="grid gap-2">
          <h3 className="font-semibold">Groq</h3>
          <p className="text-sm">{t('ai.free.today', used('groq'))}</p>
          {data.limits
            .filter((m) => m.provider === 'groq')
            .map((m) => (
              <div key={m.model} className="grid gap-2 rounded-s border border-bd p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="font-mono">{m.model}</span>
                  <span className={`rounded-full px-2 text-xs font-semibold ${STATUS_LOOK[m.status]}`}>
                    {m.status === 'available'
                      ? '●'
                      : m.status === 'approaching'
                        ? '▲'
                        : m.status === 'reached'
                          ? '■'
                          : '○'}{' '}
                    {t(`ai.free.status.${m.status}`)}
                  </span>
                  {m.waitMs > 0 && (
                    <small className="font-normal text-mu">
                      {t('ai.free.nextCall', { in: inTime(m.waitMs), at: clock(now + m.waitMs) })}
                    </small>
                  )}
                </p>
                {m.rows.map((r) => {
                  const freeAt = r.freeAt ? Date.parse(r.freeAt) : null;
                  return (
                    <div key={r.kind} className="grid gap-1">
                      <p className="text-sm">
                        <b>{t(`ai.free.kinds.${r.kind}`)}</b>{' '}
                        {t('ai.free.usedOf', { used: number(r.used, lang), limit: number(r.limit, lang) })}
                        {freeAt !== null && freeAt > now && r.used > 0 && (
                          <span className="text-mu">
                            {' '}
                            · {t('ai.free.freeIn', { in: inTime(freeAt - now), at: clock(freeAt) })}
                          </span>
                        )}
                      </p>
                      <Meter used={r.used} of={r.limit} />
                      <small className="text-xs text-mu">
                        {r.source === 'account'
                          ? t('ai.free.fromAccount')
                          : t('ai.free.fromPublished', { date: m.checked })}
                      </small>
                    </div>
                  );
                })}
              </div>
            ))}
          <p className="text-xs text-mu">{t('ai.free.groqNote')}</p>
        </div>
      )}
      {connected.has('cloudflare') && (
        <div className="grid gap-2">
          <h3 className="font-semibold">Cloudflare Workers AI</h3>
          <p className="text-sm">{t('ai.free.today', used('cloudflare'))}</p>
          <p className="text-sm">
            <b>{t('ai.free.cf.neurons')}</b>{' '}
            {t('ai.free.cf.used', {
              used: number(neurons.neuronsUsed, lang),
              free: number(neurons.neuronsFree, lang),
              left: number(Math.max(0, neurons.neuronsFree - neurons.neuronsUsed), lang),
            })}
            <span className="text-mu">
              {' '}
              · {t('ai.free.resets', { in: inTime(Date.parse(a.nextUtcMidnight) - now), at: clock(a.nextUtcMidnight) })}
            </span>
          </p>
          <Meter used={neurons.neuronsUsed} of={neurons.neuronsFree} />
          <p className="text-xs text-mu">{t('ai.free.cfNote')}</p>
        </div>
      )}
    </section>
  );
}

/** "EU only": clients' data only to AI that runs in the EU (the company's rule; no AI company is named). */
function EuOnlyCard({
  company,
  data,
  run,
  reload,
}: {
  company: CompanyRef;
  data: Overview;
  run: ReturnType<typeof useAction>['run'];
  reload: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`${card} grid gap-3`}>
      <h2 className="text-lg font-semibold">{t('ai.admin.euTitle')}</h2>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--brand)]"
          checked={data.rules.euOnly}
          onChange={(e) =>
            void run(
              () => api('/ai/rules', company.id, { method: 'PUT', body: { euOnly: e.target.checked } }),
              t('ai.rulesSaved'),
              reload,
            )
          }
        />
        {t('ai.euOnly')}
      </label>
      <p className="text-xs text-mu">{t('ai.admin.euHelp')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Admin › AI (simple)

type AdminTab = 'overview' | 'usage' | 'rules' | 'quality';

/** Whether AI works normally today, today's use per AI task, and the latest problems in plain words. */
function AiOverviewTab({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const names = useNames();
  const { data, message } = useOverview(company);
  if (!data)
    return (
      <>
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </>
    );
  const calls = data.tasksToday.reduce((n, x) => n + x.calls, 0);
  const failed = data.tasksToday.reduce((n, x) => n + x.failed, 0);
  const state = !data.rules.enabled ? 'off' : calls > 0 && failed / calls > 0.5 ? 'problems' : 'ok';
  return (
    <div className="grid gap-4">
      <div className={`${card} grid gap-1`} role="status">
        <p className="text-lg font-semibold">
          <span className={state === 'ok' ? 'text-ok' : state === 'off' ? 'text-mu' : 'text-bad'}>
            {state === 'ok' ? '●' : state === 'off' ? '○' : '▲'}
          </span>{' '}
          {t(`ai.admin.state.${state}`)}
        </p>
        <p className="text-sm text-mu">{t(`ai.admin.stateHelp.${state}`)}</p>
      </div>
      <div className={`${card} grid gap-3`}>
        <h2 className="text-lg font-semibold">{t('ai.admin.todayTitle')}</h2>
        {data.tasksToday.length === 0 ? (
          <p className="text-sm text-mu">{t('ai.noUse')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-mu">
                <tr>
                  <th className={th}>{t('ai.task')}</th>
                  <th className={`${th} text-right`}>{t('ai.today.calls')}</th>
                  <th className={`${th} text-right`}>{t('ai.today.failed')}</th>
                </tr>
              </thead>
              <tbody>
                {data.tasksToday.map((x) => (
                  <tr key={x.feature} className="border-t border-bd">
                    <td className={td}>{names.feature(x.feature)}</td>
                    <td className={`${td} text-right`}>{number(x.calls, lang)}</td>
                    <td className={`${td} text-right ${x.failed ? 'text-bad' : ''}`}>{number(x.failed, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className={`${card} grid gap-3`}>
        <h2 className="text-lg font-semibold">{t('ai.trouble.title')}</h2>
        {data.errors.length === 0 ? (
          <p className="text-sm text-ok">✓ {t('ai.trouble.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-mu">
                <tr>
                  <th className={th}>{t('ai.when')}</th>
                  <th className={th}>{t('ai.task')}</th>
                  <th className={th}>{t('ai.result')}</th>
                </tr>
              </thead>
              <tbody>
                {data.errors.map((c) => (
                  <tr key={c.id} className="border-t border-bd align-top">
                    <td className={`${td} whitespace-nowrap font-mono text-xs`}>{when(c.createdAt, lang)}</td>
                    <td className={td}>{names.feature(c.feature)}</td>
                    <td className={td}>
                      {t(`ai.admin.problem.${c.status}`, { defaultValue: t('ai.admin.problem.error') })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Admin › AI for a client company: Overview, Usage & limits, Rules and Quality (no AI company or model is named). */
export function AiAdmin({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTab>('overview');
  const tabs: AdminTab[] = ['overview', 'usage', 'rules', 'quality'];
  return (
    <section className="grid gap-4 max-w-4xl">
      {header(t('menu.pages.cs_ai'), t('ai.admin.intro'))}
      <div role="tablist" aria-label={t('menu.pages.cs_ai')} className="flex flex-wrap gap-1">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`ai-tab-${k}`}
            aria-selected={tab === k}
            aria-controls="ai-tabpanel"
            className={`rounded-s border px-3 py-1.5 text-sm font-semibold ${tab === k ? 'border-brand text-brand' : 'border-bd'}`}
            onClick={() => setTab(k)}
          >
            {t(`ai.admin.tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="ai-tabpanel" aria-labelledby={`ai-tab-${tab}`} className="grid gap-4">
        {tab === 'overview' && <AiOverviewTab company={company} />}
        {tab === 'usage' && <AiUsage company={company} view="client" />}
        {tab === 'rules' && <AiSwitch company={company} embedded />}
        {tab === 'quality' && <AutoQAOverview company={company} />}
      </div>
    </section>
  );
}

/**
 * The owner area's detailed AI views, on Q-smart's own demo company (made-up data): the AI companies allowed and
 * the rules, the free plans' allowance, every call with its model, and the test set where models are measured.
 */
export function AiOwnerDetails({ company }: { company: CompanyRef }) {
  const { data, load, run } = useOverview(company);
  return (
    <div className="grid gap-4">
      {data && <RulesCard company={company} data={data} run={run} reload={load} />}
      <AiUsage company={company} view="owner" />
      <TestSet company={company} />
    </div>
  );
}
