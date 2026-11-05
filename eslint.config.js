// The code checker (npm.cmd run lint): it looks only for real mistakes (a name used but never defined, code that can never run,
// the same key twice, a comparison with itself …), not for style. The page scripts in public/js all share one page, so a
// name defined at the top of one file can be used in another: those names are collected here and declared for every file.
const fs = require('fs'), path = require('path'), globals = require('globals');

const JS = path.join(__dirname, 'public', 'js');
const pageFiles = fs.readdirSync(JS).filter(f => f.endsWith('.js')).map(f => path.join(JS, f)).concat(fs.readdirSync(path.join(JS, 'i18n')).map(f => path.join(JS, 'i18n', f)));
const shared = {};
for (const f of pageFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([^=;]+?)\s*=|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*;|^class\s+([A-Za-z_$][\w$]*)/gm)) {
    const names = m[2] ? m[2].replace(/\{[^}]*\}|\[[^\]]*\]/g, '').split(',').map(s => s.trim().split(/\s/)[0]) : [m[1] || m[3] || m[4]];
    names.filter(n => /^[A-Za-z_$][\w$]*$/.test(n)).forEach(n => { shared[n] = 'writable'; });
    // the other declarations of a "const a = 1, b = 2" line
    if (m[2] !== undefined) { const line = src.slice(m.index, src.indexOf('\n', m.index)); for (const x of line.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=/g)) shared[x[1]] = 'writable'; }
  }
  // names a file hands to the page through the global object: window.X = …, or g.X / root.X = … inside (function (g) { … })(window)
  for (const m of src.matchAll(/\b(?:window|globalThis|self|g|root)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) shared[m[1]] = 'writable';
}
const RULES = {
  'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-duplicate-case': 'error', 'no-self-compare': 'error',
  'no-func-assign': 'error', 'no-const-assign': 'error', 'no-redeclare': 'off', 'no-unsafe-finally': 'error', 'no-unsafe-negation': 'error', 'use-isnan': 'error', 'valid-typeof': 'error',
  'no-cond-assign': ['error', 'except-parens'], 'no-constant-binary-expression': 'error', 'no-dupe-else-if': 'error', 'no-import-assign': 'error', 'no-setter-return': 'error'
};
module.exports = [
  { ignores: ['node_modules/**', 'seed.js', 'docs/**', 'test/e2e/report/**', 'playwright-report/**', 'test-results/**'] },
  { files: ['*.js', 'test/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } }, rules: RULES },
  // the language test loads the page's language files in Node, with a pretend "window"
  { files: ['test/i18n.test.js', 'test/i18n-server.test.js', 'test/md-and-syntax.test.js', 'test/escaping.test.js', 'test/prefs.test.js'], languageOptions: { globals: { window: 'writable', I18N: 'writable' } } },
  // the browser tests run code inside the page, where the page's own names exist
  { files: ['test/e2e/**/*.js'], languageOptions: { globals: { ...globals.browser, ...shared } } },
  // the Help Center website (public/hc) is its own small page: only the browser's names and md() from js/md.js
  { files: ['public/hc/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser } }, rules: RULES },
  { files: ['public/js/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser, ...shared, module: 'readonly' } }, rules: RULES }
];
