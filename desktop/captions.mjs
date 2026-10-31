// Phase 5 caption model: refined transcript words re-timed onto the output
// timeline after cuts → cleaned, cased, numbers normalised → chunked by
// creator rules (punctuation/pauses first, then syntax) → frame-timed with a
// 1-frame lead → one keyword accent per chunk → placed in the platform safe
// area, below the chin, never over the mouth, yielding to hook titles and
// callouts. Chunks live on the EDL as caption_word_group overlays
// (props.engine 'kimo-captions'), so Studio edits operate on them directly.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arollTrack, coverGeometry, cameraRect, clipCameraAt, headAt } from './camera.mjs';
import { bundledMetrics, textWidth, lineBox, covers } from './fonts.mjs';

import { CAPTION_ENGINE } from './caption-edits.mjs';
export { CAPTION_ENGINE };
export const CAPTIONS_VERSION = 1;
const STYLE_DIR = fileURLToPath(new URL('./data/caption-styles', import.meta.url));

// ---------------------------------------------------------------- styles
let styleCache = null;
/** All caption/title styles from data/caption-styles/*.json, by id. */
export function captionStyles(dir = STYLE_DIR) {
  if (styleCache && dir === STYLE_DIR) return styleCache;
  const out = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    validateStyle(s);
    out.set(s.id, Object.freeze(s));
  }
  if (dir === STYLE_DIR) styleCache = out;
  return out;
}
export function captionStyle(id) {
  const all = captionStyles();
  return all.get(id) ?? all.get('kimo');
}
/** Throws on a style JSON that the renderer cannot draw. */
export function validateStyle(s) {
  const bad = (m) => {
    throw new Error(`caption style ${s?.id ?? '?'}: ${m}`);
  };
  if (!s || typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) bad('id must be a lowercase slug');
  if (!s.font?.file || !s.font?.family) bad('font.file and font.family required');
  if (!(s.size > 0 && s.size < 0.3)) bad('size is a fraction of canvas height (0..0.3)');
  if (!['upper', 'sentence', 'asis'].includes(s.case)) bad('case must be upper|sentence|asis');
  for (const k of ['text', 'accent', 'outline']) if (!/^#[0-9a-f]{6}$/i.test(s.colors?.[k] ?? '')) bad(`colors.${k} must be #RRGGBB`);
  for (const k of ['shorts', 'wide']) {
    const l = s.layout?.[k];
    if (!(l?.max_words >= 1 && l.max_chars >= 4 && l.max_lines >= 1 && l.max_lines <= 2 && l.min_dur > 0)) bad(`layout.${k} needs max_words, max_chars, max_lines (1-2), min_dur`);
  }
  if (!['auto', 'top', 'middle', 'lower-third', 'bottom'].includes(s.position)) bad('position must be auto|top|middle|lower-third|bottom');
  if (!['active-colour', 'reveal', 'karaoke', 'box', 'none', 'echo', 'gold', 'decay'].includes(s.highlight)) bad(`unknown highlight ${s.highlight}`);
  return s;
}

const KIMO_TO_STYLE = { pop: 'kimo', impact: 'hormozi', karaoke: 'karaoke', boxed: 'boxed-highlight', bold: 'hormozi', minimal: 'mkbhd', subtitle: 'doc-subtitle' };
const NOTE_STYLES = [
  [/mr\.? ?beast/i, 'mrbeast'],
  [/hormozi|gadzhi/i, 'hormozi'],
  [/ali ?abdaal|abdaal/i, 'ali-abdaal'],
  [/mkbhd|marques/i, 'mkbhd'],
  [/karaoke/i, 'karaoke'],
  [/netflix|documentary subtitles?|doc subtitles?/i, 'doc-subtitle'],
  [/boxed|highlight box/i, 'boxed-highlight'],
  [/echo/i, 'echo-slide'],
  [/gold|shiny|light ?sweep/i, 'gold-sweep'],
  [/decay|erode|vox/i, 'decay'],
];
/**
 * The caption style for an edit: explicit choice, then a style named in the
 * note, then the template's kimo caption style mapped onto ours (kimo default).
 */
export function pickCaptionStyle({ requested, note, template, canvas } = {}) {
  const all = captionStyles();
  const vertical = canvas ? canvas.h > canvas.w : true;
  const want = String(requested ?? '').toLowerCase();
  if (want && want !== 'auto') {
    if (all.has(want)) return want;
    if (KIMO_TO_STYLE[want]) return KIMO_TO_STYLE[want];
    if (want === 'clean') return vertical ? 'ali-abdaal' : 'doc-subtitle';
  }
  for (const [re, id] of NOTE_STYLES) if (re.test(note ?? '') && /caption|subtitle|text|style|font|word/i.test(note ?? '')) return id;
  const c = template?.captions;
  if (c?.caption_id && all.has(c.caption_id)) return c.caption_id;
  if (c?.style === 'clean') return (c.lines ?? 1) > 1 ? (vertical ? 'ali-abdaal' : 'doc-subtitle') : 'mkbhd';
  return KIMO_TO_STYLE[c?.style] ?? 'kimo';
}
/** Title effect for hook text by template or note (null keeps the planner's own title look). */
export function pickHookStyle({ style, note } = {}) {
  if (/echo|stretch slide/i.test(note ?? '')) return 'echo-slide';
  if (/gold|shiny|light ?sweep/i.test(note ?? '')) return 'gold-sweep';
  if (/decay|erode|vox/i.test(note ?? '')) return 'decay';
  return { energetic: 'echo-slide', documentary: 'decay', cinematic: 'gold-sweep' }[style] ?? null;
}

// ---------------------------------------------------------------- words onto the output timeline
const npath = (p) => String(p ?? '').replaceAll('\\', '/');
const clipLen = (c) => (c.out - c.in) / (c.speed ?? 1);
const HESITATION = /^(um+|uh+|erm+|hmm+|mm+|uhh+|umm+|ah+|eh+)$/i;
const rate = (fps) => {
  if (typeof fps === 'number') return fps;
  const [a, b = 1] = String(fps).split('/').map(Number);
  return a / b;
};

/**
 * Source-time words (ctx.words by file path, from the Phase 3 transcript) →
 * output-timeline words via the A-roll clips (in/out/at/speed). Words whose
 * onset falls outside every kept range were cut and never show.
 */
export function outputWords(edl, ctx = {}) {
  const track = arollTrack(edl);
  if (!track) return [];
  const pathOf = (c) => npath(edl.sources.find((s) => s.id === c.src)?.path);
  const emph = (ctx.emphasis ?? []).map((e) => ({ ...e, path: npath(e.path) }));
  const out = [];
  for (const c of [...track.clips].sort((a, b) => a.at - b.at)) {
    const words = ctx.words?.[pathOf(c)] ?? ctx.words?.[c.src] ?? [];
    const sp = c.speed ?? 1;
    for (const w of words) {
      if (!(w.start >= c.in - 0.02 && w.start < c.out - 0.03)) continue;
      const text = String(w.w ?? '').trim();
      if (!text || HESITATION.test(text.replace(/[^\p{L}]/gu, ''))) continue;
      const start = c.at + (Math.max(w.start, c.in) - c.in) / sp;
      const end = c.at + (Math.min(Math.max(w.end, w.start + 0.04), c.out) - c.in) / sp;
      const e = emph.find((x) => x.path === pathOf(c) && Math.abs(x.t - w.start) < 0.06);
      out.push({ w: text, start, end: Math.max(end, start + 0.04), ...(e ? { emphasis: e.kind ?? 'claim' } : {}), ...(w.speaker ? { speaker: w.speaker } : {}) });
    }
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 1; i < out.length; i++) if (out[i - 1].end > out[i].start) out[i - 1].end = Math.max(out[i - 1].start + 0.02, out[i].start);
  return out;
}

// ---------------------------------------------------------------- cleanup, casing, numbers
const SENT_END = /[.?!।॥…]["'”’)\]]*$/;
const CLAUSE_P = /[,;:—–]["'”’)\]]*$/;
export const isDevanagari = (s) => /\p{Script=Devanagari}/u.test(s);
const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = new Set(['thousand', 'million', 'billion', 'trillion', 'lakh', 'lakhs', 'crore', 'crores', 'k']);
const UNITS = new Set(['percent', '%', 'dollars', 'dollar', 'rupees', 'rupee', 'bucks', 'euros', 'pounds', 'people', 'years', 'year', 'days', 'day', 'hours', 'hour', 'minutes', 'minute', 'seconds', 'second', 'times', 'steps', 'step', 'ways', 'tips', 'things', 'videos', 'views', 'subscribers', 'followers', 'users', 'customers', 'months', 'month', 'weeks', 'week', 'kg', 'km', 'miles', 'x', 'reasons', 'mistakes', 'rules', 'hacks', 'tools', 'apps']);
const bare = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}%$₹]/gu, '');

