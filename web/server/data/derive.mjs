/**
 * Port of dashboard/internal/data/derive.go: deriveNoteFields.
 * Extracts Location, WorkMode, PayRange, PaySource, LastContact from Notes free-text.
 */

const reMoneySpan = /~?(?:[$€£]|CHF ?|EUR ?|USD ?|GBP ?)\d[\d,]*(?:\.\d+)?[KkMm]?(?:\s*[-–]\s*(?:[$€£])?\d[\d,]*(?:\.\d+)?[KkMm]?)?/g;
const reISODate   = /\b20\d{2}-\d{2}-\d{2}\b/g;
const reCityState = /\b([A-Z][A-Za-z.'\\-]+(?: [A-Z][A-Za-z.'\\-]+){0,2}),? (A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/;
const reCityIntl  = /\b(Porto|Lisbon|London|Berlin|Munich|Hamburg|Frankfurt|Cologne|D(?:ü|u)sseldorf|Stuttgart|Z(?:ü|u)rich|Geneva|Lausanne|Basel|Dublin|Cork|Amsterdam|Rotterdam|Eindhoven|Utrecht|Paris|Lyon|Madrid|Barcelona|Valencia|Stockholm|Gothenburg|Malm(?:ö|o)|Copenhagen|Oslo|Helsinki|Milan|Rome|Turin|Vienna|Brussels|Ghent|Antwerp|Luxembourg|Warsaw|Krak(?:ó|o)w|Wroc(?:ł|l)aw|Tallinn|Riga|Vilnius|Prague|Brno|Budapest|Bucharest|Sofia|Athens|Bengaluru|Bangalore|Singapore|Sydney|Toronto|Vancouver|Tel Aviv|S(?:ã|a)o Paulo)\b/i;
const reMoneyPart = /(\d[\d,]*(?:\.\d+)?)\s*([KkMm]?)/g;
const reEstHint   = /\(est[),;. ]|\best\)|\bmarket\b/;

function payCeiling(span) {
  let top = 0;
  let m;
  reMoneyPart.lastIndex = 0;
  while ((m = reMoneyPart.exec(span)) !== null) {
    if (!m[1]) continue;
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (isNaN(v)) continue;
    const suffix = (m[2] ?? '').toLowerCase();
    if (suffix === 'k') v *= 1_000;
    else if (suffix === 'm') v *= 1_000_000;
    if (v > top) top = v;
  }
  return top;
}

/**
 * @param {{ role: string, notes: string, date: string }} app - mutated in place
 */
export function deriveNoteFields(app) {
  const lower = ((app.role ?? '') + ' ' + (app.notes ?? '')).toLowerCase();

  // Location
  let cityStateM = reCityState.exec(app.notes ?? '');
  if (cityStateM) {
    app.location = cityStateM[1] + ', ' + cityStateM[2];
  } else {
    cityStateM = reCityState.exec(app.role ?? '');
    if (cityStateM) {
      app.location = cityStateM[1] + ', ' + cityStateM[2];
    } else {
      const intlM = reCityIntl.exec(app.notes ?? '') ?? reCityIntl.exec(app.role ?? '');
      app.location = intlM ? intlM[1] : '';
    }
  }

  // Work mode
  if (lower.includes('hybrid')) {
    app.workMode = 'Hybrid';
  } else if (
    lower.includes('remote') &&
    (lower.includes('flex') || lower.includes('remote-first') || lower.includes('remote first'))
  ) {
    app.workMode = 'RemoteFlex';
  } else if (lower.includes('remote')) {
    app.workMode = 'Remote';
  } else if (lower.includes('onsite') || lower.includes('on-site') || lower.includes('in-office')) {
    app.workMode = 'Full';
  } else if (app.location) {
    app.workMode = 'Full';
  } else {
    app.workMode = '';
  }

  // Pay range
  const moneyMatches = [...(app.notes ?? '').matchAll(reMoneySpan)].map(m => m[0]);
  let payRange = '';
  for (const mm of moneyMatches) {
    if (/[-–]/.test(mm)) { payRange = mm; break; }
  }
  if (!payRange && moneyMatches.length > 0) payRange = moneyMatches[0];
  app.payRange = payRange;
  app.payMax = payRange ? payCeiling(payRange) : 0;

  if (payRange) {
    if (lower.includes('(posted')) app.paySource = 'POSTED';
    else if (reEstHint.test(lower)) app.paySource = 'est';
    else app.paySource = '';
  } else {
    app.paySource = '';
  }

  // Last contact: max ISO date in notes, fall back to applied date
  let last = app.date ?? '';
  const dateMsNotes = [...(app.notes ?? '').matchAll(reISODate)].map(m => m[0]);
  for (const d of dateMsNotes) {
    if (d > last) last = d;
  }
  app.lastContact = last;
}
