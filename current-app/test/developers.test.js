// The developer platform (4 November): API keys, the API, webhooks and MCP. Made-up people only (test/fixture-round4.js), on a
// temporary copy; the webhooks go to a small receiver on this computer, never to the internet.
const test = require('node:test'), assert = require('node:assert/strict'), http = require('http'), crypto = require('crypto');
const { startApp, client } = require('./fixture-round4');

let app, rcv, got = [], fake, asked = [];
test.before(async () => {
  // a fake Stripe on this computer: it answers like Stripe and remembers what it was asked
  fake = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { asked.push({ m: req.method, u: req.url, b, auth: req.headers.authorization }); res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url.startsWith('/v1/checkout') ? { url: 'https://checkout.stripe.test/c1' } : req.url.startsWith('/v1/billing_portal') ? { url: 'https://billing.stripe.test/p1' } : req.url.startsWith('/v1/invoices') ? { data: [{ id: 'in_1', number: 'QS-0001', created: 1762128000, total: 4900, currency: 'eur', status: 'paid', invoice_pdf: 'https://pay.stripe.test/in_1.pdf', hosted_invoice_url: 'https://pay.stripe.test/in_1' }] } : { data: [{ type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2030 } }] })); }); });
  await new Promise(ok => fake.listen(0, '127.0.0.1', ok));
  app = await startApp({ env: { WEBHOOK_ALLOW_LOCAL: '1', STRIPE_API_BASE: 'http://127.0.0.1:' + fake.address().port } });
  rcv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { got.push({ h: req.headers, b }); res.writeHead(req.url === '/fail' ? 500 : 200); res.end('ok'); }); });
  await new Promise(ok => rcv.listen(0, '127.0.0.1', ok));
});
test.after(() => { if (app) app.stop(); if (rcv) rcv.close(); if (fake) fake.close(); });
const call = (path, key, body, method) => fetch(app.base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) }, body: body ? JSON.stringify(body) : undefined })
  .then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

test('API keys: only admins make them; the full key is shown once; each area has its own access; a switched-off key stops working', async () => {
  const a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1');
  assert.equal((await qa.post('/api/devkeys', { name: 'x' })).status, 403);
  const k = await a.post('/api/devkeys', { name: 'Power BI', scopes: { reviews: 'read', stats: 'read', people: 'write', flags: 'bogus' }, limit: 5 });
  assert.equal(k.status, 200); assert.match(k.json.key, /^qs_[0-9a-f]{48}$/);
  assert.deepEqual(k.json.scopes, { reviews: 'read', people: 'read', scorecards: 'none', stats: 'read', simulations: 'none', flags: 'none' }, 'people can only be read; unknown values are no access');
  const list = (await a.get('/api/devkeys')).json; assert.ok(!JSON.stringify(list).includes(k.json.key), 'the list never holds the key'); assert.ok(!JSON.stringify(app.db().apiKeys).includes(k.json.key), 'nor does the data file');
  assert.equal((await call('/api/v1/reviews')).status, 401);
  assert.equal((await call('/api/v1/reviews', 'qs_wrong')).status, 401);
  const r = await call('/api/v1/reviews?limit=2', k.json.key); assert.equal(r.status, 200); assert.equal(r.json.data.length, 2); assert.ok(r.json.total >= 10);
  assert.ok(['id', 'agent', 'score', 'passed', 'categories', 'date'].every(x => x in r.json.data[0]));
  assert.equal((await call('/api/v1/reviews?agent=f.b1', k.json.key)).json.data.every(x => x.agent === 'f.b1'), true);
  assert.equal((await call('/api/v1/simulations', k.json.key)).status, 403, 'no access to practice calls');
  assert.equal((await call('/api/v1/reviews', k.json.key, { agent: 'f.b1', lead: 'X', date: '2026-11-03', score: 90 })).status, 403, 'read only');
  const st = await call('/api/v1/stats?team=B2B', k.json.key); assert.equal(st.status, 200); assert.ok(st.json.reviews > 0 && st.json.by_team.every(t => t.team === 'B2B'));
  assert.equal((await call('/api/v1/nothing', k.json.key)).status, 404);
  assert.equal(k.json.limit, 10, 'the smallest limit is 10 an hour'); const codes = []; for (let i = 0; i < 6; i++) codes.push((await call('/api/v1/me', k.json.key)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429], 'every request of the key counts, also the refused ones: the 11th in the hour is refused');
  await a.put('/api/devkeys/' + k.json.id, { active: false, limit: 1000 }); assert.equal((await call('/api/v1/me', k.json.key)).status, 401, 'switched off');
  assert.equal((await a.del('/api/devkeys/' + k.json.id)).status, 200);
});

