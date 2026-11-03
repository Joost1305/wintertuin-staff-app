// Settings > Next steps: what still has to happen before the app can do everything (company details, KHN, UVH,
// Moneybird). Some items tick themselves from what is filled in; the rest a manager ticks, with date and name.
import { state, esc, fmt, toast, toastError, nameOf, $, $$ } from '../core.js';
import { sb } from '../data.js';
import { lang } from '../i18n.js';
import { loadCompany, companyGaps } from '../uvh.js';

const L = (o) => o[lang()] || o.en;
// auto(c): true when the app can see it is done
const STEPS = [
  { title: { nl: 'Basis vastleggen', en: 'The basics' }, items: [
    { id: 'kvk', t: { nl: 'B.V. ingeschreven bij de KVK (notaris)', en: 'B.V. registered with the Chamber of Commerce (notary)' }, d: { nl: 'Tot dan staat op offertes "B.V. i.o."; overeenkomsten van daarvoor laat je na oprichting door de B.V. bekrachtigen.', en: 'Until then quotes say "B.V. i.o."; agreements made before are ratified by the B.V. after incorporation.' } },
    { id: 'company', t: { nl: 'Bedrijfsgegevens invullen: naam, adres, KVK, btw-id, IBAN', en: 'Fill in company details: name, address, Chamber of Commerce, VAT, IBAN' }, link: '#/settings/company', auto: (c) => !companyGaps(c).length },
    { id: 'khn', t: { nl: 'Lid worden van KHN (startersstarief € 210 per jaar)', en: 'Join KHN (starter rate € 210 a year)' }, d: { nl: 'Nodig om de UVH te mogen gebruiken; geeft ook advies over huur en personeel.', en: 'Needed to use the UVH; also gives advice on rent and staff.' }, link: 'https://khn.nl/lidmaatschap-starter' },
    { id: 'uvh', t: { nl: 'UVH-pdf downloaden bij KHN en uploaden', en: 'Download the UVH PDF from KHN and upload it' }, link: '#/settings/company', auto: (c) => !!c.uvh_url },
    { id: 'house', t: { nl: 'Huisregels vastleggen', en: 'Write down the house rules' }, link: '#/settings/company', auto: (c) => !!String(c.house_rules || '').trim() },
    { id: 'bookkeeper', t: { nl: 'Boekhouder kiezen en afstemmen: btw op zaalhuur en arrangementen, fooien, jaarrekening', en: 'Choose a bookkeeper and agree: VAT on room hire and packages, tips, annual accounts' } },
  ] },
  { title: { nl: 'Offertes in gebruik nemen', en: 'Start using the quotes' }, items: [
    { id: 'testquote', t: { nl: 'Een proefofferte maken, zakelijk en particulier, en als pdf bekijken', en: 'Make a test quote, business and private, and look at the PDF' }, link: '#/events/new' },
    { id: 'team', t: { nl: 'Team uitleggen: klanttype kiezen, prijsregels per btw-tarief, UVH meesturen', en: 'Explain to the team: choose client type, price lines per VAT rate, send the UVH' } },
  ] },
  { title: { nl: 'Moneybird', en: 'Moneybird' }, items: [
    { id: 'mb_admin', t: { nl: 'Moneybird-administratie aanmaken voor de B.V.', en: 'Create a Moneybird administration for the B.V.' }, link: 'https://www.moneybird.nl' },
    { id: 'mb_bank', t: { nl: 'Zakelijke rekening koppelen in Moneybird', en: 'Connect the business bank account in Moneybird' } },
    { id: 'mb_key', t: { nl: 'API-sleutel maken (Moneybird, Instellingen, Ontwikkelaars) en aan Claude geven', en: 'Create an API key (Moneybird, Settings, Developers) and give it to Claude' }, d: { nl: 'Deel de sleutel niet in een groepsapp of mail; hij geeft toegang tot de boekhouding.', en: 'Do not share the key in a group chat or e-mail; it gives access to the books.' } },
    { id: 'mb_receipts', t: { nl: 'Bonnen en inkoopfacturen naar Moneybird: app op de telefoons, facturen naar het Moneybird-mailadres', en: 'Receipts and purchase invoices to Moneybird: app on the phones, invoices to the Moneybird e-mail address' } },
  ] },
  { title: { nl: 'Daarna bouwt Claude', en: 'Then Claude builds' }, items: [
    { id: 'b_invoice', t: { nl: 'Conceptfactuur in Moneybird vanuit een event', en: 'Draft invoice in Moneybird from an event' } },
    { id: 'b_purchases', t: { nl: 'Inkoopfacturen uit Moneybird inlezen in Finance (foodcost)', en: 'Read purchase invoices from Moneybird into Finance (food cost)' } },
    { id: 'b_revenue', t: { nl: 'Dagomzet uit Finance naar Moneybird', en: 'Daily revenue from Finance to Moneybird' } },
    { id: 'b_staff', t: { nl: 'Personeelschecklist (ID gezien, loonheffingenverklaring) en personeelsmaaltijden', en: 'Staff checklist (ID seen, payroll tax form) and staff meals' } },
    { id: 'b_cost', t: { nl: 'Kostprijsmodel per gerecht', en: 'Cost price per dish' } },
  ] },
];

