// ===================== Agents: one place for everything about an agent (reviews, categories, flags, disputes, one-to-ones, coaching, tasks, simulations) =====================
// The page only READS what the other sections already store, so every number here matches Call Reviews, Quick Flags, Disputes, One-to-One, Coaching, Tasks and the Call Simulator.
let AG = { q: '', t: '', agent: '', p: 'month', f: ds(-30), to: ds(0), sc: '', ch: '', tab: 'perf', sk: 'd', sd: -1, pn: 1, ps: 10 };
let SIMS = [];

const AIC = {
  perf: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', 15),
  calls: svg('<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>', 15),
  flag: svg('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>', 15),
  o2o: svg('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>', 15),
  sim: svg('<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>', 15),
  cal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 17),
  card: svg('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>', 14),
  pdf: svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6"/>', 16),
  go: svg('<path d="M9 6l6 6-6 6"/>', 16)
};

// ---- who may look at whom (agents only at themselves, team leads at the agents of their teams, everybody else at all agents they can see)
const agLookable = () => { const all = AGENTS(); if (ME.role === 'agent') return all.filter(a => a.username === ME.username); if (ME.role === 'lead') { const mine = TEAMS.filter(t => t.lead === ME.username).map(t => t.id); return all.filter(a => mine.includes(a.team)); } return all; };

// ---- periods: calendar based (this week / month / quarter / year), "shift" 1 = the one before
const agRange = (p, shift = 0) => {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (p === 'week') { const d = new Date(y, m, n.getDate() - ((n.getDay() + 6) % 7) - 7 * shift), e = new Date(d); e.setDate(d.getDate() + 7); return [d, e]; }
  if (p === 'month') return [new Date(y, m - shift, 1), new Date(y, m - shift + 1, 1)];
  if (p === 'q') { const q = Math.floor(m / 3) * 3 - 3 * shift; return [new Date(y, q, 1), new Date(y, q + 3, 1)]; }
  if (p === 'year') return [new Date(y - shift, 0, 1), new Date(y - shift + 1, 0, 1)];
  if (p === 'custom') { const a = new Date(AG.f + 'T00:00:00'), b = new Date(AG.to + 'T00:00:00'); b.setDate(b.getDate() + 1); const L = b - a; return [new Date(+a - L * shift), new Date(+b - L * shift)]; }
  return shift ? null : [new Date(0), new Date(8.64e15)];
};
const agIn = (e, r) => !!r && e.d >= r[0] && e.d < r[1];
const MON = d => d.toLocaleString(I18N.locale(), { month: 'short' });
const agLabel = () => { const [a, b] = agRange(AG.p), e = new Date(b - 1); return { week: 'Week of ' + a.getDate() + ' ' + MON(a), month: MON(a) + ' ' + a.getFullYear(), q: 'Q' + (Math.floor(a.getMonth() / 3) + 1) + ' ' + a.getFullYear(), year: String(a.getFullYear()), all: 'All time', custom: f(a) + ' – ' + f(e) }[AG.p]; };
const agPrevLabel = () => { const r = agRange(AG.p, 1); if (!r) return ''; const a = r[0]; return { week: 'last week', month: MON(a), q: 'Q' + (Math.floor(a.getMonth() / 3) + 1), year: String(a.getFullYear()), custom: 'previous period' }[AG.p]; };
const agTitle = () => ({ week: 'Current Week', month: 'Current Month', q: 'Current Quarter', year: 'Current Year', all: 'All Time', custom: 'Selected Period' })[AG.p];

const agPct = (l, k) => l.length ? l.filter(isPass).length / l.length * 100 : null;
const agCat = (l, c) => { const v = l.map(e => cpv(e, c)).filter(x => x != null); return v.length ? avg(v) : null; };
const agLevel = v => v >= gthr() ? ['Excellent', 'var(--ok)'] : v >= 70 ? ['Good', 'var(--wn)'] : ['Needs Improvement', 'var(--bad)'];
const agDelta = (d, unit, vs) => d == null ? '' : `<small class="agd ${Math.abs(d) < .05 ? '' : d > 0 ? 'up' : 'dn'}">${Math.abs(d) < .05 ? '=' : d > 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)}${unit} vs ${esc(vs)}</small>`;

// ---- go to one agent from anywhere in the app (Call Reviews, Flags, Disputes, Team Review, Coaching ...)
const agLink = (u, name, tab) => `<a href="javascript:void(0)" class=agl onclick="openAgent('${esc(u)}'${tab ? `,'${tab}'` : ''})" title="Open the agent profile">${esc(name || an(u) || u)}</a>`;
function openAgent(u, tab) { AG.agent = u; AG.t = ''; AG.sc = ''; AG.pn = 1; AG.q = ''; if (tab) AG.tab = tab; if (location.hash === '#agents') render(); else location.hash = 'agents'; }
const agSet = (k, v) => { AG[k] = v; AG.pn = 1; if (k === 'agent') { AG.sc = ''; AG.q = ''; } if (k === 't') { const o = agLookable().filter(a => !AG.t || a.team === AG.t); if (!o.some(a => a.username === AG.agent)) AG.agent = (o[0] || {}).username || ''; AG.sc = ''; } render(); };

