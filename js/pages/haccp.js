// HACCP: the registration lists of the Hygiënecode voor de Horeca (KHN forms), filled in on a phone or tablet.
// One set of list definitions drives everything: the form, the check against the norm, the week overview on screen
// and the printed sheet for an inspection, so paper and screen always say the same.
// Every registration is kept in haccp_entries; Settings > HACCP is the archive (per list and week, printable).
// A value outside the norm marks the registration as a deviation and then a corrective action is required.
import { state, isManager, app, esc, fmt, toast, toastError, todayIso, isoOf, nameOf, $, $$, confirmDialog, printHtml } from '../core.js';
import { lang } from '../i18n.js';
import { sb, check } from '../data.js';

// ------------------------------------------------------------------ small helpers
const L = (o) => (o == null ? '' : typeof o === 'string' ? o : (lang() === 'en' ? o.en : o.nl) || o.nl || o.en || '');
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmtNum = (n) => (n == null ? '' : String(n).replace('.', lang() === 'en' ? '.' : ','));
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoOf(d); };
export function mondayOf(iso) { const d = new Date(`${iso}T12:00:00`); const w = d.getDay(); d.setDate(d.getDate() + (w === 0 ? -6 : 1 - w)); return isoOf(d); }
export function isoWeek(iso) {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Thursday of this week
  const jan4 = new Date(d.getFullYear(), 0, 4, 12);
  return { year: d.getFullYear(), week: 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7) };
}
const weekLabel = (mon) => {
  const { week } = isoWeek(mon); const sun = addDays(mon, 6);
  const f = (iso, y) => new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long', ...(y ? { year: 'numeric' } : {}) }).format(new Date(`${iso}T12:00:00`));
  return `${L({ nl: 'Week', en: 'Week' })} ${week} · ${f(mon)} ${L({ nl: 't/m', en: 'to' })} ${f(sun, true)}`;
};
const dayShort = (iso) => new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'nl-NL', { weekday: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));
const timeOf = (ts) => (ts ? new Date(ts).toLocaleTimeString(lang() === 'en' ? 'en-GB' : 'nl-NL', { hour: '2-digit', minute: '2-digit' }) : '');
const nowTime = () => new Date().toTimeString().slice(0, 5);
const minutesBetween = (a, b) => { if (!a || !b) return null; const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); let d = (h2 * 60 + m2) - (h1 * 60 + m1); if (d < 0) d += 24 * 60; return d; };
const YN = { yes: { nl: 'Ja', en: 'Yes' }, no: { nl: 'Nee', en: 'No' }, na: { nl: 'NVT', en: 'N/A' } };

const normText = (n) => {
  if (!n) return '';
  const u = n.unit === 'pH' ? '' : ` ${n.unit || '°C'}`;
  if (n.near != null) return `${fmtNum(n.near)}${u} ± ${fmtNum(n.tol)}`;
  if (n.min != null && n.max != null) return `${fmtNum(n.min)} – ${fmtNum(n.max)}${u}`;
  if (n.max != null) return `${n.unit === 'pH' ? 'pH ' : ''}≤ ${fmtNum(n.max)}${u}${n.note ? ` (${L(n.note)})` : ''}`;
  return `${n.unit === 'pH' ? 'pH ' : ''}≥ ${fmtNum(n.min)}${u}${n.note ? ` (${L(n.note)})` : ''}`;
};

// ------------------------------------------------------------------ the lists (KHN forms)
// field types: text, num (with norm), time, select, supplier (free text with suggestions), yesno, tick
const COOK_KINDS = [
  { v: 'cooked', l: { nl: 'Kerntemperatuur gegaard component', en: 'Core temperature, cooked component' }, norm: { min: 75 } },
  { v: 'regen', l: { nl: 'Kerntemperatuur geregenereerd component', en: 'Core temperature, regenerated component' }, norm: { min: 60 } },
  { v: 'hold', l: { nl: 'Kerntemperatuur in warmhoudvoorziening', en: 'Core temperature, hot holding' }, norm: { min: 60 } },
  { v: 'cool', l: { nl: 'Terugkoelen', en: 'Cooling down' }, norm: { min: 75, note: { nl: 'begin', en: 'start' } } },
  { v: 'fryer', l: { nl: 'Frituur', en: 'Fryer' }, norm: { max: 175 } },
  { v: 'serve_hot', l: { nl: 'Serveertemperatuur warm', en: 'Serving temperature, hot' }, norm: { min: 60 } },
  { v: 'serve_cold', l: { nl: 'Serveertemperatuur koud', en: 'Serving temperature, cold' }, norm: { max: 7 } },
];
const HYGIENE = [
  { g: { nl: 'Registraties', en: 'Records' }, items: [
    { nl: 'Ontvangst (ingangscontrole) ingevuld volgens frequentie', en: 'Receiving check filled in as required' },
    { nl: 'Opslag (temperaturen) ingevuld volgens frequentie', en: 'Storage (temperatures) filled in as required' },
    { nl: 'Bereiden en serveren ingevuld volgens frequentie', en: 'Cooking and serving filled in as required' },
    { nl: 'Sous-vide, aangezuurd en buffet ingevuld', en: 'Sous-vide, acidified and buffet filled in' }] },
  { g: { nl: 'Uitvoering', en: 'Practice' }, items: [
    { nl: 'Geen ongedierte of sporen van vraat; zo nodig bestrijding ingeschakeld', en: 'No pests or signs of gnawing; pest control called in if needed' },
    { nl: 'Producten in FIFO opgeslagen', en: 'Products stored FIFO' },
    { nl: 'Producten afgedekt opgeslagen', en: 'Products stored covered' },
    { nl: 'Producten juist gecodeerd', en: 'Products labelled correctly' },
    { nl: 'Producten gescheiden opgeslagen', en: 'Products stored separately' },
    { nl: 'Juiste persoonlijke hygiëne', en: 'Correct personal hygiene' }] },
  { g: { nl: 'Bedrijfsruimten deugdelijk en schoon', en: 'Premises sound and clean' }, items: [
    { nl: 'Muren', en: 'Walls' }, { nl: 'Deuren', en: 'Doors' }, { nl: 'Vloeren', en: 'Floors' }, { nl: 'Trappen', en: 'Stairs' },
    { nl: 'Plafond', en: 'Ceiling' }, { nl: 'Handenwasgelegenheid', en: 'Hand-washing facilities' }, { nl: 'Werkbanken', en: 'Work surfaces' },
    { nl: 'Sanitair', en: 'Toilets' }, { nl: 'Kleedruimte', en: 'Changing room' }, { nl: 'Koelingen', en: 'Fridges' }, { nl: 'Vriezers', en: 'Freezers' }] },
];
const FREQ = { D: { nl: 'Dagelijks', en: 'Daily' }, W: { nl: 'Wekelijks', en: 'Weekly' }, M: { nl: 'Maandelijks', en: 'Monthly' }, H: { nl: 'Halfjaarlijks', en: 'Twice a year' }, N: { nl: 'Na gebruik', en: 'After use' } };

