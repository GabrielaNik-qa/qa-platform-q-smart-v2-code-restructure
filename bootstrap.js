// Creates the starting teams and test users, and converts older data to the current model.
// Every agent is a real user (role "agent") that belongs to a team - there is no separate "agent list" any more.
// Email logic for test users: first initial + "." + last name + "@test.com"   (Gabriela Nikolova -> g.nikolova@test.com)
const bcrypt = require('bcryptjs');

const TEAMS0 = [
  { id: 't-b2c', name: 'B2C', desc: 'Consumer sales and retention', languages: ['English', 'French'], skills: ['Sales', 'Retention', 'Objection handling'], region: 'Europe', hours: '08:00-17:00', channels: ['Phone', 'Chat'], lead: 'l.hart', color: '#2563eb' },
  { id: 't-b2b', name: 'B2B', desc: 'Business accounts and partnerships', languages: ['English'], skills: ['Account management', 'Negotiation'], region: 'Europe', hours: '09:00-18:00', channels: ['Phone', 'Email'], lead: 'm.duval', color: '#7c3aed' },
  { id: 't-support', name: 'Support', desc: 'Customer support and issue resolution', languages: ['English', 'French'], skills: ['Troubleshooting', 'Empathy'], region: 'Europe', hours: '07:00-16:00', channels: ['Chat', 'Email'], lead: 'n.ivanova', color: '#0d9488' }
];
const AGENTS0 = ['Deyan Petrov', 'Maria Todorova', 'Charles Kemp', 'Kamelia Dimova', 'Sofia Mensah', 'Ivan Schmidt', 'Sandra Blanc', 'Rene Shishkov'];   // agent i -> team i % 3
const LEADS0 = ['Lena Hart', 'Marc Duval', 'Nora Ivanova'];                                                                                       // lead i -> team i
const TRAINERS0 = ['Iva Marinova', 'Boris Kolev'];

const uname = n => {
  const p = String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s'-]/g, '').trim().split(/\s+/);
  return ((p[0] || 'u')[0] + '.' + (p.slice(1).join('') || 'user')).replace(/[^a-z.]/g, '');
};
const emailOf = n => uname(n) + '@test.com';
const agentUsername = i => uname(AGENTS0[i]);

// v5 rules: every user belongs to a team (mandatory), every team has a lead (mandatory), all admins / QA / team leads / trainers
// belong to the "Administration" team, only B2B and B2C are kept as working teams, skills and languages come from a catalog.
const ADMIN_TEAM = 't-admin';
const SKILLS0 = ['Sales', 'Retention', 'Objection handling', 'Account management', 'Negotiation', 'Troubleshooting', 'Empathy', 'Upselling', 'Coaching', 'Quality assurance'];
const LANGS0 = ['English', 'French', 'German', 'Spanish', 'Italian', 'Bulgarian'];
const ROOT0 = [['Knowledge gap', 'The agent did not know the answer or the product'], ['Process unclear', 'The process or policy is unclear or was not followed'], ['Tool or system issue', 'A system problem got in the way'], ['Soft skill', 'Tone, empathy or listening needs work'], ['Customer behaviour', 'A difficult situation outside the agent\'s control'], ['Workload / time pressure', 'The agent was rushed']];
const AUTO0 = [
  { name: 'Greeting', maps: 'Greeting & Introduction', pos: ['hello', 'good morning', 'good afternoon', 'welcome', 'my name is', 'thank you for calling'], neg: [] },
  { name: 'Empathy', maps: 'Empathy & Active Listening', pos: ['i understand', 'i am sorry', "i'm sorry", 'i can imagine', 'that must be', 'i hear you'], neg: ['calm down'] },
  { name: 'Professional language', maps: 'Vocabulary & Professionalism', pos: ['please', 'certainly', 'of course', 'happy to help'], neg: ['whatever', 'not my problem', 'no idea', 'you should have'] },
  { name: 'Solution and next steps', maps: 'Process Adherence', pos: ['i will send', 'next step', 'follow up', 'i have noted', 'i will check', 'i have updated'], neg: [] },
  { name: 'Objection handling', maps: 'Persuasion & Objection Handling', pos: ['what i can offer', 'the value', 'many customers', 'compared to', 'let me show'], neg: ['take it or leave it'] },
  { name: 'Closing', maps: 'Closing & Positive Outcome', pos: ['anything else', 'thank you for', 'have a great', 'have a nice', 'is there anything'], neg: [] }
].map((c, i) => ({ id: 'ac' + (i + 1), desc: '', weight: 1, enabled: true, system: true, ...c }));
const hashN = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// "Gabriela Georgieva" -> ["Gabriela", "Georgieva"]: first word is the first name, the rest the last name
const splitName = n => { const p = String(n || '').trim().split(/\s+/); return [p[0] || '', p.slice(1).join(' ')]; };
// every user gets the same fields in the same order (adds first/last name and missing defaults; nothing else is changed or removed)
const USER_ORDER = ['username', 'name', 'firstName', 'lastName', 'email', 'role', 'team', 'title', 'desc', 'languages', 'skills', 'phone', 'start', 'active', 'hash', 'mustChange'];
function normUsers(db) {
  let dirty = false;
  db.users.forEach(u => {
    const before = JSON.stringify(u), [f, l] = splitName(u.name);
    const full = { title: '', desc: '', languages: [], skills: [], phone: '', start: '', active: true, mustChange: false, ...u, firstName: u.firstName || f, lastName: u.lastName !== undefined ? u.lastName : l, email: u.email || '' };
    const out = {}; USER_ORDER.forEach(k => { if (full[k] !== undefined) out[k] = full[k]; }); Object.keys(full).forEach(k => { if (!(k in out)) out[k] = full[k]; });
    Object.keys(u).forEach(k => delete u[k]); Object.assign(u, out);
    if (JSON.stringify(u) !== before) dirty = true;
  });
  return dirty;
}

