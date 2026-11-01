// B-roll placement (Phase 6): the user's own non-speech clips (classified in
// Phase 3) go over the talking track where a creator editor would put them.
// No stock fetching (offline, licence-safe).
//
// Matching: one cached vision call per clip (3 frames → a one-line visual
// description) and one cached, batched LLM call (sentences × descriptions →
// best clip per sentence or none). Without AI (captions mode, offline) the
// file names and descriptions are matched by word overlap.
// Placement: needs_cover joins from the cut plan first (hides jump cuts), then
// abstract sentences ("imagine…", "the city was…", lists). 1.2–3.5 s, the
// picture comes in 6–8 frames after the sentence starts (J-cut) and leaves on
// a word end (L-cut: its own sound trails, see camera.mjs applyJL); never the
// hook's first 1.5 s, never over a punchline's face or an introduction,
// ≤ 40 % of the runtime, ≥ 4 s between inserts unless it is a montage. Each
// insert gets its own slow push (1.00 → 1.06) or drift, and its sound at −24 dB.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { arollTrack } from './camera.mjs';
import { outputWords } from './captions.mjs';
import { rate as rateOf } from './edl.mjs';

export const BROLL_VERSION = 1;
export const BROLL_MIN = 1.2;
export const BROLL_MAX = 3.5;
export const BROLL_GAIN_DB = -24;
export const MAX_SHARE = 0.4;
export const MIN_SPACING = 4;
export const HOOK_GUARD = 1.5;
const JCUT_FRAMES = 7;

const r3 = (n) => +Number(n).toFixed(3);
const npath = (p) => String(p ?? '').replaceAll('\\', '/');
const clipLen = (c) => (c.out - c.in) / (c.speed ?? 1);
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------- sentences
const SENT_END = /[.?!।…]["'”’)\]]*$/;
/** Output-time sentences from the A-roll words (sentence punctuation or a pause > 0.6 s). */
export function outputSentences(words) {
  const out = [];
  let cur = [];
  const close = () => {
    if (!cur.length) return;
    out.push({ i: out.length, text: cur.map((w) => w.w).join(' '), start: cur[0].start, end: cur.at(-1).end, words: cur, emphasis: cur.filter((w) => w.emphasis).map((w) => ({ t: w.start, kind: w.emphasis })) });
    cur = [];
  };
  words.forEach((w, k) => {
    if (cur.length && w.start - cur.at(-1).end > 0.6) close();
    cur.push(w);
    if (SENT_END.test(w.w) || k === words.length - 1) close();
  });
  return out;
}
const ABSTRACT = /\b(imagine|picture (this|that)|think (about|of)|for example|for instance|back (in|when)|years ago|once upon|the (city|world|ocean|sea|market|industry|internet|future|past|street|streets|mountains?|sky|road)|in the (city|world|wild|future|past)|journey|story|travel|trip|history|nature|landscape|everywhere|people (are|were|who)|kind of like|it'?s like|first(ly)?,|second(ly)?,|third(ly)?,|number (one|two|three)|step (one|two|three)|socho|imagine karo)\b/i;
export const isAbstract = (text) => ABSTRACT.test(String(text ?? ''));

// ---------------------------------------------------------------- matching
const STOP = new Set('the a an and or but so to of in on at for with from by is are was were be been it this that these those i you we they he she my your our their me us them as if then than just like really very can will would should could do does did have has had not no yes um uh'.split(' '));
const tokens = (s) => String(s ?? '').toLowerCase().replace(/[_\-.]+/g, ' ').match(/\p{L}{3,}/gu)?.filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, '')) ?? [];
/** Deterministic relevance in 0..1 (word overlap of sentence vs file name + description). */
export function overlapScore(sentence, clip) {
  const a = new Set(tokens(sentence));
  const b = new Set([...tokens(clip.path?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')), ...tokens(clip.description)]);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / Math.min(a.size, b.size);
}

function grab(ffmpeg, input, t, out, signal) {
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, t)), '-i', input, '-frames:v', '1', '-vf', 'scale=384:-2', '-q:v', '5', out], { windowsHide: true, signal });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0 && existsSync(out)));
  });
}
const signature = (path) => {
  try {
    const st = statSync(path);
    return `${st.size}:${Math.round(st.mtimeMs)}`;
  } catch {
    return 'missing';
  }
};

/**
 * One cached vision call per clip on 3 frames → a one-line description.
 * ask(text, images) → JSON record (engine.ai('review', …)); omitted offline.
 */
