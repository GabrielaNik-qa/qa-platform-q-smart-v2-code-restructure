# Q-SMART – Business-as-usual routines

Round 4 · 28 October 2026 · Branch `q-smart-v1-audit`. Made-up people only (`test/fixture-round4.js` or the seed copy on port 3200).

Each step says how it was checked:
- **Browser:** the Playwright test clicks through the real page and checks the result on the page and in the saved data (`npm.cmd run test:e2e`).
- **API:** a server test does the step as that role and checks the saved data and the answer (`npm.cmd test`).
- **Page only:** the page was opened by that role with no error (the every-page browser test), but the step itself was not done.
- **Not run:** not checked in round 4.

**Honest summary:** the routines below were **not** all clicked through by hand from start to finish in the browser. The main steps of each routine are covered by browser or API tests that check the results. The steps marked "Page only" or "Not run" are the next ones to automate.

## Agent – a normal day

| # | Step | Expected | How it was checked | Result |
|---|---|---|---|---|
| 1 | Sign in | The dashboard of the agent | Browser (`signin-pages` › agent) | PASS |
| 2 | Check in | "In" shows the time; the day's history says "in" | Browser (`workflows` › attendance) | PASS |
| 3 | See today's leads and tasks | Own numbers only | API (`capacity.test.js` › what each agent sees); Page only (Tasks) | PASS |
| 4 | Take a break, come back | One break with a start and an end | Browser (`workflows` › attendance) | PASS |
| 5 | Read a new review | It is on the Reviews page | Browser (`workflows` › review) | PASS |
| 6 | Acknowledge it (opening it tells QA) | "Seen" saved; nobody else can mark it | API (`workflows-round4.test.js` › seen) | PASS |
| 7 | Open a dispute and write in it | The dispute is open; QA sees it on Disputes | Browser (`workflows` › review); API (`api.test.js` › dispute messages) | PASS |
| 8 | Do a quiz | The attempt is saved; the answers are hidden from agents before | API (`workflows-more.test.js`) | PASS |
| 9 | Practise in the AI Simulator | A customer reply, then a score of 77 with the fake AI; the transcript is the agent's only | API (`pentest-round4.test.js` › AI Simulator) | PASS |
| 10 | Ask for a half day off | 0.5 day; waiting for the team lead | API (`attendance.test.js` › half days); Browser for a full day | PASS |
| 11 | Ask for a check-in correction | Pending; the team lead is told | API (`attendance.test.js`, `pentest-round4b.test.js`) | PASS |
| 12 | Check out | "Out" shows the time | Browser (`workflows` › attendance) | PASS |
| 13 | Sign out | Back to the sign-in screen | Browser (`signin-pages` › language) | PASS |

## Team lead – the morning

| # | Step | Expected | How it was checked | Result |
|---|---|---|---|---|
| 1 | Team today: who is late or not checked in | Counts and rows for their teams only | API (`today.test.js`, `pentest-round4b.test.js`) | PASS |
| 2 | The morning brief | One per team and day; works without the AI | API (`today.test.js`, `pentest-round4.test.js`) | PASS |
| 3 | Approve a time-off request | Approved; the balance changes | Browser (`workflows` › time off) | PASS |
| 4 | Approve a correction | The times are written; the person is told | API (`attendance.test.js`) | PASS |
| 5 | Change tomorrow's rota | The cell changes for their people only | API (`workforce.test.js`) | PASS |
| 6 | Copy the rota to next week | Each weekday as last week; holidays stay holidays | API (`workforce.test.js`) | PASS |
| 7 | Re-split capacity after somebody is off | A new split is suggested for the leads not worked; approved by the lead | API (`capacity.test.js`) | PASS |
| 8 | A one-to-one with an agent, signed by the agent | Signed; the agent is told | API (`api-workflows.test.js`) | PASS |
| 9 | Set a goal | The goal is saved; the agent is told; only that agent (and the team, for a team goal) sees it | API (`workflows-round4.test.js` › goals) | PASS |
| 10 | Recognition (kudos) | Saved as the lead; the person is told | API (`pentest-round4b.test.js`) | PASS |

## QA specialist – a review day

