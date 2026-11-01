// One colour per section (kitchen, bar, bakery ...), the same in the roster, on Today and in the kiosk.
// Known words get a fixed colour; anything else gets a stable colour from its name.
const KNOWN = [
  [/keuken|kitchen|kok|chef|cook/i, 'sec-kitchen'],
  [/bar|barista|koffie|coffee/i, 'sec-bar'],
  [/bak|bakery|brood|bread|patiss|pastry/i, 'sec-bakery'],
  [/zaal|service|bediening|floor|gastv|host|restaurant/i, 'sec-floor'],
  [/deli|winkel|shop/i, 'sec-deli'],
  [/afwas|dish|spoel/i, 'sec-dish'],
];
const SPARE = ['sec-a', 'sec-b', 'sec-c'];
export function sectionClass(section) {
  const s = String(section || '').trim();
  if (!s) return 'sec-none';
  for (const [re, cls] of KNOWN) if (re.test(s)) return cls;
  let h = 0; for (const ch of s.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}
