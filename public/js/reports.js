// ===================== Reports: Report builder, Saved & scheduled reports, Export centre =====================
const RB0 = () => ({ src: 'reviews', metrics: ['count', 'avg', 'pass'], rows: 'agent', cols: 'none', period: { p: 'month', f: ds(-30), t: ds(0) }, filters: { team: '', agent: '', ch: '', sc: '' }, chart: 'bars', sort: 'desc' });
let RB = { id: '', name: '', cfg: RB0() };
const RTPL = [
  ['Monthly QA report by agent', { src: 'reviews', metrics: ['count', 'avg', 'pass', 'red'], rows: 'agent', cols: 'none', period: { p: 'lastmonth' }, chart: 'bars' }],
  ['Teams month by month', { src: 'reviews', metrics: ['avg'], rows: 'team', cols: 'month', period: { p: 'year' }, chart: 'table' }],
  ['Category scores by team', { src: 'reviews', metrics: ['avg'], rows: 'category', cols: 'team', period: { p: 'quarter' }, chart: 'table' }],
  ['Score trend by week', { src: 'reviews', metrics: ['avg', 'count'], rows: 'week', cols: 'none', period: { p: 'quarter' }, chart: 'line' }],
  ['Review types compared', { src: 'reviews', metrics: ['count', 'avg', 'pass'], rows: 'type', cols: 'none', period: { p: 'month' }, chart: 'bars' }],
  ['Reviewer activity', { src: 'reviews', metrics: ['count', 'avg'], rows: 'reviewer', cols: 'month', period: { p: 'quarter' }, chart: 'table' }],
  ['Quick flags by agent', { src: 'flags', metrics: ['count', 'red', 'green'], rows: 'agent', cols: 'none', period: { p: 'month' }, chart: 'bars' }],
  ['Task completion by team', { src: 'tasks', metrics: ['count', 'done', 'overdue', 'completion'], rows: 'team', cols: 'none', period: { p: 'month' }, chart: 'bars' }],
  ['CSAT by agent', { src: 'surveys', metrics: ['count', 'csat', 'happy'], rows: 'agent', cols: 'none', period: { p: 'month' }, chart: 'bars' }],
  ['Complaints by category', { src: 'complaints', metrics: ['count', 'open', 'high'], rows: 'category', cols: 'none', period: { p: 'quarter' }, chart: 'bars' }]
];
const rbData = () => ({ ev: EV, qf: QF, tasks: TASKS, surveys: CO.surveys || [], complaints: CO.complaints || [], users: ROSTER, teams: TEAMS, pass: PT });
const rbSet = (path, v) => { const k = path.split('.'); let o = RB.cfg; while (k.length > 1) o = o[k.shift()] = o[k[0]] || {}; o[k[0]] = v; if (path === 'src') { const S = RPT.SRC[v]; RB.cfg.metrics = [Object.keys(S.metrics)[0]]; if (!S.dims.includes(RB.cfg.rows)) RB.cfg.rows = S.dims[0]; if (!S.dims.includes(RB.cfg.cols) && !['none', 'week', 'month', 'quarter'].includes(RB.cfg.cols)) RB.cfg.cols = 'none'; } render(); };
const rbMet = m => { const l = RB.cfg.metrics; RB.cfg.metrics = l.includes(m) ? (l.length > 1 ? l.filter(x => x !== m) : l) : [...l, m]; render(); };
const rbTpl = i => { const [n, c] = RTPL[i]; RB = { id: '', name: n, cfg: { ...RB0(), ...JSON.parse(JSON.stringify(c)), filters: { team: '', agent: '', ch: '', sc: '' } } }; render(); };
const rbOpen = id => { const r = (CO.reports || []).find(x => x.id === id); if (!r) return; RB = { id: r.id, name: r.name, cfg: { ...RB0(), ...JSON.parse(JSON.stringify(r.cfg || {})) } }; goPage('rbuild'); };
const fmtV = (m, v) => v == null ? '—' : ['avg', 'pass', 'fail', 'min', 'max', 'completion', 'happy'].includes(m) ? v.toFixed(1) + '%' : String(v);