export async function describeClips({ clips, ffmpeg = 'ffmpeg', cacheDir, ask, signal, onStep = () => {} }) {
  const out = new Map();
  mkdirSync(cacheDir, { recursive: true });
  for (const c of clips) {
    const key = sha(JSON.stringify(['broll-describe', BROLL_VERSION, npath(c.path), signature(c.path)]));
    const file = join(cacheDir, `broll-${key.slice(0, 24)}.json`);
    if (existsSync(file)) {
      try {
        out.set(npath(c.path), JSON.parse(readFileSync(file, 'utf8')).description);
        continue;
      } catch {
        /* recompute */
      }
    }
    if (!ask) continue;
    const images = [];
    for (const [i, f] of [0.2, 0.5, 0.8].entries()) {
      const jpg = join(cacheDir, `broll-${key.slice(0, 12)}-${i}.jpg`);
      if (await grab(ffmpeg, c.path, (c.duration || 3) * f, jpg, signal)) {
        images.push({ label: `frame ${i + 1} of 3 (${Math.round(f * 100)}%)`, url: `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}` });
        rmSync(jpg, { force: true });
      }
    }
    if (!images.length) continue;
    onStep(c);
    try {
      const r = await ask('B-ROLL DESCRIPTION (not a render check). Describe what this clip shows in one plain line (≤ 18 words: subject, place, action, mood) so an editor can match it to narration. Answer json {"description": string}.', images);
      const d = String(r?.description ?? r?.message ?? '').trim().slice(0, 160);
      if (d) {
        out.set(npath(c.path), d);
        writeFileSync(file, JSON.stringify({ description: d }));
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return out;
}

/**
 * Best clip per sentence (or none) in one cached, batched LLM call; the word
 * overlap score is the offline fallback. Returns Map(sentence index → {clip, score}).
 */
export async function matchSentences({ sentences, clips, cacheDir, ask, signal }) {
  const result = new Map();
  const fallback = () => {
    for (const s of sentences) {
      let best = null;
      for (const c of clips) {
        const sc = overlapScore(s.text, c);
        if (sc > (best?.score ?? 0.24)) best = { clip: npath(c.path), score: r3(sc), by: 'words' };
      }
      if (best) result.set(s.i, best);
    }
    return result;
  };
  if (!ask || !clips.length || !sentences.length) return fallback();
  const list = clips.map((c, k) => `${k}: ${c.description ?? c.path.split(/[\\/]/).pop()}`).join('\n');
  const text = `B-ROLL MATCHING. For each narration sentence pick the b-roll clip that visually illustrates it, or none. Prefer abstract lines, examples, places and lists; never force a weak match. Answer json {"matches":[{"sentence":number,"clip":number,"score":number 0-1}]} with score ≥ 0.5 only.\nclips:\n${list}\nsentences:\n${sentences.map((s) => `${s.i}: ${s.text.slice(0, 200)}`).join('\n')}`;
  const key = sha(JSON.stringify(['broll-match', BROLL_VERSION, text]));
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `broll-match-${key.slice(0, 24)}.json`);
  let raw = null;
  if (existsSync(file))
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      raw = null;
    }
  if (!raw) {
    try {
      raw = await ask(text);
      writeFileSync(file, JSON.stringify(raw ?? {}));
    } catch (error) {
      if (signal?.aborted) throw error;
      return fallback();
    }
  }
  for (const m of Array.isArray(raw?.matches) ? raw.matches : []) {
    const s = Number(m?.sentence);
    const c = clips[Number(m?.clip)];
    const score = Number(m?.score);
    if (!c || !sentences.some((x) => x.i === s) || !(score >= 0.5)) continue;
    result.set(s, { clip: npath(c.path), score: r3(Math.min(1, score)), by: 'llm' });
  }
  return result;
}

// ---------------------------------------------------------------- placement
/**
 * Inserts for an EDL. clips: [{path, duration, description}], matches: Map from
 * matchSentences (sentence index of outputSentences), planner: [{at, dur, clip, in}].
 * Returns {inserts: [{at, dur, path, in, reason, sentence}], skipped, stats}.
 */
export function planBroll(edl, { ctx = {}, clips = [], matches = new Map(), density = 0.5, planner = [], note = '', guards = [] } = {}) {
  const fps = rateOf(edl.canvas.fps);
  const frame = 1 / fps;
  const track = arollTrack(edl);
  const total = (track?.clips ?? []).reduce((m, c) => Math.max(m, c.at + clipLen(c)), 0);
  const skipped = [];
  if (!clips.length || !total) return { inserts: [], skipped, stats: { share: 0, count: 0 } };
  const words = outputWords(edl, ctx);
  const sentences = outputSentences(words);
  const montage = /montage/i.test(note);
  const budget = Math.min(MAX_SHARE, MAX_SHARE * Math.max(0, Math.min(1, density)) * 2) * total;
  const spacing = montage ? 0.5 : MIN_SPACING;
  // forbidden: the hook's first 1.5 s, punchline faces, introductions, extra guards (graphics needing the face)
  const forbidden = [[0, HOOK_GUARD], ...guards.map((g) => [g.at, g.end])];
  for (const w of words) if (/punch/.test(String(w.emphasis ?? ''))) forbidden.push([w.start - 0.6, w.end + 0.8]);
  for (let i = 0; i < words.length - 1; i++) if (/^(i'?m|name)$/i.test(words[i].w.replace(/[^\p{L}']/gu, '')) && /^\p{Lu}/u.test(words[i + 1].w)) forbidden.push([words[i].start - 0.2, words[i].start + 3.6]);
  const inserts = [];
  const used = new Map();
  const free = (a, b) => !forbidden.some(([x, y]) => a < y && b > x) && !inserts.some((s) => a < s.at + s.dur + spacing && b > s.at - spacing);
  const share = () => inserts.reduce((s, x) => s + x.dur, 0);
  const snapStart = (t) => Math.ceil(t / frame - 1e-6) * frame;
  const nextClip = (preferred) => {
    const pool = preferred ? clips.filter((c) => npath(c.path) === preferred) : [...clips].sort((a, b) => (used.get(npath(a.path)) ?? 0) - (used.get(npath(b.path)) ?? 0));
    return pool[0] ?? null;
  };
  const inPoint = (clip, dur) => {
    const n = used.get(npath(clip.path)) ?? 0;
    const room = Math.max(0, (clip.duration || dur) - dur);
    // different parts of the same clip; start a little in (camera settle)
    return r3(room <= 0 ? 0 : Math.min(room, (0.15 + 0.37 * n) % 1 * room));
  };
  const place = (at, end, reason, sentence, preferred, inOverride) => {
    at = snapStart(at);
    let dur = Math.min(BROLL_MAX, end - at);
    dur = Math.floor(dur / frame + 1e-6) * frame;
    if (dur < BROLL_MIN - 1e-6) return skipped.push({ at: r3(at), reason, why: 'shorter than 1.2 s' }), false;
    if (at + dur > total - 0.2) return skipped.push({ at: r3(at), reason, why: 'past the end' }), false;
    if (!free(at, at + dur)) return skipped.push({ at: r3(at), reason, why: 'guarded or too close to another insert' }), false;
    if (share() + dur > budget + 1e-6) return skipped.push({ at: r3(at), reason, why: 'b-roll budget reached' }), false;
    const clip = nextClip(preferred);
    if (!clip) return false;
    const len = Math.min(dur, clip.duration || dur);
    if (len < BROLL_MIN - 1e-6) return skipped.push({ at: r3(at), reason, why: 'clip too short' }), false;
    const ins = { at: r3(at), dur: r3(Math.floor(len / frame + 1e-6) * frame), path: npath(clip.path), in: inOverride ?? inPoint(clip, len), reason, ...(sentence != null ? { sentence } : {}) };
    inserts.push(ins);
    used.set(ins.path, (used.get(ins.path) ?? 0) + 1);
    return true;
  };
  // planner requests first (still guarded)
  for (const p of planner) {
    const c = clips.find((x) => npath(x.path) === npath(p.clip) || x.asset_id === p.clip || npath(x.path).endsWith(`/${String(p.clip).split(/[\\/]/).pop()}`));
    if (!c) {
      skipped.push({ at: p.at, reason: 'planner', why: `unknown b-roll clip ${p.clip}` });
      continue;
    }
    place(p.at, p.at + p.dur, 'planner', null, npath(c.path), p.in);
  }
  if (density > 0) {
    // 1) needs_cover joins: start a J-cut into the sentence that holds the join, cover past it
    const joins = [...(edl.cut_plan?.needs_cover ?? [])].filter((j) => Number.isFinite(j.at)).sort((a, b) => (a.framed ? 1 : 0) - (b.framed ? 1 : 0) || a.at - b.at);
    for (const j of joins) {
      const before = [...words].reverse().find((w) => w.start <= j.at - 0.5);
      const after = words.find((w) => w.end >= j.at + 0.7);
      if (!before || !after) continue;
      const s = sentences.find((x) => x.start <= j.at && x.end >= j.at);
      const at = before.start + JCUT_FRAMES * frame;
      const endWord = words.find((w) => w.end >= at + BROLL_MIN && w.end >= j.at + 0.6 && w.end <= at + BROLL_MAX) ?? after;
      const m = s ? matches.get(s.i) : null;
      place(at, endWord.end, 'needs_cover', s?.i, m?.clip);
    }
    // 2) abstract / matched sentences, best match first
    const ranked = sentences
      .map((s) => ({ s, m: matches.get(s.i), abstract: isAbstract(s.text) }))
      .filter((x) => x.m || x.abstract)
      .sort((a, b) => (b.m?.score ?? 0) + (b.abstract ? 0.3 : 0) - ((a.m?.score ?? 0) + (a.abstract ? 0.3 : 0)));
    for (const { s, m } of ranked) {
      const at = s.start + JCUT_FRAMES * frame;
      // leave on a word end between 1.2 and 3.5 s in
      const endWord = s.words.filter((w) => w.end >= at + BROLL_MIN && w.end <= at + BROLL_MAX).at(-1) ?? s.words.find((w) => w.end >= at + BROLL_MIN);
      if (!endWord) continue;
      place(at, Math.min(endWord.end, at + BROLL_MAX), m ? 'matched' : 'abstract', s.i, m?.clip);
    }
  }
  inserts.sort((a, b) => a.at - b.at);
  return { inserts, skipped, stats: { count: inserts.length, seconds: r3(share()), share: r3(share() / total), budget_s: r3(budget), total_s: r3(total) } };
}