function numberAt(words, i) {
  let value = 0;
  let current = 0;
  let j = i;
  let seen = false;
  for (; j < words.length; j++) {
    const parts = bare(words[j].w.replace(/-/g, ' ')).length ? words[j].w.toLowerCase().replace(/[^a-z\- ]/g, '').split('-') : [];
    if (!parts.length) break;
    let ok = true;
    let local = current;
    for (const p of parts) {
      if (p in ONES) local += ONES[p];
      else if (p in TENS) local += TENS[p];
      else if (p === 'hundred' && seen) local = (local || 1) * 100;
      else if (p === 'and' && seen && j + 1 < words.length && (bare(words[j + 1].w) in ONES || bare(words[j + 1].w) in TENS)) continue;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) break;
    current = local;
    seen = true;
    if (SENT_END.test(words[j].w) || CLAUSE_P.test(words[j].w)) {
      j++;
      break;
    }
  }
  if (!seen) return null;
  value += current;
  return { value, end: j };
}

/**
 * Cleans display text. Shorts styles: digits for spoken numbers ("three
 * million" → "3 MILLION"), trailing punctuation stripped (? and ! kept).
 * Casing per style; brand/proper-noun casing from the note's hints in
 * sentence/as-is styles. Each word gets lang 'hi' when it is Devanagari.
 */
