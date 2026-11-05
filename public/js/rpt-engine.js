// ===================== Report engine (used by the browser AND by the server for scheduled report emails) =====================
// A report = what to count (source + metrics), split into rows and columns, limited by a period and filters.
//   cfg = { src, metrics: [..], rows, cols, period: { p, f, t }, filters: { team, agent, ch, sc }, chart, sort }
//   data = { ev, qf, tasks, surveys, complaints, users, teams, pass(teamId) }   (dates may be strings or Date objects)
(function (root) {
  const SRC = {
    reviews: { name: 'Reviews', metrics: { count: 'Number of reviews', avg: 'Average score (%)', pass: 'Pass rate (%)', fail: 'Fail rate (%)', min: 'Lowest score (%)', max: 'Highest score (%)', red: 'Red flags', green: 'Green flags', disputed: 'Disputes' },
      dims: ['agent', 'team', 'reviewer', 'type', 'scorecard', 'category', 'campaign'] },
    flags: { name: 'Quick flags', metrics: { count: 'Number of flags', red: 'Red flags', green: 'Green flags' }, dims: ['agent', 'team', 'type', 'flagger'] },
    tasks: { name: 'Tasks', metrics: { count: 'Number of tasks', done: 'Done', overdue: 'Overdue', completion: 'Completion (%)' }, dims: ['agent', 'team', 'kind'] },
    surveys: { name: 'Surveys (CSAT)', metrics: { count: 'Number of answers', csat: 'Average CSAT (1-5)', happy: 'Satisfied (4-5) %' }, dims: ['agent', 'team', 'type'] },
    complaints: { name: 'Complaints', metrics: { count: 'Number of complaints', open: 'Still open', high: 'High or critical' }, dims: ['agent', 'team', 'type', 'category', 'status'] }
  };
  const DIMN = { none: '— nothing —', agent: 'Agent', team: 'Team', reviewer: 'Reviewer', type: 'Review type', scorecard: 'Scorecard', category: 'Category', campaign: 'Campaign', flagger: 'Flagged by', kind: 'Task or target', status: 'Status', week: 'Week', month: 'Month', quarter: 'Quarter' };
  const CHN = { call: 'Calls', chat: 'Chats', email: 'Emails', other: 'Other' };
  const D = v => v instanceof Date ? v : new Date(v);
  const pad = n => String(n).padStart(2, '0'), ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function range(p, f, t, now = new Date()) {
    const y = now.getFullYear(), m = now.getMonth();
    if (p === 'week') { const a = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7)); return [a, new Date(+a + 7 * 864e5)]; }
    if (p === 'lastweek') { const a = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7) - 7); return [a, new Date(+a + 7 * 864e5)]; }
    if (p === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 1)];
    if (p === 'lastmonth') return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    if (p === 'quarter') { const q = Math.floor(m / 3) * 3; return [new Date(y, q, 1), new Date(y, q + 3, 1)]; }
    if (p === 'year') return [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
    if (p === 'last30') return [new Date(+now - 30 * 864e5), new Date(+now + 864e5)];
    if (p === 'custom' && f && t) { const b = new Date(t + 'T00:00:00'); b.setDate(b.getDate() + 1); return [new Date(f + 'T00:00:00'), b]; }
    return [new Date(0), new Date(8.64e15)];
  }
  const PERN = { week: 'This week', lastweek: 'Last week', month: 'This month', lastmonth: 'Last month', quarter: 'This quarter', year: 'This year', last30: 'Last 30 days', all: 'All time', custom: 'Custom dates' };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + pad(Math.ceil(((t - y0) / 864e5 + 1) / 7)); };

  // every source turned into simple records: { d: date, agent, team, keys: { dim: value }, vals }
  function records(src, data) {
    const nm = u => ((data.users || []).find(x => x.username === u) || {}).name || u || '—';
    const tn = id => ((data.teams || []).find(x => x.id === id) || {}).name || id || 'No team';
    const teamOf = u => ((data.users || []).find(x => x.username === u) || {}).team || '';
    if (src === 'reviews') return (data.ev || []).map(e => { const tm = e.tm || teamOf(e.agent) || e.tid; return { d: D(e.d), agent: e.agent, team: tm, ch: e.ch || 'call', sc: e.scid, e, keys: { agent: nm(e.agent), team: tn(tm), reviewer: e.rv || '—', type: CHN[e.ch || 'call'], scorecard: e.scn || '—', campaign: e.cp || 'general' } }; });
    if (src === 'flags') return (data.qf || []).map(f => ({ d: new Date(f.date + 'T12:00:00'), agent: f.agent, team: teamOf(f.agent) || f.tid, ch: f.ch || 'call', f, keys: { agent: nm(f.agent), team: tn(teamOf(f.agent) || f.tid), type: CHN[f.ch || 'call'], flagger: f.byName || f.by || '—' } }));
    if (src === 'tasks') return (data.tasks || []).map(t => ({ d: D(t.created), agent: t.assignee, team: teamOf(t.assignee), t, keys: { agent: nm(t.assignee), team: tn(teamOf(t.assignee)), kind: t.type === 'mission' ? 'Target' : 'Task' } }));
    if (src === 'surveys') return (data.surveys || []).map(s => ({ d: new Date((s.date || '') + 'T12:00:00'), agent: s.agent, team: teamOf(s.agent), ch: s.ch || 'call', s, keys: { agent: nm(s.agent), team: tn(teamOf(s.agent)), type: CHN[s.ch || 'call'] } }));
    if (src === 'complaints') return (data.complaints || []).map(c => ({ d: new Date((c.date || '') + 'T12:00:00'), agent: c.agent, team: teamOf(c.agent), ch: c.ch || 'call', c, keys: { agent: nm(c.agent), team: tn(teamOf(c.agent)), type: CHN[c.ch || 'call'], category: c.category || '—', status: c.status || 'new' } }));
    return [];
  }
  // the value of one metric for a group of records
  // with cat (a row or column per category) every number is about the same reviews: the ones in which that category was scored
  function metric(src, k, l, data, cat) {
    if (src === 'reviews') {
      if (cat) l = l.filter(r => (r.e.cs || []).some(z => z.n === cat && z.m));
      const sc = cat ? l.map(r => { const c = (r.e.cs || []).find(z => z.n === cat); return c && c.m ? c.e / c.m * 100 : null; }).filter(v => v != null) : l.map(r => r.e.sc);
      const pass = l.filter(r => r.e.sc >= (data.pass ? data.pass(r.team) : 85)).length;
      return { count: cat ? sc.length : l.length, avg: r1(avg(sc)), pass: l.length ? r1(pass / l.length * 100) : null, fail: l.length ? r1(100 - pass / l.length * 100) : null, min: sc.length ? r1(Math.min(...sc)) : null, max: sc.length ? r1(Math.max(...sc)) : null, red: l.filter(r => r.e.fl === 'red').length, green: l.filter(r => r.e.fl === 'green').length, disputed: l.filter(r => r.e.dp).length }[k];
    }
    if (src === 'flags') return { count: l.length, red: l.filter(r => r.f.type === 'red').length, green: l.filter(r => r.f.type === 'green').length }[k];
    if (src === 'tasks') { const dn = l.filter(r => r.t.status === 'done').length, today = ymd(new Date()); return { count: l.length, done: dn, overdue: l.filter(r => r.t.status !== 'done' && r.t.due && r.t.due < today).length, completion: l.length ? r1(dn / l.length * 100) : null }[k]; }
    if (src === 'surveys') { const s = l.map(r => +r.s.score).filter(v => v > 0); return { count: l.length, csat: s.length ? Math.round(avg(s) * 100) / 100 : null, happy: s.length ? r1(s.filter(v => v >= 4).length / s.length * 100) : null }[k]; }
    if (src === 'complaints') return { count: l.length, open: l.filter(r => r.c.status !== 'resolved').length, high: l.filter(r => ['high', 'critical'].includes(r.c.severity)).length }[k];
    return null;
  }
  function run(cfg, data) {
    const src = SRC[cfg.src] ? cfg.src : 'reviews', S = SRC[src], mets = (cfg.metrics || []).filter(m => S.metrics[m]);
    if (!mets.length) mets.push(Object.keys(S.metrics)[0]);
    const [a, b] = range((cfg.period || {}).p || 'month', (cfg.period || {}).f, (cfg.period || {}).t), fl = cfg.filters || {};
    let l = records(src, data).filter(r => r.d >= a && r.d < b && (!fl.team || r.team === fl.team) && (!fl.agent || r.agent === fl.agent) && (!fl.ch || r.ch === fl.ch) && (!fl.sc || r.sc === fl.sc));
    const rowDim = cfg.rows || 'none', colDim = cfg.cols || 'none';
    const keyOf = (r, dim) => dim === 'week' ? isoWeek(r.d) : dim === 'month' ? r.d.getFullYear() + '-' + pad(r.d.getMonth() + 1) : dim === 'quarter' ? r.d.getFullYear() + ' Q' + (Math.floor(r.d.getMonth() / 3) + 1) : dim === 'none' ? 'Total' : (r.keys[dim] || '—');
    // "category" splits every review into its categories
    const cats = src === 'reviews' && (rowDim === 'category' || colDim === 'category') ? [...new Set(l.flatMap(r => (r.e.cs || []).map(c => c.n)))] : null;
    const rowKeys = rowDim === 'category' ? cats : [...new Set(l.map(r => keyOf(r, rowDim)))];
    const colKeys = colDim === 'category' ? cats : [...new Set(l.map(r => keyOf(r, colDim)))].sort();
    const cell = (rk, ck) => { const sub = l.filter(r => (rowDim === 'category' || keyOf(r, rowDim) === rk) && (colDim === 'category' || keyOf(r, colDim) === ck)); const cat = rowDim === 'category' ? rk : colDim === 'category' ? ck : null; const o = {}; mets.forEach(m => { o[m] = metric(src, m, sub, data, cat); }); o._n = sub.length; return o; };
    let rows = rowKeys.map(rk => ({ key: rk, cells: colKeys.map(ck => cell(rk, ck)), total: colDim === 'none' ? null : (() => { const sub = l.filter(r => rowDim === 'category' || keyOf(r, rowDim) === rk), o = {}; mets.forEach(m => { o[m] = metric(src, m, sub, data, rowDim === 'category' ? rk : null); }); return o; })() }));
    const first = mets[0], val = r => { const c = r.total || r.cells[0] || {}; return c[first] == null ? -1e9 : c[first]; };
    if (['week', 'month', 'quarter'].includes(rowDim)) rows.sort((x, y) => String(x.key).localeCompare(String(y.key)));
    else if (cfg.sort === 'asc') rows.sort((x, y) => val(x) - val(y)); else if (cfg.sort === 'az') rows.sort((x, y) => String(x.key).localeCompare(String(y.key))); else rows.sort((x, y) => val(y) - val(x));
    if (cfg.limit) rows = rows.slice(0, cfg.limit);
    const grand = {}; mets.forEach(m => { grand[m] = metric(src, m, l, data, null); });
    return { src, srcName: S.name, metrics: mets, metricNames: mets.map(m => S.metrics[m]), rowDim, colDim, rowName: DIMN[rowDim], colName: DIMN[colDim], rows, colKeys, grand, n: l.length, from: a, to: b, periodName: PERN[(cfg.period || {}).p || 'month'] || '' };
  }
  // a plain HTML table of a result (used in the scheduled emails and the PDF print); names and titles are typed by people, so they are escaped
  function toHtml(res, title) {
    const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
    const fmt = v => v == null ? '—' : h(v);
    const head = res.colDim === 'none' ? res.metricNames.map(n => `<th>${h(n)}</th>`).join('') : res.colKeys.map(c => `<th>${h(c)}</th>`).join('') + '<th>Total</th>';
    const body = res.rows.map(r => `<tr><td>${h(r.key)}</td>${res.colDim === 'none' ? res.metrics.map(m => `<td>${fmt(r.cells[0][m])}</td>`).join('') : r.cells.map(c => `<td>${fmt(c[res.metrics[0]])}</td>`).join('') + `<td>${fmt(r.total[res.metrics[0]])}</td>`}</tr>`).join('');
    return `<h2 style="font-family:sans-serif">${h(title)}</h2><p style="font-family:sans-serif;color:#555">${h(res.srcName)} · ${h(res.periodName)} · ${res.n} records${res.colDim === 'none' ? '' : ' · ' + h(res.metricNames[0])}</p><table border=1 cellpadding=6 style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><tr><th>${h(res.rowName)}</th>${head}</tr>${body}</table>`;
  }
  const api = { SRC, DIMN, PERN, range, run, toHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RPT = api;
})(typeof window !== 'undefined' ? window : globalThis);
