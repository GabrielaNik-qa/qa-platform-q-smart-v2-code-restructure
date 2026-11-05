// ===================== Sign-in / register screens, sidebar, router, start-up =====================
// the big sign-in logo: the Q ring with sound waves going out to both sides
const LOGO = `<svg viewBox="0 0 480 130" width="100%" style="max-width:560px" aria-hidden="true"><defs><linearGradient id="lq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB020"/><stop offset=".55" stop-color="#FF6B00"/><stop offset="1" stop-color="#FF5C8A"/></linearGradient><linearGradient id="lr" gradientUnits="userSpaceOnUse" x1="340" y1="0" x2="476" y2="0"><stop offset="0" stop-color="#FF6B00"/><stop offset="1" stop-color="#FF6B00" stop-opacity="0"/></linearGradient><linearGradient id="ll" gradientUnits="userSpaceOnUse" x1="140" y1="0" x2="4" y2="0"><stop offset="0" stop-color="#FF6B00"/><stop offset="1" stop-color="#FF6B00" stop-opacity="0"/></linearGradient></defs>`
  + `<g fill="none" stroke-linecap="round"><path d="M298,42 Q308,62 298,82" stroke="#FFD447" stroke-width="6"/><path d="M314,32 Q328,62 314,92" stroke="#FF9A1F" stroke-width="6"/><path d="M330,24 Q348,62 330,100" stroke="#FF6B00" stroke-width="6"/>`
  + `<path d="M182,42 Q172,62 182,82" stroke="#FFD447" stroke-width="6"/><path d="M166,32 Q152,62 166,92" stroke="#FF9A1F" stroke-width="6"/><path d="M150,24 Q132,62 150,100" stroke="#FF5C8A" stroke-width="6"/>`
  + `<path d="M352,62 q8,-16 16,0 q8,12 16,0 q8,-9 16,0 q8,6 16,0 q8,-4 16,0 q8,2 16,0 L476,62" stroke="url(#lr)" stroke-width="3"/><path d="M128,62 q-8,-16 -16,0 q-8,12 -16,0 q-8,-9 -16,0 q-8,6 -16,0 q-8,-4 -16,0 q-8,2 -16,0 L4,62" stroke="url(#ll)" stroke-width="3"/></g>`
  + `<circle cx="240" cy="62" r="40" fill="none" stroke="url(#lq)" stroke-width="10"/><path d="M266,90 L286,110" stroke="#FF5C8A" stroke-width="10" stroke-linecap="round"/></svg>`;
