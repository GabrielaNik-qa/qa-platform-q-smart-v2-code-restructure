// ===================== Workforce, phase 1: the rota, work calendars, shift templates and patterns =====================
// Workforce › Shifts and rota: the plan of each team, week by week. Workforce set-up › Work calendars and Shift templates set up
// the working days and public holidays of each country, the shifts and the repeating patterns. The server works out every day
// (wf.js): a change made on the rota for that day, else a public holiday, else the person's pattern, else their usual shift.
let RTM = LS.get('qa_rteam', ''), RWK = '', ROTA = null, RCE = null, WCE = null, PTE = null;   // team and week shown, the loaded rota, the cell / calendar / pattern being edited
const WF = () => SET.wf || { calendars: [], shifts: [], patterns: [], defShift: '', defCal: '' };
const wfShift = id => WF().shifts.find(s => s.id === id);
const wfMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const wfHrs = s => Math.round(((((wfMin(s.end) - wfMin(s.start) + 1440) % 1440) || 1440) - (s.brk || 0)) / 6) / 10;   // paid hours: start to end (over midnight too) minus the break
const wfTime = s => s.start + '–' + s.end;
const wfAdd = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
const wfDay = (d, o) => new Date(d + 'T12:00:00').toLocaleDateString(I18N.locale(), o || { weekday: 'short', day: 'numeric', month: 'short' });
const WFDOW = [1, 2, 3, 4, 5, 6, 0];                                                     // Monday first; the data keeps Sunday = 0
const wfDow = i => new Date(2026, 9, 25 + i, 12).toLocaleDateString(I18N.locale(), { weekday: 'short' });   // 25 Oct 2026 is a Sunday
const EMPT = { full: 'Full time', part: 'Part time', contract: 'Contract', intern: 'Intern' };
const DAYT = { work: 'Working day', half: 'Half day', off: 'Day off' };

