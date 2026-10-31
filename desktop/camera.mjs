// Phase 4 camera language: easing, per-frame camera sampling, the framing
// vocabulary (wide / medium / tight / extreme) with head-placement rules, and
// the camera director that writes EDL camera keyframes for the A-roll.
// Pure functions only: no I/O. Head tracks and screen regions are measured in
// camera-probe.mjs; the compositor samples the keys through cameraRect() and
// renders them with sam.mjs rectFilter() (float crop + lanczos, no zoompan).
import { gimbalPath, sampleAt } from './sam.mjs';

// ---------------------------------------------------------------- easing
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const SPRING_K = 8.5; // ω·duration: the spring is settled (≈0.2 %) at the end
const springNorm = 1 - (1 + SPRING_K) * Math.exp(-SPRING_K);

/** Easing library. back_out is for graphics only and never used by the camera. */
export const EASINGS = {
  linear: (u) => clamp01(u),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u)),
  cubic: (u) => {
    u = clamp01(u);
    return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  },
  expo_out: (u) => {
    u = clamp01(u);
    return u >= 1 ? 1 : (1 - 2 ** (-10 * u)) / (1 - 2 ** -10);
  },
  expo_in: (u) => {
    u = clamp01(u);
    return u <= 0 ? 0 : (2 ** (10 * u - 10) - 2 ** -10) / (1 - 2 ** -10);
  },
  back_out: (u, s = 1.2) => {
    u = clamp01(u) - 1;
    return 1 + (s + 1) * u ** 3 + s * u * u;
  },
  // critically damped spring step response, ω = SPRING_K / duration, normalised to land on 1
  spring: (u) => {
    u = clamp01(u);
    return (1 - (1 + SPRING_K * u) * Math.exp(-SPRING_K * u)) / springNorm;
  },
  hold: () => 0,
};

/** Camera-safe ease by name; accepts the names native projects and older EDLs use. */
export function easeFn(name) {
  const n = String(name ?? 'cubic').toLowerCase();
  if (EASINGS[n] && n !== 'back_out') return EASINGS[n];
  if (n === 'hold' || n === 'step') return EASINGS.hold;
  if (/back/.test(n)) return (u) => 1 - (1 - clamp01(u)) ** 3; // graphics overshoot is never used on the camera
  if (/out.*quart/.test(n)) return (u) => 1 - (1 - clamp01(u)) ** 4;
  if (/expo/.test(n)) return /in/.test(n) && !/out/.test(n) ? EASINGS.expo_in : EASINGS.expo_out;
  if (/sine/.test(n)) return EASINGS.sine;
  if (/out.*cubic|ease_out|^out$/.test(n)) return (u) => 1 - (1 - clamp01(u)) ** 3;
  if (/in.*cubic|ease_in$|^in$/.test(n) && !/out/.test(n)) return (u) => clamp01(u) ** 3;
  if (/spring/.test(n)) return EASINGS.spring;
  if (/linear/.test(n)) return EASINGS.linear;
  return EASINGS.cubic; // cubic, in_out, smooth, ease, unknown
}

/** Zoom interpolates in log space so a push reads as constant speed to the eye. */
export const logZoom = (z0, z1, e) => Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * e);

/**
 * Critically damped spring follower over a sampled target series (zero-phase:
 * run forward and backward and averaged). omega in rad/s.
 */
export function springFollow(target, fps, omega = 6) {
  const run = (arr) => {
    const out = new Array(arr.length);
    let x = arr[0];
    let v = 0;
    const dt = 1 / fps;
    for (let i = 0; i < arr.length; i++) {
      // semi-implicit Euler of x'' = ω²(target − x) − 2ωx'
      v += (omega * omega * (arr[i] - x) - 2 * omega * v) * dt;
      x += v * dt;
      out[i] = x;
    }
    return out;
  };
  if (!target.length) return [];
  const f = run(target);
  const b = run([...target].reverse()).reverse();
  return f.map((v, i) => (v + b[i]) / 2);
}

/**
 * Soft clamp: identity inside [lo+band, hi-band]; inside the band it eases
 * exponentially toward the wall (C1 continuous, never reaches past it), so the
 * camera never hits a wall and stops dead.
 */
export function softClamp(v, lo, hi, band) {
  if (!(hi > lo)) return (lo + hi) / 2;
  const b = Math.max(1e-9, Math.min(band, (hi - lo) / 2));
  if (v < lo + b) return lo + b * Math.exp((v - lo - b) / b);
  if (v > hi - b) return hi - b * Math.exp((hi - b - v) / b);
  return v;
}

// 1-D gradient (Perlin) noise in [-1, 1], deterministic per seed.
function grad(i, seed) {
  let h = (Math.imul(i ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b) ^ 0x27d4eb2f) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 13)) / 0xffffffff) * 2 - 1;
}
export function perlin1(x, seed = 1) {
  const i = Math.floor(x);
  const f = x - i;
  const fade = f * f * f * (f * (f * 6 - 15) + 10);
  const a = grad(i, seed) * f;
  const b = grad(i + 1, seed) * (f - 1);
  return Math.max(-1, Math.min(1, 2 * (a + (b - a) * fade)));
}

// ---------------------------------------------------------------- sampling
/** Keys [{t, x, y, zoom, ease}] → (t) => {x, y, zoom}. The ease of key a shapes a→b. */
export function cameraSampler(keys) {
  const k = (keys?.length ? keys : [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }]).map((q) => ({ t: q.t ?? 0, x: q.x ?? 0.5, y: q.y ?? 0.5, zoom: q.zoom > 0 ? q.zoom : 1, ease: q.ease })).sort((a, b) => a.t - b.t);
  const eases = k.map((q) => easeFn(q.ease));
  return (t) => {
    if (t <= k[0].t) return { x: k[0].x, y: k[0].y, zoom: k[0].zoom };
    const last = k[k.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y, zoom: last.zoom };
    let lo = 0;
    let hi = k.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (k[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = k[lo];
    const b = k[hi];
    const e = eases[lo]((t - a.t) / Math.max(1e-9, b.t - a.t));
    return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, zoom: logZoom(a.zoom, b.zoom, e) };
  };
}

/** Source size with rotation applied, and the cover crop at zoom 1 for the canvas aspect. */
export function coverGeometry(source, canvas, fit = 'cover') {
  const rot = Math.abs(source?.rotation ?? 0) % 180 === 90;
  const W = (rot ? source?.h : source?.w) || canvas.w;
  const H = (rot ? source?.w : source?.h) || canvas.h;
  const aspect = canvas.w / canvas.h;
  let cw = W;
  let ch = H;
  if (fit !== 'contain') {
    if (W / H > aspect) cw = H * aspect;
    else ch = W / aspect;
  }
  return { W, H, cw, ch };
}

