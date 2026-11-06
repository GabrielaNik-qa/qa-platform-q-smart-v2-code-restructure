// Workforce rules without a server or files (used by routes-wf.js, server.js and the tests): dates, public holidays,
// the default work calendar and shift, checking what an admin saves, and who is planned to work on a day.
const DAY = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/, COLOR = /^#[0-9a-f]{6}$/i;
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const pad = n => String(n).padStart(2, '0');
// dates are plain 'YYYY-MM-DD' texts; the arithmetic runs in UTC so summer time never moves a day
const parse = s => new Date(s + 'T00:00:00Z');
const ymd = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const dow = s => parse(s).getUTCDay();                                   // 0 = Sunday … 6 = Saturday
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const monday = s => addDays(s, -((dow(s) + 6) % 7));
// time zones (Gabriela, 4 November: each person their own). A person's zone, else the company's (Admin › Organization), else the server's ('')
const okTz = z => { if (!z || typeof z !== 'string' || z.length > 60) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } };
const tzOf = (W, u) => (u && okTz(u.tz) ? u.tz : '') || (W && okTz(W.tz) ? W.tz : '');
const tzParts = (t, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
const tzOff = (t, tz) => { const p = tzParts(t, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000; };   // how far the zone is ahead of UTC at that moment
const localDay = tz => { if (tz) { const p = tzParts(Date.now(), tz); return p.year + '-' + p.month + '-' + p.day; } const n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); };
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// Orthodox Easter: the Julian computus, moved to the Gregorian calendar (+13 days, right for 1900–2099)
function orthodoxEaster(y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7, m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return addDays(y + '-' + pad(m) + '-' + pad(day), 13);
}
// Bulgarian public holidays (Labour Code, art. 154). When a fixed holiday falls on a Saturday or Sunday, the first working
// day after it is a day off too (Easter is not moved). Extra days the government moves by decree are added by hand.
const BG_FIXED = [['01-01', 'New Year'], ['03-03', 'Liberation Day'], ['05-01', 'Labour Day'], ['05-06', "St George's Day"], ['05-24', 'Day of Bulgarian Culture and Literacy'],
  ['09-06', 'Unification Day'], ['09-22', 'Independence Day'], ['12-24', 'Christmas Eve'], ['12-25', 'Christmas'], ['12-26', 'Christmas (second day)']];
function bgHolidays(y) {
  const fixed = BG_FIXED.map(([md, n]) => ({ d: y + '-' + md, n })), e = orthodoxEaster(y);
  const out = [...fixed, { d: addDays(e, -2), n: 'Good Friday' }, { d: addDays(e, -1), n: 'Holy Saturday' }, { d: e, n: 'Easter' }, { d: addDays(e, 1), n: 'Easter Monday' }];
  const taken = new Set(out.map(h => h.d)); let last = '';
  fixed.filter(h => [0, 6].includes(dow(h.d))).forEach(h => {
    let d = addDays(h.d > last ? h.d : last, 1);
    while ([0, 6].includes(dow(d)) || taken.has(d)) d = addDays(d, 1);
    taken.add(d); last = d; out.push({ d, n: 'Day off for ' + h.n });
  });
  return out.sort((a, b) => a.d.localeCompare(b.d));
}

// ---- the settings: work calendars (per country), shift templates, repeating patterns, the default shift and calendar
const DAYTYPES = ['work', 'half', 'off'], WEEK5 = ['off', 'work', 'work', 'work', 'work', 'work', 'off'], AUTOOUT = ['none', 'end', 'fixed'];
const SHIFT0 = { id: 's-day', name: 'Day', color: '#2563eb', start: '09:00', end: '18:00', brk: 60, graceIn: 5, graceOut: 5, coreFrom: '', coreTo: '', autoOut: 'end', autoAt: '' };
function defaults(today) {
  const y = Number(today.slice(0, 4));
  return { calendars: [{ id: 'c-bg', name: 'Bulgaria', country: 'BG', days: WEEK5.slice(), holidays: [...bgHolidays(y), ...bgHolidays(y + 1)] }], shifts: [{ ...SHIFT0 }], patterns: [], defShift: 's-day', defCal: 'c-bg' };
}
// what the app works with: the saved settings, or the defaults until an admin saves something
function settingsOf(saved, today) {
  const d = defaults(today), s = saved && typeof saved === 'object' ? saved : {};
  const out = { calendars: Array.isArray(s.calendars) && s.calendars.length ? s.calendars : d.calendars, shifts: Array.isArray(s.shifts) && s.shifts.length ? s.shifts : d.shifts, patterns: Array.isArray(s.patterns) ? s.patterns : [] };
  out.defShift = out.shifts.some(x => x.id === s.defShift) ? s.defShift : out.shifts[0].id;
  out.defCal = out.calendars.some(x => x.id === s.defCal) ? s.defCal : out.calendars[0].id;
  out.leaveTypes = (Array.isArray(s.leaveTypes) && s.leaveTypes.length ? s.leaveTypes : LT0).map(x => ({ ...x, bradford: countsBf(x) }));
  out.rules = cleanRules({ ...RULES0, ...(s.rules && typeof s.rules === 'object' ? s.rules : {}) });
  return out;
}
const int = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, n)) : def; };
const idOf = (v, make, used) => { const id = typeof v === 'string' && /^[a-z0-9-]{2,24}$/.test(v) && !used.has(v) ? v : make(); used.add(id); return id; };
// paid hours of a shift: from start to end (over midnight when it ends earlier than it starts), minus the break
const shiftHours = s => { const len = ((mins(s.end) - mins(s.start) + 1440) % 1440) || 1440; return Math.round((len - (s.brk || 0)) / 6) / 10; };
function cleanShifts(list, make) {
  if (!Array.isArray(list) || !list.length) throw new Error('Keep at least one shift');
  if (list.length > 40) throw new Error('Up to 40 shifts');
  const used = new Set();
  return list.map(x => {
    const s = x && typeof x === 'object' ? x : {}, name = str(s.name, 40);
    if (!name) throw new Error('Every shift needs a name');
    if (!TIME.test(s.start || '') || !TIME.test(s.end || '')) throw new Error(`Shift "${name}": enter the start and end time as HH:MM`);
    if (s.start === s.end) throw new Error(`Shift "${name}": it starts and ends at the same time`);
    const len = (mins(s.end) - mins(s.start) + 1440) % 1440, brk = int(s.brk, 0, 240, 0);
    if (brk >= len) throw new Error(`Shift "${name}": the break is longer than the shift`);
    const core = TIME.test(s.coreFrom || '') && TIME.test(s.coreTo || '') && s.coreFrom !== s.coreTo, autoOut = AUTOOUT.includes(s.autoOut) ? s.autoOut : 'end';
    if (autoOut === 'fixed' && !TIME.test(s.autoAt || '')) throw new Error(`Shift "${name}": enter the time of the automatic check-out`);
    return { id: idOf(s.id, make, used), name, color: COLOR.test(s.color || '') ? s.color : '#2563eb', start: s.start, end: s.end, brk, graceIn: int(s.graceIn, 0, 120, 5), graceOut: int(s.graceOut, 0, 120, 5),
      coreFrom: core ? s.coreFrom : '', coreTo: core ? s.coreTo : '', autoOut, autoAt: autoOut === 'fixed' ? s.autoAt : '' };
  });
}
function cleanCalendars(list, make) {
  if (!Array.isArray(list) || !list.length) throw new Error('Keep at least one work calendar');
  if (list.length > 30) throw new Error('Up to 30 work calendars');
  const used = new Set();
  return list.map(x => {
    const c = x && typeof x === 'object' ? x : {}, name = str(c.name, 40);
    if (!name) throw new Error('Every work calendar needs a name');
    const days = Array.isArray(c.days) && c.days.length === 7 ? c.days.map(t => DAYTYPES.includes(t) ? t : 'off') : WEEK5.slice();
    if (!days.some(t => t !== 'off')) throw new Error(`"${name}": choose at least one working day`);
    const seen = new Set(), holidays = (Array.isArray(c.holidays) ? c.holidays : []).slice(0, 400).map(h => ({ d: str(h && h.d, 10), n: str(h && h.n, 60) }))
      .filter(h => DAY.test(h.d) && h.n && !seen.has(h.d) && seen.add(h.d)).sort((a, b) => a.d.localeCompare(b.d));
    return { id: idOf(c.id, make, used), name, country: str(c.country, 2).toUpperCase().replace(/[^A-Z]/g, ''), days, holidays };
  });
}
// a pattern repeats a sequence of days (a shift or "off"); a shift that no longer exists becomes the default shift
function cleanPatterns(list, shifts, defShift, make) {
  if (!Array.isArray(list)) return [];
  if (list.length > 40) throw new Error('Up to 40 patterns');
  const used = new Set(), ok = id => shifts.some(s => s.id === id);
  return list.map(x => {
    const p = x && typeof x === 'object' ? x : {}, name = str(p.name, 40);
    if (!name) throw new Error('Every pattern needs a name');
    const days = (Array.isArray(p.days) ? p.days : []).slice(0, 56).map(v => v === 'off' ? 'off' : ok(v) ? v : defShift);
    if (!days.length) throw new Error(`Pattern "${name}": add at least one day`);
    if (!days.some(v => v !== 'off')) throw new Error(`Pattern "${name}": add at least one working day`);
    return { id: idOf(p.id, make, used), name, days };
  });
}

