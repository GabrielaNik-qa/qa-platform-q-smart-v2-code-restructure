// Learning › Tools (Phase 6, piece 4; today's Tools): Redaction (in the browser, nothing is sent or saved), the Translator (through
// the AI engine), the Sample calculator (how many reviews make a fair score) and the Score simulator (what-if, nothing is
// saved). The Script builder is on the Help page, as it is a list staff write and everybody reads.
import {
  ACCEPTED_ERRORS,
  type Answer,
  CONFIDENCES,
  type GivenAnswer,
  passes,
  type RedactKind,
  redact,
  sampleSize,
  scoreReview,
} from '@qsmart/shared';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Empty, Table } from './bits';
import { currentLanguage } from './i18n';
import type { PassRates, ReviewRow } from './QAEntry';
import type { ScorecardRow } from './Scorecards';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, smallButton, useAction } from './ui';

function Header({ name, intro }: { name: string; intro: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1">
      <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t(`menu.pages.${name}`)}</h1>
      <p className="text-sm text-mu">{t(intro)}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={smallButton}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setDone(true))
          .catch(() => setDone(false));
      }}
    >
      {done ? t('tools.copied') : t('tools.copy')}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------ Redaction
export function Redaction() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof redact> | null>(null);
  const kinds: RedactKind[] = ['card', 'iban', 'email', 'phone', 'number'];
  const total = result ? kinds.reduce((sum, k) => sum + result.found[k], 0) : 0;
  return (
    <section className="grid gap-4">
      <Header name="cs_redact" intro="tools.redact.intro" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} grid content-start gap-3`}>
          <label className="grid gap-1 text-sm font-medium">
            {t('tools.redact.yourText')}
            <textarea
              className={field}
              rows={14}
              maxLength={200_000}
              value={text}
              placeholder={t('tools.redact.placeholder')}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="flex justify-end">
            <button type="button" className={primaryButton} onClick={() => setResult(redact(text))}>
              {t('tools.redact.run')}
            </button>
          </div>
        </div>
        <div className={`${card} grid content-start gap-3`}>
          <h2 className="font-semibold">{t('tools.redact.result')}</h2>
          {result ? (
            <>
              <p role="status" className="flex flex-wrap gap-2 text-sm">
                {total ? (
                  kinds
                    .filter((k) => result.found[k])
                    .map((k) => (
                      <span key={k} className="rounded-full bg-wn/15 px-2 text-wn">
                        {result.found[k]} × {t(`tools.redact.kind.${k}`)}
                      </span>
                    ))
                ) : (
                  <span className="rounded-full bg-ok/12 px-2 text-ok">{t('tools.redact.nothing')}</span>
                )}
              </p>
              <textarea className={field} rows={12} readOnly value={result.out} aria-label={t('tools.redact.result')} />
              <div className="flex justify-end">
                <CopyButton text={result.out} />
              </div>
            </>
          ) : (
            <p className="text-sm text-mu">{t('tools.redact.hint')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Translator
const TARGETS = ['en', 'bg', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'ro', 'el', 'tr', 'pl'] as const;

export function Translator({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, run } = useAction();
  const [text, setText] = useState('');
  const [to, setTo] = useState<string>(currentLanguage());
  const [out, setOut] = useState<{ translation: string; from: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function translate() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setOut(null);
    await run(
      () =>
        api<{ translation: string; from: string }>('/tools/translate', company.id, {
          method: 'POST',
          body: { text, to },
        }).then(setOut),
      '',
    );
    setBusy(false);
  }
  return (
    <section className="grid gap-4">
      <Header name="cs_transl" intro="tools.translate.intro" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} grid content-start gap-3`}>
          <label className="grid gap-1 text-sm font-medium">
            {t('tools.translate.yourText')}
            <textarea
              className={field}
              rows={12}
              maxLength={12_000}
              value={text}
              placeholder={t('tools.translate.placeholder')}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm font-medium">
              {t('tools.translate.into')}
              <select className={field} value={to} onChange={(e) => setTo(e.target.value)}>
                {TARGETS.map((c) => (
                  <option key={c} value={c}>
                    {t(`tools.translate.lang.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={primaryButton}
              disabled={busy || !text.trim()}
              onClick={() => void translate()}
            >
              {busy ? t('tools.translate.busy') : `✨ ${t('tools.translate.run')}`}
            </button>
          </div>
          <p className="text-xs text-mu">{t('tools.translate.privacy')}</p>
        </div>
        <div className={`${card} grid content-start gap-3`}>
          <h2 className="font-semibold">{t('tools.translate.result')}</h2>
          <Notice message={message} />
          {out ? (
            <>
              {out.from && <p className="text-sm text-mu">{t('tools.translate.from', { language: out.from })}</p>}
              <textarea
                className={field}
                rows={12}
                readOnly
                value={out.translation}
                aria-label={t('tools.translate.result')}
              />
              <p className="text-xs text-mu">{t('tools.translate.aiNote')}</p>
              <div className="flex justify-end">
                <CopyButton text={out.translation} />
              </div>
            </>
          ) : (
            !message && <p className="text-sm text-mu">{t('tools.translate.hint')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Sample calculator
export function SampleCalculator({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { fail } = useAction();
  const [population, setPopulation] = useState(400);
  const [confidence, setConfidence] = useState(95);
  const [error, setError] = useState(10);
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [agents, setAgents] = useState<PersonRow[]>([]);
  useEffect(() => {
    void Promise.all([api<ReviewRow[]>('/reviews', company.id), api<PersonRow[]>('/people', company.id)]).then(
      ([r, p]) => {
        setReviews(r);
        setAgents(p.filter((x) => x.role === 'agent' && x.active));
      },
      fail,
    );
  }, [company.id, fail]);
  const need = sampleSize(population, confidence, error);
  const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  const rows = agents
    .map((a) => ({
      a,
      n: (reviews ?? []).filter(
        (r) => r.agentId === a.membershipId && r.reviewedOn.slice(0, 7) === month && !r.notScored,
      ).length,
    }))
    .sort((x, y) => x.n - y.n);
  const select = (
    label: string,
    value: number,
    set: (n: number) => void,
    options: readonly number[],
    suffix: (n: number) => string,
  ) => (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select className={field} value={value} onChange={(e) => set(Number(e.target.value))}>
        {options.map((v) => (
          <option key={v} value={v}>
            {suffix(v)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="grid gap-4">
      <Header name="cs_sample" intro="tools.sample.intro" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} grid content-start gap-3`}>
          <h2 className="font-semibold">{t('tools.sample.numbers')}</h2>
          <label className="grid gap-1 text-sm font-medium">
            {t('tools.sample.population')}
            <input
              className={field}
              type="number"
              min={1}
              max={1_000_000}
              value={population}
              onChange={(e) => setPopulation(Math.max(1, Math.min(1_000_000, Number(e.target.value) || 1)))}
            />
          </label>
          {select(t('tools.sample.confidence'), confidence, setConfidence, CONFIDENCES, (v) => `${v}%`)}
          {select(t('tools.sample.error'), error, setError, ACCEPTED_ERRORS, (v) => `± ${v}`)}
        </div>
        <div className={`${card} grid content-start gap-2`}>
          <h2 className="font-semibold">{t('tools.sample.result')}</h2>
          <p className="m-0 font-display text-5xl font-bold" aria-live="polite">
            {need}
          </p>
          <p className="m-0 text-sm text-mu">{t('tools.sample.explain', { error, confidence })}</p>
        </div>
      </div>
      <div className={`${card} grid gap-3`}>
        <h2 className="font-semibold">{t('tools.sample.thisMonth')}</h2>
        {!reviews ? (
          <p className="text-mu">{t('common.loading')}</p>
        ) : rows.length ? (
          <Table
            head={[t('tools.sample.agent'), t('tools.sample.reviews'), t('tools.sample.needed'), '']}
            rows={rows.map(({ a, n }) => [
              <b key="n">{a.name}</b>,
              n,
              need,
              n >= need ? (
                <span key="s" className="rounded-full bg-ok/12 px-2 text-xs font-semibold text-ok">
                  {t('tools.sample.enough')}
                </span>
              ) : (
                <span key="s" className="rounded-full bg-wn/15 px-2 text-xs font-semibold text-wn">
                  {t('tools.sample.more', { n: need - n })}
                </span>
              ),
            ])}
          />
        ) : (
          <Empty>{t('tools.sample.none')}</Empty>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Score simulator
export function ScoreSimulator({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, fail } = useAction();
  const [cards, setCards] = useState<ScorecardRow[] | null>(null);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [chosen, setChosen] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  useEffect(() => {
    void Promise.all([api<ScorecardRow[]>('/scorecards', company.id), api<PassRates>('/pass-rates', company.id)]).then(
      ([c, r]) => {
        setCards(c);
        setRates(r);
        setChosen((now) => now || c[0]?.id || '');
      },
      fail,
    );
  }, [company.id, fail]);
  const card1 = cards?.find((c) => c.id === chosen) ?? cards?.[0];
  const scored = useMemo(() => {
    if (!card1) return null;
    const given: GivenAnswer[][] = card1.categories.map((c, ci) =>
      c.questions.map((_, qi) => ({ answer: answers[`${ci}.${qi}`] ?? 'y' })),
    );
    return scoreReview(card1.categories, given);
  }, [card1, answers]);
  const pass = rates?.general ?? 85;
  const note = (node: ReactNode) => <p className="text-sm text-mu">{node}</p>;
  if (!cards)
    return (
      <section className="grid gap-4">
        <Header name="cs_scoresim" intro="tools.sim.intro" />
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );
  return (
    <section className="grid gap-4">
      <Header name="cs_scoresim" intro="tools.sim.intro" />
      {!card1 || !scored ? (
        <div className={card}>{note(t('tools.sim.none'))}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className={field}
              aria-label={t('tools.sim.scorecard')}
              value={card1.id}
              onChange={(e) => {
                setChosen(e.target.value);
                setAnswers({});
              }}
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className={smallButton} onClick={() => setAnswers({})}>
              {t('tools.sim.reset')}
            </button>
            <span className="ml-auto flex items-center gap-3">
              {scored.zero && (
                <span className="rounded-full bg-bad/12 px-2 text-sm font-semibold text-bad">
                  {t('tools.sim.zero')}
                </span>
              )}
              <b
                aria-live="polite"
                className={`font-display text-3xl ${scored.notScored || !passes(scored.score, pass) ? 'text-bad' : 'text-ok'}`}
              >
                {scored.notScored ? t('tools.sim.notScored') : `${scored.score}%`}
              </b>
            </span>
          </div>
          {card1.categories.map((c, ci) => {
            const sc = scored.categories[ci];
            return (
              <div key={ci} className={`${card} grid gap-2`}>
                <h2 className="font-semibold">
                  {c.name}{' '}
                  {c.critical && (
                    <span className="rounded-full bg-bad/12 px-2 text-xs font-semibold text-bad">
                      {t('tools.sim.criticalCategory')}
                    </span>
                  )}{' '}
                  <small className="font-normal text-mu">
                    {sc?.earned}/{sc?.possible}
                  </small>
                </h2>
                {c.questions.map((q, qi) => {
                  const key = `${ci}.${qi}`;
                  const now = answers[key] ?? 'y';
                  return (
                    <div key={qi} className="flex flex-wrap items-center gap-3 border-t border-bd pt-2">
                      <span className="min-w-0 flex-1">
                        {q.text}{' '}
                        {q.critical && (
                          <span className="rounded-full bg-bad/12 px-2 text-xs font-semibold text-bad">
                            {t('tools.sim.critical')}
                          </span>
                        )}{' '}
                        <small className="text-mu">{t('tools.sim.points', { n: q.points })}</small>
                      </span>
                      <span role="group" aria-label={q.text} className="flex gap-1">
                        {(['y', 'n', 'na'] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            aria-pressed={now === a}
                            className={`rounded-s border px-2 py-1 text-xs font-semibold ${now === a ? 'border-brand bg-brand text-on-brand' : 'border-bd hover:border-tx'}`}
                            onClick={() => setAnswers({ ...answers, [key]: a })}
                          >
                            {t(`tools.sim.answer.${a}`)}
                          </button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