test('the API adds a review with the import checks; MCP lists only the tools the key may use and answers with the same data', async () => {
  const a = await client(app.base, 'f.admin'), key = (await a.post('/api/devkeys', { name: 'Claude', scopes: { reviews: 'write', stats: 'read', people: 'read' } })).json.key;
  const add = await call('/api/v1/reviews', key, { agent: 'f.b2', lead: 'API-1', date: '2026-11-03', score: 88.5, channel: 'chat', comment: 'From the API' });
  assert.equal(add.status, 200, JSON.stringify(add.json)); assert.deepEqual([add.json.agent, add.json.score, add.json.channel, add.json.imported], ['f.b2', 88.5, 'chat', true]);
  assert.equal(app.db().evaluations.find(e => e.id === 'API-1').by, 'api:' + (await a.get('/api/devkeys')).json.find(x => x.name === 'Claude').id);
  assert.equal((await call('/api/v1/reviews', key, { agent: 'f.b2', lead: 'API-1', date: '2026-11-03', score: 88.5 })).status, 400, 'the same review twice');
  const rpc = (method, params, id = 1, k = key) => call('/mcp', k, { jsonrpc: '2.0', id, method, params });
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.json.result.protocolVersion, '2025-06-18'); assert.equal(init.json.result.serverInfo.name, 'q-smart');
  assert.equal((await call('/mcp', key, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  assert.equal((await rpc('initialize', {}, 1, 'qs_nope')).status, 401);
  const names = (await rpc('tools/list')).json.result.tools.map(t => t.name);
  assert.ok(names.includes('get_stats') && names.includes('create_review') && names.includes('list_agents'));
  assert.ok(!names.includes('list_simulations'), 'no access to practice calls, so no tool for them');
  const s = await rpc('tools/call', { name: 'get_stats', arguments: { team: 'B2C' } }); assert.ok(s.json.result.structuredContent.reviews > 0);
  assert.deepEqual(JSON.parse(s.json.result.content[0].text), s.json.result.structuredContent);
  const g = await rpc('tools/call', { name: 'get_review', arguments: { id: 'API-1' } }); assert.equal(g.json.result.structuredContent.score, 88.5);
  assert.equal((await rpc('tools/call', { name: 'list_flags', arguments: {} })).json.error.code, -32602);
  assert.equal((await rpc('nope/nope')).json.error.code, -32601);
});

test('webhooks: admins only, https or nothing (no local network); events are signed; a test ping; failures are logged; the sandbox sends nothing', async () => {
  const a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1'), base = `http://127.0.0.1:${rcv.address().port}`;
  assert.equal((await qa.post('/api/hooks', { url: base + '/ok', events: ['review.created'] })).status, 403);
  assert.equal((await a.post('/api/hooks', { url: 'http://example.com/x', events: ['review.created'] })).status, 400, 'https only');
  assert.equal((await a.post('/api/hooks', { url: 'https://192.168.1.10/x', events: ['review.created'] })).status, 400, 'never the local network');
  assert.equal((await a.post('/api/hooks', { url: base + '/ok', events: ['nothing'] })).status, 400, 'at least one real event');
  const h = (await a.post('/api/hooks', { name: 'Test', url: base + '/ok', events: ['review.created', 'dispute.opened', 'flag.created'] })).json; assert.match(h.secret, /^whsec_/);
  got = []; const t = await a.post('/api/hooks/' + h.id + '/test', {}); assert.deepEqual([t.json.status, t.json.ok], [200, true]);
  assert.equal(JSON.parse(got[0].b).type, 'test.ping');
  // a real event: a review saved by QA reaches the receiver, signed with the secret
  got = []; const sc = app.db().scorecards[0], ans = sc.cats.map(c => c.it.map(() => ['y', '']));
  const ev = await qa.post('/api/evaluations', { scid: sc.id, agent: 'f.b1', id: 'HOOK-1', dt: '2026-11-03', a: ans, ch: 'call' }); assert.equal(ev.status, 200, ev.text);
  assert.ok(await until(() => got.length), 'the event arrived');
  const p = JSON.parse(got[0].b), [, ts, v1] = got[0].h['q-smart-signature'].match(/^t=(\d+),v1=([0-9a-f]+)$/);
  assert.equal(p.type, 'review.created'); assert.equal(p.data.lead, 'HOOK-1'); assert.equal(p.data.score, 100); assert.equal(got[0].h['q-smart-event'], 'review.created');
  assert.equal(v1, crypto.createHmac('sha256', h.secret).update(ts + '.' + got[0].b).digest('hex'), 'the signature checks out');
  // a receiver that fails is written in the log
  const bad = (await a.post('/api/hooks', { name: 'Broken', url: base + '/fail', events: ['flag.created'] })).json;
  assert.equal((await a.post('/api/hooks/' + bad.id + '/test', {})).json.ok, false);
  assert.ok((await a.get('/api/hooks')).json.log.some(l => l.hook === bad.id && l.status === 500));
  // inside the sandbox nothing is sent
  await a.post('/api/sandbox', { from: 'copy' }); got = [];
  await a.post('/api/evaluations', { scid: sc.id, agent: 'f.b1', id: 'HOOK-SANDBOX', dt: '2026-11-03', a: ans, ch: 'call' });
  await new Promise(r => setTimeout(r, 400)); assert.equal(got.length, 0, 'the sandbox never sends events');
  await a.del('/api/sandbox'); await a.del('/api/hooks/' + h.id); await a.del('/api/hooks/' + bad.id);
});

// Stripe (4 November): admins only; the keys are kept encrypted and never sent back; Checkout and the portal are Stripe's own pages;
// the webhook of Stripe is only believed with the right signature
test('Stripe billing: encrypted keys, checkout with one seat per active account, portal, invoices, card, signed events only', async () => {
  const a = await client(app.base, 'f.admin'), qa = await client(app.base, 'f.qa1');
  assert.equal((await qa.get('/api/billing')).status, 403);
  assert.equal((await a.put('/api/billing/settings', { secret: 'pk_test_123' })).status, 400, 'the publishable key is not the secret key');
  const sk = 'sk_test_' + 'a'.repeat(24), wh = 'whsec_' + 'b'.repeat(24);
  const s = await a.put('/api/billing/settings', { secret: sk, whsec: wh, plans: [{ id: 'pro', name: 'Pro', price: '€9 per seat / month', priceId: 'price_1ABC' }, { name: '' }] });
  assert.deepEqual([s.json.configured, s.json.mode, s.json.keyEnd, s.json.hook, s.json.plans.length], [true, 'test', 'aaaa', true, 1]);
  assert.ok(!JSON.stringify(s.json).includes(sk) && !JSON.stringify(app.db().settings.billing).includes(sk), 'never sent back, never readable in the data file');
  assert.equal((await a.post('/api/billing/portal', {})).status, 400, 'no customer yet');
  asked = []; const c = await a.post('/api/billing/checkout', { plan: 'pro' }); assert.equal(c.json.url, 'https://checkout.stripe.test/c1');
  const seats = app.db().users.filter(u => u.active !== false).length, q = new URLSearchParams(asked[0].b);
  assert.deepEqual([asked[0].u, asked[0].auth, q.get('mode'), q.get('line_items[0][price]'), q.get('line_items[0][quantity]')], ['/v1/checkout/sessions', 'Bearer ' + sk, 'subscription', 'price_1ABC', String(seats)]);
  // Stripe's events: a wrong signature is refused; a right one records the subscription
  const send = (ev, secret = wh) => { const body = JSON.stringify(ev), t = Math.floor(Date.now() / 1000), v1 = crypto.createHmac('sha256', secret).update(t + '.' + body).digest('hex');
    return fetch(app.base + '/api/billing/stripe-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${v1}` }, body }).then(r => r.status); };
  const done = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { customer: 'cus_1', subscription: 'sub_1' } } };
  assert.equal(await send(done, 'whsec_wrong'), 400); assert.equal(app.db().billing, undefined);
  assert.equal(await send(done), 200);
  assert.equal(await send({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, items: { data: [{ price: { id: 'price_1ABC' }, quantity: seats, current_period_end: 1764720000 }] } } } }), 200);
  const b = (await a.get('/api/billing')).json; assert.deepEqual([b.sub.status, b.sub.plan.name, b.sub.seats], ['active', 'Pro', seats]);
  assert.equal((await a.post('/api/billing/portal', {})).json.url, 'https://billing.stripe.test/p1');
  assert.equal((await a.get('/api/billing/invoices')).json[0].total, 49);
  assert.deepEqual((await a.get('/api/billing/payment')).json, { type: 'card', brand: 'visa', last4: '4242', exp: '04/2030' });
  assert.equal(await send({ id: 'evt_3', type: 'invoice.payment_failed', data: { object: { status: 'open' } } }), 200);
  assert.ok(app.db().notifications.some(n => n.to === 'f.admin' && /payment .* failed/.test(n.text || n.msg || JSON.stringify(n))), 'admins are told when a payment fails');
});
