// The messages the SERVER sends (errors shown in a toast, notifications in the bell) are translated on the page too
// (docs/i18n-glossary.md). Round 4 found 96 of them without a Bulgarian or French translation; this test keeps it at 0:
// every fixed message found in the server files, and real examples of the messages with values, must have both.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..'), JS = path.join(ROOT, 'public', 'js');
global.window = global.window || {};
if (!window.I18N) { require(path.join(JS, 'i18n.js')); }
global.I18N = window.I18N;
require(path.join(JS, 'i18n', 'bg.js')); require(path.join(JS, 'i18n', 'fr.js'));

// bad(res, '…'), { error: '…' }, new Error('…') and notify(…, 'type', '…'): only fixed texts (no ${…} and not a piece of a longer text)
function fixedMessages() {
  const out = new Map();
  for (const f of fs.readdirSync(ROOT).filter(f => /^(server|routes-.*|ai|wf|cap|autoqa|scorecard)\.js$/.test(f))) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?:bad\(res,\s*|error:\s*|new Error\(|notify\([^,]+,[^,]+,\s*'[a-z]+',\s*)'((?:\\.|[^'\\])*)'(\s*\+)?/g)) {
      const s = m[1].replace(/\\'/g, "'");
      if (m[2] || !/[a-z]{3}/.test(s) || /^[a-z_]+$/.test(s) && !s.includes(' ')) continue;   // "x" + value: a piece; "not_found": a code, not a message
      out.set(s, f + ':' + src.slice(0, m.index).split('\n').length);
    }
  }
  return out;
}
test('every fixed message of the server has a Bulgarian and a French translation', () => {
  const all = fixedMessages(), missing = [];
  assert.ok(all.size > 200, 'found ' + all.size + ' messages');   // 249 in round 4
  for (const [s, where] of all) for (const l of ['bg', 'fr']) if (I18N.tr(s, l) === s) missing.push(`${l} ${where} ${s}`);
  assert.deepEqual(missing, [], 'without a translation');
});
// real examples of the messages with values (the values are made up)
const EXAMPLES = [
  'You checked in 12 minutes late: 4 late arrivals this month (allowed: 3).', 'Ana Petrova checked in 12 minutes late: 4 late arrivals this week (allowed: 3).',
  'Corrections are possible up to 7 days back. Ask your team lead.', 'Ana Petrova gave you kudos 🏆: thanks for the help', 'Ana Petrova gave you kudos: thanks',
  'Ana Petrova started an improvement plan with you: Closing', 'Ana Petrova assigned a risk case to you: Missing calls', 'A task was assigned to you: Listen to 3 calls',
  'Your one-to-one with Ana Petrova is ready: read it and sign', 'Ana Petrova signed the one-to-one: October', 'Ana Petrova signed the session: Coaching',
  'Ana Petrova gave you a red flag for Lead #123: rude', 'Ana Petrova gave you a green flag for Lead #55', 'You received a new call review for Lead #123 (score 92%)',
  'You received a new chat review for Lead #123 (score 92%)', 'You received a new email review for Lead #9 (score 70%)', 'You received a new conversation review for Lead #9 (score 70%)',
  'Your review for Lead #123 was updated (score 80%)', 'Your dispute for Lead #123 was resolved: score kept', 'Your dispute for Lead #123 was resolved: score changed',
  'Your dispute for Lead #123 was resolved: score partly changed', 'Total points must equal 100 (currently 90)', 'Category "Greeting" needs at least one item',
  'The AI service answered with an error (500). Try again later.', 'Not enough left: 2 days in 2026', 'Ana Petrova asks for time off: Annual leave, 2026-11-04 (1 d)',
  'Your time off was approved: Annual leave, 2026-11-04 (1 d)', 'Ana Petrova asks to correct the attendance of 2026-10-27: Forgot to check in',
  'Your correction of 2026-10-27 was approved', 'Ana Petrova has not checked in yet (shift from 09:00)', 'Morning brief for B2B is ready', 'Weekly AI summary ready: B2B',
  'Your leads for 2026-11 are ready: 120 leads from 2026-11-03', 'Ana Petrova corrected your attendance of 2026-10-27: late bus',
  'The username a.petrova already exists. Please contact the administrator.', 'That employee ID is already used by Ana Petrova'
];
test('the messages with values (notifications, limits) are translated, and the values are kept', () => {
  const missing = [];
  for (const s of EXAMPLES) for (const l of ['bg', 'fr']) { const t = I18N.tr(s, l); if (t === s) missing.push(l + ' ' + s); else for (const v of (s.match(/\d{2,}|Ana Petrova|B2B/g) || [])) if (!t.includes(v)) missing.push(`${l} lost "${v}": ${t}`); }
  assert.deepEqual(missing, [], 'without a translation, or a value lost');
});
