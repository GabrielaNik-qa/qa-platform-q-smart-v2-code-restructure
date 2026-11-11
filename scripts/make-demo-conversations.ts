// Turns the transcripts of today's demo reviews (current-app/data.json) into v2's demo conversations
// (packages/db/demo/conversations.json), once:
//   node scripts/make-demo-conversations.ts
// - One conversation per demo review that has a transcript (chats, e-mails and other channels), linked to its review
//   by the lead ID, so AutoQA can later compare its score with the reviewer's.
// - Made-up people only: today's agents' real first names (in greetings and e-mail signatures) become the first names
//   of the made-up agents who now have those reviews (scripts/make-demo-reviews.ts, the same order). The script stops
//   if any real name is left.
import { readFileSync, writeFileSync } from 'node:fs';

interface TodayReview {
  id: string;
  agent: string;
  d: string;
  ch?: string;
  chn?: string;
  cl?: string;
  tx?: string;
  subj?: string;
}
const today = JSON.parse(readFileSync(new URL('../current-app/data.json', import.meta.url), 'utf8')) as {
  evaluations: TodayReview[];
  users: { username: string; name?: string }[];
};
/** The same made-up agents as scripts/make-demo-reviews.ts, in the same order. */
const AGENT_NAMES = [
  'Nina Rowe',
  'Omar Haddad',
  'Chloé Martin',
  'Lukas Brandt',
  'Ana Costa',
  'Petar Iliev',
  'Sara Lindqvist',
  'Tom Becker',
  'Mira Stoyanova',
  'Jonas Weber',
];
const agentIds = [...new Set(today.evaluations.map((e) => e.agent))];
const firstName = (name: string) => name.split(' ')[0] ?? name;
/** today's real first name → the made-up first name, for every agent of today's demo data */
const renames = agentIds.map((username, i) => ({
  real: firstName(today.users.find((u) => u.username === username)?.name ?? username),
  madeUp: firstName(AGENT_NAMES[i] ?? 'Alex'),
}));
/**
 * Universal wording (11 November): Q-smart is for every industry, so the demo doesn't read like one. Today's few
 * gaming words become everyday shop words, with the same meaning for the review.
 */
const NEUTRAL: [RegExp, string][] = [
  [/one more qualifying deposit\. Once it is made/g, 'one more qualifying order. Once it is placed'],
  [/my last deposit/g, 'my last payment'],
  [/\bwithdrawal\b/g, 'refund'],
  [/\bBonus\b/g, 'Discount'],
  [/\bbonus\b/g, 'discount'],
];
const neutral = (text: string) => NEUTRAL.reduce((t, [from, to]) => t.replace(from, to), text);
const rename = (text: string) =>
  neutral(
    renames.reduce((t, r) => (r.real.length > 2 ? t.replace(new RegExp(`\\b${r.real}\\b`, 'g'), r.madeUp) : t), text),
  );

const conversations = today.evaluations
  .filter((e) => e.tx)
  .map((e) => ({
    lead: e.id,
    at: e.d,
    channel: e.ch === 'chat' || e.ch === 'email' ? e.ch : 'other',
    channelName: e.ch === 'other' ? (e.chn ?? '') : '',
    subject: rename(e.subj ?? ''),
    link: e.cl ?? '',
    text: rename(e.tx ?? ''),
  }));

const all = JSON.stringify(conversations);
const left = renames.filter((r) => r.real.length > 2 && new RegExp(`\\b${r.real}\\b`).test(all));
if (left.length) throw new Error(`Real names left: ${left.map((r) => r.real).join(', ')}`);
const industry = /\b(bonus|deposit|withdraw\w*|casino|wager\w*|jackpot|gambl\w*|bets?|betting|spins|slots?)\b/i.exec(
  all,
);
if (industry) throw new Error(`An industry word is left: ${industry[0]}`);
writeFileSync(
  new URL('../packages/db/demo/conversations.json', import.meta.url),
  `${JSON.stringify(conversations, null, 1)}\n`,
);
console.log(`${conversations.length} demo conversations written`);
