// Admin › Fields (admins; like Zendesk's ticket and user fields, V2_PLAN §7 "Universal"): Q-smart's universal fields
// for conversations and customers, and the company's own. Rename, reorder (drag, or the arrows), hide and show, make
// required, say whether the AI may read it, change a drop-down's options; add fields of Zendesk's kinds; a field of
// the company's own is hidden first, then deleted for good. The shared field helpers below draw the inputs elsewhere
// (Quality › Conversations).
import {
  FIELD_TYPES,
  type FieldDef,
  type FieldObject,
  type FieldOption,
  type FieldType,
  fieldLabel,
  isFixedField,
  LANGUAGES,
  type Labels,
  type Language,
} from '@qsmart/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';
import { card, type CompanyRef, dangerButton, field, Notice, primaryButton, smallButton, useAction } from './ui';

export type FieldLists = Record<FieldObject, FieldDef[]>;
const LANG_NAMES: Record<Language, string> = { en: 'English', bg: 'Български', fr: 'Français' };

/** A field's name in the person's language (the company's own, or Q-smart's). */
export function useFieldNames() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  return {
    field: (f: FieldDef) =>
      fieldLabel(f, lang, f.builtIn ? t(`cfields.builtIn.${f.object}.${f.key}`, { defaultValue: f.key }) : ''),
    option: (f: FieldDef, o: FieldOption) =>
      o.labels[lang] ||
      (f.builtIn ? t(`cfields.options.${f.key}.${o.id}`, { defaultValue: '' }) : '') ||
      Object.values(o.labels).find(Boolean) ||
      o.id,
  };
}

/** One field's input, by its kind. */
export function FieldInput({
  def,
  value,
  onChange,
  bad,
  id,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  bad: boolean;
  id: string;
}) {
  const names = useFieldNames();
  const { t } = useTranslation();
  const cls = `${field} w-full ${bad ? 'border-bad' : ''}`;
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const invalid = bad ? { 'aria-invalid': true as const } : {};
  switch (def.type) {
    case 'longText':
      return (
        <textarea
          id={id}
          className={cls}
          rows={3}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          {...invalid}
        />
      );
    case 'number':
    case 'decimal':
    case 'money':
      return (
        <input
          id={id}
          type="number"
          className={cls}
          step={def.type === 'number' ? 1 : def.type === 'money' ? 0.01 : 'any'}
          value={text}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          {...invalid}
        />
      );
    case 'date':
      return (
        <input
          id={id}
          type="date"
          className={cls}
          value={text.slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
          {...invalid}
        />
      );
    case 'checkbox':
      return (
        <input
          id={id}
          type="checkbox"
          className="accent-[var(--brand)] justify-self-start"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'dropdown':
      return (
        <select id={id} className={cls} value={text} onChange={(e) => onChange(e.target.value)} {...invalid}>
          <option value="">{t('cfields.choose')}</option>
          {def.options.map((o) => (
            <option key={o.id} value={o.id}>
              {names.option(def, o)}
            </option>
          ))}
        </select>
      );
    case 'multi': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div id={id} className={`flex flex-wrap gap-x-4 gap-y-1 ${bad ? 'rounded-s border border-bad p-1' : ''}`}>
          {def.options.map((o) => (
            <label key={o.id} className="inline-flex items-center gap-1.5 text-sm font-normal">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={chosen.includes(o.id)}
                onChange={(e) => onChange(e.target.checked ? [...chosen, o.id] : chosen.filter((x) => x !== o.id))}
              />
              {names.option(def, o)}
            </label>
          ))}
        </div>
      );
    }
    case 'link':
      return (
        <input
          id={id}
          type="url"
          className={cls}
          placeholder="https://"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          {...invalid}
        />
      );
    default:
      return <input id={id} className={cls} value={text} onChange={(e) => onChange(e.target.value)} {...invalid} />;
  }
}

