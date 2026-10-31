// Subscribe / CTA end card (16:9 only, never on shorts): the last 5 s. A pill
// button with a bell slides up, a cursor glides in and clicks it, the button
// turns to "Subscribed" and the bell rings.
import { safeArea, isWide, unit, envelope, clamp01, graphicEase, lerp, roundRectPath, setShadow, clearShadow, withAlpha, drawText } from '../kit.mjs';

function bell(ctx, x, y, s, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.42, y + s * 0.28);
  ctx.quadraticCurveTo(x - s * 0.34, y + s * 0.18, x - s * 0.34, y - s * 0.05);
  ctx.bezierCurveTo(x - s * 0.34, y - s * 0.38, x - s * 0.12, y - s * 0.48, x, y - s * 0.48);
  ctx.bezierCurveTo(x + s * 0.12, y - s * 0.48, x + s * 0.34, y - s * 0.38, x + s * 0.34, y - s * 0.05);
  ctx.quadraticCurveTo(x + s * 0.34, y + s * 0.18, x + s * 0.42, y + s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + s * 0.38, s * 0.11, 0, Math.PI * 2);
  ctx.fill();
}
function cursor(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x + s * 0.28, y + s * 0.74);
  ctx.lineTo(x + s * 0.46, y + s * 1.1);
  ctx.lineTo(x + s * 0.6, y + s * 1.03);
  ctx.lineTo(x + s * 0.42, y + s * 0.68);
  ctx.lineTo(x + s * 0.76, y + s * 0.68);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = s * 0.07;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
}

export default {
  kind: 'cta',
  label: 'Subscribe end card',
  defaults: { dur: 5 },
  layout(canvas, props, env) {
    if (!isWide(canvas)) return null; // never on shorts or square
    const th = env.theme;
    const u = unit(canvas);
    const safe = safeArea(canvas);
    const size = 40 * u;
    const text = String(props.text ?? 'Subscribe').toUpperCase().slice(0, 18);
    const done = String(props.done ?? 'Subscribed').toUpperCase().slice(0, 18);
    const spacing = size * 0.06;
    const tw = Math.max(env.measure(text, th.fonts.label, size, spacing), env.measure(done, th.fonts.label, size, spacing));
    const icon = size * 1.1;
    const padX = 34 * u;
    const h = size * 2.05;
    const w = padX * 2 + icon + 18 * u + tw;
    const line = props.line ? String(props.line).slice(0, 48) : '';
    const lineSize = 28 * u;
    const lineCap = line ? env.metrics(th.fonts.body).capHeight * lineSize : 0;
    const x = safe.x1 - w - 0.02 * canvas.w;
    const y = safe.y1 - h - 0.05 * canvas.h;
    const blockTop = y - (line ? lineCap + 22 * u : 0);
    const lw = line ? env.measure(line, th.fonts.body, lineSize) : 0;
    const bx = Math.min(x, x + w - lw);
    const m = 80 * u;
    return {
      button: { x, y, w, h, r: h / 2 },
      text,
      done,
      size,
      spacing,
      icon,
      padX,
      line: line ? { text: line, x: x + w, baseline: y - 22 * u, size: lineSize } : null,
      safeBox: { x: bx, y: blockTop, w: x + w - bx, h: y + h - blockTop },
      box: { x: bx - m, y: blockTop - m, w: x + w - bx + 2 * m, h: y + h - blockTop + m + Math.min(m, canvas.h - (y + h)) },
    };
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th } = env;
    const f = t * fps;
    const e = envelope(t, dur, fps, { inFrames: 10, outFrames: 8, inEase: 'expo_out' });
    const B = L.button;
    const u = L.size / 40;
    const clickAt = 1.5;
    const clicked = t >= clickAt;
    const press = clamp01(1 - Math.abs(t - clickAt) / 0.12);
    const sc = (1 - 0.06 * press) * lerp(0.92, 1, e.in);
    const dy = (1 - e.in) * 40 * u;
    ctx.save();
    ctx.globalAlpha = clamp01(e.inRaw * 1.5) * (1 - e.out);
    if (L.line) drawText(ctx, L.line.text, L.line.x, L.line.baseline + dy, { font: th.fonts.body, size: L.line.size, align: 'right', fill: th.colors.text, shadow: [withAlpha(th.colors.shadow, 0.6), 14 * u, 0, 3 * u] });
    const cx = B.x + B.w / 2;
    const cy = B.y + B.h / 2 + dy;
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);
    setShadow(ctx, withAlpha(th.colors.shadow, 0.4), 30 * u, 0, 10 * u);
    ctx.fillStyle = clicked ? withAlpha('#2A2A2A', 0.92) : th.colors.accent;
    roundRectPath(ctx, B.x, B.y + dy, B.w, B.h, B.r);
    ctx.fill();
    clearShadow(ctx);
    const ink = clicked ? '#F1F1F1' : th.colors.ink;
    const ix = B.x + L.padX + L.icon / 2;
    const ring = clicked ? Math.sin((t - clickAt) * 28) * Math.exp(-(t - clickAt) * 4) * 0.35 : 0;
    ctx.save();
    ctx.translate(ix, cy - L.icon * 0.45);
    ctx.rotate(ring);
    ctx.translate(-ix, -(cy - L.icon * 0.45));
    bell(ctx, ix, cy, L.icon, ink);
    ctx.restore();
    const cap = env.metrics(th.fonts.label).capHeight * L.size;
    drawText(ctx, clicked ? L.done : L.text, B.x + L.padX + L.icon + 18 * u, cy + cap / 2, { font: th.fonts.label, size: L.size, fill: ink, spacing: L.spacing });
    ctx.restore();
    // the cursor glides in, clicks, and leaves
    const ci = graphicEase('cubic')(clamp01((t - 0.7) / 0.75));
    const co = graphicEase('cubic_in')(clamp01((t - 2.2) / 0.5));
    if (ci > 0 && co < 1) {
      const tx = B.x + B.w * 0.62;
      const ty = B.y + B.h * 0.55 + dy;
      const sx = tx + 160 * u;
      const sy = ty + 140 * u;
      const px = lerp(sx, tx, ci) + co * 120 * u;
      const py = lerp(sy, ty, ci) + co * 90 * u;
      ctx.save();
      ctx.globalAlpha = (1 - co) * (1 - e.out);
      setShadow(ctx, withAlpha('#000000', 0.35), 10 * u, 0, 4 * u);
      cursor(ctx, px, py, 44 * u * (1 - 0.12 * press));
      ctx.restore();
    }
    void f;
  },
};
