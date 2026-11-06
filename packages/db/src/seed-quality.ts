// The demo company's quality set-up: today's demo scorecards, categories library and root causes
// (current-app/data.json, 6 November), in v2's form. Made up, like all demo data.
import type { ScorecardCategory, ScorecardQuestion } from '@qsmart/shared';

export const DEMO_SCORECARDS: { name: string; description: string; tags: string[]; categories: ScorecardCategory[] }[] =
  [
    {
      name: 'Standard Scorecard - 7 categories',
      description: 'Evaluation criteria for sales and support calls',
      tags: ['Calls'],
      categories: [
        {
          name: 'Greeting & Introduction',
          critical: false,
          questions: [
            {
              text: 'Greeted the customer warmly and introduced themselves and the company',
              points: 6,
              critical: false,
              compliance: false,
            },
            {
              text: "Adapted tone and energy to the customer's mood (calm, serious, upbeat)",
              points: 4,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Vocabulary & Professionalism',
          critical: false,
          questions: [
            {
              text: 'Used clear, respectful language with no jargon, slang or banned phrases',
              points: 6,
              critical: false,
              compliance: false,
            },
            {
              text: "Acknowledged the customer's recent activity or good news in a genuine way",
              points: 7,
              critical: false,
              compliance: false,
            },
            {
              text: 'Asked open questions to understand what the customer wants',
              points: 7,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Empathy & Active Listening',
          critical: false,
          questions: [
            {
              text: 'Listened without interrupting and gave the customer space to speak',
              points: 5,
              critical: false,
              compliance: false,
            },
            {
              text: "Used empathetic, reassuring language and paraphrased the customer's concerns",
              points: 6,
              critical: false,
              compliance: false,
            },
            {
              text: 'Handled sensitive situations with care',
              points: 4,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Documentation & Reasoning',
          critical: false,
          questions: [
            {
              text: 'Selected the correct disposition status in the CRM',
              points: 5,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Process Adherence',
          critical: false,
          questions: [
            {
              text: 'Sent the follow-up SMS or email required by the workflow',
              points: 7,
              critical: true,
              compliance: false,
            },
            {
              text: 'Confirmed the correct offer was set up before the call',
              points: 7,
              critical: false,
              compliance: false,
            },
            {
              text: 'Confirmed the next step clearly before ending the call',
              points: 6,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Persuasion & Objection Handling',
          critical: false,
          questions: [
            {
              text: "Explored the customer's interest in continuing and framed a clear next opportunity",
              points: 7,
              critical: false,
              compliance: false,
            },
            {
              text: 'Stayed calm and encouraging when the customer hesitated; handled objections professionally',
              points: 7,
              critical: false,
              compliance: false,
            },
            {
              text: 'Suggested a suitable alternative and confirmed when the next conversation would take place',
              points: 6,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Closing & Positive Outcome',
          critical: true,
          questions: [
            {
              text: 'Closed the call politely and encouraged further engagement',
              points: 6,
              critical: false,
              compliance: false,
            },
            {
              text: 'Recapped the actions taken or agreed during the call when needed',
              points: 4,
              critical: false,
              compliance: false,
            },
          ],
        },
      ],
    },
    {
      name: 'Written Conversations - Chat, Email & Messaging',
      description: 'For chats, e-mails and messaging apps (WhatsApp, SMS, Messenger)',
      tags: ['Chats', 'Emails', 'Other'],
      categories: [
        {
          name: 'Greeting & Introduction',
          critical: false,
          questions: [
            {
              text: 'Greeted the customer by name and introduced themselves',
              points: 5,
              critical: false,
              compliance: false,
            },
            {
              text: 'Used a friendly, professional tone throughout',
              points: 5,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Empathy & Active Listening',
          critical: false,
          questions: [
            {
              text: 'Read the whole message before answering',
              points: 8,
              critical: false,
              compliance: false,
            },
            {
              text: 'Asked a clarifying question when something was unclear',
              points: 7,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Persuasion & Objection Handling',
          critical: false,
          questions: [
            {
              text: 'Gave correct and complete information',
              points: 15,
              critical: true,
              compliance: false,
            },
            {
              text: 'Solved the issue or explained the next steps clearly',
              points: 15,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Vocabulary & Professionalism',
          critical: false,
          questions: [
            {
              text: 'Correct spelling and grammar',
              points: 10,
              critical: false,
              compliance: false,
            },
            {
              text: 'Short, clear sentences and a well-structured message',
              points: 10,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Process Adherence',
          critical: false,
          questions: [
            {
              text: 'Replied within the expected response time',
              points: 10,
              critical: false,
              compliance: false,
            },
          ],
        },
        {
          name: 'Documentation & Reasoning',
          critical: false,
          questions: [
            {
              text: 'Verified the identity of the customer before sharing account details',
              points: 10,
              critical: true,
              compliance: true,
            },
          ],
        },
        {
          name: 'Closing & Positive Outcome',
          critical: false,
          questions: [
            {
              text: 'Offered further help and closed the conversation politely',
              points: 5,
              critical: false,
              compliance: false,
            },
          ],
        },
      ],
    },
  ];

export const DEMO_LIBRARY: {
  name: string;
  description: string;
  critical: boolean;
  questions: ScorecardQuestion[];
  active: boolean;
}[] = [
  {
    name: 'Greeting & Introduction',
    description: '',
    critical: false,
    questions: [
      {
        text: 'Greeted the customer warmly and introduced themselves and the company',
        points: 6,
        critical: false,
        compliance: false,
      },
      {
        text: "Adapted tone and energy to the customer's mood (calm, serious, upbeat)",
        points: 4,
        critical: false,
        compliance: false,
      },
    ],
    active: true,
  },
  {
    name: 'Vocabulary & Professionalism',
    description: '',
    critical: false,
    questions: [
      {
        text: 'Used clear, respectful language with no jargon, slang or banned phrases',
        points: 6,
        critical: false,
        compliance: false,
      },
      {
        text: "Acknowledged the customer's recent activity or good news in a genuine way",
        points: 7,
        critical: false,
        compliance: false,
      },
      {
        text: 'Asked open questions to understand what the customer wants',
        points: 7,
        critical: false,
        compliance: false,
      },
    ],
    active: true,
  },
  {
    name: 'Empathy & Active Listening',
    description: '',
    critical: false,
    questions: [
      {
        text: 'Listened without interrupting and gave the customer space to speak',
        points: 5,
        critical: false,
        compliance: false,
      },
      {
        text: "Used empathetic, reassuring language and paraphrased the customer's concerns",
        points: 6,
        critical: false,
        compliance: false,
      },
      {
        text: 'Handled sensitive situations with care',
        points: 4,
        critical: false,
        compliance: false,
      },
    ],
    active: true,
  },
  {
    name: 'Documentation & Reasoning',
    description: '',
    critical: false,
    questions: [
      {
        text: 'Selected the correct disposition status in the CRM',
        points: 5,
        critical: false,
        compliance: false,
      },
    ],
    active: true,
  },
  {
    name: 'Process Adherence',
    description: '',
    critical: false,
    questions: [
      {
        text: 'Sent the follow-up SMS or email required by the workflow',
        points: 7,
        critical: true,
        compliance: false,
      },
      {
        text: 'Confirmed the correct offer was set up before the call',
        points: 7,
        critical: false,
        compliance: false,
      },
      {
        text: 'Confirmed the next step clearly before ending the call',
        points: 6,
        critical: false,
        compliance: false,
      },
    ],
    active: true,
  },
  {
    name: 'Persuasion & Objection Handling',
    description: '',
    critical: false,
    questions: [
      {
        text: "Explored the customer's interest in continuing and framed a clear next opportunity",
        points: 7,
        critical: false,
        compliance: false,
      },
      {
        text: 'Stayed calm and encouraging when the customer hesitated; handled objections professionally',
        points: 7,
        critical: false,
        compliance: false,
      },
      {
        text: 'Suggested a suitable alternative and confirmed when the next conversation would take place',
        points: 6,
        critical: false,
        compliance: false,
      },
    ],
    active: true,
  },
  {
    name: 'Closing & Positive Outcome',
    description: '',
    critical: true,
    questions: [
      {
        text: 'Closed the call politely and encouraged further engagement',
        points: 6,
        critical: false,
        compliance: false,
      },
      {
        text: 'Recapped the actions taken or agreed during the call when needed',
        points: 4,
        critical: false,
        compliance: false,
      },
    ],
    active: true,
  },
];

export const DEMO_ROOT_CAUSES: { name: string; description: string; active: boolean }[] = [
  {
    name: 'Knowledge gap',
    description: 'The agent did not know the answer or the product',
    active: true,
  },
  {
    name: 'Process unclear',
    description: 'The process or policy is unclear or was not followed',
    active: true,
  },
  {
    name: 'Tool or system issue',
    description: 'A system problem got in the way',
    active: true,
  },
  {
    name: 'Soft skill',
    description: 'Tone, empathy or listening needs work',
    active: true,
  },
  {
    name: 'Customer behaviour',
    description: "A difficult situation outside the agent's control",
    active: true,
  },
  {
    name: 'Workload / time pressure',
    description: 'The agent was rushed',
    active: true,
  },
];
