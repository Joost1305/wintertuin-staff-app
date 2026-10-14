// Roster: a week grid like Teams Shifts. Your own shifts in colour, colleagues in grey.
// Managers plan by clicking "+", by dragging a fixed shift onto a day, or by dragging a shift to another day or person.
// Exports to calendar (.ics), prints "who works today", and compares planned hours with clocked hours.
import { state, isManager, app, esc, fmt, toast, toastError, isoOf, $, $$, openModal, confirmDialog, download, printHtml } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';

let weekStart = null; // a Monday
let shifts = [];
let templates = [];
let dragged = null;
let calendar = {}; // day -> { is_open, note } from the opening hours in Wintertuin Finance

function mondayOf(d) { const m = new Date(d); const day = m.getDay(); m.setDate(m.getDate() + (day === 0 ? -6 : 1 - day)); m.setHours(12, 0, 0, 0); return m; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const toMin = (tm) => { const [h, m] = String(tm).split(':').map(Number); return h * 60 + m; };
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const shiftHours = (s) => Math.max(0, (toMin(s.end_time) - toMin(s.start_time)) / 60);

export async function renderRoster() {
  if (!weekStart) weekStart = mondayOf(new Date());
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  await load();
}

async function load() {
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const from = isoOf(days[0]); const to = isoOf(days[6]);
  // Opening days and notes (closed days, themed evenings) come from Wintertuin Finance: one source of truth
  try {
    const { data } = await sb.rpc('fin_public_calendar', { p_from: from, p_to: to });
    calendar = Object.fromEntries((data || []).map((c) => [c.day, c]));
  } catch { calendar = {}; }
  const [rows, tpl, checkins] = await Promise.all([
    check(await sb.from('shifts').select('*, profiles:staff_id(full_name)').gte('shift_date', from).lte('shift_date', to).order('start_time')),
    check(await sb.from('shift_templates').select('*').order('sort_order').order('start_time')),
    (async () => {
      let q = sb.from('checkins').select('*').gte('check_in_at', new Date(`${from}T00:00:00`).toISOString()).lt('check_in_at', new Date(`${isoOf(addDays(days[6], 1))}T00:00:00`).toISOString());
      if (!isManager()) q = q.eq('staff_id', state.me.id);
      return check(await q);
    })(),
  ]);
  shifts = rows || [];
  templates = tpl || [];
  draw(days, checkins || []);
}

function draw(days, checkins) {
  const staff = state.profiles.filter((p) => p.active !== false).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const today = isoOf(new Date());
  const range = `${fmt.dayMonth(days[0])} – ${fmt.dayMonth(days[6])}`;
  const mgr = isManager();
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('roster_title')}</h1><div class="muted small">${t('roster_sub')}</div></div>
      <div class="page-actions">
        <button type="button" class="btn-sm" id="print-today">&#128424; ${t('roster_print_today')}</button>
        <details class="export-menu" style="position:relative"><summary class="btn btn-sm">&#11015; ${t('export')} &#9662;</summary>
          <div class="card" style="position:absolute;right:0;top:110%;z-index:10;display:flex;flex-direction:column;gap:6px;min-width:260px;padding:10px">
            <button type="button" class="btn-sm" data-ics="my-week">${t('ics_my_week')}</button>
            <button type="button" class="btn-sm" data-ics="my-month">${t('ics_my_month')}</button>
            ${mgr ? `<button type="button" class="btn-sm" data-ics="team-week">${t('ics_team_week')}</button>
            <button type="button" class="btn-sm" data-ics="team-month">${t('ics_team_month')}</button>
            <button type="button" class="btn-sm" id="csv">${t('roster_csv')}</button>` : ''}
          </div></details></div></div>
    <div class="card">
      <div class="roster-bar">
        <div style="display:flex;gap:6px;align-items:center"><button type="button" class="btn-sm" id="prev" aria-label="${t('prev_week')}">&#8249;</button>
          <button type="button" class="btn-sm" id="this">${t('this_week')}</button>
          <button type="button" class="btn-sm" id="next" aria-label="${t('next_week')}">&#8250;</button></div>
        <span class="week">${esc(range)}</span></div>
      <div class="tiny muted" style="margin:-4px 0 10px">${t('opening_from_finance')}</div>
      ${mgr ? `<div class="note" style="margin:0 0 12px">
          <div class="row-split" style="margin-bottom:${templates.length ? '8px' : '0'}"><strong>${t('fixed_shifts')}</strong><a href="#/settings/templates" class="small">${t('fixed_manage')}</a></div>
          ${templates.length ? `<div class="tpl-chips">${templates.map((tp) => `<span class="tpl-chip" draggable="true" data-tpl="${tp.id}">${esc(tp.name)} · ${fmt.time(tp.start_time)}–${fmt.time(tp.end_time)}</span>`).join('')}</div>
          <div class="tiny muted" style="margin-top:6px">${t('fixed_drag_hint')}</div>` : `<div class="tiny muted">${t('fixed_none')}</div>`}</div>` : ''}
      <div class="roster-wrap"><table class="roster"><thead><tr><th>${t('staff_member')}</th>
        ${days.map((d) => { const c = calendar[isoOf(d)]; const closed = c && !c.is_open;
          return `<th class="${isoOf(d) === today ? 'today' : ''} ${closed ? 'closed' : ''}">${esc(fmt.weekdayShort(d))}<br><span class="small" style="font-weight:500">${d.getDate()}/${d.getMonth() + 1}</span>
          ${c && c.note ? `<span class="day-note">${esc(c.note)}</span>` : closed ? `<span class="day-closed">${t('closed')}</span>` : ''}</th>`; }).join('')}</tr></thead>
        <tbody>${!staff.length ? `<tr><td colspan="8" class="empty">${t('roster_no_staff')}</td></tr>` : staff.map((p) => `<tr><td><strong>${esc(p.full_name)}</strong></td>
          ${days.map((d) => { const ds = isoOf(d); const here = shifts.filter((s) => s.staff_id === p.id && s.shift_date === ds);
            const closed = calendar[ds] && !calendar[ds].is_open;
            return `<td class="${closed ? 'closed' : ''}" ${mgr ? `data-cell="${p.id}|${ds}"` : ''}>${here.map(chip).join('')}${mgr ? `<button type="button" class="add-shift" data-add="${p.id}|${ds}" aria-label="${t('roster_add')}">+</button>` : ''}</td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div></div>
    ${hoursOverview(staff, checkins)}`;

  $('#prev').onclick = () => { weekStart = addDays(weekStart, -7); renderRoster(); };
  $('#next').onclick = () => { weekStart = addDays(weekStart, 7); renderRoster(); };
  $('#this').onclick = () => { weekStart = mondayOf(new Date()); renderRoster(); };
  $('#print-today').onclick = printToday;
  $$('[data-ics]').forEach((b) => (b.onclick = () => exportIcs(b.dataset.ics)));
  const csv = $('#csv'); if (csv) csv.onclick = exportCsv;
  if (!mgr) return;
  $$('[data-add]').forEach((b) => (b.onclick = () => { const [pid, ds] = b.dataset.add.split('|'); openShift(null, pid, ds); }));
  $$('[data-shift]').forEach((b) => (b.onclick = () => openShift(shifts.find((s) => s.id === b.dataset.shift))));
  // drag and drop
  $$('[data-tpl]').forEach((el) => (el.ondragstart = (e) => { dragged = { type: 'template', id: el.dataset.tpl }; e.dataTransfer.setData('text/plain', JSON.stringify(dragged)); e.dataTransfer.effectAllowed = 'copy'; }));
  $$('[data-shift]').forEach((el) => (el.ondragstart = (e) => { dragged = { type: 'shift', id: el.dataset.shift }; e.dataTransfer.setData('text/plain', JSON.stringify(dragged)); e.dataTransfer.effectAllowed = 'move'; }));
  $$('[data-cell]').forEach((td) => {
    td.ondragover = (e) => { e.preventDefault(); td.classList.add('drop-ok'); };
    td.ondragleave = () => td.classList.remove('drop-ok');
    td.ondrop = async (e) => {
      e.preventDefault(); td.classList.remove('drop-ok');
      let p = dragged;
      try { const raw = e.dataTransfer.getData('text/plain'); if (raw) p = JSON.parse(raw); } catch { /* use fallback */ }
      dragged = null;
      if (!p) return;
      const [pid, ds] = td.dataset.cell.split('|');
      try {
        if (p.type === 'template') {
          const tp = templates.find((x) => x.id === p.id); if (!tp) return;
          check(await sb.from('shifts').insert({ staff_id: pid, shift_date: ds, start_time: tp.start_time, end_time: tp.end_time, section: tp.section }));
        } else check(await sb.from('shifts').update({ staff_id: pid, shift_date: ds }).eq('id', p.id));
        renderRoster();
      } catch (err) { toastError(err); }
    };
  });
}

function chip(s) {
  const mine = s.staff_id === state.me.id;
  const mgr = isManager();
  return `<${mgr ? 'button type="button"' : 'div'} class="shift-chip ${mine ? 'mine' : ''}" ${mgr ? `draggable="true" data-shift="${s.id}"` : ''}>
    ${fmt.time(s.start_time)}–${fmt.time(s.end_time)}${s.section ? `<span class="sec">${esc(s.section)}</span>` : ''}</${mgr ? 'button' : 'div'}>`;
}

function hoursOverview(staff, checkins) {
  const list = isManager() ? staff : staff.filter((p) => p.id === state.me.id);
  if (!list.length) return '';
  return `<h2 class="section-title">${t('hours_week')}</h2>
    <div class="card"><div class="small muted" style="margin-bottom:8px">${t('hours_week_sub')}</div><div class="table-wrap"><table class="num-table">
    <thead><tr><th>${t('staff_member')}</th><th>${t('planned')}</th><th>${t('worked')}</th></tr></thead><tbody>
    ${list.map((p) => {
      const planned = shifts.filter((s) => s.staff_id === p.id).reduce((a, s) => a + shiftHours(s), 0);
      const worked = checkins.filter((c) => c.staff_id === p.id && c.check_out_at).reduce((a, c) => a + (new Date(c.check_out_at) - new Date(c.check_in_at)) / 3600000, 0);
      return `<tr><td>${esc(p.full_name)}</td><td>${fmt.num(planned, 1)} ${t('h')}</td><td>${fmt.num(worked, 1)} ${t('h')}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
}

// ------------------------------------------------------------------ add / edit a shift, with an Outlook-like time bar
const GRID_START = 6 * 60; const GRID_END = 23 * 60 + 30; const STEP = 30;
function openShift(s, staffId, dateStr) {
  const v = s ? { staff: s.staff_id, date: s.shift_date, start: fmt.time(s.start_time), end: fmt.time(s.end_time), section: s.section || '' }
    : { staff: staffId, date: dateStr, start: '09:00', end: '17:00', section: '' };
  let slots = '';
  for (let m = GRID_START; m < GRID_END; m += STEP) slots += `<div class="grid-slot ${m % 60 === 0 ? 'hour' : ''}" data-min="${m}">${m % 60 === 0 ? `<span class="lbl">${toTime(m)}</span>` : ''}</div>`;
  openModal(`<h2>${s ? t('shift_edit') : t('shift_plan')} · ${esc(fmt.date(v.date))}</h2>
    <form id="f">
      <div class="field"><label>${t('staff_member')}</label><select name="staff">${state.profiles.filter((p) => p.active !== false || p.id === v.staff)
        .map((p) => `<option value="${p.id}" ${p.id === v.staff ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></div>
      <div class="field"><label>${t('date')}</label><input type="date" name="date" value="${v.date}" required></div>
      <div class="day-grid-label">${t('time_bar_hint')}</div>
      <div class="day-grid" id="day-grid">${slots}</div>
      <div class="field-row" style="margin-top:10px">
        <div class="field"><label>${t('from')}</label><input type="time" name="start" value="${v.start}" required></div>
        <div class="field"><label>${t('until')}</label><input type="time" name="end" value="${v.end}" required></div></div>
      <div class="field"><label>${t('section')}</label><input name="section" value="${esc(v.section)}" placeholder="${t('section_ph')}"></div>
      <div class="modal-actions" style="justify-content:space-between">
        <div>${s ? `<button type="button" class="btn-ghost btn-danger" id="del">${t('delete')}</button>` : ''}</div>
        <div style="display:flex;gap:8px"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${s ? t('save') : t('roster_plan_btn')}</button></div></div>
    </form>`, (cardEl, close) => {
    const f = cardEl.querySelector('#f');
    const grid = cardEl.querySelector('#day-grid');
    const paint = () => {
      if (!f.start.value || !f.end.value) return;
      const lo = toMin(f.start.value); const hi = toMin(f.end.value);
      grid.querySelectorAll('.grid-slot').forEach((el) => { const m = Number(el.dataset.min); el.classList.toggle('on', m >= lo && m < hi); });
    };
    paint();
    const firstOn = grid.querySelector('.grid-slot.on'); if (firstOn) grid.scrollTop = Math.max(0, firstOn.offsetTop - 30);
    f.start.onchange = paint; f.end.onchange = paint;
    let anchor = null;
    const slotAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest ? el.closest('.grid-slot') : null; };
    const apply = (a, b) => { const lo = Math.min(a, b); const hi = Math.max(a, b) + STEP; f.start.value = toTime(lo); f.end.value = toTime(hi); paint(); };
    grid.onpointerdown = (e) => { const sl = slotAt(e); if (!sl) return; e.preventDefault(); anchor = Number(sl.dataset.min); grid.setPointerCapture(e.pointerId); apply(anchor, anchor); };
    grid.onpointermove = (e) => { if (anchor == null) return; const sl = slotAt(e); if (sl) apply(anchor, Number(sl.dataset.min)); };
    grid.onpointerup = () => { anchor = null; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (toMin(f.end.value) <= toMin(f.start.value)) { toastError(new Error(t('end_after_start'))); return; }
      const row = { staff_id: f.staff.value, shift_date: f.date.value, start_time: f.start.value, end_time: f.end.value, section: f.section.value.trim() };
      try {
        if (s) check(await sb.from('shifts').update(row).eq('id', s.id));
        else check(await sb.from('shifts').insert(row));
        close(); toast(t('saved')); renderRoster();
      } catch (err) { toastError(err); }
    };
    const del = cardEl.querySelector('#del');
    if (del) del.onclick = async () => {
      close();
      if (!(await confirmDialog(t('shift_confirm_delete'), t('delete')))) return;
      try { check(await sb.from('shifts').delete().eq('id', s.id)); toast(t('deleted')); renderRoster(); } catch (err) { toastError(err); }
    };
  });
}

// ------------------------------------------------------------------ print, calendar export, backup
async function printToday() {
  const today = isoOf(new Date());
  try {
    const rows = check(await sb.from('shifts').select('*, profiles:staff_id(full_name)').eq('shift_date', today).order('start_time')) || [];
    printHtml(`<h1>${t('who_works_today')}</h1><p>${esc(fmt.dateLong(today))}</p>
      <table><thead><tr><th>${t('time')}</th><th>${t('name')}</th><th>${t('section')}</th></tr></thead><tbody>
      ${rows.length ? rows.map((s) => `<tr><td>${fmt.time(s.start_time)}–${fmt.time(s.end_time)}</td><td>${esc(s.profiles ? s.profiles.full_name : '')}</td><td>${esc(s.section || '')}</td></tr>`).join('')
        : `<tr><td colspan="3">${t('no_shifts_today')}</td></tr>`}</tbody></table>`);
  } catch (e) { toastError(e); }
}

const icsEsc = (s) => (s || '').replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
const icsDT = (d, tm) => `${d.replace(/-/g, '')}T${fmt.time(tm).replace(':', '')}00`;
function buildIcs(rows, calName) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Wintertuin//Roster//EN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:${icsEsc(calName)}\r\n`;
  rows.forEach((s) => {
    const summary = s.profiles ? `${s.section || t('shift')} (${s.profiles.full_name})` : (s.section || t('shift'));
    ics += `BEGIN:VEVENT\r\nUID:${s.id}@wintertuin\r\nDTSTAMP:${stamp}\r\nDTSTART:${icsDT(s.shift_date, s.start_time)}\r\nDTEND:${icsDT(s.shift_date, s.end_time)}\r\nSUMMARY:${icsEsc(summary)}\r\nEND:VEVENT\r\n`;
  });
  return `${ics}END:VCALENDAR\r\n`;
}
async function exportIcs(kind) {
  const [who, span] = kind.split('-');
  const from = span === 'week' ? weekStart : new Date(weekStart.getFullYear(), weekStart.getMonth(), 1, 12);
  const to = span === 'week' ? addDays(weekStart, 6) : new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0, 12);
  try {
    let q = sb.from('shifts').select('*, profiles:staff_id(full_name)').gte('shift_date', isoOf(from)).lte('shift_date', isoOf(to)).order('shift_date').order('start_time');
    if (who === 'my') q = q.eq('staff_id', state.me.id);
    const rows = check(await q) || [];
    const name = who === 'my' ? t('ics_cal_mine') : t('ics_cal_team');
    download(buildIcs(rows, name), `wintertuin-${who === 'my' ? 'my' : 'team'}-${span}-${isoOf(from)}.ics`, 'text/calendar;charset=utf-8');
  } catch (e) { toastError(e); }
}
const csvEsc = (s) => { s = String(s ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function exportCsv() {
  try {
    const rows = check(await sb.from('shifts').select('*, profiles:staff_id(full_name)').order('shift_date').order('start_time')) || [];
    let csv = `${[t('date'), t('from'), t('until'), t('staff_member'), t('section'), t('note')].join(',')}\r\n`;
    rows.forEach((s) => { csv += [s.shift_date, fmt.time(s.start_time), fmt.time(s.end_time), s.profiles ? s.profiles.full_name : '', s.section || '', s.notes || ''].map(csvEsc).join(',') + '\r\n'; });
    download('﻿' + csv, `wintertuin-roster-backup-${isoOf(new Date())}.csv`, 'text/csv;charset=utf-8');
  } catch (e) { toastError(e); }
}
