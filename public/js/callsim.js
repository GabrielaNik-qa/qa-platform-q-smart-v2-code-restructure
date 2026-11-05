// ===================== Q Trainer (Gabriela, 3 November; called the Call Simulator until 4 November) =====================
// New simulation: four steps, then the language, the segment and a scenario (with its level), the call with the indicators ticked
// while you speak, and at the end you choose how the call ended. The customer follows the lines of the scenario; when an admin
// switches on the AI customer (Admin › Integrations), the AI plays it, in the language you chose. The server scores the call (sim.js).
// Dashboard: Overview, Sessions and Agents, for a week, month, quarter, year or all, by team and agent. Scenarios: trainers and admins.
let CSM = { step: 'home', mode: 'text', lang: 'en', seg: '', sc: null, msgs: [], t0: 0, li: 0, busy: false, end: false, out: '', res: null };
let CSD = { tab: 'over', per: 'all', team: '', who: '', open: null }, SIMV = null, SCNS = { builtin: [], custom: [] }, CSTICK = null;
const CSPASS = 85;
// Q Trainer's own mark: the Q with its sound rings, in the Q-smart colours (pink, orange, yellow)
const QTLOGO = '<svg class=qtlogo viewBox="0 0 120 80" aria-hidden="true"><path d="M22 14a40 40 0 0 0 0 52M32 22a28 28 0 0 0 0 36M42 30a16 16 0 0 0 0 20" fill="none" stroke="#FF6F91" stroke-width="5" stroke-linecap="round"/><path d="M98 14a40 40 0 0 1 0 52M88 22a28 28 0 0 1 0 36M78 30a16 16 0 0 1 0 20" fill="none" stroke="#FFD447" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="38" r="16" fill="none" stroke="#FF6B00" stroke-width="7"/><path d="M70 49l9 9" stroke="#FF6F91" stroke-width="7" stroke-linecap="round"/></svg>';
const qtSeg = s => ({ 'Customer service': 'cs', Sales: 'sa', Retention: 're' })[s || 'Customer service'] || 'own';
// the practice calls suggested to me: the scenarios that train the categories where my reviews are below the pass mark (no AI)
const qtSuggested = () => { const l = (AIRP.suggested || []).map(x => ({ ...x, sc: csSc(x.id) })).filter(x => x.sc); if (!l.length) return '';
  return card(`🎯 ${tr('Suggested for you')}`, `<p class=mu style="margin:0 0 10px">${tr('Your reviews of the last 30 days are below the pass mark in these categories. These calls train them.')}</p><div class=qtsug>${l.map(x => `<button class="ib qtsg" onclick="csStart(${jsq(x.id)})"><b data-noi18n>${esc(tr(x.sc.name))}</b><small class=mu>${tr('trains')} <span data-noi18n>${esc(tr(x.cat))}</span> · ${Math.round(x.avg)}%</small></button>`).join('')}</div>`, 'qtsugc'); };
const csSc = id => AIRP.scenarios.find(x => x.id === id);
const csLvl = n => `<span class=cslvl title="${tr('Level')} ${n}/5" aria-label="${tr('Level')} ${n}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const csTime = s => { s = Math.max(0, Math.round(s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const csHours = m => { if (m > 0 && m < 1) return Math.round(m * 60) + "s"; m = Math.round(m || 0); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`; };
// "1 session", "2 sessions" (and the same for turns), translated with the plural forms of each language
const csN = (n, w) => tr(n + " " + w + (n === 1 ? "" : "s"));
const csCol = v => v >= CSPASS ? 'var(--ok)' : v >= 65 ? 'var(--wn)' : 'var(--bad)';
// the indicators met so far (only to show them while you speak: the server counts them again when you finish)
const csLive = (sc, msgs) => { const mine = msgs.filter(m => m.r === 'a').map(m => ' ' + m.t.toLowerCase() + ' ');
  return (sc.inds || []).map(x => ({ t: x.t, ok: mine.some(t => x.kw.some(k => t.includes(k))) })); };
// the outcomes in a mixed order, the same during one call (so the first one is not always the right one)
const csOuts = sc => [...(sc.outcomes || [])].sort((a, b) => ((a.length * 31 + CSM.t0) % 97) - ((b.length * 31 + CSM.t0) % 97) || a.localeCompare(b));

