// Menu cards: the lunch card, the dinner card and the allergen chart, made from the dishes in the app and printed
// (or saved as PDF) in the Wintertuin style. Managers edit titles, sections and which dishes show, add free lines,
// or import a Word document. Sections that follow a category stay up to date with the Menu page by themselves.
// Cards are kept in team_settings 'menu_cards' (readable by everyone, written by managers).
import { state, isManager, app, esc, toast, toastError, $, $$, confirmDialog, printHtml } from '../core.js';
import { lang } from '../i18n.js';
import { sb } from '../data.js';
import { ALLERGENS } from './menu.js';

const L = (o) => o[lang()] || o.en;
const AL_NL = { gluten: 'Gluten', crustaceans: 'Schaaldieren', eggs: 'Eieren', fish: 'Vis', peanuts: "Pinda's", soy: 'Soja', milk: 'Melk', nuts: 'Noten', celery: 'Selderij',
  mustard: 'Mosterd', sesame: 'Sesam', sulphites: 'Sulfieten', lupin: 'Lupine', molluscs: 'Weekdieren' };
const uid = () => Math.random().toString(36).slice(2, 10);
const nlText = (d) => String(d || '').split('\nEN:')[0].trim();
const money = (p) => (p == null || p === '' ? '' : String(Number(p).toFixed(2)).replace('.', ',').replace(',00', ''));

export function defaultCards() {
  return [
    { id: 'lunch', kind: 'menu', name: 'Lunchkaart', title: 'Lunch', subtitle: 'Vrijdag tot en met zondag', priceLine: '', intro: '',
      note: 'Tachtig procent plant, twintig procent met zorg gekozen. Alles zelf gemaakt, zo lokaal als het kan.', showPrices: true, showCodes: true,
      sections: [
        { id: uid(), title: 'Uit de bakkerij', cat: 'Bakkerij', hidden: [], extra: [] },
        { id: uid(), title: 'Lunch', cat: 'Lunch', hidden: [], extra: [] },
        { id: uid(), title: 'Borrel, vanaf 15:00', cat: 'Borrel', hidden: [], extra: [], newPage: true, pageTitle: 'Borrel, zoet en drinken' },
        { id: uid(), title: 'Zoet', cat: 'Zoet', hidden: [], extra: [] },
        { id: uid(), title: 'Koffie', cat: 'Koffie', hidden: [], extra: [] },
        { id: uid(), title: 'Thee en fris', cat: 'Thee en fris', hidden: [], extra: [] },
        { id: uid(), title: 'Wijn en bier', cat: 'Wijn en bier', hidden: [], extra: [] },
      ] },
    { id: 'dinner', kind: 'menu', name: 'Dinerkaart', title: 'Diner', subtitle: 'Winter, table d’hôte', priceLine: 'Twee gangen  39',
      intro: 'Kies een voorgerecht en een hoofdgerecht, of een hoofdgerecht en een nagerecht. Met brood en boter van onze bakkerij.',
      note: 'Derde gang erbij? Kaas van de boer of een nagerecht voor 9.', showPrices: false, showCodes: true,
      sections: [
        { id: uid(), title: 'Voor', cat: 'Diner: voorgerecht', hidden: [], extra: [] },
        { id: uid(), title: 'Hoofd', cat: 'Diner: hoofdgerecht', hidden: [], extra: [] },
        { id: uid(), title: 'Na', cat: 'Diner: nagerecht', hidden: [], extra: [] },
      ] },
    { id: 'allergens', kind: 'allergens', name: 'Allergenenkaart', title: 'Allergenenkaart', subtitle: 'Een stip betekent: zit in het gerecht. Vraag bij twijfel altijd even na.',
      note: 'We werken in een open keuken met gluten, noten en sesam. Sporen kunnen we nooit helemaal uitsluiten.', sections: [] },
  ];
}

