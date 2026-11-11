// Quality › AutoQA › Test set (admins and reviewers; V2_PLAN §7, "the quality check"): the expert scores the made-up
// conversations once (Yes, No or N/A for each question, as in QA Entry); then each AI model runs on them, and the page
// shows how often each model gave the expert's answer, overall and per language, how far its scores are from the
// expert's, how long it takes and how often it fails. A model is used for AI reviews only if it passes.
import type { ScorecardCategory } from '@qsmart/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Transcript } from './Conversations';
import { card, type CompanyRef, field, Notice, primaryButton, smallButton, useAction } from './ui';

type Answer = 'y' | 'n' | 'na';
interface Item {
  id: string;
  key: string;
  language: 'en' | 'bg' | 'fr';
  industry: string;
  title: string;
  channel: string;
  text: string;
  scorecardId: string;
  expected: { name: string; questions: { text: string; answer: Answer }[] }[] | null;
  expectedScore: number | null;
  expectedBy: string | null;
  runs: Record<string, number | null>;
}
interface ModelResult {
  id: string;
  name: string;
  provider: string;
  items: number;
  failed: number;
  score: number | null;
  byLanguage: Record<string, number | null>;
  scoreGap: number | null;
  waitMs: number | null;
  passes: boolean;
}
interface Overview {
  minItems: number;
  bar: number;
  scored: number;
  scorecards: { id: string; name: string; categories: ScorecardCategory[] }[];
  items: Item[];
  models: ModelResult[];
}
const LANGS = ['en', 'bg', 'fr'] as const;
const th = 'py-1 pr-3 font-semibold';
const td = 'py-1.5 pr-3';
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${v}%`);

function Scorer({
  item,
  categories,
  onSave,
  onClose,
}: {
  item: Item;
  categories: ScorecardCategory[];
  onSave: (answers: Answer[][]) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const start = useMemo(
    () =>
      categories.map((c) =>
        c.questions.map(
          (q) => item.expected?.find((e) => e.name === c.name)?.questions.find((x) => x.text === q.text)?.answer ?? 'y',
        ),
      ),
    [categories, item],
  );
  const [answers, setAnswers] = useState<Answer[][]>(start);
  const choice = (ci: number, qi: number, a: Answer) =>
    setAnswers(answers.map((row, r) => (r === ci ? row.map((x, q) => (q === qi ? a : x)) : row)));
  return (
    <section className={`${card} grid gap-4`} aria-labelledby="scorer-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="scorer-title" className="text-lg font-semibold">
            {item.title}
          </h3>
          <p className="text-sm text-mu">
            {item.industry} · {t(`cfields.options.channel.${item.channel}`)} · {item.language.toUpperCase()}
          </p>
        </div>
        <button type="button" className={smallButton} onClick={onClose} aria-label={t('conversations.close')}>
          ✕
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Transcript text={item.text} />
        <div className="grid content-start gap-3">
          {categories.map((c, ci) => (
            <fieldset key={c.name} className="grid gap-2">
              <legend className="text-sm font-semibold">{c.name}</legend>
              {c.questions.map((q, qi) => (
                <div key={q.text} className="grid gap-1 text-sm">
                  <span>{q.text}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={q.text}>
                    {(['y', 'n', 'na'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={answers[ci]?.[qi] === a}
                        className={`rounded-s border px-3 py-1 text-xs font-semibold ${
                          answers[ci]?.[qi] === a
                            ? a === 'y'
                              ? 'border-ok bg-ok/15'
                              : a === 'n'
                                ? 'border-bad bg-bad/15'
                                : 'border-tx bg-sunk'
                            : 'border-bd'
                        }`}
                        onClick={() => choice(ci, qi, a)}
                      >
                        {t(`autoqa.testSet.answers.${a}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          ))}
          <div className="flex gap-2">
            <button type="button" className={primaryButton} onClick={() => void onSave(answers)}>
              {t('autoqa.testSet.save')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TestSet({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [lang, setLang] = useState<'' | 'en' | 'bg' | 'fr'>('');
  const [open, setOpen] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [limit, setLimit] = useState(5);
  const [progress, setProgress] = useState<{ done: number; of: number; failed: number; waiting: boolean } | null>(null);
  const { message, run, fail } = useAction();
  const load = useCallback(() => {
    api<Overview>('/autoqa/test-set', company.id).then((d) => {
      setData(d);
      setChosen((c) => (c.length ? c : d.models.slice(0, 1).map((m) => m.id)));
    }, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  if (!data) return <p className="text-mu">{t('common.loading')}</p>;
  const shown = data.items.filter((i) => !lang || i.language === lang);
  const item = data.items.find((i) => i.id === open);
  const cardOf = (i: Item) => data.scorecards.find((c) => c.id === i.scorecardId);

  async function save(answers: Answer[][]) {
    if (!item) return false;
    const ok = await run(
      () => api(`/autoqa/test-set/${item.id}/expected`, company.id, { method: 'PUT', body: { answers } }),
      t('autoqa.testSet.saved'),
      load,
    );
    if (ok) {
      // straight to the next conversation not scored yet
      const next = data?.items.find((i) => !i.expected && i.id !== item.id);
      setOpen(next?.id ?? null);
    }
    return ok;
  }

  async function runModels() {
    if (!data) return;
    const jobs = chosen.flatMap((modelId) =>
      data.items
        .filter((i) => i.expected && !(modelId in i.runs) && (!lang || i.language === lang))
        .slice(0, limit)
        .map((i) => ({ modelId, itemId: i.id })),
    );
    const state = { done: 0, of: jobs.length, failed: 0, waiting: false };
    setProgress({ ...state });
    for (const job of jobs) {
      for (let tries = 0; tries < 6; tries++) {
        const out = await api<{ status: 'ok' | 'failed' | 'busy' }>(`/autoqa/test-set/${job.itemId}/run`, company.id, {
          method: 'POST',
          body: { modelId: job.modelId },
        }).catch(() => ({ status: 'failed' as const }));
        if (out.status !== 'busy') {
          if (out.status === 'failed') state.failed++;
          break;
        }
        // the free plan's limit for now: wait a little and try again
        setProgress({ ...state, waiting: true });
        await new Promise((r) => setTimeout(r, 30_000));
      }
      state.done++;
      setProgress({ ...state, waiting: false });
    }
    load();
  }
  const running = progress !== null && progress.done < progress.of;

  return (
    <section className="grid gap-4">
      <div className={`${card} grid gap-2`}>
        <h2 className="text-lg font-semibold">{t('autoqa.testSet.title')}</h2>
        <p className="text-sm text-mu">{t('autoqa.testSet.intro', { min: data.minItems, bar: data.bar })}</p>
        <p className="text-sm font-semibold">
          {t('autoqa.testSet.progress', { scored: data.scored, total: data.items.length })}
        </p>
      </div>
      <Notice message={message} />

      <section className={`${card} grid gap-3`} aria-labelledby="models-title">
        <h2 id="models-title" className="text-lg font-semibold">
          {t('autoqa.testSet.modelsTitle')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-mu">
              <tr>
                <th className={th}>{t('autoqa.testSet.model')}</th>
                <th className={th}>{t('autoqa.testSet.tested')}</th>
                <th className={th}>{t('autoqa.testSet.agreement')}</th>
                {LANGS.map((l) => (
                  <th key={l} className={th}>
                    {l.toUpperCase()}
                  </th>
                ))}
                <th className={th}>{t('autoqa.testSet.gap')}</th>
                <th className={th}>{t('autoqa.testSet.wait')}</th>
                <th className={th}>{t('autoqa.testSet.failed')}</th>
                <th className={th}>{t('autoqa.testSet.verdict')}</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.id} className="border-t border-bd">
                  <td className={td}>
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="accent-[var(--brand)]"
                        checked={chosen.includes(m.id)}
                        onChange={(e) =>
                          setChosen(e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id))
                        }
                      />
                      <span className="font-mono text-xs">{m.name}</span>
                    </label>
                    <small className="block text-mu">{m.provider}</small>
                  </td>
                  <td className={td}>{m.items}</td>
                  <td className={`${td} font-mono`}>{pct(m.score)}</td>
                  {LANGS.map((l) => (
                    <td key={l} className={`${td} font-mono`}>
                      {pct(m.byLanguage[l])}
                    </td>
                  ))}
                  <td className={td}>{m.scoreGap === null ? '-' : t('autoqa.testSet.points', { n: m.scoreGap })}</td>
                  <td className={td}>
                    {m.waitMs === null ? '-' : t('ai.seconds', { n: (m.waitMs / 1000).toFixed(1) })}
                  </td>
                  <td className={td}>{m.failed}</td>
                  <td className={td}>
                    {m.items < data.minItems ? (
                      <span className="text-mu">
                        {t('autoqa.testSet.notYet', { count: data.minItems - m.items, n: data.minItems - m.items })}
                      </span>
                    ) : m.passes ? (
                      <b className="text-ok">✓ {t('autoqa.testSet.passes')}</b>
                    ) : (
                      <b className="text-bad">✕ {t('autoqa.testSet.fails')}</b>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-mu">
            {t('autoqa.testSet.perModel')}
            <select className={field} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[1, 5, 12, 36].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={primaryButton}
            disabled={running || !chosen.length || data.scored === 0}
            onClick={() => void runModels()}
          >
            {running ? t('autoqa.running') : t('autoqa.testSet.run')}
          </button>
        </div>
        {progress && (
          <p role="status" className="text-sm">
            {t('autoqa.testSet.runProgress', progress)} {progress.waiting && t('autoqa.testSet.waiting')}
          </p>
        )}
        <p className="text-xs text-mu">{t('autoqa.testSet.runHelp')}</p>
      </section>

      {item && cardOf(item) && (
        <Scorer
          key={item.id}
          item={item}
          categories={cardOf(item)?.categories ?? []}
          onSave={save}
          onClose={() => setOpen(null)}
        />
      )}

      <section className={`${card} grid gap-3`} aria-labelledby="items-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="items-title" className="text-lg font-semibold">
            {t('autoqa.testSet.itemsTitle')}
          </h2>
          <div className="flex gap-1" role="group" aria-label={t('autoqa.testSet.language')}>
            {(['', ...LANGS] as const).map((l) => (
              <button
                key={l || 'all'}
                type="button"
                aria-pressed={lang === l}
                className={`rounded-s border px-2 py-1 text-xs font-semibold ${lang === l ? 'border-brand text-brand' : 'border-bd'}`}
                onClick={() => setLang(l)}
              >
                {l ? l.toUpperCase() : t('autoqa.testSet.all')}
              </button>
            ))}
          </div>
        </div>
        <ul className="grid">
          {shown.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-bd py-2 first:border-t-0"
            >
              <span className="grid">
                <span>
                  <small className="mr-2 font-mono text-mu">{i.key}</small>
                  <b>{i.title}</b>
                </span>
                <small className="text-mu">
                  {i.industry} · {t(`cfields.options.channel.${i.channel}`)}
                  {Object.keys(i.runs).length > 0 &&
                    ` · ${t('autoqa.testSet.modelScores')}: ${Object.values(i.runs).map(pct).join(', ')}`}
                </small>
              </span>
              <span className="flex items-center gap-2">
                {i.expected ? (
                  <small className="text-ok">
                    ✓ {t('autoqa.testSet.scoredBy', { score: pct(i.expectedScore), name: i.expectedBy ?? '' })}
                  </small>
                ) : (
                  <small className="text-mu">{t('autoqa.testSet.toScore')}</small>
                )}
                <button type="button" className={smallButton} onClick={() => setOpen(i.id)}>
                  {i.expected ? t('autoqa.testSet.change') : t('autoqa.testSet.scoreIt')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
