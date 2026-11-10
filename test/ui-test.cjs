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
  await page.addInitScript((r) => { window.__MOCK_ROLE = r; window.__MENU_OPEN_ALL = true; try { window.__NO_PINLOCK = !localStorage.getItem('test_pin'); } catch (e) { window.__NO_PINLOCK = true; } window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.__printHook = () => window.print(); }, role);
  // outside images (example photos, fonts in the newsletter) are not reachable in the test: a 1-pixel stand-in
  await page.route(/images\.pexels\.com|fonts\.googleapis\.com|joost1305\.github\.io/, (r) => r.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }));
  await page.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  return { ctx, page, errors };
}
const step = async (name, fn) => { process.stdout.write(`- ${name} ... `); await fn(); console.log('ok'); };
const login = async (p) => { await p.goto(BASE); await p.waitForSelector('#login-form'); await p.fill('[name=email]', 'a@b.c'); await p.fill('[name=password]', 'test'); await p.click('button[type=submit]'); await p.waitForSelector('.home-hero'); await p.goto(BASE + '#/sops'); await p.waitForSelector('.sop-card'); };

(async () => {
  const browser = await chromium.launch({executablePath:process.env.PW_EXE});
  let failed = false;
  try {
    const A = await session(browser, 'manager', { width: 1280, height: 900 });
    const p = A.page;
    await step('login page in English', async () => { await p.goto(BASE); await p.waitForSelector('#login-form'); if (!/Sign in/.test(await p.textContent('h1'))) throw new Error('not English'); await p.screenshot({ path: `${OUT}/01-login.png` }); });
    await step('login lands on Today', async () => { await login(p); await p.screenshot({ path: `${OUT}/02-sops.png`, fullPage: true }); });
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
      await p.click('#add'); await p.fill('.modal [name=name]', 'Apple pie'); await p.fill('.modal [name=category]', 'bakery'); await p.fill('.modal [name=price]', '4,50');
      await p.setInputFiles('.modal #dp-pick', { name: 'pie.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') });
      await p.click('.modal button[type=submit]'); await p.waitForSelector('text=Apple pie');
      const pie = await p.evaluate(() => window.__mockdb.menu_items.find((m) => m.name === 'Apple pie')); if (pie.price !== 4.5) throw new Error(pie.price);
      if (!pie.photo_url) throw new Error('photo not saved'); });
    await step('dish editor: search a free photo and pick it', async () => {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
      await p.route(/api\.openverse\.org/, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ results: [{ id: 'a', title: 'Soup', url: 'https://img.example.org/soup.png', thumbnail: 'https://img.example.org/soup-t.png' }] }) }));
      await p.route(/img\.example\.org/, (r) => r.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png }));
      await p.click('#add'); await p.fill('.modal [name=name]', 'Lentil soup'); await p.click('.modal #dp-find');
      await p.waitForSelector('.modal .dp-hit');
      const g = await p.getAttribute('.modal #dp-google', 'href'); if (!/tbm=isch&q=Lentil%20soup/.test(g)) throw new Error(g);
      await p.click('.modal .dp-hit'); await p.waitForSelector('.modal #dp-prev img');
      await p.click('.modal button[type=submit]'); await p.waitForSelector('text=Lentil soup');
      const s = await p.evaluate(() => window.__mockdb.menu_items.find((m) => m.name === 'Lentil soup'));
      if (!s.photo_url) throw new Error('photo not saved'); });
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
      if (await p.$('#allergen-card')) throw new Error('old allergen card button still there'); });
    await step('links page', async () => { await p.goto(BASE + '#/links'); await p.waitForSelector('.link-row'); });
    await step('roster week grid with chips and fixed shifts', async () => {
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster'); await p.waitForSelector('.tpl-chip');
      if (!(await p.$('th.closed'))) throw new Error('no closed day'); if (!(await p.$('text=Wintertuin Verteld'))) throw new Error('no note');
      await p.screenshot({ path: `${OUT}/04-roster.png`, fullPage: true }); });
    await step('roster: day, week and month overview; a day in the month opens that day', async () => {
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster');
      await p.click('[data-view=month]'); await p.waitForSelector('.ro-mo-day');
      const n = await p.$$eval('.ro-mo-day:not(.out)', (x) => x.length); if (n < 28 || n > 31) throw new Error('month days ' + n);
      if (!(await p.$('.ro-mo-s'))) { await p.click('#prev'); await p.waitForSelector('.ro-mo-day'); }
      await p.screenshot({ path: `${OUT}/04c-roster-month.png`, fullPage: true });
      const dayWith = await p.$eval('.ro-mo-day:has(.ro-mo-s)', (b) => b.dataset.openDay);
      await p.click(`[data-open-day="${dayWith}"]`); await p.waitForSelector('.ro-day .ro-tl-row');
      if (!(await p.$(`.day-tab.on[data-mday="${dayWith}"]`))) throw new Error('wrong day opened');
      await p.screenshot({ path: `${OUT}/04d-roster-day.png`, fullPage: true });
      await p.click('#next'); await p.waitForSelector('.ro-day'); const nd = await p.$eval('.day-tab.on', (b) => b.dataset.mday); if (nd <= dayWith) throw new Error('next day did not move');
      await p.click('[data-view=week]'); await p.waitForSelector('table.roster');
      if (!(await p.$(`th`))) throw new Error('no week'); });
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
    for (const sec of ['team', 'templates', 'links', 'system']) await step(`settings: ${sec}`, async () => { await p.goto(BASE + '#/settings/' + sec); await p.waitForSelector('#sec .card'); });
    await step('settings: create account shows login details', async () => {
      await p.goto(BASE + '#/settings/team'); await p.waitForSelector('#add'); await p.click('#add');
      await p.fill('.modal [name=full_name]', 'New Person'); await p.fill('.modal [name=email]', 'new@example.test'); await p.click('.modal button[type=submit]');
      await p.waitForSelector('.pw-card code'); await p.screenshot({ path: `${OUT}/07-settings.png` }); await p.keyboard.press('Escape'); });
    await step('settings: delete an account (no history: gone; with history: closed and out of the list)', async () => {
      await p.goto(BASE + '#/settings/team'); await p.waitForSelector('text=New Person');
      const id = await p.evaluate(() => window.__mockdb.profiles.find((x) => x.email === 'new@example.test').id);
      await p.click(`[data-edit="${id}"]`); await p.click('.modal #acc-del'); await p.click('#cf-ok');
      await p.waitForFunction((i) => !document.querySelector(`[data-edit="${i}"]`), id);
      if (await p.evaluate((i) => window.__mockdb.profiles.some((x) => x.id === i), id)) throw new Error('not deleted');
      const busy = await p.evaluate(() => { const s = window.__mockdb.shifts[0]; return s && s.staff_id; });
      if (busy && busy !== (await p.evaluate(() => window.__mockdb.profiles.find((x) => x.role === 'manager').id))) {
        await p.click(`[data-edit="${busy}"]`); await p.click('.modal #acc-del'); await p.click('#cf-ok');
        await p.waitForTimeout(500);
        const pr = await p.evaluate((i) => window.__mockdb.profiles.find((x) => x.id === i), busy);
        if (!pr || !pr.archived_at || pr.active !== false) throw new Error('not archived ' + JSON.stringify(pr));
        if (await p.$(`[data-edit="${busy}"]`)) throw new Error('archived still listed');
      }
      if (await p.evaluate(() => { const me = window.__mockdb.profiles.find((x) => x.role === 'manager'); return !!me; })) { /* own account has no delete button */ }
    });
    await step('settings: a photo for an account shows in the round avatars', async () => {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
      await p.goto(BASE + '#/settings/team'); await p.waitForSelector('[data-edit]');
      const id = await p.evaluate(() => window.__mockdb.profiles.find((x) => x.role !== 'manager').id);
      await p.click(`[data-edit="${id}"]`); await p.setInputFiles('.modal #ph-file', { name: 'me.png', mimeType: 'image/png', buffer: png });
      await p.waitForFunction((i) => window.__mockdb.profiles.find((x) => x.id === i).photo_url, id);
      await p.waitForSelector('.modal .acc-photo .av.has-photo img'); await p.keyboard.press('Escape');
      await p.goto(BASE + '#/roster'); await p.waitForSelector('.ro-who .av.has-photo img');
      await p.setViewportSize({ width: 390, height: 844 }); await p.click('[data-view=day]'); await p.waitForSelector('.m-row .m-who .av'); await p.waitForSelector('.m-who .av.has-photo img'); await p.screenshot({ path: `${OUT}/roster-day-photos.png` }); await p.click('[data-view=week]'); await p.setViewportSize({ width: 1280, height: 900 }); });
    await step('settings: one account for both apps, Finance access set from the Team app', async () => {
      await p.goto(BASE + '#/settings/team'); await p.waitForSelector('#add'); await p.click('#add');
      await p.fill('.modal [name=full_name]', 'Shared Login'); await p.fill('.modal [name=email]', 'shared@example.test');
      await p.selectOption('.modal [name=role]', 'manager'); await p.selectOption('.modal [name=fin_role]', 'org_admin');
      await p.click('.modal button[type=submit]'); await p.waitForSelector('.pw-card code'); await p.keyboard.press('Escape');
      const st = await p.evaluate(() => ({ prof: window.__mockdb.profiles.find((x) => x.email === 'shared@example.test'), fin: window.__mockdb.fin_users.find((x) => x.email === 'shared@example.test') }));
      if (!st.prof || st.prof.role !== 'manager') throw new Error('team role ' + JSON.stringify(st.prof));
      if (!st.fin || st.fin.role !== 'org_admin') throw new Error('finance access ' + JSON.stringify(st.fin));
      await p.goto(BASE + '#/settings/sops'); await p.goto(BASE + '#/settings/team'); await p.waitForSelector('text=Admin (everything)');
      await p.click(`[data-edit="${st.prof.id}"]`); await p.selectOption('.modal [name=fin_role]', ''); await p.click('.modal button[type=submit]'); await p.waitForTimeout(400);
      if (await p.evaluate(() => window.__mockdb.fin_users.some((x) => x.email === 'shared@example.test'))) throw new Error('finance access not removed');
      await p.click(`[data-edit="${st.prof.id}"]`); await p.selectOption('.modal [name=fin_role]', 'staff'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(400);
      if (!(await p.evaluate(() => window.__mockdb.fin_users.some((x) => x.email === 'shared@example.test' && x.role === 'staff')))) throw new Error('finance access not given back');
      await p.screenshot({ path: `${OUT}/07b-accounts.png`, fullPage: true }); });
    await step('settings: add fixed shift', async () => {
      await p.goto(BASE + '#/settings/templates'); await p.click('#add'); await p.fill('.modal [name=name]', 'Evening'); await p.fill('.modal [name=start_time]', '17:00'); await p.fill('.modal [name=end_time]', '23:00');
      await p.click('.modal button[type=submit]'); await p.waitForSelector('text=Evening'); });
    await step('backups are explained under System check (old link still works)', async () => { await p.goto(BASE + '#/settings/backup'); await p.waitForSelector('#sec .card:has-text("both apps")'); if (!/both apps/.test(await p.textContent('#sec'))) throw new Error('no nightly backup text'); if (await p.$('#dl, #restore')) throw new Error('old download/restore still there'); });
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
      await p.click('.ev-ct label:has-text("Business")');
      await p.click('[data-addprice^="Diner p.p."]'); await p.fill('#rows-price [name=pr_price]', '85'); await p.waitForSelector('#price-total:has-text("5,100")');
      await p.click('[data-addprice^="Wijnarrangement"]'); await p.fill('#rows-price [data-i="1"] [name=pr_price]', '20');
      await p.fill('[name=notes_kitchen]', 'Bread warm from the oven');
      await p.screenshot({ path: `${OUT}/15-event-form.png`, fullPage: true });
      await p.click('#ev-form button[type=submit]'); await p.waitForSelector('h1:has-text("Wedding Jansen")');
      const ev = await p.evaluate(() => window.__mockdb.events[0]);
      if (ev.menu[0].course !== 'course_starter' || ev.menu[0].allergens[0] !== 'gluten') throw new Error(JSON.stringify(ev.menu));
      if (ev.dietary[0].type !== 'diet_vegetarian' || ev.dietary[0].count !== 3) throw new Error(JSON.stringify(ev.dietary));
      if (ev.guests_expected !== 60 || ev.client_type !== 'business' || ev.price_lines.length !== 2 || ev.price_lines[0].price !== 85 || ev.price_lines[1].vat !== 0.21) throw new Error('numbers ' + JSON.stringify(ev.price_lines));
      if (!/€6,300/.test(await p.textContent('.ev-kpis'))) throw new Error('expected revenue');
      if (!(await p.$('.ev-uvh-note a[href="#/settings/company"]'))) throw new Error('no warning about company details');
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
      if (!/>Bevestiging</.test(html) || !/Voorgerecht/.test(html) || !/Handtekening/.test(html)) throw new Error('client NL');
      if (!/Uniforme Voorwaarden Horeca/.test(html) || !/ontvangst van de Uniforme Voorwaarden Horeca/.test(html)) throw new Error('no UVH on the confirmation');
      if (!/Btw 9% over/.test(html) || !/Btw 21% over/.test(html) || !/7\.560,00/.test(html)) throw new Error('VAT per rate');
      if (!/van de reserveringswaarde/.test(html) || !/sporen van andere ingrediënten/.test(html)) throw new Error('cancellation or allergens');
      if (/Bread warm/.test(html)) throw new Error('kitchen note on client PDF');
      await p.click('summary:has-text("Print")'); await p.click('[data-print=kitchen]'); await p.waitForTimeout(400);
      html = await p.evaluate(() => window.__printed);
      if (!/Gluten/i.test(html) || !/Bread warm/.test(html) || !/Vegetarian/.test(html)) throw new Error('kitchen sheet'); });
    await step('settings: company details on the quote; a private client gets UVH art. 14 instead of percentages', async () => {
      await p.goto(BASE + '#/settings/company'); await p.waitForSelector('#co-f');
      await p.fill('#co-legal_name', 'Wintertuin B.V. i.o.'); await p.fill('#co-address', 'Cantonspark 1'); await p.fill('#co-postcode_city', '3741 AA Baarn');
      await p.fill('#co-kvk', '12345678'); await p.fill('#co-vat_id', 'NL123456789B01'); await p.fill('#co-iban', 'NL00TEST0123456789');
      await p.setInputFiles('#co-uvh', { name: 'uvh.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }); await p.waitForSelector('.toast:has-text("UVH saved")');
      await p.screenshot({ path: `${OUT}/18a-company.png`, fullPage: true });
      const id = await p.evaluate(() => window.__mockdb.events[0].id);
      await p.goto(BASE + '#/events/' + id); await p.waitForSelector('summary:has-text("Print")');
      if (await p.$('.ev-uvh-note')) throw new Error('warning stays after filling in');
      await p.goto(BASE + '#/events/' + id + '/edit'); await p.waitForSelector('#ev-form'); await p.click('.ev-ct label:has-text("Private person")'); await p.selectOption('[name=status]', 'option');
      await p.click('#ev-form button[type=submit]'); await p.waitForSelector('summary:has-text("Print")');
      await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById('printArea').innerHTML; }; });
      await p.click('summary:has-text("Print")'); await p.click('[data-print=client-nl]'); await p.waitForTimeout(400);
      const html = await p.evaluate(() => window.__printed);
      if (!/>Offerte</.test(html) || !/KVK 12345678/.test(html) || !/NL123456789B01/.test(html) || !/UVH art\. 14\.2/.test(html) || /van de reserveringswaarde/.test(html)) throw new Error('private quote');
      await p.evaluate((h) => { document.body.insertAdjacentHTML('beforeend', `<div id="pv" style="position:fixed;inset:0;background:#fff;overflow:auto;z-index:9999;padding:20px">${h}</div>`); }, html);
      await p.screenshot({ path: `${OUT}/18b-quote.png`, fullPage: false }); await p.evaluate(() => document.getElementById('pv').remove());
      // back to a business confirmation for the next steps
      await p.goto(BASE + '#/events/' + id + '/edit'); await p.waitForSelector('#ev-form'); await p.click('.ev-ct label:has-text("Business")'); await p.selectOption('[name=status]', 'confirmed');
      await p.click('#ev-form button[type=submit]'); await p.waitForSelector('summary:has-text("Print")');
      await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed = (window.__printed || 0) + 1; }; }); });
    await step('settings: next steps tick themselves for company and UVH; a manager ticks KHN', async () => {
      await p.goto(BASE + '#/settings/start'); await p.waitForSelector('.sl-list');
      if ((await p.$$('.sl-list li.ok .sl-auto')).length < 2) throw new Error('company and UVH not ticked by the app');
      await p.check('[data-todo=khn]'); await p.waitForSelector('.toast:has-text("Ticked off")');
      const d = await p.evaluate(() => window.__mockdb.team_settings.find((x) => x.key === 'setup_todo').value.done);
      if (!d.khn) throw new Error('KHN not saved');
      await p.screenshot({ path: `${OUT}/18c-next-steps.png`, fullPage: true }); });
    await step('today page: one small line with the event of today or the next one; tap opens it', async () => {
      await p.evaluate(() => { const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
        window.__mockdb.events.push({ id: 'ev-later', title: 'Lunch Bakker', event_date: d(8), start_time: '12:30:00', status: 'option', guests_expected: 14, version: 1 }); });
      await p.goto(BASE + '#/today'); await p.waitForSelector('.home-nudge');
      const txt = await p.textContent('.home-nudge');
      if (!/Tomorrow/.test(txt) || !/Wedding Jansen/.test(txt)) throw new Error(txt);
      await p.click('.home-nudge'); await p.waitForSelector('h1:has-text("Wedding Jansen")');
      await p.screenshot({ path: `${OUT}/02b-today-events.png`, fullPage: true }); });
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
    await step('events: mail quote shares the PDF with the mail text (sender is chosen in the mail app)', async () => {
      const id = await p.evaluate(() => { const e = window.__mockdb.events[0]; e.client_email = 'klant@example.test'; e.client_name = 'Klant'; return e.id; });
      await p.goto(BASE + `#/events/${id}`); await p.waitForSelector('#ev-mail');
      await p.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, text: d.text, title: d.title }; }; });
      await p.click('#ev-mail'); await p.waitForFunction(() => window.__shared, null, { timeout: 30000 });
      const sh = await p.evaluate(() => window.__shared);
      if (sh.type !== 'application/pdf' || sh.size < 5000 || !/klant@example\.test/.test(sh.text) || !/bijlage/.test(sh.text)) throw new Error(JSON.stringify(sh)); });
    await step('haccp: print this week opens the sheet with share, PDF and print', async () => {
      await p.goto(BASE + '#/haccp'); await p.waitForSelector('#hc-print-all');
      const n0 = await p.evaluate(() => { window.__keepSheet = true; return window.__printed || 0; });
      await p.click('#hc-print-all'); await p.waitForSelector('#sheet-view');
      if (!(await p.evaluate(() => document.getElementById('printArea').innerHTML.length > 500))) throw new Error('empty sheet');
      await p.waitForSelector('#sv-share:not([disabled])', { timeout: 20000 });
      const pdf = await p.evaluate(async () => { const f = await document.getElementById('sheet-view').__job; return f && { name: f.name, size: f.size, type: f.type }; });
      const b64 = await p.evaluate(async () => { const f = await document.getElementById('sheet-view').__job; const buf = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return btoa(s); });
      require('fs').writeFileSync(`${OUT}/haccp-week.pdf`, Buffer.from(b64, 'base64'));
      if (!pdf || pdf.type !== 'application/pdf' || pdf.size < 5000 || !/HACCP/.test(pdf.name)) throw new Error(JSON.stringify(pdf));
      const shared = await p.evaluate(async () => { let got = null; navigator.canShare = () => true; navigator.share = async (d) => { got = d.files[0].name; };
        document.getElementById('sv-share').click(); await new Promise((r) => setTimeout(r, 300)); return got; });
      if (!/\.pdf$/.test(shared || '')) throw new Error('not shared: ' + shared);
      const n1 = await p.evaluate(() => window.__printed || 0); await p.click('#sv-print');
      if ((await p.evaluate(() => window.__printed || 0)) < n1 + 1 || n1 < n0 + 1) throw new Error('print');
      await p.screenshot({ path: `${OUT}/haccp-sheet.png` });
      await p.click('.sv-x'); await p.evaluate(() => { window.__keepSheet = false; }); if (await p.$('#sheet-view')) throw new Error('sheet stays open'); });
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
      let first = await p.$eval('#nav a:not([href="#/today"])', (a) => a.getAttribute('href')); if (first !== '#/haccp') throw new Error('first is ' + first);
      await p.goto(BASE + '#/home'); await p.waitForSelector('.home-hero'); if (!/#\/today$/.test(p.url())) throw new Error('start page is ' + p.url());
      await p.goto(BASE + '#/settings/navorder'); await p.waitForSelector('#save-nav');
      await p.click('[data-ndown="0"]'); await p.click('#save-nav'); await p.waitForTimeout(400);
      first = await p.$eval('#nav a:not([href="#/today"])', (a) => a.getAttribute('href')); if (first === '#/haccp') throw new Error('arrow did not move it');
      await p.click('#reset-nav'); await p.click('#save-nav'); await p.waitForTimeout(400);
      if ((await p.$eval('#nav a:not([href="#/about"]):not([href="#/today"])', (a) => a.getAttribute('href'))) !== '#/sops') throw new Error('reset'); });
    await step('switch to Dutch, saved in profile', async () => {
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster'); await p.click('#lang-toggle [data-lang=nl]'); await p.waitForSelector('text=Rooster');
      const l = await p.evaluate(() => window.__mockdb.profiles[0].language); if (l !== 'nl') throw new Error(l);
      await p.screenshot({ path: `${OUT}/08-roster-nl.png`, fullPage: true }); });
    await step('About in the app: first in the menu, team edit, direct links', async () => {
      await p.goto(BASE + '#/menu'); await p.waitForSelector('#nav', { state: 'attached' });
      const first = await p.$eval('#nav a:not([href="#/today"])', (a) => a.getAttribute('href')); if (first !== '#/about') throw new Error('first nav item ' + first);
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
      if ((await p.$$eval('#ab-secs > .ab-sec', (x) => x.map((e) => e.dataset.sec))).join() !== 'app,concept,manifesto,more,team') throw new Error('move failed ' + (await p.$$eval('#ab-secs > .ab-sec', (x) => x.map((e) => e.dataset.sec))).join());
      await p.click('#ab-save'); await p.waitForSelector('#ab-edit');
      const row = await p.evaluate(() => window.__mockdb.about_content.find((r) => r.key === 'team'));
      const ppl = JSON.parse(row.html); if (ppl.length !== 4 || ppl[3].name !== 'Testpersoon' || ppl[0].name !== 'Kees') throw new Error(row.html);
      await p.screenshot({ path: `${OUT}/10a-about-app.png`, fullPage: true });
      await p.goto(BASE + '#/sops'); await p.goto(BASE + '#/about'); await p.waitForSelector('.ab-person');
      if (!/Testpersoon/.test(await p.textContent('#ab-people'))) throw new Error('team not reloaded');
      if ((await p.$$eval('#ab-secs > .ab-sec', (x) => x.map((e) => e.dataset.sec))).join() !== 'app,concept,manifesto,more,team') throw new Error('order not kept');
      if (await p.$eval('.ab-pillar:first-child', (e) => e.dataset.pi) !== '2') throw new Error('concept order not kept');
      const nlBtn = async (re) => p.evaluate((src) => { const b = [...document.querySelectorAll('#lang-toggle button')].find((x) => new RegExp(src).test(x.textContent)); b && b.click(); }, re);
      await nlBtn('NL'); await p.waitForSelector('text=Het team');
      if (!/Testpersoon/.test(await p.textContent('#ab-people'))) throw new Error('team edits not shown in Dutch');
      // English leads: an English edit suggests the Dutch, which you can adjust before saving
      await nlBtn('EN'); await p.waitForSelector('text=The team');
      await p.click('#ab-edit'); await p.click('.ab-person:first-child [data-f="role"]'); await p.keyboard.press('Control+A'); await p.keyboard.type('Coffee expert');
      await p.click('#ab-save'); await p.waitForSelector('.modal textarea');
      if (!/\[nl\] Coffee expert/.test(await p.inputValue('.modal textarea'))) throw new Error('no Dutch suggestion');
      await p.fill('.modal textarea', 'Koffiekenner'); await p.click('.modal button[type=submit]'); await p.waitForTimeout(400);
      const rows = await p.evaluate(() => window.__mockdb.about_content.filter((r) => r.key === 'p:kees:role'));
      if (rows.find((r) => r.page === 'app-en')?.html !== 'Coffee expert' || rows.find((r) => r.page === 'app-nl')?.html !== 'Koffiekenner') throw new Error(JSON.stringify(rows));
      // a Dutch edit changes only Dutch
      await nlBtn('NL'); await p.waitForSelector('text=Het team');
      if (!/Koffiekenner/.test(await p.textContent('#ab-people'))) throw new Error('Dutch role not shown');
      await p.click('#ab-edit'); await p.click('.ab-person:first-child [data-f="role"]'); await p.keyboard.press('Control+A'); await p.keyboard.type('Koffieman');
      await p.click('#ab-save'); await p.waitForSelector('#ab-edit');
      if (await p.$('.modal:not([hidden]) textarea')) throw new Error('Dutch edit asked for a translation');
      const rows2 = await p.evaluate(() => window.__mockdb.about_content.filter((r) => r.key === 'p:kees:role'));
      if (rows2.find((r) => r.page === 'app-en')?.html !== 'Coffee expert' || rows2.find((r) => r.page === 'app-nl')?.html !== 'Koffieman') throw new Error(JSON.stringify(rows2));
      await nlBtn('EN'); await p.waitForSelector('text=The team');
      await p.goto(BASE + '#/settings/navorder'); await p.waitForSelector('[data-nav=about]'); });
    await step('About page: manager edits and saves text', async () => {
      await p.goto(BASE + 'Wintertuin-Intro.html'); await p.waitForSelector('#ab-edit'); await p.click('#ab-edit');
      await p.click('h1[data-edit]'); await p.keyboard.press('End'); await p.keyboard.type(' Baarn');
      await p.click('#ab-save'); await p.waitForTimeout(300);
      const row = await p.evaluate(() => window.__mockdb.about_content.find((r) => r.page === 'intro-en'));
      if (!row || !/Wintertuin Baarn/.test(row.html)) throw new Error(JSON.stringify(row));
      await p.screenshot({ path: `${OUT}/10-about.png` });
      await p.goto(BASE + 'Wintertuin-Cantonspark-Geschiedenis.html'); await p.waitForSelector('#ab-edit');
      if (!/Seeded history title/.test(await p.textContent('h1'))) throw new Error('saved text not loaded');
      if (await p.evaluate(() => window.__xss)) throw new Error('script ran');
      if (!/Background/.test(await p.textContent('.eyebrow'))) throw new Error('history not in English');
      await p.click('#lang-sw [data-l=nl]'); await p.waitForSelector('#lang-sw [data-l=nl].on');
      if (!/Opgeslagen titel/.test(await p.textContent('h1')) || !/Achtergrond/.test(await p.textContent('.eyebrow'))) throw new Error('history not in Dutch');
      await p.goto(BASE + 'Wintertuin-Intro.html'); await p.waitForSelector('#lang-sw');
      if (!/Bekijk de tijdlijn/.test(await p.textContent('.history-card'))) throw new Error('intro not in Dutch');
      await p.click('#lang-sw [data-l=en]'); await p.waitForSelector('#lang-sw [data-l=en].on');
      if (!/View the timeline/.test(await p.textContent('.history-card'))) throw new Error('intro not back in English'); });
    await step('menu: our menu goes in once by itself, demo dishes and the demo lunch card go out', async () => {
      await p.setViewportSize({ width: 1280, height: 900 });
      await p.goto(BASE + '#/today'); await p.waitForSelector('.home-hero');
      await p.evaluate(() => { const db = window.__mockdb; db.team_settings = db.team_settings.filter((x) => x.key !== 'menu_v2');
        db.menu_items.push({ id: 'demo1', name: 'Uitsmijter Cantonspark (DEMO)', group_type: 'food', active: true, allergens: [] });
        db.menu_pdfs.push({ id: 'pd1', label: 'Lunchkaart (DEMO)', path: 'site:demo/wintertuin-lunchkaart-demo.pdf', sort_order: 10 }); });
      await p.goto(BASE + '#/menu'); await p.waitForSelector('.toast:has-text("Menu updated")');
      const r = await p.evaluate(() => { const db = window.__mockdb; return { n: db.menu_items.filter((m) => m.active !== false).length, demo: db.menu_items.find((m) => m.id === 'demo1').active,
        pdf: db.menu_pdfs.length, photos: db.menu_items.filter((m) => m.active !== false && m.photo_url).length }; });
      if (r.n < 33 || r.demo !== false || r.pdf !== 0 || r.photos < 33) throw new Error(JSON.stringify(r));
      await p.goto(BASE + '#/settings/menuorder'); await p.waitForSelector('#dom option:has-text("Tartine met gerookte forel")', { state: 'attached' });
      const id = await p.$eval('#dom', (s) => [...s.options].find((o) => /Tartine/.test(o.textContent)).value); await p.selectOption('#dom', id);
      await p.fill('#dom-note', 'Gerookt in de buurt, op ons eigen brood.'); await p.click('#dom-save'); await p.waitForTimeout(400);
      await p.click('#sample-load'); await p.waitForSelector('.toast:has-text("0 dishes added")');
      await p.goto(BASE + '#/menu'); await p.waitForSelector('.dom-card:has-text("Tartine")');
      if (!(await p.$('a[href="#/menucard/lunch"]')) || !(await p.$('a[href="#/menucard/allergens"]'))) throw new Error('menu card buttons missing');
      const heads = await p.$$eval('.mg-title', (x) => x.map((h) => h.textContent.trim())); if (heads.slice(0, 5).join() !== 'Bakery,Lunch,Borrel,Dinner,Drinks') throw new Error('headings: ' + heads);
      if (await p.$('details.menu-card[open]')) throw new Error('dishes open by default');
      // without the test switch the headings start folded: one overview with a count per heading
      await p.evaluate(() => { window.__MENU_OPEN_ALL = false; }); await p.goto(BASE + '#/today'); await p.goto(BASE + '#/menu'); await p.waitForSelector('.menu-group');
      if (await p.$('details.menu-group[open]')) throw new Error('headings open by default');
      if (!/\d/.test(await p.textContent('.menu-group:has(.mg-title:text-is("Lunch")) .mg-count'))) throw new Error('no count');
      await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: `${OUT}/29-menu-overview.png` }); await p.setViewportSize({ width: 1280, height: 900 });
      await p.click('.menu-group:has(.mg-title:text-is("Lunch")) > summary'); await p.waitForSelector('details.menu-group[open] .menu-card');
      await p.click('#dish-expand'); if ((await p.$$('details.menu-group:not([open])')).length) throw new Error('unfold all left a heading closed');
      await p.evaluate(() => { window.__MENU_OPEN_ALL = true; });
      await p.screenshot({ path: `${OUT}/23-menu-sample.png`, fullPage: false }); });
    await step('menu: take dishes off (one or a whole heading); dish database with seasons, filters, back on, delete', async () => {
      await p.goto(BASE + '#/menu'); await p.waitForSelector('#sel-on'); await p.click('#sel-on'); await p.waitForSelector('.sel-bar');
      await p.click('details[data-dish]:has(h3:text-is("Croissant")) > summary'); await p.waitForSelector('.menu-card.picked');
      await p.click('.menu-group:has(.mg-title:text-is("Borrel")) [data-pickall]');
      if ((await p.$$('.menu-card.picked')).length !== 2) throw new Error('picked ' + (await p.$$('.menu-card.picked')).length);
      await p.click('#sel-go'); await p.click('#cf-ok'); await p.waitForSelector('.toast:has-text("2 off the menu")');
      const r = await p.evaluate(() => window.__mockdb.menu_items.filter((m) => ['Croissant', 'Borrelplank'].includes(m.name)).map((m) => m.active));
      if (r.join() !== 'false,false') throw new Error(JSON.stringify(r));
      if (await p.$('details[data-dish]:has(h3:text-is("Croissant"))')) throw new Error('dish still on the menu');
      // the dish database: the example dishes are in it once, not on the menu
      await p.click('a[href="#/menu/dishes"]'); await p.waitForSelector('.db-list');
      const ex = await p.evaluate(() => window.__mockdb.menu_items.filter((m) => m.name === 'Pulled wortel').map((m) => m.active));
      if (ex.join() !== 'false') throw new Error('example dish ' + JSON.stringify(ex));
      await p.click('[data-dbseason=winter]'); await p.waitForSelector('.chip.on[data-dbseason=winter]');
      if (!(await p.$('.db-item:has(strong:text-is("Knolselderijsoep"))')) || await p.$('.db-item:has(strong:text-is("Fattoush"))')) throw new Error('winter filter wrong');
      await p.click('[data-dbseason=""]'); await p.click('[data-status=off]'); await p.waitForSelector('[data-status=off].on');
      if (await p.$('.db-item.is-on')) throw new Error('status filter shows dishes on the menu');
      await p.screenshot({ path: `${OUT}/28-dish-database.png`, fullPage: true });
      await p.click('[data-status=all]');
      await p.evaluate(() => { const m = window.__mockdb.menu_items.find((x) => x.name === 'Croissant'); window.__mockdb.menu_items.push({ ...m, id: 'old-dish-1', name: 'Oud gerecht', active: false, photo_url: 'https://joost1305.github.io/storage/v1/object/public/menu-photos/old.jpg' }); });
      await p.goto(BASE + '#/menu'); await p.waitForSelector('a[href="#/menu/dishes"]'); await p.click('a[href="#/menu/dishes"]'); await p.waitForSelector('.db-item:has(strong:text-is("Oud gerecht"))');
      await p.click('.db-item:has(strong:text-is("Oud gerecht")) [data-sel]'); await p.waitForSelector('.db-bar'); await p.click('#db-del'); await p.click('#cf-ok'); await p.waitForSelector('.toast:has-text("1 deleted")');
      if (await p.evaluate(() => window.__mockdb.menu_items.some((x) => x.id === 'old-dish-1'))) throw new Error('dish not deleted');
      if (await p.$('.db-item:has(strong:text-is("Oud gerecht"))')) throw new Error('still listed');
      await p.click('.db-item:has(strong:text-is("Croissant")) [data-toggle]'); await p.waitForSelector('.toast:has-text("1 on the menu")');
      // seasons and date in the editor
      await p.click('.db-item:has(strong:text-is("Croissant")) [data-dbedit]'); await p.waitForSelector('.modal .season-checks');
      await p.click('.modal .season-check.s-winter'); await p.fill('.modal [name=dish_date]', '2026-12-01'); await p.click('.modal button[type=submit]'); await p.waitForSelector('.toast:has-text("Saved")');
      const cr = await p.evaluate(() => window.__mockdb.menu_items.find((m) => m.name === 'Croissant'));
      if (cr.seasons.join() !== 'winter' || cr.dish_date !== '2026-12-01') throw new Error(JSON.stringify([cr.seasons, cr.dish_date]));
      await p.goto(BASE + '#/menu'); await p.waitForSelector('details[data-dish]:has(h3:text-is("Croissant"))');
      await p.click('details[data-dish]:has(h3:text-is("Croissant")) [data-edit]'); await p.waitForSelector('.modal #del');
      if (!/off the menu/i.test(await p.textContent('.modal #del'))) throw new Error('editor still deletes'); await p.click('.modal [data-close]'); });
    await step('menu cards: tapping a card opens it full screen with share, PDF and a pencil; the PDF is a real A4 file', async () => {
      await p.goto(BASE + '#/menu'); await p.click('a[href="#/menucard/lunch"]'); await p.waitForSelector('.mc-viewer #mc-frame');
      if (await p.$('.mc-form')) throw new Error('editor shown without the pencil');
      for (const id of ['#mcv-share', '#mcv-pdf', '#mcv-edit']) if (!(await p.$(id))) throw new Error(id + ' missing');
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#mcv-pdf')]);
      const fs = require('fs'); const path = await dl.path(); const buf = fs.readFileSync(path);
      if (dl.suggestedFilename() !== 'Wintertuin Lunch.pdf') throw new Error('name ' + dl.suggestedFilename());
      if (buf.slice(0, 5).toString() !== '%PDF-' || buf.length < 30000) throw new Error('not a real PDF ' + buf.length);
      const pages = (buf.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length; if (pages !== 2) throw new Error('pages ' + pages);
      fs.copyFileSync(path, `${OUT}/lunch.pdf`);
      await p.screenshot({ path: `${OUT}/27a-menucard-view.png` });
      if (await p.$('.mcv-tab[href="#/menucard/voorbeeld"]')) throw new Error('example card still there');
      await p.click('#mcv-edit'); await p.waitForSelector('.mc-form'); if (await p.$('.mc-viewer')) throw new Error('viewer still open in edit');
      await p.goto(BASE + '#/menucard/lunch'); await p.waitForSelector('.mc-viewer'); await p.keyboard.press('Escape'); await p.waitForFunction(() => location.hash === '#/menu'); });
    await step('menu cards: edit the lunch card, hide a dish, add an own line, print; staff cannot edit', async () => {
      await p.goto(BASE + '#/menucard/lunch/edit'); await p.waitForSelector('#mc-frame');
      await p.waitForFunction(() => /Tartine met gerookte forel/.test(document.querySelector('#mc-frame').srcdoc || ''));
      await p.fill('[data-c="subtitle"]', 'Vrijdag tot en met zondag, 12 tot 15 uur');
      const firstName = await p.textContent('.mc-items li >> nth=0 >> .mc-i-n');
      await p.click('.mc-items [data-rm] >> nth=0'); await p.waitForFunction((n) => ![...document.querySelectorAll('.mc-items .mc-i-n')].some((e) => e.textContent === n), firstName);
      const second = await p.textContent('.mc-items li >> nth=1 >> .mc-i-n'); await p.click('.mc-items [data-mv$="|-1"] >> nth=1');
      if (await p.textContent('.mc-items li >> nth=0 >> .mc-i-n') !== second) throw new Error('move up failed');
      await p.click('[data-addline="1"]'); await p.fill('.mc-line [name=name]', 'Soep van de dag'); await p.fill('.mc-line [name=price]', '7,5'); await p.check('.mc-line [name=al][value=celery]');
      await p.click('.mc-line button[type=submit]'); await p.waitForSelector('.mc-items li:has-text("Soep van de dag")');
      await p.waitForFunction(() => /Soep van de dag/.test(document.querySelector('#mc-frame').srcdoc) && /12 tot 15 uur/.test(document.querySelector('#mc-frame').srcdoc));
      await p.click('[data-pick="1"]'); await p.waitForSelector('.dp-pick'); await p.click('.dp-pick [data-se=winter]');
      if (await p.$('.dp-list li:has(strong:text-is("Fattoush"))')) throw new Error('picker winter filter');
      await p.check('.dp-list li:has(strong:text-is("Knolselderijsoep")) input'); await p.click('#dp-ok');
      await p.waitForFunction(() => /Knolselderijsoep/.test(document.querySelector('#mc-frame').srcdoc));
      await p.click('.mc-items li:has(.mc-i-n:text-is("Knolselderijsoep")) [data-ed]'); await p.waitForSelector('.modal [name=name]');
      await p.fill('.modal [name=name]', 'Knolseldersoep met hazelnoot'); await p.click('.modal button[type=submit]');
      await p.waitForFunction(() => /Knolseldersoep met hazelnoot/.test(document.querySelector('#mc-frame').srcdoc) && document.querySelector('.mc-items li .mc-i-n'));
      await p.screenshot({ path: `${OUT}/27b-menucard-picker.png` });
      await p.click('#mc-save'); await p.waitForSelector('.toast:has-text("Menu cards saved")');
      const saved = await p.evaluate(() => window.__mockdb.team_settings.find((x) => x.key === 'menu_cards').value.cards[0]);
      if (saved.subtitle !== 'Vrijdag tot en met zondag, 12 tot 15 uur' || !saved.sections[1].extra.some((x) => x.name === 'Soep van de dag')) throw new Error(JSON.stringify(saved).slice(0, 300));
      await p.goto(BASE + '#/menucard/lunch'); await p.waitForSelector('.mc-viewer #mc-print');
      const before = await p.evaluate(() => window.__printed || 0); await p.click('#mc-print'); await p.waitForTimeout(300);
      if ((await p.evaluate(() => window.__printed || 0)) !== before + 1) throw new Error('not printed');
      if (!(await p.$('#printArea .mc-page'))) throw new Error('no printed card');
      await p.screenshot({ path: `${OUT}/27-menucard.png`, fullPage: false });
      await p.goto(BASE + '#/menucard/allergens'); await p.waitForFunction(() => /Allergenenkaart/.test(document.querySelector('#mc-frame').srcdoc || '')); });
    await step('menu cards: drag a dish; valid until a past date sends a card to the card archive; use it again', async () => {
      await p.goto(BASE + '#/menucard/dinner/edit'); await p.waitForSelector('.mc-items[data-sec="0"] li');
      const names = await p.$$eval('.mc-items[data-sec="0"] .mc-i-n', (x) => x.map((e) => e.textContent));
      await p.locator('.mc-items[data-sec="0"] li >> nth=0 >> .mc-grip').dragTo(p.locator('.mc-items[data-sec="0"] li >> nth=2'), { targetPosition: { x: 40, y: 30 } });
      await p.waitForTimeout(300);
      const after = await p.$$eval('.mc-items[data-sec="0"] .mc-i-n', (x) => x.map((e) => e.textContent));
      if (after[0] === names[0]) throw new Error('drag did not move: ' + after.join(', '));
      await p.fill('[data-c="validTo"]', '2025-12-31'); await p.waitForSelector('#mc-valid-st:has-text("Ended")');
      await p.click('#mc-save'); await p.waitForSelector('.toast:has-text("Menu cards saved")');
      await p.goto(BASE + '#/menu'); await p.waitForSelector('a[href="#/menucard/archive"]');
      if (await p.$('.menu-actions a[href="#/menucard/dinner"]')) throw new Error('ended card still on the Menu page');
      await p.click('a[href="#/menucard/archive"]'); await p.waitForSelector('.mc-arch-row');
      await p.screenshot({ path: `${OUT}/27c-card-archive.png` });
      await p.click('.mc-arch-row:has-text("Dinerkaart") [data-reuse]'); await p.waitForSelector('.mc-form');
      const cards = await p.evaluate(() => window.__mockdb.team_settings.find((x) => x.key === 'menu_cards').value.cards);
      if (cards.filter((c) => c.name === 'Dinerkaart').length !== 2 || !cards.some((c) => c.name === 'Dinerkaart' && !c.validTo)) throw new Error('reuse failed'); });
    await step('menu cards: a Word document comes in as a card in the same style', async () => {
      const html = '<h1>Kerstlunch</h1><p>24 december</p><h2>Voor</h2><p><strong>Tartine met gerookte forel</strong> 14</p><p>Met dille.</p><p><strong>Paddenstoelenbouillon</strong></p><h2>Hoofd</h2><p>Hertenstoof met rode kool  24,50</p><p>Met jeneverbes</p>';
      const card = await p.evaluate(async (h) => { const m = await import('/js/pages/menucard.js'); return m.parseWordHtml(h, window.__mockdb.menu_items); }, html);
      if (card.title !== 'Kerstlunch' || card.subtitle !== '24 december' || card.sections.length !== 2) throw new Error(JSON.stringify(card));
      const f = card.sections[0].extra[0]; if (f.name !== 'Tartine met gerookte forel' || f.price !== 14 || f.description !== 'Met dille.' || !f.allergens.includes('fish')) throw new Error(JSON.stringify(f));
      const h2 = card.sections[1].extra[0]; if (h2.name !== 'Hertenstoof met rode kool' || h2.price !== 24.5 || h2.description !== 'Met jeneverbes') throw new Error(JSON.stringify(h2)); });
    await step('About: the manifesto sits right after the concept', async () => {
      await p.goto(BASE + '#/about'); await p.waitForSelector('.ab-manifesto h2:has-text("How we cook")');
      const order = await p.$$eval('#ab-secs > .ab-sec', (x) => x.map((s) => s.dataset.sec)); if (order.indexOf('manifesto') !== order.indexOf('concept') + 1) throw new Error(order.join());
      await p.screenshot({ path: `${OUT}/24-about-manifesto.png`, fullPage: true }); });
    await step('events: the client can say yes to the newsletter on the event', async () => {
      await p.goto(BASE + '#/events/new'); await p.waitForSelector('#ev-form'); if (!(await p.$('[name=newsletter_ok]'))) throw new Error('no consent box');
      await p.fill('[name=title]', 'Lunch Bakker'); await p.fill('[name=client_name]', 'Ria Bakker'); await p.fill('[name=client_email]', 'Ria@Example.test'); await p.check('[name=newsletter_ok]');
      await p.click('#ev-form button[type=submit]'); await p.waitForSelector('h1:has-text("Lunch Bakker")');
      if (!(await p.evaluate(() => window.__mockdb.events.some((e) => e.newsletter_ok && e.client_email === 'Ria@Example.test')))) throw new Error('consent not saved'); });
    await step('guests: event clients are listed, newsletter list only holds a yes', async () => {
      await p.evaluate(() => window.__mockdb.events.push({ id: 'evx', title: 'Diner Jansen', event_date: '2026-10-02', status: 'done', client_name: 'Piet Jansen', client_email: 'piet@example.test', newsletter_ok: false }));
      await p.goto(BASE + '#/guests'); await p.waitForSelector('.g-table');
      const txt = await p.textContent('.g-table'); if (!/ria@example\.test/.test(txt) || !/piet@example\.test/.test(txt)) throw new Error('guests missing');
      await p.screenshot({ path: `${OUT}/25-guests.png`, fullPage: true });
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#g-csv')]);
      const csv = require('fs').readFileSync(await dl.path(), 'utf8'); if (!/ria@example\.test/.test(csv) || /piet@/.test(csv)) throw new Error('csv: ' + csv);
      await p.click('.g-name:has-text("Piet Jansen")'); await p.waitForSelector('#g-form'); await p.fill('[name=notes]', 'Vegetarisch, komt graag op donderdag'); await p.check('#g-form [name=newsletter]');
      await p.click('#g-form button[type=submit]'); await p.waitForSelector('.toast:has-text("Saved")');
      if (!(await p.evaluate(() => window.__mockdb.guests.some((g) => g.email === 'piet@example.test' && g.newsletter && g.newsletter_source === 'manual')))) throw new Error('guest not saved'); });
    await step('newsletter: built from the dish of the month and the menu, downloads as HTML', async () => {
      await p.goto(BASE + '#/newsletter'); await p.waitForSelector('#nl-frame');
      await p.waitForFunction(() => /Gerecht van de maand/.test(document.querySelector('#nl-frame').srcdoc || ''));
      const html = await p.$eval('#nl-frame', (f) => f.srcdoc); if (!/Tartine met gerookte forel/.test(html) || !/Afmelden/.test(html)) throw new Error('newsletter content');
      await p.screenshot({ path: `${OUT}/26-newsletter.png`, fullPage: false });
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#nl-dl')]); if (!dl.suggestedFilename().endsWith('.html')) throw new Error('no html');
      // every block is editable: title, text, photo; blocks move and can be added
      await p.click('details.nl-sec:has(.nl-sec-t:text-is("Uit de bakkerij")) > summary'); await p.fill('details.nl-sec[open] [data-bf="title"]', 'Vers uit de oven');
      await p.fill('details.nl-sec[open] [data-bf="text"]', 'Deze maand een roggebrood met venkel.');
      await p.setInputFiles('details.nl-sec[open] [data-bphoto]', { name: 'brood.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') });
      await p.waitForSelector('details.nl-sec[open] .nl-ph img');
      await p.waitForFunction(() => /Vers uit de oven/.test(document.querySelector('#nl-frame').srcdoc) && /roggebrood met venkel/.test(document.querySelector('#nl-frame').srcdoc) && /data:image\/gif/.test(document.querySelector("#nl-frame").srcdoc));
      await p.click('[data-addb="text"]'); await p.waitForSelector('details.nl-sec[open]:has(.nl-sec-t:text-is("Nieuw blok"))');
      await p.fill('details.nl-sec:has(.nl-sec-t:text-is("Nieuw blok")) [data-bf="title"]', 'Kerst in de kas');
      await p.waitForFunction(() => /Kerst in de kas/.test(document.querySelector('#nl-frame').srcdoc));
      const before = await p.$$eval('.nl-sec-t', (x) => x.map((e) => e.textContent));
      await p.click(`details.nl-sec:has(.nl-sec-t:text-is("Kerst in de kas")) [data-bmv$="|-1"]`);
      const after = await p.$$eval('.nl-sec-t', (x) => x.map((e) => e.textContent));
      if (after.indexOf('Kerst in de kas') !== before.indexOf('Kerst in de kas') - 1) throw new Error('block did not move');
      // on the menu now: pick from the menu
      await p.click('details.nl-sec:has(.nl-sec-t:text-is("Nu op de kaart")) > summary'); await p.click('#nl-hlpick'); await p.waitForSelector('.dp-pick');
      await p.fill('#hq', 'croissant'); await p.check('.dp-list li:has(strong:text-is("Croissant")) input'); await p.click('#h-ok');
      await p.waitForFunction(() => /Croissant/.test(document.querySelector('#nl-frame').srcdoc));
      await p.screenshot({ path: `${OUT}/26b-newsletter-blocks.png`, fullPage: false });
      await p.click('#nl-save'); await p.waitForSelector('.toast:has-text("Draft saved")'); });
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
      await q.goto(BASE + '#/menu'); await q.waitForSelector('a[href="#/menucard/allergens"]'); if (await q.$('#pdf-manage')) throw new Error('staff can manage menu PDFs');
      await q.goto(BASE + '#/menucard/lunch/edit'); await q.waitForSelector('.mc-viewer #mc-frame'); if (await q.$('#mcv-edit, .mc-form')) throw new Error('staff can edit menu cards');
      await q.goto(BASE + '#/haccp/temperatures'); await q.waitForSelector('#hc-f'); if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('HACCP form scrolls sideways');
      await q.goto(BASE + '#/roster'); await q.waitForSelector('.roster-m .day-tab');
      if (await q.isVisible('table.roster')) throw new Error('wide table still shown on phone');
      if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('roster scrolls sideways on phone');
      if (await q.$('.day-toggle, .row-handle, .row-move')) throw new Error('staff can change days or order');
      await q.click('.day-tab:not(.on)'); await q.waitForSelector('.day-tab.on');
      await q.screenshot({ path: `${OUT}/09b-roster-phone.png`, fullPage: true });
      await q.click('[data-view=week]'); await q.waitForSelector('.ro-wk-day'); if (!(await q.isVisible('.ro-wk'))) throw new Error('week list hidden on phone');
      if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('week list scrolls sideways');
      await q.screenshot({ path: `${OUT}/09c-roster-phone-week.png`, fullPage: true });
      await q.click('[data-view=month]'); await q.waitForSelector('.ro-mo-day');
      if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('month scrolls sideways on phone');
      await q.screenshot({ path: `${OUT}/09d-roster-phone-month.png`, fullPage: true });
      await q.click('[data-view=day]'); await q.waitForSelector('.roster-m .day-tab');
      await q.goto(BASE + '#/settings'); await q.waitForSelector('.home-hero');
      await q.goto(BASE + '#/roster'); await q.waitForSelector('.roster-m .day-tab'); if (await q.$('[data-add]')) throw new Error('plan button for staff');
      await q.goto(BASE + '#/sops'); await q.waitForSelector('.sop-card');
      await q.evaluate(() => document.querySelectorAll('details.sop-card').forEach((d) => { d.open = true; }));
      if (await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.sop-card')].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1))) throw new Error('SOP card wider than the phone');
      await q.screenshot({ path: `${OUT}/09-staff-phone.png`, fullPage: true }); });
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

    // ---------------- quick sign-in with a PIN, and the clock-in tablet
    const C = await session(browser, 'manager', { width: 390, height: 844 });
    const c = C.page;
    const typePin = async (pin) => { for (const d of pin) await c.click(`.pinlock [data-k="${d}"], .k-overlay [data-k="${d}"]`); };
    await step('PIN: after the password the app offers a PIN, typed twice', async () => {
      await c.goto(BASE); await c.waitForSelector('#login-form'); await c.evaluate(() => localStorage.setItem('test_pin', '1')); await c.reload(); await c.waitForSelector('#login-form');
      await c.fill('[name=email]', 'a@b.c'); await c.fill('[name=password]', 'test'); await c.click('button[type=submit]');
      await c.waitForSelector('.pinlock'); await c.screenshot({ path: `${OUT}/20-pin-setup.png` });
      await typePin('1234'); await c.waitForSelector('.pinlock h2:has-text("once more")'); await typePin('1234');
      await c.waitForSelector('.home-hero'); if (await c.$('.pinlock')) throw new Error('setup did not close');
      if (!(await c.evaluate(() => window.__mockdb.__pinSet))) throw new Error('PIN not sent to the tablet'); });
    await step('PIN: after 30 minutes the app asks only for the PIN; a wrong one shakes', async () => {
      await c.evaluate(() => localStorage.setItem('wt_active', String(Date.now() - 31 * 60000))); await c.reload();
      await c.waitForSelector('.pinlock'); await c.screenshot({ path: `${OUT}/21-pin-unlock.png` });
      await typePin('9999'); await c.waitForSelector('.pl-sub:has-text("Wrong PIN")');
      await typePin('1234'); await c.waitForSelector('.home-hero'); if (await c.$('.pinlock')) throw new Error('still locked'); });
    await step('tablet: tap a name, PIN 1234 clocks in, wrong PIN does not; leaving asks the manager PIN', async () => {
      await c.setViewportSize({ width: 1024, height: 768 });
      await c.goto(BASE + '#/kiosk'); await c.waitForSelector('.k-person'); if (await c.isVisible('#topbar')) throw new Error('menu visible on the tablet');
      await c.click('.k-person >> nth=1'); await c.waitForSelector('.k-overlay .k-pad'); await typePin('0000'); await c.waitForSelector('.k-overlay .muted:has-text("Wrong PIN")');
      await typePin('1234'); await c.waitForSelector('.k-done'); await c.screenshot({ path: `${OUT}/22-kiosk-done.png` });
      await c.waitForSelector('.k-person.in', { timeout: 6000 });
      await c.click('#k-exit'); await c.waitForSelector('.k-overlay .k-pad'); await typePin('1234'); await c.waitForSelector('.home-hero'); });
    await C.ctx.close();
    if (C.errors.length) { failed = true; console.log('ERRORS (pin):', C.errors); }
  } catch (e) { failed = true; console.log('\nFAILED:', e.message); }
  await browser.close();
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
