// ============================================================
// SOP's
// ============================================================
let sopsCache = [];
let sopChecksCache = {};
let editingSopId = null;

async function loadSops() {
  const panel = el("panel-sops");
  panel.innerHTML = `<div class="loading">SOP's laden...</div>`;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("sops").select("*").order("category").order("sort_order");
  if (error) { panel.innerHTML = `<div class="empty">Kon SOP's niet laden: ${esc(error.message)}</div>`; return; }

  const { data: checks } = await sb.from("sop_checks").select("*").eq("check_date", today);
  sopChecksCache = {};
  (checks || []).forEach(c => { sopChecksCache[`${c.sop_id}_${c.item_index}`] = c.checked; });

  sopsCache = data || [];
  editingSopId = null;
  renderSops();
}

function renderSops() {
  const panel = el("panel-sops");
  const byCat = {};
  sopsCache.forEach(s => { (byCat[s.category] = byCat[s.category] || []).push(s); });

  let html = `<h2>SOP's</h2><p class="panelSub">Openings- en sluitlijsten en andere vaste procedures. Afvinklijst reset elke dag om middernacht.</p>`;

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
      <div class="field"><label>Categorie</label><input id="newSopCat" placeholder="bijv. opening, sluiting, algemeen"></div>
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

function renderSopEditForm(s) {
  const itemsText = (s.items || []).map(it => (typeof it === "string" ? it : it.text)).join("\n");
  return `<div class="card" data-sop-id="${s.id}" style="border: 1px solid var(--crust);">
    <div class="field"><label>Categorie</label><input id="editSopCat-${s.id}" value="${esc(s.category)}"></div>
    <div class="field"><label>Titel</label><input id="editSopTitle-${s.id}" value="${esc(s.title)}"></div>
    <div class="field"><label>Tekst</label><textarea id="editSopContent-${s.id}">${esc(s.content || "")}</textarea></div>
    <div class="field"><label>Checklist items (één per regel)</label><textarea id="editSopItems-${s.id}">${esc(itemsText)}</textarea></div>
    <div class="cardRow">
      <div>
        <button class="btn honey" onclick="saveSopEdit('${s.id}')">Opslaan</button>
        <button class="btn secondary" onclick="cancelEditSop()">Annuleren</button>
      </div>
      <button class="btn warn" onclick="deleteSop('${s.id}')">Verwijderen</button>
    </div>
  </div>`;
}

function editSop(id) {
  editingSopId = id;
  renderSops();
}

function cancelEditSop() {
  editingSopId = null;
  renderSops();
}

async function saveSopEdit(id) {
  const category = el(`editSopCat-${id}`).value.trim() || "algemeen";
  const title = el(`editSopTitle-${id}`).value.trim();
  const content = el(`editSopContent-${id}`).value.trim();
  const items = el(`editSopItems-${id}`).value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!title) { alert("Geef de SOP een titel."); return; }

  const { error } = await sb.from("sops").update({
    category, title, content, items,
    updated_by: currentProfile.id, updated_at: new Date().toISOString()
  }).eq("id", id);
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  loadSops();
}

async function deleteSop(id) {
  if (!confirm("Deze SOP verwijderen? Dit kan niet ongedaan gemaakt worden.")) return;
  const { error } = await sb.from("sops").delete().eq("id", id);
  if (error) { alert("Verwijderen mislukt: " + error.message); return; }
  loadSops();
}

async function addSop() {
  const category = el("newSopCat").value.trim() || "algemeen";
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
async function loadMenu() {
  const panel = el("panel-menu");
  panel.innerHTML = `<div class="loading">Menu laden...</div>`;
  const { data, error } = await sb.from("menu_items").select("*").eq("active", true).order("category").order("sort_order");
  if (error) { panel.innerHTML = `<div class="empty">Kon menu niet laden: ${esc(error.message)}</div>`; return; }

  let html = `<h2>Menu</h2><p class="panelSub">Gerechten met uitleg, foto's en instructievideo's.</p>`;

  if (!data || data.length === 0) {
    html += `<div class="empty">Nog geen menu-items toegevoegd.</div>`;
  } else {
    html += `<div class="menuGrid">`;
    data.forEach(m => {
      html += `<div class="menuCard">
        ${m.photo_url ? `<img src="${esc(m.photo_url)}" alt="${esc(m.name)}">` : ""}
        ${m.video_url ? `<iframe src="${esc(m.video_url)}" allowfullscreen></iframe>` : ""}
        <div class="body">
          <span class="tag">${esc(m.category || "")}</span>
          <h3>${esc(m.name)}</h3>
          ${m.price ? `<div class="price">&euro; ${Number(m.price).toFixed(2)}</div>` : ""}
          <p style="font-size:13.5px; color:var(--bean-light);">${esc(m.description || "")}</p>
          ${isManager() ? `<button class="btn secondary" onclick="removeMenuItem('${m.id}')">Verwijderen</button>` : ""}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (isManager()) {
    html += `<div class="managerBox">
      <h3>Nieuw gerecht toevoegen</h3>
      <div class="field"><label>Naam</label><input id="newMenuName"></div>
      <div class="field"><label>Categorie</label><input id="newMenuCat" placeholder="bakkerij / lunch / diner / dranken"></div>
      <div class="field"><label>Beschrijving</label><textarea id="newMenuDesc"></textarea></div>
      <div class="field"><label>Foto uploaden</label><input id="newMenuPhotoFile" type="file" accept="image/*"></div>
      <div class="field"><label>Video embed URL (optioneel)</label><input id="newMenuVideo" placeholder="https://www.youtube.com/embed/..."></div>
      <div class="field"><label>Prijs (&euro;)</label><input id="newMenuPrice" type="number" step="0.01"></div>
      <button class="btn honey" onclick="addMenuItem()">Toevoegen</button>
    </div>`;
  }

  panel.innerHTML = html;
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
  if (!confirm("Dit gerecht verwijderen?")) return;
  await sb.from("menu_items").update({ active: false }).eq("id", id);
  loadMenu();
}
