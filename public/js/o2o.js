// ===================== One-to-One: monthly conversations between a team lead and an agent =====================
// The list: who is still missing a one-to-one this month (against the target per person, set by an admin, per team if needed), how
// far every team lead is, and every one-to-one with its state (draft, waiting for the agent's signature, signed). The form follows a
// template of the agent's team (Form templates: sections of 8 types you add, rename, reorder and remove), shows the agent's numbers
// for the period and the objectives of the last one-to-one, and ends with the signatures: both on the lead's screen when the agent
// is there, or "Send to the agent" so they read and sign it from their own account. Older one-to-ones keep their simple view.
let O2TPL = [], OO = { view: 'list', per: 'month', team: '', agent: '', q: '', E: null, id: '', T: null, add: false };
const O2W = () => ['admin', 'lead', 'qa'].includes(ME.role);
const O2TYPES = { text: ['Free text', 'A large text area'], check: ['Checklist', 'Ticks, each with an optional note'], yesno: ['Yes / No', 'Items answered Yes, No or N.A.'], objectives: ['Objectives', 'Goals with deadlines (they can become tasks)'], rating: ['Rating', '1 to 5 stars, for the whole section or each item'], metrics: ['Numbers', 'Numbers with a label and a unit'], table: ['Table', 'Your own columns and rows'], agree: ['Agreement', 'Statements the agent agrees to by signing'] };
// the sections of a one-to-one without a template (also the start of a new template)
const O2DEF = () => [{ id: 'str', t: 'text', title: 'Strengths', items: [] }, { id: 'imp', t: 'text', title: 'Areas for improvement', items: [] }, { id: 'obj', t: 'objectives', title: 'Objectives for the next period', items: [] }, { id: 'plan', t: 'text', title: 'Action plan', items: [] }, { id: 'acm', t: 'text', title: 'Agent comments', items: [] }, { id: 'agr', t: 'agree', title: 'Agreement', items: ['I have read and understood everything we discussed.', 'I commit to the objectives and the action plan agreed in this one-to-one.'] }];
// the target: how many one-to-ones per person per month (one number, or a different one for a team)
const o2oTarget = team => { const o = SET.o2o || {}; return Math.max(1, (o.teams && o.teams[team] != null ? o.teams[team] : o.target) || 1); };
const o2oHeld = s => s.kind === 'o2o' && s.status !== 'planned';        // a draft does not count
const o2oState = s => s.state || (s.status === 'planned' ? 'draft' : s.agents.every(a => (s.signed || {})[a]) ? 'signed' : 'sent');
const O2ST = { draft: ['Draft', 'wn'], sent: ['Waiting for the agent', 'ac'], signed: ['Signed', 'ok'] };
const o2oTplOf = id => O2TPL.find(t => t.id === id);
const o2oSecs = s => s.secs || (o2oTplOf(s.tpl) || {}).sections || O2DEF();   // the sections as they were when it was written
const o2oPerTxt = s => s.per === 'custom' && s.pFrom ? `${s.pFrom} → ${s.pTo || '…'}` : ({ week: 'Week', month: 'Month', year: 'Year' })[s.per || 'month'] + ' · ' + s.date.slice(0, 7);

