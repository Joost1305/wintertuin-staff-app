// The rooms of the Wintertuin, with a standard room hire (incl. 21% VAT). Managers name them under Settings;
// stored in team_settings 'rooms' as { rooms: [{ id, name, hire, capacity, owner }], landlord }.
// owner 'landlord': the room is rented from the landlord (Mette); 'restaurant': our own.
// Until something is saved the examples below are used; change them to the real rooms and prices.
import { sb } from './data.js';
import { state } from './core.js';

export const EXAMPLE_ROOMS = [
  { id: 'restaurant', name: 'Restaurant', hire: null, capacity: 40, owner: 'restaurant' },
  { id: 'kas', name: 'De kas', hire: 350, capacity: 60, owner: 'landlord' },
  { id: 'serre', name: 'Serre (zijkamer)', hire: 175, capacity: 20, owner: 'landlord' },
  { id: 'terras', name: 'Terras', hire: 150, capacity: 40, owner: 'landlord' },
  { id: 'heel', name: 'Hele Wintertuin (exclusief)', hire: 750, capacity: 100, owner: 'landlord' },
];
export const DEFAULT_LANDLORD = 'Mette te Velde';
// rooms saved before owners existed: everything belongs to the landlord, except a room called restaurant
const withOwner = (r) => ({ ...r, owner: r.owner || (/restaurant/i.test(r.name || '') ? 'restaurant' : 'landlord') });
export async function loadRooms() {
  try {
    const { data } = await sb.from('team_settings').select('value').eq('key', 'rooms').maybeSingle();
    if (data && data.value && Array.isArray(data.value.rooms)) return { rooms: data.value.rooms.map(withOwner), landlord: data.value.landlord || DEFAULT_LANDLORD, example: false };
  } catch { /* not there yet */ }
  return { rooms: EXAMPLE_ROOMS.map((r) => ({ ...r })), landlord: DEFAULT_LANDLORD, example: true };
}
export async function saveRooms(rooms, landlord = DEFAULT_LANDLORD) {
  const clean = rooms.map((r, i) => ({ id: r.id || `r${Date.now().toString(36)}${i}`, name: String(r.name || '').trim(), hire: r.hire == null || r.hire === '' ? null : Number(r.hire), capacity: r.capacity ? Number(r.capacity) : null, owner: r.owner === 'restaurant' ? 'restaurant' : 'landlord' })).filter((r) => r.name);
  const { error } = await sb.from('team_settings').upsert({ key: 'rooms', value: { rooms: clean, landlord: String(landlord || '').trim() || DEFAULT_LANDLORD }, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  return clean;
}
