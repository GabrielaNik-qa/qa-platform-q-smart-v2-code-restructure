// Quality › Home › Getting started (today's help.js `PG.cs_start`, admins only): what to set up so Q-smart works for
// the teams, each line checked on the company's real settings, with the page to do it. The lines whose pages come in
// later phases (attendance, the CRM link, the AI) say which phase brings them.
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import type { ReviewRow } from './QAEntry';
import { card, type CompanyRef, type PersonRow, smallButton, type TeamRow } from './ui';

interface Step {
  id: string;
  done: boolean;
  app: string;
  page: string;
}
const LATER = [
  { id: 'attendance', phase: '6' },
  { id: 'crm', phase: '9' },
  { id: 'ai', phase: '3b' },
];

export function GettingStarted({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    void Promise.all([
      api<{ id: string }[]>('/scorecards', company.id).catch(() => []),
      api<TeamRow[]>('/teams', company.id).catch(() => []),
      api<PersonRow[]>('/people', company.id).catch(() => []),
      api<ReviewRow[]>('/reviews', company.id).catch(() => []),
    ]).then(([cards, teams, people, reviews]) =>
      setSteps([
        { id: 'scorecard', done: cards.length > 0, app: 'admin', page: 'scorecards' },
        { id: 'teams', done: teams.some((x) => !x.isAdministration), app: 'admin', page: 'teams' },
        { id: 'agents', done: people.some((p) => p.role === 'agent' && p.teamId), app: 'admin', page: 'users' },
        { id: 'review', done: reviews.length > 0, app: 'quality', page: 'qa-entry' },
      ]),
    );
  }, [company.id]);

  const done = steps?.filter((s) => s.done).length ?? 0;
  const total = steps?.length ?? 0;
  return (
    <section className="grid max-w-3xl gap-4" aria-labelledby="start-title">
      <div className="grid gap-1">
        <h1 id="start-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('menu.pages.cs_start')}
        </h1>
        <p className="text-sm text-mu">{t('start.intro')}</p>
      </div>
      {!steps ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <div className={`${card} grid gap-3`}>
          <h2 className="font-semibold">{t('start.progress', { done, total })}</h2>
          <div
            className="h-2 overflow-hidden rounded-full bg-sunk"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <div
              className={`h-full rounded-full ${done === total ? 'bg-ok' : 'bg-ac'}`}
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          <ul className="grid">
            {steps.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 border-t border-bd py-2.5 first:border-t-0"
              >
                <span className="flex items-center gap-2">
                  <b className={s.done ? 'text-ok' : 'text-mu'} aria-hidden="true">
                    {s.done ? '✓' : '○'}
                  </b>
                  {t(`start.steps.${s.id}`)}
                  <span className="sr-only">{s.done ? t('start.done') : t('start.todo')}</span>
                </span>
                {s.done ? (
                  <small className="text-mu">{t('start.done')}</small>
                ) : (
                  <Link to="/$app/$page" params={{ app: s.app, page: s.page }} className={smallButton}>
                    {t('start.setUp')} ›
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <div className="grid gap-1 border-t border-bd pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-mu">{t('start.later')}</p>
            {LATER.map((x) => (
              <p key={x.id} className="flex items-center justify-between gap-3 text-sm text-mu">
                <span>○ {t(`start.steps.${x.id}`)}</span>
                <small>{t('start.phase', { phase: x.phase, name: t(`phases.${x.phase}`) })}</small>
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
