// Today: the start page. Everything a person needs at the start of a shift on one screen:
// next shift, clock in or out, today's checklists, events, who works today and swaps waiting.
import { state, isManager, app, esc, fmt, toastError, todayIso, isoOf, $, avatar } from '../core.js';
import { t, lang } from '../i18n.js';
import { sb, check } from '../data.js';
import { view } from './sops.js';
import { swapBadgeCount } from './swap.js';
import { sectionClass } from './roster-colors.js';

const L = (o) => o[lang()] || o.en;
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return L({ en: 'Good morning', nl: 'Goedemorgen' });
  if (h < 18) return L({ en: 'Good afternoon', nl: 'Goedemiddag' });
  return L({ en: 'Good evening', nl: 'Goedenavond' });
}
function relDay(iso) {
  const today = todayIso();
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  if (iso === today) return L({ en: 'Today', nl: 'Vandaag' });
  if (iso === isoOf(tm)) return L({ en: 'Tomorrow', nl: 'Morgen' });
  return fmt.date(iso);
}
const safe = (p) => p.then((r) => (r && r.error ? null : r ? r.data : null), () => null);

export async function renderHome() {
  app().className = 'app';
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const today = todayIso();
  const [mine, todayShifts, openRow, sops, checks, events, swaps] = await Promise.all([
    safe(sb.from('shifts').select('*').eq('staff_id', state.me.id).gte('shift_date', today).order('shift_date').order('start_time').limit(4)),
    safe(sb.from('shifts').select('*, profiles:staff_id(full_name, photo_url)').eq('shift_date', today).order('start_time')),
    safe(sb.from('checkins').select('*').eq('staff_id', state.me.id).is('check_out_at', null).order('check_in_at', { ascending: false }).limit(1).maybeSingle()),
    safe(sb.from('sops').select('*').order('category').order('sort_order')),
    safe(sb.from('sop_checks').select('*').eq('check_date', today)),
    safe(sb.from('events').select('id, title, event_date, start_time, end_time, status, area, guests_expected, guests_guaranteed, guests_final')
      .gte('event_date', today).neq('status', 'cancelled').order('event_date').order('start_time').limit(20)),
    swapBadgeCount().catch(() => 0),
  ]);
  const ticked = new Set((checks || []).filter((c) => c.checked).map((c) => `${c.sop_id}_${c.item_index}`));
  const lists = (sops || []).map((s) => { const v = view(s); const n = v.items.length; const done = v.items.filter((_, i) => ticked.has(`${s.id}_${i}`)).length; return { id: s.id, v, n, done }; })
    .filter((x) => x.n > 0);
  const next = (mine || [])[0];
  const later = (mine || []).slice(1, 4);
  // events: today's, then always the next day that has events, then a short line with what comes after
  const evs = (events || []).filter((e) => e.status !== 'done');
  const evToday = evs.filter((e) => e.event_date === today);
  const guests = (e) => e.guests_final || e.guests_guaranteed || e.guests_expected;

  const shiftBlock = next ? `
      <div class="hh-label">${L({ en: 'Your next shift', nl: 'Je volgende dienst' })}</div>
      <div class="when">${esc(relDay(next.shift_date))}, ${esc(fmt.time(next.start_time))}–${esc(fmt.time(next.end_time))}</div>
      ${next.section ? `<span class="sec-pill ${sectionClass(next.section)}">${esc(next.section)}</span>` : ''}
      ${later.length ? `<div class="later">${L({ en: 'After that', nl: 'Daarna' })}: ${later.map((s) => `${esc(relDay(s.shift_date))} ${esc(fmt.time(s.start_time))}`).join(', ')}</div>` : ''}`
    : `<div class="hh-label">${L({ en: 'Your next shift', nl: 'Je volgende dienst' })}</div>
      <div class="when quiet">${L({ en: 'Nothing planned yet', nl: 'Nog niets ingepland' })}</div>
      <a class="later" href="#/roster">${L({ en: 'Open the roster', nl: 'Open het rooster' })}</a>`;

  app().innerHTML = `
    <section class="home-hero">
      <div class="hh-top"><h1>${esc(greeting())}, ${esc(first(state.me.full_name))}</h1>
        <div class="muted">${esc(fmt.dateLong(today))}</div></div>
      <div class="hh-grid">
        <div class="hh-shift">${shiftBlock}</div>
        <div class="hh-clock">
          <div class="hh-label">${openRow ? t('checked_in_since', { d: fmt.time(new Date(openRow.check_in_at).toTimeString()) }) : t('not_checked_in')}</div>
          <button type="button" class="btn-xl ${openRow ? 'btn-stop' : 'btn-primary'}" id="clock"><i class="ic ic-clock" aria-hidden="true"></i> ${openRow ? t('check_out') : t('check_in')}</button>
        </div>
      </div>
    </section>

    ${swaps ? `<a class="home-alert" href="#/swap"><i class="ic ic-swap" aria-hidden="true"></i><span>${isManager()
      ? L({ en: `${swaps} shift swap${swaps > 1 ? 's' : ''} waiting for your approval`, nl: swaps > 1 ? `${swaps} ruilverzoeken wachten op je akkoord` : '1 ruilverzoek wacht op je akkoord' })
      : L({ en: `${swaps} shift swap update${swaps > 1 ? 's' : ''}`, nl: `Nieuws over ${swaps > 1 ? `${swaps} ruilverzoeken` : 'je ruilverzoek'}` })}</span><i class="ic ic-next" aria-hidden="true"></i></a>` : ''}

    ${(() => {
      // small nudges, no card: today's events and the next ones, up to three; one tap opens the event
      const list = evToday.concat(evs.filter((e) => e.event_date > today)).slice(0, Math.max(3, evToday.length));
      if (!list.length) return '';
      return `<div class="home-nudges">${list.map((e) => {
        const isToday = e.event_date === today;
        const when = isToday ? L({ en: 'Today', nl: 'Vandaag' }) : relDay(e.event_date);
        return `<a class="home-nudge ${isToday ? 'is-today' : ''}" href="#/events/${e.id}"><i class="ic ic-party" aria-hidden="true"></i>
        <span class="hn-txt"><strong>${esc(when)}${e.start_time ? ` ${esc(fmt.time(e.start_time))}` : ''}</strong> ${esc(e.title)}${guests(e) ? ` <span class="hn-g">· ${guests(e)}</span>` : ''}</span><i class="ic ic-next" aria-hidden="true"></i></a>`;
      }).join('')}</div>`;
    })()}

    <div class="home-cols">
      <section class="card home-card">
        <div class="hc-head"><h2>${L({ en: 'Working today', nl: 'Vandaag aan het werk' })}</h2><a href="#/roster" class="small">${L({ en: 'Roster', nl: 'Rooster' })}</a></div>
        ${(todayShifts || []).length ? `<ul class="who-list">${todayShifts.map((s) => `<li class="${s.staff_id === state.me.id ? 'me' : ''}">
            ${avatar(s.profiles && s.profiles.full_name, s.profiles && s.profiles.photo_url, sectionClass(s.section))}
            <span class="who">${esc(s.profiles ? s.profiles.full_name : '')}${s.section ? `<span class="small muted">${esc(s.section)}</span>` : ''}</span>
            <span class="tm">${esc(fmt.time(s.start_time))}–${esc(fmt.time(s.end_time))}</span></li>`).join('')}</ul>`
          : `<p class="muted">${L({ en: 'Nobody is on the roster today.', nl: 'Vandaag staat niemand op het rooster.' })}</p>`}
      </section>

      <section class="card home-card">
        <div class="hc-head"><h2>${L({ en: 'Checklists today', nl: 'Checklists vandaag' })}</h2><a href="#/sops" class="small">${L({ en: 'All SOPs', nl: "Alle SOP's" })}</a></div>
        ${lists.length ? `<ul class="prog-list">${lists.map((x) => `<li><a href="#/sops" data-sop="${x.id}">
            <span class="pl-name">${esc(x.v.title)}<span class="pl-cat">${esc(x.v.category)}</span></span>
            <span class="pl-bar"><span style="width:${Math.round((x.done / x.n) * 100)}%"></span></span>
            <span class="pl-num ${x.done === x.n ? 'full' : ''}">${x.done === x.n ? '<i class="ic ic-check" aria-hidden="true"></i>' : `${x.done}/${x.n}`}</span></a></li>`).join('')}</ul>`
          : `<p class="muted">${L({ en: 'No checklists yet.', nl: 'Nog geen checklists.' })}</p>`}
      </section>
    </div>

    <nav class="home-quick" aria-label="${L({ en: 'Shortcuts', nl: 'Snelkoppelingen' })}">
      <a href="#/menu"><i class="ic ic-utensils" aria-hidden="true"></i>${t('nav_menu')}</a>
      <a href="#/haccp"><i class="ic ic-thermo" aria-hidden="true"></i>${t('nav_haccp')}</a>
      <a href="#/events"><i class="ic ic-party" aria-hidden="true"></i>${t('nav_events')}</a>
      <a href="#/links"><i class="ic ic-link" aria-hidden="true"></i>${t('nav_links')}</a>
    </nav>`;

  $('#clock').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      if (openRow) check(await sb.from('checkins').update({ check_out_at: new Date().toISOString() }).eq('id', openRow.id));
      else check(await sb.from('checkins').insert({ staff_id: state.me.id, check_in_at: new Date().toISOString() }));
      renderHome();
    } catch (err) { toastError(err); e.currentTarget.disabled = false; }
  };
  // Opening a list from here unfolds it on the SOP page
  app().querySelectorAll('[data-sop]').forEach((a) => (a.onclick = () => {
    try { const k = 'wintertuinSopOpen'; const s = new Set(JSON.parse(localStorage.getItem(k) || '[]')); s.add(a.dataset.sop); localStorage.setItem(k, JSON.stringify([...s])); } catch { /* private mode */ }
  }));
}
