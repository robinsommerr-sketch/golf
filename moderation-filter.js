// A deliberately conservative starter filter. All moderation decisions are server-side.
// Expand and review the list regularly; no static list detects every offensive variation.
export const BLOCKED_TERMS = Object.freeze([
  'faen', 'jævla', 'jævlig', 'helvete', 'fitte', 'hore', 'kuken', 'kuk',
  'pikk', 'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'nigga', 'nigger',
  'faggot', 'retard', 'idiot', 'motherfucker'
]);
function simplify(value) {
  return String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g,'a').replace(/[0135$7]/g, c=>({'0':'o','1':'i','3':'e','5':'s','$':'s','7':'t'}[c]||c))
    .replace(/[^a-z]/g, '');
}
const keys = [...new Set(BLOCKED_TERMS.map(simplify))];
export function hasBadWords(value) {
  const text = simplify(value);
  return keys.some(word => text.includes(word));
}
export function censorText(value) {
  const original = String(value || '');
  if (!hasBadWords(original)) return { text:original, flagged:false };
  // Mask the entire message, including stylised/obfuscated spellings that cannot
  // reliably be replaced by a regular expression without leaving partial slurs.
  return {text:'[Meldingen ble sensurert av ordfilteret]', flagged:true};
}
export function validateUsername(value){
  if(typeof value !== 'string' || !/^[A-Za-z0-9_]{3,18}$/.test(value))
    return 'Brukernavn må inneholde 3–18 bokstaver, tall eller understrek.';
  if(hasBadWords(value)) return 'Brukernavnet inneholder et ord som ikke er tillatt. Velg et annet.';
  return null;
}
