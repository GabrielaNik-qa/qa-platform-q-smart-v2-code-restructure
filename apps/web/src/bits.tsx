// Small pieces the quality pages share (Dashboard widgets, Agents, Team Review): today's score colours and pills, the
// thin bar, a plain table, and the links that open a review, an agent's profile or a team.
import { passRateOf } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { findPage, isBuilt, menuOf } from './menu';
import type { PassRates, ReviewRow } from './QAEntry';
import { useSession } from './session';

const pct1 = (v: number) => `${v.toFixed(1)}%`;

/** Today's pass/below/fail colour of a score, against a team's pass rate (today's `sp` and `scol`). */
export function band(value: number, rates: PassRates | null, teamId: string | null) {
  const p = passRateOf(rates, teamId);
  return value >= p ? 'ok' : value >= Math.min(70, p) ? 'wn' : 'bad';
}
export const BAND_TEXT = { ok: 'text-ok', wn: 'text-wn', bad: 'text-bad', hot: 'text-hot' } as const;
export const BAND_FILL = { ok: 'bg-ok', wn: 'bg-wn', bad: 'bg-bad', hot: 'bg-hot' } as const;
export const BAND_SOFT = {
  ok: 'bg-ok/12 text-ok',
  wn: 'bg-wn/15 text-wn',
  bad: 'bg-bad/12 text-bad',
  hot: 'bg-hot/12 text-hot',
} as const;
/** today's colour of a value against the target: at it, below it, low, failing */
export const colour = (v: number, target: number) => (v >= target ? 'ok' : v >= 70 ? 'wn' : v >= 50 ? 'hot' : 'bad');

/** A score as today's coloured pill. */
export function ScorePill({ value, rates, teamId }: { value: number; rates: PassRates | null; teamId: string | null }) {
  return (
    <span className={`rounded-full px-2 text-xs font-semibold font-mono ${BAND_SOFT[band(value, rates, teamId)]}`}>
      {Math.round(value * 10) / 10}%
    </span>
  );
}
/** A value against the target, as today's tinted cell (green at the target or above, red below). */
export function Versus({ value, target }: { value: number | null; target: number }) {
  if (value === null) return <span className="text-mu">—</span>;
  return (
    <span
      className={`inline-block min-w-16 rounded-[6px] px-2 py-0.5 text-right font-mono tabular-nums ${value >= target ? 'bg-ok/12' : 'bg-bad/12'}`}
    >
      {pct1(value)}
    </span>
  );
}
/** Today's thin bar under a row. */
export function Bar({ value, tone }: { value: number; tone: keyof typeof BAND_FILL | 'mu' }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunk">
      <div
        className={`h-full rounded-full ${tone === 'mu' ? 'bg-mu/40' : BAND_FILL[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-mu">{children}</p>;
}
export const th = 'py-1 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-mu';
export const td = 'py-1.5 pr-3';
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-bd">
              {r.map((cell, j) => (
                <td key={j} className={td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export const ReviewLink = ({ r }: { r: ReviewRow }) => (
  <Link to="/review/$id" params={{ id: r.id }} className="font-mono font-semibold text-ac hover:underline">
    {r.leadId}
  </Link>
);

/** Does the signed-in person see a quality page (their menu has it, and v2 has built it)? */
function useSees(page: string) {
  const { company } = useSession();
  const found = company ? findPage(menuOf(company), 'quality', page) : undefined;
  return Boolean(found && isBuilt(found.app.id, found.page));
}

/** An agent's name that opens their profile on the Agents page (today's `agLink`). */
export function AgentLink({ id, name }: { id: string | null; name: string }) {
  const sees = useSees('agents');
  if (!id || !sees) return <>{name}</>;
  return (
    <Link
      to="/$app/$page"
      params={{ app: 'quality', page: 'agents' }}
      search={{ agent: id }}
      className="font-semibold text-ac hover:underline"
      title={name}
    >
      {name}
    </Link>
  );
}

/** A team's name that opens it on Team Review (today's `teamLink`); plain text for whoever doesn't see that page. */
export function TeamLink({ id, name, color }: { id: string | null; name: string; color?: string }) {
  const sees = useSees('team-review');
  const style = color ? { color } : undefined;
  if (!id || !sees)
    return (
      <span className="font-semibold" style={style}>
        {name}
      </span>
    );
  return (
    <Link
      to="/$app/$page"
      params={{ app: 'quality', page: 'team-review' }}
      search={{ team: id }}
      className="font-semibold text-ac hover:underline"
      style={style}
    >
      {name}
    </Link>
  );
}