// ---- charts of a result
function rbChart(res) {
  const m = res.metrics[0], rows = res.rows.filter(r => (r.total || r.cells[0])[m] != null);
  if (!rows.length || RB.cfg.chart === 'table') return '';
  const v = r => (r.total || r.cells[0])[m], mx = Math.max(...rows.map(v), 1), pct = ['avg', 'pass', 'fail', 'min', 'max', 'completion', 'happy'].includes(m), top = pct ? 100 : mx;
  if (RB.cfg.chart === 'line' && rows.length > 1) {
    const W = 760, H = 220, L = 40, B = 30, pw = W - L - 12, ph = H - B - 10, x = i => L + i * pw / (rows.length - 1), y = val => 10 + ph * (1 - val / top);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" class=rbsvg>${[0, .25, .5, .75, 1].map(f => `<line x1=${L} x2=${W - 12} y1=${y(top * f)} y2=${y(top * f)} style="stroke:var(--bd)"/><text x=${L - 6} y=${y(top * f) + 4} font-size=10 text-anchor=end style="fill:var(--mu)">${Math.round(top * f)}${pct ? '%' : ''}</text>`).join('')}<polyline fill=none stroke="var(--ac)" stroke-width=2.5 points="${rows.map((r, i) => x(i) + ',' + y(v(r))).join(' ')}"/>${rows.map((r, i) => `<circle cx=${x(i)} cy=${y(v(r))} r=4 fill="var(--ac)"><title>${esc(r.key)}: ${fmtV(m, v(r))}</title></circle><text x=${x(i)} y=${H - 10} font-size=10 text-anchor=middle style="fill:var(--mu)">${esc(String(r.key).slice(-7))}</text>`).join('')}</svg>`;
  }
  return `<div class=rbbars>${rows.slice(0, 25).map(r => `<div class=rbb><span title="${esc(r.key)}">${esc(r.key)}</span><div class=bar><i style="width:${v(r) / top * 100}%;background:${pct ? col(v(r)) : 'var(--ac)'}"></i></div><b class=mono>${fmtV(m, v(r))}</b></div>`).join('')}</div>`;
}
function rbTable(res) {
  if (!res.rows.length) return '<div class=agem>No data for this period and these filters</div>';
  if (res.colDim === 'none') return tbl([esc(res.rowName), ...res.metricNames.map(esc)], res.rows.map(r => [esc(r.key), ...res.metrics.map(m => fmtV(m, r.cells[0][m]))]).concat([[`<b>Total</b>`, ...res.metrics.map(m => `<b>${fmtV(m, res.grand[m])}</b>`)]]));
  const m = res.metrics[0];
  return `<small class=mu>Values: ${esc(res.metricNames[0])}</small>` + tbl([esc(res.rowName), ...res.colKeys.map(esc), 'Total'], res.rows.map(r => [esc(r.key), ...r.cells.map(c => c._n ? `<span style="color:${['avg', 'pass', 'completion', 'happy'].includes(m) && c[m] != null ? col(c[m]) : 'inherit'}">${fmtV(m, c[m])}</span>` : '<span class=mu>—</span>'), `<b>${fmtV(m, r.total[m])}</b>`]));
}
// ---- the builder
PG.rbuild = function () {
  const c = RB.cfg, S = RPT.SRC[c.src], res = RPT.run(c, rbData()), dims = ['none', ...S.dims, 'week', 'month', 'quarter'];
  const sel = (path, cur, opts) => `<select onchange="rbSet('${path}',this.value)">${opts.map(([k, n]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const panel = `<aside class="card rbp"><div class=cap>QUICK START</div><select onchange="if(this.value!=='')rbTpl(+this.value)"><option value="">Start from a template…</option>${RTPL.map(([n], i) => `<option value=${i}>${esc(n)}</option>`).join('')}</select>
<label>Data${sel('src', c.src, Object.entries(RPT.SRC).map(([k, s]) => [k, s.name]))}</label>
<div><b class=flb>Metrics</b><div class=tkchips>${Object.entries(S.metrics).map(([k, n]) => `<button class="tkcp ${c.metrics.includes(k) ? 'on' : ''}" onclick="rbMet('${k}')">${esc(n)}</button>`).join('')}</div></div>
<label>Rows${sel('rows', c.rows, dims.map(d => [d, RPT.DIMN[d]]))}</label><label>Columns${sel('cols', c.cols, dims.map(d => [d, RPT.DIMN[d]]))}</label>
<label>Period${sel('period.p', c.period.p, Object.entries(RPT.PERN))}</label>${c.period.p === 'custom' ? `<div class=eg2><input type=date value="${c.period.f || ''}" onchange="rbSet('period.f',this.value)"><input type=date value="${c.period.t || ''}" onchange="rbSet('period.t',this.value)"></div>` : ''}
<div class=cap style="margin-top:6px">FILTERS</div>${sel('filters.team', c.filters.team, [['', 'All teams'], ...TEAMS.filter(t => !t.system).map(t => [t.id, t.name])])}${sel('filters.agent', c.filters.agent, [['', 'All agents'], ...AGENTS().filter(a => !c.filters.team || a.team === c.filters.team).map(a => [a.username, a.name])])}${c.src !== 'tasks' ? sel('filters.ch', c.filters.ch, [['', 'All review types'], ...CHS.map(k => [k, CHP[k]])]) : ''}${c.src === 'reviews' ? sel('filters.sc', c.filters.sc, [['', 'All scorecards'], ...SCS.map(s => [s.id, s.name])]) : ''}
<div class=cap style="margin-top:6px">SHOW AS</div><div class=sg>${[['bars', 'Bars'], ['line', 'Line'], ['table', 'Table only']].map(([k, n]) => `<button class="${c.chart === k ? 'on' : ''}" onclick="rbSet('chart','${k}')">${n}</button>`).join('')}</div>
${sel('sort', c.sort, [['desc', 'Highest first'], ['asc', 'Lowest first'], ['az', 'A to Z']])}</aside>`;
  const sum = `<div class=rbsum>${res.metrics.map((m, i) => `<div><small>${esc(res.metricNames[i])}</small><b>${fmtV(m, res.grand[m])}</b></div>`).join('')}<div><small>Records</small><b>${res.n}</b></div></div>`;
  return head('Report builder', 'Pick the data, metrics, rows and columns — the report updates as you click', `<div style="display:flex;gap:8px;flex-wrap:wrap">${bellBtn()}<button class="ib ibx" onclick="RB={id:'',name:'',cfg:RB0()};render()">${IC.plus} New report</button><button class="ib ibx" onclick="rbExport()">${IC.dl} Excel</button><button class="ib ibx" onclick="rbPrint()">${IC.dl} PDF</button><button class="btn ibx" onclick="rbSave()">${RB.id ? 'Save changes' : 'Save report'}</button></div>`)
    + `<div class=rbg>${panel}<section class="card rbr"><div class=row style="flex-wrap:wrap"><div><input class=rbn value="${esc(RB.name)}" placeholder="Untitled report" oninput="RB.name=this.value"><br><small class=mu>${esc(res.srcName)} · ${esc(res.periodName)}${RB.cfg.period.p === 'all' ? '' : ' · ' + f(res.from) + ' – ' + f(new Date(Math.min(+res.to - 1, Date.now())))}</small></div>${RB.id ? `<span class=bg>Saved</span>` : ''}</div>${sum}${rbChart(res)}<div style="margin-top:10px">${rbTable(res)}</div></section></div>`;
};
function rbSave() {
  openForm({ title: RB.id ? 'Save report' : 'Save this report', w: 520, yes: 'Save', d: { name: RB.name || '', shared: (CO.reports || []).find(x => x.id === RB.id)?.shared || false },
    fields: [{ k: 'name', l: 'Report name', req: 1 }, { k: 'shared', l: 'Everyone in QA, team leads and trainers can see it', t: 'checkbox' }],
    save: async d => { if (!d.name.trim()) return 'Give the report a name'; RB.name = d.name.trim(); const old = (CO.reports || []).find(x => x.id === RB.id) || {}; const r = await api('/api/c/reports' + (RB.id ? '/' + RB.id : ''), { name: RB.name, cfg: RB.cfg, shared: d.shared, schedule: old.schedule || { freq: 'none' } }, RB.id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save the report'); RB.id = (await r.json()).id; await load(); toast('Report saved — find it in Saved & scheduled'); } });
}
async function rbExport() {
  const res = RPT.run(RB.cfg, rbData()); if (!res.rows.length) return toast('Nothing to export', true);
  const rows = res.colDim === 'none' ? [[res.rowName, ...res.metricNames], ...res.rows.map(r => [String(r.key), ...res.metrics.map(m => r.cells[0][m] == null ? '' : r.cells[0][m])])] : [[res.rowName, ...res.colKeys, 'Total'], ...res.rows.map(r => [String(r.key), ...r.cells.map(c => c[res.metrics[0]] == null ? '' : c[res.metrics[0]]), r.total[res.metrics[0]] == null ? '' : r.total[res.metrics[0]]])];
  const name = (RB.name || 'Report').slice(0, 30), r = await api('/api/export/call-reviews', { rows, pf: -1, pt: -1, dc: -1, name }); if (!r.ok) return toast('Could not create the Excel file', true);   // dc -1: a report has no date column
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name.replace(/\s+/g, '_') + '_' + iso(new Date()) + '.xlsx'; a.click();
}
function rbPrint() { const res = RPT.run(RB.cfg, rbData()), w = window.open('', '_blank'); if (!w) return toast('Please allow pop-ups to create the PDF', true); w.document.write(`<!doctype html><meta charset=utf-8><title>${esc(RB.name || 'Report')}</title><body style="margin:30px">${RPT.toHtml(res, RB.name || 'Report')}<p style="font-family:sans-serif;font-size:12px;color:#888">Q-smart · ${fdt(new Date())}</p></body>`); w.document.close(); setTimeout(() => w.print(), 400); }

// ---- saved and scheduled reports (like "Receive report" in Modjo)
const SCHN = { none: 'Not scheduled', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
PG.rsaved = function () {
  const l = (CO.reports || []), mine = l.filter(r => r.by === ME.username), other = l.filter(r => r.by !== ME.username);
  const one = r => { const s = r.schedule || {}, res = RPT.run(r.cfg || {}, rbData());
    return `<div class="card rsc"><div class=row><b style="font-size:16px">${esc(r.name)}</b>${r.shared ? pill('Shared', 'ac') : ''}</div><small class=mu>${esc(res.srcName)} · ${esc(res.periodName)} · by ${esc(r.byName || r.by)}</small>
<div class=rbsum style="margin:10px 0">${res.metrics.slice(0, 3).map((m, i) => `<div><small>${esc(res.metricNames[i])}</small><b>${fmtV(m, res.grand[m])}</b></div>`).join('')}</div>
<div class=row style="flex-wrap:wrap;gap:6px">${s.freq && s.freq !== 'none' ? `<span class=tkch style="--c:var(--ok)">${IC.clock} ${SCHN[s.freq]}${s.freq === 'weekly' ? ' on ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][+s.weekday || 1] : s.freq === 'monthly' ? ' on day ' + (s.day || 1) : ''} at ${s.hour || 8}:00 → ${esc(s.to || '—')}</span>` : '<span class=tkch>Not scheduled</span>'}${r.lastSent ? `<small class=mu>last sent ${fdt(r.lastSent)}</small>` : ''}</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class=btn onclick="rbOpen('${r.id}')">Open</button>${r.by === ME.username || ME.role === 'admin' ? `<button class="ib ibx" onclick="rsSched('${r.id}')">${IC.clock} Schedule</button><button class="ib ibx" onclick="rsSend('${r.id}')">Send now</button><button class=ic onclick="rsDel('${r.id}')" title="Delete">${IC.bin}</button>` : ''}</div></div>`; };
  return head('Saved & scheduled reports', 'Your reports, and the ones that arrive by themselves every day, week or month (as a notification, and by e-mail if you choose)', `<div style="display:flex;gap:8px">${bellBtn()}<button class="btn ibx" onclick="RB={id:'',name:'',cfg:RB0()};goPage('rbuild')">${IC.plus} New report</button></div>`)
    + (l.length ? '' : `<div class="card agem">No saved reports yet. Build one in <a href="javascript:void(0)" class=agl onclick="goPage('rbuild')">Report builder</a> and press <b>Save report</b>.</div>`)
    + (mine.length ? `<h3>My reports</h3><div class=rsg>${mine.map(one).join('')}</div>` : '') + (other.length ? `<h3>Shared with me</h3><div class=rsg>${other.map(one).join('')}</div>` : '')
    + `<p class=mu style="font-size:13px">E-mails are sent by the server at the chosen hour. They need the e-mail settings (SMTP) in the .env file; without them the e-mail is only written in the server window.</p>`;
};
const rsSched = id => { const r = CO.reports.find(x => x.id === id), s = r.schedule || {};
  openForm({ title: 'Schedule: ' + r.name, w: 520, yes: 'Save schedule', d: { freq: s.freq || 'weekly', weekday: s.weekday || 1, day: s.day || 1, hour: s.hour || 8, email: !!s.email, to: s.to || ME.email || '' },
    fields: [{ k: 'freq', l: 'Send it', t: 'select', re: 1, o: Object.entries(SCHN) }, { k: 'weekday', l: 'On', t: 'select', show: d => d.freq === 'weekly', o: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((n, i) => [i, n]) }, { k: 'day', l: 'Day of the month (1-28)', t: 'number', show: d => d.freq === 'monthly' }, { k: 'hour', l: 'At (hour, 0-23)', t: 'number', show: d => d.freq !== 'none' }, { k: 'email', l: 'Also by e-mail (it always arrives as a notification in the app)', t: 'checkbox', re: 1, show: d => d.freq !== 'none' }, { k: 'to', l: 'Send to (e-mail addresses, separated by commas)', show: d => d.freq !== 'none' && d.email }],
    save: async d => { const r2 = await api('/api/c/reports/' + id, { schedule: { freq: d.freq, weekday: +d.weekday, day: Math.min(28, Math.max(1, +d.day || 1)), hour: Math.min(23, Math.max(0, +d.hour || 8)), email: !!d.email, to: d.to } }, 'PUT'); if (!r2.ok) return errOf(r2, 'Could not save'); await load(); toast(d.freq === 'none' ? 'Schedule removed' : 'Scheduled'); } }); };
async function rsSend(id) { const r = await api('/api/c/reports/' + id + '/send', {}); if (!r.ok) return toast(await errOf(r, 'Could not send'), true); const j = await r.json(); await load(); render(); toast(`Sent to ${j.sent} address${j.sent === 1 ? '' : 'es'}`); }
const rsDel = id => ask('Delete this report?', 'The saved report and its schedule are removed.', async () => { await api('/api/c/reports/' + id, null, 'DELETE'); await load(); render(); toast('Report deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });

// ---- export centre: every Excel file made in the app, ready to download again
PG.rexp = function () {
  const l = XPS;
  return head('Export centre', 'Every Excel file made in the app — download it again any time', bellBtn())
    + card(`Exports <span class=bg>${l.length}</span>`, l.length ? tbl(['File', 'Rows', 'Made by', 'When', ''], l.map(x => [`<b>${esc(x.name)}</b>`, x.n, esc(x.byName || x.by), fdt(x.at), `<button class="ib ibx" onclick="xcGet('${x.id}')">${IC.dl} Download</button> <button class=ic onclick="xcDel('${x.id}')" title="Remove from the list">${IC.bin}</button>`])) : '<p class=mu>No exports yet. Every "Export to Excel" button in the app adds a line here.</p>');
};
async function xcGet(id) { const r = await api('/api/exports/' + id); if (!r.ok) return toast('Not found', true); const x = await r.json(); if (!x.rows) return toast('This export was too big to keep a copy (over 5000 rows)', true); const f2 = await api('/api/export/call-reviews', { rows: x.rows, pf: x.pf, pt: x.pt, dc: x.dc, name: x.name, again: true }); if (!f2.ok) return toast('Could not create the file', true); const a = document.createElement('a'); a.href = URL.createObjectURL(await f2.blob()); a.download = x.name.replace(/\s+/g, '_') + '_' + iso(new Date(x.at)) + '.xlsx'; a.click(); }
async function xcDel(id) { await api('/api/exports/' + id, null, 'DELETE'); await load(); render(); }
