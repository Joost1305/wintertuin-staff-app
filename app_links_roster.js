// ============================================================
// LINKS (recipe database, finances, other resources)
// ============================================================
let resourcesCache = [];
let editingResourceId = null;

async function loadLinks() {
  const panel = el("panel-links");
  if (editingResourceId !== null) return; // don't wipe an open edit form

  panel.innerHTML = `<div class="loading">Links laden...</div>`;
  const { data, error } = await sb.from("resources").select("*").order("sort_order");
  if (error) { panel.innerHTML = `<div class="empty">Kon links niet laden: ${esc(error.message)}</div>`; return; }
  resourcesCache = data || [];
  renderLinks();
}

function renderLinks() {
  const panel = el("panel-links");
  let html = `<h2>Links</h2><p class="panelSub">Receptendatabase, financi&euml;n en andere naslagwerken.</p>`;

  if (resourcesCache.length === 0) {
    html += `<div class="empty">Nog geen links toegevoegd.</div>`;
  } else {
    resourcesCache.forEach(r => {
      html += (r.id === editingResourceId) ? renderResourceEditForm(r) : renderResourceCard(r);
    });
  }

  if (isManager()) {
    html += `<div class="managerBox">
      <h3>Nieuwe link toevoegen</h3>
      <div class="field"><label>Naam</label><input id="newResLabel" placeholder="bijv. Receptendatabase"></div>
      <div class="field"><label>URL</label><input id="newResUrl" placeholder="https://..."></div>
      <div class="field"><label>Notitie (bijv. wachtwoord-hint)</label><input id="newResNote" placeholder="Wachtwoord: vraag aan Mette"></div>
      <button class="btn honey" onclick="addResource()">Toevoegen</button>
    </div>`;
  }

  panel.innerHTML = html;
}

function renderResourceCard(r) {
  return `<div class="card">
    <div class="cardRow">
      <div>
        <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a></h3>
        ${r.note ? `<p style="font-size:13.5px; color:var(--bean-light); margin: 4px 0 0 0;">${esc(r.note)}</p>` : ""}
      </div>
      ${isManager() ? `<button class="btn secondary" onclick="editResource('${r.id}')">Bewerken</button>` : ""}
    </div>
  </div>`;
}

function renderResourceEditForm(r) {
  return `<div class="card" style="border:1px solid var(--crust);">
    <div class="field"><label>Naam</label><input id="editResLabel-${r.id}" value="${esc(r.label)}"></div>
    <div class="field"><label>URL</label><input id="editResUrl-${r.id}" value="${esc(r.url)}"></div>
    <div class="field"><label>Notitie</label><input id="editResNote-${r.id}" value="${esc(r.note || "")}"></div>
    <button class="btn honey" onclick="saveResourceEdit('${r.id}')">Opslaan</button>
    <button class="btn secondary" onclick="cancelEditResource()">Annuleren</button>
    <button class="btn warn" onclick="removeResource('${r.id}')">Verwijderen</button>
  </div>`;
}

function editResource(id) {
  editingResourceId = id;
  renderLinks();
}

function cancelEditResource() {
  editingResourceId = null;
  loadLinks();
}

async function saveResourceEdit(id) {
  const label = el(`editResLabel-${id}`).value.trim();
  const url = el(`editResUrl-${id}`).value.trim();
  if (!label || !url) { alert("Vul naam en URL in."); return; }
  const { error } = await sb.from("resources").update({
    label, url, note: el(`editResNote-${id}`).value.trim()
  }).eq("id", id);
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  editingResourceId = null;
  loadLinks();
}

async function addResource() {
  const label = el("newResLabel").value.trim();
  const url = el("newResUrl").value.trim();
  if (!label || !url) { alert("Vul naam en URL in."); return; }
  const { error } = await sb.from("resources").insert({ label, url, note: el("newResNote").value.trim() });
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  loadLinks();
}

async function removeResource(id) {
  if (!confirm("Deze link verwijderen?")) return;
  await sb.from("resources").delete().eq("id", id);
  editingResourceId = null;
  loadLinks();
}
