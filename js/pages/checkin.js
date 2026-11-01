// Clock in and out: one big button, plus your own recent history.
import { state, app, fmt, toast, toastError, $, isManager } from '../core.js';
import { t, lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { setDevicePin } from '../pinlock.js';

const L = (o) => o[lang()] || o.en;

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
      </tbody></table></div>`}</div>
    <h2 class="section-title">${L({ en: 'Your PIN', nl: 'Je pincode' })}</h2>
    <div class="card pin-card"><p class="muted" style="margin-top:0">${L({ en: 'Four digits, only you know them. They open the app on this device and clock you in on the tablet at the pass.',
      nl: 'Vier cijfers, alleen jij kent ze. Ze openen de app op dit toestel en klokken je in op de tablet bij de pass.' })}</p>
      <form id="pin-form" class="pin-row" autocomplete="off"><input id="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" aria-label="PIN">
        <button type="submit" class="btn-primary" id="pin-save">${L({ en: 'Save PIN', nl: 'PIN opslaan' })}</button></form>
      <div class="small muted" id="pin-state"></div>
      ${isManager() ? `<a class="btn" href="#/kiosk" style="margin-top:14px"><i class="ic ic-tablet" aria-hidden="true"></i> ${L({ en: 'Open clock-in tablet mode on this device', nl: 'Inkloktablet openen op dit apparaat' })}</a>` : ''}</div>`;
  sb.rpc('has_kiosk_pin').then(({ data, error }) => {
    const el = $('#pin-state'); if (!el) return;
    if (error) return;
    el.textContent = data ? L({ en: 'You have a PIN. Saving a new one replaces it.', nl: 'Je hebt een PIN. Een nieuwe opslaan vervangt hem.' }) : L({ en: 'No PIN yet.', nl: 'Nog geen PIN.' });
  });
  $('#pin-form').onsubmit = async (e) => {
    e.preventDefault();
    const v = $('#pin').value.trim();
    if (!/^[0-9]{4}$/.test(v)) { toastError(new Error(L({ en: 'The PIN is 4 digits.', nl: 'De PIN is 4 cijfers.' }))); return; }
    try { await setDevicePin({ id: state.me.id, full_name: state.me.full_name }, v);
      try { check(await sb.rpc('set_my_kiosk_pin', { p_pin: v })); } catch { /* tablet not switched on yet: the PIN still works for signing in */ }
      $('#pin').value = ''; toast(L({ en: 'PIN saved', nl: 'PIN opgeslagen' }));
      $('#pin-state').textContent = L({ en: 'You have a PIN. Saving a new one replaces it.', nl: 'Je hebt een PIN. Een nieuwe opslaan vervangt hem.' }); }
    catch (err) { toastError(err); }
  };
  $('#toggle').onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (openRow) check(await sb.from('checkins').update({ check_out_at: new Date().toISOString() }).eq('id', openRow.id));
      else check(await sb.from('checkins').insert({ staff_id: state.me.id, check_in_at: new Date().toISOString() }));
      renderCheckin();
    } catch (err) { toastError(err); e.target.disabled = false; }
  };
}