/** A value as text, for lists and the conversation's page. */
export function useFieldValue() {
  const names = useFieldNames();
  const { t } = useTranslation();
  return (def: FieldDef, value: unknown): string => {
    if (value === undefined || value === null || value === '') return '';
    if (def.type === 'checkbox') return value ? t('cfields.yes') : t('cfields.no');
    if (def.type === 'dropdown') {
      const o = def.options.find((x) => x.id === value);
      return o ? names.option(def, o) : String(value);
    }
    if (def.type === 'multi' && Array.isArray(value))
      return value
        .map((v) => def.options.find((x) => x.id === v))
        .filter((o): o is FieldOption => !!o)
        .map((o) => names.option(def, o))
        .join(', ');
    if (def.type === 'money' && typeof value === 'number') return value.toFixed(2);
    return String(value);
  };
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30) || `o${Math.random().toString(36).slice(2, 7)}`;

interface Draft {
  labels: Labels;
  type: FieldType;
  options: FieldOption[];
  required: boolean;
  ai: boolean;
}
const emptyDraft = (): Draft => ({ labels: {}, type: 'text', options: [], required: false, ai: false });
const needsOptions = (type: FieldType) => type === 'dropdown' || type === 'multi';

function LabelInputs({ labels, onChange, idBase }: { labels: Labels; onChange: (l: Labels) => void; idBase: string }) {
  const { t } = useTranslation();
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="mb-1 text-sm font-medium">{t('cfields.name')}</legend>
      {LANGUAGES.map((lang) => (
        <label key={lang} className="grid gap-1 text-xs text-mu" htmlFor={`${idBase}-${lang}`}>
          {LANG_NAMES[lang]}
          <input
            id={`${idBase}-${lang}`}
            className={field}
            maxLength={80}
            value={labels[lang] ?? ''}
            onChange={(e) => onChange({ ...labels, [lang]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}

function OptionsEditor({
  options,
  onChange,
  def,
}: {
  options: FieldOption[];
  onChange: (o: FieldOption[]) => void;
  def?: FieldDef;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const names = useFieldNames();
  const [adding, setAdding] = useState('');
  const add = () => {
    const name = adding.trim();
    if (!name) return;
    let id = slug(name);
    while (options.some((o) => o.id === id)) id = `${id}_2`;
    onChange([...options, { id, labels: { [lang]: name } }]);
    setAdding('');
  };
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{t('cfields.optionsLabel')}</legend>
      <ul className="grid gap-1">
        {options.map((o, i) => (
          <li key={o.id} className="flex items-center gap-2">
            <input
              className={`${field} flex-1`}
              aria-label={t('cfields.optionName', { n: i + 1 })}
              maxLength={80}
              value={o.labels[lang] ?? (def ? names.option(def, o) : '')}
              onChange={(e) =>
                onChange(
                  options.map((x) => (x.id === o.id ? { ...x, labels: { ...x.labels, [lang]: e.target.value } } : x)),
                )
              }
            />
            <button
              type="button"
              className={smallButton}
              aria-label={t('cfields.removeOption')}
              onClick={() => onChange(options.filter((x) => x.id !== o.id))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className={`${field} flex-1`}
          aria-label={t('cfields.newOption')}
          placeholder={t('cfields.newOption')}
          maxLength={80}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className={smallButton} onClick={add}>
          + {t('cfields.addOption')}
        </button>
      </div>
      <p className="text-xs text-mu">{t('cfields.optionsHelp')}</p>
    </fieldset>
  );
}

export function Fields({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const names = useFieldNames();
  const [object, setObject] = useState<FieldObject>('conversation');
  const [lists, setLists] = useState<FieldLists | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState<Draft>(emptyDraft());
  const [dragged, setDragged] = useState<string | null>(null);
  const { message, run, fail } = useAction();
  const load = useCallback(() => {
    api<FieldLists>('/fields', company.id).then(setLists, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);

  const list = lists?.[object] ?? [];
  const move = (keys: string[]) =>
    run(() => api(`/fields/${object}`, company.id, { method: 'PUT', body: { keys } }), t('cfields.ordered'), load);
  const shift = (key: string, by: number) => {
    const keys = list.map((f) => f.key);
    const i = keys.indexOf(key);
    const j = i + by;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j] as string, keys[i] as string];
    void move(keys);
  };
  const dropOn = (target: string) => {
    if (!dragged || dragged === target) return;
    const keys = list.map((f) => f.key).filter((k) => k !== dragged);
    keys.splice(keys.indexOf(target), 0, dragged);
    setDragged(null);
    void move(keys);
  };
  const change = (f: FieldDef, body: object, done: string) =>
    run(() => api(`/fields/${object}/${f.key}`, company.id, { method: 'PUT', body }), done, load);

  function startEdit(f: FieldDef) {
    setEditing(f.key);
    setDraft({ labels: f.labels, type: f.type, options: f.options, required: f.required, ai: f.ai });
  }
  async function saveEdit(event: FormEvent, f: FieldDef) {
    event.preventDefault();
    const ok = await change(
      f,
      {
        labels: Object.fromEntries(Object.entries(draft.labels).filter(([, v]) => v?.trim())),
        ...(needsOptions(f.type) && f.key !== 'channel' ? { options: draft.options } : {}),
        ...(isFixedField(f.object, f.key) ? {} : { required: draft.required }),
        ai: draft.ai,
      },
      t('cfields.saved'),
    );
    if (ok) setEditing(null);
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        api(`/fields/${object}`, company.id, {
          method: 'POST',
          body: {
            ...newField,
            labels: Object.fromEntries(Object.entries(newField.labels).filter(([, v]) => v?.trim())),
            options: needsOptions(newField.type) ? newField.options : [],
          },
        }),
      t('cfields.added'),
      load,
    );
    if (ok) {
      setAdding(false);
      setNewField(emptyDraft());
    }
  }
  async function remove(f: FieldDef) {
    if (!window.confirm(t('cfields.confirmDelete', { name: names.field(f) }))) return;
    await run(() => api(`/fields/${object}/${f.key}`, company.id, { method: 'DELETE' }), t('cfields.deleted'), load);
  }

  return (
    <section className="grid max-w-4xl gap-4">
      <div className="grid gap-1">
        <h1 className="lane font-display text-3xl font-bold uppercase tracking-wide">{t('menu.pages.cs_fields')}</h1>
        <p className="text-sm text-mu">{t('cfields.intro')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t('cfields.kind')} className="flex gap-1">
          {(['conversation', 'customer'] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="tab"
              aria-selected={object === o}
              className={`rounded-s border px-3 py-1.5 text-sm font-semibold ${object === o ? 'border-brand text-brand' : 'border-bd'}`}
              onClick={() => {
                setObject(o);
                setEditing(null);
                setAdding(false);
              }}
            >
              {t(`cfields.objects.${o}`)}
            </button>
          ))}
        </div>
        {!adding && (
          <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
            + {t('cfields.add')}
          </button>
        )}
      </div>
      <Notice message={message} />

      {adding && (
        <form onSubmit={add} className={`${card} grid gap-3`} aria-labelledby="new-field-title">
          <h2 id="new-field-title" className="font-semibold">
            {t('cfields.newTitle', { object: t(`cfields.objects.${object}`) })}
          </h2>
          <LabelInputs
            labels={newField.labels}
            onChange={(labels) => setNewField({ ...newField, labels })}
            idBase="new-field"
          />
          <label className="grid max-w-xs gap-1 text-sm font-medium">
            {t('cfields.type')}
            <select
              className={field}
              value={newField.type}
              onChange={(e) => setNewField({ ...newField, type: e.target.value as FieldType })}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`cfields.types.${type}`)}
                </option>
              ))}
            </select>
          </label>
          {needsOptions(newField.type) && (
            <OptionsEditor options={newField.options} onChange={(options) => setNewField({ ...newField, options })} />
          )}
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              checked={newField.required}
              onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
            />
            {t('cfields.required')}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              checked={newField.ai}
              onChange={(e) => setNewField({ ...newField, ai: e.target.checked })}
            />
            {t('cfields.ai')}
          </label>
          <p className="text-xs text-mu">{t('cfields.aiHelp')}</p>
          <div className="flex gap-2">
            <button type="submit" className={primaryButton}>
              {t('cfields.addIt')}
            </button>
            <button type="button" className={smallButton} onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {!lists ? (
        <p className="text-mu">{t('common.loading')}</p>
      ) : (
        <ul className={`${card} grid p-0`} aria-label={t(`cfields.objects.${object}`)}>
          {list.map((f, i) => (
            <li
              key={f.key}
              className={`grid gap-2 border-t border-bd px-4 py-3 first:border-t-0 ${dragged === f.key ? 'opacity-50' : ''}`}
              draggable={editing !== f.key}
              onDragStart={() => setDragged(f.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(f.key)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="cursor-grab text-mu" aria-hidden="true" title={t('cfields.drag')}>
                  ⠿
                </span>
                <span className={`font-semibold ${f.hidden ? 'text-mu line-through' : ''}`}>{names.field(f)}</span>
                <small className="text-mu">{t(`cfields.types.${f.type}`)}</small>
                {f.builtIn && (
                  <small className="rounded-full border border-bd px-2 text-xs">{t('cfields.builtInBadge')}</small>
                )}
                {f.required && (
                  <small className="rounded-full border border-bd px-2 text-xs">{t('cfields.requiredBadge')}</small>
                )}
                {f.ai && <small className="rounded-full border border-bd px-2 text-xs">{t('cfields.aiBadge')}</small>}
                {f.hidden && (
                  <small className="rounded-full border border-bad px-2 text-xs text-bad">
                    {t('cfields.hiddenBadge')}
                  </small>
                )}
                <span className="ml-auto flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={smallButton}
                    aria-label={t('cfields.up', { name: names.field(f) })}
                    disabled={i === 0}
                    onClick={() => shift(f.key, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    aria-label={t('cfields.down', { name: names.field(f) })}
                    disabled={i === list.length - 1}
                    onClick={() => shift(f.key, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => (editing === f.key ? setEditing(null) : startEdit(f))}
                  >
                    {t('common.edit')}
                  </button>
                  {!isFixedField(f.object, f.key) && (
                    <button
                      type="button"
                      className={smallButton}
                      onClick={() =>
                        void change(f, { hidden: !f.hidden }, f.hidden ? t('cfields.shown') : t('cfields.hiddenDone'))
                      }
                    >
                      {f.hidden ? t('cfields.show') : t('cfields.hide')}
                    </button>
                  )}
                  {!f.builtIn && f.hidden && (
                    <button type="button" className={dangerButton} onClick={() => void remove(f)}>
                      {t('cfields.deleteForGood')}
                    </button>
                  )}
                </span>
              </div>
              {editing === f.key && (
                <form onSubmit={(e) => void saveEdit(e, f)} className="grid gap-3 rounded-s border border-bd p-3">
                  <LabelInputs
                    labels={draft.labels}
                    onChange={(labels) => setDraft({ ...draft, labels })}
                    idBase={`edit-${f.key}`}
                  />
                  {f.builtIn && (
                    <p className="text-xs text-mu">
                      {t('cfields.builtInNameHelp', { name: t(`cfields.builtIn.${f.object}.${f.key}`) })}
                    </p>
                  )}
                  {needsOptions(f.type) && f.key !== 'channel' && (
                    <OptionsEditor
                      options={draft.options}
                      onChange={(options) => setDraft({ ...draft, options })}
                      def={f}
                    />
                  )}
                  {!isFixedField(f.object, f.key) && (
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-[var(--brand)]"
                        checked={draft.required}
                        onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                      />
                      {t('cfields.required')}
                    </label>
                  )}
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)]"
                      checked={draft.ai}
                      onChange={(e) => setDraft({ ...draft, ai: e.target.checked })}
                    />
                    {t('cfields.ai')}
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" className={primaryButton}>
                      {t('common.save')}
                    </button>
                    <button type="button" className={smallButton} onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-mu">{t('cfields.footer')}</p>
    </section>
  );
}
