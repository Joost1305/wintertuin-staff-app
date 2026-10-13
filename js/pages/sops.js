// SOPs: opening and closing lists and other fixed procedures. Checklists reset every day at midnight.
// Managers add and edit in a popup; unsaved text is kept as a draft, even after closing or refreshing.
import { state, isManager, app, esc, toast, toastError, todayIso, $, $$, openModal, confirmDialog, download, printHtml, fmt } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';

const DRAFT = 'wintertuinSopDraft_';
let sops = [];
let checks = {};

const itemText = (it) => (typeof it === 'string' ? it : it.text);
function loadDraft(id) { try { const r = localStorage.getItem(DRAFT + id); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveDraft(id, d) { try { localStorage.setItem(DRAFT + id, JSON.stringify(d)); } catch { /* private mode */ } }
function clearDraft(id) { try { localStorage.removeItem(DRAFT + id); } catch { /* private mode */ } }

export async function renderSops() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [rows, ch] = await Promise.all([
    check(await sb.from('sops').select('*').order('category').order('sort_order')),
    check(await sb.from('sop_checks').select('*').eq('check_date', todayIso())),
  ]);
  sops = rows || [];
  checks = {};
  (ch || []).forEach((c) => { checks[`${c.sop_id}_${c.item_index}`] = c.checked; });
  draw();
}

function byCategory() {
  const out = {};
  sops.forEach((s) => { (out[s.category] = out[s.category] || []).push(s); });
  return out;
}

function draw() {
  const cats = byCategory();
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('sops_title')}</h1><div class="muted small">${t('sops_sub')}</div></div>
      <div class="page-actions">
        <button type="button" class="btn-sm" id="print">&#128424; ${t('print')}</button>
        <button type="button" class="btn-sm" id="backup">&#11015; ${t('sops_backup')}</button>
        ${isManager() ? `<button type="button" class="btn-primary btn-sm" id="add">+ ${t('sops_add')}</button>` : ''}</div></div>
    ${!sops.length ? `<div class="card empty">${t('sops_none')}</div>` : ''}
    ${Object.keys(cats).map((cat) => `<div class="sop-cat">${esc(cat)}</div>
      <div class="grid grid-2">${cats[cat].map(card).join('')}</div>`).join('')}`;
  $('#print').onclick = printSops;
  $('#backup').onclick = backupTxt;
  const add = $('#add'); if (add) add.onclick = () => openEditor(null);
  $$('[data-edit]').forEach((b) => (b.onclick = () => openEditor(sops.find((s) => s.id === b.dataset.edit))));
  $$('[data-check]').forEach((inp) => (inp.onchange = async () => {
    const [id, idx] = inp.dataset.check.split('|');
    inp.closest('.sop-check').classList.toggle('done', inp.checked);
    checks[`${id}_${idx}`] = inp.checked;
    updateProgress(id);
    try {
      check(await sb.from('sop_checks').upsert({ sop_id: id, item_index: Number(idx), check_date: todayIso(), checked: inp.checked,
        checked_by: state.me.id, checked_at: new Date().toISOString() }, { onConflict: 'sop_id,item_index,check_date' }));
    } catch (e) { toastError(e); }
  }));
}

function progress(s) {
  const items = s.items || [];
  const done = items.filter((_, i) => checks[`${s.id}_${i}`]).length;
  return items.length ? `${done}/${items.length}` : '';
}
function updateProgress(id) {
  const s = sops.find((x) => x.id === id);
  const el = document.querySelector(`[data-progress="${id}"]`);
  if (s && el) el.textContent = progress(s);
}

function card(s) {
  const items = s.items || [];
  return `<div class="card sop-card">
    <div class="row-split"><h3>${esc(s.title)}</h3>
      <div style="display:flex;gap:8px;align-items:center"><span class="sop-progress" data-progress="${s.id}">${progress(s)}</span>
      ${isManager() ? `<button type="button" class="btn-sm" data-edit="${s.id}">${t('edit')}</button>` : ''}</div></div>
    ${s.content ? `<p class="sop-text">${esc(s.content)}</p>` : ''}
    ${items.length ? `<div style="margin-top:8px">${items.map((it, i) => {
      const on = !!checks[`${s.id}_${i}`];
      return `<label class="sop-check ${on ? 'done' : ''}"><input type="checkbox" data-check="${s.id}|${i}" ${on ? 'checked' : ''}><span>${esc(itemText(it))}</span></label>`;
    }).join('')}</div>` : ''}
  </div>`;
}

function openEditor(s) {
  const key = s ? s.id : 'new';
  const draft = loadDraft(key);
  const v = draft || (s ? { category: s.category, title: s.title, content: s.content || '', items: (s.items || []).map(itemText).join('\n') }
    : { category: Object.keys(byCategory())[0] || '', title: '', content: '', items: '' });
  const cats = [...new Set(sops.map((x) => x.category))].sort();
  openModal(`<h2>${s ? t('sops_edit') : t('sops_add')}</h2>
    ${draft ? `<div class="note" style="margin:0 0 12px">${t('draft_restored')}</div>` : ''}
    <form id="f">
      <div class="field"><label>${t('category')}</label>
        <input name="category" list="sop-cats" value="${esc(v.category)}" placeholder="${t('sops_cat_ph')}" required>
        <datalist id="sop-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <div class="tiny muted" style="margin-top:3px">${t('sops_cat_hint')}</div></div>
      <div class="field"><label>${t('title')}</label><input name="title" value="${esc(v.title)}" placeholder="${t('sops_title_ph')}" required></div>
      <div class="field"><label>${t('text_optional')}</label><textarea name="content" rows="3">${esc(v.content)}</textarea></div>
      <div class="field"><label>${t('sops_items')}</label><textarea name="items" rows="6" placeholder="${t('sops_items_ph')}">${esc(v.items)}</textarea></div>
      <div class="modal-actions" style="justify-content:space-between">
        <div>${s ? `<button type="button" class="btn-ghost btn-danger" id="del">${t('delete')}</button>` : ''}</div>
        <div style="display:flex;gap:8px"><button type="button" id="cancel">${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></div>
    </form>`, (cardEl, close) => {
    const f = cardEl.querySelector('#f');
    const read = () => ({ category: f.category.value.trim(), title: f.title.value.trim(), content: f.content.value.trim(), items: f.items.value });
    f.oninput = () => saveDraft(key, read());
    cardEl.querySelector('#cancel').onclick = () => { clearDraft(key); close(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const r = read();
      const row = { category: r.category || 'general', title: r.title, content: r.content, items: r.items.split('\n').map((x) => x.trim()).filter(Boolean),
        updated_by: state.me.id, updated_at: new Date().toISOString() };
      try {
        if (s) check(await sb.from('sops').update(row).eq('id', s.id));
        else check(await sb.from('sops').insert(row));
        clearDraft(key); close(); toast(t('saved')); renderSops();
      } catch (err) { toastError(err); }
    };
    const del = cardEl.querySelector('#del');
    if (del) del.onclick = async () => {
      close();
      if (!(await confirmDialog(t('sops_confirm_delete'), t('delete')))) return;
      try { check(await sb.from('sops').delete().eq('id', s.id)); clearDraft(key); toast(t('deleted')); renderSops(); } catch (err) { toastError(err); }
    };
  });
}

function backupTxt() {
  const cats = byCategory();
  let text = `Wintertuin, ${t('sops_title')}\n${t('downloaded_on')} ${fmt.stamp()}\n${'='.repeat(50)}\n`;
  Object.keys(cats).forEach((cat) => {
    text += `\n\n${cat.toUpperCase()}\n${'-'.repeat(cat.length)}\n`;
    cats[cat].forEach((s) => {
      text += `\n${s.title}\n`;
      if (s.content) text += `${s.content}\n`;
      (s.items || []).forEach((it) => { text += `  [ ] ${itemText(it)}\n`; });
    });
  });
  download(text, `wintertuin-sops-backup-${todayIso()}.txt`);
}

function printSops() {
  const cats = byCategory();
  printHtml(`<h1>${t('sops_title')}</h1>${Object.keys(cats).map((cat) => `<h2 style="font-size:13pt;text-transform:uppercase;margin:16px 0 8px">${esc(cat)}</h2>
    ${cats[cat].map((s) => `<div style="margin-bottom:14px;break-inside:avoid"><h3 style="font-size:12pt;margin:0 0 4px">${esc(s.title)}</h3>
      ${s.content ? `<p style="margin:0 0 6px;white-space:pre-line">${esc(s.content)}</p>` : ''}
      ${(s.items || []).length ? `<ul style="list-style:none;padding-left:0;margin:0">${s.items.map((it) => `<li>&#9633; ${esc(itemText(it))}</li>`).join('')}</ul>` : ''}</div>`).join('')}`).join('')}`);
}
