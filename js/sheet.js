// Every print in the app goes through here: the sheet opens full screen with three buttons.
//   Delen     makes a PDF and opens the share sheet of the phone (WhatsApp, Mail, Bestanden, and on iPhone also Afdrukken)
//   PDF       downloads the PDF
//   Printen   the print dialog of the browser (hidden in the iPhone home-screen app, where printing is not possible)
// The PDF is made as soon as the sheet opens, so a tap on Delen opens the share sheet straight away
// (iPhone only allows sharing directly after a tap).
import { esc, toast, toastError, todayIso } from './core.js';

const nl = () => document.documentElement.lang !== 'en';
const T = (n, e) => (nl() ? n : e);
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
export const canPrint = () => !(isIOS() && standalone());
// A computer (mouse, no touch screen): its share sheet has no WhatsApp, so it gets its own WhatsApp button
export const isDesktop = () => !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
// 06-12345678 / +31 6 ... -> 31612345678 (wa.me wants the number without + or leading zeros)
export function waNumber(phone) {
  let d = String(phone || '').replace(/[^0-9+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '31' + d.slice(1);
  return d.replace(/\D/g, '');
}
// WhatsApp on a computer: a browser cannot hand a file to WhatsApp, so the PDF is downloaded and
// WhatsApp opens (the desktop app, or WhatsApp Web) with the text ready; drag the PDF into the chat.
// Call this straight from the click, with the PDF already made, or the browser blocks the new window.
// win: a window opened earlier from the click, when the PDF still had to be made
export function whatsappDesktop(file, { text = '', phone = '', win = null } = {}) {
  if (file) download(file);
  const url = `https://wa.me/${waNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  if (window.__waHook) window.__waHook(url); else if (win) win.location.href = url; else window.open(url, '_blank', 'noopener');
  toast(T('De pdf staat in je downloads. Sleep hem in het WhatsApp-gesprek.', 'The PDF is in your downloads. Drag it into the WhatsApp chat.'));
}

const BASE_CSS = `html,body{margin:0;background:#fff;color:#000;-webkit-text-size-adjust:none;text-size-adjust:none}
  body{font:10.5pt/1.4 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1{font-size:20pt;margin:0 0 8px} h1,h2,h3,h4{break-after:avoid;page-break-after:avoid} tr,img{break-inside:avoid;page-break-inside:avoid} p{orphans:3;widows:3} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}
  @font-face{font-family:WTSerif;src:url(fonts/young-serif.woff2) format('woff2')}
  @font-face{font-family:WTSans;src:url(fonts/inter-400.woff2) format('woff2');font-weight:400}
  @font-face{font-family:WTSans;src:url(fonts/inter-600.woff2) format('woff2');font-weight:600}
  @font-face{font-family:WTSans;src:url(fonts/inter-400-italic.woff2) format('woff2');font-style:italic}`;
const MM = 96 / 25.4; // css pixels per millimetre

function loadScript(src, glob) {
  if (window[glob]) return Promise.resolve(window[glob]);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(window[glob]); s.onerror = () => rej(new Error(`${src} did not load`)); document.head.appendChild(s); });
}
// html2canvas draws text in this window, so the fonts must be known here too
function mainFonts() {
  if (document.getElementById('sheet-fonts')) return;
  const st = document.createElement('style'); st.id = 'sheet-fonts';
  st.textContent = BASE_CSS.slice(BASE_CSS.indexOf('@font-face'));
  document.head.appendChild(st);
}

const fileName = (html, name) => {
  let n = name;
  if (!n) { const d = document.createElement('div'); d.innerHTML = html; const h = d.querySelector('h1'); n = h ? h.textContent : 'Wintertuin'; }
  n = String(n).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'Wintertuin';
  return `${/wintertuin/i.test(n) ? '' : 'Wintertuin '}${n} ${todayIso()}.pdf`;
};

// Make a PDF of the sheet: drawn page by page, cut between rows and never through a row, a heading or a block that must stay whole
export async function sheetPdf(html, name) {
  await Promise.all([loadScript('vendor/html2canvas.min.js', 'html2canvas'), loadScript('vendor/jspdf.min.js', 'jspdf')]);
  const full = /mc-page/.test(html); // the menu card has its own page size and margins
  const margin = full ? 0 : 14;
  const W = Math.round((210 - 2 * margin) * MM); const H = Math.floor((297 - 2 * margin) * MM);
  const fr = document.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
  fr.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;border:0`;
  document.body.appendChild(fr);
  try {
    await new Promise((r) => { fr.onload = r; fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${location.href.split('#')[0]}"><style>${BASE_CSS}</style></head><body>${html}</body></html>`; });
    const d = fr.contentDocument; const w = fr.contentWindow;
    try { await Promise.all([...d.fonts].map((f) => f.load().catch(() => null))); await d.fonts.ready; } catch { /* older browsers */ }
    await Promise.all([...d.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; }))));
    mainFonts();
    const body = d.body; const total = Math.ceil(body.scrollHeight);
    const top = (el) => el.getBoundingClientRect().top + w.scrollY;
    const els = [...body.querySelectorAll('*')];
    const atomic = els.filter((el) => /^(TR|IMG|H1|H2|H3|H4|LI|P|svg)$/i.test(el.tagName) || w.getComputedStyle(el).breakInside === 'avoid' || w.getComputedStyle(el).pageBreakInside === 'avoid')
      .map((el) => [top(el), top(el) + el.getBoundingClientRect().height]).filter(([a, b]) => b - a < H);
    // a heading never ends a page: it stays together with the first lines of what follows (about three lines)
    const KEEP = 75;
    body.querySelectorAll('h1, h2, h3, h4, .doc, .sec-title').forEach((h) => {
      let n = h.nextElementSibling; while (n && !n.getBoundingClientRect().height) n = n.nextElementSibling;
      const a = top(h); const hb = a + h.getBoundingClientRect().height;
      const parentEnd = top(h.parentElement) + h.parentElement.getBoundingClientRect().height;
      const end = n ? Math.min(parentEnd, Math.max(top(n), hb) + KEEP) : hb;
      if (end - a < H * 0.6) atomic.push([a, end]);
    });
    const forced = new Set();
    els.forEach((el) => {
      const cs = w.getComputedStyle(el);
      if (cs.breakBefore === 'page' || cs.pageBreakBefore === 'always') forced.add(Math.round(top(el)));
      if ((cs.breakAfter === 'page' || cs.pageBreakAfter === 'always') && el.nextElementSibling) forced.add(Math.round(top(el) + el.getBoundingClientRect().height));
    });
    const cuts = [...new Set(els.map((el) => Math.round(top(el) + el.getBoundingClientRect().height)).concat(els.map((el) => Math.round(top(el)))))].sort((a, b) => a - b);
    const free = (y) => !atomic.some(([a, b]) => a < y - 1 && y + 1 < b);
    // a section that does not fit any more moves whole to the next page, heading and all
    const heads = full ? [] : [...body.querySelectorAll('h2, .sec-title')].map((h) => Math.round(top(h))).sort((a, b) => a - b);
    const pages = []; let s = 0;
    while (s < total - 2) {
      const f = [...forced].filter((y) => y > s + 4 && y <= s + H).sort((a, b) => a - b)[0];
      let e;
      if (f) e = f;
      else if (s + H >= total) e = total;
      else {
        const h = heads.filter((y) => y > s + H * 0.4 && y <= s + H).pop();
        e = h || cuts.filter((y) => y > s + H * 0.4 && y <= s + H && free(y)).pop() || s + H;
      }
      pages.push([s, e]); s = e;
    }
    window.__sheetCuts = pages; // for the tests
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const bg = full ? '#FFFDF0' : '#ffffff';
    for (let i = 0; i < pages.length; i++) {
      const [a, b] = pages[i];
      const cv = await window.html2canvas(body, { scale: 2, backgroundColor: bg, useCORS: true, logging: false, x: 0, y: a, width: W, height: b - a, windowWidth: W, windowHeight: Math.max(total, H), scrollX: 0, scrollY: 0 });
      if (i) pdf.addPage();
      if (full) { pdf.setFillColor(255, 253, 240); pdf.rect(0, 0, 210, 297, 'F'); }
      pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, 210 - 2 * margin, (b - a) / MM);
      // "1 van 2" bottom right, in the margin
      if (!full && pages.length > 1) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(110, 117, 112); pdf.text(`${i + 1} ${T('van', 'of')} ${pages.length}`, 210 - margin, 297 - 7, { align: 'right' }); }
    }
    const out = new File([pdf.output('blob')], fileName(html, name), { type: 'application/pdf' });
    out.pages = pages; // where each page starts and ends, for the marks in the preview
    return out;
  } finally { fr.remove(); }
}

