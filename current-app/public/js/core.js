// ===================== Q-smart front end: core (constants, state, helpers, API) =====================
const ROLE = { admin: 'Admin', qa: 'QA Specialist', lead: 'Team Lead', trainer: 'Trainer', agent: 'Agent' };
const STAFFR = ['admin', 'qa', 'lead', 'trainer'];                 // everybody who is not an agent
// teams and people come from the server (Admin > Teams / Users). An agent is a user with the role "agent" that belongs to a team.
let TEAMS = [], ROSTER = [];
const tn = id => { const t = TEAMS.find(x => x.id === id); return t ? t.name : ((SET.oldTeams || {})[id] || 'No team'); };
const tcol = id => (TEAMS.find(x => x.id === id) || {}).color || '#64748b';
const an = u => { const r = ROSTER.find(x => x.username === u); return r ? r.name : ''; };
const teamOf = u => { const r = ROSTER.find(x => x.username === u); return r ? r.team : ''; };
const AGENTS = () => ROSTER.filter(r => r.role === 'agent' && r.active).sort((a, b) => a.name.localeCompare(b.name));
const agn = e => an(e.agent) || e.agn || e.agent || '—';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const $ = q => document.querySelector(q), $$ = q => [...document.querySelectorAll(q)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
// a text as a JavaScript string inside onclick="..." (apostrophes, quotes and backslashes in names are all safe)
const jsq = s => esc(JSON.stringify(String(s == null ? '' : s)));
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
// dates follow the chosen language, unless an admin chose a format for everybody (Admin › Regional settings)
const f = d => { const r = (SET.region || {}).date || 'auto'; if (r === 'auto') return d.toLocaleDateString(I18N.locale()); const p = n => String(n).padStart(2, '0'), D = p(d.getDate()), M = p(d.getMonth() + 1), Y = d.getFullYear(); return r === 'ymd' ? `${Y}-${M}-${D}` : r === 'mdy' ? `${M}/${D}/${Y}` : r === 'dmy/' ? `${D}/${M}/${Y}` : `${D}.${M}.${Y}`; };
const fdt = d => { const x = new Date(d), R = SET.region || {}; if ((R.date || 'auto') === 'auto' && (R.time || 'auto') === 'auto') return x.toLocaleString(I18N.locale()); return f(x) + ' ' + x.toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit', ...(R.time === '12' ? { hour12: true } : R.time === '24' ? { hour12: false } : {}) }); };
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ds = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const ini = n => String(n || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();

// ---------------------------------------------------------------- state
const EV = [];                                   // call reviews (agents only receive their own) - only the scored ones, so every average is right
const EVA = [];                                  // every review, also the ones "not scored" (all N/A, decision 14): the Reviews list and the review window
let ME = null, SCS = [], USR = [], REG = [], NF = [], SET = { pass: 85, teams: {} };
let MSG = '', AUTH = new URLSearchParams(location.search).has('reset') ? 'reset' : '';
let route = location.hash.slice(1) || 'dash';
// dashboard filters (T = team id, '' = all teams)
let P = 'all', T = '', DF = ds(-30), DT = ds(0);
// call reviews filters (FT = team id, FA = agent username, '' = all)
let FC = '';                                     // review type filter of Call Reviews ('' = all types)
let Q = '', FT = '', FA = '', FP = 'month', F1 = ds(-30), F2 = ds(0), FS = '', FSC = null, FF = '', SK = 'd', SD = -1, PS = 10, PN = 1, KQ = false;
// overlays: review popup, notifications, account, system settings, resolve dispute, confirm, player, generic form
let MD = null, NO = false, NU = 0, AC = null, SYS = false, RSV = null, CFM = null, PLY = null, DRF = '', FM = null;
let WEL = null, BUSY = {};                       // WEL: the welcome pop-up; BUSY: actions being saved right now (a second click waits)
const NDEL = new Set();                          // notifications deleted a moment ago, still waiting for a possible Undo
// QA entry form + scorecard editor
let ENT = null, ENT0 = '', EDITID = '', SE = null;
// data of the other sections (loaded when you open them)
let SKL = { skills: [], languages: [], counts: { skills: {}, languages: {} } }, WSP = [], RCS = [], CATLIB = [], ACAT = [], AQC = [], AQI = { ai: false };
let AUD = [], TASKS = [], TPLS = [], SESS = [], CALS = [], KB = { folders: [], articles: [], reads: {}, newsletters: [], attempts: [] }, QZ = [], QATT = [], PROG = [], AIS = { enabled: false }, AISET = null, AIDR = [], AIL = { risk: [], summaries: [], plans: [] }, AIT = { needs: [], quizzes: [], plays: [], on: false }, AIRP = { on: false, scenarios: [] }, AIA = { reports: [], periods: {} };
// misc preferences
// COLP = the sidebar setting you chose; COL = what is shown (on screens 1100px wide or less the sidebar is always compact)
let COLP = LS.get('qa_col', false), COL = COLP || innerWidth <= 1100;
let TI = 0, SND = LS.get('qa_sound', 'on') === 'on', SNDS = LS.get('qa_snd_style', 'beep'), VOL = LS.get('qa_vol', 50);
let THM = LS.get('qa_theme', 'system');

// ---------------------------------------------------------------- pass rate thresholds (set in System Settings)
const PASSG = () => +SET.pass || 85;
const PT = tm => { const v = SET.teams && SET.teams[tm]; return (v === undefined || v === null || v === '') ? PASSG() : +v; };
const isPass = e => e.sc >= PT(e.tm);
let THR = null;                                   // a team's own pass rate while a team-specific view is drawn
const gthr = () => THR != null ? THR : PASSG();
const col = v => v >= gthr() ? 'var(--ok)' : v >= 70 ? 'var(--wn)' : v >= 50 ? 'var(--hot)' : 'var(--bad)';   // pass, below target, low, fail
const scol = (v, tm) => { const p = tm == null ? PASSG() : PT(tm); return v >= p ? 'var(--ok)' : v >= Math.min(70, p) ? 'var(--wn)' : 'var(--bad)'; };

// ---------------------------------------------------------------- html helpers
const bar = (v, c = 'var(--ok)') => `<div class=bar><i style="width:${Math.min(100, Math.max(0, v))}%;background:${c}"></i></div>`;
const card = (t, b, x = '') => `<section class="card ${x}">${t ? `<h3>${t}</h3>` : ''}${b}</section>`;
const tbl = (h, rows) => `<div class=sc><table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</table></div>`;
const pill = (t, c = 'ok') => `<span class="pill ${c}">${t}</span>`;
const sp = (v, tm) => { const p = tm == null ? PASSG() : PT(tm); return pill(v + '%', v >= p ? 'ok' : v >= Math.min(70, p) ? 'wn' : 'bad'); };
const head = (t, s, x = '') => `<header class=hd><div><h1>${t}</h1><p class=mu style="margin:4px 0 0">${s}</p></div>${x}</header>`;
const svg = (d, s = 16) => `<svg class=ico width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;   // icons take the colour of the text around them
const IC = {
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
  bin: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
  flag: svg('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  dl: svg('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  play: svg('<path d="M7 4l13 8-13 8z"/>'),
  ch_call: svg('<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>', 14),
  ch_chat: svg('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>', 14),
  ch_email: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', 14),
  ch_other: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>', 14),
  bell: svg('<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>', 18),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 18),
  moon: svg('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>', 18),
  mon: svg('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>', 18),
  vol: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>', 18),
  mute: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/>', 18),
  gear: svg('<path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/>', 18),   // a settings wheel
  g_me: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/>', 22),
  out: svg('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>', 18),
  chev: svg('<path d="M15 6l-6 6 6 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'), check: svg('<path d="M5 13l4 4L19 7"/>'), x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  up: svg('<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>'), zip: svg('<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>'), more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'), list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'), filter: svg('<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>'), copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'),
  // main menu groups
  g_home: svg('<path d="M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2z"/>', 22), g_quality: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>', 22),
  g_sc: svg('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>', 22), g_analytics: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>', 22),
  g_coaching: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', 22), g_learning: svg('<path d="M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2zM12 6v14"/>', 22),
  g_org: svg('<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4"/>', 22), g_qi: svg('<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>', 22),
  g_aisim: svg('<path d="M3 13v-1a9 9 0 0118 0v1"/><rect x="2" y="13" width="5" height="7" rx="2"/><rect x="17" y="13" width="5" height="7" rx="2"/><path d="M19 20a4 4 0 01-4 3h-2"/><path d="M10 9.5l1.5 2 1-3 1.5 2"/>', 22),
  // AI Hub (a chip with a spark), Help Center (a question in a circle), Activity Log (a list with a clock)
  g_aihub: svg('<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>', 22),
  g_help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 3.8M12 17h.01"/>', 22),
  g_activity: svg('<path d="M4 6h9M4 12h6M4 18h6"/><circle cx="17" cy="15" r="4.5"/><path d="M17 13v2l1.3 1.2"/>', 22),
  // the Admin panel (29 October): billing, support, roles, sign-in, messages, GDPR, AI Act, security, accessibility, integrations, data, sandbox, features
  g_bill: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>', 22),
  g_support: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>', 22),
  g_badge: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 1.7-2 3-2s2.4.5 3 2M14 10h4M14 13h3"/>', 22),
  g_key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>', 22),
  g_mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', 22),
  g_shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>', 22),
  g_scale: svg('<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 006 0zM19 7l-3 6a3 3 0 006 0z"/>', 22),
  g_lock: svg('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3M12 14v3"/>', 22),
  g_a11y: svg('<circle cx="12" cy="4.5" r="1.5"/><path d="M5 8l7 1.5L19 8M12 9.5V14l-3 7M12 14l3 7"/>', 22),
  g_plug: svg('<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 01-12 0zM12 17v5"/>', 22),
  g_db: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', 22),
  g_box: svg('<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>', 22),
  g_flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', 22),
  // the apps AI agents (a robot) and Transcripts (a page of text)
  g_robot: svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6M9 13v1M15 13v1M9 17h6M2 13v2M22 13v2"/>', 22),
  g_tr: svg('<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>', 22),
  g_layout: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M13 8h4M13 12h4M13 16h4"/>', 22),   // Sidebar settings
  g_tools: svg('<path d="M21 7l-5 5-3-3 5-5a5 5 0 00-6 7L3 19l2 2 8-8a5 5 0 008-6z"/>', 22), g_admin: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', 22),
  g_people: svg('<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>', 22),
  g_sys: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', 22),
  back: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>', 22),
  // used instead of emoji, so every icon has the same style
  task: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>'), box: svg('<rect x="4" y="4" width="16" height="16" rx="3"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'), repeat: svg('<path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>'), flame: svg('<path d="M12 3c1 3.5 5 5 5 10a5 5 0 01-10 0c0-2.2 1-3.6 2.2-4.6 0 1.8.8 2.9 1.8 3.1 0-3.2-.4-5.8 1-8.5z"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'), book: svg('<path d="M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2zM12 6v14"/>'),
  quiz: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>'), folder: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  spark: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'), link: svg('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
  quote: svg('<path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6"/>'), info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  warn: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'), stack: svg('<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>'),
  medal: svg('<circle cx="12" cy="15" r="6"/><path d="M8.5 10L6 3h4l2 4 2-4h4l-2.5 7"/>'), star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'), bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>'),
  rocket: svg('<path d="M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2M9 13l2 2M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-4-4z"/><circle cx="15" cy="9" r="1.5"/>'), tool: svg('<path d="M21 7l-5 5-3-3 5-5a5 5 0 00-6 7L3 19l2 2 8-8a5 5 0 008-6z"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>'), chat: svg('<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>'),
  cap: svg('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>'), brain: svg('<path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 003 3h1V4zM15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-3 3h-1V4z"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'), heart: svg('<path d="M12 20s-7-4.5-9-9a4.5 4.5 0 018-3.5A4.5 4.5 0 0121 11c-2 4.5-9 9-9 9z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'), globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>'),
  puzzle: svg('<path d="M4 4h6v2a2 2 0 004 0V4h6v6h-2a2 2 0 000 4h2v6h-6v-2a2 2 0 00-4 0v2H4v-6h2a2 2 0 000-4H4z"/>'),
  g_reports: svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 17v-3M12 17v-6M16 17v-2"/>', 22), g_plan: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h3v3H8z"/>', 22),
  g_wf: svg('<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a5 5 0 015-5h3"/><circle cx="17" cy="16" r="5"/><path d="M17 13.5V16l1.6 1.6"/>', 22),
  g_perf: svg('<path d="M12 2l3 6.5 7 1-5 4.8 1.2 7L12 18l-6.2 3.3 1.2-7-5-4.8 7-1z"/>', 22), g_comply: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16h.01"/>', 22)
};
// the Q-smart mark: an orange ring with a yellow tail
const mark = (id, s) => `<svg width="${s}" height="${s}" viewBox="0 0 34 34" aria-hidden="true"><circle cx="15.5" cy="15.5" r="10.5" fill="none" style="stroke:var(--brand)" stroke-width="4.6"/><path d="M22 22l7.5 7.5" stroke="#FFD447" stroke-width="4.6" stroke-linecap="round"/></svg>`;

// ---------------------------------------------------------------- toast (a short message at the bottom) + confirmation pop-up ("Are you sure?")
// toast('Saved') · toast('Could not save', true) · toast('Moved', false, { undo: () => moveBack(), done: () => afterTheUndoChanceIsOver() })
// Errors stay longer, have a close button and are read out by screen readers at once. Pointing at a message pauses it.
function toast(msg, err, o = {}) {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', err ? 'alert' : 'status');
  t.innerHTML = `<span class=ti2>${err ? IC.warn : IC.check}</span><span></span>${o.undo ? '<button type=button class=un2>Undo</button>' : ''}${err || o.undo ? `<button type=button class=tx aria-label="Close">${IC.x}</button>` : ''}`;
  t.children[1].textContent = msg;
  let timer = null, undone = false;
  const close = () => { clearTimeout(timer); if (!t.isConnected) return; t.remove(); if (!undone && o.done) o.done(); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(close, err ? 8000 : o.undo ? 7000 : 3400); };
  t.querySelectorAll('button').forEach(b => { b.onclick = () => { if (b.classList.contains('un2')) { undone = true; o.undo(); } close(); }; });
  t.onmouseenter = () => clearTimeout(timer); t.onmouseleave = arm; t._close = close;
  box.appendChild(t); arm();
  while (box.children.length > 4) box.firstChild._close();     // at most 4 at a time: the oldest one goes first
}
// ask('Title', 'Text', onYes, {yes:'Yes, delete', no:'Cancel', danger:true, onNo:fn, id:'confirm.move-user'})
// id = a ROUTINE confirmation listed in prefs.js that the person may switch off ("Don't ask me again"). Without an id it is a
// safeguard (deleting, unsaved changes, access, passwords ...) and it always asks.
function ask(title, text, fn, o = {}) {
  const id = o.id && PREFMSG.isConfirm(o.id) ? o.id : '';
  if (id && !msgOn(id)) return fn();                          // switched off by this person: do it now (these actions offer Undo instead)
  CFM = { title, text, fn, yes: o.yes || 'Yes', no: o.no || 'No', danger: o.danger, onNo: o.onNo, id, dna: false }; render();
}
function cfY() { const c = CFM; CFM = null; render(); if (c && c.id && c.dna) setPrefs({ dismiss: [c.id] }, 'This will not be asked again. You can switch it back on in My account › Notifications & Confirmations.'); if (c && c.fn) c.fn(); }
function cfN() { const c = CFM; CFM = null; render(); if (c && c.onNo) c.onNo(); }

// ---------------------------------------------------------------- pop-up preferences (My account > Notifications & Confirmations), saved with the person's account
const MYP = () => (ME && ME.prefs) || {};
const msgOn = id => PREFMSG.msgOn(MYP(), id);
async function setPrefs(patch, okMsg, o) {
  const r = await api('/api/prefs', patch, 'PUT');
  if (!r.ok) { if (r.status !== 401) toast(await errOf(r, 'Could not save this setting. Please try again.'), true); return false; }
  ME = await r.json(); render(); if (okMsg) toast(okMsg, false, o); return true;
}

// ---------------------------------------------------------------- language (i18n.js): saved with the account, the sign-in screen uses the last one of this browser
// A person who has never chosen one gets English, unless they picked a language on the sign-in screen just before signing in.
const LPICK = 'qa_lang_picked';
function setLang(code) {
  I18N.set(code); try { sessionStorage.setItem(LPICK, '1'); } catch (e) { /* private window */ }
  if (ME) setPrefs({ lang: I18N.lang }); else render();
}
function userLang() {
  if (MYP().lang) return I18N.set(MYP().lang);
  let picked = false; try { picked = sessionStorage.getItem(LPICK) === '1'; } catch (e) { /* private window */ }
  if (!picked || I18N.lang === 'en') return I18N.set('en');
  api('/api/prefs', { lang: I18N.lang }, 'PUT').then(r => r.ok ? r.json() : null).then(j => { if (j) ME = j; });
}
// the language buttons: native names (flags only as a small extra), the current one is marked for screen readers too
// the language button on Home, next to the bell: the language in use (EN, BG, FR); a click shows the three, in their own words (Gabriela, 29 October)
const langBtn = () => `<details class=lngb><summary class="ib ibx" title="${esc(tr('Language'))}" aria-label="${esc(tr('Language'))}">${IC.globe}<b>${I18N.lang.toUpperCase()}</b></summary><div class=lngl role=menu data-noi18n>${I18N.LANGS.map(l => `<button type=button role=menuitemradio aria-checked="${I18N.lang === l.code}" class="${I18N.lang === l.code ? 'on' : ''}" lang="${l.code}" onclick="setLang('${l.code}')">${l.name}</button>`).join('')}</div></details>`;
const LANGSEL = () => `<div class=sg role=group aria-label="${esc(tr('Language'))}" data-noi18n style="width:fit-content;flex-wrap:wrap">${I18N.LANGS.map(l => `<button type=button class="ibx ${I18N.lang === l.code ? 'on' : ''}" aria-pressed="${I18N.lang === l.code}" lang="${l.code}" onclick="setLang('${l.code}')">${l.name}</button>`).join('')}</div>`;

// ---------------------------------------------------------------- theme, accent colour, sounds
// named themes: the accent colour and the menu colour (light / dark mode is chosen separately)
//   ac = the accent as a fill (buttons, highlights), on = the text on that fill, tl / td = the accent as text in light / dark mode, sb = menu
const THEMES = {
  sport: { n: 'Sport', ac: '#FF6B00', on: '#171717', tl: '#B84A00', td: '#FF8A3D', sb: '#171717', d: 'Charcoal and vivid orange' },
  classic: { n: 'Classic', ac: '#2563eb', on: '#ffffff', tl: '#1d4ed8', td: '#7ea6ff', sb: '#0b1626', d: 'The original blue' },
  ocean: { n: 'Ocean', ac: '#0369a1', on: '#ffffff', tl: '#0369a1', td: '#56c1f2', sb: '#06243a', d: 'Deep sea blues' },
  forest: { n: 'Forest', ac: '#15803d', on: '#ffffff', tl: '#166534', td: '#5ad38c', sb: '#0b2216', d: 'Calm greens' },
  ruby: { n: 'Ruby', ac: '#be123c', on: '#ffffff', tl: '#9f1239', td: '#ff7d9b', sb: '#2a0a14', d: 'Bold crimson' },
  serendipity: { n: 'Serendipity', ac: '#c026d3', on: '#ffffff', tl: '#a21caf', td: '#ef86f7', sb: '#2a1038', d: 'Pink and purple' },
  sunrise: { n: 'Sunrise', ac: '#ea580c', on: '#171717', tl: '#c2410c', td: '#ff9a5c', sb: '#2b1408', d: 'Warm orange' },
  lavender: { n: 'Lavender', ac: '#7c3aed', on: '#ffffff', tl: '#6d28d9', td: '#b493ff', sb: '#1c1236', d: 'Soft violet' },
  mint: { n: 'Mint', ac: '#0d9488', on: '#171717', tl: '#0f766e', td: '#4fd8c8', sb: '#062925', d: 'Fresh teal' },
  midnight: { n: 'Midnight', ac: '#4f46e5', on: '#ffffff', tl: '#4f46e5', td: '#a5a8ff', sb: '#090b1f', d: 'Indigo night' },
  graphite: { n: 'Graphite', ac: '#475569', on: '#ffffff', tl: '#334155', td: '#a9b6c8', sb: '#0f141c', d: 'Quiet greys' }
};
let THN = LS.get('qa_theme_v6', 'sport');          // a new key: the redesign starts everybody on Sport once; any theme can still be picked
function applyTheme() {
  const r = document.documentElement, T0 = THEMES[THN] || THEMES.sport;
  if (THM === 'light' || THM === 'dark') r.dataset.theme = THM; else delete r.dataset.theme;
  [['--brand', T0.ac], ['--on-brand', T0.on], ['--ac-l', T0.tl], ['--ac-d', T0.td], ['--sb', T0.sb]].forEach(([k, v]) => r.style.setProperty(k, v));
}
function th(x) { THM = x || 'system'; LS.set('qa_theme', THM); applyTheme(); if (ME) render(); }
function setTheme(k) { THN = k; LS.set('qa_theme_v6', k); applyTheme(); render(); }
function beep(force) {
  if (!SND && !force) return;
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)(), g = A.createGain(); g.connect(A.destination);
    g.gain.value = (VOL / 100) * 0.2;
    const tone = (fr, t0, d, type) => { const o = A.createOscillator(); o.type = type || 'sine'; o.frequency.value = fr; o.connect(g); o.start(A.currentTime + t0); o.stop(A.currentTime + t0 + d); };
    if (SNDS === 'chime') { tone(660, 0, .15); tone(880, .15, .25); }
    else if (SNDS === 'bell') { tone(1046, 0, .5, 'triangle'); tone(1568, 0, .3, 'triangle'); }
    else tone(880, 0, .13);
  } catch (e) {}
}
function tsnd() { SND = !SND; LS.set('qa_sound', SND ? 'on' : 'off'); render(); }

// ---------------------------------------------------------------- API
async function api(u, b, m) {
  let r;
  try { r = await fetch(u, { method: m || (b ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); }
  catch (e) { return new Response(JSON.stringify({ error: 'Cannot reach the server. Check your connection and try again.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }   // no network: a normal error the page can show
  if (r.status === 401 && ME && u !== '/api/login') { ME = null; MSG = 'Your session expired. Please sign in again.'; render(); }
  return r;
}
async function errOf(r, fallback) { const j = await r.json().catch(() => ({})); return j.error || fallback; }

// loads what the page needs (always the core data, plus the data of the section you are in); returns true when something changed
let LASTSIG = '', DUPD = null;   // DUPD = when new data last arrived from the server (shown at the bottom of every dashboard)
async function load() {
  const g = async u => { try { const r = await api(u); return r.ok ? await r.text() : null; } catch (e) { return null; } };
  const adm = ME && ME.role === 'admin', ed = ME && STAFFR.includes(ME.role), dashy = route === 'dash' || route === 'pers';   // Home › Personalize shows the dashboard widgets too
  const want = [['ev', '/api/evaluations'], ['sc', '/api/scorecards'], ['nf', '/api/notifications'], ['set', '/api/settings'], ['tm', '/api/teams'], ['ro', '/api/roster']];
  if (adm) want.push(['us', '/api/users'], ['rg', '/api/registrations']);
  if (route === 'tasks') { want.push(['tk', '/api/tasks']); if (ed) want.push(['tp', '/api/task-templates'], ['sq', '/api/task-seqs']); }
  if (route === 'agents') want.push(['se', '/api/sessions'], ['tk', '/api/tasks'], ['sm', '/api/simulations']);
  if (['sim', 'simres', 'simsc'].includes(route)) want.push(['sm', '/api/simulations'], ['rp', '/api/ai/roleplay']);
  if (route === 'simsc' && ME && ['admin', 'trainer'].includes(ME.role)) want.push(['ss', '/api/ai/scenarios']);
  if (route === 'rota') want.push(['wr', '/api/wf/rota?team=' + encodeURIComponent(RTM) + '&from=' + RWK]);
  if (route === 'att' || dashy) want.push(['atme', '/api/att/me']);
  if (route === 'att' && ed && ATAB === 'team') want.push(['atday', '/api/att/day?team=' + encodeURIComponent(ATT_T) + '&d=' + ATD]);
  if (route === 'att' && ed && ATAB === 'month') want.push(['atmon', '/api/att/month?team=' + encodeURIComponent(ATT_T) + '&m=' + ATM]);
  if (route === 'leave') want.push(['lvme', '/api/leave']);
  if (route === 'leave' && LTAB === 'cal') want.push(['lvcal', '/api/leave/calendar?team=' + encodeURIComponent(LTM) + '&m=' + LCM]);
  if (route === 'leave' && ed && LTAB === 'bal') want.push(['lvbal', '/api/leave/team?team=' + encodeURIComponent(LTM)]);
  if (route === 'today' || (dashy && ed)) want.push(['tdy', '/api/wf/today?team=' + (route === 'today' ? encodeURIComponent(TDT) : '')]);
  if (route === 'cap' || (dashy && ME && ME.role === 'agent')) want.push(['cap', '/api/cap?month=' + (route === 'cap' ? cpMon() : '') + '&plan=' + encodeURIComponent(CPP) + (route === 'cap' && CPFR ? '&from=' + CPFR : '')]);
  if (route === 'att' && ed && ATAB === 'rep' && ATRQ) want.push(['atrep', '/api/att/report?team=' + encodeURIComponent(ATRTM) + '&from=' + ATRF + '&to=' + ATRT]);
  if (['coach', 'o2o', 'acad'].includes(route) || (dashy && ME && ME.role === 'agent')) want.push(['se', '/api/sessions']);
  if (route === 'o2o') { want.push(['tk', '/api/tasks']); if (ed) want.push(['ot', '/api/o2o-templates']); }   // the one-to-one form shows open tasks and uses the templates
  if (['audit', 'cs_actsign', 'cs_seclog'].includes(route) && adm) want.push(['au', '/api/audit']);
  if (route === 'tasks' || route === 'coach' || dashy) want.push(['tk', '/api/tasks']);
  if (route === 'cal' || (route === 'calendar' && ed)) want.push(['ca', '/api/calibrations']);
  // the new sections: their lists, plus what the Agents page and the dashboard show from them
  const CL = { rbuild: ['reports', 'surveys', 'complaints'], rsaved: ['reports', 'surveys', 'complaints'], goals: ['goals', 'surveys', 'kudos'], pips: ['pips'], kudos: ['kudos'], compliance: ['risks'], risks: ['risks'], complaints: ['complaints'], csat: ['surveys'], calendar: ['pips'], agents: ['goals', 'pips', 'kudos', 'surveys', 'complaints'], dash: ['goals', 'kudos', 'surveys', 'complaints'],
    cs_ropa: ['ropa'], cs_subproc: ['subproc'], cs_dpa: ['dpas'], cs_consent: ['consents'], cs_aireg: ['aireg'], cs_ainotice: ['ainotices'], cs_breach: ['breaches'], cs_a11y: ['a11y'],
    cs_faq: ['faq'], cs_gloss: ['gloss'], cs_videos: ['videos'], cs_tours: ['tours'], cs_pins: ['pins'], cs_revqa: ['revqa'], cs_myact: ['kudos', 'surveys'], cs_dashes: ['surveys', 'revqa', 'pins'], cs_script: ['scripts'], cs_announce: ['announce'], cs_ideas: ['ideas'] };
  if (ME) want.push(['c_announce', '/api/c/announce']);   // the announcements show on every page
  if (route === 'cs_contact') want.push(['su', '/api/support']);
  if (route === 'cs_hcsite' && adm) want.push(['hs', '/api/hc?all=1']);
  if (['cs_apikeys', 'cs_api', 'cs_webhooks', 'cs_mcp'].includes(route) && adm) want.push(['dv', '/api/devinfo']);   // the developer pages (devs.js)
  if (route === 'cs_apikeys' && adm) want.push(['dk', '/api/devkeys']);
  if (route === 'cs_webhooks' && adm) want.push(['wh', '/api/hooks']);
  if (route === 'cs_quinn' && adm) want.push(['qad', '/api/quinn/admin']);   // Admin › Quinn   // the Help Center website, drafts included   // Contact support: my requests (all of them for admins)
  (Object.hasOwn(CL, route) ? CL[route] : []).forEach(c => { if (ME && (!['reports', 'risks', 'complaints'].includes(c) || ed)) want.push(['c_' + c, '/api/c/' + c]); });
  if (['rbuild', 'rsaved', 'goals', 'calendar', 'kudos', 'dash', 'pers'].includes(route)) want.push(['tk', '/api/tasks']);
  if (route === 'calendar') want.push(['se', '/api/sessions']);
  if (route === 'cs_dashes' && ed) want.push(['tk', '/api/tasks'], ['se', '/api/sessions'], ['ca', '/api/calibrations']);   // Topic dashboards
  if ((route === 'rexp' && ed) || (route === 'cs_actexp' && adm)) want.push(['xp', '/api/exports']);
  if (route === 'backup' && adm) want.push(['bk', '/api/backups']);
  if (route === 'integ') want.push(['ai', '/api/ai/status']);
  if (route === 'integ' && adm) want.push(['ais', '/api/ai/settings']);
  if (['kb', 'news', 'acad', 'coach', 'quiz'].includes(route)) want.push(['kb', '/api/kb']);
  if (dashy && ME && ME.role === 'agent') want.push(['kb', '/api/kb'], ['qz', '/api/quizzes']);
  if (['quiz', 'acad'].includes(route)) want.push(['qz', '/api/quizzes']);
  if (['kb', 'acad', 'coach', 'dash', 'pers'].includes(route) && ed) want.push(['pg', '/api/kb/progress']);
  if (['kb', 'quiz', 'qask', 'qagents', 'qins', 'qknow'].includes(route)) want.push(['ai', '/api/ai/status']);
  if (route === 'qknow') want.push(['qk', '/api/qi/knowledge']);
  if (route === 'qins') want.push(['qn', '/api/qi/insights'], ['qt', '/api/qi/topics?days=' + QI.days]);
  want.push(['sk', '/api/skills'], ['rc', '/api/root-causes'], ['qf', '/api/qflags']);
  if (['users', 'teams', 'wsp', 'sco', 'skills', 'dash', 'pers'].includes(route)) want.push(['ws', '/api/workspaces']);
  if (['sco', 'scat'].includes(route)) want.push(['cl', '/api/categories']);
  if (['autoqa', 'aqcats', 'aqlist', 'aqgaps', 'dash', 'pers'].includes(route)) want.push(['ac', '/api/auto-cats']);
  if (['autoqa', 'aqlist', 'aqgaps', 'dash', 'pers'].includes(route)) want.push(['aq', '/api/autoqa']);
  if (['autoqa', 'dash', 'pers'].includes(route) && ME && ['admin', 'qa'].includes(ME.role)) want.push(['ad', '/api/ai/drafts']);
  if (['autoqa', 'dash', 'pers'].includes(route) && ed) want.push(['al', '/api/ai/lead'], ['at', '/api/ai/trainer'], ['aa', '/api/ai/analyst']);
  const got = await Promise.all(want.map(w => g(w[1]))), R = {};
  want.forEach((w, k) => { R[w[0]] = got[k]; });
  const sig = got.join('|'), changed = sig !== LASTSIG; LASTSIG = sig; if (changed) DUPD = new Date();
  if (R.ro) ROSTER = JSON.parse(R.ro);
  if (R.tm) TEAMS = JSON.parse(R.tm);
  if (R.ev) EVA.splice(0, EVA.length, ...JSON.parse(R.ev).map(x => ({ ...x, d: new Date(x.d), ra: x.at ? new Date(x.at) : null, tm: teamOf(x.agent) || x.tid || '', tmh: x.tid || '' })));   // tm = the agent's CURRENT team, tmh = the team at review time
  if (R.ev) EV.splice(0, EV.length, ...EVA.filter(e => !e.ns));
  if (R.sc) SCS = JSON.parse(R.sc);
  if (R.nf) NF = JSON.parse(R.nf).filter(n => !NDEL.has(n.id));   // a notification waiting for its Undo stays hidden
  if (R.set) SET = JSON.parse(R.set);
  if (R.us) USR = JSON.parse(R.us);
  if (R.rg) REG = JSON.parse(R.rg);
  if (R.tk) TASKS = JSON.parse(R.tk);
  if (R.tp) TPLS = JSON.parse(R.tp);
  if (R.sq) TSEQ = JSON.parse(R.sq);
  if (R.ot) O2TPL = JSON.parse(R.ot);
  if (R.qk) QI.know = JSON.parse(R.qk);
  if (R.qn) QI.ins = JSON.parse(R.qn).filter(x => x.by === ME.username);
  if (R.qt) QI.top = JSON.parse(R.qt);
  if (R.se) SESS = JSON.parse(R.se);
  if (R.sm) SIMS = JSON.parse(R.sm);
  if (R.ss) SCNS = JSON.parse(R.ss);
  if (R.qf) QF = JSON.parse(R.qf);
  if (R.su) SUPR = JSON.parse(R.su);
  if (R.hs) HCS = JSON.parse(R.hs);
  if (R.dv) DEVI = JSON.parse(R.dv);
  if (R.dk) DEVK = JSON.parse(R.dk);
  if (R.wh) DEVH = JSON.parse(R.wh);
  if (R.qad) QNA = JSON.parse(R.qad);
  Object.keys(R).filter(k => k.startsWith('c_') && R[k]).forEach(k => { CO[k.slice(2)] = JSON.parse(R[k]); });
  if (R.xp) XPS = JSON.parse(R.xp);
  if (R.bk) BKS = JSON.parse(R.bk);
  if (R.au) AUD = JSON.parse(R.au);
  if (R.ca) CALS = JSON.parse(R.ca);
  if (R.kb) KB = JSON.parse(R.kb);
  if (R.qz) { const q = JSON.parse(R.qz); QZ = q.quizzes; QATT = q.attempts; }
  if (R.pg) PROG = JSON.parse(R.pg);
  if (R.ai) AIS = JSON.parse(R.ai);
  if (R.ad) AIDR = JSON.parse(R.ad);
  if (R.al) AIL = JSON.parse(R.al);
  if (R.at) AIT = JSON.parse(R.at);
  if (R.rp) AIRP = JSON.parse(R.rp);
  if (R.wr) { ROTA = JSON.parse(R.wr); if (ROTA.team) RTM = ROTA.team; }
  if (R.atme) { ATTD = JSON.parse(R.atme); ATTF = Date.now(); }
  if (R.atday) { ATDAY = JSON.parse(R.atday); if (ATDAY.team) ATT_T = ATDAY.team; ATD = ATDAY.d; }
  if (R.atmon) { ATMON = JSON.parse(R.atmon); if (ATMON.team) ATT_T = ATMON.team; ATM = ATMON.m; }
  if (R.lvme) LVD = JSON.parse(R.lvme);
  if (R.lvcal) { LCAL = JSON.parse(R.lvcal); if (LCAL.team) LTM = LCAL.team; LCM = LCAL.m; }
  if (R.lvbal) { LBAL = JSON.parse(R.lvbal); if (LBAL.team) LTM = LBAL.team; }
  if (R.tdy) TDY = JSON.parse(R.tdy);
  if (R.cap) { CAP = JSON.parse(R.cap); if (CAP.plan) CPP = CAP.plan.id; }
  if (R.atrep) { ATREP = JSON.parse(R.atrep); ATRQ = false; ATRF = ATREP.from; ATRT = ATREP.to; }
  if (R.aa) AIA = JSON.parse(R.aa);
  if (R.ais) AISET = JSON.parse(R.ais);
  if (R.sk) SKL = JSON.parse(R.sk);
  if (R.rc) RCS = JSON.parse(R.rc);
  if (R.ws) WSP = JSON.parse(R.ws);
  if (R.cl) CATLIB = JSON.parse(R.cl);
  if (R.ac) ACAT = JSON.parse(R.ac);
  if (R.aq) { const j = JSON.parse(R.aq); ACAT = j.cats; AQC = j.conversations.map(c => ({ ...c, dt: new Date(c.date + 'T12:00:00') })); AQI = { ai: j.ai }; }
  return changed;
}

// ---------------------------------------------------------------- generic form pop-up (used by teams, users, folders, tasks, sessions ...)
// openForm({title, fields:[{k,l,t,o,req,ph,hint,show,re}], d:{...}, save: async d => 'error text' | undefined, w, extra: () => html, yes:'Save'})
function openForm(o) { FM = { w: 560, yes: 'Save', ...o, d: JSON.parse(JSON.stringify(o.d || {})) }; render(); }
function fmSet(k, v, re) { FM.d[k] = v; if (re) render(); }
function fmTog(k, v, on) { const a = FM.d[k] = FM.d[k] || []; const i = a.indexOf(v); if (on && i < 0) a.push(v); if (!on && i >= 0) a.splice(i, 1); }
function fmLines(k, s) { FM.d[k] = s.split('\n').map(x => x.trim()).filter(Boolean); }
function fmChips(k, s) { FM.d[k] = s.split(',').map(x => x.trim()).filter(Boolean); }
// ---- picker: selected values appear as bubbles, a drop-down adds more from the catalog (admins can also create a new one)
let ACD = {}, PKN = null;                                                  // ACD: values being edited in My account; PKN: "create new" box that is open
const pkObj = scope => scope === 'fm' ? FM.d : ACD;
const pkOpts = kind => (kind === 'languages' ? SKL.languages : SKL.skills) || [];
function pkHtml(scope, k, kind) {
  const sel = pkObj(scope)[k] || [], opts = pkOpts(kind).filter(x => !sel.includes(x)), one = kind === 'languages' ? 'language' : 'skill', open = PKN && PKN.scope === scope && PKN.k === k;
  return `<div class=pk><div class=pkb>${sel.map(x => `<span class=tg>${esc(x)} <a href="javascript:void(0)" onclick="pkDel('${scope}','${k}',${jsq(x)})" title="Remove ${esc(x)}" aria-label="Remove ${esc(x)}">×</a></span>`).join('') || `<small class=mu>No ${kind} chosen</small>`}</div>`
    + (open ? `<div class=row style="gap:6px;margin-top:6px"><input id=pkn placeholder="New ${one}" style="flex:1" onkeydown='if(event.key=="Enter")pkMake("${scope}","${k}","${kind}")'><button type=button class=btn onclick="pkMake('${scope}','${k}','${kind}')">Create</button><button type=button class=ib onclick="PKN=null;render()">Cancel</button></div>`
      : `<select style="margin-top:6px" onchange="pkAdd('${scope}','${k}','${kind}',this.value)"><option value="">+ Add ${one}…</option>${opts.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}${ME && ME.role === 'admin' ? `<option value="__new__">＋ Create a new ${one}…</option>` : ''}</select>`) + `</div>`;
}
function pkAdd(scope, k, kind, v) { if (!v) return; if (v === '__new__') { PKN = { scope, k, kind }; render(); setTimeout(() => { const i = $('#pkn'); if (i) i.focus(); }, 30); return; } const o = pkObj(scope); o[k] = o[k] || []; if (!o[k].includes(v)) o[k].push(v); render(); }
function pkDel(scope, k, v) { const o = pkObj(scope); o[k] = (o[k] || []).filter(x => x !== v); render(); }
async function pkMake(scope, k, kind) {
  const name = ($('#pkn').value || '').trim(); if (!name) return;
  const r = await api('/api/skills', { kind: kind === 'languages' ? 'language' : 'skill', name }); if (!r.ok) return toast(await errOf(r, 'Could not create it'), true);
  const j = await r.json(); const s = await api('/api/skills'); if (s.ok) SKL = await s.json();
  const o = pkObj(scope); o[k] = o[k] || []; if (!o[k].includes(j.name)) o[k].push(j.name); PKN = null; render(); toast('Created and added');
}
// ---- table / boxes switch for the admin lists
let VW = LS.get('qa_views', {});
const vw = k => VW[k] || 'table';
const vwSet = (k, v) => { VW[k] = v; LS.set('qa_views', VW); render(); };
const vwBtn = k => `<div class=sg style="height:38px"><button class="${vw(k) === 'table' ? 'on' : ''}" onclick="vwSet('${k}','table')" title="Table view">${IC.list}</button><button class="${vw(k) === 'boxes' ? 'on' : ''}" onclick="vwSet('${k}','boxes')" title="Boxes view">${IC.grid}</button></div>`;

// the colours of a task or a template: White = no colour (Gabriela, 29 October)
const TCOL = [['', 'White'], ['#ef4444', 'Red'], ['#f97316', 'Orange'], ['#eab308', 'Yellow'], ['#22c55e', 'Green'], ['#14b8a6', 'Teal'], ['#3b82f6', 'Blue'], ['#a855f7', 'Purple'], ['#ec4899', 'Pink'], ['#334155', 'Dark']];
const SWATCH = ['#ea580c', '#2563eb', '#7c3aed', '#0d9488', '#e11d48', '#16a34a', '#ca8a04', '#475569'];
// folder icons: the data keeps the emoji it always had (so other versions of the app still read it), the page draws it as a line icon
const FICONS = [['📁', 'folder'], ['📘', 'book'], ['🧭', 'compass'], ['💡', 'bulb'], ['🎯', 'target'], ['🚀', 'rocket'], ['⭐', 'star'], ['🔥', 'flame'], ['🛠️', 'tool'], ['📞', 'phone'],
  ['💬', 'chat'], ['🎓', 'cap'], ['🧠', 'brain'], ['🏆', 'trophy'], ['📊', 'chart'], ['✅', 'check'], ['❤️', 'heart'], ['🔒', 'lock'], ['🌍', 'globe'], ['🧩', 'puzzle']];
const FICON_ALIAS = { '📗': 'book', '📙': 'book', '📕': 'book', '📒': 'book', '🗂️': 'stack', '🛠': 'tool', '❤': 'heart' };
const ficon = e => { const k = (FICONS.find(x => x[0] === e) || [])[1] || FICON_ALIAS[e]; return k && IC[k] ? IC[k] : esc(e || ''); };
function fmField(f) {
  if (f.show && !f.show(FM.d)) return '';
  if (f.t === 'h') return `<div class=fmh>${esc(f.l)}</div>`;                       // a small heading between groups of fields
  const v = FM.d[f.k], L = `${esc(f.l || '')}${f.req ? ' <i class=rq>*</i>' : ''}`, hint = f.hint ? `<small class=mu>${esc(f.hint)}</small>` : '';
  const k = f.k, opts = typeof f.o === 'function' ? f.o(FM.d) : (f.o || []);
  if (f.t === 'textarea') return `<label>${L}<textarea rows=${f.rows || 3} placeholder="${esc(f.ph || '')}" oninput="fmSet('${k}',this.value)">${esc(v)}</textarea>${hint}</label>`;
  if (f.t === 'select') return `<label>${L}<select onchange="fmSet('${k}',this.value,${f.re ? 1 : 0})">${opts.map(([a, b]) => `<option value="${esc(a)}" ${String(v) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>${hint}</label>`;
  if (f.t === 'multi') return `<div><b style="font-size:12.5px">${L}</b><div class=chk style="margin-top:6px">${opts.map(([a, b]) => `<label class=rad><input type=checkbox ${(v || []).includes(a) ? 'checked' : ''} onchange="fmTog('${k}',${jsq(a)},this.checked)"> ${esc(b)}</label>`).join('') || '<small class=mu>Nothing to choose from yet</small>'}</div>${hint}</div>`;
  if (f.t === 'lines') return `<label>${L}<textarea rows=${f.rows || 3} placeholder="${esc(f.ph || 'one per line')}" oninput="fmLines('${k}',this.value)">${esc((v || []).join('\n'))}</textarea>${hint}</label>`;
  if (f.t === 'picker') return `<div><b style="font-size:12.5px">${L}</b>${pkHtml('fm', k, f.kind)}</div>`;
  if (f.t === 'chips') return `<label>${L}<input placeholder="${esc(f.ph || 'separate with commas')}" value="${esc((v || []).join(', '))}" oninput="fmChips('${k}',this.value)">${hint}</label>`;
  if (f.t === 'checkbox') return `<label class=rad><input type=checkbox ${v ? 'checked' : ''} onchange="fmSet('${k}',this.checked,${f.re ? 1 : 0})"> <span>${L}${hint ? '<br>' + hint : ''}</span></label>`;
  if (f.t === 'color') return `<div><b style="font-size:12.5px">${L}</b><div class=sw>${(f.o ? opts : SWATCH.map(c => [c, c])).map(([c, n]) => `<button type=button class="${(v || '') === c ? 'on' : ''} ${c ? '' : 'none'}" style="background:${c || '#fff'}" onclick="fmSet('${k}','${c}',1)" title="${esc(n)}" aria-label="Colour ${esc(n)}" aria-pressed="${(v || '') === c}"></button>`).join('')}</div></div>`;
  // steps: one row each (title, description, minutes), moved up or down, removed, and "+ Add step" (Gabriela, 29 October)
  if (f.t === 'steps') { const l = v || []; return `<div><b style="font-size:12.5px">${L}${l.length ? ` (${l.length})` : ''}</b><div class=fst>${l.map((x, i) => `<div class=fsr><span class=fsn>${i + 1}.</span><div class=fsb><input placeholder="Step title *" aria-label="Step title" value="${esc(x.t)}" oninput="fmStep('${k}',${i},'t',this.value)"><div class=fsl><input placeholder="Description" aria-label="Description" value="${esc(x.d || '')}" oninput="fmStep('${k}',${i},'d',this.value)">${f.pages ? `<select aria-label="Page" onchange="fmStep('${k}',${i},'pg',this.value)">${f.pages().map(([a, b]) => `<option value="${esc(a)}" ${x.pg === a ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>` : `<input type=number min=0 max=600 placeholder="min" title="Minutes" aria-label="Minutes" value="${x.min || ''}" oninput="fmStep('${k}',${i},'min',Math.max(0,parseInt(this.value)||0))">`}</div></div><div class=fsa><button type=button class=ic onclick="fmStepMv('${k}',${i},-1)" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button type=button class=ic onclick="fmStepMv('${k}',${i},1)" ${i < l.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button type=button class=ic onclick="fmStepDel('${k}',${i})" aria-label="Remove this step">✕</button></div></div>`).join('')}<button type=button class="ib fsadd" onclick="fmStepAdd('${k}')">+ Add step</button></div>${hint}</div>`; }
  if (f.t === 'icon') return `<div><b style="font-size:12.5px">${L}</b><div class=emo>${FICONS.map(([c, n]) => `<button type=button class="${v === c || FICON_ALIAS[v] === n ? 'on' : ''}" onclick="fmSet('${k}',${jsq(c)},1)" title="${n}" aria-label="Icon ${n}" aria-pressed="${v === c}">${IC[n]}</button>`).join('')}</div></div>`;
  return `<label>${L}<input ${f.id ? 'id=' + f.id : ''} type="${f.t || 'text'}" placeholder="${esc(f.ph || '')}" value="${esc(v)}" ${f.max ? 'maxlength=' + f.max : ''} oninput="fmSet('${k}',this.value,${f.re ? 1 : 0});${f.on ? f.on + '(this.value)' : ''}">${hint}</label>`;
}
function fmStep(k, i, p, v) { const l = FM.d[k] || []; if (l[i]) l[i][p] = v; }   // typing in a step: no redraw, the cursor stays
function fmStepAdd(k) { const f = (FM.fields || []).find(x => x.k === k) || {}; FM.d[k] = [...(FM.d[k] || []), { t: '', d: '', min: 0, ...(f.pages ? { pg: (f.pages()[0] || [''])[0] } : {}) }]; render(); setTimeout(() => { const l = $('.fst .fsr'); const x = l[l.length - 1]; if (x) x.querySelector('input').focus(); }, 30); }
function fmStepMv(k, i, by) { const l = FM.d[k] || [], j = i + by; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; render(); }
function fmStepDel(k, i) { (FM.d[k] || []).splice(i, 1); render(); }
async function fmSave() {
  const f = FM; if (!f || f.busy) return;                     // a second click while saving would create everything twice
  f.busy = true; render(); let err;
  try { err = await f.save(f.d); } finally { f.busy = false; }
  if (typeof err === 'string') { render(); return toast(err, true); }
  if (FM === f) FM = null; render();
}
const FMM = () => OVL(`<div class=mh><h2>${esc(FM.title)}</h2>${X('FM=null;render()')}</div><div class=mb><div class=form style="max-width:none">${(FM.fields || []).map(fmField).join('')}</div>${FM.extra ? FM.extra(FM.d) : ''}<div class=acts><button class=ib onclick="FM=null;render()">Cancel</button><button class=btn onclick="fmSave()" ${FM.busy ? 'disabled' : ''}>${FM.busy ? 'Saving…' : esc(FM.yes)}</button></div></div>`, 'FM=null;render()', FM.w, 70, FM.drawer ? 'drw' : '');   // drawer: the form slides in from the right (users, teams)
// ---- a click that saves runs only once at a time: once('key', async () => ...) ignores further clicks until the first one has finished
async function once(key, fn) { if (BUSY[key]) return; BUSY[key] = true; try { return await fn(); } finally { delete BUSY[key]; } }

// ---------------------------------------------------------------- password rules (the same checks run on the server)
const PWR = [['At least 6 characters', p => p.length >= 6], ['Uppercase and lowercase letters', p => /[a-z]/.test(p) && /[A-Z]/.test(p)], ['A number', p => /\d/.test(p)], ['A special character (e.g. ! @ # $)', p => /[^A-Za-z0-9]/.test(p)]];
const pwOk = p => PWR.every(r => r[1](p));
const pwBox = (withMatch = true) => `<ul class=pwl id=pwl>${PWR.map(r => `<li>○ ${r[0]}</li>`).join('')}${withMatch ? '<li>○ Both passwords match</li>' : ''}</ul>`;
function pwUpd() {
  const a = $('#pn1'), b = $('#pn2'), l = $('#pwl'); if (!a || !l) return;
  const p = a.value, one = x => `<li class="${x[1] ? 'ok' : ''}">${x[1] ? '✓' : '○'} ${x[0]}</li>`;
  l.innerHTML = PWR.map(r => one([r[0], r[1](p)])).join('') + (b ? one(['Both passwords match', !!b.value && b.value === p]) : '');
}

// ---------------------------------------------------------------- review types: a review can be about a call, a chat, an email or another conversation
// (old reviews have no type: they are calls). Every scorecard says which types it is used for (chs; old scorecards: calls).
const CHS = ['call', 'chat', 'email', 'other'];
const CHN = { call: 'Call', chat: 'Chat', email: 'Email', other: 'Other' }, CHP = { call: 'Calls', chat: 'Chats', email: 'Emails', other: 'Other' };
const CHC = { call: 'var(--ac)', chat: '#8b5cf6', email: '#f59e0b', other: '#14b8a6' };
const chOf = e => (e && e.ch) || 'call';
// a scorecard's tags (free words such as Calls, Chats, B2C, Retention): they show what it is made for and filter the list, but any scorecard
// can score any review. Older scorecards without tags show the review types they were made for.
const scTags = s => s && Array.isArray(s.tags) && s.tags.length ? s.tags : (s && s.chs && s.chs.length ? s.chs : []).map(k => CHP[k]);
const tagChip = t => `<span class=sctag>${esc(t)}</span>`;
const chTag = (ch, short) => `<span class=cht style="--c:${CHC[ch]}" title="${CHN[ch]}">${IC['ch_' + ch]}${short ? '' : ' ' + CHN[ch]}</span>`;
// "All types / Calls / Chats / Emails / Other" buttons with how many reviews and their average; only types that have reviews are shown
// (always = every type is shown, also with 0 reviews, so the switch is there even when all reviews are calls)
const chChips = (list, cur, fn, always) => { const c = k => list.filter(e => !k || chOf(e) === k); const used = always ? CHS : CHS.filter(k => c(k).length);
  return used.length < 2 && !cur ? '' : `<div class=chchips>${['', ...used].map(k => { const l = c(k), a = avg(l.map(e => e.sc)); return `<button class="chchip ${cur === k ? 'on' : ''} ${l.length ? '' : 'zero'}" style="--c:${k ? CHC[k] : 'var(--ac)'}" onclick="${fn}('${k}')">${k ? IC['ch_' + k] : ''}${k ? CHP[k] : 'All types'} <b>(${l.length})</b>${l.length ? `<b class=chav>${a.toFixed(0)}%</b>` : ''}</button>`; }).join('')}</div>`; };
const chSel = (cur, on) => `<select onchange="${on}"><option value="">All types</option>${CHS.map(k => `<option value=${k} ${cur === k ? 'selected' : ''}>${CHP[k]}</option>`).join('')}</select>`;

// ---------------------------------------------------------------- the new sections keep their records in simple lists (CO.goals, CO.pips, CO.kudos ...)
const CO = {};
let XPS = [], BKS = [];
// save one record; returns an error text or nothing (so it can be used as the save of a form)
async function coSave(c, x) { const { id, ...b } = x; const r = await api('/api/c/' + c + (id ? '/' + id : ''), b, id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save'); await load(); render(); toast('Saved'); }
async function coPatch(c, id, b, msg) { const r = await api('/api/c/' + c + '/' + id, b, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); if (msg) toast(msg); }
const coDel = (c, id, what) => ask('Delete this ' + what + '?', 'It is removed for everybody. This cannot be undone.', async () => { const r = await api('/api/c/' + c + '/' + id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete'), true); await load(); render(); toast('Deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
