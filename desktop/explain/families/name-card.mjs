// name_card: person/product name + one descriptor, lower-third style (same
// motion as the Phase 6 lower third: an accent bar, then the name slides in).
import { visualAlpha, fitText, text, panelLayout, graphicEase, clamp01, withAlpha, roundRectPath, unit } from './common.mjs';
import { safeArea } from '../../graphics/kit.mjs';

export default {
  kind: 'ex_name_card',
  label: 'Name card',
  defaults: { dur: 3 },
  layout(canvas, props, env) {
    const sa = safeArea(canvas);
    const u = unit(canvas);
    const name = fitText(env, props.name ?? '', env.theme.fonts.display, 64 * u, (sa.x1 - sa.x0) * 0.6, 36 * u);
    const desc = fitText(env, props.descriptor ?? '', env.theme.fonts.label, 30 * u, (sa.x1 - sa.x0) * 0.6, 20 * u, 2 * u);
    const w = Math.max(env.measure(name.text, env.theme.fonts.display, name.size), env.measure(desc.text, env.theme.fonts.label, desc.size, 2 * u)) + 70 * u;
    const h = name.size * 1.25 + desc.size * 1.8 + 40 * u;
    const P = props.panel ?? { x: sa.x0, y: sa.y1 - h - (canvas.h > canvas.w ? 0 : 20 * u), w, h };
    return panelLayout(P, canvas, { name, desc, u, overflow: name.truncated || desc.truncated });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th } = env;
    const a = visualAlpha(t, dur, fps, 2, 6);
    const bar = graphicEase('expo_out')(clamp01((t * fps) / 8));
    const slide = graphicEase('cubic_out')(clamp01((t * fps - 3) / 8));
    const { P, u } = L;
    ctx.save();
    ctx.globalAlpha = a;
    roundRectPath(ctx, P.x, P.y, P.w * bar, P.h, 10 * u);
    ctx.fillStyle = withAlpha(th.colors.panel ?? th.colors.ink, 0.88);
    ctx.fill();
    ctx.fillStyle = th.colors.accent;
    ctx.fillRect(P.x, P.y, 8 * u, P.h * bar);
    ctx.beginPath();
    ctx.rect(P.x, P.y, P.w * bar, P.h);
    ctx.clip();
    const dx = (1 - slide) * -40 * u;
    text(ctx, L.name.text, P.x + 34 * u + dx, P.y + 20 * u + L.name.size, th.fonts.display, L.name.size, th.colors.text);
    text(ctx, L.desc.text.toUpperCase(), P.x + 34 * u + dx * 1.4, P.y + 20 * u + L.name.size * 1.25 + L.desc.size * 1.2, th.fonts.label, L.desc.size, th.colors.accent, 'left', 2 * u);
    ctx.restore();
  },
};
