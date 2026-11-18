// Phase 6's demo data in v2's demo company: today's demo Knowledge Base (3 folders, 4 short articles, one lesson test),
// so the Learning app has something to read. The content fits any industry. Added once (while the demo company has no
// folder); only the start file (scripts/dev.ts) adds it, the automatic tests keep their own small demo company.
import { eq } from 'drizzle-orm';
import type { Db } from './client.js';
import { companies, kbArticles, kbFolders, type KbQuiz } from './schema.js';
import { DEMO_COMPANY } from './seed.js';

interface DemoFolder {
  key: string;
  parent: string | null;
  name: string;
  colour: string;
  icon: string;
  description: string;
  reqOn: boolean;
}
const FOLDERS: DemoFolder[] = [
  {
    key: 'onboarding',
    parent: null,
    name: 'Onboarding',
    colour: '#2563eb',
    icon: '📘',
    description: 'Everything a new agent reads in the first week',
    reqOn: true,
  },
  {
    key: 'sales',
    parent: null,
    name: 'Sales skills',
    colour: '#7c3aed',
    icon: '💡',
    description: 'Techniques for better conversations',
    reqOn: false,
  },
  {
    key: 'objections',
    parent: 'sales',
    name: 'Objection handling',
    colour: '#e11d48',
    icon: '🎯',
    description: '',
    reqOn: false,
  },
];

const GREETING_TEST: KbQuiz = {
  pass: 70,
  questions: [
    {
      q: 'What should you say in the first seconds?',
      opts: ['Your name and the company', 'Nothing until the customer speaks', 'The price'],
      a: 0,
      why: 'Introduce yourself and the company.',
    },
    {
      q: 'How should your energy be?',
      opts: ['Always loud', 'Matched to the customer', 'Flat'],
      a: 1,
      why: 'Adapt your tone to the customer.',
    },
  ],
};
const ARTICLES: {
  folder: string;
  title: string;
  topics: string[];
  body: string;
  reqOn: boolean;
  quiz: KbQuiz | null;
}[] = [
  {
    folder: 'onboarding',
    title: 'How to greet a customer',
    topics: ['Greeting & Introduction'],
    body: '## The first 10 seconds\n\nA warm greeting sets the tone for the whole call.\n\n- Smile before you pick up\n- Say your name and the company\n- Ask how you can help\n\n> Tip: match the energy of the customer, calm or upbeat.',
    reqOn: true,
    quiz: GREETING_TEST,
  },
  {
    folder: 'onboarding',
    title: 'Active listening checklist',
    topics: ['Empathy & Active Listening'],
    body: '## Listen first\n\n1. Let the customer finish\n2. Paraphrase the concern\n3. Use reassuring language\n\n**Never interrupt**, even if you know the answer.',
    reqOn: false,
    quiz: null,
  },
  {
    folder: 'objections',
    title: 'Handling "it is too expensive"',
    topics: ['Persuasion & Objection Handling', 'Price'],
    body: '## Steps\n\n1. Acknowledge the concern\n2. Ask what they compare it with\n3. Show the value, not a discount\n4. Confirm the next step\n\nSee also the closing checklist.',
    reqOn: false,
    quiz: null,
  },
  {
    folder: 'sales',
    title: 'Closing the call well',
    topics: ['Closing & Positive Outcome'],
    body: '## Closing\n\n- Recap what was agreed\n- Confirm the next contact\n- Thank the customer\n\n**Always** document the call.',
    reqOn: false,
    quiz: null,
  },
];

/** Adds the demo Knowledge Base; returns how many articles it added (0: already there). */
export async function seedDemoKnowledge(owner: Db): Promise<number> {
  return owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) return 0;
    const any = await tx.select({ id: kbFolders.id }).from(kbFolders).where(eq(kbFolders.companyId, demo.id)).limit(1);
    if (any.length) return 0;
    const ids = new Map<string, string>();
    for (const f of FOLDERS) {
      const [row] = await tx
        .insert(kbFolders)
        .values({
          companyId: demo.id,
          parentId: f.parent ? (ids.get(f.parent) ?? null) : null,
          name: f.name,
          colour: f.colour,
          icon: f.icon,
          description: f.description,
          reqOn: f.reqOn,
          byName: 'Ada Admin',
        })
        .returning({ id: kbFolders.id });
      if (row) ids.set(f.key, row.id);
    }
    for (const a of ARTICLES)
      await tx.insert(kbArticles).values({
        companyId: demo.id,
        folderId: ids.get(a.folder) ?? null,
        title: a.title,
        topics: a.topics,
        body: a.body,
        reqOn: a.reqOn,
        quiz: a.quiz,
        authorName: 'Ada Admin',
      });
    return ARTICLES.length;
  });
}
