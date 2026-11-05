# Q-SMART – Functional audit

Audit dates: 2026-10-24 (round 1 and round 2, maximum depth) · Branch: `q-smart-full-audit`

## How the features were tested

1. **Automated API tests:**
   - The 79 existing tests.
   - `test/security.test.js` (36 tests).
   - `test/workflows-more.test.js` (14 workflow tests, new in round 2).
   - All of them start the real server on a temporary copy of made-up data.
2. **Browser walk-throughs** on a throw-away copy of the real data with audit accounts for every role (admin, QA, lead, agent):
   - every page of each role's menu
   - view and edit pop-ups (122 as admin, 91 as QA, 87 as lead, 23 as agent)
   - checks for JavaScript errors and broken text (`undefined`, `NaN`, `[object Object]`, "went wrong")
   - pages wider than the screen
   - names and keyboard reach of controls (accessibility)
3. **Independent recalculation:** the headline numbers were calculated three separate ways and compared.
4. **Reading the code** of every page, looking for workflows that silently do the wrong thing. Several of the round-2 bugs were found this way.

"Opened" means the page or pop-up loaded and showed the data without errors. It does **not** mean every button on it was clicked through. The table says which workflows were also tested end to end.

## Results per feature

| Feature | What was checked | Result |
|---|---|---|
| Sign-in, sign-out, wrong password, deactivated user, role change | API tests, per-account limit, session expiry | Pass |
| Password change, first-login password, reset by e-mail link, reset by admin | API tests (round 2). Browser: a password changed in another session signs this browser out with "Your session expired. Please sign in again." | Pass. **Behaviour changed**, see below |
| Registration (first + last name, automatic username, admin approval) | Workflow test: pending until approved; an agent needs a working team; the first sign-in forces a new password; the same e-mail cannot register twice; names such as O'Neil work | Pass |
| Pop-up preferences, language | Existing API tests | Pass |
| QA Entry and scoring | Unit tests (all rules). Workflow test: the server ignores a score sent by the browser and computes it from the answers, critical categories included | Pass |
| Scorecards over time | Workflow tests: changing or deleting a scorecard never changes reviews already made with it; editing an old review uses *its own* stored points and names | Pass |
| Reviews: edit and notify | Workflow test: a new score notifies the agent; a changed comment does not | Pass |
| Disputes | API and workflow tests: only the agent opens one; a resolved dispute takes no new messages and cannot be opened again; agents cannot resolve | Pass |
| Call recordings | API tests: workspace rules; the file name always stays in the recordings folder | Pass (after S-1, S-24) |
| Quick flags | API tests; browser: the red-flag button on a lead ID containing `'`, `\` and a line break opens the form with the exact lead ID | **Defect found and fixed (F-8)** |
| Scorecards, categories, root causes, Auto QA categories | Browser: pages and pop-ups | Pass |
| Dashboard, Agents, Team review, Category stats | Recalculation (see below); browser: hostile shared views, widget settings, Display panel, drag and drop | **Defects found and fixed (F-6, F-10; S-13)** |
| Report builder, Saved & scheduled, Export centre | API: owner-only sending, workspace limit, category rows, Excel cell types; browser: each export says which column holds dates | **Defects found and fixed (F-3, F-4, F-5)** |
| Excel exports (Reviews, Quick Flags, Agents, Report builder, Export centre re-download) | API: numbers stay numbers, only real dates become dates, no formulas or links | Pass (after F-3, F-4) |
| Tasks, missions, templates | Workflow test: a daily mission appears once per agent per day, however often the page is opened; workspace rules | Pass |
| Coaching, one-to-one, calibration | Workflow test: action items become tasks once (saving again does not copy them) | Pass |
| Goals, improvement plans, recognition | Browser; API: malformed plans refused (F-2) | Pass (after F-2) |
| Review planner, QA workload, calendar | Browser: pages open | Pass (opened only) |
| Compliance, risk register, complaints, CSAT | Browser: all four pages; the "Open risk case" button on a lead ID with `'` and `\` | **Defect found and fixed (F-8)** |
| CSAT import | Code review | **Open: importing the same file twice doubles the answers (R-21)** |
| Knowledge base, folders, My learning | Workflow test: deleting a folder moves its articles up; deleting with everything inside also removes the articles and their read marks | Pass |
| Quizzes | Workflow test: a quiz reaches only its team, without the answers, and is graded by the server | Pass |
| Auto QA | API: workspace rules; rules scoring unit test | Pass |
| Quick jump (Ctrl+K) | Browser: searching Call Reviews for "O'Brien" | **Defect found and fixed (F-7)** |
| Page links (`#page`) | Browser: `#constructor`, `#__proto__`, `#toString` | **Defect found and fixed (F-9)** |
| Transcripts, Call simulator | Browser | Pass after F-1. Both are **demonstration content**: see "Limitations" |
| Users, teams, workspaces, skills, permissions, integrations, notification rules, backups, e-mail templates, audit log | Browser as admin; workflow test of the team and last-admin rules | Pass |
| Screen sizes | 375 px: the intended "screen too narrow" message. 768 px: 29 pages, none wider than the screen | Pass |
| Accessibility (automatic check) | All 46 admin pages and 17 agent pages: every button, field and link has a name a screen reader can read, and every clickable element can be reached with the keyboard | Pass. Not a full WCAG audit (contrast not checked) |

