// Quality › Home › AutoQA (today's AutoQA dashboard, with v2's AI reviews; V2_PLAN §7): AutoQA's reviews (agents:
// their own) with the average, categories, agents, the last 8 weeks and the lowest scores; for staff, the accuracy
// score against reviewers (Zendesk's bands), per category with the automatic brake, per AI model, language, scorecard
// and month, and the questions where AutoQA and people disagree most. Admins set the brake's bar and pause AI reviews
// for a category; admins and reviewers take a random sample to review themselves (it feeds the accuracy score).
import { can } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { TestSet } from './TestSet';
import { currentLanguage } from './i18n';
import { card, type CompanyRef, field, Notice, primaryButton, smallButton, useAction } from './ui';

type Band = 'high' | 'medium' | 'low';
interface Agreement {
  key: string;
  same: number;
  compared: number;
  conversations: number;
  score: number | null;
  band: Band | null;
}
interface CategoryAgreement extends Agreement {
  scorecard: string;
  category: string;
  braked: boolean;
  paused: boolean;
}
interface PageData {
  tiles: {
    aiReviews: number;
    conversations: number;
    agents: number;
    average: number | null;
    disputed: number;
    held: number;
  };
  categories: { name: string; average: number | null }[];
  agents: { name: string; reviews: number; average: number | null }[];
  trend: { weeksAgo: number; reviews: number; average: number | null }[];
  lowest: { id: string; agentName: string; day: string; score: number | null; channel: string }[];
  accuracy?: {
    bar: number;
    minConversations: number;
    compared: number;
    overall: Omit<Agreement, 'key'>;
    byCategory: CategoryAgreement[];
    byModel: Agreement[];
    byLanguage: Agreement[];
    byScorecard: Agreement[];
    byMonth: Agreement[];
    disagreements: { category: string; question: string; same: number; compared: number; score: number }[];
  };
}
interface SampleRow {
  id: string;
  agentName: string;
  teamName: string;
  channel: string;
  channelName: string;
  startedAt: string;
  language: string;
  scorecardId: string | null;
}

const BAND_CLASS: Record<Band, string> = { high: 'text-ok', medium: 'text-wn', low: 'text-bad' };
const th = 'py-1 pr-3 font-semibold';
const td = 'py-1.5 pr-3';
const pct = (v: number | null) => (v === null ? '-' : `${v}%`);

function Bar({ value }: { value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sunk" role="presentation">
      <div
        className={`h-full rounded-full ${v >= 75 ? 'bg-ok' : v >= 25 ? 'bg-wn' : 'bg-bad'}`}
        style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
      />
    </div>
  );
}

