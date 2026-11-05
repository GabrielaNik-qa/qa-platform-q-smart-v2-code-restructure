// ===================== Tasks: My Tasks (board or timeline), Team Progress (today), Evaluation (scores), Library =====================
// Every card shows its dates (created, started, sent for review, done, deadline); a task given with "needs review" goes to In review
// when its person marks it done, and the one who checks it approves it or sends it back with a comment. The Library keeps the history
// of every task given (give it again in one click), the templates (by hand or repeating) and the sequences (steps given together).
// Score of a person (0-100) = 70% completion + 30% done on time − 2 points for every overdue task.
let TSEQ = { seqs: [], runs: [] }, TKW = 0;   // the sequences and their rounds; TKW = weeks the timeline is moved from today
let TV = { view: LS.get('qa_tkview', 'board'), lib: 'hist', hq: '', tab: LS.get('qa_tktab', 'my'), q: '', st: 'all', team: '', agent: '', et: '', p: 'all', sk: 'score', sd: -1 }, TKV = null, TPLM = false;
// a target (it earns XP) has an orange star, a task a yellow one (Gabriela, 29 October: no emojis)
const tkStar = target => `<span class="tkstar ${target ? 'tgt' : ''}" aria-hidden="true">★</span>`;
const isOver = t => t.status !== 'done' && !t.archived && t.due && t.due < todayS();
const TIC = {
  my: svg('<path d="M10 6h11M10 12h11M10 18h11M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>', 17),
  team: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0112 0v1M16 4a4 4 0 010 8M22 21v-1a6 6 0 00-4-5.6"/>', 17),
  ev: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>', 17),
  tpl: svg('<path d="M12 2l10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5"/>', 17),
  list: svg('<path d="M10 6h11M10 12h11M10 18h11M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>', 18),
  done: svg('<path d="M5 13l4 4L19 7"/>', 18), act: svg('<path d="M21 12a9 9 0 01-15.5 6.3L3 16M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5M3 21v-5h5"/>', 18),
  warn: svg('<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/>', 18),
  arch: svg('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4"/>', 15),
  pin: svg('<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>', 15),
  clip: svg('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>', 15),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 12),
  play: svg('<path d="M7 4l13 8-13 8z"/>', 11), tgt: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', 12)
};
const TPRI = { high: ['high', 'var(--bad)'], med: ['medium', 'var(--wn)'], low: ['low', 'var(--ok)'] };
const FREQN = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly' };
// dates: a day as "20 Oct", the day part of a time, a day moved by n days, the Monday of its week
const tkDay = d => !d ? '' : String(d).length === 10 ? d : iso(new Date(d));
const tkD = d => d ? new Date(tkDay(d) + 'T12:00:00').toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' }) : '';
const tkAdd = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const tkMon = s => tkAdd(s, -((new Date(s + 'T12:00:00').getDay() + 6) % 7));
const tkLateN = t => t.status === 'done' && t.due && t.completed ? Math.round((new Date(tkDay(t.completed) + 'T12:00:00') - new Date(t.due + 'T12:00:00')) / 864e5) : null;
// the dates of a card, in the order they happened, with "on time" or "late" once it is done
function tkDates(t) {
  const l = [['Created', t.created], t.startedAt && ['Started', t.startedAt], t.sent && ['Sent for review', t.sent], t.completed && ['Done', t.completed]].filter(Boolean);
  const n = tkLateN(t), ok = n == null ? '' : n <= 0 ? `<span class=tkch style="--c:var(--ok)">On time</span>` : `<span class=tkch style="--c:var(--bad)">${n === 1 ? '1 day late' : n + ' days late'}</span>`;
  return `<div class=tkdt>${l.map(([k, d]) => `<span>${k} ${tkD(d)}</span>`).join('')}${t.due ? `<span class="${isOver(t) ? 'bad' : ''}">Deadline ${tkD(t.due)}</span>` : ''}${ok}</div>`;
}
const tkSeqChip = t => t.run ? `<span class=tkch style="--c:#a855f7" title="${esc(t.seqName || '')}">Step ${t.step} of ${t.steps}</span>` : '';
const tkRevChip = t => t.rev && t.status !== 'review' && t.status !== 'done' ? `<span class=tkch style="--c:var(--ac)" title="Goes to In review when it is marked done">Needs review</span>` : '';
// the person who checks a task: anyone who can give tasks and sees this person, except the person themself
const tkChecker = t => canEditWork() && t.assignee !== ME.username;
const tkRvBtns = t => t.status === 'review' && tkChecker(t) ? `<div class=tkrv onclick="event.stopPropagation()"><button class=pb onclick="tkApprove('${t.id}')">${TIC.done} Approve</button><button class=ib onclick="tkReturn('${t.id}')">Send back</button></div>` : '';
const tkFreq = t => t.freq || (TPLS.find(p => p.id === t.tpl) || {}).freq || (t.key ? 'daily' : '');
const tkMin = m => !m ? '' : m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? (m % 60) + 'm' : '') : m + 'min';
const tkItems = l => (l || []).map(c => typeof c === 'string' ? { t: c, min: 0 } : c);
// checklist lines typed as "Check email | 5" (5 = minutes)
const tkLines = l => (l || []).map(x => { if (x && typeof x === 'object') return { t: String(x.t || '').trim(), min: Math.max(0, parseInt(x.min) || 0), ...(String(x.d || '').trim() ? { d: String(x.d).trim() } : {}) }; const m = String(x).match(/^(.*?)\s*\|\s*(\d+)\s*(min)?$/i); return m ? { t: m[1].trim(), min: +m[2] } : { t: String(x).trim(), min: 0 }; }).filter(c => c.t);
const tkUnlines = l => tkItems(l).map(c => ({ t: c.t, d: c.d || '', min: c.min || 0 }));   // the rows of the steps field
const tkAv = (u, s = 30) => `<span class=tkav style="width:${s}px;height:${s}px;--c:${tcol(teamOf(u))}">${esc(ini(an(u) || u))}</span>`;

// ---- numbers of one person or a list of tasks
const tkStats = l => {
  const done = l.filter(t => t.status === 'done'), on = done.filter(t => t.due && t.completed && iso(new Date(t.completed)) <= t.due).length, over = l.filter(isOver).length;
  const comp = l.length ? done.length / l.length * 100 : 0, ont = done.length ? on / done.length * 100 : 0;
  return { total: l.length, done: done.length, on, over, comp, score: l.length ? Math.max(0, Math.min(100, Math.round(.7 * comp + .3 * ont - 2 * over))) : 0 };
};
const tkSCol = v => v >= 80 ? 'var(--ok)' : v >= 60 ? 'var(--wn)' : 'var(--bad)';
const tkInP = (t, p) => p === 'all' || [t.created, t.completed].some(d => d && Date.now() - new Date(d) <= (p === 'week' ? 7 : 30) * 864e5);

// ---- which tasks the board shows
const tkMine = () => TASKS.filter(t => canEditWork() || t.assignee === ME.username);
const tkBase = () => { const q = TV.q.toLowerCase(); return tkMine().filter(t => (!TV.team || teamOf(t.assignee) === TV.team) && (!TV.agent || t.assignee === TV.agent) && (!q || (t.title + ' ' + (t.desc || '') + ' ' + tkItems(t.checklist).map(c => c.t).join(' ') + ' ' + an(t.assignee)).toLowerCase().includes(q))); };
const tkOrder = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (isOver(b) ? 1 : 0) - (isOver(a) ? 1 : 0) || (a.due || '9').localeCompare(b.due || '9') || String(b.created).localeCompare(String(a.created));

