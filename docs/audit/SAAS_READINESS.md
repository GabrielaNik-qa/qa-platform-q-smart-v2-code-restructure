# Q-SMART – SaaS readiness

Audit date: 2026-10-24 (rounds 1 and 2) · Target: contact centres with 50–500 agents, several independent customer companies

**Verdict: not ready for paying customers yet.** The app works well for one organisation on one computer.
Selling it to independent companies needs the four blockers below fixed first. All of them are architecture work, not bug fixes.

## 1. Multi-tenancy (separate customer companies) – BLOCKER

- **Today:** there is one organisation per server. There is no company or "tenant" concept anywhere in the data, the routes or the sign-in.
  - **Workspaces** split teams *inside* one company, and admins always see all of them.
  - Catalogs (skills, languages, root causes, categories), the knowledge base, quizzes, newsletters, settings, e-mail templates and backups are shared by everyone on the server.
- **What it needs:**
  - A `companyId` (tenant id) on every record and every user.
  - The tenant taken from the signed-in session, never from the browser.
  - Every query, report, export, backup, scheduled e-mail, AI call and audit-log entry limited to that tenant.
  - Tests that sign in as company A and try to reach company B through every route.
  - Do this **as part of the SQLite move** (below), not as an extra field in today's JSON file.
- **Simplest safe alternative while the customer count is small:** one separate server process, data folder and sub-domain per customer. That is real isolation with no code change, but more hosting work.

## 2. Authentication and authorisation

| Item | Status |
|---|---|
| Password hashing (bcrypt) | Ready |
| New session id at sign-in, HttpOnly / SameSite cookies, 12-hour idle timeout | Ready (timeout added in this audit) |
| Sessions end when the password is changed or reset | Ready (added in round 2) |
| Password-guessing limits per address and per account, also for "change password"; "forgot password" e-mails limited per account | Ready (added in this audit) |
| E-mail verification at registration | Missing (part of R-2) |
| Server-side role checks on every route | Ready (permission matrix in SECURITY_AUDIT.md) |
| Workspace rules | Mostly ready. Some modules are still organisation-wide (R-6) |
| **First password for new accounts** | **BLOCKER (R-2)**: every new, approved or reset account gets `password`, sent by e-mail. Replace with a one-time invitation / reset link |
| Password rules | Weak (6 characters). Raise to at least 8 (better 12) and check against breached-password lists |
| Two-factor sign-in, single sign-on (Microsoft / Google) | Missing. Expected by contact centres of this size; MFA at least for admins |
| Session store | In memory: lost at restart, one process only (R-4). Move to SQLite or Redis |

## 3. Data protection and privacy (GDPR)

The app processes **employee performance data**: scores, disputes, improvement plans, coaching notes. It may also process **customer data**: call recordings, chat and e-mail text, lead IDs. The customer company is the controller; Q-SMART would be a processor. Needed before launch:

- **Legal:** a data processing agreement (DPA), a list of sub-processors (hosting, e-mail provider, Anthropic for AI), and an EU data location decision.
- **Retention:** nothing is deleted automatically today. Define and implement retention for reviews, recordings, transcripts, the audit log and backups.
- **Erasure and access:** deleting a user keeps their reviews (with their name). There is no "export everything about this person" function.
- **AI:** transcripts and documents are sent to the Anthropic API when AI is switched on. Customers must be told and must be able to switch it off. AI scores are suggestions; keep a human reviewer in charge of consequential decisions. Today a reviewer can correct each Auto QA score, and the correction is saved separately, together with who made it.
- **Encryption:**
  - In transit: HTTPS through Cloudflare.
  - At rest: none. The data file, recordings (in a Documents folder) and backups are plain files. Use encrypted disks or volumes in hosting.
- **Secrets:** keys are read from environment variables (good). `seed.js` in Git contains the full data, including password hashes (R-5); it must not ship to customers.

This list is a technical view only. It is **not** legal advice and does not prove GDPR compliance.

## 4. Deployment and infrastructure – BLOCKER (database)

| Item | Today | Needed |
|---|---|---|
| Database | One JSON file, read in full on every request, single process | SQLite (planned), later PostgreSQL. Transactions, indexes, a migration script that keeps today's data |
| Sessions | In memory | Persistent store |
| Several server instances | Not possible (lost updates, memory sessions) | After the database move |
| Configuration | Environment variables (`PORT`, `SECRET`, `SMTP_*`, `ANTHROPIC_API_KEY`, `DATA_FILE`, `TRUST_PROXY`, …) | Add `NODE_ENV=production`; refuse to start without `SECRET` in production |
| HTTPS | Cloudflare tunnel | Add HSTS (Cloudflare setting); keep `TRUST_PROXY` matching the real proxy |
| Health check, graceful shutdown | None | `/healthz` route; finish requests and flush the audit log on SIGTERM |
| Logging and errors | Console only; no request ids | Structured logs, an error tracker (e.g. Sentry), no personal data in logs |
| Rate limits | In memory, per process | Shared store after scaling |
| Content-Security-Policy | None (inline handlers) | Refactor the inline `onclick` handlers, then a strict CSP |

## 5. Backup and recovery

- **Today:**
  - Admins can take, download, upload and restore backups (full JSON copies, kept next to the app).
  - A safety copy is taken before every restore.
  - Nothing is scheduled, nothing is copied off the machine, and restores are not tested regularly.
- **Needed:**
  - Automatic daily encrypted backups to another location, with a retention period.
  - A tested restore procedure.
  - A per-customer restore (after multi-tenancy).

## 6. Monitoring and incident response

