// Menu: dishes and drinks with description, photo, instruction video, price and the 14 EU allergens,
// split into Food and Beverage. Prints an allergen card for front of house.
import { state, isManager, app, esc, fmt, toast, toastError, $, $$, openModal, confirmDialog, formHtml, readForm, printHtml } from '../core.js';
import { t, lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { PHOTO_BUCKET } from '../config.js';
import { loadCards } from './menucard.js';
import { upgradeMenuOnce, addExampleDishesOnce } from '../menu-upgrade.js';
import { SEASONS, seasonName, fitsSeason, seasonPills } from '../seasons.js';

// Turn any YouTube or Vimeo link (watch, share, shorts, embed) into the embed address that may be shown inside the app.
export function embedUrl(raw) {
  const u = String(raw || '').trim(); if (!u) return '';
  let m = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) { const t = u.match(/[?&](?:t|start)=(\d+)/); return `https://www.youtube-nocookie.com/embed/${m[1]}${t ? `?start=${t[1]}` : ''}`; }
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}`;
  return /^https:\/\//i.test(u) ? u : '';
}

let items = [];
let pdfs = []; // named menu PDFs (BQT menu, Lunch menu, ...), each { id, label, path, sort_order, view, download }
const PDF_DIR = 'menu-pdf';
// The 14 allergens that EU law (Regulation 1169/2011) requires you to inform guests about
export const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'];

// Dish of the month: one dish, chosen by a manager under Settings, kept in team_settings (readable by everyone)
export async function loadDishOfMonth() {
  try { const { data } = await sb.from('team_settings').select('value').eq('key', 'dish_of_month').maybeSingle(); return data && data.value && data.value.id ? data.value : null; }
  catch { return null; }
}
export async function saveDishOfMonth(v) {
  const { error } = await sb.from('team_settings').upsert({ key: 'dish_of_month', value: v || {}, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}
let dishOfMonth = null;
const L = (o) => o[lang()] || o.en;
let selecting = false;
let openGroups = new Set(); // the headings start folded: the page is one overview
let picked = new Set();
let archivedCount = 0;
let menuCards = [];

export async function renderMenu(args = []) {
  if ((args[0] === 'dishes' || args[0] === 'archive') && isManager()) return renderDishDb();
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  // first visit of a manager after the update: our own menu goes in, the demo dishes and demo lunch card out
  if (isManager()) { const up = await upgradeMenuOnce(); if (up && (up.added || up.removed)) toast(lang() === 'nl' ? `Menu bijgewerkt: ${up.added} gerechten erbij, ${up.removed} demo's weg` : `Menu updated: ${up.added} dishes added, ${up.removed} demo dishes removed`); }
  const [rows] = await Promise.all([
    sb.from('menu_items').select('*').eq('active', true).order('group_type').order('sort_order').order('name'), // order set under Settings > Menu order
    loadPdfs(),
    loadDishOfMonth().then((d) => { dishOfMonth = d; }),
    isManager() ? sb.from('menu_items').select('id', { count: 'exact', head: true }).then((r) => { archivedCount = r.count || 0; }, () => {}) : null,
    loadCards().then((c) => { menuCards = c; }),
  ]);
  items = check(rows) || [];
  openIds = new Set(); // the Menu page always opens folded
  openGroups = new Set();
  selecting = false; picked = new Set();
  draw();
}