export async function loadCards() {
  try {
    const { data } = await sb.from('team_settings').select('value').eq('key', 'menu_cards').maybeSingle();
    if (data && data.value && Array.isArray(data.value.cards) && data.value.cards.length) return data.value.cards;
  } catch { /* defaults */ }
  return defaultCards();
}
async function saveCards(cards) {
  const { error } = await sb.from('team_settings').upsert({ key: 'menu_cards', value: { cards }, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

// ------------------------------------------------------------------ what a section shows
function sectionItems(sec, menu) {
  const fromCat = sec.cat ? menu.filter((m) => (m.category || '') === sec.cat) : [];
  const order = sec.order || [];
  fromCat.sort((a, b) => { const ia = order.indexOf(a.id); const ib = order.indexOf(b.id); return (ia < 0 ? 1e6 + (a.sort_order || 0) : ia) - (ib < 0 ? 1e6 + (b.sort_order || 0) : ib); });
  const live = fromCat.map((m) => ({ ref: m.id, name: m.name, description: nlText(m.description), price: m.price, allergens: m.allergens || [], hidden: (sec.hidden || []).includes(m.id) }));
  const extra = (sec.extra || []).map((x) => {
    if (x.ref) { const m = menu.find((y) => y.id === x.ref); return m ? { ...x, name: m.name, description: nlText(m.description), price: m.price, allergens: m.allergens || [] } : null; }
    return { ...x, allergens: x.allergens || [] };
  }).filter(Boolean);
  return [...live, ...extra];
}

// ------------------------------------------------------------------ the printed card (also the preview)
export function cardSheet(card, menu) {
  const css = `
  @page { size: A4 portrait; margin: 12mm 14mm; }
  @font-face { font-family: WTSerif; src: url(fonts/young-serif.woff2) format('woff2'); }
  @font-face { font-family: WTSans; src: url(fonts/inter-400.woff2) format('woff2'); font-weight: 400; }
  @font-face { font-family: WTSans; src: url(fonts/inter-600.woff2) format('woff2'); font-weight: 600; }
  @font-face { font-family: WTSans; src: url(fonts/inter-400-italic.woff2) format('woff2'); font-style: italic; }
  .mc-sheet, .mc-sheet * { box-sizing: border-box; }
  .mc-sheet { color: #1C2B24; font: 400 9.6pt/1.4 WTSans, -apple-system, 'Segoe UI', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mc-page { width: 210mm; min-height: 297mm; background: #FFFDF0; padding: 18mm 20mm 16mm; display: flex; flex-direction: column; break-after: page; page-break-after: always; position: relative; }
  .mc-page:last-child { break-after: auto; page-break-after: auto; }
  .mc-page.al { padding: 14mm 12mm; }
  /* On paper the printer's own margins apply: the sheet takes the printable width, long pages flow on */
  @media print {
    .mc-page, .mc-page.al { width: auto !important; height: auto !important; min-height: 0 !important; padding: 0 !important; background: transparent !important; overflow: visible !important; display: block !important; box-shadow: none !important; margin: 0 !important; }
    .mc-foot { margin-top: 5mm; }
    .mc-head { margin-bottom: 5mm; }
    .mc-head img { width: 20mm; margin-bottom: 2mm; }
    .mc-sheet h1 { font-size: 26pt !important; }
    .mc-sec { margin-bottom: 4mm; }
    .mc-dish { margin-bottom: 2.2mm; }
    .mc-dish .d { font-size: 8.2pt; margin-top: .2mm; line-height: 1.3; }
    .mc-table th, .mc-table td { padding: .45mm 1mm !important; line-height: 1.12 !important; }
    .mc-table { font-size: 7.2pt; }
    .mc-table th.al { height: 18mm; }
    .mc-alhead { margin-bottom: 2mm; }
  }
  .mc-head { text-align: center; margin-bottom: 7mm; }
  .mc-head img { width: 26mm; height: auto; display: block; margin: 0 auto 3mm; }
  .mc-sheet h1 { font: 400 30pt/1.1 WTSerif, Georgia, serif !important; color: #22503F; margin: 0 !important; border: 0 !important; }
  .mc-sub { color: #5A6A62; margin-top: 2mm; font-size: 10pt; }
  .mc-price { font: 400 16pt/1.2 WTSerif, Georgia, serif; color: #22503F; margin-top: 5mm; }
  .mc-intro { color: #5A6A62; margin: 2mm auto 0; max-width: 150mm; }
  .mc-sec { margin-bottom: 6mm; }
  .mc-sheet h2 { font: 400 14pt/1.2 WTSerif, Georgia, serif !important; color: #22503F; margin: 0 0 3.5mm !important; padding: 0 0 1.6mm !important; border: 0 !important;
    background: linear-gradient(#71CE8D, #71CE8D) left bottom / 12mm 1.2pt no-repeat; }
  .mc-dish { display: flex; gap: 6mm; align-items: baseline; margin-bottom: 2.6mm; break-inside: avoid; }
  .mc-dish .t { flex: 1; }
  .mc-dish .n { font-weight: 600; font-size: 10.4pt; }
  .mc-dish sup { font-size: 6.4pt; color: #5A6A62; margin-left: 1.4mm; letter-spacing: .02em; }
  .mc-dish .d { color: #5A6A62; font-size: 8.8pt; margin-top: .6mm; }
  .mc-dish .p { font: 400 11pt WTSerif, Georgia, serif; white-space: nowrap; }
  .mc-note { text-align: center; font-style: italic; color: #22503F; margin-top: 2mm; }
  .mc-foot { margin-top: auto; border-top: .6pt solid #D9DCC8; padding-top: 2.5mm; text-align: center; color: #5A6A62; font-size: 6.8pt; line-height: 1.35; break-inside: avoid; }
  .mc-table { width: 100%; border-collapse: collapse !important; font-size: 7.6pt; table-layout: fixed; }
  .mc-table col.nm { width: 34%; } .mc-table col.ct { width: 15%; }
  .mc-table th, .mc-table td { border: 0 !important; border-bottom: .4pt solid #E5E3D0 !important; padding: 1.1mm 1mm !important; line-height: 1.2; }
  .mc-table th.al { height: 22mm; vertical-align: bottom; text-align: left; white-space: nowrap; }
  .mc-table th.al span { display: inline-block; transform: rotate(-60deg); transform-origin: left bottom; width: 4mm; font-weight: 600; }
  .mc-table td.c { text-align: center; color: #22503F; font-size: 9pt; border-left: .4pt solid #E5E3D0 !important; }
  .mc-table tr:nth-child(even) td { background: #F6F4E6; }
  .mc-table .cat { color: #5A6A62; font-size: 6.8pt; text-align: right; }
  .mc-alhead { display: flex; gap: 6mm; align-items: center; margin-bottom: 4mm; }
  .mc-alhead img { width: 18mm; }
  .mc-alhead h1 { font-size: 22pt !important; }`;
  const legend = `<div class="mc-foot">Allergenen: ${ALLERGENS.map((a, i) => `${i + 1} ${AL_NL[a]}`).join(' &nbsp; ')}<br>Vragen over allergenen of dieetwensen? Vraag het ons, we kijken graag wat kan.</div>`;
  if (card.kind === 'allergens') {
    const rows = menu.filter((m) => m.active !== false);
    const perPage = 44; // A4 portrait
    const pages = [];
    for (let i = 0; i < Math.max(rows.length, 1); i += perPage) {
      pages.push(`<section class="mc-page al"><div class="mc-alhead"><img src="img/logo.png" alt=""><div><h1>${esc(card.title)}</h1><div class="mc-sub">${esc(card.subtitle || '')}</div></div></div>
        <table class="mc-table"><colgroup><col class="nm"><col class="ct">${ALLERGENS.map(() => '<col>').join('')}</colgroup><thead><tr><th></th><th></th>${ALLERGENS.map((a) => `<th class="al"><span>${AL_NL[a]}</span></th>`).join('')}</tr></thead><tbody>
        ${rows.slice(i, i + perPage).map((m) => `<tr><td>${esc(m.name)}</td><td class="cat">${esc(m.category || '')}</td>${ALLERGENS.map((a) => `<td class="c">${(m.allergens || []).includes(a) ? '&#9679;' : ''}</td>`).join('')}</tr>`).join('')}
        </tbody></table><div class="mc-foot">${esc(card.note || '')} Wintertuin, Cantonspark Baarn.</div></section>`);
    }
    return `<style>${css}</style><div class="mc-sheet">${pages.join('')}</div>`;
  }
  // pages: a section with "new page" starts one
  const pages = [[]];
  card.sections.forEach((s) => { if (s.newPage && pages[pages.length - 1].length) pages.push([]); pages[pages.length - 1].push(s); });
  const codes = (al) => (card.showCodes && al.length ? `<sup>${al.map((a) => ALLERGENS.indexOf(a) + 1).filter((n) => n > 0).sort((a, b) => a - b).join(' ')}</sup>` : '');
  const html = pages.map((secs, pi) => {
    const first = pi === 0;
    const head = first
      ? `<div class="mc-head"><img src="img/logo.png" alt="Wintertuin"><h1>${esc(card.title)}</h1>${card.subtitle ? `<div class="mc-sub">${esc(card.subtitle)}</div>` : ''}
          ${card.priceLine ? `<div class="mc-price">${esc(card.priceLine)}</div>` : ''}${card.intro ? `<div class="mc-intro">${esc(card.intro)}</div>` : ''}</div>`
      : `<div class="mc-head"><img src="img/logo.png" alt=""><h1>${esc(secs[0].pageTitle || card.title)}</h1></div>`;
    const body = secs.map((s) => {
      const items = sectionItems(s, menu).filter((x) => !x.hidden);
      if (!items.length && !s.title) return '';
      return `<div class="mc-sec"><h2>${esc(s.title || '')}</h2>${items.map((x) => `<div class="mc-dish"><div class="t"><span class="n">${esc(x.name)}</span>${codes(x.allergens || [])}
        ${x.description ? `<div class="d">${esc(x.description)}</div>` : ''}</div>${card.showPrices && x.price != null && x.price !== '' ? `<div class="p">${esc(money(x.price))}</div>` : ''}</div>`).join('')}</div>`;
    }).join('');
    const last = pi === pages.length - 1;
    return `<section class="mc-page">${head}${body}${last && card.note ? `<div class="mc-note">${esc(card.note)}</div>` : ''}${card.showCodes ? legend : '<div class="mc-foot">Wintertuin, Cantonspark Baarn</div>'}</section>`;
  }).join('');
  return `<style>${css}</style><div class="mc-sheet">${html}</div>`;
}

// ------------------------------------------------------------------ page
let cards = [];
let menu = [];
let cur = null;
let dirty = false;

export async function renderMenuCard(args = []) {
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  const [c, m] = await Promise.all([loadCards(), sb.from('menu_items').select('*').eq('active', true).order('group_type').order('sort_order').order('name').then((r) => r.data || [], () => [])]);
  cards = c; menu = m; dirty = false;
  cur = cards.find((x) => x.id === args[0]) || cards[0];
  // Tapping a card opens it full screen, as guests see it. The pencil (managers) opens the editor.
  editing = args[1] === 'edit' && isManager();
  if (editing) draw(); else drawViewer();
}
let editing = false;

// ------------------------------------------------------------------ full-screen viewer
let pdfJob = null; // { id, promise, file }
function drawViewer() {
  const mgr = isManager();
  const c = cur;
  app().innerHTML = `<div class="mc-viewer" role="dialog" aria-modal="true" aria-label="${esc(c.name || c.title)}">
    <header class="mcv-bar">
      <a class="mcv-btn" href="#/menu" id="mcv-close" aria-label="${L({ en: 'Close', nl: 'Sluiten' })}"><i class="ic ic-x" aria-hidden="true"></i></a>
      <nav class="mcv-tabs">${cards.map((x) => `<a class="mcv-tab ${x === c ? 'on' : ''}" href="#/menucard/${x.id}">${esc(x.name || x.title)}</a>`).join('')}</nav>
      <div class="mcv-tools">
        <button type="button" class="mcv-btn" id="mcv-share" aria-label="${L({ en: 'Share', nl: 'Delen' })}"><i class="ic ic-share" aria-hidden="true"></i><span>${L({ en: 'Share', nl: 'Delen' })}</span></button>
        <button type="button" class="mcv-btn" id="mcv-pdf" aria-label="${L({ en: 'Download PDF', nl: 'Pdf downloaden' })}"><i class="ic ic-download" aria-hidden="true"></i><span>PDF</span></button>
        <button type="button" class="mcv-btn mcv-wide" id="mc-print" aria-label="${L({ en: 'Print', nl: 'Printen' })}"><i class="ic ic-printer" aria-hidden="true"></i><span>${L({ en: 'Print', nl: 'Printen' })}</span></button>
        ${mgr ? `<a class="mcv-btn" href="#/menucard/${c.id}/edit" id="mcv-edit" aria-label="${L({ en: 'Edit this card', nl: 'Deze kaart bewerken' })}" title="${L({ en: 'Edit', nl: 'Bewerken' })}"><i class="ic ic-pencil" aria-hidden="true"></i></a>` : ''}
      </div>
    </header>
    <div class="mcv-body"><iframe id="mc-frame" title="${esc(c.title || c.name)}"></iframe></div>
  </div>`;
  preview();
  $('#mc-print').onclick = () => printHtml(cardSheet(c, menu));
  $('#mcv-pdf').onclick = () => withPdf($('#mcv-pdf'), (file) => download(file));
  $('#mcv-share').onclick = () => withPdf($('#mcv-share'), (file) => shareFile(file));
  // make the PDF in the background, so "Share" opens WhatsApp at once (phones only allow sharing straight after a tap)
  pdfJob = null;
  setTimeout(() => { if ($('.mc-viewer') && cur === c) startPdf(c); }, 900);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.mc-viewer') && !document.querySelector('.k-overlay, .modal:not([hidden])')) location.hash = '#/menu'; });

const pdfName = (c) => `Wintertuin ${String(c.title || c.name || 'menu').replace(/[\\/:*?"<>|]/g, '')}.pdf`;
function startPdf(c) {
  if (pdfJob && pdfJob.id === c.id) return pdfJob.promise;
  const job = { id: c.id, file: null };
  job.promise = makePdf(c).then((f) => { job.file = f; return f; });
  job.promise.catch(() => { if (pdfJob === job) pdfJob = null; });
  pdfJob = job;
  return job.promise;
}
async function withPdf(btn, use) {
  if (pdfJob && pdfJob.id === cur.id && pdfJob.file) return use(pdfJob.file);
  btn.disabled = true; btn.classList.add('busy');
  try { await startPdf(cur); } catch (e) { btn.disabled = false; btn.classList.remove('busy'); return toastError(e); }
  btn.disabled = false; btn.classList.remove('busy');
  return use(pdfJob.file, true);
}
function download(file) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name.replace('.pdf', '') }); }
    catch (e) {
      if (e.name === 'AbortError') return;
      // the phone wants a fresh tap: the PDF is ready now, so the next tap opens WhatsApp straight away
      if (e.name === 'NotAllowedError') return toast(L({ en: 'The PDF is ready. Tap Share again.', nl: 'De pdf is klaar. Tik nog een keer op Delen.' }));
      toastError(e);
    }
    return;
  }
  download(file);
  toast(L({ en: 'This browser cannot share files, so the PDF was downloaded. Send it from your downloads.', nl: 'Deze browser kan geen bestanden delen, dus de pdf is gedownload. Stuur hem door vanuit je downloads.' }));
}

