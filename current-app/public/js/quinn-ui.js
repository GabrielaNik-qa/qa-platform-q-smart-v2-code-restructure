// ===================== Quinn: the bubble on every page, and Admin › Quinn (Gabriela, 4 November) =====================
// The bubble asks /api/quinn/ask, which answers with the cheapest reliable method and says which (docs/plans/QUINN_HYBRID_PLAN.md).
// Suggested questions are predefined answers, so a click never needs AI. "Talk to a person" opens a Contact support request.
let QN = { open: false, msgs: [], sug: null, busy: false, fails: 0, page: '' }, QNA = null, QNT = { tab: 'use', test: '', role: 'agent', res: null };
const QN_SRC = { predefined: 'Predefined answer · no AI', help: 'Help Center · no AI', cache: 'Saved answer · no AI', human: 'No AI', 'ai-light': 'AI (Claude Haiku)', 'ai-advanced': 'AI (Claude Haiku)', none: '' };
// a suggested question as people read it: a capital letter and a question mark (then translated)
const qnQ = s => { s = String(s || '').replace(/\bi\b/g, 'I').replace(/\bq-smart\b/gi, 'Q-smart'); return s.charAt(0).toUpperCase() + s.slice(1) + (/[?.!]$/.test(s) ? '' : /^(how|where|what|who|can|why|do|is)\b/i.test(s) ? '?' : ''); };
const qnLogo = '<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="15.5" cy="15.5" r="10.5" fill="none" stroke="#fff" stroke-width="4.6"/><path d="M22 22l7.5 7.5" stroke="#FFD447" stroke-width="4.6" stroke-linecap="round"/></svg>';
// the bubble lives outside the page, so it keeps its conversation when you open another page
function qnMount() {
  let el = document.getElementById('qnb');
  if (!ME) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'qnb'; document.body.appendChild(el); }
  if (QN.open && QN.page !== route) { QN.page = route; QN.sug = null; }
  if (QN.open && !QN.sug) { QN.sug = []; api('/api/quinn/suggest?page=' + encodeURIComponent(route) + '&lang=' + I18N.lang).then(r => r.ok ? r.json() : { list: [] }).then(j => { QN.sug = j.list; qnDraw(); }); }
  qnDraw();
}
function qnDraw() {
  const el = document.getElementById('qnb'); if (!el) return;
  if (!QN.open) { el.innerHTML = `<button class=qnfab onclick="QN.open=true;qnMount()" aria-label="${esc(tr('Ask Quinn'))}" title="${esc(tr('Ask Quinn'))}">${qnLogo}</button>`; return; }
  const msg = m => { if (m.me) return `<div class="qnm me" data-noi18n>${esc(m.t)}</div>`; const r = m.r || {};
    const link = r.page && typeof canRoute === 'function' && canRoute(r.page) ? `<a class=agl href="#${esc(r.page)}" onclick="QN.open=true">${tr('Open the page')} ›</a>` : r.link ? `<a class=agl href="${esc(r.link)}" ${r.link.startsWith('/hc/') ? 'target=_blank rel=noopener' : ''}>${esc(r.title || tr('Open'))} ›</a>` : '';
    const sug = (r.suggest || []).length ? `<div class=qnchips>${r.suggest.map(s => s.intent ? `<button class=ib onclick="qnIntent('${esc(s.intent)}')">${esc(tr(qnQ(s.label)))}</button>` : `<a class=ib href="${esc(s.link)}" ${String(s.link).startsWith('/hc/') ? 'target=_blank rel=noopener' : ''}>${esc(s.label)}</a>`).join('')}</div>` : '';
    const text = r.type === 'none' ? tr(r.why === 'budget' ? 'The AI part of Quinn is paused until next month. Here is what I found:' : r.why === 'limit' ? 'You asked many questions this hour. Here is what I found:' : 'I am not sure I understood. Did you mean:') : m.t;
    return `<div class=qnm><div data-noi18n>${r.type === 'none' ? esc(text) : md(text)}</div>${link}${sug}`
      + `<div class=qnmeta>${QN_SRC[r.type] ? `<small>${tr(QN_SRC[r.type])}</small>` : ''}${r.type !== 'none' && r.type !== 'human' && !m.bad ? `<button class=qnno onclick="qnBad(${QN.msgs.indexOf(m)})">${tr('This did not help')}</button>` : ''}</div>`
      + (r.handover ? `<button class=btn style="margin-top:8px" onclick="qnHand()">${tr('Talk to a person')}</button>` : '') + '</div>'; };
  el.innerHTML = `<section class=qnp role=dialog aria-label="Quinn"><header><span class=qnav>${qnLogo}</span><div><b>Quinn</b><small>${tr('Your Q-smart assistant')}</small></div><button class=ic aria-label="${esc(tr('Close'))}" onclick="QN.open=false;qnDraw()">✕</button></header>`
    + `<div class=qnmsgs id=qnmsgs>${!QN.msgs.length ? `<div class=qnm>${tr('Hi! Ask me how to do something in Q-smart, or pick a question.')}</div>` : ''}${QN.msgs.map(msg).join('')}${QN.busy ? `<div class=qnm><i class=mu>${tr('Quinn is thinking…')}</i></div>` : ''}`
    + (!QN.msgs.length && (QN.sug || []).length ? `<div class=qnchips>${QN.sug.map(s => `<button class=ib onclick="qnIntent('${esc(s.id)}')">${esc(tr(qnQ(s.label)))}</button>`).join('')}</div>` : '') + '</div>'
    + `<div class=qnin><input id=qnq maxlength=500 placeholder="${esc(tr('Ask a question…'))}" aria-label="${esc(tr('Your question'))}" onkeydown="if(event.key==='Enter')qnAsk()" ${QN.busy ? 'disabled' : ''}><button class=btn onclick="qnAsk()" ${QN.busy ? 'disabled' : ''}>${tr('Send')}</button></div>`
    + `<footer><button class=agl onclick="qnHand()">${tr('Talk to a person')}</button></footer></section>`;
  const box = document.getElementById('qnmsgs'); if (box) box.scrollTop = box.scrollHeight;
  if (!QN.busy) { const i = document.getElementById('qnq'); if (i && document.activeElement !== i && QN.focus) { i.focus(); QN.focus = false; } }
}
async function qnSend(path, body, shown) {
  QN.msgs.push({ me: 1, t: shown }); QN.busy = true; qnDraw();
  const r = await api(path, body); QN.busy = false;
  const j = r.ok ? await r.json() : { type: 'none', why: 'error', suggest: [], handover: true };
  QN.msgs.push({ t: j.text || '', r: j }); if (j.type === 'none') QN.fails++;
  if (QN.fails >= 2 && !j.handover) j.handover = true;   // after two answers that did not help, Quinn offers a person
  QN.focus = true; qnDraw();
}
const qnAsk = () => { const i = document.getElementById('qnq'), q = i && i.value.trim(); if (!q || QN.busy) return; qnSend('/api/quinn/ask', { q, page: route }, q); };
const qnIntent = id => { const s = (QN.sug || []).find(x => x.id === id); qnSend('/api/quinn/intent/' + encodeURIComponent(id), { lang: I18N.lang }, s ? tr(qnQ(s.label)) : id); };
function qnBad(i) { const m = QN.msgs[i]; if (!m) return; m.bad = true; QN.fails++; const q = (QN.msgs[i - 1] || {}).t || '';
  api('/api/quinn/feedback', { q, type: (m.r || {}).type }); if (QN.fails >= 2) m.r.handover = true; qnDraw(); }
