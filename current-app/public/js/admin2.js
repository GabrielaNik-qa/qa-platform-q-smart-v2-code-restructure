// ===================== Admin: Roles & permissions, Integrations, Notification rules, Backups & data, Email templates =====================
const ROLES5 = Object.keys(ROLE);
async function setX(key, value, msg) { const r = await api('/api/settings/x/' + key, { value }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); SET = await r.json(); render(); if (msg) toast(msg); }

// ---- who can open which page (the server still checks every action, this decides what people see in the menu)
// Admin › People › Roles: "All roles", then one page per role with its people as columns (Gabriela, 29 October).
// Panel / Category / Subcategory = where the page is in the menu. A role's tick is the default for its people; a person can be given
// or refused a page on their own (a thick box = that person's own choice). Changes are saved together, can be kept as a template,
// and "Reset to default" brings back the roles of a new installation with no personal choices.
let PERMD = null, PF = { q: '', panel: '', people: [], open: false };
const permRows = () => GROUPS.filter(g => g.id !== 'myacc').flatMap(g => g.items.filter(([k]) => !Object.hasOwn(SOON, k) && !/^perm_/.test(k))
  .map(([k, n]) => ({ k, n, c: g.name, p: g.space ? (g.space === 'admin' ? 'Admin' : spName(g.space)) : 'Main menu' })))
  .filter(x => (!PF.panel || x.p === PF.panel) && (!PF.q.trim() || (x.n + ' ' + x.c + ' ' + x.p + ' ' + tr(x.n) + ' ' + tr(x.c)).toLowerCase().includes(PF.q.trim().toLowerCase())));
const permCur = () => PERMD || { perm: JSON.parse(JSON.stringify(SET.perm || {})), permu: JSON.parse(JSON.stringify(SET.permu || {})) };
const roleHas = (d, k, r) => (d.perm[k] || RR[k] || ROLES5).includes(r);
const lockP = (k, r) => ADMINP.includes(k) && r === 'admin';                  // admins always keep the Admin pages
const ownP = (d, k, un) => Object.hasOwn(d.permu[k] || {}, un);
const userHas = (d, k, u) => lockP(k, u.role) || (ownP(d, k, u.username) ? d.permu[k][u.username] : roleHas(d, k, u.role));
function permEdit(fn) { PERMD = permCur(); fn(PERMD); render(); }
function permTog(k, r, on) { permEdit(d => { const l = new Set(d.perm[k] || RR[k] || ROLES5); on ? l.add(r) : l.delete(r); d.perm[k] = [...l]; }); }
// a person's tick: the same as their role = no personal choice; different = their own choice
function permTogU(k, un, on) { permEdit(d => { const u = ROSTER.find(x => x.username === un); if (!u) return; const m = d.permu[k] = d.permu[k] || {}; if (on === roleHas(d, k, u.role)) delete m[un]; else m[un] = on; if (!Object.keys(m).length) delete d.permu[k]; }); }
async function permSave() { const d = PERMD; if (!d) return; await setX('perm', d.perm); await setX('permu', d.permu, 'Permissions saved'); PERMD = null; render(); }
function permReset() { ask('Back to the default permissions?', 'Every page goes back to the roles it had when the app was installed, and the choices made for single people are removed. Your templates stay.', async () => { await setX('perm', {}); await setX('permu', {}, 'Default permissions restored'); PERMD = null; render(); }); }
function permTplSave() { const n = (($('#ptn') || {}).value || '').trim(); if (!n) return toast('Give the template a name', true); const d = permCur(); setX('permtpl', [...(SET.permtpl || []), { id: 'pt' + Date.now(), name: n, at: new Date().toISOString(), perm: d.perm, permu: d.permu }], 'Template saved'); }
function permTplUse(id) { const t = (SET.permtpl || []).find(x => x.id === id); if (!t) return; PERMD = { perm: JSON.parse(JSON.stringify(t.perm || {})), permu: JSON.parse(JSON.stringify(t.permu || {})) }; render(); toast('Template loaded: check it, then press Save'); }
function permTplDel(id) { ask('Delete this template?', 'The permissions in use do not change.', () => setX('permtpl', (SET.permtpl || []).filter(x => x.id !== id), 'Template deleted')); }
// the people of a role, and the "Teams & people" box: a tick for a whole team, or for single people (nothing ticked = everybody)
const rolePeople = r => ROSTER.filter(u => u.role === r && u.active).sort((a, b) => a.name.localeCompare(b.name));
function pfPerson(un, on) { const s = new Set(PF.people); on ? s.add(un) : s.delete(un); PF.people = [...s]; render(); }
function pfTeam(r, tid, on) { const s = new Set(PF.people); rolePeople(r).filter(u => (u.team || '') === tid).forEach(u => (on ? s.add(u.username) : s.delete(u.username))); PF.people = [...s]; render(); }
const permHead = (t, s) => head(t, s, `<div style="display:flex;gap:8px;flex-wrap:wrap">${bellBtn()}${PERMD ? `<button class=ib onclick="PERMD=null;render()">Cancel</button><button class=btn onclick="permSave()">Save</button>` : ''}<button class=ib onclick="permReset()">Reset to default</button></div>`);
const permBar = extra => `<div class=pfbar><div class=sx style="width:240px"><span>${IC.search}</span><input id=pfq placeholder="Search a page…" aria-label="Search a page" value="${esc(PF.q)}" oninput="PF.q=this.value;render()"></div>`
  + `<select id=pfp aria-label="Panel" onchange="PF.panel=this.value;render()"><option value="">All panels</option>${[...new Set(GROUPS.filter(g => g.id !== 'myacc').map(g => g.space ? (g.space === 'admin' ? 'Admin' : spName(g.space)) : 'Main menu'))].map(p => `<option ${PF.panel === p ? 'selected' : ''} value="${esc(p)}">${esc(p)}</option>`).join('')}</select>${extra || ''}</div>`;
