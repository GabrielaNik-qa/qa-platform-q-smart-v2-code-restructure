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
  if (known.length < 2) return <small className="text-mu">-</small>;
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
 * Quality scores over time (today's "qtime"): the average score as a line on its own 0-100% scale, and the number of
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
                <td className={td}>{p.average === null ? '-' : pct(p.average)}</td>
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
            {points.map((p) => `${p.label}: ${p.average === null ? '-' : pct(p.average)}, ${p.count}`).join('; ')}
          </p>
          {hovered && index !== null && (
            <Tooltip left={(xAt(index, n, W) / W) * 100}>
              <div className="text-mu text-xs">{hovered.label}</div>
              <div className="flex items-center gap-2">
                <i className="inline-block h-0.5 w-3 bg-[var(--score-line)]" aria-hidden="true" />
                <b className="font-mono">{hovered.average === null ? '-' : pct(hovered.average)}</b>
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
                        {v === null || v === undefined ? '-' : pct(v)}
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
                    <b className="font-mono">{v === null || v === undefined ? '-' : pct(v)}</b>
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

/**
 * A ring: the share of each part, the biggest first, with a legend beside it (today's `donut`). Eight colours at most:
 * past eight, the smallest parts fold into "Other", so a colour never repeats.
 */
export function Donut({
  rows,
  empty,
  label,
}: {
  rows: { name: string; value: number }[];
  empty: string;
  label: string;
}) {
  const { t } = useTranslation();
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total) return <p className="text-center text-sm text-mu">{empty}</p>;
  const parts =
    rows.length > SERIES
      ? [
          ...rows.slice(0, SERIES - 1),
          { name: t('dash.charts.other'), value: rows.slice(SERIES - 1).reduce((a, r) => a + r.value, 0) },
        ]
      : rows;
  const R = 70;
  const inner = 44;
  const C = 80;
  const at = (angle: number, r: number) =>
    `${(C + r * Math.cos(angle)).toFixed(2)} ${(C + r * Math.sin(angle)).toFixed(2)}`;
  let start = -Math.PI / 2;
  const share = (v: number) => `${((v / total) * 100).toFixed(1)}%`;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 160 160" width={150} height={150} role="img" aria-label={label} className="flex-none">
        {parts.length === 1 ? (
          <circle cx={C} cy={C} r={(R + inner) / 2} fill="none" stroke={seriesColor(0)} strokeWidth={R - inner}>
            <title>{`${parts[0]?.name}: 100%`}</title>
          </circle>
        ) : (
          parts.map((p, i) => {
            const end = start + (p.value / total) * 2 * Math.PI;
            const big = end - start > Math.PI ? 1 : 0;
            const d = `M${at(start, R)}A${R} ${R} 0 ${big} 1 ${at(end, R)}L${at(end, inner)}A${inner} ${inner} 0 ${big} 0 ${at(start, inner)}Z`;
            start = end;
            return (
              <path key={p.name} d={d} fill={seriesColor(i)} stroke="var(--pn)" strokeWidth={2}>
                <title>{`${p.name}: ${share(p.value)} (${p.value})`}</title>
              </path>
            );
          })
        )}
      </svg>
      <ul className="grid min-w-40 flex-1 gap-1 text-[12.5px]">
        {parts.map((p, i) => (
          <li key={p.name} className="flex items-center gap-2">
            <i
              className="inline-block size-2.5 flex-none rounded-full"
              style={{ background: seriesColor(i) }}
              aria-hidden="true"
            />
            <span className="flex-1">{p.name}</span>
            <b className="font-mono">{share(p.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every category at its average score, with the target as a line across (today's "Average category scores"). */
export function CategoryDots({
  categories,
  target,
  title,
}: {
  categories: { name: string; value: number }[];
  target: number;
  title: string;
}) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  const { ref: wrap, width: W } = useWidth();
  const n = categories.length;
  const left = 44;
  const right = 44;
  const top = 14;
  const plot = 180;
  const bottom = 110;
  const H = top + plot + bottom;
  const x = (i: number) => left + ((i + 0.5) * (W - left - right)) / n;
  const y = (v: number) => top + plot * (1 - v / 100);
  return (
    <div ref={wrap} className="grid gap-2">
      <div className="flex justify-end">
        <ViewSwitch table={table} onChange={setTable} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t('widgets.h.category')}</th>
              <th className={th}>{t('widgets.h.average')}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.name} className="border-t border-bd">
                <td className="py-1 pr-3">{c.name}</td>
                <td className={td}>{pct(c.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title} className="block font-sans">
          {grid.map((v) => (
            <g key={v}>
              <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke="var(--bd)" />
              <text x={left - 8} y={y(v) + 4} fontSize={12} textAnchor="end" fill="var(--mu)">
                {v}%
              </text>
            </g>
          ))}
          <line x1={left} x2={W - right} y1={y(target)} y2={y(target)} stroke="var(--tx)" strokeWidth={1.5} />
          <text x={W - right + 6} y={y(target) + 4} fontSize={12} fontWeight={600} fill="var(--tx)">
            {target}%
          </text>
          {categories.map((c, i) => (
            <g key={c.name}>
              <circle
                cx={x(i)}
                cy={y(c.value)}
                r={6}
                fill={c.value >= target ? 'var(--ok)' : 'var(--bad)'}
                stroke="var(--pn)"
                strokeWidth={2}
              >
                <title>{`${c.name}: ${pct(c.value)}`}</title>
              </circle>
              <text
                transform={`translate(${x(i)},${top + plot + 16}) rotate(-35)`}
                textAnchor="end"
                fontSize={12}
                fill="var(--mu)"
              >
                {c.name.length > 24 ? `${c.name.slice(0, 23)}…` : c.name}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/**
 * Agent against team, category by category (today's Agents › Performance radar): one shape per series on one 0-100%
 * scale with a ring every 20%. Pointing at (or arrowing to) a category shows both values; "Table" has the same numbers.
 */
export function Radar({
  names,
  series,
  title,
}: {
  names: string[];
  series: { label: string; values: (number | null)[]; color: string }[];
  title: string;
}) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const { ref: wrap, width } = useWidth();
  const svg = useRef<SVGSVGElement>(null);
  const W = Math.min(760, width);
  const H = Math.max(260, Math.min(380, Math.round(W * 0.55)));
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.max(50, Math.min(122, (W - 300) / 2, H / 2 - 40));
  const n = names.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i: number, v: number): [number, number] => [
    cx + (Math.cos(angle(i)) * R * v) / 100,
    cy + (Math.sin(angle(i)) * R * v) / 100,
  ];
  const shape = (values: (number | null)[]) =>
    values
      .map((v, i) =>
        at(i, v ?? 0)
          .map((x) => x.toFixed(1))
          .join(','),
      )
      .join(' ');
  const ring = (v: number) =>
    names
      .map((_, i) =>
        at(i, v)
          .map((x) => x.toFixed(1))
          .join(','),
      )
      .join(' ');
  const value = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${Math.round(v)}%`);
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !n) return;
    const x = ((e.clientX - box.left) / box.width) * W - cx;
    const y = ((e.clientY - box.top) / box.height) * H - cy;
    if (Math.hypot(x, y) > R + 60) {
      setIndex(null);
      return;
    }
    const a = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    setIndex(Math.round((a / (2 * Math.PI)) * n) % n);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setIndex((i) => ((i ?? -1) + 1) % n);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setIndex((i) => ((i ?? 0) - 1 + n) % n);
    else if (e.key === 'Escape') setIndex(null);
    else return;
    e.preventDefault();
  };
  const hovered = index === null ? undefined : names[index];
  return (
    <div ref={wrap} className="grid gap-2">
      <div className="flex justify-end">
        <ViewSwitch table={table} onChange={setTable} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t('widgets.h.category')}</th>
              {series.map((s) => (
                <th key={s.label} className={th}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((name, i) => (
              <tr key={name} className="border-t border-bd">
                <td className="py-1 pr-3">{name}</td>
                {series.map((s) => (
                  <td key={s.label} className={td}>
                    {value(s.values[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative mx-auto w-full" style={{ maxWidth: W }}>
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={title}
            tabIndex={0}
            className="block font-sans focus:outline-2 focus:outline-brand rounded-s"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setIndex(null)}
            onKeyDown={onKeyDown}
            onFocus={() => setIndex((i) => i ?? 0)}
            onBlur={() => setIndex(null)}
          >
            {[20, 40, 60, 80, 100].map((v) => (
              <g key={v}>
                <polygon points={ring(v)} fill="none" stroke="var(--bd)" />
                <text x={cx + 3} y={cy - (R * v) / 100 + 3} fontSize={10} fill="var(--mu)">
                  {v}%
                </text>
              </g>
            ))}
            {names.map((name, i) => {
              const [x, y] = at(i, 100);
              const c = Math.cos(angle(i));
              const s = Math.sin(angle(i));
              return (
                <g key={name}>
                  <line x1={cx} y1={cy} x2={x} y2={y} stroke={index === i ? 'var(--mu)' : 'var(--bd)'} />
                  <text
                    x={x + c * 14}
                    y={y + s * 14 + 4}
                    fontSize={12.5}
                    fontWeight={index === i ? 700 : 400}
                    textAnchor={c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'}
                    fill="var(--tx)"
                  >
                    {name.length > 22 ? `${name.slice(0, 21)}…` : name}
                  </text>
                </g>
              );
            })}
            {[...series].reverse().map((s) => (
              <g key={s.label}>
                <polygon
                  points={shape(s.values)}
                  fill={s.color}
                  fillOpacity={0.18}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {s.values.map((v, i) =>
                  v === null ? null : (
                    <circle
                      key={names[i]}
                      cx={at(i, v)[0]}
                      cy={at(i, v)[1]}
                      r={index === i ? 6 : 4}
                      fill={s.color}
                      stroke="var(--pn)"
                      strokeWidth={2}
                    />
                  ),
                )}
              </g>
            ))}
          </svg>
          {hovered !== undefined && index !== null && (
            <Tooltip left={(at(index, 100)[0] / W) * 100}>
              <div className="text-xs text-mu">{hovered}</div>
              {series.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <i
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  <b className="font-mono">{value(s.values[index])}</b>
                  <span className="text-mu">{s.label}</span>
                </div>
              ))}
            </Tooltip>
          )}
          <ul className="flex flex-wrap justify-center gap-4 text-sm">
            {series.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One column of the score chart: a day, a week or a month, with its reviews' average. */
export interface ScoreColumn {
  key: string;
  /** under the column */
  label: string;
  /** in the tooltip and the table */
  long: string;
  average: number | null;
  count: number;
}

/** The straight line closest to the points (least squares), or null when they don't define one. */
export function fitLine(points: [number, number][]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const sx = points.reduce((s, p) => s + p[0], 0);
  const sy = points.reduce((s, p) => s + p[1], 0);
  const sxy = points.reduce((s, p) => s + p[0] * p[1], 0);
  const sxx = points.reduce((s, p) => s + p[0] * p[0], 0);
  const d = n * sxx - sx * sx;
  if (!d) return null;
  const slope = (n * sxy - sx * sy) / d;
  return { slope, intercept: (sy - slope * sx) / n };
}

/**
 * The Agents page's score evolution (today's `agChart`): one wide column per day, week or month (never one per review),
 * green at the pass rate or above, amber below, the pass rate as a dashed line and the trend as a straight line through
 * the columns. Pointing at a column (or arrowing to it) shows `tip`; a click or Enter calls `onPick` (today: zoom in).
 */
export function ScoreColumns({
  columns,
  pass,
  title,
  tip,
  onPick,
}: {
  columns: ScoreColumn[];
  pass: number;
  title: string;
  tip: (index: number) => ReactNode;
  onPick: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const { ref: wrap, width: W } = useWidth();
  const svg = useRef<SVGSVGElement>(null);
  const H = 300;
  const L = 46;
  const Rg = 84;
  const T = 14;
  const B = 46;
  const plot = W - L - Rg;
  const ph = H - T - B;
  const n = columns.length;
  const bw = plot / Math.max(1, n);
  const w = Math.min(64, Math.max(6, bw * 0.62));
  const y = (v: number) => T + ph * (1 - v / 100);
  const mid = (i: number) => L + i * bw + bw / 2;
  const points = columns
    .map((c, i): [number, number] | null => (c.average === null ? null : [mid(i), c.average]))
    .filter((p): p is [number, number] => p !== null);
  const fit = fitLine(points);
  const first = points[0];
  const last = points.at(-1);
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plot / 56))));
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = Math.floor((x - L) / bw);
    return i >= 0 && i < n ? i : null;
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setIndex((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === 'Escape') setIndex(null);
    else if ((e.key === 'Enter' || e.key === ' ') && index !== null) onPick(index);
    else return;
    e.preventDefault();
  };
  const bar = (x: number, top: number, bottom: number, width: number) => {
    const h = bottom - top;
    const r = Math.min(4, h, width / 2);
    return `M${x},${bottom} v${-(h - r)} q0,${-r} ${r},${-r} h${width - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
  };
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
            {columns.map((c) => (
              <tr key={c.key} className="border-t border-bd">
                <td className="py-1 pr-3">{c.long}</td>
                <td className={td}>{c.average === null ? '-' : pct(c.average)}</td>
                <td className={td}>{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={title}
            tabIndex={0}
            className={`block font-sans focus:outline-2 focus:outline-brand rounded-s ${index !== null && columns[index]?.count ? 'cursor-pointer' : ''}`}
            onPointerMove={(e) => setIndex(pick(e))}
            onPointerLeave={() => setIndex(null)}
            onClick={(e) => {
              const i = pick(e as unknown as PointerEvent<SVGSVGElement>);
              if (i !== null) onPick(i);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setIndex((i) => i ?? n - 1)}
            onBlur={() => setIndex(null)}
          >
            {[0, 20, 40, 60, 80, 100].map((v) => (
              <g key={v}>
                <line x1={L} x2={W - Rg} y1={y(v)} y2={y(v)} stroke="var(--bd)" />
                <text x={L - 8} y={y(v) + 4} fontSize={12} textAnchor="end" fill="var(--mu)">
                  {v}%
                </text>
              </g>
            ))}
            {index !== null && <rect x={L + index * bw} y={T} width={bw} height={ph} fill="var(--mu)" opacity={0.08} />}
            {columns.map((c, i) =>
              c.average === null ? null : (
                <g key={c.key}>
                  <path
                    d={bar(mid(i) - w / 2, y(c.average), y(0), w)}
                    fill={c.average >= pass ? 'var(--ok)' : 'var(--wn)'}
                    fillOpacity={index === i ? 0.55 : 0.35}
                  />
                  <circle cx={mid(i)} cy={y(c.average)} r={4} fill="var(--tx)" stroke="var(--pn)" strokeWidth={2} />
                </g>
              ),
            )}
            <line
              x1={L}
              x2={W - Rg + 6}
              y1={y(pass)}
              y2={y(pass)}
              stroke="var(--ok)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <text x={W - Rg + 10} y={y(pass) + 4} fontSize={12} fill="var(--ok)">
              {t('agents.passLine', { pass })}
            </text>
            {fit && first && last && (
              <line
                x1={first[0]}
                y1={y(clamp(fit.slope * first[0] + fit.intercept))}
                x2={last[0]}
                y2={y(clamp(fit.slope * last[0] + fit.intercept))}
                stroke="var(--mu)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )}
            {columns.map((c, i) =>
              i % every ? null : (
                <g key={c.key}>
                  <text x={mid(i)} y={H - 24} fontSize={12} textAnchor="middle" fill="var(--mu)">
                    {c.label}
                  </text>
                  <text x={mid(i)} y={H - 9} fontSize={11} textAnchor="middle" fill="var(--mu)">
                    ({c.count})
                  </text>
                </g>
              ),
            )}
          </svg>
          {index !== null && <Tooltip left={(mid(index) / W) * 100}>{tip(index)}</Tooltip>}
          <ul className="mt-1 flex flex-wrap gap-4 text-sm text-mu">
            <li className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm bg-ok" aria-hidden="true" />
              {t('agents.legendPass', { pass })}
            </li>
            <li className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm bg-wn" aria-hidden="true" />
              {t('agents.legendBelow', { pass })}
            </li>
            <li className="flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-4 rounded-full bg-mu" aria-hidden="true" />
              {t('agents.legendTrend')}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