export const LISTS = {
  temperatures: {
    icon: '&#127777;', layout: 'days',
    title: { nl: 'Registratie temperaturen', en: 'Temperature record' },
    short: { nl: 'Temperaturen', en: 'Temperatures' },
    freq: { nl: 'Dagelijks aflezen van het display en wekelijks meten met een gekalibreerde thermometer. Dagelijks THT, FIFO en schoonmaak beoordelen.', en: 'Read the display daily and measure weekly with a calibrated thermometer. Check best-before, FIFO and cleaning daily.' },
    fields: (cfg) => [
      ...(cfg.equipment || []).map((e) => ({ k: `eq_${e.id}`, label: e.name, type: 'num', req: true, norm: e.kind === 'freeze' ? { max: -18 } : { max: 7 } })),
      { k: 'how', label: { nl: 'Gemeten met', en: 'Measured with' }, type: 'select', opts: [{ v: 'display', l: { nl: 'Display', en: 'Display' } }, { v: 'thermo', l: { nl: 'Gekalibreerde thermometer', en: 'Calibrated thermometer' } }] },
      { k: 'fifo', label: { nl: 'THT, FIFO en juiste scheiding', en: 'Best-before, FIFO and separation' }, type: 'yesno', req: true },
      { k: 'covered', label: { nl: 'Afgedekt en gecodeerd', en: 'Covered and labelled' }, type: 'yesno', req: true },
      { k: 'cleaned', label: { nl: 'Reiniging volgens schoonmaakrooster', en: 'Cleaning as per schedule' }, type: 'yesno', req: true },
      { k: 'dw_wash', label: { nl: 'Vaatwasser wastemperatuur (display)', en: 'Dishwasher wash temperature (display)' }, type: 'num', norm: { min: 60 } },
      { k: 'dw_rinse', label: { nl: 'Vaatwasser naspoeltemperatuur (display)', en: 'Dishwasher rinse temperature (display)' }, type: 'num', norm: { min: 80 } },
    ],
  },
  receiving: {
    icon: '&#128666;', layout: 'rows',
    title: { nl: 'Registratie ingangscontrole', en: 'Receiving check' },
    short: { nl: 'Ingangscontrole', en: 'Receiving check' },
    freq: { nl: 'Alle leveranciers minimaal 1 maal per week. Gekoeld 2 tot 7 °C, diepvries −18 °C (maximaal −15 °C).', en: 'Every supplier at least once a week. Chilled 2 to 7 °C, frozen −18 °C (max. −15 °C).' },
    fields: () => [
      { k: 'supplier', label: { nl: 'Leverancier', en: 'Supplier' }, type: 'supplier', req: true },
      { k: 'product', label: { nl: 'Product', en: 'Product' }, type: 'text', req: true },
      { k: 'kind', label: { nl: 'Soort', en: 'Type' }, type: 'select', req: true, opts: [{ v: 'V', l: { nl: 'V, vers / gekoeld', en: 'F, fresh / chilled' } }, { v: 'D', l: { nl: 'D, diepvries', en: 'Z, frozen' } }, { v: 'C', l: { nl: 'C, conserven / droge waren', en: 'D, tins / dry goods' } }] },
      { k: 'temp', label: { nl: 'Temperatuur', en: 'Temperature' }, type: 'num', req: true, show: (d) => d.kind !== 'C', norm: (d) => (d.kind === 'D' ? { max: -15, note: { nl: 'streef −18', en: 'aim −18' } } : { max: 7 }) },
      { k: 'tht', label: { nl: 'THT / houdbaarheid in orde', en: 'Best-before in order' }, type: 'yesno', req: true },
      { k: 'pack', label: { nl: 'Verpakking schoon, droog en heel', en: 'Packaging clean, dry and intact' }, type: 'yesno', req: true },
    ],
  },
  cooking: {
    icon: '&#127859;', layout: 'rows',
    title: { nl: 'Registratie bereiden / serveren', en: 'Cooking and serving record' },
    short: { nl: 'Bereiden en serveren', en: 'Cooking and serving' },
    freq: { nl: '1 maal per week per onderdeel dat jullie gebruiken; frituur elke frituur 1 maal per week.', en: 'Once a week for each part you use; every fryer once a week.' },
    fields: () => [
      { k: 'kind', label: { nl: 'Onderdeel', en: 'Part' }, type: 'select', req: true, opts: COOK_KINDS.map((c) => ({ v: c.v, l: c.l })) },
      { k: 'product', label: { nl: 'Product (of welke frituur)', en: 'Product (or which fryer)' }, type: 'text', req: true },
      { k: 'start', label: { nl: 'Begintijd', en: 'Start time' }, type: 'time', show: (d) => d.kind === 'cool' },
      { k: 'temp', label: { nl: 'Temperatuur', en: 'Temperature' }, type: 'num', req: true, norm: (d) => (COOK_KINDS.find((c) => c.v === d.kind) || {}).norm },
      { k: 't2', label: { nl: 'Na 2 uur (richtwaarde)', en: 'After 2 hours (guide)' }, type: 'num', show: (d) => d.kind === 'cool', norm: { max: 20 } },
      { k: 't5', label: { nl: 'Na 5 uur (norm)', en: 'After 5 hours (norm)' }, type: 'num', show: (d) => d.kind === 'cool', norm: { max: 7 } },
      { k: 'minutes', label: { nl: 'Regenereertijd', en: 'Regeneration time' }, type: 'num', unit: 'min', show: (d) => d.kind === 'regen', norm: { max: 60, unit: 'min' } },
    ],
  },
  cleaning: {
    icon: '&#129532;', layout: 'grid', noAction: true,
    title: { nl: 'Registratie schoonmaakrooster', en: 'Cleaning schedule' },
    short: { nl: 'Schoonmaakrooster', en: 'Cleaning schedule' },
    freq: { nl: 'Afvinken zodra het schoon is. Wekelijks controleren en aftekenen.', en: 'Tick off once it is clean. Check and sign off weekly.' },
    fields: (cfg) => (cfg.cleaning || []).map((o) => ({ k: `o_${o.id}`, label: o.name, type: 'tick', meta: o })),
  },
  thermometers: {
    icon: '&#127777;&#65039;', layout: 'rows',
    title: { nl: 'Registratielijst testen thermometers', en: 'Thermometer test record' },
    short: { nl: 'Thermometers testen', en: 'Thermometer test' },
    freq: { nl: '1 maal per 3 maanden (wettelijk minimaal jaarlijks kalibreren). Afwijking groter dan 1,0 °C: laten kalibreren of vervangen.', en: 'Every 3 months (by law at least yearly). Deviation over 1.0 °C: have it calibrated or replace it.' },
    fields: () => [
      { k: 'thermo', label: { nl: 'Thermometer', en: 'Thermometer' }, type: 'text', req: true },
      { k: 'boil', label: { nl: 'Kokend water', en: 'Boiling water' }, type: 'num', req: true, norm: { near: 100, tol: 1 } },
      { k: 'ice', label: { nl: 'Smeltend ijs', en: 'Melting ice' }, type: 'num', req: true, norm: { near: 0, tol: 1 } },
    ],
  },
  hygiene: {
    icon: '&#128269;', layout: 'check',
    title: { nl: 'Registratielijst periodieke hygiënecontrole', en: 'Periodic hygiene inspection' },
    short: { nl: 'Hygiënecontrole', en: 'Hygiene inspection' },
    freq: { nl: 'Wekelijks door de verantwoordelijke. Noteer verbeterpunten bij elke Nee.', en: 'Weekly by the person in charge. Note improvements for every No.' },
    fields: () => [
      ...HYGIENE.flatMap((g, gi) => g.items.map((it, i) => ({ k: `h${gi}_${i}`, label: it, type: 'yesno', na: true, req: true, group: g.g }))),
    ],
  },
  suppliers: {
    icon: '&#9989;', layout: 'suppliers',
    title: { nl: 'Registratielijst goedgekeurde leveranciers', en: 'Approved suppliers' },
    short: { nl: 'Goedgekeurde leveranciers', en: 'Approved suppliers' },
    freq: { nl: 'Bijhouden in Instellingen, HACCP. Alleen inkopen bij goedgekeurde leveranciers.', en: 'Kept in Settings, HACCP. Only buy from approved suppliers.' },
    fields: () => [],
  },
  sousvide: {
    icon: '&#127777;', layout: 'rows',
    title: { nl: 'Productieregistratielijst sous-vide-bereiding', en: 'Sous-vide production record' },
    short: { nl: 'Sous-vide', en: 'Sous-vide' },
    freq: { nl: 'Elke productierun. Zie de bereidingstabellen sous-vide. Nooit bereiden onder 60 °C.', en: 'Every production run. See the sous-vide tables. Never cook below 60 °C.' },
    fields: () => [
      { k: 'product', label: { nl: 'Product', en: 'Product' }, type: 'text', req: true },
      { k: 'thick', label: { nl: 'Dikte product', en: 'Thickness' }, type: 'num', unit: 'mm' },
      { k: 'bath', label: { nl: 'Waterbadtemperatuur', en: 'Water bath temperature' }, type: 'num', req: true, norm: { min: 60 } },
      { k: 'core', label: { nl: 'Kerntemperatuur', en: 'Core temperature' }, type: 'num', req: true },
      { k: 'minutes', label: { nl: 'Verhittingstijd', en: 'Cooking time' }, type: 'num', unit: 'min', req: true },
    ],
  },
  acidified: {
    icon: '&#129362;', layout: 'rows',
    title: { nl: 'Productieregistratielijst aangezuurde producten', en: 'Acidified products record' },
    short: { nl: 'Aangezuurd / fermenteren', en: 'Acidified / fermented' },
    freq: { nl: 'Elke aangemaakte batch of product. Norm pH 4,2 of lager.', en: 'Every batch or product. Norm pH 4.2 or lower.' },
    fields: () => [
      { k: 'product', label: { nl: 'Product', en: 'Product' }, type: 'text', req: true },
      { k: 'time', label: { nl: 'Tijdstip aanmaak', en: 'Time made' }, type: 'time' },
      { k: 'ph', label: { nl: 'pH', en: 'pH' }, type: 'num', unit: 'pH', req: true, norm: { max: 4.2, unit: 'pH' } },
    ],
  },
  buffet: {
    icon: '&#127869;', layout: 'buffet',
    title: { nl: 'Borgingslijst ongekoelde presentatie, tijdregistratie', en: 'Unchilled presentation, time record' },
    short: { nl: 'Buffet / ongekoeld presenteren', en: 'Buffet / unchilled display' },
    freq: { nl: 'Maximaal 2 uur presenteren na start. Begin elke dag met batch 1 voor elk soort product. Sluit elke presentatie af.', en: 'Present for 2 hours at most after the start. Start every day with batch 1 for each product. Close every presentation.' },
    fields: () => [
      { k: 'location', label: { nl: 'Locatie', en: 'Location' }, type: 'text' },
      { k: 'product', label: { nl: 'Maaltijdcomponent / product', en: 'Dish component / product' }, type: 'text', req: true },
      { k: 'batch', label: { nl: 'Batch nr.', en: 'Batch no.' }, type: 'num', unit: '#' },
      { k: 'qty', label: { nl: 'Aantal', en: 'Quantity' }, type: 'num', unit: '#' },
      { k: 'start', label: { nl: 'Uit koeling / start presentatie', en: 'Out of the fridge / start' }, type: 'time', req: true },
      { k: 'cold', label: { nl: 'Temperatuur gekoeld product voor presentatie max. 7 °C', en: 'Chilled product at most 7 °C before display' }, type: 'yesno', na: true, req: true },
      { k: 'guard', label: { nl: 'Besmetting door gasten voldoende voorkomen', en: 'Contamination by guests prevented' }, type: 'yesno', req: true },
    ],
  },
};
export const LIST_ORDER = ['temperatures', 'receiving', 'cooking', 'cleaning', 'thermometers', 'hygiene', 'suppliers', 'sousvide', 'acidified', 'buffet'];

