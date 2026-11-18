// Learning › Tools (Phase 6, piece 4), the rules the pages and the server share. As today's app (current-app/public/js/tools.js):
// - redaction takes personal data out of a text, in the browser, nothing is sent or saved;
// - the sample calculator says how many reviews make a fair score (95% sure, within 10 points, by default).

/** The Luhn check of a card number: only numbers that pass it are taken for cards. */
export function luhn(digits: string): boolean {
  let total = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
    alt = !alt;
  }
  return total % 10 === 0;
}

export type RedactKind = 'card' | 'iban' | 'email' | 'phone' | 'number';
export interface Redacted {
  out: string;
  found: Record<RedactKind, number>;
}

/** The text without card numbers, IBANs, e-mails, phone numbers and other long numbers. Names are not found: check them yourself. */
export function redact(text: string): Redacted {
  const found: Record<RedactKind, number> = { card: 0, iban: 0, email: 0, phone: 0, number: 0 };
  const swap = (kind: RedactKind, tag: string) => () => {
    found[kind]++;
    return tag;
  };
  let out = text;
  out = out.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      found.card++;
      return '[CARD]';
    }
    return m;
  });
  out = out.replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g, swap('iban', '[IBAN]'));
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, swap('email', '[EMAIL]'));
  out = out.replace(/(?:\+|00)\d[\d ()-]{6,}\d|\b0\d[\d -]{6,}\d\b/g, swap('phone', '[PHONE]'));
  out = out.replace(/\b\d{9,}\b/g, swap('number', '[NUMBER]'));
  return { out, found };
}

export const CONFIDENCES = [90, 95, 99] as const;
export const ACCEPTED_ERRORS = [5, 10, 15] as const;

/**
 * How many reviews of the `population` conversations make the score right within ± `error` points, `confidence`% sure
 * (the usual sample size for a share, with the correction for a small population).
 */
export function sampleSize(population: number, confidence: number, error: number): number {
  const z = ({ 90: 1.645, 95: 1.96, 99: 2.576 } as Record<number, number>)[confidence] ?? 1.96;
  const e = Math.min(Math.max(error, 1), 50) / 100;
  const first = (z * z * 0.25) / (e * e);
  return Math.ceil(population > 0 ? first / (1 + (first - 1) / population) : first);
}
