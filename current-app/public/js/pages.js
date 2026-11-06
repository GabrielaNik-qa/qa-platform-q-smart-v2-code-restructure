// ===================== Menu groups, Dashboard, analytics pages and the small pages =====================
const CATS = l => [...new Set(l.flatMap(e => (e.cs || []).map(c => c.n)))];
const cpv = (e, n) => { const x = (e.cs || []).find(c => c.n === n); return x && x.m ? x.e / x.m * 100 : null; };
const staff = () => ME && (ME.role === 'admin' || ME.role === 'qa');
const isStaffR = () => ME && STAFFR.includes(ME.role);

// ---- the menu: main groups, each with its own icon and a drop-down of pages
// The menu has panels (space): the main menu for the everyday quality work, and the Workforce, Compliance & CX, Learning and Admin
// panels that open from the bottom of it ("Workforce ›" …) and have "← Back to the main menu" at the top (main.js)
const GROUPS = [
  // the main menu in two sections, OPERATIONS and MANAGE, that fold like APPS; AI Hub, Help Center and Activity Log with sub-menus (Gabriela, 29 October)
  { id: 'home', name: 'Home', sec: 'ops', icon: 'g_home', items: [['dash', 'Dashboard'], ['autoqa', 'AutoQA'], ['tasks', 'Tasks'], ['pers', 'Personalize'], ['cs_start', 'Getting started']] },
  { id: 'quality', name: 'Quality', sec: 'ops', icon: 'g_quality', items: [['calls', 'Reviews'], ['cs_conv', 'Conversations'], ['entry', 'QA Entry'], ['flags', 'Quick Flags'], ['disputes', 'Disputes'], ['cs_revqa', 'Reviewer QA']] },
  { id: 'analytics', name: 'Analytics', sec: 'ops', icon: 'g_analytics', items: [['agents', 'Agents'], ['team', 'Team Review'], ['cats', 'Category Stats'], ['cs_dashes', 'Topic dashboards']] },
  { id: 'performance', name: 'Performance', sec: 'ops', icon: 'g_perf', items: [['goals', 'Goals & KPIs'], ['pips', 'Improvement plans'], ['kudos', 'Recognition']] },
  { id: 'coaching', name: 'Coaching', sec: 'ops', icon: 'g_coaching', items: [['coach', 'Coaching'], ['o2o', 'One-to-One'], ['cal', 'Calibration'], ['cs_pins', 'Pins']] },
  { id: 'aihub', name: 'AI Hub', sec: 'manage', icon: 'g_aihub', items: [['aihub', 'Overview'], ['cs_hubcheck', 'AI scores to check'], ['cs_hubuse', 'AI usage'], ['cs_hubprompts', 'Prompt library'], ['cs_hubfb', 'AI feedback']] },
  { id: 'help', name: 'Help Center', sec: 'manage', icon: 'g_help', items: [['cs_faq', 'FAQ'], ['cs_videos', 'Video tutorials'], ['cs_tours', 'Guided tours'], ['cs_gloss', 'Glossary'], ['cs_hcsite', 'Help Center website']] },
  { id: 'planning', name: 'Planning', sec: 'manage', icon: 'g_plan', items: [['planner', 'Review planner'], ['workload', 'QA workload'], ['calendar', 'Calendar']] },
  { id: 'reports', name: 'Reports', sec: 'manage', icon: 'g_reports', items: [['rbuild', 'Report builder'], ['rsaved', 'Saved & scheduled'], ['rexp', 'Export centre']] },
  { id: 'activity', name: 'Activity Log', sec: 'manage', icon: 'g_activity', items: [['audit', 'All activity'], ['cs_myact', 'My activity'], ['cs_actsign', 'Sign-ins'], ['cs_actexp', 'Exports & downloads']] },
  { id: 'learning', name: 'Learning', icon: 'g_learning', space: 'learn', items: [['acad', 'My Learning'], ['kb', 'Knowledge Base'], ['quiz', 'Quizzes'], ['news', 'Newsletter']] },   // the Knowledge Base is back in Learning (Gabriela, 3 November)
  // Tools in the Learning panel: five tools to come (Gabriela's yes, 29 October)
  { id: 'tools', name: 'Tools', icon: 'g_tools', space: 'learn', items: [['cs_redact', 'Redaction'], ['cs_transl', 'Translator'], ['cs_sample', 'Sample calculator'], ['cs_scoresim', 'Score simulator'], ['cs_script', 'Script builder']] },
  { id: 'aisim', name: 'Q Trainer', icon: 'g_aisim', space: 'ai', items: [['simres', 'Dashboard'], ['sim', 'New simulation'], ['simsc', 'Scenarios']] },
  { id: 'qintel', name: 'Q-Intelligence', icon: 'g_qi', space: 'qi', items: [['qask', 'Ask Quinn'], ['qins', 'AI insights'], ['cs_spot', 'Spotlight'], ['qknow', 'Knowledge']] },
  // two more apps (Gabriela, 29 October): AI agents (the AI roles that do a job in the app; more comes later) and Transcripts (was Learning > Tools)
  { id: 'aiagents', name: 'AI agents', icon: 'g_robot', space: 'aiag', items: [['qagents', 'AI agents']] },
  { id: 'transcripts', name: 'Transcripts', icon: 'g_tr', space: 'tr', items: [['tr', 'Transcripts']] },
  // the Admin panel (Settings for the other roles) in five sections of at most five icons, one-word headings (Gabriela's yes, 29 October).
  // Workforce and Compliance & CX moved here from APPS; the pages starting with cs_ are "coming soon" (SOON below), shown greyed
  // ACCOUNT. My account: everybody's own settings, the same as the account pop-up; the settings wheel opens this panel
  { id: 'myacc', name: 'My account', sec: 'account', icon: 'g_me', space: 'admin', items: [['acprof', 'Profile'], ['acpw', 'Password'], ['acapp', 'Appearance'], ['aclang', 'Language'], ['acnotif', 'Notifications & Confirmations']] },
  { id: 'org', name: 'Company', sec: 'account', icon: 'g_org', space: 'admin', items: [['org', 'Company'], ['words', 'Business words'], ['cs_brand', 'Branding'], ['cs_region', 'Regional settings']] },
  { id: 'billing', name: 'Billing', sec: 'account', icon: 'g_bill', space: 'admin', items: [['cs_plan', 'Plan & seats'], ['cs_usage', 'Usage'], ['cs_invoices', 'Invoices'], ['cs_payment', 'Payment method'], ['cs_vat', 'EU VAT']] },
  { id: 'support', name: 'Support', sec: 'account', icon: 'g_support', space: 'admin', items: [['cs_contact', 'Contact support'], ['cs_ideas', 'Feature requests'], ['cs_status', 'Service status & SLA'], ['cs_release', 'Release notes']] },
  // PEOPLE
  { id: 'people', name: 'Users', sec: 'people', icon: 'g_people', space: 'admin', items: [['users', 'Users'], ['teams', 'Teams'], ['wsp', 'Workspaces'], ['skills', 'Skills']] },
  { id: 'roles', name: 'Roles', sec: 'people', icon: 'g_badge', space: 'admin', items: [['perms', 'All roles'], ['perm_agent', 'Agent'], ['perm_trainer', 'Trainer'], ['perm_lead', 'Team Lead'], ['perm_qa', 'QA Specialist'], ['perm_admin', 'Admin']] },
  { id: 'signin', name: 'Sign-in', sec: 'people', icon: 'g_key', space: 'admin', items: [['signin', 'Sign-in'], ['cs_sso', 'Single sign-on'], ['cs_scim', 'Automatic users (SCIM)'], ['cs_pwrules', 'Password & two-step rules'], ['cs_ip', 'Allowed IP addresses']] },
  { id: 'workforce', name: 'Workforce', sec: 'people', icon: 'g_wf', space: 'admin', items: [['today', 'Team today'], ['att', 'Attendance'], ['leave', 'Time off'], ['rota', 'Shifts and rota'], ['cap', 'Capacity planning']] },
  // SETUP
  { id: 'scorecards', name: 'Quality set-up', sec: 'setup', icon: 'g_sc', space: 'admin', items: [['sco', 'Scorecards'], ['scat', 'Categories'], ['roots', 'Root causes'], ['aqcats', 'Auto QA categories'], ['sysset', 'System settings']] },
  { id: 'wfsetup', name: 'Workforce set-up', sec: 'setup', icon: 'g_sys', space: 'admin', items: [['wcal', 'Work calendars'], ['shifts', 'Shift templates'], ['ltypes', 'Leave types'], ['attrules', 'Attendance rules']] },
  { id: 'messages', name: 'Messages', sec: 'setup', icon: 'g_mail', space: 'admin', items: [['notifs', 'Notification rules'], ['mailtpl', 'Email templates'], ['cs_maildom', 'Sending email domain'], ['cs_announce', 'Announcements']] },
  { id: 'aiset', name: 'AI', sec: 'setup', icon: 'g_aihub', space: 'admin', items: [['cs_quinn', 'Quinn'], ['cs_aiprov', 'AI provider'], ['cs_ailimit', 'AI usage limits'], ['cs_aionoff', 'AI on or off'], ['cs_aiinstr', 'AI instructions']] },
  { id: 'sbset', name: 'Sidebar settings', sec: 'setup', icon: 'g_layout', space: 'admin', items: [['cs_sbfull', 'Full-size sidebar'], ['cs_sbcompact', 'Compact sidebar'], ['cs_sbviews', 'Saved views']] },
  // GOVERNANCE
  { id: 'gdpr', name: 'GDPR', sec: 'gov', icon: 'g_shield', space: 'admin', items: [['privacy', 'Data protection'], ['cs_ropa', 'Record of processing'], ['cs_subproc', 'Sub-processors'], ['cs_dpa', 'Data processing agreement'], ['cs_consent', 'Recording consent']] },
  { id: 'aiact', name: 'AI Act', sec: 'gov', icon: 'g_scale', space: 'admin', items: [['cs_aireg', 'AI register'], ['cs_aihuman', 'Human checks'], ['cs_ainotice', 'AI notices']] },
  { id: 'security', name: 'Security', sec: 'gov', icon: 'g_lock', space: 'admin', items: [['cs_seclog', 'Security log'], ['cs_breach', 'Data breaches'], ['cs_apikeys', 'API keys']] },
  { id: 'a11y', name: 'Accessibility', sec: 'gov', icon: 'g_a11y', space: 'admin', items: [['cs_a11y', 'Accessibility statement']] },
  { id: 'comply', name: 'Compliance & CX', sec: 'gov', icon: 'g_comply', space: 'admin', items: [['compliance', 'Compliance'], ['risks', 'Risk register'], ['complaints', 'Complaints'], ['csat', 'Surveys (CSAT)']] },
  // PLATFORM
  { id: 'admin', name: 'Integrations', sec: 'platform', icon: 'g_plug', space: 'admin', items: [['integ', 'Integrations'], ['cs_webhooks', 'Webhooks'], ['cs_api', 'Developer API'], ['cs_mcp', 'MCP connectors']] },
  { id: 'data', name: 'Data', sec: 'platform', icon: 'g_db', space: 'admin', items: [['backup', 'Backups & data'], ['cs_import', 'Import data'], ['cs_euloc', 'EU data location']] },
  { id: 'sandbox', name: 'Sandbox', sec: 'platform', icon: 'g_box', space: 'admin', items: [['cs_sandbox', 'Test copy']] },
  { id: 'features', name: 'Features', sec: 'platform', icon: 'g_flag', space: 'admin', items: [['cs_beta', 'Beta features']] }
];
// the "coming soon" pages of the Admin panel: the name and one sentence on what the page will do (admins only)
const SOON = {
  cs_sbfull: 'Put the sections and pages of the full-size sidebar in the order you want.', cs_sbcompact: 'Choose which icons the compact sidebar shows, and in which order.',
  cs_sbviews: 'Save a sidebar layout, give it a name, and choose it for a team or a role.',
  cs_conv: 'All the calls, chats and tickets to choose from for a review: All, Starred, Drafts and Saved filters, with a filter for bots.',
  cs_spot: 'The AI picks the conversations worth reviewing, for example negative sentiment or an account closure.',
  cs_redact: 'Remove personal data (card numbers, phone numbers, names) from transcripts and recordings before they are shared.',
  cs_transl: 'Translate a transcript or a review comment into your language.', cs_sample: 'How many reviews each agent needs for a fair score, and a random fair sample to review.',
  cs_scoresim: 'What if: how a failed critical item or a new weight would change the score.', cs_script: 'Call scripts and ready answers that agents can follow.',
  cs_myact: 'What you received (reviews, comments, reactions, survey feedback), what you gave, and your disputes.', cs_start: 'A check-list to set up Q-smart: scorecard, users, connections and AutoQA.',
  cs_revqa: 'Review the reviewers: check that reviews are fair and follow the scorecard.', cs_dashes: 'Dashboards for assignments, coaching, disputes, calibration, surveys and reviewer QA.',
  cs_pins: 'Save a moment of a conversation to talk about it in a coaching session.',
  cs_hubcheck: 'AI scores that a person should check before they count.', cs_hubuse: 'How much AI each team used, and for what.',
  cs_hubprompts: 'Ready-made questions and instructions for the AI, shared with the team.', cs_hubfb: 'Thumbs up or down on AI answers, to make them better.',
  cs_faq: 'Short answers to the questions people ask most.', cs_videos: 'Short videos that show how to use each part of Q-smart.',
  cs_tours: 'Step-by-step tours inside the app, for new people.', cs_gloss: 'What the quality words used in Q-smart mean.',
  cs_actsign: 'Who signed in, when and from where, and the failed attempts.', cs_actexp: 'Who downloaded or exported data, and when.',
  cs_brand: 'Your logo, colours and own web address on Q-smart.', cs_region: 'Time zone, date and number formats and currency for the company.',
  cs_plan: 'Your plan and the number of seats you pay for.', cs_usage: 'How much AI and storage the company uses this month.',
  cs_invoices: 'All invoices, to download.', cs_payment: 'The card or bank account that pays the subscription.',
  cs_vat: 'The company\'s EU VAT number, and reverse charge for business customers in other EU countries.',
  cs_contact: 'Write to Q-smart support and follow your requests.', cs_ideas: 'Ask for a new feature and vote for the ideas of others.',
  cs_status: 'Whether Q-smart works normally, and the service levels we promise.', cs_release: 'What is new in each version of Q-smart.',
  cs_sso: 'Sign in with the company account (Microsoft, Google or SAML).', cs_scim: 'People added or removed in the company directory are added or removed here too.',
  cs_pwrules: 'Password length, two-step sign-in for everybody, and the time before people are signed out.', cs_ip: 'Only allow sign-ins from the company\'s own networks.',
  cs_maildom: 'Emails sent from the company\'s own address, with the checks that stop them going to spam.', cs_announce: 'A message shown to everybody when they sign in.',
  cs_aiprov: 'Which AI company and model Q-smart uses. Today this is set in Integrations.', cs_ailimit: 'How much AI each team may use each month.',
  cs_aionoff: 'Switch the AI off for a team or a country.', cs_aiinstr: 'Rules and instructions the AI follows in its answers.',
  cs_ropa: 'The list of what personal data Q-smart uses and why (GDPR article 30).', cs_subproc: 'The other companies that process data for Q-smart.',
  cs_dpa: 'The signed data processing agreement between your company and Q-smart.', cs_consent: 'The notices that tell customers their call is recorded, per country.',
  cs_aireg: 'Where the AI is used in Q-smart and for what (EU AI Act).', cs_aihuman: 'Which AI scores a person must check before they count.',
  cs_ainotice: 'Telling agents and customers when the AI scored or answered them.', cs_seclog: 'Sign-ins, failed attempts and downloads of data.',
  cs_breach: 'Record a data breach and report it within 72 hours.', cs_apikeys: 'Keys that let other programs use Q-smart.',
  cs_a11y: 'How Q-smart can be used by everybody (European Accessibility Act).', cs_webhooks: 'Send events from Q-smart to other programs.',
  cs_api: 'Documentation for developers who connect to Q-smart.', cs_mcp: 'Let AI assistants read Q-smart data safely.',
  cs_import: 'Bring in users, teams and reviews from a file or another tool.', cs_euloc: 'Keep all the company\'s data in the European Union.',
  cs_sandbox: 'A test copy of the company\'s data to try changes safely.', cs_beta: 'Switch new features on or off before everybody gets them.'
};
const RR = { org: ['admin'], privacy: ['admin'], signin: ['admin'], words: ['admin'], qask: STAFFR, qagents: STAFFR, qins: STAFFR, qknow: STAFFR, simsc: ['admin', 'trainer'], entry: ['admin', 'qa'], flags: STAFFR, team: STAFFR, cats: STAFFR, coach: STAFFR, cal: STAFFR, sco: STAFFR, scat: ['admin', 'qa'], roots: ['admin', 'qa'], aqcats: ['admin', 'qa'], users: ['admin'], teams: ['admin'], wsp: ['admin'], skills: ['admin'], audit: ['admin'], wcal: ['admin'], shifts: ['admin'], ltypes: ['admin'], attrules: ['admin'], today: STAFFR };
Object.assign(RR, { sysset: ['admin'], rbuild: STAFFR, rsaved: STAFFR, rexp: STAFFR, planner: ['admin', 'qa', 'lead'], workload: ['admin', 'qa', 'lead'], compliance: STAFFR, risks: STAFFR, complaints: STAFFR, csat: STAFFR, perms: ['admin'], integ: ['admin'], notifs: ['admin'], backup: ['admin'], mailtpl: ['admin'] });
// an admin can change who sees which page (Admin > Roles & permissions); admins always keep the Admin pages
// built on 3 November: Contact support, a form for everybody (support.js)
delete SOON.cs_contact;
// built on 3 November (tools.js): the tools and Feature requests and Release notes for everybody, the settings for admins
['cs_redact', 'cs_scoresim', 'cs_script', 'cs_ideas', 'cs_release'].forEach(k => { delete SOON[k]; });
['cs_sample'].forEach(k => { delete SOON[k]; RR[k] = STAFFR; });
['cs_sbfull', 'cs_sbcompact', 'cs_sbviews', 'cs_brand', 'cs_region', 'cs_announce'].forEach(k => { delete SOON[k]; RR[k] = ['admin']; });
// built on 3 November (help.js): Help Center, My activity and Pins for everybody, Reviewer QA and Topic dashboards for staff, Getting started for admins
['cs_faq', 'cs_videos', 'cs_tours', 'cs_gloss', 'cs_myact', 'cs_pins'].forEach(k => { delete SOON[k]; });
['cs_revqa', 'cs_dashes'].forEach(k => { delete SOON[k]; RR[k] = STAFFR; });
['cs_start'].forEach(k => { delete SOON[k]; RR[k] = ['admin']; });
// built on 3 November (hcedit.js): the editor of the public Help Center website, for admins
RR.cs_hcsite = ['admin'];
// built on 3 November (platform.js): Sandbox, Import data and Beta features, for admins
['cs_sandbox', 'cs_import', 'cs_beta'].forEach(k => { delete SOON[k]; RR[k] = ['admin']; });
// built on 4 November (devs.js): API keys, Developer API, Webhooks and MCP connectors, for admins
['cs_apikeys', 'cs_api', 'cs_webhooks', 'cs_mcp'].forEach(k => { delete SOON[k]; RR[k] = ['admin']; });
// built on 4 November (billing.js): Plan & seats, Invoices and Payment method with Stripe, for admins
['cs_plan', 'cs_invoices', 'cs_payment'].forEach(k => { delete SOON[k]; RR[k] = ['admin']; });
// built on 4 November (quinn-ui.js): Admin › Quinn, the answers, usage and cost of the assistant
RR.cs_quinn = ['admin'];
// built on 3 November (registers.js): no longer coming soon, still for admins only
['cs_ropa', 'cs_subproc', 'cs_dpa', 'cs_consent', 'cs_aireg', 'cs_ainotice', 'cs_breach', 'cs_a11y', 'cs_seclog', 'cs_actsign', 'cs_actexp'].forEach(k => { delete SOON[k]; RR[k] = ['admin']; });
Object.keys(SOON).forEach(k => { RR[k] = ['admin']; });
Object.keys(ROLE).forEach(r => { RR['perm_' + r] = ['admin']; });   // the page of each role in Roles & permissions
const ADMINP = ['perm_agent', 'perm_trainer', 'perm_lead', 'perm_qa', 'perm_admin', 'users', 'teams', 'wsp', 'skills', 'perms', 'integ', 'notifs', 'backup', 'mailtpl', 'audit', 'wcal', 'shifts', 'ltypes', 'attrules'];
ADMINP.push('cs_quinn', 'cs_plan', 'cs_invoices', 'cs_payment', 'cs_apikeys', 'cs_api', 'cs_webhooks', 'cs_mcp', 'cs_sandbox', 'cs_import', 'cs_beta', 'cs_hcsite', 'cs_ropa', 'cs_subproc', 'cs_dpa', 'cs_consent', 'cs_aireg', 'cs_ainotice', 'cs_breach', 'cs_a11y', 'cs_seclog', 'cs_actsign', 'cs_actexp');   // the registers and logs built on 3 November
const own = (o, k) => o && Object.hasOwn(o, k) ? o[k] : undefined;   // only the object's own entries (a link such as #constructor is not a page)
// a person's own choice (Roles & permissions) comes before their role's
const canRoute = k => { if (typeof betaOff === 'function' && betaOff(k)) return false;   // a beta feature an admin switched off (Admin › Beta features) is hidden from everybody
  if (ME.role === 'admin' && ADMINP.includes(k)) return true; const m = own(SET.permu, k); if (m && Object.hasOwn(m, ME.username)) return m[ME.username] === true; const p = own(SET.perm, k) || own(RR, k); return !Array.isArray(p) || p.includes(ME.role); };
