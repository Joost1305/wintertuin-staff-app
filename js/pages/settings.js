// Settings (managers only): team and accounts, fixed shifts, links, backup and restore.
// Accounts and passwords go through the admin-users edge function, which re-checks that you are a manager.
import { state, isManager, app, esc, fmt, toast, toastError, todayIso, $, $$, openModal, confirmDialog, formHtml, readForm, download, employeeView } from '../core.js';
import { t } from '../i18n.js';
import { sb, check, adminUsers, loadProfiles, setPassword } from '../data.js';

const SECTIONS = [
  { id: 'team', label: 'set_team' },
  { id: 'templates', label: 'set_templates' },
  { id: 'links', label: 'set_links' },
  { id: 'backup', label: 'set_backup' },
  { id: 'password', label: 'set_password' },
];

export async function renderSettings(args = []) {
  if (!isManager()) { location.hash = '#/sops'; return; }
  const narrow = window.matchMedia('(max-width: 820px)').matches;
  const current = SECTIONS.find((x) => x.id === args[0]) || (narrow ? null : SECTIONS[0]);
  app().innerHTML = `<div class="page-head"><h1>${t('nav_settings')}</h1>
      <div class="page-actions"><button type="button" class="btn-sm" id="emp-on" title="${t('emp_view_hint')}">&#128065; ${t('emp_view')}</button></div></div>
    <div class="settings ${current ? 'has-section' : 'menu-only'}">
      <nav class="settings-nav">${SECTIONS.map((x) => `<a href="#/settings/${x.id}" class="${current && x.id === current.id ? 'active' : ''}">${t(x.label)}</a>`).join('')}</nav>
      <div class="settings-main">${current ? `<a class="settings-back" href="#/settings">&#8249; ${t('nav_settings')}</a><div id="sec"></div>` : ''}</div>
    </div>`;
  $('#emp-on').onclick = () => { employeeView.set(true); location.hash = '#/sops'; };
  if (!current) return;
  try { await ({ team, templates, links, backup, password })[current.id]($('#sec')); } catch (e) { toastError(e); }
}
const again = () => renderSettings(location.hash.replace(/^#\/settings\/?/, '').split('/'));

// Generic list with add / edit / delete in a popup
function crud(el, { title, sub, rows, columns, fields, table, toRow, addLabel }) {
  el.innerHTML = `<div class="card"><div class="split"><div><h2 style="margin:0">${title}</h2>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>
      <button type="button" class="btn-primary btn-sm" id="add">+ ${addLabel || t('add')}</button></div>
    <div class="table-wrap" style="margin-top:12px"><table class="stack"><thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td data-label="${esc(c.label)}">${c.html(r)}</td>`).join('')}
      <td class="actions"><button type="button" class="btn-sm" data-edit="${r.id}">${t('edit')}</button>
        <button type="button" class="btn-sm btn-ghost btn-danger" data-del="${r.id}">${t('delete')}</button></td></tr>`).join('')
      || `<tr><td colspan="${columns.length + 1}" class="empty">${t('nothing_yet')}</td></tr>`}</tbody></table></div></div>`;
  const open = (row) => {
    openModal(`<h2>${row ? t('edit') : addLabel || t('add')}</h2><form id="f">${formHtml(fields, row || {})}
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(card, fields);
        try {
          const payload = toRow(v);
          if (row) check(await sb.from(table).update(payload).eq('id', row.id));
          else check(await sb.from(table).insert(payload));
          close(); toast(t('saved')); again();
        } catch (err) { toastError(err); }
      };
    });
  };
  $('#add', el).onclick = () => open(null);
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => open(rows.find((r) => r.id === b.dataset.edit))));
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog(t('confirm_delete'), t('delete')))) return;
    try { check(await sb.from(table).delete().eq('id', b.dataset.del)); toast(t('deleted')); again(); } catch (err) { toastError(err); }
  }));
}

