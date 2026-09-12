// ============================================================
// CHECK-IN
// ============================================================
let openCheckin = null;

async function loadCheckin() {
  const panel = el("panel-checkin");
  panel.innerHTML = `<div class="loading">Laden...</div>`;

  const { data: openRow } = await sb.from("checkins")
    .select("*").eq("staff_id", currentProfile.id).is("check_out_at", null)
    .order("check_in_at", { ascending: false }).limit(1).maybeSingle();
  openCheckin = openRow || null;

  const { data: history } = await sb.from("checkins")
    .select("*").eq("staff_id", currentProfile.id)
    .order("check_in_at", { ascending: false }).limit(15);

  let html = `<h2>Inklokken</h2><p class="panelSub">Klok in bij het begin van je dienst, uit bij het einde.</p>`;

  html += `<div class="card checkinBig">
    <div class="status">${openCheckin
      ? `Ingeklokt sinds ${fmtDateTime(openCheckin.check_in_at)}`
      : "Nu niet ingeklokt"}</div>
    <button class="btn ${openCheckin ? "warn" : "honey"} bigBtn" onclick="toggleCheckin()">
      ${openCheckin ? "Uitklokken" : "Inklokken"}
    </button>
  </div>`;

  html += `<h3 style="font-size:15px; margin: 22px 0 8px 0;">Jouw laatste keren</h3>`;
  if (!history || history.length === 0) {
    html += `<div class="empty">Nog geen check-ins.</div>`;
  } else {
    html += `<table class="simple"><thead><tr><th>Ingeklokt</th><th>Uitgeklokt</th></tr></thead><tbody>`;
    history.forEach(h => {
      html += `<tr><td>${fmtDateTime(h.check_in_at)}</td><td>${h.check_out_at ? fmtDateTime(h.check_out_at) : "-"}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  panel.innerHTML = html;
}

async function toggleCheckin() {
  if (openCheckin) {
    const { error } = await sb.from("checkins").update({ check_out_at: new Date().toISOString() }).eq("id", openCheckin.id);
    if (error) { alert("Uitklokken mislukt: " + error.message); return; }
  } else {
    const { error } = await sb.from("checkins").insert({
      staff_id: currentProfile.id, check_in_at: new Date().toISOString()
    });
    if (error) { alert("Inklokken mislukt: " + error.message); return; }
  }
  loadCheckin();
}

// ============================================================
// SHIFT SWAP
// ============================================================
async function loadSwap() {
  const panel = el("panel-swap");
  panel.innerHTML = `<div class="loading">Laden...</div>`;

  const today = new Date().toISOString().slice(0, 10);
  const { data: myShifts } = await sb.from("shifts")
    .select("*").eq("staff_id", currentProfile.id).gte("shift_date", today)
    .order("shift_date").limit(30);

  const { data: requests } = await sb.from("shift_swap_requests")
    .select("*, shifts(shift_date, start_time, end_time, section, staff_id), requester:requested_by(full_name), claimer:claimed_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(40);

  let html = `<h2>Ruilen</h2><p class="panelSub">Bied een dienst aan of neem een openstaande dienst over. Een manager keurt elke ruil goed.</p>`;

  // --- my shifts, offer a swap ---
  html += `<h3 style="font-size:15px; margin-bottom:8px;">Jouw aankomende diensten</h3>`;
  if (!myShifts || myShifts.length === 0) {
    html += `<div class="empty">Je hebt geen aankomende diensten.</div>`;
  } else {
    myShifts.forEach(s => {
      const alreadyRequested = (requests || []).some(r => r.shift_id === s.id && r.status !== "rejected" && r.status !== "cancelled");
      html += `<div class="card">
        <div class="cardRow">
          <div>${fmtDate(s.shift_date)} &middot; ${fmtTime(s.start_time)}&ndash;${fmtTime(s.end_time)} ${s.section ? `&middot; ${esc(s.section)}` : ""}</div>
          ${alreadyRequested
            ? `<span class="tag open">al aangeboden</span>`
            : `<button class="btn secondary" onclick="requestSwap('${s.id}')">Ruil aanbieden</button>`}
        </div>
      </div>`;
    });
  }

  // --- open requests staff can claim ---
  html += `<h3 style="font-size:15px; margin: 22px 0 8px 0;">Openstaande ruilverzoeken</h3>`;
  const open = (requests || []).filter(r => r.status === "open" && r.requested_by !== currentProfile.id);
  if (open.length === 0) {
    html += `<div class="empty">Geen openstaande verzoeken van anderen.</div>`;
  } else {
    open.forEach(r => {
      html += `<div class="card">
        <div class="cardRow">
          <div>
            ${r.shifts ? `${fmtDate(r.shifts.shift_date)} &middot; ${fmtTime(r.shifts.start_time)}&ndash;${fmtTime(r.shifts.end_time)} ${r.shifts.section ? `&middot; ${esc(r.shifts.section)}` : ""}` : "dienst"}<br>
            <span style="font-size:12.5px; color:var(--bean-light);">aangeboden door ${esc(r.requester ? r.requester.full_name : "?")}</span>
          </div>
          <button class="btn honey" onclick="claimSwap('${r.id}')">Ik neem hem over</button>
        </div>
      </div>`;
    });
  }

  // --- status of my own requests ---
  html += `<h3 style="font-size:15px; margin: 22px 0 8px 0;">Status van jouw verzoeken</h3>`;
  const mine = (requests || []).filter(r => r.requested_by === currentProfile.id);
  if (mine.length === 0) {
    html += `<div class="empty">Je hebt nog geen ruilverzoeken ingediend.</div>`;
  } else {
    mine.forEach(r => {
      html += `<div class="card">
        <div class="cardRow">
          <div>
            ${r.shifts ? `${fmtDate(r.shifts.shift_date)} &middot; ${fmtTime(r.shifts.start_time)}&ndash;${fmtTime(r.shifts.end_time)}` : "dienst"}
            ${r.claimer ? `<br><span style="font-size:12.5px; color:var(--bean-light);">overgenomen door ${esc(r.claimer.full_name)}</span>` : ""}
          </div>
          <span class="tag ${r.status}">${swapStatusLabel(r.status)}</span>
        </div>
      </div>`;
    });
  }

  // --- manager approval queue ---
  if (isManager()) {
    const pending = (requests || []).filter(r => r.status === "claimed");
    html += `<div class="managerBox">
      <h3>Goed te keuren ruilen</h3>
      ${pending.length === 0 ? `<div class="empty">Niets om goed te keuren.</div>` : pending.map(r => `
        <div class="card">
          <div class="cardRow">
            <div>
              ${r.shifts ? `${fmtDate(r.shifts.shift_date)} &middot; ${fmtTime(r.shifts.start_time)}&ndash;${fmtTime(r.shifts.end_time)}` : "dienst"}<br>
              <span style="font-size:12.5px; color:var(--bean-light);">
                van ${esc(r.requester ? r.requester.full_name : "?")} naar ${esc(r.claimer ? r.claimer.full_name : "?")}
              </span>
            </div>
            <div>
              <button class="btn honey" onclick="decideSwap('${r.id}', 'approved')">Goedkeuren</button>
              <button class="btn warn" onclick="decideSwap('${r.id}', 'rejected')">Afwijzen</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>`;
  }

  panel.innerHTML = html;
}

function swapStatusLabel(status) {
  return { open: "open", claimed: "wacht op goedkeuring", approved: "goedgekeurd", rejected: "afgewezen", cancelled: "geannuleerd" }[status] || status;
}

async function requestSwap(shiftId) {
  const reason = prompt("Reden voor de ruil (optioneel):") || null;
  const { error } = await sb.from("shift_swap_requests").insert({
    shift_id: shiftId, requested_by: currentProfile.id, reason, status: "open"
  });
  if (error) { alert("Aanbieden mislukt: " + error.message); return; }
  loadSwap();
  refreshSwapBadge();
}

async function claimSwap(requestId) {
  const { error } = await sb.from("shift_swap_requests")
    .update({ claimed_by: currentProfile.id, status: "claimed" })
    .eq("id", requestId);
  if (error) { alert("Overnemen mislukt: " + error.message); return; }
  loadSwap();
  refreshSwapBadge();
}

async function decideSwap(requestId, decision) {
  const { data: reqRow, error: fetchErr } = await sb.from("shift_swap_requests").select("*").eq("id", requestId).single();
  if (fetchErr) { alert(fetchErr.message); return; }

  const { error } = await sb.from("shift_swap_requests").update({
    status: decision, decided_at: new Date().toISOString(), decided_by: currentProfile.id
  }).eq("id", requestId);
  if (error) { alert("Bijwerken mislukt: " + error.message); return; }

  if (decision === "approved" && reqRow.claimed_by) {
    await sb.from("shifts").update({ staff_id: reqRow.claimed_by }).eq("id", reqRow.shift_id);
  }
  loadSwap();
  loadRoster();
  refreshSwapBadge();
}
