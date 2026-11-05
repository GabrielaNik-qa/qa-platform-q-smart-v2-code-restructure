// ===================== Scorecards, Users, system settings, account actions =====================
// ---------- scorecards
const newSE = () => ({ id: null, workspace: WSP[0] ? WSP[0].id : '', name: '', desc: '', tags: [], cats: [{ n: '', k: false, it: [{ t: '', p: 0, k: false }] }] });
// tags of the scorecard being edited: typed (Enter or comma adds one) or picked from the suggestions (review types and the tags already in use)
const scTagAdd = v => { const t = String(v || '').replace(/,/g, ' ').trim().slice(0, 30); SE.tags = SE.tags || []; if (t && SE.tags.length < 12 && !SE.tags.some(x => x.toLowerCase() === t.toLowerCase())) SE.tags.push(t); render(); setTimeout(() => { const i = $('#sctin'); if (i) i.focus(); }, 20); };
const scTagDel = i => { SE.tags.splice(i, 1); render(); };
const scTagSugg = () => [...new Set([...CHS.map(k => CHP[k]), ...SCS.flatMap(scTags)])].filter(t => !(SE.tags || []).some(x => x.toLowerCase() === t.toLowerCase())).slice(0, 12);
let SCF = '';                                                  // the tag the scorecards list is filtered by ('' = all)
const SCT = () => SE.cats.reduce((a, c) => a + c.it.reduce((x, i) => x + (+i.p || 0), 0), 0);
const TOTH = () => { const t = SCT(); return `<b class=mono style="color:${t === 100 ? 'var(--ok)' : 'var(--bad)'}">Total: ${t} / 100 pts</b>`; };
const upT = () => { $('#sct').innerHTML = TOTH(); SE.cats.forEach((c, ci) => { const x = $('#cs' + ci); if (x) x.textContent = c.it.reduce((a, i) => a + (+i.p || 0), 0) + ' pts'; }); };
const addC = () => { SE.cats.push({ n: '', k: false, it: [{ t: '', p: 0, k: false }] }); render(); };
const addI = ci => { SE.cats[ci].it.push({ t: '', p: 0, k: false }); render(); };
const rmC = ci => { if (SE.cats.length > 1) SE.cats.splice(ci, 1); render(); };
const rmI = (ci, ii) => { const it = SE.cats[ci].it; if (it.length > 1) it.splice(ii, 1); else it[0] = { t: '', p: 0, k: false }; render(); };
const editSC = id => { const s = SCS.find(x => x.id === id); SE = JSON.parse(JSON.stringify({ id: s.id, name: s.name, desc: s.desc || '', tags: scTags(s), cats: s.cats })); render(); };
const saveSC = () => once('sc', async () => {
  const t = SCT(); if (t !== 100) return toast('Total points must equal 100 (currently ' + t + ')', true);
  const r = await api(SE.id ? '/api/scorecards/' + SE.id : '/api/scorecards', { name: SE.name, desc: SE.desc, tags: SE.tags || [], cats: SE.cats, workspace: SE.workspace }, SE.id ? 'PUT' : 'POST');
  if (!r.ok) { if (r.status === 401) return; return toast(await errOf(r, 'Could not save the scorecard'), true); }
  SE = null; await load(); render(); toast('Scorecard saved');
});
const delSC = id => ask('Delete this scorecard?', 'Reviews already made with it keep their scores. This cannot be undone.', async () => {
  const r = await api('/api/scorecards/' + id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete the scorecard'), true);
  await load(); render(); toast('Scorecard deleted');
}, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const SCL = () => { const tags = [...new Set(SCS.flatMap(scTags))].sort((a, b) => a.localeCompare(b)), list = SCS.filter(s => !SCF || scTags(s).includes(SCF));
  return head('Scorecards', 'Create and manage the scorecards used in QA Entry',ME.role === 'admin' ? `<button class=btn onclick="SE=newSE();render()">+ New scorecard</button>` : '')
  + scTabs('sco') + `<div class=fkp>${[['Scorecards', SCS.length], ['Categories', SCS.reduce((a, s) => a + s.cats.length, 0)], ['Items', SCS.reduce((a, s) => a + s.cats.reduce((b, c) => b + c.it.length, 0), 0)], ['Reviews', EV.length]].map(([k, v]) => `<div class=fk><div class=row><span>${k}</span></div><b>${v}</b></div>`).join('')}</div>`
  + (tags.length ? `<div class=chchips style="margin:0 0 14px">${['', ...tags].map(t => `<button class="chchip ${SCF === t ? 'on' : ''}" style="--c:var(--ac)" onclick="SCF=${jsq(t)};render()">${t ? esc(t) : 'All tags'} <b>(${SCS.filter(s => !t || scTags(s).includes(t)).length})</b></button>`).join('')}</div>` : '')
  + `<div class="g g2">${list.map(s => { const n = s.cats.reduce((a, c) => a + c.it.length, 0), t = s.cats.reduce((a, c) => a + c.it.reduce((x, i) => x + i.p, 0), 0), rv = EV.filter(e => e.scid === s.id).length;
    return card(`${esc(s.name)} <span class=bg style="float:right">${rv} review${rv === 1 ? '' : 's'}</span>`, `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:-4px 0 8px">${scTags(s).map(tagChip).join('')}</div><p class=mu style="margin:0 0 10px">${esc(s.desc || '')}</p><small>${s.cats.length} categories · ${n} items · ${t} pts</small><div style="margin:12px 0">${s.cats.map(c => `<div class=row style="font-size:13px;padding:3px 0"><span>${esc(c.n)}${c.k ? '<span class=crit>Critical category</span>' : ''}${c.it.some(i => i.k) ? '<span class=crit>Critical items</span>' : ''}</span><b class=mono>${c.it.reduce((x, i) => x + i.p, 0)} pts</b></div>`).join('')}</div>${ME.role === 'admin' ? `<div style="display:flex;gap:8px"><button class="ib ibx" onclick="editSC('${esc(s.id)}')">${IC.pen} Edit</button><button class="ib ibx" onclick="delSC('${esc(s.id)}')">${IC.bin} Delete</button></div>` : ''}`); }).join('')}</div>`; };
const SED = () => head(SE.id ? 'Edit scorecard' : 'New scorecard', 'Add categories and items. The points of all items must add up to 100.', `<div style="display:flex;gap:8px"><button class=ib onclick="SE=null;render()">Cancel</button><button class=btn onclick="saveSC()">Save scorecard</button></div>`)
  + card('Details', `<div class=eg2><label>Name<input value="${esc(SE.name)}" oninput="SE.name=this.value"></label><label>Description <span class=mu>(optional)</span><input value="${esc(SE.desc)}" oninput="SE.desc=this.value"></label></div><div style="margin-top:12px"><b style="font-size:12px">Tags</b> <small class=mu>— what this scorecard is for (e.g. Calls, Chats, B2C). Tags only help to find and filter scorecards: any scorecard can be used for any review.</small><div class=sctags>${(SE.tags || []).map((t, i) => `<span class=sctag>${esc(t)}<button type=button onclick="scTagDel(${i})" aria-label="Remove ${esc(t)}">×</button></span>`).join('')}<input id=sctin placeholder="Type a tag and press Enter" maxlength=30 onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();scTagAdd(this.value)}"></div>${scTagSugg().length ? `<div class=sctsug>${scTagSugg().map(t => `<button type=button onclick="scTagAdd(${jsq(t)})">+ ${esc(t)}</button>`).join('')}</div>` : ''}</div>${tipBox('tip.sc-rules', 'Critical rules', '<ul><li><b>Critical item</b>: if it is answered <b>No</b>, the whole category scores 0 points.</li><li><b>Critical category</b>: if any item in it is answered <b>No</b>, the whole review scores 0%.</li><li><b>N/A</b> (not applicable) never lowers the score.</li></ul>')}`)
  + SE.cats.map((c, ci) => card('', `<div class=row style="gap:10px;margin-bottom:12px;flex-wrap:wrap"><input style="flex:1;min-width:200px;font-weight:600" placeholder="Category name" value="${esc(c.n)}" oninput="SE.cats[${ci}].n=this.value"><label class=rad style="white-space:nowrap" title="If any item in this category is answered No, the whole review scores 0%"><input type=checkbox ${c.k ? 'checked' : ''} onchange="SE.cats[${ci}].k=this.checked"> Critical category</label><b class=mono id=cs${ci} style="white-space:nowrap">${c.it.reduce((a, i) => a + (+i.p || 0), 0)} pts</b><button class=ic onclick="rmC(${ci})" title="Delete category">${IC.bin}</button></div>`
    + c.it.map((i, ii) => `<div class=row style="gap:10px;margin-bottom:8px;flex-wrap:wrap"><input style="flex:1;min-width:220px" placeholder="Evaluation criterion" value="${esc(i.t)}" oninput="SE.cats[${ci}].it[${ii}].t=this.value"><input type=number min=0 max=100 style="width:84px" value="${i.p}" oninput="SE.cats[${ci}].it[${ii}].p=+this.value;upT()"><small>pts</small><label class=rad style="white-space:nowrap" title="If this item is answered No, its whole category scores 0 points"><input type=checkbox ${i.k ? 'checked' : ''} onchange="SE.cats[${ci}].it[${ii}].k=this.checked"> Critical</label><label class=rad style="white-space:nowrap" title="A legal / compliance item (responsible gaming, disclosures, data protection). It is followed on the Compliance page."><input type=checkbox ${i.cp ? 'checked' : ''} onchange="SE.cats[${ci}].it[${ii}].cp=this.checked"> Compliance</label><button class=ic onclick="rmI(${ci},${ii})" title="Delete item">${IC.bin}</button></div>`).join('')
    + `<button class="ib ibx" onclick="addI(${ci})">+ Add item</button>`)).join('')
  + `<div class=row style="flex-wrap:wrap;gap:8px"><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="ib ibx" onclick="addC()">+ Add category</button><button class="ib ibx" onclick="addFromLib()">Add category from library</button></span><div id=sct>${TOTH()}</div></div>`;

PG.sco = () => SE ? SED() : SCL();

// ---------- helpers shared by Teams / Users / Skills / Workspaces
const uname = n => { const p = String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s'-]/g, '').trim().split(/\s+/); return ((p[0] || 'u')[0] + '.' + (p.slice(1).join('') || 'user')).replace(/[^a-z.]/g, ''); };
const emailOf = n => uname(n) + '@test.com';          // Gabriela Nikolova -> g.nikolova@test.com
const workTeams = () => TEAMS.filter(t => !t.system);
const teamOpts = blank => [...(blank ? [['', blank]] : []), ...workTeams().map(t => [t.id, t.name])];
const chips = l => (l || []).map(x => `<span class=tg>${esc(x)}</span>`).join(' ') || '<small class=mu>—</small>';
const leadName = id => { const t = TEAMS.find(x => x.id === id), u = t && ROSTER.find(r => r.username === t.lead); return u ? u.name : '—'; };
const wsOf = teamId => WSP.filter(w => w.teams.includes(teamId)).map(w => w.name).join(', ') || '—';

// ---------- teams
const TEAM_FIELDS = isNew => [
  { k: 'name', l: 'Team name', req: 1 }, { k: 'desc', l: 'Description', t: 'textarea', rows: 2 },
  { k: 'lead', l: 'Team lead', req: 1, t: 'select', hint: 'Every team needs a team lead.', o: () => [['', 'Choose a team lead…'], ...ROSTER.filter(r => r.active && ['lead', 'admin', 'qa', 'trainer'].includes(r.role)).map(r => [r.username, r.name + ' (' + ROLE[r.role] + ')'])] },
  ...(isNew ? [{ k: 'workspace', l: 'Workspace', t: 'select', o: () => WSP.map(w => [w.id, w.name]) }] : []),
  { k: 'languages', l: 'Languages', t: 'picker', kind: 'languages' }, { k: 'skills', l: 'Skills', t: 'picker', kind: 'skills' },
  { k: 'region', l: 'Region / market' }, { k: 'hours', l: 'Working hours', ph: '08:00-17:00' }, { k: 'channels', l: 'Channels', t: 'chips', ph: 'Phone, Chat, Email' },
  { k: 'notes', l: 'Notes', t: 'textarea', rows: 2 }, { k: 'color', l: 'Colour', t: 'color' }
];
const newTeam = () => openForm({ drawer: true, title: 'New team', fields: TEAM_FIELDS(true), d: { name: '', desc: '', lead: '', workspace: WSP[0] ? WSP[0].id : '', languages: [], skills: [], region: '', hours: '', channels: [], notes: '', color: '#ea580c' }, yes: 'Create team', save: async d => { const r = await api('/api/teams', d); if (!r.ok) return errOf(r, 'Could not create the team'); await load(); toast('Team created'); } });
const editTeam = id => { const t = TEAMS.find(x => x.id === id); openForm({ drawer: true, title: 'Edit team', fields: TEAM_FIELDS(false), d: { ...t, _add: [], _q: '' }, extra: d => t.system ? '' : teamPick(t, d),
  save: async d => { const { _add, _q, ...b } = d; const r = await api('/api/teams/' + id, b, 'PUT'); if (!r.ok) return errOf(r, 'Could not save the team'); for (const u of _add) { const x = await api('/api/users/' + encodeURIComponent(u), { team: id }, 'PUT'); if (!x.ok) toast(await errOf(x, 'Could not move ' + u), true); } await load(); toast(_add.length ? tr(`Team saved · ${_add.length} moved in`) : 'Team saved'); } }); };
// team members (like Modjo): the members ticked first, then every other agent; ticking one moves them into this team on Save
const teamPick = (t, d) => { const q = (d._q || '').toLowerCase(), mem = ROSTER.filter(r => r.active && r.team === t.id && r.role === 'agent'), oth = ROSTER.filter(r => r.active && r.role === 'agent' && r.team !== t.id && (!q || r.name.toLowerCase().includes(q)));
  return `<div class=tpick><div class=row><b>${tr('Team members')} <span class=bg>${mem.length + d._add.length}</span></b></div><input placeholder="${esc(tr('Search an agent…'))}" value="${esc(d._q)}" oninput="FM.d._q=this.value;render();setTimeout(()=>{const i=$('.tpick input');if(i){i.focus();i.setSelectionRange(99,99)}},0)">`
    + mem.map(r => `<label class=rad><input type=checkbox checked disabled> <span>${esc(r.name)} <small class=mu>${tr('in this team')}</small></span></label>`).join('')
    + oth.slice(0, 40).map(r => `<label class=rad><input type=checkbox ${d._add.includes(r.username) ? 'checked' : ''} onchange="const a=FM.d._add,i=a.indexOf('${esc(r.username)}');if(this.checked&&i<0)a.push('${esc(r.username)}');if(!this.checked&&i>=0)a.splice(i,1)"> <span>${esc(r.name)} <small class=mu>${esc(tn(r.team))}</small></span></label>`).join('')
    + `<small class=mu>${tr('Tick an agent to move them into this team (their old reviews stay on record). To take someone out, move them to their new team.')}</small></div>`; };
const delTeam = id => ask('Delete this team?', 'The team must be empty. Reviews already made keep their history and the team name.', async () => { const r = await api('/api/teams/' + id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete the team'), true); await load(); render(); toast('Team deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
// moving an agent: old reviews stay on record, both teams' statistics change automatically.
// A routine action: the person may switch the question off, and every move offers Undo (moving them straight back).
const moveUser = (un, team) => { const u = ROSTER.find(x => x.username === un); if (!u || u.team === team) return render();
  const from = u.team, go = async (to, undo) => {
    const r = await api('/api/users/' + encodeURIComponent(un), { team: to }, 'PUT');
    if (!r.ok) toast(await errOf(r, 'Could not move the user'), true); else if (undo) toast(u.name + ' moved to ' + tn(to), false, { undo: () => go(from, false) }); else toast(u.name + ' is back in ' + tn(to));
    await load(); render();
  };
  ask('Move ' + u.name + '?', `${u.name} moves from ${tn(u.team)} to ${tn(team)}. Their earlier reviews stay on record, and the statistics of both teams are recalculated with the new members.`, () => go(team, true), { yes: 'Yes, move', no: 'Cancel', onNo: render, id: 'confirm.move-user' }); };
const teamActions = t => `<div style="display:flex;gap:8px"><button class="ib ibx" onclick="editTeam('${t.id}')">${IC.pen} Edit</button>${t.system ? '' : `<button class="ib ibx" onclick="delTeam('${t.id}')">${IC.bin} Delete</button>`}</div>`;
// the Teams table (4 November): filters and the columns each person chooses, like Reviews
const teamList = (q = (UF.tq || '').toLowerCase()) => TEAMS.filter(t => (!q || t.name.toLowerCase().includes(q)) && (!UF.tw || WSP.some(w => w.id === UF.tw && w.teams.includes(t.id))) && (!UF.tl || (t.languages || []).includes(UF.tl)) && (!UF.ts || (t.skills || []).includes(UF.ts)));
const TCOLS = [
  { k: 'team', t: 'Team', lock: true, td: t => `<span style="color:${t.color}">●</span> <b>${esc(t.name)}</b>${t.system ? ' ' + pill('built in', 'ac') : ''}<br><small class=mu>${esc(t.desc || '')}</small>` },
  { k: 'lead', t: 'Team lead', td: t => esc(leadName(t.id)) },
  { k: 'ag', t: 'Agents', td: t => ROSTER.filter(r => r.active && r.team === t.id && r.role === 'agent').length },
  { k: 'ppl', t: 'People', td: t => ROSTER.filter(r => r.active && r.team === t.id).length },
  { k: 'lang', t: 'Languages', td: t => chips(t.languages) },
  { k: 'skills', t: 'Skills', td: t => chips(t.skills) },
  { k: 'ws', t: 'Workspace', td: t => esc(wsOf(t.id)) },
  { k: 'pass', t: 'Pass target', td: t => PT(t.id) + '%' },
  { k: 'region', t: 'Region', off: true, td: t => esc(t.region || '—') },
  { k: 'hours', t: 'Hours', off: true, td: t => esc(t.hours || '—') },
  { k: 'chan', t: 'Channels', off: true, td: t => chips(t.channels) },
  { k: 'act', t: '', lock: true, r: true, td: t => teamActions(t) }];
txReg('teams', { cols: TCOLS, rows: () => teamList(), count: () => teamList().length, clear: () => { Object.assign(UF, { tw: '', tl: '', ts: '' }); },
  filters: () => [{ k: 'tw', n: 'Workspace', v: UF.tw || '', o: () => WSP.map(w => [w.id, w.name]), set: v => { UF.tw = v; } },
    { k: 'tl', n: 'Language', v: UF.tl || '', o: () => SKL.languages.map(s => [s, s]), set: v => { UF.tl = v; } },
    { k: 'ts', n: 'Skill', v: UF.ts || '', o: () => SKL.skills.map(s => [s, s]), set: v => { UF.ts = v; } }] });
PG.teams = function () {
  const head2 = head('Teams', 'Every team has a team lead and a workspace. Administration holds all admins, QA, team leads and trainers.', `<div style="display:flex;gap:8px;flex-wrap:wrap">${vwBtn('teams')}<button class=btn onclick="newTeam()">+ New team</button></div>`);
  const q = (UF.tq || '').toLowerCase(), TL = teamList(q);
  const srch = `<div class=row style="margin-bottom:12px;justify-content:flex-start"><div class=sx style="width:260px"><span>${IC.search}</span><input placeholder="${esc(tr('Search teams…'))}" value="${esc(UF.tq || '')}" oninput="UF.tq=this.value;clearTimeout(UF.tt);UF.tt=setTimeout(()=>{render();const i=$('.sx input');if(i){i.focus();i.setSelectionRange(99,99)}},250)"></div><small class=mu>${TL.length} ${tr('teams')} · ${ROSTER.filter(r => r.active).length} ${tr('people')}</small></div>`, srch2 = card('', txTools('teams', srch.replace('margin-bottom:12px;', 'margin:0;')));
  if (vw('teams') === 'table') return head2 + srch2 + card('', txTbl('teams', TL, ''));
  if (GOTM) { const id = GOTM; GOTM = ''; setTimeout(() => { const c = $('.tm-' + id); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('hl'); setTimeout(() => c.classList.remove('hl'), 2200); } }, 60); }
  return head2 + srch2 + `<div class="g g2">${TL.map(t => { const mem = ROSTER.filter(r => r.active && r.team === t.id);
    return card(`<span style="color:${t.color}">●</span> ${esc(t.name)} ${t.system ? pill('built in', 'ac') : ''} <span class=bg title="${esc(tr('people'))}">${mem.length}</span>`, `<p class=mu style="margin:0 0 10px">${esc(t.desc || '')}</p><div class=row style="flex-wrap:wrap;gap:6px;font-size:13px"><span>Team lead: <b>${esc(leadName(t.id))}</b></span><span>${mem.filter(m => m.role === 'agent').length} agents · pass target ${PT(t.id)}%</span></div>`
      + `<div style="margin:10px 0;font-size:13px"><b>Workspace</b> ${esc(wsOf(t.id))}<br><b>Languages</b> ${chips(t.languages)}<br><b>Skills</b> ${chips(t.skills)}<br><b>Region</b> ${esc(t.region || '—')} · <b>Hours</b> ${esc(t.hours || '—')} · <b>Channels</b> ${chips(t.channels)}${t.notes ? `<br><small class=mu>${esc(t.notes)}</small>` : ''}</div>`
      + `<b style="font-size:13px">Members</b>${mem.map(m => `<div class="row li" style="font-size:13px"><span>${esc(m.name)} <small class=mu>${ROLE[m.role]}</small></span>${m.role === 'agent' ? `<select style="width:auto;padding:4px" onchange="moveUser('${esc(m.username)}',this.value)" title="Move to another team">${teamOpts().map(([a, b]) => `<option value="${a}" ${a === t.id ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>` : ''}</div>`).join('') || '<p class=mu style="margin:6px 0">No members yet</p>'}`
      + `<div style="margin-top:12px">${teamActions(t)}</div>`, 'tm-' + t.id); }).join('')}</div>`;
};

// ---------- users (admin): add, rename, move, deactivate, delete; a clean list, the form in a side drawer, and a list import
// what each role may see and do (shown under the role, and when you rest the mouse on it)
const ROLEHELP = { admin: 'Sees and changes everything, including users, settings and data protection.', qa: 'Reviews calls, resolves disputes, runs calibrations; sees the teams of their workspaces.', lead: 'Leads a team: sees its reviews, writes one-to-ones, gives tasks, approves time off.', trainer: 'Coaches and trains: sees the teams of their workspaces, writes coaching sessions, quizzes and articles.', agent: 'Sees only their own reviews, tasks, learning and time off.' };
const lastIn = u => u.lastIn ? `<span title="${esc(fdt(u.lastIn))}">${tkD(u.lastIn)}</span>` : '<small class=mu>' + tr('never') + '</small>';
let UF = { q: '', team: '', role: '', st: 'active', sk: '', lg: '' };
// the time zones to choose from (4 November): the company's (empty) first, then every zone the browser knows
const tzOpts = () => { const co = (SET.org || {}).tz || Intl.DateTimeFormat().resolvedOptions().timeZone; let l = []; try { l = Intl.supportedValuesOf('timeZone'); } catch (e) { l = [co]; } return [['', tr('Company time zone') + ' (' + co + ')'], ...l.map(z => [z, z.replace(/_/g, ' ')])]; };
const fmName = () => { const d = FM.d, v = ((d.firstName || '') + ' ' + (d.lastName || '')).trim(); if (FM.isNew) { if (!d._u) { d.username = uname(v); const u = $('#fu'); if (u) u.value = d.username; } if (!d._e) { d.email = emailOf(v); const e = $('#fe'); if (e) e.value = d.email; } } };
const USER_FIELDS = isNew => [
  { k: 'firstName', l: 'First name', req: 1, on: isNew ? 'fmName' : '' }, { k: 'lastName', l: 'Last name', req: 1, on: isNew ? 'fmName' : '' },
  ...(isNew ? [{ k: 'username', l: 'Username', id: 'fu', hint: 'Suggested from the name. Letters, numbers, dots.', on: 'FM.d._u=1;void' }] : []),
  { k: 'email', l: 'Email', t: 'email', id: 'fe', on: isNew ? 'FM.d._e=1;void' : '' },
  { k: 'role', l: 'Role', t: 'select', o: Object.entries(ROLE), re: 1, hint: 'Admins, QA specialists, team leads and trainers are placed in the Administration team automatically.' },
  { k: 'team', l: 'Team', req: 1, t: 'select', show: d => d.role === 'agent', o: () => teamOpts('Choose a team…'), hint: 'Every agent belongs to a team. Moving someone keeps their old reviews and updates both teams.' },
  { k: 'workspaces', l: 'Workspaces', t: 'multi', show: d => !['agent', 'admin'].includes(d.role), o: () => WSP.map(w => [w.id, w.name]), hint: 'Which workspaces this person works in. Admins see all of them.' },
  { k: 'title', l: 'Job title' }, { k: 'phone', l: 'Phone' }, { k: 'start', l: 'Start date', t: 'date' },
  { k: 'tz', l: 'Time zone', t: 'select', o: tzOpts, hint: 'Shifts, check-ins and lateness use this time zone. Empty: the company time zone.' },
  { k: 'languages', l: 'Languages', t: 'picker', kind: 'languages' }, { k: 'skills', l: 'Skills', t: 'picker', kind: 'skills' }, { k: 'desc', l: 'Description', t: 'textarea', rows: 2 },
  ...(isNew ? [] : [{ k: 'active', l: 'Active account', t: 'checkbox', hint: 'Inactive people cannot log in and disappear from the pick lists; their history stays.' }]),
  ...EMP_FIELDS()
];
const addUser = () => { openForm({ drawer: true, title: 'Add a user', fields: USER_FIELDS(true), d: { firstName: '', lastName: '', username: '', email: '', role: 'agent', team: workTeams()[0] ? workTeams()[0].id : '', workspaces: WSP[0] ? [WSP[0].id] : [], title: '', phone: '', start: '', languages: [], skills: [], desc: '', empType: 'full', hours: 40, empStatus: 'active' }, yes: 'Create user',
  extra: d => roleGuide(d.role) + '<p class=mu style="margin:0">The new user gets the temporary password <b class=mono>password</b> and must choose a new one at the first login.</p>',
  save: async d => { const r = await api('/api/users', d); if (!r.ok) return errOf(r, 'Could not create the user'); await load(); toast('User created. Temporary password: password'); } }); FM.isNew = true; };
const editUser = un => { const u = USR.find(x => x.username === un); openForm({ drawer: true, title: 'Edit ' + u.name, fields: USER_FIELDS(false), d: u,
  extra: d => roleGuide(d.role) + `<p class=mu style="margin:0"><b>Last sign-in</b> ${u.lastIn ? fdt(u.lastIn) : tr('never')}</p><p class=mu style="margin:0"><b>Username</b> <span class=mono>${esc(u.username)}</span> (fixed)</p>${(u.teamHistory || []).length ? `<div class=tips><b>Team history</b><ul>${u.teamHistory.slice(-6).reverse().map(h => `<li>${fdt(h.at)}: ${esc(tn(h.from))} → ${esc(tn(h.to))} <small>(${esc(h.by)})</small></li>`).join('')}</ul></div>` : ''}`,
  save: async d => { const r = await api('/api/users/' + encodeURIComponent(un), d, 'PUT'); if (!r.ok) return errOf(r, 'Could not save the user'); await load(); toast('User saved'); } }); };
const toggleUser = un => { const u = USR.find(x => x.username === un), off = u.active !== false;
  ask(off ? 'Deactivate ' + u.name + '?' : 'Activate ' + u.name + '?', off ? 'They can no longer log in and will disappear from the pick lists. Their reviews and history stay.' : 'They can log in again.', async () => {
    const r = await api('/api/users/' + encodeURIComponent(un), { active: !off }, 'PUT'); toast(r.ok ? (off ? 'Deactivated' : 'Activated') : await errOf(r, 'Could not change the account'), !r.ok); await load(); render();
  }, { yes: off ? 'Yes, deactivate' : 'Yes, activate', no: 'Cancel' }); };
const delUser = un => { const u = USR.find(x => x.username === un);
  ask('Delete ' + u.name + '?', 'The account is removed for good. Their reviews stay on record with their name. If you only want to stop their access, deactivate instead.', async () => {
    const r = await api('/api/users/' + encodeURIComponent(un), null, 'DELETE'); toast(r.ok ? 'User deleted' : await errOf(r, 'Could not delete the user'), !r.ok); await load(); render();
  }, { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
const resetPw = u => ask('Reset this password?', `The password of ${u} will be set back to "password" and they must choose a new one at their next login.`, async () => {
  const r = await api('/api/users/' + encodeURIComponent(u) + '/reset', {}); toast(r.ok ? 'Password reset to "password"' : await errOf(r, 'Could not reset the password'), !r.ok); await load(); render();
}, { yes: 'Yes, reset it', no: 'Cancel' });
const regApprove = id => once('reg' + id, async () => {
  const role = $('#rr' + id).value, team = $('#rt' + id).value;
  const r = await api(`/api/registrations/${id}/approve`, { role, team }); if (!r.ok) return toast(await errOf(r, 'Could not approve'), true);
  await load(); render(); toast('Registration approved. The person was emailed.');
});
const regDecline = id => ask('Decline this registration?', 'The person will receive an email saying the registration was declined.', async () => {
  const r = await api(`/api/registrations/${id}/decline`, {}); if (!r.ok) return toast(await errOf(r, 'Could not decline'), true);
  await load(); render(); toast('Registration declined. The person was emailed.');
}, { yes: 'Yes, decline', no: 'Cancel', danger: true });
const userList = () => { const q = UF.q.toLowerCase(); return USR.filter(u => (!UF.team || u.team === UF.team) && (!UF.role || u.role === UF.role) && (UF.st === '' || (UF.st === 'active' ? u.active !== false : u.active === false)) && (!UF.sk || (u.skills || []).includes(UF.sk)) && (!UF.lg || (u.languages || []).includes(UF.lg)) && (!q || (u.name + ' ' + u.username + ' ' + (u.email || '')).toLowerCase().includes(q))); };
const userAct = u => `<span style="white-space:nowrap"><button class=ic onclick="editUser('${esc(u.username)}')" title="Edit">${IC.pen}</button><button class=ic onclick="resetPw('${esc(u.username)}')" title="Reset password to &quot;password&quot;">${IC.gear}</button><button class=ic onclick="toggleUser('${esc(u.username)}')" title="${u.active === false ? 'Activate' : 'Deactivate'}">${u.active === false ? IC.play : IC.x}</button><button class=ic onclick="delUser('${esc(u.username)}')" title="Delete">${IC.bin}</button></span>`;
const stPill = u => u.active === false ? pill('Inactive', 'bad') : u.mustChange ? pill('Must change password', 'wn') : pill('Active', 'ok');
// the columns and the filters of the Users table (4 November), like Reviews
const UCOLS = [
  { k: 'name', t: 'Name', lock: true, td: u => `<a href="javascript:void(0)" class=uname onclick="editUser('${esc(u.username)}')"><span class=av style="background:${tcol(u.team)}">${esc(ini(u.name))}</span><span><b>${esc(u.name)}</b><br><small class=mu>${esc([tn(u.team), u.title].filter(Boolean).join(' · '))}</small></span></a>` },
  { k: 'role', t: 'Role', td: u => `<span title="${esc(tr(ROLEHELP[u.role] || ''))}">${pill(ROLE[u.role] || u.role, 'ac')}</span>` },
  { k: 'team', t: 'Team', off: true, td: u => esc(tn(u.team)) },
  { k: 'lead', t: 'Team lead', td: u => esc(leadName(u.team)) },
  { k: 'email', t: 'Email', off: true, td: u => esc(u.email || '') },
  { k: 'title', t: 'Job title', off: true, td: u => esc(u.title || '') },
  { k: 'emp', t: 'Employment', td: u => empCell(u) },
  { k: 'st', t: 'Status', td: u => stPill(u) },
  { k: 'last', t: 'Last sign-in', td: u => lastIn(u) },
  { k: 'lang', t: 'Languages', off: true, td: u => chips(u.languages) },
  { k: 'skills', t: 'Skills', off: true, td: u => chips(u.skills) },
  { k: 'phone', t: 'Phone', off: true, td: u => esc(u.phone || '') },
  { k: 'start', t: 'Start date', off: true, td: u => esc(u.start || '') },
  { k: 'act', t: '', lock: true, r: true, td: u => userAct(u) }];
txReg('users', { cols: UCOLS, rows: () => userList(), count: () => userList().length, clear: () => { Object.assign(UF, { team: '', role: '', st: '', sk: '', lg: '' }); },
  filters: () => [{ k: 'team', n: 'Team', v: UF.team, o: () => TEAMS.map(t => [t.id, t.name]), set: v => { UF.team = v; } },
    { k: 'role', n: 'Role', v: UF.role, o: () => Object.entries(ROLE), set: v => { UF.role = v; } },
    { k: 'st', n: 'Status', v: UF.st, o: () => [['active', 'Active'], ['inactive', 'Inactive']], set: v => { UF.st = v; } },
    { k: 'sk', n: 'Skill', v: UF.sk, o: () => SKL.skills.map(s => [s, s]), set: v => { UF.sk = v; } },
    { k: 'lg', n: 'Language', v: UF.lg, o: () => SKL.languages.map(s => [s, s]), set: v => { UF.lg = v; } }] });
const UT = l => vw('users') === 'boxes'
  ? `<div class=bxg>${l.map(u => `<div class=bx><div class=row><span style="display:flex;gap:10px;align-items:center"><span class=av style="margin:0">${esc(ini(u.name))}</span><span><b>${esc(u.name)}</b><br><small class=mu>${esc(u.title || ROLE[u.role])}</small></span></span>${stPill(u)}</div><small class=mu>${esc(u.email || u.username)}</small><div>${pill(ROLE[u.role] || u.role, 'ac')} <span class=tg style="color:${tcol(u.team)}">${esc(tn(u.team))}</span></div><small class=mu>Team lead: ${esc(leadName(u.team))}</small><div>${chips(u.languages)}</div><div>${chips(u.skills)}</div>${userAct(u)}</div>`).join('') || '<p class=mu>No users match</p>'}</div>`
  : card(`${l.length} user${l.length === 1 ? '' : 's'}`, txTbl('users', l));
// the role and what it may see, under the role of the user form
const roleGuide = r => `<div class=rguide>${Object.entries(ROLE).map(([k, n]) => `<div class="${k === r ? 'on' : ''}"><b>${esc(n)}</b><small>${tr(ROLEHELP[k] || '')}</small></div>`).join('')}</div>`;
// import people from a list (Excel or CSV): first name, last name, email, role, team
const userImport = () => openForm({ drawer: true, title: 'Import users', yes: 'Import', d: { txt: '' }, fields: [{ k: 'txt', l: 'Paste one person per line: first name, last name, email, role, team', t: 'textarea', rows: 10, ph: 'Maria, Todorova, m.todorova@company.com, agent, B2C' }],
  extra: () => `<p class=mu style="margin:0">${tr('Role: admin, qa, lead, trainer or agent (agent when empty). Team: the team name, needed for agents. Everybody gets the temporary password "password".')}</p>`,
  save: async d => { const rows = d.txt.split(/\r?\n/).map(l => l.split(/[,;\t]/).map(x => x.trim())).filter(c => c.length >= 2 && c[0] && c[1]); if (!rows.length) return 'Paste at least one line: first name, last name…';
    const roleOf = v => { v = (v || 'agent').toLowerCase(); return ROLE[v] ? v : (Object.entries(ROLE).find(([, n]) => n.toLowerCase() === v) || ['agent'])[0]; }, teamOf2 = v => (TEAMS.find(t => t.name.toLowerCase() === String(v || '').toLowerCase() || t.id === v) || {}).id || '';
    let ok = 0; const bad = []; for (const c of rows) { const role = roleOf(c[3]), body = { firstName: c[0], lastName: c[1], email: c[2] || '', role, team: role === 'agent' ? teamOf2(c[4]) : '', workspaces: WSP[0] ? [WSP[0].id] : [] }; body.username = uname(c[0] + ' ' + c[1]); const r = await api('/api/users', body); if (r.ok) ok++; else bad.push(c[0] + ' ' + c[1] + ': ' + await errOf(r, 'error')); }
    await load(); toast(tr(`${ok} imported`) + (bad.length ? ' · ' + bad.slice(0, 3).join(' · ') : ''), !!bad.length); } });
PG.users = function () {
  if (ME.role !== 'admin') return head('Users', 'People and access') + card('', '<p class=mu>Only admins can see this page.</p>');
  return head('Users', 'Add, rename, move and remove people. Everybody belongs to a team.', `<div style="display:flex;gap:8px;flex-wrap:wrap">${vwBtn('users')}<button class="ib ibx" onclick="userImport()">${IC.up} ${tr('Import')}</button><button class=btn onclick="addUser()">+ Add user</button></div>`)
    + (REG.length ? card(`Pending registrations <span class=bg>${REG.length}</span>`, REG.map(r => `<div class="row li" style="flex-wrap:wrap;gap:10px"><div><b>${esc(r.name)}</b> <small>@${esc(r.username)} · ${esc(r.email)} · ${fdt(r.at)}</small></div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id=rr${r.id}>${Object.entries(ROLE).map(([k, v]) => `<option value=${k} ${k === 'agent' ? 'selected' : ''}>${v}</option>`).join('')}</select><select id=rt${r.id}>${teamOpts('— team (agents) —').map(([a, b]) => `<option value="${a}">${esc(b)}</option>`).join('')}</select><button class=btn onclick="regApprove('${r.id}')">Approve</button><button class=ib onclick="regDecline('${r.id}')">Decline</button></div></div>`).join('')) : '')
    + card('', txTools('users', `<input style="flex:1;min-width:200px" placeholder="Search name, username or email…" value="${esc(UF.q)}" oninput="UF.q=this.value;ul()">`))
    + `<div id=ut>${UT(userList())}</div>`;
};
const ul = () => { const e = $('#ut'); if (e) { e.innerHTML = UT(userList()); enhance(); } };

// ---------- skills and languages catalog (people can only pick from these)
const skForm = (kind, name) => openForm({ title: (name ? 'Rename ' : 'New ') + kind, d: { name: name || '' }, fields: [{ k: 'name', l: kind === 'language' ? 'Language' : 'Skill', req: 1 }], yes: name ? 'Rename' : 'Add',
  save: async d => { const r = name ? await api('/api/skills', { kind, name, to: d.name }, 'PUT') : await api('/api/skills', { kind, name: d.name }); if (!r.ok) return errOf(r, 'Could not save'); await load(); toast(name ? 'Renamed everywhere' : 'Added'); } });
const skDel = (kind, name) => { const n = (SKL.counts[kind === 'language' ? 'languages' : 'skills'] || {})[name] || 0; ask('Delete "' + name + '"?', n ? `${n} ${n === 1 ? 'person has' : 'people have'} it. It will be removed from them too.` : 'Nobody has it yet.', async () => { await api('/api/skills?kind=' + kind + '&name=' + encodeURIComponent(name), null, 'DELETE'); await load(); render(); toast('Deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
const skWin = (kind, title, list) => { const k = kind === 'language' ? 'languages' : 'skills', cnt = SKL.counts[k] || {};
  return card(`${title} <span class=bg>${list.length}</span>`, `<div class=row style="margin-bottom:10px"><small class=mu>${kind === 'language' ? 'Languages people speak' : 'What people are good at'}</small><button class="btn ibx" onclick="skForm('${kind}')">${IC.plus} Add ${kind}</button></div>` + (vw('skills') === 'boxes'
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${list.map(x => `<span class=tg style="padding:5px 6px 5px 12px;font-size:13px;color:var(--tx)">${esc(x)} <small class=mu>${cnt[x] || 0}</small> <button class=ic style="width:24px;height:24px" onclick="skForm('${kind}',${jsq(x)})" title="Rename ${esc(x)}">${IC.pen}</button><button class=ic style="width:24px;height:24px" onclick="skDel('${kind}',${jsq(x)})" title="Delete ${esc(x)}">${IC.x}</button></span>`).join('')}</div>`
    : list.map(x => `<div class="row li"><span>${esc(x)}</span><span><small class=mu>${cnt[x] || 0} people</small> <button class=ic onclick="skForm('${kind}',${jsq(x)})" title="Rename ${esc(x)}">${IC.pen}</button><button class=ic onclick="skDel('${kind}',${jsq(x)})" title="Delete ${esc(x)}">${IC.bin}</button></span></div>`).join(''))); };
PG.skills = () => head('Skills', 'The lists people pick their skills and languages from', vwBtn('skills')) + `<div class="g g2">${skWin('skill', 'Skills', SKL.skills)}${skWin('language', 'Languages', SKL.languages)}</div>`;

// ---------- workspaces: each workspace holds its own teams, scorecards and staff. Admins see all of them.
const WS_F = [{ k: 'name', l: 'Workspace name', req: 1 }, { k: 'desc', l: 'Description', t: 'textarea', rows: 2 }, { k: 'color', l: 'Colour', t: 'color' },
  { k: 'teams', l: 'Teams in this workspace', t: 'multi', o: () => workTeams().map(t => [t.id, t.name]) }, { k: 'scorecards', l: 'Scorecards used here', t: 'multi', o: () => SCS.map(s => [s.id, s.name]) },
  { k: 'staff', l: 'QA specialists, team leads and trainers working here', t: 'multi', o: () => ROSTER.filter(r => r.active && !['agent', 'admin'].includes(r.role)).map(r => [r.username, r.name + ' (' + ROLE[r.role] + ')']) }];
const wsForm = (w, id) => openForm({ title: id ? 'Edit workspace' : 'New workspace', d: w, fields: WS_F, yes: id ? 'Save' : 'Create', save: async d => { const r = await api(id ? '/api/workspaces/' + id : '/api/workspaces', d, id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save the workspace'); await load(); toast('Workspace saved'); } });
const delWs = id => ask('Delete this workspace?', 'Teams and scorecards stay, but people who only worked in it lose access until they are added to another workspace.', async () => { const r = await api('/api/workspaces/' + id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete'), true); await load(); render(); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const wsAct = w => `<div style="display:flex;gap:8px"><button class="ib ibx" onclick="wsForm(JSON.parse(JSON.stringify(WSP.find(x=>x.id==='${w.id}'))),'${w.id}')">${IC.pen} Edit</button><button class="ib ibx" onclick="delWs('${w.id}')">${IC.bin}</button></div>`;
PG.wsp = function () {
  const ag = w => ROSTER.filter(r => r.active && r.role === 'agent' && w.teams.includes(r.team)).length;
  return head('Workspaces', 'Keep teams, scorecards and people in separate spaces. Only admins see everything.', `<div style="display:flex;gap:8px;flex-wrap:wrap">${vwBtn('wsp')}<button class=btn onclick="wsForm({name:'',desc:'',color:'#ea580c',teams:[],scorecards:[],staff:[]})">+ New workspace</button></div>`)
    + howTo('workspaces', '<p>A workspace is a small world of its own: <b>teams</b>, the <b>scorecards</b> they are scored with, and the <b>QA specialists, team leads and trainers</b> who work there. People only see the reviews, teams and scorecards of their workspace; <b>admins see all workspaces</b>. Agents belong to the workspace of their team. Start with one workspace and add more when teams stop sharing scorecards.</p>', 'tip.workspaces')
    + (vw('wsp') === 'table' ? card('', tbl(['Workspace', 'Teams', 'Agents', 'Scorecards', 'Staff', ''], WSP.map(w => [`<span style="color:${w.color}">●</span> <b>${esc(w.name)}</b><br><small class=mu>${esc(w.desc || '')}</small>`, chips(w.teams.map(tn)), ag(w), chips(w.scorecards.map(id => (SCS.find(s => s.id === id) || {}).name).filter(Boolean)), chips(w.staff.map(an)), wsAct(w)])))
      : `<div class=bxg>${WSP.map(w => `<div class=bx><b><span style="color:${w.color}">●</span> ${esc(w.name)}</b><small class=mu>${esc(w.desc || '')}</small><div><small class=mu>Teams</small> ${chips(w.teams.map(tn))}</div><div><small class=mu>Scorecards</small> ${chips(w.scorecards.map(id => (SCS.find(s => s.id === id) || {}).name).filter(Boolean))}</div><small>${ag(w)} agents · ${w.staff.length} staff</small>${wsAct(w)}</div>`).join('')}</div>`);
};

// ---------- system settings (pass rate thresholds) + account
async function saveSys() {
  const teams = {}; TEAMS.forEach(t => { const el = $('#spt' + t.id); if (el) teams[t.id] = el.value.trim(); });   // the built-in Administration team has no box (staff are never reviewed)
  const r = await api('/api/settings', { pass: $('#spg').value, teams }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save the settings'), true);
  SET = await r.json(); SYS = false; render(); toast('System settings saved');
}
async function saveProfile() {
  const r = await api('/api/profile', { firstName: $('#apf').value, lastName: $('#apl').value, email: $('#ape').value, languages: ACD.languages, skills: ACD.skills, desc: $('#apd').value, birthday: $('#apb').value, showBday: $('#apsb').checked, ecName: $('#apen').value, ecPhone: $('#apep').value, ecRel: $('#aper').value }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save your profile'), true);
  ME = await r.json(); render(); toast('Profile saved');
}
async function chPw() {
  const p = $('#pn1').value, c = $('#pn2').value;
  if (!pwOk(p)) return toast('The new password does not meet the requirements', true);
  if (p !== c) return toast('The new passwords do not match', true);
  const r = await api('/api/password', { current: $('#pn0').value, next: p }); if (!r.ok) return toast(await errOf(r, 'Could not change the password'), true);
  ['#pn0', '#pn1', '#pn2'].forEach(s => { const i = $(s); if (i) i.value = ''; }); pwUpd(); toast('Password changed');
}
async function firstPw() {
  const p = $('#pn1').value, c = $('#pn2').value, e = $('#fpe');
  const msg = !pwOk(p) ? 'The new password does not meet the requirements' : p !== c ? 'The two passwords do not match' : '';
  if (msg) { e.innerHTML = `<small style="color:var(--bad)">${msg}</small>`; return; }
  const r = await api('/api/password/first', { next: p }); if (!r.ok) { e.innerHTML = `<small style="color:var(--bad)">${esc(await errOf(r, 'Could not change the password'))}</small>`; return; }
  ME = await r.json(); await load(); render(); toast('Password changed. Welcome!'); maybeWelcome();
}


// ---------- Activity Log (was "Audit log"): who changed what and when, from the real audit records (admins only)
let AUF = { q: '', u: '', ok: '' };
PG.audit = function () {
  const q = AUF.q.toLowerCase(), l = AUD.filter(x => (!AUF.u || x.u === AUF.u) && (AUF.ok === '' || String(x.ok) === AUF.ok) && (!q || (x.a + ' ' + x.d + ' ' + x.u + ' ' + x.n).toLowerCase().includes(q)));
  const users = [...new Set(AUD.map(x => x.u).filter(Boolean))].sort();
  return head('Activity Log', 'Every change and sign-in, newest first (last 1000 entries). Passwords are never recorded.', `<button class=ib onclick="load().then(render)">Refresh</button>`)
    + `<div class=row style="justify-content:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:14px"><input id=auq aria-label="Search the audit log" placeholder="Search action or detail" value="${esc(AUF.q)}" oninput="AUF.q=this.value;clearTimeout(window.__a);window.__a=setTimeout(render,250)" style="min-width:240px"><select onchange="AUF.u=this.value;render()"><option value="">All users</option>${users.map(u => `<option value="${esc(u)}" ${AUF.u === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select><select onchange="AUF.ok=this.value;render()"><option value="">All results</option><option value="true" ${AUF.ok === 'true' ? 'selected' : ''}>Succeeded</option><option value="false" ${AUF.ok === 'false' ? 'selected' : ''}>Failed sign-ins</option></select></div>`
    + card(`${l.length} entr${l.length === 1 ? 'y' : 'ies'}`, l.length ? tbl(['When', 'Who', 'Role', 'Action', 'Details'], l.slice(0, 300).map(x => [fdt(x.t), `<b>${esc(x.n || x.u || '—')}</b>${x.n ? ` <small class=mu>@${esc(x.u)}</small>` : ''}`, ROLE[x.r] || '—', x.ok ? esc(x.a) : `<span style="color:var(--bad)">${esc(x.a)}</span>`, `<small>${esc(x.d)}</small>`])) : '<p class=mu>Nothing recorded yet.</p>');
};
