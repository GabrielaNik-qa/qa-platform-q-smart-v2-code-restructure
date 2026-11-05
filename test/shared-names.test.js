// The page scripts in public/js all run in one page, so a name declared at the top of two files clashes: a second "const X"
// stops the whole second file with an error (F-12, round 3), and a second "function X" silently replaces the first one.
// This test reads the top-level names of every page script and fails when one is declared twice.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const JS = path.join(__dirname, '..', 'public', 'js');
// the top-level names of one file: only lines that start at column 0 (the code style of these files), ignoring the inside of strings
function topNames(src) {
  const out = [];
  for (const line of src.split('\n')) {
    let m = line.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/); if (m) { out.push(m[1]); continue; }
    m = line.match(/^class\s+([A-Za-z_$][\w$]*)/); if (m) { out.push(m[1]); continue; }
    m = line.match(/^(?:const|let|var)\s+(.*)/); if (!m) continue;
    // "const a = …, b = …": the names before each "=" at bracket depth 0
    let depth = 0, cur = '', expectName = true; const s = m[1];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } continue; }
      if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
      if (depth === 0 && c === ',') { expectName = true; cur = ''; continue; }
      if (expectName) { if (/[\w$]/.test(c)) cur += c; else if (c === '=' || c === ';') { if (cur) out.push(cur); expectName = false; } else if (cur && /\s/.test(c)) { /* wait for "=" */ } else if (!/\s/.test(c)) expectName = false; }
    }
  }
  return out;
}

test('F-12: no name is declared at the top of two page scripts', () => {
  const where = {};
  for (const f of fs.readdirSync(JS).filter(f => f.endsWith('.js'))) for (const n of new Set(topNames(fs.readFileSync(path.join(JS, f), 'utf8')))) (where[n] = where[n] || []).push(f);
  const twice = Object.entries(where).filter(([, fs2]) => fs2.length > 1).map(([n, fs2]) => n + ' in ' + fs2.join(', '));
  assert.ok(Object.keys(where).length > 500, 'found ' + Object.keys(where).length + ' names');
  assert.deepEqual(twice, [], 'declared in more than one file');
});
test('the helper finds the names of a line with several declarations', () => {
  assert.deepEqual(topNames("const a = 1, b = f(1, 2), c = { x: 1, y: 2 }, d = 'x,y';\nfunction e() {}\nlet g;"), ['a', 'b', 'c', 'd', 'e', 'g']);
});
