import { describe, expect, it } from 'vitest';
import { luhn, redact, sampleSize } from './tools.js';

describe('redaction', () => {
  it('takes out cards that pass the Luhn check, IBANs, e-mails, phone numbers and long numbers', () => {
    const { out, found } = redact(
      'Card 4111 1111 1111 1111, IBAN BG80 BNBG 9661 1020 3456 78, mail ann.k@example.com, call +359 88 123 4567 or 0888 123 456, ref 1234567890.',
    );
    expect(out).toBe('Card [CARD], IBAN [IBAN], mail [EMAIL], call [PHONE] or [PHONE], ref [NUMBER].');
    expect(found).toEqual({ card: 1, iban: 1, email: 1, phone: 2, number: 1 });
  });

  it('keeps a long number that is not a card as a number, and leaves short numbers and words alone', () => {
    const { out, found } = redact('Order 4111 1111 1111 1112 and 42 items, score 95.');
    expect(found.card).toBe(0);
    expect(out).toContain('and 42 items, score 95.');
    expect(redact('Nothing personal here').found).toEqual({ card: 0, iban: 0, email: 0, phone: 0, number: 0 });
    expect(luhn('4111111111111111')).toBe(true);
    expect(luhn('4111111111111112')).toBe(false);
  });

  it('is fast on a crafted text', () => {
    const started = Date.now();
    redact('1 '.repeat(20_000) + 'a@'.repeat(5_000) + '+'.repeat(20_000));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('the sample calculator', () => {
  it('gives the usual sample sizes: 95% sure and within 10 points needs about 97 of a big population', () => {
    expect(sampleSize(1_000_000, 95, 10)).toBe(97);
    expect(sampleSize(400, 95, 10)).toBe(78);
    expect(sampleSize(1_000_000, 99, 5)).toBe(664);
    expect(sampleSize(1_000_000, 90, 15)).toBe(31);
  });

  it('never asks for more reviews than there are conversations, and copes with odd numbers', () => {
    expect(sampleSize(20, 95, 5)).toBeLessThanOrEqual(20);
    expect(sampleSize(1, 95, 10)).toBe(1);
    expect(sampleSize(0, 95, 10)).toBe(97);
    expect(sampleSize(400, 77, 10)).toBe(sampleSize(400, 95, 10));
    expect(Number.isFinite(sampleSize(400, 95, 0))).toBe(true);
  });
});
