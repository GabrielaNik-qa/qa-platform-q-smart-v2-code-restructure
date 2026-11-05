// ===================== QA Entry form (new review and edit review) =====================
// ch = the type of conversation (call, chat, email, other). Any scorecard can score any type; a new form starts with the first scorecard
// tagged with that type (e.g. "Chats"), otherwise the first one
const tagIs = (t, w) => String(t).toLowerCase().replace(/s$/, '') === String(w).toLowerCase().replace(/s$/, '');
const ent0 = (id, ch = 'call') => {
  const s = SCS.find(x => x.id === id) || SCS.find(x => scTags(x).some(t => tagIs(t, CHP[ch]))) || SCS[0];
  return { ch, scid: s.id, scn: s.name, team: '', agent: '', id: '', dt: '', lk: '', rl: '', cl: '', tx: '', subj: '', chn: '', cp: '', cm: '', fl: '',
    cats: s.cats.map(c => ({ n: c.n, k: !!c.k, it: c.it.map(i => ({ t: i.t, p: i.p, k: !!i.k, cp: !!i.cp, a: 'y', cm: '', rc: '' })) })) };
};
const newEnt = (id, ch) => { ENT = ent0(id, ch || (ENT && ENT.ch) || 'call'); ENT.t0 = Date.now(); ENT0 = JSON.stringify(ENT); EDITID = ''; };   // t0: when the review started (its review time)
// switching the type keeps what was typed and the chosen scorecard (scorecards are never limited to one type)
function setCh(ch) { if (ENT.ch === ch) return; ENT.ch = ch; render(); }
const entDirty = () => !!ENT && JSON.stringify(ENT) !== ENT0;

