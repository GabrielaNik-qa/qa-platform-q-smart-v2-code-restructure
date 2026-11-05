// Usage: node adduser.js <username> <password> <admin|qa|lead|trainer|agent> [--email=name@example.com] [--team=t-b2c] [--must-change] <Full Name>
//  - if the password is the word "password", the user is asked to choose a new one at the first login
//  - --team=ID puts the user in a team (an agent needs one). Team ids are shown in data.json, e.g. t-b2c, t-b2b (staff always go to t-admin)
//  - running it again for an existing username changes only what you give; every other field (team, languages, skills ...) is kept
const bcrypt = require('bcryptjs'), fs = require('fs');
const ROLES = ['admin', 'qa', 'lead', 'trainer', 'agent'];
const [, , username, password, role, ...rest] = process.argv;
const usage = 'Usage: node adduser.js <username> <password> <' + ROLES.join('|') + '> [--email=name@example.com] [--team=t-b2c] [--must-change] <Full Name>';
if (!username || !password || !ROLES.includes(role)) { console.log(usage); process.exit(1); }
const F = 'data.json';
const db = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : { users: [], evaluations: [] };
const old = db.users.find(u => u.username === username.toLowerCase()) || {};
const opt = k => { const f = rest.find(x => x.startsWith('--' + k + '=')); return f ? f.slice(k.length + 3) : undefined; };
let team = opt('team') !== undefined ? opt('team') : (old.team || '');
if (role !== 'agent') team = 't-admin';
if (Array.isArray(db.teams) && team && !db.teams.some(t => t.id === team)) { console.log('Unknown team "' + team + '". Teams: ' + db.teams.map(t => t.id).join(', ')); process.exit(1); }
if (role === 'agent' && !team) { console.log('An agent must belong to a team. Add --team=ID (for example --team=t-b2c).'); process.exit(1); }
const user = { languages: [], skills: [], phone: '', start: '', desc: '', title: '', active: true, ...old,
  username: username.toLowerCase(), name: rest.filter(x => !x.startsWith('--')).join(' ') || old.name || username,
  email: opt('email') !== undefined ? opt('email') : (old.email || ''), role, team, hash: bcrypt.hashSync(password, 10),
  pwv: (old.pwv || 0) + 1,                                  // a new password: the sign-ins made with the old one end (the app checks this number)
  mustChange: password === 'password' || rest.includes('--must-change') };
delete user.ag;
db.users = db.users.filter(u => u.username !== user.username); db.users.push(user);
// QA, team leads and trainers only see the teams and scorecards of their workspaces: like the app, put them in the first one when they are in none
// (admins see everything; agents belong to a workspace through their team)
const ws = Array.isArray(db.workspaces) ? db.workspaces : [];
if (role !== 'agent' && role !== 'admin' && ws.length && !ws.some(w => (w.staff || []).includes(user.username))) { ws[0].staff = ws[0].staff || []; ws[0].staff.push(user.username); console.log('Added to the workspace "' + ws[0].name + '"'); }
fs.writeFileSync(F, JSON.stringify(db, null, 2));
console.log('Saved user ' + username + ' (' + role + ')' + (user.email ? ' <' + user.email + '>' : '') + (team ? ' in team ' + team : '') + (password === 'password' ? ' - must change the password at first login' : ''));