function draw() {
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('menu_title')}</h1><div class="muted small">${t('menu_sub')}</div></div>
      <div class="page-actions menu-actions">
      ${items.length ? menuCards.map((c) => `<a class="btn btn-sm" href="#/menucard/${esc(c.id)}"><i class="ic ic-printer" aria-hidden="true"></i> ${esc(c.name || c.title)}</a>`).join('') : ''}
      ${isManager() ? `<a class="btn btn-sm" href="#/menucard/lunch/edit"><i class="ic ic-pencil" aria-hidden="true"></i> ${lang() === 'nl' ? 'Menukaarten bewerken' : 'Edit menu cards'}</a>` : ''}
      ${pdfs.map((x) => `<span class="btn-pair"><a class="btn btn-sm" href="${esc(x.view)}" target="_blank" rel="noopener" data-pdf-view="${x.id}"><i class="ic ic-book" aria-hidden="true"></i> ${esc(x.label)}</a> <a class="btn btn-sm" href="${esc(x.download)}" ${x.sameSite ? `download="${esc(fileName(x.label))}"` : ''} data-pdf-dl="${x.id}" title="${t('download')}" aria-label="${t('download')}: ${esc(x.label)}"><i class="ic ic-download" aria-hidden="true"></i></a></span>`).join('')}
      ${isManager() ? `<button type="button" class="btn-sm" id="pdf-manage"><i class="ic ic-pencil" aria-hidden="true"></i> ${t('menu_pdfs_manage')}</button>` : ''}
      ${items.length ? `<button type="button" class="btn-sm" id="dish-expand">${t('sops_expand_all')}</button>` : ''}
      ${isManager() && items.length ? `<button type="button" class="btn-sm" id="sel-on"><i class="ic ic-check" aria-hidden="true"></i> ${L({ en: 'Take dishes off', nl: 'Gerechten van de kaart' })}</button>` : ''}
      ${isManager() ? `<a class="btn btn-sm" href="#/menu/dishes"><i class="ic ic-book" aria-hidden="true"></i> ${L({ en: 'Dish database', nl: 'Gerechtendatabase' })}${archivedCount ? ` (${archivedCount})` : ''}</a>` : ''}
      ${isManager() ? `<button type="button" class="btn-primary btn-sm" id="add">+ ${t('menu_add')}</button>` : ''}</div></div>
    ${selecting ? `<div class="sel-bar"><span>${L({ en: 'Tap the dishes that are off the menu, or a whole heading.', nl: 'Tik de gerechten aan die van de kaart gaan, of een hele kop.' })}</span>
      <span class="sel-tools"><button type="button" class="btn-sm" id="sel-off">${L({ en: 'Cancel', nl: 'Annuleren' })}</button>
      <button type="button" class="btn-primary btn-sm" id="sel-go" ${picked.size ? '' : 'disabled'}>${L({ en: `Take ${picked.size || ''} off`, nl: `${picked.size || ''} van de kaart` })}</button></span></div>` : ''}
    ${!items.length ? `<div class="card empty">${t('menu_none')}</div>` : ''}
    ${(() => { const d = dishOfMonth && items.find((m) => m.id === dishOfMonth.id); if (!d) return '';
      return `<a class="card dom-card" href="#/menu" data-dom="${d.id}">${d.photo_url ? `<img src="${esc(d.photo_url)}" alt="" loading="lazy">` : '<span class="dish-photo none" aria-hidden="true"></span>'}
        <span><span class="dom-label">${lang() === 'nl' ? 'Gerecht van de maand' : 'Dish of the month'}</span><strong>${esc(d.name)}</strong>
        ${dishOfMonth.note ? `<span class="dom-note">${esc(dishOfMonth.note)}</span>` : ''}</span></a>`; })()}
    ${groups().map(([title, list, key]) => `<details class="menu-group" data-group="${esc(key)}" ${selecting || openGroups.has(key) || window.__MENU_OPEN_ALL ? 'open' : ''}>
      <summary class="mg-sum"><span class="mg-title">${esc(title)}</span>
        <span class="mg-thumbs" aria-hidden="true">${list.filter((m) => m.photo_url).slice(0, 4).map((m) => `<img src="${esc(m.photo_url)}" alt="" loading="lazy">`).join('')}</span>
        <span class="mg-count">${list.length}</span>
        ${selecting ? `<button type="button" class="link-btn small" data-pickall="${esc(list.map((m) => m.id).join(','))}">${list.every((m) => picked.has(m.id)) ? L({ en: 'none', nl: 'geen' }) : L({ en: 'all', nl: 'alles' })}</button>` : ''}
        <span class="sop-chev" aria-hidden="true">&#9656;</span></summary>
      <div class="menu-grid ${selecting ? 'selecting' : ''}">${list.map(card).join('')}</div></details>`).join('')}`;
  const add = $('#add'); if (add) add.onclick = () => openEditor(null);
  const so = $('#sel-on'); if (so) so.onclick = () => { selecting = true; picked = new Set(); draw(); };
  const sf = $('#sel-off'); if (sf) sf.onclick = () => { selecting = false; picked = new Set(); draw(); };
  if (selecting) {
    $$('details[data-dish] > summary').forEach((sm) => (sm.onclick = (e) => { e.preventDefault(); const id = sm.parentElement.dataset.dish; if (picked.has(id)) picked.delete(id); else picked.add(id); draw(); }));
    $$('[data-pickall]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const ids = b.dataset.pickall.split(','); const all = ids.every((i) => picked.has(i)); ids.forEach((i) => (all ? picked.delete(i) : picked.add(i))); draw(); }));
    const go = $('#sel-go'); if (go) go.onclick = async () => {
      const n = picked.size;
      if (!(await confirmDialog(L({ en: `Take ${n} dish(es) off the menu? They leave the Menu page and the menu cards, and stay in the dish database. Put them back from there at any time.`, nl: `${n} gerecht(en) van de kaart halen? Ze verdwijnen van de Menu-pagina en de menukaarten en blijven in de gerechtendatabase. Vandaar zet je ze altijd terug.` }), L({ en: 'Take off', nl: 'Van de kaart' }), false))) return;
      try { check(await sb.from('menu_items').update({ active: false }).in('id', [...picked])); toast(L({ en: `${n} off the menu`, nl: `${n} van de kaart` })); renderMenu(); } catch (err) { toastError(err); }
    };
  }
  const pm = $('#pdf-manage'); if (pm) pm.onclick = managePdfs;
  // Edit sits in the folded header: it must not fold or unfold the dish
  $$('[data-edit]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openEditor(items.find((m) => m.id === b.dataset.edit)); }));
  $$('details[data-dish]').forEach((d) => d.addEventListener('toggle', () => { if (d.open) openIds.add(d.dataset.dish); else openIds.delete(d.dataset.dish); rememberOpen(); }));
  const dc = $('[data-dom]'); if (dc) dc.onclick = (e) => { e.preventDefault(); const d = $(`details[data-dish="${dc.dataset.dom}"]`); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
  $$('details.menu-group').forEach((g) => g.addEventListener('toggle', () => { if (g.open) openGroups.add(g.dataset.group); else openGroups.delete(g.dataset.group); }));
  // Unfold all: every heading and every dish; tap again to fold everything back into the overview
  const ex = $('#dish-expand'); if (ex) ex.onclick = () => { const all = [...$$('details.menu-group'), ...$$('details[data-dish]')]; const open = all.some((d) => !d.open); all.forEach((d) => { d.open = open; }); ex.textContent = t(open ? 'sops_collapse_all' : 'sops_expand_all'); };
}

// Headings follow the menu cards: Bakery (with the sweet things), Lunch, Borrel, Dinner, Drinks. Categories we do not know
// keep their own name and come after; the order inside a heading is the one set under Settings.
const HEADS = [
  ['bakery', { nl: 'Bakkerij', en: 'Bakery' }, /bakker|bakery|brood|bread|gebak|pastr|ontbijt|breakfast|zoet|sweet|dessert|taart|cake/i],
  ['lunch', { nl: 'Lunch', en: 'Lunch' }, /lunch/i],
  ['borrel', { nl: 'Borrel', en: 'Borrel' }, /borrel|bites|snack/i],
  ['dinner', { nl: 'Diner', en: 'Dinner' }, /diner|dinner/i],
  ['drinks', { nl: 'Dranken', en: 'Drinks' }, /koffie|coffee|thee|tea|fris|sap|juice|wijn|wine|bier|beer|drank|drink|beverage/i],
];
const headOf = (m) => {
  const c = String(m.category || '');
  const hit = HEADS.find(([, , re]) => re.test(c));
  if (hit) return hit[0];
  if ((m.group_type || 'food') === 'beverage') return 'drinks';
  return c ? `cat:${c}` : 'lunch';
};
function groups() {
  const out = new Map(HEADS.map(([k, l]) => [k, [lang() === 'nl' ? l.nl : l.en, []]]));
  for (const m of items) {
    const k = headOf(m);
    if (!out.has(k)) out.set(k, [k.slice(4), []]);
    out.get(k)[1].push(m);
  }
  return [...out.entries()].map(([k, [title, list]]) => [title, list, k]).filter(([, list]) => list.length);
}

// Each dish is folded by default: only its name (and Edit for managers). Click to see photo, video, price,
// description and allergens. What you unfolded is remembered in this browser.
const OPEN = 'wintertuinMenuOpen';
let openIds = new Set(); // every visit starts folded
const rememberOpen = () => { try { localStorage.removeItem(OPEN); } catch { /* private mode */ } };
function card(m) {
  const al = (m.allergens || []).length;
  const sub = [m.category, m.price != null && m.price !== '' ? fmt.money(m.price) : ''].filter(Boolean).map(esc).join(' <span aria-hidden="true">/</span> ');
  return `<details class="card menu-card ${selecting && picked.has(m.id) ? 'picked' : ''}" data-dish="${m.id}" ${!selecting && openIds.has(m.id) ? 'open' : ''}>${selecting ? `<span class="pick-box" aria-hidden="true">${picked.has(m.id) ? '<i class="ic ic-check"></i>' : ''}</span>` : ''}
    <summary class="dish-sum">
      ${m.photo_url ? `<img class="dish-photo" src="${esc(m.photo_url)}" alt="" loading="lazy">` : '<span class="dish-photo none" aria-hidden="true"></span>'}
      <span class="dish-meta"><h3>${esc(m.name)}</h3>${sub ? `<span class="dish-sub">${sub}</span>` : ''}
        <span class="dish-al ${al ? '' : 'unset'}">${al ? t(al === 1 ? 'allergen_count_one' : 'allergen_count', { n: al }) : t('allergens_none_set')}</span></span>
      <span class="dish-side"><span class="sop-chev" aria-hidden="true">&#9656;</span>
      ${isManager() ? `<button type="button" class="dish-pencil" data-edit="${m.id}" aria-label="${esc(`${t('edit')}: ${m.name}`)}" title="${t('edit')}"><i class="ic ic-pencil" aria-hidden="true"></i></button>` : ''}</span></summary>
    ${m.photo_url ? `<img class="dish-big" src="${esc(m.photo_url)}" alt="${esc(m.name)}" loading="lazy">` : ''}
    ${embedUrl(m.video_url) ? `<iframe src="${esc(embedUrl(m.video_url))}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="${esc(m.name)}"></iframe>` : ''}
    <div class="body">
      ${m.description ? `<p class="desc">${esc(m.description)}</p>` : ''}
      ${al ? `<div class="allergen-chips">${m.allergens.map((a) => `<span class="tag allergen">${esc(t('al_' + a))}</span>`).join('')}</div>`
        : `<div class="tiny muted">${t('allergens_none_set')}</div>`}
    </div></details>`;
}

// Menu PDFs: several named menus as buttons. Names and order live in the menu_pdfs table, files in storage.
const bucket = () => sb.storage.from(PHOTO_BUCKET);
const fileName = (label) => `Wintertuin-${String(label).trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'menu'}.pdf`;
async function loadPdfs() {
  try {
    const { data, error } = await sb.from('menu_pdfs').select('*').order('sort_order').order('created_at');
    if (error) throw error;
    pdfs = (data || []).map((x) => {
      // a path starting with 'site:' is a file shipped with the app (the demo menu); everything else is in storage
      if (isSite(x.path)) { const u = new URL(x.path.slice(5), location.href).href; return { ...x, view: u, download: u, sameSite: true }; }
      const v = Date.parse(x.updated_at || '') || 0; // new address after each replacement, so nobody sees an old copy
      return { ...x, view: `${bucket().getPublicUrl(x.path).data.publicUrl}?v=${v}`, download: bucket().getPublicUrl(x.path, { download: fileName(x.label) }).data.publicUrl };
    });
  } catch { pdfs = []; } // the menu page still works without them
}
const isSite = (path) => String(path || '').startsWith('site:');
const isPdf = (f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
async function putPdf(path, file) {
  const { error } = await bucket().upload(path, file, { upsert: true, contentType: 'application/pdf', cacheControl: '60' });
  if (error) throw error;
}
function managePdfs() {
  const row = (x, i) => `<div class="pdf-row" data-id="${x.id}">
      <input name="label" value="${esc(x.label)}" maxlength="60" aria-label="${t('menu_pdf_name')}">
      <span class="pdf-acts">
        <button type="button" class="btn-sm" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('move_up')}">&#9650;</button>
        <button type="button" class="btn-sm" data-move="1" ${i === pdfs.length - 1 ? 'disabled' : ''} aria-label="${t('move_down')}">&#9660;</button>
        <label class="btn btn-sm" title="${t('menu_pdf_replace')}">&#8679; ${t('menu_pdf_replace_short')}<input type="file" accept="application/pdf" data-replace hidden></label>
        <button type="button" class="btn-sm btn-ghost btn-danger" data-del aria-label="${t('delete')}">&#10005;</button></span></div>`;
  openModal(`<h2>${t('menu_pdfs_manage')}</h2>
    <p class="small muted" style="margin-top:-6px">${t('menu_pdfs_hint')}</p>
    ${pdfs.length ? `<div class="pdf-list">${pdfs.map(row).join('')}</div>` : `<div class="note">${t('menu_pdfs_none')}</div>`}
    <h3 style="margin:16px 0 6px">${t('menu_pdf_add')}</h3>
    <form id="pdf-add" class="pdf-row">
      <input name="label" maxlength="60" required placeholder="${esc(t('menu_pdf_name_ph'))}" value="${pdfs.length ? '' : esc(t('menu_pdf_default'))}" aria-label="${t('menu_pdf_name')}">
      <span class="pdf-acts"><input type="file" name="file" accept="application/pdf" required aria-label="PDF"><button class="btn-primary btn-sm" type="submit">${t('add')}</button></span>
    </form>
    <div class="modal-actions"><button type="button" data-close>${t('close')}</button></div>`, (card, close) => {
    const again = async (msg) => { if (msg) toast(msg); await loadPdfs(); close(); draw(); managePdfs(); };
    card.querySelectorAll('.pdf-row[data-id]').forEach((r) => {
      const x = pdfs.find((p) => p.id === r.dataset.id);
      const inp = r.querySelector('[name=label]');
      inp.onchange = async () => {
        const v = inp.value.trim(); if (!v) { inp.value = x.label; return; }
        try { check(await sb.from('menu_pdfs').update({ label: v }).eq('id', x.id)); await again(t('saved')); } catch (e) { toastError(e); }
      };
      r.querySelectorAll('[data-move]').forEach((b) => (b.onclick = async () => {
        const i = pdfs.indexOf(x); const j = i + Number(b.dataset.move); if (!pdfs[j]) return;
        const order = pdfs.map((p) => p.id); [order[i], order[j]] = [order[j], order[i]];
        try { await Promise.all(order.map((id, k) => sb.from('menu_pdfs').update({ sort_order: (k + 1) * 10 }).eq('id', id).then(check))); await again(); } catch (e) { toastError(e); }
      }));
      r.querySelector('[data-replace]').onchange = async (e) => {
        const f = e.target.files[0]; if (!isPdf(f)) { toastError(new Error(t('menu_pdf_only'))); return; }
        try { const path = isSite(x.path) ? `${PDF_DIR}/${crypto.randomUUID()}.pdf` : x.path; await putPdf(path, f); check(await sb.from('menu_pdfs').update({ path, updated_at: new Date().toISOString() }).eq('id', x.id)); await again(t('menu_pdf_saved')); } catch (err) { toastError(err); }
      };
      r.querySelector('[data-del]').onclick = async () => {
        close();
        if (!(await confirmDialog(t('menu_pdf_confirm_delete', { n: x.label }), t('delete')))) { managePdfs(); return; }
        try { check(await sb.from('menu_pdfs').delete().eq('id', x.id)); if (!isSite(x.path)) await bucket().remove([x.path]); toast(t('deleted')); await loadPdfs(); draw(); managePdfs(); } catch (err) { toastError(err); }
      };
    });
    card.querySelector('#pdf-add').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target.file.files[0]; const label = e.target.label.value.trim();
      if (!label) return; if (!isPdf(f)) { toastError(new Error(t('menu_pdf_only'))); return; }
      const path = `${PDF_DIR}/${crypto.randomUUID()}.pdf`;
      try {
        await putPdf(path, f);
        const next = (pdfs.reduce((m, p) => Math.max(m, p.sort_order || 0), 0)) + 10;
        check(await sb.from('menu_pdfs').insert({ label, path, sort_order: next }));
        await again(t('menu_pdf_saved'));
      } catch (err) { toastError(err); }
    };
  });
}