// the sidebar as an admin arranged it (Admin › Setup › Sidebar settings): hidden groups and their order; a view saved for the person's role wins
const sbLayout = () => { const s = SET.sidebar || {}; return (ME && (s.views || []).find(v => (v.roles || []).includes(ME.role))) || s; };
const groupsFor = () => { const L = sbLayout(), hide = L.hide || [], ord = L.order || [];
  return GROUPS.map(g => ({ ...g, items: g.items.filter(([k]) => canRoute(k)) })).filter(g => g.items.length && !hide.includes(g.id))
    .sort((a, b) => { const i = ord.indexOf(a.id), j = ord.indexOf(b.id); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); }); };
const groupOf = r => ({ aqlist: 'home', aqgaps: 'home' })[r] || (GROUPS.find(g => g.items.some(([k]) => k === r)) || {}).id;

// ---- dashboard
// stats per agent (current agents, all their reviews inside the list d)
const agS = d => AGENTS().map(u => { const x = d.filter(e => e.agent === u.username); return { u: u.username, n: u.name, team: u.team, k: x.length, a: avg(x.map(e => e.sc)), p: x.length ? x.filter(isPass).length / x.length * 100 : 0 }; });
const lead = e => `<b class=mono style="color:var(--ac)">${esc(e.id)}</b> <small>(${esc(agn(e))})</small><br><small>${f(e.d)} · ${esc(tn(e.tm))}</small>`;

