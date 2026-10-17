// About: the concept, the team and a short guide to this app. First item of the top menu.
// Texts and the team cards live in about_content (page 'app-nl' / 'app-en'), so a manager's edits are saved for
// everyone. Managers click Edit: texts become editable, people can be added, removed and given a photo.
import { isManager, app, esc, toast, toastError, $, $$ } from '../core.js';
import { t, lang } from '../i18n.js';
import { sb } from '../data.js';
import { SUPABASE_URL, PHOTO_BUCKET } from '../config.js';
import { clean } from '../about.js';

const TEXT = {
  nl: {
    eyebrow: 'Over ons', title: 'Welkom bij de Wintertuin',
    lead: 'Een kas van glas en staal uit 1914, midden in het Cantonspark in Baarn. \'s Ochtends brood, de hele dag koffie en een eenvoudig diner als het licht wegvalt.',
    concept_h: 'Het concept',
    c1h: 'Bakkerij', c1: 'Brood en patisserie voor de zaak en voor de verkoop, elke ochtend vers.',
    c2h: 'Koffie en dranken', c2: 'Specialty koffie, zelf gebrand, en een kleine kaart met wijn, bier en eigen limonades.',
    c3h: 'Lunch', c3: 'Meer dan broodjes, wel eenvoudig genoeg om naast de bakkerij te draaien.',
    c4h: 'Diner', c4: 'In de winter twee gangen voor een vaste prijs, in de zomer drie, met lange tafels en bijzondere avonden.',
    c5h: 'De Wintertuin Verteld', c5: 'Thema-avonden met een eigen menu: over bijen, bomen, foerageren, koffie, brood en meer.',
    team_h: 'Het team', team_intro: 'Een bakker, een koffiebrander, een chef en een gastvrouw. Samen dekken we de hele dag in de kas, van het eerste brood tot de laatste gang.',
    people: [
      { name: 'Joost', role: 'Concept, keuken en avonden', bio: 'Chef met een Michelin-achtergrond, sinds 2007 in het horeca-onderwijs. Imker, wildplukker en kruidenkenner; bedenkt het menu en de thema-avonden.' },
      { name: 'Carel', role: 'Bakkerij en keuken', bio: 'Bakker, runde zeven jaar een succesvol restaurant. Zorgt voor het brood en de patisserie en houdt de keuken draaiende.' },
      { name: 'Kees', role: 'Koffie en dranken', bio: 'Oud-restauranteigenaar en specialty-koffiebrander. Reist naar de oorsprongslanden en organiseert koffie-avonden.' },
      { name: 'Jane', role: 'Gastvrouw en barista', bio: 'Het gezicht van de zaak voor de gast: ontvangst, zaal en koffie.' },
    ],
    app_h: 'Over deze app', app_intro: 'Alles wat je nodig hebt voor een dienst, op één plek. Op je telefoon: open de app in Safari, tik op Delen en kies Zet op beginscherm, dan staat hij tussen je apps.',
    more_h: 'Meer over de Wintertuin',
    intro_h: 'Het gebouw en het park', intro_p: 'De kas, het Cantonspark en wat we hier gaan doen.',
    hist_h: 'Honderd jaar geschiedenis', hist_p: 'De tijdlijn van landgoed tot botanische tuin tot horeca.',
    edit: 'Bewerken', save: 'Opslaan', cancel: 'Annuleren', editing: 'Klik op een tekst om te wijzigen, op de cirkel voor een foto, en zet blokken met de pijltjes op hun plek. Daarna Opslaan.',
    add_person: '+ Persoon', remove: 'Verwijderen', photo: 'Foto', photo_add: '+ Foto', photo_change: 'Wijzig', up: 'Omhoog', down: 'Omlaag', saved: 'Opgeslagen voor iedereen', nothing: 'Niets gewijzigd',
    new_name: 'Naam', new_role: 'Rol', new_bio: 'Een paar zinnen over jezelf.',
    guide: {
      menu: 'Gerechten, allergenen en de menukaarten.', sops: 'Hoe we dingen doen: openen, sluiten, recepturen en werkwijzen.',
      roster: 'Wie werkt wanneer, met de events van die week erbij.', checkin: 'In- en uitklokken voor je dienst.',
      swap: 'Een dienst ruilen of overnemen.', events: 'Feesten en groepen: kalender en BEO met alles voor die dag.',
      haccp: 'Afvinklijsten voor temperaturen, ontvangst en schoonmaak, klaar voor controle.', links: 'Handige links, zoals de receptendatabase.',
      settings: 'Voor managers: team, menu, lijsten en de volgorde van dit menu.',
    },
    finance: 'Wintertuin Finance: omzet, kassa en cijfers. Zelfde login, knop bovenaan.',
  },
  en: {
    eyebrow: 'About us', title: 'Welcome to the Wintertuin',
    lead: 'A glass and steel greenhouse from 1914, in the middle of the Cantonspark in Baarn. Bread in the morning, coffee all day and a simple dinner when the light fades.',
    concept_h: 'The concept',
    c1h: 'Bakery', c1: 'Bread and pastry for the restaurant and to take home, fresh every morning.',
    c2h: 'Coffee and drinks', c2: 'Specialty coffee, roasted by us, and a small list of wine, beer and our own lemonades.',
    c3h: 'Lunch', c3: 'More than sandwiches, yet simple enough to run next to the bakery.',
    c4h: 'Dinner', c4: 'Two courses for a set price in winter, three in summer, with long tables and special evenings.',
    c5h: 'De Wintertuin Verteld', c5: 'Theme evenings with their own menu: about bees, trees, foraging, coffee, bread and more.',
    team_h: 'The team', team_intro: 'A baker, a coffee roaster, a chef and a host. Together we cover the whole day in the greenhouse, from the first loaf to the last course.',
    people: [
      { name: 'Joost', role: 'Concept, kitchen and evenings', bio: 'Chef with a Michelin background, in hospitality education since 2007. Beekeeper, forager and herb expert; creates the menu and the theme evenings.' },
      { name: 'Carel', role: 'Bakery and kitchen', bio: 'Baker who ran a successful restaurant for seven years. Takes care of bread and pastry and keeps the kitchen running.' },
      { name: 'Kees', role: 'Coffee and drinks', bio: 'Former restaurant owner and specialty coffee roaster. Travels to the origin countries and hosts coffee evenings.' },
      { name: 'Jane', role: 'Host and barista', bio: 'The face of the restaurant for our guests: welcome, floor and coffee.' },
    ],
    app_h: 'About this app', app_intro: 'Everything you need for a shift, in one place. On your phone: open the app in Safari, tap Share and choose Add to Home Screen, and it sits with your other apps.',
    more_h: 'More about the Wintertuin',
    intro_h: 'The building and the park', intro_p: 'The greenhouse, the Cantonspark and what we are going to do here.',
    hist_h: 'A hundred years of history', hist_p: 'The timeline from country estate to botanical garden to restaurant.',
    edit: 'Edit', save: 'Save', cancel: 'Cancel', editing: 'Click any text to change it, the circle for a photo, and move blocks with the arrows. Then Save.',
    add_person: '+ Person', remove: 'Remove', photo: 'Photo', photo_add: '+ Photo', photo_change: 'Change', up: 'Up', down: 'Down', saved: 'Saved for everyone', nothing: 'Nothing changed',
    new_name: 'Name', new_role: 'Role', new_bio: 'A few sentences about yourself.',
    guide: {
      menu: 'Dishes, allergens and the menus.', sops: 'How we do things: opening, closing, recipes and procedures.',
      roster: 'Who works when, with that week\'s events.', checkin: 'Clock in and out for your shift.',
      swap: 'Swap or take over a shift.', events: 'Parties and groups: calendar and BEO with everything for the day.',
      haccp: 'Checklists for temperatures, deliveries and cleaning, ready for an inspection.', links: 'Useful links, like the recipe database.',
      settings: 'For managers: team, menu, lists and the order of this menu.',
    },
    finance: 'Wintertuin Finance: revenue, till and numbers. Same login, button at the top.',
  },
};

