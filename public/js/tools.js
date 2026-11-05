// ===================== Tools, Announcements, Release notes, Feature requests, Branding, Regional and Sidebar settings (Gabriela, 3 November) =====================

// ---------- Learning › Tools › Redaction: personal data is taken out of a text in the browser (nothing is sent or saved)
let RED = { in: '', out: '', n: {} };
const luhn = s => { let t = 0, alt = false; for (let i = s.length - 1; i >= 0; i--) { let d = +s[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } t += d; alt = !alt; } return t % 10 === 0; };
function redact(txt) {
  const n = { card: 0, iban: 0, email: 0, phone: 0, number: 0 }, rep = (k, tag) => () => { n[k]++; return tag; };
  let s = String(txt || '');
  s = s.replace(/\b(?:\d[ -]?){12,18}\d\b/g, m => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) ? (n.card++, '[CARD]') : m; });
  s = s.replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g, rep('iban', '[IBAN]'));
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, rep('email', '[EMAIL]'));
  s = s.replace(/(?:\+|00)\d[\d ()-]{6,}\d|\b0\d[\d -]{6,}\d\b/g, rep('phone', '[PHONE]'));
  s = s.replace(/\b\d{9,}\b/g, rep('number', '[NUMBER]'));
  return { out: s, n };
}
PG.cs_redact = function () {
  const tot = Object.values(RED.n).reduce((a, b) => a + b, 0);
  return head('Redaction', 'Take personal data out of a transcript or a text before you share it. It happens in your browser: nothing is sent or saved.', bellBtn())
    + `<div class="g g2">${card('Your text', `<textarea id=redin rows=14 style="width:100%" placeholder="Paste a transcript or a text here…" oninput="RED.in=this.value">${esc(RED.in)}</textarea><div class=row style="margin-top:10px;justify-content:flex-end"><button class=btn onclick="Object.assign(RED, redact(RED.in));render()">${tr('Take out personal data')}</button></div>`)}`
    + card('Without personal data', RED.out ? `<p style="margin:0 0 8px">${tot ? Object.entries(RED.n).filter(([, v]) => v).map(([k, v]) => pill(`${v} × ${tr(({ card: 'card numbers', iban: 'bank accounts', email: 'e-mails', phone: 'phone numbers', number: 'long numbers' })[k])}`, 'wn')).join(' ') : pill('Nothing found', 'ok')}</p><textarea rows=12 readonly style="width:100%">${esc(RED.out)}</textarea><div class=row style="margin-top:10px;justify-content:flex-end"><button class=ib onclick="navigator.clipboard.writeText(RED.out).then(()=>toast('Copied'))">${tr('Copy')}</button></div>` : `<p class=mu style="margin:0">${tr('Card numbers, bank accounts (IBAN), e-mails, phone numbers and other long numbers are replaced. Names are not found automatically: check them yourself.')}</p>`) + `</div>`;
};

// ---------- Learning › Tools › Sample calculator: how many reviews make a fair score (95% sure, ± 10 points by default)
let SMP = { n: 400, conf: 95, err: 10 };
const sampleSize = (N, conf, err) => { const z = ({ 90: 1.645, 95: 1.96, 99: 2.576 })[conf] || 1.96, n0 = z * z * 0.25 / Math.pow(err / 100, 2); return Math.ceil(N > 0 ? n0 / (1 + (n0 - 1) / N) : n0); };
PG.cs_sample = function () {
  const need = sampleSize(+SMP.n || 0, +SMP.conf, +SMP.err), m = todayS().slice(0, 7), ag = AGENTS().map(a => ({ a, n: EV.filter(e => e.agent === a.username && String(e.d).slice(0, 7) === m).length }));
  const inp = (k, l, o) => `<label>${tr(l)}${o ? `<select onchange="SMP.${k}=+this.value;render()">${o.map(v => `<option ${+SMP[k] === v ? 'selected' : ''} value=${v}>${k === 'conf' ? v + '%' : '± ' + v}</option>`).join('')}</select>` : `<input type=number min=1 value="${SMP[k]}" onchange="SMP.${k}=+this.value;render()">`}</label>`;
  return head('Sample calculator', 'How many reviews each agent needs in a month so the score can be trusted', bellBtn())
    + `<div class="g g2">${card('Your numbers', `<div class=form style="max-width:none">${inp('n', 'Conversations per agent in a month')}${inp('conf', 'How sure you want to be', [90, 95, 99])}${inp('err', 'Accepted difference (points)', [5, 10, 15])}</div>`)}`
    + card('Result', `<div class=big style="font-size:42px">${need}</div><p class=mu style="margin:4px 0 0">${tf('reviews per agent this month: then the score is right within ± {n} points, {n2}% sure.', { n: SMP.err, n2: SMP.conf })}</p>`) + `</div>`
    + card('This month', ag.length ? tbl(['Agent', 'Reviews', 'Needed', ''], ag.sort((x, y) => x.n - y.n).map(x => [`<b>${esc(x.a.name)}</b>`, x.n, need, x.n >= need ? pill('Enough', 'ok') : pill(tf('{n} more', { n: need - x.n }), 'wn')])) : `<p class=mu style="margin:0">${tr('Nothing here yet.')}</p>`);
};

