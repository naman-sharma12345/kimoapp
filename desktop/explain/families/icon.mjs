// logo_or_icon: an icon from the bundled Lucide (ISC) / Tabler (MIT) set, or a
// Simple Icons (CC0) brand mark, with a label, in a card or as a floating
// badge near the subject. props.icon = {d, kind: 'line' | 'brand', hex}.
import { drawPanel, visualAlpha, fitText, text, scale, panelLayout, graphicEase, clamp01, withAlpha, reveal } from './common.mjs';
import { panelOf } from '../panel.mjs';
import { strokeIcon, fillIcon } from '../svgpath.mjs';

export default {
  kind: 'ex_icon',
  label: 'Icon / logo',
  defaults: { dur: 2.5 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, { ...props, mode: props.mode ?? 'overlay' });
    const { pad, title } = scale(P, canvas);
    const iconSize = Math.min(P.h - pad * 2, P.w * 0.36);
    const label = fitText(env, props.label ?? '', env.theme.fonts.display, title * 1.6, P.w - pad * 3 - iconSize, title * 0.8);
    return panelLayout(P, canvas, { pad, iconSize, label, overflow: label.truncated });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    const pop = reveal(t, props.items?.[0]?.t ?? 0, fps, 8, 'back_out');
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    const s = L.iconSize;
    const x = L.P.x + L.pad;
    const y = L.P.y + (L.P.h - s) / 2;
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.scale(pop, pop);
    ctx.translate(-(x + s / 2), -(y + s / 2));
    const icon = props.icon ?? {};
    if (icon.d) {
      if (icon.kind === 'brand') {
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(th.colors.text, 0.95);
        ctx.fill();
        fillIcon(ctx, icon.d, x + s * 0.22, y + s * 0.22, s * 0.56, icon.hex ? `#${icon.hex}` : th.colors.ink);
      } else strokeIcon(ctx, icon.d, x, y, s, th.colors.accent, 1.8);
    }
    ctx.restore();
    text(ctx, L.label.text, x + s + L.pad, L.P.y + L.P.h / 2 + L.label.size * 0.36, th.fonts.display, L.label.size, th.colors.text);
    ctx.restore();
  },
};