// ---- data of the chosen agent for the chosen period (everything the page shows comes from this)
function agData(u) {
  const rc = agRange(AG.p), rp = agRange(AG.p, 1), mine = EV.filter(e => e.agent === u.username), inCur = mine.filter(e => agIn(e, rc)), inPrev = mine.filter(e => agIn(e, rp));
  const scs = {}; inCur.forEach(e => { const k = e.scid || ''; (scs[k] = scs[k] || { id: k, n: e.scn || 'Scorecard', l: [] }).l.push(e); });
  if (AG.sc && !scs[AG.sc]) AG.sc = '';
  const ok = e => (!AG.sc || (e.scid || '') === AG.sc) && (!AG.ch || chOf(e) === AG.ch), cur = inCur.filter(ok), prev = inPrev.filter(ok);
  const team = EV.filter(e => e.tm === u.team && agIn(e, rc) && ok(e)), teamPrev = EV.filter(e => e.tm === u.team && agIn(e, rp) && ok(e));
  const flags = cur.filter(e => e.fl), disp = cur.filter(e => e.dp);
  const ses = SESS.filter(s => s.agents.includes(u.username)), inR = s => { const d = new Date(s.date + 'T12:00:00'); return d >= rc[0] && d < rc[1]; };
  const sims = SIMS.filter(s => s.agent === u.username && agIn({ d: new Date(s.date) }, rc));
  return { rc, rp, mine, inCur, chBase: inCur.filter(e => !AG.sc || (e.scid || '') === AG.sc), cur, prev, team, teamPrev, scs: Object.values(scs), flags, disp, o2o: ses.filter(s => s.kind === 'o2o' && inR(s)).sort((a, b) => b.date.localeCompare(a.date)), coach: ses.filter(s => s.kind !== 'o2o' && inR(s)).sort((a, b) => b.date.localeCompare(a.date)), sims, tasks: TASKS.filter(t => t.assignee === u.username && !t.archived) };
}

// ---- charts

function agRadar(names, a, t) {
  const W = 760, H = 380, cx = W / 2, cy = 190, R = 122, n = names.length, ang = i => -Math.PI / 2 + i * 2 * Math.PI / n, P = (i, v) => [cx + Math.cos(ang(i)) * R * v / 100, cy + Math.sin(ang(i)) * R * v / 100], poly = (arr) => arr.map((v, i) => P(i, v || 0).map(x => x.toFixed(1)).join(',')).join(' ');
  const rings = [20, 40, 60, 80, 100].map(r => `<polygon points="${names.map((_, i) => P(i, r).map(x => x.toFixed(1)).join(',')).join(' ')}" fill="none" style="stroke:var(--bd)"/>`).join('');
  const axes = names.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${P(i, 100)[0].toFixed(1)}" y2="${P(i, 100)[1].toFixed(1)}" style="stroke:var(--bd)"/>`).join('');
  const ticks = [20, 40, 60, 80, 100].map(r => `<text x="${cx + 3}" y="${cy - R * r / 100 + 3}" font-size="9" style="fill:var(--mu)">${r}%</text>`).join('');
  const labels = names.map((nm, i) => { const [x, y] = P(i, 100), c = Math.cos(ang(i)), s = Math.sin(ang(i)), lx = x + c * 14, ly = y + s * 14 + 4; return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="13" text-anchor="${c > .3 ? 'start' : c < -.3 ? 'end' : 'middle'}" style="fill:var(--ac)">${esc(nm)}</text>`; }).join('');
  const dots = (arr, c) => arr.map((v, i) => v == null ? '' : `<circle cx="${P(i, v)[0].toFixed(1)}" cy="${P(i, v)[1].toFixed(1)}" r="5" fill="${c}" stroke="#fff" stroke-width="1.5"><title>${esc(names[i])}: ${v.toFixed(0)}%</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Category performance radar">${rings}${axes}${ticks}<polygon points="${poly(t)}" fill="#f97316" fill-opacity=".22" stroke="#f97316" stroke-width="1.5"/><polygon points="${poly(a)}" fill="#3b82f6" fill-opacity=".18" stroke="#3b82f6" stroke-width="2"/>${dots(t, '#f97316')}${dots(a, '#3b82f6')}${labels}</svg>`
    + `<div class=agleg><span><i style="background:#3b82f6"></i>Agent</span><span><i style="background:#f97316"></i>Team Average</span></div>`;
}

// one wide bar per period, never one per review: a week shows its days, a month its weeks (Week 1-4), a quarter weeks,
// a year (or all time) months; custom dates choose by their length. Hovering a bar shows the period, a click zooms into it.
let AGB = [];                                                  // the bars drawn right now (for the preview and the zoom)
function agBuckets(a, b, p) {
  const DAY = 864e5, days = Math.max(1, Math.round((b - a) / DAY)), dm = d => d.getDate() + ' ' + MON(d), out = [];
  const unit = p === 'week' ? 'day' : p === 'month' ? 'mweek' : p === 'q' ? 'week' : p === 'year' || p === 'all' ? 'month' : days <= 14 ? 'day' : days <= 92 ? 'week' : 'month';
  if (unit === 'month') for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d < b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ s: d, e: new Date(d.getFullYear(), d.getMonth() + 1, 1), t: MON(d) + (days > 400 ? " '" + String(d.getFullYear()).slice(2) : ''), long: d.toLocaleString(I18N.locale(), { month: 'long', year: 'numeric' }) });
  else if (unit === 'mweek') for (let i = 0; i < 4; i++) { const s = new Date(a.getFullYear(), a.getMonth(), 1 + 7 * i), e = i < 3 ? new Date(a.getFullYear(), a.getMonth(), 8 + 7 * i) : new Date(b); out.push({ s, e, w: i + 1, long: dm(s) + ' – ' + dm(new Date(e - DAY)) }); }   // 1-7, 8-14, 15-21, 22 to the end
  else { const step = unit === 'day' ? 1 : 7; for (let d = new Date(a); d < b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)) { const e = new Date(Math.min(+b, +new Date(d.getFullYear(), d.getMonth(), d.getDate() + step))); out.push({ s: d, e, t: unit === 'day' ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : dm(d), long: unit === 'day' ? f(d) : dm(d) + ' – ' + dm(new Date(e - DAY)) }); } }
  const last = out[out.length - 1], prev = out[out.length - 2];   // a few days left at the end (e.g. 29-31) join the week before, instead of a tiny bar of their own
  if (unit === 'week' && prev && last.e - last.s < 4 * DAY) { prev.e = last.e; prev.long = dm(prev.s) + ' – ' + dm(new Date(prev.e - DAY)); out.pop(); }
  return out;
}
function agChart(l, rc, pass) {
  agTipOff();
  const W = 900, H = 300, L = 46, Rg = 70, T = 14, B = 46, pw = W - L - Rg, ph = H - T - B, DAY = 864e5;
  let a = rc[0], b = rc[1];
  if (AG.p === 'all') { a = l.length ? new Date(Math.min(...l.map(e => +e.d))) : new Date(); a = new Date(a.getFullYear(), a.getMonth(), 1); b = new Date(Math.max(Date.now(), ...l.map(e => +e.d)) + DAY); }
  const bk = AGB = agBuckets(a, b, AG.p);
  bk.forEach(k => { k.l = l.filter(e => e.d >= k.s && e.d < k.e); k.avg = k.l.length ? avg(k.l.map(e => e.sc)) : null; });
  const bw = pw / bk.length, y = v => T + ph * (1 - v / 100), pts = [];
  const grid = [0, 20, 40, 60, 80, 100].map(v => `<line x1="${L}" x2="${W - Rg}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--bd)"/><text x="${L - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" style="fill:var(--mu)">${v}%</text>`).join('');
  const bars = bk.map((k, i) => { if (k.avg == null) return ''; const w = Math.min(64, Math.max(6, bw * .62)), x = L + i * bw + (bw - w) / 2, c = k.avg >= pass ? 'var(--ok)' : 'var(--wn)'; pts.push([x + w / 2, k.avg]);
    return `<g class=agb tabindex=0 role=button aria-label="${esc(k.long)}: ${k.avg.toFixed(1)}%" onmouseenter="agTip(event,${i})" onmousemove="agTip(event,${i})" onmouseleave="agTipOff()" onfocus="agTip(event,${i})" onblur="agTipOff()" onclick="agZoom(${i})"><rect x="${x.toFixed(1)}" y="${y(k.avg).toFixed(1)}" width="${w.toFixed(1)}" height="${(ph * k.avg / 100).toFixed(1)}" rx="5" style="fill:${c}" fill-opacity=".35"/><circle cx="${(x + w / 2).toFixed(1)}" cy="${y(k.avg).toFixed(1)}" r="4.5" fill="#e5e7eb" stroke="#64748b"/></g>`;
  }).join('');
  const every = Math.ceil(bk.length / 14), xl = bk.map((k, i) => i % every ? '' : `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 24}" font-size="11" text-anchor="middle" style="fill:var(--mu)">${k.w ? `<tspan>Week</tspan> ${k.w}` : esc(k.t)}</text><text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 10}" font-size="10" text-anchor="middle" style="fill:var(--mu)">(${k.l.length})</text>`).join('');
  let trend = ''; if (pts.length > 1) { const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0), sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), d = n * sxx - sx * sx; if (d) { const m = (n * sxy - sx * sy) / d, c = (sy - m * sx) / n, x1 = pts[0][0], x2 = pts[n - 1][0], cl = v => Math.max(0, Math.min(100, v)); trend = `<line x1="${x1.toFixed(1)}" y1="${y(cl(m * x1 + c)).toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y(cl(m * x2 + c)).toFixed(1)}" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>`; } }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Score evolution">${grid}<line x1="${L}" x2="${W - Rg + 6}" y1="${y(pass)}" y2="${y(pass)}" style="stroke:var(--ok)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - Rg + 10}" y="${y(pass) + 4}" font-size="11" style="fill:var(--ok)">Pass (${pass}%)</text>${bars}${trend}${xl}</svg>`
    + `<div class=agleg><span><i style="background:var(--ok)"></i>≥${pass}% (Pass)</span><span><i style="background:var(--wn)"></i>&lt;${pass}% (Needs improvement)</span><span><i style="background:#94a3b8;height:3px;width:16px;border-radius:2px"></i>Trend Line</span></div>`;
}

