// About pages (intro and history): text blocks are stored in the database (about_content),
// so a manager's edits are saved for everyone. Everyone else reads; without a login you see the default text.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const L = {
  en: { hint: 'Managers: click Edit to change the text', edit: 'Edit', save: 'Save', cancel: 'Cancel', editing: 'Click any text to change it, then Save',
        saved: 'Saved for everyone', failed: 'Saving failed', nothing: 'Nothing changed' },
  nl: { hint: 'Managers: klik op Bewerken om de tekst te wijzigen', edit: 'Bewerken', save: 'Opslaan', cancel: 'Annuleren', editing: 'Klik op tekst om te wijzigen, daarna Opslaan',
        saved: 'Opgeslagen voor iedereen', failed: 'Opslaan mislukt', nothing: 'Niets gewijzigd' },
};
let lang = 'en';
try { lang = localStorage.getItem('wtteam_lang') === 'nl' ? 'nl' : 'en'; } catch { /* private mode */ }
const t = (k) => L[lang][k];

// Keep only harmless markup: no scripts, frames or event handlers
export function clean(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => {
    if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
  }));
  return doc.body.firstChild.innerHTML;
}
function toast(msg, error) {
  const el = document.getElementById('about-toast');
  el.textContent = msg; el.className = `about-toast ${error ? 'error' : ''}`; el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

export async function initAbout(page) {
  const blocks = [...document.querySelectorAll('[data-edit]')];
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  try {
    const { data } = await sb.from('about_content').select('key, html').eq('page', page);
    const saved = Object.fromEntries((data || []).map((r) => [r.key, r.html]));
    blocks.forEach((b) => { if (saved[b.dataset.edit] != null) b.innerHTML = clean(saved[b.dataset.edit]); });
  } catch { /* keep the default text */ }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data: me } = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
  if (!me || me.role !== 'manager') return;

  const tools = document.getElementById('edit-tools');
  const hint = document.getElementById('edit-hint');
  let original = {};
  const view = () => {
    document.body.classList.remove('editing');
    blocks.forEach((b) => b.removeAttribute('contenteditable'));
    hint.textContent = t('hint');
    tools.innerHTML = `<button class="btn btn-primary" id="ab-edit">${t('edit')}</button>`;
    document.getElementById('ab-edit').onclick = edit;
  };
  const edit = () => {
    original = Object.fromEntries(blocks.map((b) => [b.dataset.edit, b.innerHTML]));
    document.body.classList.add('editing');
    blocks.forEach((b) => b.setAttribute('contenteditable', 'true'));
    hint.textContent = t('editing');
    tools.innerHTML = `<button class="btn" id="ab-cancel">${t('cancel')}</button> <button class="btn btn-primary" id="ab-save">${t('save')}</button>`;
    document.getElementById('ab-cancel').onclick = () => { blocks.forEach((b) => { b.innerHTML = original[b.dataset.edit]; }); view(); };
    document.getElementById('ab-save').onclick = save;
  };
  const save = async () => {
    const rows = blocks.filter((b) => b.innerHTML !== original[b.dataset.edit])
      .map((b) => ({ page, key: b.dataset.edit, html: clean(b.innerHTML), updated_at: new Date().toISOString() }));
    if (!rows.length) { toast(t('nothing')); view(); return; }
    const { error } = await sb.from('about_content').upsert(rows, { onConflict: 'page,key' });
    if (error) { toast(`${t('failed')}: ${error.message}`, true); return; }
    toast(t('saved')); view();
  };
  view();
}
