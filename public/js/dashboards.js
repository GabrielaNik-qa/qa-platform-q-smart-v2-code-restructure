// ===================== Team pulse and the Dashboards gallery =====================
// Team pulse (the "Overall" dashboard) answers three questions at a glance: how is my team doing (one sentence and four numbers),
// what needs me now (a short list, one button each) and where it comes from (agents × categories). Every number opens its list in
// one click, the item in two. Home › Personalize holds the ready-made dashboards (one per role and focus) next to your own, which
// you name as you like, share, or set as your home page (personalize.js).
const dAgo = d => (Date.now() - new Date(d)) / 864e5;
const dScope = c => AGENTS().filter(a => !c.t || a.team === c.t);
const dPlan = c => { if (typeof plRows !== 'function') return null; const keep = [PLN.m, PLN.t]; PLN.m = todayS().slice(0, 7); PLN.t = c.t || ''; const r = plRows(); [PLN.m, PLN.t] = keep; return r; };
const dLow = c => agS(c.d).filter(v => v.k >= 2 && v.a < PT(v.team) && dScope(c).some(a => a.username === v.u)).sort((p, q) => p.a - q.a);
const dOpenDisp = c => EV.filter(e => e.dp && e.dp.status === 'open' && (!c.t || e.tm === c.t));
const dUnseen = () => { goCalls(); FS = 'unseen'; };

// ---- one sentence about the team (each part opens what it talks about)
wdef('dash', 'brief', 'Team briefing', 60, (c, s, x) => {
  if (!c.n) return card(wt(x, 'Team briefing'), '<p class=mu style="margin:0">No reviews in this period yet.</p>');
  const lnk = (t, act) => `<a href="javascript:void(0)" class=agl onclick="${act}">${t}</a>`, parts = [];
  parts.push(Math.abs(c.dl) < 1.5 ? `Quality is steady at ${c.a.toFixed(1)}% (target ${c.g}%).` : c.dl > 0 ? `Quality is rising at ${c.a.toFixed(1)}% (target ${c.g}%).` : `Quality is falling at ${c.a.toFixed(1)}% (target ${c.g}%).`);
  const wk = (k, from, to) => { const l = EV.filter(e => chOf(e) === k && (!c.t || e.tm === c.t) && dAgo(e.d) >= from && dAgo(e.d) < to); return l.length >= 3 ? avg(l.map(e => e.sc)) : null; };
  const drop = CHS.map(k => ({ k, d: wk(k, 0, 7) != null && wk(k, 7, 14) != null ? wk(k, 0, 7) - wk(k, 7, 14) : 0 })).sort((p, q) => p.d - q.d)[0];
  if (drop && drop.d <= -1) parts.push(lnk(`${CHP[drop.k]} slipped ${Math.abs(drop.d).toFixed(1)} points this week.`, `goCalls({ch:'${drop.k}',team:'${c.t || ''}'})`));
  if (ME.role !== 'agent') { const lo = dLow(c).length; if (lo) parts.push(lnk(`${lo} agents need support.`, "goPage('team')")); }
  const dp = dOpenDisp(c).length; if (dp && staff()) parts.push(lnk(`${dp} disputes wait for your decision.`, "goPage('disputes')"));
  const pl = staff() && dPlan(c); if (pl && pl.length) { const left = pl.reduce((a, r) => a + Math.max(0, r.tg - r.done), 0), now = new Date(), days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate(); if (left) parts.push(lnk(`Review plan: ${left} reviews left, ${days} days to go.`, "goPage('planner')")); }
  return `<div class="card dbrief"><span class=dbi>${IC.g_analytics}</span><div>${parts.map(p => `<span>${p}</span>`).join(' ')}</div></div>`;
}, 'One sentence: how the team is doing and what needs you', 'Numbers');

