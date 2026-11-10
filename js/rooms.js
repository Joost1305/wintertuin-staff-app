// The rooms of the Wintertuin, with a standard room hire (incl. 21% VAT). Managers name them under Settings;
// stored in team_settings 'rooms' as { rooms: [{ id, name, hire, capacity }] }.
// Until something is saved the examples below are used; change them to the real rooms and prices.
import { sb } from './data.js';
import { state } from './core.js';

export const EXAMPLE_ROOMS = [
  { id: 'kas', name: 'De kas', hire: 350, capacity: 60 },
  { id: 'serre', name: 'Serre (zijkamer)', hire: 175, capacity: 20 },
  { id: 'terras', name: 'Terras', hire: 150, capacity: 40 },
  { id: 'heel', name: 'Hele Wintertuin (exclusief)', hire: 750, capacity: 100 },
];
export async function loadRooms() {
  try {
    const { data } = await sb.from('team_settings').select('value').eq('key', 'rooms').maybeSingle();
    if (data && data.value && Array.isArray(data.value.rooms)) return { rooms: data.value.rooms, example: false };
  } catch { /* not there yet */ }
  return { rooms: EXAMPLE_ROOMS.map((r) => ({ ...r })), example: true };
}
export async function saveRooms(rooms) {
  const clean = rooms.map((r, i) => ({ id: r.id || `r${Date.now().toString(36)}${i}`, name: String(r.name || '').trim(), hire: r.hire == null || r.hire === '' ? null : Number(r.hire), capacity: r.capacity ? Number(r.capacity) : null })).filter((r) => r.name);
  const { error } = await sb.from('team_settings').upsert({ key: 'rooms', value: { rooms: clean }, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  return clean;
}
