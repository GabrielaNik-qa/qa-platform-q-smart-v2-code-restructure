import { LANGUAGES } from '@qsmart/shared';
import { describe, expect, it } from 'vitest';
import { messages } from './messages';

/** All the text keys of one language, like "signIn.title". */
const keys = (value: unknown, prefix = ''): string[] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('the texts of the pages', () => {
  it('exist in English, Bulgarian and French, with the same keys', () => {
    const english = keys(messages.en).sort();
    for (const lang of LANGUAGES) expect(keys(messages[lang]).sort()).toEqual(english);
  });

  it('are never empty and keep the same {{placeholders}} in every language', () => {
    for (const key of keys(messages.en)) {
      const text = (lang: (typeof LANGUAGES)[number]) =>
        key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages[lang]) as string;
      for (const lang of LANGUAGES) {
        expect(text(lang), `${lang} ${key}`).not.toBe('');
        expect(placeholders(text(lang)), `${lang} ${key}`).toEqual(placeholders(text('en')));
      }
    }
  });

  it('never use the long or medium dash, only - or : (your rule of 10 November)', () => {
    for (const lang of LANGUAGES) {
      // the two dashes, by their character codes, so this file doesn't contain them either
      const dashes = new RegExp(`.{0,30}[${String.fromCharCode(0x2013, 0x2014)}].{0,30}`, 'g');
      const found = JSON.stringify(messages[lang]).match(dashes) ?? [];
      expect(found, lang).toEqual([]);
    }
  });
});