// ---- one card
// how the cards look (each person chooses): compact like Jira (title, who, due, progress; ▸ opens one card), detailed, or a list
let TKVM = LS.get('qa_tkvm', 'compact'); const TKX = new Set();   // TKX = cards opened in the compact view
const tkVm = v => { TKVM = v; LS.set('qa_tkvm', v); render(); };
const tkExp = id => { if (TKX.has(id)) TKX.delete(id); else TKX.add(id); tkRt(); };
function tkCard(t) {
  const can = canEditWork() || t.assignee === ME.username, ed = canEditWork(), cl = tkItems(t.checklist), dn = cl.filter(c => c.done).length, [pn, pc] = TPRI[t.priority] || TPRI.med, fq = tkFreq(t), td = todayS();
  const open = TKVM === 'detail' || TKX.has(t.id), xb = TKVM === 'detail' ? '' : `<button class="ic tkxp ${open ? 'on' : ''}" onclick="event.stopPropagation();tkExp('${t.id}')" title="${open ? 'Show less' : 'Show the details'}" aria-expanded="${open}">${IC.chev}</button>`;
  const acts = `<span class=tkac onclick="event.stopPropagation()">${can ? `<button class=ic title="${t.pinned ? 'Unpin' : 'Pin to the top'}" onclick="tkSet('${t.id}',{pinned:${!t.pinned}})" style="${t.pinned ? 'color:var(--ac)' : ''}">${TIC.pin}</button><button class=ic title="${t.archived ? 'Restore from the archive' : 'Archive'}" onclick="tkSet('${t.id}',{archived:${!t.archived}})">${TIC.arch}</button>` : ''}${ed ? `<button class=ic title="Edit" onclick="editTask('${t.id}')">${IC.pen}</button><button class=ic title="Delete" onclick="delTask('${t.id}')">${IC.bin}</button>` : ''}</span>`;
  const sw = t.archived ? '' : `<div class=tksw onclick="event.stopPropagation()">${[['todo', 'To Do', TIC.clip], ['doing', 'Active', TIC.act], ...(t.rev || t.status === 'review' ? [['review', 'In review', IC.clock]] : []), ['done', 'Done', TIC.done]].map(([k, n, ic]) => `<button class="${t.status === k ? 'on' : ''}" ${can ? `onclick="mvT('${t.id}','${k}')"` : 'disabled'}>${ic} ${n}</button>`).join('')}</div>`;
  const who = ed ? `<small>For ${esc(an(t.assignee) || t.assignee)} · created by ${esc(an(t.by) || t.by || '—')}</small>` : `<small>Created by ${esc(an(t.by) || t.by || '—')}</small>`;
  const due = !t.due ? '' : t.status === 'done' ? `<span class=tkch>Due ${t.due}</span>` : isOver(t) ? `<span class=tkch style="--c:var(--bad)">${IC.clock} Overdue!</span>` : t.due === td ? `<span class=tkch style="--c:var(--wn)">Due today</span>` : `<span class=tkch>Due ${t.due}</span>`;
  const start = t.start ? (t.start <= td ? `<span class=tkch style="--c:var(--ok)">${TIC.play} Started</span>` : `<span class=tkch>Starts ${t.start}</span>`) : '';
  const cc = t.color || pc, cat = t.category ? `<span class=tkch style="--c:var(--tx)">${esc(t.category)}</span>` : '';   // the card's colour, its category
  const head = `draggable=${can && !t.archived} ondragstart="event.dataTransfer.setData('text/plain','${t.id}')" onclick="TKV='${t.id}';render()"`;
  if (!open) return `<div class="tkx tkc ${t.pinned ? 'pin' : ''}" style="--pc:${cc}" ${head}><div class=tkh><i class=tkdot style="background:${pc}" title="Priority: ${pn}"></i><b title="${esc(t.title)}">${esc(t.title)}</b>${acts}${xb}</div>`
    + `<div class=tkf>${ed ? `<span title="${esc(an(t.assignee) || t.assignee)}">${tkAv(t.assignee, 20)}</span>` : ''}${cl.length ? `<span class=tkch style="--c:${dn === cl.length ? 'var(--ok)' : 'var(--ac)'}">${TIC.clip} ${dn}/${cl.length}</span>` : ''}${due}${t.type === 'mission' ? `<span class=tkch style="--c:var(--wn)" title="Target">${TIC.tgt}</span>` : ''}${t.points ? `<span class=tkch style="--c:var(--ok)">+${t.points} XP</span>` : ''}${tkRevChip(t)}${tkSeqChip(t)}</div>` + tkDates(t) + tkRvBtns(t)
    + (cl.length ? `<div class=tkpb><i style="width:${Math.round(dn / cl.length * 100)}%"></i></div>` : '') + `</div>`;
  if (cl.length) {
    const tot = cl.reduce((a, c) => a + (c.min || 0), 0);
    return `<div class="tkx ${t.pinned ? 'pin' : ''}" style="--pc:${cc}" ${head}><div class=tkh><span style="color:var(--mu)">${TIC.clip}</span><b>${esc(t.title)}</b>${acts}<span class=tkn style="color:${dn === cl.length ? 'var(--ok)' : 'var(--ac)'}">${dn}/${cl.length}</span>${xb}</div>`
      + `<div class=tkit onclick="event.stopPropagation()">${cl.map((c, i) => `<label><input type=checkbox ${c.done ? 'checked' : ''} ${can && !t.archived ? '' : 'disabled'} onchange="tickT('${t.id}',${i},this.checked)"><i style="background:${pc}"></i><span style="${c.done ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(c.t)}${c.d ? `<br><small class=mu>${esc(c.d)}</small>` : ''}</span>${c.min ? `<small>${TIC.clock} ${tkMin(c.min)}</small>` : ''}</label>`).join('')}</div>`
      + `<div class=tkf><span class=tkch style="--c:${pc}">${pn}</span><span class=tkch style="--c:#a855f7">${TIC.clip} checklist</span>${cat}${fq ? `<span class=tkch>${FREQN[fq]}</span>` : ''}${due}<small>${cl.length} tasks${tot ? ' · ~' + tkMin(tot) : ''}</small>${tkRevChip(t)}${tkSeqChip(t)}</div>${tkDates(t)}${who}${tkRvBtns(t)}${sw}</div>`;
  }
  return `<div class="tkx ${t.pinned ? 'pin' : ''}" style="--pc:${cc}" ${head}><div class=tkh><i class=tkdot style="background:${pc}"></i><b>${esc(t.title)}</b>${acts}${xb}</div>${t.desc ? `<p>${esc(t.desc.length > 140 ? t.desc.slice(0, 140) + '…' : t.desc)}</p>` : ''}`
    + `<div class=tkf>${due}${start}${t.type === 'mission' ? `<span class=tkch style="--c:var(--wn)">${TIC.tgt} Target</span>` : ''}<span class=tkch style="--c:${pc}">${pn}</span>${cat}${fq ? `<span class=tkch>${FREQN[fq]}</span>` : ''}${t.points ? `<span class=tkch style="--c:var(--ok)">+${t.points} XP</span>` : ''}${tkRevChip(t)}${tkSeqChip(t)}</div>${tkDates(t)}${who}${tkRvBtns(t)}${sw}</div>`;
}

// ---- actions on cards
function tkDrop(ev, st) { ev.preventDefault(); const id = ev.dataTransfer.getData('text/plain'); if (id) mvT(id, st); }
async function mvT(id, st) {
  const t = TASKS.find(x => x.id === id); if (!t || t.status === st) return; const old = t.status; t.status = st; render();
  const r = await api('/api/tasks/' + id, { status: st }, 'PUT');
  if (!r.ok) { t.status = old; render(); return toast(await errOf(r, 'Could not move the card'), true); }
  Object.assign(t, await r.json()); render(); if (st === 'done' && t.status === 'review') toast('Sent for review'); else if (st === 'done' && t.status === 'done') { beep(); toast(t.points ? `Done! +${t.points} XP` : 'Done!'); }
}
const tkApprove = id => mvT(id, 'done');
const tkReturn = id => openForm({ title: 'Send it back', yes: 'Send back', d: { note: '' }, fields: [{ k: 'note', l: 'What should be changed?', t: 'textarea', req: 1 }],
  save: async d => { if (!d.note.trim()) return 'Write what should be changed'; const r = await api('/api/tasks/' + id, { status: 'doing', note: d.note.trim() }, 'PUT'); if (!r.ok) return errOf(r, 'Could not send it back'); TKV = null; await load(); toast('Sent back with your comment'); } });
async function tkSet(id, b) { const t = TASKS.find(x => x.id === id); const r = await api('/api/tasks/' + id, b, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); Object.assign(t, await r.json()); render(); if (b.archived !== undefined) toast(b.archived ? 'Archived' : 'Restored'); }
// ticking a step moves the card by itself: first tick = Active, last tick = Done
async function tickT(id, i, on) {
  const t = TASKS.find(x => x.id === id); t.checklist[i].done = on; const r = await api('/api/tasks/' + id, { checklist: t.checklist }, 'PUT'); if (r.ok) Object.assign(t, await r.json());
  const cl = t.checklist, all = cl.every(c => c.done);
  if (all && t.status !== 'done') return mvT(id, 'done');
  if (!all && t.status === 'done') return mvT(id, 'doing');
  if (on && t.status === 'todo') return mvT(id, 'doing');
  render();
}

