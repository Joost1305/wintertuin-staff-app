// Newsletter: a monthly mail built from the app. Dish of the month and menu highlights come from the menu,
// the rest is a few short texts. The result is plain, email-safe HTML (tables, inline styles) to paste into
// Brevo, Mailchimp or Gmail. The draft is shared by all managers (team_settings 'newsletter_draft').
import { state, isManager, app, esc, toast, toastError, todayIso, $, $$, download } from '../core.js';
import { lang } from '../i18n.js';
import { sb } from '../data.js';
import { loadDishOfMonth } from './menu.js';
import { PHOTO_BUCKET } from '../config.js';

const L = (o) => o[lang()] || o.en;
const SITE = 'https://joost1305.github.io/wintertuin-staff-app/';
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const THEMES = ['Over bijen', 'Over bomen', 'Over foerageren', 'Over koffie', 'Over brood', 'Over fermenteren', 'Over wild', 'Over zintuigen', 'Over rook'];

// Section order and what each one is called in the editor
const SECTIONS = [
  ['intro', { en: 'Opening words', nl: 'Openingswoord' }],
  ['dish', { en: 'Dish of the month', nl: 'Gerecht van de maand' }],
  ['events', { en: 'Coming up', nl: 'Binnenkort' }],
  ['highlights', { en: 'On the menu now', nl: 'Nu op de kaart' }],
  ['bakery', { en: 'From the bakery', nl: 'Uit de bakkerij' }],
  ['coffee', { en: 'Coffee of the month', nl: 'Koffie van de maand' }],
  ['supplier', { en: 'Supplier in the spotlight', nl: 'Leverancier in het zonnetje' }],
  ['garden', { en: 'From the garden and the bees', nl: 'Uit de tuin en van de bijen' }],
  ['recipe', { en: 'Recipe to make at home', nl: 'Recept voor thuis' }],
  ['practical', { en: 'Opening hours and booking', nl: 'Openingstijden en reserveren' }],
];