const EYE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
let LU = '';
const tp = id => { const i = $('#' + id); i.type = i.type === 'password' ? 'text' : 'password'; };
const en = fn => `onkeydown='if(event.key=="Enter")${fn}()'`;
const pwf = (id, label, extra = '') => `<label>${label}<div class=pw><input id=${id} type=password ${extra}><button type=button class=eye onclick="tp('${id}')" aria-label="Show or hide password">${EYE}</button></div></label>`;
const LG = () => {
  const m = MSG ? `<small class=lgok role=status>${esc(MSG)}</small>` : '';
  const f = AUTH === 'forgot' ? `<h1>Reset your password</h1><p class=lgs style="line-height:1.5">Enter your email address or username: we will send you a link to choose a new password.</p><label>Email address or username<input class=wh id=lu placeholder="Enter your email" ${en('forgot')}></label>${m}<div id=lge role=alert></div><button class=sbtn onclick=forgot()>Send reset email</button><a class=lgk href="#" onclick="AUTH='';MSG='';render();return false">← Back to sign in</a>`
    : AUTH === 'reset' ? `<h1>New password</h1><p class=lgs>Choose a strong password.</p>${pwf('pn1', 'New password', 'oninput="pwUpd()"')}${pwf('pn2', 'Confirm new password', 'oninput="pwUpd()" ' + en('reset'))}${pwBox()}<div id=lge role=alert></div><button class=sbtn onclick=reset()>Save password</button>`
    : AUTH === 'register' ? `<h1>Create account</h1><p class=lgs style="line-height:1.5">Your registration will be reviewed by an administrator. You will get an email when it is approved.</p><label>First name<input id=rf autocomplete=given-name oninput="ruUpd()"></label><label>Last name<input id=rl autocomplete=family-name oninput="ruUpd()"></label><label>Email address<input id=re type=email autocomplete=email></label><label>Username (made automatically)<input id=ru readonly placeholder="e.g. g.pencheva" style="opacity:.8"></label><p class=lgs style="margin:0;line-height:1.5">Your initial password will be <b>password</b>. You will receive it by email once your registration is approved, and you will choose a new one at your first login.</p><div id=rge role=alert></div><button class=sbtn onclick=register()>Request access</button><a class=lgk href="#" onclick="AUTH='';MSG='';render();return false">← Back to sign in</a>`
    : `<h1>Sign in</h1><label>Username or email<input id=lu autocomplete=username value="${esc(LU)}" oninput="LU=this.value" ${en('login')}></label>${pwf('lp', 'Password', 'autocomplete=current-password ' + en('login'))}${m}<div id=lge role=alert></div><button class=sbtn onclick=login()>Sign in</button><a class=lgk href="#" onclick="AUTH='forgot';MSG='';render();return false">Forgot your password?</a>${NOTICE && NOTICE.signup ? `<button class=rgb onclick="AUTH='register';MSG='';render()">Register</button>` : ''}${NOTICE && NOTICE.note ? `<div class=lgnote><b>${esc(NOTICE.company || tr('Privacy'))}</b><p data-noi18n>${esc(NOTICE.note)}</p></div>` : ''}`;
  // centered (Gabriela, 4 November): the dark stage in dark mode, the warm card in light mode; the light/dark switch and the language globe on top
  const dk = lgDark(), L = I18N.LANGS.find(l => l.code === I18N.lang) || I18N.LANGS[0];
  return `<div class=lg><header class=lgtop><div class=lgb>${mark('mg', 30)}<b>Q-SMART</b></div><div class=lgtools>`
    + `<button class=lgic onclick="lgTheme()" aria-label="${esc(tr(dk ? 'Light mode' : 'Dark mode'))}" title="${esc(tr(dk ? 'Light mode' : 'Dark mode'))}">${dk ? IC.sun : IC.moon}</button>`
    + `<details class=lglang><summary class=lgic aria-label="${esc(tr('Language'))}: ${esc(L.name)}" title="${esc(tr('Language'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><span>${esc(L.code.toUpperCase())}</span></summary>`
    + `<div class=lglangl data-noi18n>${I18N.LANGS.map(l => `<button type=button lang="${l.code}" class="${I18N.lang === l.code ? 'on' : ''}" onclick="setLang('${l.code}')">${esc(l.name)}</button>`).join('')}</div></details></div></header>`
    + `<main class=lgc><div class=lgw>${LOGO}</div><div class=lgf>${f}</div></main><footer class=lgfoot><a href="/hc/" target=_blank rel=noopener>${tr('Help Center')}</a><span>© ${new Date().getFullYear()} Q-smart</span></footer></div>`;
};
// the sign-in screen follows the light / dark choice (or the computer's when none was made); the switch on top changes it
const lgDark = () => THM === 'dark' || (THM !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
const lgTheme = () => { th(lgDark() ? 'light' : 'dark'); render(); };
const lerr = (id, m) => { const e = $(id); if (e) e.innerHTML = `<small class=lgerr>${esc(m)}</small>`; };
async function login() {
  qlShow('beat', 'Q');                                          // the heartbeat plays until the first page is ready (boot hides it)
  const r = await api('/api/login', { username: $('#lu').value, password: $('#lp').value });
  if (!r.ok) qlHide();
  if (r.ok) { MSG = ''; LU = ''; OG = ''; SPO = []; foldAll(); welAgain((await r.json()).username); await boot(); if (ME && location.hash !== '#dash') { OGKEEP = true; location.hash = 'dash'; } } else lerr('#lge', await errOf(r, 'Could not sign in'));   // a new sign-in may show the welcome again
}
// username = first letter of the first name + "." + last name (the server makes the same one, this is just the preview)
const plainName = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function ruUpd() { const f = plainName($('#rf').value), l = plainName($('#rl').value); $('#ru').value = f && l ? f[0] + '.' + l : ''; }
async function register() {
  const r = await api('/api/register', { firstName: $('#rf').value, lastName: $('#rl').value, email: $('#re').value });
  if (!r.ok) return lerr('#rge', await errOf(r, 'Could not register'));
  AUTH = ''; MSG = 'Registration received! It is pending approval by an administrator. We emailed you a confirmation.'; render();
}
async function forgot() { const r = await api('/api/forgot', { identifier: $('#lu').value.trim() }); if (!r.ok) return lerr('#lge', await errOf(r, 'Could not send the email')); MSG = 'If that account has an email address, a reset link has been sent.'; render(); }
async function reset() {
  const q = new URLSearchParams(location.search), p = $('#pn1').value;
  if (!pwOk(p)) return lerr('#lge', 'The password does not meet the requirements');
  if (p !== $('#pn2').value) return lerr('#lge', 'The two passwords do not match');
  const r = await api('/api/reset', { username: q.get('u'), token: q.get('reset'), password: p });
  if (r.ok) { history.replaceState(null, '', '/'); AUTH = ''; MSG = 'Password changed. Please sign in.'; render(); } else lerr('#lge', await errOf(r, 'Reset failed'));
}
async function out() { await api('/api/logout', {}); welAgain(); try { sessionStorage.removeItem(LPICK); } catch (e) { /* private window */ } ME = null; MSG = ''; ENT = null; EDITID = ''; KBE = null; WEL = null; render(); }

// ---------------------------------------------------------------- sidebar (arrow button is fixed, double-click opens AND closes it)
function applySb() {
  document.documentElement.classList.toggle('co', COL); const s = $('#sb'); if (s) s.classList.toggle('co', COL);
  const b = $('#sbt'); if (b && !b.innerHTML) b.innerHTML = IC.chev;
}
function toggleSb() { COLP = !COL; COL = COLP || innerWidth <= 1100; LS.set('qa_col', COLP); FLY = null; OG = OG === '' ? '' : null; UMN = false; applySb(); if (ME) render(); }
// narrow screens: the sidebar becomes compact by itself, and goes back to your choice when the window is wide again
addEventListener('resize', () => { const c = COLP || innerWidth <= 1100; if (c !== COL) { COL = c; FLY = null; OG = OG === '' ? '' : null; UMN = false; applySb(); if (ME) render(); } });
function sbDbl(e) { if (!ME || e.target.closest('a,button,.usr,select,input')) return; toggleSb(); }
// ---------------------------------------------------------------- menu: a few main groups with drop-downs (a pop-out list when the sidebar is collapsed)
let OG = '', OGKEEP = false, FLY = null, FLYY = 100;                                 // OG = the open group of the main menu ('' = none: the app opens with every group closed; null = the group of the page)
// the sections of the panels that are unfolded: none at sign-in (Gabriela, 29 October); the section of the page you open unfolds by itself
let SPO = [];
const gOpen = g => !COL && (g.space ? SPO.includes(g.id) : OG === null ? groupOf(route) === g.id : OG === g.id);   // panel sections start open
// ---- the menu panels: the main menu, and the Workforce, Compliance & CX, Learning and Admin panels that open from the bottom of it ("Admin ›";
// "Set-up ›" for QA, team leads and trainers, who only have the scorecard pages there). The panel follows the page (a link to an
// admin page opens the Admin panel); "← Back to the main menu" goes to the last page of the main menu.
let SPV = null, LASTMAIN = 'dash';                                    // SPV = a panel opened by hand, until the next page opens
const spaceOf = r => (GROUPS.find(g => g.items.some(([k]) => k === r)) || {}).space || 'main';
const curSpace = () => SPV || spaceOf(route);
const spName = s => ({ learn: 'Learning', ai: 'Q Trainer', qi: 'Q-Intelligence', aiag: 'AI agents', tr: 'Transcripts' })[s] || (ME.role === 'admin' ? 'Admin' : 'Settings');
// APPS folded (one row of icons) or open (one row per panel), remembered on this computer
let APPSF = LS.get('qa_apps', true);
function appsTog(ev) { ev.stopPropagation(); APPSF = !APPSF; LS.set('qa_apps', APPSF); render(); }
// the sections of the main menu (OPERATIONS, MANAGE) and of the Admin panel (ACCOUNT, PEOPLE, SETUP, GOVERNANCE, PLATFORM): folded or
// open the same way as APPS, each remembered on this computer; one-word headings, at most five icons each (Gabriela, 29 October)
const SECS = { main: [['ops', 'Operations'], ['manage', 'Manage']], admin: [['account', 'Account'], ['people', 'People'], ['setup', 'Setup'], ['gov', 'Governance'], ['platform', 'Platform']] };
const SECF = Object.fromEntries(Object.values(SECS).flat().map(([k]) => [k, LS.get('qa_sec_' + k, true)]));
// at every sign-in every section starts folded: rows of icons (Gabriela, 29 October)
const foldAll = () => { APPSF = true; LS.set('qa_apps', true); for (const k in SECF) { SECF[k] = true; LS.set('qa_sec_' + k, true); } };
function secTog(k, ev) { ev.stopPropagation(); SECF[k] = !SECF[k]; LS.set('qa_sec_' + k, SECF[k]); render(); }
// the name under the photo: G.Georgieva (the initial of the first name and the last name), the whole name when one is missing
const shortName = u => u.firstName && u.lastName ? u.firstName.trim()[0] + '.' + u.lastName.trim() : u.name;
const SPIC = { aiag: 'g_robot', tr: 'g_tr', learn: 'g_learning', ai: 'g_aisim', qi: 'g_qi', admin: 'g_admin' };
const spTop = () => { const n = $('#n'); if (n) n.scrollTop = 0; };   // a panel always opens at its top (where "Back" is)
// the Admin (Settings) panel always opens the same way: every section folded into its row of icons, whatever was open last time (Gabriela, 29 October)
function foldPanel(s) { (SECS[s] || []).forEach(([k]) => { SECF[k] = true; LS.set('qa_sec_' + k, true); }); SPO = SPO.filter(id => (GROUPS.find(g => g.id === id) || {}).space !== s); }
function appGo(s, ev) { const first = (groupsFor().find(g => g.space === s) || { items: [] }).items[0]; spGo(s, ev); if (first && spaceOf(route) !== s) location.hash = first[0]; }   // APPS: open the app's first page (Gabriela, 3 November)
function spGo(s, ev) { ev.stopPropagation(); foldPanel(s); const one = groupsFor().filter(g => g.space === s).flatMap(g => g.items); if (one.length === 1) { SPV = null; FLY = null; UMN = false; if (route !== one[0][0]) location.hash = one[0][0]; else render(); return; }   // an app with only one page opens it
  if (s === 'ai' || s === 'qi') { qlShow('sonar', s === 'ai' ? 'AI' : 'Q'); qlHide(1300); } else { qlShow('draw', qlLetter(s)); qlHide(1100); } SPV = s; OG = null; FLY = null; UMN = false; render(); spTop(); }
function brandGo(ev) { if (curSpace() !== 'main') spBack(ev); else location.hash = 'dash'; }
function spBack(ev) { ev.stopPropagation(); SPV = null; OG = null; FLY = null; UMN = false; if (spaceOf(route) !== 'main') location.hash = LASTMAIN; else { render(); spTop(); } }
// clicking a group's icon opens its first page; when the sidebar is closed its pop-out menu stays open too
let PENDFLY = null;
// only the menu is redrawn (the page stays as it is): used by hovering in the icons-only menu
const navOnly = () => { const n = $('#n'); n.innerHTML = NAVH(); n.dataset.sp = curSpace(); };
// icons-only menu: resting the mouse on an icon opens its list (like Ringover); moving away closes it a moment later (time to reach
// the list); a click still opens the group's first page. Touch screens have no hover: there the click works as before.
let FLYT = 0;
function flyHover(id, el) { if (!COL) return; clearTimeout(FLYT); if (FLY === id) return; FLYT = setTimeout(() => { FLY = id; FLYY = el.querySelector('.gh').getBoundingClientRect().top; navOnly(); }, 120); }
function flyLeave() { if (!COL) return; clearTimeout(FLYT); FLYT = setTimeout(() => { if (FLY) { FLY = null; navOnly(); } }, 350); }
function gGo(id, ev) {
  ev.stopPropagation(); UMN = false; const g = groupsFor().find(x => x.id === id); if (!g || !g.items.length) return;
  const y = (ev.currentTarget.closest('.gh') || ev.currentTarget).getBoundingClientRect().top, first = g.items[0][0];
  if (g.items.length === 1 || ev.currentTarget.classList.contains('appi')) { FLY = null; if (route !== first) location.hash = first; else render(); return; }   // AI Hub, Help Center, Activity Log (one page), and an icon of a folded section: the page opens straight away
  if (COL) { if (route === first) { FLY = id; FLYY = y; render(); } else { PENDFLY = { id, y }; location.hash = first; } return; }
  // the full menu (Gabriela, 29 October): a click on the row (icon, name or beside them) opens the group and its first page, folded or open;
  // a second click on the group already shown folds it; the small arrow only folds and unfolds
  if (gOpen(g) && groupOf(route) === id) return tgG(id, ev);
  if (route !== first) location.hash = first; else { if (g.space) { if (!SPO.includes(id)) SPO = [...SPO, id]; } else OG = id; render(); }
}
function tgG(id, ev) { if (COL) { const first = groupsFor().find(g => g.id === id).items[0][0]; FLY = id; FLYY = ev.currentTarget.getBoundingClientRect().top; if (first !== route) { location.hash = first; return; } } else if ((GROUPS.find(g => g.id === id) || {}).space) { SPO = SPO.includes(id) ? SPO.filter(x => x !== id) : [...SPO, id]; } else OG = (gOpen({ id }) ? '' : id); render(); }
// a coming-soon page (SOON) is greyed with a small Soon; a group with only such pages has a greyed icon
const isSoonG = g => g.items.every(([k]) => Object.hasOwn(SOON, k));
const subA = ([k, n]) => Object.hasOwn(SOON, k) ? `<a href="#${k}" class="soon ${k === route ? 'on' : ''}">${n}<small>${tr('Soon')}</small></a>` : `<a href="#${k}" class="${k === route ? 'on' : ''}">${n}${typeof betaOf === 'function' && betaOf(k) ? `<small class=beta>${tr('Beta')}</small>` : ''}</a>`;
// the search at the top of every menu: people type in it and the matches drop down under it (pages by their name in any language,
// not agents or lead IDs); Enter or a click opens the first or chosen one. The icons-only menu shows the magnifier, which opens the menu
// and puts the cursor in the box (Gabriela, 29 October: no pop-up)
let SBQ = '', SBI = 0;
const sbBox = () => COL ? `<button class=sbs onclick="sbOpen()" title="Search the menu" aria-label="Search the menu">${IC.search}</button>`
  : `<div class=sbw><div class=sbs onclick="$('#sbq').focus()">${IC.search}<input id=sbq placeholder="Search the menu…" aria-label="Search the menu" autocomplete=off value="${esc(SBQ)}" oninput="SBQ=this.value;SBI=0;sbList()" onkeydown="sbKey(event)" onfocus="sbList()" onblur="setTimeout(sbHide,150)"></div><div id=sbl class=sbl role=listbox></div></div>`;
function sbOpen() { if (COL) toggleSb(); setTimeout(() => { const i = $('#sbq'); if (i) i.focus(); }, 30); }
const sbRes = () => SBQ.trim() ? palItems(SBQ, true).slice(0, 8) : [];   // only the names of the menu's pages (Gabriela, 29 October)
function sbList() { const l = $('#sbl'); if (!l) return; const r = sbRes(); if (SBI >= r.length) SBI = 0;
  l.innerHTML = !SBQ.trim() ? '' : r.map((it, k) => `<button class="palr ${k === SBI ? 'on' : ''}" role=option onmousedown="event.preventDefault();sbGo(${k})"><span class=pali>${it.ic}</span><span><b>${esc(it.t)}</b><small>${esc(it.s)}</small></span></button>`).join('') || `<p class=mu>${tr('Nothing found')}</p>`; }
function sbHide() { const l = $('#sbl'); if (l) l.innerHTML = ''; }
function sbGo(k) { const it = sbRes()[k]; SBQ = ''; SBI = 0; const i = $('#sbq'); if (i) { i.value = ''; i.blur(); } sbHide(); if (it) it.go(); }
function sbKey(e) { const n = sbRes().length;
  if (e.key === 'Escape') { SBQ = ''; e.target.value = ''; sbHide(); e.target.blur(); }
  else if (e.key === 'ArrowDown' && n) { e.preventDefault(); SBI = (SBI + 1) % n; sbList(); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); SBI = (SBI - 1 + n) % n; sbList(); }
  else if (e.key === 'Enter') { e.preventDefault(); sbGo(SBI); } }