export function normalizeWords(words, style, { hints = [] } = {}) {
  const brand = new Map(hints.filter((h) => /[A-Z]/.test(h.slice(1)) || /^[A-Z]/.test(h)).map((h) => [h.toLowerCase(), h]));
  const src = words.map((w) => ({ ...w }));
  const merged = [];
  for (let i = 0; i < src.length; i++) {
    const w = src[i];
    if (style.numbers === 'digits') {
      const n = numberAt(src, i);
      if (n) {
        const next = src[n.end] ? bare(src[n.end].w) : '';
        const prev = i > 0 ? bare(src[i - 1].w) : '';
        const unit = SCALES.has(next) || UNITS.has(next) || next === 'percent' || /^[$₹]/.test(prev);
        const span = src.slice(i, n.end);
        if (n.value >= 10 || (unit && n.value >= 2) || (unit && SCALES.has(next))) {
          let text = String(n.value);
          let end = n.end;
          let last = span.at(-1);
          if (next === 'percent') {
            text += '%';
            last = src[n.end];
            end = n.end + 1;
          } else if (next === 'thousand' && n.value < 1000) {
            text = `${n.value},000`;
            last = src[n.end];
            end = n.end + 1;
          }
          const trailing = /[?!.,;:]+$/.exec(last.w)?.[0] ?? '';
          merged.push({ ...span[0], w: text + trailing, start: span[0].start, end: last.end, number: true, emphasis: span.find((s) => s.emphasis)?.emphasis ?? last.emphasis });
          i = end - 1;
          continue;
        }
      }
    }
    merged.push(w);
  }
  let sentenceStart = true;
  return merged.map((w, i) => {
    let text = w.w.replace(/^["'“‘(\[]+/, '');
    const end = SENT_END.test(text) || (i + 1 < merged.length && merged[i + 1].start - w.end > 0.6);
    const comma = CLAUSE_P.test(text);
    const q = /[?!]+["'”’)\]]*$/.exec(text)?.[0]?.replace(/["'”’)\]]/g, '') ?? '';
    if (style.punctuation === 'strip') text = text.replace(/[.,;:…"'”’)\]—–-]+$/u, '').replace(/[?!]+$/, '') + q;
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (style.case === 'upper') text = text.toUpperCase();
    else {
      if (brand.has(key)) text = text.replace(/[\p{L}\p{N}]+/u, brand.get(key));
      if (style.case === 'sentence' && sentenceStart) text = text.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
      if (/^i$/i.test(key)) text = text.replace(/^i/, 'I');
    }
    const number = w.number || /\d/.test(text);
    const name = !sentenceStart && /^\p{Lu}\p{Ll}/u.test(w.w);
    sentenceStart = end;
    return { ...w, w: text || w.w, lang: isDevanagari(text) ? 'hi' : 'latin', sentenceEnd: end, comma, number, name: name || brand.has(key) };
  }).filter((w) => w.w.trim());
}

// ---------------------------------------------------------------- chunking
const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'some', 'any', 'every', 'each', 'no', 'to', 'of', 'very', 'more', 'most', 'is', 'are', 'was', 'were', 'be', 'will', 'can', 'not', "don't", "can't", 'ek', 'ye', 'wo', 'yeh', 'woh']);
const BEFORE_BREAK = new Set(['and', 'but', 'or', 'so', 'because', 'if', 'when', 'while', 'which', 'that', 'who', 'where', 'then', 'with', 'for', 'from', 'in', 'on', 'at', 'by', 'about', 'into', 'over', 'after', 'before', 'like', 'than', 'until', 'without', 'aur', 'lekin', 'par', 'toh', 'ki', 'ke', 'ko', 'se', 'mein']);
const PREPS = new Set(['of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'into', 'about']);

/** Cost of a chunk/line break right after word k (lower is better; >= 50 forbidden). */
export function breakCost(words, k) {
  const w = words[k];
  const next = words[k + 1];
  if (!next) return -10;
  const t = bare(w.w);
  const n = bare(next.w);
  let c = 0;
  if (w.sentenceEnd) c -= 12;
  const gap = next.start - w.end;
  if (gap > 0.15) c -= 8 + Math.min(4, gap * 4);
  if (w.comma) c -= 6;
  if (BEFORE_BREAK.has(n)) c -= 2.5;
  const joined = gap < 0.15 && !w.comma && !w.sentenceEnd; // "this" before a pause is a pronoun, not a determiner
  if (joined && (DETERMINERS.has(t) || PREPS.has(t))) c += 14; // never "the | thing"
  if (joined && [...t].length === 1) c += 16; // never a 1-letter word at a line end
  if ((w.number || /\d/.test(t)) && (SCALES.has(n) || UNITS.has(n) || /^%/.test(next.w))) c += 60; // "3 | million" ✗
  if (/^[$₹]$/.test(w.w)) c += 60;
  return c;
}
const hard = (words, k) => words[k].sentenceEnd || (words[k + 1] && words[k + 1].start - words[k].end > 0.5);

/** Splits chunk words into ≤ maxLines lines of ≤ maxChars, balanced, at the cheapest syntactic break. */
export function splitLines(words, maxChars, maxLines) {
  const len = (a) => a.map((w) => [...w.w].length).reduce((s, n) => s + n, 0) + Math.max(0, a.length - 1);
  if (len(words) <= maxChars || words.length < 2) return [words.length];
  if (maxLines < 2) return null;
  let best = null;
  for (let k = 0; k < words.length - 1; k++) {
    const a = words.slice(0, k + 1);
    const b = words.slice(k + 1);
    if (len(a) > maxChars || len(b) > maxChars) continue;
    // balanced, slightly bottom-heavy (subtitle pyramid), cheap syntactic break
    const cost = Math.abs(len(a) - len(b)) * 0.4 + (len(a) > len(b) ? 1 : 0) + breakCost(words, k) * 0.5;
    if (!best || cost < best.cost) best = { cost, lines: [a.length, b.length] };
  }
  return best?.lines ?? null;
}

/**
 * Groups words into on-screen chunks by dynamic programming over break
 * costs: hard breaks at sentence ends and long pauses, preferred breaks at
 * punctuation and pauses > 0.15 s, then before conjunctions/prepositions;
 * no "the | thing", no 1-letter word at a line end, numbers stay with units.
 */
export function chunkWords(words, layout) {
  const n = words.length;
  if (!n) return [];
  const target = Math.max(1, layout.max_words <= 3 ? layout.max_words - 0.4 : layout.max_words * 0.75);
  const best = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(-1);
  const lines = new Array(n + 1);
  best[0] = 0;
  for (let i = 1; i <= n; i++) {
    // one word over the limit is allowed (at a cost) when it is the only way to avoid a forbidden break
    for (let j = i - 1; j >= Math.max(0, i - layout.max_words - 1); j--) {
      let inside = false;
      for (let k = j; k < i - 1; k++) if (hard(words, k)) inside = true;
      if (inside) break;
      const ws = words.slice(j, i);
      const split = splitLines(ws, layout.max_chars, layout.max_lines);
      if (!split && ws.length > 1) continue;
      const size = ws.length;
      if (size > layout.max_words && !(split && split.length === 1 && ws.length > 1)) continue;
      let cost = best[j] + 1.4 * (target - size) ** 2 + (i < n ? breakCost(words, i - 1) : 0) + (size > layout.max_words ? 9 : 0);
      if (size === 1 && [...ws[0].w].length < 4 && i < n && !hard(words, i - 1)) cost += 3;
      const dur = ws.at(-1).end - ws[0].start;
      if (dur > (layout.max_lines > 1 || layout.max_words > 3 ? 5 : 2.4)) cost += 6;
      if (split && split.length > 1) cost += 0.5;
      // the last word of a chunk must stay readable (≥ 0.18 s before the next chunk replaces it)
      if (i < n && words[i].start - ws.at(-1).start < 0.18) cost += 7;
      if (cost < best[i]) {
        best[i] = cost;
        from[i] = j;
        lines[i] = split ?? [1];
      }
    }
  }
  const chunks = [];
  for (let i = n; i > 0; i = from[i]) {
    if (from[i] < 0) throw new Error('caption chunking failed');
    chunks.unshift({ words: words.slice(from[i], i), lines: lines[i] });
  }
  return chunks;
}

// ---------------------------------------------------------------- timing
const q = (t, fps) => Math.round(t * fps) / fps;
/**
 * Frame-exact timing: chunks start one frame before their first onset and run
 * to the next chunk when the gap is short, else linger into the silence up to
 * the minimum duration (and the read-speed floor); never overlap. Each word's
 * highlight starts at its onset − 1 frame and ends at the next word's onset.
 */
export function timeChunks(chunks, { fps, layout, maxCps = Infinity, total = Infinity }) {
  const frame = 1 / fps;
  const out = chunks.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) }));
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const prevStart = i ? out[i - 1].start + frame : 0;
    c.start = Math.max(prevStart, q(Math.max(0, c.words[0].start - frame), fps));
  }
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const last = c.words.at(-1).end;
    const chars = c.words.map((w) => [...w.w].length).reduce((a, b) => a + b, 0) + c.words.length - 1;
    const floor = Math.max(layout.min_dur, Number.isFinite(maxCps) ? chars / maxCps : 0);
    const next = out[i + 1]?.start ?? Math.min(total, Math.max(last + 2, c.start + floor));
    let end = next - last <= 0.6 ? next : Math.max(last + 0.12, c.start + floor);
    end = Math.min(end, next);
    if (end - c.start < floor) end = Math.min(next, c.start + floor);
    c.end = Math.max(c.start + frame, q(end, fps));
    if (out[i + 1] && c.end > out[i + 1].start) c.end = out[i + 1].start;
    c.words.forEach((w, k) => {
      w.at = Math.min(c.end - frame, Math.max(c.start, q(w.start - frame, fps)));
    });
    for (let k = 1; k < c.words.length; k++) if (c.words[k].at < c.words[k - 1].at) c.words[k].at = c.words[k - 1].at;
    c.words.forEach((w, k) => {
      w.until = k + 1 < c.words.length ? c.words[k + 1].at : c.end;
    });
  }
  return out.filter((c) => c.end > c.start);
}

