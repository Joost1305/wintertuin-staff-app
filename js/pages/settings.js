// Settings (managers only): team and accounts, fixed shifts, links, backup and restore.
// Accounts and passwords go through the admin-users edge function, which re-checks that you are a manager.
import { state, isManager, app, esc, fmt, toast, toastError, todayIso, $, $$, openModal, confirmDialog, formHtml, readForm, download, employeeView } from '../core.js';
import { t } from '../i18n.js';
import { sb, check, adminUsers, loadProfiles, setPassword } from '../data.js';
import { renderSystemCheck } from './system-check.js';
import { renderHaccpSettings } from './haccp.js';
import { NAV_ITEMS, orderPaths, saveNavOrder } from '../nav.js';

const SECTIONS = [
  { id: 'team', label: 'set_team' },
  { id: 'templates', label: 'set_templates' },
  { id: 'menuorder', label: 'set_menu_order' },
  { id: 'haccp', label: 'set_haccp' },
  { id: 'navorder', label: 'set_nav_order' },
  { id: 'links', label: 'set_links' },
  { id: 'backup', label: 'set_backup' },
  { id: 'system', label: 'set_system' },
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
  try { await ({ team, templates, menuorder, haccp: renderHaccpSettings, navorder, links, backup, password, system: (el) => renderSystemCheck(el) })[current.id]($('#sec')); } catch (e) { toastError(e); }
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

// ------------------------------------------------------------------ order of the top menu
// Number the menu items or move them with the arrows; 1 is on the left. The same for everyone.
function navorder(el) {
  let order = orderPaths(NAV_ITEMS.map(([p]) => p), state.navOrder);
  const label = (p) => t(NAV_ITEMS.find(([x]) => x === p)[1]);
  const draw = () => {
    el.innerHTML = `<div class="card"><h2 style="margin:0">${t('set_nav_order')}</h2><div class="small muted">${t('nav_order_sub')}</div>
      <div class="order-list" style="margin-top:12px">${order.map((p, i) => `<div class="order-row">
        <input type="number" min="1" step="1" inputmode="numeric" value="${i + 1}" data-nav="${p}" aria-label="${t('position')}: ${esc(label(p))}">
        <span style="flex:1"><strong>${esc(label(p))}</strong></span>
        <span class="row-move" style="display:inline-flex"><button type="button" data-nup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${t('move_up')}">&#9650;</button><button type="button" data-ndown="${i}" ${i === order.length - 1 ? 'disabled' : ''} aria-label="${t('move_down')}">&#9660;</button></span></div>`).join('')}</div>
      <div class="tiny muted" style="margin-top:8px">${t('nav_order_fixed')}</div>
      <div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn-primary" id="save-nav">${t('save')}</button><button type="button" class="btn-sm" id="reset-nav">${t('nav_order_reset')}</button></div></div>`;
    const swap = (i, j) => { [order[i], order[j]] = [order[j], order[i]]; draw(); };
    $$('[data-nup]', el).forEach((b) => (b.onclick = () => swap(Number(b.dataset.nup), Number(b.dataset.nup) - 1)));
    $$('[data-ndown]', el).forEach((b) => (b.onclick = () => swap(Number(b.dataset.ndown), Number(b.dataset.ndown) + 1)));
    $('#reset-nav', el).onclick = () => { order = NAV_ITEMS.map(([p]) => p); draw(); };
    $('#save-nav', el).onclick = async () => {
      // sort by the typed numbers; equal or empty numbers keep their current place
      // on equal numbers the item you just renumbered goes first (type 1 to put it in front)
      const typed = order.map((p, i) => { const v = Number($(`[data-nav="${p}"]`, el).value); const n = Number.isFinite(v) && v > 0 ? v : Infinity; return { p, n, i, moved: n !== i + 1 }; });
      typed.sort((a, b) => a.n - b.n || (b.moved - a.moved) || a.i - b.i);
      order = typed.map((x) => x.p);
      try { await saveNavOrder(order); toast(t('saved')); draw(); } catch (e) { toastError(e); }
    };
  };
  draw();
}

// ------------------------------------------------------------------ menu order
// Number the dishes per group: 1 shows first on the Menu page. Saved as sort_order 10, 20, 30, ...
async function menuorder(el) {
  const rows = check(await sb.from('menu_items').select('id, name, category, group_type, sort_order').eq('active', true)
    .order('group_type').order('sort_order').order('name')) || [];
  const groups = ['food', 'beverage'].map((g) => [g, rows.filter((r) => (r.group_type || 'food') === g)]).filter(([, l]) => l.length);
  el.innerHTML = `<div class="card"><h2 style="margin:0">${t('set_menu_order')}</h2><div class="small muted">${t('menu_order_sub')}</div>
    ${!groups.length ? `<div class="empty">${t('menu_none')}</div>` : groups.map(([g, list]) => `<div class="sop-cat" style="margin-top:16px">${t('group_' + g)}</div>
      <div class="order-list">${list.map((r, i) => `<label class="order-row"><input type="number" min="1" step="1" inputmode="numeric" value="${i + 1}" data-oid="${r.id}" data-g="${g}" aria-label="${t('position')}: ${esc(r.name)}">
        <span><strong>${esc(r.name)}</strong>${r.category ? ` <span class="tag">${esc(r.category)}</span>` : ''}</span></label>`).join('')}</div>`).join('')}
    ${groups.length ? `<button type="button" class="btn-primary" id="save-order" style="margin-top:14px">${t('save')}</button>` : ''}</div>`;
  const btn = $('#save-order', el); if (!btn) return;
  btn.onclick = async () => {
    try {
      const updates = [];
      for (const [, list] of groups) {
        // sort by the typed number; equal or empty numbers keep their current order
        const typed = list.map((r, i) => { const v = Number($(`[data-oid="${r.id}"]`, el).value); const n = Number.isFinite(v) && v > 0 ? v : Infinity; return { r, n, i, moved: n !== i + 1 }; });
        typed.sort((a, b) => a.n - b.n || (b.moved - a.moved) || a.i - b.i); // renumbered dish wins a tie
        typed.forEach(({ r }, k) => { const so = (k + 1) * 10; if (r.sort_order !== so) updates.push(sb.from('menu_items').update({ sort_order: so }).eq('id', r.id).then(check)); });
      }
      btn.disabled = true;
      await Promise.all(updates);
      toast(t('saved')); again();
    } catch (e) { toastError(e); btn.disabled = false; }
  };
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

// Finance access is managed from here too (same login), through the finance app's own admin function.
// Shown only when you may manage finance users; otherwise the Finance column and choices stay hidden.
const FIN_ROLES = ['staff', 'manager', 'org_admin'];
async function loadFinanceAccess() {
  try {
    const { data: r } = await sb.from('fin_restaurants').select('organization_id').limit(1).maybeSingle();
    if (!r) return null;
    const { data, error } = await sb.functions.invoke('fin-admin-users', { body: { action: 'list', organization_id: r.organization_id } });
    if (error || !data || data.error) return null;
    return { org: r.organization_id, users: data.users || [] };
  } catch { return null; }
}
async function finAdmin(body) {
  const { data, error } = await sb.functions.invoke('fin-admin-users', { body });
  if (error) { let msg = error.message; try { const j = await error.context.json(); msg = j.error || msg; } catch { /* keep */ } throw new Error(msg); }
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function team(el) {
  el.innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [profiles, fin] = await Promise.all([loadProfiles(), loadFinanceAccess()]);
  state.profiles = profiles;
  const rows = state.profiles;
  const finOf = (p) => (fin ? fin.users.find((u) => u.user_id === p.id || (p.email && u.email && u.email.toLowerCase() === p.email.toLowerCase())) : null);
  const finLabel = (u) => (u && u.active !== false ? t('fin_role_' + u.role) || u.role : '–');
  const finOptions = [{ value: '', label: t('fin_none') }, ...FIN_ROLES.map((r) => ({ value: r, label: t('fin_role_' + r) }))];
  const teamRoles = [{ value: 'staff', label: t('role_staff') }, { value: 'manager', label: t('role_manager') }];
  el.innerHTML = `<div class="card"><div class="split"><div><h2 style="margin:0">${t('set_team')}</h2><div class="small muted">${t('set_team_sub')}</div></div>
      <button type="button" class="btn-primary btn-sm" id="add">+ ${t('add_account')}</button></div>
    <div class="table-wrap" style="margin-top:12px"><table class="stack"><thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('role')}</th>${fin ? `<th>Finance</th>` : ''}<th>${t('active')}</th><th></th></tr></thead><tbody>
    ${rows.map((p) => { const self = p.id === state.me.id; return `<tr>
      <td data-label="${t('name')}"><strong>${esc(p.full_name)}</strong>${self ? ` <span class="small muted">(${t('you')})</span>` : ''}</td>
      <td data-label="${t('email')}" class="small">${esc(p.email || '')}</td>
      <td data-label="${t('role')}">${t('role_' + p.role)}</td>
      ${fin ? `<td data-label="Finance">${finLabel(finOf(p))}</td>` : ''}
      <td data-label="${t('active')}">${p.active === false ? '–' : '&#10003;'}</td>
      <td class="actions"><button type="button" class="btn-sm" data-edit="${p.id}">${t('edit')}</button>
        ${self ? '' : `<button type="button" class="btn-sm" data-reset="${p.id}">${t('reset_password')}</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="note">${fin ? t('team_note_both') : t('team_note')}</div></div>`;
  $('#add', el).onclick = () => {
    const fields = [
      { name: 'full_name', label: t('name'), required: true, placeholder: t('name_ph') },
      { name: 'email', label: t('email'), type: 'email', required: true },
      { name: 'password', label: t('password'), required: true, hint: t('password_hint') },
      { name: 'role', label: t('acc_team_role'), type: 'select', options: teamRoles },
    ];
    if (fin) fields.push({ name: 'fin_role', label: t('acc_fin_role'), type: 'select', options: finOptions, hint: t('acc_fin_hint') });
    openModal(`<h2>${t('add_account')}</h2><form id="f">${formHtml(fields, { password: generatePassword(), role: 'staff', fin_role: '' })}
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('create_account')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(card, fields);
        const { role, fin_role: finRole, ...acc } = v;
        try { await adminUsers({ action: 'create', ...acc }); } catch (err) { toastError(err); return; }
        try {
          // the new profile starts as staff; give it the chosen team role
          if (role === 'manager') {
            const fresh = await loadProfiles();
            const np = fresh.find((x) => (x.email || '').toLowerCase() === acc.email.trim().toLowerCase());
            if (np) check(await sb.from('profiles').update({ role }).eq('id', np.id));
          }
          if (fin && finRole) await finAdmin({ action: 'create', organization_id: fin.org, email: acc.email, full_name: acc.full_name, role: finRole, language: state.me.language || 'nl', password: acc.password });
        } catch (err) { toastError(err); }
        close(); credentialsPopup(acc.full_name, acc.email, acc.password); team(el);
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
    const fu = finOf(p);
    const finNow = fu && fu.active !== false ? fu.role : '';
    // your own finance access and a super admin's are managed in the finance app
    const finEditable = fin && !self && !(fu && fu.role === 'super_admin');
    if (finEditable) fields.push({ name: 'fin_role', label: t('acc_fin_role'), type: 'select', options: finOptions });
    openModal(`<h2>${esc(p.email || p.full_name)}</h2><form id="f">${formHtml(fields, { ...p, active: p.active !== false, fin_role: finNow })}
      <div class="modal-actions"><button type="button" data-close>${t('cancel')}</button><button class="btn-primary" type="submit">${t('save')}</button></div></form>`,
    (card, close) => {
      card.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const { fin_role: finRole, ...v } = readForm(card, fields);
        if (!v.full_name) return;
        try {
          check(await sb.from('profiles').update(self ? { full_name: v.full_name } : v).eq('id', p.id));
          if (finEditable && (finRole || '') !== finNow) {
            if (!finRole) await finAdmin({ action: 'remove', organization_id: fin.org, id: fu.id });
            else if (fu) await finAdmin({ action: 'update', organization_id: fin.org, id: fu.id, role: finRole, active: true });
            else await finAdmin({ action: 'create', organization_id: fin.org, email: p.email, full_name: v.full_name, role: finRole, language: p.language || 'nl' });
          }
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
      const [sops, menu, resources, tpl, shifts, hcEntries, hcConfig] = await Promise.all([
        sb.from('sops').select('*'), sb.from('menu_items').select('*'), sb.from('resources').select('*'),
        sb.from('shift_templates').select('*'), sb.from('shifts').select('*, profiles:staff_id(full_name)'),
        sb.from('haccp_entries').select('*').order('entry_date'), sb.from('haccp_config').select('*'),
      ]);
      const errs = [sops, menu, resources, tpl, shifts, hcEntries, hcConfig].filter((r) => r.error).map((r) => r.error.message);
      if (errs.length) throw new Error(errs.join(', '));
      const bundle = { exported_at: new Date().toISOString(), sops: sops.data, menu_items: menu.data, resources: resources.data, shift_templates: tpl.data, shifts: shifts.data, haccp_config: hcConfig.data, haccp_entries: hcEntries.data };
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
    // HACCP: settings (fridges, cleaning items, suppliers) come back; registrations stay in the database and are only kept in the file
    if (bundle.haccp_config && bundle.haccp_config.length) { const { error } = await sb.from('haccp_config').upsert(bundle.haccp_config.map(({ key, value }) => ({ key, value })), { onConflict: 'key' }); if (error) errors.push(`haccp_config: ${error.message}`); }
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
