// Settings (managers only): team and accounts, fixed shifts, links, backups.
// Accounts and passwords go through the admin-users edge function, which re-checks that you are a manager.
import { state, isManager, app, esc, fmt, toast, toastError, todayIso, $, $$, openModal, confirmDialog, formHtml, readForm, download, employeeView, avatar } from '../core.js';
import { PHOTO_BUCKET } from '../config.js';
import { loadCourses, saveCourses, DEFAULT_COURSES } from '../courses.js';
import { loadRooms, saveRooms } from '../rooms.js';
import { loadQuoteTexts, saveQuoteTexts, QT_FIELDS, QT_DEFAULTS } from '../quotetexts.js';

// Texts on the quote, the confirmation and the quote mail; empty = the standard text
async function quoteTextsSection(el) {
  const nl = lang() === 'nl';
  const v = await loadQuoteTexts();
  let tab = 'nl';
  const draw = () => {
    el.innerHTML = `<div class="card"><h2>${t('set_quote_texts')}</h2>
      <p class="small muted">${nl ? 'De vaste teksten op de offerte, de bevestiging en in de mail. Woorden tussen accolades vult de app zelf in: {voornaam}, {event}, {datum}, {de_offerte}, {geldig_tot} en {uvh_link}. Laat je een veld leeg, dan gebruikt de app de standaardtekst.' : 'The fixed texts on the quote, the confirmation and in the mail. Words in braces are filled in by the app: {voornaam} (first name), {event}, {datum} (date), {de_offerte}, {geldig_tot} (valid until) and {uvh_link}. An empty field uses the standard text.'}</p>
      <div class="ro-views" role="tablist" style="margin:8px 0 14px">${['nl', 'en'].map((k) => `<button type="button" class="${tab === k ? 'on' : ''}" data-qtab="${k}">${k === 'nl' ? 'Nederlands' : 'English'}</button>`).join('')}</div>
      ${QT_FIELDS.map(([k, label, ph]) => `<div class="field"><label for="qt-${k}">${esc(label[lang()] || label.en)}${ph ? ` <span class="tiny muted">${esc(ph)}</span>` : ''}</label>
        <textarea id="qt-${k}" data-qt="${k}" rows="${k === 'mail' ? 12 : 3}" placeholder="${esc(QT_DEFAULTS[tab][k])}">${esc((v[tab] || {})[k] || QT_DEFAULTS[tab][k])}</textarea>
        <button type="button" class="link-btn small" data-qreset="${k}">${nl ? 'Standaardtekst' : 'Standard text'}</button></div>`).join('')}
      <button type="button" class="btn-primary" id="qt-save">${t('save')}</button></div>`;
    const read = () => { v[tab] = v[tab] || {}; $$('[data-qt]', el).forEach((x) => { const val = x.value.trim(); v[tab][x.dataset.qt] = val === QT_DEFAULTS[tab][x.dataset.qt] ? '' : val; }); };
    $$('[data-qtab]', el).forEach((b) => (b.onclick = () => { read(); tab = b.dataset.qtab; draw(); }));
    $$('[data-qreset]', el).forEach((b) => (b.onclick = () => { $(`#qt-${b.dataset.qreset}`, el).value = QT_DEFAULTS[tab][b.dataset.qreset]; }));
    $('#qt-save', el).onclick = async () => { read(); try { await saveQuoteTexts(v); toast(t('saved')); } catch (e) { toastError(e); } };
  };
  draw();
}

