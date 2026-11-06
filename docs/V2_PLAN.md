# Q-smart v2: the plan and the architecture

Written on 5 November 2026 by Claude, from our talks of 3–5 November (including your chat with GPT), with all your answers of the same day.
**Status: final. Reviewed once more on 5 November 2026, updated that evening with the answers to your 18 questions and your decisions (marked "5 Nov, evening"), and given a last check on 6 November (my improvements are marked "6 Nov"). Phase 0 starts next.** Prices were checked on 5 November 2026 (sources at the end).

> **Today's app is the starting point.** Its files are in this repository, and it keeps running on your Cloudflare link until v2 replaces it. What it does, and its ~250 tests, are the checklist for v2. While v2 is being built, the running app gets only urgent fixes and new ideas go on v2's list, so v2 isn't chasing a moving target.

**Contents**
1. In short
2. The decisions
3. The architecture: how the parts fit together
4. How we build it
5. The phases
6. Billing: free until a client pays you
7. The AI engine: many AI companies, the cheapest one that's good enough
8. The developer platform: API keys, webhooks and the MCP server
9. Q Trainer: the AI call simulator
10. Integrations (later)
11. Hosting, addresses and sign-in
12. Security
13. Cookies, browser storage and caching
14. Costs
15. What only you can do, and when
16. Open questions
17. Technical appendix
18. Sources

---

## 1. In short

- **One language, TypeScript**, for the pages, the server and the shared rules.
- **A PostgreSQL database in the EU** with a **company wall**: each company can only ever see its own data. The demo has its own database.
- **Firebase** for **sign-in** and for **hosting all the sites** on **free addresses**. No domain to buy.
- **A set of apps behind one sign-in:** Quality, Workforce, Learning, Q Trainer, AI and Admin, with an app switcher. A company sees only the apps it has.
- **AI from several companies, not just one:** Claude, Gemini, GPT, Mistral and others. For every task, the AI engine uses the cheapest model that passes our quality check, and free plans whenever their terms forbid training on our data (the same rule for the demo and for clients).
- **AI reviews count on their own**, without a person checking each one, and an accuracy score (like Zendesk's) shows how well they agree with your reviewers.
- **€0 until your first paying client**, the demo's AI included (it runs on free plans that don't train on our data).
- **Billing with Stripe**: free to set up and free to test. Stripe only takes a small share when a client actually pays you.
- **The developer platform** (API keys, webhooks and the MCP server, so clients can connect their own systems and AI agents) and **Q Trainer** (the AI call simulator) have their own phase.
- **A platform owner area** for you, to run Q-smart as a business: create client companies, and see their plans and usage.
- **Call recordings are never stored.** They are played from the client's phone system, and only the text is kept.
- **Integrations come later:** Voiso, Ringover, MMD Smart, Zendesk, Myphoner and Modjo.

## 2. The decisions