async function loadDone() {
  try { const { data } = await sb.from('team_settings').select('value').eq('key', 'setup_todo').maybeSingle(); return (data && data.value && data.value.done) || {}; } catch { return {}; }
}
async function saveDone(done) {
  const { error } = await sb.from('team_settings').upsert({ key: 'setup_todo', value: { done }, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function renderStartList(el) {
  const [c, done] = await Promise.all([loadCompany(), loadDone()]);
  const isDone = (it) => (it.auto ? it.auto(c) : !!done[it.id]);
  const all = STEPS.flatMap((s) => s.items); const n = all.filter(isDone).length;
  const next = all.find((it) => !isDone(it));
  el.innerHTML = `<div class="card sl">
    <div class="split"><div><h2 style="margin:0">${L({ nl: 'Stappenplan', en: 'Next steps' })}</h2>
      <div class="small muted">${L({ nl: 'Wat nog moet gebeuren voordat de app offertes, facturen en de boekhouding helemaal regelt. Vakjes met een stippellijn vinkt de app zelf aan, zodra het is ingevuld.', en: 'What still has to happen before the app fully handles quotes, invoices and the books. Boxes with a dotted line tick themselves once filled in.' })}</div></div>
      <div class="sl-count"><strong>${n}</strong> / ${all.length}</div></div>
    <div class="sl-bar" aria-hidden="true"><i style="width:${Math.round((n / all.length) * 100)}%"></i></div>
    ${next ? `<p class="small sl-next">${L({ nl: 'Volgende stap', en: 'Next step' })}: <strong>${esc(L(next.t))}</strong></p>` : `<p class="small sl-next"><strong>${L({ nl: 'Alles staat klaar.', en: 'All set.' })}</strong></p>`}
    ${STEPS.map((s, si) => `<h3 class="sl-h"><span class="sl-num">${si + 1}</span>${esc(L(s.title))}</h3><ul class="sl-list">${s.items.map((it) => { const ok = isDone(it); const d = done[it.id];
      return `<li class="${ok ? 'ok' : ''}"><label class="sl-check">${it.auto ? `<span class="sl-auto" title="${L({ nl: 'Zet de app zelf', en: 'Ticked by the app' })}">${ok ? '&#10003;' : ''}</span>` : `<input type="checkbox" data-todo="${it.id}" ${ok ? 'checked' : ''}>`}
        <span class="sl-t">${esc(L(it.t))}${it.d ? `<span class="sl-d">${esc(L(it.d))}</span>` : ''}${ok && d && !it.auto ? `<span class="sl-d">${esc(fmt.dayMonth(new Date(d.at)))}, ${esc(nameOf(d.by) || '')}</span>` : ''}</span></label>
        ${it.link ? `<a class="btn btn-sm" href="${esc(it.link)}" ${/^https?:/.test(it.link) ? 'target="_blank" rel="noopener"' : ''}>${L({ nl: 'Openen', en: 'Open' })}</a>` : ''}</li>`; }).join('')}</ul>`).join('')}
  </div>`;
  $$('[data-todo]').forEach((cb) => (cb.onchange = async () => {
    const id = cb.dataset.todo;
    if (cb.checked) done[id] = { at: new Date().toISOString(), by: state.me.id }; else delete done[id];
    try { await saveDone(done); toast(cb.checked ? L({ nl: 'Afgevinkt', en: 'Ticked off' }) : L({ nl: 'Weer open', en: 'Open again' })); renderStartList(el); } catch (e) { toastError(e); cb.checked = !cb.checked; }
  }));
}
