// Help inside the app and the Script builder (Phase 6, piece 4; today's Help Center pages): the FAQ, the glossary, the video
// tutorials, the guided tours and the call scripts. Staff write them, everybody reads them. A company can start from
// Q-smart's own glossary and tours, in the person's language, and then change them.
import { can, type HelpKind, isSecureLink, ROLE_LABELS, type Role, TOUR_ROLES } from '@qsmart/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { Empty } from './bits';
import { currentLanguage } from './i18n';
import { isBuilt, menuOf } from './menu';
import { useSession } from './session';
import { startTour } from './tour';
import { card, type CompanyRef, dangerButton, field, Notice, primaryButton, smallButton, useAction } from './ui';

interface Step {
  title: string;
  text: string;
  page: string;
}
interface Item {
  id: string;
  kind: HelpKind;
  title: string;
  body: string;
  topic: string;
  link: string;
  minutes: number | null;
  role: string;
  page: string;
  steps: Step[];
}
interface Draft {
  id?: string;
  title: string;
  body: string;
  topic: string;
  link: string;
  minutes: string;
  role: string;
  page: string;
  steps: Step[];
}

/** The page of the menu each kind lives on (its name and the texts around it). */
const MENU_KEY: Record<HelpKind, string> = {
  faq: 'cs_faq',
  glossary: 'cs_gloss',
  video: 'cs_videos',
  tour: 'cs_tours',
  script: 'cs_script',
};
const blank = (kind: HelpKind): Draft => ({
  title: '',
  body: '',
  topic: '',
  link: '',
  minutes: '',
  role: 'all',
  page: '',
  steps: kind === 'tour' || kind === 'script' ? [{ title: '', text: '', page: '' }] : [],
});

