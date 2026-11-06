// ===================== The Help Center website (Gabriela, 3 November) =====================
// A public website like the Zendesk Help Center: a big search, categories, sections and articles about Q-smart, "Was this article
// helpful?", related and recently viewed articles. It reads /api/hc (no sign-in needed). Pages, by the part after # in the address:
//   (nothing) home · c/<id> a category · s/<id> a section · a/<id> an article · search/<words> the search results
// No onclick="…" in the page: every click is handled here (the strict CSP planned after the database move will not need changes).
(function () {
  const $ = s => document.querySelector(s), main = $('#main');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const day = s => { try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };
  const LOGO = '<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="15.5" cy="15.5" r="10.5" fill="none" stroke="var(--brand)" stroke-width="4.6"/><path d="M22 22l7.5 7.5" stroke="#FFD447" stroke-width="4.6" stroke-linecap="round"/></svg>';
  let H = null; const FULL = new Map();

  // ---- the lists
  const catOf = id => H.cats.find(c => c.id === id), secOf = id => H.secs.find(s => s.id === id), artOf = id => H.arts.find(a => a.id === id);
  const secsIn = cid => H.secs.filter(s => s.cat === cid), artsIn = sid => H.arts.filter(a => a.sec === sid);
  const artsInCat = cid => H.arts.filter(a => (secOf(a.sec) || {}).cat === cid);
  const draft = a => a.draft ? ' <span class="tag dr">Draft</span>' : '';
  const aLink = a => `<a href="#a/${esc(a.id)}">${esc(a.title)}</a>${draft(a)}`;
  const crumbs = l => `<nav class="crumbs" aria-label="You are here"><a href="#">Home</a>${l.map(([h, t]) => ` <span>›</span> ${h ? `<a href="#${esc(h)}">${esc(t)}</a>` : `<span>${esc(t)}</span>`}`).join('')}</nav>`;
  const searchBox = (big, q) => `<form class="sf${big ? ' big' : ''}" role="search" data-search><input type="search" name="q" placeholder="Search" aria-label="Search the Help Center" autocomplete="off" value="${esc(q || '')}"><button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button><div class="sug" hidden></div></form>`;
  const more = () => `<section class="more"><h2>Have more questions?</h2><a class="btn" href="/index.html#cs_contact">Submit a request</a></section>`;

  // ---- search: the words of the title count most, then the labels, then the text
  const words = q => String(q || '').toLowerCase().split(/\s+/).filter(w => w.length > 1).slice(0, 8);
  function find(q) {
    const w = words(q); if (!w.length) return [];
    return H.arts.map(a => { const t = a.title.toLowerCase(), l = a.labels.join(' ').toLowerCase(), x = a.text.toLowerCase(); let s = 0;
      for (const k of w) { const n = (t.includes(k) ? 3 : 0) + (l.includes(k) ? 2 : 0) + (x.includes(k) ? 1 : 0); if (!n) return null; s += n; }
      return { a, s }; }).filter(Boolean).sort((x, y) => y.s - x.s).map(r => r.a);
  }
  // the matching words in bold, the rest escaped (the words are found in the plain text first, so no HTML is ever split)
  function mark(text, q) {
    const w = words(q).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); if (!w.length) return esc(text);
    const re = new RegExp(w.join('|'), 'gi'); let out = '', i = 0, m;
    while ((m = re.exec(text))) { out += esc(text.slice(i, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; i = m.index + m[0].length; }
    return out + esc(text.slice(i));
  }
  function snip(text, q) { const w = words(q), lo = text.toLowerCase(); let at = Math.max(0, Math.min(...w.map(k => { const i = lo.indexOf(k); return i < 0 ? Infinity : i; }).concat(text.length)) - 60);
    if (at) at = text.indexOf(' ', at) + 1;   // start at a whole word
    const s = text.slice(at, at + 200); return (at ? '…' : '') + mark(s, q) + (at + 200 < text.length ? '…' : ''); }

  // ---- recently viewed (in this browser only)
  const RK = 'hc_recent';
  const recent = () => { try { return (JSON.parse(localStorage.getItem(RK)) || []).filter(id => artOf(id)); } catch (e) { return []; } };
  const seen = id => { try { localStorage.setItem(RK, JSON.stringify([id, ...recent().filter(x => x !== id)].slice(0, 5))); } catch (e) { /* private window */ } };

  // ---------------------------------------------------------------- the pages
  function home() {
    const promo = H.arts.filter(a => a.promoted), last = [...H.arts].sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 5);
    return `<section class="hero"><div class="wrap"><h1>${esc(H.intro || 'How can we help?')}</h1>${searchBox(1)}</div></section>
      <div class="wrap">
        <section class="block"><h2 class="sr">Categories</h2><div class="cats">${H.cats.map(c => { const n = artsInCat(c.id).length;
          return `<a class="cat" href="#c/${esc(c.id)}"><span class="ci">${esc(c.icon)}</span><b>${esc(c.name)}</b><span class="muted">${esc(c.desc)}</span><small class="muted">${n} ${n === 1 ? 'article' : 'articles'}</small></a>`; }).join('')}</div></section>
        ${promo.length ? `<section class="block"><h2>Promoted articles</h2><ul class="promo">${promo.map(a => `<li>${aLink(a)}</li>`).join('')}</ul></section>` : ''}
        ${last.length ? `<section class="block"><h2>Recently updated</h2><ul class="recent">${last.map(a => { const c = catOf((secOf(a.sec) || {}).cat) || {};
          return `<li>${aLink(a)}<small class="muted">${esc(c.name || '')} · Updated ${esc(day(a.updated))}</small></li>`; }).join('')}</ul></section>` : ''}
        ${more()}
      </div>`;
  }
  function category(id) {
    const c = catOf(id); if (!c) return missing();
    const ss = secsIn(c.id);
    return `<div class="wrap">${crumbs([['', c.name]])}${searchBox(0)}<header class="ph"><h1><span class="ci">${esc(c.icon)}</span> ${esc(c.name)}</h1>${c.desc ? `<p class="muted">${esc(c.desc)}</p>` : ''}</header>
      <div class="secs">${ss.map(s => { const l = artsIn(s.id);
        return `<section class="sec"><h2><a href="#s/${esc(s.id)}">${esc(s.name)}</a></h2><ul>${l.slice(0, 6).map(a => `<li>${aLink(a)}</li>`).join('') || '<li class="muted">No articles yet</li>'}</ul>${l.length > 6 ? `<a class="all" href="#s/${esc(s.id)}">See all ${l.length} articles</a>` : ''}</section>`; }).join('') || '<p class="muted">No sections yet.</p>'}</div>${more()}</div>`;
  }
  function section(id) {
    const s = secOf(id); if (!s) return missing();
    const c = catOf(s.cat) || {}, l = artsIn(s.id);
    return `<div class="wrap">${crumbs([['c/' + c.id, c.name], ['', s.name]])}${searchBox(0)}<header class="ph"><h1>${esc(s.name)}</h1>${s.desc ? `<p class="muted">${esc(s.desc)}</p>` : ''}</header>
      <ul class="alist">${l.map(a => `<li>${a.promoted ? '<span class="star" title="Promoted">★</span>' : ''}${aLink(a)}</li>`).join('') || '<li class="muted">No articles yet</li>'}</ul>${more()}</div>`;
  }
  function article(id) {
    const a = artOf(id), x = FULL.get(id); if (!a && !x) return missing();
    if (!x) { load(id); return `<div class="wrap"><p class="muted" style="padding:60px 0">Loading…</p></div>`; }
    const s = secOf(x.sec) || {}, c = catOf(s.cat) || {}, inSec = artsIn(x.sec);
    const rel = H.arts.filter(o => o.id !== x.id && o.labels.some(l => x.labels.includes(l))).concat(artsInCat(c.id).filter(o => o.id !== x.id && o.sec !== x.sec)).filter((o, i, l) => l.indexOf(o) === i).slice(0, 5);
    const rv = recent().filter(r => r !== x.id).map(artOf).slice(0, 5), tot = x.up + x.down;
    return `<div class="wrap">${crumbs([['c/' + c.id, c.name], ['s/' + s.id, s.name]])}<div class="art">
      <aside class="side"><h2>Articles in this section</h2><ul>${inSec.slice(0, 10).map(o => `<li${o.id === x.id ? ' class="on" aria-current="page"' : ''}>${aLink(o)}</li>`).join('')}</ul>${inSec.length > 10 ? `<a class="all" href="#s/${esc(s.id)}">See more</a>` : ''}</aside>
      <article class="body"><header><h1>${esc(x.title)}${draft(x)}</h1><p class="muted meta">${x.author ? esc(x.author) + ' · ' : ''}Updated ${esc(day(x.updated))}</p></header>
        <div class="prose">${window.md(x.body)}</div>
        ${x.labels.length ? `<p class="labels">${x.labels.map(l => `<a class="tag" href="#search/${encodeURIComponent(l)}">${esc(l)}</a>`).join('')}</p>` : ''}
        <section class="vote" aria-live="polite"><b>Was this article helpful?</b><div><button class="vb${x.mine === 'up' ? ' on' : ''}" data-vote="up" aria-pressed="${x.mine === 'up'}">Yes</button><button class="vb${x.mine === 'down' ? ' on' : ''}" data-vote="down" aria-pressed="${x.mine === 'down'}">No</button></div><small class="muted">${tot ? `${x.up} out of ${tot} found this helpful` : 'Be the first to answer'}</small></section>
        <p><a href="#a/${esc(x.id)}" data-top>Return to top ↑</a></p>
        <div class="two">${rel.length ? `<section><h2>Related articles</h2><ul>${rel.map(o => `<li>${aLink(o)}</li>`).join('')}</ul></section>` : ''}${rv.length ? `<section><h2>Recently viewed articles</h2><ul>${rv.map(o => `<li>${aLink(o)}</li>`).join('')}</ul></section>` : ''}</div>
        ${more()}
      </article></div></div>`;
  }
  let SCAT = '';
  function results(q) {
    const all = find(q), l = SCAT ? all.filter(a => (secOf(a.sec) || {}).cat === SCAT) : all;
    const counts = H.cats.map(c => [c, all.filter(a => (secOf(a.sec) || {}).cat === c.id).length]).filter(([, n]) => n);
    return `<div class="wrap">${crumbs([['', 'Search results']])}${searchBox(0, q)}<div class="res">
      <aside class="side"><h2>By category</h2><ul><li${!SCAT ? ' class="on"' : ''}><a href="#" data-scat="">All categories <span class="muted">(${all.length})</span></a></li>${counts.map(([c, n]) => `<li${SCAT === c.id ? ' class="on"' : ''}><a href="#" data-scat="${esc(c.id)}">${esc(c.name)} <span class="muted">(${n})</span></a></li>`).join('')}</ul></aside>
      <div><h1 class="rh">${l.length} ${l.length === 1 ? 'result' : 'results'} for “${esc(q)}”</h1>
      ${l.length ? `<ul class="hits">${l.map(a => { const s = secOf(a.sec) || {}, c = catOf(s.cat) || {};
        return `<li><a class="ht" href="#a/${esc(a.id)}">${mark(a.title, q)}</a>${draft(a)}<small class="muted">${esc(c.name || '')} › ${esc(s.name || '')}</small><p>${snip(a.text, q)}</p></li>`; }).join('')}</ul>`
        : `<p class="muted">No article matches these words. Try other words, or <a href="/index.html#cs_contact">submit a request</a>.</p>`}</div></div></div>`;
  }
  const missing = () => `<div class="wrap">${crumbs([['', 'Page not found']])}<header class="ph"><h1>This page does not exist (any more)</h1><p class="muted">It may have been moved or deleted. <a href="#">Go to the Help Center home</a>.</p></header></div>`;

  // ---------------------------------------------------------------- showing a page
  const parts = () => { const h = location.hash.replace(/^#\/?/, ''), i = h.indexOf('/'); return i < 0 ? [h, ''] : [h.slice(0, i), decodeURIComponent(h.slice(i + 1))]; };
  function show(keep) {
    const [k, id] = parts();
    main.innerHTML = k === 'c' ? category(id) : k === 's' ? section(id) : k === 'a' ? article(id) : k === 'search' ? results(id) : home();
    const t = k === 'a' ? (FULL.get(id) || artOf(id) || {}).title : k === 'c' ? (catOf(id) || {}).name : k === 's' ? (secOf(id) || {}).name : k === 'search' ? 'Search results' : '';
    document.title = (t ? t + ' – ' : '') + H.name;
    if (!keep) window.scrollTo(0, 0);
  }
  async function load(id) {
    const r = await fetch('/api/hc/a/' + encodeURIComponent(id)), j = r.ok ? await r.json() : null;
    if (j) { FULL.set(id, j); seen(id); } else FULL.delete(id);
    if (parts()[1] === id) main.innerHTML = j ? article(id) : missing();
  }
  async function vote(v) {
    const id = parts()[1], r = await fetch('/api/hc/a/' + encodeURIComponent(id) + '/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) return alert(j.error || 'Could not save your answer');
    Object.assign(FULL.get(id), j); show(1); const b = main.querySelector('.vote small'); if (b) b.textContent = 'Thank you for your answer. ' + b.textContent;
  }

  // ---- the clicks, the search box and its suggestions
  document.addEventListener('submit', e => { const f = e.target.closest('[data-search]'); if (!f) return; e.preventDefault(); const q = f.q.value.trim(); if (q) { SCAT = ''; location.hash = 'search/' + encodeURIComponent(q); } });
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-vote]'); if (v) return vote(v.dataset.vote);
    const c = e.target.closest('[data-scat]'); if (c) { e.preventDefault(); SCAT = c.dataset.scat; show(1); return; }
    if (e.target.closest('[data-top]')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!e.target.closest('[data-search]')) document.querySelectorAll('.sug').forEach(s => { s.hidden = true; });
  });
  document.addEventListener('input', e => {
    const f = e.target.closest('[data-search]'); if (!f) return; const box = f.querySelector('.sug'), q = e.target.value, l = find(q).slice(0, 6);
    box.innerHTML = l.map(a => `<a href="#a/${esc(a.id)}">${mark(a.title, q)}<small class="muted">${esc((catOf((secOf(a.sec) || {}).cat) || {}).name || '')}</small></a>`).join('');
    box.hidden = !l.length;
  });
  window.addEventListener('hashchange', () => show());

  async function boot() {
    try { const r = await fetch('/api/hc?all=1'); if (!r.ok) throw new Error(); H = await r.json(); }
    catch (e) { main.innerHTML = '<p class="wrap muted" style="padding:60px 0">The Help Center could not be loaded. Try again in a moment.</p>'; return; }
    const b = H.brand || {}; if (/^#[0-9a-f]{6}$/i.test(b.color || '')) document.documentElement.style.setProperty('--brand', b.color);
    $('#logo').innerHTML = (b.logo ? `<img src="${esc(b.logo)}" alt="">` : LOGO) + `<span>${esc(H.name)}</span>`;
    if (H.editor) { const n = $('.nav'), a = document.createElement('a'); a.href = '/index.html#cs_hcsite'; a.textContent = 'Edit the Help Center'; n.insertBefore(a, n.firstChild); $('#signin').textContent = 'Open Q-smart'; }
    $('#foot').textContent = '© ' + new Date().getFullYear() + ' ' + H.name + ' · Powered by Q-smart';
    show();
  }
  boot();
})();
