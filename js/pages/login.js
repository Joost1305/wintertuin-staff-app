import { app, toast, toastError, renderLangToggle } from '../core.js';
import { t } from '../i18n.js';
import { signIn, forgotPassword } from '../data.js';

// No self sign-up: managers create accounts in Settings, Team and accounts.
export function renderLogin(onSuccess) {
  app().className = 'app';
  app().innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" id="login-form" autocomplete="on">
        <div class="logo"><img src="img/icon.svg" width="40" height="40" alt="">
          <div style="flex:1"><h1>${t('login_title')}</h1><div class="muted small">${t('login_sub')}</div></div>
          <div class="lang-toggle" id="login-lang" role="group" aria-label="Language"></div></div>
        <div class="field"><label>${t('email')}</label><input type="email" name="email" autocomplete="username" required></div>
        <div class="field"><label>${t('password')}</label><input type="password" name="password" autocomplete="current-password" required></div>
        <button class="btn-primary btn-xl" type="submit">${t('sign_in')}</button>
        <div class="forgot-row"><button type="button" class="link-btn" id="forgot-btn">${t('forgot_pw')}</button></div>
        <div class="note">${t('login_note')} ${t('no_account_note')}</div>
      </form>
    </div>`;
  const form = document.getElementById('login-form');
  renderLangToggle(document.getElementById('login-lang'));
  document.getElementById('forgot-btn').onclick = async (e) => {
    const email = form.email.value.trim();
    if (!email || !form.email.checkValidity()) { toastError(new Error(t('forgot_need_email'))); form.email.focus(); return; }
    e.target.disabled = true;
    try { await forgotPassword(email); toast(t('forgot_sent', { e: email })); } catch (err) { toastError(err); }
    e.target.disabled = false;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try { await signIn(form.email.value.trim(), form.password.value); await onSuccess(); } catch (err) { toastError(err); }
    btn.disabled = false;
  };
}
