# Q-SMART – Security audit

Audit dates: 2026-10-24 (round 1 and round 2, maximum depth) · Branch: `q-smart-full-audit` · Base commit `a1da4aa`

> **This is not a professional penetration test.** It is a code review plus targeted tests run against a local copy of the app
> with made-up data. Before any commercial launch, an independent penetration test is strongly recommended, especially because
> the app holds employee performance data and links to customer call recordings.

## Scope and method

- **In scope:** every server route (`server.js`, `routes-*.js`, `audit.js`, `ai.js`, `autoqa.js`, `adduser.js`) and the whole front end (`public/js`).
- **Front-end checks in round 2:**
  - Every inline event handler that puts a value into JavaScript: 145 handlers using 61 different values, each classified by hand.
  - Every `innerHTML`, `document.write`, `window.open` and `new Function` call.
  - Everything read from the page address (the URL query and the `#page` part).
  - The translation layer.
  - A scripted scan for typed text placed into the page without escaping (99 hits, each checked by hand).
- **Environment:** local only.
  - Automated tests start the server on a random port with a temporary data file of invented people.
  - Browser tests used a throw-away copy of the data on port 3199, with separate recordings, backups and audit-log folders.
  - The real `data.json` was only read (to make that copy). It was never changed.
- **References:** OWASP Top 10 (2021) and OWASP ASVS 4.0 levels 1–2, used as checklists.
- **Tools that were really run:**
  - `node:test`: `test/security.test.js` with 36 tests, `test/workflows-more.test.js` with 14 tests, and the existing suites
  - `npm audit`
  - a lockfile and install-script review
  - `node --check` on all 51 JavaScript files
  - a regex secret scan over all 25 Git revisions
  - timing probes for slow regular expressions (ReDoS)
  - scripted browser checks in the Claude desktop app's browser pane