## Numbers recalculated independently

From the throw-away copy (153 reviews), "all time", all teams:

| Source | Reviews | Average | Pass rate |
|---|---|---|---|
| Calculated directly from `/api/evaluations` with the pass marks from `/api/settings` | 153 | 92.5% | 87.6% |
| The dashboard's own functions (`avg`, `isPass`) | 153 | 92.5% | 87.6% |
| The report engine (Report builder and scheduled e-mails) | 153 | 92.5% | 87.6% |

All three agree. All 153 stored scores also match the score recalculated from their category points.

Rules confirmed by tests:
- **Pass mark:**
  - A review passes when its score is **equal to or above** the pass mark.
  - The pass mark is the team's own value if it has one, otherwise the global value.
- **Custom periods** include their first and last day completely and nothing outside.
- **An empty period** shows "—", not 0%.

## Defects found and fixed

| ID | Round | Priority | Defect | Cause | Fix | How it was checked |
|---|---|---|---|---|---|---|
| F-1 | 1 | P2 | Call Simulator always saved 0% | Compared the coach messages with the wrong text | Exact comparison | Browser: one good reply of two = 50% |
| F-2 | 1 | P3 | One malformed improvement plan crashed the Improvement plans page for everybody | Any value accepted for `goals` | Server refuses goals that are not a list | API test |
| F-3 | 2 | **P2** | **Report builder Excel export: the first number column became "invalid date"** (e.g. the average score) | The server turned column B of every export into dates, but only the Reviews export has its dates there | Each export says which column holds dates, and only real `YYYY-MM-DD` values become dates. Old saved exports also download correctly | API test reads the file back: 92.5 stays 92.5 |
| F-4 | 2 | **P2** | **Quick Flags Excel export: the "Type" column became "invalid date"**, and the real Date column stayed plain text | Same cause | Same fix (Quick Flags: column C) | API test: "Call" stays text, the date becomes a date |
| F-5 | 2 | **P2** | **Report builder, rows per category: pass rate, fail rate, red/green flags and disputes were counted over *all* reviews**, not just the reviews that contain that category. Example: "Greeting" showed 2 red flags that belonged to reviews without a Greeting category, and a 50% pass rate instead of 100% | The category filter was applied to the average only | Every number of a category row uses the same reviews | Unit test with known values |
| F-6 | 2 | P2 | A widget's own "Review type" filter was lost after saving | The server dropped that field (`f.c`) | Kept (only a known review type) | API test; browser |
| F-7 | 2 | P2 | **Ctrl+K quick jump: "Search Call Reviews for …" did nothing for names with an apostrophe** (O'Brien, D'Souza) | The search built JavaScript text from the typed words | A real function, no code from text | Browser: opens Reviews with the search "O'Brien" |
| F-8 | 2 | P3 | Lead IDs or campaigns containing `\` or a line break broke the red/green flag buttons and the "Open risk case" button; apostrophes were silently removed from the lead ID and title | Values put into `onclick` with only `'` removed | The safe `jsq()` helper | Browser: both buttons open with the exact text |
| F-9 | 2 | P3 | Links such as `#constructor` or `#__proto__` showed a broken page | Page lookups also found built-in object names | Only real page names are used | Browser: the dashboard is shown |
| F-10 | 2 | P3 | Root-cause and compliance tallies, and the topics of imported articles, miscounted a word that is also a built-in name (e.g. "constructor") | Counting with ordinary objects | Plain counters | Import topics, before and after: "constructor" found twice ranked *below* a word found once; now above. The tallies: code review |

