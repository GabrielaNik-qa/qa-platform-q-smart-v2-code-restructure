# Q-smart v2: release notes

Newest first. Each step is tested before it's saved: automatic tests, then a check in the browser as every role.

## 10 November 2026: Phase 3 (Home & Analytics), in progress, on branch `v2-phase-3`

- **Fixed from Phase 2:** GitHub's checks failed after the merge, although all 140 tests passed there. A test database was stopped a moment before its last connections had really closed, and the test tool counted the message they got as an error. The test database now waits until every connection has left before it stops (checked by stopping it right after closing ten connections, five times in a row).
- **GitHub now also checks each phase's own branch** (`v2-phase-2`, `v2-phase-3` …), not only `main`, so a problem shows up before a phase is merged.
- **Step 1: the Dashboard, part 1** (Quality › Home › Dashboard):
  - **The counting, the same as today's:** one shared set of rules counts every number, so a number is never counted two ways. A test runs it next to today's own report engine on today's 842 demo reviews: the same counts, averages and pass rates overall and per team, review type, agent and category. The change ▲ ▼, the trend, the 10-week line and the grouping by day, week, month and quarter match today's formulas, copied into the test word for word.
  - **The page as today:** "Welcome back" with your role, "+ New evaluation" for admins and reviewers, and one row of filters above everything: "Date is" (last 7 days, 30 days, 12 months, all time, custom dates), then "+ Filter" for type, team, agent, reviewer and scorecard (agents: type and scorecard), and Reset.
  - **The 13 number tiles** (average score, total, reviewed conversations, review time, reviewed agents, disputed, with comments, unseen, pass rate, fail rate, recent trend with its small line, flags, open disputes), each with ▲ ▼ against the period before (∅ when there is nothing to compare with), and the charts **Quality scores over time** and **Category scores over time**.
  - **Each role starts with today's dashboard for it.** Widgets that aren't built yet are left out, as today; the other quality widgets and Personalize come in step 2.
  - **The charts are drawn by v2 itself, as today** (your decision of 10 November: no chart library). They follow the chart rules: hover or use the arrow keys to see every value at a date; a "Table" button with the same numbers; text always 12px, also in a narrow card.
  - **Three differences from today, on purpose:**
    - "Quality scores over time" shows the number of reviews in its own strip under the line, instead of a second scale on the same chart, which is easy to misread.
    - The category lines use eight colours checked for colour blindness in both themes; today's colours failed that check (green against yellow, yellow against orange).
    - A review counts for the team the agent was in when it was reviewed (today: the agent's current team), the same team that decides who may see it. The Flags tile counts quick flags of the chosen period only (today: of all time).

## 10 November 2026: Phase 2 (Quality), finished (tag `v2-phase-2`)

Built from 6 to 10 November on branch `v2-phase-2`. Every step was checked in the browser as admin, reviewer, team lead, trainer and agent, and in English, Bulgarian and French. 140 automatic tests pass.


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
- **Disputes**, as today:
  - **On the review's page**, the agent disputes their own review with a reason, once. The review then shows as "Disputed".
  - **The conversation:** the agent, the admins and the reviewers of the agent's workspaces write in it while it is open. Team leads and trainers read it.
  - **Resolving it:** an admin or reviewer chooses "Score kept", "Score changed" or "Score partly changed", with an optional closing note, and is asked "Are you sure?" first. A resolved dispute can't be reopened. The score itself is changed with Edit, as today.
  - **Who is told:** the admins and the reviewers who reach the agent's team get the new dispute and the agent's messages in the bell; the agent gets the answers and how it ended. Opening and resolving go into the activity log.
  - **Quality › Disputes:** the tiles Total, Disputed, In progress and Resolved (click one to filter), search, filters for team, agent, type and date, the table with columns to choose (saved with your account), and Export to Excel for admins and reviewers.
  - **What the disputes say** (admins and reviewers): how disputes end (average time to resolve, how often the agent was right), the disputed categories, who disputes and whose reviews are disputed.
  - **What is kept:** nobody can change or delete a message, not even the server (tested). Deleting the review deletes its dispute. If a person leaves, their name stays on their messages.
  - AI reviews (Phase 3b) will be disputed the same way, and a person then decides.
- **Quick Flags** (Quality › Quick Flags), as today:
  - A red or green flag on a call, chat, e-mail or other conversation, kept apart from QA reviews: **scores never change** (tested).
  - **Who:** admins, reviewers, team leads and trainers give, change and delete flags for the agents of their workspaces (admins: all). The agent is told in the bell, with the comment. Agents don't see the page, as today.
  - **One row per conversation:** every review, plus the conversations that only have quick flags (matched on lead ID and agent). The review's own flag shows as "QA Red" or "QA Green" next to the quick flags; clicking a quick flag opens it.
  - The tiles Total Flagged, Red Flags and Green Flags, search, filters for team, agent, type and date, and the flag filter (All Calls, Flagged, Red, Green, No Flags) with counts. Columns to choose (saved with your account), and Export to Excel in today's layout.
  - **The "New Quick Flag" window:** red or green, the conversation type, team and agent, lead ID, date, and optionally the campaign, the CRM link, the recording or conversation link and a comment. The red and green flag buttons on a row fill it in from that conversation. When you change a flag, it shows who gave it and has Delete (after "Are you sure?").
  - Every flag given, changed or deleted, and every export, goes into the activity log.
- **Calibration** (Quality › Coaching › Calibration), as today:
  - **Sessions:** admins, reviewers, team leads and trainers make a session with a title, date, status (planned, held, closed), participants, the teams discussed and an agenda. The person who makes it is always in it, and the others are invited in the bell. **Only the participants and admins see a session** (today's permission rule, now also on the server).
  - **Who changes what:** the maker (or an admin) edits, deletes, takes reviews off and chooses the reference score. Each participant writes only their own part (impressions of the team(s), what they have done), adds reviews they can see, scores, and keeps the decisions and actions (with an owner among the participants and a due date).
  - **Blind scoring** (from Zendesk QA): everyone scores the same reviews on their own. Until you have saved your score of a review you see only how many have scored it, not their scores. The maker and admins see all of them, and everyone does once the session is closed; then the scores can no longer change. The server hides them, not just the page (tested).
  - **The reference** is the review's own score, or one participant's. Each score shows its difference in points, and "How far each person is from the reference" rates everyone Aligned, Close or Calibrate.
  - **Reviewer consistency:** each reviewer's average score against everyone's, and how often their scores had to change after a dispute (Consistent, Watch, Calibrate).
  - Each session has its own page (its address can be shared, and the invitation in the bell opens it). Making and deleting a session go into the activity log.
  - If a participant is taken off the session or leaves the company, their part and their scores go with them. A review that is deleted leaves the sessions too.
- **Reviewer QA** (Quality › Reviewer QA), as today:
  - **Checking a review:** admins, reviewers and team leads check a review made by someone else with four yes/no questions (the score is fair, it follows the scorecard, the critical items are right, the comment helps the agent) and a note for the reviewer. Trainers read the checks; agents don't see the page.
  - **Reviewers** shows each reviewer's score, the share of "yes" (green from 80%, orange from 60%), and **Latest checks** the last 50, with a link to each review.
  - **New in v2:** nobody checks their own reviews, or changes or deletes a check of them (tested). Staff see and change only the checks of their workspaces' agents, admins all (today everyone saw everything). Each review in the list starts with its lead ID, so two reviews of the same day can be told apart.
  - A check stays when its review is deleted, with the lead ID and the names as they were. Every check given, changed or deleted goes into the activity log.
- **Pins** (Quality › Coaching › Pins), as today:
  - Admins, reviewers, team leads and trainers pin a moment of a reviewed conversation to talk about with the agent in a coaching session: the review, the moment (like 02:15) and what to talk about.
  - **To talk about** and **Talked about** (the last 40). Staff mark a pin "talked about", change it or delete it; marking it keeps everything else as it was (tested).
  - **Agents see only their own pins** and can open the review; they change nothing. Staff see the pins of their workspaces' agents, admins all.
  - A pin stays when its review is deleted, with the lead ID and the names. Pinning and deleting go into the activity log.
  - Each review in the list starts with its lead ID.
- **Tests on Windows:** a temporary test database folder that Windows keeps locked for a moment no longer fails the run.

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
