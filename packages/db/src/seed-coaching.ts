// Phase 4's demo data in v2's demo company: a few made-up tasks (one overdue, one in review, one target, some done),
// coaching sessions (individual, group, a planned training) and one-to-ones (last month's, signed, with objectives; this
// month's signed, waiting for the agent and a draft), with a form template "Monthly one-to-one". Dates follow today, so
// the Dashboard, Calendar, Agents page and Coaching always have something current to show. The content fits any
// industry. Added once (while the demo company has no template of that name); only the start file (scripts/dev.ts)
// adds it, the automatic tests keep their own small demo company.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  coachingSessions,
  companies,
  memberships,
  type OneToOneSection,
  oneToOneTemplates,
  type SessionAction,
  type SessionSignature,
  tasks,
  teams,
  users,
} from './schema.js';
import { DEMO_COMPANY } from './seed.js';

const TEMPLATE = 'Monthly one-to-one';
const day = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const at = (n: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const SECTIONS: OneToOneSection[] = [
  { id: 'str', type: 'text', title: 'Strengths', items: [], cols: [], units: [] },
  { id: 'imp', type: 'text', title: 'Areas for improvement', items: [], cols: [], units: [] },
  {
    id: 'kpi',
    type: 'metrics',
    title: 'Numbers',
    items: ['Quality score', 'Contacts per day'],
    cols: [],
    units: ['%', ''],
  },
  {
    id: 'rate',
    type: 'rating',
    title: 'How the month went',
    items: ['Customer focus', 'Teamwork'],
    cols: [],
    units: [],
  },
  { id: 'obj', type: 'objectives', title: 'Objectives for the next period', items: [], cols: [], units: [] },
  { id: 'acm', type: 'text', title: 'Agent comments', items: [], cols: [], units: [] },
  {
    id: 'agr',
    type: 'agree',
    title: 'Agreement',
    items: [
      'I have read and understood everything we discussed.',
      'I commit to the objectives and the action plan agreed in this one-to-one.',
    ],
    cols: [],
    units: [],
  },
];

interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  teamId: string | null;
  teamName: string;
}