const NAVH = () => { const sp = curSpace(), all = groupsFor();
  const row = g => { const act = groupOf(route) === g.id, one = g.items.length === 1, open = !one && gOpen(g), sys = '', soon = isSoonG(g);   // System settings is a page of Quality set-up now
  // the icon AND the name open the group's first page; only the small arrow opens or closes the list without leaving the page
  return `<div class="grp g-${g.id} ${soon ? 'soon' : ''} ${open ? 'open' : ''} ${act ? 'act' : ''}" onmouseenter="flyHover('${g.id}',this)" onmouseleave="flyLeave()"><button class=gh onclick="gGo('${g.id}',event)" title="${'Open ' + g.items[0][1]}"><i>${IC[g.icon]}</i><span>${g.name}</span>${one ? '' : `<em onclick="event.stopPropagation();tgG('${g.id}',event)" title="Show / hide">›</em>`}</button>${open ? `<div class=sub>${g.items.map(subA).join('')}${sys}</div>` : ''}${COL && !one && FLY === g.id ? `<div class=fly style="--fy:${FLYY}px"><b>${g.name}</b>${g.items.map(subA).join('')}${sys}</div>` : ''}</div>`; };
  const mine = all.filter(g => (g.space || 'main') === sp && !(COL && sp === 'main' && (sbLayout().compact || []).includes(g.id)));
  // the section headings (folded: one row of icons that open the first page); the icons-only menu has a line between the sections
  const secs = (SECS[sp] || []).map(([k, n]) => [k, n, mine.filter(g => g.sec === k)]).filter(x => x[2].length);
  const grp = !secs.length ? mine.map(row).join('') : secs.map(([k, n, l], i) => COL ? (i ? '<div class=spsep></div>' : '') + l.map(row).join('')
    : `<button class="apph sech sec-${k} ${i ? '' : 'first'}" onclick="secTog('${k}',event)" aria-expanded="${!SECF[k]}" title="Show / hide"><span>${n}</span><em>${SECF[k] ? '›' : '⌄'}</em></button>`
      + (SECF[k] ? `<div class=appsr>${l.map(g => `<button class="appi g-${g.id} ${isSoonG(g) ? 'soon' : ''} ${groupOf(route) === g.id ? 'on' : ''}" onclick="gGo('${g.id}',event)" title="${g.name}" aria-label="${g.name}">${IC[g.icon]}</button>`).join('')}</div>` : l.map(row).join(''))).join('');
  const srch = sbBox();
  const back = srch + (sp === 'main' ? '' : `<div class="grp spb"><button class=gh onclick="spBack(event)" title="Back to the main menu"><i>${IC.back}</i><span>Back to the main menu</span></button></div>${sp === 'admin' ? '' : `<div class=spt>${spName(sp)}</div>`}`);   // the Admin panel has no title (Gabriela, 29 October)
  // the panels under the line ("APPS"): each row ends with ↗ (it opens its own panel). In the full menu the heading folds them
  // into one row of icons (remembered); the icons-only menu always shows the line and the icons (Gabriela, 28 October)
  const L = sbLayout(), cmp = L.compact || [];   // the order of the apps and the icons-only menu as an admin arranged them
  const apps = sp !== 'main' ? [] : ['qi', 'ai', 'learn', 'aiag', 'tr'].filter(x => all.some(g => g.space === x) && !(COL && cmp.includes('app:' + x))).sort((a, b) => { const o = L.apps || [], i = o.indexOf(a), j = o.indexOf(b); return (i < 0 ? 9 : i) - (j < 0 ? 9 : j); });
  if (!apps.length) return back + grp;
  const rows = apps.map(x => `<div class="grp spc sp-${x}"><button class=gh onclick="appGo('${x}',event)" title="${spName(x)}"><i>${IC[SPIC[x]]}</i><span>${spName(x)}</span><em>↗</em></button></div>`).join('');
  if (COL) return back + grp + `<div class=spsep></div>${rows}`;
  const head = `<button class=apph onclick="appsTog(event)" aria-expanded="${!APPSF}" title="Show / hide"><span>Apps</span><em>${APPSF ? '›' : '⌄'}</em></button>`;
  return back + grp + head + (APPSF ? `<div class=appsr>${apps.map(x => `<button class="appi sp-${x}" onclick="appGo('${x}',event)" title="${spName(x)}" aria-label="${spName(x)}">${IC[SPIC[x]]}</button>`).join('')}</div>` : rows);
};
document.addEventListener('click', e => { if ((FLY || UMN) && !e.target.closest('.fly,.gh,.av2')) { FLY = null; UMN = false; render(); } });
let UMN = false;                                           // the small "me" menu of the compact sidebar
const THL = [['light', 'Light', IC.sun], ['dark', 'Dark', IC.moon], ['system', 'System', IC.mon]];
const thmBtns = () => `<div class=thm>${THL.map(([k, l, s]) => `<button class="${THM === k ? 'on' : ''}" data-m="${k}" onclick="th('${k}')" title="${l} mode"><span class=ti>${s}</span></button>`).join('')}</div>`;
const cycleTh = () => th({ light: 'dark', dark: 'system', system: 'light' }[THM] || 'light');
function umTog(ev) { ev.stopPropagation(); UMN = !UMN; FLY = null; FLYY = ev.currentTarget.getBoundingClientRect().bottom; render(); }
const FOOT = () => COL
  ? `<div class="ft ftc"><button class="thc1" data-m="${THM}" onclick="cycleTh()" title="${(THL.find(x => x[0] === THM) || THL[2])[1]} mode — click to change"><span class=ti>${(THL.find(x => x[0] === THM) || THL[2])[2]}</span></button><div class=av2 onclick="umTog(event)" title="${esc(ME.name)} — menu">${esc(ini(ME.name))}</div>${UMN ? `<div class="fly umn" style="--fyb:${Math.max(12, innerHeight - FLYY)}px"><b>${esc(ME.name)}</b><small class=umr>${ROLE[ME.role] || ME.role}</small>${thmBtns()}<a href="javascript:void(0)" onclick="UMN=false;openAcct('profile')">${IC.pen} My account</a><a href="javascript:void(0)" onclick="UMN=false;tsnd()">${SND ? IC.vol + ' Sound on' : IC.mute + ' Sound off'}</a><a href="javascript:void(0)" onclick="spGo('admin',event)">${IC.gear} ${spName('admin')}</a><a href="javascript:void(0)" onclick="UMN=false;out()">${IC.out} Log out</a></div>` : ''}</div>`
  : `<div class=ft><div class=thm>${[['light', 'Light', IC.sun], ['dark', 'Dark', IC.moon], ['system', 'System', IC.mon]].map(([k, l, s]) => `<button class="${THM === k ? 'on' : ''}" data-m="${k}" onclick="th('${k}')" title="${l} mode"><span class=ti>${s}</span></button>`).join('')}</div><div class=usr><div class=av2 onclick="openAcct('profile')" title="My account">${esc(ini(ME.name))}</div><div class=un onclick="openAcct('profile')" title="My account"><b>${esc(shortName(ME))}</b><small>${ROLE[ME.role] || ME.role}</small></div><button onclick="tsnd()" title="${SND ? 'Sound on' : 'Sound off'}">${SND ? IC.vol : IC.mute}</button><button onclick="spGo('admin',event)" title="${spName('admin')}" aria-label="${spName('admin')}">${IC.gear}</button><button onclick="out()" title="Log out">${IC.out}</button></div></div>`;

