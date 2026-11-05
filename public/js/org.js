// ===================== Admin › Organization, and the Q-Intelligence panel =====================
// Organization (admins): the company profile, data protection (how long each kind of data is kept before it is deleted by itself;
// a person's data downloaded on request; what agents may see), sign-in rules, and business words (call types, topics tracked in
// conversations, custom vocabulary that fixes misspelled words in transcripts).
// Q-Intelligence (staff): Ask Quinn (questions about your teams' quality), AI agents run on one review or one agent, AI insights
// (objections, competitors, product feedback in what customers and reviewers wrote; topics are counted without the AI), and the
// knowledge files the AI reads with every answer. It needs the AI connected in Admin › Integrations (your API key).
let QI = { know: [], ins: [], top: null, ask: [], busy: false, out: null, kind: 'summary', rid: '', ag: '', days: 30, team: '', per: '30' };
const orgSave = async (body, msg) => { const r = await api('/api/org', body, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); SET = await r.json(); render(); toast(msg || 'Saved'); };
const ofld = (k, l, v, ph = '', t = 'text') => `<label>${tr(l)}<input id="of-${k}" type=${t} value="${esc(v || '')}" placeholder="${esc(ph)}"></label>`;
const oval = k => ($('#of-' + k) || {}).value || '';
const onlyAdmin = () => ME.role === 'admin' ? '' : card('', `<p class=mu style="margin:0">${tr('Only admins can see this page.')}</p>`);

// ---- Company: who the platform belongs to (on invoices, exports and the privacy contact)
PG.org = function () {
  const o = (SET.org || {}), k = ['name', 'legal', 'address', 'city', 'country', 'vat', 'web', 'billing', 'support', 'dpo', 'dpoEmail', 'tz', 'logo'];
  return head('Company', 'Who the platform belongs to: shown on exports and reports, and the contact for questions about personal data', bellBtn()) + (onlyAdmin() || `<div class="g g2">`
    + card('Company profile', `<div class=form style="max-width:none">${ofld('name', 'Company name', o.name, 'Your Company Ltd')}${ofld('legal', 'Legal name', o.legal)}${ofld('address', 'Address', o.address)}${ofld('city', 'City', o.city)}${ofld('country', 'Country', o.country)}${ofld('vat', 'VAT number', o.vat)}${ofld('web', 'Website', o.web, 'https://')}${ofld('logo', 'Logo (link starting with https://)', o.logo)}</div>`)
    + card('Contacts', `<div class=form style="max-width:none">${ofld('billing', 'Billing email', o.billing, '', 'email')}${ofld('support', 'Support email', o.support, '', 'email')}${ofld('dpo', 'Data protection officer (DPO)', o.dpo)}${ofld('dpoEmail', 'DPO email', o.dpoEmail, 'privacy@…', 'email')}${ofld('tz', 'Time zone', o.tz || Intl.DateTimeFormat().resolvedOptions().timeZone)}</div><small class=mu>${tr('The DPO is the person employees and customers write to about their personal data (GDPR).')}</small>`)
    + `</div><div class=row style="justify-content:flex-end"><button class=btn onclick="orgSave({org:Object.fromEntries(${esc(JSON.stringify(k))}.map(x=>[x,oval(x)]))},'Company saved')">${tr('Save')}</button></div>`);
};