// ---------------------------------------------------------------- keyword accent
const STOP = new Set([...DETERMINERS, ...BEFORE_BREAK, 'i', 'you', 'we', 'they', 'he', 'she', 'it', 'me', 'us', 'them', 'just', 'really', 'have', 'has', 'had', 'do', 'does', 'did', 'going', 'gonna', 'get', 'got', 'what', 'how', 'why', 'all', 'one', 'there', 'here', 'now', 'also', 'actually', 'basically', 'thing', 'things', 'want', 'know', 'think', 'make', 'hai', 'hain', 'tha', 'thi', 'nahi', 'kya', 'bhi', 'main', 'hum', 'aap', 'tum']);
/**
 * At most one accented word per chunk, from (in order) the judgment's
 * emphasis words, numbers and names, aiming at the style's ratio of chunks
 * (default 20–35 %); content words fill up to the floor.
 */
export function accentChunks(chunks, style, { emphasis = [] } = {}) {
  const rule = style.accent ?? {};
  if (rule.enabled === false) return chunks.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w, accent: false })) }));
  const [lo, hi] = rule.ratio ?? [0.2, 0.35];
  const emph = new Set(emphasis.map((e) => bare(e.word ?? e)).filter(Boolean));
  const scored = chunks.map((c, ci) => {
    let best = null;
    c.words.forEach((w, wi) => {
      const b = bare(w.w);
      let s = 0;
      if (w.emphasis || emph.has(b)) s = 3;
      else if (rule.numbers !== false && (w.number || /\d/.test(w.w))) s = 2.5;
      else if (rule.names !== false && w.name) s = 2;
      else if (!STOP.has(b) && [...b].length >= 5) s = 0.5 + Math.min(0.4, [...b].length / 25);
      if (s && (!best || s > best.s)) best = { s, wi, ci };
    });
    return best;
  });
  const n = chunks.length;
  const strong = scored.filter((x) => x && x.s >= 2).sort((a, b) => b.s - a.s);
  const maxN = Math.max(n ? 1 : 0, Math.floor(n * hi));
  const minN = Math.ceil(n * lo);
  const pick = new Set(strong.slice(0, maxN).map((x) => `${x.ci}`));
  if (pick.size < minN)
    for (const x of scored.filter((y) => y && y.s < 2).sort((a, b) => b.s - a.s)) {
      if (pick.size >= minN) break;
      // no two content accents in a row
      if (pick.has(`${x.ci - 1}`)) continue;
      pick.add(`${x.ci}`);
    }
  return chunks.map((c, ci) => ({ ...c, words: c.words.map((w, wi) => ({ ...w, accent: pick.has(`${ci}`) && scored[ci]?.wi === wi })) }));
}

