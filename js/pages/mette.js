// Mette: the finance part for the room hire of Mette te Velde. Her rooms, what she rented out (per daypart or per day),
// her costs and a dashboard: what comes in, what goes out, per room. Separate from the restaurant and from Finance:
// only people in hire_access see it (database update 025). The owner (Mette) decides who else has access.
// Amounts are stored excl. VAT; under Instellingen she chooses to type prices incl. or excl. VAT.
import { state, app, esc, fmt, toast, toastError, todayIso, $, $$, openModal, closeModal, confirmDialog, download } from '../core.js';
import { lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { loadRooms } from '../rooms.js';

const L = (o) => o[lang()] || o.en;
// Room colours: the validated categorical order, assigned by the room's place in the list (never picked by hand)
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OUT_COLOR = '#eb6834';
const MONTHS = () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'nl-NL', { month: 'short' }).format(new Date(2026, i, 1)).replace('.', ''));
export const DEFAULTS = {
  name: 'Mette te Velde',
  dayparts: [{ id: 'ochtend', name: 'Ochtend', from: '08:00', to: '12:00' }, { id: 'middag', name: 'Middag', from: '12:00', to: '17:00' }, { id: 'avond', name: 'Avond', from: '17:00', to: '22:00' }],
  vat_rates: [21, 9, 0],
  categories: ['Energie', 'Schoonmaak', 'Onderhoud', 'Verzekering', 'Inrichting', 'Marketing', 'Overig'],
  prices_incl: false,
};
const COUNTED = ['confirmed', 'invoiced', 'paid'];
const STATUS = () => ({ option: L({ en: 'Option', nl: 'Optie' }), confirmed: L({ en: 'Confirmed', nl: 'Bevestigd' }), invoiced: L({ en: 'Invoiced', nl: 'Gefactureerd' }), paid: L({ en: 'Paid', nl: 'Betaald' }), cancelled: L({ en: 'Cancelled', nl: 'Geannuleerd' }) });
const STATUS_TAG = { option: 'ev-option', confirmed: 'ev-confirmed', invoiced: 'claimed', paid: 'approved', cancelled: 'ev-cancelled' };
const CHANNEL = () => ({ wintertuin: L({ en: 'Via the restaurant', nl: 'Via restaurant' }), direct: L({ en: 'Direct', nl: 'Direct' }) });

// ------------------------------------------------------------------ access
export async function loadHireRole() {
  try { const { data, error } = await sb.rpc('hire_role'); state.hireRole = error ? null : data || null; } catch { state.hireRole = null; }
}
export const hasHire = () => !!state.hireRole;

// ------------------------------------------------------------------ data
let D = null; // { settings, rooms, bookings, costs }
const view = { mode: 'list', tab: 'overview', year: new Date().getFullYear(), month: null, listMonth: todayIso().slice(0, 7), q: '', status: 'all' };

async function load() {
  const [s, r, b, c] = await Promise.all([
    sb.from('hire_settings').select('value').eq('key', 'main').maybeSingle(),
    sb.from('hire_rooms').select('*').order('sort_order').order('created_at'),
    sb.from('hire_bookings').select('*').order('booking_date', { ascending: false }),
    sb.from('hire_costs').select('*').order('cost_date', { ascending: false }),
  ]);
  const settings = { ...DEFAULTS, ...((check(s) || {}).value || {}) };
  D = { settings, rooms: check(r) || [], bookings: check(b) || [], costs: check(c) || [] };
}
const roomOf = (id) => D.rooms.find((r) => r.id === id);
const colorOf = (id) => { const i = D.rooms.findIndex((r) => r.id === id); return i < 0 ? '#9aa39e' : SERIES[i % SERIES.length]; };
const incl = (excl, vat) => (excl == null ? null : Math.round(Number(excl) * (1 + Number(vat || 0) / 100) * 100) / 100);
const excl = (inc, vat) => (inc == null ? null : Math.round((Number(inc) / (1 + Number(vat || 0) / 100)) * 100) / 100);
const parseMoney = (s) => { let x = String(s ?? '').replace(/[€\s]/g, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); if (x === '') return null; const n = Number(x); return Number.isNaN(n) ? null : n; };
const showMoney = (n) => (n == null || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','));
// the amount as typed in the forms: incl. or excl. VAT, as set under Instellingen
const typed = (exclAmount, vat) => (D.settings.prices_incl ? incl(exclAmount, vat) : exclAmount);
const fromTyped = (n, vat) => (n == null ? null : D.settings.prices_incl ? excl(n, vat) : n);
const inclLabel = () => (D.settings.prices_incl ? L({ en: 'incl. VAT', nl: 'incl. btw' }) : L({ en: 'excl. VAT', nl: 'excl. btw' }));
const unitsOf = (b) => (b.unit === 'day' ? D.settings.dayparts.length : (b.dayparts || []).filter((id) => D.settings.dayparts.some((d) => d.id === id)).length || 1);
const whenOf = (b) => (b.unit === 'day' ? L({ en: 'Whole day', nl: 'Hele dag' }) : (b.dayparts || []).map((id) => (D.settings.dayparts.find((d) => d.id === id) || {}).name || id).join(', '));

// What a cost adds in each month of a year: once in its month, or every month for a monthly cost
function costByMonth(c, year) {
  const out = Array(12).fill(0); const a = Number(c.amount_excl) || 0;
  const [y, m] = String(c.cost_date).split('-').map(Number);
  if (!c.monthly) { if (y === year) out[m - 1] += a; return out; }
  const [ey, em] = c.end_date ? String(c.end_date).split('-').map(Number) : [9999, 12];
  for (let i = 0; i < 12; i++) { const k = year * 12 + i; if (k >= y * 12 + (m - 1) && k <= ey * 12 + (em - 1)) out[i] += a; }
  return out;
}

// ------------------------------------------------------------------ page
export async function renderMette(args = []) {
  if (!hasHire()) { await loadHireRole(); if (!hasHire()) { location.hash = '#/today'; return; } }
  const tabs = { overzicht: 'overview', verhuur: 'bookings', kosten: 'costs', instellingen: 'settings' };
  view.tab = tabs[args[0]] || 'overview';
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  try { await load(); } catch (e) {
    app().innerHTML = `<div class="card"><h1>Mette</h1><p class="muted">${L({ en: 'This part needs database update 025 (Actions, Database update, 025_mette_hire.sql).', nl: 'Dit deel heeft database-update 025 nodig (Actions, Database update, 025_mette_hire.sql).' })}</p></div>`;
    toastError(e); return;
  }
  draw();
}

function draw() {
  const t = view.tab;
  const tabs = [['overzicht', 'overview', L({ en: 'Overview', nl: 'Overzicht' })], ['verhuur', 'bookings', L({ en: 'Bookings', nl: 'Verhuur' })], ['kosten', 'costs', L({ en: 'Costs', nl: 'Kosten' })], ['instellingen', 'settings', L({ en: 'Settings', nl: 'Instellingen' })]];
  app().innerHTML = `<div class="page-head"><div><h1>Mette</h1>
      <div class="muted small">${L({ en: `Room hire of ${esc(D.settings.name)}: rooms, bookings, costs. Only ${state.hireRole === 'owner' ? 'you and the people you let in' : 'Mette and the people she lets in'} see this.`, nl: `Zaalverhuur van ${esc(D.settings.name)}: zalen, verhuur en kosten. Alleen ${state.hireRole === 'owner' ? 'jij en wie jij toegang geeft' : 'Mette en wie zij toegang geeft'} zien dit.` })}</div></div>
      <div class="page-actions">${t === 'bookings' ? `<button type="button" class="btn-primary btn-sm" id="mt-add">+ ${L({ en: 'Booking', nl: 'Verhuur' })}</button>` : t === 'costs' ? `<button type="button" class="btn-primary btn-sm" id="mt-add">+ ${L({ en: 'Cost', nl: 'Kosten' })}</button>` : ''}</div></div>
    <div class="ro-views mt-tabs" role="tablist">${tabs.map(([h, k, l]) => `<a href="#/mette/${h}" role="tab" class="${t === k ? 'on' : ''}" aria-selected="${t === k}">${l}</a>`).join('')}</div>
    ${!D.rooms.length && t !== 'settings' ? `<div class="note" style="margin:0 0 14px">${L({ en: 'Start under Settings: fill in your rooms and prices.', nl: 'Begin bij Instellingen: vul je zalen en ruimtes in, met de prijzen.' })} <a href="#/mette/instellingen">${L({ en: 'Settings', nl: 'Instellingen' })}</a></div>` : ''}
    <div id="mt-body"></div>`;
  const body = $('#mt-body');
  ({ overview: drawOverview, bookings: drawBookings, costs: drawCosts, settings: drawSettings })[t](body);
  const add = $('#mt-add'); if (add) add.onclick = () => (t === 'bookings' ? openBooking(null) : openCost(null));
}

