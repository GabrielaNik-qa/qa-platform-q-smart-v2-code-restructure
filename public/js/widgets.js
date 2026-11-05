// ===================== Widgets and dashboards =====================
// Every card on the Dashboard and AutoQA pages is a widget from a preset catalog: each has its own name, size and place, so every
// dashboard reads the same way, top to bottom (summary, numbers, charts, categories, people, lists, work). The pages only show
// them: Home › Personalize (personalize.js) chooses which dashboard is your home, switches each widget on or off, and sets how the
// data is counted. The widgets are packed so every row is full; there, an admin can also arrange a dashboard by hand (move and
// resize its widgets), and that dashboard then keeps exactly the order and sizes they chose ("arranged": ar on every item). Views: "Standard" is your home (your own version > the default of your role set by an admin > built in); named
// views (personal ones, and shared ones made by admins / QA for chosen roles or everyone); and the ready-made dashboards (dashboards.js).
const WREG = { dash: {}, autoqa: {} }, DEFL = { dash: {}, autoqa: {} };
let WPREV = '', WUNDO = null;                                                   // WPREV = an admin previews the Standard view of another role
const wdef = (page, id, title, w, r, desc = '', grp = 'More') => { WREG[page][id] = { title, w, r, desc, grp }; };
const wl = (...a) => a.filter(([, , on = true]) => on).map(([id]) => ({ k: id, id, on: true }));
const wNorm = x => ({ k: x.k || x.id, id: x.id, on: x.on !== false, ...(x.ar ? { ar: true, size: x.size, ...(x.h ? { h: x.h } : {}) } : {}) });
const isArr = items => items.some(x => x.ar);                                   // arranged by an admin: its own order and sizes
const wKeep = page => x => x.ar ? { ...wNorm(x), size: x.size || (WREG[page][x.id] || {}).w || 30 } : { ...wNorm(x), size: (WREG[page][x.id] || {}).w || 30 };
const canShare = () => ['admin', 'qa'].includes(ME.role);
const ROLESEL = [['all', 'Everyone'], ...Object.entries(ROLE)];
const PERN = { week: 'Week', month: 'Month', year: 'Year', all: 'All time' };

// ---- the preset place of every widget: the order below, then the others in the order they were made
const WORD = { dash: ['brief', 'att_me', 'cap_me', 'wf_today', 'ai_lead',
  'kpi_avg', 'kpi_total', 'kpi_conv', 'kpi_rtime', 'kpi_agents', 'kpi_disputed', 'kpi_comments', 'kpi_unseen', 'kpi_pass', 'kpi_fail', 'kpi_trend', 'kpi_flags', 'kpi_disputes', 'plan_kpi', 'csat', 'complaints',
  'inbox', 'todo', 'coach_new',
  'qtime', 'cattime', 'catavg', 'catover', 'cat0', 'catins', 'heat', 'strong', 'needs', 'rootc', 'scperf',
  'revperf', 'agperf', 'wsperf', 'catpivot', 'teams', 'channels', 'distribution', 'top', 'low',
  'last5', 'attention', 'byreview', 'rcreview', 'qflags', 'targets',
  'planner', 'tasks', 'goals', 'kudos', 'learn_prog', 'ai_sim', 'ai_train', 'ai_ana'], autoqa: [] };
const wRank = (page, id) => { const i = WORD[page].indexOf(id); return i < 0 ? 1000 + Object.keys(WREG[page]).indexOf(id) : i; };
const wOrder = page => Object.keys(WREG[page]).sort((a, b) => wRank(page, a) - wRank(page, b));
const wSorted = (page, items) => { const seen = new Set(), l = items.filter(x => WREG[page][x.id] && x.on !== false && !seen.has(x.id) && seen.add(x.id)); return isArr(l) ? l : l.sort((a, b) => wRank(page, a.id) - wRank(page, b.id)); };
// the width of every widget on screen (sp, of the 60 columns), so no row has an empty end: number tiles share their own rows (at most
// five, as even as possible), and in the other rows the cards grow to fill the row. An arranged dashboard keeps its own sizes.
function wPack(page, items) {
  const l = wSorted(page, items), reg = WREG[page], out = [];
  if (isArr(l)) return l.map(x => ({ ...x, sp: x.size || reg[x.id].w }));
  const fill = row => { const t = row.reduce((a, x) => a + x.w, 0); let used = 0; row.forEach((x, i) => { const sp = i === row.length - 1 ? 60 - used : Math.round(x.w * 60 / t); used += sp; out.push({ ...x.x, sp }); }); };
  const tile = x => reg[x.id].w <= 15, wd = x => Math.min(60, reg[x.id].w);
  for (let i = 0; i < l.length;) {
    if (tile(l[i])) {                                  // a run of tiles: the fewest rows of at most 5, the first rows one longer
      let j = i; while (j < l.length && tile(l[j])) j++;
      const run = l.slice(i, j), rows = Math.ceil(run.length / 5); let a = 0;
      for (let k = 0; k < rows; k++) { const n = Math.ceil((run.length - a) / (rows - k)); fill(run.slice(a, a + n).map(x => ({ x, w: 1 }))); a += n; }
      i = j; continue;
    }
    const row = []; let w = 0;
    while (i < l.length && !tile(l[i]) && w + wd(l[i]) <= 60) { row.push({ x: l[i], w: wd(l[i]) }); w += wd(l[i]); i++; }
    fill(row);
  }
  return out;
}

// ---- which widgets a view shows
function stdLayout(page, role) {
  const mine = (ME.layouts || {})[page], rl = ((SET.layouts || {})[page] || {})[role];
  return ((!WPREV && mine) ? mine : (rl || DEFL[page][role] || DEFL[page].all)).map(wNorm);
}
const builtin = (page, role) => (DEFL[page][role] || DEFL[page].all).map(wNorm);
const sharedViews = page => ((SET.views || {})[page] || []);
const myViews = page => ((ME.views || {})[page] || []);
const viewsFor = page => { const r = WPREV || ME.role; return [{ id: 'std', name: 'Standard', kind: 'std' }, ...sharedViews(page).filter(v => (canShare() && !WPREV) || v.roles.includes('all') || v.roles.includes(r)).map(v => ({ ...v, kind: 'shared' })), ...(WPREV ? [] : myViews(page).map(v => ({ ...v, kind: 'mine' })))]; };
const namedOf = page => viewsFor(page).slice(1);
const allViews = page => [...viewsFor(page), ...(page === 'dash' && typeof dashTpls === 'function' ? dashTpls() : [])];
const curView = (page, vid) => { const l = allViews(page); return l.find(v => v.id === (vid || 'std')) || l[0]; };
const itemsOf = (page, v) => v.kind === 'std' ? stdLayout(page, WPREV || ME.role) : (v.items || []).map(wNorm);
const canEditView = v => !WPREV && v.kind !== 'tpl' && (v.kind !== 'shared' || canShare());   // a ready-made dashboard is copied, never changed

// ---- saving: every change goes straight into the view it is made on (the last one can be undone)
async function wCommit(page, items, msg, patch = {}, vid = 'std') {
  const v = curView(page, vid); if (!canEditView(v)) return;
  const before = { page, vid: v.id, items: itemsOf(page, v), name: v.name, roles: v.roles };
  items = items.map(wKeep(page));
  let req;
  if (v.kind === 'std') { ME = { ...ME, layouts: { ...(ME.layouts || {}), [page]: items } }; req = api('/api/layout', { page, items }, 'PUT').then(async r => { if (r.ok) ME = await r.json(); return r; }); }
  else if (v.kind === 'mine') { const views = myViews(page).map(x => x.id === v.id ? { ...x, ...patch, items } : x); ME = { ...ME, views: { ...(ME.views || {}), [page]: views } }; req = api('/api/views', { page, views }, 'PUT').then(async r => { if (r.ok) ME = await r.json(); return r; }); }
  else { const views = sharedViews(page).map(x => x.id === v.id ? { ...x, ...patch, items } : x); SET = { ...SET, views: { ...(SET.views || {}), [page]: views } }; req = api('/api/shared-views', { page, views }, 'PUT').then(async r => { if (r.ok) SET = await r.json(); return r; }); }
  WUNDO = { ...before, msg }; render(); undoBar(msg);
  const r = await req; if (!r.ok) toast(await errOf(r, 'Could not save the change'), true);
}
function undoBar(msg) { if (!msg) return; let b = $('#wundo'); if (!b) { b = document.createElement('div'); b.id = 'wundo'; document.body.appendChild(b); } b.className = 'wundo'; b.innerHTML = `<span>${esc(tr(msg))}</span><button onclick="wUndo()">${tr('Undo')}</button>`; clearTimeout(undoBar.t); undoBar.t = setTimeout(() => b.remove(), 6000); }
async function wUndo() { const u = WUNDO; if (!u) return; WUNDO = null; const b = $('#wundo'); if (b) b.remove(); await wCommit(u.page, u.items, '', u.vid === 'std' ? {} : { name: u.name, ...(u.roles ? { roles: u.roles } : {}) }, u.vid); WUNDO = null; const b2 = $('#wundo'); if (b2) b2.remove(); toast('Change undone'); }
// a widget switched on or off on one view (Home › Personalize › Display)
function wToggle(page, vid, id, on) {
  const l = itemsOf(page, curView(page, vid)).filter(x => x.id !== id && x.on !== false), t = WREG[page][id].title;
  if (on) l.push({ k: id, id, on: true, ...(isArr(l) ? { ar: true, size: WREG[page][id].w } : {}) });   // on an arranged dashboard it comes last, at its preset size
  wCommit(page, l, on ? `Shown: ${t}` : `Hidden: ${t}`, {}, vid);
}