// returns true when something was created or changed (so the caller saves the file)
function ensureBootstrap(db) {
  let dirty = normUsers(db);
  if (db.boot !== 3 && db.boot !== 5) { dirty = ensureV3(db) || dirty; }
  if (db.boot === 5) return dirty;
  db.oldTeams = db.oldTeams || {};
  const hash = bcrypt.hashSync('password', 10);
  // teams: Administration + B2B + B2C (the Support team is removed)
  if (!db.teams.some(t => t.id === ADMIN_TEAM)) db.teams.unshift({ id: ADMIN_TEAM, name: 'Administration', desc: 'Admins, QA specialists, team leads and trainers', languages: [], skills: [], region: '', hours: '', channels: [], notes: '', color: '#475569', lead: '', system: true, created: new Date().toISOString() });
  db.teams.forEach(t => { if (t.id === ADMIN_TEAM) t.system = true; });
  const gone = db.teams.filter(t => t.id === 't-support' || t.name.toLowerCase() === 'support');
  gone.forEach(t => { db.oldTeams[t.id] = t.name; delete (db.settings.teams || {})[t.id]; });
  db.teams = db.teams.filter(t => !gone.includes(t));
  const work = db.teams.filter(t => t.id !== ADMIN_TEAM);
  if (!work.length) { db.teams.push({ ...TEAMS0[0], notes: '', created: new Date().toISOString() }); work.push(db.teams[db.teams.length - 1]); }
  // people: staff -> Administration, agents -> one of the working teams (a stable "random" pick when they had none)
  db.users.forEach(u => {
    if (u.role !== 'agent') u.team = ADMIN_TEAM;
    else if (!work.some(t => t.id === u.team)) u.team = work[hashN(u.username) % work.length].id;
    if (u.team !== undefined) delete u.ag;
  });
  // every team needs a lead: working teams get a team lead, Administration gets an admin
  const leads = db.users.filter(u => u.role === 'lead' && u.active !== false), admins = db.users.filter(u => u.role === 'admin' && u.active !== false);
  work.forEach((t, i) => { const cur = db.users.find(u => u.username === t.lead && u.active !== false && ['lead', 'admin', 'qa', 'trainer'].includes(u.role)); if (!cur) t.lead = (leads[i % Math.max(1, leads.length)] || admins[0] || db.users[0] || {}).username || ''; });
  const at = db.teams.find(t => t.id === ADMIN_TEAM); if (!db.users.some(u => u.username === at.lead && u.role === 'admin')) at.lead = (admins[0] || {}).username || '';
  // catalogs
  const addAll = (arr, vals) => { vals.forEach(v => { if (v && !arr.some(x => x.toLowerCase() === String(v).toLowerCase())) arr.push(v); }); return arr; };
  db.skills = addAll(Array.isArray(db.skills) ? db.skills : [], SKILLS0); db.languages = addAll(Array.isArray(db.languages) ? db.languages : [], LANGS0);
  [...db.users, ...db.teams].forEach(x => { addAll(db.skills, x.skills || []); addAll(db.languages, x.languages || []); });
  // root causes, reusable category library, Auto QA categories, workspaces
  if (!Array.isArray(db.rootCauses) || !db.rootCauses.length) db.rootCauses = ROOT0.map(([name, desc], i) => ({ id: 'rc' + (i + 1), name, desc, active: true }));
  if (!Array.isArray(db.categories) || !db.categories.length) db.categories = ((db.scorecards[0] || {}).cats || []).map((c, i) => ({ id: 'cat' + (i + 1), ...JSON.parse(JSON.stringify(c)), desc: '', active: true }));
  if (!Array.isArray(db.autoCats) || !db.autoCats.length) db.autoCats = JSON.parse(JSON.stringify(AUTO0));
  if (!Array.isArray(db.conversations)) db.conversations = [];
  if (!Array.isArray(db.workspaces) || !db.workspaces.length) db.workspaces = [{ id: 'w-main', name: 'Main workspace', desc: 'Everything is here until you create more workspaces', color: '#2563eb', teams: work.map(t => t.id), scorecards: db.scorecards.map(s => s.id), staff: db.users.filter(u => u.role !== 'agent' && u.role !== 'admin').map(u => u.username) }];
  db.settings.layouts = db.settings.layouts || {};
  db.boot = 5;
  return true;
}
// the earlier (v3) step: agents and test users as real users, old data converted
function ensureV3(db) {
  if (db.boot === 3) return false;

  const hash = bcrypt.hashSync('password', 10);
  if (!Array.isArray(db.teams) || !db.teams.length) db.teams = TEAMS0.map(t => ({ ...t, notes: '', created: new Date().toISOString() }));
  const tid = i => db.teams[i % db.teams.length].id;
  const mk = (name, role, team, title) => {
    const username = uname(name);
    if (db.users.some(u => u.username === username)) return;
    const t = db.teams.find(x => x.id === team) || {};
    db.users.push({ username, name, email: emailOf(name), role, team, title, desc: '', languages: [...(t.languages || [])], skills: [], phone: '', start: '', active: true, hash, mustChange: false });
  };
  LEADS0.forEach((n, i) => mk(n, 'lead', tid(i), 'Team Lead'));
  TRAINERS0.forEach(n => mk(n, 'trainer', '', 'Trainer'));
  AGENTS0.forEach((n, i) => mk(n, 'agent', tid(i), 'Sales Agent'));
  db.users = db.users.filter(u => u.username !== 'agent.demo');                       // the old "agent linked to an agent number" demo account
  db.users.forEach(u => {                                                           // older accounts that were linked by number
    if ('ag' in u) { if (Number.isInteger(u.ag) && u.role === 'agent' && !u.team) u.team = tid(u.ag); delete u.ag; }
    if (u.role === 'agent' && u.team === undefined) u.team = '';
    if (u.active === undefined) u.active = true;
    for (const k of ['languages', 'skills']) if (!Array.isArray(u[k])) u[k] = [];
  });
  (db.evaluations || []).forEach(e => {                                             // reviews pointed at agent numbers before
    if (Number.isInteger(e.ag) && !e.agent) { e.agent = agentUsername(e.ag); e.agn = AGENTS0[e.ag]; e.tid = tid(e.ag); }
    delete e.ag; delete e.tm;
  });
  if (db.settings && db.settings.teams) {                                           // pass rates were keyed by team number
    const m = {}; for (const [k, v] of Object.entries(db.settings.teams)) m[/^\d$/.test(k) ? tid(+k) : k] = v; db.settings.teams = m;
  }
  db.boot = 3;
  return true;
}
module.exports = { ensureBootstrap, TEAMS0, AGENTS0, LEADS0, TRAINERS0, uname, emailOf, agentUsername, ADMIN_TEAM, AUTO0, SKILLS0, LANGS0 };
