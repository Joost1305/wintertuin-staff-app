// Shared helpers: state, formatting, DOM, toast, modal, forms, language. Same patterns as Wintertuin Finance.
import { t, lang, setLang, LANGS } from './i18n.js';
import { setLanguage } from './data.js';

export const state = {
  me: null,        // own profiles row
  profiles: [],    // everyone, for names and pickers
};
export const realManager = () => !!(state.me && state.me.role === 'manager');
export const isManager = () => realManager() && !employeeView.on();
// ------------------------------------------------------------------ employee view
// A manager can look at the app exactly as staff see it. Only the screens change; on this device only.
const EMP_KEY = 'wtTeamEmployeeView';
export const employeeView = {
  on() { try { return localStorage.getItem(EMP_KEY) === '1'; } catch { return false; } },
  set(v) { try { if (v) localStorage.setItem(EMP_KEY, '1'); else localStorage.removeItem(EMP_KEY); } catch { /* private mode */ } },
};

// Banner while a manager looks at the employee view
export function renderEmployeeBanner(isRealManager, backHash, t) {
  let bar = document.getElementById('emp-bar');
  const show = isRealManager && employeeView.on();
  if (!show) { if (bar) bar.remove(); document.body.classList.remove('emp-view'); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'emp-bar'; bar.className = 'emp-bar'; document.querySelector('main').before(bar); }
  document.body.classList.add('emp-view');
  bar.innerHTML = `<span>&#128065; ${t('emp_view_on')}</span><button type="button" class="btn-sm" id="emp-off">${t('emp_view_off')}</button>`;
  bar.querySelector('#emp-off').onclick = () => {
    employeeView.set(false);
    if (location.hash === backHash) window.dispatchEvent(new Event('wt:lang')); else location.hash = backHash;
  };
}


// ------------------------------------------------------------------ formatting
const locale = () => (lang() === 'en' ? 'en-GB' : 'nl-NL');
function toDate(s) {
  if (!s) return null;
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s;
  let str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += 'T12:00:00';
  str = str.replace(' ', 'T');
  if (/T\d{2}:\d{2}.*[+-]\d{2}$/.test(str)) str += ':00';
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const fmt = {
  num(n, d = 0) { return n == null ? '–' : new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: d }).format(n); },
  money(n) { return n == null || n === '' ? '' : new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(Number(n)); },
  date(s) { const d = toDate(s); return d ? new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(d) : '–'; },
  dateLong(s) { const d = toDate(s); return d ? new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d) : '–'; },
  dayMonth(d) { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(d); },
  weekdayShort(d) { return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(d); },
  dateTime(s) { const d = toDate(s); return d ? new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d) : '–'; },
  time(tm) { return tm ? String(tm).slice(0, 5) : ''; },
  stamp() { return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()); },
};
export const todayIso = () => new Date().toLocaleDateString('sv-SE');
export const isoOf = (d) => d.toLocaleDateString('sv-SE');
export const nameOf = (id) => { const p = state.profiles.find((x) => x.id === id); return p ? p.full_name : '?'; };

// ------------------------------------------------------------------ DOM
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const app = () => document.getElementById('app');

let toastTimer;
export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, type === 'error' ? 4500 : 2600);
}
export function toastError(e) { console.warn(e); toast(e && e.message ? e.message : t('error'), 'error'); }