// the preview of one bar (mouse over it, or keyboard focus): the period, its average, reviews, pass rate and every category
function agTip(ev, i) {
  const k = AGB[i]; if (!k) return;
  let t = $('#agtip'); if (!t) { t = document.createElement('div'); t.id = 'agtip'; t.className = 'agtip'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); }
  const u = ROSTER.find(r => r.username === AG.agent), tm = u ? u.team : null, n = k.l.length, cats = CATS(k.l).map(c => [c, agCat(k.l, c)]).filter(x => x[1] != null);
  t.innerHTML = `<b class=atip-t>${esc(k.long)}</b>` + (n ? `<div class=atip-r><span>Average score</span><b style="color:${scol(k.avg, tm)}">${k.avg.toFixed(1)}%</b></div><div class=atip-r><span>Reviews</span><b>${n}</b></div><div class=atip-r><span>Pass rate</span><b>${(k.l.filter(isPass).length / n * 100).toFixed(0)}%</b></div>`
    + (cats.length ? `<div class=atip-c><small>Categories</small>${cats.map(([c, v]) => `<div class=atip-r><span data-noi18n>${esc(c)}</span><b style="color:${scol(v, tm)}">${v.toFixed(0)}%</b></div>`).join('')}</div>` : '') + `<small class=atip-h>Click to see this period in detail</small>` : `<div class=mu>No reviews</div>`);
  t.style.display = 'block';
  const r = ev.type === 'focus' ? ev.target.getBoundingClientRect() : null, cx = r ? r.left + r.width / 2 : ev.clientX, cy = r ? r.top : ev.clientY, w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.max(8, Math.min(innerWidth - w - 8, cx + 16)) + 'px';
  t.style.top = Math.max(8, Math.min(innerHeight - h - 8, cy - h - 14 < 8 ? cy + 20 : cy - h - 14)) + 'px';
}
function agTipOff() { const t = $('#agtip'); if (t) t.style.display = 'none'; }
// a click on a bar zooms into its period (a year shows the weeks of the month you clicked, a week its days); one day with one review opens it
function agZoom(i) {
  const k = AGB[i], DAY = 864e5; if (!k || !k.l.length) return; agTipOff();
  if (k.e - k.s <= DAY + 36e5 && k.l.length === 1) return om('view', k.l[0].rid);
  AG.p = 'custom'; AG.f = iso(k.s); AG.to = iso(new Date(k.e - DAY)); AG.pn = 1; render();
}

