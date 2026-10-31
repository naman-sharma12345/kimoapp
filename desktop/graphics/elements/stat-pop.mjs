// Number / stat pop: when an emphasis word is a number or %, a big count-up
// (0 → value over 0.5 s, expo-out) next to the face with a small label.
import { safeArea, isVertical, unit, envelope, clamp01, graphicEase, lerp, setShadow, clearShadow, withAlpha, drawText } from '../kit.mjs';

/** "₹3.5M" → {prefix:'₹', value:3.5, decimals:1, suffix:'M', commas:false}; null when not a number. */
export function parseStat(text) {
  const m = /^\s*([$₹€£+-]?)\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(%|x|×|k|K|M|B|\+|[\p{L}]{0,10})?\s*$/u.exec(String(text ?? ''));
  if (!m) return null;
  const raw = m[2];
  const value = Number(raw.replaceAll(',', ''));
  if (!Number.isFinite(value)) return null;
  return { prefix: m[1] ?? '', value, decimals: raw.includes('.') ? raw.split('.')[1].length : 0, commas: raw.includes(','), suffix: m[3] ?? '' };
}
export function formatStat(stat, v) {
  let s = v.toFixed(stat.decimals);
  if (stat.commas) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: stat.decimals, maximumFractionDigits: stat.decimals });
  const suffix = stat.suffix && /^\p{L}{2,}$/u.test(stat.suffix) ? ` ${stat.suffix.toUpperCase()}` : stat.suffix;
  return `${stat.prefix}${s}${suffix}`;
}

export default {
  kind: 'stat',
  label: 'Number pop',
  defaults: { dur: 1.7 },
  layout(canvas, props, env) {
    const th = env.theme;
    const stat = parseStat(props.value);
    if (!stat) return null;
    const u = unit(canvas);
    const safe = safeArea(canvas);
    const vertical = isVertical(canvas);
    const final = formatStat(stat, stat.value);
    let size = (vertical ? 168 : 150) * u;
    const label = String(props.label ?? '').toUpperCase().slice(0, 28);
    let labelSize = (vertical ? 36 : 32) * u;
    const maxW = (safe.x1 - safe.x0) * (vertical ? 0.8 : 0.4);
    let w;
    let lw;
    for (let i = 0; i < 10; i++) {
      w = env.measure(final, th.fonts.display, size);
      lw = label ? env.measure(label, th.fonts.label, labelSize, labelSize * 0.14) : 0;
      if (Math.max(w, lw) <= maxW) break;
      size *= 0.9;
      labelSize *= 0.92;
    }
    const cap = env.metrics(th.fonts.display).capHeight * size;
    const lcap = label ? env.metrics(th.fonts.label).capHeight * labelSize : 0;
    const gap = 18 * u;
    const blockW = Math.max(w, lw);
    const blockH = cap + (label ? gap + lcap : 0);
    // beside the face: the side with more room, else above it, else upper third
    const face = props.face;
    let cx;
    let cy;
    if (face) {
      const left = face.x0 - safe.x0;
      const right = safe.x1 - face.x1;
      const room = Math.max(left, right);
      if (room >= blockW + 30 * u) {
        cx = right >= left ? face.x1 + (right) / 2 : safe.x0 + left / 2;
        cy = Math.max(safe.y0 + blockH / 2, Math.min(safe.y1 - blockH / 2, (face.y0 + face.y1) / 2));
      } else {
        cx = safe.cx;
        cy = Math.max(safe.y0 + blockH / 2 + 10 * u, face.y0 - blockH / 2 - 30 * u);
      }
    } else {
      cx = vertical ? safe.cx : safe.x0 + (safe.x1 - safe.x0) * 0.76;
      cy = vertical ? safe.y0 + (safe.y1 - safe.y0) * 0.24 : canvas.h * 0.44;
    }
    cx = Math.max(safe.x0 + blockW / 2, Math.min(safe.x1 - blockW / 2, cx));
    cy = Math.max(safe.y0 + blockH / 2, Math.min(safe.y1 - blockH / 2, cy));
    const top = cy - blockH / 2;
    const margin = size * 0.5;
    return {
      stat,
      size,
      labelSize,
      label,
      cx,
      baseline: top + cap,
      labelBaseline: top + cap + gap + lcap,
      safeBox: { x: cx - blockW / 2, y: top, w: blockW, h: blockH },
      box: { x: cx - blockW / 2 - margin, y: top - margin, w: blockW + 2 * margin, h: blockH + 2 * margin },
    };
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th } = env;
    const e = envelope(t, dur, fps, { inFrames: 8, outFrames: 5, inEase: 'back_out', outEase: 'cubic_in' });
    const count = graphicEase('expo_out')(clamp01(t / 0.5));
    const text = formatStat(L.stat, L.stat.value * count);
    const sc = lerp(0.6, 1, e.in) * (1 - 0.1 * e.out);
    const s = L.size;
    const cy = L.baseline - s * 0.35;
    ctx.save();
    ctx.globalAlpha = clamp01(e.inRaw * 2) * (1 - e.out);
    ctx.translate(L.cx, cy);
    ctx.scale(sc, sc);
    ctx.translate(-L.cx, -cy);
    // glow + outline for legibility over any picture
    drawText(ctx, text, L.cx, L.baseline, {
      font: th.fonts.display,
      size: s,
      align: 'center',
      fill: th.colors.accent,
      stroke: th.colors.ink,
      strokeWidth: Math.max(th.stroke ?? 0, 0.05) * s * 2,
      shadow: [withAlpha(th.colors.accent, 0.45), s * 0.3, 0, 0],
    });
    ctx.restore();
    if (L.label) {
      const lp = graphicEase('expo_out')(clamp01((t * fps - 4) / 8));
      ctx.save();
      ctx.globalAlpha = lp * (1 - e.out);
      setShadow(ctx, withAlpha(th.colors.shadow, 0.6), L.labelSize * 0.4, 0, L.labelSize * 0.08);
      drawText(ctx, L.label, L.cx, L.labelBaseline + (1 - lp) * L.labelSize * 0.6, { font: th.fonts.label, size: L.labelSize, align: 'center', fill: th.colors.text, spacing: L.labelSize * 0.14, shadow: [withAlpha(th.colors.shadow, 0.65), L.labelSize * 0.35, 0, L.labelSize * 0.06] });
      clearShadow(ctx);
      ctx.restore();
    }
  },
};