// ------------------------------------------------------------------ overview (dashboard)
function stats() {
  const y = view.year; const m = view.month; // m: 0..11 or null for the whole year
  const inPeriod = (d) => { const [yy, mm] = String(d).split('-').map(Number); return yy === y && (m == null || mm - 1 === m); };
  const bk = D.bookings.filter((b) => inPeriod(b.booking_date));
  const counted = bk.filter((b) => COUNTED.includes(b.status));
  const sum = (xs, f = (b) => Number(b.amount_excl) || 0) => xs.reduce((a, b) => a + f(b), 0);
  const revByMonth = Array(12).fill(0); const costByM = Array(12).fill(0);
  D.bookings.forEach((b) => { const [yy, mm] = String(b.booking_date).split('-').map(Number); if (yy === y && COUNTED.includes(b.status)) revByMonth[mm - 1] += Number(b.amount_excl) || 0; });
  D.costs.forEach((c) => costByMonth(c, y).forEach((a, i) => { costByM[i] += a; }));
  const revenue = sum(counted); const costs = m == null ? costByM.reduce((a, b) => a + b, 0) : costByM[m];
  const vat = sum(counted, (b) => (Number(b.amount_excl) || 0) * (Number(b.vat_rate) || 0) / 100);
  const options = sum(bk.filter((b) => b.status === 'option'));
  const toInvoiceWt = sum(D.bookings.filter((b) => b.channel === 'wintertuin' && b.status === 'confirmed' && b.booking_date <= todayIso()));
  const toInvoiceAll = D.bookings.filter((b) => b.status === 'confirmed' && b.booking_date <= todayIso());
  const outstanding = sum(D.bookings.filter((b) => b.status === 'invoiced'), (b) => incl(b.amount_excl, b.vat_rate));
  // occupancy: booked dayparts against every daypart of every active room in the period
  const days = m == null ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365) : new Date(y, m + 1, 0).getDate();
  const dp = D.settings.dayparts.length || 1;
  const perRoom = D.rooms.map((r) => { const xs = counted.filter((b) => b.room_id === r.id); const units = xs.reduce((a, b) => a + unitsOf(b), 0);
    return { room: r, revenue: sum(xs), units, occ: r.active ? units / (days * dp) : null, count: xs.length }; });
  const active = perRoom.filter((x) => x.room.active);
  const occ = active.length ? active.reduce((a, x) => a + x.units, 0) / (active.length * days * dp) : 0;
  const channel = { wintertuin: sum(counted.filter((b) => b.channel === 'wintertuin')), direct: sum(counted.filter((b) => b.channel !== 'wintertuin')) };
  return { revenue, costs, vat, options, toInvoiceWt, toInvoiceAll, outstanding, occ, perRoom, revByMonth, costByM, channel, count: counted.length };
}

function drawOverview(body) {
  const s = stats(); const M = MONTHS();
  const years = [...new Set([new Date().getFullYear(), ...D.bookings.map((b) => Number(String(b.booking_date).slice(0, 4))), ...D.costs.map((c) => Number(String(c.cost_date).slice(0, 4)))])].sort();
  const result = s.revenue - s.costs;
  const period = view.month == null ? String(view.year) : `${M[view.month]} ${view.year}`;
  const max = Math.max(1, ...s.revByMonth, ...s.costByM);
  const maxRoom = Math.max(1, ...s.perRoom.map((x) => x.revenue));
  const pct = (x) => (x > 0 && x < 0.1 ? `${fmt.num(x * 100, 1)}%` : `${Math.round(x * 100)}%`);
  body.innerHTML = `
    <div class="mt-filters"><select id="mt-year" aria-label="${L({ en: 'Year', nl: 'Jaar' })}">${years.map((y) => `<option ${y === view.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <div class="chips"><button type="button" class="chip ${view.month == null ? 'on' : ''}" data-m="">${L({ en: 'Whole year', nl: 'Hele jaar' })}</button>${M.map((n, i) => `<button type="button" class="chip ${view.month === i ? 'on' : ''}" data-m="${i}">${esc(n)}</button>`).join('')}</div></div>
    <div class="grid grid-kpi">
      <div class="card kpi"><div class="label">${L({ en: 'Revenue', nl: 'Omzet' })}</div><div class="value">${fmt.money(s.revenue)}</div><div class="delta muted">${L({ en: 'excl. VAT', nl: 'excl. btw' })}, ${s.count} ${L({ en: 'bookings', nl: 'boekingen' })}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'Costs', nl: 'Kosten' })}</div><div class="value">${fmt.money(s.costs)}</div><div class="delta muted">${L({ en: 'excl. VAT', nl: 'excl. btw' })}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'Result', nl: 'Resultaat' })}</div><div class="value ${result >= 0 ? 'txt-green' : 'txt-red'}">${fmt.money(result)}</div><div class="delta muted">${L({ en: 'revenue minus costs', nl: 'omzet min kosten' })}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'Occupancy', nl: 'Bezetting' })}</div><div class="value">${pct(s.occ)}</div><div class="delta muted">${L({ en: 'of all dayparts', nl: 'van alle dagdelen' })}</div></div>
    </div>
    <div class="grid grid-kpi" style="margin-top:12px">
      <div class="card kpi"><div class="label">${L({ en: 'Options', nl: 'Opties' })}</div><div class="value">${fmt.money(s.options)}</div><div class="delta muted">${L({ en: 'not yet confirmed', nl: 'nog niet bevestigd' })}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'To invoice the restaurant', nl: 'Te factureren aan restaurant' })}</div><div class="value">${fmt.money(s.toInvoiceWt)}</div><div class="delta muted">${L({ en: 'confirmed, date passed', nl: 'bevestigd, datum geweest' })}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'Still to receive', nl: 'Nog te ontvangen' })}</div><div class="value">${fmt.money(s.outstanding)}</div><div class="delta muted">${L({ en: 'invoiced, incl. VAT', nl: 'gefactureerd, incl. btw' })}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'VAT on revenue', nl: 'Btw over omzet' })}</div><div class="value">${fmt.money(s.vat)}</div><div class="delta muted">${esc(period)}</div></div>
    </div>
    ${s.toInvoiceAll.length ? `<div class="note" style="margin-top:12px">${L({ en: `${s.toInvoiceAll.length} booking(s) have passed but are not invoiced yet.`, nl: `${s.toInvoiceAll.length} verhuring(en) zijn geweest maar nog niet gefactureerd.` })} <a href="#/mette/verhuur" id="mt-goinv">${L({ en: 'Show', nl: 'Bekijken' })}</a></div>` : ''}

    <div class="card" style="margin-top:12px"><div class="split"><h2 style="margin:0">${L({ en: 'In and out per month', nl: 'In en uit per maand' })}, ${view.year}</h2>
      <div class="mt-legend"><span><i style="background:var(--primary)"></i>${L({ en: 'Revenue', nl: 'Omzet' })}</span><span><i style="background:${OUT_COLOR}"></i>${L({ en: 'Costs', nl: 'Kosten' })}</span></div></div>
      <div class="mt-cols" role="img" aria-label="${L({ en: 'Revenue and costs per month', nl: 'Omzet en kosten per maand' })}">${M.map((n, i) => `<div class="mt-col ${view.month === i ? 'on' : ''}" data-tip="${esc(`${n} ${view.year}: ${L({ en: 'revenue', nl: 'omzet' })} ${fmt.money(s.revByMonth[i])}, ${L({ en: 'costs', nl: 'kosten' })} ${fmt.money(s.costByM[i])}, ${L({ en: 'result', nl: 'resultaat' })} ${fmt.money(s.revByMonth[i] - s.costByM[i])}`)}">
        <div class="mt-bars"><span class="mt-bar" style="height:${(s.revByMonth[i] / max) * 100}%;background:var(--primary)"></span><span class="mt-bar" style="height:${(s.costByM[i] / max) * 100}%;background:${OUT_COLOR}"></span></div>
        <div class="mt-x">${esc(n)}</div></div>`).join('')}</div>
      <details class="mt-table"><summary class="small">${L({ en: 'As a table', nl: 'Als tabel' })}</summary><div class="table-wrap"><table><thead><tr><th>${L({ en: 'Month', nl: 'Maand' })}</th><th class="num">${L({ en: 'Revenue', nl: 'Omzet' })}</th><th class="num">${L({ en: 'Costs', nl: 'Kosten' })}</th><th class="num">${L({ en: 'Result', nl: 'Resultaat' })}</th></tr></thead>
        <tbody>${M.map((n, i) => `<tr><td>${esc(n)}</td><td class="num">${fmt.money(s.revByMonth[i])}</td><td class="num">${fmt.money(s.costByM[i])}</td><td class="num">${fmt.money(s.revByMonth[i] - s.costByM[i])}</td></tr>`).join('')}</tbody></table></div></details></div>

    <div class="grid grid-2" style="margin-top:12px">
      <div class="card"><h2 style="margin:0 0 10px">${L({ en: 'Revenue per room', nl: 'Omzet per zaal' })}, ${esc(period)}</h2>
        ${s.perRoom.length ? s.perRoom.map((x) => `<div class="mt-hrow" data-tip="${esc(`${x.room.name}: ${fmt.money(x.revenue)}, ${x.count} ${L({ en: 'bookings', nl: 'boekingen' })}`)}"><span class="mt-hname"><i style="background:${colorOf(x.room.id)}"></i>${esc(x.room.name)}</span>
          <span class="mt-htrack"><span style="width:${(x.revenue / maxRoom) * 100}%;background:${colorOf(x.room.id)}"></span></span><span class="mt-hval">${fmt.money(x.revenue)}</span></div>`).join('') : `<div class="empty">${L({ en: 'No rooms yet.', nl: 'Nog geen zalen.' })}</div>`}</div>
      <div class="card"><h2 style="margin:0 0 10px">${L({ en: 'Occupancy per room', nl: 'Bezetting per zaal' })}, ${esc(period)}</h2>
        ${s.perRoom.filter((x) => x.room.active).map((x) => `<div class="mt-hrow" data-tip="${esc(`${x.room.name}: ${x.units} ${L({ en: 'dayparts booked', nl: 'dagdelen verhuurd' })} (${pct(x.occ)})`)}"><span class="mt-hname"><i style="background:${colorOf(x.room.id)}"></i>${esc(x.room.name)}</span>
          <span class="mt-htrack"><span style="width:${Math.min(100, x.occ * 100)}%;background:${colorOf(x.room.id)}"></span></span><span class="mt-hval">${pct(x.occ)}</span></div>`).join('') || `<div class="empty">${L({ en: 'No active rooms.', nl: 'Geen actieve zalen.' })}</div>`}
        <div class="subhead">${L({ en: 'Where the revenue comes from', nl: 'Waar de omzet vandaan komt' })}</div>
        <div class="mt-hrow"><span class="mt-hname">${CHANNEL().wintertuin}</span><span class="mt-hval">${fmt.money(s.channel.wintertuin)}</span></div>
        <div class="mt-hrow"><span class="mt-hname">${L({ en: 'Direct (room only)', nl: 'Direct (alleen zaal)' })}</span><span class="mt-hval">${fmt.money(s.channel.direct)}</span></div></div>
    </div>
    <div class="page-actions" style="justify-content:flex-start;margin-top:12px">
      <button type="button" class="btn-sm" id="mt-csv-b"><i class="ic ic-download" aria-hidden="true"></i> ${L({ en: `Bookings ${view.year} (CSV)`, nl: `Verhuur ${view.year} (CSV)` })}</button>
      <button type="button" class="btn-sm" id="mt-csv-c"><i class="ic ic-download" aria-hidden="true"></i> ${L({ en: `Costs ${view.year} (CSV)`, nl: `Kosten ${view.year} (CSV)` })}</button></div>`;
  $('#mt-year').onchange = (e) => { view.year = Number(e.target.value); drawOverview(body); };
  $$('[data-m]', body).forEach((b) => (b.onclick = () => { view.month = b.dataset.m === '' ? null : Number(b.dataset.m); drawOverview(body); }));
  $$('.mt-col', body).forEach((c, i) => (c.onclick = () => { view.month = view.month === i ? null : i; drawOverview(body); }));
  const gi = $('#mt-goinv'); if (gi) gi.onclick = () => { view.status = 'toinvoice'; };
  tips(body);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const money = (n) => (n == null ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','));
  $('#mt-csv-b').onclick = () => {
    const rows = D.bookings.filter((b) => String(b.booking_date).startsWith(String(view.year))).sort((a, b) => String(a.booking_date).localeCompare(b.booking_date));
    const lines = [['datum', 'zaal', 'dagdelen', 'klant', 'kanaal', 'status', 'bedrag_excl', 'btw_pct', 'btw', 'bedrag_incl', 'factuurnummer', 'notities'].join(';')]
      .concat(rows.map((b) => [b.booking_date, (roomOf(b.room_id) || {}).name, whenOf(b), b.client, CHANNEL()[b.channel], STATUS()[b.status], money(b.amount_excl), money(b.vat_rate), money((Number(b.amount_excl) || 0) * (Number(b.vat_rate) || 0) / 100), money(incl(b.amount_excl, b.vat_rate)), b.invoice_no, b.notes].map(q).join(';')));
    download('﻿' + lines.join('\r\n') + '\r\n', `mette-verhuur-${view.year}.csv`, 'text/csv;charset=utf-8');
  };
  $('#mt-csv-c').onclick = () => {
    const lines = [['maand', 'datum', 'categorie', 'zaal', 'omschrijving', 'bedrag_excl', 'btw_pct', 'bedrag_incl', 'maandelijks'].join(';')];
    D.costs.forEach((c) => costByMonth(c, view.year).forEach((a, i) => { if (!a) return;
      lines.push([`${view.year}-${String(i + 1).padStart(2, '0')}`, c.cost_date, c.category, (roomOf(c.room_id) || {}).name || '', c.description, money(a), money(c.vat_rate), money(incl(a, c.vat_rate)), c.monthly ? 'ja' : 'nee'].map(q).join(';')); }));
    download('﻿' + lines.join('\r\n') + '\r\n', `mette-kosten-${view.year}.csv`, 'text/csv;charset=utf-8');
  };
}

// One tooltip for every chart mark with data-tip (mouse and touch)
function tips(root) {
  let tip = document.getElementById('mt-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'mt-tip'; tip.className = 'mt-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  const hide = () => { tip.style.display = 'none'; };
  $$('[data-tip]', root).forEach((el) => {
    el.addEventListener('pointerenter', () => { tip.textContent = el.dataset.tip; tip.style.display = 'block'; });
    el.addEventListener('pointermove', (e) => { const w = tip.offsetWidth; tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - w / 2))}px`; tip.style.top = `${e.clientY - tip.offsetHeight - 12}px`; });
    el.addEventListener('pointerleave', hide);
  });
  window.addEventListener('hashchange', hide, { once: true });
}