// ---- views: new, copy, rename, share, delete, the default of a role
function wNewView(page, src) {
  const from = src ? curView(page, src) : null;
  openForm({ title: from ? tr('Make your own copy') : tr('New dashboard'), w: 520, yes: from ? 'Make the copy' : 'Create', d: { name: from ? (from.name + ' · ' + tr('my copy')).slice(0, 40) : '', roles: [] },
    fields: [{ k: 'name', l: 'Name', req: 1, ph: tr('For example: My team, Chats, Mondays') }, ...(canShare() ? [{ k: 'roles', l: 'Also show it to (leave empty for a personal dashboard)', t: 'multi', o: ROLESEL }] : [])],
    save: async d => {
      if (!d.name.trim()) return tr('Give the dashboard a name');
      const id = 'v' + Date.now().toString(36), items = from ? itemsOf(page, from) : builtin(page, ME.role), v = { id, name: d.name.trim().slice(0, 40), items: items.map(wKeep(page)) };
      if (canShare() && (d.roles || []).length) { const r = await api('/api/shared-views', { page, views: [...sharedViews(page), { ...v, roles: d.roles, by: ME.name }] }, 'PUT'); if (!r.ok) return errOf(r, 'Could not create the dashboard'); SET = await r.json(); }
      else { const r = await api('/api/views', { page, views: [...myViews(page), v] }, 'PUT'); if (!r.ok) return errOf(r, 'Could not create the dashboard'); ME = await r.json(); }
      if (typeof pSel === 'function') pSel(id); toast(tr(`Dashboard "${v.name}" created`));
    } });
}
async function wViewPatch(page, vid, patch, msg) { const v = curView(page, vid); if (v.kind === 'std' || v.kind === 'tpl') return; await wCommit(page, itemsOf(page, v), msg, patch, vid); }
async function wShare(page, vid, r) {
  const v = curView(page, vid); let roles = [...(v.roles || [])];
  if (r === 'all') roles = roles.includes('all') ? [] : ['all']; else { roles = roles.filter(x => x !== 'all'); roles = roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r]; }
  const items = itemsOf(page, v).map(wKeep(page));
  if (v.kind === 'mine' && roles.length) {            // a personal dashboard becomes shared
    const r1 = await api('/api/shared-views', { page, views: [...sharedViews(page), { id: v.id, name: v.name, items, roles, by: ME.name }] }, 'PUT'); if (!r1.ok) return toast(await errOf(r1, 'Could not share'), true); SET = await r1.json();
    const r2 = await api('/api/views', { page, views: myViews(page).filter(x => x.id !== v.id) }, 'PUT'); if (r2.ok) ME = await r2.json(); render(); return toast('Shared');
  }
  if (v.kind === 'shared' && !roles.length) {         // nobody else: it becomes a personal dashboard again
    const r1 = await api('/api/views', { page, views: [...myViews(page), { id: v.id, name: v.name, items }] }, 'PUT'); if (!r1.ok) return toast(await errOf(r1, 'Could not save'), true); ME = await r1.json();
    const r2 = await api('/api/shared-views', { page, views: sharedViews(page).filter(x => x.id !== v.id) }, 'PUT'); if (r2.ok) SET = await r2.json(); render(); return toast('Now a personal dashboard');
  }
  wViewPatch(page, vid, { roles }, 'Sharing changed');
}
const wDelView = (page, vid) => { const v = curView(page, vid); ask(tr(`Delete "${v.name}"?`), v.kind === 'shared' ? 'It is removed for everybody it was shared with. Your home dashboard stays.' : 'Your home dashboard stays.', async () => {
  if (v.kind === 'shared') { const r = await api('/api/shared-views', { page, views: sharedViews(page).filter(x => x.id !== v.id) }, 'PUT'); if (r.ok) SET = await r.json(); }
  else { const r = await api('/api/views', { page, views: myViews(page).filter(x => x.id !== v.id) }, 'PUT'); if (r.ok) ME = await r.json(); }
  if (typeof pSel === 'function') pSel('std'); toast('Dashboard deleted');
}, { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
async function wRoleDefault(page, role, vid) { if (!role) return; const items = itemsOf(page, curView(page, vid)).map(wKeep(page)); const r = await api('/api/layouts/' + role, { page, items }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); const j = await r.json(); SET = { ...SET, layouts: j.layouts }; toast(tr(`This is now the home dashboard of every ${ROLE[role]} who has not chosen their own`)); }
async function wResetStd(page) { const r = await api('/api/layout', { page, reset: true, items: [] }, 'PUT'); if (r.ok) { ME = await r.json(); render(); toast('Back to the default of your role'); } }

// ---- showing a view: the widgets packed in their preset order and size, or as an admin arranged them (edit = the handles to do so)
const wBk = s => s < 20 ? 'ws' : s < 30 ? 'wm' : s < 60 ? 'wl' : 'wf';   // size group: on narrow screens small widgets grow so they stay readable
function wGrid(page, ctxOf, vid, edit) {
  const reg = WREG[page], items = wPack(page, itemsOf(page, curView(page, vid)));
  if (!items.length) return `<div class="agem wempty"><b>${tr('This dashboard has no widgets yet.')}</b><br><a href="javascript:void(0)" class=agl onclick="goPage('pers')">${tr('Choose them in Home › Personalize ›')}</a></div>`;
  return `<div class="wgrid${edit ? ' warr' : ''}">${items.map(x => { const r = reg[x.id], h = x.ar && x.h; return `<div class="wg ${wBk(x.sp)}${h ? ' hset' : ''}${edit ? ' ed' : ''}" style="--sp:${x.sp}${h ? `;height:${h}px` : ''}"${edit ? wDnD(page, vid, x.k) : ''}>${edit ? wTb(page, vid, x) : ''}${r.r(typeof ctxOf === 'function' ? ctxOf(x) : ctxOf, x.sp, x)}${edit ? wRzH(page, vid, x.k) : ''}</div>`; }).join('')}</div>` + wFoot();
}
// the line at the bottom of every dashboard: when its data last changed (UTC, like the reports; your own time on hover)
const wFoot = () => DUPD ? `<div class=wupd title="${esc(DUPD.toLocaleString(I18N.locale()))}"><b>${tr('Last data update time (UTC)')}</b><span class=mono>${DUPD.toISOString().slice(0, 19).replace('T', ' ')}</span></div>` : '';
// ---- arranging by hand (admins only, in Home › Personalize): the first move or resize fixes the dashboard as it is shown, then every
// change keeps exactly that order and those sizes. "Automatic layout" goes back to the packed preset.
const canArrange = () => ME.role === 'admin' && !WPREV;
const wArrItems = (page, vid) => wPack(page, itemsOf(page, curView(page, vid))).map(x => ({ k: x.k, id: x.id, on: true, ar: true, size: x.sp, ...(x.ar && x.h ? { h: x.h } : {}) }));
const wIdx = (l, k) => l.findIndex(x => x.k === k);
function wArrAuto(page, vid) { const l = itemsOf(page, curView(page, vid)).filter(x => x.on !== false).map(x => ({ k: x.k, id: x.id, on: true })); wCommit(page, l, 'Automatic layout', {}, vid); }
function wRemove(page, vid, k) { const l = wArrItems(page, vid), x = l[wIdx(l, k)]; wCommit(page, l.filter(z => z.k !== k), `Hidden: ${WREG[page][x.id].title}`, {}, vid); }
// resizing: drag the right edge (width), the bottom edge (height) or the corner (both); the width snaps to the 60 columns of the grid
function wRz(ev, page, vid, k, mode) {
  if (ev.button) return; ev.preventDefault(); ev.stopPropagation();
  const el = ev.currentTarget.closest('.wg'), grid = el.parentElement, gap = parseFloat(getComputedStyle(grid).columnGap) || 0, col = (grid.clientWidth - 59 * gap) / 60;
  const l = wArrItems(page, vid), x = l[wIdx(l, k)]; if (!x) return;
  const r0 = el.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY, tip = document.createElement('div');
  let sp = x.size, h = x.h || 0;
  tip.className = 'wrtip'; el.appendChild(tip); el.classList.add('rz'); document.body.classList.add('wrzing');
  const show = () => { tip.textContent = Math.round(sp / 60 * 100) + '% × ' + (h ? h + ' px' : tr('automatic height')); };
  const move = e => {   // with the corner, a dimension changes only once the mouse really moves that way
    if (mode === 'x' || (mode === 'xy' && Math.abs(e.clientX - x0) > 6)) { sp = Math.max(6, Math.min(60, Math.round((r0.width + e.clientX - x0 + gap) / (col + gap)))); el.style.setProperty('--sp', sp); }
    if (mode === 'y' || (mode === 'xy' && Math.abs(e.clientY - y0) > 6)) { h = Math.max(90, Math.min(1400, Math.round((r0.height + e.clientY - y0) / 10) * 10)); el.style.height = h + 'px'; el.classList.add('hset'); }
    show();
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    tip.remove(); el.classList.remove('rz'); document.body.classList.remove('wrzing');
    if (sp === x.size && h === (x.h || 0)) return;
    x.size = sp; if (h) x.h = h; else delete x.h; wCommit(page, l, 'Size changed', {}, vid);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up); show();
}
function wAutoH(page, vid, k) { const l = wArrItems(page, vid), x = l[wIdx(l, k)]; if (!x || !x.h) return; delete x.h; wCommit(page, l, 'Automatic height', {}, vid); }
const wRzH = (page, vid, k) => `<i class="wrz wrx" onpointerdown="wRz(event,'${page}',${jsq(vid)},${jsq(k)},'x')" title="${esc(tr('Drag to change the width'))}"></i><i class="wrz wry" onpointerdown="wRz(event,'${page}',${jsq(vid)},${jsq(k)},'y')" ondblclick="wAutoH('${page}',${jsq(vid)},${jsq(k)})" title="${esc(tr('Drag to change the height (double-click: automatic height)'))}"></i><i class="wrz wrxy" onpointerdown="wRz(event,'${page}',${jsq(vid)},${jsq(k)},'xy')" ondblclick="wAutoH('${page}',${jsq(vid)},${jsq(k)})" title="${esc(tr('Drag to change the size (double-click: automatic height)'))}"></i>`;
// moving: grab the ⠿ handle of a widget and drop it on another one (it takes that place)
let WDRAG = null;
const wGrip = `onmousedown="this.closest('[data-wk]').draggable=true" onmouseup="this.closest('[data-wk]').draggable=false"`;
function wDragStart(ev, page, k) { WDRAG = { page, k }; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', k); }
function wDropOn(ev, page, vid, k) { ev.preventDefault(); ev.currentTarget.classList.remove('over'); const d = WDRAG; WDRAG = null; if (!d || d.page !== page || d.k === k) return; const l = wArrItems(page, vid), x = l.splice(wIdx(l, d.k), 1)[0]; l.splice(wIdx(l, k), 0, x); wCommit(page, l, 'Widget moved', {}, vid); }
const wDnD = (page, vid, k) => ` data-wk="${esc(k)}" ondragstart="wDragStart(event,'${page}',${jsq(k)})" ondragend="this.draggable=false" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="wDropOn(event,'${page}',${jsq(vid)},${jsq(k)})"`;
const wTb = (page, vid, x) => `<div class=wtb2><span class=wgrip title="${esc(tr('Drag to move'))}" ${wGrip}>⠿</span><button onclick="wRemove('${page}',${jsq(vid)},${jsq(x.k)})" title="${esc(tr('Hide this widget'))}" aria-label="${esc(tr('Hide this widget'))}">✕</button></div>`;
// the bar above the widgets of the Dashboard: its filters, and the way to Personalize
const wBar = (page, chips = '') => `<div class=wvbar>${chips || '<div></div>'}<button class="ib ibx" onclick="goPage('pers')" title="${esc(tr('Choose your dashboard and its widgets'))}">${IC.gear} ${tr('Personalize')}</button></div>`;

// ---------------------------------------------------------------- Home dashboard widgets
const kp = (t, v, s, c, b, act) => `<div class="card clk kpi kpc" onclick="${act}"><small>${t}</small><div class=big style="color:${c}">${v}</div>${b == null ? '' : bar(b, c)}<small>${s}</small></div>`;
const pc1 = v => v.toFixed(1) + '<small class=kps>%</small>';
let DCH = '';                                  // review type shown on the dashboard ('' = all types)
let DRV = '', DSC = '', DAG = '', DGR = LS.get('qa_dgr', 'week');   // dashboard filters: reviewer, scorecard, agent; DGR = date grouping of the charts over time
let DBASE = LS.get('qa_dbase', 'conv');                       // the date the dashboard counts by: 'conv' = of the conversation, 'review' = when it was reviewed
const evDay = e => DBASE === 'review' && e.ra ? e.ra : e.d;     // (reviews made before this was recorded only have the conversation date)
// the time window of a period; prev = the window of the same length just before it (for the ▲ ▼ changes; none for "All time")
function dashWin(p, prev) {
  const DY = 864e5, now = Date.now();
  if (p === 'custom') { const a = new Date(DF + 'T00:00:00').getTime(), b = new Date(DT + 'T23:59:59').getTime() + 1; return prev ? [a - (b - a), a] : [a, b]; }
  const n = { week: 7, month: 30, year: 365 }[p]; if (!n) return prev ? null : [-Infinity, Infinity];
  return prev ? [now - 2 * n * DY, now - n * DY] : [now - n * DY, Infinity];
}
const dashDF = (p, t, c, prev) => { const w = dashWin(p, prev); if (!w) return null;
  return EV.filter(e => { const d = evDay(e).getTime(); return (!t || e.tm === t) && (!c || chOf(e) === c) && (!DRV || e.by === DRV) && (!DSC || e.scid === DSC) && (!DAG || e.agent === DAG) && d >= w[0] && d < w[1]; }); };
function dashCtx(p, t, ch) {
  const g = t ? PT(t) : PASSG(), d = dashDF(p, t, ch), pv = dashDF(p, t, ch, true), n = d.length, a = avg(d.map(e => e.sc)), ps = d.filter(isPass).length, pc = n ? ps / n * 100 : 0, s = [...d].sort((x, y) => evDay(y) - evDay(x)), h = Math.ceil(n / 2), dl = n > 1 ? avg(s.slice(0, h).map(e => e.sc)) - avg(s.slice(h).map(e => e.sc)) : 0;
  const wk = Array.from({ length: 10 }, (_, i) => { const l = d.filter(e => { const age = (Date.now() - evDay(e)) / 864e5 / 7; return age >= 9 - i && age < 10 - i; }); return l.length ? avg(l.map(e => e.sc)) : null; });
  return { d, pv, n, a, ps, pc, g, t, p, c: ch || '', dl, wk, tr: Math.abs(dl) < 1.5 ? '— Stable' : dl > 0 ? '↗ Improving' : '↘ Declining', cs: CATS(d).map(c => ({ c, v: avg(d.map(e => cpv(e, c)).filter(v => v != null)) })).sort((x, y) => y.v - x.v) };
}
const wt = (x, d) => esc(x && x.title || d);
const catList = l => l.map(x => `<div class=clk onclick="goPage('cats')"><div class=row><span>${esc(x.c)}</span><b class=mono>${x.v.toFixed(1)}%</b></div>${bar(x.v, col(x.v))}</div>`).join('') || '<p class=mu style="text-align:center">✓ Nothing here</p>';
// a number tile: its name (the explanation on hover), the number, and the change against the period before (▲ ▼, green when it
// is good news: good = 1 when up is good, -1 when down is good); ∅ = nothing to compare with
const ktr = (cur, prev, good) => {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return `<small class=ktn title="${esc(tr('Nothing to compare with: pick a date range to see the change against the period before'))}">∅</small>`;
  const r = Math.round((cur - prev) / Math.abs(prev) * 100); if (!r) return '<small class=ktn>▲ 0%</small>';
  return `<small class=ktn style="color:${(r > 0) === (good > 0) ? 'var(--ok)' : 'var(--bad)'}">${r > 0 ? '▲' : '▼'} ${Math.abs(r)}%</small>`;
};
const kt = (t, desc, v, ch, act, band) => `<div class="card clk kt" onclick="${act}" title="${esc(tr(desc))}"><small class=ktt>${esc(tr(t))}</small><div class="ktv${band ? ' ' + band : ''}">${v}</div>${ch}</div>`;
const kch = (c, fn, good) => ktr(fn(c.d), c.pv ? fn(c.pv) : null, good);
const ksub = t => `<small class=ktn>${t}</small>`;
const hasCm = e => !!String(e.cm || '').trim() || (e.cs || []).some(k => (k.it || []).some(i => String(i.cm || '').trim()));
const kAvg = l => l.length ? avg(l.map(e => e.sc)) : null, kPct = (l, fn) => l.length ? l.filter(fn).length / l.length * 100 : null;
const kRt = l => { const v = l.map(e => +e.rt).filter(x => x > 0); return v.length ? avg(v) : null; };
const durS = s => s == null ? '—' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
const goAll = c => `goCalls({ch:'${c.c}',team:'${c.t || ''}'})`;
wdef('dash', 'kpi_avg', 'Average score', 15, c => kt('Average score', 'The average score of the reviews, against the target', c.n ? pc1(c.a) : '—', kch(c, kAvg, 1), goAll(c), c.n ? (c.a >= c.g ? 'ok' : 'bad') : ''), 'The average score of the reviews, against the target', 'Numbers');
wdef('dash', 'kpi_conv', 'Reviewed conversations', 15, c => kt('Reviewed conversations', 'How many different conversations were reviewed', new Set(c.d.map(e => e.id)).size, kch(c, l => new Set(l.map(e => e.id)).size, 1), goAll(c)), 'How many different conversations were reviewed', 'Numbers');
wdef('dash', 'kpi_rtime', 'Average review time', 15, c => kt('Average review time', 'How long one review takes in QA Entry, on average', durS(kRt(c.d)), kch(c, kRt, -1), goAll(c)), 'How long one review takes in QA Entry, on average', 'Numbers');
wdef('dash', 'kpi_agents', 'Reviewed agents', 15, c => kt('Reviewed agents', 'How many different agents were reviewed', new Set(c.d.map(e => e.agent)).size, kch(c, l => new Set(l.map(e => e.agent)).size, 1), "goPage('team')"), 'How many different agents were reviewed', 'Numbers');
wdef('dash', 'kpi_disputed', 'Disputed reviews', 15, c => kt('Disputed reviews', 'Reviews that an agent disputed', c.d.filter(e => e.dp).length, kch(c, l => l.filter(e => e.dp).length, -1), "goPage('disputes')"), 'Reviews that an agent disputed', 'Numbers');
wdef('dash', 'kpi_comments', 'Reviews with comments', 15, c => { const v = kPct(c.d, hasCm); return kt('Reviews with comments', 'Share of reviews with at least one comment', v == null ? '—' : pc1(v), kch(c, l => kPct(l, hasCm), 1), goAll(c)); }, 'Share of reviews with at least one comment', 'Numbers');
wdef('dash', 'kpi_unseen', 'Unseen reviews', 15, c => { const v = kPct(c.d, e => !e.seen); return kt('Unseen reviews', 'Share of reviews the agent has not opened yet', v == null ? '—' : pc1(v), kch(c, l => kPct(l, e => !e.seen), -1), 'dUnseen()'); }, 'Share of reviews the agent has not opened yet', 'Numbers');
wdef('dash', 'kpi_total', 'Total evaluations', 15, c => kt('Total evaluations', 'How many reviews were made', c.n, kch(c, l => l.length, 1), goAll(c)), 'How many reviews were made', 'Numbers');
wdef('dash', 'kpi_pass', 'Pass rate', 15, c => kt('Pass rate', 'Share of reviews at or above the target', pc1(c.pc), kch(c, l => kPct(l, isPass), 1), `goCalls({ch:'${c.c}',team:'${c.t || ''}',sc:{m:'pass'}})`), 'Share of reviews at or above the target', 'Numbers');
wdef('dash', 'kpi_fail', 'Fail rate', 15, c => kt('Fail rate', 'Share of reviews below the target', pc1(c.n ? 100 - c.pc : 0), kch(c, l => kPct(l, e => !isPass(e)), -1), `goCalls({ch:'${c.c}',team:'${c.t || ''}',sc:{m:'fail'}})`), 'Share of reviews below the target', 'Numbers');
wdef('dash', 'kpi_trend', 'Recent trend', 15, c => kt('Recent trend', 'Newer reviews compared with older ones', `<span style="font:600 20px var(--font-d)">${c.tr}</span>`, `${spark(c.wk, 120, 26)}${ksub(`Δ ${c.dl >= 0 ? '+' : ''}${c.dl.toFixed(1)} pts`)}`, "goPage('cats')"), 'Newer reviews compared with older ones', 'Numbers');
wdef('dash', 'kpi_flags', 'Flags', 15, c => { const red = c.d.filter(e => e.fl === 'red').length + QF.filter(f => f.type === 'red' && (!c.t || teamOf(f.agent) === c.t)).length, green = c.d.filter(e => e.fl === 'green').length + QF.filter(f => f.type === 'green' && (!c.t || teamOf(f.agent) === c.t)).length; return kt('Flags', 'Red and green flags, from reviews and quick flags', `<span style="color:var(--bad)">${red}</span> · <span style="color:var(--ok)">${green}</span>`, ksub(tr('red · green')), "goPage('flags')"); }, 'Red and green flags, from reviews and quick flags', 'Numbers');
wdef('dash', 'kpi_disputes', 'Open disputes', 15, c => { const n = c.d.filter(e => e.dp && e.dp.status === 'open').length; return kt('Open disputes', 'Disputes that wait for a decision', n, ksub(tr(n ? 'waiting for a decision' : 'nothing open')), "goPage('disputes')", n ? 'wn' : ''); }, 'Disputes that wait for a decision', 'Numbers');
wdef('dash', 'last5', 'Last 5 evaluated conversations', 30, (c, s, x) => card(wt(x, 'Last 5 evaluated conversations'), [...c.d].sort((p, q) => q.d - p.d).slice(0, 5).map(e => `<div class="row li clk" onclick="om('view','${e.rid}')"><div style="display:flex;gap:10px;align-items:center"><span class=av style="margin:0">${esc(ini(agn(e)))}</span><div>${lead(e)} ${chTag(chOf(e), 1)}</div></div>${sp(Math.round(e.sc * 10) / 10, e.tm)}</div>`).join('') || '<p class=mu>No evaluations yet</p>'), 'The newest reviews');
wdef('dash', 'distribution', 'Score distribution', 30, (c, s, x) => { const bs = [...new Set([0, 50, 70, c.g, 101])].sort((p, q) => p - q);
  return card(`${wt(x, 'Score distribution')} <small class=mu style="float:right;font-weight:400">${c.n} reviews</small>`, bs.slice(0, -1).map((lo, i) => { const hi = bs[i + 1], k = c.d.filter(e => e.sc >= lo && e.sc < hi).length;
    return `<div class=clk onclick="goCalls({ch:'${c.c}',team:'${c.t || ''}',sc:{a:${lo},b:${hi}}})"><div class=row><span>${lo}-${hi > 100 ? 100 : hi - 1}%</span><b class=mono>${k} reviews (${c.n ? Math.round(k / c.n * 100) : 0}%)</b></div>${bar(c.n ? k / c.n * 100 : 0, col(lo))}</div>`; }).join('')); }, 'How the scores are spread');
wdef('dash', 'strong', 'Strong categories', 30, (c, s, x) => card(`${wt(x, 'Strong categories')} ${pill('≥ ' + c.g + '%', 'ok')}`, catList(c.cs.filter(v => v.v >= c.g))), 'Categories at or above the target');
wdef('dash', 'needs', 'Categories needing improvement', 30, (c, s, x) => card(`${wt(x, 'Categories needing improvement')} ${pill('< ' + c.g + '%', 'wn')}`, c.cs.some(v => v.v < c.g) ? catList(c.cs.filter(v => v.v < c.g)) : '<p class=mu style="text-align:center">✓ Great job! Every category reaches the target.</p>'), 'Categories below the target');
wdef('dash', 'top', 'Top performers', 30, (c, s, x) => card(wt(x, 'Top performers'), agS(c.d).filter(v => v.k).sort((p, q) => q.a - p.a).slice(0, 5).map((v, i) => `<div class="row li clk" onclick="openAgent('${esc(v.u)}')"><span>#${i + 1} <b>${esc(v.n)}</b> <small>${v.k} evaluations</small></span><b class=mono style="color:${scol(v.a, v.team)}">${v.a.toFixed(1)}%</b></div>`).join('') || '<p class=mu>No data</p>'), 'The 5 best average scores');
wdef('dash', 'low', 'Agents needing support', 30, (c, s, x) => card(wt(x, 'Agents needing support'), agS(c.d).filter(v => v.k).sort((p, q) => p.a - q.a).slice(0, 5).map(v => `<div class="row li clk" onclick="openAgent('${esc(v.u)}')"><span><b>${esc(v.n)}</b> <small>${v.k} evaluations · pass ${v.p.toFixed(0)}%</small></span><b class=mono style="color:${scol(v.a, v.team)}">${v.a.toFixed(1)}%</b></div>`).join('') || '<p class=mu>No data</p>'), 'The 5 lowest average scores');
wdef('dash', 'teams', 'Teams compared', 30, (c, s, x) => card(wt(x, 'Teams compared'), TEAMS.filter(t => !t.system && (!c.t || t.id === c.t)).map(t => { const l = dashDF(c.p, t.id, c.c), a = avg(l.map(e => e.sc)); return `<div class=clk onclick="goTeam('${t.id}')"><div class=row><span><i class=dotk style="background:${t.color}"></i>${esc(t.name)} <small>${l.length} reviews</small></span><b class=mono style="color:${l.length ? scol(a, t.id) : 'var(--mu)'}">${l.length ? a.toFixed(1) + '%' : '—'}</b></div>${bar(a, l.length ? scol(a, t.id) : 'var(--bd)')}</div>`; }).join('')), 'Average score per team');
wdef('dash', 'qflags', 'Latest quick flags', 30, (c, s, x) => card(wt(x, 'Latest quick flags'), QF.filter(f => !c.t || teamOf(f.agent) === c.t).slice(0, 5).map(f => `<div class="row li clk" onclick="qfEdit('${f.id}')"><span><span class="fgv ${f.type}">${IC.flag}</span> <b class=mono>${esc(f.lead)}</b> <small>${esc(an(f.agent))} · ${f.date}</small><br><small>${esc((f.cm || '').slice(0, 70))}</small></span></div>`).join('') || '<p class=mu>No quick flags yet</p>'), 'Red and green flags given without a review');
wdef('dash', 'targets', 'Quality target & disputes', 30, (c, s, x) => card(wt(x, 'Quality target & disputes'), `<div class="card clk" onclick="goCalls()" style="margin:0 0 10px;background:color-mix(in srgb,var(--c) 12%,transparent);--c:${c.a >= c.g ? 'var(--ok)' : 'var(--bad)'}"><b>${c.a >= c.g ? `Target reached (≥ ${c.g}%)` : `Below target (< ${c.g}%)`}</b><br><small>Current average: ${c.a.toFixed(1)}%</small></div>` + (EV.filter(e => e.dp && e.dp.status === 'open').slice(0, 4).map(e => `<p class=clk style="margin:6px 0;padding:4px" onclick="om('view','${e.rid}')">• ${esc(agn(e))} disputed the review for Lead #${esc(e.id)}</p>`).join('') || '<p class=mu>No open disputes</p>')), 'Is the target reached, and open disputes');
wdef('dash', 'channels', 'Review types compared', 30, (c, s, x) => { const l = dashDF(c.p, c.t, ''), used = CHS.filter(k => l.some(e => chOf(e) === k));
  return card(wt(x, 'Review types compared'), used.map(k => { const z = l.filter(e => chOf(e) === k), a = avg(z.map(e => e.sc)), ps = z.filter(isPass).length; return `<div class=clk onclick="goCalls({ch:'${k}',team:'${c.t || ''}'})"><div class=row><span>${chTag(k)} <small>${z.length} reviews · pass ${Math.round(ps / z.length * 100)}%</small></span><b class=mono style="color:${scol(a, c.t || null)}">${a.toFixed(1)}%</b></div>${bar(a, CHC[k])}</div>`; }).join('') || '<p class=mu>No reviews yet</p>'); }, 'Calls, chats, emails and other: count, average and pass rate');
wdef('dash', 'attention', 'Reviews requiring attention', 60, (c, s, x) => card(wt(x, 'Reviews requiring attention'), c.d.filter(e => !isPass(e)).sort((p, q) => p.sc - q.sc).slice(0, 5).map(e => `<div class="row li clk" onclick="om('view','${e.rid}')"><div><b>Lead ${esc(e.id)}</b> <small>${esc(agn(e))} · ${f(e.d)}</small></div>${sp(Math.round(e.sc * 10) / 10, e.tm)}</div>`).join('') || '<p class=mu>Nothing to review</p>'), 'The lowest failing calls');
wdef('dash', 'tasks', 'Tasks overview', 30, (c, s, x) => { const l = TASKS.filter(t => !t.archived && (!c.t || teamOf(t.assignee) === c.t) && (canEditWork() || t.assignee === ME.username)), st = tkStats(l); return card(wt(x, 'Tasks overview'), `<div class=wtk><div><b>${l.filter(t => t.status !== 'done').length}</b><small>open</small></div><div><b style="color:var(--wn)">${l.filter(t => t.status === 'doing' || t.status === 'review').length}</b><small>active</small></div><div><b style="color:var(--bad)">${st.over}</b><small>overdue</small></div><div><b style="color:var(--ok)">${Math.round(st.comp)}%</b><small>done</small></div></div><a href="javascript:void(0)" class=agl onclick="goPage('tasks')">Open Tasks ›</a>`); }, 'Open, active and overdue tasks');
wdef('dash', 'todo', 'Your to-do list', 60, () => myWork(), 'Your own tasks, quizzes and reading');
wdef('dash', 'coach_new', 'Latest coaching update', 60, (c, s, x) => {
  const mine = SESS.filter(z => z.agents.includes(ME.username)).sort((p, q) => (q.date || '').localeCompare(p.date || ''))[0];
  if (!mine) return card(wt(x, 'Latest coaching update'), '<p class=mu style="margin:0">No coaching or one-to-one sessions documented for you yet.</p>');
  const open = (mine.actions || []).filter(a => !a.done);
  return card(wt(x, 'Latest coaching update'), `<div class=row><span><b>${esc(mine.title)}</b> <small class=mu>${mine.date} · ${esc(mine.byName || '')}</small></span><button class=ib onclick="viewSession('${mine.id}')">Open</button></div>`
    + (mine.goals ? `<p style="margin:8px 0 0">${esc(mine.goals)}</p>` : '') + (open.length ? `<div style="margin-top:8px"><b>Your next steps</b>${open.map(a => `<div class=li>• ${esc(a.t)}${a.due ? ` <small class=mu>due ${a.due}</small>` : ''}</div>`).join('')}</div>` : '<p class=mu style="margin:8px 0 0">No open actions.</p>'));
}, 'Your newest coaching or one-to-one');
// ---- charts over time and category insights (ideas from Zendesk QA)
const dgKey = d => { const x = new Date(d); if (DGR === 'day') return iso(x); if (DGR === 'month') return iso(x).slice(0, 7); if (DGR === 'quarter') return x.getFullYear() + ' Q' + (Math.floor(x.getMonth() / 3) + 1); const m = new Date(x); m.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(m); };
const dgLab = k => DGR === 'day' || DGR === 'week' ? k.slice(8, 10) + '/' + k.slice(5, 7) : DGR === 'month' ? new Date(k + '-01T12:00').toLocaleString(I18N.locale(), { month: 'short', year: '2-digit' }) : k;
const dgBuckets = l => { const m = {}; l.forEach(e => { const k = dgKey(evDay(e)); (m[k] = m[k] || []).push(e); }); return Object.keys(m).sort().slice(-16).map(k => ({ k, l: m[k] })); };
function svgCombo(b, g) {          // bars = number of reviews, line = average score (wide and low so it fits a full-width card)
  if (b.length < 1) return '<p class=mu>No reviews in this period</p>';
  const W = 1000, H = 240, L = 38, R = 34, T = 12, B = 30, pw = W - L - R, ph = H - T - B, n = b.length, bw = pw / n, mx = Math.max(...b.map(x => x.l.length)), y = v => T + ph * (1 - v / 100), yc = v => T + ph * (1 - v / mx);
  const pts = b.map((x, i) => [L + i * bw + bw / 2, y(avg(x.l.map(e => e.sc)))]);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class=rbsvg>${[0, 25, 50, 75, 100].map(v => `<line x1=${L} x2=${W - R} y1=${y(v)} y2=${y(v)} style="stroke:var(--bd)"/><text x=${L - 6} y=${y(v) + 4} font-size=10 text-anchor=end style="fill:var(--mu)">${v}%</text>`).join('')}${b.map((x, i) => `<rect x=${(L + i * bw + bw * .15).toFixed(1)} y=${yc(x.l.length).toFixed(1)} width=${(bw * .7).toFixed(1)} height=${(T + ph - yc(x.l.length)).toFixed(1)} rx=3 style="fill:var(--bd)"><title>${x.l.length} reviews</title></rect><text x=${(L + i * bw + bw / 2).toFixed(1)} y=${H - 10} font-size=10 text-anchor=middle style="fill:var(--mu)">${dgLab(x.k)}</text>`).join('')}<text x=${W - R + 6} y=${T + 8} font-size=10 style="fill:var(--mu)">${mx}</text><polyline fill=none stroke="#e8458b" stroke-width=2.5 points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/>${pts.map((p, i) => `<circle cx=${p[0].toFixed(1)} cy=${p[1].toFixed(1)} r=4 fill="#e8458b"><title>${dgLab(b[i].k)}: ${avg(b[i].l.map(e => e.sc)).toFixed(1)}% (${b[i].l.length} reviews)</title></circle>`).join('')}</svg><div class=agleg><span><i style="background:#e8458b"></i>Average score</span><span><i style="background:var(--bd)"></i>Reviews</span></div>`;
}
const CATCOL = ['#2563eb', '#06b6d4', '#e8458b', '#f97316', '#eab308', '#22c55e', '#8b5cf6', '#64748b', '#14b8a6', '#ef4444', '#a3a635', '#0ea5e9', '#f472b6', '#84cc16'];
function svgCats(b, cats) {
  if (b.length < 2 || !cats.length) return '<p class=mu>Not enough reviews to draw a line</p>';
  const W = 1000, H = 240, L = 38, R = 10, T = 12, B = 30, pw = W - L - R, ph = H - T - B, n = b.length, x = i => L + i * pw / (n - 1), y = v => T + ph * (1 - v / 100);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class=rbsvg>${[0, 25, 50, 75, 100].map(v => `<line x1=${L} x2=${W - R} y1=${y(v)} y2=${y(v)} style="stroke:var(--bd)"/><text x=${L - 6} y=${y(v) + 4} font-size=10 text-anchor=end style="fill:var(--mu)">${v}%</text>`).join('')}${b.map((z, i) => `<text x=${x(i)} y=${H - 10} font-size=10 text-anchor=middle style="fill:var(--mu)">${dgLab(z.k)}</text>`).join('')}${cats.map((c, ci) => { const p = b.map((z, i) => { const v = z.l.map(e => cpv(e, c)).filter(v => v != null); return v.length ? [x(i), y(avg(v))] : null; }).filter(Boolean); return `<polyline fill=none stroke="${CATCOL[ci % CATCOL.length]}" stroke-width=2 points="${p.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ')}"><title>${esc(c)}</title></polyline>`; }).join('')}</svg><div class=agleg style="justify-content:flex-start">${cats.map((c, ci) => `<span style="font-size:12px"><i style="background:${CATCOL[ci % CATCOL.length]}"></i>${esc(c)}</span>`).join('')}</div>`;
}
wdef('dash', 'qtime', 'Quality scores over time', 60, (c, s, x) => card(`${wt(x, 'Quality scores over time')} <small class=mu style="font-weight:400">by ${DGR}</small>`, svgCombo(dgBuckets(c.d))), 'Reviews per day / week / month with the average score as a line');
wdef('dash', 'cattime', 'Category scores over time', 60, (c, s, x) => card(`${wt(x, 'Category scores over time')} <small class=mu style="font-weight:400">by ${DGR}</small>`, svgCats(dgBuckets(c.d), c.cs.map(z => z.c))), 'One line per category');
wdef('dash', 'catins', 'Category insights', 60, (c, s, x) => { const half = [...c.d].sort((p, q) => p.d - q.d), h = Math.floor(half.length / 2), old = half.slice(0, h), nw = half.slice(h);
  return card(wt(x, 'Category insights'), c.cs.length ? tbl(['Category', 'Average', 'Trend', 'Ratings', 'Below target', 'Scored 0', 'Disputes'], c.cs.map(z => { const v = c.d.map(e => cpv(e, z.c)).filter(v => v != null), a1 = avg(old.map(e => cpv(e, z.c)).filter(v => v != null)), a2 = avg(nw.map(e => cpv(e, z.c)).filter(v => v != null)), zero = c.d.filter(e => (e.cs || []).some(k => k.n === z.c && k.m && k.e === 0)).length;
    return [esc(z.c), `<b class=mono style="color:${col(z.v)}">${z.v.toFixed(1)}%</b>`, old.length && nw.length ? trendPill(a2 - a1) : '—', v.length, v.filter(p => p < c.g).length, zero ? `<span style="color:var(--bad)">${zero}</span>` : 0, c.d.filter(e => e.dp && (e.cs || []).some(k => k.n === z.c && k.e < k.m)).length]; })) : '<p class=mu>No data</p>'); }, 'Average, trend, number of ratings, below target and 0% per category');
wdef('dash', 'goals', 'Goals this month', 30, (c, s, x) => { const l = (CO.goals || []).filter(g => (g.month || todayS().slice(0, 7)) === todayS().slice(0, 7)).slice(0, 6); return card(wt(x, 'Goals this month'), l.map(g => { const p = goalProgress(g); return `<div class=clk onclick="goPage('goals')"><div class=row><span>${esc(g.title || GMET[g.metric][0])} <small>${esc(gWho(g))}</small></span><b class=mono>${gFmt(g, p.v)} / ${gFmt(g, p.tg)}</b></div>${bar(p.pct, p.st === 'met' ? 'var(--ok)' : p.st === 'missed' ? 'var(--bad)' : 'var(--ac)')}</div>`; }).join('') || '<p class=mu>No goals for this month</p>'); }, 'Progress of the goals of this month');
wdef('dash', 'kudos', 'Latest kudos', 30, (c, s, x) => card(wt(x, 'Latest kudos'), (CO.kudos || []).slice(0, 5).map(k => `<div class="row li clk" onclick="goPage('kudos')"><span>${esc(k.badge || '⭐')} <b>${esc(an(k.to) || k.to)}</b> <small>from ${esc(k.byName || '')}</small><br><small>${esc(String(k.text || '').slice(0, 70))}</small></span></div>`).join('') || '<p class=mu>No kudos yet</p>'), 'The newest thank-you messages');
wdef('dash', 'csat', 'Customer satisfaction', 15, (c, s, x) => { const l = (CO.surveys || []).filter(z => !c.t || teamOf(z.agent) === c.t).map(z => +z.score).filter(Boolean); return kt('Customer satisfaction', 'Average survey score (CSAT)', l.length ? avg(l).toFixed(2) + '<small class=kps>/5</small>' : '—', ksub(tr(l.length ? `${Math.round(l.filter(v => v >= 4).length / l.length * 100)}% satisfied · ${l.length} answers` : 'no survey answers yet')), "goPage('csat')"); }, 'Average survey score (CSAT)');
wdef('dash', 'complaints', 'Open complaints', 15, (c, s, x) => { const l = (CO.complaints || []).filter(z => z.status !== 'resolved'); return kt('Open complaints', 'Complaints that are not resolved', l.length, ksub(tr(`${l.filter(z => ['high', 'critical'].includes(z.severity)).length} high or critical`)), "goPage('complaints')", l.length ? 'bad' : ''); }, 'Complaints that are not resolved');
wdef('dash', 'planner', 'Review plan this month', 30, (c, s, x) => { if (typeof plRows !== 'function') return ''; const keep = PLN.m; PLN.m = todayS().slice(0, 7); const r = plRows(); PLN.m = keep; const tg = r.reduce((a, z) => a + z.tg, 0), dn = r.reduce((a, z) => a + Math.min(z.done, z.tg || z.done), 0), bh = r.filter(z => z.st === 'behind');
  return card(wt(x, 'Review plan this month'), `<div class=row><b style="font-size:26px">${dn}<small style="font-size:14px"> / ${tg}</small></b><small>reviews planned</small></div>${bar(tg ? dn / tg * 100 : 0, 'var(--ac)')}<small>${bh.length} agent${bh.length === 1 ? '' : 's'} behind</small>${bh.slice(0, 4).map(z => `<div class="row li clk" onclick="reviewNow('${esc(z.a.username)}')"><span>${esc(z.a.name)}</span><small>${z.done}/${z.tg} · review now ›</small></div>`).join('')}`); }, 'How many planned reviews are done, and who is behind');
const KPIS = [['kpi_total', 12], ['kpi_avg', 12], ['kpi_pass', 12], ['kpi_fail', 12], ['kpi_trend', 12]];
DEFL.dash.all = wl(...KPIS, ['qtime', 60], ['channels', 30], ['distribution', 30], ['last5', 30], ['top', 30], ['strong', 30], ['needs', 30], ['catins', 60], ['low', 30], ['planner', 30], ['attention', 60]);
DEFL.dash.lead = wl(...KPIS, ['teams', 30], ['channels', 30], ['low', 30], ['last5', 30], ['needs', 30], ['tasks', 30], ['qflags', 30], ['attention', 60]);
DEFL.dash.trainer = wl(...KPIS, ['needs', 30], ['strong', 30], ['low', 30], ['teams', 30], ['coach_new', 60, false]);
DEFL.dash.agent = wl(['kpi_avg', 15], ['kpi_pass', 15], ['kpi_fail', 15], ['kpi_trend', 15], ['coach_new', 60], ['todo', 60], ['last5', 30], ['needs', 30], ['strong', 30], ['attention', 30]);
['admin', 'qa'].forEach(r => { DEFL.dash[r] = DEFL.dash.all; });

// the numbers every widget of a dashboard shares (the page filters); THR = the target of the team while the widgets are drawn
const dashCtxOf = () => { const cache = {}; return () => { const k = P + '|' + T + '|' + DCH; THR = T ? PT(T) : PASSG(); return cache[k] = cache[k] || dashCtx(P, T, DCH); }; };
// the Date chip and the other filters of the Dashboard (also above the preview in Home › Personalize)
function dashChips() {
  const sel = (on, opts) => opts.map(([k, n]) => `<option value="${esc(k)}" ${String(on) === String(k) ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const l = DFL(), shown = l.filter(d => d.v || DADD.includes(d.k)), can = l.filter(d => !shown.includes(d)), any = shown.length || P !== 'all';
  return `<div class=fchips><label class="fchip ${P !== 'all' ? 'set' : ''}">Date is <select onchange="P=this.value;render()">${sel(P, [['week', 'Last 7 days'], ['month', 'Last 30 days'], ['year', 'Last 12 months'], ['all', 'All time'], ['custom', 'Custom dates']])}</select></label>${P === 'custom' ? `<input type=date value=${DF} onchange="DF=this.value;render()"><input type=date value=${DT} onchange="DT=this.value;render()">` : ''}`
    + shown.map(d => `<label class="fchip ${d.v ? 'set' : ''}">${d.n} is <select id="dfc-${d.k}" onchange="dfSet('${d.k}',this.value)">${sel(d.v, [['', 'All'], ...d.o()])}</select><button type=button class=fcx onclick="dfDel('${d.k}')" title="Remove this filter">✕</button></label>`).join('')
    + (can.length ? `<span class=fadd><button type=button class="fchip fplus" onclick="DFM=!DFM;render()" aria-expanded="${DFM}">${IC.plus} Filter</button>${DFM ? `<div class=fpop role=menu>${can.map(d => `<button role=menuitem onclick="dfOpen('${d.k}')">${d.n}</button>`).join('')}</div>` : ''}</span>` : '')
    + (any ? `<a href="javascript:void(0)" class=agl onclick="dfReset()">Reset</a>` : '') + `</div>`;
}
PG.dash = function () {
  const ctxOf = dashCtxOf();
  try {
    return head('Quality Dashboard', 'Personal overview of quality performance and quick actions',
      `<div style="display:flex;gap:8px;flex-wrap:wrap"><div class=sx style="width:290px"><span>${IC.search}</span><input class=qi style="padding-right:64px" placeholder="Search agents, lead IDs, tasks, articles…" onkeydown='if(event.key=="Enter"){Q=this.value.trim();KQ=true;location.hash="calls"}'><kbd class=kb>Ctrl K</kbd></div>${bellBtn()}${langBtn()}<button class="ib ibx" onclick="viewHist()">${IC.clock} View history</button>${staff() ? `<button class="btn ibx" onclick="goPage('entry')">${IC.plus} New evaluation</button>` : ''}</div>`)
      + `<div class=hd style="margin-bottom:10px;align-items:center"><div><h2 style="margin:0;font-size:20px">Welcome back, ${esc(ME.name)} ${pill(ROLE[ME.role] || ME.role, 'ac')}</h2><p class=mu style="margin:4px 0 0">Here is a quick overview of your recent quality performance.</p></div></div>`
      + wBar('dash', dashChips()) + wGrid('dash', ctxOf, 'std');
  } finally { THR = null; }
};
// the dashboard filters that can be added with "+ Filter" (agents only see their own reviews, so they get no team / agent / reviewer filter)
let DADD = [], DFM = false;    // DADD = filters added but not chosen yet; DFM = the "+ Filter" list is open
const DFL = () => [{ k: 'type', n: 'Type', v: DCH, o: () => CHS.map(k => [k, CHP[k]]) }, ...(ME.role === 'agent' ? [] : [
  { k: 'team', n: 'Team', v: T, o: () => TEAMS.filter(t => !t.system).map(t => [t.id, t.name]) },
  { k: 'agent', n: 'Agent', v: DAG, o: () => AGENTS().filter(a => !T || a.team === T).map(a => [a.username, a.name]) },
  { k: 'rev', n: 'Reviewer', v: DRV, o: () => ROSTER.filter(r => r.active && ['qa', 'admin'].includes(r.role)).map(r => [r.username, r.name]) }]),
  { k: 'sc', n: 'Scorecard', v: DSC, o: () => SCS.map(s => [s.id, s.name]) }];
function dfVal(k, v) { if (k === 'type') DCH = v; else if (k === 'team') { T = v; DAG = ''; } else if (k === 'agent') DAG = v; else if (k === 'rev') DRV = v; else if (k === 'sc') DSC = v; }
function dfSet(k, v) { dfVal(k, v); if (!DADD.includes(k)) DADD.push(k); render(); }
function dfDel(k) { dfVal(k, ''); DADD = DADD.filter(x => x !== k); render(); }
function dfOpen(k) { DFM = false; if (!DADD.includes(k)) DADD.push(k); render(); const s = $('#dfc-' + k); if (s) { s.focus(); try { s.showPicker(); } catch (e) { /* older browsers: the list opens on the next click */ } } }
function dfReset() { P = 'all'; T = ''; DCH = ''; DRV = ''; DSC = ''; DAG = ''; DADD = []; render(); }
document.addEventListener('click', e => { if (DFM && !e.target.closest('.fadd')) { DFM = false; render(); } });

// ---------------------------------------------------------------- category charts, people and review tables
const noRev = () => `<p class=mu style="margin:0">${tr('No reviews in this period')}</p>`;
const pvc = (v, g) => v == null ? '<span class=mu>—</span>' : `<span class=pvc style="--c:${v >= g ? 'var(--ok)' : 'var(--bad)'}">${v.toFixed(1)}%</span>`;
const catOf = (l, n) => { const v = l.map(e => cpv(e, n)).filter(z => z != null); return v.length ? avg(v) : null; };
const leadLink = e => `<a href="javascript:void(0)" class=agl onclick="om('view','${e.rid}')">${esc(e.id)}</a>`;
// every category at its average, the target as a line across
function svgDots(cs, g) {
  if (!cs.length) return noRev();
  const W = 1000, H = 290, L = 150, R = 48, T = 14, B = 104, pw = W - L - R, ph = H - T - B, n = cs.length, x = i => (L + (i + 0.5) * pw / n).toFixed(1), y = v => (T + ph * (1 - v / 100)).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class=rbsvg role=img aria-label="${esc(tr('Average category scores'))}">${[0, 25, 50, 75, 100].map(v => `<line x1=${L} x2=${W - R} y1=${y(v)} y2=${y(v)} style="stroke:var(--bd)"/><text x=${L - 6} y=${+y(v) + 4} font-size=12 text-anchor=end style="fill:var(--mu)">${v}%</text>`).join('')}`
    + cs.map((z, i) => `<line x1=${x(i)} x2=${x(i)} y1=${T} y2=${T + ph} style="stroke:var(--bd)" stroke-dasharray="2 5"/>`).join('')
    + `<line x1=${L} x2=${W - R} y1=${y(g)} y2=${y(g)} style="stroke:var(--tx)" stroke-width="1.5"/><text x=${W - R + 6} y=${+y(g) + 4} font-size=13 font-weight=600 style="fill:var(--tx)">${g}%</text>`
    + cs.map((z, i) => `<circle cx=${x(i)} cy=${y(z.v)} r=8 style="fill:${z.v >= g ? 'var(--ok)' : 'var(--bad)'};stroke:var(--pn);stroke-width:2;cursor:pointer" onclick="goPage('cats')"><title>${esc(z.c)}: ${z.v.toFixed(1)}%</title></circle>`).join('')
    + cs.map((z, i) => `<text transform="translate(${x(i)},${T + ph + 18}) rotate(-35)" text-anchor=end font-size=13 style="fill:var(--mu)">${esc(z.c.length > 24 ? z.c.slice(0, 23) + '…' : z.c)}</text>`).join('') + '</svg>';
}
// a ring with the share of each part, the biggest first, and a legend beside it
function donut(rows, empty) {
  const tot = rows.reduce((a, r) => a + r.v, 0); if (!tot) return `<p class=mu style="margin:0;text-align:center">${empty}</p>`;
  const R = 70, r0 = 44, C = 80, colr = i => CATCOL[i % CATCOL.length]; let a0 = -Math.PI / 2;
  const pt = (a, r) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  const arcs = rows.length === 1 ? `<circle cx=${C} cy=${C} r=${(R + r0) / 2} fill=none stroke="${colr(0)}" stroke-width=${R - r0}><title>${esc(rows[0].n)}: 100%</title></circle>`
    : rows.map((r, i) => { const a1 = a0 + r.v / tot * 2 * Math.PI, big = a1 - a0 > Math.PI ? 1 : 0, d = `M${pt(a0, R)}A${R} ${R} 0 ${big} 1 ${pt(a1, R)}L${pt(a1, r0)}A${r0} ${r0} 0 ${big} 0 ${pt(a0, r0)}Z`; a0 = a1; return `<path d="${d}" fill="${colr(i)}"><title>${esc(r.n)}: ${(r.v / tot * 100).toFixed(1)}% (${r.v})</title></path>`; }).join('');
  return `<div class=dnut><svg viewBox="0 0 160 160" width=150 height=150 role=img aria-label="${esc(rows.map(r => r.n).join(', '))}">${arcs}</svg><div class=dnl>${rows.slice(0, 8).map((r, i) => `<div><i style="background:${colr(i)}"></i><span>${esc(r.n)}</span><b class=mono>${(r.v / tot * 100).toFixed(1)}%</b></div>`).join('')}${rows.length > 8 ? `<small class=mu>${tr(`and ${rows.length - 8} more`)}</small>` : ''}</div></div>`;
}
const countBy = (d, fn) => { const m = {}; d.forEach(e => (e.cs || []).forEach(k => { if (fn(k)) m[k.n] = (m[k.n] || 0) + 1; })); return Object.entries(m).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v); };
wdef('dash', 'catavg', 'Average category scores', 60, (c, s, x) => card(`${wt(x, 'Average category scores')} <small class=mu style="font-weight:400">${tr('the line is the target')}</small>`, svgDots([...c.cs].sort((a, b) => a.c.localeCompare(b.c)), c.g)), 'Every category at its average score, with the target as a line', 'Charts');
wdef('dash', 'catover', 'Category score over target', 30, (c, s, x) => card(wt(x, 'Category score over target'), donut(countBy(c.d, k => k.m && k.e / k.m * 100 >= c.g), tr('No category reached the target in this period'))), 'Which categories make up the ratings at or above the target', 'Categories');
wdef('dash', 'cat0', 'Category score 0%', 30, (c, s, x) => card(wt(x, 'Category score 0%'), donut(countBy(c.d, k => k.m && k.e === 0), tr('✓ No category scored 0 in this period'))), 'Which categories most often scored 0 (critical failures)', 'Categories');
wdef('dash', 'rootc', 'Root causes', 30, (c, s, x) => {
  const m = {}; c.d.forEach(e => (e.cs || []).forEach(k => (k.it || []).forEach(i => { if (i.rc && i.a !== 'y') { const key = i.rc + '\u0001' + k.n; m[key] = (m[key] || 0) + 1; } })));
  const l = Object.entries(m).map(([key, n]) => { const [rc, cat] = key.split('\u0001'); return { rc, cat, n }; }).sort((a, b) => b.n - a.n);
  return card(wt(x, 'Root causes'), l.length ? tbl(['Root cause', 'Category', 'Total count'], l.slice(0, 30).map(z => [esc(z.rc), esc(z.cat), `<b class=mono>${z.n}</b>`])) : `<p class=mu style="margin:0">${tr('No root causes chosen in this period')}</p>`);
}, 'Why points were lost: the root causes chosen in the reviews, by category', 'Categories');
wdef('dash', 'scperf', 'Scorecard performance', 30, (c, s, x) => {
  const m = {}; c.d.forEach(e => { const k = e.scn || e.scid; (m[k] = m[k] || []).push(e); });
  const rows = Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([n, l]) => [esc(n), pvc(kAvg(l), c.g), l.length, Math.round(l.filter(isPass).length / l.length * 100) + '%']);
  return card(wt(x, 'Scorecard performance'), rows.length ? tbl(['Scorecard', 'Average', 'Reviews', 'Pass rate'], rows) : noRev());
}, 'Average score, reviews and pass rate per scorecard', 'Categories');
wdef('dash', 'wsperf', 'Workspace performance', 30, (c, s, x) => {
  const rows = (WSP || []).map(w => ({ w, l: c.d.filter(e => (w.teams || []).includes(e.tm)) })).filter(z => z.l.length);
  return card(wt(x, 'Workspace performance'), rows.length ? tbl(['Workspace', 'Average', 'Reviews'], [...rows.map(z => [esc(z.w.name), pvc(kAvg(z.l), c.g), z.l.length]), [`<b>${tr('Totals')}</b>`, pvc(kAvg(c.d), c.g), `<b>${c.n}</b>`]]) : noRev());
}, 'Average score and reviews per workspace', 'People');
const byKey = (l, fn) => { const m = {}; (l || []).forEach(e => { (m[fn(e)] = m[fn(e)] || []).push(e); }); return m; };
wdef('dash', 'revperf', 'Reviewer performance', 60, (c, s, x) => {
  const cur = byKey(c.d, e => e.by), old = byKey(c.pv, e => e.by);
  const rows = Object.entries(cur).sort((a, b) => b[1].length - a[1].length).map(([u, l]) => [`<b>${esc(l[0].rv || an(u) || u)}</b>`, pvc(kAvg(l), c.g), old[u] ? ktr(kAvg(l), kAvg(old[u]), 1) : '<small class=ktn>∅</small>', l.length, l.filter(e => e.dp).length, durS(kRt(l)), l.filter(hasCm).length]);
  return card(wt(x, 'Reviewer performance'), rows.length ? tbl(['Reviewer', 'Average', 'Change', 'Reviews', 'Disputes', 'Average review time', 'With comments'], rows) : noRev());
}, 'Per reviewer: the average score they give, its change, reviews, disputes, review time and comments', 'People');
wdef('dash', 'agperf', 'Agent performance', 60, (c, s, x) => {
  const cur = byKey(c.d, e => e.agent), old = byKey(c.pv, e => e.agent);
  const rows = Object.entries(cur).map(([u, l]) => ({ u, l, a: kAvg(l) })).sort((p, q) => q.a - p.a).map(z => [`<a href="javascript:void(0)" class=agl onclick="openAgent(${jsq(z.u)})">${esc(agn(z.l[0]))}</a>`, pvc(z.a, c.g), old[z.u] ? ktr(z.a, kAvg(old[z.u]), 1) : '<small class=ktn>∅</small>', z.l.length, z.l.filter(e => !e.seen).length, z.l.filter(hasCm).length]);
  return card(wt(x, 'Agent performance'), rows.length ? tbl(['Agent', 'Average', 'Change', 'Reviews', 'Not seen yet', 'With comments'], rows) : noRev());
}, 'Per agent: the average score, its change, reviews, reviews not seen yet and comments', 'People');
wdef('dash', 'catpivot', 'Scores by category', 60, (c, s, x) => {
  const cats = [...new Set(c.d.flatMap(e => (e.cs || []).map(k => k.n)))]; if (!cats.length) return card(wt(x, 'Scores by category'), noRev());
  const ags = Object.entries(byKey(c.d, e => e.agent)).map(([u, l]) => ({ u, l, n: agn(l[0]) })).sort((a, b) => a.n.localeCompare(b.n));
  const rows = ags.map(z => [`<a href="javascript:void(0)" class=agl onclick="openAgent(${jsq(z.u)})">${esc(z.n)}</a>`, pvc(kAvg(z.l), c.g), ...cats.map(n => pvc(catOf(z.l, n), c.g))]);
  rows.push([`<b>${tr('Totals')}</b>`, pvc(kAvg(c.d), c.g), ...cats.map(n => pvc(catOf(c.d, n), c.g))]);
  return card(wt(x, 'Scores by category'), tbl(['Agent', 'Total', ...cats.map(esc)], rows));
}, 'Every agent × every category, with the totals', 'People');
wdef('dash', 'byreview', 'Scores by reviews', 60, (c, s, x) => {
  const l = [...c.d].sort((a, b) => evDay(b) - evDay(a)), dp = e => !e.dp ? '0' : e.dp.status === 'open' ? `<span style="color:var(--wn)">${tr('open')}</span>` : tr('resolved');
  return card(wt(x, 'Scores by reviews'), l.length ? tbl(['Lead', 'Review date', 'Conversation date', 'Reviewer', 'Agent', 'Score', 'Review time', 'Seen', 'Dispute'], l.slice(0, 50).map(e => [leadLink(e), e.ra ? f(e.ra) : '—', f(e.d), esc(e.rv || an(e.by) || ''), esc(agn(e)), sp(Math.round(e.sc * 10) / 10, e.tm), durS(+e.rt > 0 ? +e.rt : null), e.seen ? tr('Yes') : tr('No'), dp(e)]))
    + (l.length > 50 ? `<small class=mu>${tr(`The newest 50 of ${l.length} reviews`)}</small>` : '') : noRev());
}, 'One row per review: dates, people, score, review time, seen, dispute', 'Lists');
wdef('dash', 'rcreview', 'Ratings and root causes by reviews', 60, (c, s, x) => {
  const lost = e => (e.cs || []).filter(k => k.m && k.e < k.m), l = c.d.filter(e => lost(e).length).sort((a, b) => evDay(b) - evDay(a)).slice(0, 30);
  const chips = e => lost(e).map(k => { const rc = [...new Set((k.it || []).filter(i => i.a !== 'y' && i.rc).map(i => i.rc))], v = k.e / k.m * 100; return `<span class=rcp style="--c:${v >= THR0(e) ? 'var(--wn)' : 'var(--bad)'}"><b>${esc(k.n)}</b> ${Math.round(v)}%${rc.length ? ' · ' + esc(rc.join(', ')) : ''}</span>`; }).join(' ');
  return card(wt(x, 'Ratings and root causes by reviews'), l.length ? tbl(['Lead', 'Agent', 'Score', 'Categories that lost points, and why'], l.map(e => [leadLink(e), esc(agn(e)), sp(Math.round(e.sc * 10) / 10, e.tm), chips(e)])) : `<p class=mu style="margin:0">${tr('✓ Every category got full marks in this period')}</p>`);
}, 'For every review that lost points: which categories, and the root causes', 'Lists');
const THR0 = e => PT(e.tm);

// the groups of the widgets in Home › Personalize › Display
const WGRP = { qtime: 'Charts', cattime: 'Charts', catins: 'Categories', cat0: 'Categories', goals: 'Performance', kudos: 'Performance', csat: 'Customers', complaints: 'Customers', planner: 'Work', kpi_total: 'Numbers', kpi_avg: 'Numbers', kpi_pass: 'Numbers', kpi_fail: 'Numbers', kpi_trend: 'Numbers', kpi_flags: 'Numbers', kpi_disputes: 'Numbers', channels: 'Charts', distribution: 'Charts', teams: 'Charts', strong: 'Categories', needs: 'Categories', top: 'People', low: 'People', last5: 'Lists', attention: 'Lists', qflags: 'Lists', targets: 'Lists', tasks: 'Work', todo: 'Work', coach_new: 'Work' };
Object.entries(WGRP).forEach(([id, g]) => { if (WREG.dash[id]) WREG.dash[id].grp = g; });
