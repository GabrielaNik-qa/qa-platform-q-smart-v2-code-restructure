# Q-SMART – Localization audit (English, Bulgarian, French)

Round 4 · 28 October 2026 · Branch `q-smart-v1-audit` · Rules: `docs/i18n-glossary.md`.

## How it was checked

- **The page texts:** `test/i18n.test.js`, as before. Every English text in the page code has a Bulgarian and a French entry, and both languages have the same keys and placeholders.
- **The server's messages (new):** `test/i18n-server.test.js`. Every fixed message the server sends (errors in a toast, notifications in the bell) and 36 real examples of messages with values must have both translations, with the values kept.
- **In the browser:**
  - Every page of the admin (68) was opened in Bulgarian with `?i18n=debug`, and `I18N.missing()` was read.
  - The sign-in screen, the language saved with the account, and French were checked by `test/e2e/signin-pages.spec.js`.
- **Duplicates:** ESLint (`no-dupe-keys`) on the language files.

## What was found and fixed

| Finding | Before | After |
|---|---|---|
| Server messages without a translation | **96** (of 438 server messages found) | **0**. Added: 78 fixed texts and 18 texts with values (kudos, flags, signed one-to-ones, chat / e-mail / conversation reviews, "partly changed" disputes, the employee ID and username messages…) |
| Screen-reader names of the check boxes in tables (Roles & permissions, Notification rules…) | **258** names such as "A new review – Admin" stayed English in Bulgarian and French | **0**. The name is now built from the translated row and column ("Нова оценка – Администратор", "Tableau de bord – Administrateur") |
| AutoQA subtitle | The text was reworded and its old translation no longer matched, so it showed in English | Translated |
| The theme button's tooltip ("System mode — click to change") | English | Translated (Light, Dark and System) |
| The same English key twice in a language file (the second one is the one used) | 8 in `bg.js`, 7 in `fr.js` | 0. The first copy was removed, so nothing changed on screen |
| New messages of this round (security fixes) | – | Translated: links must be https, not a real recording, Word file too large or damaged, developer tools off, requests from other websites, AI answer unreadable |
| The example texts, tooltips and screen-reader names of the **24 multi-line text boxes** (for example "Explain why you want to dispute this review…") | Always English: the language layer skipped these boxes completely, to protect what people type in them, and that also skipped their labels. Their translations existed but were never shown | Translated now; the box's contents are never touched ("Yes" typed in a box stays "Yes" in Bulgarian). Browser test: `signin-pages` › screen-reader names. (F-20, found on 28 October while doing V4) |
| The language test missed texts containing ";" or "&amp;" | The old AutoQA subtitle slipped through this way | **Fixed:** the test now reads sentences that go on after a ";" and reads `&amp;` as "&". It found one more untranslated heading, "Coaching & training" (Agents page), now translated |

After the fixes, the Bulgarian walk of the 68 admin pages lists **46 texts**. All of them are **data people typed**, which stays as typed on purpose:
- article, task, quiz and newsletter titles
- team names and scorecard names
- AutoQA keywords ("good morning", "take it or leave it")
- the example dispute message of the seed

## Texts for you to check

The translations added in round 4 follow the glossary, but nobody who speaks the language has read them yet. Please glance at them; they are easy to find in `public/js/i18n/bg.js` and `fr.js`, at the end of the main list and of the pattern list.

These had **two different translations** for the same English text. The one shown in the app today is kept; tell me if the other one is better:

| English | Bulgarian in use | Bulgarian removed | French in use | French removed |
|---|---|---|---|---|
| Yes, delete it | Да, изтрий я | Да, изтрий го | — | — |
| all time | за цялото време | за целия период | depuis le début | (same) |
| Still to do | Остава за изпълнение | Остават | Reste à faire | (same) |
| Required reading | Задължително четиво | Задължително четене | Lecture obligatoire | Lectures obligatoires |
| Quizzes passed | Издържани тестове | Взети тестове | Quiz réussis | (same) |

"Yes, delete it": a single text cannot fit both "го" (masculine) and "я" (feminine). If the confirmations are about different things (an article, a review), they need two different English texts. Say if you want that.

## Dates, numbers, sorting

- **Dates and month names** follow the language (`Intl` with bg-BG, fr-FR, en-GB): checked by `test/i18n.test.js` › dates. The week starts on Monday, and times are 24-hour.
- **Numbers stay in the English style** (`92.4%`). This is a known limit in the glossary.
- **Excel exports** use the US date format (`mm/dd/yyyy`) in every language. Recorded, and not changed: question in DECISIONS_FOR_YOU.md.
- **Plurals:** one / other forms for Bulgarian and French are checked by `test/i18n.test.js` › plurals (1 ден / 2 дни, 1 jour / 2 jours).
- **Sorting** uses `localeCompare`, so Ж, Щ, é and ç sort as letters. Search is case-insensitive. Not checked in round 4 with a dedicated test.
- **People's texts are never translated:** names, comments and articles stay as typed (the walk above confirms it).
- **The language is saved per person** and survives signing out (browser test).
- **E-mails** stay in English (a known limit in the glossary). The person's language does not reach e-mails yet: question in DECISIONS_FOR_YOU.md.
- **The AI** writes the morning brief in the team lead's language (checked in the code). The AI Simulator answers in the language the agent writes in. Not tested with a real AI.

## Not done in round 4

- Every page × every role × every language in the browser, with a visual check for cut or overlapping text. Done: the admin's 68 pages in Bulgarian with the debug list, the browser tests in all three languages, and the earlier rounds' layout checks.
- A layout check with the longest French texts in the icons-only menu, at every width.