function AutoQAOverview({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const admin = can(company.role, 'ai.manage');
  const writer = can(company.role, 'conversations.write');
  const [data, setData] = useState<PageData | null>(null);
  const [bar, setBar] = useState('75');
  const [paused, setPaused] = useState<string[]>([]);
  const [sample, setSample] = useState<SampleRow[] | null>(null);
  const [size, setSize] = useState(10);
  const { message, run, fail } = useAction();
  const load = useCallback(() => {
    api<PageData>('/autoqa', company.id).then((d) => {
      setData(d);
      if (d.accuracy) {
        setBar(String(d.accuracy.bar));
        setPaused(d.accuracy.byCategory.filter((c) => c.paused).map((c) => c.key));
      }
    }, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const band = (b: Band | null) =>
    b ? <span className={`font-semibold ${BAND_CLASS[b]}`}>{t(`autoqa.page.bands.${b}`)}</span> : null;
  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'bg' ? 'bg-BG' : lang === 'fr' ? 'fr-FR' : 'en-GB', {
      dateStyle: 'medium',
    }).format(new Date(iso));
  const small = (title: string, rows: Agreement[], label: (k: string) => string = (k) => k) => (
    <div className="grid content-start gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-mu">-</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-bd">
                <td className={td}>{label(r.key)}</td>
                <td className={`${td} text-right font-mono`}>{pct(r.score)}</td>
                <td className={`${td} text-right text-xs text-mu`}>
                  {t('autoqa.page.conversations', { count: r.conversations })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  if (!data)
    return (
      <section className="grid gap-4">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.autoqa')}</h1>
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );
  const a = data.accuracy;
  const tile = (label: string, value: string, note?: string, tone = '') => (
    <div className={`${card} grid gap-1 p-4`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-mu">{label}</span>
      <b className={`text-3xl ${tone}`}>{value}</b>
      {note && <small className="text-xs text-mu">{note}</small>}
    </div>
  );

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.autoqa')}</h1>
        <p className="text-sm text-mu">{a ? t('autoqa.page.intro') : t('autoqa.page.introAgent')}</p>
      </div>
      <Notice message={message} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tile(
          t('autoqa.page.tiles.reviews'),
          String(data.tiles.aiReviews),
          t('autoqa.page.tiles.reviewsNote', { agents: data.tiles.agents }),
        )}
        {tile(t('autoqa.page.tiles.average'), pct(data.tiles.average))}
        {a &&
          tile(
            t('autoqa.page.tiles.accuracy'),
            pct(a.overall.score),
            a.overall.score === null
              ? t('autoqa.page.tiles.accuracyNone')
              : t('autoqa.page.tiles.accuracyNote', { count: a.overall.conversations }),
            a.overall.band ? BAND_CLASS[a.overall.band] : '',
          )}
        {tile(
          t('autoqa.page.tiles.disputed'),
          String(data.tiles.disputed),
          data.tiles.held ? t('autoqa.page.tiles.held', { count: data.tiles.held }) : undefined,
        )}
      </div>

      {a && (
        <section className={`${card} grid gap-4`} aria-labelledby="accuracy-title">
          <div className="grid gap-1">
            <h2 id="accuracy-title" className="text-lg font-semibold">
              {t('autoqa.page.accuracyTitle')}{' '}
              {a.overall.score !== null && (
                <>
                  · {pct(a.overall.score)} {band(a.overall.band)}
                </>
              )}
            </h2>
            <p className="text-sm text-mu">{t('autoqa.page.accuracyIntro', { min: a.minConversations, bar: a.bar })}</p>
          </div>
          {a.byCategory.length === 0 ? (
            <p className="text-sm text-mu">{t('autoqa.page.noPairs')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-mu">
                  <tr>
                    <th className={th}>{t('autoqa.page.category')}</th>
                    <th className={th}>{t('autoqa.page.agreement')}</th>
                    <th className={th}>{t('autoqa.page.band')}</th>
                    <th className={th}>{t('autoqa.page.compared')}</th>
                    <th className={th}>{t('autoqa.page.brake')}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.byCategory.map((c) => (
                    <tr key={c.key} className="border-t border-bd align-top">
                      <td className={td}>
                        {c.category}
                        {c.scorecard && <small className="block text-mu">{c.scorecard}</small>}
                      </td>
                      <td className={`${td} min-w-32`}>
                        <span className="font-mono">{pct(c.score)}</span>
                        <Bar value={c.score} />
                      </td>
                      <td className={td}>{band(c.band)}</td>
                      <td className={td}>{t('autoqa.page.conversations', { count: c.conversations })}</td>
                      <td className={td}>
                        {c.braked && <span className="block font-semibold text-bad">{t('autoqa.page.underBar')}</span>}
                        {admin ? (
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="accent-[var(--brand)]"
                              checked={paused.includes(c.key)}
                              onChange={(e) =>
                                setPaused(e.target.checked ? [...paused, c.key] : paused.filter((k) => k !== c.key))
                              }
                            />
                            {t('autoqa.page.pause')}
                          </label>
                        ) : (
                          c.paused && <span className="text-bad">{t('autoqa.page.paused')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {admin && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-mu">
                {t('autoqa.page.bar')}
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={`${field} w-24`}
                  value={bar}
                  onChange={(e) => setBar(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={primaryButton}
                onClick={() =>
                  void run(
                    () => api('/autoqa/brake', company.id, { method: 'PUT', body: { bar: Number(bar), paused } }),
                    t('autoqa.page.brakeSaved'),
                    load,
                  )
                }
              >
                {t('common.save')}
              </button>
              <small className="text-xs text-mu">{t('autoqa.page.pauseHelp')}</small>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {small(t('autoqa.page.byModel'), a.byModel)}
            {small(t('autoqa.page.byLanguage'), a.byLanguage, (k) => (k === '-' ? t('autoqa.page.noLanguage') : k))}
            {small(t('autoqa.page.byScorecard'), a.byScorecard)}
            {small(t('autoqa.page.byMonth'), a.byMonth)}
          </div>
          {a.disagreements.length > 0 && (
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">{t('autoqa.page.disagreements')}</h3>
              <ul className="grid gap-1 text-sm">
                {a.disagreements.map((d) => (
                  <li
                    key={`${d.category}|${d.question}`}
                    className="flex justify-between gap-3 border-t border-bd pt-1"
                  >
                    <span>
                      {d.question} <small className="text-mu">· {d.category}</small>
                    </span>
                    <span className="whitespace-nowrap font-mono">
                      {d.score}%{' '}
                      <small className="text-mu">
                        ({d.same}/{d.compared})
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-mu">{t('autoqa.page.disagreementsHelp')}</p>
            </div>
          )}
        </section>
      )}

      {writer && (
        <section className={`${card} grid gap-3`} aria-labelledby="sample-title">
          <h2 id="sample-title" className="text-lg font-semibold">
            {t('autoqa.page.sampleTitle')}
          </h2>
          <p className="text-sm text-mu">{t('autoqa.page.sampleIntro')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-mu">
              {t('autoqa.howMany')}
              <select className={field} value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {[5, 10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={smallButton}
              onClick={() => api<SampleRow[]>(`/autoqa/sample?n=${size}`, company.id).then(setSample, fail)}
            >
              {t('autoqa.page.takeSample')}
            </button>
          </div>
          {sample &&
            (sample.length === 0 ? (
              <p className="text-sm text-mu">{t('autoqa.page.sampleEmpty')}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {sample.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-bd pt-1">
                    <span>
                      <b>{s.agentName}</b> <small className="text-mu">{s.teamName}</small> ·{' '}
                      {s.channel === 'other' && s.channelName
                        ? s.channelName
                        : t(`cfields.options.channel.${s.channel}`)}{' '}
                      · {when(s.startedAt)}
                      {s.language && <small className="text-mu"> · {s.language}</small>}
                    </span>
                    <Link
                      to="/$app/$page"
                      params={{ app: 'quality', page: 'qa-entry' }}
                      search={{ conversation: s.id, ...(s.scorecardId ? { scorecard: s.scorecardId } : {}) }}
                      className={smallButton}
                    >
                      {t('autoqa.page.reviewIt')} ›
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} grid content-start gap-2`} aria-labelledby="aq-cats">
          <h2 id="aq-cats" className="font-semibold">
            {t('autoqa.page.categoriesTitle')}
          </h2>
          {data.categories.length === 0 && <p className="text-sm text-mu">{t('autoqa.page.none')}</p>}
          {data.categories.map((c) => (
            <div key={c.name} className="grid gap-1">
              <div className="flex justify-between text-sm">
                <span>{c.name}</span>
                <b className="font-mono">{pct(c.average)}</b>
              </div>
              <Bar value={c.average} />
            </div>
          ))}
        </section>
        <section className={`${card} grid content-start gap-2`} aria-labelledby="aq-trend">
          <h2 id="aq-trend" className="font-semibold">
            {t('autoqa.page.trendTitle')}
          </h2>
          <ol className="grid gap-1">
            {data.trend.map((w) => (
              <li key={w.weeksAgo} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 text-sm">
                <span className="text-mu">
                  {w.weeksAgo === 0 ? t('autoqa.page.thisWeek') : t('autoqa.page.weeksAgo', { count: w.weeksAgo })}
                </span>
                <Bar value={w.average} />
                <span className="text-right font-mono">{pct(w.average)}</span>
              </li>
            ))}
          </ol>
        </section>
        {a && (
          <section className={`${card} grid content-start gap-2`} aria-labelledby="aq-agents">
            <h2 id="aq-agents" className="font-semibold">
              {t('autoqa.page.agentsTitle')}
            </h2>
            {data.agents.length === 0 && <p className="text-sm text-mu">{t('autoqa.page.none')}</p>}
            <table className="w-full text-sm">
              <tbody>
                {data.agents.map((x) => (
                  <tr key={x.name} className="border-t border-bd">
                    <td className={td}>{x.name}</td>
                    <td className={`${td} text-right text-xs text-mu`}>
                      {t('autoqa.page.reviews', { count: x.reviews })}
                    </td>
                    <td className={`${td} text-right font-mono`}>{pct(x.average)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <section className={`${card} grid content-start gap-2`} aria-labelledby="aq-low">
          <h2 id="aq-low" className="font-semibold">
            {t('autoqa.page.lowestTitle')}
          </h2>
          {data.lowest.length === 0 && <p className="text-sm text-mu">{t('autoqa.page.none')}</p>}
          <ul className="grid gap-1 text-sm">
            {data.lowest.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 border-t border-bd pt-1">
                <Link to="/review/$id" params={{ id: r.id }} className="underline-offset-2 hover:underline">
                  <b>{r.agentName}</b> <small className="text-mu">{r.day}</small>
                </Link>
                <b className="font-mono">{pct(r.score)}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

/** The AutoQA page: the overview, and for admins and reviewers the test set (where AI models are measured). */
export function AutoQA({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const writer = can(company.role, 'conversations.write');
  const [tab, setTab] = useState<'overview' | 'testSet'>('overview');
  if (!writer) return <AutoQAOverview company={company} />;
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t('menu.pages.autoqa')} className="flex gap-1">
        {(['overview', 'testSet'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`rounded-s border px-3 py-1.5 text-sm font-semibold ${tab === k ? 'border-brand text-brand' : 'border-bd'}`}
            onClick={() => setTab(k)}
          >
            {t(`autoqa.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'overview' ? (
        <AutoQAOverview company={company} />
      ) : (
        <section className="grid gap-4">
          <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.autoqa')}</h1>
          <TestSet company={company} />
        </section>
      )}
    </div>
  );
}
