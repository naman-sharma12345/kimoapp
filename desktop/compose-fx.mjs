// Clip transitions and B-roll masks for the app compositor. Pure functions: the
// compositor folds them into the per-frame camera/opacity samples it already
// computes in JS, so every effect stays frame-exact in both strategies.

export const TRANSITION_KINDS = ['cut', 'dip', 'whip', 'zoom', 'morph'];
export const MASK_SHAPES = ['rect', 'ellipse'];

const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const smoother = (u) => {
  u = clamp01(u);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const easeIn = (u) => clamp01(u) ** 3;
const easeOut = (u) => 1 - (1 - clamp01(u)) ** 3;

/** Accepts the EDL shape plus the aliases native projects use. */
export function normalizeTransition(t) {
  if (!t || typeof t !== 'object') return null;
  const kind = String(t.kind ?? t.type ?? 'cut').toLowerCase();
  const dur = Number(t.dur ?? t.duration ?? 0);
  if (kind === 'cut' || !(dur > 0)) return null;
  return { kind, dur };
}

const clipEnd = (c) => c.at + (c.out - c.in) / (c.speed ?? 1);

/**
 * Splits every declared transition across the cut it sits on: the outgoing clip
 * gets the first half, the incoming clip the second half. A transition with no
 * adjacent clip before it plays entirely on the incoming clip. Mutates the
 * compositor's private EDL copy (`_fx` keys) and returns warnings.
 */
export function planTransitions(edl, fps) {
  const warnings = [];
  const frame = 1 / fps;
  for (const track of edl.video) {
    const clips = [...track.clips].sort((a, b) => a.at - b.at);
    clips.forEach((clip, i) => {
      const t = normalizeTransition(clip.transition_in);
      if (!t) return;
      let kind = t.kind;
      if (!TRANSITION_KINDS.includes(kind)) {
        warnings.push(`${clip.id}: unknown transition ${kind}; rendered as a cut`);
        return;
      }
      if (kind === 'morph') {
        warnings.push(`${clip.id}: morph transition rendered as a dip`);
        kind = 'dip';
      }
      const prev = clips[i - 1];
      const adjacent = prev && Math.abs(clipEnd(prev) - clip.at) <= frame * 0.51;
      const length = clipEnd(clip) - clip.at;
      if (adjacent) {
        const half = Math.min(t.dur / 2, length / 2, (clipEnd(prev) - prev.at) / 2);
        clip._fx = { ...clip._fx, in: { kind, d: half } };
        prev._fx = { ...prev._fx, out: { kind, d: half } };
      } else
        clip._fx = {
          ...clip._fx,
          in: { kind, d: Math.min(t.dur, length / 2) },
        };
    });
  }
  return warnings;
}

/**
 * Multiplicative envelope for clip-local time t (seconds from clip start) on a
 * clip lasting `length` seconds. zoom/alpha multiply; dx shifts the camera
 * centre in crop widths; blur is 0..1 horizontal motion-blur strength.
 */
export function transitionEnvelope(fx, t, length) {
  const env = { alpha: 1, zoom: 1, dx: 0, blur: 0 };
  if (!fx) return env;
  const apply = (side, u) => {
    // u: 0 at the cut, 1 at the far edge of the transition (fully settled).
    const k = 1 - u;
    if (side.kind === 'dip') env.alpha *= smoother(u);
    else if (side.kind === 'zoom') env.zoom *= 1 + 0.3 * smoother(k);
    else if (side.kind === 'whip') {
      const w = side === fx.out ? easeIn(k) : 1 - easeOut(u);
      env.zoom *= 1 + 0.5 * Math.min(1, w * 1.6);
      env.dx += (side === fx.out ? 0.25 : -0.25) * w;
      env.blur = Math.max(env.blur, w);
    }
  };
  if (fx.in?.d > 0 && t < fx.in.d) apply(fx.in, t / fx.in.d);
  if (fx.out?.d > 0 && t > length - fx.out.d)
    apply(fx.out, (length - t) / fx.out.d);
  return env;
}

/** FFmpeg `enable` expression covering the frame indices where pred(i) holds. */
export function frameRanges(values, pred, limit = 24) {
  const ranges = [];
  values.forEach((v, i) => {
    if (!pred(v)) return;
    const last = ranges.at(-1);
    if (last && last[1] === i - 1) last[1] = i;
    else ranges.push([i, i]);
  });
  if (!ranges.length) return null;
  if (ranges.length > limit) return '1';
  return ranges.map(([a, b]) => `between(n,${a},${b})`).join('+');
}

/** Accepts the documented EDL mask shape; anything else is reported, not guessed. */
export function normalizeMask(mask) {
  if (!mask || typeof mask !== 'object') return null;
  const shape = String(mask.shape ?? '').toLowerCase();
  if (!MASK_SHAPES.includes(shape)) return null;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    shape,
    x: num(mask.x, 0.5),
    y: num(mask.y, 0.5),
    w: Math.max(0, num(mask.w, 1)),
    h: Math.max(0, num(mask.h, 1)),
    radius: Math.max(0, num(mask.radius, 0)),
    feather: Math.max(0, num(mask.feather, 0.01)),
    invert: Boolean(mask.invert),
  };
}

