// The fonts are served by the app itself (R-24, decided 28 October): the page asks no other site for anything, every font rule
// of app.css points to a real font file in public/fonts, every family has its licence, and the server sends the fonts with the
// right type, a long cache, and a security policy that allows fonts from the app only.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { startApp } = require('./fixture-round4');

const PUB = path.join(__dirname, '..', 'public'), FONTS = path.join(PUB, 'fonts');
const css = fs.readFileSync(path.join(PUB, 'css', 'app.css'), 'utf8'), html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const rules = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map(m => ({ fam: m[1].match(/font-family:'([^']+)'/)[1], weight: m[1].match(/font-weight:(\d+)/)[1], file: m[1].match(/url\('\.\.\/fonts\/([^']+)'\)/)[1], range: (m[1].match(/unicode-range:([^;}]+)/) || [])[1] || '' }));
// the families and weights the pages used from Google Fonts before (index.html, until 28 October)
const WANT = { Barlow: [400, 500, 600, 700], 'Barlow Condensed': [600, 700], 'Fira Sans': [400, 500, 600, 700], 'Fira Sans Extra Condensed': [600, 700], 'JetBrains Mono': [500] };

test('the page loads nothing from another site: no Google Fonts, no outside script or style', () => {
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  const outside = [...html.matchAll(/<(?:link|script)[^>]+(?:href|src)="(https?:)?\/\/[^"]+"/g)].map(m => m[0]);
  assert.deepEqual(outside, [], 'outside links in index.html');
  assert.doesNotMatch(css, /url\(\s*['"]?https?:/, 'app.css loads nothing from another site');
});
test('every font rule points to a real woff2 file, every file is used, and each family and weight has its Latin and (where it exists) Cyrillic letters', () => {
  assert.ok(rules.length >= 60, rules.length + ' font rules');
  for (const r of rules) { const b = fs.readFileSync(path.join(FONTS, r.file)); assert.equal(b.toString('latin1', 0, 4), 'wOF2', r.file + ' is a woff2 font'); }
  const files = fs.readdirSync(FONTS).filter(f => f.endsWith('.woff2')), used = new Set(rules.map(r => r.file));
  assert.deepEqual(files.filter(f => !used.has(f)), [], 'font files no rule uses');
  for (const [fam, ws] of Object.entries(WANT)) for (const w of ws) {
    const mine = rules.filter(r => r.fam === fam && Number(r.weight) === w);
    assert.ok(mine.some(r => /U\+0000-00FF/.test(r.range)), `${fam} ${w}: Latin letters`);
    if (fam !== 'Barlow' && fam !== 'Barlow Condensed') assert.ok(mine.some(r => /U\+0301, U\+0400-045F/.test(r.range)), `${fam} ${w}: Cyrillic letters (Bulgarian)`);
  }
  // Barlow has no Cyrillic letters at all: Bulgarian text falls back to Fira Sans, exactly as it did with Google Fonts
  assert.match(css, /--font:'Barlow','Fira Sans'/); assert.match(css, /--font-d:'Barlow Condensed','Fira Sans Extra Condensed'/);
});
test('each font family has its licence (SIL Open Font License 1.1) next to the fonts', () => {
  for (const f of ['barlow', 'barlow-condensed', 'fira-sans', 'fira-sans-extra-condensed', 'jetbrains-mono'])
    assert.match(fs.readFileSync(path.join(FONTS, f + '-OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/, f);
});
test('the server sends the fonts as fonts, kept by the browser for a year, and the security policy allows fonts from the app only', async () => {
  const app = await startApp();
  try {
    const r = await fetch(app.base + '/fonts/barlow-600-latin.woff2');
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'font/woff2');
    assert.match(r.headers.get('cache-control') || '', /max-age=31536000/); assert.match(r.headers.get('cache-control') || '', /immutable/);
    assert.equal(Buffer.from(await r.arrayBuffer()).toString('latin1', 0, 4), 'wOF2');
    const csp = (await fetch(app.base + '/')).headers.get('content-security-policy');
    assert.match(csp, /font-src 'self';/); assert.match(csp, /style-src 'self' 'unsafe-inline';/); assert.doesNotMatch(csp, /googleapis|gstatic/);
    assert.equal((await fetch(app.base + '/fonts/..%2F..%2Fserver.js')).status, 404, 'nothing outside the fonts folder');
  } finally { app.stop(); }
});
