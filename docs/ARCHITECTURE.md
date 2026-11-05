# How Q-smart is built

A map of the code: which file does what, and where to look when something must change. Written on 3 November 2026.

## In one picture

```
Browser (public/index.html + public/js/*.js)        Help Center website (public/hc/)
        │  fetch('/api/…')                                   │  fetch('/api/hc…'), no sign-in
        ▼                                                    ▼
server.js: security of every request → which data file → the routes-*.js files
        │
        ▼
data.json (the real data)   or   sandbox.json (an admin inside the sandbox)
```

- **One server process** (Node.js + Express). `npm.cmd start`, port 3100 on this computer, shared through the Cloudflare Tunnel.
- **The data** is one JSON file. Every request reads it, and every change writes a new copy and swaps it in, so a crash never leaves half a file.
- **The pages** are plain JavaScript files loaded by `public/index.html`. The part after `#` in the address picks the page (`#dash`, `#calls`, …), and every page is a function `PG.<name>()` that returns its HTML.

## The server

| File | What it does |
|---|---|
| `server.js` | Start-up and the security of every request: headers, sign-in check, CSRF, size limits, the sandbox switch. Also the data file, e-mail, notifications and the shared helpers. |
| `routes-account.js` | Sign-in, sign-out, profile, password, preferences, registration, forgot / reset password. |
| `routes-people.js` | Teams and user accounts. |
| `routes-reviews.js` | Reviews, disputes, scorecards, the Excel export of reviews, call recordings. |
| `routes-work.js` | Tasks, coaching and one-to-one sessions, calibrations, quick flags, practice-call results. |
| `routes-more.js` | Reports, planning, performance, compliance & CX, backups, the small settings and lists (`/api/c/<list>`), Contact support. |
| `routes-learning.js` | Knowledge Base, quizzes, newsletter, import of articles, ZIP export. |
| `routes-ai.js` | AI settings and keys (encrypted), the AI reviewer, team lead, trainer, analyst, and the Call Simulator scenarios. |
| `routes-autoqa.js`, `autoqa.js` | AutoQA: conversations rated by rules. |
| `routes-wf.js`, `routes-att.js`, `routes-today.js`, `routes-cap.js`, `wf.js`, `cap.js` | Workforce: calendars and shifts, attendance and time off, Team today, capacity planning. |
| `routes-org.js` | Organization: company profile, how long data is kept, purge. |
| `routes-setup.js` | Skills, languages, workspaces, categories, root causes. |
| `routes-hc.js`, `hc-default.js` | The public Help Center website and its starting articles. |
| `routes-platform.js`, `sandbox-data.js` | Sandbox, Import data. |
| `sim.js` | Call Simulator rules: segments, levels, written customers, indicators, the score. |
| `scorecard.js` | The default scorecard and the scoring of a review. |
| `audit.js` | The audit log (who changed what). |
| `ai.js` | Talks to Claude, only when a key is set. |
| `bootstrap.js`, `seed.js`, `adduser.js` | The first teams and users, the saved starting data, and a command to add a user. |

**How a route file looks:** `module.exports = ({ app, load, save, need, … }) => { app.get('/api/…', need('admin'), (req, res) => { … }); }`. The `need(...)` part says who may call it, and the server checks it again on every request.

## The pages (public/js)

| Area | Files |
|---|---|
| Start-up, menu, router, search | `main.js`, `pages.js` (menu groups, coming-soon pages, who sees what), `core.js` (shared state, helpers, `api()`, forms) |
| Quality | `entry.js` (score a review), `reviews.js`, `flags.js`, `scorecards.js`, `analytics.js`, `dashboards.js`, `widgets.js` |
| People and coaching | `agents.js`, `work.js`, `o2o.js`, `perf.js`, `tasks.js`, `planning.js` |
| Learning | `learn.js`, `kbcf.js` (Knowledge Base like Confluence), `md.js` (safe Markdown) |
| AI | `aiteam.js`, `autoqa.js`, `callsim.js` (Call Simulator), `org.js` (Q-Intelligence) |
| Workforce | `workforce.js`, `attendance.js`, `today.js`, `capacity.js` |
| Admin | `admin.js`, `admin2.js`, `registers.js` (governance), `platform.js` (sandbox, import, beta), `tools.js`, `support.js`, `hcedit.js` |
| Help | `help.js` (FAQ, glossary, videos, tours) |
| Shared | `modals.js` (pop-ups), `tablekit.js` (filters and columns), `reports.js` + `rpt-engine.js`, `loader.js`, `prefs.js`, `personalize.js` |
| Languages | `i18n.js` and `i18n/bg.js`, `i18n/fr.js` |

The Help Center website is separate: `public/hc/index.html`, `hc.js`, `hc.css`. It has no inline click code, so a strict security policy will fit it as it is.

## Rules the code follows

- **Never trust the page:** every check is done again on the server (roles, workspaces, scores, file types).
- **Texts are written in English** and translated with `tr()`. `npm.cmd test` lists every text without a Bulgarian or French translation.
- **Test before saying it is done:** `npm.cmd test` (server, about 240 tests), `npx.cmd playwright test` (browser, 26 tests), `npm.cmd run lint`.
- **The real data is never used by the tests:** they start their own copy with made-up people (`test/fixture-round4.js`).
- **The sandbox:** an admin inside it reads and writes `sandbox.json` only. E-mail, the audit log, backups and the developer tools are off there.

## Known limits (planned)

- The pages still use inline `onclick="…"`, so the security policy allows inline scripts. This changes after the move to a real database (decision 18).
- All the page scripts share one set of names (no modules or bundler). `npm.cmd test` checks that no name is declared twice.
- The Firebase version will be a new repository (see CLAUDE.md). This version stays as the working reference, and its tests describe how Q-smart must behave.