// ------------------------------------------------------------------ bookings
function monthNav(id) {
  const [y, m] = view.listMonth.split('-').map(Number);
  const label = view.listMonth === 'all' ? L({ en: 'Everything', nl: 'Alles' }) : new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'nl-NL', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return `<div class="mt-monthnav" id="${id}"><button type="button" class="btn-sm" data-mv="-1" ${view.listMonth === 'all' ? 'disabled' : ''} aria-label="${L({ en: 'Previous month', nl: 'Vorige maand' })}">&#9664;</button>
    <strong>${esc(label)}</strong><button type="button" class="btn-sm" data-mv="1" ${view.listMonth === 'all' ? 'disabled' : ''} aria-label="${L({ en: 'Next month', nl: 'Volgende maand' })}">&#9654;</button>
    <button type="button" class="link-btn small" data-mv="now">${L({ en: 'This month', nl: 'Deze maand' })}</button><button type="button" class="link-btn small" data-mv="all">${L({ en: 'Everything', nl: 'Alles' })}</button></div>`;
}
function bindMonthNav(root, again) {
  $$('[data-mv]', root).forEach((b) => (b.onclick = () => {
    const v = b.dataset.mv;
    if (v === 'now') view.listMonth = todayIso().slice(0, 7);
    else if (v === 'all') view.listMonth = 'all';
    else { const [y, m] = view.listMonth.split('-').map(Number); const d = new Date(y, m - 1 + Number(v), 1); view.listMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    again();
  }));
}

function drawBookings(body) {
  const S = STATUS();
  const filters = [['all', L({ en: 'All', nl: 'Alles' })], ['toinvoice', L({ en: 'To invoice', nl: 'Te factureren' })], ['option', S.option], ['invoiced', S.invoiced], ['paid', S.paid]];
  const q = view.q.trim().toLowerCase();
  const list = D.bookings.filter((b) => (view.status === 'toinvoice' || view.listMonth === 'all' || String(b.booking_date).startsWith(view.listMonth))
    && (view.status === 'all' || (view.status === 'toinvoice' ? b.status === 'confirmed' && b.booking_date <= todayIso() : b.status === view.status))
    && (!q || [b.client, b.notes, b.invoice_no, (roomOf(b.room_id) || {}).name].some((v) => String(v || '').toLowerCase().includes(q))))
    .sort((a, b) => String(a.booking_date).localeCompare(b.booking_date));
  const total = list.filter((b) => b.status !== 'cancelled').reduce((a, b) => a + (Number(b.amount_excl) || 0), 0);
  const modeBar = `<div class="ro-views" style="margin:0 0 10px">${[['list', L({ en: 'List', nl: 'Lijst' })], ['cal', L({ en: 'Calendar', nl: 'Kalender' })]].map(([k, l]) => `<button type="button" data-mode="${k}" class="${view.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (view.mode === 'cal') { drawCalendar(body, modeBar); return; }
  body.innerHTML = `${modeBar}${view.status === 'toinvoice' ? '' : monthNav('mt-mn')}
    <div class="g-tools"><input type="search" id="mt-q" value="${esc(view.q)}" placeholder="${L({ en: 'Search client, room, invoice', nl: 'Zoek op klant, zaal of factuur' })}">
      <div class="chips">${filters.map(([k, l]) => `<button type="button" class="chip ${view.status === k ? 'on' : ''}" data-st="${k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="card" style="padding:0">${list.length ? `<div class="table-wrap"><table class="stack mt-list"><thead><tr><th>${L({ en: 'Date', nl: 'Datum' })}</th><th>${L({ en: 'Room', nl: 'Zaal' })}</th><th>${L({ en: 'When', nl: 'Wanneer' })}</th><th>${L({ en: 'Client', nl: 'Klant' })}</th><th>${L({ en: 'Status', nl: 'Status' })}</th><th class="num">${L({ en: 'Amount excl.', nl: 'Bedrag excl.' })}</th></tr></thead><tbody>
      ${list.map((b) => `<tr data-b="${b.id}" class="mt-click"><td data-label="${L({ en: 'Date', nl: 'Datum' })}">${esc(fmt.date(b.booking_date))}</td>
        <td data-label="${L({ en: 'Room', nl: 'Zaal' })}"><span class="mt-dot" style="background:${colorOf(b.room_id)}"></span>${esc((roomOf(b.room_id) || {}).name || '?')}</td>
        <td data-label="${L({ en: 'When', nl: 'Wanneer' })}" class="small">${esc(whenOf(b))}</td>
        <td data-label="${L({ en: 'Client', nl: 'Klant' })}">${esc(b.client || '–')}<div class="tiny muted">${esc(CHANNEL()[b.channel])}${b.invoice_no ? `, ${L({ en: 'invoice', nl: 'factuur' })} ${esc(b.invoice_no)}` : ''}</div>
          ${b.source === 'event' ? `<span class="tag claimed">${L({ en: 'from the restaurant', nl: 'uit het restaurant' })}</span>` : b.with_fnb ? `<span class="tag ev-option">${L({ en: 'food and drinks', nl: 'met eten en drinken' })}</span>` : ''}</td>
        <td data-label="Status"><span class="tag ${STATUS_TAG[b.status]}">${esc(S[b.status])}</span></td>
        <td data-label="${L({ en: 'Amount excl.', nl: 'Bedrag excl.' })}" class="num">${fmt.money(b.amount_excl)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="5"><strong>${L({ en: 'Total (without cancelled)', nl: 'Totaal (zonder geannuleerd)' })}</strong></td><td class="num"><strong>${fmt.money(total)}</strong></td></tr></tfoot></table></div>`
      : `<div class="empty">${L({ en: 'Nothing here.', nl: 'Niets in deze lijst.' })}</div>`}</div>`;
  bindMonthNav(body, () => drawBookings(body));
  $$('[data-mode]', body).forEach((x) => (x.onclick = () => { view.mode = x.dataset.mode; if (view.listMonth === 'all') view.listMonth = todayIso().slice(0, 7); drawBookings(body); }));
  const qi = $('#mt-q', body); qi.oninput = () => { view.q = qi.value; const pos = qi.selectionStart; drawBookings(body); const n = $('#mt-q', body); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-st]', body).forEach((b) => (b.onclick = () => { view.status = b.dataset.st; drawBookings(body); }));
  $$('[data-b]', body).forEach((r) => (r.onclick = () => openBooking(D.bookings.find((b) => b.id === r.dataset.b))));
}

// Calendar: one row per room, one column per day; each day shows its dayparts (filled = rented)
function drawCalendar(body, modeBar) {
  if (view.listMonth === 'all') view.listMonth = todayIso().slice(0, 7);
  const [y, m] = view.listMonth.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const dps = D.settings.dayparts;
  const iso = (d) => `${view.listMonth}-${String(d).padStart(2, '0')}`;
  const wd = (d) => new Date(y, m - 1, d).getDay();
  const today = todayIso();
  const rooms = D.rooms.filter((r) => r.active || D.bookings.some((b) => b.room_id === r.id && String(b.booking_date).startsWith(view.listMonth)));
  const cell = (r, d) => {
    const bs = D.bookings.filter((b) => b.room_id === r.id && b.booking_date === iso(d) && b.status !== 'cancelled');
    const parts = dps.map((p) => { const b = bs.find((x) => x.unit === 'day' || (x.dayparts || []).includes(p.id));
      return `<span class="mt-cp ${b ? (b.status === 'option' ? 'opt' : 'on') : ''}" ${b ? `data-bk="${b.id}" style="--c:${colorOf(r.id)}"` : ''}></span>`; }).join('');
    const tip = bs.map((b) => `${whenOf(b)}: ${b.client || '?'} (${STATUS()[b.status]})`).join(' · ');
    return `<td class="${wd(d) === 0 || wd(d) === 6 ? 'we' : ''} ${iso(d) === today ? 'td' : ''}" ${tip ? `data-tip="${esc(`${fmt.date(iso(d))}, ${r.name}: ${tip}`)}"` : ''} data-new="${r.id}|${iso(d)}"><div class="mt-cps">${parts}</div></td>`;
  };
  body.innerHTML = `${modeBar}${monthNav('mt-mn')}
    <div class="card" style="padding:0"><div class="table-wrap mt-calwrap"><table class="mt-cal"><thead><tr><th></th>${Array.from({ length: days }, (_, i) => `<th class="${wd(i + 1) === 0 || wd(i + 1) === 6 ? 'we' : ''}">${i + 1}</th>`).join('')}</tr></thead>
      <tbody>${rooms.map((r) => `<tr><th><span class="mt-dot" style="background:${colorOf(r.id)}"></span>${esc(r.name)}</th>${Array.from({ length: days }, (_, i) => cell(r, i + 1)).join('')}</tr>`).join('') || `<tr><td class="empty">${L({ en: 'No rooms yet.', nl: 'Nog geen zalen.' })}</td></tr>`}</tbody></table></div></div>
    <p class="small muted" style="margin-top:8px">${L({ en: `Each day shows the dayparts (${dps.map((d) => d.name).join(', ')}). Full colour is rented, light is an option. Tap a rented daypart to open it, an empty day to add a booking.`, nl: `Elke dag toont de dagdelen (${dps.map((d) => d.name).join(', ')}). Vol gekleurd is verhuurd, licht is een optie. Tik op een verhuurd dagdeel om het te openen, op een lege dag om verhuur toe te voegen.` })}</p>`;
  bindMonthNav(body, () => drawBookings(body));
  $$('[data-mode]', body).forEach((x) => (x.onclick = () => { view.mode = x.dataset.mode; drawBookings(body); }));
  $$('[data-new]', body).forEach((td) => (td.onclick = (e) => {
    const bk = e.target.closest('[data-bk]');
    if (bk) return openBooking(D.bookings.find((b) => b.id === bk.dataset.bk));
    const [rid, date] = td.dataset.new.split('|'); const r = roomOf(rid);
    openBooking({ room_id: rid, booking_date: date, unit: 'daypart', dayparts: [dps[0] && dps[0].id], channel: 'direct', status: 'confirmed', vat_rate: r.vat_rate, amount_excl: null }, true);
  }));
  tips(body);
}

const vatOptions = (sel) => [...new Set([...D.settings.vat_rates.map(Number), Number(sel)].filter((x) => !Number.isNaN(x)))].sort((a, b) => b - a)
  .map((v) => `<option value="${v}" ${Number(sel) === v ? 'selected' : ''}>${String(v).replace('.', ',')}%</option>`).join('');

function openBooking(b, copy = false) {
  if (!D.rooms.length) { location.hash = '#/mette/instellingen'; return; }
  const rooms = D.rooms.filter((r) => r.active || (b && r.id === b.room_id));
  const first = rooms[0];
  const v = b ? { ...b } : { room_id: first.id, booking_date: todayIso(), unit: 'daypart', dayparts: [D.settings.dayparts[0] && D.settings.dayparts[0].id], channel: 'direct', status: 'confirmed', vat_rate: first.vat_rate, amount_excl: null };
  if (copy) { v.id = null; v.status = 'confirmed'; v.invoice_no = ''; v.event_id = null; v.source = 'mette'; }
  const S = STATUS(); const C = CHANNEL();
  let manual = !!(b && !copy);
  const fromEvent = !!(b && !copy && b.source === 'event'); // made by an event of the restaurant: the event leads
  const lock = fromEvent ? 'disabled' : '';
  const linked = !!(b && !copy && b.source !== 'event' && b.event_id);
  openModal(`<h2>${b && !copy ? L({ en: 'Booking', nl: 'Verhuur' }) : L({ en: 'New booking', nl: 'Nieuwe verhuur' })}</h2>
    ${fromEvent ? `<div class="note" style="margin:0 0 12px">${L({ en: 'This comes from an event of the restaurant. Date, room, times and amount follow the event; here you keep the status, invoice number and notes.', nl: 'Dit komt uit een event van het restaurant. Datum, zaal, tijden en bedrag volgen het event; hier houd je de status, het factuurnummer en notities bij.' })}</div>` : ''}
    ${linked ? `<div class="note" style="margin:0 0 12px">${L({ en: 'Passed on to the restaurant (food and drinks). Changes you make here reach them as a follow-up.', nl: 'Doorgezet naar het restaurant (eten en drinken). Wat je hier wijzigt, krijgen zij als melding om op te volgen.' })}</div>` : ''}
    <form id="mt-bf" autocomplete="off">
      <div class="field-row"><div class="field"><label>${L({ en: 'Room', nl: 'Zaal of ruimte' })}</label><select name="room_id" ${lock}>${rooms.map((r) => `<option value="${r.id}" ${r.id === v.room_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>${L({ en: 'Date', nl: 'Datum' })}</label><input type="date" name="booking_date" value="${esc(v.booking_date)}" required ${lock}></div></div>
      <div class="field"><label>${L({ en: 'Per daypart or per day', nl: 'Per dagdeel of per dag' })}</label>
        <div class="ro-views" ${fromEvent ? 'style="pointer-events:none;opacity:.6"' : ''}><button type="button" data-unit="daypart" class="${v.unit !== 'day' ? 'on' : ''}">${L({ en: 'Daypart(s)', nl: 'Dagdeel' })}</button><button type="button" data-unit="day" class="${v.unit === 'day' ? 'on' : ''}">${L({ en: 'Whole day', nl: 'Hele dag' })}</button></div>
        <div class="chips mt-dps" style="margin-top:8px;${fromEvent ? 'pointer-events:none;opacity:.6' : ''}" ${v.unit === 'day' ? 'hidden' : ''}>${D.settings.dayparts.map((d) => `<label class="chip mt-dp ${(v.dayparts || []).includes(d.id) ? 'on' : ''}"><input type="checkbox" value="${esc(d.id)}" ${(v.dayparts || []).includes(d.id) ? 'checked' : ''} hidden>${esc(d.name)} <span class="tiny">${esc(d.from)}–${esc(d.to)}</span></label>`).join('')}</div></div>
      <div class="field-row"><div class="field"><label>${L({ en: 'Client', nl: 'Klant' })}</label><input name="client" value="${esc(v.client || '')}" ${lock}></div>
        <div class="field"><label>${L({ en: 'Booked', nl: 'Geboekt' })}</label><select name="channel" ${lock}>${Object.entries(C).map(([k, l]) => `<option value="${k}" ${v.channel === k ? 'selected' : ''}>${k === 'wintertuin' ? L({ en: 'Via the restaurant (you invoice the restaurant)', nl: 'Via restaurant (jij factureert het restaurant)' }) : L({ en: 'Direct (room only, you invoice the guest)', nl: 'Direct (alleen zaal, jij factureert de gast)' })}</option>`).join('')}</select></div></div>
      <div class="field-row"><div class="field"><label>${L({ en: 'Amount', nl: 'Bedrag' })} <span class="tiny muted">${inclLabel()}</span></label><input name="amount" inputmode="decimal" value="${esc(showMoney(typed(v.amount_excl, v.vat_rate)))}" ${lock}><div class="tiny muted" id="mt-calc"></div></div>
        <div class="field"><label>${L({ en: 'VAT', nl: 'Btw' })}</label><select name="vat_rate" ${lock}>${vatOptions(v.vat_rate)}</select></div>
        <div class="field"><label>Status</label><select name="status">${Object.entries(S).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
      <div id="mt-clash" class="note ev-busy warn" hidden></div>
      ${fromEvent ? '' : `<div class="field mt-fnb"><label class="check"><input type="checkbox" name="with_fnb" ${v.with_fnb ? 'checked' : ''}> <strong>${L({ en: 'With food and drinks by the restaurant', nl: 'Met eten en drinken van het restaurant' })}</strong></label>
        <div class="tiny muted">${L({ en: 'The restaurant gets this as a request with a pop-up to contact the guest. They make the quote and the BEO; you invoice the room to the restaurant.', nl: 'Het restaurant krijgt dit als aanvraag, met een melding om contact op te nemen met de gast. Zij maken de offerte en de BEO; jij factureert de zaal aan het restaurant.' })}</div></div>
      <div class="mt-fnbx" ${v.with_fnb ? '' : 'hidden'}>
        <div class="field-row"><div class="field"><label>${L({ en: 'Contact person', nl: 'Contactpersoon' })}</label><input name="contact_name" value="${esc(v.contact_name || '')}"></div>
          <div class="field"><label>${L({ en: 'Phone', nl: 'Telefoon' })}</label><input name="contact_phone" type="tel" value="${esc(v.contact_phone || '')}"></div>
          <div class="field"><label>${L({ en: 'Email', nl: 'E-mail' })}</label><input name="contact_email" type="email" value="${esc(v.contact_email || '')}"></div></div>
        <div class="field-row"><div class="field"><label>${L({ en: 'Guests (about)', nl: 'Aantal gasten (ongeveer)' })}</label><input name="guests" inputmode="numeric" value="${esc(v.guests ?? '')}"></div></div>
        <div class="field"><label>${L({ en: 'What you already agreed', nl: 'Wat is er al afgesproken' })}</label><textarea name="agreed" rows="3" placeholder="${L({ en: 'e.g. drinks at 5 pm, then a walking dinner, budget about €45 p.p., two vegetarians', nl: 'bijv. borrel om 17.00 uur, daarna walking dinner, budget rond €45 p.p., twee vegetariërs' })}">${esc(v.agreed || '')}</textarea></div></div>`}
      <div class="field-row"><div class="field"><label>${L({ en: 'Invoice number', nl: 'Factuurnummer' })}</label><input name="invoice_no" value="${esc(v.invoice_no || '')}"></div></div>
      <div class="field"><label>${L({ en: 'Notes', nl: 'Notities' })}</label><textarea name="notes" rows="2">${esc(v.notes || '')}</textarea></div>
      <div class="modal-actions">${b && !copy && !fromEvent ? `<button type="button" class="btn btn-danger" id="mt-bdel">${L({ en: 'Delete', nl: 'Verwijderen' })}</button><button type="button" class="btn" id="mt-bcopy">${L({ en: 'Copy', nl: 'Kopiëren' })}</button>` : ''}
        <span style="flex:1"></span><button type="button" class="btn" data-close>${L({ en: 'Close', nl: 'Sluiten' })}</button><button type="submit" class="btn-primary">${L({ en: 'Save', nl: 'Opslaan' })}</button></div>
    </form>`, (root) => {
    const f = $('#mt-bf', root);
    let unit = v.unit === 'day' ? 'day' : 'daypart';
    const picked = () => $$('.mt-dp input', root).filter((x) => x.checked).map((x) => x.value);
    // the price from the room: dayparts × price per daypart, or the day price (else every daypart)
    const calc = () => {
      const r = roomOf(f.room_id.value); if (!r) return null;
      const dp = Number(r.price_daypart) || 0; const n = D.settings.dayparts.length;
      return unit === 'day' ? (r.price_day != null ? Number(r.price_day) : dp * n) : dp * picked().length;
    };
    const refresh = () => {
      const c = calc(); const vat = Number(f.vat_rate.value);
      $('#mt-calc', root).textContent = c != null ? `${L({ en: 'Room price', nl: 'Prijs volgens zaal' })}: ${fmt.money(typed(c, vat))}${manual && fromTyped(parseMoney(f.amount.value), vat) !== c ? ` · ${L({ en: 'tap to use', nl: 'tik om te gebruiken' })}` : ''}` : '';
      if (!manual && c != null && !fromEvent) f.amount.value = showMoney(typed(c, vat));
      clash();
    };
    // double bookings: the same room on the same day with an overlapping daypart
    const clash = () => {
      const box = $('#mt-clash', root); const me = b && !copy ? b.id : null;
      const mine = unit === 'day' ? D.settings.dayparts.map((d) => d.id) : picked();
      const hits = D.bookings.filter((x) => x.id !== me && x.status !== 'cancelled' && x.room_id === f.room_id.value && x.booking_date === f.booking_date.value
        && (x.unit === 'day' || unit === 'day' || (x.dayparts || []).some((d) => mine.includes(d))));
      box.hidden = !hits.length;
      if (hits.length) box.innerHTML = `<strong>${L({ en: 'Watch out, double booking?', nl: 'Let op, dubbele boeking?' })}</strong> ${hits.map((x) => `${esc(whenOf(x))}: ${esc(x.client || '?')} (${esc(STATUS()[x.status])}${x.source === 'event' ? `, ${L({ en: 'restaurant', nl: 'restaurant' })}` : ''})`).join('; ')}`;
    };
    const fnb = f.with_fnb;
    if (fnb) fnb.onchange = () => { $('.mt-fnbx', root).hidden = !fnb.checked; if (fnb.checked) f.channel.value = 'wintertuin'; };
    f.booking_date.addEventListener('change', clash); f.room_id.addEventListener('change', clash);
    $('#mt-calc', root).onclick = () => { manual = false; refresh(); };
    f.amount.oninput = () => { manual = true; refresh(); };
    f.room_id.onchange = () => { const r = roomOf(f.room_id.value); if (r) f.vat_rate.innerHTML = vatOptions(r.vat_rate); refresh(); };
    f.vat_rate.onchange = refresh;
    $$('[data-unit]', root).forEach((x) => (x.onclick = () => { unit = x.dataset.unit; $$('[data-unit]', root).forEach((y) => y.classList.toggle('on', y === x)); $('.mt-dps', root).hidden = unit === 'day'; refresh(); }));
    $$('.mt-dp', root).forEach((l) => (l.onclick = (e) => { e.preventDefault(); const i = l.querySelector('input'); i.checked = !i.checked; l.classList.toggle('on', i.checked); refresh(); }));
    refresh();
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (unit === 'daypart' && !picked().length) return toastError(new Error(L({ en: 'Choose at least one daypart.', nl: 'Kies minstens één dagdeel.' })));
      const vat = Number(f.vat_rate.value);
      const amt = fromTyped(parseMoney(f.amount.value), vat);
      if (fromEvent) {
        try { check(await sb.from('hire_bookings').update({ status: f.status.value, invoice_no: f.invoice_no.value.trim() || null, notes: f.notes.value.trim() || null, updated_at: new Date().toISOString() }).eq('id', b.id));
          closeModal(); toast(L({ en: 'Saved', nl: 'Opgeslagen' })); await load(); draw(); } catch (err) { toastError(err); }
        return;
      }
      const withFnb = !!(f.with_fnb && f.with_fnb.checked);
      if (withFnb && !(f.contact_phone.value.trim() || f.contact_email.value.trim())) return toastError(new Error(L({ en: 'For the restaurant: fill in a phone number or email of the guest.', nl: 'Voor het restaurant: vul een telefoonnummer of e-mailadres van de gast in.' })));
      const extra = withFnb || (b && b.with_fnb) ? { with_fnb: withFnb, contact_name: f.contact_name.value.trim() || null, contact_phone: f.contact_phone.value.trim() || null,
        contact_email: f.contact_email.value.trim() || null, guests: f.guests.value.trim() ? Number(f.guests.value) : null, agreed: f.agreed.value.trim() || null } : { with_fnb: false };
      const row = { ...extra, room_id: f.room_id.value, booking_date: f.booking_date.value, unit, dayparts: unit === 'day' ? [] : picked(), client: f.client.value.trim() || null, channel: f.channel.value,
        status: f.status.value, amount_excl: amt || 0, vat_rate: vat, invoice_no: f.invoice_no.value.trim() || null, notes: f.notes.value.trim() || null, updated_at: new Date().toISOString() };
      try {
        if (b && !copy) check(await sb.from('hire_bookings').update(row).eq('id', b.id));
        else check(await sb.from('hire_bookings').insert(row));
        closeModal(); toast(L({ en: 'Saved', nl: 'Opgeslagen' })); await load(); draw();
      } catch (err) { toastError(err); }
    };
    const del = $('#mt-bdel', root);
    if (del) del.onclick = async () => {
      if (!(await confirmDialog(L({ en: 'Delete this booking?', nl: 'Deze verhuur verwijderen?' }), L({ en: 'Delete', nl: 'Verwijderen' })))) return;
      try { check(await sb.from('hire_bookings').delete().eq('id', b.id)); toast(L({ en: 'Deleted', nl: 'Verwijderd' })); await load(); draw(); } catch (err) { toastError(err); }
    };
    const cp = $('#mt-bcopy', root); if (cp) cp.onclick = () => { closeModal(); openBooking(b, true); };
  });
}

// ------------------------------------------------------------------ costs
function drawCosts(body) {
  const ym = view.listMonth;
  const rows = [];
  D.costs.forEach((c) => {
    if (ym === 'all') { rows.push({ c, amount: Number(c.amount_excl) || 0 }); return; }
    const [y, m] = ym.split('-').map(Number); const a = costByMonth(c, y)[m - 1];
    if (a) rows.push({ c, amount: a });
  });
  rows.sort((a, b) => String(b.c.cost_date).localeCompare(a.c.cost_date));
  const total = rows.reduce((a, x) => a + x.amount, 0);
  const byCat = {}; rows.forEach((x) => { const k = x.c.category || L({ en: 'Other', nl: 'Overig' }); byCat[k] = (byCat[k] || 0) + x.amount; });
  body.innerHTML = `${monthNav('mt-mn')}
    ${ym === 'all' ? `<p class="small muted">${L({ en: 'Everything as entered; monthly costs count once here.', nl: 'Alles zoals ingevoerd; maandelijkse kosten tellen hier één keer.' })}</p>` : ''}
    <div class="card" style="padding:0">${rows.length ? `<div class="table-wrap"><table class="stack mt-list"><thead><tr><th>${L({ en: 'Date', nl: 'Datum' })}</th><th>${L({ en: 'Category', nl: 'Categorie' })}</th><th>${L({ en: 'Description', nl: 'Omschrijving' })}</th><th>${L({ en: 'Room', nl: 'Zaal' })}</th><th class="num">${L({ en: 'Amount excl.', nl: 'Bedrag excl.' })}</th></tr></thead><tbody>
      ${rows.map(({ c, amount }) => `<tr data-c="${c.id}" class="mt-click"><td data-label="${L({ en: 'Date', nl: 'Datum' })}">${esc(fmt.date(c.cost_date))}${c.monthly ? ` <span class="tag">${L({ en: 'monthly', nl: 'maandelijks' })}</span>` : ''}</td>
        <td data-label="${L({ en: 'Category', nl: 'Categorie' })}">${esc(c.category || '–')}</td><td data-label="${L({ en: 'Description', nl: 'Omschrijving' })}">${esc(c.description || '')}</td>
        <td data-label="${L({ en: 'Room', nl: 'Zaal' })}">${c.room_id ? `<span class="mt-dot" style="background:${colorOf(c.room_id)}"></span>${esc((roomOf(c.room_id) || {}).name || '')}` : `<span class="muted">${L({ en: 'General', nl: 'Algemeen' })}</span>`}</td>
        <td data-label="${L({ en: 'Amount excl.', nl: 'Bedrag excl.' })}" class="num">${fmt.money(amount)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="4"><strong>${L({ en: 'Total', nl: 'Totaal' })}</strong></td><td class="num"><strong>${fmt.money(total)}</strong></td></tr></tfoot></table></div>`
      : `<div class="empty">${L({ en: 'No costs in this period.', nl: 'Geen kosten in deze periode.' })}</div>`}</div>
    ${Object.keys(byCat).length > 1 ? `<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px">${L({ en: 'Per category', nl: 'Per categorie' })}</h2>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, a]) => `<div class="mt-hrow"><span class="mt-hname">${esc(k)}</span><span class="mt-htrack"><span style="width:${(a / total) * 100}%;background:${OUT_COLOR}"></span></span><span class="mt-hval">${fmt.money(a)}</span></div>`).join('')}</div>` : ''}`;
  bindMonthNav(body, () => drawCosts(body));
  $$('[data-c]', body).forEach((r) => (r.onclick = () => openCost(D.costs.find((c) => c.id === r.dataset.c))));
}

function openCost(c) {
  const v = c ? { ...c } : { cost_date: todayIso(), category: D.settings.categories[0] || '', vat_rate: D.settings.vat_rates[0] ?? 21, amount_excl: null, monthly: false };
  const cats = [...new Set([...D.settings.categories, v.category].filter(Boolean))];
  openModal(`<h2>${c ? L({ en: 'Cost', nl: 'Kosten' }) : L({ en: 'New cost', nl: 'Nieuwe kosten' })}</h2>
    <form id="mt-cf" autocomplete="off">
      <div class="field-row"><div class="field"><label>${L({ en: 'Date', nl: 'Datum' })}</label><input type="date" name="cost_date" value="${esc(v.cost_date)}" required></div>
        <div class="field"><label>${L({ en: 'Category', nl: 'Categorie' })}</label><select name="category">${cats.map((k) => `<option ${k === v.category ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div></div>
      <div class="field"><label>${L({ en: 'Description', nl: 'Omschrijving' })}</label><input name="description" value="${esc(v.description || '')}" placeholder="${L({ en: 'e.g. window cleaner', nl: 'bijv. glazenwasser' })}"></div>
      <div class="field-row"><div class="field"><label>${L({ en: 'Room', nl: 'Zaal' })}</label><select name="room_id"><option value="">${L({ en: 'General (all rooms)', nl: 'Algemeen (alle zalen)' })}</option>${D.rooms.map((r) => `<option value="${r.id}" ${r.id === v.room_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>${L({ en: 'Amount', nl: 'Bedrag' })} <span class="tiny muted">${inclLabel()}</span></label><input name="amount" inputmode="decimal" value="${esc(showMoney(typed(v.amount_excl, v.vat_rate)))}" required></div>
        <div class="field"><label>${L({ en: 'VAT', nl: 'Btw' })}</label><select name="vat_rate">${vatOptions(v.vat_rate)}</select></div></div>
      <div class="field"><label class="check"><input type="checkbox" name="monthly" ${v.monthly ? 'checked' : ''}> ${L({ en: 'Comes back every month (fixed costs)', nl: 'Komt elke maand terug (vaste kosten)' })}</label></div>
      <div class="field mt-end" ${v.monthly ? '' : 'hidden'}><label>${L({ en: 'Until (empty = keeps going)', nl: 'Tot en met (leeg = loopt door)' })}</label><input type="date" name="end_date" value="${esc(v.end_date || '')}"></div>
      <div class="modal-actions">${c ? `<button type="button" class="btn btn-danger" id="mt-cdel">${L({ en: 'Delete', nl: 'Verwijderen' })}</button>` : ''}
        <span style="flex:1"></span><button type="button" class="btn" data-close>${L({ en: 'Close', nl: 'Sluiten' })}</button><button type="submit" class="btn-primary">${L({ en: 'Save', nl: 'Opslaan' })}</button></div>
    </form>`, (root) => {
    const f = $('#mt-cf', root);
    f.monthly.onchange = () => { $('.mt-end', root).hidden = !f.monthly.checked; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const vat = Number(f.vat_rate.value); const amt = fromTyped(parseMoney(f.amount.value), vat);
      if (amt == null) return toastError(new Error(L({ en: 'Fill in an amount.', nl: 'Vul een bedrag in.' })));
      const row = { cost_date: f.cost_date.value, category: f.category.value || null, description: f.description.value.trim() || null, room_id: f.room_id.value || null,
        amount_excl: amt, vat_rate: vat, monthly: f.monthly.checked, end_date: f.monthly.checked && f.end_date.value ? f.end_date.value : null };
      try {
        if (c) check(await sb.from('hire_costs').update(row).eq('id', c.id)); else check(await sb.from('hire_costs').insert(row));
        closeModal(); toast(L({ en: 'Saved', nl: 'Opgeslagen' })); await load(); draw();
      } catch (err) { toastError(err); }
    };
    const del = $('#mt-cdel', root);
    if (del) del.onclick = async () => {
      if (!(await confirmDialog(L({ en: 'Delete this cost?', nl: 'Deze kosten verwijderen?' }), L({ en: 'Delete', nl: 'Verwijderen' })))) return;
      try { check(await sb.from('hire_costs').delete().eq('id', c.id)); toast(L({ en: 'Deleted', nl: 'Verwijderd' })); await load(); draw(); } catch (err) { toastError(err); }
    };
  });
}

// ------------------------------------------------------------------ Mette's own settings
async function drawSettings(body) {
  let rooms = D.rooms.map((r) => ({ ...r }));
  let st = JSON.parse(JSON.stringify(D.settings));
  // the rooms of the Team app (used on quotes): link each of hers, so events and her list find each other
  let teamRooms = []; try { teamRooms = (await loadRooms()).rooms.filter((r) => r.owner !== 'restaurant'); } catch { /* none */ }
  const teamMatch = (r) => r.team_room_id || (teamRooms.find((t) => t.name.toLowerCase() === String(r.name || '').toLowerCase()) || {}).id || '';
  const owner = state.hireRole === 'owner';
  const draw2 = () => {
    body.innerHTML = `
    <div class="card"><h2>${L({ en: 'Rooms and spaces', nl: 'Zalen en ruimtes' })}</h2>
      <p class="small muted">${L({ en: `Your rooms with the price per daypart and per day (${inclLabel()}). A room with bookings cannot be deleted; switch it off instead. "Team app" links the room to the same room on the restaurant's quotes, so their events show up here.`, nl: `Je zalen en ruimtes, met de prijs per dagdeel en per dag (${inclLabel()}). Een zaal met verhuur kun je niet verwijderen; zet hem dan uit. Bij "Team-app" koppel je de zaal aan dezelfde ruimte op de offertes van het restaurant, zodat hun events hier vanzelf verschijnen.` })}</p>
      <div id="mt-rooms">${rooms.map((r, i) => `<div class="mt-room" data-i="${i}">
        <span class="mt-dot" style="background:${SERIES[i % SERIES.length]}"></span>
        <input name="name" value="${esc(r.name || '')}" placeholder="${L({ en: 'Name', nl: 'Naam, bijv. De kas' })}" aria-label="${L({ en: 'Name', nl: 'Naam' })}">
        <input name="capacity" value="${r.capacity || ''}" inputmode="numeric" placeholder="${L({ en: 'max. guests', nl: 'max. gasten' })}" aria-label="${L({ en: 'Max. guests', nl: 'Maximaal aantal gasten' })}">
        <label class="mt-in"><span class="tiny muted">${L({ en: 'Daypart', nl: 'Dagdeel' })}</span><input name="price_daypart" value="${esc(showMoney(typed(r.price_daypart, r.vat_rate)))}" inputmode="decimal" placeholder="€"></label>
        <label class="mt-in"><span class="tiny muted">${L({ en: 'Day', nl: 'Dag' })}</span><input name="price_day" value="${esc(showMoney(typed(r.price_day, r.vat_rate)))}" inputmode="decimal" placeholder="€"></label>
        <select name="vat_rate" aria-label="${L({ en: 'VAT', nl: 'Btw' })}">${vatOptions(r.vat_rate ?? st.vat_rates[0] ?? 21)}</select>
        <select name="team_room_id" class="mt-team" aria-label="${L({ en: 'Same room in the Team app', nl: 'Zelfde ruimte in de Team-app' })}" title="${L({ en: 'Same room in the Team app (for events)', nl: 'Zelfde ruimte in de Team-app (voor events)' })}"><option value="">${L({ en: 'Team app: none', nl: 'Team-app: geen' })}</option>${teamRooms.map((t) => `<option value="${esc(t.id)}" ${teamMatch(r) === t.id ? 'selected' : ''}>${L({ en: 'Team app', nl: 'Team-app' })}: ${esc(t.name)}</option>`).join('')}</select>
        <label class="switch" title="${L({ en: 'Active', nl: 'Actief' })}"><input type="checkbox" name="active" ${r.active !== false ? 'checked' : ''} aria-label="${L({ en: 'Active', nl: 'Actief' })}"><span></span></label>
        <button type="button" class="btn-sm btn-ghost" data-rdel="${i}" aria-label="${L({ en: 'Delete', nl: 'Verwijderen' })}">&#10005;</button></div>`).join('')}</div>
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button type="button" class="btn-sm" id="mt-radd">+ ${L({ en: 'Room', nl: 'Zaal of ruimte' })}</button>
        ${rooms.length ? '' : `<button type="button" class="btn-sm" id="mt-rimport">${L({ en: 'Take the rooms from the Team app', nl: 'Ruimtes overnemen uit de Team-app' })}</button>`}</div>
      <div style="margin-top:14px"><button type="button" class="btn-primary" id="mt-rsave">${L({ en: 'Save rooms', nl: 'Zalen opslaan' })}</button></div></div>

    <div class="card"><h2>${L({ en: 'Dayparts', nl: 'Dagdelen' })}</h2>
      <p class="small muted">${L({ en: 'The blocks you rent out per day. A whole day counts as all dayparts for the occupancy.', nl: 'De blokken waarin je per dag verhuurt. Een hele dag telt voor de bezetting als alle dagdelen.' })}</p>
      <div id="mt-dps">${st.dayparts.map((d, i) => `<div class="mt-room" data-d="${i}"><input name="dname" value="${esc(d.name)}" aria-label="${L({ en: 'Name', nl: 'Naam' })}"><input type="time" name="dfrom" value="${esc(d.from || '')}" aria-label="${L({ en: 'From', nl: 'Van' })}"><input type="time" name="dto" value="${esc(d.to || '')}" aria-label="${L({ en: 'To', nl: 'Tot' })}">
        <button type="button" class="btn-sm btn-ghost" data-ddel="${i}" ${st.dayparts.length < 2 ? 'disabled' : ''} aria-label="${L({ en: 'Delete', nl: 'Verwijderen' })}">&#10005;</button></div>`).join('')}</div>
      <button type="button" class="btn-sm" id="mt-dadd">+ ${L({ en: 'Daypart', nl: 'Dagdeel' })}</button></div>

    <div class="card"><h2>${L({ en: 'VAT and prices', nl: 'Btw en prijzen' })}</h2>
      <div class="field" style="max-width:360px"><label>${L({ en: 'VAT rates you use (%)', nl: 'Btw-tarieven die je gebruikt (%)' })}</label><input id="mt-vats" value="${esc(st.vat_rates.join(', '))}" placeholder="21, 9, 0">
        <div class="tiny muted" style="margin-top:3px">${L({ en: 'Separated by commas. Which rate applies to room hire is for your accountant to say; 0 for exempt.', nl: 'Gescheiden door komma\'s. Welk tarief voor jouw zaalverhuur geldt, bepaalt je boekhouder; 0 voor vrijgesteld.' })}</div></div>
      <div class="field"><label>${L({ en: 'I type prices', nl: 'Ik voer prijzen in' })}</label><div class="ro-views"><button type="button" data-pi="0" class="${st.prices_incl ? '' : 'on'}">${L({ en: 'excl. VAT', nl: 'excl. btw' })}</button><button type="button" data-pi="1" class="${st.prices_incl ? 'on' : ''}">${L({ en: 'incl. VAT', nl: 'incl. btw' })}</button></div></div>
      <div class="field" style="max-width:360px"><label>${L({ en: 'Name above the overview', nl: 'Naam boven het overzicht' })}</label><input id="mt-name" value="${esc(st.name || '')}"></div></div>

    <div class="card"><h2>${L({ en: 'Cost categories', nl: 'Kostencategorieën' })}</h2>
      <div class="field"><textarea id="mt-cats" rows="7">${esc(st.categories.join('\n'))}</textarea><div class="tiny muted" style="margin-top:3px">${L({ en: 'One per line.', nl: 'Eén per regel.' })}</div></div></div>
    <button type="button" class="btn-primary" id="mt-ssave">${L({ en: 'Save settings', nl: 'Instellingen opslaan' })}</button>

    <div class="card" style="margin-top:16px" id="mt-access"><h2>${L({ en: 'Who has access', nl: 'Wie heeft toegang' })}</h2><div class="empty"><span class="spinner"></span></div></div>`;

    const readRooms = () => { rooms = $$('#mt-rooms [data-i]', body).map((el) => { const r = rooms[Number(el.dataset.i)]; const vat = Number(el.querySelector('[name=vat_rate]').value);
      return { ...r, name: el.querySelector('[name=name]').value.trim(), capacity: el.querySelector('[name=capacity]').value.trim() ? Number(el.querySelector('[name=capacity]').value) : null,
        price_daypart: fromTyped(parseMoney(el.querySelector('[name=price_daypart]').value), vat), price_day: fromTyped(parseMoney(el.querySelector('[name=price_day]').value), vat), vat_rate: vat, active: el.querySelector('[name=active]').checked, team_room_id: el.querySelector('[name=team_room_id]').value || null }; }); };
    const readSt = () => {
      st.dayparts = $$('#mt-dps [data-d]', body).map((el) => { const d = st.dayparts[Number(el.dataset.d)] || {}; const name = el.querySelector('[name=dname]').value.trim();
        return { id: d.id || `dp${Date.now().toString(36)}${el.dataset.d}`, name: name || d.name || '?', from: el.querySelector('[name=dfrom]').value, to: el.querySelector('[name=dto]').value }; });
      st.vat_rates = $('#mt-vats', body).value.split(/[;,\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => x >= 0 && !Number.isNaN(x) && x < 100);
      if (!st.vat_rates.length) st.vat_rates = [21];
      st.categories = $('#mt-cats', body).value.split('\n').map((x) => x.trim()).filter(Boolean);
      st.name = $('#mt-name', body).value.trim() || DEFAULTS.name;
    };
    const keep = () => { readRooms(); readSt(); };
    $('#mt-radd', body).onclick = () => { keep(); rooms.push({ name: '', active: true, vat_rate: st.vat_rates[0] ?? 21 }); draw2(); const ins = $$('#mt-rooms [name=name]', body); ins[ins.length - 1].focus(); };
    $$('[data-rdel]', body).forEach((b) => (b.onclick = () => { keep(); const r = rooms[Number(b.dataset.rdel)];
      if (r.id && D.bookings.some((x) => x.room_id === r.id)) { toastError(new Error(L({ en: 'This room has bookings: switch it off instead.', nl: 'Deze zaal heeft verhuur: zet hem uit in plaats van verwijderen.' }))); return; }
      rooms.splice(Number(b.dataset.rdel), 1); draw2(); }));
    const imp = $('#mt-rimport', body);
    if (imp) imp.onclick = async () => { const { rooms: tr } = await loadRooms(); const mine = tr.filter((r) => r.owner !== 'restaurant');
      if (!mine.length) return toast(L({ en: 'No rooms of the landlord in the Team app.', nl: 'Geen ruimtes van de verhuurder in de Team-app.' }));
      keep(); mine.forEach((r) => rooms.push({ name: r.name, capacity: r.capacity || null, active: true, vat_rate: 21, team_room_id: r.id })); draw2();
      toast(L({ en: 'Rooms taken over; fill in your prices and save.', nl: 'Ruimtes overgenomen; vul je prijzen in en sla op.' })); };
    $('#mt-rsave', body).onclick = async () => {
      keep();
      if (rooms.some((r) => !r.name)) return toastError(new Error(L({ en: 'Every room needs a name.', nl: 'Elke zaal heeft een naam nodig.' })));
      try {
        const gone = D.rooms.filter((r) => !rooms.some((x) => x.id === r.id));
        for (const r of gone) check(await sb.from('hire_rooms').delete().eq('id', r.id));
        for (const [i, r] of rooms.entries()) {
          const row = { name: r.name, capacity: r.capacity, price_daypart: r.price_daypart, price_day: r.price_day, vat_rate: r.vat_rate, active: r.active, team_room_id: r.team_room_id || null, sort_order: (i + 1) * 10 };
          if (r.id) check(await sb.from('hire_rooms').update(row).eq('id', r.id)); else check(await sb.from('hire_rooms').insert(row));
        }
        toast(L({ en: 'Rooms saved', nl: 'Zalen opgeslagen' })); await load(); rooms = D.rooms.map((r) => ({ ...r })); draw2();
      } catch (err) { toastError(err); }
    };
    $('#mt-dadd', body).onclick = () => { keep(); st.dayparts.push({ id: `dp${Date.now().toString(36)}`, name: L({ en: 'New', nl: 'Nieuw' }), from: '', to: '' }); draw2(); };
    $$('[data-ddel]', body).forEach((b) => (b.onclick = () => { keep(); st.dayparts.splice(Number(b.dataset.ddel), 1); draw2(); }));
    $$('[data-pi]', body).forEach((b) => (b.onclick = () => { keep(); st.prices_incl = b.dataset.pi === '1'; D.settings.prices_incl = st.prices_incl; draw2(); }));
    $('#mt-ssave', body).onclick = async () => {
      keep();
      try {
        check(await sb.from('hire_settings').upsert({ key: 'main', value: st, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
        D.settings = JSON.parse(JSON.stringify(st)); toast(L({ en: 'Settings saved', nl: 'Instellingen opgeslagen' })); draw2();
      } catch (err) { toastError(err); }
    };
    accessCard($('#mt-access', body), owner);
  };
  draw2();
}

// Access: only the owner sees and changes the list; a helper sees that Mette decides
async function accessCard(el, owner) {
  const head = `<h2>${L({ en: 'Who has access', nl: 'Wie heeft toegang' })}</h2>`;
  if (!owner) { el.innerHTML = `${head}<p class="small muted">${L({ en: 'Mette decides who sees this part. You have access as a helper.', nl: 'Mette bepaalt wie dit deel ziet. Jij hebt toegang als helper.' })}</p>`; return; }
  try {
    const [acc, people] = await Promise.all([sb.from('hire_access').select('user_id, role'), sb.rpc('hire_people')]);
    const list = check(acc) || []; const ppl = check(people) || [];
    const name = (id) => (ppl.find((p) => p.id === id) || {}).full_name || '?';
    const others = ppl.filter((p) => !list.some((a) => a.user_id === p.id));
    el.innerHTML = `${head}<p class="small muted">${L({ en: 'Only these people see your rooms and figures. Being a manager in the Team app is not enough.', nl: 'Alleen deze mensen zien je zalen en cijfers. Manager zijn in de Team-app is niet genoeg.' })}</p>
      ${list.map((a) => `<div class="mt-hrow"><span class="mt-hname">${esc(name(a.user_id))}</span><span class="tag">${a.role === 'owner' ? L({ en: 'owner', nl: 'eigenaar' }) : L({ en: 'helper', nl: 'helper' })}</span>
        ${a.user_id === state.me.id ? '<span></span>' : `<button type="button" class="btn-sm btn-ghost btn-danger" data-arm="${a.user_id}">${L({ en: 'Remove', nl: 'Weghalen' })}</button>`}</div>`).join('')}
      ${others.length ? `<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><select id="mt-aadd">${others.map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select><button type="button" class="btn-sm" id="mt-aaddb">+ ${L({ en: 'Give access', nl: 'Toegang geven' })}</button></div>` : ''}`;
    $$('[data-arm]', el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmDialog(L({ en: `Remove access for ${name(b.dataset.arm)}?`, nl: `Toegang weghalen voor ${name(b.dataset.arm)}?` }), L({ en: 'Remove', nl: 'Weghalen' })))) return;
      try { check(await sb.from('hire_access').delete().eq('user_id', b.dataset.arm)); accessCard(el, owner); } catch (e) { toastError(e); }
    }));
    const ab = $('#mt-aaddb', el);
    if (ab) ab.onclick = async () => { try { check(await sb.from('hire_access').insert({ user_id: $('#mt-aadd', el).value, role: 'helper' })); accessCard(el, owner); } catch (e) { toastError(e); } };
  } catch (e) { el.innerHTML = `${head}<p class="small muted">${esc(e.message)}</p>`; }
}

// Settings > Mette (managers): the way in, for whoever has access
export async function renderMetteSettings(el) {
  if (!hasHire()) await loadHireRole();
  el.innerHTML = `<div class="card"><h2>Mette</h2>
    <p class="small muted">${L({ en: 'The finance part for the room hire of Mette te Velde: her rooms, bookings per daypart or day, costs and a dashboard. Separate from the restaurant and from Finance.', nl: 'Het financegedeelte voor de zaalverhuur van Mette te Velde: haar zalen, verhuur per dagdeel of per dag, kosten en een dashboard. Los van het restaurant en van Finance.' })}</p>
    ${hasHire() ? `<a class="btn btn-primary" href="#/mette">${L({ en: 'Open Mette', nl: 'Naar Mette' })}</a>`
      : `<div class="note">${L({ en: 'Only Mette and the people she gives access see this part. Ask Mette if you need it.', nl: 'Alleen Mette en wie zij toegang geeft zien dit deel. Vraag het Mette als je erbij moet.' })}</div>`}</div>`;
}