export const UPSCALE_LIMIT = 0.75; // crop may not be smaller than 75 % of the output
export const MAX_ZOOM = 2;
// When the fit itself is already below 0.75× (a 1080p source on a 9:16 canvas, or
// a 720p source), the camera may still punch to 1.25 so framing changes stay
// visible; tighter asks are capped there with a warning op.
export const MIN_CAP = 1.25;
/** Highest zoom before the crop drops below 0.75 × output resolution (floor MIN_CAP, ceiling MAX_ZOOM). */
export function zoomCap(geom, canvas, limit = UPSCALE_LIMIT) {
  return Math.max(MIN_CAP, Math.min(MAX_ZOOM, geom.cw / (limit * canvas.w), geom.ch / (limit * canvas.h)));
}

export const SOFT_BAND = 0.02; // 2 % of the source dimension
/**
 * Float crop rectangle [x, y, w, h] (source pixels) for a camera state.
 * Zoom is capped by the upscale limit; position is soft-clamped to the source.
 */
export function cameraRect(state, geom, canvas, { cap = zoomCap(geom, canvas), zoomMul = 1, dx = 0 } = {}) {
  const z = Math.max(1e-6, Math.min(state.zoom, cap) * zoomMul);
  const w = geom.cw / z;
  const h = geom.ch / z;
  const x = state.x * geom.W + dx * w - w / 2;
  const y = state.y * geom.H - h / 2;
  const sx = softClamp(x, 0, geom.W - w, SOFT_BAND * geom.W);
  const sy = softClamp(y, 0, geom.H - h, SOFT_BAND * geom.H);
  // whips and zoom-throughs can ask for more than the source has; the hard clamp only guards those frames
  return [Math.max(0, Math.min(geom.W - w, sx)), Math.max(0, Math.min(geom.H - h, sy)), w, h];
}

/** Camera state of a clip at clip-local time t: keys + optional subject follow + optional micro drift. */
export function clipCameraAt(clip, geom) {
  const sample = cameraSampler(clip.camera);
  const follow = clip.follow?.cx?.length ? clip.follow : null;
  const drift = clip.drift?.amp > 0 ? clip.drift : null;
  return (t) => {
    const s = sample(t);
    if (follow) {
      // the crop centre follows the subject; keep the face at its placement fraction in the crop
      const cx = sampleAt(follow.cx, Math.max(0, t) * follow.fps);
      s.x = cx + (0.5 - (follow.fx ?? 0.5)) * (geom.cw / s.zoom) / geom.W;
    }
    if (drift) {
      const hz = drift.hz ?? 0.2;
      s.x += drift.amp * perlin1(t * hz, drift.seed ?? 1);
      s.y += drift.amp * perlin1(t * hz + 101.3, (drift.seed ?? 1) + 7);
    }
    return s;
  };
}

// ---------------------------------------------------------------- framing vocabulary
/** Zoom vs. source fit and eye line (fraction of crop height from the top). */
export const FRAMINGS = {
  wide: { zoom: 1.0, eyes: 0.38, zoomRange: [1, 1], eyesRange: [0.36, 0.4] },
  'wide+': { zoom: 1.05, eyes: 0.37, zoomRange: [1.04, 1.06], eyesRange: [0.35, 0.39] }, // calm alternation partner of wide
  medium: { zoom: 1.15, eyes: 0.345, zoomRange: [1.12, 1.18], eyesRange: [0.33, 0.36] },
  tight: { zoom: 1.33, eyes: 0.315, zoomRange: [1.28, 1.38], eyesRange: [0.3, 0.33] },
  extreme: { zoom: 1.6, eyes: 0.3, zoomRange: [1.5, 1.7], eyesRange: [0.3, 0.3] },
};
export const ZOOM_ORDER = ['wide', 'wide+', 'medium', 'tight', 'extreme'];

/** Talking-head default when nothing is measured: centred, eyes on the upper third. */
export const CENTRE_HEAD = Object.freeze({ cx: 0.5, eyes: 1 / 3, top: 0.17, chin: 0.52, gaze: 0, source: 'centre' });

/** Head estimate of a track at source time t (normalised source coords). */
export function headAt(track, t) {
  if (!track) return CENTRE_HEAD;
  if (track.static) return track.static;
  const x = Math.max(0, t - (track.t0 ?? 0)) * track.fps;
  const pick = (k, d) => (track[k]?.length ? sampleAt(track[k], Math.min(track[k].length - 1, x)) : d);
  return { cx: pick('cx', 0.5), eyes: pick('eyes', 1 / 3), top: pick('top', 0.17), chin: pick('chin', 0.52), gaze: pick('gaze', 0), source: track.source };
}

/**
 * Camera state {x, y, zoom} (normalised crop centre) for a framing around a head.
 * Rules: medium never crops the hairline; tight may trim the forehead but the
 * eyes never pass 28 % and the chin is never cropped; horizontal look room in
 * the gaze direction (rule of thirds), else centred.
 */
export function frameFor(name, head, geom, { cap = Infinity, zoom: forcedZoom, eyes: forcedEyes } = {}) {
  const F = FRAMINGS[name] ?? FRAMINGS.medium;
  const h0 = head ?? CENTRE_HEAD;
  let zoom = Math.max(1, Math.min(forcedZoom ?? F.zoom, cap));
  const capped = (forcedZoom ?? F.zoom) > cap + 1e-9;
  const eyesY = h0.eyes * geom.H;
  const topY = h0.top * geom.H;
  const chinY = h0.chin * geom.H;
  let y0;
  let h;
  for (let guard = 0; guard < 40; guard++) {
    h = geom.ch / zoom;
    const e = forcedEyes ?? F.eyes;
    y0 = eyesY - e * h;
    if (name === 'medium' || name === 'wide' || name === 'wide+') {
      if (y0 > topY - 0.02 * h) y0 = topY - 0.02 * h; // keep the hairline
    } else {
      y0 = Math.min(y0, eyesY - 0.28 * h); // eyes never above 28 %
      const minY0 = chinY + 0.02 * h - h; // chin stays in frame
      if (y0 < minY0) y0 = minY0;
      if (eyesY - y0 < 0.28 * h - 1e-6 && zoom > FRAMINGS.medium.zoom) {
        zoom = Math.max(FRAMINGS.medium.zoom, zoom - 0.02); // head too big for this framing: back off
        continue;
      }
    }
    break;
  }
  const w = geom.cw / zoom;
  const gaze = Math.max(-1, Math.min(1, h0.gaze ?? 0));
  const fx = Math.abs(gaze) < 0.15 ? 0.5 : 0.5 - 0.17 * gaze; // looking right → face on the left third
  const x0 = h0.cx * geom.W - fx * w;
  return { x: (x0 + w / 2) / geom.W, y: (y0 + h / 2) / geom.H, zoom: +zoom.toFixed(4), fx, name, capped };
}

/** True when the head box (top..chin, ±half head width) lies inside the crop with a margin. */
export function headInCrop(rect, head, geom, margin = 0.01) {
  const [x, y, w, h] = rect;
  const hh = (head.chin - head.top) * geom.H;
  const hw = hh * 0.75;
  const cx = head.cx * geom.W;
  return head.top * geom.H >= y - h * 0.35 && head.chin * geom.H <= y + h * (1 - margin) && cx - hw / 2 >= x - w * margin && cx + hw / 2 <= x + w * (1 + margin);
}