- **Tools not available:**
  - OWASP ZAP and other dynamic scanners (not installed)
  - ESLint and other static analysers (not configured)
  - the `gh` CLI (so the GitHub repository's visibility could not be checked)

## Permission matrix (as enforced by the server after this audit)

"ws" means only the records of people in the user's own workspaces. Admins always see everything. A dash means refused.

| Resource / action | admin | qa | lead | trainer | agent |
|---|---|---|---|---|---|
| Read reviews | all | ws | ws | ws | own |
| Create / change / delete review, upload / delete recording, remind | ✓ | ws | – | – | – |
| Open a dispute | – | – | – | – | own review |
| Write in a dispute | ✓ | ws | – | – | own |
| Resolve a dispute | ✓ | ws | – | – | – |
| Play a recording | if the review is visible | same | same | same | own |
| Read scorecards | all | ws | ws | ws | ws |
| Change scorecards, categories, Auto QA categories | ✓ | – | – | – | – |
| Root causes | ✓ | ✓ | – | – | – |
| Users, teams, workspaces, skills, registrations, backups, audit log, system settings, reset data, default layouts per role | ✓ | – | – | – | – |
| Shared dashboard views | ✓ | ✓ | – | – | – |
| Review planner setting | ✓ | ✓ | – | – | – |
| Read settings | ✓ (all) | without e-mail templates and notification rules | same | same | same |
| Quick flags: read | all | ws | ws | ws | own |
| Quick flags: write | ✓ | ws | ws | ws | – |
| Tasks: read | all | ws | ws | ws | own |
| Tasks: create, assign, edit, delete | ✓ | ws | ws | ws | – |
| Tasks: tick checklist, change status, pin | ✓ | ws | ws | ws | own |
| Coaching sessions: read | all | ws | ws | ws | own |
| One-to-ones: write (agents of the workspace only) | ✓ | ws | ws | – | – |
| Coaching, group, training: write (agents of the workspace only) | ✓ | ws | – | ws | – |
| Sign a session | – | – | – | – | own |
| Calibrations | ✓ | participants | participants | participants | – |
| Simulations: read | all | ws | ws | ws | own |
| Simulations: save | for anyone | ws | ws | ws | own |
| Knowledge base, quizzes, newsletter: read | ✓ | ✓ | ✓ | ✓ | ✓ (answers hidden) |
| Knowledge base, quizzes, newsletter: write | ✓ | ✓ | ✓ | ✓ | – |
| Learning progress | all | ws | ws | ws | – |
| Reports (saved): read | all | own + shared | own + shared | own + shared | – |
| Reports: change, send now | ✓ | own | own | own | – |
| Goals: read | ✓ | ✓ | ✓ | ✓ | own / own team |
| Goals: write | ✓ | ✓ | ✓ | – | – |
| Improvement plans: read | ✓ | ✓ | ✓ | ✓ | own |
| Improvement plans: write | ✓ | ✓ | ✓ | ✓ | acknowledge + note on own |
| Recognition | ✓ | ✓ | ✓ | ✓ | ✓ (change own, one at a time) |
| Risks, complaints | ✓ | ✓ | ✓ | ✓ | – |
| Surveys (CSAT): read | ✓ | ✓ | ✓ | ✓ | own |
| Surveys (CSAT): write, list import | ✓ | ✓ | ✓ | – | – |
| Export centre (kept copies) | all | own | own | own | – (no copy is kept) |
| Make an Excel file | ✓ | ✓ | ✓ | ✓ | ✓ (only from data they send) |
| Auto QA: read | all | ws | ws | ws | own |
| Auto QA: write | ✓ | ws | – | – | – |
| AI import, AI quiz | ✓ | ✓ | ✓ | ✓ | – |

Hiding pages in *Admin > Roles & permissions* only changes the menu, and the page itself says so. All the rules above are checked on the server.

## Confirmed vulnerabilities – fixed

Severity is for the current single-organisation use. Every fix has a regression test in `test/security.test.js`, except S-23, which was checked by code review only. Each test failed before its fix and passes after it.

### Round 1

| ID | Severity | Problem | Evidence (before the fix) | Fix |
|---|---|---|---|---|
| S-1 | **High** | **Workspace isolation gaps.** Staff of workspace A could read, and in places change, the records of workspace B: quick flags, tasks, coaching sessions, simulations, learning progress, Auto QA conversations, and deleting a review's call recording. | A QA user of workspace A deleted the recording of a workspace-B review (status 200, not 404). A lead of A saw B's flags, tasks, sessions and simulations. | The same workspace rule (`seesUser`) as the rest of the app. |
| S-2 | **High** | **Scheduled reports leaked data across workspaces.** Any staff member could send any saved report, including private ones. The e-mail was built from *all* data and goes to addresses typed in by the owner. | A lead of B sent A's private report (200). A report owned by a workspace-A lead counted the reviews of both workspaces. | Owner or admin only. The data is limited to the owner's workspace. Reports of people who left are no longer sent. |
| S-3 | **Medium** | **HTML injection in report e-mails and the "Print / PDF" window** (stored XSS on the app's own address). | `<img onerror>` in a campaign name came out as a live tag. | `toHtml` escapes every value. |
| S-4 | **Medium** | **Spreadsheet injection:** objects sent to the Excel export became live formulas or `javascript:` links. | The sheet XML contained `<f>` cells. | Only plain text, numbers and yes/no become cells. |
| S-5 | **Medium** | **Password guessing:** only a per-address limit, and the address could be faked with `X-Forwarded-For` by any client. | 11 wrong passwords in a row for one account never got "too many attempts". | The header is trusted only from this computer (the tunnel); configurable with `TRUST_PROXY`. At most 10 wrong passwords per account per 15 minutes. **Round 2 added a test that really connects from the network address of this computer:** the 31st attempt is stopped, whatever address it claims. |
| S-6 | Low | Sign-ins never expired while the browser stayed open. | No cookie expiry. | Signed out after 12 hours without use. |
| S-7 | Low | 25 MB requests accepted before sign-in. | A 300 KB body was parsed. | 100 KB before sign-in. |
| S-8 | Low | One person could flood everybody's notifications (the "example notifications" button). | 4 calls in a row accepted. | At most 3 per hour. |
| S-9 | Low (extra protection) | CSRF relied on `SameSite=Lax` cookies only. | A change marked `cross-site` was accepted. | Refused (extended in round 2, S-19). |
| S-10 | Low | Unknown record types reached in-memory objects. | `/api/c/evaluations/…` reached the permission check. | "Not found" straight away. |
| S-11 | Low | AI calls had no time limit and no usage limit. | Code review. | 3-minute timeout, 30 AI requests per person per hour. Not tested with a live key. |
| S-12 | High (library) | `body-parser` 2.3.0: denial of service with compressed bodies. | `npm audit` | 2.4.0. |

### Round 2 (maximum depth)

| ID | Severity | Problem | Evidence (before the fix) | Fix |
|---|---|---|---|---|
| S-13 | **High** | **Stored XSS through shared dashboard views: a QA user could run code in an admin's session** (privilege escalation). Saved-view ids and widget keys were placed raw into `onclick="…"` and `data-wk="…"`. The server accepted any 20–40 characters for them. QA users may share views, and admins see every shared view. Team names were also shown unescaped in the widget filter label. | In the browser, with the old `widgets.js` and a hostile view in the data, 3 traps fired: the view id (click on the view tab), the widget key (**just moving the mouse over the widget**), and the team name (as soon as the dashboard drew it). With the fixed file and the same data, none fired. Through the API, a QA user saved the view id `');alert(1)//` unchanged. | The server keeps only letters, numbers, `-` and `_` in view ids, widget keys, widget kinds and filter ids. The page escapes them anyway (`jsq`/`esc`), so old stored data is safe too. Team names in the filter label are escaped. |
| S-14 | **Medium** | **Sign-ins survived password changes.** After changing your password, a session someone else had stolen went on working. After an admin reset, or a reset by e-mail link, every open session stayed. **After an admin reset, the open session could even choose the new password itself**, without knowing any password. That defeats a reset made because an account was taken over. | The other session still got 200 after the change, and after the reset by link. The existing test even documented that the open session sets the new password. | A password version on each account. Changing your own password ends your *other* sign-ins (the current one stays). A reset by link, an admin reset or `adduser.js` ends *all* of them. The forced "choose a new password" step now comes at the next sign-in. The existing test was changed to this stricter behaviour (see FUNCTIONAL_AUDIT.md). |
| S-15 | **Medium** | **Denial of service with a crafted knowledge-base article (ReDoS).** The Markdown link pattern did work that grows with the square of the length on text with many `[`. Any signed-in user can ask for the ZIP export of an article, which runs it on the server. | `md("[".repeat(200000))` blocked for **17.5 seconds** per call. Every viewer's browser froze the same way. | Link text cannot contain `[`; the same input now takes **1 ms**. |
| S-16 | **Medium** | **Denial of service with a crafted HTML import (ReDoS).** Staff only. | About 300 KB of `<h1<h1…<script<script…` blocked the server for **14 seconds** (a larger file: minutes). | Scripts and styles are removed by a single scan, and the tag patterns cannot run past the next `<`: **23 ms**. Normal HTML still splits at its headings (tested). |
| S-17 | Medium (admin only) | **Prototype pollution.** A default layout saved with the page name `__proto__` added a property to *every object in the server* until restart. Admin only today; in a future multi-company version, one company's admin could break the service for all. | After one request, unrelated actions such as `/api/c/admin` and `/api/skills` answered **500** for everybody, agents included (`TypeError … reading 'includes'`). | Page names must be simple words, and never names every object already has (`__proto__`, `constructor`…). At most 20 pages per person. |
| S-18 | **Medium** | **Agents could fill up the data file**, which every request reads, and so slow down or stop the app for everybody. Three ways: Excel export copies of any size (up to 25 MB per request) were kept inside `data.json`; recognition (kudos) accepted 3 MB "bulk" lists; and personal layouts accepted endless page names. | An agent's export copy was stored. A 2.4 MB staff export copy was stored. An agent's kudos "bulk" import was accepted. 2.5 MB requests from agents were accepted. | Copies are kept for staff only (agents cannot open the Export centre) and never above 2 MB. "Bulk" works for CSAT surveys only. Agents may send 2 MB per request (staff 25 MB). At most 20 layout or view pages. |
| S-19 | Low | **CSRF from a neighbouring site of the same domain.** Only "cross-site" was refused. Quick tunnels such as `*.trycloudflare.com` can be "same-site" with each other. | A change marked `same-site` was accepted. | Only `same-origin` (and `none` = typed in by the person) may change data. |
| S-20 | Low | The current password could be guessed through "Change password" (no limit). | 11 wrong attempts all answered 400. | At most 10 wrong attempts per 15 minutes. |
| S-21 | Low | "Forgot password" could flood one person's mailbox from many addresses. | 4 requests = 4 e-mails. | At most 3 e-mails per account per hour. The answer stays the same, so this reveals nothing. |
| S-22 | Low | API answers could be kept in the browser cache (shared computers). | No `Cache-Control`. | `Cache-Control: no-store` on every `/api/` answer. |
| S-23 | Low | A wrong username was answered faster than a wrong password, which can reveal which accounts exist. | Code review: no password check was done for unknown accounts. | A dummy password check for unknown accounts. *Code review only; timing tests are unreliable.* |
| S-24 | Low (admin only) | **Path traversal in recording file names.** A review id taken from a restored backup was used in the file name. | With the review id `..\escaped`, the file was written outside the recordings folder. | Only letters, numbers, `-` and `_` from the id are used. |
| S-25 | Low | Staff could create tasks, coaching sessions and simulator results for agents of another workspace, or move a task to them (this sends them notifications). | 200 for all four. | Refused (400) unless the agent is in the person's workspace. |
| S-26 | Low | E-mail templates and notification rules (admin settings) were sent to every role. | An agent's `/api/settings` contained `mailtpl`. | Only admins receive them. |
| S-27 | Low (browser only) | On Bulgarian and French screens, a long crafted text (for example staff notes) was matched against all 245 translation patterns. | A crafted text cost **76–141 ms** per text on screen. | Texts over 1,000 characters are never pattern-matched (the longest real pattern label is under 400): under 40 ms. |

## Checked and found sound (with the test or evidence)

- **Agents and QA cannot reach admin functions.** In the browser:
  - As an agent: 12 privileged API calls were refused, plus the Export centre, shared views and bulk import. The agent received only their own reviews.
  - As QA: 12 admin calls were refused (403), and the one setting QA may change (Review planner) worked.
- **No stored XSS found on any page**, two rounds of trap texts.
  - **Round 1:** about 40 fields.
  - **Round 2:** about 30 more, including team, scorecard, category, item, workspace, skill, folder, Auto QA category, task template and registration names, and lead IDs with `'`, `\` and line breaks. Many used attribute-breaking variants (`" onmouseover=…`).
  - **Admin walk:** 48 pages, 122 pop-ups, about 69,500 elements hovered or focused.
  - **QA walk:** 36 pages, 91 pop-ups. **Lead walk:** 32 pages, 87 pop-ups. **Agent walk:** 17 pages, 23 pop-ups.
  - No trap ran, there were no page errors, and the texts appeared as plain text.
- **Inline handlers (round 2):** all 145 handlers that put a value inside JavaScript quotes were classified. Besides S-13, all use server-made ids, usernames (`[a-z0-9._-]`) or fixed values, or the safe `jsq()` helper. Three spots in Quick flags and Compliance could break on a backslash or line break (a broken button, not code execution, traced by hand). They now use `jsq()`.
- **Address-based input:** the password-reset page never displays the URL's username or token, and clears them after use. The `#page` part only selects a page; `#constructor`, `#__proto__` and `#toString` now show the dashboard. There are no `postMessage` listeners. The only `new Function` (the Ctrl+K quick jump) no longer builds code from typed text.
- **Shared helpers:** pop-up forms, confirmation dialogs, toasts (`textContent`), the translation layer (`nodeValue` / `setAttribute`), the Markdown renderer and the agent print report all escape. The report print window was fixed in round 1 (S-3).
- **Passwords:** bcrypt (cost 10), never logged. The audit log never stores passwords.
- **Session:** new id at every sign-in. `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, 12-hour idle expiry, and ended when the password changes (S-14).
- **Password reset:** 256-bit random token, stored only as a SHA-256 hash, valid 1 hour, compared in constant time, single use (tested).
- **Injection:** no SQL, no shell command built from input, `__proto__`-style keys dropped from stored records, strict preference ids, safe page names (S-17).
- **Error messages** never include file paths or stack traces.
- **Headers:** `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`, `Cache-Control: no-store` on the API, no `X-Powered-By`.
- **Secrets in Git:** no API keys or private keys in any of the 25 revisions. `data.json`, `audit.json`, `.env`, recordings and backups were never committed.
- **Supply chain:** all 256 locked packages come from `registry.npmjs.org` with sha512 integrity hashes, and none has an install script.

## Open findings (not fixed in this audit)

Details, impact and next steps are in REMAINING_ISSUES.md.

| ID | Severity | Summary |
|---|---|---|
| R-1 | **High – launch blocker** | No separation between customer organisations (multi-tenancy). |
| R-2 | **High – launch blocker** | Every new, approved or reset account starts with the password `password`, and it is e-mailed. Usernames are predictable, so an account can be taken over before its owner signs in. |
| R-3 / R-4 | **High – launch blocker** | The JSON file database and the in-memory sessions are not safe for several processes or production load. Measured: about 1.7 s per saved change at one year of data. |
| R-5 | **Medium** | `seed.js` in Git contains the full data, including the password hashes of 2 accounts with real passwords and a registration with a real-looking personal e-mail. The repository's visibility could not be checked. |
| R-6 | Medium | Workspace rules not applied to goals, plans, recognition, risks, complaints, surveys, calibrations, knowledge base and task templates. |
| R-7 | Medium | No Content-Security-Policy (inline handlers everywhere), no HSTS. |
| R-8 | Medium | Weak password rules, no two-factor sign-in. |
| R-17 | Low | The per-account sign-in limit lets someone who knows a username lock that account for 15 minutes. |
| R-22 | Low | `exceljs` (the Excel library) looks unmaintained and brings 6 deprecated packages. |
| R-23 | Low | Scheduled reports go to any e-mail address the report owner types, including outside the company. |
| R-24 | Low | Google Fonts are loaded from Google (sends visitors' IP addresses to Google; a known GDPR concern in the EU). |

## Tests that were not performed, and why

- **Real e-mail (SMTP) and real AI calls:** no credentials were used. The fallbacks were exercised, and the AI limits and timeouts were reviewed in code.
- **OWASP ZAP or another dynamic scanner:** not installed. Recommended against a staging copy.
- **Load and stress tests:** not run. A bounded measurement with one request at a time is reported instead (SAAS_READINESS.md).
- **Cloudflare tunnel, TLS, hosting:** outside the repository.
- **Malicious Word or PDF files** (zip bombs, hostile PDFs sent to the AI): not tested. Staff only, 25 MB.
- **Login timing (S-23):** not measured. Timing tests are unreliable on a shared machine.

## Residual risk and recommendation

All confirmed problems found in the two rounds are fixed and covered by tests. The app is still **not ready** to be sold to independent companies until R-1 to R-4 are resolved. After that, an independent penetration test should be done before going live.

## Round 3 (26 October 2026)

- **S-28 · "Refresh seed.js" could overwrite the project's seed.js from a copy of the app (fixed).** The admin action always wrote `seed.js` in the app folder, even when the server ran on another data file (tests, a demo copy). The new every-route test triggered it and replaced seed.js with made-up users. seed.js was restored from git; data.json was never touched. The action now refuses unless the app runs on its own data.json, and the test checks both files are unchanged after every run.
- **Every route × every role:** 142 routes, 6 identities, empty and wrong-type bodies. No 500, no route that lets in a role it should refuse, nothing of a wrong type stored. AutoQA conversations and reviews are limited per person on the server (an agent sees only their own).
- New screens use `esc()` for every value they show and `jsq()` for every value inside `onclick`. Team colours are only accepted as `#rrggbb`.

## Round 4 (28 October 2026)

Branch `q-smart-v1-audit`, made from `q-smart-v1` at `3440283`. Same rule as before: **this is not a professional penetration test.**
It is a code review plus controlled attacks against a local copy with made-up people. An independent penetration test is still
needed before a commercial launch.

### Scope and method

- **In scope:** every server route (220, read from the code). The modules added since round 3 were read line by line:
  - Workforce: `routes-wf.js`, `routes-att.js`, `routes-today.js`, `wf.js`
  - Capacity: `routes-cap.js`, `cap.js`
  - AI: `routes-ai.js`, `ai.js`
  - Organization and Q-Intelligence: `routes-org.js`
- **Environment:** local only.
  - Tests start the app on a new temporary folder with the people of `test/fixture-round4.js`: two workspaces, every role, a deactivated person, a pending registration and a first-password person.
  - The browser copy ran on port 3200 on `%TEMP%\qsmart-round4-test`.
  - AI calls went to a fake AI on this computer (`test/fake-ai.js`). It can answer normally, slowly, with errors (401, 429, 500), with broken JSON, very long text or hostile text, and it records every prompt.
  - No real e-mail, no real AI, nothing against the tunnel or any outside system.
- **Checklists:** OWASP Top 10 (2021) and OWASP ASVS 4.0 level 2.
- **Tools really run:**
  - `node:test`. New: `pentest-round4.test.js` (11 tests), `pentest-round4b.test.js` (18), `reliability.test.js` (3) and the extended `role-matrix.test.js`.
  - ESLint 9.39.1 with a correctness config (`eslint.config.js`).
  - Playwright 1.56.1 with Chromium: 13 browser tests.
  - `npm audit`.
  - A secret scan over all 95 commits of every branch: an own script that reports the commit, the file and the kind of secret only.
- **Not available:**
  - OWASP ZAP is not installed. To try it: install ZAP from zaproxy.org, then run its "baseline scan" against `http://localhost:3200` while the throw-away copy is running.
  - gitleaks is not installed; the own scan above was used instead.
  - `eslint-plugin-security` was not added: it mostly reports style patterns. Ask if you want it.

### Permission matrix: the modules added since round 3 (as enforced by the server)

"ws" means only the people of the user's own workspaces. Staff always also see the Administration team, where all staff are.

| Resource / action | admin | qa | lead | trainer | agent |
|---|---|---|---|---|---|
| Workforce set-up (calendars, shifts, patterns, leave types, attendance rules), public holidays | ✓ | – | – | – | – |
| Rota: read | all | ws | ws | ws | own team (others' leave type hidden) |
| Rota: change, copy last week, assign shifts | ✓ | – | ws (not Administration) | – | – |
| Own attendance: check in / break / out, ask a correction | ✓ | ✓ | ✓ | ✓ | ✓ (own) |
| A team's day and month, Team today, morning brief, attendance report | all | ws | ws | ws | – |
| Correct a day directly | ✓ | – | ws | – | – |
| Decide a correction or time off | ✓ | the person's manager or team lead, or that person's deputy for the dates | same | same | – |
| Ask for time off | self | self | self, or for people they plan (approved at once) | self | self |
| Cancel time off | any day | the approver: any day | the approver: any day | the approver: any day | own: a pending request, or approved days still to come |
| Adjust balances | ✓ | – | – | – | – |
| Name a deputy | own | own | own | own | – |
| Team balances | all | ws | ws | ws | – |
| Team calendar | all | ws | ws | ws | own team (no leave types of others) |
| Capacity plans: read | all | ws (look only) | ws | ws (look only) | own leads |
| Capacity plans: create, change, publish, delete | ✓ | – | ws (every team of the plan) | – | – |
| AI settings, key, budget, test | ✓ | – | – | – | – |
| AI QA reviewer drafts | all | ws | – | – | – |
| AI team lead (agents at risk, plans), AI analyst, AI trainer | all | ws | ws | ws | – |
| AI weekly summary: write | all teams | ws | ws | – | – |
| AI analyst "all teams" report | ✓ | only if they see every team | same | same | – |
| AI Simulator scenarios: manage | ✓ | – | – | ✓ | – |
| AI Simulator: practise | ✓ | ✓ | ✓ | ✓ | ✓ (when switched on; own results) |
| Q-Intelligence: Ask Q agents, insights, topics | all | ws | ws | ws | – |
| Q-Intelligence knowledge files: read | ✓ | ✓ | ✓ | ✓ | – |
| Q-Intelligence knowledge files: add, delete | ✓ | ✓ | – | ✓ | – |
| Organization (company, data protection, purge, sign-in rules, business words), personal data download | ✓ | – | – | – | – |

### Confirmed vulnerabilities – fixed in round 4

Every fix has a regression test that passes after it. The tests of S-29, S-30, S-31 and S-37 were seen failing before their fixes. The other defects were confirmed by reading the code, and their tests were written with the fix.

| ID | Severity | Problem | Evidence (before the fix) | Fix and test |
|---|---|---|---|---|
| S-29 | **Medium** | **Q-Intelligence read the other workspace's data.** AI insights and topic counts used every survey comment and every AutoQA conversation of the organisation, and the saved insights were shown to all staff. | A QA user of workspace 2 asked for insights. The prompt sent to the (fake) AI contained workspace 1's survey comment and AutoQA conversation. Topics of workspace 2 counted workspace 1's conversation. Workspace 2 saw workspace 1's and the admin's saved insights. | Surveys and conversations are filtered like the reviews (`seesUser`). An insight keeps the teams it was made from and is shown only to people who see all of them. Test: `pentest-round4.test.js` › S-29 (3 tests). |
| S-30 | **Medium** | **The AI trainer quiz sent the other workspace's reviewer comments to the AI.** When no agents were chosen, the "missed items" of every review of the organisation went into the prompt. | The prompt of a workspace-2 trainer contained the reviewer comments of all workspace-1 agents. | Only the reviews of agents the trainer sees. Test: `pentest-round4.test.js` › S-30. |
| S-31 | Low | A request nested thousands of levels deep made the server answer 500 and print a stack trace. | `{"title":[[[[…20,000 levels…]]]]}` → 500, `RangeError: Maximum call stack size exceeded`. | Bodies nested more than 64 levels are refused with 400 before any route reads them. Test: `pentest-round4b.test.js` › odd input. |
| S-32 (R-25) | Low | A failed sign-in stored the typed username in the audit log, so a password typed into the wrong box ended up there. "Forgot password" printed the typed text in the server output. | Code review, then the test: the typed text was in `audit.json`. | The log keeps the account only when the typed name or e-mail belongs to one, otherwise "(unknown account)". The forgot message no longer prints the typed text. Test: `pentest-round4b.test.js` › R-25. |
| S-33 (R-15) | Low | A recording upload was trusted on its type or extension: a web page renamed `.mp3` was stored. | Code review. | The first bytes must be those of the audio format (ID3 / MPEG frame, RIFF…WAVE, ftyp, OggS, EBML). Test: `pentest-round4b.test.js` › R-15. |
| S-34 (R-13) | Low | Integration links accepted any text: `javascript:`, `http:`, attribute-breaking quotes. | Code review. | Only `https://` addresses without spaces, quotes or `<>`. Test: `pentest-round4b.test.js` › R-13. |
| S-35 | Low | **Spreadsheet injection through "Copy for Excel"** (every table): typed text such as `=HYPERLINK(…)` was pasted into Excel as a live formula. | Code review: the copied TSV and HTML kept the text as it was. | Texts starting with `=`, `+`, `-` or `@` are pasted as text: a leading `'` in the plain copy, the text format in the HTML copy. Real numbers such as `-5` stay numbers. Test: `pentest-round4b.test.js` › Copy for Excel. |
| S-36 (R-14) | Low (staff only) | A Word file was unpacked without a size limit (a "zip bomb"). | A 0.2 MB `.docx` that unpacks to 60 MB was accepted and unpacked. | The ZIP's table of contents is read first. More than 50 MB unpacked, or more than 2,000 parts, is refused before anything is unpacked. Test: `pentest-round4b.test.js` › R-14. |
| S-37 | Low | A broken AI answer (not JSON) was taken as an empty, successful answer. | In the fake AI's "broken JSON" mode, the Q-Intelligence agent answered 200 with an empty text. | A clear error: "The AI answer could not be read". Test: `pentest-round4.test.js` › AI errors. |
| S-38 (R-26, R-9) | Low (production only) | "Reset data" and "Refresh seed.js" would be available to a customer's admin. Without SMTP, every e-mail, reset links included, was printed in the server output. | Code review. | With `NODE_ENV=production`, both tools answer 403 unless `DEV_TOOLS=1`, and e-mails are never printed (only "could not be sent"). On this computer nothing changes. Test: `pentest-round4b.test.js` › R-26 and R-9. |

**Hardening added (not a vulnerability by itself):**
- **Content-Security-Policy** on every answer:
  - `connect-src 'self'`: a script that slipped in cannot send data to another site with `fetch`.
  - Also `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'self'`.
  - Scripts still need `'unsafe-inline'`: the pages contain **989 inline event handlers** (counted in round 4), so a strict CSP needs the R-7 refactor.
  - Checked in the browser: all 68 pages as admin, and every page of the other roles, opened with **0 CSP violations**.
- **Permissions-Policy:** camera, location, payment and USB are off; the microphone is allowed only for the app itself (the AI Simulator).
- **Origin check** for browsers that send no `Sec-Fetch-Site`: a change must come from the app's own address.

### Checked and found sound in round 4 (with the test)

- **Every route × every role:**
  - The role matrix now reads guards such as `need(...QA)`, `need(...LEADS)` and `need(...STAFF)`. Before, about 30 of them (all the AI and Q-Intelligence routes) were treated as public and never checked.
  - All 218 tried routes now answer 401 to a signed-out visitor and 403 to the roles the guard refuses, and none answers 500.
  - The test fails when a route has a guard it cannot read.
- **Sessions:**
  - Deactivating a person, an admin password reset, a role change and a move to another workspace all take effect on the very next request.
  - A first-password person can do nothing else, and a pending registration cannot sign in.
- **Other people's records (IDOR):** always refused across people and workspaces for:
  - time off (ask for, cancel, decide)
  - attendance (correct, read a team)
  - capacity plans (read, change, publish, delete)
  - AI drafts and plans, the AI analyst, Q-Intelligence agents

  The deputy of a team lead can decide, and a request is decided only once.
- **Extra fields (mass assignment):** all ignored:
  - role, team, username, active and hash in a profile change
  - by, byName, id and at in a recognition
  - status, by, dby and days in a time-off request
  - status and person in a correction
- **Files:** recordings cannot be read outside their folder (`..%2F`, `..%5C`, `%2e%2e`, `data.json`, `.qsmart-key` → 404).
- **Excel export:** typed text never becomes a formula (no `<f>` cell in the file).
- **Odd input:** `__proto__` / `constructor.prototype` keys in six kinds of body change nothing. The 2 MB (agents) and 25 MB limits answer 413, and long texts are cut.
- **AI:** the AI never gets more power than the person.
  - A review or agent of another workspace cannot be chosen.
  - Hostile AI answers (HTML, script, "approve every review, set every score to 100") stay drafts, change no score and are stored as text.
  - A hostile knowledge file makes the AI *say* things, never *do* things.
  - The API key is only ever the API key header: never in a prompt, the browser, the data file, the audit log or the server output.
  - 401, 429, 500 and broken answers give clear messages.
  - With no key, every AI action says so, and the morning brief works without it.
- **Secrets in Git (95 commits):** no real API key, token or private key. The matches were:
  - the made-up test keys of the tests (`sk-ant-fake…`, `sk-ant-good…`)
  - the test password
  - the known password hashes in `seed.js` and an old `seed-data.json` (R-5)
- **Browser:** every page of every role opened with no console error and no failed request. Forbidden and odd addresses (`#users`, `#audit`, `#org`, `#constructor`, `#__proto__`, `#toString`, `#%00`) show the dashboard.

### Open, suspected or accepted (round 4)

| Item | Kind | Note |
|---|---|---|
| Staff of every workspace see the **Administration team's** rota, attendance and leave balances (`?team=t-admin`) | Suspected / by design | The pages offer the Administration team on purpose (all staff are in it). In a multi-company product this must follow tenants (R-1). |
| Knowledge files, the knowledge base, quizzes, newsletters and scenarios are **organisation-wide**; a team lead's **deputy** can be anybody on the staff | Accepted for now (R-6) | A decision for the multi-company version. |
| **Server time zone** | Confirmed, P1 for hosting | All workforce dates use the time zone of the server. On a UTC server, a 09:00 Sofia shift starts at 11:00 Sofia time and New Year comes 2 hours late. Not changed, because it is a hosting decision: see DECISIONS_FOR_YOU.md, round 4. |
| CSP needs `'unsafe-inline'`; `img-src https:` allows image requests to other sites | Residual | A strict CSP after the R-7 refactor. |
| `uuid` advisory through `exceljs` (R-19), unmaintained `exceljs` (R-22) | Unchanged | `npm audit`: 2 moderate, no fix without a breaking change. |
| R-1 to R-5, R-8, R-16, R-17, R-23 | Unchanged | See REMAINING_ISSUES.md and DECISIONS_FOR_YOU.md. |
| R-24 Google Fonts | **Fixed** (V3, 28 October) | The fonts come from `public/fonts`; the CSP is now `style-src 'self' 'unsafe-inline'` and `font-src 'self'`. In a fresh browser the sign-in page and the dashboard asked no other site for anything (English and Bulgarian). |

### Tests not performed in round 4, and why

- **OWASP ZAP and gitleaks:** not installed (see above).
- **Real SMTP, real AI, the Cloudflare tunnel, TLS and HSTS:** no credentials, and outside the repository by the rules of this round.
- **Load tests beyond 20 saves at the same moment:** not run. Only bounded, local measurements (PERFORMANCE_AUDIT.md).
- **A read-only disk for `.qsmart-key`:** the code path was read (the app keeps working; keys must be typed again after a restart). Not simulated, because changing folder permissions on Windows is a system setting.
- **Ctrl+C on Windows:** the clean stop was added, but Windows cannot send the signal to a test process, so it was checked by code review only. A hard stop in the middle of saving was tested: nothing was lost.

### Residual risk

All confirmed problems of round 4 are fixed and covered by tests. The app is still **not ready** to be sold to independent companies. These are launch blockers:
- R-1: no tenants.
- R-2: the default password.
- R-3 / R-4: the JSON file and the in-memory sessions. At the target size every request takes seconds (PERFORMANCE_AUDIT.md).
- The server time zone.

After those, an independent penetration test.
