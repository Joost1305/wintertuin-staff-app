// Browser smoke test: runs the real staff app against test/mock-supabase.js.
// Usage: python3 -m http.server 8770 &  then  BASE=http://localhost:8770/ node test/ui-test.cjs [outdir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8770/';
const OUT = process.argv[2] || 'test/shots';
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

async function session(browser, role, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'en-GB' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((r) => { window.__MOCK_ROLE = r; window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.__printHook = () => window.print(); }, role);
  await page.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  return { ctx, page, errors };
}
const step = async (name, fn) => { process.stdout.write(`- ${name} ... `); await fn(); console.log('ok'); };
const login = async (p) => { await p.goto(BASE); await p.waitForSelector('#login-form'); await p.fill('[name=email]', 'a@b.c'); await p.fill('[name=password]', 'test'); await p.click('button[type=submit]'); await p.waitForSelector('.about-app'); await p.goto(BASE + '#/sops'); await p.waitForSelector('.sop-card'); };

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  try {
    const A = await session(browser, 'manager', { width: 1280, height: 900 });
    const p = A.page;
    await step('login page in English', async () => { await p.goto(BASE); await p.waitForSelector('#login-form'); if (!/Sign in/.test(await p.textContent('h1'))) throw new Error('not English'); await p.screenshot({ path: `${OUT}/01-login.png` }); });
    await step('login lands on About (first in the menu)', async () => { await login(p); await p.screenshot({ path: `${OUT}/02-sops.png`, fullPage: true }); });
    await step('SOPs in English, Dutch fallback, translation hint', async () => {
      const body = await p.textContent('#app');
      if (!/Morning check kitchen/.test(body) || !/Coffee machine on/.test(body)) throw new Error('English not shown');
      if (!/Bar sluiten/.test(body)) throw new Error('Dutch fallback missing');
      if (!/No English version yet for 1 SOP/.test(body)) throw new Error('missing-English note');
    });
    await step('app switch to Finance next to the brand, same icon', async () => {
      const a = await p.$('.topbar #app-switch'); if (!a) throw new Error('no switch');
      const txt = await a.textContent(); if (!/Finance/.test(txt) || !/\u2197/.test(txt)) throw new Error(txt);
      if (!/wintertuin-finance/.test(await a.getAttribute('href'))) throw new Error('href');
      const nav = await p.$$eval('#nav a', (as) => as.map((x) => x.textContent));
      if (nav.some((x) => /Finance/.test(x))) throw new Error('Finance still in menu');
      if (nav.some((x) => /Password/.test(x))) throw new Error('Password in menu for manager');
    });
    await step('SOPs folded by default; unfold one; print one SOP on its own', async () => {
      if (await p.isVisible('.sop-check >> nth=0')) throw new Error('SOP not folded');
      await p.click('.sop-sum >> nth=0'); await p.waitForSelector('.sop-check >> nth=0', { state: 'visible' });
      const before = await p.evaluate(() => window.__printed || 0); await p.click('[data-print-one] >> nth=0'); await p.waitForTimeout(300);
      if ((await p.evaluate(() => window.__printed || 0)) !== before + 1) throw new Error('no print');
      if (!(await p.isVisible('.sop-check >> nth=0'))) throw new Error('print button folded the card');
      const html = await p.evaluate(() => document.getElementById('printArea').innerHTML);
      if ((html.match(/<h1/g) || []).length !== 1 || !/Signature/.test(html)) throw new Error('single SOP sheet'); });
    await step('tick a checklist item, progress updates', async () => {
      await p.click('.sop-check >> nth=0'); await p.waitForTimeout(200);
      if (!(await p.textContent('[data-progress]')).startsWith('1/')) throw new Error(await p.textContent('[data-progress]'));
      const n = await p.evaluate(() => window.__mockdb.sop_checks.length); if (n !== 1) throw new Error('not saved'); });
    await step('add SOP via popup, draft survives closing', async () => {
      await p.click('#add'); await p.fill('.modal [name=title]', 'Lunch prep'); await p.keyboard.press('Escape');
      await p.click('#add'); if ((await p.inputValue('.modal [name=title]')) !== 'Lunch prep') throw new Error('draft lost');
      await p.fill('.modal [name=category]', 'Lunch'); await p.fill('.modal [name=items]', 'Cut bread\nSet tables'); await p.click('.modal button[type=submit]');
      await p.waitForSelector('text=Lunch prep'); });
    await step('SOP editor: Dutch and English side by side, line mismatch blocked', async () => {
      await p.click('[data-edit] >> nth=0'); await p.waitForSelector('.modal [name=title_en]');
      if ((await p.inputValue('.modal [name=title]')) === '' ) throw new Error('nl title empty');
      await p.fill('.modal [name=items_en]', 'Only one line'); await p.waitForSelector('.modal .txt-red');
      await p.click('.modal button[type=submit]'); await p.waitForTimeout(200);
      if (!(await p.$('.modal'))) throw new Error('mismatch saved');
      await p.screenshot({ path: `${OUT}/02b-sop-editor.png` });
      await p.click('.modal #cancel'); });
    await step('no self sign-up on the login page', async () => {
      const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
      await p2.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
      await p2.goto(BASE); await p2.waitForSelector('#login-form');
      if (await p2.$('text=Create account')) throw new Error('sign-up still visible'); await ctx2.close(); });
    await step('menu with food and beverage', async () => { await p.goto(BASE + '#/menu'); await p.waitForSelector('.menu-card'); await p.screenshot({ path: `${OUT}/03-menu.png`, fullPage: true }); });
    await step('add menu item with photo', async () => {
      await p.click('#add'); await p.fill('.modal [name=name]', 'Apple pie'); await p.fill('.modal [name=price]', '4,50');
      await p.setInputFiles('.modal [name=photo]', { name: 'pie.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') });
      await p.click('.modal button[type=submit]'); await p.waitForSelector('text=Apple pie');
      const price = await p.evaluate(() => window.__mockdb.menu_items.find((m) => m.name === 'Apple pie').price); if (price !== 4.5) throw new Error(price); });
    await step('settings: menu order by number changes the Menu page', async () => {
      await p.goto(BASE + '#/settings/menuorder'); await p.waitForSelector('#save-order');
      const pie = await p.$eval('.order-row:has-text("Apple pie") input', (i) => i.dataset.oid);
      await p.fill(`[data-oid="${pie}"]`, '1'); await p.fill('.order-row:has-text("Sourdough") input', '2'); await p.click('#save-order');
      await p.waitForTimeout(600); await p.goto(BASE + '#/menu'); await p.waitForSelector('.menu-card');
      const first = await p.$eval('.menu-grid .menu-card h3', (h) => h.textContent);
      if (first !== 'Apple pie') throw new Error('first dish is ' + first);
      await p.goto(BASE + '#/settings/menuorder'); await p.waitForSelector('#save-order');
      await p.fill('.order-row:has-text("Sourdough") input', '1'); await p.fill(`[data-oid="${pie}"]`, '2'); await p.click('#save-order'); await p.waitForTimeout(600);
      await p.goto(BASE + '#/menu'); await p.waitForSelector('.menu-card'); });
    await step('allergens: set on an item, shown as chips, allergen card prints', async () => {
      await p.click('.menu-card:has-text("Sourdough") [data-edit]'); await p.check('.modal input[name=al][value=gluten]'); await p.check('.modal input[name=al][value=milk]');
      await p.click('.modal button[type=submit]'); await p.waitForSelector('#dish-expand');
      if (await p.isVisible('.tag.allergen')) throw new Error('dishes should be folded');
      await p.click('#dish-expand'); await p.waitForSelector('.tag.allergen');
      const al = await p.evaluate(() => window.__mockdb.menu_items.find((m) => m.name === 'Sourdough').allergens); if (JSON.stringify(al) !== '["gluten","milk"]') throw new Error(JSON.stringify(al));
      const before = await p.evaluate(() => window.__printed || 0); await p.click('#allergen-card'); await p.waitForTimeout(200);
      if ((await p.evaluate(() => window.__printed || 0)) !== before + 1) throw new Error('no print'); });
    await step('links page', async () => { await p.goto(BASE + '#/links'); await p.waitForSelector('.link-row'); });
    await step('roster week grid with chips and fixed shifts', async () => {
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster'); await p.waitForSelector('.tpl-chip');
      if (!(await p.$('th.closed'))) throw new Error('no closed day'); if (!(await p.$('text=Wintertuin Verteld'))) throw new Error('no note');
      await p.screenshot({ path: `${OUT}/04-roster.png`, fullPage: true }); });
    await step('roster: close and reopen a day with one click', async () => {
      const b = await p.$('.day-toggle.is-open'); const ds = await b.getAttribute('data-day');
      await b.click(); await p.waitForSelector(`.day-toggle.is-closed[data-day="${ds}"]`);
      const o = await p.evaluate((d) => window.__mockdb.day_overrides[d], ds); if (!o || o.is_open !== false) throw new Error(JSON.stringify(o));
      await p.click(`.day-toggle[data-day="${ds}"]`); await p.waitForSelector(`.day-toggle.is-open[data-day="${ds}"]`); });
    await step('roster: add a note to a day', async () => {
      const b = await p.$('[data-dnote]'); const ds = await b.getAttribute('data-dnote');
      await b.click(); await p.fill('.modal [name=v]', 'Private party'); await p.click('.modal button[type=submit]');
      await p.waitForSelector('text=Private party');
      const o = await p.evaluate((d) => window.__mockdb.day_overrides[d], ds); if (!o || o.note !== 'Private party') throw new Error(JSON.stringify(o)); });
    await step('roster: drag a person to another row, order is saved', async () => {
      const names = () => p.$$eval('tr[data-row] strong', (s) => s.map((x) => x.textContent));
      const before = await names();
      await p.dragAndDrop('tr[data-row]:last-child .row-handle', 'tr[data-row]:first-child td:first-child');
      await p.waitForTimeout(400);
      const after = await names(); if (after[0] !== before[before.length - 1]) throw new Error(after.join(','));
      const saved = await p.evaluate(() => window.__mockdb.profiles.filter((x) => x.sort_order).length); if (!saved) throw new Error('order not saved');
      await p.screenshot({ path: `${OUT}/04b-roster-order.png`, fullPage: true }); });
    await step('plan a shift with the time bar', async () => {
      await p.click('[data-add] >> nth=0'); await p.waitForSelector('#day-grid');
      const box = await (await p.$('.grid-slot[data-min="600"]')).boundingBox();
      const box2 = await (await p.$('.grid-slot[data-min="690"]')).boundingBox();
      await p.mouse.move(box.x + 30, box.y + 5); await p.mouse.down(); await p.mouse.move(box2.x + 30, box2.y + 5, { steps: 5 }); await p.mouse.up();
      if ((await p.inputValue('.modal [name=start]')) !== '10:00' || (await p.inputValue('.modal [name=end]')) !== '12:00') throw new Error(await p.inputValue('.modal [name=start]') + '-' + await p.inputValue('.modal [name=end]'));
      await p.screenshot({ path: `${OUT}/05-shift.png` });
      await p.click('.modal button[type=submit]'); await p.waitForTimeout(300);
      const ok = await p.evaluate(() => window.__mockdb.shifts.some((s) => s.start_time === '10:00' && s.end_time === '12:00')); if (!ok) throw new Error('not saved'); });
    await step('drag fixed shift onto a day', async () => {
      const before = await p.evaluate(() => window.__mockdb.shifts.length);
      await p.dragAndDrop('.tpl-chip', '[data-cell] >> nth=3'); await p.waitForTimeout(400);
      const after = await p.evaluate(() => window.__mockdb.shifts.length); if (after !== before + 1) throw new Error(`${before}->${after}`); });
    await step('print who works today', async () => { await p.click('#print-today'); await p.waitForTimeout(200); if (!(await p.evaluate(() => window.__printed))) throw new Error('no print'); });
    await step('calendar export downloads .ics', async () => {
      await p.click('details.export-menu summary');
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-ics="my-week"]')]);
      if (!dl.suggestedFilename().endsWith('.ics')) throw new Error(dl.suggestedFilename()); });
    await step('clock in and out', async () => {
      await p.goto(BASE + '#/checkin'); await p.click('#toggle'); await p.waitForSelector('.btn-stop'); await p.click('#toggle'); await p.waitForSelector('#toggle.btn-primary');
      const n = await p.evaluate(() => window.__mockdb.checkins.filter((c) => c.check_out_at).length); if (n !== 1) throw new Error(n); });
    await step('swap: take over an open request, then approve', async () => {
      await p.goto(BASE + '#/swap'); await p.waitForSelector('[data-claim]'); await p.click('[data-claim]'); await p.waitForSelector('[data-decide]');
      await p.screenshot({ path: `${OUT}/06-swap.png`, fullPage: true });
      await p.click('[data-decide$="approved"]'); await p.waitForTimeout(300);
      const st = await p.evaluate(() => window.__mockdb.shift_swap_requests[0].status); if (st !== 'approved') throw new Error(st); });
    await step('settings: my password', async () => {
      await p.goto(BASE + '#/settings/password'); await p.waitForSelector('#pw');
      await p.fill('#pw [name=pw]', 'abcdefgh1'); await p.fill('#pw [name=pw2]', 'abcdefgh1'); await p.click('#pw button[type=submit]');
      await p.waitForSelector('text=/saved/i'); });
    await step('settings: system check shows checks, gaps, changes; run now adds a green check', async () => {
      await p.goto(BASE + '#/settings/system'); await p.waitForSelector('.sc-list');
      const txt = await p.textContent('#sec'); if (!/Works, but worth a look/.test(txt) || !/Daily closing missing/.test(txt) || !/Wedding Jansen/.test(txt)) throw new Error(txt.slice(0, 300));
      await p.screenshot({ path: `${OUT}/19-system-check.png`, fullPage: true });
      await p.click('#sc-run'); await p.waitForSelector('text=Everything works'); });
    for (const sec of ['team', 'templates', 'links', 'backup']) await step(`settings: ${sec}`, async () => { await p.goto(BASE + '#/settings/' + sec); await p.waitForSelector('#sec .card'); });
    await step('settings: create account shows login details', async () => {
      await p.goto(BASE + '#/settings/team'); await p.waitForSelector('#add'); await p.click('#add');
      await p.fill('.modal [name=full_name]', 'New Person'); await p.fill('.modal [name=email]', 'new@example.test'); await p.click('.modal button[type=submit]');
      await p.waitForSelector('.pw-card code'); await p.screenshot({ path: `${OUT}/07-settings.png` }); await p.keyboard.press('Escape'); });
    await step('settings: add fixed shift', async () => {
      await p.goto(BASE + '#/settings/templates'); await p.click('#add'); await p.fill('.modal [name=name]', 'Evening'); await p.fill('.modal [name=start_time]', '17:00'); await p.fill('.modal [name=end_time]', '23:00');
      await p.click('.modal button[type=submit]'); await p.waitForSelector('text=Evening'); });
    await step('backup download', async () => { await p.goto(BASE + '#/settings/backup'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dl')]); if (!dl.suggestedFilename().endsWith('.json')) throw new Error('no json'); });
    await step('employee view: manager sees the staff screens, then goes back', async () => {
      await p.goto(BASE + '#/settings'); await p.waitForSelector('#emp-on'); await p.click('#emp-on');
      await p.waitForSelector('#emp-bar'); await p.waitForTimeout(300);
      const links = await p.$$eval('#nav a', (as) => as.map((a) => a.getAttribute('href')));
      if (links.includes('#/settings')) throw new Error('settings still in menu');
      if (!links.includes('#/password')) throw new Error('no staff password link');
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster'); if (await p.$('.day-toggle')) throw new Error('manager tools visible');
      await p.screenshot({ path: `${OUT}/14-employee-view.png`, fullPage: true });
      await p.click('#emp-off'); await p.waitForSelector('#emp-on');
      if (await p.$('#emp-bar')) throw new Error('banner stayed'); });
    await step('events: create a BEO with menu from dishes, dietary and timeline', async () => {
      await p.goto(BASE + '#/events'); await p.waitForSelector('text=No upcoming events');
      await p.click('a:has-text("New event")'); await p.waitForSelector('#ev-form');
      await p.fill('[name=title]', 'Wedding Jansen'); await p.fill('[name=event_type]', 'Wedding');
      const d = new Date(); d.setDate(d.getDate() + 1); const ds = d.toLocaleDateString('sv-SE');
      await p.fill('[name=event_date]', ds); await p.fill('[name=start_time]', '17:00');
      await p.fill('[name=client_name]', 'Eva Jansen'); await p.fill('[name=guests_expected]', '60'); await p.fill('[name=staff_needed]', '5');
      await p.click('[data-addrow=dietary]'); await p.fill('#rows-dietary [name=di_count]', '3'); await p.fill('#rows-dietary [name=di_type]', 'Vegetarian');
      await p.click('[data-addrow=timeline]'); await p.fill('#rows-timeline [name=tl_time]', '17:00'); await p.fill('#rows-timeline [name=tl_what]', 'Guests arrive, welcome drink');
      await p.click('[data-addrow=menu]'); await p.fill('#rows-menu [name=mn_course]', 'Starter');
      await p.selectOption('#rows-menu [name=mn_item]', { label: 'Sourdough' }); await p.waitForSelector('#rows-menu .tag.allergen');
      await p.fill('[name=price_per_person]', '85'); await p.fill('[name=notes_kitchen]', 'Bread warm from the oven');
      await p.screenshot({ path: `${OUT}/15-event-form.png`, fullPage: true });
      await p.click('#ev-form button[type=submit]'); await p.waitForSelector('h1:has-text("Wedding Jansen")');
      const ev = await p.evaluate(() => window.__mockdb.events[0]);
      if (ev.menu[0].course !== 'course_starter' || ev.menu[0].allergens[0] !== 'gluten') throw new Error(JSON.stringify(ev.menu));
      if (ev.dietary[0].type !== 'diet_vegetarian' || ev.dietary[0].count !== 3) throw new Error(JSON.stringify(ev.dietary));
      if (ev.guests_expected !== 60 || ev.price_per_person !== 85) throw new Error('numbers');
      if (!/€5,100/.test(await p.textContent('.ev-kpis'))) throw new Error('expected revenue');
      await p.screenshot({ path: `${OUT}/16-event-view.png`, fullPage: true }); });
    await step('events: change makes a new version with history', async () => {
      await p.click('a:has-text("Edit")'); await p.waitForSelector('#ev-form');
      await p.fill('[name=guests_expected]', '72'); await p.selectOption('[name=status]', 'confirmed');
      await p.click('#ev-form button[type=submit]'); await p.waitForSelector('text=v2');
      await p.click('a:has-text("Change history")'); await p.waitForSelector('.ev-changes');
      const txt = await p.textContent('.ev-hist'); if (!/60/.test(txt) || !/72/.test(txt) || !/Confirmed/.test(txt)) throw new Error(txt);
      await p.screenshot({ path: `${OUT}/17-event-history.png`, fullPage: true }); });
    await step('events: client PDF in Dutch, kitchen sheet with allergens', async () => {
      const id = await p.evaluate(() => window.__mockdb.events[0].id);
      await p.goto(BASE + '#/events/' + id); await p.waitForSelector('summary:has-text("Print")');
      await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById('printArea').innerHTML; }; });
      await p.click('summary:has-text("Print")'); await p.click('[data-print=client-nl]'); await p.waitForTimeout(400);
      let html = await p.evaluate(() => window.__printed);
      if (!/Bevestiging evenement/.test(html) || !/Voorgerecht/.test(html) || !/Handtekening/.test(html)) throw new Error('client NL');
      if (/Bread warm/.test(html)) throw new Error('kitchen note on client PDF');
      await p.click('summary:has-text("Print")'); await p.click('[data-print=kitchen]'); await p.waitForTimeout(400);
      html = await p.evaluate(() => window.__printed);
      if (!/Gluten/i.test(html) || !/Bread warm/.test(html) || !/Vegetarian/.test(html)) throw new Error('kitchen sheet'); });
    await step('events: list shows the event, confirmed', async () => {
      await p.goto(BASE + '#/events'); await p.waitForSelector('.ev-row'); if (!(await p.$('.tag.ev-confirmed'))) throw new Error('status');
      await p.screenshot({ path: `${OUT}/18-events.png`, fullPage: true }); });
    await step('events: calendar view shows the event, starts a new event on a day; roster shows it too', async () => {
      const d = new Date(); d.setDate(d.getDate() + 1); const ds = d.toLocaleDateString('sv-SE');
      await p.goto(BASE + '#/events/cal/' + ds.slice(0, 7)); await p.waitForSelector('.ev-cal');
      const href = await p.getAttribute('.ev-chip.ev-confirmed', 'href'); if (!/#\/events\/[\w-]+$/.test(href)) throw new Error('chip ' + href);
      await p.click('.ev-chip.ev-confirmed'); await p.waitForSelector('summary:has-text("Print")');
      // the BEO keeps its own two-column layout (the calendar grid must not leak into it)
      const cols = await p.$eval('.ev-grid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
      if (cols !== 2) throw new Error('BEO layout has ' + cols + ' columns');
      await p.goto(BASE + '#/events'); await p.waitForSelector('.ev-cal'); // the chosen view is remembered
      await p.goto(BASE + '#/events/new/2026-12-24'); await p.waitForSelector('#ev-form');
      if ((await p.inputValue('[name=event_date]')) !== '2026-12-24') throw new Error('date not prefilled');
      await p.goto(BASE + '#/roster'); await p.waitForSelector('.roster-bar');
      if (!(await p.$('table.roster .ro-ev'))) { await p.click('#next'); await p.waitForSelector('.roster-bar'); }
      if (!(await p.$('table.roster .ro-ev.ev-confirmed'))) throw new Error('no event label in the roster');
      await p.goto(BASE + '#/events/list'); await p.waitForSelector('.ev-bar'); });
    await step('menu: manager adds named menu PDFs, renames and deletes; buttons follow', async () => {
      await p.goto(BASE + '#/menu'); await p.waitForSelector('#pdf-manage'); if (await p.$('[data-pdf-view]')) throw new Error('PDF button without a PDF');
      const pdf = { name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') };
      await p.click('#pdf-manage'); await p.waitForSelector('#pdf-add');
      if ((await p.inputValue('#pdf-add [name=label]')) !== 'See the whole menu') throw new Error('default name');
      await p.setInputFiles('#pdf-add [name=file]', pdf); await p.click('#pdf-add button[type=submit]');
      await p.waitForSelector('.pdf-row[data-id]');
      await p.fill('#pdf-add [name=label]', 'Lunch menu'); await p.setInputFiles('#pdf-add [name=file]', pdf); await p.click('#pdf-add button[type=submit]');
      await p.waitForFunction(() => document.querySelectorAll('.pdf-row[data-id]').length === 2);
      const first = '.pdf-row[data-id] >> nth=0';
      await p.fill(`${first} >> [name=label]`, 'BQT menu'); await p.press(`${first} >> [name=label]`, 'Tab'); await p.waitForSelector('a[data-pdf-view]:has-text("BQT menu")');
      await p.click('[data-close]');
      const labels = await p.$$eval('a[data-pdf-view]', (as) => as.map((a) => a.textContent.trim()));
      if (labels.length !== 2 || !/BQT menu/.test(labels[0]) || !/Lunch menu/.test(labels[1])) throw new Error('buttons ' + labels);
      if ((await p.$$('a[data-pdf-dl]')).length !== 2) throw new Error('download buttons');
      await p.click('#pdf-manage'); await p.click('.pdf-row[data-id] >> nth=1 >> [data-del]'); await p.click('#cf-ok');
      await p.waitForFunction(() => document.querySelectorAll('a[data-pdf-view]').length === 1); await p.keyboard.press('Escape'); });
    await step('menu: a PDF shipped with the app opens and downloads from the site', async () => {
      await p.evaluate(() => window.__mockdb.menu_pdfs.push({ id: 'demo-pdf', label: 'Lunch menu (DEMO)', path: 'site:demo/wintertuin-lunchkaart-demo.pdf', sort_order: 1, created_at: '2026-10-14T20:00:00Z', updated_at: '2026-10-14T20:00:00Z' }));
      await p.goto(BASE + '#/links'); await p.goto(BASE + '#/menu'); await p.waitForSelector('a[data-pdf-view="demo-pdf"]');
      const href = await p.getAttribute('a[data-pdf-view="demo-pdf"]', 'href'); if (!/\/demo\/wintertuin-lunchkaart-demo\.pdf$/.test(href)) throw new Error(href);
      if (!(await p.getAttribute('a[data-pdf-dl="demo-pdf"]', 'download'))) throw new Error('no download name');
      const r = await p.request.get(href); if (r.status() !== 200 || !/pdf/.test(r.headers()['content-type'] || '')) throw new Error('demo file not served');
      await p.evaluate(() => { const d = window.__mockdb; d.menu_pdfs = d.menu_pdfs.filter((x) => x.id !== 'demo-pdf'); }); });
    await step('events: print a blank BEO', async () => {
      await p.goto(BASE + '#/events'); await p.click('summary:has-text("Blank BEO")');
      const before = await p.evaluate(() => window.__printed || 0); await p.click('[data-blank=en]');
      await p.waitForFunction((b) => (window.__printed || 0) > b, before);
      await p.waitForTimeout(2000); // Safari keeps scripts running while its print window is open
      if (!/Event request/.test(await p.textContent('#printArea'))) throw new Error('print sheet cleared while printing'); });
    await step('HACCP: own menu item, 10 lists, temperature deviation needs a corrective action', async () => {
      const nav = await p.$$eval('#nav a', (as) => as.map((a) => a.getAttribute('href'))); if (!nav.includes('#/haccp')) throw new Error('no HACCP in menu');
      await p.goto(BASE + '#/haccp'); await p.waitForSelector('.hc-tile'); if ((await p.$$('.hc-tile')).length !== 10) throw new Error('tiles');
      await p.click('a[href="#/haccp/temperatures"]'); await p.waitForSelector('#hc-f');
      await p.fill('[name=eq_cool1]', '9'); await p.fill('[name=eq_frz1]', '-20');
      for (const k of ['fifo', 'covered', 'cleaned']) await p.click(`[name=${k}][value=yes] + span`);
      await p.waitForSelector('.hc-dev:not([hidden])'); await p.click('#hc-f button[type=submit]'); await p.waitForTimeout(300);
      if ((await p.evaluate(() => window.__mockdb.haccp_entries.length)) !== 0) throw new Error('saved without corrective action');
      await p.fill('[name=__action]', 'Door was open; closed and measured again'); await p.click('#hc-f button[type=submit]'); await p.waitForSelector('.hc-days .hc-bad');
      const e = await p.evaluate(() => window.__mockdb.haccp_entries[0]); if (e.ok !== false || !e.action) throw new Error('entry'); });
    await step('HACCP: receiving check (frozen −16 passes, dry goods hide temperature), buffet over 2 hours flagged', async () => {
      await p.goto(BASE + '#/haccp/receiving'); await p.waitForSelector('#hc-f');
      await p.fill('[name=supplier]', 'Bidfood'); await p.fill('[name=product]', 'Fries'); await p.selectOption('[name=kind]', 'D'); await p.fill('[name=temp]', '-16');
      await p.click('[name=tht][value=yes] + span'); await p.click('[name=pack][value=yes] + span');
      if (await p.isVisible('.hc-dev')) throw new Error('-16 flagged'); await p.click('#hc-f button[type=submit]'); await p.waitForSelector('table.hc-t tbody tr');
      await p.selectOption('[name=kind]', 'C'); if (await p.isVisible('[data-field=temp]')) throw new Error('temp for dry goods');
      await p.goto(BASE + '#/haccp/buffet'); await p.waitForSelector('#hc-f'); await p.fill('[name=product]', 'Salad'); await p.fill('[name=start]', '10:00');
      await p.click('[name=cold][value=yes] + span'); await p.click('[name=guard][value=yes] + span'); await p.click('#hc-f button[type=submit]'); await p.waitForSelector('.hc-open');
      await p.click('.hc-log summary'); await p.click('[data-close-buffet]'); await p.fill('#hc-end [name=end]', '12:30'); await p.click('#hc-end button[type=submit]');
      await p.waitForSelector('tr.hc-rowbad'); });
    await step('HACCP: archive in Settings, edit fridges, print the whole week with labels', async () => {
      await p.goto(BASE + '#/settings/haccp'); await p.waitForSelector('#arch-body table');
      await p.click('#ed-equipment [data-add]'); await p.fill('#ed-equipment input[data-k=name] >> nth=-1', 'Bar fridge'); await p.click('#ed-equipment [data-save]'); await p.waitForTimeout(400);
      if ((await p.evaluate(() => window.__mockdb.haccp_config.find((x) => x.key === 'equipment').value.length)) !== 3) throw new Error('fridge not saved');
      await p.waitForSelector('#arch-body table'); const before = await p.evaluate(() => window.__printed || 0); await p.click('#arch-print');
      await p.waitForFunction((b) => (window.__printed || 0) > b, before, { timeout: 5000 });
      const html = await p.evaluate(() => document.getElementById('printArea').innerHTML);
      if ((html.match(/class="hcp"/g) || []).length !== 10 || !/Week \d+/.test(html) || !/Bar fridge/.test(html) || !/Checked by/.test(html)) throw new Error('print sheet'); });
    await step('HACCP: switching lists off removes them from overview, archive and print', async () => {
      await p.goto(BASE + '#/settings/haccp'); await p.waitForSelector('#save-lists');
      await p.uncheck('[data-list-on=sousvide]'); await p.click('#save-lists'); await p.waitForTimeout(500);
      await p.goto(BASE + '#/haccp'); await p.waitForSelector('.hc-tile');
      if (await p.$('a[href="#/haccp/sousvide"]')) throw new Error('switched-off list still shown');
      await p.goto(BASE + '#/settings/haccp'); await p.waitForSelector('#save-lists');
      await p.check('[data-list-on=sousvide]'); await p.click('#save-lists'); await p.waitForTimeout(500); });
    await step('settings: top menu order by number and arrows, applied to the menu', async () => {
      await p.goto(BASE + '#/settings/navorder'); await p.waitForSelector('#save-nav');
      await p.fill('[data-nav=haccp]', '1'); await p.click('#save-nav'); await p.waitForTimeout(400);
      let first = await p.$eval('#nav a', (a) => a.getAttribute('href')); if (first !== '#/haccp') throw new Error('first is ' + first);
      await p.goto(BASE + '#/home'); await p.waitForSelector('.about-app'); if (!/#\/about$/.test(p.url())) throw new Error('start page is ' + p.url());
      await p.goto(BASE + '#/settings/navorder'); await p.waitForSelector('#save-nav');
      await p.click('[data-ndown="0"]'); await p.click('#save-nav'); await p.waitForTimeout(400);
      first = await p.$eval('#nav a', (a) => a.getAttribute('href')); if (first === '#/haccp') throw new Error('arrow did not move it');
      await p.click('#reset-nav'); await p.click('#save-nav'); await p.waitForTimeout(400);
      if ((await p.$eval('#nav a:not([href="#/about"])', (a) => a.getAttribute('href'))) !== '#/sops') throw new Error('reset'); });
    await step('switch to Dutch, saved in profile', async () => {
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster'); await p.click('#lang-toggle [data-lang=nl]'); await p.waitForSelector('text=Rooster');
      const l = await p.evaluate(() => window.__mockdb.profiles[0].language); if (l !== 'nl') throw new Error(l);
      await p.screenshot({ path: `${OUT}/08-roster-nl.png`, fullPage: true }); });
    await step('About in the app: first in the menu, team edit, direct links', async () => {
      await p.goto(BASE + '#/menu'); await p.waitForSelector('#nav', { state: 'attached' });
      const first = await p.$eval('#nav a', (a) => a.getAttribute('href')); if (first !== '#/about') throw new Error('first nav item ' + first);
      await p.click('#nav a[href="#/about"]'); await p.waitForSelector('.about-app .ab-person');
      if ((await p.$$('.ab-person')).length !== 4) throw new Error('team cards');
      const hrefs = await p.$$eval('.ab-link', (as) => as.map((a) => a.getAttribute('href')));
      if (!hrefs.includes('Wintertuin-Intro.html') || !hrefs.includes('Wintertuin-Cantonspark-Geschiedenis.html')) throw new Error('links ' + hrefs);
      if (!(await p.$('.ab-gi[href="#/haccp"]'))) throw new Error('app guide missing');
      await p.click('#ab-edit'); await p.click('#ab-add');
      await p.click('.ab-person:last-child [data-f="name"]'); await p.keyboard.press('Control+A'); await p.keyboard.type('Testpersoon');
      await p.click('.ab-person:first-child [data-rm]');
      if (!(await p.$('.ab-person:first-child .ab-photo-edit .ab-ph'))) throw new Error('no photo placeholder');
      await p.click('[data-down="team"]');
      await p.click('.ab-person:nth-child(2) [data-left]');
      if (await p.$eval('.ab-person:first-child [data-f="name"]', (e) => e.textContent) !== 'Kees') throw new Error('tile did not move left');
      await p.click('.ab-pillar:first-child [data-right]');
      if (await p.$eval('.ab-pillar:nth-child(2)', (e) => e.dataset.pi) !== '1') throw new Error('concept tile did not move');
      if ((await p.$$eval('#ab-secs > .ab-sec', (x) => x.map((e) => e.dataset.sec))).join() !== 'concept,app,team,more') throw new Error('move failed');
      await p.click('#ab-save'); await p.waitForSelector('#ab-edit');
      const row = await p.evaluate(() => window.__mockdb.about_content.find((r) => r.key === 'people'));
      const ppl = JSON.parse(row.html); if (ppl.length !== 4 || ppl[3].name !== 'Testpersoon' || ppl[0].name !== 'Kees') throw new Error(row.html);
      await p.screenshot({ path: `${OUT}/10a-about-app.png`, fullPage: true });
      await p.goto(BASE + '#/sops'); await p.goto(BASE + '#/about'); await p.waitForSelector('.ab-person');
      if (!/Testpersoon/.test(await p.textContent('#ab-people'))) throw new Error('team not reloaded');
      if ((await p.$$eval('#ab-secs > .ab-sec', (x) => x.map((e) => e.dataset.sec))).join() !== 'concept,app,team,more') throw new Error('order not kept');
      if (await p.$eval('.ab-pillar:first-child', (e) => e.dataset.pi) !== '2') throw new Error('concept order not kept');
      await p.goto(BASE + '#/settings/navorder'); await p.waitForSelector('[data-nav=about]'); });
    await step('About page: manager edits and saves text', async () => {
      await p.goto(BASE + 'Wintertuin-Intro.html'); await p.waitForSelector('#ab-edit'); await p.click('#ab-edit');
      await p.click('h1[data-edit]'); await p.keyboard.press('End'); await p.keyboard.type(' Baarn');
      await p.click('#ab-save'); await p.waitForTimeout(300);
      const row = await p.evaluate(() => window.__mockdb.about_content.find((r) => r.page === 'intro'));
      if (!row || !/Wintertuin Baarn/.test(row.html)) throw new Error(JSON.stringify(row));
      await p.screenshot({ path: `${OUT}/10-about.png` });
      await p.goto(BASE + 'Wintertuin-Cantonspark-Geschiedenis.html'); await p.waitForSelector('#ab-edit');
      if (!/Seeded history title/.test(await p.textContent('h1'))) throw new Error('saved text not loaded');
      if (await p.evaluate(() => window.__xss)) throw new Error('script ran'); });
    await A.ctx.close();
    if (A.errors.length) { failed = true; console.log('ERRORS (manager):', A.errors); }

    const B = await session(browser, 'staff', { width: 390, height: 844 });
    const q = B.page;
    await login(q);
    await step('staff: no Settings, no plan buttons, phone layout', async () => {
      const links = await q.$$eval('#nav a', (as) => as.map((a) => a.getAttribute('href')));
      if (links.includes('#/settings')) throw new Error('settings visible');
      if (!links.includes('#/password')) throw new Error('staff lost password link');
      if (!(await q.isVisible('#app-switch'))) throw new Error('switch hidden on phone');
      await q.goto(BASE + '#/menu'); await q.waitForSelector('#allergen-card'); if (await q.$('#pdf-manage')) throw new Error('staff can manage menu PDFs');
      await q.goto(BASE + '#/haccp/temperatures'); await q.waitForSelector('#hc-f'); if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('HACCP form scrolls sideways');
      await q.goto(BASE + '#/roster'); await q.waitForSelector('.roster-m .day-tab');
      if (await q.isVisible('table.roster')) throw new Error('wide table still shown on phone');
      if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('roster scrolls sideways on phone');
      if (await q.$('.day-toggle, .row-handle, .row-move')) throw new Error('staff can change days or order');
      await q.click('.day-tab:not(.on)'); await q.waitForSelector('.day-tab.on');
      await q.screenshot({ path: `${OUT}/09b-roster-phone.png`, fullPage: true });
      await q.goto(BASE + '#/settings'); await q.waitForSelector('.about-app');
      await q.goto(BASE + '#/roster'); await q.waitForSelector('.roster-m .day-tab'); if (await q.$('[data-add]')) throw new Error('plan button for staff');
      await q.goto(BASE + '#/sops'); await q.waitForSelector('.sop-card'); await q.screenshot({ path: `${OUT}/09-staff-phone.png`, fullPage: true }); });
    await step('staff: offer own shift for swap', async () => {
      await q.goto(BASE + '#/swap'); await q.waitForSelector('[data-offer]'); await q.click('[data-offer]'); await q.fill('.modal [name=v]', 'Wedding'); await q.click('.modal button[type=submit]');
      await q.waitForSelector('.tag.open'); });
    await step('staff: can open events and make one, no delete', async () => {
      await q.goto(BASE + '#/events/new'); await q.waitForSelector('#ev-form'); await q.fill('[name=title]', 'Birthday Sam');
      await q.click('#ev-form button[type=submit]'); await q.waitForSelector('h1:has-text("Birthday Sam")');
      if (await q.$('#del')) throw new Error('delete for staff'); });
    await step('staff: About in the app, no edit, fits the phone', async () => {
      await q.goto(BASE + '#/about'); await q.waitForSelector('.ab-person'); if (await q.$('#ab-edit')) throw new Error('edit for staff');
      if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('about scrolls sideways');
      await q.screenshot({ path: `${OUT}/10b-about-phone.png`, fullPage: true }); });
    await step('staff: About page has no Edit button', async () => { await q.goto(BASE + 'Wintertuin-Intro.html'); await q.waitForTimeout(800); if (await q.$('#ab-edit')) throw new Error('edit for staff'); });
    await B.ctx.close();
    if (B.errors.length) { failed = true; console.log('ERRORS (staff):', B.errors); }
  } catch (e) { failed = true; console.log('\nFAILED:', e.message); }
  await browser.close();
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
