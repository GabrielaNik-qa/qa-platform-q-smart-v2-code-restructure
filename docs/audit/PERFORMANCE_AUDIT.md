# Q-SMART – Performance audit

Round 4 · 28 October 2026 · Branch `q-smart-v1-audit` · Measured only on made-up data, on copies. The real `data.json` was never used.

## How it was measured

- **Computer:** this Windows 11 laptop, Node.js 24.11.0, with Windows' own virus scanner switched on (as it normally is).
- **Script:** `node test/measure.js <folder>`. It copies the folder's `data.json` into a new temp folder, starts the app on the copy, signs in as admin, QA, team lead and agent, and times the requests the main pages make. Then it times a save and **20 saves at the same moment**, and checks that all 20 were kept.
- **Normal size:** the round-4 copy of `seed.js`. That is 4.5 MB, 17 people and 842 reviews: about what the app holds today.
- **Large size:** `node test/gen-large.js <folder>` makes a year of a 500-agent contact centre:
  - 530 people (500 agents and 30 staff) in 2 workspaces
  - 75,000 reviews (150 per agent)
  - attendance for every working day, 2,000 time-off requests, 6 weeks of rota
  - 48 capacity plans (12 months), 3,000 tasks, 2,000 coaching sessions
  - 200 articles, 50 quizzes and 20,000 CSAT answers
  - The file is **449 MB**. That is realistic: a real review here takes about 5 KB.
- **Times:** the middle of 3 runs (normal size) or one run (large size). "KB" is what travels over the network (after the change, gzipped).

## Normal size (4.5 MB) – before and after

| Request | Before: ms | Before: KB | After: ms | After: KB |
|---|---|---|---|---|
| Server ready | 1,560 | | 1,051 | |
| `GET /api/me` (any role) | 24–31 | 0 | 24–36 | 0 |
| `GET /api/evaluations` (admin / QA / lead) | 49–61 | **2,208** | 73–104 | **98** |
| `GET /api/evaluations` (agent) | 26 | 179 | 28 | 9 |
| `GET /api/wf/today` (lead) | 48 | 2 | 45 | 2 |
| `GET /api/att/month`, `/api/leave/calendar`, `/api/cap`, `/api/wf/rota` | 23–26 | 0–7 | 22–28 | 0–7 |
| `GET /api/att/report` | 49 | 6 | 39 | 6 |
| `GET /api/tasks` | 25 | 18 | 35 | 2 |
| `POST /api/evaluations` (save a review) | 379 | | 374 | |
| `POST /api/att/punch` (check in) | 374 | | 385 | |
| 20 saves at the same moment | 7,707 in all, 20 of 20 kept | | 7,259 in all, 20 of 20 kept | |
| Server memory | 169 MB | | 168 MB | |

**The first visit** (the page, 38 scripts and the styles): **1,600 KB → 499 KB**. Later visits ask "has it changed?" for each file and get a short "no" (304).
**On this computer** the gzipped list takes 25–45 ms longer to make than it saves. **Through the Cloudflare tunnel** (or any real network) it is much faster: 2.2 MB takes about 1 s on a 20 Mbit/s line, and 98 KB about 0.04 s.

### Where a save's time goes (normal size)

| Step | ms |
|---|---|
| read `data.json` | 10–19 |
| `JSON.parse` | 16–23 |
| `JSON.stringify` (with indentation, as saved) | 19–38 |
| **write the 4.5 MB file** | **285–304** |
| rename (the safe swap) | 1–3 |

The write is slow because **Windows' virus scanner checks every new file**. The same bytes written again to an unchanged file took 5 ms. Writing 4.5 MB of zeros took 6 ms. Writing without indentation (2.3 MB) still took 241 ms.

So the time is the scanner, not the code. Excluding the data folder from scanning would be a security setting on this computer: it was **not** changed, and it is listed as a question in DECISIONS_FOR_YOU.md. SQLite writes only the changed part of the file, which removes most of this cost.

## Large size (449 MB, one year of 500 agents) – before and after

| Request | Before: ms | Before: KB | After: ms | After: KB |
|---|---|---|---|---|
| Server ready | 984 | | 973 | |
| `GET /api/me` | 2,170–4,284 | 0 | 2,261–9,595 | 0 |
| `GET /api/settings` | 2,680–11,972 | 3 | 2,166–2,789 | 3 |
| `GET /api/evaluations` (admin) | 3,956 | **201,039** | 5,331 | **2,738** |
| `GET /api/evaluations` (QA, lead) | 3,327–4,961 | **100,498** | 3,852–4,445 | **1,439** |
| `GET /api/evaluations` (agent) | 2,147 | 402 | 2,718 | 11 |
| `GET /api/wf/today` (lead) | 4,844 | 37 | 5,407 | 2 |
| `GET /api/att/report` | 3,079 | 188 | 4,424 | 7 |
| `GET /api/c/surveys` | 2,658 | 2,479 | 3,163 | 181 |
| `POST /api/evaluations` (save a review) | 5,753 | | 6,690 | |
| `POST /api/att/punch` (check in) | 9,049 | | 7,446 | |
| 20 saves at the same moment | 163,681 in all, 20 of 20 kept | | 155,699 in all, 20 of 20 kept | |
| Server memory | 890 MB | | 1,573 MB | |

