// Clock in and out: one big button, plus your own recent history.
import { state, app, fmt, toastError, $ } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';

export async function renderCheckin() {
  app().className = 'app narrow';
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [openRow, history] = await Promise.all([
    check(await sb.from('checkins').select('*').eq('staff_id', state.me.id).is('check_out_at', null).order('check_in_at', { ascending: false }).limit(1).maybeSingle()),
    check(await sb.from('checkins').select('*').eq('staff_id', state.me.id).order('check_in_at', { ascending: false }).limit(15)),
  ]);
  const hours = (h) => (h.check_out_at ? fmt.num((new Date(h.check_out_at) - new Date(h.check_in_at)) / 3600000, 1) : '');
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('checkin_title')}</h1><div class="muted small">${t('checkin_sub')}</div></div></div>
    <div class="card checkin-hero">
      <div class="status">${openRow ? t('checked_in_since', { d: fmt.dateTime(openRow.check_in_at) }) : t('not_checked_in')}</div>
      <button type="button" class="btn-xl ${openRow ? 'btn-stop' : 'btn-primary'}" id="toggle">${openRow ? t('check_out') : t('check_in')}</button>
    </div>
    <h2 class="section-title">${t('checkin_recent')}</h2>
    <div class="card">${!(history || []).length ? `<div class="empty">${t('checkin_none')}</div>` : `<div class="table-wrap"><table class="num-table">
      <thead><tr><th>${t('checked_in')}</th><th>${t('checked_out')}</th><th>${t('hours')}</th></tr></thead><tbody>
      ${history.map((h) => `<tr><td>${fmt.dateTime(h.check_in_at)}</td><td>${h.check_out_at ? fmt.dateTime(h.check_out_at) : '–'}</td><td>${hours(h)}</td></tr>`).join('')}
      </tbody></table></div>`}</div>`;
  $('#toggle').onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (openRow) check(await sb.from('checkins').update({ check_out_at: new Date().toISOString() }).eq('id', openRow.id));
      else check(await sb.from('checkins').insert({ staff_id: state.me.id, check_in_at: new Date().toISOString() }));
      renderCheckin();
    } catch (err) { toastError(err); e.target.disabled = false; }
  };
}