async function uploadPhoto(file) {
  const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file);
  if (error) throw new Error(`${t('photo_failed')}: ${error.message}`);
  return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function openEditor(m, onDone = renderMenu) {
  const fields = [
    { name: 'group_type', label: t('menu_group'), type: 'select', options: [{ value: 'food', label: t('group_food') }, { value: 'beverage', label: t('group_beverage') }] },
    { name: 'name', label: t('name'), required: true },
    { name: 'category', label: t('menu_category'), placeholder: t('menu_category_ph') },
    { name: 'description', label: t('description'), type: 'textarea' },
    { name: 'video_url', label: t('menu_video'), placeholder: 'https://www.youtube.com/watch?v=...', hint: t('menu_video_hint') },
    { name: 'price', label: t('price'), type: 'number' },
    { name: 'dish_date', label: L({ en: 'Date', nl: 'Datum' }), type: 'date', hint: L({ en: 'When the dish was made or first on the menu.', nl: 'Wanneer het gerecht is bedacht of voor het eerst op de kaart stond.' }) },
  ];
  const ss = new Set((m && m.seasons) || []);
  const seasonBox = `<fieldset class="season-box"><legend>${L({ en: 'Season', nl: 'Seizoen' })}</legend>
    <div class="season-checks">${SEASONS.map(([k]) => `<label class="season-check s-${k}"><input type="checkbox" name="season" value="${k}" ${ss.has(k) ? 'checked' : ''}><span>${seasonName(k)}</span></label>`).join('')}</div>
    <div class="tiny muted" style="margin-top:6px">${L({ en: 'Nothing ticked means: all year.', nl: 'Niets aangevinkt betekent: het hele jaar.' })}</div></fieldset>`;
  const has = new Set((m && m.allergens) || []);
  const allergenBox = `<fieldset class="allergen-box"><legend>${t('allergens')}</legend>
    <div class="allergen-grid">${ALLERGENS.map((a) => `<label class="check"><input type="checkbox" name="al" value="${a}" ${has.has(a) ? 'checked' : ''}> ${esc(t('al_' + a))}</label>`).join('')}</div>
    <div class="tiny muted" style="margin-top:6px">${t('allergens_hint')}</div></fieldset>`;
  // Photo: see the current one, pick one from the phone, or take one straight away
  const photoBox = `<div class="field dish-photo-field"><label>${t('menu_photo')}</label>
    <div class="dp-row"><div class="dp-prev" id="dp-prev">${m && m.photo_url ? `<img src="${esc(m.photo_url)}" alt="">` : '<i class="ic ic-image" aria-hidden="true"></i>'}</div>
      <div class="dp-btns"><label class="btn btn-sm" for="dp-pick"><i class="ic ic-upload" aria-hidden="true"></i> ${L({ en: 'Choose a photo', nl: 'Foto kiezen' })}</label>
        <label class="btn btn-sm dp-cam" for="dp-cam"><i class="ic ic-camera" aria-hidden="true"></i> ${L({ en: 'Take a photo', nl: 'Foto maken' })}</label>
        ${m && m.photo_url ? `<button type="button" class="link-btn small" id="dp-rm">${L({ en: 'Remove photo', nl: 'Foto weghalen' })}</button>` : ''}</div></div>
    <input type="file" id="dp-pick" accept="image/*" hidden><input type="file" id="dp-cam" accept="image/*" capture="environment" hidden></div>`;
  const before = fields.filter((f) => ['group_type', 'name', 'category', 'description'].includes(f.name));
  const after = fields.filter((f) => !before.includes(f));
  const vals = m ? { ...m, dish_date: m.dish_date || '' } : { group_type: 'food', dish_date: new Date().toISOString().slice(0, 10) };
  openModal(`<h2>${m ? t('menu_edit') : t('menu_add')}</h2><form id="f">${formHtml(before, vals)}${photoBox}${formHtml(after, vals)}${seasonBox}${allergenBox}
    <div class="modal-actions" style="justify-content:space-between">
      <div>${m && m.active !== false ? `<button type="button" class="btn-ghost" id="del">${L({ en: 'Take off the menu', nl: 'Van de kaart' })}</button>` : ''}</div>
      <div style="display:flex;gap:8px"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></div></form>`,
  (cardEl, close) => {
    let newPhoto = null; let dropPhoto = false;
    const showPhoto = (src) => { cardEl.querySelector('#dp-prev').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<i class="ic ic-image" aria-hidden="true"></i>'; };
    ['#dp-pick', '#dp-cam'].forEach((id) => { const inp = cardEl.querySelector(id); inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; newPhoto = f; dropPhoto = false; showPhoto(URL.createObjectURL(f)); }; });
    const rm = cardEl.querySelector('#dp-rm'); if (rm) rm.onclick = () => { newPhoto = null; dropPhoto = true; showPhoto(null); rm.remove(); };
    cardEl.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const v = readForm(cardEl, fields);
      const btn = cardEl.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const allergens = $$('input[name=al]:checked', cardEl).map((x) => x.value);
        const seasons = $$('input[name=season]:checked', cardEl).map((x) => x.value);
        const row = { name: v.name, group_type: v.group_type, category: v.category, description: v.description, video_url: embedUrl(v.video_url) || null, price: v.price, allergens, seasons, dish_date: v.dish_date || null };
        if (newPhoto) row.photo_url = await uploadPhoto(newPhoto);
        else if (dropPhoto) row.photo_url = null;
        if (m) check(await sb.from('menu_items').update(row).eq('id', m.id));
        else check(await sb.from('menu_items').insert({ ...row, sort_order: items.reduce((mx, x) => Math.max(mx, x.sort_order || 0), 0) + 10 })); // new dishes go last
        close(); toast(t('saved')); onDone();
      } catch (err) { toastError(err); btn.disabled = false; }
    };
    const del = cardEl.querySelector('#del');
    if (del) del.onclick = async () => {
      close();
      if (!(await confirmDialog(L({ en: 'Take this dish off the menu? It leaves the Menu page and the menu cards and stays in the dish database.', nl: 'Dit gerecht van de kaart halen? Het verdwijnt van de Menu-pagina en de menukaarten en blijft in de gerechtendatabase.' }), L({ en: 'Take off', nl: 'Van de kaart' }), false))) return;
      try { check(await sb.from('menu_items').update({ active: false }).eq('id', m.id)); toast(L({ en: 'Off the menu', nl: 'Van de kaart' })); onDone(); } catch (err) { toastError(err); }
    };
  });
}


