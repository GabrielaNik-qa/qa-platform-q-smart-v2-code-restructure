// ===================== Workforce, phase 4: Capacity planning — the fair split of the leads =====================
// Workforce › Capacity planning. Staff see the plans of a month (each for one or more teams): the campaigns and their leads
// (pasted from Excel or typed in), the people and the hours they can work, the split, the numbers of every day and the
// history. When something changes, the plan shows what changed and suggests a new split; a team lead or an admin approves
// it before the agents see it. Agents see their own leads for the month, the week and today, campaign by campaign.
// The data and the rules: routes-cap.js and cap.js.
let CAP = null, CPM = '', CPP = LS.get('qa_cpp', ''), CPT = LS.get('qa_cpt', 'split'), CPFR = '', CPI = null, CPW = null;   // CPW: the worked-leads file being checked
// the worked leads from the dialer: a ready Excel template, then the filled file (CSV or Excel), checked row by row before it counts
async function cpWorked(inp) { const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
  if (!/\.(csv|txt|xlsx)$/i.test(f.name)) return toast('Choose a CSV or Excel (.xlsx) file', true); if (f.size > 5242880) return toast('The file must be smaller than 5 MB', true);
  const file = { name: f.name, data: await b64(f) }, r = await api('/api/cap/plans/' + CAP.plan.id + '/worked', { file, preview: true }); if (!r.ok) return toast(await errOf(r, 'The file could not be read'), true);
  CPW = { file, ...(await r.json()) }; render(); }
const cpWorkedGo = () => once('cpw', async () => { const r = await api('/api/cap/plans/' + CAP.plan.id + '/worked', { file: CPW.file }); if (!r.ok) return toast(await errOf(r, 'Could not import'), true);
  const j = await r.json(); CPW = null; CAP = null; render(); toast(tr(`${j.add} rows imported`)); });
const cpWorkedCard = () => !CPW ? '' : card(`${tr('Worked leads from the dialer')} <span class=bg>${CPW.rows.length}</span>`, `<div class=row style="justify-content:flex-start;gap:10px;margin-bottom:10px">${pill(tr(`${CPW.add} rows to add`), 'ok')}${CPW.skip ? pill(tr(`${CPW.skip} skipped`), 'wn') : ''}<small class=mu data-noi18n>${esc(CPW.file.name)}</small></div>`
  + tbl(['Row', 'Values', 'What happens'], CPW.rows.map(x => [x.n, `<span data-noi18n>${esc(Object.values(x.r).filter(Boolean).join(' · '))}</span>`, x.ok ? `<span style="color:var(--ok)">✓</span> <small class=mu data-noi18n>${esc(x.what)}</small>` : `<span style="color:var(--bad)">✗ ${esc(tr(x.why))}</span>`]))
  + `<p class=mu style="margin:10px 0 0"><small>${tr('For the days in the file, these numbers replace the usual rule (a lead counts as worked when the agent was at work). A day imported again is replaced.')}</small></p><div class=acts><button class=ib onclick="CPW=null;render()">${tr('Cancel')}</button><button class=btn onclick="cpWorkedGo()" ${CPW.add ? '' : 'disabled'}>${tr('Import')}</button></div>`);   // the data, month, plan, tab, start of a new split asked for, the paste window
const cpMon = () => CPM || iso(new Date()).slice(0, 7);
const cpMonName = m => new Date(m + '-01T12:00:00').toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' });
const cpGo = n => { const [y, m] = cpMon().split('-').map(Number); CPM = n ? iso(new Date(y, m - 1 + n, 1)).slice(0, 7) : ''; if (CPM === iso(new Date()).slice(0, 7)) CPM = ''; CPFR = ''; load().then(render); };
const cpPlan = id => { CPP = id; LS.set('qa_cpp', id); CPFR = ''; load().then(render); };
const cpTab = t => { CPT = t; LS.set('qa_cpt', t); render(); };
const cpFrom = v => { CPFR = v; load().then(render); };
const cpSum = o => Object.values(o || {}).reduce((s, x) => s + x, 0);
const cpN = n => Number(n || 0).toLocaleString(I18N.locale());
const cpPct = x => (Math.round(x * 1000) / 10).toLocaleString(I18N.locale()) + '%';
const cpHead = c => `${esc(c.name)}${c.segment && !c.name.includes(c.segment) ? `<br><small class=mu>${esc(c.segment)}</small>` : ''}`;
const cpCamp = c => `<b>${esc(c.name)}</b>${c.brand || c.segment ? `<br><small class=mu>${esc([c.brand, c.segment].filter(Boolean).join(' · '))}</small>` : ''}`;
// what changed since the last split, in words
const cpWhy = r => r.k === 'leads' ? tr(`${r.name}: ${r.before} → ${r.now} leads`) : r.k === 'camp' ? tr(`New campaign: ${r.name} (${r.n} leads)`) : r.k === 'gone' ? tr(`Campaign removed: ${r.name}`)
  : r.k === 'pct' ? tr(`${r.name}: share ${r.before}% → ${r.now}%`)
  : r.k === 'new' ? tr(`New in the plan: ${r.name} (${r.h} h in the days left)`) : r.k === 'out' ? tr(`No longer in the plan: ${r.name}`)
  : r.k === 'hours' ? tr(r.h < 0 ? `${r.name}: ${-r.h} h less in the days left` : `${r.name}: ${r.h} h more in the days left`) : r.k === 'lost' ? tr(`${r.name}: ${r.n} leads not worked (absent or away)`) : '';
