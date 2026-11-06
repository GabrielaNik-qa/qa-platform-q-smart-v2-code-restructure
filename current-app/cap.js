// Capacity planning (Workforce, phase 4): the fair split of the leads of a month among the agents. No server or files here:
// used by routes-cap.js and the tests. Every agent gets the same share of EVERY campaign, so everybody has the same mix of
// brands and segments, sized by the hours they can work in the days left (their rota, public holidays and time off).
// Whole leads only, and it always holds that: every campaign adds up exactly; everybody gets their exact share of each
// campaign rounded down or up; and their total is their exact fair total rounded down or up, so nobody is ever a whole
// lead away from fair. The same rounding spreads each agent's leads over their working days.
const wf = require('./wf');
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const monthDays = m => { const out = []; for (let d = m + '-01'; d.slice(0, 7) === m; d = wf.addDays(d, 1)) out.push(d); return out; };

// ---- a small max-flow (Dinic), used to hand out the leads left after rounding down without breaking any total
function flowGraph(n) {
  const head = new Array(n).fill(-1), to = [], cap = [], next = [];
  const add = (u, v, c) => { to.push(v, u); cap.push(c, 0); next.push(head[u], head[v]); head[u] = to.length - 2; head[v] = to.length - 1; return to.length - 2; };
  function flow(s, t) {
    let total = 0; const level = new Array(n), it = new Array(n);
    const bfs = () => {
      level.fill(-1); level[s] = 0; const q = [s];
      for (let k = 0; k < q.length; k++) for (let e = head[q[k]]; e !== -1; e = next[e]) if (cap[e] > 0 && level[to[e]] < 0) { level[to[e]] = level[q[k]] + 1; q.push(to[e]); }
      return level[t] >= 0;
    };
    const dfs = (u, f) => {
      if (u === t) return f;
      for (; it[u] !== -1; it[u] = next[it[u]]) {
        const e = it[u], v = to[e];
        if (cap[e] > 0 && level[v] === level[u] + 1) { const d = dfs(v, Math.min(f, cap[e])); if (d > 0) { cap[e] -= d; cap[e ^ 1] += d; return d; } }
      }
      return 0;
    };
    while (bfs()) { for (let i = 0; i < n; i++) it[i] = head[i]; let d; while ((d = dfs(s, Infinity)) > 0) total += d; }
    return total;
  }
  return { add, flow, cap };
}

// share every row total (a whole number) out over the columns in proportion to their weights (whole numbers): every cell
// is its exact share rounded down or up, every row adds up exactly, and every column gets its exact total rounded down or
// up. Everything is counted in whole units of 1/W, so there are no rounding errors. After rounding down, the leads left
// over are handed out with a max-flow: they always fit, because the exact fractions themselves are such a flow.
function apportion(rows, w) {
  const R = rows.length, C = w.length, W = w.reduce((s, x) => s + x, 0), out = rows.map(() => new Array(C).fill(0));
  if (!rows.some(n => n > 0)) return out;
  if (!W) throw new Error('Nobody in this plan can work in the days left');
  const rem = rows.map(() => new Array(C).fill(0)), need = new Array(R).fill(0), colRem = new Array(C).fill(0);
  rows.forEach((n, r) => {
    let given = 0;
    for (let c = 0; c < C; c++) { const v = n * w[c], m = v % W; out[r][c] = (v - m) / W; rem[r][c] = m; colRem[c] += m; given += out[r][c]; }
    need[r] = n - given;
  });
  const up = v => (v - v % W) / W + (v % W ? 1 : 0), top = colRem.map(up), K = need.reduce((s, x) => s + x, 0), slack = top.reduce((s, x) => s + x, 0) - K;
  // network: start → row (the leads it still hands out) → column (1 each, where there is a fraction) → end (its total rounded up);
  // a "slack" source fills each column whose fractions do not add up to a whole number, so that column may end up rounded down
  const S = R + C, X = S + 1, T = S + 2, g = flowGraph(T + 1), cells = [];
  for (let r = 0; r < R; r++) {
    if (need[r]) g.add(S, r, need[r]);
    const cs = []; for (let c = 0; c < C; c++) if (rem[r][c]) cs.push(c);
    cs.sort((a, b) => rem[r][a] - rem[r][b] || b - a).forEach(c => cells.push([r, c, g.add(r, R + c, 1)]));   // added last = tried first: the biggest fractions get the extra leads
  }
  if (slack) g.add(S, X, slack);
  for (let c = 0; c < C; c++) { if (colRem[c] % W) g.add(X, R + c, 1); if (top[c]) g.add(R + c, T, top[c]); }
  if (g.flow(S, T) !== K + slack) throw new Error('The split did not add up');   // never happens: the exact fractions are such a flow
  cells.forEach(([r, c, e]) => { out[r][c] += 1 - g.cap[e]; });
  return out;
}