// Silhouette shown until a photo is uploaded
const PLACEHOLDER = '<svg class="ab-ph" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="25" r="11" fill="currentColor"/><path d="M12 56c2-11 10-17 20-17s18 6 20 17z" fill="currentColor"/></svg>';
const safePhoto = (u) => (typeof u === 'string' && u.startsWith(`${SUPABASE_URL}/storage/`) ? u : '');

function personHtml(p, editing, T) {
  const photo = safePhoto(p.photo);
  return `<article class="ab-person" data-photo="${esc(photo)}">
    ${editing ? `<label class="ab-photo ab-photo-edit" title="${T.photo}">` : '<div class="ab-photo">'}${photo ? `<img src="${esc(photo)}" alt="">` : PLACEHOLDER}
      ${editing ? `<span class="ab-cam">${photo ? T.photo_change : T.photo_add}</span><input type="file" accept="image/*" hidden data-photo-in></label>` : '</div>'}
    <div class="ab-pbody">
      <h3 data-f="name">${esc(p.name)}</h3>
      <div class="ab-role" data-f="role">${esc(p.role)}</div>
      <p data-f="bio">${esc(p.bio)}</p>
      ${editing ? `<div class="ab-ptools"><button type="button" class="btn btn-sm" data-rm>${T.remove}</button></div>` : ''}
    </div></article>`;
}

