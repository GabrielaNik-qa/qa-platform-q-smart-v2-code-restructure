// ===================== Reviews page (calls, chats, emails and other conversations) =====================
const cpn = e => iso(e.d) + ' ' + (e.cp || 'general');
const UN = () => NF.filter(n => !n.read).length;
const bellBtn = () => `<button class="ib bellb" onclick="openN()" title="Notifications">${IC.bell}${UN() ? `<sup>${UN()}</sup>` : ''}</button>`;
const SORT = { ch: e => chOf(e), id: e => String(e.id).toLowerCase(), d: e => +e.d, ag: e => agn(e), tm: e => tn(e.tm), cp: e => cpn(e), rv: e => e.rv || '', sc: e => e.sc, fl: e => ({ red: 2, green: 1 }[e.fl] || 0), st: e => e.st, sn: e => e.seen ? 1 : 0,
  res: e => isPass(e) ? 1 : 0, scn: e => scnOf(e).toLowerCase(), subj: e => (e.subj || '').toLowerCase() };
let RF = { st: '', fl: '', rv: '', scid: '' };   // more filters of the Reviews page: status, flag, reviewer, scorecard
const scnOf = e => e.scn || (SCS.find(s => s.id === e.scid) || {}).name || '';
const rfOk = e => (!RF.st || (RF.st === 'disputed') === (e.st === 'disputed')) && (!RF.fl || (RF.fl === 'none' ? !e.fl : e.fl === RF.fl)) && (!RF.rv || e.by === RF.rv) && (!RF.scid || e.scid === RF.scid);
const inP = e => FP === 'all' || (FP === 'custom' ? e.d >= new Date(F1 + 'T00:00:00') && e.d <= new Date(F2 + 'T23:59:59') : (Date.now() - e.d) / 864e5 <= (FP === 'week' ? 7 : 30));
const fscOk = e => !FSC || (FSC.m === 'pass' ? isPass(e) : FSC.m === 'fail' ? !isPass(e) : e.sc >= FSC.a && e.sc < FSC.b);
const CR = () => {
  const q = Q.toLowerCase(), g = SORT[SK];
  return EVA.filter(e => (!FC || chOf(e) === FC) && (!FT || e.tm === FT) && (!FA || e.agent === FA) && inP(e) && fscOk(e) && rfOk(e) && (!FS || (FS === 'seen' ? e.seen : !e.seen)) &&
    (!q || String(e.id).toLowerCase().includes(q) || agn(e).toLowerCase().includes(q) || cpn(e).toLowerCase().includes(q) || (e.subj || '').toLowerCase().includes(q) || (e.chn || '').toLowerCase().includes(q)))
    .sort((a, b) => { const x = g(a), y = g(b); return (x > y ? 1 : x < y ? -1 : 0) * SD; });
};
// the columns of the table: everybody picks the ones they need with "Columns" (the lead ID always stays)
const RCOLS = [
  { k: 'id', t: 'LEAD ID', lock: 1, td: e => `<a href="javascript:void(0)" class=mono style="color:var(--ac);font-weight:600;text-decoration:none" onclick="om('view','${e.rid}')">${esc(e.id)}</a>` },
  { k: 'ch', t: 'TYPE', td: e => chTag(chOf(e)) },   // the exact channel (WhatsApp, Messenger…) shows in the review window
  { k: 'd', t: 'DATE', td: e => f(e.d) },
  { k: 'ag', t: 'AGENT', td: e => `<span class=av>${ini(agn(e))}</span>${e.agent && ME.role !== 'agent' ? agLink(e.agent, agn(e)) : esc(agn(e))}` },
  { k: 'tm', t: 'TEAM', td: e => teamLink(e.tm) },
  { k: 'cp', t: 'CAMPAIGN', td: e => esc(cpn(e)) },
  { k: 'rv', t: 'REVIEWER', td: e => esc(e.rv || '—') },
  { k: 'sc', t: 'SCORE', td: e => e.ns ? `<span class=mu title="${esc(tr('Every question is N/A, so there is nothing to score. It is in no average.'))}">${tr('Not scored')}</span>` : `<div class=sv><b class=mono style="color:${scol(e.sc, e.tm)}">${e.sc}%</b>${bar(e.sc, scol(e.sc, e.tm))}</div>` },
  { k: 'res', t: 'RESULT', off: 1, td: e => isPass(e) ? pill('Passed', 'ok') : pill('Failed', 'bad') },
  { k: 'fl', t: 'FLAG', td: e => `<span class="fgv ${e.fl || ''}" title="${e.fl ? e.fl + ' flag' : 'No flag'}">${IC.flag}</span>` },
  { k: 'st', t: 'STATUS', td: e => e.st === 'disputed' ? pill('Disputed', 'wn') : pill('Completed', 'ok') },
  { k: 'sn', t: 'SEEN', td: e => e.seen ? `<span class="pill ok" title="Seen ${fdt(e.seen)}">Seen</span>` : `<span class="pill wn" title="The agent has not opened this review yet">Not seen</span>` },
  { k: 'scn', t: 'SCORECARD', off: 1, td: e => esc(scnOf(e) || '—') },
  { k: 'subj', t: 'SUBJECT', off: 1, td: e => `<div class=dsm title="${esc(e.subj || '')}">${esc(e.subj || '—')}</div>` }
];
// every filter of the Reviews page, in the Filters panel (Date always shows; agents only see their own reviews, so no team / agent / reviewer)
const RFL = () => [
  { k: 'p', n: 'Date', v: FP, fixed: 1, o: () => [['week', 'Last 7 days'], ['month', 'Last 30 days'], ['all', 'All time'], ['custom', 'Custom dates']], set: v => { FP = v || 'month'; },
    extra: () => FP === 'custom' ? `<span style="display:flex;gap:8px;margin-top:6px"><input type=date value=${F1} onchange="F1=this.value;PN=1;render()" aria-label="From"><input type=date value=${F2} onchange="F2=this.value;PN=1;render()" aria-label="To"></span>` : '' },
  ...(ME.role === 'agent' ? [] : [
    { k: 'tm', n: 'Team', v: FT, o: () => TEAMS.filter(t => !t.system).map(t => [t.id, t.name]), set: v => { FT = v; if (FT && FA && teamOf(FA) !== FT) FA = ''; } },
    { k: 'ag', n: 'Agent', v: FA, o: () => AGENTS().filter(a => !FT || a.team === FT).map(a => [a.username, a.name]), set: v => { FA = v; if (FA) FT = teamOf(FA); } }]),
  { k: 'ch', n: 'Type', v: FC, o: () => CHS.map(k => [k, CHP[k]]), set: v => { FC = v; } },
  { k: 'res', n: 'Result', v: FSC ? FSC.m || 'range' : '', o: () => [['pass', 'Passed'], ['fail', 'Failed'], ...(FSC && !FSC.m ? [['range', `Score ${FSC.a}% – ${FSC.b > 100 ? 100 : FSC.b - 1}%`]] : [])], set: v => { FSC = v === 'pass' || v === 'fail' ? { m: v } : v === 'range' ? FSC : null; } },
  { k: 'st', n: 'Status', v: RF.st, o: () => [['disputed', 'Disputed'], ['done', 'Completed']], set: v => { RF.st = v; } },
  { k: 'fl', n: 'Flag', v: RF.fl, o: () => [['red', 'Red flag'], ['green', 'Green flag'], ['none', 'No flag']], set: v => { RF.fl = v; } },
  { k: 'sn', n: 'Viewed by agent', v: FS, o: () => [['seen', 'Seen'], ['unseen', 'Not seen']], set: v => { FS = v; } },
  ...(ME.role === 'agent' ? [] : [{ k: 'rv', n: 'Reviewer', v: RF.rv, o: () => ROSTER.filter(r => r.active && ['qa', 'admin'].includes(r.role)).map(r => [r.username, r.name]), set: v => { RF.rv = v; } }]),
  { k: 'scid', n: 'Scorecard', v: RF.scid, o: () => SCS.map(s => [s.id, s.name]), set: v => { RF.scid = v; } }
];
txReg('calls', { cols: RCOLS, filters: RFL, rows: () => CR(), count: () => CR().length, clear: () => { FT = ''; FA = ''; FC = ''; FSC = null; FS = ''; RF = { st: '', fl: '', rv: '', scid: '' }; } });
const hasItems = e => (e.cs || []).some(c => c.it.length);