wdef('dash', 'plan_kpi', 'Review plan', 15, (c, s, x) => {
  const r = dPlan(c); if (!r) return '';
  const tg = r.reduce((a, z) => a + z.tg, 0), dn = r.reduce((a, z) => a + Math.min(z.done, z.tg || z.done), 0), bh = r.filter(z => z.st === 'behind').length;
  return kt('Review plan', 'Reviews done against this month\'s plan', `${dn}<small class=kps>/${tg}</small>`, ksub(tr(bh ? `${bh} agents behind` : 'everyone on track')), "goPage('planner')");
}, 'Reviews done against this month\'s plan', 'Numbers');

// ---- what needs you now: a short list, each with the one button that deals with it
wdef('dash', 'inbox', 'Needs you now', 30, (c, s, x) => {
  const it = [], btn = (t, act) => `<button class=ib onclick="${act}">${t}</button>`;
  const old = dOpenDisp(c).filter(e => dAgo(e.dp.at || e.d) > 2).length; if (old) it.push([IC.flag, 'var(--wn)', `${old} disputes waiting over 48 h`, btn('Decide', "goPage('disputes')")]);
  dLow({ ...c, d: EV.filter(e => (!c.t || e.tm === c.t) && dAgo(e.d) < 14) }).slice(0, 2).forEach(v => it.push([IC.g_perf, 'var(--bad)', `${v.n} below target 2 weeks`, btn('Plan coaching', `openAgent(${jsq(v.u)})`)]));
  const pl = dPlan(c), bh = pl ? pl.filter(z => z.st === 'behind').length : 0; if (bh) it.push([IC.clock, 'var(--wn)', `${bh} agents behind the review plan`, btn('Review now', "goPage('planner')")]);
  const cf = c.d.filter(e => e.sc === 0 && dAgo(e.d) < 7).length; if (cf) it.push([IC.x, 'var(--bad)', `${cf} critical fails this week`, btn('Open', `goCalls({team:'${c.t || ''}',sc:{a:0,b:1}})`)]);
  const un = c.d.filter(e => !e.seen).length; if (un) it.push([IC.eye, 'var(--mu)', `${un} reviews not seen by agents`, btn('Remind', 'dUnseen()')]);
  const od = TASKS.filter(t => typeof isOver === 'function' && isOver(t) && (!c.t || teamOf(t.assignee) === c.t)).length; if (od) it.push([IC.clock, 'var(--bad)', `${od} overdue tasks`, btn('Open', "goPage('tasks')")]);
  return card(`${wt(x, 'Needs you now')} ${it.length ? `<span class=bg>${it.length}</span>` : ''}`, it.length ? it.map(([ic, cl, t, b]) => `<div class=dinb><span style="color:${cl}">${ic}</span><span>${t}</span>${b}</div>`).join('') : '<p class=mu style="margin:0">✓ Nothing needs you right now</p>');
}, 'The things waiting for you, each with one button', 'Lists');

// ---- where it comes from: agents × categories (the lowest first), a click opens that agent's reviews
wdef('dash', 'heat', 'Team heat map', 60, (c, s, x) => {
  const cnt = {}; c.d.forEach(e => (e.cs || []).forEach(k => { cnt[k.n] = (cnt[k.n] || 0) + 1; }));
  const cats = Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p]).slice(0, s >= 40 ? 8 : 5), rows = agS(c.d).filter(v => v.k && dScope(c).some(a => a.username === v.u)).sort((p, q) => p.a - q.a);
  if (!cats.length || !rows.length) return card(wt(x, 'Team heat map'), '<p class=mu style="margin:0">No reviews in this period yet.</p>');
  const v = (u, n) => { const l = c.d.filter(e => e.agent === u).map(e => cpv(e, n)).filter(z => z != null); return l.length ? avg(l) : null; };
  return card(`${wt(x, 'Team heat map')} <small class=mu style="font-weight:400">agents × categories</small>`, `<div class=dheat style="grid-template-columns:minmax(90px,1.4fr) repeat(${cats.length},minmax(0,1fr))"><span></span>${cats.map(n => `<small title="${esc(n)}">${esc(n)}</small>`).join('')}`
    + rows.slice(0, 8).map(r => `<a href="javascript:void(0)" onclick="openAgent(${jsq(r.u)})">${esc(r.n)}</a>${cats.map(n => { const z = v(r.u, n); return z == null ? '<i class=dhn>—</i>' : `<button class=heat style="--c:${col(z)}" onclick="goCalls({agent:${jsq(r.u)}})" title="${esc(r.n)} · ${esc(n)}">${Math.round(z)}</button>`; }).join('')}`).join('')
    + `</div>${rows.length > 8 ? `<a href="javascript:void(0)" class=agl onclick="goPage('team')">+${rows.length - 8} more agents · Team Review ›</a>` : ''}`);
}, 'Who is strong or weak in which category', 'Categories');