// ---------------------------------------------------------------- Workforce › Shifts and rota
const rtGo = async n => { RWK = n ? wfAdd(ROTA.from, n) : ''; await load(); render(); };
const rtTeam = async v => { RTM = v; LS.set('qa_rteam', v); RWK = ROTA ? ROTA.from : ''; await load(); render(); };
// one day of one person: a shift (its colour), a day off, a public holiday, or nothing before they started / after they left
function rtCell(p, c, d) {
  if (c.lv && !c.lv.pend && c.lv.part === 'full' && c.v !== 'none') { const t = ltOf(c.lv.lt); return `<span class="rc lv" style="--c:${t ? t.color : 'var(--mu)'}" aria-label="${esc(p.name + ', ' + wfDay(d, { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + ltName(c.lv.lt))}">${esc(ltName(c.lv.lt))}<small>${tr('Time off')}</small></span>`; }
  const lvm = c.lv ? `<small class=lvm>${c.lv.pend ? tr('Time off asked') : esc(ltName(c.lv.lt)) + ' · ' + tr(PARTS[c.lv.part] || '')}</small>` : '';
  const s = wfShift(c.v), tag = p.edit ? 'button' : 'span', set = c.src === 'set' ? ' set' : '';
  const what = s ? s.name + ' ' + wfTime(s) : c.v === 'off' ? tr('Day off') : c.v === 'hol' ? tr(c.hol || 'Holiday') : '';   // read out by screen readers: who, which day, what
  const act = (p.edit ? ` onclick="rtPick(${jsq(p.u)},'${d}')"` : '') + ` aria-label="${esc(p.name + ', ' + wfDay(d, { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + what)}"`;
  const tip = esc(c.src === 'set' ? tr('Changed for this day') : c.src === 'pattern' ? tr('From the repeating pattern') : c.src === 'hol' ? c.hol : '');
  if (s) return `<${tag} class="rc${set}" style="--c:${s.color}"${act} title="${tip}">${esc(s.name)}<small>${wfTime(s)}${c.half ? ' · ½' : ''}</small>${lvm}</${tag}>`;
  if (c.v === 'off') return `<${tag} class="rc off${set}"${act} title="${tip}">${tr('Day off')}</${tag}>`;
  if (c.v === 'hol') return `<${tag} class="rc hol"${act} title="${tip}">${tr('Holiday')}</${tag}>`;
  return '<span class=mu>—</span>';
}
PG.rota = function () {
  const R = ROTA, ag = ME.role === 'agent', teams = TEAMS.filter(t => ag ? t.id === ME.team : true);
  const top = head('Shifts and rota', ag ? 'The plan of your team for the week' : 'Who works when, week by week', R && R.edit ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class=ib onclick="rtCopyWeek()">${IC.copy} Copy last week</button><button class=btn onclick="rtAssign()">Usual shifts and patterns</button></div>` : '');
  if (!R || !R.team) return top + card('', '<p class=mu style="margin:0">No team to show yet.</p>');
  const today = iso(new Date()), last = R.days[R.days.length - 1].d, S = WF();
  const nav = `<div class=row style="gap:8px;flex-wrap:wrap;margin:0 0 12px">${teams.length > 1 ? `<select onchange="rtTeam(this.value)" style="width:auto">${teams.map(t => `<option value="${t.id}" ${t.id === R.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : `<b>${esc(tn(R.team))}</b>`}
<div class=sg role=group aria-label="Week"><button onclick="rtGo(-7)" aria-label="Previous week">‹</button><button onclick="rtGo(0)" class="${R.days.some(x => x.d === today) ? 'on' : ''}">This week</button><button onclick="rtGo(7)" aria-label="Next week">›</button></div>
<b>${wfDay(R.from, { day: 'numeric', month: 'short' })} – ${wfDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}</b><span style="flex:1"></span><button class=ib onclick="rtExcel()">${IC.copy} Copy for Excel</button></div>`;
  const legend = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px;font-size:12.5px">${S.shifts.map(s => `<span class=rc style="--c:${s.color};display:inline-block;width:auto;cursor:default">${esc(s.name)}<small>${wfTime(s)} · ${wfHrs(s)} h</small></span>`).join('')}<span class="rc off" style="display:inline-block;width:auto;cursor:default">${tr('Day off')}</span><span class="rc hol" style="display:inline-block;width:auto;cursor:default">${tr('Holiday')}</span><span class="rc lv" style="display:inline-block;width:auto;cursor:default;--c:var(--ok)">${tr('Time off')}</span><span class="rc set" style="display:inline-block;width:auto;cursor:default;--c:var(--mu)">${tr('Changed for this day')}</span></div>`;
  const grid = `<div class=sc data-notools><table class="ct rota"><thead><tr><th>Person</th>${R.days.map(d => `<th class="${d.d === today ? 'tdy' : ''}">${wfDay(d.d)}${d.hol.length ? `<br><small class=holn>${esc(d.hol.map(tr).join(', '))}</small>` : ''}</th>`).join('')}<th>Week</th></tr></thead>
<tbody>${R.people.map(p => `<tr class="${p.u === ME.username ? 'me' : ''}"><td><b>${esc(p.name)}</b><br><small class=mu>${esc(p.title || tr(EMPT[p.empType] || ''))}</small></td>${p.cells.map((c, i) => `<td>${rtCell(p, c, R.days[i].d)}</td>`).join('')}<td class=mono style="white-space:nowrap;color:${p.planned < p.hours ? 'var(--wn)' : p.planned > p.hours ? 'var(--bad)' : 'inherit'}" title="${esc(tr('Planned hours / hours per week in the contract'))}">${p.planned} / ${p.hours} h</td></tr>`).join('')}</tbody>
<tfoot><tr><td><b>On shift</b></td>${R.days.map(d => `<td><b>${d.on}</b> <small class=mu>/ ${R.people.length}</small></td>`).join('')}<td></td></tr></tfoot></table></div>`;
  return top + nav + card('', legend + (R.people.length ? grid : '<p class=mu style="margin:0">This team has no members yet.</p>')
    + (R.edit ? `<small class=mu>${tr('Click a day to change it. The usual plan comes from each person’s usual shift or pattern and their work calendar: set them in Admin › Users, or with “Usual shifts and patterns”.')}</small>` : ''));
};
const rtPick = (u, d) => { RCE = { u, d }; render(); };
function RCEM() {
  const p = ROTA && ROTA.people.find(x => x.u === RCE.u), i = ROTA ? ROTA.days.findIndex(x => x.d === RCE.d) : -1; if (!p || i < 0) { RCE = null; return ''; }
  const c = p.cells[i];
  return OVL(`<div class=mh><div><h2>${esc(p.name)}</h2><small>${wfDay(RCE.d, { weekday: 'long', day: 'numeric', month: 'long' })}${c.hol ? ' · ' + esc(tr(c.hol)) : ''}</small></div>${X('RCE=null;render()')}</div><div class=mb>
<div class=rpick>${WF().shifts.map(s => `<button class="rc${c.v === s.id ? ' cur' : ''}" style="--c:${s.color}" onclick="rtSet('${s.id}')">${esc(s.name)}<small>${wfTime(s)} · ${wfHrs(s)} h</small></button>`).join('')}<button class="rc off${c.v === 'off' ? ' cur' : ''}" onclick="rtSet('off')">${tr('Day off')}</button></div>
${c.src === 'set' ? `<button class=ib style="margin-top:12px" onclick="rtSet('')">Back to the usual plan</button>` : ''}<p class=mu style="margin:12px 0 0;font-size:12.5px">${tr('This changes only this day. Time off (leave and sick days) comes with the next part of Workforce.')}</p></div>`, 'RCE=null;render()', 460);
}
const rtSet = v => once('rtset', async () => {
  const r = await api('/api/wf/rota', { cells: [{ u: RCE.u, d: RCE.d, v }] }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not change the rota'), true);
  RCE = null; await load(); render(); toast('Rota updated');
});
const rtCopyWeek = () => ask('Copy last week into this week?', 'Every day of this week becomes what the same weekday was last week. Public holidays stay holidays.', () => once('rtcopy', async () => {
  const r = await api('/api/wf/rota/copy', { team: ROTA.team, from: ROTA.from }); if (!r.ok) return toast(await errOf(r, 'Could not copy the week'), true);
  await load(); render(); toast('Last week copied');
}), { yes: 'Yes, copy', no: 'Cancel' });
// the usual shift and the repeating pattern of several people at once
const rtAssign = () => openForm({ title: 'Usual shifts and patterns', yes: 'Save', d: { users: [], shift: '_', pattern: '_', patStart: ROTA.from },
  fields: [{ k: 'users', l: 'People', t: 'multi', o: () => ROTA.people.filter(p => p.edit).map(p => [p.u, p.name]) },
    { k: 'shift', l: 'Usual shift', t: 'select', o: () => [['_', tr('Keep as it is')], ['', tr('Company default') + ' (' + ((wfShift(WF().defShift) || {}).name || '') + ')'], ...WF().shifts.map(s => [s.id, s.name + ' · ' + wfTime(s)])], hint: 'Worked on the working days of their calendar.' },
    { k: 'pattern', l: 'Repeating pattern', t: 'select', re: 1, o: () => [['_', tr('Keep as it is')], ['', tr('None: the usual shift on working days')], ...WF().patterns.map(p => [p.id, p.name + ' · ' + p.days.length + ' ' + tr('days')])], hint: 'A pattern repeats on its own, for example 4 days on and 4 days off. Patterns are made in Workforce set-up › Shift templates.' },
    { k: 'patStart', l: 'The pattern starts on', t: 'date', show: d => d.pattern && d.pattern !== '_' }],
  save: async d => {
    if (!d.users.length) return tr('Choose at least one person');
    const b = { users: d.users }; if (d.shift !== '_') b.shift = d.shift; if (d.pattern !== '_') { b.pattern = d.pattern; b.patStart = d.patStart; }
    if (b.shift === undefined && b.pattern === undefined) return tr('Choose a usual shift or a pattern');
    const r = await api('/api/wf/assign', b); if (!r.ok) return errOf(r, 'Could not save');
    await load(); toast('Saved');
  } });
// the week as a table for Excel: one row per person, one column per day
const rtExcel = () => { const R = ROTA, txt = c => { const s = wfShift(c.v); return s ? s.name + ' ' + wfTime(s) + (c.half ? ' ½' : '') : c.v === 'off' ? tr('Day off') : c.v === 'hol' ? tr(c.hol || 'Holiday') : ''; };
  xlCopy([[tr('Person'), ...R.days.map(d => wfDay(d.d)), tr('Planned hours'), tr('Hours per week')], ...R.people.map(p => [p.name, ...p.cells.map(txt), p.planned, p.hours]), [tr('On shift'), ...R.days.map(d => d.on), '', '']]); };

// ---------------------------------------------------------------- Workforce set-up › Work calendars
// saves the Workforce set-up; returns the error message (or nothing when it worked), so forms can stay open on an error
const wfSave = async (body, msg) => { const r = await api('/api/wf/settings', body, 'PUT'); if (!r.ok) return errOf(r, 'Could not save'); await load(); render(); toast(msg || 'Saved'); };
const wfDo = async (body, msg) => { const e = await wfSave(body, msg); if (e) toast(e, true); };
const wcWeek = c => WFDOW.map(i => `<span class="wday ${c.days[i]}" title="${esc(tr(DAYT[c.days[i]]))}">${esc(wfDow(i))}${c.days[i] === 'half' ? ' ½' : ''}</span>`).join('');
PG.wcal = function () {
  const W = WF(), today = iso(new Date());
  return head('Work calendars', 'Working days and public holidays of each country. Every person follows the calendar chosen on their user page.', `<button class=btn onclick="wcEdit('')">+ New calendar</button>`)
    + `<div class=bxg>${W.calendars.map(c => { const next = c.holidays.filter(h => h.d >= today).slice(0, 4), used = USR.filter(u => u.active !== false && (u.cal || W.defCal) === c.id).length;
      return `<div class=bx><div class=row><b>${esc(c.name)}${c.country ? ` <small class=mu>${esc(c.country)}</small>` : ''}</b>${c.id === W.defCal ? pill('Default', 'ac') : ''}</div><div class=wweek>${wcWeek(c)}</div>
<small class=mu>${tr(`${c.holidays.length} public holidays`)} · ${tr(`${used} people`)}</small>${next.length ? `<div style="font-size:12.5px">${next.map(h => `<div>${wfDay(h.d, { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(tr(h.n))}</div>`).join('')}</div>` : ''}
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="ib ibx" onclick="wcEdit('${c.id}')">${IC.pen} Edit</button>${c.id !== W.defCal ? `<button class="ib ibx" onclick="wfDo({defCal:'${c.id}'},'Default calendar changed')">Make default</button><button class="ib ibx" onclick="wcDel('${c.id}')" title="Delete">${IC.bin}</button>` : ''}</div></div>`; }).join('')}</div>`;
};
const wcEdit = id => { const c = WF().calendars.find(x => x.id === id); WCE = c ? JSON.parse(JSON.stringify(c)) : { id: '', name: '', country: '', days: ['off', 'work', 'work', 'work', 'work', 'work', 'off'], holidays: [] }; WCE.paste = ''; WCE.year = new Date().getFullYear(); render(); };
const wcDel = id => { const c = WF().calendars.find(x => x.id === id), n = USR.filter(u => u.cal === id).length;
  ask(`Delete “${c.name}”?`, n ? tr(`${n} people use it. They will follow the default calendar.`) : 'Nobody uses it.', () => wfDo({ calendars: WF().calendars.filter(x => x.id !== id) }, 'Calendar deleted'), { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
function WCEM() {
  const c = WCE, years = [...new Set(c.holidays.map(h => h.d.slice(0, 4)))].sort();
  return OVL(`<div class=mh><h2>${c.id ? tr('Edit the work calendar') : tr('New work calendar')}</h2>${X('WCE=null;render()')}</div><div class=mb><div class=form style="max-width:none">
<div class=eg2><label>Name<input value="${esc(c.name)}" oninput="WCE.name=this.value" placeholder="Bulgaria"></label><label>Country code<input value="${esc(c.country)}" maxlength=2 oninput="WCE.country=this.value.toUpperCase()" placeholder="BG"></label></div>
<div><b style="font-size:12.5px">Working days</b><div class=wpick>${WFDOW.map(i => `<label><span>${esc(wfDow(i))}</span><select onchange="WCE.days[${i}]=this.value">${Object.entries(DAYT).map(([k, l]) => `<option value="${k}" ${c.days[i] === k ? 'selected' : ''}>${esc(tr(l))}</option>`).join('')}</select></label>`).join('')}</div></div>
<div><div class=row><b style="font-size:12.5px">Public holidays <span class=bg>${c.holidays.length}</span></b><span style="display:flex;gap:6px;flex-wrap:wrap">${c.country === 'BG' ? `<select onchange="WCE.year=+this.value" style="width:auto;padding:4px">${[0, 1, 2].map(k => new Date().getFullYear() + k).map(y => `<option ${c.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select><button type=button class=ib onclick="wcBg()">Add Bulgaria’s holidays</button>` : ''}<button type=button class=ib onclick="wcAdd()">+ Add a day</button></span></div>
${years.map(y => `<details ${y >= String(new Date().getFullYear()) ? 'open' : ''}><summary style="cursor:pointer;margin:8px 0 4px"><b>${y}</b> <small class=mu>${c.holidays.filter(h => h.d.startsWith(y)).length}</small></summary>${c.holidays.map((h, k) => h.d.startsWith(y) ? `<div class=row style="gap:6px;margin:4px 0"><input type=date value="${h.d}" onchange="WCE.holidays[${k}].d=this.value" style="width:160px"><input value="${esc(tr(h.n))}" oninput="WCE.holidays[${k}].n=this.value" style="flex:1"><button type=button class=ic onclick="WCE.holidays.splice(${k},1);render()" title="Remove" aria-label="Remove">${IC.x}</button></div>` : '').join('')}</details>`).join('') || '<p class=mu style="margin:6px 0">No public holidays yet.</p>'}
<label style="margin-top:8px">Paste a list <small class=mu>(one per line: 2026-12-24 Christmas Eve, or 24.12.2026 Christmas Eve)</small><textarea rows=2 oninput="WCE.paste=this.value">${esc(c.paste)}</textarea></label>${c.paste ? `<button type=button class=ib onclick="wcPaste()">Add these days</button>` : ''}</div></div>
<div class=acts><button class=ib onclick="WCE=null;render()">Cancel</button><button class=btn onclick="wcSave()">Save</button></div></div>`, 'WCE=null;render()', 640);
}
const wcAdd = () => { WCE.holidays.push({ d: iso(new Date()), n: '' }); render(); };
const wcMerge = list => { let n = 0; list.forEach(h => { if (h.d && !WCE.holidays.some(x => x.d === h.d)) { WCE.holidays.push(h); n++; } }); WCE.holidays.sort((a, b) => a.d.localeCompare(b.d)); render(); toast(tr(`${n} days added`)); };
const wcBg = () => once('wcbg', async () => { const r = await api('/api/wf/holidays', { country: 'BG', year: WCE.year }); if (!r.ok) return toast(await errOf(r, 'Could not add them'), true); wcMerge(await r.json()); });
const wcPaste = () => { const out = WCE.paste.split('\n').map(l => l.trim()).filter(Boolean).map(l => { let m = l.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/); if (m) return { d: m[1], n: m[2] }; m = l.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})\s+(.+)$/); return m ? { d: m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'), n: m[4] } : null; }).filter(Boolean);
  if (!out.length) return toast('No date found. Write one day per line: 2026-12-24 Christmas Eve', true); WCE.paste = ''; wcMerge(out); };
const wcSave = () => once('wcsave', async () => {
  const c = { ...WCE, holidays: WCE.holidays.filter(h => h.d && h.n.trim()) }; delete c.paste; delete c.year;
  const list = c.id ? WF().calendars.map(x => x.id === c.id ? c : x) : [...WF().calendars, c];
  const err = await wfSave({ calendars: list }, 'Work calendar saved'); if (err) return toast(err, true); WCE = null; render();
});

// ---------------------------------------------------------------- Workforce set-up › Shift templates (and repeating patterns)
const AUTO = { end: 'At the end of the shift', fixed: 'At a fixed time', none: 'Never' };
const usedBy = id => USR.filter(u => u.active !== false && (u.shift || WF().defShift) === id && !u.pattern).length;
PG.shifts = function () {
  const W = WF();
  return head('Shift templates', 'The shifts people work, and patterns that repeat on their own. Used by the rota and, later, by check-ins and the fair split of leads.', `<button class=btn onclick="shEdit('')">+ New shift</button>`)
    + card('', `<div class=row style="gap:8px;margin:0 0 10px;justify-content:flex-start"><b style="font-size:13px">Default shift</b><select style="width:auto" onchange="wfDo({defShift:this.value},'Default shift changed')">${W.shifts.map(s => `<option value="${s.id}" ${s.id === W.defShift ? 'selected' : ''}>${esc(s.name)} · ${wfTime(s)}</option>`).join('')}</select><small class=mu>${tr('For everybody who has no usual shift of their own.')}</small></div>`
      + tbl(['Shift', 'Time', 'Break', 'Paid hours', 'Grace in / out', 'Core hours', 'Automatic check-out', 'People', ''], W.shifts.map(s => [`<span style="color:${s.color}">●</span> <b>${esc(s.name)}</b>${s.id === W.defShift ? ' ' + pill('Default', 'ac') : ''}`, `<span class=mono>${wfTime(s)}</span>${wfMin(s.end) <= wfMin(s.start) ? ` <small class=mu>${tr('next day')}</small>` : ''}`, s.brk + ' min', wfHrs(s) + ' h',
        `${s.graceIn} / ${s.graceOut} min`, s.coreFrom ? `<span class=mono>${s.coreFrom}–${s.coreTo}</span>` : '—', esc(tr(AUTO[s.autoOut])) + (s.autoOut === 'fixed' ? ' ' + s.autoAt : ''), usedBy(s.id),
        `<span style="white-space:nowrap"><button class=ic onclick="shEdit('${s.id}')" title="Edit">${IC.pen}</button>${W.shifts.length > 1 ? `<button class=ic onclick="shDel('${s.id}')" title="Delete">${IC.bin}</button>` : ''}</span>`])))
    + card(`Repeating patterns <span class=bg>${W.patterns.length}</span>`, `<p class=mu style="margin:0 0 10px">${tr('A pattern repeats a sequence of days by itself, for example 4 days on and 4 days off, or early shifts one week and late shifts the next. Give it to people in Admin › Users or on the rota.')}</p>`
      + (W.patterns.length ? W.patterns.map(p => `<div class="row li" style="gap:10px;align-items:center"><div style="min-width:180px"><b>${esc(p.name)}</b><br><small class=mu>${tr(`${p.days.length} days`)} · ${tr(`${USR.filter(u => u.active !== false && u.pattern === p.id).length} people`)}</small></div><div class=wweek style="flex:1">${p.days.slice(0, 28).map(v => { const s = wfShift(v); return s ? `<span class=wday style="background:${s.color};color:#fff" title="${esc(s.name)}">${esc(s.name.slice(0, 2))}</span>` : `<span class="wday off">–</span>`; }).join('')}${p.days.length > 28 ? '…' : ''}</div><span style="white-space:nowrap"><button class=ic onclick="ptEdit('${p.id}')" title="Edit">${IC.pen}</button><button class=ic onclick="ptDel('${p.id}')" title="Delete">${IC.bin}</button></span></div>`).join('') : '')
      + `<button class=ib style="margin-top:10px" onclick="ptEdit('')">+ New pattern</button>`);
};
const shEdit = id => { const s = wfShift(id);
  openForm({ title: s ? tr('Edit the shift') : tr('New shift'), yes: 'Save', d: s ? { ...s } : { id: '', name: '', color: '#2563eb', start: '09:00', end: '18:00', brk: 60, graceIn: 5, graceOut: 5, coreFrom: '', coreTo: '', autoOut: 'end', autoAt: '' },
    fields: [{ k: 'name', l: 'Name', req: 1, ph: 'Early, Late, Night…' }, { k: 'color', l: 'Colour', t: 'color' },
      { k: 'start', l: 'Starts at', t: 'time', req: 1 }, { k: 'end', l: 'Ends at', t: 'time', req: 1, hint: 'Earlier than the start = it ends the next day (a night shift).' },
      { k: 'brk', l: 'Break (minutes)', t: 'number', hint: 'Unpaid. Paid hours = the shift minus the break.' },
      { k: 'graceIn', l: 'Grace for arriving late (minutes)', t: 'number' }, { k: 'graceOut', l: 'Grace for leaving early (minutes)', t: 'number', hint: 'Used by check-ins, the next part of Workforce: within the grace nobody is marked late or early.' },
      { k: 'coreFrom', l: 'Core hours from (optional)', t: 'time' }, { k: 'coreTo', l: 'Core hours until (optional)', t: 'time', hint: 'A time when everybody of this shift must be working.' },
      { k: 'autoOut', l: 'Automatic check-out for people who forget', t: 'select', re: 1, o: Object.entries(AUTO).map(([k, l]) => [k, tr(l)]) }, { k: 'autoAt', l: 'Check out at', t: 'time', show: d => d.autoOut === 'fixed' }],
    save: d => { const list = d.id ? WF().shifts.map(x => x.id === d.id ? d : x) : [...WF().shifts, d]; return wfSave({ shifts: list }, 'Shift saved'); } }); };
const shDel = id => { const s = wfShift(id), n = USR.filter(u => u.shift === id).length;
  ask(`Delete the shift “${s.name}”?`, n ? tr(`${n} people have it as their usual shift. They will get the default shift.`) : 'Nobody has it as their usual shift.', () => wfDo({ shifts: WF().shifts.filter(x => x.id !== id) }, 'Shift deleted'), { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
// the pattern editor: the length of the cycle, and for every day a shift or a day off; ready-made starts for the usual cases
const ptEdit = id => { const p = WF().patterns.find(x => x.id === id); PTE = p ? JSON.parse(JSON.stringify(p)) : { id: '', name: '', days: ptFill('week') }; render(); };
function ptFill(k) {
  const S = WF().shifts, a = (S[0] || {}).id || 'off', b = (S[1] || S[0] || {}).id || a;
  if (k === '4on4off') return [a, a, a, a, 'off', 'off', 'off', 'off'];
  if (k === 'twoweeks') return [a, a, a, a, a, 'off', 'off', b, b, b, b, b, 'off', 'off'];
  return [a, a, a, a, a, 'off', 'off'];
}
const ptLen = n => { n = Math.max(1, Math.min(56, parseInt(n) || 1)); const d = PTE.days; while (d.length < n) d.push(d[d.length % Math.max(1, d.length)] || 'off'); d.length = n; render(); };
function PTEM() {
  const p = PTE, S = WF().shifts;
  return OVL(`<div class=mh><h2>${p.id ? tr('Edit the pattern') : tr('New pattern')}</h2>${X('PTE=null;render()')}</div><div class=mb><div class=form style="max-width:none">
<div class=eg2><label>Name<input value="${esc(p.name)}" oninput="PTE.name=this.value" placeholder="4 on, 4 off"></label><label>Days in one cycle<input type=number min=1 max=56 value="${p.days.length}" onchange="ptLen(this.value)"></label></div>
<div style="display:flex;gap:6px;flex-wrap:wrap"><small class=mu style="align-self:center">${tr('Start from:')}</small>${[['week', 'Monday to Friday'], ['4on4off', '4 on, 4 off'], ['twoweeks', 'Two weeks: first and second shift']].map(([k, l]) => `<button type=button class=ib onclick="PTE.days=ptFill('${k}');render()">${esc(tr(l))}</button>`).join('')}</div>
<div class=wpick>${p.days.map((v, i) => `<label><span>${tr(`Day ${i + 1}`)}</span><select onchange="PTE.days[${i}]=this.value">${S.map(s => `<option value="${s.id}" ${v === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="off" ${v === 'off' ? 'selected' : ''}>${tr('Day off')}</option></select></label>`).join('')}</div>
<small class=mu>${tr('Day 1 is the start date chosen for each person. After the last day the cycle starts again.')}</small></div>
<div class=acts><button class=ib onclick="PTE=null;render()">Cancel</button><button class=btn onclick="ptSave()">Save</button></div></div>`, 'PTE=null;render()', 640);
}
const ptSave = () => once('ptsave', async () => { const p = PTE, list = p.id ? WF().patterns.map(x => x.id === p.id ? p : x) : [...WF().patterns, p]; const err = await wfSave({ patterns: list }, 'Pattern saved'); if (err) return toast(err, true); PTE = null; render(); });
const ptDel = id => { const p = WF().patterns.find(x => x.id === id), n = USR.filter(u => u.pattern === id).length;
  ask(`Delete the pattern “${p.name}”?`, n ? tr(`${n} people follow it. They will go back to their usual shift.`) : 'Nobody follows it.', () => wfDo({ patterns: WF().patterns.filter(x => x.id !== id) }, 'Pattern deleted'), { yes: 'Yes, delete', no: 'Cancel', danger: true }); };

// ---------------------------------------------------------------- Admin › Users: employment fields
const EMP_FIELDS = () => [{ t: 'h', l: 'Employment' },
  { k: 'empId', l: 'Employee ID', max: 30 }, { k: 'empType', l: 'Employment type', t: 'select', o: () => Object.entries(EMPT).map(([k, l]) => [k, tr(l)]) },
  { k: 'hours', l: 'Hours per week', t: 'number', hint: 'Used by the rota and, later, by the fair split of leads. 40 = full time.' },
  { k: 'manager', l: 'Reporting manager', t: 'select', o: d => [['', tr('The team lead (automatic)')], ...USR.filter(u => u.role !== 'agent' && u.active !== false && u.username !== d.username).map(u => [u.username, u.name + ' · ' + (ROLE[u.role] || u.role)])] },
  { k: 'cal', l: 'Work calendar', t: 'select', o: () => [['', tr('Company default') + ' (' + ((WF().calendars.find(c => c.id === WF().defCal) || {}).name || '') + ')'], ...WF().calendars.map(c => [c.id, c.name])], hint: 'Working days and public holidays (Workforce set-up › Work calendars).' },
  { k: 'location', l: 'Location', ph: 'Sofia office, home…' },
  { k: 'shift', l: 'Usual shift', t: 'select', o: () => [['', tr('Company default') + ' (' + ((wfShift(WF().defShift) || {}).name || '') + ')'], ...WF().shifts.map(s => [s.id, s.name + ' · ' + wfTime(s)])] },
  { k: 'pattern', l: 'Repeating pattern', t: 'select', re: 1, o: () => [['', tr('None: the usual shift on working days')], ...WF().patterns.map(p => [p.id, p.name])] },
  { k: 'patStart', l: 'The pattern starts on', t: 'date', show: d => !!d.pattern },
  { k: 'empStatus', l: 'Status', t: 'select', re: 1, o: [['active', tr('Active')], ['leave', tr('On long leave')], ['left', tr('Left the company')]] },
  { k: 'exitDate', l: 'Last working day', t: 'date', show: d => d.empStatus === 'left' }, { k: 'exitReason', l: 'Reason for leaving', show: d => d.empStatus === 'left' },
  { t: 'h', l: 'Private (only admins and the person see this)' },
  { k: 'birthday', l: 'Birthday', t: 'date', hint: 'Colleagues see it only if the person allows it in My account.' },
  { k: 'ecName', l: 'Emergency contact' }, { k: 'ecPhone', l: 'Emergency contact phone' }, { k: 'ecRel', l: 'Relationship' }];
const empCell = u => `${esc(tr(EMPT[u.empType] || EMPT.full))} · ${u.hours || 40} h${u.empStatus === 'left' ? ' ' + pill('Left', 'bad') : u.empStatus === 'leave' ? ' ' + pill('On long leave', 'wn') : ''}${u.empId ? `<br><small class=mono>${esc(u.empId)}</small>` : ''}`;
