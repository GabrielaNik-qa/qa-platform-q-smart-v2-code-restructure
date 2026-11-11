// Planning › Calendar (today's planning.js `PG.calendar`): one month, Monday first, with what is planned on each day:
// calibration sessions and improvement plans (start, end, check-ins). One-to-ones, coaching and task deadlines join
// with their phases. Each person sees only what they may read (an agent: their own plans); staff can show "only mine".
import { can } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import type { Session } from './Calibration';
import { monthName } from './Goals';
import { currentLanguage } from './i18n';
import type { Plan } from './ImprovementPlans';
import { shiftMonth } from './Planner';
import { useSession } from './session';
import { card, type CompanyRef, smallButton } from './ui';

const today = () => new Date().toLocaleDateString('sv-SE');
const LOCALES = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' } as const;
/** each kind of item keeps its own colour (two of the eight checked series colours) */
const KIND_COLOUR = { calibration: 'var(--series-3)', plan: 'var(--series-7)' } as const;
type Kind = keyof typeof KIND_COLOUR;
interface Item {
  day: string;
  kind: Kind;
  text: string;
  link:
    { to: '/calibration/$id'; params: { id: string } } | { to: '/$app/$page'; params: { app: string; page: string } };
}

export function Calendar({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { company: session } = useSession();
  const me = session?.membershipId ?? '';
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [mine, setMine] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([
      // calibration sessions only for the roles who take part in them (an agent doesn't: no refused request)
      can(company.role, 'calibrations.take')
        ? api<Session[]>('/calibrations', company.id).catch(() => [])
        : Promise.resolve([] as Session[]),
      api<Plan[]>('/improvement-plans', company.id).catch(() => []),
    ]).then(([s, p]) => {
      setSessions(s);
      setPlans(p);
      setLoaded(true);
    });
  }, [company.id, company.role]);

  const items: Item[] = [];
  for (const s of sessions)
    if (s.heldOn.slice(0, 7) === month && (!mine || s.owner || s.myParticipantId))
      items.push({
        day: s.heldOn,
        kind: 'calibration',
        text: t('calendar.calibration', { title: s.title }),
        link: { to: '/calibration/$id', params: { id: s.id } },
      });
  for (const p of plans) {
    if (mine && p.byId !== me && p.agentId !== me) continue;
    const link = { to: '/$app/$page' as const, params: { app: 'quality', page: 'improvement-plans' } };
    if (p.startOn.slice(0, 7) === month)
      items.push({ day: p.startOn, kind: 'plan', text: t('calendar.planStarts', { name: p.agentName }), link });
    if (p.endOn.slice(0, 7) === month)
      items.push({ day: p.endOn, kind: 'plan', text: t('calendar.planEnds', { name: p.agentName }), link });
    for (const c of p.checkIns)
      if (c.date.slice(0, 7) === month)
        items.push({ day: c.date, kind: 'plan', text: t('calendar.checkIn', { name: p.agentName }), link });
  }

  const first = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((offset + days) / 7) * 7;
  const now = today();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 10, 2 + i).toLocaleDateString(LOCALES[currentLanguage()], { weekday: 'short' }),
  );

  return (
    <section className="grid gap-4" aria-labelledby="calendar-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="calendar-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
            {t('menu.pages.calendar')}
          </h1>
          <p className="text-sm text-mu">{t('calendar.intro')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {company.role !== 'agent' && (
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={mine}
                onChange={(e) => setMine(e.target.checked)}
              />
              {t('calendar.onlyMine')}
            </label>
          )}
          <div className="flex items-center rounded-full border border-bd">
            <button
              type="button"
              className="px-3 py-1"
              aria-label={t('goals.previous')}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <b className="min-w-40 text-center text-sm">{monthName(month)}</b>
            <button
              type="button"
              className="px-3 py-1"
              aria-label={t('goals.next')}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>
          <button type="button" className={smallButton} onClick={() => setMonth(today().slice(0, 7))}>
            {t('calendar.today')}
          </button>
        </div>
      </div>
      <ul className="flex flex-wrap gap-4 text-sm">
        {(Object.keys(KIND_COLOUR) as Kind[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <i
              className="inline-block size-2.5 rounded-full"
              style={{ background: KIND_COLOUR[k] }}
              aria-hidden="true"
            />
            {t(`calendar.kinds.${k}`)}
          </li>
        ))}
      </ul>
      {!loaded ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <div className={`${card} !p-0 overflow-x-auto`}>
          <div className="grid min-w-[700px] grid-cols-7">
            {weekdays.map((d) => (
              <b key={d} className="border-b border-bd px-2 py-1.5 text-xs uppercase tracking-wide text-mu">
                {d}
              </b>
            ))}
            {Array.from({ length: cells }, (_, i) => {
              const n = i - offset + 1;
              if (n < 1 || n > days) return <div key={i} className="min-h-24 border-b border-r border-bd bg-sunk/40" />;
              const day = `${month}-${String(n).padStart(2, '0')}`;
              const here = items.filter((x) => x.day === day);
              return (
                <div
                  key={i}
                  className={`grid min-h-24 content-start gap-1 border-b border-r border-bd p-1.5 ${day === now ? 'bg-ac/10' : ''}`}
                >
                  <b className={`text-xs ${day === now ? 'text-ac' : ''}`}>{n}</b>
                  {here.slice(0, 4).map((x, j) => (
                    <Link
                      key={j}
                      {...x.link}
                      title={x.text}
                      className="truncate rounded-[4px] border-l-4 bg-pn2 px-1.5 py-0.5 text-xs hover:underline"
                      style={{ borderColor: KIND_COLOUR[x.kind] }}
                    >
                      {x.text}
                    </Link>
                  ))}
                  {here.length > 4 && (
                    <small className="text-xs text-mu">{t('calendar.more', { count: here.length - 4 })}</small>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-sm text-mu">{t('calendar.later')}</p>
    </section>
  );
}
