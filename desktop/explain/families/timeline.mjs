// timeline: a horizontal line with years/events dropping in on their words;
// the view pans along the line to follow the speech (camera-like, eased).
import { drawPanel, visualAlpha, reveal, activeIndex, fitText, text, scale, panelLayout, withAlpha, graphicEase, clamp01 } from './common.mjs';
import { panelOf } from '../panel.mjs';

export default {
  kind: 'ex_timeline',
  label: 'Timeline',
  defaults: { dur: 4.5 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, body, title } = scale(P, canvas);
    const items = (props.items ?? []).slice(0, 8);
    const visible = Math.min(4, Math.max(1, items.length));
    const spacing = (P.w - 2 * pad) / visible;
    const labels = items.map((it) => ({
      when: fitText(env, it.when ?? '', env.theme.fonts.display, title * 1.1, spacing * 0.9, body * 0.6),
      what: fitText(env, it.text ?? '', env.theme.fonts.body, body * 0.72, spacing * 0.92, body * 0.45),
    }));
    return panelLayout(P, canvas, { pad, spacing, labels, lineY: P.y + P.h * 0.55, overflow: labels.some((l) => l.what.truncated || l.when.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const items = (props.items ?? []).slice(0, 8);
    const a = visualAlpha(t, dur, fps);
    const k = Math.max(0, activeIndex(items, t));
    // pan: keep the active event in view, eased between events
    const target = (i) => Math.max(0, i - 3) * L.spacing;
    let pan = 0;
    for (let i = 0; i < items.length; i++) pan += (target(i) - (i ? target(i - 1) : 0)) * graphicEase('cubic')(clamp01(((t - (items[i].t ?? 0)) * fps) / 14));
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.P.x, L.P.y, L.P.w, L.P.h);
    ctx.clip();
    const x0 = L.P.x + L.pad + L.spacing / 2 - pan;
    const grow = reveal(t, 0, fps, 14);
    ctx.strokeStyle = withAlpha(th.colors.text, 0.4);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(L.P.x + L.pad * 0.5, L.lineY);
    ctx.lineTo(L.P.x + L.pad * 0.5 + (L.P.w - L.pad) * grow, L.lineY);
    ctx.stroke();
    items.forEach((it, i) => {
      const r = reveal(t, it.t ?? 0, fps, 9);
      if (r <= 0) return;
      const x = x0 + i * L.spacing;
      const on = i === k;
      ctx.save();
      ctx.globalAlpha = a * r * (on ? 1 : 0.6);
      ctx.beginPath();
      ctx.arc(x, L.lineY, on ? 11 : 8, 0, Math.PI * 2);
      ctx.fillStyle = on ? th.colors.accent : th.colors.text;
      ctx.fill();
      const drop = (1 - r) * -30;
      const l = L.labels[i];
      text(ctx, l.when.text, x, L.lineY - 26 + drop, th.fonts.display, l.when.size, on ? th.colors.accent : th.colors.text, 'center');
      text(ctx, l.what.text, x, L.lineY + 24 + l.what.size + drop * -0.5, th.fonts.body, l.what.size, th.colors.text, 'center');
      ctx.restore();
    });
    ctx.restore();
    ctx.restore();
  },
};
