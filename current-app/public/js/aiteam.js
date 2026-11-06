// ===================== AI team: the AI QA reviewer (AutoQA › "AI reviewer", admins and QA) =====================
// The AI reviews a conversation on your real scorecard (Yes / No / N/A per item, a comment for every No, a comment for the agent)
// and leaves it as a draft. A person checks it: changes any answer, then approves (it becomes a normal review, the agent is told)
// or rejects it. Every approved draft records how much the person agreed with the AI: that is the similarity rate.
let AQTAB = LS.get('qa_aqtab', 'auto'), AIDV = null, AINEW = false;   // AIDV = the draft being checked; AINEW = the "New AI review" form is open
const aiRev = () => ['admin', 'qa'].includes(ME.role);
const aqTab = t => { AQTAB = t; LS.set('qa_aqtab', t); render(); };
const aiMonth = d => String(d.decided || d.at || '').slice(0, 7) === todayS().slice(0, 7);
// similarity: the share of items where the person kept the AI's answer (approved drafts), overall and per category
function aiSim(list) {
  const ok = list.filter(d => d.status === 'approved' && d.sim && d.sim.items != null), cats = {};
  ok.forEach(d => { const sc = SCS.find(s => s.id === d.scid); (d.sim.cats || []).forEach((v, i) => { const n = sc && sc.cats[i] ? sc.cats[i].n : '#' + (i + 1); if (v != null) (cats[n] = cats[n] || []).push(v); }); });
  return { n: ok.length, v: ok.length ? avg(ok.map(d => d.sim.items)) : null, diff: ok.length ? avg(ok.map(d => Math.abs((d.fsc || 0) - (d.sc || 0)))) : null, cats: Object.entries(cats).map(([n, l]) => ({ n, v: avg(l) })).sort((p, q) => p.v - q.v) };
}
const aiTabs = () => aiRev() || aiLeadOk() ? `<div class=sg role=tablist style="margin:0 0 14px"><button role=tab class="${!['ai', 'lead', 'train', 'ana'].includes(AQTAB) ? 'on' : ''}" onclick="aqTab('auto')">AutoQA</button>${aiRev() ? `<button role=tab class="${AQTAB === 'ai' ? 'on' : ''}" onclick="aqTab('ai')">AI reviewer${AIDR.filter(d => d.status === 'draft').length ? ` · ${AIDR.filter(d => d.status === 'draft').length}` : ''}</button>` : ''}<button role=tab class="${AQTAB === 'lead' ? 'on' : ''}" onclick="aqTab('lead')">AI team lead${AIL.risk.length ? ` · ${AIL.risk.length}` : ''}</button><button role=tab class="${AQTAB === 'train' ? 'on' : ''}" onclick="aqTab('train')">AI trainer${AIT.needs.length ? ` · ${AIT.needs.length}` : ''}</button><button role=tab class="${AQTAB === 'ana' ? 'on' : ''}" onclick="aqTab('ana')">AI analyst</button></div>` : '';
function aiRevPage() {
  const wait = AIDR.filter(d => d.status === 'draft'), done = AIDR.filter(d => d.status !== 'draft'), m = aiSim(AIDR.filter(aiMonth)), all = aiSim(AIDR);
  const row = d => [d.dt, `<b>${esc(d.agn || an(d.agent))}</b>`, `<span class=mono>${esc(d.lead)}</span>`, chTag(d.ch), esc(d.scn), `<b class=mono style="color:${col(d.sc)}">${d.sc}%</b>`];
  return `<div class=fkp>${kpiS('Human vs AI similarity this month', m.v == null ? '—' : m.v.toFixed(1) + '%', m.n ? `${m.n} approved drafts` : 'appears after the first approved draft', m.v == null ? '' : col(m.v))}${kpiS('Drafts waiting for you', wait.length, wait.length ? 'check and approve them' : 'nothing waiting', wait.length ? 'var(--wn)' : 'var(--ok)')}${kpiS('Average score difference', all.diff == null ? '—' : all.diff.toFixed(1) + ' pts', 'between the AI and the final review')}${kpiS('Approved · rejected', `${done.filter(d => d.status === 'approved').length} · ${done.filter(d => d.status === 'rejected').length}`, 'all time')}</div>`
    + `<div class=row style="margin:0 0 12px"><p class=mu style="margin:0">The AI reviews a conversation on your scorecard and leaves a draft. You check it, change any answer, and approve or reject it.</p><button class=btn onclick="AINEW=true;render()">${IC.plus} New AI review</button></div>`
    + card(`Waiting for you <span class=bg>${wait.length}</span>`, wait.length ? tbl(['Date', 'Agent', 'Lead', 'Type', 'Scorecard', 'AI score', 'Confidence', ''], wait.map(d => [...row(d), d.conf + '%', `<button class=ib onclick="AIDV=${jsq(d.id)};render()">Check</button>`])) : '<p class=mu style="margin:0">No drafts are waiting. Press "New AI review" to let the AI review a conversation.</p>')
    + (all.cats.length ? card('Agreement per category <small class=mu style="font-weight:400">the lowest first: where the AI needs clearer rules (Admin › Integrations › playbook)</small>', all.cats.map(c => `<div style="margin-bottom:8px"><div class=row><span>${esc(c.n)}</span><b class=mono style="color:${col(c.v)}">${c.v.toFixed(0)}%</b></div>${bar(c.v, col(c.v))}</div>`).join('')) : '')
    + (done.length ? card('Decided', tbl(['Date', 'Agent', 'Lead', 'Type', 'Scorecard', 'AI score', 'Final', 'Similarity', 'Status'], done.slice(0, 100).map(d => [...row(d), d.status === 'approved' ? `<a href="javascript:void(0)" class=agl onclick="om('view','${esc(d.rid)}')">${d.fsc}%</a>` : '—', d.sim ? `<b class=mono style="color:${col(d.sim.items)}">${d.sim.items}%</b>` : '—', d.status === 'approved' ? pill('Approved', 'ok') : `<span title="${esc(d.why || '')}">${pill('Rejected', 'bad')}</span>`]))) : '');
}
// ---- a new AI review: paste a transcript, or pick a conversation already in AutoQA
const AINEWM = () => OVL(`<div class=mh><div><h2>New AI review</h2><small>The AI answers every item of the scorecard; you check the draft before anything is published</small></div>${X('AINEW=false;render()')}</div><div class=mb><div class=form style="max-width:none">
<label>From a conversation in AutoQA (optional)<select id=ain_conv onchange="document.getElementById('ain_man').hidden=!!this.value"><option value="">— paste a transcript instead —</option>${AQC.slice(0, 200).map(c => `<option value="${esc(c.id)}">${esc(c.date)} · ${esc(an(c.agent) || c.agn || '')}</option>`).join('')}</select></label>
<div id=ain_man class=form style="max-width:none;padding:0"><div class=eg2><label>Agent<select id=ain_ag>${AGENTS().map(a => `<option value="${esc(a.username)}">${esc(a.name)}</option>`).join('')}</select></label><label>Date<input id=ain_dt type=date value="${todayS()}"></label></div>
<label>Transcript<textarea id=ain_tx rows=8 placeholder="Agent: Good morning, my name is …&#10;Customer: …"></textarea></label></div>
<div class=eg2><label>Lead ID<input id=ain_id placeholder="4640814"></label><label>Type<select id=ain_ch>${CHS.map(k => `<option value=${k}>${CHP[k]}</option>`).join('')}</select></label></div>
<label>Scorecard<select id=ain_sc>${SCS.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label></div>
<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class=ib onclick="AINEW=false;render()">Cancel</button><button class=btn id=ain_go onclick="aiNew()">Let the AI review it</button></div></div>`, 'AINEW=false;render()', 640, 50);
const aiNew = () => once('ainew', async () => {
  const v = id => ($('#' + id) || {}).value || '', conv = v('ain_conv'), b = { id: v('ain_id').trim(), ch: v('ain_ch'), scid: v('ain_sc') };
  if (conv) b.conv = conv; else Object.assign(b, { agent: v('ain_ag'), dt: v('ain_dt'), tx: v('ain_tx') });
  const go = $('#ain_go'); if (go) { go.disabled = true; go.textContent = tr('The AI is reading the conversation…'); }
  const r = await api('/api/ai/drafts', b); if (!r.ok) { if (go) { go.disabled = false; go.textContent = tr('Let the AI review it'); } return toast(await errOf(r, 'The AI could not review it'), true); }
  const d = await r.json(); AIDR.unshift(d); AINEW = false; AIDV = d.id; render(); toast('Draft ready: check it before you approve');
});
// ---- checking a draft: every item with the AI's answer and comment, all of them can be changed
function AIDVM() {
  const d = AIDR.find(x => x.id === AIDV), sc = d && SCS.find(s => s.id === d.scid); if (!d || !sc) { AIDV = null; return ''; }
  const opt = (v, cur) => [['y', 'Yes'], ['n', 'No'], ['na', 'N/A']].map(([k, n]) => `<option value=${k} ${k === cur ? 'selected' : ''}>${n}</option>`).join('');
  return OVL(`<div class=mh><div><h2>Check the AI review</h2><small>${esc(d.agn)} · Lead ${esc(d.lead)} · ${esc(d.scn)} · AI score ${d.sc}% · confidence ${d.conf}%</small></div>${X('AIDV=null;render()')}</div><div class="mb aich">
<details open class=aitx><summary>Transcript</summary><pre>${esc(d.tx || '')}</pre></details>
${sc.cats.map((c, ci) => `<div class=aicat><b>${esc(c.n)}${c.k ? ' <span class=crit>Critical</span>' : ''}</b>${c.it.map((it, ii) => { const x = (d.a[ci] || [])[ii] || ['na', '']; return `<div class=aiit data-ai="${x[0]}"><span>${esc(it.t)}${it.k ? ' <small class=crit>critical</small>' : ''}</span><select id="aia_${ci}_${ii}" onchange="this.closest('.aiit').classList.toggle('chg',this.value!==this.closest('.aiit').dataset.ai)">${opt(x[0], x[0])}</select><input id="aic_${ci}_${ii}" value="${esc(x[1] || '')}" placeholder="Comment"></div>`; }).join('')}</div>`).join('')}
<label>Comment for the agent<textarea id=aia_cm rows=3>${esc(d.cm || '')}</textarea></label>
<small class=mu>Answers you change are marked. When you approve, a normal review is published and the agent is told.</small>
<div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class=ib style="color:var(--bad)" onclick="aiReject()">Reject</button><button class=btn onclick="aiApprove()">Approve and publish</button></div></div>`, 'AIDV=null;render()', 860, 30);
}
const aiApprove = () => once('aiok', async () => {
  const d = AIDR.find(x => x.id === AIDV), sc = SCS.find(s => s.id === d.scid);
  const a = sc.cats.map((c, ci) => c.it.map((it, ii) => [($('#aia_' + ci + '_' + ii) || {}).value || 'na', ($('#aic_' + ci + '_' + ii) || {}).value || '', '']));
  const r = await api('/api/ai/drafts/' + d.id + '/approve', { a, cm: ($('#aia_cm') || {}).value || '' }); if (!r.ok) return toast(await errOf(r, 'Could not approve'), true);
  const j = await r.json(); Object.assign(d, j.draft); AIDV = null; await load(); render(); toast(`Review published · ${j.ev.sc}% · similarity ${j.draft.sim.items}%`);
});
const aiReject = () => ask('Reject this AI review?', 'Nothing is published. You can write why, so the rules for the AI can be improved.', async () => {
  const r = await api('/api/ai/drafts/' + AIDV + '/reject', { why: '' }); if (!r.ok) return toast(await errOf(r, 'Could not reject'), true);
  Object.assign(AIDR.find(x => x.id === AIDV), await r.json()); AIDV = null; render(); toast('Draft rejected');
}, { yes: 'Yes, reject', no: 'Cancel', danger: true });

