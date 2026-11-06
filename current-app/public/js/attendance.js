// ===================== Workforce, phase 2: attendance and time off =====================
// Workforce › Attendance: check in / break / check out (the server's clock), the status of every day worked out from the rota
// (late, left early, short, absent), corrections the team lead approves, and for staff the team by day and by month.
// Workforce › Time off: balances, requests (days, half days, hours), approvals, the team calendar, deputies.
// Workforce set-up › Leave types and Attendance rules hold the set-up. The rules run on the server (wf.js, routes-att.js).
let ATTD = null, ATTF = 0, ATAB = LS.get('qa_atab', 'me'), ATT_T = LS.get('qa_atteam', ''), ATD = '', ATDAY = null, ATM = '', ATMON = null;
let LVD = null, LTAB = LS.get('qa_ltab', 'me'), LTM = LS.get('qa_lteam', ''), LCM = '', LCAL = null, LBAL = null, LRQ = null, LPT = 0;
const atRaw = s => { const x = new Date(s); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };   // HH:MM of a moment
const atHm = (s, tz) => { if (!s) return '—'; try { return new Date(s).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }); } catch (e) { return new Date(s).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' }); } };   // tz: the person's own time zone
const atDur = m => { m = Math.max(0, Math.round(m || 0)); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? tr(`${h} h ${r} min`) : tr(`${h} h`)) : tr(`${r} min`); };
// the minutes worked so far; while somebody works the page counts them itself from the check-in and the breaks
const atWorked = s => { if (s.worked != null) return s.worked; if (!s.in) return 0; const now = Date.now();
  return Math.max(0, (now - Date.parse(s.in) - (s.brks || []).reduce((a, b) => a + ((b.e ? Date.parse(b.e) : now) - Date.parse(b.s)), 0)) / 6e4); };