export function HelpPage({ kind, company }: { kind: HelpKind; company: CompanyRef }) {
  const { t } = useTranslation();
  const staff = can(company.role, 'learning.write');
  const { company: session } = useSession();
  const navigate = useNavigate();
  const { message, run, fail } = useAction();
  const [items, setItems] = useState<Item[] | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(() => {
    api<{ items: Item[] }>('/help', company.id).then((r) => setItems(r.items.filter((x) => x.kind === kind)), fail);
  }, [company.id, kind, fail]);
  useEffect(load, [load]);

  /** Every page the person's menu has and v2 has built: what a tour step or an answer can point to. */
  const pages = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const app of session ? menuOf(session) : [])
      for (const g of app.groups)
        for (const p of g.pages)
          if (isBuilt(app.id, p))
            out.push({
              value: `${app.id}/${p.id}`,
              label: `${t(`menu.groups.${g.id}`)} › ${t(`menu.pages.${p.key}`)}`,
            });
    return out;
  }, [session, t]);
  const roleLabel = (r: string) => (r === 'all' ? t('help.roleAll') : ROLE_LABELS[currentLanguage()][r as Role]);
  const pageName = (value: string) => pages.find((p) => p.value === value)?.label ?? '';

  const hit = (x: Item) =>
    !search.trim() ||
    [x.title, x.body, x.topic, ...x.steps.map((s) => `${s.title} ${s.text}`)]
      .join(' ')
      .toLowerCase()
      .includes(search.trim().toLowerCase());

  async function save(event: FormEvent, d: Draft) {
    event.preventDefault();
    const body = {
      kind,
      title: d.title,
      body: d.body,
      topic: d.topic,
      link: d.link,
      minutes: d.minutes ? Number(d.minutes) : null,
      role: d.role,
      page: d.page,
      steps: d.steps,
    };
    const ok = await run(
      () => api(d.id ? `/help/${d.id}` : '/help', company.id, { method: d.id ? 'PUT' : 'POST', body }),
      t('help.saved'),
      load,
    );
    if (ok) setDraft(null);
  }
  async function remove(x: Item) {
    if (!window.confirm(t('help.confirmDelete', { name: x.title }))) return;
    await run(() => api(`/help/${x.id}`, company.id, { method: 'DELETE' }), t('help.deleted'), load);
  }
  async function starter() {
    if (kind !== 'glossary' && kind !== 'tour') return;
    await run(
      () => api('/help/starter', company.id, { method: 'POST', body: { kind, language: currentLanguage() } }),
      t('help.starterAdded'),
      load,
    );
  }
  function begin(x: Item) {
    const first = startTour(x.title, x.steps);
    const [app, page] = (first?.page ?? '').split('/');
    if (app && page) void navigate({ to: '/$app/$page', params: { app, page } });
  }

  const edit = (x: Item): Draft => ({
    id: x.id,
    title: x.title,
    body: x.body,
    topic: x.topic,
    link: x.link,
    minutes: x.minutes ? String(x.minutes) : '',
    role: x.role,
    page: x.page,
    steps: x.steps.length ? x.steps : blank(kind).steps,
  });
  const tools = (x: Item) =>
    staff && (
      <span className="flex gap-1.5">
        <button type="button" className={smallButton} onClick={() => setDraft(edit(x))}>
          {t('help.change')}
        </button>
        <button type="button" className={dangerButton} onClick={() => void remove(x)}>
          {t('help.delete')}
        </button>
      </span>
    );

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t(`menu.pages.${MENU_KEY[kind]}`)}
        </h1>
        <p className="text-sm text-mu">{t(`help.intro.${kind}`)}</p>
      </div>
      {staff && !draft && (
        <div className="flex gap-2">
          {items && !items.length && (kind === 'glossary' || kind === 'tour') && (
            <button type="button" className={smallButton} onClick={() => void starter()}>
              {t('help.starter')}
            </button>
          )}
          <button type="button" className={primaryButton} onClick={() => setDraft(blank(kind))}>
            + {t('help.add')}
          </button>
        </div>
      )}
    </div>
  );

  // -------------------------------------------------------------------------------------------- writing
  if (draft) {
    const d = draft;
    const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
    const setStep = (i: number, patch: Partial<Step>) =>
      set({ steps: d.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
    const move = (i: number, by: number) => {
      const steps = [...d.steps];
      const [one] = steps.splice(i, 1);
      if (one) steps.splice(i + by, 0, one);
      set({ steps });
    };
    const insecure = kind === 'video' && d.link.trim() !== '' && !isSecureLink(d.link.trim());
    return (
      <section className="grid gap-4">
        {header}
        <form className={`${card} grid gap-3`} aria-labelledby="help-edit" onSubmit={(e) => void save(e, d)}>
          <h2 id="help-edit" className="text-lg font-semibold">
            {t(d.id ? 'help.change' : 'help.add')}
          </h2>
          <label className="grid gap-1 text-sm font-medium">
            {t(`help.f.title.${kind}`)}
            <input
              className={field}
              value={d.title}
              maxLength={200}
              required
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          {kind === 'video' && (
            <label className="grid gap-1 text-sm font-medium">
              {t('help.f.link')}
              <input
                className={field}
                type="url"
                value={d.link}
                maxLength={500}
                required
                placeholder="https://"
                onChange={(e) => set({ link: e.target.value })}
              />
              {insecure && <small className="text-bad">{t('help.f.linkSecure')}</small>}
            </label>
          )}
          {kind !== 'tour' && (
            <label className="grid gap-1 text-sm font-medium">
              {t(`help.f.body.${kind}`)}
              <textarea
                className={field}
                rows={kind === 'faq' ? 6 : 3}
                value={d.body}
                maxLength={8000}
                required={kind === 'faq' || kind === 'glossary'}
                onChange={(e) => set({ body: e.target.value })}
              />
            </label>
          )}
          {(kind === 'faq' || kind === 'video') && (
            <label className="grid gap-1 text-sm font-medium">
              {t('help.f.topic')}
              <input
                className={field}
                value={d.topic}
                maxLength={60}
                placeholder={t('help.f.topicHint')}
                onChange={(e) => set({ topic: e.target.value })}
              />
            </label>
          )}
          {kind === 'video' && (
            <label className="grid max-w-48 gap-1 text-sm font-medium">
              {t('help.f.minutes')}
              <input
                className={field}
                type="number"
                min={1}
                max={600}
                value={d.minutes}
                onChange={(e) => set({ minutes: e.target.value })}
              />
            </label>
          )}
          {kind === 'faq' && (
            <label className="grid gap-1 text-sm font-medium">
              {t('help.f.page')}
              <select className={field} value={d.page} onChange={(e) => set({ page: e.target.value })}>
                <option value="">-</option>
                {pages.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'tour' && (
            <label className="grid max-w-72 gap-1 text-sm font-medium">
              {t('help.f.role')}
              <select className={field} value={d.role} onChange={(e) => set({ role: e.target.value })}>
                {TOUR_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(kind === 'tour' || kind === 'script') && (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">
                {t(kind === 'tour' ? 'help.f.tourSteps' : 'help.f.scriptSteps')}
              </legend>
              {d.steps.map((s, i) => (
                <div key={i} className="grid gap-2 rounded-s border border-bd p-3">
                  <div className="flex items-center gap-2">
                    <b className="text-mu">{i + 1}.</b>
                    <input
                      aria-label={t('help.f.stepTitle')}
                      className={`${field} flex-1`}
                      value={s.title}
                      maxLength={200}
                      placeholder={t(kind === 'tour' ? 'help.f.stepTour' : 'help.f.stepScript')}
                      onChange={(e) => setStep(i, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      className={smallButton}
                      disabled={!i}
                      onClick={() => move(i, -1)}
                      aria-label={t('help.up')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={smallButton}
                      disabled={i === d.steps.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={t('help.down')}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={dangerButton}
                      aria-label={t('help.removeStep')}
                      onClick={() => set({ steps: d.steps.filter((_, k) => k !== i) })}
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    aria-label={t('help.f.stepText')}
                    className={field}
                    rows={2}
                    value={s.text}
                    maxLength={1500}
                    placeholder={t('help.f.stepText')}
                    onChange={(e) => setStep(i, { text: e.target.value })}
                  />
                  {kind === 'tour' && (
                    <select
                      aria-label={t('help.f.page')}
                      className={field}
                      value={s.page}
                      onChange={(e) => setStep(i, { page: e.target.value })}
                    >
                      <option value="">{t('help.f.choosePage')}</option>
                      {pages.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className={smallButton}
                  disabled={d.steps.length >= 40}
                  onClick={() => set({ steps: [...d.steps, { title: '', text: '', page: '' }] })}
                >
                  + {t('help.addStep')}
                </button>
              </div>
            </fieldset>
          )}
          <div className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={insecure}>
              {t('help.save')}
            </button>
            <button type="button" className={smallButton} onClick={() => setDraft(null)}>
              {t('help.cancel')}
            </button>
          </div>
          <Notice message={message} />
        </form>
      </section>
    );
  }

  // -------------------------------------------------------------------------------------------- reading
  const shown = (items ?? []).filter(hit);
  const topics = [...new Set(shown.map((x) => x.topic))].sort();
  const body = !items ? (
    <p className="text-mu">{t('common.loading')}</p>
  ) : !shown.length ? (
    <Empty>{t(items.length ? 'help.noMatch' : 'help.none')}</Empty>
  ) : kind === 'faq' ? (
    topics.map((topic) => (
      <div key={topic} className="grid gap-2">
        {topic && <h3 className="mt-2 font-semibold">{topic}</h3>}
        {shown
          .filter((x) => x.topic === topic)
          .map((x) => (
            <details key={x.id} className="rounded-s border border-bd p-3">
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <b>{x.title}</b>
                {tools(x)}
              </summary>
              <p className="mt-2 whitespace-pre-wrap">{x.body}</p>
              {x.page && pageName(x.page) && (
                <p className="mt-2 text-sm">
                  <Link
                    to="/$app/$page"
                    params={{ app: x.page.split('/')[0] ?? '', page: x.page.split('/')[1] ?? '' }}
                    className="font-semibold text-ac hover:underline"
                  >
                    {pageName(x.page)} ›
                  </Link>
                </p>
              )}
            </details>
          ))}
      </div>
    ))
  ) : kind === 'glossary' ? (
    <dl className="grid gap-3">
      {[...shown]
        .sort((a, b) => a.title.localeCompare(b.title, currentLanguage()))
        .map((x) => (
          <div key={x.id}>
            <dt className="flex items-center justify-between gap-3 font-semibold">
              {x.title}
              {tools(x)}
            </dt>
            <dd className="m-0 whitespace-pre-wrap text-mu">{x.body}</dd>
          </div>
        ))}
    </dl>
  ) : kind === 'video' ? (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((x) => (
        <div key={x.id} className={`${card} grid content-start gap-2`}>
          <b>{x.title}</b>
          {x.body && <small className="text-mu">{x.body}</small>}
          <div className="flex items-center justify-between gap-2">
            <small className="text-mu">
              {[x.topic, x.minutes ? t('help.minutes', { n: x.minutes }) : ''].filter(Boolean).join(' · ')}
            </small>
            {isSecureLink(x.link) && (
              <a
                className={primaryButton}
                href={x.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {t('help.watch')} ↗
              </a>
            )}
          </div>
          {tools(x)}
        </div>
      ))}
    </div>
  ) : kind === 'tour' ? (
    shown.map((x) => (
      <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-s border border-bd p-3">
        <span>
          <b>{x.title}</b>{' '}
          <small className="text-mu">
            {roleLabel(x.role)} · {t('help.steps', { n: x.steps.length })}
          </small>
        </span>
        <span className="flex gap-2">
          {tools(x)}
          <button type="button" className={primaryButton} onClick={() => begin(x)}>
            {t('help.startTour')}
          </button>
        </span>
      </div>
    ))
  ) : (
    shown.map((x) => (
      <details key={x.id} className="rounded-s border border-bd p-3">
        <summary className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <b>{x.title}</b> {x.body && <small className="text-mu">· {x.body}</small>}
          </span>
          {tools(x)}
        </summary>
        <ol className="mt-2 grid gap-2 pl-5">
          {x.steps.map((s, i) => (
            <li key={i}>
              <b>{s.title}</b>
              {s.text && <p className="m-0 whitespace-pre-wrap text-sm text-mu">{s.text}</p>}
            </li>
          ))}
        </ol>
      </details>
    ))
  );

  return (
    <section className="grid gap-4">
      {header}
      <div className={`${card} grid gap-3`}>
        <input
          type="search"
          className={`${field} max-w-xs`}
          aria-label={t('help.search')}
          placeholder={t('help.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {body}
        <Notice message={message} />
      </div>
    </section>
  );
}
