// SOPs: opening and closing lists and other fixed procedures. Checklists reset every day at midnight.
// Every SOP has a Dutch and an English version; each person sees their own language (Dutch when no English yet).
// The daily ticks are stored per line number, so both checklists keep the same lines in the same order.
// Managers add and edit in a popup; unsaved text is kept as a draft, even after closing or refreshing.
import { state, isManager, app, esc, toast, toastError, todayIso, $, $$, openModal, confirmDialog, download, printHtml, fmt } from '../core.js';
import { t, lang } from '../i18n.js';
import { sb, check } from '../data.js';

const DRAFT = 'wintertuinSopDraft_';
let sops = [];
let checks = {};

const itemText = (it) => (typeof it === 'string' ? it : it.text);
const listOf = (v) => (Array.isArray(v) ? v.map(itemText) : []);
function loadDraft(id) { try { const r = localStorage.getItem(DRAFT + id); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveDraft(id, d) { try { localStorage.setItem(DRAFT + id, JSON.stringify(d)); } catch { /* private mode */ } }
function clearDraft(id) { try { localStorage.removeItem(DRAFT + id); } catch { /* private mode */ } }

// What this person sees: English when filled in and they use English, otherwise Dutch
function view(s) {
  const en = lang() === 'en';
  const nlItems = listOf(s.items);
  const enItems = listOf(s.items_en);
  return {
    category: (en && s.category_en) || s.category || '',
    title: (en && s.title_en) || s.title || '',
    content: (en && s.title_en ? s.content_en : s.content) || '',
    items: en && enItems.length === nlItems.length && enItems.length ? enItems : nlItems,
    translated: !!(s.title_en && enItems.length === nlItems.length),
  };
}

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
  sops.forEach((s) => { const c = view(s).category; (out[c] = out[c] || []).push(s); });
  return out;
}

function draw() {
  const cats = byCategory();
  const missing = lang() === 'en' && isManager() ? sops.filter((s) => !view(s).translated).length : 0;
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('sops_title')}</h1><div class="muted small">${t('sops_sub')}</div></div>
      <div class="page-actions">
        <button type="button" class="btn-sm" id="print">&#128424; ${t('print')}</button>
        <button type="button" class="btn-sm" id="backup">&#11015; ${t('sops_backup')}</button>
        ${isManager() ? `<button type="button" class="btn-primary btn-sm" id="add">+ ${t('sops_add')}</button>` : ''}</div></div>
    ${missing ? `<div class="note" style="margin:0 0 12px">${t('sops_missing_en', { n: missing })}</div>` : ''}
    ${!sops.length ? `<div class="card empty">${t('sops_none')}</div>` : ''}
    ${Object.keys(cats).sort().map((cat) => `<div class="sop-cat">${esc(cat)}</div>
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
  const items = view(s).items;
  const done = items.filter((_, i) => checks[`${s.id}_${i}`]).length;
  return items.length ? `${done}/${items.length}` : '';
}
function updateProgress(id) {
  const s = sops.find((x) => x.id === id);
  const el = document.querySelector(`[data-progress="${id}"]`);
  if (s && el) el.textContent = progress(s);
}

function card(s) {
  const v = view(s);
  return `<div class="card sop-card">
    <div class="row-split"><h3>${esc(v.title)}</h3>
      <div style="display:flex;gap:8px;align-items:center"><span class="sop-progress" data-progress="${s.id}">${progress(s)}</span>
      ${isManager() ? `<button type="button" class="btn-sm" data-edit="${s.id}">${t('edit')}</button>` : ''}</div></div>
    ${v.content ? `<p class="sop-text">${esc(v.content)}</p>` : ''}
    ${v.items.length ? `<div style="margin-top:8px">${v.items.map((it, i) => {
      const on = !!checks[`${s.id}_${i}`];
      return `<label class="sop-check ${on ? 'done' : ''}"><input type="checkbox" data-check="${s.id}|${i}" ${on ? 'checked' : ''}><span>${esc(it)}</span></label>`;
    }).join('')}</div>` : ''}
  </div>`;
}

function openEditor(s) {
  const key = s ? s.id : 'new';
  const draft = loadDraft(key);
  const firstCat = sops[0] || {};
  const v = draft || (s ? {
    category: s.category || '', title: s.title || '', content: s.content || '', items: listOf(s.items).join('\n'),
    category_en: s.category_en || '', title_en: s.title_en || '', content_en: s.content_en || '', items_en: listOf(s.items_en).join('\n'),
  } : { category: firstCat.category || '', category_en: firstCat.category_en || '', title: '', content: '', items: '', title_en: '', content_en: '', items_en: '' });
  const catsNl = [...new Set(sops.map((x) => x.category).filter(Boolean))].sort();
  const catsEn = [...new Set(sops.map((x) => x.category_en).filter(Boolean))].sort();
  const col = (sfx, flag, title, cats) => `<div class="sop-lang"><div class="sop-lang-head">${flag} ${title}</div>
      <div class="field"><label>${t('category')}</label><input name="category${sfx}" list="sop-cats${sfx}" value="${esc(v['category' + sfx])}" placeholder="${t('sops_cat_ph')}">
        <datalist id="sop-cats${sfx}">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label>${t('title')}</label><input name="title${sfx}" value="${esc(v['title' + sfx])}" placeholder="${t('sops_title_ph')}"></div>
      <div class="field"><label>${t('text_optional')}</label><textarea name="content${sfx}" rows="3">${esc(v['content' + sfx])}</textarea></div>
      <div class="field"><label>${t('sops_items')}</label><textarea name="items${sfx}" rows="8" placeholder="${t('sops_items_ph')}">${esc(v['items' + sfx])}</textarea>
        <div class="tiny muted" data-count="${sfx}"></div></div></div>`;
  openModal(`<div class="sop-editor"><h2>${s ? t('sops_edit') : t('sops_add')}</h2>
    ${draft ? `<div class="note" style="margin:0 0 12px">${t('draft_restored')}</div>` : ''}
    <form id="f"><div class="sop-langs">${col('', '&#127475;&#127473;', 'Nederlands', catsNl)}${col('_en', '&#127468;&#127463;', 'English', catsEn)}</div>
      <div class="tiny muted" style="margin:-4px 0 10px">${t('sops_lang_hint')}</div>
      <div class="modal-actions" style="justify-content:space-between">
        <div>${s ? `<button type="button" class="btn-ghost btn-danger" id="del">${t('delete')}</button>` : ''}</div>
        <div style="display:flex;gap:8px"><button type="button" id="cancel">${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></div>
    </form></div>`, (cardEl, close) => {
    const f = cardEl.querySelector('#f');
    const lines = (txt) => txt.split('\n').map((x) => x.trim()).filter(Boolean);
    const read = () => Object.fromEntries(['category', 'title', 'content', 'items', 'category_en', 'title_en', 'content_en', 'items_en'].map((k) => [k, f[k].value]));
    const counts = () => {
      const a = lines(f.items.value).length; const b = lines(f.items_en.value).length;
      cardEl.querySelector('[data-count=""]').textContent = t('sops_lines', { n: a });
      const el = cardEl.querySelector('[data-count="_en"]');
      el.textContent = b && a !== b ? t('sops_lines_mismatch', { n: b, m: a }) : t('sops_lines', { n: b });
      el.className = `tiny ${b && a !== b ? 'txt-red' : 'muted'}`;
    };
    counts();
    f.oninput = () => { saveDraft(key, read()); counts(); };
    cardEl.querySelector('#cancel').onclick = () => { clearDraft(key); close(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const r = read();
      const items = lines(r.items); const itemsEn = lines(r.items_en);
      if (!r.title.trim() && !r.title_en.trim()) { toastError(new Error(t('sops_need_title'))); return; }
      if (itemsEn.length && itemsEn.length !== items.length) { toastError(new Error(t('sops_lines_mismatch', { n: itemsEn.length, m: items.length }))); return; }
      const row = {
        category: r.category.trim() || r.category_en.trim() || 'general', title: r.title.trim() || r.title_en.trim(), content: r.content.trim(), items: items.length ? items : itemsEn,
        category_en: r.category_en.trim() || null, title_en: r.title_en.trim() || null, content_en: r.content_en.trim() || null, items_en: itemsEn,
        updated_by: state.me.id, updated_at: new Date().toISOString(),
      };
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
  Object.keys(cats).sort().forEach((cat) => {
    text += `\n\n${cat.toUpperCase()}\n${'-'.repeat(cat.length)}\n`;
    cats[cat].forEach((s) => {
      const v = view(s);
      text += `\n${v.title}\n`;
      if (v.content) text += `${v.content}\n`;
      v.items.forEach((it) => { text += `  [ ] ${it}\n`; });
    });
  });
  download(text, `wintertuin-sops-backup-${todayIso()}.txt`);
}

function printSops() {
  const cats = byCategory();
  printHtml(`<h1>${t('sops_title')}</h1>${Object.keys(cats).sort().map((cat) => `<h2 style="font-size:13pt;text-transform:uppercase;margin:16px 0 8px">${esc(cat)}</h2>
    ${cats[cat].map((s) => { const v = view(s); return `<div style="margin-bottom:14px;break-inside:avoid"><h3 style="font-size:12pt;margin:0 0 4px">${esc(v.title)}</h3>
      ${v.content ? `<p style="margin:0 0 6px;white-space:pre-line">${esc(v.content)}</p>` : ''}
      ${v.items.length ? `<ul style="list-style:none;padding-left:0;margin:0">${v.items.map((it) => `<li>&#9633; ${esc(it)}</li>`).join('')}</ul>` : ''}</div>`; }).join('')}`).join('')}`);
}
