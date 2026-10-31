// chart: bar (comparisons), line (trends over time) or donut (shares), data
// only from the speech. Bars grow on their spoken word; minimal axis, values
// labelled directly, no gridlines.
import { drawPanel, visualAlpha, reveal, activeIndex, fitText, text, scale, panelLayout, withAlpha, clamp01 } from './common.mjs';
import { formatValue } from './stat.mjs';
import { panelOf } from '../panel.mjs';
import { partialPolyline, strokePolyline } from '../../graphics/kit.mjs';

export default {
  kind: 'ex_chart',
  label: 'Chart',
  defaults: { dur: 4 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, title, small } = scale(P, canvas);
    const titleFit = props.title ? fitText(env, props.title, env.theme.fonts.serif, title, P.w - 2 * pad) : null;
    const items = (props.items ?? []).slice(0, 8);
    const area = { x: P.x + pad, y: P.y + pad + (titleFit ? titleFit.size * 1.4 : 0), w: P.w - 2 * pad, h: 0 };
    area.h = P.y + P.h - pad - small * 1.8 - area.y;
    const labels = items.map((it) => fitText(env, it.label ?? '', env.theme.fonts.label, small, (area.w / Math.max(1, items.length)) * 0.92, small * 0.6));
    return panelLayout(P, canvas, { pad, titleFit, area, labels, small, chart: props.chart ?? (items.length > 2 && props.trend ? 'line' : 'bar'), overflow: labels.some((l) => l.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const items = (props.items ?? []).slice(0, 8);
    const max = Math.max(1e-9, ...items.map((i) => Math.abs(Number(i.value) || 0)));
    const a = visualAlpha(t, dur, fps);
    const k = activeIndex(items, t);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    if (L.titleFit) text(ctx, L.titleFit.text, L.P.x + L.pad, L.P.y + L.pad + L.titleFit.size * 0.85, th.fonts.serif, L.titleFit.size, th.colors.text);
    const A = L.area;
    ctx.strokeStyle = withAlpha(th.colors.text, 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y + A.h);
    ctx.lineTo(A.x + A.w, A.y + A.h);
    ctx.stroke();
    const n = Math.max(1, items.length);
    const slot = A.w / n;
    if (L.chart === 'donut') {
      const total = items.reduce((s, i) => s + Math.max(0, Number(i.value) || 0), 0) || 1;
      const cx = A.x + A.w / 2;
      const cy = A.y + A.h / 2;
      const R = Math.min(A.w, A.h) * 0.42;
      let ang = -Math.PI / 2;
      items.forEach((it, i) => {
        const r = reveal(t, it.t ?? 0, fps, 12);
        const sweep = ((Math.max(0, Number(it.value) || 0) / total) * Math.PI * 2) * r;
        ctx.beginPath();
        ctx.arc(cx, cy, R, ang, ang + sweep);
        ctx.lineWidth = R * 0.36;
        ctx.strokeStyle = i === k ? th.colors.accent : withAlpha(th.colors.text, 0.25 + 0.15 * (i % 3));
        ctx.stroke();
        ang += (Math.max(0, Number(it.value) || 0) / total) * Math.PI * 2;
      });
    } else if (L.chart === 'line') {
      const pts = items.map((it, i) => [A.x + slot * (i + 0.5), A.y + A.h - (Math.abs(Number(it.value) || 0) / max) * A.h * 0.9]);
      // the line draws on as each point is said
      let frac = 0;
      items.forEach((it, i) => (frac = Math.max(frac, i === 0 ? 0 : reveal(t, it.t ?? 0, fps, 10) * (i / Math.max(1, items.length - 1)))));
      const segFrac = items.length > 1 ? frac : 1;
      ctx.lineWidth = 6 * L.small / 26;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = th.colors.accent;
      strokePolyline(ctx, partialPolyline(pts, segFrac));
      items.forEach((it, i) => {
        const r = reveal(t, it.t ?? 0, fps);
        if (r <= 0) return;
        ctx.save();
        ctx.globalAlpha = a * r;
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 9 * L.small / 26, 0, Math.PI * 2);
        ctx.fillStyle = i === k ? th.colors.accent : th.colors.text;
        ctx.fill();
        text(ctx, formatValue(it.value, it), pts[i][0], pts[i][1] - L.small * 0.9, th.fonts.label, L.small, th.colors.text, 'center');
        text(ctx, L.labels[i].text, pts[i][0], A.y + A.h + L.small * 1.4, th.fonts.label, L.labels[i].size, withAlpha(th.colors.text, 0.75), 'center');
        ctx.restore();
      });
    } else {
      items.forEach((it, i) => {
        const r = reveal(t, it.t ?? 0, fps, 12);
        if (r <= 0) return;
        const v = Math.abs(Number(it.value) || 0) / max;
        const bw = slot * 0.56;
        const bh = A.h * 0.86 * v * r;
        const x = A.x + slot * i + (slot - bw) / 2;
        ctx.fillStyle = i === k ? th.colors.accent : withAlpha(th.colors.text, 0.32);
        ctx.fillRect(x, A.y + A.h - bh, bw, bh);
        ctx.save();
        ctx.globalAlpha = a * clamp01(r * 1.5);
        text(ctx, formatValue(it.value, it), x + bw / 2, A.y + A.h - bh - L.small * 0.5, th.fonts.label, L.small, th.colors.text, 'center');
        text(ctx, L.labels[i].text, x + bw / 2, A.y + A.h + L.small * 1.4, th.fonts.label, L.labels[i].size, withAlpha(th.colors.text, 0.75), 'center');
        ctx.restore();
      });
    }
    ctx.restore();
  },
};
