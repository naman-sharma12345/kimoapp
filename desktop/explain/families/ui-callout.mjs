// ui_callout: for screen recordings: arrow, circle or spotlight on the UI
// element named ("click Settings"), at props.target (canvas px), located
// from the planner's coordinates or a cached SAM box prompt. Pairs with the
// Phase 6 screen zoom. A small label names the element.
import { visualAlpha, fitText, text, panelLayout, graphicEase, clamp01, withAlpha, unit, roundRectPath, arrowHead, reveal } from './common.mjs';
import { partialPolyline, strokePolyline } from '../../graphics/kit.mjs';

export default {
  kind: 'ex_ui_callout',
  label: 'UI callout',
  defaults: { dur: 2.2 },
  layout(canvas, props, env) {
    const u = unit(canvas);
    const T = props.target ?? { x: canvas.w * 0.4, y: canvas.h * 0.4, w: canvas.w * 0.2, h: canvas.h * 0.08 };
    const label = props.label ? fitText(env, props.label, env.theme.fonts.label, 34 * u, canvas.w * 0.4, 22 * u) : null;
    const P = props.style === 'spotlight' ? { x: 0, y: 0, w: canvas.w, h: canvas.h } : { x: T.x - 120 * u, y: T.y - 120 * u, w: T.w + 240 * u, h: T.h + 240 * u };
    const box = { x: Math.max(0, P.x), y: Math.max(0, P.y), w: Math.min(canvas.w, P.x + P.w) - Math.max(0, P.x), h: Math.min(canvas.h, P.y + P.h) - Math.max(0, P.y) };
    return { P: box, box, safeBox: { ...T }, T, label, u, overflow: Boolean(label?.truncated), edge: props.style === 'spotlight' };
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th } = env;
    const a = visualAlpha(t, dur, fps, 3, 6);
    const d = reveal(t, props.items?.[0]?.t ?? 0, fps, 10);
    const { T, u } = L;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineWidth = 6 * u;
    ctx.lineCap = 'round';
    ctx.strokeStyle = th.colors.accent;
    const style = props.style ?? 'circle';
    if (style === 'spotlight') {
      ctx.fillStyle = withAlpha('#000000', 0.55 * d);
      ctx.fillRect(L.P.x, L.P.y, L.P.w, L.P.h);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      roundRectPath(ctx, T.x - 10 * u, T.y - 10 * u, T.w + 20 * u, T.h + 20 * u, 14 * u);
      ctx.fill();
      ctx.restore();
      roundRectPath(ctx, T.x - 10 * u, T.y - 10 * u, T.w + 20 * u, T.h + 20 * u, 14 * u);
      ctx.stroke();
    } else if (style === 'arrow') {
      const tip = [T.x - 8 * u, T.y + T.h / 2];
      const tail = [tip[0] - 110 * u, tip[1] - 80 * u];
      strokePolyline(ctx, partialPolyline([tail, tip], d));
      if (d >= 1) arrowHead(ctx, tail[0], tail[1], tip[0], tip[1], 26 * u);
    } else {
      const cx = T.x + T.w / 2;
      const cy = T.y + T.h / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, T.w / 2 + 22 * u, T.h / 2 + 22 * u, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d);
      ctx.stroke();
    }
    if (L.label && d > 0.5) {
      ctx.globalAlpha = a * clamp01((d - 0.5) * 2);
      text(ctx, L.label.text, T.x + T.w / 2, Math.max(L.label.size + 6, T.y - 40 * u), th.fonts.label, L.label.size, th.colors.text, 'center');
    }
    ctx.restore();
  },
};
