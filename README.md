# Q-smart v2

Customer-service quality platform (SaaS) for contact centres: quality reviews and scorecards, coaching, learning, workforce, and AI. Version 2 is being built here, starting from today's app.

- The plan and the architecture: [docs/V2_PLAN.md](docs/V2_PLAN.md)
- The rules for working on this project: [CLAUDE.md](CLAUDE.md)
- Personal notes: `notes/`
- Branches: work happens on `qa-platform-q-smart-v2-code-restructure`; finished, tested work goes into `main`.

## Today's app (the starting point)

Customer service analytics: quality, performance and improvement for support teams (phone, email, chat and SMS). It covers call reviews and scorecards, disputes, tasks and missions, coaching and calibration, a knowledge base with quizzes, teams and users. Plain Node.js + Express on the server, plain JavaScript in the browser, and one JSON file (`data.json`) as the database. Everything, including `data.json`, is kept in this repository (Gabriela's decision, 5 November).

### Run it
```
npm.cmd install
node server.js        # http://localhost:3000   (set $env:PORT="3100" to use another port)
```
`node seed.js` puts back the saved starting data (users, reviews, knowledge base, tasks ...) if you ever need it.

### Check that everything still works
```
npm.cmd test
```
This runs the automatic tests in the `test` folder: the scoring rules, the pop-up preferences, who may see and change which reviews, disputes, and the safe saving of the data file. The tests start their own copy of the server with made-up users in a temporary folder, so your `data.json` is never touched.

Three more checks (tools for testing only; the app itself doesn't use them):
```
npm.cmd run lint
npm.cmd run test:e2e
node test/measure.js <a folder with a data.json>
```
- `lint` looks through the code for real mistakes (a name that is never defined, code that can never run, the same text twice).
- `test:e2e` opens the real pages in Chrome (Chromium) and clicks through them as every role, on its own throw-away copy with made-up people. The first time, download the browser once with `npx.cmd playwright install chromium`.
- `measure.js` copies the data of that folder into a temp folder and times the main pages and a save. To try a big company, first make made-up data with `node test/gen-large.js $env:TEMP\qsmart-large` (500 agents, a year of reviews, about 450 MB).

### Test users (password for all: `password`)
Agents, team leads and trainers are created automatically. The email is `first-initial.lastname@test.com`, for example `d.petrov@test.com` (agent), `l.hart@test.com` (team lead), `i.marinova@test.com` (trainer).
Make your own admin: `node adduser.js yourname "Your#Pass1" admin --email=you@example.com Your Name`

### Optional settings (type them in the terminal before `node server.js`)
| Setting | What for |
|---|---|
| `$env:SECRET="long random text"` | signs the login cookies (without it a random one is made at every start; sign-ins end when the server restarts anyway) |
| `$env:SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `PUBLIC_URL` | e-mails (registration, password reset, reminders) |
| `$env:ANTHROPIC_API_KEY="sk-ant-..."` | AI: analyse imported documents into articles, write quiz questions |
| `$env:DATA_FILE`, `AUDIT_FILE`, `REC_DIR` | use another copy of the data, audit log or recordings folder (for testing; normally leave them out) |
| `$env:TRUST_PROXY` | which proxy may tell the app the visitor's address. Default `loopback` = only the Cloudflare tunnel running on this computer. Use `1` behind one hosted proxy |
| `$env:NODE_ENV="production"` | on a server for customers: "Reset data" and "Refresh seed.js" are switched off, and e-mails are never printed in the terminal. `$env:DEV_TOOLS="1"` switches the two tools back on |
| `$env:TZ="Europe/Sofia"` | the time zone of attendance and time off. On your PC it is already Sofia; set it on any hosted server |
| `$env:BACKUPS_DIR`, `$env:NO_SCHEDULE="1"` | another backups folder; switch off the jobs that run by themselves (used by the tests) |

Sign-ins end after 12 hours without use, and when the password is changed or reset (changing your own password keeps you signed in where you are). The security audit of October 2026 is in `docs/audit/`.

### Design
All colours, fonts, spacing, corners and shadows are set once at the top of `public/css/app.css` (the "tokens"): charcoal `#171717` for structure, orange `#FF6B00` for the main actions, yellow `#FFD447` for highlights, coral `#FF6F91` for small details, off-white `#F7F7F5` pages and white cards. Change a token there and every page follows. Light and dark mode both work, and My account > Appearance still offers the other colour themes (Sport is the default). Icons are drawn as lines in `core.js` (no emoji).

### Pop-up preferences (My account > Notifications & Confirmations)
- **Welcome message and tips** ("How it works" boxes, the scoring tip on QA Entry): each has "Don't show me this again", and one switch turns all of them off.
- **Routine confirmations**: only moving an agent to another team and deleting one of your own notifications. They have "Don't ask me again"; when switched off they happen straight away and an **Undo** button stays for a few seconds.
- **Always shown, cannot be switched off**: error messages, problems with the connection or permissions, every question before deleting a record, unsaved-changes warnings, password / account / access changes, resolving a dispute, changing a review's score.
- "Reset dismissed messages" and "Restore default settings" bring everything back. Preferences are saved with each person's account (`prefs` in `data.json`), so they are the same on every browser and never affect another person. The list of messages that may be hidden is in `public/js/prefs.js`.

### Languages (English, Български, Français)
Pick the language on the sign-in screen or in My account > Language. The whole app switches at once, and the choice is saved with each person's account (`prefs.lang` in `data.json`). People with no saved language get English. Names, comments, articles and other things people typed are not translated. The translations are in `public/js/i18n/bg.js` and `fr.js`, and the glossary and rules are in `docs/i18n-glossary.md`. Open the app with `?i18n=debug` to outline any text that has no translation yet.

### Folders
`server.js` (accounts, teams, reviews) · `routes-work.js` (tasks, coaching, calibration) · `routes-learning.js` (knowledge base, quizzes) · `bootstrap.js` (starting teams, test users, skills, workspaces) · `routes-setup.js` (skills, workspaces, root causes, Auto QA categories) · `routes-autoqa.js` / `autoqa.js` (Auto QA) · `scorecard.js` (scoring rules) · `ai.js` · `public/` (the web app: `css/app.css` the design, `js/prefs.js` the pop-up preferences, `js/modals.js` all pop-ups) · `test/` (automatic tests). The full map is in `docs/ARCHITECTURE.md`.

### Team rules
- Everyone belongs to a team and every team has a leader. Admins, QA, team leads and trainers are always in the **Administration** team; agents are in **B2B** or **B2C** (you can add or remove teams in Admin > Teams).
- `node adduser.js` follows this: staff go to Administration automatically, an agent needs `--team=t-b2b` or `--team=t-b2c`.
- After copying new files: restart the server, run `node seed.js` if you want the saved data back, and press Ctrl+F5 in the browser.

### Reset data
Admin > the gear (System Settings) > "Reset data" puts all data back to the copy saved in seed.js. The data from before is kept in data.backup.json.