function loadScript(src, glob) {
  if (window[glob]) return Promise.resolve(window[glob]);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(window[glob]); s.onerror = () => rej(new Error(`${src} did not load`)); document.head.appendChild(s); });
}
// html2canvas draws the text in this window, so the card's fonts must be known here too, under the same names
async function mainFonts() {
  if (!document.getElementById('mc-fonts')) {
    const st = document.createElement('style'); st.id = 'mc-fonts';
    st.textContent = `@font-face{font-family:WTSerif;src:url(fonts/young-serif.woff2) format('woff2')}
      @font-face{font-family:WTSans;src:url(fonts/inter-400.woff2) format('woff2');font-weight:400}
      @font-face{font-family:WTSans;src:url(fonts/inter-600.woff2) format('woff2');font-weight:600}
      @font-face{font-family:WTSans;src:url(fonts/inter-400-italic.woff2) format('woff2');font-style:italic}`;
    document.head.appendChild(st);
  }
  try { await Promise.all(['16px WTSerif', '16px WTSans', '600 16px WTSans', 'italic 16px WTSans'].map((f) => document.fonts.load(f))); } catch { /* older browsers */ }
}
// The card as a real A4 PDF: each page drawn at full size in a hidden frame, then placed on its own A4 page
export async function makePdf(c) {
  await Promise.all([loadScript('vendor/html2canvas.min.js', 'html2canvas'), loadScript('vendor/jspdf.min.js', 'jspdf')]);
  const fr = document.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;visibility:visible';
  document.body.appendChild(fr);
  try {
    await new Promise((r) => { fr.onload = r; fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${location.href.split('#')[0]}">
      <style>html,body{margin:0;background:#FFFDF0;-webkit-text-size-adjust:none;text-size-adjust:none}</style></head><body>${cardSheet(c, menu)}</body></html>`; });
    const d = fr.contentDocument;
    // load the card's own fonts before drawing, or the headings come out in a stand-in font
    try { await Promise.all([...d.fonts].map((f) => f.load().catch(() => null))); await d.fonts.ready; } catch { /* older browsers */ }
    await Promise.all([...d.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; }))));
    await mainFonts();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages = [...d.querySelectorAll('.mc-page')];
    for (let i = 0; i < pages.length; i++) {
      const cv = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#FFFDF0', useCORS: true, logging: false, windowWidth: 820 });
      if (i) pdf.addPage();
      pdf.setFillColor(255, 253, 240); pdf.rect(0, 0, 210, 297, 'F');
      const ratio = cv.height / cv.width; let w = 210; let h = 210 * ratio;
      if (h > 297) { h = 297; w = 297 / ratio; }
      pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', (210 - w) / 2, 0, w, h);
    }
    return new File([pdf.output('blob')], pdfName(c), { type: 'application/pdf' });
  } finally { fr.remove(); }
}

