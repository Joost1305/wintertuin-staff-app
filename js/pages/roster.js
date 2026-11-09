// Roster: a day, week or month overview. The week is a grid like Teams Shifts. Your own shifts in colour, colleagues in grey.
// Managers plan by clicking "+", by dragging a fixed shift onto a day, or by dragging a shift to another day or person.
// Exports to calendar (.ics), prints "who works today", and compares planned hours with clocked hours.
import { state, isManager, app, esc, fmt, toast, toastError, isoOf, $, $$, openModal, confirmDialog, download, printHtml, avatar } from '../core.js';
import { t, lang } from '../i18n.js';
import { sectionClass } from './roster-colors.js';
import { sb, check } from '../data.js';

let weekStart = null; // a Monday
let shifts = [];
let templates = [];
let dragged = null;
let calendar = {}; // day -> { is_open, note } from the opening hours in Wintertuin Finance
let weekEvents = []; // events this week (not cancelled), shown on their day and linking to the BEO
// notes like 'Event: ...' are written automatically for confirmed events; the event itself is shown instead
const noteOf = (c) => (c && c.note && !/^Event:/.test(c.note) ? c.note : '');
const guestsOfEv = (e) => e.guests_final ?? e.guests_guaranteed ?? e.guests_expected;
const evLabels = (ds) => weekEvents.filter((e) => e.event_date === ds).map((e) => `<a class="ro-ev ev-${esc(e.status)}" href="#/events/${e.id}" title="${esc(e.title)} · ${t('evs_' + e.status)}">
  <span class="evdot ev-${esc(e.status)}"></span><span class="ro-ev-t">${e.start_time ? `${fmt.time(e.start_time)} ` : ''}${esc(e.title)}</span>${guestsOfEv(e) ? `<span class="ro-ev-g">${guestsOfEv(e)} ${t('ev_p')}</span>` : ''}</a>`).join('');
let mDay = null; // the day shown in the day view (iso date)
// Day, week or month. Remembered on this device; a phone starts on the day, a computer on the week.
const VIEW_KEY = 'wt_roster_view';
let view = (() => { try { const v = localStorage.getItem(VIEW_KEY); if (['day', 'week', 'month'].includes(v)) return v; } catch { /* private mode */ } return window.matchMedia('(max-width: 700px)').matches ? 'day' : 'week'; })();
let cursor = null; // the date the view is about (noon)
let monthOf = null; // first day of the month shown in the month view
const L = (o) => o[lang()] || o.en;
const firstName = (n) => String(n || '').trim().split(/\s+/)[0];

