// Quality › Reports › Export centre (today's reports.js `PG.rexp`): every Excel file made in the app (reviews, quick
// flags, reports), to download again any time. The file is made again with today's data and only what the person may
// still see (a copy of the rows is never kept); an export of over 5000 rows is listed but not kept. Your own files
// (admins: everyone's).
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiFile } from './api';
import { Empty, Table } from './bits';
import { card, type CompanyRef, Notice, smallButton, useAction } from './ui';

interface Exported {
  id: string;
  kind: 'reviews' | 'flags' | 'report';
  name: string;
  rows: number;
  byName: string;
  createdAt: string;
  again: boolean;
}

export function ExportCentre({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { message, run, fail } = useAction();
  const [list, setList] = useState<Exported[] | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api<Exported[]>('/exports', company.id).then(setList, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  async function download(x: Exported) {
    setBusy(x.id);
    await run(async () => {
      const file = await apiFile(`/exports/${x.id}/download`, company.id, {});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = `${x.name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${new Date().toLocaleDateString('sv-SE')}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, t('exports.downloaded'));
    setBusy('');
  }

  return (
    <section className="grid gap-4" aria-labelledby="exports-title">
      <div className="grid gap-1">
        <h1 id="exports-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('menu.pages.rexp')}
        </h1>
        <p className="text-sm text-mu">{t('exports.intro')}</p>
      </div>
      <Notice message={message} />
      <div className={`${card} grid gap-2`}>
        <h2 className="flex items-center gap-2 font-semibold">
          {t('exports.title')}
          <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">{list?.length ?? 0}</span>
        </h2>
        {!list ? (
          <p className="text-mu">{t('common.loading')}</p>
        ) : !list.length ? (
          <Empty>{t('exports.none')}</Empty>
        ) : (
          <Table
            head={[t('exports.file'), t('exports.kind'), t('exports.rows'), t('exports.by'), t('exports.when'), '']}
            rows={list.map((x) => [
              <b key="n">{x.name}</b>,
              t(`exports.kinds.${x.kind}`),
              x.rows,
              x.byName,
              new Date(x.createdAt).toLocaleString(),
              <span key="a" className="flex flex-wrap items-center gap-1.5">
                {x.again ? (
                  <button
                    type="button"
                    className={smallButton}
                    disabled={busy === x.id}
                    onClick={() => void download(x)}
                  >
                    {busy === x.id ? t('list.exporting') : t('exports.download')}
                  </button>
                ) : (
                  <small className="text-mu">{t('exports.tooBig')}</small>
                )}
                <button
                  type="button"
                  className={`${smallButton} text-bad`}
                  onClick={() =>
                    void run(
                      () => api(`/exports/${x.id}`, company.id, { method: 'DELETE' }),
                      t('exports.removed'),
                      load,
                    )
                  }
                >
                  {t('exports.remove')}
                </button>
              </span>,
            ])}
          />
        )}
      </div>
      <p className="text-sm text-mu">{t('exports.note')}</p>
    </section>
  );
}
