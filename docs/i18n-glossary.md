# Languages: how they work, and the glossary

Q-smart can be used in **English**, **Български** (Bulgarian) and **Français** (French).

## Where to change the language
- **Sign-in screen:** the three buttons under the form.
- **My account › Language:** the change is saved with your account, so it is the same on every browser and device.

The whole app switches at once, without reloading. Anything you are typing stays where it is.

## How the language is chosen
1. If you have saved a language in your account, that language is used.
2. If you have not, but you picked a language on the sign-in screen just before signing in, that choice is saved to your account.
3. Otherwise the app uses English. Existing users keep English until they choose another language.

The sign-in screen shows the language last used in that browser. One person's choice is never saved to another person's account.

## What is translated, and what is not
- **Translated:** every menu, page, button, form, message, pop-up, tooltip and screen-reader label. Also the server's error messages, the notifications, the audit-log actions, the Excel export headings, the built-in scorecard, the built-in root causes and the built-in Auto QA categories.
- **Not translated, on purpose:** anything people typed themselves, because it is data. That includes names, teams, comments, articles, quiz questions, tasks, the skills and languages lists, and scorecards or categories you created. The Auto QA phrases stay English too, because they are matched against English transcripts.
- **Stored values never change.** Statuses, scores, roles and ids are still saved in English inside `data.json`. Only what is shown on screen changes.

## Files
| File | What it does |
|---|---|
| `public/js/i18n.js` | The language engine: picks the translation, plural forms and date format, and updates the page. |
| `public/js/i18n/bg.js` | Bulgarian translations. |
| `public/js/i18n/fr.js` | French translations. |
| `test/i18n.test.js` | Checks that every page text has both translations and that plurals, values and dates work. |

**How the translation files work.** The English text on the left is the identifier, and its translation is on the right. Texts with values use placeholders:
- `{n}` is a number. It also picks the right plural form.
- `{x}` is a value kept exactly as it is, such as a name.
- `{~x}` is a value that is itself translated.

**Finding a missing translation.** Open the app with `?i18n=debug` at the end of the address. Any text without a translation gets a red dotted outline, and `I18N.missing()` in the browser console lists them all. The automatic test also fails if a page text has no Bulgarian or French translation.

## Glossary: one translation per idea
| English | Български | Français |
|---|---|---|
| Quality Assurance / QA | Контрол на качеството / QA | Assurance qualité / QA |
| Evaluation, review, call review | Оценка, оценка на разговор | Évaluation, évaluation d'appel |
| Scorecard | Оценъчна карта | Grille d'évaluation |
| Evaluation criterion / item | Критерий за оценка / критерий | Critère d'évaluation / critère |
| Category | Категория | Catégorie |
| Agent | Агент | Agent |
| Team Lead | Тийм лидер | Chef d'équipe |
| QA Specialist | QA специалист | Spécialiste QA |
| Trainer | Обучител | Formateur |
| Admin | Администратор | Administrateur |
| Team performance | Представяне на екипа | Performance de l'équipe |
| Quality score / score | Резултат | Score |
| Pass rate / pass target | Успеваемост / цел за успеваемост | Taux de réussite / objectif de réussite |
| Pass / Fail (review) | Успешна / Неуспешна | Réussie / Échouée |
| Not applicable (N/A) | Неприложимо (Н/П) | Non applicable (N/A) |
| Feedback | Обратна връзка | Retour |
| Coaching | Коучинг | Coaching |
| One-to-one | Среща 1:1 | Entretien individuel |
| Calibration | Калибриране | Calibrage |
| Dispute | Оспорване | Contestation |
| Status | Статус | Statut |
| Completed / Pending / In progress | Завършено / Изчакващо / В процес | Terminé / En attente / En cours |
| Customer interaction / conversation | Разговор с клиента | Interaction client / conversation |
| Compliance / process adherence | Спазване на процеса | Respect des processus |
| Critical error / critical item | Критична грешка / критичен критерий | Erreur critique / critère critique |
| Root cause | Основна причина | Cause racine |
| Red / green flag | Червен / зелен флаг | Drapeau rouge / vert |
| Lead ID | ID на лийд | ID du lead |
| Workspace | Работно пространство | Espace de travail |
| Knowledge base | База знания | Base de connaissances |
| Quiz | Тест | Quiz |
| Task / mission | Задача / мисия | Tâche / mission |
| Auto QA | Автоматичен QA | QA automatique |
| Transcript | Транскрипция | Transcription |
| Dashboard | Табло | Tableau de bord |

## Known limits
- **Numbers keep the English style.** For example `92.4%` stays as it is and is not written `92,4 %`. Dates and month names do follow the chosen language.
- **Emails stay in English.** This covers registration, password-reset and reminder emails.
- **The ZIP export of articles keeps the article text as written.**
- **A new built-in text needs its own translation.** When a new text is added to the pages, add it to `bg.js` and `fr.js`. The test `npm.cmd test` reports any that are missing.
