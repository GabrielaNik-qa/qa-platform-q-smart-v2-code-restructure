// ===================== Admin › Account › Billing with Stripe: Plan & seats, Invoices, Payment method (Gabriela, 4 November) =====================
// Paying, changing the card, the invoices and cancelling all happen on Stripe's own pages (Checkout and the Customer portal):
// Q-smart never sees a card number. The Stripe keys are typed here once and kept encrypted; the page only knows they are set.
let BILL = null, BILLX = { inv: null, pay: undefined }, BILLED = null;
const billLoad = () => api('/api/billing').then(r => r.ok ? r.json() : null).then(j => { BILL = j; render(); });
const billGo = (path, body) => once('bill', async () => { const r = await api('/api/billing/' + path, body || {}); if (!r.ok) return toast(await errOf(r, 'Stripe could not be reached'), true); location.href = (await r.json()).url; });
const billStatus = { active: ['Active', 'ok'], trialing: ['Trial', 'ok'], past_due: ['Payment late', 'bad'], unpaid: ['Unpaid', 'bad'], canceled: ['Cancelled', 'mu'], incomplete: ['Not finished', 'wn'], incomplete_expired: ['Expired', 'mu'], paused: ['Paused', 'wn'] };
const billMode = () => BILL && BILL.mode ? pill(BILL.mode === 'live' ? tr('Live: real payments') : tr('Test mode: no real money'), BILL.mode === 'live' ? 'ok' : 'wn') : '';
function billSettings() {
  const P = BILLED || (BILLED = { secret: '', whsec: '', plans: (BILL.plans || []).map(p => ({ ...p })) }), hook = location.origin + '/api/billing/stripe-webhook';
  DEVCP = [];
  return card(`${tr('Stripe settings')} ${billMode()}`, `<div class=form style="max-width:none">`
    + `<label>${tr('Secret key')} ${BILL.configured ? `<small class=mu>(${tr('set, ends with')} …${esc(BILL.keyEnd)})</small>` : ''}<input type=password autocomplete=off placeholder="sk_test_…" oninput="BILLED.secret=this.value"></label>`
    + `<label>${tr('Webhook signing secret')} ${BILL.hook ? `<small class=mu>(${tr('set')})</small>` : ''}<input type=password autocomplete=off placeholder="whsec_…" oninput="BILLED.whsec=this.value"></label>`
    + `<div><b style="font-size:12.5px">${tr('The address for the Stripe webhook')}</b>${devCode(hook)}<small class=mu>${tr('Events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed')}</small></div>`
    + `<div class=fmh>${tr('Plans')}</div>${P.plans.map((p, i) => `<div class=billp><input aria-label="${tr('Name')}" placeholder="${tr('Name')}" value="${esc(p.name)}" oninput="BILLED.plans[${i}].name=this.value"><input aria-label="${tr('Price as shown')}" placeholder="€9 / seat / month" value="${esc(p.price)}" oninput="BILLED.plans[${i}].price=this.value"><input aria-label="Stripe price ID" placeholder="price_…" class=mono value="${esc(p.priceId)}" oninput="BILLED.plans[${i}].priceId=this.value"><input aria-label="${tr('What is included')}" placeholder="${tr('What is included')}" value="${esc(p.desc)}" oninput="BILLED.plans[${i}].desc=this.value"><button type=button class=ic aria-label="${tr('Remove')}" onclick="BILLED.plans.splice(${i},1);render()">✕</button></div>`).join('')}`
    + `<button type=button class=ib onclick="BILLED.plans.push({id:'',name:'',price:'',priceId:'',desc:''});render()">${IC.plus} ${tr('Add a plan')}</button></div>`
    + `<div class=acts>${BILL.configured ? `<button class="ib bad" onclick="billClear()">${tr('Remove the keys')}</button>` : ''}<button class=btn onclick="billSave()">${tr('Save')}</button></div>`);
}
const billSave = () => once('bills', async () => { const r = await api('/api/billing/settings', BILLED, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); BILL = await r.json(); BILLED = null; render(); toast('Saved'); });
const billClear = () => ask('Remove the Stripe keys?', 'Nobody can pay or open the billing portal until new keys are added. The subscription itself stays in Stripe.', async () => { const r = await api('/api/billing/settings', { clear: true }, 'PUT'); if (r.ok) { BILL = await r.json(); render(); toast('Removed'); } }, { yes: 'Yes, remove', no: 'Cancel', danger: true });