// ---------------------------------------------------------------- render
// Every change redraws the page. Typing must not be interrupted by that: the field you are in keeps the focus and the cursor.
function render() {
  document.body.classList.toggle('auth', !ME);
  const fk = focusKey();
  if (!ME) { $('#m').innerHTML = LG(); $('#n').innerHTML = ''; $('#br').innerHTML = ''; $('#fz').innerHTML = ''; refocus(fk); return; }
  applySb();
  $('#m').innerHTML = (typeof sbxBar === 'function' ? sbxBar() : '') + (typeof annBar === 'function' ? annBar() : '') + (Object.hasOwn(PG, route) && typeof PG[route] === 'function' ? PG[route] : PG.dash)() + overlays();   // announcements on top   // a link such as #constructor shows the dashboard
  if (typeof qnMount === 'function') qnMount();   // the Quinn bubble on every page (it keeps its conversation from page to page)
  $('#br').innerHTML = `<div class=brand onclick="brandGo(event)" title="${curSpace() === 'main' ? 'Go to Home' : 'Back to the main menu'}">${mark('mg2', 36)}<div><b>Q-SMART</b><small>${esc((SET.brand || {}).name || 'Customer Service Analytics')}</small></div>${(SET.brand || {}).logo ? `<img class=brlogo src="${esc(SET.brand.logo)}" alt="">` : ''}</div>`; if (typeof brandApply === 'function') brandApply();
  navOnly();
  $('#fz').innerHTML = FOOT();
  $$('.chat').forEach(c => { c.scrollTop = c.scrollHeight; });
  a11y($('#m')); refocus(fk); fitTables();
  if (document.activeElement && document.activeElement.id === 'sbq') sbList();   // somebody typing in the menu's search keeps the matches
}
// a table wider than its card ends at the bottom of the screen, so its sideways scrollbar is at hand even with 100 rows per page (the
// column titles stay pinned on top); while that scrollbar is below the screen, a second one shows above the table, kept in step with it
function fitTables() {
  tblTools();                                             // every table gets its toolbar first (filter, columns, sort, copy)
  $$('#m .sc').forEach(sc => {
    sc.style.maxHeight = '';
    const wide = !sc.closest('.ov') && sc.scrollWidth > sc.clientWidth + 1, prev = sc.previousElementSibling;
    let top = prev && prev.classList.contains('sctop') ? prev : null;
    if (!wide) { if (top) top.remove(); return; }
    if (!top) {
      top = document.createElement('div'); top.className = 'sctop'; top.setAttribute('aria-hidden', 'true'); top.appendChild(document.createElement('div')); sc.before(top);
      top.addEventListener('scroll', () => { if (sc.scrollLeft !== top.scrollLeft) sc.scrollLeft = top.scrollLeft; });
      sc.addEventListener('scroll', () => { if (top.scrollLeft !== sc.scrollLeft) top.scrollLeft = sc.scrollLeft; });
    }
    top.hidden = true; top.firstChild.style.width = sc.scrollWidth + 'px';
    if (!sc.classList.contains('scg')) sc.style.maxHeight = Math.max(320, innerHeight - Math.max(sc.getBoundingClientRect().top, 0) - 16) + 'px';   // scg (Reviews): grows down with its rows; the bar above stays
  });
  topBars();
}
// the scrollbar above a table shows only while the table's own one, at its bottom, is below the edge of the screen
function topBars() {
  $$('#m .sctop').forEach(top => {
    const sc = top.nextElementSibling, show = !!sc && sc.getBoundingClientRect().bottom > innerHeight;
    if (top.hidden === !show) return;
    top.hidden = !show; if (show) top.scrollLeft = sc.scrollLeft;
  });
}
let TBF = 0;
addEventListener('scroll', () => { if (ME && !TBF) TBF = requestAnimationFrame(() => { TBF = 0; topBars(); }); }, { passive: true });
addEventListener('resize', () => { if (ME) fitTables(); });
// ---------------------------------------------------------------- accessibility (the page area and pop-ups only - the sidebar is left as it is)
//  - icon-only buttons get a name and a tooltip (Edit, Delete ...); fields without a label are named after their table row and column, or their first choice
//  - clickable cards, rows and column headers can be reached with Tab and opened with Enter or Space
//  - Esc closes the top pop-up (in a text field the first Esc only leaves the field, so typed text is not lost by accident)
//  - after the page is redrawn the keyboard focus goes back to the same control (or into the pop-up that just opened)
let ICN = null;
const icName = h => {
  if (!ICN) { const t = document.createElement('template'); ICN = new Map([[IC.pen, 'Edit'], [IC.bin, 'Delete'], [IC.eye, 'View'], [IC.x, 'Close'], [IC.dl, 'Download'], [IC.plus, 'Add'], [IC.check, 'Mark as done'], [IC.link, 'Open link'], [IC.play, 'Play recording'], [IC.flag, 'Flag'], [IC.more, 'More actions'], [IC.zip, 'Export as ZIP'], [IC.chev, 'Back'], [IC.search, 'Search'], [IC.up, 'Upload'], [IC.gear, 'Settings']].map(([s, n]) => { t.innerHTML = s; return [t.innerHTML, n]; })); }
  return ICN.get(h.trim()) || '';
};
const cellName = el => {
  const td = el.closest('td'), tr = el.closest('tr'), tb = el.closest('table'); if (!td || !tr || !tb) return '';
  const h = tb.rows[0] && tb.rows[0].cells[td.cellIndex], first = tr.cells[0] !== td ? tr.cells[0].textContent.trim() : '';
  // each part in the chosen language (the cells may not be translated yet when this runs, and the joined name never would be)
  return [first, h && h.tagName === 'TH' ? h.textContent.trim() : ''].filter(Boolean).map(s => window.tr(s)).join(' – ').slice(0, 80);   // window.tr: "tr" is the row here
};
const hasName = el => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title || (el.closest('label') && el.closest('label').textContent.trim()) || (el.id && document.querySelector(`label[for="${el.id}"]`));
function a11y(root) {
  if (!root) return;
  root.querySelectorAll('button').forEach(b => { if (!b.textContent.trim() && !b.title && !b.getAttribute('aria-label')) { const n = icName(b.innerHTML); if (n) { b.title = n; b.setAttribute('aria-label', n); } } });
  root.querySelectorAll('select, input:not([type=hidden]):not([placeholder]), textarea:not([placeholder])').forEach(el => {
    if (hasName(el)) return;
    const n = cellName(el) || (el.type === 'file' ? 'Choose a file' : el.tagName === 'SELECT' && el.options[0] ? el.options[0].text : '');
    if (n) el.setAttribute('aria-label', n);
  });
  root.querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(textarea):not(label):not(option):not([tabindex])').forEach(el => {
    if (el.classList.contains('ov') || el.closest('button, a') || /^\s*event\.stopPropagation\(\);?\s*$/.test(el.getAttribute('onclick'))) return;
    el.tabIndex = 0;
    if (!/^(TH|TD|TR)$/.test(el.tagName) && !el.querySelector('button, a, input, select, textarea')) el.setAttribute('role', 'button');
  });
  root.querySelectorAll('.ov > .md:not([role])').forEach(d => { d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); const h = d.querySelector('h2'); if (h) d.setAttribute('aria-label', h.textContent.trim().slice(0, 80)); });
}
const enhance = () => { a11y($('#m')); fitTables(); };   // for parts of a page redrawn on their own
const FATTR = ['onclick', 'oninput', 'onchange'];
const focusKey = () => {
  const a = document.activeElement, m = $('#m'); if (!a || a === document.body || !m || !(m.contains(a) || a.id === 'sbq')) return null;   // the page's fields, and the menu's search
  if (a.id) { let c = {}; try { c = { s: a.selectionStart, e: a.selectionEnd }; } catch (e) { /* no cursor in this field */ } return { id: a.id, ...c }; }
  const at = FATTR.find(x => a.getAttribute(x)); return at ? { tag: a.tagName.toLowerCase(), at, v: a.getAttribute(at) } : null;
};
let OPENER = null;                                    // the control that opened the pop-up: it gets the focus back when the pop-up closes
function refocus(k) {
  const a = document.activeElement; if (a && a !== document.body) return;
  const find = x => x ? (x.id ? document.getElementById(x.id) : $$('#m ' + x.tag + '[' + x.at + ']').find(y => y.getAttribute(x.at) === x.v)) : null;
  let el = find(k);
  const md = $$('#m .ov > .md').pop();
  if (md && !(el && md.contains(el))) { if (k && !OPENER) OPENER = k; md.tabIndex = -1; el = md.querySelector('[data-af]') || md; }   // a pop-up opens on its main button when it has one
  else if (!md && OPENER) { el = find(OPENER) || el; OPENER = null; }
  if (!el || !el.focus) return;
  el.focus({ preventScroll: true });
  if (el.setSelectionRange && /^(text|search|email|url|tel|password)$/.test(el.type) || el.tagName === 'TEXTAREA') try { const p = k && k.s != null && el.id === k.id ? [k.s, k.e] : [el.value.length, el.value.length]; el.setSelectionRange(p[0], p[1]); } catch (e) { /* no cursor in this field */ }
}
addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === 'Escape') {
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { if (!t.closest('.pal')) t.blur(); return; }
    const ov = $$('#m .ov').sort((x, y) => (parseInt(y.style.zIndex) || 0) - (parseInt(x.style.zIndex) || 0))[0];
    if (ov) { e.preventDefault(); ov.click(); }                                     // the same as clicking next to the pop-up
    else if (FLY) { FLY = null; render(); }                                        // or closes a pop-out menu of the compact sidebar
    return;
  }
  if (e.key === 'Tab') {                                                             // Tab stays inside an open pop-up
    const o = $$('#m .ov').sort((x, y) => (parseInt(y.style.zIndex) || 0) - (parseInt(x.style.zIndex) || 0))[0]; if (!o) return;
    const fs = [...o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(x => x.offsetParent !== null);
    if (!fs.length) return; const i = fs.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); fs[fs.length - 1].focus(); } else if (!e.shiftKey && (i === -1 || i === fs.length - 1)) { e.preventDefault(); fs[0].focus(); }
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && t && t.matches && t.matches('[tabindex="0"][onclick]:not(button):not(a):not(input):not(select):not(textarea)') && !e.repeat) { e.preventDefault(); t.click(); }
});
// parts of a page that are redrawn on their own (search results, lists) get the same treatment
if (window.MutationObserver) { let q = false; new MutationObserver(() => { if (q) return; q = true; requestAnimationFrame(() => { q = false; a11y($('#m')); }); }).observe(document.getElementById('m'), { childList: true, subtree: true }); }