function draw() {
  const mgr = isManager();
  const cats = [...new Set(menu.map((m) => m.category).filter(Boolean))];
  const c = cur;
  const inp = (k, ph = '') => `<input data-c="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph)}">`;
  app().innerHTML = `
    <div class="page-head"><div><a class="small" href="#/menu"><i class="ic ic-prev" aria-hidden="true"></i> ${L({ en: 'Menu', nl: 'Menu' })}</a><h1>${esc(c.name || c.title)}</h1>
      <div class="muted small">${L({ en: 'Changes show in the preview straight away. Save when you are done.', nl: 'Wijzigingen zie je meteen in het voorbeeld. Sla op als je klaar bent.' })}</div></div>
      <div class="page-actions"><a class="btn btn-sm" href="#/menucard/${c.id}" data-tab="${c.id}" id="mc-view"><i class="ic ic-eye" aria-hidden="true"></i> ${L({ en: 'View card', nl: 'Kaart bekijken' })}</a></div></div>
    <div class="mc-tabs">${cards.map((x) => `<a class="chip ${x === c ? 'on' : ''}" href="#/menucard/${x.id}/edit" data-tab="${x.id}">${esc(x.name || x.title)}</a>`).join('')}</div>
    <div class="mc-grid ${mgr ? '' : 'view'}">
      <div class="mc-preview"><div class="mc-frame-wrap"><iframe id="mc-frame" title="${L({ en: 'Preview', nl: 'Voorbeeld' })}"></iframe></div><div class="small muted" id="mc-warn"></div></div>
      ${mgr ? `<div class="mc-form" id="mc-edit">
        <div class="mc-form-head"><h2>${L({ en: 'Edit this card', nl: 'Deze kaart bewerken' })}</h2>
          <div class="mc-form-tools"><label class="btn btn-sm" for="mc-word"><i class="ic ic-book" aria-hidden="true"></i> ${L({ en: 'Import Word', nl: 'Word importeren' })}</label><input type="file" id="mc-word" accept=".docx" hidden>
          <button type="button" class="btn-sm" id="mc-new">+ ${L({ en: 'New card', nl: 'Nieuwe kaart' })}</button>
          <button type="button" class="btn-primary btn-sm" id="mc-save" ${dirty ? '' : 'disabled'}>${L({ en: 'Save', nl: 'Opslaan' })}</button></div></div>
        <div class="field-row"><div class="field"><label>${L({ en: 'Name (button)', nl: 'Naam (knop)' })}</label>${inp('name')}</div><div class="field"><label>${L({ en: 'Title on the card', nl: 'Titel op de kaart' })}</label>${inp('title')}</div></div>
        <div class="field"><label>${L({ en: 'Subtitle', nl: 'Ondertitel' })}</label>${inp('subtitle')}</div>
        ${c.kind === 'allergens' ? `<div class="field"><label>${L({ en: 'Line at the bottom', nl: 'Regel onderaan' })}</label>${inp('note')}</div>
          <p class="small muted">${L({ en: 'The allergen chart always lists every dish and drink on the Menu page, with the allergens set there.', nl: 'De allergenenkaart toont altijd alle gerechten en dranken van de Menu-pagina, met de allergenen die daar staan.' })}</p>` : `
        <div class="field-row"><div class="field"><label>${L({ en: 'Price line (optional)', nl: 'Prijsregel (optioneel)' })}</label>${inp('priceLine', 'Twee gangen 39')}</div>
          <div class="field mc-checks"><label class="check"><input type="checkbox" data-cb="showPrices" ${c.showPrices ? 'checked' : ''}> ${L({ en: 'Prices per dish', nl: 'Prijs per gerecht' })}</label>
          <label class="check"><input type="checkbox" data-cb="showCodes" ${c.showCodes ? 'checked' : ''}> ${L({ en: 'Allergen numbers', nl: 'Allergeennummers' })}</label></div></div>
        <div class="field"><label>${L({ en: 'Introduction (optional)', nl: 'Inleiding (optioneel)' })}</label><textarea data-c="intro" rows="2">${esc(c.intro || '')}</textarea></div>
        <div class="field"><label>${L({ en: 'Closing line (optional)', nl: 'Slotregel (optioneel)' })}</label>${inp('note')}</div>
        <div class="subhead">${L({ en: 'Sections', nl: 'Blokken' })}</div>
        ${c.sections.map((s, si) => `<details class="nl-sec mc-sec-ed" ${si < 2 ? 'open' : ''}><summary><strong>${esc(s.title || L({ en: '(no title)', nl: '(geen titel)' }))}</strong>
            <span class="mc-sec-tools"><button type="button" class="btn-sm" data-sup="${si}" ${si === 0 ? 'disabled' : ''} aria-label="${L({ en: 'Up', nl: 'Omhoog' })}">&#9650;</button><button type="button" class="btn-sm" data-sdown="${si}" ${si === c.sections.length - 1 ? 'disabled' : ''} aria-label="${L({ en: 'Down', nl: 'Omlaag' })}">&#9660;</button></span></summary>
          <div class="nl-body">
            <div class="field-row"><input data-s="${si}" data-f="title" value="${esc(s.title || '')}" placeholder="${L({ en: 'Section title', nl: 'Titel van het blok' })}">
              <select data-s="${si}" data-f="cat"><option value="">${L({ en: 'No category: own lines only', nl: 'Geen categorie: alleen eigen regels' })}</option>${cats.map((k) => `<option ${s.cat === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}${s.cat && !cats.includes(s.cat) ? `<option selected>${esc(s.cat)}</option>` : ''}</select></div>
            <label class="check small"><input type="checkbox" data-s="${si}" data-f="newPage" ${s.newPage ? 'checked' : ''}> ${L({ en: 'Start a new page here', nl: 'Hier een nieuwe pagina beginnen' })}</label>
            ${s.newPage ? `<input data-s="${si}" data-f="pageTitle" value="${esc(s.pageTitle || '')}" placeholder="${L({ en: 'Title of that page', nl: 'Titel van die pagina' })}">` : ''}
            <ul class="mc-items">${sectionItems(s, menu).map((x, xi) => `<li class="${x.hidden ? 'off' : ''}">
              ${x.ref && !x.extraIndex && (s.cat && menu.find((m) => m.id === x.ref && m.category === s.cat))
                ? `<label class="check"><input type="checkbox" data-show="${si}|${x.ref}" ${x.hidden ? '' : 'checked'}> ${esc(x.name)}</label><span class="mc-i-tools"><button type="button" class="link-btn small" data-iup="${si}|${x.ref}">&#9650;</button></span>`
                : `<span>${esc(x.name)} <span class="tag">${x.ref ? L({ en: 'from menu', nl: 'uit menu' }) : L({ en: 'own line', nl: 'eigen regel' })}</span>${!x.ref && !(x.allergens || []).length ? ` <span class="tag warn">${L({ en: 'allergens?', nl: 'allergenen?' })}</span>` : ''}</span>
                  <span class="mc-i-tools">${x.ref ? '' : `<button type="button" class="link-btn small" data-xedit="${si}|${(s.extra || []).indexOf((s.extra || []).find((y) => y.id === x.id))}">${L({ en: 'Edit', nl: 'Bewerken' })}</button>`}
                  <button type="button" class="link-btn small" data-xdel="${si}|${x.id}">${L({ en: 'Remove', nl: 'Weghalen' })}</button></span>`}</li>`).join('')}</ul>
            <div class="mc-add"><select data-addref="${si}"><option value="">+ ${L({ en: 'dish from the menu', nl: 'gerecht uit het menu' })}</option>${menu.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
              <button type="button" class="btn-sm" data-addline="${si}">+ ${L({ en: 'own line', nl: 'eigen regel' })}</button>
              <button type="button" class="link-btn small" data-sdel="${si}">${L({ en: 'Remove section', nl: 'Blok weghalen' })}</button></div>
          </div></details>`).join('')}
        <button type="button" class="btn-sm" id="mc-addsec">+ ${L({ en: 'Section', nl: 'Blok' })}</button>`}
        <div class="mc-danger">${!['lunch', 'dinner', 'allergens'].includes(c.id) ? `<button type="button" class="link-btn small" id="mc-del">${L({ en: 'Delete this card', nl: 'Deze kaart verwijderen' })}</button>` : `<button type="button" class="link-btn small" id="mc-reset">${L({ en: 'Undo all changes: back to the original layout', nl: 'Alle wijzigingen terugdraaien: terug naar de oorspronkelijke indeling' })}</button>`}</div>
      </div>` : ''}
    </div>`;
  preview();
  bind();
}

function preview() {
  const f = $('#mc-frame');
  // iPhone Safari enlarges small text in a frame on its own (text autosizing): switched off, and the A4 pages are
  // scaled with a transform instead of zoom, so the preview is an exact small copy of the printed card
  f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${location.href.split('#')[0]}">
    <style>html,body,body *{-webkit-text-size-adjust:none!important;text-size-adjust:none!important}html,body{margin:0;background:${editing ? "#E9E7DA" : "transparent"};overflow:hidden}
    #sc{width:210mm;padding:6mm 0;transform-origin:top left}.mc-page{margin:0 auto 8mm;box-shadow:0 4px 24px rgba(0,0,0,.12)}.mc-page:last-child{margin-bottom:0}</style></head>
    <body><div id="sc">${cardSheet(cur, menu)}</div></body></html>`;
  f.onload = () => {
    try {
      const d = f.contentDocument; const pages = [...d.querySelectorAll('.mc-page')];
      const over = pages.some((p) => p.scrollHeight > 1125); // taller than A4
      const warn = $('#mc-warn'); if (warn) warn.textContent = over ? L({ en: 'Something does not fit on its page. Start a new page at a section, or hide a dish.', nl: 'Iets past niet op de pagina. Begin bij een blok een nieuwe pagina, of verberg een gerecht.' }) : '';
      // scale the A4 pages to the width of the preview
      const sc = d.getElementById('sc'); const w = f.clientWidth; const pw = sc.offsetWidth || 794; const z = Math.min(1, w / pw);
      sc.style.transform = `scale(${z})`; if (z === 1) sc.style.margin = '0 auto';
      const fit = () => { f.style.height = `${Math.ceil(sc.offsetHeight * z) + 4}px`; };
      fit(); [...d.images].forEach((im) => { if (!im.complete) im.addEventListener('load', fit); });
    } catch { /* preview only */ }
  };
}

