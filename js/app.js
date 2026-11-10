// App shell and router (hash based, no build step). Same structure as Wintertuin Finance.
import { state, isManager, realManager, employeeView, renderEmployeeBanner, $, esc, app, toastError, renderLangToggle, closeModal } from './core.js';
import { t, setLang, lang } from './i18n.js';
import { sb, loadMe, loadProfiles, signOut } from './data.js';
import { BUILD } from './config.js';
import { renderLogin } from './pages/login.js';
import { renderSetPassword } from './pages/set-password.js';
import { renderSops } from './pages/sops.js';
import { renderMenu } from './pages/menu.js';
import { renderLinks } from './pages/links.js';
import { renderRoster } from './pages/roster.js';
import { renderEvents } from './pages/events.js';
import { renderCheckin } from './pages/checkin.js';
import { renderSwap, swapBadgeCount } from './pages/swap.js';
import { renderSettings } from './pages/settings.js';
import { renderHaccp } from './pages/haccp.js';
import { renderAbout } from './pages/about-team.js';
import { renderHome } from './pages/home.js';
import { renderKiosk } from './pages/kiosk.js';
import { renderGuests } from './pages/guests.js';
import { renderNewsletter } from './pages/newsletter.js';
import { renderMenuCard } from './pages/menucard.js';
import { renderHelp } from './pages/help.js';
import { chapterFor } from './handbook.js';
import { loadNavOrder, orderPaths } from './nav.js';
import { initPinLock, needsUnlock, showUnlock, shouldOfferSetup, offerSetup, markActive } from './pinlock.js';

console.log(`Wintertuin Team, build ${BUILD}`);
// Always the newest version: version.json is never cached. When it names a newer build, the app loads it:
// at once when the app opens, or with a bar to tap when you come back to an open app (so nothing you type is lost).
async function checkUpdate(atStart) {
  if (window.__NO_UPDATE_CHECK) return;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) return;
    const { build } = await r.json(); if (!build || build === BUILD) return;
    const go = () => location.replace(`${location.pathname}?v=${encodeURIComponent(build)}${location.hash}`);
    if (new URLSearchParams(location.search).get('v') === build) return; // already tried this build: never loop
    if (atStart) return go();
    if (document.getElementById('upd-bar')) return;
    const bar = document.createElement('div'); bar.id = 'upd-bar'; bar.className = 'upd-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>${document.documentElement.lang === 'en' ? 'A new version of the app is ready.' : 'Er is een nieuwe versie van de app.'}</span><button type="button" class="btn-sm">${document.documentElement.lang === 'en' ? 'Update' : 'Bijwerken'}</button>`;
    bar.querySelector('button').onclick = go; document.body.appendChild(bar);
  } catch { /* offline: try again later */ }
}
checkUpdate(true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(false); });
setInterval(() => checkUpdate(false), 10 * 60 * 1000);
window.addEventListener('nav-order-changed', () => renderShell());
// One tab per app: the switch button in the other app targets this name and reuses this tab
try { window.name = 'wintertuin-team'; } catch { /* ignore */ }

const routes = [
  { path: 'today', render: renderHome, nav: 'nav_today', show: () => true, icon: 'home' },
  { icon: 'info', path: 'about', render: renderAbout, nav: 'nav_about', show: () => true },
  { icon: 'list', path: 'sops', render: renderSops, nav: 'nav_sops', show: () => true },
  { icon: 'utensils', path: 'menu', render: renderMenu, nav: 'nav_menu', show: () => true },
  { icon: 'link', path: 'links', render: renderLinks, nav: 'nav_links', show: () => true },
  { icon: 'roster', path: 'roster', render: renderRoster, nav: 'nav_roster', show: () => true },
  { icon: 'party', path: 'events', render: (args) => renderEvents(args[0] === 'list' ? [null, args[1] || 'upcoming'] : args), nav: 'nav_events', show: () => true },
  { icon: 'thermo', path: 'haccp', render: renderHaccp, nav: 'nav_haccp', show: () => true },
  { icon: 'clock', path: 'checkin', render: renderCheckin, nav: 'nav_checkin', show: () => true },
  { icon: 'swap', path: 'swap', render: renderSwap, nav: 'nav_swap', show: () => true, badge: true },
  { icon: 'settings', path: 'settings', render: renderSettings, nav: 'nav_settings', show: isManager },
  { icon: 'user', path: 'guests', render: renderGuests, nav: 'nav_guests', show: isManager },
  { path: 'newsletter', render: renderNewsletter, nav: null, show: isManager },
  { path: 'menucard', render: renderMenuCard, nav: null, show: () => true },
  { path: 'kiosk', render: renderKiosk, nav: null, show: isManager, bare: true },
  { path: 'help', render: renderHelp, nav: null, show: () => true },
  { path: 'password', render: () => renderSetPassword(() => { location.hash = `#/${homePath()}`; }), nav: null, show: () => true },
];
// Start page: Today, with the next shift, clocking in and today's checklists
const homePath = () => 'today';
let badge = 0;
let badgeTimer = null;

