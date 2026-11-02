// Menu: dishes and drinks with description, photo, instruction video, price and the 14 EU allergens,
// split into Food and Beverage. Prints an allergen card for front of house.
import { state, isManager, app, esc, fmt, toast, toastError, $, $$, openModal, confirmDialog, formHtml, readForm, printHtml } from '../core.js';
import { t, lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { PHOTO_BUCKET } from '../config.js';
import { loadCards } from './menucard.js';
import { upgradeMenuOnce } from '../menu-upgrade.js';

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
  if (args[0] === 'archive' && isManager()) return renderArchive();
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  // first visit of a manager after the update: our own menu goes in, the demo dishes and demo lunch card out
  if (isManager()) { const up = await upgradeMenuOnce(); if (up && (up.added || up.removed)) toast(lang() === 'nl' ? `Menu bijgewerkt: ${up.added} gerechten erbij, ${up.removed} demo's weg` : `Menu updated: ${up.added} dishes added, ${up.removed} demo dishes removed`); }
  const [rows] = await Promise.all([
    sb.from('menu_items').select('*').eq('active', true).order('group_type').order('sort_order').order('name'), // order set under Settings > Menu order
    loadPdfs(),
    loadDishOfMonth().then((d) => { dishOfMonth = d; }),
    isManager() ? sb.from('menu_items').select('id', { count: 'exact', head: true }).eq('active', false).then((r) => { archivedCount = r.count || 0; }, () => {}) : null,
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
      ${isManager() && items.length ? `<button type="button" class="btn-sm" id="sel-on"><i class="ic ic-check" aria-hidden="true"></i> ${L({ en: 'Archive dishes', nl: 'Gerechten archiveren' })}</button>` : ''}
      ${isManager() ? `<a class="btn btn-sm" href="#/menu/archive">${L({ en: 'Archive', nl: 'Archief' })}${archivedCount ? ` (${archivedCount})` : ''}</a>` : ''}
      ${isManager() ? `<button type="button" class="btn-primary btn-sm" id="add">+ ${t('menu_add')}</button>` : ''}</div></div>
    ${selecting ? `<div class="sel-bar"><span>${L({ en: 'Tap the dishes that are off the menu, or a whole heading.', nl: 'Tik de gerechten aan die van de kaart gaan, of een hele kop.' })}</span>
      <span class="sel-tools"><button type="button" class="btn-sm" id="sel-off">${L({ en: 'Cancel', nl: 'Annuleren' })}</button>
      <button type="button" class="btn-primary btn-sm" id="sel-go" ${picked.size ? '' : 'disabled'}>${L({ en: `Archive ${picked.size || ''}`, nl: `${picked.size || ''} archiveren` })}</button></span></div>` : ''}
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
      if (!(await confirmDialog(L({ en: `Archive ${n} dish(es)? They leave the Menu page and the menu cards. You can bring them back from the Archive at any time.`, nl: `${n} gerecht(en) archiveren? Ze verdwijnen van de Menu-pagina en de menukaarten. Vanuit het Archief zet je ze altijd terug.` }), L({ en: 'Archive', nl: 'Archiveren' }), false))) return;
      try { check(await sb.from('menu_items').update({ active: false }).in('id', [...picked])); toast(L({ en: `${n} archived`, nl: `${n} gearchiveerd` })); renderMenu(); } catch (err) { toastError(err); }
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
      ${isManager() ? `<button type="button" class="btn-sm" data-edit="${m.id}">${t('edit')}</button>` : ''}</span></summary>
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

function openEditor(m) {
  const fields = [
    { name: 'group_type', label: t('menu_group'), type: 'select', options: [{ value: 'food', label: t('group_food') }, { value: 'beverage', label: t('group_beverage') }] },
    { name: 'name', label: t('name'), required: true },
    { name: 'category', label: t('menu_category'), placeholder: t('menu_category_ph') },
    { name: 'description', label: t('description'), type: 'textarea' },
    { name: 'photo', label: m && m.photo_url ? t('menu_photo_replace') : t('menu_photo'), type: 'file', accept: 'image/*' },
    { name: 'video_url', label: t('menu_video'), placeholder: 'https://www.youtube.com/watch?v=...', hint: t('menu_video_hint') },
    { name: 'price', label: t('price'), type: 'number' },
  ];
  const has = new Set((m && m.allergens) || []);
  const allergenBox = `<fieldset class="allergen-box"><legend>${t('allergens')}</legend>
    <div class="allergen-grid">${ALLERGENS.map((a) => `<label class="check"><input type="checkbox" name="al" value="${a}" ${has.has(a) ? 'checked' : ''}> ${esc(t('al_' + a))}</label>`).join('')}</div>
    <div class="tiny muted" style="margin-top:6px">${t('allergens_hint')}</div></fieldset>`;
  openModal(`<h2>${m ? t('menu_edit') : t('menu_add')}</h2><form id="f">${formHtml(fields, m || { group_type: 'food' })}${allergenBox}
    <div class="modal-actions" style="justify-content:space-between">
      <div>${m ? `<button type="button" class="btn-ghost" id="del">${L({ en: 'Archive', nl: 'Archiveren' })}</button>` : ''}</div>
      <div style="display:flex;gap:8px"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></div></form>`,
  (cardEl, close) => {
    cardEl.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const v = readForm(cardEl, fields);
      const btn = cardEl.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const allergens = $$('input[name=al]:checked', cardEl).map((x) => x.value);
        const row = { name: v.name, group_type: v.group_type, category: v.category, description: v.description, video_url: embedUrl(v.video_url) || null, price: v.price, allergens };
        if (v.photo) row.photo_url = await uploadPhoto(v.photo);
        if (m) check(await sb.from('menu_items').update(row).eq('id', m.id));
        else check(await sb.from('menu_items').insert({ ...row, sort_order: items.reduce((mx, x) => Math.max(mx, x.sort_order || 0), 0) + 10 })); // new dishes go last
        close(); toast(t('saved')); renderMenu();
      } catch (err) { toastError(err); btn.disabled = false; }
    };
    const del = cardEl.querySelector('#del');
    if (del) del.onclick = async () => {
      close();
      if (!(await confirmDialog(L({ en: 'Archive this dish? It leaves the Menu page and the menu cards; you can bring it back from the Archive.', nl: 'Dit gerecht archiveren? Het verdwijnt van de Menu-pagina en de menukaarten; vanuit het Archief zet je het terug.' }), L({ en: 'Archive', nl: 'Archiveren' }), false))) return;
      try { check(await sb.from('menu_items').update({ active: false }).eq('id', m.id)); toast(L({ en: 'Archived', nl: 'Gearchiveerd' })); renderMenu(); } catch (err) { toastError(err); }
    };
  });
}


// ------------------------------------------------------------------ archive: dishes that are off the menu, kept with everything they had
async function renderArchive() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const all = check(await sb.from('menu_items').select('*').eq('active', false).order('name')) || [];
  let q = ''; const sel = new Set();
  const draw2 = () => {
    const list = all.filter((m) => !q || [m.name, m.category].some((v) => String(v || '').toLowerCase().includes(q)));
    app().innerHTML = `
      <div class="page-head"><div><a class="small" href="#/menu"><i class="ic ic-prev" aria-hidden="true"></i> ${t('menu_title')}</a><h1>${L({ en: 'Archive', nl: 'Archief' })}</h1>
        <div class="muted small">${L({ en: 'Dishes that are off the menu, with their photo, text and allergens. Bring one back and it is on the Menu page again.', nl: 'Gerechten die van de kaart zijn, met foto, tekst en allergenen. Zet er een terug en hij staat weer op de Menu-pagina.' })}</div></div>
        <div class="page-actions"><button type="button" class="btn-primary btn-sm" id="ar-back" ${sel.size ? '' : 'disabled'}>${L({ en: `Bring back ${sel.size || ''}`, nl: `${sel.size || ''} terugzetten` })}</button></div></div>
      ${all.length ? `<div class="g-tools"><input type="search" id="ar-q" value="${esc(q)}" placeholder="${L({ en: 'Search a dish', nl: 'Zoek een gerecht' })}"></div>` : ''}
      <div class="card" style="padding:0">${list.length ? `<ul class="ar-list">${list.map((m) => `<li><label class="check"><input type="checkbox" data-ar="${m.id}" ${sel.has(m.id) ? 'checked' : ''}>
          ${m.photo_url ? `<img src="${esc(m.photo_url)}" alt="" loading="lazy">` : '<span class="dish-photo none" aria-hidden="true"></span>'}
          <span><strong>${esc(m.name)}</strong><span class="small muted">${esc([m.category, m.price != null && m.price !== '' ? fmt.money(m.price) : ''].filter(Boolean).join(' / '))}</span></span></label>
          <button type="button" class="btn-sm" data-one="${m.id}">${L({ en: 'Bring back', nl: 'Terugzetten' })}</button></li>`).join('')}</ul>`
        : `<div class="empty">${all.length ? L({ en: 'Nothing found.', nl: 'Niets gevonden.' }) : L({ en: 'The archive is empty. Archive a dish from its Edit window, or several at once with Archive dishes on the Menu page.', nl: 'Het archief is leeg. Archiveer een gerecht via Wijzig, of meerdere tegelijk met Gerechten archiveren op de Menu-pagina.' })}</div>`}</div>`;
    const qi = $('#ar-q'); if (qi) qi.oninput = () => { q = qi.value.toLowerCase(); const pos = qi.selectionStart; draw2(); const n = $('#ar-q'); n.focus(); n.setSelectionRange(pos, pos); };
    $$('[data-ar]').forEach((c) => (c.onchange = () => { if (c.checked) sel.add(c.dataset.ar); else sel.delete(c.dataset.ar); draw2(); }));
    const back = async (ids) => {
      try {
        const max = (check(await sb.from('menu_items').select('sort_order').eq('active', true)) || []).reduce((a, r) => Math.max(a, r.sort_order || 0), 0);
        await Promise.all(ids.map((id, i) => sb.from('menu_items').update({ active: true, sort_order: max + (i + 1) * 10 }).eq('id', id).then(check)));
        toast(L({ en: `${ids.length} back on the menu`, nl: `${ids.length} terug op de kaart` }));
        ids.forEach((id) => { sel.delete(id); const i = all.findIndex((m) => m.id === id); if (i >= 0) all.splice(i, 1); });
        draw2();
      } catch (e) { toastError(e); }
    };
    $$('[data-one]').forEach((b) => (b.onclick = () => back([b.dataset.one])));
    $('#ar-back').onclick = () => back([...sel]);
  };
  draw2();
}
