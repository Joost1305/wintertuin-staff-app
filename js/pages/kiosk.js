// Clock-in tablet: a tablet at the pass, signed in as a manager. People tap their name, type their 4-digit PIN,
// and are clocked in or out. No menu, no other pages; leaving asks for the manager's own PIN.
import { state, app, esc, toastError, $, $$ } from '../core.js';
import { lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { sectionClass } from './roster-colors.js';

const L = (o) => o[lang()] || o.en;
const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const hhmm = (d) => new Date(d).toLocaleTimeString(lang() === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
let people = [];
let clockTimer = null;
let refreshTimer = null;
let wake = null;

export async function renderKiosk() {
  app().className = 'app kiosk';
  try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; } // keep the screen on where the browser allows it
  await load();
}

async function load() {
  try {
    people = check(await sb.rpc('kiosk_people')) || [];
  } catch (e) {
    if (/kiosk_people|function|schema cache/i.test(e.message || '')) return notSetUp();
    return toastError(e);
  }
  draw();
}

function notSetUp() {
  app().innerHTML = `<div class="card empty-state" style="max-width:520px;margin:12vh auto"><div class="pane"></div>
    <h2>${L({ en: 'The clock-in tablet is not switched on yet', nl: 'De inkloktablet staat nog niet aan' })}</h2>
    <p>${L({ en: 'The database needs the kiosk update first (migration 010_kiosk.sql in Supabase). After that, this screen works straight away.',
      nl: 'De database heeft eerst de kiosk-update nodig (migratie 010_kiosk.sql in Supabase). Daarna werkt dit scherm meteen.' })}</p>
    <a class="btn btn-primary" href="#/today">${L({ en: 'Back to the app', nl: 'Terug naar de app' })}</a></div>`;
}

function draw() {
  const inNow = people.filter((p) => p.checked_in_at).length;
  app().innerHTML = `
    <header class="kiosk-head">
      <div><div class="k-clock" id="k-clock"></div><div class="k-date" id="k-date"></div></div>
      <div class="k-side"><span class="k-count">${L({ en: `${inNow} clocked in`, nl: `${inNow} ingeklokt` })}</span>
        <button type="button" class="btn-sm k-exit" id="k-exit"><i class="ic ic-lock" aria-hidden="true"></i> ${L({ en: 'Leave tablet mode', nl: 'Tabletmodus verlaten' })}</button></div>
    </header>
    <p class="k-lead">${L({ en: 'Tap your name to clock in or out.', nl: 'Tik op je naam om in of uit te klokken.' })}</p>
    <div class="k-grid">${people.map((p) => `<button type="button" class="k-person ${p.checked_in_at ? 'in' : ''}" data-id="${p.id}">
        <span class="av ${sectionClass(p.section)}">${esc(initials(p.full_name))}</span>
        <span class="k-name">${esc(p.full_name)}</span>
        <span class="k-st">${p.checked_in_at ? L({ en: `In since ${hhmm(p.checked_in_at)}`, nl: `Binnen sinds ${hhmm(p.checked_in_at)}` }) : p.has_pin ? L({ en: 'Not clocked in', nl: 'Niet ingeklokt' }) : L({ en: 'No PIN yet', nl: 'Nog geen PIN' })}</span>
      </button>`).join('')}</div>`;
  tick();
  clearInterval(clockTimer); clockTimer = setInterval(() => { if (!$('#k-clock')) { clearInterval(clockTimer); clearInterval(refreshTimer); try { wake && wake.release(); } catch { /* ignore */ } return; } tick(); }, 15000);
  clearInterval(refreshTimer); refreshTimer = setInterval(() => { if ($('.k-grid') && !$('.k-pad')) load(); }, 120000);
  $$('[data-id]').forEach((b) => (b.onclick = () => pad(people.find((p) => p.id === b.dataset.id))));
  $('#k-exit').onclick = () => pad(null);
}

function tick() {
  const now = new Date();
  const c = $('#k-clock'); const d = $('#k-date');
  if (c) c.textContent = hhmm(now);
  if (d) d.textContent = now.toLocaleDateString(lang() === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

// PIN pad. person = null means: the manager leaves tablet mode.
function pad(person) {
  if (person && !person.has_pin) {
    return overlay(`<div class="k-msg"><span class="av big ${sectionClass(person.section)}">${esc(initials(person.full_name))}</span>
      <h2>${esc(person.full_name)}</h2><p>${L({ en: 'Set your PIN first on your own phone: open the Team app, go to Clock in and choose a PIN.',
        nl: 'Kies eerst een PIN op je eigen telefoon: open de Team app, ga naar Inklokken en kies een PIN.' })}</p>
      <button type="button" class="btn-xl" data-close>${L({ en: 'OK', nl: 'OK' })}</button></div>`);
  }
  let pin = '';
  const title = person ? esc(person.full_name) : L({ en: 'Manager PIN', nl: 'PIN van de manager' });
  const sub = person ? (person.checked_in_at ? L({ en: 'Type your PIN to clock out', nl: 'Typ je PIN om uit te klokken' }) : L({ en: 'Type your PIN to clock in', nl: 'Typ je PIN om in te klokken' }))
    : L({ en: `${esc(state.me.full_name)}, type your PIN to leave tablet mode`, nl: `${esc(state.me.full_name)}, typ je PIN om de tabletmodus te verlaten` });
  const el = overlay(`<div class="k-pad">
      ${person ? `<span class="av big ${sectionClass(person.section)}">${esc(initials(person.full_name))}</span>` : '<i class="ic ic-lock k-lock" aria-hidden="true"></i>'}
      <h2>${title}</h2><p class="muted">${sub}</p>
      <div class="k-dots" aria-live="polite">${'<i></i>'.repeat(4)}</div>
      <div class="k-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        <button type="button" data-close class="k-sub">${L({ en: 'Cancel', nl: 'Annuleer' })}</button><button type="button" data-k="0">0</button>
        <button type="button" data-back class="k-sub" aria-label="${L({ en: 'Delete', nl: 'Wis' })}">&#9003;</button></div></div>`);
  const dots = () => $$('.k-dots i', el).forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const shake = (msg) => { const p = $('.k-pad', el); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); $('.muted', el).textContent = msg; pin = ''; dots(); };
  const submit = async () => {
    $$('.k-keys button', el).forEach((b) => (b.disabled = true));
    try {
      if (!person) {
        const ok = check(await sb.rpc('check_my_kiosk_pin', { p_pin: pin }));
        if (ok) { el.remove(); location.hash = '#/today'; return; }
        shake(L({ en: 'Wrong PIN. Try again.', nl: 'Verkeerde PIN. Probeer opnieuw.' }));
      } else {
        const r = check(await sb.rpc('kiosk_clock', { p_staff: person.id, p_pin: pin }));
        if (r.ok) return done(el, r);
        if (r.reason === 'locked') shake(L({ en: 'Too many tries. Wait 5 minutes or ask a manager.', nl: 'Te vaak geprobeerd. Wacht 5 minuten of vraag een manager.' }));
        else shake(L({ en: 'Wrong PIN. Try again.', nl: 'Verkeerde PIN. Probeer opnieuw.' }));
      }
    } catch (e) { toastError(e); pin = ''; dots(); }
    $$('.k-keys button', el).forEach((b) => (b.disabled = false));
  };
  $$('[data-k]', el).forEach((b) => (b.onclick = () => { if (pin.length >= 4) return; pin += b.dataset.k; dots(); if (pin.length === 4) submit(); }));
  $('[data-back]', el).onclick = () => { pin = pin.slice(0, -1); dots(); };
  // A keyboard works too (tablet with a keyboard, or testing on a computer)
  el.tabIndex = -1; el.focus();
  el.onkeydown = (e) => {
    if (/^[0-9]$/.test(e.key) && pin.length < 4) { pin += e.key; dots(); if (pin.length === 4) submit(); }
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); dots(); }
    else if (e.key === 'Escape') el.remove();
  };
  return el;
}

