// Pop-up preferences in the browser: which messages may be hidden, and that safeguards never are.
// prefs.js and core.js are the real browser files, loaded into a small sandbox with a stand-in for the page.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { PREFMSG } = require('../public/js/prefs.js');

test('defaults: everything shows', () => {
  for (const id of Object.keys(PREFMSG.MSGS)) assert.equal(PREFMSG.msgOn({}, id), true, id);
  assert.deepEqual(PREFMSG.prefsOf(undefined), { info: true, confirm: true, off: {} });
});
test('missing, broken or old saved data is treated as the defaults', () => {
  for (const bad of [null, 'text', 42, [], { off: 'x' }, { off: [] }, { info: 'no' }]) {
    const p = PREFMSG.prefsOf(bad);
    assert.equal(p.info, bad && bad.info === false ? false : true);
    assert.equal(p.confirm, true); assert.equal(typeof p.off, 'object'); assert.ok(!Array.isArray(p.off));
  }
});
test('"Don\'t show me this again" hides only that one message', () => {
  const p = { off: { 'tip.roots': '2026-10-23' } };
  assert.equal(PREFMSG.msgOn(p, 'tip.roots'), false);
  assert.equal(PREFMSG.msgOn(p, 'tip.categories'), true);
  assert.equal(PREFMSG.msgOn(p, 'welcome'), true);
  assert.equal(PREFMSG.msgOn(p, 'confirm.move-user'), true);
});
test('the two switches are independent', () => {
  assert.equal(PREFMSG.msgOn({ info: false }, 'welcome'), false);
  assert.equal(PREFMSG.msgOn({ info: false }, 'confirm.del-notif'), true);
  assert.equal(PREFMSG.msgOn({ confirm: false }, 'confirm.del-notif'), false);
  assert.equal(PREFMSG.msgOn({ confirm: false }, 'tip.entry'), true);
});
test('messages that are not in the list (errors, safeguards) always show', () => {
  const all = { info: false, confirm: false, off: { 'delete-review': 'x', 'error': 'x' } };
  assert.equal(PREFMSG.msgOn(all, 'delete-review'), true);
  assert.equal(PREFMSG.msgOn(all, 'error'), true);
  assert.equal(PREFMSG.msgOn(all, ''), true);
});
test('the list of switched-off messages leaves out unknown ids', () => {
  const l = PREFMSG.offList({ off: { 'tip.roots': '2026-10-23T10:00:00Z', 'old.removed-tip': 'x' } });
  assert.deepEqual(l.map(x => x.id), ['tip.roots']);
  assert.equal(l[0].name, 'How it works: root causes');
});
test('only routine actions are in the confirmation list (no deletes of records, no access or password changes)', () => {
  const conf = Object.entries(PREFMSG.MSGS).filter(([, m]) => m.kind === 'confirm').map(([id]) => id).sort();
  assert.deepEqual(conf, ['confirm.del-notif', 'confirm.move-user']);
});

// ---- the "Are you sure?" pop-up of the real page (core.js)
function page(prefs) {
  const ctx = vm.createContext({ console, URLSearchParams, innerWidth: 1440, innerHeight: 900, location: { hash: '', search: '' }, localStorage: { getItem: () => null, setItem() {} }, PREFMSG, Response, fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/core.js'), 'utf8'), ctx, { filename: 'core.js' });
  vm.runInContext('var render = () => {};', ctx);
  vm.runInContext(`ME = { username: 'tester', role: 'qa', prefs: ${JSON.stringify(prefs)} };`, ctx);
  return { run: code => vm.runInContext(code, ctx) };
}
test('a routine confirmation that is switched off runs straight away; one that is on asks first', () => {
  const off = page({ confirm: false });
  off.run("var done = 0; ask('Move?', 'x', () => { done++; }, { id: 'confirm.move-user' });");
  assert.equal(off.run('done'), 1); assert.equal(off.run('CFM'), null);
  const on = page({});
  on.run("var done = 0; ask('Move?', 'x', () => { done++; }, { id: 'confirm.move-user' });");
  assert.equal(on.run('done'), 0); assert.equal(on.run('CFM.id'), 'confirm.move-user');
});
test('safeguards always ask, whatever is switched off', () => {
  const p = page({ info: false, confirm: false, off: { 'confirm.move-user': 'x', 'delete-review': 'x', 'tip.roots': 'x' } });
  for (const id of [undefined, 'delete-review', 'tip.roots', 'welcome', 'made.up']) {     // no id, an unknown id, or an info id passed by mistake
    p.run(`var done = 0; CFM = null; ask('Delete?', 'x', () => { done++; }, { danger: true, id: ${JSON.stringify(id)} });`);
    assert.equal(p.run('done'), 0, 'must not run without asking: ' + id);
    assert.equal(p.run('CFM.title'), 'Delete?');
    assert.equal(p.run('CFM.id'), '', 'no "Don\'t ask me again" on a safeguard: ' + id);
  }
});
test('names with apostrophes, quotes and backslashes are safe inside onclick="..."', () => {
  const p = page({});
  for (const s of ["Agent's tone", 'Say "hello"', 'back\\slash', "x');alert(1);//", '</script><b>']) {
    const attr = p.run(`jsq(${JSON.stringify(s)})`);
    assert.ok(!/["'<>]/.test(attr), 'attribute text has no raw quote or tag: ' + attr);
    const decoded = attr.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));        // what the browser hands to JavaScript
    assert.equal(vm.runInNewContext(decoded), s);
  }
});
test('score colours: pass, below target, low, fail', () => {
  const p = page({});
  p.run('SET = { pass: 85, teams: {} };');
  assert.deepEqual([90, 80, 60, 40].map(v => p.run(`col(${v})`)), ['var(--ok)', 'var(--wn)', 'var(--hot)', 'var(--bad)']);
});
