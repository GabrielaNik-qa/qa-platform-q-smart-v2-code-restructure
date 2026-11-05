// ===================== Registers of the Admin panel (GOVERNANCE) and the Activity Log views (Gabriela, 3 November) =====================
// One page shape for the lists a company in the EU must keep (GDPR, EU AI Act, data breaches, accessibility): a table, a form to
// add or change a line, delete. The lines are kept on the server like the Risk register (/api/c/<list>, admins only).
// "Start from Q-smart's own list" fills in what this app itself does, as drafts to check (nothing is added without that click).
const YN = [['no', 'No'], ['yes', 'Yes']];
const GOVR = {
  cs_ropa: { c: 'ropa', what: 'activity', t: 'Record of processing', s: 'What personal data the company processes, why, on what legal basis and for how long (GDPR article 30)', name: 'activity',
    f: [{ k: 'activity', l: 'Processing activity', req: 1, ph: 'e.g. Quality reviews of calls' }, { k: 'purpose', l: 'Purpose', t: 'textarea', rows: 2 },
      { k: 'basis', l: 'Legal basis', t: 'select', o: [['legitimate', 'Legitimate interests'], ['contract', 'Contract'], ['legal', 'Legal obligation'], ['consent', 'Consent'], ['vital', 'Vital interests'], ['public', 'Public task']] },
      { k: 'subjects', l: 'Whose data', ph: 'e.g. Agents, customers' }, { k: 'data', l: 'Kinds of personal data', t: 'textarea', rows: 2 }, { k: 'recipients', l: 'Who receives it' },
      { k: 'transfer', l: 'Sent outside the EU', t: 'select', o: [['no', 'No'], ['adequacy', 'Yes, to a country with an adequacy decision'], ['scc', 'Yes, with standard contractual clauses'], ['other', 'Yes, other safeguard']] },
      { k: 'retention', l: 'How long it is kept', ph: 'e.g. 12 months' }, { k: 'security', l: 'Security measures', t: 'textarea', rows: 2 }, { k: 'status', l: 'Status', t: 'select', o: [['draft', 'Draft'], ['approved', 'Approved']] }],
    cols: [['Processing activity', x => `<b>${esc(x.activity)}</b>${x.purpose ? `<br><small class=mu>${esc(x.purpose)}</small>` : ''}`], ['Legal basis', x => esc(regOpt('cs_ropa', 'basis', x.basis))], ['Whose data', x => esc(x.subjects || '—')], ['Kept', x => esc(x.retention || '—')], ['Outside the EU', x => esc(regOpt('cs_ropa', 'transfer', x.transfer))], ['Status', x => regPill(x.status === 'approved' ? 'Approved' : 'Draft', x.status === 'approved' ? 'ok' : 'wn')]],
    seed: () => [
      ['Quality reviews of conversations', 'Score calls, chats and emails to coach agents and keep the service good', 'legitimate', 'Agents, customers', 'Name, team, scores, comments; customer lead ID and what was said in the conversation', '12 months'],
      ['Call recordings', 'Listen to the calls that are reviewed', 'legitimate', 'Agents, customers', 'Voice, phone call content', 'As set in Data protection'],
      ['Attendance and time off', 'Know who works when, plan the shifts and pay', 'contract', 'Agents and staff', 'Check-in and check-out times, breaks, time off, sickness days', 'As set in Data protection'],
      ['Coaching, goals and improvement plans', 'Help each person improve', 'legitimate', 'Agents', 'Goals, coaching notes, improvement plans, recognition', '12 months'],
      ['Customer surveys and complaints', 'Measure and improve customer satisfaction', 'legitimate', 'Customers, agents', 'Survey answers and comments, complaints', '12 months'],
      ['Sign-ins and the audit log', 'Keep the accounts and the data safe', 'legal', 'Everybody with an account', 'Username, time, IP address, what was changed', 'The last 1000 entries']
    ].map(([activity, purpose, basis, subjects, data, retention]) => ({ activity, purpose, basis, subjects, data, recipients: 'Admins and team leads of the company', transfer: 'no', retention, security: 'Personal accounts with roles, passwords that are checked, sign-ins and changes logged', status: 'draft' })) },
  cs_subproc: { c: 'subproc', what: 'sub-processor', t: 'Sub-processors', s: 'The other companies that process personal data for you (hosting, e-mail, AI), where, and with which safeguard', name: 'name',
    f: [{ k: 'name', l: 'Company', req: 1 }, { k: 'service', l: 'What it does for you', ph: 'e.g. Hosting, sending e-mails, AI' }, { k: 'data', l: 'Personal data it sees' }, { k: 'country', l: 'Country where the data is' },
      { k: 'safeguard', l: 'Safeguard', t: 'select', o: [['eu', 'In the EU / EEA'], ['adequacy', 'Adequacy decision'], ['scc', 'Standard contractual clauses'], ['other', 'Other']] }, { k: 'dpa', l: 'Data processing agreement signed on', t: 'date' },
      { k: 'status', l: 'Status', t: 'select', o: [['active', 'In use'], ['planned', 'Planned'], ['ended', 'No longer used']] }],
    cols: [['Company', x => `<b>${esc(x.name)}</b>${x.service ? `<br><small class=mu>${esc(x.service)}</small>` : ''}`], ['Personal data', x => esc(x.data || '—')], ['Country', x => esc(x.country || '—')], ['Safeguard', x => esc(regOpt('cs_subproc', 'safeguard', x.safeguard))], ['Agreement', x => x.dpa ? esc(x.dpa) : regPill('Missing', 'bad')], ['Status', x => esc(regOpt('cs_subproc', 'status', x.status))]] },
  cs_dpa: { c: 'dpas', what: 'agreement', t: 'Data processing agreements', s: 'The signed agreements with your customers and suppliers about personal data (GDPR article 28)', name: 'party',
    f: [{ k: 'party', l: 'With', req: 1, ph: 'Company name' }, { k: 'kind', l: 'They are', t: 'select', o: [['customer', 'A customer'], ['supplier', 'A supplier']] }, { k: 'version', l: 'Version' },
      { k: 'signed', l: 'Signed on', t: 'date' }, { k: 'expires', l: 'Ends on (optional)', t: 'date' }, { k: 'link', l: 'Link to the signed file (https://…)', ph: 'https://' }, { k: 'notes', l: 'Notes', t: 'textarea', rows: 2 }],
    cols: [['With', x => `<b>${esc(x.party)}</b>`], ['They are', x => esc(regOpt('cs_dpa', 'kind', x.kind))], ['Version', x => esc(x.version || '—')], ['Signed', x => x.signed ? esc(x.signed) : regPill('Not signed', 'bad')], ['Ends', x => x.expires ? (x.expires < todayS() ? regPill(x.expires, 'bad') : esc(x.expires)) : '—'], ['File', x => /^https:\/\//i.test(x.link || '') ? `<a href="${esc(x.link)}" target=_blank rel="noopener noreferrer">Open</a>` : '—']] },
  cs_consent: { c: 'consents', what: 'notice', t: 'Recording consent', s: 'How customers are told that their call or chat is recorded, country by country', name: 'country',
    f: [{ k: 'country', l: 'Country', req: 1 }, { k: 'channel', l: 'For', t: 'select', o: [['all', 'Calls, chats and e-mails'], ['call', 'Calls'], ['chat', 'Chats'], ['email', 'E-mails']] },
      { k: 'how', l: 'How the customer is told', t: 'select', o: [['ivr', 'A recorded message before the call'], ['agent', 'The agent says it'], ['written', 'A written notice'], ['other', 'Other']] },
      { k: 'text', l: 'What the customer hears or reads', t: 'textarea', rows: 3 }, { k: 'basis', l: 'Legal basis', t: 'select', o: [['legitimate', 'Legitimate interests'], ['consent', 'Consent'], ['legal', 'Legal obligation']] },
      { k: 'days', l: 'Recordings kept for (days)', t: 'number' }],
    cols: [['Country', x => `<b>${esc(x.country)}</b>`], ['For', x => esc(regOpt('cs_consent', 'channel', x.channel))], ['How', x => esc(regOpt('cs_consent', 'how', x.how))], ['Text', x => `<small>${esc(String(x.text || '—').slice(0, 140))}</small>`], ['Kept', x => x.days ? esc(x.days) + ' ' + tr('days') : '—']] },
  cs_aireg: { c: 'aireg', what: 'AI system', t: 'AI register', s: 'Where AI is used, for what, how risky it is and who checks it (EU AI Act)', name: 'name',
    f: [{ k: 'name', l: 'AI system or feature', req: 1 }, { k: 'purpose', l: 'What it does', t: 'textarea', rows: 2 }, { k: 'where', l: 'Where it is used', ph: 'e.g. Home › AutoQA' },
      { k: 'risk', l: 'Risk level (EU AI Act)', t: 'select', o: [['minimal', 'Minimal'], ['limited', 'Limited: people must be told'], ['high', 'High: strict rules'], ['banned', 'Not allowed']] },
      { k: 'provider', l: 'Provider and model' }, { k: 'human', l: 'Human check', t: 'select', o: [['all', 'A person checks every result'], ['some', 'A person checks some results'], ['none', 'No check']] },
      { k: 'told', l: 'People are told AI is used', t: 'select', o: YN }, { k: 'owner', l: 'Person responsible' }, { k: 'review', l: 'Next review', t: 'date' }],
    cols: [['AI system', x => `<b>${esc(x.name)}</b>${x.where ? `<br><small class=mu>${esc(x.where)}</small>` : ''}`], ['Risk', x => regPill(regOpt('cs_aireg', 'risk', x.risk), x.risk === 'high' || x.risk === 'banned' ? 'bad' : x.risk === 'limited' ? 'wn' : 'ok')], ['Human check', x => esc(regOpt('cs_aireg', 'human', x.human))], ['People told', x => x.told === 'yes' ? regPill('Yes', 'ok') : regPill('No', 'bad')], ['Responsible', x => esc(x.owner || '—')], ['Next review', x => x.review ? (x.review < todayS() ? regPill(x.review, 'bad') : esc(x.review)) : '—']],
    seed: () => [
      // Gabriela, 3 November: AI scores are for comparison (the accuracy rate of the reviewers) and training, never to evaluate agents
      ['AutoQA scoring', 'The AI scores conversations in parallel with the reviewers, to compare (accuracy rate) and for training', 'Home › AutoQA', 'limited', 'all', 'It is not used to evaluate agents. If it ever were, it would be a high-risk use (EU AI Act, annex III, employment)'],
      ['Ask Quinn', 'Answers questions about the quality of the teams from your numbers', 'Q-Intelligence › Ask Quinn', 'limited', 'some', ''],
      ['AI insights', 'Finds patterns in the reviews', 'Q-Intelligence › AI insights', 'limited', 'some', ''],
      ['Q Trainer', 'An AI customer for practice calls, with a score', 'Q Trainer', 'limited', 'some', ''],
      ['AI agents', 'AI helpers that do a task in the app', 'AI agents', 'limited', 'some', '']
    ].map(([name, purpose, where, risk, human, note]) => ({ name, purpose: note ? purpose + '. ' + note : purpose, where, risk, provider: (typeof AIS !== 'undefined' && AIS.model) || '', human, told: 'no', owner: '', review: '' })) },
  cs_ainotice: { c: 'ainotices', what: 'notice', t: 'AI notices', s: 'The texts that tell agents and customers when AI scored or answered them (EU AI Act, transparency)', name: 'feature',
    f: [{ k: 'feature', l: 'For which AI feature', req: 1 }, { k: 'to', l: 'Shown to', t: 'select', o: [['agents', 'Agents'], ['customers', 'Customers'], ['reviewers', 'Reviewers']] },
      { k: 'lang', l: 'Language', t: 'select', o: [['all', 'All languages'], ...I18N.LANGS.map(l => [l.code, l.name])] }, { k: 'text', l: 'The notice', t: 'textarea', rows: 3, req: 1 }],
    cols: [['AI feature', x => `<b>${esc(x.feature)}</b>`], ['Shown to', x => esc(regOpt('cs_ainotice', 'to', x.to))], ['Language', x => esc(regOpt('cs_ainotice', 'lang', x.lang))], ['Notice', x => `<small>${esc(String(x.text || '').slice(0, 160))}</small>`]] },
  cs_breach: { c: 'breaches', what: 'breach', t: 'Data breaches', s: 'Every personal data breach, what was done, and the report to the authority within 72 hours (GDPR articles 33 and 34)', name: 'title',
    f: [{ k: 'title', l: 'What happened', req: 1 }, { k: 'found', l: 'Found on', t: 'date', req: 1 }, { k: 'foundAt', l: 'At', t: 'time' }, { k: 'data', l: 'Personal data concerned', t: 'textarea', rows: 2 },
      { k: 'people', l: 'About how many people', t: 'number' }, { k: 'risk', l: 'Risk for the people', t: 'select', o: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
      { k: 'actions', l: 'What was done', t: 'textarea', rows: 2 }, { k: 'authority', l: 'Report to the authority', t: 'select', o: [['todo', 'To report'], ['done', 'Reported'], ['no', 'Not needed (no risk)']] },
      { k: 'reported', l: 'Reported on', t: 'date', show: d => d.authority === 'done' }, { k: 'informed', l: 'The people concerned', t: 'select', o: [['no', 'Not needed'], ['todo', 'To inform'], ['done', 'Informed']] },
      { k: 'status', l: 'Status', t: 'select', o: [['open', 'Open'], ['closed', 'Closed']] }],
    cols: [['What happened', x => `<b>${esc(x.title)}</b><br><small class=mu>${esc(x.found || '')} ${esc(x.foundAt || '')}</small>`], ['Risk', x => regPill(regOpt('cs_breach', 'risk', x.risk), x.risk === 'high' ? 'bad' : x.risk === 'medium' ? 'wn' : 'ok')], ['People', x => esc(x.people || '—')],
      ['72 hours', x => breachClock(x)], ['People told', x => esc(regOpt('cs_breach', 'informed', x.informed))], ['Status', x => regPill(x.status === 'closed' ? 'Closed' : 'Open', x.status === 'closed' ? 'ok' : 'wn')]] },
  cs_a11y: { c: 'a11y', what: 'statement', t: 'Accessibility statement', s: 'How Q-smart can be used by everybody, what is not accessible yet, and whom to contact (European Accessibility Act)', name: 'status', one: true,
    f: [{ k: 'status', l: 'Q-smart is', t: 'select', o: [['partial', 'Partly accessible'], ['full', 'Fully accessible'], ['no', 'Not accessible yet']] }, { k: 'text', l: 'The statement', t: 'textarea', rows: 10, req: 1 },
      { k: 'contact', l: 'Contact for accessibility problems (e-mail)' }, { k: 'checked', l: 'Last checked on', t: 'date' }] }
};
const regOpt = (k, f, v) => { const o = (GOVR[k].f.find(x => x.k === f) || {}).o || []; return (o.find(x => x[0] === v) || [v, v || '—'])[1]; };
const regPill = (t, c) => pill(esc(t), c);
// 72 hours from the moment the breach was found: time left, late, or reported
const breachClock = x => { if (x.authority === 'done') return regPill(x.reported ? tr('Reported') + ' ' + x.reported : 'Reported', 'ok'); if (x.authority === 'no') return regPill('Not needed', 'mu');
  const t = Date.parse((x.found || '') + 'T' + (x.foundAt || '00:00')); if (!t) return '—'; const h = Math.round((t + 72 * 36e5 - Date.now()) / 36e5);
  return h < 0 ? regPill(tf('{n} h late', { n: -h }), 'bad') : regPill(tf('{n} h left', { n: h }), h < 24 ? 'bad' : 'wn'); };
const A11Y0 = 'Q-smart wants everybody to be able to use it, also with a keyboard only, a screen reader or a larger text size.\n\nWhat works: every page can be used with the keyboard; buttons, boxes and tick boxes have names that screen readers read, in the chosen language; the text can be enlarged in the browser; light and dark colours can be chosen.\n\nWhat is not accessible yet: (write here what you found)\n\nIf something does not work for you, write to us and we will help you and fix it.';
function regForm(k, id, pre) {
  const R = GOVR[k], x = (CO[R.c] || []).find(r => r.id === id) || (R.one ? { text: tr(A11Y0), status: 'partial' } : { ...(pre || {}) });
  openForm({ title: id ? tr('Change') + ': ' + tr(R.t) : R.t, w: 640, yes: 'Save', d: Object.fromEntries(R.f.map(f => [f.k, Array.isArray(x[f.k]) ? JSON.parse(JSON.stringify(x[f.k])) : x[f.k] ?? (f.o ? (typeof f.o === 'function' ? '' : f.o[0][0]) : '')])), fields: R.f,
    save: d => { const miss = R.f.find(f => f.req && !String(d[f.k] || '').trim()); if (miss) return tr('Fill in') + ': ' + tr(miss.l);
      if (d.link && !/^https:\/\//i.test(d.link)) return 'Links must start with https://'; return coSave(R.c, { ...(R.before ? R.before(d) : d), id }); } });
}
async function regSeed(k) { const R = GOVR[k], l = R.seed(); for (const x of l) { const r = await api('/api/c/' + R.c, x); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); } await load(); render(); toast(tf('{n} lines added as drafts: check them', { n: l.length })); }
const regPage = k => function () {
  const R = GOVR[k], l = CO[R.c] || [];
  if (R.one) { const x = l[0];
    return head(R.t, R.s, `<div style="display:flex;gap:8px">${bellBtn()}<button class="btn ibx" onclick="regForm('${k}'${x ? `,'${x.id}'` : ''})">${x ? IC.pen + ' ' + tr('Change') : IC.plus + ' ' + tr('Write the statement')}</button></div>`)
      + (x ? card('', `<p style="margin:0 0 10px">${regPill(regOpt(k, 'status', x.status), x.status === 'full' ? 'ok' : 'wn')}${x.checked ? ` <small class=mu>${tr('Last checked on')} ${esc(x.checked)}</small>` : ''}</p><div data-noi18n style="white-space:pre-wrap">${esc(x.text)}</div>${x.contact ? `<p style="margin:12px 0 0"><b>${tr('Contact')}:</b> ${esc(x.contact)}</p>` : ''}`)
        : card('', `<p class=mu style="margin:0">${tr('No statement yet. Write the statement starts from a draft that says what Q-smart already does.')}</p>`)); }
  const extra = k === 'cs_breach' ? (() => { const open = l.filter(x => x.status !== 'closed' && x.authority === 'todo'); return open.length ? `<div class="card tip" style="margin-bottom:14px;border-color:var(--bad)">${tf('{n} breaches still have to be reported to the authority (within 72 hours of being found).', { n: open.length })}</div>` : ''; })() : '';
  return head(R.t, R.s, `<div style="display:flex;gap:8px;flex-wrap:wrap">${bellBtn()}${R.seed && !l.length ? `<button class="ib ibx" onclick="regSeed('${k}')">${tr("Start from Q-smart's own list")}</button>` : ''}<button class="btn ibx" onclick="regForm('${k}')">${IC.plus} ${tr('Add')}</button></div>`)
    + extra + card(`${tr(R.t)} <span class=bg>${l.length}</span>`, l.length ? tbl([...R.cols.map(c => c[0]), ''], l.map(x => [...R.cols.map(c => c[1](x)), `<span style="white-space:nowrap"><button class=ic title="Change" onclick="regForm('${k}','${x.id}')">${IC.pen}</button><button class=ic title="Delete" onclick="coDel('${R.c}','${x.id}','${R.what}')">${IC.bin}</button></span>`]))
      : `<p class=mu style="margin:0">${tr('Nothing here yet.')}${R.seed ? ' ' + tr("Start from Q-smart's own list adds what this app itself does, as drafts to check.") : ''}</p>`);
};
Object.keys(GOVR).forEach(k => { PG[k] = regPage(k); });

// ---------- Activity Log › Sign-ins, Admin › Security › Security log (from the real audit records) and Exports & downloads (the Export centre)
const AUQ = { q: '' };
const auRows = (l, cols) => !l.length ? `<p class=mu style="margin:0">${tr('Nothing here yet.')}</p>` : tbl(cols, l.slice(0, 300).map(x => [`<span class=mono style="white-space:nowrap">${fdt(x.t)}</span>`, `<b>${esc(x.n || x.u || '—')}</b>${x.u ? `<br><small class=mu>${esc(x.u)}</small>` : ''}`, x.ok === false ? regPill(x.a, 'bad') : esc(x.a), `<small class=mono>${esc(x.ip || '—')}</small>`, `<small>${esc(x.d || '')}</small>`]));
const auSearch = () => `<div class=sx style="width:280px;margin-bottom:12px"><span>${IC.search}</span><input id=auq placeholder="Search a person or an action…" value="${esc(AUQ.q)}" oninput="AUQ.q=this.value;render()"></div>`;
const auHit = x => !AUQ.q.trim() || (x.a + ' ' + x.u + ' ' + (x.n || '') + ' ' + (x.ip || '')).toLowerCase().includes(AUQ.q.trim().toLowerCase());
const SIGNA = ['Signed in', 'Failed sign-in', 'Signed out'];
PG.cs_actsign = function () {
  const all = (AUD || []).filter(x => SIGNA.includes(x.a)), l = all.filter(auHit), day = todayS(), fails = all.filter(x => x.a === 'Failed sign-in' && String(x.t).slice(0, 10) === day).length;
  return head('Sign-ins', 'Who signed in, when and from where (IP address), and the failed attempts. From the audit log: the last 1000 entries.', `<div style="display:flex;gap:8px">${bellBtn()}<button class=ib onclick="load().then(render)">Refresh</button></div>`)
    + `<div class=fkp>${kpiS('Sign-ins today', all.filter(x => x.a === 'Signed in' && String(x.t).slice(0, 10) === day).length, '', 'var(--ok)')}${kpiS('Failed today', fails, '', fails ? 'var(--bad)' : 'var(--tx)')}${kpiS('People', new Set(all.filter(x => x.a === 'Signed in').map(x => x.u)).size, 'signed in', 'var(--tx)')}</div>`
    + card('', auSearch() + auRows(l, ['When', 'Who', 'What', 'From (IP)', '']));
};
// what matters for security: failed sign-ins, passwords, accounts, roles and permissions, backups and resets
const SECR = /Failed sign-in|password|user|perm|backup|restore|reset|purge|integ|registration|workspace|team/i;
PG.cs_seclog = function () {
  const all = (AUD || []).filter(x => SECR.test(x.a + ' ' + (x.p || ''))), l = all.filter(auHit);
  return head('Security log', 'Failed sign-ins and every change to accounts, passwords, teams, permissions, integrations and backups. From the audit log: the last 1000 entries.', `<div style="display:flex;gap:8px">${bellBtn()}<button class=ib onclick="load().then(render)">Refresh</button></div>`)
    + card('', auSearch() + auRows(l, ['When', 'Who', 'What', 'From (IP)', 'Details']));
};
PG.cs_actexp = function () {
  const l = (XPS || []).filter(x => !AUQ.q.trim() || (x.name + ' ' + (x.byName || '') + ' ' + x.by).toLowerCase().includes(AUQ.q.trim().toLowerCase()));
  return head('Exports & downloads', 'Every Excel file made from Q-smart: who made it, when, and how many rows. The files themselves are in Reports › Export centre.', `<div style="display:flex;gap:8px">${bellBtn()}<a class="ib ibx" href="#rexp">${tr('Open the Export centre')}</a></div>`)
    + card('', auSearch() + (l.length ? tbl(['When', 'Who', 'File', 'Rows'], l.map(x => [`<span class=mono style="white-space:nowrap">${fdt(x.at)}</span>`, `<b>${esc(x.byName || x.by)}</b>`, esc(x.name), esc(x.n)])) : `<p class=mu style="margin:0">${tr('Nothing here yet.')}</p>`));
};