// ---------------------------------------------------------------- New simulation
function csStart(id) {
  const sc = csSc(id); if (!sc) return;
  voxStop(); CSM = { ...CSM, step: 'call', sc: id, msgs: [{ r: 'c', t: tr(sc.open) }], t0: Date.now(), li: 0, busy: false, end: false, out: '', res: null }; render();
  if (CSM.mode === 'voice') voxSay(tr(sc.open));
  setTimeout(() => { const i = $('#si'); if (i) i.focus(); }, 50);
}
const csGo = step => { voxStop(); CSM.step = step; if (step !== 'call') CSM.busy = false; render(); };
async function csSend() {
  const i = $('#si'), t = i && i.value.trim(), sc = csSc(CSM.sc); if (!t || CSM.busy || CSM.end || !sc) return;
  CSM.msgs.push({ r: 'a', t });
  if (!AIRP.on) {   // the written customer: the next line of the scenario; after the last one the customer has finished
    const l = sc.lines || []; if (CSM.li < l.length) { const say = tr(l[CSM.li++]); CSM.msgs.push({ r: 'c', t: say }); if (CSM.mode === 'voice') voxSay(say); }
    CSM.end = CSM.li >= l.length; render(); const n = $('#si'); if (n) n.focus(); return;
  }
  CSM.busy = true; render();
  const r = await api('/api/ai/roleplay/turn', { sc: CSM.sc, msgs: CSM.msgs, lang: CSM.lang }); CSM.busy = false;
  if (!r.ok) { CSM.msgs.pop(); render(); const n = $('#si'); if (n) n.value = t; return toast(await errOf(r, 'The customer could not answer'), true); }
  const j = await r.json(); CSM.msgs.push({ r: 'c', t: j.reply }); CSM.end = !!j.end; render(); if (CSM.mode === 'voice') voxSay(j.reply); const n = $('#si'); if (n) n.focus();
}
const csHang = () => { if (!CSM.msgs.some(m => m.r === 'a')) return toast('Write at least one reply first', true); const sc = csSc(CSM.sc); if ((sc.outcomes || []).length) csGo('end'); else csFinish(); };
const csFinish = () => once('csfin', async () => {
  const sc = csSc(CSM.sc); if ((sc.outcomes || []).length && !CSM.out) return toast('Choose how the call ended', true);
  voxStop(); const secs = Math.round((Date.now() - CSM.t0) / 1000);
  const r = await api(AIRP.on ? '/api/ai/roleplay/finish' : '/api/sim/finish', { sc: CSM.sc, msgs: CSM.msgs, outcome: CSM.out, secs, minutes: Math.ceil(secs / 60), mode: CSM.mode, lang: CSM.lang });
  if (!r.ok) return toast(await errOf(r, 'Could not score the call'), true);
  CSM.res = await r.json(); CSM.step = 'res'; SIMS.unshift(CSM.res); render();
});
// the clock of the call: only its own text changes every second, the page is not drawn again
const csTick = () => { clearInterval(CSTICK); CSTICK = setInterval(() => { const e = $('#cstime'); if (!e || route !== 'sim' || CSM.step !== 'call') { clearInterval(CSTICK); return; } e.textContent = csTime((Date.now() - CSM.t0) / 1000); }, 1000); };

// one finished call: the score, the outcome, the indicators, the feedback per turn and the conversation
function csDetail(s) {
  const inds = s.inds || [], met = inds.filter(x => x.ok).length;
  const verdict = s.outcome ? `<div class="card csv ${s.right ? 'ok' : 'bad'}"><small class=ktt>${tr('Did you choose the right outcome?')}</small><b>${s.right ? '✓ ' + tr('Right choice') : '✗ ' + tr('Not the right choice')}</b><div><small class=mu>${tr('Your choice')}:</small> <span data-noi18n>${esc(tr(s.outcome))}</span>${!s.right && s.best ? `<br><small class=mu>${tr('The right outcome')}:</small> <span data-noi18n>${esc(tr(s.best))}</span>` : ''}</div></div>` : '';
  const ind = inds.length ? `<div class=card><small class=ktt>${tr('Indicators')} · ${met}/${inds.length}</small><ul class=csind>${inds.map(x => `<li class="${x.ok ? 'ok' : ''}">${x.ok ? '✓' : '✗'} ${esc(tr(x.t))}${x.ok ? ` <small class=mu>${tr('turn')} ${x.turn}</small>` : ''}</li>`).join('')}</ul></div>` : '';
  const fb = (s.fb || []).length ? `<div class=card><small class=ktt>${tr('Feedback per turn')}</small><ul class=csfb>${s.fb.map(f => `<li><b>${tr('Turn')} ${f.turn}:</b> ${f.hit.length ? f.hit.map(h => esc(tr(h))).join(', ') : `<span class=mu>${tr('no new indicator')}</span>`}</li>`).join('')}</ul></div>` : '';
  const lst = (t, l) => (l || []).length ? `<div><b>${tr(t)}</b><ul style="margin:6px 0 0">${l.map(x => `<li>${esc(tr(x))}</li>`).join('')}</ul></div>` : '';
  return `<div class=csres>${verdict}${ind}${fb}</div><div class=row style="gap:16px;align-items:flex-start;flex-wrap:wrap;margin:12px 0">${lst('What went well', s.good)}${lst('Try next time', s.tips)}</div>`
    + (s.tx ? `<details open><summary class=agl style="cursor:pointer">${tr('The conversation')}</summary><div class=cstx data-noi18n>${esc(s.tx).replace(/^(Agent|Customer):/gm, (a, w) => `<b class="${w === 'Agent' ? 'csa' : 'csc'}">${tr(w)}:</b>`).replace(/\n/g, '<br>')}</div></details>` : '');
}
const csScore = s => `<div class=csbig style="--c:${csCol(s.score)}"><b class=mono>${s.score}</b><small>/100</small></div>`;