const f6 = (n) => Number(n.toFixed(6));

/** Grey-level (0..255) geq expression of a feathered shape at canvas size. */
export function maskExpression(mask, canvas) {
  const m = normalizeMask(mask);
  if (!m) return null;
  const short = Math.min(canvas.w, canvas.h);
  const cx = f6(m.x * canvas.w),
    cy = f6(m.y * canvas.h),
    hw = f6(Math.max(0.5, (m.w * canvas.w) / 2)),
    hh = f6(Math.max(0.5, (m.h * canvas.h) / 2)),
    f = f6(Math.max(1, m.feather * short));
  let inside;
  if (m.shape === 'ellipse') {
    // Approximate signed distance: radial distance scaled by the smaller radius.
    const r = Math.min(hw, hh);
    inside = `clip(0.5-(hypot((X-${cx})/${hw},(Y-${cy})/${hh})-1)*${f6(r)}/${f},0,1)`;
  } else {
    const r = f6(Math.min(m.radius * short, hw, hh));
    const qx = `(abs(X-${cx})-${f6(hw - r)})`,
      qy = `(abs(Y-${cy})-${f6(hh - r)})`;
    const sd = `(hypot(max(${qx},0),max(${qy},0))+min(max(${qx},${qy}),0)-${r})`;
    inside = `clip(0.5-${sd}/${f},0,1)`;
  }
  return m.invert ? `255-255*${inside}` : `255*${inside}`;
}

/**
 * Filter-graph fragment that multiplies the stream's alpha by a static mask.
 * The mask is rasterised once (single geq frame, then looped), so the per-frame
 * cost is one blend. `label` must be unique within the graph.
 */
export function maskFilter(mask, canvas, label) {
  const expr = maskExpression(mask, canvas);
  if (!expr) return null;
  const L = (s) => `${s}${label}`;
  const fps = `(${canvas.fps})`;
  return [
    `[${L('mi')}]`,
    `;color=c=black:s=${canvas.w}x${canvas.h}:r=${canvas.fps},format=gray,trim=end_frame=1,geq=lum='${expr}',loop=loop=-1:size=1,setpts=N/(${fps}*TB)[${L('mk')}]`,
    `;[${L('mi')}]setpts=N/(${fps}*TB),split[${L('mc')}][${L('mq')}]`,
    `;[${L('mq')}]alphaextract[${L('ma')}]`,
    `;[${L('ma')}][${L('mk')}]blend=all_mode=multiply:shortest=1[${L('mb')}]`,
    `;[${L('mc')}][${L('mb')}]alphamerge=shortest=1`,
  ].join('');
}
