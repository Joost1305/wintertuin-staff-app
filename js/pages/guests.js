// Guests: everyone we have contact details for, from every event plus guests added by hand, with their event history.
// The newsletter list holds only guests who said yes (on the event, or told us). Managers only: this is personal data.
// Needs database update 011 (table guests). Before that, the list is read straight from the events, read-only.
import { state, isManager, app, esc, fmt, toast, toastError, todayIso, $, $$, openModal, closeModal, confirmDialog, download } from '../core.js';
import { lang } from '../i18n.js';
import { sb, check } from '../data.js';

const L = (o) => o[lang()] || o.en;
const key = (e) => String(e || '').trim().toLowerCase();
let view = { q: '', filter: 'all' };
let data = null;

async function load() {
  const g = await sb.from('guests').select('*').order('name');
  const full = !g.error;
  let evRes = await sb.from('events').select('id, title, event_date, status, client_name, client_company, client_email, client_phone, newsletter_ok').order('event_date', { ascending: false });
  if (evRes.error) evRes = await sb.from('events').select('id, title, event_date, status, client_name, client_company, client_email, client_phone').order('event_date', { ascending: false });
  const events = check(evRes) || [];
  const byEmail = {};
  events.forEach((e) => { if (key(e.client_email)) (byEmail[key(e.client_email)] = byEmail[key(e.client_email)] || []).push(e); });
  const guests = full ? (g.data || []).map((x) => ({ ...x, saved: true })) : [];
  const known = new Set(guests.map((x) => key(x.email)).filter(Boolean));
  // event clients not (yet) in the list: shown too, saved as soon as someone edits them
  Object.entries(byEmail).forEach(([em, evs]) => {
    if (known.has(em)) return;
    const e = evs[0];
    guests.push({ id: null, name: e.client_name, company: e.client_company, email: em, phone: e.client_phone,
      newsletter: evs.some((x) => x.newsletter_ok), source: 'event', tags: [], notes: '', saved: false });
  });
  guests.forEach((x) => { x.events = byEmail[key(x.email)] || []; });
  guests.sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || '')));
  const noEmail = events.filter((e) => !key(e.client_email) && (e.client_name || e.client_company)).length;
  data = { full, guests, noEmail };
}

export async function renderGuests() {
  if (!isManager()) { location.hash = '#/today'; return; }
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  try { await load(); } catch (e) { toastError(e); return; }
  draw();
}

function shown() {
  const q = key(view.q);
  return data.guests.filter((x) => (view.filter === 'all' || (view.filter === 'yes' ? x.newsletter : !x.newsletter))
    && (!q || [x.name, x.company, x.email, x.phone, (x.tags || []).join(' ')].some((v) => key(v).includes(q))));
}

