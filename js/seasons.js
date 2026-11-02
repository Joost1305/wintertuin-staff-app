// Seasons for the dish database. A dish without seasons is on the menu all year.
import { lang } from './i18n.js';

export const SEASONS = [
  ['voorjaar', { nl: 'Voorjaar', en: 'Spring' }, [3, 4, 5]],
  ['zomer', { nl: 'Zomer', en: 'Summer' }, [6, 7, 8]],
  ['najaar', { nl: 'Najaar', en: 'Autumn' }, [9, 10, 11]],
  ['winter', { nl: 'Winter', en: 'Winter' }, [12, 1, 2]],
];
export const seasonName = (k) => { const s = SEASONS.find((x) => x[0] === k); return s ? s[1][lang()] || s[1].en : k; };
export const allYear = () => (lang() === 'nl' ? 'Hele jaar' : 'All year');
export const seasonOfDate = (d) => { const m = new Date(d || Date.now()).getMonth() + 1; return (SEASONS.find((s) => s[2].includes(m)) || SEASONS[0])[0]; };
// does the dish fit this season? (no season chosen = every dish; a dish without seasons fits every season)
export const fitsSeason = (m, k) => !k || !(m.seasons || []).length || m.seasons.includes(k);
export const seasonPills = (m) => ((m.seasons || []).length
  ? SEASONS.filter((s) => m.seasons.includes(s[0])).map((s) => `<span class="season-pill s-${s[0]}">${seasonName(s[0])}</span>`).join('')
  : `<span class="season-pill s-all">${allYear()}</span>`);
