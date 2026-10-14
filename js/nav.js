// Order of the top menu. Managers set it under Settings (numbers 1, 2, 3 ...); it is the same for everyone.
// Items not in the saved order (for example a new page) keep their default place after the ordered ones.
import { state } from './core.js';
import { sb } from './data.js';

export const NAV_ITEMS = [
  ['sops', 'nav_sops'], ['menu', 'nav_menu'], ['links', 'nav_links'], ['roster', 'nav_roster'], ['events', 'nav_events'],
  ['haccp', 'nav_haccp'], ['checkin', 'nav_checkin'], ['swap', 'nav_swap'], ['settings', 'nav_settings'],
];

export function orderPaths(paths, order) {
  const o = Array.isArray(order) ? order : [];
  const rank = (p) => { const i = o.indexOf(p); return i === -1 ? o.length + NAV_ITEMS.findIndex(([x]) => x === p) : i; };
  return [...paths].sort((a, b) => rank(a) - rank(b));
}

export async function loadNavOrder() {
  try {
    const { data } = await sb.from('team_settings').select('value').eq('key', 'nav_order').maybeSingle();
    state.navOrder = data && Array.isArray(data.value) ? data.value : null;
  } catch { state.navOrder = null; } // the menu then keeps its default order
}

export async function saveNavOrder(order) {
  const { error } = await sb.from('team_settings').upsert({ key: 'nav_order', value: order, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  state.navOrder = order;
  window.dispatchEvent(new Event('nav-order-changed'));
}
