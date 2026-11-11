// Events with a BEO (Banqueting and Event Order).
// Everyone in the team can create and edit; managers can delete. Each save that changes something
// becomes a new version (the database keeps the old one), so the history shows who changed what.
// A confirmed event opens that day in the roster and the Finance calendar with a note (database trigger).
// Prints: client confirmation (EN or NL, to save as PDF), kitchen sheet and service sheet.
import { state, isManager, app, esc, fmt, toast, toastError, todayIso, nameOf, $, $$, openModal, confirmDialog, printHtml } from '../core.js';
import { t, tIn, lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { ALLERGENS } from './menu.js';
import { loadCompany, companyGaps, priceSummary, cancellationSchedule, suggestKind, KIND_LABEL, uvhL, VAT_RATES } from '../uvh.js';
import { sheetPdf } from '../sheet.js';
import { loadCourses, DRINK_CODES } from '../courses.js';
import { loadRooms } from '../rooms.js';
import { loadQuoteTexts, qt } from '../quotetexts.js';
const L = (o) => o[lang()] || o.en;

const STATUSES = ['option', 'confirmed', 'cancelled', 'done'];
const DRAFT = 'wintertuinEventDraft_';
const COURSES = ['course_welcome', 'course_bites', 'course_starter', 'course_soup', 'course_main', 'course_cheese', 'course_dessert', 'course_coffee', 'course_late'];
const DIETS = ['diet_vegetarian', 'diet_vegan', 'diet_pescatarian', 'diet_gluten', 'diet_lactose', 'diet_nuts', 'diet_shellfish', 'diet_halal', 'diet_kosher', 'diet_pregnant', 'diet_child'];
const STYLES = ['style_seated', 'style_family', 'style_buffet', 'style_walking', 'style_reception'];

// Field groups, used for the editor, the history and the prints
const SIMPLE = [
  ['title', 'ev_title'], ['event_type', 'ev_type'], ['event_date', 'ev_date'], ['start_time', 'ev_start'], ['end_time', 'ev_end'],
  ['status', 'ev_status'], ['option_until', 'ev_option_until'], ['sold_by', 'ev_sold_by'],
  ['client_name', 'ev_client_name'], ['client_company', 'ev_client_company'], ['client_phone', 'ev_phone'], ['client_email', 'ev_email'], ['newsletter_ok', 'ev_newsletter_ok'],
  ['day_contact_name', 'ev_day_contact'], ['day_contact_phone', 'ev_day_contact_phone'], ['invoice_details', 'ev_invoice'], ['reference', 'ev_reference'],
  ['guests_expected', 'ev_guests_expected'], ['guests_guaranteed', 'ev_guests_guaranteed'], ['guarantee_deadline', 'ev_guarantee_deadline'],
  ['guests_final', 'ev_guests_final'], ['children', 'ev_children'],
  ['area', 'ev_area'], ['exclusive', 'ev_exclusive'], ['setup', 'ev_setup'], ['service_style', 'ev_service_style'],
  ['drinks', 'ev_drinks'], ['extras', 'ev_extras'], ['staff_needed', 'ev_staff_needed'], ['staffing', 'ev_staffing'],
  ['price_per_person', 'ev_price_pp'], ['room_hire', 'ev_room_hire'], ['min_spend', 'ev_min_spend'], ['prices_incl_vat', 'ev_incl_vat'],
  ['deposit', 'ev_deposit'], ['deposit_due', 'ev_deposit_due'], ['deposit_paid', 'ev_deposit_paid'],
  ['payment_terms', 'ev_payment_terms'], ['cancellation_terms', 'ev_cancellation_terms'],
  ['client_type', 'ev_client_type'], ['agreement_kind', 'ev_agreement_kind'], ['quote_valid_until', 'ev_quote_valid_until'], ['corkage', 'ev_corkage'],
  ['deviations', 'ev_deviations'], ['uvh_sent_at', 'ev_uvh_sent_at'], ['uvh_received_at', 'ev_uvh_received_at'],
  ['notes_kitchen', 'ev_notes_kitchen'], ['notes_bar', 'ev_notes_bar'], ['notes_service', 'ev_notes_service'], ['notes_cleaning', 'ev_notes_cleaning'],
  ['notes_internal', 'ev_notes_internal'], ['client_confirmed_at', 'ev_confirmed_at'], ['client_confirmed_by', 'ev_confirmed_by'],
];
const LABEL = Object.fromEntries(SIMPLE.concat([['menu', 'ev_menu'], ['dietary', 'ev_dietary'], ['timeline', 'ev_timeline'], ['price_lines', 'ev_price_lines']]));
const NUM = new Set(['guests_expected', 'guests_guaranteed', 'guests_final', 'children', 'staff_needed']);
const MONEY = new Set(['price_per_person', 'room_hire', 'min_spend', 'deposit']);
const BOOL = new Set(['exclusive', 'deposit_paid', 'prices_incl_vat', 'newsletter_ok']);
// The newsletter box needs database update 011; until then the field is left out so saving keeps working
let hasNewsletterCol = null;
async function newsletterColumn() {
  if (hasNewsletterCol !== null) return hasNewsletterCol;
  try { const { error } = await sb.from('events').select('newsletter_ok').limit(1); hasNewsletterCol = !error; } catch { hasNewsletterCol = false; }
  return hasNewsletterCol;
}
const DATE = new Set(['event_date', 'option_until', 'guarantee_deadline', 'deposit_due', 'client_confirmed_at', 'quote_valid_until', 'uvh_sent_at', 'uvh_received_at']);
// The UVH fields need database update 014; until then they are left out so saving keeps working
let hasUvhCols = null;
async function uvhColumns() {
  if (hasUvhCols !== null) return hasUvhCols;
  try { const { error } = await sb.from('events').select('client_type, price_lines').limit(1); hasUvhCols = !error; } catch { hasUvhCols = false; }
  return hasUvhCols;
}
const UVH_KEYS = ['client_type', 'agreement_kind', 'quote_valid_until', 'corkage', 'deviations', 'uvh_sent_at', 'uvh_received_at', 'price_lines', 'quote_by'];
let company = {};

let menuItems = [];
let courses = { food: [], beverage: [] };
let rooms = { rooms: [], example: true, landlord: 'Mette te Velde' };
const guestsOf = (e) => e.guests_final ?? e.guests_guaranteed ?? e.guests_expected;
const statusTag = (s) => `<span class="tag ev-${esc(s)}">${t('evs_' + s)}</span>`;
const labelOf = (code) => (code && /^(course|diet|style)_/.test(code) ? t(code) : code || '');
const parseNum = (v) => { if (v == null || String(v).trim() === '') return null; const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
function loadDraft(k) { try { const r = localStorage.getItem(DRAFT + k); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveDraft(k, d) { try { localStorage.setItem(DRAFT + k, JSON.stringify(d)); } catch { /* private mode */ } }
function clearDraft(k) { try { localStorage.removeItem(DRAFT + k); } catch { /* private mode */ } }

export async function renderEvents(args = []) {
  await Promise.all([newsletterColumn(), uvhColumns(), loadCompany().then((c) => { company = c; }), loadQuoteTexts(), loadRooms().then((r) => { rooms = r; })]);
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  if (!menuItems.length) menuItems = check(await sb.from('menu_items').select('id, name, description, category, group_type, allergens, active, sort_order').order('group_type').order('sort_order').order('name')) || [];
  const [id, sub] = args;
  if (sub === 'edit' || id === 'new') courses = await loadCourses(menuItems);
  if (id === 'cal') { rememberView('cal'); return renderCalendar(sub); }
  if (!id && !sub && savedView() === 'cal') return renderCalendar();
  if (!id) { rememberView('list'); return renderList(sub); }
  if (id === 'new') return renderEditor(null, /^\d{4}-\d{2}-\d{2}$/.test(sub || '') ? sub : null);
  const ev = check(await sb.from('events').select('*').eq('id', id).maybeSingle());
  if (!ev) { toastError(new Error(t('ev_not_found'))); location.hash = '#/events'; return; }
  if (sub === 'edit') return renderEditor(ev);
  if (sub === 'history') return renderHistory(ev);
  return renderView(ev);
}

// ------------------------------------------------------------------ list
async function renderList(filter = 'upcoming') {
  const today = todayIso();
  let q = sb.from('events').select('id, title, event_type, event_date, start_time, end_time, status, client_name, client_company, guests_expected, guests_guaranteed, guests_final, area, version');
  if (filter === 'upcoming') q = q.gte('event_date', today).order('event_date').order('start_time');
  else if (filter === 'past') q = q.lt('event_date', today).order('event_date', { ascending: false });
  else q = q.order('event_date', { ascending: false });
  const rows = check(await q) || [];
  app().innerHTML = `${eventsHead()}
    <div class="ev-bar">${viewSwitch('list')}
      <div class="seg">${['upcoming', 'past', 'all'].map((f) => `<a href="#/events/list/${f}" class="seg-btn ${filter === f ? 'on' : ''}">${t('ev_f_' + f)}</a>`).join('')}</div></div>
    ${!rows.length ? `<div class="card empty">${t(filter === 'upcoming' ? 'ev_none_upcoming' : 'ev_none')}</div>` : `<div class="ev-list">${rows.map((e) => `
      <a class="card ev-row ${e.status === 'cancelled' ? 'is-cancelled' : ''}" href="#/events/${e.id}">
        <div class="ev-date"><span class="d">${new Date(`${e.event_date}T12:00:00`).getDate()}</span><span class="m">${esc(new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'nl-NL', { month: 'short' }).format(new Date(`${e.event_date}T12:00:00`)))}</span></div>
        <div class="ev-main"><div class="ev-title">${esc(e.title)}</div>
          <div class="small muted">${esc(fmt.date(e.event_date))}${e.start_time ? ` · ${fmt.time(e.start_time)}${e.end_time ? `–${fmt.time(e.end_time)}` : ''}` : ''}${e.client_company || e.client_name ? ` · ${esc(e.client_company || e.client_name)}` : ''}${e.area ? ` · ${esc(e.area)}` : ''}</div></div>
        <div class="ev-side">${statusTag(e.status)}${guestsOf(e) ? `<span class="ev-guests">${guestsOf(e)} ${t('ev_p')}</span>` : ''}</div>
      </a>`).join('')}</div>`}`;
  $$('[data-blank]').forEach((b) => (b.onclick = () => { b.closest('details').open = false; printBlank(b.dataset.blank); }));
}

// ------------------------------------------------------------------ calendar
// Same events as the list, laid out per month. Closed days come from the opening calendar in Wintertuin Finance.
// Laptop: month grid with the events written in. Phone: compact month with dots; tap a day to see its events.
const VIEW = 'wintertuinEventsView';
const savedView = () => { try { return localStorage.getItem(VIEW); } catch { return null; } };
const rememberView = (v) => { try { localStorage.setItem(VIEW, v); } catch { /* private mode */ } };
const viewSwitch = (on) => `<div class="seg"><a href="#/events/list" class="seg-btn ${on === 'list' ? 'on' : ''}">&#9776; ${t('ev_view_list')}</a><a href="#/events/cal" class="seg-btn ${on === 'cal' ? 'on' : ''}">&#128197; ${t('ev_view_cal')}</a></div>`;
function eventsHead() {
  return `    <div class="page-head"><div><h1>${t('nav_events')}</h1><div class="muted small">${t('ev_sub')}</div></div>
      <div class="page-actions">
        <details class="export-menu" style="position:relative"><summary class="btn btn-sm"><i class="ic ic-printer" aria-hidden="true"></i> ${t('ev_blank_beo')} &#9662;</summary>
          <div class="card" style="position:absolute;right:0;top:110%;z-index:10;display:flex;flex-direction:column;gap:6px;min-width:200px;padding:10px">
            <button type="button" class="btn-sm" data-blank="nl">Nederlands</button><button type="button" class="btn-sm" data-blank="en">English</button></div></details>
        <a class="btn btn-primary btn-sm" href="#/events/new">+ ${t('ev_new')}</a></div></div>
`;
}
let calSel = null; // selected day in the phone view
async function renderCalendar(month) {
  const today = todayIso();
  const ym = /^\d{4}-\d{2}$/.test(month || '') ? month : today.slice(0, 7);
  const first = new Date(`${ym}-01T12:00:00`);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday on or before the 1st
  const days = []; for (let d = new Date(start); days.length < 42; d.setDate(d.getDate() + 1)) days.push(d.toLocaleDateString('sv-SE'));
  while (days.length > 35 && days[35].slice(0, 7) !== ym) days.length = 35; // 5 weeks when the 6th is all next month
  const from = days[0]; const to = days[days.length - 1];
  const [rows, calRes] = await Promise.all([
    sb.from('events').select('id, title, event_date, start_time, end_time, status, client_name, client_company, guests_expected, guests_guaranteed, guests_final, area')
      .gte('event_date', from).lte('event_date', to).order('event_date').order('start_time'),
    sb.rpc('fin_public_calendar', { p_from: from, p_to: to }).then((r) => r, () => ({ data: [] })),
  ]);
  const events = check(rows) || [];
  const cal = Object.fromEntries(((calRes && calRes.data) || []).map((c) => [c.day, c]));
  const byDay = {}; events.forEach((e) => { (byDay[e.event_date] = byDay[e.event_date] || []).push(e); });
  if (!calSel || calSel.slice(0, 7) !== ym) calSel = today.slice(0, 7) === ym ? today : (days.find((d) => d.slice(0, 7) === ym && byDay[d]) || `${ym}-01`);
  const mgr = isManager();
  const loc = lang() === 'en' ? 'en-GB' : 'nl-NL';
  const monthName = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(first);
  const shift = (n) => { const d = new Date(first); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('sv-SE').slice(0, 7); };
  const wd = [...Array(7)].map((_, i) => new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(new Date(`${days[i]}T12:00:00`)));
  const closed = (d) => cal[d] && !cal[d].is_open;
  const dayNote = (d) => (cal[d] && cal[d].note && !/^Event:/.test(cal[d].note) ? cal[d].note : ''); // event notes come from these events themselves
  const chip = (e) => `<a class="ev-chip ev-${esc(e.status)}" href="#/events/${e.id}" title="${esc(e.title)}">${e.start_time || guestsOf(e) ? `<b>${e.start_time ? fmt.time(e.start_time) : ''}${guestsOf(e) ? `<span>${guestsOf(e)} ${t('ev_p')}</span>` : ''}</b>` : ''}<span class="ev-chip-t">${esc(e.title)}</span></a>`;
  app().innerHTML = `${eventsHead()}
    <div class="ev-bar">${viewSwitch('cal')}
      <div class="ev-month"><a class="btn btn-sm" href="#/events/cal/${shift(-1)}" aria-label="${t('ev_prev_month')}"><i class="ic ic-prev" aria-hidden="true"></i></a>
        <a class="btn btn-sm" href="#/events/cal/${today.slice(0, 7)}">${t('ev_this_month')}</a>
        <a class="btn btn-sm" href="#/events/cal/${shift(1)}" aria-label="${t('ev_next_month')}"><i class="ic ic-next" aria-hidden="true"></i></a>
        <strong class="ev-month-name">${esc(monthName)}</strong></div></div>
    <div class="card ev-cal">
      <div class="evc-grid">${wd.map((w) => `<div class="ev-wd">${esc(w)}</div>`).join('')}
        ${days.map((d) => `<div class="ev-day ${d.slice(0, 7) !== ym ? 'out' : ''} ${d === today ? 'today' : ''} ${closed(d) ? 'closed' : ''} ${mgr ? 'can-add' : ''}" data-day="${d}">
          <div class="ev-dn"><span>${Number(d.slice(8))}</span>${mgr ? `<a class="ev-add" href="#/events/new/${d}" aria-label="${t('ev_new_on')} ${esc(fmt.date(d))}">+</a>` : ''}</div>
          ${dayNote(d) ? `<div class="ev-note">${esc(dayNote(d))}</div>` : ''}
          ${(byDay[d] || []).map(chip).join('')}</div>`).join('')}</div>
      <div class="ev-mgrid">${wd.map((w) => `<div class="ev-wd">${esc(w.slice(0, 2))}</div>`).join('')}
        ${days.map((d) => `<button type="button" class="ev-mday ${d.slice(0, 7) !== ym ? 'out' : ''} ${d === today ? 'today' : ''} ${closed(d) ? 'closed' : ''} ${d === calSel ? 'sel' : ''}" data-sel="${d}">
          <span>${Number(d.slice(8))}</span><i>${(byDay[d] || []).slice(0, 3).map((e) => `<em class="evdot ev-${esc(e.status)}"></em>`).join('')}</i></button>`).join('')}</div>
      <div class="ev-mlist" id="ev-mlist"></div>
      <div class="ev-legend"><span><em class="evdot ev-confirmed"></em>${t('evs_confirmed')}</span><span><em class="evdot ev-option"></em>${t('evs_option')}</span><span><em class="evdot ev-cancelled"></em>${t('evs_cancelled')}</span><span><em class="sq"></em>${t('ev_closed_day')}</span></div>
    </div>`;
  const drawDay = () => {
    const list = byDay[calSel] || [];
    $('#ev-mlist').innerHTML = `<div class="ev-mhead"><strong>${esc(fmt.dateLong(calSel))}</strong>${closed(calSel) ? ` <span class="tag">${t('ev_closed_day')}</span>` : ''}</div>
      ${dayNote(calSel) ? `<div class="ev-note">${esc(dayNote(calSel))}</div>` : ''}
      ${list.length ? list.map((e) => `<a class="ev-mrow ev-${esc(e.status)}" href="#/events/${e.id}"><span class="t">${e.start_time ? fmt.time(e.start_time) : ''}</span>
        <span class="n"><strong>${esc(e.title)}</strong><span class="small muted">${[e.client_company || e.client_name, e.area].filter(Boolean).map(esc).join(' · ')}</span></span>
        <span class="s">${statusTag(e.status)}${guestsOf(e) ? `<span class="small">${guestsOf(e)} ${t('ev_p')}</span>` : ''}</span></a>`).join('')
        : `<div class="small muted" style="padding:8px 0">${t('ev_none_day')}</div>`}
      ${mgr ? `<a class="btn btn-sm" href="#/events/new/${calSel}" style="margin-top:8px">+ ${t('ev_new_on')} ${esc(fmt.date(calSel))}</a>` : ''}`;
  };
  drawDay();
  $$('[data-sel]').forEach((b) => (b.onclick = () => { calSel = b.dataset.sel; $$('.ev-mday.sel').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); drawDay(); }));
  // laptop: a click on the empty part of a day starts a new event on that day (managers)
  if (mgr) $$('.ev-day').forEach((c) => (c.onclick = (e) => { if (e.target.closest('a')) return; location.hash = `#/events/new/${c.dataset.day}`; }));
  $$('[data-blank]').forEach((b) => (b.onclick = () => { b.closest('details').open = false; printBlank(b.dataset.blank); }));
}

// ------------------------------------------------------------------ view (the BEO on screen)
async function renderView(ev) {
  const shifts = check(await sb.from('shifts').select('*, profiles:staff_id(full_name)').eq('shift_date', ev.event_date).order('start_time')) || [];
  const v = (k) => display(k, ev[k]);
  const row = (k) => (ev[k] == null || ev[k] === '' || ev[k] === false ? '' : `<div class="ev-kv"><span>${t(LABEL[k])}</span><span>${v(k)}</span></div>`);
  const block = (title, html) => (html.trim() ? `<div class="card ev-block"><h3>${title}</h3>${html}</div>` : '');
  const g = guestsOf(ev);
  const allAllergens = [...new Set((ev.menu || []).flatMap((m) => m.allergens || []))];
  const staffWarn = ev.staff_needed && shifts.length < ev.staff_needed;
  app().innerHTML = `
    <a class="settings-back" href="#/events" style="display:inline-block;margin-bottom:8px"><i class="ic ic-prev" aria-hidden="true"></i> ${t('nav_events')}</a>
    <div class="page-head"><div><h1>${esc(ev.title)}</h1>
        <div class="muted small">${esc(fmt.dateLong(ev.event_date))}${ev.start_time ? ` · ${fmt.time(ev.start_time)}${ev.end_time ? `–${fmt.time(ev.end_time)}` : ''}` : ''} · ${statusTag(ev.status)}
          <a href="#/events/${ev.id}/history" class="small" style="margin-left:6px">v${ev.version} · ${t('ev_history')}</a></div></div>
      <div class="page-actions">
        <a class="btn btn-primary btn-sm" href="#/events/${ev.id}/edit">${t('edit')}</a>
        ${ev.client_email ? `<button type="button" class="btn-sm" id="ev-mail"><i class="ic ic-share" aria-hidden="true"></i> ${L2(`${docName(ev, 'nl')} mailen`, `E-mail the ${docName(ev, 'en').toLowerCase()}`)}</button>` : ''}
        <details class="export-menu" style="position:relative"><summary class="btn btn-sm"><i class="ic ic-printer" aria-hidden="true"></i> ${t('print')} &#9662;</summary>
          <div class="card" style="position:absolute;right:0;top:110%;z-index:10;display:flex;flex-direction:column;gap:6px;min-width:240px;padding:10px">
            <button type="button" class="btn-sm" data-print="client-nl">${docName(ev, 'nl')} (NL)</button>
            <button type="button" class="btn-sm" data-print="client-en">${docName(ev, 'en')} (EN)</button>
            ${ev.quote_by === 'landlord' ? '' : `<button type="button" class="btn-sm" data-print="kitchen">${t('ev_print_kitchen')}</button>
            <button type="button" class="btn-sm" data-print="service">${t('ev_print_service')}</button>`}
          </div></details>
        ${isManager() ? `<button type="button" class="btn-sm btn-ghost btn-danger" id="del">${t('delete')}</button>` : ''}</div></div>
    ${ev.status === 'option' && ev.option_until ? `<div class="note" style="margin:0 0 12px">${t('ev_option_note', { d: esc(fmt.dateLong(ev.option_until)) })}</div>` : ''}
    ${uvhWarnings(ev)}
    ${ev.guarantee_deadline && !ev.guests_final && ev.status !== 'cancelled' ? `<div class="note" style="margin:0 0 12px">${t('ev_guarantee_note', { d: esc(fmt.dateLong(ev.guarantee_deadline)) })}</div>` : ''}
    <div class="ev-kpis">
      <div class="card kpi"><div class="label">${t('ev_guests')}</div><div class="value">${g ?? '–'}</div>
        <div class="tiny muted">${[ev.guests_expected != null ? `${t('ev_g_exp')} ${ev.guests_expected}` : '', ev.guests_guaranteed != null ? `${t('ev_g_guar')} ${ev.guests_guaranteed}` : '', ev.guests_final != null ? `${t('ev_g_final')} ${ev.guests_final}` : ''].filter(Boolean).join(' · ')}</div></div>
      <div class="card kpi"><div class="label">${t('ev_dietary')}</div><div class="value">${(ev.dietary || []).reduce((a, d) => a + (Number(d.count) || 0), 0)}</div><div class="tiny muted">${t('ev_special_requests')}</div></div>
      <div class="card kpi"><div class="label">${t('ev_staff_rostered')}</div><div class="value ${staffWarn ? 'txt-red' : ''}">${shifts.length}${ev.staff_needed ? ` / ${ev.staff_needed}` : ''}</div><div class="tiny muted">${staffWarn ? t('ev_staff_short') : t('ev_from_roster')}</div></div>
      <div class="card kpi"><div class="label">${t('ev_expected_revenue')}</div><div class="value">${fmt.money(expectedRevenue(ev)) || '–'}</div><div class="tiny muted">${t('ev_incl_vat_short')}</div></div>
    </div>
    <div class="grid grid-2 ev-grid">
      ${block(t('ev_sec_event'), ['event_type', 'area', 'exclusive', 'service_style', 'option_until', 'sold_by'].map(row).join(''))}
      ${block(t('ev_sec_client'), ['client_name', 'client_company', 'client_phone', 'client_email', 'newsletter_ok', 'day_contact_name', 'day_contact_phone', 'reference', 'invoice_details'].map(row).join(''))}
      ${block(t('ev_timeline'), (ev.timeline || []).length ? `<table class="ev-table">${ev.timeline.map((x) => `<tr><td class="ev-time">${esc(x.time || '')}</td><td>${esc(x.what || '')}</td></tr>`).join('')}</table>` : '')}
      ${block(t('ev_menu'), (ev.menu || []).length ? `<table class="ev-table">${ev.menu.map((m) => `<tr><td class="ev-course">${esc(labelOf(m.course))}</td><td><strong>${esc(m.name || '')}</strong>
          ${(m.allergens || []).length ? `<div class="allergen-chips">${m.allergens.map((a) => `<span class="tag allergen">${esc(t('al_' + a))}</span>`).join('')}</div>` : ''}</td></tr>`).join('')}</table>
          ${allAllergens.length ? `<div class="tiny muted" style="margin-top:8px">${t('ev_allergens_in_menu')}: ${allAllergens.map((a) => esc(t('al_' + a))).join(', ')}</div>` : ''}` : '')}
      ${block(t('ev_dietary'), (ev.dietary || []).length ? `<table class="ev-table">${ev.dietary.map((d) => `<tr><td class="ev-time">${esc(String(d.count ?? ''))}×</td><td><strong>${esc(labelOf(d.type))}</strong>${d.who ? ` <span class="muted">· ${esc(d.who)}</span>` : ''}</td></tr>`).join('')}</table>` : '')}
      ${block(t('ev_sec_setup'), ['setup', 'drinks', 'extras'].map(row).join(''))}
      ${block(t('ev_sec_staff'), `${row('staff_needed')}${row('staffing')}${shifts.length ? `<table class="ev-table" style="margin-top:6px">${shifts.map((s) => `<tr><td class="ev-time">${fmt.time(s.start_time)}–${fmt.time(s.end_time)}</td><td>${esc(s.profiles ? s.profiles.full_name : '')}${s.section ? ` <span class="muted">· ${esc(s.section)}</span>` : ''}</td></tr>`).join('')}</table>` : `<div class="small muted">${t('ev_no_shifts')} <a href="#/roster">${t('nav_roster')}</a></div>`}`)}
      ${block(t('ev_sec_money'), moneyBlock(ev) + ['client_type', 'min_spend', 'deposit', 'deposit_due', 'deposit_paid', 'quote_valid_until', 'corkage', 'payment_terms', 'deviations', 'cancellation_terms', 'uvh_sent_at', 'uvh_received_at'].map(row).join(''))}
      ${block(L2('Annuleren volgens de UVH', 'Cancellation under the UVH'), scheduleHtml(ev))}
      ${block(t('ev_sec_departments'), ['notes_kitchen', 'notes_bar', 'notes_service', 'notes_cleaning'].map(row).join(''))}
      ${block(t('ev_sec_internal'), ['notes_internal', 'client_confirmed_at', 'client_confirmed_by'].map(row).join(''))}
    </div>
    <div class="tiny muted" style="margin-top:10px">${t('ev_last_change', { v: ev.version, who: esc(ev.updated_by ? nameOf(ev.updated_by) : '?'), when: esc(fmt.dateTime(ev.updated_at)) })}</div>`;
  $$('[data-print]').forEach((b) => (b.onclick = () => {
    b.closest('details').open = false;
    const k = b.dataset.print;
    if (k.startsWith('client')) printClient(ev, k.slice(7));
    else if (k === 'kitchen') printKitchen(ev);
    else printService(ev, shifts);
  }));
  const mail = $('#ev-mail'); if (mail) mail.onclick = async () => {
    // a second tap after "the PDF is ready" shares straight away (iPhone wants a fresh tap)
    if (pendingShare) { const ps = pendingShare; pendingShare = null; try { await navigator.share({ files: [ps.file], title: ps.subject, text: ps.text }); } catch { /* closed */ } return; }
    mailQuote(ev, mail);
  };
  const del = $('#del');
  if (del) del.onclick = async () => {
    if (!(await confirmDialog(t('ev_confirm_delete'), t('delete')))) return;
    try { check(await sb.from('events').delete().eq('id', ev.id)); toast(t('deleted')); location.hash = '#/events'; } catch (e) { toastError(e); }
  };
}

// Reservation value (UVH art. 1.6): the expected revenue including VAT, at least the minimum spend
function expectedRevenue(ev) { return priceSummary(ev, guestsOf(ev)).value; }

const L2 = (nl, en) => (lang() === 'nl' ? nl : en);
const docName = (ev, l) => (ev.status === 'option' ? (l === 'nl' ? 'Offerte' : 'Quote') : (l === 'nl' ? 'Bevestiging' : 'Confirmation'));
const euro = (n, l) => new Intl.NumberFormat((l || lang()) === 'nl' ? 'nl-NL' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
// What is still missing before this can go to the client
function uvhWarnings(ev) {
  if (ev.status === 'cancelled' || ev.status === 'done') return '';
  const w = [];
  if (hasUvhCols && !ev.client_type) w.push(L2('kies zakelijk of particulier', 'choose business or private'));
  if (companyGaps(company).length) w.push(`<a href="#/settings/company">${L2('bedrijfsgegevens invullen', 'fill in the company details')}</a>`);
  if (!company.uvh_url) w.push(`<a href="#/settings/company">${L2('UVH-pdf toevoegen', 'add the UVH PDF')}</a>`);
  if (!priceSummary(ev, guestsOf(ev)).lines.length) w.push(L2('prijsregels invullen', 'add price lines'));
  return w.length ? `<div class="note ev-uvh-note" style="margin:0 0 12px"><strong>${L2('Voor de offerte nog', 'Before the quote')}:</strong> ${w.join(', ')}.</div>` : '';
}
function moneyBlock(ev) {
  const ps = priceSummary(ev, guestsOf(ev));
  if (!ps.lines.length) return '';
  return `<table class="ev-table ev-price">${ps.lines.map((x) => `<tr><td>${esc(x.label || (x.room ? t('ev_room_hire') : t('ev_price_pp')))}</td><td class="num">${x.per === 'pp' ? `${x.qty} × ` : x.qty !== 1 ? `${x.qty} × ` : ''}${euro(x.price)}</td><td class="num muted">${Math.round(x.vat * 100)}%</td><td class="num">${euro(x.total)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="3">${L2('Totaal incl. btw', 'Total incl. VAT')}${ps.byRate.length ? `<div class="tiny muted">${ps.byRate.map((r) => `${L2('btw', 'VAT')} ${Math.round(r.rate * 100)}%: ${euro(r.vat)}`).join(' · ')}</div>` : ''}</td><td class="num">${euro(ps.total)}</td></tr></table>
    ${ps.minApplies ? `<div class="tiny muted">${L2('De minimale besteding is hoger: die geldt.', 'The minimum spend is higher: that applies.')}</div>` : ''}
    ${ps.external.length ? `<div class="tiny muted" style="margin-top:6px">${esc(L2(`Factureert ${rooms.landlord} zelf aan de gast`, `Invoiced by ${rooms.landlord} to the guest`))}: ${ps.external.map((x) => `${esc(x.label || t('ev_room_hire'))} ${euro(x.total)}`).join(', ')}</div>` : ''}`;
}
function scheduleHtml(ev, l) {
  if (!hasUvhCols) return '';
  const sch = cancellationSchedule(ev, expectedRevenue(ev), l || lang());
  if (!sch) return '';
  if (sch.kind === 'private') return `<p class="small">${esc(sch.text)}</p>`;
  return `<div class="tiny muted">${esc(uvhL(KIND_LABEL[sch.kind], l || lang()))}</div><table class="ev-table">${sch.rows.map((r) => `<tr><td>${esc(r.when)}</td><td class="num">${r.pct ? `${r.pct}%` : L2('kosteloos', 'free')}</td><td class="num">${esc(r.amountText)}</td></tr>`).join('')}</table>
    ${(sch.rules || []).map((x) => `<p class="tiny muted" style="margin:6px 0 0">${esc(x)}</p>`).join('')}`;
}
// Open the mail program with the quote text and the UVH link; the PDF of the quote you attach yourself
// Mail the quote: the PDF goes along as an attachment through the share sheet of the phone (Gmail, Mail),
// so it is sent from the account chosen there (for example wintertuinrestaurant@gmail.com).
// Where a browser cannot share files: the PDF is downloaded and the mail opens, to attach it by hand.
async function mailQuote(ev, btn) {
  const l = 'nl';
  const name = docName(ev, l);
  const subject = `${name} ${ev.title}, ${dateIn(ev.event_date, l)}`;
  let body = qt(l, 'mail', {
    voornaam: (ev.client_name || '').trim().split(/\s+/)[0] || '', event: ev.title, datum: dateIn(ev.event_date, l),
    de_offerte: name === 'Offerte' ? 'de offerte' : 'de bevestiging',
    geldig_tot: ev.status === 'option' && ev.quote_valid_until ? `De offerte is geldig tot en met ${dateIn(ev.quote_valid_until, l)}.` : '',
    uvh_link: company.uvh_url ? `Je kunt ze hier lezen en opslaan: ${company.uvh_url}` : '',
  });
  // a quote of the landlord: signed by her, without the UVH (those are for the restaurant)
  if (ev.quote_by === 'landlord') body = body.split('\n').filter((x) => !/UVH/.test(x)).join('\n').replace(/Het Wintertuin team|The Wintertuin team/, rooms.landlord).replace(/\n{3,}/g, '\n\n');
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${esc(L({ en: 'Making PDF…', nl: 'Pdf maken…' }))}`; }
  let file = null;
  try { file = await sheetPdf(clientHtml(ev, l), quoteFileName(ev, l)); }
  catch (e) { toastError(e); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  const mark = async () => { if (hasUvhCols && !ev.uvh_sent_at) { try { check(await sb.from('events').update({ uvh_sent_at: todayIso() }).eq('id', ev.id)); ev.uvh_sent_at = todayIso(); } catch { /* the mail still goes */ } } };
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    // the address goes on top, so it can be copied into the To field
    const text = `${ev.client_email ? `Aan: ${ev.client_email}\nOnderwerp: ${subject}\n\n` : ''}${body}`;
    try { await navigator.share({ files: [file], title: subject, text }); await mark(); return; }
    catch (e) {
      if (e.name === 'AbortError') return;
      if (e.name === 'NotAllowedError') { pendingShare = { file, subject, text }; toast(L({ en: 'The PDF is ready. Tap Mail quote again.', nl: 'De pdf is klaar. Tik nog een keer op Offerte mailen.' })); return; }
    }
  }
  if (file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); }
  location.href = `mailto:${encodeURIComponent(ev.client_email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  toast(L({ en: 'The PDF is in your downloads: attach it to the mail.', nl: 'De pdf staat in je downloads: voeg hem toe aan de mail.' }));
  await mark();
}
let pendingShare = null;

// One value, readable (screen and history)
function display(k, val, l) {
  const tt = (key, vars) => (l ? tIn(l, key, vars) : t(key, vars));
  if (val == null || val === '') return '';
  if (BOOL.has(k)) return val ? tt('yes') : tt('no');
  if (MONEY.has(k)) return esc(new Intl.NumberFormat(l === 'nl' || (!l && lang() === 'nl') ? 'nl-NL' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(Number(val)));
  if (DATE.has(k)) return esc(dateIn(val, l));
  if (k === 'status') return tt('evs_' + val);
  if (k === 'client_type') return tt(val === 'private' ? 'ev_ct_private' : 'ev_ct_business');
  if (k === 'agreement_kind') return esc(uvhL(KIND_LABEL[val] || { en: val }, l || lang()));
  if (k === 'price_lines') return esc((val || []).map((x) => `${x.label || ''} ${x.per === 'pp' ? 'p.p.' : `${x.qty || 1}×`} € ${x.price ?? ''} (${Math.round(Number(x.vat) * 100)}%)`).join('; '));
  if (k === 'sold_by') return esc(nameOf(val));
  if (k === 'start_time' || k === 'end_time') return esc(fmt.time(val));
  if (k === 'service_style') return esc(l ? (/^style_/.test(val) ? tIn(l, val) : val) : labelOf(val));
  if (k === 'menu') return esc((val || []).map((m) => `${m.course ? `${l ? tIn(l, m.course) : labelOf(m.course)}: ` : ''}${m.name || ''}`).join('; '));
  if (k === 'dietary') return esc((val || []).map((d) => `${d.count || ''}× ${labelOf(d.type)}${d.who ? ` (${d.who})` : ''}`).join('; '));
  if (k === 'timeline') return esc((val || []).map((x) => `${x.time || ''} ${x.what || ''}`.trim()).join('; '));
  return `<span class="pre">${esc(String(val))}</span>`;
}
function dateIn(iso, l) {
  const loc = (l || lang()) === 'nl' ? 'nl-NL' : 'en-GB';
  return new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${String(iso).slice(0, 10)}T12:00:00`));
}

// ------------------------------------------------------------------ editor
function renderEditor(ev, date = null) {
  const key = ev ? ev.id : 'new';
  const draft = loadDraft(key);
  const base = ev ? { ...ev } : { status: 'option', event_date: todayIso(), prices_incl_vat: true, exclusive: false, deposit_paid: false, menu: [], dietary: [], timeline: [], sold_by: state.me.id };
  const v = draft ? { ...base, ...draft } : base;
  if (date) v.event_date = date; // started from a day in the calendar
  const nlCol = hasNewsletterCol === true || !!(ev && 'newsletter_ok' in ev);
  const uvhOn = hasUvhCols === true || !!(ev && 'price_lines' in ev);
  if (uvhOn && !ev && !v.quote_valid_until) { const d = new Date(); d.setDate(d.getDate() + (Number(company.quote_days) || 14)); v.quote_valid_until = d.toISOString().slice(0, 10); }
  const people = state.profiles.filter((p) => p.active !== false || p.id === v.sold_by);
  const inp = (k, type = 'text', extra = '') => {
    const val = v[k] == null ? '' : (type === 'time' ? fmt.time(v[k]) : v[k]);
    return `<div class="field"><label for="f-${k}">${t(LABEL[k])}</label><input id="f-${k}" name="${k}" type="${type === 'number' || type === 'money' ? 'text' : type}" ${type === 'number' || type === 'money' ? 'inputmode="decimal"' : ''} value="${esc(val)}" ${extra}></div>`;
  };
  const area = (k, rows = 3, ph = '') => `<div class="field"><label for="f-${k}">${t(LABEL[k])}</label><textarea id="f-${k}" name="${k}" rows="${rows}" ${ph ? `placeholder="${esc(ph)}"` : ''}>${esc(v[k] || '')}</textarea></div>`;
  const chk = (k) => `<div class="field"><label class="check"><input type="checkbox" name="${k}" ${v[k] ? 'checked' : ''}> ${t(LABEL[k])}</label></div>`;
  const sec = (title, html, hint = '') => `<section class="card ev-form-sec"><h2>${title}</h2>${hint ? `<p class="small muted" style="margin-top:-6px">${hint}</p>` : ''}${html}</section>`;
  const grid = (...xs) => `<div class="ev-fgrid">${xs.join('')}</div>`;
  const menuOpts = (sel) => `<option value="">${t('ev_free_text')}</option>${menuItems.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.active === false ? ` (${t('inactive')})` : ''}</option>`).join('')}`;
  const courseList = `<datalist id="ev-courses">${COURSES.map((c) => `<option value="${esc(t(c))}">`).join('')}</datalist>`;
  const dietList = `<datalist id="ev-diets">${DIETS.map((c) => `<option value="${esc(t(c))}">`).join('')}</datalist>`;
  const styleList = `<datalist id="ev-styles">${STYLES.map((c) => `<option value="${esc(t(c))}">`).join('')}</datalist>`;

  app().innerHTML = `
    <a class="settings-back" href="${ev ? `#/events/${ev.id}` : '#/events'}" style="display:inline-block;margin-bottom:8px"><i class="ic ic-prev" aria-hidden="true"></i> ${ev ? esc(ev.title) : t('nav_events')}</a>
    <div class="page-head"><div><h1>${ev ? t('ev_edit') : t('ev_new')}</h1><div class="muted small">${t('ev_form_sub')}</div></div></div>
    ${draft ? `<div class="note" style="margin:0 0 12px">${t('draft_restored')} <button type="button" class="btn-link" id="drop-draft">${t('ev_drop_draft')}</button></div>` : ''}
    <form id="ev-form" autocomplete="off">${courseList}${dietList}${styleList}
      ${sec(t('ev_sec_event'), grid(
        inp('title', 'text', 'required maxlength="120"'), inp('event_type', 'text', `placeholder="${esc(t('ev_type_ph'))}"`),
        inp('event_date', 'date', 'required'), inp('start_time', 'time'), inp('end_time', 'time'),
        `<div class="field"><label for="f-status">${t('ev_status')}</label><select id="f-status" name="status">${STATUSES.map((s) => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${t('evs_' + s)}</option>`).join('')}</select></div>`,
        inp('option_until', 'date'),
        `<div class="field"><label for="f-sold_by">${t('ev_sold_by')}</label><select id="f-sold_by" name="sold_by"><option value=""></option>${people.map((p) => `<option value="${p.id}" ${p.id === v.sold_by ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></div>`,
      ), t('ev_confirm_hint'))}
      ${sec(t('ev_sec_client'), grid(inp('client_name'), inp('client_company'), inp('client_phone', 'tel'), inp('client_email', 'email'),
        inp('day_contact_name'), inp('day_contact_phone', 'tel'), inp('reference')) + (nlCol ? chk('newsletter_ok') : '') + area('invoice_details', 2))}
      ${sec(t('ev_guests'), grid(inp('guests_expected', 'number'), inp('guests_guaranteed', 'number'), inp('guarantee_deadline', 'date'), inp('guests_final', 'number'), inp('children', 'number')))}
      ${sec(t('ev_dietary'), `<div id="rows-dietary"></div><button type="button" class="btn-sm" data-addrow="dietary">+ ${t('ev_add_diet')}</button>`, t('ev_dietary_hint'))}
      ${sec(t('ev_sec_setup'), `<div class="field"><span class="lbl-like">${L2('Ruimtes', 'Rooms')}</span><div class="ev-rooms">${rooms.rooms.map((r) => `<label class="ev-room"><input type="checkbox" data-room="${esc(r.id)}"> <span>${esc(r.name)}${r.hire != null ? ` <span class="tiny muted">${euro(r.hire)}</span>` : ''}</span></label>`).join('')}</div>
        <div class="hint">${L2('Een ruimte aanvinken zet de zaalhuur bij de prijzen (21% btw); uitvinken haalt hem weg.', 'Ticking a room adds its room hire to the prices (21% VAT); unticking removes it.')} ${isManager() ? L2(`Namen en prijzen pas je aan onder <a href="#/settings/rooms">Instellingen, Ruimtes</a>.${rooms.example ? ' <strong>Dit zijn nog voorbeelden.</strong>' : ''}`, `Names and prices are set under <a href="#/settings/rooms">Settings, Rooms</a>.${rooms.example ? ' <strong>These are still examples.</strong>' : ''}`) : ''}</div></div>` + grid(inp('area', 'text', `placeholder="${esc(t('ev_area_ph'))}"`), inp('service_style', 'text', 'list="ev-styles"')) + chk('exclusive') + area('setup', 3, t('ev_setup_ph')))}
      ${sec(t('ev_timeline'), `<div id="rows-timeline"></div><button type="button" class="btn-sm" data-addrow="timeline">+ ${t('ev_add_time')}</button>`, t('ev_timeline_hint'))}
      ${sec(t('ev_menu'), `<h3 class="ev-mh">${t('group_food')}</h3><div id="rows-menu-food" class="rows-menu"></div><button type="button" class="btn-sm" data-addmenu="food">+ ${L2('Gerecht toevoegen', 'Add dish')}</button>
        <h3 class="ev-mh">${t('group_beverage')}</h3><div id="rows-menu-beverage" class="rows-menu"></div><button type="button" class="btn-sm" data-addmenu="beverage">+ ${L2('Drank toevoegen', 'Add drink')}</button>
        <p class="tiny muted" style="margin-top:10px">${isManager() ? L2('De lijst met gangen pas je aan onder <a href="#/settings/courses">Instellingen, Gangen voor events</a>.', 'Change the list of courses under <a href="#/settings/courses">Settings, Courses for events</a>.') : ''}</p>`, t('ev_menu_hint'))}
      ${sec(t('ev_sec_drinks_extras'), area('drinks', 3, t('ev_drinks_ph')) + area('extras', 3, t('ev_extras_ph')))}
      ${sec(t('ev_sec_staff'), grid(inp('staff_needed', 'number')) + area('staffing', 2, t('ev_staffing_ph')), t('ev_staff_hint'))}
      ${uvhOn ? sec(t('ev_sec_money'), `
        <div class="field"><span class="lbl-like">${L2('Offerte van', 'Quote from')}</span><div class="ro-views ev-qb">${[['restaurant', L2('Wintertuin: eten, drinken en zaal', 'Wintertuin: food, drinks and room')], ['landlord', L2(`${rooms.landlord}: alleen zaalhuur`, `${rooms.landlord}: room hire only`)]].map(([k, lab]) => `<label class="${(v.quote_by || 'restaurant') === k ? 'on' : ''}"><input type="radio" name="quote_by" value="${k}" ${(v.quote_by || 'restaurant') === k ? 'checked' : ''}> ${esc(lab)}</label>`).join('')}</div>
          <div class="hint">${esc(L2(`Bij een event met eten en drinken factureren wij alles, ook de zaal; ${rooms.landlord} factureert ons daarna de zaalhuur. Alleen een zaal zonder eten en drinken? Kies ${rooms.landlord}: de offerte komt dan op haar naam en zij factureert zelf.`, `With food and drinks we invoice everything, the room too; ${rooms.landlord} then invoices us. A room only, without food and drinks? Choose ${rooms.landlord}: the quote is in her name and she invoices herself.`))}</div></div>
        <div class="field"><span class="lbl-like">${t('ev_client_type')}</span><div class="ro-views ev-ct">${['business', 'private'].map((k) => `<label class="${v.client_type === k ? 'on' : ''}"><input type="radio" name="client_type" value="${k}" ${v.client_type === k ? 'checked' : ''}> ${t(k === 'private' ? 'ev_ct_private' : 'ev_ct_business')}</label>`).join('')}</div>
          <div class="hint">${L2('Bepaalt de btw-weergave en de annuleringsregels (UVH art. 13 of 14).', 'Sets how VAT is shown and the cancellation rules (UVH art. 13 or 14).')}</div></div>
        <div class="field"><span class="lbl-like">${t('ev_price_lines')}</span><div id="rows-price"></div>
          <div class="ev-quick">${[['Diner p.p.', 'pp', 0.09], ['Lunch p.p.', 'pp', 0.09], ['Drankarrangement alcoholvrij p.p.', 'pp', 0.09], ['Wijnarrangement p.p.', 'pp', 0.21], ['Zaalhuur', 'fixed', 0.21]].map(([lab, per, vat]) => `<button type="button" class="btn-sm" data-addprice="${esc(lab)}|${per}|${vat}">+ ${esc(lab)} ${Math.round(vat * 100)}%</button>`).join('')}
            <button type="button" class="btn-sm" data-addprice="|pp|0.09">+ ${L2('Andere regel', 'Other line')}</button></div>
          <div class="hint">${L2('Prijzen inclusief btw. Eten en alcoholvrij 9%, alcohol en zaalhuur 21%. Per persoon rekent met het aantal gasten.', 'Prices including VAT. Food and soft drinks 9%, alcohol and room hire 21%. Per person uses the number of guests.')}</div>
          <div id="price-total" class="ev-price-total"></div></div>
        ${grid(inp('min_spend', 'money'), inp('deposit', 'money'), inp('deposit_due', 'date'), inp('quote_valid_until', 'date'))}
        ${chk('deposit_paid')}
        <div class="field"><label for="f-agreement_kind">${t('ev_agreement_kind')}</label><select id="f-agreement_kind" name="agreement_kind"><option value="">${L2('Automatisch', 'Automatic')}: ${esc(uvhL(KIND_LABEL[suggestKind(v)]))}</option>${Object.keys(KIND_LABEL).map((k) => `<option value="${k}" ${v.agreement_kind === k ? 'selected' : ''}>${esc(uvhL(KIND_LABEL[k]))}</option>`).join('')}</select>
          <div class="hint">${L2('Alleen voor zakelijke gasten; voor particulieren geldt UVH art. 14.', 'Business clients only; private clients fall under UVH art. 14.')}</div></div>
        ${inp('corkage', 'text', `placeholder="${esc(L2('Bijvoorbeeld: eigen taart € 2,50 p.p.', 'For example: own cake € 2.50 p.p.'))}"`)}
        ${area('deviations', 2, L2('Alleen als je iets anders afspreekt dan de UVH, bijvoorbeeld een andere annuleringsregeling.', 'Only when you agree something other than the UVH, such as a different cancellation rule.'))}
        ${area('payment_terms', 2)}${v.cancellation_terms ? area('cancellation_terms', 2) : ''}
        ${grid(inp('uvh_sent_at', 'date'), inp('uvh_received_at', 'date'))}`, L2('De offerte rekent btw per tarief en het annuleringsschema uit de UVH zelf uit.', 'The quote works out VAT per rate and the UVH cancellation schedule by itself.'))
      : sec(t('ev_sec_money'), grid(inp('price_per_person', 'money'), inp('room_hire', 'money'), inp('min_spend', 'money'), inp('deposit', 'money'), inp('deposit_due', 'date'))
        + chk('prices_incl_vat') + chk('deposit_paid') + area('payment_terms', 2) + area('cancellation_terms', 2))}
      ${sec(t('ev_sec_departments'), area('notes_kitchen') + area('notes_bar') + area('notes_service') + area('notes_cleaning'), t('ev_departments_hint'))}
      ${sec(t('ev_sec_internal'), area('notes_internal', 3) + grid(inp('client_confirmed_at', 'date'), inp('client_confirmed_by')), t('ev_internal_hint'))}
      <div class="ev-savebar"><a class="btn" href="${ev ? `#/events/${ev.id}` : '#/events'}" id="cancel">${t('cancel')}</a>
        <button class="btn-primary" type="submit">${t('save')}</button></div>
    </form>`;

  // older events: price per person and room hire become price lines the first time you edit them
  const startPrices = (v.price_lines || []).length ? v.price_lines : priceSummary(v, guestsOf(v)).lines.map((x) => ({ label: x.room ? 'Zaalhuur' : 'Prijs p.p.', per: x.per, qty: x.per === 'pp' ? null : x.qty, price: x.price, vat: x.vat }));
  const groupOf = (m) => m.group || ((menuItems.find((x) => x.id === m.item_id) || {}).group_type) || (DRINK_CODES.has(m.course) ? 'beverage' : 'food');
  const lists = { menu: (v.menu || []).map((m) => ({ ...m, group: groupOf(m) === 'beverage' ? 'beverage' : 'food' })), dietary: [...(v.dietary || [])], timeline: [...(v.timeline || [])], price: startPrices.map((x) => ({ ...x })) };
  const drawRows = () => {
    $('#rows-timeline').innerHTML = lists.timeline.map((x, i) => `<div class="ev-line" data-i="${i}">
      <input name="tl_time" value="${esc(x.time || '')}" placeholder="18:00" style="max-width:90px" aria-label="${t('time')}">
      <input name="tl_what" value="${esc(x.what || '')}" placeholder="${esc(t('ev_timeline_ph'))}" aria-label="${t('ev_what')}">
      <button type="button" class="btn-sm btn-ghost" data-del="timeline|${i}" aria-label="${t('delete')}">&#10005;</button></div>`).join('');
    $('#rows-dietary').innerHTML = lists.dietary.map((d, i) => `<div class="ev-line" data-i="${i}">
      <input name="di_count" value="${esc(String(d.count ?? ''))}" inputmode="numeric" placeholder="1" style="max-width:64px" aria-label="${t('ev_count')}">
      <input name="di_type" value="${esc(labelOf(d.type))}" list="ev-diets" placeholder="${esc(t('diet_vegetarian'))}" aria-label="${t('ev_diet_type')}">
      <input name="di_who" value="${esc(d.who || '')}" placeholder="${esc(t('ev_who_ph'))}" aria-label="${t('ev_who')}">
      <button type="button" class="btn-sm btn-ghost" data-del="dietary|${i}" aria-label="${t('delete')}">&#10005;</button></div>`).join('');
    // per group: first the course (Voorgerecht, Zoet, Welkomstdrank...), then a dish of that group; the dishes of a matching menu category come first
    // first dropdown: the categories exactly as in Menu (in menu order), then the other courses from Settings;
    // second dropdown: the dishes of that category, so name and allergens come straight from the menu
    const itemsOf = (g) => menuItems.filter((m) => (m.group_type || 'food') === g && m.active !== false);
    const catsOf = (g) => [...new Set(itemsOf(g).map((m) => (m.category || '').trim()).filter(Boolean))];
    const sameCat = (a, b2) => String(a || '').trim().toLowerCase() === String(b2 || '').trim().toLowerCase();
    const courseSel = (g, cur) => {
      const label = labelOf(cur); const cats = catsOf(g); const other = (courses[g] || []).filter((c) => !cats.some((x) => sameCat(x, c)));
      const opt = (c) => `<option ${sameCat(c, label) ? 'selected' : ''}>${esc(c)}</option>`;
      const known = [...cats, ...other].some((c) => sameCat(c, label));
      return `<option value="">${esc(L2('Categorie kiezen', 'Choose category'))}</option>
        ${cats.length ? `<optgroup label="${esc(L2('Uit het menu', 'From the menu'))}">${cats.map(opt).join('')}</optgroup>` : ''}
        ${other.length ? `<optgroup label="${esc(L2('Andere gang', 'Other course'))}">${other.map(opt).join('')}</optgroup>` : ''}
        ${label && !known ? `<option selected>${esc(label)}</option>` : ''}`;
    };
    const dishSel = (g, course, sel) => {
      const label = labelOf(course); const cat = catsOf(g).find((c) => sameCat(c, label));
      const opt = (m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`;
      const chosen = sel && menuItems.find((m) => m.id === sel);
      let list;
      if (cat) list = itemsOf(g).filter((m) => sameCat(m.category, cat)).map(opt).join('');
      else list = catsOf(g).map((c) => `<optgroup label="${esc(c)}">${itemsOf(g).filter((m) => sameCat(m.category, c)).map(opt).join('')}</optgroup>`).join('');
      // a dish that is no longer on the menu (or in another category) stays selectable on old events
      if (chosen && !list.includes(`value="${chosen.id}"`)) list += `<option value="${chosen.id}" selected>${esc(chosen.name)}${chosen.active === false ? ` (${t('inactive')})` : ''}</option>`;
      return `<option value="">${cat ? esc(L2(`Kies uit ${cat}…`, `Choose from ${cat}…`)) : t('ev_free_text')}</option>${list}${cat ? `<option value="">${t('ev_free_text')}</option>` : ''}`;
    };
    for (const g of ['food', 'beverage']) {
      $(`#rows-menu-${g}`).innerHTML = lists.menu.map((m, i) => (m.group !== g ? '' : `<div class="ev-line ev-menu-line" data-i="${i}" data-group="${g}">
      <span class="ev-grip" data-grip aria-label="${esc(L2('Slepen om te verplaatsen', 'Drag to move'))}" title="${esc(L2('Slepen om te verplaatsen', 'Drag to move'))}">&#10303;</span>
      <select name="mn_course" aria-label="${t('ev_course')}" style="max-width:170px">${courseSel(g, m.course)}</select>
      <select name="mn_item" aria-label="${t('ev_dish')}">${dishSel(g, m.course, m.item_id)}</select>
      <input name="mn_name" value="${esc(m.name || '')}" placeholder="${esc(g === 'beverage' ? L2('Bijvoorbeeld: glas cava', 'For example: glass of cava') : t('ev_dish_ph'))}" aria-label="${t('ev_dish')}">
      <button type="button" class="btn-sm btn-ghost" data-del="menu|${i}" aria-label="${t('delete')}">&#10005;</button>
      <div class="ev-al">${(m.allergens || []).map((a) => `<span class="tag allergen">${esc(t('al_' + a))}</span>`).join('') || (m.name && g === 'food' ? `<span class="tiny muted">${t(m.item_id ? 'ev_no_allergens' : 'ev_check_allergens')}</span>` : '')}</div></div>`)).join('');
    }
    $$('[name=mn_course]').forEach((s2) => (s2.onchange = () => {
      readRows();
      const row = s2.closest('[data-i]'); const i = Number(row.dataset.i); const g = row.dataset.group; const m = lists.menu[i];
      const cat = catsOf(g).find((c) => sameCat(c, s2.value));
      if (cat) {
        const inCat = itemsOf(g).filter((x) => sameCat(x.category, cat));
        if (m.item_id && !inCat.some((x) => x.id === m.item_id)) { m.item_id = null; m.name = ''; m.allergens = []; }
        if (!m.item_id && !m.name && inCat.length === 1) { m.item_id = inCat[0].id; m.name = inCat[0].name; m.allergens = inCat[0].allergens || []; }
      }
      drawRows(); persist();
    }));
    // drag a dish or drink up or down within its own list (finger or mouse); the new order is the order on paper
    $$('.rows-menu [data-grip]').forEach((grip) => (grip.onpointerdown = (e) => {
      e.preventDefault();
      const row = grip.closest('[data-i]'); const box = row.parentElement;
      row.classList.add('dragging'); grip.setPointerCapture(e.pointerId);
      const move = (ev2) => {
        const others = [...box.children].filter((x) => x !== row);
        const after = others.find((x) => { const r = x.getBoundingClientRect(); return ev2.clientY < r.top + r.height / 2; });
        if (after) { if (row.nextElementSibling !== after) box.insertBefore(row, after); } else if (box.lastElementChild !== row) box.appendChild(row);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        row.classList.remove('dragging'); readRows(); drawRows(); persist();
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    }));
    if ($('#rows-price')) {
      $('#rows-price').innerHTML = lists.price.map((x, i) => `<div class="ev-line ev-price-line" data-i="${i}" ${x.room_id ? `data-room-line="${esc(x.room_id)}"` : ''}>
        <input name="pr_label" value="${esc(x.label || '')}" placeholder="${esc(L2('Omschrijving', 'Description'))}" aria-label="${esc(L2('Omschrijving', 'Description'))}">
        <select name="pr_per" aria-label="${esc(L2('Per', 'Per'))}"><option value="pp" ${x.per === 'pp' ? 'selected' : ''}>p.p.</option><option value="fixed" ${x.per !== 'pp' ? 'selected' : ''}>${L2('vast', 'fixed')}</option></select>
        <input name="pr_qty" value="${x.per === 'pp' ? '' : esc(String(x.qty ?? 1))}" ${x.per === 'pp' ? 'disabled' : ''} inputmode="decimal" placeholder="${x.per === 'pp' ? esc(L2('gasten', 'guests')) : '1'}" style="max-width:70px" aria-label="${esc(L2('Aantal', 'Quantity'))}">
        <input name="pr_price" value="${x.price != null ? esc(String(x.price).replace('.', ',')) : ''}" inputmode="decimal" placeholder="€ incl." style="max-width:96px" aria-label="${esc(L2('Prijs incl. btw', 'Price incl. VAT'))}">
        <select name="pr_vat" aria-label="${L2('Btw', 'VAT')}">${VAT_RATES.map((r) => `<option value="${r}" ${Number(x.vat) === r ? 'selected' : ''}>${Math.round(r * 100)}%</option>`).join('')}</select>
        <button type="button" class="btn-sm btn-ghost" data-del="price|${i}" aria-label="${t('delete')}">&#10005;</button></div>`).join('');
      $$('[name=pr_per]').forEach((s2) => (s2.onchange = () => { readRows(); drawRows(); persist(); }));
      showTotal();
    }
    $$('[data-del]').forEach((b) => (b.onclick = () => { const [l, i] = b.dataset.del.split('|'); readRows(); lists[l].splice(Number(i), 1); drawRows(); persist(); }));
    $$('[name=mn_item]').forEach((s) => (s.onchange = () => {
      readRows();
      const i = Number(s.closest('[data-i]').dataset.i); const it = menuItems.find((x) => x.id === s.value);
      if (it) { lists.menu[i].name = it.name; lists.menu[i].allergens = it.allergens || []; } else { lists.menu[i].allergens = []; }
      drawRows(); persist();
    }));
  };
  const showTotal = () => {
    const el = $('#price-total'); if (!el) return;
    const f = $('#ev-form'); const g = ['guests_final', 'guests_guaranteed', 'guests_expected'].map((k) => parseNum(f.elements[k] && f.elements[k].value)).find((x) => x != null);
    const ps = priceSummary({ price_lines: lists.price, min_spend: parseNum(f.elements.min_spend && f.elements.min_spend.value) }, g);
    el.innerHTML = (ps.external.length ? `<div class="tiny muted">${esc(L2(`Zaalhuur via ${rooms.landlord}: ${euro(ps.externalTotal)} (niet in ons totaal)`, `Room hire via ${rooms.landlord}: ${euro(ps.externalTotal)} (not in our total)`))}</div>` : '') + (ps.lines.length ? `${L2('Totaal', 'Total')} <strong>${euro(ps.total)}</strong> ${L2('incl. btw', 'incl. VAT')}${g ? ` (${g} ${L2('gasten', 'guests')})` : ''}${ps.byRate.length ? ` · ${ps.byRate.map((r) => `${Math.round(r.rate * 100)}%: ${euro(r.ex)} + ${euro(r.vat)}`).join(' · ')}` : ''}` : '');
  };
  const readRows = () => {
    if ($('#rows-price')) lists.price = $$('#rows-price [data-i]').map((r) => {
      const per = r.querySelector('[name=pr_per]').value;
      return { label: r.querySelector('[name=pr_label]').value.trim(), per, qty: per === 'pp' ? null : parseNum(r.querySelector('[name=pr_qty]').value), price: parseNum(r.querySelector('[name=pr_price]').value), vat: Number(r.querySelector('[name=pr_vat]').value), ...(r.dataset.roomLine ? { room_id: r.dataset.roomLine, owner: (lists.price[Number(r.dataset.i)] || {}).owner || (rooms.rooms.find((x) => x.id === r.dataset.roomLine) || {}).owner || 'landlord' } : {}) };
    });
    lists.timeline = $$('#rows-timeline [data-i]').map((r) => ({ time: r.querySelector('[name=tl_time]').value.trim(), what: r.querySelector('[name=tl_what]').value.trim() }));
    lists.dietary = $$('#rows-dietary [data-i]').map((r) => ({ count: parseNum(r.querySelector('[name=di_count]').value), type: r.querySelector('[name=di_type]').value.trim(), who: r.querySelector('[name=di_who]').value.trim() }));
    lists.menu = $$('.rows-menu [data-i]').map((r) => {
      const id = r.querySelector('[name=mn_item]').value || null; const it = menuItems.find((x) => x.id === id); const i = Number(r.dataset.i);
      return { group: r.dataset.group, course: r.querySelector('[name=mn_course]').value.trim(), item_id: id, name: r.querySelector('[name=mn_name]').value.trim(), allergens: it ? it.allergens || [] : (lists.menu[i] && lists.menu[i].item_id ? [] : (lists.menu[i] || {}).allergens || []) };
    });
  };
  // course and diet labels typed in the current language become codes, so the other language shows them too
  const toCode = (txt, codes) => { const hit = codes.find((c) => t(c).toLowerCase() === String(txt || '').toLowerCase() || tIn(lang() === 'en' ? 'nl' : 'en', c).toLowerCase() === String(txt || '').toLowerCase()); return hit || txt; };
  const collect = () => {
    readRows();
    const f = $('#ev-form');
    const out = {};
    for (const [k] of SIMPLE) {
      const el = f.elements[k]; if (!el) continue;
      if (BOOL.has(k)) out[k] = el.checked;
      else if (NUM.has(k)) out[k] = parseNum(el.value) == null ? null : Math.round(parseNum(el.value));
      else if (MONEY.has(k)) out[k] = parseNum(el.value);
      else out[k] = el.value.trim() === '' ? null : el.value.trim();
    }
    out.service_style = out.service_style ? toCode(out.service_style, STYLES) : null;
    if (uvhOn) {
      const ct = f.querySelector('[name=client_type]:checked'); out.client_type = ct ? ct.value : null;
      const qb = f.querySelector('[name=quote_by]:checked'); out.quote_by = qb && qb.value === 'landlord' ? 'landlord' : 'restaurant';
      // a quote of the landlord: all of it is hers (Finance shows it under "invoices herself"); otherwise all of it is ours
      out.price_lines = lists.price.filter((x) => x.label || x.price != null).map((x) => ({ ...x, billed_by_landlord: out.quote_by === 'landlord' || undefined }));
      out.agreement_kind = out.agreement_kind || null;
    } else UVH_KEYS.forEach((k) => delete out[k]);
    out.timeline = lists.timeline.filter((x) => x.time || x.what).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    out.dietary = lists.dietary.filter((d) => d.type || d.count).map((d) => ({ ...d, type: toCode(d.type, DIETS) }));
    out.menu = lists.menu.filter((m) => m.name || m.item_id).map((m) => ({ ...m, course: toCode(m.course, COURSES) })).sort((x, y) => (x.group === 'beverage') - (y.group === 'beverage')); // food first, then drinks
    return out;
  };
  const persist = () => saveDraft(key, collect());
  drawRows();
  $$('[data-addprice]').forEach((b) => (b.onclick = () => {
    readRows(); const [label, per, vat] = b.dataset.addprice.split('|');
    lists.price.push({ label, per, qty: per === 'pp' ? null : 1, price: null, vat: Number(vat) }); drawRows(); persist();
    const rows = $$('#rows-price [data-i]'); const last = rows[rows.length - 1]; if (last) last.querySelector(label ? '[name=pr_price]' : '[name=pr_label]').focus();
  }));
  $$('.ev-ct input').forEach((r) => (r.onchange = () => { $$('.ev-ct label').forEach((x) => x.classList.toggle('on', x.querySelector('input').checked)); }));
  $$('.ev-qb input').forEach((r) => (r.onchange = () => { $$('.ev-qb label').forEach((x) => x.classList.toggle('on', x.querySelector('input').checked)); persist(); }));
  // rooms: ticked when their hire line is there or their name is in the area text
  const areaEl = () => $('#ev-form').elements.area;
  const roomTicks = $$('[data-room]');
  roomTicks.forEach((cb) => {
    const r = rooms.rooms.find((x) => x.id === cb.dataset.room);
    cb.checked = lists.price.some((x) => x.room_id === r.id) || (!!v.area && String(v.area).toLowerCase().split(/\s*[,+&]\s*/).includes(r.name.toLowerCase()));
    cb.closest('label').classList.toggle('on', cb.checked);
    cb.onchange = () => {
      cb.closest('label').classList.toggle('on', cb.checked);
      readRows();
      if ($('#rows-price')) {
        if (cb.checked && !lists.price.some((x) => x.room_id === r.id)) lists.price.push({ label: `Zaalhuur ${r.name}`, per: 'fixed', qty: 1, price: r.hire, vat: 0.21, room_id: r.id, owner: r.owner || 'landlord' });
        if (!cb.checked) lists.price = lists.price.filter((x) => x.room_id !== r.id);
        drawRows();
      }
      const names = rooms.rooms.filter((x) => roomTicks.find((c) => c.dataset.room === x.id && c.checked)).map((x) => x.name);
      const typed = String(areaEl().value || '').split(/\s*,\s*/).filter((x) => x && !rooms.rooms.some((y) => y.name.toLowerCase() === x.toLowerCase()));
      areaEl().value = [...names, ...typed].join(', ');
      persist();
    };
  });
  $$('[data-addmenu]').forEach((b) => (b.onclick = () => {
    readRows(); const g = b.dataset.addmenu;
    lists.menu.push({ group: g, course: '', item_id: null, name: '', allergens: [] }); drawRows();
    const rows = $$(`#rows-menu-${g} [data-i]`); const last = rows[rows.length - 1]; if (last) last.querySelector('select').focus();
  }));
  $$('[data-addrow]').forEach((b) => (b.onclick = () => {
    readRows();
    const l = b.dataset.addrow;
    lists[l].push(l === 'menu' ? { course: '', item_id: null, name: '', allergens: [] } : l === 'dietary' ? { count: 1, type: '', who: '' } : { time: '', what: '' });
    drawRows();
    const rows = $$(`#rows-${l} [data-i]`); const last = rows[rows.length - 1]; if (last) last.querySelector('input').focus();
  }));
  $('#ev-form').oninput = () => { persist(); if ($('#rows-price')) { readRows(); showTotal(); } };
  $('#cancel').onclick = () => clearDraft(key);
  const dd = $('#drop-draft'); if (dd) dd.onclick = () => { clearDraft(key); renderEditor(ev); };
  $('#ev-form').onsubmit = async (e) => {
    e.preventDefault();
    const row = collect();
    if (!row.title || !row.event_date) { toastError(new Error(t('ev_need_title_date'))); return; }
    const btn = e.submitter || $('#ev-form button[type=submit]'); btn.disabled = true;
    try {
      let saved;
      if (ev) saved = check(await sb.from('events').update(row).eq('id', ev.id).select().single());
      else saved = check(await sb.from('events').insert(row).select().single());
      clearDraft(key);
      toast(t(row.status === 'confirmed' ? 'ev_saved_confirmed' : 'saved'));
      location.hash = `#/events/${saved.id}`;
    } catch (err) { toastError(err); btn.disabled = false; }
  };
}

