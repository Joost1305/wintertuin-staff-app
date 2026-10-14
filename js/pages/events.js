// Events with a BEO (Banqueting and Event Order).
// Everyone in the team can create and edit; managers can delete. Each save that changes something
// becomes a new version (the database keeps the old one), so the history shows who changed what.
// A confirmed event opens that day in the roster and the Finance calendar with a note (database trigger).
// Prints: client confirmation (EN or NL, to save as PDF), kitchen sheet and service sheet.
import { state, isManager, app, esc, fmt, toast, toastError, todayIso, nameOf, $, $$, openModal, confirmDialog, printHtml } from '../core.js';
import { t, tIn, lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { ALLERGENS } from './menu.js';

const STATUSES = ['option', 'confirmed', 'cancelled', 'done'];
const DRAFT = 'wintertuinEventDraft_';
const COURSES = ['course_welcome', 'course_bites', 'course_starter', 'course_soup', 'course_main', 'course_cheese', 'course_dessert', 'course_coffee', 'course_late'];
const DIETS = ['diet_vegetarian', 'diet_vegan', 'diet_pescatarian', 'diet_gluten', 'diet_lactose', 'diet_nuts', 'diet_shellfish', 'diet_halal', 'diet_kosher', 'diet_pregnant', 'diet_child'];
const STYLES = ['style_seated', 'style_family', 'style_buffet', 'style_walking', 'style_reception'];

// Field groups, used for the editor, the history and the prints
const SIMPLE = [
  ['title', 'ev_title'], ['event_type', 'ev_type'], ['event_date', 'ev_date'], ['start_time', 'ev_start'], ['end_time', 'ev_end'],
  ['status', 'ev_status'], ['option_until', 'ev_option_until'], ['sold_by', 'ev_sold_by'],
  ['client_name', 'ev_client_name'], ['client_company', 'ev_client_company'], ['client_phone', 'ev_phone'], ['client_email', 'ev_email'],
  ['day_contact_name', 'ev_day_contact'], ['day_contact_phone', 'ev_day_contact_phone'], ['invoice_details', 'ev_invoice'], ['reference', 'ev_reference'],
  ['guests_expected', 'ev_guests_expected'], ['guests_guaranteed', 'ev_guests_guaranteed'], ['guarantee_deadline', 'ev_guarantee_deadline'],
  ['guests_final', 'ev_guests_final'], ['children', 'ev_children'],
  ['area', 'ev_area'], ['exclusive', 'ev_exclusive'], ['setup', 'ev_setup'], ['service_style', 'ev_service_style'],
  ['drinks', 'ev_drinks'], ['extras', 'ev_extras'], ['staff_needed', 'ev_staff_needed'], ['staffing', 'ev_staffing'],
  ['price_per_person', 'ev_price_pp'], ['room_hire', 'ev_room_hire'], ['min_spend', 'ev_min_spend'], ['prices_incl_vat', 'ev_incl_vat'],
  ['deposit', 'ev_deposit'], ['deposit_due', 'ev_deposit_due'], ['deposit_paid', 'ev_deposit_paid'],
  ['payment_terms', 'ev_payment_terms'], ['cancellation_terms', 'ev_cancellation_terms'],
  ['notes_kitchen', 'ev_notes_kitchen'], ['notes_bar', 'ev_notes_bar'], ['notes_service', 'ev_notes_service'], ['notes_cleaning', 'ev_notes_cleaning'],
  ['notes_internal', 'ev_notes_internal'], ['client_confirmed_at', 'ev_confirmed_at'], ['client_confirmed_by', 'ev_confirmed_by'],
];
const LABEL = Object.fromEntries(SIMPLE.concat([['menu', 'ev_menu'], ['dietary', 'ev_dietary'], ['timeline', 'ev_timeline']]));
const NUM = new Set(['guests_expected', 'guests_guaranteed', 'guests_final', 'children', 'staff_needed']);
const MONEY = new Set(['price_per_person', 'room_hire', 'min_spend', 'deposit']);
const BOOL = new Set(['exclusive', 'deposit_paid', 'prices_incl_vat']);
const DATE = new Set(['event_date', 'option_until', 'guarantee_deadline', 'deposit_due', 'client_confirmed_at']);

let menuItems = [];
const guestsOf = (e) => e.guests_final ?? e.guests_guaranteed ?? e.guests_expected;
const statusTag = (s) => `<span class="tag ev-${esc(s)}">${t('evs_' + s)}</span>`;
const labelOf = (code) => (code && /^(course|diet|style)_/.test(code) ? t(code) : code || '');
const parseNum = (v) => { if (v == null || String(v).trim() === '') return null; const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
function loadDraft(k) { try { const r = localStorage.getItem(DRAFT + k); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveDraft(k, d) { try { localStorage.setItem(DRAFT + k, JSON.stringify(d)); } catch { /* private mode */ } }
function clearDraft(k) { try { localStorage.removeItem(DRAFT + k); } catch { /* private mode */ } }

export async function renderEvents(args = []) {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  if (!menuItems.length) menuItems = check(await sb.from('menu_items').select('id, name, description, category, group_type, allergens, active').order('group_type').order('category').order('sort_order')) || [];
  const [id, sub] = args;
  if (!id) return renderList(sub);
  if (id === 'new') return renderEditor(null);
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
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('nav_events')}</h1><div class="muted small">${t('ev_sub')}</div></div>
      <div class="page-actions">
        <details class="export-menu" style="position:relative"><summary class="btn btn-sm">&#128424; ${t('ev_blank_beo')} &#9662;</summary>
          <div class="card" style="position:absolute;right:0;top:110%;z-index:10;display:flex;flex-direction:column;gap:6px;min-width:200px;padding:10px">
            <button type="button" class="btn-sm" data-blank="nl">Nederlands</button><button type="button" class="btn-sm" data-blank="en">English</button></div></details>
        <a class="btn btn-primary btn-sm" href="#/events/new">+ ${t('ev_new')}</a></div></div>
    <div class="seg" style="margin-bottom:14px">${['upcoming', 'past', 'all'].map((f) => `<a href="#/events/list/${f}" class="seg-btn ${filter === f ? 'on' : ''}">${t('ev_f_' + f)}</a>`).join('')}</div>
    ${!rows.length ? `<div class="card empty">${t(filter === 'upcoming' ? 'ev_none_upcoming' : 'ev_none')}</div>` : `<div class="ev-list">${rows.map((e) => `
      <a class="card ev-row ${e.status === 'cancelled' ? 'is-cancelled' : ''}" href="#/events/${e.id}">
        <div class="ev-date"><span class="d">${new Date(`${e.event_date}T12:00:00`).getDate()}</span><span class="m">${esc(new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'nl-NL', { month: 'short' }).format(new Date(`${e.event_date}T12:00:00`)))}</span></div>
        <div class="ev-main"><div class="ev-title">${esc(e.title)}</div>
          <div class="small muted">${esc(fmt.date(e.event_date))}${e.start_time ? ` · ${fmt.time(e.start_time)}${e.end_time ? `–${fmt.time(e.end_time)}` : ''}` : ''}${e.client_company || e.client_name ? ` · ${esc(e.client_company || e.client_name)}` : ''}${e.area ? ` · ${esc(e.area)}` : ''}</div></div>
        <div class="ev-side">${statusTag(e.status)}${guestsOf(e) ? `<span class="ev-guests">${guestsOf(e)} ${t('ev_p')}</span>` : ''}</div>
      </a>`).join('')}</div>`}`;
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
    <a class="settings-back" href="#/events" style="display:inline-block;margin-bottom:8px">&#8249; ${t('nav_events')}</a>
    <div class="page-head"><div><h1>${esc(ev.title)}</h1>
        <div class="muted small">${esc(fmt.dateLong(ev.event_date))}${ev.start_time ? ` · ${fmt.time(ev.start_time)}${ev.end_time ? `–${fmt.time(ev.end_time)}` : ''}` : ''} · ${statusTag(ev.status)}
          <a href="#/events/${ev.id}/history" class="small" style="margin-left:6px">v${ev.version} · ${t('ev_history')}</a></div></div>
      <div class="page-actions">
        <a class="btn btn-primary btn-sm" href="#/events/${ev.id}/edit">${t('edit')}</a>
        <details class="export-menu" style="position:relative"><summary class="btn btn-sm">&#128424; ${t('print')} &#9662;</summary>
          <div class="card" style="position:absolute;right:0;top:110%;z-index:10;display:flex;flex-direction:column;gap:6px;min-width:240px;padding:10px">
            <button type="button" class="btn-sm" data-print="client-en">${t('ev_print_client')} (EN)</button>
            <button type="button" class="btn-sm" data-print="client-nl">${t('ev_print_client')} (NL)</button>
            <button type="button" class="btn-sm" data-print="kitchen">${t('ev_print_kitchen')}</button>
            <button type="button" class="btn-sm" data-print="service">${t('ev_print_service')}</button>
          </div></details>
        ${isManager() ? `<button type="button" class="btn-sm btn-ghost btn-danger" id="del">${t('delete')}</button>` : ''}</div></div>
    ${ev.status === 'option' && ev.option_until ? `<div class="note" style="margin:0 0 12px">${t('ev_option_note', { d: esc(fmt.dateLong(ev.option_until)) })}</div>` : ''}
    ${ev.guarantee_deadline && !ev.guests_final && ev.status !== 'cancelled' ? `<div class="note" style="margin:0 0 12px">${t('ev_guarantee_note', { d: esc(fmt.dateLong(ev.guarantee_deadline)) })}</div>` : ''}
    <div class="ev-kpis">
      <div class="card kpi"><div class="label">${t('ev_guests')}</div><div class="value">${g ?? '–'}</div>
        <div class="tiny muted">${[ev.guests_expected != null ? `${t('ev_g_exp')} ${ev.guests_expected}` : '', ev.guests_guaranteed != null ? `${t('ev_g_guar')} ${ev.guests_guaranteed}` : '', ev.guests_final != null ? `${t('ev_g_final')} ${ev.guests_final}` : ''].filter(Boolean).join(' · ')}</div></div>
      <div class="card kpi"><div class="label">${t('ev_dietary')}</div><div class="value">${(ev.dietary || []).reduce((a, d) => a + (Number(d.count) || 0), 0)}</div><div class="tiny muted">${t('ev_special_requests')}</div></div>
      <div class="card kpi"><div class="label">${t('ev_staff_rostered')}</div><div class="value ${staffWarn ? 'txt-red' : ''}">${shifts.length}${ev.staff_needed ? ` / ${ev.staff_needed}` : ''}</div><div class="tiny muted">${staffWarn ? t('ev_staff_short') : t('ev_from_roster')}</div></div>
      <div class="card kpi"><div class="label">${t('ev_expected_revenue')}</div><div class="value">${fmt.money(expectedRevenue(ev)) || '–'}</div><div class="tiny muted">${t(ev.prices_incl_vat ? 'ev_incl_vat_short' : 'ev_excl_vat_short')}</div></div>
    </div>
    <div class="grid grid-2 ev-grid">
      ${block(t('ev_sec_event'), ['event_type', 'area', 'exclusive', 'service_style', 'option_until', 'sold_by'].map(row).join(''))}
      ${block(t('ev_sec_client'), ['client_name', 'client_company', 'client_phone', 'client_email', 'day_contact_name', 'day_contact_phone', 'reference', 'invoice_details'].map(row).join(''))}
      ${block(t('ev_timeline'), (ev.timeline || []).length ? `<table class="ev-table">${ev.timeline.map((x) => `<tr><td class="ev-time">${esc(x.time || '')}</td><td>${esc(x.what || '')}</td></tr>`).join('')}</table>` : '')}
      ${block(t('ev_menu'), (ev.menu || []).length ? `<table class="ev-table">${ev.menu.map((m) => `<tr><td class="ev-course">${esc(labelOf(m.course))}</td><td><strong>${esc(m.name || '')}</strong>
          ${(m.allergens || []).length ? `<div class="allergen-chips">${m.allergens.map((a) => `<span class="tag allergen">${esc(t('al_' + a))}</span>`).join('')}</div>` : ''}</td></tr>`).join('')}</table>
          ${allAllergens.length ? `<div class="tiny muted" style="margin-top:8px">${t('ev_allergens_in_menu')}: ${allAllergens.map((a) => esc(t('al_' + a))).join(', ')}</div>` : ''}` : '')}
      ${block(t('ev_dietary'), (ev.dietary || []).length ? `<table class="ev-table">${ev.dietary.map((d) => `<tr><td class="ev-time">${esc(String(d.count ?? ''))}×</td><td><strong>${esc(labelOf(d.type))}</strong>${d.who ? ` <span class="muted">· ${esc(d.who)}</span>` : ''}</td></tr>`).join('')}</table>` : '')}
      ${block(t('ev_sec_setup'), ['setup', 'drinks', 'extras'].map(row).join(''))}
      ${block(t('ev_sec_staff'), `${row('staff_needed')}${row('staffing')}${shifts.length ? `<table class="ev-table" style="margin-top:6px">${shifts.map((s) => `<tr><td class="ev-time">${fmt.time(s.start_time)}–${fmt.time(s.end_time)}</td><td>${esc(s.profiles ? s.profiles.full_name : '')}${s.section ? ` <span class="muted">· ${esc(s.section)}</span>` : ''}</td></tr>`).join('')}</table>` : `<div class="small muted">${t('ev_no_shifts')} <a href="#/roster">${t('nav_roster')}</a></div>`}`)}
      ${block(t('ev_sec_money'), ['price_per_person', 'room_hire', 'min_spend', 'prices_incl_vat', 'deposit', 'deposit_due', 'deposit_paid', 'payment_terms', 'cancellation_terms'].map(row).join(''))}
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
  const del = $('#del');
  if (del) del.onclick = async () => {
    if (!(await confirmDialog(t('ev_confirm_delete'), t('delete')))) return;
    try { check(await sb.from('events').delete().eq('id', ev.id)); toast(t('deleted')); location.hash = '#/events'; } catch (e) { toastError(e); }
  };
}

function expectedRevenue(ev) {
  const g = guestsOf(ev);
  const pp = ev.price_per_person != null && g ? Number(ev.price_per_person) * g : 0;
  const total = pp + Number(ev.room_hire || 0);
  const min = Number(ev.min_spend || 0);
  return total || min ? Math.max(total, min) : null;
}

// One value, readable (screen and history)
function display(k, val, l) {
  const tt = (key, vars) => (l ? tIn(l, key, vars) : t(key, vars));
  if (val == null || val === '') return '';
  if (BOOL.has(k)) return val ? tt('yes') : tt('no');
  if (MONEY.has(k)) return esc(new Intl.NumberFormat(l === 'nl' || (!l && lang() === 'nl') ? 'nl-NL' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(Number(val)));
  if (DATE.has(k)) return esc(dateIn(val, l));
  if (k === 'status') return tt('evs_' + val);
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
function renderEditor(ev) {
  const key = ev ? ev.id : 'new';
  const draft = loadDraft(key);
  const base = ev ? { ...ev } : { status: 'option', event_date: todayIso(), prices_incl_vat: true, exclusive: false, deposit_paid: false, menu: [], dietary: [], timeline: [], sold_by: state.me.id };
  const v = draft ? { ...base, ...draft } : base;
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
    <a class="settings-back" href="${ev ? `#/events/${ev.id}` : '#/events'}" style="display:inline-block;margin-bottom:8px">&#8249; ${ev ? esc(ev.title) : t('nav_events')}</a>
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
        inp('day_contact_name'), inp('day_contact_phone', 'tel'), inp('reference')) + area('invoice_details', 2))}
      ${sec(t('ev_guests'), grid(inp('guests_expected', 'number'), inp('guests_guaranteed', 'number'), inp('guarantee_deadline', 'date'), inp('guests_final', 'number'), inp('children', 'number')))}
      ${sec(t('ev_dietary'), `<div id="rows-dietary"></div><button type="button" class="btn-sm" data-addrow="dietary">+ ${t('ev_add_diet')}</button>`, t('ev_dietary_hint'))}
      ${sec(t('ev_sec_setup'), grid(inp('area', 'text', `placeholder="${esc(t('ev_area_ph'))}"`), inp('service_style', 'text', 'list="ev-styles"')) + chk('exclusive') + area('setup', 3, t('ev_setup_ph')))}
      ${sec(t('ev_timeline'), `<div id="rows-timeline"></div><button type="button" class="btn-sm" data-addrow="timeline">+ ${t('ev_add_time')}</button>`, t('ev_timeline_hint'))}
      ${sec(t('ev_menu'), `<div id="rows-menu"></div><button type="button" class="btn-sm" data-addrow="menu">+ ${t('ev_add_course')}</button>`, t('ev_menu_hint'))}
      ${sec(t('ev_sec_drinks_extras'), area('drinks', 3, t('ev_drinks_ph')) + area('extras', 3, t('ev_extras_ph')))}
      ${sec(t('ev_sec_staff'), grid(inp('staff_needed', 'number')) + area('staffing', 2, t('ev_staffing_ph')), t('ev_staff_hint'))}
      ${sec(t('ev_sec_money'), grid(inp('price_per_person', 'money'), inp('room_hire', 'money'), inp('min_spend', 'money'), inp('deposit', 'money'), inp('deposit_due', 'date'))
        + chk('prices_incl_vat') + chk('deposit_paid') + area('payment_terms', 2) + area('cancellation_terms', 2))}
      ${sec(t('ev_sec_departments'), area('notes_kitchen') + area('notes_bar') + area('notes_service') + area('notes_cleaning'), t('ev_departments_hint'))}
      ${sec(t('ev_sec_internal'), area('notes_internal', 3) + grid(inp('client_confirmed_at', 'date'), inp('client_confirmed_by')), t('ev_internal_hint'))}
      <div class="ev-savebar"><a class="btn" href="${ev ? `#/events/${ev.id}` : '#/events'}" id="cancel">${t('cancel')}</a>
        <button class="btn-primary" type="submit">${t('save')}</button></div>
    </form>`;

  const lists = { menu: [...(v.menu || [])], dietary: [...(v.dietary || [])], timeline: [...(v.timeline || [])] };
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
    $('#rows-menu').innerHTML = lists.menu.map((m, i) => `<div class="ev-line ev-menu-line" data-i="${i}">
      <input name="mn_course" value="${esc(labelOf(m.course))}" list="ev-courses" placeholder="${esc(t('course_starter'))}" style="max-width:150px" aria-label="${t('ev_course')}">
      <select name="mn_item" aria-label="${t('ev_dish')}">${menuOpts(m.item_id)}</select>
      <input name="mn_name" value="${esc(m.name || '')}" placeholder="${esc(t('ev_dish_ph'))}" aria-label="${t('ev_dish')}">
      <button type="button" class="btn-sm btn-ghost" data-del="menu|${i}" aria-label="${t('delete')}">&#10005;</button>
      <div class="ev-al">${(m.allergens || []).map((a) => `<span class="tag allergen">${esc(t('al_' + a))}</span>`).join('') || (m.name ? `<span class="tiny muted">${t(m.item_id ? 'ev_no_allergens' : 'ev_check_allergens')}</span>` : '')}</div></div>`).join('');
    $$('[data-del]').forEach((b) => (b.onclick = () => { const [l, i] = b.dataset.del.split('|'); readRows(); lists[l].splice(Number(i), 1); drawRows(); persist(); }));
    $$('[name=mn_item]').forEach((s) => (s.onchange = () => {
      readRows();
      const i = Number(s.closest('[data-i]').dataset.i); const it = menuItems.find((x) => x.id === s.value);
      if (it) { lists.menu[i].name = it.name; lists.menu[i].allergens = it.allergens || []; } else { lists.menu[i].allergens = []; }
      drawRows(); persist();
    }));
  };
  const readRows = () => {
    lists.timeline = $$('#rows-timeline [data-i]').map((r) => ({ time: r.querySelector('[name=tl_time]').value.trim(), what: r.querySelector('[name=tl_what]').value.trim() }));
    lists.dietary = $$('#rows-dietary [data-i]').map((r) => ({ count: parseNum(r.querySelector('[name=di_count]').value), type: r.querySelector('[name=di_type]').value.trim(), who: r.querySelector('[name=di_who]').value.trim() }));
    lists.menu = $$('#rows-menu [data-i]').map((r, i) => {
      const id = r.querySelector('[name=mn_item]').value || null; const it = menuItems.find((x) => x.id === id);
      return { course: r.querySelector('[name=mn_course]').value.trim(), item_id: id, name: r.querySelector('[name=mn_name]').value.trim(), allergens: it ? it.allergens || [] : (lists.menu[i] && !lists.menu[i].item_id ? [] : []) };
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
    out.timeline = lists.timeline.filter((x) => x.time || x.what).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    out.dietary = lists.dietary.filter((d) => d.type || d.count).map((d) => ({ ...d, type: toCode(d.type, DIETS) }));
    out.menu = lists.menu.filter((m) => m.name || m.item_id).map((m) => ({ ...m, course: toCode(m.course, COURSES) }));
    return out;
  };
  const persist = () => saveDraft(key, collect());
  drawRows();
  $$('[data-addrow]').forEach((b) => (b.onclick = () => {
    readRows();
    const l = b.dataset.addrow;
    lists[l].push(l === 'menu' ? { course: '', item_id: null, name: '', allergens: [] } : l === 'dietary' ? { count: 1, type: '', who: '' } : { time: '', what: '' });
    drawRows();
    const rows = $$(`#rows-${l} [data-i]`); const last = rows[rows.length - 1]; if (last) last.querySelector('input').focus();
  }));
  $('#ev-form').oninput = persist;
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
    <a class="settings-back" href="#/events/${ev.id}" style="display:inline-block;margin-bottom:8px">&#8249; ${esc(ev.title)}</a>
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