// ---- who is planned to work on a day, in this order: a change made on the rota for that day, a public holiday of their
// calendar, their repeating pattern, their usual shift on the working days of their calendar. Before the start date and
// after the leaving date they are not planned at all.
function planOf(W, u, date, rota) {
  if (u.start && date < u.start) return { v: 'none', src: 'out' };
  if (u.empStatus === 'left' && u.exitDate && date > u.exitDate) return { v: 'none', src: 'out' };
  const has = id => W.shifts.some(s => s.id === id), def = has(W.defShift) ? W.defShift : W.shifts[0].id;
  const set = ((rota || {})[date] || {})[u.username];
  if (set) return { v: set === 'off' || has(set) ? set : def, src: 'set' };
  const cal = W.calendars.find(c => c.id === u.cal) || W.calendars.find(c => c.id === W.defCal) || W.calendars[0];
  const hol = cal.holidays.find(h => h.d === date);
  if (hol) return { v: 'hol', src: 'hol', hol: hol.n };
  const pat = u.pattern && W.patterns.find(p => p.id === u.pattern);
  if (pat) { const n = pat.days.length, x = pat.days[((diffDays(u.patStart || date, date) % n) + n) % n]; return { v: x === 'off' || has(x) ? x : def, src: 'pattern' }; }
  const t = cal.days[dow(date)];
  if (t === 'off') return { v: 'off', src: 'week' };
  return t === 'half' ? { v: has(u.shift) ? u.shift : def, src: 'usual', half: true } : { v: has(u.shift) ? u.shift : def, src: 'usual' };
}
// the planned paid hours of one cell
const cellHours = (W, c) => { const s = W.shifts.find(x => x.id === c.v); return s ? (c.half ? shiftHours(s) / 2 : shiftHours(s)) : 0; };