function nextThursdays(n) {
  const out = []; const d = new Date(); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7));
  for (let i = 0; i < n; i++) { out.push(d.toLocaleDateString('sv-SE')); d.setDate(d.getDate() + 14); }
  return out;
}
function defaults() {
  const now = new Date();
  const th = nextThursdays(3);
  return {
    on: Object.fromEntries(SECTIONS.map(([k]) => [k, !['recipe'].includes(k)])),
    subject: `Nieuws uit de kas, ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    intro: 'De dagen worden korter, de kas wordt warmer. In de oven staan de eerste stoofpotten, in de kelder borrelt de zuurkool en de bijen houden zich koest tot het voorjaar. Fijn dat je er bent.',
    events: th.map((d, i) => ({ date: d, title: `De Wintertuin Verteld: ${THEMES[(now.getMonth() + i) % THEMES.length]}`, text: 'Een avond met een menu rond één thema, verhalen aan tafel en iets om mee naar huis te nemen. Lange tafels, twee gangen en een glas.' })),
    highlights: [],
    bakery: 'Deze maand bakken we een roggebrood met venkelzaad en een zuurdesem met geroosterde pompoenpitten. Op zaterdag ook de cruffin met appel en kaneel, zolang de voorraad strekt.',
    coffee: 'Kees brandde een nieuwe boon uit Ethiopië: zacht, met tonen van bergamot en honing. Vraag ernaar bij de bar of neem een zak mee uit de deli.',
    supplier: 'Onze winterpeen en knolselderij komen van een teler uit de Gelderse Vallei. Biologisch, op zandgrond, en hij weet precies wanneer zijn wortels het zoetst zijn: na de eerste nachtvorst.',
    garden: 'In de kas groeien nog winterpostelein, kervel en munt. De bijen zitten in hun wintertros; de honing van deze zomer staat in de deli.',
    recipe: 'Wortel-gembersoep: fruit een ui, voeg 600 gram winterpeen en een duim gember toe, giet er een liter groentebouillon bij en laat 20 minuten zachtjes koken. Pureer, breng op smaak met zout en citroen en maak af met kruidenolie en geroosterde broodkruimels.',
    practical: 'Vrijdag tot en met zondag: bakkerij en koffie vanaf de ochtend, lunch en een diner van twee gangen. Op donderdag De Wintertuin Verteld. Reserveren kan via de mail of gewoon even langskomen.',
    cta_label: 'Reserveer een tafel', cta_url: 'mailto:info@wintertuin.nl',
    unsub: '{{ unsubscribe }}',
  };
}

// The newsletter is a list of blocks. Each block has a type, a title, a text, an optional photo and is on or off.
// Types: intro (opening words), dish (dish of the month), events, highlights (on the menu now), text (any block), practical (with a button).
const uid = () => Math.random().toString(36).slice(2, 10);
const TYPE_NAME = { intro: { en: 'Opening words', nl: 'Openingswoord' }, dish: { en: 'Dish of the month', nl: 'Gerecht van de maand' }, events: { en: 'Coming up', nl: 'Binnenkort' },
  highlights: { en: 'On the menu now', nl: 'Nu op de kaart' }, text: { en: 'Text block', nl: 'Tekstblok' }, practical: { en: 'Opening hours and booking', nl: 'Openingstijden en reserveren' } };
function blocksFrom(d) {
  // an older draft had fixed sections; turn them into blocks with the same texts
  const title = (k) => SECTIONS.find(([x]) => x === k)[1].nl;
  const on = d.on || {};
  return [
    { id: uid(), type: 'intro', title: '', text: d.intro || '', on: on.intro !== false },
    { id: uid(), type: 'dish', title: title('dish'), text: '', on: on.dish !== false },
    { id: uid(), type: 'events', title: title('events'), text: '', on: on.events !== false },
    { id: uid(), type: 'highlights', title: title('highlights'), text: '', on: on.highlights !== false },
    ...['bakery', 'coffee', 'supplier', 'garden', 'recipe'].map((k) => ({ id: uid(), type: 'text', title: title(k), text: d[k] || '', photo: '', on: on[k] !== undefined ? on[k] !== false : k !== 'recipe' })),
    { id: uid(), type: 'practical', title: title('practical'), text: d.practical || '', on: on.practical !== false },
  ];
}

let draft = null;
let menu = [];
let dom = null;
let openIds = new Set(); // blocks you opened stay open while you work

export async function renderNewsletter() {
  if (!isManager()) { location.hash = '#/today'; return; }
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [m, d, saved] = await Promise.all([
    sb.from('menu_items').select('id, name, description, category, price, photo_url, group_type').eq('active', true).order('group_type').order('sort_order').then((r) => r.data || [], () => []),
    loadDishOfMonth(),
    sb.from('team_settings').select('value').eq('key', 'newsletter_draft').maybeSingle().then((r) => (r.data ? r.data.value : null), () => null),
  ]);
  menu = m; dom = d;
  draft = { ...defaults(), ...(saved || {}) };
  draft.on = { ...defaults().on, ...((saved && saved.on) || {}) };
  if (!Array.isArray(draft.blocks) || !draft.blocks.length) draft.blocks = blocksFrom(draft);
  if (!draft.highlights.length) draft.highlights = menu.filter((x) => x.group_type !== 'beverage' && x.id !== (dom && dom.id)).slice(0, 3).map((x) => x.id);
  draw();
}

const nl = (desc) => String(desc || '').split('\nEN:')[0].trim();

function draw() {
  const field = (k, rows = 3) => `<textarea data-k="${k}" rows="${rows}">${esc(draft[k] || '')}</textarea>`;
  const n = draft.blocks.length;
  const blockEditor = (bl, bi, domItem) => {
    const head = bl.type === 'intro' ? L(TYPE_NAME.intro) : (bl.title || L(TYPE_NAME[bl.type]));
    const titleIn = bl.type === 'intro' ? '' : `<div class="field"><label>${L({ en: 'Title', nl: 'Titel' })}</label><input data-bf="title" data-b="${bi}" value="${esc(bl.title || '')}"></div>`;
    const textIn = (rows = 4, lab = L({ en: 'Text', nl: 'Tekst' })) => `<div class="field"><label>${lab}</label><textarea data-bf="text" data-b="${bi}" rows="${rows}">${esc(bl.text || '')}</textarea></div>`;
    const photoIn = `<div class="field"><label>${L({ en: 'Photo (optional)', nl: 'Foto (optioneel)' })}</label><div class="dp-row"><div class="dp-prev nl-ph">${bl.photo ? `<img src="${esc(bl.photo)}" alt="">` : '<i class="ic ic-image" aria-hidden="true"></i>'}</div>
      <div class="dp-btns"><label class="btn btn-sm"><i class="ic ic-upload" aria-hidden="true"></i> ${bl.photo ? L({ en: 'Other photo', nl: 'Andere foto' }) : L({ en: 'Add a photo', nl: 'Foto toevoegen' })}<input type="file" accept="image/*" hidden data-bphoto="${bi}"></label>
        ${bl.photo ? `<button type="button" class="link-btn small" data-bphotorm="${bi}">${L({ en: 'Remove photo', nl: 'Foto weghalen' })}</button>` : ''}</div></div></div>`;
    let body = '';
    if (bl.type === 'intro') body = textIn(4);
    else if (bl.type === 'text') body = titleIn + textIn(5) + photoIn;
    else if (bl.type === 'dish') body = titleIn + (domItem ? `<p class="small">${esc(domItem.name)}${dom.note ? `: ${esc(dom.note)}` : ''}</p>` : `<p class="small muted">${L({ en: 'No dish of the month chosen yet.', nl: 'Nog geen gerecht van de maand gekozen.' })}</p>`)
      + `<p class="small muted">${L({ en: 'Choose the dish under Settings, Order of the dishes. Its photo comes from the dish; you can put another one here.', nl: 'Het gerecht kies je onder Instellingen, Volgorde gerechten. De foto komt van het gerecht; je kunt hier een andere kiezen.' })}</p>` + photoIn;
    else if (bl.type === 'events') body = titleIn + `${draft.events.map((e, i) => `<div class="nl-ev"><div class="field-row"><input type="date" data-ev="${i}" data-f="date" value="${esc(e.date)}"><input data-ev="${i}" data-f="title" value="${esc(e.title)}"></div>
            <textarea data-ev="${i}" data-f="text" rows="2">${esc(e.text)}</textarea><button type="button" class="link-btn small" data-evdel="${i}">${L({ en: 'Remove', nl: 'Verwijderen' })}</button></div>`).join('')}
          <button type="button" class="btn-sm" id="nl-evadd">+ ${L({ en: 'Event', nl: 'Event' })}</button>
          <p class="small muted">${L({ en: 'Only public evenings here. Private bookings never go in the newsletter.', nl: 'Alleen openbare avonden. Besloten boekingen komen nooit in de nieuwsbrief.' })}</p>`;
    else if (bl.type === 'highlights') {
      const chosen = draft.highlights.map((id) => menu.find((x) => x.id === id)).filter(Boolean);
      body = titleIn + `<ul class="mc-items nl-hl">${chosen.map((x, i) => `<li><span class="mc-i-name"><span class="mc-i-n">${esc(x.name)}</span><span class="small muted">${esc(x.category || '')}</span></span>
          <span class="mc-i-tools"><button type="button" class="mc-ib" data-hmv="${i}|-1" ${i === 0 ? 'disabled' : ''} aria-label="${L({ en: 'Up', nl: 'Omhoog' })}">&#9650;</button><button type="button" class="mc-ib" data-hmv="${i}|1" ${i === chosen.length - 1 ? 'disabled' : ''} aria-label="${L({ en: 'Down', nl: 'Omlaag' })}">&#9660;</button>
          <button type="button" class="mc-ib mc-rm" data-hrm="${x.id}" aria-label="${L({ en: 'Remove', nl: 'Weghalen' })}"><i class="ic ic-x" aria-hidden="true"></i></button></span></li>`).join('')
          || `<li class="mc-empty small muted">${L({ en: 'No dishes chosen yet.', nl: 'Nog geen gerechten gekozen.' })}</li>`}</ul>
        <div><button type="button" class="btn-sm btn-primary-soft" id="nl-hlpick"><i class="ic ic-book" aria-hidden="true"></i> ${L({ en: 'Dishes from the menu', nl: 'Gerechten uit het menu' })}</button></div>
        <label class="check small"><input type="checkbox" id="nl-hlprice" ${draft.hlPrices ? 'checked' : ''}> ${L({ en: 'Show prices', nl: 'Prijzen tonen' })}</label>
        <p class="small muted">${L({ en: 'Two or three is enough. Name and text come from the menu.', nl: 'Twee of drie is genoeg. Naam en tekst komen uit het menu.' })}</p>`;
    }
    else if (bl.type === 'practical') body = titleIn + textIn(3) + `<div class="field-row"><input data-k="cta_label" value="${esc(draft.cta_label)}" placeholder="${L({ en: 'Button text', nl: 'Tekst knop' })}"><input data-k="cta_url" value="${esc(draft.cta_url)}" placeholder="https:// of mailto:"></div>`;
    return `<details class="nl-sec" data-bid="${bl.id}" ${openIds.has(bl.id) ? 'open' : ''}><summary>
      <label class="switch" title="${L({ en: 'In this issue', nl: 'In deze editie' })}"><input type="checkbox" data-bon="${bi}" ${bl.on ? 'checked' : ''}><span></span></label>
      <strong class="nl-sec-t">${esc(head)}</strong>
      <span class="nl-sec-tools"><button type="button" class="mc-ib" data-bmv="${bi}|-1" ${bi === 0 ? 'disabled' : ''} aria-label="${L({ en: 'Up', nl: 'Omhoog' })}">&#9650;</button><button type="button" class="mc-ib" data-bmv="${bi}|1" ${bi === n - 1 ? 'disabled' : ''} aria-label="${L({ en: 'Down', nl: 'Omlaag' })}">&#9660;</button>
        <button type="button" class="mc-ib mc-rm" data-bdel="${bi}" aria-label="${L({ en: 'Delete block', nl: 'Blok verwijderen' })}"><i class="ic ic-x" aria-hidden="true"></i></button></span>
      <span class="nl-edit-cue">${L({ en: 'Edit', nl: 'Bewerken' })} <span class="sop-chev" aria-hidden="true">&#9656;</span></span></summary>
      <div class="nl-body">${body}</div></details>`;
  };
  const domItem = dom && menu.find((x) => x.id === dom.id);
  app().innerHTML = `
    <div class="page-head"><div><a class="small" href="#/guests"><i class="ic ic-prev" aria-hidden="true"></i> ${L({ en: 'Guests', nl: 'Gasten' })}</a><h1>${L({ en: 'Newsletter', nl: 'Nieuwsbrief' })}</h1>
      <div class="muted small">${L({ en: 'Fill in, switch sections on or off, then copy the HTML into your mail program (Brevo, Mailchimp). The text is in Dutch, for our guests.', nl: 'Vul in, zet blokken aan of uit en kopieer de HTML naar je mailprogramma (Brevo, Mailchimp).' })}</div></div>
      <div class="page-actions"><button type="button" class="btn-sm" id="nl-reset">${L({ en: 'Start fresh', nl: 'Opnieuw beginnen' })}</button>
        <button type="button" class="btn-sm" id="nl-save">${L({ en: 'Save draft', nl: 'Concept opslaan' })}</button>
        <button type="button" class="btn-sm" id="nl-copy">${L({ en: 'Copy HTML', nl: 'HTML kopiëren' })}</button>
        <button type="button" class="btn-primary btn-sm" id="nl-dl"><i class="ic ic-download" aria-hidden="true"></i> ${L({ en: 'Download HTML', nl: 'HTML downloaden' })}</button></div></div>
    <div class="nl-grid">
      <div class="nl-form">
        <div class="field"><label>${L({ en: 'Subject line', nl: 'Onderwerpregel' })}</label><input data-k="subject" value="${esc(draft.subject)}"></div>
        ${draft.blocks.map((bl, bi) => blockEditor(bl, bi, domItem)).join('')}
        <div class="nl-add"><span class="small muted">${L({ en: 'Add a block:', nl: 'Blok toevoegen:' })}</span>
          <button type="button" class="btn-sm" data-addb="text">+ ${L({ en: 'Text with photo', nl: 'Tekst met foto' })}</button>
          ${['dish', 'events', 'highlights', 'practical', 'intro'].filter((t) => !draft.blocks.some((x) => x.type === t)).map((t) => `<button type="button" class="btn-sm" data-addb="${t}">+ ${L(TYPE_NAME[t])}</button>`).join('')}</div>
        <div class="field"><label>${L({ en: 'Unsubscribe link (from your mail program)', nl: 'Afmeldlink (uit je mailprogramma)' })}</label><input data-k="unsub" value="${esc(draft.unsub)}">
          <div class="hint">${L({ en: 'Brevo: {{ unsubscribe }}, Mailchimp: *|UNSUB|*. Every newsletter must have one.', nl: 'Brevo: {{ unsubscribe }}, Mailchimp: *|UNSUB|*. Elke nieuwsbrief moet er een hebben.' })}</div></div>
      </div>
      <div class="nl-preview"><div class="nl-device"><iframe id="nl-frame" title="${L({ en: 'Preview', nl: 'Voorbeeld' })}"></iframe></div></div>
    </div>`;
  const refresh = () => { $('#nl-frame').srcdoc = html(); };
  refresh();
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
  $$('[data-k]').forEach((el) => (el.oninput = () => { draft[el.dataset.k] = el.value; later(); }));
  const B = (el) => draft.blocks[Number(el.dataset.b ?? el.dataset.bon ?? el.dataset.bphoto ?? el.dataset.bphotorm ?? el.dataset.bdel)];
  $$('details.nl-sec').forEach((d) => d.addEventListener('toggle', () => { if (d.open) openIds.add(d.dataset.bid); else openIds.delete(d.dataset.bid); }));
  $$('[data-bon]').forEach((el) => { el.onclick = (e) => e.stopPropagation(); el.onchange = () => { B(el).on = el.checked; refresh(); }; });
  $$('[data-bf]').forEach((el) => (el.oninput = () => { B(el)[el.dataset.bf] = el.value; if (el.dataset.bf === 'title') { const t = el.closest('details').querySelector('.nl-sec-t'); t.textContent = el.value || '…'; } later(); }));
  $$('[data-bmv]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const [i, d] = b.dataset.bmv.split('|').map(Number); const j = i + d; if (j < 0 || j >= draft.blocks.length) return; [draft.blocks[i], draft.blocks[j]] = [draft.blocks[j], draft.blocks[i]]; draw(); }));
  $$('[data-bdel]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const bl = B(b); draft.blocks.splice(draft.blocks.indexOf(bl), 1); draw(); toast(L({ en: `"${bl.title || L(TYPE_NAME[bl.type])}" removed`, nl: `"${bl.title || L(TYPE_NAME[bl.type])}" verwijderd` })); }));
  $$('[data-addb]').forEach((b) => (b.onclick = () => {
    const t = b.dataset.addb; const nb = { id: uid(), type: t, title: t === 'intro' ? '' : (t === 'text' ? 'Nieuw blok' : TYPE_NAME[t].nl), text: '', photo: '', on: true };
    draft.blocks.push(nb); openIds.add(nb.id); draw();
    const d = $(`details[data-bid="${nb.id}"]`); if (d) { d.scrollIntoView({ behavior: 'smooth', block: 'center' }); const f = d.querySelector('[data-bf="title"]'); if (f) { f.focus(); f.select(); } }
  }));
  $$('[data-bphoto]').forEach((inp) => (inp.onchange = async () => {
    const file = inp.files && inp.files[0]; if (!file) return; const bl = B(inp);
    try {
      toast(L({ en: 'Uploading photo…', nl: 'Foto wordt geüpload…' }));
      const path = `newsletter/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${(file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (error) throw error;
      bl.photo = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl; draw();
    } catch (err) { toastError(err); }
  }));
  $$('[data-bphotorm]').forEach((b) => (b.onclick = () => { B(b).photo = ''; draw(); }));
  $$('[data-ev]').forEach((el) => (el.oninput = () => { draft.events[Number(el.dataset.ev)][el.dataset.f] = el.value; later(); }));
  $$('[data-evdel]').forEach((b) => (b.onclick = () => { draft.events.splice(Number(b.dataset.evdel), 1); draw(); }));
  if ($('#nl-evadd')) $('#nl-evadd').onclick = () => { draft.events.push({ date: todayIso(), title: '', text: '' }); draw(); };
  $$('[data-hrm]').forEach((b) => (b.onclick = () => { draft.highlights = draft.highlights.filter((id) => id !== b.dataset.hrm); draw(); }));
  $$('[data-hmv]').forEach((b) => (b.onclick = () => { const [i, d] = b.dataset.hmv.split('|').map(Number); const h = draft.highlights.filter((id) => menu.some((x) => x.id === id)); const j = i + d; if (j < 0 || j >= h.length) return; [h[i], h[j]] = [h[j], h[i]]; draft.highlights = h; draw(); }));
  const hpr = $('#nl-hlprice'); if (hpr) hpr.onchange = () => { draft.hlPrices = hpr.checked; refresh(); };
  const hp = $('#nl-hlpick'); if (hp) hp.onclick = pickHighlights;
  $('#nl-save').onclick = async () => {
    const { error } = await sb.from('team_settings').upsert({ key: 'newsletter_draft', value: draft, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) toastError(error); else toast(L({ en: 'Draft saved for all managers', nl: 'Concept opgeslagen voor alle managers' }));
  };
  $('#nl-reset').onclick = () => { const keep = draft.highlights; draft = defaults(); draft.highlights = keep; draft.blocks = blocksFrom(draft); draw(); };
  $('#nl-copy').onclick = async () => { try { await navigator.clipboard.writeText(html()); toast(L({ en: 'HTML copied', nl: 'HTML gekopieerd' })); } catch { toastError(new Error(L({ en: 'Copying is not allowed here; use Download.', nl: 'Kopiëren lukt hier niet; gebruik Downloaden.' }))); } };
  $('#nl-dl').onclick = () => download(html(), `wintertuin-nieuwsbrief-${todayIso().slice(0, 7)}.html`, 'text/html;charset=utf-8');
}