function mondayOf(d) { const m = new Date(d); const day = m.getDay(); m.setDate(m.getDate() + (day === 0 ? -6 : 1 - day)); m.setHours(12, 0, 0, 0); return m; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const toMin = (tm) => { const [h, m] = String(tm).split(':').map(Number); return h * 60 + m; };
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const shiftHours = (s) => Math.max(0, (toMin(s.end_time) - toMin(s.start_time)) / 60);

export async function renderRoster() {
  if (!cursor) { cursor = new Date(); cursor.setHours(12, 0, 0, 0); }
  weekStart = mondayOf(cursor);
  monthOf = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  if (view === 'day') mDay = isoOf(cursor);
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  await load();
}

// The days a view covers: the week of the day (so the day strip works), the week, or whole weeks around the month
function spanDays() {
  if (view !== 'month') return [...Array(7)].map((_, i) => addDays(weekStart, i));
  const start = mondayOf(monthOf); const last = new Date(monthOf.getFullYear(), monthOf.getMonth() + 1, 0, 12);
  const end = addDays(mondayOf(last), 6); const out = [];
  for (let d = start; isoOf(d) <= isoOf(end); d = addDays(d, 1)) out.push(d);
  return out;
}

async function load() {
  const days = spanDays();
  const from = isoOf(days[0]); const to = isoOf(days[days.length - 1]);
  // Opening days and notes (closed days, themed evenings) come from Wintertuin Finance: one source of truth
  try {
    const { data } = await sb.rpc('fin_public_calendar', { p_from: from, p_to: to });
    calendar = Object.fromEntries((data || []).map((c) => [c.day, c]));
  } catch { calendar = {}; }
  try {
    weekEvents = check(await sb.from('events').select('id, title, event_date, start_time, status, guests_expected, guests_guaranteed, guests_final')
      .gte('event_date', from).lte('event_date', to).neq('status', 'cancelled').order('start_time')) || [];
  } catch { weekEvents = []; } // the roster still works without them
  const [rows, tpl, checkins] = await Promise.all([
    check(await sb.from('shifts').select('*, profiles:staff_id(full_name)').gte('shift_date', from).lte('shift_date', to).order('start_time')),
    check(await sb.from('shift_templates').select('*').order('sort_order').order('start_time')),
    (async () => {
      let q = sb.from('checkins').select('*').gte('check_in_at', new Date(`${from}T00:00:00`).toISOString()).lt('check_in_at', new Date(`${isoOf(addDays(days[days.length - 1], 1))}T00:00:00`).toISOString());
      if (!isManager()) q = q.eq('staff_id', state.me.id);
      return check(await q);
    })(),
  ]);
  shifts = rows || [];
  templates = tpl || [];
  draw(days, checkins || []);
}

function draw(days, checkins) {
  const staff = state.profiles.filter((p) => p.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.full_name.localeCompare(b.full_name));
  const today = isoOf(new Date());
  const loc = lang() === 'nl' ? 'nl-NL' : 'en-GB';
  const range = view === 'month' ? monthOf.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
    : `${fmt.dayMonth(days[0])} – ${fmt.dayMonth(days[6])}`;
  const mgr = isManager();
  const nowLabel = { day: L({ en: 'Today', nl: 'Vandaag' }), week: t('this_week'), month: L({ en: 'This month', nl: 'Deze maand' }) }[view];
  const prevLabel = { day: L({ en: 'Previous day', nl: 'Vorige dag' }), week: t('prev_week'), month: L({ en: 'Previous month', nl: 'Vorige maand' }) }[view];
  const nextLabel = { day: L({ en: 'Next day', nl: 'Volgende dag' }), week: t('next_week'), month: L({ en: 'Next month', nl: 'Volgende maand' }) }[view];
  const viewSwitch = `<div class="ro-views" role="tablist" aria-label="${L({ en: 'Overview', nl: 'Overzicht' })}">${[['day', L({ en: 'Day', nl: 'Dag' })], ['week', L({ en: 'Week', nl: 'Week' })], ['month', L({ en: 'Month', nl: 'Maand' })]]
    .map(([k, label]) => `<button type="button" role="tab" aria-selected="${view === k}" class="${view === k ? 'on' : ''}" data-view="${k}">${label}</button>`).join('')}</div>`;
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('roster_title')}</h1><div class="muted small">${t('roster_sub')}</div></div>
      <div class="page-actions">
        <button type="button" class="btn-sm" id="print-today"><i class="ic ic-printer" aria-hidden="true"></i> ${t('roster_print_today')}</button>
        <details class="export-menu" style="position:relative"><summary class="btn btn-sm"><i class="ic ic-download" aria-hidden="true"></i> ${t('export')} &#9662;</summary>
          <div class="card" style="position:absolute;right:0;top:110%;z-index:10;display:flex;flex-direction:column;gap:6px;min-width:260px;padding:10px">
            <button type="button" class="btn-sm" data-ics="my-week">${t('ics_my_week')}</button>
            <button type="button" class="btn-sm" data-ics="my-month">${t('ics_my_month')}</button>
            ${mgr ? `<button type="button" class="btn-sm" data-ics="team-week">${t('ics_team_week')}</button>
            <button type="button" class="btn-sm" data-ics="team-month">${t('ics_team_month')}</button>
            <button type="button" class="btn-sm" id="csv">${t('roster_csv')}</button>` : ''}
          </div></details></div></div>
    <div class="card">
      <div class="roster-bar">
        <div style="display:flex;gap:6px;align-items:center"><button type="button" class="btn-sm" id="prev" aria-label="${esc(prevLabel)}"><i class="ic ic-prev" aria-hidden="true"></i></button>
          <button type="button" class="btn-sm" id="this">${esc(nowLabel)}</button>
          <button type="button" class="btn-sm" id="next" aria-label="${esc(nextLabel)}"><i class="ic ic-next" aria-hidden="true"></i></button></div>
        <span class="week">${esc(range)}</span>${viewSwitch}</div>
      <div class="tiny muted" style="margin:-4px 0 10px">${t('opening_from_finance')}</div>
      ${mgr && view === 'week' ? `<div class="note ro-fixed" style="margin:0 0 12px">
          <div class="row-split" style="margin-bottom:${templates.length ? '8px' : '0'}"><strong>${t('fixed_shifts')}</strong><a href="#/settings/templates" class="small">${t('fixed_manage')}</a></div>
          ${templates.length ? `<div class="tpl-chips">${templates.map((tp) => `<span class="tpl-chip" draggable="true" data-tpl="${tp.id}">${esc(tp.name)} · ${fmt.time(tp.start_time)}–${fmt.time(tp.end_time)}</span>`).join('')}</div>
          <div class="tiny muted" style="margin-top:6px">${t('fixed_drag_hint')}</div>` : `<div class="tiny muted">${t('fixed_none')}</div>`}</div>` : ''}
      ${view === 'month' ? monthView(days, staff, today) : view === 'day' ? dayView(days, staff, mgr, today) : `<div class="roster-wrap"><table class="roster"><thead><tr><th>${t('staff_member')}</th>
        ${days.map((d) => { const c = calendar[isoOf(d)]; const closed = c && !c.is_open;
          return `<th class="${isoOf(d) === today ? 'today' : ''} ${closed ? 'closed' : ''}">${esc(fmt.weekdayShort(d))}<br><span class="small" style="font-weight:500">${d.getDate()}/${d.getMonth() + 1}</span>
          ${noteOf(c) ? `<span class="day-note">${esc(noteOf(c))}</span>` : ''}${evLabels(isoOf(d)) ? `<span class="ro-evs">${evLabels(isoOf(d))}</span>` : ''}
          ${mgr ? `<button type="button" class="day-toggle ${closed ? 'is-closed' : 'is-open'}" data-day="${isoOf(d)}" title="${t(closed ? 'day_click_open' : 'day_click_close')}">${t(closed ? 'closed' : 'open')}</button>
            <button type="button" class="day-note-btn ${c && c.note ? 'has-note' : ''}" data-dnote="${isoOf(d)}" title="${t(c && c.note ? 'day_note_edit' : 'day_note_add')}" aria-label="${t(c && c.note ? 'day_note_edit' : 'day_note_add')}"><i class="ic ic-pencil" aria-hidden="true"></i></button>`
            : closed && !noteOf(c) ? `<span class="day-closed">${t('closed')}</span>` : ''}</th>`; }).join('')}</tr></thead>
        <tbody>${!staff.length ? `<tr><td colspan="8" class="empty">${t('roster_no_staff')}</td></tr>` : staff.map((p, i) => `<tr ${mgr ? `data-row="${p.id}"` : ''}><td>${mgr ? `<span class="row-handle" draggable="true" data-handle="${p.id}" title="${t('drag_to_reorder')}">&#10303;</span>` : ''}<span class="ro-who">${avatar(p.full_name, p.photo_url, 'sm')}<strong>${esc(p.full_name)}</strong></span>
            ${mgr ? `<span class="row-move"><button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${t('move_up')}">&#9650;</button><button type="button" data-down="${i}" ${i === staff.length - 1 ? 'disabled' : ''} aria-label="${t('move_down')}">&#9660;</button></span>` : ''}</td>
          ${days.map((d) => { const ds = isoOf(d); const here = shifts.filter((s) => s.staff_id === p.id && s.shift_date === ds);
            const closed = calendar[ds] && !calendar[ds].is_open;
            return `<td class="${closed ? 'closed' : ''}" ${mgr ? `data-cell="${p.id}|${ds}"` : ''}>${here.map(chip).join('')}${mgr ? `<button type="button" class="add-shift" data-add="${p.id}|${ds}" aria-label="${t('roster_add')}">+</button>` : ''}</td>`; }).join('')}</tr>`).join('')}
        </tbody>
        <tfoot><tr><td class="small muted">${t('hours_planned_day')}</td>${days.map((d) => { const ds = isoOf(d); const h = shifts.filter((x) => x.shift_date === ds).reduce((a, x) => a + shiftHours(x), 0);
          const closed = calendar[ds] && !calendar[ds].is_open; return `<td class="day-total ${closed ? 'closed' : ''}">${h ? `${fmt.num(h, 1)} ${t('h')}` : ''}</td>`; }).join('')}</tr></tfoot></table></div>
      ${weekList(days, today)}`}</div>
    ${hoursOverview(staff, checkins, days)}`;

  const step = (n) => {
    if (view === 'month') cursor = new Date(monthOf.getFullYear(), monthOf.getMonth() + n, 1, 12);
    else cursor = addDays(view === 'day' ? new Date(`${mDay}T12:00:00`) : weekStart, view === 'day' ? n : 7 * n);
    weekStart = null; renderRoster();
  };
  $('#prev').onclick = () => step(-1);
  $('#next').onclick = () => step(1);
  $('#this').onclick = () => { cursor = new Date(); cursor.setHours(12, 0, 0, 0); weekStart = null; renderRoster(); };
  $$('[data-view]').forEach((b) => (b.onclick = () => {
    if (view === b.dataset.view) return;
    // keep the same moment: from a day or week to its month, from a month to its first week (or today, if it is this month)
    if (view === 'day' && mDay) cursor = new Date(`${mDay}T12:00:00`);
    else if (view === 'month') { const now = new Date(); cursor = now.getMonth() === monthOf.getMonth() && now.getFullYear() === monthOf.getFullYear() ? now : new Date(monthOf); cursor.setHours(12, 0, 0, 0); }
    view = b.dataset.view; try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ }
    weekStart = null; renderRoster();
  }));
  // a day in the month or week list opens that day
  $$('[data-open-day]').forEach((b) => (b.onclick = (e) => { if (e.target.closest('a')) return; cursor = new Date(`${b.dataset.openDay}T12:00:00`); view = 'day'; try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ } weekStart = null; renderRoster(); }));
  $('#print-today').onclick = printToday;
  $$('[data-ics]').forEach((b) => (b.onclick = () => exportIcs(b.dataset.ics)));
  const csv = $('#csv'); if (csv) csv.onclick = exportCsv;
  $$('[data-mday]').forEach((b) => (b.onclick = () => { mDay = b.dataset.mday; cursor = new Date(`${mDay}T12:00:00`); draw(days, checkins); }));
  if (!mgr) return;
  $$('[data-add]').forEach((b) => (b.onclick = () => { const [pid, ds] = b.dataset.add.split('|'); openShift(null, pid, ds); }));
  $$('[data-shift]').forEach((b) => (b.onclick = () => openShift(shifts.find((s) => s.id === b.dataset.shift))));
  // open or close a day with one click (stored in Wintertuin Finance, same as the opening hours there)
  $$('[data-day]').forEach((b) => (b.onclick = async () => {
    const ds = b.dataset.day; const c = calendar[ds] || {};
    b.disabled = true;
    try {
      check(await sb.rpc('fin_set_day_open', { p_day: ds, p_open: !c.is_open, p_note: c.note || null }));
      toast(t(c.is_open ? 'day_now_closed' : 'day_now_open', { d: fmt.dayMonth(new Date(`${ds}T12:00:00`)) }));
      renderRoster();
    } catch (err) { toastError(err); b.disabled = false; }
  }));
  $$('[data-dnote]').forEach((b) => (b.onclick = async () => {
    const ds = b.dataset.dnote; const c = calendar[ds] || {};
    const v = await editDayNote(fmt.dayMonth(new Date(`${ds}T12:00:00`)), c.note);
    if (v === null) return;
    try { check(await sb.rpc('fin_set_day_open', { p_day: ds, p_open: !!c.is_open, p_note: v || null })); toast(t('saved')); renderRoster(); }
    catch (err) { toastError(err); }
  }));
  // order of people: drag the handle, or the arrows on a phone
  const saveOrder = async (ids) => {
    try {
      await Promise.all(ids.map((id, i) => {
        const prof = state.profiles.find((x) => x.id === id);
        if ((prof.sort_order || 0) === (i + 1) * 10) return null;
        prof.sort_order = (i + 1) * 10;
        return sb.from('profiles').update({ sort_order: prof.sort_order }).eq('id', id).then(check);
      }));
      renderRoster();
    } catch (err) { toastError(err); }
  };
  const order = staff.map((x) => x.id);
  const move = (from, to) => { const ids = [...order]; const [x] = ids.splice(from, 1); ids.splice(to, 0, x); saveOrder(ids); };
  $$('[data-up]').forEach((b) => (b.onclick = () => move(Number(b.dataset.up), Number(b.dataset.up) - 1)));
  $$('[data-down]').forEach((b) => (b.onclick = () => move(Number(b.dataset.down), Number(b.dataset.down) + 1)));
  $$('[data-handle]').forEach((h) => (h.ondragstart = (e) => {
    dragged = { type: 'row', id: h.dataset.handle };
    e.dataTransfer.setData('text/plain', JSON.stringify(dragged)); e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(h.closest('tr'), 20, 20);
  }));
  $$('[data-row]').forEach((tr) => {
    const isRow = () => dragged && dragged.type === 'row';
    tr.addEventListener('dragover', (e) => { if (!isRow()) return; e.preventDefault(); tr.classList.add('row-drop'); });
    tr.addEventListener('dragleave', () => tr.classList.remove('row-drop'));
    tr.addEventListener('drop', (e) => {
      if (!isRow()) return;
      e.preventDefault(); e.stopPropagation(); tr.classList.remove('row-drop');
      const from = order.indexOf(dragged.id); const to = order.indexOf(tr.dataset.row); dragged = null;
      if (from >= 0 && to >= 0 && from !== to) move(from, to);
    });
  });
  // drag and drop
  $$('[data-tpl]').forEach((el) => (el.ondragstart = (e) => { dragged = { type: 'template', id: el.dataset.tpl }; e.dataTransfer.setData('text/plain', JSON.stringify(dragged)); e.dataTransfer.effectAllowed = 'copy'; }));
  $$('[data-shift]').forEach((el) => (el.ondragstart = (e) => { dragged = { type: 'shift', id: el.dataset.shift }; e.dataTransfer.setData('text/plain', JSON.stringify(dragged)); e.dataTransfer.effectAllowed = 'move'; }));
  $$('[data-cell]').forEach((td) => {
    td.ondragover = (e) => { if (dragged && dragged.type === 'row') return; e.preventDefault(); td.classList.add('drop-ok'); };
    td.ondragleave = () => td.classList.remove('drop-ok');
    td.ondrop = async (e) => {
      e.preventDefault(); td.classList.remove('drop-ok');
      let p = dragged;
      try { const raw = e.dataTransfer.getData('text/plain'); if (raw) p = JSON.parse(raw); } catch { /* use fallback */ }
      dragged = null;
      if (!p || p.type === 'row') return;
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

// Phone view: one day at a time, picked from a strip of seven day buttons. No sideways scrolling.
function mobileView(days, staff, mgr, today) {
  const isos = days.map(isoOf);
  if (!isos.includes(mDay)) mDay = isos.includes(today) ? today : isos[0];
  const ds = mDay; const c = calendar[ds]; const closed = c && !c.is_open;
  const tabs = days.map((d) => { const iso = isoOf(d); const cc = calendar[iso]; const n = shifts.some((s) => s.shift_date === iso);
    return `<button type="button" class="day-tab ${iso === ds ? 'on' : ''} ${iso === today ? 'today' : ''} ${cc && !cc.is_open ? 'closed' : ''}" data-mday="${iso}">
      ${esc(fmt.weekdayShort(d))}<b>${d.getDate()}</b><span class="dot ${n ? '' : 'none'}"></span>${weekEvents.some((e) => e.event_date === iso) ? '<span class="ev-flag" aria-hidden="true">&#9733;</span>' : ''}</button>`; }).join('');
  const dayShifts = shifts.filter((s) => s.shift_date === ds);
  const working = staff.filter((p) => dayShifts.some((s) => s.staff_id === p.id))
    .sort((a, b) => toMin(dayShifts.find((s) => s.staff_id === a.id).start_time) - toMin(dayShifts.find((s) => s.staff_id === b.id).start_time));
  const off = staff.filter((p) => !working.includes(p));
  const row = (p) => { const here = dayShifts.filter((s) => s.staff_id === p.id);
    return `<div class="m-row ${p.id === state.me.id ? 'me' : ''}"><strong>${esc(p.full_name)}</strong>
      <div class="m-shifts">${here.map(chip).join('')}${mgr ? `<button type="button" class="add-shift" data-add="${p.id}|${ds}" aria-label="${t('roster_add')}">+</button>` : ''}</div></div>`; };
  return `<div class="roster-m">
    <div class="day-tabs">${tabs}</div>
    <div class="m-day-head"><strong>${esc(fmt.dateLong(ds))}</strong>
      <span>${mgr ? `<button type="button" class="day-toggle ${closed ? 'is-closed' : 'is-open'}" data-day="${ds}">${t(closed ? 'closed' : 'open')}</button>
        <button type="button" class="day-note-btn ${c && c.note ? 'has-note' : ''}" data-dnote="${ds}" aria-label="${t(c && c.note ? 'day_note_edit' : 'day_note_add')}"><i class="ic ic-pencil" aria-hidden="true"></i></button>`
        : closed ? `<span class="day-closed">${t('closed')}</span>` : ''}</span></div>
    ${noteOf(c) ? `<div class="day-note m-note">${esc(noteOf(c))}</div>` : ''}
    ${evLabels(ds) ? `<div class="ro-evs m-evs">${evLabels(ds)}</div>` : ''}
    ${working.length ? working.map(row).join('') : `<div class="muted small" style="padding:12px 0">${t('m_nobody')}</div>`}
    ${mgr && off.length ? `<div class="m-sub">${t('m_not_planned')}</div>${off.map(row).join('')}` : ''}
  </div>`;
}

function chip(s) {
  const mine = s.staff_id === state.me.id;
  const mgr = isManager();
  return `<${mgr ? 'button type="button"' : 'div'} class="shift-chip ${sectionClass(s.section)} ${mine ? 'mine' : ''}" ${mgr ? `draggable="true" data-shift="${s.id}"` : ''}>
    ${fmt.time(s.start_time)}–${fmt.time(s.end_time)}${s.section ? `<span class="sec">${esc(s.section)}</span>` : ''}</${mgr ? 'button' : 'div'}>`;
}

function hoursOverview(staff, allCheckins, days) {
  const list = isManager() ? staff : staff.filter((p) => p.id === state.me.id);
  if (!list.length) return '';
  // in the month view: only the days of that month (the grid also shows the edges of the months around it)
  const inMonth = (ds) => view !== 'month' || ds.slice(0, 7) === isoOf(monthOf).slice(0, 7);
  const shifts = allShifts().filter((s) => inMonth(s.shift_date));
  const checkins = allCheckins.filter((c) => inMonth(isoOf(new Date(c.check_in_at))));
  return `<h2 class="section-title">${view === 'month' ? L({ en: 'Hours this month', nl: 'Uren deze maand' }) : t('hours_week')}</h2>
    <div class="card"><div class="small muted" style="margin-bottom:8px">${t('hours_week_sub')}</div><div class="table-wrap"><table class="num-table">
    <thead><tr><th>${t('staff_member')}</th><th>${t('planned')}</th><th>${t('worked')}</th></tr></thead><tbody>
    ${list.map((p) => {
      const planned = shifts.filter((s) => s.staff_id === p.id).reduce((a, s) => a + shiftHours(s), 0);
      const worked = checkins.filter((c) => c.staff_id === p.id && c.check_out_at).reduce((a, c) => a + (new Date(c.check_out_at) - new Date(c.check_in_at)) / 3600000, 0);
      return `<tr><td>${esc(p.full_name)}</td><td>${fmt.num(planned, 1)} ${t('h')}</td><td>${fmt.num(worked, 1)} ${t('h')}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
}

const allShifts = () => shifts;

// Day view: the strip of seven days, then who works when, with a time line so you see the whole day at a glance
function dayView(days, staff, mgr, today) {
  const ds = mDay;
  const dayShifts = shifts.filter((s) => s.shift_date === ds);
  let lo = 9 * 60; let hi = 17 * 60;
  dayShifts.forEach((s) => { lo = Math.min(lo, toMin(s.start_time)); hi = Math.max(hi, toMin(s.end_time)); });
  lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
  const span = Math.max(60, hi - lo); const pct = (m) => `${((m - lo) / span) * 100}%`;
  const hours = []; for (let m = lo; m <= hi; m += span > 12 * 60 ? 120 : 60) hours.push(m);
  const tl = dayShifts.length ? `<div class="ro-tl" aria-hidden="true"><div class="ro-tl-scale">${hours.map((m) => `<span style="left:${pct(m)}">${toTime(m).slice(0, 2)}</span>`).join('')}</div>
    ${staff.filter((p) => dayShifts.some((s) => s.staff_id === p.id)).sort((a, b) => toMin(dayShifts.find((s) => s.staff_id === a.id).start_time) - toMin(dayShifts.find((s) => s.staff_id === b.id).start_time))
      .map((p) => `<div class="ro-tl-row ${p.id === state.me.id ? 'me' : ''}"><span class="ro-tl-name">${esc(firstName(p.full_name))}</span><span class="ro-tl-track">${hours.map((m) => `<i style="left:${pct(m)}"></i>`).join('')}
        ${dayShifts.filter((s) => s.staff_id === p.id).map((s) => `<b class="${sectionClass(s.section)}" style="left:${pct(toMin(s.start_time))};width:calc(${pct(toMin(s.end_time))} - ${pct(toMin(s.start_time))})"></b>`).join('')}</span></div>`).join('')}
    </div>` : '';
  return `<div class="roster-m ro-day">${mobileView(days, staff, mgr, today).replace('<div class="roster-m">', '').replace(/<\/div>\s*$/, '')}${tl}</div>`;
}

// Week on a phone: the seven days under each other, with who works when
function weekList(days, today) {
  return `<div class="ro-wk">${days.map((d) => { const ds = isoOf(d); const c = calendar[ds]; const closed = c && !c.is_open;
    const here = shifts.filter((s) => s.shift_date === ds).sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    return `<button type="button" class="ro-wk-day ${ds === today ? 'today' : ''} ${closed ? 'closed' : ''}" data-open-day="${ds}">
      <span class="ro-wk-date"><span>${esc(fmt.weekdayShort(d))}</span><b>${d.getDate()}</b></span>
      <span class="ro-wk-body">${noteOf(c) ? `<span class="day-note">${esc(noteOf(c))}</span>` : ''}${weekEvents.filter((e) => e.event_date === ds).map((e) => `<span class="ro-wk-ev">&#9733; ${esc(e.title)}</span>`).join('')}
        ${here.length ? here.map((s) => `<span class="ro-wk-s ${sectionClass(s.section)} ${s.staff_id === state.me.id ? 'mine' : ''}"><strong>${esc(firstName(s.profiles ? s.profiles.full_name : ''))}</strong> ${fmt.time(s.start_time)}–${fmt.time(s.end_time)}</span>`).join('')
          : `<span class="muted small">${closed ? t('closed') : t('m_nobody')}</span>`}</span></button>`; }).join('')}</div>`;
}

// Month: a calendar with who works each day. Tap a day to open it.
function monthView(days, staff, today) {
  const month = isoOf(monthOf).slice(0, 7);
  const head = days.slice(0, 7).map((d) => `<div class="ro-mo-wd">${esc(fmt.weekdayShort(d))}</div>`).join('');
  const cells = days.map((d) => { const ds = isoOf(d); const c = calendar[ds]; const closed = c && !c.is_open;
    const here = shifts.filter((s) => s.shift_date === ds).sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    const ev = weekEvents.filter((e) => e.event_date === ds);
    const mine = here.some((s) => s.staff_id === state.me.id);
    const label = `${fmt.dateLong(ds)}: ${here.length} ${L({ en: here.length === 1 ? 'shift' : 'shifts', nl: here.length === 1 ? 'dienst' : 'diensten' })}${closed ? `, ${t('closed')}` : ''}`;
    return `<button type="button" class="ro-mo-day ${ds.slice(0, 7) !== month ? 'out' : ''} ${ds === today ? 'today' : ''} ${closed ? 'closed' : ''} ${mine ? 'mine' : ''}" data-open-day="${ds}" aria-label="${esc(label)}">
      <span class="ro-mo-top"><b>${d.getDate()}</b>${ev.length ? `<span class="ro-mo-ev" title="${esc(ev.map((e) => e.title).join(', '))}">&#9733;</span>` : ''}${closed ? `<span class="ro-mo-closed">${t('closed')}</span>` : ''}</span>
      ${noteOf(c) ? `<span class="ro-mo-note">${esc(noteOf(c))}</span>` : ''}
      <span class="ro-mo-list">${here.slice(0, 4).map((s) => `<span class="ro-mo-s ${sectionClass(s.section)} ${s.staff_id === state.me.id ? 'mine' : ''}">${fmt.time(s.start_time)} ${esc(firstName(s.profiles ? s.profiles.full_name : ''))}</span>`).join('')}${here.length > 4 ? `<span class="ro-mo-more">+${here.length - 4}</span>` : ''}</span>
      <span class="ro-mo-dots">${here.slice(0, 6).map((s) => `<i class="${sectionClass(s.section)} ${s.staff_id === state.me.id ? 'mine' : ''}"></i>`).join('')}${here.length > 6 ? '<em>+</em>' : ''}</span>
    </button>`; }).join('');
  return `<div class="ro-mo"><div class="ro-mo-grid">${head}${cells}</div>
    <div class="tiny muted ro-mo-hint">${L({ en: 'Tap a day to see who works when.', nl: 'Tik op een dag om te zien wie wanneer werkt.' })}</div></div>`;
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
  const base = view === 'month' ? monthOf : cursor;
  const from = span === 'week' ? weekStart : new Date(base.getFullYear(), base.getMonth(), 1, 12);
  const to = span === 'week' ? addDays(weekStart, 6) : new Date(base.getFullYear(), base.getMonth() + 1, 0, 12);
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

// Small popup to add, change or remove the note of one day (themed evening, private event, ...)
function editDayNote(dayLabel, current) {
  return new Promise((resolve) => {
    openModal(`<h2>${t('day_note_title', { d: esc(dayLabel) })}</h2><form id="nf">
      <div class="field"><input name="v" maxlength="60" value="${esc(current || '')}" placeholder="${t('day_note_ph')}"></div>
      <div class="tiny muted" style="margin:-6px 0 12px">${t('day_note_hint')}</div>
      <div class="modal-actions" style="justify-content:space-between">
        <div>${current ? `<button type="button" class="btn-ghost btn-danger" id="nclear">${t('day_note_clear')}</button>` : ''}</div>
        <div style="display:flex;gap:8px"><button type="button" id="ncancel">${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></div></form>`,
    (card, close) => {
      const inp = card.querySelector('[name=v]'); inp.focus(); inp.select();
      card.querySelector('#nf').onsubmit = (e) => { e.preventDefault(); close(); resolve(inp.value.trim()); };
      card.querySelector('#ncancel').onclick = () => { close(); resolve(null); };
      const clr = card.querySelector('#nclear'); if (clr) clr.onclick = () => { close(); resolve(''); };
    });
  });
}
