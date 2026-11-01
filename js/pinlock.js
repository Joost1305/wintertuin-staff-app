// Quick sign-in with a PIN on this device. Same file in the Team app and in Finance.
// The first time on a device you sign in with email and password; then you choose a 4-digit PIN.
// After that, opening the app (or 30 minutes without using it) asks only for the PIN.
// The real Supabase session stays on the device as before; the PIN is a lock in front of it,
// stored only as a PBKDF2 hash. 5 wrong PINs sign you out (email and password again).
// Both apps live on the same address, so one PIN unlocks both. It is also sent to the
// clock-in tablet (set_my_kiosk_pin) when that is switched on, so it is one PIN for everything.

const KEY = 'wt_pinlock';      // { [userId]: { salt, hash, name, fails } }
const ACTIVE = 'wt_active';    // last time someone used either app on this device
const SKIP = 'wt_pin_skip';    // { [userId]: true } chose "not now"
const IDLE_MS = 30 * 60 * 1000;
const MAX_FAILS = 5;

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

let deps = null; // { sb, lang }
let idleOnOpen = false; // decided once when the page opens, so a scroll during loading cannot skip the lock
export function initPinLock(d) {
  deps = d;
  idleOnOpen = Date.now() - Number(read(ACTIVE, 0)) > IDLE_MS;
  let last = 0;
  const touch = () => { if (idleOnOpen || document.querySelector('.pinlock')) return; const n = Date.now(); if (n - last > 20000) { last = n; markActive(); } };
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') window.dispatchEvent(new Event('wt:pincheck')); });
}
const L = (o) => o[(deps && deps.lang && deps.lang()) || 'en'] || o.en;

export function markActive() { idleOnOpen = false; write(ACTIVE, Date.now()); }
export function hasDevicePin(uid) { return !!read(KEY, {})[uid]; }
export function forgetDevicePin(uid) { const m = read(KEY, {}); delete m[uid]; write(KEY, m); }
export function needsUnlock(uid) {
  if (!hasDevicePin(uid)) return false;
  return idleOnOpen || Date.now() - Number(read(ACTIVE, 0)) > IDLE_MS;
}
export function shouldOfferSetup(uid) { return !window.__NO_PINLOCK && !hasDevicePin(uid) && !read(SKIP, {})[uid] && !!(window.crypto && crypto.subtle); }

async function hashPin(pin, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
  const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
  return { salt: b64(salt), hash: b64(bits) };
}