// the days of one person's month: their leads of every working day (days that are over are pale; days not worked are struck out)
const cpStrip = (days, today) => `<div class=cpd>${days.filter(x => x.n !== null).map(x => `<div class="${x.d < today ? 'past' : ''}${x.d === today ? ' now' : ''}${x.lost ? ' lost' : ''}"${x.lost ? ` title="${esc(tr('Not worked'))}"` : ''}><small>${wfDay(x.d, { weekday: 'short', day: 'numeric' })}</small><b>${x.n}</b></div>`).join('')}</div>`;

// ---------------------------------------------------------------- agents: my leads
function cpMine() {
  const L = CAP.mine || [], today = iso(new Date());
  if (!L.length) return card('', `<p class=mu style="margin:0">${tr('No leads for you this month yet. Your team lead publishes them here.')}</p>`);
  return L.map(x => card(esc(x.name), `<div class=tdks>${tdTile(cpN(x.today), 'Today', 'ac')}${tdTile(cpN(x.week), 'This week')}${tdTile(cpN(x.total), 'This month')}${tdTile(cpN(x.left), 'Left this month')}${x.lost ? tdTile(cpN(x.lost), 'Not worked', 'bad') : ''}</div>
<p class=mu style="margin:0 0 10px;font-size:12.5px">${esc(tr(`Your share of every campaign: ${cpPct(x.share)}. Split on ${wfDay(x.from)}.`))} ${tr('Everybody gets the same share of every campaign, sized by the hours they can work.')}</p>`
    + tbl(['Campaign', 'Today', 'This week', 'This month', 'Still to do'], x.campaigns.map(c => [cpCamp(c), c.today ? `<b>${cpN(c.today)}</b>` : '—', cpN(c.week), cpN(c.month), cpN(c.left)]))
    + cpStrip(x.days, today))).join('');
}

