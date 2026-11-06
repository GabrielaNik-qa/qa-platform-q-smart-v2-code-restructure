// ===================== Developers: API keys, Developer API, Webhooks, MCP connectors (Gabriela, 4 November) =====================
// Laid out like the developer pages of ElevenLabs: keys with No access / Read / Write per area, a quickstart with ready-to-copy code,
// webhooks with a test button and the last deliveries, and "Connect the Q-smart MCP" with the steps for each AI assistant.
// The address shown everywhere is the one this page was opened with (the free Cloudflare address changes at every restart).
let DEVI = { base: '', areas: {}, events: {}, tools: [] }, DEVK = [], DEVH = { hooks: [], log: [], events: {} }, DEVNEW = null, DEVTAB = { mcp: 'desktop', code: 'curl' }, DEVCP = [];
const devBase = () => DEVI.base || location.origin;
// a block of code with a Copy button (the text is kept aside, so nothing in it has to be escaped inside an onclick)
const devCode = (t, label) => { const i = DEVCP.push(t) - 1; return `<div class=devcode>${label ? `<small class=mu>${esc(tr(label))}</small>` : ''}<pre data-noi18n>${esc(t)}</pre><button class="ib devcp" onclick="devCopy(${i})">${IC.copy} ${tr('Copy')}</button></div>`; };
const devCopy = i => (navigator.clipboard ? navigator.clipboard.writeText(DEVCP[i]) : Promise.reject()).then(() => toast('Copied'), () => toast('Could not copy: select the text and press Ctrl C', true));
const devTabs = (key, l) => `<div class="seg cstabs" role=tablist>${l.map(([k, n]) => `<button role=tab class="${DEVTAB[key] === k ? 'on' : ''}" aria-selected="${DEVTAB[key] === k}" onclick="DEVTAB.${key}='${k}';render()">${esc(tr(n))}</button>`).join('')}</div>`;
const devHead = (t, s) => { DEVCP = []; return head(t, s, `<div style="display:flex;gap:8px">${bellBtn()}</div>`); };
const devLvl = { none: 'No access', read: 'Read', write: 'Write' };

// ---------------------------------------------------------------- API keys
const devScopesHtml = d => `<div class=fmh>${tr('Access')}</div><div class=devperm>${Object.entries(DEVI.areas).map(([a, [n, can]]) => `<div class=devpr><span>${tr(n)}</span><div class=seg role=radiogroup aria-label="${esc(tr(n))}">${['none', 'read', 'write'].map(l => {
  const off = l === 'write' && !can.includes('w'); return `<button type=button role=radio class="${(d.scopes[a] || 'none') === l ? 'on' : ''}" aria-checked="${(d.scopes[a] || 'none') === l}" ${off ? 'disabled title="' + esc(tr('Only reading is possible here')) + '"' : ''} onclick="FM.d.scopes['${a}']='${l}';render()">${tr(devLvl[l])}</button>`; }).join('')}</div></div>`).join('')}</div>`
  + `<div class=row style="justify-content:flex-start;gap:8px;margin:8px 0 14px"><button type=button class=ib onclick="Object.keys(DEVI.areas).forEach(a=>{FM.d.scopes[a]='read'});render()">${tr('Read everything')}</button><button type=button class=ib onclick="FM.d.scopes={};render()">${tr('No access to anything')}</button></div>`;
