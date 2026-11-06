// The Markdown renderer must never let an article inject HTML or scripts, and every file must at least compile.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { md } = require('../public/js/md.js');

test('HTML in an article is shown as text, never run', () => {
  const out = md('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<script>') && !out.includes('<img'));
  assert.ok(out.includes('&#60;script&#62;'));
});
test('only http(s) links become links', () => {
  assert.ok(!md('[x](javascript:alert(1))').includes('<a '));
  assert.ok(md('[site](https://example.com)').includes('<a href="https://example.com" target="_blank" rel="noopener">site</a>'));
});
test('a link cannot break out of its href', () => {
  const out = md('[x](https://a.com/"onmouseover="alert(1))');
  assert.ok(!/href="[^"]*"onmouseover=/.test(out));
});
test('headings, lists and code blocks', () => {
  assert.equal(md('## Title'), '<h2>Title</h2>');
  assert.equal(md('- a\n- b'), '<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
  assert.ok(md('```\n<b>\n```').includes('&#60;b&#62;'));
});

const ROOT = path.join(__dirname, '..');
const jsFiles = dir => fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));
test('every JavaScript file compiles', () => {
  for (const f of [...jsFiles('.'), ...jsFiles('public/js'), ...jsFiles('test')]) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }), f);
  }
});
test('the page loads every script and the stylesheet that exist', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)/g)].map(m => m[1]);
  assert.ok(refs.includes('css/app.css') && refs.includes('js/prefs.js'));
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, 'public', r)), r);
  for (const f of jsFiles('public/js')) assert.ok(refs.includes('js/' + path.basename(f)), 'not loaded by the page: ' + f);
});
// The page scripts share one global scope: a name declared at the top of two files stops the second file from loading at all
// (its whole page then silently shows the dashboard). It happened once with "catList" (widgets.js and scorecards.js).
test('no two page scripts declare the same top-level name', () => {
  const dir = path.join(__dirname, '..', 'public', 'js'), seen = {};
  const names = line => {                                     // every name declared on a top-level line: const a = 1, b = f(x, y), c = 2;
    const m = line.match(/^(?:async\s+)?(function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/); if (!m) return [];
    if (m[1] === 'function' || m[1] === 'class') return [m[2]];
    const out = [m[2]]; let depth = 0, q = '';
    for (let i = m[0].length; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
      else if (c === ';' && depth === 0) break;
      else if (c === ',' && depth === 0) { const n = line.slice(i + 1).match(/^\s*([A-Za-z_$][\w$]*)\s*=/); if (n) out.push(n[1]); }
    }
    return out;
  };
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) for (const n of names(line)) (seen[n] = seen[n] || new Set()).add(f);
  const dup = Object.entries(seen).filter(([, s]) => s.size > 1).map(([n, s]) => n + ': ' + [...s].join(', '));
  assert.deepEqual(dup, []);
});
