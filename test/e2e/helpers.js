// Shared by the browser tests: a page for one person (signed in through the real sign-in form), the errors the page reported,
// and a way to call the app's API as that person (to prepare data; the result is always checked on the page itself).
const { expect } = require('@playwright/test');
const fs = require('fs');

let N = 0;
// every person gets their own browser context and made-up network address (the sign-in limits count per address)
async function personPage(browser, username, { viewport, lang } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 800 }, acceptDownloads: true }), addr = '10.55.' + (++N >> 8 & 255) + '.' + (N & 255);
  const origin = new URL(process.env.E2E_BASE).origin, errors = [];
  // the made-up address goes only to the app. Anything asked from another site is refused and is an error: since 28 October the
  // fonts are served by the app, so no page may contact Google, or anybody else
  await ctx.route(u => u.origin === origin, r => r.continue({ headers: { ...r.request().headers(), 'x-forwarded-for': addr } }));
  await ctx.route(u => /^https?:$/.test(u.protocol) && u.origin !== origin, r => { errors.push('asked another site: ' + r.request().url()); return r.abort(); });
  // the page's requests still on their way: a page is "ready" when it has drawn and none is left (no fixed waiting time)
  await ctx.addInitScript(() => { window.__inflight = 0; const f = window.fetch; window.fetch = (...a) => { window.__inflight++; return f(...a).finally(() => { window.__inflight--; }); }; });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 500) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  // a request of the app cut off by reloading the page (ERR_ABORTED) is normal browser behaviour, not an error; the refused
  // requests to other sites are already counted above
  page.on('requestfailed', r => { const why = (r.failure() || {}).errorText || ''; if (new URL(r.url()).origin === origin && !/ERR_ABORTED/.test(why)) errors.push('request failed: ' + r.url() + ' ' + why); });
  await page.goto(process.env.E2E_BASE + '/');
  if (lang) { await page.locator('.lglang summary').click(); await page.getByRole('button', { name: lang, exact: true }).click(); }   // the language globe on top (4 November)
  if (username) await signIn(page, username);
  return { page, ctx, errors };
}
async function signIn(page, username, password = 'password') {
  await page.locator('#lu').fill(username);
  await page.locator('#lp').fill(password);
  await page.locator('button.sbtn').click();
  await expect(page.locator('#lu')).toHaveCount(0);                       // the sign-in form is gone
  await page.waitForFunction(() => typeof ME !== 'undefined' && ME && ME.username);
  await closeWelcome(page);
}
const closeWelcome = page => page.evaluate(() => { if (typeof WEL !== 'undefined' && WEL) welClose(); });
// the app's own api() helper, as the signed-in person
const api = (page, url, body, method) => page.evaluate(async ([u, b, m]) => { const r = await api(u, b, m); let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ } return { status: r.status, json: j }; }, [url, body === undefined ? null : body, method]);
// opens a page by its address and waits until the app shows it and has received everything it asked for
async function go(page, r) {
  await page.evaluate(x => { location.hash = '#' + x; }, r);
  await page.waitForFunction(x => typeof route !== 'undefined' && route === x, r);
  await page.waitForFunction(() => window.__inflight === 0, null, { polling: 50 });
  await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));   // the page has drawn what arrived
}
const db = () => JSON.parse(fs.readFileSync(process.env.E2E_DATA, 'utf8'));
module.exports = { personPage, signIn, api, go, db, closeWelcome };