| Topic | Decision | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for everything; checked before it runs; today's rules move over with their tests; the biggest group of developers to hire from later |
| Pages | React, same look as today's app (colours, fonts, icons, light/dark, themes) | Ends the long files and the code written straight into the page text; today's design is kept |
| Server | NestJS (TypeScript, organised like Spring Boot), one module per area | A clear structure a future team knows; wakes up in about a second, so the free "sleep when unused" mode works |
| Database | PostgreSQL on Neon (EU, Frankfurt). **One shared database for all client companies**, with the company wall, never one database per company. Separate copies exist only for different purposes: the demo (made-up data) and the tests. A big client could pay for its own database one day. (Section 14: "One database or several?"; why Neon: section 17) | Free until your first paying client; Q-smart is mostly reports, which SQL does directly; nothing to migrate later |
| Sign-in | Firebase Authentication. **One project for all client companies**; the database keeps the companies apart, like their data (5 Nov, evening) | Easy, free, run by Google. The accounts are kept in the USA (see section 11) |
| Hosting | Firebase Hosting for the app, the website and the Help Center, **published automatically from GitHub** (5 Nov, evening) | Free addresses with HTTPS; no domain needed; nothing to upload by hand |
| **AI** | **Several AI companies** behind one AI engine. Each task uses the cheapest model that passes its quality check. Free plans are used whenever their terms forbid the AI company from using the data for itself, with the same rule for the demo and for clients (5 Nov, evening). A monthly limit per team. *(Replaces "Claude only" of 3 November and "Quinn always on Claude Haiku" of 4 November.)* | Lowest cost, no dependence on one company, and nothing breaks when one of them is down (GPT's advice, your choice of 5 November) |
| Recordings | Never stored; played from the phone system; only the text is kept | Saves storage (a 5-minute call is ~5 MB as audio, ~5 KB as text) and privacy risk |
| Billing | Stripe. The extras that cost per use (AI, Q Trainer) are add-ons with a monthly allowance that stops at the limit (5 Nov, evening; section 6) | Your choice of 4 November; no monthly fee; no surprise bills for clients |
| E-mail | Firebase for the sign-in e-mails (check your address, reset your password, sign-in link). **Brevo for everything else Q-smart sends:** invitations, notifications, reminders, weekly summaries, scheduled reports, newsletters and announcements | Both free at the start (Brevo: 300 e-mails a day) |
| Roles | admin, **reviewer** (called "QA" in today's app; renamed on 5 November, evening), team lead, trainer, agent | "Reviewer" sounds more professional and says what the person does |
| AI reviews | **AI reviews count on their own**, without a person checking each one (your decision; it replaces "only for comparison" of 3 November). They're marked as AI, an **accuracy score** compares them with your reviewers' scores (like Zendesk's), agents can dispute them, and pay, bonuses, warnings or dismissal never rest on AI reviews alone (5 Nov, evening; section 7) | Less manual work for clients, and legal in the EU with these safeguards (GDPR art. 22, EU AI Act) |
| Menu | **A set of apps** behind one sign-in and one address, with an app switcher: Quality (the main one), Workforce, Learning (with a Confluence look), Q Trainer, AI and Admin. A company sees only the apps it has (your yes of 5 November, evening) | Clear menus; each app can be sold on its own; one sign-in; each app's code loads only when it's opened |
| Training AI on clients' data | Never, even with a line in the terms. Only fully anonymised data, with the client's separate written agreement (section 7) | A clause signed by the client can't give consent for the agents and customers in the calls (GDPR) |
| Cookies | Only what sign-in and settings need; no tracking or advertising cookies, so no cookie banner in the app (section 13) | EU rules: ePrivacy art. 5(3) and GDPR |
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
     ├── Developer platform ... API keys, webhooks and the MCP server, for outside systems and AI agents
     ├── Connectors (later) ... Voiso · Ringover · MMD Smart · Zendesk · Myphoner · Modjo
     ├── Background jobs ...... Cloud Tasks and Cloud Scheduler wake the server when there is work
     ├── Files ................ documents and pictures (never recordings) ── Google Cloud Storage, EU
     └── E-mail · payments .... Firebase and Brevo · Stripe
```

**The parts in plain words**

- **The pages** are what people see in the browser. They only show things and send requests. They never decide who may see what.
- **The server** decides everything: who you are, what your role allows, and which company's data you may touch. It's split into **modules**, one per area of the menu, so a change in Workforce can't break Quality.
- **The database** keeps all the data. The **company wall** is built into the database itself: even if the server made a mistake, one company's rows stay invisible to another. Automatic tests try to break through it on every route.
- **Sign-in** happens in Firebase, which gives the browser a proof of who you are. The server checks that proof on every request, then reads your company, role, teams and workspaces from our own database. Firebase and the database never talk to each other directly: the server sits between them, and the database's password is one of the server's secrets.
- **The platform owner area** is for you as the owner of Q-smart. You create and manage client companies, see their plans and usage, and switch features on for each company. You can open a company's data for support only with that company's permission, for a limited time, and it's logged.
- **Secrets** (the keys and passwords the server needs) are never in the code. On your PC they live in a private settings file that Git ignores; online, in Google's Secret Manager. Clients' keys (AI companies, Stripe, integrations) are stored encrypted.
- **The AI engine** is the single entrance for all AI: Quinn, AutoQA, the AI team lead, trainer and analyst, and Q Trainer. It works with several AI companies and picks the cheapest model that is good enough for each task. It counts every use against the team's monthly limit, and if one AI company is down, it switches to another (section 7).
- **The developer platform** (API keys, webhooks and the MCP server) is the door for outside systems and AI assistants, opened with a key (section 8).
- **Connectors** bring conversations in from phone systems and help desks (section 10).
- **Background jobs** do the slow work (AutoQA, reports, reminders, deleting old transcripts) without making anybody wait. They wake the server only when there is work.
- **Files** (knowledge-base documents, pictures, attachments) go to EU storage. Call recordings never do.
- **Security** is part of every layer, from the company wall to the automatic checks on GitHub (section 12). **Cookies** are limited to what sign-in and settings need (section 13).

**All clients' data except the sign-in accounts stays in the EU**: the database in Neon's EU region, the server in Belgium, the files in Google's EU storage, and the AI in the EU wherever possible (section 7). The demo follows the same rules (5 Nov, evening).

## 4. How we build it

- **Today's app is the reference.** For every page I look at what today's app does and at its tests. The new page must do the same and pass the same checks. Changes to how things work happen only when you ask.
- **Your decisions carry over.** Everything you decided so far (in `docs/audit/DECISIONS_FOR_YOU.md`) stays decided in v2, unless this plan changes it. The changes are marked in section 2.
- **Small steps.** Each phase is split into small pieces. For every piece: I build it → the automatic tests run → a code review of the change, for mistakes and security (6 Nov) → I check it in a browser as every role → **you try it** → I write the release note → it's saved to GitHub.
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
| **0. Set-up** | This folder, connected to your GitHub repository, with today's app moved into `current-app/` so v2 can be built next to it (I'll ask you to stop today's server first, and show you how to start it from its new place) · the skeleton of the pages, server, shared rules and database · automatic tests on GitHub, with a real PostgreSQL that the tests start by themselves (nothing to install, no admin rights needed) · today's design (colours, fonts, icons, light/dark, themes) · sign-in with Firebase (first its local test version, then your real project, reserving the free web.app names straight away) · the company wall · **one file you double-click to start v2 on your PC** · a new CLAUDE.md for v2 *(6 Nov: the server move, the test database, the names and the start file added)* | Sign in on your PC with a test account, on a page in Q-smart colours | S |
| **1. Foundation** | Companies and the **platform owner area** (you create and manage client companies) · sign-in (e-mail + password, Google, forgot password, invitation links) · the menu as **apps** with an app switcher (Quality, Workforce, Learning, Q Trainer, AI, Admin; your yes of 5 November), menu search, light/dark, themes and three languages · only the browser storage that sign-in and settings need, cleared at sign-out (section 13) · **My account** (profile, password, appearance, language, notifications & confirmations) · **Users, Teams, Workspaces, Skills & languages** · **Roles & permissions** · **Activity log** (all activity, my activity, sign-ins, exports) · the notification bell | Sign in as every role; manage users and teams | L |
| **2. Quality** | **Quality set-up** (scorecards, categories, root causes, system settings and pass rates) · **QA Entry** · **Reviews** (filters, columns, Excel export) · **Quick Flags** · **Disputes** · **Calibration** · **Reviewer QA** · **Pins** | Score a call, flag it and dispute it, as today | L |
| **3. Home & Analytics** | **Dashboard** with widgets and **Personalize** (a view per role) · Getting started · **Agents** (personal dashboards) · **Team Review** · **Category Stats** · Topic dashboards · **Performance** (goals & KPIs, improvement plans, recognition) · **Planning** (review planner, QA workload, calendar) · **Reports** (report builder, saved & scheduled, export centre). The dashboard widgets for tasks, coaching, workforce and AI join in their own phases. | The same numbers as today's app, side by side | XL |
| **3b. AutoQA, first version** *(moved forward, 6 Nov)* | The AI engine's core: one or two free AI plans that don't train on our data, the choice of model, the cost of every call and the monthly limit · **AutoQA** on today's demo conversations and on transcripts you paste or upload: AI reviews, marked as AI, that count on their own · the **accuracy score** against your reviewers' scores (like Zendesk's), the automatic brake, and disputes on AI reviews · the AutoQA test set you score (30–50 conversations) | AutoQA reviews a conversation by itself, and the accuracy score shows how close it is to you | M |
| **4. Coaching & Tasks** | **Coaching** · **One-to-One** · **Tasks** (kanban, timeline, library, sequences) | Plan a coaching session and follow it | M |
| **5. Learning & Tools** | **My Learning** · **Knowledge Base** (like Confluence, folders per team) · **Quizzes** · **Newsletter** · help inside the app (FAQ, videos, tours, glossary) · **Tools** (redaction, translator, sample calculator, score simulator, script builder) | Write an article, take a quiz | L |
| **6. Workforce** | Its own app (your yes of 5 November): **Team today** · **Attendance** · **Time off** · **Shifts & rota** · **Capacity planning** · **Workforce set-up** (work calendars, shift templates, leave types, attendance rules) · each person's time zone | A day of check-ins and a fair split | L |
| **7. Company & governance** | **Company** (profile, business words, branding, regional settings) · **Messages** (notification rules, e-mail templates, announcements) · sidebar settings · **GDPR** (data protection, records of processing, sub-processors, DPA, recording consent) · **AI Act** (register, human checks, notices) · **Security** (security log, data breaches) · accessibility · **Compliance & CX** (compliance, risks, complaints, CSAT) · **Data** (backups, import, EU data location) · **Sandbox** · **Beta features** · **Support** (contact support, feature requests, service status, release notes) | Run the company settings as an admin | L |
| **8. AI** | The **AI engine with several AI companies** (section 7): the model choice per task, the quality checks, switching when one company is down, monthly limits per team, the cost per task · **AI settings** (Quinn, AI companies and models, limits, on/off, instructions) · **AI Hub** (overview, the **accuracy score**, usage and cost, prompt library, feedback) · the rest of **AutoQA** (Auto QA categories, more AI companies, the quality checks in all three languages; AI reviews count on their own, with the safeguards of section 7: your decision of 5 November, evening, which replaces "only for comparison" of 3 November) · **Q-Intelligence** (Ask Quinn, insights, spotlight, knowledge) · the **Quinn bubble on every page** for every role, with hand-over to the admins and the agent's team lead, and limits of €10 per company per month and 30 AI answers per person per hour (your decisions of 4 November) · **AI agents** (team lead, trainer, analyst) · **Transcripts** · the paperwork the AI Act asks for high-risk AI (section 7) | Ask Quinn and see which model answered and what it cost; the AI agents at work | XL |
| **9. Q Trainer & developer platform** | **Q Trainer** (dashboard, new simulation, scenarios with the company's own instructions and knowledge; text and voice practice; section 9) · the **developer platform** (section 8): **Admin › Developers** with API keys, webhooks going out and coming in, the Developer API with its documentation, and the **MCP server**, through which a client's own AI agent can review conversations | A voice practice call scored by the AI; Claude reading Q-smart through MCP | L |
| **10. Billing & going online** | **Billing** with Stripe (plan & seats, usage, invoices, payment method, EU VAT; section 6) · Google Cloud (server and files in the EU; a card on file, with alerts and the automatic spending stop of section 14) · the app on its free Firebase address · **sign-up with a free trial** for new companies · two-step sign-in and Microsoft sign-in · backups and monitoring · publishing from GitHub automatically, with a preview address for every change (section 11) · the legal pages (privacy, terms, DPA, sub-processors, cookies and storage) · an automatic security scan; an independent security test before the first paying client | Q-smart online for anyone you invite, with a test payment | M |
| **11. Website & Help Center** | The official website and the Help Center (Zendesk-style), built with Astro, on their free Firebase addresses · the **Developers** part of the Help Center: how to connect to Q-smart (API, webhooks, MCP), step-by-step guides for Voiso and the other platforms, and ready recipes for no-code tools such as n8n, Make and Zapier | Both sites online | M |

**Three milestones:**
- **A, after Phase 3b:** v2 tells the core QA story (people, scoring, disputes, dashboards and reports) **and shows AutoQA with its accuracy score**, your main selling point. It can replace today's app for demos.
- **B, after Phase 9:** all the AI (Quinn, AutoQA, the AI agents, Q Trainer) and the developer platform (API keys, webhooks, MCP).
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
- **How the extras are sold (5 Nov, evening):** the basic plan is per seat. The extras that cost us per use are **add-ons with a monthly allowance**, in a few sizes: **AI** (AutoQA, Quinn's AI answers) and **Q Trainer** (practice minutes). The admin is warned at 80%; at 100% that extra stops until next month, unless the admin buys an extra pack. **No surprise bills**, and nothing per voice or per use for the client to work out. Each app (Workforce, Learning, Q Trainer, AI) can also be sold on its own (your yes of 5 November).
- **How paying works:** Stripe's own payment page (Checkout) and portal (change plan or card, cancel). Q-smart never sees card numbers. Stripe tells Q-smart about every payment, and Q-smart updates seats and limits by itself.
- **A free trial** for new companies. What happens when a payment fails (reminders, then read-only after a number of days) is decided when we build it.
- **The Stripe keys** are typed into Admin › Billing and stored encrypted, as today. Bigger clients can also pay by bank transfer or SEPA Direct Debit.
- Before the first real invoice: ask an accountant about VAT and Bulgarian invoice rules.

## 7. The AI engine: many AI companies, the cheapest one that's good enough

**The idea (GPT's advice, your choice):** Q-smart is not tied to one AI company. Every AI task has a ranked list of models from different companies. For each request, the engine uses **the cheapest model that is good enough for that task**. If that model is down, too slow or over its limit, it moves to the next one on the list. This applies to everything: Quinn, AutoQA, the AI team lead, trainer and analyst, Q-Intelligence, and Q Trainer.

**Four ways it saves money, cheapest first:**
1. **No AI when it isn't needed.** Quinn answers most questions from the Help Center, FAQ, glossary and menu without any AI, and questions it has answered before come from a memory (the Quinn plan of 4 November, `docs/plans/QUINN_HYBRID_PLAN.md`). The cheapest AI request is the one never made.
2. **Small models for small jobs, strong models only for hard ones.** Small models handle things like recognising what a question is about or writing a short summary. Strong models handle scoring a call against the scorecard or giving coaching advice.
3. **Free plans that don't train on our data.** Groq, Cloudflare Workers AI and Mistral (with training switched off) have free plans with limits. Gemini's free plan may use what's sent, so it isn't used (5 Nov, evening). The table below shows the rules.
4. **Reusing and capping.** Long instructions that repeat (a scorecard, Quinn's rules) are sent at a discount where the AI company allows it (prompt caching). Each team has a monthly limit, and admins get alerts.

**The quality check (QA for the AI itself).** For every task we keep a test set, in English, Bulgarian and French. For example:
- sample conversations scored by you, the QA expert (for AutoQA): I prepare 30–50 made-up calls and chats, you score them once, and your scores become the yardstick,
- typical Quinn questions with good answers,
- Q Trainer scenarios with the expected behaviour.

Every model runs through the test set, and it's only allowed for a task if it passes the bar (for example: AutoQA within a few points of the human score). The AI Hub shows each model's quality and cost per task, so the choice is based on numbers, not guesses. When a new, cheaper model appears, we run the test set and switch if it passes.

**Which AI may see which data:**

| Data | Which AI | Why |
|---|---|---|
| **The demo, the tests, your own data, and anything with no client data in it** (for example Quinn's how-to questions and Help Center answers) | **The same plans as clients' data** (next row), free ones first: Groq, Cloudflare Workers AI, Mistral with training off | Your decision of 5 November, evening: one set of rules, so the demo stays legal even if a prospect types real data into it. Still €0 if those free plans pass our checks; if none does, I ask you before any cost |
| **Clients' data** (their people, their customers' conversations, their documents) | Only AI plans, free or paid, whose terms forbid the AI company from using the data for itself (no training, no staff reading it), with a data processing agreement, and in the EU wherever possible. **Free ones that may qualify** (to confirm before use): Groq, Cloudflare Workers AI, and Mistral with training switched off. **Paid:** Claude and Gemini through Google Cloud in Belgium, or Mistral. (Claude's own API also never trains on what we send, but it runs in the USA, so for clients' data Q-smart reaches Claude through Google Cloud in Belgium.) | GDPR, articles 28 and 6: Q-smart may use clients' data only for what the client asked, and every AI company it uses must be bound by the same rules by contract. What counts is what the AI company's terms allow, not what we intend. The engine blocks client data from any AI plan that may learn from it. |
| **Each company's own rules** | Admin › AI › AI companies: which companies are allowed (for example "EU only"), and the monthly limit per team | Some clients will have their own rules |

The rule for clients costs little: a small paid model costs well under one cent per answer, and most of Quinn's answers use no AI at all. Before the first client, a data-protection lawyer should confirm the list of AI companies, which also goes into the DPA you sign with clients (as sub-processors).

**Can our terms allow training AI on clients' data? No (5 Nov, evening).** Writing it into the terms or the GDPR texts doesn't make it legal:
- Q-smart is the clients' *processor*: it may use their data only for what they ask (GDPR art. 28(3)(a)). Training AI would be our own purpose, which makes us a *controller* for it, with a legal ground of our own to prove (art. 28(10) and 6).
- The terms are signed by the client company, not by the agents and the customers who speak in the calls. Consent must come from each person, freely and for this specific use (art. 4(11) and 7), and employees can rarely say no freely to their employer.
- Calls often contain health, money or other sensitive details (art. 9).
- Regulators fine this: in December 2024 Italy fined OpenAI €15 million for training on personal data without a proper legal ground.
- **What is allowed:** our demo data, your own data, and fully anonymised transcripts (no names, numbers or voices left) with a client's separate written agreement (section 17 › Data protection).
- It's also a selling point: clients' security questionnaires always ask "Do you train AI on our data?", and "No" wins deals.

**Which plan of each AI company may be used** (for clients' data and, since 5 November evening, for the demo too; checked 5 November 2026; terms change, so we re-check before switching one on):

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
- **Q Trainer's customer voice:** always a natural voice: ElevenLabs first, another voice service only if it sounds as good in our listening test. The browser's own voice is only a back-up while building, never shown to clients (5 Nov, evening; section 9).
- **The agent speaking in Q Trainer:** a speech-to-text service that has a data agreement and doesn't train, for the demo and for clients alike. The browser's own recognition isn't used, because in Chrome it sends the voice to Google under Chrome's own terms (5 Nov, evening).
- **Transcribing calls** (later, with the integrations): the phone system's own transcript first, when there is one (section 10); otherwise several speech-to-text providers, compared with the same quality check.

**The EU AI Act:**
- Quinn always says it's an AI, AI scores are shown as suggestions, and Q Trainer's voices are clearly simulated. These transparency rules apply since 2 August 2026.
- **AI that evaluates or watches people's work** (AutoQA, the AI team lead and analyst, Q Trainer's scoring) is on the AI Act's **high-risk** list (annex III, point 4b). Since a change of July 2026, those duties start on **2 December 2027**. Since AI reviews now count on their own, AutoQA is clearly in this group (article 6 also says profiling always counts as high-risk). *(5 Nov, evening)*
- For this category Q-smart checks itself, without an outside certifier. What it needs: risk management, technical documentation, automatic logs (the engine already records every AI call), human oversight (the accuracy score, samples, disputes and an off switch), accuracy tests (our test sets), instructions for clients, and registration in the EU database. It's prepared in Phase 8, and a lawyer confirms it before the first client.
- Clients who use it must tell their staff and the staff's representatives first (article 26). Q-smart gives them a ready-made notice.

**AI reviews that count on their own: how it stays legal (your decision of 5 November, evening).** No person checks each AI review. Instead:
- **Marked as AI:** every AI review shows that it was made by AI (and by which model). Dashboards can show the AI, human and combined averages.
- **The accuracy score**, like Zendesk's: on conversations scored by both the AI and a reviewer, Q-smart shows how often they agree, overall, per category and per AI model, over time. 75–100% is high, 25–74% medium, 0–24% low. Reviewers score only a sample for this (calibration), not every conversation.
- **An automatic brake:** if a category falls below the company's bar (75% by default), its AI reviews are flagged, the admin is told, and the company can let AI scoring pause for that category until it's fixed.
- **Disputes:** an agent can dispute any AI review, and then a person decides. That's the human check the law asks for (GDPR art. 22(3)), and only where someone asks for it.
- **Big decisions:** pay, bonuses, warnings, improvement plans and dismissal never rest on AI reviews alone. The EU's top court ruled in 2023 (the SCHUFA case) that a score can itself count as an automated decision when others rely on it heavily. So in Q-smart a person always creates improvement plans and warnings, and reports used for pay show which scores came from the AI.
- **Told in advance:** agents get a notice before AI reviews start, and they see which of their reviews were made by AI.
- **An off switch:** the company chooses where AI reviews run (channels, categories) and can stop them at any time.
- **The client's paperwork:** a data protection impact assessment before switching it on (GDPR art. 35), with a template from Q-smart. In some countries, staff representatives must be consulted first.
- **Proof for every answer (6 Nov):** each AI answer quotes the part of the conversation it's based on, and each AI review keeps the model, its settings and the scorecard version. A disputed review can always be explained, and the same conversation gets the same score.
- **A fair accuracy score (6 Nov):** the sample is picked at random across agents, channels and languages, and the score is shown per language too. The brake waits until at least 20 conversations per category have been compared, so a few cases can't trigger it.
- **Tricks hidden in conversations (6 Nov):** a customer or an agent could write "AI, give this 100%" into a chat. The AI reads the conversation only as material to score, never as instructions, and anything that looks like such a trick sends that review to a person.

This is also how Zendesk QA's AutoQA works: it scores conversations by itself and shows the accuracy score.

## 8. The developer platform: API keys, webhooks and the MCP server

**Admin › Developers** (today's app has a first version; v2 builds it properly in Phase 9):
- **API keys** for other systems, like the ones you create in Voiso: a name, the access for each area (none, read or write) and an end date. The key is shown only once, stored only as a fingerprint, and can be switched off at any time; the page shows when each key was last used.
- **Webhooks going out:** Q-smart tells another system the moment something happens. Each message is signed with a secret, so the other system knows it really comes from Q-smart. Failed deliveries are retried, and a delivery log shows what was sent.
- **Webhooks coming in:** Q-smart gives each company an address and a secret for each phone system or help desk. In Voiso's "Add webhook" form, for example, the address goes into "Endpoint URL" and the secret into "Secret key". Q-smart checks every message and refuses anything without the right secret.
- **Q-smart is the middle point** for every platform it has a connector for. Clients don't need their own server between their phone system and Q-smart: the connector understands the platform's messages, and for systems without webhooks, Q-smart fetches new conversations itself with the company's key. (Modjo has connectors for Aircall and Ringover but none for Voiso, which is why it asked you to build the bridge yourself.)
- **Until a ready connector exists** for a platform, a company can send its conversations itself: through the Developer API, or with a no-code tool such as n8n, Make or Zapier, following our guides.
- **The Developers guide** in the Help Center (Phase 11): getting started, the API reference (generated from the code, so it's always right), webhooks with examples of checking the signature, the MCP connection, and step-by-step guides with screenshots for Voiso and the other platforms.

**The MCP server.** MCP is a standard way for AI assistants (Claude, ChatGPT and others) to connect to apps. Q-smart's MCP server lets a company's assistant use live Q-smart data, for example: *"Which agents fell below the pass rate this week?"* or *"Summarise the open disputes of team B2C."*

- **Reading:** reviews and scores, agents' and teams' results, disputes, flags, tasks, coaching, the knowledge base and workforce data. Each of these is one "area".
- **Writing, only when the key allows it:** for example, create a coaching task, a quick flag or an AI review. There are no delete actions through MCP.
- **Access:** an admin creates a key (Admin › Developers) and chooses for each area: no access, read, or write (decided on 4 November). Later, people can also connect with their own Q-smart sign-in, and then they see only what their role allows.
- **Safety:** the company wall applies to every request, every MCP action is written in the activity log, and there are limits per minute.
- **Built with the official MCP toolkit for TypeScript**, at the app's address followed by `/mcp`. It comes together with the **Developer API** (documented with OpenAPI) and **webhooks**. The webhook events chosen on 4 November: review saved, changed or deleted; dispute opened or resolved; quick flag; task done; new user; practice call finished.

**Clients' own AI agents (5 Nov, evening).** A company can connect its own AI agent through MCP and let it do routine work. For example, a prompt that reviews 3 calls, 3 e-mails and 3 chats per agent per week.
- It works only on conversations Q-smart has (from an integration or an upload).
- Its reviews **count on their own**, like AutoQA's: marked with the AI agent's name, measured by the same accuracy score, and open to disputes (section 7).
- **What clients get:** less manual work. The AI reviews; the reviewers score a sample for the accuracy score and handle disputes.
- **Our own AI does the same with buttons** (AutoQA, Phase 8), for companies that don't want to write prompts.
- **Price:** MCP and API access are part of the higher plans; the company's own AI pays for its own AI use. Storage is small: a transcript is text, about 10–30 KB, so 1 GB holds tens of thousands, and they're deleted after the company's chosen number of days.

## 9. Q Trainer: the AI call simulator

Built as decided on 4 November, and as you asked in your notes: **it works only with AI.**

- **For every client and every industry:** each company writes its own scenarios (the customer, the reason for the call, their mood, a difficulty level, what a good answer looks like, linked to the scorecard's categories). Ready-made examples help them start.
- **The company's own instructions and knowledge (5 Nov, evening):** a scenario can have instructions in plain words (a prompt: who the customer is, what they want, how they behave), plus the knowledge-base articles or documents the customer and the scorer should know (prices, procedures, products). The AI customer acts on them, and the score checks the agent's answers against them. Q-smart's own rules always come first: the AI customer stays in its role and never uses real people's data.
- **AI only:** an AI model plays the customer in every conversation. The engine picks the model that passed the role-play test set (section 7). There's no scripted "fake" mode.
- **Text or voice:**
  - Text practice uses only the AI model.
  - Voice practice: the agent speaks into the microphone, their words are turned into text, the AI answers as the customer, and a natural **ElevenLabs** voice speaks the answer. One good voice quality for everyone, so it always sounds like a finished product (5 Nov, evening).
  - The practice call's audio is never stored, only its text, like real calls (6 Nov).
- **During the call:** live hints, such as the customer's mood, as in today's simulator.
- **After the call:** a strong model scores the practice against the company's scorecard, with quotes and tips. The result goes to the Q Trainer dashboard, the agent's profile and coaching.
- **Suggestions:** the AI trainer suggests a scenario to an agent who is weak in a category, based on their real reviews.
- **In Q-smart's own look and colours.**
- **How clients pay (your idea of 5 November, evening):** Q Trainer is an **add-on to the basic plan**, in a few sizes by **practice minutes a month**. Text practice is included. Every size has the same natural voice. At 80% of the minutes the admin is warned; at 100% voice practice stops until next month, unless the admin buys an extra pack. Nothing per voice or per use.
- **What a minute costs us** (corrected on 5 November, evening; measured for real in Phase 9): about **$0.02–0.03 a minute** with our own set-up. The customer's voice is ElevenLabs at $0.04 per 1,000 characters (the customer speaks about half the time, roughly 450 characters a minute). Speech-to-text costs $0.002–0.007 a minute, a small AI writes the customer's lines for a fraction of a cent, and the score at the end costs about a cent. **A 4-minute practice call costs about €0.08–0.10**, less than your friend's €0.20–0.30 for 3–5 minutes. ElevenLabs' ready-made voice agents ($0.08 a minute plus the AI) are used only if they're clearly better, and cheaper voices (Google, Microsoft, OpenAI) are tried with the same listening test. The add-on's sizes and prices are set in Phase 10 with a margin.
- **The demo, free:** ElevenLabs' free plan gives 10,000 credits a month (about 10–20 minutes of speech, Bulgarian included) and 15 minutes of its voice agents, with no card. It has **no commercial licence**: fine for building and testing. Before showing Q Trainer to clients, the Starter plan is needed ($6 a month: 30,000 credits and the commercial licence). That's your decision when the time comes.
- Today's simulator rules (segments, levels, customer types, indicators, the score) come over and are checked by tests.

## 10. Integrations (later)

**The rule for all of them:** Q-smart never stores call audio. It keeps the conversation's details, a link back to it, the text (deleted after the number of days each company chooses) and the review.

**How it works:**
- Each company connects its own accounts. The keys are stored encrypted, and nobody pastes keys into chats or files.
- New conversations arrive by themselves (webhooks), and sampling rules decide which ones get a transcript and an AutoQA score.
- When there's no ready transcript, a speech-to-text service (about $0.10–$0.40 per hour of audio) transcribes the recording from its link, without the audio passing through our storage.

**Transcripts: the cheapest source first (your idea of 5 November, evening):**
1. **The platform's own transcript**, when the company has one and its language is supported. It costs us nothing. Voiso has them (18 languages, not Bulgarian), Ringover has them (whether its API gives them is to check), and Modjo's can be read through its API with a key from Modjo's *Settings › Integrations › API* (other tools already take Modjo's transcripts this way, without the audio).
2. **Our speech-to-text**, for platforms that keep only recordings (Myphoner, MMD Smart) and for languages the platform doesn't support (Bulgarian on Voiso). The audio is read from the platform's link and never stored.
3. **A transcript file uploaded by hand**, for anything else.

Zendesk's tickets, chats and e-mails are text already.

| Platform | What it is | What Q-smart would take from it | To check when we get there |
|---|---|---|---|
| **Voiso** | Cloud contact centre | Calls, agents, queues; a recording link that works for 24 hours (Pro Plus plan); Voiso's transcripts (18 languages, not Bulgarian) | Can the API give a fresh recording link later? |
| **Ringover** | Cloud phone system | Ended calls (webhook), recordings and Ringover's transcripts | Which plan includes transcripts; the exact API fields |
| **MMD Smart** | To confirm: I found no public documentation | Calls and recordings (it has no transcripts, as you told me) | How its API works (you'll show me) |
| **Zendesk** | Help desk | Tickets, chats and e-mails (written conversations to review), Zendesk Talk calls, satisfaction ratings | Which Zendesk plan you have |
| **Myphoner** | Cold-calling and telesales tool | Calls, call outcomes and recordings (no transcripts) | Its API is on the middle and top plans; can recordings be read through it? |
| **Modjo** | Conversation intelligence (records and transcribes sales and service calls) | Calls and the transcripts Modjo already made | It has an API with keys; which of its calls read the transcripts |

**Before using real data:** if an account belongs to a company (for example your employer) and holds real customers' conversations, get the company's written OK first, and the speech-to-text provider must sign a data processing agreement. Otherwise we use test conversations.

## 11. Hosting, addresses and sign-in

**Firebase Hosting, free.** One Firebase project can host up to 36 sites, each with its own free, permanent address and HTTPS. The names are first come, first served, so we pick them when we create the project:

| Site | Free address (example) |
|---|---|
| The app | qsmart-app.web.app |
| Official website | qsmart.web.app |
| Help Center | qsmart-help.web.app |

- **Free allowance:** 10 GB of files and 10 GB of downloads a month for all the sites together. That's plenty for a demo.
- **They aren't sub-domains of one name** (Firebase can't give you app.qsmart.web.app), but each address is free and permanent.
- **Your own domain is optional, later.** When you're selling, buy one anywhere (about $10 a year) and connect it to the same sites in a few minutes. Until then, the e-mails Q-smart sends itself (reports, reminders) come from a general address and can land in spam more often. That's fine for a demo.

**How the sites get online: from GitHub, automatically (5 Nov, evening).** When finished, tested work reaches `main`, GitHub runs all the checks and, only if they pass, publishes the sites to Firebase Hosting and the server to Cloud Run. Every change that waits to be merged also gets its own temporary preview address, to try it before it goes live. GitHub signs in to Google with a short-lived pass instead of a stored key (Workload Identity Federation). Publishing from your PC is only for the very first set-up or an emergency.

**Sign-in: Firebase Authentication.**
- E-mail + password, Google, Microsoft, "forgot password", invitation links, and two-step sign-in (a free upgrade turned on in Phase 10).
- Free up to 50,000 users a month. Google sign-in works on your PC and on the free addresses without a domain, and Firebase sends the sign-in e-mails itself.
- **The one catch:** Firebase keeps the accounts (names, e-mail addresses, password fingerprints) in the USA, and there's no EU option. This is legal and common. If a strict client ever objects, Firebase can export all accounts, passwords included, to another sign-in system.

**All client companies share one Firebase project (5 Nov, evening).** Firebase only proves *who* a person is. *Which* company's data they see is decided by Q-smart's database, behind the company wall, like all the other data. That's how Slack, Notion and Zendesk work: one sign-in system, many companies.
- A person has one account. If the same e-mail address is used in two companies, it's one account with two memberships and a company switcher.
- An admin sees only their own company's people (from our database, never Firebase's full list).
- Removing a person from a company removes only that membership. The account is deleted when it has no company left.
- A big client that wants its own sign-in rules (single sign-on with its own Microsoft or Google accounts, or two-step sign-in for everyone) gets a *tenant* inside the same project (Google Identity Platform), not a new project. That upgrade needs the Google Cloud card (Phase 10). It's free up to 50,000 monthly users with e-mail, Google or Microsoft sign-in; a company's own single sign-on has a small price per user, checked when a client asks.
- **The demo has its own free project**, because its made-up accounts share the password `password` and get reset, so they should never sit next to real accounts. A second project costs nothing: Firebase's free plan counts per project, and one Google account can create several.

## 12. Security: how Q-smart is protected

**Today's app already has security. It's in the server files, which is where it belongs:** a visitor can always change the pages in their own browser, so the pages are never trusted.
- Passwords are kept only as fingerprints (bcrypt), and a wrong user name takes as long to check as a wrong password, so nobody can find out which accounts exist.
- Security headers and a content security policy, against code injected into the pages.
- Changes sent from another website are refused (protection against "CSRF").
- The sign-in cookie can't be read by scripts, travels only over HTTPS, and ends after 12 hours without use.
- Limits against password guessing, and every route checks the role on the server.
- A security audit of 24 October with 36 security tests (`docs/audit/SECURITY_AUDIT.md`, `test/security.test.js`).

**What v2 adds, so it's ready for clients (5 Nov, evening):**

| Layer | What protects it |
|---|---|
| **The company wall** | Built into the database (row-level security). Tests sign in as company A and try to reach company B on every route, MCP tool and webhook |
| **Sign-in** | Firebase's protection against password guessing; two-step sign-in, required for admins; Google and Microsoft accounts |
| **Every request** | The server checks the person, the role and the company on every route, and checks every piece of data that comes in. Limits per person, per key and per address |
| **The pages** | React writes text into the page safely by default, so the content security policy can be strict (today's app still needs inline code) |
| **Secrets** | Google Secret Manager online. Clients' keys are encrypted. API keys are stored only as fingerprints and shown once |
| **Outside systems** | Webhooks signed with a secret and a time stamp, so an old message can't be sent again. MCP has the same permissions as the pages, and no delete actions |
| **AI reviews** *(6 Nov)* | The conversation is passed to the AI as material, never as instructions, so tricks written into a chat or a call can't change a score; suspicious ones go to a person (section 7) |
| **Spending** *(6 Nov)* | Alerts at €1, and an automatic stop at about €5 that switches Google's billing off by itself (section 14) |
| **The activity log** | Every change, sign-in and export: who, what and when |
| **Automatic checks on GitHub** (free for public repositories) | Libraries with known problems (Dependabot), passwords pushed by mistake (secret scanning), code scanning (CodeQL), and an automatic attack scan of the test version (OWASP ZAP) |
| **The checklist** | OWASP ASVS 5.0, level 2: the standard list of what a business web app must do |
| **Before the first client** | An independent penetration test (Phase 10), backups with a restore test, and a data-breach plan (report within 72 hours, GDPR art. 33) |
| **Least access** | The server's database user can't pass the wall; your Google and GitHub accounts use two-step sign-in; nobody opens a company's data without its permission (the platform owner area) |

## 13. Cookies, browser storage and caching (EU rules)

**The rule.** Storing or reading anything on a person's device needs their consent, unless it's strictly necessary for the service they asked for (ePrivacy Directive, article 5(3)). This covers cookies and also the browser's local storage and similar techniques (EDPB guidelines 2/2023). GDPR applies on top to personal data. An EU reform, the "Digital Omnibus", may change parts of these rules, but it isn't law yet (November 2026), so Q-smart follows today's rules. *(5 Nov, evening)*

**In the app: only what's strictly necessary, so no cookie banner.**
- Kept in the browser: Firebase's sign-in data, the language, light/dark and the theme, which menu sections are folded, and "don't show this again" choices (these are also saved with the account).
- No tracking or advertising cookies, no Google Analytics, no other company's tracker. Usage figures come from our own server.
- A **"Cookies and storage" page** lists each item, what it's for and how long it stays (Phase 10, with the privacy policy).

**On the website and the Help Center:** no cookies at the start, so no banner. If marketing tools are ever added, a banner comes with them: "Reject all" as easy as "Accept all", nothing loads before the choice, and the choice can be changed at any time.

**Other companies' content.** Fonts are served by Q-smart itself; today's app already does this. (In 2022 a court in Munich awarded damages because a website loaded Google's fonts from Google without consent.) Videos in the Help Center load only after a click. Card payments happen on Stripe's own pages.

**Caching (copies kept to make things faster):**
- The browser keeps copies of the app's own files (code, pictures, fonts). That's allowed, as part of the service. Each file's name changes with each new version, so updates show at once.
- Personal data is never kept in shared caches: the server's answers are marked "don't store", so neither the browser's cache nor Google's network keeps them.
- At sign-out the app clears what it kept in memory and in the browser. That matters on shared computers in contact centres.
- No offline copy of personal data on the device.

## 14. Costs

| Stage | You pay |
|---|---|
| **Building (phases 0–9)** | **€0, no card.** The demo's AI runs on free plans that don't train on our data, and its natural voice on ElevenLabs' free plan. Paid models (Claude, GPT…) only if you want to compare them, per use. GitHub is free too: the repository is public, so its automatic tests have no minutes limit. |
| **Online demo (phase 10)** | **€0 a month** within Google's free allowances: a card on file, at most one server, an alert at €1, and **an automatic stop** (6 Nov): if spending ever reaches about €5, Google's billing is switched off by itself (Google's documented method). The demo then goes offline until you switch it back on (soon: Google may delete stopped resources after a while; the database is at Neon and isn't affected), but a bug or an attack can't run up a bill. Stripe stays in free test mode. If you show Q Trainer to clients: ElevenLabs Starter, $6 a month (your decision). |
| **First clients** | Stripe's share of each payment, the AI used for their data (free where the AI company's terms allow it, otherwise the cheapest paid model that passes), a paid database plan once the free one is too small, a paid e-mail plan if needed. All of this grows with your clients and is covered by their subscriptions. |
| **Always** | AI, voices and speech-to-text for clients: they cost us per use, and clients pay for them as add-ons with monthly allowances that stop at the limit (section 6) |

No domain is needed to build or to demo. At the first paying client, a domain (about €10 a year) helps Q-smart's own e-mails reach inboxes instead of spam: your decision then (6 Nov).

**One database or several? (the final answer, 5 November)**

All client companies share **one** database, kept apart by the company wall. There is never a database per company. Separate databases exist only for separate *purposes*:

| Database | What's in it | When | Cost |
|---|---|---|---|
| **Demo database** | Your made-up demo company | From Phase 0 | Free, always (Neon's free plan) |
| **Test databases** | Throw-away copies the automatic tests create and delete | Every test run, on your PC or on GitHub | Free |
| **Clients' database** | All client companies together, each behind the company wall | Created when your first client signs | Free to start. Once real clients depend on it, it moves to a small paid plan, paid by their subscription, because the free plan pauses when its monthly allowance runs out |
| **A big client's own database** | Only if a client asks for it and pays for it | Maybe one day | Paid by that client |

Sign-in is set up the same way: one free Firebase project for the demo and one for all clients together, so demo accounts and client accounts never mix. Both are free (Firebase's free plan counts per project). Client companies never get a project each: inside the clients' project, the database keeps them apart (section 11).

## 15. What only you can do, and when

| When | What |
|---|---|
| **Phase 0** | ✓ The repository `qa-platform-q-smart-v2-code-restructure` exists, public by your choice · create a free Firebase project with your Google account (no card; I'll guide you click by click) · create a free Neon account (no card) |
| **Every phase** | Try what was built and tell me what to change |
| **Phase 3b** | Free accounts with Groq and Cloudflare (no card). Their keys go into Q-smart's AI settings (never into the chat or a file). · Score the 30–50 sample conversations for the AutoQA test set (I prepare them). |
| **Phase 8** | A free Mistral account (it asks for a phone number, not a card; switch training off under Admin Console › Privacy); its key goes into Q-smart's AI settings. Optional: your Claude and OpenAI keys, to compare paid models. |
| **Phase 9** | A free ElevenLabs account (no card); its key goes into Q-smart's AI settings. Before showing Q Trainer to clients: decide on ElevenLabs Starter ($6 a month, commercial licence) |
| **Phase 10** | A card on the Google Cloud account (an alert at €1 and the automatic stop at about €5; I'll guide you) · a Stripe account (test mode) · a free Microsoft app registration for Microsoft sign-in (I'll guide you) · before the first client: a lawyer checks the AI companies list, the DPA and the AI Act paperwork |
| **Integrations** | Access to the platforms, and permission to use their data |

## 16. Open questions (answer by number)

1. ✓ Yes: Phase 0 starts (5 November).
2. ✓ Done (5 November): this folder is the project, connected to the public GitHub repository of the same name, with a fresh history. Work happens on the branch `qa-platform-q-smart-v2-code-restructure`, and finished work goes into `main`.
3. ✓ Done (6 November): the Firebase projects are **Q-smart** (`qsmart-official`, for clients, the website and the Help Center; extra sites `qsmart`, `qsmart-app`, `qsmart-help` if they were free) and **Q-smart Demo** (`qsmart-demo`), with e-mail and Google sign-in. Signing in with Google on the real demo project works.
4. ✓ **Yes (5 November, evening): the menu as apps.** Q-smart becomes a set of apps behind one sign-in and one address, with an app switcher like Google's or Atlassian's. (Jira and Confluence are on the same address, `…/jira` and `…/wiki`, with one sign-in.)
   - **Quality**, the main menu: Home, reviews, disputes, calibration, analytics, performance, coaching, tasks, planning and reports.
   - **Workforce**: Team today, attendance, time off, shifts & rota, capacity. It leaves Admin › People and becomes a product of its own.
   - **Learning**, with a Confluence-like look: knowledge base, quizzes, newsletters, tools.
   - **Q Trainer**.
   - **AI**: Q-Intelligence, the AI agents, transcripts and the AI Hub, in one place instead of four.
   - **Admin**: the settings, as today.

   A company sees only the apps it has, so each app can be sold on its own. Learning stays inside the app instead of on a separate site: each app's code loads only when it's opened, so it's just as fast, and a separate site would need a second sign-in (the browser keeps a Firebase sign-in per address). The public website and the Help Center stay separate sites, because visitors and Google must reach them without signing in. Separate sites for the apps wouldn't save memory or free allowance either: Firebase's free allowance is shared by all the sites of a project; each site would carry its own copy of the shared code (React, the design, sign-in), which the browser can't share between two web.app addresses; and the server and the database do the same work either way.

---

## 17. Technical appendix (for Claude and future developers)

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
  - **Why Neon** (checked 5 November, evening): free with no card and no time limit (per project: 0.5 GB and 100 compute hours a month; up to 100 projects), an EU region, it sleeps when unused and wakes in a fraction of a second, instant copies for tests (branches), and plain PostgreSQL, so we can move at any time.
  - **The alternatives:** Supabase (free 500 MB, but free projects pause after 7 days without use, and it brings its own sign-in, which we don't need); Firebase Data Connect on Cloud SQL (the closest to Firebase, but about $9 a month after a 3-month trial); Cloud SQL in Belgium (where the clients' database can move later if it's ever worth it: the same PostgreSQL, a few hours' work).
- Sign-in: the Firebase Authentication web SDK in the pages. The pages send the Firebase ID token in the `Authorization` header, and the server checks it with `firebase-admin`. Company, role, teams and workspaces come from PostgreSQL. Invitations and password links are made with the Admin SDK. Firebase's own protection against password guessing replaces today's lock-out rule. Tests use the Firebase Auth emulator, never real accounts.
- AI: the open-source AI SDK (by Vercel, no Vercel hosting needed) as the common layer for Anthropic (direct and on Vertex AI), Google (AI Studio and Vertex AI), OpenAI, Mistral, Groq and OpenAI-compatible endpoints. It handles structured output with zod, tool calls and streaming.
- Tests: Vitest (rules and server) and Playwright (browser), on a real throw-away PostgreSQL, never the demo data. On your PC the tests start PostgreSQL themselves (embedded-postgres: real PostgreSQL, nothing to install, no admin rights); on GitHub, a PostgreSQL service container (6 Nov).
  - GitHub Actions runs all the checks on every push: types, lint, rules, server and browser tests. It's free with no minutes limit, because the repository is public.
  - Accessibility checks with axe in the browser tests; speed checks with a year of made-up data for 500 agents (today's `test/gen-large.js`); a check that every text has its Bulgarian and French translation.
  - AI tests use recorded answers, so they cost nothing and give the same result every time. The AI test sets run on demand.
- Dependabot (free) keeps the libraries up to date and warns about security problems.
- Hosting (Phase 10): Firebase Hosting, with one site per app and `/api/**` and `/mcp` rewritten to Cloud Run; Cloud Run in europe-west1 with 0 to 1 instances for the demo; a Docker image for the server, built by Google (no Docker needed on your PC).
- Publishing (Phase 10): GitHub Actions on every merge into `main` runs the checks, then `firebase deploy` for the sites and a Cloud Run deploy for the server; pull requests get Firebase Hosting preview channels; Google access through Workload Identity Federation (no stored key).

### The company wall (multi-tenancy)
- Every company table has `company_id`. PostgreSQL Row-Level Security shows a row only when `company_id` matches the signed-in person's company, which is set per request with `SET LOCAL` (`set_config(…, true)`) inside a transaction. Without a company, nothing is visible.
- People (`users`) are shared by the companies they belong to; their wall rule goes through `memberships`. At sign-in, one narrow function (`memberships_for`) returns the companies of the checked Firebase account and nothing else.
- Links between company tables point at the same company (composite keys such as `(team_id, company_id)`), so a row can never point into another company. *(Built in Phase 0, 6 Nov: `packages/db`.)*
- The server's database user does not own the tables and cannot bypass the wall.
- Automatic tests sign in as company A and try every route against company B, including the MCP tools and the webhooks.
- A connection router (company → database) supports the demo database, the production database, and later a dedicated database for a big client.

### Roles and permissions
- Roles admin, reviewer, lead, trainer and agent, plus workspaces, as today. They're checked on the server for every route with NestJS guards. Today's role-matrix and permission tests become v2's.
- The role `qa` of today's app is called `reviewer` in v2 (5 November, evening): EN Reviewer · BG Оценител · FR Évaluateur. When the demo data moves over, `qa` becomes `reviewer`.
- A `platform_admin` role outside the companies (you): create, suspend and delete companies; see plans, seats and usage; switch features per company. Support access to a company only with its permission and for a limited time, and every action is logged in that company's activity log.

### Sign-in and companies
- One Firebase project for all client companies (and one for the demo). A Firebase account is one row in `users` (by its Firebase id); `memberships` hold the company and the role. The server reads them on every request (cached for a short time), never from the browser.
- The company switcher sends the chosen company with each request; the server accepts it only if the person has a membership there, and sets it for the company wall.
- Admins list and manage people from `memberships`, never from Firebase's user list. Removing a member deletes the membership; the Firebase account is deleted when no membership is left.
- Later, for clients with their own sign-in: Identity Platform multi-tenancy, one tenant per such company (stored on `companies`), in the same project.

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
- **Data class:** every job is marked `test` (demo or tests) or `client`, for the usage figures. Since 5 November (evening), both can only go to models with `no-train-dpa` terms; `client` jobs (anything containing a client's personal data or documents) also follow the company's allowed providers (for example EU only). This is enforced in the engine and covered by tests.
- Every call is recorded: company, team, user, feature, provider, model, tokens, cost, wait time, status, fallback used. The team's monthly limit is checked before each call.
- Prompt caching where the provider supports it; a cache of general answers (never personal ones) for Quinn.
- Answers are validated against zod schemas. An invalid answer is retried once, then sent to the next model.
- When every provider is unavailable, that feature says so and everything else keeps working.
- The "Python door": a job type can be routed to an OpenAI-compatible endpoint on our own server later.
- The accuracy score: for conversations scored by both the AI and a reviewer, the agreement per category (the same answer, or partial credit by distance on point scales; N/A left out), averaged per category, scorecard, AI model and period. Bands as in Zendesk QA: high 75–100%, medium 25–74%, low 0–24%. A category under the company's bar is flagged and can pause AI scoring by itself. The sample is random and stratified (agent, channel, language), and the brake needs at least 20 compared conversations per category.
- AI reviews (6 Nov): a fixed model version and settings (temperature 0), structured output with a quote for every answer, and the prompt and scorecard versions stored with each review. The conversation is wrapped as data, never as instructions, and checked for injection attempts before scoring.
- The AI Act high-risk file (section 7): risk management, technical documentation (annex IV), the logs above, human oversight in the pages (the accuracy score, samples, disputes, the off switch), accuracy figures from the test sets and the accuracy score, instructions for clients, registration in the EU database, and monitoring after launch. Ready before 2 December 2027.

### Q Trainer
- Scenario = persona, reason, mood, level, segment, knowledge-base articles, expected behaviours mapped to scorecard categories.
- A turn: the agent's text (voice → speech-to-text: the browser's own recognition in the demo, a `no-train-dpa` provider for clients) → `sim.customer_turn` (the persona and scenario as instructions) → the customer's text → `tts.speak` for voice practice (browser voices or ElevenLabs).
- The end: `sim.score` (the scorecard as a schema) → result, quotes and tips. A webhook fires: practice call finished.
- Today's `sim.js` rules move to `packages/shared` with their tests.

### MCP server
- The official MCP TypeScript SDK, Streamable HTTP transport, at `/mcp`, as a module of the server.
- Auth: an API key per company with access per area (none / read / write); OAuth sign-in for people can be added later.
- Tools map to the same services the pages use, so the permissions and the company wall are the same. No delete tools. Rate limits; every call goes to the audit log.

### Developer platform
- API keys: a visible prefix plus a long random secret; only a SHA-256 fingerprint is stored; access per area, end date, last used, switch-off; shown once.
- Outgoing webhooks: an HMAC-SHA256 signature over the time stamp and the body, refused if older than 5 minutes (no replays); retries with growing pauses for up to 24 hours (Cloud Tasks); a delivery log; an endpoint is switched off after many failures, and the admin is told.
- Incoming webhooks: one address and secret per company and connector; checked with the platform's own method (signature or token); each event is handled only once.
- A general import route for conversations (details plus a transcript or a recording link) for companies without a ready connector. The OpenAPI reference and the Developers guide are generated from the code.
- AI reviews (from our AutoQA or a client's AI through MCP) are stored with their source (the model and its version, or the API key's name) and count as AI reviews. Disputes on them go to a person.

### Security (technical)
- OWASP ASVS 5.0 level 2 as the checklist; security tests for every route (role, company wall, input checks).
- A strict content security policy (no inline scripts), HSTS and the other security headers, through Firebase Hosting and the server.
- API answers with `Cache-Control: no-store`; the app's files with a version in their name and a long cache; sign-out clears TanStack Query's memory and the browser storage.
- GitHub: Dependabot, secret scanning with push protection, CodeQL, and an OWASP ZAP baseline scan of the test version on every change.
- Least access: the server's database user can't bypass the wall; the Cloud Run service account has only what it needs; Google access from GitHub through Workload Identity Federation.

### Billing
- Stripe Checkout and the Customer Portal; Stripe webhooks (`checkout.session.completed`, `customer.subscription.*`, `invoice.*`) update seats, plan and limits. The webhook signature is checked.
- Keys are encrypted per installation (as today). During the PC phase, the Stripe CLI forwards test webhooks to localhost.

### Integrations (later)
- One connector shape for every system: `verifyWebhook`, `listConversations(since)`, `getConversation(id)`, `getRecordingLink(id)` and `getTranscript(id)`; the last two may answer "not available".
- Voiso: API v4 only, with scoped Bearer keys (the legacy APIs end on 31 March 2027). The `call.recording.available` webhook gives a 24-hour pre-signed MP3 link (Pro Plus). Transcripts come from `GET /api/v4/reporting/cdrs/{id}/speech_analytics`.
- Transcript sources, cheapest first, per company and language: the platform's own transcript (`getTranscript`), then `stt.transcribe`, then a file uploaded by hand.
- Speech-to-text goes through the AI engine (`stt.transcribe`): `{ audioUrl, language, speakers }` returns utterances `[{ speaker, start, end, text }]`.
- Audio is never written to disk or storage.

### Data protection
- In the EU: the database (Neon), the server (Belgium) and the files (Google Cloud Storage). Sign-in accounts are in Firebase Authentication (USA, under Google's EU data terms). For clients' data, the AI runs only on plans that don't use the data for themselves (`no-train-dpa`), and in the EU wherever possible (Claude and Gemini on Vertex AI in europe-west1, or Mistral).
- Transcripts are deleted after the company's chosen number of days (decision of 4 November); reviews stay.
- Training on clients' data: never by default, and never through a line in the general terms (section 7). Only fully anonymised transcripts (names, numbers and other identifiers removed and checked), only with the client's separate written agreement, only for our own models, and never sent to an AI plan that may train.
- When a company leaves: a full export of its data, then deletion within 30 days. Copies in backups disappear as the backups expire, at most 30 days later. This goes into the DPA (6 Nov).
- Activity log, personal-data export, retention jobs.

### Monitoring and backups
- Structured logs (Cloud Logging), an error tracker on its free plan (for example Sentry), and a free uptime monitor.
- Neon's point-in-time restore, plus a nightly export to EU storage once online.
- Spending (6 Nov): budget alerts at €1; at about €5 a budget notification (Pub/Sub) runs a small function that detaches the billing account (Google's documented way to cap costs); Cloud Run limited to one instance.

### Moving today's demo data
- A script reads today's `data.json` and fills the demo database, one area per phase (the role `qa` becomes `reviewer`). The demo company can be reset with one button.

---

## 18. Sources checked on 5 November 2026

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

**Added on 5 November (evening):**
- Databases: [Neon vs Supabase free plans](https://neon.com/guides/neon-vs-supabase-free-plan) · [Supabase's free plan (pauses after 7 days)](https://costbench.com/software/database-as-service/supabase/free-plan/) · [Firebase Data Connect pricing (3-month trial, then Cloud SQL)](https://firebase.google.com/docs/data-connect/pricing)
- Firebase: [Cloud Run needs a billing account](https://firebase.google.cn/docs/hosting/serverless-overview) · [free limits count per project (Firebase team)](https://groups.google.com/g/firebase-talk/c/-OMy4_zXdRc) · [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)
- ElevenLabs: [plans](https://elevenlabs.io/pricing) · [API prices](https://elevenlabs.io/pricing/api) · [voice agents](https://elevenlabs.io/pricing/agents) · [languages per model](https://elevenlabs.io/docs/overview/models)
- [Brevo's free plan (300 e-mails a day)](https://www.emailtooltester.com/en/reviews/brevo/pricing/)
- GitHub: [rulesets: free only on public repositories](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) · [plans (2,000 Actions minutes a month for private repositories)](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- EU AI Act: [annex III (high-risk uses; point 4 is work)](https://artificialintelligenceact.eu/annex/3/) · [article 6 (profiling always counts as high-risk)](https://artificialintelligenceact.eu/article/6/) · [the July 2026 change: annex III duties from 2 December 2027](https://natlawreview.com/article/eu-digital-omnibus-ai-enters-force)
- GDPR: [article 22 (decisions by automated means only)](https://gdpr-info.eu/art-22-gdpr/) · [Italy fines OpenAI €15 million (December 2024)](https://www.euronews.com/2024/12/20/italys-privacy-watchdog-fines-openai-15-million-after-probe-into-chatgpt-data-collection)
- Cookies: [ePrivacy Directive, article 5(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058) · [EDPB guidelines 2/2023, final version](https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf) · [the Digital Omnibus cookie changes are still being negotiated (October 2026)](https://www.heuking.de/en/news-events/newsletter-articles/detail/cookie-consent-under-the-digital-omnibus-planned-changes-and-technical-implementation.html) · [Munich court, Google Fonts, 20 January 2022](https://www.gesetze-bayern.de/Content/Document/Y-300-Z-GRURRS-B-2022-N-612?view=Print)
- Modjo: [API key and call import](https://help.modjo.ai/en/articles/6037933-importer-un-appel-reunion-manuellement) · [a tool that reads Modjo's transcripts without the audio](https://docs.hyperline.co/integrations/modjo.md) · [Modjo's phone integrations (Aircall, Ringover and others; no Voiso)](https://academy.modjo.ai/en/admin/integrations/voip/other-voip)
- [Supabase: free projects pause after 7 days and are resumed by hand](https://supabase.com/docs/guides/platform/free-project-pausing) · [Supabase pricing (Pro from $25 a month)](https://supabase.com/pricing) · [Neon: sleeps after 5 minutes and wakes by itself in a few hundred milliseconds](https://neon.tech/docs/introduction/scale-to-zero)
- [Zendesk QA: the AutoQA dashboard and its accuracy score](https://support.zendesk.com/hc/en-us/articles/9019507481242-Understanding-the-AutoQA-dashboard) · [the EU Court's SCHUFA judgment (C-634/21, 2023): a score can be an automated decision](https://curia.europa.eu/juris/liste.jsf?num=C-634/21)
- [Google Cloud: capping costs by switching billing off automatically](https://cloud.google.com/billing/docs/how-to/notify)
