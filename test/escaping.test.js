// Text typed by users must be escaped before it is put on a page. This checks the places that were found unescaped in the audit (regression).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');

test('the kudos badge is escaped everywhere it is shown', () => {
  for (const f of ['perf.js', 'widgets.js', 'agents.js']) {
    assert.ok(!/\$\{k\.badge \|\|/.test(js(f)), f + ' shows k.badge without esc()');
    assert.ok(!/agRow\(k\.badge/.test(js(f)), f + ' passes k.badge to agRow without esc()');
  }
});
