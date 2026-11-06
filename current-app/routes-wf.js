// Workforce, phase 1: work calendars (working days, public holidays), shift templates and repeating patterns
// (Admin › People), and the rota of every team (Workforce › Shifts and rota). The rules live in wf.js.
// Who may do what: admins set up the calendars and shifts; admins and team leads plan the rota of the people they see;
// QA specialists and trainers can look at it; agents see the rota of their own team only.
const wf = require('./wf');

module.exports = ({ app, load, save, need, bad, hex, str, userBy, scopeOf, seesUser, ADMIN_TEAM }) => {
  const W = db => wf.settingsOf(db.settings && db.settings.wf, wf.localDay());
  const { teamsFor, canPlan } = wf.access({ scopeOf, seesUser, userBy, ADMIN_TEAM });
  const NOT_YOURS = 'You can plan the rota of the people in your own teams only';
  const setCell = (db, username, d, v) => {
    db.rota = db.rota || {};
    if (v) (db.rota[d] = db.rota[d] || {})[username] = v;
    else if (db.rota[d]) { delete db.rota[d][username]; if (!Object.keys(db.rota[d]).length) delete db.rota[d]; }
  };

  // ---- set-up (admins): calendars, shifts, patterns, the default shift and calendar, leave types, attendance rules. Everybody reads them through /api/settings.
  app.put('/api/wf/settings', need('admin'), (req, res) => {
    const db = load(), b = req.body || {}, cur = W(db);
    try {
      const shifts = b.shifts !== undefined ? wf.cleanShifts(b.shifts, () => 's-' + hex(3)) : cur.shifts;
      const defShift = shifts.some(s => s.id === b.defShift) ? b.defShift : shifts.some(s => s.id === cur.defShift) ? cur.defShift : shifts[0].id;
      const calendars = b.calendars !== undefined ? wf.cleanCalendars(b.calendars, () => 'c-' + hex(3)) : cur.calendars;
      const patterns = wf.cleanPatterns(b.patterns !== undefined ? b.patterns : cur.patterns, shifts, defShift, () => 'p-' + hex(3));
      const defCal = calendars.some(c => c.id === b.defCal) ? b.defCal : calendars.some(c => c.id === cur.defCal) ? cur.defCal : calendars[0].id;
      const leaveTypes = b.leaveTypes !== undefined ? wf.cleanLeaveTypes(b.leaveTypes, () => 'lt-' + hex(3)) : cur.leaveTypes;
      const bf = b.rules && typeof b.rules === 'object' ? b.rules.bradford : undefined;
      if (bf !== undefined && String(wf.bfLevels(bf)) !== String((Array.isArray(bf) ? bf : []).map(Number))) throw new Error('The three Bradford levels must go up: watch, then talk to them, then serious');
      const rules = b.rules !== undefined ? wf.cleanRules({ ...cur.rules, ...(b.rules && typeof b.rules === 'object' ? b.rules : {}) }) : cur.rules;
      db.settings.wf = { calendars, shifts, patterns, defShift, defCal, leaveTypes, rules }; save(db); res.json(db.settings.wf);
    } catch (e) { bad(res, e.message); }
  });
  // the public holidays of a year, ready to add to a calendar (worked out for Bulgaria; other countries are added by hand)
  app.post('/api/wf/holidays', need('admin'), (req, res) => {
    const b = req.body || {}, y = Number(b.year);
    if (!Number.isInteger(y) || y < 2000 || y > 2099) return bad(res, 'Choose a year between 2000 and 2099');
    if (str(b.country, 2).toUpperCase() !== 'BG') return bad(res, 'Automatic public holidays are ready for Bulgaria. For other countries add them by hand or paste a list.');
    res.json(wf.bgHolidays(y));
  });

  // ---- the rota of one team for a week (or up to 6 weeks), worked out day by day for every member
  app.get('/api/wf/rota', need(), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), ts = teamsFor(db, me), q = req.query || {};
    const team = ts.find(t => t.id === q.team) || ts.find(t => !t.system) || ts[0];
    if (!team) return res.json({ team: '', from: '', days: [], people: [], edit: false });
    const from = wf.monday(wf.DAY.test(typeof q.from === 'string' ? q.from : '') ? q.from : wf.localDay()), n = Math.min(42, Math.max(1, parseInt(q.days) || 7));
    const dates = Array.from({ length: n }, (_, i) => wf.addDays(from, i)), rota = db.rota || {}, LV = wf.leavesBy(db.leaves);
    const people = db.users.filter(u => u.team === team.id && u.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map(u => {
      // a day of time off shows on the rota (a request still waiting too); agents see that a colleague is away, not why
      const hide = me.role === 'agent' && u.username !== me.username;
      const cells = dates.map(d => { const c = wf.planOf(S, u, d, rota), l = wf.lvOn(LV[u.username], d, true); return l ? { ...c, lv: { lt: hide ? '' : l.lt, part: l.part, pend: l.pend } } : c; });
      const away = c => c.lv && !c.lv.pend ? (c.lv.part === 'full' ? 0 : c.lv.part === 'hours' ? null : 0.5) : 1;
      return { u: u.username, name: u.name, title: u.title || '', hours: u.hours || 40, empType: u.empType || 'full', shift: u.shift || '', pattern: u.pattern || '', cells,
        planned: Math.round(cells.reduce((s, c) => { const k = away(c); return s + (k === null ? Math.max(0, wf.cellHours(S, c) - (c.lv.hours || 0)) : wf.cellHours(S, c) * k); }, 0) * 10) / 10, edit: canPlan(db, me, u.username) };
    });
    const cal = S.calendars.find(c => c.id === S.defCal);
    const days = dates.map((d, i) => ({ d, hol: [...new Set(people.map(p => p.cells[i].hol).filter(Boolean).concat(people.length ? [] : cal.holidays.filter(h => h.d === d).map(h => h.n)))],
      on: people.filter(p => !['off', 'hol', 'none'].includes(p.cells[i].v) && !(p.cells[i].lv && !p.cells[i].lv.pend && p.cells[i].lv.part === 'full')).length }));
    res.json({ team: team.id, from, days, people, edit: people.some(p => p.edit) });
  });
  // change days on the rota: v = a shift, "off", or "" to go back to the person's usual plan
  app.put('/api/wf/rota', need('admin', 'lead'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), b = req.body || {}, cells = Array.isArray(b.cells) ? b.cells.slice(0, 1000) : [];
    if (!cells.length) return bad(res, 'Nothing to change');
    const clean = cells.map(c => ({ u: str(c && c.u, 40), d: str(c && c.d, 10), v: c && typeof c.v === 'string' ? c.v : '' }));
    for (const c of clean) {
      if (!userBy(db, c.u) || !wf.DAY.test(c.d)) return bad(res, 'Choose a person and a day');
      if (!canPlan(db, me, c.u)) return res.status(403).json({ error: NOT_YOURS });
      if (c.v && c.v !== 'off' && !S.shifts.some(s => s.id === c.v)) return bad(res, 'Choose a shift from the list');
    }
    clean.forEach(c => setCell(db, c.u, c.d, c.v)); save(db); res.json({ ok: 1, n: clean.length });
  });
  // copy last week into this week: every day becomes what the same weekday was last week (public holidays stay holidays)
  app.post('/api/wf/rota/copy', need('admin', 'lead'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), b = req.body || {}, team = db.teams.find(t => t.id === b.team);
    if (!team) return bad(res, 'Choose a team');
    if (!wf.DAY.test(typeof b.from === 'string' ? b.from : '')) return bad(res, 'Choose the week');
    const from = wf.monday(b.from), people = db.users.filter(u => u.team === team.id && u.active !== false);
    if (!people.length) return bad(res, 'This team has no members yet');
    if (!people.every(u => canPlan(db, me, u.username))) return res.status(403).json({ error: NOT_YOURS });
    db.rota = db.rota || {}; let n = 0;
    people.forEach(u => { for (let i = 0; i < 7; i++) {
      const d = wf.addDays(from, i), last = wf.planOf(S, u, wf.addDays(d, -7), db.rota), usual = wf.planOf(S, u, d, {});
      const want = ['hol', 'none'].includes(last.v) || ['hol', 'none'].includes(usual.v) ? '' : last.v;
      setCell(db, u.username, d, want === usual.v ? '' : want); n++;
    } });
    save(db); res.json({ ok: 1, n });
  });
  // the usual shift and the repeating pattern of several people at once
  app.post('/api/wf/assign', need('admin', 'lead'), (req, res) => {
    const db = load(), me = req.session.user, S = W(db), b = req.body || {};
    const people = [...new Set(Array.isArray(b.users) ? b.users.slice(0, 300).map(x => str(x, 40)) : [])].map(x => userBy(db, x)).filter(Boolean);
    if (!people.length) return bad(res, 'Choose at least one person');
    if (!people.every(u => canPlan(db, me, u.username))) return res.status(403).json({ error: NOT_YOURS });
    if (b.shift !== undefined && b.shift !== '' && !S.shifts.some(s => s.id === b.shift)) return bad(res, 'Choose a shift from the list');
    if (b.pattern !== undefined && b.pattern !== '' && !S.patterns.some(p => p.id === b.pattern)) return bad(res, 'Choose a pattern from the list');
    const start = wf.DAY.test(typeof b.patStart === 'string' ? b.patStart : '') ? b.patStart : wf.localDay();
    people.forEach(u => {
      if (b.shift !== undefined) u.shift = b.shift || '';
      if (b.pattern !== undefined) { u.pattern = b.pattern || ''; u.patStart = u.pattern ? start : ''; }
    });
    save(db); res.json({ ok: 1, n: people.length });
  });
};