const permTpl = () => card('Templates', `<div class=row style="gap:8px;flex-wrap:wrap"><input id=ptn placeholder="Template name, e.g. Summer team" aria-label="Template name" maxlength=60 style="flex:1;min-width:200px"><button class=btn onclick="permTplSave()">Save as template</button></div>`
  + ((SET.permtpl || []).length ? `<div style="display:grid;gap:6px;margin-top:10px">${SET.permtpl.map(t => `<div class=row style="gap:8px"><b style="flex:1">${esc(t.name)}</b><small class=mu>${esc(String(t.at).slice(0, 10))}</small><button class=ib onclick="permTplUse('${esc(t.id)}')">Use</button><button class=ib onclick="permTplDel('${esc(t.id)}')" aria-label="Delete">✕</button></div>`).join('')}</div>` : `<p class=mu style="margin:10px 0 0;font-size:13px">No template yet. Change the ticks, then save them as a template to use them again later.</p>`));
const PNOTE = `<p class=mu style="font-size:13px;margin:10px 0 0">Unticking only hides the page. Actions are still protected on the server, so an agent can never change a review even if a page is visible.</p>`;
PG.perms = function () {
  const d = permCur(), rows = permRows();
  return permHead('Roles & permissions', 'Which roles see which pages in the menu. Admins always keep the Admin pages.') + permBar()
    + card('', `<div class=sc><table class=ct><tr><th>Panel</th><th>Category</th><th>Subcategory</th>${ROLES5.map(r => `<th style="text-align:center">${ROLE[r]}</th>`).join('')}</tr>${rows.map(p => `<tr><td><small>${esc(p.p)}</small></td><td>${esc(p.c)}</td><td><b>${esc(p.n)}</b></td>${ROLES5.map(r => `<td style="text-align:center"><input type=checkbox ${roleHas(d, p.k, r) || lockP(p.k, r) ? 'checked' : ''} ${lockP(p.k, r) ? 'disabled' : ''} onchange="permTog('${p.k}','${r}',this.checked)"></td>`).join('')}</tr>`).join('')}</table></div>${PNOTE}`) + permTpl();
};
// one role: its people are the columns; the first column is the role itself (the default for everybody without a choice of their own)
const permRole = r => function () {
  const d = permCur(), rows = permRows(), all = rolePeople(r), sel = new Set(PF.people.filter(un => all.some(u => u.username === un)));
  const ppl = sel.size ? all.filter(u => sel.has(u.username)) : all, teams = [...new Set(all.map(u => u.team || ''))];
  const box = `<details class=pfd ${PF.open ? 'open' : ''} ontoggle="PF.open=this.open"><summary>Teams & people: <b>${sel.size ? sel.size + ' / ' + all.length : 'All'}</b></summary><div class=pfl>`
    + (sel.size ? `<a href="javascript:void(0)" class=agl onclick="PF.people=[];render()">Show everybody</a>` : '')
    + teams.map(t => { const m = all.filter(u => (u.team || '') === t), on = m.every(u => sel.has(u.username));
      return `<label class="rad pft"><input type=checkbox ${on ? 'checked' : ''} onchange="pfTeam('${r}','${esc(t)}',this.checked)"><b>${esc(tn(t))}</b><small class=mu>${m.length}</small></label>${m.map(u => `<label class="rad pfu"><input type=checkbox ${sel.has(u.username) ? 'checked' : ''} onchange="pfPerson('${esc(u.username)}',this.checked)">${esc(u.name)}</label>`).join('')}`; }).join('') + `</div></details>`;
  return permHead(ROLE[r], 'Which pages the people with this role see. The first column is the role; a thick box is a person\'s own choice, the other boxes follow the role.') + permBar(box)
    + card('', !all.length ? `<p class=mu style="margin:0">Nobody has this role yet.</p>` : `<div class=sc><table class="ct pmt"><tr><th>Panel</th><th>Category</th><th>Subcategory</th><th style="text-align:center">${ROLE[r]}<br><small class=mu>role</small></th>${ppl.map(u => `<th style="text-align:center">${esc(u.name)}<br><small class=mu>${esc(tn(u.team))}</small></th>`).join('')}</tr>`
      + rows.map(p => `<tr><td><small>${esc(p.p)}</small></td><td>${esc(p.c)}</td><td><b>${esc(p.n)}</b></td><td style="text-align:center"><input type=checkbox ${roleHas(d, p.k, r) || lockP(p.k, r) ? 'checked' : ''} ${lockP(p.k, r) ? 'disabled' : ''} onchange="permTog('${p.k}','${r}',this.checked)"></td>${ppl.map(u => `<td style="text-align:center"><input type=checkbox class="${ownP(d, p.k, u.username) ? 'pown' : ''}" ${userHas(d, p.k, u) ? 'checked' : ''} ${lockP(p.k, r) ? 'disabled' : ''} onchange="permTogU('${p.k}','${esc(u.username)}',this.checked)"></td>`).join('')}</tr>`).join('') + `</table></div>${PNOTE}`) + permTpl();
};
for (const r of ROLES5) PG['perm_' + r] = permRole(r);