// the same rules as the server:  N/A is left out of the possible points;
// critical item = No -> its category scores 0;  critical category = any No -> the whole review is 0%
// the score of answered categories (also used by Tools › Score simulator)
const scoreCats = cats => {
  let zero = false;
  const cs = cats.map(c => {
    let e = 0, m = 0, cf = false, no = false;
    c.it.forEach(i => { if (i.a !== 'na') { m += i.p; if (i.a === 'y') e += i.p; } if (i.a === 'n') { no = true; if (i.k) cf = true; } });
    if (cf) e = 0; if (c.k && no) zero = true;
    return { n: c.n, e, m, z: cf };
  });
  if (zero) cs.forEach(c => { c.e = 0; c.z = true; });
  const E = cs.reduce((a, c) => a + c.e, 0), M = cs.reduce((a, c) => a + c.m, 0);
  return { cs, zero, ns: !zero && !M, pc: zero ? 0 : (M ? E / M * 100 : 0) };   // ns: every question N/A = not scored (decision 14)
};
const entS = () => scoreCats(ENT.cats);
const PV = () => {
  const s = entS(), pc = s.pc, thr = ENT.team ? PT(ENT.team) : PASSG(), ok = pc >= thr, C = 326.7;
  const clr = ok ? 'var(--ok)' : pc >= Math.min(70, thr) ? 'var(--wn)' : 'var(--bad)';
  const fb = (k, l) => `<button class="${ENT.fl === k ? 'on' : ''}" aria-pressed="${ENT.fl === k}" onclick="setFl('${k}')"><span class="${k ? 'f' : ''}" style="display:flex;color:${k === 'red' ? 'var(--bad)' : k === 'green' ? 'var(--ok)' : 'var(--mu)'}">${IC.flag}</span>${l}</button>`;
  return `<div class="card rp-c"><small class=cap>Current score preview</small><div class=ring><svg viewBox="0 0 124 124" width="124" height="124" role="img" aria-label="Score ${pc.toFixed(1)} percent"><circle cx="62" cy="62" r="52" fill="none" style="stroke:var(--sunk)" stroke-width="10"/><circle cx="62" cy="62" r="52" fill="none" style="stroke:${clr}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(pc * C / 100).toFixed(1)} ${C}" transform="rotate(-90 62 62)"/></svg><div class=rv><div><b class=mono>${pc.toFixed(1)}</b><small>%</small></div></div></div>
<div>${s.ns ? pill('Not scored: every question is N/A', 'wn') : s.zero ? pill('Critical failure: score set to 0%', 'bad') : ok ? pill(`✓ Passing (≥ ${thr}%)`, 'ok') : pill(`Below target (< ${thr}%)`, pc >= Math.min(70, thr) ? 'wn' : 'bad')}</div><hr><small class=cap style="text-align:left">Flag</small><div class=fgs role=group aria-label="Flag">${fb('', 'Blank')}${fb('green', 'Green')}${fb('red', 'Red')}</div>
<button class=sbtn2 onclick="subE()" ${BUSY.ent ? 'disabled' : ''}>${BUSY.ent ? 'Saving…' : EDITID ? 'Save changes' : 'Submit QA review'}</button>${EDITID ? `<button class=ib style="width:100%;margin-top:10px" onclick="cancelE()">Cancel</button>` : ''}</div>
<div class=card><small class=cap>Categories</small>${s.cs.map(c => `<div class=row style="font-size:13.5px;margin-top:10px"><span>${esc(c.n)}</span><b class=mono ${c.z ? 'style="color:var(--bad)"' : ''}>${c.e}/${c.m}</b></div>`).join('')}</div>`;
};
const AGO = () => !ENT.team ? '<option value="">Select a team first</option>' : '<option value="">Select an agent</option>' + AGENTS().filter(a => a.team === ENT.team).map(a => `<option value="${esc(a.username)}" ${ENT.agent === a.username ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
const pvu = () => { $('#pv').innerHTML = PV(); entS().cs.forEach((c, ci) => { const x = $('#sh' + ci); if (x) { x.textContent = c.e + ' / ' + c.m; x.style.color = c.z ? 'var(--bad)' : ''; } }); };
const setA = (ci, ii, v) => { const it = ENT.cats[ci].it[ii]; it.a = v; if (v !== 'n') it.rc = ''; const row = $('#r' + ci + '_' + ii); row.querySelectorAll('.yn button').forEach(b => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', b.dataset.v === v); }); const s = row.querySelector('.rcs'); if (s) { s.classList.toggle('hide', v !== 'n'); if (v !== 'n') s.value = ''; } pvu(); };
const setFl = v => { ENT.fl = v; pvu(); };
// the scoring rules, as a tip the reviewer can switch off ("Don't show me this again")
const ENTRY_TIP = () => howTo('scoring', '<ul><li><b>Yes</b> earns the points of the item, <b>No</b> earns nothing and <b>N/A</b> (not applicable) is left out, so it never lowers the score.</li><li>A <b>critical item</b> answered No sets its whole category to 0 points.</li><li>A <b>critical category</b> with any No sets the whole review to 0%.</li><li>A review passes when it reaches the pass rate of the agent\'s team (System settings). The preview on the right follows every answer.</li><li>When you answer No you can pick a <b>root cause</b>: Category Stats shows which causes come up most.</li></ul>', 'tip.entry');
const setSc = id => { const keep = ['ch', 'team', 'agent', 'id', 'dt', 'lk', 'cp', 'cm', 'fl', 'cl', 'tx', 'subj', 'chn'].reduce((o, k) => (o[k] = ENT[k], o), {}); newEnt(id); Object.assign(ENT, keep); ENT0 = JSON.stringify(ENT); render(); };
const setTm = v => { ENT.team = v; ENT.agent = ''; const a = $('#eag'); a.innerHTML = AGO(); a.disabled = !v; pvu(); };

PG.entry = function () {
  if (!SCS.length) return head('QA Entry Form', 'Enter QA scores for calls, chats and emails') + card('', ME.role === 'admin' ? '<p class=mu>There is no scorecard yet. Create one in Scorecards first.</p>'
    : '<p class=mu>You do not have a scorecard to use yet. You only see the scorecards of your workspace: ask an administrator to add you to a workspace (Admin &gt; Workspaces).</p>');   // non-admins only see their workspace's scorecards
  if (!ENT || (!EDITID && !SCS.some(x => x.id === ENT.scid))) newEnt();
  const ed = EDITID, s = SCS.find(x => x.id === ENT.scid), S = entS(), L = (t, r) => t + (r ? ' <i class=rq>*</i>' : ' <span class=mu>(optional)</span>'), ch = ENT.ch || 'call';
  const opt = x => `<option value="${esc(x.id)}" ${x.id === ENT.scid ? 'selected' : ''}>${esc(x.name)}${scTags(x).length ? ' · ' + esc(scTags(x).join(', ')) : ''}</option>`;
  return head(ed ? 'Edit QA Review' : 'QA Entry Form', ed ? 'Update the answers and save your changes' : 'Enter QA scores for calls, chats, emails and other conversations',
    `<div style="display:flex;gap:8px;flex-wrap:wrap">${ed ? `<button class=ib onclick="cancelE()">Cancel</button>` : ''}<div class=sx style="width:290px"><span>${IC.search}</span><input class=qi style="padding-right:64px" placeholder="Search lead ID, agent, campaign…" value="${esc(Q)}" oninput="sq(this)" onkeydown='if(event.key=="Enter"&&!document.getElementById("tb")){KQ=true;location.hash="calls"}'><kbd class=kb>Ctrl K</kbd></div>${bellBtn()}</div>`)
    + ENTRY_TIP() + `<div class=eg><div>` + card(`${CHN[ch]} Information`, `<label>${L('Review type', 1)}<div class=chseg>${CHS.map(k => `<button type=button class="${ch === k ? 'on' : ''}" style="--c:${CHC[k]}" onclick="setCh('${k}')">${IC['ch_' + k]} ${CHN[k]}</button>`).join('')}</div></label><label>${L('Select Scorecard', 1)}<select ${ed ? 'disabled' : ''} onchange="setSc(this.value)">${s ? '' : `<option>${esc(ENT.scn || '')}</option>`}${SCS.map(opt).join('')}</select></label><small class=mu>${esc(s ? s.desc : '')}</small><hr><div class=eg2>`
      + `<label>${L('Team', 1)}<select id=etm onchange="setTm(this.value)"><option value="">Select a team</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${t.id}" ${ENT.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`
      + `<label>${L('Agent', 1)}<select id=eag ${!ENT.team ? 'disabled' : ''} onchange="ENT.agent=this.value">${AGO()}</select></label>`
      + `<label>${L('Lead ID', 1)}<input id=eid placeholder="Enter lead ID (any characters)" maxlength=60 value="${esc(ENT.id)}" oninput="ENT.id=this.value;if(crmLink('x')&&(!ENT.lk||ENT.lkAuto)){ENT.lk=crmLink(this.value);ENT.lkAuto=1;const c=$('#elk');if(c)c.value=ENT.lk}"></label>`
      + `<label>${L(ch === 'other' ? 'Date' : CHN[ch] + ' Date', 1)}<input id=edt type=date value="${ENT.dt}" oninput="ENT.dt=this.value"></label>`
      + `<label>${L('CRM Link')}<input id=elk placeholder="${crmLink('x') ? 'Filled in from the lead ID' : 'https://…'}" value="${esc(ENT.lk)}" oninput="ENT.lk=this.value;ENT.lkAuto=0"></label>`
      + (ch === 'call' ? `<label>${L('Recording Link')}<input placeholder="https://…" value="${esc(ENT.rl)}" oninput="ENT.rl=this.value"></label>` : ch === 'email' ? `<label>${L('Email subject')}<input placeholder="Subject of the email" value="${esc(ENT.subj)}" oninput="ENT.subj=this.value"></label>` : ch === 'other' ? `<label>${L('Channel', 1)}<input placeholder="e.g. WhatsApp, Instagram, SMS" value="${esc(ENT.chn)}" oninput="ENT.chn=this.value"></label>` : `<label>${L('Chat Link')}<input placeholder="https://…" value="${esc(ENT.cl)}" oninput="ENT.cl=this.value"></label>`)
      + `<label>${L('Campaign')}<input id=ecp placeholder="Enter campaign name" value="${esc(ENT.cp)}" oninput="ENT.cp=this.value"></label>`
      + (ch === 'email' ? `<label>${L('Email Link')}<input placeholder="https://…" value="${esc(ENT.cl)}" oninput="ENT.cl=this.value"></label>` : ch === 'other' ? `<label>${L('Conversation Link')}<input placeholder="https://…" value="${esc(ENT.cl)}" oninput="ENT.cl=this.value"></label>` : '')
      + (ch !== 'call' ? `</div><label style="margin-top:12px">${L(ch === 'chat' ? 'Chat transcript' : ch === 'email' ? 'Email content' : 'Conversation text')}<textarea rows=6 placeholder="${ch === 'chat' ? 'Paste the chat here (agent and customer messages)…' : ch === 'email' ? 'Paste the email thread here…' : 'Paste the conversation here…'}" oninput="ENT.tx=this.value">${esc(ENT.tx)}</textarea><small class=mu>The agent sees it in the review, so the score is easy to understand.</small></label><div>` : `<label>${L(ed && ENT.rec && !ENT.recDel ? 'Replace recording file' : 'Recording file')}<input id=ef type=file accept="audio/*">${ed && ENT.rec ? (ENT.recDel ? `<small class=mu>The recording will be removed when you save. <a href="javascript:void(0)" style="color:var(--ac)" onclick="ENT.recDel=false;render()">Undo</a></small>` : `<small class=mu style="display:flex;gap:8px;align-items:center">${IC.play} Current file: ${esc(ENT.rec)} <a href="javascript:void(0)" style="color:var(--bad)" onclick="ENT.recDel=true;render()">Remove</a></small>`) : ''}</label>`) + `</div>`)
    + ENT.cats.map((c, ci) => card('', `<div class=row><h3 style="margin:0">${esc(c.n)}${c.k ? '<span class=crit title="If any item in this category is answered No, the whole review scores 0%">Critical category</span>' : ''}</h3><b class=mono id=sh${ci} ${S.cs[ci].z ? 'style="color:var(--bad)"' : ''}>${S.cs[ci].e} / ${S.cs[ci].m}</b></div>` + c.it.map((i, ii) => `<div class=ir id=r${ci}_${ii}><div class=row style="gap:16px;align-items:center"><span>${esc(i.t)}${i.k ? '<span class=crit title="If answered No, this category scores 0 points">Critical</span>' : ''}${i.cp ? '<span class="crit cpb" title="Compliance item — followed on the Compliance page">Compliance</span>' : ''}</span><div style="display:flex;align-items:center;gap:12px;flex:none"><small class=mono>${i.p} pts</small><div class=yn role=group aria-label="Answer">${[['y', 'Yes'], ['n', 'No'], ['na', 'N/A']].map(([v, l]) => `<button class="${v} ${i.a === v ? 'on' : ''}" data-v=${v} aria-pressed="${i.a === v}" onclick="setA(${ci},${ii},'${v}')">${l}</button>`).join('')}</div></div></div><select class="rcs ${i.a === 'n' ? '' : 'hide'}" onchange="ENT.cats[${ci}].it[${ii}].rc=this.value"><option value="">Root cause: why was this answered No? (optional)</option>${RCS.filter(x => x.active !== false || x.name === i.rc).map(x => `<option ${i.rc === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><textarea rows=1 placeholder="Add a comment for this item (optional)…" oninput="ENT.cats[${ci}].it[${ii}].cm=this.value">${esc(i.cm)}</textarea></div>`).join(''))).join('')
    + card('', `<label>General Comments <span class=mu>(optional)</span><textarea rows=4 placeholder="Enter any additional comments or observations…" oninput="ENT.cm=this.value">${esc(ENT.cm)}</textarea></label>`)
    + `</div><div class=rp><div id=pv>${PV()}</div></div></div>`;
};

function edE(rid) {
  const e = EVA.find(x => x.rid === rid); if (!e) return false;
  MD = null; EDITID = rid;
  ENT = { ch: chOf(e), cl: e.cl || '', tx: e.tx || '', subj: e.subj || '', chn: e.chn || '', scid: e.scid || '', scn: e.scn || '', team: e.tm || teamOf(e.agent), agent: e.agent, id: String(e.id), dt: iso(e.d), lk: e.lk || '', rl: e.rl || '', cp: e.cp || '', cm: e.cm || '', fl: e.fl || '', rec: e.rec || '', recDel: false,
    cats: e.cs.map(c => ({ n: c.n, k: !!c.k, it: c.it.map(i => ({ t: i.t, p: i.p, k: !!i.k, cp: !!i.cp, a: i.a, cm: i.cm || '', rc: i.rc || '' })) })) };
  ENT0 = JSON.stringify(ENT);
  if (location.hash === '#entry') render(); else location.hash = 'entry';
  return false;
}
function cancelE() {
  const out = () => { ENT = null; EDITID = ''; location.hash = 'calls'; };
  if (entDirty()) ask('Cancel editing?', 'You have unsaved changes. If you leave now they will be lost. Are you sure?', out, { yes: 'Yes, discard changes', no: 'No, keep editing' }); else out();
}
function subE() {
  const E = ENT;
  if (!E.team) return toast('Select a team', true);
  if (!E.agent) return toast('Select an agent', true);
  if (!E.id.trim()) return toast('Enter the lead ID', true);
  if (!E.dt) return toast('Select the date', true);
  if (E.ch === 'other' && !String(E.chn || '').trim()) return toast('Write which channel it was (e.g. WhatsApp)', true);
  if (EDITID) return ask('Change this score?', 'Are you sure you want to save these changes? The answers and the score of this review will be updated.', saveE, { yes: 'Yes, save changes', no: 'No, keep editing' });
  saveE();
}
// saving runs once at a time: a double click on "Submit" used to create the same review twice
const saveE = () => once('ent', async () => {
  pvu();                                                         // the button now says "Saving…" and cannot be clicked again
  const E = ENT, a = E.cats.map(c => c.it.map(i => [i.a, i.cm, i.rc])), fl = E.ch === 'call' && $('#ef') && $('#ef').files[0];
  const body = { scid: E.scid, ch: E.ch || 'call', agent: E.agent, id: E.id.trim(), dt: E.dt, lk: E.lk, rl: E.rl, cl: E.cl, tx: E.tx, subj: E.subj, chn: E.chn, cp: E.cp, cm: E.cm, fl: E.fl, a, ...(EDITID || !E.t0 ? {} : { rt: Math.round((Date.now() - E.t0) / 1000) }) };
  const r = EDITID ? await api('/api/evaluations/' + EDITID, body, 'PUT') : await api('/api/evaluations', body);
  if (!r.ok) { if (r.status === 401) return; return toast(await errOf(r, r.status === 403 ? 'Your role cannot add evaluations' : 'Could not save the review'), true); }
  const ev = await r.json();
  if (!fl && EDITID && (E.recDel || (E.ch !== 'call' && E.rec))) await api('/api/evaluations/' + ev.rid + '/recording', null, 'DELETE');
  if (fl) { let up = false; try { up = (await fetch('/api/evaluations/' + ev.rid + '/recording?ext=' + encodeURIComponent((fl.name.split('.').pop() || '').toLowerCase()), { method: 'POST', headers: { 'Content-Type': fl.type || 'application/octet-stream' }, body: fl })).ok; } catch (e) { /* reported below */ } if (!up) toast('The review was saved, but the recording was not accepted (use mp3, wav, m4a, ogg or webm).', true); }
  beep(); await load();
  if (EDITID) { ENT = null; EDITID = ''; location.hash = 'calls'; render(); toast('Changes saved'); return; }
  newEnt(E.scid); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Review saved. You can enter the next one.');   // stay on the form, ready for the next review
}).finally(() => { if (ENT && $('#pv')) pvu(); });
