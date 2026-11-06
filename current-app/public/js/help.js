// ===================== Help Center, My activity, Getting started, Reviewer QA, Pins, Topic dashboards (Gabriela, 3 November) =====================
// The lists use the same server lists and form as the registers (registers.js): FAQ, glossary, videos and tours are written by staff and read
// by everybody; pins and reviewer checks belong to coaching. Everything on these pages comes from real records, nothing is made up.
const canWriteHelp = () => ME && ME.role !== 'agent';
Object.assign(GOVR, {
  cs_faq: { c: 'faq', what: 'question', t: 'FAQ', s: 'Short answers to the questions people ask most', name: 'q',
    f: [{ k: 'q', l: 'Question', req: 1 }, { k: 'a', l: 'Answer', t: 'textarea', rows: 5, req: 1 }, { k: 'topic', l: 'Topic', ph: 'e.g. Reviews' }, { k: 'pg', l: 'Page it is about (optional)', t: 'select', o: () => hpPages() }] },
  cs_gloss: { c: 'gloss', what: 'word', t: 'Glossary', s: 'What the quality words used in Q-smart mean', name: 'term',
    f: [{ k: 'term', l: 'Word', req: 1 }, { k: 'def', l: 'What it means', t: 'textarea', rows: 3, req: 1 }],
    seed: () => [
      ['Scorecard', 'The list of questions a review is scored with. Each question has points; together they make 100.'],
      ['Critical item', 'A question of the scorecard that makes the whole review fail when it is missed.'],
      ['Pass mark', 'The score a review must reach to pass (85% unless an admin set another one for the team).'],
      ['AutoQA', 'Reviews scored by the AI. A person can check and change every score.'],
      ['Calibration', 'Reviewers score the same conversation and compare, so everybody scores the same way.'],
      ['Dispute', 'An agent does not agree with a review and explains why; QA answers and may change the score.'],
      ['Quick flag', 'A red or green flag on a conversation, without a full review.'],
      ['Root cause', 'The real reason behind a mistake, chosen when a review fails.'],
      ['One-to-One', 'A planned talk between a team lead and one agent, with notes and next steps.'],
      ['Improvement plan', 'Goals for an agent over a few weeks, followed up until they are reached.'],
      ['CSAT', 'Customer satisfaction: the score customers give in a survey after a conversation, from 1 to 5.'],
      ['Reviewer QA', 'Checking the reviews themselves: are they fair and do they follow the scorecard?']
    ].map(([term, def]) => ({ term, def })) },
  cs_videos: { c: 'videos', what: 'video', t: 'Video tutorials', s: 'Short videos that show how to use each part of Q-smart', name: 'title',
    f: [{ k: 'title', l: 'Title', req: 1 }, { k: 'link', l: 'Link to the video (https://…)', req: 1, ph: 'https://' }, { k: 'topic', l: 'Topic', ph: 'e.g. Reviews' }, { k: 'min', l: 'Length (minutes)', t: 'number' }, { k: 'desc', l: 'What it shows', t: 'textarea', rows: 2 }] },
  cs_tours: { c: 'tours', what: 'tour', t: 'Guided tours', s: 'Step-by-step tours through the real pages, for new people', name: 'title',
    f: [{ k: 'title', l: 'Tour name', req: 1 }, { k: 'role', l: 'For', t: 'select', o: [['all', 'Everybody'], ['agent', 'Agents'], ['qa', 'QA Specialists'], ['lead', 'Team Leads'], ['trainer', 'Trainers']] }, { k: 'steps', l: 'Steps', t: 'steps', pages: () => hpPages(1) }],
    seed: () => [
      { title: 'First day as an agent', role: 'agent', steps: [['dash', 'Your dashboard: your average score and what needs you now'], ['calls', 'Your reviews: open one to read the comments, and dispute it if you do not agree'], ['tasks', 'Your tasks and targets: move them to Done when they are finished'], ['att', 'Check in when you start and check out when you finish'], ['acad', 'Your lessons and tests']] },
      { title: 'First day as QA', role: 'qa', steps: [['entry', 'Score a call here: choose the scorecard, then answer each question'], ['calls', 'All the reviews, with filters and the Excel export'], ['disputes', 'Disputes wait for your decision here'], ['cal', 'Calibration: score the same call with the other reviewers'], ['coach', 'Coaching: what each agent needs to work on']] }
    ].map(t => ({ ...t, title: tr(t.title), steps: t.steps.map(([pg, t2]) => ({ t: tr(t2), d: '', pg })) })) },   // saved in the language of the person who adds them
  cs_revqa: { c: 'revqa', what: 'check', t: 'Reviewer QA', s: 'Review the reviewers: check that reviews are fair and follow the scorecard', name: 'rid',
    f: [{ k: 'rid', l: 'Review', t: 'select', req: 1, o: () => [['', '—'], ...EV.filter(e => e.by && e.by !== ME.username).slice(0, 80).map(e => [e.rid, `${e.d} · ${agn(e)} · ${e.rv || e.by} · ${Math.round(e.sc)}%`])] },
      { k: 'fair', l: 'The score is fair', t: 'select', o: YN.slice().reverse() }, { k: 'follows', l: 'It follows the scorecard', t: 'select', o: YN.slice().reverse() },
      { k: 'critical', l: 'The critical items are right', t: 'select', o: YN.slice().reverse() }, { k: 'useful', l: 'The comment helps the agent', t: 'select', o: YN.slice().reverse() }, { k: 'note', l: 'Note for the reviewer', t: 'textarea', rows: 3 }],
    before: d => ({ ...d, reviewer: (EVA.find(e => e.rid === d.rid) || {}).by || '' }) },
  cs_pins: { c: 'pins', what: 'pin', t: 'Pins', s: 'Moments of conversations saved to talk about in a coaching session', name: 'note',
    f: [{ k: 'rid', l: 'Review', t: 'select', req: 1, o: () => [['', '—'], ...EV.slice(0, 120).map(e => [e.rid, `${e.d} · ${agn(e)} · ${tr('Lead')} ${e.id}`])] }, { k: 'when', l: 'Moment in the conversation (mm:ss)', ph: '02:15' },
      { k: 'note', l: 'What to talk about', t: 'textarea', rows: 3, req: 1 }, { k: 'status', l: 'Status', t: 'select', o: [['todo', 'To talk about'], ['done', 'Talked about']] }],
    before: d => ({ ...d, agent: (EVA.find(e => e.rid === d.rid) || {}).agent || '' }) }
});
// the pages a step or a question can point to: every page of the menu (not the coming-soon ones)
const hpPages = req => [...(req ? [] : [['', '—']]), ...GROUPS.flatMap(g => g.items.filter(([k]) => !Object.hasOwn(SOON, k)).map(([k, n]) => [k, tr(g.name) + ' › ' + tr(n)]))];
const hpPageName = k => (hpPages(1).find(x => x[0] === k) || [k, ''])[1];
const hpEd = (k, x) => canWriteHelp() ? `<span style="white-space:nowrap"><button class=ic title="Change" onclick="regForm('${k}','${x.id}')">${IC.pen}</button><button class=ic title="Delete" onclick="coDel('${GOVR[k].c}','${x.id}','${GOVR[k].what}')">${IC.bin}</button></span>` : '';
const hpHead = (k, n) => head(GOVR[k].t, GOVR[k].s, `<div style="display:flex;gap:8px;flex-wrap:wrap">${bellBtn()}<a class=ib href="/hc/" target=_blank rel=noopener>${tr('Help Center website')} ↗</a>${canWriteHelp() && GOVR[k].seed && !n ? `<button class="ib ibx" onclick="regSeed('${k}')">${tr("Start from Q-smart's own list")}</button>` : ''}${canWriteHelp() ? `<button class="btn ibx" onclick="regForm('${k}')">${IC.plus} ${tr('Add')}</button>` : ''}</div>`);
const HPQ = { q: '' };
const hpSearch = () => `<div class=sx style="width:300px;margin-bottom:12px"><span>${IC.search}</span><input id=hpq placeholder="Search…" value="${esc(HPQ.q)}" oninput="HPQ.q=this.value;render()"></div>`;
const hpHit = s => !HPQ.q.trim() || s.toLowerCase().includes(HPQ.q.trim().toLowerCase());
const hpNone = () => `<p class=mu style="margin:0">${tr('Nothing here yet.')}</p>`;