// ---------------------------------------------------------------- router: warns before leaving an unsaved form, reloads data on every tab change
let SKIPH = false;
async function onHash() {
  const n = location.hash.slice(1) || 'dash';
  if (SKIPH) { SKIPH = false; return; }
  if (!ME) { route = n; return; }
  if (((route === 'entry' && entDirty()) || (route === 'kb' && kbDirty())) && n !== route) {      // put the page back and ask first (a safeguard: always asked)
    const back = route; SKIPH = true; location.hash = back;
    ask('Leave this page?', 'Your changes will be lost. Are you sure you want to leave?', () => { ENT = null; EDITID = ''; KBE = null; location.hash = n; }, { yes: 'Yes, leave', no: 'No, stay' });
    return;
  }
  if (!canRoute(n)) { location.hash = 'dash'; return; }
  if (n !== 'entry') { ENT = null; EDITID = ''; }
  if (n !== 'kb') KBE = null;
  SPV = null; if (spaceOf(n) === 'main') LASTMAIN = n;
  OG = OGKEEP ? '' : null; OGKEEP = false; { const pg = GROUPS.find(g => g.space && g.items.some(([k]) => k === route)); if (pg && !SPO.includes(pg.id)) SPO = [...SPO, pg.id]; } FLY = PENDFLY ? PENDFLY.id : null; if (PENDFLY) FLYY = PENDFLY.y; PENDFLY = null; TKV = null; QFM = null; PAL = null; TPLM = false; SSV = null; TEST = null; FM = null; AIH = false; CALV = ''; NWV = ''; PDSP = false; PARR = false; SIMV = null; OO.view = 'list'; OO.E = null; OO.T = null; TXF = null; TXC = null; CSP = null; AINEW = false; AIDV = null; AIPV = null; voxStop(); RCE = null; WCE = null; PTE = null; LRQ = null; ARD = null; AQV = ''; PKN = null;   // OGKEEP: the jump to the Dashboard after signing in keeps the menu closed
  if (n === 'calls' && !KQ) { Q = ''; FSC = null; PN = 1; }   // opening Call Reviews from the menu starts with an empty search
  KQ = false; MD = null; NO = false; AC = null; SYS = false; RSV = null; PLY = null; SE = n === 'sco' ? SE : null;
  const from = route; route = n; await qlRun(async () => { await load(); render(); }, n, from); window.scrollTo(0, 0); maybeWelcome();
}
addEventListener('hashchange', onHash);
// ---------------------------------------------------------------- quick jump (Ctrl+K or the search box in any header): pages, agents, leads and actions in one list
let PAL = null;
// what the app search looks in, fetched when it opens (tasks, articles, FAQ, glossary, scripts), so it finds them from any page
async function palLoad() { const get = async u => { try { const r = await api(u); return r.ok ? r.json() : null; } catch (e) { return null; } };
  const [t, k, fq, gl, sc] = await Promise.all([get('/api/tasks'), get('/api/kb'), get('/api/c/faq'), get('/api/c/gloss'), get('/api/c/scripts')]);
  if (t) TASKS = t; if (k) KB = k; if (fq) CO.faq = fq; if (gl) CO.gloss = gl; if (sc) CO.scripts = sc; if (PAL) palRt(); }