PG.sim = function () {
  const top = (t, s, back) => `<header class=hd><div class=row style="gap:12px;justify-content:flex-start">${back ? `<button class=ic aria-label="${tr('Back')}" title="${tr('Back')}" onclick="csGo('${back}')">‹</button>` : ''}<div><small class=cskick>${tr('Q Trainer')}</small><h1>${tr(t)}</h1><p class=mu style="margin:4px 0 0">${tr(s)}</p></div></div>${bellBtn()}</header>`;
  const who = AIRP.on ? tr('The AI plays the customer, in the language you choose.') : tr('The customer follows the written lines of the scenario. An admin can let the AI play the customer (Admin › Integrations).');
  if (CSM.step === 'home' || !AIRP.scenarios.length) return top('New simulation', 'Pick a mode, then choose the customer you will call.')
    + `<section class="card qthero"><div class=qtbrand>${QTLOGO}<div><small class=cskick>${tr('Q Trainer')}</small><h2>${tr('Practise the call before the real one.')}</h2><p class=mu style="margin:0">${who}</p></div></div>`
    + (AIRP.scenarios.length ? `<div class=qtmodes><button class=qtmode onclick="CSM.mode='voice';csGo('pick')"><span class=qtico>🎤</span><b>${tr('Voice call')}</b><small>${tr('Speak; the customer answers aloud')}</small></button><button class=qtmode onclick="CSM.mode='text';csGo('pick')"><span class=qtico>💬</span><b>${tr('Chat')}</b><small>${tr('Type your replies')}</small></button></div>`
      : `<p class=mu>${tr('No scenario is switched on yet. A trainer or an admin switches them on in Q Trainer › Scenarios.')}</p>`)
    + `<ol class=qtflow>${['Choose a customer', 'Talk', 'Indicators tick as you speak', 'Score and feedback'].map(t => `<li>${tr(t)}</li>`).join('')}</ol></section>` + qtSuggested();
  if (CSM.step === 'pick') {
    const segs = [...new Set(AIRP.scenarios.map(x => x.seg || 'Customer service'))]; if (!segs.includes(CSM.seg)) CSM.seg = segs[0];
    const langs = AIRP.on ? `<div class="card cslang"><small class=ktt>🌐 ${tr('Language')}</small><div class=chips>${Object.entries(AIRP.langs || { en: 'English' }).map(([k, n]) => `<button class="ib ${CSM.lang === k ? 'on' : ''}" aria-pressed="${CSM.lang === k}" onclick="CSM.lang='${k}';render()">${k.toUpperCase()} <small>${esc(tr(n))}</small></button>`).join('')}</div><small class=mu>${CSM.mode === 'voice' ? '🎤 ' + tr('Voice mode') : '💬 ' + tr('Text mode')} · ${tr('The AI customer answers in the language you choose')}</small></div>`
      : `<div class="card cslang"><small class=mu>${CSM.mode === 'voice' ? '🎤 ' + tr('Voice mode') : '💬 ' + tr('Text mode')} · ${who}</small></div>`;
    return top('Choose a scenario', 'Choose the segment, then the customer you are calling today.', 'home') + langs
      + `<div class="card cssegs"><small class=ktt>${tr('Segment')}</small><div class=seg role=tablist>${segs.map(g => `<button role=tab class="${CSM.seg === g ? 'on' : ''}" aria-selected="${CSM.seg === g}" onclick="CSM.seg=${jsq(g)};render()">${esc(tr(g))}</button>`).join('')}</div></div>`
      + qtSuggested() + `<div class=cscards>${AIRP.scenarios.filter(x => (x.seg || 'Customer service') === CSM.seg).map(x => `<button class="card cscard" data-seg="${esc(qtSeg(x.seg))}" onclick="csStart(${jsq(x.id)})">${csLvl(x.level || 2)}<b data-noi18n>${esc(tr(x.name))}</b><span class=mu data-noi18n>${esc(tr(x.who))}</span><small class=mu data-noi18n>“${esc(tr(x.open))}”</small><span class=row><small class=mu>${(x.inds || []).length} ${tr('indicators')}</small><span class=agl>${tr('Start')} →</span></span></button>`).join('')}</div>`;
  }
  const sc = csSc(CSM.sc); if (!sc) { CSM.step = 'home'; return PG.sim(); }
  if (CSM.step === 'res' && CSM.res) { const s = CSM.res;
    return top('Your result', sc.name, '') + `<section class="card csresh">${csScore(s)}<div><b data-noi18n>${esc(tr(sc.name))}</b> ${s.score >= CSPASS ? pill('Passed', 'ok') : pill('Keep practising', 'wn')}<br><small class=mu>${csTime(s.secs || s.minutes * 60)} · ${csN(s.turns || 0, 'turn')} · ${s.mode === 'voice' ? tr('Voice') : tr('Text')}${s.ai ? ' · ' + tr('scored by the AI trainer') : ''}</small></div>`
      + `<span style="flex:1"></span><button class=ib onclick="csStart(${jsq(sc.id)})">${tr('Same scenario again')}</button><button class=ib onclick="csGo('pick')">${tr('Choose another scenario')}</button><button class=btn onclick="CSD.tab='sess';goPage('simres')">${tr('Open the dashboard')}</button></section>` + csDetail(s); }
  if (CSM.step === 'end') return top('How did the call end?', 'Choose the outcome of the call, as you would in the real tool.', 'call')
    + `<section class=card><div class=csouts>${csOuts(sc).map(o => `<button class="ib ${CSM.out === o ? 'on' : ''}" aria-pressed="${CSM.out === o}" onclick="CSM.out=${jsq(o)};render()" data-noi18n>${esc(tr(o))}</button>`).join('')}</div><div class=acts><button class=btn onclick="csFinish()">${tr('Get my score')}</button></div></section>`;
  // the call
  const live = csLive(sc, CSM.msgs), met = live.filter(x => x.ok).length; csTick();
  return top(sc.name, sc.who, 'pick')
    + `<div class=cscall><section class="card csconv"><div class=row><span>${csLvl(sc.level || 2)} <small class=mu>${CSM.mode === 'voice' ? '🎤 ' + tr('Voice') : '💬 ' + tr('Text')}</small></span><b class=mono id=cstime>${csTime((Date.now() - CSM.t0) / 1000)}</b></div>`
    + `<div class=csmsgs>${CSM.msgs.map(m => `<div class="msg ${m.r === 'a' ? 'me' : ''}" data-noi18n><small>${tr(m.r === 'a' ? 'You' : 'Customer')}</small>${esc(m.t)}</div>`).join('')}${CSM.busy ? `<div class=msg><i class=mu>${tr('The customer is typing…')}</i></div>` : ''}</div>`
    + (CSM.end ? `<p class=mu>${tr('The customer has finished. End the call to choose the outcome.')}</p>` : `<div class=row style="margin-top:10px"><input id=si style="flex:1" aria-label="${tr('Your reply')}" placeholder="${tr('Type your reply…')}" onkeydown='if(event.key=="Enter")csSend()' ${CSM.busy ? 'disabled' : ''}><button class=btn onclick="csSend()" ${CSM.busy ? 'disabled' : ''}>${tr('Send')}</button></div>${CSM.mode === 'voice' ? voxBar('csSend') : ''}`)
    + `<div class=acts><button class=ib onclick="csGo('pick')">${tr('Cancel')}</button><button class="btn bad" onclick="csHang()">📞 ${tr('End the call')}</button></div></section>`
    + `<aside class="card csside"><small class=ktt>${tr('Indicators')} · <b>${met}/${live.length}</b></small><ul class=csind>${live.map(x => `<li class="${x.ok ? 'ok' : ''}">${x.ok ? '✓' : '○'} ${esc(tr(x.t))}</li>`).join('') || `<li class=mu>${tr('This scenario has no indicators.')}</li>`}</ul><small class=mu>${tr('They are ticked as you speak. The right outcome counts too.')}</small></aside></div>`;
};
// from the Scenarios page: straight into the call
function aiSimGo(id) { CSM.mode = 'text'; location.hash = 'sim'; const t = setInterval(() => { if (route === 'sim' && !QL && csSc(id)) { clearInterval(t); csStart(id); } }, 200); setTimeout(() => clearInterval(t), 10000); }

