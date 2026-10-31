// icon_metaphor / kinetic_text: a big keyword with a subtle parametric motion
// for abstract ideas. Ten reusable metaphors: grow-curve, spotlight,
// scale-balance, stack-blocks, split-path, magnet, loop-arrows,
// checklist-tick, warning-pulse, rocket-rise.
import { drawPanel, visualAlpha, fitText, text, scale, panelLayout, graphicEase, clamp01, withAlpha, roundRectPath, arrowHead } from './common.mjs';
import { panelOf } from '../panel.mjs';
import { partialPolyline, strokePolyline } from '../../graphics/kit.mjs';
import { strokeIcon } from '../svgpath.mjs';

export const METAPHORS = ['grow-curve', 'spotlight', 'scale-balance', 'stack-blocks', 'split-path', 'magnet', 'loop-arrows', 'checklist-tick', 'warning-pulse', 'rocket-rise'];
const ROCKET = 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5';

function motion(ctx, kind, u, A, th, fps) {
  const { x, y, w, h } = A;
  const ac = th.colors.accent;
  const tx = th.colors.text;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lw = Math.max(3, Math.min(w, h) * 0.025);
  ctx.lineWidth = lw;
  if (kind === 'grow-curve') {
    const pts = Array.from({ length: 40 }, (_, i) => [x + (w * i) / 39, y + h - h * 0.9 * Math.pow(i / 39, 2.6)]);
    ctx.strokeStyle = withAlpha(tx, 0.2);
    strokePolyline(ctx, [[x, y + h], [x + w, y + h]]);
    ctx.strokeStyle = ac;
    const part = partialPolyline(pts, graphicEase('cubic')(u));
    strokePolyline(ctx, part);
    const end = part.at(-1);
    ctx.beginPath();
    ctx.arc(end[0], end[1], lw * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = ac;
    ctx.fill();
  } else if (kind === 'spotlight') {
    const r = Math.min(w, h) * (0.55 - 0.3 * graphicEase('cubic')(u));
    ctx.fillStyle = withAlpha(th.colors.ink, 0.6);
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = ac;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'scale-balance') {
    const tilt = Math.sin(u * Math.PI * 1.5) * 0.18 * (1 - u * 0.4);
    const cx = x + w / 2;
    const top = y + h * 0.2;
    ctx.strokeStyle = tx;
    strokePolyline(ctx, [[cx, y + h], [cx, top]]);
    const dx = w * 0.4 * Math.cos(tilt);
    const dy = w * 0.4 * Math.sin(tilt);
    ctx.strokeStyle = ac;
    strokePolyline(ctx, [[cx - dx, top - dy], [cx + dx, top + dy]]);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * dx, top + s * dy + h * 0.18, w * 0.09, 0, Math.PI);
      ctx.stroke();
    }
  } else if (kind === 'stack-blocks') {
    const n = 5;
    const bw = w * 0.36;
    const bh = h / (n + 1);
    for (let i = 0; i < n; i++) {
      const p = graphicEase('back_out')(clamp01(u * n * 1.2 - i));
      if (p <= 0) continue;
      roundRectPath(ctx, x + (w - bw) / 2, y + h - (i + 1) * bh * 1.05 - (1 - p) * h * 0.4, bw, bh, bh * 0.15);
      ctx.fillStyle = i === n - 1 ? ac : withAlpha(tx, 0.2 + i * 0.1);
      ctx.fill();
    }
  } else if (kind === 'split-path') {
    const sx = x + w * 0.1;
    const my = y + h / 2;
    ctx.strokeStyle = tx;
    strokePolyline(ctx, partialPolyline([[sx, my], [x + w * 0.45, my]], clamp01(u * 2)));
    const b = clamp01(u * 2 - 1);
    ctx.strokeStyle = withAlpha(tx, 0.35);
    strokePolyline(ctx, partialPolyline([[x + w * 0.45, my], [x + w * 0.9, y + h * 0.15]], b));
    ctx.strokeStyle = ac;
    const path = [[x + w * 0.45, my], [x + w * 0.9, y + h * 0.85]];
    strokePolyline(ctx, partialPolyline(path, b));
    if (b >= 1) arrowHead(ctx, path[0][0], path[0][1], path[1][0], path[1][1], lw * 4);
  } else if (kind === 'magnet') {
    const cx = x + w * 0.25;
    const cy = y + h / 2;
    ctx.strokeStyle = ac;
    ctx.lineWidth = lw * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, h * 0.25, Math.PI / 2, Math.PI * 1.5, true);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const p = graphicEase('cubic')(clamp01(u * 1.3 - i * 0.12));
      ctx.beginPath();
      ctx.arc(x + w * (0.92 - 0.45 * p), cy + (i - 1.5) * h * 0.14 * (1 - p), lw * 2, 0, Math.PI * 2);
      ctx.fillStyle = tx;
      ctx.fill();
    }
  } else if (kind === 'loop-arrows') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.36;
    const a0 = u * Math.PI * 2;
    ctx.strokeStyle = ac;
    for (const off of [0, Math.PI]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0 + off, a0 + off + Math.PI * 0.75);
      ctx.stroke();
      const e = a0 + off + Math.PI * 0.75;
      arrowHead(ctx, cx + r * Math.cos(e - 0.2), cy + r * Math.sin(e - 0.2), cx + r * Math.cos(e), cy + r * Math.sin(e), lw * 4);
    }
  } else if (kind === 'checklist-tick') {
    for (let i = 0; i < 3; i++) {
      const yy = y + h * (0.2 + i * 0.3);
      ctx.strokeStyle = withAlpha(tx, 0.4);
      roundRectPath(ctx, x + w * 0.1, yy - h * 0.09, h * 0.18, h * 0.18, 4);
      ctx.stroke();
      ctx.fillStyle = withAlpha(tx, 0.25);
      ctx.fillRect(x + w * 0.1 + h * 0.3, yy - lw, w * 0.5, lw * 2);
      const p = clamp01(u * 3.2 - i);
      if (p > 0) {
        ctx.strokeStyle = ac;
        strokePolyline(ctx, partialPolyline([[x + w * 0.1 + h * 0.03, yy], [x + w * 0.1 + h * 0.08, yy + h * 0.05], [x + w * 0.1 + h * 0.17, yy - h * 0.07]], p));
      }
    }
  } else if (kind === 'warning-pulse') {
    const cx = x + w / 2;
    const cy = y + h * 0.55;
    const R = Math.min(w, h) * 0.38;
    const pulse = 1 + 0.08 * Math.sin(u * Math.PI * 6);
    for (let k = 0; k < 2; k++) {
      const rr = R * (1 + ((u * 3 + k * 0.5) % 1) * 0.6);
      ctx.strokeStyle = withAlpha(ac, 0.5 * (1 - ((u * 3 + k * 0.5) % 1)));
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * pulse);
    ctx.lineTo(cx + R * 0.95 * pulse, cy + R * 0.7 * pulse);
    ctx.lineTo(cx - R * 0.95 * pulse, cy + R * 0.7 * pulse);
    ctx.closePath();
    ctx.fillStyle = ac;
    ctx.fill();
    text(ctx, '!', cx, cy + R * 0.5, th.fonts.display, R * 0.9, th.colors.ink, 'center');
  } else if (kind === 'rocket-rise') {
    const s = Math.min(w, h) * 0.5;
    const p = graphicEase('cubic')(u);
    const rx = x + w * 0.2 + (w * 0.5 - s / 2) * p;
    const ry = y + h - s - (h - s) * p;
    ctx.strokeStyle = withAlpha(ac, 0.35);
    strokePolyline(ctx, [[x + w * 0.2 + s * 0.2, y + h - s * 0.2], [rx + s * 0.2, ry + s * 0.8]]);
    strokeIcon(ctx, ROCKET, rx, ry, s, ac, 1.8);
  }
}

