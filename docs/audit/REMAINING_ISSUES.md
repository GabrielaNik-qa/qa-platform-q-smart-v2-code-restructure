# Q-SMART – Remaining issues

Audit dates: 2026-10-24 (round 1 and round 2) · Ordered by severity. "Block launch" means a launch as a commercial product for several customer companies.
None of these block today's use as a personal portfolio project with test data. (R-12 from round 1 was fixed in round 2, see S-26.)

| ID | Severity | Block launch? |
|---|---|---|
| R-1 | High | Yes |
| R-2 | High | Yes |
| R-3 | High | Yes |
| R-4 | High | Yes |
| R-5 | Medium | Yes (until resolved) |
| R-6 | Medium | Yes, if workspaces are sold as separation |
| R-7 | Medium | No (recommended) |
| R-8 | Medium | Yes for admins (MFA) |
| R-9 | Medium | Yes (legal) |
| R-21 | Medium | No |
| R-10 | Low | No |
| R-11 | Low | No |
| R-13 | Low | No |
| R-14 | Low | No |
| R-15 | Low | No |
| R-16 | Low | No |
| R-17 | Low | No |
| R-18 | Low | No |
| R-22 | Low | No |
| R-23 | Low | No (decide before launch) |
| R-24 | Low | No (decide before launch) |
| R-25 | Low | No |
| R-19 | Info | No |
| R-20 | Info | No |

---

### R-1 · No separation between customer companies (multi-tenancy)
- **Evidence:** no company or tenant field exists in the data, the routes or the session. Admins see everything, and catalogs and settings are global.
- **Impact:** two customers on one server would see each other's people, reviews and recordings.
- **Next step:** add tenants during the SQLite move (SAAS_READINESS.md §1), with cross-tenant tests. Until then, run one server and one data folder per customer.

### R-2 · Every new account starts with the password "password"
- **Evidence:** `DEFAULT_PASSWORD = 'password'` is used for create user, approve registration and admin reset, and the e-mail contains it. Usernames are predictable.
- **Also:** the registration e-mail address is never verified. Someone can register with another person's e-mail address and then know the username and the starting password.
- **Impact:** account takeover before the real person signs in.
- **Next step:** a one-time invitation / reset link (that code already exists) instead of a password, and e-mail verification at registration.

### R-3 · JSON file database
- **Evidence:**
  - Every request reads the whole `data.json` file and every change rewrites it.
  - **Measured:** at one year of data for 500 agents (73 MB), *every* request takes about 0.4 s, and saving any change about 1.7 s, during which nobody else is served.
  - `adduser.js` writes the same file directly, so running it while the server runs can overwrite changes.
- **Impact:** slow and unreliable at the target size. Several processes are impossible.
- **Next step:** the planned SQLite migration with transactions, keeping all current data. Page the reviews list on the server (the admin list alone was 36 MB).

### R-4 · Sign-ins kept in server memory
- **Evidence:** `express-session`'s default MemoryStore.
- **Impact:** everyone is signed out at every restart, only one process is possible, and memory grows with abandoned sessions.
- **Next step:** a SQLite or Redis session store together with R-3.

### R-5 · Real data and password hashes in `seed.js` (tracked in Git)
- **Evidence:**
  - Only the latest version of `seed.js` (commit `70a2ec9`) holds the full data. Older versions had no hashes.
  - 2 user records protect real passwords, not the test password.
  - One approved registration has a real-looking personal e-mail address.
  - *Admin > Backups > Update seed* writes the live data into this file.
  - The repository's visibility could not be checked.
- **Next step:**
  - Check that the GitHub repository is private.
  - If it ever was public, change those two passwords.
  - Keep only made-up demo data in `seed.js`.
  - Removing the file from Git *history* needs a history rewrite; ask before doing that.

### R-6 · Workspace rules not applied everywhere
- **Evidence:** organisation-wide for staff: goals, improvement plans, recognition, risks, complaints, surveys, shared reports, calibrations, task templates, knowledge base, quizzes and newsletters. Dispute notifications go to all QA and admins. (Tasks, sessions, flags, simulations, Auto QA, learning progress and reports were fixed in this audit.)
- **Impact:** none today (one workspace).
- **Next step:** apply `seesUser` to the `routes-more.js` collections and calibrations, and decide which learning content is shared on purpose.