What this shows:
- **Every request takes 2 to 5 seconds** at this size, whatever it asks for, because the whole 449 MB file is read and parsed each time. One save takes **6 to 9 seconds**, and nobody else is served meanwhile. 20 people saving at the same moment wait up to **2.5 minutes**. Nothing is lost or corrupted (20 of 20 kept), but the app is **not usable** at this size. Single runs vary a lot (one `GET /api/me` took 9.6 s), so read the times as "seconds", not exact values.
- **What travels over the network** became 40 to 70 times smaller. The admin's reviews list went from 201 MB to 2.7 MB, which the browser can now actually download through the tunnel.
- **Memory** rose from 890 MB to 1,573 MB, because gzipping a 200 MB answer needs room. Only the admin's full reviews list is that big. Paging that list (see below) removes it.
- **The file is close to a hard limit.** Node.js cannot build a text longer than 536,870,888 characters (checked on this computer: `buffer.constants.MAX_STRING_LENGTH`). The indented `data.json` of a slightly bigger organisation (about 540 MB, for example 600 agents) could not be saved at all: the save would fail with "Invalid string length". The data would not be broken (the old file stays), but no change could be saved any more. This makes R-3 a launch blocker, not only a speed problem.

## What was changed in round 4 (small, safe, measured)

1. **gzip compression** of every answer over 8 KB (API) and of the page's own files. It uses `zlib`, which is part of Node, so nothing new is installed. The scripts are gzipped once and kept in memory until the file changes. The browser still checks for a new version every time (ETag), so a change to a script is always picked up at once. Long-term caching with versioned file names was **not** turned on: if `?v=` were ever forgotten, people would keep an old script for a year.
2. **The reviews list reads the recordings folder once** per request, instead of checking the disk once per review with a recording. This matters when every review has a recording (75,000 disk checks become one).
3. **A speed check** in `npm.cmd test` (`test/speed.test.js`):
   - Data: 50 agents and 1,000 reviews.
   - Limits: every page's data under 1.5 s, a save under 3 s, and 20 saves at the same moment all answered and kept.
   - The limits are about 5 times what this laptop needs today, so the test fails only when something became **much** slower.

**Not changed, and why:**
- **Keeping the data in memory between requests:** every route changes the object it loads and saves it. A shared copy could serve a half-made change after a failed request, so this is only safe with a real database.
- **Paging the reviews list on the server:** it would change how the Reviews page and the dashboards load their data, which is a design change. It is part of the SQLite plan.
- **Loading page scripts only when their page opens:** `loader.js` loads them all at start, and the pages share names across files. Splitting them is a refactor with a high risk of breaking pages.
- **The fonts served by the app (R-24):** done after your yes (V3, 28 October).
  - A first visit in a fresh browser downloads **8 font files, 163 KB** in English (13 files, 219 KB in Bulgarian), all from the app. Before, about the same was downloaded from Google.
  - The font files are kept by the browser for a year (they never change), so later visits ask for none of them.
  - The 66 files (1.1 MB) cover every character set; the browser picks only those a page needs.

## Speed budget (proposal)

| What | Target | Today, normal size | Today, large size |
|---|---|---|---|
| Any page's data | under 300 ms | 22–104 ms ✓ | 2–5 s ✗ |
| A save | under 300 ms | 375 ms (the virus scanner) ~ | 6–9 s ✗ |
| Every page usable on a normal laptop | under 2 s | about 0.3 s (first load 233 ms in the browser) ✓ | not usable ✗ |
| First visit download | under 600 KB | 499 KB ✓ | 499 KB ✓ |
| 20 saves at the same moment | all kept, under 5 s | 7 s, all kept ~ | 156 s, all kept ✗ |

## The SQLite plan (from the measurements)

The JSON file cannot reach the target size: a whole-file read on every request (2–5 s), a whole-file write on every change (6–9 s), one save at a time, and the limit of 536,870,888 characters. Planned in CLAUDE.md, in this order:

1. **One table per collection** (users, teams, evaluations, items of an evaluation, att, leaves, …), with indexes on the fields the routes filter on: `agent`, `team`, `date`, `workspace`, `status`.
2. **Reads ask only for what a page needs:** the reviews list paged and filtered on the server (for the admin today: 75,000 rows, 201 MB); Team today only for the teams shown.
3. **Writes in a transaction:** only the changed rows, so a save takes milliseconds and never blocks the readers (SQLite's WAL mode).
4. **Sessions in SQLite** (R-4), so a restart does not sign everybody out.
5. **Migration:** a script that reads today's `data.json` into the new tables, checked by counting every collection before and after. The JSON export stays as the backup format.
6. **The same tests:** the 205 tests, the browser tests and `test/measure.js` run unchanged against the new store. Then the budget above becomes a hard limit.

Expected on the large data set: page data in tens of milliseconds and saves in a few milliseconds. These are expected values, not measured: measure them again after the move.