// ------------------------------------------------------------------ history
async function renderHistory(ev) {
  const versions = check(await sb.from('event_versions').select('*').eq('event_id', ev.id).order('version', { ascending: false })) || [];
  // pair each old snapshot with the next state: what changed from version n to n+1
  const states = [{ version: ev.version, snapshot: ev, by: ev.updated_by, at: ev.updated_at }]
    .concat(versions.map((x) => ({ version: x.version, snapshot: x.snapshot, by: x.changed_by, at: x.changed_at })));
  const items = [];
  for (let i = 0; i < states.length - 1; i++) {
    const now = states[i].snapshot; const before = states[i + 1].snapshot;
    const changes = Object.keys(LABEL).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(now[k] ?? null))
      .map((k) => `<li><strong>${t(LABEL[k])}</strong>: <span class="muted">${display(k, before[k]) || '–'}</span> &#8594; ${display(k, now[k]) || '–'}</li>`);
    // the person who made version n+1 is stored on snapshot n (changed_by)
    items.push({ v: states[i].version, by: versions.find((x) => x.version === states[i + 1].version)?.changed_by, at: versions.find((x) => x.version === states[i + 1].version)?.changed_at, changes });
  }
  const first = states[states.length - 1].snapshot;
  app().innerHTML = `
    <a class="settings-back" href="#/events/${ev.id}" style="display:inline-block;margin-bottom:8px"><i class="ic ic-prev" aria-hidden="true"></i> ${esc(ev.title)}</a>
    <div class="page-head"><div><h1>${t('ev_history')}</h1><div class="muted small">${t('ev_history_sub')}</div></div></div>
    <div class="ev-hist">${items.map((x) => `<div class="card"><div class="row-split"><strong>v${x.v}</strong><span class="small muted">${esc(x.by ? nameOf(x.by) : '?')} · ${esc(fmt.dateTime(x.at))}</span></div>
      <ul class="ev-changes">${x.changes.join('') || `<li class="muted">${t('ev_no_visible_change')}</li>`}</ul></div>`).join('')}
      <div class="card"><div class="row-split"><strong>v1</strong><span class="small muted">${esc(first.created_by ? nameOf(first.created_by) : '?')} · ${esc(fmt.dateTime(first.created_at))}</span></div>
        <div class="small muted" style="margin-top:4px">${t('ev_created')}</div></div></div>`;
}

