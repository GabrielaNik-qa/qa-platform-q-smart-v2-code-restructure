// Fields, like Zendesk's (V2_PLAN §7 "Universal", 11 November): a few universal fields built into Q-smart for customers
// and conversations, and each company's own fields. A company renames, reorders, hides and adds fields; built-in fields
// can be hidden but never deleted. Nothing here is written for one industry: the words and options are the company's.
// The server checks every value against the company's field list; the pages draw the forms from the same list.
import { z } from 'zod';
import { LANGUAGES, type Language } from './roles.js';

export const FIELD_OBJECTS = ['customer', 'conversation'] as const;
export type FieldObject = (typeof FIELD_OBJECTS)[number];

/** Zendesk's kinds of field. */
export const FIELD_TYPES = [
  'text',
  'longText',
  'number',
  'decimal',
  'money',
  'date',
  'checkbox',
  'dropdown',
  'multi',
  'link',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** A name in the company's languages (at least one). */
export type Labels = Partial<Record<Language, string>>;
export interface FieldOption {
  id: string;
  labels: Labels;
  /** when to choose it, in the company's words (for a conversation's outcome: AutoQA's outcome check reads it) */
  guide?: string;
}

export interface FieldDef {
  object: FieldObject;
  key: string;
  builtIn: boolean;
  /** the company's own name; empty for a built-in field it never renamed (the pages then use Q-smart's name) */
  labels: Labels;
  type: FieldType;
  options: FieldOption[];
  required: boolean;
  /** the AI may read it (for AutoQA and Q Trainer); personal details are off by default */
  ai: boolean;
  /** hidden: not shown and not asked for; its values are kept, and it can come back */
  hidden: boolean;
  position: number;
}

interface BuiltIn {
  key: string;
  type: FieldType;
  ai: boolean;
  /** always filled in (the field can't be made optional or hidden) */
  fixed?: boolean;
  options?: string[];
}

/** The universal fields every company starts with (their names are in the pages' texts, in three languages). */
export const BUILT_IN_FIELDS: Record<FieldObject, BuiltIn[]> = {
  customer: [
    { key: 'name', type: 'text', ai: false },
    { key: 'externalId', type: 'text', ai: false },
    { key: 'phone', type: 'text', ai: false },
    { key: 'email', type: 'text', ai: false },
    { key: 'language', type: 'text', ai: true },
    { key: 'country', type: 'text', ai: true },
    { key: 'since', type: 'date', ai: true },
    { key: 'status', type: 'dropdown', ai: true, options: ['active', 'inactive', 'new'] },
    { key: 'segment', type: 'text', ai: true },
    { key: 'lastContact', type: 'date', ai: true },
    { key: 'notes', type: 'longText', ai: false },
  ],
  conversation: [
    { key: 'channel', type: 'dropdown', ai: true, fixed: true, options: ['call', 'chat', 'email', 'other'] },
    { key: 'direction', type: 'dropdown', ai: true, options: ['in', 'out'] },
    { key: 'startedAt', type: 'date', ai: true, fixed: true },
    { key: 'duration', type: 'number', ai: true },
    { key: 'language', type: 'text', ai: true },
    { key: 'agent', type: 'text', ai: false, fixed: true },
    { key: 'team', type: 'text', ai: false },
    { key: 'outcome', type: 'dropdown', ai: true, options: ['resolved', 'followUp', 'notResolved', 'noAnswer'] },
    { key: 'outcomeReason', type: 'text', ai: true },
    { key: 'reference', type: 'text', ai: false },
    { key: 'subject', type: 'text', ai: true },
  ],
};

export const isBuiltInField = (object: FieldObject, key: string) => BUILT_IN_FIELDS[object].some((f) => f.key === key);
/** The ids of Q-smart's own options of a built-in drop-down (they may keep Q-smart's names: no name of the company's). */
export const builtInOptionIds = (object: FieldObject, key: string): string[] =>
  BUILT_IN_FIELDS[object].find((f) => f.key === key)?.options ?? [];
export const isFixedField = (object: FieldObject, key: string) =>
  BUILT_IN_FIELDS[object].some((f) => f.key === key && f.fixed);

/** What a company stored: its changes to built-in fields, and its own fields. */
export type StoredField = Omit<FieldDef, 'builtIn'>;

/** The company's field list for one kind of record: built-in fields (with its changes) and its own, in its order. */
export function fieldsOf(object: FieldObject, stored: StoredField[]): FieldDef[] {
  const mine = stored.filter((f) => f.object === object);
  const builtIn = BUILT_IN_FIELDS[object].map((b, i): FieldDef => {
    const change = mine.find((f) => f.key === b.key);
    return {
      object,
      key: b.key,
      builtIn: true,
      labels: change?.labels ?? {},
      type: b.type,
      options:
        change?.options && change.options.length ? change.options : (b.options ?? []).map((id) => ({ id, labels: {} })),
      required: b.fixed ? true : (change?.required ?? false),
      ai: change?.ai ?? b.ai,
      hidden: b.fixed ? false : (change?.hidden ?? false),
      position: change?.position ?? i * 10,
    };
  });
  const own = mine.filter((f) => !isBuiltInField(object, f.key)).map((f): FieldDef => ({ ...f, builtIn: false }));
  return [...builtIn, ...own].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------------------------- checks

const label = z.string().trim().max(80);
export const labelsSchema = z
  .partialRecord(z.enum(LANGUAGES), label)
  .refine((l) => Object.values(l).some((v) => v && v.length > 0), 'a name in at least one language');
export const optionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  labels: labelsSchema,
  guide: z.string().trim().max(300).optional(),
});
export const fieldKeySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/);