// ======================== Phase 2: time off types, attendance rules, the status of a day, leave days and balances
// the leave types a company starts with (Workforce set-up › Leave types changes them) and the attendance rules (Workforce set-up › Attendance rules)
const LT0 = [
  { id: 'lt-annual', name: 'Annual leave', color: '#16a34a', paid: true, unit: 'day', allowance: 20, carry: 5, half: true, approval: true, sandwich: false, bradford: false },
  { id: 'lt-sick', name: 'Sick leave', color: '#e11d48', paid: true, unit: 'day', allowance: 0, carry: 0, half: false, approval: false, sandwich: false, bradford: true },
  { id: 'lt-unpaid', name: 'Unpaid leave', color: '#475569', paid: false, unit: 'day', allowance: 0, carry: 0, half: true, approval: true, sandwich: false, bradford: false },
  { id: 'lt-hours', name: 'Personal hours', color: '#0d9488', paid: true, unit: 'hour', allowance: 8, carry: 0, half: false, approval: true, sandwich: false, bradford: false },
  { id: 'lt-other', name: 'Other leave', color: '#7c3aed', paid: true, unit: 'day', allowance: 0, carry: 0, half: true, approval: true, sandwich: false, bradford: false }];
const RULES0 = { lateLimit: 3, latePeriod: 'month', missingAfter: 30, fixDays: 7, fixReasons: ['Forgot to check in', 'Forgot to check out', 'Worked away from the computer', 'Technical problem', 'Other'], shortGrace: 15, teamOffPct: 20, since: '', minOnPct: 70, briefOn: false, briefAfter: 30, bradford: [50, 125, 400] };
const half = (v, lo, hi, def) => { const n = Number(v); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 2) / 2)) : def; };
function cleanLeaveTypes(list, make) {
  if (!Array.isArray(list) || !list.length) throw new Error('Keep at least one leave type');
  if (list.length > 30) throw new Error('Up to 30 leave types');
  const used = new Set();
  return list.map(x => {
    const t = x && typeof x === 'object' ? x : {}, name = str(t.name, 40), unit = t.unit === 'hour' ? 'hour' : 'day', max = unit === 'hour' ? 2000 : 365;
    if (!name) throw new Error('Every leave type needs a name');
    return { id: idOf(t.id, make, used), name, color: COLOR.test(t.color || '') ? t.color : '#16a34a', paid: t.paid !== false, unit, allowance: half(t.allowance, 0, max, 0), carry: half(t.carry, 0, max, 0),
      half: unit === 'day' && t.half !== false, approval: t.approval !== false, sandwich: unit === 'day' && t.sandwich === true, bradford: countsBf(t) };
  });
}
function cleanRules(x) {
  const r = x && typeof x === 'object' ? x : {}, reasons = [...new Set((Array.isArray(r.fixReasons) ? r.fixReasons : []).map(v => str(v, 60)).filter(Boolean))].slice(0, 15);
  return { lateLimit: int(r.lateLimit, 0, 50, 3), latePeriod: r.latePeriod === 'week' ? 'week' : 'month', missingAfter: int(r.missingAfter, 0, 240, 30), fixDays: int(r.fixDays, 0, 60, 7),
    fixReasons: reasons.length ? reasons : RULES0.fixReasons.slice(), shortGrace: int(r.shortGrace, 0, 120, 15), teamOffPct: int(r.teamOffPct, 0, 100, 20),
    since: DAY.test(typeof r.since === 'string' ? r.since : '') ? r.since : '',
    minOnPct: int(r.minOnPct, 0, 100, 70), briefOn: r.briefOn === true, briefAfter: int(r.briefAfter, 0, 240, 30), bradford: bfLevels(r.bradford) };              // attendance is tracked from this day: before it (or when empty) nobody is marked absent
}

