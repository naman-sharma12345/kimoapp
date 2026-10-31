// The Cut Planner (Phase 3.2): deterministic, transcript-driven edit decisions.
// Removes dead air and breaths, clean-join fillers, stutters/restarts and
// flubbed retakes; applies the validated LLM judgment (hook cold open, story
// order, drops, kept beats) on top; marks joins that need cover. Pure JS, no I/O.
import { norm, energyAt, nearestZeroCross, FILLERS } from './transcript.mjs';

/** Cut templates: longest pause kept inside speech and the room tone left on each side of a cut. */
export const TEMPLATES = {
  shorts: { name: 'shorts', max_pause: 0.12, pad: 0.04 },
  punchy: { name: 'punchy', max_pause: 0.2, pad: 0.05 },
  calm: { name: 'calm', max_pause: 0.35, pad: 0.08 },
};
const CALM_STYLES = new Set(['documentary', 'cinematic']);
/** Template for a canvas and style: vertical → shorts, documentary/cinematic → calm, else punchy. */
export function templateFor(P, style, override) {
  const base = CALM_STYLES.has(style) ? TEMPLATES.calm : P && P.height > P.width ? TEMPLATES.shorts : TEMPLATES.punchy;
  return { ...base, shorts: Boolean(P && P.height > P.width), ...(override ?? {}) };
}

export const STUTTER_WINDOW = 1.2;
export const RETAKE_WINDOW = 30;
export const RETAKE_SIMILARITY = 0.75;
export const MICRO_JUMP = 0.02; // head moved < 2 % of frame height
const CLEAN_DB = -35;
const KEEP_PAUSE_MAX = 0.7;
const MIXED_MAX_PAUSE = 1.0;
const EMPHATIC = new Set(['very', 'really', 'so', 'no', 'yes', 'ha', 'haha', 'bye', 'that', 'had', 'is', 'go', 'run', 'more', 'too', 'bahut', 'nahi', 'haan', 'chalo', 'jaldi', 'dheere']);
const GREETING = FILLERS.greetings.map((g) => g.split(' ').map(norm));
/** Retention teasers a tutorial editor keeps early ("stick around till the end"). */
export const TEASER = /stick around|stay (un)?til|till the end|until the end|to the end|last one is|end tak|aakhir tak|don'?t skip|wait for (it|the)|best (part|one) is (at the end|last)/i;

const round = (x, d = 3) => +Number(x).toFixed(d);

// ---------------------------------------------------------------- tokens

/** Crude English stemmer so "takes/taking/took" style variants still match across takes. */
export function lemma(token) {
  let t = norm(token).replace(/'s$|’s$/, '');
  if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ied')) t = `${t.slice(0, -3)}y`;
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith('ies')) t = `${t.slice(0, -3)}y`;
  else if (t.length > 3 && t.endsWith('es') && /(ss|sh|ch|x)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}
export function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
/** max(token Levenshtein similarity, Jaccard) on lemmatised tokens. */
export function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const lev = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const jac = inter / new Set([...A, ...B]).size;
  return Math.max(lev, jac);
}
/** An abandoned take: a ≥ 3-token start that the later, longer sentence restarts. */
export function isRestartOf(a, b) {
  if (a.length < 3 || a.length >= b.length) return false;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length >= 0.8;
}

// ---------------------------------------------------------------- word-level marks

/** Stutters and restarts: "the the", "I— I think", "I think I think" → keep the last instance. */
export function findStutters(words) {
  const out = new Set();
  const toks = words.map((w) => norm(w.w));
  const live = (i) => !words[i].filler && toks[i];
  for (let i = 0; i < words.length; i++) {
    if (!live(i) || out.has(i)) continue;
    // a cut-off fragment: "bec- because", "I—"
    if (/[-—–]$/.test(String(words[i].w).trim())) {
      let j = i + 1;
      while (j < words.length && words[j].filler) j++;
      if (j < words.length && words[j].start - words[i].start <= STUTTER_WINDOW && (toks[j].startsWith(toks[i]) || toks[i].length <= 3)) {
        out.add(i);
        continue;
      }
    }
    // n-gram repeated right after itself (n = 3, 2, 1), fillers in between ignored
    for (const n of [3, 2, 1]) {
      const a = [];
      let k = i;
      while (a.length < n && k < words.length) {
        if (live(k)) a.push(k);
        k++;
      }
      if (a.length < n) continue;
      const b = [];
      while (b.length < n && k < words.length) {
        if (live(k)) b.push(k);
        else if (!words[k].filler) break;
        k++;
      }
      if (b.length < n) continue;
      if (!a.every((x, m) => toks[x] === toks[b[m]])) continue;
      if (words[b[0]].start - words[a[0]].start > STUTTER_WINDOW) continue;
      if (n === 1 && EMPHATIC.has(toks[i])) continue;
      for (const x of a) out.add(x);
      break;
    }
  }
  return out;
}