// ------------------------------------------------------------------ team and accounts
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no confusing 0/O/1/l/i
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
function credentialsPopup(name, email, password) {
  const text = t('cred_text', { n: name, e: email, p: password, url: `${location.origin}${location.pathname}` });
  openModal(`<h2>${t('cred_title', { n: esc(name) })}</h2>
    <div class="pw-card"><div class="small">${t('pw_once')}</div><div style="margin:6px 0">${esc(email)}<br><code>${esc(password)}</code></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn-sm" id="copy">${t('copy')}</button>
    <a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">${t('share_whatsapp')}</a></div></div>
    <div class="modal-actions"><button type="button" class="btn-primary" data-close>${t('close')}</button></div>`, (card) => {
    card.querySelector('#copy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch { toastError(new Error(text)); } };
  });
}

async function team(el) {
  state.profiles = await loadProfiles();
  const rows = state.profiles;
  el.innerHTML = `<div class="card"><div class="split"><div><h2 style="margin:0">${t('set_team')}</h2><div class="small muted">${t('set_team_sub')}</div></div>
      <button type="button" class="btn-primary btn-sm" id="add">+ ${t('add_account')}</button></div>
    <div class="table-wrap" style="margin-top:12px"><table class="stack"><thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('role')}</th><th>${t('active')}</th><th></th></tr></thead><tbody>
    ${rows.map((p) => { const self = p.id === state.me.id; return `<tr>
      <td data-label="${t('name')}"><strong>${esc(p.full_name)}</strong>${self ? ` <span class="small muted">(${t('you')})</span>` : ''}</td>
      <td data-label="${t('email')}" class="small">${esc(p.email || '')}</td>
      <td data-label="${t('role')}">${t('role_' + p.role)}</td>
      <td data-label="${t('active')}">${p.active === false ? '–' : '&#10003;'}</td>
      <td class="actions"><button type="button" class="btn-sm" data-edit="${p.id}">${t('edit')}</button>
        ${self ? '' : `<button type="button" class="btn-sm" data-reset="${p.id}">${t('reset_password')}</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="note">${t('team_note')}</div></div>`;
  $('#add', el).onclick = () => {
    const fields = [
      { name: 'full_name', label: t('name'), required: true, placeholder: t('name_ph') },
      { name: 'email', label: t('email'), type: 'email', required: true },
      { name: 'password', label: t('password'), required: true, hint: t('password_hint') },
    ];
    openModal(`<h2>${t('add_account')}</h2><form id="f">${formHtml(fields, { password: generatePassword() })}
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('create_account')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(card, fields);
        try { await adminUsers({ action: 'create', ...v }); close(); credentialsPopup(v.full_name, v.email, v.password); team(el); }
        catch (err) { toastError(err); }
      };
    });
  };
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => {
    const p = rows.find((x) => x.id === b.dataset.edit);
    const self = p.id === state.me.id;
    const fields = [{ name: 'full_name', label: t('name'), required: true }];
    if (!self) fields.push({ name: 'role', label: t('role'), type: 'select', options: [{ value: 'staff', label: t('role_staff') }, { value: 'manager', label: t('role_manager') }] },
      { name: 'active', label: t('active'), type: 'checkbox' });
    else fields.push({ type: 'help', label: t('self_note') });
    openModal(`<h2>${esc(p.email || p.full_name)}</h2><form id="f">${formHtml(fields, { ...p, active: p.active !== false })}
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(card, fields);
        if (!v.full_name) return;
        try {
          check(await sb.from('profiles').update(self ? { full_name: v.full_name } : v).eq('id', p.id));
          if (self) state.me.full_name = v.full_name;
          close(); toast(t('saved')); team(el);
        } catch (err) { toastError(err); }
      };
    });
  }));
  $$('[data-reset]', el).forEach((b) => (b.onclick = async () => {
    const p = rows.find((x) => x.id === b.dataset.reset);
    if (!(await confirmDialog(t('confirm_reset', { n: p.full_name }), t('reset_password'), false))) return;
    const password = generatePassword();
    try { await adminUsers({ action: 'reset_password', user_id: p.id, password }); credentialsPopup(p.full_name, p.email || '', password); }
    catch (err) { toastError(err); }
  }));
}

// ------------------------------------------------------------------ fixed shifts
async function templates(el) {
  const rows = check(await sb.from('shift_templates').select('*').order('sort_order').order('start_time')) || [];
  crud(el, {
    title: t('set_templates'), sub: t('set_templates_sub'), table: 'shift_templates', rows, addLabel: t('add_template'),
    columns: [
      { label: t('name'), html: (r) => `<strong>${esc(r.name)}</strong>` },
      { label: t('time'), html: (r) => `${fmt.time(r.start_time)}–${fmt.time(r.end_time)}` },
      { label: t('section'), html: (r) => esc(r.section || '') },
    ],
    fields: [
      { name: 'name', label: t('name'), required: true, placeholder: t('template_ph') },
      { name: 'start_time', label: t('from'), type: 'time', required: true },
      { name: 'end_time', label: t('until'), type: 'time', required: true },
      { name: 'section', label: t('section'), placeholder: t('section_ph') },
      { name: 'sort_order', label: t('sort_order'), type: 'number' },
    ],
    toRow: (v) => ({ name: v.name, start_time: v.start_time, end_time: v.end_time, section: v.section, sort_order: v.sort_order || 0 }),
  });
}