// ---- times: shift times are wall-clock times in the person's time zone (or the company's, or the server's); check-ins are kept as exact moments (ISO)
const MIN = 6e4, AFTER = 4 * 36e5;                                              // a day is closed 4 hours after the end of its shift
const atLocal = (date, hm, tz) => { const [y, mo, d] = date.split('-').map(Number), [h, mi] = hm.split(':').map(Number); if (!tz) return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  const g = Date.UTC(y, mo - 1, d, h, mi); let t = g - tzOff(g, tz); t = g - tzOff(t, tz); return t; };   // twice: right also on the day the clocks change
const dayOfTime = (t, tz) => { if (tz) { const p = tzParts(t, tz); return p.year + '-' + p.month + '-' + p.day; } const n = new Date(t); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); };
// the planned shift of a day as moments: start, end (the next day for a night shift), and the paid time; a half day is the first half
function shiftWindow(W, date, plan, tz) {
  const s = W.shifts.find(x => x.id === plan.v); if (!s) return null;
  const start = atLocal(date, s.start, tz); let end = atLocal(date, s.end, tz); if (end <= start) end += 864e5;
  const len = end - start, paid = Math.max(0, len - (s.brk || 0) * MIN);
  return plan.half ? { s, start, end: start + len / 2, paid: paid / 2 } : { s, start, end, paid };
}
// worked time of a day: from check-in to check-out, minus the breaks. When nobody checked out, the shift's automatic
// check-out applies once the day is closed ("none" leaves it open and marks the missing check-out)
function worktime(r, win, now, date, tz) {
  const tin = Date.parse(r.in), dayEnd = win ? win.end : tin + 12 * 36e5; let tout = r.out ? Date.parse(r.out) : 0, auto = '';
  if (!tout && now > dayEnd + AFTER) {
    const s = win && win.s;
    if (s && s.autoOut === 'end') { tout = Math.max(dayEnd, tin); auto = 'end'; }
    else if (s && s.autoOut === 'fixed' && TIME.test(s.autoAt || '')) { let x = atLocal(date, s.autoAt, tz); if (x < tin) x += 864e5; tout = x; auto = 'fixed'; }
    else auto = 'none';
  }
  const open = !tout && auto !== 'none', until = tout || (auto === 'none' ? Math.max(dayEnd, tin) : now);
  let brk = 0, onBreak = false;
  (Array.isArray(r.brk) ? r.brk : []).forEach(b => {
    const s = Date.parse(b && b.s); if (!s) return;
    if (!b.e && open) onBreak = true;
    const e = b.e ? Date.parse(b.e) : until; brk += Math.max(0, Math.min(e, until) - Math.max(s, tin));
  });
  return { tin, tout, auto, open, onBreak, worked: Math.max(0, until - tin - brk) };
}
// the status of one person on one day, worked out from the plan, the check-ins and approved leave:
// none · off · hol · leave · upcoming · missing (the shift started, nobody checked in) · absent · working · done · extra (worked on a day off)
// with late / early / short minutes (only beyond the grace minutes of the shift; leave in the morning or evening excuses them)
function dayStatus(W, R, date, plan, rec, lv, now, tz) {
  const r = rec && rec.in ? rec : null, part = lv ? lv.part : '';
  if (part === 'full') return { st: 'leave', lt: lv.lt };
  const win = shiftWindow(W, date, plan, tz);
  if (!win) {
    if (!r) return { st: plan.v === 'hol' ? 'hol' : plan.v === 'off' ? 'off' : 'none' };
    const w = worktime(r, null, now, date, tz);
    return { st: w.open ? 'working' : 'extra', brk: w.onBreak, in: r.in, out: w.tout ? new Date(w.tout).toISOString() : '', auto: w.auto, noOut: w.auto === 'none', late: 0, early: 0, short: 0, worked: Math.round(w.worked / MIN), expect: 0, extra: true };
  }
  if (!r) {
    if (lv) return { st: 'leave', lt: lv.lt, part };
    if (!R.since || date < R.since) return { st: 'untracked' };
    if (now < win.start + win.s.graceIn * MIN) return { st: 'upcoming', start: win.s.start };
    if (now < win.end) return { st: 'missing', mins: Math.round((now - win.start) / MIN) };   // not a late arrival (yet): it never counts as one
    return { st: 'absent' };
  }
  const w = worktime(r, win, now, date, tz);
  const late = part !== 'am' && part !== 'hours' && w.tin - win.start > win.s.graceIn * MIN ? Math.round((w.tin - win.start) / MIN) : 0;
  const early = part !== 'pm' && part !== 'hours' && w.tout && !w.auto && win.end - w.tout > win.s.graceOut * MIN ? Math.round((win.end - w.tout) / MIN) : 0;
  let expect = win.paid; if (part === 'am' || part === 'pm') expect /= 2; if (part === 'hours') expect = Math.max(0, expect - (Number(lv.hours) || 0) * 36e5);
  const short = !w.open && expect - w.worked > (R.shortGrace || 0) * MIN ? Math.round((expect - w.worked) / MIN) : 0;
  return { st: w.open ? 'working' : 'done', brk: w.onBreak, in: r.in, out: w.tout ? new Date(w.tout).toISOString() : '', auto: w.auto, noOut: w.auto === 'none', late, early, short,
    worked: Math.round(w.worked / MIN), expect: Math.round(expect / MIN), lt: lv ? lv.lt : '', part };
}
// the first day of the week (Monday) or of the month of a date: lates are counted from there
const periodStart = (date, p) => p === 'week' ? monday(date) : date.slice(0, 8) + '01';
// people whose shift started more than "missingAfter" minutes ago and who have not checked in (nor are on leave that day)
function missingCheckIns(W, R, users, date, rota, att, leaveOf, now) {
  if (!R.missingAfter || !R.since || date < R.since) return [];
  return users.filter(u => u.role === 'agent' || u.shift || u.pattern).map(u => {
    const tz = tzOf(W, u), day = tz ? dayOfTime(now, tz) : date;   // the person's own today
    const plan = planOf(W, u, day, rota), win = shiftWindow(W, day, plan, tz);
    if (!win || leaveOf(u, day) || ((att[day] || {})[u.username] || {}).in) return null;
    return now >= win.start + R.missingAfter * MIN && now < win.end ? { u: u.username, start: win.s.start } : null;
  }).filter(Boolean);
}