// ---- AI and automation: Auto QA coverage and how close the AI is to the reviewers
wdef('dash', 'ai_sim', 'AI and automation', 60, (c, s, x) => {
  const l = typeof aqList === 'function' ? AQC.filter(z => z.auto && (!c.t || teamOf(z.agent) === c.t)) : [], acc = l.length && typeof aqAccuracy === 'function' ? aqAccuracy(l) : null, a = l.length && typeof aqTotal === 'function' ? avg(l.map(aqTotal)) : null;
  if (!l.length && !AIDR.length) return card(wt(x, 'AI and automation'), `<p class=mu style="margin:0">No conversations were rated automatically yet. <a href="javascript:void(0)" class=agl onclick="goPage('autoqa')">Open AutoQA ›</a></p>`);
  return card(wt(x, 'AI and automation'), `<div class=fkp style="margin:0">${kpiS('Rated automatically', l.length, new Set(l.map(z => z.agent)).size + ' agents')}${kpiS('Average automatic score', a == null ? '—' : a.toFixed(1) + '%', '', a == null ? '' : col(a))}${kpiS('Human vs AI similarity', acc ? acc.v.toFixed(1) + '%' : '—', acc ? acc.n + ' compared scores' : 'needs reviews of the same conversations', acc ? col(acc.v) : '')}${AIDR.length ? (z => kpiS('AI reviewer agreement', z.v == null ? '—' : z.v.toFixed(1) + '%', z.n + ' approved drafts', z.v == null ? '' : col(z.v)))(aiSim(AIDR)) : ''}</div><a href="javascript:void(0)" class=agl onclick="goPage('autoqa')">Open AutoQA ›</a>`);
}, 'Conversations rated by AI and how close it is to people', 'Charts');

// ---- learning: required reading and quizzes of the team
wdef('dash', 'learn_prog', 'Learning progress', 30, (c, s, x) => {
  const l = PROG.filter(p => !c.t || p.team === c.t);
  if (!l.length) return card(wt(x, 'Learning progress'), '<p class=mu style="margin:0">No required reading or quizzes yet.</p>');
  const rq = l.reduce((a, p) => a + p.required, 0), rd = l.reduce((a, p) => a + p.completed, 0), qz = l.reduce((a, p) => a + p.quizzes, 0), qp = l.reduce((a, p) => a + p.quizzesPassed, 0), behind = l.filter(p => p.completed < p.required || p.quizzesPassed < p.quizzes);
  return card(wt(x, 'Learning progress'), `<div class=clk onclick="goPage('acad')"><div class=row><span>Required reading</span><b class=mono>${rd}/${rq}</b></div>${bar(rq ? rd / rq * 100 : 100, 'var(--ac)')}<div class=row style="margin-top:8px"><span>Quizzes passed</span><b class=mono>${qp}/${qz}</b></div>${bar(qz ? qp / qz * 100 : 100, 'var(--ok)')}</div>`
    + (behind.length ? `<small class=mu>Still open for: ${behind.slice(0, 4).map(p => esc(p.name)).join(', ')}${behind.length > 4 ? ` +${behind.length - 4}` : ''}</small>` : '<small style="color:var(--ok)">✓ Everyone is up to date</small>'));
}, 'Required reading and quizzes of the team', 'Performance');

