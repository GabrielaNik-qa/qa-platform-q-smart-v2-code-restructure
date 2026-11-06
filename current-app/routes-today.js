// Workforce, phase 3: Team today (who is in, late, not checked in, on a break, on leave, and the week ahead), patterns to
// watch (late arrivals, missing check-outs, the Bradford score, absences on Mondays or Fridays), the morning brief for team
// leads (written by the AI when it is connected, otherwise by the page from the same facts), the attendance reports, and the
// attendance the AI analyst can answer questions about. The rules live in wf.js; check-ins and time off in routes-att.js.
const wf = require('./wf'), ai = require('./ai');

module.exports = ({ app, load, save, need, bad, hex, iso, str, userBy, notify, limited, att }) => {
  const { W, statusOf, canDecide, members, calm, typeOf, bal, teamsFor } = att;
  const round1 = n => Math.round(n * 10) / 10, DOWN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // the working teams a person looks at: one team, or "" = all the teams they see
  const teamsOf = (db, me, team) => { const ts = teamsFor(db, me).filter(t => !t.system); return team ? ts.filter(t => t.id === team) : ts; };
  const isShift = (S, v) => S.shifts.some(s => s.id === v);
  const daysOf = (db, S, u, from, to, LV, now) => { const out = []; for (let d = from; d <= to; d = wf.addDays(d, 1)) out.push(statusOf(db, S, u, d, LV, now)); return out; };
  // the share of a day that was an unplanned absence: absent without leave = 1; leave of a type that counts in the Bradford
  // score = its share of a working day (a whole day, or ½ for a morning or an afternoon)
  const absOf = (S, s) => s.st === 'absent' ? 1 : !s.lt || !wf.countsBf(typeOf(S, s.lt)) ? 0 : s.st === 'leave' ? (isShift(S, s.plan) ? 1 : 0) : s.part === 'am' || s.part === 'pm' ? 0.5 : 0;
  const bfFrom = (S, ds) => { const b = wf.bradford(ds.map(s => ({ work: isShift(S, s.plan), abs: absOf(S, s) }))); return { ...b, level: wf.bfLevel(b.score, S.rules.bradford), last: (ds.filter(s => absOf(S, s) > 0).pop() || {}).d || '' }; };

  // patterns to watch for each person, from their last 365 days (kept for 5 minutes: they change slowly)
  const SIG = new Map();
  function signalsOf(db, S, people, LV, now) {
    const d = wf.localDay(), key = d + ':' + people.map(u => u.username).sort().join(','), hit = SIG.get(key);
    if (hit && now - hit.at < 5 * 6e4) return hit.v;
    const R = S.rules, m0 = d.slice(0, 8) + '01', d90 = wf.addDays(d, -89), out = [];
    people.forEach(u => {
      const ds = daysOf(db, S, u, wf.addDays(d, -364), d, LV, now), month = ds.filter(s => s.d >= m0), base = { u: u.username, name: u.name, team: u.team };
      const lates = month.filter(s => s.late).length, noOut = month.filter(s => s.noOut).length, bf = bfFrom(S, ds);
      if (R.since && lates && lates >= Math.max(1, R.lateLimit)) out.push({ ...base, kind: 'late', n: lates, of: R.lateLimit });
      if (noOut >= 2) out.push({ ...base, kind: 'noout', n: noOut });
      if (bf.level) out.push({ ...base, kind: 'bradford', n: bf.score, level: bf.level, spells: bf.spells, days: bf.days });
      const p = wf.weekdayPattern(ds.filter(s => s.d >= d90 && absOf(S, s) > 0).map(s => s.d));
      if (p) out.push({ ...base, kind: 'weekday', n: p.n, dow: p.dow, total: p.total });
    });
    const v = out.sort((a, b) => (b.level || 0) - (a.level || 0));
    SIG.set(key, { at: now, v }); if (SIG.size > 60) SIG.delete(SIG.keys().next().value);
    return v;
  }
  const sigText = g => g.kind === 'late' ? `late ${g.n} times this month (allowed: ${g.of})` : g.kind === 'noout' ? `no check-out ${g.n} times this month`
    : g.kind === 'bradford' ? `Bradford score ${g.n} (${g.spells} absences, ${g.days} days in a year)` : g.kind === 'weekday' ? `often absent on ${DOWN[g.dow]}s (${g.n} of ${g.total} absences)` : '';
  // the next 7 days: how many people are planned, how many usually are (without time off), who is away; a day with fewer than
  // "minOnPct" of the usual people is short-staffed
  function weekOf(db, S, people, LV) {
    const d = wf.localDay();
    return Array.from({ length: 7 }, (_, i) => { const x = wf.addDays(d, i), away = []; let usual = 0, planned = 0, asked = 0;
      people.forEach(u => { if (!isShift(S, wf.planOf(S, u, x, db.rota || {}).v)) return; usual++;
        const l = wf.lvOn(LV[u.username], x, true);
        if (l && !l.pend && l.part === 'full') away.push({ name: u.name, lt: l.lt }); else { planned++; if (l && l.pend) asked++; } });
      return { d: x, usual, planned, asked, away, warn: usual > 0 && planned < usual * S.rules.minOnPct / 100 }; });
  }

  // ---------------------------------------------------------------- Workforce › Team today
  app.get('/api/wf/today', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), q = req.query || {}, want = typeof q.team === 'string' ? q.team : '';
    const ts = teamsOf(db, me, want), d = wf.localDay(), now = Date.now(), LV = wf.leavesBy(db.leaves), people = ts.flatMap(t => members(db, t));
    const rows = people.map(u => { const s = statusOf(db, S, u, d, LV, now), win = wf.shiftWindow(S, d, { v: s.plan, half: s.half }, s.tz);
      return { u: u.username, name: u.name, team: u.team, start: win ? win.s.start : '', end: win ? win.s.end : '', ...calm(db, s, u.username) }; });
    const c = f => rows.filter(f).length, mine = x => canDecide(db, me, userBy(db, x.u));
    const counts = { size: rows.length, planned: c(r => r.start && r.st !== 'leave'), working: c(r => r.st === 'working' && !r.brk), brk: c(r => r.st === 'working' && r.brk), late: c(r => r.late),
      missing: c(r => r.st === 'missing'), absent: c(r => r.st === 'absent'), leave: c(r => r.st === 'leave'), off: c(r => r.st === 'off' || r.st === 'hol'), upcoming: c(r => r.st === 'upcoming'), done: c(r => r.st === 'done') };
    res.json({ d, team: want && ts.length ? ts[0].id : '', teams: teamsOf(db, me, '').map(t => t.id), rows, counts, week: weekOf(db, S, people, LV), signals: signalsOf(db, S, people, LV, now),
      waiting: { leave: (db.leaves || []).filter(L => L.status === 'pending' && mine(L)).length, fixes: (db.attFix || []).filter(f => f.status === 'pending' && mine(f)).length },
      briefs: (db.attBriefs || []).filter(b => b.d === d && ts.some(t => t.id === b.team)), since: S.rules.since, briefOn: S.rules.briefOn, ai: ai.enabled() });
  });

  // ---------------------------------------------------------------- the morning brief
  // the facts of a team's morning: the AI writes the brief from these only; without the AI the page writes them out
  function factsOf(db, S, team, lead) {
    const d = wf.localDay(), now = Date.now(), LV = wf.leavesBy(db.leaves), people = members(db, team), ltn = id => (typeOf(S, id) || {}).name || 'Leave', t = new Date(now);
    const rows = people.map(u => { const s = statusOf(db, S, u, d, LV, now), w = wf.shiftWindow(S, d, { v: s.plan, half: s.half }, s.tz); return { u, s, start: w ? w.s.start : '' }; });
    const mine = x => !!lead && canDecide(db, lead, userBy(db, x.u));
    return { team: team.name, date: d, weekday: DOWN[wf.dow(d)], time: String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'),
      size: people.length, planned: rows.filter(x => x.start && x.s.st !== 'leave').length, checkedIn: rows.filter(x => x.s.in).length,
      late: rows.filter(x => x.s.late).map(x => ({ name: x.u.name, minutes: x.s.late })),
      notCheckedIn: rows.filter(x => x.s.st === 'missing').map(x => ({ name: x.u.name, shiftStart: x.start })),
      absent: rows.filter(x => x.s.st === 'absent').map(x => x.u.name),
      onLeave: rows.filter(x => x.s.st === 'leave').map(x => ({ name: x.u.name, type: ltn(x.s.lt) })),
      laterToday: rows.filter(x => x.s.st === 'upcoming').map(x => ({ name: x.u.name, shiftStart: x.start })),
      toWatch: signalsOf(db, S, people, LV, now).map(g => ({ name: g.name, kind: g.kind, n: g.n, of: g.of, level: g.level, spells: g.spells, days: g.days, dow: g.dow, total: g.total, what: sigText(g) })),
      weekAhead: weekOf(db, S, people, LV).filter(w => w.warn).map(w => ({ date: w.d, weekday: DOWN[wf.dow(w.d)], planned: w.planned, usually: w.usual, away: w.away.map(a => `${a.name} (${ltn(a.lt)})`) })),
      waitingForYou: { timeOffRequests: (db.leaves || []).filter(L => L.status === 'pending' && mine(L)).length, corrections: (db.attFix || []).filter(f => f.status === 'pending' && mine(f)).length } };
  }
  // one brief per team and day, written in the team lead's language; when it goes out by itself the team lead (and their
  // deputy for these dates, or the admins when the team has no lead) is told
  async function writeBrief(team, by, auto) {
    const db0 = load(), S = W(db0), lead = team.lead ? userBy(db0, team.lead) : null, F = factsOf(db0, S, team, lead), lang = ((lead || {}).prefs || {}).lang || 'en';
    let text = '', err = '';
    if (ai.enabled()) { try { text = await ai.morningBrief(F, ((db0.settings || {}).ai || {}).playbook, lang); } catch (e) { err = e.message; } }
    const db = load(), x = { id: 'b' + hex(5), team: team.id, d: F.date, at: iso(), by, auto: !!auto, ai: !!text, text, facts: F, err };
    db.attBriefs = [x, ...(db.attBriefs || []).filter(b => !(b.team === team.id && b.d === F.date))].slice(0, 400);
    if (auto) {
      const dp = lead && lead.deputy && lead.deputy.u && (!lead.deputy.from || lead.deputy.from <= F.date) && (!lead.deputy.to || F.date <= lead.deputy.to) ? lead.deputy.u : '';
      const to = [lead && lead.active !== false ? lead.username : '', dp].filter(Boolean);
      (to.length ? to : db.users.filter(u => u.role === 'admin' && u.active !== false).map(u => u.username)).forEach(u => notify(db, u, 'brief', `Morning brief for ${team.name} is ready`, { brief: x.id }));
    }
    save(db); return x;
  }
  app.post('/api/wf/brief', need('admin', 'qa', 'lead', 'trainer'), async (req, res) => {
    const db = load(), me = req.session.user, want = str((req.body || {}).team, 40), t = want ? teamsOf(db, me, want)[0] : null;
    if (!t) return bad(res, 'Choose a team');
    if (limited('brief:' + me.username, 20, 36e5)) return res.status(429).json({ error: 'Too many briefs in one hour. Try again later.' });
    try { res.json(await writeBrief(t, me.name, false)); } catch (e) { bad(res, e.message); }
  });
  // every 5 minutes (when switched on in Attendance rules, and from the day attendance is tracked): a team that has none yet
  // today gets its brief "briefAfter" minutes after its first shift of the day starts
  let bbusy = false;
  const briefTick = async () => {
    if (bbusy) return; bbusy = true;
    try {
      const db = load(), S = W(db), R = S.rules, d = wf.localDay(), now = Date.now();
      if (!R.briefOn || !R.since || d < R.since) return;
      for (const t of db.teams.filter(x => !x.system)) {
        if ((load().attBriefs || []).some(b => b.team === t.id && b.d === d)) continue;
        const starts = members(db, t).map(u => wf.shiftWindow(S, d, wf.planOf(S, u, d, db.rota || {}), wf.tzOf(S, u))).filter(Boolean).map(w => w.start);
        if (starts.length && now >= Math.min(...starts) + R.briefAfter * 6e4) await writeBrief(t, 'Morning brief', true);
      }
    } catch (e) { /* tried again in 5 minutes */ } finally { bbusy = false; }
  };
  if (!process.env.NO_SCHEDULE) setInterval(briefTick, 5 * 6e4).unref();
  app.locals.briefTick = briefTick;

  // ---------------------------------------------------------------- Workforce › Attendance › Reports
  // per person and per team for a period (at most a year), with the Bradford score of the 52 weeks up to the end of the
  // period and this year's leave balances
  app.get('/api/att/report', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), q = req.query || {}, today = wf.localDay(), now = Date.now(), LV = wf.leavesBy(db.leaves), y = Number(today.slice(0, 4));
    const want = typeof q.team === 'string' ? q.team : '', ts = teamsOf(db, me, want);
    let to = wf.DAY.test(typeof q.to === 'string' ? q.to : '') ? q.to : today, from = wf.DAY.test(typeof q.from === 'string' ? q.from : '') ? q.from : today.slice(0, 8) + '01';
    if (to > today) to = today; if (from > to) from = to; if (wf.diffDays(from, to) > 365) from = wf.addDays(to, -365);
    const y0 = wf.addDays(to, -364), start = from < y0 ? from : y0;
    const people = ts.flatMap(t => members(db, t).map(u => {
      const ds = daysOf(db, S, u, start, to, LV, now), period = ds.filter(s => s.d >= from);
      const m = { planned: 0, plannedH: 0, present: 0, onPlan: 0, late: 0, lateMin: 0, early: 0, short: 0, absent: 0, noOut: 0, extra: 0, worked: 0, unplanned: 0, leave: {} };
      period.forEach(s => {
        if (s.st === 'untracked' || s.st === 'upcoming' || s.st === 'missing') return;   // not tracked yet, or a shift of today that is not over: left out
        const work = isShift(S, s.plan), here = s.st === 'done' || s.st === 'working' || s.st === 'extra';
        if (work && s.st !== 'leave') { m.planned++; m.plannedH += s.ph; }
        if (here) { m.present++; if (work) m.onPlan++; } if (s.st === 'extra') m.extra++;
        if (s.late) { m.late++; m.lateMin += s.late; } if (s.early) m.early++; if (s.short) m.short++; if (s.noOut) m.noOut++; if (s.st === 'absent') m.absent++;
        m.worked += s.worked || 0; m.unplanned += absOf(S, s);
        const lv = work && s.lt ? (s.st === 'leave' ? 1 : s.part === 'am' || s.part === 'pm' ? 0.5 : 0) : 0; if (lv) m.leave[s.lt] = (m.leave[s.lt] || 0) + lv;
      });
      return { u: u.username, name: u.name, team: u.team, ...m, plannedH: round1(m.plannedH), worked: round1(m.worked / 60), unplanned: round1(m.unplanned),
        lateDates: period.filter(s => s.late).map(s => s.d), bradford: bfFrom(S, ds.filter(s => s.d >= y0)), balances: S.leaveTypes.map(T => bal(db, S, T, u, y)) };
    }));
    const teams = ts.map(t => { const p = people.filter(x => x.team === t.id), sum = k => p.reduce((a, x) => a + x[k], 0), planned = sum('planned'), pct = v => planned ? Math.round(v / planned * 100) : null;
      return { team: t.id, people: p.length, planned, present: sum('present'), late: sum('late'), absent: sum('absent'), leave: round1(p.reduce((a, x) => a + Object.values(x.leave).reduce((b, v) => b + v, 0), 0)),
        worked: round1(sum('worked')), plannedH: round1(sum('plannedH')), presentPct: pct(sum('onPlan')), latePct: pct(sum('late')), absentPct: pct(sum('absent')) }; });
    res.json({ from, to, team: want && ts.length ? ts[0].id : '', year: y, levels: S.rules.bradford, since: S.rules.since, people, teams });
  });

  // ---------------------------------------------------------------- what the AI analyst can answer about attendance
  // ("Who is off on Friday?", "How many agents do I have today?", "Who was late last week?"): today, the next 14 days and
  // the last 30 days of the teams the person asking sees, kept short (only the people something is to be said about)
  app.locals.attPack = (db, see) => {
    const S = W(db), d = wf.localDay(), now = Date.now(), LV = wf.leavesBy(db.leaves), ltn = id => (typeOf(S, id) || {}).name || 'Leave';
    const ts = db.teams.filter(t => !t.system && see(t.id)), people = ts.flatMap(t => members(db, t)), tname = id => (db.teams.find(t => t.id === id) || {}).name || id;
    const rows = people.map(u => ({ u, s: statusOf(db, S, u, d, LV, now) })), who = f => rows.filter(f).map(x => x.u.name + ' (' + tname(x.u.team) + ')');
    const today = { teams: ts.map(t => { const r = rows.filter(x => x.u.team === t.id); return { team: t.name, people: r.length, planned: r.filter(x => isShift(S, x.s.plan) && x.s.st !== 'leave').length, checkedIn: r.filter(x => x.s.in).length }; }),
      late: rows.filter(x => x.s.late).map(x => `${x.u.name} (${x.s.late} min)`), notCheckedInYet: who(x => x.s.st === 'missing'), absent: who(x => x.s.st === 'absent'),
      onLeave: rows.filter(x => x.s.st === 'leave').map(x => `${x.u.name} (${ltn(x.s.lt)})`), laterToday: who(x => x.s.st === 'upcoming') };
    const next14Days = Array.from({ length: 14 }, (_, i) => { const x = wf.addDays(d, i), away = []; let planned = 0;
      people.forEach(u => { const l = wf.lvOn(LV[u.username], x, true); if (l) away.push(`${u.name} (${ltn(l.lt)}${l.pend ? ', waiting for approval' : ''})`); else if (isShift(S, wf.planOf(S, u, x, db.rota || {}).v)) planned++; });
      return { date: x, weekday: DOWN[wf.dow(x)], planned, away }; });
    const last30Days = people.map(u => { const ds = daysOf(db, S, u, wf.addDays(d, -30), wf.addDays(d, -1), LV, now);
      return { name: u.name, team: tname(u.team), late: ds.filter(s => s.late).map(s => `${s.d} (${s.late} min)`), absent: ds.filter(s => s.st === 'absent').map(s => s.d), leaveDays: ds.filter(s => s.st === 'leave' && isShift(S, s.plan)).length }; })
      .filter(x => x.late.length || x.absent.length || x.leaveDays);
    return { asOf: d, weekday: DOWN[wf.dow(d)], trackedSince: S.rules.since || 'not tracked yet', today, next14Days, last30Days };
  };
};
