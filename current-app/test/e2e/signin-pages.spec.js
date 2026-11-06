// Sign-in for every role through the real form, the language switch, and every page of every role opened in the browser
// with no error. Forbidden and odd addresses never show a page the role may not have.
const { test, expect } = require('@playwright/test');
const { personPage, signIn, go, api, closeWelcome } = require('./helpers');

const PEOPLE = { admin: 'f.admin', qa: 'f.qa1', lead: 'f.lead1', trainer: 'f.tr1', agent: 'f.b1' };

test('a wrong password shows a clear message; a deactivated person cannot sign in', async ({ browser }) => {
  const { page, ctx } = await personPage(browser, null);
  await page.locator('#lu').fill('f.b1'); await page.locator('#lp').fill('wrong'); await page.locator('button.sbtn').click();
  await expect(page.locator('#lge')).toContainText('Wrong username/email or password');
  await page.locator('#lu').fill('f.gone'); await page.locator('#lp').fill('password'); await page.locator('button.sbtn').click();
  await expect(page.locator('#lge')).toContainText('deactivated');
  await ctx.close();
});

for (const [role, who] of Object.entries(PEOPLE)) {
  test(`${role}: signs in, opens every page allowed with no error, and is kept out of the others`, async ({ browser }) => {
    const { page, ctx, errors } = await personPage(browser, who);
    expect(await page.evaluate(() => ME.role)).toBe(role);
    const pages = await page.evaluate(() => Object.keys(PG).filter(p => canRoute(p))), all = await page.evaluate(() => Object.keys(PG));
    expect(pages.length).toBeGreaterThan(role === 'agent' ? 15 : 35);
    for (const p of pages) {
      await go(page, p);
      const text = (await page.locator('main, #app, body').first().innerText()).trim();
      expect(text.length, p + ' has content').toBeGreaterThan(40);
    }
    for (const p of [...all.filter(p => !pages.includes(p)), 'constructor', '__proto__', 'toString']) {
      await page.evaluate(r => { location.hash = '#' + r; }, p);
      await page.waitForFunction(r => route !== r || !Object.keys(PG).includes(r), p);
      expect(await page.evaluate(() => route === 'dash' || !Object.keys(PG).includes(route) || canRoute(route)), p + ' is not shown').toBe(true);
    }
    expect(errors, 'no error on any page').toEqual([]);
    await ctx.close();
  });
}