// ---- time off: the days a request takes, and what is left of each type
// every date of the request counts as the share of a working day it takes: 1, ½ (half day, or a half working day),
// 0 on days off and public holidays (unless the type's "sandwich" rule counts days off inside a leave); hour leave counts hours
function leaveSpan(W, T, u, L, rota) {
  const out = {}; if (!DAY.test(L.from || '') || !DAY.test(L.to || '') || L.to < L.from || diffDays(L.from, L.to) > 366) return out;
  const off = new Set(Array.isArray(L.off) ? L.off : []);
  for (let i = 0, n = diffDays(L.from, L.to); i <= n; i++) {
    const d = addDays(L.from, i); if (off.has(d)) continue;
    const p = planOf(W, u, d, rota);
    if (T.unit === 'hour') { if (p.v !== 'none') out[d] = Number(L.hours) || 0; continue; }
    if (W.shifts.some(s => s.id === p.v)) out[d] = L.part === 'am' || L.part === 'pm' || p.half ? 0.5 : 1;
    else if (T.sandwich && p.v !== 'none' && d !== L.from && d !== L.to) out[d] = 1;
  }
  return out;
}
const sum = o => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 10) / 10;
// the balance of one leave type in one year: the yearly allowance (shared out by month for people who started during the year),
// plus what was carried over from last year (up to the type's limit; never from a year before "first", the first year the app has
// time off for: older balances come in as adjustments), plus adjustments, minus approved leave; pending leave apart
function balance(W, T, u, year, leaves, adj, rota, depth = 0, first = 0) {
  const y = String(year), inYear = st => leaves.filter(L => L.u === u.username && L.lt === T.id && L.status === st)
    .reduce((a, L) => a + Object.entries(leaveSpan(W, T, u, L, rota)).filter(([d]) => d.startsWith(y)).reduce((b, [, v]) => b + v, 0), 0);
  const taken = Math.round(inYear('approved') * 10) / 10, pending = Math.round(inYear('pending') * 10) / 10;
  if (!T.allowance) return { lt: T.id, unlimited: true, taken, pending };
  const sy = u.start ? Number(u.start.slice(0, 4)) : 0, step = T.unit === 'hour' ? 1 : 0.5;
  let allowance = sy > Number(y) ? 0 : T.allowance;
  if (sy === Number(y)) allowance = Math.round(T.allowance * (12 - Number(u.start.slice(5, 7)) + 1) / 12 / step) * step;
  const carried = T.carry && depth < 2 && sy < Number(y) && Number(y) - 1 >= first ? Math.min(T.carry, Math.max(0, balance(W, T, u, Number(y) - 1, leaves, adj, rota, depth + 1, first).left)) : 0;
  const adjust = Math.round(adj.filter(a => a.u === u.username && a.lt === T.id && String(a.year) === y).reduce((a, x) => a + (Number(x.days) || 0), 0) * 10) / 10;
  return { lt: T.id, allowance, carried, adjust, taken, pending, left: Math.round((allowance + carried + adjust - taken) * 10) / 10 };
}
// the leave of a person by person (approved and pending), and their leave on one day: approved only, or pending too
const leavesBy = leaves => { const m = {}; (leaves || []).forEach(L => { if (L.status === 'approved' || L.status === 'pending') (m[L.u] = m[L.u] || []).push(L); }); return m; };
const lvOn = (list, d, pend) => { const L = (list || []).find(x => (x.status === 'approved' || (pend && x.status === 'pending')) && d >= x.from && d <= x.to && !(x.off || []).includes(d)); return L ? { lt: L.lt, part: L.part || 'full', hours: L.hours || 0, pend: L.status === 'pending', id: L.id } : null; };
// who can see and plan whom (shared by the rota, attendance and time off): admins everybody, team leads the people of
// the teams they see (never the Administration team), agents only their own team
const access = ({ scopeOf, seesUser, userBy, ADMIN_TEAM }) => ({
  teamsFor: (db, u) => { if (u.role === 'agent') return db.teams.filter(t => t.id === u.team); const s = scopeOf(db, u); return db.teams.filter(t => !s || s.teams.has(t.id)); },
  canPlan: (db, me, username) => { const u = userBy(db, username); return !!u && (me.role === 'admin' || (me.role === 'lead' && u.team !== ADMIN_TEAM && seesUser(db, me, username))); }
});