const qnHand = () => ask('Talk to a person?', 'Quinn sends your question and this conversation to the support team and your team lead. They answer in Contact support, and you get a notification.', async () => {
  const q = (QN.msgs.filter(m => m.me).pop() || {}).t || '', r = await api('/api/quinn/handover', { q, conv: QN.msgs.map(m => ({ me: !!m.me, t: m.t })) });
  if (!r.ok) return toast(await errOf(r, 'Could not send'), true); QN.msgs.push({ t: tr('Sent. A person will answer you in Contact support, and you get a notification.'), r: { type: 'human' } }); QN.fails = 0; qnDraw(); }, { yes: 'Yes, send it', no: 'Cancel' });

// ---------------------------------------------------------------- Admin › Quinn
const qnaSave = l => api('/api/quinn/intents', { intents: l }, 'PUT').then(async r => { if (!r.ok) return errOf(r, 'Could not save'); await load(); toast('Saved'); });
const QNF = [{ k: 'cat', l: 'Group', ph: 'Navigation, QA, Account…' }, { k: 'pg', l: 'Page it opens', t: 'select', o: () => hpPages() },
  { k: 'roles', l: 'Only for these roles (none = everybody)', t: 'multi', o: [['admin', 'Admin'], ['qa', 'QA Specialist'], ['lead', 'Team Lead'], ['trainer', 'Trainer'], ['agent', 'Agent']] },
  { t: 'h', l: 'English' }, { k: 'p_en', l: 'Ways people ask it (one per line)', t: 'lines', rows: 3 }, { k: 'k_en', l: 'Keywords and synonyms', t: 'chips' }, { k: 'a_en', l: 'Answer', t: 'textarea', rows: 3 },
  { t: 'h', l: 'Bulgarian' }, { k: 'p_bg', l: 'Ways people ask it (one per line)', t: 'lines', rows: 2 }, { k: 'k_bg', l: 'Keywords and synonyms', t: 'chips' }, { k: 'a_bg', l: 'Answer', t: 'textarea', rows: 3 },
  { t: 'h', l: 'French' }, { k: 'p_fr', l: 'Ways people ask it (one per line)', t: 'lines', rows: 2 }, { k: 'k_fr', l: 'Keywords and synonyms', t: 'chips' }, { k: 'a_fr', l: 'Answer', t: 'textarea', rows: 3 },
  { k: 'on', l: 'Quinn uses this answer', t: 'checkbox' }];
