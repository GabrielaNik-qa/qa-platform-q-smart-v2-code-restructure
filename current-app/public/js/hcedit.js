// ===================== Help Center › Help Center website: the editor (Gabriela, 3 November) =====================
// The public website (/hc, or help.<your domain>) is like the Zendesk Help Center: categories › sections › articles about Q-smart.
// Admins write it here; anybody can read the published articles there, without signing in. A draft is only seen by admins.
let HCS = null;
const hcApi = async (u, b, m) => { const r = await api('/api/hc' + u, b, m); if (!r.ok) return errOf(r, 'Could not save'); await load(); render(); toast(m === 'DELETE' ? 'Deleted' : 'Saved'); };
const hcCatOpts = () => (HCS.cats || []).map(c => [c.id, c.icon + ' ' + c.name]);
const hcSecOpts = () => (HCS.secs || []).map(s => [s.id, ((HCS.cats || []).find(c => c.id === s.cat) || {}).name + ' › ' + s.name]);
function hcCat(id) { const x = HCS.cats.find(c => c.id === id) || { icon: '📁', name: '', desc: '' };
  openForm({ title: id ? 'Change the category' : 'New category', d: { icon: x.icon, name: x.name, desc: x.desc },
    fields: [{ k: 'icon', l: 'Emoji', ph: '📁' }, { k: 'name', l: 'Name', req: 1 }, { k: 'desc', l: 'Description', t: 'textarea', rows: 2 }],
    save: d => hcApi('/cats' + (id ? '/' + id : ''), d, id ? 'PUT' : 'POST') }); }
function hcSec(id, cat) { const x = HCS.secs.find(s => s.id === id) || { cat: cat || (HCS.cats[0] || {}).id, name: '', desc: '' };
  openForm({ title: id ? 'Change the section' : 'New section', d: { cat: x.cat, name: x.name, desc: x.desc },
    fields: [{ k: 'cat', l: 'Category', t: 'select', o: hcCatOpts }, { k: 'name', l: 'Name', req: 1 }, { k: 'desc', l: 'Description', t: 'textarea', rows: 2 }],
    save: d => hcApi('/secs' + (id ? '/' + id : ''), d, id ? 'PUT' : 'POST') }); }
async function hcArt(id, sec) {
  let x = { sec: sec || (HCS.secs[0] || {}).id, title: '', body: '', labels: [], promoted: false, draft: true };
  if (id) { const r = await api('/api/hc/a/' + id); if (!r.ok) return toast(await errOf(r, 'Could not open it'), true); x = await r.json(); }
  openForm({ title: id ? 'Change the article' : 'New article', w: 860, d: { sec: x.sec, title: x.title, body: x.body, labels: x.labels, promoted: !!x.promoted, draft: !!x.draft },
    fields: [{ k: 'title', l: 'Title', req: 1 }, { k: 'sec', l: 'Section', t: 'select', o: hcSecOpts },
      { k: 'body', l: 'Text', t: 'textarea', rows: 16, hint: 'Markdown: ## a heading, **bold**, - a list, 1. a numbered list, [a link](https://…)' },
      { k: 'labels', l: 'Labels (they link related articles)', t: 'chips' },
      { k: 'promoted', l: 'Promoted: shown on the home page of the Help Center', t: 'checkbox' }, { k: 'draft', l: 'Draft: only admins see it', t: 'checkbox' }],
    save: d => d.title.trim() ? hcApi('/arts' + (id ? '/' + id : ''), d, id ? 'PUT' : 'POST') : 'Give the article a title' }); }
const hcDel = (kind, id, what) => ask('Delete this ' + what + '?', 'It is removed from the Help Center website. This cannot be undone.', async () => { const e = await hcApi('/' + kind + '/' + id, null, 'DELETE'); if (e) toast(e, true); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const hcBtns = (on, del) => `<span style="white-space:nowrap"><button class=ic title="Change" aria-label="Change" onclick="${on}">${IC.pen}</button><button class=ic title="Delete" aria-label="Delete" onclick="${del}">${IC.bin}</button></span>`;
PG.cs_hcsite = function () {
  if (!HCS) return head('Help Center website', '', '') + card('', `<p class=mu style="margin:0">${tr('Loading…')}</p>`);
  const site = card('Website', `<div class=form style="max-width:none"><div class=row style="gap:12px;align-items:flex-end"><label style="flex:1">${tr('Name')}<input id=hcn maxlength=80 value="${esc(HCS.name)}"></label><label style="flex:2">${tr('Welcome text on the home page')}<input id=hci maxlength=200 value="${esc(HCS.intro)}"></label>`
    + `<button class=btn onclick="hcApi('/site',{name:document.getElementById('hcn').value,intro:document.getElementById('hci').value},'PUT').then(e=>e&&toast(e,true))">${tr('Save')}</button></div></div>`
    + `<p class=mu style="margin:10px 0 0">${tr('The address of the website')}: <a href="/hc/" target=_blank rel=noopener class=mono>${esc(location.origin)}/hc/</a>. ${tr('It also opens at its own address: help. followed by your domain, for example help.q-smart.com.')}</p>`);
  const n = HCS.arts.length, votes = a => a.up + a.down ? `${a.up} 👍 · ${a.down} 👎` : '—';
  const cats = HCS.cats.map(c => card(`<span data-noi18n style="flex:1">${esc(c.icon)} ${esc(c.name)}</span><span>${hcBtns(`hcCat('${c.id}')`, `hcDel('cats','${c.id}','category')`)}<button class=ib onclick="hcSec('','${c.id}')">${IC.plus} ${tr('Section')}</button></span>`, `${c.desc ? `<p class=mu data-noi18n style="margin:0 0 10px">${esc(c.desc)}</p>` : ''}`
    + HCS.secs.filter(s => s.cat === c.id).map(s => { const l = HCS.arts.filter(a => a.sec === s.id);
      return `<div class=hcsec><div class=row><b data-noi18n>${esc(s.name)}</b><span>${hcBtns(`hcSec('${s.id}')`, `hcDel('secs','${s.id}','section')`)}<button class=ib onclick="hcArt('','${s.id}')">${IC.plus} ${tr('Article')}</button></span></div>`
        + (l.length ? tbl(['Title', 'Updated', 'Helpful', ''], l.map(a => [`<span data-noi18n>${a.promoted ? '★ ' : ''}${esc(a.title)}</span>${a.draft ? ' ' + pill('Draft', 'wn') : ''}`, `<span class=mono>${fdt(a.updated)}</span>`, votes(a),
          `<span style="white-space:nowrap"><a class=ic href="/hc/#a/${esc(a.id)}" target=_blank rel=noopener title="${tr('Open on the website')}" aria-label="${tr('Open on the website')}">↗</a>${hcBtns(`hcArt('${a.id}')`, `hcDel('arts','${a.id}','article')`)}</span>`]))
          : `<p class=mu style="margin:6px 0 0">${tr('No articles yet')}</p>`) + `</div>`; }).join(''))).join('');
  return head('Help Center website', 'A public website with articles about Q-smart, like the Zendesk Help Center. Anybody can read it without signing in.',
    `<div style="display:flex;gap:8px;flex-wrap:wrap">${bellBtn()}<a class=ib href="/hc/" target=_blank rel=noopener>${tr('Open the website')} ↗</a><button class="btn ibx" onclick="hcCat()">${IC.plus} ${tr('Category')}</button></div>`)
    + site + `<p class=mu>${tr(`${n} articles in ${HCS.cats.length} categories`)}</p>` + cats;
};