/** Adds the demo tasks, coaching sessions and one-to-ones; returns how many rows it added (0: already there). */
export async function seedDemoCoaching(owner: Db): Promise<number> {
  return owner.transaction(async (tx) => {
    const [demo] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, DEMO_COMPANY));
    if (!demo) return 0;
    const companyId = demo.id;
    const [done] = await tx
      .select({ id: oneToOneTemplates.id })
      .from(oneToOneTemplates)
      .where(and(eq(oneToOneTemplates.companyId, companyId), eq(oneToOneTemplates.name, TEMPLATE)));
    if (done) return 0;

    const people: Person[] = (
      await tx
        .select({
          id: memberships.id,
          name: users.name,
          email: users.email,
          role: memberships.role,
          teamId: memberships.teamId,
          teamName: teams.name,
          active: memberships.active,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(teams, eq(teams.id, memberships.teamId))
        .where(eq(memberships.companyId, companyId))
    )
      .filter((p) => p.active)
      .map((p) => ({ ...p, name: p.name ?? p.email, teamName: p.teamName ?? '' }));
    const byName = (name: string) => people.find((p) => p.name === name);
    const lead = people.find((p) => p.email === 'lead@demo.test');
    const reviewer = people.find((p) => p.email === 'reviewer@demo.test');
    const agents = people.filter((p) => p.role === 'agent');
    if (!lead || !reviewer || agents.length < 4) return 0;
    const pick = (name: string) => byName(name) ?? agents[0];
    let added = 0;

    // ---- tasks
    const task = async (
      to: Person | undefined,
      by: Person,
      values: Partial<typeof tasks.$inferInsert> & { title: string },
    ) => {
      if (!to) return;
      await tx.insert(tasks).values({
        companyId,
        groupId: randomUUID(),
        assigneeId: to.id,
        assigneeName: to.name,
        teamId: to.teamId,
        teamName: to.teamName,
        byId: by.id,
        byName: by.name,
        createdAt: at(-6, 9),
        history: [{ at: at(-6, 9).toISOString(), byName: by.name, action: 'given' }],
        ...values,
      });
      added++;
    };
    await task(pick('Alex Agent'), lead, {
      title: 'Listen to two of your calls with your team lead',
      description: 'Pick one call that went well and one that was hard.',
      status: 'doing',
      points: 5,
      startOn: day(-2),
      dueOn: day(3),
      startedAt: at(-1),
      steps: [
        { text: 'Choose the two calls', minutes: 10, done: true },
        { text: 'Listen together and write three takeaways', minutes: 30, done: false },
      ],
    });
    await task(pick('Alex Agent'), reviewer, {
      title: 'Read the updated returns policy',
      priority: 'high',
      points: 3,
      dueOn: day(-2),
    });
    await task(pick('Ana Costa'), lead, {
      title: 'Practise the value-first answer on 5 contacts',
      status: 'review',
      needsReview: true,
      points: 5,
      dueOn: day(1),
      startedAt: at(-3),
      sentAt: at(-1, 16),
    });
    await task(pick('Chloé Martin'), lead, {
      title: 'Update your customer notes',
      status: 'done',
      points: 5,
      dueOn: day(-1),
      startedAt: at(-4),
      completedAt: at(-3, 15),
    });
    await task(pick('Jonas Weber'), lead, {
      title: 'Monthly target: 90% quality score',
      kind: 'target',
      priority: 'high',
      points: 10,
      dueOn: day(18),
    });
    await task(pick('Mira Stoyanova'), reviewer, {
      title: 'Share one win with your team',
      status: 'done',
      points: 2,
      dueOn: day(0),
      completedAt: at(-1, 17),
    });
    await task(pick('Petar Iliev'), lead, {
      title: 'Close this week’s open cases',
      status: 'doing',
      points: 3,
      dueOn: day(0),
      startedAt: at(-1),
    });

    // ---- coaching sessions
    const agentOf = (p: Person) => ({ id: p.id, name: p.name, teamId: p.teamId, teamName: p.teamName });
    const action = (owner: Person, text: string, dueOn: string | null, done = false): SessionAction => ({
      text,
      ownerId: owner.id,
      ownerName: owner.name,
      dueOn,
      done,
      taskId: null,
    });
    const sign = (n: number, comment = '', inPerson = false): SessionSignature => ({
      at: at(n, 15).toISOString(),
      comment,
      ...(inPerson ? { inPerson: true } : {}),
    });
    const ana = pick('Ana Costa');
    const chloe = pick('Chloé Martin');
    const jonas = pick('Jonas Weber');
    const nina = pick('Nina Rowe');
    const petar = pick('Petar Iliev');
    const petra = pick('Petra Test');
    if (ana && chloe && jonas && nina && petar && petra) {
      await tx.insert(coachingSessions).values([
        {
          companyId,
          kind: 'coaching',
          heldOn: day(-6),
          title: 'Handling objections with value first',
          agents: [agentOf(ana)],
          focus: ['Persuasion & Objection Handling'],
          topics: ['price questions'],
          goals: 'Answer the price question with the value for the customer first.',
          notes: 'Listened to two contacts together; the second one was much stronger.',
          followUpOn: day(8),
          actions: [
            action(ana, 'Practise the value-first answer on 5 contacts', day(1)),
            action(ana, 'Write down three value phrases that work', day(-2), true),
          ],
          signatures: { [ana.id]: sign(-5, 'Very useful, thank you.') },
          byId: reviewer.id,
          byName: reviewer.name,
          createdAt: at(-6, 14),
        },
        {
          companyId,
          kind: 'group',
          heldOn: day(-3),
          title: 'Closing the contact well',
          agents: [chloe, jonas, nina].map(agentOf),
          focus: ['Closing & Positive Outcome'],
          topics: ['summary', 'next steps'],
          goals: 'End every contact with a short summary and a clear next step.',
          notes: 'Role play in pairs, then the best closings shared with the group.',
          actions: [action(chloe, 'Share your best closing line with the team', day(4))],
          signatures: { [chloe.id]: sign(-2) },
          byId: reviewer.id,
          byName: reviewer.name,
          createdAt: at(-3, 14),
        },
        {
          companyId,
          kind: 'training',
          status: 'planned',
          heldOn: day(5),
          title: 'New colleague training: our tools',
          agents: [petar, petra].map(agentOf),
          topics: ['tools', 'notes'],
          goals: 'Know where to find answers and how to write good customer notes.',
          byId: reviewer.id,
          byName: reviewer.name,
          createdAt: at(-1, 11),
        },
      ]);
      added += 3;
    }

    // ---- the form template and the one-to-ones (written by the team lead)
    const agentTeams = [...new Set(agents.map((a) => a.teamId).filter((x): x is string => !!x))];
    const [template] = await tx
      .insert(oneToOneTemplates)
      .values({ companyId, name: TEMPLATE, teamIds: agentTeams, sections: SECTIONS, byId: lead.id, byName: lead.name })
      .returning({ id: oneToOneTemplates.id });
    added++;
    const o2o = async (
      a: Person | undefined,
      n: number,
      state: 'draft' | 'sent' | 'signed',
      text: { strengths: string; improve: string; objectives: { text: string; dueOn: string; done?: boolean }[] },
      signed?: SessionSignature,
    ) => {
      if (!a) return;
      await tx.insert(coachingSessions).values({
        companyId,
        kind: 'o2o',
        heldOn: day(n),
        title: TEMPLATE,
        status: state === 'draft' ? 'planned' : 'done',
        agents: [agentOf(a)],
        actions: text.objectives.map((o) => action(a, o.text, o.dueOn, o.done)),
        signatures: signed ? { [a.id]: signed } : {},
        templateId: template?.id ?? null,
        period: 'month',
        sections: SECTIONS,
        answers: {
          str: text.strengths,
          imp: text.improve,
          kpi: { 0: 84 + (n % 7), 1: 38 + (n % 5) },
          rate: { 0: 4, 1: 5 },
          obj: text.objectives.map((o) => ({ text: o.text, dueOn: o.dueOn })),
        },
        state,
        leadSignature: state === 'draft' ? null : { at: at(n, 11).toISOString(), id: lead.id, name: lead.name },
        sentAt: state === 'draft' ? null : at(n, 11),
        byId: lead.id,
        byName: lead.name,
        createdAt: at(n, 10),
      });
      added++;
    };
    // last month: signed, with objectives (some done), so this month's form shows "the objectives of the last one"
    await o2o(
      pick('Alex Agent'),
      -30,
      'signed',
      {
        strengths: 'Friendly and patient, also with difficult customers.',
        improve: 'Closing: end with a clear next step.',
        objectives: [
          { text: 'End every contact with a summary', dueOn: day(-10), done: true },
          { text: 'Use the knowledge base before asking a colleague', dueOn: day(-5) },
        ],
      },
      sign(-29, 'Agreed.'),
    );
    await o2o(
      ana,
      -31,
      'signed',
      {
        strengths: 'Very good product knowledge.',
        improve: 'Price questions: lead with the value.',
        objectives: [{ text: 'Join a coaching session on objections', dueOn: day(-8), done: true }],
      },
      sign(-31, '', true),
    );
    await o2o(
      chloe,
      -29,
      'signed',
      {
        strengths: 'Clear notes; colleagues can pick up her cases easily.',
        improve: 'Keep contacts a little shorter.',
        objectives: [{ text: 'Average handling time under 6 minutes', dueOn: day(-3), done: true }],
      },
      sign(-29),
    );
    // this month
    await o2o(
      pick('Mira Stoyanova'),
      -4,
      'signed',
      {
        strengths: 'Helped two new colleagues this month.',
        improve: 'Greeting: say the company name every time.',
        objectives: [{ text: 'Greeting with the company name on every contact', dueOn: day(20) }],
      },
      sign(-3, 'Thank you for the support.'),
    );
    await o2o(pick('Omar Haddad'), -1, 'sent', {
      strengths: 'Calm and reliable on busy days.',
      improve: 'Check the customer history before answering.',
      objectives: [{ text: 'Read the customer history first on every contact', dueOn: day(25) }],
    });
    await o2o(pick('Lukas Brandt'), 0, 'draft', {
      strengths: 'Quick learner.',
      improve: '',
      objectives: [],
    });
    return added;
  });
}