// ------------------------------------------------------------------ prints
const sheetCss = `<style>
  .beo { font: 10.5pt/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; }
  .beo .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2F5D50; padding-bottom: 8px; margin-bottom: 12px; }
  .beo .brand { font-weight: 800; color: #2F5D50; font-size: 13pt; }
  .beo h1 { font-size: 18pt; margin: 2px 0 2px; }
  .beo h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .04em; color: #2F5D50; margin: 14px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .beo table { width: 100%; border-collapse: collapse; }
  .beo td { padding: 3px 6px 3px 0; vertical-align: top; border: 0 !important; }
  .beo td.k { width: 34%; color: #555; }
  .beo .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
  .beo .big { font-size: 14pt; font-weight: 700; }
  .beo .al { font-size: 8.5pt; color: #8a4a22; }
  .beo .pre { white-space: pre-line; }
  .beo .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 26px; }
  .beo .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 9pt; color: #555; }
  .beo .warn { border: 2px solid #B5524A; padding: 6px 8px; border-radius: 6px; margin: 8px 0; }
  .beo .small { font-size: 8.5pt; color: #666; }
</style>`;
const kv = (pairs) => `<table>${pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join('')}</table>`;
const timelineHtml = (ev) => ((ev.timeline || []).length ? `<table>${ev.timeline.map((x) => `<tr><td class="k" style="width:14%">${esc(x.time || '')}</td><td>${esc(x.what || '')}</td></tr>`).join('')}</table>` : '');