function palOpen(q = '') { if (!ME) return; PAL = { q, i: 0 }; palLoad(); render(); setTimeout(() => { const i = $('#palq'); if (i) { i.focus(); i.setSelectionRange(99, 99); } }, 20); }
function palItems(qs = PAL ? PAL.q : '', menuOnly = false) {
  const q = qs.trim().toLowerCase(), hit = s => !q || s.toLowerCase().includes(q), out = [];
  // every result opens with a function, never with code written as text (the security rules of the page block that)
  const acts = [staff() && ['New evaluation', 'Score a call', () => goPage('entry')], isStaffR() && ['New quick flag', 'Red or green flag without a review', () => { goPage('flags'); setTimeout(() => qfNew({ type: 'red' }), 300); }], isStaffR() && ['New task', 'Give a task to agents', () => { TV.tab = 'my'; goPage('tasks'); setTimeout(() => newTask(), 300); }], isStaffR() && ['New one-to-one', 'Document a one-to-one', () => goPage('o2o')]].filter(Boolean);
  if (!menuOnly) acts.forEach(([t, s, go]) => hit(t) && out.push({ ic: IC.plus, t, s, go }));
  // the menu's own search (left) finds the pages; the app search (right, Ctrl K) finds everything else (Gabriela, 3 November)
  // the pages that exist come before the coming-soon ones ("trans": Transcripts, then Translator)
  if (menuOnly) groupsFor().flatMap(g => g.items.map(([k, n]) => [k, n, g])).sort((x, y) => Object.hasOwn(SOON, x[0]) - Object.hasOwn(SOON, y[0]))
    .forEach(([k, n, g]) => hit(n + ' ' + g.name + ' ' + tr(n) + ' ' + tr(g.name)) && out.push({ ic: IC[g.icon], t: n, s: g.name, go: () => goPage(k) }));
  if (q && !menuOnly) {
    AGENTS().filter(a => hit(a.name) || hit(a.username)).slice(0, 6).forEach(a => out.push({ ic: `<span class=av style="margin:0;width:24px;height:24px;font-size:9px">${esc(ini(a.name))}</span>`, t: a.name, s: 'Agent · ' + tn(a.team), go: ME.role === 'agent' ? () => goPage('agents') : () => openAgent(a.username) }));
    EV.filter(e => String(e.id).toLowerCase().includes(q)).slice(0, 6).forEach(e => out.push({ ic: IC.eye, t: 'Lead ' + e.id, s: `${agn(e)} · ${f(e.d)} · ${Math.round(e.sc)}%`, go: () => om('view', e.rid) }));
    TASKS.filter(t => !t.archived && hit(t.title)).slice(0, 4).forEach(t => out.push({ ic: IC.list || IC.check, t: t.title, s: tr('Task') + ' · ' + (an(t.assignee) || t.assignee), go: () => { goPage('tasks'); setTimeout(() => { TKV = t.id; render(); }, 300); } }));
    (KB.articles || []).filter(a => hit(a.title + ' ' + (a.topics || []).join(' '))).slice(0, 4).forEach(a => out.push({ ic: IC.g_learning, t: a.title, s: tr('Knowledge Base'), go: () => kbOpen(a.id) }));
    [['faq', 'q', 'cs_faq', 'FAQ'], ['gloss', 'term', 'cs_gloss', 'Glossary'], ['scripts', 'title', 'cs_script', 'Script builder']].forEach(([c, k, pg, n]) => (CO[c] || []).filter(x => hit(String(x[k] || ''))).slice(0, 3).forEach(x => out.push({ ic: IC.g_help, t: x[k], s: tr(n), go: () => { HPQ.q = x[k]; goPage(pg); } })));
    const sq = qs.trim();   // a function, not code made from the typed text: names such as O'Brien work, and nothing typed can run as code
    out.push({ ic: IC.search, t: `Search Call Reviews for "${sq}"`, s: 'Lead ID, agent or campaign', go: () => { Q = sq; KQ = true; if (location.hash === '#calls') render(); else location.hash = 'calls'; } });
  }
  return out.slice(0, 14);
}
function palGo(k) { const it = palItems()[k]; PAL = null; render(); if (it) it.go(); }
const PALM = () => { const l = palItems(); if (PAL.i >= l.length) PAL.i = 0;
  return OVL(`<div class=pal><div class=sx><span>${IC.search}</span><input id=palq placeholder="Search agents, lead IDs, tasks, articles…" value="${esc(PAL.q)}" oninput="PAL.q=this.value;PAL.i=0;palRt()" onkeydown="palKey(event)"><kbd class=kb>Esc</kbd></div><div id=pall>${palList(l)}</div><small class=mu>↑ ↓ to choose · Enter to open</small></div>`, 'PAL=null;render()', 620, 99); };
