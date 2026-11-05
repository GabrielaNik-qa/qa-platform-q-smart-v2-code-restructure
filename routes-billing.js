// Admin › Billing with Stripe (4 November): the plans, the subscription, the invoices and the card.
// Q-smart never sees a card number: the admin pays on Stripe's own page (Checkout) and changes the card, the plan or cancels on
// Stripe's own page (Customer portal). Stripe tells Q-smart what happened through its webhook, signed with the webhook secret.
// The secret key and the webhook secret are kept encrypted (like the AI keys); the page only sees whether they are set.
// Test keys (sk_test_…) never move real money. STRIPE_API_BASE = another address for the Stripe API (the tests use a fake one).
const crypto = require('crypto');
module.exports = ({ app, load, save, need, bad, hex, iso, str, notify, SBX }) => {
  const API = process.env.STRIPE_API_BASE || 'https://api.stripe.com';
  const real = fn => SBX.exit(fn);
  const conf = db => (db.settings || {}).billing || {};
  const secretOf = db => (app.locals.unseal || (() => ''))(conf(db).secret);
  const seats = db => db.users.filter(u => u.active !== false).length;   // everybody with an active account is a seat
  const base = req => `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
  // a call to Stripe: form fields with [brackets] for lists and objects, as Stripe expects
  const form = (o, pre = '', out = new URLSearchParams()) => { for (const [k, v] of Object.entries(o)) { const key = pre ? `${pre}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out); else if (v !== undefined && v !== null && v !== '') out.append(key, String(v)); } return out; };
  async function stripe(db, method, path, body) {
    const sk = secretOf(db); if (!sk) throw new Error('Add the Stripe secret key first (Admin › Billing › Plan & seats)');
    const r = await fetch(API + path, { method, signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + sk, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body ? form(body).toString() : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Stripe: ' + ((j.error || {}).message || 'error ' + r.status)); return j;
  }
  const PLAN = p => ({ id: str(p.id, 20).replace(/[^\w-]/g, '') || 'p' + hex(3), name: str(p.name, 40), desc: str(p.desc, 200), price: str(p.price, 30), priceId: /^price_[A-Za-z0-9]+$/.test(p.priceId || '') ? p.priceId : '' });
  const pubOf = db => { const c = conf(db), sk = secretOf(db), b = db.billing || {};
    return { configured: !!sk, mode: sk.startsWith('sk_live_') || sk.startsWith('rk_live_') ? 'live' : sk ? 'test' : '', keyEnd: sk ? sk.slice(-4) : '', hook: !!c.whsec, plans: c.plans || [], seatsUsed: seats(db),
      sub: b.subscription ? { status: b.status, plan: (c.plans || []).find(p => p.priceId === b.priceId) || null, seats: b.quantity || null, periodEnd: b.periodEnd || null, cancelAtEnd: !!b.cancelAtEnd } : null,
      customer: !!b.customer, events: (b.events || []).slice(0, 20) }; };
  app.get('/api/billing', need('admin'), (req, res) => real(() => res.json(pubOf(load()))));
  // the keys and the plans: a key is only replaced when a new one is typed (an empty box keeps the old one)
  app.put('/api/billing/settings', need('admin'), (req, res) => real(() => {
    const b = req.body || {}, db = load(), c = { ...conf(db) }, seal = app.locals.seal;
    if (b.secret) { const s = String(b.secret).trim(); if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(s)) return bad(res, 'The secret key starts with sk_test_ or sk_live_'); c.secret = seal(s); }
    if (b.whsec) { const s = String(b.whsec).trim(); if (!/^whsec_[A-Za-z0-9]{10,}$/.test(s)) return bad(res, 'The webhook secret starts with whsec_'); c.whsec = seal(s); }
    if (b.clear) { delete c.secret; delete c.whsec; }
    if (Array.isArray(b.plans)) c.plans = b.plans.slice(0, 6).map(PLAN).filter(p => p.name);
    db.settings = { ...db.settings, billing: c }; save(db); res.json(pubOf(db));
  }));
  // pay: Stripe's own payment page for the chosen plan, with as many seats as there are active accounts
  app.post('/api/billing/checkout', need('admin'), async (req, res) => { const db = real(() => load()), c = conf(db), p = (c.plans || []).find(x => x.id === (req.body || {}).plan), b = db.billing || {};
    if (!p || !p.priceId) return bad(res, 'Choose a plan with a Stripe price ID');
    try { const s = await stripe(db, 'POST', '/v1/checkout/sessions', { mode: 'subscription', line_items: { 0: { price: p.priceId, quantity: seats(db) } }, ...(b.customer ? { customer: b.customer } : { customer_email: req.session.user.email || undefined }),
      client_reference_id: 'q-smart', allow_promotion_codes: 'true', billing_address_collection: 'required', tax_id_collection: { enabled: 'true' },
      success_url: base(req) + '/index.html#cs_plan', cancel_url: base(req) + '/index.html#cs_plan' }); res.json({ url: s.url }); } catch (e) { bad(res, e.message); } });
  // change the card, see or download invoices, change the plan or cancel: Stripe's own customer portal
  app.post('/api/billing/portal', need('admin'), async (req, res) => { const db = real(() => load()), b = db.billing || {}; if (!b.customer) return bad(res, 'Subscribe to a plan first');
    try { const s = await stripe(db, 'POST', '/v1/billing_portal/sessions', { customer: b.customer, return_url: base(req) + '/index.html#cs_plan' }); res.json({ url: s.url }); } catch (e) { bad(res, e.message); } });
  app.get('/api/billing/invoices', need('admin'), async (req, res) => { const db = real(() => load()), b = db.billing || {}; if (!b.customer) return res.json([]);
    try { const j = await stripe(db, 'GET', '/v1/invoices?limit=24&customer=' + encodeURIComponent(b.customer));
      res.json((j.data || []).map(i => ({ id: i.id, number: i.number, date: new Date(i.created * 1000).toISOString(), total: i.total / 100, currency: String(i.currency || '').toUpperCase(), status: i.status, pdf: i.invoice_pdf, page: i.hosted_invoice_url }))); } catch (e) { bad(res, e.message); } });
  app.get('/api/billing/payment', need('admin'), async (req, res) => { const db = real(() => load()), b = db.billing || {}; if (!b.customer) return res.json(null);
    try { const j = await stripe(db, 'GET', `/v1/customers/${encodeURIComponent(b.customer)}/payment_methods?limit=3`), m = (j.data || [])[0];
      res.json(m ? { type: m.type, brand: (m.card || {}).brand || m.type, last4: (m.card || m.sepa_debit || {}).last4 || '', exp: m.card ? `${String(m.card.exp_month).padStart(2, '0')}/${m.card.exp_year}` : '' } : null); } catch (e) { bad(res, e.message); } });

  // Stripe → Q-smart: the signed events (the raw body is kept by server.js only for this address)
  const verify = (raw, header, secret) => { const parts = Object.fromEntries(String(header || '').split(',').map(x => x.split('=')).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
    const t = Number(parts.t); if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > 300) return false;
    const mine = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex'); return mine.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(parts.v1)); };
  app.post('/api/billing/stripe-webhook', (req, res) => real(() => {
    const db = load(), whsec = (app.locals.unseal || (() => ''))(conf(db).whsec);
    if (!whsec || !req.rawBody || !verify(req.rawBody.toString('utf8'), req.get('stripe-signature'), whsec)) return res.status(400).json({ error: 'The signature does not match' });
    const ev = req.body || {}, o = (ev.data || {}).object || {}, b = db.billing = db.billing || {};
    if ((b.seen || []).includes(ev.id)) return res.json({ received: true });   // Stripe may send the same event twice
    b.seen = [ev.id, ...(b.seen || [])].slice(0, 200);
    if (ev.type === 'checkout.session.completed') { b.customer = o.customer || b.customer; b.subscription = o.subscription || b.subscription; }
    if (/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type)) { const it = ((o.items || {}).data || [])[0] || {};
      Object.assign(b, { customer: o.customer || b.customer, subscription: o.id, status: ev.type.endsWith('deleted') ? 'canceled' : o.status, priceId: (it.price || {}).id || b.priceId, quantity: it.quantity || o.quantity || b.quantity,
        periodEnd: (it.current_period_end || o.current_period_end) ? new Date((it.current_period_end || o.current_period_end) * 1000).toISOString() : b.periodEnd, cancelAtEnd: !!o.cancel_at_period_end }); }
    if (ev.type === 'invoice.payment_failed') db.users.filter(u => u.role === 'admin' && u.active !== false).forEach(u => notify(db, u.username, 'billing', 'The payment of the Q-smart subscription failed. Update the card in Admin › Billing › Payment method.', {}));
    if (/^(checkout|customer\.subscription|invoice)\./.test(ev.type)) b.events = [{ type: ev.type, at: iso(), status: o.status || '' }, ...(b.events || [])].slice(0, 50);
    save(db); res.json({ received: true });
  }));
};