### R-7 · No Content-Security-Policy or HSTS
- **Evidence:** inline `onclick="…"` handlers on every page.
- **Impact:** if an escaping mistake ever slips in (S-13 was one), nothing stops the injected script.
- **Next step:** move the handlers to `addEventListener` (a large refactor), then add a strict CSP. Turn on HSTS in Cloudflare.

### R-8 · Weak password rules, no two-factor sign-in
- **Evidence:** at least 6 characters with mixed case, a digit and a symbol.
- **Next step:** at least 8 (better 12) characters, a breached-password check, and MFA for admins. The messages need Bulgarian and French translations.

### R-9 · No retention, deletion or personal-data export
- **Evidence:**
  - Nothing is deleted automatically, and deleting a user keeps their reviews.
  - The audit log stores IP addresses.
  - Recordings and backups are unencrypted files.
  - Without SMTP, e-mails are printed to the server console, including reset links and the starting password.
- **Next step:** SAAS_READINESS.md §3. Print e-mails to the console only outside production.

### R-21 · Importing the same CSAT file twice doubles the answers
- **Evidence:** the survey import (`/api/c/surveys` with a list) adds every line with no duplicate check.
- **Impact:** "Number of answers" doubles. The averages stay the same only when the files are identical.
- **Next step (decision):** two real answers can look identical, so automatic removal is not safe. Options: treat "same lead ID + same date + same agent" as one answer, or warn when the same file was already imported.

### R-10 · Scoring rules that need a business decision
- Missing answers count as "Yes", and QA Entry starts every item as "Yes".
- An all-N/A review scores 0% (a fail).
- Team statistics follow the agent's current team.
- See FUNCTIONAL_AUDIT.md.

### R-11 · Quiz answers are shown after every attempt, and retakes are unlimited
- **Next step:** show answers only after passing, or limit attempts.

### R-13 · Integration links are not checked
- **Evidence:** *Admin > Integrations* saves any text, and the links are shown to everyone.
- **Next step:** accept only `https://` links on the server.

### R-14 · Word / PDF import limits
- **Evidence:** `.docx` files are unpacked by `mammoth` without a size limit (25 MB request). PDFs go to the AI as they are.
- **Next step:** limit the unpacked size and process imports in a worker. AI output is always a draft a person reviews before saving.

### R-15 · Recording upload content is not checked
- **Evidence:** the type or extension is checked, up to 100 MB. Files are served as audio with `nosniff`.
- **Next step:** check the file's first bytes, and add a malware scan for a hosted product.

### R-16 · Open registration
- **Next step:** invitation-only per customer company after tenants exist.

### R-17 · Account lock-out by a stranger
- **Evidence:** 10 wrong passwords lock an account for 15 minutes, for its owner too.
- **Next step:** accept the trade-off, or add a CAPTCHA / e-mail unlock.

### R-18 · No automated browser tests or linter
- **Evidence:** the browser checks of both rounds were scripted by hand and are not in the repository. One mistake made during this audit (a broken `comply.js`) was caught only by the browser check.
- **Next step:** Playwright tests for sign-in, QA Entry, disputes, reports, views and admin users. ESLint in `npm test`.

### R-22 · The Excel library looks unmaintained
- **Evidence:** `exceljs` 4.4.0 is the latest version. It brings 6 deprecated packages (`fstream`, `glob@7`, `inflight`, `lodash.isequal`, `rimraf@2`, `uuid@8`), plus the moderate `uuid` advisory (cannot be triggered here).
- **Next step:** watch for updates, or plan a switch to a maintained library.

### R-23 · Scheduled reports can be sent to any address
- **Evidence:** the report owner types the recipients freely, including addresses outside the company. The data is now limited to the owner's workspace (S-2).
- **Next step (decision):** allow only company domains or user accounts as recipients.

