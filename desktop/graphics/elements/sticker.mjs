// Emoji / sticker pop (opt-in per template, at most one per 10 s): a Noto
// Color Emoji (OFL) PNG pops in with a slight rotation, wobbles gently while
// it holds and shrinks out.
import { safeArea, isVertical, unit, envelope, clamp01, graphicEase, lerp, setShadow, withAlpha } from '../kit.mjs';

export const STICKERS = Object.freeze(['fire', 'money', 'rocket', 'mind-blown', 'bulb', 'hundred', 'eyes', 'check', 'warning', 'laugh', 'heart', 'clap', 'chart-up', 'party', 'thinking', 'star', 'brain', 'lightning', 'trophy', 'x']);

export default {
  kind: 'sticker',
  label: 'Emoji pop',
  defaults: { dur: 1.4 },
  layout(canvas, props) {
    if (!STICKERS.includes(props.emoji)) return null;
    const u = unit(canvas);
    const safe = safeArea(canvas);
    const size = (isVertical(canvas) ? 190 : 160) * u;
    let cx = props.x ?? safe.x1 - size * 0.75;
    let cy = props.y ?? safe.y0 + (safe.y1 - safe.y0) * 0.22;
    cx = Math.max(safe.x0 + size / 2, Math.min(safe.x1 - size / 2, cx));
    cy = Math.max(safe.y0 + size / 2, Math.min(safe.y1 - size / 2, cy));
    const m = size * 0.45;
    return { cx, cy, size, tilt: props.tilt ?? -8, safeBox: { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, box: { x: cx - size / 2 - m, y: cy - size / 2 - m, w: size + 2 * m, h: size + 2 * m } };
  },
  draw(ctx, t, props, L, env) {
    const img = env.images?.[props.emoji];
    if (!img) return;
    const { fps, dur, theme: th } = env;
    const e = envelope(t, dur, fps, { inFrames: 7, outFrames: 5, inEase: 'back_out', outEase: 'cubic_in' });
    const sc = lerp(0.2, 1, e.in) * lerp(1, 0.55, e.out);
    const wobble = Math.sin(t * Math.PI * 1.6) * 2.5 * clamp01(e.inRaw);
    const rot = ((lerp(-20, L.tilt, graphicEase('cubic_out')(e.inRaw)) + wobble) * Math.PI) / 180;
    ctx.save();
    ctx.globalAlpha = clamp01(e.inRaw * 3) * (1 - e.out);
    ctx.translate(L.cx, L.cy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    setShadow(ctx, withAlpha(th.colors.shadow, 0.45), L.size * 0.12, 0, L.size * 0.05);
    const ar = img.height / img.width;
    ctx.drawImage(img, -L.size / 2, (-L.size * ar) / 2, L.size, L.size * ar);
    ctx.restore();
  },
};