// ======================== Phase 3: the Bradford score, absence patterns
// a leave type counts in the Bradford score when it is an unplanned absence: ticked on the type, or sick leave by default
const countsBf = t => !!t && (t.bradford !== undefined ? t.bradford === true : t.id === 'lt-sick');
// the three Bradford levels (watch, talk, serious): rising numbers, else the usual 50 / 125 / 400
const bfLevels = v => { const t = Array.isArray(v) ? v.map(x => int(x, 1, 100000, 0)) : []; return t.length === 3 && t[0] > 0 && t[0] < t[1] && t[1] < t[2] ? t : [50, 125, 400]; };
// the Bradford factor: S² × D, S = separate spells of unplanned absence, D = days of it. Days are given in date order as
// { work: a planned working day, abs: the share of the day that was an unplanned absence }. Days off do not end a spell;
// a working day without absence does. Many short absences weigh more than one long one.
function bradford(days) {
  let S = 0, D = 0, open = false;
  for (const x of days) { if (x.abs > 0) { D += x.abs; if (!open) { S++; open = true; } } else if (x.work) open = false; }
  return { spells: S, days: Math.round(D * 10) / 10, score: Math.round(S * S * D) };
}
const bfLevel = (score, t) => score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
// a pattern in unplanned absences: most of them on a Monday or a Friday (at least 3, and at least half of them)
function weekdayPattern(dates) {
  if (dates.length < 3) return null;
  const c = [0, 0, 0, 0, 0, 0, 0]; dates.forEach(d => c[dow(d)]++);
  const best = c[1] >= c[5] ? { dow: 1, n: c[1] } : { dow: 5, n: c[5] };
  return best.n >= 3 && best.n / dates.length >= 0.5 ? { ...best, total: dates.length } : null;
}

module.exports = { DAY, TIME, addDays, dow, diffDays, monday, localDay, orthodoxEaster, bgHolidays, defaults, settingsOf, shiftHours, cleanShifts, cleanCalendars, cleanPatterns, planOf, cellHours,
  okTz, tzOf, LT0, RULES0, cleanLeaveTypes, cleanRules, shiftWindow, dayStatus, periodStart, missingCheckIns, leaveSpan, balance, access, dayOfTime, atLocal, leavesBy, lvOn,
  countsBf, bfLevels, bradford, bfLevel, weekdayPattern };
