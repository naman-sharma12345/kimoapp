// Phase 7.1 explainable moments: deterministic cues (cheap, high precision)
// on the output-timeline words (after the cut), English, Hindi and Hinglish.
// The cues are hints for the visual director (director.mjs), not rules.
// Node only (the gazetteer and icon index read bundled data).
import { gazetteer } from './geo.mjs';
import { findBrand } from './icons.mjs';

const clean = (w) => String(w ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}%₹$.'-]/gu, '').replace(/^[.'-]+|[.'-]+$/g, '');

// ------------------------------------------------------------ numbers
const EN_UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// Hindi / Hinglish number words (romanised and Devanagari)
const HI_UNITS = { ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, dus: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20, bis: 20, pachchis: 25, tees: 30, chalis: 40, chaalis: 40, pachas: 50, pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'बीस': 20, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'सौ': 100 };
const SCALES = { hundred: 100, sau: 100, thousand: 1e3, hazaar: 1e3, hazar: 1e3, k: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, million: 1e6, crore: 1e7, crores: 1e7, karod: 1e7, billion: 1e9, 'हज़ार': 1e3, 'हजार': 1e3, 'लाख': 1e5, 'करोड़': 1e7 };
const PERCENT = new Set(['percent', 'per', '%', 'pratishat', 'fisadi', 'takka', 'प्रतिशत', 'फीसदी']);
const CURRENCY = { rupees: '₹', rupee: '₹', rs: '₹', rupaye: '₹', rupaiye: '₹', inr: '₹', dollars: '$', dollar: '$', bucks: '$', usd: '$', 'रुपये': '₹' };
const HINDI_NUMBER = new Set(Object.keys(HI_UNITS));
// "do" is also English: only a Hindi number when followed by a scale/percent/counted noun
const AMBIGUOUS = new Set(['do', 'che', 'tin', 'das', 'bis', 'char']);

/**
 * Numbers spoken in the words: [{i0, i1, value, unit, prefix, locale, text}]
 * ("40 percent", "chalis percent", "₹5,000", "3 million", "2x faster", "teen").
 */
export function findNumbers(words) {
  const out = [];
  const lw = words.map((w) => clean(w.w));
  for (let i = 0; i < lw.length; i++) {
    let t = lw[i];
    let value = null;
    let prefix = '';
    let j = i;
    let hindi = false;
    const m = /^([₹$])?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)(%|x|k|m|b|cr|l)?$/.exec(t);
    if (m) {
      prefix = m[1] ?? '';
      value = Number(m[2].replaceAll(',', ''));
      const suf = m[3];
      if (suf === 'k') value *= 1e3;
      else if (suf === 'm') value *= 1e6;
      else if (suf === 'b') value *= 1e9;
      if (suf === '%') return_push(out, words, i, i, value, '%', prefix, 'en-US');
      if (suf === '%') continue;
      if (suf === 'x') {
        return_push(out, words, i, i, value, 'x', prefix, 'en-US');
        continue;
      }
    } else if (EN_UNITS[t] != null) {
      value = EN_UNITS[t];
      if (value >= 20 && EN_UNITS[lw[i + 1]] != null && EN_UNITS[lw[i + 1]] < 10) {
        value += EN_UNITS[lw[i + 1]];
        j = i + 1;
      }
    } else if (HI_UNITS[t] != null) {
      if (AMBIGUOUS.has(t) && !(SCALES[lw[i + 1]] || PERCENT.has(lw[i + 1]) || CURRENCY[lw[i + 1]] || LIST_NOUN_RE.test(lw[i + 1] ?? ''))) continue;
      value = HI_UNITS[t];
      hindi = true;
    } else continue;
    // scales: "3 million", "teen lakh", "5 hazaar"
    let locale = hindi ? 'en-IN' : 'en-US';
    while (SCALES[lw[j + 1]]) {
      const s = lw[j + 1];
      value *= SCALES[s];
      if (['lakh', 'lakhs', 'lac', 'crore', 'crores', 'karod', 'hazaar', 'hazar', 'लाख', 'करोड़'].includes(s)) locale = 'en-IN';
      j++;
    }
    let unit = '';
    if (PERCENT.has(lw[j + 1])) {
      unit = '%';
      j += lw[j + 1] === 'per' && lw[j + 2] === 'cent' ? 2 : 1;
    } else if (CURRENCY[lw[j + 1]]) {
      prefix = CURRENCY[lw[j + 1]];
      if (prefix === '₹') locale = 'en-IN';
      j++;
    } else if (lw[j + 1] === 'x' || lw[j + 1] === 'times' || lw[j + 1] === 'guna') {
      unit = 'x';
      j++;
    }
    if (prefix === '₹') locale = 'en-IN';
    return_push(out, words, i, j, value, unit, prefix, locale);
    i = j;
  }
  return out;
}
function return_push(out, words, i0, i1, value, unit, prefix, locale) {
  out.push({ i0, i1, value, unit, prefix, locale, text: words.slice(i0, i1 + 1).map((w) => w.w).join(' ') });
}
/** Every number value the transcript says (for the no-invented-numbers check). */
export function spokenNumberSet(words) {
  const set = new Set();
  for (const n of findNumbers(words)) {
    set.add(n.value);
    // "3 million" may be shown as 3M, 3,000,000 or 3
    for (const s of [1e3, 1e5, 1e6, 1e7, 1e9]) if (n.value % s === 0 && n.value >= s) set.add(n.value / s);
  }
  for (const w of words) {
    const y = /^(1[89]\d\d|20\d\d)$/.exec(clean(w.w));
    if (y) set.add(Number(y[1]));
  }
  return set;
}