/**
 * Filler runs that can be cut cleanly: energy at both new edges below −35 dBFS
 * or a zero crossing within 5 ms of both. A filler glued to its neighbours
 * (gap < 20 ms on both sides: coarticulation) is never cut, only flagged.
 */
export function fillerCuts(words, { energy, samples, rate = 16000, pad = 0.05 }) {
  const cut = [];
  const flagged = [];
  for (let i = 0; i < words.length; i++) {
    if (!words[i].filler) continue;
    let j = i;
    while (j + 1 < words.length && words[j + 1].filler) j++;
    const p = i - 1;
    const n = j + 1 < words.length ? j + 1 : -1;
    const gapL = p >= 0 ? words[i].start - words[p].end : Infinity;
    const gapR = n >= 0 ? words[n].start - words[j].end : Infinity;
    const run = { from: i, to: j, text: words.slice(i, j + 1).map((w) => w.w).join(' ') };
    if (gapL < 0.02 && gapR < 0.02) flagged.push({ ...run, why: 'coarticulated' });
    else {
      const a = p >= 0 ? words[p].end + Math.min(pad, gapL / 2) : words[i].start;
      const b = n >= 0 ? words[n].start - Math.min(pad, gapR / 2) : words[j].end;
      const quiet = energyAt(energy, a) < CLEAN_DB && energyAt(energy, b) < CLEAN_DB;
      const zc = samples && nearestZeroCross(samples, rate, a, 5) != null && nearestZeroCross(samples, rate, b, 5) != null;
      if (quiet || zc) cut.push(run);
      else flagged.push({ ...run, why: 'no clean join' });
    }
    i = j;
  }
  return { cut, flagged };
}

// ---------------------------------------------------------------- sentences + takes

const isGreeting = (tokens) => GREETING.some((g) => g.every((x, k) => tokens[k] === x));

