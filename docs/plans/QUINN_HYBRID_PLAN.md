# Quinn: hybrid assistant with as little AI as possible (plan, 4 November 2026)

Your brief asks for a plan before building. This is it: what exists today, what can be reused, how Quinn would answer, and what I need you to decide. Nothing below is built yet.

## 1. What exists today (checked in the code)

| Part | Where | Reuse for Quinn |
|---|---|---|
| **Ask Quinn** page: a chat where **every question goes to Claude** (the AI analyst) | `public/js/org.js` (`PG.qask`), `POST /api/ai/analyst` in `routes-ai.js` | Kept as the **Level 4** answer for questions about the numbers. The page itself stays. |
| AI key, model, **monthly budget**, the spend of the month | `routes-ai.js` (`ai-usage.json`, `budget`), `ai.js` (`PRICE` per model) | The budget check and the price table, extended per company, user and Quinn level |
| **FAQ** (questions and answers, topics, a page link) | `cs_faq` (help.js, `/api/c/faq`) | Becomes the first source of **predefined answers** (Level 1) |
| **Glossary** | `cs_gloss` | Answers "what is …?" without AI |
| **Help Center website** articles with a search | `routes-hc.js`, `public/hc/hc.js` | Becomes the **main knowledge source** (Level 2); its search is moved to the server and shared |
| Knowledge Base articles (per company, per team) | `routes-learning.js` | Searched too, but only the folders the person may see |
| The **menu** (every page, its name, who may open it) | `GROUPS`, `canRoute` in `pages.js` | **Navigation answers** ("where are my reports?") with a link, only to pages the person may open |
| **Contact support** requests | `/api/support` (routes-more.js) | The **human hand-over**: Quinn opens a request there, admins get a notification |
| Languages (English, Bulgarian, French) | `i18n.js`, `bg.js`, `fr.js` | Answers in the person's language; synonyms per language |

**Not in this version yet:** a Quinn chat bubble on every page, a hand-over to a person from the chat, an answer cache, intents with synonyms, and a dashboard of Quinn's AI use. (Your brief says "keep the existing escalation": that must be in another app, because this one has none yet. I will build it new, on top of Contact support.)

## 2. How Quinn will answer (the router)

Every message goes through one server-side router (`quinn.js`). It stops at the first level that gives a reliable answer:

```
message ─► clean (length, links, control characters) ─► language (bg / fr / en, from letters and common words)
        ─► "talk to a person"? ─────────────────────────► Contact support request          (no AI)
        ─► Level 1: intents (keywords, synonyms, phrasings) ─ confident? ─► predefined answer  (no AI)
        ─► Level 2: Help Center + FAQ + glossary + menu search ─ good enough? ─► excerpt + link  (no AI)
        ─► cache: the same general question answered before (same language, not personal)    (no AI)
        ─► budget left and AI on? ── no ─► best article found + "AI is not available right now"
        ─► Level 3: a small model (Haiku) picks the intent or the article, with a short context
        ─► Level 4: the main model, only for analysis, coaching, several steps, the person's own data
```

- **Confidence** is a number from 0 to 1 for each level. The thresholds can be changed by an admin (defaults: intents 0.75, Help Center 0.6). Below them, Quinn goes up a level rather than giving an unrelated answer.
- Keyword matching is never the final answer for long or combined questions (more than one question mark, or over 25 words): those go to Level 3.
- Every answer carries its **source and type** (`predefined`, `help`, `cache`, `ai-light`, `ai-advanced`, `human`), which is shown in small letters under the answer and counted.
- A question counts as **AI-free only if no AI was called at any point**, also not for language detection or search. Both of those are plain code.

## 3. Predefined answers (Level 1), managed by admins

One list of **intents**, kept in the data (not in the code):

```
intent: reports.find
  phrasings (en): where are my reports · how do I find reports · show me the reports section
  keywords + synonyms (en): report, reports, export, excel · (bg) отчет, отчети · (fr) rapport, rapports
  answer (en / bg / fr): "Your reports are in Reports › Saved & scheduled reports."  [Open Reports]
  actions: open page #rsaved · show 3 suggested questions
  roles: who may get it (an agent gets no link to a page they cannot open)
  active: yes / no
```

The match scores the words of the question against the keywords and synonyms, and the whole question against the phrasings. Matching is done without accents and case, with simple word endings (report / reports / reporting).

**Starting set (about 40 intents):**
- navigation to every main area
- password and account
- how to score a review, dispute, create a scorecard
- calibration, tasks, the Call Simulator, check-in and time off
- reports and exports
- contact support

The existing FAQ entries are turned into intents automatically.

## 4. Help Center search (Level 2)

- **One search index on the server**, built from the Help Center articles, the FAQ, the glossary, the menu and the Knowledge Base folders the person may see.
- **Ranking:**
  - the title counts most, then the keywords and tags, then the text
  - synonyms from the intents are used here too
  - results in the person's language come first
