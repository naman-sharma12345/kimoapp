// Callout for tutorials / screen recordings: a hand-drawn circle, an arrow or
// a box at a target box (planner coordinates, the clicked region, or a SAM box
// from a prompt). The line draws on in 10 frames (stroke-dashoffset style),
// an optional label pill sits at the arrow tail.
import { safeArea, unit, envelope, clamp01, graphicEase, rng, partialPolyline, strokePolyline, roundRectPath, setShadow, clearShadow, withAlpha, drawText } from '../kit.mjs';

const DRAW = 10;

function circlePoints(T, seed, u) {
  const r = rng(seed);
  const cx = T.x + T.w / 2;
  const cy = T.y + T.h / 2;
  const rx = T.w / 2 + Math.max(18 * u, T.w * 0.14);
  const ry = T.h / 2 + Math.max(16 * u, T.h * 0.18);
  const a0 = -Math.PI * (0.62 + r() * 0.1);
  const sweep = Math.PI * 2 * 1.08;
  const ph = r() * Math.PI * 2;
  const pts = [];
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = a0 + sweep * k;
    // hand-drawn: low-frequency wobble, the end slightly inside the start
    const wob = 1 + 0.035 * Math.sin(3 * a + ph) + 0.02 * Math.sin(5 * a + ph * 1.7) - 0.05 * k * k;
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
  }
  return pts;
}
function arrowPoints(T, canvas, u) {
  const safe = safeArea(canvas);
  const tx = T.x + T.w / 2;
  const ty = T.y + T.h / 2;
  // tail on the side of the target with the most room, toward the canvas centre
  const dx = (canvas.w / 2 - tx) || 1;
  const dy = (canvas.h / 2 - ty) || 1;
  const len = Math.max(140 * u, Math.min(canvas.w, canvas.h) * 0.2);
  const ang = Math.atan2(dy, dx);
  let sx = tx + Math.cos(ang) * (len + Math.max(T.w, T.h) / 2);
  let sy = ty + Math.sin(ang) * (len + Math.max(T.w, T.h) / 2);
  sx = Math.max(safe.x0 + 40 * u, Math.min(safe.x1 - 40 * u, sx));
  sy = Math.max(safe.y0 + 40 * u, Math.min(safe.y1 - 40 * u, sy));
  // tip stops at the target's edge (plus a small gap)
  const ex = tx + Math.cos(ang) * (T.w / 2 + 14 * u);
  const ey = ty + Math.sin(ang) * (T.h / 2 + 14 * u);
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const L = Math.hypot(ex - sx, ey - sy) || 1;
  const nx = -(ey - sy) / L;
  const ny = (ex - sx) / L;
  const bend = L * 0.22;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    const v = 1 - k;
    pts.push([v * v * sx + 2 * v * k * cx + k * k * ex, v * v * sy + 2 * v * k * cy + k * k * ey]);
  }
  return pts;
}
function boxPoints(T, u) {
  const pad = 12 * u;
  const x = T.x - pad;
  const y = T.y - pad;
  const w = T.w + 2 * pad;
  const h = T.h + 2 * pad;
  const r = Math.min(18 * u, w / 4, h / 4);
  const pts = [];
  const arc = (cx, cy, a0) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  pts.push([x + r, y]);
  arc(x + w - r, y + r, -Math.PI / 2);
  arc(x + w - r, y + h - r, 0);
  arc(x + r, y + h - r, Math.PI / 2);
  arc(x + r, y + r, Math.PI);
  pts.push([x + r, y]);
  return pts;
}