export default {
  kind: 'ex_metaphor',
  label: 'Metaphor / kinetic text',
  defaults: { dur: 2.8 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, title } = scale(P, canvas);
    const word = fitText(env, props.keyword ?? props.text ?? '', env.theme.fonts.display, title * 1.6, P.w - 2 * pad, title * 0.7);
    const art = { x: P.x + pad, y: P.y + pad, w: P.w - 2 * pad, h: P.h - pad * 2.4 - word.size };
    return panelLayout(P, canvas, { pad, word, art, overflow: word.truncated });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    const t0 = props.items?.[0]?.t ?? 0;
    const u = clamp01((t - t0) / Math.max(0.6, dur - t0 - 0.3));
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.art.x, L.art.y, L.art.w, L.art.h);
    ctx.clip();
    motion(ctx, METAPHORS.includes(props.metaphor) ? props.metaphor : 'grow-curve', u, L.art, th, fps);
    ctx.restore();
    const pop = graphicEase('back_out')(clamp01(((t - t0) * fps) / 8));
    ctx.save();
    const cx = L.P.x + L.P.w / 2;
    const by = L.P.y + L.P.h - L.pad;
    ctx.translate(cx, by);
    ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
    ctx.globalAlpha = a * clamp01(pop * 1.5);
    text(ctx, L.word.text, 0, 0, th.fonts.display, L.word.size, th.colors.text, 'center');
    ctx.restore();
    ctx.restore();
  },
};