- **Kept up to date:** the index is rebuilt automatically when an article, FAQ or glossary entry changes, and the cached answers that came from it are cleared.
- **The answer:** the best excerpt (two or three sentences) with a link to the article. If two articles are close, both are shown.

## 5. Cache

- It keeps the **AI answers to general questions** (Level 3 and 4 without personal or company data). It is keyed by the cleaned question, the language and the role.
- **Never cached:** answers about a person, a team or the numbers of the company, and anything that contained names.
- **Expiry:** 30 days, which an admin can change. An entry is cleared at once when a Help Center article it used changes.
- With the planned database move, the cache is kept **per company**, so one company never sees another's answers.

## 6. Context, kept small

- **Quinn knows:** the page the person is on, their language, their role and what they may see.
- **The AI gets:**
  - the question
  - the last 3 messages
  - a running summary of at most 5 lines
  - only the articles or numbers that answer it
  - never the whole chat, and never data the person may not see (the same checks as the pages)
- **Prompt-injection protection:**
  - the person's text is always passed as data, never as instructions
  - Quinn cannot change settings or send anything; it can only answer and open a support request
  - what the AI writes is shown as text, never run

## 7. The Quinn bubble

- A round Quinn button at the bottom right of every page.
- It opens a small chat with **suggested questions** that fit the page you are on (for example, on Reviews: "How do I dispute a review?"). An admin can edit them.
- Clicking a suggested question always uses a predefined answer: no AI.
- **Talk to a person** is always visible. After two answers in a row that did not help (the person clicks "This did not help", or Quinn was not confident), Quinn offers it by itself. It opens a Contact support request with the conversation attached. No personal contact details are ever given.
- The **Ask Quinn** page stays, for longer questions about the numbers.

## 8. Admin pages (Admin › Quinn)

1. **Answers:** the intents, with phrasings, keywords, synonyms, the answers in three languages, links and actions. Each can be switched on or off, and there is a **Test** box that shows which level and which answer a question would get.
2. **Suggested questions:** per page and per role.
3. **Settings:**
   - the confidence thresholds
   - whether the AI fallback is on, and which model for Level 3 and Level 4
   - the cache expiry
   - the hand-over after how many failed answers
   - the maximum answer length (tokens)
4. **Unanswered:** questions Quinn could not answer, or answered with AI that a predefined answer could have covered. Each has a button "Make it an answer".

## 9. AI usage and cost dashboard (Admin › Quinn › Usage)

- **Questions per level** (predefined, help, cache, AI light, AI advanced, person), shown as AI-free versus AI.
- **Tokens and money:**
  - input and output tokens, and the estimated cost (the price table of `ai.js`)
  - per company, per user and per day
- **Lists:**
  - the most asked questions
  - questions that went to AI without need (a later match with a predefined answer)
  - questions without an answer
- **Limits an admin sets:**
  - a monthly budget per company
  - a limit per user per hour
  - the maximum answer tokens
  - a warning at 80%

When the budget is reached, Quinn keeps answering from Levels 1 and 2 and says that the AI part is paused until next month. **The budget is never exceeded silently.**

## 10. Storage, ready for Firebase (and later SQL)

Four small lists, each behind a few read and write functions, so moving to Firestore only changes those functions:
- `quinnIntents`
- `quinnCache`
- `quinnStats`: counters per day, company, user and level (one write per question, not per word)
- `quinnMisses`: the last 500 questions without an answer

On Firestore, each company has its own database (your decision), so isolation between companies is built in. The queries are by company and day, which needs one index.

## 11. Tests (your list of 12)

- **The router with fixed questions:**
  - three phrasings of the same question give the same intent
  - synonyms and the three languages work
  - Help Center ranking, cache hit and clearing, the budget limit, the hand-over
  - an agent never receives a link to a page they cannot open
  - nothing crosses between companies
- **AI-free means AI-free:** the AI module is replaced by a counter in the tests, and every Level 1, 2 and cache answer must leave it at **0 calls**.
- **The cost numbers:** every AI answer adds its tokens and cost exactly once.

## 12. Order of work

1. The router, intents (with the starting set), Help Center search on the server, the Quinn bubble with suggested questions and the hand-over. **This already answers most everyday questions with no AI.**
2. The admin pages: Answers, Suggested, Settings, Test, Unanswered.
3. The cache, Levels 3 and 4 with small context, budgets and limits.
4. The usage and cost dashboard, and the report you asked for (how many question types are answered without AI, and how AI use is measured).

## 13. Decisions I need from you

1. **The Quinn bubble:** on every page, for every role (agents too)? *(I recommend yes.)*
2. **Models:** Haiku 5.5 for Level 3 and Sonnet 5.5 for Level 4? *(I recommend this: cheapest for picking an intent, good enough for analysis. Opus only if you want the best quality.)*
3. **Where the hand-over goes:** a Contact support request seen by admins, with a notification. Or should team leads receive their own agents' requests?
4. **The default monthly AI budget per company** (for example €10), and the limit per user (for example 30 AI answers per hour).