// ---------------------------------------------------------------- geometry
/** Platform safe area in canvas pixels. Shorts/reels/tiktok: top 12 %, bottom 22 %, right 15 %; 16:9: 90 % title-safe. */
export function safeArea(canvas) {
  const { w, h } = canvas;
  if (h > w) return { x0: 0.06 * w, x1: 0.85 * w, y0: 0.12 * h, y1: 0.78 * h, cx: 0.5 * w, maxW: 0.7 * w, vertical: true };
  return { x0: 0.05 * w, x1: 0.95 * w, y0: 0.05 * h, y1: 0.95 * h, cx: 0.5 * w, maxW: 0.86 * w, vertical: false };
}
/** Pixel font size of a style on a canvas. */
export function fontSize(style, canvas) {
  const wide = canvas.w > canvas.h * 1.2;
  const square = !wide && canvas.w >= canvas.h * 0.85;
  const f = wide ? style.size_wide ?? style.size : square ? ((style.size_wide ?? style.size) + style.size) / 2 : style.size;
  return f * canvas.h;
}
export const layoutFor = (style, canvas) => (canvas.w > canvas.h * 1.2 ? style.layout.wide : style.layout.shorts);

const metricsCache = new Map();
function faceMetrics(style, lang) {
  const font = lang === 'hi' && style.font_devanagari ? style.font_devanagari : style.font;
  if (!metricsCache.has(font.file)) metricsCache.set(font.file, bundledMetrics(font.file));
  return { font, m: metricsCache.get(font.file) };
}
/** Width of a word in px at a size (bundled font advances; 0.62 em fallback). */
export function wordWidth(style, w, size) {
  const lang = w.lang ?? (isDevanagari(w.w) ? 'hi' : 'latin');
  const { m } = faceMetrics(style, lang);
  const text = style.case === 'upper' ? w.w.toUpperCase() : w.w;
  const sp = (style.letter_spacing ?? 0) * size * 10;
  return m ? textWidth(m, text, size, { spacing: sp }) * (lang === 'hi' ? 0.9 : 1) : [...text].length * size * 0.62;
}
/** Line layout of a chunk: per-line widths and per-word x offsets from the line's left edge. */
export function measureChunk(style, chunk, size) {
  const space = (() => {
    const { m } = faceMetrics(style, 'latin');
    return m ? textWidth(m, ' ', size) : size * 0.28;
  })();
  const lines = [];
  let k = 0;
  for (const n of chunk.lines ?? [chunk.words.length]) {
    const ws = chunk.words.slice(k, k + n);
    let x = 0;
    const words = ws.map((w, i) => {
      const width = wordWidth(style, w, size);
      const r = { index: k + i, x, width };
      x += width + (i + 1 < ws.length ? space : 0);
      return r;
    });
    lines.push({ width: x, words });
    k += n;
  }
  const { m } = faceMetrics(style, 'latin');
  const [asc, desc] = m ? lineBox(m, size) : [size * 0.8, size * 0.2];
  const lineH = (asc + desc) * (style.line_spacing ?? 1);
  return { lines, width: Math.max(...lines.map((l) => l.width)), lineH, height: lineH * lines.length, asc, desc, space };
}

/** Text block box (canvas px) for a chunk at centre y, including outline and box padding. */
export function blockBox(style, chunk, canvas, cy, cx = safeArea(canvas).cx) {
  const size = fontSize(style, canvas) * (chunk.place?.scale ?? 1);
  const mm = measureChunk(style, chunk, size);
  const pad = style.box ? [style.box.pad_x * size, style.box.pad_y * size] : [0, 0];
  const bord = (style.outline ?? 0) * canvas.w * (style.word_fx?.outer_scale ?? 1) * (chunk.place?.scale ?? 1);
  const w = mm.width + 2 * (pad[0] + bord);
  const h = mm.height + 2 * (pad[1] + bord);
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, w, h, measure: mm, size };
}

// ---------------------------------------------------------------- subject boxes → canvas
/**
 * Subject (head/face) box on the canvas at output time t from the Phase 4
 * head tracks (camera-probe motion heuristic or SAM cache), mapped through the
 * A-roll clip's camera crop. null when nothing measured shows (b-roll on top,
 * no track) — the frame-centre guess is not treated as a face.
 */
