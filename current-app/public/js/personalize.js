// ===================== Home › Personalize: your dashboards, AutoQA and Tasks =====================
// The Dashboard, AutoQA and Tasks pages only show; everything you choose about them is here. Dashboard: choose your home among the
// ready-made dashboards and your own (named as you like; admins and QA can share them), and with "Display" switch each widget on or
// off and choose how the data is counted. The widgets keep their preset name, size and place. AutoQA: switch its widgets on or off.
// Tasks: how task cards look and which tab opens first. Admins can also arrange a dashboard by hand here ("Arrange": move and resize).
let PST = LS.get('qa_pst', 'dash'), PSEL = LS.get('qa_psel', 'std'), PDSP = false, PARR = false;   // the tab, the dashboard shown here, the Display panel is open, an admin is arranging
const pTab = t => { PST = t; LS.set('qa_pst', t); PDSP = false; PARR = false; render(); };
const pSel = id => { PSEL = id; LS.set('qa_psel', id); PDSP = false; PARR = false; render(); };
const pBase = v => { DBASE = v; LS.set('qa_dbase', v); render(); };
const pGran = v => { DGR = v; LS.set('qa_dgr', v); render(); };
const pTkTab = t => { LS.set('qa_tktab', t); TV.tab = t; render(); };
const pWho = v => v.kind === 'std' ? tr('Shown on your Dashboard page') : v.kind === 'tpl' ? tr(v.desc || 'Ready-made') : v.kind === 'shared' ? tr(`Shared with ${v.roles.map(r => r === 'all' ? tr('everyone') : ROLE[r]).join(', ')}`) : tr('Only you');
const dThumb = items => `<div class=dthumb>${wPack('dash', items).slice(0, 12).map(z => `<i style="width:calc(${(z.sp / 60 * 100).toFixed(1)}% - 3px)"></i>`).join('')}</div>`;
// one switch per widget: on = it is on this view (the size and place are preset)
const pSwitch = (page, vid, id, on, ed) => { const r = WREG[page][id]; return `<label class=pdt title="${esc(tr(r.desc || ''))}"><input type=checkbox class=switch ${on ? 'checked' : ''} ${ed ? '' : 'disabled'} onchange="wToggle('${page}',${jsq(vid)},'${id}',this.checked)"><span>${esc(tr(r.title))}</span></label>`; };
const pSeg = (cur, opts, fn) => `<div class=sg role=group>${opts.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}" onclick="${fn}('${k}')">${tr(l)}</button>`).join('')}</div>`;

// ---- the dashboards: yours, the ready-made ones, and the one shown below
function pGallery() {
  const tile = (v, name, sub, ic) => `<button class="pgc ${PSEL === v.id ? 'on' : ''}" aria-pressed="${PSEL === v.id}" onclick="pSel(${jsq(v.id)})"><span class=pgh>${ic ? `<span class=dgi>${IC[ic] || ''}</span>` : ''}<b>${esc(name)}</b></span><small class=mu>${esc(sub)}</small>${dThumb(itemsOf('dash', v))}</button>`;
  const named = namedOf('dash');
  return `<h3 class=pgt>${tr('Your home dashboard')}</h3><div class=pgr>${tile(curView('dash', 'std'), tr('My home dashboard'), pWho({ kind: 'std' }), 'g_home')}</div>`
    + `<h3 class=pgt>${tr('Yours')}</h3><div class=pgr>${named.map(v => tile(v, v.name, pWho(v))).join('')}<button class="pgc pgnew" onclick="wNewView('dash')"><span class=pgh><span class=dgi>${IC.plus}</span><b>${tr('New dashboard')}</b></span><small class=mu>${tr('Name it as you like, then switch its widgets on or off')}</small></button></div>`
    + `<h3 class=pgt>${tr('Ready-made')}</h3><div class=pgr>${dashTpls().map(t => tile(t, tr(t.name), tr(t.desc), t.ic)).join('')}</div>`;
}
function pDash() {
  const v = curView('dash', PSEL), ed = canEditView(v), adm = ME.role === 'admin', home = v.kind === 'std';
  if (v.id !== PSEL) PSEL = v.id;
  const arr = canArrange() && ed, man = isArr(itemsOf('dash', v));
  const tools = `<button class="btn ibx" onclick="PDSP=true;render()">${TIC.list || IC.list} ${tr('Display')}</button>`
    + (arr ? `<button class="ib ibx${PARR ? ' on' : ''}" aria-pressed="${PARR}" onclick="PARR=!PARR;render()">${IC.pen} ${tr(PARR ? 'Done arranging' : 'Arrange')}</button>` : '')
    + (arr && man ? `<button class="ib ibx" onclick="wArrAuto('dash',${jsq(v.id)})" title="${esc(tr('Back to the preset order and sizes, packed with no empty spaces'))}">${tr('Automatic layout')}</button>` : '')
    + (!home ? `<button class="ib ibx" onclick="dvUse(${jsq(v.id)})">${IC.g_home} ${tr('Use as my home')}</button>` : '')
    + (!ed ? `<button class="ib ibx" onclick="wNewView('dash',${jsq(v.id)})">${IC.plus} ${tr('Make my own copy')}</button>` : '')
    + (ed && !home ? `<button class=ic onclick="pRename()" title="${esc(tr('Rename'))}" aria-label="${esc(tr('Rename'))}">${IC.pen}</button><button class=ic onclick="wDelView('dash',${jsq(v.id)})" title="${esc(tr('Delete'))}" aria-label="${esc(tr('Delete'))}">${IC.bin}</button>` : '')
    + (adm && home ? `<select style="width:auto" aria-label="${esc(tr('View as'))}" onchange="WPREV=this.value==='me'?'':this.value;render()"><option value=me>${tr('View as: me')}</option>${Object.entries(ROLE).map(([k, n]) => `<option value=${k} ${WPREV === k ? 'selected' : ''}>${tr(`View as: ${n}`)}</option>`).join('')}</select>` : '');
  const name = home ? tr('My home dashboard') : v.kind === 'tpl' ? tr(v.name) : v.name;
  const note = home ? (WPREV ? tr(`You see the home dashboard of every ${ROLE[WPREV]} who has not chosen their own.`) : tr('This is what your Dashboard page shows.'))
    : v.kind === 'tpl' ? tr('A ready-made dashboard stays as it is: use it as your home, or make your own copy to change it.') : pWho(v);
  const ctxOf = dashCtxOf();
  try {
    return `<div class=pgv><div class=row style="flex-wrap:wrap;gap:10px"><div><h3 style="margin:0">${esc(name)}</h3><small class=mu>${esc(note)}</small></div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${tools}</div></div>`
      + `<div style="margin:12px 0">${dashChips()}</div>` + (PARR && arr ? `<p class="pnote">${tr('Arranging: drag ⠿ to move a widget onto another place, drag its right or bottom edge to resize it (double-click the edge: automatic height), ✕ hides it. Every change is saved at once. Only admins can arrange.')}</p>` : '') + wGrid('dash', ctxOf, v.id, PARR && arr) + '</div>';
  } finally { THR = null; }
}
const pRename = () => { const v = curView('dash', PSEL);
  openForm({ title: tr('Rename the dashboard'), yes: 'Save', d: { name: v.name }, fields: [{ k: 'name', l: 'Name', req: 1 }],
    save: async d => { if (!d.name.trim()) return tr('Give the dashboard a name'); await wViewPatch('dash', v.id, { name: d.name.trim().slice(0, 40) }, 'Renamed'); } }); };

// ---- Display: how the data is counted, and which widgets are on (like the display settings of a report)
function PDSPM() {
  const v = curView('dash', PSEL), ed = canEditView(v), on = new Set(itemsOf('dash', v).map(x => x.id)), reg = WREG.dash, ids = wOrder('dash');
  const radio = (name, cur, opts, fn) => opts.map(([k, l]) => `<label class=rad><input type=radio name=${name} ${cur === k ? 'checked' : ''} onchange="${fn}('${k}')"> ${tr(l)}</label>`).join('');
  const grps = ['Numbers', 'Charts', 'Categories', 'People', 'Lists', 'Work', 'Performance', 'Customers', 'More'].filter(g => ids.some(id => reg[id].grp === g));
  const list = grps.map(g => `<div class=pdg>${tr(g)}</div>` + ids.filter(id => reg[id].grp === g).map(id => pSwitch('dash', v.id, id, on.has(id), ed)).join('')).join('');
  const share = v.kind !== 'std' && v.kind !== 'tpl' && canShare() ? `<div class=pds><b>${tr('Who sees this dashboard')}</b><div class=tkchips style="margin-top:6px">${ROLESEL.map(([r, n]) => `<button class="tkcp ${(v.roles || []).includes(r) ? 'on' : ''}" onclick="wShare('dash',${jsq(v.id)},'${r}')">${tr(n)}</button>`).join('')}</div><small class=mu>${(v.roles || []).length ? '' : tr('Only you — a personal dashboard')}</small></div>` : '';
  const foot = (v.kind === 'std' && !WPREV && (ME.layouts || {}).dash ? `<button class=ib onclick="wResetStd('dash')">${tr('Back to the default of my role')}</button>` : '')
    + (ME.role === 'admin' && !WPREV ? `<select style="width:auto" onchange="wRoleDefault('dash',this.value,${jsq(v.id)});this.value=''"><option value="">${tr('Make it the home dashboard of…')}</option>${Object.entries(ROLE).map(([r, n]) => `<option value=${r}>${tr(`Everyone who is ${n}`)}</option>`).join('')}</select>` : '');
  return `<div class=wdov onclick="if(event.target==this){PDSP=false;render()}"><aside class="wdp pdp" role=dialog aria-label="${esc(tr('Display settings'))}"><div class=mh><div><h2>${tr('Display settings')}</h2><small>${esc(v.kind === 'std' ? tr('My home dashboard') : v.kind === 'tpl' ? tr(v.name) : v.name)}</small></div>${X('PDSP=false;render()')}</div><div class=mb>`
    + `<div class=pds><b>${tr('Count the data by')}</b>${radio('pdb', DBASE, [['conv', 'Conversation date'], ['review', 'Review date']], 'pBase')}<small class=mu>${tr('Reviews made before this choice existed only have the conversation date.')}</small></div>`
    + `<div class=pds><b>${tr('Charts over time, by')}</b>${radio('pdg', DGR, [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter']], 'pGran')}</div>`
    + `<div class=pds><b>${tr('Show or hide widgets')}</b>${ed ? `<small class=mu>${tr('Every widget has its own size and place, so the page stays tidy.')}</small>` : `<small class=mu>${tr(WPREV ? 'You are looking as another role: switch back to "View as: me" to change your own.' : 'A ready-made dashboard stays as it is. Make your own copy to change it.')}</small>${!WPREV ? `<button class=ib style="margin-top:6px" onclick="PDSP=false;wNewView('dash',${jsq(v.id)})">${IC.plus} ${tr('Make my own copy')}</button>` : ''}`}${list}</div>`
    + share + (foot ? `<div class=wdfoot>${foot}</div>` : '') + `</div></aside></div>`;
}

// ---- AutoQA: which widgets its page shows
function pAutoqa() {
  const v = curView('autoqa', 'std'), on = new Set(itemsOf('autoqa', v).map(x => x.id)), ed = canEditView(v);
  return card(tr('AutoQA widgets'), `<p class=mu style="margin:0 0 10px">${tr('Switch on the widgets the AutoQA page shows. Their size and place are preset.')}</p><div class=pdl>${wOrder('autoqa').map(id => pSwitch('autoqa', 'std', id, on.has(id), ed)).join('')}</div>`
    + ((ME.layouts || {}).autoqa && ed ? `<button class=ib style="margin-top:10px" onclick="wResetStd('autoqa')">${tr('Back to the default of my role')}</button>` : ''))
    + `<div class=row style="margin-top:18px;flex-wrap:wrap;gap:8px"><h3 class=pgt style="margin:0">${tr('Preview')}</h3>${canArrange() && ed ? `<span style="display:flex;gap:8px"><button class="ib ibx${PARR ? ' on' : ''}" aria-pressed="${PARR}" onclick="PARR=!PARR;render()">${IC.pen} ${tr(PARR ? 'Done arranging' : 'Arrange')}</button>${isArr(itemsOf('autoqa', v)) ? `<button class="ib ibx" onclick="wArrAuto('autoqa','std')">${tr('Automatic layout')}</button>` : ''}</span>` : ''}</div>`
    + wGrid('autoqa', {}, 'std', PARR && canArrange() && ed);
}
// ---- Tasks: how task cards look, and which tab opens first
function pTasks() {
  return card(tr('Tasks'), `<div class=pds><b>${tr('Task cards')}</b>${pSeg(TKVM, [['compact', 'Compact'], ['detail', 'Detailed'], ['list', 'List']], 'tkVm')}<small class=mu>${tr('How your tasks are shown in My Tasks.')}</small></div>`
    + (canEditWork() ? `<div class=pds><b>${tr('Tasks opens on')}</b>${pSeg(LS.get('qa_tktab', 'my'), [['my', 'My Tasks'], ['team', 'Team Progress'], ['ev', 'Evaluation']], 'pTkTab')}</div>` : ''));
}
PG.pers = function () {
  const tabs = [['dash', 'Dashboard'], ...(canRoute('autoqa') ? [['autoqa', 'AutoQA']] : []), ['tasks', 'Tasks']], t = tabs.some(x => x[0] === PST) ? PST : 'dash';
  const bar = `<div class=sg role=tablist style="margin:0 0 16px">${tabs.map(([k, l]) => `<button role=tab class="${t === k ? 'on' : ''}" aria-selected="${t === k}" onclick="pTab('${k}')">${tr(l)}</button>`).join('')}</div>`;
  return head('Personalize', 'Choose what your Dashboard, AutoQA and Tasks pages show. The pages themselves stay simple.', bellBtn())
    + bar + (t === 'autoqa' ? pAutoqa() : t === 'tasks' ? pTasks() : pGallery() + pDash());
};