// ---------------------------------------------------------------- staff: the plans of a month
PG.cap = function () {
  const staff = isStaffR(), top = head('Capacity planning', staff ? 'The leads of every campaign, split fairly among the agents' : 'My leads for the month, the week and today', bellBtn());
  const P = CAP && CAP.plan, plans = (CAP && CAP.plans) || [];
  const pick = staff && plans.length > 1 ? `<select style="width:auto" onchange="cpPlan(this.value)" aria-label="${esc(tr('Plan'))}">${plans.map(p => `<option value="${p.id}" ${P && p.id === P.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : '';
  const acts = staff && CAP ? (CAP.canNew ? `<button class=ib onclick="cpNew()">${IC.plus} ${tr('New plan')}</button>` : '') + (P && P.canEdit ? `<a class=ib href="/api/cap/plans/${P.id}/worked-template" download title="${esc(tr('An Excel file with the agents and campaigns of this plan, to fill with the worked leads'))}">${IC.dl} ${tr('Worked leads template')}</a><label class=ib style="cursor:pointer">${tr('Import worked leads')}<input type=file accept=".csv,.txt,.xlsx" style="display:none" onchange="cpWorked(this)"></label><button class=ib onclick="cpEditPlan()">${IC.pen} ${tr('Name and teams')}</button><button class=ib onclick="cpDel()" title="${esc(tr('Delete the plan'))}" aria-label="${esc(tr('Delete the plan'))}">${IC.bin}</button>` : '') : '';
  const nav = `<div class=row style="gap:8px;flex-wrap:wrap;margin:0 0 12px;justify-content:flex-start"><div class=sg role=group aria-label="${esc(tr('Month'))}"><button onclick="cpGo(-1)" aria-label="${esc(tr('Previous month'))}">‹</button><button onclick="cpGo(0)" class="${CPM ? '' : 'on'}">${tr('This month')}</button><button onclick="cpGo(1)" aria-label="${esc(tr('Next month'))}">›</button></div><b>${esc(cpMonName(cpMon()))}</b>${pick}<span style="flex:1"></span>${acts}</div>`;
  if (!CAP) return top + nav + card('', '<p class=mu style="margin:0">…</p>');
  if (!staff) return top + nav + cpMine();
  if (!P) return top + nav + card('', `<p style="margin:0 0 10px">${esc(tr(`No plan for ${cpMonName(cpMon())} yet.`))}</p><ol class=mu style="margin:0;padding-left:18px;line-height:1.7">${['Make a plan for the month and choose the teams whose agents share the leads.', 'Add the campaigns and their leads: paste them from Excel (campaign, brand, segment, leads).', 'Check the people: the hours they can work come from the rota and time off.', 'Publish: every agent sees their leads for the month, the week and the day.'].map(s => `<li>${tr(s)}</li>`).join('')}</ol>`);
  const live = !!P.version, leads = P.campaigns.filter(c => !c.old).reduce((s, c) => s + c.leads, 0), assigned = cpSum(P.assigned), members = P.people.filter(x => x.member).length;
  const status = `<div class=row style="gap:8px;flex-wrap:wrap;justify-content:flex-start;margin:0 0 12px">${live ? pill(tr('Published'), 'ok') : pill(tr('Not published yet'), 'wn')}<small class=mu>${live ? esc(tr(`The last split: ${fdt(P.version.at)} by ${P.version.by}, from ${wfDay(P.version.from)}.`)) : tr('The agents do not see it yet.')} ${esc(P.teams.map(tn).join(', '))}</small></div>`;
  const tiles = `<div class=tdks>${tdTile(cpN(leads), 'Leads')}${tdTile(members, 'Agents')}${live ? tdTile(cpN(assigned), 'Assigned', 'ok') + tdTile(cpN(leads - assigned), 'Not assigned', leads !== assigned ? 'bad' : '') : tdTile(P.preview ? cpN(P.preview.people.reduce((s, x) => s + x.hours, 0)) + '<small> h</small>' : '—', 'Hours to work')}</div>`;
  const tabs = [['split', 'Split'], ...(live ? [['days', 'By day']] : []), ['camps', 'Campaigns'], ['people', 'People'], ...(live ? [['hist', 'History']] : [])], t = tabs.some(x => x[0] === CPT) ? CPT : 'split';
  const bar = `<div class=sg role=tablist style="margin:0 0 12px">${tabs.map(([k, l]) => `<button role=tab class="${t === k ? 'on' : ''}" aria-selected="${t === k}" onclick="cpTab('${k}')">${tr(l)}</button>`).join('')}</div>`;
  const body = t === 'days' ? cpDays(P) : t === 'camps' ? cpCamps(P) : t === 'people' ? cpPeople(P) : t === 'hist' ? cpHist(P) : live ? cpSplitLive(P) : cpSplitDraft(P);
  const wk = P.actualDays ? `<p class=mu style="margin:-6px 0 12px"><small>${tr(`Worked leads from the dialer: ${P.actualDays} days imported`)}${P.actualAt ? ' · ' + fdt(P.actualAt) : ''}</small></p>` : '';
  return top + nav + cpWorkedCard() + status + wk + tiles + (live && P.preview ? cpChanges(P) : '') + bar + body;
};
// the changes since the last split, and the new split the app suggests (before → after for every person)
function cpChanges(P) {
  const pv = P.preview, today = iso(new Date()), canToday = pv.from !== today && P.from > today && today >= P.days[0];
  const from = P.canEdit && (canToday || CPFR) ? `<div class=sg role=group aria-label="${esc(tr('The new split starts'))}"><button class="${CPFR === today ? '' : 'on'}" onclick="cpFrom('')">${tr('From tomorrow')}</button><button class="${CPFR === today ? 'on' : ''}" onclick="cpFrom('${today}')">${tr('From today')}</button></div>` : '';
  const rows = pv.people.map(x => { const d = x.total - x.before;
    return [esc(x.name), cpN(x.hours) + ' h', cpPct(x.share), cpN(x.before), `<b>${cpN(x.total)}</b>${d ? ` <small style="color:${d > 0 ? 'var(--ok)' : 'var(--wn)'}">${d > 0 ? '+' : ''}${cpN(d)}</small>` : ''}`]; });
  return card(`<span style="color:var(--wn)">${IC.warn}</span> ${tr(P.reasons.length ? 'Things changed since the last split' : 'Split the leads again')}`,
    (P.reasons.length ? `<ul style="margin:0 0 10px;padding-left:18px;line-height:1.6">${P.reasons.map(r => `<li>${esc(cpWhy(r))}</li>`).join('')}</ul>` : '')
    + `<p class=mu style="margin:0 0 8px;font-size:12.5px">${esc(tr(`The app suggests a new split of the ${cpSum(pv.pool)} leads not worked yet, from ${wfDay(pv.from)}.`))}</p>`
    + tbl(['Person', 'Hours in the days left', 'Share', 'Current split', 'New split'], rows)
    + (P.canEdit ? `<div class=row style="gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px">${from}<button class=btn onclick="cpPublish()">${tr('Approve the new split')}</button>${CPFR && !P.reasons.length ? `<button class=ib onclick="cpFrom('')">${tr('Cancel')}</button>` : ''}</div><small class=mu style="display:block;margin-top:6px">${tr('The agents keep their current numbers until you approve.')}</small>`
      : `<small class=mu>${tr('A team lead or an admin approves the new split.')}</small>`));
}
// a plan not published yet: the split the app suggests, and the button that publishes it
function cpSplitDraft(P) {
  const pv = P.preview;
  if (!pv) return card('', `<p class=mu style="margin:0">${tr(!P.open ? 'This month is over.' : P.why || 'Add the campaigns of the month first.')}</p>${P.open && P.canEdit && !P.campaigns.length ? `<button class=btn style="margin-top:10px" onclick="cpTab('camps');cpImp()">${IC.dl} ${tr('Paste from Excel')}</button>` : ''}`);
  const C = P.campaigns.filter(c => pv.pool[c.id]);
  // the totals first, so they stay in view when there are many campaigns
  const rows = pv.people.map(x => [esc(x.name), cpN(x.hours) + ' h', cpPct(x.share), `<b>${cpN(x.total)}</b>`, `<small class=mu>${(Math.round(x.exact * 100) / 100).toLocaleString(I18N.locale())}</small>`, x.days ? cpN(Math.round(x.total / x.days)) : '—', ...C.map(c => cpN(x.split[c.id] || 0))]);
  rows.push([`<b>${tr('Leads')}</b>`, '', '', `<b>${cpN(cpSum(pv.pool))}</b>`, '', '', ...C.map(c => `<b>${cpN(pv.pool[c.id])}</b>`)]);
  return card(esc(tr(`The split from ${wfDay(pv.from)}`)), `<p class=mu style="margin:0 0 10px;font-size:12.5px">${tr('Everybody gets the same share of every campaign, sized by the hours they can work. Whole leads only: every campaign adds up, and nobody is a whole lead away from their exact fair total.')} ${esc(tr(`Biggest gap: ${pv.gap} leads.`))}</p>`
    + tbl(['Person', 'Hours to work', 'Share', 'Total', 'Exact', 'A day', ...C.map(cpHead)], rows)
    + `<div class=row style="gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px">${P.canEdit ? `<button class=btn onclick="cpPublish()">${tr('Publish to the agents')}</button>` : ''}<button class=ib onclick="cpExcel('split')">${IC.copy} ${tr('Copy for Excel')}</button></div>`);
}
// a published plan: every person's leads of every campaign for the month (days not worked apart), today, this week, left
function cpSplitLive(P) {
  const C = P.campaigns.filter(c => !c.old || P.assigned[c.id]), multi = P.teams.length > 1, ppl = P.people.filter(x => x.member || x.total || x.lost);
  const rows = ppl.map(x => [`<b>${esc(x.name)}</b>${x.member ? '' : `<br><small class=mu>${tr('no longer in the plan')}</small>`}`, ...(multi ? [esc(tn(x.team))] : []), `<b>${cpN(x.total)}</b>`, cpN(x.today), cpN(x.week), cpN(x.left), x.lost ? `<span style="color:var(--bad)">${cpN(x.lost)}</span>` : '—', ...C.map(c => cpN(x.month[c.id] || 0))]);
  const foot = (l, f, all) => [`<b>${tr(l)}</b>`, ...(multi ? [''] : []), all, '', '', '', '', ...C.map(f)];
  const gap = c => c.leads - (P.assigned[c.id] || 0), lead = C.reduce((s, c) => s + c.leads, 0), asg = cpSum(P.assigned);
  rows.push(foot('Assigned', c => cpN(P.assigned[c.id] || 0), `<b>${cpN(asg)}</b>`), foot('Leads', c => cpN(c.leads), `<b>${cpN(lead)}</b>`),
    foot('Not assigned', c => gap(c) ? `<b style="color:var(--bad)">${cpN(gap(c))}</b>` : '0', lead - asg ? `<b style="color:var(--bad)">${cpN(lead - asg)}</b>` : '0'));
  const again = P.canEdit && P.open && !P.preview ? `<button class=ib onclick="cpFrom('${P.from}')">${tr('Split again')}</button>` : '';
  return card('', tbl(['Person', ...(multi ? ['Team'] : []), 'This month', 'Today', 'This week', 'Still to do', 'Not worked', ...C.map(cpHead)], rows)
    + `<p class=mu style="margin:10px 0 0;font-size:12.5px">${tr('A lead counts as worked when its day is over and the person was at work that day (from the check-ins). The leads of days not worked go back into the next split.')}</p>`
    + `<div class=row style="gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px">${again}<button class=ib onclick="cpExcel('split')">${IC.copy} ${tr('Copy for Excel')}</button></div>`);
}
// every person's leads of every day of the month
function cpDays(P) {
  const today = iso(new Date()), D = P.days, ppl = P.people.filter(x => x.byDay.some(n => n !== null)), cols = D.map((d, i) => i).filter(i => ppl.some(x => x.byDay[i] !== null));
  if (!ppl.length) return card('', `<p class=mu style="margin:0">${tr('Nobody has leads this month yet.')}</p>`);
  const cell = (x, i) => { const n = x.byDay[i], lost = x.lostAt.includes(i); return `<td class="${D[i] < today ? 'past' : ''}${lost ? ' lost' : ''}"${lost ? ` title="${esc(tr('Not worked'))}"` : ''}>${n === null ? '·' : n}</td>`; };
  return card('', `<div class=sc data-notools><table class="ct cpg"><thead><tr><th>${tr('Person')}</th>${cols.map(i => `<th class="${D[i] === today ? 'tdy' : ''}">${wfDay(D[i], { weekday: 'short', day: 'numeric' })}</th>`).join('')}<th>${tr('Total')}</th></tr></thead>
<tbody>${ppl.map(x => `<tr><td><b>${esc(x.name)}</b></td>${cols.map(i => cell(x, i)).join('')}<td><b>${cpN(x.total)}</b></td></tr>`).join('')}</tbody>
<tfoot><tr><td><b>${tr('Everybody')}</b></td>${cols.map(i => `<td><b>${ppl.reduce((s, x) => s + (x.lostAt.includes(i) ? 0 : x.byDay[i] || 0), 0)}</b></td>`).join('')}<td></td></tr></tfoot></table></div>
<div class=row style="gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px"><small class=mu style="flex:1">${tr('Days that are over are pale; days not worked are struck out (absent or away).')}</small><button class=ib onclick="cpExcel('days')">${IC.copy} ${tr('Copy for Excel')}</button></div>`);
}
function cpCamps(P) {
  const C = P.campaigns.filter(c => !c.old), ed = P.canEdit && P.open, live = !!P.version;
  const tools = ed ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px"><button class=btn onclick="cpImp()">${IC.dl} ${tr('Paste from Excel')}</button><button class=ib onclick="cpCampEdit('')">${IC.plus} ${tr('Add a campaign')}</button></div>` : '';
  return card('', tools + (C.length ? tbl(['Campaign', 'Brand', 'Segment', 'Leads', ...(live ? ['Assigned'] : []), ...(ed ? [''] : [])], C.map(c => [`<b>${esc(c.name)}</b>`, esc(c.brand) || '—', esc(c.segment) || '—', `<b class=mono>${cpN(c.leads)}</b>`, ...(live ? [cpN(P.assigned[c.id] || 0)] : []),
    ...(ed ? [`<span style="white-space:nowrap"><button class=ic onclick="cpCampEdit('${c.id}')" title="${esc(tr('Edit'))}" aria-label="${esc(tr('Edit') + ' · ' + c.name)}">${IC.pen}</button><button class=ic onclick="cpCampDel('${c.id}')" title="${esc(tr('Delete'))}" aria-label="${esc(tr('Delete') + ' · ' + c.name)}">${IC.bin}</button></span>`] : [])]))
    : `<p class=mu style="margin:0">${tr('No campaigns yet.')}</p>`)
    + (live && ed ? `<small class=mu style="display:block;margin-top:8px">${tr('The agents see changes only after you approve the new split.')}</small>` : ''));
}
function cpPeople(P) {
  const capOf = u => (P.capacity || []).find(x => x.u === u) || {}, ed = P.canEdit && P.open, multi = P.teams.length > 1, mem = P.people.filter(x => x.member);
  return card('', (mem.length ? tbl(['Person', ...(multi ? ['Team'] : []), esc(tr(`Hours from ${wfDay(P.from)}`)), 'Working days', 'Share'], mem.map(x => { const c = capOf(x.u);
    return [`<b>${esc(x.name)}</b>`, ...(multi ? [esc(tn(x.team))] : []), c.hours != null ? cpN(c.hours) + ' h' : '—', c.days != null ? c.days : '—',
      ed ? `<input type=number min=0 max=200 step=10 value="${x.pct}" style="width:80px" onchange="cpShare(${jsq(x.u)},this.value)" aria-label="${esc(tr('Share') + ' · ' + x.name)}"> %` : x.pct + ' %']; }))
    : `<p class=mu style="margin:0">${tr('No agents in these teams yet.')}</p>`)
    + `<p class=mu style="margin:10px 0 0;font-size:12.5px">${tr('The hours come from the rota, public holidays and approved time off, so part-timers and people on leave get less. Share: 100% as usual, 50% for somebody still learning, 0% to leave somebody out.')}</p>`);
}
function cpHist(P) {
  return card('', P.history.map(h => `<div style="padding:8px 0;border-bottom:1px solid var(--bd)"><b>${esc(tr(`Split ${h.no}, from ${wfDay(h.from)}`))}</b> · ${esc(h.by)} · <small class=mu>${fdt(h.at)}</small><br><small>${esc(tr(`${h.leads} leads, ${h.people} people`))}</small>${h.why.length ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:12.5px">${h.why.map(r => `<li>${esc(cpWhy(r))}</li>`).join('')}</ul>` : ''}</div>`).join(''));
}

// ---------------------------------------------------------------- planning: plans, campaigns, shares, publishing
const cpMonths = () => { const [y, m] = iso(new Date()).slice(0, 7).split('-').map(Number); return [-1, 0, 1, 2, 3].map(k => iso(new Date(y, m - 1 + k, 1)).slice(0, 7)); };
const cpTeamsF = () => ({ k: 'teams', l: 'Teams', t: 'multi', o: () => TEAMS.filter(t => !t.system).map(t => [t.id, t.name]), hint: 'The agents of these teams share the leads.' });
const cpNew = () => { const m0 = cpMon(), mine = TEAMS.filter(t => !t.system && t.lead === ME.username).map(t => t.id);
  openForm({ title: tr('New plan'), yes: 'Create', d: { name: '', month: cpMonths().includes(m0) ? m0 : cpMonths()[1], teams: mine },
    fields: [{ k: 'month', l: 'Month', t: 'select', o: () => cpMonths().map(m => [m, cpMonName(m)]) }, { k: 'name', l: 'Name', ph: tr('For example: Collections') }, cpTeamsF()],
    save: async d => {
      if (!d.teams.length) return tr('Choose at least one team');
      const r = await api('/api/cap/plans', { month: d.month, name: d.name || tr(`Leads ${cpMonName(d.month)}`), teams: d.teams }); if (!r.ok) return errOf(r, 'Could not create the plan');
      const j = await r.json(); CPM = d.month === iso(new Date()).slice(0, 7) ? '' : d.month; CPT = 'camps'; LS.set('qa_cpt', 'camps'); cpPlan(j.id); toast('Plan created');
    } }); };
const cpPut = async (body, msg) => { const r = await api('/api/cap/plans/' + CAP.plan.id, body, 'PUT'); if (!r.ok) return errOf(r, 'Could not save'); await load(); render(); if (msg) toast(msg); };
const cpEditPlan = () => { const P = CAP.plan;
  openForm({ title: tr('Name and teams'), yes: 'Save', d: { name: P.name, teams: P.teams.slice() }, fields: [{ k: 'name', l: 'Name', req: 1 }, cpTeamsF()],
    save: d => d.teams.length ? cpPut({ name: d.name, teams: d.teams }, 'Saved') : tr('Choose at least one team') }); };
const cpDel = () => { const P = CAP.plan;
  ask(`Delete “${P.name}”?`, P.version ? 'The agents will no longer see these leads.' : 'Nobody has seen it yet.', () => once('cpdel', async () => {
    const r = await api('/api/cap/plans/' + P.id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete'), true);
    CPP = ''; LS.set('qa_cpp', ''); await load(); render(); toast('Plan deleted'); }), { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
const cpShare = (u, v) => once('cpshare', () => cpPut({ pct: { [u]: v } }).then(e => { if (e) toast(e, true); }));
const cpCampEdit = id => { const P = CAP.plan, c = P.campaigns.find(x => x.id === id);
  openForm({ title: c ? tr('Edit the campaign') : tr('Add a campaign'), yes: 'Save', d: c ? { ...c } : { name: '', brand: '', segment: '', leads: '' },
    fields: [{ k: 'brand', l: 'Brand', ph: 'Brand A' }, { k: 'segment', l: 'Segment', ph: '0-30, 30-60, 360+…', hint: 'Name the segments the way your company does.' }, { k: 'name', l: 'Campaign', ph: tr('Brand and segment, if empty') }, { k: 'leads', l: 'Leads', t: 'number', req: 1 }],
    save: d => { const row = { ...d, leads: d.leads === '' ? '' : Number(d.leads) }, list = c ? P.campaigns.filter(x => !x.old).map(x => x.id === c.id ? row : x) : [...P.campaigns.filter(x => !x.old), row];
      return cpPut({ campaigns: list }, c ? 'Campaign saved' : 'Campaign added'); } }); };
const cpCampDel = id => { const P = CAP.plan, c = P.campaigns.find(x => x.id === id);
  ask(`Delete “${c.name}”?`, P.version ? 'Its leads leave the plan when you approve the new split.' : 'Its leads leave the plan.', () => once('cpcdel', async () => { const e = await cpPut({ campaigns: P.campaigns.filter(x => !x.old && x.id !== id) }, 'Campaign deleted'); if (e) toast(e, true); }), { yes: 'Yes, delete', no: 'Cancel', danger: true }); };
const cpPublish = () => { const P = CAP.plan, pv = P.preview, first = !P.version;
  ask(first ? 'Publish the split to the agents?' : 'Approve the new split?', tr(first ? `Every agent gets a notification and sees their leads for every day from ${wfDay(pv.from)}.` : `From ${wfDay(pv.from)}, every agent gets their new numbers and a notification.`), () => once('cppub', async () => {
    const r = await api(`/api/cap/plans/${P.id}/publish`, { from: pv.from }); if (!r.ok) return toast(await errOf(r, 'Could not publish'), true);
    CPFR = ''; await load(); render(); toast(first ? 'Published to the agents' : 'The new split is published');
  }), { yes: first ? 'Yes, publish' : 'Yes, approve', no: 'Cancel' }); };
// the split as a table for Excel: one row per person, one column per campaign (or per day)
const cpExcel = k => { const P = CAP.plan;
  if (k === 'days') { const ppl = P.people.filter(x => x.byDay.some(n => n !== null)); return xlCopy([[tr('Person'), ...P.days.map(d => wfDay(d)), tr('Total')], ...ppl.map(x => [x.name, ...x.byDay.map((n, i) => n === null ? '' : x.lostAt.includes(i) ? 0 : n), x.total])]); }
  if (!P.version && P.preview) { const C = P.campaigns.filter(c => P.preview.pool[c.id]); return xlCopy([[tr('Person'), tr('Hours to work'), ...C.map(c => c.name), tr('Total')], ...P.preview.people.map(x => [x.name, x.hours, ...C.map(c => x.split[c.id] || 0), x.total])]); }
  const C = P.campaigns.filter(c => !c.old || P.assigned[c.id]);
  xlCopy([[tr('Person'), ...C.map(c => c.name), tr('This month'), tr('Today'), tr('Still to do')], ...P.people.filter(x => x.member || x.total).map(x => [x.name, ...C.map(c => x.month[c.id] || 0), x.total, x.today, x.left])]); };

// ---------------------------------------------------------------- pasting the leads from Excel
// one row per campaign: campaign, brand, segment, leads (with a header row the columns can be in any order);
// three columns = brand, segment, leads; two = campaign, leads. "1 240", "1,240" and "1.240" are all 1240.
function cpParse(txt) {
  const lines = String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (!lines.length) return { rows: [], bad: [] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',', num = v => /^\d[\d\s.,'’]*$/.test(v) ? Number(v.replace(/[\s.,'’]/g, '')) : NaN;
  let cells = lines.map(l => l.split(sep).map(x => x.trim().replace(/^"(.*)"$/, '$1'))), cols = null;
  if (isNaN(num(cells[0][cells[0].length - 1] || ''))) {
    const h = cells[0].map(x => x.toLowerCase()), at = words => h.findIndex(x => words.some(w => x.includes(w)));
    cols = { name: at(['campaign', 'кампания', 'campagne', 'name', 'име', 'nom']), brand: at(['brand', 'бранд', 'марка', 'marque']), segment: at(['segment', 'сегмент', 'bucket', 'dpd']), leads: at(['lead', 'лийд', 'count', 'number', 'брой', 'nombre', 'qty']) };
    if (cols.leads < 0) cols.leads = h.length - 1; cells = cells.slice(1);
  }
  const rows = [], bad = [];
  cells.forEach((c, i) => {
    const pick = k => cols ? (cols[k] >= 0 ? c[cols[k]] || '' : '') : '';
    const r = cols ? { name: pick('name'), brand: pick('brand'), segment: pick('segment'), leads: num(pick('leads')) }
      : c.length >= 4 ? { name: c[0], brand: c[1], segment: c[2], leads: num(c[3]) } : c.length === 3 ? { name: '', brand: c[0], segment: c[1], leads: num(c[2]) } : { name: c[0], brand: '', segment: '', leads: num(c[1] || '') };
    r.name = r.name || [r.brand, r.segment].filter(Boolean).join(' ');
    if (!r.name || !Number.isInteger(r.leads)) bad.push(i + (cols ? 2 : 1)); else rows.push(r);
  });
  return { rows, bad };
}
const cpImp = () => { CPI = { txt: '', mode: 'add' }; render(); };
const cpImpTable = r => r.rows.length || r.bad.length ? (r.bad.length ? `<p style="color:var(--bad);margin:0 0 6px;font-size:12.5px">${esc(tr(`Lines without a campaign or a number of leads: ${r.bad.join(', ')}`))}</p>` : '')
  + (r.rows.length ? tbl(['Campaign', 'Brand', 'Segment', 'Leads'], r.rows.slice(0, 50).map(x => [esc(x.name), esc(x.brand) || '—', esc(x.segment) || '—', `<b class=mono>${cpN(x.leads)}</b>`])) + (r.rows.length > 50 ? `<small class=mu>${tr(`and ${r.rows.length - 50} more`)}</small>` : '') : '') : '';
const cpImpPrev = () => { const el = document.getElementById('cpprev'); if (el) el.innerHTML = cpImpTable(cpParse(CPI.txt)); };
function CPIM() {
  const live = CAP && CAP.plan && CAP.plan.version;
  return OVL(`<div class=mh><h2>${tr('Paste the leads from Excel')}</h2>${X('CPI=null;render()')}</div><div class=mb><div class=form style="max-width:none">
<p class=mu style="margin:0;font-size:12.5px">${tr('Copy the rows in Excel and paste them here: campaign, brand, segment and number of leads. A header row is fine. With three columns: brand, segment and leads.')}</p>
<textarea rows=8 oninput="CPI.txt=this.value;cpImpPrev()" aria-label="${esc(tr('Paste the leads from Excel'))}" placeholder="Brand A 0-30&#9;Brand A&#9;0-30&#9;1240">${esc(CPI.txt)}</textarea>
<div class=chk>${[['add', 'Add these leads to the campaigns already in the plan (new leads arriving)'], ['replace', 'Replace the whole list with these campaigns']].map(([k, l]) => `<label class=rad><input type=radio name=cpim ${CPI.mode === k ? 'checked' : ''} onchange="CPI.mode='${k}'"> ${tr(l)}</label>`).join('')}</div>
<div id=cpprev>${cpImpTable(cpParse(CPI.txt))}</div>${live ? `<small class=mu>${tr('The agents see the new leads only after you approve the new split.')}</small>` : ''}</div>
<div class=acts><button class=ib onclick="CPI=null;render()">Cancel</button><button class=btn onclick="cpImpSave()">${tr('Import')}</button></div></div>`, 'CPI=null;render()', 720);
}
const cpImpSave = () => once('cpimp', async () => {
  const r = cpParse(CPI.txt), P = CAP.plan; if (!r.rows.length) return toast('Paste at least one campaign with its leads', true);
  const key = s => s.trim().toLowerCase(), cur = P.campaigns.filter(c => !c.old).map(c => ({ ...c })), byName = new Map(cur.map(c => [key(c.name), c]));
  let list;
  if (CPI.mode === 'replace') { const seen = new Map(); r.rows.forEach(x => { const k = key(x.name), was = byName.get(k), p = seen.get(k); if (p) p.leads += x.leads; else seen.set(k, { ...x, id: was ? was.id : undefined }); }); list = [...seen.values()]; }
  else { list = cur; r.rows.forEach(x => { const c = byName.get(key(x.name)); if (c) c.leads += x.leads; else { const n = { ...x }; list.push(n); byName.set(key(x.name), n); } }); }
  const e = await cpPut({ campaigns: list }); if (e) return toast(e, true);
  CPI = null; render(); toast(tr(`${r.rows.length} campaigns imported`));
});

// dashboard (agents): my leads for today
wdef('dash', 'cap_me', 'My leads today', 60, (c, s, x) => card(wt(x, 'My leads today'), (!CAP || !CAP.mine ? '<p class=mu style="margin:0">…</p>' : CAP.mine.length ? CAP.mine.map(p => `<div class=tdg><b>${esc(p.name)} <span class=bg>${p.today}</span></b>${p.campaigns.filter(k => k.today).map(k => `<div class=tdp><span>${esc(k.name)}</span><b>${k.today}</b></div>`).join('') || `<small class=mu>${tr('No leads planned for today.')}</small>`}</div>`).join('')
  : `<p class=mu style="margin:0">${tr('No leads planned for today.')}</p>`) + `<a href="javascript:void(0)" class=agl onclick="goPage('cap')">${tr('Open Capacity planning ›')}</a>`), 'My leads of every campaign for today', 'Lists');