function clientHtml(ev, l) {
  const tt = (k, vars) => tIn(l, k, vars);
  const T = (nl, en) => (l === 'nl' ? nl : en);
  const money = (n) => (n == null ? '' : new Intl.NumberFormat(l === 'nl' ? 'nl-NL' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(Number(n)));
  const g = guestsOf(ev);
  const business = ev.client_type !== 'private';
  // a quote of the landlord (room only): her name and details, her lines as the prices, no menu or food texts
  const byLandlord = ev.quote_by === 'landlord';
  const ll = rooms.info || {};
  const ps = priceSummary(byLandlord ? { ...ev, price_lines: (ev.price_lines || []).map((x) => ({ ...x, billed_by_landlord: false })) } : ev, g);
  const isQuote = ev.status === 'option';
  const docTitle = docName(ev, l);
  const c = company || {};
  const courseOf = (x) => (/^course_/.test(x || '') ? tIn(l, x) : x || '');
  const dietOf = (x) => (/^diet_/.test(x || '') ? tIn(l, x) : x || '');
  const pct = (r) => `${Math.round(r * 100)}%`;
  // our details: on every quote, and required on an invoice
  // under the logo: Cantonspark, Baarn; then the legal name and address once they are filled in (never the same name twice)
  const brandName = c.trade_name || 'Wintertuin'; // the same heading on every quote, also on the landlord's
  const us = byLandlord
    ? ['Cantonspark, Baarn', `${T('Verhuur', 'Room hire')}: ${rooms.landlord}`, ll.address, ll.postcode_city, [ll.phone, ll.email].filter(Boolean).join(' · ')].filter(Boolean).map(esc).join('<br>')
    : ['Cantonspark, Baarn', c.legal_name && c.legal_name.trim().toLowerCase() !== brandName.trim().toLowerCase() ? c.legal_name : '', c.address, c.postcode_city, [c.phone, c.email].filter(Boolean).join(' · '), c.website && c.website !== 'https://' ? c.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : '']
    .filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).map(esc).join('<br>');
  const idSrc = byLandlord ? ll : c;
  const ids = [idSrc.kvk ? `KVK ${esc(idSrc.kvk)}` : '', idSrc.vat_id ? `${T('Btw', 'VAT')} ${esc(idSrc.vat_id)}` : '', idSrc.iban ? `IBAN ${esc(idSrc.iban)}` : ''].filter(Boolean).join('<br>');
  // price table: business clients see amounts excluding VAT plus VAT per rate, private clients amounts including VAT
  const priceTable = ps.lines.length ? `<table class="pt"><tr><th>${T('Omschrijving', 'Description')}</th><th class="n">${T('Aantal', 'Qty')}</th><th class="n">${business ? T('Prijs excl.', 'Price excl.') : T('Prijs', 'Price')}</th><th class="n">${T('Btw', 'VAT')}</th><th class="n">${business ? T('Totaal excl.', 'Total excl.') : T('Totaal', 'Total')}</th></tr>
      ${ps.lines.map((x) => `<tr><td>${esc(x.label || (x.room ? tt('ev_room_hire') : tt('ev_price_pp')))}${x.per === 'pp' && !/p\.p\.|per pers/i.test(x.label || '') ? ` <span class="small">(${T('per persoon', 'per person')})</span>` : ''}</td><td class="n">${x.qty}</td><td class="n">${money(business ? x.priceEx : x.price)}</td><td class="n">${pct(x.vat)}</td><td class="n">${money(business ? x.ex : x.total)}</td></tr>`).join('')}
      ${business ? ps.byRate.map((r) => `<tr class="sub"><td colspan="4">${T('Btw', 'VAT')} ${pct(r.rate)} ${T('over', 'on')} ${money(r.ex)}</td><td class="n">${money(r.vat)}</td></tr>`).join('') : ''}
      <tr class="tot"><td colspan="4">${T('Totaal inclusief btw', 'Total including VAT')}</td><td class="n">${money(ps.total)}</td></tr>
      ${g && ps.total ? `<tr class="sub"><td colspan="4">${T(`Dat is per persoon (${g} gasten)`, `That is per person (${g} guests)`)}</td><td class="n">${money(ps.total / g)}</td></tr>` : ''}
      ${!business && ps.byRate.length ? `<tr class="sub"><td colspan="5">${T('Waarvan btw', 'Of which VAT')}: ${ps.byRate.map((r) => `${pct(r.rate)} ${money(r.vat)}`).join(', ')}</td></tr>` : ''}</table>` : '';
  const sch = cancellationSchedule(ev, ps.value, l);
  const schHtml = !sch ? '' : sch.kind === 'private' ? `<p class="small">${esc(sch.text)}</p>`
    : `<table>${sch.rows.map((r) => `<tr><td class="k" style="width:58%">${esc(r.when)}</td><td>${r.pct ? `${r.pct}% ${T('van de reserveringswaarde', 'of the booking value')}${r.amountText ? ` (${esc(r.amountText)})` : ''}` : T('kosteloos', 'free of charge')}</td></tr>`).join('')}</table>
      ${(sch.rules || []).map((x) => `<p class="small" style="margin:3px 0 0">${esc(x)}</p>`).join('')}`;
  const payDays = Number(c.pay_days) || 14;
  return (`${sheetCss}<style>
    .beo .intro { margin: 10px 0 4px; font-size: 10.5pt; line-height: 1.5; }
    .beo .q-brand { display: flex; align-items: center; gap: 10px; } .beo .q-brand img { width: 46px; height: auto; display: block; }
    .beo .pt { width: 100%; border-collapse: collapse; margin-top: 4px; }
    .beo .pt th { text-align: left; font-size: 8pt; color: #666; font-weight: 600; border-bottom: 1px solid #999 !important; padding: 3px 6px; }
    .beo .pt td { padding: 3px 6px; border-bottom: 1px solid #e3e3e3 !important; }
    .beo .pt .n { text-align: right; white-space: nowrap; }
    .beo .pt tr.sub td { color: #555; font-size: 9pt; border-bottom: 0 !important; }
    .beo .pt tr.tot td { font-weight: 700; border-top: 1.5px solid #333 !important; border-bottom: 0 !important; }
    .beo .us { font-size: 8.5pt; line-height: 1.35; color: #444; text-align: right; }
    .beo .uvh { border: 1px solid #bbb; border-radius: 6px; padding: 7px 10px; margin-top: 10px; font-size: 9pt; }
    .beo .doc { font-size: 15pt; font-weight: 700; }
  </style><div class="beo">
    <div class="top"><div class="q-brand"><img src="${new URL('img/logo.png', location.href.split('#')[0]).href}" alt=""><div><div class="brand">${esc(brandName)}</div><div class="small">${us}</div></div></div>
      <div class="us"><div class="doc">${docTitle}</div>${tt('ev_ref_no')} ${esc(ev.id.slice(0, 8).toUpperCase())} · v${ev.version}<br>${esc(dateIn(todayIso(), l))}<br>${ids}</div></div>
    <h1>${esc(ev.title)}</h1><div class="big">${esc(dateIn(ev.event_date, l))}${ev.start_time ? `, ${fmt.time(ev.start_time)}${ev.end_time ? `–${fmt.time(ev.end_time)}` : ''}` : ''}</div>
    <p class="intro">${esc(qt(l, isQuote ? 'intro_quote' : 'intro_confirm', { voornaam: (ev.client_name || '').trim().split(/\s+/)[0] || '', event: ev.title }))}</p>
    ${isQuote ? `<p class="small">${ev.quote_valid_until ? T(`Deze offerte is geldig tot en met ${esc(dateIn(ev.quote_valid_until, l))}.`, `This quote is valid until ${esc(dateIn(ev.quote_valid_until, l))}.`) : ''} ${T('Het aanbod is vrijblijvend en onder voorbehoud van beschikbaarheid.', 'The offer is without obligation and subject to availability.')}
      ${ev.option_until ? T(` Je hebt een optie op deze datum tot en met ${esc(dateIn(ev.option_until, l))}. Vraagt iemand anders naar dezelfde datum, dan nemen we eerst contact met je op.`, ` You hold an option on this date until ${esc(dateIn(ev.option_until, l))}. If someone else asks for the same date, we will contact you first.`) : ''}</p>` : ''}
    <div class="cols"><div><h2>${tt('ev_sec_client')}</h2>${kv([[tt('ev_client_name'), esc(ev.client_name || '')], [tt('ev_client_company'), esc(ev.client_company || '')], [tt('ev_phone'), esc(ev.client_phone || '')], [tt('ev_email'), esc(ev.client_email || '')],
        [tt('ev_day_contact'), (ev.day_contact_name || '').trim().toLowerCase() === (ev.client_name || '').trim().toLowerCase() && (!ev.day_contact_phone || ev.day_contact_phone === ev.client_phone) ? '' : esc([ev.day_contact_name, ev.day_contact_phone].filter(Boolean).join(', '))], [tt('ev_reference'), esc(ev.reference || '')], [tt('ev_invoice'), ev.invoice_details ? `<span class="pre">${esc(ev.invoice_details)}</span>` : '']])}</div>
      <div><h2>${tt('ev_sec_event')}</h2>${kv([[tt('ev_type'), esc(ev.event_type || '')], [tt('ev_area'), esc(ev.area || '')], [tt('ev_exclusive'), ev.exclusive ? tt('yes') : ''],
        [tt('ev_service_style'), esc(/^style_/.test(ev.service_style || '') ? tIn(l, ev.service_style) : ev.service_style || '')],
        [tt('ev_guests'), g != null ? `${g}${ev.children ? ` (${tt('ev_children')}: ${ev.children})` : ''}` : ''],
        [tt('ev_guarantee_deadline'), ev.guarantee_deadline ? esc(dateIn(ev.guarantee_deadline, l)) : '']])}</div></div>
    ${(() => { const tl = guestTimeline(ev); return tl.length ? `<h2>${tt('ev_timeline')}</h2>${timelineHtml({ ...ev, timeline: tl })}` : ''; })()}
    ${!byLandlord && (ev.menu || []).length ? `<h2>${tt('ev_menu')}</h2><table>${ev.menu.map((m) => `<tr><td class="k" style="width:22%">${esc(courseOf(m.course))}</td><td>${esc(m.name || '')}</td></tr>`).join('')}</table>` : ''}
    ${byLandlord ? '' : `<h2>${tt('ev_dietary')}</h2>`}${byLandlord ? '' : (ev.dietary || []).length ? `<table>${ev.dietary.map((d) => `<tr><td class="k" style="width:10%">${esc(String(d.count ?? ''))}×</td><td>${esc(dietOf(d.type))}${d.who ? ` (${esc(d.who)})` : ''}</td></tr>`).join('')}</table>` : ''}
    ${byLandlord ? '' : `<p class="small">${esc(qt(l, 'allergy'))}</p>`}
    ${ev.setup || ev.drinks || ev.extras ? `<h2>${tt('ev_sec_setup')}</h2>${kv([[tt('ev_setup'), ev.setup ? `<span class="pre">${esc(ev.setup)}</span>` : ''], [tt('ev_drinks'), ev.drinks ? `<span class="pre">${esc(ev.drinks)}</span>` : ''], [tt('ev_extras'), ev.extras ? `<span class="pre">${esc(ev.extras)}</span>` : '']])}` : ''}
    <h2>${tt('ev_sec_money')}</h2>${priceTable}
    ${ps.external.length ? `<table class="pt" style="margin-top:8px">${ps.external.map((x) => `<tr><td>${esc(x.label || tt('ev_room_hire'))}</td><td class="n">${money(x.total)} ${T('incl. btw', 'incl. VAT')}</td></tr>`).join('')}</table>
      <p class="small">${esc(T(`De zaalhuur hierboven factureert ${rooms.landlord} rechtstreeks aan jou; die zit niet in ons totaal.`, `${rooms.landlord} invoices the room hire above directly to you; it is not in our total.`))}</p>` : ''}
    ${kv([
      [tt('ev_min_spend'), ev.min_spend != null ? `${money(ev.min_spend)} ${T('inclusief btw', 'including VAT')}${ps.minApplies ? ` (${T('geldt', 'applies')})` : ''}` : ''],
      [T('Aanbetaling', 'Deposit'), ev.deposit != null ? `${money(ev.deposit)}${ev.deposit_due ? `, ${tt('ev_before')} ${esc(dateIn(ev.deposit_due, l))}` : ''}${ev.deposit_paid ? ` (${tt('ev_paid')})` : ''}. ${T('Wordt verrekend met de eindfactuur.', 'Deducted from the final invoice.')}` : ''],
      [tt('ev_corkage'), ev.corkage ? esc(ev.corkage) : ''],
      [T('Betaling', 'Payment'), `${T(`Binnen ${payDays} dagen na factuurdatum`, `Within ${payDays} days of the invoice date`)}${c.iban ? ` ${T('op', 'to')} ${esc(c.iban)}` : ''}.${ev.payment_terms ? ` <span class="pre">${esc(ev.payment_terms)}</span>` : ''}`]])}
    ${byLandlord ? '' : `<div class="small" style="margin-top:4px">${esc(qt(l, 'final_count'))}</div>`}
    ${ev.deviations || ev.cancellation_terms ? `<h2>${T('Aanvullende afspraken', 'Additional arrangements')}</h2><p class="small pre">${esc([ev.deviations, ev.cancellation_terms].filter(Boolean).join('\n'))}</p>` : ''}
    <div class="uvh" ${byLandlord ? 'hidden style="display:none"' : ''}>${esc(qt(l, 'uvh')).replace(/(Uniforme Voorwaarden Horeca \(UVH\)|Uniform Conditions for the Hospitality Industry \(UVH\))/, '<strong>$1</strong>')} ${T('Je ontvangt ze bij deze', 'You receive them with this')} ${docTitle.toLowerCase()}${c.uvh_url ? `${T('; ook te lezen en op te slaan via', '; also available to read and save at')} ${esc(c.uvh_url)}` : ''}.${c.house_rules ? ` ${T('Daarnaast gelden onze huisregels', 'Our house rules also apply')}: ${esc(c.house_rules)}` : ''}</div>
    <h2>${tt('ev_approval')}</h2><p class="small">${esc(qt(l, 'approval'))}</p>
    <p class="small consent" ${byLandlord ? 'style="display:none"' : ''}>${ev.newsletter_ok ? '&#9746;' : '&#9744;'} ${tt('ev_newsletter_consent')}</p>
    <p class="small"><strong>${byLandlord ? T('Getekend voor akkoord.', 'Signed for agreement.') : T('Getekend voor akkoord en voor ontvangst van de Uniforme Voorwaarden Horeca (UVH).', 'Signed for agreement and for receipt of the Uniform Conditions for the Hospitality Industry (UVH).')}</strong></p>
    <div class="sign"><div>${tt('ev_sign_name')}</div><div>${tt('ev_sign_date')}</div><div>${tt('ev_sign_signature')}</div></div>
  </div>`);
}
// the guest sees the programme of the event itself; set-up before and clearing up after stay on the team BEO
function guestTimeline(ev) {
  const tl = (ev.timeline || []).filter((x) => x.time || x.what);
  const m = (s2) => { const r = /^(\d{1,2})[:.](\d{2})/.exec(String(s2 || '')); return r ? Number(r[1]) * 60 + Number(r[2]) : null; };
  const a = m(ev.start_time); const b = m(ev.end_time);
  if (a == null) return tl;
  return tl.filter((x) => { const v2 = m(x.time); if (v2 == null || b == null) return v2 == null || v2 >= a; return b >= a ? v2 >= a && v2 <= b : v2 >= a || v2 <= b; }); // also past midnight
}
const quoteFileName = (ev, l) => `${docName(ev, l)} ${ev.title}`;
function printClient(ev, l) { printHtml(clientHtml(ev, l), { name: quoteFileName(ev, l), wa: { phone: ev.client_phone, text: `${docName(ev, l)} ${ev.title}, ${dateIn(ev.event_date, l)}` } }); }

