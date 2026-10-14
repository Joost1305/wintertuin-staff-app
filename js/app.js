// App shell and router (hash based, no build step). Same structure as Wintertuin Finance.
import { state, isManager, realManager, employeeView, renderEmployeeBanner, $, esc, app, toastError, renderLangToggle, closeModal } from './core.js';
import { t, setLang } from './i18n.js';
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
import { loadNavOrder, orderPaths } from './nav.js';

console.log(`Wintertuin Team, build ${BUILD}`);
window.addEventListener('nav-order-changed', () => renderShell());
// One tab per app: the switch button in the other app targets this name and reuses this tab
try { window.name = 'wintertuin-team'; } catch { /* ignore */ }

const routes = [
  { path: 'sops', render: renderSops, nav: 'nav_sops', show: () => true },
  { path: 'menu', render: renderMenu, nav: 'nav_menu', show: () => true },
  { path: 'links', render: renderLinks, nav: 'nav_links', show: () => true },
  { path: 'roster', render: renderRoster, nav: 'nav_roster', show: () => true },
  { path: 'events', render: (args) => renderEvents(args[0] === 'list' ? [null, args[1]] : args), nav: 'nav_events', show: () => true },
  { path: 'haccp', render: renderHaccp, nav: 'nav_haccp', show: () => true },
  { path: 'checkin', render: renderCheckin, nav: 'nav_checkin', show: () => true },
  { path: 'swap', render: renderSwap, nav: 'nav_swap', show: () => true, badge: true },
  { path: 'settings', render: renderSettings, nav: 'nav_settings', show: isManager },
  { path: 'password', render: () => renderSetPassword(() => { location.hash = `#/${homePath()}`; }), nav: null, show: () => true },
];
const homePath = () => 'sops';
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

function renderShell() {
  const top = $('#topbar');
  if (!state.me) { top.hidden = true; renderEmployeeBanner(false); return; }
  top.hidden = false;
  const current = location.hash.replace(/^#\//, '').split('/')[0] || homePath();
  const nav = $('#nav');
  const visible = routes.filter((r) => r.nav && r.show());
  const sorted = orderPaths(visible.map((r) => r.path), state.navOrder).map((p) => visible.find((r) => r.path === p));
  nav.innerHTML = sorted.map((r) =>
    `<a href="#/${r.path}" class="${current === r.path ? 'active' : ''}">${t(r.nav)}${r.badge ? `<span class="badge-count" ${badge ? '' : 'hidden'}>${badge > 9 ? '9+' : badge}</span>` : ''}</a>`).join('') +
    `<a class="ext" href="Wintertuin-Intro.html">${t('nav_about')}</a>` +
    // Managers change their password under Settings; staff (no Settings) keep it in the menu
    (isManager() ? '' : `<a href="#/password" class="${current === 'password' ? 'active' : ''}">${t('nav_password')}</a>`) +
    `<a href="#/logout">${t('nav_logout')}</a>`;
  $('#app-switch-label').textContent = t('nav_finance');
  renderEmployeeBanner(realManager(), '#/settings', t);
  nav.classList.remove('open');
  $('#menu-toggle').onclick = () => nav.classList.toggle('open');
  renderLangToggle($('#lang-toggle'));
}

function renderNoAccess() {
  $('#topbar').hidden = true;
  app().innerHTML = `<div class="card no-access"><img src="img/team-icon.svg" width="48" height="48" alt="">
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
    return renderLogin(async () => { if (await ensureSession()) location.hash = `#/${homePath()}`; });
  }
  if (!(await ensureSession())) { location.hash = '#/login'; return; }
  if (state.me.active === false) return renderNoAccess();
  const r = routes.find((x) => x.path === path && x.show());
  if (!r) { location.hash = `#/${homePath()}`; return; }
  renderShell();
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
const known = /^#\/(login|sops|menu|links|roster|checkin|swap|settings|password)/;
if (!authLink && !known.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#/${homePath()}`);
route();
