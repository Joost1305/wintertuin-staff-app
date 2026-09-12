// ============================================================
// TEAM (manager-only: names, roles, accounts, and passwords —
// no Supabase dashboard needed for any of it)
// ============================================================
async function loadTeam() {
  const panel = el("panel-team");
  if (!isManager()) { panel.innerHTML = ""; return; }
  panel.innerHTML = `<div class="loading">Laden...</div>`;

  const { data, error } = await sb.from("profiles").select("*").order("full_name");
  if (error) { panel.innerHTML = `<div class="empty">Kon team niet laden: ${esc(error.message)}</div>`; return; }

  let html = `<h2>Team</h2><p class="panelSub">Namen, rollen, accounts en wachtwoorden beheren, zonder de Supabase SQL-editor.</p>`;
  html += `<div id="credentialsBox"></div>`;
  html += `<table class="simple"><thead><tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Actief</th><th></th></tr></thead><tbody>`;
  (data || []).forEach(p => {
    html += `<tr>
      <td>
        <input type="text" value="${esc(p.full_name)}" style="width:140px; padding:6px 8px; border:1px solid #d8cdb8; border-radius:6px; font-family:inherit; font-size:13.5px;"
          onchange="renameStaff('${p.id}', this.value)">
        ${p.id === currentProfile.id ? ' <span class="mono" style="font-size:11px; color:var(--bean-light);">(jij)</span>' : ""}
      </td>
      <td style="font-size:12.5px; color:var(--bean-light);">${esc(p.email || "")}</td>
      <td>
        <select onchange="changeRole('${p.id}', this.value)" ${p.id === currentProfile.id ? "disabled" : ""}>
          <option value="staff" ${p.role === "staff" ? "selected" : ""}>staff</option>
          <option value="manager" ${p.role === "manager" ? "selected" : ""}>manager</option>
        </select>
      </td>
      <td>
        <input type="checkbox" ${p.active ? "checked" : ""} ${p.id === currentProfile.id ? "disabled" : ""}
          onchange="changeActive('${p.id}', this.checked)">
      </td>
      <td>
        ${p.id === currentProfile.id ? "" : `<button class="btn secondary" style="font-size:11px; padding:5px 8px;" onclick="resetStaffPassword('${p.id}', '${esc(p.full_name).replace(/'/g, "\\'")}')">Wachtwoord resetten</button>`}
      </td>
    </tr>`;
  });
  html += `</tbody></table>
  <p style="font-size:12.5px; color:var(--bean-light); margin-top:12px;">Je kunt jezelf hier niet aanpassen, dat voorkomt dat je per ongeluk jezelf buitensluit. Gebruik "Wachtwoord vergeten" op het inlogscherm om je eigen wachtwoord te wijzigen.</p>`;

  html += `<div class="managerBox">
    <h3>Nieuw account aanmaken</h3>
    <div class="field"><label>Naam</label><input id="newStaffName" placeholder="bijv. Anna de Vries"></div>
    <div class="field"><label>E-mail</label><input id="newStaffEmail" type="email" placeholder="naam@voorbeeld.nl"></div>
    <div class="field"><label>Wachtwoord</label>
      <div style="display:flex; gap:8px;">
        <input id="newStaffPassword" value="${generatePassword()}" style="flex:1;">
        <button class="btn secondary" type="button" onclick="el('newStaffPassword').value = generatePassword()">Genereer nieuw</button>
      </div>
    </div>
    <button class="btn honey" onclick="createStaffAccount()">Account aanmaken</button>
  </div>`;

  panel.innerHTML = html;
}

function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no confusing 0/O/1/l/i
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function showCredentialsBox(name, email, password) {
  const text = `Inloggegevens Wintertuin-app voor ${name}\nE-mail: ${email}\nWachtwoord: ${password}\nLink: ${location.href}`;
  el("credentialsBox").innerHTML = `<div class="card" style="border:1px solid var(--crust);">
    <h3 style="font-size:15px; margin-bottom:8px;">Inloggegevens voor ${esc(name)}</h3>
    <p class="mono" style="font-size:13px; margin:0 0 10px 0;">${esc(email)} &middot; ${esc(password)}</p>
    <button class="btn honey" onclick="copyCredentials(${JSON.stringify(text)})">Kopieer</button>
    <a class="btn secondary" style="text-decoration:none; display:inline-block;" target="_blank"
       href="https://wa.me/?text=${encodeURIComponent(text)}">Deel via WhatsApp</a>
    <button class="btn secondary" onclick="el('credentialsBox').innerHTML=''">Sluiten</button>
    <p style="font-size:12px; color:var(--bean-light); margin:10px 0 0 0;">Dit wachtwoord wordt nergens anders getoond, kopieer of deel het nu.</p>
  </div>`;
}

async function copyCredentials(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Gekopieerd naar klembord.");
  } catch (e) {
    prompt("Kopieer handmatig:", text);
  }
}

async function createStaffAccount() {
  const full_name = el("newStaffName").value.trim();
  const email = el("newStaffEmail").value.trim();
  const password = el("newStaffPassword").value.trim();
  if (!full_name || !email || !password) { alert("Vul naam, e-mail en wachtwoord in."); return; }

  const { data, error } = await sb.functions.invoke("admin-users", {
    body: { action: "create", full_name, email, password }
  });
  const errMsg = error ? (error.message || "onbekende fout") : (data && data.error);
  if (errMsg) { alert("Aanmaken mislukt: " + errMsg); return; }

  showCredentialsBox(full_name, email, password);
  loadTeam();
}

async function resetStaffPassword(profileId, name) {
  if (!confirm(`Nieuw wachtwoord genereren voor ${name}? Het oude wachtwoord werkt daarna niet meer.`)) return;
  const password = generatePassword();
  const { data, error } = await sb.functions.invoke("admin-users", {
    body: { action: "reset_password", user_id: profileId, password }
  });
  const errMsg = error ? (error.message || "onbekende fout") : (data && data.error);
  if (errMsg) { alert("Resetten mislukt: " + errMsg); return; }

  const p = allProfiles.find(x => x.id === profileId);
  showCredentialsBox(name, p ? p.email : "", password);
}

async function renameStaff(profileId, newName) {
  newName = newName.trim();
  if (!newName) { alert("Naam mag niet leeg zijn."); loadTeam(); return; }
  const { error } = await sb.from("profiles").update({ full_name: newName }).eq("id", profileId);
  if (error) { alert("Bijwerken mislukt: " + error.message); loadTeam(); return; }
  const { data: profiles } = await sb.from("profiles").select("*").order("full_name");
  allProfiles = profiles || [];
  if (profileId === currentProfile.id) {
    currentProfile.full_name = newName;
    el("whoName").textContent = `${currentProfile.full_name}${currentProfile.role === "manager" ? " · manager" : ""}`;
  }
}

async function changeRole(profileId, newRole) {
  const { error } = await sb.from("profiles").update({ role: newRole }).eq("id", profileId);
  if (error) { alert("Bijwerken mislukt: " + error.message); loadTeam(); return; }
  const { data: profiles } = await sb.from("profiles").select("*").order("full_name");
  allProfiles = profiles || [];
}

async function changeActive(profileId, active) {
  const { error } = await sb.from("profiles").update({ active }).eq("id", profileId);
  if (error) { alert("Bijwerken mislukt: " + error.message); loadTeam(); }
}

// ============================================================
// NOTIFICATIONS (in-app badge, no external email/push needed)
// ============================================================
async function refreshSwapBadge() {
  if (!currentProfile) return;
  const badge = el("swapBadge");
  let count = 0;

  if (isManager()) {
    // managers: swaps waiting for a decision
    const { count: c } = await sb.from("shift_swap_requests")
      .select("id", { count: "exact", head: true }).eq("status", "claimed");
    count = c || 0;
  } else {
    // staff: open offers from colleagues they haven't already responded to,
    // plus their own requests that just got a decision.
    const { count: openCount } = await sb.from("shift_swap_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open").neq("requested_by", currentProfile.id);

    const { count: decidedCount } = await sb.from("shift_swap_requests")
      .select("id", { count: "exact", head: true })
      .eq("requested_by", currentProfile.id)
      .in("status", ["approved", "rejected"]);

    count = (openCount || 0) + (decidedCount || 0);
  }

  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}