function printKitchen(ev) {
  const g = guestsOf(ev);
  const unknown = (ev.menu || []).filter((m) => !m.item_id && m.name);
  printHtml(`${sheetCss}<div class="beo">
    <div class="top"><div><div class="brand">${t('ev_print_kitchen')}</div><div class="small">v${ev.version} · ${esc(fmt.stamp())}</div></div><div class="big">${g ?? '?'} ${t('ev_p')}${ev.children ? ` + ${ev.children} ${t('ev_children_short')}` : ''}</div></div>
    <h1>${esc(ev.title)}</h1><div class="big">${esc(fmt.dateLong(ev.event_date))}${ev.start_time ? `, ${fmt.time(ev.start_time)}` : ''}</div>
    ${ev.service_style ? `<div>${t('ev_service_style')}: <strong>${esc(labelOf(ev.service_style))}</strong></div>` : ''}
    ${(ev.dietary || []).length ? `<div class="warn"><strong>${t('ev_dietary')}</strong><br>${ev.dietary.map((d) => `${esc(String(d.count ?? ''))}× ${esc(labelOf(d.type))}${d.who ? ` (${esc(d.who)})` : ''}`).join('<br>')}</div>` : ''}
    ${(ev.menu || []).length ? `<h2>${t('ev_menu')}</h2><table>${ev.menu.map((m) => `<tr><td class="k" style="width:20%">${esc(labelOf(m.course))}</td><td><strong>${esc(m.name || '')}</strong>
      ${(m.allergens || []).length ? `<div class="al">${t('ev_allergens')}: ${m.allergens.map((a) => esc(t('al_' + a))).join(', ')}</div>` : m.item_id ? '' : `<div class="al">${t('ev_check_allergens')}</div>`}</td></tr>`).join('')}</table>` : ''}
    ${unknown.length ? `<div class="small">${t('ev_free_text_warning')}</div>` : ''}
    ${(ev.timeline || []).length ? `<h2>${t('ev_timeline')}</h2>${timelineHtml(ev)}` : ''}
    ${ev.notes_kitchen ? `<h2>${t('ev_notes_kitchen')}</h2><div class="pre">${esc(ev.notes_kitchen)}</div>` : ''}
  </div>`);
}