// ---------------------------------------------------------------- director
export const PATTERNS = {
  5: ['medium', 'tight', 'medium', 'wide', 'tight'],
  4: ['medium', 'tight', 'medium', 'wide'],
  3: ['wide', 'medium'],
  2: ['wide', 'wide+'],
  1: ['wide', 'wide+'],
};
export const TRANSITION_FRAMES = { whip: 7, zoom: 8, dip: 12 };
export const JL_FRAMES = 8; // audio leads/trails the b-roll picture by 6–12 frames
const SNAP_KINDS = new Set(['number', 'punchline', 'claim', 'contrast']);
const CLAUSE = /^(and|but|so|because|or|then|which|aur|lekin|par|toh)$/i;

/** Energy 1–5 for a style and canvas. */
export function energyFor(style, canvas) {
  const vertical = canvas && canvas.h > canvas.w;
  switch (style) {
    case 'energetic':
      return 5;
    case 'documentary':
      return 2;
    case 'cinematic':
      return 1;
    case 'podcast':
      return vertical ? 4 : 3;
    case 'tutorial':
      return vertical ? 4 : 3;
    default:
      return vertical ? 5 : 3;
  }
}
/** Max static span (s): shorts 3, YouTube 6. */
export const maxStaticFor = (canvas) => (canvas && canvas.h > canvas.w ? 3 : 6);

const rateOf = (fps) => {
  if (typeof fps === 'number') return fps;
  const [a, b = 1] = String(fps).split('/').map(Number);
  return a / b;
};
const clipLen = (c) => (c.out - c.in) / (c.speed ?? 1);
const r4 = (n) => +Number(n).toFixed(4);
const norm = (p) => String(p ?? '').replaceAll('\\', '/');

/** Which video track is the A-roll: the one holding the cut plan's clips, else the bottom track. */
export function arollTrack(edl) {
  const ids = new Set((edl.cut_plan?.keep ?? []).map((k) => k.clip_id).filter(Boolean));
  if (ids.size) {
    const t = edl.video.find((tr) => tr.clips.some((c) => ids.has(c.id)));
    if (t) return t;
  }
  return edl.video.find((tr) => tr.clips.some((c) => edl.sources.find((s) => s.id === c.src)?.kind !== 'image')) ?? edl.video[0];
}

