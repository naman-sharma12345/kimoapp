// Shared drawing for the explainer families (Phase 7). Browser-safe: the
// Chromium render page and the soft canvas load the same code.
//
// Timing contract: every family gets props.items[i].t, the second (from the
// visual's own start) at which item i enters: 2 frames before its spoken
// word, computed by explain/timing.mjs. Items animate in on that time
// (slide 24 px + fade over 7 frames, cubic-out); the item being talked about
// is in the accent colour; earlier items dim to 60 %.
import { clamp01, graphicEase, roundRectPath, withAlpha, setShadow, clearShadow, unit, fontCss } from '../../graphics/kit.mjs';

export const REVEAL_FRAMES = 7;
export const SLIDE_PX = 24;

/**
 * Frames since an item's entry frame, counting the entry frame itself as 1
 * (0 before it). The entry frame is the first frame at or after itemT, so an
 * item is already visible on that exact frame, not one frame later.
 */
export function entryFrames(t, itemT, fps) {
  const f = Math.floor((t - itemT) * fps + 1e-6);
  return f < 0 ? 0 : f + 1;
}
/** 0..1 eased reveal of an item that enters at itemT (seconds) at time t (visible from its entry frame). */
export function reveal(t, itemT, fps, frames = REVEAL_FRAMES, ease = 'cubic_out') {
  return graphicEase(ease)(clamp01(entryFrames(t, itemT, fps) / frames));
}
/** Index of the item being talked about at t (last entered), or -1. */
export function activeIndex(items, t) {
  let k = -1;
  for (let i = 0; i < items.length; i++) if (t >= (items[i].t ?? 0) - 1e-9) k = i;
  return k;
}
/** Whole-visual fade in/out (6 frames in, 6 out). */
export function visualAlpha(t, dur, fps, inF = 6, outF = 6) {
  const a = clamp01(entryFrames(t, 0, fps) / inF);
  const b = clamp01(((dur - t) * fps) / outF);
  return graphicEase('cubic_out')(Math.min(a, b));
}

/**
 * Ink panel at 88 % behind the visual (readable over any footage), soft
 * shadow, theme radius. full = edge-to-edge (full / pip layouts).
 */
export function drawPanel(ctx, P, theme, canvas, { alpha = 0.88, full = false, glow = 0 } = {}) {
  const u = unit(canvas);
  const r = full ? 0 : Math.max(10 * u, (theme.radius ?? 0.018) * Math.min(canvas.w, canvas.h));
  ctx.save();
  if (!full) setShadow(ctx, withAlpha(theme.colors.shadow, 0.45), 40 * u, 0, 12 * u);
  roundRectPath(ctx, P.x, P.y, P.w, P.h, r);
  ctx.fillStyle = withAlpha(theme.colors.panel ?? theme.colors.ink, full ? 0.97 : alpha);
  ctx.fill();
  clearShadow(ctx);
  if (!full) {
    roundRectPath(ctx, P.x + 0.75, P.y + 0.75, P.w - 1.5, P.h - 1.5, r);
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = withAlpha(theme.colors.text, 0.1 + 0.25 * glow);
    ctx.stroke();
  }
  ctx.restore();
}

/** Fits text into maxW by shrinking down to minSize, then truncates with "…". Returns {text, size, truncated}. */
export function fitText(env, text, font, size, maxW, minSize = size * 0.6, spacing = 0) {
  let s = size;
  let str = String(text ?? '');
  for (let i = 0; i < 14 && s > minSize && env.measure(str, font, s, spacing) > maxW; i++) s *= 0.93;
  s = Math.max(minSize, s);
  let truncated = false;
  if (env.measure(str, font, s, spacing) > maxW) {
    truncated = true;
    const chars = [...str];
    while (chars.length > 1 && env.measure(`${chars.join('').trimEnd()}…`, font, s, spacing) > maxW) chars.pop();
    str = `${chars.join('').trimEnd()}…`;
  }
  return { text: str, size: s, truncated };
}

/** Word wrap into at most maxLines lines of width maxW at a fixed size. */
export function wrapLines(env, text, font, size, maxW, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (env.measure(next, font, size) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines);
    head[maxLines - 1] = `${head[maxLines - 1].replace(/[\s.,;:]+$/, '')}…`;
    return { lines: head, truncated: true };
  }
  return { lines, truncated: false };
}

/** Plain text draw (no outline) at a baseline. */
export function text(ctx, str, x, y, font, size, fill, align = 'left', spacing = 0) {
  ctx.font = fontCss(font, size);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = `${spacing.toFixed(2)}px`;
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

/** Relative luminance contrast ratio of two #hex colours (WCAG). */
export function contrastRatio(a, b) {
  const lum = (hex) => {
    const h = String(hex).replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Panel padding and type scale for a panel box. */
export function scale(P, canvas) {
  const u = unit(canvas);
  const s = Math.max(0.55, Math.min(1.25, Math.min(P.w, P.h * 1.4) / (620 * u)));
  return { u, s, pad: 34 * u * s, title: 44 * u * s, body: 38 * u * s, small: 26 * u * s };
}

/** Shrinks a panel to its content height (never taller than given), centred in the original (top-aligned for top mode). */
export function fitPanel(P, contentH, mode) {
  const h = Math.min(P.h, Math.max(contentH, 40));
  const y = mode === 'top' ? P.y : P.y + (P.h - h) / 2;
  return { ...P, y: Math.round(y), h: Math.round(h) };
}

/** The standard layout result for a panel visual: the panel is the safe box, the frame box adds shadow room. */
export function panelLayout(P, canvas, extra = {}) {
  const m = 48 * unit(canvas);
  const box = { x: P.x - m, y: P.y - m, w: P.w + 2 * m, h: P.h + 2 * m };
  return { P, box, safeBox: { ...P }, ...extra };
}

/** Number badge (circle with the index) at a centre. */
export function badge(ctx, n, cx, cy, r, theme, on) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? theme.colors.accent : withAlpha(theme.colors.text, 0.14);
  ctx.fill();
  text(ctx, String(n), cx, cy + r * 0.36, theme.fonts.label, r * 1.05, on ? theme.colors.ink : theme.colors.text, 'center');
  ctx.restore();
}

/** Arrow head at the end of a polyline segment. */
export function arrowHead(ctx, x0, y0, x1, y1, size) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - size * Math.cos(a - 0.45), y1 - size * Math.sin(a - 0.45));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - size * Math.cos(a + 0.45), y1 - size * Math.sin(a + 0.45));
  ctx.stroke();
}

export { clamp01, graphicEase, withAlpha, roundRectPath, setShadow, clearShadow, unit };