function printService(ev, shifts) {
  const g = guestsOf(ev);
  printHtml(`${sheetCss}<div class="beo">
    <div class="top"><div><div class="brand">${t('ev_print_service')}</div><div class="small">v${ev.version} · ${esc(fmt.stamp())}</div></div><div class="big">${g ?? '?'} ${t('ev_p')}</div></div>
    <h1>${esc(ev.title)}</h1><div class="big">${esc(fmt.dateLong(ev.event_date))}${ev.start_time ? `, ${fmt.time(ev.start_time)}${ev.end_time ? `–${fmt.time(ev.end_time)}` : ''}` : ''}</div>
    ${kv([[t('ev_day_contact'), esc([ev.day_contact_name, ev.day_contact_phone].filter(Boolean).join(', '))], [t('ev_area'), esc(ev.area || '')], [t('ev_service_style'), esc(labelOf(ev.service_style))]])}
    ${(ev.dietary || []).length ? `<div class="warn"><strong>${t('ev_dietary')}</strong><br>${ev.dietary.map((d) => `${esc(String(d.count ?? ''))}× ${esc(labelOf(d.type))}${d.who ? ` (${esc(d.who)})` : ''}`).join('<br>')}</div>` : ''}
    ${(ev.timeline || []).length ? `<h2>${t('ev_timeline')}</h2>${timelineHtml(ev)}` : ''}
    ${ev.setup ? `<h2>${t('ev_setup')}</h2><div class="pre">${esc(ev.setup)}</div>` : ''}
    ${(ev.menu || []).length ? `<h2>${t('ev_menu')}</h2><table>${ev.menu.map((m) => `<tr><td class="k" style="width:20%">${esc(labelOf(m.course))}</td><td>${esc(m.name || '')}${(m.allergens || []).length ? ` <span class="al">(${m.allergens.map((a) => esc(t('al_' + a))).join(', ')})</span>` : ''}</td></tr>`).join('')}</table>` : ''}
    ${ev.drinks ? `<h2>${t('ev_drinks')}</h2><div class="pre">${esc(ev.drinks)}</div>` : ''}
    ${ev.extras ? `<h2>${t('ev_extras')}</h2><div class="pre">${esc(ev.extras)}</div>` : ''}
    <h2>${t('ev_sec_staff')}</h2>${shifts.length ? `<table>${shifts.map((s) => `<tr><td class="k" style="width:18%">${fmt.time(s.start_time)}–${fmt.time(s.end_time)}</td><td>${esc(s.profiles ? s.profiles.full_name : '')}${s.section ? ` · ${esc(s.section)}` : ''}</td></tr>`).join('')}</table>` : `<div class="small">${t('ev_no_shifts')}</div>`}
    ${ev.staffing ? `<div class="pre" style="margin-top:4px">${esc(ev.staffing)}</div>` : ''}
    ${ev.notes_service ? `<h2>${t('ev_notes_service')}</h2><div class="pre">${esc(ev.notes_service)}</div>` : ''}
    ${ev.notes_bar ? `<h2>${t('ev_notes_bar')}</h2><div class="pre">${esc(ev.notes_bar)}</div>` : ''}
    ${ev.notes_cleaning ? `<h2>${t('ev_notes_cleaning')}</h2><div class="pre">${esc(ev.notes_cleaning)}</div>` : ''}
  </div>`);
}