/** Normalises the planner's camera tool calls into director overrides (unknown values dropped). */
export function normalizeOverrides(o = {}) {
  const out = { style: null, emphasis: [], holds: [], transitions: [], ramps: [] };
  if (o.style) {
    const energy = Math.round(Number(o.style.energy));
    const pattern = (Array.isArray(o.style.pattern) ? o.style.pattern : String(o.style.pattern ?? '').split(/[\s,>→-]+/)).map((p) => String(p).trim().toLowerCase()).filter((p) => FRAMINGS[p]);
    out.style = { ...(energy >= 1 && energy <= 5 ? { energy } : {}), ...(pattern.length >= 2 ? { pattern } : {}), ...(o.style.micro_drift ? { micro_drift: true } : {}) };
  }
  for (const e of o.emphasis ?? []) {
    const t = Number(e.t ?? e.at);
    if (Number.isFinite(t) || (Number.isInteger(e.sentence) && e.word)) out.emphasis.push({ ...(Number.isFinite(t) ? { t } : {}), sentence: e.sentence, word: e.word ? String(e.word) : undefined, kind: String(e.kind ?? 'claim').toLowerCase() });
  }
  for (const h of o.holds ?? []) {
    const a = Number(h.from ?? h.range?.[0]);
    const b = Number(h.to ?? h.range?.[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.holds.push({ from: a, to: b });
  }
  for (const t of o.transitions ?? []) {
    const at = Number(t.at);
    const kind = String(t.kind ?? '').toLowerCase().replace('-', '_').replace('zoom_through', 'zoom').replace(/^j_?cut$/, 'jcut').replace(/^l_?cut$/, 'lcut');
    if (Number.isFinite(at) && ['cut', 'whip', 'zoom', 'dip', 'jcut', 'lcut'].includes(kind)) out.transitions.push({ at, kind, ...(t.color === 'white' ? { color: 'white' } : {}) });
  }
  for (const r of o.ramps ?? []) {
    const at = Number(r.at ?? 0);
    const dur = Number(r.dur ?? r.duration ?? 1.5);
    const min = Math.max(0.2, Math.min(0.9, Number(r.min_speed ?? r.min ?? 0.4)));
    if (r.clip && at >= 0 && dur > 0) out.ramps.push({ clip: String(r.clip), at, dur, min });
  }
  return out;
}

/**
 * The camera director. Writes camera keyframes onto the EDL's A-roll clips and
 * plans transitions, J/L-cuts and speed ramps. Mutates and returns the EDL;
 * the report carries metrics and warning lines for the live feed.
 *
 * ctx: {energy, maxStatic, heads: {srcId|path: track}, words: {path: [{w,start,end,speaker}]},
 *   emphasis: [{path, t, kind, word}], chapters: [{path, t}], screenRegions: {clipId: [{t0,t1,box}]},
 *   podcast, people, overrides}
 */
export function directCamera(edl, ctx = {}) {
  const fps = rateOf(edl.canvas.fps);
  const frame = 1 / fps;
  const canvas = edl.canvas;
  const ov = normalizeOverrides(ctx.overrides);
  const energy = Math.max(1, Math.min(5, ov.style?.energy ?? ctx.energy ?? energyFor(null, canvas)));
  const pattern = ov.style?.pattern ?? PATTERNS[energy];
  const maxStatic = ctx.maxStatic ?? maxStaticFor(canvas);
  const report = { energy, pattern, shots: 0, framings: [], snaps: 0, pushes: 0, openers: 0, budget_inserts: 0, speaker_shots: 0, screen_punches: 0, transitions: {}, jl: 0, ramps: 0, warnings: [], repeats_at_jumps: 0 };
  const warn = (m) => report.warnings.includes(m) || report.warnings.push(m);
  const track = arollTrack(edl);
  if (!track) return { edl, report };
  const srcOf = (c) => edl.sources.find((s) => s.id === c.src) ?? {};
  const pathOf = (c) => norm(srcOf(c).path);
  const aClips = [...track.clips].sort((a, b) => a.at - b.at);
  const aSet = new Set(aClips.map((c) => c.id));
  const brolls = edl.video.filter((t) => t !== track).flatMap((t) => t.clips).filter((c) => srcOf(c).kind !== 'audio');
  const broIntervals = brolls.map((c) => [c.at, c.at + clipLen(c)]).sort((a, b) => a[0] - b[0]);
  const covered = (t) => broIntervals.some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);
  const inHold = (t) => ov.holds.some((h) => t >= h.from && t < h.to);
  const screenIds = new Set([...(edl.cut_plan?.screen_punch ?? []).map((p) => p.clip_id), ...Object.keys(ctx.screenRegions ?? {})]);
  const forcedAt = (edl.cut_plan?.needs_cover ?? []).filter((j) => j.kind === 'micro_jump' && j.framed).map((j) => j.at);
  const words = (c) => (ctx.words?.[pathOf(c)] ?? ctx.words?.[c.src] ?? []);
  const toLocal = (c, srcT) => (srcT - c.in) / (c.speed ?? 1);
  const inClip = (c, srcT) => srcT >= c.in - 1e-6 && srcT < c.out - 1e-6;
  const extremes = [];

  // emphasis: judgment words + planner overrides (timeline seconds) → per clip local times
  const emphasisFor = (c) => {
    const list = [];
    for (const e of ctx.emphasis ?? []) if (norm(e.path) === pathOf(c) && inClip(c, e.t)) list.push({ t: toLocal(c, e.t), kind: e.kind ?? 'claim' });
    for (const e of ov.emphasis) if (Number.isFinite(e.t) && e.t >= c.at && e.t < c.at + clipLen(c)) list.push({ t: e.t - c.at, kind: e.kind });
    return list.sort((a, b) => a.t - b.t).filter((e, i, a) => !i || e.t - a[i - 1].t > 0.3);
  };
  const clausesFor = (c) => {
    const ws = words(c);
    const out = [];
    ws.forEach((w, i) => {
      if (/[,;:—–]$/.test(w.w) && inClip(c, w.end)) out.push(toLocal(c, w.end + 0.02));
      if (CLAUSE.test(String(w.w).replace(/[^\p{L}]/gu, '')) && i > 0 && inClip(c, w.start)) out.push(toLocal(c, w.start - 0.03));
    });
    return out.sort((a, b) => a - b);
  };

  // ---- shots: visible camera shots (cuts, b-roll exits, section openers, speaker changes)
  const shots = [];
  aClips.forEach((c, i) => {
    if (c.camera_by === 'user') return;
    const L = clipLen(c);
    const prev = aClips[i - 1];
    const adjacent = prev && Math.abs(prev.at + clipLen(prev) - c.at) <= frame * 0.6;
    const sameSrc = prev && prev.src === c.src;
    const jump = adjacent && sameSrc && Math.abs(prev.out - c.in) > frame * 1.5;
    const chapter = (ctx.chapters ?? []).find((ch) => norm(ch.path) === pathOf(c) && inClip(c, ch.t));
    const bounds = [{ t: 0, kind: !prev ? 'first' : chapter && toLocal(c, chapter.t) < 0.3 ? 'opener' : jump ? 'jump' : adjacent && sameSrc ? 'continue' : 'cut' }];
    if (chapter && toLocal(c, chapter.t) >= 0.5 && toLocal(c, chapter.t) < L - 1) bounds.push({ t: toLocal(c, chapter.t), kind: 'opener' });
    for (const [a, b] of broIntervals) if (b > c.at + 0.3 && b < c.at + L - 0.5 && a < b) bounds.push({ t: b - c.at, kind: 'opener', afterBroll: true });
    // podcast speaker framing
    if (ctx.podcast && !screenIds.has(c.id)) {
      const turns = speakerShots(words(c).filter((w) => inClip(c, w.start)).map((w) => ({ ...w, start: toLocal(c, w.start), end: toLocal(c, w.end) })), L, fps);
      if (turns.length) {
        bounds[0].speaker = turns[0].speaker;
        for (const tr of turns.slice(1)) bounds.push({ t: tr.t, kind: 'speaker', speaker: tr.speaker });
      }
    }
    bounds.sort((a, b) => a.t - b.t);
    const merged = [];
    for (const b of bounds) {
      const last = merged.at(-1);
      if (last && b.t - last.t < (ctx.podcast ? 1.5 : 0.5)) {
        if (b.kind === 'opener' && last.kind !== 'first') last.kind = 'opener';
        continue;
      }
      merged.push(b);
    }
    merged.forEach((b, k) => shots.push({ clip: c, t0: b.t, t1: merged[k + 1]?.t ?? L, kind: b.kind, speaker: b.speaker, screen: screenIds.has(c.id), forced: k === 0 && forcedAt.some((t) => Math.abs(t - c.at) < frame * 1.5) }));
  });

  // ---- geometry and heads
  const geomOf = (c) => coverGeometry(srcOf(c), canvas, c.fit);
  const capOf = (c) => zoomCap(geomOf(c), canvas);
  const trackOf = (c) => ctx.heads?.[c.src] ?? ctx.heads?.[pathOf(c)] ?? null;
  const headOf = (c, local) => headAt(trackOf(c), c.in + local * (c.speed ?? 1));
  const people = ctx.people ?? [{ cx: 0.27, eyes: 1 / 3, top: 0.2, chin: 0.48, gaze: 0.6 }, { cx: 0.73, eyes: 1 / 3, top: 0.2, chin: 0.48, gaze: -0.6 }];
  const stateFor = (shot, name, local, extra = {}) => {
    const c = shot.clip;
    const geom = geomOf(c);
    const cap = capOf(c);
    if (shot.speaker && name !== 'wide' && name !== 'wide+') {
      const p = people[shot.speaker === 'S2' ? 1 : 0];
      const single = frameFor('medium', { ...CENTRE_HEAD, ...p }, geom, { cap, zoom: Math.max(FRAMINGS.medium.zoom, Math.min(cap, 1.8)), ...extra });
      return single;
    }
    const s = frameFor(name, headOf(c, local), geom, { cap, ...extra });
    if (s.capped) warn(`tight punch limited: source is ${Math.round(Math.min(geom.W, geom.H))}p`);
    return s;
  };

  // ---- framing per shot
  let prevName = null;
  let cycle = 0;
  for (const shot of shots) {
    const L = shot.t1 - shot.t0;
    const tl = shot.clip.at + shot.t0;
    shot.emph = emphasisFor(shot.clip).filter((e) => e.t >= shot.t0 && e.t < shot.t1);
    let name;
    if (prevName && inHold(tl)) name = prevName;
    else if (shot.screen) name = 'wide';
    else if (ctx.podcast && shot.speaker !== undefined) name = shot.speaker ? 'medium' : 'wide';
    else if (shot.kind === 'opener' || (shot.kind === 'first' && energy <= 3)) name = 'wide';
    else if (energy === 3) name = prevName === 'wide' ? 'medium' : 'wide';
    else {
      name = pattern[cycle % pattern.length];
      cycle++;
      if (name === prevName) {
        name = pattern[cycle % pattern.length];
        cycle++;
      }
    }
    if (shot.kind === 'jump' && name === prevName && !inHold(tl) && shot.speaker === undefined) name = ZOOM_ORDER.find((n) => n !== name && (energy <= 2 ? n.startsWith('wide') : n === 'medium' || n === 'wide'));
    if (shot.forced && prevName && Math.abs(FRAMINGS[name].zoom - FRAMINGS[prevName].zoom) < 0.1) name = FRAMINGS[prevName].zoom >= 1.15 ? 'wide' : 'medium';
    if (shot.kind === 'opener') report.openers++;
    shot.name = name;
    if (shot.kind === 'jump' && name === prevName) report.repeats_at_jumps++;
    prevName = L > 0 ? name : prevName;
  }

  // ---- keys per shot
  for (const shot of shots) {
    const c = shot.clip;
    const end = shot.t1 - frame; // moves land at least a frame before the next cut
    const base = stateFor(shot, shot.name, shot.t0);
    const keys = [{ t: shot.t0, ...base }];
    shot.keys = keys;
    let cur = base;
    let lastT = shot.t0;
    const add = (start, endT, target, ease) => {
      keys.push({ t: start, x: cur.x, y: cur.y, zoom: cur.zoom, ease }, { t: endT, ...target });
      cur = target;
      lastT = endT;
    };
    if (shot.screen) {
      const regions = (ctx.screenRegions?.[c.id] ?? []).filter((r) => r.t1 > shot.t0 && r.t0 < shot.t1);
      const geom = geomOf(c);
      const cap = capOf(c);
      for (const r of regions) {
        const z = Math.min(cap, MAX_ZOOM, (0.62 * (geom.cw / geom.W)) / Math.max(1e-3, r.box.w), (0.62 * (geom.ch / geom.H)) / Math.max(1e-3, r.box.h));
        if (z < 1.2) continue;
        const start = Math.max(lastT + frame, shot.t0 + Math.max(0, r.t0 - shot.t0) + 0.15);
        const dur = cur.zoom > 1.05 ? 0.5 : 10 * frame;
        if (start + dur > end) break;
        add(start, start + dur, { x: r.box.x + r.box.w / 2, y: r.box.y + r.box.h / 2, zoom: r4(z) }, 'cubic');
        report.screen_punches++;
      }
      if (cur.zoom > 1.05 && end - lastT > 1.2) add(end - 0.45, end, base, 'cubic');
      continue;
    }
    if (inHold(c.at + shot.t0)) continue;
    for (const e of shot.emph) {
      if (inHold(c.at + e.t) || e.t < shot.t0 + 0.15 || e.t > end) continue;
      if (energy >= 4 && SNAP_KINDS.has(e.kind)) {
        const s = Math.max(lastT, e.t - 5 * frame);
        if (e.t - s < 4 * frame - 1e-6) continue;
        let name = cur.zoom >= FRAMINGS.tight.zoom - 0.03 ? 'extreme' : 'tight';
        if (name === 'extreme') {
          const tl = c.at + e.t;
          if (extremes.filter((x) => tl - x < 60).length >= 2 || capOf(c) < FRAMINGS.extreme.zoomRange[0]) continue;
          extremes.push(tl);
        }
        const target = stateFor(shot, name, e.t);
        if (target.zoom <= cur.zoom + 0.01) continue;
        add(s, e.t, target, 'expo_out');
        report.snaps++;
      } else {
        let start = e.t - 0.9;
        if (start < lastT) start = e.t - 0.6;
        if (start < lastT) start = lastT;
        if (e.t - start < 0.35) continue;
        const target = energy === 3 && (e.kind === 'number' || e.kind === 'claim') && cur.zoom < FRAMINGS.tight.zoom - 0.05 ? stateFor(shot, 'tight', e.t) : stateFor(shot, shot.name, e.t, { zoom: Math.min(capOf(c), cur.zoom + 0.08) });
        if (target.zoom <= cur.zoom + 0.01) continue;
        add(start, e.t, target, 'cubic');
        report.pushes++;
      }
    }
    // breathing camera on section openers (docs and talking-head pacing)
    if (shot.kind === 'opener' && energy <= 3 && keys.length === 1 && end - shot.t0 >= 1.8) {
      const d = Math.min(3, Math.max(1.5, end - shot.t0 - 0.2));
      add(shot.t0 + 0.1, shot.t0 + 0.1 + d, stateFor(shot, shot.name, shot.t0, { zoom: Math.min(capOf(c), cur.zoom + 0.04) }), 'sine');
    }
  }

  // ---- static-span budget: insert a push or framing change at a clause boundary
  const changeSpans = () => {
    const spans = [];
    for (const s of shots) {
      spans.push([s.clip.at + s.t0, s.clip.at + s.t0]);
      for (let i = 1; i < s.keys.length; i++) if (Math.abs(s.keys[i].zoom - s.keys[i - 1].zoom) > 1e-4 || Math.abs(s.keys[i].x - s.keys[i - 1].x) > 1e-4) spans.push([s.clip.at + s.keys[i - 1].t, s.clip.at + s.keys[i].t]);
    }
    for (const [a, b] of broIntervals) spans.push([a, a], [b, b]);
    return spans.sort((a, b) => a[0] - b[0]);
  };
  const unfixable = new Set();
  for (let guard = 0; guard < 400; guard++) {
    const spans = changeSpans();
    let fixed = false;
    for (const shot of shots) {
      if (shot.screen || fixed) continue;
      const c = shot.clip;
      const s0 = c.at + shot.t0;
      const s1 = c.at + shot.t1;
      let cursor = s0;
      const gaps = [];
      for (const [a, b] of spans) {
        if (b <= cursor) continue;
        if (a >= s1) break;
        if (a > cursor) gaps.push([cursor, a]);
        cursor = Math.max(cursor, b);
      }
      if (cursor < s1) gaps.push([cursor, s1]);
      for (const [g0, g1] of gaps) {
        const key = `${c.id}@${g0.toFixed(4)}`;
        if (g1 - g0 <= maxStatic + 1e-6 || unfixable.has(key) || covered((g0 + g1) / 2) || inHold(g0 + 0.5)) continue;
        const lo = g0 + Math.min(1, maxStatic * 0.35);
        const hi = g0 + maxStatic - 0.25;
        const clauses = clausesFor(c).map((t) => c.at + t).filter((t) => t >= lo && t <= hi);
        const at = (clauses.length ? clauses.at(-1) : g0 + maxStatic * 0.8) - c.at;
        const before = shot.keys.filter((k) => k.t <= at + 1e-9);
        const after = shot.keys.filter((k) => k.t > at + 1e-9);
        const cur = before.at(-1);
        const end = shot.t1 - frame;
        let next;
        let dur;
        let ease;
        if (energy >= 4 && !shot.speaker) {
          const idx = pattern.indexOf(shot.name);
          const name = [...pattern.slice(idx + 1), ...pattern].find((n) => Math.abs(Math.min(FRAMINGS[n].zoom, capOf(c)) - cur.zoom) > 0.081) ?? (cur.zoom > 1.1 ? 'wide' : 'medium');
          next = stateFor(shot, name, at);
          dur = 5 * frame;
          ease = 'expo_out';
        } else {
          const up = cur.zoom + 0.05 <= Math.min(capOf(c), FRAMINGS.tight.zoom);
          next = stateFor(shot, shot.name, at, { zoom: up ? cur.zoom + 0.05 : Math.max(1, cur.zoom - 0.06) });
          dur = Math.min(1.5, Math.max(0.4, end - at));
          ease = 'sine';
        }
        dur = Math.min(dur, end - at, after.length ? after[0].t - frame - at : Infinity);
        if (dur < 3 * frame || Math.abs(next.zoom - cur.zoom) < 0.01) {
          unfixable.add(key);
          continue;
        }
        if (ease === 'expo_out') report.snaps++;
        else report.pushes++;
        const ratio = next.zoom / cur.zoom;
        shot.keys = [...before, { t: at, x: cur.x, y: cur.y, zoom: cur.zoom, ease }, { t: at + dur, x: next.x, y: next.y, zoom: next.zoom }, ...after.map((k) => ({ ...k, zoom: r4(Math.max(1, Math.min(capOf(c), k.zoom * ratio))) }))];
        report.budget_inserts++;
        fixed = true;
        break;
      }
    }
    if (!fixed) break;
  }

  // ---- write keys onto clips (holds at in-clip shot boundaries; motion never crosses a cut)
  const byClip = new Map();
  for (const s of shots) {
    if (!byClip.has(s.clip.id)) byClip.set(s.clip.id, []);
    byClip.get(s.clip.id).push(s);
  }
  for (const [, list] of byClip) {
    const c = list[0].clip;
    const keys = [];
    list.forEach((s, i) => {
      const ks = s.keys.map((k) => ({ t: r4(Math.max(0, k.t)), x: r4(k.x), y: r4(k.y), zoom: r4(k.zoom), ease: k.ease ?? 'cubic' }));
      if (i < list.length - 1) ks[ks.length - 1].ease = 'hold';
      for (const k of ks) {
        if (keys.length && Math.abs(keys.at(-1).t - k.t) < 1e-4) keys[keys.length - 1] = k;
        else keys.push(k);
      }
    });
    const L = clipLen(c);
    c.camera = keys.filter((k) => k.t <= L + 1e-6);
    c.camera_by = 'director';
    c.camera_framing = list.map((s) => s.name);
    delete c.follow;
    // 9:16 (or any narrow crop) from a wider source: follow the subject with a gimbal path
    const geom = geomOf(c);
    const tr = trackOf(c);
    if (tr && !tr.static && tr.cx?.length > 1 && geom.cw < geom.W * 0.9 && !list.some((s) => s.screen || s.speaker)) {
      const n = Math.max(2, Math.ceil(L * fps) + 1);
      const target = Array.from({ length: n }, (_, f) => headAt(tr, c.in + (f / fps) * (c.speed ?? 1)).cx);
      const lo = (geom.cw / 2) / geom.W;
      const path = gimbalPath(target, { fps, dead: 0.04 * (geom.cw / geom.W), maxSpeed: 0.18 * (geom.cw / geom.W), lo: 0, hi: 1, sigma: 0.35 });
      const smooth = springFollow(path, fps, 5);
      c.follow = { fps, cx: smooth.map((v) => r4(Math.max(lo * 0.5, Math.min(1 - lo * 0.5, v)))), fx: 0.5 };
    }
    if (ov.style?.micro_drift && energy <= 2) c.drift = { amp: 0.0015, hz: 0.2, seed: [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 997 };
    else delete c.drift;
    report.shots += list.length;
    report.framings.push(...list.map((s) => s.name));
    report.speaker_shots += list.filter((s) => s.speaker).length;
  }

  planDirectorTransitions(edl, { track, aClips, energy, ctx, ov, fps, report, pathOf, inClip, toLocal });
  applyJL(edl, { track, fps, report, brolls });
  applyRamps(edl, { ov, aSet, track, report, warn, words });
  report.metrics = cameraMetrics(edl, { track, fps, maxStatic, brolls: broIntervals });
  return { edl, report };
}

/**
 * Podcast speaker shots on a clip's local timeline: the speaking person's single
 * after > 1.2 s of talk, two-shot (null) on overlaps and laughter, ≥ 1.5 s per shot,
 * cut anticipated 4 frames before the new speaker.
 */
export function speakerShots(words, length, fps) {
  const labelled = words.filter((w) => w.speaker);
  if (labelled.length < 2 || new Set(labelled.map((w) => w.speaker)).size < 2) return [];
  const runs = [];
  for (const w of words) {
    const laugh = /\b(ha(ha)+|lol|laugh(s|ter|ing)?)\b/i.test(w.w);
    const sp = laugh ? null : (w.speaker ?? runs.at(-1)?.speaker ?? null);
    const last = runs.at(-1);
    if (last && last.speaker === sp) last.end = Math.max(last.end, w.end);
    else {
      // an overlap (this word starts before the other speaker finished) shows the two-shot
      if (last && last.speaker && sp && w.start < last.end - 0.05) runs.push({ speaker: null, start: w.start, end: last.end });
      runs.push({ speaker: sp, start: w.start, end: w.end });
    }
  }
  const lead = 4 / fps;
  const shots = [];
  for (const r of runs) {
    const cur = shots.at(-1)?.speaker;
    const want = r.speaker ? (r.end - r.start > 1.2 ? r.speaker : shots.length ? cur : r.speaker) : null;
    if (shots.length && want === cur) continue;
    const t = shots.length ? Math.max(0, r.start - lead) : 0;
    if (shots.length && t - shots.at(-1).t < 1.5) continue; // minimum 1.5 s per shot
    shots.push({ t, speaker: want });
  }
  while (shots.length > 1 && length - shots.at(-1).t < 1.5) shots.pop();
  return shots;
}

function planDirectorTransitions(edl, { aClips, energy, ctx, ov, fps, report, pathOf, inClip, toLocal }) {
  const frame = 1 / fps;
  const set = (c, kind, color) => {
    if (kind === 'cut') {
      delete c.transition_in;
      return;
    }
    const dur = TRANSITION_FRAMES[kind] * frame;
    c.transition_in = { kind, dur: r4(dur), by: 'director', ...(color ? { color } : {}) };
    report.transitions[kind] = (report.transitions[kind] ?? 0) + 1;
    if (kind === 'whip') {
      edl.markers = (edl.markers ?? []).filter((m) => !(m.kind === 'whoosh' && m.clip === c.id));
      edl.markers.push({ t: r4(c.at - dur / 2), kind: 'whoosh', clip: c.id, note: 'whip SFX; the licensed sound is placed by the sound phase' });
    }
  };
  edl.markers = (edl.markers ?? []).filter((m) => m.kind !== 'whoosh');
  for (const c of aClips) if (c.transition_in?.by === 'director') delete c.transition_in;
  // sections: chapter starts that land at a cut
  aClips.forEach((c, i) => {
    if (!i) return;
    const ch = (ctx.chapters ?? []).find((x) => norm(x.path) === pathOf(c) && inClip(c, x.t) && toLocal(c, x.t) < 0.3);
    if (!ch || c.transition_in) return;
    if (energy >= 4) set(c, 'whip');
    else if (energy <= 2) set(c, 'dip');
  });
  for (const t of ov.transitions) {
    const all = edl.video.flatMap((tr) => tr.clips);
    const c = all.filter((x) => Math.abs(x.at - t.at) <= 0.5).sort((a, b) => Math.abs(a.at - t.at) - Math.abs(b.at - t.at))[0];
    if (!c) {
      report.warnings.push(`transition at ${t.at.toFixed(2)} s: no cut there`);
      continue;
    }
    if (t.kind === 'jcut' || t.kind === 'lcut') {
      const msg = shiftPictureCut(edl, c, t.kind, fps);
      if (msg) report.warnings.push(msg);
      else report.transitions[t.kind] = (report.transitions[t.kind] ?? 0) + 1;
      continue;
    }
    set(c, t.kind, t.color);
  }
}

/** A J/L-cut between two different A-roll sources: move the picture cut, keep the sound cut. */
function shiftPictureCut(edl, c, kind, fps) {
  const track = edl.video.find((t) => t.clips.includes(c));
  const clips = [...track.clips].sort((a, b) => a.at - b.at);
  const prev = clips[clips.indexOf(c) - 1];
  const n = JL_FRAMES / fps;
  if (!prev || Math.abs(prev.at + clipLen(prev) - c.at) > 1.5 / fps) return `${kind} at ${c.at.toFixed(2)} s: no adjacent clip before it`;
  if (prev.src === c.src) return `${kind} at ${c.at.toFixed(2)} s: same-speaker jump cut keeps sync (J/L-cuts are for b-roll and speaker changes)`;
  const sp = edl.sources.find((s) => s.id === prev.src);
  if (kind === 'jcut') {
    // sound of the next shot leads: the outgoing picture runs on N frames
    if (clipLen(c) <= n * 2 || (sp?.duration && prev.out + n * prev.speed > sp.duration)) return `jcut at ${c.at.toFixed(2)} s: not enough handle`;
    prev.out = r4(prev.out + n * (prev.speed ?? 1));
    c.in = r4(c.in + n * (c.speed ?? 1));
    c.at = r4(c.at + n);
  } else {
    if (clipLen(prev) <= n * 2 || c.in - n * (c.speed ?? 1) < 0) return `lcut at ${c.at.toFixed(2)} s: not enough handle`;
    prev.out = r4(prev.out - n * (prev.speed ?? 1));
    c.in = r4(c.in - n * (c.speed ?? 1));
    c.at = r4(c.at - n);
  }
  return null;
}

/** J/L-cuts on every b-roll entry and exit: the b-roll's own sound leads in and trails out. */
function applyJL(edl, { fps, report, brolls }) {
  const n = JL_FRAMES / fps;
  for (const v of brolls) {
    for (const t of edl.audio) {
      const a = t.clips.find((x) => x.linked === v.id);
      if (!a) continue;
      if (a.jl) continue;
      const sp = a.speed ?? 1;
      const others = t.clips.filter((x) => x !== a);
      const end = (x) => x.at + (x.dur ?? (x.out - x.in) / (x.speed ?? 1));
      const prevEnd = Math.max(0, ...others.filter((x) => end(x) <= a.at + 1e-6).map(end));
      const nextStart = Math.min(Infinity, ...others.filter((x) => x.at >= end(a) - 1e-6).map((x) => x.at));
      const src = edl.sources.find((s) => s.id === a.src);
      const lead = Math.max(0, Math.min(n, a.at - prevEnd, a.in / sp, a.at));
      const trail = Math.max(0, Math.min(n, nextStart - end(a), src?.duration ? (src.duration - a.out) / sp : n));
      if (lead + trail < 1 / fps) continue;
      a.at = r4(a.at - lead);
      a.in = r4(a.in - lead * sp);
      a.out = r4(a.out + trail * sp);
      a.fade_in = r4(Math.max(0.01, lead));
      a.fade_out = r4(Math.max(0.01, trail));
      a.jl = { lead: r4(lead), trail: r4(trail) };
      report.jl++;
    }
  }
}

/** Speed ramps (planner-requested, b-roll/action only): ease 1 → min → 1, sound muted. */
function applyRamps(edl, { ov, aSet, report, warn, words }) {
  for (const r of ov.ramps) {
    const c = edl.video.flatMap((t) => t.clips).find((x) => x.id === r.clip);
    if (!c) {
      warn(`speed_ramp: unknown clip ${r.clip}`);
      continue;
    }
    const L = clipLen(c);
    const speech = aSet.has(c.id) && words(c).some((w) => w.start < c.out && w.end > c.in);
    if (speech) {
      warn(`speed_ramp on ${c.id} refused: ramps are for b-roll and action, never speech`);
      continue;
    }
    const at = Math.min(Math.max(0, r.at), Math.max(0, L - 0.2));
    c.ramp = { at: r4(at), dur: r4(Math.min(r.dur, L - at)), min: r.min };
    for (const t of edl.audio) t.clips = t.clips.filter((a) => a.linked !== c.id);
    c.ramp_muted = true;
    report.ramps++;
  }
}

/** Camera metrics: framing variety per 30 s, max static span, repeats at consecutive jump cuts. */
export function cameraMetrics(edl, { track = arollTrack(edl), fps = rateOf(edl.canvas.fps), maxStatic = maxStaticFor(edl.canvas), brolls = [] } = {}) {
  const clips = [...(track?.clips ?? [])].sort((a, b) => a.at - b.at);
  const end = clips.length ? clips.at(-1).at + clipLen(clips.at(-1)) : 0;
  const events = [];
  const names = [];
  let repeats = 0;
  let prevName = null;
  clips.forEach((c, i) => {
    const prev = clips[i - 1];
    events.push([c.at, c.at]);
    const keys = c.camera ?? [];
    for (let k = 1; k < keys.length; k++) if (Math.abs(keys[k].zoom - keys[k - 1].zoom) > 1e-4 || Math.abs(keys[k].x - keys[k - 1].x) > 1e-4) events.push([c.at + (keys[k - 1].ease === 'hold' ? keys[k].t : keys[k - 1].t), c.at + keys[k].t]);
    const fr = c.camera_framing ?? [];
    fr.forEach((n) => names.push({ t: c.at, n }));
    const jump = prev && prev.src === c.src && Math.abs(prev.at + clipLen(prev) - c.at) < 1.5 / fps && Math.abs(prev.out - c.in) > 1.5 / fps;
    if (jump && fr[0] && fr[0] === prevName) repeats++;
    prevName = fr.at(-1) ?? null;
  });
  for (const [a, b] of brolls) events.push([a, a], [b, b]);
  events.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  let maxGap = 0;
  for (const [a, b] of events) {
    if (a > cursor) maxGap = Math.max(maxGap, a - cursor);
    cursor = Math.max(cursor, b);
  }
  maxGap = Math.max(maxGap, end - cursor);
  const windows = Math.max(1, Math.ceil(end / 30));
  const variety = [];
  for (let w = 0; w < windows; w++) variety.push(new Set(names.filter((x) => x.t >= w * 30 && x.t < (w + 1) * 30).map((x) => x.n)).size);
  return { framing_variety_30s: Math.min(...variety), max_static_s: +maxGap.toFixed(2), max_static_target: maxStatic, repeats_at_jumps: repeats, shots: names.length };
}

/**
 * Invariant: no camera motion across a cut. Every director clip's keys lie
 * inside the clip, the first starts at 0 and no move is still running at the
 * clip's last frame. Returns violation strings (empty = ok).
 */
export function motionAcrossCuts(edl) {
  const out = [];
  const fps = rateOf(edl.canvas.fps);
  for (const t of edl.video)
    for (const c of t.clips) {
      const keys = c.camera ?? [];
      if (!keys.length || c.camera_by !== 'director') continue;
      const L = clipLen(c);
      if (keys[0].t > 1e-6) out.push(`${c.id}: first key at ${keys[0].t}`);
      if (keys.some((k) => k.t < -1e-6 || k.t > L + 1e-6)) out.push(`${c.id}: key outside the clip`);
      const last = keys.at(-1);
      const prev = keys.at(-2);
      if (prev && prev.ease !== 'hold' && last.t > L - 1 / fps + 1e-3 && (Math.abs(last.zoom - prev.zoom) > 1e-6 || Math.abs(last.x - prev.x) > 1e-6)) out.push(`${c.id}: a move is still running at the cut`);
    }
  return out;
}

// ---------------------------------------------------------------- planner tools
export const CAMERA_TOOLS = ['camera_style', 'camera_emphasis', 'camera_hold', 'transition', 'speed_ramp'];
export const CAMERA_TOOL_TEXT = `camera_style(energy*:number(1-5), pattern:string, micro_drift:boolean) — the app's camera director frames every jump cut, emphasis word, section opener and podcast speaker automatically; use this only to change the energy (5 shorts punchy, 3 youtube talking head, 1-2 documentary) or the framing pattern (e.g. "medium,tight,medium,wide"; names: wide, medium, tight, extreme). micro_drift adds a subtle filmed feel on calm (energy ≤ 2) edits.
camera_emphasis(at:number, sentence:number, word:string, kind(number|punchline|claim|contrast|name|emotion)) — an extra push (or a snap punch at energy ≥ 4 on numbers/punchlines) landing on that word; at = timeline seconds of the word onset.
camera_hold(from*:number, to*:number) — keep the camera still over this timeline range (no pushes or framing changes).
transition(at*:number, kind*(cut|whip|zoom|dip|jcut|lcut), color(black|white)) — at the cut nearest at (timeline s). creators mostly hard cut: use whip between sections at high energy, dip for documentary sections, jcut/lcut at a cut between two different cameras. b-roll entries/exits get J/L-cuts automatically.
speed_ramp(clip*:string, at:number, dur:number, min_speed:number(0.2-0.9)) — slow-motion ramp 1 → min → 1 on a b-roll/action clip (never speech); at = seconds into the clip. its sound is muted.
camera tools replace add_punch_ins/add_smart_punch: never punch or zoom the talking track yourself.`;

/** Applies one planner camera call to the overrides; returns {ok, text}. */
export function cameraToolCall(overrides, name, args = {}) {
  const o = overrides;
  const n = (v) => (v == null || v === '' ? NaN : Number(v));
  switch (name) {
    case 'camera_style': {
      const energy = Math.round(n(args.energy));
      if (!(energy >= 1 && energy <= 5)) return { ok: false, text: 'energy must be 1-5' };
      o.style = { energy, pattern: args.pattern, micro_drift: Boolean(args.micro_drift) };
      const norm = normalizeOverrides({ style: o.style }).style;
      return { ok: true, text: JSON.stringify({ camera: 'director', energy, pattern: norm.pattern ?? PATTERNS[energy], micro_drift: Boolean(norm.micro_drift && energy <= 2) }) };
    }
    case 'camera_emphasis': {
      const t = n(args.at ?? args.t);
      if (!Number.isFinite(t) && !(Number.isInteger(args.sentence) && args.word)) return { ok: false, text: 'give at (timeline seconds) or sentence + word' };
      (o.emphasis ??= []).push({ t: Number.isFinite(t) ? t : undefined, sentence: args.sentence, word: args.word, kind: args.kind ?? 'claim' });
      return { ok: true, text: JSON.stringify({ emphasis: o.emphasis.length, at: Number.isFinite(t) ? t : null }) };
    }
    case 'camera_hold': {
      const from = n(args.from ?? args.range?.[0]);
      const to = n(args.to ?? args.range?.[1]);
      if (!(to > from)) return { ok: false, text: 'from/to timeline seconds required, to > from' };
      (o.holds ??= []).push({ from, to });
      return { ok: true, text: JSON.stringify({ hold: [from, to] }) };
    }
    case 'transition': {
      const r = normalizeOverrides({ transitions: [args] }).transitions[0];
      if (!r) return { ok: false, text: 'at (timeline s) and kind cut|whip|zoom|dip|jcut|lcut required' };
      o.transitions = (o.transitions ?? []).filter((t) => Math.abs(Number(t.at) - r.at) > 0.25);
      o.transitions.push(r);
      return { ok: true, text: JSON.stringify(r) };
    }
    case 'speed_ramp': {
      const r = normalizeOverrides({ ramps: [args] }).ramps[0];
      if (!r) return { ok: false, text: 'clip id required; at ≥ 0, dur > 0' };
      o.ramps = (o.ramps ?? []).filter((x) => x.clip !== r.clip);
      o.ramps.push(r);
      return { ok: true, text: JSON.stringify(r) };
    }
    default:
      return { ok: false, text: `unknown camera tool ${name}` };
  }
}

/**
 * Director inputs from a Phase 3 cut plan and its transcripts (source times by
 * file path): words, emphasis word onsets and chapter starts.
 */
export function cameraInputsFromCut(plan, clips) {
  const words = {};
  for (const c of clips ?? []) if (c.transcript?.words?.length) words[norm(c.file.path)] = c.transcript.words.map((w) => ({ w: w.w, start: w.start, end: w.end, ...(w.speaker ? { speaker: w.speaker } : {}) }));
  const sentenceAt = (i) => plan.sentences?.find((s) => s.i === i) ?? null;
  const pathOfSrc = (src) => norm(clips.find((c) => c.src === src)?.file.path);
  const emphasis = [];
  for (const e of plan.judgment?.emphasis ?? []) {
    const s = sentenceAt(e.sentence);
    if (!s) continue;
    const path = pathOfSrc(s.src);
    const ws = (words[path] ?? []).filter((w) => w.start >= s.start - 0.05 && w.end <= s.end + 0.05);
    const key = String(e.word ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const w = ws.find((x) => x.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === key) ?? ws.find((x) => key && x.w.toLowerCase().includes(key));
    if (w) emphasis.push({ path, t: w.start, kind: e.kind ?? 'claim', word: w.w });
  }
  const chapters = [];
  for (const ch of plan.judgment?.chapters ?? []) {
    const s = sentenceAt(ch.t_sentence);
    if (s) chapters.push({ path: pathOfSrc(s.src), t: s.start, title: ch.title });
  }
  return { words, emphasis, chapters };
}
