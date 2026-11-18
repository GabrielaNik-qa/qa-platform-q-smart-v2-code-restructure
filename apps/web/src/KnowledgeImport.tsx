// Knowledge Base › Import (Phase 6, piece 3; today's import): paste a text or choose files (.txt, .md, .html, .docx); the text
// is split into draft articles at its headings, or organised by the AI (focused articles, topics, a suggested folder). The
// drafts are checked and edited here, then saved as articles; the folders they name are created when they are missing.
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiUpload } from './api';
import { card, type CompanyRef, field, Notice, primaryButton, smallButton, useAction } from './ui';

interface Draft {
  on: boolean;
  title: string;
  folder: string;
  topics: string;
  body: string;
}
interface Drafted {
  ai: boolean;
  articles: { title: string; folder: string; topics: string[]; body: string }[];
}

export function KnowledgeImport({
  company,
  folders,
  currentFolderId,
  onDone,
  onCancel,
}: {
  company: CompanyRef;
  /** every folder with its path, for the suggestions and the destination */
  folders: { id: string; path: string }[];
  currentFolderId: string;
  onDone: (created: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { message, fail, run } = useAction();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [destination, setDestination] = useState(currentFolderId);
  const [info, setInfo] = useState('');

  async function analyse(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() && !files.length) return void fail(new Error(t('kbio.nothing')));
    setBusy(true);
    setInfo('');
    const out: Draft[] = [];
    let usedAi = false;
    try {
      if (text.trim()) {
        const r = await api<Drafted>('/kb/import', company.id, {
          method: 'POST',
          body: { text, filename: t('kbio.pasted'), useAi },
        });
        usedAi ||= r.ai;
        out.push(...r.articles.map(toDraft));
      }
      for (const file of files) {
        const r = await apiUpload<Drafted>(
          `/kb/import/file?filename=${encodeURIComponent(file.name)}&useAi=${useAi}`,
          company.id,
          new Blob([file], { type: 'application/octet-stream' }),
        );
        usedAi ||= r.ai;
        out.push(...r.articles.map(toDraft));
      }
      setDrafts(out);
      setInfo(t(usedAi ? 'kbio.readyAi' : 'kbio.ready', { count: out.length }));
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  }
  const toDraft = (a: Drafted['articles'][number]): Draft => ({
    on: true,
    title: a.title,
    folder: a.folder,
    topics: a.topics.join(', '),
    body: a.body,
  });
  const set = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const chosen = drafts.filter((d) => d.on);

  async function save() {
    if (saving || !chosen.length) return;
    setSaving(true);
    const ok = await run(
      () =>
        api<{ created: number }>('/kb/import/save', company.id, {
          method: 'POST',
          body: {
            folderId: destination || null,
            articles: chosen.map((d) => ({
              title: d.title,
              folder: d.folder,
              topics: d.topics
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
              body: d.body,
            })),
          },
        }).then((r) => onDone(r.created)),
      '',
    );
    if (!ok) setSaving(false);
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={(e) => void analyse(e)} className={`${card} grid gap-3`} aria-labelledby="kbio-title">
        <h2 id="kbio-title" className="text-lg font-semibold">
          {t('kbio.title')}
        </h2>
        <p className="text-sm text-mu">{t('kbio.help')}</p>
        <label className="grid gap-1 text-sm font-medium">
          {t('kbio.paste')}
          <textarea
            className={field}
            rows={6}
            maxLength={200000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('kbio.files')}
          <input
            type="file"
            multiple
            accept=".txt,.md,.markdown,.html,.htm,.docx"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--brand)]"
            checked={useAi}
            onChange={(e) => setUseAi(e.target.checked)}
          />
          <span>
            <b>{t('kbio.useAi')}</b> <small className="text-mu">{t('kbio.useAiHelp')}</small>
          </span>
        </label>
        <label className="grid max-w-md gap-1 text-sm font-medium">
          {t('kbio.saveIn')}
          <select className={field} value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">{t('kb.topLevelOption')}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.path}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? t('kbio.analysing') : `✨ ${t('kbio.analyse')}`}
          </button>
          <button type="button" className={smallButton} onClick={onCancel}>
            {t('kb.cancel')}
          </button>
        </div>
        <Notice message={message} />
        {info && (
          <p role="status" className="text-sm text-ok">
            {info}
          </p>
        )}
      </form>
      {drafts.length > 0 && (
        <section className={`${card} grid gap-3`} aria-labelledby="kbio-drafts">
          <h2 id="kbio-drafts" className="font-semibold">
            {t('kbio.drafts', { chosen: chosen.length, total: drafts.length })}
          </h2>
          <p className="text-sm text-mu">{t('kbio.draftsHelp')}</p>
          <datalist id="kbio-folders">
            {folders.map((f) => (
              <option key={f.id} value={f.path} />
            ))}
          </datalist>
          {drafts.map((d, i) => (
            <div key={i} className="grid gap-2 rounded-s border border-bd p-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  aria-label={t('kbio.include')}
                  checked={d.on}
                  onChange={(e) => set(i, { on: e.target.checked })}
                />
                <input
                  aria-label={t('kb.articleTitle')}
                  className={`${field} flex-1 font-semibold`}
                  maxLength={150}
                  value={d.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  {t('kbio.folderPath')}
                  <input
                    className={field}
                    list="kbio-folders"
                    value={d.folder}
                    onChange={(e) => set(i, { folder: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {t('kb.topics')}
                  <input className={field} value={d.topics} onChange={(e) => set(i, { topics: e.target.value })} />
                </label>
              </div>
              <details>
                <summary className="cursor-pointer text-sm">{t('kbio.editText', { count: d.body.length })}</summary>
                <textarea
                  aria-label={t('kb.body')}
                  className={`${field} mt-2 w-full font-mono text-sm`}
                  rows={8}
                  value={d.body}
                  onChange={(e) => set(i, { body: e.target.value })}
                />
              </details>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={saving || !chosen.length}
              onClick={() => void save()}
            >
              {t('kbio.save', { count: chosen.length })}
            </button>
            <button type="button" className={smallButton} onClick={() => setDrafts([])}>
              {t('kbio.discard')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