// ------------------------------------------------------------------ data
let cfg = { equipment: [], cleaning: [], suppliers: [], lists: LIST_ORDER };
export async function loadConfig() {
  const rows = check(await sb.from('haccp_config').select('*')) || [];
  const c = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cfg = { equipment: c.equipment || [], cleaning: c.cleaning || [], suppliers: c.suppliers || [], lists: c.lists || LIST_ORDER };
  return cfg;
}
export const enabledLists = () => LIST_ORDER.filter((k) => (cfg.lists || LIST_ORDER).includes(k));
async function loadWeek(keys, mon) {
  const want = keys.includes('buffet') ? [...keys, 'buffet_end'] : keys;
  return check(await sb.from('haccp_entries').select('*').in('list_key', want).gte('entry_date', mon).lte('entry_date', addDays(mon, 6))
    .order('entry_date').order('created_at')) || [];
}

// ------------------------------------------------------------------ norms
function normOf(f, d) { return typeof f.norm === 'function' ? f.norm(d) : f.norm; }
const shown = (f, d) => !f.show || f.show(d);
// 'ok', 'bad' or null (nothing to judge)
function judge(f, d) {
  if (!shown(f, d)) return null;
  const v = d[f.k];
  if (f.type === 'num') {
    const n = num(v); const nm = normOf(f, d); if (n == null || !nm) return null;
    if (nm.near != null) return Math.abs(n - nm.near) > nm.tol ? 'bad' : 'ok';
    if (nm.max != null && n > nm.max) return 'bad';
    if (nm.min != null && n < nm.min) return 'bad';
    return 'ok';
  }
  if (f.type === 'yesno') { if (!v || v === 'na') return null; return v === 'yes' ? 'ok' : 'bad'; }
  return null;
}
const deviations = (def, d) => def.fields(cfg).filter((f) => judge(f, d) === 'bad');
const missing = (def, d) => def.fields(cfg).filter((f) => f.req && shown(f, d) && (d[f.k] == null || d[f.k] === ''));

// buffet: a presentation is closed by a separate 'buffet_end' registration, so a colleague can close it too
function buffetRows(entries) {
  const ends = entries.filter((e) => e.list_key === 'buffet_end');
  return entries.filter((e) => e.list_key === 'buffet').map((e) => {
    const end = ends.find((x) => x.data.start_id === e.id) || null;
    const mins = end ? minutesBetween(e.data.start, end.data.end) : null;
    const over = mins != null && mins > 120;
    return { e, end, mins, over, bad: over || e.ok === false || (end && end.ok === false) };
  });
}

// ------------------------------------------------------------------ the page
let week = null; // Monday of the week shown
export async function renderHaccp(args = []) {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  if (!week) week = mondayOf(todayIso());
  try {
    await loadConfig();
    const key = args[0];
    if (key && LISTS[key] && enabledLists().includes(key)) await renderList(key);
    else await renderOverview();
  } catch (e) { toastError(e); }
}
const weekNav = () => `<div class="hc-week"><button type="button" class="btn-sm" data-wk="-7" aria-label="${L({ nl: 'Vorige week', en: 'Previous week' })}">&#8249;</button>
  <button type="button" class="btn-sm" data-wk="0">${L({ nl: 'Deze week', en: 'This week' })}</button>
  <button type="button" class="btn-sm" data-wk="7" aria-label="${L({ nl: 'Volgende week', en: 'Next week' })}">&#8250;</button>
  <strong>${esc(weekLabel(week))}</strong></div>`;
function bindWeekNav(redraw) {
  $$('[data-wk]').forEach((b) => (b.onclick = () => { const n = Number(b.dataset.wk); week = n ? addDays(week, n) : mondayOf(todayIso()); redraw(); }));
}