function printClient(ev, l) {
  const tt = (k, vars) => tIn(l, k, vars);
  const money = (n) => (n == null ? '' : new Intl.NumberFormat(l === 'nl' ? 'nl-NL' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(Number(n)));
  const g = guestsOf(ev);
  const pp = ev.price_per_person != null && g ? Number(ev.price_per_person) * g : null;
  const vatNote = tt(ev.prices_incl_vat ? 'ev_prices_incl' : 'ev_prices_excl');
  const courseOf = (c) => (/^course_/.test(c || '') ? tIn(l, c) : c || '');
  const dietOf = (c) => (/^diet_/.test(c || '') ? tIn(l, c) : c || '');
  printHtml(`${sheetCss}<div class="beo">
    <div class="top"><div><div class="brand">Wintertuin</div><div class="small">Cantonspark, Baarn</div></div>
      <div style="text-align:right"><div class="small">${tt('ev_client_doc')}</div><div class="small">${tt('ev_ref_no')} ${esc(ev.id.slice(0, 8).toUpperCase())} · v${ev.version}</div><div class="small">${esc(dateIn(todayIso(), l))}</div></div></div>
    <h1>${esc(ev.title)}</h1><div class="big">${esc(dateIn(ev.event_date, l))}${ev.start_time ? `, ${fmt.time(ev.start_time)}${ev.end_time ? `–${fmt.time(ev.end_time)}` : ''}` : ''}</div>
    <div class="cols"><div><h2>${tt('ev_sec_client')}</h2>${kv([[tt('ev_client_name'), esc(ev.client_name || '')], [tt('ev_client_company'), esc(ev.client_company || '')], [tt('ev_phone'), esc(ev.client_phone || '')], [tt('ev_email'), esc(ev.client_email || '')],
        [tt('ev_day_contact'), esc([ev.day_contact_name, ev.day_contact_phone].filter(Boolean).join(', '))], [tt('ev_reference'), esc(ev.reference || '')]])}</div>
      <div><h2>${tt('ev_sec_event')}</h2>${kv([[tt('ev_type'), esc(ev.event_type || '')], [tt('ev_area'), esc(ev.area || '')], [tt('ev_exclusive'), ev.exclusive ? tt('yes') : ''],
        [tt('ev_service_style'), esc(/^style_/.test(ev.service_style || '') ? tIn(l, ev.service_style) : ev.service_style || '')],
        [tt('ev_guests'), g != null ? `${g}${ev.children ? ` (${tt('ev_children')}: ${ev.children})` : ''}` : ''],
        [tt('ev_guarantee_deadline'), ev.guarantee_deadline ? esc(dateIn(ev.guarantee_deadline, l)) : '']])}</div></div>
    ${(ev.timeline || []).length ? `<h2>${tt('ev_timeline')}</h2>${timelineHtml(ev)}` : ''}
    ${(ev.menu || []).length ? `<h2>${tt('ev_menu')}</h2><table>${ev.menu.map((m) => `<tr><td class="k" style="width:22%">${esc(courseOf(m.course))}</td><td>${esc(m.name || '')}</td></tr>`).join('')}</table>` : ''}
    ${(ev.dietary || []).length ? `<h2>${tt('ev_dietary')}</h2><table>${ev.dietary.map((d) => `<tr><td class="k" style="width:10%">${esc(String(d.count ?? ''))}×</td><td>${esc(dietOf(d.type))}${d.who ? ` (${esc(d.who)})` : ''}</td></tr>`).join('')}</table>` : ''}
    ${ev.setup || ev.drinks || ev.extras ? `<h2>${tt('ev_sec_setup')}</h2>${kv([[tt('ev_setup'), ev.setup ? `<span class="pre">${esc(ev.setup)}</span>` : ''], [tt('ev_drinks'), ev.drinks ? `<span class="pre">${esc(ev.drinks)}</span>` : ''], [tt('ev_extras'), ev.extras ? `<span class="pre">${esc(ev.extras)}</span>` : '']])}` : ''}
    <h2>${tt('ev_sec_money')}</h2>${kv([
      [tt('ev_price_pp'), ev.price_per_person != null ? `${money(ev.price_per_person)}${g ? ` × ${g} = <strong>${money(pp)}</strong>` : ''}` : ''],
      [tt('ev_room_hire'), ev.room_hire != null ? money(ev.room_hire) : ''], [tt('ev_min_spend'), ev.min_spend != null ? money(ev.min_spend) : ''],
      [tt('ev_deposit'), ev.deposit != null ? `${money(ev.deposit)}${ev.deposit_due ? `, ${tt('ev_before')} ${esc(dateIn(ev.deposit_due, l))}` : ''}${ev.deposit_paid ? ` (${tt('ev_paid')})` : ''}` : ''],
      [tt('ev_payment_terms'), ev.payment_terms ? `<span class="pre">${esc(ev.payment_terms)}</span>` : ''], [tt('ev_cancellation_terms'), ev.cancellation_terms ? `<span class="pre">${esc(ev.cancellation_terms)}</span>` : '']])}
    <div class="small" style="margin-top:4px">${vatNote} ${tt('ev_final_count_note')}</div>
    <h2>${tt('ev_approval')}</h2><p class="small">${tt('ev_approval_text')}</p>
    <div class="sign"><div>${tt('ev_sign_name')}</div><div>${tt('ev_sign_date')}</div><div>${tt('ev_sign_signature')}</div></div>
  </div>`);
}

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
    .beo .pb { break-before: page; }
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
    <div class="fg">${f('ev_client_name')}${f('ev_client_company')}${f('ev_phone')}${f('ev_email')}${f('ev_day_contact')}${f('ev_day_contact_phone')}${f('ev_invoice', true)}${f('ev_reference')}</div>
    <h2>${tt('ev_guests')}</h2>
    <div class="fg">${f('ev_guests_expected')}${f('ev_guests_guaranteed')}${f('ev_guarantee_deadline')}${f('ev_children')}</div>
    <h2>${tt('ev_dietary')}</h2>${grid([['ev_count', '12%'], ['ev_diet_type', '38%'], ['ev_who', '50%']], 5)}
    <h2>${tt('ev_timeline')}</h2>${grid([['time', '14%'], ['ev_what', '86%']], 8)}
    <h2 class="pb">${tt('ev_menu')}</h2>${grid([['ev_course', '24%'], ['ev_dish', '76%']], 6)}
    <h2>${tt('ev_sec_setup')}</h2><div class="lbl">${tt('ev_setup')}</div>${lines(2)}
    <h2>${tt('ev_sec_drinks_extras')}</h2><div class="lbl">${tt('ev_drinks')}</div>${lines(2)}<div class="lbl">${tt('ev_extras')}</div>${lines(2)}
    <h2>${tt('ev_sec_money')}</h2>
    <div class="fg">${f('ev_price_pp')}${f('ev_room_hire')}${f('ev_min_spend')}${f('ev_deposit')}${f('ev_deposit_due')}<div class="opts">${tt('ev_incl_vat')}: ${box('yes')}${box('no')}</div></div>
    <div class="lbl">${tt('ev_payment_terms')}</div>${lines(1)}<div class="lbl">${tt('ev_cancellation_terms')}</div>${lines(1)}
    <h2>${tt('ev_blank_notes')}</h2>${lines(3)}
    <div class="keep"><h2>${tt('ev_approval')}</h2><p class="small">${tt('ev_approval_text')}</p>
    <div class="sign"><div>${tt('ev_sign_name')}</div><div>${tt('ev_sign_date')}</div><div>${tt('ev_sign_signature')}</div></div>
    <div class="office"><div class="small"><strong>${tt('ev_office')}</strong></div><div class="fg3">${f('ev_status')}${f('ev_sold_by')}${f('ev_entered')}</div></div></div>
  </div>`);
}