// jump to Call Reviews with some filters already set (used by the dashboard cards)
function goCalls(o = {}) {
  Q = ''; FS = ''; FF = ''; FC = o.ch || ''; FSC = o.sc || null; FA = o.agent || ''; FT = o.agent ? teamOf(o.agent) : (o.team || T || ''); PN = 1; RF = { st: '', fl: '', rv: '', scid: '' };
  if (P === 'year') { FP = 'custom'; F1 = ds(-365); F2 = ds(0); } else if (P === 'custom') { FP = 'custom'; F1 = DF; F2 = DT; } else FP = P;
  KQ = true; if (location.hash === '#calls') render(); else location.hash = 'calls';
}
function viewHist() { Q = ''; FS = ''; FF = ''; FC = ''; FSC = null; FT = ''; FA = ''; PN = 1; RF = { st: '', fl: '', rv: '', scid: '' }; KQ = true; if (location.hash === '#calls') render(); else location.hash = 'calls'; }
const goPage = h => { location.hash = h; };

const PG = {
  tr() {
    const e = EV[TI] || EV[0] || { id: '-', agent: '', sc: 0, tm: '' },
      L = [['Agent', 'Good afternoon, thank you for calling. How can I help you today?', 'Greeting'], ['Customer', 'I received a quote last week but I am not sure it is worth the price.', ''], ['Agent', 'I understand. Let me show you what is included and how it compares.', 'Objection handling'], ['Customer', 'Okay, that sounds reasonable. What are the next steps?', ''], ['Agent', 'I will send the contract now and note everything in your file.', 'Closing']];
    return head('Transcripts', 'Read and annotate calls') + `<div class="g g2"><div>${card('Select a call', EV.slice(0, 6).map((x, i) => `<div class="row li" style="cursor:pointer;${i === TI ? 'font-weight:600' : ''}" onclick="TI=${i};render()"><span class=mono>${esc(x.id)}</span>${sp(x.sc, x.tm)}</div>`).join(''))}</div><div>${card('Lead ' + esc(e.id) + ' · ' + esc(agn(e)), L.map(l => `<div class="msg ${l[0] === 'Agent' ? 'me' : ''}"><small style="color:inherit;opacity:.7">${l[0]}</small><br>${l[1]}${l[2] ? `<br>${pill(l[2], 'ok')}` : ''}</div>`).join(''))}</div></div>`;
  },
};
