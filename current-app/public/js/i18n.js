// ===================== Languages: English (the source), Bulgarian and French =====================
// The pages are written in English. The translation files (js/i18n/bg.js, js/i18n/fr.js) map every English text to its
// translation, gettext-style: the English text is the stable identifier of a message. After every redraw the page's text,
// tooltips, placeholders and screen-reader labels are swapped for the chosen language, so changing the language never touches
// the data, the scores, the stored values or what the buttons do. Runs in the browser and in the tests.
//
//   I18N.add('bg', { 'Sign in': 'Вход' }, [['{n} reviews', { one: '{n} оценка', other: '{n} оценки' }]])
//   Patterns: {n…} = a number (it also picks the plural form), {~x} = a text that is itself translated, {x} = any text kept as it is.
//   Debug: open the app with ?i18n=debug (or run localStorage.qa_i18n_debug = 1): untranslated text gets a red dotted outline and
//   I18N.missing() lists it.
(function (g) {
  const LANGS = [
    { code: 'en', name: 'English', flag: '🇬🇧', locale: 'en-GB' },
    { code: 'bg', name: 'Български', flag: '🇧🇬', locale: 'bg-BG' },
    { code: 'fr', name: 'Français', flag: '🇫🇷', locale: 'fr-FR' }
  ];
  const CODES = LANGS.map(l => l.code);
  const D = {};                                                   // per language: exact texts + patterns
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let LANG = 'en';
  const MISS = new Set();

  function compile(en) {
    const names = [];
    const re = en.split(/(\{~?[A-Za-z0-9]+\})/).map(p => {
      const m = p.match(/^\{(~?)([A-Za-z0-9]+)\}$/);
      if (!m) return reEsc(p);
      names.push({ name: m[2], tr: !!m[1] });
      return m[2][0] === 'n' ? '([-+]?\\d[\\d.,]*)' : '(.+?)';
    }).join('');
    return { re: new RegExp('^' + re + '$'), names };
  }
  function add(code, exact, pats) {
    const d = D[code] = D[code] || { exact: new Map(), pats: [] };
    Object.entries(exact || {}).forEach(([k, v]) => d.exact.set(norm(k), v));
    (pats || []).forEach(([en, v]) => d.pats.push({ en, v, ...compile(norm(en)), fixed: en.replace(/\{~?[A-Za-z0-9]+\}/g, '').length }));
    d.pats.sort((a, b) => b.fixed - a.fixed);                    // the most specific pattern (most fixed words) is tried first
  }
  const loc = (code = LANG) => (LANGS.find(l => l.code === code) || LANGS[0]).locale;
  // a translation that is an object holds the plural forms: { one, few, many, other } (Intl.PluralRules names)
  function form(v, n, code) {
    if (typeof v === 'string') return v;
    const k = n == null ? 'other' : new Intl.PluralRules(loc(code)).select(+String(n).replace(/,/g, ''));
    return v[k] != null ? v[k] : v.other;
  }
  // the translation of one English text, or null when there is none
  function lookup(s, code) {
    const d = D[code]; if (!d) return null;
    if (d.exact.has(s)) return form(d.exact.get(s), null, code);
    if (s.length > 1000) return null;   // patterns are short labels (the longest is under 400 characters with its values); a long text is something people typed, and matching it against every pattern would only freeze the page
    for (const p of d.pats) {
      const m = s.match(p.re); if (!m) continue;
      const vals = {}; let n = null;
      p.names.forEach((x, i) => {
        const raw = m[i + 1];
        if (x.name[0] === 'n' && n == null) n = raw;
        vals[x.name] = x.tr ? (lookup(norm(raw), code) ?? raw) : raw;
      });
      return form(p.v, n, code).replace(/\{~?([A-Za-z0-9]+)\}/g, (all, k) => vals[k] != null ? vals[k] : all);
    }
    return null;
  }
  // tr('Sign in') → the text in the current language (English when there is no translation)
  function tr(text, code = LANG) {
    if (text == null) return text;
    const s = String(text), core = norm(s);
    if (code === 'en' || !core || !/[A-Za-z]/.test(core)) return s;
    const t = lookup(core, code);
    if (t == null) { if (debug()) MISS.add(core); return s; }
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + t + trail;
  }
  // tf('{n} reviews', { n: 3 }): a message with values, in the current language
  const tf = (en, vals = {}) => tr(en.replace(/\{~?([A-Za-z0-9]+)\}/g, (a, k) => vals[k] != null ? vals[k] : a));
  const has = (text, code) => lookup(norm(text), code) != null;
  let DBG = null;
  function debug() {
    if (DBG === null) { try { DBG = /[?&]i18n=debug\b/.test(location.search) || localStorage.getItem('qa_i18n_debug') === '1'; } catch (e) { DBG = false; } }
    return DBG;
  }

  // ---------------------------------------------------------------- the page (browser only)
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const SKIP = 'script,style,textarea,code,pre,.prose,[data-noi18n]';   // article bodies and anything people typed stay as written
  const TXT = new WeakMap(), ATT = new WeakMap();                       // the English original of every text / attribute we changed
  function doText(n) {
    const rec = TXT.get(n);
    if (!rec || n.nodeValue !== rec.w) TXT.set(n, { o: n.nodeValue, w: null });   // new text, or text the page changed itself
    const r = TXT.get(n), t = tr(r.o);
    r.w = t; if (n.nodeValue !== t) n.nodeValue = t;
    if (DBG && LANG !== 'en' && t === r.o && n.parentNode && /[A-Za-z]{2}/.test(r.o) && !has(r.o, LANG)) n.parentNode.classList && n.parentNode.classList.add('i18n-miss');
  }
  function doEl(el) {
    if (el.tagName === 'OPTION' && !el.hasAttribute('value')) el.setAttribute('value', el.textContent);   // the value stays English
    let r = ATT.get(el); if (!r) ATT.set(el, r = {});
    ATTRS.forEach(a => {
      if (!el.hasAttribute(a)) return;
      const v = el.getAttribute(a);
      if (!r[a] || v !== r[a].w) r[a] = { o: v, w: null };
      const t = tr(r[a].o); r[a].w = t; if (v !== t) el.setAttribute(a, t);
    });
  }
  const skipped = el => el.closest && el.closest(SKIP);
  // a text box keeps exactly what people typed in it, but its example text, tooltip and screen-reader name are the page's own words
  const labelsOnly = el => el.tagName === 'TEXTAREA' && !(el.parentElement && skipped(el.parentElement));
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentNode || document.body)) doText(root); return; }
    if (root.nodeType !== 1) return;
    if (skipped(root)) { if (labelsOnly(root)) doEl(root); return; }
    doEl(root);
    const w = document.createTreeWalker(root, 5, { acceptNode: x => { if (x.nodeType === 1 && x.matches(SKIP)) { if (labelsOnly(x)) doEl(x); return 2; } return 1; } });   // 2 = skip the whole branch
    let x; while ((x = w.nextNode())) { if (x.nodeType === 3) doText(x); else doEl(x); }
  }
  let OBS = null;
  function watch() {
    if (OBS || typeof MutationObserver === 'undefined') return;
    OBS = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') { const r = TXT.get(m.target); if (!r || m.target.nodeValue !== r.w) walk(m.target); }
        else if (m.type === 'attributes') { const r = (ATT.get(m.target) || {})[m.attributeName]; if (!r || m.target.getAttribute(m.attributeName) !== r.w) { if (!skipped(m.target) || labelsOnly(m.target)) doEl(m.target); } }
      }
    });
    OBS.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(document.body);
  }
  // change the language: everything on screen follows at once (nothing is reloaded, forms keep what was typed)
  function set(code) {
    if (!CODES.includes(code)) code = 'en';
    LANG = code;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = code;
      try { localStorage.setItem('qa_lang', JSON.stringify(code)); } catch (e) { /* private window */ }
      if (document.body) { $$i('.i18n-miss').forEach(x => x.classList.remove('i18n-miss')); walk(document.body); }
    }
    return code;
  }
  const $$i = q => (typeof document !== 'undefined' ? [...document.querySelectorAll(q)] : []);
  function start() {
    let saved = 'en'; try { saved = JSON.parse(localStorage.getItem('qa_lang')) || 'en'; } catch (e) { /* nothing saved */ }
    set(saved); debug();
    if (DBG) document.documentElement.classList.add('i18n-debug');
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  }

  g.I18N = {
    LANGS, CODES, add, tr, tf, has, set, lookup: (s, c) => lookup(norm(s), c),
    get lang() { return LANG; }, locale: loc,
    missing: () => [...MISS].sort(),
    dict: code => D[code],
    start
  };
  g.tr = tr; g.tf = tf;
})(typeof window !== 'undefined' ? window : module.exports);
