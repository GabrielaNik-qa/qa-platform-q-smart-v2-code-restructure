// Planning › QA workload (today's planning.js `PG.workload`): how many reviews every reviewer made, per working day,
// the average score they give, the review types, how often they are disputed, and their last 8 weeks. Staff see the
// reviews of their workspaces, admins all.
import { averageScore, dayOf, passRateOf, scoredOnly } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { BAND_TEXT, colour, Table } from './bits';
import type { Dispute } from './Disputes';
import type { PassRates, ReviewRow } from './QAEntry';
import { card, type CompanyRef, Notice, type PersonRow, useAction } from './ui';

const CHANNELS = ['call', 'chat', 'email', 'other'] as const;
const DAYS = { week: 7, month: 30, quarter: 91 } as const;
type Span = keyof typeof DAYS;
const DAY = 864e5;

export function Workload({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, fail } = useAction();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [disputes, setDisputes] = useState<Set<string>>(new Set());
  const [rates, setRates] = useState<PassRates | null>(null);
  const [span, setSpan] = useState<Span>('month');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void Promise.all([
      api<ReviewRow[]>('/reviews', company.id),
      api<PersonRow[]>('/people', company.id),
      api<Dispute[]>('/disputes', company.id).catch(() => []),
      api<PassRates>('/pass-rates', company.id).catch(() => null),
    ]).then(([r, ppl, d, pr]) => {
      setNow(Date.now());
      setReviews(r);
      setPeople(ppl);
      setDisputes(new Set(d.map((x) => x.reviewId)));
      setRates(pr);
    }, fail);
  }, [company.id, fail]);

  const days = DAYS[span];
  const all = reviews ?? [];
  const list = all.filter((r) => dayOf(r) >= now - days * DAY);
  const working = (days * 5) / 7;
  const target = passRateOf(rates, null);
  const ids = [
    ...new Set([
      ...people.filter((p) => p.active && (p.role === 'admin' || p.role === 'reviewer')).map((p) => p.membershipId),
      ...list.map((r) => r.reviewerId).filter((x): x is string => Boolean(x)),
    ]),
  ];
  const rows = ids
    .map((id) => {
      const mine = list.filter((r) => r.reviewerId === id);
      const scored = scoredOnly(mine);
      const disputed = mine.filter((r) => disputes.has(r.id)).length;
      return {
        id,
        name: people.find((p) => p.membershipId === id)?.name ?? mine[0]?.reviewerName ?? '-',
        n: mine.length,
        average: averageScore(scored),
        perDay: mine.length / working,
        disputed,
        types: CHANNELS.map((k) => [k, mine.filter((r) => r.channel === k).length] as const).filter(([, n]) => n),
        weeks: Array.from({ length: 8 }, (_, i) => {
          const k = 7 - i;
          return all.filter((r) => {
            const age = (now - dayOf(r)) / DAY / 7;
            return r.reviewerId === id && age >= k && age < k + 1;
          }).length;
        }),
      };
    })
    .sort((a, b) => b.n - a.n);
  const avgAll = averageScore(scoredOnly(list));
  const disputedAll = list.filter((r) => disputes.has(r.id)).length;
  const kpi = (title: string, value: ReactNode, sub: string, look = '') => (
    <div className={`${card} !p-4 grid content-start gap-1`}>
      <span className="text-sm">{title}</span>
      <b className={`font-display text-3xl ${look}`}>{value}</b>
      <small className="text-xs text-mu">{sub || ' '}</small>
    </div>
  );
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-brand bg-pn2 font-semibold' : 'border-bd'}`;

  return (
    <section className="grid gap-4" aria-labelledby="workload-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="workload-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.workload')}
          </h1>
          <p className="text-sm text-mu">{t('workload.intro')}</p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('team.period')}>
          {(Object.keys(DAYS) as Span[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={span === k}
              className={chip(span === k)}
              onClick={() => setSpan(k)}
            >
              {t(`workload.spans.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <Notice message={message} />
      {!reviews ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi(t('workload.kpi.made'), list.length, t('workload.kpi.by', { count: rows.filter((r) => r.n).length }))}
            {kpi(t('workload.kpi.perDay'), (list.length / working).toFixed(1), t('workload.kpi.together'))}
            {kpi(
              t('workload.kpi.average'),
              avgAll === null ? '-' : `${avgAll.toFixed(1)}%`,
              '',
              avgAll === null ? '' : BAND_TEXT[colour(avgAll, target)],
            )}
            {kpi(
              t('workload.kpi.disputed'),
              list.length ? `${((disputedAll / list.length) * 100).toFixed(1)}%` : '-',
              t('cats.reviewsCount', { count: disputedAll }),
              'text-wn',
            )}
          </div>
          <div className={`${card} grid gap-2`}>
            <h2 className="font-semibold">{t('workload.reviewers')}</h2>
            <Table
              head={[
                t('cats.reviewer'),
                t('team.cols.reviews'),
                t('workload.kpi.perDay'),
                t('workload.kpi.average'),
                t('workload.types'),
                t('workload.kpi.disputed'),
                t('workload.weeks'),
              ]}
              rows={rows.map((r) => [
                <b key="n">{r.name}</b>,
                r.n,
                r.perDay.toFixed(1),
                r.average === null ? (
                  '-'
                ) : (
                  <b key="a" className={`font-mono ${BAND_TEXT[colour(r.average, target)]}`}>
                    {r.average.toFixed(1)}%
                  </b>
                ),
                r.types.length ? r.types.map(([k, n]) => `${t(`reviews.channels.${k}`)} ${n}`).join(' · ') : '-',
                r.n ? (
                  <span key="d">
                    {r.disputed} <small className="text-mu">({((r.disputed / r.n) * 100).toFixed(0)}%)</small>
                  </span>
                ) : (
                  '-'
                ),
                <div key="w" className="flex h-8 items-end gap-0.5" role="img" aria-label={r.weeks.join(', ')}>
                  {r.weeks.map((v, i) => (
                    <i
                      key={i}
                      className="block w-2 rounded-t-[2px] bg-ac"
                      style={{ height: `${Math.max(3, (v / Math.max(1, ...r.weeks)) * 28)}px` }}
                      title={t('cats.reviewsCount', { count: v })}
                    />
                  ))}
                </div>,
              ])}
            />
          </div>
          <p className="text-sm text-mu">
            {t('workload.tip')}{' '}
            <Link to="/$app/$page" params={{ app: 'quality', page: 'calibration' }} className="text-ac hover:underline">
              {t('workload.calibration')}
            </Link>
            .
          </p>
        </>
      )}
    </section>
  );
}
