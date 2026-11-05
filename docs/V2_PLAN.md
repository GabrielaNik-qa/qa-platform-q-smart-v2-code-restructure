# Q-smart v2: the plan and the architecture

Written on 5 November 2026 by Claude, from our talks of 3–5 November (including your chat with GPT), with all your answers of the same day.
**Status: final draft, reviewed once more on 5 November 2026. Nothing starts before your OK.** Prices were checked on 5 November 2026 (sources at the end).

> **Today's app is the starting point.** Its files are in this repository, and it keeps running on your Cloudflare link until v2 replaces it. What it does, and its ~240 tests, are the checklist for v2. While v2 is being built, the running app gets only urgent fixes and new ideas go on v2's list, so v2 isn't chasing a moving target.

**Contents**
1. In short
2. The decisions
3. The architecture: how the parts fit together
4. How we build it
5. The phases
6. Billing: free until a client pays you
7. The AI engine: many AI companies, the cheapest one that's good enough
8. The MCP server
9. Q Trainer: the AI call simulator
10. Integrations (later)
11. Hosting and addresses
12. Costs
13. What only you can do, and when
14. Open questions
15. Technical appendix
16. Sources

---

## 1. In short

- **One language, TypeScript**, for the pages, the server and the shared rules.
- **A PostgreSQL database in the EU** with a **company wall**: each company can only ever see its own data. The demo has its own database.
- **Firebase** for **sign-in** and for **hosting all the sites** on **free addresses**. No domain to buy.
- **AI from several companies, not just one:** Claude, Gemini, GPT, Mistral and others. For every task, the AI engine uses the cheapest model that passes our quality check, and free models wherever the law allows it.
- **€0 until your first paying client**, the demo's AI included (it runs on free models).
- **Billing with Stripe**: free to set up and free to test. Stripe only takes a small share when a client actually pays you.
- **The MCP server and Q Trainer (the AI call simulator)** have their own phase.
- **A platform owner area** for you, to run Q-smart as a business: create client companies, and see their plans and usage.
- **Call recordings are never stored.** They are played from the client's phone system, and only the text is kept.
- **Integrations come later:** Voiso, Ringover, MMD Smart, Zendesk, Myphoner and Modjo.

## 2. The decisions