// the fair split: pool = [{ id, n }] (the leads of every campaign still to work), people = [{ u, w }] (their weight: the
// hours they can work × their share %) → { [username]: { [campaign id]: leads }. When people are level for an extra lead,
// the order between them comes from "salt" (the plan and its version), so it is not always the same person who gets it.
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
function fairSplit(pool, people, salt = '') {
  const ps = people.slice().sort((a, b) => hash(salt + '|' + a.u) - hash(salt + '|' + b.u) || a.u.localeCompare(b.u));
  const m = apportion(pool.map(c => c.n), ps.map(p => p.w)), out = {};
  ps.forEach((p, i) => { out[p.u] = {}; pool.forEach((c, r) => { if (m[r][i]) out[p.u][c.id] = m[r][i]; }); });
  return out;
}
// one person's leads spread over the days of the month in proportion to their hours that day (days without hours get none)
// → one entry per day: { [campaign id]: leads }, or null on a day without work
function daily(mine, hours) {
  const ids = Object.keys(mine || {}).filter(id => mine[id] > 0), m = apportion(ids.map(id => mine[id]), hours);
  return hours.map((h, d) => { if (!h) return null; const o = {}; ids.forEach((id, r) => { if (m[r][d]) o[id] = m[r][d]; }); return o; });
}
// the hours a person can work on a day, in hundredths of an hour: their rota (a shift, a half day, a day off, a public
// holiday) minus approved time off (a whole day, a morning or an afternoon, or some hours)
function hoursOn(W, u, d, rota, lv) {
  const h = wf.cellHours(W, wf.planOf(W, u, d, rota)); if (!h) return 0;
  return Math.round((!lv ? h : lv.part === 'full' ? 0 : lv.part === 'hours' ? Math.max(0, h - (Number(lv.hours) || 0)) : h / 2) * 100);
}

// ---- checking what people save
// campaigns: a name (else "brand segment"), the brand, the segment (each company names its own: 0-30, 30-60 …) and the leads
function cleanCampaigns(list, make) {
  if (!Array.isArray(list)) throw new Error('Add the campaigns as a list');
  if (list.length > 300) throw new Error('Up to 300 campaigns in one plan');
  const ids = new Set(), names = new Set();
  return list.map(x => {
    const c = x && typeof x === 'object' ? x : {}, brand = str(c.brand, 60), segment = str(c.segment, 30), name = str(c.name, 80) || [brand, segment].filter(Boolean).join(' ');
    if (!name) throw new Error('Every campaign needs a name');
    const key = name.toLowerCase(); if (names.has(key)) throw new Error(`“${name}” is twice in the list`); names.add(key);
    const leads = Number(c.leads);
    if (c.leads === '' || c.leads === null || !Number.isInteger(leads) || leads < 0 || leads > 1e6) throw new Error(`“${name}”: the leads must be a whole number from 0 to 1,000,000`);
    const id = typeof c.id === 'string' && /^[a-z0-9-]{2,24}$/.test(c.id) && !ids.has(c.id) ? c.id : make(); ids.add(id);
    return { id, name, brand, segment, leads };
  });
}
// the share of each person, in %: 0 leaves them out, 50 for somebody still learning, 100 as usual (up to 200)
function cleanPct(o, allowed) {
  const out = {};
  Object.entries(o && typeof o === 'object' ? o : {}).forEach(([u, v]) => { const n = Math.round(Number(v)); if (allowed.has(u) && v !== '' && v !== null && Number.isFinite(n)) out[u] = Math.min(200, Math.max(0, n)); });
  return out;
}
// the order campaigns are shown in: by brand, then by segment (0-30 before 30-60 … before 360+), then by name
const segNum = s => { const m = String(s || '').match(/\d+/); return m ? Number(m[0]) : Infinity; };
const order = (a, b) => a.brand.localeCompare(b.brand) || segNum(a.segment) - segNum(b.segment) || a.segment.localeCompare(b.segment) || a.name.localeCompare(b.name);

module.exports = { MONTH, monthDays, apportion, fairSplit, daily, hoursOn, cleanCampaigns, cleanPct, order };