// ---- the table of calls (own sorting, search and paging; only this block is redrawn while typing)
const AGS = { id: e => String(e.id).toLowerCase(), cp: e => cpn(e), d: e => +e.d, sc: e => e.sc };
const agCalls = d => { const q = AG.q.toLowerCase(), g = AGS[AG.sk] || AGS.d; return d.cur.filter(e => !q || String(e.id).toLowerCase().includes(q) || cpn(e).toLowerCase().includes(q)).sort((x, y) => { const a = g(x), b = g(y); return (a > b ? 1 : a < b ? -1 : 0) * AG.sd; }); };
function agTbl() {
  const u = ROSTER.find(r => r.username === AG.agent); if (!u) return '';
  const d = agData(u), l = agCalls(d), n = l.length, pc = Math.max(1, Math.ceil(n / AG.ps)); if (AG.pn > pc) AG.pn = pc;
  const a = (AG.pn - 1) * AG.ps, pg = l.slice(a, a + AG.ps), ar = k => k === AG.sk ? (AG.sd > 0 ? '▲' : '▼') : '↕';
  const th = (k, t) => `<th style="cursor:pointer" onclick="agSort('${k}')">${t} <span style="opacity:${k === AG.sk ? 1 : .4}">${ar(k)}</span></th>`;
  THR = PT(u.team);
  const out = `<div class=sc><table class=ct><tr>${th('id', 'LEAD ID')}<th>TYPE</th>${th('cp', 'CAMPAIGN')}${th('d', 'DATE')}${th('sc', 'SCORE')}<th>FLAG</th><th>STATUS</th><th style="text-align:right">ACTIONS</th></tr>`
    + pg.map(e => `<tr><td><a href="javascript:void(0)" class=mono style="color:var(--ac);font-weight:600;text-decoration:none" onclick="om('view','${e.rid}')">${esc(e.id)}</a></td><td>${chTag(chOf(e))}</td><td>${esc(cpn(e).slice(11) || 'general')}</td><td>${f(e.d)}</td><td><b class=mono style="color:${scol(e.sc, e.tm)}">${Math.round(e.sc)}%</b></td><td>${e.fl ? `<span class="fgv ${e.fl}" title="${e.fl} flag">${IC.flag}</span>` : '<span class=mu>—</span>'}</td><td>${e.st === 'disputed' ? pill('Disputed', 'wn') : pill('Completed', 'ok')}</td><td style="text-align:right;white-space:nowrap">${e.rec || /^https?:\/\//.test(e.rl || '') ? `<button class=ic onclick="ply('${e.rid}')" title="Play recording">${IC.play}</button>` : ''}<button class=ic onclick="om('view','${e.rid}')" title="View">${IC.eye}</button></td></tr>`).join('')
    + (pg.length ? '' : `<tr><td colspan=8 class=mu style="padding:22px;text-align:center">No reviews match</td></tr>`) + `</table></div>`
    + `<div class=agpg><small>${n ? `Showing ${a + 1} to ${Math.min(a + AG.ps, n)} of ${n} reviews` : 'No reviews'}</small><div style="display:flex;gap:6px"><button class=pb ${AG.pn <= 1 ? 'disabled' : ''} onclick="agPage(${AG.pn - 1})">Previous</button><button class=pb ${AG.pn >= pc ? 'disabled' : ''} onclick="agPage(${AG.pn + 1})">Next</button></div></div>`;
  THR = null; return out;
}
const agRt = () => { const t = $('#agtb'); if (t) t.innerHTML = agTbl(); };
const agSort = k => { if (AG.sk === k) AG.sd = -AG.sd; else { AG.sk = k; AG.sd = (k === 'd' || k === 'sc') ? -1 : 1; } AG.pn = 1; agRt(); };
const agPage = p => { AG.pn = p; agRt(); };
const agQ = el => {
  AG.q = el.value; AG.pn = 1;
  if (AG.tab !== 'calls') { AG.tab = 'calls'; render(); const i = $('.agtool input'); if (i) { i.focus(); i.setSelectionRange(99, 99); } return; }
  $('.agsearch input').forEach(i => { if (i !== el) i.value = AG.q; }); agRt();
};

// ---- tabs
const agStat = (n, t, c) => `<div class=agst style="--c:${c}"><b>${n}</b><small>${t}</small></div>`;
const agRow = (ic, title, sub, right, click) => `<div class="agrow ${click ? 'clk' : ''}" ${click ? `onclick="${click}"` : ''}><span class=agri>${ic}</span><div style="min-width:0;flex:1"><b>${title}</b><br><small>${sub}</small></div><div style="display:flex;gap:8px;align-items:center">${right || ''}${click ? `<span class=mu>${AIC.go}</span>` : ''}</div></div>`;

