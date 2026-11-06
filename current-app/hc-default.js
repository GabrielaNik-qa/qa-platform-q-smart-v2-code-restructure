// The Help Center website before an admin changes anything (3 November): categories, sections and articles about Q-smart itself.
// It is only copied into data.json the first time an admin saves something in Admin › Help Center website.
const cats = [
  ['c-start', '🚀', 'Getting started', 'Sign in, find your way around and set up your account'],
  ['c-rev', '✅', 'Reviews & scorecards', 'Score conversations, read your reviews and dispute them'],
  ['c-coach', '🎯', 'Coaching & learning', 'Coaching, the Knowledge Base, quizzes and the newsletter'],
  ['c-wfm', '📅', 'Workforce', 'Check-ins, shifts, time off and Team today'],
  ['c-rep', '📊', 'Reports & analytics', 'Dashboards, reports and exports'],
  ['c-admin', '⚙️', 'Admin & security', 'Users, teams, permissions, privacy and backups']
];
const secs = [
  ['s-first', 'c-start', 'First steps'], ['s-acc', 'c-start', 'Your account'],
  ['s-score', 'c-rev', 'Scoring a conversation'], ['s-read', 'c-rev', 'Your reviews and disputes'],
  ['s-coach', 'c-coach', 'Coaching'], ['s-learn', 'c-coach', 'Learning'],
  ['s-att', 'c-wfm', 'Attendance'], ['s-plan', 'c-wfm', 'Shifts and planning'],
  ['s-dash', 'c-rep', 'Dashboards'], ['s-rep', 'c-rep', 'Reports and exports'],
  ['s-users', 'c-admin', 'Users and teams'], ['s-sec', 'c-admin', 'Security and privacy']
];
const arts = [
  ['s-first', 'Signing in for the first time', true, ['sign in', 'password'], `Your admin creates your account and tells you your username.

1. Open the Q-smart address your company gave you.
2. Type your username and the first password your admin gave you.
3. Choose a new password. It must be at least 8 characters long.

After that you land on your dashboard.

## I forgot my password
Ask your admin: they can set a new first password for you in **Admin › Users**.`],
  ['s-first', 'Finding your way around', true, ['menu', 'search'], `The menu on the left has your pages, grouped in sections that fold open and closed.

- **The menu search** at the top of the menu finds the names of pages.
- **The app search** (press **Ctrl K**) finds agents, reviews, tasks and articles.
- **Apps** open their first page with one click.

What you see depends on your role: agents, team leads, QA specialists, trainers and admins each have their own pages.`],
  ['s-first', 'What each role can do', false, ['roles'], `- **Agent**: reads their own reviews, disputes them, follows their lessons and checks in.
- **Team Lead**: coaches the agents of their team and plans One-to-Ones.
- **QA Specialist**: scores conversations, answers disputes and runs calibrations.
- **Trainer**: writes lessons, quizzes and the newsletter.
- **Admin**: sets up users, teams, scorecards and the settings of the company.`],
  ['s-acc', 'Changing your password', false, ['password'], `Open **My account** at the bottom of the menu and choose **Change password**. Type your current password once and the new one twice.

Changing your password signs you out on your other devices.`],
  ['s-acc', 'Choosing your language and theme', false, ['language', 'dark mode'], `In **My account** you can choose English, Bulgarian or French, a light or dark theme and the size of the text. Your choices follow you on every device.`],
  ['s-score', 'Scoring a call or a chat', true, ['scorecard', 'review'], `1. Open **Score a conversation**.
2. Choose the agent, the scorecard and the conversation.
3. Answer each question of the scorecard. The score is counted as you go.
4. Write a comment that helps the agent, then **Save**.

A **critical item** makes the whole review fail when it is missed.`],
  ['s-score', 'Calibration sessions', false, ['calibration'], `In a calibration, several reviewers score the same conversation without seeing each other's answers. Q-smart then shows where they agree and where they do not, so everybody scores the same way.`],
  ['s-read', 'Reading your reviews', false, ['review'], `Open **Reviews** to see every review of your conversations, with the score, the comments and, for calls, the recording when your company shares it.`],
  ['s-read', 'Disputing a review', true, ['dispute'], `If you do not agree with a review:

1. Open the review.
2. Choose **Dispute** and explain why.
3. A QA specialist answers. They may change the score.

You get a notification when your dispute is answered.`],
  ['s-coach', 'One-to-Ones and improvement plans', false, ['coaching'], `Team leads plan **One-to-Ones** with notes and next steps. An **improvement plan** sets goals for a few weeks; the agent confirms they read it and the lead follows it up until the goals are reached.`],
  ['s-learn', 'The Knowledge Base', false, ['knowledge base', 'lessons'], `The Knowledge Base in **Learning** holds your company's pages, in folders. Some pages are required reading: mark them as read, and take the lesson test when there is one.`],
  ['s-learn', 'Quizzes and the newsletter', false, ['quiz'], `Trainers publish quizzes with a pass mark, and a newsletter with the news of the team. Your results are in **Learning › Academy**.`],
  ['s-att', 'Checking in and out', true, ['attendance'], `Press **Check in** when you start and **Check out** when you finish. Breaks are counted too. If you forgot, ask for a correction: your team lead approves it.`],
  ['s-att', 'Asking for time off', false, ['time off', 'holiday'], `Open **Time off**, choose the type and the days, and send the request. Your balance shows how many days you have left.`],
  ['s-plan', 'Shifts and the rota', false, ['shifts', 'rota'], `Admins set up work calendars and shift patterns; the rota shows who works when, for every team. **Team today** shows who is in, on a break or away right now.`],
  ['s-dash', 'Your dashboard', false, ['dashboard'], `Your dashboard shows your average score, your latest reviews and what needs you now: tasks, disputes, lessons.`],
  ['s-rep', 'Building and exporting reports', false, ['reports', 'excel'], `In **Reports** you choose the numbers, the filters and the period, then save the report or export it to Excel. Exports are written down in the Activity Log.`],
  ['s-users', 'Adding a user', false, ['users'], `Admins open **Admin › Users**, choose **Add**, and fill in the name, username, role and team. The new person signs in with the first password and must change it.`],
  ['s-users', 'Teams and workspaces', false, ['teams'], `Everybody belongs to a team. Staff are in Administration. Knowledge Base folders can be shown to some teams only.`],
  ['s-sec', 'Roles & permissions', false, ['permissions'], `In **Admin › Roles & permissions** an admin chooses which pages each role sees, and can make exceptions for one person.`],
  ['s-sec', 'Your data and privacy', false, ['privacy', 'gdpr'], `Q-smart keeps only what is needed to review conversations and coach people. Admins keep the records of processing, the sub-processors and the data breaches in **Admin › Governance**.`]
];
const T = '2026-11-03T08:00:00.000Z';
module.exports = () => ({
  name: 'Q-smart Help Center', intro: 'Find answers about Q-smart',
  cats: cats.map(([id, icon, name, desc], i) => ({ id, icon, name, desc, order: i })),
  secs: secs.map(([id, cat, name], i) => ({ id, cat, name, desc: '', order: i })),
  arts: arts.map(([sec, title, promoted, labels, body], i) => ({ id: 'a-' + (i + 1), sec, title, body, promoted, draft: false, labels, author: 'Q-smart', created: T, updated: T, up: 0, down: 0, order: i }))
});