// What each tile says: how often it must be done, and how far you are this week
const SHORT_FREQ = {
  temperatures: { nl: 'Dagelijks', en: 'Daily' },
  receiving: { nl: 'Wekelijks per leverancier', en: 'Weekly per supplier' },
  cooking: { nl: 'Wekelijks per onderdeel', en: 'Weekly per part' },
  cleaning: { nl: 'Dagelijks afvinken', en: 'Tick off daily' },
  thermometers: { nl: 'Elke 3 maanden', en: 'Every 3 months' },
  hygiene: { nl: 'Wekelijks', en: 'Weekly' },
  suppliers: { nl: 'Bijhouden', en: 'Keep up to date' },
  sousvide: { nl: 'Elke productierun', en: 'Every production run' },
  acidified: { nl: 'Elke batch', en: 'Every batch' },
  buffet: { nl: 'Elke presentatie, max. 2 uur', en: 'Every display, max. 2 hours' },
};
function tileStatus(k, entries, ctx) {
  const mine = entries.filter((e) => e.list_key === k);
  const bad = k === 'buffet' ? buffetRows(entries).filter((r) => r.bad).length : mine.filter((e) => e.ok === false).length;
  const out = (txt, cls) => {
    if (bad) { txt += L({ nl: ` · ${bad} afwijking${bad > 1 ? 'en' : ''}`, en: ` · ${bad} deviation${bad > 1 ? 's' : ''}` }); cls = 'bad'; }
    return { txt, cls };
  };
  const dayCount = new Set(mine.map((e) => e.entry_date)).size;
  switch (k) {
    case 'temperatures': case 'cleaning':
      return out(L({ nl: `${dayCount} van ${ctx.days} dagen gedaan`, en: `${dayCount} of ${ctx.days} days done` }), dayCount >= ctx.days ? 'ok' : 'todo');
    case 'receiving': {
      const names = new Set(mine.map((e) => String(e.data.supplier || '').trim().toLowerCase()).filter(Boolean));
      const total = cfg.suppliers.length;
      const checked = total ? cfg.suppliers.filter((x) => names.has(x.name.trim().toLowerCase())).length : names.size;
      return out(total ? L({ nl: `${checked} van ${total} leveranciers gecontroleerd`, en: `${checked} of ${total} suppliers checked` })
        : L({ nl: `${mine.length} controles`, en: `${mine.length} checks` }), total ? (checked >= total ? 'ok' : 'todo') : (mine.length ? 'ok' : 'todo'));
    }
    case 'cooking': {
      const parts = new Set(mine.map((e) => e.data.kind)).size;
      return out(parts ? L({ nl: `${parts} onderdel${parts > 1 ? 'en' : ''} gemeten`, en: `${parts} part${parts > 1 ? 's' : ''} measured` }) : L({ nl: 'Nog niets gemeten', en: 'Nothing measured yet' }), parts ? 'ok' : 'todo');
    }
    case 'hygiene':
      return out(mine.length ? L({ nl: 'Gedaan', en: 'Done' }) : L({ nl: 'Nog niet gedaan', en: 'Not done yet' }), mine.length ? 'ok' : 'todo');
    case 'thermometers': {
      const last = ctx.lastThermo;
      if (!last) return out(L({ nl: 'Nog nooit getest', en: 'Never tested yet' }), 'todo');
      const due = addDays(last, 91);
      const f = (iso) => new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));
      const overdue = due < todayIso();
      return out(overdue ? L({ nl: `Te laat: was vóór ${f(due)}`, en: `Overdue: was due ${f(due)}` }) : L({ nl: `Laatst ${f(last)}, volgende vóór ${f(due)}`, en: `Last ${f(last)}, next before ${f(due)}` }), overdue ? 'bad' : 'ok');
    }
    case 'suppliers':
      return { txt: L({ nl: `${cfg.suppliers.length} goedgekeurd`, en: `${cfg.suppliers.length} approved` }), cls: '' };
    case 'buffet': {
      const rows = buffetRows(entries); const open = rows.filter((r) => !r.end).length;
      return out(L({ nl: `${rows.length} deze week`, en: `${rows.length} this week` }) + (open ? L({ nl: ` · ${open} open`, en: ` · ${open} open` }) : ''), open ? 'todo' : '');
    }
    default: // sousvide, acidified: as often as you make it
      return out(L({ nl: `${mine.length} deze week`, en: `${mine.length} this week` }), '');
  }
}