const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** The check for one field's value (empty values are handled by `checkValues`). */
export function valueSchema(def: Pick<FieldDef, 'type' | 'options'>): z.ZodType {
  const ids = def.options.map((o) => o.id);
  switch (def.type) {
    case 'text':
      return z.string().trim().max(500);
    case 'longText':
      return z.string().trim().max(5000);
    case 'number':
      return z.number().int().min(-1_000_000_000).max(1_000_000_000);
    case 'decimal':
      return z.number().finite().min(-1_000_000_000).max(1_000_000_000);
    case 'money':
      return (
        z
          .number()
          .finite()
          .min(-1_000_000_000)
          .max(1_000_000_000)
          // 19.99 × 100 is 1998.9999… in a computer: a tiny tolerance, not a third decimal
          .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'at most 2 decimals')
      );
    case 'date':
      return z
        .string()
        .regex(DATE)
        .refine((s) => !Number.isNaN(Date.parse(s)), 'a real date');
    case 'checkbox':
      return z.boolean();
    case 'dropdown':
      return z.string().refine((v) => ids.includes(v), 'one of the options');
    case 'multi':
      return z
        .array(z.string())
        .max(100)
        .refine((v) => v.every((x) => ids.includes(x)) && new Set(v).size === v.length, 'options of the list');
    case 'link':
      return z
        .string()
        .trim()
        .max(1000)
        .regex(/^https?:\/\/\S+$/);
  }
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export interface CheckedValues {
  values: Record<string, unknown>;
  /** the fields whose value is missing or wrong */
  problems: string[];
}

/**
 * Checks values against the company's field list: only its fields (hidden ones keep the value they had), each value of
 * the right kind, and the required ones filled in. Empty values are dropped.
 */
export function checkValues(
  defs: FieldDef[],
  given: Record<string, unknown>,
  kept: Record<string, unknown> = {},
): CheckedValues {
  const values: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const key of Object.keys(given)) if (!defs.some((d) => d.key === key)) problems.push(key);
  for (const def of defs) {
    if (def.hidden) {
      if (!isEmpty(kept[def.key])) values[def.key] = kept[def.key];
      continue;
    }
    const value = given[def.key];
    if (isEmpty(value)) {
      if (def.required) problems.push(def.key);
      continue;
    }
    const checked = valueSchema(def).safeParse(value);
    if (checked.success) values[def.key] = checked.data;
    else problems.push(def.key);
  }
  return { values, problems };
}

/** A field's name in a language: the company's own, or another of its languages, or the built-in name. */
export function fieldLabel(def: Pick<FieldDef, 'labels'>, lang: Language, builtInName: string): string {
  return def.labels[lang] || builtInName || Object.values(def.labels).find(Boolean) || '';
}