// ---- Help Center › FAQ: questions that open to show the answer, grouped by topic
PG.cs_faq = function () {
  const all = CO.faq || [], l = all.filter(x => hpHit(x.q + ' ' + x.a + ' ' + (x.topic || ''))), topics = [...new Set(l.map(x => x.topic || ''))].sort();
  return hpHead('cs_faq', all.length) + card('', hpSearch() + (l.length ? topics.map(tp => `${tp ? `<h3 style="margin:14px 0 6px">${esc(tp)}</h3>` : ''}${l.filter(x => (x.topic || '') === tp).map(x => `<details class=hpq><summary><b>${esc(x.q)}</b>${hpEd('cs_faq', x)}</summary><div data-noi18n style="white-space:pre-wrap">${esc(x.a)}</div>${x.pg ? `<p style="margin:8px 0 0"><a href="#${esc(x.pg)}">${esc(hpPageName(x.pg))} ›</a></p>` : ''}</details>`).join('')}`).join('') : hpNone()));
};
// ---- Help Center › Glossary: the words, A to Z
PG.cs_gloss = function () {
  const all = CO.gloss || [], l = all.filter(x => hpHit(x.term + ' ' + x.def)).sort((a, b) => String(a.term).localeCompare(String(b.term)));
  return hpHead('cs_gloss', all.length) + card('', hpSearch() + (l.length ? `<dl class=hpg>${l.map(x => `<dt>${esc(x.term)}${hpEd('cs_gloss', x)}</dt><dd>${esc(x.def)}</dd>`).join('')}</dl>` : hpNone()));
};
// ---- Help Center › Video tutorials: cards that open the video in a new tab
PG.cs_videos = function () {
  const all = CO.videos || [], l = all.filter(x => hpHit(x.title + ' ' + (x.topic || '') + ' ' + (x.desc || '')));
  return hpHead('cs_videos', all.length) + card('', hpSearch() + (l.length ? `<div class=hpv>${l.map(x => `<div class="card hpvc"><div class=row><b>${esc(x.title)}</b>${hpEd('cs_videos', x)}</div>${x.desc ? `<small class=mu>${esc(x.desc)}</small>` : ''}<div class=row style="margin-top:auto"><span>${x.topic ? pill(esc(x.topic), 'mu') : ''} ${x.min ? `<small class=mu>${esc(x.min)} min</small>` : ''}</span>${/^https:\/\//i.test(x.link || '') ? `<a class=pb href="${esc(x.link)}" target=_blank rel="noopener noreferrer">${tr('Watch')} ↗</a>` : ''}</div></div>`).join('')}</div>` : hpNone()));
};
// ---- Help Center › Guided tours: a list of tours; Start goes to the first page with a bar at the bottom (Back, Next, ✕)
let TOUR = null;
PG.cs_tours = function () {
  const all = CO.tours || [], mine = all.filter(t => !t.role || t.role === 'all' || t.role === ME.role || canWriteHelp());
  return hpHead('cs_tours', all.length) + card('', mine.length ? mine.map(t => `<div class=li><div class=row><span><b>${esc(t.title)}</b> <small class=mu>${esc(regOpt('cs_tours', 'role', t.role || 'all'))} · ${tf('{n} steps', { n: (t.steps || []).length })}</small></span><span style="display:flex;gap:6px">${hpEd('cs_tours', t)}<button class=pb onclick="tourGo('${t.id}',0)" ${(t.steps || []).length ? '' : 'disabled'}>${tr('Start the tour')}</button></span></div></div>`).join('') : hpNone());
};
function tourGo(id, i) { const t = (CO.tours || []).find(x => x.id === id) || (TOUR && TOUR.t); const s = t && (t.steps || [])[i]; if (!s) { TOUR = null; render(); return; } TOUR = { t, i }; if (s.pg && route !== s.pg) location.hash = s.pg; else render(); }
const tourBar = () => { if (!TOUR) return ''; const n = TOUR.t.steps.length, s = TOUR.t.steps[TOUR.i];
  return `<div class=tourb role=dialog aria-label="${esc(TOUR.t.title)}"><small class=mu>${esc(TOUR.t.title)} · ${tr(`Step ${TOUR.i + 1} of ${n}`)}</small><b data-noi18n>${esc(s.t)}</b><div class=row style="gap:6px;justify-content:flex-end"><button class=ib onclick="tourGo('${TOUR.t.id}',${TOUR.i - 1})" ${TOUR.i ? '' : 'disabled'}>${tr('Back')}</button><button class=btn onclick="tourGo('${TOUR.t.id}',${TOUR.i + 1})">${TOUR.i + 1 < n ? tr('Next') : tr('Finish')}</button><button class=ic onclick="TOUR=null;render()" aria-label="Close the tour">✕</button></div></div>`; };

// ---- Activity Log › My activity: what I received, what I gave, and my disputes (like Zendesk QA), from the real records
let MYA = 'rrev';
const myaTabs = [['Received', [['rrev', 'Reviews'], ['rcom', 'Comments'], ['rkud', 'Kudos'], ['rsur', 'Survey feedback']]], ['Given', [['grev', 'Reviews'], ['gcom', 'Comments'], ['gkud', 'Kudos']]], ['Disputes', [['dall', 'All'], ['drec', 'Received'], ['dsta', 'Started']]]];
const myaRows = () => { const me = ME.username, mine = e => e.agent === me, msgs = EV.flatMap(e => ((e.dp || {}).msgs || []).map(m => ({ e, m })));
  const evRow = e => ({ at: e.d, t: `${tr('Lead')} ${e.id} · ${Math.round(e.sc)}%`, s: `${agn(e)} · ${tr('reviewed by')} ${e.rv || e.by || '—'}`, go: `om('view','${e.rid}')` });
  const msgRow = ({ e, m }) => ({ at: String(m.at).slice(0, 10), t: m.t, s: `${m.n || m.u} · ${tr('Lead')} ${e.id}`, go: `om('view','${e.rid}')` });
  const dpRow = e => ({ at: String(e.dp.at).slice(0, 10), t: `${tr('Lead')} ${e.id} · ${agn(e)}`, s: e.dp.status === 'open' ? tr('Waiting for a decision') : tr('Resolved'), go: `om('view','${e.rid}')` });
  const inDp = e => e.dp && (mine(e) || e.by === me || (e.dp.msgs || []).some(m => m.u === me));
  return { rrev: EV.filter(mine).map(evRow), grev: EV.filter(e => e.by === me).map(evRow),
    rcom: msgs.filter(x => x.m.u !== me && (mine(x.e) || x.e.by === me || (x.e.dp.msgs || []).some(m => m.u === me))).map(msgRow), gcom: msgs.filter(x => x.m.u === me).map(msgRow),
    rkud: (CO.kudos || []).filter(k => k.to === me).map(k => ({ at: String(k.at).slice(0, 10), t: k.text || '', s: `${tr('From')} ${k.byName || k.by}` })), gkud: (CO.kudos || []).filter(k => k.by === me).map(k => ({ at: String(k.at).slice(0, 10), t: k.text || '', s: `${tr('To')} ${an(k.to) || k.to}` })),
    rsur: (CO.surveys || []).filter(x => x.agent === me).map(x => ({ at: x.date, t: x.comment || '—', s: `${tr('Score')} ${x.score}/5` })),
    dall: EV.filter(inDp).map(dpRow), drec: EV.filter(e => e.dp && e.by === me).map(dpRow), dsta: EV.filter(e => e.dp && mine(e)).map(dpRow) }; };
PG.cs_myact = function () {
  const R = myaRows(), l = (R[MYA] || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return head('My activity', 'What you received, what you gave, and your disputes', bellBtn()) + `<div class=mya><nav class="card mynav">${myaTabs.map(([h, tabs]) => `<div class=cap>${tr(h)}</div>${tabs.map(([k, n]) => `<button class="${MYA === k ? 'on' : ''}" onclick="MYA='${k}';render()">${tr(n)}<small>${(R[k] || []).length}</small></button>`).join('')}`).join('')}</nav>`
    + card('', l.length ? l.slice(0, 200).map(x => `<div class="li ${x.go ? 'clk' : ''}" ${x.go ? `onclick="${x.go}"` : ''}><div class=row><b data-noi18n>${esc(x.t)}</b><small class="mu mono">${esc(x.at || '')}</small></div><small class=mu>${esc(x.s)}</small></div>`).join('') : hpNone()) + `</div>`;
};

// ---- Home › Getting started: the set-up of Q-smart, checked on the real settings, each with the page to do it
PG.cs_start = function () {
  const l = [[SCS.length, 'A scorecard to score with', 'sco'], [TEAMS.filter(t => !t.system).length, 'The teams', 'teams'], [AGENTS().length, 'The agents, each in a team', 'users'],
    [EV.length, 'A first review', 'entry'], [((SET.wf || {}).rules || {}).since, 'Attendance counted from a start date', 'attrules'], [(SET.integ || {}).crm, 'The CRM link, so lead IDs open the CRM', 'integ'],
    [typeof AIS !== 'undefined' && AIS.enabled, 'The AI connected, for AutoQA and Q-Intelligence', 'integ']], done = l.filter(x => x[0]).length;
  return head('Getting started', 'What to set up so Q-smart works for your teams. Each line is checked on your real settings.', bellBtn())
    + card(`${tf('{n} of {n2} done', { n: done, n2: l.length })}`, `<div style="margin-bottom:12px">${bar(done / l.length * 100, done === l.length ? 'var(--ok)' : 'var(--ac)')}</div>${l.map(([ok, t, pg]) => `<div class=li><div class=row><span>${ok ? `<b style="color:var(--ok)">✓</b>` : `<b style="color:var(--mu)">○</b>`} ${tr(t)}</span>${ok ? `<small class=mu>${tr('Done')}</small>` : `<a class=pb href="#${pg}">${tr('Set it up')} ›</a>`}</div></div>`).join('')}`);
};

// ---- Quality › Reviewer QA: checks on the reviews done by others (four yes / no questions); the score of a reviewer = the share of yes
const rqScore = x => { const q = ['fair', 'follows', 'critical', 'useful'], y = q.filter(k => x[k] === 'yes').length; return Math.round(y / q.length * 100); };
PG.cs_revqa = function () {
  const all = CO.revqa || [], by = {}; all.forEach(x => { const e = EVA.find(v => v.rid === x.rid) || {}, r = e.by || x.reviewer || '—'; (by[r] = by[r] || []).push(rqScore(x)); });
  const can = ['admin', 'qa', 'lead'].includes(ME.role);
  return head('Reviewer QA', 'Review the reviewers: check that reviews are fair and follow the scorecard', `<div style="display:flex;gap:8px">${bellBtn()}${can ? `<button class="btn ibx" onclick="regForm('cs_revqa')">${IC.plus} ${tr('Check a review')}</button>` : ''}</div>`)
    + `<div class="g g2">${card('Reviewers', Object.keys(by).length ? tbl(['Reviewer', 'Checks', 'Score'], Object.entries(by).sort((a, b) => avg(b[1]) - avg(a[1])).map(([r, s]) => [`<b>${esc(an(r) || r)}</b>`, s.length, `<b style="color:${avg(s) >= 80 ? 'var(--ok)' : avg(s) >= 60 ? 'var(--wn)' : 'var(--bad)'}">${Math.round(avg(s))}%</b>`])) : hpNone())}`
    + card('Latest checks', all.length ? tbl(['Review', 'Score', 'Note', ''], all.slice(0, 50).map(x => { const e = EVA.find(v => v.rid === x.rid);
      return [e ? `<a href="javascript:void(0)" class=agl onclick="om('view','${e.rid}')">${tr('Lead')} ${esc(e.id)}</a><br><small class=mu>${esc(agn(e))} · ${esc(e.rv || e.by || '')}</small>` : '—', `${rqScore(x)}%`, `<small>${esc(x.note || '')}</small>`, can ? hpEd('cs_revqa', x) : '']; })) : hpNone()) + `</div>`;
};

// ---- Coaching › Pins: moments of conversations to talk about; agents see their own
PG.cs_pins = function () {
  const all = CO.pins || [], ed = canWriteHelp();
  const row = x => { const e = EVA.find(v => v.rid === x.rid); return `<div class=li><div class=row><span><b>${e ? esc(agn(e)) : '—'}</b> <small class=mu>${e ? `${tr('Lead')} ${esc(e.id)} · ${esc(e.d)}` : ''}${x.when ? ' · ' + esc(x.when) : ''}</small></span><span style="display:flex;gap:6px">${e ? `<button class=pb onclick="om('view','${e.rid}')">${tr('Open the review')}</button>` : ''}${ed ? `${x.status !== 'done' ? `<button class=ib onclick="coPatch('pins','${x.id}',{status:'done'},'${tr('Saved')}')">${tr('Talked about')}</button>` : ''}${hpEd('cs_pins', x)}` : ''}</span></div><div data-noi18n style="margin-top:4px">${esc(x.note)}</div></div>`; };
  const todo = all.filter(x => x.status !== 'done'), done = all.filter(x => x.status === 'done');
  return head('Pins', 'Moments of conversations saved to talk about in a coaching session', `<div style="display:flex;gap:8px">${bellBtn()}${ed ? `<button class="btn ibx" onclick="regForm('cs_pins')">${IC.plus} ${tr('Pin a moment')}</button>` : ''}</div>`)
    + card(`${tr('To talk about')} <span class=bg>${todo.length}</span>`, todo.length ? todo.map(row).join('') : hpNone()) + (done.length ? card(`${tr('Talked about')} <span class=bg>${done.length}</span>`, done.slice(0, 40).map(row).join('')) : '');
};

// ---- Analytics › Topic dashboards: one block per topic, from the real tasks, coaching sessions, disputes, calibrations, surveys and reviewer checks
PG.cs_dashes = function () {
  const m = todayS().slice(0, 7), inM = d => String(d || '').slice(0, 7) === m, dps = EV.filter(e => e.dp), res = dps.filter(e => e.dp.status !== 'open');
  const days = res.map(e => { const end = ((e.dp.msgs || []).slice(-1)[0] || {}).at; return end ? (Date.parse(end) - Date.parse(e.dp.at)) / 864e5 : null; }).filter(x => x != null);
  const sv = CO.surveys || [], rq = CO.revqa || [], tk = (TASKS || []).filter(t => !t.archived), ses = SESS || [], cal = CALS || [];
  const blk = (t, items, pg) => card(`${tr(t)}${pg ? ` <a class=agl href="#${pg}" style="font-size:13px;font-weight:500">${tr('Open')} ›</a>` : ''}`, `<div class=fkp style="margin:0">${items.map(([n, v, c]) => kpiS(n, v, '', c || 'var(--tx)')).join('')}</div>`);
  return head('Topic dashboards', 'One block per topic, from your real data', bellBtn()) + `<div class="g g2">`
    + blk('Assignments', [['Open tasks', tk.filter(t => t.status !== 'done').length], ['Done this month', tk.filter(t => t.status === 'done' && inM(t.completed)).length, 'var(--ok)'], ['Overdue', tk.filter(isOver).length, 'var(--bad)']], 'tasks')
    + blk('Coaching', [['Sessions this month', ses.filter(s => inM(s.date)).length], ['Planned', ses.filter(s => s.status === 'planned').length], ['Pins to talk about', (CO.pins || []).filter(x => x.status !== 'done').length]], 'coach')
    + blk('Disputes', [['Waiting', dps.length - res.length, 'var(--wn)'], ['Resolved', res.length, 'var(--ok)'], ['Days to resolve', days.length ? avg(days).toFixed(1) : '—']], 'disputes')
    + blk('Calibration', [['Sessions', cal.length], ['This month', cal.filter(c => inM(c.date)).length], ['Open', cal.filter(c => c.status !== 'closed' && c.status !== 'done').length]], 'cal')
    + blk('Surveys', [['Answers this month', sv.filter(x => inM(x.date)).length], ['Average', sv.length ? avg(sv.map(x => +x.score)).toFixed(1) + '/5' : '—'], ['Low (1–2)', sv.filter(x => +x.score <= 2).length, 'var(--bad)']], 'csat')
    + blk('Reviewer QA', [['Checks', rq.length], ['Average', rq.length ? Math.round(avg(rq.map(rqScore))) + '%' : '—']], 'cs_revqa') + `</div>`;
};
