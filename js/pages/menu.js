// Menu: dishes and drinks with description, photo, instruction video and price, split into Food and Beverage.
import { isManager, app, esc, fmt, toast, toastError, $, $$, openModal, confirmDialog, formHtml, readForm } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';
import { PHOTO_BUCKET } from '../config.js';

let items = [];

export async function renderMenu() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  items = check(await sb.from('menu_items').select('*').eq('active', true).order('group_type').order('category').order('sort_order')) || [];
  draw();
}

function draw() {
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('menu_title')}</h1><div class="muted small">${t('menu_sub')}</div></div>
      ${isManager() ? `<div class="page-actions"><button type="button" class="btn-primary btn-sm" id="add">+ ${t('menu_add')}</button></div>` : ''}</div>
    ${!items.length ? `<div class="card empty">${t('menu_none')}</div>` : ''}
    ${['food', 'beverage'].map((g) => {
      const list = items.filter((m) => (m.group_type || 'food') === g);
      if (!list.length) return '';
      return `<div class="sop-cat">${t('group_' + g)}</div><div class="menu-grid">${list.map(card).join('')}</div>`;
    }).join('')}`;
  const add = $('#add'); if (add) add.onclick = () => openEditor(null);
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
  openModal(`<h2>${m ? t('menu_edit') : t('menu_add')}</h2><form id="f">${formHtml(fields, m || { group_type: 'food' })}
    <div class="modal-actions" style="justify-content:space-between">
      <div>${m ? `<button type="button" class="btn-ghost btn-danger" id="del">${t('delete')}</button>` : ''}</div>
      <div style="display:flex;gap:8px"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></div></form>`,
  (cardEl, close) => {
    cardEl.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const v = readForm(cardEl, fields);
      const btn = cardEl.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const row = { name: v.name, group_type: v.group_type, category: v.category, description: v.description, video_url: v.video_url || null, price: v.price };
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