function draw() {
  const { full, guests, noEmail } = data;
  const yes = guests.filter((x) => x.newsletter && x.email);
  const list = shown();
  app().innerHTML = `
    <div class="page-head"><div><h1>${L({ en: 'Guests', nl: 'Gasten' })}</h1>
      <div class="muted small">${L({ en: 'Everyone from our events and the guests you add. Only managers see this list.', nl: 'Iedereen van onze events en de gasten die je toevoegt. Alleen managers zien deze lijst.' })}</div></div>
      <div class="page-actions">
        <a class="btn btn-sm" href="#/newsletter"><i class="ic ic-book" aria-hidden="true"></i> ${L({ en: 'Newsletter', nl: 'Nieuwsbrief' })}</a>
        <button type="button" class="btn-sm" id="g-copy" ${yes.length && full ? '' : 'disabled'}>${L({ en: 'Copy addresses', nl: 'Adressen kopiëren' })}</button>
        <button type="button" class="btn-sm" id="g-csv" ${yes.length && full ? '' : 'disabled'}><i class="ic ic-download" aria-hidden="true"></i> ${L({ en: 'Newsletter list (CSV)', nl: 'Nieuwsbrieflijst (CSV)' })}</button>
        ${full ? `<button type="button" class="btn-primary btn-sm" id="g-add">+ ${L({ en: 'Guest', nl: 'Gast' })}</button>` : ''}</div></div>
    ${full ? '' : `<div class="note" style="margin:0 0 14px">${L({ en: 'This list now comes straight from the events and cannot be changed yet. After database update 011 you can add guests, keep notes and build the newsletter list.',
      nl: 'Deze lijst komt nu rechtstreeks uit de events en is nog niet aan te passen. Na database-update 011 kun je gasten toevoegen, notities bijhouden en de nieuwsbrieflijst maken.' })}</div>`}
    <div class="grid grid-kpi g-kpis">
      <div class="card kpi"><div class="label">${L({ en: 'Guests', nl: 'Gasten' })}</div><div class="value">${guests.length}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'Newsletter: yes', nl: 'Nieuwsbrief: ja' })}</div><div class="value txt-green">${yes.length}</div></div>
      <div class="card kpi"><div class="label">${L({ en: 'With an event', nl: 'Met een event' })}</div><div class="value">${guests.filter((x) => x.events.length).length}</div></div>
    </div>
    <div class="g-tools"><input type="search" id="g-q" value="${esc(view.q)}" placeholder="${L({ en: 'Search name, company, email or tag', nl: 'Zoek op naam, bedrijf, e-mail of label' })}">
      <div class="chips">${[['all', L({ en: 'All', nl: 'Alles' })], ['yes', L({ en: 'Newsletter', nl: 'Nieuwsbrief' })], ['no', L({ en: 'No newsletter', nl: 'Geen nieuwsbrief' })]]
        .map(([k, l]) => `<button type="button" class="chip ${view.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div></div>
    <div class="card" style="padding:0">${list.length ? `<div class="table-wrap"><table class="g-table">
      <thead><tr><th>${L({ en: 'Guest', nl: 'Gast' })}</th><th>${L({ en: 'Contact', nl: 'Contact' })}</th><th>${L({ en: 'Events', nl: 'Events' })}</th><th>${L({ en: 'Newsletter', nl: 'Nieuwsbrief' })}</th></tr></thead><tbody>
      ${list.map((x, i) => `<tr><td><button type="button" class="g-name" data-i="${data.guests.indexOf(x)}"><strong>${esc(x.name || x.email || '?')}</strong>${x.company ? `<span class="small muted">${esc(x.company)}</span>` : ''}
          ${(x.tags || []).length ? `<span class="g-tags">${x.tags.map((tg) => `<span class="tag">${esc(tg)}</span>`).join('')}</span>` : ''}</button></td>
        <td class="small">${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}${x.phone ? `<br><span class="muted">${esc(x.phone)}</span>` : ''}</td>
        <td class="small">${x.events.length ? `${x.events.length}× <span class="muted">${L({ en: 'last', nl: 'laatst' })} ${esc(fmt.date(x.events[0].event_date))}</span>` : '<span class="muted">–</span>'}</td>
        <td>${full && x.email ? `<label class="switch"><input type="checkbox" data-nl="${data.guests.indexOf(x)}" ${x.newsletter ? 'checked' : ''} aria-label="${L({ en: 'Newsletter', nl: 'Nieuwsbrief' })}"><span></span></label>` : x.newsletter ? L({ en: 'Yes', nl: 'Ja' }) : '<span class="muted">–</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">${guests.length ? L({ en: 'Nobody matches this search.', nl: 'Niemand gevonden met deze zoekopdracht.' }) : L({ en: 'No guests yet. They appear here as soon as an event has an email address.', nl: 'Nog geen gasten. Ze verschijnen hier zodra een event een e-mailadres heeft.' })}</div>`}</div>
    ${noEmail ? `<p class="small muted" style="margin-top:10px">${L({ en: `${noEmail} event(s) have a client but no email address; add it on the event to keep them in this list.`, nl: `${noEmail} event(s) hebben een klant maar geen e-mailadres; vul het in bij het event om ze in deze lijst te houden.` })}</p>` : ''}
    <p class="small muted">${L({ en: 'Only tick the newsletter when the guest said yes. Somebody who unsubscribes: switch it off here.', nl: 'Zet de nieuwsbrief alleen aan als de gast ja heeft gezegd. Iemand die zich afmeldt: hier uitzetten.' })}</p>`;

  const q = $('#g-q');
  q.oninput = () => { view.q = q.value; const pos = q.selectionStart; draw(); const n = $('#g-q'); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-f]').forEach((b) => (b.onclick = () => { view.filter = b.dataset.f; draw(); }));
  $$('[data-i]').forEach((b) => (b.onclick = () => openGuest(data.guests[Number(b.dataset.i)])));
  $$('[data-nl]').forEach((c) => (c.onchange = async () => {
    const x = data.guests[Number(c.dataset.nl)];
    try { await save(x, { newsletter: c.checked }); toast(c.checked ? L({ en: 'On the newsletter list', nl: 'Op de nieuwsbrieflijst' }) : L({ en: 'Off the newsletter list', nl: 'Van de nieuwsbrieflijst' })); draw(); }
    catch (e) { c.checked = !c.checked; toastError(e); }
  }));
  const add = $('#g-add'); if (add) add.onclick = () => openGuest(null);
  const lines = () => yes.map((x) => x.email);
  const cp = $('#g-copy'); if (cp) cp.onclick = async () => {
    try { await navigator.clipboard.writeText(lines().join(', ')); toast(L({ en: `${yes.length} addresses copied`, nl: `${yes.length} adressen gekopieerd` })); }
    catch { toastError(new Error(L({ en: 'Copying is not allowed here; use the CSV.', nl: 'Kopiëren mag hier niet; gebruik de CSV.' }))); }
  };
  const csv = $('#g-csv'); if (csv) csv.onclick = () => {
    const q2 = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['email', 'name', 'company', 'consent_at', 'consent_source'].join(',')]
      .concat(yes.map((x) => [x.email, x.name, x.company, x.newsletter_at ? String(x.newsletter_at).slice(0, 10) : '', x.newsletter_source || ''].map(q2).join(',')));
    download(rows.join('\r\n') + '\r\n', `wintertuin-nieuwsbrief-${todayIso()}.csv`, 'text/csv;charset=utf-8');
  };
}

// Save a guest (insert when it only came from an event so far)
async function save(x, patch) {
  const row = { ...patch, updated_at: new Date().toISOString() };
  if ('newsletter' in patch && patch.newsletter !== x.newsletter) {
    row.newsletter_at = patch.newsletter ? new Date().toISOString() : null;
    row.newsletter_source = patch.newsletter ? 'manual' : null;
  }
  if (x && x.saved) {
    const r = check(await sb.from('guests').update(row).eq('id', x.id).select().single());
    Object.assign(x, r);
  } else {
    const base = x ? { name: x.name, company: x.company, email: x.email, phone: x.phone, source: x.source || 'manual' } : { source: 'manual' };
    const r = check(await sb.from('guests').insert({ ...base, ...row }).select().single());
    if (x) Object.assign(x, r, { saved: true }); else data.guests.push({ ...r, saved: true, events: [] });
  }
}

function openGuest(x) {
  const full = data.full;
  const v = x || { name: '', company: '', email: '', phone: '', newsletter: false, tags: [], notes: '' };
  openModal(`<h2>${x ? esc(x.name || x.email) : L({ en: 'New guest', nl: 'Nieuwe gast' })}</h2>
    <form id="g-form" autocomplete="off">
      <div class="field-row"><div class="field"><label>${L({ en: 'Name', nl: 'Naam' })}</label><input name="name" value="${esc(v.name || '')}" ${full ? '' : 'readonly'}></div>
        <div class="field"><label>${L({ en: 'Company', nl: 'Bedrijf' })}</label><input name="company" value="${esc(v.company || '')}" ${full ? '' : 'readonly'}></div></div>
      <div class="field-row"><div class="field"><label>${L({ en: 'Email', nl: 'E-mail' })}</label><input name="email" type="email" value="${esc(v.email || '')}" ${full ? '' : 'readonly'}></div>
        <div class="field"><label>${L({ en: 'Phone', nl: 'Telefoon' })}</label><input name="phone" type="tel" value="${esc(v.phone || '')}" ${full ? '' : 'readonly'}></div></div>
      <div class="field"><label class="check"><input type="checkbox" name="newsletter" ${v.newsletter ? 'checked' : ''} ${full ? '' : 'disabled'}> ${L({ en: 'Newsletter: the guest said yes', nl: 'Nieuwsbrief: de gast heeft ja gezegd' })}</label>
        ${v.newsletter_at ? `<div class="hint">${L({ en: 'Since', nl: 'Sinds' })} ${esc(fmt.date(v.newsletter_at))}${v.newsletter_source ? ` (${v.newsletter_source === 'event' ? L({ en: 'on the event', nl: 'bij het event' }) : L({ en: 'by hand', nl: 'met de hand' })})` : ''}</div>` : ''}</div>
      <div class="field"><label>${L({ en: 'Labels', nl: 'Labels' })}</label><input name="tags" value="${esc((v.tags || []).join(', '))}" placeholder="${L({ en: 'e.g. wedding, regular, supplier', nl: 'bijv. bruiloft, vaste gast, leverancier' })}" ${full ? '' : 'readonly'}></div>
      <div class="field"><label>${L({ en: 'Notes', nl: 'Notities' })}</label><textarea name="notes" rows="3" placeholder="${L({ en: 'Preferences, allergies they told us about, who they came with', nl: 'Voorkeuren, allergieën die ze noemden, met wie ze kwamen' })}" ${full ? '' : 'readonly'}>${esc(v.notes || '')}</textarea></div>
      ${x && x.events.length ? `<div class="subhead">${L({ en: 'Events', nl: 'Events' })}</div><ul class="g-evs">${x.events.map((e) => `<li><a href="#/events/${e.id}">${esc(e.title)}</a><span class="small muted">${esc(fmt.date(e.event_date))}, ${esc(e.status)}</span></li>`).join('')}</ul>` : ''}
      <div class="modal-actions">${x && x.saved ? `<button type="button" class="btn btn-danger" id="g-del">${L({ en: 'Forget this guest', nl: 'Deze gast vergeten' })}</button>` : ''}
        <span style="flex:1"></span><button type="button" class="btn" data-close>${L({ en: 'Close', nl: 'Sluiten' })}</button>
        ${full ? `<button type="submit" class="btn-primary">${L({ en: 'Save', nl: 'Opslaan' })}</button>` : ''}</div>
    </form>`, (root) => {
    const f = $('#g-form', root);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const email = f.email.value.trim().toLowerCase();
      if (!f.name.value.trim() && !email) return toastError(new Error(L({ en: 'Fill in a name or an email address.', nl: 'Vul een naam of e-mailadres in.' })));
      if (email && data.guests.some((g) => g !== x && key(g.email) === email && g.saved)) return toastError(new Error(L({ en: 'This email address is already in the list.', nl: 'Dit e-mailadres staat al in de lijst.' })));
      try {
        await save(x, { name: f.name.value.trim() || null, company: f.company.value.trim() || null, email: email || null, phone: f.phone.value.trim() || null,
          newsletter: f.newsletter.checked, tags: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean), notes: f.notes.value.trim() || null });
        closeModal(); toast(L({ en: 'Saved', nl: 'Opgeslagen' })); await load(); draw();
      } catch (err) { toastError(err); }
    };
    const del = $('#g-del', root);
    if (del) del.onclick = async () => {
      if (!(await confirmDialog(L({ en: 'Remove this guest from the list? Their events stay, but the contact details and notes here are gone.', nl: 'Deze gast uit de lijst halen? De events blijven, maar de gegevens en notities hier zijn weg.' }), L({ en: 'Forget', nl: 'Vergeten' })))) return;
      try { check(await sb.from('guests').delete().eq('id', x.id)); closeModal(); toast(L({ en: 'Guest removed', nl: 'Gast verwijderd' })); await load(); draw(); } catch (err) { toastError(err); }
    };
  });
  void state;
}