| Topic | Decision | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for everything; checked before it runs; today's rules move over with their tests; the biggest group of developers to hire from later |
| Pages | React, same look as today's app (colours, fonts, icons, light/dark, themes) | Ends the long files and the code written straight into the page text; today's design is kept |
| Server | NestJS (TypeScript, organised like Spring Boot), one module per area | A clear structure a future team knows; wakes up in about a second, so the free "sleep when unused" mode works |
| Database | PostgreSQL on Neon (EU). **One shared database for all client companies**, with the company wall, never one database per company. Separate copies exist only for different purposes: the demo (made-up data) and the tests. A big client could pay for its own database one day. (Section 12: "One database or several?") | Free until your first paying client; Q-smart is mostly reports, which SQL does directly; nothing to migrate later |
| Sign-in | Firebase Authentication | Easy, free, run by Google. The accounts are kept in the USA (see section 11) |
| Hosting | Firebase Hosting for the app, the website and the Help Center | Free addresses with HTTPS; no domain needed |
| **AI** | **Several AI companies** behind one AI engine. Each task uses the cheapest model that passes its quality check. Free models are used wherever the law allows it: always for the demo and your own data, and for clients' data only when the AI company's terms forbid using it for itself. A monthly limit per team. *(Replaces "Claude only" of 3 November and "Quinn always on Claude Haiku" of 4 November.)* | Lowest cost, no dependence on one company, and nothing breaks when one of them is down (GPT's advice, your choice of 5 November) |
| Recordings | Never stored; played from the phone system; only the text is kept | Saves storage (a 5-minute call is ~5 MB as audio, ~5 KB as text) and privacy risk |
| Billing | Stripe | Your choice of 4 November; no monthly fee |
| E-mail | Firebase for sign-in e-mails; Brevo for the other e-mails | Both free at the start |
| Integrations | Later: Voiso, Ringover, MMD Smart, Zendesk, Myphoner, Modjo | Your answer of 5 November |
| Where the code lives | The **public** GitHub repository `qa-platform-q-smart-v2-code-restructure` under your account (your decision of 5 November). The work folder is this folder, in OneDrive (your choice of 5 November) | GitHub keeps the safe copy and the history, and its automatic tests are free for public repositories. By your decision of 5 November it holds everything: today's app complete with its data, keys and patent description, and your notes. You'll change the keys after moving to your own PC. New v2 database and Firebase keys stay out, because they will protect clients' data. If OneDrive or the long folder path ever blocks a development tool, the folder can be moved without losing anything |

## 3. The architecture: how the parts fit together

```
 People ─────► qsmart-app.web.app ..... the app's pages ──┐
 Visitors ───► qsmart.web.app ......... official website  ├── Firebase Hosting (free)
          ───► qsmart-help.web.app .... Help Center ──────┘
                        │ /api (the app only)
                        ▼
   Q-smart server (TypeScript) ── Google Cloud Run, Belgium (sleeps when nobody uses it)
     ├── Sign-in check ........ Firebase Authentication
     ├── Modules .............. people · quality · analytics · coaching · learning ·
     │                          workforce · AI · billing · company & governance
     ├── PostgreSQL ........... all company data, behind the company wall ── Neon, EU
     ├── AI engine ............ Claude · Gemini · GPT · Mistral · Groq …: the cheapest
     │                          good-enough model per task · voices · speech-to-text
     ├── MCP server ........... lets AI assistants read Q-smart safely, with a key
     ├── Connectors (later) ... Voiso · Ringover · MMD Smart · Zendesk · Myphoner · Modjo
     ├── Background jobs ...... Cloud Tasks and Cloud Scheduler wake the server when there is work
     ├── Files ................ documents and pictures (never recordings) ── Google Cloud Storage, EU
     └── E-mail · payments .... Firebase and Brevo · Stripe
```

**The parts in plain words**

- **The pages** are what people see in the browser. They only show things and send requests. They never decide who may see what.
- **The server** decides everything: who you are, what your role allows, and which company's data you may touch. It's split into **modules**, one per area of the menu, so a change in Workforce can't break Quality.
- **The database** keeps all the data. The **company wall** is built into the database itself: even if the server made a mistake, one company's rows stay invisible to another. Automatic tests try to break through it on every route.
- **Sign-in** happens in Firebase, which gives the browser a proof of who you are. The server checks that proof on every request, then reads your company, role, teams and workspaces from our own database.
- **The platform owner area** is for you as the owner of Q-smart. You create and manage client companies, see their plans and usage, and switch features on for each company. You can open a company's data for support only with that company's permission, for a limited time, and it's logged.
- **Secrets** (the keys and passwords the server needs) are never in the code. On your PC they live in a private settings file that Git ignores; online, in Google's Secret Manager. Clients' keys (AI companies, Stripe, integrations) are stored encrypted.
- **The AI engine** is the single entrance for all AI: Quinn, AutoQA, the AI team lead, trainer and analyst, and Q Trainer. It works with several AI companies and picks the cheapest model that is good enough for each task. It counts every use against the team's monthly limit, and if one AI company is down, it switches to another (section 7).
- **The MCP server** is a door for outside AI assistants, opened with a key (section 8).
- **Connectors** bring conversations in from phone systems and help desks (section 10).
- **Background jobs** do the slow work (AutoQA, reports, reminders, deleting old transcripts) without making anybody wait. They wake the server only when there is work.
- **Files** (knowledge-base documents, pictures, attachments) go to EU storage. Call recordings never do.

**All clients' data except the sign-in accounts stays in the EU**: the database in Neon's EU region, the server in Belgium, the files in Google's EU storage, and the AI in the EU wherever possible (section 7). Only the demo's made-up data may also go to free AI plans elsewhere.

## 4. How we build it

- **Today's app is the reference.** For every page I look at what today's app does and at its tests. The new page must do the same and pass the same checks. Changes to how things work happen only when you ask.
- **Your decisions carry over.** Everything you decided so far (in `docs/audit/DECISIONS_FOR_YOU.md`) stays decided in v2, unless this plan changes it. The changes are marked in section 2.
- **Small steps.** Each phase is split into small pieces. For every piece: I build it → the automatic tests run → I check it in a browser as every role → **you try it** → I write the release note → it's saved to GitHub.
- **A page counts as done when it:**
  - does everything today's page did,
  - works for every role,
  - has its texts in English, Bulgarian and French,
  - works in light and dark mode and on a phone,
  - can be used with the keyboard and a screen reader (accessibility basics),
  - stays fast with a year of data for 500 agents (measured with today's large made-up data),
  - has automatic tests.
- **Demo data comes over area by area.** When a phase is done, today's demo data for that area is in v2, so you always test with familiar data.
- **Where you test:** on your PC, and shared with others through the Cloudflare link, as today, until Phase 10 puts the app online.
- **Where the work happens:** this folder, `qa-platform-q-smart-v2-code-restructure` (in OneDrive, your choice of 5 November), on the branch of the same name. Finished, tested work goes into `main`. If OneDrive or the long folder path ever blocks a development tool, the folder can be moved: GitHub has everything.
- **Pages that were still "coming soon"** are built in the phase where they belong.

## 5. The phases

Size: S = small, M = medium, L = large, XL = very large.

| Phase | What gets built (today's menu areas and pages) | What you can try at the end | Size |
|---|---|---|---|
| **0. Set-up** | This folder, connected to your GitHub repository, with today's app moved into `current-app/` so v2 can be built next to it; the skeleton of the pages, server, shared rules and database; automatic tests on GitHub; today's design (colours, fonts, icons, light/dark, themes); sign-in with Firebase (first its local test version, then your real project); the company wall; a new CLAUDE.md for v2 | Sign in on your PC with a test account, on a page in Q-smart colours | S |
| **1. Foundation** | Companies and the **platform owner area** (you create and manage client companies) · sign-in (e-mail + password, Google, forgot password, invitation links) · the menu with its panels, menu search, light/dark, themes and three languages · **My account** (profile, password, appearance, language, notifications & confirmations) · **Users, Teams, Workspaces, Skills & languages** · **Roles & permissions** · **Activity log** (all activity, my activity, sign-ins, exports) · the notification bell | Sign in as every role; manage users and teams | L |
| **2. Quality** | **Quality set-up** (scorecards, categories, root causes, system settings and pass rates) · **QA Entry** · **Reviews** (filters, columns, Excel export) · **Quick Flags** · **Disputes** · **Calibration** · **Reviewer QA** · **Pins** | Score a call, flag it and dispute it, as today | L |
| **3. Home & Analytics** | **Dashboard** with widgets and **Personalize** (a view per role) · Getting started · **Agents** (personal dashboards) · **Team Review** · **Category Stats** · Topic dashboards · **Performance** (goals & KPIs, improvement plans, recognition) · **Planning** (review planner, QA workload, calendar) · **Reports** (report builder, saved & scheduled, export centre). The dashboard widgets for tasks, coaching, workforce and AI join in their own phases. | The same numbers as today's app, side by side | XL |
| **4. Coaching & Tasks** | **Coaching** · **One-to-One** · **Tasks** (kanban, timeline, library, sequences) | Plan a coaching session and follow it | M |
| **5. Learning & Tools** | **My Learning** · **Knowledge Base** (like Confluence, folders per team) · **Quizzes** · **Newsletter** · help inside the app (FAQ, videos, tours, glossary) · **Tools** (redaction, translator, sample calculator, score simulator, script builder) | Write an article, take a quiz | L |
| **6. Workforce** | **Team today** · **Attendance** · **Time off** · **Shifts & rota** · **Capacity planning** · **Workforce set-up** (work calendars, shift templates, leave types, attendance rules) · each person's time zone | A day of check-ins and a fair split | L |
| **7. Company & governance** | **Company** (profile, business words, branding, regional settings) · **Messages** (notification rules, e-mail templates, announcements) · sidebar settings · **GDPR** (data protection, records of processing, sub-processors, DPA, recording consent) · **AI Act** (register, human checks, notices) · **Security** (security log, data breaches, API keys) · accessibility · **Compliance & CX** (compliance, risks, complaints, CSAT) · **Data** (backups, import, EU data location) · **Sandbox** · **Beta features** · **Support** (contact support, feature requests, service status, release notes) | Run the company settings as an admin | L |
| **8. AI** | The **AI engine with several AI companies** (section 7): the model choice per task, the quality checks, switching when one company is down, monthly limits per team, the cost per task · **AI settings** (Quinn, AI companies and models, limits, on/off, instructions) · **AI Hub** (overview, AI scores to check, usage and cost, prompt library, feedback) · **AutoQA** and Auto QA categories (AI scores are suggestions for comparison and training, never for evaluating agents, as decided on 3 November) · **Q-Intelligence** (Ask Quinn, insights, spotlight, knowledge) · the **Quinn bubble on every page** for every role, with hand-over to the admins and the agent's team lead, and limits of €10 per company per month and 30 AI answers per person per hour (your decisions of 4 November) · **AI agents** (team lead, trainer, analyst) · **Transcripts** | Ask Quinn and see which model answered and what it cost; run AutoQA on a transcript | XL |
| **9. Q Trainer & MCP server** | **Q Trainer** (dashboard, new simulation, scenarios; text and voice practice; section 9) · the **developer platform**: Developer API with its documentation, **webhooks**, and the **MCP server** (section 8) | A voice practice call scored by the AI; Claude reading Q-smart through MCP | L |
| **10. Billing & going online** | **Billing** with Stripe (plan & seats, usage, invoices, payment method, EU VAT; section 6) · Google Cloud (server and files in the EU; a card on file with limits) · the app on its free Firebase address · **sign-up with a free trial** for new companies · two-step sign-in and Microsoft sign-in · backups and monitoring · the legal pages (privacy, terms, DPA, sub-processors) · an automatic security scan; an independent security test before the first paying client | Q-smart online for anyone you invite, with a test payment | M |
| **11. Website & Help Center** | The official website and the Help Center (Zendesk-style), built with Astro, on their free Firebase addresses | Both sites online | M |

**Three milestones:**
- **A, after Phase 3:** v2 tells the core QA story (people, scoring, disputes, dashboards and reports). It can replace today's app for demos.
- **B, after Phase 9:** all the AI (Quinn, AutoQA, the AI agents, Q Trainer) and the MCP server.
- **C, after Phase 10:** online, with billing and sign-up, ready for a first client.

If you want v2 online earlier for demos, the hosting part of Phase 10 can move up. It stays €0.

**Later, in the order you choose:**
- **Integrations** (section 10), with the Conversations page (all calls, chats and tickets to choose from for a review).
- **For big clients:** single sign-on with the company account, automatic users (SCIM), allowed IP addresses, their own database.
- **Your own domain** (optional).

## 6. Billing: free until a client pays you

- **Stripe has no sign-up fee and no monthly fee.** Its **test mode is completely free**: test cards, no real money. We build and test all of billing there, on your PC, with Stripe's free tool that forwards its messages to your PC.
- **Stripe only takes a share when a client pays you:** about **1.5% + €0.25** per EU card payment (check your exact rate in the Stripe dashboard), plus **0.7%** for subscriptions.
  - *Example:* a client paying €300 a month costs about €4.75 + €2.10 = **€6.85** in fees, which is 2.3%.
- **What gets built (Admin › Billing):**
  - **Plan & seats**: a seat is a person with an active account (as decided on 4 November).
  - **Usage**: how much AI, voice and transcription the company used this month.
  - **Invoices**: all invoices, to download.
  - **Payment method**: the card or bank account.
  - **EU VAT**: the company's VAT number, and reverse charge for business clients in other EU countries.
- **How paying works:** Stripe's own payment page (Checkout) and portal (change plan or card, cancel). Q-smart never sees card numbers. Stripe tells Q-smart about every payment, and Q-smart updates seats and limits by itself.
- **A free trial** for new companies. What happens when a payment fails (reminders, then read-only after a number of days) is decided when we build it.
- **The Stripe keys** are typed into Admin › Billing and stored encrypted, as today. Bigger clients can also pay by bank transfer or SEPA Direct Debit.
- Before the first real invoice: ask an accountant about VAT and Bulgarian invoice rules.

## 7. The AI engine: many AI companies, the cheapest one that's good enough

**The idea (GPT's advice, your choice):** Q-smart is not tied to one AI company. Every AI task has a ranked list of models from different companies. For each request, the engine uses **the cheapest model that is good enough for that task**. If that model is down, too slow or over its limit, it moves to the next one on the list. This applies to everything: Quinn, AutoQA, the AI team lead, trainer and analyst, Q-Intelligence, and Q Trainer.

**Four ways it saves money, cheapest first:**
1. **No AI when it isn't needed.** Quinn answers most questions from the Help Center, FAQ, glossary and menu without any AI, and questions it has answered before come from a memory (the Quinn plan of 4 November, `docs/plans/QUINN_HYBRID_PLAN.md`). The cheapest AI request is the one never made.
2. **Small models for small jobs, strong models only for hard ones.** Small models handle things like recognising what a question is about or writing a short summary. Strong models handle scoring a call against the scorecard or giving coaching advice.
3. **Free models wherever the law allows it.** Google (Gemini), Mistral, Groq and Cloudflare have free plans with limits. The table below shows which data may go where.
4. **Reusing and capping.** Long instructions that repeat (a scorecard, Quinn's rules) are sent at a discount where the AI company allows it (prompt caching). Each team has a monthly limit, and admins get alerts.

**The quality check (QA for the AI itself).** For every task we keep a test set, in English, Bulgarian and French. For example:
- sample conversations scored by you, the QA expert (for AutoQA): I prepare 30–50 made-up calls and chats, you score them once, and your scores become the yardstick,
- typical Quinn questions with good answers,
- Q Trainer scenarios with the expected behaviour.

Every model runs through the test set, and it's only allowed for a task if it passes the bar (for example: AutoQA within a few points of the human score). The AI Hub shows each model's quality and cost per task, so the choice is based on numbers, not guesses. When a new, cheaper model appears, we run the test set and switch if it passes.

**Which AI may see which data:**

| Data | Which AI | Why |
|---|---|---|
| **The demo, the tests, your own data, and anything with no client data in it** (for example Quinn's how-to questions and Help Center answers) | Any plan, free ones first (Gemini, Mistral, Groq, Cloudflare), with cheap paid models as a back-up | €0. Free plans may keep, read or learn from what is sent, and you're fine with that for your own data (5 November) |
| **Clients' data** (their people, their customers' conversations, their documents) | Only AI plans, free or paid, whose terms forbid the AI company from using the data for itself (no training, no staff reading it), with a data processing agreement, and in the EU wherever possible. **Free ones that may qualify** (to confirm before use): Groq, Cloudflare Workers AI, and Mistral with training switched off. **Paid:** Claude and Gemini through Google Cloud in Belgium, or Mistral. (Claude's own API also never trains on what we send, but it runs in the USA, so for clients' data Q-smart reaches Claude through Google Cloud in Belgium.) | GDPR, articles 28 and 6: Q-smart may use clients' data only for what the client asked, and every AI company it uses must be bound by the same rules by contract. What counts is what the AI company's terms allow, not what we intend. The engine blocks client data from any AI plan that may learn from it. |
| **Each company's own rules** | Admin › AI › AI companies: which companies are allowed (for example "EU only"), and the monthly limit per team | Some clients will have their own rules |

The rule for clients costs little: a small paid model costs well under one cent per answer, and most of Quinn's answers use no AI at all. Before the first client, a data-protection lawyer should confirm the list of AI companies, which also goes into the DPA you sign with clients (as sub-processors).

**Which plan of each AI company may be used for clients' data** (checked 5 November 2026; terms change, so we re-check before switching one on):

| AI company | Allowed for clients' data | Not for clients' data |
|---|---|---|
| **Anthropic (Claude)** | The API: it never trains on what we send, and a data agreement is included. For EU processing: Claude on Google Cloud in Belgium | Personal Claude chats (Free, Pro, Max) |
| **Google (Gemini)** | The paid Gemini API, or Gemini on Google Cloud (Vertex AI) in Belgium | The free Gemini API: people may read what is sent, and Google may use it to improve its products |
| **OpenAI (GPT)** | The API: no training unless we opt in, and a data agreement is available. A Europe region with nothing stored is available for eligible customers | Personal ChatGPT chats |
| **Mistral** (France) | Paid plans (no training by default). The free plan only with training switched off, once Mistral confirms its data agreement covers it | The free plan with training on |
| **Groq** | Its standard terms forbid training and include a data agreement (it runs in the USA; to confirm for the free plan) | — |
| **Cloudflare Workers AI** | It says it never trains on customer content (to confirm the data agreement and where it runs) | — |
| **ElevenLabs** (voices) | Q Trainer's customer voice: it only reads lines the AI made up, so no client data is involved and any plan is fine | Agents' real voices or clients' recordings, unless on its business plan with training off and a data agreement (voices can count as sensitive "biometric" data) |

**The AI companies at the start:**
- Anthropic (Claude), directly or through Google Cloud in the EU
- Google (Gemini)
- OpenAI (GPT)
- Mistral
- Groq (fast open models such as Llama)
- any service that uses the common "OpenAI format", including, later, a model on our own server (the "Python door")

**Voices and speech work the same way:**
- **Q Trainer's customer voice:** the browser's free voices for the demo, ElevenLabs for natural voices, and cheaper voice services as options.
- **The agent speaking in Q Trainer:** the browser's free speech recognition for the demo (in Chrome it can send the voice to Google under Chrome's own terms). For clients' agents: a speech-to-text service that has a data agreement and doesn't train.
- **Transcribing calls** (later, with the integrations): several providers, compared with the same quality check.

**The EU AI Act:** Quinn always says it's an AI, AI scores are shown as suggestions, and Q Trainer's voices are clearly simulated.

## 8. The MCP server

**What it is:** MCP is a standard way for AI assistants (Claude, ChatGPT and others) to connect to apps. Q-smart's MCP server lets a company's assistant use live Q-smart data, for example: *"Which agents fell below the pass rate this week?"* or *"Summarise the open disputes of team B2C."*

- **Reading:** reviews and scores, agents' and teams' results, disputes, flags, tasks, coaching, the knowledge base and workforce data. Each of these is one "area".
- **Writing, only when the key allows it:** for example, create a coaching task or a quick flag. There are no delete actions through MCP.
- **Access:** an admin creates a key (Admin › Security › API keys) and chooses for each area: no access, read, or write (decided on 4 November). Later, people can also connect with their own Q-smart sign-in, and then they see only what their role allows.
- **Safety:** the company wall applies to every request, every MCP action is written in the activity log, and there are limits per minute.
- **Built with the official MCP toolkit for TypeScript**, at the app's address followed by `/mcp`. It comes together with the **Developer API** (documented with OpenAPI) and **webhooks**. The webhook events chosen on 4 November: review saved, changed or deleted; dispute opened or resolved; quick flag; task done; new user; practice call finished.

## 9. Q Trainer: the AI call simulator

Built as decided on 4 November, and as you asked in your notes: **it works only with AI.**

- **For every client and every industry:** each company writes its own scenarios (the customer, the reason for the call, their mood, a difficulty level, what a good answer looks like, linked to the scorecard's categories). Ready-made examples help them start.
- **AI only:** an AI model plays the customer in every conversation. The engine picks the model that passed the role-play test set (section 7). There's no scripted "fake" mode.
- **Text or voice:**
  - Text practice uses only the AI model.
  - Voice practice: the agent speaks into the microphone, their words are turned into text, the AI answers as the customer, and a voice speaks the answer. That's the browser's free voice in the demo, or an **ElevenLabs** voice for a natural sound.
- **During the call:** live hints, such as the customer's mood, as in today's simulator.
- **After the call:** a strong model scores the practice against the company's scorecard, with quotes and tips. The result goes to the Q Trainer dashboard, the agent's profile and coaching.
- **Suggestions:** the AI trainer suggests a scenario to an agent who is weak in a category, based on their real reviews.
- **In Q-smart's own look and colours.**
- **Costs:** €0 in the demo (free models and free voices). For clients: per use, within each team's monthly AI limit; ElevenLabs voices are paid per character.
- Today's simulator rules (segments, levels, customer types, indicators, the score) come over and are checked by tests.

## 10. Integrations (later)

**The rule for all of them:** Q-smart never stores call audio. It keeps the conversation's details, a link back to it, the text (deleted after the number of days each company chooses) and the review.

**How it works:**
- Each company connects its own accounts. The keys are stored encrypted, and nobody pastes keys into chats or files.
- New conversations arrive by themselves (webhooks), and sampling rules decide which ones get a transcript and an AutoQA score.
- When there's no ready transcript, a speech-to-text service (about $0.10–$0.40 per hour of audio) transcribes the recording from its link, without the audio passing through our storage.

| Platform | What it is | What Q-smart would take from it | To check when we get there |
|---|---|---|---|
| **Voiso** | Cloud contact centre | Calls, agents, queues; a recording link that works for 24 hours (Pro Plus plan); Voiso's transcripts (18 languages, not Bulgarian) | Can the API give a fresh recording link later? |
| **Ringover** | Cloud phone system | Ended calls (webhook), recordings and Ringover's transcripts | Which plan includes transcripts; the exact API fields |
| **MMD Smart** | To confirm: I found no public documentation | Calls and recordings, if its system allows | How its API works (you'll show me) |
| **Zendesk** | Help desk | Tickets, chats and e-mails (written conversations to review), Zendesk Talk calls, satisfaction ratings | Which Zendesk plan you have |
| **Myphoner** | Cold-calling and telesales tool | Calls, call outcomes and recordings | Its API is on the middle and top plans; can recordings be read through it? |
| **Modjo** | Conversation intelligence (records and transcribes sales and service calls) | Calls and the transcripts Modjo already made | Whether Modjo has a public API or an export |

**Before using real data:** if an account belongs to a company (for example your employer) and holds real customers' conversations, get the company's written OK first, and the speech-to-text provider must sign a data processing agreement. Otherwise we use test conversations.

## 11. Hosting and addresses

**Firebase Hosting, free.** One Firebase project can host up to 36 sites, each with its own free, permanent address and HTTPS. The names are first come, first served, so we pick them when we create the project:

| Site | Free address (example) |
|---|---|
| The app | qsmart-app.web.app |
| Official website | qsmart.web.app |
| Help Center | qsmart-help.web.app |

- **Free allowance:** 10 GB of files and 10 GB of downloads a month for all the sites together. That's plenty for a demo.
- **They aren't sub-domains of one name** (Firebase can't give you app.qsmart.web.app), but each address is free and permanent.
- **Your own domain is optional, later.** When you're selling, buy one anywhere (about $10 a year) and connect it to the same sites in a few minutes. Until then, the e-mails Q-smart sends itself (reports, reminders) come from a general address and can land in spam more often. That's fine for a demo.

**Sign-in: Firebase Authentication.**
- E-mail + password, Google, Microsoft, "forgot password", invitation links, and two-step sign-in (a free upgrade turned on in Phase 10).
- Free up to 50,000 users a month. Google sign-in works on your PC and on the free addresses without a domain, and Firebase sends the sign-in e-mails itself.
- **The one catch:** Firebase keeps the accounts (names, e-mail addresses, password fingerprints) in the USA, and there's no EU option. This is legal and common. If a strict client ever objects, Firebase can export all accounts, passwords included, to another sign-in system.

## 12. Costs

| Stage | You pay |
|---|---|
| **Building (phases 0–9)** | **€0, no card.** The demo's AI runs on free models. Paid models (Claude, GPT…) and ElevenLabs voices only if you want to compare them, per use. GitHub is free too: the repository is public, so its automatic tests have no minutes limit. |
| **Online demo (phase 10)** | **€0 a month** within Google's free allowances: a card on file, at most one server, and an alert at €5. Stripe stays in free test mode. |
| **First clients** | Stripe's share of each payment, the AI used for their data (free where the AI company's terms allow it, otherwise the cheapest paid model that passes), a paid database plan once the free one is too small, a paid e-mail plan if needed. All of this grows with your clients and is covered by their subscriptions. |
| **Always** | AI, voices and speech-to-text for clients: per use, capped by the monthly limits per team, and built into your prices |

No domain is needed at any stage.

**One database or several? (the final answer, 5 November)**

All client companies share **one** database, kept apart by the company wall. There is never a database per company. Separate databases exist only for separate *purposes*:

| Database | What's in it | When | Cost |
|---|---|---|---|
| **Demo database** | Your made-up demo company | From Phase 0 | Free, always (Neon's free plan) |
| **Test databases** | Throw-away copies the automatic tests create and delete | Every test run, on your PC or on GitHub | Free |
| **Clients' database** | All client companies together, each behind the company wall | Created when your first client signs | Free to start. Once real clients depend on it, it moves to a small paid plan, paid by their subscription, because the free plan pauses when its monthly allowance runs out |
| **A big client's own database** | Only if a client asks for it and pays for it | Maybe one day | Paid by that client |

Sign-in is set up the same way: one free Firebase project for the demo and one for clients, so demo accounts and client accounts never mix.

## 13. What only you can do, and when

| When | What |
|---|---|
| **Phase 0** | ✓ The repository `qa-platform-q-smart-v2-code-restructure` exists, public by your choice · create a free Firebase project with your Google account (no card; I'll guide you click by click) · create a free Neon account (no card) |
| **Every phase** | Try what was built and tell me what to change |
| **Phase 8** | Free accounts with Google AI Studio (Gemini), Mistral (it asks for a phone number, not a card; switch training off under Admin Console › Privacy), Groq and Cloudflare. Their keys go into Q-smart's AI settings (never into the chat or a file). Optional: your Claude and OpenAI keys, to compare paid models. · Score the 30–50 sample conversations for the AutoQA test set (I prepare them). |
| **Phase 9** | Optional: an ElevenLabs key for natural voices (the free browser voices work without it) |
| **Phase 10** | A card on the Google Cloud account (limits plus an alert at €5) · a Stripe account (test mode) · a free Microsoft app registration for Microsoft sign-in (I'll guide you) |
| **Integrations** | Access to the platforms, and permission to use their data |

## 14. Open questions (answer by number)

1. ✓ Yes: Phase 0 starts (5 November).
2. ✓ Done (5 November): this folder is the project, connected to the public GitHub repository of the same name, with a fresh history. Work happens on the branch `qa-platform-q-smart-v2-code-restructure`, and finished work goes into `main`.
3. The Firebase project name: "qsmart" (if it's free), or another name? It decides the free addresses.

---

## 15. Technical appendix (for Claude and future developers)

### Repository layout

```
qa-platform-q-smart-v2-code-restructure/     this folder = the public GitHub repository of the same name
├── apps/
│   ├── web/      the app's pages: React + Vite + TypeScript
│   ├── api/      the server: NestJS on Fastify + TypeScript, one module per area (incl. the AI engine and the MCP server)
│   ├── site/     official website: Astro (Phase 11)
│   └── help/     Help Center: Astro (Phase 11)
├── packages/
│   ├── shared/   data shapes (zod), business rules (scoring, capacity split, time zones, simulator…), translations
│   ├── db/       PostgreSQL tables (Drizzle), migrations, company-wall policies, demo data
│   └── ai-evals/ the AI test sets (EN/BG/FR) and the runner that scores every model per task
├── tests/e2e/    browser tests (Playwright)
├── docs/         this plan, decisions, architecture, release notes
├── notes/        your personal notes
└── current-app/  today's app with its data (moved here in Phase 0, removed once v2 replaces it)
```

### Main tools
- TypeScript in strict mode everywhere; ESLint and Prettier. One repository with npm workspaces (no extra tools); Node.js 24 LTS (already on your PC). Exact versions are pinned at set-up (current stable releases).
- Pages: React, Vite, a typed router, TanStack Query (loading data), React Hook Form + zod (forms), i18next (EN/BG/FR, converted from today's `public/js/i18n/bg.js` and `fr.js`). Tailwind CSS set up with today's design tokens, accessible building blocks from shadcn/ui (Radix), and TanStack Table for the big tables with filters and columns. The chart library is chosen in Phase 3.
- Server: NestJS on the Fastify adapter; validation with zod (nestjs-zod); the OpenAPI description is generated from the code, and the pages use a typed client generated from it.
- Database: PostgreSQL; Drizzle ORM and drizzle-kit migrations; the node-postgres driver.
- Sign-in: the Firebase Authentication web SDK in the pages. The pages send the Firebase ID token in the `Authorization` header, and the server checks it with `firebase-admin`. Company, role, teams and workspaces come from PostgreSQL. Invitations and password links are made with the Admin SDK. Firebase's own protection against password guessing replaces today's lock-out rule. Tests use the Firebase Auth emulator, never real accounts.
- AI: the open-source AI SDK (by Vercel, no Vercel hosting needed) as the common layer for Anthropic (direct and on Vertex AI), Google (AI Studio and Vertex AI), OpenAI, Mistral, Groq and OpenAI-compatible endpoints. It handles structured output with zod, tool calls and streaming.
- Tests: Vitest (rules and server) and Playwright (browser), on a real throw-away PostgreSQL, never the demo data.
  - GitHub Actions runs all the checks on every push: types, lint, rules, server and browser tests. It's free with no minutes limit, because the repository is public.
  - Accessibility checks with axe in the browser tests; speed checks with a year of made-up data for 500 agents (today's `test/gen-large.js`); a check that every text has its Bulgarian and French translation.
  - AI tests use recorded answers, so they cost nothing and give the same result every time. The AI test sets run on demand.
- Dependabot (free) keeps the libraries up to date and warns about security problems.
- Hosting (Phase 10): Firebase Hosting, with one site per app and `/api/**` and `/mcp` rewritten to Cloud Run; Cloud Run in europe-west1 with 0 to 1 instances for the demo; a Docker image for the server, built by Google (no Docker needed on your PC).

### The company wall (multi-tenancy)
- Every table has `company_id`. PostgreSQL Row-Level Security shows a row only when `company_id` matches the signed-in person's company, which is set per request with `SET LOCAL` inside a transaction.
- The server's database user does not own the tables and cannot bypass the wall.
- Automatic tests sign in as company A and try every route against company B, including the MCP tools and the webhooks.
- A connection router (company → database) supports the demo database, the production database, and later a dedicated database for a big client.

### Roles and permissions
- Roles admin, qa, lead, trainer and agent, plus workspaces, as today. They're checked on the server for every route with NestJS guards. Today's role-matrix and permission tests become v2's.
- A `platform_admin` role outside the companies (you): create, suspend and delete companies; see plans, seats and usage; switch features per company. Support access to a company only with its permission and for a limited time, and every action is logged in that company's activity log.

### Environments and secrets
- Three environments with the same code: **local** (your PC), **demo** (online, made-up data) and **production** (clients). Each has its own database and its own Firebase project, so demo accounts and client accounts never mix. Production is **one** database shared by all client companies (company wall), not one per company.
- The server's own secrets (the database address, the Firebase service account, the master encryption key) are never in Git: a local `.env` file on the PC (ignored by Git), Google Secret Manager online.
- Clients' keys (AI companies, Stripe, integrations) are stored encrypted in the database with the master key.
- The repository is public. By your decision of 5 November it holds today's app complete (with its data, keys and patent description) and your notes. New v2 secrets (`.env`) stay out of Git, because they will protect clients' data. GitHub's secret scanning with push protection is a safety net for those.

### Main tables (first draft, refined in each phase)
- companies, users, memberships (a person's role in a company; one person can belong to several companies), teams, workspaces, skills
- scorecards, categories, questions, reviews, review_answers, disputes, flags, calibrations, root_causes
- tasks, coaching_sessions, one_to_ones, goals, improvement_plans
- kb_folders, kb_articles, quizzes, quiz_attempts, newsletters
- shifts, rotas, attendance, leave_requests, capacity_plans
- conversations, transcripts (with their deletion date), ai_jobs, ai_usage, ai_models, sim_scenarios, sim_sessions
- api_keys, webhooks, audit_log, notifications, settings, subscriptions

### Time
- Every time is stored in UTC and shown in each person's time zone (empty = the company's), as decided on 4 November.

### Background jobs
- PC phase: timers inside the server plus a jobs table.
- Online: Cloud Tasks (jobs) and Cloud Scheduler (timed jobs: attendance checks, weekly summaries, deleting old transcripts) call the server over HTTPS, so it wakes only when there is work. Long AI jobs never block a page.

### AI engine
- One entrance, `ai.run(job)`, with job types (quinn.intent, quinn.answer, autoqa.score, coach.summary, sim.customer_turn, sim.score, stt.transcribe, tts.speak…).
- **Model catalogue:** for each model, its provider, price per token, context size, languages, structured-output support, region, and data terms (`may-train` or `no-train-dpa`, plus `eu-processing`). `no-train-dpa` means the provider's terms forbid using the data for its own purposes and a data processing agreement applies, whether the plan is free or paid.
- **Routing per job type:** the requirements (quality bar from the test sets, maximum wait, languages, structured output) plus a ranked list of candidates. The router picks the cheapest candidate that meets them. On an error, timeout or rate limit it tries the next one, and a circuit breaker rests a failing provider for a while.
- **Data class:** every job is marked `test` (demo or tests) or `client`. `client` jobs (anything containing a client's personal data or documents) can only go to models with `no-train-dpa` terms and the company's allowed providers (for example EU only). This is enforced in the engine and covered by tests.
- Every call is recorded: company, team, user, feature, provider, model, tokens, cost, wait time, status, fallback used. The team's monthly limit is checked before each call.
- Prompt caching where the provider supports it; a cache of general answers (never personal ones) for Quinn.
- Answers are validated against zod schemas. An invalid answer is retried once, then sent to the next model.
- When every provider is unavailable, that feature says so and everything else keeps working.
- The "Python door": a job type can be routed to an OpenAI-compatible endpoint on our own server later.

### Q Trainer
- Scenario = persona, reason, mood, level, segment, knowledge-base articles, expected behaviours mapped to scorecard categories.
- A turn: the agent's text (voice → speech-to-text: the browser's own recognition in the demo, a `no-train-dpa` provider for clients) → `sim.customer_turn` (the persona and scenario as instructions) → the customer's text → `tts.speak` for voice practice (browser voices or ElevenLabs).
- The end: `sim.score` (the scorecard as a schema) → result, quotes and tips. A webhook fires: practice call finished.
- Today's `sim.js` rules move to `packages/shared` with their tests.

### MCP server
- The official MCP TypeScript SDK, Streamable HTTP transport, at `/mcp`, as a module of the server.
- Auth: an API key per company with access per area (none / read / write); OAuth sign-in for people can be added later.
- Tools map to the same services the pages use, so the permissions and the company wall are the same. No delete tools. Rate limits; every call goes to the audit log.

### Billing
- Stripe Checkout and the Customer Portal; Stripe webhooks (`checkout.session.completed`, `customer.subscription.*`, `invoice.*`) update seats, plan and limits. The webhook signature is checked.
- Keys are encrypted per installation (as today). During the PC phase, the Stripe CLI forwards test webhooks to localhost.

### Integrations (later)
- One connector shape for every system: `verifyWebhook`, `listConversations(since)`, `getConversation(id)`, `getRecordingLink(id)` and `getTranscript(id)`; the last two may answer "not available".
- Voiso: API v4 only, with scoped Bearer keys (the legacy APIs end on 31 March 2027). The `call.recording.available` webhook gives a 24-hour pre-signed MP3 link (Pro Plus). Transcripts come from `GET /api/v4/reporting/cdrs/{id}/speech_analytics`.
- Speech-to-text goes through the AI engine (`stt.transcribe`): `{ audioUrl, language, speakers }` returns utterances `[{ speaker, start, end, text }]`.
- Audio is never written to disk or storage.

### Data protection
- In the EU: the database (Neon), the server (Belgium) and the files (Google Cloud Storage). Sign-in accounts are in Firebase Authentication (USA, under Google's EU data terms). For clients' data, the AI runs only on plans that don't use the data for themselves (`no-train-dpa`), and in the EU wherever possible (Claude and Gemini on Vertex AI in europe-west1, or Mistral).
- Transcripts are deleted after the company's chosen number of days (decision of 4 November); reviews stay.
- Training-data opt-in per company: anonymised transcripts are kept for training our own models only when the client agrees.
- Activity log, personal-data export, retention jobs.

### Monitoring and backups
- Structured logs (Cloud Logging), an error tracker on its free plan (for example Sentry), and a free uptime monitor.
- Neon's point-in-time restore, plus a nightly export to EU storage once online.

### Moving today's demo data
- A script reads today's `data.json` and fills the demo database, one area per phase. The demo company can be reset with one button.

---

## 16. Sources checked on 5 November 2026

- Firebase: [up to 36 sites per project](https://firebase.google.cn/docs/hosting/faq-and-troubleshooting) · [Hosting free allowance](https://firebase.google.com/docs/hosting/usage-quotas-pricing?hl=pl) · [sign-in pricing (50,000 monthly users free)](https://blog.logto.io/de/firebase-authentication-pricing) · [no EU location for sign-in (community request)](https://firebase.uservoice.com/forums/948424-general/suggestions/46591651-firebase-authentication-for-eu)
- AI: [Gemini API billing: a free tier in the EU, and how data is used on free and paid tiers](https://ai.google.dev/gemini-api/docs/billing) · [Gemini's free-tier terms (people may read prompts)](https://simonwillison.net/2024/Oct/17/gemini-terms-of-service) · [Mistral's free Experiment plan (requests may be used for training)](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan) · [Claude and Gemini on Vertex AI in EU regions](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency?hl=en) · [free AI APIs and their data rules, incl. Groq](https://aireiter.com/blog/best-free-ai-api) · [Groq's data processing addendum (no training on customer data)](https://console.groq.com/docs/legal/customer-data-processing-addendum) · [Mistral: switching training off on the free plan](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training) · [Cloudflare Workers AI: no training on customer content](https://developers.cloudflare.com/workers-ai/platform/privacy/) · [GDPR article 28 (processors)](https://gdpr-info.eu/art-28-gdpr/) · [Anthropic's commercial terms (no training on API data; data processing addendum)](https://www.anthropic.com/legal/commercial-terms) · [Claude regional options (Europe through cloud providers)](https://claude.com/regional-compliance) · [OpenAI: no training on API data by default, data agreement, Europe region](https://openai.com/ka-GE/index/introducing-data-residency-in-europe/) · [Google Cloud: no training on customer data](https://docs.cloud.google.com/generative-ai-app-builder/docs/data-governance) · [ElevenLabs zero retention mode (business plan)](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode)
- [Neon free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas)
- Stripe: [pricing in Bulgaria (Billing 0.7%)](https://stripe.com/en-bg/invoicing/pricing) · [EEA pricing](https://support.stripe.com/questions/pricing-updates-for-businesses-based-in-the-european-economic-area-(eea))
- Voiso: [call recording webhook (24-hour link, Pro Plus)](https://developers.voiso.com/reference/call-recording-events) · [speech analytics API](https://developers.voiso.com/reference/getcdrspeechanalytics) · [Speech Analytics languages](https://docs.voiso.com/docs/speech-analytics) · [moving to API v4](https://developers.voiso.com/reference/migrating-to-v4)
- [Ringover: recordings and transcriptions](https://support.ringover.com/hc/fr/articles/22614642176529-Les-enregistrements-et-transcriptions-dans-Ringover) · [Ringover integration guide (API key, "calls ended" webhook)](https://docs.spott.io/docs/integrations/ringover)
- [Myphoner: REST API, call recording](https://www.myphoner.com/de/solutions/) · [Myphoner plans (GetApp)](https://www.getapp.com/sales-software/a/myphoner/)
- [Modjo: imports calls from Aircall through webhooks](https://aircall.io/integrations/modjo/)
- [Speech-to-text prices compared, 2026](https://soniox.com/compare/stt/pricing)
- [Spring Boot cold starts on Cloud Run](https://oneuptime.com/blog/post/2026-02-17-how-to-optimize-cloud-run-cold-start-latency-for-java-and-spring-boot-applications/view)
- [Linear: TypeScript end to end, Node, Postgres, Google Cloud](https://linear.app/careers/12f8f208-0b9c-4569-bb3d-41c8a197029e)