// Pick dishes for "On the menu now": the dishes on the menu, with photo, search and category
function pickHighlights() {
  const st = { q: '', cat: '', sel: new Set(draft.highlights) };
  const cats = [...new Set(menu.map((m) => m.category).filter(Boolean))];
  const dlg = document.createElement('div'); dlg.className = 'k-overlay dp-overlay'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
  document.body.appendChild(dlg);
  const paint = () => {
    const list = menu.filter((m) => (!st.cat || m.category === st.cat) && (!st.q || [m.name, m.category, m.description].some((v) => String(v || '').toLowerCase().includes(st.q))));
    dlg.innerHTML = `<div class="k-msg dp-pick">
      <div class="dp-head"><h2>${L({ en: 'Dishes from the menu', nl: 'Gerechten uit het menu' })}</h2><button type="button" class="dish-pencil" data-x aria-label="${L({ en: 'Close', nl: 'Sluiten' })}"><i class="ic ic-x" aria-hidden="true"></i></button></div>
      <input type="search" id="hq" value="${esc(st.q)}" placeholder="${L({ en: 'Search', nl: 'Zoeken' })}">
      <div class="dp-filt"><select id="hc"><option value="">${L({ en: 'All categories', nl: 'Alle categorieën' })}</option>${cats.map((k) => `<option ${st.cat === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      <ul class="dp-list">${list.map((m) => `<li><label><input type="checkbox" data-d="${m.id}" ${st.sel.has(m.id) ? 'checked' : ''}>
        ${m.photo_url ? `<img src="${esc(m.photo_url)}" alt="" loading="lazy">` : '<span class="db-ph" aria-hidden="true"><i class="ic ic-image"></i></span>'}
        <span class="dp-t"><strong>${esc(m.name)}</strong><span class="small muted">${esc(m.category || '')}</span></span></label></li>`).join('') || `<li class="empty small muted">${L({ en: 'No dishes found.', nl: 'Geen gerechten gevonden.' })}</li>`}</ul>
      <div class="modal-actions"><button type="button" class="btn" data-x>${L({ en: 'Cancel', nl: 'Annuleren' })}</button><button type="button" class="btn-primary" id="h-ok">${L({ en: 'Done', nl: 'Klaar' })} (${st.sel.size})</button></div></div>`;
    const q = dlg.querySelector('#hq'); q.oninput = () => { st.q = q.value.toLowerCase(); const pos = q.selectionStart; paint(); const nq = dlg.querySelector('#hq'); nq.focus(); nq.setSelectionRange(pos, pos); };
    dlg.querySelector('#hc').onchange = (e) => { st.cat = e.target.value; paint(); };
    dlg.querySelectorAll('[data-d]').forEach((c) => (c.onchange = () => { if (c.checked) st.sel.add(c.dataset.d); else st.sel.delete(c.dataset.d); dlg.querySelector('#h-ok').textContent = `${L({ en: 'Done', nl: 'Klaar' })} (${st.sel.size})`; }));
    dlg.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => dlg.remove()));
    dlg.querySelector('#h-ok').onclick = () => {
      // keep the order you had, new dishes at the end
      draft.highlights = [...draft.highlights.filter((id) => st.sel.has(id)), ...[...st.sel].filter((id) => !draft.highlights.includes(id))];
      dlg.remove(); draw();
    };
  };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
  paint();
}

// ------------------------------------------------------------------ the mail itself: tables and inline styles, 600 px wide
function html() {
  const C = { bg: '#F3F1E4', paper: '#FFFDF0', ink: '#1C2B24', ink2: '#56655D', green: '#22503F', leaf: '#71CE8D', line: '#E2E0CC' };
  const serif = "'Young Serif', Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const p = (t) => `<p style="margin:0 0 14px;font:16px/1.6 ${sans};color:${C.ink2}">${esc(t).replace(/\n/g, '<br>')}</p>`;
  const h2 = (t) => `<h2 style="margin:0 0 10px;font:400 24px/1.25 ${serif};color:${C.green}">${esc(t)}</h2>`;
  const rule = `<tr><td style="padding:0 40px"><div style="height:1px;background:${C.line};line-height:1px;font-size:1px">&nbsp;</div></td></tr>`;
  const block = (inner) => `<tr><td style="padding:28px 40px">${inner}</td></tr>`;
  const label = (k) => L({ nl: SECTIONS.find(([x]) => x === k)[1].nl, en: SECTIONS.find(([x]) => x === k)[1].nl });
  const dateNl = (iso) => { const d = new Date(`${iso}T12:00:00`); return Number.isNaN(d.getTime()) ? '' : `${['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'][d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const parts = [];
  const img = (src, alt) => `<img src="${esc(src)}" width="520" alt="${esc(alt || '')}" style="display:block;width:100%;height:auto;border-radius:14px;margin:0 0 16px">`;
  const domItem = dom && menu.find((x) => x.id === dom.id);
  draft.blocks.filter((bl) => bl.on).forEach((bl, i) => {
    const sep = i > 0 && bl.type !== 'dish' ? [rule] : [];
    if (bl.type === 'intro') { if (bl.text) parts.push(block(p(bl.text))); return; }
    if (bl.type === 'dish') {
      if (!domItem) return; const photo = bl.photo || domItem.photo_url;
      parts.push(`<tr><td style="padding:8px 40px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.green};border-radius:14px">
      ${photo ? `<tr><td><img src="${esc(photo)}" width="520" alt="${esc(domItem.name)}" style="display:block;width:100%;height:auto;border-radius:14px 14px 0 0"></td></tr>` : ''}
      <tr><td style="padding:24px 26px"><p style="margin:0 0 6px;font:600 13px/1.4 ${sans};color:${C.leaf}">${esc(bl.title || 'Gerecht van de maand')}</p>
        <h2 style="margin:0 0 10px;font:400 26px/1.2 ${serif};color:#fff">${esc(domItem.name)}</h2>
        <p style="margin:0;font:15px/1.6 ${sans};color:#E7F0EA">${esc(dom.note || nl(domItem.description))}</p></td></tr></table></td></tr>`);
      return;
    }
    if (bl.type === 'events') {
      if (!draft.events.some((e) => e.title)) return;
      parts.push(...sep, block(h2(bl.title || 'Binnenkort') + draft.events.filter((e) => e.title).map((e) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>
        <td width="74" valign="top" style="padding-top:2px"><div style="width:62px;border:1px solid ${C.leaf};border-radius:10px;text-align:center;padding:6px 0;font:600 12px/1.3 ${sans};color:${C.green}">${esc(dateNl(e.date).split(' ')[0].slice(0, 2))}<br><span style="font:400 22px/1.1 ${serif}">${esc(String(new Date(`${e.date}T12:00:00`).getDate() || ''))}</span><br>${esc((MONTHS[new Date(`${e.date}T12:00:00`).getMonth()] || '').slice(0, 3))}</div></td>
        <td valign="top"><p style="margin:0 0 4px;font:600 17px/1.35 ${sans};color:${C.ink}">${esc(e.title)}</p><p style="margin:0;font:15px/1.55 ${sans};color:${C.ink2}">${esc(e.text)}</p></td></tr></table>`).join('')));
      return;
    }
    if (bl.type === 'highlights') {
      const hl = draft.highlights.map((id) => menu.find((x) => x.id === id)).filter(Boolean); if (!hl.length) return;
      parts.push(...sep, block(h2(bl.title || 'Nu op de kaart') + hl.map((x) => `<p style="margin:0 0 2px;font:600 16px/1.4 ${sans};color:${C.ink}">${esc(x.name)}${draft.hlPrices && x.price != null ? `<span style="font-weight:400;color:${C.ink2}"> &nbsp;${String(Number(x.price).toFixed(2)).replace('.', ',')}</span>` : ''}</p>
      <p style="margin:0 0 14px;font:15px/1.55 ${sans};color:${C.ink2}">${esc(nl(x.description))}</p>`).join('')));
      return;
    }
    if (bl.type === 'practical') {
      parts.push(...sep, block(h2(bl.title || '') + p(bl.text || '') + (draft.cta_label && draft.cta_url
        ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.green};border-radius:999px"><a href="${esc(draft.cta_url)}" style="display:inline-block;padding:13px 26px;font:600 15px ${sans};color:#fff;text-decoration:none">${esc(draft.cta_label)}</a></td></tr></table>` : '')));
      return;
    }
    if (!bl.title && !bl.text && !bl.photo) return;
    parts.push(...sep, block((bl.photo ? img(bl.photo, bl.title) : '') + (bl.title ? h2(bl.title) : '') + (bl.text ? p(bl.text) : '')));
  });
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(draft.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Young+Serif&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.wrap{width:100%!important}td[style*="padding:28px 40px"]{padding:22px 22px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.bg}">
<span style="display:none;max-height:0;overflow:hidden">${esc(((draft.blocks.find((x) => x.type === 'intro' && x.on) || {}).text) || '').slice(0, 110)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${C.paper};border-radius:18px;overflow:hidden">
  <tr><td align="center" style="padding:36px 40px 8px"><img src="${SITE}img/logo.png" width="120" alt="Wintertuin" style="display:block;width:120px;height:auto"></td></tr>
  <tr><td align="center" style="padding:6px 40px 20px"><h1 style="margin:0;font:400 30px/1.2 ${serif};color:${C.green}">${esc(draft.subject)}</h1>
    <p style="margin:8px 0 0;font:14px/1.4 ${sans};color:${C.ink2}">Wintertuin, Cantonspark Baarn</p></td></tr>
  ${parts.join('\n  ')}
  <tr><td style="padding:26px 40px 34px;background:${C.green}" align="center">
    <p style="margin:0 0 6px;font:400 18px/1.4 ${serif};color:#fff">Tot snel in de kas</p>
    <p style="margin:0 0 14px;font:13px/1.6 ${sans};color:#CFE2D7">Wintertuin, Cantonspark, Baarn. Je krijgt deze mail omdat je hebt aangegeven onze nieuwsbrief te willen ontvangen.</p>
    <p style="margin:0;font:13px ${sans}"><a href="${esc(draft.unsub)}" style="color:#fff">Afmelden</a></p></td></tr>
</table></td></tr></table></body></html>`;
}