// ------------------------------------------------------------------ links
async function links(el) {
  const rows = check(await sb.from('resources').select('*').order('sort_order')) || [];
  crud(el, {
    title: t('set_links'), sub: t('set_links_sub'), table: 'resources', rows, addLabel: t('add_link'),
    columns: [
      { label: t('name'), html: (r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener"><strong>${esc(r.label)}</strong></a>` },
      { label: t('note'), html: (r) => esc(r.note || '') },
    ],
    fields: [
      { name: 'label', label: t('name'), required: true, placeholder: t('link_name_ph') },
      { name: 'url', label: 'URL', required: true, placeholder: 'https://...' },
      { name: 'note', label: t('link_note'), placeholder: t('link_note_ph') },
      { name: 'sort_order', label: t('sort_order'), type: 'number' },
    ],
    toRow: (v) => ({ label: v.label, url: v.url, note: v.note, sort_order: v.sort_order || 0 }),
  });
}

// ------------------------------------------------------------------ backup and restore
async function backup(el) {
  el.innerHTML = `<div class="card"><h2>${t('set_backup')}</h2><p class="small muted" style="margin-top:-6px">${t('backup_sub')}</p>
      <button type="button" class="btn-primary" id="dl">&#11015; ${t('backup_download')}</button></div>
    <div class="card"><h2>${t('restore_title')}</h2><p class="small muted" style="margin-top:-6px">${t('restore_sub')}</p>
      <div class="field"><input type="file" id="file" accept="application/json"></div>
      <button type="button" id="restore">${t('restore_btn')}</button><div id="result" class="small" style="margin-top:10px"></div></div>
    <div class="card"><h2>${t('other_exports')}</h2><p class="small muted" style="margin-top:-6px">${t('other_exports_sub')}</p>
      <div class="page-actions"><a class="btn btn-sm" href="#/sops">${t('nav_sops')}</a><a class="btn btn-sm" href="#/roster">${t('nav_roster')}</a></div></div>`;
  $('#dl', el).onclick = async () => {
    try {
      const [sops, menu, resources, tpl, shifts] = await Promise.all([
        sb.from('sops').select('*'), sb.from('menu_items').select('*'), sb.from('resources').select('*'),
        sb.from('shift_templates').select('*'), sb.from('shifts').select('*, profiles:staff_id(full_name)'),
      ]);
      const errs = [sops, menu, resources, tpl, shifts].filter((r) => r.error).map((r) => r.error.message);
      if (errs.length) throw new Error(errs.join(', '));
      const bundle = { exported_at: new Date().toISOString(), sops: sops.data, menu_items: menu.data, resources: resources.data, shift_templates: tpl.data, shifts: shifts.data };
      download(JSON.stringify(bundle, null, 2), `wintertuin-all-settings-${todayIso()}.json`, 'application/json;charset=utf-8');
    } catch (e) { toastError(e); }
  };
  $('#restore', el).onclick = async () => {
    const file = $('#file', el).files[0];
    if (!file) { toastError(new Error(t('restore_pick'))); return; }
    let bundle;
    try { bundle = JSON.parse(await file.text()); } catch { toastError(new Error(t('restore_bad_file'))); return; }
    const counts = [[t('nav_sops'), bundle.sops], [t('nav_menu'), bundle.menu_items], [t('nav_links'), bundle.resources], [t('set_templates'), bundle.shift_templates], [t('restore_shifts'), bundle.shifts]]
      .map(([k, v]) => `${k}: ${(v || []).length}`).join('\n');
    const when = bundle.exported_at ? fmt.dateTime(bundle.exported_at) : '?';
    if (!(await confirmDialog(t('restore_confirm', { d: when, c: counts }), t('restore_btn'), false))) return;
    const out = $('#result', el);
    out.textContent = t('restoring');
    const errors = [];
    const up = async (table, rows) => { if (!rows || !rows.length) return; const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' }); if (error) errors.push(`${table}: ${error.message}`); };
    await up('sops', bundle.sops);
    await up('menu_items', bundle.menu_items);
    await up('resources', bundle.resources);
    await up('shift_templates', bundle.shift_templates);
    await up('shifts', (bundle.shifts || []).map(({ profiles, ...rest }) => rest)); // the joined name is not a real column
    out.innerHTML = errors.length ? `<span class="txt-red">${t('restore_partial')}<br>${errors.map(esc).join('<br>')}</span>` : `<span class="txt-green">${t('restore_done')}</span>`;
    $('#file', el).value = '';
  };
}

// ------------------------------------------------------------------ own password (one login for both Wintertuin apps)
async function password(el) {
  el.innerHTML = `<div class="card" style="max-width:480px"><h2>${t('set_password')}</h2><p class="small muted" style="margin-top:-6px">${t('set_password_sub')}</p>
    <form id="pw"><div class="field"><label>${t('pw_new')}</label><input type="password" name="pw" autocomplete="new-password" minlength="8" required></div>
    <div class="field"><label>${t('pw_repeat')}</label><input type="password" name="pw2" autocomplete="new-password" minlength="8" required></div>
    <button class="btn-primary" type="submit">${t('save')}</button></form></div>`;
  $('#pw', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.pw.value.length < 8) return toastError(new Error(t('pw_short')));
    if (f.pw.value !== f.pw2.value) return toastError(new Error(t('pw_mismatch')));
    try { await setPassword(f.pw.value); f.reset(); toast(t('pw_saved')); } catch (err) { toastError(err); }
  };
}
