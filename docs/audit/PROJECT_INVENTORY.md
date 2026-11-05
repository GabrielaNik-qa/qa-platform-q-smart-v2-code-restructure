# Q-SMART – Project inventory

Audit date: 2026-10-24 (round 1, and round 2 at maximum depth) · Branch: `q-smart-full-audit` · Starting commit: `a1da4aa` ("Translate the new sections into Bulgarian and French")

## Starting point (Git)

| Item | Finding |
|---|---|
| `main` | `a1da4aa` |
| `q-smart-latest` | No reference with exactly this name exists. `q-smart-latest-23-10-26` points to the same commit as `main` (`a1da4aa`). |
| Remote | `origin` = github.com/GabrielaNik-qa/qa-platform-q-smart-v7 (`origin/main` = `a1da4aa`, `origin/V7` = `afc6b56`). Nothing was pushed by this audit. |
| Uncommitted work | Only the untracked `.claude/` folder (Claude Code settings and a leftover worktree folder). It was kept as it was. A second launch entry, `q-smart-audit`, was added to `.claude/launch.json` for the throw-away test server. |
| Baseline tests | 79 of 79 passing (`npm.cmd test`, ~15 s). |

## Architecture

- **Server:** Node.js 24 + Express 5 in one process (`server.js`). It listens on `PORT` (3000 by default; the launch configuration uses 3100) and is shared through a Cloudflare Tunnel.
- **Front end:** plain JavaScript in `public/js` (about 30 files, about 600 KB without translations), with one HTML page (`public/index.html`) and hash routing (`#dash`, `#calls`, …).
- **Database:** one JSON file, `data.json` (about 880 KB, 17 users, 152 reviews). Every request reads the whole file and every change rewrites it (written to `data.json.tmp` first, then renamed). `DATA_FILE` points the server at a different copy.
- **Other storage:**
  - `audit.json`: audit log, at most 5,000 entries, written 0.4 s after each change.
  - Call recordings: `Documents\Q-smart recordings`, or `RECORDINGS_DIR`/`REC_DIR`.
  - Backups: `backups/`, or `BACKUPS_DIR`.
  - `seed.js`: a full copy of the data, kept in Git.
- **Sessions:** `express-session` with its default in-memory store. Every sign-in ends when the server restarts.
- **Background job:** the scheduled-report e-mailer runs every 10 minutes (`routes-more.js`).
- **External services, all optional:** SMTP through nodemailer, and the Anthropic API (`ai.js`, only when `ANTHROPIC_API_KEY` is set).
- **Languages:** English, Bulgarian and French (`public/js/i18n`).

## Roles

`admin`, `qa`, `lead` (team lead), `trainer`, `agent`. All staff sit in the built-in **Administration** team. Agents belong to a working team.

**Workspaces** split the data inside one organisation:
- Admins see everything.
- Staff see the teams of the workspaces they belong to.
- Agents see only their own records.

Workspaces are **not** separate customer organisations (see SAAS_READINESS.md). The real data has one workspace.

## Modules, files and API routes

