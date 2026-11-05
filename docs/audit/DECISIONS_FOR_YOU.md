# Decisions for you, and answers to your 18 points

Written on 26 October 2026 while you were asleep. Everything below is on the branch `q-smart-full-audit`.
Nothing was merged into `main` and nothing was pushed.

---

## A. Things that need your OK (I did not do them)

### A1. The side menu: separate panels with a "Back" button (your points 2 and 10) — ✅ BUILT after your yes

Built on 26 October as proposed. "Admin ›" reads **"Set-up ›"** for QA, team leads and trainers, because they only have the scorecard pages in it. The sections inside both panels fold and unfold like the main menu, and in the icons-only menu resting the mouse on an icon opens its list. The proposal was:

**How it would work** (like Modjo's settings, or Facebook's menus):

```
MAIN MENU                          ADMIN PANEL (after clicking "Admin ›")
─────────────                      ──────────────────────────────────────
Home                               ← Back to the main menu
Quality                            PEOPLE
Analytics                            Users · Teams · Workspaces · Skills
Coaching                           QUALITY SET-UP
Performance                          Scorecards · Categories · Root causes · Auto QA
Planning                           SYSTEM
Compliance & CX                      Roles & permissions · Integrations · Notification rules
Reports                              Email templates · Backups & data · Audit log · System settings
───────────
🎓 Learning ›                      LEARNING PANEL (after clicking "Learning ›")
⚙ Admin ›                         ← Back · My Learning · Knowledge Base · Quizzes · Newsletter
                                   PRACTICE: Transcripts · Call Simulator
```

- The main menu keeps only the everyday work, so it gets much shorter.
- "Learning ›" and "Admin ›" sit at the bottom. They only show for the people who can use them.
- If you open an admin page from a link, the Admin panel opens by itself. "← Back" returns you to the last page you were on.
- Agents would see an even shorter main menu: their dashboard, their reviews, their coaching and Learning.
- Optional, like Ringover: in the narrow icons-only sidebar, the small pop-out menu opens when you rest the mouse on an icon, with no click needed.

**Your choice:**
- **Yes:** build it like this.
- **Only Admin:** build only the Admin panel.
- **No:** keep the current sidebar.

### A2. Merge the work into `main`

All the work is on the branch `q-smart-full-audit`. You said "Not yet" twice, so I left it. When you are happy, say **"merge"**.

### A3. Restart your own server

Your server on port 3100 still runs the old code. The new features need a restart:
- widget sizes
- saved columns
- scorecard tags
- the category-name fix

In the terminal where it runs, press Ctrl+C, then run `npm.cmd start`.

### A4. Use the same Filters and Columns on the other tables

The Reviews table now has the Zendesk-style **Filters** side panel and **Columns** chooser. It is built so the same parts can go on these tables too:
- Users
- Disputes
- Quick Flags
- Teams
- Tasks list

Say yes and I will add them.

### A5. Kainami: upload a recording and try simulator scenarios "from your name"

I did not do this, for two reasons:
- It needs a real recording file from you.
- Every simulator exercise there is paid from the other admin's API credit.

If you want it, give me the file, say which scenarios, and confirm it is OK to spend his credit.

### A6. SaaS: one database per company, or one shared database

Please choose before the SQLite step. My recommendation is in **C1** below.

### A7. AI features: model, voices and the API key

These come after SQLite, as your CLAUDE.md says. My recommendation is in **C4**. You give the key when you are ready. It will be kept on the server, never in the page.

---

## B. What was done, point by point

| # | Your point | Status |
|---|---|---|
| 3 | Clicking a group's name, not only its icon, opens its first page | Done (earlier) |
| 4 | The guide no longer disappears. Wide tables get a second scrollbar on top, and it shows **only when the bottom one is off the screen** | Done |
| 5 | **Reviews: a "Filters" button** opens a side panel with every filter. Filters in use show as chips with ✕. **"Columns"**: tick the columns you want and drag them into your order; it is saved in your account. 100 rows per page | Done (other tables wait for A4) |
| 6 | **Dashboard**: "Date is …" chip plus "+ Filter". Other filters appear only when used, each with ✕. **Widgets of any width and height**: drag the right edge, the bottom edge or the corner; double-click for automatic height. The 1/5 and 1/4 sizes are gone | Done |
| 7 | **Dashboard / Views tabs**: your own views live in their own tab, so the main dashboard never gets messed up | Done |
| 8 | **Tasks**: Compact cards like Jira (⌄ opens one card), Detailed, or List view. Your choice is remembered | Done |
| 9 | Drop-downs restyled | Done (earlier) |
| 11 | Disputes: a long message stays on one line with "…"; the eye shows all of it | Done (earlier) |
| 12 | **Scorecards module**: tabs with counts (Scorecards, Categories, Root causes, Auto QA). Categories as cards or table, with search, how many scorecards use each one, and its average in the reviews. Root causes get a chart | Done |
| 12 | **Bug found and fixed**: the 7 library categories in your real data had no visible name. They were saved in an older format, and "Add from library" copied them without a name | Fixed |
| 13 | Analytics › Agents: type chips for All, Calls, Chats, E-mails and Other | Done (earlier) |
| 14 | Agents chart: one wider bar per period (weeks inside a month, months inside a year). Resting the mouse shows the average, the categories and the reviews. Bars are pale until you point at them | Done (earlier) |
| 15 | The Administration team is hidden from analytics, filters and reviews. It is built in for every future company | Done (earlier) |
| 16 | **Team Review**: ⌄ folds a team card to its key numbers (team lead, reviews, average, pass rate). The "All agents" table folds too. Views: Cards, Compact or Table | Done |
| 17 | **Category Stats**: one modern tile per category. **Click a tile** to open a pop-up with:<br>• the score by team<br>• the items answered "No"<br>• the best agents and those who need support<br>• the lowest reviews<br>Mistakes and root causes open their own pop-ups too | Done |
| — | Demo reviews of every type in seed.js and data.json (3 per agent, per type, per month). Free **tags** on scorecards, so any scorecard works for any conversation | Done (earlier) |

Every change was tested in the browser on a copy of your data, never on your real data.json. All automated tests pass (135).

### The audit again: every action, every role

- **Server:** all 142 server actions were tried by admin, QA, team lead, trainer, agent and by someone not signed in, with empty and with wrong input.
  - Nothing crashed.
  - No role got into something it should not.
  - Nothing wrong was saved.
  - This is now a permanent automatic test.
- **Browser:** every page (48) was opened as each role.
  - No page had an error.
  - Each role is sent away from exactly the pages it may not use.
  - An agent sees only their own reviews and conversations.
- **Problem found and fixed:** the admin action "Refresh seed.js" (Backups) could write a test copy's made-up people into the project's **seed.js**. The new test did exactly that once.
  - seed.js was put back from the saved version straight away: 17 users and 842 reviews, as before.
  - Your **data.json was never touched**.
  - The action now refuses unless the app runs on its own data.json, and the test checks after every run that seed.js and data.json are unchanged.
- The details are in TEST_RESULTS.md, FUNCTIONAL_AUDIT.md, SECURITY_AUDIT.md and REMAINING_ISSUES.md (round 3 at the end of each).

---

## C. Answers

### C1. How companies get their own profile, team and database (point 1)

For companies of 50 to 500 people, I recommend this:

1. **One app, many companies.** Each company gets its own web address, for example `acme.q-smart.app`, and its own data.
2. **One SQLite file per company** (`acme.db`, `beta.db` …), plus one small "main" database. The main one holds the list of companies, their plan and their billing.
   - Data of two companies can never mix.
   - A backup, a data export or deleting a company is just one file.
   - A big customer can later move to its own server.
   - The alternative is one shared database (PostgreSQL) with a company number on every row. It is cheaper with hundreds of companies, but one coding mistake can show one company's data to another.
3. **Sign-up for a new company:**
   1. company name and web address
   2. the first admin
   3. the **built-in Administration team**, made automatically
   4. invite people by e-mail link
   5. choose starter scorecards
   6. set the pass rate
4. **Also needed before selling:**
   - **Money and contracts:** paid plans per seat (Stripe), Terms of Service, Privacy Policy and a GDPR data-processing agreement.
   - **Customer data:** "export all my data" and "delete my company".
   - **Sign-in for bigger customers:** Google or Microsoft single sign-on.
   - **Reliability:** daily off-site backups, uptime monitoring, a status page and a support e-mail.
   - **Limits per company:** users, storage and AI use.

The audit file **SAAS_READINESS.md** has the full checklist.

### C2. Too many menus (points 2 and 10)

See the proposal in **A1**.

### C3. Ideas to make the interface simpler (point 7)

- **Done:**
  - Views in their own tab.
  - One "Filters" button with chips, instead of rows of drop-downs. It is on Reviews and the dashboard so far.
  - Details moved into pop-ups (Category Stats), so cards show fewer numbers.
  - Each person's choices are remembered: views, columns, compact or detailed, folded or open.
- **Next ideas:**
  - Admin and Learning panels (A1).
  - The same Filters and Columns on every table (A4).
  - A shorter menu for agents.
  - A "Recently opened" list in Ctrl+K search.
  - Empty pages that explain what to do first (as the guide does now).

### C4. Transcripts and the AI coach: how much will testing cost? (point 18)

**Claude prices** (official, per 1 million tokens, in / out). One token is about ¾ of a word.
- Claude Opus 5.5: $4 / $20
- Claude Sonnet 5.5: $2 / $10
- Claude Haiku 5.5: $0.10 / $0.50

**What one action costs, roughly:**

| Action | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| AI scoring of one 10-minute call transcript (about 4,000 tokens in, 1,500 out) | about $0.001 | about $0.02 | about $0.05 |
| One typed role-play coaching exercise (about 20 turns plus final feedback) | under $0.01 | about $0.05–0.15 | about $0.15–0.30 |

