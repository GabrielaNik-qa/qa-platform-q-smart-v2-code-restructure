# Q-smart v2: release notes

Newest first. Each step is tested before it's saved: automatic tests, then a check in the browser as every role.

## 6 November 2026: Phase 0 (set-up)

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