### R-24 · Google Fonts
- **Evidence:** `index.html` loads fonts from `fonts.googleapis.com`, which sends every visitor's IP address to Google.
- **Next step:** serve the fonts from the app itself.

### R-25 · A password typed into the username field ends up in the audit log
- **Evidence:** failed sign-ins store the typed username, so someone who types their password into that field leaves it in the log, which admins can read.
- **Next step:** store failed sign-ins only for existing usernames or e-mails.

### R-19 · Moderate `uuid` advisory through `exceljs`
- Cannot be triggered here (TEST_RESULTS.md).

### R-20 · Not tested in this audit
- Live SMTP e-mail, live AI, the Cloudflare tunnel and TLS settings, a dynamic scanner (ZAP), load tests, real mobile devices, screen readers and colour contrast.
- **Next step:** an independent penetration test and a staging environment with real e-mail and AI before launch.

## Round 3 (26 October 2026)

### R-26 · Developer tools in a SaaS version
"Reset to the seed data" (`POST /api/demo/reset`) and "Refresh seed.js" (`POST /api/seed/refresh`) are useful while building, but a customer's admin must never reset the whole database or write a file in the app folder. Before selling, switch them off in production (an environment setting), or keep them only for the platform owner.

### R-27 · Same Filters / Columns on the other tables — done
The kit is ready (`public/js/tablekit.js`); only the Reviews table uses it so far. Waiting for the go-ahead (DECISIONS_FOR_YOU.md, A4).

### R-28 · Sidebar panels (Admin, Learning, Back) — done
Built after Gabriela's yes (DECISIONS_FOR_YOU.md, A1), with foldable panel sections and hover-to-open in the icons-only menu.

## Round 4 (28 October 2026)

### Every known issue, checked again

"Evidence" names the test or the check of round 4.

| ID | Status after round 4 | Evidence |
|---|---|---|
| R-1 No tenants | **Open** (launch blocker) | Unchanged in the code. |
| R-2 Default password `password` | **Open** (launch blocker, your decision) | `DEFAULT_PASSWORD` unchanged. |
| R-3 JSON file database | **Open** (launch blocker), measured again | PERFORMANCE_AUDIT.md. At one year of 500 agents (449 MB): every request takes 2–5 s and a save 6–9 s. The file is close to Node's limit of 536,870,888 characters, so a slightly bigger organisation could not save at all. |
| R-4 Sessions in memory | **Open** (with R-3) | Unchanged. |
| R-5 Real data in `seed.js` | **Open** | The password hashes are still there (secret scan, 6 commits of `seed.js`). One registration still has a real-looking personal e-mail address. |
| R-6 Workspace rules | **Partly fixed** | Q-Intelligence and the AI trainer now follow workspaces (S-29, S-30). Still organisation-wide: knowledge files and knowledge base, quizzes, newsletters, scenarios, goals, improvement plans, recognition, risks, complaints, surveys, calibrations, task templates, and the Administration team's rota and attendance. |
| R-7 No CSP / HSTS | **Partly fixed** | A CSP and a Permissions-Policy on every answer, 0 violations on every page. Still needs `'unsafe-inline'` (989 inline handlers). HSTS belongs to the tunnel. |
| R-8 Password rules, no MFA | **Open** (your decision) | The sign-in rules of Admin › Organization allow 8–32 characters. |
| R-9 Retention, deletion, personal data | **Mostly fixed** | Retention and purge (27 October). The personal data download is now complete (F-14), and e-mails are never printed on a production server (S-38). Still open: the audit log keeps IP addresses; recordings and backups are not encrypted. |
| R-10 Scoring rules | **Open** (business rule, kept as is) | `scorecard-rules.test.js`: CURRENT BEHAVIOUR tests. |
| R-11 Quiz answers and retakes | **Open** (business rule) | Unchanged. |
| R-13 Integration links | **Fixed** (S-34) | `pentest-round4b.test.js` › R-13. |
| R-14 Word / PDF import limits | **Fixed for Word** (S-36) | `pentest-round4b.test.js` › R-14. PDFs still go to the AI as they are (25 MB request limit, staff only). |
| R-15 Recording content | **Fixed** (S-33) | `pentest-round4b.test.js` › R-15. A malware scan is still needed for a hosted product. |
| R-16 Open registration | **Open** (your decision) | Unchanged. |
| R-17 Lock-out by a stranger | **Open** (accepted trade-off) | The lock-after number can be set in Admin › Organization › Sign-in. |
| R-18 No browser tests or linter | **Fixed** | `npm.cmd run lint` (ESLint 9.39.1, 0 problems) and `npm.cmd run test:e2e` (Playwright, 14 tests, 3 runs in a row without a failure). |
| R-19 `uuid` advisory | **Open** | `npm audit`: 2 moderate (uuid through exceljs). |
| R-20 Not tested | **Partly** | Still not tested: real SMTP and AI, the tunnel, TLS, ZAP and real phones. Load: 20 saves at the same moment measured. |
| R-21 CSAT duplicates | **Open** (your decision) | Unchanged. |
| R-22 exceljs unmaintained | **Open** | Still 4.4.0, the latest. |
| R-23 Report recipients | **Open** (your decision) | Unchanged. |
| R-24 Google Fonts | **Fixed** (your yes, V3) | The fonts are served from `public/fonts`; the CSP allows fonts from the app only (`font-src 'self'`). `fonts.test.js` and the browser tests fail if a page asks another site for anything. |
| R-25 Password in the audit log | **Fixed** (S-32) | `pentest-round4b.test.js` › R-25. |
| R-26 Developer tools in a SaaS version | **Fixed for production** (S-38) | Off with `NODE_ENV=production` unless `DEV_TOOLS=1`. On this computer unchanged. |
| R-27, R-28 | Done (round 3) | — |
| S-1 to S-28 (rounds 1–3) | **Still fixed** | Their tests in `security.test.js`, `workflows-more.test.js` and `role-matrix.test.js` all pass (209 tests). S-28: the role matrix now also checks that `audit.json` and `.qsmart-key` stay untouched. |
| F-1 to F-13 (rounds 1–3) | **Still fixed** | Their tests pass. F-12 (two page scripts with the same top-level name) now has its own test, `shared-names.test.js`, and ESLint. |