function sentenceFeatures(t, s, removed) {
  const ws = t.words.slice(s.w0, s.w1 + 1);
  const n = ws.length || 1;
  const disfluent = ws.filter((w, k) => w.filler || removed.get(s.w0 + k) === 'stutter').length;
  const conf = ws.reduce((a, w) => a + (Number.isFinite(w.conf) ? w.conf : 0.5), 0) / n;
  const e = t.energy;
  const thr = (e?.floor ?? -60) + 12;
  let sum = 0;
  let cnt = 0;
  if (e?.db) for (let f = Math.floor(s.start / e.hop); f <= Math.min(e.db.length - 1, Math.ceil(s.end / e.hop)); f++) if (e.db[f] > thr) (sum += e.db[f]), cnt++;
  const p = t.pitch;
  const voiced = [];
  if (p?.hz) for (let f = Math.floor(s.start / p.hop); f <= Math.min(p.hz.length - 1, Math.ceil(s.end / p.hop)); f++) if (p.hz[f] > 0) voiced.push({ t: f * p.hop, st: 12 * Math.log2(p.hz[f] / 100) });
  const mean = voiced.reduce((a, v) => a + v.st, 0) / (voiced.length || 1);
  const pitchVar = voiced.length > 2 ? Math.sqrt(voiced.reduce((a, v) => a + (v.st - mean) ** 2, 0) / voiced.length) : 0;
  const tail = voiced.filter((v) => v.t >= s.end - 0.4);
  let falling = false;
  if (tail.length >= 4) {
    const mt = tail.reduce((a, v) => a + v.t, 0) / tail.length;
    const ms = tail.reduce((a, v) => a + v.st, 0) / tail.length;
    const slope = tail.reduce((a, v) => a + (v.t - mt) * (v.st - ms), 0) / (tail.reduce((a, v) => a + (v.t - mt) ** 2, 0) || 1);
    falling = slope < 0;
  }
  const tokens = ws.filter((w, k) => !w.filler && removed.get(s.w0 + k) !== 'stutter').map((w) => lemma(w.w)).filter(Boolean);
  return {
    tokens,
    fluency: round(Math.max(0, 1 - (0.25 * disfluent) / Math.max(1, n / 4)), 2),
    conf: round(conf, 2),
    loud: cnt ? sum / cnt : -60,
    pitchVar,
    punct: /[.?!।॥]["')\]]*$/.test(ws.at(-1)?.w ?? ''),
    falling,
    greeting: isGreeting(ws.map((w) => norm(w.w))),
    teaser: TEASER.test(ws.map((w) => w.w).join(' ')),
  };
}

/** Groups takes of the same line (similarity ≥ 0.75 or an abandoned restart) within 30 s. */
export function takeGroups(sentences) {
  const parent = sentences.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const restart = new Set();
  for (let a = 0; a < sentences.length; a++)
    for (let b = a + 1; b < sentences.length; b++) {
      const A = sentences[a];
      const B = sentences[b];
      const dist = A.clip === B.clip ? B.start - A.end : B.clip === A.clip + 1 ? A.clipDuration - A.end + B.start : Infinity;
      if (dist > RETAKE_WINDOW) continue;
      const short = Math.min(A.tokens.length, B.tokens.length);
      const sim = short >= 4 ? similarity(A.tokens, B.tokens) : short >= 2 && A.tokens.join(' ') === B.tokens.join(' ') && A.tokens.length >= 3 ? 1 : 0;
      const re = isRestartOf(A.tokens, B.tokens);
      if (sim >= RETAKE_SIMILARITY || re) {
        parent[find(a)] = find(b);
        if (re && sim < RETAKE_SIMILARITY) restart.add(a);
      }
    }
  const groups = new Map();
  sentences.forEach((s, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  return { groups: [...groups.values()].filter((g) => g.length > 1), restart };
}

/** Take score: fluency 35 %, confidence 20 %, energy (loudness + pitch movement) 20 %, completeness 25 %. */
export function scoreTakes(group, sentences, restart) {
  const S = group.map((i) => sentences[i]);
  const ml = S.reduce((a, s) => a + s.loud, 0) / S.length;
  const mp = S.reduce((a, s) => a + s.pitchVar, 0) / S.length;
  const longest = Math.max(...S.map((s) => s.tokens.length), 1);
  return group.map((i, rank) => {
    const s = sentences[i];
    const energy = 0.6 * Math.min(1, Math.max(0, 0.5 + (s.loud - ml) / 6)) + 0.4 * Math.min(1, Math.max(0, 0.5 + (s.pitchVar - mp) / 2));
    const complete = restart.has(i) ? 0 : (s.punct ? 0.5 : 0.2) + (s.falling ? 0.3 : 0.1) + 0.2 * (s.tokens.length / longest);
    const score = 0.35 * s.fluency + 0.2 * s.conf + 0.2 * energy + 0.25 * complete + 0.02 * rank;
    return { i, score: round(score, 3), energy: round(energy, 2), complete: round(complete, 2) };
  });
}

// ---------------------------------------------------------------- the plan

/**
 * Analyse every clip: word marks (filler/stutter), sentences with features,
 * take groups with the best take chosen. This is what the LLM sees.
 * clips: [{src, duration, kind: speech|mixed|broll, transcript}]
 */
export function analyzeClips(clips, template) {
  const sentences = [];
  const marks = [];
  const flagged = [];
  clips.forEach((c, ci) => {
    const t = c.transcript;
    const removed = new Map();
    if (!t || c.kind === 'broll') {
      marks.push(removed);
      return;
    }
    for (const i of findStutters(t.words)) removed.set(i, 'stutter');
    const f = fillerCuts(t.words, { energy: t.energy, samples: t.samples, pad: template.pad });
    for (const r of f.cut) for (let k = r.from; k <= r.to; k++) if (!removed.has(k)) removed.set(k, 'filler');
    for (const r of f.flagged) flagged.push({ src: c.src, text: r.text, at: t.words[r.from].start, why: r.why });
    marks.push(removed);
    for (const s of t.sentences) sentences.push({ id: sentences.length, clip: ci, src: c.src, clipDuration: c.duration, w0: s.w0, w1: s.w1, start: s.start, end: s.end, text: s.text, ...sentenceFeatures(t, s, removed) });
  });
  const { groups, restart } = takeGroups(sentences);
  const takes = [];
  groups.forEach((g, gi) => {
    const scored = scoreTakes(g, sentences, restart);
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    const id = `g${gi + 1}`;
    for (const x of scored) Object.assign(sentences[x.i], { group: id, take_score: x.score, best: x.i === best.i });
    takes.push({ id, sentences: g, best: best.i, scores: scored });
  });
  return { sentences, marks, takes, flagged };
}

/** The sentence list the LLM judgment call reads (no audio). */
export function sentenceList(analysis) {
  return analysis.sentences.map((s) => ({ i: s.id, teaser: s.teaser || undefined, text: s.text, start: round(s.start, 2), dur: round(s.end - s.start, 2), clip: s.clip, group: s.group ?? null, fluency: s.fluency, best_take: s.group ? s.best : undefined }));
}

/**
 * Builds the CutPlan. judgment (validated, see judgment.mjs) may set hook,
 * order, drop, best_take, keep_pause_after, emphasis, chapters, target.
 * Returns {template, keep[], removed[], needs_cover[], summary, ...}.
 */
export function buildCutPlan({ clips, template, analysis = analyzeClips(clips, template), judgment = null, target = null }) {
  const { sentences, marks } = analysis;
  const J = judgment ?? {};
  const why = new Map(); // sentence id → removal reason
  // retakes: keep the best take (LLM may override per group)
  for (const g of analysis.takes) {
    const chosen = J.best_take?.[g.id] != null && g.sentences.includes(J.best_take[g.id]) ? J.best_take[g.id] : g.best;
    for (const i of g.sentences) if (i !== chosen) why.set(i, 'retake');
  }
  for (const d of J.drop ?? []) if (!why.has(d.sentence)) why.set(d.sentence, 'llm_drop');
  // deterministic fallback: a shorts opener that is only a greeting goes
  if (!judgment && template.shorts) {
    const first = sentences.find((s) => !why.has(s.id) && clips[s.clip].kind !== 'broll');
    if (first?.greeting && first.tokens.length <= 8 && sentences.some((s) => s.id !== first.id && !why.has(s.id))) why.set(first.id, 'greeting');
  }
  const wordsOf = (s) => clips[s.clip].transcript.words;
  const kept = (s) => !why.has(s.id);
  // story order: LLM order (validated) or chronological
  let order = Array.isArray(J.order) && J.order.length ? J.order.filter((i) => sentences[i] && kept(sentences[i])) : sentences.filter(kept).map((s) => s.id);
  if (Array.isArray(J.order) && J.order.length) for (const s of sentences) if (kept(s) && !order.includes(s.id)) why.set(s.id, 'llm_drop');
  // hook: a cold open built from the hook sentence's trimmed words
  let hook = null;
  if (J.hook && sentences[J.hook.sentence]) {
    const s = sentences[J.hook.sentence];
    const [a, b] = J.hook.trim_words ?? [0, s.w1 - s.w0];
    hook = { sentence: s.id, w0: s.w0 + a, w1: Math.min(s.w1, s.w0 + b), text: J.hook.hook_text ?? null };
    const share = (hook.w1 - hook.w0 + 1) / (s.w1 - s.w0 + 1);
    const pos = order.indexOf(s.id);
    if (pos === 0) order = order.slice(1); // moved: the trimmed hook replaces it
    else if (pos > 0) {
      // repeat in context only when the hook is a short excerpt heard much later; else cut the original
      const before = order.slice(0, pos).reduce((acc, i) => acc + sentences[i].end - sentences[i].start, 0);
      if (share >= 0.6 || before < 8) order = order.filter((i) => i !== s.id);
    }
    why.delete(s.id);
  }
  // length rule: shorts ≤ target; cut the weakest middle sentences first (tangents are the LLM's call)
  const limit = J.target_duration_s ?? target ?? (template.shorts ? 60 : null);
  const est = () => order.reduce((acc, i) => acc + Math.max(0, sentences[i].end - sentences[i].start), 0) + (hook ? wordsOf(sentences[hook.sentence])[hook.w1].end - wordsOf(sentences[hook.sentence])[hook.w0].start : 0);
  if (limit) {
    while (est() > limit * 1.02 && order.length > 2) {
      const middle = order.slice(1, -1).map((i) => sentences[i]).filter((s) => !s.teaser);
      if (!middle.length) break;
      const worst = middle.reduce((a, b) => (b.fluency + b.conf < a.fluency + a.conf ? b : a));
      order = order.filter((i) => i !== worst.id);
      why.set(worst.id, judgment ? 'llm_drop' : 'length');
    }
  }
  const keepPause = new Set(J.keep_pause_after ?? []);
  // ---- assemble segments from units (hook first, then the story)
  // tutorial result-preview montage (cold open of the finished outcomes) plays before the hook
  const previews = (J.preview ?? []).filter((p) => sentences[p.sentence]).map((p) => {
    const s = sentences[p.sentence];
    return { s, w0: s.w0 + p.trim_words[0], w1: Math.min(s.w1, s.w0 + p.trim_words[1]), reason: 'preview' };
  });
  const units = [...previews, ...(hook ? [{ s: sentences[hook.sentence], w0: hook.w0, w1: hook.w1, reason: 'hook' }] : []), ...order.map((i) => ({ s: sentences[i], w0: sentences[i].w0, w1: sentences[i].w1, reason: 'speech' }))];
  const segs = [];
  let cur = null;
  const close = () => {
    if (cur) segs.push(cur);
    cur = null;
  };
  for (const u of units) {
    const c = clips[u.s.clip];
    const words = c.transcript.words;
    const removed = marks[u.s.clip];
    const maxPause = c.kind === 'mixed' ? Math.max(template.max_pause, MIXED_MAX_PAUSE) : template.max_pause;
    for (let wi = u.w0; wi <= u.w1; wi++) {
      if (removed.has(wi)) continue;
      const w = words[wi];
      if (cur && cur.clip === u.s.clip && wi > cur.last && cur.reason === u.reason) {
        // contiguous only when no word in between was removed or left out of the story
        const clean = wi === cur.last + 1;
        const gap = w.start - words[cur.last].end;
        const atBoundary = cur.lastSentence !== u.s.id;
        const allowed = atBoundary && keepPause.has(cur.lastSentence) ? KEEP_PAUSE_MAX : maxPause;
        if (clean && gap <= allowed) {
          Object.assign(cur, { last: wi, lastSentence: u.s.id });
          if (!cur.sentences.includes(u.s.id)) cur.sentences.push(u.s.id);
          continue;
        }
        if (clean && atBoundary && keepPause.has(cur.lastSentence)) {
          // a deliberate beat: keep up to 0.7 s of it, centred, instead of closing it
          cur.tailKeep = KEEP_PAUSE_MAX / 2;
          close();
          cur = { clip: u.s.clip, src: c.src, first: wi, last: wi, sentences: [u.s.id], reason: u.reason, lastSentence: u.s.id, headKeep: KEEP_PAUSE_MAX / 2 };
          continue;
        }
      }
      close();
      cur = { clip: u.s.clip, src: c.src, first: wi, last: wi, sentences: [u.s.id], reason: u.reason, lastSentence: u.s.id };
    }
    // hook and preview units never merge into what follows
    if (u.reason === 'hook' || u.reason === 'preview') close();
  }
  close();
  // ---- edges: pad of room tone, never into a neighbouring (removed) word, snapped to a zero crossing
  const keep = [];
  let at = 0;
  for (const [k, g] of segs.entries()) {
    const c = clips[g.clip];
    const words = c.transcript.words;
    const prevEnd = g.first > 0 ? words[g.first - 1].end : 0;
    const nextStart = g.last + 1 < words.length ? words[g.last + 1].start : c.duration ?? words[g.last].end + 1;
    const lead = g.headKeep ?? template.pad;
    const isLast = k === segs.length - 1;
    const tail = g.tailKeep ?? (isLast ? Math.max(template.pad, 0.25) : template.pad);
    let inT = Math.max(0, words[g.first].start - Math.min(lead, (words[g.first].start - prevEnd) / (g.first > 0 ? 2 : 1)));
    let outT = Math.min(c.duration ?? Infinity, words[g.last].end + Math.min(tail, (nextStart - words[g.last].end) / (g.last + 1 < words.length ? 2 : 1)));
    const snap = (t) => nearestZeroCross(c.transcript.samples, 16000, t, 5) ?? t;
    inT = round(snap(inT), 4);
    outT = round(snap(outT), 4);
    if (!(outT > inT)) continue;
    const speakers = words.slice(g.first, g.last + 1).map((w) => w.speaker).filter(Boolean);
    const speaker = speakers.length ? mode(speakers) : undefined;
    keep.push({ src: g.src, clip: g.clip, in: inT, out: outT, at: round(at, 4), reason: g.reason, sentences: g.sentences, words: [g.first, g.last], text: words.slice(g.first, g.last + 1).filter((_, i) => !marks[g.clip].has(g.first + i)).map((w) => w.w).join(' '), ...(speaker ? { speaker } : {}) });
    at += outT - inT;
  }
  // b-roll clips stay out of the A-roll story; offered to later phases
  const broll = clips.filter((c) => c.kind === 'broll').map((c) => ({ src: c.src, duration: c.duration }));
  return finishPlan({ clips, template, keep, broll, analysis, why, hook, judgment });
}

const mode = (list) => {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/** Removed ranges with reasons, needs_cover joins and the summary. */
function finishPlan({ clips, template, keep, broll, analysis, why, hook, judgment }) {
  const removed = [];
  clips.forEach((c, ci) => {
    if (c.kind === 'broll' || !c.transcript) return;
    const ranges = keep.filter((k) => k.clip === ci).map((k) => [k.in, k.out]).sort((a, b) => a[0] - b[0]);
    const covered = [];
    for (const r of ranges) {
      if (covered.length && r[0] <= covered.at(-1)[1] + 1e-4) covered.at(-1)[1] = Math.max(covered.at(-1)[1], r[1]);
      else covered.push([...r]);
    }
    let t = 0;
    const words = c.transcript.words;
    const marks = analysis.marks[ci];
    for (const [a, b] of [...covered, [c.duration ?? t, c.duration ?? t]]) {
      if (a - t > 0.005) {
        const inside = words.map((w, i) => ({ w, i })).filter(({ w }) => w.end > t + 1e-3 && w.start < a - 1e-3);
        const reasonOf = (i) => {
          const s = analysis.sentences.find((x) => x.clip === ci && i >= x.w0 && i <= x.w1);
          return (s && why.get(s.id)) ?? marks.get(i) ?? 'trim';
        };
        if (!inside.length) removed.push({ src: c.src, in: round(t, 4), out: round(a, 4), dur: round(a - t, 3), reason: 'silence' });
        else {
          // one entry per run of words removed for the same reason; silence around them goes with them
          const runs = [];
          for (const x of inside) {
            const r = reasonOf(x.i);
            if (runs.length && runs.at(-1).reason === r) runs.at(-1).words.push(x.w);
            else runs.push({ reason: r, words: [x.w] });
          }
          runs.forEach((run, k) => {
            const from = k === 0 ? t : (runs[k - 1].words.at(-1).end + run.words[0].start) / 2;
            const to = k === runs.length - 1 ? a : (run.words.at(-1).end + runs[k + 1].words[0].start) / 2;
            removed.push({ src: c.src, in: round(from, 4), out: round(to, 4), dur: round(to - from, 3), reason: run.reason, text: run.words.map((w) => w.w).join(' ').slice(0, 120) });
          });
        }
      }
      t = Math.max(t, b);
    }
  });
  // joins: consecutive kept segments of one source that skip source time are jump cuts
  const needs_cover = [];
  for (let k = 1; k < keep.length; k++) {
    const a = keep[k - 1];
    const b = keep[k];
    if (a.src !== b.src || Math.abs(b.in - a.out) < 1e-3) continue;
    needs_cover.push({ join: k, at: b.at, src: b.src, from: a.out, to: b.in, kind: 'jump', ...(a.reason === 'hook' || a.reason === 'preview' ? { after: a.reason } : {}) });
  }
  // screen recordings: every kept segment is a punch-in candidate on the clicked region (Phase 4 finds it)
  const screens = new Set(clips.filter((c) => c.screen).map((c) => c.src));
  const screen_punch = keep.filter((k) => screens.has(k.src)).map((k) => ({ at: k.at, src: k.src, in: k.in, out: k.out, kind: 'screen_punch' }));
  const plan = { version: 1, template, keep, removed, needs_cover, screen_punch, broll, flagged: analysis.flagged, takes: analysis.takes.map((g) => ({ id: g.id, sentences: g.sentences, best: g.best })), hook: hook ? { ...hook, text: hook.text } : null, judgment: judgment ? { source: judgment.source ?? 'llm', emphasis: judgment.emphasis ?? [], chapters: judgment.chapters ?? [], hook_text: judgment.hook?.hook_text ?? null } : { source: 'deterministic' } };
  plan.summary = summarize(plan, clips, why);
  return plan;
}

/** Counts and the one-line live summary ("removed 37 pauses (11.4 s), 9 fillers, 2 retakes"). */
export function summarize(plan, clips, why = new Map()) {
  const by = (r) => plan.removed.filter((x) => x.reason === r);
  const pauses = by('silence');
  const fillerRuns = plan.removed.filter((x) => x.reason === 'filler').length;
  const retakes = [...why.values()].filter((r) => r === 'retake').length;
  const drops = [...why.values()].filter((r) => r === 'llm_drop').length;
  const stutters = by('stutter').length;
  const before = clips.filter((c) => c.kind !== 'broll' && c.transcript).reduce((a, c) => a + (c.duration ?? 0), 0);
  const after = plan.keep.reduce((a, k) => a + (k.out - k.in), 0);
  const s = {
    pauses: pauses.length,
    pause_s: round(pauses.reduce((a, x) => a + x.dur, 0), 1),
    fillers: fillerRuns,
    fillers_kept: plan.flagged.length,
    stutters,
    retakes,
    llm_drop: drops,
    greeting: [...why.values()].filter((r) => r === 'greeting').length,
    length_drop: [...why.values()].filter((r) => r === 'length').length,
    segments: plan.keep.length,
    needs_cover: plan.needs_cover.length,
    before_s: round(before, 2),
    after_s: round(after, 2),
    first_speech_s: plan.keep.length ? round(firstSpeech(plan, clips), 3) : null,
  };
  const parts = [`removed ${s.pauses} pause${s.pauses === 1 ? '' : 's'} (${s.pause_s} s)`, `${s.fillers} filler${s.fillers === 1 ? '' : 's'}`, `${s.retakes} retake${s.retakes === 1 ? '' : 's'}`];
  if (s.stutters) parts.push(`${s.stutters} stutter${s.stutters === 1 ? '' : 's'}`);
  if (s.llm_drop) parts.push(`${s.llm_drop} dropped line${s.llm_drop === 1 ? '' : 's'}`);
  if (s.greeting) parts.push('the greeting');
  if (s.length_drop) parts.push(`${s.length_drop} line${s.length_drop === 1 ? '' : 's'} for length`);
  const previews = plan.keep.filter((k) => k.reason === 'preview').length;
  s.text = `${parts.join(', ')} · ${s.before_s} s → ${s.after_s} s${previews ? ` · ${previews}-shot result preview` : ''}${plan.hook ? ' · cold-open hook' : ''}`;
  return s;
}

function firstSpeech(plan, clips) {
  const k = plan.keep[0];
  const w = clips[k.clip].transcript.words[k.words[0]];
  return Math.max(0, w.start - k.in);
}

/**
 * Join smoothing (3.2.5). motions[j] = {shift: head/frame shift as a fraction
 * of frame height, residual} for needs_cover[j]. Micro-jumps (< 2 %) look like
 * glitches: merge them when only a short silence was removed (≤ 0.25 s), else
 * force a framing change. With frameAll every join gets an alternating punch
 * (the captions-only path has no later phase to place one).
 */
export function refineJoins(plan, motions = [], { punch = 1.12, frameAll = false } = {}) {
  const merged = new Set();
  const force = new Set();
  plan.needs_cover.forEach((j, n) => {
    const m = motions[n];
    const micro = m && m.shift < MICRO_JUMP;
    if (m) Object.assign(j, { shift: round(m.shift, 4) });
    if (!micro) {
      if (frameAll) force.add(j.join);
      return;
    }
    j.kind = 'micro_jump';
    const gapRemoved = plan.removed.filter((r) => r.src === j.src && r.in >= j.from - 1e-3 && r.out <= j.to + 1e-3);
    const onlySilence = j.to > j.from && gapRemoved.every((r) => r.reason === 'silence') && j.to - j.from <= 0.25;
    if (onlySilence) merged.add(j.join);
    else force.add(j.join);
  });
  // merge from the back so indices stay valid
  for (const k of [...merged].sort((a, b) => b - a)) {
    const a = plan.keep[k - 1];
    const b = plan.keep[k];
    a.out = b.out;
    a.sentences = [...new Set([...a.sentences, ...b.sentences])];
    a.words = [a.words[0], b.words[1]];
    a.text = `${a.text} ${b.text}`;
    plan.keep.splice(k, 1);
    plan.removed = plan.removed.filter((r) => !(r.src === a.src && r.in >= a.in - 1e-4 && r.out <= a.out + 1e-4));
  }
  let at = 0;
  for (const k of plan.keep) {
    k.at = round(at, 4);
    at += k.out - k.in;
  }
  // framing: alternate wide ↔ punch on the far side of forced joins
  const shiftIdx = (idx) => idx - [...merged].filter((m) => m <= idx).length;
  const forced = new Set([...force].filter((k) => !merged.has(k)).map(shiftIdx));
  let zoom = 1;
  plan.keep.forEach((k, i) => {
    if (forced.has(i)) zoom = zoom === 1 ? punch : 1;
    else if (i > 0 && plan.keep[i - 1].src !== k.src) zoom = 1;
    k.zoom = zoom;
  });
  plan.needs_cover = plan.needs_cover
    .filter((j) => !merged.has(j.join))
    .map((j) => {
      const join = shiftIdx(j.join);
      return { ...j, join, at: plan.keep[join].at, ...(forced.has(join) ? { framed: plan.keep[join].zoom } : {}) };
    });
  if (plan.screen_punch?.length) {
    const srcs = new Set(plan.screen_punch.map((p) => p.src));
    plan.screen_punch = plan.keep.filter((k) => srcs.has(k.src)).map((k) => ({ at: k.at, src: k.src, in: k.in, out: k.out, kind: 'screen_punch' }));
  }
  plan.summary.segments = plan.keep.length;
  plan.summary.needs_cover = plan.needs_cover.length;
  plan.summary.micro_merged = merged.size;
  plan.summary.framed = forced.size;
  plan.summary.after_s = round(plan.keep.reduce((a, k) => a + (k.out - k.in), 0), 2);
  plan.summary.text = plan.summary.text.replace(/· [\d.]+ s → [\d.]+ s/, `· ${plan.summary.before_s} s → ${plan.summary.after_s} s`);
  return plan;
}

/** Plan-level editing metrics (what the bench measures on the render). */
export function planMetrics(plan, clips) {
  let dead = 0;
  let total = 0;
  let fillers = 0;
  for (const k of plan.keep) {
    const words = clips[k.clip].transcript.words;
    total += k.out - k.in;
    for (let i = k.words[0]; i <= k.words[1]; i++) {
      if (words[i].filler) fillers++;
      if (i > k.words[0] && words[i].start - words[i - 1].end > 0.35) dead += words[i].start - words[i - 1].end;
    }
  }
  const kept = new Set(plan.keep.flatMap((k) => k.sentences));
  const repeat = plan.takes.filter((g) => g.sentences.filter((s) => kept.has(s)).length > 1).length;
  return { dead_air_ratio: total ? round(dead / total, 4) : 0, filler_count: fillers, repeat_takes: repeat, first_speech_s: plan.summary.first_speech_s };
}
