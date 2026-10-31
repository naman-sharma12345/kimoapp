// Validation and editorial taste for explainer beats (Phase 7.1 / 7.5b),
// enforced in code whatever the model proposed: word indices exist and are
// ordered, no overlapping beats, ≤ 6 words per item, no invented numbers,
// places or names, importance, per-template density and breathing room,
// humour only where the speaker jokes (never in serious sections), meme and
// emoji caps, kind variety, per-kind toggles and the licence-safe switch.
// Node only.
import { spokenNumberSet, clean, findNumbers } from './detect.mjs';
import { FAMILIES, ASSET_KINDS } from './families/index.mjs';
import { METAPHORS } from './families/metaphor.mjs';
import { MEME_FORMATS } from './families/meme.mjs';

export const KINDS = [...FAMILIES, ...ASSET_KINDS];
export const HUMOUR_KINDS = new Set(['meme', 'reaction_gif', 'sound_gag']);
/** Home per-kind toggles → kinds they switch. */
export const TOGGLES = {
  diagrams: FAMILIES.filter((f) => f !== 'image_asset'),
  images: ['photo', 'image_asset'],
  memes: ['meme', 'reaction_gif'],
  emoji: ['emoji'],
  screenshots: ['screenshot', 'tweet_card', 'news_card'],
  broll: ['broll'],
  gags: ['sound_gag'],
  ai_images: ['ai_image'],
};
export const DEFAULT_TOGGLES = { diagrams: true, images: true, memes: true, emoji: true, screenshots: true, broll: true, gags: true, ai_images: false };
export const DENSITY = { off: 0, light: 0.5, normal: 1, rich: 1.6 };

/** Seconds per beat for a template on a canvas (shorts 8 s, YouTube 15 s, explainer/tutorial 6 s). */
export function beatSpacing(template, canvas) {
  if (template === 'explainer' || template === 'tutorial') return 6;
  return canvas && canvas.h > canvas.w ? 8 : 15;
}
export const breathing = (canvas) => (canvas && canvas.h > canvas.w ? 2 : 4);
export const memeSpacing = (canvas) => (canvas && canvas.h > canvas.w ? 30 : 60);

const words6 = (s, n = 6) => String(s ?? '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');
const intIdx = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : null);

