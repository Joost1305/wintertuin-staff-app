// Follow-up: requests from Mette (her booking with food and drinks) and her later changes reach the restaurant
// as a pop-up for managers: who to contact, a link to the event, and what Mette already agreed.
// The pop-up comes back when the app opens and when something new arrives, until a manager taps "Opgevolgd".
// Also: the box on the event itself, and the double-booking check against Mette's room calendar (hire_busy).
import { state, isManager, esc, fmt, toast, toastError, openModal } from './core.js';
import { lang } from './i18n.js';
import { sb, check } from './data.js';

const L = (o) => o[lang()] || o.en;
const KIND = () => ({ new: L({ en: 'New request', nl: 'Nieuwe aanvraag' }), changed: L({ en: 'Changed', nl: 'Gewijzigd' }), cancelled: L({ en: 'Cancelled', nl: 'Geannuleerd' }) });
const KIND_TAG = { new: 'ev-option', changed: 'claimed', cancelled: 'ev-cancelled' };
const SEEN = 'wtFollowUpSeen';

export async function loadFollowUps() {
  const { data, error } = await sb.from('events').select('id, title, event_date, start_time, end_time, area, guests_expected, client_name, client_company, client_email, client_phone, hire_agreed, follow_up, follow_up_note, follow_up_at')
    .not('follow_up', 'is', null).order('follow_up_at');
  return error ? [] : data || [];
}

const contactHtml = (e) => {
  const who = [e.client_name, e.client_company].filter(Boolean).join(', ') || L({ en: 'the guest', nl: 'de gast' });
  const tel = e.client_phone ? `<a href="tel:${esc(String(e.client_phone).replace(/[^\d+]/g, ''))}">${esc(e.client_phone)}</a>` : '';
  const mail = e.client_email ? `<a href="mailto:${esc(e.client_email)}">${esc(e.client_email)}</a>` : '';
  return `<div class="fu-contact">${L({ en: 'Please contact', nl: 'Graag contact opnemen met' })} <strong>${esc(who)}</strong>${tel || mail ? `<div class="small">${[tel, mail].filter(Boolean).join(' · ')}</div>` : ''}</div>`;
};
const factsHtml = (e) => [fmt.dateLong(e.event_date), e.start_time ? `${fmt.time(e.start_time)}${e.end_time ? `–${fmt.time(e.end_time)}` : ''}` : '', e.area, e.guests_expected ? `${e.guests_expected} ${L({ en: 'guests', nl: 'gasten' })}` : '']
  .filter(Boolean).map(esc).join(' · ');
const agreedHtml = (e) => (e.hire_agreed ? `<div class="fu-agreed"><div class="subhead" style="margin-top:6px">${L({ en: 'Already agreed by Mette', nl: 'Al afgesproken door Mette' })}</div><div style="white-space:pre-line">${esc(e.hire_agreed)}</div></div>` : '');

// The pop-up: all open follow-ups, newest last. Shown again only when the list changed or the app was reopened.
export async function checkFollowUps(force = false) {
  if (!state.me || !isManager() || document.body.classList.contains('kiosk-mode')) return;
  if (!force && /^#\/events\//.test(location.hash)) return; // already on an event
  const list = await loadFollowUps();
  if (!list.length) return;
  const sig = list.map((e) => `${e.id}:${e.follow_up_at}`).join('|');
  let seen = ''; try { seen = sessionStorage.getItem(SEEN) || ''; } catch { /* ignore */ }
  if (!force && seen === sig) return;
  if (document.getElementById('modal') && !document.getElementById('modal').hidden) return; // never on top of another popup
  try { sessionStorage.setItem(SEEN, sig); } catch { /* ignore */ }
  const K = KIND();
  openModal(`<h2>${L({ en: 'Restaurant: please follow up', nl: 'Restaurant: graag opvolgen' })}</h2>
    <p class="small muted" style="margin-top:-4px">${L({ en: 'From the room hire of Mette.', nl: 'Vanuit de zaalverhuur van Mette.' })}</p>
    <div class="fu-list">${list.map((e) => `<div class="fu-item" data-fu="${e.id}">
      <div class="split"><strong>${esc(e.title)}</strong><span class="tag ${KIND_TAG[e.follow_up] || ''}">${esc(K[e.follow_up] || e.follow_up)}</span></div>
      <div class="small muted">${factsHtml(e)}</div>
      ${e.follow_up_note ? `<div class="small" style="margin-top:4px">${esc(e.follow_up_note)}</div>` : ''}
      ${contactHtml(e)}${agreedHtml(e)}
      <div class="fu-actions"><a class="btn btn-primary btn-sm" href="#/events/${e.id}">${L({ en: 'Open the event', nl: 'Naar het event' })}</a>
        <button type="button" class="btn-sm" data-fudone="${e.id}">${L({ en: 'Followed up', nl: 'Opgevolgd' })}</button></div></div>`).join('')}</div>
    <div class="modal-actions"><button type="button" class="btn" data-close>${L({ en: 'Later', nl: 'Later' })}</button></div>`, (card, close) => {
    card.querySelectorAll('a[href^="#/events/"]').forEach((a) => a.addEventListener('click', () => close()));
    card.querySelectorAll('[data-fudone]').forEach((b) => (b.onclick = async () => {
      try {
        check(await sb.rpc('event_follow_up_done', { p_event: b.dataset.fudone }));
        b.closest('.fu-item').remove(); toast(L({ en: 'Marked as followed up', nl: 'Opgevolgd' }));
        if (!card.querySelector('.fu-item')) close();
      } catch (e) { toastError(e); }
    }));
  });
}

// On the event page: the request from Mette, what she agreed, and the Opgevolgd button
export function followUpBox(ev) {
  if (!ev.hire_booking_id && !ev.follow_up && !ev.hire_agreed) return '';
  const K = KIND();
  return `<div class="card fu-box"><div class="split"><strong>${L({ en: 'Via Mette (room hire)', nl: 'Via Mette (zaalverhuur)' })}</strong>
      ${ev.follow_up ? `<span class="tag ${KIND_TAG[ev.follow_up] || ''}">${esc(K[ev.follow_up])}</span>` : `<span class="tag approved">${L({ en: 'Followed up', nl: 'Opgevolgd' })}</span>`}</div>
    ${ev.follow_up_note ? `<div class="small" style="margin-top:4px">${esc(ev.follow_up_note)}</div>` : ''}
    ${ev.follow_up ? contactHtml(ev) : ''}${agreedHtml(ev)}
    ${ev.follow_up && isManager() ? `<div class="fu-actions"><button type="button" class="btn-sm" id="fu-done">${L({ en: 'Followed up', nl: 'Opgevolgd' })}</button></div>` : ''}</div>`;
}
export function bindFollowUpBox(ev, again) {
  const b = document.getElementById('fu-done'); if (!b) return;
  b.onclick = async () => { try { check(await sb.rpc('event_follow_up_done', { p_event: ev.id })); toast(L({ en: 'Followed up', nl: 'Opgevolgd' })); again(); } catch (e) { toastError(e); } };
}

// Double bookings: Mette's room calendar for a day (no names, no money). Rooms of the Team app are matched by id or name.
export async function busyOn(date) {
  if (!date) return [];
  try { const { data, error } = await sb.rpc('hire_busy', { p_from: date, p_to: date }); return error ? [] : data || []; } catch { return []; }
}