const ltOf = id => (WF().leaveTypes || []).find(t => t.id === id);
const ltName = id => { const t = ltOf(id); return t ? t.name : tr('Away'); };
const PARTS = { full: 'Full day', am: 'Morning (first half)', pm: 'Afternoon (second half)', hours: 'Hours' };
const wfTeamSel = (cur, fn) => { const ts = TEAMS.filter(t => ME.role !== 'agent' || t.id === ME.team); return ts.length > 1 ? `<select style="width:auto" onchange="${fn}(this.value)" aria-label="Team">${ts.map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : `<b>${esc(tn(cur))}</b>`; };
// the status of a day as pills: present / late / left early / short / absent / on leave …
function atPill(s) {
  const m = { none: ['—', ''], untracked: ['—', ''], off: [tr('Day off'), ''], hol: [tr('Holiday'), 'wn'], leave: [esc(ltName(s.lt)), 'ac'], upcoming: [tr('Not started yet'), ''], missing: [tr('Not checked in'), 'bad'], absent: [tr('Absent'), 'bad'],
    working: [s.brk ? tr('On a break') : tr('Working'), 'ok'], done: [tr('Present'), 'ok'], extra: [tr('Worked on a day off'), 'ac'] }[s.st] || [esc(s.st), ''];
  let h = m[1] ? pill(m[0], m[1]) : `<small class=mu>${m[0]}</small>`;
  if (s.late) h += ' ' + pill(tr(`Late ${s.late} min`), 'wn');
  if (s.early) h += ' ' + pill(tr(`Left ${s.early} min early`), 'wn');
  if (s.short && !s.early) h += ' ' + pill(tr(`${atDur(s.short)} short`), 'wn');
  if (s.noOut) h += ' ' + pill(tr('No check-out'), 'bad');
  else if (s.auto) h += ` <small class=mu>${tr('checked out automatically')}</small>`;
  if (s.lt && s.part && s.part !== 'full') h += ' ' + pill(esc(ltName(s.lt)) + ' · ' + tr(PARTS[s.part]), 'ac');
  return h;
}
const atPlan = s => { const sh = wfShift(s.plan); return sh ? `${esc(sh.name)} <small class=mono>${wfTime(sh)}</small>${s.half ? ' ½' : ''}` : s.plan === 'off' ? tr('Day off') : s.plan === 'hol' ? tr('Holiday') : '—'; };

// ---------------------------------------------------------------- my day: the check-in buttons (Attendance page and the dashboard)
const atBtns = s => s.st === 'working'
  ? (s.brk ? `<button class=btn onclick="atPunch('back')">${tr('End the break')}</button><button class=ib onclick="atPunch('out')">${tr('Check out')}</button>` : `<button class=ib onclick="atPunch('break')">${tr('Start a break')}</button><button class=btn onclick="atPunch('out')">${tr('Check out')}</button>`)
  : s.noOut ? `<button class=btn onclick="atPunch('out')">${tr('Check out')}</button>` : s.in ? `<button class=ib onclick="atPunch('in')">${tr('Check in again')}</button>` : `<button class=btn onclick="atPunch('in')">${IC.play} ${tr('Check in')}</button>`;
function atToday(small) {
  const A = ATTD; if (!A) return '<p class=mu style="margin:0">…</p>';
  const s = A.today, sh = wfShift(s.plan), plan = sh ? `${esc(sh.name)} · ${wfTime(sh)}${s.half ? ' · ½' : ''}` : s.plan === 'off' ? tr('Day off') : s.plan === 'hol' ? tr('Holiday') : tr('Not planned');
  return `<div class=atday><div class=atwhen><b>${wfDay(s.d, { weekday: 'long', day: 'numeric', month: 'long' })}</b><small class=mu>${plan}</small></div>
<div class=attimes><span><small class=mu>${tr('In')}</small><b class=mono>${atHm(s.in, s.tz)}</b></span><span><small class=mu>${tr('Out')}</small><b class=mono>${atHm(s.out, s.tz)}</b></span><span><small class=mu>${tr('Worked')}</small><b class=mono id=attw>${s.in ? atDur(atWorked(s)) : '—'}</b></span></div>
<div class=atst>${atPill(s)}</div><div class=atbtn>${atBtns(s)}</div></div>`
    + (small ? '' : `<div class=row style="margin-top:10px;flex-wrap:wrap;gap:8px"><small class=mu>${A.since ? tr(`Late arrivals this ${A.latePeriod}: ${A.lates} of ${A.lateLimit} allowed`) : tr('Attendance is not tracked yet: until an admin sets the start date in Workforce set-up › Attendance rules, nobody is marked absent. Checking in already works.')}</small>${A.fixDays ? `<a href="javascript:void(0)" class=agl onclick="atFix('${s.d}')">${tr('Forgot to check in or out? Ask for a correction')}</a>` : ''}</div>`);
}
const atPunch = a => once('punch', async () => {
  const r = await api('/api/att/punch', { action: a }); if (!r.ok) return toast(await errOf(r, 'Could not save it'), true);
  ATTD = await r.json(); ATTF = Date.now(); render(); toast({ in: 'Checked in', out: 'Checked out', break: 'Break started', back: 'Welcome back' }[a]);
});
// the worked time keeps counting on the page while somebody works
setInterval(() => { const el = $('#attw'); if (el && ATTD && ATTD.today.st === 'working') el.textContent = atDur(atWorked(ATTD.today)); }, 20000);
// asking for a correction of one's own day (the team lead approves it)
const atFix = d => { const A = ATTD, s = [A.today, ...A.days].find(x => x.d === d) || {};
  openForm({ title: tr('Ask for a correction'), yes: 'Send to my team lead', d: { d, in: s.in ? atRaw(s.in) : '', out: s.out && !s.auto ? atRaw(s.out) : '', reason: A.fixReasons[0], note: '' },
    fields: [{ k: 'd', l: 'Day', t: 'date' }, { k: 'in', l: 'Check-in time', t: 'time' }, { k: 'out', l: 'Check-out time', t: 'time', hint: 'Fill in the times as they really were. Your team lead approves the correction.' },
      { k: 'reason', l: 'Reason', t: 'select', o: A.fixReasons.map(x => [x, tr(x)]) }, { k: 'note', l: 'Note (optional)', t: 'textarea', rows: 2 }],
    save: async x => { const r = await api('/api/att/fix', x); if (!r.ok) return errOf(r, 'Could not send it'); await load(); toast('Sent to your team lead'); } }); };
const atFixBtn = (A, s) => { const p = A.fixes.find(f => f.d === s.d && f.status === 'pending');
  if (p) return pill(tr('Correction asked'), 'wn');
  return A.fixDays && !['off', 'hol', 'none', 'leave'].includes(s.st) && wfAdd(s.d, A.fixDays) >= iso(new Date()) ? `<button class=ib onclick="atFix('${s.d}')">${tr('Ask for a correction')}</button>` : ''; };
const FIXST = { pending: ['Waiting for your team lead', 'wn'], approved: ['Approved', 'ok'], rejected: ['Not approved', 'bad'] };
// corrections waiting for the team lead (or their deputy)
const atDo = async (id, ok, why) => { const r = await api('/api/att/fix/' + id + '/decide', { ok, why }); if (!r.ok) return errOf(r, 'Could not decide'); await load(); render(); toast(ok ? 'Correction approved' : 'Correction not approved'); };
const atDecide = (id, ok) => ok ? once('fx' + id, async () => { const e = await atDo(id, true, ''); if (e) toast(e, true); })
  : openForm({ title: tr('Do not approve the correction'), yes: 'Do not approve', d: { why: '' }, fields: [{ k: 'why', l: 'Why (the person sees it)', t: 'textarea', rows: 2 }], save: x => atDo(id, false, x.why) });
const atWaiting = A => A && A.waiting.length ? card(`${tr('Corrections waiting for you')} <span class=bg>${A.waiting.length}</span>`, tbl(['Person', 'Day', 'Check-in', 'Check-out', 'Reason', 'Asked', ''], A.waiting.map(f => [`<b>${esc(f.name)}</b>${f.note ? `<br><small class=mu>${esc(f.note)}</small>` : ''}`, wfDay(f.d), f.in || '—', f.out || '—', esc(tr(f.reason)), fdt(f.at),
  `<span style="white-space:nowrap"><button class=btn onclick="atDecide('${f.id}',true)">${tr('Approve')}</button> <button class=ib onclick="atDecide('${f.id}',false)">${tr('Do not approve')}</button></span>`]))) : '';

// ---------------------------------------------------------------- Workforce › Attendance
const atTab = k => { ATAB = k; LS.set('qa_atab', k); if (k === 'rep') ATRQ = true; load().then(render); };
PG.att = function () {
  const ed = ME.role !== 'agent', tab = ed ? ATAB : 'me', n = ATTD ? ATTD.waiting.length : 0;
  const tabs = ed ? `<div class=sg role=tablist style="margin:0 0 14px">${[['me', 'My attendance'], ['team', 'Team by day'], ['month', 'Team by month'], ['rep', 'Reports']].map(([k, l]) => `<button role=tab class="${tab === k ? 'on' : ''}" onclick="atTab('${k}')">${tr(l)}${k === 'me' && n ? ' · ' + n : ''}</button>`).join('')}</div>` : '';
  return head('Attendance', ed ? 'Check-ins of your teams, worked out day by day' : 'Your check-ins and your days', bellBtn()) + tabs + (tab === 'team' ? atTeamPage() : tab === 'month' ? atMonthPage() : tab === 'rep' ? atRepPage() : atMePage());
};
function atMePage() {
  const A = ATTD; if (!A) return card('', '<p class=mu style="margin:0">…</p>');
  return card('Today', atToday()) + atWaiting(A)
    + card('The last 14 days', tbl(['Day', 'Plan', 'In', 'Out', 'Worked', 'Status', ''], A.days.map(s => [wfDay(s.d), atPlan(s), atHm(s.in, s.tz), s.auto ? `<span class=mu>${atHm(s.out, s.tz)}</span>` : atHm(s.out, s.tz), s.in ? atDur(atWorked(s)) : '—', atPill(s), atFixBtn(A, s)])))
    + (A.fixes.length ? card('My corrections', tbl(['Day', 'Check-in', 'Check-out', 'Reason', 'Asked', 'Status'], A.fixes.map(f => [wfDay(f.d), f.in || '—', f.out || '—', esc(tr(f.reason)) + (f.note ? `<br><small class=mu>${esc(f.note)}</small>` : ''), fdt(f.at), pill(tr(FIXST[f.status][0]), FIXST[f.status][1]) + (f.why ? `<br><small class=mu>${esc(f.why)}</small>` : '')]))) : '');
}
const atTeam = v => { ATT_T = v; LS.set('qa_atteam', v); load().then(render); };
const atDay = d => { ATD = d; load().then(render); };
const atEdit = (u, d) => { const r = ATDAY.rows.find(x => x.u === u) || {};
  openForm({ title: tr('Correct the attendance') + ' · ' + r.name, yes: 'Save the correction', d: { in: r.in ? atRaw(r.in) : '', out: r.out && !r.auto ? atRaw(r.out) : '', reason: '' },
    fields: [{ k: 'in', l: 'Check-in time', t: 'time', hint: 'Empty = no check-in that day.' }, { k: 'out', l: 'Check-out time', t: 'time' }, { k: 'reason', l: 'Reason', req: 1, hint: 'The person is told, and the history keeps it.' }],
    extra: () => (r.log || []).length ? `<div class=tips><b>${tr('History of the day')}</b><ul>${r.log.slice().reverse().map(x => `<li>${atHm(x.at)} · ${esc(an(x.by) || x.by)} · ${esc(tr(LOGW[x.what] || x.what))}</li>`).join('')}</ul></div>` : '',
    save: async x => { const q = await api('/api/att/rec', { u, d, in: x.in, out: x.out, reason: x.reason }, 'PUT'); if (!q.ok) return errOf(q, 'Could not save the correction'); await load(); toast('Attendance corrected'); } }); };
function atTeamPage() {
  const T = ATDAY; if (!T || !T.team) return card('', '<p class=mu style="margin:0">No team to show yet.</p>');
  const today = iso(new Date()), c = f => T.rows.filter(f).length;
  const chips = [['On time', c(r => ['done', 'working'].includes(r.st) && !r.late), 'ok'], ['Late', c(r => r.late), 'wn'], ['Not checked in', c(r => r.st === 'missing'), 'bad'], ['Absent', c(r => r.st === 'absent'), 'bad'], ['On leave', c(r => r.st === 'leave'), 'ac'], ['Day off', c(r => ['off', 'hol'].includes(r.st)), '']];
  return `<div class=row style="gap:8px;flex-wrap:wrap;margin:0 0 12px;justify-content:flex-start">${wfTeamSel(T.team, 'atTeam')}<div class=sg role=group aria-label="Day"><button onclick="atDay(wfAdd(ATDAY.d,-1))" aria-label="Previous day">‹</button><button onclick="atDay('${today}')" class="${T.d === today ? 'on' : ''}">${tr('Today')}</button><button onclick="atDay(wfAdd(ATDAY.d,1))" aria-label="Next day">›</button></div><input type=date value="${T.d}" onchange="atDay(this.value)" style="width:auto"><b>${wfDay(T.d, { weekday: 'long', day: 'numeric', month: 'long' })}</b></div>`
    + (T.since ? '' : `<p class=mu style="margin:0 0 10px">${tr('Attendance is not tracked yet: until an admin sets the start date in Workforce set-up › Attendance rules, nobody is marked absent. Checking in already works.')}</p>`)
    + atWaiting(ATTD)
    + card('', `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px">${chips.map(([l, n, k]) => k ? pill(tr(l) + ' · ' + n, k) : `<span class=tg>${tr(l)} · ${n}</span>`).join(' ')}</div>`
      + (T.rows.length ? tbl(['Person', 'Plan', 'In', 'Out', 'Worked', 'Status', ''], T.rows.map(r => [`<b>${esc(r.name)}</b>`, atPlan(r), atHm(r.in, r.tz), r.auto ? `<span class=mu>${atHm(r.out, r.tz)}</span>` : atHm(r.out, r.tz), r.in ? atDur(atWorked(r)) : '—', atPill(r),
        r.edit && T.d <= today ? `<button class=ic onclick="atEdit(${jsq(r.u)},'${T.d}')" title="${esc(tr('Correct the attendance'))}" aria-label="${esc(tr('Correct the attendance'))}">${IC.pen}</button>` : ''])) : '<p class=mu style="margin:0">This team has no members yet.</p>'));
}
const LOGW = { in: 'Checked in', 'in again': 'Checked in again', out: 'Checked out', break: 'Break started', back: 'Break ended' };   // the history of a day in words
const AMC = { p: 'Present', l: 'Late, left early or short', a: 'Absent', m: 'Not checked in', v: 'On leave', o: 'Day off', h: 'Holiday', w: 'Working now', x: 'Worked on a day off' };
const atMonth = m => { ATM = m; load().then(render); };
function atMonthPage() {
  const M = ATMON; if (!M || !M.team) return card('', '<p class=mu style="margin:0">No team to show yet.</p>');
  const prev = M.m === '0' ? '' : iso(new Date(+M.m.slice(0, 4), +M.m.slice(5) - 2, 1)).slice(0, 7), next = iso(new Date(+M.m.slice(0, 4), +M.m.slice(5), 1)).slice(0, 7);
  const tip = (r, x, d) => esc(wfDay(d) + ' · ' + tr(AMC[x.c] || '') + (x.in ? ' · ' + atHm(x.in) + '–' + atHm(x.out) : '') + (x.late ? ' · ' + tr(`Late ${x.late} min`) : '') + (x.early ? ' · ' + tr(`Left ${x.early} min early`) : '') + (x.lt ? ' · ' + ltName(x.lt) : ''));
  return `<div class=row style="gap:8px;flex-wrap:wrap;margin:0 0 12px;justify-content:flex-start">${wfTeamSel(M.team, 'atTeam')}<div class=sg role=group aria-label="Month"><button onclick="atMonth('${prev}')" aria-label="Previous month">‹</button><button onclick="atMonth('${next}')" aria-label="Next month">›</button></div><input type=month value="${M.m}" onchange="atMonth(this.value)" style="width:auto"><b>${new Date(M.m + '-15').toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' })}</b></div>`
    + card('Summary', M.rows.length ? tbl(['Person', 'Present', 'Late', 'Absent', 'Left early', 'Short days', 'On leave', 'Worked / planned'], M.rows.map(r => [`<b>${esc(r.name)}</b>`, r.present, r.late ? `<b style="color:var(--wn)">${r.late}</b> <small class=mu>${atDur(r.lateMin)}</small>` : '0', r.absent ? `<b style="color:var(--bad)">${r.absent}</b>` : '0', r.early, r.short, r.leave, `<span class=mono>${r.worked} / ${tr(`${r.planned} h`)}</span>`])) : '<p class=mu style="margin:0">This team has no members yet.</p>')
    + (M.rows.length ? card('Day by day', `<div class=sc data-notools><table class="ct amg"><thead><tr><th>${tr('Person')}</th>${M.days.map(d => `<th title="${esc(wfDay(d))}">${+d.slice(8)}</th>`).join('')}</tr></thead><tbody>${M.rows.map(r => `<tr><td><b>${esc(r.name)}</b></td>${r.days.map((x, i) => `<td><i class="amc ${x.c}" title="${x.c ? tip(r, x, M.days[i]) : ''}"></i></td>`).join('')}</tr>`).join('')}</tbody></table></div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:12px">${Object.entries(AMC).map(([k, l]) => `<span><i class="amc ${k}"></i> ${tr(l)}</span>`).join('')}</div>`) : '');
}