// ---- the ready-made dashboards (one per role and focus) and the defaults of each role
const DTPL = [
  ['t-overall', 'Overall · team pulse', 'Everything important, one glance', 'g_home', wl(['brief', 60], ['kpi_avg', 15], ['kpi_pass', 15], ['plan_kpi', 15], ['kpi_disputes', 15], ['inbox', 30], ['heat', 30], ['qtime', 60])],
  ['t-lead', 'Team lead', 'Who needs help this week', 'g_coaching', wl(['brief', 60], ['wf_today', 60], ['ai_lead', 60], ['kpi_avg', 20], ['kpi_pass', 20], ['kpi_trend', 20], ['inbox', 30], ['low', 30], ['heat', 60], ['teams', 30], ['tasks', 30])],
  ['t-qa', 'QA specialist', 'Review plan, disputes, calibration', 'g_quality', wl(['plan_kpi', 15], ['kpi_disputes', 15], ['kpi_total', 15], ['kpi_flags', 15], ['planner', 30], ['inbox', 30], ['attention', 60], ['distribution', 30], ['qflags', 30])],
  ['t-trainer', 'Trainer', 'Skill gaps, training impact', 'g_learning', wl(['brief', 60], ['ai_train', 30], ['needs', 30], ['cat0', 30], ['heat', 60], ['learn_prog', 30], ['strong', 30], ['cattime', 60])],
  ['t-agent', 'Agent · my progress', 'My score, my next step', 'g_perf', wl(['att_me', 60], ['cap_me', 60], ['kpi_avg', 20], ['kpi_pass', 20], ['kpi_trend', 20], ['coach_new', 60], ['todo', 60], ['strong', 30], ['needs', 30], ['last5', 60])],
  ['t-perf', 'Performance and KPIs', 'Goals, CSAT, pass rate', 'g_perf', wl(['kpi_avg', 15], ['kpi_pass', 15], ['csat', 15], ['complaints', 15], ['goals', 30], ['kudos', 30], ['top', 30], ['low', 30])],
  ['t-speed', 'Speed and workload', 'Plan, backlog, open work', 'g_plan', wl(['plan_kpi', 20], ['kpi_disputes', 20], ['kpi_total', 20], ['planner', 30], ['tasks', 30], ['inbox', 60])],
  ['t-analytics', 'Analytics deep-dive', 'Categories, root causes, trends', 'g_analytics', wl(['ai_ana', 60], ['qtime', 60], ['cattime', 60], ['catins', 60], ['channels', 30], ['cat0', 30], ['distribution', 30], ['teams', 30])],
  ['t-ai', 'AI and automation', 'AI vs human agreement', 'g_tools', wl(['ai_sim', 60], ['brief', 60], ['channels', 30], ['distribution', 30])],
  ['t-learn', 'Learning', 'Quizzes, reading, overdue', 'g_learning', wl(['learn_prog', 30], ['needs', 30], ['cat0', 30], ['strong', 30], ['todo', 60])]
].map(([id, name, desc, ic, items]) => ({ id, name, desc, ic, items, kind: 'tpl' }));
const dashTpls = () => DTPL;
['all', 'admin', 'qa', 'lead'].forEach(r => { DEFL.dash[r] = DTPL[0].items; });
DEFL.dash.trainer = DTPL[3].items; DEFL.dash.agent = DTPL[4].items;
Object.assign(WGRP, { brief: 'Numbers', plan_kpi: 'Numbers', inbox: 'Lists', heat: 'Categories', ai_sim: 'Charts', learn_prog: 'Performance' });

// ---- "Use as my home" (Home › Personalize): the widgets of a ready-made or named dashboard become your home dashboard
async function dvUse(id) {
  const v = allViews('dash').find(z => z.id === id); if (!v) return;
  const items = itemsOf('dash', v).map(wKeep('dash'));
  const r = await api('/api/layout', { page: 'dash', items }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true);
  ME = await r.json(); render(); toast(tr(`"${v.name}" is now your home dashboard`));
}