const palList = l => l.map((it, k) => `<button class="palr ${k === PAL.i ? 'on' : ''}" onclick="palGo(${k})"><span class=pali>${it.ic}</span><span><b>${esc(it.t)}</b><small>${esc(it.s)}</small></span></button>`).join('') || '<p class=mu style="padding:14px">Nothing found</p>';
const palRt = () => { const b = $('#pall'); if (b) b.innerHTML = palList(palItems()); };
function palKey(e) { const n = palItems().length; if (e.key === 'Escape') { PAL = null; render(); } else if (e.key === 'ArrowDown') { e.preventDefault(); PAL.i = (PAL.i + 1) % Math.max(n, 1); palRt(); } else if (e.key === 'ArrowUp') { e.preventDefault(); PAL.i = (PAL.i - 1 + n) % Math.max(n, 1); palRt(); } else if (e.key === 'Enter') { e.preventDefault(); palGo(PAL.i); } }
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); palOpen(); } });   // Ctrl K = the app search (the menu has its own box)
// every header search box opens the quick jump too (typing goes straight into it)
document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('qi') && route !== 'calls') { const v = e.target.value; e.target.blur(); palOpen(v); } });
addEventListener('beforeunload', e => { if (entDirty() || kbDirty()) { e.preventDefault(); e.returnValue = ''; } });