// ---------------------------------------------------------------- Workforce › Time off
const lvTab = k => { LTAB = k; LS.set('qa_ltab', k); load().then(render); };
const LST = { pending: ['Waiting for approval', 'wn'], approved: ['Approved', 'ok'], rejected: ['Not approved', 'bad'], cancelled: ['Cancelled', ''] };
const lvDates = L => L.from === L.to ? wfDay(L.from, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : wfDay(L.from, { day: 'numeric', month: 'short' }) + ' – ' + wfDay(L.to, { day: 'numeric', month: 'short', year: 'numeric' });
const lvTakes = L => { const t = ltOf(L.lt) || {}; return t.unit === 'hour' ? tr(`${L.hours} h`) : tr(`${L.days} days`) + (L.part && L.part !== 'full' ? ' · ' + tr(PARTS[L.part]) : ''); };
PG.leave = function () {
  const ed = ME.role !== 'agent', L = LVD, n = L ? L.waiting.length : 0, tab = !ed && ['req', 'bal'].includes(LTAB) ? 'me' : LTAB;
  const tabs = [['me', 'My time off'], ['cal', 'Team calendar'], ...(ed ? [['req', 'Requests'], ['bal', 'Balances']] : [])];
  return head('Time off', 'Leave, half days and hours: ask, approve and plan', `<div style="display:flex;gap:8px">${bellBtn()}<button class=btn onclick="lvAsk()">+ ${tr('Ask for time off')}</button></div>`)
    + `<div class=sg role=tablist style="margin:0 0 14px">${tabs.map(([k, l]) => `<button role=tab class="${tab === k ? 'on' : ''}" onclick="lvTab('${k}')">${tr(l)}${k === 'req' && n ? ' · ' + n : ''}</button>`).join('')}</div>`
    + (!L ? card('', '<p class=mu style="margin:0">…</p>') : tab === 'cal' ? lvCalPage() : tab === 'req' ? lvReqPage() : tab === 'bal' ? lvBalPage() : lvMePage());
};
const lvCard = b => { const t = ltOf(b.lt); if (!t) return ''; const hrs = t.unit === 'hour';
  return `<div class=bx><div class=row><b><span style="color:${t.color}">●</span> ${esc(t.name)}</b>${t.paid ? '' : pill(tr('Unpaid'), 'wn')}</div>`
    + (b.unlimited ? `<div class=lvbig>${b.taken}</div><small class=mu>${tr(hrs ? 'hours taken this year' : 'days taken this year')}</small>`
      : `<div class=lvbig>${b.left}<small> / ${Math.round((b.allowance + b.carried + b.adjust) * 10) / 10}</small></div><small class=mu>${tr(hrs ? 'hours left this year' : 'days left this year')}${b.carried ? ' · ' + tr(`${b.carried} carried over`) : ''}${b.adjust ? ' · ' + tr(`${b.adjust} adjusted`) : ''}</small>`)
    + (b.pending ? `<div>${pill(tr(`${b.pending} waiting for approval`), 'wn')}</div>` : '') + `</div>`; };
function lvMePage() {
  const L = LVD, staff = ME.role !== 'agent';
  return `<div class=bxg style="margin-bottom:14px">${L.balances.map(lvCard).join('')}</div>`
    + card('My time off', (L.mine.length ? tbl(['Type', 'Days', 'Takes', 'Status', 'Note', ''], L.mine.map(x => [`<span style="color:${(ltOf(x.lt) || {}).color || 'var(--mu)'}">●</span> ${esc(ltName(x.lt))}`, lvDates(x) + ((x.off || []).length ? `<br><small class=mu>${tr(`${x.off.length} days cancelled`)}</small>` : ''), lvTakes(x),
      pill(tr(LST[x.status][0]), LST[x.status][1]) + (x.why ? `<br><small class=mu>${esc(x.why)}</small>` : ''), esc(x.note || ''), ['pending', 'approved'].includes(x.status) && x.to >= iso(new Date()) ? `<button class=ib onclick="lvCancel('${x.id}')">${tr(x.status === 'pending' ? 'Withdraw' : 'Cancel days')}</button>` : '']))
      : '<p class=mu style="margin:0">No time off yet. Use “Ask for time off”.</p>') + `<p class=mu style="margin:10px 0 0;font-size:12.5px">${tr('Your requests go to')}: <b>${esc(L.approvers.join(', ') || '—')}</b></p>`)
    + (staff ? card('While you are away', `<p class=mu style="margin:0 0 8px">${tr('A deputy decides about time off and corrections in your place for these dates.')}</p>${L.deputy ? `<p style="margin:0 0 8px"><b>${esc(an(L.deputy.u) || L.deputy.u)}</b> · ${L.deputy.from ? wfDay(L.deputy.from) : '…'} – ${L.deputy.to ? wfDay(L.deputy.to) : '…'}</p>` : ''}<div style="display:flex;gap:8px"><button class=ib onclick="lvDeputy()">${tr(L.deputy ? 'Change the deputy' : 'Choose a deputy')}</button>${L.deputy ? `<button class=ib onclick="lvDeputyOff()">${tr('No deputy')}</button>` : ''}</div>`) : '');
}
const lvCancel = id => { const x = LVD.mine.find(l => l.id === id) || (LVD.waiting || []).find(l => l.id === id); if (!x) return;
  if (x.status === 'pending') return ask('Withdraw this request?', 'Your team lead will not have to decide it any more.', () => lvCancelDo(id, null), { yes: 'Yes, withdraw', no: 'Cancel' });
  const today = iso(new Date()), dates = []; for (let d = x.from; d <= x.to; d = wfAdd(d, 1)) if (d >= today && !(x.off || []).includes(d)) dates.push(d);
  openForm({ title: tr('Cancel days of your time off'), yes: 'Cancel these days', d: { dates: [] }, fields: [{ k: 'dates', l: 'Days to cancel', t: 'multi', o: () => dates.map(d => [d, wfDay(d, { weekday: 'long', day: 'numeric', month: 'long' })]), hint: 'Days that have passed can only be cancelled by your team lead.' }],
    save: async d => d.dates.length ? lvCancelDo(id, d.dates) : tr('Choose the days to cancel') }); };
const lvCancelDo = async (id, dates) => { const r = await api('/api/leave/' + id + '/cancel', dates ? { dates } : {}); if (!r.ok) { const e = await errOf(r, 'Could not cancel'); toast(e, true); return e; } await load(); render(); toast('Time off cancelled'); };
const lvDeputy = () => openForm({ title: tr('Choose a deputy'), yes: 'Save', d: { u: (LVD.deputy || {}).u || '', from: (LVD.deputy || {}).from || iso(new Date()), to: (LVD.deputy || {}).to || '' },
  fields: [{ k: 'u', l: 'Deputy', t: 'select', o: () => [['', tr('Choose…')], ...ROSTER.filter(r => r.active && r.role !== 'agent' && r.username !== ME.username).map(r => [r.username, r.name])] }, { k: 'from', l: 'From', t: 'date' }, { k: 'to', l: 'Until', t: 'date', hint: 'Empty = until you change it.' }],
  save: async d => { const r = await api('/api/leave/deputy', d, 'PUT'); if (!r.ok) return errOf(r, 'Could not save'); await load(); toast('Deputy saved'); } });
const lvDeputyOff = () => once('depoff', async () => { const r = await api('/api/leave/deputy', { u: '' }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); toast('No deputy any more'); });
// requests waiting for the team lead: the balance after it, and the days when too many of the team would be off
const lvWarn = w => (w || []).map(x => `<small style="color:var(--wn);display:block">${esc(tr(`${wfDay(x.d)}: ${x.n} of ${x.size} people off`))}</small>`).join('');
const lvDecide = (id, ok) => ok ? once('lv' + id, async () => { const e = await lvDo(id, true, ''); if (e) toast(e, true); })
  : openForm({ title: tr('Do not approve the time off'), yes: 'Do not approve', d: { why: '' }, fields: [{ k: 'why', l: 'Why (the person sees it)', t: 'textarea', rows: 2 }], save: x => lvDo(id, false, x.why) });
const lvDo = async (id, ok, why) => { const r = await api('/api/leave/' + id + '/decide', { ok, why }); if (!r.ok) return errOf(r, 'Could not decide'); await load(); render(); toast(ok ? 'Time off approved' : 'Time off not approved'); };
function lvReqPage() {
  const L = LVD;
  return card(`${tr('Waiting for you')} <span class=bg>${L.waiting.length}</span>`, L.waiting.length ? tbl(['Person', 'Type', 'Days', 'Takes', 'Left after it', 'Team', 'Note', ''], L.waiting.map(x => [`<b>${esc(x.name)}</b>`, `<span style="color:${(ltOf(x.lt) || {}).color}">●</span> ${esc(ltName(x.lt))}`, lvDates(x), lvTakes(x),
    x.left == null ? '—' : `<b class=mono style="color:${x.left - x.days < 0 ? 'var(--bad)' : 'inherit'}">${Math.round((x.left - x.days) * 10) / 10}</b>`, lvWarn(x.warn) || `<small class=mu>${tr('OK')}</small>`, esc(x.note || ''),
    `<span style="white-space:nowrap"><button class=btn onclick="lvDecide('${x.id}',true)">${tr('Approve')}</button> <button class=ib onclick="lvDecide('${x.id}',false)">${tr('Do not approve')}</button></span>`])) : '<p class=mu style="margin:0">✓ Nothing is waiting for you.</p>')
    + atWaiting(ATTD)
    + (L.decided.length ? card('Decided by you', tbl(['Person', 'Type', 'Days', 'Status'], L.decided.map(x => [esc(x.name), esc(ltName(x.lt)), lvDates(x), pill(tr(LST[x.status][0]), LST[x.status][1])]))) : '');
}
const lvTeam = v => { LTM = v; LS.set('qa_lteam', v); load().then(render); };
const lvMonth = m => { LCM = m; load().then(render); };
function lvCalPage() {
  const C = LCAL; if (!C || !C.team) return card('', '<p class=mu style="margin:0">No team to show yet.</p>');
  const prev = iso(new Date(+C.m.slice(0, 4), +C.m.slice(5) - 2, 1)).slice(0, 7), next = iso(new Date(+C.m.slice(0, 4), +C.m.slice(5), 1)).slice(0, 7), today = iso(new Date());
  const cell = (p, d) => { const x = p.days[d.d]; if (!x) return `<td class="${d.off ? 'off' : ''}${d.hol ? ' hol' : ''}"></td>`; const t = ltOf(x.lt);
    return `<td class="${d.off ? 'off' : ''}"><i class="lvc${x.pend ? ' pend' : ''}${x.part === 'am' || x.part === 'pm' || x.part === 'hours' ? ' part' : ''}" style="--c:${t ? t.color : 'var(--mu)'}" title="${esc(p.name + ' · ' + wfDay(d.d) + ' · ' + (t ? t.name : tr('Away')) + (x.part !== 'full' ? ' · ' + tr(PARTS[x.part]) : '') + (x.pend ? ' · ' + tr('Waiting for approval') : ''))}"></i></td>`; };
  return `<div class=row style="gap:8px;flex-wrap:wrap;margin:0 0 12px;justify-content:flex-start">${wfTeamSel(C.team, 'lvTeam')}<div class=sg role=group aria-label="Month"><button onclick="lvMonth('${prev}')" aria-label="Previous month">‹</button><button onclick="lvMonth('${next}')" aria-label="Next month">›</button></div><b>${new Date(C.m + '-15').toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' })}</b></div>`
    + card('', `<div class=sc data-notools><table class="ct lcal"><thead><tr><th>${tr('Person')}</th>${C.days.map(d => `<th class="${d.off ? 'off' : ''}${d.d === today ? ' tdy' : ''}" title="${esc(wfDay(d.d, { weekday: 'long', day: 'numeric', month: 'long' }) + (d.hol ? ' · ' + tr(d.hol) : ''))}">${+d.d.slice(8)}<br><small>${esc(wfDay(d.d, { weekday: 'narrow' }))}</small>${d.hol ? '<br><small class=holn>●</small>' : ''}</th>`).join('')}</tr></thead>
<tbody>${C.people.map(p => `<tr class="${p.u === ME.username ? 'me' : ''}"><td><b>${esc(p.name)}</b></td>${C.days.map(d => cell(p, d)).join('')}</tr>`).join('')}</tbody>
<tfoot><tr><td><b>${tr('Off')}</b></td>${C.days.map(d => `<td class="${d.warn ? 'warn' : ''}" title="${d.warn ? esc(tr('More of the team is off than the rule allows')) : ''}">${d.n || ''}</td>`).join('')}</tr></tfoot></table></div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:12px">${WF().leaveTypes.map(t => `<span><i class=lvc style="--c:${t.color}"></i> ${esc(t.name)}</span>`).join('')}<span><i class="lvc pend" style="--c:var(--mu)"></i> ${tr('Waiting for approval')}</span><span><i class="lvc part" style="--c:var(--mu)"></i> ${tr('Half day or hours')}</span></div>`);
}
function lvBalPage() {
  const B = LBAL; if (!B || !B.team) return card('', '<p class=mu style="margin:0">No team to show yet.</p>');
  const T = WF().leaveTypes;
  return `<div class=row style="gap:8px;margin:0 0 12px;justify-content:flex-start">${wfTeamSel(B.team, 'lvTeam')}<b>${B.year}</b></div>`
    + card('', B.rows.length ? tbl(['Person', ...T.map(t => t.name), ...(ME.role === 'admin' ? [''] : [])], B.rows.map(r => [`<b>${esc(r.name)}</b>`, ...r.balances.map(b => b.unlimited ? `<small class=mu>${tr(`${b.taken} taken`)}</small>` : `<b class=mono>${b.left}</b> <small class=mu>/ ${Math.round((b.allowance + b.carried + b.adjust) * 10) / 10}</small>${b.pending ? ` <small style="color:var(--wn)">(${b.pending})</small>` : ''}`),
      ...(ME.role === 'admin' ? [`<button class=ib onclick="lvAdjust(${jsq(r.u)})">${tr('Adjust')}</button>`] : [])])) : '<p class=mu style="margin:0">This team has no members yet.</p>');
}
const lvAdjust = u => openForm({ title: tr('Adjust a balance') + ' · ' + an(u), yes: 'Save', d: { lt: (WF().leaveTypes.find(t => t.allowance) || {}).id || '', year: new Date().getFullYear(), days: '', note: '' },
  fields: [{ k: 'lt', l: 'Leave type', t: 'select', o: () => WF().leaveTypes.filter(t => t.allowance).map(t => [t.id, t.name]) }, { k: 'year', l: 'Year', t: 'number' }, { k: 'days', l: 'Days (or hours) to add', t: 'number', hint: 'A minus takes days away, for example -2.' }, { k: 'note', l: 'Note' }],
  save: async d => { const r = await api('/api/leave/adjust', { ...d, u }); if (!r.ok) return errOf(r, 'Could not save'); await load(); toast('Balance adjusted'); } });

// ---------------------------------------------------------------- asking for time off (with the days it takes and the balance after it)
const lvAsk = () => { const T = WF().leaveTypes, t = T.find(x => x.approval && x.unit === 'day') || T[0], d = iso(new Date()); LRQ = { u: '', lt: t.id, from: d, to: d, part: 'full', hours: 2, note: '', pv: null, err: '' }; render(); lvPrev(); };
const lvSet = (k, v) => { LRQ[k] = v; if (k === 'from' && LRQ.to < v) LRQ.to = v; lvPrev(); };
const lvPrev = () => { clearTimeout(LPT); LPT = setTimeout(async () => { if (!LRQ) return; const q = LRQ, r = await api('/api/leave/preview', { u: q.u, lt: q.lt, from: q.from, to: q.to, part: q.part, hours: q.hours });
  if (!LRQ) return; if (r.ok) { LRQ.pv = await r.json(); LRQ.err = ''; } else { LRQ.pv = null; LRQ.err = await errOf(r, 'Check the dates'); } render(); }, 250); };
function LRQM() {
  const q = LRQ, t = ltOf(q.lt) || {}, one = q.from === q.to, lead = ['admin', 'lead'].includes(ME.role), pv = q.pv;
  const people = lead ? ROSTER.filter(r => r.active && r.role === 'agent' && TEAMS.some(x => x.id === r.team)) : [];
  return OVL(`<div class=mh><h2>${tr('Ask for time off')}</h2>${X('LRQ=null;render()')}</div><div class=mb><div class=form style="max-width:none">
${lead ? `<label>${tr('For')}<select onchange="lvSet('u',this.value)"><option value="">${tr('Myself')}</option>${people.map(p => `<option value="${esc(p.username)}" ${q.u === p.username ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><small class=mu>${tr('Time off you register for a member of your team is approved at once.')}</small></label>` : ''}
<label>${tr('Type')}<select onchange="lvSet('lt',this.value)">${WF().leaveTypes.map(x => `<option value="${x.id}" ${x.id === q.lt ? 'selected' : ''}>${esc(x.name)}${x.unit === 'hour' ? ' (' + tr('hours') + ')' : ''}</option>`).join('')}</select></label>
<div class=eg2><label>${tr(t.unit === 'hour' ? 'Day' : 'First day')}<input type=date value="${q.from}" onchange="lvSet('from',this.value)"></label>${t.unit === 'hour' ? `<label>${tr('Hours')}<input type=number min=0.5 max=12 step=0.5 value="${q.hours}" onchange="lvSet('hours',this.value)"></label>` : `<label>${tr('Last day')}<input type=date value="${q.to}" min="${q.from}" onchange="lvSet('to',this.value)"></label>`}</div>
${t.unit !== 'hour' && t.half && one ? `<label>${tr('How much of the day')}<select onchange="lvSet('part',this.value)">${['full', 'am', 'pm'].map(k => `<option value="${k}" ${q.part === k ? 'selected' : ''}>${tr(PARTS[k])}</option>`).join('')}</select></label>` : ''}
<label>${tr('Note (optional)')}<textarea rows=2 oninput="LRQ.note=this.value">${esc(q.note)}</textarea></label>
<div class=lvpv>${q.err ? `<b style="color:var(--bad)">${esc(q.err)}</b>` : pv ? `<b>${tr(pv.unit === 'hour' ? `Takes ${pv.days} hours` : `Takes ${pv.days} days`)}</b>${pv.after.map(a => ` · ${tr(`${a.after} left in ${a.year} after it`)}`).join('')}${pv.after.some(a => a.after < 0) ? `<br><b style="color:var(--bad)">${tr('Not enough left')}</b>` : ''}${lvWarn(pv.warn)}${pv.approval ? `<br><small class=mu>${tr('Your team lead approves it.')}</small>` : ''}` : '…'}</div></div>
<div class=acts><button class=ib onclick="LRQ=null;render()">Cancel</button><button class=btn onclick="lvSend()" ${q.err || !pv || pv.after.some(a => a.after < 0) ? 'disabled' : ''}>${tr(pv && !pv.approval ? 'Save' : 'Send')}</button></div></div>`, 'LRQ=null;render()', 560);
}
const lvSend = () => once('lvsend', async () => { const q = LRQ, r = await api('/api/leave', { u: q.u, lt: q.lt, from: q.from, to: q.to, part: q.part, hours: q.hours, note: q.note });
  if (!r.ok) return toast(await errOf(r, 'Could not send it'), true); const L = await r.json(); LRQ = null; await load(); render(); toast(L.status === 'approved' ? 'Time off saved' : 'Sent to your team lead'); });

// ---------------------------------------------------------------- Workforce set-up › Leave types and Attendance rules
PG.ltypes = function () {
  const L = WF().leaveTypes, yn = v => v ? '✓' : '—';
  return head('Leave types', 'The kinds of time off, how much of each a year, and whether the team lead approves them.', `<button class=btn onclick="ltEdit('')">+ New leave type</button>`)
    + card('', tbl(['Leave type', 'Paid', 'Counted in', 'Per year', 'Carried over (at most)', 'Half days', 'Approval', 'Days off inside count', 'Bradford score', ''], L.map(t => [`<span style="color:${t.color}">●</span> <b>${esc(t.name)}</b>`, yn(t.paid), tr(t.unit === 'hour' ? 'hours' : 'days'), t.allowance || tr('No limit'), t.allowance ? t.carry : '—', t.unit === 'hour' ? '—' : yn(t.half), yn(t.approval), t.unit === 'hour' ? '—' : yn(t.sandwich), yn(t.bradford),
      `<span style="white-space:nowrap"><button class=ic onclick="ltEdit('${t.id}')" title="Edit">${IC.pen}</button>${L.length > 1 ? `<button class=ic onclick="ltDel('${t.id}')" title="Delete">${IC.bin}</button>` : ''}</span>`])))
    + `<p class=mu style="font-size:12.5px">${tr('Balances count working days of each person’s rota: days off and public holidays inside a leave are not taken, unless “Days off inside count” is ticked. People who start during the year get the allowance of the months left.')}</p>`;
};
const ltEdit = id => { const t = ltOf(id);
  openForm({ title: t ? tr('Edit the leave type') : tr('New leave type'), yes: 'Save', d: t ? { ...t } : { id: '', name: '', color: '#16a34a', paid: true, unit: 'day', allowance: 0, carry: 0, half: true, approval: true, sandwich: false, bradford: false },
    fields: [{ k: 'name', l: 'Name', req: 1, ph: 'Annual leave, Sick leave…' }, { k: 'color', l: 'Colour', t: 'color' }, { k: 'paid', l: 'Paid', t: 'checkbox' },
      { k: 'unit', l: 'Counted in', t: 'select', re: 1, o: [['day', tr('days')], ['hour', tr('hours')]] },
      { k: 'allowance', l: 'Per year', t: 'number', re: 1, hint: '0 = no yearly limit (for example sick leave).' }, { k: 'carry', l: 'Carried over to next year (at most)', t: 'number', show: d => +d.allowance > 0 },
      { k: 'half', l: 'Half days allowed', t: 'checkbox', show: d => d.unit !== 'hour' }, { k: 'approval', l: 'The team lead approves it', t: 'checkbox', hint: 'Without approval it is saved at once and the team lead is told.' },
      { k: 'sandwich', l: 'Days off inside count', t: 'checkbox', show: d => d.unit !== 'hour', hint: 'A Friday-to-Monday leave then takes the weekend too.' },
      { k: 'bradford', l: 'Counts in the Bradford score', t: 'checkbox', hint: 'An unplanned absence, such as sick leave.' }],
    save: d => { const list = d.id ? WF().leaveTypes.map(x => x.id === d.id ? d : x) : [...WF().leaveTypes, d]; return wfSave({ leaveTypes: list }, 'Leave type saved'); } }); };
const ltDel = id => { const t = ltOf(id); ask(`Delete “${t.name}”?`, 'Time off already taken with it stays, shown without a type.', () => wfDo({ leaveTypes: WF().leaveTypes.filter(x => x.id !== id) }, 'Leave type deleted'), { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
// the rules being edited are kept as they are typed (ARD), so a refresh of the page in the background never loses them
let ARD = null;
const arSet = (k, v) => { ARD = ARD || JSON.parse(JSON.stringify(WF().rules)); ARD[k] = v; };
const arBf = (i, v) => { arSet('bradford', (ARD || WF().rules).bradford.slice()); ARD.bradford[i] = v; };
PG.attrules = function () {
  const R = ARD || WF().rules, n = (id, k, min, max) => `<input id=${id} type=number min=${min} max=${max} value="${esc(R[k])}" oninput="arSet('${k}',this.value)" style="width:90px">`;
  return head('Attendance rules', 'Late arrivals, alerts, corrections and team absences. The grace minutes are set per shift in Shift templates.', '')
    + card('Tracking', `<label class=arl><span>${tr('Attendance is tracked from')}</span><input id=ar_since type=date value="${esc(R.since)}" onchange="arSet('since',this.value)" style="width:auto"></label><p class=mu style="margin:6px 0 0;font-size:12.5px">${tr('Before this day (or while it is empty) nobody is marked absent and no warnings are sent. Set it on the day everybody starts checking in.')}</p>`)
    + card('Late arrivals', `<label class=arl><span>${tr('Late arrivals allowed per')}</span><select id=ar_lp style="width:auto" onchange="arSet('latePeriod',this.value)"><option value=week ${R.latePeriod === 'week' ? 'selected' : ''}>${tr('week')}</option><option value=month ${R.latePeriod === 'month' ? 'selected' : ''}>${tr('month')}</option></select>${n('ar_ll', 'lateLimit', 0, 50)}</label><p class=mu style="margin:6px 0 0;font-size:12.5px">${tr('After that, every late check-in sends a warning to the person and their team lead. Nothing is deducted.')}</p>`)
    + card('Not checked in', `<label class=arl><span>${tr('Tell the team lead when somebody has not checked in this many minutes after the start of their shift')}</span>${n('ar_ma', 'missingAfter', 0, 240)}</label><p class=mu style="margin:6px 0 0;font-size:12.5px">${tr('0 = no alert. Never about people on leave.')}</p>`)
    + card('Corrections', `<label class=arl><span>${tr('People can ask for a correction up to this many days back')}</span>${n('ar_fd', 'fixDays', 0, 60)}</label><label style="display:block;margin-top:10px">${tr('Reasons to choose from (one per line)')}<textarea id=ar_fr rows=5 oninput="arSet('fixReasons',this.value.split('\n'))">${esc(R.fixReasons.join('\n'))}</textarea></label>`)
    + card('Short days and team absences', `<label class=arl><span>${tr('A day is short when the worked time is below the shift by more than (minutes)')}</span>${n('ar_sg', 'shortGrace', 0, 120)}</label><label class=arl style="margin-top:10px"><span>${tr('Warn when more than this share of a team is off on the same day (%)')}</span>${n('ar_tp', 'teamOffPct', 0, 100)}</label>`)
    + card('Team today and the morning brief', `<label class=rad style="align-items:center;gap:8px"><input type=checkbox ${R.briefOn ? 'checked' : ''} onchange="arSet('briefOn',this.checked)"> ${tr('Send the morning brief to every team lead')}</label><label class=arl style="margin-top:10px"><span>${tr('Minutes after the first shift of the team starts')}</span>${n('ar_ba', 'briefAfter', 0, 240)}</label><p class=mu style="margin:6px 0 10px;font-size:12.5px">${tr('Written by the AI when it is connected (Admin › Integrations; it uses the AI budget), otherwise by the app from the same facts. Only from the day attendance is tracked.')}</p><label class=arl><span>${tr('A day is short-staffed when fewer than this share of the usual people are planned (%)')}</span>${n('ar_mo', 'minOnPct', 0, 100)}</label>`)
    + card('Bradford score', `<p class=mu style="margin:0 0 8px;font-size:12.5px">${tr('Absences × absences × days of unplanned absence in the last 52 weeks: many short absences weigh more than one long one. Which leave types count is set in Leave types.')}</p><div style="display:flex;gap:14px;flex-wrap:wrap">${['Watch from', 'Talk to them from', 'Serious from'].map((l, i) => `<label style="display:flex;flex-direction:column;gap:4px;font-size:12.5px">${tr(l)}<input type=number min=1 value="${esc(R.bradford[i])}" oninput="arBf(${i},this.value)" style="width:110px"></label>`).join('')}</div>`)
    + `<button class=btn onclick="arSave()">${tr('Save the rules')}</button>`;
};
const arSave = () => once('arsave', async () => { const e = await wfSave({ rules: ARD || WF().rules }, 'Attendance rules saved'); if (e) return toast(e, true); ARD = null; render(); });

// ---------------------------------------------------------------- dashboard: my day (check in from the dashboard)
wdef('dash', 'att_me', 'My day', 60, (c, s, x) => card(wt(x, 'My day'), (ATTD ? atToday(true) : '<p class=mu style="margin:0">…</p>') + `<a href="javascript:void(0)" class=agl style="display:inline-block;margin-top:8px" onclick="goPage('att')">${tr('Open Attendance ›')}</a>`), 'Check in and out, and today’s plan', 'Lists');

// ---------------------------------------------------------------- Workforce › Attendance › Reports (staff)
// late arrivals, absences, presence hours, leave balances, the Bradford score and attendance by team for a period; asked for
// again only when the team or the period changes (or with Refresh), not at every refresh of the page
let ATREP = null, ATRQ = true, ATRK = LS.get('qa_atrk', 'late'), ATRTM = LS.get('qa_atrteam', ''), ATRF = '', ATRT = '';
const ATRKS = [['late', 'Late arrivals'], ['abs', 'Absences'], ['hours', 'Presence hours'], ['bal', 'Leave balances'], ['bf', 'Bradford score'], ['teams', 'By team']];
const atRep = (k, v) => { if (k === 'kind') { ATRK = v; LS.set('qa_atrk', v); return render(); } if (k === 'team') { ATRTM = v; LS.set('qa_atrteam', v); } if (k === 'from') ATRF = v; if (k === 'to') ATRT = v; ATRQ = true; load().then(render); };
const atRepPer = p => { const t = new Date(), y = t.getFullYear(), m = t.getMonth(), d = iso(t);
  [ATRF, ATRT] = { month: [iso(new Date(y, m, 1)), d], last: [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))], d30: [wfAdd(d, -29), d], d90: [wfAdd(d, -89), d], year: [y + '-01-01', d] }[p]; ATRQ = true; load().then(render); };
function atRepPage() {
  const P = ATREP, k = ATRK, ts = TEAMS.filter(t => !t.system);
  const ctl = `<div class=row style="gap:8px;flex-wrap:wrap;margin:0 0 12px;justify-content:flex-start"><select style="width:auto" onchange="atRep('team',this.value)" aria-label="Team"><option value="">${tr('All my teams')}</option>${ts.map(t => `<option value="${t.id}" ${t.id === ATRTM ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
<div class=sg role=group aria-label="Period">${[['month', 'This month'], ['last', 'Last month'], ['d30', 'Last 30 days'], ['d90', 'Last 90 days'], ['year', 'This year']].map(([p, l]) => `<button onclick="atRepPer('${p}')">${tr(l)}</button>`).join('')}</div>
<input type=date value="${P ? P.from : ATRF}" onchange="atRep('from',this.value)" style="width:auto" aria-label="From"><span>–</span><input type=date value="${P ? P.to : ATRT}" onchange="atRep('to',this.value)" style="width:auto" aria-label="Until"><button class=ib onclick="ATRQ=true;load().then(render)">${tr('Refresh')}</button></div>`;
  if (!P) return ctl + card('', '<p class=mu style="margin:0">…</p>');
  const kinds = `<div class=sg role=tablist style="margin:0 0 12px">${ATRKS.map(([x, l]) => `<button role=tab class="${k === x ? 'on' : ''}" onclick="atRep('kind','${x}')">${tr(l)}</button>`).join('')}</div>`;
  const nm = p => `<b>${esc(p.name)}</b>`, team = p => esc(tn(p.team)), T = WF().leaveTypes, D = T.filter(t => t.unit !== 'hour'), by = f => P.people.slice().sort((a, b) => f(b) - f(a));
  let body = '';
  if (k === 'late') body = tbl(['Person', 'Team', 'Late arrivals', 'Minutes late', 'On average', 'Left early', 'No check-out'], by(p => p.late * 1e5 + p.lateMin).map(p => [nm(p), team(p), p.late, p.lateMin ? atDur(p.lateMin) : '—', p.late ? atDur(Math.round(p.lateMin / p.late)) : '—', p.early, p.noOut]));
  if (k === 'abs') body = tbl(['Person', 'Team', 'Planned days', 'Absent', 'Unplanned absence (days)', ...D.map(t => t.name)], by(p => p.unplanned * 1e3 + p.absent).map(p => [nm(p), team(p), p.planned, p.absent ? `<b style="color:var(--bad)">${p.absent}</b>` : '0', p.unplanned, ...D.map(t => p.leave[t.id] || '—')]));
  if (k === 'hours') body = tbl(['Person', 'Team', 'Planned days', 'Present', 'Worked hours', 'Planned hours', 'Difference', 'Short days', 'Worked on a day off'], P.people.map(p => { const df = Math.round((p.worked - p.plannedH) * 10) / 10; return [nm(p), team(p), p.planned, p.present, p.worked, p.plannedH, `<span style="color:${df < 0 ? 'var(--wn)' : 'inherit'}">${df > 0 ? '+' : ''}${df}</span>`, p.short, p.extra]; }));
  if (k === 'bal') body = tbl(['Person', 'Team', ...T.map(t => t.name)], P.people.map(p => [nm(p), team(p), ...p.balances.map(b => b.unlimited ? `<small class=mu>${tr(`${b.taken} taken`)}</small>` : `<b class=mono>${b.left}</b> <small class=mu>/ ${Math.round((b.allowance + b.carried + b.adjust) * 10) / 10}</small>`)]));
  if (k === 'bf') body = tbl(['Person', 'Team', 'Absences', 'Days', 'Score', 'Level', 'Last absence'], by(p => p.bradford.score).map(p => [nm(p), team(p), p.bradford.spells, p.bradford.days, `<b class=mono>${p.bradford.score}</b>`, p.bradford.level ? pill(tr(BFL[p.bradford.level]), p.bradford.level > 1 ? 'bad' : 'wn') : `<small class=mu>${tr('Low')}</small>`, p.bradford.last ? wfDay(p.bradford.last) : '—']))
    + `<p class=mu style="margin:10px 0 0;font-size:12.5px">${tr(`Over the 52 weeks up to ${wfDay(P.to)}. Watch from ${P.levels[0]}, talk to them from ${P.levels[1]}, serious from ${P.levels[2]}.`)}</p>`;
  if (k === 'teams') body = tbl(['Team', 'People', 'Planned days', 'Present', 'Late', 'Absent', 'On leave (days)', 'Worked / planned hours'], P.teams.map(t => [`<b>${esc(tn(t.team))}</b>`, t.people, t.planned, t.presentPct == null ? '—' : t.presentPct + '%', t.latePct == null ? '—' : t.latePct + '%', t.absentPct == null ? '—' : t.absentPct + '%', t.leave, `<span class=mono>${t.worked} / ${tr(`${t.plannedH} h`)}</span>`]));
  return ctl + kinds + card(`${tr(ATRKS.find(x => x[0] === k)[1])} · ${wfDay(P.from, { day: 'numeric', month: 'short' })} – ${wfDay(P.to, { day: 'numeric', month: 'short', year: 'numeric' })}`, P.people.length ? body : '<p class=mu style="margin:0">This team has no members yet.</p>')
    + (!P.since ? `<p class=mu style="font-size:12.5px">${tr('Attendance is not tracked yet: until an admin sets the start date in Workforce set-up › Attendance rules, nobody is marked absent. Checking in already works.')}</p>`
      : P.since > P.from ? `<p class=mu style="font-size:12.5px">${tr(`Attendance is tracked from ${wfDay(P.since)}: days before that without a check-in are not counted.`)}</p>` : '');
}