function qnaEdit(id, ask1) {
  const it = (QNA.intents.find(x => x.id === id)) || { id: '', cat: 'General', pg: '', roles: [], on: true, p: { en: ask1 ? [ask1] : [] }, k: {}, a: {} }, L = ['en', 'bg', 'fr'];
  const d = { cat: it.cat, pg: it.pg || '', roles: [...(it.roles || [])], on: it.on !== false }; L.forEach(l => { d['p_' + l] = [...((it.p || {})[l] || [])]; d['k_' + l] = [...((it.k || {})[l] || [])]; d['a_' + l] = (it.a || {})[l] || ''; });
  openForm({ title: id ? 'Change the answer' : 'New answer', w: 720, d, fields: QNF, save: d2 => { if (!(d2.a_en || d2.a_bg || d2.a_fr).trim()) return 'Write the answer in at least one language';
    const x = { ...it, id: it.id || 'own.' + Date.now().toString(36), cat: d2.cat, pg: d2.pg, roles: d2.roles, on: d2.on, p: {}, k: {}, a: {} }; L.forEach(l => { x.p[l] = d2['p_' + l]; x.k[l] = d2['k_' + l]; x.a[l] = d2['a_' + l]; });
    const l = id ? QNA.intents.map(y => y.id === id ? x : y) : [...QNA.intents, x]; return qnaSave(l); } });
}
const qnaOn = (id, on) => qnaSave(QNA.intents.map(x => x.id === id ? { ...x, on } : x)).then(() => render());
const qnaDel = id => ask('Delete this answer?', 'Quinn stops using it. Questions like it go to the Help Center search or the AI.', () => qnaSave(QNA.intents.filter(x => x.id !== id)).then(() => render()), { yes: 'Yes, delete', no: 'Cancel', danger: true });
const qnaTest = () => once('qnt', async () => { const q = ($('#qntq') || {}).value || ''; QNT.test = q; const r = await api('/api/quinn/test', { q, role: QNT.role }); QNT.res = r.ok ? await r.json() : { type: 'error', text: await errOf(r, 'Could not test') }; render(); });
const qnaSet = () => once('qns', async () => { const v = k => ($('#qns_' + k) || {}).value, b = { ai: !!($('#qns_ai') || {}).checked }; ['intent', 'help', 'cacheDays', 'handAfter', 'budget', 'perUser', 'maxTokens'].forEach(k => { b[k] = Number(v(k)); });
  const r = await api('/api/quinn/settings', b, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); toast('Saved'); });