// ------------------------------------------------------------------ modal
let onModalClose = null;
export function closeModal() {
  const m = document.getElementById('modal');
  if (m && !m.hidden) { m.hidden = true; m.querySelector('.modal-card').innerHTML = ''; if (onModalClose) { const f = onModalClose; onModalClose = null; f(); } }
}
export function openModal(html, onMount, onClose) {
  const m = document.getElementById('modal');
  const card = m.querySelector('.modal-card');
  card.innerHTML = html;
  m.hidden = false;
  onModalClose = onClose || null;
  const close = () => { document.removeEventListener('keydown', onKey); closeModal(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.onclick = (e) => { if (e.target === m) close(); };
  card.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  if (onMount) onMount(card, close);
  const first = card.querySelector('input:not([type=hidden]):not([type=file]), select, textarea');
  if (first) first.focus();
  return close;
}
export function confirmDialog(message, okLabel, danger = true) {
  return new Promise((resolve) => {
    openModal(`<p style="white-space:pre-line">${esc(message)}</p><div class="modal-actions">
      <button data-close>${t('cancel')}</button><button class="btn-primary ${danger ? 'btn-danger' : ''}" id="cf-ok">${esc(okLabel || t('delete'))}</button></div>`,
    (card, close) => {
      card.querySelector('#cf-ok').onclick = () => { close(); resolve(true); };
      card.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { close(); resolve(false); }));
    });
  });
}
export function promptDialog(message, placeholder = '') {
  return new Promise((resolve) => {
    openModal(`<form id="pd"><p>${esc(message)}</p><div class="field"><input name="v" placeholder="${esc(placeholder)}"></div>
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('ok')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#pd').onsubmit = (e) => { e.preventDefault(); const v = card.querySelector('[name=v]').value.trim(); close(); resolve({ value: v }); };
      card.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { close(); resolve(null); }));
    });
  });
}

// ------------------------------------------------------------------ forms
// fields: [{ name, label, type: text|number|email|date|time|select|checkbox|textarea|file|help, options:[{value,label}], placeholder, hint, required }]
export function formHtml(fields, values = {}) {
  return fields.map((f) => {
    const v = values[f.name];
    const req = f.required ? 'required' : '';
    const hint = f.hint ? `<div class="tiny muted" style="margin-top:3px">${esc(f.hint)}</div>` : '';
    if (f.type === 'help') return `<div class="note" style="margin:0 0 14px">${esc(f.label)}</div>`;
    if (f.type === 'checkbox') return `<div class="field"><label class="check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}</label></div>`;
    if (f.type === 'select') {
      const opts = f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      return `<div class="field"><label>${esc(f.label)}</label><select name="${f.name}" ${req}>${opts}</select>${hint}</div>`;
    }
    if (f.type === 'textarea') return `<div class="field"><label>${esc(f.label)}</label><textarea name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}" ${req}>${esc(v ?? '')}</textarea>${hint}</div>`;
    if (f.type === 'file') return `<div class="field"><label>${esc(f.label)}</label><input type="file" name="${f.name}" accept="${esc(f.accept || '')}">${hint}</div>`;
    const type = f.type === 'number' ? 'text' : (f.type || 'text');
    return `<div class="field"><label>${esc(f.label)}</label><input type="${type}" name="${f.name}" value="${esc(v ?? '')}"
      ${f.type === 'number' ? 'inputmode="decimal"' : ''} placeholder="${esc(f.placeholder || '')}" ${req}>${hint}</div>`;
  }).join('');
}
export function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'help') continue;
    const el = root.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (f.type === 'checkbox') { out[f.name] = el.checked; continue; }
    if (f.type === 'file') { out[f.name] = el.files && el.files[0] ? el.files[0] : null; continue; }
    const raw = el.value.trim();
    if (f.type === 'number') { const n = Number(raw.replace(',', '.')); out[f.name] = raw === '' || Number.isNaN(n) ? null : n; }
    else out[f.name] = raw;
  }
  return out;
}

// ------------------------------------------------------------------ language switch
export function renderLangToggle(el) {
  el.innerHTML = Object.keys(LANGS).map((l) =>
    `<button type="button" data-lang="${l}" class="${l === lang() ? 'on' : ''}" aria-pressed="${l === lang()}" title="${esc(LANGS[l])}">${l.toUpperCase()}</button>`).join('');
  el.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = async () => {
    const l = b.dataset.lang;
    if (l === lang()) return;
    setLang(l);
    if (state.me) { try { await setLanguage(state.me.id, l); state.me.language = l; } catch (e) { toastError(e); } }
    window.dispatchEvent(new Event('wt:lang'));
  }));
}

// ------------------------------------------------------------------ downloads and print
export function download(text, filename, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
// Prints only the given HTML. The sheet goes into #printArea, which shows only on paper while the rest of the
// page is hidden there. Nothing is cleared after printing: Safari signals "done" too early and renders the page
// again when you press Print or Save as PDF, so clearing (or printing from a frame) gave blank pages.
// The sheet is removed when you move to another page, or replaced by the next print.
let clearOnLeave = null;
export function printHtml(html) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  document.body.classList.add('printing');
  if (!clearOnLeave) {
    clearOnLeave = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('hashchange', clearOnLeave); clearOnLeave = null; };
    window.addEventListener('hashchange', clearOnLeave);
  }
  const run = window.__printHook || (() => window.print()); // tests swap in a counter
  setTimeout(run, 60); // let the sheet lay out first
}
