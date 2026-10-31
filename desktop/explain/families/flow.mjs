// flow: boxes connected by arrows drawn on (dash-offset style, via
// partialPolyline) step by step on the spoken words; supports a cycle back
// to the first box ("and it repeats"); max 5 nodes. Horizontal on wide
// panels, vertical on tall ones.
import { drawPanel, visualAlpha, reveal, activeIndex, fitText, text, scale, panelLayout, withAlpha, roundRectPath, arrowHead } from './common.mjs';
import { panelOf } from '../panel.mjs';
import { partialPolyline, strokePolyline } from '../../graphics/kit.mjs';

export default {
  kind: 'ex_flow',
  label: 'Flow',
  defaults: { dur: 4 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, body, title } = scale(P, canvas);
    const steps = (props.items ?? []).slice(0, 5);
    const n = Math.max(1, steps.length);
    const titleFit = props.title ? fitText(env, props.title, env.theme.fonts.serif, title, P.w - 2 * pad) : null;
    const top = P.y + pad + (titleFit ? titleFit.size * 1.4 : 0);
    const vertical = P.h - (top - P.y) > P.w * 1.1;
    const gap = (vertical ? P.h : P.w) * 0.06;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      if (vertical) {
        const h = (P.y + P.h - pad - top - gap * (n - 1)) / n;
        nodes.push({ x: P.x + pad, y: top + i * (h + gap), w: P.w - 2 * pad, h });
      } else {
        const w = (P.w - 2 * pad - gap * (n - 1)) / n;
        const h = Math.min(P.y + P.h - pad - top, w * 0.75);
        nodes.push({ x: P.x + pad + i * (w + gap), y: top + (P.y + P.h - pad - top - h) / 2, w, h });
      }
    }
    const fits = steps.map((s, i) => fitText(env, s.text, env.theme.fonts.label, Math.min(body * 0.9, nodes[i].h * 0.34), nodes[i].w * 0.86, body * 0.42));
    return panelLayout(P, canvas, { pad, titleFit, nodes, fits, vertical, gap, overflow: fits.some((f) => f.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const steps = (props.items ?? []).slice(0, 5);
    const a = visualAlpha(t, dur, fps);
    const k = activeIndex(steps, t);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    if (L.titleFit) text(ctx, L.titleFit.text, L.P.x + L.pad, L.P.y + L.pad + L.titleFit.size * 0.85, th.fonts.serif, L.titleFit.size, th.colors.text);
    const lw = Math.max(3, L.gap * 0.08);
    steps.forEach((s, i) => {
      const N = L.nodes[i];
      const r = reveal(t, s.t ?? 0, fps);
      if (i > 0) {
        // arrow from the previous node draws on over 8 frames as this step is said
        const M = L.nodes[i - 1];
        const pts = L.vertical ? [[M.x + M.w / 2, M.y + M.h + 4], [N.x + N.w / 2, N.y - 4]] : [[M.x + M.w + 4, M.y + M.h / 2], [N.x - 4, N.y + N.h / 2]];
        const d = reveal(t, (s.t ?? 0) - 6 / fps, fps, 8);
        if (d > 0) {
          ctx.strokeStyle = withAlpha(th.colors.text, 0.75);
          ctx.lineWidth = lw;
          ctx.lineCap = 'round';
          const part = partialPolyline(pts, d);
          strokePolyline(ctx, part);
          if (d >= 1) arrowHead(ctx, pts[0][0], pts[0][1], pts[1][0], pts[1][1], lw * 4);
        }
      }
      if (r <= 0) return;
      ctx.save();
      ctx.globalAlpha = a * r;
      const sc = 0.85 + 0.15 * r;
      ctx.translate(N.x + N.w / 2, N.y + N.h / 2);
      ctx.scale(sc, sc);
      ctx.translate(-(N.x + N.w / 2), -(N.y + N.h / 2));
      roundRectPath(ctx, N.x, N.y, N.w, N.h, Math.min(N.w, N.h) * 0.16);
      ctx.fillStyle = i === k ? th.colors.accent : withAlpha(th.colors.text, 0.1);
      ctx.fill();
      const f = L.fits[i];
      text(ctx, f.text, N.x + N.w / 2, N.y + N.h / 2 + f.size * 0.36, th.fonts.label, f.size, i === k ? th.colors.ink : th.colors.text, 'center');
      ctx.restore();
    });
    if (props.cycle && steps.length > 1) {
      const last = steps.at(-1);
      const d = reveal(t, (props.cycle_t ?? (last.t ?? 0) + 0.5), fps, 12);
      if (d > 0) {
        const A = L.nodes.at(-1);
        const B = L.nodes[0];
        const pts = L.vertical
          ? [[A.x + A.w, A.y + A.h / 2], [A.x + A.w + L.pad * 0.6, A.y + A.h / 2], [B.x + B.w + L.pad * 0.6, B.y + B.h / 2], [B.x + B.w, B.y + B.h / 2]]
          : [[A.x + A.w / 2, A.y + A.h], [A.x + A.w / 2, A.y + A.h + L.pad * 0.6], [B.x + B.w / 2, B.y + B.h + L.pad * 0.6], [B.x + B.w / 2, B.y + B.h]];
        ctx.strokeStyle = th.colors.accent;
        ctx.lineWidth = lw;
        strokePolyline(ctx, partialPolyline(pts, d));
        if (d >= 1) arrowHead(ctx, pts[2][0], pts[2][1], pts[3][0], pts[3][1], lw * 4);
      }
    }
    ctx.restore();
  },
};