function agPerf(u, d) {
  const names = CATS(d.cur), rows = names.map(c => { const xs = d.cur.map(e => (e.cs || []).find(z => z.n === c)).filter(z => z && z.m > 0); return { c, n: xs.length, a: agCat(d.cur, c), t: agCat(d.team, c), e: avg(xs.map(z => z.e)), m: avg(xs.map(z => z.m)) }; }).filter(r => r.a != null);
  if (!rows.length) return `<div class="agem">No scored categories in ${esc(agLabel())}</div>`;
  const radar = rows.length >= 3 ? agRadar(rows.map(r => r.c), rows.map(r => r.a), rows.map(r => r.t)) : '<p class=mu>Not enough categories for a radar chart</p>';
  const brk = rows.map(r => { const [lv, c] = agLevel(r.a); return `<div class=agbk><div class=row><b>${esc(r.c)}</b><b class=mono style="color:${c}">${Math.round(r.e)}/${Math.round(r.m)}</b></div>${bar(r.a, c)}<small>${lv} (${Math.round(r.a)}%)</small></div>`; }).join('');
  const cmp = rows.map(r => { const df = r.t == null ? null : Math.round(r.a) - Math.round(r.t), [, c] = agLevel(r.a); return `<div class=agcm><div class=row style="flex-wrap:wrap"><span><b>${esc(r.c)}</b> <small>(${r.n} evals)</small></span><span style="display:flex;gap:8px;align-items:center"><small>Agent: <b style="color:#60a5fa">${Math.round(r.a)}%</b></small><small>Team: <b style="color:#f59e0b">${r.t == null ? '—' : Math.round(r.t) + '%'}</b></small>${df == null ? '' : `<span class="pill ${df >= 0 ? 'ok' : 'bad'}">${df >= 0 ? '+' : ''}${df}%</span>`}</span></div><div class=agtr><i style="width:${Math.min(100, r.a)}%;background:${c}"></i>${r.t == null ? '' : `<em style="left:${Math.min(100, r.t)}%" title="Team average ${Math.round(r.t)}%"></em>`}</div></div>`; }).join('');
  return `<div class=agg2><div><h3>Category Performance — Agent vs Team</h3>${radar}</div><div><h3>Category Breakdown</h3>${brk}</div></div><div style="margin-top:22px"><h3>Agent vs Team Average Comparison</h3>${cmp}</div>`;
}
function agCallsTab(u, d) {
  THR = PT(u.team); const ch = d.cur.length ? agChart(d.cur, d.rc, PT(u.team)) : `<div class="agem">No reviews in ${esc(agLabel())}</div>`; THR = null;
  return `<h3>Score Evolution — ${agTitle()}</h3>${ch}<div class=agtool><div class="sx agsearch" style="width:300px"><span>${IC.search}</span><input placeholder="Search lead ID or campaign…" value="${esc(AG.q)}" oninput="agQ(this)"></div><a href="javascript:void(0)" class=agl onclick="goCalls({agent:'${esc(u.username)}',ch:AG.ch})">Open in Reviews ›</a></div><div id=agtb>${agTbl()}</div>`;
}
function agFlagsTab(u, d) {
  const r = d.flags.filter(e => e.fl === 'red').length, g = d.flags.length - r;
  const rows = [...d.flags].sort((a, b) => b.d - a.d).map(e => `<div class="agfl ${e.fl}" onclick="om('view','${e.rid}')"><span class="fgv ${e.fl}">${IC.flag}</span><a href="javascript:void(0)" class=mono style="font-weight:600;color:var(--ac);text-decoration:none">Lead ${esc(e.id)}</a><small>QA Review${e.cm ? ' · ' + esc(String(e.cm).slice(0, 80)) : ''}</small><span style="margin-left:auto;display:flex;gap:12px;align-items:center"><small>${f(e.d)}</small>${IC.eye}</span></div>`).join('');
  const dl = d.disp.length ? `<h3 style="margin-top:22px">Disputes <span class=bg>${d.disp.length}</span></h3>` + d.disp.map(e => agRow(IC.flag, `Lead ${esc(e.id)}`, `Disputed ${f(new Date(e.dp.at))} · score ${e.sc}%`, dispPill(e), `om('view','${e.rid}')`)).join('') : '';
  return `<div class=agfh><span style="color:var(--bad)">${IC.flag}<b>${r} Red</b></span><span style="color:var(--ok)">${IC.flag}<b>${g} Green</b></span><a href="javascript:void(0)" class=agl style="margin-left:auto" onclick="XF.a='${esc(u.username)}';XF.t='${esc(u.team)}';goPage('flags')">Open Quick Flags ›</a></div>${rows || `<div class="agem">No flags in ${esc(agLabel())}</div>`}${dl}`;
}
function agO2oTab(u, d) {
  const done = d.o2o.filter(s => s.status !== 'planned'), acts = [...d.o2o, ...d.coach].flatMap(s => s.actions || []), open = d.tasks.filter(t => t.status !== 'done');
  const one = s => { const a = s.actions || [], dn = a.filter(x => x.done).length; return agRow(`<span style="color:${s.status === 'planned' ? 'var(--wn)' : 'var(--ok)'}">${s.status === 'planned' ? IC.clock : IC.check}</span>`, `${esc(s.title)} ${s.status === 'planned' ? pill('Planned', 'wn') : pill('Completed', 'ok')} ${pill(KIND[s.kind][0], KIND[s.kind][1])}`, `By ${esc(s.byName || '—')} · ${s.date}${(s.topics || []).length ? ' · ' + esc(s.topics.join(', ')) : ''}`, a.length ? `<span class="pill ${dn === a.length ? 'ok' : 'wn'}">${dn}/${a.length} actions</span>` : '', `viewSession('${s.id}')`); };
  return `<div class=agsts>${agStat(d.o2o.length, 'Total Sessions', '#3b82f6')}${agStat(done.length, 'Completed', '#10b981')}${agStat(d.o2o.length - done.length, 'Planned', '#f59e0b')}${agStat(acts.filter(a => a.done).length + '/' + acts.length, 'Actions done', '#a855f7')}</div>`
    + (d.o2o.map(one).join('') || `<div class="agem">No one-to-ones in ${esc(agLabel())}</div>`)
    + (d.coach.length ? `<h3 style="margin-top:22px">Coaching &amp; training <span class=bg>${d.coach.length}</span></h3>${d.coach.map(one).join('')}` : '')
    + `<h3 style="margin-top:22px">Tasks <span class=bg>${open.length} open</span></h3>` + (open.slice(0, 6).map(t => agRow(tkStar(t.type === 'mission'), esc(t.title), `${t.due ? 'Due ' + t.due : 'No due date'}`, isOver(t) ? pill('Overdue', 'bad') : pill(t.status, 'ac'), `TV.tab='my';TV.team='';TV.st='all';TV.agent='${esc(u.username)}';goPage('tasks')`)).join('') || '<small class=mu>No open tasks</small>');
}
function agSimTab(u, d) {
  const s = d.sims, best = s.length ? Math.max(...s.map(x => x.score)) : 0, mins = s.reduce((a, x) => a + x.minutes, 0);
  const rows = s.map(x => `<div class=agrow><span class=agsc style="--c:${x.score >= 85 ? 'var(--ok)' : x.score >= 50 ? 'var(--wn)' : 'var(--bad)'}">${x.score}</span><div style="flex:1;min-width:0"><b>${esc(x.scenario)}</b><br><small>${fdt(x.date)}${x.persona ? ' · Customer: ' + esc(x.persona) : ''} · ${x.minutes}min</small></div>${x.result ? pill(esc(x.result), x.score >= 85 ? 'ok' : 'wn') : ''}</div>`).join('');
  return `<div class=agsts>${agStat(s.length, 'Total Sessions', '#a855f7')}${agStat(s.length ? Math.round(avg(s.map(x => x.score))) : '—', 'Avg Score', '#3b82f6')}${agStat(s.length ? best : '—', 'Best Score', '#10b981')}${agStat(mins + 'min', 'Training Time', '#06b6d4')}</div>${rows || `<div class="agem">No simulator sessions in ${esc(agLabel())}. Practise in <a href="javascript:void(0)" class=agl onclick="goPage('sim')">Call Simulator</a>.</div>`}`;
}

