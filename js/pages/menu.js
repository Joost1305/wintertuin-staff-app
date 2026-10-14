// Menu: dishes and drinks with description, photo, instruction video, price and the 14 EU allergens,
// split into Food and Beverage. Prints an allergen card for front of house.
import { isManager, app, esc, fmt, toast, toastError, $, $$, openModal, confirmDialog, formHtml, readForm, printHtml } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';
import { PHOTO_BUCKET } from '../config.js';

let items = [];
// The 14 allergens that EU law (Regulation 1169/2011) requires you to inform guests about
export const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'];

export async function renderMenu() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  items = check(await sb.from('menu_items').select('*').eq('active', true).order('group_type').order('category').order('sort_order')) || [];
  draw();
}

function draw() {
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('menu_title')}</h1><div class="muted small">${t('menu_sub')}</div></div>
      <div class="page-actions"><button type="button" class="btn-sm" id="allergen-card">&#128424; ${t('allergen_card')}</button>
      ${isManager() ? `<button type="button" class="btn-primary btn-sm" id="add">+ ${t('menu_add')}</button>` : ''}</div></div>
    ${!items.length ? `<div class="card empty">${t('menu_none')}</div>` : ''}
    ${['food', 'beverage'].map((g) => {
      const list = items.filter((m) => (m.group_type || 'food') === g);
      if (!list.length) return '';
      return `<div class="sop-cat">${t('group_' + g)}</div><div class="menu-grid">${list.map(card).join('')}</div>`;
    }).join('')}`;
  const add = $('#add'); if (add) add.onclick = () => openEditor(null);
  $('#allergen-card').onclick = printAllergenCard;
  $$('[data-edit]').forEach((b) => (b.onclick = () => openEditor(items.find((m) => m.id === b.dataset.edit))));
}

function card(m) {
  return `<div class="card menu-card">
    ${m.photo_url ? `<img src="${esc(m.photo_url)}" alt="${esc(m.name)}" loading="lazy">` : ''}
    ${m.video_url ? `<iframe src="${esc(m.video_url)}" allowfullscreen loading="lazy" title="${esc(m.name)}"></iframe>` : ''}
    <div class="body">
      ${m.category ? `<span><span class="tag">${esc(m.category)}</span></span>` : ''}
      <h3>${esc(m.name)}</h3>
      ${m.price != null && m.price !== '' ? `<div class="price">${fmt.money(m.price)}</div>` : ''}
      ${m.description ? `<p class="desc">${esc(m.description)}</p>` : ''}
      ${(m.allergens || []).length ? `<div class="allergen-chips">${m.allergens.map((a) => `<span class="tag allergen">${esc(t('al_' + a))}</span>`).join('')}</div>`
        : `<div class="tiny muted">${t('allergens_none_set')}</div>`}
      ${isManager() ? `<div style="margin-top:auto;padding-top:8px"><button type="button" class="btn-sm" data-edit="${m.id}">${t('edit')}</button></div>` : ''}
    </div></div>`;
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
    { name: 'video_url', label: t('menu_video'), placeholder: 'https://www.youtube.com/embed/...', hint: t('menu_video_hint') },
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
        const row = { name: v.name, group_type: v.group_type, category: v.category, description: v.description, video_url: v.video_url || null, price: v.price, allergens };
        if (v.photo) row.photo_url = await uploadPhoto(v.photo);
        if (m) check(await sb.from('menu_items').update(row).eq('id', m.id));
        else check(await sb.from('menu_items').insert(row));
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
