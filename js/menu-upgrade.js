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

// The dishes from the example card (ontbijt, lunch, borrel) go into the dish database once, not onto the menu:
// they are there to put a menu together from. Flag 'dishes_example1' in team_settings.
const EX = (name, category, description, price, seasons = []) => ({ name, category, description, price, seasons, group_type: 'food', allergens: [], active: false, dish_date: '2026-11-02' });
export const EXAMPLE_DISHES = [
  EX('Groene startbuffet', 'Ontbijt', 'Ontbijtbuffet met koffie en/of thee.', 17.5),
  EX('Croissant met jam', 'Ontbijt', '', 4),
  EX('Yoghurt met granola en fruit', 'Ontbijt', '', 7.5),
  EX('Muffin', 'Ontbijt', '', 3.5),
  EX('Huisgemaakte taart', 'Zoet', 'Elke dag wisselend: appeltaart, chocoladetaart, amandelcake, citroen-maanzaad of wortel. Vanaf 5.', 5),
  EX('Soep van de dag', 'Lunch', 'Met brood en kruidenboter. Klein 6, groot 9.', 6),
  EX('Knolselderijsoep', 'Lunch', 'Met pastinaak, mosterd, plantaardige spekjes en bieslookolie, met brood en kruidenboter. Klein 8, groot 11.', 8, ['najaar', 'winter']),
  EX('Gegrilde groenten op zuurdesem', 'Lunch', 'Op zuurdesembrood met zongedroogde-tomatenhummus en chimichurri.', 12.5, ['zomer', 'najaar']),
  EX('Paddenstoelenpaté', 'Lunch', 'Op knoflookbruschetta met compote van rabarber en szechuanpeper.', 12.5, ['najaar', 'winter']),
  EX('Pulled wortel', 'Lunch', 'Op zuurdesembrood met licht pittige crème van maïs en jalapeño, en gepofte maïs.', 12.5),
  EX('Pita döner', 'Lunch', 'Pitabroodje met plantaardige döner, sumak-ui, tahin, salade en granaatappel.', 14.5),
  EX('Combilunch', 'Lunch', 'Zuurdesembrood met twee paprika-spinaziekroketten, groene mosterdmayonaise en een kleine soep naar keuze.', 16.5),
  EX('Loaded fries', 'Lunch', 'Ambachtelijke friet met rendang van jackfruit, atjar, bosui en seroendeng.', 16.5),
  EX('Fattoush', 'Lunch: erbij', 'Met groenten van het seizoen, peterselie, sumak en geroosterde pita.', 11, ['zomer']),
  EX('Bietensalade', 'Lunch: erbij', 'Met gele en chioggiabieten, zwarte bonen en peppadewdressing.', 12, ['najaar', 'winter']),
  EX('Ambachtelijke friet', 'Lunch: erbij', 'Met kruidenzout en mayonaise.', 6.5),
  EX('Zuurdesembrood met dips', 'Lunch: erbij', 'Met twee wisselende dips.', 8),
  EX('Gestoomde edamame', 'Borrel', 'Met Maldonzout.', 8.5),
  EX('Bitterballen', 'Borrel', 'Met mosterd, 6 stuks.', 8.5),
  EX('Romescokroketjes', 'Borrel', 'Met aioli, 6 stuks.', 9.5),
  EX('Currybitterballen', 'Borrel', 'Met piccalilly-mayonaise, 6 stuks.', 9.5),
  EX('Bloemkoolwings', 'Borrel', 'Met barbecuesaus, bosui en sesam.', 9.5),
  EX("Samosa's", 'Borrel', 'Met uienchutney.', 9.5),
  EX("Mini-loempia's", 'Borrel', 'Met zoete chilisaus, 8 stuks.', 9.5),
];
export async function addExampleDishesOnce() {
  try {
    const { data } = await sb.from('team_settings').select('value').eq('key', 'dishes_example1').maybeSingle();
    if (data && data.value && data.value.done) return 0;
    const rows = check(await sb.from('menu_items').select('id, name, active')) || [];
    // the old demo dishes were only switched off; in the database they would only be in the way
    const demo = rows.filter((r) => r.active === false && isDemo(r.name)).map((r) => r.id);
    if (demo.length) { try { check(await sb.from('menu_items').delete().in('id', demo)); } catch { /* not allowed yet: they stay switched off */ } }
    const have = new Set(rows.filter((r) => !demo.includes(r.id)).map((r) => String(r.name || '').trim().toLowerCase()));
    const fresh = EXAMPLE_DISHES.filter((d) => !have.has(d.name.toLowerCase()));
    if (fresh.length) check(await sb.from('menu_items').insert(fresh));
    await sb.from('team_settings').upsert({ key: 'dishes_example1', value: { done: true, added: fresh.length, at: new Date().toISOString() }, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return fresh.length;
  } catch (e) { console.warn('example dishes', e); return 0; }
}
