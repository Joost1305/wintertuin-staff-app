// Menu: dishes and drinks with description, photo, instruction video, price and the 14 EU allergens,
// split into Food and Beverage. Prints an allergen card for front of house.
import { isManager, app, esc, fmt, toast, toastError, $, $$, openModal, confirmDialog, formHtml, readForm, printHtml } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';
import { PHOTO_BUCKET } from '../config.js';

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

export async function renderMenu() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [rows] = await Promise.all([
    sb.from('menu_items').select('*').eq('active', true).order('group_type').order('sort_order').order('name'), // order set under Settings > Menu order
    loadPdfs(),
  ]);
  items = check(rows) || [];
  draw();
}

function draw() {
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('menu_title')}</h1><div class="muted small">${t('menu_sub')}</div></div>
      <div class="page-actions">
      ${pdfs.map((x) => `<span class="btn-pair"><a class="btn btn-sm" href="${esc(x.view)}" target="_blank" rel="noopener" data-pdf-view="${x.id}">&#128196; ${esc(x.label)}</a> <a class="btn btn-sm" href="${esc(x.download)}" ${x.sameSite ? `download="${esc(fileName(x.label))}"` : ''} data-pdf-dl="${x.id}" title="${t('download')}" aria-label="${t('download')}: ${esc(x.label)}">&#11015;</a></span>`).join('')}
      ${isManager() ? `<button type="button" class="btn-sm" id="pdf-manage">&#9998; ${t('menu_pdfs_manage')}</button>` : ''}
      ${items.length ? `<button type="button" class="btn-sm" id="dish-expand">${t('sops_expand_all')}</button>` : ''}
      <button type="button" class="btn-sm" id="allergen-card">&#128424; ${t('allergen_card')}</button>
      ${isManager() ? `<button type="button" class="btn-primary btn-sm" id="add">+ ${t('menu_add')}</button>` : ''}</div></div>
    ${!items.length ? `<div class="card empty">${t('menu_none')}</div>` : ''}
    ${['food', 'beverage'].map((g) => {
      const list = items.filter((m) => (m.group_type || 'food') === g);
      if (!list.length) return '';
      return `<div class="sop-cat">${t('group_' + g)}</div><div class="menu-grid">${list.map(card).join('')}</div>`;
    }).join('')}`;
  const add = $('#add'); if (add) add.onclick = () => openEditor(null);
  $('#allergen-card').onclick = printAllergenCard;
  const pm = $('#pdf-manage'); if (pm) pm.onclick = managePdfs;
  // Edit sits in the folded header: it must not fold or unfold the dish
  $$('[data-edit]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openEditor(items.find((m) => m.id === b.dataset.edit)); }));
  $$('details[data-dish]').forEach((d) => d.addEventListener('toggle', () => { if (d.open) openIds.add(d.dataset.dish); else openIds.delete(d.dataset.dish); rememberOpen(); }));
  const ex = $('#dish-expand'); if (ex) ex.onclick = () => { const all = $$('details[data-dish]'); const open = all.some((d) => !d.open); all.forEach((d) => { d.open = open; }); ex.textContent = t(open ? 'sops_collapse_all' : 'sops_expand_all'); };
}

// Each dish is folded by default: only its name (and Edit for managers). Click to see photo, video, price,
// description and allergens. What you unfolded is remembered in this browser.
const OPEN = 'wintertuinMenuOpen';
let openIds = new Set((() => { try { return JSON.parse(localStorage.getItem(OPEN) || '[]'); } catch { return []; } })());
const rememberOpen = () => { try { localStorage.setItem(OPEN, JSON.stringify([...openIds])); } catch { /* private mode */ } };
function card(m) {
  return `<details class="card menu-card" data-dish="${m.id}" ${openIds.has(m.id) ? 'open' : ''}>
    <summary class="dish-sum"><span class="sop-chev" aria-hidden="true">&#9656;</span><h3>${esc(m.name)}</h3>
      ${isManager() ? `<button type="button" class="btn-sm" data-edit="${m.id}">${t('edit')}</button>` : ''}</summary>
    ${m.photo_url ? `<img src="${esc(m.photo_url)}" alt="${esc(m.name)}" loading="lazy">` : ''}
    ${embedUrl(m.video_url) ? `<iframe src="${esc(embedUrl(m.video_url))}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="${esc(m.name)}"></iframe>` : ''}
    <div class="body">
      ${m.category ? `<span><span class="tag">${esc(m.category)}</span></span>` : ''}
      ${m.price != null && m.price !== '' ? `<div class="price">${fmt.money(m.price)}</div>` : ''}
      ${m.description ? `<p class="desc">${esc(m.description)}</p>` : ''}
      ${(m.allergens || []).length ? `<div class="allergen-chips">${m.allergens.map((a) => `<span class="tag allergen">${esc(t('al_' + a))}</span>`).join('')}</div>`
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
      <div>${m ? `<button type="button" class="btn-ghost btn-danger" id="del">${t('delete')}</button>` : ''}</div>
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
      if (!(await confirmDialog(t('menu_confirm_delete'), t('delete')))) return;
      try { check(await sb.from('menu_items').update({ active: false }).eq('id', m.id)); toast(t('deleted')); renderMenu(); } catch (err) { toastError(err); }
    };
  });
}

function printAllergenCard() {
  const list = items.slice().sort((a, b) => (a.group_type || '').localeCompare(b.group_type || '') || a.name.localeCompare(b.name));
  printHtml(`<h1>${t('allergen_card')}</h1><p>Wintertuin · ${esc(fmt.dateLong(new Date().toLocaleDateString('sv-SE')))}</p>
    <table style="font-size:9pt"><thead><tr><th>${t('name')}</th>${ALLERGENS.map((a) => `<th style="writing-mode:vertical-rl;transform:rotate(180deg);height:110px;text-align:left">${esc(t('al_' + a))}</th>`).join('')}</tr></thead>
    <tbody>${list.map((m) => `<tr><td><strong>${esc(m.name)}</strong></td>${ALLERGENS.map((a) => `<td style="text-align:center">${(m.allergens || []).includes(a) ? '&#9679;' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p style="font-size:9pt;margin-top:10px">${t('allergen_card_note')}</p>`);
}