/** LLM / cue beat → the internal shape (items with say_word_idx). */
export function normalizeBeat(raw, i = 0) {
  const b = { ...raw };
  b.kind = String(raw.kind ?? raw.family ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (b.kind === 'logo' || b.kind === 'icon') b.kind = 'logo_or_icon';
  if (b.kind === 'image') b.kind = 'image_asset';
  if (b.kind === 'gif') b.kind = 'reaction_gif';
  b.id = String(raw.id ?? `b${i + 1}`).slice(0, 24);
  b.importance = Number.isFinite(Number(raw.importance)) ? Number(raw.importance) : 0.6;
  b.say_word_idx = raw.say_word_idx ?? raw.say ?? raw.items?.[0]?.say_word_idx ?? raw.start_word_idx;
  b.start_word_idx = raw.start_word_idx ?? b.say_word_idx;
  b.end_word_idx = raw.end_word_idx ?? raw.items?.at?.(-1)?.say_word_idx ?? b.say_word_idx;
  let items = Array.isArray(raw.items) ? raw.items.map((it) => (typeof it === 'string' ? { text: it } : { ...it, say_word_idx: it.say_word_idx ?? it.i })) : [];
  if (b.kind === 'flow' && Array.isArray(raw.steps)) items = raw.steps.map((s, k) => ({ text: typeof s === 'string' ? s : s.text, say_word_idx: (typeof s === 'object' ? s.say_word_idx ?? s.i : null) ?? raw.step_word_idx?.[k] }));
  if (b.kind === 'map' && Array.isArray(raw.places)) items = raw.places.map((p, k) => ({ text: typeof p === 'string' ? p : p.name, say_word_idx: (typeof p === 'object' ? p.say_word_idx ?? p.i : null) ?? raw.place_word_idx?.[k] ?? (k === 0 ? b.say_word_idx : null) }));
  if (b.kind === 'timeline' && items.length) items = items.map((it) => ({ ...it, when: String(it.when ?? '').slice(0, 12) }));
  if (b.kind === 'compare') for (const side of ['left', 'right']) if (raw[side]) b[side] = { title: raw[side].title ?? '', say_word_idx: raw[side].say_word_idx ?? raw[side].i, points: (raw[side].points ?? []).map((p) => (typeof p === 'string' ? { text: p } : { ...p, say_word_idx: p.say_word_idx ?? p.i })) };
  b.items = items;
  b.source ??= 'llm';
  return b;
}

/** Numbers a beat would put on screen. */
function beatNumbers(b) {
  const texts = [b.title, b.label, b.term, b.definition, b.question, b.quote, b.keyword, b.meme?.top, b.meme?.bottom, ...b.items.map((i) => i.text), ...['left', 'right'].flatMap((s) => [b[s]?.title, ...(b[s]?.points ?? []).map((p) => p.text)])].filter(Boolean).join(' ');
  const vals = [];
  if (b.value != null && b.value !== '') vals.push(Number(b.value));
  for (const it of b.items) {
    if (it.value != null && it.value !== '') vals.push(Number(it.value));
    if (it.when && /\d/.test(it.when)) vals.push(Number(String(it.when).replace(/\D/g, '')));
  }
  // digits written inside text ("10 min", "3x") and number words found by the same parser as the speech
  for (const n of findNumbers(texts.split(/\s+/).map((w) => ({ w, start: 0, end: 0 })))) vals.push(n.value);
  return vals.filter((v) => Number.isFinite(v));
}
const windowWords = (words, a, z, pad = 30) => words.slice(Math.max(0, a - pad), Math.min(words.length, z + pad + 1));
const said = (words, a, z, phrase) => {
  const hay = ` ${windowWords(words, a, z, 60).map((w) => clean(w.w)).join(' ')} `;
  const toks = String(phrase ?? '').split(/\s+/).map(clean).filter((t) => t.length > 1);
  return toks.length > 0 && toks.every((t) => hay.includes(` ${t} `) || hay.includes(` ${t}s `) || hay.includes(` ${t}'s `));
};

/**
 * Validates and edits beats. ctx: {words, template, canvas, toggles, density,
 * offline, tone: {humour, serious}, allowMemes, total}. Returns {beats, dropped, trimmed}.
 */
export function validateBeats(rawBeats, ctx) {
  const { words } = ctx;
  const n = words.length;
  const template = ctx.template ?? 'auto';
  const toggles = { ...DEFAULT_TOGGLES, ...(ctx.toggles ?? {}) };
  const densityMul = DENSITY[ctx.density ?? 'normal'] ?? 1;
  const dropped = [];
  const trimmed = [];
  const drop = (b, why) => dropped.push({ id: b.id, kind: b.kind, why });
  const inTone = (list, t) => (list ?? []).some(([a, z]) => t >= a - 0.5 && t <= z);
  const out = [];
  if (densityMul === 0) return { beats: [], dropped: rawBeats.map((b, i) => ({ id: b.id ?? `b${i + 1}`, kind: b.kind, why: 'explainers off' })), trimmed };
  for (const [i, raw] of (Array.isArray(rawBeats) ? rawBeats : []).entries()) {
    const b = normalizeBeat(raw, i);
    if (!KINDS.includes(b.kind)) {
      drop(b, `unknown kind ${b.kind}`);
      continue;
    }
    // per-kind toggles and the licence-safe switch
    const cat = Object.entries(TOGGLES).find(([, kinds]) => kinds.includes(b.kind))?.[0];
    if (cat && !toggles[cat]) {
      drop(b, `${cat} switched off`);
      continue;
    }
    if (ctx.offline && ['photo', 'broll', 'reaction_gif', 'screenshot', 'ai_image'].includes(b.kind) && b.asset_query?.source !== 'library') {
      drop(b, 'offline / licence-safe only');
      continue;
    }
    // indices exist and are ordered
    const s = intIdx(b.start_word_idx, n);
    const say = intIdx(b.say_word_idx, n);
    const e = intIdx(b.end_word_idx, n);
    if (s == null || say == null || e == null || s > say || say > e) {
      drop(b, 'word index out of range or out of order');
      continue;
    }
    let bad = false;
    let last = -1;
    for (const it of b.items) {
      const k = intIdx(it.say_word_idx, n);
      if (k == null || k < last || k < s - 2 || k > e + 2) {
        bad = true;
        break;
      }
      last = k;
    }
    if (bad) {
      drop(b, 'item word index out of range or out of order');
      continue;
    }
    if (['list', 'flow', 'timeline', 'chart'].includes(b.kind) && b.items.length < 2) {
      drop(b, `${b.kind} needs 2+ items said`);
      continue;
    }
    // never invent numbers, places or names
    const spoken = spokenNumberSet(windowWords(words, s, e));
    const invented = beatNumbers(b).filter((v) => !spoken.has(v) && !spoken.has(Math.round(v)) && !(v >= 1 && v <= 10 && b.kind === 'list'));
    if (invented.length && b.source !== 'user') {
      drop(b, `invented number ${invented[0]}`);
      continue;
    }
    // a visual the user asked for by name ("add a map of Delhi at 0:42") is theirs to place
    if (b.kind === 'map' && b.source !== 'user' && !b.items.every((p) => said(words, s, e, p.text))) {
      drop(b, 'place not said');
      continue;
    }
    if ((b.kind === 'name_card' && !said(words, s, e, b.name)) || (b.kind === 'quote' && b.author && !said(words, s, e, b.author))) {
      drop(b, 'name not said');
      continue;
    }
    // ≤ 6 words per item / title, ≤ 12 for definitions, ≤ 8 for meme lines
    const trim = (obj, key, max = 6) => {
      if (obj?.[key] && String(obj[key]).split(/\s+/).filter(Boolean).length > max) {
        obj[key] = words6(obj[key], max);
        trimmed.push(`${b.id}.${key}`);
      }
    };
    trim(b, 'title');
    trim(b, 'label');
    for (const it of b.items) trim(it, 'text');
    for (const side of ['left', 'right']) if (b[side]) {
      trim(b[side], 'title');
      for (const p of b[side].points ?? []) trim(p, 'text');
    }
    trim(b, 'definition', 12);
    if (b.meme) {
      trim(b.meme, 'top', 8);
      trim(b.meme, 'bottom', 8);
      if (!MEME_FORMATS.includes(b.meme.format)) b.meme.format = 'nobody_me';
    }
    if (b.kind === 'icon_metaphor' && !METAPHORS.includes(b.metaphor)) b.metaphor = 'grow-curve';
    // importance
    if (b.importance < 0.5 && template !== 'explainer' && b.source !== 'user') {
      drop(b, `importance ${b.importance} < 0.5`);
      continue;
    }
    // humour only where the speaker jokes, never in serious sections
    const at = words[say].start;
    if (HUMOUR_KINDS.has(b.kind) || (b.kind === 'emoji' && b.emoji === 'laugh')) {
      if (inTone(ctx.tone?.serious, at)) {
        drop(b, 'humour in a serious section');
        continue;
      }
      if (!inTone(ctx.tone?.humour, at) && b.source !== 'user') {
        drop(b, 'humour without a joke, fail or surprise');
        continue;
      }
      if ((template === 'cinematic' || template === 'documentary') && !ctx.allowMemes && b.kind !== 'emoji') {
        drop(b, 'no memes in cinematic stories');
        continue;
      }
    }
    b._t0 = words[s].start;
    b._t1 = words[e].end + 0.45;
    b._at = at;
    out.push(b);
  }
  // greedy by importance under density, overlap and breathing room
  const spacing = beatSpacing(template, ctx.canvas) / densityMul;
  const gap = breathing(ctx.canvas);
  const total = ctx.total ?? (words.at(-1)?.end ?? 0);
  const allowed = Math.max(1, Math.floor(Math.max(total, 1) / spacing + 1e-9));
  const kept = [];
  const order = [...out].sort((a, b) => (b.source === 'user') - (a.source === 'user') || b.importance - a.importance || a._at - b._at);
  for (const b of order) {
    const clash = kept.find((k) => b._t0 < k._t1 + gap && k._t0 < b._t1 + gap);
    if (clash) {
      drop(b, `overlaps ${clash.id} (needs ${gap} s breathing room)`);
      continue;
    }
    if (kept.filter((k) => !['emoji', 'sound_gag'].includes(k.kind)).length >= allowed && !['emoji', 'sound_gag'].includes(b.kind) && b.source !== 'user') {
      drop(b, `density (≤ 1 per ${Math.round(spacing)} s)`);
      continue;
    }
    if (HUMOUR_KINDS.has(b.kind) && b.kind !== 'sound_gag' && kept.some((k) => HUMOUR_KINDS.has(k.kind) && k.kind !== 'sound_gag' && Math.abs(k._at - b._at) < memeSpacing(ctx.canvas))) {
      drop(b, `meme cap (1 per ${memeSpacing(ctx.canvas)} s)`);
      continue;
    }
    if (b.kind === 'emoji' && kept.some((k) => k.kind === 'emoji' && Math.abs(k._at - b._at) < 6)) {
      drop(b, 'emoji cap (1 per 6 s)');
      continue;
    }
    kept.push(b);
  }
  kept.sort((a, b) => a._at - b._at);
  // vary kinds: no two of the same kind in a row unless it's a list
  const varied = [];
  for (const b of kept) {
    const prev = varied.at(-1);
    if (prev && prev.kind === b.kind && b.kind !== 'list' && !['emoji', 'sound_gag'].includes(b.kind) && b.source !== 'user') {
      if (b.importance > prev.importance) {
        varied.pop();
        drop(prev, `same kind as ${b.id} in a row`);
        varied.push(b);
      } else drop(b, `same kind as ${prev.id} in a row`);
      continue;
    }
    varied.push(b);
  }
  return { beats: varied, dropped, trimmed };
}

/** Bench metrics for a beat plan (7.7): text max words, asset variety, humour misfires. */
export function planMetrics(beats, { tone, total } = {}) {
  const counts = {};
  for (const b of beats) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
  const texts = beats.flatMap((b) => [b.title, ...b.items.map((i) => i.text), ...['left', 'right'].flatMap((s) => (b[s]?.points ?? []).map((p) => p.text))]).filter(Boolean);
  return {
    beats: beats.length,
    explain_text_max_words: texts.reduce((m, t) => Math.max(m, String(t).split(/\s+/).filter(Boolean).length), 0),
    asset_variety: beats.length ? Math.max(...Object.values(counts)) / beats.length : 0,
    humour_misfire: beats.filter((b) => HUMOUR_KINDS.has(b.kind) && (tone?.serious ?? []).some(([a, z]) => b._at >= a && b._at <= z)).length,
    explain_density_per_min: total ? Math.round((beats.length * 60 * 100) / total) / 100 : 0,
    by_kind: counts,
  };
}
