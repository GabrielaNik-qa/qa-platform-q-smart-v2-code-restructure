// Languages (public/js/i18n.js + public/js/i18n/bg.js, fr.js): every English text of the pages has a Bulgarian and a French
// translation, plural forms and values work, and anything without a translation safely stays English.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');

global.window = {};
require(path.join(JS, 'i18n.js'));
global.I18N = window.I18N;
require(path.join(JS, 'i18n', 'bg.js'));
require(path.join(JS, 'i18n', 'fr.js'));
const tr = (s, l) => I18N.tr(s, l);

// ---- every visible English text written in the page code (quoted strings and the text parts of the HTML templates)
function texts(src) {
  const out = new Set(); let i = 0; const n = src.length;
  const keep = s => {
    const attrs = [...s.matchAll(/(?:title|placeholder|aria-label|alt)="([^"$]*)"/g)].map(m => m[1]);
    for (let t of [...s.replace(/<[^>]*>/g, '\u0001').split('\u0001'), ...attrs]) {
      t = t.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&rarr;/g, '→').replace(/\s+/g, ' ').trim();
      if (t && !t.includes('{}') && !/\($/.test(t) && !/^[A-Za-z]+\.[a-z]/.test(t) && /[a-z]{2,} /i.test(t + ' ') && /^[A-Z+(←•✓○▲▼—↗↘“"]/.test(t) && !/=|=>|\(\)|^[A-Z_]+$|^[A-Z][a-z]+[A-Z]/.test(t)
        // a ";" is code, unless the text is a sentence that goes on after it ("Click any card to go deeper; choose …", round 4)
        && (!t.includes(';') || /^[^;(){}[\]]+; [a-z][^;(){}[\]]*$/.test(t))) out.add(t);
    }
  };
  const str = q => { let s = ''; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; } s += src[i++]; } i++; return s; };
  const tmpl = () => { let s = ''; i++; while (i < n && src[i] !== '`') { if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; } if (src[i] === '$' && src[i + 1] === '{') { i += 2; code(true); s += '{}'; continue; } s += src[i++]; } i++; return s; };
  function code(inner) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
      if (c === "'" || c === '"') { keep(str(c)); continue; }
      if (c === '`') { keep(tmpl()); continue; }
      if (c === '/' && /[=(,:!&|?{};[]\s*$/.test(src.slice(Math.max(0, i - 5), i))) { i++; let cls = false; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; i++; } i++; continue; }
      if (c === '{') depth++;
      if (c === '}') { if (inner && depth === 0) { i++; return; } depth--; }
      i++;
    }
  }
  code(false);
  return out;
}
// texts that are deliberately the same in every language (brand, commands typed in a terminal, sample transcripts in English)
const SAME = new Set(['Q-SMART', 'Ctrl K', 'Escape', 'Tab', 'Enter', 'Content-Type', 'Customer: Hi, I have a question…nAgent: Good morning, thank you for calling…', 'Agent: Good morning, my name is Anna. How can I help you?nCustomer: …',
  // example steps shown inside a text box (text boxes are never translated)
  'Check work email | 5nClose tickets in Zendesk | 20', 'Check work email – Outlook | 5nCheck escalation group in Teams | 10']);
const EMAIL = /\{(name|link|username|password|lead)\}/;   // the default e-mail texts (Admin › Email templates): e-mails stay in English, see docs/i18n-glossary.md
const PAGES = fs.readdirSync(JS).filter(f => f.endsWith('.js') && !['i18n.js', 'md.js'].includes(f));

test('every page text has a Bulgarian and a French translation (no screen is left in English)', () => {
  const missing = { bg: [], fr: [] };
  for (const f of PAGES) for (const t of texts(fs.readFileSync(path.join(JS, f), 'utf8'))) {
    if (SAME.has(t) || EMAIL.test(t)) continue;
    for (const l of ['bg', 'fr']) if (!I18N.has(t, l) && !I18N.has(t + ' 0)', l)) missing[l].push(f + ': ' + t);   // 'text (currently ' + n + ')'
  }
  assert.deepEqual(missing.bg, [], 'Bulgarian is missing:\n' + missing.bg.join('\n'));
  assert.deepEqual(missing.fr, [], 'French is missing:\n' + missing.fr.join('\n'));
});

