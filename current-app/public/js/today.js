// ===================== Workforce, phase 3: Team today, the morning brief, patterns to watch =====================
// Workforce › Team today (staff): who is planned today and who is really there (working, on a break, late, not checked in
// yet, absent, on leave), the morning brief, the week ahead (days with fewer people than usual) and patterns to watch
// (late arrivals, missing check-outs, the Bradford score, absences on Mondays or Fridays). The data comes from routes-today.js.
let TDY = null, TDT = LS.get('qa_tdteam', '');
const tdTeam = v => { TDT = v; LS.set('qa_tdteam', v); load().then(render); };
const DOWS = { 1: 'Mondays', 5: 'Fridays' }, BFL = ['', 'Watch', 'Talk to them', 'Serious'];
const tdSig = g => g.kind === 'late' ? tr(`Late ${g.n} times this month (allowed: ${g.of})`) : g.kind === 'noout' ? tr(`No check-out ${g.n} times this month`)
  : g.kind === 'bradford' ? tr(`Bradford score ${g.n} (${g.spells} absences, ${g.days} days in a year)`) : g.kind === 'weekday' ? tr(`Often absent on ${DOWS[g.dow]} (${g.n} of ${g.total} absences)`) : '';
const tdSel = cur => `<select style="width:auto" onchange="tdTeam(this.value)" aria-label="Team"><option value="">${tr('All my teams')}</option>${TEAMS.filter(t => !t.system && (!TDY || TDY.teams.includes(t.id))).map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
// a brief written by the AI shows as it was written; without the AI the page writes the same facts out in the language of the app
function tdBriefFacts(F) {
  const L = [], li = (h, items) => { if (items.length) L.push(`**${tr(h)}**`, ...items.map(x => '- ' + x), ''); };
  li('Right now', [tr(`${F.planned} of ${F.size} planned today, ${F.checkedIn} checked in`),
    ...(F.late.length ? [tr('Late') + ': ' + F.late.map(x => `${x.name} (${tr(`${x.minutes} min`)})`).join(', ')] : []),
    ...(F.notCheckedIn.length ? [tr('Not checked in') + ': ' + F.notCheckedIn.map(x => `${x.name} (${x.shiftStart})`).join(', ')] : []),
    ...(F.absent.length ? [tr('Absent') + ': ' + F.absent.join(', ')] : []),
    ...(F.onLeave.length ? [tr('On leave') + ': ' + F.onLeave.map(x => `${x.name} (${tr(x.type)})`).join(', ')] : [])]);
  li('To watch', F.toWatch.map(g => `${g.name}: ${tdSig(g)}`));
  li('This week', F.weekAhead.map(w => tr(`${wfDay(w.date)}: ${w.planned} planned instead of ${w.usually}`) + (w.away.length ? ' · ' + w.away.join(', ') : '')));
  const W = F.waitingForYou; li('Waiting for you', [...(W.timeOffRequests ? [tr(`${W.timeOffRequests} time off requests`)] : []), ...(W.corrections ? [tr(`${W.corrections} corrections`)] : [])]);
  return L.join('\n');
}
const tdBrief = () => once('tdbrief', async () => { toast(TDY.ai ? 'The AI is writing the brief…' : 'Writing the brief…');
  const r = await api('/api/wf/brief', { team: TDY.team }); if (!r.ok) return toast(await errOf(r, 'Could not write the brief'), true); await load(); render(); toast('Brief ready'); });
const tdTile = (n, l, k) => `<div class="tdk ${k || ''}"><b>${n}</b><span>${tr(l)}</span></div>`;
const tdTiles = C => `<div class=tdks>${tdTile(C.planned + `<small> / ${C.size}</small>`, 'Planned today')}${tdTile(C.working, 'Working now', C.working ? 'ok' : '')}${tdTile(C.brk, 'On a break')}${tdTile(C.late, 'Late', C.late ? 'wn' : '')}${tdTile(C.missing, 'Not checked in', C.missing ? 'bad' : '')}${tdTile(C.absent, 'Absent', C.absent ? 'bad' : '')}${tdTile(C.leave, 'On leave', C.leave ? 'ac' : '')}${tdTile(C.upcoming, 'Later today')}</div>`;
PG.today = function () {
  const T = TDY, top = head('Team today', 'Who is planned today and who is really there', bellBtn());
  if (!T) return top + card('', '<p class=mu style="margin:0">…</p>');
  const one = T.team, R = T.rows, tm = r => !one && TEAMS.filter(t => !t.system).length > 1 ? ' · ' + esc(tn(r.team)) : '';
  const grp = (title, list, k, f) => list.length ? `<div class=tdg><b class="${k || ''}">${tr(title)} <span class=bg>${list.length}</span></b>${list.map(r => `<div class=tdp><span>${esc(r.name)}</span><small class=mu>${f(r)}${tm(r)}</small></div>`).join('')}</div>` : '';
  const people = grp('Not checked in', R.filter(r => r.st === 'missing'), 'bad', r => tr(`shift from ${r.start}`))
    + grp('Late', R.filter(r => r.late), 'wn', r => tr(`${r.late} min late`) + ' · ' + atHm(r.in, r.tz))
    + grp('On a break', R.filter(r => r.st === 'working' && r.brk), '', r => tr('since') + ' ' + atHm(((r.brks || []).find(b => !b.e) || {}).s))
    + grp('Working now', R.filter(r => r.st === 'working' && !r.brk && !r.late), 'ok', r => tr('since') + ' ' + atHm(r.in, r.tz))
    + grp('Later today', R.filter(r => r.st === 'upcoming'), '', r => tr(`shift from ${r.start}`))
    + grp('Checked out', R.filter(r => (r.st === 'done' || r.st === 'extra') && !r.late), '', r => atHm(r.in, r.tz) + '–' + atHm(r.out, r.tz))
    + grp('On leave', R.filter(r => r.st === 'leave'), 'ac', r => esc(ltName(r.lt)))
    + grp('Absent', R.filter(r => r.st === 'absent'), 'bad', r => tr(`shift from ${r.start}`))
    + grp('Day off', R.filter(r => r.st === 'off' || r.st === 'hol'), '', r => r.st === 'hol' ? tr('Holiday') : tr('Day off'));
  const W = T.waiting, B = T.briefs;
  const wait = W.leave || W.fixes ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px">${W.leave ? `<button class=ib onclick="LTAB='req';LS.set('qa_ltab','req');goPage('leave')">${tr(`${W.leave} time off requests`)} ›</button>` : ''}${W.fixes ? `<button class=ib onclick="ATAB='me';LS.set('qa_atab','me');goPage('att')">${tr(`${W.fixes} corrections`)} ›</button>` : ''}</div>` : '';
  const brief = card(tr('Morning brief'), (B.length ? B.map(b => `<div class=aisum>${B.length > 1 ? `<b>${esc(tn(b.team))}</b>` : ''}<div class=prose>${md(b.text || tdBriefFacts(b.facts))}</div><small class=mu>${fdt(b.at)} · ${b.ai ? tr('Written by the AI from the facts of the morning') : tr('Written by the app from the facts of the morning')}${b.err ? ' · ' + esc(b.err) : ''}</small></div>`).join('')
    : `<p class=mu style="margin:0">${T.briefOn ? tr('The brief is written by itself after the first shift of the team starts.') : tr('No brief yet today. Switch on the morning brief in Workforce set-up › Attendance rules, or write it now.')}</p>`)
    + (one ? `<button class=ib style="margin-top:10px" onclick="tdBrief()">${IC.sun} ${tr(B.length ? 'Write it again' : 'Write the brief now')}</button>` : `<small class=mu style="display:block;margin-top:8px">${tr('Choose one team to write its brief.')}</small>`));
  const week = card(tr('The week ahead'), `<div class=tdw>${T.week.map(w => `<div class="tdd${w.warn ? ' warn' : ''}" title="${esc(w.away.map(a => a.name + ' · ' + ltName(a.lt)).join('\n'))}"><small>${wfDay(w.d, { weekday: 'short', day: 'numeric' })}</small><b>${w.usual ? `${w.planned}<small> / ${w.usual}</small>` : '—'}</b><small>${w.away.length ? tr(`${w.away.length} on leave`) : w.usual ? tr('all planned') : tr('nobody planned')}${w.asked ? ' · ' + tr(`${w.asked} asked`) : ''}</small></div>`).join('')}</div><small class=mu style="display:block;margin-top:8px">${tr('Planned / usually planned. Red: fewer people than the rule allows (Workforce set-up › Attendance rules).')}</small>`);
  const sig = card(`${tr('To watch')} <span class=bg>${T.signals.length}</span>`, T.signals.length ? tbl(['Person', 'What to watch', ''], T.signals.map(g => [`<b>${esc(g.name)}</b>${!one ? `<br><small class=mu>${esc(tn(g.team))}</small>` : ''}`, tdSig(g), g.level ? pill(tr(BFL[g.level]), g.level > 1 ? 'bad' : 'wn') : ''])) : `<p class=mu style="margin:0">${tr('✓ Nothing to watch right now.')}</p>`);
  return top + `<div class=row style="gap:8px;flex-wrap:wrap;margin:0 0 12px;justify-content:flex-start">${tdSel(one)}<b>${wfDay(T.d, { weekday: 'long', day: 'numeric', month: 'long' })}</b></div>`
    + (T.since ? '' : `<p class=mu style="margin:0 0 10px">${tr('Attendance is not tracked yet: until an admin sets the start date in Workforce set-up › Attendance rules, nobody is marked absent. Checking in already works.')}</p>`)
    + tdTiles(T.counts) + wait + `<div class="g g2"><div>${card(tr('Who is where'), people || `<p class=mu style="margin:0">${tr('This team has no members yet.')}</p>`)}</div><div>${brief}${week}${sig}</div></div>`;
};
// dashboard: Team today in short (in the Team lead dashboard)
wdef('dash', 'wf_today', 'Team today', 60, (c, s, x) => card(wt(x, 'Team today'), (TDY ? tdTiles(TDY.counts) : '<p class=mu style="margin:0">…</p>') + `<a href="javascript:void(0)" class=agl onclick="goPage('today')">${tr('Open Team today ›')}</a>`), 'Who is in, late, not checked in or on leave right now', 'Lists');
