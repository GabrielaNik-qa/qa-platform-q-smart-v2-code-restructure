// The charts, drawn by v2 itself as today's app draws them (your decision of 10 November: no chart library): the small
// trend line of a number tile, quality scores over time and category scores over time. The chart rules they follow:
// one scale per chart (the number of reviews gets its own strip under the line, never a second scale on the same
// chart), 2px lines, dots of 8px with a ring in the card's colour, hairline grids, a crosshair and a tooltip that
// shows every value at the date you point at (also with the keyboard: arrow keys), a legend when there are several
// lines, and a "Table" button with the same numbers. The eight category colours (--series-1 … 8) passed the
// colour-blindness check on v2's light and dark cards.
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { smallButton } from './ui';

const SERIES = 8;
const seriesColor = (i: number) => `var(--series-${(i % SERIES) + 1})`;
const pct = (v: number) => `${v.toFixed(1)}%`;

/** The small trend line of a number tile (today's `spark`): the last 10 weeks, the newest marked by a dot. */
export function Sparkline({
  values,
  width = 120,
  height = 26,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
}) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return <small className="text-mu">—</small>;
  const lo = Math.min(...known);
  const range = Math.max(...known) - lo || 1;
  const points = values
    .map((v, i) =>
      v === null ? null : [(i * width) / (values.length - 1), height - 4 - ((v - lo) / range) * (height - 8)],
    )
    .filter((p): p is number[] => p !== null);
  const last = points.at(-1) ?? [0, 0];
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <polyline
        fill="none"
        stroke="var(--brand)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map((p) => p.join(',')).join(' ')}
      />
      <circle cx={last[0]} cy={last[1]} r={4} fill="var(--tx)" stroke="var(--pn)" strokeWidth={2} />
    </svg>
  );
}

/** One point in time: its label, and the numbers at it. */
export interface TimePoint {
  key: string;
  label: string;
  /** the average score, null when there were no reviews */
  average: number | null;
  count: number;
}

const LEFT = 44;
const RIGHT = 16;
/** where point i of n sits across a chart W pixels wide */
const xAt = (i: number, n: number, W: number) => {
  const plot = W - LEFT - RIGHT;
  return LEFT + (n === 1 ? plot / 2 : (i * plot) / (n - 1));
};

/** The chart's real width in pixels: it is drawn at that width, so its text stays 12px in a narrow card too. */
function useWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, width };
}

/** The pointer or the keyboard picks the nearest point in time; the tooltip and crosshair follow it. */
function useCrosshair(n: number, W: number) {
  const [index, setIndex] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = n === 1 ? 0 : Math.round(((x - LEFT) / (W - LEFT - RIGHT)) * (n - 1));
    setIndex(Math.max(0, Math.min(n - 1, i)));
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setIndex((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === 'Escape') setIndex(null);
    else return;
    e.preventDefault();
  };
  return {
    index,
    ref,
    handlers: {
      onPointerMove,
      onPointerLeave: () => setIndex(null),
      onKeyDown,
      onFocus: () => setIndex((i) => i ?? n - 1),
      onBlur: () => setIndex(null),
    },
  };
}

/** The tooltip: placed beside the crosshair, inside the chart. */
function Tooltip({ left, children }: { left: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-m border border-bd bg-pn px-3 py-2 text-sm shadow-card"
      style={left > 60 ? { right: `${100 - left + 2}%` } : { left: `${left + 2}%` }}
    >
      {children}
    </div>
  );
}

