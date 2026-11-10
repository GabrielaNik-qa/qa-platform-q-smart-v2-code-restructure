// Quality › Analytics › Topic dashboards (today's help.js `PG.cs_dashes`): one block per topic, from the real data,
// each with a link to its page. Built so far: disputes, calibration, reviewer QA and the pins of coaching. Tasks
// (assignments), coaching sessions and surveys join with their own phases. Each block shows only what the person may
// read (the server decides), so a block they can't read is left out.
import { average } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import type { Session } from './Calibration';
import type { Dispute } from './Disputes';
import { card, type CompanyRef } from './ui';

interface Check {
  fair: boolean;
  follows: boolean;
  critical: boolean;
  useful: boolean;
}
interface Pin {
  status: 'todo' | 'done';
}
const DAY = 864e5;
/** today's score of a reviewer check: the share of the four questions answered yes */
const checkScore = (c: Check) => ([c.fair, c.follows, c.critical, c.useful].filter(Boolean).length / 4) * 100;

export function TopicDashboards({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    disputes: Dispute[] | null;
    sessions: Session[] | null;
    checks: Check[] | null;
    pins: Pin[] | null;
  } | null>(null);

  useEffect(() => {
    const maybe = <T,>(path: string) => api<T>(path, company.id).catch(() => null);
    void Promise.all([
      maybe<Dispute[]>('/disputes'),
      maybe<Session[]>('/calibrations'),
      maybe<Check[]>('/reviewer-checks'),
      maybe<Pin[]>('/pins'),
    ]).then(([disputes, sessions, checks, pins]) => setData({ disputes, sessions, checks, pins }));
  }, [company.id]);

  const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  const block = (title: string, page: string, items: [string, ReactNode, string?][]) => (
    <div className={`${card} grid content-start gap-3`}>
      <h2 className="flex items-center gap-3 font-semibold">
        {title}
        <Link
          to="/$app/$page"
          params={{ app: 'quality', page }}
          className="text-sm font-medium text-ac hover:underline"
        >
          {t('topics.open')} ›
        </Link>
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {items.map(([name, value, look]) => (
          <div key={name} className="rounded-s bg-pn2 p-3">
            <small className="block text-xs text-mu">{name}</small>
            <b className={`font-display text-2xl ${look ?? ''}`}>{value}</b>
          </div>
        ))}
      </div>
    </div>
  );

  let blocks: ReactNode[] = [];
  if (data) {
    const { disputes, sessions, checks, pins } = data;
    if (disputes) {
      const done = disputes.filter((d) => d.state === 'resolved');
      const days = average(
        done
          .filter((d) => d.resolvedAt)
          .map((d) => (new Date(d.resolvedAt ?? '').getTime() - new Date(d.openedAt).getTime()) / DAY),
      );
      blocks.push(
        block(t('topics.disputes'), 'disputes', [
          [t('topics.waiting'), disputes.length - done.length, 'text-wn'],
          [t('topics.resolved'), done.length, 'text-ok'],
          [t('topics.daysToResolve'), days === null ? '-' : days.toFixed(1)],
        ]),
      );
    }
    if (sessions)
      blocks.push(
        block(t('topics.calibration'), 'calibration', [
          [t('topics.sessions'), sessions.length],
          [t('topics.thisMonth'), sessions.filter((s) => s.heldOn.slice(0, 7) === month).length],
          [t('topics.openSessions'), sessions.filter((s) => s.status !== 'closed').length],
        ]),
      );
    if (checks) {
      const avg = average(checks.map(checkScore));
      blocks.push(
        block(t('topics.reviewerQa'), 'reviewer-qa', [
          [t('topics.checks'), checks.length],
          [t('topics.average'), avg === null ? '-' : `${Math.round(avg)}%`],
        ]),
      );
    }
    if (pins)
      blocks.push(
        block(t('topics.coaching'), 'pins', [[t('topics.pinsToTalk'), pins.filter((p) => p.status !== 'done').length]]),
      );
  }
  blocks = blocks.map((b, i) => <div key={i}>{b}</div>);

  return (
    <section className="grid gap-4" aria-labelledby="topics-title">
      <div className="grid gap-1">
        <h1 id="topics-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('menu.pages.cs_dashes')}
        </h1>
        <p className="text-sm text-mu">{t('topics.intro')}</p>
      </div>
      {!data ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2">{blocks}</div>
          <p className="text-sm text-mu">{t('topics.later')}</p>
        </>
      )}
    </section>
  );
}
