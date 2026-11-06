# Q-smart v2: release notes

Newest first. Each step is tested before it's saved: automatic tests, then a check in the browser as every role.

## 6 November 2026: Phase 1 (foundation), in progress

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
