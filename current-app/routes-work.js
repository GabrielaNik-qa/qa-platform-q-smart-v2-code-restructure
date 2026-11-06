// Tasks (Kanban + missions + repeating templates + sequences), coaching / one-to-one sessions, calibration sessions.
// Every task keeps a short history (log: created, started, sent for review, approved, sent back, done, reassigned, deadline moved).
// A task given with "needs review" goes to In review when its person marks it done; a lead / QA / admin who sees that person (or the
// one who gave it) approves it (Done) or sends it back with a comment. Repeating templates (daily, weekly, monthly, quarterly, until
// an end date) skip the days the person does not work (rota, calendar, a full day of approved time off). A sequence is a named list of
// steps, each a number of days after the start; given to people or teams with a start date, it creates every task with its dates, and
// it can start again every month or quarter.
const wf = require('./wf');
module.exports = ({ app, load, save, need, bad, hex, iso, str, list, notify, userBy, seesUser, setOut }) => {
  const EDIT = ['admin', 'qa', 'lead', 'trainer'];
  // staff only reach the records of people in their own workspace (admins reach everything); agents only their own, checked below
  const taskSeen = (db, u, t) => seesUser(db, u, t.assignee), sessSeen = (db, u, s) => s.agents.some(a => seesUser(db, u, a)), flagSeen = (db, u, f) => seesUser(db, u, f.agent, f.tid);
  const STATUS = ['todo', 'doing', 'review', 'done'], PRIO = ['low', 'med', 'high'];
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const activeUsers = db => db.users.filter(u => u.active !== false);
  const logT = (t, by, a, note) => { (t.log = t.log || []).push({ at: iso(), by, a, ...(note ? { note: String(note).slice(0, 300) } : {}) }); if (t.log.length > 60) t.log.splice(0, t.log.length - 60); };
  // a person works on a day: a shift in the rota or their calendar, and no full day of approved time off
  const worksOn = (db, S, LV, u, d) => S.shifts.some(s => s.id === wf.planOf(S, u, d, db.rota || {}).v) && !((l => l && (l.part || 'full') === 'full' && !l.pend)(wf.lvOn(LV[u.username], d)));
  const addMonths = (s, n) => { const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1)), last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10); };
  const checklist = v => (Array.isArray(v) ? v : []).slice(0, 30).map(c => ({ t: str(typeof c === 'string' ? c : c && c.t, 150), min: Math.min(600, Math.max(0, parseInt(c && c.min) || 0)), done: !!(c && c.done), ...(c && c.d ? { d: str(c.d, 300) } : {}) })).filter(c => c.t);
  const colour = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : '', category = v => str(v, 40).trim();

  // ---------------------------------------------------------------- recurring missions: today's copy is created the first time anybody asks
  // the first day of the current period of a repeating template ('' = its day has not come yet in this period)
  function periodDay(tpl, td) {
    if (tpl.freq === 'daily') return td;
    if (tpl.freq === 'weekly') { const d = wf.addDays(wf.monday(td), ((tpl.weekday == null ? 1 : tpl.weekday) + 6) % 7); return d <= td ? d : ''; }
    if (tpl.freq !== 'monthly' && tpl.freq !== 'quarterly') return '';
    const m = +td.slice(5, 7), qm = tpl.freq === 'quarterly' ? m - ((m - 1) % 3) : m, d = td.slice(0, 5) + String(qm).padStart(2, '0') + '-' + String(tpl.monthday || 1).padStart(2, '0');
    return d <= td ? d : '';
  }
  const recipients = (db, users, teams) => { const who = new Set((users || []).filter(x => { const u = userBy(db, x); return u && u.active !== false; })); activeUsers(db).forEach(u => { if (u.role === 'agent' && (teams || []).includes(u.team)) who.add(u.username); }); return [...who]; };
  // one round of a sequence: every step for every person, with its own start and deadline
  function giveCycle(db, run, seq, c) {
    const who = recipients(db, run.users, run.teams), n = seq.steps.length;
    who.forEach(un => {
      seq.steps.forEach((st, i) => {
        const start = wf.addDays(c, st.day), t = { id: 'k' + hex(5), group: run.id + ':' + c, title: st.title, desc: st.desc || '', start, due: wf.addDays(start, Math.max(1, st.days) - 1), type: st.type === 'mission' ? 'mission' : 'task', priority: st.priority || 'med', points: st.points || 0, rev: !!st.rev, status: 'todo', assignee: un, labels: [], checklist: checklist(st.checklist), created: iso(), by: run.by, run: run.id, seqName: seq.name, step: i + 1, steps: n, completed: null };
        logT(t, run.by, 'created'); db.tasks.push(t);
      });
      notify(db, un, 'task', `Sequence given to you: ${seq.name} (${n} tasks, from ${c})`, {});
    });
    run.cycles = [...(run.cycles || []), c].slice(-50);
    return who.length;
  }
  // repeating templates and repeating sequences: what is due is created the first time anybody asks
  function recurring(db) {
    let changed = false; const td = today(), S = wf.settingsOf(db.settings && db.settings.wf, wf.localDay()), LV = wf.leavesBy(db.leaves);
    db.taskTpl.filter(t => t.active !== false && t.freq && t.freq !== 'none' && !(t.until && td > t.until)).forEach(tpl => {
      const pd = periodDay(tpl, td); if (!pd || pd < String(tpl.created || '').slice(0, 10)) return;   // nothing for periods before the template existed
      recipients(db, tpl.users, tpl.teams).forEach(un => {
        const key = tpl.id + ':' + pd + ':' + un, u = userBy(db, un);
        if (db.tasks.some(t => t.key === key) || !worksOn(db, S, LV, u, td)) return;   // on a day off it waits for the next working day of the period
        const t = { id: 'k' + hex(5), title: tpl.title, desc: tpl.desc || '', type: tpl.kind === 'task' || tpl.kind === 'checklist' ? 'task' : 'mission', priority: tpl.priority || 'med', points: tpl.points || 0, rev: !!tpl.rev, due: td, status: 'todo', assignee: un, labels: tpl.labels || [], color: colour(tpl.color), category: category(tpl.category), checklist: checklist(tpl.checklist), created: iso(), by: tpl.by, key, tpl: tpl.id, freq: tpl.freq, completed: null };
        logT(t, tpl.by, 'created'); db.tasks.push(t); changed = true;
      });
    });
    db.taskRuns.filter(r => r.active !== false && r.repeat !== 'none').forEach(r => {
      const seq = db.taskSeq.find(s => s.id === r.seq); if (!seq) return;
      let k = 0, c = r.start, last = '';
      while (c <= td && k < 400) { last = c; k++; c = addMonths(r.start, k * (r.repeat === 'quarterly' ? 3 : 1)); }
      if (last && !(r.until && last > r.until) && !(r.cycles || []).includes(last)) { giveCycle(db, r, seq, last); changed = true; }   // only the latest round, never a pile of missed ones
    });
    if (changed) save(db);
  }
  app.get('/api/tasks', need(), (req, res) => {
    const db = load(), u = req.session.user; recurring(db);
    res.json(db.tasks.filter(t => u.role !== 'agent' ? taskSeen(db, u, t) : t.assignee === u.username));
  });
  app.post('/api/tasks', need(...EDIT), (req, res) => {
    const db = load(), b = req.body || {}, me = req.session.user;
    const title = str(b.title, 150); if (!title) return bad(res, 'Give the task a title');
    if (b.due && !DAY.test(b.due)) return bad(res, 'Choose a valid deadline');
    if (b.start && b.due && b.start > b.due) return bad(res, 'The start date is after the deadline');
    const who = new Set((Array.isArray(b.assignees) ? b.assignees : []).filter(x => { const u = userBy(db, x); return u && u.active !== false && seesUser(db, me, u.username); }));
    activeUsers(db).forEach(u => { if (u.role === 'agent' && (Array.isArray(b.teams) ? b.teams : []).includes(u.team) && seesUser(db, me, u.username)) who.add(u.username); });
    if (!who.size) return bad(res, 'Choose at least one agent or team to give the task to');
    const group = 'g' + hex(4), out = [];
    who.forEach(un => {
      const t = { id: 'k' + hex(5), group, rev: !!b.rev, title, desc: str(b.desc, 1500), start: DAY.test(b.start || '') ? b.start : '', tpl: str(b.tpl, 20), type: b.type === 'mission' ? 'mission' : 'task', priority: PRIO.includes(b.priority) ? b.priority : 'med', points: Math.min(1000, Math.max(0, parseInt(b.points) || 0)), due: b.due || '', status: 'todo', assignee: un, labels: list(b.labels, 8), color: colour(b.color), category: category(b.category), checklist: checklist(b.checklist), created: iso(), by: me.username, completed: null };
      logT(t, me.username, 'created'); db.tasks.push(t); out.push(t);
      notify(db, un, 'task', `New ${t.type}: ${title}${t.due ? ' (due ' + t.due + ')' : ''}`, { task: t.id });
    });
    save(db); res.json(out);
  });
  app.put('/api/tasks/:id', need(), (req, res) => {
    const db = load(), u = req.session.user, t = db.tasks.find(x => x.id === req.params.id && (x.assignee === u.username || (u.role !== 'agent' && taskSeen(db, u, x)))), b = req.body || {};
    if (!t) return res.status(404).json({ error: 'not found' });
    const editor = EDIT.includes(u.role), mine = t.assignee === u.username;
    if (!editor && !mine) return res.status(403).json({ error: 'not allowed' });
    if (editor) {
      if (b.title !== undefined) { const x = str(b.title, 150); if (!x) return bad(res, 'Give the task a title'); t.title = x; }
      if (b.desc !== undefined) t.desc = str(b.desc, 1500);
      if (b.type !== undefined) t.type = b.type === 'mission' ? 'mission' : 'task';
      if (b.priority !== undefined && PRIO.includes(b.priority)) t.priority = b.priority;
      if (b.points !== undefined) t.points = Math.min(1000, Math.max(0, parseInt(b.points) || 0));
      if (b.due !== undefined) { if (b.due && !DAY.test(b.due)) return bad(res, 'Choose a valid deadline'); if ((b.due || '') !== (t.due || '')) logT(t, u.username, 'due', (t.due || '—') + ' → ' + (b.due || '—')); t.due = b.due || ''; }
      if (b.rev !== undefined) t.rev = !!b.rev;
      if (b.start !== undefined) { if (b.start && !DAY.test(b.start)) return bad(res, 'Choose a valid start date'); t.start = b.start || ''; }
      if (b.labels !== undefined) t.labels = list(b.labels, 8);
      if (b.color !== undefined) t.color = colour(b.color);
      if (b.category !== undefined) t.category = category(b.category);
      if (b.checklist !== undefined) t.checklist = checklist(b.checklist);
      if (b.assignee !== undefined && b.assignee !== t.assignee) { const a = userBy(db, b.assignee); if (!a || !seesUser(db, u, a.username)) return bad(res, 'Choose a valid person'); logT(t, u.username, 'assigned', a.name); t.assignee = a.username; notify(db, a.username, 'task', `A ${t.type} was assigned to you: ${t.title}`, { task: t.id }); }
    } else if (b.checklist !== undefined && Array.isArray(b.checklist) && b.checklist.length === t.checklist.length) t.checklist.forEach((c, i) => { c.done = !!(b.checklist[i] && b.checklist[i].done); });
    if (b.pinned !== undefined) t.pinned = !!b.pinned;                                   // the agent can pin and archive their own cards too
    if (b.archived !== undefined && !!b.archived !== !!t.archived) { t.archived = b.archived ? iso() : null; logT(t, u.username, b.archived ? 'archived' : 'restored'); }
    if (b.status !== undefined) {
      if (!STATUS.includes(b.status)) return bad(res, 'Unknown status');
      const reviewer = editor && !mine; let to = b.status;
      if (to === 'done' && t.rev && !reviewer) to = 'review';               // needs review: the person's "done" waits for a check
      if (to !== t.status) {
        const was = t.status; t.status = to;
        if (to === 'doing' && !t.startedAt) t.startedAt = iso();
        t.completed = to === 'done' ? iso() : null;
        if (to === 'review') {
          t.sent = iso(); logT(t, u.username, 'review');
          if (t.by && t.by !== u.username) notify(db, t.by, 'task', `${u.name} sent for your review: ${t.title}`, { task: t.id });
        } else if (was === 'review' && reviewer) {
          logT(t, u.username, to === 'done' ? 'approved' : 'returned', to === 'done' ? '' : str(b.note, 300));
          notify(db, t.assignee, 'task', to === 'done' ? `Approved: ${t.title}` : `Sent back to you: ${t.title}${b.note ? ' — ' + str(b.note, 300) : ''}`, { task: t.id });
        } else logT(t, u.username, to);
        if (to === 'done' && was !== 'done' && !reviewer && t.by && t.by !== u.username) notify(db, t.by, 'taskdone', `${u.name} completed: ${t.title}`, { task: t.id });
      }
    }
    save(db); res.json(t);
  });
  app.delete('/api/tasks/:id', need(...EDIT), (req, res) => {
    const db = load(); if (!db.tasks.some(t => t.id === req.params.id && taskSeen(db, req.session.user, t))) return res.status(404).json({ error: 'not found' });
    db.tasks = db.tasks.filter(t => t.id !== req.params.id); save(db); res.json({ ok: 1 });
  });
  app.get('/api/task-templates', need(...EDIT), (req, res) => res.json(load().taskTpl));
  // a template is a saved task: "none" = used by hand (New task from template), daily / weekly / monthly = a card is created by itself
  const FREQ = ['none', 'daily', 'weekly', 'monthly', 'quarterly'], KINDS_T = ['checklist', 'target', 'task'];
  const tplBody = b => {
    const title = str(b.title, 150); if (!title) throw new Error('Give the template a title');
    const t = { title, desc: str(b.desc, 1500), kind: KINDS_T.includes(b.kind) ? b.kind : 'checklist', points: Math.min(1000, Math.max(0, parseInt(b.points) || 0)), priority: PRIO.includes(b.priority) ? b.priority : 'med', freq: FREQ.includes(b.freq) ? b.freq : 'none', weekday: Math.min(6, Math.max(0, parseInt(b.weekday) || 1)), monthday: Math.min(28, Math.max(1, parseInt(b.monthday) || 1)), color: b.color === '' ? '' : colour(b.color) || '#7c3aed', category: category(b.category), users: list(b.users, 50, 40), teams: list(b.teams, 20, 40), checklist: checklist(b.checklist).map(({ t, min, d }) => ({ t, min, ...(d ? { d } : {}) })), labels: list(b.labels, 8), until: DAY.test(b.until || '') ? b.until : '', rev: !!b.rev };
    if (t.freq !== 'none' && !t.users.length && !t.teams.length) throw new Error('Choose who receives the cards of a repeating template');
    return t;
  };
  app.post('/api/task-templates', need(...EDIT), (req, res) => {
    const db = load(); try { const tpl = { id: 'p' + hex(4), ...tplBody(req.body || {}), active: true, by: req.session.user.username, created: iso() }; db.taskTpl.push(tpl); save(db); res.json(tpl); } catch (e) { bad(res, e.message); }
  });
  app.put('/api/task-templates/:id', need(...EDIT), (req, res) => {
    const db = load(), tpl = db.taskTpl.find(x => x.id === req.params.id); if (!tpl) return res.status(404).json({ error: 'not found' });
    try { Object.assign(tpl, tplBody(req.body || {}), { updated: iso() }); save(db); res.json(tpl); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/task-templates/:id', need(...EDIT), (req, res) => {
    const db = load(); db.taskTpl = db.taskTpl.filter(t => t.id !== req.params.id); save(db); res.json({ ok: 1 });
  });
  // ---------------------------------------------------------------- sequences: steps given together, each a number of days after the start
  const seqBody = b => {
    const name = str(b.name, 80); if (!name) throw new Error('Give the sequence a name');
    const steps = (Array.isArray(b.steps) ? b.steps : []).slice(0, 30).map(s => ({ title: str(s && s.title, 150), desc: str(s && s.desc, 600), day: Math.min(365, Math.max(0, parseInt(s && s.day) || 0)), days: Math.min(90, Math.max(1, parseInt(s && s.days) || 1)), priority: PRIO.includes(s && s.priority) ? s.priority : 'med', type: s && s.type === 'mission' ? 'mission' : 'task', points: Math.min(1000, Math.max(0, parseInt(s && s.points) || 0)), rev: !!(s && s.rev), checklist: checklist(s && s.checklist).map(({ t, min }) => ({ t, min })) })).filter(s => s.title);
    if (!steps.length) throw new Error('Add at least one step');
    return { name, desc: str(b.desc, 600), steps: steps.sort((x, y) => x.day - y.day) };
  };
  app.get('/api/task-seqs', need(...EDIT), (req, res) => { const db = load(); res.json({ seqs: db.taskSeq, runs: db.taskRuns }); });
  app.post('/api/task-seqs', need(...EDIT), (req, res) => {
    const db = load(); try { const s = { id: 'q' + hex(4), ...seqBody(req.body || {}), by: req.session.user.username, created: iso() }; db.taskSeq.push(s); save(db); res.json(s); } catch (e) { bad(res, e.message); }
  });
  app.put('/api/task-seqs/:id', need(...EDIT), (req, res) => {
    const db = load(), s = db.taskSeq.find(x => x.id === req.params.id); if (!s) return res.status(404).json({ error: 'not found' });
    try { Object.assign(s, seqBody(req.body || {}), { updated: iso() }); save(db); res.json(s); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/task-seqs/:id', need(...EDIT), (req, res) => {
    const db = load(); db.taskSeq = db.taskSeq.filter(s => s.id !== req.params.id); db.taskRuns.forEach(r => { if (r.seq === req.params.id) r.active = false; }); save(db); res.json({ ok: 1 });
  });
  // give a sequence: the first round now (its tasks start on their own days), then again every month or quarter if chosen
  app.post('/api/task-seqs/:id/give', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {}, seq = db.taskSeq.find(x => x.id === req.params.id); if (!seq) return res.status(404).json({ error: 'not found' });
    if (!DAY.test(b.start || '')) return bad(res, 'Choose the start date');
    const users = list(b.users, 60, 40).filter(x => userBy(db, x) && seesUser(db, me, x)), teams = list(b.teams, 20, 40);
    const run = { id: 'r' + hex(4), seq: seq.id, start: b.start, repeat: ['monthly', 'quarterly'].includes(b.repeat) ? b.repeat : 'none', until: DAY.test(b.until || '') ? b.until : '', users, teams, by: me.username, created: iso(), cycles: [], active: true };
    if (!recipients(db, users, teams).filter(x => seesUser(db, me, x)).length) return bad(res, 'Choose at least one agent or team to give it to');
    const n = giveCycle(db, run, seq, run.start); db.taskRuns.push(run); save(db); res.json({ run, people: n, tasks: n * seq.steps.length });
  });
  app.put('/api/task-runs/:id', need(...EDIT), (req, res) => {
    const db = load(), r = db.taskRuns.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'not found' });
    if ((req.body || {}).active === false) r.active = false; save(db); res.json(r);
  });

  // ---------------------------------------------------------------- coaching / training / one-to-one sessions
  const KINDS = ['o2o', 'coaching', 'group', 'training'];
  const writers = kind => kind === 'o2o' ? ['admin', 'lead', 'qa'] : ['admin', 'trainer', 'qa'];
  // ---- one-to-one forms: the answers of a template's sections, kept as plain values (text, ticks, Yes/No/N.A., stars, numbers, a table)
  const O2T = ['text', 'check', 'yesno', 'objectives', 'rating', 'metrics', 'table', 'agree'];
  const cleanAns = (v, d = 0) => d > 4 ? null : typeof v === 'string' ? str(v, 4000) : typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'boolean' ? v
    : Array.isArray(v) ? v.slice(0, 40).map(x => cleanAns(x, d + 1)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).slice(0, 60).map(([k, x]) => [str(k, 40), cleanAns(x, d + 1)])) : null;
  const o2oExtra = b => b.kind !== 'o2o' ? {} : { tpl: str(b.tpl, 20), per: ['week', 'month', 'year', 'custom'].includes(b.per) ? b.per : 'month', pFrom: DAY.test(b.pFrom || '') ? b.pFrom : '', pTo: DAY.test(b.pTo || '') ? b.pTo : '',
    ans: JSON.stringify(b.ans || {}).length < 60000 ? cleanAns(b.ans || {}) || {} : {}, secs: Array.isArray(b.secs) && JSON.stringify(b.secs).length < 30000 ? cleanAns(b.secs) : undefined, state: ['draft', 'sent', 'signed'].includes(b.state) ? b.state : (b.status === 'planned' ? 'draft' : 'signed') };
  const sessBody = (b, db, me) => {
    const kind = KINDS.includes(b.kind) ? b.kind : null; if (!kind) throw new Error('Choose the type of session');
    if (!DAY.test(b.date || '')) throw new Error('Choose the date');
    const agents = list(b.agents, 60, 40).filter(x => userBy(db, x) && seesUser(db, me, x)); if (!agents.length) throw new Error('Choose at least one agent');
    const actions = (Array.isArray(b.actions) ? b.actions : []).slice(0, 20).map(a => ({ t: str(a.t, 200), owner: userBy(db, a.owner) ? a.owner : '', due: DAY.test(a.due || '') ? a.due : '', done: !!a.done, taskId: str(a.taskId, 20) })).filter(a => a.t);
    return { kind, date: b.date, title: str(b.title, 150) || ({ o2o: 'One-to-one', coaching: 'Coaching session', group: 'Group coaching', training: 'Training' })[kind], agents, topics: list(b.topics, 12), focus: list(b.focus, 12, 80), notes: str(b.notes, 6000), goals: str(b.goals, 2000), actions, follow: DAY.test(b.follow || '') ? b.follow : '', status: b.status === 'planned' ? 'planned' : 'done', ...o2oExtra(b) };
  };
  function makeTasks(db, s, me) {
    s.actions.forEach(a => {
      if (a.taskId || !a.owner || !a.t) return;
      const t = { id: 'k' + hex(5), group: 'g' + hex(4), title: a.t, desc: 'From: ' + s.title, type: 'task', priority: 'med', points: 0, due: a.due, status: a.done ? 'done' : 'todo', assignee: a.owner, labels: ['coaching'], checklist: [], created: iso(), by: me.username, completed: a.done ? iso() : null };
      db.tasks.push(t); a.taskId = t.id; notify(db, a.owner, 'task', `New task from your ${s.kind === 'o2o' ? 'one-to-one' : 'coaching'}: ${a.t}`, { task: t.id });
    });
  }
  // a one-to-one that is sent or completed carries the team lead's signature; "in person" adds the agent's on the lead's screen;
  // "sent" tells the agent to read and sign it from their own account
  function o2oSign(db, s, me, b) {
    if (s.kind !== 'o2o' || s.state === 'draft') return;
    if (!s.tl) s.tl = { at: iso(), by: me.username, name: me.name };
    if (s.state === 'signed' && b.inPerson) s.agents.forEach(a => { s.signed = { ...(s.signed || {}), [a]: { at: iso(), inPerson: true } }; });
    if (s.state === 'sent' && !s.sentAt) { s.sentAt = iso(); s.agents.forEach(a => notify(db, a, 'task', `Your one-to-one with ${me.name} is ready: read it and sign`, {})); }
  }
  app.get('/api/sessions', need(), (req, res) => {
    const db = load(), u = req.session.user;
    res.json(db.sessions.filter(s => u.role !== 'agent' ? sessSeen(db, u, s) : s.agents.includes(u.username)));
  });
  app.post('/api/sessions', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user;
    try {
      const b = sessBody(req.body || {}, db, me); if (!writers(b.kind).includes(me.role)) return res.status(403).json({ error: 'Your role cannot document this type of session' });
      const s = { id: 's' + hex(5), ...b, by: me.username, byName: me.name, created: iso(), updated: iso() };
      o2oSign(db, s, me, req.body || {});
      if ((req.body || {}).makeTasks) makeTasks(db, s, me);
      db.sessions.unshift(s); save(db); res.json(s);
    } catch (e) { bad(res, e.message); }
  });
  // the agent signs a one-to-one / coaching session: "I have read it and agree" (optional comment); the person who wrote it is told
  app.post('/api/sessions/:id/sign', need(), (req, res) => {
    const db = load(), s = db.sessions.find(x => x.id === req.params.id), me = req.session.user;
    if (!s) return res.status(404).json({ error: 'not found' });
    if (!s.agents.includes(me.username)) return res.status(403).json({ error: 'Only the agents of this session can sign it' });
    s.signed = { ...(s.signed || {}), [me.username]: { at: iso(), cm: str((req.body || {}).cm, 500) } };
    if (s.kind === 'o2o' && s.agents.every(a => s.signed[a])) s.state = 'signed';
    if (s.by && s.by !== me.username) notify(db, s.by, 'taskdone', `${me.name} signed the ${s.kind === 'o2o' ? 'one-to-one' : 'session'}: ${s.title}`, {});
    save(db); res.json(s);
  });
  app.put('/api/sessions/:id', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user, s = db.sessions.find(x => x.id === req.params.id && sessSeen(db, me, x));
    if (!s) return res.status(404).json({ error: 'not found' });
    try {
      const b = sessBody({ ...s, ...(req.body || {}) }, db, me); if (!writers(b.kind).includes(me.role) || !writers(s.kind).includes(me.role)) return res.status(403).json({ error: 'not allowed' });
      Object.assign(s, b, { updated: iso() }); o2oSign(db, s, me, req.body || {}); if ((req.body || {}).makeTasks) makeTasks(db, s, me); save(db); res.json(s);
    } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/sessions/:id', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user, s = db.sessions.find(x => x.id === req.params.id && sessSeen(db, me, x));
    if (!s) return res.status(404).json({ error: 'not found' });
    if (!writers(s.kind).includes(me.role)) return res.status(403).json({ error: 'not allowed' });
    db.sessions = db.sessions.filter(x => x !== s); save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- one-to-one form templates (per team) and the monthly target
  const O2W = ['admin', 'lead', 'qa'];
  const tplO2o = b => {
    const name = str(b.name, 80); if (!name) throw new Error('Give the template a name');
    const sections = (Array.isArray(b.sections) ? b.sections : []).slice(0, 30).map(x => ({ id: str(x && x.id, 20) || 'x' + hex(3), t: O2T.includes(x && x.t) ? x.t : 'text', title: str(x && x.title, 80) || 'Section', items: list(x && x.items, 30, 160), cols: list(x && x.cols, 8, 40), units: list(x && x.units, 30, 20) })).filter(x => x.title);
    if (!sections.length) throw new Error('Add at least one section');
    return { name, teams: list(b.teams, 30, 40), sections };
  };
  app.get('/api/o2o-templates', need(...EDIT), (req, res) => res.json(load().o2oTpl));
  app.post('/api/o2o-templates', need(...O2W), (req, res) => { const db = load(); try { const t = { id: 'f' + hex(4), ...tplO2o(req.body || {}), by: req.session.user.username, created: iso() }; db.o2oTpl.push(t); save(db); res.json(t); } catch (e) { bad(res, e.message); } });
  app.put('/api/o2o-templates/:id', need(...O2W), (req, res) => { const db = load(), t = db.o2oTpl.find(x => x.id === req.params.id); if (!t) return res.status(404).json({ error: 'not found' }); try { Object.assign(t, tplO2o(req.body || {}), { updated: iso() }); save(db); res.json(t); } catch (e) { bad(res, e.message); } });
  app.delete('/api/o2o-templates/:id', need(...O2W), (req, res) => { const db = load(); db.o2oTpl = db.o2oTpl.filter(t => t.id !== req.params.id); save(db); res.json({ ok: 1 }); });
  // how many one-to-ones each person should have per month: one number for everybody, and a different one for chosen teams
  app.put('/api/o2o-target', need('admin'), (req, res) => {
    const db = load(), b = req.body || {}, n = v => Math.min(10, Math.max(0, parseInt(v) || 0)), teams = {};
    Object.entries(b.teams && typeof b.teams === 'object' ? b.teams : {}).slice(0, 40).forEach(([k, v]) => { if (db.teams.some(t => t.id === k) && v !== '' && v != null) teams[k] = n(v); });
    db.settings.o2o = { target: Math.max(1, n(b.target) || 1), teams }; save(db); res.json(setOut(db, req.session.user));
  });

  // ---------------------------------------------------------------- quick flags: a red / green flag on a call, kept apart from QA reviews (scores never change)
  const qfBody = (b, db) => {
    const a = userBy(db, b.agent); if (!a || a.role !== 'agent') throw new Error('Choose the agent');
    const lead = str(b.lead, 60); if (!lead) throw new Error('Enter the lead ID');
    if (!DAY.test(b.date || '')) throw new Error('Choose the date');
    const link = v => /^https?:\/\//i.test(String(v || '').trim()) ? str(v, 500) : '';
    return { type: b.type === 'green' ? 'green' : 'red', ch: ['call', 'chat', 'email', 'other'].includes(b.ch) ? b.ch : 'call', agent: a.username, tid: a.team, lead, date: b.date, cp: str(b.cp, 80), lk: link(b.lk), rl: link(b.rl), cm: str(b.cm, 1000) };
  };
  app.get('/api/qflags', need(), (req, res) => { const db = load(), u = req.session.user; res.json(db.qflags.filter(f => u.role !== 'agent' ? flagSeen(db, u, f) : f.agent === u.username)); });
  app.post('/api/qflags', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user;
    try {
      const f = { id: 'f' + hex(5), ...qfBody(req.body || {}, db), by: me.username, byName: me.name, at: iso() }; if (!flagSeen(db, me, f)) throw new Error('Choose the agent');
      db.qflags.unshift(f); notify(db, f.agent, 'flag', `${me.name} gave you a ${f.type} flag for Lead #${f.lead}${f.cm ? ': ' + f.cm.slice(0, 80) : ''}`, { flag: f.id, lead: f.lead }); save(db); res.json(f);
    } catch (e) { bad(res, e.message); }
  });
  app.put('/api/qflags/:id', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user, f = db.qflags.find(x => x.id === req.params.id && flagSeen(db, me, x)); if (!f) return res.status(404).json({ error: 'not found' });
    try { const nf = qfBody({ ...f, ...(req.body || {}) }, db); if (!flagSeen(db, me, nf)) throw new Error('Choose the agent'); Object.assign(f, nf, { updated: iso() }); save(db); res.json(f); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/qflags/:id', need(...EDIT), (req, res) => {
    const db = load(), f = db.qflags.find(x => x.id === req.params.id && flagSeen(db, req.session.user, x)); if (!f) return res.status(404).json({ error: 'not found' });
    db.qflags = db.qflags.filter(x => x !== f); save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- call simulator results (shown on the Agents page, tab Simulations)
  app.get('/api/simulations', need(), (req, res) => {
    const db = load(), u = req.session.user;
    res.json(db.simulations.filter(x => u.role !== 'agent' ? seesUser(db, u, x.agent) : x.agent === u.username));
  });
  app.post('/api/simulations', need(), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {};
    if (me.role !== 'agent' && b.agent && !(userBy(db, b.agent) && seesUser(db, me, b.agent))) return bad(res, 'Choose the agent');   // staff save results only for people of their workspace
    const agent = me.role === 'agent' ? me.username : (b.agent || me.username);
    const x = { id: 'm' + hex(5), agent, scenario: str(b.scenario, 100) || 'Practice call', persona: str(b.persona, 60), score: Math.max(0, Math.min(100, Math.round(Number(b.score) || 0))), minutes: Math.max(1, Math.min(240, Math.round(Number(b.minutes) || 1))), result: str(b.result, 30), tips: list(b.tips, 6, 160), date: iso() };
    db.simulations.unshift(x); save(db); res.json(x);
  });

  // a practice call can be deleted by an admin (Call Simulator › Dashboard › Sessions)
  app.delete('/api/simulations/:id', need('admin'), (req, res) => {
    const db = load(), n = db.simulations.length; db.simulations = db.simulations.filter(x => x.id !== req.params.id);
    if (db.simulations.length === n) return res.status(404).json({ error: 'not found' }); save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- calibration sessions (QA, team leads and trainers compare impressions and decide together)
  const decisions = v => (Array.isArray(v) ? v : []).slice(0, 30).map(d => ({ t: str(d.t, 250), owner: str(d.owner, 40), due: DAY.test(d.due || '') ? d.due : '', done: !!d.done })).filter(d => d.t);
  // blind scoring: until a participant has scored a review, they do not see the others' scores of it (the owner and admins always do,
  // and everybody does once the session is closed)
  app.get('/api/calibrations', need(...EDIT), (req, res) => {
    const me = req.session.user;
    res.json(load().calibrations.map(c => { const open = c.status === 'closed' || me.role === 'admin' || c.by === me.username;
      return open || !c.scores ? c : { ...c, scores: Object.fromEntries(Object.entries(c.scores).map(([rid, s]) => [rid, s[me.username] ? s : { [me.username]: undefined, _n: Object.keys(s).length }])) }; }));
  });
  app.post('/api/calibrations', need(...EDIT), (req, res) => {
    const db = load(), b = req.body || {}, me = req.session.user;
    if (!DAY.test(b.date || '')) return bad(res, 'Choose the date');
    const participants = list(b.participants, 30, 40).filter(x => { const u = userBy(db, x); return u && EDIT.includes(u.role); });
    if (!participants.includes(me.username)) participants.unshift(me.username);
    const c = { id: 'c' + hex(5), title: str(b.title, 150) || 'Calibration session', date: b.date, status: ['planned', 'held', 'closed'].includes(b.status) ? b.status : 'planned', participants, teams: list(b.teams, 20, 40), reviews: list(b.reviews, 30, 40), notes: str(b.notes, 5000), entries: {}, decisions: decisions(b.decisions), by: me.username, created: iso(), updated: iso() };
    participants.forEach(p => { if (p !== me.username) notify(db, p, 'cal', `${me.name} invited you to the calibration "${c.title}" on ${c.date}`, { cal: c.id }); });
    db.calibrations.unshift(c); save(db); res.json(c);
  });
  app.put('/api/calibrations/:id', need(...EDIT), (req, res) => {
    const db = load(), c = db.calibrations.find(x => x.id === req.params.id), me = req.session.user, b = req.body || {};
    if (!c) return res.status(404).json({ error: 'not found' });
    const owner = me.role === 'admin' || c.by === me.username, member = c.participants.includes(me.username);
    if (!owner && !member) return res.status(403).json({ error: 'Only the participants can change a calibration' });
    if (b.entry && member) c.entries[me.username] = { impression: str(b.entry.impression, 4000), done: str(b.entry.done, 4000), at: iso() };   // everybody writes only their own part
    if (b.score && member && c.reviews.includes(b.score.rid)) {           // my own score of one review: hidden from the others until they score it too
      const sc = Math.round(Number(b.score.sc)); if (!(sc >= 0 && sc <= 100)) return bad(res, 'Give a score from 0 to 100');
      c.scores = c.scores || {}; c.scores[b.score.rid] = { ...(c.scores[b.score.rid] || {}), [me.username]: { sc, note: str(b.score.note, 500), at: iso() } };
    }
    if (b.base && owner && c.reviews.includes(b.base.rid)) { c.base = c.base || {}; c.base[b.base.rid] = b.base.who === 'review' ? 'review' : str(b.base.who, 40); }   // the reference score: the review itself, or one participant
    if (b.reviews !== undefined && member && !owner) c.reviews = list(b.reviews, 30, 40).filter(r => db.evaluations.some(e => e.rid === r));
    if (b.decisions !== undefined) c.decisions = decisions(b.decisions);
    if (b.notes !== undefined) c.notes = str(b.notes, 5000);
    if (b.status !== undefined && ['planned', 'held', 'closed'].includes(b.status)) c.status = b.status;
    if (owner) {
      if (b.title !== undefined) c.title = str(b.title, 150) || c.title;
      if (b.date !== undefined && DAY.test(b.date)) c.date = b.date;
      if (b.participants !== undefined) { c.participants = list(b.participants, 30, 40).filter(x => { const u = userBy(db, x); return u && EDIT.includes(u.role); }); if (!c.participants.includes(c.by)) c.participants.unshift(c.by); }
      if (b.teams !== undefined) c.teams = list(b.teams, 20, 40);
      if (b.reviews !== undefined) c.reviews = list(b.reviews, 30, 40);
    }
    c.updated = iso(); save(db); res.json(c);
  });
  app.delete('/api/calibrations/:id', need(...EDIT), (req, res) => {
    const db = load(), c = db.calibrations.find(x => x.id === req.params.id), me = req.session.user;
    if (!c) return res.status(404).json({ error: 'not found' });
    if (me.role !== 'admin' && c.by !== me.username) return res.status(403).json({ error: 'Only the creator can delete a calibration' });
    db.calibrations = db.calibrations.filter(x => x !== c); save(db); res.json({ ok: 1 });
  });
};
