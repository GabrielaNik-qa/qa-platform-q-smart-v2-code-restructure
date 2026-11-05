# Round 4 – running log

Started 2026-10-28. Branch `q-smart-v1-audit`, made from `q-smart-v1` at `3440283` (2026-10-27 22:34, "Remove every company mention…").
If this session stops, the next one continues from this file.

## Safety set-up (§1)

- Real files fingerprinted at the start (size, SHA-256; content never read or printed):

  | File | Size | SHA-256 (first 16) |
  |---|---|---|
  | data.json | 4,557,295 | 67C759EFD8A8B752 |
  | seed.js | 2,274,036 | 70AC11D12EC67868 |
  | audit.json | 8,452 | 28F93FB5F7E302FC |
  | .qsmart-key | 64 | 044ECC8AD3CBFA06 |

- Throw-away folder: `%TEMP%\qsmart-round4-test` (new and empty at the start), with its own `data.json` (from `seed.js`, written by a
  script that refuses the project folder), `audit.json`, `rec\`, `backups\` and its own `.qsmart-key` (made by the app at first start).
  In the copy only, every test user's password was set to `password` (the real seed holds two real password hashes, R-5).
- Ports: 3199 and 3299 were still held by test servers left running by yesterday's audit session (started 27 Oct 22:09 and 22:30).
  They were not stopped (another session's processes). Round 4 uses **3200** for the app and **3298** for the fake AI instead.
  `.claude/launch.json`: new entries `q-smart-round4` and `fake-ai`; `q-smart` and the old `q-smart-audit` untouched.
- Checked before testing: the server writes only to `DATA_FILE`, `AUDIT_FILE`, `REC_DIR`, `BACKUPS_DIR` and the folder of `DATA_FILE`
  (`.qsmart-key`, `ai-usage.json`). "Reset data" runs `seed.js` with the same `DATA_FILE`; "Refresh seed.js" refuses on a copy (S-28).
  `adduser.js` and `seed.js` run by hand would use the real file unless `DATA_FILE` is set – never run in this round.

## Git (§2)

- Uncommitted on `q-smart-v1` at the start: only `.claude/` (untracked on purpose).
- Other branches: `main`, `q-smart-full-audit`, `q-smart-latest-23-10-26` and `origin/V7` have nothing that `q-smart-v1` lacks.
  `origin/main` (GitHub) has 17 commits of an older line of work (24 Oct: registration with first/last name, reports, planning,
  accessibility…) that split off at `020ac44`; most of those features were rebuilt later on `q-smart-v1`. Not merged.
- Baseline on `q-smart-v1`: `npm.cmd test` → 168 tests, 168 passed, 0 failed, 46.4 s.

## Status by phase

| Phase | Status |
|---|---|
| 1 Map | **Done.** 220 routes read from the code; the new modules read line by line (att, today, cap, wf, ai, org). The inventory, the route × test table and the pages per role are in PROJECT_INVENTORY.md (Round 4). |
| 2 Baseline | **Done.** 168 tests pass on q-smart-v1. Node 24.11.0, npm 11.6.1, Windows 11. ESLint added (`npm.cmd run lint`: 0 problems after removing 15 duplicate translation entries). |
| 3 Multi-role | **Done.** The role matrix covers all 218 tried routes (guards like `need(...QA)` were skipped before, F-18). Browser: every page of every role (admin 68, QA 49, lead 45, trainer 44, agent 25), with 0 console errors and 0 failed requests; forbidden and odd addresses show the dashboard. IDOR, mass-assignment and session tests in `pentest-round4*.test.js`. |
| 4 BAU | **Partly.** BAU_SCENARIOS.md: every step marked Browser / API / Page only / Not run. Not run: the review "seen" step, goals, newsletters, the report builder, notification rules, the scheduler with a fake clock. |
| 5 Functional | **Mostly.** The calculation tests kept; new hand-checked dates (`calc-round4.test.js`); F-14 (personal data download) fixed; F-16 (time zone) found. |
| 6 Security | **Done for the planned checks.** S-29 to S-38 fixed, CSP, Permissions-Policy, Origin check, a secret scan of all 95 commits. ZAP and gitleaks are not installed (not run). |
| 7 Speed | **Done.** Before / after on normal (4.5 MB) and large (449 MB) data; gzip; one disk read per reviews list; the speed budget test. PERFORMANCE_AUDIT.md. |
| 8 Localization | **Done for the found gaps.** 96 server messages, 258 screen-reader names and 4 page texts translated; 15 duplicates removed; the new `i18n-server.test.js`. LOCALIZATION_AUDIT.md. |
| 9 Regression | **Done.** Full suite after every change; the R- / S- / F- checklist in REMAINING_ISSUES.md (Round 4). |
| 10 E2E | **Done.** 14 Playwright tests, 3 runs in a row without a failure (final check below). |
| 11 A11y | **Quick checks.** Controls without a name (1 fixed), contrast, focus, Esc. Screen-reader names translated. |
| 12 Reliability | **Done.** A hard stop while saving loses nothing; orphan records break no page; 20 saves at the same moment all kept; health route; clean stop. |

## Commits on q-smart-v1-audit

1. `0f72aae` AI insights, topics and the AI trainer quiz no longer read the other workspace's data (S-29, S-30).
2. `7c37fcf` Safer sign-in log, uploads, links, copies for Excel and browser protections.
3. `325c1ee` Code checker and the shared-names check.
4. `139a16c` Smaller downloads, a speed check, a health check and a clean stop.
5. `0c35118` The server's messages in Bulgarian and French.
6. `24464d9` Browser tests and a size limit for Word imports.
7. `917d402` The Business words boxes get a name for screen readers.
8. `726cb8a` Tests for New Year, 29 February, clock changes and Bulgarian Easter 2027.
9. `f9b6217` Screen-reader names in the chosen language; the security, speed and language reports.
10. (last) The other reports, the README, the create-a-person test.

## Things learned along the way (for the next session)

- The Bash tool loses backslashes in heredocs and inline scripts: write scripts to the scratchpad with the Write tool, then run them.
- PowerShell 5.1 splits `git commit -m` texts that contain double quotes: use `git commit -F <file>`.
- A navigation that only changes the `#` part does not reload the page: use `location.reload()` to load changed scripts.
- Inside `cellName` (main.js), `tr` is the table row: use `window.tr` to translate there.
- The Playwright tests add the made-up address only to the app's own requests (a custom header on outside requests makes other
  sites refuse them). Since V3 (fonts from the app) every request to another site is refused and counted as an error.