export default {
  kind: 'callout',
  label: 'Callout',
  defaults: { dur: 2.2, kind: 'circle' },
  layout(canvas, props, env) {
    const T = props.target;
    if (!T || !(T.w > 0 && T.h > 0)) return null;
    const u = unit(canvas);
    const kind = ['circle', 'arrow', 'box'].includes(props.kind) ? props.kind : 'circle';
    const pts = kind === 'arrow' ? arrowPoints(T, canvas, u) : kind === 'box' ? boxPoints(T, u) : circlePoints(T, `${T.x}|${T.y}|${props.seed ?? ''}`, u);
    const width = 8 * u;
    let label = null;
    if (props.label) {
      const th = env.theme;
      const size = 30 * u;
      const text = String(props.label).slice(0, 32);
      const w = env.measure(text, th.fonts.label, size) + 36 * u;
      const h = env.metrics(th.fonts.label).capHeight * size + 30 * u;
      const anchor = kind === 'arrow' ? pts[0] : [T.x + T.w / 2, T.y + T.h + 40 * u];
      const safe = safeArea(canvas);
      const x = Math.max(safe.x0, Math.min(safe.x1 - w, anchor[0] - w / 2));
      const y = Math.max(safe.y0, Math.min(safe.y1 - h, kind === 'arrow' ? anchor[1] + (anchor[1] > T.y ? 16 * u : -h - 16 * u) : anchor[1]));
      label = { text, x, y, w, h, size };
    }
    const xs = pts.map((p) => p[0]).concat(label ? [label.x, label.x + label.w] : []);
    const ys = pts.map((p) => p[1]).concat(label ? [label.y, label.y + label.h] : []);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const safeBox = { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
    const m = 40 * u;
    return { kind, pts, width, label, safeBox, box: { x: x0 - m, y: y0 - m, w: safeBox.w + 2 * m, h: safeBox.h + 2 * m } };
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th } = env;
    const f = t * fps;
    const e = envelope(t, dur, fps, { inFrames: DRAW, outFrames: 6 });
    const u = L.width / 8;
    const colour = props.color ?? th.colors.accent;
    ctx.save();
    ctx.globalAlpha = 1 - e.out;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colour;
    ctx.lineWidth = L.width;
    setShadow(ctx, withAlpha(th.colors.shadow, 0.4), 12 * u, 0, 4 * u);
    if (L.kind === 'arrow') {
      const shaft = graphicEase('cubic_out')(clamp01(f / (DRAW - 2)));
      const part = partialPolyline(L.pts, shaft);
      strokePolyline(ctx, part);
      const head = graphicEase('back_out')(clamp01((f - DRAW + 4) / 5));
      if (head > 0) {
        const [ex, ey] = L.pts.at(-1);
        const [px, py] = L.pts.at(-4);
        const a = Math.atan2(ey - py, ex - px);
        const hl = 30 * u * head;
        for (const s of [-1, 1]) strokePolyline(ctx, [[ex - Math.cos(a + s * 0.55) * hl, ey - Math.sin(a + s * 0.55) * hl], [ex, ey]]);
      }
    } else {
      strokePolyline(ctx, partialPolyline(L.pts, graphicEase('cubic_out')(clamp01(f / DRAW))));
    }
    clearShadow(ctx);
    if (L.label) {
      const lp = graphicEase('back_out')(clamp01((f - DRAW + 2) / 7));
      if (lp > 0) {
        const B = L.label;
        const cx = B.x + B.w / 2;
        const cy = B.y + B.h / 2;
        ctx.translate(cx, cy);
        ctx.scale(0.7 + 0.3 * lp, 0.7 + 0.3 * lp);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = clamp01(lp) * (1 - e.out);
        setShadow(ctx, withAlpha(th.colors.shadow, 0.35), 16 * u, 0, 6 * u);
        ctx.fillStyle = colour;
        roundRectPath(ctx, B.x, B.y, B.w, B.h, B.h / 2);
        ctx.fill();
        clearShadow(ctx);
        drawText(ctx, B.text, cx, B.y + B.h / 2 + (env.metrics(th.fonts.label).capHeight * B.size) / 2, { font: th.fonts.label, size: B.size, align: 'center', fill: th.colors.ink });
      }
    }
    ctx.restore();
  },
};