| Module | Server file | Main routes | Front-end files |
|---|---|---|---|
| Sign-in, account, registration, password reset | server.js | `/api/login`, `/api/logout`, `/api/me`, `/api/profile`, `/api/password`, `/api/password/first`, `/api/prefs`, `/api/register`, `/api/registrations/*`, `/api/forgot`, `/api/reset` | core.js, main.js, modals.js, prefs.js |
| Users, teams, roster | server.js | `/api/users/*`, `/api/teams/*`, `/api/roster` | admin.js |
| Reviews (evaluations), disputes, recordings | server.js | `/api/evaluations/*` (create, change, delete, seen, remind, dispute, dispute/msg, dispute/resolve, recording), `/api/recordings/:file` | entry.js, reviews.js, modals.js, flags.js |
| Scorecards and scoring | server.js, scorecard.js | `/api/scorecards/*` | scorecards.js, entry.js |
| Settings, layouts, saved views, notifications | server.js | `/api/settings`, `/api/settings/x/:key`, `/api/layout(s)`, `/api/views`, `/api/shared-views`, `/api/notifications/*` | widgets.js, admin2.js, main.js |
| Excel export and Export centre | server.js, routes-more.js | `/api/export/call-reviews`, `/api/exports/*` | reviews.js, flags.js, reports.js |
| Tasks, missions, templates | routes-work.js | `/api/tasks/*`, `/api/task-templates/*` | tasks.js |
| Coaching, one-to-ones, calibration | routes-work.js | `/api/sessions/*`, `/api/calibrations/*` | work.js |
| Quick flags, call simulator | routes-work.js | `/api/qflags/*`, `/api/simulations` | flags.js, pages.js |
| Reports (builder, saved, scheduled) | routes-more.js, public/js/rpt-engine.js | `/api/c/reports`, `/api/c/reports/:id/send` | reports.js, rpt-engine.js |
| Performance (goals, improvement plans, recognition), Compliance & CX (risks, complaints, CSAT) | routes-more.js | `/api/c/:col` for goals, pips, kudos, risks, complaints, surveys | perf.js, comply.js |
| Planning (review planner, workload, calendar) | routes-more.js (settings `planner`) | `/api/settings/x/planner` | planning.js |
| Backups and data | routes-more.js | `/api/backups/*`, `/api/seed/refresh`, `/api/demo/reset` | admin2.js |
| Knowledge base, quizzes, newsletter, AI import, ZIP export | routes-learning.js, ai.js, public/js/md.js | `/api/kb/*`, `/api/quizzes/*`, `/api/ai/*` | learn.js, md.js |
| Skills, workspaces, root causes, categories, Auto QA categories | routes-setup.js | `/api/skills`, `/api/workspaces/*`, `/api/root-causes/*`, `/api/categories/*`, `/api/auto-cats/*` | admin.js, scorecards.js |
| Auto QA | routes-autoqa.js, autoqa.js, ai.js | `/api/autoqa/*` | autoqa.js |
| Audit log | audit.js | `/api/audit` | admin2.js |

The full who-can-do-what table is in SECURITY_AUDIT.md (permission matrix).

## Dependencies (direct)

| Package | Version | Use |
|---|---|---|
| express | 5.3.0 | web server |
| express-session | 1.19.0 | sign-in sessions |
| bcryptjs | 3.0.3 | password hashing |
| exceljs | 4.4.0 | Excel export |
| jszip | 3.10.2 | ZIP export |
| mammoth | 1.13.0 | Word import |
| nodemailer | 10.2.0 | e-mail |

The front end loads Google Fonts. Everything else is served by the app itself.

## Existing tests (before the audit)

These use `node:test`, with no extra test framework. 9 files, 79 tests:
- scoring rules
- pop-up preferences
- HTML escaping
- translations
- Markdown and syntax
- Auto QA
- two API suites that start the real server on a temporary copy of the data

There are no browser (end-to-end) tests, no linter and no build step.

**After the audit:** 129 tests in 11 files. The audit added:
- `test/security.test.js` (36 tests, a separate server with two workspaces)
- `test/workflows-more.test.js` (14 workflow tests)

One existing test now checks the stricter password-reset behaviour (see FUNCTIONAL_AUDIT.md).

## Current limitations (summary)

- Single-file JSON database, single process, sessions kept in memory. The move to SQLite is planned in CLAUDE.md.
- No separation between customer organisations (no tenants).
- Every new or reset account starts with the password `password`.
- No linter or static-analysis tool is configured.

Details, priorities and next steps are in REMAINING_ISSUES.md.

## Round 4 (28 October 2026)

### Starting point

| Item | Finding |
|---|---|
| Tested version | `q-smart-v1` at `3440283` (2026-10-27 22:34, "Remove every company mention…"). The audit branch `q-smart-v1-audit` was made from it. |
| Other branches | `main`, `q-smart-full-audit`, `q-smart-latest-23-10-26` and `origin/V7` have nothing that `q-smart-v1` lacks. `origin/main` (GitHub) has 17 commits of an older line of work (24 October) that split off at `020ac44`; not merged. |
| Uncommitted work | Only `.claude/` (untracked on purpose). Two launch entries were added there for round 4: `q-smart-round4` (port 3200) and `fake-ai` (port 3298). |
| Baseline tests | 168 of 168 passing (`npm.cmd test`, 46 s). |
| Environment | Node.js 24.11.0, npm 11.6.1, Windows 11 Pro 10.0.26200, Chromium (Playwright 1.56.1) and the Claude desktop app's browser. |
| Data size today | The copy of `seed.js`: 4.5 MB, 17 people, 842 reviews. |