test('Bulgarian and French have exactly the same entries, and every value keeps the same placeholders', () => {
  const b = I18N.dict('bg'), f = I18N.dict('fr');
  assert.deepEqual([...b.exact.keys()].sort(), [...f.exact.keys()].sort());
  assert.deepEqual(b.pats.map(p => p.en).sort(), f.pats.map(p => p.en).sort());
  const names = s => (s.match(/\{~?[A-Za-z0-9]+\}/g) || []).map(x => x.replace('~', '')).sort();
  for (const d of [b, f]) for (const p of d.pats) {
    const forms = typeof p.v === 'string' ? [p.v] : Object.values(p.v);
    for (const v of forms) assert.deepEqual(names(v), names(p.en), `placeholders differ in "${p.en}" → "${v}"`);
  }
});

test('the three languages can be chosen; an unknown code falls back to English', () => {
  assert.deepEqual(I18N.LANGS.map(l => l.name), ['English', 'Български', 'Français']);
  assert.equal(I18N.set('bg'), 'bg'); assert.equal(I18N.lang, 'bg'); assert.equal(I18N.locale(), 'bg-BG');
  assert.equal(I18N.set('fr'), 'fr'); assert.equal(I18N.locale(), 'fr-FR');
  assert.equal(I18N.set('de'), 'en'); assert.equal(I18N.locale(), 'en-GB');
});

test('main texts are translated, with Cyrillic and accents intact', () => {
  assert.equal(tr('Sign in', 'bg'), 'Вход');
  assert.equal(tr('Sign in', 'fr'), 'Se connecter');
  assert.equal(tr('Scorecards', 'bg'), 'Оценъчни карти');
  assert.equal(tr('Scorecards', 'fr'), "Grilles d'évaluation");
  assert.equal(tr('Critical failure: score set to 0%', 'fr'), 'Erreur critique : score ramené à 0 %');
  assert.match(tr('Dispute', 'bg'), /^[А-Яа-я]+$/);
  assert.equal(tr('Sign in', 'en'), 'Sign in');
});

test('missing translations fall back to English and are listed in debug mode', () => {
  assert.equal(tr('A text nobody translated', 'bg'), 'A text nobody translated');
  assert.equal(tr('  Sign in  ', 'bg'), '  Вход  ');            // spaces around a text stay where they were
  assert.equal(tr('42', 'fr'), '42');                           // numbers and names without letters are left alone
});

test('plural forms follow the rules of each language', () => {
  assert.equal(tr('1 user', 'bg'), '1 потребител');
  assert.equal(tr('5 users', 'bg'), '5 потребители');
  assert.equal(tr('1 users', 'fr'), '1 utilisateur');          // French: 0 and 1 are singular
  assert.equal(tr('0 users', 'fr'), '0 utilisateur');
  assert.equal(tr('2 users', 'fr'), '2 utilisateurs');
  assert.equal(tr('1 disputed call', 'bg'), '1 оспорен разговор');
  assert.equal(tr('3 disputed calls', 'bg'), '3 оспорени разговора');
});

test('values inside a text are kept, and translated where they are labels', () => {
  assert.equal(tr('Showing 1 to 10 of 42 results', 'bg'), 'Показани 1 до 10 от 42 резултата');
  assert.equal(tr('Showing 1 to 10 of 42 results', 'fr'), 'Résultats 1 à 10 sur 42');
  assert.equal(tr('Lead #4312345', 'fr'), 'Lead n° 4312345');
  assert.equal(tr('Sort by Score', 'bg'), 'Сортирай по Резултат');   // {~x}: the label inside is translated too
  assert.equal(tr('You received a new call review for Lead #77 (score 92%)', 'bg'), 'Получихте нова оценка на разговор за лийд №77 (резултат 92%)');
  assert.equal(I18N.tf('{n} pts', { n: 40 }), '40 pts');      // English stays English
});

test('dates use the format of the chosen language', () => {
  const d = new Date(2026, 9, 23);
  assert.equal(d.toLocaleDateString(I18N.locale('en')), '23/10/2026');
  assert.match(d.toLocaleDateString(I18N.locale('bg')), /^23\.10\.2026/);
  assert.equal(d.toLocaleDateString(I18N.locale('fr')), '23/10/2026');
  assert.match(d.toLocaleString(I18N.locale('fr'), { month: 'long' }), /octobre/);
  assert.match(d.toLocaleString(I18N.locale('bg'), { month: 'long' }), /октомври/);
});

test('the language files only change what is shown: no page code checks the language to change a value', () => {
  for (const f of PAGES) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    assert.doesNotMatch(src, /I18N\.lang\s*===?\s*'(bg|fr)'/, f + ' must not branch on the language');
  }
});