export function subjectBoxAt(edl, ctx, t) {
  const track = arollTrack(edl);
  if (!track) return null;
  const covered = edl.video.some((tr) => tr !== track && tr.clips.some((c) => t >= c.at && t < c.at + clipLen(c) && edl.sources.find((s) => s.id === c.src)?.kind !== 'audio' && !(c.opacity < 0.5)));
  if (covered) return null;
  const clip = track.clips.find((c) => t >= c.at - 1e-6 && t < c.at + clipLen(c) - 1e-6);
  if (!clip) return null;
  const source = edl.sources.find((s) => s.id === clip.src);
  const head = ctx.heads?.[npath(source?.path)];
  if (!head || !source) return null;
  const local = t - clip.at;
  const h = headAt(head, clip.in + local * (clip.speed ?? 1));
  if (!h || h.source === 'centre') return null;
  const geom = coverGeometry(source, edl.canvas, clip.fit);
  const rect = cameraRect(clipCameraAt(clip, geom)(local), geom, edl.canvas);
  const sx = edl.canvas.w / rect[2];
  const sy = edl.canvas.h / rect[3];
  const hh = (h.chin - h.top) * geom.H;
  const hw = hh * 0.8;
  const cx = h.cx * geom.W;
  const box = { x0: (cx - hw / 2 - rect[0]) * sx, x1: (cx + hw / 2 - rect[0]) * sx, y0: (h.top * geom.H - rect[1]) * sy, y1: (h.chin * geom.H - rect[1]) * sy };
  box.mouthY0 = box.y1 - (box.y1 - box.y0) * 0.36;
  return box;
}
const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Rough boxes of the other graphics (hook titles, callouts, lower thirds) for collision checks. */
export function graphicBoxes(edl) {
  // Phase 6 kit graphics carry their own laid-out box (the progress bar and the screen card are edge treatments, not blockers)
  const kit = edl.overlays
    .filter((o) => o.kind === 'graphic' && o.props?.safe_box && !['progress', 'screen_zoom'].includes(o.props.element))
    .map((o) => ({ id: o.id, kind: o.props.element, at: o.at, end: o.at + o.dur, ...o.props.safe_box }));
  return edl.overlays
    .filter((o) => o.props?.engine !== CAPTION_ENGINE && ['hook_title', 'callout', 'lower_third', 'text_behind', 'image'].includes(o.kind))
    .map((o) => {
      const p = o.props ?? {};
      const scale = edl.canvas.w / (p.reference?.w ?? edl.canvas.w);
      const cx = edl.canvas.w * (p.x ?? 0.5);
      const cy = edl.canvas.h * (p.y ?? 0.5);
      let w;
      let h;
      if (p.primitive) {
        w = p.width * scale;
        h = p.height * scale;
      } else if (o.kind === 'image') {
        w = (p.width ?? edl.canvas.w * 0.4) * scale;
        h = (p.height ?? edl.canvas.h * 0.3) * scale;
      } else {
        const size = (p.size ?? 48) * scale;
        const lines = String(p.text ?? '').split('\n');
        w = Math.min(edl.canvas.w, Math.max(...lines.map((l) => l.length)) * size * 0.6);
        h = lines.length * size * 1.25;
      }
      return { id: o.id, kind: o.kind, at: o.at, end: o.at + o.dur, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
    })
    .concat(kit);
}

/**
 * Per-chunk placement (never mid-chunk): candidate centre lines by style
 * position, first one that keeps the block in the safe area, off the face and
 * the mouth and clear of other graphics; keeps the previous position when it
 * still works. A chunk no candidate fits under a graphic is hidden for the
 * graphic's duration (the longest visible remainder survives).
 */
export function placeChunks(chunks, style, { edl, canvas = edl?.canvas, ctx = {}, faceAt } = {}) {
  const safe = safeArea(canvas);
  const graphics = edl ? graphicBoxes(edl) : [];
  const face = faceAt ?? ((t) => (edl ? subjectBoxAt(edl, ctx, t) : null));
  const out = [];
  let prevY = null;
  for (const c0 of chunks) {
    const c = { ...c0, place: { ...(c0.place ?? {}) } };
    const size = fontSize(style, canvas);
    const mm = measureChunk(style, c, size);
    c.place.scale = Math.max(0.55, Math.min(1, safe.maxW / Math.max(1, mm.width + 2 * (style.outline ?? 0) * canvas.w + (style.box ? 2 * style.box.pad_x * size : 0))));
    const probe = blockBox(style, c, canvas, 0);
    const halfH = probe.h / 2;
    const ts = [c.start, (c.start + c.end) / 2, Math.max(c.start, c.end - 0.04)];
    const faces = ts.map(face).filter(Boolean);
    const f = faces.length ? { x0: Math.min(...faces.map((b) => b.x0)), x1: Math.max(...faces.map((b) => b.x1)), y0: Math.min(...faces.map((b) => b.y0)), y1: Math.max(...faces.map((b) => b.y1)), mouthY0: Math.min(...faces.map((b) => b.mouthY0)) } : null;
    const clampY = (y) => Math.max(safe.y0 + halfH, Math.min(safe.y1 - halfH, y));
    const lowerY = clampY(safe.y1 - halfH - canvas.h * 0.01);
    const upperY = clampY(safe.y0 + halfH + canvas.h * 0.01);
    const chinY = f ? clampY(f.y1 + canvas.h * 0.03 + halfH) : null;
    const middleY = clampY(safe.vertical ? canvas.h * 0.64 : canvas.h * 0.8);
    let cands;
    switch (style.position) {
      case 'top':
        cands = [['top', upperY], ['lower', lowerY]];
        break;
      case 'middle':
        cands = [['middle', clampY(canvas.h * 0.5)], ['lower', lowerY], ['top', upperY]];
        break;
      case 'lower-third':
        cands = [['lower-third', clampY(canvas.h * (safe.vertical ? 0.7 : 0.78))], ['top', upperY]];
        break;
      case 'bottom':
        cands = [['bottom', lowerY], ['top', upperY]];
        break;
      default:
        cands = safe.vertical ? [...(chinY != null ? [['below-chin', chinY]] : [['middle', middleY]]), ['lower', lowerY], ['top', upperY]] : [['bottom', lowerY], ['top', upperY]];
    }
    if (prevY != null && !cands.some(([, y]) => Math.abs(y - prevY) < 1)) cands.splice(1, 0, ['previous', prevY]);
    const blockers = graphics.filter((g) => g.at < c.end && g.end > c.start);
    const score = (y) => {
      const b = { x0: safe.cx - probe.w / 2, x1: safe.cx + probe.w / 2, y0: y - halfH, y1: y + halfH };
      const area = Math.max(1, probe.w * probe.h);
      const faceHit = f ? overlapArea(b, f) / area : 0;
      const mouth = f ? overlapArea(b, { ...f, y0: f.mouthY0 }) > 0 : false;
      const gHit = blockers.filter((g) => overlapArea(b, g) > 0);
      return { y, faceHit, mouth, gHit };
    };
    const scored = cands.map(([name, y]) => ({ name, ...score(y) }));
    // stay put when the previous position is still clean (no jumping between chunks)
    const prev = prevY != null ? scored.find((s) => Math.abs(s.y - prevY) < 1 && s.faceHit < 0.02 && !s.mouth && !s.gHit.length) : null;
    let pick = prev ?? scored.find((s) => s.faceHit < 0.02 && !s.mouth && !s.gHit.length);
    if (!pick) pick = scored.filter((s) => !s.mouth && !s.gHit.length).sort((a, b) => a.faceHit - b.faceHit)[0];
    if (!pick) {
      // every spot collides with a graphic or the mouth: yield for the graphic's duration
      const clean = scored.filter((s) => !s.mouth).sort((a, b) => a.faceHit - b.faceHit)[0] ?? scored[0];
      pick = clean;
      const busy = clean.gHit.map((g) => [g.at, g.end]);
      if (busy.length) {
        let segs = [[c.start, c.end]];
        for (const [a, b] of busy) segs = segs.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.max(s, a)], [Math.min(e, b), e]].filter(([x, y]) => y - x > 1e-6)));
        const keep = segs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
        if (!keep || keep[1] - keep[0] < 0.25) c.hidden = 'graphic';
        else {
          c.visible = keep;
          c.yielded = clean.gHit.map((g) => g.id);
        }
      }
    }
    c.place = { ...c.place, cx: safe.cx, cy: pick.y, at: pick.name, face_overlap: +pick.faceHit.toFixed(4), ...(pick.mouth ? { mouth: true } : {}) };
    prevY = c.hidden ? prevY : pick.y;
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- build + EDL
const r3 = (n) => +Number(n).toFixed(3);
/**
 * Full caption build for an EDL: words → chunks with timing, accent and
 * placement → caption_word_group overlays. Returns {overlays, words, stats}.
 */