// new reviews and notifications show up by themselves (every 20 s and when you come back to the tab)
let PREVU = null, POLLING = false;   // POLLING: a check is still running, so another one does not pile up behind it
const refreshBell = () => $$('.ib[onclick*="openN"]').forEach(b => { b.innerHTML = IC.bell + (UN() ? `<sup>${UN()}</sup>` : ''); });
async function poll() {
  if (!ME || ME.mustChange || POLLING) return;
  POLLING = true; let ch; try { ch = await load(); } finally { POLLING = false; }
  const u = UN(); if (PREVU !== null && u > PREVU) beep(); PREVU = u;
  const busy = ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName) || $$('audio').some(a => !a.paused);   // never restart a recording that is playing
  if (ch && !(document.activeElement && document.activeElement.id === 'sbq') && (!MD || MD.t === 'view') && !NO && !AC && !SYS && !RSV && !CFM && !PLY && !FM && !TKV && !TEST && !SSV && !TPLM && !AQV && !WEL && !PDSP && !PARR && !QFM && !PAL && !busy && route !== 'entry' && !SE && !KBE && !QZE && !NWE && !WCE && !PTE && !RCE && !LRQ) render(); else if (ch) refreshBell();
}
setInterval(poll, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

let NOTICE = null;                                              // the company's privacy note for the sign-in page (Admin › Organization › Data protection)
async function boot() {
  const r = await api('/api/me'); ME = r.ok ? await r.json() : null;
  if (!ME && !NOTICE) fetch('/api/notice').then(x => x.json()).then(j => { NOTICE = j; if (!ME) render(); }).catch(() => {});
  if (ME) userLang();                                           // the person's own language, before anything is drawn
  if (ME && !ME.mustChange) { if (!QL) qlShow('beat', 'Q'); await load(); }   // opening the app signed in: the heartbeat while the data loads
  PREVU = UN(); render(); maybeWelcome(); qlHide(1600);
}
I18N.start(); applyTheme(); boot();