export function download(file) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function share(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name.replace(/\.pdf$/, '') }); }
    catch (e) {
      if (e.name === 'AbortError') return;
      if (e.name === 'NotAllowedError') return toast(T('De pdf is klaar. Tik nog een keer op Delen.', 'The PDF is ready. Tap Share again.'));
      toastError(e);
    }
    return;
  }
  download(file);
  toast(T('Deze browser kan geen bestanden delen, dus de pdf is gedownload. Stuur hem door vanuit je downloads.', 'This browser cannot share files, so the PDF was downloaded. Send it from your downloads.'));
}

// The full-screen view of a sheet. runPrint prints #printArea (filled by printHtml).
export function openSheet(html, name, runPrint, wa = {}) {
  document.getElementById('sheet-view')?.remove();
  const full = /mc-page/.test(html);
  const pageW = Math.round(210 * MM);
  const v = document.createElement('div');
  v.id = 'sheet-view'; v.className = 'sheet-view'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
  v.innerHTML = `<div class="sv-bar">
      <button type="button" class="sv-x" aria-label="${T('Sluiten', 'Close')}"><i class="ic ic-x" aria-hidden="true"></i></button>
      <div class="sv-btns">
        <button type="button" class="btn-primary btn-sm" id="sv-share" disabled><i class="ic ic-share" aria-hidden="true"></i> <span>${T('Pdf maken…', 'Making PDF…')}</span></button>
        ${isDesktop() ? `<button type="button" class="btn btn-sm" id="sv-wa" disabled><i class="ic ic-whatsapp" aria-hidden="true"></i> WhatsApp</button>` : ''}
        <button type="button" class="btn btn-sm" id="sv-pdf" disabled><i class="ic ic-download" aria-hidden="true"></i> PDF</button>
        ${canPrint() ? `<button type="button" class="btn btn-sm" id="sv-print"><i class="ic ic-printer" aria-hidden="true"></i> ${T('Printen', 'Print')}</button>` : ''}
      </div></div>
    <div class="sv-scroll"><div class="sv-page" style="--pw:${pageW}px"><iframe title="${esc(T('Voorbeeld', 'Preview'))}"></iframe></div></div>
    ${canPrint() ? '' : `<p class="sv-tip">${T('Printen: tik op Delen en kies Afdrukken.', 'To print: tap Share and choose Print.')}</p>`}`;
  document.body.appendChild(v);
  document.body.classList.add('sheet-open');
  const fr = v.querySelector('iframe'); const page = v.querySelector('.sv-page');
  const fit = () => {
    const avail = v.querySelector('.sv-scroll').clientWidth - 24;
    const sc = Math.min(1, avail / pageW);
    const h = fr.contentDocument && fr.contentDocument.body ? fr.contentDocument.documentElement.scrollHeight : 1000;
    fr.style.width = `${pageW}px`; fr.style.height = `${h}px`; fr.style.transform = `scale(${sc})`;
    page.style.width = `${pageW * sc}px`; page.style.height = `${h * sc}px`;
  };
  fr.onload = () => {
    // show where a new page starts
    const d = fr.contentDocument; const w = fr.contentWindow;
    if (pagesOf) markPages(pagesOf);
    fit(); setTimeout(fit, 300);
  };
  fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${location.href.split('#')[0]}"><style>${BASE_CSS}body{padding:${full ? 0 : Math.round(14 * MM)}px}</style></head><body>${html}</body></html>`;
  window.addEventListener('resize', fit);

  // show where the PDF goes to a new page: a dashed line with the page number, at the same place as in the PDF
  let pagesOf = null;
  const markPages = (pages) => {
    pagesOf = pages;
    const d = fr.contentDocument; if (full || !d || !d.body || pages.length < 2) return;
    d.querySelectorAll('.sv-break').forEach((x) => x.remove());
    const pad = Math.round(14 * MM);
    const n = pages.length; const lbl = 'position:absolute;right:8px;font:600 8pt -apple-system,Segoe UI,Arial,sans-serif;color:#6b7570';
    pages.forEach(([, y], i) => {
      const m = d.createElement('div'); m.className = i < n - 1 ? 'sv-break' : 'sv-pageno';
      m.style.cssText = `position:absolute;left:0;right:0;top:${y + pad}px;${i < n - 1 ? 'border-top:2px dashed #9aa5a0;' : ''}pointer-events:none`;
      m.innerHTML = `<span style="${lbl};top:-22px">${i + 1} ${T('van', 'of')} ${n}</span>`;
      d.body.appendChild(m);
    });
  };
  let file = null;
  const shareBtn = v.querySelector('#sv-share'); const pdfBtn = v.querySelector('#sv-pdf'); const waBtn = v.querySelector('#sv-wa');
  const job = sheetPdf(html, name).then((f) => {
    file = f; if (f.pages) markPages(f.pages); shareBtn.disabled = false; pdfBtn.disabled = false; if (waBtn) waBtn.disabled = false;
    shareBtn.querySelector('span').textContent = T('Delen', 'Share');
    return f;
  }).catch((e) => { shareBtn.querySelector('span').textContent = T('Pdf lukt niet', 'PDF failed'); toastError(e); return null; });
  shareBtn.onclick = async () => { const f = file || (await job); if (f) share(f); };
  pdfBtn.onclick = async () => { const f = file || (await job); if (f) download(f); };
  if (waBtn) waBtn.onclick = () => { if (file) whatsappDesktop(file, { text: wa.text || file.name.replace(/\.pdf$/, ''), phone: wa.phone }); };
  const pr = v.querySelector('#sv-print'); if (pr) pr.onclick = () => runPrint();

  const close = () => { v.remove(); document.body.classList.remove('sheet-open'); window.removeEventListener('resize', fit); document.removeEventListener('keydown', esc_); window.removeEventListener('hashchange', close); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  v.querySelector('.sv-x').onclick = close;
  document.addEventListener('keydown', esc_);
  window.addEventListener('hashchange', close);
  v.__job = job;
  return v;
}