/**
 * Puts inserts on the EDL: a BROLL video track above the A-roll with its own
 * camera move per insert, and a BROLL audio track at −24 dB (linked, so the
 * director's J/L-cut pass leads/trails it). Existing app b-roll is replaced.
 */
export function applyBroll(edl, inserts, { files = [] } = {}) {
  const track = arollTrack(edl);
  edl.video = edl.video.filter((t) => t.track !== 'BROLL');
  edl.audio = edl.audio.filter((t) => t.track !== 'BROLL');
  if (!inserts.length || !track) return edl;
  const vt = { track: 'BROLL', name: 'b-roll (app)', clips: [] };
  const at = { track: 'BROLL', name: 'b-roll sound (app)', role: 'BROLL', clips: [] };
  inserts.forEach((s, i) => {
    let src = edl.sources.find((x) => npath(x.path) === s.path);
    if (!src) {
      const f = files.find((x) => npath(x.path) === s.path) ?? {};
      src = { id: `broll-src-${i + 1}`, path: s.path, fps: f.fps || f.rate || edl.canvas.fps, w: f.width || 1920, h: f.height || 1080, rotation: f.rotation ?? 0, color: { primaries: 'bt709', trc: 'bt709' }, duration: f.duration, audio: f.audio ?? null, kind: 'video' };
      edl.sources.push(src);
    }
    const id = `broll-${i + 1}`;
    // its own camera move: slow push in, push out, or a gentle drift (variety by index)
    const kind = i % 3;
    const camera = kind === 0 ? [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'linear' }, { t: s.dur, x: 0.5, y: 0.5, zoom: 1.06, ease: 'linear' }] : kind === 1 ? [{ t: 0, x: 0.5, y: 0.5, zoom: 1.06, ease: 'linear' }, { t: s.dur, x: 0.5, y: 0.5, zoom: 1.0, ease: 'linear' }] : [{ t: 0, x: 0.485, y: 0.5, zoom: 1.06, ease: 'linear' }, { t: s.dur, x: 0.515, y: 0.5, zoom: 1.06, ease: 'linear' }];
    vt.clips.push({ id, src: src.id, in: s.in, out: r3(s.in + s.dur), at: s.at, speed: 1, fit: 'cover', camera, camera_by: 'broll', broll: { reason: s.reason, ...(s.sentence != null ? { sentence: s.sentence } : {}) } });
    if (src.audio === true)
      at.clips.push({ id: `${id}:audio`, linked: id, src: src.id, in: s.in, out: r3(s.in + s.dur), at: s.at, speed: 1, gain_db: BROLL_GAIN_DB });
  });
  const idx = edl.video.indexOf(track);
  edl.video.splice(idx + 1, 0, vt);
  if (at.clips.length) edl.audio.push(at);
  return edl;
}