const PGN = (n, pc, a) => `<div class=pg><label style="display:flex;align-items:center;gap:8px;font-size:13px">Items per page <select onchange="PS=+this.value;PN=1;rt()">${[10, 20, 50, 100].map(x => `<option ${x === PS ? 'selected' : ''}>${x}</option>`).join('')}</select></label><small>${n ? `Showing ${a + 1} to ${Math.min(a + PS, n)} of ${n} results` : 'No results'}</small><div style="display:flex;gap:6px"><button class=pb ${PN < 2 ? 'disabled' : ''} onclick="gp(${PN - 1})">← Previous</button>${Array.from({ length: pc }, (_, i) => i + 1).filter(i => i === 1 || i === pc || Math.abs(i - PN) <= 1).map((i, k, ar) => (k && i - ar[k - 1] > 1 ? '<span class=mu>…</span>' : '') + `<button class="pb ${i === PN ? 'on' : ''}" onclick="gp(${i})">${i}</button>`).join('')}<button class=pb ${PN >= pc ? 'disabled' : ''} onclick="gp(${PN + 1})">Next →</button></div></div>`;

const rowH = (e, cols) => {
  const hasRec = chOf(e) === 'call' && (!!recSrc(e) || /^https?:\/\//.test(e.rl || '')), r = e.rid;
  return `<tr>${cols.map(c => `<td>${c.td(e)}</td>`).join('')}`
    + `<td style="white-space:nowrap">${chOf(e) !== 'call' ? `<span class="ic off" style="display:inline-block;width:30px"></span>` : hasRec ? `<button class=ic onclick="ply('${r}')" title="Play recording">${IC.play}</button>` : `<button class="ic off" disabled title="No recording attached">${IC.play}</button>`}`
    + `<button class=ic onclick="om('view','${r}')" title="View">${IC.eye}</button>`
    + (staff() ? `${hasItems(e) ? `<button class=ic onclick="edE('${r}')" title="Edit">${IC.pen}</button>` : `<button class="ic off" disabled title="Older record without item answers">${IC.pen}</button>`}<button class=ic onclick="om('del','${r}')" title="Delete">${IC.bin}</button>${e.seen ? '' : `<button class="ic rem" onclick="remind('${r}')" title="Remind the agent to open this review">${IC.bell}</button>`}` : '')
    + `</td></tr>`;
};
const CTBL = () => {
  const l = CR(), n = l.length, pc = Math.max(1, Math.ceil(n / PS)); if (PN > pc) PN = pc;
  const a = (PN - 1) * PS, pg = l.slice(a, a + PS), ar = k => k === SK ? (SD > 0 ? '▲' : '▼') : '↕', cols = txCols('calls');
  return card('', `<div class=row style="margin-bottom:14px"><h3 style="margin:0;display:flex;align-items:center;gap:10px">${FC ? CHN[FC] + ' reviews' : 'Reviews'} <span class=bg>${n}</span></h3>${chChips(EV.filter(e => (!FT || e.tm === FT) && (!FA || e.agent === FA) && inP(e)), FC, 'setFC')}</div><div class="sc scg" data-notools><table class=ct><tr>${cols.map(({ k, t }) => `<th aria-sort="${k === SK ? (SD > 0 ? 'ascending' : 'descending') : 'none'}"><button class=thb onclick="srt('${k}')" title="Sort by ${t.toLowerCase()}">${t} <span aria-hidden="true" style="opacity:${k === SK ? 1 : .4}">${ar(k)}</span></button></th>`).join('')}<th>ACTIONS</th></tr>${pg.map(e => rowH(e, cols)).join('') || `<tr><td colspan=${cols.length + 1} class=mu style="text-align:center;padding:30px">No call reviews match your filters</td></tr>`}</table></div>` + PGN(n, pc, a));
};
const rt = () => { const t = $('#tb'); if (t) { t.innerHTML = CTBL(); enhance(); } };
const gp = p => { PN = p; rt(); };
const srt = k => { if (SK === k) SD = -SD; else { SK = k; SD = (k === 'd' || k === 'sc') ? -1 : 1; } PN = 1; rt(); };
const sq = el => { Q = el.value; PN = 1; $$('.qi').forEach(i => { if (i !== el) i.value = Q; }); rt(); };

PG.calls = function () {
  return head('Reviews', 'View and manage the evaluations of calls, chats, emails and other conversations', `<div style="display:flex;gap:8px;flex-wrap:wrap"><div class=sx style="width:290px"><span>${IC.search}</span><input class=qi style="padding-right:64px" placeholder="Search lead ID, agent, campaign…" value="${esc(Q)}" oninput="sq(this)"><kbd class=kb>Ctrl K</kbd></div>${bellBtn()}<button class="ib ibx" onclick="xp(CR(),'Reviews')">${IC.dl} Export to Excel</button></div>`)
    + txTools('calls') + `<div id=tb>${CTBL()}</div>`;
};

// ---- open / close the review pop-up, delete, remind, play, export
async function om(t, id) {
  if (t === 'view') await load();                       // always show the latest scores and dispute messages
  MD = { t, id }; DRF = ''; render();
  if (t === 'view' && ME.role === 'agent') {                 // the agent opening their review marks it as "seen"
    const e = EVA.find(x => x.rid === id);
    if (e && !e.seen) api(`/api/evaluations/${id}/seen`, {}).then(async r => { if (r.ok) { e.seen = (await r.json()).seen; } });
  }
}
function cm() { MD = null; DRF = ''; render(); }
const rmv = rid => once('rmv', async () => { const r = await api('/api/evaluations/' + rid, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete the review'), true); MD = null; await load(); render(); toast('Review deleted'); });
const remind = rid => once('remind', async () => { const r = await api(`/api/evaluations/${rid}/remind`, {}); if (r.ok) toast('Reminder sent to the agent'); else toast(await errOf(r, 'Could not send the reminder'), true); });
function ply(rid) { const e = EVA.find(x => x.rid === rid); if (!e) return; if (recSrc(e)) { PLY = rid; render(); } else if (/^https?:\/\//.test(e.rl || '')) window.open(e.rl, '_blank', 'noopener'); }
const xp = (l, name) => once('xp', () => xpRun(l, name));
async function xpRun(l, name) {
  const cn = CATS(l), hd = ['Lead ID', 'Date', 'Agent', 'Team', 'Campaign', 'Reviewer', ...cn, 'Total Score (%)', 'Flag', 'Quick Flags', 'Status', 'Disputed', 'Comments', 'Link', 'Recording Link', 'Type', 'Chat / email link', 'Subject or channel'],   // exports are always in English (Gabriela, 28 October), whatever the screen language
    rows = [hd, ...l.map(e => [String(e.id), iso(e.d), agn(e), tn(e.tm), cpn(e), e.rv || '', ...cn.map(n => { const v = cpv(e, n); return v == null ? '' : Math.round(v * 10) / 10; }), e.sc, e.fl === 'red' ? 'Red Flag' : e.fl === 'green' ? 'Green Flag' : '', '', 'Completed', e.st === 'disputed' ? 'Yes' : 'No', [e.cm, ...(e.cs || []).flatMap(c => c.it.filter(i => i.cm).map(i => '[' + c.n + '] ' + i.cm))].filter(Boolean).join(' | '), e.lk || '', e.rl || (e.rec ? location.origin + '/api/recordings/' + e.rec : ''), CHN[chOf(e)], e.cl || '', e.subj || e.chn || ''])];
  const r = await api('/api/export/call-reviews', { rows, pf: 6, pt: 6 + cn.length, name });
  if (!r.ok) return toast('Could not create the Excel file', true);
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name.replace(/\s+/g, '_') + '_' + iso(new Date()) + '.xlsx'; a.click();
}

// Quick Flags and Disputes are in flags.js

const setFC = v => { FC = v; PN = 1; render(); };