// ------------------------------------------------------------ sentences
/** Sentences with word index ranges: [{i0, i1, text, start, end, question}]. */
export function sentences(words) {
  const out = [];
  let i0 = 0;
  for (let i = 0; i < words.length; i++) {
    const end = /[.?!।]$/.test(words[i].w) || i === words.length - 1 || (words[i + 1] && words[i + 1].start - words[i].end > 0.9);
    if (!end) continue;
    const ws = words.slice(i0, i + 1);
    out.push({ i0, i1: i, text: ws.map((w) => w.w).join(' '), start: ws[0].start, end: ws.at(-1).end, question: /\?$/.test(words[i].w) || /^(why|how|what|kyun|kyu|kaise|kya)\b/i.test(ws[0].w) });
    i0 = i + 1;
  }
  return out;
}

// ------------------------------------------------------------ cue tables
const ORDINALS = [
  [/^(first|firstly|pehla|pehli|pehle|1st|one)$/, 1],
  [/^(second|secondly|doosra|dusra|doosri|dusri|2nd|two)$/, 2],
  [/^(third|thirdly|teesra|tisra|teesri|tisri|3rd|three)$/, 3],
  [/^(fourth|chautha|chauthi|4th|four)$/, 4],
  [/^(fifth|paanchva|panchva|5th|five)$/, 5],
];
const LIST_NOUN_RE = /^(reasons?|things?|ways?|steps?|tips?|mistakes?|baatein|cheezein|tarike|kaaran|galtiyan)$/;
const LIST_NOUN = /^(reasons?|things?|ways?|steps?|tips?|mistakes?|rules?|lessons?|ideas?|tools?|habits?|points?|cheezein|cheeze|tarike|tareeke|baatein|kaaran|galtiyan)$/;
const COMPARE = /^(vs|versus|unlike|compared|than|instead|alternatively|mukable|mukabale|banam)$/;
const PROCESS = /^(then|next|after|finally|leads|causes|so|step|phir|uske|baad|isliye|matlab)$/;
const DEFINE = [/^(\p{L}[\p{L}-]*) (is|means|matlab|yaani) /u, /\bwhat is (\p{L}[\p{L} -]{2,30})\?/u, /\bbasically,? (\p{L}[\p{L}-]*) is\b/u];
const QUOTE = /\b(said|says|once said|in the words of|ne kaha|kehte hain|quote)\b/i;
const CODE = /\b(npm|npx|pnpm|pip|git|docker|cd|ls|python|node|cargo|brew|apt|curl)\b(\s+(?!(?:and|then|or|to|in|aur|phir)\b)[\w@./:-]+){1,4}/i;
const UI = /\b(click|tap|press|open|go to|select|hit)\s+(on\s+)?(the\s+)?([\p{L}][\p{L}\s]{1,24}?)(\s+(button|tab|menu|icon|settings|option))?\b/iu;
const METAPHORS = [
  [/^(compound|compounding|growth|grow|growing|exponential|scale|scaling)$/, 'grow-curve', 'trending up'],
  [/^(focus|attention|concentrate|dhyan)$/, 'spotlight', 'target'],
  [/^(balance|tradeoff|trade-off|fair|santulan)$/, 'scale-balance', 'scale'],
  [/^(habit|habits|stack|build|building|foundation|consistency)$/, 'stack-blocks', 'layers'],
  [/^(choice|choose|decision|decide|option|fork|path)$/, 'split-path', 'git fork'],
  [/^(attract|audience|magnet|pull|followers)$/, 'magnet', 'magnet'],
  [/^(loop|repeat|repeats|cycle|again)$/, 'loop-arrows', 'repeat'],
  [/^(done|checklist|complete|finished|ship|shipped)$/, 'checklist-tick', 'list checks'],
  [/^(warning|mistake|danger|risk|careful|avoid|galti|khatra)$/, 'warning-pulse', 'alert triangle'],
  [/^(launch|launched|rocket|skyrocket|blew|viral)$/, 'rocket-rise', 'rocket'],
];
const HUMOUR = /\b(haha+|lol|lmao|joke|joking|kidding|mazaak|mazak|epic fail|i failed|we failed|it failed|disaster|worst|cringe|oops|literally died|dead|no way|wait what|oh my god|omg|bro|bhai|lmfao|hilarious|funny|plot twist)\b/i;
const SERIOUS = /\b(died|death|passed away|cancer|depress\w*|suicide|funeral|tragedy|war|grief|lost my|abuse|accident|maut|dukh|bimari|disease|hospital)\b/i;
const EMOJI_WORDS = [
  [/^(haha+|lol|lmao|funny|hilarious|joke)$/, 'laugh'],
  [/^(mind|mindblown|insane|unbelievable|shocking|crazy)$/, 'mind-blown'],
  [/^(fire|lit|hot|banger)$/, 'fire'],
  [/^(done|correct|right|works|yes|haan)$/, 'check'],
  [/^(wrong|never|fail|failed|galat|disaster)$/, 'x'],
];

