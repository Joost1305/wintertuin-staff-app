// ============================================================
// SOP's
// ============================================================
let sopsCache = [];
let sopChecksCache = {};
let editingSopId = null;
const SOP_DRAFT_PREFIX = "wintertuinSopDraft_";

function loadSopDraft(id) {
  try {
    const raw = localStorage.getItem(SOP_DRAFT_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveSopDraft(id, draft) {
  try { localStorage.setItem(SOP_DRAFT_PREFIX + id, JSON.stringify(draft)); } catch (e) { /* ignore */ }
}
function clearSopDraft(id) {
  try { localStorage.removeItem(SOP_DRAFT_PREFIX + id); } catch (e) { /* ignore */ }
}
function captureSopDraftFromForm(id) {
  if (!el(`editSopTitle-${id}`)) return;
  saveSopDraft(id, {
    category: el(`editSopCat-${id}`).value,
    title: el(`editSopTitle-${id}`).value,
    content: el(`editSopContent-${id}`).value,
    items: el(`editSopItems-${id}`).value
  });
}

async function loadSops() {
  const panel = el("panel-sops");
  const today = new Date().toISOString().slice(0, 10);

  // If mid-edit, don't blow away the open form (and its unsaved text) just
  // because the tab was re-entered or a background refresh fired.
  if (editingSopId !== null) return;

  panel.innerHTML = `<div class="loading">SOP's laden...</div>`;
  const { data, error } = await sb.from("sops").select("*").order("category").order("sort_order");
  if (error) { panel.innerHTML = `<div class="empty">Kon SOP's niet laden: ${esc(error.message)}</div>`; return; }

  const { data: checks } = await sb.from("sop_checks").select("*").eq("check_date", today);
  sopChecksCache = {};
  (checks || []).forEach(c => { sopChecksCache[`${c.sop_id}_${c.item_index}`] = c.checked; });

  sopsCache = data || [];
  renderSops();
}

function renderSops() {
  const panel = el("panel-sops");
  const byCat = {};
  sopsCache.forEach(s => { (byCat[s.category] = byCat[s.category] || []).push(s); });

  let html = `<h2>SOP's</h2><p class="panelSub">Openings- en sluitlijsten en andere vaste procedures. Afvinklijst reset elke dag om middernacht.</p>`;
  html += `<button class="btn secondary" style="margin-bottom:16px;" onclick="printSops()">Printen</button>
    <button class="btn secondary" style="margin-bottom:16px;" onclick="downloadSopsBackup()">Download back-up (.txt)</button>`;

  if (Object.keys(byCat).length === 0) {
    html += `<div class="empty">Nog geen SOP's toegevoegd.</div>`;
  }

  for (const cat of Object.keys(byCat)) {
    html += `<h3 style="font-size:15px; text-transform:uppercase; letter-spacing:0.06em; font-family:'IBM Plex Mono',monospace; color:var(--bean-light); margin: 18px 0 8px 0;">${esc(cat)}</h3>`;
    byCat[cat].forEach(s => {
      html += (s.id === editingSopId) ? renderSopEditForm(s) : renderSopCard(s);
    });
  }

  if (isManager()) {
    html += `<div class="managerBox">
      <h3>Nieuwe SOP toevoegen</h3>
      <div class="field"><label>Categorie</label>
        <select id="newSopCat" onchange="toggleNewCatField('newSopCatNew', this.value)">${sopCategoryOptions(null)}</select>
        <input id="newSopCatNew" placeholder="Naam nieuwe categorie" style="margin-top:6px; display:${sopsCache.length === 0 ? "block" : "none"};">
      </div>
      <div class="field"><label>Titel</label><input id="newSopTitle" placeholder="bijv. Ochtendcheck keuken"></div>
      <div class="field"><label>Tekst (optioneel)</label><textarea id="newSopContent"></textarea></div>
      <div class="field"><label>Checklist items (één per regel, optioneel)</label><textarea id="newSopItems" placeholder="Koffiemachine aanzetten&#10;Terraskussens buiten leggen"></textarea></div>
      <button class="btn honey" onclick="addSop()">SOP toevoegen</button>
    </div>`;
  }

  panel.innerHTML = html;
}

function renderSopCard(s) {
  return `<div class="card" data-sop-id="${s.id}">
    <div class="cardRow">
      <h3>${esc(s.title)}</h3>
      ${isManager() ? `<button class="btn secondary" onclick="editSop('${s.id}')">Bewerken</button>` : ""}
    </div>
    ${s.content ? `<p style="font-size:14px; color:var(--bean-light); margin: 8px 0;">${esc(s.content).replace(/\n/g, "<br>")}</p>` : ""}
    ${(s.items || []).length ? `<div style="margin-top:10px;">${(s.items || []).map((it, i) => {
      const checked = !!sopChecksCache[`${s.id}_${i}`];
      return `<label style="display:flex; gap:8px; align-items:flex-start; font-size:14px; margin-bottom:6px;">
        <input type="checkbox" style="margin-top:3px;" ${checked ? "checked" : ""} onchange="toggleSopCheck('${s.id}', ${i}, this.checked)">
        <span>${esc(typeof it === "string" ? it : it.text)}</span>
      </label>`;
    }).join("")}</div>` : ""}
  </div>`;
}

function sopCategoryOptions(selected) {
  const cats = [...new Set(sopsCache.map(s => s.category))].sort();
  return cats.map(c => `<option value="${esc(c)}" ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("")
    + `<option value="__new__">+ Nieuwe categorie&hellip;</option>`;
}

function renderSopEditForm(s) {
  const draft = loadSopDraft(s.id);
  const vals = draft || {
    category: s.category,
    title: s.title,
    content: s.content || "",
    items: (s.items || []).map(it => (typeof it === "string" ? it : it.text)).join("\n")
  };
  return `<div class="card" data-sop-id="${s.id}" style="border: 1px solid var(--crust);">
    ${draft ? `<p style="font-size:12px; color:var(--crust); margin:0 0 10px 0;">Niet-opgeslagen concept hersteld.</p>` : ""}
    <div class="field"><label>Categorie</label>
      <select id="editSopCat-${s.id}" onchange="toggleNewCatField('editSopCatNew-${s.id}', this.value)">${sopCategoryOptions(vals.category)}</select>
      <input id="editSopCatNew-${s.id}" placeholder="Naam nieuwe categorie" style="margin-top:6px; display:none;" oninput="captureSopDraftFromForm('${s.id}')">
    </div>
    <div class="field"><label>Titel</label><input id="editSopTitle-${s.id}" value="${esc(vals.title)}" oninput="captureSopDraftFromForm('${s.id}')"></div>
    <div class="field"><label>Tekst</label><textarea id="editSopContent-${s.id}" oninput="captureSopDraftFromForm('${s.id}')">${esc(vals.content)}</textarea></div>
    <div class="field"><label>Checklist items (één per regel)</label><textarea id="editSopItems-${s.id}" oninput="captureSopDraftFromForm('${s.id}')">${esc(vals.items)}</textarea></div>
    <div class="cardRow">
      <div>
        <button class="btn honey" onclick="saveSopEdit('${s.id}')">Opslaan</button>
        <button class="btn secondary" onclick="cancelEditSop('${s.id}')">Annuleren</button>
      </div>
      <button class="btn warn" onclick="deleteSop('${s.id}')">Verwijderen</button>
    </div>
  </div>`;
}

function toggleNewCatField(inputId, selectValue) {
  const input = el(inputId);
  if (!input) return;
  input.style.display = selectValue === "__new__" ? "block" : "none";
  if (selectValue === "__new__") input.focus();
}

function editSop(id) {
  editingSopId = id;
  renderSops();
}

function cancelEditSop(id) {
  if (id) clearSopDraft(id);
  editingSopId = null;
  loadSops();
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadSopsBackup() {
  const byCat = {};
  sopsCache.forEach(s => { (byCat[s.category] = byCat[s.category] || []).push(s); });

  let text = `Wintertuin, SOP's back-up\nGedownload op ${new Date().toLocaleString("nl-NL")}\n`;
  text += `${"=".repeat(50)}\n`;

  Object.keys(byCat).forEach(cat => {
    text += `\n\n${cat.toUpperCase()}\n${"-".repeat(cat.length)}\n`;
    byCat[cat].forEach(s => {
      text += `\n${s.title}\n`;
      if (s.content) text += `${s.content}\n`;
      (s.items || []).forEach(it => {
        text += `  [ ] ${typeof it === "string" ? it : it.text}\n`;
      });
    });
  });

  downloadTextFile(text, `wintertuin-sops-backup-${new Date().toISOString().slice(0, 10)}.txt`);
}

async function printSops() {
  const byCat = {};
  sopsCache.forEach(s => { (byCat[s.category] = byCat[s.category] || []).push(s); });
  const area = el("printArea");
  area.innerHTML = `<h1 style="font-family:'Instrument Serif', serif; font-size:28px; margin-bottom:16px;">SOP's</h1>
    ${Object.keys(byCat).map(cat => `
      <h2 style="font-size:16px; text-transform:uppercase; letter-spacing:0.06em; margin:20px 0 10px 0;">${esc(cat)}</h2>
      ${byCat[cat].map(s => `
        <div style="margin-bottom:16px; break-inside:avoid;">
          <h3 style="font-size:15px; margin:0 0 4px 0;">${esc(s.title)}</h3>
          ${s.content ? `<p style="font-size:13px; margin:0 0 6px 0;">${esc(s.content).replace(/\n/g, "<br>")}</p>` : ""}
          ${(s.items || []).length ? `<ul style="margin:0; padding-left:18px; font-size:13px;">${(s.items || []).map(it =>
            `<li style="margin-bottom:3px;">&#9633; ${esc(typeof it === "string" ? it : it.text)}</li>`).join("")}</ul>` : ""}
        </div>`).join("")}
    `).join("")}`;
  window.print();
}

async function saveSopEdit(id) {
  const catSelectVal = el(`editSopCat-${id}`).value;
  const category = (catSelectVal === "__new__" ? el(`editSopCatNew-${id}`).value.trim() : catSelectVal) || "algemeen";
  const title = el(`editSopTitle-${id}`).value.trim();
  const content = el(`editSopContent-${id}`).value.trim();
  const items = el(`editSopItems-${id}`).value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!title) { alert("Geef de SOP een titel."); return; }

  const { error } = await sb.from("sops").update({
    category, title, content, items,
    updated_by: currentProfile.id, updated_at: new Date().toISOString()
  }).eq("id", id);
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  clearSopDraft(id);
  editingSopId = null;
  loadSops();
}

async function deleteSop(id) {
  if (!confirm("Deze SOP verwijderen? Dit kan niet ongedaan gemaakt worden.")) return;
  const { error } = await sb.from("sops").delete().eq("id", id);
  if (error) { alert("Verwijderen mislukt: " + error.message); return; }
  clearSopDraft(id);
  editingSopId = null;
  loadSops();
}

async function addSop() {
  const catSelectVal = el("newSopCat").value;
  const category = (catSelectVal === "__new__" ? el("newSopCatNew").value.trim() : catSelectVal) || "algemeen";
  const title = el("newSopTitle").value.trim();
  const content = el("newSopContent").value.trim();
  const items = el("newSopItems").value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!title) { alert("Geef de SOP een titel."); return; }
  const { error } = await sb.from("sops").insert({
    category, title, content, items, updated_by: currentProfile.id
  });
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  loadSops();
}

async function toggleSopCheck(sopId, itemIndex, checked) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("sop_checks").upsert({
    sop_id: sopId, item_index: itemIndex, check_date: today,
    checked, checked_by: currentProfile.id, checked_at: new Date().toISOString()
  }, { onConflict: "sop_id,item_index,check_date" });
  if (error) alert("Opslaan van vinkje mislukt: " + error.message);
}

// ============================================================
// MENU
// ============================================================
let menuCache = [];
let editingMenuId = null;
const GROUP_LABELS = { food: "Food", beverage: "Beverage" };

async function loadMenu() {
  const panel = el("panel-menu");
  if (editingMenuId !== null) return; // don't wipe an open edit form

  panel.innerHTML = `<div class="loading">Menu laden...</div>`;
  const { data, error } = await sb.from("menu_items").select("*").eq("active", true)
    .order("group_type").order("category").order("sort_order");
  if (error) { panel.innerHTML = `<div class="empty">Kon menu niet laden: ${esc(error.message)}</div>`; return; }
  menuCache = data || [];
  renderMenu();
}

function renderMenu() {
  const panel = el("panel-menu");
  let html = `<h2>Menu</h2><p class="panelSub">Gerechten en dranken met uitleg, foto's en instructievideo's.</p>`;

  if (menuCache.length === 0) {
    html += `<div class="empty">Nog geen menu-items toegevoegd.</div>`;
  }

  ["food", "beverage"].forEach(group => {
    const items = menuCache.filter(m => (m.group_type || "food") === group);
    if (items.length === 0) return;
    html += `<h3 style="font-size:15px; text-transform:uppercase; letter-spacing:0.06em; font-family:'IBM Plex Mono',monospace; color:var(--bean-light); margin: 22px 0 10px 0;">${GROUP_LABELS[group]}</h3>`;
    html += `<div class="menuGrid">`;
    items.forEach(m => {
      html += (m.id === editingMenuId) ? renderMenuEditForm(m) : renderMenuCard(m);
    });
    html += `</div>`;
  });

  if (isManager()) {
    html += `<div class="managerBox">
      <h3>Nieuw item toevoegen</h3>
      <div class="field"><label>Hoofdcategorie</label>
        <select id="newMenuGroup"><option value="food">Food</option><option value="beverage">Beverage</option></select>
      </div>
      <div class="field"><label>Naam</label><input id="newMenuName"></div>
      <div class="field"><label>Subcategorie</label><input id="newMenuCat" placeholder="bijv. bakkerij, lunch, diner, koffie, wijn"></div>
      <div class="field"><label>Beschrijving</label><textarea id="newMenuDesc"></textarea></div>
      <div class="field"><label>Foto uploaden</label><input id="newMenuPhotoFile" type="file" accept="image/*"></div>
      <div class="field"><label>Video embed URL (optioneel)</label><input id="newMenuVideo" placeholder="https://www.youtube.com/embed/..."></div>
      <div class="field"><label>Prijs (&euro;)</label><input id="newMenuPrice" type="number" step="0.01"></div>
      <button class="btn honey" onclick="addMenuItem()">Toevoegen</button>
    </div>`;
  }

  panel.innerHTML = html;
}

function renderMenuCard(m) {
  return `<div class="menuCard">
    ${m.photo_url ? `<img src="${esc(m.photo_url)}" alt="${esc(m.name)}">` : ""}
    ${m.video_url ? `<iframe src="${esc(m.video_url)}" allowfullscreen></iframe>` : ""}
    <div class="body">
      <span class="tag">${esc(m.category || "")}</span>
      <h3>${esc(m.name)}</h3>
      ${m.price ? `<div class="price">&euro; ${Number(m.price).toFixed(2)}</div>` : ""}
      <p style="font-size:13.5px; color:var(--bean-light);">${esc(m.description || "")}</p>
      ${isManager() ? `<button class="btn secondary" onclick="editMenuItem('${m.id}')">Bewerken</button>` : ""}
    </div>
  </div>`;
}

function renderMenuEditForm(m) {
  return `<div class="menuCard" style="border:1px solid var(--crust); grid-column: 1 / -1;">
    <div class="body">
      <div class="field"><label>Hoofdcategorie</label>
        <select id="editMenuGroup-${m.id}">
          <option value="food" ${m.group_type === "food" ? "selected" : ""}>Food</option>
          <option value="beverage" ${m.group_type === "beverage" ? "selected" : ""}>Beverage</option>
        </select>
      </div>
      <div class="field"><label>Naam</label><input id="editMenuName-${m.id}" value="${esc(m.name)}"></div>
      <div class="field"><label>Subcategorie</label><input id="editMenuCat-${m.id}" value="${esc(m.category || "")}"></div>
      <div class="field"><label>Beschrijving</label><textarea id="editMenuDesc-${m.id}">${esc(m.description || "")}</textarea></div>
      <div class="field"><label>Nieuwe foto (optioneel, vervangt de huidige)</label><input id="editMenuPhotoFile-${m.id}" type="file" accept="image/*"></div>
      <div class="field"><label>Video embed URL</label><input id="editMenuVideo-${m.id}" value="${esc(m.video_url || "")}"></div>
      <div class="field"><label>Prijs (&euro;)</label><input id="editMenuPrice-${m.id}" type="number" step="0.01" value="${m.price ?? ""}"></div>
      <button class="btn honey" onclick="saveMenuEdit('${m.id}')">Opslaan</button>
      <button class="btn secondary" onclick="cancelEditMenu()">Annuleren</button>
      <button class="btn warn" onclick="removeMenuItem('${m.id}')">Verwijderen</button>
    </div>
  </div>`;
}

function editMenuItem(id) {
  editingMenuId = id;
  renderMenu();
}

function cancelEditMenu() {
  editingMenuId = null;
  loadMenu();
}

async function saveMenuEdit(id) {
  const name = el(`editMenuName-${id}`).value.trim();
  if (!name) { alert("Geef het item een naam."); return; }

  const updates = {
    name,
    group_type: el(`editMenuGroup-${id}`).value,
    category: el(`editMenuCat-${id}`).value.trim(),
    description: el(`editMenuDesc-${id}`).value.trim(),
    video_url: el(`editMenuVideo-${id}`).value.trim() || null,
    price: el(`editMenuPrice-${id}`).value ? Number(el(`editMenuPrice-${id}`).value) : null
  };

  const fileInput = el(`editMenuPhotoFile-${id}`);
  const file = fileInput.files && fileInput.files[0];
  if (file) {
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await sb.storage.from("menu-photos").upload(path, file);
    if (upErr) { alert("Foto uploaden mislukt: " + upErr.message); return; }
    const { data: pub } = sb.storage.from("menu-photos").getPublicUrl(path);
    updates.photo_url = pub.publicUrl;
  }

  const { error } = await sb.from("menu_items").update(updates).eq("id", id);
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  editingMenuId = null;
  loadMenu();
}

async function addMenuItem() {
  const name = el("newMenuName").value.trim();
  if (!name) { alert("Geef het gerecht een naam."); return; }

  let photo_url = null;
  const fileInput = el("newMenuPhotoFile");
  const file = fileInput.files && fileInput.files[0];
  if (file) {
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await sb.storage.from("menu-photos").upload(path, file);
    if (upErr) { alert("Foto uploaden mislukt: " + upErr.message); return; }
    const { data: pub } = sb.storage.from("menu-photos").getPublicUrl(path);
    photo_url = pub.publicUrl;
  }

  const { error } = await sb.from("menu_items").insert({
    name,
    group_type: el("newMenuGroup").value,
    category: el("newMenuCat").value.trim(),
    description: el("newMenuDesc").value.trim(),
    photo_url,
    video_url: el("newMenuVideo").value.trim() || null,
    price: el("newMenuPrice").value ? Number(el("newMenuPrice").value) : null
  });
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  loadMenu();
}

async function removeMenuItem(id) {
  if (!confirm("Dit item verwijderen?")) return;
  await sb.from("menu_items").update({ active: false }).eq("id", id);
  editingMenuId = null;
  loadMenu();
}