| # | Step | Expected | How it was checked | Result |
|---|---|---|---|---|
| 1 | Review planner, QA workload | The pages open | Page only | PASS (opens) |
| 2 | QA Entry on a call, a chat and an e-mail | Saved with the right score | API (`workflows-more.test.js` scores; the browser test saves a call). Chat and e-mail: Page only in round 4 | PASS / — |
| 3 | Upload a recording | Real audio only; played to allowed people only | API (`pentest-round4b.test.js`, `security.test.js`) | PASS |
| 4 | Quick flag | Saved; the agent is told | API (`api-workflows.test.js`) | PASS |
| 5 | Remind the agent | A reminder notification | API (`api.test.js`) | PASS |
| 6 | Resolve a dispute with a score change | Resolved as "changed"; the agent is told | Browser (`workflows` › review) | PASS |
| 7 | A calibration session | Saved for its participants | API (`api-workflows.test.js`) | PASS |
| 8 | An Auto QA review | Scored by the categories | API (`autoqa.test.js`, `api-workflows.test.js`) | PASS |
| 9 | A report, exported to Excel | The file holds the rows shown | Browser (`workflows` › Excel export, reviews list); report builder: Page only | PASS / — |

## Trainer

| # | Step | Expected | How it was checked | Result |
|---|---|---|---|---|
| 1 | A knowledge base article (Markdown) | Saved and shown | API (`workflows-more.test.js`) | PASS |
| 2 | Word import | An article from a `.docx`; a zip bomb refused | API (`pentest-round4b.test.js` › R-14) | PASS |
| 3 | A quiz by hand, and an AI draft approved | A draft until published | API (`workflows-more.test.js`, `ai-settings.test.js`) | PASS |
| 4 | A newsletter | A draft tells nobody; publishing tells everybody but the author | API (`workflows-round4.test.js` › newsletters) | PASS |
| 5 | A coaching session | Saved for agents of the workspace | API (`api-workflows.test.js`) | PASS |
| 6 | An AI scenario | Saved; agents can practise it | API (`api-workflows.test.js`) | PASS |
| 7 | Learning progress | Per workspace | API (`security.test.js`, earlier rounds) | PASS |

## Admin – set-up and month end

| # | Step | Expected | How it was checked | Result |
|---|---|---|---|---|
| 1 | Create a user and a team; move an agent | Username made from the name; first password must be changed; the move takes effect at once | API (`pentest-round4b.test.js` › an admin creates a person, workspace move; teams in `workflows-more.test.js`) | PASS |
| 2 | Approve a registration | The account is made | API (`workflows-more.test.js`) | PASS |
| 3 | Change a scorecard (and old reviews) | Old reviews keep their scores and their own points | API (`workflows-more.test.js` › changing a scorecard later) | PASS |
| 4 | Work calendar with Bulgarian public holidays | Easter and moved days right | API (`workforce.test.js`, `calc-round4.test.js`) | PASS |
| 5 | Leave types and yearly balances; an adjustment | Carry-over at most 5 days; adjustments counted | API (`attendance.test.js`) | PASS |
| 6 | Attendance rules | Saved; wrong values refused | API (`workforce.test.js`) | PASS |
| 7 | Integrations: AI key saved, test, budget | Encrypted; the budget stops calls | API (`ai-settings.test.js`) | PASS |
| 8 | Integration links | https only | API (`pentest-round4b.test.js` › R-13) | PASS |
| 9 | Notification rules, e-mail templates | Saved by admins only; a switched-off notification no longer reaches that role | API (`security.test.js` for templates, `workflows-round4.test.js` › notification rules) | PASS |
| 10 | Data protection retention, purge | Old data removed | API (`api-workflows.test.js`) | PASS |
| 11 | Scheduled report | Sent with the owner's data only | API (`security.test.js` › S-2, "send now") | PASS |
| 12 | Export centre, backup | Kept copies opened only by their maker; backup restore with a safety copy, download | API (`api-workflows.test.js`) | PASS |
| 13 | Audit log check | Changes and sign-ins listed; no password | API (`api.test.js`, `pentest-round4b.test.js` › R-25) | PASS |
| 14 | Personal-data download for one person | Complete, nobody else's data, no hashes | API (`pentest-round4b.test.js`) | PASS |

## Weekly and monthly

| # | Step | Expected | How it was checked | Result |
|---|---|---|---|---|
| 1 | Month change: capacity plans | A month that is over cannot be split again | API (`capacity.test.js`) | PASS |
| 2 | Year change (31 Dec → 1 Jan): balances | Each year pays for its own days | API (`calc-round4.test.js`, `attendance.test.js` › carry-over) | PASS |
| 3 | The scheduled-report e-mailer (every 10 minutes) | Sends due reports once a day | Not run with a fake clock ("send now" is tested; the timer is inside the server and cannot be reached by a test without changing the code) | — |
| 4 | Retention purge on the copy | Deletes what it says | API (`api-workflows.test.js`) | PASS |

## Next steps

Done since round 4: seen, goals, newsletters and notification rules (`workflows-round4.test.js`). Still to automate:

Automate the "—" steps above in the browser tests:
- the report builder
- the scheduler, with a fake clock
