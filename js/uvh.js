// Quotes and confirmations under the Uniforme Voorwaarden Horeca (UVH, KHN, version from 2024).
// Company details (needed on every quote and invoice), price lines with a VAT rate each, and the cancellation
// schedule of the UVH worked out in real dates and amounts for one event.
import { state, esc, toast, toastError, $ } from './core.js';
import { sb, check } from './data.js';
import { PHOTO_BUCKET } from './config.js';
import { lang } from './i18n.js';

const L = (o, l) => o[l || lang()] || o.en;
export const VAT_RATES = [0.09, 0.21];

// ------------------------------------------------------------------ company details (team_settings 'company')
const COMPANY_FIELDS = [
  ['legal_name', { nl: 'Juridische naam', en: 'Legal name' }, 'Wintertuin B.V. i.o.'],
  ['trade_name', { nl: 'Handelsnaam', en: 'Trade name' }, 'Wintertuin'],
  ['address', { nl: 'Adres', en: 'Address' }, 'Cantonspark, straat en nummer'],
  ['postcode_city', { nl: 'Postcode en plaats', en: 'Postcode and town' }, '3741 .. Baarn'],
  ['kvk', { nl: 'KVK-nummer', en: 'Chamber of Commerce no.' }, '12345678'],
  ['vat_id', { nl: 'Btw-id', en: 'VAT number' }, 'NL000000000B01'],
  ['iban', { nl: 'IBAN', en: 'IBAN' }, 'NL00 BANK 0000 0000 00'],
  ['email', { nl: 'E-mail', en: 'E-mail' }, 'info@wintertuin.nl'],
  ['phone', { nl: 'Telefoon', en: 'Phone' }, ''],
  ['website', { nl: 'Website', en: 'Website' }, 'https://'],
];
export async function loadCompany() {
  try { const { data } = await sb.from('team_settings').select('value').eq('key', 'company').maybeSingle(); return (data && data.value) || {}; }
  catch { return {}; }
}
async function saveCompany(v) {
  const { error } = await sb.from('team_settings').upsert({ key: 'company', value: v, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}
// What is still missing for a valid quote and invoice
export function companyGaps(c) {
  return ['legal_name', 'address', 'postcode_city', 'kvk', 'vat_id', 'iban'].filter((k) => !String(c[k] || '').trim());
}

// Settings > Company details
export async function renderCompanySettings(el) {
  const c = await loadCompany();
  const gaps = companyGaps(c);
  el.innerHTML = `<div class="card">
    <h2 style="margin:0">${L({ nl: 'Bedrijfsgegevens', en: 'Company details' })}</h2>
    <p class="small muted">${L({ nl: 'Staan op elke offerte en bevestiging. Voor een geldige factuur zijn naam, adres, KVK-nummer en btw-id verplicht.', en: 'Shown on every quote and confirmation. A valid invoice needs the name, address, Chamber of Commerce number and VAT number.' })}</p>
    ${gaps.length ? `<div class="note" style="margin:0 0 12px">${L({ nl: 'Nog in te vullen', en: 'Still to fill in' })}: ${gaps.map((k) => esc(L(COMPANY_FIELDS.find((f) => f[0] === k)[1]))).join(', ')}</div>` : ''}
    <form id="co-f" class="co-grid">
      ${COMPANY_FIELDS.map(([k, lab, ph]) => `<div class="field"><label for="co-${k}">${esc(L(lab))}</label><input id="co-${k}" name="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></div>`).join('')}
      <div class="field co-wide"><label for="co-house">${L({ nl: 'Huisregels (optioneel)', en: 'House rules (optional)' })}</label>
        <textarea id="co-house" name="house_rules" rows="3" placeholder="${L({ nl: 'Bijvoorbeeld: honden aangelijnd, geen eigen eten of drinken, muziek tot 23.00 uur.', en: 'For example: dogs on a lead, no own food or drink, music until 11 pm.' })}">${esc(c.house_rules || '')}</textarea>
        <div class="hint">${L({ nl: 'Mogen naast de UVH gelden (art. 5.1). Ze komen op de offerte.', en: 'May apply next to the UVH (art. 5.1). They go on the quote.' })}</div></div>
      <div class="co-row"><div class="field"><label for="co-valid">${L({ nl: 'Offerte geldig (dagen)', en: 'Quote valid (days)' })}</label><input id="co-valid" name="quote_days" inputmode="numeric" value="${esc(String(c.quote_days ?? 14))}"></div>
        <div class="field"><label for="co-pay">${L({ nl: 'Betaaltermijn factuur (dagen)', en: 'Invoice payment term (days)' })}</label><input id="co-pay" name="pay_days" inputmode="numeric" value="${esc(String(c.pay_days ?? 14))}"></div></div>
    </form>
    <h3 style="margin:18px 0 4px">${L({ nl: 'Uniforme Voorwaarden Horeca (UVH)', en: 'Uniform Conditions for the Hospitality Industry (UVH)' })}</h3>
    <label class="small" style="display:flex;gap:8px;align-items:center;margin:4px 0 8px"><input type="checkbox" id="co-uvh-on" ${c.uvh_on ? 'checked' : ''}> ${L({ nl: 'UVH op offertes en bevestigingen zetten', en: 'Put the UVH on quotes and confirmations' })}</label>
    <p class="small muted">${L({ nl: 'De UVH gaan als pdf mee met elke offerte. Zet hier de pdf die je als KHN-lid hebt gedownload.', en: 'The UVH go along with every quote as a PDF. Upload the PDF you downloaded as a KHN member.' })}</p>
    <div class="co-uvh">${c.uvh_url ? `<a class="btn btn-sm" href="${esc(c.uvh_url)}" target="_blank" rel="noopener"><i class="ic ic-book" aria-hidden="true"></i> ${L({ nl: 'UVH bekijken', en: 'View UVH' })}</a> <span class="small muted">${esc(c.uvh_version || '')}</span>` : `<span class="small muted">${L({ nl: 'Nog geen UVH-pdf.', en: 'No UVH PDF yet.' })}</span>`}
      <label class="btn btn-sm"><i class="ic ic-upload" aria-hidden="true"></i> ${c.uvh_url ? L({ nl: 'Andere pdf', en: 'Other PDF' }) : L({ nl: 'UVH-pdf uploaden', en: 'Upload UVH PDF' })}<input type="file" accept="application/pdf" hidden id="co-uvh"></label></div>
    <div class="modal-actions" style="justify-content:flex-start"><button type="button" class="btn-primary" id="co-save">${L({ nl: 'Opslaan', en: 'Save' })}</button></div></div>`;
  const read = () => {
    const f = $('#co-f'); const out = { ...c };
    COMPANY_FIELDS.forEach(([k]) => { out[k] = f.elements[k].value.trim(); });
    out.house_rules = f.elements.house_rules.value.trim();
    out.quote_days = Math.max(1, parseInt(f.elements.quote_days.value, 10) || 14);
    out.pay_days = Math.max(1, parseInt(f.elements.pay_days.value, 10) || 14);
    out.uvh_on = !!(document.getElementById('co-uvh-on') || {}).checked;
    return out;
  };
  $('#co-save').onclick = async () => {
    try { await saveCompany(read()); toast(L({ nl: 'Bedrijfsgegevens opgeslagen', en: 'Company details saved' })); renderCompanySettings(el); } catch (e) { toastError(e); }
  };
  $('#co-uvh').onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try {
      toast(L({ nl: 'UVH wordt geüpload…', en: 'Uploading the UVH…' }));
      const path = `docs/uvh-${Date.now()}.pdf`;
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: 'application/pdf' });
      if (error) throw error;
      const v = read(); v.uvh_url = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl; v.uvh_version = 'UVH 2024';
      await saveCompany(v); toast(L({ nl: 'UVH opgeslagen', en: 'UVH saved' })); renderCompanySettings(el);
    } catch (err) { toastError(err); }
  };
}

// ------------------------------------------------------------------ prices
// Each line: { label, per: 'pp' | 'fixed', qty (fixed), price (incl. VAT, per unit), vat }
// Older events have only a price per person and room hire: those become two lines (food 9%, room 21%).
export function priceLines(ev, guests) {
  let lines = Array.isArray(ev.price_lines) ? ev.price_lines.filter((x) => x && (x.label || x.price != null)) : [];
  if (!lines.length) {
    const incl = ev.prices_incl_vat !== false;
    const up = (n, r) => (n == null ? null : incl ? Number(n) : Number(n) * (1 + r));
    if (ev.price_per_person != null) lines.push({ label: '', per: 'pp', price: up(ev.price_per_person, 0.09), vat: 0.09, legacy: true });
    if (ev.room_hire != null && Number(ev.room_hire)) lines.push({ label: '', per: 'fixed', qty: 1, price: up(ev.room_hire, 0.21), vat: 0.21, legacy: true, room: true });
  }
  return lines.map((x) => {
    const qty = x.per === 'pp' ? (guests || 0) : (x.qty == null || x.qty === '' ? 1 : Number(x.qty));
    const price = Number(x.price || 0); const vat = VAT_RATES.includes(Number(x.vat)) ? Number(x.vat) : 0.09;
    const total = round2(qty * price); const ex = round2(total / (1 + vat));
    return { ...x, qty, price, vat, total, ex, vatAmount: round2(total - ex), priceEx: round2(price / (1 + vat)) };
  });
}
const round2 = (n) => Math.round(Number(n) * 100) / 100;
export function priceSummary(ev, guests) {
  const all = priceLines(ev, guests);
  const lines = all.filter((x) => !x.billed_by_landlord);
  const external = all.filter((x) => x.billed_by_landlord); // room hire the landlord invoices to the guest herself
  const byRate = VAT_RATES.map((r) => {
    const ls = lines.filter((x) => x.vat === r);
    return { rate: r, ex: round2(ls.reduce((a, x) => a + x.ex, 0)), vat: round2(ls.reduce((a, x) => a + x.vatAmount, 0)), total: round2(ls.reduce((a, x) => a + x.total, 0)) };
  }).filter((x) => x.total);
  const total = round2(lines.reduce((a, x) => a + x.total, 0));
  const min = Number(ev.min_spend || 0);
  return { lines, external, externalTotal: round2(external.reduce((a, x) => a + x.total, 0)), byRate, total, ex: round2(byRate.reduce((a, x) => a + x.ex, 0)), vat: round2(byRate.reduce((a, x) => a + x.vat, 0)), value: Math.max(total, min) || null, minApplies: min > total };
}

// ------------------------------------------------------------------ cancellation (UVH art. 13 business, 14 private)
// Which table: a menu was agreed (13.3a), only a table without a menu (13.3b), or a group with room or more (13.4.2).
export function suggestKind(ev) {
  if (ev.exclusive || Number(ev.room_hire || 0) > 0 || (ev.price_lines || []).some((x) => /zaal|room|ruimte/i.test(x.label || ''))) return 'group';
  return (ev.menu || []).length ? 'menu' : 'no_menu';
}
const D = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const TABLES = {
  // [how far before the event (exclusive), percentage]; the last one has no limit
  menu: [[{ d: 14 }, 0], [{ d: 7 }, 25], [{ d: 3 }, 50], [null, 75]],
  group: [[{ m: 6 }, 0], [{ m: 3 }, 10], [{ m: 2 }, 15], [{ m: 1 }, 35], [{ d: 14 }, 60], [{ d: 7 }, 85], [null, 100]],
};
export function cancellationSchedule(ev, value, l) {
  const fmtD = (d) => d.toLocaleDateString(l === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const money = (n) => new Intl.NumberFormat(l === 'en' ? 'en-GB' : 'nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
  if (!ev.event_date) return null;
  if (ev.client_type === 'private') {
    return { kind: 'private', text: L({ nl: 'Je mag deze afspraak altijd annuleren, schriftelijk (ook per mail). Je betaalt dan de kosten die wij op dat moment al hebben gemaakt, plus een redelijke vergoeding; daaronder kan gemiste omzet vallen als we de ruimte niet meer aan een ander kunnen geven (UVH art. 14.2). Minder gasten geldt als een aanpassing van de afspraak. Een andere datum geldt als annulering van de oude afspraak.', en: 'You may cancel this agreement at any time, in writing (e-mail is fine). You then pay the costs we have already made, plus a reasonable fee; this can include lost revenue if we can no longer let the space to someone else (UVH art. 14.2). Fewer guests counts as a change to the agreement. A new date counts as cancelling the old agreement.' }, l) };
  }
  const kind = ev.agreement_kind || suggestKind(ev);
  const day = D(ev.event_date);
  if (kind === 'no_menu') {
    const t = `${ev.start_time ? String(ev.start_time).slice(0, 5) : ''}`;
    return { kind, rows: [
      { when: L({ nl: 'Tot 48 uur voor aanvang', en: 'Up to 48 hours before the start' }, l), pct: 0, amount: 0 },
      { when: L({ nl: `Binnen 48 uur voor aanvang${t ? ` (${fmtD(addDays(day, -2))}, ${t})` : ''}`, en: `Within 48 hours of the start${t ? ` (${fmtD(addDays(day, -2))}, ${t})` : ''}` }, l), pct: 50, amount: value ? value * 0.5 : null },
    ].map((r) => ({ ...r, amountText: r.amount != null ? money(r.amount) : '' })), article: '13.3b' };
  }
  const tbl = TABLES[kind] || TABLES.menu;
  const rows = []; let prevEnd = null;
  tbl.forEach(([lim, pct]) => {
    // cancelling "more than lim before" means: on or before the day before the limit date
    const limDate = lim ? (lim.m ? addMonths(day, -lim.m) : addDays(day, -lim.d)) : null;
    const until = limDate ? addDays(limDate, -1) : addDays(day, 0);
    const from = prevEnd ? addDays(prevEnd, 1) : null;
    prevEnd = until;
    let when;
    if (!from) when = L({ nl: `Tot en met ${fmtD(until)}`, en: `Up to and including ${fmtD(until)}` }, l);
    else if (!limDate) when = L({ nl: `Vanaf ${fmtD(from)}`, en: `From ${fmtD(from)}` }, l);
    else when = L({ nl: `${fmtD(from)} tot en met ${fmtD(until)}`, en: `${fmtD(from)} up to and including ${fmtD(until)}` }, l);
    rows.push({ when, pct, amount: value ? value * pct / 100 : null, until });
  });
  // drop periods that are already over, and merge the leading free periods into one line
  const today = D(new Date().toISOString().slice(0, 10));
  const live = rows.filter((r, i) => i === rows.length - 1 || r.until >= today);
  return { kind, rows: live.map((r) => ({ ...r, amountText: r.amount != null && r.pct ? money(r.amount) : '' })), article: kind === 'group' ? '13.4.2' : '13.3a',
    rules: [
      L({ nl: 'Minder gasten geldt als gedeeltelijke annulering. Binnen 14 dagen voor het event rekenen we altijd de volledig afgesproken waarde (UVH art. 13.1.5).', en: 'Fewer guests counts as a partial cancellation. Within 14 days of the event the full agreed value is always due (UVH art. 13.1.5).' }, l),
      L({ nl: 'Een andere datum geldt als annulering van de oude afspraak (art. 13.1.6). Annuleringskosten houden we in op de aanbetaling (art. 13.1.2).', en: 'A new date counts as cancelling the old agreement (art. 13.1.6). Cancellation costs are deducted from the deposit (art. 13.1.2).' }, l),
    ] };
}

export const KIND_LABEL = {
  menu: { nl: 'Eten en drinken, menu afgesproken (UVH 13.3a)', en: 'Food and drink, set menu (UVH 13.3a)' },
  no_menu: { nl: 'Tafelreservering zonder menu (UVH 13.3b)', en: 'Table booking without a menu (UVH 13.3b)' },
  group: { nl: 'Groep met zaal of meer dan eten (UVH 13.4.2)', en: 'Group with a room or more than food (UVH 13.4.2)' },
};
export { L as uvhL };
