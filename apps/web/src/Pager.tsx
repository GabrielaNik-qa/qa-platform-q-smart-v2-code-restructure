// Today's table footer: items per page (10/20/50/100), "Showing 1 to 20 of 45 results", and the page buttons.
import { useTranslation } from 'react-i18next';
import { field, smallButton } from './ui';

/** Which rows of the list the current page shows. */
export function pageOf<T>(rows: T[], page: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages);
  return { pages, current, slice: rows.slice((current - 1) * perPage, current * perPage) };
}

export function Pager({
  count,
  page,
  perPage,
  onPage,
  onPerPage,
}: {
  count: number;
  page: number;
  perPage: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(count / perPage));
  const current = Math.min(page, pages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bd pt-3 text-sm">
      <label className="inline-flex items-center gap-2">
        {t('list.perPage')}
        <select
          className={field}
          value={perPage}
          onChange={(e) => {
            onPerPage(Number(e.target.value));
            onPage(1);
          }}
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <small>
        {count
          ? t('list.showing', {
              from: (current - 1) * perPage + 1,
              to: Math.min(current * perPage, count),
              count,
            })
          : t('list.noResults')}
      </small>
      <div className="flex gap-1">
        <button type="button" className={smallButton} disabled={current < 2} onClick={() => onPage(current - 1)}>
          ← {t('list.previous')}
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 1)
          .map((n, i, all) => (
            <span key={n} className="inline-flex gap-1">
              {i > 0 && n - (all[i - 1] ?? n) > 1 && <span className="text-mu">…</span>}
              <button
                type="button"
                aria-current={n === current ? 'page' : undefined}
                className={`${smallButton} ${n === current ? 'border-brand' : ''}`}
                onClick={() => onPage(n)}
              >
                {n}
              </button>
            </span>
          ))}
        <button type="button" className={smallButton} disabled={current >= pages} onClick={() => onPage(current + 1)}>
          {t('list.next')} →
        </button>
      </div>
    </div>
  );
}
