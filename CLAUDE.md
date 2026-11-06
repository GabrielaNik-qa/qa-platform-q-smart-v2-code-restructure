# Q-smart v2: multi-company SaaS for contact-centre quality (in development)

- **The plan is `docs/V2_PLAN.md`.** Follow it, and ask before changing any decision in it.
- **Today's app is the starting point.** Its files are in this repository: a Node.js + Express server, data in `data.json`, plain JavaScript pages in `public/js`, port 3100, shared with Cloudflare Tunnel. What it does, and its tests in `test/`, are the checklist for v2. In Phase 0 it moves into `current-app/` so v2 can be built next to it.
- **Past decisions** are in `docs/audit/DECISIONS_FOR_YOU.md`. They stay decided unless the plan changes them.
- **Branches:** work happens on `qa-platform-q-smart-v2-code-restructure`. Finished, tested work is merged into `main`.
- **I am not a programmer:** explain changes in simple words, and test before saying it is done (automatic tests, then a check in the browser as every role).
- **Windows / PowerShell:** use `npm.cmd`. This folder is in OneDrive by Gabriela's choice; if OneDrive or the long path blocks a tool, say so.
- **Roles:** admin, reviewer (called qa in today's app; renamed for v2 on 5 November), lead, trainer, agent. Everyone belongs to a team; staff are in Administration. Made-up test users have the password `password`.
- **Stack (v2):** TypeScript everywhere · React + Vite pages · NestJS server · PostgreSQL on Neon (EU) · Firebase Authentication · Firebase Hosting + Cloud Run (europe-west1, when online).

## Rules that are never broken
- **Company wall:** every table has `company_id`; PostgreSQL row-level security; every route is permission-checked on the server; tests try to reach another company's data.
- **One shared database for all client companies.** Separate databases only for separate purposes (demo, tests), or for a big client who pays for its own.
- **Secrets:** by Gabriela's decision of 5 November, this public repository holds everything, including `data.json`, `audit.json`, `.qsmart-key`, `docs/patent/` and her notes in `notes/`. She will change those keys and passwords after moving to her own PC, so don't remove or rewrite those files. New v2 secrets in `.env` (database, Firebase, AI keys) stay out of Git, because they will protect clients' data. Clients' keys are stored encrypted.
- **Call recordings are never stored.** Only transcripts, which are deleted after the number of days the company chose.
- **AI:** only AI plans marked `no-train-dpa`, for the demo and for clients alike (Gabriela's decision, 5 November). AI reviews count on their own, without a person checking each one. They are marked as AI, their accuracy against reviewers' scores is measured and shown, agents can dispute them (a person then decides), and pay, bonuses, warnings or dismissal never rest on AI reviews alone.
- **Languages:** every text in English, Bulgarian and French.
- **Costs:** €0 until the first paying client. Ask before anything that costs money.
- **No employer name:** the name of the company Gabriela works for never appears in the app, the sites or this repository (her boss's wish, 5 November). The brand is Q-smart, and demo companies are made up.