// the menu Gabriela approved on 28 October: the order, the two coloured panels, the settings wheel (Admin / Settings) with
// My account on top, System settings under Quality set-up for admins only, and the name written as G.Georgieva
test('the menu: order, coloured Q Trainer and Q-Intelligence, the settings wheel with My account, System settings for admins only', async ({ browser }) => {
  const a = await personPage(browser, 'f.admin', { viewport: { width: 1366, height: 800 } });
  // after signing in OPERATIONS, MANAGE and APPS are three rows of icons (29 October); a click on each heading opens it
  expect(await a.page.locator('.appsr').evaluateAll(l => l.map(r => r.children.length))).toEqual([5, 5, 5]);   // APPS: Q-Intelligence, Q Trainer, Learning, AI agents, Transcripts
  await expect(a.page.locator('.appsr .appi.g-aihub')).toHaveCSS('color', 'rgb(255, 107, 0)');
  for (const h of ['.sech.sec-ops', '.sech.sec-manage', '.apph:not(.sech)']) await a.page.locator(h).click();
  await expect(a.page.locator('.appsr')).toHaveCount(0);
  expect(await a.page.locator('#n .gh span').allInnerTexts()).toEqual(['Home', 'Quality', 'Analytics', 'Performance', 'Coaching', 'AI Hub', 'Help Center', 'Planning', 'Reports', 'Activity Log', 'Q-Intelligence', 'Q Trainer', 'Learning', 'AI agents', 'Transcripts']);
  await expect(a.page.locator('.grp.sp-ai .gh i')).toHaveCSS('color', 'rgb(255, 212, 71)');
  await expect(a.page.locator('.grp.sp-qi .gh i')).toHaveCSS('color', 'rgb(255, 111, 145)');
  // after signing in every group is folded; a click anywhere on a row (name or icon) unfolds it and opens its first page, a second click folds it (29 October)
  await expect(a.page.locator('#n .grp.open')).toHaveCount(0);
  const quality = a.page.locator('#n .grp.g-quality .gh');
  await quality.locator('span').click(); await expect(a.page.locator('#n .grp.g-quality')).toHaveClass(/open/);
  await expect.poll(() => a.page.evaluate(() => location.hash), 'the click also opens the first page').toBe('#calls');
  await quality.locator('i').click(); await expect(a.page.locator('#n .grp.open')).toHaveCount(0);
  await a.page.locator('#n .grp.g-analytics .gh em').click(); await expect(a.page.locator('#n .grp.g-analytics')).toHaveClass(/open/);   // the arrow only unfolds
  expect(await a.page.evaluate(() => location.hash)).toBe('#calls');
  await a.page.locator('#n .grp.g-analytics .gh span').click(); await expect.poll(() => a.page.evaluate(() => location.hash), 'an open group opens its first page too').toBe('#agents');
  await a.page.locator('#n .grp.g-analytics .gh span').click(); await expect(a.page.locator('#n .grp.open')).toHaveCount(0);
  await go(a.page, 'dash');
  // OPERATIONS and MANAGE (29 October): two headings like APPS; AI Hub always orange; AI Hub, Help Center and Activity Log have sub-menus
  expect(await a.page.locator('.sech span').allInnerTexts()).toEqual(['OPERATIONS', 'MANAGE']);   // written in capitals on screen
  await expect(a.page.locator('.grp.g-aihub .gh i')).toHaveCSS('color', 'rgb(255, 107, 0)');
  for (const [g, k, h] of [['activity', 'audit', /Activity Log/], ['help', 'cs_faq', /FAQ/], ['aihub', 'aihub', /AI Hub/]]) {
    await a.page.locator(`#n .grp.g-${g} .gh`).click(); await expect(a.page.locator(`#n .grp.g-${g}`)).toHaveClass(/open/);
    if (g === 'aihub') await expect(a.page.locator(`#n .grp.g-${g} .sub a.soon`).first(), 'coming-soon sub-pages, greyed').toBeVisible();   // Help Center and Activity Log are built (3 November)
    await a.page.locator(`#n .grp.g-${g} .sub a[href="#${k}"]`).click(); await expect(a.page.locator('#m h1')).toHaveText(h);
  }
  await a.page.locator('.sech.sec-manage').click();
  expect(await a.page.locator('.appsr .appi').evaluateAll(l => l.map(b => b.title))).toEqual(['AI Hub', 'Help Center', 'Planning', 'Reports', 'Activity Log']);
  await expect(a.page.locator('.appi.g-aihub')).toHaveCSS('color', 'rgb(255, 107, 0)');
  await a.page.locator('.appi.g-reports').click(); await expect.poll(() => a.page.evaluate(() => location.hash)).toBe('#rbuild');
  await a.page.locator('.sech.sec-manage').click(); await go(a.page, 'dash');
  // APPS: the panels end with ↗; the heading folds them into one row of icons (remembered); the icons-only menu keeps the line
  expect(await a.page.locator('.spc .gh em').first().innerText()).toBe('↗');
  await a.page.locator('.apph:not(.sech)').click();
  expect(await a.page.locator('.appsr .appi').evaluateAll(l => l.map(b => b.title))).toEqual(['Q-Intelligence', 'Q Trainer', 'Learning', 'AI agents', 'Transcripts']);
  expect(await a.page.locator('.spc').count()).toBe(0);
  await a.page.reload(); await a.page.waitForFunction(() => typeof ME !== 'undefined' && ME); await closeWelcome(a.page);
  await expect(a.page.locator('.appsr .appi'), 'folded is remembered').toHaveCount(5);
  await a.page.evaluate(() => { if (!COL) toggleSb(); });
  expect([await a.page.locator('.apph').count(), await a.page.locator('#n .spsep').count(), await a.page.locator('.spc').count()]).toEqual([0, 2, 5]);   // icons-only: a line between OPERATIONS and MANAGE, and the APPS line
  await a.page.evaluate(() => { toggleSb(); appsTog({ stopPropagation() {} }); });
  // the icons-only menu: the logo, every icon, the theme button and the photo on one centre line
  await a.page.evaluate(() => { if (!COL) toggleSb(); });
  const centres = await a.page.evaluate(() => { const m = e => { const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2); };
    return [...new Set([m(document.querySelector('#br svg')), ...[...document.querySelectorAll('#n .gh i')].map(m), m(document.querySelector('.thc1')), m(document.querySelector('.av2'))])]; });
  expect(centres.length, 'one centre line: ' + centres).toBe(1);
  await a.page.evaluate(() => toggleSb());
  await a.page.locator('#n .grp.sp-tr .gh, #n .appi.sp-tr').click(); await expect.poll(() => a.page.evaluate(() => location.hash), 'Transcripts opens straight away').toBe('#tr');
  // the search in the menu: typed into directly, the matches drop down under it, no pop-up (29 October)
  await a.page.locator('#sbq').fill('trans'); await expect(a.page.locator('#sbl .palr').first()).toContainText('Transcripts');
  await expect(a.page.locator('#palq'), 'no pop-up').toHaveCount(0);
  await a.page.locator('#sbq').fill('agent c'); await expect(a.page.locator('#sbl')).toContainText('Nothing found');   // "Agent C1" is a person, not a menu name
  await a.page.locator('#sbq').fill('trans'); await a.page.locator('#sbq').press('Enter');
  await expect.poll(() => a.page.evaluate(() => location.hash), '"trans" in the search finds Transcripts').toBe('#tr');
  // coming soon (29 October): Quality > Conversations, Q-Intelligence > Spotlight, and five Tools in the Learning panel (greyed)
  await go(a.page, 'cs_conv'); await expect(a.page.locator('#m h1')).toHaveText(/Conversations/i);
  await go(a.page, 'cs_spot'); await expect(a.page.locator('#m h1')).toHaveText(/Spotlight/i);
  await go(a.page, 'cs_redact'); await expect(a.page.locator('#n .spt')).toHaveText('Learning'); await expect(a.page.locator('#n .grp.g-tools')).not.toHaveClass(/soon/);   // four tools are built (3 November); only the Translator waits for the AI
  await go(a.page, 'dash');
  await a.page.locator('.usr button[title="Admin"]').click();
  await expect(a.page.locator('#n .sech.sec-account')).toHaveCount(1); await expect(a.page.locator('#n .spt'), 'no ADMIN title').toHaveCount(0);
  await a.page.locator('#br .brand').click(); await expect(a.page.locator('#n .sech.sec-ops'), 'the logo goes back to the main menu').toHaveCount(1);
  await a.page.locator('.usr button[title="Admin"]').click(); await expect(a.page.locator('#n .sech.sec-account')).toHaveCount(1); await expect(a.page.locator('#n .spt'), 'no ADMIN title').toHaveCount(0);
  // the Admin panel (29 October): five one-word sections of at most five icons, folded; the coming-soon groups greyed
  expect(await a.page.locator('#n .sech span').allInnerTexts()).toEqual(['ACCOUNT', 'PEOPLE', 'SETUP', 'GOVERNANCE', 'PLATFORM']);
  expect(await a.page.locator('#n .appsr').evaluateAll(l => l.map(r => r.children.length))).toEqual([4, 4, 5, 5, 4]);   // SETUP got Sidebar settings
  // five places in every row: the icons sit in the same columns as GOVERNANCE, a shorter row leaves the last place empty
  const cols = await a.page.locator('#n .appsr').evaluateAll(l => l.map(r => [...r.children].map(b => Math.round(b.getBoundingClientRect().left))));
  for (const r of cols) expect(r).toEqual(cols[3].slice(0, r.length));
  expect(await a.page.locator('#n .appi.soon').evaluateAll(l => l.map(b => b.title))).toEqual([]);   // AI Act, Security, Accessibility, Support, Sidebar settings, Sandbox and Beta features were built on 3 November, Billing and Quinn (in AI) on 4 November
  await a.page.locator('.sech.sec-account').click();
  expect((await a.page.locator('#n .gh span').allInnerTexts()).slice(1)).toEqual(['My account', 'Company', 'Billing', 'Support']);
  await expect(a.page.locator('#n .grp.open'), 'the panel\'s groups start folded too').toHaveCount(0);
  await a.page.locator('#br .brand').click(); await a.page.locator('.usr button[title="Admin"]').click();   // back to the main menu, then Admin again
  await expect(a.page.locator('#n .appsr'), 'the Admin panel always opens with every section folded').toHaveCount(5); await expect(a.page.locator('#n .grp.open')).toHaveCount(0);
  await go(a.page, 'cs_vat'); await expect(a.page.locator('#m h1')).toHaveText(/EU VAT/i); await expect(a.page.locator('#m')).toContainText('Coming soon');
  await go(a.page, 'att'); await expect(a.page.locator('#n .sech.sec-people'), 'Workforce pages open in the Admin panel').toHaveCount(1);
  await go(a.page, 'sysset'); await expect(a.page.locator('#m h1')).toHaveText(/System settings/i);
  // Roles > one page per role (29 October): Panel, Category, Subcategory, the role, then its people; a person's own tick is thick
  await go(a.page, 'perm_agent');
  expect((await a.page.locator('#m table tr').first().locator('th').allInnerTexts()).slice(0, 4).map(t => t.split('\n')[0])).toEqual(['PANEL', 'CATEGORY', 'SUBCATEGORY', 'AGENT']);
  const firstP = a.page.locator('#m table tr').nth(1).locator('input[type=checkbox]').nth(1);
  await firstP.click(); await expect(a.page.locator('#m input.pown')).toHaveCount(1); await expect(a.page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(a.page.locator('#m input.pown')).toHaveCount(0);
  await a.page.evaluate(() => openAcct('password')); await a.page.getByRole('button', { name: /Go to settings/ }).click();
  await expect.poll(() => a.page.evaluate(() => location.hash)).toBe('#acpw');
  expect(a.errors).toEqual([]); await a.ctx.close();
  const g = await personPage(browser, 'f.c1', { viewport: { width: 1366, height: 800 } });
  expect(await g.page.locator('#n .gh span').allInnerTexts()).not.toContain('Activity Log');
  await expect(g.page.locator('#n .g-help')).toHaveCount(1); await expect(g.page.locator('#n .g-aihub')).toHaveCount(1); await expect(g.page.locator('#n .g-activity')).toHaveCount(1);   // Activity Log: an agent sees only My activity (3 November)
  expect(await g.page.evaluate(() => groupsFor().find(x => x.id === 'activity').items.map(i => i[0]))).toEqual(['cs_myact']);
  await expect(g.page.locator('.un b')).toHaveText('A.C1');                                      // "Agent C1": the initial and the last name
  await g.page.locator('.usr button[title="Settings"]').click();
  expect(await g.page.locator('#n .sech span').allInnerTexts(), 'an agent: My account, and Workforce (attendance, time off)').toEqual(['ACCOUNT', 'PEOPLE']);
  await expect(g.page.locator('#n .appi.soon'), 'no coming-soon page for agents').toHaveCount(0);
  await g.page.evaluate(() => { location.hash = '#sysset'; }); await expect.poll(() => g.page.evaluate(() => route)).not.toBe('sysset');
  expect(g.errors).toEqual([]); await g.ctx.close();
});