PG.cs_quinn = function () {
  if (!QNA) return head('Quinn', '') + card('', `<p class=mu style="margin:0">${tr('Loading…')}</p>`);
  const S = QNA.settings, mo = new Date().toISOString().slice(0, 7), M = (QNA.stats.months || {})[mo] || {}, free = (M.predefined || 0) + (M.help || 0) + (M.cache || 0) + (M.human || 0), aiN = (M.ai_light || 0) + (M.ai_advanced || 0), tot = M.total || 0;
  const tabs = [['use', 'Usage and cost'], ['ans', 'Answers'], ['miss', 'Unanswered'], ['set', 'Settings'], ['test', 'Test']];
  const top = head('Quinn', 'Your assistant answers most questions without AI: predefined answers, the Help Center, saved answers. The AI (Claude Haiku) is used only when needed.', bellBtn())
    + `<div class="seg cstabs" role=tablist>${tabs.map(([k, n]) => `<button role=tab class="${QNT.tab === k ? 'on' : ''}" aria-selected="${QNT.tab === k}" onclick="QNT.tab='${k}';render()">${tr(n)}</button>`).join('')}</div>`;
  if (QNT.tab === 'ans') return top + `<div class=row style="justify-content:flex-end;margin-bottom:12px"><button class="btn ibx" onclick="qnaEdit()">${IC.plus} ${tr('New answer')}</button></div>`
    + card(`${tr('Predefined answers')} <span class=bg>${QNA.intents.length}</span>`, tbl(['Group', 'Asked like', 'Page', 'For', 'On', ''], QNA.intents.map(x => [esc(tr(x.cat)), `<span data-noi18n>${esc(((x.p || {}).en || [])[0] || x.id)}</span><br><small class=mu>${['en', 'bg', 'fr'].filter(l => (x.a || {})[l]).map(l => l.toUpperCase()).join(' · ')}</small>`, x.pg ? `<span class=mono>#${esc(x.pg)}</span>` : '—', (x.roles || []).length ? esc(x.roles.join(', ')) : tr('Everybody'),
      `<label class=rad><input type=checkbox class=switch ${x.on !== false ? 'checked' : ''} onchange="qnaOn('${esc(x.id)}',this.checked)" aria-label="${tr('On')}"></label>`, `<span style="white-space:nowrap"><button class=ic title="${tr('Change')}" aria-label="${tr('Change')}" onclick="qnaEdit('${esc(x.id)}')">${IC.pen}</button><button class=ic title="${tr('Delete')}" aria-label="${tr('Delete')}" onclick="qnaDel('${esc(x.id)}')">${IC.bin}</button></span>`])));
  if (QNT.tab === 'miss') return top + card(`${tr('Questions Quinn could not answer without AI')} <span class=bg>${QNA.misses.length}</span>`, QNA.misses.length ? tbl(['Question', 'What happened', 'When', ''], QNA.misses.slice(0, 100).map((m, i) => [`<span data-noi18n>${esc(m.q)}</span>`, esc(tr({ none: 'No answer', unhelpful: '"This did not help"', 'ai-light': 'Answered by AI', 'ai-advanced': 'Answered by AI' }[m.type] || m.type)) + (m.why ? ` <small class=mu>(${esc(m.why)})</small>` : ''), `<span class=mono>${fdt(m.at)}</span>`, `<button class=ib onclick="qnaEdit('',QNA.misses[${i}].q)">${tr('Make it an answer')}</button>`]))
    : `<p class=mu style="margin:0">${tr('Nothing yet.')}</p>`);
  if (QNT.tab === 'set') { const n = (k, l, step, hint) => `<label>${tr(l)}<input id=qns_${k} type=number step=${step} value="${S[k]}">${hint ? `<small class=mu>${tr(hint)}</small>` : ''}</label>`;
    return top + card('Settings', `<div class=form style="max-width:none"><div class="g g2">${n('intent', 'How sure a predefined answer must be (0.3 – 1)', 0.05, 'Below it, Quinn searches the Help Center.')}${n('help', 'How sure a Help Center answer must be (0.3 – 1)', 0.05, 'Below it, Quinn uses the AI.')}${n('budget', 'Monthly AI budget for Quinn (USD)', 1, 'When it is used up, Quinn keeps answering without AI and says so.')}${n('perUser', 'AI answers per person per hour', 1)}${n('maxTokens', 'Longest AI answer (tokens)', 50)}${n('cacheDays', 'Keep saved AI answers (days)', 1)}${n('handAfter', 'Offer a person after this many unhelpful answers', 1)}</div>`
      + `<label class=rad><input type=checkbox id=qns_ai ${S.ai ? 'checked' : ''}> <span>${tr('Quinn may use the AI when nothing else answers')}${QNA.ai ? '' : ' · ' + tr('the AI is not connected yet (Admin › Integrations)')}</span></label></div><div class=acts><button class=ib onclick="api('/api/quinn/cache',null,'DELETE').then(()=>load()).then(()=>{render();toast('Emptied')})">${tr('Empty the saved answers')} (${QNA.cache})</button><button class=btn onclick="qnaSet()">${tr('Save')}</button></div>`); }
  if (QNT.tab === 'test') { const r = QNT.res;
    return top + card('Test a question', `<div class=row style="gap:8px;flex-wrap:wrap"><input id=qntq style="flex:1;min-width:240px" placeholder="${esc(tr('Where are my reports?'))}" value="${esc(QNT.test)}" onkeydown="if(event.key==='Enter')qnaTest()"><select style="width:auto" onchange="QNT.role=this.value" aria-label="${tr('Role')}">${['agent', 'lead', 'qa', 'trainer', 'admin'].map(x => `<option ${QNT.role === x ? 'selected' : ''} value="${x}">${tr({ agent: 'Agent', lead: 'Team Lead', qa: 'QA Specialist', trainer: 'Trainer', admin: 'Admin' }[x])}</option>`).join('')}</select><button class=btn onclick="qnaTest()">${tr('Test')}</button></div>`
      + (r ? `<div class=card style="margin:12px 0 0"><p style="margin:0 0 6px">${pill(tr({ predefined: 'Predefined answer', help: 'Help Center', cache: 'Saved answer', human: 'Talk to a person', ai: 'Would use the AI', none: 'No answer' }[r.type] || r.type), ['ai', 'none'].includes(r.type) ? 'wn' : 'ok')} ${r.conf != null ? `<small class=mu>${tr('sure')}: ${Math.round(r.conf * 100)}%</small>` : ''} <small class=mu>${esc(r.lang || '')}</small></p>${r.text ? `<div data-noi18n>${md(r.text)}</div>` : ''}${(r.suggest || []).length ? `<small class=mu>${tr('Did you mean')}: ${r.suggest.map(s => esc(s.label)).join(' · ')}</small>` : ''}</div>` : '')
      + `<p class=mu style="margin:10px 0 0"><small>${tr('The test never calls the AI and is not counted.')}</small></p>`); }
  const lv = [['predefined', 'Predefined answers'], ['help', 'Help Center'], ['cache', 'Saved answers'], ['human', 'Talk to a person'], ['ai_light', 'AI, short'], ['ai_advanced', 'AI, longer'], ['none', 'No answer']];
  const nOf = v => (v && v.n) || (typeof v === 'number' ? v : 0), topQ = Object.entries(QNA.stats.top || {}).sort((a, b) => nOf(b[1]) - nOf(a[1])).slice(0, 10), users = Object.entries((QNA.stats.users || {})[mo] || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return top + `<div class=csk>${[['Questions this month', tot], ['Without AI', tot ? `${free} <small>(${Math.round(free / tot * 100)}%)</small>` : '0'], ['With AI', aiN], ['AI cost this month', `$${(M.usd || 0).toFixed(4)} <small>/ $${S.budget}</small>`]].map(([n, v]) => `<div class="card kt"><small class=ktt>${tr(n)}</small><div class=ktv>${v}</div></div>`).join('')}</div>`
    + `<div class="g g2" style="align-items:start">${card('How Quinn answered', lv.map(([k, n]) => { const v = M[k] || 0; return `<div class=csdist><span>${tr(n)}</span><div class=csbar><i style="width:${tot ? Math.round(v / tot * 100) : 0}%;background:${k.startsWith('ai') ? 'var(--wn)' : k === 'none' ? 'var(--bad)' : 'var(--ok)'}"></i></div><b class=mono>${v}</b></div>`; }).join('')
      + `<p class=mu style="margin:10px 0 0"><small>${tr('Tokens')}: ${M.tin || 0} ${tr('in')} · ${M.tout || 0} ${tr('out')} · ${tr('Unhelpful')}: ${M.unhelpful || 0} · ${tr('Sent to a person')}: ${M.handover || 0}</small></p>`)}`
    + card('Most asked', topQ.length ? `<ol style="margin:0;padding-left:18px">${topQ.map(([k, v]) => `<li data-noi18n>${esc((v && v.q) || k)} <small class=mu>× ${nOf(v)}</small></li>`).join('')}</ol>` : `<p class=mu style="margin:0">${tr('Nothing yet.')}</p>`) + '</div>'
    + card('Who asks most this month', users.length ? tbl(['Person', 'Questions'], users.map(([u, n]) => [esc(an(u) || u), n])) : `<p class=mu style="margin:0">${tr('Nothing yet.')}</p>`);
};