// ---- the page
PG.agents = function () {
  const opts = agLookable(), isAg = ME.role === 'agent', inTeam = opts.filter(a => !AG.t || a.team === AG.t);
  if (!inTeam.some(a => a.username === AG.agent)) AG.agent = (inTeam[0] || opts[0] || {}).username || '';
  const u = ROSTER.find(r => r.username === AG.agent);
  const top = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><div class=sx style="width:290px"><span>${IC.search}</span><input class=qi style="padding-right:64px" placeholder="Search lead ID, agent, campaign…" onkeydown='if(event.key=="Enter"){Q=this.value.trim();KQ=true;location.hash="calls"}'><kbd class=kb>Ctrl K</kbd></div>${bellBtn()}${u ? `<button class="ib ibx" onclick="agReport()">${AIC.pdf} AI Report PDF</button><button class="ib ibx" onclick="agExport()">${IC.dl} Export Excel</button>` : ''}</div>`;
  const hd = head(isAg ? 'My Performance' : 'Agents', 'Complete agent overview — profile, performance, trends & analytics', top);
  if (!u) return hd + card('', `<p class=mu>${ME.role === 'lead' ? 'You do not lead a team with agents yet.' : 'No agents to show.'}</p>`);
  const d = agData(u), thr = PT(u.team); THR = thr;
  try {
    const team = TEAMS.find(t => t.id === u.team), pl = agPrevLabel(), n = d.cur.length;
    const a = avg(d.cur.map(e => e.sc)), pa = d.prev.length ? avg(d.prev.map(e => e.sc)) : null, ta = d.team.length ? avg(d.team.map(e => e.sc)) : null;
    const pc = agPct(d.cur), pp = agPct(d.prev), passed = d.cur.filter(isPass).length, red = d.flags.filter(e => e.fl === 'red').length, green = d.flags.length - red;
    const diff = n && ta != null ? a - ta : null;
    const kpi = (t, v, c, s, x, ic) => `<div class=agk><div class=row><small style="color:var(--tx)">${t}</small>${ic || ''}</div><div class=big style="color:${c || 'var(--tx)'}">${v}</div><small>${s || '&nbsp;'}</small>${x || ''}</div>`;
    const per = ['week', 'Week', 'month', 'Month', 'q', 'Q', 'year', 'Year', 'all', 'All'].reduce((r, x, i, A) => i % 2 ? r : [...r, [x, A[i + 1]]], []);
    const filt = card('', `<div class=agfilt style="${isAg ? 'grid-template-columns:1fr auto' : ''}"><label>Search<div class="sx agsearch"><span>${IC.search}</span><input placeholder="Search by lead ID, campaign…" value="${esc(AG.q)}" oninput="agQ(this)"></div></label>`
      + (isAg ? '' : `<label>Team<select onchange="agSet('t',this.value)"><option value="">All Teams</option>${TEAMS.filter(t => !t.system && opts.some(a => a.team === t.id)).map(t => `<option value="${t.id}" ${t.id === AG.t ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label><label>Agent<select onchange="agSet('agent',this.value)">${inTeam.map(a => `<option value="${esc(a.username)}" ${a.username === AG.agent ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`)
      + `<label>Period<div class="sg agsg">${per.map(([k, nm]) => `<button class="${AG.p === k ? 'on' : ''}" onclick="agSet('p','${k}')">${nm}</button>`).join('')}<button class="${AG.p === 'custom' ? 'on' : ''}" onclick="agSet('p','custom')" title="Choose dates">${AIC.cal}</button></div></label></div>`
      + (AG.p === 'custom' ? `<div class=agcust><label>From <input type=date value="${AG.f}" onchange="AG.f=this.value;render()"></label><label>To <input type=date value="${AG.to}" onchange="AG.to=this.value;render()"></label></div>` : '')
      + `<div class=agscw><div class=cap style="margin:14px 0 8px">REVIEW TYPE <span style="letter-spacing:0;text-transform:none">— average of every type, or all together</span></div>${chChips(d.chBase, AG.ch, 'agCh', true)}</div>` + (d.scs.length ? `<div class=agscw><div class=cap style="margin:14px 0 8px">SCORECARD FILTER <span style="letter-spacing:0;text-transform:none">(${d.scs.length} scorecard${d.scs.length === 1 ? '' : 's'})</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="agch ${AG.sc ? '' : 'on'}" onclick="agSet('sc','')">All <b>(${d.inCur.length})</b></button>${d.scs.map(s => { const v = avg(s.l.map(e => e.sc)); return `<button class="agch ${AG.sc === s.id ? 'on' : ''}" onclick="agSet('sc','${esc(s.id)}')" title="${esc(s.n)}">${AIC.card}<span class=agcn>${esc(s.n)}</span><b>(${s.l.length})</b><b style="color:${scol(v, u.team)}">${Math.round(v)}%</b></button>`; }).join('')}</div></div>` : ''));
    const sel = AG.sc ? (d.scs.find(s => s.id === AG.sc) || {}).n : '';
    const head2 = card('', `<div class=row style="flex-wrap:wrap;gap:14px"><div style="display:flex;gap:16px;align-items:center"><span class=av style="width:52px;height:52px;font-size:18px;margin:0">${esc(ini(u.name))}</span><div><b style="font-size:22px">${esc(u.name)}</b><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">${teamLink(u.team)}<small>${n} review${n === 1 ? '' : 's'} • ${esc(agLabel())}</small>${sel ? `<span class=agsct>${AIC.card} ${esc(sel)}</span>` : ''}</div></div></div></div>`);
    const kp = `<div class=agkp>${kpi('Avg Score', n ? Math.round(a) + '%' : '—', n ? scol(a, u.team) : '', agLabel(), n && pa != null ? agDelta(a - pa, ' pts', pl) : '')}`
      + `${kpi('Team Avg', ta != null ? Math.round(ta) + '%' : '—', '', esc(team ? team.name : '—'), diff == null ? '' : `<small class="agd ${Math.abs(diff) < .05 ? '' : diff > 0 ? 'up' : 'dn'}">${Math.abs(diff) < .05 ? '= on par with team' : (diff > 0 ? '↑ ' : '↓ ') + Math.abs(diff).toFixed(1) + ' pts ' + (diff > 0 ? 'above' : 'below') + ' team'}</small>`)}`
      + `${kpi('Pass Rate', n ? Math.round(pc) + '%' : '—', n ? scol(pc, u.team) : '', `${passed} passed / ${n - passed} failed`, n && pp != null ? agDelta(pc - pp, '%', pl) : '')}`
      + `${kpi(AG.ch ? 'Total ' + CHP[AG.ch] : 'Total Reviews', n, '', `${n} scored`, n && d.prev.length ? agDelta((n - d.prev.length) / d.prev.length * 100, '%', pl) : '')}`
      + `${kpi('Red Flags', red, 'var(--bad)', '', '', `<span style="color:var(--bad)">${IC.flag}</span>`)}${kpi('Green Flags', green, 'var(--ok)', '', '', `<span style="color:var(--ok)">${IC.flag}</span>`)}</div>`;
    const tabs = [['perf', 'Performance', AIC.perf, null], ['calls', 'Reviews & Trends', AIC.calls, n], ['flags', 'Flags', AIC.flag, d.flags.length], ['o2o', 'One-to-One', AIC.o2o, d.o2o.length], ['sim', 'Simulations', AIC.sim, d.sims.length], ['growth', 'Growth', svg('<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>', 15), (CO.pips || []).filter(p => p.agent === u.username && pipOpen(p)).length + (CO.goals || []).filter(g => g.scope === 'agent' && g.target === u.username).length]];
    if (!tabs.some(t => t[0] === AG.tab)) AG.tab = 'perf';
    const body = { perf: agPerf, calls: agCallsTab, flags: agFlagsTab, o2o: agO2oTab, sim: agSimTab, growth: agGrowthTab }[AG.tab](u, d);
    return hd + filt + head2 + kp + `<section class="card agtabs"><div class=agtb>${tabs.map(([k, nm, ic, c]) => `<button class="${AG.tab === k ? 'on' : ''}" onclick="AG.tab='${k}';render()" title="${nm}" aria-label="${nm}">${ic}<span class=agtn>${nm}</span>${c == null ? '' : ` <span class=bg>${c}</span>`}</button>`).join('')}</div><div class=agbody>${body}</div></section>`;
  } finally { THR = null; }
};

// ---- Excel (same file format as Call Reviews) and the printable report
const agCurrent = () => { const u = ROSTER.find(r => r.username === AG.agent); return u ? { u, d: agData(u) } : null; };
function agExport() { const c = agCurrent(); if (c) xp(c.d.cur, c.u.name); }
function agReport() {
  const c = agCurrent(); if (!c) return; const { u, d } = c, n = d.cur.length; THR = PT(u.team);
  try {
    const rows = CATS(d.cur).map(k => ({ c: k, a: agCat(d.cur, k), t: agCat(d.team, k) })).filter(r => r.a != null).sort((x, y) => y.a - x.a), a = avg(d.cur.map(e => e.sc)), pc = agPct(d.cur), red = d.flags.filter(e => e.fl === 'red').length;
    const strong = rows.slice(0, 3), weak = [...rows].reverse().slice(0, 3).filter(r => r.a < gthr());
    const li = r => `<li><b>${esc(r.c)}</b>: ${Math.round(r.a)}%${r.t != null ? ` (team ${Math.round(r.t)}%)` : ''}</li>`;
    const h = `<!doctype html><meta charset=utf-8><title>${esc(u.name)} – performance report</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:780px;margin:30px auto;color:#0f1b2d;padding:0 20px}h1{margin:0}h2{margin:26px 0 8px;font-size:16px;border-bottom:1px solid #e3e8ef;padding-bottom:4px}.k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k div{border:1px solid #e3e8ef;border-radius:10px;padding:10px}.k b{display:block;font-size:22px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px 6px;border-bottom:1px solid #e3e8ef}small{color:#5f6f86}</style>`
      + `<h1>${esc(u.name)}</h1><small>${esc(tn(u.team))} · ${esc(agLabel())} · created ${fdt(new Date())}</small>`
      + `<h2>Summary</h2><div class=k><div><small>Average score</small><b>${n ? Math.round(a) + '%' : '—'}</b></div><div><small>Pass rate</small><b>${n ? Math.round(pc) + '%' : '—'}</b></div><div><small>Calls</small><b>${n}</b></div><div><small>Red / green flags</small><b>${red} / ${d.flags.length - red}</b></div></div>`
      + `<h2>Strengths</h2><ul>${strong.map(li).join('') || '<li>No data</li>'}</ul><h2>Focus areas</h2><ul>${weak.map(li).join('') || '<li>All categories are above the pass rate</li>'}</ul>`
      + `<h2>Categories: agent vs team</h2><table><tr><th>Category</th><th>Agent</th><th>Team</th></tr>${rows.map(r => `<tr><td>${esc(r.c)}</td><td>${Math.round(r.a)}%</td><td>${r.t == null ? '—' : Math.round(r.t) + '%'}</td></tr>`).join('')}</table>`
      + `<h2>Coaching, one-to-ones and simulations</h2><p>${d.o2o.length} one-to-one, ${d.coach.length} coaching/training, ${d.sims.length} simulator sessions, ${d.disp.length} disputes in this period.</p>`
      + `<h2>Recent reviews</h2><table><tr><th>Lead</th><th>Date</th><th>Score</th></tr>${[...d.cur].sort((x, y) => y.d - x.d).slice(0, 12).map(e => `<tr><td>${esc(e.id)}</td><td>${f(e.d)}</td><td>${e.sc}%</td></tr>`).join('')}</table>`
      + `<p><small>Summary built from the platform data. The written AI commentary will be added once the AI key is connected.</small></p>`;
    const w = window.open('', '_blank'); if (!w) return toast('Please allow pop-ups to create the PDF', true);
    w.document.write(h); w.document.close(); setTimeout(() => w.print(), 400);
  } finally { THR = null; }
}

const agCh = v => { AG.ch = v; AG.pn = 1; render(); };

// ---- Growth tab: everything from Performance and Compliance & CX about this agent
function agGrowthTab(u) {
  const m = todayS().slice(0, 7), gl = (CO.goals || []).filter(g => (g.month || m) === m && (g.scope === 'all' || (g.scope === 'team' && g.target === u.team) || (g.scope === 'agent' && g.target === u.username)));
  const pl = (CO.pips || []).filter(p => p.agent === u.username), kd = (CO.kudos || []).filter(k => k.to === u.username), cm = (CO.complaints || []).filter(c => c.agent === u.username), sv = (CO.surveys || []).filter(s => s.agent === u.username).map(s => +s.score).filter(Boolean);
  return `<div class=agsts>${agStat(gl.filter(g => goalProgress(g).st === 'met').length + '/' + gl.length, 'Goals met this month', '#10b981')}${agStat(pl.filter(pipOpen).length, 'Active improvement plans', '#f59e0b')}${agStat(kd.length, 'Kudos received', '#a855f7')}${agStat(sv.length ? avg(sv).toFixed(2) : '—', 'CSAT (' + sv.length + ' answers)', '#3b82f6')}</div>`
    + `<h3>Goals — ${monthName(m)}</h3>${gl.map(g => { const p = goalProgress(g); return agRow(g.scope === 'agent' ? '🎯' : '👥', esc(g.title || GMET[g.metric][0]) + ' <small>(' + esc(gWho(g)) + ')</small>', `${gFmt(g, p.v)} of ${gFmt(g, p.tg)}`, pill(...GST[p.st]), "goPage('goals')"); }).join('') || '<p class=mu>No goals this month</p>'}`
    + `<h3 style="margin-top:22px">Improvement plans</h3>${pl.map(p => agRow('📋', esc(p.title || 'Improvement plan'), `${p.start || '—'} → ${p.end || '—'} · ${(p.goals || []).filter(x => x.done).length}/${(p.goals || []).length} goals`, pill(...PIPST[p.status || 'active']), `PIPV='${p.id}';goPage('pips')`)).join('') || `<p class=mu>None${canPip() ? ` — <a href="javascript:void(0)" class=agl onclick="pipForm();setTimeout(()=>{FM.d.agent='${esc(u.username)}';render()},50)">start one</a>` : ''}</p>`}`
    + `<h3 style="margin-top:22px">Kudos</h3>${kd.slice(0, 6).map(k => agRow(esc(k.badge || '⭐'), esc(k.byName || ''), esc(k.text || ''), `<small>${fdt(k.at)}</small>`)).join('') || '<p class=mu>No kudos yet</p>'}`
    + (ME.role !== 'agent' ? `<h3 style="margin-top:22px">Complaints <span class=bg>${cm.length}</span></h3>${cm.slice(0, 6).map(c => agRow(IC.flag, esc(c.category || 'Complaint') + ' · ' + esc(c.customer || ''), esc(String(c.desc || '').slice(0, 90)), pill(...(CMST[c.status || 'new'])), `cmForm('${c.id}')`)).join('') || '<p class=mu>No complaints 🎉</p>'}` : '');
}
