import { app, toast, toastError } from '../core.js';
import { t } from '../i18n.js';
import { setPassword } from '../data.js';

export function renderSetPassword(onDone) {
  app().className = 'app';
  app().innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" id="pw-form">
        <div class="logo"><img src="img/icon.svg" width="40" height="40" alt=""><h1>${t('pw_title')}</h1></div>
        <div class="field"><label>${t('pw_new')}</label><input type="password" name="pw" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label>${t('pw_repeat')}</label><input type="password" name="pw2" autocomplete="new-password" minlength="8" required></div>
        <button class="btn-primary btn-xl" type="submit">${t('save')}</button>
      </form>
    </div>`;
  const form = document.getElementById('pw-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.pw.value.length < 8) return toastError(new Error(t('pw_short')));
    if (form.pw.value !== form.pw2.value) return toastError(new Error(t('pw_mismatch')));
    try { await setPassword(form.pw.value); toast(t('pw_saved')); history.replaceState(null, '', location.pathname); onDone(); }
    catch (err) { toastError(err); }
  };
}