// ---- Data protection: how long data is kept, what agents may see, a person's data on request
const TXDAYS = [[0, 'Keep for ever'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [60, '60 days'], [90, '90 days'], [180, '180 days'], [365, '1 year']];
const KEEPN = [['rec', 'Call recordings', 'The audio files attached to reviews'], ['notif', 'Notifications', 'The messages in the bell'], ['sim', 'Practice call conversations', 'The text of AI Simulator practice calls (the scores stay)'], ['ai', 'AI drafts and reports', 'AI review drafts, team summaries, coaching plans and analyst reports'], ['audit', 'Audit log', 'Who changed what']];
PG.privacy = function () {
  const p = SET.privacy || {}, kp = p.keep || {}, last = p.last;
  const row = ([k, n, d]) => `<div class="row li" style="gap:12px;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>${tr(n)}</b><br><small class=mu>${tr(d)}</small></span><select id="pk-${k}" style="width:auto">${[[0, 'Keep for ever'], [1, '1 month'], [3, '3 months'], [6, '6 months'], [12, '12 months'], [24, '24 months'], [36, '36 months'], [60, '5 years']].map(([v, l]) => `<option value=${v} ${(kp[k] || 0) === v ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select></div>`;
  const save2 = `orgSave({privacy:{keep:Object.fromEntries(${esc(JSON.stringify(KEEPN.map(x => x[0])))}.map(k=>[k,+$('#pk-'+k).value])),agentsRec:$('#pv-rec').checked,agentsReviewer:$('#pv-rv').checked,note:$('#pv-note').value,txDays:+$('#pk-txd').value}},'Data protection saved')`;
  return head('Data protection', 'How long each kind of data is kept, what agents may see, and a person\'s data on request (GDPR)', bellBtn()) + (onlyAdmin()
    || card('How long data is kept', `<p class=mu style="margin:0 0 8px">${tr('GDPR: keep personal data only as long as it is needed. Many companies keep call recordings 6 to 12 months. Older data of the chosen kind is deleted by itself every 12 hours; "Keep for ever" deletes nothing.')}</p>${`<div class="row li" style="gap:12px;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>${tr('Transcripts')}</b><br><small class=mu>${tr('The text of chats, e-mails and imported conversations. After these days only the text is deleted: the review, its scores, the comments and the link to the conversation in your dialer stay.')}</small></span><select id=pk-txd style="width:auto">${TXDAYS.map(([v, l]) => `<option value=${v} ${(p.txDays || 0) === v ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select></div>`}${KEEPN.map(row).join('')}<p class=mu style="margin:10px 0 0">${tr('Reviews, scores, tasks and one-to-ones are your quality history and are always kept.')}</p>${last ? `<small class=mu>${tr('Last clean-up')}: ${fdt(last.at)} · ${[...KEEPN, ['tx', 'Transcripts']].map(([k, n]) => last[k] ? `${tr(n)}: ${last[k]}` : '').filter(Boolean).join(' · ') || tr('nothing was old enough')}</small>` : ''}`)
    + card('What agents may see', `<label class=rad><input id=pv-rec type=checkbox ${p.agentsRec !== false ? 'checked' : ''}> <span>${tr('Agents can listen to the recordings of their own reviewed calls')}</span></label><label class=rad><input id=pv-rv type=checkbox ${p.agentsReviewer !== false ? 'checked' : ''}> <span>${tr('Agents see the name of the person who reviewed them')}</span></label><label style="margin-top:8px">${tr('Privacy note shown to everybody at sign-in (optional)')}<textarea id=pv-note rows=3>${esc(p.note || '')}</textarea></label>`)
    + `<div class=row style="justify-content:flex-end;gap:8px"><button class=ib onclick="orgPurge()">${tr('Clean up now')}</button><button class=btn onclick="${save2}">${tr('Save')}</button></div>`
    + card('A person\'s data', `<p class=mu style="margin:0 0 8px">${tr('Everybody may ask which data you keep about them. Choose the person to download it in one file (account, reviews, tasks, one-to-ones, attendance, time off, surveys, notifications).')}</p><div class=row style="gap:8px;justify-content:flex-start"><select id=pv-u style="width:auto"><option value="">${tr('Choose the person…')}</option>${ROSTER.filter(r => r.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map(r => `<option value="${esc(r.username)}">${esc(r.name)}</option>`).join('')}</select><button class=ib onclick="const u=$('#pv-u').value;if(!u)return toast('Choose the person',true);location.href='/api/org/person/'+encodeURIComponent(u)">${IC.dl} ${tr('Download their data')}</button></div>`));
};
const orgPurge = () => ask('Clean up now?', 'Data older than the months you chose is deleted for good. Save your choices first.', async () => { const r = await api('/api/org/purge', {}); if (!r.ok) return toast(await errOf(r, 'Could not clean up'), true); const j = await r.json(); await load(); render(); toast(tr(`Deleted: ${Object.values(j).reduce((a, b) => a + b, 0)} items`)); }, { yes: 'Yes, clean up', no: 'Cancel', danger: true });

// ---- Sign-in rules
PG.signin = function () {
  const g = SET.signin || {};
  return head('Sign-in', 'How strong passwords must be, and when an account is locked after wrong passwords', bellBtn()) + (onlyAdmin()
    || card('Passwords', `<div class=form style="max-width:420px"><label>${tr('Minimum length')}<select id=sg-min style="width:auto">${[8, 10, 12, 14, 16].map(n => `<option ${(g.pwMin || 10) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>${tr('Lock the account for 15 minutes after this many wrong passwords')}<select id=sg-lock style="width:auto">${[3, 5, 10].map(n => `<option ${(g.lockAfter || 10) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label class=rad><input type=checkbox id=sg-reg ${g.openReg ? 'checked' : ''}> <span>${tr('Anybody may ask for an account on the sign-in page (an admin approves it). Off: accounts only by invitation.')}</span></label></div><p class=mu style="margin:8px 0 0">${tr('Passwords also need upper and lower case letters, a number and a special character. New rules apply the next time someone chooses a password.')}</p><p class=mu style="margin:6px 0 0">${tr('Sign-in with Google or Microsoft (single sign-on) can be added with Integrations later.')}</p><div class=row style="justify-content:flex-end;margin-top:10px"><button class=btn onclick="orgSave({signin:{openReg:$('#sg-reg').checked,pwMin:$('#sg-min').value,lockAfter:$('#sg-lock').value}},'Sign-in rules saved')">${tr('Save')}</button></div>`));
};

// ---- Business words: call types, topics (keywords tracked in conversations), custom vocabulary (fixes words in transcripts)
PG.words = function () {
  const w = SET.words || {};
  return head('Business words', 'The words of your business: call types, topics to track in conversations, and the right spelling of names in transcripts', bellBtn()) + (onlyAdmin()
    || `<div class="g g2">${card('Call types', `<p class=mu style="margin:0 0 6px">${tr('The kinds of calls you make (like Introduction, Reactivation, Birthday). One per line.')}</p><textarea id=wd-types rows=7 aria-label="Call types">${esc((w.types || []).join('\n'))}</textarea>`)}`
      + card('Topics', `<p class=mu style="margin:0 0 6px">${tr('One topic per line: the name, then its keywords after "|", separated by commas. Q-Intelligence counts how often they come up.')}</p><textarea id=wd-topics rows=7 aria-label="Topics" placeholder="Competitors | brand A, brand B, another site">${esc((w.topics || []).map(t => t.name + ' | ' + t.words.join(', ')).join('\n'))}</textarea>`) + `</div>`
    + card('Custom vocabulary', `<p class=mu style="margin:0 0 6px">${tr('The right spelling, then "|" and the wrong spellings the transcription makes, separated by commas. They are replaced in new transcripts.')}</p><textarea id=wd-vocab rows=6 aria-label="Custom vocabulary" placeholder="AcmeBank | Acme Bank, Akme Bank, Acme Bang">${esc((w.vocab || []).map(v => v.term + ' | ' + v.wrong.join(', ')).join('\n'))}</textarea>`)
    + `<div class=row style="justify-content:flex-end"><button class=btn onclick="wordsSave()">${tr('Save')}</button></div>`);
};
const wordsSave = () => { const lines = id => $('#' + id).value.split('\n').map(s => s.trim()).filter(Boolean), pair = s => { const [a, b] = s.split('|'); return [a.trim(), (b || '').split(',').map(x => x.trim()).filter(Boolean)]; };
  orgSave({ words: { types: lines('wd-types'), topics: lines('wd-topics').map(pair).map(([name, words]) => ({ name, words })), vocab: lines('wd-vocab').map(pair).map(([term, wrong]) => ({ term, wrong })) } }, 'Business words saved'); };

// ---- AI Hub (in MANAGE): for now a place-holder that links to the AI tools already in the app; more comes later (Gabriela, 29 October)
const AIHUB = [['qask', 'g_qi', 'Ask Quinn', 'Questions about your teams, answered from your numbers.'], ['qins', 'g_qi', 'AI insights', 'What the AI noticed in your reviews.'],
  ['qagents', 'g_qi', 'AI agents', 'Helpers that do a task for you.'], ['sim', 'g_aisim', 'Practice a call', 'Talk to an AI customer and get a score.'], ['autoqa', 'g_home', 'AutoQA', 'Reviews the AI scores for you.']];
PG.aihub = function () {
  const l = AIHUB.filter(([k]) => canRoute(k));
  return head('AI Hub', 'All the AI tools of Q-smart in one place. This page is new: more will come here soon.')
    + `<div class="card tip" style="margin-bottom:14px">${AIS.enabled ? tr('The AI is connected.') : tr('The AI is not connected yet. An admin connects it in Admin › Integrations.')}</div>`
    + card('Open an AI tool', l.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${l.map(([k, i, n, d]) => `<a class="card" href="#${k}" style="margin:0;display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit"><span style="color:var(--orange)">${IC[i]}</span><span><b>${n}</b><br><span class=mu>${d}</span></span></a>`).join('')}</div>` : `<p class=mu style="margin:0">No AI tool is open to your role yet.</p>`);
};

// ---- Q-Intelligence
const qiOff = () => AIS.enabled ? '' : `<div class="card tip" style="margin-bottom:14px">${tr('Q-Intelligence needs the AI. An admin connects it in Admin › Integrations with your API key.')}</div>`;
const qiMd = t => typeof md === 'function' ? `<div class=prose>${md(String(t || ''))}</div>` : `<p style="white-space:pre-wrap;margin:0">${esc(t)}</p>`;   // AI text: Markdown, kept in its own language
// Ask Quinn (the assistant was named Quinn on 3 November): questions about the quality of your teams, answered from your numbers (and the knowledge files)
PG.qask = function () {
  const ex = ['Which category should we train next month?', 'Who improved the most this month, and why?', 'What do our lowest-scoring calls have in common?', 'Write a short update for my manager.'];
  return head('Ask Quinn', 'Ask anything about the quality of your teams. Quinn, your AI assistant, answers from your reviews and numbers, and follows your knowledge files.', bellBtn()) + qiOff()
    + `<section class="card qchat">${QI.ask.length ? QI.ask.map(m => `<div class="qm ${m.me ? 'me' : ''}">${m.me ? esc(m.t) : qiMd(m.t)}</div>`).join('') : `<div class=qhi><b>${tr('What can I do for you?')}</b><div class=tkchips>${ex.map(q => `<button class=tkcp onclick="qiAsk(${esc(jsq(tr(q)))})">${tr(q)}</button>`).join('')}</div></div>`}${QI.busy ? `<div class="qm">${tr('Thinking…')}</div>` : ''}</section>`
    + `<div class=row style="gap:8px;margin-top:10px;flex-wrap:wrap"><select style="width:auto" onchange="QI.team=this.value"><option value="">${tr('All teams')}</option>${TEAMS.filter(t => !t.system).map(t => `<option value="${esc(t.id)}" ${QI.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><select style="width:auto" onchange="QI.per=this.value">${[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']].map(([k, n]) => `<option value=${k} ${QI.per === k ? 'selected' : ''}>${tr(n)}</option>`).join('')}</select><input id=qiq style="flex:1;min-width:240px" placeholder="${esc(tr('Ask Q a question…'))}" onkeydown="if(event.key==='Enter')qiAsk(this.value)"><button class=btn ${QI.busy ? 'disabled' : ''} onclick="qiAsk($('#qiq').value)">${tr('Ask')}</button></div>`;
};
async function qiAsk(q) { q = String(q || '').trim(); if (!q || QI.busy) return; QI.ask.push({ me: 1, t: q }); QI.busy = true; render();
  const r = await api('/api/ai/analyst', { q, period: QI.per, team: QI.team }); QI.busy = false;
  if (!r.ok) { QI.ask.push({ t: await errOf(r, 'Q could not answer') }); return render(); }
  const j = await r.json(); QI.ask.push({ t: j.text || j.report || j.answer || JSON.stringify(j) }); render(); }
// AI agents: one click on one review (or one agent)
const QAG = [['summary', 'Call summary', 'What happened, what went well and what went wrong', 'review'], ['next', 'Next steps', 'What the agent, the lead and the customer are owed, by whom', 'review'], ['email', 'Follow-up email', 'A short email to the customer that recaps what was agreed', 'review'], ['coach', 'Coaching brief', 'What to work on, questions to ask, and what to praise', 'review'], ['o2o', 'One-to-one prep', 'The agent\'s month: numbers, strengths, what to improve, objectives, questions', 'agent']];
PG.qagents = function () {
  const a = QAG.find(x => x[0] === QI.kind) || QAG[0], revs = [...EV].filter(e => e.rid).sort((x, y) => y.d - x.d).slice(0, 200);
  const pick = a[3] === 'agent' ? `<select id=qia style="flex:1;min-width:220px" onchange="QI.ag=this.value"><option value="">${tr('Choose the agent…')}</option>${AGENTS().map(u => `<option value="${esc(u.username)}" ${QI.ag === u.username ? 'selected' : ''}>${esc(u.name)} · ${esc(tn(u.team))}</option>`).join('')}</select>`
    : `<select id=qir style="flex:1;min-width:260px" onchange="QI.rid=this.value"><option value="">${tr('Choose the review…')}</option>${revs.map(e => `<option value="${esc(e.rid)}" ${QI.rid === e.rid ? 'selected' : ''}>${esc(e.id)} · ${esc(agn(e))} · ${f(e.d)} · ${Math.round(e.sc)}%</option>`).join('')}</select>`;
  return head('AI agents', 'Ready-made AI helpers: pick one, choose a review or an agent, and get the result in seconds', bellBtn()) + qiOff()
    + `<div class=qag>${QAG.map(([k, n, d]) => `<button class="qac ${QI.kind === k ? 'on' : ''}" onclick="QI.kind='${k}';QI.out=null;render()"><b>${tr(n)}</b><small class=mu>${tr(d)}</small></button>`).join('')}</div>`
    + card(tr(a[1]), `<div class=row style="gap:8px;flex-wrap:wrap">${pick}<button class=btn ${QI.busy ? 'disabled' : ''} onclick="qiRun()">${QI.busy ? tr('Working…') : tr('Run')}</button></div>${QI.out ? `<div class=qout>${qiMd(QI.out)}</div><div class=row style="justify-content:flex-end;margin-top:8px"><button class=ib onclick="navigator.clipboard.writeText(QI.out).then(()=>toast('Copied'))">${tr('Copy')}</button></div>` : ''}`)
    + card('More AI tools', `<p class=mu style="margin:0 0 8px">${tr('The AI reviewer, AI team lead, AI trainer and AI analyst are in AutoQA.')}</p><button class=ib onclick="goPage('autoqa')">${tr('Open AutoQA ›')}</button>`);
};
async function qiRun() { const a = QAG.find(x => x[0] === QI.kind); if (a[3] === 'agent' ? !QI.ag : !QI.rid) return toast(a[3] === 'agent' ? 'Choose the agent' : 'Choose the review', true);
  QI.busy = true; QI.out = null; render(); const r = await api('/api/qi/agent', { kind: QI.kind, rid: QI.rid, agent: QI.ag }); QI.busy = false;
  if (!r.ok) { toast(await errOf(r, 'The AI could not answer'), true); return render(); } QI.out = (await r.json()).text; render(); }
// AI insights: objections, competitors, product feedback; and the topics (no AI)
const QIK = [['objections', 'Objections'], ['competitors', 'Competitors'], ['feedback', 'Product feedback']];
PG.qins = function () {
  const tp = QI.top, last = k => QI.ins.find(x => x.kind === k);
  return head('AI insights', 'What customers say, found by the AI in review comments, transcripts and survey comments', bellBtn()) + qiOff()
    + `<div class=row style="gap:8px;margin-bottom:12px;justify-content:flex-start"><span class=mu>${tr('Period')}</span><div class=sg>${[[7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, n]) => `<button class="${QI.days === d ? 'on' : ''}" onclick="QI.days=${d};qiTopics()">${tr(n)}</button>`).join('')}</div></div>`
    + `<div class="g g3">${QIK.map(([k, n]) => { const x = last(k);
      return card(tr(n), (x ? (x.themes.length ? x.themes.map(t => `<div class=qth><div class=row><b>${esc(t.theme)}</b><span class=bg>${t.count}</span></div><small>${esc(t.summary)}</small>${t.examples.map(q => `<small class=mu>“${esc(q)}”</small>`).join('')}</div>`).join('') : qiMd(x.text || tr('Nothing found.'))) + `<small class=mu>${tr(`${x.texts} texts · ${x.days} days`)} · ${fdt(x.at)}</small>` : `<p class=mu style="margin:0">${tr('Not looked for yet.')}</p>`)
        + `<button class=ib style="margin-top:8px" ${QI.busy ? 'disabled' : ''} onclick="qiIns('${k}')">${QI.busy === k ? tr('Looking…') : tr(x ? 'Look again' : 'Find them')}</button>`); }).join('')}</div>`
    + card('Topics', !tp ? `<p class=mu style="margin:0">${tr('Loading…')}</p>` : tp.topics.length ? `<p class=mu style="margin:0 0 8px">${tr(`How many of ${tp.texts} texts mention each topic (no AI needed).`)}</p>` + tp.topics.map(t => `<div style="margin-top:8px"><div class=row><span><b>${esc(t.name)}</b> <small class=mu>${esc(t.words.slice(0, 6).join(', '))}</small></span><b class=mono>${t.hits}</b></div>${bar(tp.texts ? t.hits / tp.texts * 100 : 0, 'var(--ac)')}</div>`).join('')
      : `<p class=mu style="margin:0">${tr('No topics yet. Add them in Admin › Organization › Business words.')}</p>`);
};
async function qiTopics() { const r = await api('/api/qi/topics?days=' + QI.days); if (r.ok) QI.top = await r.json(); render(); }
async function qiIns(kind) { QI.busy = kind; render(); const r = await api('/api/qi/insights', { kind, days: QI.days }); QI.busy = false;
  if (!r.ok) { toast(await errOf(r, 'The AI could not find insights'), true); return render(); } const x = await r.json(); QI.ins = [x, ...QI.ins.filter(y => y.kind !== kind)]; render(); }
// Knowledge: playbooks and documents the AI reads with every answer
PG.qknow = function () {
  const ed = ['admin', 'qa', 'trainer'].includes(ME.role);
  return head('Knowledge', 'Your playbooks and documents: the AI reads them with every answer (Ask Quinn, AI agents, AI insights, AI reviewer and the others)', `<div style="display:flex;gap:8px">${bellBtn()}${ed ? `<label class="btn ibx" style="cursor:pointer">${IC.up} ${tr('Add files')}<input type=file accept=".md,.txt,text/plain,text/markdown" multiple style="display:none" onchange="qiUp(this.files)"></label>` : ''}</div>`)
    + `<p class=mu style="margin:0 0 12px">${tr('Plain text (.txt) and Markdown (.md) files, up to 300 KB each. The AI reads the first part of them with every request.')}</p>`
    + (QI.know.length ? `<div class=qkl>${QI.know.map(f => `<div class=card><div class=row><b>${esc(f.name)}</b>${ed ? `<button class=ic title="${esc(tr('Delete'))}" aria-label="${esc(tr('Delete'))}" onclick="qiDel('${f.id}')">${IC.bin}</button>` : ''}</div><small class=mu>${Math.round(f.size / 1024 * 10) / 10} KB · ${fdt(f.at)}</small><p class=qkp>${esc(f.preview)}</p></div>`).join('')}</div>` : `<div class=agem>${tr('No knowledge files yet. Add your playbook, product guide or scripts.')}</div>`);
};
async function qiUp(files) { for (const f of files) { if (f.size > 300 * 1024) { toast(tr(`${f.name} is larger than 300 KB`), true); continue; } const text = await f.text(); const r = await api('/api/qi/knowledge', { name: f.name, text }); if (!r.ok) toast(await errOf(r, 'Could not add the file'), true); } await load(); render(); toast('Knowledge updated'); }
const qiDel = id => ask('Delete this knowledge file?', 'The AI will no longer read it.', async () => { await api('/api/qi/knowledge/' + id, null, 'DELETE'); await load(); render(); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
