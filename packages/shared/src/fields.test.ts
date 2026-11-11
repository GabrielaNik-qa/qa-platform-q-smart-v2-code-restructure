// Fields, like Zendesk's: the universal built-in fields, the company's changes and own fields, and the value checks.
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_FIELDS,
  checkValues,
  type FieldDef,
  fieldLabel,
  fieldsOf,
  type StoredField,
  valueSchema,
} from './fields.js';

const own = (over: Partial<StoredField>): StoredField => ({
  object: 'conversation',
  key: 'fabc',
  labels: { en: 'Product' },
  type: 'text',
  options: [],
  required: false,
  ai: false,
  hidden: false,
  position: 500,
  ...over,
});

describe('the field list', () => {
  it('starts with the universal fields, none of them for one industry', () => {
    const conversation = fieldsOf('conversation', []);
    expect(conversation.map((f) => f.key)).toEqual(BUILT_IN_FIELDS.conversation.map((f) => f.key));
    expect(conversation.every((f) => f.builtIn && !f.hidden)).toBe(true);
    expect(fieldsOf('customer', []).map((f) => f.key)).toEqual([
      'name',
      'externalId',
      'phone',
      'email',
      'language',
      'country',
      'since',
      'status',
      'segment',
      'lastContact',
      'notes',
    ]);
    // personal details are not read by the AI unless the company says so
    const ai = Object.fromEntries(fieldsOf('customer', []).map((f) => [f.key, f.ai]));
    expect(ai).toMatchObject({ name: false, phone: false, email: false, notes: false, country: true });
    const words = JSON.stringify(BUILT_IN_FIELDS).toLowerCase();
    for (const w of ['player', 'casino', 'bonus', 'wager', 'patient', 'deposit']) expect(words).not.toContain(w);
  });

  it("applies the company's changes and adds its own fields, in its order", () => {
    const list = fieldsOf('conversation', [
      own({
        key: 'outcome',
        labels: { en: 'Result' },
        position: 1,
        type: 'dropdown',
        options: [{ id: 'won', labels: { en: 'Won' } }],
      }),
      own({ key: 'direction', hidden: true, type: 'dropdown', position: 20 }),
      own({ key: 'fabc', position: 5 }),
      own({ key: 'channel', hidden: true, required: false, type: 'dropdown', position: 0 }),
      own({ object: 'customer', key: 'fcust' }),
    ]);
    expect(list.slice(0, 3).map((f) => f.key)).toEqual(['channel', 'outcome', 'fabc']);
    expect(list.find((f) => f.key === 'outcome')).toMatchObject({ labels: { en: 'Result' }, options: [{ id: 'won' }] });
    expect(list.find((f) => f.key === 'direction')?.hidden).toBe(true);
    // fixed fields can't be hidden or made optional
    expect(list.find((f) => f.key === 'channel')).toMatchObject({ hidden: false, required: true });
    expect(list.find((f) => f.key === 'fabc')?.builtIn).toBe(false);
    expect(list.some((f) => f.key === 'fcust')).toBe(false);
  });

  it("shows the company's own name, or Q-smart's", () => {
    expect(fieldLabel({ labels: { en: 'Result', bg: 'Резултат' } }, 'bg', 'Outcome')).toBe('Резултат');
    expect(fieldLabel({ labels: {} }, 'fr', 'Résultat')).toBe('Résultat');
    expect(fieldLabel({ labels: { en: 'Plan' } }, 'fr', '')).toBe('Plan');
  });
});

describe('the value checks', () => {
  const def = (type: FieldDef['type'], options: string[] = []) => ({
    type,
    options: options.map((id) => ({ id, labels: { en: id } })),
  });
  const ok = (d: ReturnType<typeof def>, v: unknown) => valueSchema(d).safeParse(v).success;

  it('accepts each kind of value only in its own form', () => {
    expect(ok(def('text'), 'Hello')).toBe(true);
    expect(ok(def('text'), 'x'.repeat(501))).toBe(false);
    expect(ok(def('number'), 12)).toBe(true);
    expect(ok(def('number'), 1.5)).toBe(false);
    expect(ok(def('decimal'), 1.5)).toBe(true);
    expect(ok(def('money'), 19.99)).toBe(true);
    expect(ok(def('money'), 19.999)).toBe(false);
    expect(ok(def('date'), '2026-11-11')).toBe(true);
    expect(ok(def('date'), '2026-13-45')).toBe(false);
    expect(ok(def('checkbox'), true)).toBe(true);
    expect(ok(def('checkbox'), 'yes')).toBe(false);
    expect(ok(def('dropdown', ['a', 'b']), 'a')).toBe(true);
    expect(ok(def('dropdown', ['a', 'b']), 'c')).toBe(false);
    expect(ok(def('multi', ['a', 'b']), ['a', 'b'])).toBe(true);
    expect(ok(def('multi', ['a', 'b']), ['a', 'a'])).toBe(false);
    expect(ok(def('link'), 'https://crm.example.com/1')).toBe(true);
    expect(ok(def('link'), 'javascript:alert(1)')).toBe(false);
  });

  it('keeps only known fields, asks for the required ones, and keeps the values of hidden fields', () => {
    const defs = fieldsOf('conversation', [
      own({ key: 'fneed', required: true }),
      own({ key: 'fgone', hidden: true }),
    ]).filter((f) => !['channel', 'startedAt', 'agent', 'team'].includes(f.key));
    const result = checkValues(defs, { outcome: 'resolved', fneed: '', unknown: 1, fgone: 'new' }, { fgone: 'old' });
    expect(result.problems.sort()).toEqual(['fneed', 'unknown']);
    expect(result.values).toEqual({ outcome: 'resolved', fgone: 'old' });
    const good = checkValues(defs, { outcome: 'resolved', fneed: 'Yes', duration: 95 });
    expect(good).toEqual({ values: { outcome: 'resolved', fneed: 'Yes', duration: 95 }, problems: [] });
  });
});