/** The "Chart" / "Table" switch of a chart card. */
function ViewSwitch({ table, onChange }: { table: boolean; onChange: (table: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={smallButton} aria-pressed={table} onClick={() => onChange(!table)}>
      {table ? t('dash.charts.chart') : t('dash.charts.table')}
    </button>
  );
}

const grid = [0, 25, 50, 75, 100];
const th = 'py-1 pr-3 text-left font-semibold uppercase text-xs tracking-wide text-mu';
const td = 'py-1 pr-3 font-mono';

/**
 * Quality scores over time (today's "qtime"): the average score as a line on its own 0–100% scale, and the number of
 * reviews as columns in their own strip underneath (today drew both on one chart with two scales).
 */
export function ScoresOverTime({ points, title }: { points: TimePoint[]; title: string }) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  const { ref: wrap, width: W } = useWidth();
  const { index, ref, handlers } = useCrosshair(points.length, W);
  const id = useId();
  if (!points.length) return <p className="text-sm text-mu">{t('dash.charts.noReviews')}</p>;
  const n = points.length;
  const top = 12;
  const lineHeight = 170;
  const y = (v: number) => top + lineHeight * (1 - v / 100);
  const stripTop = top + lineHeight + 26;
  const stripHeight = 56;
  const most = Math.max(1, ...points.map((p) => p.count));
  const yc = (c: number) => stripTop + stripHeight * (1 - c / most);
  const slot = (W - LEFT - RIGHT) / n;
  const column = Math.min(24, slot * 0.6);
  const H = stripTop + stripHeight + 26;
  const line = points
    .map((p, i) => (p.average === null ? null : `${xAt(i, n, W).toFixed(1)},${y(p.average).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const hovered = index === null ? null : points[index];
  const every = Math.max(1, Math.ceil((n * 48) / (W - LEFT - RIGHT)));
  return (
    <div ref={wrap} className="grid gap-2">
      <div className="flex justify-end">
        <ViewSwitch table={table} onChange={setTable} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t('dash.charts.period')}</th>
              <th className={th}>{t('dash.charts.average')}</th>
              <th className={th}>{t('dash.charts.reviews')}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-bd">
                <td className="py-1 pr-3">{p.label}</td>
                <td className={td}>{p.average === null ? '—' : pct(p.average)}</td>
                <td className={td}>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            className="block font-sans focus:outline-2 focus:outline-brand rounded-s"
            role="img"
            tabIndex={0}
            aria-label={title}
            aria-describedby={id}
            {...handlers}
          >
            {grid.map((v) => (
              <g key={v}>
                <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke="var(--bd)" strokeWidth={1} />
                <text x={LEFT - 8} y={y(v) + 4} fontSize={12} textAnchor="end" fill="var(--mu)">
                  {v}%
                </text>
              </g>
            ))}
            <line x1={LEFT} x2={W - RIGHT} y1={stripTop + stripHeight} y2={stripTop + stripHeight} stroke="var(--bd)" />
            <text x={LEFT - 8} y={stripTop + 8} fontSize={12} textAnchor="end" fill="var(--mu)">
              {most}
            </text>
            <text x={LEFT} y={stripTop - 8} fontSize={12} fill="var(--mu)">
              {t('dash.charts.reviews')}
            </text>
            {points.map((p, i) => {
              const x = xAt(i, n, W);
              const h = stripTop + stripHeight - yc(p.count);
              const r = Math.min(4, h);
              return (
                <g key={p.key}>
                  {p.count > 0 && (
                    <path
                      d={`M${x - column / 2},${stripTop + stripHeight} v${-(h - r)} q0,${-r} ${r},${-r} h${column - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                      fill="var(--mu)"
                      opacity={index === i ? 0.6 : 0.35}
                    />
                  )}
                  {i % every === 0 && (
                    <text x={x} y={H - 6} fontSize={12} textAnchor="middle" fill="var(--mu)">
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
            {index !== null && (
              <line
                x1={xAt(index, n, W)}
                x2={xAt(index, n, W)}
                y1={top}
                y2={stripTop + stripHeight}
                stroke="var(--mu)"
              />
            )}
            <polyline fill="none" stroke="var(--score-line)" strokeWidth={2} strokeLinejoin="round" points={line} />
            {points.map((p, i) =>
              p.average === null ? null : (
                <circle
                  key={p.key}
                  cx={xAt(i, n, W)}
                  cy={y(p.average)}
                  r={index === i ? 6 : 4}
                  fill="var(--score-line)"
                  stroke="var(--pn)"
                  strokeWidth={2}
                />
              ),
            )}
          </svg>
          <p id={id} className="sr-only">
            {points.map((p) => `${p.label}: ${p.average === null ? '—' : pct(p.average)}, ${p.count}`).join('; ')}
          </p>
          {hovered && index !== null && (
            <Tooltip left={(xAt(index, n, W) / W) * 100}>
              <div className="text-mu text-xs">{hovered.label}</div>
              <div className="flex items-center gap-2">
                <i className="inline-block h-0.5 w-3 bg-[var(--score-line)]" aria-hidden="true" />
                <b className="font-mono">{hovered.average === null ? '—' : pct(hovered.average)}</b>
                <span className="text-mu">{t('dash.charts.average')}</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="inline-block size-2.5 rounded-sm bg-mu/40" aria-hidden="true" />
                <b className="font-mono">{hovered.count}</b>
                <span className="text-mu">{t('dash.charts.reviews')}</span>
              </div>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

/** One line per category (today's "cattime"), in the eight checked colours; more categories are in the table. */
export function CategoriesOverTime({
  points,
  categories,
  title,
}: {
  points: { key: string; label: string; values: Record<string, number | null> }[];
  categories: string[];
  title: string;
}) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  const { ref: wrap, width: W } = useWidth();
  const { index, ref, handlers } = useCrosshair(points.length, W);
  const id = useId();
  if (points.length < 2 || !categories.length) return <p className="text-sm text-mu">{t('dash.charts.notEnough')}</p>;
  const n = points.length;
  const shown = categories.slice(0, SERIES);
  const top = 12;
  const height = 200;
  const H = top + height + 30;
  const y = (v: number) => top + height * (1 - v / 100);
  const hovered = index === null ? null : points[index];
  const every = Math.max(1, Math.ceil((n * 48) / (W - LEFT - RIGHT)));
  return (
    <div ref={wrap} className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t('dash.charts.legend')}>
          {shown.map((c, i) => (
            <li key={c} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-4 rounded" style={{ background: seriesColor(i) }} aria-hidden="true" />
              {c}
            </li>
          ))}
          {categories.length > SERIES && (
            <li className="text-mu">{t('dash.charts.more', { count: categories.length - SERIES })}</li>
          )}
        </ul>
        <ViewSwitch table={table} onChange={setTable} />
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>{t('dash.charts.period')}</th>
                {categories.map((c) => (
                  <th key={c} className={th}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key} className="border-t border-bd">
                  <td className="py-1 pr-3 whitespace-nowrap">{p.label}</td>
                  {categories.map((c) => {
                    const v = p.values[c];
                    return (
                      <td key={c} className={td}>
                        {v === null || v === undefined ? '—' : pct(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            className="block font-sans focus:outline-2 focus:outline-brand rounded-s"
            role="img"
            tabIndex={0}
            aria-label={title}
            aria-describedby={id}
            {...handlers}
          >
            {grid.map((v) => (
              <g key={v}>
                <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke="var(--bd)" strokeWidth={1} />
                <text x={LEFT - 8} y={y(v) + 4} fontSize={12} textAnchor="end" fill="var(--mu)">
                  {v}%
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % every === 0 ? (
                <text key={p.key} x={xAt(i, n, W)} y={H - 8} fontSize={12} textAnchor="middle" fill="var(--mu)">
                  {p.label}
                </text>
              ) : null,
            )}
            {index !== null && (
              <line x1={xAt(index, n, W)} x2={xAt(index, n, W)} y1={top} y2={top + height} stroke="var(--mu)" />
            )}
            {shown.map((c, ci) => {
              const line = points
                .map((p, i) => {
                  const v = p.values[c];
                  return v === null || v === undefined ? null : `${xAt(i, n, W).toFixed(1)},${y(v).toFixed(1)}`;
                })
                .filter(Boolean)
                .join(' ');
              return (
                <polyline
                  key={c}
                  fill="none"
                  stroke={seriesColor(ci)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={line}
                />
              );
            })}
            {index !== null &&
              shown.map((c, ci) => {
                const v = points[index]?.values[c];
                return v === null || v === undefined ? null : (
                  <circle
                    key={c}
                    cx={xAt(index, n, W)}
                    cy={y(v)}
                    r={4}
                    fill={seriesColor(ci)}
                    stroke="var(--pn)"
                    strokeWidth={2}
                  />
                );
              })}
          </svg>
          <p id={id} className="sr-only">
            {t('dash.charts.useTable')}
          </p>
          {hovered && index !== null && (
            <Tooltip left={(xAt(index, n, W) / W) * 100}>
              <div className="text-mu text-xs mb-1">{hovered.label}</div>
              {shown
                .map((c, ci) => ({ c, ci, v: hovered.values[c] }))
                .sort((a, b) => (b.v ?? -1) - (a.v ?? -1))
                .map(({ c, ci, v }) => (
                  <div key={c} className="flex items-center gap-2 whitespace-nowrap">
                    <i
                      className="inline-block h-0.5 w-3 shrink-0"
                      style={{ background: seriesColor(ci) }}
                      aria-hidden="true"
                    />
                    <b className="font-mono">{v === null || v === undefined ? '—' : pct(v)}</b>
                    <span className="text-mu">{c}</span>
                  </div>
                ))}
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