export function buildCaptions(edl, { style: styleId = 'kimo', ctx = {}, hints = [], emphasis } = {}) {
  const total = edl.video.flatMap((t) => t.clips).reduce((m, c) => Math.max(m, c.at + clipLen(c)), 0);
  return captionOverlays(outputWords(edl, ctx), { style: styleId, canvas: edl.canvas, fps: rate(edl.canvas.fps), total, hints, emphasis, edl, ctx });
}
/** Output-timeline words → caption overlays for a canvas (also used by the bench previews with a synthetic face). */
export function captionOverlays(raw, { style: styleId = 'kimo', canvas, fps, total = Infinity, hints = [], emphasis = [], edl = null, ctx = {}, faceAt } = {}) {
  const style = captionStyle(styleId);
  const layout = layoutFor(style, canvas);
  const words = normalizeWords(raw, style, { hints });
  let chunks = chunkWords(words, layout);
  chunks = timeChunks(chunks, { fps, layout, maxCps: style.max_cps ?? (canvas.w > canvas.h ? 17 : Infinity), total });
  chunks = accentChunks(chunks, style, { emphasis });
  chunks = placeChunks(chunks, style, { edl, canvas, ctx, faceAt });
  const overlays = chunks.map((c, i) => ({
    id: `cap${String(i + 1).padStart(3, '0')}`,
    kind: 'caption_word_group',
    at: r3(c.start),
    dur: r3(c.end - c.start),
    track: 'captions',
    props: {
      engine: CAPTION_ENGINE,
      style: style.id,
      text: c.words.map((w) => w.w).join(' '),
      lines: c.lines,
      words: c.words.map((w) => ({ w: w.w, at: r3(w.at), until: r3(w.until), start: r3(w.start), end: r3(w.end), ...(w.accent ? { accent: true } : {}), ...(w.lang === 'hi' ? { lang: 'hi' } : {}) })),
      place: { cx: r3(c.place.cx), cy: r3(c.place.cy), scale: r3(c.place.scale), at: c.place.at, face_overlap: c.place.face_overlap, ...(c.place.mouth ? { mouth: true } : {}) },
      ...(c.hidden ? { hidden: c.hidden } : {}),
      ...(c.visible ? { visible: c.visible.map(r3), yielded: c.yielded } : {}),
      index: i,
    },
  }));
  return { overlays, words: words.map((w) => [w.w, r3(w.start), r3(w.end)]), stats: captionStats(overlays, style, canvas, fps) };
}