// ---- the page
const tkKpi = (t, v, s, ic, c, st) => `<div class="tkk clk ${TV.st === st ? 'on' : ''}" role=button tabindex=0 onclick="TV.st='${st}';render()" onkeydown="if(event.key==='Enter')this.click()" title="Show these tasks"><div class=row><span>${t}</span><span style="color:var(--mu)">${ic}</span></div><b style="color:${c || 'var(--tx)'}">${v}</b><small>${s}</small></div>`;
function tkMyScore() {
  const s = tkStats(TASKS.filter(t => t.assignee === ME.username));
  return `<div class=tkms><div><div class=cap>MY SCORE</div><div class=tkmsv><b style="color:${s.total ? tkSCol(s.score) : 'var(--bad)'}">${s.score}</b><small>/100</small></div><div class=row style="gap:10px"><div style="flex:1">${bar(s.comp, tkSCol(s.score))}</div><small>${Math.round(s.comp)}%</small></div></div><div class=tkmss><div><b>${s.done}/${s.total}</b><small>DONE</small></div><div><b>${s.on}</b><small>ON TIME</small></div><div><b style="${s.over ? 'color:var(--bad)' : ''}">${s.over}</b><small>OVERDUE</small></div></div></div>`;
}
const tkTeams = () => TEAMS.filter(t => !t.system && AGENTS().some(a => a.team === t.id));
const tkTeamChips = (key, cnt) => `<div class=tkchips><button class="tkcp ${TV[key] ? '' : 'on'}" onclick="TV.${key}='';${key === 'team' ? "TV.agent='';" : ''}render()">All Teams</button>${tkTeams().map(t => `<button class="tkcp ${TV[key] === t.id ? 'on' : ''}" onclick="TV.${key}='${t.id}';${key === 'team' ? "TV.agent='';" : ''}render()"><i style="background:${t.color}"></i>${esc(t.name)}${cnt ? ` (${cnt(t.id)})` : ''}</button>`).join('')}</div>`;

// "How XP works", under the number cards (Gabriela, 29 October): the same rules as the code (tasks here, the leaderboard in perf.js)
const tkXpHelp = () => `<details class="card tkxph" ${TV.xph ? 'open' : ''} ontoggle="TV.xph=this.open"><summary><span class="tkstar tgt" aria-hidden="true">★</span> <b>How XP works</b></summary><ul>
  <li>${tr('Every task or target can be worth XP points, from 0 to 1000. The person who creates it, or its template, chooses how many.')}</li>
  <li>${tr('The XP is earned when the task is Done. A task that needs a review earns its XP when the reviewer approves it.')}</li>
  <li>${tr('Each month, the XP of the finished tasks is added up. It is the Task XP on Performance › Recognition.')}</li>
  <li>${tr('Leaderboard points for the month = Task XP + 5 for each kudos + 3 for each green flag + the average score divided by 10 + 10 when the average reaches the team pass mark.')}</li>
  <li>${tr('Every month starts again at 0. XP does not change the quality score or the task score.')}</li></ul></details>`;
function tkMy() {
  const base = tkBase(), act = base.filter(t => !t.archived), arc = base.filter(t => t.archived), ed = canEditWork(), s = tkStats(act);
  const inProg = act.filter(t => t.status === 'doing' || t.status === 'review').length;
  const kp = `<div class=tkkp>${tkKpi('Total Tasks', act.length, 'assigned', TIC.list, '', 'all')}${tkKpi('Completed', s.done, Math.round(s.comp) + '% rate', TIC.done, 'var(--ok)', 'done')}${tkKpi('In Progress', inProg, 'active now', TIC.act, 'var(--wn)', 'active')}${tkKpi('Overdue', s.over, 'need attention', TIC.warn, 'var(--bad)', 'overdue')}${tkKpi('Archived', arc.length, 'click to view', TIC.arch, '', 'archive')}</div>`;
  const cnt = k => k === 'archive' ? arc.length : k === 'all' ? act.length : act.filter(t => tkStOk(t, k)).length;
  const segs = [['all', `All (${cnt('all')})`], ['todo', 'To Do'], ['active', 'Active'], ['done', 'Done'], ['overdue', 'Overdue'], ['archive', `${TIC.arch} Archives (${cnt('archive')})`]];
  const all = tkMine().filter(t => !t.archived), people = AGENTS().filter(a => !TV.team || a.team === TV.team);
  const filt = `<section class="card tkfl"><div class=row style="justify-content:flex-start;gap:12px;flex-wrap:wrap"><div class=sx style="width:300px"><span>${IC.search}</span><input id=tkq placeholder="Search tasks…" value="${esc(TV.q)}" oninput="TV.q=this.value;tkRt()"></div><div class=sg>${segs.map(([k, n]) => `<button class="${TV.st === k ? 'on' : ''}" onclick="TV.st='${k}';render()">${n}</button>`).join('')}</div><div class=sg role=group style="margin-left:auto">${[['board', 'Board'], ['time', 'Timeline']].map(([k, n]) => `<button class="${TV.view === k ? 'on' : ''}" aria-pressed="${TV.view === k}" onclick="TV.view='${k}';LS.set('qa_tkview','${k}');render()">${n}</button>`).join('')}</div></div>`
    + (ed ? `<div class=tkrow><span class=cap>TEAM</span>${tkTeamChips('team', id => all.filter(t => teamOf(t.assignee) === id).length)}</div><div class=tkrow><span class=cap>AGENT</span><div class=tkchips><button class="tkcp ${TV.agent ? '' : 'on'}" onclick="TV.agent='';render()">All (${people.length})</button>${people.map(a => `<button class="tkcp ${TV.agent === a.username ? 'on' : ''}" onclick="TV.agent='${esc(a.username)}';render()" title="${esc(a.name)} · ${all.filter(t => t.assignee === a.username).length} tasks">${tkAv(a.username, 22)}${esc(a.name.split(' ')[0])}</button>`).join('')}</div></div>` : '') + `</section>`;
  return kp + tkXpHelp() + filt + `<div id=tkbd>${tkBoard()}</div>`;
}
// the status filter: all, to do, active (in progress or in review), done, overdue (late and not done)
const tkStOk = (t, st = TV.st) => st === 'all' || (st === 'active' ? t.status === 'doing' || t.status === 'review' : st === 'overdue' ? isOver(t) : t.status === st);
// the columns of the task list (4 November); "For" only for those who give tasks
const TKSTN = { todo: 'To Do', doing: 'In Progress', review: 'In review', done: 'Done' };
txReg('tasks', { rows: () => tkBase().filter(t => !t.archived && tkStOk(t)).sort(tkOrder), count: () => 0, filters: () => [], clear: () => {},
  get cols() { return [
    { k: 'task', t: 'TASK', lock: true, td: t => `<i class=tkdot style="background:${(TPRI[t.priority] || TPRI.med)[1]}"></i> <b>${esc(t.title)}</b>${t.pinned ? ` <span style="color:var(--ac)">${TIC.pin}</span>` : ''}` },
    ...(canEditWork() ? [{ k: 'for', t: 'FOR', td: t => `<span style="white-space:nowrap">${tkAv(t.assignee, 22)} ${esc(an(t.assignee) || t.assignee)}</span>` }] : []),
    { k: 'st', t: 'STATUS', td: t => TKSTN[t.status] || esc(t.status) },
    { k: 'pr', t: 'PRIORITY', td: t => { const [pn, pc] = TPRI[t.priority] || TPRI.med; return `<span class=tkch style="--c:${pc}">${pn}</span>`; } },
    { k: 'due', t: 'DUE', td: t => `<span style="white-space:nowrap">${t.due ? (isOver(t) ? `<b style="color:var(--bad)">${t.due}</b>` : t.due) : '—'}</span>` },
    { k: 'pg', t: 'PROGRESS', td: t => { const cl = tkItems(t.checklist), dn = cl.filter(c => c.done).length; return cl.length ? `<div class=sv><b class=mono>${dn}/${cl.length}</b>${bar(dn / cl.length * 100, dn === cl.length ? 'var(--ok)' : 'var(--ac)')}</div>` : '—'; } },
    { k: 'cat', t: 'CATEGORY', off: true, td: t => esc(t.category || '—') },
    { k: 'lb', t: 'LABELS', off: true, td: t => chips(t.labels || []) },
    { k: 'start', t: 'START', off: true, td: t => esc(t.start || '—') },
    { k: 'by', t: 'GIVEN BY', off: true, td: t => esc(an(t.by) || t.by || '') },
    { k: 'ty', t: 'TYPE', off: true, td: t => t.type === 'mission' ? tr('Target') : tr('Task') },
    { k: 'xp', t: 'XP', off: true, td: t => t.points || '—' },
    { k: 'rv', t: 'NEEDS REVIEW', off: true, td: t => t.rev ? tr('Yes') : '—' }]; } });
