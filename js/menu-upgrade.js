// Puts our own menu in the app: every dish and drink from sample-menu.js with an example photo,
// takes out the old (DEMO) dishes and the old demo lunch card PDF. Used by the button under Settings and,
// once, automatically when a manager opens the Menu page (flag 'menu_v2' in team_settings).
import { sb, check } from './data.js';
import { state } from './core.js';
import { SAMPLE_MENU, SAMPLE_PDFS } from './sample-menu.js';

const isDemo = (s) => /\(demo\)/i.test(String(s || ''));

export async function loadOwnMenu() {
  const all = check(await sb.from('menu_items').select('id, name, active, sort_order, photo_url')) || [];
  // 1. old demo dishes out
  const demo = all.filter((r) => r.active !== false && isDemo(r.name)).map((r) => r.id);
  if (demo.length) check(await sb.from('menu_items').update({ active: false }).in('id', demo));
  // 2. our dishes in; existing ones (same name) get the example photo when they have none
  const live = all.filter((r) => r.active !== false && !isDemo(r.name));
  const byName = Object.fromEntries(live.map((r) => [r.name.trim().toLowerCase(), r]));
  let so = all.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
  const fresh = [];
  for (const m of SAMPLE_MENU) {
    const hit = byName[m.name.toLowerCase()];
    if (!hit) fresh.push({ ...m, sort_order: (so += 10), active: true });
    else if (!hit.photo_url && m.photo_url) check(await sb.from('menu_items').update({ photo_url: m.photo_url }).eq('id', hit.id));
  }
  if (fresh.length) check(await sb.from('menu_items').insert(fresh));
  // 3. the old demo lunch card and the fixed sample PDFs out: the menu cards are made from the dishes now
  const { data: pdfs } = await sb.from('menu_pdfs').select('id, label, path');
  const oldPdfs = (pdfs || []).filter((x) => isDemo(x.label) || /lunchkaart-demo/i.test(x.path || '') || SAMPLE_PDFS.some((y) => y.path === x.path)).map((x) => x.id);
  if (oldPdfs.length) check(await sb.from('menu_pdfs').delete().in('id', oldPdfs));
  return { added: fresh.length, removed: demo.length, pdfs: oldPdfs.length };
}

// Once per database: run the above the first time a manager opens the Menu page
export async function upgradeMenuOnce() {
  try {
    const { data } = await sb.from('team_settings').select('value').eq('key', 'menu_v2').maybeSingle();
    if (data && data.value && data.value.done) return null;
    const r = await loadOwnMenu();
    await sb.from('team_settings').upsert({ key: 'menu_v2', value: { done: true, at: new Date().toISOString(), ...r }, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return r;
  } catch (e) { console.warn('menu upgrade', e); return null; }
}