/** Bench/QA numbers: min on-screen per word, read speed, safe-area and face checks, accent share. */
export function captionStats(overlays, style, canvas, fps = 30) {
  const caps = overlays.filter((o) => o.props?.engine === CAPTION_ENGINE && !o.props.hidden);
  if (!caps.length) return { chunks: 0 };
  const safe = safeArea(canvas);
  let minWord = Infinity;
  let maxCps = 0;
  let unsafe = 0;
  let faceArea = 0;
  for (const o of caps) {
    const end = o.at + o.dur;
    for (const w of o.props.words) minWord = Math.min(minWord, end - Math.max(o.at, w.at));
    const chars = o.props.text.length;
    maxCps = Math.max(maxCps, chars / Math.max(1 / fps, o.dur));
    const b = blockBox(captionStyle(o.props.style), { words: o.props.words, lines: o.props.lines, place: o.props.place }, canvas, o.props.place.cy, o.props.place.cx);
    if (b.y0 < safe.y0 - 1 || b.y1 > safe.y1 + 1 || b.x0 < safe.x0 - 1 || b.x1 > safe.x1 + 1) unsafe++;
    faceArea += o.props.place.face_overlap ?? 0;
  }
  return {
    chunks: caps.length,
    hidden: overlays.filter((o) => o.props?.hidden).length,
    caption_min_word_s: +minWord.toFixed(3),
    caption_safe: unsafe === 0,
    unsafe_chunks: unsafe,
    caption_face_overlap: +(faceArea / caps.length).toFixed(4),
    max_cps: +maxCps.toFixed(1),
    accent_share: +(caps.filter((o) => o.props.words.some((w) => w.accent)).length / caps.length).toFixed(3),
    mouth_hits: caps.filter((o) => o.props.place.mouth).length,
  };
}

/**
 * Puts captions on an EDL: drops the planner's own caption groups and any
 * previous kimo captions (user-edited chunks are kept and win where they
 * overlap), appends the new chunks after every other overlay so they render in
 * the final text pass. Mutates and returns edl.
 */
export function applyCaptions(edl, config, ctx = {}) {
  const previous = [...edl.overlays.filter((o) => o.props?.engine === CAPTION_ENGINE), ...(config.keep ?? [])];
  // user-edited chunks (from this EDL or the saved one on a follow-up) survive a rebuild
  const edited = previous.filter((o, i) => o.props?.edited && previous.findIndex((x) => x.id === o.id) === i).map((o) => structuredClone(o));
  edl.overlays = edl.overlays.filter((o) => o.kind !== 'caption_word_group');
  if (config.enabled === false) {
    delete edl.captions;
    return edl;
  }
  const built = buildCaptions(edl, { style: config.style, ctx, hints: config.hints ?? [], emphasis: config.emphasis });
  // a number pop already shows this word big: the caption keeps it without the accent (no double)
  const plain = edl.graphics?.no_accent ?? [];
  if (plain.length)
    for (const o of built.overlays)
      for (const w of o.props.words) if (w.accent && plain.some((n) => w.at < n.end + 0.05 && w.until > n.at - 0.05 && /\d/.test(w.w))) delete w.accent;
  // Phase 7: words an explainer visual already shows lose the caption accent (one emphasis channel at a time)
  const quiet = edl.explain?.no_accent ?? [];
  if (quiet.length)
    for (const o of built.overlays)
      for (const w of o.props.words) if (w.accent && quiet.some((n) => w.at < n.end + 0.02 && w.until > n.at - 0.02 && Math.abs(w.at - n.at) < 0.15)) delete w.accent;
  const kept = built.overlays.filter((o) => !edited.some((e) => e.at < o.at + o.dur && e.at + e.dur > o.at));
  const overlays = [...kept, ...edited].sort((a, b) => a.at - b.at);
  const ids = new Set(edl.overlays.map((o) => o.id));
  for (const o of overlays) {
    let id = o.id;
    for (let k = 2; ids.has(id); k++) id = `${o.id}-${k}`;
    ids.add(id);
    o.id = id;
  }
  edl.overlays.push(...overlays);
  edl.captions = { version: CAPTIONS_VERSION, engine: CAPTION_ENGINE, style: captionStyle(config.style).id, hook_style: config.hook_style ?? null, hints: config.hints ?? [], words: built.words, stats: captionStats(edl.overlays, captionStyle(config.style), edl.canvas, rate(edl.canvas.fps)) };
  return edl;
}

/** Note hints: brand/proper-noun spellings the user typed (iPhone, OpenAI, kimo). */
export function noteHints(note) {
  return [...new Set((String(note ?? '').match(/\b[\p{L}][\p{L}\p{N}]*\b/gu) ?? []).filter((w) => /\p{Lu}/u.test(w.slice(1)) || (/^\p{Lu}/u.test(w) && w.length > 2)))].slice(0, 40);
}

export { covers };
export const _test = { numberAt, hard };
export { captionBounds, editCaptionChunk, snapTo } from './caption-edits.mjs';