- The language layer (`i18n.js`) skips the contents of text boxes on purpose; their labels and examples are translated
  separately (`labelsOnly`).

## Final check (§18), 28 October 2026

| Step | Result |
|---|---|
| 1. `npm.cmd test` | **210 tests: 210 passed**, 0 failed, 0 skipped (35.4 s). Before the round: 168 / 168. |
| 2. `npm.cmd run test:e2e`, three times in a row | **14 passed** each time (59.1 s, 58.9 s, 57.6 s) |
| 3. `npm.cmd run lint` | 0 problems |
| 4. `npm.cmd audit` | 2 moderate (`uuid` through `exceljs`, R-19), as before; nothing new |
| 5. Speed on the large data, against the baseline | PERFORMANCE_AUDIT.md: the same seconds (the JSON file), 40–70 times smaller answers |
| 6. Every page × role × language in the browser | English: the browser tests (every role, every page). Bulgarian and French: every page of admin (68), QA (49), lead (45), trainer (44) and agent (25), with **0 blank pages and 0 errors** |
| 7. The real files | **Unchanged** (same size and SHA-256 as at the start): `data.json` 4,557,295 B `67C759EF…`, `seed.js` 2,274,036 B `70AC11D1…`, `audit.json` 8,452 B `28F93FB5…`, `.qsmart-key` 64 B `044ECC8A…` |
| 8. The whole change against `q-smart-v1` | 2,470 added lines read by a script: no secret, no personal data, no folder path of this computer, no leftover debugging. 85 new development packages, all from registry.npmjs.org with integrity hashes; one install script (`fsevents`, Mac only, never installed on Windows). No design change. |
| 9. Git | 10 commits on `q-smart-v1-audit`; `q-smart-v1` still at `3440283`; nothing pushed, nothing merged; `.claude/` still untracked |