// ===================== AI team lead (AutoQA › "AI team lead"): agents at risk, weekly team summary, coaching plan drafts =====================
// Agents at risk are worked out from the reviews (below target for 2 weeks, falling score, critical fail, open disputes).
// For any of them the AI drafts a coaching plan; a person edits it and approves it, which creates a normal coaching session
// (its actions become tasks for the agent). The weekly summary is written on request, or every Monday when switched on.
let AIPV = null, AILT = '';                                   // AIPV = the coaching plan being checked; AILT = the team shown
const aiLeadOk = () => ['admin', 'qa', 'lead', 'trainer'].includes(ME.role);
const aiSumOk = () => ['admin', 'qa', 'lead', 'trainer'].includes(ME.role);
function aiTabPage() { return AQTAB === 'ai' && aiRev() ? aiRevPage() : AQTAB === 'lead' && aiLeadOk() ? aiLeadPage() : AQTAB === 'train' && aiLeadOk() ? aiTrainPage() : AQTAB === 'ana' && aiLeadOk() ? aiAnaPage() : ''; }
function aiLeadPage() {
  const risk = AIL.risk.filter(x => !AILT || x.team === AILT), wait = AIL.plans.filter(p => p.status === 'draft'), sums = AIL.summaries.filter(x => !AILT || x.team === AILT);
  return `<div class=row style="margin:0 0 12px;gap:8px;flex-wrap:wrap"><select onchange="AILT=this.value;render()" style="max-width:220px"><option value="">All teams</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${t.id}" ${AILT === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><span style="flex:1"></span>${aiSumOk() ? `<button class=btn id=ail_sum onclick="aiSumNow()">${IC.plus} Write this week's summary</button>` : ''}</div>`
    + card(`Agents at risk <span class=bg>${risk.length}</span>`, risk.length ? tbl(['Agent', 'Team', 'Last 14 days', 'Why', 'Weakest categories', ''], risk.map(x => [agLink(x.agent, x.name), esc(tn(x.team)), x.avg == null ? '—' : `<b class=mono style="color:${scol(x.avg, x.team)}">${x.avg}%</b> <small class=mu>${x.n}</small>`, x.why.map(w => pill(w, 'bad')).join(' '), x.weak.map(c => `${esc(c.n)} <small class=mono>${Math.round(c.v)}%</small>`).join('<br>') || '—', `<button class=ib onclick="aiPlanNew(${jsq(x.agent)})">Draft a coaching plan</button>`])) : '<p class=mu style="margin:0">✓ No agent is at risk right now.</p>')
    + card(`Coaching plans waiting for you <span class=bg>${wait.length}</span>`, wait.length ? tbl(['Agent', 'Plan', 'Made', ''], wait.map(p => [`<b>${esc(p.agn)}</b>`, esc(p.plan.title), fdt(p.at), `<button class=ib onclick="AIPV=${jsq(p.id)};render()">Check</button>`])) : '<p class=mu style="margin:0">No plans are waiting. Use "Draft a coaching plan" next to an agent at risk.</p>')
    + card('Weekly summaries', sums.length ? sums.slice(0, 6).map(x => `<div class=aisum><div class=row><b>${esc(x.stats && x.stats.team || tn(x.team) || 'All teams')} · week of ${esc(x.week)}</b><small class=mu>${x.auto ? 'written by the AI team lead on Monday' : 'asked by ' + esc(x.by)}</small></div><div class=prose>${md(x.text)}</div></div>`).join('') : `<p class=mu style="margin:0">No summary yet.${aiSumOk() ? ' Press "Write this week\'s summary", or switch on the Monday summary in Admin › Integrations.' : ''}</p>`);
}
const aiSumNow = () => once('aisum', async () => {
  const b = $('#ail_sum'); if (b) { b.disabled = true; b.textContent = tr('The AI is writing the summary…'); }
  const r = await api('/api/ai/lead/summary', { team: AILT }); if (!r.ok) { render(); return toast(await errOf(r, 'The AI could not write the summary'), true); }
  AIL.summaries.unshift(await r.json()); render(); toast('Summary ready');
});
const aiPlanNew = u => once('aiplan', async () => {
  toast('The AI is drafting the coaching plan…');
  const r = await api('/api/ai/lead/plan', { agent: u }); if (!r.ok) return toast(await errOf(r, 'The AI could not draft the plan'), true);
  const p = await r.json(); AIL.plans.unshift(p); AIPV = p.id; render();
});
const aiPlus = d => iso(new Date(Date.now() + d * 864e5));
function AIPVM() {
  const p = AIL.plans.find(x => x.id === AIPV); if (!p) { AIPV = null; return ''; }
  const x = p.plan;
  return OVL(`<div class=mh><div><h2>Check the coaching plan</h2><small>${esc(p.agn)} · drafted by the AI team lead · change anything before you approve</small></div>${X('AIPV=null;render()')}</div><div class=mb><div class=form style="max-width:none">
<label>Title<input id=aip_t value="${esc(x.title)}"></label>
<label>Goals<textarea id=aip_g rows=3>${esc(x.goals)}</textarea></label>
<label>Focus (categories, separated by commas)<input id=aip_f value="${esc(x.focus.join(', '))}"></label>
<div><b style="font-size:13px">Actions for the agent (each becomes a task)</b>${x.actions.map((a, i) => `<div class=row style="gap:8px;margin-top:6px"><input id="aip_a${i}" value="${esc(a.t)}" style="flex:1"><input id="aip_d${i}" type=date value="${aiPlus(a.days)}" style="width:150px"></div>`).join('')}</div>
<label>Notes for the session<textarea id=aip_n rows=3>${esc(x.notes)}</textarea></label>
<small class=mu>When you approve, a ${ME.role === 'lead' ? 'one-to-one' : 'coaching session'} is created for ${esc(p.agn)}, and every action becomes a task for them.</small></div>
<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class=ib style="color:var(--bad)" onclick="aiPlanReject()">Reject</button><button class=btn onclick="aiPlanApprove()">Approve and create the session</button></div></div>`, 'AIPV=null;render()', 700, 40);
}
const aiPlanApprove = () => once('aipok', async () => {
  const p = AIL.plans.find(x => x.id === AIPV), v = id => ($('#' + id) || {}).value || '';
  const actions = p.plan.actions.map((a, i) => ({ t: v('aip_a' + i).trim(), owner: p.agent, due: v('aip_d' + i) })).filter(a => a.t);
  const s = await api('/api/sessions', { kind: ME.role === 'lead' ? 'o2o' : 'coaching', date: todayS(), agents: [p.agent], title: v('aip_t').trim(), goals: v('aip_g'), focus: v('aip_f').split(',').map(z => z.trim()).filter(Boolean), notes: v('aip_n'), actions, makeTasks: true });
  if (!s.ok) return toast(await errOf(s, 'Could not create the session'), true);
  const sess = await s.json(), r = await api('/api/ai/lead/plan/' + p.id + '/approve', { sid: sess.id }); if (!r.ok) return toast(await errOf(r, 'Could not approve'), true);
  Object.assign(p, await r.json()); AIPV = null; render(); toast(`Coaching session created with ${actions.length} tasks`);
});
const aiPlanReject = () => ask('Reject this coaching plan?', 'Nothing is created.', async () => {
  const r = await api('/api/ai/lead/plan/' + AIPV + '/reject', {}); if (!r.ok) return toast(await errOf(r, 'Could not reject'), true);
  Object.assign(AIL.plans.find(x => x.id === AIPV), await r.json()); AIPV = null; render(); toast('Plan rejected');
}, { yes: 'Yes, reject', no: 'Cancel', danger: true });
// dashboard: the latest summary and the agents at risk (in the Team lead dashboard)
wdef('dash', 'ai_lead', 'AI team lead', 60, (c, s, x) => {
  const risk = AIL.risk.filter(z => !c.t || z.team === c.t), sum = AIL.summaries.find(z => !c.t || !z.team || z.team === c.t);
  return card(`${wt(x, 'AI team lead')} <span class=bg>${risk.length} at risk</span>`, (risk.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${risk.slice(0, 6).map(z => `<button class=ib onclick="openAgent(${jsq(z.agent)})" title="${esc(z.why.join(', '))}">${esc(z.name)}</button>`).join('')}</div>` : '<p class=mu style="margin:0 0 8px">✓ No agent is at risk right now.</p>')
    + (sum ? `<div class="prose aisum">${md(sum.text)}</div>` : '<p class=mu style="margin:0">No weekly summary yet.</p>') + `<a href="javascript:void(0)" class=agl onclick="AQTAB='lead';LS.set('qa_aqtab','lead');goPage('autoqa')">Open the AI team lead ›</a>`);
}, 'The weekly AI summary and the agents at risk', 'Lists');

// ===================== AI trainer (AutoQA › "AI trainer"): training needs, quiz drafts, practice calls with an AI customer =====================
// Training needs are the categories where agents were below target in the last 30 days (no AI needed). For any of them the AI
// drafts a quiz from the scorecard, the missed items and the matching knowledge base articles; it stays a draft until a person
// checks and publishes it in Quizzes. When an admin switches it on, the Call Simulator lets agents talk to an AI customer.
function aiTrainPage() {
  const nd = AIT.needs, qz = AIT.quizzes, pl = AIT.plays;
  return card(`Training needs <span class=bg>${nd.length}</span>`, nd.length ? tbl(['Category', 'Average', 'Agents below target', ''], nd.map(x => [`<b>${esc(x.cat)}</b>`, `<b class=mono>${x.avg}%</b> <small class=mu>${tr(`${x.agents} agents`)}</small>`, x.below.slice(0, 6).map(a => `${agLink(a.agent, a.name)} <small class=mono>${a.avg}%</small>`).join(', ') + (x.below.length > 6 ? ` <small class=mu>+${x.below.length - 6}</small>` : ''), `<span style="display:flex;gap:6px;flex-wrap:wrap"><button class=ib onclick="aiQuizNew(${jsq(x.cat)})">Draft a quiz with AI</button>${(x.practice || []).length ? `<button class=ib onclick="aiPractice(${jsq(x.cat)})" title="${esc(x.practice.join(', '))}">🎯 ${tr('Send a practice call')}</button>` : ''}</span>`])) : '<p class=mu style="margin:0">✓ No category is below target in the last 30 days.</p>')
    + card(`Quizzes drafted by the AI trainer <span class=bg>${qz.length}</span>`, qz.length ? tbl(['Quiz', 'Questions', 'Given to', 'Status', 'Made', ''], qz.map(q => [esc(q.title), q.qs, q.n || '—', q.status === 'published' ? pill('Published', 'ok') : pill('Draft', 'wn'), fdt(q.created), `<button class=ib onclick="aiOpenQuiz(${jsq(q.id)})">${q.status === 'published' ? tr('Open') : tr('Check and publish')}</button>`])) : '<p class=mu style="margin:0">No quiz yet. Use "Draft a quiz with AI" next to a training need: you check the questions before agents see them.</p>')
    + card(`Practice calls with the AI customer <span class=bg>${pl.length}</span>`, (AIT.on ? '' : `<p class=mu style="margin:0 0 8px">${ME.role === 'admin' ? tr('Switch on "Agents can practise with an AI customer" in Admin › Integrations.') : tr('An admin can switch on practice with an AI customer in Admin › Integrations.')}</p>`)
      + (pl.length ? tbl(['Agent', 'Scenario', 'Score', 'Date', ''], pl.map(s => [agLink(s.agent, s.name), esc(s.scenario), `<b class=mono style="color:${scol(s.score)}">${s.score}%</b>`, fdt(s.date), `<details><summary class=agl style="cursor:pointer">Read the call</summary><div class=aisum style="white-space:pre-wrap;max-width:560px">${esc(s.tx || '')}</div>${(s.tips || []).length ? `<p style="margin:6px 0 0"><b>Tips:</b> ${s.tips.map(esc).join(' · ')}</p>` : ''}</details>`])) : '<p class=mu style="margin:0">No practice call yet.</p>'));
}
// Q Trainer: the agents below target get a notification with a practice call that trains the category (rules only, no AI)
const aiPractice = cat => once('aiprac', async () => { const r = await api('/api/ai/trainer/practice', { cat }); if (!r.ok) return toast(await errOf(r, 'Could not send'), true); const j = await r.json(); toast(tr(`Sent to ${j.sent} agents`) + ': ' + j.scenario); });
const aiQuizNew = cat => once('aiquiz', async () => {
  const x = AIT.needs.find(n => n.cat === cat); toast('The AI trainer is writing the quiz…');
  const r = await api('/api/ai/trainer/quiz', { cat, agents: x ? x.below.map(a => a.agent) : [] }); if (!r.ok) return toast(await errOf(r, 'The AI could not write the quiz'), true);
  AIT.quizzes.unshift(await r.json()); render(); toast('Quiz draft ready: check it, then publish');
});
// opens the draft in the quiz editor once the Quizzes page has loaded its list
const aiOpenQuiz = async id => { goPage('quiz'); const ready = () => route === 'quiz' && QZ.some(q => q.id === id) && document.querySelector('#m [onclick*="editQuiz"]'); for (let i = 0; i < 60 && !ready(); i++) await new Promise(ok => setTimeout(ok, 100)); if (ready()) editQuiz(id); };

// dashboard: the training needs (in the Trainer and Learning dashboards)
wdef('dash', 'ai_train', 'AI trainer', 30, (c, s, x) => card(`${wt(x, 'AI trainer')} <span class=bg>${AIT.needs.length}</span>`, (AIT.needs.length ? AIT.needs.slice(0, 5).map(n => `<div class=row style="padding:4px 0;border-bottom:1px solid var(--bd)"><span>${esc(n.cat)}</span><small class=mu>${n.below.length} below target · <b class=mono>${Math.round(n.avg)}%</b></small></div>`).join('') : '<p class=mu style="margin:0">✓ No category is below target in the last 30 days.</p>')
  + `<a href="javascript:void(0)" class=agl style="display:inline-block;margin-top:8px" onclick="AQTAB='train';LS.set('qa_aqtab','train');goPage('autoqa')">Open the AI trainer ›</a>`), 'Training needs from the reviews and the quizzes drafted by AI', 'Lists');

// ===================== AI analyst (AutoQA › "AI analyst"): questions about the quality data, answered as a short report =====================
// The server works out the numbers (scores, teams, categories, channels, agents, reviewers, disputes) for the period and the team;
// the AI only writes the report from them. Reports are kept so they can be read again and copied into an e-mail.
let AIQ = { q: '', period: '30', team: '' };
const AIQS = ['Which team improved the most, and why?', 'Where do we lose the most points?', 'Which agents need help first?', 'Are our reviewers scoring the same way?', 'How do calls, chats and e-mails compare?', 'How many agents do I have today?', 'Who is off this Friday?', 'Who was late last week?'];
function aiAnaPage() {
  const busy = !!BUSY.aiana, P = AIA.periods || {}, list = AIA.reports;
  const one = (x, open) => `<div class=row style="align-items:flex-start;gap:10px"><div style="flex:1"><b>${esc(x.q)}</b><br><small class=mu>${esc(tr(P[x.period] || x.period))} · ${esc(x.team ? tn(x.team) : tr('All teams'))} · ${x.auto ? tr('written by the AI analyst on the 1st') : esc(x.by)} · ${fdt(x.at)}</small></div>`
    + `<button class=ib onclick="aiAnaCopy(${jsq(x.id)})" title="Copy the report">${IC.copy} Copy</button>${ME.role === 'admin' || x.byU === ME.username ? `<button class=ib onclick="aiAnaDel(${jsq(x.id)})" title="Delete">✕</button>` : ''}</div>`
    + `<div class=prose style="margin-top:8px">${md(x.text)}</div>${x.pack ? `<small class=mu>${tr(`Based on ${x.pack.thisPeriod.reviews} reviews`)} · ${esc(x.pack.from)} – ${esc(x.pack.to)}</small>` : ''}`;
  return card('Ask the AI analyst', `<p class=mu style="margin:0 0 10px">Ask anything about your quality numbers. The app works out the numbers; the AI writes the answer from them only.</p>
<textarea id=aan_q rows=2 style="width:100%" placeholder="For example: which team improved the most this month, and why?" oninput="AIQ.q=this.value">${esc(AIQ.q)}</textarea>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">${AIQS.map(q => `<button class=ib onclick="AIQ.q=tr(${jsq(q)});render()">${esc(tr(q))}</button>`).join('')}</div>
<div class=row style="gap:8px;flex-wrap:wrap"><select onchange="AIQ.period=this.value">${Object.entries(P).map(([k, v]) => `<option value="${k}" ${AIQ.period === k ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select><select onchange="AIQ.team=this.value"><option value="">All teams</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${t.id}" ${AIQ.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><span style="flex:1"></span>
<button class=ib onclick="AIQ.q='';aiAsk()" ${busy ? 'disabled' : ''}>Monthly report</button><button class=btn onclick="aiAsk()" ${busy ? 'disabled' : ''}>${busy ? tr('The AI analyst is reading your data…') : tr('Ask')}</button></div>`)
    + (list.length ? card(`Reports <span class=bg>${list.length}</span>`, one(list[0]) + list.slice(1, 20).map(x => `<details class=aisum><summary style="cursor:pointer"><b>${esc(x.q)}</b> <small class=mu>${esc(x.team ? tn(x.team) : tr('All teams'))} · ${fdt(x.at)}</small></summary><div style="margin-top:8px">${one(x)}</div></details>`).join(''))
      : card('Reports', `<p class=mu style="margin:0">No report yet. Ask a question, or press "Monthly report".${ME.role === 'admin' ? ' ' + tr('You can also switch on the monthly report on the 1st in Admin › Integrations.') : ''}</p>`));
}
const aiAsk = () => once('aiana', async () => {
  render();
  const r = await api('/api/ai/analyst', { q: AIQ.q.trim(), period: AIQ.period, team: AIQ.team });
  if (!r.ok) { setTimeout(render); return toast(await errOf(r, 'The AI analyst could not answer'), true); }
  AIA.reports.unshift(await r.json()); AIQ.q = ''; setTimeout(render); toast('Report ready');
});
const aiAnaCopy = async id => { const x = AIA.reports.find(r => r.id === id); try { await navigator.clipboard.writeText(x.q + '\n\n' + x.text); toast('Copied'); } catch (e) { toast('Could not copy', true); } };
const aiAnaDel = id => ask('Delete this report?', 'It is removed for everyone.', async () => {
  const r = await api('/api/ai/analyst/' + id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete'), true);
  AIA.reports = AIA.reports.filter(x => x.id !== id); render(); toast('Report deleted');
}, { yes: 'Yes, delete', no: 'Cancel', danger: true });
// dashboard: the latest AI analyst report (in the Analytics dashboard)
wdef('dash', 'ai_ana', 'AI analyst', 60, (c, s, x) => { const r = AIA.reports[0];
  return card(wt(x, 'AI analyst'), (r ? `<b>${esc(r.q)}</b> <small class=mu>${fdt(r.at)}</small><div class=prose style="margin-top:6px">${md(r.text)}</div>` : '<p class=mu style="margin:0">No report yet.</p>')
    + `<a href="javascript:void(0)" class=agl style="display:inline-block;margin-top:8px" onclick="AQTAB='ana';LS.set('qa_aqtab','ana');goPage('autoqa')">Ask the AI analyst ›</a>`); }, 'The latest report of the AI analyst', 'Lists');

// ===================== voice for the Call Simulator (free, built into the browser) =====================
// The customer's lines are read aloud in the language of the app (when the computer has such a voice), and the agent can
// answer by talking: the browser turns speech into text and sends it. Speech to text works in Chrome and Edge; elsewhere
// the microphone button is hidden and typing works as before. Nothing is sent to an outside voice service.
const VSR = window.SpeechRecognition || window.webkitSpeechRecognition;
let VOX = LS.get('qa_vox', true), VREC = null;
if (window.speechSynthesis) speechSynthesis.getVoices();                          // the computer's voices load in the background: ask early
const voxHas = () => { const S = window.speechSynthesis, vs = S ? S.getVoices() : [], l = I18N.locale().slice(0, 2); return !vs.length || vs.some(v => v.lang.slice(0, 2) === l); };
function voxSay(t) {
  const S = window.speechSynthesis; if (!VOX || !S || !t) return;
  S.cancel(); const u = new SpeechSynthesisUtterance(t), lang = I18N.locale(), vs = S.getVoices();
  u.lang = lang; u.voice = vs.find(v => v.lang === lang) || vs.find(v => v.lang.slice(0, 2) === lang.slice(0, 2)) || null; S.speak(u);
}
const voxStop = () => { if (window.speechSynthesis) speechSynthesis.cancel(); if (VREC) { try { VREC.abort(); } catch (e) { /* already stopped */ } VREC = null; } };
const voxToggle = () => { VOX = !VOX; LS.set('qa_vox', VOX); if (!VOX) voxStop(); render(); };
// the microphone: what you say appears in the reply box while you talk, and is sent when you stop
function voxMic(send) {
  if (!VSR) return toast('Answering by voice works in Chrome and Edge', true);
  if (VREC) { VREC.stop(); return; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  const r = VREC = new VSR(), b = $('#vmic'); r.lang = I18N.locale(); r.interimResults = true; r.maxAlternatives = 1;
  if (b) b.classList.add('rec');
  r.onresult = e => { const i = $('#si'), t = [...e.results].map(x => x[0].transcript).join(' '); if (i) i.value = t; if (e.results[e.results.length - 1].isFinal && t.trim()) { VREC = null; window[send](); } };
  r.onerror = e => { VREC = null; const m = $('#vmic'); if (m) m.classList.remove('rec'); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Allow the microphone for this site to answer by voice', true); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Could not hear you. Try again or type your reply.', true); };
  r.onend = () => { if (VREC === r) VREC = null; const m = $('#vmic'); if (m) m.classList.remove('rec'); };
  try { r.start(); } catch (e) { VREC = null; if (b) b.classList.remove('rec'); }
}
// the voice buttons under the reply box: speak the customer on/off, and the microphone (only where the browser can do it)
const voxBar = send => `<div class=row style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="ib${VOX ? ' on' : ''}" aria-pressed="${VOX}" onclick="voxToggle()" title="Read the customer's replies aloud">${VOX ? '🔊' : '🔇'} ${tr(VOX ? 'Customer voice on' : 'Customer voice off')}</button>`
  + (VSR ? `<button class=ib id=vmic onclick="voxMic('${send}')" title="Press, speak your reply, and it is sent when you stop">🎤 ${tr('Answer by voice')}</button>` : `<small class=mu>${tr('Answering by voice works in Chrome and Edge.')}</small>`)
  + (VOX && !voxHas() ? `<small class=mu>${tr('This computer has no voice for this language, so another voice reads it. Add one in Windows Settings › Time & language › Speech.')}</small>` : '') + '</div>';