function done(el, r) {
  const first = String(r.name || '').split(/\s+/)[0];
  const hrs = r.since ? ((new Date(r.at) - new Date(r.since)) / 3600000) : null;
  el.innerHTML = `<div class="k-msg k-done ${r.action}"><div class="k-tick"><i class="ic ic-check" aria-hidden="true"></i></div>
    <h2>${r.action === 'in' ? L({ en: `Hi ${esc(first)}`, nl: `Hoi ${esc(first)}` }) : L({ en: `Bye ${esc(first)}`, nl: `Doei ${esc(first)}` })}</h2>
    <p>${r.action === 'in' ? L({ en: `Clocked in at ${hhmm(r.at)}`, nl: `Ingeklokt om ${hhmm(r.at)}` })
      : L({ en: `Clocked out at ${hhmm(r.at)}`, nl: `Uitgeklokt om ${hhmm(r.at)}` }) + (hrs != null ? `, ${hrs.toLocaleString(lang() === 'nl' ? 'nl-NL' : 'en-GB', { maximumFractionDigits: 1 })} ${L({ en: 'hours', nl: 'uur' })}` : '')}</p></div>`;
  setTimeout(() => { el.remove(); load(); }, 2600);
}

function overlay(html) {
  $$('.k-overlay').forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'k-overlay';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = html;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) el.remove(); });
  return el;
}
