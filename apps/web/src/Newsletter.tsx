// Learning › Newsletter (Phase 6, piece 3; today's monthly newsletter): a short update for a month, with an introduction and
// items that can link to the Knowledge Base articles that were added or changed. Staff write it (a draft is theirs until it
// is published, which tells everybody once); everyone reads it and marks it as read.
import { can, type Language } from '@qsmart/shared';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Empty } from './bits';
import { currentLanguage } from './i18n';
import { card, type CompanyRef, dangerButton, field, Notice, primaryButton, smallButton, useAction } from './ui';

interface Item {
  title: string;
  text: string;
  articleId: string | null;
}
interface Issue {
  id: string;
  month: string;
  title: string;
  intro: string;
  published: boolean;
  items: Item[];
}
interface Listed {
  staff: boolean;
  newsletters: Issue[];
  reads: string[];
}
interface ArticleRef {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
interface Draft {
  id?: string;
  month: string;
  title: string;
  intro: string;
  items: Item[];
}

const LOCALES: Record<Language, string> = { en: 'en-GB', bg: 'bg-BG', fr: 'fr-FR' };
const monthName = (month: string, lang: Language) =>
  new Intl.DateTimeFormat(LOCALES[lang], { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
const thisMonth = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);

export function Newsletter({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const staff = can(company.role, 'learning.write');
  const { message, run, fail } = useAction();
  const [data, setData] = useState<Listed | null>(null);
  const [articles, setArticles] = useState<ArticleRef[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(() => {
    api<Listed>('/newsletters', company.id).then(setData, fail);
    api<{ articles: ArticleRef[] }>('/kb', company.id).then((k) => setArticles(k.articles), fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const titleOf = (id: string | null) => articles.find((a) => a.id === id)?.title ?? '';
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.news')}</h1>
        <p className="text-sm text-mu">{t('newsletter.intro')}</p>
      </div>
      {staff && !draft && !open && (
        <button
          type="button"
          className={primaryButton}
          onClick={() =>
            setDraft({
              month: thisMonth(),
              title: `${t('newsletter.monthly')} ${monthName(thisMonth(), lang)}`,
              intro: '',
              items: [],
            })
          }
        >
          + {t('newsletter.new')}
        </button>
      )}
    </div>
  );
  if (!data)
    return (
      <section className="grid gap-4">
        {header}
        <p className="text-mu">{t('common.loading')}</p>
        <Notice message={message} />
      </section>
    );

  async function save(d: Draft, published: boolean) {
    const ok = await run(
      () =>
        api(d.id ? `/newsletters/${d.id}` : '/newsletters', company.id, {
          method: d.id ? 'PUT' : 'POST',
          body: { month: d.month, title: d.title, intro: d.intro, published, items: d.items },
        }),
      t(published ? 'newsletter.published' : 'newsletter.savedDraft'),
      load,
    );
    if (ok) setDraft(null);
  }
  /** The articles added or changed in the issue's month, as items (the ones already in it are not added twice). */
  function addFromMonth(d: Draft) {
    const inMonth = articles.filter((a) => a.createdAt.slice(0, 7) === d.month || a.updatedAt.slice(0, 7) === d.month);
    const fresh = inMonth.filter((a) => !d.items.some((i) => i.articleId === a.id));
    if (!inMonth.length) return void fail(new Error(t('newsletter.noneInMonth', { month: monthName(d.month, lang) })));
    setDraft({
      ...d,
      items: [
        ...d.items.filter((i) => i.title || i.text),
        ...fresh.map((a) => ({
          title: t(a.createdAt.slice(0, 7) === d.month ? 'newsletter.newArticle' : 'newsletter.updatedArticle', {
            title: a.title,
          }),
          text: '',
          articleId: a.id,
        })),
      ],
    });
  }
  async function toggleRead(issue: Issue) {
    const read = !data?.reads.includes(issue.id);
    await run(() => api(`/newsletters/${issue.id}/read`, company.id, { method: 'POST', body: { read } }), '', load);
  }

  // ------------------------------------------------------------------------------------------ writing
  if (draft) {
    const d = draft;
    const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
    const setItem = (i: number, patch: Partial<Item>) =>
      set({ items: d.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
    return (
      <section className="grid gap-4">
        {header}
        <form
          className={`${card} grid gap-4`}
          aria-labelledby="news-edit-title"
          onSubmit={(e) => {
            e.preventDefault();
            void save(d, false);
          }}
        >
          <h2 id="news-edit-title" className="text-lg font-semibold">
            {d.id ? t('newsletter.edit') : t('newsletter.new')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="grid gap-1 text-sm font-medium">
              {t('kb.articleTitle')}
              <input
                className={field}
                value={d.title}
                maxLength={150}
                required
                onChange={(e) => set({ title: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('newsletter.month')}
              <input
                type="month"
                className={field}
                value={d.month}
                required
                onChange={(e) => set({ month: e.target.value })}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            {t('newsletter.introLabel')}
            <textarea
              className={field}
              rows={3}
              maxLength={3000}
              value={d.intro}
              onChange={(e) => set({ intro: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>{t('newsletter.updates')}</b>
            <button type="button" className={smallButton} onClick={() => addFromMonth(d)}>
              ✨ {t('newsletter.addFromMonth')}
            </button>
          </div>
          {d.items.map((item, i) => (
            <fieldset key={i} className="grid gap-2 rounded-s border border-bd p-3">
              <legend className="px-1 text-sm font-semibold">{t('newsletter.update', { n: i + 1 })}</legend>
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label={t('newsletter.headline')}
                  placeholder={t('newsletter.headline')}
                  className={`${field} min-w-[12rem] flex-1`}
                  maxLength={150}
                  value={item.title}
                  onChange={(e) => setItem(i, { title: e.target.value })}
                />
                <select
                  aria-label={t('newsletter.linkArticle')}
                  className={`${field} max-w-[16rem]`}
                  value={item.articleId ?? ''}
                  onChange={(e) => setItem(i, { articleId: e.target.value || null })}
                >
                  <option value="">{t('newsletter.noLink')}</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={dangerButton}
                  onClick={() => set({ items: d.items.filter((_, k) => k !== i) })}
                >
                  {t('kb.removeQuestion')}
                </button>
              </div>
              <textarea
                aria-label={t('newsletter.sentence')}
                placeholder={t('newsletter.sentence')}
                className={field}
                rows={2}
                maxLength={2000}
                value={item.text}
                onChange={(e) => setItem(i, { text: e.target.value })}
              />
            </fieldset>
          ))}
          <div>
            <button
              type="button"
              className={smallButton}
              onClick={() => set({ items: [...d.items, { title: '', text: '', articleId: null }] })}
            >
              + {t('newsletter.addUpdate')}
            </button>
          </div>
          <Notice message={message} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={smallButton}>
              {t('quizzes.saveDraft')}
            </button>
            <button type="button" className={primaryButton} onClick={() => void save(d, true)}>
              {t('newsletter.publish')}
            </button>
            <button type="button" className={smallButton} onClick={() => setDraft(null)}>
              {t('kb.cancel')}
            </button>
          </div>
        </form>
      </section>
    );
  }

  // ------------------------------------------------------------------------------------------ reading one issue
  const current = data.newsletters.find((n) => n.id === open);
  if (current) {
    const read = data.reads.includes(current.id);
    return (
      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="font-display text-3xl font-bold">{current.title}</h1>
            <p className="text-sm text-mu">{monthName(current.month, lang)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} onClick={() => setOpen(null)}>
              ← {t('newsletter.all')}
            </button>
            <button
              type="button"
              className={read ? smallButton : primaryButton}
              aria-pressed={read}
              onClick={() => void toggleRead(current)}
            >
              ✓ {read ? t('newsletter.readUndo') : t('kb.markRead')}
            </button>
            {staff && (
              <>
                <button
                  type="button"
                  className={smallButton}
                  onClick={() =>
                    setDraft({
                      id: current.id,
                      month: current.month,
                      title: current.title,
                      intro: current.intro,
                      items: current.items,
                    })
                  }
                >
                  {t('kb.edit')}
                </button>
                <button
                  type="button"
                  className={dangerButton}
                  onClick={() => {
                    if (!window.confirm(t('newsletter.confirmDelete', { name: current.title }))) return;
                    void run(
                      () => api(`/newsletters/${current.id}`, company.id, { method: 'DELETE' }),
                      t('kb.deleted'),
                      () => {
                        setOpen(null);
                        load();
                      },
                    );
                  }}
                >
                  {t('kb.delete')}
                </button>
              </>
            )}
          </div>
        </div>
        <Notice message={message} />
        <article className={`${card} grid gap-4`}>
          {!current.published && (
            <p className="w-fit rounded-full bg-wn/15 px-2 text-xs text-wn">{t('newsletter.draftNote')}</p>
          )}
          {current.intro && <p className="whitespace-pre-wrap">{current.intro}</p>}
          {current.items.map((i, k) => (
            <div key={k} className="grid gap-1 rounded-s border border-bd p-3">
              <b>{i.title}</b>
              {i.text && <p className="whitespace-pre-wrap text-sm">{i.text}</p>}
              {i.articleId && (
                <Link
                  to="/$app/$page"
                  params={{ app: 'learning', page: 'knowledge-base' }}
                  search={{ article: i.articleId }}
                  className="w-fit text-sm text-brand underline"
                >
                  {t('newsletter.readArticle', { title: titleOf(i.articleId) || t('newsletter.theArticle') })} →
                </Link>
              )}
            </div>
          ))}
        </article>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      {header}
      <Notice message={message} />
      {data.newsletters.length === 0 ? (
        <Empty>{t('newsletter.none')}</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.newsletters.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setOpen(n.id)}
                className={`${card} grid w-full gap-1.5 text-left hover:border-tx`}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <b>{n.title}</b>
                  {data.reads.includes(n.id) && <span className="text-xs text-ok">✓ {t('kb.readTag')}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 ${n.published ? 'bg-ok/15 text-ok' : 'bg-wn/15 text-wn'}`}>
                    {t(n.published ? 'quizzes.status.published' : 'quizzes.status.draft')}
                  </span>
                  <span className="text-mu">{monthName(n.month, lang)}</span>
                </span>
                {n.intro && <small className="text-mu">{n.intro.slice(0, 120)}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
