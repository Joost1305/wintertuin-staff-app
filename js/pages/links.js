// Links: recipe database, finance and other reference material. Managers manage them in Settings.
import { isManager, app, esc } from '../core.js';
import { t } from '../i18n.js';
import { sb, check } from '../data.js';

export async function renderLinks() {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const rows = check(await sb.from('resources').select('*').order('sort_order')) || [];
  app().innerHTML = `
    <div class="page-head"><div><h1>${t('links_title')}</h1><div class="muted small">${t('links_sub')}</div></div>
      ${isManager() ? `<div class="page-actions"><a class="btn btn-sm" href="#/settings/links">${t('links_manage')}</a></div>` : ''}</div>
    ${!rows.length ? `<div class="card empty">${t('links_none')}</div>` : ''}
    ${rows.map((r) => `<div class="card list-card"><div class="link-row"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a></div>
      ${r.note ? `<div class="small muted" style="margin-top:4px">${esc(r.note)}</div>` : ''}</div>`).join('')}`;
}