// Rooms with their standard room hire, used when making a quote
async function roomsSection(el) {
  const nl = lang() === 'nl';
  let { rooms, example } = await loadRooms();
  const num = (v) => (v == null ? '' : String(v).replace('.', ','));
  const draw = () => {
    el.innerHTML = `<div class="card"><h2>${t('set_rooms')}</h2>
      <p class="small muted">${nl ? 'De ruimtes die je bij een event kunt aanvinken. De zaalhuur is inclusief 21% btw en komt vanzelf bij de prijzen van de offerte; per event kun je hem nog aanpassen.' : 'The rooms you can tick on an event. Room hire includes 21% VAT and goes onto the quote prices automatically; you can still change it per event.'}</p>
      ${example ? `<div class="note" style="margin-bottom:12px">${nl ? '<strong>Dit zijn voorbeelden.</strong> Pas de namen en prijzen aan naar de echte ruimtes en sla op.' : '<strong>These are examples.</strong> Change the names and prices to the real rooms and save.'}</div>` : ''}
      <div id="rm-rows">${rooms.map((r, i) => `<div class="ev-line rm-line" data-i="${i}" data-id="${esc(r.id || '')}">
        <input name="rm_name" value="${esc(r.name || '')}" placeholder="${nl ? 'Naam, bijv. De kas' : 'Name, e.g. The greenhouse'}" aria-label="${nl ? 'Naam' : 'Name'}">
        <input name="rm_hire" value="${num(r.hire)}" inputmode="decimal" placeholder="€ incl." style="max-width:110px" aria-label="${nl ? 'Zaalhuur incl. btw' : 'Room hire incl. VAT'}">
        <input name="rm_cap" value="${r.capacity || ''}" inputmode="numeric" placeholder="${nl ? 'max. gasten' : 'max. guests'}" style="max-width:110px" aria-label="${nl ? 'Maximaal aantal gasten' : 'Max. guests'}">
        <button type="button" class="btn-sm btn-ghost" data-rmdel="${i}" aria-label="${t('delete')}">&#10005;</button></div>`).join('')}</div>
      <button type="button" class="btn-sm" id="rm-add">+ ${nl ? 'Ruimte toevoegen' : 'Add room'}</button>
      <div style="margin-top:14px"><button type="button" class="btn-primary" id="rm-save">${t('save')}</button></div></div>`;
    const read = () => { rooms = $$('#rm-rows [data-i]', el).map((r) => ({ id: r.dataset.id || null, name: r.querySelector('[name=rm_name]').value, hire: (() => { const x = r.querySelector('[name=rm_hire]').value.replace(/[€\s.]/g, '').replace(',', '.'); return x === '' ? null : Number(x); })(), capacity: r.querySelector('[name=rm_cap]').value })); };
    $('#rm-add', el).onclick = () => { read(); rooms.push({ name: '', hire: null }); draw(); const ins = $$('#rm-rows [name=rm_name]', el); ins[ins.length - 1].focus(); };
    $$('[data-rmdel]', el).forEach((b) => (b.onclick = () => { read(); rooms.splice(Number(b.dataset.rmdel), 1); draw(); }));
    $('#rm-save', el).onclick = async () => { read(); try { rooms = await saveRooms(rooms); example = false; draw(); toast(t('saved')); } catch (e) { toastError(e); } };
  };
  draw();
}

// Courses for the event menu: one list for food, one for drinks; the order here is the order in the dropdown
async function coursesSection(el) {
  const items = check(await sb.from('menu_items').select('group_type, category')) || [];
  const c = await loadCourses(items);
  const nl = lang() === 'nl';
  const box = (g, title) => `<div class="field"><label for="cs-${g}">${title}</label><textarea id="cs-${g}" rows="10">${esc((c[g] || []).join('\n'))}</textarea></div>`;
  el.innerHTML = `<div class="card"><h2>${t('set_courses')}</h2>
    <p class="small muted">${nl ? 'De keuzes bij Menu in een event. Eén gang per regel, in de volgorde waarin je ze wilt zien. Categorieën uit het menu (zoals Zoet of Bakkerij) kun je er gewoon bij zetten; dan staan de gerechten daaruit bovenaan bij het kiezen.' : 'The choices under Menu in an event. One course per line, in the order you want to see them. Menu categories (such as Sweet or Bakery) can go in too; their dishes then come first when choosing.'}</p>
    <div class="grid grid-2">${box('food', t('group_food'))}${box('beverage', t('group_beverage'))}</div>
    <div class="row" style="gap:8px;margin-top:6px"><button type="button" class="btn-primary" id="cs-save">${t('save')}</button>
      <button type="button" class="link-btn small" id="cs-reset">${nl ? 'Terug naar de standaardlijst' : 'Back to the standard list'}</button></div></div>`;
  const read = (g) => $(`#cs-${g}`, el).value.split('\n').map((x) => x.trim()).filter(Boolean);
  $('#cs-save', el).onclick = async () => { try { await saveCourses({ food: read('food'), beverage: read('beverage') }); toast(t('saved')); } catch (e) { toastError(e); } };
  $('#cs-reset', el).onclick = () => { for (const g of ['food', 'beverage']) $(`#cs-${g}`, el).value = DEFAULT_COURSES[g].join('\n'); };
}
import { t } from '../i18n.js';
import { sb, check, adminUsers, loadProfiles, setPassword } from '../data.js';
import { renderSystemCheck } from './system-check.js';
import { renderHaccpSettings } from './haccp.js';
import { NAV_ITEMS, orderPaths, saveNavOrder } from '../nav.js';
import { setDevicePin } from '../pinlock.js';
import { SAMPLE_MENU, SAMPLE_PDFS } from '../sample-menu.js';
import { loadOwnMenu } from '../menu-upgrade.js'; // SAMPLE_PDFS: older versions registered these; Remove still clears them
import { loadDishOfMonth, saveDishOfMonth } from './menu.js';
import { lang } from '../i18n.js';
import { renderCompanySettings } from '../uvh.js';
import { renderStartList } from './startlist.js';
const L = (o) => o[lang()] || o.en;

const SECTIONS = [
  { id: 'start', label: 'set_start' },
  { id: 'team', label: 'set_team' },
  { id: 'company', label: 'set_company' },
  { id: 'templates', label: 'set_templates' },
  { id: 'menuorder', label: 'set_menu_order' },
  { id: 'courses', label: 'set_courses' },
  { id: 'rooms', label: 'set_rooms' },
  { id: 'quotetexts', label: 'set_quote_texts' },
  { id: 'haccp', label: 'set_haccp' },
  { id: 'navorder', label: 'set_nav_order' },
  { id: 'links', label: 'set_links' },
  { id: 'system', label: 'set_system' },
  { id: 'password', label: 'set_password' },
];

export async function renderSettings(args = []) {
  if (!isManager()) { location.hash = '#/sops'; return; }
  const narrow = window.matchMedia('(max-width: 820px)').matches;
  if (args[0] === 'backup') args = ['system']; // Backups now live under System check
  const current = SECTIONS.find((x) => x.id === args[0]) || (narrow ? null : SECTIONS[0]);
  app().innerHTML = `<div class="page-head"><h1>${t('nav_settings')}</h1>
      <div class="page-actions"><button type="button" class="btn-sm" id="emp-on" title="${t('emp_view_hint')}">&#128065; ${t('emp_view')}</button></div></div>
    <div class="settings ${current ? 'has-section' : 'menu-only'}">
      <nav class="settings-nav">${SECTIONS.map((x) => `<a href="#/settings/${x.id}" class="${current && x.id === current.id ? 'active' : ''}">${t(x.label)}</a>`).join('')}</nav>
      <div class="settings-main">${current ? `<a class="settings-back" href="#/settings"><i class="ic ic-prev" aria-hidden="true"></i> ${t('nav_settings')}</a><div id="sec"></div>` : ''}</div>
    </div>`;
  $('#emp-on').onclick = () => { employeeView.set(true); location.hash = '#/sops'; };
  if (!current) return;
  try { await ({ start: renderStartList, team, company: renderCompanySettings, templates, menuorder, courses: coursesSection, rooms: roomsSection, quotetexts: quoteTextsSection, haccp: renderHaccpSettings, navorder, links, password, system: async (el) => { await renderSystemCheck(el); el.insertAdjacentHTML('beforeend', backupCards()); } })[current.id]($('#sec')); } catch (e) { toastError(e); }
}
const again = () => renderSettings(location.hash.replace(/^#\/settings\/?/, '').split('/'));

// Generic list with add / edit / delete in a popup
function crud(el, { title, sub, rows, columns, fields, table, toRow, addLabel }) {
  el.innerHTML = `<div class="card"><div class="split"><div><h2 style="margin:0">${title}</h2>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>
      <button type="button" class="btn-primary btn-sm" id="add">+ ${addLabel || t('add')}</button></div>
    <div class="table-wrap" style="margin-top:12px"><table class="stack"><thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td data-label="${esc(c.label)}">${c.html(r)}</td>`).join('')}
      <td class="actions"><button type="button" class="btn-sm" data-edit="${r.id}">${t('edit')}</button>
        <button type="button" class="btn-sm btn-ghost btn-danger" data-del="${r.id}">${t('delete')}</button></td></tr>`).join('')
      || `<tr><td colspan="${columns.length + 1}" class="empty">${t('nothing_yet')}</td></tr>`}</tbody></table></div></div>`;
  const open = (row) => {
    openModal(`<h2>${row ? t('edit') : addLabel || t('add')}</h2><form id="f">${formHtml(fields, row || {})}
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(card, fields);
        try {
          const payload = toRow(v);
          if (row) check(await sb.from(table).update(payload).eq('id', row.id));
          else check(await sb.from(table).insert(payload));
          close(); toast(t('saved')); again();
        } catch (err) { toastError(err); }
      };
    });
  };
  $('#add', el).onclick = () => open(null);
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => open(rows.find((r) => r.id === b.dataset.edit))));
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog(t('confirm_delete'), t('delete')))) return;
    try { check(await sb.from(table).delete().eq('id', b.dataset.del)); toast(t('deleted')); again(); } catch (err) { toastError(err); }
  }));
}

// ------------------------------------------------------------------ order of the top menu
// Number the menu items or move them with the arrows; 1 is on the left. The same for everyone.
function navorder(el) {
  let order = orderPaths(NAV_ITEMS.map(([p]) => p), state.navOrder);
  const label = (p) => t(NAV_ITEMS.find(([x]) => x === p)[1]);
  const draw = () => {
    el.innerHTML = `<div class="card"><h2 style="margin:0">${t('set_nav_order')}</h2><div class="small muted">${t('nav_order_sub')}</div>
      <div class="order-list" style="margin-top:12px">${order.map((p, i) => `<div class="order-row">
        <input type="number" min="1" step="1" inputmode="numeric" value="${i + 1}" data-nav="${p}" aria-label="${t('position')}: ${esc(label(p))}">
        <span style="flex:1"><strong>${esc(label(p))}</strong></span>
        <span class="row-move" style="display:inline-flex"><button type="button" data-nup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${t('move_up')}">&#9650;</button><button type="button" data-ndown="${i}" ${i === order.length - 1 ? 'disabled' : ''} aria-label="${t('move_down')}">&#9660;</button></span></div>`).join('')}</div>
      <div class="tiny muted" style="margin-top:8px">${t('nav_order_fixed')}</div>
      <div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn-primary" id="save-nav">${t('save')}</button><button type="button" class="btn-sm" id="reset-nav">${t('nav_order_reset')}</button></div></div>`;
    const swap = (i, j) => { [order[i], order[j]] = [order[j], order[i]]; draw(); };
    $$('[data-nup]', el).forEach((b) => (b.onclick = () => swap(Number(b.dataset.nup), Number(b.dataset.nup) - 1)));
    $$('[data-ndown]', el).forEach((b) => (b.onclick = () => swap(Number(b.dataset.ndown), Number(b.dataset.ndown) + 1)));
    $('#reset-nav', el).onclick = () => { order = NAV_ITEMS.map(([p]) => p); draw(); };
    $('#save-nav', el).onclick = async () => {
      // sort by the typed numbers; equal or empty numbers keep their current place
      // on equal numbers the item you just renumbered goes first (type 1 to put it in front)
      const typed = order.map((p, i) => { const v = Number($(`[data-nav="${p}"]`, el).value); const n = Number.isFinite(v) && v > 0 ? v : Infinity; return { p, n, i, moved: n !== i + 1 }; });
      typed.sort((a, b) => a.n - b.n || (b.moved - a.moved) || a.i - b.i);
      order = typed.map((x) => x.p);
      try { await saveNavOrder(order); toast(t('saved')); draw(); } catch (e) { toastError(e); }
    };
  };
  draw();
}

// ------------------------------------------------------------------ menu order
// Number the dishes per group: 1 shows first on the Menu page. Saved as sort_order 10, 20, 30, ...
async function menuorder(el) {
  const dom = await loadDishOfMonth();
  const rows = check(await sb.from('menu_items').select('id, name, category, group_type, sort_order').eq('active', true)
    .order('group_type').order('sort_order').order('name')) || [];
  const groups = ['food', 'beverage'].map((g) => [g, rows.filter((r) => (r.group_type || 'food') === g)]).filter(([, l]) => l.length);
  el.innerHTML = `<div class="card"><h2 style="margin:0">${t('set_menu_order')}</h2><div class="small muted">${t('menu_order_sub')}</div>
    ${!groups.length ? `<div class="empty">${t('menu_none')}</div>` : groups.map(([g, list]) => `<div class="sop-cat" style="margin-top:16px">${t('group_' + g)}</div>
      <div class="order-list">${list.map((r, i) => `<label class="order-row"><input type="number" min="1" step="1" inputmode="numeric" value="${i + 1}" data-oid="${r.id}" data-g="${g}" aria-label="${t('position')}: ${esc(r.name)}">
        <span><strong>${esc(r.name)}</strong>${r.category ? ` <span class="tag">${esc(r.category)}</span>` : ''}</span></label>`).join('')}</div>`).join('')}
    ${groups.length ? `<button type="button" class="btn-primary" id="save-order" style="margin-top:14px">${t('save')}</button>` : ''}</div>
    <div class="card"><h2 style="margin:0">${L({ en: 'Dish of the month', nl: 'Gerecht van de maand' })}</h2>
      <div class="small muted">${L({ en: 'Shown at the top of the Menu page and in the newsletter.', nl: 'Staat bovenaan de Menu-pagina en in de nieuwsbrief.' })}</div>
      <div class="field-row" style="margin-top:12px"><div class="field"><select id="dom">${`<option value="">${L({ en: '(none)', nl: '(geen)' })}</option>`}${rows.filter((r) => (r.group_type || 'food') === 'food').map((r) => `<option value="${r.id}" ${dom && dom.id === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      <div class="field"><input id="dom-note" value="${esc((dom && dom.note) || '')}" placeholder="${L({ en: 'Why this dish? One or two sentences for the guest.', nl: 'Waarom dit gerecht? Een of twee zinnen voor de gast.' })}"></div></div>
      <button type="button" class="btn-primary" id="dom-save">${t('save')}</button></div>
    <div class="card"><h2 style="margin:0">${L({ en: 'Our menu', nl: 'Onze menukaart' })}</h2>
      <div class="small muted">${L({ en: `Our winter menu: ${SAMPLE_MENU.length} dishes and drinks with allergens and an example photo. It went in automatically; this button puts back anything that is missing (dishes with the same name are left alone) and takes out the old demo dishes.`,
        nl: `Onze winterkaart: ${SAMPLE_MENU.length} gerechten en dranken met allergenen en een voorbeeldfoto. Hij is automatisch geladen; deze knop zet terug wat ontbreekt (gerechten met dezelfde naam blijven zoals ze zijn) en haalt de oude demo's weg.` })}</div>
      <div class="page-actions" style="margin-top:12px;justify-content:flex-start"><button type="button" class="btn-primary" id="sample-load">${L({ en: 'Load our menu again', nl: 'Onze menukaart opnieuw laden' })}</button>
        <button type="button" class="btn" id="sample-remove">${L({ en: 'Remove these dishes', nl: 'Deze gerechten weghalen' })}</button></div></div>`;
  $('#dom-save', el).onclick = async () => {
    try { await saveDishOfMonth($('#dom', el).value ? { id: $('#dom', el).value, note: $('#dom-note', el).value.trim(), month: todayIso().slice(0, 7) } : null); toast(t('saved')); }
    catch (e) { toastError(e); }
  };
  $('#sample-load', el).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { const r = await loadOwnMenu(); toast(L({ en: `${r.added} dishes added, ${r.removed} demo dishes removed. The menu cards are under Menu.`, nl: `${r.added} gerechten toegevoegd, ${r.removed} demo's weggehaald. De menukaarten staan bij Menu.` })); again(); }
    catch (err) { toastError(err); e.currentTarget.disabled = false; }
  };
  $('#sample-remove', el).onclick = async () => {
    if (!(await confirmDialog(L({ en: 'Remove the dishes and PDFs of the sample menu? Dishes you added yourself stay.', nl: 'De gerechten en pdf\'s van het voorbeeldmenu weghalen? Wat je zelf hebt toegevoegd blijft staan.' }), L({ en: 'Remove', nl: 'Weghalen' })))) return;
    try {
      const names = SAMPLE_MENU.map((m) => m.name);
      check(await sb.from('menu_items').update({ active: false }).in('name', names));
      check(await sb.from('menu_pdfs').delete().in('path', SAMPLE_PDFS.map((x) => x.path)));
      toast(L({ en: 'Sample menu removed', nl: 'Voorbeeldmenu weggehaald' })); again();
    } catch (err) { toastError(err); }
  };
  const btn = $('#save-order', el); if (!btn) return;
  btn.onclick = async () => {
    try {
      const updates = [];
      for (const [, list] of groups) {
        // sort by the typed number; equal or empty numbers keep their current order
        const typed = list.map((r, i) => { const v = Number($(`[data-oid="${r.id}"]`, el).value); const n = Number.isFinite(v) && v > 0 ? v : Infinity; return { r, n, i, moved: n !== i + 1 }; });
        typed.sort((a, b) => a.n - b.n || (b.moved - a.moved) || a.i - b.i); // renumbered dish wins a tie
        typed.forEach(({ r }, k) => { const so = (k + 1) * 10; if (r.sort_order !== so) updates.push(sb.from('menu_items').update({ sort_order: so }).eq('id', r.id).then(check)); });
      }
      btn.disabled = true;
      await Promise.all(updates);
      toast(t('saved')); again();
    } catch (e) { toastError(e); btn.disabled = false; }
  };
}

// ------------------------------------------------------------------ team and accounts
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no confusing 0/O/1/l/i
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
function credentialsPopup(name, email, password) {
  const text = t('cred_text', { n: name, e: email, p: password, url: `${location.origin}${location.pathname}?w=2` /* new ?w makes WhatsApp fetch the new preview */ });
  openModal(`<h2>${t('cred_title', { n: esc(name) })}</h2>
    <div class="pw-card"><div class="small">${t('pw_once')}</div><div style="margin:6px 0">${esc(email)}<br><code>${esc(password)}</code></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn-sm" id="copy">${t('copy')}</button>
    <a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">${t('share_whatsapp')}</a></div></div>
    <div class="modal-actions"><button type="button" class="btn-primary" data-close>${t('close')}</button></div>`, (card) => {
    card.querySelector('#copy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch { toastError(new Error(text)); } };
  });
}

// Finance access is managed from here too (same login), through the finance app's own admin function.
// Shown only when you may manage finance users; otherwise the Finance column and choices stay hidden.
const FIN_ROLES = ['staff', 'manager', 'org_admin'];
async function loadFinanceAccess() {
  try {
    const { data: r, error: e1 } = await sb.from('fin_restaurants').select('organization_id').limit(1).maybeSingle();
    if (e1 || !r) return { failed: e1 ? e1.message : 'no restaurant found' };
    const { data, error } = await sb.functions.invoke('fin-admin-users', { body: { action: 'list', organization_id: r.organization_id } });
    if (error) { let msg = error.message; try { const j = await error.context.json(); msg = j.error || msg; } catch { /* keep */ } return { failed: msg }; }
    if (!data || data.error) return { failed: (data && data.error) || 'no answer' };
    return { org: r.organization_id, users: data.users || [] };
  } catch (e) { return { failed: e.message }; }
}
async function finAdmin(body) {
  const { data, error } = await sb.functions.invoke('fin-admin-users', { body });
  if (error) { let msg = error.message; try { const j = await error.context.json(); msg = j.error || msg; } catch { /* keep */ } throw new Error(msg); }
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function team(el) {
  el.innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [profiles, finRes] = await Promise.all([loadProfiles(), loadFinanceAccess()]);
  const fin = finRes && !finRes.failed ? finRes : null;
  if (finRes && finRes.failed) console.warn('Finance access not loaded:', finRes.failed);
  state.profiles = profiles;
  const rows = state.profiles;
  const finOf = (p) => (fin ? fin.users.find((u) => u.user_id === p.id || (p.email && u.email && u.email.toLowerCase() === p.email.toLowerCase())) : null);
  const finLabel = (u) => (u && u.active !== false ? t('fin_role_' + u.role) || u.role : '–');
  const finOptions = [{ value: '', label: t('fin_none') }, ...FIN_ROLES.map((r) => ({ value: r, label: t('fin_role_' + r) }))];
  const teamRoles = [{ value: 'staff', label: t('role_staff') }, { value: 'manager', label: t('role_manager') }];
  el.innerHTML = `<div class="card"><div class="split"><div><h2 style="margin:0">${t('set_team')}</h2><div class="small muted">${t('set_team_sub')}</div></div>
      <button type="button" class="btn-primary btn-sm" id="add">+ ${t('add_account')}</button></div>
    <div class="table-wrap" style="margin-top:12px"><table class="stack"><thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('role')}</th>${fin ? `<th>Finance</th>` : ''}<th>${t('active')}</th><th></th></tr></thead><tbody>
    ${rows.map((p) => { const self = p.id === state.me.id; return `<tr>
      <td data-label="${t('name')}"><span class="team-av">${avatar(p.full_name, p.photo_url)}<span><strong>${esc(p.full_name)}</strong>${self ? ` <span class="small muted">(${t('you')})</span>` : ''}</span></span></td>
      <td data-label="${t('email')}" class="small">${esc(p.email || '')}</td>
      <td data-label="${t('role')}">${t('role_' + p.role)}</td>
      ${fin ? `<td data-label="Finance">${finLabel(finOf(p))}</td>` : ''}
      <td data-label="${t('active')}">${p.active === false ? '–' : '&#10003;'}</td>
      <td class="actions"><button type="button" class="btn-sm" data-edit="${p.id}">${t('edit')}</button>
        ${self ? '' : `<button type="button" class="btn-sm" data-reset="${p.id}">${t('reset_password')}</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="note">${fin ? t('team_note_both') : `${t('team_note_nofin')}${finRes && finRes.failed ? ` <span class="small muted">(${esc(finRes.failed)})</span>` : ''}`}</div></div>`;
  $('#add', el).onclick = () => {
    const fields = [
      { name: 'full_name', label: t('name'), required: true, placeholder: t('name_ph') },
      { name: 'email', label: t('email'), type: 'email', required: true },
      { name: 'password', label: t('password'), required: true, hint: t('password_hint') },
      { name: 'role', label: t('acc_team_role'), type: 'select', options: teamRoles },
    ];
    if (fin) fields.push({ name: 'fin_role', label: t('acc_fin_role'), type: 'select', options: finOptions, hint: t('acc_fin_hint') });
    openModal(`<h2>${t('add_account')}</h2><form id="f">${formHtml(fields, { password: generatePassword(), role: 'staff', fin_role: '' })}
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('create_account')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(card, fields);
        const { role, fin_role: finRole, ...acc } = v;
        try { await adminUsers({ action: 'create', ...acc }); } catch (err) { toastError(err); return; }
        try {
          // the new profile starts as staff; give it the chosen team role
          if (role === 'manager') {
            const fresh = await loadProfiles();
            const np = fresh.find((x) => (x.email || '').toLowerCase() === acc.email.trim().toLowerCase());
            if (np) check(await sb.from('profiles').update({ role }).eq('id', np.id));
          }
          if (fin && finRole) await finAdmin({ action: 'create', organization_id: fin.org, email: acc.email, full_name: acc.full_name, role: finRole, language: state.me.language || 'nl', password: acc.password });
        } catch (err) { toastError(err); }
        close(); credentialsPopup(acc.full_name, acc.email, acc.password); team(el);
      };
    });
  };
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => {
    const p = rows.find((x) => x.id === b.dataset.edit);
    const self = p.id === state.me.id;
    const fields = [{ name: 'full_name', label: t('name'), required: true }];
    if (!self) fields.push({ name: 'role', label: t('role'), type: 'select', options: [{ value: 'staff', label: t('role_staff') }, { value: 'manager', label: t('role_manager') }] },
      { name: 'active', label: t('active'), type: 'checkbox' });
    else fields.push({ type: 'help', label: t('self_note') });
    const fu = finOf(p);
    const finNow = fu && fu.active !== false ? fu.role : '';
    // your own finance access and a super admin's are managed in the finance app
    const finEditable = fin && !self && !(fu && fu.role === 'super_admin');
    if (finEditable) fields.push({ name: 'fin_role', label: t('acc_fin_role'), type: 'select', options: finOptions });
    openModal(`<h2>${esc(p.email || p.full_name)}</h2>
      <div class="acc-photo">${avatar(p.full_name, p.photo_url, 'xl')}<div><button type="button" class="btn btn-sm" id="ph-pick"><i class="ic ic-camera" aria-hidden="true"></i> ${t('acc_photo')}</button>
        ${p.photo_url ? `<button type="button" class="link-btn small" id="ph-rm">${t('acc_photo_rm')}</button>` : ''}<input type="file" id="ph-file" accept="image/*" hidden></div></div>
      <form id="f">${formHtml(fields, { ...p, active: p.active !== false, fin_role: finNow })}
      <div class="modal-actions">${!self && !(fu && fu.role === 'super_admin') ? `<button type="button" class="link-btn danger" id="acc-del" style="margin-right:auto">${t('acc_delete')}</button>` : ''}<button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></form>`,
    (card, close) => {
      // photo: made small (square, 400 px) and saved straight away
      const setPhoto = async (url) => { check(await sb.from('profiles').update({ photo_url: url }).eq('id', p.id)); p.photo_url = url; if (self) state.me.photo_url = url;
        card.querySelector('.acc-photo .av').outerHTML = avatar(p.full_name, url, 'xl'); toast(t('saved')); };
      card.querySelector('#ph-pick').onclick = () => card.querySelector('#ph-file').click();
      card.querySelector('#ph-file').onchange = async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        try {
          const img = await createImageBitmap(f); const side = Math.min(img.width, img.height); const cv = document.createElement('canvas'); cv.width = cv.height = 400;
          cv.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 400, 400);
          const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
          const path = `avatars/${p.id}-${Date.now()}.jpg`;
          const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
          await setPhoto(sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl);
        } catch (err) { toastError(err); }
      };
      const rm = card.querySelector('#ph-rm'); if (rm) rm.onclick = async () => { try { await setPhoto(null); rm.remove(); } catch (err) { toastError(err); } };
      const del = card.querySelector('#acc-del');
      if (del) del.onclick = async () => {
        if (!(await confirmDialog(t('acc_delete_confirm', { n: p.full_name }), t('acc_delete')))) return;
        try {
          if (fu && fin) await finAdmin({ action: 'remove', organization_id: fin.org, id: fu.id }).catch(() => null);
          const { data, error } = await sb.rpc('delete_account', { target: p.id });
          if (error) throw error;
          close(); toast(t(data === 'archived' ? 'acc_archived' : 'acc_deleted', { n: p.full_name })); team(el);
        } catch (err) { toastError(err); }
      };
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const { fin_role: finRole, ...v } = readForm(card, fields);
        if (!v.full_name) return;
        try {
          check(await sb.from('profiles').update(self ? { full_name: v.full_name } : v).eq('id', p.id));
          if (finEditable && (finRole || '') !== finNow) {
            if (!finRole) await finAdmin({ action: 'remove', organization_id: fin.org, id: fu.id });
            else if (fu) await finAdmin({ action: 'update', organization_id: fin.org, id: fu.id, role: finRole, active: true });
            else await finAdmin({ action: 'create', organization_id: fin.org, email: p.email, full_name: v.full_name, role: finRole, language: p.language || 'nl' });
          }
          if (self) state.me.full_name = v.full_name;
          close(); toast(t('saved')); team(el);
        } catch (err) { toastError(err); }
      };
    });
  }));
  $$('[data-reset]', el).forEach((b) => (b.onclick = async () => {
    const p = rows.find((x) => x.id === b.dataset.reset);
    if (!(await confirmDialog(t('confirm_reset', { n: p.full_name }), t('reset_password'), false))) return;
    const password = generatePassword();
    try { await adminUsers({ action: 'reset_password', user_id: p.id, password }); credentialsPopup(p.full_name, p.email || '', password); }
    catch (err) { toastError(err); }
  }));
}

// ------------------------------------------------------------------ fixed shifts
async function templates(el) {
  const rows = check(await sb.from('shift_templates').select('*').order('sort_order').order('start_time')) || [];
  crud(el, {
    title: t('set_templates'), sub: t('set_templates_sub'), table: 'shift_templates', rows, addLabel: t('add_template'),
    columns: [
      { label: t('name'), html: (r) => `<strong>${esc(r.name)}</strong>` },
      { label: t('time'), html: (r) => `${fmt.time(r.start_time)}–${fmt.time(r.end_time)}` },
      { label: t('section'), html: (r) => esc(r.section || '') },
    ],
    fields: [
      { name: 'name', label: t('name'), required: true, placeholder: t('template_ph') },
      { name: 'start_time', label: t('from'), type: 'time', required: true },
      { name: 'end_time', label: t('until'), type: 'time', required: true },
      { name: 'section', label: t('section'), placeholder: t('section_ph') },
      { name: 'sort_order', label: t('sort_order'), type: 'number' },
    ],
    toRow: (v) => ({ name: v.name, start_time: v.start_time, end_time: v.end_time, section: v.section, sort_order: v.sort_order || 0 }),
  });
}

// ------------------------------------------------------------------ links
async function links(el) {
  const rows = check(await sb.from('resources').select('*').order('sort_order')) || [];
  crud(el, {
    title: t('set_links'), sub: t('set_links_sub'), table: 'resources', rows, addLabel: t('add_link'),
    columns: [
      { label: t('name'), html: (r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener"><strong>${esc(r.label)}</strong></a>` },
      { label: t('note'), html: (r) => esc(r.note || '') },
    ],
    fields: [
      { name: 'label', label: t('name'), required: true, placeholder: t('link_name_ph') },
      { name: 'url', label: 'URL', required: true, placeholder: 'https://...' },
      { name: 'note', label: t('link_note'), placeholder: t('link_note_ph') },
      { name: 'sort_order', label: t('sort_order'), type: 'number' },
    ],
    toRow: (v) => ({ label: v.label, url: v.url, note: v.note, sort_order: v.sort_order || 0 }),
  });
}

// ------------------------------------------------------------------ backups
// The full backup of both apps is made every night by GitHub and e-mailed (see .github/workflows/backup.yml);
// this page only says so and points to the smaller exports.
function backupCards() {
  return `<div class="card"><h2>${t('set_backup')}</h2><p class="small muted" style="margin-top:-6px">${t('backup_nightly')}</p></div>
    <div class="card"><h2>${t('other_exports')}</h2><p class="small muted" style="margin-top:-6px">${t('other_exports_sub')}</p>
      <div class="page-actions"><a class="btn btn-sm" href="#/sops">${t('nav_sops')}</a><a class="btn btn-sm" href="#/roster">${t('nav_roster')}</a></div></div>`;
}

// ------------------------------------------------------------------ own password (one login for both Wintertuin apps)
async function password(el) {
  el.innerHTML = `<div class="card" style="max-width:480px"><h2>${t('set_password')}</h2><p class="small muted" style="margin-top:-6px">${t('set_password_sub')}</p>
    <form id="pw"><div class="field"><label>${t('pw_new')}</label><input type="password" name="pw" autocomplete="new-password" minlength="8" required></div>
    <div class="field"><label>${t('pw_repeat')}</label><input type="password" name="pw2" autocomplete="new-password" minlength="8" required></div>
    <button class="btn-primary" type="submit">${t('save')}</button></form></div>
    <div class="card" style="max-width:480px"><h2>${L({ en: 'My PIN', nl: 'Mijn pincode' })}</h2>
      <p class="small muted" style="margin-top:-6px">${L({ en: 'Four digits that open both apps on this device, and clock you in on the tablet at the pass.', nl: 'Vier cijfers die beide apps openen op dit toestel, en je inklokken op de tablet bij de pass.' })}</p>
      <form id="pin-form" class="pin-row" autocomplete="off"><input id="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" aria-label="PIN">
        <button type="submit" class="btn-primary">${L({ en: 'Save PIN', nl: 'Pincode opslaan' })}</button></form></div>`;
  $('#pw', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.pw.value.length < 8) return toastError(new Error(t('pw_short')));
    if (f.pw.value !== f.pw2.value) return toastError(new Error(t('pw_mismatch')));
    try { await setPassword(f.pw.value); f.reset(); toast(t('pw_saved')); } catch (err) { toastError(err); }
  };
  $('#pin-form', el).onsubmit = async (e) => {
    e.preventDefault();
    const v = $('#pin', el).value.trim();
    if (!/^[0-9]{4}$/.test(v)) return toastError(new Error(L({ en: 'The PIN is 4 digits.', nl: 'De pincode is 4 cijfers.' })));
    try {
      await setDevicePin({ id: state.me.id, full_name: state.me.full_name }, v);
      try { check(await sb.rpc('set_my_kiosk_pin', { p_pin: v })); } catch { /* clock-in tablet not switched on yet */ }
      $('#pin', el).value = ''; toast(L({ en: 'PIN saved', nl: 'Pincode opgeslagen' }));
    } catch (err) { toastError(err); }
  };
}
