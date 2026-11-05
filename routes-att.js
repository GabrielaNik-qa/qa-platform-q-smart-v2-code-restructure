// Workforce, phase 2: attendance and time off (the rules live in wf.js).
// Attendance: check in, breaks and check out (always the server's clock), the status of every day worked out from the rota
// (late, left early, short hours, absent), a warning after too many late arrivals, an alert to the team lead when somebody
// has not checked in, and corrections: asked by the person and approved by their team lead, or made by the lead directly.
// Time off: requests (days, half days or hours), approval by the team lead (or their deputy), balances per type and year,
// cancelling some days or all, and the team calendar with a warning when too many people are off on the same day.
const wf = require('./wf');

module.exports = ({ app, load, save, need, bad, hex, iso, str, userBy, notify, scopeOf, seesUser, ADMIN_TEAM }) => {
  const W = db => ({ ...wf.settingsOf(db.settings && db.settings.wf, wf.localDay()), tz: ((db.settings || {}).org || {}).tz || '' });   // tz: the company's time zone
  const { teamsFor, canPlan } = wf.access({ scopeOf, seesUser, userBy, ADMIN_TEAM });
  const recOf = (db, d, un) => ((db.att || {})[d] || {})[un];
  const nameOf = (db, un) => (userBy(db, un) || {}).name || un;
  const pickTeam = (db, me, q) => { const ts = teamsFor(db, me); return ts.find(t => t.id === q.team) || ts.find(t => !t.system) || ts[0]; };
  const members = (db, team) => db.users.filter(u => u.team === team.id && u.active !== false).sort((a, b) => a.name.localeCompare(b.name));

  // who decides about a person's corrections and time off: their reporting manager, else the lead of their team (for staff
  // without a manager: the admins). A deputy named by that person for these dates decides too; admins always can.
  function approversOf(db, u) {
    const team = db.teams.find(t => t.id === u.team), mgr = u.manager && userBy(db, u.manager), lead = team && !team.system && team.lead && team.lead !== u.username ? userBy(db, team.lead) : null;
    const first = [mgr || lead].filter(p => p && p.active !== false), d = wf.localDay();
    const deps = first.map(p => p.deputy && p.deputy.u && (!p.deputy.from || p.deputy.from <= d) && (!p.deputy.to || d <= p.deputy.to) ? userBy(db, p.deputy.u) : null).filter(p => p && p.active !== false && p.username !== u.username);
    const all = [...first, ...deps];
    return all.length ? all : db.users.filter(p => p.role === 'admin' && p.active !== false && p.username !== u.username);
  }
  const canDecide = (db, me, u) => !!u && u.username !== me.username && (me.role === 'admin' || approversOf(db, u).some(p => p.username === me.username));
  const NOT_LEAD = 'Only the team lead of this person (or their deputy) can decide';

  // ---------------------------------------------------------------- attendance
  // the day a check-in belongs to: today, or yesterday while last night's shift is still open or still running
  function activeDay(db, S, u, now) {
    const tz = wf.tzOf(S, u), d = wf.localDay(tz), y = wf.addDays(d, -1), ry = recOf(db, y, u.username);
    if (ry && ry.in && !ry.out && now - Date.parse(ry.in) < 16 * 36e5) return y;
    const wy = wf.shiftWindow(S, y, wf.planOf(S, u, y, db.rota || {}), tz);
    return wy && wy.end > now && !(ry && ry.in) && !(recOf(db, d, u.username) || {}).in ? y : d;
  }
  const statusOf = (db, S, u, d, LV, now) => { const plan = wf.planOf(S, u, d, db.rota || {}), tz = wf.tzOf(S, u);   // tz: the times are shown in the person's own time zone
    return { d, plan: plan.v, half: !!plan.half, ph: wf.cellHours(S, plan), tz, ...wf.dayStatus(S, S.rules, d, plan, recOf(db, d, u.username), wf.lvOn(LV[u.username], d), now, tz) }; };
  // what the page shows live: while somebody works, the page counts the minutes itself from the check-in and the breaks,
  // so the data only changes when something happens (the page is not redrawn every minute)
  const calm = (db, s, un) => s.st === 'working' ? { ...s, worked: null, brks: ((recOf(db, s.d, un) || {}).brk || []) } : s.st === 'missing' ? { ...s, mins: null } : s;
  const latesFrom = (db, S, u, d, LV, now) => { let n = 0; for (let x = wf.periodStart(d, S.rules.latePeriod); x <= d; x = wf.addDays(x, 1)) if (statusOf(db, S, u, x, LV, now).late) n++; return n; };
  const fixOut = db => f => ({ ...f, name: nameOf(db, f.u) });
  function meOut(db, me, now) {
    const S = W(db), u = userBy(db, me.username), LV = wf.leavesBy(db.leaves), d = activeDay(db, S, u, now), R = S.rules, fixes = db.attFix || [];
    return { today: calm(db, statusOf(db, S, u, d, LV, now), u.username), days: Array.from({ length: 14 }, (_, i) => statusOf(db, S, u, wf.addDays(d, -i - 1), LV, now)),
      lates: latesFrom(db, S, u, d, LV, now), lateLimit: R.lateLimit, latePeriod: R.latePeriod, fixDays: R.fixDays, fixReasons: R.fixReasons, since: R.since,
      fixes: fixes.filter(f => f.u === me.username).slice(0, 30), waiting: me.role === 'agent' ? [] : fixes.filter(f => f.status === 'pending' && canDecide(db, me, userBy(db, f.u))).map(fixOut(db)) };
  }
  // after too many late arrivals in the week or month (Workforce set-up › Attendance rules) the person and their team lead are warned: no deduction
  function lateWarning(db, S, u, d, now) {
    const R = S.rules; if (!R.since || d < R.since) return;
    const LV = wf.leavesBy(db.leaves), st = statusOf(db, S, u, d, LV, now); if (!st.late) return;
    const n = latesFrom(db, S, u, d, LV, now); if (n <= R.lateLimit) return;
    notify(db, u.username, 'att', `You checked in ${st.late} minutes late: ${n} late arrivals this ${R.latePeriod} (allowed: ${R.lateLimit}).`, { att: d });
    approversOf(db, u).forEach(p => notify(db, p.username, 'att', `${u.name} checked in ${st.late} minutes late: ${n} late arrivals this ${R.latePeriod} (allowed: ${R.lateLimit}).`, { att: d, u: u.username }));
  }
  app.get('/api/att/me', need(), (req, res) => res.json(meOut(load(), req.session.user, Date.now())));
  // check in, start or end a break, check out: always with the server's clock; checking in again after checking out
  // continues the same day (the time in between becomes a break)
  app.post('/api/att/punch', need(), (req, res) => {
    const db = load(), me = req.session.user, u = userBy(db, me.username), a = (req.body || {}).action, now = Date.now(), at = new Date(now).toISOString();
    if (!['in', 'out', 'break', 'back'].includes(a)) return bad(res, 'Choose check in, break or check out');
    const S = W(db), d = activeDay(db, S, u, now); db.att = db.att || {}; db.att[d] = db.att[d] || {};
    let r = db.att[d][u.username]; const first = !r || !r.in;
    if (a === 'in') {
      if (r && r.in && !r.out) return bad(res, 'You are already checked in');
      if (r && r.in) { r.brk = [...(r.brk || []), { s: r.out, e: at }]; r.out = ''; }
      else r = db.att[d][u.username] = { ...(r || {}), in: at, out: '', brk: [], src: 'web' };
    } else {
      if (!r || !r.in || r.out) return bad(res, 'Check in first');
      r.brk = r.brk || []; const ob = r.brk.find(b => !b.e);
      if (a === 'break') { if (ob) return bad(res, 'You are already on a break'); r.brk.push({ s: at, e: '' }); }
      if (a === 'back') { if (!ob) return bad(res, 'You are not on a break'); ob.e = at; }
      if (a === 'out') { if (ob) ob.e = at; r.out = at; }
    }
    r.log = [...(r.log || []).slice(-40), { at, by: u.username, what: a === 'in' && !first ? 'in again' : a }];
    if (a === 'in' && first) lateWarning(db, S, u, d, now);
    save(db); res.json(meOut(db, me, now));
  });
  // a team's day: every member with their plan, check-in, check-out and status
  app.get('/api/att/day', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), q = req.query || {}, team = pickTeam(db, me, q), now = Date.now(), LV = wf.leavesBy(db.leaves);
    const d = wf.DAY.test(typeof q.d === 'string' ? q.d : '') ? q.d : wf.localDay();
    if (!team) return res.json({ team: '', d, rows: [] });
    res.json({ team: team.id, d, since: S.rules.since, rows: members(db, team).map(u => ({ u: u.username, name: u.name, edit: canPlan(db, me, u.username), log: ((recOf(db, d, u.username) || {}).log || []).slice(-8), ...calm(db, statusOf(db, S, u, d, LV, now), u.username) })) });
  });
  // a team's month: per person the days present, late arrivals, absences, early departures, short days, leave, and hours
  app.get('/api/att/month', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), q = req.query || {}, team = pickTeam(db, me, q), now = Date.now(), LV = wf.leavesBy(db.leaves), today = wf.localDay();
    const m = typeof q.m === 'string' && /^\d{4}-\d{2}$/.test(q.m) ? q.m : today.slice(0, 7), days = [];
    for (let x = m + '-01'; x.startsWith(m); x = wf.addDays(x, 1)) days.push(x);
    if (!team) return res.json({ team: '', m, days, rows: [] });
    const rows = members(db, team).map(u => {
      const t = { present: 0, late: 0, lateMin: 0, absent: 0, early: 0, short: 0, leave: 0, worked: 0, planned: 0 };
      const ds = days.map(d => {
        const s = statusOf(db, S, u, d, LV, now); t.planned += s.st === 'leave' ? 0 : s.ph * 60;
        if (d > today) return { c: '' };
        if (['done', 'working', 'extra'].includes(s.st)) t.present++;
        if (s.late) { t.late++; t.lateMin += s.late; } if (s.early) t.early++; if (s.short) t.short++; if (s.st === 'absent') t.absent++; if (s.st === 'leave') t.leave++;
        t.worked += s.worked || 0;
        const c = { none: '', off: 'o', hol: 'h', leave: 'v', upcoming: '', untracked: '', missing: 'm', absent: 'a', working: 'w', done: 'p', extra: 'x' }[s.st] || '';
        return { c: c === 'p' && (s.late || s.early || s.short) ? 'l' : c, late: s.late || 0, early: s.early || 0, in: s.in || '', out: s.out || '', lt: s.lt || '' };
      });
      return { u: u.username, name: u.name, days: ds, ...t, worked: Math.round(t.worked / 6) / 10, planned: Math.round(t.planned / 6) / 10 };
    });
    res.json({ team: team.id, m, days, since: S.rules.since, rows });
  });
  // writes check-in / check-out times (HH:MM) for a day; a check-out earlier than the check-in is the next morning (night shift)
  function applyTimes(db, u, d, tin, tout, by, what) {
    const ok = v => v === undefined || v === '' || (typeof v === 'string' && wf.TIME.test(v));
    if (!ok(tin) || !ok(tout)) return 'Enter the times as HH:MM';
    db.att = db.att || {}; db.att[d] = db.att[d] || {}; const cur = db.att[d][u.username] || { in: '', out: '', brk: [] };
    const tz = wf.tzOf(W(db), u), i = tin === undefined ? cur.in : tin ? new Date(wf.atLocal(d, tin, tz)).toISOString() : '';   // the times typed are the person's local times
    let o = tout === undefined ? cur.out : tout ? new Date(wf.atLocal(d, tout, tz)).toISOString() : '';
    if (!i && o) return 'Enter the check-in time too';
    if (i && o && Date.parse(o) <= Date.parse(i)) o = new Date(Date.parse(o) + 864e5).toISOString();
    db.att[d][u.username] = { ...cur, in: i, out: o, brk: cur.brk || [], src: 'fix', log: [...(cur.log || []).slice(-40), { at: iso(), by, what }] };
    return '';
  }
  // a team lead (or admin) corrects a day directly: the times are written, the person is told, and the history keeps it
  app.put('/api/att/rec', need('admin', 'lead'), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {}, u = userBy(db, str(b.u, 40)), d = str(b.d, 10), why = str(b.reason, 200);
    if (!u || !wf.DAY.test(d)) return bad(res, 'Choose a person and a day');
    if (!canPlan(db, me, u.username)) return res.status(403).json({ error: 'You can correct the attendance of the people in your own teams only' });
    if (d > wf.localDay()) return bad(res, 'A day in the future cannot be corrected');
    if (!why) return bad(res, 'Write the reason for the correction');
    const err = applyTimes(db, u, d, b.in, b.out, me.username, 'corrected: ' + why); if (err) return bad(res, err);
    if (u.username !== me.username) notify(db, u.username, 'fix', `${me.name} corrected your attendance of ${d}: ${why}`, { att: d });
    save(db); res.json({ ok: 1 });
  });
  // a correction asked by the person ("I forgot to check in"): within the days the rules allow, with a reason from the list
  app.post('/api/att/fix', need(), (req, res) => {
    const db = load(), me = req.session.user, u = userBy(db, me.username), R = W(db).rules, b = req.body || {}, d = str(b.d, 10), today = wf.localDay();
    if (!R.fixDays) return bad(res, 'Corrections are switched off. Ask your team lead.');
    if (!wf.DAY.test(d) || d > today) return bad(res, 'Choose today or a day that has passed');
    if (wf.diffDays(d, today) > R.fixDays) return bad(res, `Corrections are possible up to ${R.fixDays} days back. Ask your team lead.`);
    const tin = typeof b.in === 'string' ? b.in : '', tout = typeof b.out === 'string' ? b.out : '';
    if ((tin && !wf.TIME.test(tin)) || (tout && !wf.TIME.test(tout)) || (!tin && !tout)) return bad(res, 'Enter the check-in time, the check-out time or both, as HH:MM');
    if (!R.fixReasons.includes(b.reason)) return bad(res, 'Choose the reason from the list');
    if ((db.attFix || []).some(f => f.u === u.username && f.d === d && f.status === 'pending')) return bad(res, 'You already asked for a correction of this day');
    const f = { id: 'f' + hex(5), u: u.username, d, in: tin, out: tout, reason: b.reason, note: str(b.note, 300), status: 'pending', at: iso() };
    db.attFix = [f, ...(db.attFix || [])].slice(0, 3000);
    approversOf(db, u).forEach(p => notify(db, p.username, 'fix', `${u.name} asks to correct the attendance of ${d}: ${f.reason}`, { fix: f.id }));
    save(db); res.json(f);
  });
  app.post('/api/att/fix/:id/decide', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {}, f = (db.attFix || []).find(x => x.id === req.params.id);
    if (!f) return res.status(404).json({ error: 'not found' });
    const u = userBy(db, f.u); if (!canDecide(db, me, u)) return res.status(403).json({ error: NOT_LEAD });
    if (f.status !== 'pending') return bad(res, 'This request was already decided');
    const ok = b.ok === true;
    if (ok) { const e = applyTimes(db, u, f.d, f.in || undefined, f.out || undefined, me.username, 'correction approved: ' + f.reason); if (e) return bad(res, e); }
    Object.assign(f, { status: ok ? 'approved' : 'rejected', decided: iso(), dby: me.username, why: str(b.why, 300) });
    notify(db, u.username, 'fix', ok ? `Your correction of ${f.d} was approved` : `Your correction of ${f.d} was not approved${f.why ? ': ' + f.why : ''}`, { fix: f.id });
    save(db); res.json(fixOut(db)(f));
  });
  // every 5 minutes: people whose shift started more than "missingAfter" minutes ago and who have not checked in; their
  // team lead is told once a day (only from the day attendance is tracked, never about somebody on leave)
  let mbusy = false;
  const missing = () => {
    if (mbusy) return; mbusy = true;
    try {
      const db = load(), S = W(db), d = wf.localDay(), LV = wf.leavesBy(db.leaves), sent = (db.attAlerts || {})[d] || {};
      const list = wf.missingCheckIns(S, S.rules, db.users.filter(u => u.active !== false && u.role === 'agent'), d, db.rota || {}, db.att || {}, (u, x) => wf.lvOn(LV[u.username], x), Date.now()).filter(x => !sent[x.u]);
      if (!list.length) return;
      db.attAlerts = db.attAlerts || {}; db.attAlerts[d] = { ...sent };
      list.forEach(x => { const u = userBy(db, x.u); db.attAlerts[d][x.u] = 1; approversOf(db, u).forEach(p => notify(db, p.username, 'att', `${u.name} has not checked in yet (shift from ${x.start})`, { att: d, u: u.username })); });
      Object.keys(db.attAlerts).filter(k => k < wf.addDays(d, -7)).forEach(k => delete db.attAlerts[k]);
      save(db);
    } catch (e) { /* tried again in 5 minutes */ } finally { mbusy = false; }
  };
  if (!process.env.NO_SCHEDULE) setInterval(missing, 5 * 6e4).unref();
  app.locals.attMissing = missing;

  // ---------------------------------------------------------------- time off
  const typeOf = (S, id) => S.leaveTypes.find(t => t.id === id);
  const firstYear = db => Math.min(Number(wf.localDay().slice(0, 4)), ...(db.leaves || []).map(L => Number(String(L.from).slice(0, 4)) || 9999), ...(db.leaveAdj || []).map(a => Number(a.year) || 9999));
  const bal = (db, S, T, u, y, leaves) => wf.balance(S, T, u, Number(y), leaves || db.leaves || [], db.leaveAdj || [], db.rota || {}, 0, firstYear(db));
  const forWhom = (db, me, un) => !un || un === me.username ? userBy(db, me.username) : canPlan(db, me, un) ? userBy(db, un) : null;
  const spanOf = (db, S, L) => { const T = typeOf(S, L.lt), u = userBy(db, L.u) || { username: L.u }; return T ? wf.leaveSpan(S, T, u, L, db.rota || {}) : {}; };
  const total = o => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 10) / 10;
  // the days when, with this time off, more of the team would be off than the rule allows (pending requests count too)
  function teamWarn(db, S, u, span, selfId) {
    const pct = S.rules.teamOffPct, team = db.teams.find(t => t.id === u.team); if (!pct || !team || team.system) return [];
    const others = db.users.filter(x => x.team === u.team && x.active !== false && x.username !== u.username), size = others.length + 1, LV = wf.leavesBy((db.leaves || []).filter(L => L.id !== selfId));
    return Object.keys(span).filter(d => span[d] > 0).map(d => ({ d, n: 1 + others.filter(x => wf.lvOn(LV[x.username], d, true)).length, size })).filter(w => w.n >= 2 && w.n > w.size * pct / 100);
  }
  // a request checked before it is saved: the days it takes, the balance after it (per year), the days with too many people off
  function check(db, S, u, b, selfId) {
    const T = typeOf(S, b.lt); if (!T) return { err: 'Choose the type of time off' };
    const from = str(b.from, 10), to = T.unit === 'hour' ? from : str(b.to || b.from, 10);
    if (!wf.DAY.test(from) || !wf.DAY.test(to) || to < from) return { err: 'Choose the first and the last day' };
    if (wf.diffDays(from, to) > 92) return { err: 'Ask for at most three months at once' };
    let part = from === to && T.half && ['am', 'pm'].includes(b.part) ? b.part : 'full', hours = 0;
    if (T.unit === 'hour') { hours = Number(b.hours); if (!(hours >= 0.5 && hours <= 12)) return { err: 'Enter between 0.5 and 12 hours' }; hours = Math.round(hours * 2) / 2; part = 'hours'; }
    const L = { u: u.username, lt: T.id, from, to, part, hours }, span = wf.leaveSpan(S, T, u, L, db.rota || {}), days = total(span);
    if (!days) return { err: 'These are not working days: there is nothing to take' };
    if ((db.leaves || []).some(x => x.u === u.username && x.id !== selfId && (x.status === 'approved' || x.status === 'pending') && Object.keys(span).some(d => d >= x.from && d <= x.to && !(x.off || []).includes(d))))
      return { err: 'There is already time off on some of these days' };
    const byYear = {}; Object.entries(span).forEach(([d, v]) => { byYear[d.slice(0, 4)] = (byYear[d.slice(0, 4)] || 0) + v; });
    const after = Object.entries(byYear).map(([y, v]) => { const B = bal(db, S, T, u, y, (db.leaves || []).filter(x => x.id !== selfId));
      return B.unlimited ? null : { year: y, left: Math.round((B.left - B.pending) * 10) / 10, after: Math.round((B.left - B.pending - v) * 10) / 10 }; }).filter(Boolean);
    return { T, L: { ...L, days }, after, warn: teamWarn(db, S, u, span, selfId) };
  }
  const what = (T, L) => `${T ? T.name : ''}, ${L.from === L.to ? L.from : L.from + ' – ' + L.to} (${L.days} ${T && T.unit === 'hour' ? 'h' : 'd'})`;
  const withInfo = (db, S, L) => { const u = userBy(db, L.u) || { username: L.u }, T = typeOf(S, L.lt), span = spanOf(db, S, L), y = L.from.slice(0, 4);
    const B = T ? bal(db, S, T, u, y) : null;
    return { ...L, name: nameOf(db, L.u), left: B && !B.unlimited ? B.left : null, warn: teamWarn(db, S, u, span, L.id) }; };

  app.get('/api/leave', need(), (req, res) => {
    const db = load(), me = req.session.user, u = userBy(db, me.username), S = W(db), y = Number(wf.localDay().slice(0, 4));
    res.json({ year: y, balances: S.leaveTypes.map(T => bal(db, S, T, u, y)),
      mine: (db.leaves || []).filter(L => L.u === me.username).slice(0, 80),
      waiting: me.role === 'agent' ? [] : (db.leaves || []).filter(L => L.status === 'pending' && canDecide(db, me, userBy(db, L.u))).map(L => withInfo(db, S, L)),
      decided: me.role === 'agent' ? [] : (db.leaves || []).filter(L => L.dby === me.username && L.u !== me.username).slice(0, 20).map(L => ({ ...L, name: nameOf(db, L.u) })),
      deputy: u.deputy || null, approvers: approversOf(db, u).map(p => p.name) });
  });
  app.post('/api/leave/preview', need(), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {}, u = forWhom(db, me, typeof b.u === 'string' ? b.u : '');
    if (!u) return res.status(403).json({ error: 'You can ask for time off for yourself, or for the people of your own teams' });
    const S = W(db), c = check(db, S, u, b); if (c.err) return bad(res, c.err);
    res.json({ days: c.L.days, unit: c.T.unit, after: c.after, warn: c.warn, approval: c.T.approval && u.username === me.username });
  });
  app.post('/api/leave', need(), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {}, u = forWhom(db, me, typeof b.u === 'string' ? b.u : '');
    if (!u) return res.status(403).json({ error: 'You can ask for time off for yourself, or for the people of your own teams' });
    const S = W(db), c = check(db, S, u, b); if (c.err) return bad(res, c.err);
    const short = c.after.find(a => a.after < 0); if (short) return bad(res, `Not enough left: ${short.left} ${c.T.unit === 'hour' ? 'hours' : 'days'} in ${short.year}`);
    const self = u.username === me.username, auto = !c.T.approval || !self;                     // a team lead registering time off for someone approves it at once
    const L = { id: 'l' + hex(5), ...c.L, note: str(b.note, 300), status: auto ? 'approved' : 'pending', at: iso(), by: me.username, ...(auto ? { decided: iso(), dby: me.username } : {}) };
    db.leaves = [L, ...(db.leaves || [])].slice(0, 20000);
    if (!self) notify(db, u.username, 'leave', `${me.name} registered time off for you: ${what(c.T, L)}`, { leave: L.id });
    else approversOf(db, u).forEach(p => notify(db, p.username, 'leave', auto ? `${u.name} is off: ${what(c.T, L)}` : `${u.name} asks for time off: ${what(c.T, L)}`, { leave: L.id }));
    save(db); res.json({ ...L, warn: c.warn });
  });
  app.post('/api/leave/:id/decide', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {}, L = (db.leaves || []).find(x => x.id === req.params.id);
    if (!L) return res.status(404).json({ error: 'not found' });
    const u = userBy(db, L.u); if (!canDecide(db, me, u)) return res.status(403).json({ error: NOT_LEAD });
    if (L.status !== 'pending') return bad(res, 'This request was already decided');
    const S = W(db), T = typeOf(S, L.lt), ok = b.ok === true;
    if (ok && T && T.allowance) {                                                                    // the balance may have changed since the request
      const byYear = {}; Object.entries(spanOf(db, S, L)).forEach(([d, v]) => { byYear[d.slice(0, 4)] = (byYear[d.slice(0, 4)] || 0) + v; });
      const short = Object.entries(byYear).find(([y, v]) => bal(db, S, T, u, y).left - v < 0);
      if (short) return bad(res, `Not enough left in ${short[0]} to approve it`);
    }
    Object.assign(L, { status: ok ? 'approved' : 'rejected', decided: iso(), dby: me.username, why: str(b.why, 300) });
    notify(db, u.username, 'leave', ok ? `Your time off was approved: ${what(T, L)}` : `Your time off was not approved: ${what(T, L)}${L.why ? ' · ' + L.why : ''}`, { leave: L.id });
    save(db); res.json({ ...L, name: u.name });
  });
  // cancel time off: the person (a request, or approved days still to come), their team lead or an admin (any day); some days or all
  app.post('/api/leave/:id/cancel', need(), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {}, L = (db.leaves || []).find(x => x.id === req.params.id);
    if (!L) return res.status(404).json({ error: 'not found' });
    const u = userBy(db, L.u), mine = L.u === me.username, lead = canDecide(db, me, u);
    if (!mine && !lead) return res.status(403).json({ error: NOT_LEAD });
    if (!['pending', 'approved'].includes(L.status)) return bad(res, 'This time off is no longer active');
    const S = W(db), T = typeOf(S, L.lt), span = Object.keys(spanOf(db, S, L)), today = wf.localDay();
    let dates = Array.isArray(b.dates) ? b.dates.filter(d => typeof d === 'string' && span.includes(d)) : span;
    if (mine && !lead && L.status === 'approved') dates = dates.filter(d => d >= today);
    if (!dates.length) return bad(res, mine && !lead ? 'Days that have passed can only be cancelled by your team lead' : 'Choose the days to cancel');
    if (span.every(d => dates.includes(d))) L.status = 'cancelled'; else { L.off = [...new Set([...(L.off || []), ...dates])].sort(); L.days = total(spanOf(db, S, L)); }
    L.cancels = [...(L.cancels || []), { at: iso(), by: me.username, dates }];
    if (mine) approversOf(db, u).forEach(p => notify(db, p.username, 'leave', `${u.name} cancelled time off: ${what(T, { ...L, days: dates.length })}`, { leave: L.id }));
    else notify(db, L.u, 'leave', `${me.name} cancelled your time off: ${what(T, { ...L, days: dates.length })}`, { leave: L.id });
    save(db); res.json(L);
  });
  // admins add (or take away) days of a balance, for example days carried over from the old system
  app.post('/api/leave/adjust', need('admin'), (req, res) => {
    const db = load(), b = req.body || {}, u = userBy(db, str(b.u, 40)), S = W(db), T = typeOf(S, b.lt), year = Number(b.year), days = Number(b.days);
    if (!u) return bad(res, 'Choose a person');
    if (!T || !T.allowance) return bad(res, 'Choose a type with a yearly allowance');
    if (!Number.isInteger(year) || year < 2000 || year > 2099) return bad(res, 'Choose the year');
    if (!Number.isFinite(days) || !days || Math.abs(days) > 365) return bad(res, 'Enter the days to add, or to take away with a minus');
    const a = { id: 'a' + hex(5), u: u.username, lt: T.id, year, days: Math.round(days * 2) / 2, note: str(b.note, 200), by: req.session.user.username, at: iso() };
    db.leaveAdj = [a, ...(db.leaveAdj || [])].slice(0, 5000); save(db); res.json(a);
  });
  // a member of staff names the colleague who decides in their place while they are away (empty = nobody)
  app.put('/api/leave/deputy', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = userBy(db, req.session.user.username), b = req.body || {}, un = str(b.u, 40);
    if (!un) { delete me.deputy; save(db); return res.json({ ok: 1 }); }
    const p = userBy(db, un); if (!p || p.role === 'agent' || p.active === false || p.username === me.username) return bad(res, 'Choose a member of staff as your deputy');
    const from = wf.DAY.test(typeof b.from === 'string' ? b.from : '') ? b.from : '', to = wf.DAY.test(typeof b.to === 'string' ? b.to : '') ? b.to : '';
    if (from && to && to < from) return bad(res, 'The last day is before the first day');
    me.deputy = { u: p.username, from, to }; save(db); res.json(me.deputy);
  });
  // the balances of a team (staff)
  app.get('/api/leave/team', need('admin', 'qa', 'lead', 'trainer'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), team = pickTeam(db, me, req.query || {}), y = Number(wf.localDay().slice(0, 4));
    if (!team) return res.json({ team: '', year: y, rows: [] });
    res.json({ team: team.id, year: y, rows: members(db, team).map(u => ({ u: u.username, name: u.name, balances: S.leaveTypes.map(T => bal(db, S, T, u, y)) })) });
  });
  // the team calendar of a month: who is off on which day; an agent sees their own team, without the type of other people's leave
  app.get('/api/leave/calendar', need(), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), q = req.query || {}, team = pickTeam(db, me, q), today = wf.localDay();
    const m = typeof q.m === 'string' && /^\d{4}-\d{2}$/.test(q.m) ? q.m : today.slice(0, 7), dates = [];
    for (let x = m + '-01'; x.startsWith(m); x = wf.addDays(x, 1)) dates.push(x);
    if (!team) return res.json({ team: '', m, days: [], people: [] });
    const people = members(db, team), LV = wf.leavesBy(db.leaves), cal = S.calendars.find(c => c.id === S.defCal);
    const rows = people.map(u => ({ u: u.username, name: u.name, days: Object.fromEntries(dates.map(d => { const l = wf.lvOn(LV[u.username], d, true); if (!l) return null;
      const T = typeOf(S, l.lt), counted = T ? wf.leaveSpan(S, T, u, { from: d, to: d, part: l.part, hours: l.hours }, db.rota || {})[d] : 0;
      return counted ? [d, { lt: me.role === 'agent' && u.username !== me.username ? '' : l.lt, part: l.part, pend: l.pend }] : null; }).filter(Boolean)) }));
    const pct = S.rules.teamOffPct, size = people.length;
    res.json({ team: team.id, m, pct, people: rows, days: dates.map(d => { const n = rows.filter(r => r.days[d]).length;
      return { d, off: cal.days[wf.dow(d)] === 'off', hol: (cal.holidays.find(h => h.d === d) || {}).n || '', n, warn: !!pct && n >= 2 && n > size * pct / 100 }; }) });
  });
  // shared with routes-today.js (Team today, the morning brief, the reports, the AI analyst)
  return { W, statusOf, canDecide, approversOf, members, calm, typeOf, bal, teamsFor };
};
