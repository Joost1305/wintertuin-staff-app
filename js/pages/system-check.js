// Settings > System check (same file in the team app and in Wintertuin Finance).
// Every morning a check tests both apps: database, websites, signing in, photos, account functions,
// weather, events in the calendar. It also lists the important changes of the last 24 hours and the
// gaps in the data. Green = works, orange = worth a look, red = broken (GitHub then e-mails).
import { esc, fmt, toast, toastError, $, $$ } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';

const DOT = { ok: 'sc-ok', warn: 'sc-warn', fail: 'sc-fail' };
const dot = (s) => `<span class="sc-dot ${DOT[s] || ''}" aria-label="${esc(t('sc_s_' + s))}"></span>`;
const ENTITY = {
  events: 'sc_e_events', fin_suppliers: 'sc_e_suppliers', fin_staff: 'sc_e_staff', fin_staff_rates: 'sc_e_rates', fin_closures: 'sc_e_closures',
  fin_opening_hours: 'sc_e_hours', fin_app_users: 'sc_e_users', fin_targets: 'sc_e_targets', fin_fixed_costs: 'sc_e_fixed', fin_revenue_streams: 'sc_e_streams',
  fin_purchase_categories: 'sc_e_categories', fin_vat_rates: 'sc_e_vat', fin_restaurants: 'sc_e_restaurant',
};
const ACTION = { insert: 'sc_a_add', create: 'sc_a_add', update: 'sc_a_change', delete: 'sc_a_remove', admin_remove: 'sc_a_remove', admin_create: 'sc_a_add', admin_update: 'sc_a_change', admin_reset_password: 'sc_a_reset' };
const isId = (s) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(s || ''));

export async function renderSystemCheck(el, pick) {
  el.innerHTML = `<div class="card"><span class="spinner"></span></div>`;
  let rows = [];
  try { rows = check(await sb.from('system_checks').select('*').order('run_at', { ascending: false }).limit(30)) || []; } catch (e) { toastError(e); el.innerHTML = ''; return; }
  const cur = rows.find((r) => r.id === pick) || rows[0];
  const head = `<div class="row-split" style="margin-bottom:6px;gap:10px;flex-wrap:wrap"><h2 style="margin:0">${t('sc_title')}</h2>
      <button type="button" class="btn-primary btn-sm" id="sc-run">${t('sc_run')}</button></div>
    <p class="small muted" style="margin-top:0">${t('sc_sub')}</p>`;
  if (!cur) { el.innerHTML = `<div class="card">${head}<div class="empty">${t('sc_none')}</div></div>`; bindRun(); return; }
  const gaps = cur.gaps || [];
  const changes = cur.changes || [];
  el.innerHTML = `<div class="card">${head}
      <div class="sc-head">${dot(cur.status)} <strong>${t('sc_overall_' + cur.status)}</strong>
        <span class="small muted">· ${esc(fmt.dateTime(cur.run_at))} · ${t(cur.trigger === 'manual' ? 'sc_manual' : 'sc_scheduled')}</span></div>
      <ul class="sc-list">${(cur.checks || []).map((c) => `<li>${dot(c.status)}<div><strong>${t('sc_k_' + c.key)}</strong>
        <div class="small muted">${esc(c.detail)}${c.ms ? ` · ${fmt.num(c.ms)} ms` : ''}</div></div></li>`).join('')}</ul></div>
    <div class="card"><h2>${t('sc_gaps')}</h2>${gaps.length ? `<ul class="sc-list">${gaps.map((g) => `<li>${dot('warn')}<div>
        <strong>${t('sc_g_' + g.key)}</strong>${g.count ? ` (${g.count})` : ''}
        <div class="small muted">${esc((g.items || []).slice(0, 12).map((x) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? fmt.date(x) : x)).join(', '))}${(g.items || []).length > 12 ? ' …' : ''}</div>
        <div class="tiny muted">${t('sc_gh_' + g.key)}</div></div></li>`).join('')}</ul>` : `<div class="empty small">${t('sc_no_gaps')}</div>`}</div>
    <div class="card"><h2>${t('sc_changes')}</h2>
      <p class="small muted" style="margin-top:0">${t('sc_changes_sub', { from: esc(fmt.dateTime(cur.window_from)), to: esc(fmt.dateTime(cur.window_to)) })}</p>
      ${changes.length ? `<ul class="sc-changes">${changes.slice(0, 60).map((c) => `<li><span class="tiny muted">${esc(fmt.dateTime(c.at))}</span>
        <span><strong>${esc(c.user || '?')}</strong> ${t(ACTION[c.action] || 'sc_a_change')} · ${ENTITY[c.entity] ? t(ENTITY[c.entity]) : esc(c.entity)}${c.name && !isId(c.name) ? `: ${esc(/^\d{4}-\d{2}-\d{2}$/.test(c.name) ? fmt.date(c.name) : c.name)}` : ''}${c.version ? ` (v${c.version})` : ''}
        <span class="tag sc-app">${c.app === 'team' ? 'Team' : 'Finance'}</span></span></li>`).join('')}</ul>
        ${changes.length > 60 ? `<div class="tiny muted">${t('sc_more', { n: changes.length - 60 })}</div>` : ''}` : `<div class="empty small">${t('sc_no_changes')}</div>`}</div>
    <div class="card"><h2>${t('sc_history')}</h2><div class="table-wrap"><table><tbody>
      ${rows.map((r) => {
        const f = (r.checks || []).filter((c) => c.status === 'fail').length; const w = (r.checks || []).filter((c) => c.status === 'warn').length;
        return `<tr class="${r.id === cur.id ? 'sc-current' : ''}"><td style="white-space:nowrap">${dot(r.status)} ${esc(fmt.dateTime(r.run_at))}</td>
          <td class="small">${f ? `<strong>${t('sc_n_fail', { n: f })}</strong> ` : ''}${w ? t('sc_n_warn', { n: w }) : ''}${!f && !w ? t('sc_all_ok') : ''}
            · ${t('sc_n_gaps', { n: (r.gaps || []).length })}</td>
          <td style="text-align:right">${r.id === cur.id ? '' : `<button type="button" class="btn-sm btn-ghost" data-sc="${r.id}">${t('sc_open')}</button>`}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  bindRun();
  $$('[data-sc]', el).forEach((b) => (b.onclick = () => renderSystemCheck(el, Number(b.dataset.sc))));

  function bindRun() {
    $('#sc-run', el).onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = `<span class="spinner"></span> ${t('sc_running')}`;
      try {
        const { error } = await sb.functions.invoke('system-check', { body: {} });
        if (error) throw error;
        toast(t('sc_done'));
      } catch (err) { toastError(err); }
      renderSystemCheck(el);
    };
  }
}
