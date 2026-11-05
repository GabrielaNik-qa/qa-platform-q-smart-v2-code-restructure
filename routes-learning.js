// Knowledge base (folders, articles, topics, read tracking, lesson tests), quizzes, monthly newsletter,
// AI import and ZIP export.
const JSZip = require('jszip');
let mammoth = null; try { mammoth = require('mammoth'); } catch (e) {}
const ai = require('./ai');
const { md } = require('./public/js/md.js');

module.exports = ({ app, load, save, need, bad, hex, iso, str, list, notify, userBy, seesUser, limited }) => {
  const EDIT = ['admin', 'qa', 'lead', 'trainer'];
  const isEd = u => EDIT.includes(u.role);
  // every AI request costs money: at most 30 per person per hour
  const aiBusy = (req, res) => {
    if (!ai.enabled() || !limited('ai:' + req.session.user.username, 30, 36e5)) return false;
    res.status(429).json({ error: 'Too many AI requests. Try again later.' }); return true;
  };
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#e11d48', '#ea580c', '#16a34a', '#ca8a04'], ICONS = ['📁', '📘', '📗', '📙', '📕', '🧭', '💡'];
  const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';

  // ---------------------------------------------------------------- helpers
  const reqOf = r => ({ on: !!(r && r.on), teams: list(r && r.teams, 20, 40) });
  const applies = (r, u) => !!(r && r.on && (!r.teams.length || r.teams.includes(u.team)));
  const descendants = (db, id) => { const out = new Set(); const walk = p => db.kbFolders.filter(f => f.parent === p).forEach(f => { out.add(f.id); walk(f.id); }); walk(id); return out; };
  const ancestors = (db, fid) => { const out = []; let f = db.kbFolders.find(x => x.id === fid), n = 0; while (f && n++ < 30) { out.push(f); f = db.kbFolders.find(x => x.id === f.parent); } return out; };
  const isRequired = (db, a, u) => applies(a.req, u) || ancestors(db, a.folder).some(f => applies(f.req, u));
  const passedTest = (db, user, aid) => db.attempts.some(t => t.user === user && t.aid === aid && t.passed);
  // folders given to some teams only (Gabriela, 3 November): a person sees a folder when every folder above it is open to everybody or to their team
  const folderSeen = (db, fid, u) => isEd(u) || ancestors(db, fid).every(f => !(f.teams || []).length || f.teams.includes(u.team));
  const artSeen = (db, a, u) => !!a && folderSeen(db, a.folder, u);
  const pubArt = (a, ed) => ed || !a.quiz ? a : { ...a, quiz: { pass: a.quiz.pass, questions: a.quiz.questions.map(q => ({ q: q.q, opts: q.opts })) } };
  const pubQuiz = (q, ed) => ed ? q : { ...q, questions: q.questions.map(x => ({ q: x.q, opts: x.opts })) };
  const quizAssigned = (q, u) => q.status === 'published' && u.active !== false && (q.assign.all || (q.assign.teams || []).includes(u.team) || (q.assign.users || []).includes(u.username));
  const grade = (qs, answers) => {
    const res = qs.map((q, i) => ({ ok: Number(answers && answers[i]) === q.a, a: q.a, why: q.why || '' }));
    return { results: res, score: qs.length ? Math.round(res.filter(r => r.ok).length / qs.length * 100) : 0 };
  };
  const markRead = (db, user, id) => { (db.kbReads[user] = db.kbReads[user] || {})[id] = iso(); };
  const folderPath = (db, fid) => ancestors(db, fid).reverse().map(f => f.name).join('/');
  function ensurePath(db, p, root) {                                         // "Processes/Objection handling" -> folder id (creates what is missing)
    let parent = root || '';
    String(p || '').split('/').map(s => str(s, 60)).filter(Boolean).slice(0, 4).forEach(name => {
      let f = db.kbFolders.find(x => x.parent === parent && x.name.toLowerCase() === name.toLowerCase());
      if (!f) { const n = db.kbFolders.length; f = { id: 'f' + hex(4), name, parent, color: COLORS[n % COLORS.length], icon: ICONS[n % ICONS.length], desc: '', req: { on: false, teams: [] }, created: iso() }; db.kbFolders.push(f); }
      parent = f.id;
    });
    return parent;
  }

  // ---------------------------------------------------------------- read everything the knowledge base page needs
  app.get('/api/kb', need(), (req, res) => {
    const db = load(), u = req.session.user, ed = isEd(u);
    res.json({ folders: db.kbFolders.filter(f => folderSeen(db, f.id, u)), articles: db.kbArticles.filter(a => artSeen(db, a, u)).map(a => pubArt(a, ed)), reads: db.kbReads[u.username] || {}, stars: (db.kbStars || {})[u.username] || [], newsletters: db.newsletters.filter(n => ed || n.published),
      attempts: db.attempts.filter(a => a.user === u.username).map(a => ({ id: a.id, aid: a.aid, qid: a.qid, score: a.score, passed: a.passed, at: a.at })) });
  });

  // ---------------------------------------------------------------- folders
  const folderBody = (b, db, cur) => {
    const name = str(b.name, 60); if (!name) throw new Error('Give the folder a name');
    const parent = b.parent && db.kbFolders.some(f => f.id === b.parent) ? b.parent : '';
    if (cur && (parent === cur.id || descendants(db, cur.id).has(parent))) throw new Error('A folder cannot be moved inside itself');
    return { name, parent, color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#2563eb', icon: str(b.icon, 8) || '📁', desc: str(b.desc, 400), req: reqOf(b.req), teams: list(b.teams, 30, 40) };
  };
  app.post('/api/kb/folders', need(...EDIT), (req, res) => {
    const db = load(); try { const f = { id: 'f' + hex(4), ...folderBody(req.body || {}, db), created: iso() }; db.kbFolders.push(f); save(db); res.json(f); } catch (e) { bad(res, e.message); }
  });
  app.put('/api/kb/folders/:id', need(...EDIT), (req, res) => {
    const db = load(), f = db.kbFolders.find(x => x.id === req.params.id); if (!f) return res.status(404).json({ error: 'not found' });
    try { Object.assign(f, folderBody(req.body || {}, db, f)); save(db); res.json(f); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/kb/folders/:id', need(...EDIT), (req, res) => {          // ?mode=cascade deletes everything inside, otherwise the content moves up one level
    const db = load(), f = db.kbFolders.find(x => x.id === req.params.id); if (!f) return res.status(404).json({ error: 'not found' });
    if (req.query.mode === 'cascade') {
      const ids = descendants(db, f.id); ids.add(f.id);
      const gone = new Set(db.kbArticles.filter(a => ids.has(a.folder)).map(a => a.id));
      db.kbArticles = db.kbArticles.filter(a => !gone.has(a.id)); db.kbFolders = db.kbFolders.filter(x => !ids.has(x.id));
      Object.values(db.kbReads).forEach(r => gone.forEach(id => delete r[id]));
    } else {
      db.kbFolders.forEach(x => { if (x.parent === f.id) x.parent = f.parent; }); db.kbArticles.forEach(a => { if (a.folder === f.id) a.folder = f.parent; });
      db.kbFolders = db.kbFolders.filter(x => x !== f);
    }
    save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- articles (+ optional lesson test)
  const quizBody = q => {
    if (!q) return null;
    const questions = ai.cleanQs(q.questions); if (!questions.length) return null;
    return { pass: Math.min(100, Math.max(1, parseInt(q.pass) || 80)), questions };
  };
  const artBody = (b, db) => {
    const title = str(b.title, 150); if (!title) throw new Error('Give the article a title');
    return { title, folder: b.folder && db.kbFolders.some(f => f.id === b.folder) ? b.folder : '', topics: list(b.topics, 10, 40), body: str(b.body, 200000), req: reqOf(b.req), quiz: quizBody(b.quiz), emoji: str(b.emoji, 8), cover: /^#[0-9a-f]{6}$/i.test(b.cover || '') ? b.cover : '' };
  };
  app.post('/api/kb/articles', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user;
    try { const a = { id: 'a' + hex(5), ...artBody(req.body || {}, db), author: me.name, authorU: me.username, created: iso(), updated: iso() }; db.kbArticles.push(a); save(db); res.json(a); } catch (e) { bad(res, e.message); }
  });
  app.put('/api/kb/articles/:id', need(...EDIT), (req, res) => {
    const db = load(), a = db.kbArticles.find(x => x.id === req.params.id), me = req.session.user; if (!a) return res.status(404).json({ error: 'not found' });
    try { const nb = artBody(req.body || {}, db); if (nb.title !== a.title || nb.body !== a.body) a.versions = [{ title: a.title, body: a.body, by: a.editor || a.author || '', at: a.updated || a.created }, ...(a.versions || [])].slice(0, 10);
      Object.assign(a, nb, { updated: iso(), editor: me.name }); save(db); res.json(a); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/kb/articles/:id', need(...EDIT), (req, res) => {
    const db = load(); if (!db.kbArticles.some(a => a.id === req.params.id)) return res.status(404).json({ error: 'not found' });
    db.kbArticles = db.kbArticles.filter(a => a.id !== req.params.id); Object.values(db.kbReads).forEach(r => delete r[req.params.id]); save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- reactions, comments and stars on articles (like Confluence, 3 November)
  const REACT = ['👍', '❤️', '🎉', '👏', '💡'];
  const seenArt = (req, res) => { const db = load(), u = req.session.user, a = db.kbArticles.find(x => x.id === req.params.id); if (!artSeen(db, a, u)) { res.status(404).json({ error: 'not found' }); return null; } return { db, u, a }; };
  app.post('/api/kb/articles/:id/react', need(), (req, res) => { const c = seenArt(req, res); if (!c) return; const e = (req.body || {}).e; if (!REACT.includes(e)) return bad(res, 'Choose a reaction');
    const r = c.a.reactions = c.a.reactions || {}, l = new Set(r[e] || []); if (l.has(c.u.username)) l.delete(c.u.username); else l.add(c.u.username); r[e] = [...l]; if (!r[e].length) delete r[e]; save(c.db); res.json({ reactions: r }); });
  app.post('/api/kb/articles/:id/comments', need(), (req, res) => { const c = seenArt(req, res); if (!c) return; const t = str((req.body || {}).t, 2000); if (!t) return bad(res, 'Write a comment first');
    const x = { id: 'c' + hex(4), u: c.u.username, n: c.u.name, t, at: iso() }; c.a.comments = [...(c.a.comments || []), x].slice(-200);
    if (c.a.authorU && c.a.authorU !== c.u.username) notify(c.db, c.a.authorU, 'kb', `${c.u.name} commented on "${c.a.title}": ${t.slice(0, 70)}`, {});
    save(c.db); res.json({ comments: c.a.comments }); });
  app.delete('/api/kb/articles/:id/comments/:cid', need(), (req, res) => { const c = seenArt(req, res); if (!c) return; const x = (c.a.comments || []).find(k => k.id === req.params.cid); if (!x) return res.status(404).json({ error: 'not found' });
    if (x.u !== c.u.username && !isEd(c.u)) return res.status(403).json({ error: 'not allowed' }); c.a.comments = c.a.comments.filter(k => k !== x); save(c.db); res.json({ comments: c.a.comments }); });
  app.post('/api/kb/star', need(), (req, res) => { const db = load(), u = req.session.user, id = str((req.body || {}).id, 40), a = db.kbArticles.find(x => x.id === id); if (!artSeen(db, a, u)) return res.status(404).json({ error: 'not found' });
    db.kbStars = db.kbStars || {}; const l = new Set(db.kbStars[u.username] || []); if ((req.body || {}).on === false) l.delete(id); else l.add(id); db.kbStars[u.username] = [...l].slice(-100); save(db); res.json({ stars: db.kbStars[u.username] }); });

  // ---------------------------------------------------------------- "mark as read", folder completion, lesson tests
  app.post('/api/kb/read', need(), (req, res) => {
    const db = load(), u = req.session.user, id = str((req.body || {}).id, 40), on = (req.body || {}).read !== false;
    if (!artSeen(db, db.kbArticles.find(a => a.id === id), u) && !db.newsletters.some(n => 'n:' + n.id === id)) return res.status(404).json({ error: 'not found' });
    if (on) markRead(db, u.username, id); else if (db.kbReads[u.username]) delete db.kbReads[u.username][id];
    save(db); res.json({ ok: 1 });
  });
  app.post('/api/kb/read-folder', need(), (req, res) => {
    const db = load(), u = req.session.user, id = str((req.body || {}).id, 40), on = (req.body || {}).read !== false;
    const f = db.kbFolders.find(x => x.id === id); if (!f) return res.status(404).json({ error: 'not found' });
    const ids = descendants(db, id); ids.add(id);
    db.kbArticles.filter(a => ids.has(a.folder)).forEach(a => { if (on) markRead(db, u.username, a.id); else if (db.kbReads[u.username]) delete db.kbReads[u.username][a.id]; });
    save(db); res.json({ ok: 1 });
  });
  app.post('/api/kb/articles/:id/test', need(), (req, res) => {
    const db = load(), u = req.session.user, a = db.kbArticles.find(x => x.id === req.params.id);
    if (!a || !a.quiz || !artSeen(db, a, u)) return res.status(404).json({ error: 'This article has no test' });
    const g = grade(a.quiz.questions, (req.body || {}).answers), passed = g.score >= a.quiz.pass;
    db.attempts.push({ id: 't' + hex(5), user: u.username, aid: a.id, score: g.score, passed, at: iso() });
    if (passed) markRead(db, u.username, a.id);
    save(db); res.json({ score: g.score, passed, pass: a.quiz.pass, results: g.results });
  });

  // ---------------------------------------------------------------- quizzes (weekly / monthly / category / custom)
  const quizMeta = (b, db) => {
    const title = str(b.title, 150); if (!title) throw new Error('Give the quiz a title');
    const questions = ai.cleanQs(b.questions); if (!questions.length) throw new Error('Add at least one question');
    const as = b.assign || {};
    return { title, desc: str(b.desc, 400), kind: ['weekly', 'monthly', 'category', 'custom'].includes(b.kind) ? b.kind : 'custom', topics: list(b.topics, 10, 40), articles: list(b.articles, 30, 40),
      pass: Math.min(100, Math.max(1, parseInt(b.pass) || 80)), due: DAY.test(b.due || '') ? b.due : '', assign: { all: !!as.all, teams: list(as.teams, 20, 40).filter(t => db.teams.some(x => x.id === t)), users: list(as.users, 60, 40).filter(x => userBy(db, x)) },
      status: b.status === 'published' ? 'published' : 'draft', questions, tries: Math.max(1, Math.min(20, parseInt(b.tries) || 3)) };   // tries: how many attempts an agent has (decision 15)
  };
  const notifyQuiz = (db, q) => db.users.forEach(u => { if (u.role === 'agent' && quizAssigned(q, u)) notify(db, u.username, 'quiz', `New quiz: ${q.title}${q.due ? ' (due ' + q.due + ')' : ''}`, { quiz: q.id }); });
  app.get('/api/quizzes', need(), (req, res) => {
    const db = load(), u = req.session.user, ed = isEd(u);
    res.json({ quizzes: db.quizzes.filter(q => ed || quizAssigned(q, u)).map(q => pubQuiz(q, ed)), attempts: db.attempts.filter(a => a.qid && (ed || a.user === u.username)) });
  });
  app.post('/api/quizzes', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user;
    try { const q = { id: 'q' + hex(4), ...quizMeta(req.body || {}, db), by: me.name, created: iso() }; db.quizzes.unshift(q); if (q.status === 'published') notifyQuiz(db, q); save(db); res.json(q); } catch (e) { bad(res, e.message); }
  });
  app.put('/api/quizzes/:id', need(...EDIT), (req, res) => {
    const db = load(), q = db.quizzes.find(x => x.id === req.params.id); if (!q) return res.status(404).json({ error: 'not found' });
    try { const was = q.status; Object.assign(q, quizMeta(req.body || {}, db)); if (was !== 'published' && q.status === 'published') notifyQuiz(db, q); save(db); res.json(q); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/quizzes/:id', need(...EDIT), (req, res) => {
    const db = load(); db.quizzes = db.quizzes.filter(q => q.id !== req.params.id); db.attempts = db.attempts.filter(a => a.qid !== req.params.id); save(db); res.json({ ok: 1 });
  });
  app.post('/api/quizzes/:id/attempt', need(), (req, res) => {
    const db = load(), u = req.session.user, q = db.quizzes.find(x => x.id === req.params.id);
    if (!q || !(isEd(u) || quizAssigned(q, userBy(db, u.username)))) return res.status(404).json({ error: 'not found' });
    // decision 15 (4 November): at most 3 tries unless the quiz says otherwise, and the right answers only once passed
    const mine = db.attempts.filter(a => a.user === u.username && a.qid === q.id), tries = Math.max(1, Math.min(20, parseInt(q.tries) || 3));
    if (!isEd(u) && !mine.some(a => a.passed) && mine.length >= tries) return res.status(403).json({ error: 'You have used all your tries for this quiz. Ask your trainer.' });
    const g = grade(q.questions, (req.body || {}).answers), passed = g.score >= q.pass;
    if (!isEd(u)) db.attempts.push({ id: 't' + hex(5), user: u.username, qid: q.id, score: g.score, passed, at: iso() });   // trying it out as an editor is not recorded
    save(db); res.json({ score: g.score, passed, pass: q.pass, left: isEd(u) ? null : Math.max(0, tries - mine.length - 1), results: passed || isEd(u) ? g.results : g.results.map(r => ({ ok: r.ok })) });
  });

  // ---------------------------------------------------------------- who has read / passed what (for trainers and managers)
  app.get('/api/kb/progress', need(...EDIT), (req, res) => {
    const db = load();
    const people = db.users.filter(u => u.role === 'agent' && u.active !== false && seesUser(db, req.session.user, u.username)).map(u => {
      const reads = db.kbReads[u.username] || {};
      const required = db.kbArticles.filter(a => isRequired(db, a, u));
      const left = required.filter(a => !reads[a.id] || (a.quiz && !passedTest(db, u.username, a.id))).map(a => ({ id: a.id, title: a.title, why: !reads[a.id] ? 'not read' : 'test not passed' }));
      const qs = db.quizzes.filter(q => quizAssigned(q, u)), qLeft = qs.filter(q => !db.attempts.some(a => a.user === u.username && a.qid === q.id && a.passed));
      return { username: u.username, name: u.name, team: u.team, required: required.length, completed: required.length - left.length, left, quizzes: qs.length, quizzesPassed: qs.length - qLeft.length, quizzesLeft: qLeft.map(q => ({ id: q.id, title: q.title, due: q.due })) };
    });
    res.json(people);
  });

  // ---------------------------------------------------------------- monthly newsletter
  const newsBody = b => {
    const title = str(b.title, 150); if (!title) throw new Error('Give the newsletter a title');
    return { month: /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : iso().slice(0, 7), title, intro: str(b.intro, 3000), published: !!b.published,
      items: (Array.isArray(b.items) ? b.items : []).slice(0, 40).map(i => ({ title: str(i.title, 150), text: str(i.text, 2000), aid: str(i.aid, 40) })).filter(i => i.title || i.text) };
  };
  app.post('/api/kb/newsletters', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user;
    try { const n = { id: hex(4), ...newsBody(req.body || {}), by: me.name, created: iso() }; db.newsletters.unshift(n);
      if (n.published) db.users.forEach(u => { if (u.active !== false && u.username !== me.username) notify(db, u.username, 'news', `Newsletter: ${n.title}`, { news: n.id }); });
      save(db); res.json(n); } catch (e) { bad(res, e.message); }
  });
  app.put('/api/kb/newsletters/:id', need(...EDIT), (req, res) => {
    const db = load(), n = db.newsletters.find(x => x.id === req.params.id), me = req.session.user; if (!n) return res.status(404).json({ error: 'not found' });
    try { const was = n.published; Object.assign(n, newsBody(req.body || {}), { updated: iso() });
      if (!was && n.published) db.users.forEach(u => { if (u.active !== false && u.username !== me.username) notify(db, u.username, 'news', `Newsletter: ${n.title}`, { news: n.id }); });
      save(db); res.json(n); } catch (e) { bad(res, e.message); }
  });
  app.delete('/api/kb/newsletters/:id', need(...EDIT), (req, res) => {
    const db = load(); db.newsletters = db.newsletters.filter(n => n.id !== req.params.id); save(db); res.json({ ok: 1 });
  });

  // ---------------------------------------------------------------- AI import: paste text or upload a file -> draft articles you can edit before saving
  // HTML -> text: scripts and styles are dropped, h1-h3 become "#" headings (where articles are split), the rest of the tags are removed.
  // Everything here takes time in step with the size of the file: a crafted file (thousands of "<script" or "<h1" that never close) cannot keep the server busy.
  const dropBlocks = h => {                                                  // <script>…</script> and <style>…</style> out; one never closed takes the rest of the file with it
    const lo = h.toLowerCase(); let out = '', i = 0, s = lo.indexOf('<script'), t = lo.indexOf('<style');
    for (;;) {
      if (s >= 0 && s < i) s = lo.indexOf('<script', i);
      if (t >= 0 && t < i) t = lo.indexOf('<style', i);
      const a = s < 0 ? t : t < 0 ? s : Math.min(s, t); if (a < 0) return out + h.slice(i);
      const e = lo.indexOf('</' + (a === s ? 'script' : 'style'), a); out += h.slice(i, a); if (e < 0) return out;
      const g = lo.indexOf('>', e); i = g < 0 ? lo.length : g + 1;
    }
  };
  const htmlText = h => dropBlocks(String(h)).replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n').replace(/<h([1-3])[^<>]*>/gi, (m, n) => '\n' + '#'.repeat(+n) + ' ').replace(/<[^<>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');   // &amp; last, so "&amp;lt;" stays "&lt;"
  // a Word file is a ZIP: its table of contents says how big each part becomes once unpacked. A small file that would unpack to
  // hundreds of MB (a "zip bomb") is refused before anything is unpacked (R-14). At most 50 MB unpacked and 2,000 parts.
  const docxTooBig = buf => {
    let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) return 'This Word file is damaged';
    const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16), total = 0;
    if (n > 2000) return 'This Word file is too large to import';
    for (let k = 0; k < n; k++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return 'This Word file is damaged';
      const size = buf.readUInt32LE(p + 24); if (size === 0xffffffff) return 'This Word file is too large to import';
      total += size; if (total > 50 * 1024 * 1024) return 'This Word file is too large to import';
      p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    }
    return '';
  };
  app.get('/api/ai/status', need(), (req, res) => res.json({ enabled: ai.enabled(), model: ai.MODEL() }));
  app.post('/api/kb/import', need(...EDIT), async (req, res) => {
    if (aiBusy(req, res)) return;
    const b = req.body || {}, db = load();
    try {
      let text = String(b.text || ''), pdf = null; const fn = str(b.filename, 150), ext = (fn.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      if (b.fileB64) {
        const buf = Buffer.from(String(b.fileB64), 'base64');
        // Word is read as HTML (not plain text) so its headings survive and the document can be split into articles at them, like an HTML file
        if (/^docx$/i.test(ext)) { if (!mammoth) throw new Error('Word import needs one more package: run  npm.cmd install mammoth'); const big = docxTooBig(buf); if (big) throw new Error(big); text = htmlText((await mammoth.convertToHtml({ buffer: buf })).value); }
        else if (/^pdf$/i.test(ext)) pdf = buf.toString('base64');
        else if (/^html?$/i.test(ext)) text = htmlText(buf.toString('utf8'));
        else text = buf.toString('utf8');
      }
      if (!text.trim() && !pdf) throw new Error('There is nothing to import. Paste some text or choose a file.');
      const folders = db.kbFolders.map(f => folderPath(db, f.id));
      res.json(await ai.draftArticles({ text, pdf, filename: fn, folders }));
    } catch (e) { bad(res, e.message); }
  });
  app.post('/api/kb/import/save', need(...EDIT), (req, res) => {
    const db = load(), me = req.session.user, b = req.body || {};
    const root = b.folder && db.kbFolders.some(f => f.id === b.folder) ? b.folder : '';
    const ids = (Array.isArray(b.articles) ? b.articles : []).slice(0, 60).map(x => {
      const folder = x.folder ? ensurePath(db, x.folder, root) : root, title = str(x.title, 150) || 'Untitled';
      const a = { id: 'a' + hex(5), title, folder, topics: list(x.topics, 10, 40), body: str(x.body, 200000), req: { on: false, teams: [] }, quiz: null, author: me.name, authorU: me.username, created: iso(), updated: iso() };
      db.kbArticles.push(a); return a.id;
    });
    save(db); res.json({ created: ids.length, ids });
  });
  app.post('/api/ai/quiz', need(...EDIT), async (req, res) => {
    if (aiBusy(req, res)) return;
    const db = load(), b = req.body || {};
    try {
      let text = String(b.text || '');
      if (Array.isArray(b.articleIds)) text += db.kbArticles.filter(a => b.articleIds.includes(a.id)).map(a => '# ' + a.title + '\n' + a.body).join('\n\n');
      if (!text.trim()) throw new Error('Choose the articles the questions should be based on.');
      res.json(await ai.draftQuiz({ text, count: b.count }));
    } catch (e) { bad(res, e.message); }
  });

  // ---------------------------------------------------------------- ZIP export of one article or a whole folder (with its sub-folders)
  const artFiles = (zip, a, dir) => {
    const name = slug(a.title), front = `---\ntitle: ${a.title}\ntopics: ${(a.topics || []).join(', ')}\nauthor: ${a.author || ''}\nupdated: ${a.updated || ''}\n---\n\n`;
    zip.file(dir + name + '.md', front + '# ' + a.title + '\n\n' + (a.body || '') + '\n');
    zip.file(dir + name + '.html', `<!doctype html><html><head><meta charset="utf-8"><title>${md('').length ? '' : ''}${String(a.title).replace(/[<>&]/g, '')}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1b2536}code,pre{background:#f1f4f9;border-radius:6px;padding:2px 6px}pre{padding:12px;overflow:auto}blockquote{border-left:4px solid #cbd5e1;margin:0;padding-left:14px;color:#475569}</style></head><body><h1>${String(a.title).replace(/[<>&]/g, '')}</h1><p><small>${(a.topics || []).map(t => '#' + String(t).replace(/[<>&]/g, '')).join(' ')}</small></p>${md(a.body)}</body></html>`);
  };
  const sendZip = async (res, zip, name) => {
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${slug(name)}.zip"`); res.send(buf);
  };
  app.get('/api/kb/articles/:id/export', need(), async (req, res) => {
    const db = load(), a = db.kbArticles.find(x => x.id === req.params.id); if (!artSeen(db, a, req.session.user)) return res.status(404).json({ error: 'not found' });
    const zip = new JSZip(); artFiles(zip, a, ''); await sendZip(res, zip, a.title);
  });
  app.get('/api/kb/folders/:id/export', need(), async (req, res) => {
    const db = load(), f = db.kbFolders.find(x => x.id === req.params.id); if (!f || !folderSeen(db, f.id, req.session.user)) return res.status(404).json({ error: 'not found' });
    const zip = new JSZip();
    const walk = (fol, dir) => {
      db.kbArticles.filter(a => a.folder === fol.id).forEach(a => artFiles(zip, a, dir));
      db.kbFolders.filter(x => x.parent === fol.id).forEach(c => walk(c, dir + slug(c.name) + '/'));
    };
    walk(f, slug(f.name) + '/'); await sendZip(res, zip, f.name);
  });
};