PG.cs_plan = function () {
  if (!BILL) { billLoad(); return head('Plan & seats', '') + card('', `<p class=mu style="margin:0">${tr('Loading…')}</p>`); }
  const s = BILL.sub, [sn, sc] = s ? billStatus[s.status] || [s.status, 'mu'] : [];
  const now = s ? card(`${tr('Your subscription')} ${pill(tr(sn), sc)} ${billMode()}`, `<div class=csk2 style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${[['Plan', s.plan ? esc(s.plan.name) : '—'], ['Seats paid', s.seats || '—'], ['Seats used', BILL.seatsUsed], [s.cancelAtEnd ? 'Ends on' : 'Renews on', s.periodEnd ? f(new Date(s.periodEnd)) : '—']].map(([n, v]) => `<div><small class=mu>${tr(n)}</small><b>${v}</b></div>`).join('')}</div>`
    + (s.seats && BILL.seatsUsed > s.seats ? `<p style="color:var(--wn);margin:10px 0 0">${tr('More people use Q-smart than the seats you pay for. Stripe adds them at the next invoice when you change the plan in the portal.')}</p>` : '')
    + `<div class=acts style="justify-content:flex-start"><button class=btn onclick="billGo('portal')">${tr('Manage billing')} ↗</button><small class=mu>${tr('Change the plan or the card, download invoices or cancel, on Stripe’s secure page.')}</small></div>`) : '';
  const plans = (BILL.plans || []).length ? `<h3 class=pgt>${tr(s ? 'Plans' : 'Choose a plan')}</h3><div class=g style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${BILL.plans.map(p => { const cur = s && s.plan && s.plan.id === p.id && s.status !== 'canceled';
    return `<div class="card billplan ${cur ? 'cur' : ''}"><b data-noi18n>${esc(p.name)}</b><div class=billpr data-noi18n>${esc(p.price || '')}</div><p class=mu data-noi18n>${esc(p.desc || '')}</p><small class=mu>${tr(`${BILL.seatsUsed} seats: everybody with an active account`)}</small>`
      + (cur ? `<span class=agl>✓ ${tr('Your plan')}</span>` : s && s.status !== 'canceled' ? `<button class=ib onclick="billGo('portal')">${tr('Switch in the portal')} ↗</button>` : `<button class=btn ${BILL.configured && p.priceId ? '' : 'disabled'} onclick="billGo('checkout',{plan:'${p.id}'})">${tr('Subscribe')}</button>`) + '</div>'; }).join('')}</div>` : '';
  return head('Plan & seats', 'Your Q-smart subscription. Payments are handled by Stripe: Q-smart never sees a card number.', bellBtn())
    + (BILL.configured ? '' : `<div class="card tip" style="margin-bottom:14px">${tr('Stripe is not connected yet. Add the secret key, the webhook secret and your plans below.')}</div>`) + now + plans + billSettings();
};
PG.cs_invoices = function () {
  if (!BILL) { billLoad(); return head('Invoices', '') + card('', `<p class=mu style="margin:0">${tr('Loading…')}</p>`); }
  if (BILLX.inv === null && BILL.customer) { BILLX.inv = []; api('/api/billing/invoices').then(async r => { BILLX.inv = r.ok ? await r.json() : []; if (!r.ok) toast(await errOf(r, 'Stripe could not be reached'), true); render(); }); }
  const l = BILLX.inv || [], st = { paid: ['Paid', 'ok'], open: ['Open', 'wn'], void: ['Cancelled', 'mu'], uncollectible: ['Not paid', 'bad'], draft: ['Draft', 'mu'] };
  return head('Invoices', 'Every invoice of the subscription, from Stripe.', bellBtn())
    + card(`${tr('Invoices')} <span class=bg>${l.length}</span>`, l.length ? tbl(['Number', 'Date', 'Total', 'Status', ''], l.map(i => [`<span class=mono data-noi18n>${esc(i.number || i.id)}</span>`, f(new Date(i.date)), `<b class=mono>${i.total.toFixed(2)} ${esc(i.currency)}</b>`, pill(tr((st[i.status] || [i.status])[0]), (st[i.status] || [0, 'mu'])[1]),
      `${i.pdf ? `<a class=ib href="${esc(i.pdf)}" target=_blank rel="noopener noreferrer">PDF ↗</a>` : ''} ${i.page ? `<a class=ib href="${esc(i.page)}" target=_blank rel="noopener noreferrer">${tr('Open')} ↗</a>` : ''}`]))
      : `<p class=mu style="margin:0">${tr(BILL.customer ? 'No invoice yet.' : 'Invoices appear here after the first payment.')}</p>`);
};
PG.cs_payment = function () {
  if (!BILL) { billLoad(); return head('Payment method', '') + card('', `<p class=mu style="margin:0">${tr('Loading…')}</p>`); }
  if (BILLX.pay === undefined && BILL.customer) { BILLX.pay = null; api('/api/billing/payment').then(async r => { BILLX.pay = r.ok ? await r.json() : null; render(); }); }
  const m = BILLX.pay;
  return head('Payment method', 'The card or bank account that pays the subscription. It is kept by Stripe, never by Q-smart.', bellBtn())
    + card('', m ? `<div class=row style="justify-content:flex-start;gap:14px"><span class=billcard>${esc(String(m.brand).toUpperCase())}</span><div><b class=mono>•••• ${esc(m.last4)}</b><br><small class=mu>${m.exp ? tr('Expires') + ' ' + esc(m.exp) : esc(m.type)}</small></div></div>` : `<p class=mu style="margin:0">${tr(BILL.customer ? 'No card saved yet.' : 'The card is added when you subscribe to a plan.')}</p>`)
    + (BILL.customer ? `<div class=acts style="justify-content:flex-start"><button class=btn onclick="billGo('portal')">${tr('Change the card')} ↗</button></div>` : `<div class=acts style="justify-content:flex-start"><button class=btn onclick="goPage('cs_plan')">${tr('Choose a plan')}</button></div>`);
};