// ---- the list
PG.o2o = function () {
  if (OO.view === 'edit' && OO.E) return o2oEdit();
  if (OO.view === 'tpls' && O2W()) return o2oTpls();
  if (OO.view === 'read' && SESS.some(s => s.id === OO.id)) return o2oRead();
  OO.view = 'list';
  const ag = ME.role === 'agent', os = SESS.filter(s => s.kind === 'o2o');
  const tg = (SET.o2o || {}).target || 1, tgTxt = `<span class=pill title="${esc(tr('How many one-to-ones each person should have per month'))}">${tr(`Target: ${tg} per person per month`)}</span>`;
  const acts = ag ? '' : `${tgTxt}${ME.role === 'admin' ? `<button class=ic title="${esc(tr('Change the target'))}" aria-label="${esc(tr('Change the target'))}" onclick="o2oTargetForm()">${IC.gear}</button>` : ''}${O2W() ? `<button class="ib ibx" onclick="OO.view='tpls';OO.T=null;render()">${TIC.tpl} ${tr('Form templates')}</button><button class=btn onclick="o2oNew()">${IC.plus} ${tr('New one-to-one')}</button>` : ''}`;
  return head('One-to-One', ag ? 'Your one-to-one conversations with your team lead: read them and sign' : 'Monthly one-to-ones between team leads and agents: objectives, performance and growth', `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${bellBtn()}${acts}</div>`)
    + (ag ? '' : o2oMonth(os)) + o2oList(os);
};
// this month: who is below the target (click a name to write it) and how far every team lead is
function o2oMonth(os) {
  const m = todayS().slice(0, 7), ag = AGENTS().filter(a => !OO.team || a.team === OO.team), cnt = {};
  os.filter(s => o2oHeld(s) && s.date.slice(0, 7) === m).forEach(s => s.agents.forEach(a => { cnt[a] = (cnt[a] || 0) + 1; }));
  const miss = ag.filter(a => (cnt[a.username] || 0) < o2oTarget(a.team));
  const leads = ROSTER.filter(r => r.active && r.role === 'lead').map(l => { const tm = TEAMS.filter(t => t.lead === l.username), mine = AGENTS().filter(a => tm.some(t => t.id === a.team) && (!OO.team || a.team === OO.team));
    const need = mine.reduce((x, a) => x + o2oTarget(a.team), 0), got = mine.reduce((x, a) => x + Math.min(cnt[a.username] || 0, o2oTarget(a.team)), 0); return { l, tm, n: mine.length, need, got }; }).filter(x => x.n);
  return (miss.length ? `<section class="card o2om"><h3>${IC.flag} ${tr('Missing one-to-ones this month')} <span class=bg>${miss.length}</span></h3><div class=tkchips>${miss.map(a => { const t = o2oTarget(a.team); return `<button class=tkcp onclick="o2oNew('${esc(a.username)}')" title="${esc(tr('Write a one-to-one'))}">${esc(a.name)} <small>(${esc(tn(a.team))})${t > 1 ? ` · ${cnt[a.username] || 0}/${t}` : ''}</small></button>`; }).join('')}</div></section>` : card('', `<p style="margin:0;color:var(--ok)">✓ ${tr('Every agent reached the target this month.')}</p>`))
    + (leads.length ? card(tr(`Team lead completion rate — ${m}`), `<div class=tktg style="margin:0">${leads.map(x => { const p = x.got / x.need * 100; return `<div class=tkk><div class=row><b>${esc(x.l.name)}</b><small>${esc(x.tm.map(t => t.name).join(', '))}</small></div><b style="color:${tkSCol(p)}">${Math.round(p)}%</b>${bar(p, tkSCol(p))}<small>${x.got}/${x.need} ${tr('one-to-ones')} · ${x.n} ${tr('agents')}</small></div>`; }).join('')}</div>`) : '');
}
const o2oInPer = s => { const d = new Date(s.date + 'T12:00:00'), n = new Date(); if (OO.per === 'all') return true; if (OO.per === 'year') return d.getFullYear() === n.getFullYear(); if (OO.per === 'month') return s.date.slice(0, 7) === todayS().slice(0, 7); return (n - d) / 864e5 < 7; };
function o2oList(os) {
  const ag = ME.role === 'agent', q = OO.q.toLowerCase();
  const l = os.filter(s => o2oInPer(s) && (!OO.team || s.agents.some(a => teamOf(a) === OO.team)) && (!OO.agent || s.agents.includes(OO.agent)) && (!q || (s.title + ' ' + (s.byName || '') + ' ' + s.agents.map(an).join(' ')).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date) || String(b.created).localeCompare(String(a.created)));
  const people = AGENTS().filter(a => !OO.team || a.team === OO.team);
  const filt = `<div class=row style="justify-content:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:12px"><div class=sg>${[['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All time']].map(([k, n]) => `<button class="${OO.per === k ? 'on' : ''}" onclick="OO.per='${k}';render()">${tr(n)}</button>`).join('')}</div>`
    + (ag ? '' : `<select style="width:auto" aria-label="${esc(tr('Team'))}" onchange="OO.team=this.value;OO.agent='';render()"><option value="">${tr('All teams')}</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${esc(t.id)}" ${OO.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><select style="width:auto" aria-label="${esc(tr('Agent'))}" onchange="OO.agent=this.value;render()"><option value="">${tr('All agents')}</option>${people.map(a => `<option value="${esc(a.username)}" ${OO.agent === a.username ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`)
    + `<div class=sx style="width:240px"><span>${IC.search}</span><input placeholder="${esc(tr('Search…'))}" value="${esc(OO.q)}" oninput="OO.q=this.value;clearTimeout(o2oList.t);o2oList.t=setTimeout(render,250)"></div></div>`;
  const row = s => { const st = O2ST[o2oState(s)], t = o2oTplOf(s.tpl), w = O2W() && !ag;
    return `<div class="o2r clk" onclick="o2oOpen('${s.id}')"><span class=av>${esc(ini(an(s.agents[0]) || s.agents[0]))}</span><div style="flex:1;min-width:0"><b>${esc(s.agents.map(an).join(', '))}</b> <small class=mu>— ${esc(s.agents.map(a => tn(teamOf(a))).filter((x, i, A) => A.indexOf(x) === i).join(', '))}</small><br><small class=mu>${tr('Team lead')}: ${esc(s.byName || '—')} · ${s.date} · ${esc(o2oPerTxt(s))}</small></div>${t ? `<span class=pill>${esc(t.name)}</span>` : ''}${pill(st[0], st[1])}${w ? `<span class=tkac onclick="event.stopPropagation()"><button class=ic title="${esc(tr('Edit'))}" aria-label="${esc(tr('Edit'))}" onclick="o2oEditOpen('${s.id}')">${IC.pen}</button><button class=ic title="${esc(tr('Delete'))}" aria-label="${esc(tr('Delete'))}" onclick="delSession('${s.id}')">${IC.bin}</button></span>` : ''}</div>`; };
  return card(`${l.length} ${tr(l.length === 1 ? 'one-to-one' : 'one-to-ones')}`, filt + (l.map(row).join('') || `<p class=mu style="margin:0">${tr('No one-to-ones in this period.')}</p>`));
}
const o2oOpen = id => { const s = SESS.find(x => x.id === id); if (!s.ans && !s.tpl) return viewSession(id); if (o2oState(s) === 'draft' && O2W()) return o2oEditOpen(id); OO.view = 'read'; OO.id = id; render(); window.scrollTo(0, 0); };
// the target: one number for everybody, and a different one for chosen teams (empty = the same as everybody)
const o2oTargetForm = () => { const o = SET.o2o || {}, ts = TEAMS.filter(t => !t.system);
  openForm({ title: 'One-to-one target', w: 520, yes: 'Save', d: { target: o.target || 1, ...Object.fromEntries(ts.map(t => ['t_' + t.id, o.teams && o.teams[t.id] != null ? String(o.teams[t.id]) : ''])) },
    fields: [{ k: 'target', l: 'One-to-ones per person per month', t: 'number', req: 1 }, { t: 'h', l: 'A different number for a team (leave empty to use the number above)' }, ...ts.map(t => ({ k: 't_' + t.id, l: t.name, t: 'number' }))],
    save: async d => { const teams = {}; ts.forEach(t => { if (d['t_' + t.id] !== '' && d['t_' + t.id] != null) teams[t.id] = d['t_' + t.id]; }); const r = await api('/api/o2o-target', { target: d.target, teams }, 'PUT'); if (!r.ok) return errOf(r, 'Could not save'); SET = await r.json(); render(); toast('Target saved'); } }); };

// ---- the form
const o2oTplFor = team => O2TPL.find(t => (t.teams || []).includes(team));
function o2oNew(agent) {
  const team = agent ? teamOf(agent) : (OO.team || ''), t = o2oTplFor(team);
  OO.E = { kind: 'o2o', date: todayS(), title: '', team, agents: agent ? [agent] : [], tpl: t ? t.id : '', per: 'month', pFrom: '', pTo: '', ans: {}, follow: '', inPerson: false, makeTasks: false, focus: [], topics: [], notes: '', goals: '', actions: [] };
  OO.id = ''; OO.view = 'edit'; render(); window.scrollTo(0, 0);
}
const o2oEditOpen = id => { const s = JSON.parse(JSON.stringify(SESS.find(x => x.id === id))); if (!s.ans && !s.tpl) return editSession(id);
  OO.E = { ...s, team: teamOf(s.agents[0]) || '', inPerson: false, makeTasks: false }; OO.id = id; OO.view = 'edit'; render(); window.scrollTo(0, 0); };
const o2oSet = (k, v, re) => { OO.E[k] = v; if (re) render(); };
const o2oAns = (sid, v, re) => { OO.E.ans[sid] = v; if (re) render(); };
const o2oAnsK = (sid, k, v, re) => { const a = OO.E.ans[sid] = OO.E.ans[sid] && typeof OO.E.ans[sid] === 'object' && !Array.isArray(OO.E.ans[sid]) ? OO.E.ans[sid] : {}; a[k] = v; if (re) render(); };
// the agent's numbers for the period of the one-to-one, and what was agreed last time
function o2oSnap(E) {
  const u = E.agents[0]; if (!u) return '';
  const now = new Date(E.date + 'T12:00:00'), from = E.per === 'custom' && E.pFrom ? new Date(E.pFrom + 'T00:00:00') : E.per === 'week' ? new Date(now - 7 * 864e5) : E.per === 'year' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = E.per === 'custom' && E.pTo ? new Date(E.pTo + 'T23:59:59') : new Date(now.getTime() + 864e5), l = EV.filter(e => e.agent === u && e.d >= from && e.d < to), a = l.length ? avg(l.map(e => e.sc)) : null;
  const cats = CATS(l).map(c => ({ c, v: avg(l.map(e => cpv(e, c)).filter(x => x != null)) })).sort((x, y) => x.v - y.v).slice(0, 3);
  const last = SESS.filter(s => s.kind === 'o2o' && s.id !== OO.id && s.agents.includes(u) && o2oHeld(s)).sort((x, y) => y.date.localeCompare(x.date))[0];
  const tiles = [['Reviews', l.length], ['Average score', a == null ? '—' : a.toFixed(1) + '%'], ['Passed', l.length ? Math.round(l.filter(isPass).length / l.length * 100) + '%' : '—'], ['Open tasks', TASKS.filter(t => t.assignee === u && t.status !== 'done' && !t.archived).length]];
  return card(`${IC.star} ${tr('Performance in this period')} <small class=mu style="font-weight:400">${esc(an(u))}</small>`, `<div class=o2k>${tiles.map(([n, v]) => `<div><small>${tr(n)}</small><b>${v}</b></div>`).join('')}</div>`
    + (cats.length ? `<div style="margin-top:10px"><small class=mu>${tr('Weakest categories')}</small>${cats.map(x => `<div style="margin-top:6px"><div class=row><span>${esc(x.c)}</span><b class=mono>${x.v.toFixed(0)}%</b></div>${bar(x.v, col(x.v))}</div>`).join('')}</div>` : `<p class=mu style="margin:8px 0 0">${tr('No reviews in this period.')}</p>`)
    + (last && (last.actions || []).length ? `<div style="margin-top:12px"><small class=mu>${tr(`Objectives from the last one-to-one (${last.date})`)}</small>${last.actions.map(x => `<div class=row style="font-size:13px;padding:3px 0;justify-content:flex-start;gap:8px"><span style="color:${x.done ? 'var(--ok)' : 'var(--mu)'}">${x.done ? IC.check : IC.box}</span><span>${esc(x.t)}</span>${x.due ? `<small class=mu>${x.due}</small>` : ''}</div>`).join('')}</div>` : ''));
}
// one section of the form; ro = read only (the agent's view, or a signed one-to-one)
function o2oSec(x, ans, ro, n) {
  const v = ans[x.id], dis = ro ? 'disabled' : '', items = x.items || [];
  let body = '';
  if (x.t === 'text') body = ro ? `<p style="margin:0;white-space:pre-wrap">${esc(v || '—')}</p>` : `<textarea rows=3 oninput="o2oAns('${x.id}',this.value)">${esc(v || '')}</textarea>`;
  else if (x.t === 'check') body = items.map((it, i) => { const c = (v || {})[i] || {}; return `<div class=o2i><label class=rad><input type=checkbox ${c.c ? 'checked' : ''} ${dis} onchange="o2oAnsK('${x.id}',${i},{...(OO.E.ans['${x.id}']||{})[${i}],c:this.checked})"> <span>${esc(it)}</span></label>${ro ? (c.n ? `<small class=mu>${esc(c.n)}</small>` : '') : `<input placeholder="${esc(tr('Note (optional)'))}" value="${esc(c.n || '')}" oninput="o2oAnsK('${x.id}',${i},{...(OO.E.ans['${x.id}']||{})[${i}],n:this.value})">`}</div>`; }).join('');
  else if (x.t === 'yesno') body = items.map((it, i) => { const c = (v || {})[i] || ''; return `<div class="o2i row"><span>${esc(it)}</span><div class=sg role=group>${[['y', 'Yes'], ['n', 'No'], ['na', 'N.A.']].map(([k, l]) => `<button class="${c === k ? 'on' : ''}" ${dis} aria-pressed="${c === k}" onclick="o2oAnsK('${x.id}',${i},'${k}',1)">${tr(l)}</button>`).join('')}</div></div>`; }).join('');
  else if (x.t === 'objectives') { const l = Array.isArray(v) ? v : [];
    body = ro ? (l.map((o, i) => `<div class="o2i row"><span>${i + 1}. ${esc(o.t)}</span><small class=mu>${o.due || ''}</small></div>`).join('') || '<p class=mu style="margin:0">—</p>')
      : l.map((o, i) => `<div class="o2i row" style="gap:8px"><b class=mono>${i + 1}.</b><input style="flex:1" placeholder="${esc(tr('What should be reached'))}" value="${esc(o.t || '')}" oninput="OO.E.ans['${x.id}'][${i}].t=this.value"><input type=date style="width:auto" value="${o.due || ''}" onchange="OO.E.ans['${x.id}'][${i}].due=this.value"><button class=ic aria-label="${esc(tr('Remove'))}" onclick="OO.E.ans['${x.id}'].splice(${i},1);render()">${IC.x}</button></div>`).join('')
        + `<button class="ib ibx" style="margin-top:6px" onclick="(OO.E.ans['${x.id}']=Array.isArray(OO.E.ans['${x.id}'])?OO.E.ans['${x.id}']:[]).push({t:'',due:''});render()">${IC.plus} ${tr('Add an objective')}</button>`; }
  else if (x.t === 'rating') {
    body = items.length ? items.map((it, i) => `<div class="o2i row"><span>${esc(it)}</span><span>${[1, 2, 3, 4, 5].map(s => `<button class="o2s ${((v || {})[i] || 0) >= s ? 'on' : ''}" ${dis} aria-label="${s}" onclick="o2oAnsK('${x.id}',${i},${s},1)">★</button>`).join('')}</span></div>`).join('')
      : `<div class=o2i style="display:flex;gap:2px">${[1, 2, 3, 4, 5].map(s => `<button class="o2s ${(+v || 0) >= s ? 'on' : ''}" ${dis} aria-label="${s}" onclick="o2oAns('${x.id}',${s},1)">★</button>`).join('')}</div>`; }
  else if (x.t === 'metrics') body = `<div class=o2k>${items.map((it, i) => `<div><small>${esc(it)}</small>${ro ? `<b>${(v || {})[i] ?? '—'} ${esc((x.units || [])[i] || '')}</b>` : `<span class=row style="gap:6px"><input type=number style="width:100%" value="${(v || {})[i] ?? ''}" oninput="o2oAnsK('${x.id}',${i},this.value===''?null:+this.value)"><small>${esc((x.units || [])[i] || '')}</small></span>`}</div>`).join('')}</div>`;
  else if (x.t === 'table') { const cols = x.cols && x.cols.length ? x.cols : ['Value'];
    body = `<div class=sc><table class=ct><tr><th></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${items.map((r, i) => `<tr><td><b>${esc(r)}</b></td>${cols.map((c, j) => `<td>${ro ? esc((v || {})[i + '_' + j] || '') : `<input value="${esc((v || {})[i + '_' + j] || '')}" oninput="o2oAnsK('${x.id}','${i}_${j}',this.value)">`}</td>`).join('')}</tr>`).join('')}</table></div>`; }
  else if (x.t === 'agree') body = `<ul style="margin:0;padding-left:20px">${items.map(it => `<li>${esc(it)}</li>`).join('')}</ul><small class=mu>${tr('The agent agrees to these by signing.')}</small>`;
  return `<section class="card o2sec"><h3><span class=o2n>${n}</span>${esc(tr(x.title))} <small class=mu style="font-weight:400">${tr(O2TYPES[x.t][0])}</small></h3>${body}</section>`;
}
function o2oEdit() {
  const E = OO.E, tpl = o2oTplOf(E.tpl), secs = tpl ? tpl.sections : O2DEF(), ag = AGENTS().filter(a => !E.team || a.team === E.team), signed = E.state === 'signed' && OO.id;
  const sel = (lab, k, opts, re) => `<label>${tr(lab)}<select onchange="o2oSet('${k}',this.value,${re ? 1 : 0})">${opts.map(([a, b]) => `<option value="${esc(a)}" ${String(E[k] || '') === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
  const det = `<section class="card o2d"><h3>${tr('Session details')}</h3><div class=o2g>`
    + `<label>${tr('Team')}<select onchange="OO.E.team=this.value;OO.E.agents=[];const t=o2oTplFor(this.value);if(t)OO.E.tpl=t.id;render()"><option value="">${tr('All teams')}</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${esc(t.id)}" ${E.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`
    + sel('Template', 'tpl', [['', tr('No template (the standard sections)')], ...O2TPL.map(t => [t.id, t.name + ((t.teams || []).includes(E.team) ? ' ★' : '')])], 1)
    + `<label>${tr('Agent')}<select onchange="OO.E.agents=this.value?[this.value]:[];if(!OO.E.team){OO.E.team=teamOf(this.value);const t=o2oTplFor(OO.E.team);if(t&&!OO.E.tpl)OO.E.tpl=t.id;}render()"><option value="">${tr('Choose the agent…')}</option>${ag.map(a => `<option value="${esc(a.username)}" ${E.agents[0] === a.username ? 'selected' : ''}>${esc(a.name)} · ${esc(tn(a.team))}</option>`).join('')}</select></label>`
    + `<label>${tr('Date')}<input type=date value="${E.date}" onchange="o2oSet('date',this.value,1)"></label>`
    + `<div><b style="font-size:12.5px">${tr('Period')}</b><div class=sg style="margin-top:6px">${[['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']].map(([k, n]) => `<button class="${(E.per || 'month') === k ? 'on' : ''}" onclick="o2oSet('per','${k}',1)">${tr(n)}</button>`).join('')}</div></div>`
    + (E.per === 'custom' ? `<label>${tr('From')}<input type=date value="${E.pFrom || ''}" onchange="o2oSet('pFrom',this.value,1)"></label><label>${tr('To')}<input type=date value="${E.pTo || ''}" onchange="o2oSet('pTo',this.value,1)"></label>` : '')
    + `</div></section>`;
  const sig = `<section class="card o2sec"><h3>${tr('Signatures')}</h3><div class=o2sig><div><small>${tr('Team lead')}</small><b>${esc(E.tl ? E.tl.name : ME.name)}</b><small class=mu>${E.tl ? '✍ ' + fdt(E.tl.at) : tr('Signs when you send or complete it')}</small></div><div><small>${tr('Agent')}</small><b>${esc(an(E.agents[0]) || '—')}</b>${(E.signed || {})[E.agents[0]] ? `<small class=mu>✍ ${fdt(E.signed[E.agents[0]].at)}</small>` : `<label class=rad><input type=checkbox ${E.inPerson ? 'checked' : ''} onchange="o2oSet('inPerson',this.checked,1)"> <span>${tr('The agent is here and signs now')}</span></label>`}</div></div>`
    + `<small class=mu>${tr('In the office: tick "The agent is here" and press Complete. Working from home: press Send to the agent; they read it and sign from their own account.')}</small>`
    + `<label class=rad style="margin-top:8px"><input type=checkbox ${E.makeTasks ? 'checked' : ''} onchange="o2oSet('makeTasks',this.checked)"> <span>${tr('Also give each objective to the agent as a task (with its deadline)')}</span></label>`
    + `<label style="margin-top:8px">${tr('Next one-to-one (optional)')}<input type=date style="max-width:220px" value="${E.follow || ''}" onchange="o2oSet('follow',this.value)"></label></section>`;
  const bar2 = `<section class="card o2bar"><button class=ib onclick="OO.view='list';OO.E=null;render()">${IC.back} ${tr('Back to the list')}</button>${tpl ? `<span class=pill>${esc(tpl.name)}</span>` : ''}<span style="flex:1"></span>${signed ? '' : `<button class=ib onclick="o2oSave('draft')">${tr('Save draft')}</button><button class=btn style="background:#6d5bd0" onclick="o2oSave('sent')">${tr('Send to the agent')}</button>`}<button class=btn onclick="o2oSave('signed')">${IC.check} ${tr(signed ? 'Save' : 'Complete and save')}</button></section>`;
  return head(OO.id ? 'Edit one-to-one' : 'New one-to-one', 'A conversation between a team lead and an agent: what went well, what to improve, and what you agree for the next period', bellBtn())
    + bar2 + `<div class=o2w><div>${det}${secs.map((x, i) => o2oSec(x, E.ans || {}, false, i + 1)).join('')}${sig}</div><div>${o2oSnap(E) || card(tr('Performance in this period'), `<p class=mu style="margin:0">${tr('Choose the agent to see their numbers and the objectives of their last one-to-one.')}</p>`)}</div></div>`;
}
async function o2oSave(state) {
  const E = OO.E; if (!E.agents.length) return toast('Choose the agent', true);
  if (state === 'signed' && !E.inPerson && !(E.signed || {})[E.agents[0]]) return toast('Tick "The agent is here and signs now", or send it to the agent', true);
  const tpl = o2oTplOf(E.tpl), secs = tpl ? tpl.sections : O2DEF();
  const actions = secs.filter(x => x.t === 'objectives').flatMap(x => (Array.isArray(E.ans[x.id]) ? E.ans[x.id] : []).filter(o => (o.t || '').trim()).map(o => ({ t: o.t.trim(), owner: E.agents[0], due: o.due || '', done: !!o.done, taskId: o.taskId || '' })));
  const old = OO.id ? (SESS.find(s => s.id === OO.id) || {}).actions || [] : [];
  actions.forEach(a => { const p = old.find(o => o.t === a.t); if (p) { a.done = p.done; a.taskId = p.taskId || ''; } });
  const body = { ...E, secs, title: tpl ? tpl.name : 'One-to-one', state: E.state === 'signed' ? 'signed' : state, status: state === 'draft' && E.state !== 'signed' ? 'planned' : 'done', actions, notes: E.ans.str || E.notes || '', goals: E.ans.plan || E.goals || '' };
  const r = await api(OO.id ? '/api/sessions/' + OO.id : '/api/sessions', body, OO.id ? 'PUT' : 'POST'); if (!r.ok) return toast(await errOf(r, 'Could not save the one-to-one'), true);
  OO.view = 'list'; OO.E = null; await load(); render(); window.scrollTo(0, 0);
  toast(state === 'draft' ? 'Draft saved' : state === 'sent' ? 'Sent to the agent to read and sign' : 'One-to-one completed and signed');
}
// ---- reading a one-to-one (the agent reads and signs it here)
function o2oRead() {
  const s = SESS.find(x => x.id === OO.id), secs = o2oSecs(s), me = s.agents.includes(ME.username), st = O2ST[o2oState(s)], g = (s.signed || {})[ME.username];
  const sig = `<section class="card o2sec"><h3>${tr('Signatures')} ${pill(st[0], st[1])}</h3><div class=o2sig><div><small>${tr('Team lead')}</small><b>${esc(s.tl ? s.tl.name : s.byName || '—')}</b><small class=mu>${s.tl ? '✍ ' + fdt(s.tl.at) : ''}</small></div>${s.agents.map(a => { const x = (s.signed || {})[a]; return `<div><small>${tr('Agent')}</small><b>${esc(an(a))}</b><small class=mu>${x ? '✍ ' + fdt(x.at) + (x.inPerson ? ' · ' + tr('in person') : '') : tr('not signed yet')}</small>${x && x.cm ? `<small>“${esc(x.cm)}”</small>` : ''}</div>`; }).join('')}</div>`
    + (me && !g && s.status !== 'planned' ? `<textarea id=sgc rows=2 placeholder="${esc(tr('Your comment (optional)'))}" style="margin-top:10px"></textarea><button class=btn style="margin-top:8px" onclick="signSess('${s.id}')">✍ ${tr('I have read it and I agree — sign')}</button>` : '') + `</section>`;
  return head(s.title || 'One-to-one', `${s.agents.map(an).join(', ')} · ${s.date} · ${o2oPerTxt(s)}`, bellBtn())
    + `<section class="card o2bar"><button class=ib onclick="OO.view='list';render()">${IC.back} ${tr('Back to the list')}</button><span style="flex:1"></span>${O2W() && ME.role !== 'agent' ? `<button class=ib onclick="o2oEditOpen('${s.id}')">${IC.pen} ${tr('Edit')}</button>` : ''}</section>`
    + secs.map((x, i) => o2oSec(x, s.ans || {}, true, i + 1)).join('') + sig;
}

// ---- Form templates: name, the teams that use it, and its sections (add, rename, reorder, remove; 8 types)
function o2oTpls() {
  if (!OO.T) { const f = O2TPL[0]; OO.T = f ? JSON.parse(JSON.stringify(f)) : { id: '', name: '', teams: [], sections: O2DEF() }; }
  const T = OO.T, other = id => O2TPL.filter(t => t.id !== T.id && (t.teams || []).includes(id)).map(t => t.name);
  const list = `<section class="card o2tl"><div class=row><b>${tr('Templates')}</b><small class=mu>${O2TPL.length}</small></div>${O2TPL.map(t => `<button class="o2tc ${T.id === t.id ? 'on' : ''}" onclick="OO.T=JSON.parse(JSON.stringify(o2oTplOf('${t.id}')));OO.add=false;render()"><b>${esc(t.name)}</b><small class=mu>${esc((t.teams || []).map(tn).join(', ') || tr('No team'))} · ${t.sections.length} ${tr('sections')}</small></button>`).join('')}<button class="o2tc o2new" onclick="OO.T={id:'',name:'',teams:[],sections:O2DEF()};OO.add=false;render()">${IC.plus} ${tr('New template')}</button></section>`;
  const secRow = (x, i) => `<div class=o2sr><div class=row style="gap:6px"><span class=o2n>${i + 1}</span><input style="flex:1" value="${esc(x.title)}" aria-label="${esc(tr('Section name'))}" oninput="OO.T.sections[${i}].title=this.value"><span class=pill>${tr(O2TYPES[x.t][0])}</span><button class=ic title="${esc(tr('Move up'))}" aria-label="${esc(tr('Move up'))}" ${i ? '' : 'disabled'} onclick="o2oMv(${i},-1)">${IC.up}</button><button class=ic title="${esc(tr('Move down'))}" aria-label="${esc(tr('Move down'))}" ${i < T.sections.length - 1 ? '' : 'disabled'} onclick="o2oMv(${i},1)" style="transform:rotate(180deg)">${IC.up}</button><button class=ic title="${esc(tr('Remove'))}" aria-label="${esc(tr('Remove'))}" onclick="OO.T.sections.splice(${i},1);render()">${IC.bin}</button></div>`
    + (['check', 'yesno', 'rating', 'metrics', 'table', 'agree'].includes(x.t) ? `<label style="margin-top:6px">${tr(x.t === 'table' ? 'Rows (one per line)' : x.t === 'metrics' ? 'Numbers, one per line: "label | unit"' : x.t === 'rating' ? 'Items to rate, one per line (empty = one rating)' : 'Items, one per line')}<textarea rows=3 oninput="o2oItems(${i},this.value)">${esc(x.t === 'metrics' ? x.items.map((it, j) => it + ((x.units || [])[j] ? ' | ' + x.units[j] : '')).join('\n') : x.items.join('\n'))}</textarea></label>` : '')
    + (x.t === 'table' ? `<label>${tr('Columns (separate with commas)')}<input value="${esc((x.cols || []).join(', '))}" oninput="OO.T.sections[${i}].cols=this.value.split(',').map(s=>s.trim()).filter(Boolean)"></label>` : '') + `</div>`;
  const add = OO.add ? `<div class=o2ty>${Object.entries(O2TYPES).map(([k, [n, d]]) => `<button onclick="OO.T.sections.push({id:'x'+Math.random().toString(36).slice(2,6),t:'${k}',title:${jsq(tr(n))},items:[],cols:[],units:[]});OO.add=false;render()"><b>${tr(n)}</b><small class=mu>${tr(d)}</small></button>`).join('')}<button onclick="OO.add=false;render()"><b>${tr('Cancel')}</b></button></div>` : `<button class="ib ibx" onclick="OO.add=true;render()">${IC.plus} ${tr('Add a section')}</button>`;
  const ed = `<section class="card o2te"><div class=row style="gap:8px"><label style="flex:1">${tr('Template name')}<input value="${esc(T.name)}" placeholder="${esc(tr('Monthly one-to-one'))}" oninput="OO.T.name=this.value"></label><button class=btn onclick="o2oTplSave()">${tr('Save')}</button>${T.id ? `<button class=ic title="${esc(tr('Delete'))}" aria-label="${esc(tr('Delete'))}" onclick="o2oTplDel('${T.id}')">${IC.bin}</button>` : ''}</div>`
    + `<div style="margin-top:12px"><b style="font-size:12.5px">${tr('Teams that use it')}</b><div class=tkchips style="margin-top:6px">${TEAMS.filter(t => !t.system).map(t => `<button class="tkcp ${(T.teams || []).includes(t.id) ? 'on' : ''}" onclick="o2oTeam('${esc(t.id)}')">${esc(t.name)}${other(t.id).length ? ` <small>(${esc(other(t.id).join(', '))})</small>` : ''}</button>`).join('')}</div><small class=mu>${tr("A new one-to-one starts with its team's template; you can still choose another one.")}</small></div>`
    + `<div class=row style="margin:14px 0 6px"><b>${tr('Sections')}</b><small class=mu>${T.sections.length}</small></div>${T.sections.map(secRow).join('')}${add}</section>`;
  return head('One-to-one form templates', 'Make the form your team leads fill in: add, rename, reorder and remove sections, and choose the teams that use it', bellBtn())
    + `<section class="card o2bar"><button class=ib onclick="OO.view='list';OO.T=null;render()">${IC.back} ${tr('Back to the list')}</button></section><div class=o2tw>${list}${ed}</div>`;
}
const o2oMv = (i, d) => { const s = OO.T.sections, j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; render(); };
const o2oTeam = id => { const t = OO.T.teams = OO.T.teams || []; const i = t.indexOf(id); if (i < 0) t.push(id); else t.splice(i, 1); render(); };
const o2oItems = (i, v) => { const x = OO.T.sections[i], l = v.split('\n').map(s => s.trim()).filter(Boolean); if (x.t === 'metrics') { x.items = l.map(s => s.split('|')[0].trim()); x.units = l.map(s => (s.split('|')[1] || '').trim()); } else x.items = l; };
async function o2oTplSave() { const T = OO.T; if (!T.name.trim()) return toast('Give the template a name', true);
  const r = await api('/api/o2o-templates' + (T.id ? '/' + T.id : ''), T, T.id ? 'PUT' : 'POST'); if (!r.ok) return toast(await errOf(r, 'Could not save the template'), true);
  const j = await r.json(); await load(); OO.T = JSON.parse(JSON.stringify(j)); render(); toast('Template saved'); }
const o2oTplDel = id => ask('Delete this template?', 'One-to-ones already written with it keep their answers.', async () => { await api('/api/o2o-templates/' + id, null, 'DELETE'); OO.T = null; await load(); render(); toast('Template deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