// ---------------------------------------------------------------- Dashboard: Overview, Sessions, Agents
const CSPER = [['week', 'Week', 7], ['month', 'Month', 30], ['q', 'Q', 91], ['year', 'Year', 365], ['all', 'All', 0]];
const csList = () => { const d = (CSPER.find(p => p[0] === CSD.per) || [])[2], from = d ? Date.now() - d * 864e5 : 0;
  return SIMS.filter(s => (!from || new Date(s.date) >= from) && (!CSD.team || (s.team || teamOf(s.agent)) === CSD.team) && (!CSD.who || s.agent === CSD.who)).sort((a, b) => String(b.date).localeCompare(String(a.date))); };
const csDel = id => ask('Delete this practice call?', 'It is removed for everybody. This cannot be undone.', async () => { const r = await api('/api/simulations/' + id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete'), true); SIMS = SIMS.filter(x => x.id !== id); render(); toast('Deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const csRow = (s, open) => { const inds = s.inds || [], met = inds.filter(x => x.ok).length, tm = s.team || teamOf(s.agent);
  return `<section class="card cssess"><div class=row style="gap:12px;justify-content:flex-start;flex-wrap:wrap"><span class=csbadge style="--c:${csCol(s.score)}">${s.score}</span><div style="flex:1;min-width:200px"><b data-noi18n>${esc(tr(s.scenario))}</b><br><small class=mu><span data-noi18n>${esc(an(s.agent) || s.agent)}</span>${tm ? ` (${esc(tn(tm))})` : ''} · ${fdt(s.date)}</small></div>`
    + `<span class=cschips>${pill(s.mode === 'voice' ? '🎤 ' + tr('Voice') : '💬 ' + tr('Text'), 'mu')}${s.turns ? pill(csN(s.turns, 'turn'), 'mu') : ''}${pill(csTime(s.secs || (s.minutes || 1) * 60), 'mu')}${inds.length ? pill('✓ ' + met, 'ok') + pill('⚠ ' + (inds.length - met), 'wn') : ''}</span>`
    + `<span style="white-space:nowrap"><button class=ib onclick="CSD.open=CSD.open==='${s.id}'?null:'${s.id}';render()" aria-expanded="${open}">${tr(open ? 'Hide' : 'Details')}</button>${ME.role === 'admin' ? `<button class=ic title="${tr('Delete')}" aria-label="${tr('Delete')}" onclick="csDel('${s.id}')">${IC.bin}</button>` : ''}</span></div>${open ? `<div style="margin-top:12px">${csDetail(s)}</div>` : ''}</section>`; };
function csAgents(l) {
  const by = {}; l.forEach(s => { (by[s.agent] = by[s.agent] || []).push(s); });
  return Object.entries(by).map(([u, x]) => { const sc = x.map(s => s.score), last = x.slice(0, 3).map(s => s.score), prev = x.slice(3, 6).map(s => s.score);
    return { u, team: x[0].team || teamOf(u), n: x.length, avg: Math.round(avg(sc)), best: Math.max(...sc), pass: Math.round(x.filter(s => s.score >= CSPASS).length / x.length * 100), mins: x.reduce((a, s) => a + (s.secs ? s.secs / 60 : s.minutes || 0), 0), trend: prev.length ? Math.round(avg(last) - avg(prev)) : null }; })
    .sort((a, b) => b.avg - a.avg || b.n - a.n);
}
PG.simres = function () {
  const ag = ME.role === 'agent', l = csList(), tabs = [['over', 'Overview'], ['sess', 'Sessions'], ...(ag ? [] : [['ag', 'Agents']])]; if (ag && CSD.tab === 'ag') CSD.tab = 'over';
  const people = [...new Set(SIMS.map(s => s.agent))].filter(u => !CSD.team || (teamOf(u) === CSD.team)).sort((a, b) => (an(a) || a).localeCompare(an(b) || b));
  const bar = `<div class=row style="justify-content:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:14px"><div class=seg role=tablist>${CSPER.map(([k, n]) => `<button role=tab class="${CSD.per === k ? 'on' : ''}" aria-selected="${CSD.per === k}" onclick="CSD.per='${k}';render()">${tr(n)}</button>`).join('')}</div>`
    + (ag ? '' : `<select style="width:auto" aria-label="${tr('Team')}" onchange="CSD.team=this.value;CSD.who='';render()"><option value="">${tr('All teams')}</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${esc(t.id)}" ${CSD.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><select style="width:auto" aria-label="${tr('Agent')}" onchange="CSD.who=this.value;render()"><option value="">${tr('All agents')}</option>${people.map(u => `<option value="${esc(u)}" ${CSD.who === u ? 'selected' : ''}>${esc(an(u) || u)}</option>`).join('')}</select>`) + '</div>';
  const top = head('Q Trainer', ag ? 'Your practice calls and your progress.' : 'Train with practice customers and follow your progress.', `<div style="display:flex;gap:8px">${bellBtn()}<button class="btn ibx" onclick="CSM.step='home';goPage('sim')">${IC.plus} ${tr('New simulation')}</button></div>`)
    + `<div class="seg cstabs" role=tablist>${tabs.map(([k, n]) => `<button role=tab class="${CSD.tab === k ? 'on' : ''}" aria-selected="${CSD.tab === k}" onclick="CSD.tab='${k}';render()">${tr(n)}</button>`).join('')}</div>` + bar;
  if (!l.length) return top + `<div class=agem>${tr('No practice calls in this period.')} <a href="javascript:void(0)" class=agl onclick="CSM.step='home';goPage('sim')">${tr('Start a simulation ›')}</a></div>`;
  if (CSD.tab === 'sess') return top + `<p class=mu style="margin:0 0 10px">${csN(l.length, 'session')}</p>` + l.slice(0, 200).map(s => csRow(s, CSD.open === s.id)).join('');
  const A = csAgents(l);
  if (CSD.tab === 'ag') return top + card(`${tr('Agents')} <span class=bg>${A.length}</span> <small class=mu style="font-weight:400">${tr('ranked by average score')}</small>`, tbl(['#', 'Agent', 'Team', 'Sessions', 'Avg score', 'Best', 'Pass rate', 'Training time', 'Trend', ''],
    A.map((a, i) => [i + 1, `<b data-noi18n>${esc(an(a.u) || a.u)}</b>`, a.team ? esc(tn(a.team)) : '—', a.n, `<b class=mono style="color:${csCol(a.avg)}">${a.avg}</b>`, a.best, a.pass + '%', csHours(a.mins), a.trend == null ? '—' : a.trend > 0 ? `<span style="color:var(--ok)">↑ ${a.trend}</span>` : a.trend < 0 ? `<span style="color:var(--bad)">↓ ${-a.trend}</span>` : '→', `<button class=ib onclick="openAgent(${jsq(a.u)},'sim')">${tr('Profile')}</button>`])));
  // Overview
  const sc = l.map(s => s.score), mins = l.reduce((a, s) => a + (s.secs ? s.secs / 60 : s.minutes || 0), 0), av = Math.round(avg(sc));
  const kpi = (t, v, extra = '') => `<div class="card kt"><small class=ktt>${tr(t)}</small><div class=ktv>${v}</div>${extra}</div>`;
  const dist = [['Excellent (≥85)', sc.filter(v => v >= 85).length, 'ok'], ['Correct (65-84)', sc.filter(v => v >= 65 && v < 85).length, 'wn'], ['Needs work (<65)', sc.filter(v => v < 65).length, 'bad']];
  const scen = {}; l.forEach(s => { (scen[s.scenario] = scen[s.scenario] || []).push(s.score); });
  const withOut = l.filter(s => s.outcome), right = withOut.filter(s => s.right).length;
  return top + `<div class=csk>${kpi('Total sessions', l.length)}${kpi('Avg score', `<span style="color:${csCol(av)}">${av}</span><small>/100</small>`, `<div class=csbar><i style="width:${av}%;background:${csCol(av)}"></i></div>`)}${kpi('Best score', `${Math.max(...sc)}<small>/100</small>`)}${kpi('Total time', csHours(mins))}</div>`
    + `<div class="g g2" style="align-items:start">${card(`${tr('Score distribution')} <small class=mu style="font-weight:400">${tr('Pass mark')} ${CSPASS}%</small>`, dist.map(([n, v, c]) => `<div class=csdist><span>${tr(n)}</span><div class=csbar><i style="width:${Math.round(v / l.length * 100)}%;background:var(--${c})"></i></div><b class=mono>${v}</b></div>`).join(''))}`
    + card('At a glance', `<div class=csk2>${[['Pass rate', Math.round(sc.filter(v => v >= CSPASS).length / l.length * 100) + '%'], ['Right outcome', withOut.length ? Math.round(right / withOut.length * 100) + '%' : '—'], ['Scenarios run', Object.keys(scen).length], ['Agents', A.length]].map(([n, v]) => `<div><small class=mu>${tr(n)}</small><b class=mono>${v}</b></div>`).join('')}</div>`) + '</div>'
    + `<div class="g g2" style="align-items:start">${ag ? '' : card(`${tr('Top agents')} <small class=mu style="font-weight:400">${tr('Leaderboard')}</small>`, A.slice(0, 10).map((a, i) => `<div class=csrank><span class=mono>${i + 1}</span><div><b data-noi18n>${esc(an(a.u) || a.u)}</b><br><small class=mu>${a.team ? esc(tn(a.team)) : '—'} · ${csN(a.n, 'session')}</small></div><span><b class=mono style="color:${csCol(a.avg)}">${a.avg}</b> <small class=mu>${tr('avg')}</small></span><span><b class=mono>${a.best}</b> <small class=mu>${tr('best')}</small></span></div>`).join(''))}`
    + card(`${tr('Scenario stats')} <small class=mu style="font-weight:400">${tr('Usage & performance')}</small>`, Object.entries(scen).sort((a, b) => b[1].length - a[1].length).map(([n, v]) => `<div class=csrank><div style="grid-column:span 2"><b data-noi18n>${esc(tr(n))}</b><br><small class=mu>${csN(v.length, 'session')}</small></div><span><b class=mono style="color:${csCol(avg(v))}">${Math.round(avg(v))}</b> <small class=mu>${tr('avg')}</small></span><span><b class=mono>${Math.max(...v)}</b> <small class=mu>${tr('best')}</small></span></div>`).join('')) + '</div>'
    + card(`${tr('Recent sessions')} <a href="javascript:void(0)" class=agl style="margin-left:auto;font-weight:400" onclick="CSD.tab='sess';render()">${tr('Full history')} →</a>`, l.slice(0, 5).map(s => `<div class="csrank clk" onclick="SIMV='${s.id}';render()"><span class=csbadge style="--c:${csCol(s.score)}">${s.score}</span><div style="grid-column:span 3"><b data-noi18n>${esc(tr(s.scenario))}</b><br><small class=mu><span data-noi18n>${esc(an(s.agent) || s.agent)}</span> · ${fdt(s.date)} · ${csTime(s.secs || (s.minutes || 1) * 60)}${s.turns ? ' · ' + csN(s.turns, 'turn') : ''}</small></div></div>`).join(''));
};
// one practice call in a window (Recent sessions)
const SIMVM = () => { const s = SIMS.find(x => x.id === SIMV); if (!s) { SIMV = null; return ''; }
  return OVL(`<div class=mh><div><h2 data-noi18n>${esc(tr(s.scenario))}</h2><small><span data-noi18n>${esc(an(s.agent) || s.agent)}</span> · ${fdt(s.date)} · ${csTime(s.secs || (s.minutes || 1) * 60)}</small></div>${X('SIMV=null;render()')}</div><div class=mb><div class=row style="justify-content:flex-start;gap:12px;margin-bottom:10px">${csScore(s)}${s.score >= CSPASS ? pill('Passed', 'ok') : pill('Keep practising', 'wn')}</div>${csDetail(s)}</div>`, 'SIMV=null;render()', 760, 60); };

// ---------------------------------------------------------------- Scenarios (trainers and admins)
PG.simsc = function () {
  const all = [...(SCNS.custom || []).map(s => ({ ...s, own: 1 })), ...(SCNS.builtin || [])], segs = [...new Set(all.map(s => s.seg || 'Customer service'))];
  const cardOf = s => { const on = s.own ? s.active !== false : !s.off;
    return card(`<span style="flex:1"><span data-noi18n>${esc(s.name)}</span> <small class=mu style="font-weight:400" data-noi18n>· ${esc(s.who)}</small></span>${csLvl(s.level || 2)}`, `${s.brief ? `<p class=mu data-noi18n style="margin:0 0 8px">${esc(s.brief)}</p>` : ''}<div class=msg data-noi18n>${esc(s.open)}</div>`
      + `<p style="margin:8px 0 0"><small class=mu>${(s.lines || []).length} ${tr('written lines')} · ${(s.inds || []).length} ${tr('indicators')} · ${(s.outcomes || []).length} ${tr('outcomes')}</small></p>`
      + ((s.inds || []).length ? `<details><summary class=agl style="cursor:pointer">${tr('Indicators and outcomes')}</summary><ul class=csind>${s.inds.map(x => `<li>○ ${esc(tr(x.t))} <small class=mu data-noi18n>(${esc(x.kw.join(', '))})</small></li>`).join('')}</ul><ul class=csind>${(s.outcomes || []).map(o => `<li>${o === s.correct ? '✓' : '·'} <span data-noi18n>${esc(tr(o))}</span>${o === s.correct ? ` <small class=mu>${tr('the right outcome')}</small>` : ''}</li>`).join('')}</ul></details>` : '')
      + `<div class=row style="margin-top:10px;flex-wrap:wrap;gap:8px"><label class=rad><input type=checkbox class=switch ${on ? 'checked' : ''} onchange="scOnOff('${s.id}',${s.own ? 1 : 0},this.checked)"> <span>${tr('Agents can practise it')}</span></label><span style="display:flex;gap:6px">${s.own ? `<button class=ic title="${tr('Edit')}" aria-label="${tr('Edit')}" onclick="scEdit('${s.id}')">${IC.pen}</button><button class=ic title="${tr('Delete')}" aria-label="${tr('Delete')}" onclick="scDel('${s.id}')">${IC.bin}</button>` : ''}${on ? `<button class=ib onclick="aiSimGo('${s.id}')">${tr('Try it')}</button>` : ''}</span></div>`); };
  return head('Scenarios', 'The customers your agents practise with, by segment and level. Switch a scenario off to hide it, or write your own.', `<div style="display:flex;gap:8px">${bellBtn()}<button class="btn ibx" onclick="scNew()">${IC.plus} ${tr('New scenario')}</button></div>`)
    + `<div class="card tip" style="margin-bottom:14px">${tr(AIRP.on ? 'The AI plays the customer. The written lines are used when the AI customer is switched off.' : 'The customer follows the written lines. An admin can let the AI play the customer in Admin › Integrations (it needs the API key).')}</div>`
    + segs.map(g => `<h3 class=pgt data-noi18n>${esc(tr(g))}</h3><div class=g style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${all.filter(s => (s.seg || 'Customer service') === g).map(cardOf).join('')}</div>`).join('');
};
const SC_F = [{ k: 'name', l: 'Name', req: 1, ph: 'Refund request' }, { k: 'who', l: 'Who the customer is', ph: 'Disappointed customer' },
  { k: 'seg', l: 'Segment', ph: 'Customer service, Regular, VIP…' }, { k: 'level', l: 'Level', t: 'select', o: [['1', '1 · easy'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 · hard']] },
  { k: 'brief', l: 'The situation (what the AI customer knows and wants)', t: 'textarea', rows: 3, ph: 'You bought a subscription last week and want your money back. You calm down if the agent listens and offers a solution.' },
  { k: 'open', l: 'The first sentence of the customer', t: 'textarea', rows: 2, req: 1, ph: 'Hi, I want a refund for the subscription I bought last week.' },
  { k: 'lines', l: 'What the customer says next (one line per reply)', t: 'lines', rows: 4, hint: 'Used when the AI customer is switched off: after each reply of the agent, the next line.' },
  { k: 'inds', l: 'Indicators (one per line: what the agent should do: words that show it)', t: 'textarea', rows: 5, ph: 'Shows understanding: sorry, understand' },
  { k: 'outcomes', l: 'Outcomes (one per line, the right one first)', t: 'lines', rows: 4, hint: 'The agent sees them in a mixed order and chooses one at the end of the call.' },
  { k: 'cats', l: 'Scorecard categories it trains', t: 'multi', o: () => [...new Set(SCS.flatMap(s => (s.cats || []).map(c => c.n)))].map(n => [n, n]), hint: 'Agents below the pass mark in these categories are suggested this call.' }];
const scIndTxt = l => (l || []).map(x => x.t + ': ' + x.kw.join(', ')).join('\n');
const scIndOf = s => String(s || '').split('\n').map(x => { const i = x.indexOf(':'); return i < 0 ? null : { t: x.slice(0, i).trim(), kw: x.slice(i + 1).split(',').map(k => k.trim()).filter(Boolean) }; }).filter(x => x && x.t && x.kw.length);
const scSave = id => async d => { const outs = d.outcomes || [], b = { ...d, inds: scIndOf(d.inds), correct: outs[0] || '' };
  const r = await api('/api/ai/scenarios' + (id ? '/' + id : ''), b, id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save the scenario'); await load(); toast(id ? 'Scenario saved' : 'Scenario added'); };
const scNew = () => openForm({ title: 'New scenario', w: 680, yes: 'Add', d: { name: '', who: '', seg: '', level: '2', brief: '', open: '', lines: [], inds: '', outcomes: [], cats: [] }, fields: SC_F, save: scSave() });
const scEdit = id => { const s = SCNS.custom.find(x => x.id === id), outs = [s.correct, ...(s.outcomes || []).filter(o => o !== s.correct)].filter(Boolean);
  openForm({ title: 'Edit scenario', w: 680, d: { name: s.name, who: s.who, seg: s.seg || '', level: String(s.level || 2), brief: s.brief || '', open: s.open, lines: s.lines || [], inds: scIndTxt(s.inds), outcomes: outs, cats: s.cats || [] }, fields: SC_F, save: scSave(id) }); };
const scDel = id => ask('Delete this scenario?', 'Practice calls already made keep their results.', async () => { await api('/api/ai/scenarios/' + id, null, 'DELETE'); await load(); render(); toast('Scenario deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
async function scOnOff(id, own, on) { const r = await api('/api/ai/scenarios/' + id, own ? { active: on } : { off: !on }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); toast(on ? 'Agents can practise it' : 'Hidden from the agents'); }