So **testing 100 exercises with Sonnet costs about $5–15**. Set a monthly spending limit on the key in the Anthropic Console while testing. "Prompt caching" (re-using the unchanged start of each message) makes long exercises cheaper.

**Voice.** Claude works with text. A spoken simulator needs speech-to-text plus a voice. These are third-party estimates, so check each pricing page before you buy:
- **ElevenLabs voices:** about $0.04–0.10 per 1,000 characters, roughly $0.03–0.08 per minute of speech. A complete ElevenLabs voice agent is about $0.08 per minute, plus the AI model ([devtoollab](https://devtoollab.com/blog/elevenlabs-alternatives), [ModelsLab](https://modelslab.com/elevenlabs-api-pricing.md), [HappyRobot](https://www.happyrobot.ai/hub/elevenlabs-pricing), [getmacha](https://www.getmacha.com/blog/elevenlabs-agents-pricing-explained)).
- **OpenAI Realtime voice:** about $32 / $64 per million audio tokens, roughly $0.06–0.11 per minute. The "mini" model is about $0.02–0.05 per minute ([Fora Soft](https://www.forasoft.com/article/openai-realtime-api-pricing), [eesel](https://www.eesel.ai/blog/gpt-realtime-mini-pricing)).
- **Google Gemini Live voice:** about $3 / $12 per million audio tokens, roughly $0.02–0.03 per minute ([Fora Soft](https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/real-cost-of-ai-in-video-products-gemini-openai-pricing), [Bifrost calculator](https://www.getmaxim.ai/bifrost/llm-cost-calculator/provider/gemini/model/gemini-live-2.5-flash-preview-native-audio-09-2025)).
- **Free, for testing:**
  - The speech built into Chrome and Edge (the "Web Speech API"). It turns speech into text and reads text aloud, with no key and no cost; the quality is fine for tests.
  - Free open-source models you run yourself: **Whisper** turns speech into text; **Piper** or **Kokoro** read text aloud. You only pay for the computer that runs them.

**My recommendation:**
1. **Free start:** simulator with the browser's speech, Claude Haiku 5.5 playing the customer, and Sonnet 5.5 writing the feedback and score.
2. **For paying customers:** ElevenLabs voices as a "premium voices" option.
3. **Settings:** the admin chooses the model and the voice in Admin › Integrations, with a monthly AI budget per company. The app shows how much has been used.

---

## D. Suggested order of work

1. **Now:** your answers to A1–A7, then merge into `main`.
2. **Before SQLite:**
   - the same Filters and Columns on the other tables
   - the Admin and Learning panels (if you say yes)
   - final look of the scorecard editor
3. **SQLite step:**
   - one database per company
   - sign-in per company address
   - sign-up for a new company with the built-in Administration team
   - backups per company
4. **AI step** (with your key):
   - AI scoring of transcripts (AutoQA with Claude)
   - recording upload with speech-to-text
   - the coaching simulator, with free voices first and premium voices later
   - a budget per company
5. **Before selling:** billing, legal pages, single sign-on, monitoring.

---

## E. Your answers of 26 October, and what happened

| Item | Your answer | Status |
|---|---|---|
| A1 Admin and Learning panels with "Back" | Do it | ✅ Built. Sections fold like the main menu; in the icons-only menu, resting the mouse on an icon opens its list |
| A2 Merge into `main` | No | Nothing merged, nothing pushed |
| A4 Filters and Columns on all tables, plus a copy for Excel | Yes | ✅ Every table has a small toolbar: Filter (text plus a drop-down per column), Columns, sort by clicking a title, and **Copy** (paste straight into Excel). Reviews copies every matching row of all pages |
| A5 Kainami recording test | Later | Not done. The places for the keys are ready (next line) |
| API keys and settings | Make sure they exist and nothing breaks | ✅ Admin › Integrations › **AI and voice**: Claude key, model, monthly budget with usage, "Test the connection", voice provider, ElevenLabs and OpenAI keys. Keys are stored encrypted and never shown again in full. Tested with a fake AI service: a wrong key, a busy service and an empty budget give clear messages, and nothing crashes |
| A6 One database per company | Explain the steps; do it after the app set-up | See **G** below |

## F. The new dashboard and the AI team — waiting for your yes

The three pictures in the chat show:
1. **Team pulse**, the new "Overall" dashboard, which answers three questions at a glance:
   - **How is my team doing?** One plain sentence plus four numbers: average, pass rate, review plan, disputes.
   - **What needs me now?** A list with one button per item (decide, plan coaching, review now, remind).
   - **Where is it coming from?** A heat map of agents by categories, where a click opens those reviews.

   Below them is the weekly trend against the target.
2. **Dashboards**, a page of its own:
   - **Ready-made dashboards:** Overall, Team lead, QA specialist, Trainer, Agent, Performance and KPIs, Speed and workload, Analytics, AI and automation, Learning.
   - **Yours:** your own dashboards, named however you like, which can be shared or set as your home page.
3. **AI team**: an AI QA reviewer, AI team lead, AI trainer and AI analyst. Each works by your company's playbook and either drafts for a person to approve or acts automatically. AutoQA shows human and AI scores side by side, with a **similarity rate**.

**Update:** you said yes to 1 and 2, and both are built (Home › Dashboard › Dashboards). From the AI team (3), the **AI QA reviewer** is built: AutoQA › AI reviewer (drafts for approval, similarity rate), with the company playbook in Admin › Integrations. The AI team lead, trainer and analyst come next.

### How the AI team would work

1. **AI workers are like colleagues:**
   - Each has a profile in the app (with an "AI" badge).
   - It appears as the reviewer, author or coach on what it does.
   - Agents can dispute an AI review like any other.
2. **Playbooks: your company's rules in plain words.** For example:
   - "3 reviews per agent, per category, per month"
   - "Critical fail when the identity is not checked"
   - "Coaching after 2 weeks below target"

   Together with the scorecards and the knowledge base, they are what the AI follows.
3. **Tasks and schedules.** The AI workers take tasks from the same task board, either given by a person or triggered by a rule:
   - every night: review the new scripted calls
   - every Monday at 08:00: send the team summary
4. **Two modes per worker:**
   - **Drafts for approval** (the default): a person checks and publishes.
   - **Automatic**: publishes on its own when it is sure enough. Anything unsure goes to a person.
5. **Human vs AI in AutoQA:**
   - The same conversation is reviewed by both, with a similarity rate per category and overall.
   - Big disagreements go to a "check" list.
   - Every human decision is kept as an example, so the AI gets closer to your way of scoring.
6. **Safety and cost:**
   - the monthly budget (already built)
   - a log of every AI action
   - an on/off switch per worker
   - the AI never deletes anything
7. **Order of building:**
   1. AI QA reviewer on transcripts, with drafts for approval and the similarity rate. The AI rating in AutoQA already exists.
   2. AI analyst reports.
   3. AI team lead summaries and coaching drafts.
   4. AI trainer: quizzes (already possible with AI) and role-plays.
   5. Voice simulator: free browser voice first, ElevenLabs later.

## G. One database per company — the steps (after you finish the app set-up)

1. **Finish the set-up** with your own company, as now.
2. **Move to SQLite.**
   - Each company gets its own database file, for example `companies/acme.db`.
   - A small `main.db` holds the list of companies, their plan and their billing.
3. **Bring your data across.**
   - Your current data.json becomes the first company's file, in a one-time import.
   - The import is first tested on a copy and compared number by number: users, reviews, scores.
4. **One web address per company**, for example `acme.q-smart.app`. The app opens the file of the company in the address, so people of one company can never see another.
5. **Sign-up for a new company:**
   1. company name and address
   2. first admin
   3. the built-in Administration team, made by itself
   4. starter scorecards
   5. invite people by e-mail link
6. **Backups per company.** Each file is copied every day, kept for 30 days and also stored off the server. One company can be restored without touching the others.
7. **Updates.** When a new version adds something, every company file is updated by itself at start-up.
8. **Limits and billing per company:** number of users, storage and AI budget, linked to the plan they pay for.

**Why one file per company?**
- One company's data can never show up for another.
- A backup, a data export or deleting a company is one file.
- A very large customer can later get its own server.

The cost is a little more work for updates (step 7), which the app does by itself.

---

## H. AI team lead (built 26 October)

Where: **AutoQA › AI team lead** (admin, QA, team leads and trainers; agents never see it). Also a card on the **Team lead** dashboard.

- **Agents at risk** is worked out from the reviews, without AI and at no cost. An agent is at risk when:
  - they are below target for 2 weeks,
  - their score is falling,
  - they had a critical fail,
  - or they have several open disputes.
- **Weekly summary:** the AI writes it from the numbers only. Use the button, or switch on "Every Monday from 08:00…" in Admin › Integrations (it is off now). The team lead and the admins get a notification.
- **Coaching plan drafts:** the AI drafts a plan for one agent. A person checks it and can change anything. On approval, a normal coaching session (a one-to-one when a team lead approves) is created, and every action becomes a task for the agent. Reject creates nothing.
- **Privacy:** people limited to some teams see and write summaries only for their own teams.

**To decide (no rush):**
1. Should the Monday summary be on by default for new companies?
2. Should a trainer also be able to write summaries? Now only admin, QA and team leads can.

## I. AI trainer (built 26 October)

**1. Practice calls with an AI customer**
- Where: **Call Simulator**.
- An agent picks one of 5 scenarios and talks to an AI customer:
  - price objection
  - late delivery
  - cancellation
  - technical problem
  - identity check
- The customer pushes back when the agent is vague and calms down when they listen.
- At the end, the AI trainer gives a score, what went well and tips. The result is saved on the Agents page (tab Simulations).
- It is **off** until an admin ticks "Agents can practise with an AI customer" in Admin › Integrations, because every message uses the AI budget. While it is off, the old simple simulator stays.

**2. AI trainer tab**
- Where: **AutoQA › AI trainer**, for admin, QA, team leads and trainers.
- **Training needs:** the categories where agents were below target in the last 30 days, with their names.
- **Draft a quiz with AI:** the AI writes 5 questions from:
  - the scorecard items
  - what agents missed
  - the matching knowledge base articles

  The quiz is saved as a **draft**, given to those agents. A person checks it in Quizzes and publishes it; only then do the agents see it.
- **Practice calls:** you can read every AI practice call with its score and tips.

There is also an "AI trainer" card on the **Trainer** dashboard.

**To decide (no rush):**
1. Do you want your own scenarios, for example your real products and offers? I can add a "New scenario" form.
2. Should the AI trainer suggest a practice scenario to an agent who is weak in a category?

## J. AI analyst (built 26 October)

Where: **AutoQA › AI analyst** (admin, QA, team leads and trainers; agents never see it). Also a card on the **Analytics deep-dive** dashboard.

- **Ask a question** in your own words, or tap a ready-made one:
  - which team improved the most
  - where we lose points
  - which agents need help
  - are reviewers consistent
  - calls vs chats vs e-mails
- Choose the period (last 30 or 90 days, this month, last month) and a team.
- **How it works:** the app first works out the real numbers:
  - scores, pass rate and the previous period
  - teams, categories, channels and weeks
  - best and lowest agents, reviewers
  - disputes, and the AI reviewer agreement

  The AI then writes a short report **from those numbers only**, ending with recommended actions. Under every report you see how many reviews it is based on.
- **Monthly report:** a button, plus an optional switch in Admin › Integrations for the 1st of every month from 08:00, when the admins get a notification. The switch is off now.
- Reports are kept. **Copy** puts one in your clipboard for an e-mail. The author or an admin can delete it.
- Privacy: people limited to some teams only see and ask about their own teams.

**To decide (no rush):**
1. Should the monthly report also be e-mailed to the admins, once e-mail is set up?

## K. Voice in the Call Simulator (built 26 October, free browser voice)

- **The customer talks.** Every customer line is read aloud by the computer's own voice, in the app's language (English, Bulgarian or French). This works both with the AI customer and in the simple simulator.
  - The "Customer voice on/off" button switches it off, and each person's choice is remembered.
  - When the computer has no voice for the language, a tip says how to add one: Windows Settings › Time & language › Speech.
- **The agent can answer by talking.** Press "Answer by voice", speak, and the reply is written and sent when you stop.
  - It works in Chrome and Edge. Elsewhere the button is hidden and typing works as before.
  - The browser asks once for permission to use the microphone.
- **No cost and no outside voice service.** ElevenLabs or OpenAI voices (keys already in Admin › Integrations) can come later for more natural voices.
- Checked: speaking in English and Bulgarian, the on/off switch, both simulators. Not checked with a real microphone: the test browser cannot speak into it. Please try it once in Chrome.

**To decide (no rush):**
1. Do you want the more natural ElevenLabs voices next? Each call would then cost a little.

## L. Proposal: Workforce (like Zoho People) and Capacity planning (fair split) — 26 October, waiting for your yes

### What I studied in the Zoho People help (the links you sent, 4.0 and 5.0)
- **Employee handbook:**
  - attendance (check-in, views, regularization, permission, on duty, shifts, reports)
  - leave (apply, balances, comp off, grants, cancel, holidays, resource availability)
  - self-service
  - approvals
  - dashboard
- **Admin guide:**
  - attendance policy (strict or lenient, hours, round-off)
  - specific policies and grace periods
  - regularization settings
  - shift settings, rotation, patterns, auto shift assignment
  - leave policies (accrual, carry forward, sandwich rule)
  - work calendar
  - Bradford score
  - employee information
  - Zia (the AI) with its list of prompts

### Our current people data
Name, e-mail, role, team, title, languages, skills, phone, start date and team history. There is nothing yet for attendance, leave, shifts or campaign volumes.

### What we take from Zoho, and what we leave out

**Phase 1 — People and calendar (the base everything else needs)**
- **Employee record, new fields:**
  - employee ID
  - employment type (full time, part time, contract, intern)
  - hours per week
  - reporting manager (the team lead by default, can be changed)
  - country and location (for holidays)
  - status (active, on leave, left)
  - exit date and reason
  - birthday (hidden unless the person allows it)
  - emergency contact

  Departments stay our **teams**, and positions stay the **title**.
- **Work calendar per country:**
  - the work week
  - weekends, including half days
  - public holidays (Bulgarian holidays filled in, editable)
- **Shifts:**
  - Shift templates: name, colour, start and end (overnight allowed), breaks, grace minutes, optional core hours, and auto check-out time for people who forget.
  - A default shift.
  - A **weekly rota per team** (a grid of people × days) with "copy last week".
  - Repeating patterns, for example two-week cycles or "4 on, 4 off".

**Phase 2 — Attendance and time off**
- **Check in / check out / break** button in the app. Telephony logins (Voiso, Ringover) can be imported later.
- **The status is worked out by itself, every day:**
  - on time
  - late (minutes)
  - left early
  - short hours
  - absent
  - on leave
  - holiday
  - day off
- **Rules, like Zoho's "grace periods":**
  - Grace minutes for late arrival and early departure.
  - How many lates are allowed per week or month.
  - What happens after that. **I recommend a warning to the person and the team lead, not a pay deduction**, because payroll is not in Q-smart.
- **Corrections (Zoho calls them "regularization"):** for example "I forgot to check in".
  - Allowed within X days, with a reason chosen from a list.
  - The team lead approves.
  - Everything is kept in the history.
- **Time off:**
  - leave types: paid, unpaid, sick, or by hours
  - yearly allowance and balance, with carry-over
  - full day, half day or hours
  - the team lead approves, and a deputy can approve while the lead is away
  - part of a leave can be cancelled
  - a team calendar
  - a warning when too many people of a team are off on the same day
  - an optional "sandwich rule" (whether weekends inside a leave count)

**Phase 3 — Team today, with the AI touch**
- **"Team today" panel per team:**
  - planned and available now
  - on time, late, not checked in yet, on break, off and sick
  - a strip for tomorrow and this week
- **AI morning brief** to every team lead, 30 minutes after the shift starts:
  - who is late or missing
  - patterns, such as "late 3 times this month" or "often off on Mondays"
  - days ahead without enough people for the capacity plan
- **Ask in words**, through the AI analyst: "Who is off on Friday?", "How many agents do I have today?", "Who was late last week?"
- **Bradford score:** a standard measure where many short, unplanned absences weigh more than one long one. It flags people early so a lead can talk to them.
- **Reports:**
  - late arrivals
  - absences
  - presence hours
  - leave balances
  - Bradford score
  - attendance by team

**Phase 4 — Capacity planning (the fair split)**
- Import each month: campaign, brand, segment (0-30, 30-60 …, each company can name its own) and number of leads.
- The agents and their working days come from phases 1–2 (rota, leave, part time).
- **The formula:** each agent gets the same share of **every** campaign, sized by the days and hours they can work.
  - Whole leads only. The leftover leads go to whoever is furthest below their fair total.
  - Result: everyone has the same mix of segments, and no agent is more than 1 lead away from their exact fair share.
  - Tried on sample numbers (3,349 leads, 7 agents, part time and days off): every campaign adds up, and the biggest gap is 0.69 of a lead.
- Each agent sees their numbers for the month, week and day.
- When someone is off or new leads arrive, only the leads not yet worked are split again among the people available for the remaining days.

**Left out:** these are payroll-heavy, hardware-based, or already in Q-smart in our own way.
- payroll, compensation and benefits
- e-signature
- biometric devices, kiosk, face recognition and GPS tracking
- the Japan-only union rules
- HR help desk (we have Tasks)
- Zoho's own learning, performance and surveys (we already have these)

### About the patent
I can't give legal advice. Two practical points:
- Methods made mainly of software and business rules are hard to patent, especially in Europe.
- Showing the method publicly before filing can block a patent later.

Please talk to a patent attorney before demoing it outside the company. I can write a full technical description for them.

### Decisions I need from you (recommended choice first)
1. **Menu place:** a new **Workforce** group after Planning: Team today, Attendance, Time off, Shifts and rota, Capacity planning. The settings (leave types, holidays, shift templates, rules) go in Admin › People.
2. **How check-in times arrive first:** the Check in button in Q-smart, with the telephony import later.
3. **After too many lates:** a warning only, not a deduction.
4. **Fair split size:** by working days and hours, so part-timers and people on leave get less.
5. **Mid-month change:** the app suggests the new split of the remaining leads, and a person approves it before agents see it.

## M. Workforce, Phase 1 built (26 October): people, calendars, shifts and the rota

You said yes to the five recommended choices, including the new **Workforce** group in the sidebar.

**Where things are**
- **Workforce › Shifts and rota:** the plan of each team, week by week.
  - Click a day to change it (a shift or a day off), or put it back to the usual plan.
  - **Copy last week**, and **Usual shifts and patterns** (for several people at once).
  - Each day shows how many people are **on shift**. Each person shows planned hours against the hours in their contract: amber when under, red when over.
  - **Copy for Excel.**
  - Team leads plan the teams they see; QA and trainers look; agents see their own team only.
- **Admin › People › Work calendars:**
  - working days per country (working day, half day or day off)
  - public holidays: Bulgaria's are filled in by themselves, including Orthodox Easter and the days moved by law
  - you can also add a day or paste a list
- **Admin › People › Shift templates:**
  - Shifts: start, end (night shifts allowed), break, paid hours, grace minutes, core hours, and the automatic check-out for later.
  - The default shift.
  - **Repeating patterns**, for example "4 on, 4 off" or "two weeks: early / late".
- **Admin › Users:** new **Employment** fields:
  - employee ID
  - full or part time, and hours per week
  - reporting manager
  - work calendar and location
  - usual shift or pattern
  - status: active, on long leave, left (with the last working day and reason)

  There is also a **Private** section: birthday and emergency contact.
- **My account:** each person can fill in their birthday, choose whether colleagues may see it, and keep their emergency contact up to date. They also see their employment type, hours and usual shift.

**How a day is worked out**, in this order:
1. a change made on the rota for that day
2. a public holiday
3. the person's repeating pattern
4. their usual shift on the working days of their calendar

Nobody is planned before their start date or after their last working day.

**Also fixed:** the AI settings block (with the encrypted API key) was sent to every signed-in person with the general settings. It now never leaves the server.

**Next (Phase 2):** check in / check out, late and absent worked out by themselves, corrections approved by the team lead, and time off with balances.

## N. Workforce, Phase 2 built (26 October): attendance and time off

**Where things are**
- **Workforce › Attendance:**
  - **My attendance:** Check in, Start a break, End the break, Check out. The server's clock is used, so nobody can change the time.
  - **Each day's status is worked out by itself:** present, late (minutes), left early, short day, not checked in yet, absent, on leave, worked on a day off.
  - **Last 14 days:** each day with an "Ask for a correction" button. The team lead approves corrections.
  - **Staff:**
    - **Team by day:** who is in, late, missing or on leave, with corrections made directly by the team lead (the reason is required, the person is told, and the history is kept).
    - **Team by month:** present, late, absent, left early, short days, on leave, worked and planned hours, and a day-by-day grid.
  - **Dashboard:** agents get a **My day** card at the top of their ready-made dashboard, with the check-in buttons. Others can add it from the widget list.
- **Workforce › Time off:**
  - **My time off:** balances per type (left, carried over, waiting), requests, cancelling some days or all of them, and who decides.
  - **Ask for time off:**
    - full days, half days or hours
    - shows how many days it takes and what is left after it
    - warns when too much of the team is off on a day
    - a team lead or admin can register time off for a team member, approved at once
  - **Requests:** approve or reject, with the balance and team warnings.
  - **Team calendar:** who is off each day. Agents see that a colleague is away, not why.
  - **Balances:** a table per team, with "Adjust" for admins.
  - **While you are away:** staff name a deputy who decides in their place.
- **Admin › People › Leave types:** Annual leave (20 days, at most 5 carried over), Sick leave (no limit, no approval: the lead is told), Unpaid leave, Personal hours (8 hours). Everything can be changed:
  - paid or unpaid
  - days or hours
  - per year and carry-over
  - half days
  - approval
  - whether days off inside a leave count
- **Admin › People › Attendance rules:**
  - "Attendance is tracked from" (empty for now)
  - late arrivals allowed per week or month
  - alert to the team lead after N minutes without a check-in
  - how many days back corrections are possible, and their reasons
  - short-day minutes
  - the team-absence warning (%)
- **The rota** shows approved time off, and a request that is still waiting. "On shift" and planned hours take time off into account.
- **Notifications:** three new types (attendance, attendance correction, time off), switchable per role in Admin › System › Notification rules.

**Please decide when you are ready**
1. **Set "Attendance is tracked from"** (Admin › People › Attendance rules) on the day everybody starts checking in. Until then, nobody is marked absent and no warnings or alerts are sent; checking in already works.
2. **Balances from your old system:** in the first year, carried-over days are not invented. Enter them with Time off › Balances › Adjust.
3. **Leave types:** the four defaults follow common Bulgarian practice (20 days of annual leave). Change the numbers to your company's rules.

**Good to know**
- Times follow the clock of the computer the app runs on (Bulgaria). For other countries, the time zone becomes a company setting when we move to one database per company.
- On the two nights a year when the clocks change, a shift that runs through that hour counts the real hours worked.

## O. Workforce, Phase 3 built (27 October): Team today, the morning brief, the Bradford score and reports

**Where things are**
- **Workforce › Team today** (admins, QA, team leads and trainers; agents do not see it):
  - choose one team, or "All my teams"
  - eight tiles: planned today, working now, on a break, late, not checked in, absent, on leave, later today
  - **Who is where:** everybody grouped by what they are doing right now, with their shift start, check-in time or leave type
  - buttons to the time off requests and corrections that wait for you
  - **The week ahead:** for each of the next 7 days, how many people are planned against the usual number. A day turns red when fewer than 70% of the usual people are planned (you can change this share).
  - **To watch:** patterns the app finds by itself over the last year:
    - late more often than allowed this month
    - check-outs missing
    - a high Bradford score
    - absences that fall mostly on Mondays or Fridays
- **The morning brief:**
  - one short summary per team and day, under four headings: Right now, To watch, This week, Waiting for you
  - written by the AI when it is connected, in the team lead's language (it uses the AI budget). Without the AI, the app writes out the same facts itself, at no cost.
  - "Write the brief now" on Team today, when one team is chosen. Writing it again replaces that day's brief.
  - once switched on, it is written by itself 30 minutes after the first shift of each team starts. The team lead is told, and their deputy while one is named (the admins, when a team has no lead).
- **The Bradford score:**
  - the formula many HR teams use: absences × absences × days, over the last 52 weeks. Many short absences weigh more than one long one: a week off in one go = 5 points; five single days = 125 points.
  - "unplanned absence" means absent without leave, or a leave type marked "Counts in the Bradford score" (sick leave by default)
  - levels: Watch from 50, Talk to them from 125, Serious from 400 (you can change them)
- **Workforce › Attendance › Reports** (a new tab, so no new menu item):
  - one team or all; this month, last month, the last 30 or 90 days, this year, or any dates (at most one year)
  - six views: late arrivals, absences, presence hours, leave balances, Bradford score, by team
  - only the days when attendance is tracked are counted
- **AI analyst:** it can now also answer questions about attendance ("How many agents do I have today?", "Who is off this Friday?", "Who was late last week?"). It gets today, the next 14 days and the last 30 days of the teams the person asking can see.
- **Dashboard:** a **Team today** card, in the ready-made Team lead dashboard. Anyone else can add it with "Add widget".
- **Admin › People:**
  - **Attendance rules:** two new cards. "Team today and the morning brief": switch the brief on, minutes after the first shift, the short-staffed share. "Bradford score": the three levels.
  - **Leave types:** a new column and option, "Counts in the Bradford score".
- **Notifications:** a new type, "The morning brief of a team", switchable per role in Admin › System › Notification rules.

**Please decide when you are ready**
1. **Switch on the morning brief** (Admin › People › Attendance rules) once "Attendance is tracked from" is set. It is off for now. With the AI connected, it is one small AI call per team per day.
2. **Bradford levels:** 50 / 125 / 400 are common starting points. Check them against your HR rules.
3. **Short-staffed share (70%):** change it to what your planning needs.

**Good to know**
- The Bradford score is a reason for a conversation, not a sanction. Absence can be health data, so only staff see it, never agents.
- "To watch" is worked out again at most every 5 minutes.
- Found and fixed during the browser check:
  - the reports counted the days before tracking started as planned days, so "present" looked too low. Those days are now left out, with a note saying from when attendance is tracked.
  - Bradford levels that do not go up (for example 200 / 125 / 400) are now refused with a message, instead of quietly going back to 50 / 125 / 400
  - four "Open … ›" links and the "Nothing to watch" line stayed in English in Bulgarian and French. They are translated now, and hours show as "ч" in Bulgarian.

## P. Workforce, Phase 4 built (27 October): Capacity planning, the fair split of the leads

**Where things are**
- **Workforce › Capacity planning** (the last item of the Workforce group, as approved):
  - **Plans per month:** each plan covers one or more teams, and their agents share the leads. Admins and team leads plan their own teams; QA specialists and trainers can look.
  - **Campaigns:** "Paste from Excel" (campaign, brand, segment, leads; a header row is fine, and "1 240" is read as 1240), or add them one by one. When new leads arrive in the middle of the month, paste them with "Add these leads". Segments are free text, so each company names its own (0-30, 30-60 … 360+).
  - **People:** the hours each agent can work in the days left come from the rota, public holidays and approved time off. Each person also has a share: 100% as usual, 50% for somebody still learning, 0% to leave somebody out.
  - **Split:** before publishing, the plan shows every agent's leads of every campaign, their total, the exact fair number and the leads per day. "Publish to the agents" sends it.
  - **By day:** every agent's leads for every day of the month.
  - **History:** every split, who made it, and why.
- **The formula** (in cap.js):
  - each agent's share = their hours in the days left × their share %, divided by everybody's
  - every agent gets that same share of **every** campaign, so everybody has the same mix of brands and segments
  - whole leads only, and three things always hold:
    - every campaign adds up exactly
    - every agent gets their exact share of each campaign, rounded down or up
    - every agent's total is their exact fair total, rounded down or up, so nobody is ever a whole lead away from fair
  - the leads left over after rounding down are handed out with a "max-flow" method, which is guaranteed to keep all three. When people are level for an extra lead, the order between them changes with every split, so it is not always the same person who gets it.
  - each agent's leads are spread over their working days the same way: every day gets its share, rounded down or up
  - tested on 3,000 random cases and on the sample of the proposal. It splits 300 campaigns among 150 agents in about 40 ms.
- **When something changes** (your decision 5), the plan shows "Things changed since the last split" with the reasons:
  - new leads, a new campaign, or a campaign removed
  - somebody's hours in the days left changed (time off, the rota), a share changed, somebody joined or left the team
  - leads not worked: days that are over when the agent was absent or away (from the check-ins)

  It then suggests a new split of the leads not worked yet, from tomorrow (or from today), shows each person's numbers before and after, and a team lead or an admin approves it. Until then, agents keep their current numbers.
- **Agents** see only their own numbers: today, this week, this month and what is left, campaign by campaign, their share, and every working day of the month. They get a notification when their leads are published or change, and a "My leads today" card on their dashboard.

**Please decide when you are ready**
1. **Leads worked:** for now, a lead counts as worked when its day is over and the agent was at work that day. When your dialer (Voiso, Ringover) can send the real number of worked leads, the next split can use those numbers instead. Tell me which dialer, and I will prepare the import.
2. **End of the month:** a plan covers one month. Leads not worked by the end of the month are not carried over to the next month yet. That can be a next step.
3. **The word "leads":** I used "лийдове" in Bulgarian and "leads" in French. Tell me if your teams say something else (for example "контакти" or "fiches").
4. **The patent:** the method is in cap.js and described above. Before you show it outside the company, please talk to a patent attorney. I can write the full technical description for them.

**Good to know**
- Found and fixed during the browser check:
  - with many campaigns, the totals were off-screen on the right. They now come first.
  - a change of share was described as "84 h less". It now says "share 100% → 50%".
  - some labels were half translated in Bulgarian and French (for example "Добави a campaign"). They are fixed, and "Left" no longer reads as "left the company".

## Q. Menu panels, Home › Personalize and the new dashboard widgets (27 October)

**What changed**
- **The menu has four panels at the bottom**, like Learning and Admin before: **Workforce** (attendance, time off, rota, Team today, Capacity planning, and a new "Workforce set-up" group with work calendars, shift templates, leave types and attendance rules), **Compliance & CX**, **Learning** and **Admin**. Admin › People now keeps only users, teams, workspaces and skills. Every "Admin › People › …" hint in the app now says "Workforce set-up › …".
- **Home is closed when the app opens** (and right after signing in). It opens when you click it or go to one of its pages.
- **Home › Personalize** is new. The Dashboard, AutoQA and Tasks pages are now view-only; everything you change is here:
  - **Dashboard tab:** your home dashboard, your own named dashboards (+ New dashboard), and the ready-made ones (one per role and focus). Pick one to preview it, then "Use as my home", "Make my own copy", rename, share or delete it. Admins can "View as" a role and set the home dashboard of that role.
  - **Display** opens a panel like your screenshot: count the data by conversation date or review date; charts by day, week, month or quarter; and a switch for every widget, in groups (Numbers, Charts, Categories, People, Lists…). There are no names or sizes to edit: every widget has a preset size and place. Each switch saves at once, with an Undo.
  - **AutoQA tab:** switches for the AutoQA widgets, with a preview.
  - **Tasks tab:** how task cards look (Compact, Detailed, List) and which tab Tasks opens on.
- **New widgets**, adapted from the Zendesk QA screenshots to our design:
  - number tiles with ▲ ▼ change against the period before: Reviewed conversations, Average review time, Reviewed agents, Disputed reviews, Reviews with comments, Unseen reviews (the existing tiles got the same style). "∅" means there is nothing to compare with (for example on "All time"); hover it for the explanation.
  - Average category scores (dots with the target as a line), Category score over target and Category score 0% (rings), Root causes, Scorecard performance, Workspace performance, Reviewer performance, Agent performance, Scores by category, Scores by reviews, Ratings and root causes by reviews.
- **Every new review now keeps its review date and how long it took in QA Entry** (from opening the form to saving; at most 4 hours).

**Please decide when you are ready**
1. **Self-reviews:** your screenshot has a "Self-reviews" option. I left it out, because in Q-smart reviewers are never the agents being reviewed. Tell me if you want agents to review themselves one day.
2. **"Category group performance"** from Zendesk became **"Scorecard performance"**, because we group categories by scorecard. Tell me if you want real category groups.
3. **Review time and review date** exist only for reviews made from today. Older reviews show "—" for review time and use their conversation date. If you want, I can fill the review date of old reviews with their conversation date.
4. **The order of the widgets** is fixed (numbers first, then charts, categories, people and lists). Tell me if you want a different order.

**Good to know**
- Found and fixed during the browser check:
  - the dots of "Average category scores" did not show (a tag was not closed). Fixed.
  - long tables in half-width cards needed a sideways scroll. Names now wrap onto two lines, and a long table scrolls inside its card. "Scores by category" still scrolls sideways, because it has one column per category (like Zendesk).
  - a comment I added on the page-change line had switched off the "reset when you change page" steps. Fixed.
  - when the browser tab came back into view many times quickly, the app could stack many full data reloads, so pages opened slowly. Now only one runs at a time.
  - the switches in Display touched their labels in a narrow window. Fixed.
- Everything is translated into Bulgarian and French. All 160 automatic tests pass (one new: the review date and review time are saved).

## R. No empty spaces, and admins arrange dashboards in Personalize (27 October)

**What changed**
- **No more empty spaces.** The widgets are packed so every row is full. Number tiles share their own rows (at most 5 in a row, as even as possible, so 5 tiles make one row and 7 make 4 + 3). They are never put next to a big card, so they don't stretch into tall empty boxes. A card left alone at the end of a row grows to fill the row.
- **Admins can arrange a dashboard by hand, only in Home › Personalize.** Click "Arrange" above the preview. Then:
  - drag ⠿ to move a widget
  - drag its right or bottom edge (or the corner) to resize it; double-click the edge to get the automatic height back
  - click ✕ to hide it

  From the first change on, that dashboard keeps exactly the order and sizes you chose, also on the Dashboard page. "Automatic layout" goes back to the packed preset, and Undo works as before.
- **Other roles** get their role's default, as an admin arranged it ("Make it the home dashboard of…"). In Personalize › Display they can switch widgets on or off for themselves only. They cannot move or resize, and a widget they add goes at the end at its preset size. "Back to the default of my role" undoes their changes.

**Good to know**
- An arranged dashboard can have gaps if the sizes chosen don't add up to a full row. You see them while arranging, so you can fix them, or press "Automatic layout".
- In Bulgarian, the newer texts now say "уиджет" like the rest of the app (they said "приспособление").
- All 161 automatic tests pass (one new: the server keeps the "arranged" mark).

## S. Tasks: dates, In review, Timeline, Library with history and sequences (27 October)

**What changed**
- **Dates on every card:** created, started, sent for review, done and the deadline. A finished card says "On time" or "2 days late". The task window has a **History** list of everything that happened, newest first: given, started, sent for review, sent back (with the comment), approved, reassigned, deadline changed, archived. Tasks from before today only show when they were given and done.
- **In review column.** Tick "Needs my review before it is done" when you give a task (it is off by default):
  - when the person marks it done, it goes to In review and the giver gets a notification
  - an admin, QA, lead or trainer who sees that person (not the person themself) clicks **Approve** (it goes to Done) or **Send back** with a comment (it goes back to In Progress)
  - tasks without the tick go straight to Done, as before
- **Timeline view** (Board / Timeline switch above the board): five weeks, one bar per task from its start to its deadline, grouped by person, coloured by stage (overdue in red), with a line for today. ‹ Earlier / Later › move four weeks.
- **Library tab** (it was Templates):
  - **History:** every task given, newest first, searchable. **Give again** copies it with the same text, steps and people (change them) and new dates. The template icon saves it as a template.
  - **Templates:** as before, plus **every quarter** (January, April, July, October), **Repeat until** an end date, and "Needs my review".
  - **Sequences:** a named list of steps written as "day | task | how many days", for example "1 | Read the guide | 2", "3 | Shadow 5 calls", "8 | First solo review | 3". **Give** it to teams or people with a start date: every task is created with its own dates. It can start again every month or every quarter until a date, and **Stop** ends that.
- **Repeating cards skip days off.** A daily card is not given on a day the person is off (rota, work calendar, a full day of approved time off). A weekly, monthly or quarterly card waits for the person's next working day in that period. A new repeating template does not create cards for periods before it existed.

**Good to know**
- A repeating sequence that was not opened for a while only gives the latest round, never a pile of missed ones.
- When a card is sent back, the comment is also in the person's notification.
- All 163 automatic tests pass (two new: the review flow, and the dates of a sequence). Everything is translated into Bulgarian and French.

## T. Loading animations, Reviews table, QA Entry text, Last updated line (27 October)

**What changed**
- **Loading animations** (your choices from the three ideas), on a dark screen with the Q logo, a letter inside and three dots:
  - **Heartbeat** with "Q": when you sign in, and when you open the app already signed in, until the first page is ready.
  - **Drawn by hand** with the panel's letter: when you open a panel (L Learning, W Workforce, C Compliance & CX, A Admin, or S Set-up for non-admins). It fades in and out like a slide transition, about 1 second.
  - **Sonar**: when a page takes longer than 1.5 seconds, and with "AI" inside when you open the AI Call Simulator.
  - With "reduce motion" switched on in the computer's settings, the logo stays still.
- **Reviews:** the table grows down with "Items per page" instead of scrolling inside its box. At a normal screen width all columns fit without a sideways bar. The exact channel (WhatsApp, Messenger, SMS…) moved from the Type column into the review window's header.
- **QA Entry:** larger text for labels, fields, questions and the score panel.
- **Last data update time (UTC)** at the bottom of every dashboard (your own local time on hover).

- **Agents page:** the decorative sound wave on the agent card is removed.

## U. The AI Simulator panel (27 October, your yes)

- **A panel of its own** in the menu, between Learning and Admin. Opening it plays the sonar animation with "AI" inside the Q. It has three pages:
  - **Practice a call:** the call simulator, as before.
  - **Results:** agents see their own practice calls, and leads, QA, trainers and admins see the people they can see. It shows numbers on top (calls, average score, scores of 85% or more, minutes), filters by team and person, and a click opens the score, what went well, the tips and the whole conversation.
  - **Scenarios** (trainers and admins): the 5 built-in customers can be switched off, and you can write your own: name, who the customer is, the situation, and the customer's first sentence. "Try it" opens the practice straight on that scenario. Practice calls already made keep their results.
- **Learning › Tools** keeps **Transcripts** (import a recording, transcribe, analyse and auto QA once the API key is in).
- All 164 automatic tests pass (one new: agents cannot change scenarios, and a switched-off scenario disappears from practice). Translated into Bulgarian and French.

## V. One list of 7 categories (27 October, your choice)

- The written scorecard (chat, email, messaging) now uses the same 7 category names as the call scorecard, so the Agents page and the rest of Analytics show 7 categories instead of 14:
  - Greeting & Personalisation → Greeting & Introduction
  - Writing Quality → Vocabulary & Professionalism
  - Understanding the Request → Empathy & Active Listening
  - Compliance & Data Protection → Documentation & Reasoning
  - Timeliness → Process Adherence
  - Accuracy & Solution → Persuasion & Objection Handling
  - Closing → Closing & Positive Outcome
- Only the names changed. The questions inside each category, their points and every score stay exactly as they were, and the past written reviews are shown under the new names.
- The change runs by itself once, the first time the server starts with this version (also after a restore from seed.js). Your running app needs a restart to pick it up. The AutoQA category called "Closing" is a separate list and keeps its name.
- A category's "8/9" points on the Agents page is an average over both scorecards, which give a category different points, as before.

## W. One-to-One, rebuilt from the Kainami module (27 October)

I looked at Kainami's One-to-One page, its "New One-to-One" form and its Form Templates. I only read them, and saved nothing in Kainami. Then I rebuilt ours in our style.

**The list (Coaching › One-to-One)**
- **Target per person per month**, shown at the top. An admin changes it with the ⚙: one number for everybody, and a different number for chosen teams (for example 2 for a VIP team).
- **Missing one-to-ones this month:** everybody below their target. With a target above 1 it shows "1/2". Click a name to write theirs.
- **Team lead completion rate:** one-to-ones done against the target of their agents.
- The list has Week / Month / Year / All time, team and agent filters, and search. Each row shows the agent, team, team lead, date, period, template, and the state: Draft, Waiting for the agent, or Signed.

**The form**
- Team, template (the team's own template is picked by itself), agent, date, and the period (week, month, year or your own dates).
- **Performance in this period** on the right: reviews, average score, pass rate, open tasks, the 3 weakest categories, and the **objectives from the last one-to-one** with what was done. This part is ours; Kainami doesn't have it.
- The sections of the template, then the signatures:
  - **Save draft:** not counted toward the target.
  - **Send to the agent:** you sign as team lead, and the agent gets a notification, reads it and signs from their own account.
  - **Complete and save:** the agent is with you and signs on your screen.
- "Also give each objective to the agent as a task" turns every objective into a task with its deadline.

**Form templates** (admins, team leads, QA)
- A name, the teams that use it, and sections you add, rename, move up and down and remove.
- **8 section types:**
  - Free text
  - Checklist: ticks, each with a note
  - Yes / No / N.A.
  - Objectives: with deadlines
  - Rating: 1–5 stars, for the whole section or per item
  - Numbers: with label and unit
  - Table: your own columns and rows
  - Agreement: statements the agent agrees to by signing
- Each one-to-one keeps a copy of its sections, so changing a template later never mixes up old answers.
- Without a template, a one-to-one uses the standard sections: Strengths, Areas for improvement, Objectives, Action plan, Agent comments, Agreement.

**Good to know**
- One-to-ones written before today keep their simple view and form.
- Signatures are a click with the name and the time, not a drawn signature as in Kainami.
- While testing I fixed an older test about capacity planning that failed only in the evening; the app itself was right.
- All 165 automatic tests pass (one new for templates, sending, signing and the target). Everything is translated into Bulgarian and French.

## X. Ideas from the Zendesk QA dashboards, added to the pages we already have (27 October)

I read Zendesk's help pages for their Assignments, Coaching, Surveys, Disputes, Calibration, Categories and Reviewer QA dashboards (the dashboards themselves didn't load in my browser). As you asked, there is no Reviewer QA; the other ideas went into our existing pages:
- **Disputes (Quality › Disputes):**
  - A dispute can now end **"Score partly changed"** (the agent was right about some points, not all), next to "kept" and "changed".
  - New cards: **How disputes end** (average time to resolve, how often the agent was right, the three endings), **Disputed categories**, **Who disputes** (per agent: reviews, seen, disputes, open, changed, partly, kept) and **Whose reviews are disputed** (the same per reviewer).
  - The page filters apply to all of them.
- **Category Stats:** a new **Root causes** card: root causes chosen per week, and tables **by reviewer** and **by agent** (the 6 most used root causes).
- **Calibration:**
  - **Score the same reviews.** Every participant gives the reviews in the session a score (0–100) on their own, and sees the others' scores only after saving their own; the owner and admins always see everything, and everybody does once the session is closed.
  - The **reference** is the review's own score; the owner can make one participant's score the reference instead.
  - Every score shows its difference from the reference, and a table shows each person's average difference (Aligned, Close, Calibrate).
  - Participants can now also add reviews to the session.
- **Coaching › Sessions log:** an overview on top: sessions held, coming, overdue (planned in the past), feedback signed by the agents, and **score after coaching** (the agents' average 30 days after a session against the 30 days before). There's also a table per coach.
- **Surveys (CSAT):**
  - Each answer can be **CSAT** (how satisfied) or **CES** (how easy it was), and can have a **reason** (Long wait, Solved quickly…).
  - New cards: CSAT and CES side by side, **From conversation to comment** (reviewed conversations → answers → answers with a comment), **Reasons**, and **Words customers use** (the most frequent words in the comments).
- **Not taken:**
  - Zendesk's **Assignments** works from a shared pool of conversations that reviewers take from, which Q-smart doesn't have. Our Review planner already covers the goals per reviewer, so I left it as it is.
  - Root-cause **tiers** (groups and sub-groups) would need a new setting in Admin › Root causes; tell me if you want it.

All 166 automatic tests pass (one new for blind calibration and "partly changed"). I also made the newer tests reuse their sign-ins, because together they had reached the app's sign-in limit. Translated into Bulgarian and French.

## Y. Branch q-smart-v1: users and teams, Organization, Q-Intelligence (27 October, ideas from Modjo)

This branch starts at commit bfb48ed (everything above). I read every page of Modjo's settings and its AI pages, and saved nothing in Modjo.

**Users and teams (Admin › People)**
- **Users list:**
  - Columns: name with the team and job title underneath, role, team lead, employment, status, and **last sign-in** (recorded from now on).
  - Resting the mouse on a role shows what that role may see.
- **Side drawer:** adding or editing a user opens on the right. It shows a **role guide** with all five roles and what each may do.
- **Import:** paste one person per line (first name, last name, email, role, team), for example from Excel. Everybody gets the temporary password "password".
- **Teams:**
  - A search box, and the number of people on each team card.
  - Editing a team opens in the drawer, with **team members**: tick agents from a searchable list to move them into the team on Save. Their old reviews stay on record.
  - To take someone out, move them to their new team: every agent must belong to a team.

**Organization (a new group in the Admin panel, admins only)**
- **Company:** name, legal name, address, city, country, VAT, website, logo; billing and support emails; the **data protection officer (DPO)** and their email; time zone.
- **Data protection (GDPR):**
  - **How long data is kept**, per kind: call recordings, notifications, practice-call conversations, AI drafts and reports, audit log. Choices run from "Keep for ever" (the default, which deletes nothing) to 5 years.
  - Older data is deleted by itself every 12 hours. "Clean up now" does it at once, and the page shows the last clean-up.
  - Reviews, scores, tasks and one-to-ones are your quality history and are always kept.
  - **What agents may see** (working since 27 October, evening):
    - When "Agents can listen to the recordings" is off, agents get no recording and no recording link, and the recording file refuses them.
    - When "Agents see the name of the person who reviewed them" is off, the reviewer's name is hidden from agents; in disputes the QA answers show as "QA".
    - Staff always see everything.
  - **Privacy note:** shown under the sign-in form, with the company name, for everybody before they sign in.
  - **A person's data:** download everything stored about one person in one file (the right of access).
- **Sign-in:** a minimum password length (8 to 16), and how many wrong passwords lock an account for 15 minutes. Sign-in through Google or Microsoft needs those companies' accounts set up in Integrations, so it isn't built yet.
- **Business words:**
  - **Call types** are saved but not used anywhere in the app yet.
  - **Topics** (keywords counted in conversations) are used by Q-Intelligence › AI insights.
  - **Custom vocabulary** (the right spelling and the transcription's mistakes) fixes every new transcript: conversations added to AutoQA and transcripts sent to the AI reviewer. Whole words only ("Acme Bank" becomes "AcmeBank", but "Acme Banking" stays). Transcripts saved before keep their text.

**Q-Intelligence (a new panel at the bottom of the menu, for staff; opens with the sonar "Q")**
- **Ask Q:** a chat for questions about your teams' quality (team and period to choose, example questions). It uses the AI analyst with your numbers.
- **AI agents:** call summary, next steps, follow-up email or coaching brief on one review, and one-to-one prep for one agent. There's a copy button, and a link to the AI reviewer, lead, trainer and analyst in AutoQA.
- **AI insights:**
  - The AI finds **objections**, **competitors** and **product feedback** in review comments, transcripts and survey comments, grouped in themes with examples (7, 30 or 90 days).
  - **Topics** are counted without AI.
- **Knowledge:** upload .md and .txt playbooks (up to 300 KB each). From now on every AI answer reads them: Ask Q, agents, insights, and also the AI reviewer, lead, trainer, analyst and simulator.
- Everything AI needs your API key in Admin › Integrations. I tested it only with my local test AI (nothing was sent anywhere).

All 167 automatic tests pass (one new: organization settings, automatic deletion, a person's data). Translated into Bulgarian and French.

## V. Round 4 audit (28 October) — decisions waiting for you

Everything below is on the branch `q-smart-v1-audit`. Nothing is merged or pushed. Recommended choice first.

### V1. The server's time zone (important before hosting)
**What I found:** all attendance and time-off dates use the time zone of the computer the server runs on.
- On your PC (Sofia) everything is right.
- On a cloud server set to UTC (the usual default), a 09:00 shift would start at 11:00 Sofia time. People would be marked late or on time wrongly, and New Year would come 2 hours late for leave balances.

**Options:**
1. **(recommended now)** When you host the app, start it with the setting `TZ=Europe/Sofia`. One line in the hosting set-up, no code change.
2. Later, with the move to separate companies: each company's time zone from Admin › Organization › Company is used in the calculations.

### V2. Agents on phones — ✅ DONE (28 October, your answer)
**Your answer:** keep the pages for computers and tablets; on a phone, show a screen that asks people to use the Q-SMART mobile app, which you will build later. The screen now says "Use the Q-SMART mobile app … The mobile app is coming soon", in all three languages. A tablet in landscape mode still shows the pages.

The question as it was asked:
**Today:** under 760 pixels wide (any phone) the app shows only "Your screen is too narrow to use Q-SMART". On a tablet (768 px) the pages work.
- **(recommended)** Keep it as it is for now, and later make only the agent pages work on phones: Attendance (check in / out), Time off, Reviews and Tasks. That is a design change, so it waits for your yes.
- Or make every page work on phones (a much bigger change).

### V3. Google Fonts served by the app itself (R-24) — ✅ DONE (28 October, your yes)
**What was done:**
- The 66 font files (the same families, weights and character sets) and the 5 licences are in `public/fonts`.
- The pages no longer contact Google, and the security policy now allows fonts from the app only.
- The look is the same: 39 measured text widths are identical to the pixel before and after.
- A first visit downloads 163 KB of fonts in English (219 KB in Bulgarian) from the app, kept by the browser for a year.

The question as it was asked:
Today every visitor's browser asks Google for the fonts, so Google sees each visitor's IP address (a known privacy concern in the EU).
- **(recommended)** I download the font files once (Barlow, Barlow Condensed, Fira Sans, Fira Sans Extra Condensed, JetBrains Mono; all free to use under the SIL Open Font License) into `public/fonts`. The look stays the same, and the policy then blocks Google Fonts.
- Or keep Google Fonts.

### V4. Example texts that look like real companies — ✅ DONE (28 October, your yes)
**What was done:**
- **Admin › Integrations:** the CRM example is `https://crm.example.com/leads/{id}`, the recording example `https://recordings.example.com/calls?search={id}`, and the Voiso example `https://yourcompany.voiso.com`.
- **Business words:** "Competitors | brand A, brand B, another site" and "AcmeBank | Acme Bank, Akme Bank, Acme Bang", with their Bulgarian and French.
- **Elsewhere:** the test data and the example sentence of section U use Acme Bank too. No real-looking brand or company address is left outside `seed.js`.
- **Found on the way:** the example texts and screen-reader names of the 24 multi-line text boxes were never shown in Bulgarian or French, although their translations existed. They are now, and what people type in the boxes is never translated.

The question as it was asked:
Two places show real-looking company examples:
- the CRM and recording link examples in **Admin › Integrations**
- the examples in **Admin › Organization › Business words** (real brand names)
- **(recommended)** Replace them with neutral examples (`https://crm.example.com/leads/{id}`, "Competitors | brand A, brand B"), like the earlier clean-up.
- Or keep them.

### V5. Translations to check — ✅ DONE (28 October, your answers)
**Now in use:**
- "Yes, delete it": **Да, изтрий**. It fits both "го" and "я", so one text works everywhere.
- "all time": **за целия период**, and in French **pour toute la période** (your "pour le péridot entier", with the spelling fixed).
- "Required reading": **Задължително четене**, and in French Lecture obligatoire.
- "Quizzes passed": Издържани тестове.

**Kept as they were**, because your words change the meaning (tell me if you still want them):
- **"Still to do"** is a column title of Capacity planning and a card title of My Learning. It means "how many are left". "Продължи / Continuer" means "go on", a button text. It stays **Остава за изпълнение / Reste à faire**.
- **French "Yes, delete it"** is the button that confirms. "Êtes-vous sûr ?" is the question above it. It stays **Oui, la supprimer**.
- **French "Quizzes passed"**: "Quiz passés" means quizzes *taken* (also failed ones). "Quiz réussis" means *passed*, like the Bulgarian "издържани". It stays **Quiz réussis**.

The question as it was asked:
Five English texts had two different Bulgarian or French translations. The one in use was kept, and the list is in `docs/audit/LOCALIZATION_AUDIT.md`. Please tell me if the other one is better. Also, please read the 107 new Bulgarian and French texts of this round when you have time.

### V6. E-mails in the person's language
E-mails (welcome, password reset, reminders, reports) are always in English, even when the person uses Bulgarian or French. That is a known limit.
- **(recommended)** Translate the e-mail templates and send each e-mail in the language of the person who receives it.
- Or keep English.

### V7. Excel dates — ✅ DONE (28 October, your answer: exports always in English)
Excel exports are now always in English, whatever the screen language: the column titles, the values (Red Flag, Completed, Yes / No) and the US date format. Until now, the Reviews export translated its titles. Note: "Copy for Excel" copies the table as it is on the screen, so in Bulgarian it copies Bulgarian titles.

The question as it was asked:
Excel exports use the US date format (`10/28/2026`) in every language.
- **(recommended)** Use the format of the person's language (`28.10.2026` in Bulgarian, `28/10/2026` in French).
- Or keep the US format.

### V8. What other workspaces may see (R-6)
These are shared by the whole organisation today:
- the knowledge files, the knowledge base, quizzes, newsletters and AI Simulator scenarios
- the Administration team's rota, attendance and balances: every staff member can see them
- a team lead can name any staff member as their deputy, even one from another workspace

With one workspace this changes nothing. For several companies on one server it must follow the companies (R-1).
- **(recommended)** Decide it together with the move to separate companies.
- Or limit it to workspaces now.

### V9. A strict Content-Security-Policy
Round 4 added a security policy, but it must still allow inline scripts: the pages have 989 `onclick="…"` handlers. Moving them all to separate code is a big change, but it is the strongest protection against injected scripts.
- **(recommended)** Do it step by step, one page file at a time, after the SQLite move.

### V10. Two old test servers still running
Yesterday's audit session left two test servers running on ports 3199 and 3299 (test data only, not your real data). I did not stop them because they belong to that session.
- **(recommended)** Let me stop them.
- Or stop them yourself, or restart the computer.

### V11. The virus scanner and save speed
Every save takes about 0.3 s on this computer because Windows' virus scanner checks the new `data.json`. Excluding the data folder from scanning would make saves faster, but it is a security setting, and I did not change it.
- **(recommended)** Leave the scanner on. The SQLite move removes most of this cost anyway.

### Before merging `q-smart-v1-audit` into `q-smart-v1`
Nothing **blocks** the merge for your own use: all 226 tests, the 15 browser tests and the code checker pass, and your real data was never touched. What to do before you say yes:
1. **Test it yourself** (the folder is already on `q-smart-v1-audit`): restart your app on port 3100 so the server runs the new code too. Everyone signed in signs in again.
2. **Look at what you can see changing:**
   - the fonts (they should look the same)
   - the phone screen (sign in on your phone)
   - Admin › Integrations and Business words (the new examples)
   - an Excel export in Bulgarian (it should be English)
   - Bulgarian and French screens (the newly translated texts)
3. **Answer the three translations above** if you want them changed (not needed for the merge).

The merge does not fix the launch blockers for selling (R-1 separate companies, R-2 default password, R-3/R-4 SQLite, V1 time zone). Those are the next projects.

### Still waiting from earlier rounds
These need your decision and were not changed in round 4:
- R-1: separate companies
- R-2: every new account starts with the password "password"
- R-3 / R-4: the move to SQLite
- R-5: `seed.js` (in Git) still holds the password hashes of all accounts (round 1 found 2 that protect real passwords; not re-checked, because that would mean trying passwords) and one real-looking personal e-mail address in a registration
- R-8: password rules and two-factor sign-in
- R-10: scoring rules (missing answers count as Yes; all-N/A = 0%)
- R-11: quiz answers shown and unlimited retakes
- R-16: open registration
- R-21: CSAT duplicates on a second import
- R-23: who scheduled reports may go to

Details in `REMAINING_ISSUES.md`.

## Z. Your answers of 3 November

| # | Question | Your answer | What happens |
|---|---|---|---|
| 1 | Merge `q-smart-v1-audit` into `q-smart-v1` | **No** (not now) | Everything stays on `q-smart-v1-audit` |
| 2 | Database | **Firebase** (free of charge) | CLAUDE.md corrected (it still said SQLite) |
| 3 | Rename the GitHub repository | **Leave it** | — |
| 4 | Payments | ~~Paddle~~ → **Stripe** (changed on 4 November) | Built: Admin › Billing (see "Stripe" below) |
| 5 | Single sign-on, automatic users, password rules | ~~With Firebase, not before~~ → **Google and Microsoft sign-in now** (changed on 4 November) | When the two app registrations are given, and a sign-in design is chosen |
| 6 | E-mail sending | **Brevo** (answer of 3 November) | Ready: see "E-mails with Brevo" below |
| 7 | AI | **Claude, with a monthly limit per team** | When the API key is given |
| 8 | Contact support | **A form**: e-mail, subject, description, type of request, a file or picture, Submit | Built (3 November) |
| 9 | Importing conversations | Question: can calls be evaluated without storing them in Q-smart (to save Firebase costs)? | Answered in the chat |
| 10 | EU data location | **Yes** (EU Firebase region) | With Firebase |
| 11 | Webhooks, developer API, MCP, API keys | **Now** | Built (4 November): API keys for admins, access per area, all data readable by MCP |
| 12 | Sandbox, Import data, Beta features | **Now** | Built (3 November) |
| 13 | A person must check every AutoQA score | **No: AI scores are only for comparison (the accuracy rate of the reviewers, parallel scoring) and training, never to evaluate agents** | AI register updated: AutoQA is a limited-risk use as long as this stays true |
| 14 | Feature requests and release notes | **Per company; a release note with every change** | Release notes kept up to date |
| 15 | V1 time zone | **Yes**: start the server with `TZ=Europe/Sofia` | To do in the hosting set-up |
| 16 | V6 e-mails | **Always in English** | No change |
| 17 | V8 workspaces | **Workspaces are about users and teams; in the knowledge base, folders can be given to or taken from teams** | To build in the Knowledge Base |
| 18 | V9 strict security policy | **Yes, after the database move** | Later |
| 19 | V10 old test servers | **Yes, stop them** | Done (3 November) |
| 20 | V11 virus scanner | **Leave it on** | No change |

Also on 3 November:
- The Knowledge Base goes back to **Learning** (with My Learning, Quizzes and Newsletter). It is not the Help Center.
- The **Help Center** becomes a separate website on its own sub-domain, like the Zendesk Help Center, with articles about Q-smart (to build, from the Zendesk Help Center you will open).
- The **Knowledge Base** in Learning should look and work like **Confluence** (to build, from the Confluence you will open).
- The **Call Simulator** should be built like the one on converst-qa.web.app (to build, from the page you will open).

### E-mails with Brevo (3 November)
The app already sends its e-mails through any SMTP service. For Brevo, start the app with these five settings (Brevo › SMTP & API › SMTP; never put the key in GitHub):

| Setting | Value |
|---|---|
| SMTP_HOST | smtp-relay.brevo.com |
| SMTP_PORT | 587 |
| SMTP_USER | the SMTP login Brevo shows (an e-mail address) |
| SMTP_PASS | the SMTP key created in Brevo |
| MAIL_FROM | the sender address, checked in Brevo (Senders & domains) |

Brevo's free plan sends up to 300 e-mails a day. With your own domain, add the SPF and DKIM records Brevo shows, so the e-mails do not land in spam.

### Firebase (3 November)
- Start the Firebase version **only when you say so**.
- It will be a **separate repository**; this version of the app stays and keeps working.

### Your answers of 4 November
- **API keys:** admins only. **Access per area** (No access / Read / Write), like the developer pages of ElevenLabs.
- **Webhooks:** the events were chosen for you: review saved, changed, deleted; dispute opened, resolved; quick flag; task done; new user; practice call finished.
- **MCP:** may read **all** the data (also the comments and conversations), with the access of its key.
- **Public address:** the free Cloudflare address (*.trycloudflare.com). It changes at every restart of the tunnel, so the pages show the address you opened them with. A named tunnel on your own domain keeps one address.
- **Excel exports:** real dates (Date category) and real percentages (Percentage category) instead of Custom formats.

### Stripe (4 November)
- Admin › Billing: Plan & seats, Invoices, Payment method. Paying, the card, invoices and cancelling happen on Stripe's own pages.
- Seats = everybody with an active account.
- The Stripe keys are typed in Admin › Billing › Plan & seats and kept encrypted. Test keys (sk_test_…) never move real money.

### More answers of 4 November
- **AI team lead:** the Monday summary is **on by default** (an admin can switch it off). **Trainers** write summaries too. *(Done.)*
- **Reports and e-mails:** **nothing is sent to anybody by default.** A person chooses whether a report is scheduled, and how often. A scheduled report arrives as a **notification in the app**; e-mail only when "Also by e-mail" is ticked. *(Done for scheduled reports.)* The same rule applies to the monthly AI report and the Workforce reports. Voiso reports will be shared as an example.
- **Leave types:** annual leave stays adjustable (Workforce set-up › Leave types); sick, unpaid leave and personal hours exist; **"Other leave"** added. *(Done.)*
- **Workforce:** menu as proposed; check-in button first, telephony import later; a warning after too many lates, not a deduction; the fair split by working days and hours; a mid-month change is suggested and approved by a person; "Attendance is tracked from" set on the start day; old balances entered with Adjust. The morning brief, Bradford levels 50 / 125 / 400 and the 70% short-staffed share: **all OK as they are.**
- **Call Simulator:** a **universal product for every client** (not one industry), its **own look in the Q-smart colours**, a **new name** (to be given), **own scenarios** for each company, and the AI trainer **suggests a practice scenario** to an agent who is weak in a category. *(Next.)*
- **ElevenLabs voices:** yes, for the voice practice calls only (text calls stay free). *(Next.)*
- **Quinn:** a hybrid assistant that answers most questions without AI (plan first, then build).

---

## OPEN DECISIONS: the complete list (4 November)

Everything still open in this file and in REMAINING_ISSUES.md, in one place. Answer by number. The recommended choice is first.

### For the work now
1. **Call Simulator name**: what should it be called?
2. **Sign-in design**: A (split), B (centered card), C (dark with rings) or D (form with a product preview)?
3. **Quinn bubble** on every page, for every role, agents too? (yes / staff only)
4. **Quinn models**: Haiku 5.5 to pick the intent, Sonnet 5.5 for analysis? (yes / always Opus / always Haiku)
5. **Quinn hand-over** goes to: the admins (Contact support), or the team lead of the agent?
6. **Quinn limits**: €10 per company per month and 30 AI answers per user per hour? (or your numbers)
7. **Time zones for remote people**: each person their own time zone, with shifts in their local time? (recommended), or one company time zone?
8. **Filters and Columns** (like Reviews) also on Users, Disputes, Quick Flags, Teams and Tasks? (yes / no)
9. **Kainami recording test** (A5): drop it? (recommended: the Call Simulator here replaces it)

### Before selling to other companies
10. **R-2 First password**: replace password with a one-time invitation link and e-mail check? (recommended)
11. **R-8 Passwords**: at least 10 characters, and two-step sign-in for admins? (recommended; Google and Microsoft sign-in cover the rest)
12. **R-16 Registration**: invitation only, per company? (recommended), or keep open registration
13. **R-5 seed.js**: remove the password fingerprints and the real-looking e-mail from it? (recommended)
14. **R-10 Scoring**: every question must be answered (no silent "Yes")? And a review where everything is N/A is "not scored" instead of 0%? (recommended for both)
15. **R-11 Quizzes**: show the right answers only after passing, and at most 3 tries? (recommended)
16. **R-21 CSAT import**: the same lead + date + agent counts once? (recommended)
17. **R-23 Report e-mails**: only to user accounts of the company? (recommended)
18. **R-17 Lock-out**: keep "10 wrong passwords = 15 minutes locked"? (recommended, with Google and Microsoft sign-in)
19. **V8 Workspaces**: decide what one workspace may see of another together with separate companies (Firebase)? (recommended)

### Things only you can do (not decisions)
- **Stripe:** the account, the plans and prices, the secret key, the webhook secret, the portal (see the message of 4 November).
- **Google and Microsoft sign-in:** the two app registrations.
- **Claude API key; ElevenLabs API key.**
- **Voiso:** access to its reports, as an example for our reports.
- **Patent attorney:** the description is in the folder docs/patent (on your computer only, not in Git).
- **A named Cloudflare tunnel on your own domain:** one address that does not change, needed by Stripe, Google and Microsoft.

### Your answers to the open decisions (4 November)
1. **Q Trainer** is the new name of the Call Simulator.
2. Sign-in: none of A-D. A **centered, modern** screen that keeps the company symbols (the Q with its rings and waves), and a **small globe** button for the language.
3. The Quinn bubble on every page, for every role: **yes**.
4. Quinn models: **always Claude Haiku 5.5**.
5. The Quinn hand-over goes to **both**: the admins (Contact support) and the agent's team lead.
6. Quinn limits: **yes** (€10 per company per month, 30 AI answers per user per hour).
7. Time zones: **each person their own**, with shifts in local time.
8. Filters and Columns on Users, Disputes, Quick Flags, Teams and Tasks: **yes**.
9. The Kainami recording test is dropped. Question answered in the chat: transcripts can come from the dialer, or from a free model on our own server (Whisper), and AutoQA scores them with rules, without AI.
10-19: **as recommended** (your answer: "I like all your suggestions"). Done on 4 November: 11 (10 characters by default; two-step sign-in still to build), 12 (invitation only; an admin can open registration in Admin › Organization › Sign-in), 15 (3 tries, answers after passing), 16 (CSAT duplicates), 17 (report e-mails only to accounts), 18 and 19 (nothing to change). Still to build: 10 (invitation links), 11 two-step sign-in, 14 (scoring rules). **13 (seed.js) waits for your OK**, because your rule says I never change seed.js.
- **Transcripts** (your OK, 4 November): keep the review, its scores and short quotes as proof; keep a link to the call in the dialer; delete the transcript itself after a number of days set per company. *(To build.)*
- **13 seed.js** (your OK, 4 November: "I don't mind changing the data … I only want to keep" Viktoria Petrova, Gabriela Georgieva, Gabriela Nikolova and Gabriela Pencheva): done. The three real e-mail addresses became made-up ones (g.georgieva@test.com, g.pencheva@test.com, gabriela.registration@test.com) and the two passwords that were not the test password are now "password". Nobody was removed: the 17 people, the teams and the 842 reviews stay. Your real data.json is not changed, so your own sign-in works as before.
- **Sign-in screen** (4 November): centered, "Dark stage" in dark mode and "Light" in light mode, with a light / dark switch and the language globe on top. The menu on the left follows light and dark mode; its menu search shows one compact line per page.
- **Done on 4 November** (your answer: "yes do it like this"):
  - **14 Scoring**: every question must be answered (Yes, No or N/A); a review where everything is N/A is saved as **Not scored** and counts in no average, chart, report or API statistic. A category where everything is N/A shows N/A, not 0%.
  - **8 Filters & Columns**: Users and Teams have the Filters panel and the Columns chooser like Reviews; Quick Flags, Disputes and the task list keep their filter bars and have Columns and Copy.
  - **7 Time zones**: each person can have a time zone (Admin › Users › the user form; empty = the company time zone in Admin › Organization). Shifts, lateness, missing check-ins, the automatic check-out and the day itself follow the person's local time.
  - **Transcripts**: Admin › Data protection › Transcripts: delete the text after 7 to 365 days (default: keep for ever). The review, its scores, the comments and the dialer link stay.
  - **10 invitation links and 11 two-step sign-in**: not built in this version. They come with the Firebase version, where Firebase Authentication provides them (accounts, sign-in links, two-step sign-in), so nothing is built twice.