// ---- integrations: links to the other tools used every day
const INTF = [['crm', 'CRM lead link', 'https://crm.example.com/leads/{id}', 'Lead IDs become clickable everywhere, and QA Entry fills the CRM link by itself. {id} = the lead ID.'],
  ['rec', 'Recording link', 'https://recordings.example.com/calls?search={id}', 'Optional. When a review has no recording link, this link is offered instead.'],
  ['zendesk', 'Zendesk', 'https://yourcompany.zendesk.com', 'Shown as a shortcut on the review pop-up of chats and emails.'],
  ['voiso', 'Voiso', 'https://yourcompany.voiso.com', 'Telephony — a shortcut in the Tools of the review pop-up.'],
  ['modjo', 'Modjo', 'https://app.modjo.ai', 'Call recording and AI — a shortcut in the review pop-up.']];
PG.integ = function () {
  const v = SET.integ || {};
  return head('Integrations', 'Links to your CRM, telephony and help desk, used all over the app', bellBtn())
    + card('Links', `<div class=form style="max-width:none">${INTF.map(([k, n, ph, h]) => `<label>${n}<input id=ig_${k} value="${esc(v[k] || '')}" placeholder="${esc(ph)}"><small class=mu>${esc(h)}</small></label>`).join('')}<button class=btn style="justify-self:start" onclick="setX('integ',Object.fromEntries(INTF.map(([k])=>[k,$('#ig_'+k).value.trim()])),'Integrations saved')">Save</button></div>`)
    + aiCard();
};
// AI and voice: the Claude key (kept encrypted on the server; only its last 4 characters ever come back), the model, the monthly
// budget with what was used, a test, and the voice keys for the call simulator
function aiCard() {
  const s = AISET; if (!s) return card('AI', `<p class=mu style="margin:0">${AIS.enabled ? '✓ AI is switched on.' : 'AI is not switched on yet.'}</p>`);
  const key = (n, label, id, ph) => { const x = s.keys[n]; return `<label>${label}<div class=row style="gap:8px;flex-wrap:wrap"><input id=${id} type=password autocomplete=new-password placeholder="${x.set ? '•••• ' + esc(x.last4) + ' · saved (type a new key to replace it)' : esc(ph)}" style="flex:1;min-width:220px">${x.set ? `<button class=ib onclick="aiKeyDel('${n}')">Remove</button>` : ''}</div>${x.env ? '<small class=mu>The key from the server settings file (.env) is used.</small>' : ''}</label>`; };
  const u = s.usage, pct = s.budget ? Math.min(100, u.usd / s.budget * 100) : 0, mod = s.models.find(m => m.id === s.model);
  return card('AI and voice', `<div class=form style="max-width:none">
<p style="margin:0">${s.enabled ? `<span class="pill ok">Connected</span> ${esc(mod ? mod.name : s.model)}` : '<span class="pill wn">Not connected</span> Add your Claude API key to switch on AI scoring, quiz writing and smart import.'}</p>
${key('anthropic', 'Claude API key (console.anthropic.com)', 'ai_key', 'sk-ant-…')}
<div class=eg2><label>Model<select id=ai_model>${s.models.map(m => `<option value="${m.id}" ${m.id === s.model ? 'selected' : ''}>${esc(m.name)} · $${m.price[0]} / $${m.price[1]} per million tokens</option>`).join('')}</select></label>
<label>Monthly AI budget in USD (0 = no limit)<input id=ai_budget type=number min=0 step=1 value="${s.budget}"></label></div>
<div><small>Used in ${esc(u.month)}: <b>$${u.usd.toFixed(2)}</b>${s.budget ? ` of $${s.budget}` : ''} · ${u.calls} AI requests</small>${s.budget ? bar(pct, pct >= 90 ? 'var(--bad)' : pct >= 70 ? 'var(--wn)' : 'var(--ok)') : ''}</div>
<label>Company rules for the AI team (playbook)<textarea id=ai_pb rows=4 placeholder="Three reviews per agent, per category, per month. A missing identity check is always a critical fail.">${esc(s.playbook || '')}</textarea><small class=mu>The AI reviewer follows these rules together with your scorecards. Plain words are enough.</small></label>
<label class=rad style="align-items:center;gap:8px"><input type=checkbox id=ai_la ${s.leadAuto ? 'checked' : ''}> Every Monday from 08:00 the AI team lead writes the weekly summary of every team</label>
<label class=rad style="align-items:center;gap:8px"><input type=checkbox id=ai_rp ${s.rolePlay ? 'checked' : ''}> Agents can practise with an AI customer in the Call Simulator (every message uses the AI budget)</label>
<label class=rad style="align-items:center;gap:8px"><input type=checkbox id=ai_an ${s.analystAuto ? 'checked' : ''}> On the 1st of every month from 08:00 the AI analyst writes last month's quality report</label>
<b style="margin-top:6px">Voice for the call simulator</b>
<div class=eg2><label>Voice provider<select id=ai_voice>${[['browser', 'Built into the browser (free)'], ['elevenlabs', 'ElevenLabs'], ['openai', 'OpenAI']].map(([v, n]) => `<option value=${v} ${s.voice === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
<label>ElevenLabs voice (name or ID)<input id=ai_ev value="${esc(s.elevenVoice)}" placeholder="Rachel"></label></div>
${key('elevenlabs', 'ElevenLabs API key', 'ai_ek', 'xi-…')}${key('openai', 'OpenAI API key', 'ai_ok', 'sk-…')}
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class=btn onclick="aiSave()">Save</button><button class=ib onclick="aiTest()">Test the connection</button></div>
<small class=mu>Keys are stored encrypted on the server and are never shown again in full. Every AI request counts towards the monthly budget; when it is used up, the AI features pause until next month or until you raise it.</small></div>`);
}
async function aiSave() {
  const v = id => ($('#' + id) || {}).value || '', b = { model: v('ai_model'), budget: +v('ai_budget') || 0, voice: v('ai_voice'), elevenVoice: v('ai_ev').trim(), playbook: v('ai_pb'), leadAuto: !!($('#ai_la') || {}).checked, rolePlay: !!($('#ai_rp') || {}).checked, analystAuto: !!($('#ai_an') || {}).checked };
  [['ai_key', 'anthropicKey'], ['ai_ek', 'elevenKey'], ['ai_ok', 'openaiKey']].forEach(([id, f]) => { if (v(id).trim()) b[f] = v(id).trim(); });
  const r = await api('/api/ai/settings', b, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true);
  AISET = await r.json(); AIS = { enabled: AISET.enabled, model: AISET.model }; render(); toast('AI settings saved');
}
const aiKeyDel = n => ask('Remove this key?', 'The features that use it stop until a new key is added.', async () => {
  const r = await api('/api/ai/settings', { [{ anthropic: 'anthropicKey', elevenlabs: 'elevenKey', openai: 'openaiKey' }[n]]: '' }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not remove the key'), true);
  AISET = await r.json(); AIS = { enabled: AISET.enabled, model: AISET.model }; render(); toast('Key removed');
}, { yes: 'Yes, remove', no: 'Cancel', danger: true });
const aiTest = () => once('aitest', async () => {
  const r = await api('/api/ai/test', {}); if (!r.ok) return toast(await errOf(r, 'The test failed'), true);
  const j = await r.json(), s = await api('/api/ai/settings'); if (s.ok) AISET = await s.json(); render(); toast(`The AI answered · ${j.model}`);
});
// a lead ID turned into the CRM link (when a pattern is set)
const crmLink = id => { const p = (SET.integ || {}).crm; return p && id ? p.replace('{id}', encodeURIComponent(String(id).trim())) : ''; };

// ---- notification rules: which roles receive which notifications
const NOTIFT = { review: 'A new review', dispute: 'A review is disputed', msg: 'A new dispute message', resolved: 'A dispute is resolved', remind: 'A reminder to open a review', task: 'A new task', taskdone: 'A task is completed / a session is signed', quiz: 'A new quiz', news: 'A new newsletter', cal: 'A calibration session', flag: 'A quick flag', kudos: 'Kudos', pip: 'An improvement plan', goal: 'A new goal', risk: 'A risk case assigned', reg: 'A new registration request', att: 'A late arrival or a missing check-in', fix: 'An attendance correction', leave: 'A time off request or decision', brief: 'The morning brief of a team', cap: 'The leads of the month of an agent' };
PG.notifs = function () {
  const off = SET.notifOff || {};
  return head('Notification rules', 'Which roles get which notifications in the bell (and the sound)', bellBtn())
    + card('', `<div class=sc><table class=ct><tr><th>Notification</th>${ROLES5.map(r => `<th style="text-align:center">${ROLE[r]}</th>`).join('')}</tr>${Object.entries(NOTIFT).map(([k, n]) => `<tr><td>${esc(n)}</td>${ROLES5.map(r => `<td style="text-align:center"><input type=checkbox ${(off[k] || []).includes(r) ? '' : 'checked'} onchange="nfTog('${k}','${r}',this.checked)"></td>`).join('')}</tr>`).join('')}</table></div><p class=mu style="font-size:13px;margin:10px 0 0">Changes are saved at once. A role only receives a notification when it is about them (for example agents get "a new review" only for their own reviews).</p>`);
};
function nfTog(k, r, on) { const off = JSON.parse(JSON.stringify(SET.notifOff || {})), l = new Set(off[k] || []); on ? l.delete(r) : l.add(r); off[k] = [...l]; setX('notifOff', off, 'Saved'); }

// ---- backups & data
PG.backup = function () {
  return head('Backups & data', 'Make a copy of all the data, download it, or go back to an earlier copy', bellBtn())
    + `<div class="g g2">${card('Back up now', `<p class=mu style="margin:0 0 10px">A copy of all the data is kept in the <b>backups</b> folder next to the app. Do it before big changes.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class=btn onclick="bkMake()">${IC.zip} Make a backup</button><a class="ib ibx" href="/api/backups/current/download" style="text-decoration:none;color:var(--tx)">${IC.dl} Download the data</a></div>`)}
${card('Restore from a file', `<p class=mu style="margin:0 0 10px">Choose a backup file (.json) from your computer. The current data is backed up first, so nothing is lost.</p><input type=file id=bkf accept=".json,application/json"> <button class="ib ibx" onclick="bkUpload()">${IC.up} Restore this file</button>`)}</div>`
    + card(`Backups <span class=bg>${BKS.length}</span>`, BKS.length ? tbl(['File', 'Size', 'Made', ''], BKS.map(b => [`<b class=mono>${esc(b.f)}</b>`, (b.size / 1024).toFixed(0) + ' KB', fdt(b.at), `<a class="ib ibx" href="/api/backups/${encodeURIComponent(b.f)}" style="text-decoration:none;color:var(--tx)">${IC.dl}</a> <button class="ib ibx" onclick="bkRestore('${esc(b.f)}')">Restore</button> <button class=ic onclick="bkDel('${esc(b.f)}')" title="Delete">${IC.bin}</button>`])) : '<p class=mu>No backups yet</p>')
    + card('seed.js — the starting data', `<p style="margin:0 0 10px">Running <code>node seed.js</code> (or starting the app without a data.json) brings back the data saved inside <b>seed.js</b>. Update it to today's data when you are happy with it.</p><button class="ib ibx" onclick="ask('Update seed.js?','seed.js will hold the data as it is right now. Running node seed.js later brings back exactly this data.',seedRefresh,{yes:'Yes, update it',no:'Cancel'})">Update seed.js with today's data</button>`)
    + card('Recordings', `<p class=mu style="margin:0">Call recordings are not inside the data file. They are kept in the folder <b>Documents\\Q-smart recordings</b> on the computer that runs the app — back that folder up too.</p>`);
};
async function bkMake() { const r = await api('/api/backups', {}); if (!r.ok) return toast(await errOf(r, 'Could not make the backup'), true); await load(); render(); toast('Backup made'); }
const bkRestore = f => ask('Go back to this backup?', `All the data becomes what it was in ${f}. The current data is backed up first.`, async () => { const r = await api('/api/backups/' + encodeURIComponent(f) + '/restore', {}); if (!r.ok) return toast(await errOf(r, 'Could not restore'), true); toast('Restored — reloading'); setTimeout(() => location.reload(), 900); }, { yes: 'Yes, restore', no: 'Cancel', danger: true });
const bkDel = f => ask('Delete this backup?', f + ' is deleted for good.', async () => { await api('/api/backups/' + encodeURIComponent(f), null, 'DELETE'); await load(); render(); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
async function bkUpload() { const fl = $('#bkf').files[0]; if (!fl) return toast('Choose a file first', true); let d; try { d = JSON.parse(await fl.text()); } catch (e) { return toast('That file is not a valid backup', true); } ask('Restore this file?', 'All the data becomes what is in ' + fl.name + '. The current data is backed up first.', async () => { const r = await api('/api/backups/upload/restore', { data: d }); if (!r.ok) return toast(await errOf(r, 'Could not restore'), true); toast('Restored — reloading'); setTimeout(() => location.reload(), 900); }, { yes: 'Yes, restore', no: 'Cancel', danger: true }); }
async function seedRefresh() { const r = await api('/api/seed/refresh', {}); if (!r.ok) return toast(await errOf(r, 'Could not update seed.js'), true); toast('seed.js now holds today’s data'); }

// ---- e-mail templates
const MAILT = { reset: ['Reset password', 'Reset your password', 'Hi {name},\n\nChoose a new password here (valid for 1 hour):\n{link}\n\nIf you did not ask for this, ignore this email.', '{name} {link}'],
  approved: ['Registration approved', 'Your registration has been approved', 'Hi {name},\n\nGood news - your registration has been approved. You can now log in:\n{link}\n\nUsername: {username}', '{name} {link} {username}'],
  account: ['New account', 'Your account has been created', 'Hi {name},\n\nAn account was created for you.\n\nAddress: {link}\nUsername: {username}\nTemporary password: {password}\n\nYou will be asked to choose a new password the first time you log in.', '{name} {link} {username} {password}'],
  reminder: ['Review reminder', 'Reminder: you have a review waiting', 'Hi {name},\n\nPlease open your review for Lead #{lead}:\n{link}', '{name} {link} {lead}'],
  report: ['Scheduled report', 'Q-smart report: {name}', '{name}\nOpen {link} to see the full report.', '{name} {link} (the table is added below the text)'] };
PG.mailtpl = function () {
  const v = SET.mailtpl || {};
  return head('Email templates', 'The words of the e-mails the app sends. Leave a field empty to use the default.', bellBtn())
    + Object.entries(MAILT).map(([k, [n, s, b, vars]]) => card(n, `<div class=form style="max-width:none"><label>Subject<input id=mt_s_${k} value="${esc((v[k] || {}).subject || '')}" placeholder="${esc(s)}"></label><label>Text<textarea id=mt_b_${k} rows=6 placeholder="${esc(b)}">${esc((v[k] || {}).body || '')}</textarea><small class=mu>You can use: ${esc(vars)}</small></label></div>`)).join('')
    + `<button class=btn onclick="setX('mailtpl',Object.fromEntries(Object.keys(MAILT).map(k=>[k,{subject:$('#mt_s_'+k).value.trim(),body:$('#mt_b_'+k).value.trim()}])),'Templates saved')">Save templates</button>`;
};

// ---------- the "coming soon" pages of the Admin panel (SOON in pages.js): the name, what the page will do, and nothing else yet
const soonName = k => (GROUPS.flatMap(g => g.items).find(([x]) => x === k) || [k, k])[1];
for (const k of Object.keys(SOON)) PG[k] = () => head(soonName(k), SOON[k])
  + card('', `<p style="margin:0 0 8px">${pill('Coming soon', 'wn')}</p><p class=mu style="margin:0">${tr('This page is planned but not built yet. Nothing on it changes your data.')}</p>${k === 'cs_aiprov' ? `<p style="margin:10px 0 0"><a href="#integ">${tr('Open Integrations')} ›</a></p>` : ''}`);