## After the final check: V3 and V4 (Gabriela's yes, 28 October)

| What | Result |
|---|---|
| V3: the fonts from the app | 66 font files and 5 licences in `public/fonts`; `index.html` no longer contacts Google; CSP `font-src 'self'`; fonts cached for a year. The look: 39 measured text widths identical to the pixel before and after |
| V4: neutral examples | Admin › Integrations and Business words, with their translations; the test data and one example sentence of the decisions file. No real-looking brand or company address is left outside `seed.js` |
| F-20 (found while doing V4) | The labels and examples of the 24 multi-line text boxes are now shown in Bulgarian and French; what people type is never translated |
| `npm.cmd test` | 214 tests, 214 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | 0 problems |
| `npm.cmd run test:e2e`, three times in a row | **15 passed** each time (1.1 min each) |
| A fresh browser | English 8 font files (163 KB), Bulgarian 13 (219 KB), 0 requests to other sites |
| The real files | `data.json`, `seed.js`, `audit.json`, `.qsmart-key`: still unchanged |

## The menu in two sections (29 October, Gabriela's request)

| What | Result |
|---|---|
| OPERATIONS | Home, Quality, Analytics, Performance, Coaching. A foldable heading like APPS, remembered; folded it is one row of icons |
| MANAGE | AI Hub, Help Center, Planning, Reports, Activity Log. The same kind of heading |
| AI Hub | New place-holder page with links to the AI tools already in the app (filtered by role) and whether the AI is connected. Icon always orange |
| Help Center | The Knowledge Base page under its new name (same page, same articles, same permissions); it left the Learning panel |
| Activity Log | The Audit log page under its new name, with the real records from the server; admins only, as before; it left Admin › System |
| Icons-only menu | A line between OPERATIONS and MANAGE, and the APPS line |
| Translations | 16 new Bulgarian and French texts |
| Tests | `npm.cmd test` 226 passed; `npm.cmd run test:e2e` 16 passed (the menu test checks the new layout); lint 0 problems |

## The Admin panel in five sections (29 October, Gabriela's yes)

| What | Result |
|---|---|
| Sections | ACCOUNT, PEOPLE, SETUP, GOVERNANCE, PLATFORM: one-word headings, at most five icons each, folded at every sign-in (like the main menu) |
| Moved | Workforce (Team today, Attendance, Time off, Shifts and rota, Capacity planning) to PEOPLE; Workforce set-up to SETUP; Compliance & CX to GOVERNANCE. APPS keeps Q-Intelligence, AI Simulator and Learning |
| Coming soon | 38 planned pages (billing, support, single sign-on, GDPR registers, EU AI Act, security, accessibility, sandbox…): greyed in the menu, a page that says "Coming soon", admins only, not listed in Roles & permissions |
| Unchanged | Every existing page keeps its address and its permissions; agents still reach Attendance and Time off (Settings › PEOPLE › Workforce) |
| Tests | `npm.cmd test` 226 passed; `npm.cmd run test:e2e` 16 passed; lint 0 problems |

## Next steps for a new session

- Read this file, then `docs/audit/DECISIONS_FOR_YOU.md` (section V) for the questions waiting for Gabriela.
- Start the copy with the launch entries `fake-ai` and `q-smart-round4` (ports 3298 and 3200).
- Automate the BAU steps marked "—" in BAU_SCENARIOS.md.
