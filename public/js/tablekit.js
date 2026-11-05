// ===================== Table kit: a "Filters" side panel with chips, and a "Columns" chooser (ideas from Zendesk QA) =====================
// A page describes its table once with txReg(page, { cols, filters, count, clear }):
//   cols    [{ k, t: 'TITLE', td: row => html, off: true = hidden until chosen, lock: true = always shown }]
//   filters () => [{ k, n: 'Name', v: current value ('' = all), o: () => [[value, label]], set: v => …, extra: () => html (e.g. two dates) }]
//   count   () => how many rows match now (shown live in the panel);  clear () => every filter back to "all"
// Above the table: txTools(page, search) = search + "Filters" + a chip per filter in use (✕ takes it away) + "Columns".
// The columns each person picks are saved in their account (My account keeps them on every computer).
const TXR = {};
let TXF = null, TXC = null, TXD = null;           // page whose Filters / Columns panel is open; TXD = column being dragged
const txReg = (page, d) => { TXR[page] = d; };
const txCols = page => {
  const all = TXR[page].cols, mine = (MYP().cols || {})[page];
  const l = Array.isArray(mine) ? mine.map(k => all.find(c => c.k === k)).filter(Boolean) : all.filter(c => !c.off);
  all.filter(c => c.lock && !c.r && !l.includes(c)).forEach(c => l.unshift(c));
  return [...l.filter(c => !c.r), ...all.filter(c => c.r)];   // the buttons column (r) always stays last
};
const txLab = (d, v) => { const o = d.o().find(x => String(x[0]) === String(v)); return o ? o[1] : v; };
const txOn = page => TXR[page].filters().filter(d => d.v && !d.fixed);
function txTools(page, search = '') {
  const on = txOn(page);
  return `<div class=txbar>${search}<button class="ib ibx txfb ${on.length ? 'on' : ''}" onclick="TXF='${page}';render()" aria-haspopup=dialog>${IC.filter || IC.list} Filters${on.length ? ` <b class=txn>${on.length}</b>` : ''}</button>`
    + TXR[page].filters().filter(d => d.fixed).map(d => `<button class="fchip set" onclick="TXF='${page}';render()" title="Change">${d.n} is <b>${esc(txLab(d, d.v))}</b></button>`).join('')
    + on.map(d => `<span class="fchip set"><button class=txcv onclick="TXF='${page}';render()" title="Change">${d.n} is <b>${esc(txLab(d, d.v))}</b></button><button type=button class=fcx onclick="txSet('${page}','${d.k}','')" title="Remove this filter">✕</button></span>`).join('')
    + (on.length ? `<a href="javascript:void(0)" class=agl onclick="txClear('${page}')">Reset</a>` : '')
    + `<span style="flex:1"></span><button class="ib ibx" onclick="txCopy('${page}')" title="Copy every matching row, to paste into Excel">${IC.copy} Copy</button><button class="ib ibx" onclick="TXC='${page}';render()" aria-haspopup=dialog title="Choose the columns of the table">${TIC.list || IC.list} Columns</button></div>`;
}
// a page's own table with the kit (4 November): the columns each person chose (saved in their account), in their order.
// c.r = a column on the right (the buttons); rowAttr(row) = what the row itself gets (e.g. a click that opens it)
const txTbl = (page, rows, cls = 'ct', rowAttr) => { const cols = txCols(page), al = c => c.r ? ' style="text-align:right;white-space:nowrap"' : '';
  return `<div class=sc data-notools><table class="${cls}"><tr>${cols.map(c => `<th${al(c)}>${c.t}</th>`).join('')}</tr>${rows.map(r => `<tr${rowAttr ? ' ' + rowAttr(r) : ''}>${cols.map(c => `<td${al(c)}>${c.td(r)}</td>`).join('')}</tr>`).join('')}`
    + (rows.length ? '' : `<tr><td colspan=${cols.length} class=mu style="text-align:center;padding:26px">${tr('Nothing matches these filters')}</td></tr>`) + '</table></div>'; };
