// Turns today's demo reviews (current-app/data.json) into v2's demo reviews (packages/db/demo/reviews.json), once:
//   node scripts/make-demo-reviews.ts
// - The same reviews, answers, comments, root causes, flags, "seen" and disputes, so v2's dashboards can be compared
//   with today's side by side.
// - Made-up people: v2's demo company is made up (it will be shown to clients), so each of today's agents becomes one
//   made-up agent, and each of today's reviewers one of v2's demo reviewers. Counts per person stay the same.
// - Only the answers are kept, not the questions: v2 scores each review again with today's two demo scorecards,
//   which v2's demo company already has (a test checks every score against today's).
import { readFileSync, writeFileSync } from 'node:fs';

interface TodayItem {
  t: string;
  k?: boolean;
  a: 'y' | 'n' | 'na';
  cm?: string;
  rc?: string;
}
interface TodayReview {
  id: string;
  agent: string;
  tid: string;
  d: string;
  sc: number;
  scid: string;
  ch?: string;
  cp?: string;
  cm?: string;
  fl?: string;
  rv?: string;
  seen?: boolean;
  cs: { n: string; k?: boolean; it: TodayItem[] }[];
  dp?: {
    status: string;
    at: string;
    msgs: { r: string; sys?: number; t: string; at: string }[];
    res?: { outcome: string; note?: string; at: string };
  };
}
const today = JSON.parse(readFileSync(new URL('../current-app/data.json', import.meta.url), 'utf8')) as {
  evaluations: TodayReview[];
  users: { username: string; team: string }[];
  scorecards: { id: string; name: string; cats: { k?: boolean; it: { k?: boolean }[] }[] }[];
};

/** Made-up agents, one per agent of today's demo data, in the order they first appear. */
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
/** Today's reviewers become v2's demo reviewers: the demo admin and reviewer, and two more made-up reviewers. */
const REVIEWERS: Record<string, { name: string; email: string }> = {
  'Gabriela Georgieva': { name: 'Ada Admin', email: 'admin@demo.test' },
  'Gabriela Nikolova': { name: 'Rita Reviewer', email: 'reviewer@demo.test' },
  'Marc Duval': { name: 'Mila Novak', email: 'mila.novak@demo.test' },
  'Lena Hart': { name: 'Theo Grant', email: 'theo.grant@demo.test' },
};
const TEAMS: Record<string, string> = { 't-b2c': 'B2C', 't-b2b': 'B2B', 't-support': 'Support' };
const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.');

const agentIds = [...new Set(today.evaluations.map((e) => e.agent))];
if (agentIds.length > AGENT_NAMES.length) throw new Error(`More agents than made-up names: ${agentIds.length}`);
const agents = agentIds.map((username, i) => {
  const name = AGENT_NAMES[i] as string;
  const team = TEAMS[today.users.find((u) => u.username === username)?.team ?? ''] ?? 'Support';
  return { name, email: `${slug(name)}@demo.test`, team };
});
const reviewerNames = [...new Set(today.evaluations.map((e) => e.rv ?? ''))];
for (const name of reviewerNames) if (!REVIEWERS[name]) throw new Error(`No demo reviewer for "${name}"`);
const reviewers = Object.values(REVIEWERS);
const cardName = (id: string) => today.scorecards.find((s) => s.id === id)?.name ?? '';

const reviews = today.evaluations.map((e) => {
  const items = e.cs.flatMap((c) => c.it);
  const notes: Record<number, string> = {};
  const causes: Record<number, string> = {};
  items.forEach((q, i) => {
    if (q.cm) notes[i] = q.cm;
    if (q.rc) causes[i] = q.rc;
  });
  // the critical settings the review was scored with, when they differ from the scorecard's today (152 reviews were
  // made before the scorecards' critical items changed)
  const card = today.scorecards.find((c) => c.id === e.scid);
  const flags = (cats: { k?: boolean; it: { k?: boolean }[] }[]) => ({
    categories: cats.map((c) => (c.k ? '1' : '0')).join(''),
    questions: cats.flatMap((c) => c.it.map((q) => (q.k ? '1' : '0'))).join(''),
  });
  const own = flags(e.cs);
  const now = card ? flags(card.cats) : own;
  const critical = own.categories !== now.categories || own.questions !== now.questions ? own : null;
  const reviewer = reviewers.indexOf(REVIEWERS[e.rv ?? ''] as { name: string; email: string });
  return {
    lead: e.id,
    agent: agentIds.indexOf(e.agent),
    reviewer,
    team: TEAMS[e.tid] ?? 'Support',
    day: e.d.slice(0, 10),
    at: e.d,
    channel: e.ch ?? 'call',
    card: cardName(e.scid),
    campaign: e.cp ?? '',
    answers: items.map((q) => (q.a === 'na' ? 'a' : q.a)).join(''),
    ...(critical ? { critical } : {}),
    ...(Object.keys(notes).length ? { notes } : {}),
    ...(Object.keys(causes).length ? { causes } : {}),
    comment: e.cm ?? '',
    flag: e.fl ?? '',
    seen: Boolean(e.seen),
    /** today's score, so a test can check v2 scores the review the same */
    score: e.sc,
    ...(e.dp
      ? {
          dispute: {
            openedAt: e.dp.at,
            outcome: e.dp.status === 'resolved' ? (e.dp.res?.outcome ?? 'kept') : null,
            note: e.dp.res?.note ?? '',
            resolvedAt: e.dp.status === 'resolved' ? (e.dp.res?.at ?? null) : null,
            // who wrote: the agent, or the review's reviewer; the closing line becomes v2's own closing message
            messages: e.dp.msgs
              .filter((m) => !m.sys)
              .map((m) => ({ by: m.r === 'agent' ? 'agent' : 'reviewer', text: m.t, at: m.at })),
          },
        }
      : {}),
  };
});

const out = { source: 'current-app/data.json (today’s demo data), with made-up people', agents, reviewers, reviews };
// one review per line: small, and easy to read in a diff
const lines = [
  '{',
  `"source": ${JSON.stringify(out.source)},`,
  `"agents": ${JSON.stringify(agents)},`,
  `"reviewers": ${JSON.stringify(reviewers)},`,
  '"reviews": [',
  reviews.map((r) => JSON.stringify(r)).join(',\n'),
  ']',
  '}',
];
writeFileSync(new URL('../packages/db/demo/reviews.json', import.meta.url), `${lines.join('\n')}\n`);
console.log(`${reviews.length} reviews of ${agents.length} made-up agents and ${reviewers.length} reviewers written.`);