// ------------------------------------------------------------------ dish database
// Every dish we have, on the menu now or not. Filter by season, category and status; put dishes on or off the menu,
// edit them with the pencil, delete for good. The menu cards pick their dishes from here too.
const DB = { q: '', season: '', status: 'all', cat: '', sel: new Set() };
async function renderDishDb() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  await addExampleDishesOnce();
  let all = check(await sb.from('menu_items').select('*').order('name')) || [];
  const cats = () => [...new Set(all.map((m) => m.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filtered = () => all.filter((m) => fitsSeason(m, DB.season)
    && (DB.status === 'all' || (DB.status === 'on') === (m.active !== false))
    && (!DB.cat || m.category === DB.cat)
    && (!DB.q || [m.name, m.category, m.description].some((v) => String(v || '').toLowerCase().includes(DB.q))));
  const dateStr = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(lang() === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const draw2 = () => {
    const list = filtered();
    const onN = all.filter((m) => m.active !== false).length;
    const seasonCount = (k) => all.filter((m) => (DB.status === 'all' || (DB.status === 'on') === (m.active !== false)) && fitsSeason(m, k)).length;
    DB.sel.forEach((id) => { if (!all.some((m) => m.id === id)) DB.sel.delete(id); });
    const n = DB.sel.size;
    app().innerHTML = `
      <div class="page-head"><div><a class="small" href="#/menu"><i class="ic ic-prev" aria-hidden="true"></i> ${t('menu_title')}</a><h1>${L({ en: 'Dish database', nl: 'Gerechtendatabase' })}</h1>
        <div class="muted small">${L({ en: 'Every dish we have, on the menu or not. Pick a season to see what fits, and put dishes on or off the menu.', nl: 'Al onze gerechten, op de kaart of niet. Kies een seizoen om te zien wat past, en zet gerechten op of van de kaart.' })}</div></div>
        <div class="page-actions"><button type="button" class="btn-primary btn-sm" id="db-add">+ ${L({ en: 'New dish', nl: 'Nieuw gerecht' })}</button></div></div>
      <div class="card db-filters">
        <input type="search" id="db-q" value="${esc(DB.q)}" placeholder="${L({ en: 'Search name, category or ingredient', nl: 'Zoek op naam, categorie of ingrediënt' })}">
        <div class="db-row"><span class="db-lbl">${L({ en: 'Season', nl: 'Seizoen' })}</span><div class="chips" role="group">
          <button type="button" class="chip ${!DB.season ? 'on' : ''}" data-dbseason="">${L({ en: 'All', nl: 'Alle' })}</button>
          ${SEASONS.map(([k]) => `<button type="button" class="chip s-${k} ${DB.season === k ? 'on' : ''}" data-dbseason="${k}">${seasonName(k)} <span class="cnt">${seasonCount(k)}</span></button>`).join('')}</div></div>
        <div class="db-row"><span class="db-lbl">${L({ en: 'Show', nl: 'Toon' })}</span><div class="ro-views db-status">
          ${[['all', L({ en: 'All', nl: 'Alles' }), all.length], ['on', L({ en: 'On the menu', nl: 'Op de kaart' }), onN], ['off', L({ en: 'Not on the menu', nl: 'Niet op de kaart' }), all.length - onN]]
            .map(([k, lab, c]) => `<button type="button" class="${DB.status === k ? 'on' : ''}" data-status="${k}">${lab} <span class="cnt">${c}</span></button>`).join('')}</div>
          <select id="db-cat" aria-label="${L({ en: 'Category', nl: 'Categorie' })}"><option value="">${L({ en: 'All categories', nl: 'Alle categorieën' })}</option>${cats().map((c) => `<option ${DB.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      </div>
      <div class="db-count small muted">${L({ en: `${list.length} dishes`, nl: `${list.length} gerechten` })}${list.length ? ` <button type="button" class="link-btn small" id="db-all">${list.every((m) => DB.sel.has(m.id)) ? L({ en: 'Select none', nl: 'Niets kiezen' }) : L({ en: 'Select all', nl: 'Alles kiezen' })}</button>` : ''}</div>
      <div class="card db-card">${list.length ? `<div class="db-list" role="list">
        <div class="db-th" aria-hidden="true"><span></span><span>${L({ en: 'Dish', nl: 'Gerecht' })}</span><span>${L({ en: 'Category', nl: 'Categorie' })}</span><span>${L({ en: 'Season', nl: 'Seizoen' })}</span><span>${L({ en: 'Date', nl: 'Datum' })}</span><span>${t('price')}</span><span></span></div>
        ${list.map((m) => { const on = m.active !== false; const al = (m.allergens || []).length;
          return `<div class="db-item ${on ? 'is-on' : ''} ${DB.sel.has(m.id) ? 'picked' : ''}" role="listitem">
          <label class="db-pick"><input type="checkbox" data-sel="${m.id}" ${DB.sel.has(m.id) ? 'checked' : ''} aria-label="${esc(m.name)}"></label>
          <span class="db-main">${m.photo_url ? `<img src="${esc(m.photo_url)}" alt="" loading="lazy">` : '<span class="db-ph" aria-hidden="true"><i class="ic ic-image"></i></span>'}
            <span class="db-txt"><strong>${esc(m.name)}</strong><span class="db-desc">${esc(String(m.description || '').split('\nEN:')[0])}</span>
              <span class="db-flags"><span class="db-status-pill ${on ? 'on' : ''}">${on ? L({ en: 'On the menu', nl: 'Op de kaart' }) : L({ en: 'Not on the menu', nl: 'Niet op de kaart' })}</span>${al ? '' : `<span class="db-warn">${L({ en: 'allergens?', nl: 'allergenen?' })}</span>`}</span></span></span>
          <span class="db-cat">${esc(m.category || '')}</span>
          <span class="db-seasons">${seasonPills(m)}</span>
          <span class="db-date">${esc(dateStr(m.dish_date))}</span>
          <span class="db-price">${m.price != null && m.price !== '' ? fmt.money(m.price) : ''}</span>
          <span class="db-act"><button type="button" class="btn-sm db-toggle" data-toggle="${m.id}">${on ? L({ en: 'Take off', nl: 'Van de kaart' }) : L({ en: 'Put on', nl: 'Op de kaart' })}</button>
            <button type="button" class="dish-pencil" data-dbedit="${m.id}" aria-label="${esc(`${t('edit')}: ${m.name}`)}" title="${t('edit')}"><i class="ic ic-pencil" aria-hidden="true"></i></button></span></div>`; }).join('')}
        </div>` : `<div class="empty">${all.length ? L({ en: 'No dishes match these filters.', nl: 'Geen gerechten bij deze filters.' }) : L({ en: 'No dishes yet. Add one with New dish.', nl: 'Nog geen gerechten. Voeg er een toe met Nieuw gerecht.' })}</div>`}</div>
      ${n ? `<div class="db-bar"><span>${L({ en: `${n} selected`, nl: `${n} gekozen` })}</span><span class="db-bar-tools">
        <button type="button" class="btn-sm" id="db-on">${L({ en: 'Put on the menu', nl: 'Op de kaart' })}</button>
        <button type="button" class="btn-sm" id="db-off">${L({ en: 'Take off the menu', nl: 'Van de kaart' })}</button>
        <button type="button" class="btn-sm btn-danger" id="db-del"><i class="ic ic-trash" aria-hidden="true"></i> ${L({ en: 'Delete', nl: 'Verwijderen' })}</button>
        <button type="button" class="btn-sm db-x" id="db-none" aria-label="${L({ en: 'Clear selection', nl: 'Keuze wissen' })}"><i class="ic ic-x" aria-hidden="true"></i></button></span></div>` : ''}`;
    const qi = $('#db-q'); qi.oninput = () => { DB.q = qi.value.toLowerCase(); const pos = qi.selectionStart; draw2(); const nq = $('#db-q'); nq.focus(); nq.setSelectionRange(pos, pos); };
    $$('[data-dbseason]').forEach((b) => (b.onclick = () => { DB.season = b.dataset.dbseason; draw2(); }));
    $$('[data-status]').forEach((b) => (b.onclick = () => { DB.status = b.dataset.status; draw2(); }));
    $('#db-cat').onchange = (e) => { DB.cat = e.target.value; draw2(); };
    $$('[data-sel]').forEach((c) => (c.onchange = () => { if (c.checked) DB.sel.add(c.dataset.sel); else DB.sel.delete(c.dataset.sel); draw2(); }));
    const ab = $('#db-all'); if (ab) ab.onclick = () => { const every = list.every((m) => DB.sel.has(m.id)); list.forEach((m) => (every ? DB.sel.delete(m.id) : DB.sel.add(m.id))); draw2(); };
    $('#db-add').onclick = () => openEditor(null, renderDishDb);
    $$('[data-dbedit]').forEach((b) => (b.onclick = () => openEditor(all.find((m) => m.id === b.dataset.dbedit), renderDishDb)));
    $$('[data-toggle]').forEach((b) => (b.onclick = () => { const m = all.find((x) => x.id === b.dataset.toggle); setOnMenu([m.id], m.active === false); }));
    const bOn = $('#db-on'); if (bOn) bOn.onclick = () => setOnMenu([...DB.sel], true);
    const bOff = $('#db-off'); if (bOff) bOff.onclick = () => setOnMenu([...DB.sel], false);
    const bDel = $('#db-del'); if (bDel) bDel.onclick = () => remove([...DB.sel]);
    const bX = $('#db-none'); if (bX) bX.onclick = () => { DB.sel.clear(); draw2(); };
  };
  // on or off the menu: dishes that come on go last on the Menu page
  const setOnMenu = async (ids, on) => {
    try {
      if (on) {
        const max = all.filter((m) => m.active !== false).reduce((a, r) => Math.max(a, r.sort_order || 0), 0);
        const off = ids.filter((id) => (all.find((m) => m.id === id) || {}).active === false);
        await Promise.all(off.map((id, i) => sb.from('menu_items').update({ active: true, sort_order: max + (i + 1) * 10 }).eq('id', id).then(check)));
        off.forEach((id, i) => Object.assign(all.find((m) => m.id === id), { active: true, sort_order: max + (i + 1) * 10 }));
        toast(L({ en: `${off.length} on the menu`, nl: `${off.length} op de kaart` }));
      } else {
        check(await sb.from('menu_items').update({ active: false }).in('id', ids));
        ids.forEach((id) => { const m = all.find((x) => x.id === id); if (m) m.active = false; });
        toast(L({ en: `${ids.length} off the menu`, nl: `${ids.length} van de kaart` }));
      }
      DB.sel.clear(); draw2();
    } catch (e) { toastError(e); }
  };
  // Delete for good: the dish, and its photo when no other dish uses it. Cannot be undone.
  const remove = async (ids) => {
    const names = ids.map((id) => (all.find((m) => m.id === id) || {}).name).filter(Boolean);
    const msg = ids.length === 1
      ? L({ en: `Delete "${names[0]}" for good? Its photo, text and allergens are gone too. This cannot be undone.`, nl: `"${names[0]}" definitief verwijderen? De foto, tekst en allergenen zijn dan ook weg. Dit kun je niet terugdraaien.` })
      : L({ en: `Delete ${ids.length} dishes for good? Their photos, texts and allergens are gone too. This cannot be undone.`, nl: `${ids.length} gerechten definitief verwijderen? De foto's, teksten en allergenen zijn dan ook weg. Dit kun je niet terugdraaien.` });
    if (!(await confirmDialog(msg, L({ en: 'Delete', nl: 'Verwijderen' })))) return;
    try {
      const gone = check(await sb.from('menu_items').delete().in('id', ids).select('id, photo_url')) || [];
      if (gone.length < ids.length) throw new Error(L({ en: 'The database does not allow deleting dishes yet. Run the database update 012_menu_delete.sql once (GitHub > Actions > Database update).', nl: 'De database staat verwijderen van gerechten nog niet toe. Draai één keer de database-update 012_menu_delete.sql (GitHub > Actions > Database update).' }));
      const ours = `/object/public/${PHOTO_BUCKET}/`;
      const urls = [...new Set(gone.map((m) => m.photo_url).filter((u) => u && u.includes(ours)))];
      if (urls.length) {
        const still = new Set((check(await sb.from('menu_items').select('photo_url').in('photo_url', urls)) || []).map((r) => r.photo_url));
        const paths = urls.filter((u) => !still.has(u)).map((u) => decodeURIComponent(u.split(ours)[1].split('?')[0]));
        if (paths.length) { try { await sb.storage.from(PHOTO_BUCKET).remove(paths); } catch { /* the dish is gone; a stray photo does no harm */ } }
      }
      toast(L({ en: `${gone.length} deleted`, nl: `${gone.length} verwijderd` }));
      all = all.filter((m) => !ids.includes(m.id)); DB.sel.clear();
      draw2();
    } catch (e) { toastError(e); }
  };
  draw2();
}