// ---------- Learning › Tools › Score simulator: answer the questions of a scorecard and see the score move (the same rules as QA Entry)
let SIMU = { sc: '', a: {} };
const simCats = () => { const s = SCS.find(x => x.id === SIMU.sc) || SCS[0]; return s ? s.cats.map((c, ci) => ({ ...c, it: c.it.map((i, ii) => ({ ...i, a: SIMU.a[ci + '.' + ii] || 'y' })) })) : []; };
PG.cs_scoresim = function () {
  if (!SIMU.sc && SCS[0]) SIMU.sc = SCS[0].id;
  const cats = simCats(), s = scoreCats(cats), pass = PASSG();
  return head('Score simulator', 'What if: answer the questions of a scorecard and see how a failed critical item or a missed point changes the score. Nothing is saved.', bellBtn())
    + `<div class=row style="gap:8px;margin-bottom:12px;flex-wrap:wrap"><select onchange="SIMU={sc:this.value,a:{}};render()">${SCS.map(x => `<option value="${esc(x.id)}" ${x.id === SIMU.sc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class=ib onclick="SIMU.a={};render()">${tr('All Yes again')}</button>`
    + `<span style="margin-left:auto;font:700 28px var(--font-d);color:${s.pc >= pass ? 'var(--ok)' : 'var(--bad)'}">${Math.round(s.pc * 10) / 10}%</span>${s.zero ? pill('A critical category failed: 0%', 'bad') : ''}</div>`
    + cats.map((c, ci) => card(`${esc(c.n)}${c.k ? ` <span class=crit>${tr('Critical category')}</span>` : ''} <small class=mu>${s.cs[ci].e}/${s.cs[ci].m}</small>`, c.it.map((i, ii) => `<div class=row style="gap:10px;padding:5px 0;border-top:1px solid var(--bd)"><span style="flex:1">${esc(i.t)}${i.k ? ` <span class=crit>${tr('Critical')}</span>` : ''} <small class=mu>${i.p} ${tr('pts')}</small></span><div class=sg>${[['y', 'Yes'], ['n', 'No'], ['na', 'N/A']].map(([v, n]) => `<button class="${i.a === v ? 'on' : ''}" onclick="SIMU.a['${ci}.${ii}']='${v}';render()">${tr(n)}</button>`).join('')}</div></div>`).join(''))).join('');
};

// ---------- Learning › Tools › Script builder: call scripts and ready answers, step by step (written by staff, read by everybody)
Object.assign(GOVR, { cs_script: { c: 'scripts', what: 'script', t: 'Script builder', s: 'Call scripts and ready answers that agents can follow, step by step', name: 'title',
  f: [{ k: 'title', l: 'Script name', req: 1, ph: 'e.g. Opening of an outbound call' }, { k: 'when', l: 'When to use it', ph: 'e.g. First call to a new customer' }, { k: 'steps', l: 'Steps (what to say)', t: 'steps' }] } });
PG.cs_script = function () {
  const all = CO.scripts || [], l = all.filter(x => hpHit(x.title + ' ' + (x.when || '') + ' ' + (x.steps || []).map(s => s.t).join(' ')));
  return hpHead('cs_script', all.length) + card('', hpSearch() + (l.length ? l.map(x => `<details class=hpq><summary><span><b>${esc(x.title)}</b>${x.when ? ` <small class=mu>· ${esc(x.when)}</small>` : ''}</span>${hpEd('cs_script', x)}</summary><ol data-noi18n style="margin:8px 0 0">${(x.steps || []).map(s => `<li><b>${esc(s.t)}</b>${s.d ? `<br><small class=mu>${esc(s.d)}</small>` : ''}</li>`).join('')}</ol></details>`).join('') : hpNone()));
};

// ---------- Admin › Setup › Messages › Announcements: a message at the top of the pages, for some roles, between two dates; each person can close it
Object.assign(GOVR, { cs_announce: { c: 'announce', what: 'announcement', t: 'Announcements', s: 'A message shown at the top of the pages for everybody, or for some roles, between two dates', name: 'text',
  f: [{ k: 'text', l: 'Message', t: 'textarea', rows: 3, req: 1 }, { k: 'kind', l: 'Colour', t: 'select', o: [['info', 'Information'], ['warn', 'Important']] },
    { k: 'roles', l: 'Shown to', t: 'multi', o: () => Object.entries(ROLE).map(([k, n]) => [k, n]), hint: 'Nothing ticked = everybody' }, { k: 'from', l: 'From', t: 'date' }, { k: 'to', l: 'Until', t: 'date' }],
  cols: [['Message', x => `<b>${esc(String(x.text).slice(0, 120))}</b>`], ['Shown to', x => esc((x.roles || []).length ? x.roles.map(r => tr(ROLE[r])).join(', ') : tr('Everybody'))], ['From', x => esc(x.from || '—')], ['Until', x => esc(x.to || '—')], ['Now', x => annOn(x, true) ? pill('Shown', 'ok') : pill('Not shown', 'mu')]] } });
PG.cs_announce = regPage('cs_announce');
const annGone = () => { try { return JSON.parse(localStorage.getItem('qa_ann_gone') || '[]'); } catch (e) { return []; } };
const annOn = (x, any) => { const d = todayS(); return (!x.from || x.from <= d) && (!x.to || x.to >= d) && (any || !(x.roles || []).length || x.roles.includes(ME.role)); };
function annClose(id) { try { localStorage.setItem('qa_ann_gone', JSON.stringify([...annGone(), id].slice(-50))); } catch (e) { /* private window */ } render(); }
const annBar = () => { if (!ME) return ''; const gone = annGone(), l = (CO.announce || []).filter(x => annOn(x) && !gone.includes(x.id)).slice(0, 3);
  return l.map(x => `<div class="annb ${x.kind === 'warn' ? 'warn' : ''}" role=status><span data-noi18n style="flex:1;white-space:pre-wrap">${esc(x.text)}</span><button class=ic onclick="annClose('${x.id}')" aria-label="Close">✕</button></div>`).join(''); };

// ---------- Admin › Account › Support › Release notes: what changed in Q-smart (written by the makers of Q-smart)
const RELN = [
  ['2026-11-04', ['Every question of a review must be answered; a review where everything is N/A is Not scored and counts in no average', 'Filters and Columns like Reviews on Users and Teams; Columns and Copy on Quick Flags, Disputes and the task list', 'Each person can have their own time zone: shifts, check-ins and lateness follow the person’s local time', 'Data protection: transcripts can be deleted after a number of days; the review, its scores, the comments and the dialer link stay', 'A new sign-in screen: centered, dark in dark mode and light in light mode, with a light / dark switch and a language globe', 'The menu on the left follows light and dark mode, and its menu search shows one compact line per page', 'Quinn on every page: most questions answered without AI (predefined answers in three languages, the Help Center, saved answers), the AI only when needed, Talk to a person, and Admin › Quinn with the answers, the unanswered questions, the usage and the cost', 'Q Trainer (the Call Simulator before): scenarios for any company in Customer service, Sales and Retention, its own look, and suggested practice calls for the categories where you are below the pass mark', 'Developers: API keys with access per area, the Developer API, webhooks and the MCP connection for AI assistants', 'Billing with Stripe: plans, invoices and the card on Stripe’s secure pages', 'Excel exports with real dates and real percentages']],
  ['2026-11-03', ['Admin › Sandbox: a practice copy (a made-up company like Kainami, or a copy of your data) where nothing reaches the real data', 'Admin › Import data: users, teams and reviews from CSV or Excel, with a preview row by row', 'Admin › Beta features: switch the newest features off for the whole company', 'Call Simulator like Converst: a dashboard (Overview, Sessions, Agents; week, month, quarter, year), New simulation in 4 steps with segments, levels and languages, indicators ticked while you speak, the outcome of the call, feedback per turn; it works without AI with a written customer', 'Help Center website: a public website like the Zendesk Help Center (at /hc or help. + your domain) with categories, sections and articles about Q-smart, a search, Was this article helpful?, related and recently viewed articles; admins write it in Help Center › Help Center website', 'Knowledge Base like Confluence: page tree, Recent, Starred, emoji and cover, reactions, comments, table of contents, details, version history; folders for some teams only', 'The assistant is called Quinn: Ask Quinn', 'Two searches: the menu box finds menu names, the app search (Ctrl K) finds agents, reviews, tasks and articles', 'An app opens its first page with one click', 'Contact support: a form with an e-mail, a type, a description and a file or picture', 'The Knowledge Base is back in Learning', 'Admin › Governance: record of processing, sub-processors, data processing agreements, recording consent, AI register, AI notices, data breaches, accessibility statement', 'Activity Log: My activity, Sign-ins, Exports & downloads; Admin › Security log', 'Help Center: FAQ, Glossary, Video tutorials and Guided tours', 'Getting started, Reviewer QA, Pins and Topic dashboards', 'Tools: Redaction, Sample calculator, Score simulator, Script builder; Announcements, Feature requests, Branding, Regional and Sidebar settings']],
  ['2026-10-29', ['The menu in sections (Operations, Manage, Apps) with a search box', 'Roles & permissions for each role and each person, with templates', 'Task templates with steps, a category and a colour; ready-made templates', 'A language button on Home']],
  ['2026-10-28', ['The fonts come from the app itself', 'Phones show the "use the mobile app" screen', 'Excel exports always in English', 'Safety, speed and language checks']],
  ['2026-10-27', ['Users and teams rebuilt; Admin › Organization', 'One-to-One forms and targets', 'Dashboards that admins arrange', 'Workforce: capacity planning, team today, attendance reports']],
  ['2026-10-26', ['Workforce: work calendars, shifts, rota, attendance and time off', 'The AI team: AI reviewer, AI team lead, AI trainer, AI analyst']]
];
PG.cs_release = function () {
  return head('Release notes', 'What is new in each version of Q-smart', bellBtn()) + RELN.map(([d, l]) => card(`<span class=mono>${esc(d)}</span>`, `<ul style="margin:0;padding-left:20px;display:grid;gap:4px">${l.map(x => `<li>${tr(x)}</li>`).join('')}</ul>`)).join('');
};

// ---------- Admin › Account › Support › Feature requests: everybody can ask for a feature and vote; an admin sets the status
Object.assign(GOVR, { cs_ideas: { c: 'ideas', what: 'request', t: 'Feature requests', s: 'Ask for a new feature and vote for the ideas of others', name: 'title',
  f: [{ k: 'title', l: 'Your idea', req: 1 }, { k: 'details', l: 'Why it would help', t: 'textarea', rows: 3 }] } });
const IDST = { new: ['New', 'mu'], planned: ['Planned', 'ac'], done: ['Done', 'ok'], no: ['Not planned', 'bad'] };
async function ideaVote(id) { const r = await api('/api/ideas/' + id + '/vote', {}); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); }
PG.cs_ideas = function () {
  const l = (CO.ideas || []).slice().sort((a, b) => (b.votes || []).length - (a.votes || []).length), adm = ME.role === 'admin';
  return head('Feature requests', 'Ask for a new feature and vote for the ideas of others', `<div style="display:flex;gap:8px">${bellBtn()}<button class="btn ibx" onclick="regForm('cs_ideas')">${IC.plus} ${tr('New idea')}</button></div>`)
    + card('', l.length ? l.map(x => { const v = x.votes || [], mine = v.includes(ME.username), [sn, sc] = IDST[x.status || 'new'] || IDST.new;
      return `<div class=li><div class=row style="gap:12px;align-items:flex-start"><button class="ib idv ${mine ? 'on' : ''}" onclick="ideaVote('${x.id}')" aria-pressed="${mine}" title="${mine ? 'Take back my vote' : 'Vote'}">▲ <b>${v.length}</b></button><div style="flex:1"><b data-noi18n>${esc(x.title)}</b> ${pill(sn, sc)}${x.details ? `<div class=mu data-noi18n style="white-space:pre-wrap">${esc(x.details)}</div>` : ''}<small class=mu>${esc(x.byName || x.by || '')}</small></div>${adm ? `<select aria-label="Status" onchange="coPatch('ideas','${x.id}',{status:this.value},'${tr('Saved')}')">${Object.entries(IDST).map(([k, [n]]) => `<option value="${k}" ${(x.status || 'new') === k ? 'selected' : ''}>${tr(n)}</option>`).join('')}</select>` : ''}${x.by === ME.username || adm ? hpEd('cs_ideas', x) : ''}</div></div>`; }).join('') : hpNone());
};

// ---------- Admin › Account › Company › Branding: the company name and logo in the menu, and the accent colour
let BRD = null;
const brandOf = () => SET.brand || {};
function brandApply() { const c = brandOf().color, r = document.documentElement.style; if (c) { r.setProperty('--orange', c); r.setProperty('--brand', c); } else { r.removeProperty('--orange'); r.removeProperty('--brand'); } }
function brandLogo(inp) { const f = inp.files && inp.files[0]; if (!f) return; if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast('Choose a PNG, JPG or WEBP picture', true); if (f.size > 150000) return toast('The picture must be smaller than 150 KB', true);
  const rd = new FileReader(); rd.onload = () => { BRD.logo = rd.result; render(); }; rd.readAsDataURL(f); }
PG.cs_brand = function () {
  BRD = BRD || { name: brandOf().name || '', color: brandOf().color || '', logo: brandOf().logo || '' };
  return head('Branding', 'Your company name and logo in the menu, and your colour for the buttons and highlights', bellBtn())
    + `<div class="g g2">${card('Your brand', `<div class=form style="max-width:none"><label>${tr('Company name in the menu')}<input maxlength=40 value="${esc(BRD.name)}" placeholder="Customer Service Analytics" oninput="BRD.name=this.value"></label>`
      + `<div><b style="font-size:12.5px">${tr('Accent colour')}</b><div class=sw>${TCOL.map(([c, n]) => `<button type=button class="${(BRD.color || '') === c ? 'on' : ''} ${c ? '' : 'none'}" style="background:${c || '#FF6B00'}" title="${esc(c ? n : 'Q-smart orange')}" aria-label="${esc(c ? n : 'Q-smart orange')}" onclick="BRD.color='${c}';render()"></button>`).join('')}</div></div>`
      + `<label>${tr('Logo (PNG, JPG or WEBP, smaller than 150 KB)')}<input type=file accept="image/png,image/jpeg,image/webp" onchange="brandLogo(this)"></label>${BRD.logo ? `<button class=ib onclick="BRD.logo='';render()">${tr('Remove the logo')}</button>` : ''}</div>`
      + `<div class=acts><button class=ib onclick="BRD=null;render()">${tr('Cancel')}</button><button class=btn onclick="setX('brand',BRD,'${tr('Saved')}').then(()=>{BRD=null;brandApply();render()})">${tr('Save')}</button></div>`)}`
    + card('Preview', `<div class=brandpv style="--bc:${BRD.color || '#FF6B00'}">${BRD.logo ? `<img src="${esc(BRD.logo)}" alt="">` : ''}<div><b>Q-SMART</b><small>${esc(BRD.name || 'Customer Service Analytics')}</small></div><button class=btn style="background:var(--bc);border-color:var(--bc);margin-left:auto">${tr('Button')}</button></div>`) + `</div>`;
};

// ---------- Admin › Account › Company › Regional settings: how dates and times are written (the language decides when nothing is chosen)
let RGD = null;
PG.cs_region = function () {
  RGD = RGD || { date: (SET.region || {}).date || 'auto', time: (SET.region || {}).time || 'auto' };
  const ex = new Date(2026, 11, 31, 16, 30), keep = SET.region; SET.region = RGD; const sample = fdt(ex); SET.region = keep;
  return head('Regional settings', 'How dates and times are written in Q-smart for everybody', bellBtn())
    + card('', `<div class=form><label>${tr('Dates')}<select onchange="RGD.date=this.value;render()">${[['auto', 'As the language of each person'], ['dmy.', '31.12.2026'], ['dmy/', '31/12/2026'], ['mdy', '12/31/2026'], ['ymd', '2026-12-31']].map(([k, n]) => `<option value="${k}" ${RGD.date === k ? 'selected' : ''}>${tr(n)}</option>`).join('')}</select></label>`
      + `<label>${tr('Times')}<select onchange="RGD.time=this.value;render()">${[['auto', 'As the language of each person'], ['24', '16:30'], ['12', '4:30 PM']].map(([k, n]) => `<option value="${k}" ${RGD.time === k ? 'selected' : ''}>${tr(n)}</option>`).join('')}</select></label>`
      + `<p style="margin:0">${tr('Example')}: <b class=mono>${esc(sample)}</b></p><p class=mu style="margin:0;font-size:13px">${tr('The time zone and the currency come with the move to the cloud.')}</p><div class=acts><button class=btn onclick="setX('region',RGD,'${tr('Saved')}').then(()=>{RGD=null;render()})">${tr('Save')}</button></div></div>`);
};

// ---------- Admin › Setup › Sidebar settings: the order of the groups and apps, which ones are shown (full and compact), and saved views per role
let SBD = null;
const SBAPPS = ['qi', 'ai', 'learn', 'aiag', 'tr'];
const sbMain = () => GROUPS.filter(g => !g.space);
const sbCur = () => SBD || (SBD = JSON.parse(JSON.stringify({ hide: [], order: [], compact: [], apps: [], views: [], ...(SET.sidebar || {}) })));
const sbOrd = (l, ord, key) => l.slice().sort((a, b) => { const i = ord.indexOf(key(a)), j = ord.indexOf(key(b)); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); });
function sbMove(kind, id, by) { const d = sbCur(); if (kind === 'app') { const l = sbOrd(SBAPPS, d.apps, x => x); const i = l.indexOf(id), j = i + by; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; d.apps = l; }
  else { const sec = (GROUPS.find(g => g.id === id) || {}).sec, all = sbOrd(sbMain(), d.order, g => g.id).map(g => g.id), l = all.filter(x => (GROUPS.find(g => g.id === x) || {}).sec === sec); const i = l.indexOf(id), j = i + by; if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; d.order = [...all.filter(x => (GROUPS.find(g => g.id === x) || {}).sec !== sec), ...l]; } render(); }
function sbTog(list, id, on) { const d = sbCur(); d[list] = on ? d[list].filter(x => x !== id) : [...new Set([...d[list], id])]; render(); }
const appGroups = s => GROUPS.filter(g => g.space === s).map(g => g.id);
async function sbSave(msg) { await setX('sidebar', SBD, msg || tr('Saved')); SBD = null; render(); }
const sbBtns = () => `<div class=acts><button class=ib onclick="SBD=null;render()">${tr('Cancel')}</button><button class=ib onclick="ask('${tr('Back to the default sidebar?')}','${tr('Every group and app is shown again, in the order of Q-smart. Saved views stay.')}',()=>{SBD={...sbCur(),hide:[],order:[],compact:[],apps:[]};sbSave()})">${tr('Reset to default')}</button><button class=btn onclick="sbSave()">${tr('Save')}</button></div>`;
const sbRow = (kind, id, name, ic, listKey, i, n) => { const d = sbCur(), hidden = kind === 'app' ? appGroups(id).every(g => d[listKey].includes(g)) || d[listKey].includes('app:' + id) : d[listKey].includes(id);
  const tog = kind === 'app' && listKey === 'hide' ? `sbTogApp('${id}',this.checked)` : `sbTog('${listKey}','${kind === 'app' ? 'app:' + id : id}',this.checked)`;
  return `<div class=sbr><span class=sbi>${IC[ic]}</span><span style="flex:1">${tr(name)}</span><label class=rad><input type=checkbox ${hidden ? '' : 'checked'} onchange="${tog}"> ${tr('Shown')}</label>${listKey === 'hide' ? `<button class=ic onclick="sbMove('${kind}','${id}',-1)" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class=ic onclick="sbMove('${kind}','${id}',1)" ${i < n - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>` : ''}</div>`; };
function sbTogApp(s, on) { const d = sbCur(), g = appGroups(s); d.hide = on ? d.hide.filter(x => !g.includes(x)) : [...new Set([...d.hide, ...g])]; render(); }
const sbsetList = listKey => { const d = sbCur(), main = sbOrd(sbMain(), d.order, g => g.id), apps = sbOrd(SBAPPS, d.apps, x => x);
  return [['ops', 'Operations'], ['manage', 'Manage']].map(([k, n]) => { const l = main.filter(g => g.sec === k); return `<div class=cap style="margin:12px 0 6px">${tr(n)}</div>${l.map((g, i) => sbRow('group', g.id, g.name, g.icon, listKey, i, l.length)).join('')}`; }).join('')
    + `<div class=cap style="margin:12px 0 6px">${tr('Apps')}</div>${apps.map((s, i) => sbRow('app', s, spName(s), SPIC[s], listKey, i, apps.length)).join('')}`; };
PG.cs_sbfull = function () { return head('Full-size sidebar', 'The order of the groups and apps of the main menu, and which ones are shown. It applies to everybody, unless a saved view is chosen for their role.', bellBtn()) + card('', sbsetList('hide') + sbBtns()); };
PG.cs_sbcompact = function () { return head('Compact sidebar', 'Which icons the icons-only menu shows. The order is the one of the full-size sidebar.', bellBtn()) + card('', sbsetList('compact') + sbBtns()); };
let SBV = { name: '', roles: [] };
PG.cs_sbviews = function () {
  const d = sbCur(), v = d.views || [];
  return head('Saved views', 'Save the sidebar as it is now under a name, and give it to one or more roles. People with that role see that view.', bellBtn())
    + card('Save the sidebar as it is now', `<div class=form style="max-width:none"><label>${tr('Name of the view')}<input maxlength=40 value="${esc(SBV.name)}" placeholder="${tr('e.g. Agents: the essentials')}" oninput="SBV.name=this.value"></label><div><b style="font-size:12.5px">${tr('For')}</b><div class=chk style="margin-top:6px">${Object.entries(ROLE).map(([k, n]) => `<label class=rad><input type=checkbox ${SBV.roles.includes(k) ? 'checked' : ''} onchange="SBV.roles=this.checked?[...SBV.roles,'${k}']:SBV.roles.filter(x=>x!=='${k}')"> ${tr(n)}</label>`).join('')}</div></div></div><div class=acts><button class=btn onclick="sbViewAdd()">${tr('Save the view')}</button></div>`)
    + card('Views', v.length ? tbl(['Name', 'For', 'Hidden groups', ''], v.map((x, i) => [`<b>${esc(x.name)}</b>`, esc((x.roles || []).map(r => tr(ROLE[r])).join(', ') || '—'), (x.hide || []).length, `<button class=ic onclick="SBD=sbCur();SBD.views.splice(${i},1);sbSave()" aria-label="Delete">${IC.bin}</button>`])) : `<p class=mu style="margin:0">${tr('Nothing here yet.')}</p>`);
};
function sbViewAdd() { const d = sbCur(); if (!SBV.name.trim()) return toast('Give the view a name', true); if (!SBV.roles.length) return toast('Choose at least one role', true);
  const taken = new Set(SBV.roles); d.views = [...(d.views || []).map(x => ({ ...x, roles: (x.roles || []).filter(r => !taken.has(r)) })), { id: 'v' + Date.now(), name: SBV.name.trim(), roles: SBV.roles, hide: d.hide, order: d.order, compact: d.compact, apps: d.apps }];
  SBV = { name: '', roles: [] }; sbSave(tr('View saved')); }
