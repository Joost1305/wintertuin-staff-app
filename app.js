// ============================================================
// Wintertuin staff app
// ============================================================
console.log("Wintertuin staff app — build 2026-09-12-10 (SOP categorie-dropdown, intro/geschiedenis bewerkbaar)");

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;   // auth.users row
let currentProfile = null; // profiles row (id, full_name, role, ...)
let allProfiles = [];      // cached list of all staff, for names + swap pickers
let isSignupMode = false;

const el = (id) => document.getElementById(id);
const esc = (s) => (s ?? "").toString().replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function fmtDate(d) {
  return new Date(d).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}
function fmtDateTime(dt) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ---------------- AUTH ----------------

el("authToggleLink").addEventListener("click", () => {
  isSignupMode = !isSignupMode;
  el("authSubmitBtn").textContent = isSignupMode ? "Account aanmaken" : "Inloggen";
  el("authToggleText").textContent = isSignupMode ? "Heb je al een account?" : "Nog geen account?";
  el("authToggleLink").textContent = isSignupMode ? "Inloggen" : "Account aanmaken";
  el("authName").style.display = isSignupMode ? "block" : "none";
  el("authNameLabel").style.display = isSignupMode ? "block" : "none";
  el("authMsg").innerHTML = "";
});

el("authSubmitBtn").addEventListener("click", async () => {
  const email = el("authEmail").value.trim();
  const password = el("authPassword").value;
  const name = el("authName").value.trim();
  const msg = el("authMsg");
  msg.innerHTML = "";

  if (!email || !password) {
    msg.innerHTML = '<div class="authMsg err">Vul e-mail en wachtwoord in.</div>';
    return;
  }
  el("authSubmitBtn").disabled = true;

  if (isSignupMode) {
    if (!name) {
      msg.innerHTML = '<div class="authMsg err">Vul je naam in.</div>';
      el("authSubmitBtn").disabled = false;
      return;
    }
    const { error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    });
    if (error) {
      msg.innerHTML = `<div class="authMsg err">${esc(error.message)}</div>`;
    } else {
      msg.innerHTML = '<div class="authMsg ok">Account aangemaakt. Als e-mailbevestiging aan staat, check je inbox. Anders ben je nu ingelogd.</div>';
    }
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      msg.innerHTML = `<div class="authMsg err">${esc(error.message)}</div>`;
    }
  }
  el("authSubmitBtn").disabled = false;
});

el("logoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    bootApp();
  } else {
    currentUser = null;
    currentProfile = null;
    if (badgeInterval) { clearInterval(badgeInterval); badgeInterval = null; }
    el("authScreen").style.display = "flex";
    el("appShell").style.display = "none";
  }
});

async function bootApp() {
  el("authScreen").style.display = "none";
  el("appShell").style.display = "flex";

  const { data: profile, error } = await sb.from("profiles").select("*").eq("id", currentUser.id).single();
  if (error || !profile) {
    // Profile trigger may not have finished yet on first signup, retry once.
    await new Promise(r => setTimeout(r, 800));
    const retry = await sb.from("profiles").select("*").eq("id", currentUser.id).single();
    currentProfile = retry.data;
  } else {
    currentProfile = profile;
  }

  el("whoName").textContent = currentProfile
    ? `${currentProfile.full_name}${currentProfile.role === "manager" ? " · manager" : ""}`
    : currentUser.email;

  const { data: profiles } = await sb.from("profiles").select("*").order("full_name");
  allProfiles = profiles || [];

  el("teamTabBtn").style.display = isManager() ? "" : "none";

  loadSops();
  loadMenu();
  loadLinks();
  loadRoster();
  loadCheckin();
  loadSwap();
  if (isManager()) loadTeam();

  refreshSwapBadge();
  if (badgeInterval) clearInterval(badgeInterval);
  badgeInterval = setInterval(refreshSwapBadge, 60000);
}

let badgeInterval = null;

// ---------------- TABS ----------------
document.querySelectorAll("nav.tabs button[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    el(`panel-${btn.dataset.tab}`).classList.add("active");
    const fnName = "load" + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
    if (typeof window[fnName] === "function") window[fnName]();
  });
});

function isManager() {
  return currentProfile && currentProfile.role === "manager";
}
