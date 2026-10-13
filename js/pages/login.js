import { app, toast, toastError, renderLangToggle } from '../core.js';
import { t } from '../i18n.js';
import { signIn, signUp, forgotPassword } from '../data.js';

export function renderLogin(onSuccess) {
  let signup = false;
  app().className = 'app';
  const draw = () => {
    app().innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" id="login-form" autocomplete="on">
        <div class="logo"><img src="img/icon.svg" width="40" height="40" alt="">
          <div style="flex:1"><h1>${signup ? t('signup_title') : t('login_title')}</h1><div class="muted small">${t('login_sub')}</div></div>
          <div class="lang-toggle" id="login-lang" role="group" aria-label="Language"></div></div>
        ${signup ? `<div class="field"><label>${t('name')}</label><input name="full_name" autocomplete="name" required></div>` : ''}
        <div class="field"><label>${t('email')}</label><input type="email" name="email" autocomplete="username" required></div>
        <div class="field"><label>${t('password')}</label><input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 8 : 1}" required></div>
        <button class="btn-primary btn-xl" type="submit">${signup ? t('signup_btn') : t('sign_in')}</button>
        <div class="forgot-row">${signup ? '' : `<button type="button" class="link-btn" id="forgot-btn">${t('forgot_pw')}</button> · `}
          <button type="button" class="link-btn" id="mode-btn">${signup ? t('have_account') : t('no_account')}</button></div>
        <div class="note">${t('login_note')}</div>
      </form>
    </div>`;
    const form = document.getElementById('login-form');
    renderLangToggle(document.getElementById('login-lang'));
    document.getElementById('mode-btn').onclick = () => { signup = !signup; draw(); };
    const fb = document.getElementById('forgot-btn');
    if (fb) fb.onclick = async (e) => {
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
      try {
        if (signup) { await signUp(form.email.value.trim(), form.password.value, form.full_name.value.trim()); toast(t('signup_done')); }
        else await signIn(form.email.value.trim(), form.password.value);
        await onSuccess();
      } catch (err) { toastError(err); }
      btn.disabled = false;
    };
  };
  draw();
}