async function renderOverview() {
  const keys = enabledLists();
  const entries = await loadWeek(keys.filter((k) => k !== 'suppliers'), week);
  const isThisWeek = week === mondayOf(todayIso());
  const days = isThisWeek ? Math.min(7, Math.round((new Date(`${todayIso()}T12:00:00`) - new Date(`${week}T12:00:00`)) / 864e5) + 1) : 7;
  let lastThermo = null;
  if (keys.includes('thermometers')) {
    const r = check(await sb.from('haccp_entries').select('entry_date').eq('list_key', 'thermometers').order('entry_date', { ascending: false }).limit(1)) || [];
    lastThermo = r[0] ? r[0].entry_date : null;
  }
  app().innerHTML = `
    <div class="page-head"><div><h1>HACCP</h1><div class="muted small">${L({ nl: 'Registraties volgens de Hygiënecode voor de Horeca. Alles wordt automatisch bewaard; managers vinden het archief onder Instellingen, HACCP.', en: 'Records under the Hygiënecode voor de Horeca. Everything is saved automatically; managers find the archive under Settings, HACCP.' })}</div></div>
      <div class="page-actions"><button type="button" class="btn-sm" id="hc-print-all">&#128424; ${L({ nl: 'Print deze week (alle lijsten)', en: 'Print this week (all lists)' })}</button></div></div>
    ${weekNav()}
    <div class="hc-tiles">${keys.map((k) => {
      const def = LISTS[k]; const st = tileStatus(k, entries, { days, lastThermo });
      return `<a class="card hc-tile" href="#/haccp/${k}"><span class="hc-ico" aria-hidden="true">${def.icon}</span>
        <span class="hc-tt"><strong>${esc(L(def.short))}</strong><span class="hc-freq">${esc(L(SHORT_FREQ[k]))}</span><span class="hc-st ${st.cls}">${esc(st.txt)}</span></span><span aria-hidden="true" class="hc-go">&#8250;</span></a>`;
    }).join('')}</div>`;
  bindWeekNav(renderOverview);
  $('#hc-print-all').onclick = () => printWeek(keys, week);
}

async function renderList(key) {
  const def = LISTS[key];
  const entries = key === 'suppliers' ? [] : await loadWeek([key], week);
  app().innerHTML = `
    <div class="page-head"><div><a class="small" href="#/haccp">&#8249; HACCP</a><h1>${esc(L(def.short))}</h1><div class="muted small">${esc(L(def.freq))}</div></div>
      <div class="page-actions"><button type="button" class="btn-sm" id="hc-print">&#128424; ${L({ nl: 'Print week', en: 'Print week' })}</button></div></div>
    ${key === 'suppliers' ? '' : `<div class="card hc-form-card"><h2 style="margin-top:0">${L(key === 'cleaning' ? { nl: 'Vandaag afvinken', en: 'Tick off today' } : { nl: 'Nieuwe registratie', en: 'New record' })}</h2><div id="hc-form"></div></div>`}
    ${key === 'suppliers' ? '' : weekNav()}
    <div class="card"><div class="table-wrap">${weekTable(key, entries, week, false)}</div>
      ${key !== 'suppliers' ? entryList(key, entries) : (isManager() ? `<p class="small"><a href="#/settings/haccp">${L({ nl: 'Leveranciers beheren in Instellingen, HACCP', en: 'Manage suppliers in Settings, HACCP' })}</a></p>` : '')}</div>`;
  if (key !== 'suppliers') { bindWeekNav(() => renderList(key)); drawForm(key, entries); }
  $('#hc-print').onclick = () => printWeek([key], week);
  bindEntryActions(key, entries);
}

// ------------------------------------------------------------------ form
function fieldInput(f, d) {
  const v = d[f.k] ?? '';
  const nm = f.norm ? normOf(f, d) : null;
  const unit = f.type === 'num' ? (f.unit || (nm && nm.unit) || '°C') : '';
  let input = '';
  if (f.type === 'text') input = `<input name="${f.k}" value="${esc(v)}" autocomplete="off">`;
  if (f.type === 'supplier') input = `<input name="${f.k}" value="${esc(v)}" list="hc-sup" autocomplete="off"><datalist id="hc-sup">${cfg.suppliers.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>`;
  if (f.type === 'num') input = `<span class="hc-num"><input name="${f.k}" value="${esc(fmtNum(v))}" inputmode="decimal" autocomplete="off"><span>${unit === '#' ? '' : esc(unit)}</span></span>`;
  if (f.type === 'time') input = `<input type="time" name="${f.k}" value="${esc(v)}">`;
  if (f.type === 'select') input = `<select name="${f.k}"><option value=""></option>${f.opts.map((o) => `<option value="${o.v}" ${o.v === v ? 'selected' : ''}>${esc(L(o.l))}</option>`).join('')}</select>`;
  if (f.type === 'yesno') input = `<span class="hc-yn" role="radiogroup">${['yes', 'no', ...(f.na ? ['na'] : [])].map((o) => `<label class="${o}"><input type="radio" name="${f.k}" value="${o}" ${v === o ? 'checked' : ''}><span>${esc(L(YN[o]))}</span></label>`).join('')}</span>`;
  if (f.type === 'tick') input = `<input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}>`;
  const normTxt = nm ? normText({ ...nm, unit: nm.unit || (unit === 'min' ? 'min' : unit === 'pH' ? 'pH' : '°C') }) : '';
  return `<div class="hc-field ${f.type === 'tick' ? 'tick' : ''}" data-field="${f.k}" ${shown(f, d) ? '' : 'hidden'}>
    <label>${esc(L(f.label))}${f.req ? '' : ` <span class="muted tiny">${L({ nl: '(optioneel)', en: '(optional)' })}</span>`}${normTxt ? ` <span class="hc-norm">${esc(normTxt)}</span>` : ''}</label>${input}</div>`;
}

function drawForm(key, entries) {
  const def = LISTS[key];
  const el = $('#hc-form');
  const today = todayIso();
  if (key === 'cleaning') return drawCleaningForm(entries);
  const fields = def.fields(cfg);
  if (!fields.length) { el.innerHTML = `<div class="note">${L({ nl: 'Voeg eerst koelingen en vriezers toe in Instellingen, HACCP.', en: 'First add fridges and freezers in Settings, HACCP.' })}</div>`; return; }
  const done = key === 'temperatures' ? entries.filter((e) => e.entry_date === today) : [];
  let d = key === 'buffet' ? { start: nowTime(), batch: String(entries.filter((e) => e.list_key === 'buffet' && e.entry_date === today).length + 1) } : {};
  let lastGroup = null;
  el.innerHTML = `${done.length ? `<div class="note" style="margin:0 0 10px">${L({ nl: 'Vandaag al ingevuld door', en: 'Already filled in today by' })} ${done.map((e) => `${esc(nameOf(e.staff_id))} (${timeOf(e.created_at)})`).join(', ')}.</div>` : ''}
    <form id="hc-f" novalidate>
      <div class="hc-field"><label>${L({ nl: 'Datum', en: 'Date' })}</label><input type="date" name="__date" value="${today}" max="${today}"></div>
      <div class="hc-grid">${fields.map((f) => { const g = f.group && L(f.group) !== lastGroup ? `<div class="hc-group">${esc(L(f.group))}</div>` : ''; lastGroup = f.group ? L(f.group) : lastGroup; return g + fieldInput(f, d); }).join('')}</div>
      <div class="hc-dev" hidden></div>
      <div class="hc-field" data-action ${def.noAction ? 'hidden' : 'hidden'}><label>${L(key === 'hygiene' ? { nl: 'Verbeterpunten / corrigerende maatregel', en: 'Improvements / corrective action' } : { nl: 'Corrigerende maatregel', en: 'Corrective action' })}</label>
        <textarea name="__action" rows="2" placeholder="${esc(L({ nl: 'Wat heb je gedaan? Bijv. product weggegooid, monteur gebeld, opnieuw gemeten om 14:00', en: 'What did you do? E.g. product thrown away, engineer called, measured again at 14:00' }))}"></textarea></div>
      <button class="btn-primary" type="submit">${L({ nl: 'Opslaan', en: 'Save' })}</button>
    </form>`;
  const f = $('#hc-f');
  const read = () => {
    const out = {};
    fields.forEach((x) => {
      if (x.type === 'yesno') { const c = f.querySelector(`[name="${x.k}"]:checked`); out[x.k] = c ? c.value : ''; return; }
      if (x.type === 'tick') { out[x.k] = f[x.k].checked; return; }
      const v = f[x.k].value.trim();
      out[x.k] = x.type === 'num' ? (num(v) ?? (v === '' ? '' : v)) : v;
    });
    return out;
  };
  const refresh = () => {
    d = read();
    fields.forEach((x) => { const w = f.querySelector(`[data-field="${x.k}"]`); w.hidden = !shown(x, d); w.classList.toggle('bad', judge(x, d) === 'bad'); w.classList.toggle('good', judge(x, d) === 'ok'); });
    const devs = deviations(def, d);
    const box = f.querySelector('.hc-dev');
    box.hidden = !devs.length;
    box.innerHTML = devs.length ? `<strong>${L({ nl: 'Afwijking', en: 'Deviation' })}:</strong> ${devs.map((x) => esc(L(x.label))).join(', ')}. ${L({ nl: 'Vul hieronder in wat je hebt gedaan.', en: 'Note below what you did.' })}` : '';
    f.querySelector('[data-action]').hidden = !(devs.length || key === 'hygiene');
  };
  f.oninput = refresh; f.onchange = refresh; refresh();
  f.onsubmit = async (e) => {
    e.preventDefault(); d = read();
    const miss = missing(def, d);
    if (miss.length) { toastError(new Error(`${L({ nl: 'Nog invullen', en: 'Still to fill in' })}: ${miss.map((x) => L(x.label)).join(', ')}`)); return; }
    for (const x of fields) if (x.type === 'num' && d[x.k] !== '' && num(d[x.k]) == null) { toastError(new Error(`${L(x.label)}: ${L({ nl: 'geen getal', en: 'not a number' })}`)); return; }
    const devs = deviations(def, d);
    const action = f.__action.value.trim();
    if (devs.length && !action && !def.noAction) { toastError(new Error(L({ nl: 'Er is een afwijking: vul de corrigerende maatregel in.', en: 'There is a deviation: fill in the corrective action.' }))); f.__action.focus(); return; }
    const date = f.__date.value || today;
    try {
      check(await sb.from('haccp_entries').insert({ list_key: key, entry_date: date, data: d, ok: !devs.length, action: action || null, staff_id: state.me.id }));
      toast(devs.length ? L({ nl: 'Opgeslagen, met afwijking', en: 'Saved, with a deviation' }) : L({ nl: 'Opgeslagen', en: 'Saved' }));
      if (date < week || date > addDays(week, 6)) week = mondayOf(date);
      renderList(key);
    } catch (err) { toastError(err); }
  };
}

function drawCleaningForm(entries) {
  const today = todayIso();
  const fields = LISTS.cleaning.fields(cfg);
  const doneToday = new Set(entries.filter((e) => e.list_key === 'cleaning' && e.entry_date === today).flatMap((e) => Object.keys(e.data).filter((k) => e.data[k])));
  const groups = ['D', 'N', 'W', 'M', 'H'];
  $('#hc-form').innerHTML = !fields.length ? `<div class="note">${L({ nl: 'Voeg eerst schoonmaakobjecten toe in Instellingen, HACCP.', en: 'First add cleaning items in Settings, HACCP.' })}</div>`
    : `<form id="hc-f">${groups.map((g) => { const list = fields.filter((x) => x.meta.freq === g); if (!list.length) return '';
      return `<div class="hc-group">${esc(L(FREQ[g]))}</div><div class="hc-ticks">${list.map((x) => `<label class="hc-tickrow ${doneToday.has(x.k) ? 'done' : ''}"><input type="checkbox" name="${x.k}" ${doneToday.has(x.k) ? 'checked disabled' : ''}>
        <span>${esc(x.label)}<span class="tiny muted"> · ${[x.meta.clean ? L({ nl: 'reinigen', en: 'clean' }) : '', x.meta.disinfect ? L({ nl: 'desinfecteren', en: 'disinfect' }) : ''].filter(Boolean).join(' + ')}</span></span></label>`).join('')}</div>`; }).join('')}
      <button class="btn-primary" type="submit" style="margin-top:10px">${L({ nl: 'Afvinken opslaan', en: 'Save ticks' })}</button></form>`;
  const f = $('#hc-f'); if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const data = {}; fields.forEach((x) => { const i = f[x.k]; if (i && i.checked && !i.disabled) data[x.k] = true; });
    if (!Object.keys(data).length) { toastError(new Error(L({ nl: 'Vink eerst aan wat schoon is.', en: 'First tick what is clean.' }))); return; }
    try { check(await sb.from('haccp_entries').insert({ list_key: 'cleaning', entry_date: today, data, ok: true, staff_id: state.me.id })); toast(L({ nl: 'Opgeslagen', en: 'Saved' })); week = mondayOf(today); renderList('cleaning'); } catch (err) { toastError(err); }
  };
}

// ------------------------------------------------------------------ week tables (screen and print share these)
function cell(f, d) {
  if (!shown(f, d)) return '';
  const v = d[f.k];
  if (v == null || v === '') return '';
  const j = judge(f, d);
  let txt = v;
  if (f.type === 'num') txt = fmtNum(v);
  if (f.type === 'yesno') txt = L(YN[v]);
  if (f.type === 'select') txt = L((f.opts.find((o) => o.v === v) || {}).l) || v;
  if (f.type === 'tick') txt = v ? '&#10003;' : '';
  return `<span class="${j === 'bad' ? 'hc-bad' : ''}">${f.type === 'tick' ? txt : esc(String(txt))}</span>`;
}
const initials = (id) => nameOf(id).split(/\s+/).map((p) => p[0]).join('').toUpperCase();

export function weekTable(key, entries, mon, forPrint) {
  const def = LISTS[key];
  const fields = def.fields(cfg);
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const none = `<p class="muted">${L({ nl: 'Geen registraties in deze week.', en: 'No records this week.' })}</p>`;
  if (def.layout === 'suppliers') {
    return cfg.suppliers.length ? `<table class="hc-t"><thead><tr><th>${L({ nl: 'Naam leverancier', en: 'Supplier' })}</th><th>${L({ nl: 'Leverancier van', en: 'Supplies' })}</th><th>${L({ nl: 'Bijzonderheden', en: 'Notes' })}</th></tr></thead>
      <tbody>${cfg.suppliers.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.supplies || '')}</td><td>${esc(s.notes || '')}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">${L({ nl: 'Nog geen leveranciers. Voeg ze toe in Instellingen, HACCP.', en: 'No suppliers yet. Add them in Settings, HACCP.' })}</p>`;
  }
  const mine = entries.filter((e) => e.list_key === key);
  if (def.layout === 'days' || def.layout === 'grid') {
    // rows = what was measured, columns = the 7 days (as on the KHN form); several entries on one day are combined
    const byDay = Object.fromEntries(days.map((dd) => [dd, mine.filter((e) => e.entry_date === dd)]));
    const valueOn = (f, dd) => {
      const list = byDay[dd]; if (!list.length) return '';
      if (f.type === 'tick') return list.some((e) => e.data[f.k]) ? '&#10003;' : '';
      return list.map((e) => cell(f, e.data)).filter(Boolean).join(' / ');
    };
    const extra = def.layout === 'grid'
      ? `<th>${L({ nl: 'Methode', en: 'Method' })}</th><th>${L({ nl: 'Freq.', en: 'Freq.' })}</th>` : `<th>${L({ nl: 'Norm', en: 'Norm' })}</th>`;
    const rows = fields.map((f) => {
      const nm = f.norm ? normOf(f, {}) : null;
      const mid = def.layout === 'grid'
        ? `<td class="small">${[f.meta.clean ? 'R' : '', f.meta.disinfect ? 'D' : ''].filter(Boolean).join(' + ')}</td><td class="small">${esc(f.meta.freq)}</td>`
        : `<td class="small">${esc(nm ? normText(nm) : f.type === 'yesno' ? L(YN.yes) : '')}</td>`;
      return `<tr><td>${esc(L(f.label))}</td>${mid}${days.map((dd) => `<td class="c">${valueOn(f, dd)}</td>`).join('')}</tr>`;
    }).join('');
    const sign = `<tr class="hc-sign"><td>${L({ nl: 'Paraaf', en: 'Initials' })}</td><td></td>${def.layout === 'grid' ? '<td></td>' : ''}${days.map((dd) => `<td class="c small">${[...new Set(byDay[dd].map((e) => initials(e.staff_id)))].join(', ')}</td>`).join('')}</tr>`;
    const legend = def.layout === 'grid' ? `<p class="tiny muted">R = ${L({ nl: 'reinigen', en: 'clean' })}, D = ${L({ nl: 'desinfecteren', en: 'disinfect' })} · ${Object.entries(FREQ).map(([k, v]) => `${k} = ${L(v)}`).join(', ')}</p>` : '';
    const actions = mine.filter((e) => e.action).map((e) => `<li>${esc(dayShort(e.entry_date))}: ${esc(e.action)} (${esc(nameOf(e.staff_id))})</li>`).join('');
    return `<table class="hc-t hc-days"><thead><tr><th></th>${extra}${days.map((dd) => `<th class="c">${esc(dayShort(dd))}</th>`).join('')}</tr></thead><tbody>${rows}${sign}</tbody></table>${legend}
      ${actions ? `<div class="hc-actions"><strong>${L({ nl: 'Opmerkingen / corrigerende maatregelen', en: 'Notes / corrective actions' })}</strong><ul>${actions}</ul></div>` : ''}
      ${forPrint && def.layout === 'grid' ? `<p class="small" style="margin-top:14px">${L({ nl: 'Wekelijkse controle uitgevoerd door (naam)', en: 'Weekly check done by (name)' })}: ________________________________</p>` : ''}`;
  }
  if (def.layout === 'check') {
    if (!mine.length) return none;
    // one column per inspection this week (usually one)
    let lastGroup = null;
    return `<table class="hc-t"><thead><tr><th></th>${mine.map((e) => `<th class="c">${esc(dayShort(e.entry_date))}<br><span class="small">${esc(initials(e.staff_id))}</span></th>`).join('')}</tr></thead><tbody>
      ${fields.map((f) => { const g = L(f.group) !== lastGroup ? `<tr class="hc-grp"><td colspan="${mine.length + 1}">${esc(L(f.group))}</td></tr>` : ''; lastGroup = L(f.group);
        return `${g}<tr><td>${esc(L(f.label))}</td>${mine.map((e) => `<td class="c">${cell(f, e.data)}</td>`).join('')}</tr>`; }).join('')}
      <tr><td>${L({ nl: 'Verbeterpunten', en: 'Improvements' })}</td>${mine.map((e) => `<td class="small">${esc(e.action || '')}</td>`).join('')}</tr></tbody></table>`;
  }
  if (def.layout === 'buffet') {
    const rows = buffetRows(entries);
    if (!rows.length) return none;
    return `<table class="hc-t"><thead><tr><th>${L({ nl: 'Datum', en: 'Date' })}</th>${fields.map((f) => `<th>${esc(L(f.label))}</th>`).join('')}<th>${L({ nl: 'Einde', en: 'End' })}</th><th>${L({ nl: 'Aantal over', en: 'Left over' })}</th><th>${L({ nl: 'Duur', en: 'Duration' })}</th><th>${L({ nl: 'Paraaf', en: 'Initials' })}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.bad ? 'hc-rowbad' : ''}"><td>${esc(dayShort(r.e.entry_date))}</td>${fields.map((f) => `<td>${cell(f, r.e.data)}</td>`).join('')}
        <td>${r.end ? esc(r.end.data.end || '') : `<span class="hc-open">${L({ nl: 'open', en: 'open' })}</span>`}</td><td>${r.end ? esc(String(r.end.data.left ?? '')) : ''}</td>
        <td>${r.mins != null ? `<span class="${r.over ? 'hc-bad' : ''}">${Math.floor(r.mins / 60)}:${String(r.mins % 60).padStart(2, '0')}</span>` : ''}</td>
        <td class="small">${esc(initials(r.e.staff_id))}${r.end ? ` / ${esc(initials(r.end.staff_id))}` : ''}</td></tr>
        ${r.e.action || (r.end && r.end.data.reason) ? `<tr><td></td><td colspan="${fields.length + 4}" class="small">${esc([r.e.action, r.end && r.end.data.reason].filter(Boolean).join(' · '))}</td></tr>` : ''}`).join('')}</tbody></table>`;
  }
  // rows: one line per registration
  if (!mine.length) return none;
  const cols = fields;
  return `<table class="hc-t"><thead><tr><th>${L({ nl: 'Datum', en: 'Date' })}</th>${cols.map((f) => { const nm = typeof f.norm === 'object' ? f.norm : null; return `<th>${esc(L(f.label))}${nm ? `<br><span class="hc-norm">${esc(normText(nm))}</span>` : ''}</th>`; }).join('')}<th>${L({ nl: 'Corrigerende maatregel', en: 'Corrective action' })}</th><th>${L({ nl: 'Paraaf', en: 'Initials' })}</th></tr></thead>
    <tbody>${mine.map((e) => `<tr class="${e.ok === false ? 'hc-rowbad' : ''}"><td>${esc(dayShort(e.entry_date))}</td>${cols.map((f) => `<td>${cell(f, e.data)}</td>`).join('')}<td class="small">${esc(e.action || '')}</td><td class="small">${esc(initials(e.staff_id))}</td></tr>`).join('')}</tbody></table>`;
}

// under the table: who filled in what and when, with delete for managers and 'close' for open buffet presentations
function entryList(key, entries) {
  const mine = entries.filter((e) => e.list_key === key);
  if (!mine.length) return '';
  const rows = key === 'buffet' ? buffetRows(entries) : null;
  return `<details class="hc-log"><summary>${L({ nl: 'Ingevulde registraties', en: 'Records filled in' })} (${mine.length})</summary><ul>
    ${mine.map((e) => { const r = rows ? rows.find((x) => x.e.id === e.id) : null;
      return `<li><span>${esc(dayShort(e.entry_date))} ${timeOf(e.created_at)} · ${esc(nameOf(e.staff_id))}${e.ok === false ? ` · <span class="hc-bad">${L({ nl: 'afwijking', en: 'deviation' })}</span>` : ''}${r ? ` · ${esc(e.data.product || '')}` : ''}</span>
        <span>${r && !r.end ? `<button type="button" class="btn-sm btn-primary" data-close-buffet="${e.id}">${L({ nl: 'Presentatie afsluiten', en: 'End presentation' })}</button>` : ''}
        ${isManager() ? `<button type="button" class="btn-sm btn-ghost btn-danger" data-del-entry="${e.id}" aria-label="${L({ nl: 'Verwijderen', en: 'Delete' })}">&#10005;</button>` : ''}</span></li>`; }).join('')}</ul></details>
    ${rows && rows.some((r) => !r.end) ? `<p class="small" style="margin-top:8px">${L({ nl: 'Open presentaties sluit je af via de knop hierboven.', en: 'Close open presentations with the button above.' })}</p>` : ''}`;
}

function bindEntryActions(key, entries) {
  $$('[data-del-entry]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog(L({ nl: 'Deze registratie verwijderen? Dit kan niet ongedaan worden gemaakt.', en: 'Delete this record? This cannot be undone.' }), L({ nl: 'Verwijderen', en: 'Delete' })))) return;
    try { check(await sb.from('haccp_entries').delete().eq('id', b.dataset.delEntry)); toast(L({ nl: 'Verwijderd', en: 'Deleted' })); renderList(key); } catch (e) { toastError(e); }
  }));
  $$('[data-close-buffet]').forEach((b) => (b.onclick = () => closeBuffet(entries.find((e) => e.id === b.dataset.closeBuffet))));
}

function closeBuffet(start) {
  if (!start) return;
  const li = document.querySelector(`[data-close-buffet="${start.id}"]`).closest('li');
  li.insertAdjacentHTML('afterend', `<li class="hc-close-form"><form id="hc-end" class="hc-grid">
    <div class="hc-field"><label>${L({ nl: 'Vernietiging / einde presentatie', en: 'Destroyed / end of display' })}</label><input type="time" name="end" value="${nowTime()}"></div>
    <div class="hc-field"><label>${L({ nl: 'Aantal over', en: 'Left over' })}</label><input name="left" inputmode="numeric"></div>
    <div class="hc-field" style="grid-column:1/-1"><label>${L({ nl: 'Reden van vernietiging als dat eerder dan na 2 uur was (bijv. uiterlijk, einde buffet)', en: 'Reason if destroyed before 2 hours (e.g. appearance, end of buffet)' })}</label><input name="reason"></div>
    <div><button class="btn-primary btn-sm" type="submit">${L({ nl: 'Afsluiten', en: 'Close' })}</button></div></form></li>`);
  const f = $('#hc-end');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const mins = minutesBetween(start.data.start, f.end.value);
    const data = { start_id: start.id, end: f.end.value, left: f.left.value.trim(), reason: f.reason.value.trim() };
    try {
      check(await sb.from('haccp_entries').insert({ list_key: 'buffet_end', entry_date: start.entry_date, data, ok: mins != null && mins <= 120, action: mins > 120 ? L({ nl: 'Langer dan 2 uur gepresenteerd', en: 'Displayed longer than 2 hours' }) : null, staff_id: state.me.id }));
      toast(mins > 120 ? L({ nl: 'Afgesloten: langer dan 2 uur, afwijking genoteerd', en: 'Closed: over 2 hours, deviation noted' }) : L({ nl: 'Presentatie afgesloten', en: 'Presentation closed' }));
      renderList('buffet');
    } catch (err) { toastError(err); }
  };
}

// ------------------------------------------------------------------ print (for an inspection)
const PRINT_CSS = `<style>
  .hcp { font: 9.5pt/1.35 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; }
  .hcp + .hcp { break-before: page; }
  .hcp .top { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #2F5D50; padding-bottom: 6px; margin-bottom: 8px; }
  .hcp .brand { font-weight: 800; color: #2F5D50; font-size: 12pt; }
  .hcp h1 { font-size: 15pt; margin: 4px 0 2px; }
  .hcp .freq { font-size: 8.5pt; color: #444; margin: 0 0 8px; }
  .hcp table { width: 100%; border-collapse: collapse; }
  .hcp th, .hcp td { border: 1px solid #bbb !important; padding: 3px 5px; text-align: left; vertical-align: top; font-size: 8.5pt; }
  .hcp th { background: #f1f1ec; font-weight: 700; }
  .hcp .c { text-align: center; }
  .hcp .small, .hcp .tiny { font-size: 7.5pt; color: #555; }
  .hcp .hc-bad { color: #B5524A; font-weight: 800; text-decoration: underline; }
  .hcp .hc-rowbad td { background: #fbeeec; }
  .hcp .hc-grp td { background: #f7f7f2; font-weight: 700; }
  .hcp .hc-norm { font-weight: 400; color: #555; font-size: 7.5pt; }
  .hcp .muted { color: #666; }
  .hcp ul { margin: 4px 0 0 16px; padding: 0; }
  .hcp .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 22px; font-size: 8pt; color: #555; }
  .hcp .sign div { border-top: 1px solid #333; padding-top: 3px; }
</style>`;

export async function printWeek(keys, mon) {
  await loadConfig();
  const list = keys.filter((k) => LISTS[k]);
  const entries = await loadWeek(list.filter((k) => k !== 'suppliers'), mon);
  const head = (def) => `<div class="top"><div><div class="brand">Wintertuin</div><div class="small">Cantonspark, Baarn · ${L({ nl: 'HACCP-registratie volgens de Hygiënecode voor de Horeca', en: 'HACCP record under the Hygiënecode voor de Horeca' })}</div></div>
    <div style="text-align:right"><strong>${def.layout === 'suppliers' ? '' : esc(weekLabel(mon))}</strong><div class="small">${L({ nl: 'Geprint', en: 'Printed' })}: ${esc(fmt.stamp())} · ${esc(state.me ? state.me.full_name || '' : '')}</div></div></div>`;
  printHtml(`${PRINT_CSS}${list.map((k) => { const def = LISTS[k];
    return `<div class="hcp">${head(def)}<h1>${esc(L(def.title))}</h1><p class="freq">${L({ nl: 'Invulfrequentie', en: 'Frequency' })}: ${esc(L(def.freq))}</p>
      ${weekTable(k, entries, mon, true)}
      <div class="sign"><div>${L({ nl: 'Gecontroleerd door', en: 'Checked by' })}</div><div>${L({ nl: 'Datum', en: 'Date' })}</div><div>${L({ nl: 'Paraaf', en: 'Initials' })}</div></div></div>`; }).join('')}`);
}

// ------------------------------------------------------------------ Settings > HACCP (managers)
// The archive: every registration is stored automatically; pick a list and a week to look back or print.
// Below it the restaurant's own lists: fridges and freezers, cleaning items, approved suppliers, lists on or off.
let archiveWeek = null;
let archiveKey = 'all';
export async function renderHaccpSettings(el) {
  await loadConfig();
  if (!archiveWeek) archiveWeek = mondayOf(todayIso());
  const keys = enabledLists();
  el.innerHTML = `
    <div class="card"><h2 style="margin:0">${L({ nl: 'HACCP-archief', en: 'HACCP archive' })}</h2>
      <div class="small muted">${L({ nl: 'Alle registraties worden automatisch bewaard, per lijst en per week. Kies een lijst en week om terug te kijken of te printen voor een controle.', en: 'All records are saved automatically, per list and per week. Pick a list and a week to look back or print for an inspection.' })}</div>
      <div class="hc-arch-bar">
        <select id="arch-list"><option value="all">${L({ nl: 'Alle lijsten', en: 'All lists' })}</option>${keys.map((k) => `<option value="${k}" ${k === archiveKey ? 'selected' : ''}>${esc(L(LISTS[k].short))}</option>`).join('')}</select>
        <span class="hc-week" style="margin:0"><button type="button" class="btn-sm" data-awk="-7" aria-label="${L({ nl: 'Vorige week', en: 'Previous week' })}">&#8249;</button>
          <button type="button" class="btn-sm" data-awk="0">${L({ nl: 'Deze week', en: 'This week' })}</button>
          <button type="button" class="btn-sm" data-awk="7" aria-label="${L({ nl: 'Volgende week', en: 'Next week' })}">&#8250;</button>
          <strong>${esc(weekLabel(archiveWeek))}</strong></span>
        <button type="button" class="btn-primary btn-sm" id="arch-print">&#128424; ${L({ nl: 'Printen', en: 'Print' })}</button></div>
      <div id="arch-body"><div class="empty"><span class="spinner"></span></div></div></div>
    <div class="card"><h2 style="margin:0">${L({ nl: 'Koelingen en vriezers', en: 'Fridges and freezers' })}</h2><div class="small muted">${L({ nl: 'Deze staan op de temperatuurlijst. Koeling: max. 7 °C. Vriezer: −18 °C of kouder.', en: 'These appear on the temperature list. Fridge: max. 7 °C. Freezer: −18 °C or colder.' })}</div><div id="ed-equipment"></div></div>
    <div class="card"><h2 style="margin:0">${L({ nl: 'Schoonmaakrooster', en: 'Cleaning schedule' })}</h2><div class="small muted">${L({ nl: 'Wat er schoongemaakt wordt, hoe en hoe vaak.', en: 'What is cleaned, how and how often.' })}</div><div id="ed-cleaning"></div></div>
    <div class="card"><h2 style="margin:0">${L({ nl: 'Goedgekeurde leveranciers', en: 'Approved suppliers' })}</h2><div class="small muted">${L({ nl: 'Deze namen verschijnen als suggestie bij de ingangscontrole.', en: 'These names are suggested on the receiving check.' })}</div><div id="ed-suppliers"></div></div>
    <div class="card"><h2 style="margin:0">${L({ nl: 'Lijsten aan of uit', en: 'Lists on or off' })}</h2><div class="small muted">${L({ nl: 'Zet lijsten uit die jullie niet gebruiken. Bestaande registraties blijven bewaard.', en: 'Switch off lists you do not use. Existing records are kept.' })}</div>
      <div class="hc-ticks" style="margin-top:8px">${LIST_ORDER.map((k) => `<label class="hc-tickrow"><input type="checkbox" data-list-on="${k}" ${keys.includes(k) ? 'checked' : ''}><span>${esc(L(LISTS[k].short))}</span></label>`).join('')}</div>
      <button type="button" class="btn-primary btn-sm" id="save-lists" style="margin-top:10px">${L({ nl: 'Opslaan', en: 'Save' })}</button></div>`;
  const drawArchive = async () => {
    const body = $('#arch-body', el);
    const list = archiveKey === 'all' ? keys : [archiveKey];
    try {
      const entries = await loadWeek(list.filter((k) => k !== 'suppliers'), archiveWeek);
      body.innerHTML = list.map((k) => `<h3 class="hc-arch-h">${esc(L(LISTS[k].title))}</h3><div class="table-wrap">${weekTable(k, entries, archiveWeek, false)}</div>`).join('');
    } catch (e) { toastError(e); body.innerHTML = ''; }
  };
  drawArchive();
  $('#arch-list', el).onchange = (e) => { archiveKey = e.target.value; drawArchive(); };
  $$('[data-awk]', el).forEach((b) => (b.onclick = () => { const n = Number(b.dataset.awk); archiveWeek = n ? addDays(archiveWeek, n) : mondayOf(todayIso()); renderHaccpSettings(el); }));
  $('#arch-print', el).onclick = () => printWeek(archiveKey === 'all' ? keys : [archiveKey], archiveWeek);

  rowEditor($('#ed-equipment', el), 'equipment', cfg.equipment, [
    { k: 'name', label: { nl: 'Naam', en: 'Name' }, type: 'text', ph: { nl: 'bijv. Koelcel, Koeling bar', en: 'e.g. Walk-in fridge, Bar fridge' } },
    { k: 'kind', label: { nl: 'Soort', en: 'Type' }, type: 'select', opts: [{ v: 'cool', l: { nl: 'Koeling (max. 7 °C)', en: 'Fridge (max. 7 °C)' } }, { v: 'freeze', l: { nl: 'Vriezer (−18 °C)', en: 'Freezer (−18 °C)' } }] },
  ], () => ({ kind: 'cool' }), () => renderHaccpSettings(el));
  rowEditor($('#ed-cleaning', el), 'cleaning', cfg.cleaning, [
    { k: 'name', label: { nl: 'Object', en: 'Item' }, type: 'text' },
    { k: 'clean', label: { nl: 'Reinigen', en: 'Clean' }, type: 'check' },
    { k: 'disinfect', label: { nl: 'Desinfecteren', en: 'Disinfect' }, type: 'check' },
    { k: 'freq', label: { nl: 'Frequentie', en: 'Frequency' }, type: 'select', opts: Object.entries(FREQ).map(([v, l]) => ({ v, l })) },
  ], () => ({ clean: true, freq: 'D' }), () => renderHaccpSettings(el));
  rowEditor($('#ed-suppliers', el), 'suppliers', cfg.suppliers, [
    { k: 'name', label: { nl: 'Naam leverancier', en: 'Supplier' }, type: 'text' },
    { k: 'supplies', label: { nl: 'Leverancier van', en: 'Supplies' }, type: 'text', ph: { nl: 'bijv. groente, vlees, dranken', en: 'e.g. vegetables, meat, drinks' } },
    { k: 'notes', label: { nl: 'Bijzonderheden', en: 'Notes' }, type: 'text' },
  ], () => ({}), () => renderHaccpSettings(el));
  $('#save-lists', el).onclick = async () => {
    const on = LIST_ORDER.filter((k) => $(`[data-list-on="${k}"]`, el).checked);
    try { await saveConfig('lists', on); toast(L({ nl: 'Opgeslagen', en: 'Saved' })); renderHaccpSettings(el); } catch (e) { toastError(e); }
  };
}

async function saveConfig(key, value) {
  check(await sb.from('haccp_config').upsert({ key, value, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
}

// A small table of editable rows (add, change, remove), saved as one list in haccp_config
function rowEditor(el, key, rows, COLS, blank, done) {
  let list = rows.map((r) => ({ ...r }));
  const draw = () => {
    el.innerHTML = `<div class="table-wrap"><table class="hc-ed"><thead><tr>${COLS.map((c) => `<th>${esc(L(c.label))}</th>`).join('')}<th></th></tr></thead><tbody>
      ${list.map((r, i) => `<tr>${COLS.map((c) => `<td>${c.type === 'text' ? `<input data-i="${i}" data-k="${c.k}" value="${esc(r[c.k] || '')}" placeholder="${esc(L(c.ph))}" aria-label="${esc(L(c.label))}">`
        : c.type === 'check' ? `<input type="checkbox" data-i="${i}" data-k="${c.k}" ${r[c.k] ? 'checked' : ''} aria-label="${esc(L(c.label))}">`
        : `<select data-i="${i}" data-k="${c.k}" aria-label="${esc(L(c.label))}">${c.opts.map((o) => `<option value="${o.v}" ${o.v === r[c.k] ? 'selected' : ''}>${esc(L(o.l))}</option>`).join('')}</select>`}</td>`).join('')}
        <td><button type="button" class="btn-sm btn-ghost btn-danger" data-rm="${i}" aria-label="${L({ nl: 'Verwijderen', en: 'Remove' })}">&#10005;</button></td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn-sm" data-add>+ ${L({ nl: 'Toevoegen', en: 'Add' })}</button><button type="button" class="btn-primary btn-sm" data-save>${L({ nl: 'Opslaan', en: 'Save' })}</button></div>`;
    el.querySelectorAll('[data-k]').forEach((inp) => (inp.oninput = inp.onchange = () => { list[Number(inp.dataset.i)][inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; }));
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { list.splice(Number(b.dataset.rm), 1); draw(); }));
    el.querySelector('[data-add]').onclick = () => { list.push({ id: `${key.slice(0, 2)}${Date.now().toString(36)}`, name: '', ...blank() }); draw(); const ins = el.querySelectorAll('input[data-k="name"]'); if (ins.length) ins[ins.length - 1].focus(); };
    el.querySelector('[data-save]').onclick = async () => {
      const clean = list.map((r) => ({ ...r, name: String(r.name || '').trim() })).filter((r) => r.name);
      try { await saveConfig(key, clean); toast(L({ nl: 'Opgeslagen', en: 'Saved' })); done(); } catch (e) { toastError(e); }
    };
  };
  draw();
}