### Architecture changes since round 3

- **Route files:** `routes-wf.js` (calendars, shifts, rota), `routes-att.js` (attendance, time off), `routes-today.js` (Team today, morning brief, reports), `routes-cap.js` (capacity planning), `routes-ai.js` (AI settings and the AI team), `routes-org.js` (Organization, Q-Intelligence).
- **Rule modules:** `wf.js` (calendars, Bulgarian holidays, shift windows, day status, leave spans, balances, Bradford score) and `cap.js` (the fair split).
- **Files next to the data:** `.qsmart-key` (the encryption key of the AI keys) and `ai-usage.json` (this month's AI cost).
- **Background jobs:**
  - every 5 minutes: missing check-ins and the morning brief
  - every hour: the AI weekly summary and the AI monthly report
  - every 12 hours: the retention purge
  - every 10 minutes: scheduled reports
  - `NO_SCHEDULE=1` switches the first four off, for tests.
- **New in round 4:**
  - gzip compression, a Content-Security-Policy, a Permissions-Policy and an Origin check
  - `GET /api/health` and a clean stop on Ctrl+C
  - the developer tools are off with `NODE_ENV=production` unless `DEV_TOOLS=1`
  - the fonts are served by the app itself (`public/fonts`: 66 woff2 files and 5 licences, kept by the browser for a year). Google Fonts is no longer used, and nothing on the pages is loaded from another site (V3).
- **Development tools (not part of the app):** ESLint 9.39.1 with `globals` 16.5.0, and `@playwright/test` 1.56.1. Run them with `npm.cmd run lint` and `npm.cmd run test:e2e`.

### Pages per role (counted in the browser, round 4)

| Role | Pages that open | Pages refused (back to the dashboard) |
|---|---|---|
| Admin | 68 | none |
| QA | 49 | 19 (admin and organization pages, workforce set-up…) |
| Team lead | 45 | 23 |
| Trainer | 44 | 24 |
| Agent | 25 (Reviews, Disputes, AutoQA, Simulator results, One-to-One, Tasks, Knowledge Base, Quizzes, Newsletter, My Learning, Calendar, Goals, Improvement plans, Recognition, Rota, Attendance, Time off, Capacity, Personalize, Dashboard…) | 43 |

Odd addresses (`#constructor`, `#__proto__`, `#toString`, `#`, `#%00`) show the dashboard for everybody.

### Tests (round 4)

**Unit and API tests:** 27 files (`npm.cmd test`), 214 tests, all passing. New in round 4:

| File | Tests | What it covers |
|---|---|---|
| `fixture-round4.js` | – | The made-up people of round 4, and the start helper |
| `fake-ai.js` | – | The fake AI service |
| `gen-large.js`, `measure.js` | – | Large made-up data; speed measurement |
| `pentest-round4.test.js` | 11 | AI and Q-Intelligence across workspaces, hostile AI, AI errors, the key, the simulator, knowledge files, no key |
| `pentest-round4b.test.js` | 19 | Sign-in and sessions, creating people, headers, CSRF, files, exports, odd input, mass assignment, IDOR (time off, attendance, capacity), the personal data download, links, production mode |
| `reliability.test.js` | 3 | Health check, a hard stop while saving, orphan records |
| `calc-round4.test.js` | 4 | New Year, 29 February, clock changes, Easter 2027 |
| `i18n-server.test.js` | 2 | The server's messages in both languages |
| `shared-names.test.js` | 2 | No name declared at the top of two page scripts |
| `speed.test.js` | 1 | The speed budget |
| `fonts.test.js` | 4 | The fonts come from the app: nothing loaded from another site, every font file real and used, the licences, the right type and cache, the security policy |

**Browser tests:** `test/e2e/` (`npm.cmd run test:e2e`), 15 tests in 2 files. Any request a page makes to another site counts as an error.

### Every route and the tests that call it (round 4)

220 routes in the code. `test/role-matrix.test.js` calls **every** one (except `POST /api/logout` and, for the admin, `POST /api/demo/reset`) as every role and signed out, and checks the permission answers.

The last column lists the other test files that call the route by its address (the path up to its first variable part). **This is an upper bound:** a route that shares its address with another, for example `/api/evaluations/:rid/seen` and `/api/evaluations`, is counted as called when only its neighbour is. By that measure, 197 of 220 routes (90%) are called by at least one test besides the role matrix. After checking the `server.js` rows by hand, **196 of 220 (89%)** remain (signing out is called by the browser tests; marking a review as seen and changing the system settings are not called directly). The 24 marked "role matrix only" (or "not called directly") are checked for permissions only, and are the next to get functional tests.

| Route | File | Who may call it | Called by (besides the role matrix) |
|---|---|---|---|
| GET `/api/audit` | audit.js | admin | api |
| GET `/api/ai/settings` | routes-ai.js | admin | ai-settings, pentest-round4 |
| PUT `/api/ai/settings` | routes-ai.js | admin | ai-settings, pentest-round4 |
| POST `/api/ai/test` | routes-ai.js | admin | ai-settings |
| GET `/api/ai/drafts` | routes-ai.js | admin, qa | ai-settings, pentest-round4 |
| POST `/api/ai/drafts` | routes-ai.js | admin, qa | ai-settings, pentest-round4 |
| POST `/api/ai/drafts/:id/approve` | routes-ai.js | admin, qa | ai-settings, pentest-round4 |
| POST `/api/ai/drafts/:id/reject` | routes-ai.js | admin, qa | ai-settings, pentest-round4 |
| GET `/api/ai/lead` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4, reliability |
| POST `/api/ai/lead/summary` | routes-ai.js | admin, qa, lead | ai-settings |
| POST `/api/ai/lead/plan` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4 |
| POST `/api/ai/lead/plan/:id/approve` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4 |
| POST `/api/ai/lead/plan/:id/reject` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4 |
| GET `/api/ai/analyst` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4, reliability |
| POST `/api/ai/analyst` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4, reliability |
| DELETE `/api/ai/analyst/:id` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4, reliability |
| GET `/api/ai/roleplay` | routes-ai.js | signed in | ai-settings, api-workflows, pentest-round4 |
| GET `/api/ai/scenarios` | routes-ai.js | admin, trainer | api-workflows |
| POST `/api/ai/scenarios` | routes-ai.js | admin, trainer | api-workflows |
| PUT `/api/ai/scenarios/:id` | routes-ai.js | admin, trainer | api-workflows |
| DELETE `/api/ai/scenarios/:id` | routes-ai.js | admin, trainer | api-workflows |
| POST `/api/ai/roleplay/turn` | routes-ai.js | signed in | ai-settings, pentest-round4 |
| POST `/api/ai/roleplay/finish` | routes-ai.js | signed in | ai-settings, pentest-round4 |
| GET `/api/ai/trainer` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4, reliability |
| POST `/api/ai/trainer/quiz` | routes-ai.js | admin, qa, lead, trainer | ai-settings, pentest-round4 |
| GET `/api/att/me` | routes-att.js | signed in | reliability |
| POST `/api/att/punch` | routes-att.js | signed in | attendance, e2e |
| GET `/api/att/day` | routes-att.js | admin, qa, lead, trainer | attendance, pentest-round4b |
| GET `/api/att/month` | routes-att.js | admin, qa, lead, trainer | attendance, pentest-round4b, reliability |
| PUT `/api/att/rec` | routes-att.js | admin, lead | attendance, pentest-round4b |
| POST `/api/att/fix` | routes-att.js | signed in | attendance, pentest-round4b |
| POST `/api/att/fix/:id/decide` | routes-att.js | admin, qa, lead, trainer | attendance, pentest-round4b |
| GET `/api/leave` | routes-att.js | signed in | attendance, capacity, pentest-round4b, reliability, e2e |
| POST `/api/leave/preview` | routes-att.js | signed in | attendance |
| POST `/api/leave` | routes-att.js | signed in | attendance, capacity, pentest-round4b, reliability, e2e |
| POST `/api/leave/:id/decide` | routes-att.js | admin, qa, lead, trainer | attendance, capacity, pentest-round4b, reliability, e2e |
| POST `/api/leave/:id/cancel` | routes-att.js | signed in | attendance, capacity, pentest-round4b, reliability |
| POST `/api/leave/adjust` | routes-att.js | admin | attendance |
| PUT `/api/leave/deputy` | routes-att.js | admin, qa, lead, trainer | attendance |
| GET `/api/leave/team` | routes-att.js | admin, qa, lead, trainer | pentest-round4b, reliability |
| GET `/api/leave/calendar` | routes-att.js | signed in | attendance, pentest-round4b, reliability |
| GET `/api/autoqa` | routes-autoqa.js | signed in | api-workflows, security |
| POST `/api/autoqa/conversations` | routes-autoqa.js | admin, qa | api-workflows, security |
| POST `/api/autoqa/run` | routes-autoqa.js | admin, qa | — (role matrix only) |
| PUT `/api/autoqa/conversations/:id/edit` | routes-autoqa.js | admin, qa | api-workflows, security |
| PUT `/api/autoqa/conversations/:id/link` | routes-autoqa.js | admin, qa | api-workflows, security |
| DELETE `/api/autoqa/conversations/:id` | routes-autoqa.js | admin, qa | api-workflows, security |
| GET `/api/cap` | routes-cap.js | signed in | capacity, pentest-round4b, reliability |
| POST `/api/cap/plans` | routes-cap.js | admin, lead | capacity, pentest-round4b |
| PUT `/api/cap/plans/:id` | routes-cap.js | admin, lead | capacity, pentest-round4b |
| POST `/api/cap/plans/:id/publish` | routes-cap.js | admin, lead | capacity, pentest-round4b |
| DELETE `/api/cap/plans/:id` | routes-cap.js | admin, lead | capacity, pentest-round4b |
| GET `/api/kb` | routes-learning.js | signed in | api-workflows, pentest-round4b, security, workflows-more |
| POST `/api/kb/folders` | routes-learning.js | admin, qa, lead, trainer | workflows-more |
| PUT `/api/kb/folders/:id` | routes-learning.js | admin, qa, lead, trainer | workflows-more |
| DELETE `/api/kb/folders/:id` | routes-learning.js | admin, qa, lead, trainer | workflows-more |
| POST `/api/kb/articles` | routes-learning.js | admin, qa, lead, trainer | workflows-more |
| PUT `/api/kb/articles/:id` | routes-learning.js | admin, qa, lead, trainer | workflows-more |
| DELETE `/api/kb/articles/:id` | routes-learning.js | admin, qa, lead, trainer | workflows-more |
| POST `/api/kb/read` | routes-learning.js | signed in | workflows-more |
| POST `/api/kb/read-folder` | routes-learning.js | signed in | — (role matrix only) |
| POST `/api/kb/articles/:id/test` | routes-learning.js | signed in | workflows-more |
| GET `/api/quizzes` | routes-learning.js | signed in | ai-settings, workflows-more |
| POST `/api/quizzes` | routes-learning.js | admin, qa, lead, trainer | ai-settings, workflows-more |
| PUT `/api/quizzes/:id` | routes-learning.js | admin, qa, lead, trainer | ai-settings, workflows-more |
| DELETE `/api/quizzes/:id` | routes-learning.js | admin, qa, lead, trainer | ai-settings, workflows-more |
| POST `/api/quizzes/:id/attempt` | routes-learning.js | signed in | ai-settings, workflows-more |
| GET `/api/kb/progress` | routes-learning.js | admin, qa, lead, trainer | security |
| POST `/api/kb/newsletters` | routes-learning.js | admin, qa, lead, trainer | — (role matrix only) |
| PUT `/api/kb/newsletters/:id` | routes-learning.js | admin, qa, lead, trainer | — (role matrix only) |
| DELETE `/api/kb/newsletters/:id` | routes-learning.js | admin, qa, lead, trainer | — (role matrix only) |
| GET `/api/ai/status` | routes-learning.js | signed in | — (role matrix only) |
| POST `/api/kb/import` | routes-learning.js | admin, qa, lead, trainer | api-workflows, pentest-round4b, security |
| POST `/api/kb/import/save` | routes-learning.js | admin, qa, lead, trainer | — (role matrix only) |
| POST `/api/ai/quiz` | routes-learning.js | admin, qa, lead, trainer | — (role matrix only) |
| GET `/api/kb/articles/:id/export` | routes-learning.js | signed in | workflows-more |
| GET `/api/kb/folders/:id/export` | routes-learning.js | signed in | workflows-more |
| GET `/api/c/:col` | routes-more.js | signed in | api-workflows, pentest-round4b, reliability, security |
| POST `/api/c/:col` | routes-more.js | signed in | api-workflows, pentest-round4b, reliability, security |
| PUT `/api/c/:col/:id` | routes-more.js | signed in | api-workflows, pentest-round4b, reliability, security |
| DELETE `/api/c/:col/:id` | routes-more.js | signed in | api-workflows, pentest-round4b, reliability, security |
| PUT `/api/settings/x/:key` | routes-more.js | signed in (per key) | pentest-round4b, security |
| GET `/api/exports` | routes-more.js | admin, qa, lead, trainer | api-workflows |
| GET `/api/exports/:id` | routes-more.js | admin, qa, lead, trainer | api-workflows |
| DELETE `/api/exports/:id` | routes-more.js | admin, qa, lead, trainer | api-workflows |
| POST `/api/c/reports/:id/send` | routes-more.js | admin, qa, lead, trainer | security |
| GET `/api/backups` | routes-more.js | admin | api-workflows, security |
| POST `/api/backups` | routes-more.js | admin | api-workflows, security |
| GET `/api/backups/current/download` | routes-more.js | admin | api-workflows |
| GET `/api/backups/:f` | routes-more.js | admin | api-workflows, security |
| DELETE `/api/backups/:f` | routes-more.js | admin | api-workflows, security |
| POST `/api/backups/upload/restore` | routes-more.js | admin | api-workflows, security |
| POST `/api/backups/:f/restore` | routes-more.js | admin | api-workflows, security |
| POST `/api/seed/refresh` | routes-more.js | admin (not on a copy, not in production) | pentest-round4b |
| PUT `/api/org` | routes-org.js | admin | api-workflows, pentest-round4, pentest-round4b, reliability |
| POST `/api/org/purge` | routes-org.js | admin | api-workflows |
| GET `/api/org/person/:u` | routes-org.js | admin | api-workflows, pentest-round4b, reliability |
| GET `/api/qi/knowledge` | routes-org.js | admin, qa, lead, trainer | pentest-round4 |
| POST `/api/qi/knowledge` | routes-org.js | admin, qa, trainer | pentest-round4 |
| DELETE `/api/qi/knowledge/:id` | routes-org.js | admin, qa, trainer | pentest-round4 |
| POST `/api/qi/agent` | routes-org.js | admin, qa, lead, trainer | pentest-round4 |
| GET `/api/qi/topics` | routes-org.js | admin, qa, lead, trainer | pentest-round4 |
| POST `/api/qi/insights` | routes-org.js | admin, qa, lead, trainer | pentest-round4 |
| GET `/api/qi/insights` | routes-org.js | admin, qa, lead, trainer | pentest-round4 |
| GET `/api/skills` | routes-setup.js | signed in | pentest-round4b |
| POST `/api/skills` | routes-setup.js | admin | pentest-round4b |
| PUT `/api/skills` | routes-setup.js | admin | pentest-round4b |
| DELETE `/api/skills` | routes-setup.js | admin | pentest-round4b |
| GET `/api/workspaces` | routes-setup.js | signed in | — (role matrix only) |
| POST `/api/workspaces` | routes-setup.js | admin | — (role matrix only) |
| PUT `/api/workspaces/:id` | routes-setup.js | admin | — (role matrix only) |
| DELETE `/api/workspaces/:id` | routes-setup.js | admin | — (role matrix only) |
| GET `/api/root-causes` | routes-setup.js | signed in | — (role matrix only) |
| POST `/api/root-causes` | routes-setup.js | admin, qa | — (role matrix only) |
| PUT `/api/root-causes/:id` | routes-setup.js | admin, qa | — (role matrix only) |
| DELETE `/api/root-causes/:id` | routes-setup.js | admin, qa | — (role matrix only) |
| GET `/api/categories` | routes-setup.js | signed in | workflows-more |
| POST `/api/categories` | routes-setup.js | admin | workflows-more |
| PUT `/api/categories/:id` | routes-setup.js | admin | workflows-more |
| DELETE `/api/categories/:id` | routes-setup.js | admin | workflows-more |
| GET `/api/auto-cats` | routes-setup.js | signed in | — (role matrix only) |
| POST `/api/auto-cats` | routes-setup.js | admin | — (role matrix only) |
| PUT `/api/auto-cats/:id` | routes-setup.js | admin | — (role matrix only) |
| DELETE `/api/auto-cats/:id` | routes-setup.js | admin | — (role matrix only) |
| GET `/api/wf/today` | routes-today.js | admin, qa, lead, trainer | pentest-round4b, reliability, today |
| POST `/api/wf/brief` | routes-today.js | admin, qa, lead, trainer | ai-settings, pentest-round4, today |
| GET `/api/att/report` | routes-today.js | admin, qa, lead, trainer | reliability, today |
| PUT `/api/wf/settings` | routes-wf.js | admin | pentest-round4b, today, workforce |
| POST `/api/wf/holidays` | routes-wf.js | admin | workforce |
| GET `/api/wf/rota` | routes-wf.js | signed in | attendance, workforce |
| PUT `/api/wf/rota` | routes-wf.js | admin, lead | attendance, workforce |
| POST `/api/wf/rota/copy` | routes-wf.js | admin, lead | workforce |
| POST `/api/wf/assign` | routes-wf.js | admin, lead | workforce |
| GET `/api/tasks` | routes-work.js | signed in | api-workflows, api, reliability, security, workflows-more |
| POST `/api/tasks` | routes-work.js | admin, qa, lead, trainer | api-workflows, api, reliability, security, workflows-more |
| PUT `/api/tasks/:id` | routes-work.js | signed in | api-workflows, api, reliability, security, workflows-more |
| DELETE `/api/tasks/:id` | routes-work.js | admin, qa, lead, trainer | api-workflows, api, reliability, security, workflows-more |
| GET `/api/task-templates` | routes-work.js | admin, qa, lead, trainer | workflows-more |
| POST `/api/task-templates` | routes-work.js | admin, qa, lead, trainer | workflows-more |
| PUT `/api/task-templates/:id` | routes-work.js | admin, qa, lead, trainer | workflows-more |
| DELETE `/api/task-templates/:id` | routes-work.js | admin, qa, lead, trainer | workflows-more |
| GET `/api/task-seqs` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| POST `/api/task-seqs` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| PUT `/api/task-seqs/:id` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| DELETE `/api/task-seqs/:id` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| POST `/api/task-seqs/:id/give` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| PUT `/api/task-runs/:id` | routes-work.js | admin, qa, lead, trainer | — (role matrix only) |
| GET `/api/sessions` | routes-work.js | signed in | ai-settings, api-workflows, reliability, security, workflows-more |
| POST `/api/sessions` | routes-work.js | admin, qa, lead, trainer | ai-settings, api-workflows, reliability, security, workflows-more |
| POST `/api/sessions/:id/sign` | routes-work.js | signed in | ai-settings, api-workflows, reliability, security, workflows-more |
| PUT `/api/sessions/:id` | routes-work.js | admin, qa, lead, trainer | ai-settings, api-workflows, reliability, security, workflows-more |
| DELETE `/api/sessions/:id` | routes-work.js | admin, qa, lead, trainer | ai-settings, api-workflows, reliability, security, workflows-more |
| GET `/api/o2o-templates` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| POST `/api/o2o-templates` | routes-work.js | admin, lead, qa | api-workflows |
| PUT `/api/o2o-templates/:id` | routes-work.js | admin, lead, qa | api-workflows |
| DELETE `/api/o2o-templates/:id` | routes-work.js | admin, lead, qa | api-workflows |
| PUT `/api/o2o-target` | routes-work.js | admin | api-workflows |
| GET `/api/qflags` | routes-work.js | signed in | api-workflows, security |
| POST `/api/qflags` | routes-work.js | admin, qa, lead, trainer | api-workflows, security |
| PUT `/api/qflags/:id` | routes-work.js | admin, qa, lead, trainer | api-workflows, security |
| DELETE `/api/qflags/:id` | routes-work.js | admin, qa, lead, trainer | api-workflows, security |
| GET `/api/simulations` | routes-work.js | signed in | ai-settings, pentest-round4, security |
| POST `/api/simulations` | routes-work.js | signed in | ai-settings, pentest-round4, security |
| GET `/api/calibrations` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| POST `/api/calibrations` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| PUT `/api/calibrations/:id` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| DELETE `/api/calibrations/:id` | routes-work.js | admin, qa, lead, trainer | api-workflows |
| POST `/api/demo/reset` | server.js | admin (not in production) | pentest-round4b |
| POST `/api/login` | server.js | public | every server test, e2e |
| POST `/api/logout` | server.js | public | e2e (signing out) |
| GET `/api/me` | server.js | signed in | api-workflows, api, pentest-round4, pentest-round4b, reliability, e2e |
| PUT `/api/profile` | server.js | signed in | pentest-round4b, workforce |
| POST `/api/password` | server.js | signed in | api-workflows, security, workflows-more |
| POST `/api/password/first` | server.js | signed in | api-workflows, workflows-more |
| PUT `/api/prefs` | server.js | signed in | api, pentest-round4b, security, workflows-more |
| POST `/api/register` | server.js | public | workflows-more |
| GET `/api/registrations` | server.js | admin | workflows-more |
| POST `/api/registrations/:id/approve` | server.js | admin | workflows-more |
| POST `/api/registrations/:id/decline` | server.js | admin | workflows-more |
| GET `/api/roster` | server.js | signed in | reliability, workforce |
| GET `/api/teams` | server.js | signed in | workflows-more |
| POST `/api/teams` | server.js | admin | workflows-more |
| PUT `/api/teams/:id` | server.js | admin | workflows-more |
| DELETE `/api/teams/:id` | server.js | admin | workflows-more |
| GET `/api/users` | server.js | admin | pentest-round4b |
| POST `/api/users` | server.js | admin | pentest-round4b |
| PUT `/api/users/:username` | server.js | admin | api-workflows, pentest-round4b, workflows-more |
| DELETE `/api/users/:username` | server.js | admin | reliability, workflows-more |
| POST `/api/users/:username/reset` | server.js | admin | api-workflows, pentest-round4b |
| PUT `/api/layout` | server.js | signed in | security, workflows-more |
| PUT `/api/layouts/:role` | server.js | admin | pentest-round4b, security |
| PUT `/api/views` | server.js | signed in | security |
| PUT `/api/shared-views` | server.js | admin, qa | security |
| GET `/api/health` | server.js | public | reliability |
| GET `/api/notice` | server.js | public | api-workflows, pentest-round4b |
| GET `/api/settings` | server.js | signed in | api-workflows, pentest-round4, pentest-round4b, reliability |
| PUT `/api/settings` | server.js | admin | — (role matrix only) |
| GET `/api/notifications` | server.js | signed in | ai-settings, capacity, security, workflows-more |
| POST `/api/notifications/read` | server.js | signed in | — (role matrix only) |
| DELETE `/api/notifications/:id` | server.js | signed in | ai-settings, capacity, security, workflows-more |
| POST `/api/notifications/sample` | server.js | signed in | security |
| GET `/api/evaluations` | server.js | signed in | api-workflows, api, pentest-round4b, reliability, e2e |
| POST `/api/evaluations` | server.js | admin, qa | api-workflows, api, workflows-more, e2e |
| PUT `/api/evaluations/:rid` | server.js | admin, qa | api, workflows-more |
| DELETE `/api/evaluations/:rid` | server.js | admin, qa | api |
| POST `/api/evaluations/:rid/seen` | server.js | agent | — (address shared with the reviews list; not called directly in round 4) |
| POST `/api/evaluations/:rid/remind` | server.js | admin, qa | api |
| POST `/api/evaluations/:rid/dispute` | server.js | agent | api, e2e |
| POST `/api/evaluations/:rid/dispute/msg` | server.js | signed in | api, workflows-more |
| POST `/api/evaluations/:rid/dispute/resolve` | server.js | admin, qa | api, e2e |
| GET `/api/scorecards` | server.js | signed in | pentest-round4, e2e |
| POST `/api/scorecards` | server.js | admin | workflows-more |
| PUT `/api/scorecards/:id` | server.js | admin | workflows-more |
| DELETE `/api/scorecards/:id` | server.js | admin | workflows-more |
| POST `/api/export/call-reviews` | server.js | signed in | api-workflows, pentest-round4b, security, e2e |
| POST `/api/forgot` | server.js | public | pentest-round4b, security |
| POST `/api/reset` | server.js | public | security |
| POST `/api/evaluations/:rid/recording` | server.js | admin, qa | security, pentest-round4b |
| DELETE `/api/evaluations/:rid/recording` | server.js | admin, qa | security |
| GET `/api/recordings/:file` | server.js | signed in | api-workflows, pentest-round4b |

(The rows of `server.js` were checked by hand where the address is shared, so they are more precise than the automatic count. The rows of the route files come from the automatic count.)