function tkBoard() {
  const base = tkBase();
  if (TV.st === 'archive') { const l = base.filter(t => t.archived).sort((a, b) => String(b.archived).localeCompare(String(a.archived))); return l.length ? `<div class=tkarc>${l.slice(0, 60).map(tkCard).join('')}</div>${l.length > 60 ? `<small class=mu>Showing the 60 most recent of ${l.length}</small>` : ''}` : '<div class=agem>The archive is empty</div>'; }
  const act = base.filter(t => !t.archived);
  if (TV.view === 'time') return tkTime(act.filter(t => tkStOk(t)));
  if (TKVM === 'list') {
    const l = act.filter(t => tkStOk(t)).sort(tkOrder);
    return l.length ? `<div class=card style="padding:12px 0 0">${txBtns('tasks').replace('margin-bottom:8px', 'margin:0 12px 8px')}${txTbl('tasks', l, 'ct', t => `class=clk onclick="TKV='${t.id}';render()"`)}</div>` : '<div class=agem>No tasks here</div>';
  }
  const cols = [['todo', 'To Do', 'var(--mu)', 'Nothing to do'], ['doing', 'In Progress', 'var(--wn)', 'Nothing in progress'], ['review', 'In review', 'var(--ac)', 'Nothing waits for a check'], ['done', 'Done', 'var(--ok)', 'No completed tasks']].filter(([k]) => TV.st === 'all' || TV.st === k || (TV.st === 'active' && (k === 'doing' || k === 'review')) || (TV.st === 'overdue' && k !== 'done'));
  return `<div class=tkkan style="grid-template-columns:repeat(${cols.length},minmax(230px,1fr))">${cols.map(([k, n, c, em]) => { let x = act.filter(t => t.status === k && (TV.st !== 'overdue' || isOver(t))); const total = x.length;
    x = k === 'done' ? x.sort((a, b) => String(b.completed).localeCompare(String(a.completed))).slice(0, 30) : x.sort(tkOrder);
    return `<div class=tkcol ondragover="event.preventDefault()" ondrop="tkDrop(event,'${k}')"><div class=tkchd><span><i style="background:${c}"></i>${n}</span><span class=bg>${total}</span></div>${x.map(tkCard).join('') || `<div class=tkem>${em}</div>`}${total > x.length ? `<small class=mu style="text-align:center">+${total - x.length} older — archive them to keep the board short</small>` : ''}</div>`; }).join('')}</div>`;
}
const tkRt = () => { const b = $('#tkbd'); if (b) b.innerHTML = tkBoard(); };