/**
 * Deterministic candidates over output words. Returns
 * {sentences, candidates: [{family, i0, i1, say, importance, ...data}], tone: {humour, serious}, numbers}.
 */
export function detectCues(words, { note = '' } = {}) {
  const sents = sentences(words);
  const lw = words.map((w) => clean(w.w));
  const numbers = findNumbers(words);
  const cands = [];
  const add = (c) => cands.push({ importance: 0.6, ...c });
  const sentenceOf = (i) => sents.find((s) => i >= s.i0 && i <= s.i1) ?? { i0: i, i1: i };
  const phrase = (i, max = 6) => words.slice(i, Math.min(i + max, sentenceOf(i).i1 + 1)).map((w) => w.w.replace(/[.,!?;:]+$/, '')).join(' ');

  // enumeration: "three reasons …", then ordinals "first … second … third"
  for (let i = 0; i < lw.length; i++) {
    const n = numbers.find((x) => x.i0 === i);
    if (n && n.value >= 2 && n.value <= 7 && LIST_NOUN.test(lw[n.i1 + 1] ?? '')) {
      const items = [];
      for (let k = n.i1 + 2; k < Math.min(lw.length, n.i1 + 400) && items.length < n.value; k++) {
        const ord = ORDINALS.find(([re]) => re.test(lw[k]));
        if (ord && ord[1] === items.length + 1 && (k === 0 || /[.,!?]$/.test(words[k - 1].w) || ['is', 'the', 'number', 'reason', 'step', 'one'].includes(lw[k + 1]) || /^(firstly|secondly|thirdly)$/.test(lw[k]) || k - (items.at(-1)?.i ?? n.i1) > 3)) {
          const startText = ['is', 'reason', 'step', 'thing', 'number', 'one', 'two', 'three', 'tip', 'off', 'of', 'all', 'hai', 'toh', 'baat', 'cheez', 'point', 'tarika'].includes(lw[k + 1]) ? k + 2 : k + 1;
          items.push({ i: k, text: phrase(startText, 5).replace(/\s+(hai|he|hain|h)$/i, '') });
        }
      }
      add({ family: 'list', i0: n.i0, i1: items.at(-1)?.i ?? n.i1, say: n.i0, title: phrase(n.i0, 4), items, expected: n.value, importance: items.length >= 2 ? 0.9 : 0.55 });
    }
  }
  // ordinals without a count announcement
  const ords = [];
  for (let i = 0; i < lw.length; i++) {
    const ord = ORDINALS.find(([re]) => re.test(lw[i]));
    if (ord && ord[1] <= 5 && !/^(one|two|three|four|five)$/.test(lw[i])) ords.push({ i, n: ord[1] });
  }
  for (let s = 0; s < ords.length; s++) {
    if (ords[s].n !== 1) continue;
    const run = [ords[s]];
    for (let k = s + 1; k < ords.length && run.length < 5; k++) if (ords[k].n === run.length + 1 && ords[k].i - run.at(-1).i < 120) run.push(ords[k]);
    if (run.length >= 2 && !cands.some((c) => c.family === 'list' && c.i0 <= run[0].i && c.i1 >= run[0].i))
      add({ family: 'list', i0: run[0].i, i1: run.at(-1).i, say: run[0].i, items: run.map((r) => ({ i: r.i, text: phrase(r.i + 1, 5) })), importance: 0.8 });
  }
  // numbers / stats / money / % / multipliers; ≥ 2 numbers close together → chart
  for (const n of numbers) {
    if (n.value < 2 && !n.unit) continue;
    if (/^(19|20)\d\d$/.test(String(n.value)) && !n.unit && !n.prefix) continue; // years: timeline
    if (n.value <= 7 && !n.unit && !n.prefix && LIST_NOUN.test(lw[n.i1 + 1] ?? '')) continue;
    const big = n.unit || n.prefix || n.value >= 100;
    if (!big) continue;
    const label = words.slice(n.i1 + 1, Math.min(n.i1 + 5, sentenceOf(n.i1).i1 + 1)).map((w) => w.w.replace(/[.,!?;:]+$/, '')).filter((w) => !/^(of|the|a|and|to|in|is|are|were|ke|ki|ka|hai)$/i.test(w)).slice(0, 4).join(' ');
    add({ family: 'stat', i0: n.i0, i1: n.i1, say: n.i0, value: n.value, unit: n.unit, prefix: n.prefix, locale: n.locale, label, importance: n.unit === '%' || n.prefix ? 0.8 : 0.65 });
  }
  for (let k = 0; k + 1 < numbers.length; k++) {
    const a = numbers[k];
    const b = numbers[k + 1];
    if (/^(19|20)\d\d$/.test(String(a.value)) && !a.unit && !a.prefix) continue;
    if (b.i0 - a.i1 <= 8 && a.unit === b.unit && a.prefix === b.prefix && (a.value >= 2 || a.unit) && a.value !== b.value && /(from|to|se|tak|went|grew|became|vs|versus|compared|than)/.test(lw.slice(a.i0 - 3, b.i1 + 1).join(' '))) {
      const fromTo = /^(from|se)$/.test(lw[a.i0 - 1] ?? '');
      const noun = (i) => (/^[\p{L}]{3,}$/u.test(lw[i] ?? '') && !/^(to|and|the|of|in|tak|se|aur)$/.test(lw[i]) ? words[i].w.replace(/[.,!?;:]+$/, '') : '');
      const title = noun(b.i1 + 1);
      add({ family: 'chart', i0: a.i0, i1: b.i1, say: a.i0, chart: 'bar', title, items: [{ i: a.i0, value: a.value, label: fromTo ? 'Before' : noun(a.i1 + 1) || 'A', unit: a.unit, prefix: a.prefix }, { i: b.i0, value: b.value, label: fromTo ? 'After' : title || 'B', unit: b.unit, prefix: b.prefix }], importance: 0.85 });
    }
  }
  // comparisons
  for (let i = 0; i < lw.length; i++) {
    if (!COMPARE.test(lw[i]) && !(lw[i] === 'better' && lw[i + 1] === 'than') && !(lw[i] === 'pros' && lw[i + 1] === 'and')) continue;
    if (lw[i] === 'than' && !/^(better|worse|faster|slower|cheaper|bigger|smaller|more|less)$/.test(lw[i - 1] ?? '')) continue;
    if (lw[i] === 'so') continue;
    const s = sentenceOf(i);
    const left = words.slice(Math.max(s.i0, i - 3), i).map((w) => w.w.replace(/[.,!?;:]+$/, '')).join(' ');
    const right = words.slice(i + 1, Math.min(s.i1 + 1, i + 4)).map((w) => w.w.replace(/[.,!?;:]+$/, '')).join(' ');
    if (left && right) add({ family: 'compare', i0: s.i0, i1: s.i1, say: Math.max(s.i0, i - 2), left: { title: left, i: Math.max(s.i0, i - 3) }, right: { title: right, i: i + 1 }, importance: 0.7 });
  }
  // before … after
  for (let i = 0; i < lw.length; i++) if (lw[i] === 'before' && lw.slice(i + 1, i + 40).includes('after')) {
    const j = lw.indexOf('after', i + 1);
    add({ family: 'compare', i0: i, i1: Math.min(lw.length - 1, j + 4), say: i, left: { title: 'Before', i }, right: { title: 'After', i: j }, importance: 0.6 });
  }
  // process / steps
  for (const s of sents) {
    const marks = [];
    for (let i = s.i0; i <= s.i1; i++) if (PROCESS.test(lw[i]) && !(lw[i] === 'so' && i !== s.i0)) marks.push(i);
    if (/\bhow it works\b|\bstep (one|1)\b|\bkaise kaam\b/.test(lw.slice(s.i0, s.i1 + 1).join(' ')) || marks.length >= 2)
      add({ family: 'flow', i0: s.i0, i1: s.i1, say: s.i0, steps: marks.map((i) => ({ i, text: phrase(i + 1, 3) })), cycle: /\b(repeats|again|loop|cycle)\b/.test(lw.slice(s.i0, s.i1 + 1).join(' ')), importance: marks.length >= 2 ? 0.65 : 0.5 });
  }
  // time sequence: 2+ years within ~40 words
  const years = lw.map((w, i) => (/^(1[89]\d\d|20\d\d)$/.test(w) ? { i, y: w } : null)).filter(Boolean);
  for (let k = 0; k + 1 < years.length; k++) {
    const run = [years[k]];
    for (let m = k + 1; m < years.length && years[m].i - run.at(-1).i < 40; m++) run.push(years[m]);
    if (run.length >= 2 && !cands.some((c) => c.family === 'timeline' && c.i1 >= run[0].i)) {
      add({ family: 'timeline', i0: run[0].i, i1: run.at(-1).i, say: run[0].i, items: run.map((r) => ({ i: r.i, when: r.y, text: phrase(r.i + 1, 3) })), importance: 0.75 });
      k += run.length - 1;
    }
  }
  // definitions
  for (const s of sents) {
    const text = words.slice(s.i0, s.i1 + 1).map((w) => w.w).join(' ');
    for (const re of DEFINE) {
      const m = re.exec(text.toLowerCase());
      if (m && m[1] && !/^(it|this|that|he|she|there|what|which|who)$/.test(m[1].trim())) {
        add({ family: 'definition', i0: s.i0, i1: s.i1, say: s.i0, term: m[1].trim(), definition: words.slice(s.i0, s.i1 + 1).map((w) => w.w).join(' ').replace(/^.*?\b(is|means|matlab|yaani)\b\s*/i, ''), importance: 0.55 });
        break;
      }
    }
  }
  // places (gazetteer unigrams + bigrams)
  const gaz = gazetteer();
  const placeHits = [];
  for (let i = 0; i < lw.length; i++) {
    const bi = `${lw[i]} ${lw[i + 1] ?? ''}`.trim();
    if (lw[i + 1] && gaz.has(bi)) {
      placeHits.push({ i, name: `${words[i].w} ${words[i + 1].w}`.replace(/[.,!?;:]+$/, '') });
      i++;
    } else if (lw[i].length > 2 && gaz.has(lw[i]) && /^\p{Lu}/u.test(words[i].w)) placeHits.push({ i, name: words[i].w.replace(/[.,!?;:']+s?$/, '') });
  }
  for (let k = 0; k < placeHits.length; k++) {
    const run = [placeHits[k]];
    while (placeHits[k + 1] && placeHits[k + 1].i - run.at(-1).i < 25) run.push(placeHits[++k]);
    const route = /\b(to|from|se|tak|travel|flew|moved|drive|went)\b/.test(lw.slice(run[0].i - 3, run.at(-1).i + 1).join(' '));
    add({ family: 'map', i0: run[0].i, i1: run.at(-1).i, say: run[0].i, places: run.map((r) => ({ i: r.i, name: r.name })), route: route && run.length > 1, importance: 0.7 });
  }
  // named things: known brands (logo) and capitalised names mid-sentence
  for (let i = 0; i < lw.length; i++) {
    const b = findBrand(lw[i]);
    if (b && lw[i].length > 2) add({ family: 'logo_or_icon', i0: i, i1: i, say: i, label: b.title, brand: b.slug, importance: 0.5 });
  }
  // code / commands / UI
  for (const s of sents) {
    const text = words.slice(s.i0, s.i1 + 1).map((w) => w.w).join(' ');
    const m = CODE.exec(text);
    if (m) add({ family: 'code', i0: s.i0, i1: s.i1, say: s.i0 + text.slice(0, m.index).split(/\s+/).filter(Boolean).length, code: m[0].replace(/[.,!?]+$/, ''), lang: 'bash', importance: 0.75 });
    const u = UI.exec(text);
    if (u && /^(click|tap|press|select)$/i.test(u[1])) add({ family: 'ui_callout', i0: s.i0, i1: s.i1, say: s.i0 + text.slice(0, u.index).split(/\s+/).filter(Boolean).length, label: u[4].trim().split(/\s+/).slice(0, 3).join(' '), importance: 0.6 });
  }
  // quotes
  for (const s of sents) {
    const text = words.slice(s.i0, s.i1 + 1).map((w) => w.w).join(' ');
    const m = /\bas ([\p{Lu}][\p{L}]+(?: [\p{Lu}][\p{L}]+)?) (once )?said,?\s*(.+)$/u.exec(text) ?? /\b([\p{Lu}][\p{L}]+) (once )?said,?\s*"?(.+)$/u.exec(text);
    if (m || QUOTE.test(text) && /"/.test(text)) add({ family: 'quote', i0: s.i0, i1: s.i1, say: s.i0, author: m?.[1] ?? '', quote: (m?.[3] ?? text).replace(/^"|"$/g, ''), importance: 0.6 });
  }
  // abstract concepts → motion metaphors
  for (let i = 0; i < lw.length; i++) {
    const hit = METAPHORS.find(([re]) => re.test(lw[i]));
    if (hit) add({ family: 'icon_metaphor', i0: i, i1: i, say: i, keyword: words[i].w.replace(/[.,!?;:]+$/, ''), metaphor: hit[1], icon: hit[2], importance: 0.45 });
  }
  // questions to the viewer
  for (const s of sents) if (s.question && s.i1 - s.i0 <= 12 && s.i1 - s.i0 >= 2) {
    const next = sents.find((x) => x.i0 > s.i1);
    add({ family: 'question', i0: s.i0, i1: s.i1, say: s.i0, question: s.text, answer_at: next?.i0 ?? null, importance: 0.55 });
  }
  // tone windows (humour vs serious) and emoji words
  const tone = { humour: [], serious: [] };
  for (const s of sents) {
    if (SERIOUS.test(s.text)) tone.serious.push([s.start, s.end + 8]);
    else if (HUMOUR.test(s.text)) tone.humour.push([s.start, s.end + 1.5]);
  }
  for (let i = 0; i < lw.length; i++) {
    const e = EMOJI_WORDS.find(([re]) => re.test(lw[i]));
    if (e) add({ family: 'emoji', i0: i, i1: i, say: i, emoji: e[1], importance: 0.35 });
  }
  void note;
  return { sentences: sents, candidates: cands.sort((a, b) => a.say - b.say || b.importance - a.importance), tone, numbers, hindi: words.some((w) => HINDI_NUMBER.has(clean(w.w)) || /\p{Script=Devanagari}/u.test(w.w)) };
}

export { HUMOUR, SERIOUS, clean };
