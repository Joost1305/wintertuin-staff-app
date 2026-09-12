// ============================================================
// LINKS (recipe database, finances, other resources)
// ============================================================
async function loadLinks() {
  const panel = el("panel-links");
  panel.innerHTML = `<div class="loading">Links laden...</div>`;
  const { data, error } = await sb.from("resources").select("*").order("sort_order");
  if (error) { panel.innerHTML = `<div class="empty">Kon links niet laden: ${esc(error.message)}</div>`; return; }

  let html = `<h2>Links</h2><p class="panelSub">Receptendatabase, financi&euml;n en andere naslagwerken.</p>`;

  if (!data || data.length === 0) {
    html += `<div class="empty">Nog geen links toegevoegd.</div>`;
  } else {
    data.forEach(r => {
      html += `<div class="card">
        <div class="cardRow">
          <div>
            <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a></h3>
            ${r.note ? `<p style="font-size:13.5px; color:var(--bean-light); margin: 4px 0 0 0;">${esc(r.note)}</p>` : ""}
          </div>
          ${isManager() ? `<button class="btn secondary" onclick="removeResource('${r.id}')">Verwijderen</button>` : ""}
        </div>
      </div>`;
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
  loadLinks();
}
