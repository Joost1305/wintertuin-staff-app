// Handbook page: cover with the logo, search, table of contents and every chapter (Team app and Finance).
// Content lives in js/handbook.js. Opened from Settings, Handleiding, and from the ? icon in the top bar.
import { app, esc, printHtml, $, $$ } from '../core.js';
import { lang } from '../i18n.js';
import { CHAPTERS, UPDATED } from '../handbook.js';

const L = (o) => o[lang()] || o.nl;
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const dateNl = (iso) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
const logo = () => new URL('img/logo.png', location.href.split('#')[0]).href;

function chapterHtml(c, n) {
  return `<section class="hb-ch" id="hb-${c.id}"><h2><span class="hb-n">${n}</span> ${esc(c.title)}</h2>
    ${c.sections.map(([h, body], i) => `<div class="hb-sec" id="hb-${c.id}-${i}"><h3>${esc(h)}</h3>${body}</div>`).join('')}</section>`;
}
const groups = () => [['team', 'Team-app'], ['finance', 'Wintertuin Finance']].map(([k, label]) => [label, CHAPTERS.filter((c) => c.app === k)]);
const numbered = () => { let n = 0; return CHAPTERS.map((c) => ({ c, n: ++n })); };

export function renderHelp(args = []) {
  const target = args[0] || '';
  const nums = numbered();
  const numOf = (c) => nums.find((x) => x.c === c).n;
  app().className = 'app';
  app().innerHTML = `
    <div class="hb">
      <div class="hb-cover">
        <img src="${logo()}" alt="">
        <div><div class="hb-title">Handleiding</div><div class="hb-sub">Wintertuin Team &amp; Finance</div>
          <div class="hb-date">${L({ nl: 'Bijgewerkt op', en: 'Updated on' })} ${esc(dateNl(UPDATED))}</div></div>
      </div>
      ${lang() === 'en' ? '<p class="small muted">This handbook is in Dutch.</p>' : ''}
      <div class="hb-tools">
        <div class="hb-search"><i class="ic ic-search" aria-hidden="true"></i><input type="search" id="hb-q" placeholder="${esc(L({ nl: 'Zoek in de handleiding, bijvoorbeeld offerte, pincode, zaalhuur', en: 'Search the handbook' }))}" aria-label="${esc(L({ nl: 'Zoeken', en: 'Search' }))}"></div>
        <button type="button" class="btn btn-sm" id="hb-pdf"><i class="ic ic-printer" aria-hidden="true"></i> PDF</button>
      </div>
      <div id="hb-results" class="hb-results" hidden></div>
      <nav class="card hb-toc" aria-label="${esc(L({ nl: 'Inhoud', en: 'Contents' }))}"><h2>${L({ nl: 'Inhoud', en: 'Contents' })}</h2>
        ${groups().map(([label, list]) => `<div class="hb-toc-g"><div class="hb-toc-h">${label}</div><ol>${list.map((c) => `<li value="${numOf(c)}"><a href="#/help/${c.id}" data-go="${c.id}">${esc(c.title)}</a></li>`).join('')}</ol></div>`).join('')}
      </nav>
      <div id="hb-body">${groups().map(([label, list]) => `<div class="hb-part">${label}</div>${list.map((c) => chapterHtml(c, numOf(c))).join('')}`).join('')}</div>
    </div>`;

  const go = (id) => { const el = document.getElementById(`hb-${id}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('hb-flash'); setTimeout(() => el.classList.remove('hb-flash'), 1600); } };
  $$('[data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); history.replaceState(null, '', `#/help/${a.dataset.go}`); go(a.dataset.go); }));
  if (target) setTimeout(() => go(target), 60);

  // search: every section whose title or text holds all the words; tap a result to jump there
  const q = $('#hb-q'); const res = $('#hb-results');
  const index = CHAPTERS.flatMap((c) => c.sections.map(([h, body], i) => ({ c, i, h, text: strip(body) })));
  q.oninput = () => {
    const words = q.value.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    $$('mark.hb-hit').forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    if (!words.length) { res.hidden = true; res.innerHTML = ''; return; }
    const hits = index.filter((x) => words.every((w) => `${x.c.title} ${x.h} ${x.text}`.toLowerCase().includes(w)));
    res.hidden = false;
    res.innerHTML = hits.length ? `<div class="small muted">${hits.length} ${L({ nl: hits.length === 1 ? 'resultaat' : 'resultaten', en: hits.length === 1 ? 'result' : 'results' })}</div>${hits.slice(0, 30).map((x) => {
      const pos = x.text.toLowerCase().indexOf(words[0]); const from = Math.max(0, pos - 50);
      let snip = esc((from ? '…' : '') + x.text.slice(from, from + 160) + (x.text.length > from + 160 ? '…' : ''));
      words.forEach((w) => { snip = snip.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'); });
      return `<a class="hb-res" href="#/help/${x.c.id}" data-sec="${x.c.id}-${x.i}"><strong>${esc(x.c.title)}: ${esc(x.h)}</strong><span>${snip}</span></a>`;
    }).join('')}` : `<div class="small muted">${L({ nl: 'Niets gevonden. Probeer een ander woord.', en: 'Nothing found. Try another word.' })}</div>`;
    $$('[data-sec]', res).forEach((a) => (a.onclick = (e) => {
      e.preventDefault(); const el = document.getElementById(`hb-${a.dataset.sec}`); if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('hb-flash'); setTimeout(() => el.classList.remove('hb-flash'), 1600);
    }));
  };

  // the whole handbook as one PDF: cover, contents, chapters
  $('#hb-pdf').onclick = () => printHtml(`<style>
      .hbp { font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1d2b25; }
      .hbp .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 18px; break-after: page; page-break-after: always; }
      .hbp .cover img { width: 120px; } .hbp .cover .t { font-size: 34pt; font-weight: 700; color: #22503F; line-height: 1.1; } .hbp .cover .s { font-size: 16pt; color: #3d7a5f; } .hbp .cover .d { color: #666; }
      .hbp .toc { break-after: page; page-break-after: always; } .hbp .toc h2 { margin-top: 0; } .hbp .toc .g { font-weight: 700; margin-top: 10px; color: #22503F; }
      .hbp h2 { font-size: 16pt; color: #22503F; margin: 22px 0 6px; } .hbp h3 { font-size: 11.5pt; margin: 12px 0 2px; }
      .hbp .part { font-size: 11pt; text-transform: none; color: #3d7a5f; font-weight: 700; margin-top: 18px; border-top: 2px solid #22503F; padding-top: 6px; }
      .hbp p { margin: 4px 0; } .hbp ul, .hbp ol { margin: 4px 0 4px 20px; padding: 0; } .hbp .hb-tip { background: #eef5f0; padding: 6px 10px; border-radius: 6px; }
      .hbp .hb-n { color: #3d7a5f; }
    </style><div class="hbp">
      <div class="cover"><img src="${logo()}" alt=""><div class="t">Handleiding</div><div class="s">Wintertuin Team &amp; Finance</div><div class="d">Bijgewerkt op ${esc(dateNl(UPDATED))}</div></div>
      <div class="toc"><h2>Inhoud</h2>${groups().map(([label, list]) => `<div class="g">${label}</div><ol>${list.map((c) => `<li value="${numOf(c)}">${esc(c.title)}</li>`).join('')}</ol>`).join('')}</div>
      ${groups().map(([label, list]) => `<div class="part">${label}</div>${list.map((c) => chapterHtml(c, numOf(c))).join('')}`).join('')}
    </div>`, { name: 'Handleiding Team en Finance' });
}