const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One screen with a keypad; calls onPin(pin) after 4 digits. onPin returns a message to show (wrong) or nothing (done).
function keypad({ title, sub, foot, onPin, onLink }) {
  document.querySelectorAll('.pinlock').forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'pinlock';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="k-pad">
      <div class="pl-brand"><img src="img/logo.png" alt="Wintertuin" width="96" height="70"></div>
      <h2>${title}</h2><p class="muted pl-sub">${sub}</p>
      <div class="k-dots" aria-live="polite">${'<i></i>'.repeat(4)}</div>
      <div class="k-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        <span></span><button type="button" data-k="0">0</button>
        <button type="button" data-back class="k-sub" aria-label="${L({ en: 'Delete', nl: 'Wis' })}">&#9003;</button></div>
      <div class="pl-foot">${foot || ''}</div></div>`;
  document.body.appendChild(el);
  let pin = ''; let busy = false;
  const dots = () => el.querySelectorAll('.k-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const go = async () => {
    busy = true;
    const msg = await onPin(pin);
    busy = false;
    if (msg && el.isConnected) {
      const p = el.querySelector('.k-pad'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
      el.querySelector('.pl-sub').textContent = msg; pin = ''; dots();
    }
  };
  const add = (k) => { if (busy || pin.length >= 4) return; pin += k; dots(); if (pin.length === 4) go(); };
  el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => add(b.dataset.k)));
  el.querySelector('[data-back]').onclick = () => { pin = pin.slice(0, -1); dots(); };
  el.tabIndex = -1; el.focus();
  el.onkeydown = (e) => { if (/^[0-9]$/.test(e.key)) add(e.key); else if (e.key === 'Backspace') { pin = pin.slice(0, -1); dots(); } };
  el.querySelectorAll('[data-link]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); onLink(a.dataset.link, el); }));
  return el;
}

// Unlock: resolves true when the PIN is right, false when the person chose to sign in with the password or failed 5 times.
let unlocking = null;
export function showUnlock(me) {
  if (unlocking) return unlocking;
  unlocking = new Promise((resolve) => {
    const finish = (ok, el) => { el.remove(); unlocking = null; if (ok) markActive(); resolve(ok); };
    const first = String(me.full_name || '').split(/\s+/)[0];
    keypad({
      title: L({ en: `Hi ${esc(first)}`, nl: `Hoi ${esc(first)}` }),
      sub: L({ en: 'Type your PIN', nl: 'Typ je pincode' }),
      foot: `<span class="av big">${esc(initials(me.full_name))}</span><a href="#" data-link="password">${L({ en: 'Not you, or forgot your PIN? Sign in with your password', nl: 'Niet jij, of pincode vergeten? Inloggen met wachtwoord' })}</a>`,
      onLink: (_, el) => { forgetDevicePin(me.id); finish(false, el); },
      onPin: async (pin) => {
        const m = read(KEY, {}); const rec = m[me.id];
        if (!rec) return '';
        const { hash } = await hashPin(pin, rec.salt);
        if (hash === rec.hash) { rec.fails = 0; write(KEY, m); finish(true, document.querySelector('.pinlock')); return ''; }
        rec.fails = (rec.fails || 0) + 1; write(KEY, m);
        if (rec.fails >= MAX_FAILS) { forgetDevicePin(me.id); finish(false, document.querySelector('.pinlock')); return ''; }
        return L({ en: `Wrong PIN. ${MAX_FAILS - rec.fails} tries left.`, nl: `Verkeerde pincode. Nog ${MAX_FAILS - rec.fails} keer.` });
      },
    });
  });
  return unlocking;
}

// After signing in with the password: choose a PIN (twice), or "not now".
export function offerSetup(me) {
  return new Promise((resolve) => {
    let firstPin = null;
    const done = (el, ok) => { el.remove(); markActive(); resolve(ok); };
    const el = keypad({
      title: L({ en: 'Choose a PIN', nl: 'Kies een pincode' }),
      sub: L({ en: 'Next time you open the app on this device, these 4 digits are enough. The same PIN works on the clock-in tablet.',
        nl: 'De volgende keer dat je de app op dit toestel opent, zijn deze 4 cijfers genoeg. Dezelfde pincode werkt op de inkloktablet.' }),
      foot: `<a href="#" data-link="skip">${L({ en: 'Not now', nl: 'Niet nu' })}</a>`,
      onLink: (k, e) => { const s = read(SKIP, {}); s[me.id] = true; write(SKIP, s); done(e, false); },
      onPin: async (pin) => {
        if (!firstPin) {
          firstPin = pin;
          el.querySelector('h2').textContent = L({ en: 'Type it once more', nl: 'Typ hem nog een keer' });
          return L({ en: 'To be sure it is right.', nl: 'Om zeker te weten dat hij klopt.' });
        }
        if (pin !== firstPin) {
          firstPin = null; el.querySelector('h2').textContent = L({ en: 'Choose a PIN', nl: 'Kies een pincode' });
          return L({ en: 'The two PINs were not the same. Start again.', nl: 'De twee pincodes waren niet gelijk. Begin opnieuw.' });
        }
        const rec = await hashPin(pin);
        const m = read(KEY, {}); m[me.id] = { ...rec, name: me.full_name || '', fails: 0 }; write(KEY, m);
        try { if (deps && deps.sb) await deps.sb.rpc('set_my_kiosk_pin', { p_pin: pin }); } catch { /* the tablet is optional */ }
        done(el, true);
        return '';
      },
    });
    el.classList.add('setup');
  });
}

// Change the PIN from a settings screen (also updates the clock-in tablet when that is switched on)
export async function setDevicePin(me, pin) {
  const rec = await hashPin(pin);
  const m = read(KEY, {}); m[me.id] = { ...rec, name: me.full_name || '', fails: 0 }; write(KEY, m);
  markActive();
}
