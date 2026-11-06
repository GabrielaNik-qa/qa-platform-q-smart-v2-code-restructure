// ===================== Admin › Platform: Sandbox, Import data, Beta features (Gabriela, 3 November) =====================
// Sandbox: a practice copy (a made-up company shaped like Kainami, or a copy of the data). While an admin is inside, an orange bar is on
// every page and nothing reaches the real data. Import data: users, teams or reviews from CSV or Excel, with a preview row by row.
// Beta features: an admin switches the newest features off for the whole company (they are on until then).
let SBXI = null, IMPD = { kind: 'users', file: null, prev: null, busy: false };

// ---------------------------------------------------------------- the orange bar inside the sandbox
const sbxBar = () => SET.sandbox ? `<div class=sbxbar role=status><b>🧪 ${tr('Sandbox')}</b><span>${tr('Practice data: nothing you do here changes your real data, and no e-mail is sent.')}</span><button class=ib onclick="sbxGo('leave')">${tr('Leave the sandbox')}</button></div>` : '';
// entering or leaving reloads the whole page, so no list of the other data stays on screen
const sbxGo = what => once('sbx', async () => { const r = await api('/api/sandbox' + (what === 'make' || what === 'copy' ? '' : '/' + what), what === 'copy' ? { from: 'copy' } : what === 'make' ? { from: 'demo' } : {});
  if (!r.ok) return toast(await errOf(r, 'Could not do it'), true); location.hash = what === 'leave' ? 'cs_sandbox' : 'dash'; location.reload(); });
