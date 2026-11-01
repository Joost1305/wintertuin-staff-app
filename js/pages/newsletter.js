// Newsletter: a monthly mail built from the app. Dish of the month and menu highlights come from the menu,
// the rest is a few short texts. The result is plain, email-safe HTML (tables, inline styles) to paste into
// Brevo, Mailchimp or Gmail. The draft is shared by all managers (team_settings 'newsletter_draft').
import { state, isManager, app, esc, toast, toastError, todayIso, $, $$, download } from '../core.js';
import { lang } from '../i18n.js';
import { sb } from '../data.js';
import { loadDishOfMonth } from './menu.js';

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

let draft = null;
let menu = [];
let dom = null;

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
  if (!draft.highlights.length) draft.highlights = menu.filter((x) => x.group_type !== 'beverage' && x.id !== (dom && dom.id)).slice(0, 3).map((x) => x.id);
  draw();
}

const nl = (desc) => String(desc || '').split('\nEN:')[0].trim();

function draw() {
  const field = (k, rows = 3) => `<textarea data-k="${k}" rows="${rows}">${esc(draft[k] || '')}</textarea>`;
  const sec = (k, body) => `<details class="nl-sec" ${['intro', 'dish', 'events'].includes(k) ? 'open' : ''}><summary><label class="switch" title="${L({ en: 'In this issue', nl: 'In deze editie' })}"><input type="checkbox" data-on="${k}" ${draft.on[k] ? 'checked' : ''}><span></span></label>
    <strong>${L(SECTIONS.find(([x]) => x === k)[1])}</strong></summary><div class="nl-body">${body}</div></details>`;
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
        ${sec('intro', field('intro', 4))}
        ${sec('dish', domItem ? `<p class="small">${esc(domItem.name)}${dom.note ? `: ${esc(dom.note)}` : ''}</p><p class="small muted">${L({ en: 'Change it under Settings, Order of the dishes.', nl: 'Wijzig dit onder Instellingen, Volgorde gerechten.' })}</p>`
          : `<p class="small muted">${L({ en: 'No dish of the month chosen yet: Settings, Order of the dishes.', nl: 'Nog geen gerecht van de maand gekozen: Instellingen, Volgorde gerechten.' })}</p>`)}
        ${sec('events', `${draft.events.map((e, i) => `<div class="nl-ev"><div class="field-row"><input type="date" data-ev="${i}" data-f="date" value="${esc(e.date)}"><input data-ev="${i}" data-f="title" value="${esc(e.title)}"></div>
            <textarea data-ev="${i}" data-f="text" rows="2">${esc(e.text)}</textarea><button type="button" class="link-btn small" data-evdel="${i}">${L({ en: 'Remove', nl: 'Verwijderen' })}</button></div>`).join('')}
          <button type="button" class="btn-sm" id="nl-evadd">+ ${L({ en: 'Event', nl: 'Event' })}</button>
          <p class="small muted">${L({ en: 'Only public evenings here. Private bookings never go in the newsletter.', nl: 'Alleen openbare avonden. Besloten boekingen komen nooit in de nieuwsbrief.' })}</p>`)}
        ${sec('highlights', `<div class="nl-picks">${menu.filter((x) => x.group_type !== 'beverage').map((x) => `<label class="check"><input type="checkbox" data-hl="${x.id}" ${draft.highlights.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('') || `<p class="small muted">${L({ en: 'The menu is empty.', nl: 'Het menu is leeg.' })}</p>`}</div>
          <p class="small muted">${L({ en: 'Two or three is enough.', nl: 'Twee of drie is genoeg.' })}</p>`)}
        ${sec('bakery', field('bakery'))}
        ${sec('coffee', field('coffee'))}
        ${sec('supplier', field('supplier'))}
        ${sec('garden', field('garden'))}
        ${sec('recipe', field('recipe', 5))}
        ${sec('practical', `${field('practical')}<div class="field-row"><input data-k="cta_label" value="${esc(draft.cta_label)}" placeholder="${L({ en: 'Button text', nl: 'Tekst knop' })}"><input data-k="cta_url" value="${esc(draft.cta_url)}" placeholder="https:// of mailto:"></div>`)}
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
  $$('[data-on]').forEach((el) => { el.onclick = (e) => e.stopPropagation(); el.onchange = () => { draft.on[el.dataset.on] = el.checked; refresh(); }; });
  $$('[data-ev]').forEach((el) => (el.oninput = () => { draft.events[Number(el.dataset.ev)][el.dataset.f] = el.value; later(); }));
  $$('[data-evdel]').forEach((b) => (b.onclick = () => { draft.events.splice(Number(b.dataset.evdel), 1); draw(); }));
  $('#nl-evadd').onclick = () => { draft.events.push({ date: todayIso(), title: '', text: '' }); draw(); };
  $$('[data-hl]').forEach((c) => (c.onchange = () => { draft.highlights = $$('[data-hl]').filter((x) => x.checked).map((x) => x.dataset.hl); refresh(); }));
  $('#nl-save').onclick = async () => {
    const { error } = await sb.from('team_settings').upsert({ key: 'newsletter_draft', value: draft, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) toastError(error); else toast(L({ en: 'Draft saved for all managers', nl: 'Concept opgeslagen voor alle managers' }));
  };
  $('#nl-reset').onclick = () => { const keep = draft.highlights; draft = defaults(); draft.highlights = keep; draw(); };
  $('#nl-copy').onclick = async () => { try { await navigator.clipboard.writeText(html()); toast(L({ en: 'HTML copied', nl: 'HTML gekopieerd' })); } catch { toastError(new Error(L({ en: 'Copying is not allowed here; use Download.', nl: 'Kopiëren mag hier niet; gebruik Downloaden.' }))); } };
  $('#nl-dl').onclick = () => download(html(), `wintertuin-nieuwsbrief-${todayIso().slice(0, 7)}.html`, 'text/html;charset=utf-8');
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
  const on = draft.on;
  if (on.intro && draft.intro) parts.push(block(p(draft.intro)));
  const domItem = dom && menu.find((x) => x.id === dom.id);
  if (on.dish && domItem) parts.push(`<tr><td style="padding:8px 40px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.green};border-radius:14px">
      ${domItem.photo_url ? `<tr><td><img src="${esc(domItem.photo_url)}" width="520" alt="${esc(domItem.name)}" style="display:block;width:100%;height:auto;border-radius:14px 14px 0 0"></td></tr>` : ''}
      <tr><td style="padding:24px 26px"><p style="margin:0 0 6px;font:600 13px/1.4 ${sans};color:${C.leaf}">${label('dish')}</p>
        <h2 style="margin:0 0 10px;font:400 26px/1.2 ${serif};color:#fff">${esc(domItem.name)}</h2>
        <p style="margin:0;font:15px/1.6 ${sans};color:#E7F0EA">${esc(dom.note || nl(domItem.description))}</p></td></tr></table></td></tr>`);
  if (on.events && draft.events.some((e) => e.title)) {
    parts.push(rule, block(h2(label('events')) + draft.events.filter((e) => e.title).map((e) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>
        <td width="74" valign="top" style="padding-top:2px"><div style="width:62px;border:1px solid ${C.leaf};border-radius:10px;text-align:center;padding:6px 0;font:600 12px/1.3 ${sans};color:${C.green}">${esc(dateNl(e.date).split(' ')[0].slice(0, 2))}<br><span style="font:400 22px/1.1 ${serif}">${esc(String(new Date(`${e.date}T12:00:00`).getDate() || ''))}</span><br>${esc((MONTHS[new Date(`${e.date}T12:00:00`).getMonth()] || '').slice(0, 3))}</div></td>
        <td valign="top"><p style="margin:0 0 4px;font:600 17px/1.35 ${sans};color:${C.ink}">${esc(e.title)}</p><p style="margin:0;font:15px/1.55 ${sans};color:${C.ink2}">${esc(e.text)}</p></td></tr></table>`).join('')));
  }
  const hl = draft.highlights.map((id) => menu.find((x) => x.id === id)).filter(Boolean);
  if (on.highlights && hl.length) parts.push(rule, block(h2(label('highlights')) + hl.map((x) => `<p style="margin:0 0 2px;font:600 16px/1.4 ${sans};color:${C.ink}">${esc(x.name)}${x.price != null ? `<span style="font-weight:400;color:${C.ink2}"> &nbsp;${String(Number(x.price).toFixed(2)).replace('.', ',')}</span>` : ''}</p>
      <p style="margin:0 0 14px;font:15px/1.55 ${sans};color:${C.ink2}">${esc(nl(x.description))}</p>`).join('')));
  for (const k of ['bakery', 'coffee', 'supplier', 'garden', 'recipe']) if (on[k] && draft[k]) parts.push(rule, block(h2(label(k)) + p(draft[k])));
  if (on.practical) parts.push(rule, block(h2(label('practical')) + p(draft.practical) + (draft.cta_label && draft.cta_url
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.green};border-radius:999px"><a href="${esc(draft.cta_url)}" style="display:inline-block;padding:13px 26px;font:600 15px ${sans};color:#fff;text-decoration:none">${esc(draft.cta_label)}</a></td></tr></table>` : '')));
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(draft.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Young+Serif&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.wrap{width:100%!important}td[style*="padding:28px 40px"]{padding:22px 22px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.bg}">
<span style="display:none;max-height:0;overflow:hidden">${esc(draft.intro || '').slice(0, 110)}</span>
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