test('the fonts come from the app itself: titles in Barlow Condensed, text in Barlow, Bulgarian letters in Fira Sans, nothing asked from Google', async ({ browser }) => {
  const { page, ctx, errors } = await personPage(browser, 'f.qa1');
  await go(page, 'dash');
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => ({ title: document.fonts.check('700 30px "Barlow Condensed"'), text: document.fonts.check('400 15px Barlow', 'Quality'),
    files: performance.getEntriesByType('resource').filter(e => /\.woff2/.test(e.name)).map(e => new URL(e.name).origin + new URL(e.name).pathname) }));
  expect(r.title, 'Barlow Condensed is loaded').toBe(true); expect(r.text, 'Barlow is loaded').toBe(true);
  expect(r.files.length).toBeGreaterThan(0);
  for (const f of r.files) expect(f.startsWith(process.env.E2E_BASE + '/fonts/'), f).toBe(true);
  await page.evaluate(() => setLang('bg')); await go(page, 'calls');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 15px "Fira Sans"', 'Оценки')), 'the Cyrillic letters of Fira Sans are loaded').toBe(true);
  await page.evaluate(() => setLang('en'));
  expect(errors, 'no error, and no request to another site').toEqual([]);
  await ctx.close();
});

test('screen-reader names follow the language too (the check boxes of Notification rules in Bulgarian and French)', async ({ browser }) => {
  const { page, ctx, errors } = await personPage(browser, 'f.admin');
  await page.evaluate(() => setLang('bg')); await go(page, 'notifs');
  const bg = await page.locator('table input[type=checkbox]').first().getAttribute('aria-label');
  expect(bg).toMatch(/[А-я]/); expect(bg).toContain('Администратор');
  await page.evaluate(() => setLang('fr')); await go(page, 'perms');
  expect(await page.locator('table input[type=checkbox]').first().getAttribute('aria-label')).toContain('Administrateur');
  // a text box: its name and its example follow the language, what people typed in it never changes ("Yes" stays "Yes")
  expect((await api(page, '/api/org', { words: { types: ['Yes', 'Reactivation'], topics: [], vocab: [] } }, 'PUT')).status).toBe(200);
  await page.reload(); await page.waitForFunction(() => typeof ME !== 'undefined' && ME);
  await page.evaluate(() => setLang('bg')); await go(page, 'words');
  const box = page.locator('#wd-types');
  expect(await box.getAttribute('aria-label')).toBe('Видове разговори');
  expect(await page.locator('#wd-topics').getAttribute('placeholder')).toBe('Конкуренти | марка А, марка Б, друг сайт');
  expect(await box.inputValue()).toBe('Yes\nReactivation');
  await page.evaluate(() => setLang('en'));
  expect(await box.getAttribute('aria-label')).toBe('Call types');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('the language: chosen on the sign-in screen, saved with the account, the same after signing out and in again', async ({ browser }) => {
  const { page, ctx, errors } = await personPage(browser, null, { lang: 'Български' });
  await signIn(page, 'f.c1');
  await expect(page.locator('body')).toContainText('Табло за качество');          // "Quality Dashboard"
  await expect(page.locator('body')).toContainText('Операции');                   // "Operations" in the menu (folded at sign-in)
  expect(await page.evaluate(() => I18N.lang)).toBe('bg');
  expect((await api(page, '/api/me')).json.prefs.lang).toBe('bg');
  await page.evaluate(() => out()); await expect(page.locator('#lu')).toBeVisible();
  await page.locator('.lglang summary').click(); await page.getByRole('button', { name: 'English', exact: true }).click();      // the globe; somebody else could pick English on this computer…
  await signIn(page, 'f.c1');
  expect(await page.evaluate(() => I18N.lang), '…the account keeps Bulgarian').toBe('bg');
  await page.evaluate(() => setLang('fr'));
  await expect(page.locator('body')).toContainText('Tableau de bord qualité');
  expect((await api(page, '/api/me')).json.prefs.lang).toBe('fr');
  await page.evaluate(() => setLang('en'));
  expect(errors).toEqual([]);
  await ctx.close();
});

test('Home has a language button next to the bell: it shows the language in use and changes it (saved with the account)', async ({ browser }) => {
  const { page, ctx, errors } = await personPage(browser, 'f.qa1');
  await go(page, 'dash');
  await expect(page.locator('#m .lngb summary b')).toHaveText('EN');
  await page.locator('#m .lngb summary').click();
  await expect(page.locator('#m .lngl button')).toHaveText(['English', 'Български', 'Français']);   // each in its own words
  await page.locator('#m .lngl button', { hasText: 'Français' }).click();
  await expect(page.locator('body')).toContainText('Tableau de bord qualité');
  await expect(page.locator('#m .lngb summary b')).toHaveText('FR');
  expect((await api(page, '/api/me')).json.prefs.lang).toBe('fr');
  await page.evaluate(() => setLang('en'));
  expect(errors).toEqual([]);
  await ctx.close();
});

// 3 November: an app opens its first page with one click; Ctrl K is the app search (everything but the menu); the assistant is Quinn
test('apps open their first page at once; the app search finds people and tasks but no menu names; Ask Quinn', async ({ browser }) => {
  const { page, ctx, errors } = await personPage(browser, 'f.admin', { viewport: { width: 1366, height: 900 } });
  await go(page, 'dash');
  await page.locator('#n .appi.sp-learn, #n .grp.sp-learn .gh').first().click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#acad');                   // Learning › My Learning, no second click
  await go(page, 'dash'); await page.keyboard.press('Control+k'); await expect(page.locator('#palq')).toBeVisible();
  await page.locator('#palq').fill('agent c'); await expect(page.locator('#pall')).toContainText('Agent C1');
  await page.locator('#palq').fill('transcripts'); await expect(page.locator('#pall .palr').first()).not.toContainText(/^Transcripts/);   // the menu has its own search
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => GROUPS.find(g => g.id === 'qintel').items[0][1])).toBe('Ask Quinn');
  expect(errors).toEqual([]); await ctx.close();
});