function devKeyForm(id) {
  const k = DEVK.find(x => x.id === id) || { name: '', scopes: {}, limit: 1000 };
  openForm({ title: id ? 'Change the API key' : 'Create an API key', w: 620, yes: id ? 'Save' : 'Create key', d: { name: k.name, limit: String(k.limit), scopes: { ...k.scopes } },
    fields: [{ k: 'name', l: 'Name', req: 1, ph: 'e.g. Power BI, Zapier, Claude' }, { k: 'limit', l: 'Requests per hour (at most)', t: 'number', hint: 'From 10 to 100,000. The key is refused for the rest of the hour when it is reached.' }],
    extra: devScopesHtml,
    save: async d => { if (!d.name.trim()) return 'Give the key a name';
      const r = await api('/api/devkeys' + (id ? '/' + id : ''), { name: d.name, limit: Number(d.limit), scopes: d.scopes }, id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save');
      const j = await r.json(); if (!id) DEVNEW = { key: j.key, name: j.name }; await load(); toast(id ? 'Saved' : 'Key created'); } });
}
const devKeyOn = async (id, on) => { const r = await api('/api/devkeys/' + id, { active: on }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); toast(on ? 'The key works again' : 'The key is switched off'); };
const devKeyDel = id => ask('Delete this API key?', 'Every program that uses it stops working at once. This cannot be undone.', async () => { const r = await api('/api/devkeys/' + id, null, 'DELETE'); if (!r.ok) return toast(await errOf(r, 'Could not delete'), true); await load(); render(); toast('Deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const devBars = days => { const l = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return (days || {})[d] || 0; }), m = Math.max(1, ...l);
  return `<span class=devbars title="${tr('The last 14 days')}">${l.map(v => `<i style="height:${Math.max(2, Math.round(v / m * 22))}px" title="${v}"></i>`).join('')}</span>`; };
PG.cs_apikeys = function () {
  const fresh = DEVNEW ? card(`🔑 ${tr('Your new key')}: <span data-noi18n>${esc(DEVNEW.name)}</span>`, `<p class=mu style="margin:0 0 8px">${tr('Copy it now and keep it somewhere safe: you will not see it again. Anybody with this key can use Q-smart with the access you chose.')}</p>${devCode(DEVNEW.key)}<div class=acts><button class=btn onclick="DEVNEW=null;render()">${tr('I copied it')}</button></div>`, 'devnew') : '';
  const rows = DEVK.map(k => [`<b data-noi18n>${esc(k.name)}</b><br><small class="mono mu">${esc(k.hint)}</small>`,
    Object.values(k.scopes).every(v => v === 'read') ? pill(tr('Read everything'), 'mu') : Object.entries(k.scopes).filter(([, v]) => v !== 'none').map(([a, v]) => pill(`${tr((DEVI.areas[a] || [a])[0])}: ${tr(devLvl[v])}`, v === 'write' ? 'wn' : 'mu')).join(' ') || `<small class=mu>${tr('No access')}</small>`,
    `<span class=mono>${k.limit}</span><small class=mu>/${tr('hour')}</small>`, k.last ? fdt(k.last) : '—', `${devBars(k.days)} <small class="mono mu">${k.uses}</small>`,
    `<label class=rad><input type=checkbox class=switch ${k.active ? 'checked' : ''} onchange="devKeyOn('${k.id}',this.checked)" aria-label="${tr('The key works')}"></label>`,
    `<span style="white-space:nowrap"><button class=ic title="${tr('Change')}" aria-label="${tr('Change')}" onclick="devKeyForm('${k.id}')">${IC.pen}</button><button class=ic title="${tr('Delete')}" aria-label="${tr('Delete')}" onclick="devKeyDel('${k.id}')">${IC.bin}</button></span>`]);
  return devHead('API keys', 'Keys let other programs (Power BI, Zapier, your own tools, Claude) use Q-smart. Each key has its own access and limit.')
    + `<div class=row style="justify-content:flex-end;margin-bottom:12px"><button class="btn ibx" onclick="devKeyForm()">${IC.plus} ${tr('Create key')}</button></div>` + fresh
    + card(`${tr('Your keys')} <span class=bg>${DEVK.length}</span>`, DEVK.length ? tbl(['Name', 'Access', 'Limit', 'Last used', 'Uses', 'On', ''], rows) : `<p class=mu style="margin:0">${tr('No key yet. Create one, then follow Developer API or MCP connectors to use it.')}</p>`)
    + card('Good to know', `<ul class=sbxl>${['Q-smart keeps only a fingerprint of each key, never the key itself: a lost key cannot be shown again. Make a new one.', 'Give each program its own key, with only the access it needs. Switch a key off or delete it the moment you do not trust it any more.', 'Every request counts towards the hourly limit, also the ones the key has no access for.'].map(x => `<li>${tr(x)}</li>`).join('')}</ul>`);
};

// ---------------------------------------------------------------- Developer API: the quickstart and every address
const DEVEP = [['GET', '/me', '', 'The name, access and limit of the key'], ['GET', '/reviews', 'reviews', 'Reviews, newest first: score, passed, categories, comment, dispute'], ['GET', '/reviews/{id}', 'reviews', 'One review (its id or its lead id)'],
  ['POST', '/reviews', 'reviews', 'Add a review from another tool: agent, lead, date, score, channel, comment'], ['GET', '/agents', 'people', 'The agents and their team'], ['GET', '/teams', 'people', 'The teams: lead, number of agents, pass mark'],
  ['GET', '/scorecards', 'scorecards', 'The scorecards with their categories and questions'], ['GET', '/stats', 'stats', 'Average, pass rate and disputes, per team, agent and category'],
  ['GET', '/simulations', 'simulations', 'Practice calls of the Call Simulator'], ['GET', '/flags', 'flags', 'Quick flags']];
PG.cs_api = function () {
  const b = devBase() + '/api/v1', ex = {
    curl: `curl "${b}/stats?from=2026-11-01&team=B2B" \\\n  -H "Authorization: Bearer YOUR_KEY"`,
    js: `const r = await fetch("${b}/reviews?limit=20", {\n  headers: { Authorization: "Bearer YOUR_KEY" }\n});\nconst { data, total } = await r.json();`,
    py: `import requests\nr = requests.get("${b}/reviews", params={"limit": 20},\n                 headers={"Authorization": "Bearer YOUR_KEY"})\nprint(r.json()["total"])`,
    post: `curl -X POST "${b}/reviews" \\\n  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"agent":"m.ivanova","lead":"LEAD-1001","date":"2026-11-03","score":92,"channel":"call"}'` };
  return devHead('Developer API', 'Read your quality data from any program, or add reviews from another tool. Everything answers in JSON.')
    + `<div class="g g2" style="align-items:start">${card('1 · ' + tr('Create a key'), `<p class=mu style="margin:0 0 10px">${tr('In API keys, with Read access to what the program needs.')}</p><button class=ib onclick="goPage('cs_apikeys')">${tr('Open API keys')} ›</button>`)}`
    + card('2 · ' + tr('The address'), devCode(b) + `<p class=mu style="margin:6px 0 0"><small>${tr('The address of this app as you opened it. With the free Cloudflare address it changes when the tunnel restarts.')}</small></p>`) + '</div>'
    + card('3 · ' + tr('Call it'), devTabs('code', [['curl', 'cURL'], ['js', 'JavaScript'], ['py', 'Python'], ['post', 'Add a review']]) + devCode(ex[DEVTAB.code])
      + devCode(`{\n  "data": [ { "id": "r1a2b3c", "lead": "LEAD-1001", "agent": "m.ivanova", "team": "B2B", "date": "2026-11-03",\n             "score": 92, "passed": true, "channel": "call", "categories": [ … ] } ],\n  "total": 154, "limit": 20, "offset": 0\n}`, 'The answer'))
    + card('Addresses', tbl(['', 'Address', 'Access needed', 'What it gives'], DEVEP.map(([m, p, a, d]) => [`<b class="mono devm ${m === 'POST' ? 'post' : ''}">${m}</b>`, `<span class=mono data-noi18n>/api/v1${esc(p)}</span>`, a ? `${tr((DEVI.areas[a] || [a])[0])}: ${tr(m === 'POST' ? 'Write' : 'Read')}` : '—', tr(d)]))
      + `<p class=mu style="margin:10px 0 0">${tr('Lists understand')} <span class=mono>from, to</span> (YYYY-MM-DD), <span class=mono>team, agent, limit</span> (${tr('up to 500')}), <span class=mono>offset</span>.</p>`)
    + card('Answers when something is wrong', tbl(['Code', 'Meaning'], [['400', 'The request is not complete or not right (the message says why)'], ['401', 'No key, a wrong key, or a key that is switched off'], ['403', 'The key has no access to this'], ['404', 'This does not exist'], ['429', 'The hourly limit of the key is reached']].map(([c, m]) => [`<b class=mono>${c}</b>`, tr(m)])));
};

// ---------------------------------------------------------------- Webhooks
function devHookForm(id) {
  const h = DEVH.hooks.find(x => x.id === id) || { name: '', url: '', events: ['review.created'] };
  openForm({ title: id ? 'Change the webhook' : 'Add a webhook', w: 620, yes: id ? 'Save' : 'Add', d: { name: h.name, url: h.url, events: [...h.events] },
    fields: [{ k: 'name', l: 'Name', ph: 'e.g. Slack #quality, Zapier' }, { k: 'url', l: 'Address that receives the events', req: 1, ph: 'https://' }, { k: 'events', l: 'Events', t: 'multi', o: () => Object.entries(DEVH.events).map(([k, n]) => [k, `${tr(n)} (${k})`]) }],
    save: async d => { if (!/^https:\/\//i.test(d.url.trim())) return 'The address must start with https://'; if (!d.events.length) return 'Choose at least one event';
      const r = await api('/api/hooks' + (id ? '/' + id : ''), { name: d.name, url: d.url.trim(), events: d.events }, id ? 'PUT' : 'POST'); if (!r.ok) return errOf(r, 'Could not save'); await load(); toast(id ? 'Saved' : 'Webhook added'); } });
}
const devHookTest = id => once('hk' + id, async () => { toast('Sending a test…'); const r = await api('/api/hooks/' + id + '/test', {}); if (!r.ok) return toast(await errOf(r, 'Could not send'), true);
  const j = await r.json(); await load(); render(); toast(j.ok ? tr('Delivered') + ' (' + j.status + ')' : tr('Not delivered') + ': ' + (j.status || j.err), !j.ok); });
const devHookOn = async (id, on) => { const r = await api('/api/hooks/' + id, { active: on }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); };
const devHookDel = id => ask('Delete this webhook?', 'Q-smart stops sending events to this address.', async () => { await api('/api/hooks/' + id, null, 'DELETE'); await load(); render(); toast('Deleted'); }, { yes: 'Yes, delete', no: 'Cancel', danger: true });
const devHookSecret = id => ask('Make a new secret?', 'The program that receives the events must use the new secret from now on.', async () => { await api('/api/hooks/' + id, { newSecret: true }, 'PUT'); await load(); render(); toast('New secret made'); }, { yes: 'Yes, make a new one', no: 'Cancel' });
PG.cs_webhooks = function () {
  const hooks = DEVH.hooks.map(h => card(`<span style="flex:1"><span data-noi18n>${esc(h.name)}</span></span>${h.last ? pill(h.last.ok ? `✓ ${h.last.status}` : `✗ ${h.last.status || tr('no answer')}`, h.last.ok ? 'ok' : 'bad') : pill(tr('Not used yet'), 'mu')}`,
    `<p class=mono style="margin:0 0 8px;word-break:break-all" data-noi18n>${esc(h.url)}</p><div class=chips style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${h.events.map(e => pill(e, 'mu')).join('')}</div>`
    + `<details><summary class=agl style="cursor:pointer">${tr('Signing secret')}</summary>${devCode(h.secret)}<button class=ib onclick="devHookSecret('${h.id}')">${tr('Make a new secret')}</button></details>`
    + (h.fails ? `<p style="color:var(--bad);margin:8px 0 0"><small>${tr(`${h.fails} failed deliveries in a row`)}${h.active ? '' : ' · ' + tr('switched off after 20')}</small></p>` : '')
    + `<div class=row style="margin-top:10px;flex-wrap:wrap;gap:8px"><label class=rad><input type=checkbox class=switch ${h.active ? 'checked' : ''} onchange="devHookOn('${h.id}',this.checked)"> <span>${tr('Sends events')}</span></label><span style="display:flex;gap:6px"><button class=ib onclick="devHookTest('${h.id}')">${tr('Send a test')}</button><button class=ic title="${tr('Change')}" aria-label="${tr('Change')}" onclick="devHookForm('${h.id}')">${IC.pen}</button><button class=ic title="${tr('Delete')}" aria-label="${tr('Delete')}" onclick="devHookDel('${h.id}')">${IC.bin}</button></span></div>`)).join('');
  const log = DEVH.log.slice(0, 30).map(l => [`<span class=mono>${fdt(l.at)}</span>`, `<span data-noi18n>${esc(l.name)}</span>`, `<span class=mono>${esc(l.event)}</span>`, l.ok ? pill('✓ ' + l.status, 'ok') : pill('✗ ' + (l.status || tr('no answer')), 'bad'), `<span class=mono>${l.ms} ms</span>`, l.attempt > 1 ? tr(`try ${l.attempt}`) : '', l.err ? `<small class=mu data-noi18n>${esc(l.err)}</small>` : '']);
  const verify = `const crypto = require("crypto");\n// header Q-smart-Signature: t=1730700000,v1=5f2b…\nfunction fromQsmart(rawBody, header, secret) {\n  const [, t, v1] = header.match(/t=(\\d+),v1=([0-9a-f]+)/);\n  const mine = crypto.createHmac("sha256", secret).update(t + "." + rawBody).digest("hex");\n  return mine === v1 && Math.abs(Date.now() / 1000 - t) < 300;   // and not older than 5 minutes\n}`;
  return devHead('Webhooks', 'Q-smart tells another program the moment something happens: a review is saved, a dispute is opened, a practice call is finished.')
    + `<div class="card tip" style="margin-bottom:14px">${tr('How it works: you give Q-smart the address of the other program (Slack, Zapier, Make, your CRM). When an event you chose happens, Q-smart sends it the details at once. Nothing is sent from the sandbox.')}</div>`
    + `<div class=row style="justify-content:flex-end;margin-bottom:12px"><button class="btn ibx" onclick="devHookForm()">${IC.plus} ${tr('Add webhook')}</button></div>`
    + (hooks ? `<div class=g style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">${hooks}</div>` : card('', `<p class=mu style="margin:0">${tr('No webhook yet. To try one, open webhook.site, copy "Your unique URL" and add it here.')}</p>`))
    + card(`${tr('Last deliveries')} <span class=bg>${DEVH.log.length}</span>`, log.length ? tbl(['When', 'Webhook', 'Event', 'Answer', 'Time', '', ''], log) : `<p class=mu style="margin:0">${tr('Nothing sent yet.')}</p>`)
    + `<div class="g g2" style="align-items:start">${card('Events', tbl(['Event', 'When'], Object.entries(DEVH.events).map(([k, n]) => [`<span class=mono>${k}</span>`, tr(n)])))}`
    + card('For the developer of the other program', `<p class=mu style="margin:0 0 8px">${tr('Every event is a POST with JSON: id, type, created and data. It is signed with the secret of the webhook. Answer with 200 within 8 seconds; otherwise Q-smart tries twice more (after 5 and 30 seconds).')}</p>${devCode(verify, 'Check the signature (Node.js)')}`) + '</div>';
};

// ---------------------------------------------------------------- MCP connectors: "Connect the Q-smart MCP" (like ElevenLabs)
PG.cs_mcp = function () {
  const url = devBase() + '/mcp', prompt = 'Using the Q-smart MCP, show me the average score and pass rate of each team this month, and the three weakest categories.';
  const desktop = JSON.stringify({ mcpServers: { 'q-smart': { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${QSMART_AUTH}'], env: { QSMART_AUTH: 'Bearer YOUR_KEY' } } } }, null, 2);
  const cursor = JSON.stringify({ mcpServers: { 'q-smart': { url, headers: { Authorization: 'Bearer YOUR_KEY' } } } }, null, 2);
  const step = (n, t, body) => `<div class=devstep><span class=devn>${n}</span><div><b>${tr(t)}</b>${body}</div></div>`;
  const keyStep = step(1, 'Create an API key', `<p class=mu>${tr('Give it Read access to what the assistant may see (or Read everything). Copy the key.')}</p><button class=ib onclick="goPage('cs_apikeys')">${tr('Open API keys')} ›</button>`);
  const S = {
    desktop: [keyStep, step(2, 'Open Claude › Settings › Developer › Edit Config', `<p class=mu>${tr('Paste this into the file (claude_desktop_config.json) and put your key instead of YOUR_KEY. It needs Node.js on the computer.')}</p>${devCode(desktop)}`),
      step(3, 'Close Claude completely and open it again', `<p class=mu>${tr('Q-smart then appears among the connectors (the tools icon under the message box).')}</p>`)],
    code: [keyStep, step(2, 'Run this in the terminal', devCode(`claude mcp add --transport http q-smart ${url} --header "Authorization: Bearer YOUR_KEY"`))],
    cursor: [keyStep, step(2, 'Open Cursor › Settings › MCP › Add new server', `<p class=mu>${tr('Or paste this into .cursor/mcp.json, with your key instead of YOUR_KEY.')}</p>${devCode(cursor)}`)],
    other: [keyStep, step(2, 'Give the assistant the address and the key', `${devCode(url, 'Server address (Streamable HTTP)')}${devCode('Authorization: Bearer YOUR_KEY', 'Header')}<p class=mu>${tr('Assistants that only connect with a sign-in page (Claude.ai and ChatGPT connectors) come later: they need a sign-in with OAuth.')}</p>`)]
  }[DEVTAB.mcp];
  return devHead('Connect the Q-smart MCP', 'Ask your AI assistant about your quality data: it reads Q-smart through a key, with only the access the key has.')
    + `<section class="card devmcp">${devTabs('mcp', [['desktop', 'Claude Desktop'], ['code', 'Claude Code'], ['cursor', 'Cursor'], ['other', 'Other assistants']])}`
    + `<div class=devsteps>${S.join('')}${step(S.length + 1, 'Then try this prompt', devCode(prompt))}</div><p class=mu style="margin:14px 0 0;border-top:1px solid var(--bd);padding-top:10px"><small>${tr('One key per assistant. Switch it off or delete it anytime in API keys.')}</small></p></section>`
    + card(`${tr('What the assistant can do')} <span class=bg>${DEVI.tools.length}</span>`, tbl(['Tool', 'What it does', 'Access needed'], DEVI.tools.map(t => [`<span class=mono>${t.name}</span>`, tr(t.description), `${tr((DEVI.areas[t.area] || [t.area])[0])}: ${tr(t.write ? 'Write' : 'Read')}`])));
};