export async function renderAbout() {
  const L = lang() === 'nl' ? 'nl' : 'en';
  const T = TEXT[L];
  const page = `app-${L}`;
  app().innerHTML = `<div class="card empty"><span class="spinner"></span></div>`;
  let saved = {};
  try {
    const { data } = await sb.from('about_content').select('key, html').eq('page', page);
    saved = Object.fromEntries((data || []).map((r) => [r.key, r.html]));
  } catch { /* default text */ }
  const txt = (k) => (saved[k] != null ? clean(saved[k]) : esc(T[k]));
  let people = T.people;
  try { if (saved.people) { const p = JSON.parse(saved.people); if (Array.isArray(p)) people = p; } } catch { /* default team */ }

  const guideKeys = [...$$('#nav a[href^="#/"]')].map((a) => a.getAttribute('href').slice(2)).filter((p) => T.guide[p]);
  const navLabel = (p) => ($(`#nav a[href="#/${p}"]`)?.childNodes[0]?.textContent || p);
  const editable = (k, tag, cls = '') => `<${tag} data-edit="${k}"${cls ? ` class="${cls}"` : ''}>${txt(k)}</${tag}>`;

  const arrows = (k) => `<div class="ab-move"><button type="button" class="btn btn-sm" data-up="${k}" aria-label="${T.up}">&#9650;</button><button type="button" class="btn btn-sm" data-down="${k}" aria-label="${T.down}">&#9660;</button></div>`;
  const SEC = {
    concept: (ed) => `<section class="ab-sec" data-sec="concept">${ed ? arrows('concept') : ''}${editable('concept_h', 'h2')}
        <div class="ab-pillars">${[1, 2, 3, 4, 5].map((i) => `<div class="ab-pillar">${editable(`c${i}h`, 'h3')}${editable(`c${i}`, 'p')}</div>`).join('')}</div>
      </section>`,
    team: (ed) => `<section class="ab-sec" data-sec="team">${ed ? arrows('team') : ''}${editable('team_h', 'h2')}${editable('team_intro', 'p', 'muted')}
        <div class="ab-people" id="ab-people">${people.map((p) => personHtml(p, ed, T)).join('')}</div>
        ${ed ? `<button type="button" class="btn btn-sm" id="ab-add" style="margin-top:12px">${T.add_person}</button>` : ''}
      </section>`,
    app: (ed) => `<section class="ab-sec" data-sec="app">${ed ? arrows('app') : ''}${editable('app_h', 'h2')}${editable('app_intro', 'p', 'muted')}
        <div class="card ab-guide">${guideKeys.map((p) => `<a class="ab-gi" href="#/${p}"><strong>${esc(navLabel(p))}</strong><span>${esc(T.guide[p])}</span></a>`).join('')}
          <a class="ab-gi" id="ab-fin" href="${esc($('#app-switch')?.getAttribute('href') || '#')}"><strong>Finance</strong><span>${esc(T.finance)}</span></a></div>
      </section>`,
    more: (ed) => `<section class="ab-sec" data-sec="more">${ed ? arrows('more') : ''}${editable('more_h', 'h2')}
        <div class="ab-more">
          <a class="card ab-link" href="Wintertuin-Intro.html">${editable('intro_h', 'h3')}${editable('intro_p', 'p', 'muted')}<span class="ab-arrow">&rarr;</span></a>
          <a class="card ab-link" href="Wintertuin-Cantonspark-Geschiedenis.html">${editable('hist_h', 'h3')}${editable('hist_p', 'p', 'muted')}<span class="ab-arrow">&rarr;</span></a>
        </div>
      </section>`,
  };
  const DEFAULT_ORDER = ['concept', 'team', 'app', 'more'];
  let order = DEFAULT_ORDER;
  try { if (saved.order) { const o = JSON.parse(saved.order).filter((k) => SEC[k]); order = [...o, ...DEFAULT_ORDER.filter((k) => !o.includes(k))]; } } catch { /* default order */ }

  const draw = (editing) => {
    app().innerHTML = `<div class="about-app ${editing ? 'editing' : ''}">
      <div class="page-head ab-head"><div>
        ${editable('eyebrow', 'p', 'ab-eyebrow')}${editable('title', 'h1')}${editable('lead', 'p', 'ab-lead')}</div>
        ${isManager() ? `<div class="page-actions" id="ab-tools">${editing
          ? `<button class="btn" id="ab-cancel">${T.cancel}</button> <button class="btn btn-primary" id="ab-save">${T.save}</button>`
          : `<button class="btn btn-sm" id="ab-edit">${T.edit}</button>`}</div>` : ''}
      </div>
      ${editing ? `<div class="note ab-hint">${T.editing}</div>` : ''}

      <div id="ab-secs">${order.map((k) => SEC[k](editing)).join('')}</div></div>`;

    if (!isManager()) return;
    if (!editing) { $('#ab-edit').onclick = () => draw(true); return; }
    const blocks = $$('[data-edit]');
    const before = Object.fromEntries(blocks.map((b) => [b.dataset.edit, b.innerHTML]));
    const peopleBefore = JSON.stringify(people);
    blocks.forEach((b) => b.setAttribute('contenteditable', 'true'));
    // links must not navigate while you type in them
    $$('.ab-link, .ab-gi').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
    const wirePerson = (card) => {
      $$('[data-f]', card).forEach((f) => f.setAttribute('contenteditable', 'plaintext-only'));
      $('[data-rm]', card).onclick = () => card.remove();
      $('[data-photo-in]', card).onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const path = `team/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
          const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
          if (error) throw error;
          const url = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
          card.dataset.photo = url;
          const old = $('.ab-photo img, .ab-photo .ab-ph', card); if (old) old.outerHTML = `<img src="${esc(url)}" alt="">`;
          $('.ab-cam', card).textContent = T.photo_change;
        } catch (err) { toastError(err); }
      };
    };
    $$('.ab-person').forEach(wirePerson);
    $('#ab-add').onclick = () => {
      const wrap = document.createElement('div');
      wrap.innerHTML = personHtml({ name: T.new_name, role: T.new_role, bio: T.new_bio }, true, T);
      const card = wrap.firstElementChild; $('#ab-people').appendChild(card); wirePerson(card);
    };
    const orderBefore = JSON.stringify(order);
    const move = (k, d) => {
      const secs = $$('#ab-secs > .ab-sec'); const i = secs.findIndex((x) => x.dataset.sec === k); const j = i + d;
      if (j < 0 || j >= secs.length) return;
      if (d < 0) secs[j].before(secs[i]); else secs[j].after(secs[i]);
    };
    $$('[data-up]').forEach((b) => (b.onclick = () => move(b.dataset.up, -1)));
    $$('[data-down]').forEach((b) => (b.onclick = () => move(b.dataset.down, 1)));
    $('#ab-cancel').onclick = () => draw(false);
    $('#ab-save').onclick = async () => {
      const now = new Date().toISOString();
      const rows = blocks.filter((b) => b.innerHTML !== before[b.dataset.edit])
        .map((b) => ({ page, key: b.dataset.edit, html: clean(b.innerHTML), updated_at: now }));
      const next = $$('.ab-person').map((c) => ({
        name: $('[data-f="name"]', c).textContent.trim(), role: $('[data-f="role"]', c).textContent.trim(),
        bio: $('[data-f="bio"]', c).textContent.trim(), photo: safePhoto(c.dataset.photo),
      })).filter((p) => p.name);
      if (JSON.stringify(next) !== peopleBefore) rows.push({ page, key: 'people', html: JSON.stringify(next), updated_at: now });
      const nextOrder = $$('#ab-secs > .ab-sec').map((x) => x.dataset.sec);
      if (JSON.stringify(nextOrder) !== orderBefore) rows.push({ page, key: 'order', html: JSON.stringify(nextOrder), updated_at: now });
      if (!rows.length) { toast(T.nothing); draw(false); return; }
      const { error } = await sb.from('about_content').upsert(rows, { onConflict: 'page,key' });
      if (error) { toastError(error); return; }
      rows.forEach((r) => { saved[r.key] = r.html; });
      people = next; order = nextOrder;
      toast(T.saved); draw(false);
    };
  };
  draw(false);
}