Security fixes S-1 to S-27 are in SECURITY_AUDIT.md.

## Behaviour that changed on purpose

**After a password reset, all open sessions now end** (S-14).

- **Before:** when an admin reset a person's password, the session that was already open could choose the new password straight away.
- **Now:** that session is signed out. At the next sign-in with the temporary password, the "choose a new password" pop-up appears as before.
- **Self-service change:** changing your own password keeps you signed in where you are, and signs you out everywhere else.
- **Test changed:** the existing test `test/api-workflows.test.js` described the old behaviour. It now checks the new one. Nothing was removed from it; it asserts more than before.

## Defect introduced during this audit (and fixed before committing)

- **What happened:** in round 2, a comment added in the middle of a long line in `public/js/comply.js` turned the rest of that line into a comment.
- **Effect:** the file stopped loading, which hid the Compliance, Risk register, Complaints and CSAT pages.
- **How it was found:** the browser test showed the dashboard where the Compliance page should be.
- **Fix:** corrected within minutes, then `node --check` was run on all 51 files and the four pages were reopened.
- It was never committed.

## Regression tests added

- **`test/security.test.js` (36 tests):**
  - workspace isolation, report sending and data, Excel injection
  - CSRF (cross-site and same-site), session expiry and password-change sign-out, single-use reset links
  - sign-in, change-password and forgot-password limits; the forwarded-address rule tested from the real network address
  - request size limits per role, the bulk import rule, Export centre copies
  - shared-view sanitising, widget filters, page names
  - prototype pollution, recording file names
  - the four slow-text cases (Markdown, HTML import, translation)
  - report category rows, Excel cell types
- **`test/workflows-more.test.js` (14 tests):** the workflows in the table above.
- The Call Simulator fix (F-1) and the browser-only fixes (F-7, F-8, F-9, and the page side of S-13) were checked by hand in the browser. The browser has no automated test runner in this project (R-18).

## Business rules that need a decision (not changed)

1. **A missing or unknown answer counts as "Yes".**
   - QA Entry starts every item as "Yes", so an item the reviewer forgets to change gives full points.
   - The server rule matters only for direct API use or imports.
   - Recorded as "CURRENT BEHAVIOUR" in `test/scorecard-rules.test.js`.
2. **A review where every item is N/A scores 0%**, which counts as a fail.
3. **Quiz and lesson-test results show the right answers after every attempt, and retakes are unlimited.**
4. **Deleting a user keeps their reviews**, shown under the stored name.
5. **Team statistics follow the agent's *current* team.** When an agent moves, their old reviews count for the new team and use its pass mark. The team at the time of the review is stored (`tid`) but used only as a fallback.
6. **CSAT import duplicates (R-21):** importing the same file twice doubles the answers. Automatic removal is not safe, because two real answers can be identical (same day, agent and score, no comment). A rule is needed, for example "same lead ID and date = same answer", or a warning when a file was already imported.

## Limitations

- **The Transcripts page shows the same built-in example conversation for every review.** It is demonstration content, not the review's real transcript. The real chat and e-mail texts are shown in the review pop-up.
- **The Call Simulator is a scripted practice** with three fixed customer lines and a keyword-based coach.
- **Reviews entered "today" store the exact time of saving.** Elsewhere the date is stored as noon of the chosen day. For users in very different time zones, a review saved shortly after midnight may show the previous or next day.
- **Excel dates use the US format** (mm/dd/yyyy) for every language.
- **The Export centre** says "too big to keep a copy (over 5000 rows)". Copies above 2 MB are now also not kept, so the "(over 5000 rows)" part is not always the reason. The text was left as it is, to avoid an untranslated message.
- No live e-mail or AI was tested, no screen reader was used, and dark mode was not reviewed page by page.

