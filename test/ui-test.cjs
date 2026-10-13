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
  await page.addInitScript((r) => { window.__MOCK_ROLE = r; window.print = () => { window.__printed = (window.__printed || 0) + 1; }; }, role);
  await page.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  return { ctx, page, errors };
}
const step = async (name, fn) => { process.stdout.write(`- ${name} ... `); await fn(); console.log('ok'); };
const login = async (p) => { await p.goto(BASE); await p.waitForSelector('#login-form'); await p.fill('[name=email]', 'a@b.c'); await p.fill('[name=password]', 'test'); await p.click('button[type=submit]'); await p.waitForSelector('.sop-card'); };

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  try {
    const A = await session(browser, 'manager', { width: 1280, height: 900 });
    const p = A.page;
    await step('login page in English', async () => { await p.goto(BASE); await p.waitForSelector('#login-form'); if (!/Sign in/.test(await p.textContent('h1'))) throw new Error('not English'); await p.screenshot({ path: `${OUT}/01-login.png` }); });
    await step('login lands on SOPs', async () => { await login(p); await p.screenshot({ path: `${OUT}/02-sops.png`, fullPage: true }); });
    await step('tick a checklist item, progress updates', async () => {
      await p.click('.sop-check >> nth=0'); await p.waitForTimeout(200);
      if (!(await p.textContent('[data-progress]')).startsWith('1/')) throw new Error(await p.textContent('[data-progress]'));
      const n = await p.evaluate(() => window.__mockdb.sop_checks.length); if (n !== 1) throw new Error('not saved'); });
    await step('add SOP via popup, draft survives closing', async () => {
      await p.click('#add'); await p.fill('.modal [name=title]', 'Lunch prep'); await p.keyboard.press('Escape');
      await p.click('#add'); if ((await p.inputValue('.modal [name=title]')) !== 'Lunch prep') throw new Error('draft lost');
      await p.fill('.modal [name=category]', 'Lunch'); await p.fill('.modal [name=items]', 'Cut bread\nSet tables'); await p.click('.modal button[type=submit]');
      await p.waitForSelector('text=Lunch prep'); });
    await step('menu with food and beverage', async () => { await p.goto(BASE + '#/menu'); await p.waitForSelector('.menu-card'); await p.screenshot({ path: `${OUT}/03-menu.png`, fullPage: true }); });
    await step('add menu item with photo', async () => {
      await p.click('#add'); await p.fill('.modal [name=name]', 'Apple pie'); await p.fill('.modal [name=price]', '4,50');
      await p.setInputFiles('.modal [name=photo]', { name: 'pie.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') });
      await p.click('.modal button[type=submit]'); await p.waitForSelector('text=Apple pie');
      const price = await p.evaluate(() => window.__mockdb.menu_items.find((m) => m.name === 'Apple pie').price); if (price !== 4.5) throw new Error(price); });
    await step('links page', async () => { await p.goto(BASE + '#/links'); await p.waitForSelector('.link-row'); });
    await step('roster week grid with chips and fixed shifts', async () => {
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster'); await p.waitForSelector('.tpl-chip');
      await p.screenshot({ path: `${OUT}/04-roster.png`, fullPage: true }); });
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
    for (const sec of ['team', 'templates', 'links', 'backup']) await step(`settings: ${sec}`, async () => { await p.goto(BASE + '#/settings/' + sec); await p.waitForSelector('#sec .card'); });
    await step('settings: create account shows login details', async () => {
      await p.goto(BASE + '#/settings/team'); await p.waitForSelector('#add'); await p.click('#add');
      await p.fill('.modal [name=full_name]', 'New Person'); await p.fill('.modal [name=email]', 'new@example.test'); await p.click('.modal button[type=submit]');
      await p.waitForSelector('.pw-card code'); await p.screenshot({ path: `${OUT}/07-settings.png` }); await p.keyboard.press('Escape'); });
    await step('settings: add fixed shift', async () => {
      await p.goto(BASE + '#/settings/templates'); await p.click('#add'); await p.fill('.modal [name=name]', 'Evening'); await p.fill('.modal [name=start_time]', '17:00'); await p.fill('.modal [name=end_time]', '23:00');
      await p.click('.modal button[type=submit]'); await p.waitForSelector('text=Evening'); });
    await step('backup download', async () => { await p.goto(BASE + '#/settings/backup'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dl')]); if (!dl.suggestedFilename().endsWith('.json')) throw new Error('no json'); });
    await step('switch to Dutch, saved in profile', async () => {
      await p.goto(BASE + '#/roster'); await p.waitForSelector('table.roster'); await p.click('#lang-toggle [data-lang=nl]'); await p.waitForSelector('text=Rooster');
      const l = await p.evaluate(() => window.__mockdb.profiles[0].language); if (l !== 'nl') throw new Error(l);
      await p.screenshot({ path: `${OUT}/08-roster-nl.png`, fullPage: true }); });
    await A.ctx.close();
    if (A.errors.length) { failed = true; console.log('ERRORS (manager):', A.errors); }

    const B = await session(browser, 'staff', { width: 390, height: 844 });
    const q = B.page;
    await login(q);
    await step('staff: no Settings, no plan buttons, phone layout', async () => {
      const links = await q.$$eval('#nav a', (as) => as.map((a) => a.getAttribute('href')));
      if (links.includes('#/settings')) throw new Error('settings visible');
      await q.goto(BASE + '#/settings'); await q.waitForSelector('.sop-card');
      await q.goto(BASE + '#/roster'); await q.waitForSelector('table.roster'); if (await q.$('[data-add]')) throw new Error('plan button for staff');
      await q.goto(BASE + '#/sops'); await q.waitForSelector('.sop-card'); await q.screenshot({ path: `${OUT}/09-staff-phone.png`, fullPage: true }); });
    await step('staff: offer own shift for swap', async () => {
      await q.goto(BASE + '#/swap'); await q.waitForSelector('[data-offer]'); await q.click('[data-offer]'); await q.fill('.modal [name=v]', 'Wedding'); await q.click('.modal button[type=submit]');
      await q.waitForSelector('.tag.open'); });
    await B.ctx.close();
    if (B.errors.length) { failed = true; console.log('ERRORS (staff):', B.errors); }
  } catch (e) { failed = true; console.log('\nFAILED:', e.message); }
  await browser.close();
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
