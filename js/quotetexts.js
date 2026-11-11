// The texts on the quote, the confirmation and in the quote mail. Managers change them under Settings,
// stored in team_settings 'quote_texts' as { nl: {...}, en: {...} }; an empty field uses the standard text.
// Placeholders: {voornaam} {event} {datum} {de_offerte} {geldig_tot} {uvh_link}
import { sb } from './data.js';
import { state } from './core.js';

export const QT_FIELDS = [
  ['intro_quote', { nl: 'Opening van een offerte', en: 'Opening of a quote' }, '{voornaam} {event}'],
  ['intro_confirm', { nl: 'Opening van een bevestiging', en: 'Opening of a confirmation' }, '{voornaam} {event}'],
  ['allergy', { nl: 'Allergieën en dieetwensen', en: 'Allergies and dietary needs' }, ''],
  ['final_count', { nl: 'Aantal gasten en factuur', en: 'Number of guests and invoice' }, ''],
  ['uvh', { nl: 'Voorwaarden (UVH)', en: 'Conditions (UVH)' }, ''],
  ['approval', { nl: 'Akkoord en handtekening', en: 'Agreement and signature' }, ''],
  ['mail', { nl: 'Mail bij Offerte mailen', en: 'Mail for E-mail the quote' }, '{voornaam} {de_offerte} {event} {datum} {geldig_tot} {uvh_link}'],
];
export const QT_DEFAULTS = {
  nl: {
    intro_quote: 'Beste {voornaam}, fijn dat je {event} bij ons in de Wintertuin wilt vieren. Hieronder staat ons voorstel; laat gerust weten als je iets anders wilt.',
    intro_confirm: 'Beste {voornaam}, fijn dat je bij ons in de Wintertuin viert. Hieronder staat alles wat we samen hebben afgesproken.',
    allergy: 'Laat allergieën en dieetwensen op tijd weten, dan houden we er graag rekening mee. Sporen van andere ingrediënten kunnen we helaas niet helemaal uitsluiten.',
    final_count: '', // off by default; a manager can still write one under Settings
    uvh: 'Op deze overeenkomst zijn de Uniforme Voorwaarden Horeca (UVH) van toepassing, gedeponeerd bij de Kamer van Koophandel. Daarin staan onder meer de afspraken over annuleren en wijzigen.',
    approval: 'Met je handtekening bevestig je dit event en de voorwaarden hierboven. Wijzigingen na de bevestiging geef je schriftelijk door; daarvan maken we een nieuwe versie.',
    mail: 'Beste {voornaam},\n\nHierbij {de_offerte} voor {event} op {datum}. Je vindt hem als pdf in de bijlage.\n{geldig_tot}\n\nOp deze overeenkomst zijn de Uniforme Voorwaarden Horeca (UVH) van toepassing. {uvh_link}\n\nLaat je ons weten of alles klopt? Dan zetten we het vast.\n\nHartelijke groet,\nHet Wintertuin team',
  },
  en: {
    intro_quote: 'Dear {voornaam}, thank you for thinking of the Wintertuin for {event}. Below is our proposal; just let us know if you would like anything changed.',
    intro_confirm: 'Dear {voornaam}, we are glad you are celebrating with us at the Wintertuin. Below is everything we agreed together.',
    allergy: 'Let us know about allergies and dietary needs in good time and we will gladly take them into account. We cannot fully rule out traces of other ingredients.',
    final_count: '',
    uvh: 'The Uniform Conditions for the Hospitality Industry (UVH) apply to this agreement, filed with the Chamber of Commerce. They include the rules on cancelling and changes.',
    approval: 'With your signature you confirm this event and the conditions above. Please send changes after the confirmation in writing; we then make a new version.',
    mail: 'Dear {voornaam},\n\nPlease find {de_offerte} for {event} on {datum} attached as a PDF.\n{geldig_tot}\n\nThe Uniform Conditions for the Hospitality Industry (UVH) apply to this agreement. {uvh_link}\n\nCould you let us know if everything is right? Then we will confirm it.\n\nKind regards,\nThe Wintertuin team',
  },
};
let saved = { nl: {}, en: {} };
export async function loadQuoteTexts() {
  try { const { data } = await sb.from('team_settings').select('value').eq('key', 'quote_texts').maybeSingle(); saved = { nl: {}, en: {}, ...((data && data.value) || {}) }; } catch { /* standard texts */ }
  return saved;
}
export function qt(l, key, vars = {}) {
  const lang = l === 'en' ? 'en' : 'nl';
  let s = (saved[lang] && String(saved[lang][key] || '').trim()) || QT_DEFAULTS[lang][key] || '';
  s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
  // a greeting without a name: "Beste , fijn" becomes "Fijn"
  s = s.replace(/^(Beste|Dear)\s*,\s*(\w)/, (m, a, c) => c.toUpperCase());
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export async function saveQuoteTexts(v) {
  const { error } = await sb.from('team_settings').upsert({ key: 'quote_texts', value: v, updated_by: state.me.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error; saved = { nl: {}, en: {}, ...v };
}
