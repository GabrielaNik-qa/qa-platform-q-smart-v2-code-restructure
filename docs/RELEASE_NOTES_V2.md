# Q-smart v2: release notes

Newest first. Each step is tested before it's saved: automatic tests, then a check in the browser as every role.

## 6 November 2026: Phase 2 (Quality), in progress, on branch `v2-phase-2`

- **Scoring, the same as today's:**
  - Yes/No/N/A per item; N/A leaves its points out.
  - A critical item answered No makes its category 0; a critical category with any No makes the review 0%.
  - Everything N/A means "not scored", and the review stays out of every average.
  - A review passes at the pass rate or above.
  - Proven by a test that runs today's own scoring next to v2's on today's scorecards, 5000 times with random answers: always the same result.
- **Quality set-up** (Admin › Setup › Quality set-up), with today's rules:
  - **Scorecards:** the list with tag filters, and the editor (categories, items, points, critical and compliance, move up and down, "Add category from library", a total that turns green at 100), plus Duplicate.
    - Points must add up to exactly 100, and at least one scorecard remains.
    - Reviews keep their own copy, so editing a scorecard never changes them.
    - Outside admins, people see the scorecards of their own workspaces.
  - **Categories** (the library), **Root causes** (admins and reviewers change them) and **System settings** (the company's pass rate, 85% by default, and an optional one per team).
  - **Workspaces** now also hold their scorecards.
  - The demo company starts with today's two demo scorecards, seven library categories and six root causes.
  - Every change goes into the activity log.
- **QA Entry and reviews:**
  - **What QA Entry asks for:** the review type (call, chat, e-mail, other), team, agent, lead ID, date, campaign and scorecard.
  - **The answers:** Yes/No/N/A for every item (Yes to start with, as today), with a comment and the root cause of a No.
  - **The rest:** the links, the transcript of chats and e-mails, the general comments, and the flag.
  - The score shows live while you answer: Passed or Failed against the team's or company's pass rate, a critical failure, or "not scored".
  - **Who may do what:** admins and reviewers enter reviews (reviewers for the agents of their workspaces, with the scorecards they can use). Agents see their own reviews, staff those of their workspaces, admins all.
  - **The agent:** gets a notification for a new review and for a changed score; opening it marks it as seen. Staff can remind them to open it.
  - **Each review has its own page:** the score, every answer with its comments, the links and the transcript, with Edit (asks "Change this score?" before changing a score) and Delete.
  - **Call recordings are never stored:** a review keeps only the link to where the recording is.
  - **What a review keeps:** its own copy of the scorecard and the names as they were. Deleting the scorecard, the team or the agent's account leaves the review readable.
- **The Reviews list** (Quality › Reviews), as today:
  - Search, and filters for date (last 7 or 30 days, all time, custom), team, agent, result, status, flag, seen by the agent, reviewer and scorecard. Agents see only their own reviews, so they have no team, agent or reviewer filters.
  - The review types as chips with their counts.
  - Columns to choose: saved with your account, so they're the same on every computer.
  - Sorting by any column, and pages of 10, 20, 50 or 100.
  - View, remind the agent, and delete, for staff.
  - **Export to Excel**, always in English as today: one column per scorecard category, real Excel dates and percentages. Only reviews the person may see ever go in the file (tested), and each export is listed in Activity Log › Exports & downloads.

## 6 November 2026: Phase 1 (foundation), finished (tag `v2-phase-1`)

- **The activity log** (Quality › Activity Log), as today:
  - **All activity**, **Sign-ins** and **Exports & downloads** for admins; **My activity** for everyone (what you did, and what was done to your account).
  - Every change to people, teams, workspaces, skills and languages is recorded with who, when and what, in the reader's language. So are name changes, Roles & permissions and new client companies.
  - Each sign-in is recorded once, at the moment it happened, with the address it came from.
  - Nobody can change or delete an entry, not even the server (tested). Passwords are never recorded.
  - Wrong passwords are stopped by Firebase, which locks the account for a while after too many tries. So the failed attempts of today's log are no longer there.
  - Excel exports arrive in phase 2.
- **The notification bell** at the top of every page:
  - The number of unread notifications is on it. Opening the list marks them read; each one opens its page, and you can delete your own.
  - It tells you when your role, team, workspaces or team lead changes, and welcomes you to a new company. New ones show up by themselves.
  - Each person sees only their own (tested).
- **Roles & permissions** (Admin › People › Roles):
  - **All roles:** every menu page against the five roles.
  - A page per role, with a column per person, where a person can have their own choice (shown with a thick box).
  - Admins always keep the Admin pages.
  - **Back to the standard settings** removes every choice.
  - It changes only the menu: what each role may read or change stays decided by the server's rules, as today.
- **My account › Notifications & Confirmations:** welcome messages and tips, routine confirmations, messages you switched off, what is always shown, and restoring the defaults. It's saved with your account. Today's sounds come later, with the pages that make sounds.
- **The menu as apps**, with today's sidebar:
  - **Quality** is the main menu: Operations and Manage.
  - **Workforce** is now its own app.
  - **Learning** (with Tools), **Q Trainer**, **AI** (Q-Intelligence, AI agents, Transcripts, AI Hub) and **Admin** (Account, People, Setup, Governance, Platform). Admin is called **Settings** for everyone but admins, as today.
  - An app switcher beside the Q-SMART name (like Google's or Atlassian's). You also see the **Q-smart owner** area there.
  - Each role sees today's pages: for example, only admins see Users, Teams, Workspaces and Skills, and agents don't see QA Entry or Quick Flags. Opening a page by its address doesn't get around this.
  - The 144 pages, their icons and their names in three languages come straight from today's menu. Pages v2 hasn't built yet are greyed with "Soon" and say which phase of the plan builds them.
  - Today's **Search the menu…**; sections that fold into a row of icons; the light/dark/system buttons; your initials, name and role at the bottom, with Admin/Settings and Log out.
  - For the look pass at the end: today's icons-only sidebar (for narrow windows) and its pop-out lists.
- **My account:**
  - **Profile:** your name, and your own skills and languages, as today.
  - **Password:** asks for the current one first. Google accounts are told Google manages it.
  - **Appearance:** light, dark or system. Today's colour themes come in the look pass.
  - **Language:** saved with your account, so it's the same on every computer. At sign-in your saved language comes back. If you haven't saved one, the one you picked on the sign-in screen is saved.
  - Notifications & Confirmations come with the notification bell, the next step.
- **Sign-out** clears the menu's folded sections from the browser. The next person always starts on their own first page.
- **The sign-in screen now looks like today's** (your design of 4 November). It has:
  - the Q-SMART name, the round light/dark button and the language globe on top;
  - the big Q logo with sound waves;
  - the warm card in light mode and the dark stage in dark mode;
  - the orange-to-pink button, the eye to show the password, and "© 2026 Q-smart" at the bottom;
  - today's heartbeat animation from "Sign in" until the first page is ready.
  - Checked against today's app, element by element (sizes, colours, fonts), in light and dark mode and in the three languages.
  - v2's "Invited? Create your password" and "Sign in with Google" look like today's "Register" button.
  - The Help Center link comes back when the new Help Center is online (Phase 11).
- **Teams, workspaces, skills and languages**, with today's rules:
  - **Teams** have a description, a colour, a team lead (an active admin, reviewer, team lead or trainer), and their skills and languages. Administration is built in and can't be deleted; a team with people in it can't be deleted; a company keeps at least one working team. If a team lead becomes an agent or leaves, their teams wait for a new lead.
  - **Workspaces** group working teams with their reviewers, team leads and trainers. Except admins, people see only the people and teams of their own workspaces (agents: through their team). A new team goes into the workspace you choose (the first one if you don't), and so do invited reviewers, team leads and trainers. Once there is a workspace, there is always at least one.
  - **Skills and languages** are company lists that people and teams pick from. A new name shows everywhere at once; deleting one takes it away from everybody.
  - The demo company starts with a "Customer care" workspace, team leads, and made-up skills and languages.
- **The server's refusals are in your language:** each one comes with a short code, and the pages show it in English, Bulgarian or French.
- **An account that no longer works** (deleted or switched off in Firebase) goes back to the sign-in screen by itself, instead of a stuck page.
- **The company wall** now covers the new tables too: four more tests try to reach another company's teams, workspaces and skills, or make a team Administration; all are refused.
- **Earlier in Phase 1:** permissions on every route (today's matrix), the platform owner area (only you see it), the People page (invite, role, team, switch off, remove), and sign-in with your own password, with Firebase checking the e-mail first.
- **Checked in the browser** as admin, reviewer, team lead, trainer and agent, in the three languages, in light and dark mode.

## 6 November 2026: Phase 0 (set-up)

- **Your real Firebase projects:** "Q-smart" (`qsmart-official`, for clients, the website and the Help Center) and "Q-smart Demo" (`qsmart-demo`), with e-mail and Google sign-in switched on.
- **Sign in with Google**, and **invitations:** a person invited by e-mail gets the company the first time they sign in with that e-mail, verified by Firebase. An unverified e-mail, or someone trying the same invitation a second time, gets nothing (tested).
- **`Start Q-smart v2 (real sign-in).cmd`** starts v2 with the real "Q-smart Demo" project. If v2 is already running in another window, it says so clearly.

- **Today's app moved into `current-app/`**, unchanged. All 253 of its tests pass there, and it runs on port 3100 as before.
- **The v2 workspace:** TypeScript in strict mode everywhere, with automatic code checks, one format, and tests. GitHub runs v2's checks on every change, for free.
- **The five roles of v2:** admin, **reviewer** (today's "QA"), team lead, trainer and agent, named in English, Bulgarian and French.
- **The company wall:** in the database itself, each company sees, changes and adds only its own rows, and without a company nothing is visible. Ten tests try to get through it in every way the server could; all are refused.
- **The server** checks every sign-in with Firebase. Company pages also check that the person belongs to that company.
- **The sign-in page and the first page after it**, in today's colours, fonts and orange "lane" mark, light and dark, in English, Bulgarian and French. After sign-in it shows your companies and your role in each, and a company's teams, read behind the company wall.
- **One double-click to start v2 on your PC:** `Start Q-smart v2.cmd`. Nothing to install: the database and Firebase's local sign-in start by themselves.
- **Checked in the browser** as admin, reviewer, team lead, trainer and agent, in the three languages, in light and dark mode. A wrong password shows a clear message.
- **Still to do in Phase 0, together with you:** the real Firebase project (with the free web.app names), and the free Neon account for the online demo database.
- **Known:** today's app's own tests get stuck on GitHub's Linux machines (on your PC they pass). They now stop after a time limit while I find the cause. v2's checks pass on GitHub.