- **Today:** the audit log of changes and sign-ins (admins only, last 5,000 entries). Nothing else.
- **Needed:**
  - Uptime monitoring.
  - Error alerts.
  - Security alerts (many failed sign-ins).
  - A written incident-response and breach-notification procedure (GDPR: 72 hours).
  - A support contact for customers.

## 7. Scalability (measured in round 2)

Made-up data for 500 agents was put on a throw-away server, and requests were sent one at a time (no stress test):

| Data | `data.json` | Every request (even the smallest) | Saving any change | Reviews list sent to an admin's browser |
|---|---|---|---|---|
| ≈ 3 months (3,000 reviews) | 18.5 MB | ≈ 0.1 s | ≈ 1.0 s | 9 MB |
| ≈ 1 year (12,000 reviews) | 73 MB | ≈ 0.4 s | ≈ 1.7 s | 36 MB |

The server serves one request at a time, so with dozens of people working, these delays add up quickly. **The SQLite move (with indexes and server-side paging of the reviews list) is required before the target size.** A larger customer may later need PostgreSQL.

## 8. Dependencies and supply chain

- **Good:** all 256 locked packages come from the official npm registry with integrity hashes, and none runs an install script.
- **Watch:** the Excel library (`exceljs`) looks unmaintained and brings 6 deprecated packages (R-22).
- **Process:** before launch, add an automatic dependency check (Dependabot or `npm audit` in CI) and a licence review.

## 9. Subscriptions and usage

Not implemented: no plans, seat counts, billing or usage limits. No payment provider was added (out of scope). Write the requirements first: seats per company, AI usage per plan, and trial handling.

## Production-readiness checklist (in order)

1. [ ] **SQLite migration** keeping all current data, with persistent sessions and transactions (R-3, R-4)
2. [ ] **Tenants:** company id on every record; every route limited by the session's company; cross-company tests (R-1)
3. [ ] **Invitation links instead of the default password, and e-mail verification at registration** (R-2); stronger password rules; MFA for admins
4. [ ] Remove the real data and hashes from `seed.js` in Git, check the repository is private, and change the two real passwords if it was ever public (R-5)
5. [ ] Finish workspace rules for the remaining modules (R-6)
6. [ ] Production settings: required `SECRET`, `NODE_ENV`, HSTS, health check, graceful shutdown, structured logs, error tracking
7. [ ] Automatic encrypted off-site backups and a tested restore
8. [ ] Retention and deletion rules, a DPA, a sub-processor list, an AI opt-out per customer, self-hosted fonts (R-24), allowed report recipients (R-23)
9. [ ] CSP after removing inline handlers; ESLint in the project
10. [ ] Automated browser (end-to-end) tests for the main workflows
11. [ ] **Independent penetration test** on the staging environment before the first paying customer

## Round 3 (26 October 2026)

- The questions that need a decision before the SQLite step (one database per company or one shared database, the sign-up of a new company, AI models, voices and budgets) are explained in plain words in **DECISIONS_FOR_YOU.md**.
- Developer tools that must be switched off for customers: R-26.
- Access control was tested route by route for every role (TEST_RESULTS, round 3). It is a good base for adding the company boundary (tenant) on every route in the SQLite step.

## Round 4 (28 October 2026)

### What changed for a commercial launch

- **Isolation:** the AI and Q-Intelligence features now follow the workspace rules (S-29, S-30). The role matrix covers every route, including the AI ones it skipped before.
- **Production switches:**
  - With `NODE_ENV=production`, "Reset data" and "Refresh seed.js" are off unless `DEV_TOOLS=1`, and e-mails are never printed (R-26, R-9).
  - `GET /api/health` answers a monitor.
  - Ctrl+C or a stop writes the last audit entries.
- **Browser protections:** a Content-Security-Policy (still with `'unsafe-inline'`), a Permissions-Policy and an Origin check.
- **Uploads:** recordings must be real audio; Word files are checked for "zip bombs".
- **Privacy:** the personal data download is complete (F-14); failed sign-ins never keep typed text (R-25).
- **Tests a buyer can run:**
  - `npm.cmd test`: 210 tests, including a speed budget.
  - `npm.cmd run test:e2e`: 14 browser tests.
  - `npm.cmd run lint`.
- **Measured at the target size** (PERFORMANCE_AUDIT.md), one year of 500 agents (449 MB):
  - 2–5 s per request
  - 6–9 s per save
  - up to 2.5 min when 20 people save at once
  - the file is close to the largest text Node.js can build

### Launch blockers (updated checklist)

| # | Blocker | Status |
|---|---|---|
| 1 | Separate companies (tenants) on every route and in the data (R-1) | Open |
| 2 | No default password: an invitation link and e-mail verification (R-2) | Open (your decision) |
| 3 | SQLite instead of `data.json`, with sessions in the database (R-3, R-4) | Open (planned next, CLAUDE.md) |
| 4 | **The server's time zone** (F-16): `TZ=Europe/Sofia` in the hosting set-up, later per company | **New**, open (your decision, V1) |
| 5 | `seed.js` with only made-up data; check that the GitHub repository is private (R-5) | Open |
| 6 | MFA for admins, and longer passwords (R-8) | Open (your decision) |
| 7 | A strict CSP after moving the 989 inline handlers (R-7) | Partly done |
| 8 | Fonts served by the app (R-24), and the audit log without full IP addresses (R-9) | Fonts: **done** (28 October). IP addresses: open |
| 9 | An independent penetration test on a staging copy (with ZAP), and a malware scan of uploads | Open |
| 10 | Phone support for agents, if agents are expected to check in from phones (F-17) | Open (your decision, V2) |

Not blockers for today's personal use: everything above is about selling the app to other companies.
