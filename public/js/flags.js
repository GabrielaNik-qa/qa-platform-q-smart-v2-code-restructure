// ===================== Quick Flags (red / green flags on calls, kept apart from QA reviews) and Disputes =====================
let QF = [], QFM = null;                              // QF = all quick flags, QFM = the "New Quick Flag" pop-up
let XF = { c: '', q: '', t: '', a: '', p: 'month', f1: ds(-30), f2: ds(0), ff: 'all', pn: 1 };
let DS = { c: '', q: '', t: '', a: '', p: 'all', f1: ds(-30), f2: ds(0), s: '', pn: 1 };
const inPF = (d, o) => o.p === 'all' || (o.p === 'custom' ? d >= new Date(o.f1 + 'T00:00:00') && d <= new Date(o.f2 + 'T23:59:59') : (Date.now() - d) / 864e5 <= (o.p === 'week' ? 7 : 30));
const FLG = c => `<span class="fgv ${c}">${IC.flag}</span>`;

// ---- the filter card shared by both pages (search, team, agent, period); typing only redraws the numbers and the table
function fltCard(o, set, extra) {
  const tOpts = TEAMS.filter(t => !t.system && (!o.a || t.id === teamOf(o.a))), aOpts = AGENTS().filter(a => !o.t || a.team === o.t);
  return card('', `<div class=fl><label>Search<div class=sx><span>${IC.search}</span><input placeholder="Agent, lead ID, campaign…" value="${esc(o.q)}" oninput="${set}('q',this.value,1)"></div></label>`
    + (ME.role === 'agent' ? '' : `<label>Team<select onchange="${set}('t',this.value)"><option value="">All Teams</option>${tOpts.map(t => `<option value="${t.id}" ${t.id === o.t ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label><label>Agent<select onchange="${set}('a',this.value)"><option value="">All Agents</option>${aOpts.map(a => `<option value="${esc(a.username)}" ${a.username === o.a ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`)
    + `<label>Type${chSel(o.c, `${set}('c',this.value)`)}</label><label>Period<div class=sg>${[['week', 'Week'], ['month', 'Month'], ['all', 'All'], ['custom', 'Custom']].map(([k, n]) => `<button class="${o.p === k ? 'on' : ''}" onclick="${set}('p','${k}')">${n}</button>`).join('')}</div></label></div>`
    + (o.p === 'custom' ? `<div class=fcust><label>From <input type=date value="${o.f1}" onchange="${set}('f1',this.value)"></label><label>To <input type=date value="${o.f2}" onchange="${set}('f2',this.value)"></label></div>` : '') + extra);
}
const fSet = (o, k, v) => { o[k] = v; o.pn = 1; if (k === 't' && o.a && v && teamOf(o.a) !== v) o.a = ''; if (k === 'a' && v) o.t = teamOf(v); };
const kpiF = (t, v, c, ic, click, on) => `<div class="fk ${click ? 'clk' : ''} ${on ? 'on' : ''}" ${click ? `onclick="${click}"` : ''}><div class=row><span>${t}</span>${ic}</div><b style="color:${c}">${v}</b></div>`;
const pager = (n, o, set, size = 20) => { const pc = Math.max(1, Math.ceil(n / size)); if (o.pn > pc) o.pn = pc; const a = (o.pn - 1) * size; return [a, a + size, `<div class=agpg><small>${n ? `Showing ${a + 1} to ${Math.min(a + size, n)} of ${n}` : 'Nothing to show'}</small><div style="display:flex;gap:6px"><button class=pb ${o.pn <= 1 ? 'disabled' : ''} onclick="${set}('pn',${o.pn - 1},1)">Previous</button><button class=pb ${o.pn >= pc ? 'disabled' : ''} onclick="${set}('pn',${o.pn + 1},1)">Next</button></div></div>`]; };
const qSearch = () => `<div class=sx style="width:290px"><span>${IC.search}</span><input class=qi style="padding-right:64px" placeholder="Search lead ID, agent, campaign…" onkeydown='if(event.key=="Enter"){Q=this.value.trim();KQ=true;location.hash="calls"}'><kbd class=kb>Ctrl K</kbd></div>`;
const leadA = (txt, click) => `<a href="javascript:void(0)" class=mono style="color:var(--ac);font-weight:600;text-decoration:none" onclick="${click}">${esc(txt)}</a>`;
const agCell = (u, name) => `<span class=av>${esc(ini(name))}</span>${ME.role === 'agent' ? esc(name) : agLink(u, name)}`;

// ================================================================ QUICK FLAGS
// one row per call: every reviewed call, plus calls that only have a quick flag (matched on lead ID + agent)
function qfRows() {
  const m = new Map(), key = (l, a) => String(l).trim().toLowerCase() + '|' + a;
  EVA.forEach(e => m.set(key(e.id, e.agent), { lead: e.id, agent: e.agent, tm: e.tm, d: e.d, cp: cpn(e), ch: chOf(e), ev: e, qf: [] }));
  QF.forEach(f => { const k = key(f.lead, f.agent); let r = m.get(k); if (!r) { r = { lead: f.lead, agent: f.agent, tm: teamOf(f.agent) || f.tid, d: new Date(f.date + 'T12:00:00'), cp: f.date + ' ' + (f.cp || 'general'), ch: f.ch || 'call', ev: null, qf: [] }; m.set(k, r); } r.qf.push(f); });
  return [...m.values()].map(r => ({ ...r, red: (r.ev && r.ev.fl === 'red') || r.qf.some(f => f.type === 'red'), green: (r.ev && r.ev.fl === 'green') || r.qf.some(f => f.type === 'green') }));
}
const xfBase = () => { const q = XF.q.toLowerCase(); return qfRows().filter(r => (!XF.c || r.ch === XF.c) && (!XF.t || r.tm === XF.t) && (!XF.a || r.agent === XF.a) && inPF(r.d, XF) && (!q || (r.lead + ' ' + an(r.agent) + ' ' + r.cp + ' ' + r.qf.map(f => f.cm).join(' ')).toLowerCase().includes(q))).sort((a, b) => b.d - a.d); };
const XFF = { all: () => true, flagged: r => r.red || r.green, red: r => r.red, green: r => r.green, none: r => !r.red && !r.green };
const XL = () => xfBase().filter(XFF[XF.ff]);
const xfSet = (k, v, soft) => { fSet(XF, k, v); if (soft) xfRt(); else render(); };
const xfKpis = b => { const fl = b.filter(XFF.flagged); return `<div class=fkp>${kpiF('Total Flagged', fl.length, 'var(--tx)', `<span style="color:var(--mu)">${IC.flag}</span>`, "xfSet('ff','flagged')", XF.ff === 'flagged')}${kpiF('Red Flags', b.filter(r => r.red).length, 'var(--bad)', FLG('red'), "xfSet('ff','red')", XF.ff === 'red')}${kpiF('Green Flags', b.filter(r => r.green).length, 'var(--ok)', FLG('green'), "xfSet('ff','green')", XF.ff === 'green')}</div>`; };
const qfBadges = r => [...(r.ev && r.ev.fl ? [`<span class="qfb ${r.ev.fl}" title="Flag given in the QA review">${IC.flag} QA ${r.ev.fl === 'red' ? 'Red' : 'Green'}</span>`] : []), ...r.qf.map(f => `<span class="qfb ${f.type} clk" onclick="qfEdit('${f.id}')" title="${esc((f.cm || 'No comment') + ' — by ' + (f.byName || f.by) + ', ' + f.date)}">${IC.flag} ${f.type === 'red' ? 'Red' : 'Green'}</span>`)].join('') || '<span class=mu>—</span>';
// a score cell: the score, or "Not scored" when every question was N/A (decision 14)
const evSc = (e, tm) => e.ns ? `<small class=mu>${tr('Not scored')}</small>` : `<b class=mono style="color:${scol(e.sc, tm)}">${Math.round(e.sc)}%</b>`;
const qfPre = r => `{ch:'${r.ch}',agent:${jsq(r.agent)},lead:${jsq(r.lead)},date:'${iso(r.d)}',cp:${jsq(r.ev ? r.ev.cp : (r.qf[0] || {}).cp || '')}`;   // jsq: lead IDs and campaigns with ' \ or line breaks keep working
txReg('flags', { rows: () => XL(), count: () => XL().length, filters: () => [], clear: () => {}, cols: [
  { k: 'lead', t: 'LEAD ID', lock: true, td: r => r.ev ? leadA(r.lead, `om('view','${r.ev.rid}')`) : leadA(r.lead, `qfEdit('${r.qf[0].id}')`) },
  { k: 'ch', t: 'TYPE', td: r => chTag(r.ch, 1) }, { k: 'd', t: 'DATE', td: r => f(r.d) },
  { k: 'ag', t: 'AGENT', td: r => agCell(r.agent, an(r.agent) || r.agent) }, { k: 'tm', t: 'TEAM', td: r => teamLink(r.tm) },
  { k: 'cp', t: 'CAMPAIGN', td: r => esc(r.cp) }, { k: 'sc', t: 'QA SCORE', td: r => r.ev ? evSc(r.ev, r.tm) : '<small class=mu>no review</small>' },
  { k: 'qf', t: 'QUICK FLAGS', td: r => `<div class=qfbs>${qfBadges(r)}</div>` },
  { k: 'cm', t: 'COMMENTS', off: true, td: r => esc(r.qf.map(x => x.cm).filter(Boolean).join(' | ')) || '—' },
  { k: 'by', t: 'FLAGGED BY', off: true, td: r => esc([...new Set(r.qf.map(x => x.byName || x.by))].join(', ')) || '—' },
  { k: 'act', t: 'ACTIONS', lock: true, r: true, td: r => `<button class="ic qfr" title="Add a red flag" onclick="qfNew(${qfPre(r)},type:'red'})">${IC.flag}</button><button class="ic qfg" title="Add a green flag" onclick="qfNew(${qfPre(r)},type:'green'})">${IC.flag}</button><button class=ic title="View" onclick="${r.ev ? `om('view','${r.ev.rid}')` : `qfEdit('${r.qf[0].id}')`}">${IC.eye}</button>` }] });
function xfTable() {
  const l = XL(), [a, z, pg] = pager(l.length, XF, 'xfSet');
  return card(`${XF.c ? CHN[XF.c] + ' reviews' : 'Conversations'} <span class=bg>${l.length}</span>`, txBtns('flags') + txTbl('flags', l.slice(a, z)) + pg, 'ftbl');
}
const xfRt = () => { const k = $('#xfk'), t = $('#xft'), b = xfBase(); if (k) k.innerHTML = xfKpis(b); if (t) t.innerHTML = xfTable(); };
PG.flags = function () {
  const b = xfBase(), cnt = k => b.filter(XFF[k]).length;
  const ff = `<div style="margin-top:14px"><span class=fcap>Flag Filter</span><div class=sg style="display:inline-flex">${[['all', 'All Calls'], ['flagged', 'Flagged'], ['red', '<i class=dotk style="background:var(--bad)"></i>Red'], ['green', '<i class=dotk style="background:var(--ok)"></i>Green'], ['none', 'No Flags']].map(([k, n]) => `<button class="${XF.ff === k ? 'on' : ''}" onclick="xfSet('ff','${k}')">${n} <small class=mono>${cnt(k)}</small></button>`).join('')}</div></div>`;
  return head('Quick Flags', 'Flag calls, chats and emails independently from QA reviews — does not affect scores', `<div style="display:flex;gap:8px;flex-wrap:wrap">${qSearch()}${bellBtn()}<button class="ib ibx" onclick="xfExport()">${IC.dl} Export</button><button class="btn ibx" onclick="qfNew({type:'red'})">${IC.plus} New Flag</button></div>`)
    + `<div id=xfk>${xfKpis(b)}</div>` + fltCard(XF, 'xfSet', ff) + `<div id=xft>${xfTable()}</div>`;
};
async function xfExport() {
  const l = XL(); if (!l.length) return toast('Nothing to export', true);
  const rows = [['Lead ID', 'Type', 'Date', 'Agent', 'Team', 'Campaign', 'QA Score', 'QA flag', 'Quick flags', 'Comments', 'Flagged by'], ...l.map(r => [String(r.lead), CHN[r.ch], iso(r.d), an(r.agent) || r.agent, tn(r.tm), r.cp, r.ev ? r.ev.sc : '', r.ev && r.ev.fl ? r.ev.fl : '', r.qf.map(x => x.type).join(', '), r.qf.map(x => x.cm).filter(Boolean).join(' | '), [...new Set(r.qf.map(x => x.byName || x.by))].join(', ')])];
  const r = await api('/api/export/call-reviews', { rows, pf: 6, pt: 6, dc: 2, name: 'Quick Flags' }); if (!r.ok) return toast('Could not create the Excel file', true);   // dc: the Date column
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'Quick_Flags_' + iso(new Date()) + '.xlsx'; a.click();
}

// ---- the "New Quick Flag" pop-up
const qfNew = (o = {}) => { QFM = { ch: XF.c || 'call', type: 'red', team: o.agent ? teamOf(o.agent) : (XF.t || ''), agent: o.agent || XF.a || '', lead: o.lead || '', date: o.date || todayS(), cp: o.cp || '', lk: '', rl: '', cm: '', ...o }; render(); setTimeout(() => { const i = $(QFM.agent ? '#qfc' : '#qft'); if (i) i.focus(); }, 30); };
const qfEdit = id => { const x = QF.find(f => f.id === id); if (!x) return; QFM = { ...x, team: teamOf(x.agent) || x.tid }; render(); };
let QFBUSY = false;                                       // a double-click on Save must not add the flag twice
async function qfSave() {
  const d = QFM; if (!d || QFBUSY) return;
  if (!d.agent) return toast('Choose the team and the agent', true); if (!String(d.lead).trim()) return toast('Enter the lead ID', true);
  QFBUSY = true;
  let r; try { r = await api('/api/qflags' + (d.id ? '/' + d.id : ''), d, d.id ? 'PUT' : 'POST'); } finally { QFBUSY = false; }
  if (!r.ok) return toast(await errOf(r, 'Could not save the flag'), true);
  QFM = null; await load(); render(); toast(d.id ? 'Flag saved' : (d.type === 'red' ? 'Red' : 'Green') + ' flag added');
}
const qfDel = id => ask('Delete this flag?', 'The flag is removed. QA reviews and scores are not affected.', async () => { await api('/api/qflags/' + id, null, 'DELETE'); QFM = null; await load(); render(); toast('Flag deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const QFMM = () => { const d = QFM, red = d.type === 'red', tc = red ? 'var(--bad)' : 'var(--ok)', inp = (k, ph, t = 'text', id = '') => `<input ${id ? 'id=' + id : ''} type=${t} placeholder="${esc(ph)}" value="${esc(d[k] || '')}" oninput="QFM.${k}=this.value">`;
  return OVL(`<div class=mh><span class=qfic style="--c:${tc}">${IC.flag}</span><div><h2>${d.id ? 'Edit Quick Flag' : 'New Quick Flag'}</h2><small>Flag a call without a QA review — scores do not change</small></div>${X('QFM=null;render()')}</div><div class=mb><div class=form style="max-width:none">
<div><b class=flb>Flag Type</b><div class=qft><button class="${red ? 'on red' : ''}" onclick="QFM.type='red';render()">${IC.flag} Red Flag</button><button class="${red ? '' : 'on green'}" onclick="QFM.type='green';render()">${IC.flag} Green Flag</button></div></div>
<div><b class=flb>Conversation type</b><div class=chseg>${CHS.map(k => `<button type=button class="${(d.ch || 'call') === k ? 'on' : ''}" style="--c:${CHC[k]}" onclick="QFM.ch='${k}';render()">${IC['ch_' + k]} ${CHN[k]}</button>`).join('')}</div></div>
<div class=eg2><label>Team <i class=rq>*</i><select id=qft onchange="QFM.team=this.value;QFM.agent='';render()"><option value="">Select a team…</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${t.id}" ${t.id === d.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
<label>Agent <i class=rq>*</i><select ${d.team ? '' : 'disabled'} onchange="QFM.agent=this.value"><option value="">${d.team ? 'Select an agent…' : 'Select a team first'}</option>${AGENTS().filter(a => a.team === d.team).map(a => `<option value="${esc(a.username)}" ${a.username === d.agent ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
<label>Lead ID <i class=rq>*</i>${inp('lead', 'e.g. 123456')}</label><label>Date${inp('date', '', 'date')}</label></div>
<label>Campaign <span class=mu>(optional)</span>${inp('cp', 'e.g. Summer Reactivation')}</label>
<div class=eg2><label>CRM link <span class=mu>(optional)</span>${inp('lk', 'https://…')}</label><label>${(d.ch || 'call') === 'call' ? 'Recording link' : (d.ch === 'chat' ? 'Chat' : d.ch === 'email' ? 'Email' : 'Conversation') + ' link'} <span class=mu>(optional)</span>${inp('rl', 'https://…')}</label></div>
<label>Comment <span class=mu>(optional)</span><textarea id=qfc rows=3 placeholder="Reason for flagging this call…" oninput="QFM.cm=this.value">${esc(d.cm || '')}</textarea></label></div>
<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">${d.id ? `<button class="ib ibx" style="margin-right:auto;color:var(--bad)" onclick="qfDel('${d.id}')">${IC.bin} Delete</button><small class=mu>By ${esc(d.byName || d.by || '')}</small>` : ''}<button class=ib onclick="QFM=null;render()">Cancel</button><button class=btn style="background:${tc}" onclick="qfSave()">${d.id ? 'Save flag' : 'Create ' + (red ? 'Red' : 'Green') + ' Flag'}</button></div></div>`, 'QFM=null;render()', 560, 60); };

// ================================================================ DISPUTES
// Disputed = the agent disagreed and nobody answered yet · In progress = QA answered, the conversation is going · Resolved = closed
const dispStatus = e => { const d = e.dp; if (!d) return ''; if (d.status === 'resolved') return 'resolved'; return d.msgs.some(m => m.r !== 'agent' && !m.sys) ? 'progress' : 'disputed'; };
const DST = { disputed: ['Disputed', 'bad'], progress: ['In progress', 'ac'], resolved: ['Resolved', 'ok'] };
const dispPill = e => { const s = DST[dispStatus(e)]; return s ? pill(s[0], s[1]) : ''; };
const dsBase = () => { const q = DS.q.toLowerCase(); return EVA.filter(e => e.dp && (!DS.c || chOf(e) === DS.c) && (!DS.t || e.tm === DS.t) && (!DS.a || e.agent === DS.a) && inPF(new Date(e.dp.at), DS) && (!q || (e.id + ' ' + agn(e) + ' ' + cpn(e) + ' ' + e.dp.msgs.map(m => m.t).join(' ')).toLowerCase().includes(q))).sort((a, b) => new Date(b.dp.at) - new Date(a.dp.at)); };
const DL = () => dsBase().filter(e => !DS.s || dispStatus(e) === DS.s);
const dsSet = (k, v, soft) => { fSet(DS, k, v); if (soft) dsRt(); else render(); };
const dsKpis = b => { const c = k => b.filter(e => dispStatus(e) === k).length; return `<div class=fkp style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${kpiF('Total Disputes', b.length, 'var(--tx)', `<span style="color:var(--mu)">${IC.flag}</span>`, "dsSet('s','')", !DS.s)}${kpiF('Disputed', c('disputed'), 'var(--bad)', '<i class=dotk style="background:var(--bad)"></i>', "dsSet('s','disputed')", DS.s === 'disputed')}${kpiF('In Progress', c('progress'), 'var(--ac)', '<i class=dotk style="background:var(--ac)"></i>', "dsSet('s','progress')", DS.s === 'progress')}${kpiF('Resolved', c('resolved'), 'var(--ok)', '<i class=dotk style="background:var(--ok)"></i>', "dsSet('s','resolved')", DS.s === 'resolved')}</div>`; };
const DOUTP = r => r ? (r.outcome === 'kept' ? pill('Score kept', 'ac') : r.outcome === 'partly' ? pill('Partly changed', 'wn') : pill('Score changed', 'wn')) : '<span class=mu>—</span>';
const dsLast = e => e.dp.msgs.filter(x => !x.sys).slice(-1)[0] || {};
txReg('disputes', { rows: () => DL(), count: () => DL().length, filters: () => [], clear: () => {}, cols: [
  { k: 'lead', t: 'LEAD ID', lock: true, td: e => leadA(e.id, `om('view','${e.rid}')`) },
  { k: 'ch', t: 'TYPE', td: e => chTag(chOf(e), 1) }, { k: 'at', t: 'DISPUTED ON', td: e => f(new Date(e.dp.at)) },
  { k: 'ag', t: 'AGENT', td: e => agCell(e.agent, agn(e)) }, { k: 'tm', t: 'TEAM', td: e => teamLink(e.tm) },
  { k: 'sc', t: 'QA SCORE', td: e => evSc(e, e.tm) }, { k: 'st', t: 'STATUS', td: e => dispPill(e) },
  { k: 'msg', t: 'LAST MESSAGE', td: e => { const m = dsLast(e); return `<div class=dsm title="${esc(m.t || '')}" onclick="om('view','${e.rid}')"><small class=mu>${esc(m.n || '')}</small> ${esc(m.t || '')}</div>`; } },
  { k: 'out', t: 'OUTCOME', td: e => DOUTP(e.dp.res) },
  { k: 'rv', t: 'REVIEWER', off: true, td: e => esc(e.rv || '') },
  { k: 'res', t: 'RESOLVED ON', off: true, td: e => e.dp.res ? f(new Date(e.dp.res.at)) : '—' },
  { k: 'act', t: 'ACTIONS', lock: true, r: true, td: e => `<button class=ic title="Open the review and the conversation" onclick="om('view','${e.rid}')">${IC.eye}</button>` }] });
function dsTable() {
  const l = DL(), [a, z, pg] = pager(l.length, DS, 'dsSet');
  return card(`Disputed calls <span class=bg>${l.length}</span>`, txBtns('disputes') + txTbl('disputes', l.slice(a, z)) + pg, 'ftbl');
}
// ---- what the disputes say (ideas from the Zendesk QA disputes dashboard): how they end, how long they take, which categories are
// disputed, who disputes most and whose reviews are disputed most (the filters above apply)
const DOUT = { changed: ['Score changed', 'var(--ok)'], partly: ['Partly changed', 'var(--wn)'], kept: ['Score kept', 'var(--ac)'] };
function dsInsights(b) {
  const res = b.filter(e => e.dp.res), days = res.map(e => (new Date(e.dp.res.at) - new Date(e.dp.at)) / 864e5).filter(x => x >= 0), oc = k => res.filter(e => e.dp.res.outcome === k).length;
  const outs = Object.entries(DOUT).map(([k, [n, c]]) => ({ n, c, v: oc(k) })), mx = Math.max(1, ...outs.map(x => x.v));
  const cats = {}; b.forEach(e => (e.cs || []).filter(c => c.m && c.e < c.m).forEach(c => { const x = cats[c.n] = cats[c.n] || { n: c.n, t: 0, ch: 0, ke: 0 }; x.t++; if (e.dp.res) { if (e.dp.res.outcome === 'kept') x.ke++; else x.ch++; } }));
  const catRows = Object.values(cats).sort((x, y) => y.t - x.t).slice(0, 8);
  const per = (key, all) => { const m = {}; all.forEach(e => { const k = key(e); if (!k) return; const x = m[k] = m[k] || { k, rev: 0, seen: 0, d: 0, open: 0, ch: 0, pa: 0, ke: 0 }; x.rev++; if (e.seen) x.seen++; if (e.dp) { x.d++; const o = e.dp.res ? e.dp.res.outcome : 'open'; if (o === 'open') x.open++; else if (o === 'kept') x.ke++; else if (o === 'partly') x.pa++; else x.ch++; } }); return Object.values(m).filter(x => x.d).sort((x, y) => y.d - x.d).slice(0, 10); };
  const scope = EV.filter(e => (!DS.c || chOf(e) === DS.c) && (!DS.t || e.tm === DS.t) && (!DS.a || e.agent === DS.a));
  const cols = r => [r.rev, r.seen, `<b>${r.d}</b>`, r.open || '—', r.ch || '—', r.pa || '—', r.ke || '—'];
  const H = ['Reviews', 'Seen', 'Disputes', 'Open', 'Changed', 'Partly', 'Kept'];
  return `<div class="g g2">${card('How disputes end', `<div class=fkp style="grid-template-columns:repeat(2,minmax(0,1fr));margin:0 0 12px">${kpiS('Average time to resolve', days.length ? (avg(days) < 1 ? Math.round(avg(days) * 24) + ' h' : avg(days).toFixed(1) + ' ' + tr('days')) : '—', res.length + ' ' + tr('resolved'))}${kpiS('Agent was right', res.length ? Math.round((oc('changed') + oc('partly')) / res.length * 100) + '%' : '—', tr('changed or partly changed'))}</div>`
      + outs.map(x => `<div style="margin-top:8px"><div class=row><span>${tr(x.n)}</span><b class=mono>${x.v}</b></div>${bar(x.v / mx * 100, x.c)}</div>`).join(''))}`
    + `${card('Disputed categories', catRows.length ? tbl(['Category', 'Disputes', 'Score changed', 'Score kept'], catRows.map(x => [esc(x.n), `<b>${x.t}</b>`, x.ch || '—', x.ke || '—'])) : `<p class=mu style="margin:0">${tr('No disputed category in this period')}</p>`)}</div>`
    + `<div class="g g2">${card('Who disputes', (l => l.length ? tbl(['Agent', ...H], l.map(r => [agCell(r.k, an(r.k) || r.k), ...cols(r)])) : `<p class=mu style="margin:0">—</p>`)(per(e => e.agent, scope.filter(e => !e.dp || inPF(new Date(e.dp.at), DS)))))}`
    + `${card('Whose reviews are disputed', (l => l.length ? tbl(['Reviewer', ...H], l.map(r => [esc(an(r.k) || (scope.find(e => e.by === r.k) || {}).rv || r.k), ...cols(r)])) : `<p class=mu style="margin:0">—</p>`)(per(e => e.by, scope.filter(e => !e.dp || inPF(new Date(e.dp.at), DS)))))}</div>`;
}
const dsRt = () => { const k = $('#dsk'), t = $('#dst'); if (k) k.innerHTML = dsKpis(dsBase()); if (t) t.innerHTML = dsTable(); };
PG.disputes = function () {
  const b = dsBase(), sf = `<div style="margin-top:14px"><span class=fcap>Status</span><div class=sg style="display:inline-flex">${[['', 'All'], ['disputed', '<i class=dotk style="background:var(--bad)"></i>Disputed'], ['progress', '<i class=dotk style="background:var(--ac)"></i>In progress'], ['resolved', '<i class=dotk style="background:var(--ok)"></i>Resolved']].map(([k, n]) => `<button class="${DS.s === k ? 'on' : ''}" onclick="dsSet('s','${k}')">${n}</button>`).join('')}</div></div>`;
  return head('Disputes', ME.role === 'agent' ? 'The reviews you disputed and where they stand' : 'Every disputed call and where it stands', `<div style="display:flex;gap:8px;flex-wrap:wrap">${qSearch()}${bellBtn()}${staff() ? `<button class="ib ibx" onclick="xp(DL(),'Disputes')">${IC.dl} Export</button>` : ''}</div>`)
    + `<div id=dsk>${dsKpis(b)}</div>` + fltCard(DS, 'dsSet', sf) + `<div id=dst>${dsTable()}</div>` + (staff() ? dsInsights(b) : '');
};
