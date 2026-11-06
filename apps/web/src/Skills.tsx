// The company's lists of skills and languages (Admin › Skills & languages): people and teams pick from them.
// Admins add, rename and delete; a new name shows everywhere, and deleting one takes it away from everybody.
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import {
  card,
  type CompanyRef,
  dangerButton,
  field,
  Notice,
  primaryButton,
  type SkillRow,
  smallButton,
  useAction,
} from './ui';

export function Skills({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState<Record<SkillRow['kind'], string>>({ skill: '', language: '' });
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    api<SkillRow[]>('/skills', company.id).then(setSkills, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  async function add(event: FormEvent, kind: SkillRow['kind']) {
    event.preventDefault();
    const name = adding[kind].trim();
    const ok = await run(() => api('/skills', company.id, { body: { kind, name } }), t('skills.added', { name }), load);
    if (ok) setAdding({ ...adding, [kind]: '' });
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    const name = renaming.name.trim();
    const ok = await run(
      () => api(`/skills/${renaming.id}`, company.id, { method: 'PATCH', body: { name } }),
      t('skills.renamed', { name }),
      load,
    );
    if (ok) setRenaming(null);
  }

  const column = (kind: SkillRow['kind']) => {
    const list = skills?.filter((s) => s.kind === kind) ?? [];
    const title = kind === 'skill' ? t('skills.skills') : t('skills.languages');
    return (
      <section className={`${card} grid gap-3 content-start`} aria-labelledby={`${kind}-title`}>
        <h3 id={`${kind}-title`} className="font-display text-lg font-bold">
          {title}
        </h3>
        {skills && list.length === 0 && <p className="text-sm text-mu">{t('common.none')}</p>}
        <ul className="grid">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-bd py-2">
              {renaming?.id === s.id ? (
                <form onSubmit={rename} className="flex flex-wrap items-center gap-2">
                  <input
                    className={field}
                    aria-label={t('skills.renameOf', { name: s.name })}
                    required
                    maxLength={40}
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                  />
                  <button type="submit" className={smallButton}>
                    {t('common.save')}
                  </button>
                  <button type="button" className={smallButton} onClick={() => setRenaming(null)}>
                    {t('common.cancel')}
                  </button>
                </form>
              ) : (
                <>
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-mu">{t('skills.used', { people: s.people, teams: s.teams })}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={smallButton}
                      aria-label={t('skills.renameOf', { name: s.name })}
                      onClick={() => setRenaming({ id: s.id, name: s.name })}
                    >
                      {t('skills.rename')}
                    </button>
                    <button
                      type="button"
                      className={dangerButton}
                      onClick={() => {
                        if (window.confirm(t('skills.confirmDelete', { name: s.name })))
                          void run(
                            () => api(`/skills/${s.id}`, company.id, { method: 'DELETE' }),
                            t('skills.deleted', { name: s.name }),
                            load,
                          );
                      }}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void add(e, kind)} className="flex flex-wrap items-end gap-2 border-t border-bd pt-3">
          <label className="grid gap-1 text-sm font-medium flex-1 min-w-40">
            {kind === 'skill' ? t('skills.newSkill') : t('skills.newLanguage')}
            <input
              className={field}
              required
              maxLength={40}
              value={adding[kind]}
              onChange={(e) => setAdding({ ...adding, [kind]: e.target.value })}
            />
          </label>
          <button type="submit" className={primaryButton}>
            {t('skills.add')}
          </button>
        </form>
      </section>
    );
  };

  return (
    <section className="grid gap-4" aria-labelledby="skills-title">
      <h2 id="skills-title" className="font-display text-xl font-bold">
        {t('skills.title', { company: company.name })}
      </h2>
      <p className="text-sm text-mu">{t('skills.intro')}</p>
      <Notice message={message} />
      {!skills && <p className="text-mu">{t('common.loading')}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {column('skill')}
        {column('language')}
      </div>
    </section>
  );
}
