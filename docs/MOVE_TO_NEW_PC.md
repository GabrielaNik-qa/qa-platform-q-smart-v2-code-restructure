# Moving Q-smart v2 to another PC

## What is already on GitHub
All the code, the plan, the release notes, the patent folder, your notes, and (by your decision of 5 November) `current-app/data.json`, `audit.json` and `.qsmart-key`.

## What Git leaves out on purpose
1. `node_modules` and `dist`: rebuilt on the new PC.
2. `.env` (database, Firebase and AI keys): copy it by hand (USB stick or a password manager) or create it again from `.env.example`. Never put it on GitHub.
3. The v2 demo database (in `%LOCALAPPDATA%\qsmart-v2`): created fresh on the new PC. Demo accounts `*@demo.test` (password `password`) come back from the seed; test data made by hand does not travel.
4. AI keys entered in the owner area: they are stored in the database, so enter them again.

## Steps on the new PC
Use a short folder outside OneDrive, for example `C:\dev`, to avoid long-path problems.

1. Install Git, Node.js (the version in `package.json`) and VS Code.
2. In PowerShell:
   - `git clone https://github.com/GabrielaNik-qa/qa-platform-q-smart-v2-code-restructure.git`
   - `cd qa-platform-q-smart-v2-code-restructure`
   - `git checkout <the newest branch, for example v2-phase-7>` (or stay on `main` for the last finished phase)
   - `npm.cmd install`
   - `npm.cmd run build`
3. Copy your `.env` into the folder (next to `package.json`).
4. Double-click `Start Q-smart v2.cmd`, or run `npm.cmd run dev`. The pages open on port 5173, the API runs on 3200.
5. Check everything with `npm.cmd run check`.
6. Today's app (if you still need it): your settings first, then `cd current-app` and `node server.js` (port 3100).

## Afterwards
Change the keys and passwords kept in the repository (see CLAUDE.md, "Secrets"), as you planned.
