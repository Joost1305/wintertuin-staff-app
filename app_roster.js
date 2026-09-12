// ============================================================
// ROSTER — week grid, own shifts in color, click to plan,
// month export to calendar, print "wie werkt vandaag",
// and a scheduled-vs-clocked hours overview.
// ============================================================
const dayNamesShort = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const monthNamesNl = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

let rosterWeekStart = null; // Date, always a Monday
let rosterShiftsCache = [];
let rosterTemplatesCache = [];
let editingShiftId = null;
let draggedPayload = null; // fallback for browsers/touch where dataTransfer misbehaves

function toISODate(d) { return d.toISOString().slice(0, 10); }
function mondayOf(d) {
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

async function loadRoster() {
  if (!rosterWeekStart) rosterWeekStart = mondayOf(new Date());
  await renderRosterWeek();
}

function rosterPrevWeek() { rosterWeekStart = addDays(rosterWeekStart, -7); renderRosterWeek(); }
function rosterNextWeek() { rosterWeekStart = addDays(rosterWeekStart, 7); renderRosterWeek(); }
function rosterThisWeek() { rosterWeekStart = mondayOf(new Date()); renderRosterWeek(); }

async function renderRosterWeek() {
  const panel = el("panel-roster");
  panel.innerHTML = `<div class="loading">Rooster laden...</div>`;

  const weekDays = [...Array(7)].map((_, i) => addDays(rosterWeekStart, i));
  const weekStartStr = toISODate(weekDays[0]);
  const weekEndStr = toISODate(weekDays[6]);

  const { data, error } = await sb.from("shifts")
    .select("*, profiles:staff_id(full_name)")
    .gte("shift_date", weekStartStr).lte("shift_date", weekEndStr)
    .order("start_time");
  if (error) { panel.innerHTML = `<div class="empty">Kon rooster niet laden: ${esc(error.message)}</div>`; return; }
  rosterShiftsCache = data || [];

  const { data: templates } = await sb.from("shift_templates").select("*").order("sort_order").order("start_time");
  rosterTemplatesCache = templates || [];

  // staff to show as rows: the whole active team, same view for everyone (like Teams Shifts)
  let rowStaff = allProfiles.filter(p => p.active !== false);
  rowStaff.sort((a, b) => a.full_name.localeCompare(b.full_name));

  const rangeLabel = `${weekDays[0].getDate()} ${monthNamesNl[weekDays[0].getMonth()]}` +
    (weekDays[0].getMonth() === weekDays[6].getMonth()
      ? ` &ndash; ${weekDays[6].getDate()} ${monthNamesNl[weekDays[6].getMonth()]}`
      : ` &ndash; ${weekDays[6].getDate()} ${monthNamesNl[weekDays[6].getMonth()]}`);

  let html = `<h2>Rooster</h2><p class="panelSub">Jouw diensten in kleur, collega's in grijs.</p>`;

  html += `<div class="cardRow" style="margin-bottom:14px; align-items:center;">
    <div>
      <button class="btn secondary" onclick="rosterPrevWeek()">&larr;</button>
      <button class="btn secondary" onclick="rosterThisWeek()">Deze week</button>
      <button class="btn secondary" onclick="rosterNextWeek()">&rarr;</button>
      <span class="mono" style="margin-left:8px; font-size:13px; color:var(--bean-light);">${rangeLabel}</span>
    </div>
    <div>
      <button class="btn secondary" onclick="printTodayRoster()">Print: wie werkt vandaag</button>
      <button class="btn secondary" onclick="downloadMyWeekIcs()">Download mijn week (.ics)</button>
      <button class="btn secondary" onclick="downloadMyMonthIcs()">Download mijn maand (.ics)</button>
      ${isManager() ? `<button class="btn secondary" onclick="downloadTeamWeekIcs()">Download team, deze week (.ics)</button>` : ""}
      ${isManager() ? `<button class="btn secondary" onclick="downloadTeamMonthIcs()">Download team, deze maand (.ics)</button>` : ""}
      ${isManager() ? `<button class="btn secondary" onclick="downloadRosterBackupCsv()">Download volledige back-up (.csv)</button>` : ""}
    </div>
  </div>`;

  if (isManager()) {
    html += `<div class="card" style="margin-bottom:14px;">
      <div class="cardRow" style="margin-bottom: ${rosterTemplatesCache.length ? "10px" : "0"};">
        <h3 style="font-size:15px;">Vaste diensten</h3>
        <button class="btn secondary" onclick="toggleTemplateForm()">+ Nieuwe vaste dienst</button>
      </div>
      <p style="font-size:12.5px; color:var(--bean-light); margin:0 0 10px 0;">Sleep een vaste dienst op een dag om 'm meteen in te plannen. Bestaande diensten in het rooster kun je ook naar een andere dag of medewerker slepen.</p>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${rosterTemplatesCache.map(t => `
          <div class="mono" draggable="true" ondragstart="dragTemplate(event, '${t.id}')"
            style="background:var(--glass); border:1px solid var(--crust); border-radius:6px; padding:6px 10px; font-size:11.5px; cursor:grab; display:flex; align-items:center; gap:6px;">
            <span style="cursor:pointer;" onclick="editTemplateInline('${t.id}')">${esc(t.name)}: ${fmtTime(t.start_time)}&ndash;${fmtTime(t.end_time)}</span>
            <button onclick="deleteTemplate('${t.id}')" title="Verwijderen" style="border:none; background:none; color:var(--warn); cursor:pointer; font-size:13px; padding:0;">&times;</button>
          </div>`).join("")}
      </div>
      <div id="templateFormHolder"></div>
    </div>`;
  }

  // ---- week grid ----
  html += `<div style="overflow-x:auto;"><table class="simple rosterGrid" style="min-width:640px;"><thead><tr>
    <th style="min-width:120px;">Medewerker</th>
    ${weekDays.map(d => {
      const isToday = toISODate(d) === toISODate(new Date());
      return `<th style="${isToday ? "color:var(--ink); font-weight:700;" : ""}">${dayNamesShort[(d.getDay() + 6) % 7]}<br><span style="font-weight:400;">${d.getDate()}/${d.getMonth() + 1}</span></th>`;
    }).join("")}
  </tr></thead><tbody>`;

  if (rowStaff.length === 0) {
    html += `<tr><td colspan="8" class="empty">Geen diensten deze week.</td></tr>`;
  }

  rowStaff.forEach(p => {
    html += `<tr><td style="font-weight:600;">${esc(p.full_name)}</td>`;
    weekDays.forEach(d => {
      const dateStr = toISODate(d);
      const shiftsHere = rosterShiftsCache.filter(s => s.staff_id === p.id && s.shift_date === dateStr);
      const dropAttrs = isManager()
        ? `ondragover="event.preventDefault()" ondrop="dropOnCell(event, '${p.id}', '${dateStr}')"`
        : "";
      html += `<td style="vertical-align:top; padding:4px;" ${dropAttrs}>`;
      shiftsHere.forEach(s => {
        const mine = s.staff_id === currentProfile.id;
        html += renderShiftChip(s, mine);
      });
      if (isManager()) {
        html += `<button class="btn secondary" style="font-size:11px; padding:4px 8px; margin-top:2px;" onclick="openAddShift('${p.id}', '${dateStr}')">+ dienst</button>`;
      }
      html += `</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;

  html += `<div id="shiftFormHolder" style="margin-top:16px;"></div>`;

  // ---- hours overview ----
  html += await renderHoursOverview(weekDays, rowStaff);

  panel.innerHTML = html;
  const rowCount = rowStaff.length;
  if (rowCount === 0 && isManager()) {
    // still let a manager plan for anyone even if nobody has hours yet this week
  }
}

function renderShiftChip(s, mine) {
  const bg = mine ? "var(--honey)" : "#e3ded2";
  const fg = mine ? "var(--bean)" : "var(--bean-light)";
  const dragAttrs = isManager() ? `draggable="true" ondragstart="dragShift(event, '${s.id}')"` : "";
  return `<div class="mono" ${dragAttrs} style="background:${bg}; color:${fg}; border-radius:6px; padding:4px 6px; font-size:11px; margin-bottom:3px; cursor:${isManager() ? "grab" : "default"};"
      ${isManager() ? `onclick="editShiftInline('${s.id}')"` : ""}>
    ${fmtTime(s.start_time)}&ndash;${fmtTime(s.end_time)}${s.section ? `<br>${esc(s.section)}` : ""}
  </div>`;
}

// ---- Outlook-achtige tijdbalk: slepen of los tikken ----
const GRID_START_MIN = 6 * 60;   // 06:00
const GRID_END_MIN = 23 * 60 + 30; // laatste slot start 23:00, dienst kan tot 23:30 lopen
const GRID_STEP = 30;

let gridDragging = false;
let gridAnchorMin = null;
let gridCurrentMin = null;

function minToTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function renderDayGrid(startTime, endTime) {
  const startMin = startTime ? timeToMin(startTime) : null;
  const endMin = endTime ? timeToMin(endTime) : null;
  let slots = "";
  for (let m = GRID_START_MIN; m < GRID_END_MIN; m += GRID_STEP) {
    const isHour = m % 60 === 0;
    const selected = startMin !== null && endMin !== null && m >= startMin && m < endMin;
    slots += `<div class="gridSlot${selected ? " gridSlotSelected" : ""}${isHour ? " gridSlotHour" : ""}"
      data-min="${m}" onmousedown="startSlotDrag(event, ${m})" onmouseenter="extendSlotDrag(${m})"
      ontouchstart="startSlotDrag(event, ${m})">
      ${isHour ? `<span class="gridHourLabel">${minToTime(m)}</span>` : ""}
    </div>`;
  }
  return `<div class="dayGridLabel mono">Sleep hieronder de tijd, of typ 'm rechts handmatig in</div>
    <div class="dayGrid" id="dayGrid" onmouseleave="">${slots}</div>`;
}

function startSlotDrag(event, min) {
  event.preventDefault();
  gridDragging = true;
  gridAnchorMin = min;
  gridCurrentMin = min;
  paintGridSelection();
}

function extendSlotDrag(min) {
  if (!gridDragging) return;
  gridCurrentMin = min;
  paintGridSelection();
}

function paintGridSelection() {
  if (gridAnchorMin === null) return;
  const lo = Math.min(gridAnchorMin, gridCurrentMin);
  const hi = Math.max(gridAnchorMin, gridCurrentMin) + GRID_STEP;
  document.querySelectorAll("#dayGrid .gridSlot").forEach(slotEl => {
    const m = Number(slotEl.dataset.min);
    slotEl.classList.toggle("gridSlotSelected", m >= lo && m < hi);
  });
}

function endSlotDrag() {
  if (!gridDragging) return;
  gridDragging = false;
  const lo = Math.min(gridAnchorMin, gridCurrentMin);
  const hi = Math.max(gridAnchorMin, gridCurrentMin) + GRID_STEP;
  if (el("shiftStart")) el("shiftStart").value = minToTime(lo);
  if (el("shiftEnd")) el("shiftEnd").value = minToTime(hi);
}
document.addEventListener("mouseup", endSlotDrag);
document.addEventListener("touchend", endSlotDrag);

// ---- manager: add / edit a shift ----
function openAddShift(staffId, dateStr) {
  editingShiftId = null;
  el("shiftFormHolder").innerHTML = `<div class="managerBox">
    <h3>Dienst inplannen &middot; ${dateStr}</h3>
    <div class="field"><label>Medewerker</label>
      <select id="shiftStaff">${allProfiles.map(p => `<option value="${p.id}" ${p.id === staffId ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}</select>
    </div>
    <input type="hidden" id="shiftDate" value="${dateStr}">
    ${renderDayGrid("09:00", "17:00")}
    <div style="display:flex; gap:12px; margin-top:10px;">
      <div class="field" style="flex:1;"><label>Van</label><input id="shiftStart" type="time" value="09:00" onchange="paintGridFromInputs()"></div>
      <div class="field" style="flex:1;"><label>Tot</label><input id="shiftEnd" type="time" value="17:00" onchange="paintGridFromInputs()"></div>
    </div>
    <div class="field"><label>Onderdeel</label><input id="shiftSection" placeholder="bijv. Restaurant, Bakkerij, HTH"></div>
    <button class="btn honey" onclick="saveShiftForm()">Inplannen</button>
    <button class="btn secondary" onclick="closeShiftForm()">Annuleren</button>
  </div>`;
  el("shiftFormHolder").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function editShiftInline(shiftId) {
  const s = rosterShiftsCache.find(x => x.id === shiftId);
  if (!s) return;
  editingShiftId = shiftId;
  el("shiftFormHolder").innerHTML = `<div class="managerBox">
    <h3>Dienst bewerken</h3>
    <div class="field"><label>Medewerker</label>
      <select id="shiftStaff">${allProfiles.map(p => `<option value="${p.id}" ${p.id === s.staff_id ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}</select>
    </div>
    <input type="hidden" id="shiftDate" value="${s.shift_date}">
    ${renderDayGrid(fmtTime(s.start_time), fmtTime(s.end_time))}
    <div style="display:flex; gap:12px; margin-top:10px;">
      <div class="field" style="flex:1;"><label>Van</label><input id="shiftStart" type="time" value="${fmtTime(s.start_time)}" onchange="paintGridFromInputs()"></div>
      <div class="field" style="flex:1;"><label>Tot</label><input id="shiftEnd" type="time" value="${fmtTime(s.end_time)}" onchange="paintGridFromInputs()"></div>
    </div>
    <div class="field"><label>Onderdeel</label><input id="shiftSection" value="${esc(s.section || "")}"></div>
    <button class="btn honey" onclick="saveShiftForm()">Opslaan</button>
    <button class="btn secondary" onclick="closeShiftForm()">Annuleren</button>
    <button class="btn warn" onclick="deleteShift('${s.id}')">Verwijderen</button>
  </div>`;
  el("shiftFormHolder").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function paintGridFromInputs() {
  const startVal = el("shiftStart").value;
  const endVal = el("shiftEnd").value;
  if (!startVal || !endVal) return;
  const lo = timeToMin(startVal);
  const hi = timeToMin(endVal);
  document.querySelectorAll("#dayGrid .gridSlot").forEach(slotEl => {
    const m = Number(slotEl.dataset.min);
    slotEl.classList.toggle("gridSlotSelected", m >= lo && m < hi);
  });
}

function closeShiftForm() {
  editingShiftId = null;
  el("shiftFormHolder").innerHTML = "";
}

async function saveShiftForm() {
  const staff_id = el("shiftStaff").value;
  const shift_date = el("shiftDate").value;
  const start_time = el("shiftStart").value;
  const end_time = el("shiftEnd").value;
  const section = el("shiftSection").value.trim();
  if (!staff_id || !shift_date || !start_time || !end_time) { alert("Vul alle velden in."); return; }

  const payload = { staff_id, shift_date, start_time, end_time, section };
  const { error } = editingShiftId
    ? await sb.from("shifts").update(payload).eq("id", editingShiftId)
    : await sb.from("shifts").insert(payload);

  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  closeShiftForm();
  loadRoster();
  loadSwap();
}

async function deleteShift(id) {
  if (!confirm("Deze dienst verwijderen?")) return;
  const { error } = await sb.from("shifts").delete().eq("id", id);
  if (error) { alert("Verwijderen mislukt: " + error.message); return; }
  closeShiftForm();
  loadRoster();
  loadSwap();
}

// ---- drag and drop ----
function dragTemplate(event, templateId) {
  const payload = { type: "template", id: templateId };
  draggedPayload = payload;
  event.dataTransfer.setData("text/plain", JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "copy";
}

function dragShift(event, shiftId) {
  const payload = { type: "shift", id: shiftId };
  draggedPayload = payload;
  event.dataTransfer.setData("text/plain", JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "move";
}

async function dropOnCell(event, staffId, dateStr) {
  event.preventDefault();
  let payload = draggedPayload;
  try {
    const raw = event.dataTransfer.getData("text/plain");
    if (raw) payload = JSON.parse(raw);
  } catch (e) { /* fall back to draggedPayload */ }
  draggedPayload = null;
  if (!payload) return;

  if (payload.type === "template") {
    const t = rosterTemplatesCache.find(x => x.id === payload.id);
    if (!t) return;
    const { error } = await sb.from("shifts").insert({
      staff_id: staffId, shift_date: dateStr, start_time: t.start_time, end_time: t.end_time, section: t.section
    });
    if (error) { alert("Inplannen mislukt: " + error.message); return; }
  } else if (payload.type === "shift") {
    const { error } = await sb.from("shifts").update({ staff_id: staffId, shift_date: dateStr }).eq("id", payload.id);
    if (error) { alert("Verplaatsen mislukt: " + error.message); return; }
  }
  loadRoster();
  loadSwap();
}

// ---- shift templates (vaste diensten) ----
let editingTemplateId = null;

function toggleTemplateForm() {
  const holder = el("templateFormHolder");
  if (holder.innerHTML) { holder.innerHTML = ""; editingTemplateId = null; return; }
  editingTemplateId = null;
  holder.innerHTML = `<div class="managerBox">
    <h3>Nieuwe vaste dienst</h3>
    <div class="field"><label>Naam</label><input id="tplName" placeholder="bijv. Ochtend bakkerij"></div>
    <div class="field"><label>Van</label><input id="tplStart" type="time" value="09:00"></div>
    <div class="field"><label>Tot</label><input id="tplEnd" type="time" value="17:00"></div>
    <div class="field"><label>Onderdeel</label><input id="tplSection" placeholder="bijv. Bakkerij"></div>
    <button class="btn honey" onclick="saveTemplate()">Opslaan</button>
  </div>`;
}

function editTemplateInline(id) {
  const t = rosterTemplatesCache.find(x => x.id === id);
  if (!t) return;
  editingTemplateId = id;
  el("templateFormHolder").innerHTML = `<div class="managerBox">
    <h3>Vaste dienst bewerken</h3>
    <div class="field"><label>Naam</label><input id="tplName" value="${esc(t.name)}"></div>
    <div class="field"><label>Van</label><input id="tplStart" type="time" value="${fmtTime(t.start_time)}"></div>
    <div class="field"><label>Tot</label><input id="tplEnd" type="time" value="${fmtTime(t.end_time)}"></div>
    <div class="field"><label>Onderdeel</label><input id="tplSection" value="${esc(t.section || "")}"></div>
    <button class="btn honey" onclick="saveTemplate()">Opslaan</button>
    <button class="btn secondary" onclick="el('templateFormHolder').innerHTML=''; editingTemplateId=null;">Annuleren</button>
    <button class="btn warn" onclick="deleteTemplate('${t.id}')">Verwijderen</button>
  </div>`;
}

async function saveTemplate() {
  const name = el("tplName").value.trim();
  const start_time = el("tplStart").value;
  const end_time = el("tplEnd").value;
  const section = el("tplSection").value.trim();
  if (!name || !start_time || !end_time) { alert("Vul naam, van en tot in."); return; }
  const payload = { name, start_time, end_time, section };
  const { error } = editingTemplateId
    ? await sb.from("shift_templates").update(payload).eq("id", editingTemplateId)
    : await sb.from("shift_templates").insert(payload);
  if (error) { alert("Opslaan mislukt: " + error.message); return; }
  editingTemplateId = null;
  loadRoster();
}

async function deleteTemplate(id) {
  if (!confirm("Deze vaste dienst verwijderen? Al ingeplande diensten blijven gewoon staan.")) return;
  const { error } = await sb.from("shift_templates").delete().eq("id", id);
  if (error) { alert("Verwijderen mislukt: " + error.message); return; }
  loadRoster();
}

// ---- hours overview: scheduled (rooster) vs actually clocked (checkins) ----
function shiftHours(s) {
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

async function renderHoursOverview(weekDays, rowStaff) {
  const weekStartStr = toISODate(weekDays[0]);
  const weekEndIso = addDays(weekDays[6], 1).toISOString();

  const staffForHours = isManager() ? rowStaff : rowStaff.filter(p => p.id === currentProfile.id);
  if (staffForHours.length === 0) return "";

  let query = sb.from("checkins").select("*")
    .gte("check_in_at", new Date(weekStartStr).toISOString())
    .lt("check_in_at", weekEndIso);
  if (!isManager()) query = query.eq("staff_id", currentProfile.id);
  const { data: checkins } = await query;

  let html = `<h3 style="font-size:15px; margin: 24px 0 8px 0;">Uren deze week</h3>
    <p style="font-size:12.5px; color:var(--bean-light); margin: 0 0 10px 0;">Gepland komt uit het rooster, gewerkt komt uit in- en uitklokken.</p>
    <table class="simple"><thead><tr><th>Medewerker</th><th>Gepland</th><th>Gewerkt (ingeklokt)</th></tr></thead><tbody>`;

  staffForHours.forEach(p => {
    const planned = rosterShiftsCache.filter(s => s.staff_id === p.id).reduce((sum, s) => sum + shiftHours(s), 0);
    const worked = (checkins || []).filter(c => c.staff_id === p.id && c.check_out_at)
      .reduce((sum, c) => sum + (new Date(c.check_out_at) - new Date(c.check_in_at)) / 3600000, 0);
    html += `<tr><td>${esc(p.full_name)}</td><td>${planned.toFixed(1)} u</td><td>${worked.toFixed(1)} u</td></tr>`;
  });

  html += `</tbody></table>`;
  return html;
}

// ---- print: who works today ----
async function printTodayRoster() {
  const todayStr = toISODate(new Date());
  const { data, error } = await sb.from("shifts")
    .select("*, profiles:staff_id(full_name)")
    .eq("shift_date", todayStr).order("start_time");
  if (error) { alert("Kon rooster niet laden: " + error.message); return; }

  const area = el("printArea");
  const todayLabel = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  area.innerHTML = `<h1 style="font-family:'Instrument Serif', serif; font-size:28px; margin-bottom:4px;">Wie werkt vandaag</h1>
    <p style="margin: 0 0 16px 0; color:#555;">${todayLabel}</p>
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left; border-bottom:1px solid #999; padding:6px;">Tijd</th>
        <th style="text-align:left; border-bottom:1px solid #999; padding:6px;">Naam</th>
        <th style="text-align:left; border-bottom:1px solid #999; padding:6px;">Onderdeel</th>
      </tr></thead>
      <tbody>
        ${(data || []).length === 0 ? `<tr><td colspan="3" style="padding:8px;">Geen diensten gepland.</td></tr>` : (data || []).map(s => `
          <tr>
            <td style="padding:6px; border-bottom:1px solid #eee;">${fmtTime(s.start_time)}&ndash;${fmtTime(s.end_time)}</td>
            <td style="padding:6px; border-bottom:1px solid #eee;">${esc(s.profiles ? s.profiles.full_name : "")}</td>
            <td style="padding:6px; border-bottom:1px solid #eee;">${esc(s.section || "")}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
  window.print();
}

// ---- calendar export (.ics) ----
function icsEscape(s) { return (s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n"); }
function icsDateTime(dateStr, timeStr) {
  return dateStr.replace(/-/g, "") + "T" + timeStr.replace(":", "") + "00";
}

function buildIcs(shifts, calName) {
  let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Wintertuin//Rooster//NL\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:${icsEscape(calName)}\r\n`;
  shifts.forEach(s => {
    const summary = s.profiles ? `${s.section || "Dienst"} (${s.profiles.full_name})` : (s.section || "Dienst");
    ics += `BEGIN:VEVENT\r\nUID:${s.id}@wintertuin\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z\r\n` +
      `DTSTART:${icsDateTime(s.shift_date, s.start_time)}\r\nDTEND:${icsDateTime(s.shift_date, s.end_time)}\r\n` +
      `SUMMARY:${icsEscape(summary)}\r\nEND:VEVENT\r\n`;
  });
  ics += `END:VCALENDAR\r\n`;
  return ics;
}

function downloadBlob(text, filename) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function csvEscape(s) {
  s = (s ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function downloadRosterBackupCsv() {
  const { data, error } = await sb.from("shifts")
    .select("*, profiles:staff_id(full_name)")
    .order("shift_date").order("start_time");
  if (error) { alert("Back-up maken mislukt: " + error.message); return; }

  let csv = "Datum,Van,Tot,Medewerker,Onderdeel,Notities\r\n";
  (data || []).forEach(s => {
    csv += [
      s.shift_date, fmtTime(s.start_time), fmtTime(s.end_time),
      s.profiles ? s.profiles.full_name : "", s.section || "", s.notes || ""
    ].map(csvEscape).join(",") + "\r\n";
  });

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wintertuin-rooster-backup-${toISODate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadMyWeekIcs() {
  const start = rosterWeekStart;
  const end = addDays(rosterWeekStart, 6);
  const { data, error } = await sb.from("shifts").select("*, profiles:staff_id(full_name)")
    .eq("staff_id", currentProfile.id)
    .gte("shift_date", toISODate(start)).lte("shift_date", toISODate(end))
    .order("shift_date").order("start_time");
  if (error) { alert("Exporteren mislukt: " + error.message); return; }
  downloadBlob(buildIcs(data || [], "Wintertuin, mijn diensten"), `wintertuin-week-${toISODate(start)}.ics`);
}

async function downloadTeamWeekIcs() {
  const start = rosterWeekStart;
  const end = addDays(rosterWeekStart, 6);
  const { data, error } = await sb.from("shifts").select("*, profiles:staff_id(full_name)")
    .gte("shift_date", toISODate(start)).lte("shift_date", toISODate(end))
    .order("shift_date").order("start_time");
  if (error) { alert("Exporteren mislukt: " + error.message); return; }
  downloadBlob(buildIcs(data || [], "Wintertuin, teamrooster"), `wintertuin-team-week-${toISODate(start)}.ics`);
}

async function downloadMyMonthIcs() {
  const start = new Date(rosterWeekStart.getFullYear(), rosterWeekStart.getMonth(), 1);
  const end = new Date(rosterWeekStart.getFullYear(), rosterWeekStart.getMonth() + 1, 0);
  const { data, error } = await sb.from("shifts").select("*, profiles:staff_id(full_name)")
    .eq("staff_id", currentProfile.id)
    .gte("shift_date", toISODate(start)).lte("shift_date", toISODate(end))
    .order("shift_date").order("start_time");
  if (error) { alert("Exporteren mislukt: " + error.message); return; }
  downloadBlob(buildIcs(data || [], "Wintertuin, mijn diensten"), `wintertuin-diensten-${start.getFullYear()}-${start.getMonth() + 1}.ics`);
}

async function downloadTeamMonthIcs() {
  const start = new Date(rosterWeekStart.getFullYear(), rosterWeekStart.getMonth(), 1);
  const end = new Date(rosterWeekStart.getFullYear(), rosterWeekStart.getMonth() + 1, 0);
  const { data, error } = await sb.from("shifts").select("*, profiles:staff_id(full_name)")
    .gte("shift_date", toISODate(start)).lte("shift_date", toISODate(end))
    .order("shift_date").order("start_time");
  if (error) { alert("Exporteren mislukt: " + error.message); return; }
  downloadBlob(buildIcs(data || [], "Wintertuin, teamrooster"), `wintertuin-team-${start.getFullYear()}-${start.getMonth() + 1}.ics`);
}