export async function refreshProfiles() { state.profiles = await loadProfiles(); }

async function ensureSession() {
  if (state.me) return true;
  try {
    const me = await loadMe();
    state.me = me;
    setLang(me.language || 'en');
    await Promise.all([refreshProfiles(), loadNavOrder()]);
    refreshBadge();
    clearInterval(badgeTimer);
    badgeTimer = setInterval(refreshBadge, 60000);
    return true;
  } catch (e) {
    if (e.status !== 401) toastError(e);
    state.me = null;
    return false;
  }
}

async function refreshBadge() {
  try { badge = await swapBadgeCount(); } catch { badge = 0; }
  const el = document.querySelector('#nav a[href="#/swap"] .badge-count');
  if (el) { el.textContent = badge > 9 ? '9+' : String(badge); el.hidden = !badge; }
}

let moreEl = null;
const touchNav = () => document.documentElement.classList.contains('touch-nav');
document.addEventListener('click', (e) => { if (moreEl && !moreEl.contains(e.target) && !touchNav()) moreEl.open = false; });
window.addEventListener('wt:touchnav', () => { if (state.me && !document.body.classList.contains('kiosk-mode')) renderShell(); });

function renderShell() {
  const top = $('#topbar');
  const bar = document.getElementById('tabbar');
  if (!state.me) { top.hidden = true; if (bar) bar.hidden = true; renderEmployeeBanner(false); return; }
  top.hidden = false;
  const current = location.hash.replace(/^#\//, '').split('/')[0] || homePath();
  const nav = $('#nav');
  const visible = routes.filter((r) => r.nav && r.show());
  const sorted = orderPaths(visible.map((r) => r.path), state.navOrder).map((p) => visible.find((r) => r.path === p));
  const link = (r) => `<a href="#/${r.path}" class="${current === r.path ? 'active' : ''}">${r.icon ? `<i class="ic ic-${r.icon} nav-ic" aria-hidden="true"></i>` : ''}${t(r.nav)}${r.badge ? `<span class="badge-count" ${badge ? '' : 'hidden'}>${badge > 9 ? '9+' : badge}</span>` : ''}</a>`;
  // Computer: the first seven in the bar, the rest under More. Phone: everything in the More sheet.
  const MAIN = 7;
  const rest = sorted.slice(MAIN);
  const restActive = rest.some((r) => r.path === current) || current === 'password';
  nav.innerHTML = sorted.slice(0, MAIN).map(link).join('') +
    `<details class="nav-more"><summary class="${restActive ? 'active' : ''}">${t('nav_more')}${rest.some((r) => r.badge) && badge ? `<span class="badge-count">${badge > 9 ? '9+' : badge}</span>` : ''}</summary><div class="nav-more-list">` +
    rest.map(link).join('') +
    // Managers change their password under Settings; staff (no Settings) keep it in the menu
    (isManager() ? '' : `<a href="#/password" class="${current === 'password' ? 'active' : ''}"><i class="ic ic-lock nav-ic" aria-hidden="true"></i>${t('nav_password')}</a>`) +
    `<a href="#/logout"><i class="ic ic-logout nav-ic" aria-hidden="true"></i>${t('nav_logout')}</a></div></details>`;
  const more = nav.querySelector('.nav-more');
  // On a phone the list is part of the More sheet, so it stays unfolded there
  moreEl = more;
  if (touchNav()) more.open = true;
  // Switch to the other app: on a phone, tablet or as an app in the Dock (anything not a normal browser tab) in the same window (iOS freezes on, or jumps to a stale copy of,
  // a separate named tab and opens the start page of an old tab); on a computer in its own tab, reused each time
  const touch = window.matchMedia('(pointer: coarse)').matches || window.navigator.standalone || !window.matchMedia('(display-mode: browser)').matches;
  const appSw = $('#app-switch');
  if (appSw) { if (touch) appSw.removeAttribute('target'); else appSw.setAttribute('target', 'wintertuin-finance'); }
  $('#app-switch-label').textContent = t('nav_finance');
  renderEmployeeBanner(realManager(), '#/settings', t);
  nav.classList.remove('open');
  $('#menu-toggle').onclick = () => nav.classList.toggle('open');
  renderLangToggle($('#lang-toggle'));
  renderTabbar(current, sorted);
}

// Phone: four fixed tabs and More (which opens the full menu as a sheet)
// Phone and tablet tabs: Today plus the first three of the menu order set under Settings
function renderTabbar(current, sorted) {
  let bar = document.getElementById('tabbar');
  if (!bar) { bar = document.createElement('nav'); bar.id = 'tabbar'; bar.className = 'tabbar'; bar.setAttribute('aria-label', 'Tabs'); document.body.appendChild(bar); }
  bar.hidden = false;
  const today = routes.find((r) => r.path === 'today');
  const tabs = [today, ...sorted.filter((r) => !['today', 'settings', 'about'].includes(r.path)).slice(0, 3)];
  const inTabs = tabs.some((r) => r.path === current);
  bar.innerHTML = tabs.map((r) => `<a href="#/${r.path}" class="${current === r.path ? 'on' : ''}"><i class="ic ic-${r.icon}" aria-hidden="true"></i>${t(r.nav)}</a>`).join('') +
    `<button type="button" id="tab-more" class="${inTabs ? '' : 'on'}" aria-expanded="false"><i class="ic ic-more" aria-hidden="true"></i>${t('nav_more')}${badge ? `<span class="dot">${badge > 9 ? '9+' : badge}</span>` : ''}</button>`;
  const nav = $('#nav');
  const close = () => { nav.classList.remove('open'); document.querySelectorAll('.more-scrim').forEach((x) => x.remove()); $('#tab-more').setAttribute('aria-expanded', 'false'); };
  $('#tab-more').onclick = () => {
    if (nav.classList.contains('open')) return close();
    nav.classList.add('open');
    const scrim = document.createElement('div'); scrim.className = 'more-scrim'; scrim.onclick = close; document.body.appendChild(scrim);
    $('#tab-more').setAttribute('aria-expanded', 'true');
  };
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
}

function renderNoAccess() {
  $('#topbar').hidden = true;
  app().innerHTML = `<div class="card no-access"><img src="img/logo.png" width="96" height="70" alt="Wintertuin">
    <h1 style="margin-top:10px">${t('no_access_title')}</h1><p class="muted">${t('no_access_text')}</p>
    <button class="btn-primary" id="na-out">${t('nav_logout')}</button></div>`;
  $('#na-out').onclick = () => { location.hash = '#/logout'; };
}

// Arriving from a password-reset email: the link signs the person in; then they choose a password.
const authLink = (() => {
  const h = new URLSearchParams(String(window.__authHash || '').replace(/^#/, ''));
  if (h.get('error_description')) return { error: h.get('error_description') };
  return ['invite', 'recovery'].includes(h.get('type')) ? { type: h.get('type') } : null;
})();

let choosingPassword = false; // true while the reset-link screen is open
initPinLock({ sb, lang });
const pinUser = () => ({ id: state.me.id, full_name: state.me.full_name });
// Quick sign-in: the PIN lock in front of the session, and the offer to choose a PIN after the password
async function pinGate() {
  if (!state.me || !needsUnlock(pinUser().id)) return true;
  document.body.classList.add('locked');
  const ok = await showUnlock(pinUser());
  document.body.classList.remove('locked');
  if (!ok) { location.hash = '#/logout'; return false; }
  return true;
}
async function afterPasswordLogin() {
  markActive();
  if (state.me && shouldOfferSetup(pinUser().id)) await offerSetup(pinUser());
}
window.addEventListener('wt:pincheck', () => { if (state.me && needsUnlock(pinUser().id)) route(); });

async function route() {
  closeModal(); // a popup never stays open on another page
  if (choosingPassword) return; // the auth library clears the link from the address bar; ignore that page change
  if (authLink && !authLink.handled) {
    authLink.handled = true;
    if (authLink.error) { location.hash = '#/login'; setTimeout(() => toastError(new Error(authLink.error)), 300); return; }
    choosingPassword = true;
    await new Promise((r) => setTimeout(r, 400));
    const { data: { session } } = await sb.auth.getSession();
    if (session) return renderSetPassword(() => { choosingPassword = false; location.hash = `#/${homePath()}`; });
    choosingPassword = false;
    location.hash = '#/login'; return;
  }
  const [path, ...rest] = location.hash.replace(/^#\//, '').split('/');
  // the ? icon opens the handbook at the chapter of this page
  { const hb = document.getElementById('help-btn'); if (hb && path !== 'help') hb.href = `#/help/${chapterFor(path || 'today')}`; }
  if (path === 'logout') {
    employeeView.set(false);
    await signOut().catch(() => {});
    state.me = null;
    clearInterval(badgeTimer);
    location.hash = '#/login';
    return;
  }
  if (path === 'login') {
    // Already signed in (for example in Wintertuin Finance, same login): skip the form
    const { data: { session } } = await sb.auth.getSession();
    if (session && (await ensureSession())) { location.hash = `#/${homePath()}`; return; }
    state.me = null;
    renderShell();
    return renderLogin(async () => { if (await ensureSession()) { await afterPasswordLogin(); location.hash = `#/${homePath()}`; } });
  }
  if (!(await ensureSession())) { location.hash = '#/login'; return; }
  if (state.me.active === false) return renderNoAccess();
  if (!(await pinGate())) return;
  if (!path || path === 'home') { history.replaceState(null, '', `${location.pathname}${location.search}#/${homePath()}`); return route(); }
  const r = routes.find((x) => x.path === path && x.show());
  if (!r) { location.hash = `#/${homePath()}`; return; }
  document.querySelectorAll('.more-scrim').forEach((x) => x.remove());
  document.body.classList.toggle('kiosk-mode', !!r.bare);
  if (r.bare) { $('#topbar').hidden = true; const tb = document.getElementById('tabbar'); if (tb) tb.hidden = true; }
  else renderShell();
  app().className = 'app';
  window.scrollTo(0, 0);
  try { await r.render(rest); } catch (e) { toastError(e); }
}

window.addEventListener('hashchange', route);
window.addEventListener('wt:lang', () => route());
window.addEventListener('wt:badge', () => refreshBadge());
// Signed in or out in the other Wintertuin app (same login): follow along
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && state.me) { state.me = null; location.hash = '#/login'; }
});
const known = /^#\/(login|home|today|kiosk|guests|newsletter|menucard|about|sops|menu|links|roster|events|haccp|checkin|swap|settings|password)/;
// unknown or empty address: open the start page once we know who is signed in (it depends on the menu order)
if (!authLink && !known.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#/home`);
route();

// Dropdowns (Print, Export, ...) always stay on the screen: when one opens, its panel is moved
// so it fits between the edges, also on a narrow phone. Clicking outside closes it.
function fitDropdown(d) {
  const pop = [...d.children].find((c) => c.tagName !== 'SUMMARY' && getComputedStyle(c).position === 'absolute');
  if (!pop) return;
  pop.style.left = ''; pop.style.right = ''; pop.style.maxWidth = `${window.innerWidth - 24}px`;
  const r = pop.getBoundingClientRect(); const gap = 12;
  if (r.left < gap) { pop.style.right = 'auto'; pop.style.left = `${gap - d.getBoundingClientRect().left}px`; }
  else if (r.right > window.innerWidth - gap) { pop.style.left = 'auto'; pop.style.right = `${d.getBoundingClientRect().right - (window.innerWidth - gap)}px`; }
}
document.addEventListener('toggle', (e) => { const d = e.target; if (d.tagName === 'DETAILS' && d.open && d.classList.contains('export-menu')) fitDropdown(d); }, true);
document.addEventListener('click', (e) => { document.querySelectorAll('details.export-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