## Round 3 (26 October 2026)

- **F-11 · Library categories had no name (fixed).** The 7 categories of the real data were saved by the seed with their name in `n`; the app reads `name`. The Categories page showed them without a name and "Add category from library" copied them into a scorecard without one. `GET /api/categories` now sends `name` for them too (test added).
- **F-12 · A page could silently stop loading (prevented).** Two page scripts declaring the same top-level name (it happened with `catList` while building the new Categories page) stop the second script, and its whole page shows the dashboard instead. Fixed before committing; a test now fails on any such clash.
- **F-13 · Saved columns could jump back on quick clicks (fixed before committing).** Only the answer to the newest save is used now.
- Every page opens for every role without a script error (see TEST_RESULTS, round 3).

## Round 4 (28 October 2026)

### How the features were tested

- **Server, with made-up people** (`test/fixture-round4.js`): two workspaces, every role, a deactivated person, a pending registration and a first-password person. Tests: `pentest-round4.test.js`, `pentest-round4b.test.js`, `reliability.test.js`, `calc-round4.test.js`, `i18n-server.test.js`, `speed.test.js`.
- **Browser (Playwright, `npm.cmd run test:e2e`):** 14 tests on a throw-away copy, run 3 times in a row. They check results on the page and in the saved data, not only that a page opened.
- **Browser by hand** (the app's browser pane, a copy of the seed data on port 3200):
  - every page of every role: admin 68, QA 49, team lead 45, trainer 44, agent 25
  - the forbidden and odd addresses
  - the Bulgarian walk with `?i18n=debug`
  - the screen-reader names and the colour contrast

### Results per module (round 4)

| Module | What was checked | Result |
|---|---|---|
| Sign-in, sessions | Every role through the real form. Wrong password, deactivated, pending registration, first password. Deactivation, admin reset, role change and workspace move take effect on the next request. | Pass |
| Attendance | Check in → break → back → check out with the buttons (browser), with the 4 steps in the day's history. A correction asked and decided. A lead corrects their own workspace only. | Pass |
| Time off | A request by the agent, approved by the team lead with the button in the Requests tab (browser). The balance changes. The deputy decides. Decided only once. Cancel by others refused. | Pass |
| Rota, Team today, morning brief, reports | Read by staff of the right workspace only. The brief works without the AI. | Pass |
| Capacity planning | The other workspace cannot see, change, publish or delete a plan. The fair split and publishing are in `capacity.test.js`. | Pass |
| Reviews, disputes | QA saves → the agent sees it on the Reviews page → disputes → QA resolves it as "changed" → the agent is told (browser + data). | Pass |
| Excel export | The file opened in the test: one row per review shown, the lead IDs in it, no formula cells. | Pass |
| "Copy for Excel" | Texts that look like formulas are pasted as text; numbers stay numbers. | **Fixed** (S-35) |
| AI (drafts, team lead, analyst, trainer, simulator) | With the fake AI: normal, errors, broken and hostile answers; the right workspace only; the budget (`ai-settings.test.js`). | **Fixed** S-30, S-37 |
| Q-Intelligence | Ask Q agents, insights, topics and knowledge files per workspace; a hostile knowledge file. | **Fixed** S-29 |
| Organization › Data protection | The personal data download. | **Fixed** F-14 |
| Word import | A zip bomb is refused; a normal `.docx` becomes an article. | **Fixed** S-36 |
| Recordings | Real audio only; no file outside the folder. | **Fixed** S-33 |
| Integrations | https links only. | **Fixed** S-34 |
| Languages | Server messages, screen-reader names, the AutoQA subtitle and the theme tooltip. | **Fixed** F-15 |
| Dark and light mode | Switch, remembered after a reload, different colours (browser). | Pass |
| Phone and tablet | Phone: "screen too narrow" (by design). Tablet 768 px: the agent pages fit with no sideways scrolling. | By design, F-17 |
| Reliability | A hard stop in the middle of saving: data.json stays readable and every answered save is kept after the restart. A review of a deleted person, leave of a deactivated one and a capacity plan of a deleted team break no page. Health check. | Pass |

### Numbers worked out by hand (round 4)

| Case | Expected (by hand) | Result |
|---|---|---|
| Time off 30 Dec 2026 (Wed) – 4 Jan 2027 (Mon): 30 and 31 Dec working, 1 Jan New Year, 2–3 Jan weekend, 4 Jan working | 3 days: 2 in 2026, 1 in 2027 | 3 (2 + 1) ✓ |
| A half day on 31 December | 0.5 | 0.5 ✓ |
| February 2028 / 2027 / 2100 | 29 / 28 / 28 days | ✓ |
| The nights the clocks change (25 Oct and 29 Mar 2026) | no day skipped or repeated | ✓ |
| Orthodox Easter 2027 | Sunday 2 May (Good Friday 30 Apr, Easter Monday 3 May) | ✓ |
| Labour Day 2027 on a Saturday | the next free working day off: Tuesday 4 May (Monday 3 May is Easter Monday) | ✓ |
| A night shift across the October clock change, 22:00 → 06:00 | 9 real hours (the clock goes back) | 9 ✓ |
| 20 saves at the same moment | all 20 kept | 20 of 20 (normal and large data) ✓ |

The scoring rules (R-10), the quiz rules (R-11) and the capacity split were not changed. The "CURRENT BEHAVIOUR" tests of earlier rounds still pass.

### Defects found in round 4

| ID | Priority | Defect | Fix | Test |
|---|---|---|---|---|
| F-14 | P2 | **The personal data download (right of access) was incomplete.** It held reviews, tasks, sessions, quick flags, simulations, surveys, attendance, time off and notifications, but not the registration, calibrations, AutoQA, AI drafts and plans, goals, improvement plans, recognition, complaints, risks, quiz attempts, articles read, attendance corrections, leave adjustments or the person's audit log entries. A session without an agents list would also have stopped it with an error. | All added; every list is read safely. | `pentest-round4b.test.js` › personal data download |
| F-15 | P2 | **96 server messages and 258 screen-reader names had no Bulgarian or French translation.** Also the AutoQA subtitle (reworded, its translation no longer matched) and the theme tooltip. | Translated (LOCALIZATION_AUDIT.md). | `i18n-server.test.js`, `e2e` › screen-reader names |
| F-16 | P1 for hosting | **Workforce dates follow the server's time zone** (REMAINING_ISSUES.md). | Not changed: your decision (V1). | Shown by a run with three time zones |
| F-17 | P3 | **Phones only show "screen too narrow"** (by design since 24 October). | Not changed: your decision (V2). | `e2e` › phone and tablet |
| F-18 | P2 (test gap) | **The every-route test skipped about 30 routes** (guards like `need(...QA)` were read as "public"), so a wrong permission there would not have been noticed. | It now reads them, and fails on a guard it cannot read. | `role-matrix.test.js` |
| F-19 | P3 | **Saves take about 0.3 s** on this computer: Windows' virus scanner checks the new file. | Information only (V11). | PERFORMANCE_AUDIT.md |
| F-20 | P2 | **The example texts, tooltips and screen-reader names of the 24 multi-line text boxes stayed English** in Bulgarian and French. The language layer skipped these boxes completely, to keep what people type in them as it is. Found while doing V4. | Only the box's own labels are translated, never its contents. | `e2e` › screen-reader names ("Yes" typed in a box stays "Yes") |

### Defect introduced during round 4 (fixed before committing)

While translating the screen-reader names, the first version called `tr()` inside a helper where `tr` already meant "the table row". That made every page's accessibility helper stop with "tr is not a function". The browser check (console errors after the change) found it; it was fixed (`window.tr`) before the change was committed. The browser tests now also check those names in Bulgarian and French.

### Business-as-usual routines

See BAU_SCENARIOS.md.