// ---- Timeline: one bar per task from its start (or the day it was given) to its deadline (or the day it was done), grouped by person,
// five weeks at a time with a line for today
function tkTime(l) {
  const td = todayS(), from = tkAdd(tkMon(td), 7 * (TKW - 1)), N = 35, to = tkAdd(from, N - 1), pos = d => Math.max(0, Math.min(N, Math.round((new Date(d + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5)));
  const span = t => { const s = t.start || tkDay(t.created); let e = t.status === 'done' ? tkDay(t.completed) || t.due || s : t.due || (s > td ? s : td); if (e < s) e = s; return [s, e]; };
  const rows = l.map(t => ({ t, sp: span(t) })).filter(x => x.sp[1] >= from && x.sp[0] <= to).sort((a, b) => a.sp[0].localeCompare(b.sp[0]));
  const col = t => t.status === 'done' ? 'var(--ok)' : t.status === 'review' ? 'var(--ac)' : isOver(t) ? 'var(--bad)' : t.status === 'doing' ? 'var(--wn)' : 'var(--mu)';
  const weeks = Array.from({ length: 5 }, (_, i) => tkAdd(from, i * 7)), tdx = td >= from && td <= to ? (pos(td) + .5) / N * 100 : null;
  const bar = x => { const [s, e] = x.sp, a = pos(s < from ? from : s), b = pos(e > to ? to : e) + 1, t = x.t;
    return `<div class=tktr><button class=tktn onclick="TKV='${t.id}';render()" title="${esc(t.title)}">${esc(t.title)}</button><div class=tktl>${tdx == null ? '' : `<i class=tktd style="left:${tdx}%"></i>`}<button class=tktb style="left:${a / N * 100}%;width:${Math.max(1, b - a) / N * 100}%;--c:${col(t)}" onclick="TKV='${t.id}';render()" title="${esc(t.title)} · ${tkD(s)} → ${tkD(e)}">${b - a > 3 ? esc(t.title) : ''}</button></div></div>`; };
  const by = {}; rows.forEach(x => (by[x.t.assignee] = by[x.t.assignee] || []).push(x));
  const people = Object.keys(by).sort((a, b) => (an(a) || a).localeCompare(an(b) || b));
  const head = `<div class="tktr tkth"><span></span><div class=tktl>${weeks.map((w, i) => `<span style="left:${i * 7 / N * 100}%">${tkD(w)}</span>`).join('')}${tdx == null ? '' : `<b style="left:${tdx}%">${tr('Today')}</b>`}</div></div>`;
  const nav = `<div class=row style="margin-bottom:10px;flex-wrap:wrap;gap:8px"><div class=sg><button onclick="TKW-=4;tkRt()">‹ Earlier</button><button class="${TKW ? '' : 'on'}" onclick="TKW=0;tkRt()">Today</button><button onclick="TKW+=4;tkRt()">Later ›</button></div><div class=tklg>${[['To Do', 'var(--mu)'], ['In Progress', 'var(--wn)'], ['In review', 'var(--ac)'], ['Done', 'var(--ok)'], ['Overdue', 'var(--bad)']].map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div></div>`;
  if (!rows.length) return nav + '<div class=agem>No tasks in these five weeks</div>';
  return nav + `<section class="card tktm">${head}${people.map(u => (canEditWork() ? `<div class=tktp>${tkAv(u, 22)} <b>${esc(an(u) || u)}</b> <small class=mu>${by[u].length}</small></div>` : '') + by[u].map(bar).join('')).join('')}</section>`;
}

// ---- Library: every task given (to give it again), the templates, and the sequences
function tkLib() {
  const seg = `<div class=sg role=tablist style="margin-bottom:14px">${[['hist', 'History'], ['tpl', 'Templates'], ['seq', 'Sequences']].map(([k, n]) => `<button role=tab class="${TV.lib === k ? 'on' : ''}" aria-selected="${TV.lib === k}" onclick="TV.lib='${k}';render()">${n}</button>`).join('')}</div>`;
  return seg + (TV.lib === 'tpl' ? tkTpls() : TV.lib === 'seq' ? tkSeqs() : tkHist());
}
// the history: one line per task given (a task given to several people at once is one line)
function tkHist() {
  const g = {}; TASKS.forEach(t => { const k = t.group || t.id; (g[k] = g[k] || []).push(t); });
  const q = TV.hq.toLowerCase(), l = Object.values(g).map(ts => ({ ts, t: ts[0], at: ts.reduce((a, x) => x.created > a ? x.created : a, '') })).filter(x => !q || (x.t.title + ' ' + x.ts.map(z => an(z.assignee)).join(' ')).toLowerCase().includes(q)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const rows = l.slice(0, 150).map(({ ts, t }) => { const dn = ts.filter(z => z.status === 'done').length, who = [...new Set(ts.map(z => z.assignee))];
    return `<tr><td><b class=clk onclick="TKV='${t.id}';render()">${esc(t.title)}</b>${t.run ? ` <span class=tkch style="--c:#a855f7">${esc(t.seqName || '')}</span>` : t.key ? ` <span class=tkch>${FREQN[tkFreq(t)] || ''}</span>` : ''}</td><td>${who.length === 1 ? esc(an(who[0]) || who[0]) : `${who.length} people`}</td><td style="white-space:nowrap">${tkD(t.created)}</td><td style="white-space:nowrap">${t.due ? tkD(t.due) : '—'}</td><td><span class=tkch style="--c:${dn === ts.length ? 'var(--ok)' : 'var(--mu)'}">${dn}/${ts.length} done</span></td><td style="white-space:nowrap"><button class=ib onclick="tkAgain('${t.id}')">Give again</button> <button class=ic title="Save as a template" aria-label="Save as a template" onclick="tkToTpl('${t.id}')">${TIC.tpl}</button></td></tr>`; }).join('');
  return `<div class=row style="margin-bottom:12px;justify-content:flex-start;gap:12px;flex-wrap:wrap"><div class=sx style="width:300px"><span>${IC.search}</span><input placeholder="Search the history…" value="${esc(TV.hq)}" oninput="TV.hq=this.value;clearTimeout(tkHist.t);tkHist.t=setTimeout(render,250)"></div><small class=mu>${l.length} tasks given · "Give again" copies a task with new dates and people</small></div>`
    + (rows ? `<section class=card style="padding:0"><div class=sc><table class=ct><tr><th>TASK</th><th>GIVEN TO</th><th>GIVEN ON</th><th>DEADLINE</th><th>PROGRESS</th><th></th></tr>${rows}</table></div></section>` : '<div class=agem>No tasks given yet</div>');
}
// give a task again: the same text, steps and settings, the same people (change them), new dates
const tkAgain = id => { const t = TASKS.find(x => x.id === id), ts = TASKS.filter(x => (x.group || x.id) === (t.group || t.id)); TKV = null;
  newTask({ _t: 'Give this task again', title: t.title, desc: t.desc || '', type: t.type, priority: t.priority, points: t.points || 0, labels: t.labels || [], rev: !!t.rev, checklist: tkUnlines(t.checklist), assignees: [...new Set(ts.map(x => x.assignee))], teams: [], start: '', due: '' }); };
const tkToTpl = id => { const t = TASKS.find(x => x.id === id), cl = tkItems(t.checklist); TKV = null;
  openForm({ title: 'Save as a template', w: 640, yes: 'Create', d: { title: t.title, desc: t.desc || '', kind: t.type === 'mission' ? 'target' : cl.length ? 'checklist' : 'task', priority: t.priority, checklist: tkUnlines(t.checklist), color: SWATCH[1], points: t.points || 0, freq: 'none', weekday: 1, monthday: 1, until: '', rev: !!t.rev, teams: [], users: [] }, fields: TPL_FIELDS, save: tplSave() }); };
// the sequences: each step is a number of days after the start; given to people or teams, once or every month / quarter
function tkSeqs() {
  const l = TSEQ.seqs || [];
  return `<p class=mu style="margin:0 0 14px">A sequence gives several tasks at once, each starting some days after the start date — for example a first week, a monthly routine, or a training plan.</p><div class=tktp>${l.map(s => { const runs = (TSEQ.runs || []).filter(r => r.seq === s.id && r.active !== false);
    return `<div class=tktc style="--tc:#a855f7"><div class=tkh><div style="flex:1;min-width:0"><b style="font-size:17px">${esc(s.name)}</b>${s.desc ? `<br><small>${esc(s.desc)}</small>` : ''}</div><span class=tkac><button class=ic title="Edit" onclick="tkSeqEdit('${s.id}')">${IC.pen}</button><button class=ic title="Delete" onclick="tkSeqDel('${s.id}')">${IC.bin}</button></span></div>`
      + `<div class=tkti>${s.steps.map(st => `<div><span><b class=mono>Day ${st.day + 1}</b> · ${esc(st.title)}</span><small>${tr(st.days > 1 ? st.days + ' days' : '1 day')}${st.rev ? ' · ' + tr('Needs review') : ''}</small></div>`).join('')}</div>`
      + runs.map(r => `<small class=tksr>${TIC.act} ${esc([...(r.teams || []).map(tn), ...(r.users || []).map(an)].join(', ') || '—')} · ${tr('Start date')}: ${tkD(r.start)}${r.repeat !== 'none' ? ` · ${tr(r.repeat === 'monthly' ? 'Every month' : 'Every quarter')}${r.until ? ' · ' + tr('Until') + ': ' + tkD(r.until) : ''} <button class=ib style="padding:2px 8px" onclick="tkRunStop('${r.id}')">Stop</button>` : ''}</small>`).join('')
      + `<div class=row style="border-top:1px solid var(--bd);padding-top:10px;margin-top:auto"><small>${tr(s.steps.length + ' steps')} · ${tr(Math.max(...s.steps.map(st => st.day + st.days)) + ' days')}</small><button class=pb onclick="tkSeqGive('${s.id}')">Give</button></div></div>`; }).join('') || '<div class=agem>No sequences yet. Make one for the tasks you always give together.</div>'}</div>`;
}
// steps typed one per line: "day | title | days" (days is optional), for example "1 | Shadow 5 calls | 2"
const tkSeqLines = l => (l || []).map(x => { const m = String(x).match(/^\s*(\d+)\s*\|\s*(.+?)(?:\s*\|\s*(\d+)\s*)?$/); return m ? { day: Math.max(1, +m[1]) - 1, title: m[2].trim(), days: +(m[3] || 1) } : null; }).filter(Boolean);
const SEQ_FIELDS = [{ k: 'name', l: 'Name', req: 1, ph: 'New agent: first two weeks' }, { k: 'desc', l: 'Description', t: 'textarea', rows: 2 },
  { k: 'steps', l: 'Steps: one per line, "day | task | how many days"', t: 'lines', rows: 7, req: 1, ph: '1 | Read the product guide | 2\n3 | Shadow 5 calls\n8 | First solo review | 3' },
  { k: 'priority', l: 'Priority', t: 'select', o: [['low', 'Low'], ['med', 'Medium'], ['high', 'High']] }, { k: 'rev', l: 'Every step needs my review before it is done', t: 'checkbox' }];
const tkSeqSave = id => async d => { const steps = tkSeqLines(d.steps).map(s => ({ ...s, priority: d.priority, rev: !!d.rev })); if (!steps.length) return 'Write at least one step, like "1 | Read the guide"';
  const r = await api('/api/task-seqs' + (id ? '/' + id : ''), { name: d.name, desc: d.desc, steps }, id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save the sequence'); await load(); toast(id ? 'Sequence saved' : 'Sequence created'); };
const tkSeqNew = () => openForm({ title: 'New sequence', w: 640, yes: 'Create', d: { name: '', desc: '', steps: [], priority: 'med', rev: false }, fields: SEQ_FIELDS, save: tkSeqSave() });
const tkSeqEdit = id => { const s = TSEQ.seqs.find(x => x.id === id); openForm({ title: 'Edit sequence', w: 640, d: { name: s.name, desc: s.desc || '', steps: s.steps.map(st => `${st.day + 1} | ${st.title}${st.days > 1 ? ' | ' + st.days : ''}`), priority: (s.steps[0] || {}).priority || 'med', rev: s.steps.some(st => st.rev) }, fields: SEQ_FIELDS, save: tkSeqSave(id) }); };
const tkSeqDel = id => ask('Delete this sequence?', 'Its repeating rounds stop. Tasks already given stay.', async () => { await api('/api/task-seqs/' + id, null, 'DELETE'); await load(); render(); toast('Sequence deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const tkRunStop = id => ask('Stop repeating?', 'No new rounds are given. Tasks already given stay.', async () => { await api('/api/task-runs/' + id, { active: false }, 'PUT'); await load(); render(); toast('Stopped'); }, { yes: 'Stop', no: 'Cancel' });
const tkSeqGive = id => { const s = TSEQ.seqs.find(x => x.id === id);
  openForm({ title: tr('Give') + ': ' + s.name, w: 600, yes: 'Give', d: { start: todayS(), repeat: 'none', until: '', teams: TV.team ? [TV.team] : [], users: [] },
    fields: [{ k: 'start', l: 'Start date (day 1)', t: 'date', req: 1 }, { k: 'repeat', l: 'Start again', t: 'select', re: 1, o: [['none', 'No, once'], ['monthly', 'Every month'], ['quarterly', 'Every quarter']] }, { k: 'until', l: 'Until (optional)', t: 'date', show: d => d.repeat !== 'none' },
      { k: 'teams', l: 'Give to whole teams', t: 'multi', o: () => tkTeams().map(t => [t.id, t.name]) }, { k: 'users', l: 'And / or specific people', t: 'multi', o: agentOpts }],
    save: async d => { const r = await api('/api/task-seqs/' + id + '/give', d); if (!r.ok) return errOf(r, 'Could not give the sequence'); const j = await r.json(); await load(); toast(`${j.tasks} tasks given to ${j.people} ${j.people === 1 ? 'person' : 'people'}`); } }); };

// ---- Team Progress: how far everybody is today (who is behind comes first)
function tkTeam() {
  const td = todayS(), people = AGENTS().filter(a => !TV.et || a.team === TV.et).map(a => {
    const l = TASKS.filter(t => t.assignee === a.username && !t.archived), today = l.filter(t => t.due === td || (t.status !== 'done' && (!t.start || t.start <= td)) || (t.completed && iso(new Date(t.completed)) === td));
    let u = 0, d = 0; today.forEach(t => { const cl = tkItems(t.checklist); if (cl.length) { u += cl.length; d += t.status === 'done' ? cl.length : cl.filter(c => c.done).length; } else { u++; if (t.status === 'done') d++; } });
    const last = l.filter(t => t.completed).sort((x, y) => String(y.completed).localeCompare(String(x.completed)))[0];
    return { a, u, d, pct: u ? d / u * 100 : 100, open: l.filter(t => t.status === 'todo').length, act: l.filter(t => t.status === 'doing' || t.status === 'review').length, over: l.filter(isOver).length, last };
  }).sort((x, y) => x.pct - y.pct || y.over - x.over);
  const teams = tkTeams().filter(t => !TV.et || t.id === TV.et).map(t => { const p = people.filter(x => x.a.team === t.id), u = p.reduce((s, x) => s + x.u, 0), d = p.reduce((s, x) => s + x.d, 0); return { t, n: p.length, pct: u ? d / u * 100 : null, over: p.reduce((s, x) => s + x.over, 0) }; }).filter(x => x.n);
  return tkTeamChips('et') + `<div class=tktg>${teams.map(x => `<div class=tkk><div class=row><span><i class=tkdot style="background:${x.t.color}"></i> ${esc(x.t.name)}</span><small>${x.n} agents</small></div><b style="color:${x.pct == null ? 'var(--mu)' : tkSCol(x.pct)}">${x.pct == null ? '—' : Math.round(x.pct) + '%'}</b>${bar(x.pct || 0, x.pct == null ? 'var(--bd)' : tkSCol(x.pct))}<small>done today${x.over ? ` · <span style="color:var(--bad)">${x.over} overdue</span>` : ''}</small></div>`).join('')}</div>`
    + `<div class=tkpg>${people.map(x => `<div class="tkp clk" onclick="TV.tab='my';TV.agent='${esc(x.a.username)}';TV.team='';TV.st='all';render()"><div class=row style="justify-content:flex-start;gap:10px">${tkAv(x.a.username, 36)}<div style="min-width:0;flex:1"><b>${esc(x.a.name)}</b><br><small>${esc(tn(x.a.team))}</small></div><b style="color:${tkSCol(x.pct)};font-size:16px">${Math.round(x.pct)}%</b></div>${bar(x.pct, tkSCol(x.pct))}<div class=row style="flex-wrap:wrap;gap:6px;justify-content:flex-start"><span class=tkch>${x.d}/${x.u} today</span><span class=tkch>${x.open} to do</span><span class=tkch style="--c:var(--wn)">${x.act} active</span>${x.over ? `<span class=tkch style="--c:var(--bad)">${x.over} overdue</span>` : ''}</div><small>${x.last ? 'Last done ' + fdt(x.last.completed) : 'Nothing completed yet'}</small></div>`).join('') || '<div class=agem>No agents in this team</div>'}</div>`;
}

// ---- Evaluation: score of every agent (click a name to open the agent profile)
const TKS = { name: r => r.a.name, total: r => r.s.total, done: r => r.s.done, on: r => r.s.on, over: r => r.s.over, comp: r => r.s.comp, score: r => r.s.score };
function tkEval() {
  const rows = AGENTS().filter(a => !TV.et || a.team === TV.et).map(a => ({ a, s: tkStats(TASKS.filter(t => t.assignee === a.username && tkInP(t, TV.p))) })), g = TKS[TV.sk];
  rows.sort((x, y) => { const a = g(x), b = g(y); return (a > b ? 1 : a < b ? -1 : 0) * TV.sd; });
  const th = (k, t, al) => `<th style="cursor:pointer;${al ? 'text-align:' + al : ''}" onclick="TV.sd=TV.sk==='${k}'?-TV.sd:(${k === 'name' ? 1 : -1});TV.sk='${k}';render()">${t} <span style="opacity:${TV.sk === k ? 1 : .4}">${TV.sk === k ? (TV.sd > 0 ? '↑' : '↓') : '↕'}</span></th>`;
  return `<div class=row style="flex-wrap:wrap;gap:10px">${tkTeamChips('et')}<div class=sg>${[['week', 'Week'], ['month', 'Month'], ['all', 'All time']].map(([k, n]) => `<button class="${TV.p === k ? 'on' : ''}" onclick="TV.p='${k}';render()">${n}</button>`).join('')}</div></div>`
    + `<section class="card" style="padding:0;margin-top:14px"><div class=sc><table class="ct tkev"><tr>${th('name', 'AGENT')}${th('total', 'TOTAL', 'center')}${th('done', 'DONE', 'center')}${th('on', 'ON TIME', 'center')}${th('over', 'OVERDUE', 'center')}${th('comp', 'COMPLETION', 'center')}${th('score', 'SCORE', 'center')}</tr>`
    + rows.map(r => `<tr><td><div class=row style="justify-content:flex-start;gap:12px">${tkAv(r.a.username, 32)}<div>${agLink(r.a.username, r.a.name)}<br><small>${esc(tn(r.a.team))}</small></div></div></td><td style="text-align:center">${r.s.total}</td><td style="text-align:center;color:var(--ok)">${r.s.done}</td><td style="text-align:center">${r.s.on}</td><td style="text-align:center;${r.s.over ? 'color:var(--bad)' : ''}">${r.s.over}</td><td><div class=row style="justify-content:center;gap:10px"><div style="width:90px">${bar(r.s.comp, 'var(--ok)')}</div><b>${Math.round(r.s.comp)}%</b></div></td><td style="text-align:center"><span class=tkscore style="--c:${r.s.total ? tkSCol(r.s.score) : 'var(--mu)'}">${r.s.total ? r.s.score : '—'}</span></td></tr>`).join('')
    + `</table></div></section><small class=mu>Score = 70% completion + 30% done on time (by the deadline) − 2 points for every overdue task.</small>`;
}

// ---- Templates: saved task lists, used by hand or repeated by themselves
function tkTpls() {
  const l = TPLS.map(p => ({ ...p, items: tkItems(p.checklist) }));
  return `<p class=mu style="margin:0 0 14px">${l.length} template${l.length === 1 ? '' : 's'} saved</p><div class=tktp>${l.map(p => { const [pn, pc] = TPRI[p.priority] || TPRI.med, fq = p.freq || 'none', kind = p.kind || 'target', tot = p.items.reduce((a, c) => a + (c.min || 0), 0);
    return `<div class=tktc style="--tc:${p.color || '#94a3b8'}"><div class=tkh><div style="flex:1;min-width:0"><b style="font-size:17px">${esc(p.title)}</b>${p.desc ? `<br><small>${esc(p.desc)}</small>` : ''}</div><span class=tkac><button class=ic title="Edit" onclick="editTpl('${p.id}')">${IC.pen}</button><button class=ic title="Delete" onclick="delTpl('${p.id}')">${IC.bin}</button></span></div>`
      + `<div class=tkti>${p.items.map(c => `<div><span>${esc(c.t)}</span>${c.min ? `<small>${TIC.clock} ${tkMin(c.min)}</small>` : ''}</div>`).join('') || '<small class=mu>No steps — one single task</small>'}</div>`
      + `<div class=tkf><span class=tkch style="--c:${pc}">${pn}</span><span class=tkch style="--c:#a855f7">${kind}</span>${p.category ? `<span class=tkch style="--c:var(--tx)">${esc(p.category)}</span>` : ''}${fq !== 'none' ? `<span class=tkch style="--c:var(--ac)">recurring · ${FREQN[fq]}</span>` : ''}<small>${p.items.length ? p.items.length + ' tasks' : '1 task'}${tot ? ' · ~' + tkMin(tot) : ''}</small></div>`
      + (fq !== 'none' ? `<small>Goes to: ${esc([...(p.teams || []).map(tn), ...(p.users || []).map(an)].join(', ') || '—')}</small>` : '')
      + `<div class=row style="border-top:1px solid var(--bd);padding-top:10px;margin-top:auto"><small>Created by ${esc(an(p.by) || p.by || '—')}</small><button class=pb onclick="useTpl('${p.id}')">Use template</button></div></div>`; }).join('') || '<div class=agem>No templates yet. Save the lists your agents repeat every day.</div>'}</div>` + tkSugg();
}

PG.tasks = function () {
  const ed = canEditWork(); if (!ed) TV.tab = 'my';
  const tabs = [['my', 'My Tasks', TIC.my], ['team', 'Team Progress', TIC.team], ['ev', 'Evaluation', TIC.ev], ['tpl', 'Library', TIC.tpl]];
  const btn = !ed ? '' : TV.tab === 'tpl' && TV.lib === 'tpl' ? `<button class="btn ibx" onclick="newTpl()">${IC.plus} New Template</button>` : TV.tab === 'tpl' && TV.lib === 'seq' ? `<button class="btn ibx" onclick="tkSeqNew()">${IC.plus} New sequence</button>` : `<button class="btn ibx" onclick="newTask()">${IC.plus} New Task</button>`;
  const top = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class=sx style="width:290px"><span>${IC.search}</span><input class=qi style="padding-right:64px" placeholder="Search lead ID, agent, campaign…" onkeydown='if(event.key=="Enter"){Q=this.value.trim();KQ=true;location.hash="calls"}'><kbd class=kb>Ctrl K</kbd></div>${bellBtn()}${btn}</div>`;
  const body = { my: tkMy, team: tkTeam, ev: tkEval, tpl: tkLib }[TV.tab]();
  return head('Tasks', 'Manage daily tasks, track deadlines, and evaluate agent productivity', top)
    + `<div class=tktop>${ed ? `<div class="tktabs">${tabs.map(([k, n, ic]) => `<button class="${TV.tab === k ? 'on' : ''}" onclick="TV.tab='${k}';render()">${ic} ${n}</button>`).join('')}</div>` : '<div></div>'}${tkMyScore()}</div>` + body;
};

// ---- ready-made templates (from the team's daily work, without brand names): "Add" opens the New template form filled in, to change and save
const TSUGG = [
  { title: 'Daily morning routine', kind: 'checklist', priority: 'high', category: 'Daily', color: '#3b82f6', freq: 'daily', checklist: [['Check work email', 5], ['Check the escalation group and follow up on open cases', 10], ['Check the VIP group for pending withdrawal escalations', 0], ['Close the unsolved tickets', 20], ['Check the portfolio, results and deposits', 5], ['Check failed deposits', 5], ['Check big losers, winners and players with a balance', 20], ['Check birthdays', 5], ['Update the portfolio with newly closed accounts', 0], ['Check the VIP file and the results by period', 5], ['Collect feedback', 0]] },
  { title: 'VIP daily routine', kind: 'checklist', priority: 'high', category: 'VIP', color: '#a855f7', checklist: [['Check work email', 5], ['Check the escalation group and follow up on open cases', 10], ['Close the unsolved tickets', 20], ['Check the portfolio, results and deposits', 5], ['Check the CRM for big losers, winners and birthdays', 20], ['Check the VIP file and the results by period', 5], ['Collect feedback', 0]] },
  { title: 'Portfolio: monthly work', desc: 'Activities for every month', kind: 'checklist', priority: 'med', category: 'Portfolio', color: '#14b8a6', freq: 'monthly', checklist: [['Introduce the new VIPs', 0], ['Information about closed accounts', 0], ['New players in the portfolio', 0]] },
  { title: 'Portfolio: daily work', desc: 'Daily tasks', kind: 'target', priority: 'high', category: 'Portfolio', color: '#22c55e', checklist: [['Monday cashback', 0], ['Pending withdrawals (postponed)', 0], ['7 days without a deposit', 0], ['Low performance (after 7 days)', 0], ['Push level 3 players', 0], ['Reactivation', 0], ['15 days without a deposit', 0], ['Low performance (after 15 days)', 0], ['Closed accounts', 0], ['Weekend engagement', 0]] },
  { title: 'Workflow activities', kind: 'target', priority: 'high', category: 'Workflow', color: '#f97316', checklist: [['Monday cashback', 0], ['7 days without a deposit', 0], ['Low performance (after 7 days)', 0], ['15 days without a deposit', 0], ['Low performance (after 15 days)', 0], ['Closed accounts', 0], ['Weekend engagement', 0]] },
  { title: 'Reactivation calls', desc: 'Calling', kind: 'target', priority: 'high', category: 'Calls', color: '#ef4444', checklist: [['Call: 1st day', 0], ['Call: 2nd day', 0], ['Call: 3rd day', 0], ['Call: second brand', 0]] }
];
const tkSuggAdd = i => { const x = TSUGG[i]; newTpl({ ...x, title: tr(x.title), desc: x.desc ? tr(x.desc) : '', category: tr(x.category), freq: 'none', checklist: x.checklist.map(([t, min]) => ({ t: tr(t), d: '', min })) }); };
const tkSugg = () => `<h3 style="margin:22px 0 4px">Ready-made templates</h3><p class=mu style="margin:0 0 12px">Start from one of these: Add opens it in the New template form, to change it and save it.</p><div class=tktp>${TSUGG.map((x, i) => { const [pn, pc] = TPRI[x.priority] || TPRI.med, tot = x.checklist.reduce((a, c) => a + c[1], 0);
  return `<div class=tktc style="--tc:${x.color}"><div class=tkh><div style="flex:1;min-width:0"><b style="font-size:16px">${esc(x.title)}</b>${x.desc ? `<br><small>${esc(x.desc)}</small>` : ''}</div></div><div class=tkti>${x.checklist.slice(0, 5).map(([t, m]) => `<div><span>${esc(t)}</span>${m ? `<small>${TIC.clock} ${tkMin(m)}</small>` : ''}</div>`).join('')}${x.checklist.length > 5 ? `<small class=mu>+ ${x.checklist.length - 5} more</small>` : ''}</div><div class=tkf><span class=tkch style="--c:${pc}">${pn}</span><span class=tkch style="--c:#a855f7">${x.kind}</span><span class=tkch style="--c:var(--tx)">${esc(x.category)}</span>${x.freq ? `<span class=tkch style="--c:var(--ac)">${FREQN[x.freq]}</span>` : ''}<small>${x.checklist.length} tasks${tot ? ' · ~' + tkMin(tot) : ''}</small></div><div class=row style="border-top:1px solid var(--bd);padding-top:10px;margin-top:auto;justify-content:flex-end"><button class=pb onclick="tkSuggAdd(${i})">Add</button></div></div>`; }).join('')}</div>`;

// ---- forms
const TASK_FIELDS = [
  { k: 'title', l: 'Title', req: 1 }, { k: 'desc', l: 'Description', t: 'textarea' },
  { k: 'type', l: 'Type', t: 'select', o: [['task', '★ Task'], ['mission', '★ Target (earns XP)']] }, { k: 'priority', l: 'Priority', t: 'select', o: [['low', '🟢 Low'], ['med', '🟡 Medium'], ['high', '🔴 High']] },
  { k: 'start', l: 'Start date', t: 'date' }, { k: 'due', l: 'Deadline', t: 'date' }, { k: 'rev', l: 'Needs my review before it is done', t: 'checkbox', hint: 'When the person marks it done, it waits in In review until you approve it or send it back.' }, { k: 'points', l: 'XP points', t: 'number' },
  { k: 'category', l: 'Category', ph: 'e.g. QA', max: 40 }, { k: 'color', l: 'Colour', t: 'color', o: TCOL }, { k: 'labels', l: 'Labels', t: 'chips' },
  { k: 'checklist', l: 'Steps', t: 'steps' }
];
const newTask = (pre = {}) => openForm({ title: pre._t || (pre.title ? 'New task from template' : 'New task'), w: 640, yes: 'Give to agents', d: { title: '', desc: '', type: 'task', priority: 'med', points: 0, start: '', due: '', rev: false, labels: [], category: '', color: '', checklist: [], assignees: TV.agent ? [TV.agent] : [], teams: TV.team ? [TV.team] : [], ...pre },
  fields: [...TASK_FIELDS, { k: 'teams', l: 'Give to whole teams', t: 'multi', o: () => tkTeams().map(t => [t.id, t.name]) }, { k: 'assignees', l: 'And / or specific agents', t: 'multi', o: agentOpts }],
  save: async d => { const { _t, ...b } = d; const r = await api('/api/tasks', { ...b, checklist: tkLines(d.checklist) }); if (!r.ok) return errOf(r, 'Could not create the task'); const l = await r.json(); TV.tab = 'my'; await load(); toast(`Given to ${l.length} agent${l.length === 1 ? '' : 's'}`); } });
const editTask = id => { const t = TASKS.find(x => x.id === id); TKV = null; openForm({ title: 'Edit task', w: 640, d: { ...t, start: t.start || '', checklist: tkUnlines(t.checklist) }, fields: [...TASK_FIELDS, { k: 'assignee', l: 'Assigned to', t: 'select', o: agentOpts }],
  save: async d => { const old = tkItems(t.checklist), body = { ...d, checklist: tkLines(d.checklist).map(c => ({ ...c, done: !!(old.find(o => o.t === c.t) || {}).done })) }; const r = await api('/api/tasks/' + id, body, 'PUT'); if (!r.ok) return errOf(r, 'Could not save the task'); await load(); toast('Task saved'); } }); };
const delTask = id => ask('Delete this task?', 'It is removed for the agent too. Archive it instead if you want to keep the history.', async () => { TKV = null; const r = await api('/api/tasks/' + id, null, 'DELETE'); toast(r.ok ? 'Task deleted' : await errOf(r, 'Could not delete'), !r.ok); await load(); render(); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const TKM = () => { const t = TASKS.find(x => x.id === TKV); if (!t) { TKV = null; return ''; } const can = canEditWork() || t.assignee === ME.username;
  return OVL(`<div class=mh><h2>${tkStar(t.type === 'mission')} ${esc(t.title)}</h2>${X("TKV=null;render()")}</div><div class=mb><div class=row style="flex-wrap:wrap;gap:8px"><span>${pill(({ todo: 'To do', doing: 'In progress', review: 'In review', done: 'Done' })[t.status], t.status === 'done' ? 'ok' : 'ac')}${t.run ? ' ' + pill(esc(t.seqName || '') + ' · ' + tr(`Step ${t.step} of ${t.steps}`), 'mu') : ''} ${t.archived ? pill('Archived', 'wn') : ''}</span><small class=mu>${esc(an(t.assignee) || t.assignee)} · given by ${esc(an(t.by) || t.by)}</small></div>${t.desc ? `<p style="margin:0">${lineBr(t.desc)}</p>` : ''}${tkCard(t).replace('draggable=true', 'draggable=false').replace(/onclick="TKV='[^']*';render\(\)"/, '')}<h3 class=tklh>History</h3>${tkLog(t)}${canEditWork() ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="ib ibx" onclick="editTask('${t.id}')">${IC.pen} Edit</button><button class="ib ibx" onclick="tkAgain('${t.id}')">${IC.plus} Give again</button><button class="ib ibx" onclick="tkToTpl('${t.id}')">${TIC.tpl} Save as a template</button><button class="ib ibx" onclick="delTask('${t.id}')">${IC.bin} Delete</button></div>` : ''}</div>`, 'TKV=null;render()', 560, 55); };
const TPLMM = () => '';
// the history of a task, newest first (tasks from before the history existed show when they were given and done)
const TKA = { created: 'Given', doing: 'Started', todo: 'Moved back to To Do', review: 'Sent for review', approved: 'Approved', returned: 'Sent back', done: 'Marked done', assigned: 'Given to', due: 'Deadline changed', archived: 'Archived', restored: 'Restored' };
const tkLog = t => { const l = (t.log || []).length ? t.log : [{ at: t.created, by: t.by, a: 'created' }, ...(t.completed ? [{ at: t.completed, by: t.assignee, a: 'done' }] : [])];
  return `<div class=tklog>${l.slice().reverse().map(x => `<div><i class="tkld ${x.a}"></i><div><b>${TKA[x.a] || esc(x.a)}</b>${x.note ? ` · <span>${esc(x.note)}</span>` : ''}<br><small class=mu>${fdt(x.at)}${x.by ? ' · ' + esc(an(x.by) || x.by) : ''}</small></div></div>`).join('')}</div>`; };

const TPL_FIELDS = [
  { k: 'title', l: 'Template name', req: 1 }, { k: 'desc', l: 'Description', t: 'textarea', rows: 2 },
  { k: 'kind', l: 'Type', t: 'select', o: [['task', '★ One-time task'], ['checklist', 'Checklist'], ['target', '★ Target']] }, { k: 'priority', l: 'Priority', t: 'select', o: [['low', 'Low'], ['med', 'Medium'], ['high', 'High']] },
  { k: 'checklist', l: 'Steps', t: 'steps' },
  { k: 'category', l: 'Category', ph: 'e.g. QA', max: 40 }, { k: 'color', l: 'Colour', t: 'color', o: TCOL }, { k: 'points', l: 'XP points', t: 'number' },
  { k: 'freq', l: 'Repeats', t: 'select', re: 1, o: [['none', 'No — I use it by hand'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['quarterly', 'Every quarter']], hint: 'Repeating cards skip the days a person does not work (rota, calendar, time off): they come on the next working day.' },
  { k: 'weekday', l: 'On', t: 'select', show: d => d.freq === 'weekly', o: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((n, i) => [i, n]) },
  { k: 'monthday', l: 'On day of the month (1-28)', t: 'number', show: d => d.freq === 'monthly' || d.freq === 'quarterly', hint: 'For every quarter: in January, April, July and October.' },
  { k: 'until', l: 'Repeat until (optional)', t: 'date', show: d => d.freq !== 'none' }, { k: 'rev', l: 'Needs my review before it is done', t: 'checkbox' },
  { k: 'teams', l: 'Teams that receive it', t: 'multi', show: d => d.freq !== 'none', o: () => tkTeams().map(t => [t.id, t.name]) }, { k: 'users', l: 'Specific agents that receive it', t: 'multi', show: d => d.freq !== 'none', o: agentOpts }
];
const tplSave = id => async d => { const r = await api('/api/task-templates' + (id ? '/' + id : ''), { ...d, checklist: tkLines(d.checklist) }, id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save the template'); await load(); toast(id ? 'Template saved' : 'Template created'); };
const newTpl = (pre = {}) => openForm({ title: 'New template', w: 640, yes: 'Create', d: { title: '', desc: '', kind: 'checklist', priority: 'med', checklist: [], category: '', color: '', points: 0, freq: 'none', weekday: 1, monthday: 1, until: '', rev: false, teams: [], users: [], ...pre }, fields: TPL_FIELDS, save: tplSave() });
const editTpl = id => { const p = TPLS.find(x => x.id === id); openForm({ title: 'Edit template', w: 640, d: { kind: 'target', color: '', category: '', monthday: 1, ...p, checklist: tkUnlines(p.checklist) }, fields: TPL_FIELDS, save: tplSave(id) }); };
const useTpl = id => { const p = TPLS.find(x => x.id === id); newTask({ rev: !!p.rev, title: p.title, desc: p.desc || '', type: p.kind === 'target' ? 'mission' : 'task', priority: p.priority, points: p.points || 0, labels: p.labels || [], color: p.color || '', category: p.category || '', checklist: tkUnlines(p.checklist), tpl: p.id }); };
const delTpl = id => ask('Delete this template?', 'No new cards will be created from it. Cards already given stay.', async () => { await api('/api/task-templates/' + id, null, 'DELETE'); await load(); render(); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
