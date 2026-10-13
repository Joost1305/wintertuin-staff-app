// Shift swap: offer your shift, a colleague takes it over, a manager approves.
// Only after approval does the roster change.
import { state, isManager, app, esc, fmt, toastError, todayIso, $$, promptDialog } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';

const badgeChanged = () => window.dispatchEvent(new Event('wt:badge'));

// Number shown on the Swap tab: managers see swaps waiting for approval,
// staff see open offers from colleagues plus their own decided requests.
export async function swapBadgeCount() {
  if (!state.me) return 0;
  if (isManager()) {
    const { count } = await sb.from('shift_swap_requests').select('id', { count: 'exact', head: true }).eq('status', 'claimed');
    return count || 0;
  }
  const [{ count: open }, { count: decided }] = await Promise.all([
    sb.from('shift_swap_requests').select('id', { count: 'exact', head: true }).eq('status', 'open').neq('requested_by', state.me.id),
    sb.from('shift_swap_requests').select('id', { count: 'exact', head: true }).eq('requested_by', state.me.id).in('status', ['approved', 'rejected']),
  ]);
  return (open || 0) + (decided || 0);
}

const shiftLine = (s) => (s ? `${fmt.date(s.shift_date)} · ${fmt.time(s.start_time)}–${fmt.time(s.end_time)}${s.section ? ` · ${esc(s.section)}` : ''}` : t('shift'));

export async function renderSwap() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [mine, requests] = await Promise.all([
    check(await sb.from('shifts').select('*').eq('staff_id', state.me.id).gte('shift_date', todayIso()).order('shift_date').limit(30)),
    check(await sb.from('shift_swap_requests')
      .select('*, shifts(shift_date, start_time, end_time, section, staff_id), requester:requested_by(full_name), claimer:claimed_by(full_name)')
      .order('created_at', { ascending: false }).limit(40)),
  ]);
  const reqs = requests || [];
  const open = reqs.filter((r) => r.status === 'open' && r.requested_by !== state.me.id);
  const own = reqs.filter((r) => r.requested_by === state.me.id);
  const pending = reqs.filter((r) => r.status === 'claimed');
  const cardRow = (left, right) => `<div class="card list-card"><div class="row-split"><div>${left}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${right}</div></div></div>`;

  app().innerHTML = `
    <div class="page-head"><div><h1>${t('swap_title')}</h1><div class="muted small">${t('swap_sub')}</div></div></div>
    ${isManager() ? `<h2 class="section-title" style="margin-top:0">${t('swap_to_approve')}</h2>
      ${!pending.length ? `<div class="card empty">${t('swap_nothing_approve')}</div>` : pending.map((r) => cardRow(
        `${shiftLine(r.shifts)}<div class="small muted">${t('swap_from_to', { a: esc(r.requester ? r.requester.full_name : '?'), b: esc(r.claimer ? r.claimer.full_name : '?') })}</div>${r.reason ? `<div class="small muted">${esc(r.reason)}</div>` : ''}`,
        `<button type="button" class="btn-primary btn-sm" data-decide="${r.id}|approved">${t('approve')}</button><button type="button" class="btn-sm btn-danger" data-decide="${r.id}|rejected">${t('reject')}</button>`)).join('')}` : ''}
    <h2 class="section-title">${t('swap_my_shifts')}</h2>
    ${!(mine || []).length ? `<div class="card empty">${t('swap_no_shifts')}</div>` : mine.map((s) => {
      const already = reqs.some((r) => r.shift_id === s.id && !['rejected', 'cancelled'].includes(r.status));
      return cardRow(shiftLine(s), already ? `<span class="tag open">${t('swap_offered')}</span>` : `<button type="button" class="btn-sm" data-offer="${s.id}">${t('swap_offer')}</button>`);
    }).join('')}
    <h2 class="section-title">${t('swap_open')}</h2>
    ${!open.length ? `<div class="card empty">${t('swap_none_open')}</div>` : open.map((r) => cardRow(
      `${shiftLine(r.shifts)}<div class="small muted">${t('swap_offered_by', { n: esc(r.requester ? r.requester.full_name : '?') })}</div>${r.reason ? `<div class="small muted">${esc(r.reason)}</div>` : ''}`,
      `<button type="button" class="btn-primary btn-sm" data-claim="${r.id}">${t('swap_take')}</button>`)).join('')}
    <h2 class="section-title">${t('swap_my_requests')}</h2>
    ${!own.length ? `<div class="card empty">${t('swap_none_mine')}</div>` : own.map((r) => cardRow(
      `${shiftLine(r.shifts)}${r.claimer ? `<div class="small muted">${t('swap_taken_by', { n: esc(r.claimer.full_name) })}</div>` : ''}`,
      `<span class="tag ${r.status}">${t('swap_status_' + r.status)}</span>`)).join('')}`;

  $$('[data-offer]').forEach((b) => (b.onclick = async () => {
    const res = await promptDialog(t('swap_reason'), t('optional'));
    if (!res) return;
    try {
      check(await sb.from('shift_swap_requests').insert({ shift_id: b.dataset.offer, requested_by: state.me.id, reason: res.value || null, status: 'open' }));
      badgeChanged(); renderSwap();
    } catch (e) { toastError(e); }
  }));
  $$('[data-claim]').forEach((b) => (b.onclick = async () => {
    try {
      check(await sb.from('shift_swap_requests').update({ claimed_by: state.me.id, status: 'claimed' }).eq('id', b.dataset.claim));
      badgeChanged(); renderSwap();
    } catch (e) { toastError(e); }
  }));
  $$('[data-decide]').forEach((b) => (b.onclick = async () => {
    const [id, decision] = b.dataset.decide.split('|');
    const r = reqs.find((x) => x.id === id);
    try {
      check(await sb.from('shift_swap_requests').update({ status: decision, decided_at: new Date().toISOString(), decided_by: state.me.id }).eq('id', id));
      if (decision === 'approved' && r && r.claimed_by) check(await sb.from('shifts').update({ staff_id: r.claimed_by }).eq('id', r.shift_id));
      badgeChanged(); renderSwap();
    } catch (e) { toastError(e); }
  }));
}