// Empty BEO on paper: same sections and words as the app, for taking a request by hand. Typed into the app afterwards.
function printBlank(l) {
  const tt = (k) => tIn(l, k);
  const f = (k, wide) => `<div class="f ${wide ? 'wide' : ''}"><span>${tt(k)}</span></div>`;
  const lines = (n) => '<div class="ln"></div>'.repeat(n);
  const box = (k) => `<span class="cb"></span> ${tt(k)}`;
  const grid = (cols, rows) => `<table class="g"><tr>${cols.map(([k, w]) => `<th style="width:${w}">${tt(k)}</th>`).join('')}</tr>
    ${`<tr>${cols.map(() => '<td></td>').join('')}</tr>`.repeat(rows)}</table>`;
  printHtml(`${sheetCss}<style>
    .beo .f { border-bottom: 1px solid #999; min-height: 27px; padding-top: 2px; }
    .beo .f span { font-size: 8pt; color: #666; }
    .beo .fg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; }
    .beo .fg3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 22px; }
    .beo .f.wide { grid-column: 1 / -1; }
    .beo .ln { border-bottom: 1px solid #bbb; height: 21px; }
    .beo .lbl { font-size: 8pt; color: #666; margin-top: 8px; }
    .beo table.g { border-collapse: collapse; margin-top: 2px; }
    .beo table.g th { line-height: 1.2; font-size: 8pt; color: #666; font-weight: 600; text-align: left; padding: 2px 6px; border-bottom: 1px solid #999 !important; }
    .beo table.g td { border-bottom: 1px solid #bbb !important; height: 22px; padding: 0 6px; }
    .beo table.g th + th, .beo table.g td + td { border-left: 1px solid #ddd !important; }
    .beo .cb { display: inline-block; width: 11px; height: 11px; border: 1.2px solid #333; vertical-align: -1px; margin: 0 4px 0 12px; }
    .beo .opts { padding: 8px 0 4px; font-size: 9.5pt; }
    .beo .office { border: 1px dashed #999; border-radius: 6px; padding: 6px 10px 10px; margin-top: 16px; }
    .beo table.g, .beo .fg, .beo .fg3, .beo .office { break-inside: avoid; page-break-inside: avoid; }
    .beo h2 { break-after: avoid; page-break-after: avoid; }
    .beo .keep { break-inside: avoid; }
    .beo h2 { margin-top: 11px; }
  </style><div class="beo">
    <div class="top"><div><div class="brand">Wintertuin</div><div class="small">Cantonspark, Baarn</div></div>
      <div style="text-align:right"><div class="big">${tt('ev_blank_title')}</div><div class="small">${tt('ev_blank_sub')}</div></div></div>
    <h2>${tt('ev_sec_event')}</h2>
    <div class="fg">${f('ev_title', true)}${f('ev_type')}${f('ev_date')}</div>
    <div class="fg3">${f('ev_start')}${f('ev_end')}${f('ev_area')}</div>
    <div class="fg">${f('ev_service_style')}<div class="opts">${tt('ev_exclusive')}: ${box('yes')}${box('no')}</div></div>
    <h2>${tt('ev_sec_client')}</h2>
    <div class="opts">${tt('ev_client_type')}: ${box('ev_ct_business')}${box('ev_ct_private')}</div>
    <div class="fg">${f('ev_client_name')}${f('ev_client_company')}${f('ev_phone')}${f('ev_email')}${f('ev_day_contact')}${f('ev_day_contact_phone')}${f('ev_invoice', true)}${f('ev_reference')}</div>
    <h2>${tt('ev_guests')}</h2>
    <div class="fg">${f('ev_guests_expected')}${f('ev_guests_guaranteed')}${f('ev_guarantee_deadline')}${f('ev_children')}</div>
    <h2>${tt('ev_dietary')}</h2>${grid([['ev_count', '12%'], ['ev_diet_type', '38%'], ['ev_who', '50%']], 5)}
    <h2>${tt('ev_timeline')}</h2>${grid([['time', '14%'], ['ev_what', '86%']], 8)}
    <h2>${tt('ev_menu')}</h2>${grid([['ev_course', '24%'], ['ev_dish', '76%']], 5)}
    <h2>${tt('ev_sec_setup')}</h2><div class="lbl">${tt('ev_setup')}</div>${lines(2)}
    <h2>${tt('ev_sec_drinks_extras')}</h2><div class="lbl">${tt('ev_drinks')}</div>${lines(1)}<div class="lbl">${tt('ev_extras')}</div>${lines(1)}
    <h2>${tt('ev_sec_money')}</h2>
    <div class="fg">${f('ev_price_pp')}${f('ev_room_hire')}${f('ev_min_spend')}${f('ev_deposit')}${f('ev_deposit_due')}<div class="opts">${tt('ev_incl_vat')}: ${box('yes')}${box('no')}</div></div>
    <div class="lbl">${tt('ev_payment_terms')}</div>${lines(1)}<div class="lbl">${tt('ev_cancellation_terms')}</div>${lines(1)}
    <h2>${tt('ev_blank_notes')}</h2>${lines(2)}
    <div class="keep"><h2>${tt('ev_approval')}</h2><p class="small">${tt('ev_approval_text')}</p>
    <p class="small">${l === 'nl' ? 'Op deze overeenkomst zijn de Uniforme Voorwaarden Horeca (UVH) van toepassing. Getekend voor akkoord en voor ontvangst van de UVH.' : 'The Uniform Conditions for the Hospitality Industry (UVH) apply to this agreement. Signed for agreement and for receipt of the UVH.'}</p>
    <p class="small consent">&#9744; ${tt('ev_newsletter_consent')}</p>
    <div class="sign"><div>${tt('ev_sign_name')}</div><div>${tt('ev_sign_date')}</div><div>${tt('ev_sign_signature')}</div></div>
    <div class="office"><div class="small"><strong>${tt('ev_office')}</strong></div><div class="fg3">${f('ev_status')}${f('ev_sold_by')}${f('ev_entered')}</div></div></div>
  </div>`);
}
