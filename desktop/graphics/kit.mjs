// Shared helpers for the motion-graphics elements. Browser-safe (no Node
// imports): the same module is loaded by the Chromium render page and by Node
// (layout, planning, the soft canvas).
import { graphicEase, clamp01 } from './easing.mjs';

export { graphicEase, clamp01 };

/** Bundled faces: CSS family + weight/style → file in desktop/fonts (all OFL). */
export const FONT_FACES = Object.freeze([
  { family: 'Geist', weight: 600, style: 'normal', file: 'Geist-SemiBold.ttf' },
  { family: 'Geist', weight: 700, style: 'normal', file: 'Geist-Bold.ttf' },
  { family: 'Geist', weight: 900, style: 'normal', file: 'Geist-Black.ttf' },
  { family: 'Montserrat', weight: 800, style: 'normal', file: 'Montserrat-ExtraBold.ttf' },
  { family: 'Montserrat', weight: 900, style: 'normal', file: 'Montserrat-Black.ttf' },
  { family: 'Bangers', weight: 400, style: 'normal', file: 'Bangers-Regular.ttf' },
  { family: 'Instrument Serif', weight: 400, style: 'normal', file: 'InstrumentSerif-Regular.ttf' },
  { family: 'Instrument Serif', weight: 400, style: 'italic', file: 'InstrumentSerif-Italic.ttf' },
  { family: 'Noto Sans Devanagari', weight: 700, style: 'normal', file: 'NotoSansDevanagari-Bold.ttf' },
  { family: 'Noto Sans Devanagari', weight: 900, style: 'normal', file: 'NotoSansDevanagari-Black.ttf' },
]);

/** CSS font shorthand for a theme font spec at a pixel size. */
export const fontCss = (f, size) => `${f.style === 'italic' ? 'italic ' : ''}${f.weight ?? 400} ${Math.max(1, size).toFixed(2)}px ${f.family}`;

/** Aspect class of a canvas: 9:16, 4:5, 1:1 or 16:9. */
export function aspectOf(canvas) {
  const r = canvas.w / canvas.h;
  if (r < 0.7) return '9:16';
  if (r < 0.9) return '4:5';
  if (r < 1.2) return '1:1';
  return '16:9';
}
export const isVertical = (canvas) => canvas.h > canvas.w;
export const isWide = (canvas) => canvas.w > canvas.h * 1.2;

/**
 * Platform safe area (same rule as the captions): vertical canvases keep text
 * out of the top 12 %, bottom 22 % and right 15 % (shorts/reels/tiktok UI);
 * square and landscape use 90 % title-safe.
 */
export function safeArea(canvas) {
  const { w, h } = canvas;
  if (h > w) return { x0: 0.06 * w, x1: 0.85 * w, y0: 0.12 * h, y1: 0.78 * h, cx: 0.5 * w, maxW: 0.7 * w, vertical: true };
  return { x0: 0.05 * w, x1: 0.95 * w, y0: 0.05 * h, y1: 0.95 * h, cx: 0.5 * w, maxW: 0.86 * w, vertical: false };
}
/** Unit of measure for an element: the canvas short side / 1080. */
export const unit = (canvas) => Math.min(canvas.w, canvas.h) / 1080;

/** Deterministic PRNG (mulberry32) from a string or number seed. */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1779033703);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * In/out envelope on frames: {in: 0..1 eased progress of the entrance,
 * out: 0..1 progress of the exit, alive}. t is seconds since the element began.
 */
export function envelope(t, dur, fps, { inFrames = 8, outFrames = 6, inEase = 'expo_out', outEase = 'cubic_in', delay = 0 } = {}) {
  const f = t * fps;
  const total = dur * fps;
  const i = clamp01((f - delay * fps) / Math.max(1, inFrames));
  const o = clamp01((f - (total - outFrames)) / Math.max(1, outFrames));
  return { in: graphicEase(inEase)(i), inRaw: i, out: graphicEase(outEase)(o), outRaw: o, alive: f >= 0 && f < total };
}

/** Rounded rectangle path (explicit arcs, identical in Chromium and the soft canvas). */
export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** Polyline length and the polyline cut at a fraction of it (stroke-dashoffset style draw-on). */
export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
export function partialPolyline(pts, frac) {
  if (frac >= 1) return pts;
  if (frac <= 0 || pts.length < 2) return pts.slice(0, 1);
  const target = polylineLength(pts) * frac;
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + seg >= target) {
      const u = seg ? (target - acc) / seg : 0;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]);
      return out;
    }
    acc += seg;
    out.push(pts[i]);
  }
  return out;
}
export function strokePolyline(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

/** Soft drop shadow settings scaled to the canvas unit. */
export function setShadow(ctx, colour, blur, ox = 0, oy = 0) {
  ctx.shadowColor = colour;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox;
  ctx.shadowOffsetY = oy;
}
export function clearShadow(ctx) {
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
/** CSS rgba() of a #hex colour with an alpha multiplier. */
export function withAlpha(hex, a) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(4)})`;
}
export const lerp = (a, b, u) => a + (b - a) * u;
export const applyCase = (text, c) => (c === 'upper' ? String(text).toUpperCase() : String(text));

/** Clamp a box into a container box (both {x, y, w, h}). */
export function clampBox(b, c) {
  const x = Math.max(c.x0, Math.min(c.x1 - b.w, b.x));
  const y = Math.max(c.y0, Math.min(c.y1 - b.h, b.y));
  return { ...b, x, y };
}
/** Integer, even-sized pixel box grown by a margin and kept inside the canvas. */
export function pixelBox(b, canvas, margin = 0) {
  let x0 = Math.floor(b.x - margin);
  let y0 = Math.floor(b.y - margin);
  let x1 = Math.ceil(b.x + b.w + margin);
  let y1 = Math.ceil(b.y + b.h + margin);
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(canvas.w, x1);
  y1 = Math.min(canvas.h, y1);
  if ((x1 - x0) % 2) x1 < canvas.w ? x1++ : x0--;
  if ((y1 - y0) % 2) y1 < canvas.h ? y1++ : y0--;
  return { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.max(2, x1 - Math.max(0, x0)), h: Math.max(2, y1 - Math.max(0, y0)) };
}

/**
 * Text at a baseline with the theme's optional outline (stroke under fill) and a
 * soft shadow. o: {font, size, fill, stroke, strokeWidth, shadow:[colour, blur, ox, oy], align, spacing}
 */
export function drawText(ctx, text, x, y, o) {
  ctx.save();
  ctx.font = fontCss(o.font, o.size);
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = `${(o.spacing ?? 0).toFixed(2)}px`;
  if (o.shadow) setShadow(ctx, ...o.shadow);
  if (o.stroke && o.strokeWidth > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeWidth;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(text, x, y);
    clearShadow(ctx);
  }
  ctx.fillStyle = o.fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}