const sbxDel = () => ask('Delete the sandbox?', 'The practice data is removed. Your real data stays as it is.', async () => { const r = await api('/api/sandbox', null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete'), true);
  if (SET.sandbox) { location.hash = 'cs_sandbox'; location.reload(); return; } SBXI = null; render(); toast('Deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const sbxNew = from => SBXI && SBXI.exists ? ask('Make a new sandbox?', 'The practice data of the sandbox you have now is replaced. Your real data stays as it is.', () => sbxGo(from === 'copy' ? 'copy' : 'make'), { yes: 'Yes, make a new one', no: 'Cancel' }) : sbxGo(from === 'copy' ? 'copy' : 'make');

PG.cs_sandbox = function () {
  if (!SBXI) { api('/api/sandbox').then(r => r.ok ? r.json() : { exists: false }).then(j => { SBXI = j; if (route === 'cs_sandbox') render(); }); return head('Sandbox', 'A practice copy to try things safely.') + card('', `<p class=mu style="margin:0">${tr('Loading…')}</p>`); }
  const opt = (from, t, d, b) => `<div class="card sbxopt"><b>${tr(t)}</b><p class=mu>${tr(d)}</p><button class="${from === 'demo' ? 'btn' : 'ib'}" onclick="sbxNew('${from}')">${tr(b)}</button></div>`;
  const now = SBXI.exists ? card(SET.sandbox ? `🧪 ${tr('You are in the sandbox')}` : tr('Your sandbox'), `<div class=csk2 style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">${[['Made from', tr(SBXI.from === 'copy' ? 'A copy of your data' : 'A made-up company')], ['Made on', fdt(SBXI.made || SBXI.at)], ['People', SBXI.people], ['Reviews', SBXI.reviews], ['Practice calls', SBXI.sims]].map(([n, v]) => `<div><small class=mu>${tr(n)}</small><b>${v}</b></div>`).join('')}</div>`
    + `<div class=acts style="justify-content:flex-start">${SET.sandbox ? `<button class=btn onclick="sbxGo('leave')">${tr('Leave the sandbox')}</button>` : `<button class=btn onclick="sbxGo('enter')">🧪 ${tr('Enter the sandbox')}</button>`}<button class="ib bad" onclick="sbxDel()">${IC.bin} ${tr('Delete the sandbox')}</button></div>`) : '';
  return head('Sandbox', 'A practice copy of the company: try settings, imports and new features without touching the real data.', bellBtn()) + now
    + `<h3 class=pgt>${tr(SBXI.exists ? 'Start again with a new sandbox' : 'Make the sandbox')}</h3><div class="g g2" style="align-items:stretch">`
    + opt('demo', 'A made-up company', 'Teams B2B, B2C and VIP KAM, like Kainami, with 12 made-up agents, their reviews of the last 90 days and practice calls in the Call Simulator. Good for demos and training.', 'Make a made-up company')
    + opt('copy', 'A copy of your data', 'Everything as it is now: people, teams, reviews and settings, without the AI keys and the e-mail texts. Good to try a change before you make it for real.', 'Copy my data') + '</div>'
    + card('How the sandbox works', `<ul class=sbxl>${['Only admins enter it. Everybody else keeps working on the real data at the same time.', 'An orange bar is on every page while you are inside. Leave it with one click.',
      'Inside, no e-mail is sent, nothing is written in the audit log, and the AI is off.', 'Backups, restores, Reset data, Refresh seed.js, Purge and recordings are switched off inside.', 'A new sandbox replaces the old one. The real data is never changed.'].map(x => `<li>${tr(x)}</li>`).join('')}</ul>`);
};

// ---------------------------------------------------------------- Import data
const IMPK = {
  users: ['Users', 'Name, Email, Role, Team', 'Everybody gets the first password and must change it at the first sign-in. No e-mail is sent. A role other than agent goes into Administration.'],
  teams: ['Teams', 'Name, Lead', 'Every team needs a lead: the username or the name of a staff member who is already there.'],
  reviews: ['Reviews', 'Date, Agent, Lead ID, Score, Channel, Reviewer, Comment', 'Reviews from another tool, with their total score (no answers per question). They count in the scores and reports, and are marked "Imported".']
};
async function impFile(inp) { const f = inp.files && inp.files[0]; if (!f) return;
  if (!/\.(csv|txt|xlsx)$/i.test(f.name)) { inp.value = ''; return toast('Choose a CSV or Excel (.xlsx) file', true); }
  if (f.size > 5242880) { inp.value = ''; return toast('The file must be smaller than 5 MB', true); }
  IMPD.file = { name: f.name, data: await b64(f) }; IMPD.prev = null; impPreview(); }
const impPreview = () => once('impp', async () => { IMPD.busy = true; render(); const r = await api('/api/import/preview', { kind: IMPD.kind, file: IMPD.file }); IMPD.busy = false;
  if (!r.ok) { IMPD.prev = null; render(); return toast(await errOf(r, 'The file could not be read'), true); } IMPD.prev = await r.json(); render(); });
const impGo = () => once('impg', async () => { const r = await api('/api/import', { kind: IMPD.kind, file: IMPD.file }); if (!r.ok) return toast(await errOf(r, 'Could not import'), true);
  const j = await r.json(); IMPD = { kind: IMPD.kind, file: null, prev: null, busy: false }; await load(); render(); toast(impN(j.add, "{n} row imported", "{n} rows imported") + (j.skip ? ' · ' + tr(`${j.skip} skipped`) : '')); });
// "1 row", "2 rows": the English text by the number, then its translation (the patterns of each language know their plurals)
const impN = (n, one, many) => tr((n === 1 ? one : many).replace("{n}", n));
const impKind = k => { IMPD = { kind: k, file: null, prev: null, busy: false }; render(); };
PG.cs_import = function () {
  const K = IMPK[IMPD.kind], p = IMPD.prev;
  const pick = `<div class="seg cstabs" role=tablist>${Object.entries(IMPK).map(([k, v]) => `<button role=tab class="${IMPD.kind === k ? 'on' : ''}" aria-selected="${IMPD.kind === k}" onclick="impKind('${k}')">${tr(v[0])}</button>`).join('')}</div>`;
  const step1 = card(`1 · ${tr('Choose the file')}`, `<p style="margin:0 0 6px"><b>${tr('Columns')}:</b> <span class=mono>${esc(K[1])}</span></p><p class=mu style="margin:0 0 10px">${tr(K[2])}</p>`
    + `<div class=row style="justify-content:flex-start;gap:10px;flex-wrap:wrap"><label class=btn style="cursor:pointer">${tr('Choose a CSV or Excel file')}<input type=file accept=".csv,.txt,.xlsx" style="display:none" onchange="impFile(this)"></label><a class=ib href="/api/import/template/${IMPD.kind}" download>${IC.dl} ${tr('Download an example')}</a>${IMPD.file ? `<small class=mu data-noi18n>${esc(IMPD.file.name)}</small>` : ''}</div>`
    + `<p class=mu style="margin:10px 0 0"><small>${tr('The first row names the columns, in any order. Up to 2,000 rows. Excel: the first sheet.')}</small></p>`);
  const rows = p ? p.rows.map(x => [x.n, `<span data-noi18n>${esc(Object.values(x.r).filter(Boolean).join(' · '))}</span>`, x.ok ? `<span style="color:var(--ok)">✓ ${tr('Added')}</span> <small class=mu data-noi18n>${esc(x.what || '')}</small>` : `<span style="color:var(--bad)">✗ ${esc(tr(x.why))}</span>`]) : [];
  const step2 = IMPD.busy ? card(`2 · ${tr('Check')}`, `<p class=mu style="margin:0">${tr('Reading the file…')}</p>`) : p ? card(`2 · ${tr('Check')} <span class=bg>${p.rows.length}</span>`, `<div class=row style="justify-content:flex-start;gap:12px;margin-bottom:10px">${pill(impN(p.add, "{n} row to add", "{n} rows to add"), 'ok')}${p.skip ? pill(tr(`${p.skip} skipped`), 'wn') : ''}${p.more ? `<small class=mu>${tr('Only the first 2,000 rows are read.')}</small>` : ''}</div>`
    + tbl(['Row', 'Values', 'What happens'], rows) + `<div class=acts><button class=ib onclick="IMPD.file=null;IMPD.prev=null;render()">${tr('Cancel')}</button><button class=btn onclick="impGo()" ${p.add ? '' : 'disabled'}>${impN(p.add, "Import {n} row", "Import {n} rows")}</button></div>`) : '';
  return head('Import data', 'Bring in users, teams and reviews from a CSV or Excel file. You see what will happen before anything is saved.', bellBtn())
    + `<div class="card tip" style="margin-bottom:14px">${SET.sandbox ? '🧪 ' + tr('You are in the sandbox: the rows go into the sandbox only.') : tr('Tip: try the file in the sandbox first (Admin › Sandbox).')}</div>` + pick + step1 + step2;
};

// ---------------------------------------------------------------- Beta features
const BETA = [
  ['callsim', 'Call Simulator', 'Practice calls with a written or an AI customer, and their dashboard.', ['sim', 'simres', 'simsc']],
  ['hcsite', 'Help Center website', 'The public website with articles about Q-smart (switched off, it shows nothing).', ['cs_hcsite']],
  ['tours', 'Guided tours', 'Step-by-step tours through the real pages.', ['cs_tours']],
  ['scoresim', 'Score simulator', 'What if: how a failed critical item or a new weight would change the score.', ['cs_scoresim']],
  ['pins', 'Pins', 'Moments of conversations saved for coaching.', ['cs_pins']],
  ['ideas', 'Feature requests', 'Ask for features and vote for the ideas of others.', ['cs_ideas']]
];
const betaOf = k => BETA.find(b => b[3].includes(k));
const betaOff = k => { const b = betaOf(k); return !!b && ((SET && SET.beta) || {})[b[0]] === false; };   // a page of a feature an admin switched off
const betaSet = (k, on) => setX('beta', { ...((SET.beta) || {}), [k]: on }, tr(on ? 'Switched on for everybody' : 'Switched off for everybody')).then(() => render());
PG.cs_beta = function () {
  return head('Beta features', 'The newest features of Q-smart. They are on for everybody; switch one off to hide it from the whole company until you are ready.', bellBtn())
    + `<div class=g style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${BETA.map(([k, n, d, pages]) => { const on = ((SET.beta) || {})[k] !== false;
      return card(`<span style="flex:1">${tr(n)}</span><small class=beta>${tr('Beta')}</small>`, `<p class=mu style="margin:0 0 10px">${tr(d)}</p><p style="margin:0 0 10px"><small class=mu>${tr('Pages')}: ${pages.map(x => esc(tr((GROUPS.flatMap(g => g.items).find(i => i[0] === x) || [x, x])[1]))).join(', ')}</small></p>`
        + `<label class=rad><input type=checkbox class=switch ${on ? 'checked' : ''} onchange="betaSet('${k}',this.checked)"> <span>${tr(on ? 'On for everybody' : 'Off for everybody')}</span></label>`); }).join('')}</div>`;
};
