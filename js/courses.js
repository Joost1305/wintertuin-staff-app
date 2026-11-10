// Courses for the event menu, split into food and drinks. Managers change the lists under Settings;
// stored in team_settings 'event_courses' as { food: [...], beverage: [...] }.
// Without a saved list: the standard courses plus the categories that are in the menu now (Zoet, Bakkerij, ...).
import { sb } from './data.js';
import { state } from './core.js';

export const DEFAULT_COURSES = {
  food: ['Borrel', 'Voorgerecht', 'Tussengerecht', 'Soep', 'Hoofdgerecht', 'Kaas', 'Nagerecht', 'Zoet', 'Bakkerij', 'Late night snack'],
  beverage: ['Welkomstdrank', 'Aperitief', 'Wijnarrangement', 'Bier en fris', 'Koffie en thee', 'Digestief'],
};
// old events stored codes; these belong to drinks
export const DRINK_CODES = new Set(['course_welcome', 'course_coffee']);

const uniq = (arr) => { const seen = new Set(); return arr.map((x) => String(x || '').trim()).filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };
// the menu categories, without the "Diner: " style prefix noise kept as is (they are names the team knows)
export function menuCategories(items, group) {
  return uniq(items.filter((m) => (m.group_type || 'food') === group).map((m) => m.category));
}
export async function loadCourses(items = []) {
  let saved = null;
  try { const { data } = await sb.from('team_settings').select('value').eq('key', 'event_courses').maybeSingle(); saved = data && data.value; } catch { /* not there yet */ }
  const out = {};
  for (const g of ['food', 'beverage']) {
    out[g] = saved && Array.isArray(saved[g]) && saved[g].length ? uniq(saved[g]) : uniq([...DEFAULT_COURSES[g], ...menuCategories(items, g)]);
  }
  return { ...out, saved: !!(saved && (saved.food || saved.beverage)) };
}
export async function saveCourses(v) {
  const { error } = await sb.from('team_settings').upsert({ key: 'event_courses', value: { food: uniq(v.food), beverage: uniq(v.beverage) }, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}