function changed() { dirty = true; const b = $('#mc-save'); if (b) b.disabled = false; }

function bind() {
  const c = cur;
  let timer;
  const soon = () => { clearTimeout(timer); timer = setTimeout(preview, 300); };
  $$('[data-tab]').forEach((a) => (a.onclick = async (e) => {
    if (!dirty) return;
    e.preventDefault();
    if (await confirmDialog(L({ en: 'Save your changes first?', nl: 'Eerst je wijzigingen opslaan?' }), L({ en: 'Save', nl: 'Opslaan' }), false)) { await save(); }
    dirty = false; location.hash = a.getAttribute('href');
  }));
  $$('[data-c]').forEach((el) => (el.oninput = () => { c[el.dataset.c] = el.value; changed(); soon(); }));
  $$('[data-cb]').forEach((el) => (el.onchange = () => { c[el.dataset.cb] = el.checked; changed(); preview(); }));
  $$('[data-s]').forEach((el) => {
    const s = c.sections[Number(el.dataset.s)]; const k = el.dataset.f;
    if (el.type === 'checkbox') el.onchange = () => { s[k] = el.checked; changed(); draw(); };
    else if (el.tagName === 'SELECT') el.onchange = () => { s[k] = el.value || null; s.hidden = []; changed(); draw(); };
    else el.oninput = () => { s[k] = el.value; changed(); soon(); };
  });
  $$('[data-show]').forEach((el) => (el.onchange = () => {
    const [si, id] = el.dataset.show.split('|'); const s = c.sections[Number(si)];
    s.hidden = (s.hidden || []).filter((x) => x !== id); if (!el.checked) s.hidden.push(id);
    el.closest('li').classList.toggle('off', !el.checked); changed(); preview();
  }));
  $$('[data-iup]').forEach((b) => (b.onclick = () => {
    const [si, id] = b.dataset.iup.split('|'); const s = c.sections[Number(si)];
    const ids = sectionItems(s, menu).filter((x) => x.ref && menu.find((m) => m.id === x.ref && m.category === s.cat)).map((x) => x.ref);
    const i = ids.indexOf(id); if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; s.order = ids; changed(); draw(); }
  }));
  $$('[data-sup]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); const i = Number(b.dataset.sup); [c.sections[i - 1], c.sections[i]] = [c.sections[i], c.sections[i - 1]]; changed(); draw(); }));
  $$('[data-sdown]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); const i = Number(b.dataset.sdown); [c.sections[i + 1], c.sections[i]] = [c.sections[i], c.sections[i + 1]]; changed(); draw(); }));
  $$('[data-sdel]').forEach((b) => (b.onclick = () => { c.sections.splice(Number(b.dataset.sdel), 1); changed(); draw(); }));
  $$('[data-addref]').forEach((el) => (el.onchange = () => { if (!el.value) return; const s = c.sections[Number(el.dataset.addref)]; (s.extra = s.extra || []).push({ id: uid(), ref: el.value }); changed(); draw(); }));
  $$('[data-addline]').forEach((b) => (b.onclick = () => lineEditor(c.sections[Number(b.dataset.addline)], null)));
  $$('[data-xedit]').forEach((b) => (b.onclick = () => { const [si, xi] = b.dataset.xedit.split('|').map(Number); lineEditor(c.sections[si], c.sections[si].extra[xi]); }));
  $$('[data-xdel]').forEach((b) => (b.onclick = () => { const [si, id] = b.dataset.xdel.split('|'); const s = c.sections[Number(si)]; s.extra = (s.extra || []).filter((x) => x.id !== id); changed(); draw(); }));
  const add = $('#mc-addsec'); if (add) add.onclick = () => { c.sections.push({ id: uid(), title: '', cat: null, hidden: [], extra: [] }); changed(); draw(); };
  const sv = $('#mc-save'); if (sv) sv.onclick = save;
  const nw = $('#mc-new'); if (nw) nw.onclick = () => { const n = { id: uid(), kind: 'menu', name: L({ en: 'New card', nl: 'Nieuwe kaart' }), title: 'Menu', subtitle: '', showPrices: true, showCodes: true, sections: [{ id: uid(), title: '', cat: null, hidden: [], extra: [] }] }; cards.push(n); cur = n; changed(); draw(); };
  const del = $('#mc-del'); if (del) del.onclick = async () => { if (!(await confirmDialog(L({ en: 'Delete this card?', nl: 'Deze kaart verwijderen?' }), L({ en: 'Delete', nl: 'Verwijderen' })))) return; cards = cards.filter((x) => x !== c); cur = cards[0]; await save(); draw(); };
  const rs = $('#mc-reset'); if (rs) rs.onclick = async () => { if (!(await confirmDialog(L({ en: 'Undo all your changes to this card? Titles, sections and hidden dishes go back to how the app made them. Dishes on the Menu page stay as they are.', nl: 'Al je wijzigingen aan deze kaart terugdraaien? Titels, blokken en verborgen gerechten gaan terug naar hoe de app ze maakte. De gerechten op de Menu-pagina blijven zoals ze zijn.' }), L({ en: 'Undo changes', nl: 'Terugdraaien' }), false))) return; const d = defaultCards().find((x) => x.id === c.id); cards[cards.indexOf(c)] = d; cur = d; changed(); draw(); };
  const word = $('#mc-word'); if (word) word.onchange = () => { if (word.files[0]) importWord(word.files[0]); };
}

async function save() {
  try { await saveCards(cards); dirty = false; const b = $('#mc-save'); if (b) b.disabled = true; toast(L({ en: 'Menu cards saved', nl: 'Menukaarten opgeslagen' })); }
  catch (e) { toastError(e); }
}

// A free line (not from the menu): name, description, price and allergens
function lineEditor(sec, line) {
  const v = line || { id: uid(), name: '', description: '', price: null, allergens: [] };
  const dlg = document.createElement('div');
  dlg.className = 'k-overlay';
  dlg.innerHTML = `<form class="k-msg mc-line" autocomplete="off"><h2>${line ? L({ en: 'Edit line', nl: 'Regel wijzigen' }) : L({ en: 'Own line', nl: 'Eigen regel' })}</h2>
    <div class="field"><label>${L({ en: 'Name', nl: 'Naam' })}</label><input name="name" value="${esc(v.name)}" required></div>
    <div class="field"><label>${L({ en: 'Description', nl: 'Omschrijving' })}</label><textarea name="description" rows="2">${esc(v.description || '')}</textarea></div>
    <div class="field"><label>${L({ en: 'Price', nl: 'Prijs' })}</label><input name="price" inputmode="decimal" value="${v.price != null ? String(v.price).replace('.', ',') : ''}"></div>
    <div class="allergen-grid">${ALLERGENS.map((a) => `<label class="check"><input type="checkbox" name="al" value="${a}" ${(v.allergens || []).includes(a) ? 'checked' : ''}> ${AL_NL[a]}</label>`).join('')}</div>
    <div class="modal-actions"><button type="button" class="btn" data-x>${L({ en: 'Cancel', nl: 'Annuleren' })}</button><button type="submit" class="btn-primary">${L({ en: 'Done', nl: 'Klaar' })}</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.querySelector('[data-x]').onclick = () => dlg.remove();
  dlg.querySelector('form').onsubmit = (e) => {
    e.preventDefault(); const f = e.target;
    const p = parseFloat(String(f.price.value).replace(',', '.'));
    Object.assign(v, { name: f.name.value.trim(), description: f.description.value.trim(), price: Number.isFinite(p) ? p : null, allergens: [...f.querySelectorAll('[name=al]:checked')].map((x) => x.value) });
    if (!line) (sec.extra = sec.extra || []).push(v);
    dlg.remove(); changed(); draw();
  };
}

// ------------------------------------------------------------------ Word import
// Heading 1 (or the first line) becomes the title, the line after it the subtitle; Heading 2/3 start a section;
// a bold line (or a line ending in a price) is a dish, the line under it its description. Dishes with the same
// name as a dish in the app take their allergens from it.
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/mammoth.browser.min.js'; s.onload = () => res(window.mammoth); s.onerror = () => rej(new Error('Word reader did not load')); document.head.appendChild(s); });
}
const PRICE = /(?:€\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s*$/i;
export function parseWordHtml(html, menuItems = []) {
  const d = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const blocks = [...d.body.firstChild.children];
  const card = { id: uid(), kind: 'menu', name: '', title: '', subtitle: '', priceLine: '', intro: '', note: '', showPrices: false, showCodes: true, sections: [] };
  let sec = null; let last = null;
  const byName = (n) => menuItems.find((m) => m.name.trim().toLowerCase() === n.trim().toLowerCase());
  const newSec = (title) => { sec = { id: uid(), title, cat: null, hidden: [], extra: [] }; card.sections.push(sec); last = null; };
  for (const el of blocks) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1' || (!card.title && !card.sections.length && tag !== 'ul' && tag !== 'ol')) { if (!card.title) { card.title = text; continue; } }
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') { newSec(text); continue; }
    if (!sec && !card.subtitle && card.title && text.length < 90 && !el.querySelector('strong')) { card.subtitle = text; continue; }
    if (!sec) newSec('');
    const lines = tag === 'ul' || tag === 'ol' ? [...el.querySelectorAll('li')].map((li) => li) : [el];
    for (const ln of lines) {
      const t = ln.textContent.replace(/\s+/g, ' ').trim();
      const strong = ln.querySelector('strong, b');
      const bold = strong && t.startsWith(strong.textContent.trim().slice(0, 3)) ? strong.textContent.trim() : '';
      const priceM = t.match(PRICE);
      const isDish = !!bold || (priceM && t.length < 90 && t.replace(PRICE, '').trim().length > 1);
      if (isDish) {
        let name = bold || t.replace(PRICE, '').trim();
        let rest = bold ? t.slice(t.indexOf(bold) + bold.length).trim() : '';
        let price = null;
        const pm = (bold ? rest : t).match(PRICE);
        if (pm) { price = parseFloat(pm[1].replace(',', '.')); if (bold) rest = rest.replace(PRICE, '').trim(); else name = t.replace(PRICE, '').trim(); }
        name = name.replace(/[\s.–\-:]+$/, '').trim();
        rest = rest.replace(/^[\s–\-:]+/, '').trim();
        const m = byName(name);
        last = { id: uid(), name, description: rest, price, allergens: m ? m.allergens || [] : [] };
        sec.extra.push(last);
        if (price != null) card.showPrices = true;
      } else if (last && !last.description) last.description = t;
      else if (last) last.description += ` ${t}`;
      else if (!card.intro && !sec.extra.length) card.intro = t;
    }
  }
  card.name = card.title || 'Word';
  card.sections = card.sections.filter((s) => s.title || s.extra.length);
  return card;
}

async function importWord(file) {
  try {
    const mammoth = await loadMammoth();
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const card = parseWordHtml(value, menu);
    if (!card.sections.some((s) => s.extra.length)) throw new Error(L({ en: 'No dishes found. Use a heading per section and a bold line per dish.', nl: 'Geen gerechten gevonden. Gebruik een kop per blok en een vetgedrukte regel per gerecht.' }));
    const n = card.sections.reduce((a, s) => a + s.extra.length, 0);
    const missing = card.sections.reduce((a, s) => a + s.extra.filter((x) => !x.allergens.length).length, 0);
    cards.push(card); cur = card; changed(); draw();
    toast(L({ en: `${n} dishes imported${missing ? `, ${missing} without allergens: check them` : ''}`, nl: `${n} gerechten geïmporteerd${missing ? `, ${missing} zonder allergenen: controleer ze` : ''}` }));
  } catch (e) { toastError(e); }
}
