// Data layer: the Supabase client and the few helpers every page uses.
// Security does not live here: Row Level Security in the database enforces every rule.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// Default storage key on purpose: Wintertuin Finance uses the same one, so one login works in both apps.
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export class ApiError extends Error {
  constructor(status, message) { super(message || `Error ${status}`); this.status = status; }
}
export function check(res) {
  if (res.error) throw new ApiError(res.status || 400, res.error.message || 'Request failed');
  return res.data;
}

export async function signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); }
export async function signUp(email, password, full_name) {
  check(await sb.auth.signUp({ email, password, options: { data: { full_name } } }));
}
export async function signOut() { await sb.auth.signOut(); }
export async function forgotPassword(email) {
  check(await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` }));
}
export async function setPassword(password) { check(await sb.auth.updateUser({ password })); }

// Who am I? The profile row is created by a database trigger on sign-up.
export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new ApiError(401, 'Not signed in');
  let p = check(await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
  if (!p) { // a brand-new sign-up: the trigger may need a moment
    await new Promise((r) => setTimeout(r, 800));
    p = check(await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
  }
  if (!p) throw new ApiError(403, 'no_profile');
  return { ...p, email: p.email || session.user.email };
}
export async function loadProfiles() {
  return check(await sb.from('profiles').select('*').order('full_name'));
}
export async function setLanguage(id, l) { check(await sb.from('profiles').update({ language: l }).eq('id', id)); }

// Staff accounts are created and reset by the admin-users edge function (managers only, checked server-side).
export async function adminUsers(body) {
  const { data, error } = await sb.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* keep default */ }
    throw new ApiError(400, msg);
  }
  if (data && data.error) throw new ApiError(400, data.error);
  return data;
}