// only Columns and Copy, for a page that keeps its own filter bar (Quick Flags, Disputes, Tasks)
const txBtns = page => `<div class=txbar style="justify-content:flex-end;margin-bottom:8px"><button class="ib ibx" onclick="txCopy('${page}')" title="Copy every matching row, to paste into Excel">${IC.copy} Copy</button><button class="ib ibx" onclick="TXC='${page}';render()" aria-haspopup=dialog title="Choose the columns of the table">${(typeof TIC !== 'undefined' && TIC.list) || IC.list} Columns</button></div>`;
function txSet(page, k, v) { const d = TXR[page].filters().find(x => x.k === k); if (d) d.set(v); PN = 1; render(); }
function txClear(page) { TXR[page].clear(); PN = 1; render(); }
// ---- the Filters panel: every filter of the table in one place, the number of results updates as you choose
const TXFM = () => { const page = TXF, d = TXR[page], n = d.count();
  return `<div class=wdov onclick="if(event.target==this){TXF=null;render()}"><aside class=wdp role=dialog aria-label="Filters"><div class=mh><div><h2>Filters</h2><small>${n} result${n === 1 ? '' : 's'}</small></div>${X('TXF=null;render()')}</div><div class=mb>`
    + d.filters().map(f => `<label class=txfl><span>${f.n}</span><select onchange="txSet('${page}','${f.k}',this.value)">${f.fixed ? '' : `<option value="">All</option>`}${f.o().map(([k, l]) => `<option value="${esc(k)}" ${String(f.v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${f.extra ? f.extra() : ''}</label>`).join('')
    + `<div class=wdfoot><button class=ib onclick="txClear('${page}')">Clear all</button><button class=btn onclick="TXF=null;render()">Show ${n} result${n === 1 ? '' : 's'}</button></div></div></aside></div>`; };
// ---- the Columns panel: tick the columns you want, drag them into your order
let TXSEQ = 0;   // quick clicks: only the answer to the newest save is used, so an older, slower answer cannot bring back a column you just hid
function txSaveCols(page, keys) {
  const cols = { ...(MYP().cols || {}) }, seq = ++TXSEQ; if (keys) cols[page] = keys; else delete cols[page];
  ME = { ...ME, prefs: { ...MYP(), cols } }; render();
  api('/api/prefs', { cols: { page, keys } }, 'PUT').then(async r => { if (!r.ok) return toast(await errOf(r, 'Could not save the columns'), true); const j = await r.json(); if (seq === TXSEQ) ME = j; });
}
function txColShow(page, k, on) { const keys = txCols(page).map(c => c.k).filter(x => x !== k); if (on) keys.push(k); txSaveCols(page, keys); }
function txColDrop(ev, page, k) {
  ev.preventDefault(); const from = TXD; TXD = null; if (!from || from === k) return;
  const keys = txCols(page).map(c => c.k); if (!keys.includes(from) || !keys.includes(k)) return;
  keys.splice(keys.indexOf(from), 1); keys.splice(keys.indexOf(k), 0, from); txSaveCols(page, keys);
}
const TXCM = () => { const page = TXC, all = TXR[page].cols, vis = txCols(page), rest = all.filter(c => !vis.includes(c));
  const row = (c, on) => `<div class=wdr ${on ? `draggable=true ondragstart="TXD='${c.k}'" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="txColDrop(event,'${page}','${c.k}')"` : ''}>${on ? `<span class=wgrip title="Drag">⠿</span>` : '<span class=wgrip></span>'}<input type=checkbox ${on ? 'checked' : ''} ${c.lock ? 'disabled title="Always shown"' : ''} onchange="txColShow('${page}','${c.k}',this.checked)" aria-label="${esc(c.t)}"><span class=wdn>${esc(c.t)}</span></div>`;
  return `<div class=wdov onclick="if(event.target==this){TXC=null;render()}"><aside class=wdp role=dialog aria-label="Columns"><div class=mh><div><h2>Columns</h2><small>Show only what you need · saved for you</small></div>${X('TXC=null;render()')}</div><div class=mb>`
    + `<small class=mu>Tick the columns to show and drag them into your order.</small><div class=wdl>${vis.map(c => row(c, true)).join('')}</div>`
    + (rest.length ? `<b style="font-size:12px">More columns</b><div class=wdl>${rest.map(c => row(c, false)).join('')}</div>` : '')
    + `<div class=wdfoot><button class=ib onclick="txSaveCols('${page}',null)">Back to the standard columns</button><button class=btn onclick="TXC=null;render()">Done</button></div></div></aside></div>`; };

// ===================== Every other table: filter, columns, sort and "Copy for Excel" =====================
// A small toolbar above each table of a page (tables made with tbl() and the like), added after every redraw:
//   • filter: "Contains" text, plus a drop-down for each column that has only a few different values (status, team, type …)
//   • columns: tick the ones to show (remembered per table on this computer), sort: click a column title
//   • copy: the rows you see, with their columns, ready to paste into Excel (no export needed)
// The Reviews table has its own kit (Filters panel, Columns saved in your account, copy of every matching row) and is left out.
const TTS = {};                                         // filters until you leave the page: key → { q: text, f: { column: value } }
let TTP = null;                                         // the open pop-over: { k, w: 'f' filter | 'c' columns }
// the words of a cell, as written in the page (not the capitals the style adds), without avatars' initials, icons or buttons
const ttTxt = c => { if (!c) return ''; const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('.av,.av2,.tkav,svg,button,.sr-only') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }), out = []; while (w.nextNode()) out.push(w.currentNode.nodeValue); return out.join(' ').replace(/\s+/g, ' ').trim(); };
const ttHead = t => { const tr = t.querySelector('tr'); return tr && tr.querySelector('th') ? tr : null; };
const ttRows = t => [...t.querySelectorAll('tr')].slice(1).filter(tr => !tr.querySelector('td[colspan]'));
const ttCols = t => [...ttHead(t).children].map((th, i) => ttTxt(th).replace(/[↕▲▼]/g, '').trim() || '#' + (i + 1));
const ttNum = v => { const m = String(v).replace(/[\s,%]/g, '').match(/^-?\d+(\.\d+)?$/); return m ? +m[0] : null; };
const ttTab = k => $(`#m table[data-k="${k}"]`);
function tblTools() {
  $$('#m .sc > table').filter(t => !t.closest('[data-notools],.ov,.wdov,.wgrid') && ttHead(t) && ttRows(t).length >= 2).forEach((t, i) => {
    const k = route + '-' + i, sc = t.parentElement, top = sc.previousElementSibling && sc.previousElementSibling.classList.contains('sctop') ? sc.previousElementSibling : null;
    let bar = (top || sc).previousElementSibling;
    if (!bar || !bar.classList.contains('ttb')) {
      bar = document.createElement('div'); bar.className = 'ttb'; (top || sc).before(bar);
      bar.innerHTML = `<span class=ttch></span><span class=ttn></span><button class=ic onclick="ttOpen('${k}','f')" title="Filter rows" aria-label="Filter rows">${IC.filter}</button><button class=ic onclick="ttOpen('${k}','c')" title="Choose columns" aria-label="Choose columns">${IC.list}</button><button class=ic onclick="ttCopy('${k}')" title="Copy for Excel" aria-label="Copy for Excel">${IC.copy}</button><span class=ttpw></span>`;
    }
    bar.dataset.k = k; t.dataset.k = k;
    if (!ttHead(t).querySelector('button')) [...ttHead(t).children].forEach((th, j) => { th.classList.add('tts'); th.title = 'Sort'; th.onclick = () => ttSort(k, ttCols(t)[j]); });
    ttApply(k);
    if (TTP && TTP.k === k && !bar.querySelector('.ttp')) ttOpen(k, TTP.w, true);
  });
}
function ttApply(k) {
  const t = ttTab(k), bar = $(`.ttb[data-k="${k}"]`); if (!t || !bar) return;
  const cols = ttCols(t), p = LS.get('qa_tt_' + k, {}), s = TTS[k] = TTS[k] || { q: '', f: {} }, hid = (p.hide || []).map(n => cols.indexOf(n)).filter(j => j >= 0), all = ttRows(t);
  [ttHead(t), ...all].forEach(tr => [...tr.children].forEach((c, j) => { c.hidden = hid.includes(j); }));
  [...ttHead(t).children].forEach((th, j) => { const on = !!p.sort && p.sort.c === cols[j]; th.classList.toggle('tts-a', on && p.sort.d > 0); th.classList.toggle('tts-d', on && p.sort.d < 0); });
  if (p.sort && cols.includes(p.sort.c) && ttHead(t).querySelector('.tts')) {
    const j = cols.indexOf(p.sort.c), num = all.every(r => !ttTxt(r.children[j]) || ttNum(ttTxt(r.children[j])) != null);
    [...all].sort((a, b) => { const x = ttTxt(a.children[j]), y = ttTxt(b.children[j]); return (num ? (ttNum(x) ?? -1e15) - (ttNum(y) ?? -1e15) : x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })) * p.sort.d; }).forEach(r => r.parentElement.appendChild(r));
  }
  let n = 0;
  all.forEach(tr => { const ok = (!s.q || ttTxt(tr).toLowerCase().includes(s.q.toLowerCase())) && Object.entries(s.f).every(([c, v]) => { const j = cols.indexOf(c); return j < 0 || ttTxt(tr.children[j]) === v; }); tr.hidden = !ok; if (ok) n++; });
  bar.querySelector('.ttch').innerHTML = (s.q ? `<span class="fchip set">Contains “${esc(s.q)}”<button type=button class=fcx onclick="ttQ('${k}','');ttRefresh('${k}')" title="Remove this filter">✕</button></span>` : '')
    + Object.entries(s.f).map(([c, v]) => `<span class="fchip set">${esc(c)}: ${esc(v)}<button type=button class=fcx onclick="ttF('${k}',${jsq(c)},'');ttRefresh('${k}')" title="Remove this filter">✕</button></span>`).join('');
  bar.querySelector('.ttn').textContent = n === all.length ? `${n} rows` : `${n} of ${all.length}`;
}
const ttQ = (k, v) => { (TTS[k] = TTS[k] || { q: '', f: {} }).q = v; ttApply(k); };
const ttF = (k, c, v) => { const s = TTS[k] = TTS[k] || { q: '', f: {} }; if (v) s.f[c] = v; else delete s.f[c]; ttApply(k); };
const ttClear = k => { TTS[k] = { q: '', f: {} }; ttApply(k); ttRefresh(k); };
const ttRefresh = k => { if (TTP && TTP.k === k) ttOpen(k, TTP.w, true); };
function ttSort(k, c) { const p = LS.get('qa_tt_' + k, {}); p.sort = p.sort && p.sort.c === c ? { c, d: -p.sort.d } : { c, d: 1 }; LS.set('qa_tt_' + k, p); ttApply(k); }
function ttCol(k, c, on) { const p = LS.get('qa_tt_' + k, {}), h = (p.hide || []).filter(x => x !== c); if (!on) h.push(c); p.hide = h; LS.set('qa_tt_' + k, p); ttApply(k); }
// the pop-overs: filter (text + a drop-down per column with few values) and columns (tick to show)
function ttOpen(k, w, keep) {
  const bar = $(`.ttb[data-k="${k}"]`), t = ttTab(k); if (!bar || !t) return;
  if (!keep && TTP && TTP.k === k && TTP.w === w) { TTP = null; bar.querySelector('.ttpw').innerHTML = ''; return; }
  TTP = { k, w }; $$('.ttb .ttpw').forEach(x => { if (x !== bar.querySelector('.ttpw')) x.innerHTML = ''; });
  const cols = ttCols(t), s = TTS[k] = TTS[k] || { q: '', f: {} }, hide = LS.get('qa_tt_' + k, {}).hide || [], all = ttRows(t);
  bar.querySelector('.ttpw').innerHTML = w === 'c'
    ? `<div class="fpop ttp ttpc"><b>Show columns</b>${cols.map(c => `<label><input type=checkbox ${hide.includes(c) ? '' : 'checked'} onchange="ttCol('${k}',${jsq(c)},this.checked)"> ${esc(c)}</label>`).join('')}</div>`
    : `<div class="fpop ttp"><label>Contains<input value="${esc(s.q)}" oninput="ttQ('${k}',this.value)" placeholder="Any text in the row"></label>${cols.map((c, j) => { if (hide.includes(c)) return ''; const v = [...new Set(all.map(r => ttTxt(r.children[j])).filter(Boolean))]; return v.length < 2 || v.length > 15 ? '' : `<label>${esc(c)}<select onchange="ttF('${k}',${jsq(c)},this.value)"><option value="">All</option>${v.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(x => `<option ${s.f[c] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`; }).join('')}<button class=ib onclick="ttClear('${k}')">Clear filters</button></div>`;
  if (w === 'f' && !keep) { const i = bar.querySelector('.ttp input'); if (i) i.focus(); }
}
document.addEventListener('click', e => { if (TTP && !e.target.closest('.ttb')) { const p = $(`.ttb[data-k="${TTP.k}"] .ttpw`); if (p) p.innerHTML = ''; TTP = null; } });
// copy for Excel: the header and the rows you see (columns with nothing in them, like the buttons, are left out)
function ttCopy(k) {
  const t = ttTab(k); if (!t) return;
  const rows = [ttHead(t), ...ttRows(t).filter(r => !r.hidden)], keep = ttCols(t).map((c, j) => !ttHead(t).children[j].hidden && rows.slice(1).some(r => ttTxt(r.children[j])));
  xlCopy(rows.map(r => [...r.children].filter((c, j) => keep[j]).map(ttTxt)));
}
// a text that starts with = + - or @ would become a formula when pasted into Excel (a name like "=HYPERLINK(…)" typed by
// somebody): it is pasted as text instead; plain numbers such as -5 or +3.5 stay numbers
const xlFormula = s => /^[=+\-@]/.test(s) && !/^[-+]?\d[\d\s.,]*%?$/.test(s);
async function xlCopy(data) {
  const cell = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '), n = data.length - 1, safe = v => { const s = cell(v); return xlFormula(s) ? "'" + s : s; };
  const td = v => { const s = cell(v); return xlFormula(s) ? `<td style="mso-number-format:'\\@'">${esc(s)}</td>` : `<td>${esc(s)}</td>`; };
  const tsv = data.map(r => r.map(safe).join('\t')).join('\r\n'), html = `<table>${data.map((r, i) => `<tr>${r.map(v => i ? td(v) : `<th>${esc(safe(v))}</th>`).join('')}</tr>`).join('')}</table>`;
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([tsv], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    else await navigator.clipboard.writeText(tsv);
    toast(n === 1 ? 'Copied 1 row · paste it into Excel' : `Copied ${n} rows · paste them into Excel`);
  } catch (e) { toast('This browser did not allow copying. Use the Excel export instead.', true); }
}
// the Reviews table copies every matching row (all pages), with the columns you chose
const plainTxt = h => { const d = document.createElement('div'); d.innerHTML = h; return ttTxt(d); };
function txCopy(page) { const d = TXR[page], cols = txCols(page); xlCopy([cols.map(c => c.t), ...d.rows().map(e => cols.map(c => plainTxt(c.td(e))))]); }