### New in round 4

| ID | Severity | Status | Blocks launch? |
|---|---|---|---|
| S-29 to S-38 | Medium / Low | **Fixed** (SECURITY_AUDIT.md, round 4) | – |
| F-14 Personal data download incomplete | Medium (privacy) | **Fixed** | – |
| F-15 Server messages and screen-reader names not translated (96 + 258) | Medium (localization) | **Fixed** | – |
| F-16 Workforce dates follow the server's time zone | **High for hosting** | **Open**: your decision (V1) | **Yes**, if the server is not set to Sofia time |
| F-17 Phones show "screen too narrow" | Medium (product) | **Open**: by design, your decision (V2) | No (decide before selling to agents on phones) |
| F-18 The role-matrix test skipped about 30 routes | Medium (test gap) | **Fixed** | – |
| F-19 Saves take ~0.3 s on this computer because of the virus scanner | Low | **Open**: information (V11) | No |
| F-20 The example texts and screen-reader names of the 24 multi-line text boxes stayed English in Bulgarian and French | Medium (localization, accessibility) | **Fixed** (found while doing V4) | – |

#### F-16 · Dates follow the time zone of the server
- **Evidence:** the same code run with three time zones (round 4):
  - `Europe/Sofia`: a 09:00 shift = 07:00 UTC, and 23:30 UTC on 31 December is already 1 January.
  - `UTC`: 09:00 = 09:00 UTC (11:00 in Sofia), and the year changes 2 hours later.
  - `America/New_York`: 09:00 = 13:00 UTC.
- **Impact on a hosted server in UTC:** lateness, absences, "today", the morning brief time and the leave year are all shifted by 2–3 hours.
- **Next step:** `TZ=Europe/Sofia` in the hosting set-up now; the company's time zone in the calculations with tenants.

#### F-17 · Phones
Under 760 px the app shows only "Your screen is too narrow to use Q-SMART" (`test/e2e/workflows.spec.js` checks today's behaviour). Agent pages on phones are a design decision.
