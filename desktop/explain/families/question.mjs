// question: the question text centred with a "?" glyph pop, holding until
// the answer begins (the planner ends the beat at the answer's first word).
import { visualAlpha, wrapLines, text, scale, panelLayout, fitPanel, graphicEase, clamp01, drawPanel } from './common.mjs';
import { panelOf } from '../panel.mjs';

export default {
  kind: 'ex_question',
  label: 'Question',
  defaults: { dur: 2.5 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, title } = scale(P, canvas);
    const size = title * 1.1;
    const wrap = wrapLines(env, props.question ?? '', env.theme.fonts.display, size, P.w - 2 * pad, 3);
    const Pf = props.mode === 'full' || props.mode === 'pip' ? P : fitPanel(P, pad * 2 + size * 2.2 * 1.45 + wrap.lines.length * size * 1.2, props.mode);
    return panelLayout(Pf, canvas, { pad, size, wrap, overflow: wrap.truncated });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    const q = graphicEase('back_out')(clamp01((t * fps - 3) / 9));
    const cx = L.P.x + L.P.w / 2;
    const qSize = L.size * 2.2;
    ctx.save();
    ctx.translate(cx, L.P.y + L.pad + qSize * 0.7);
    ctx.scale(q, q);
    ctx.rotate(((1 - q) * -20 * Math.PI) / 180);
    text(ctx, '?', 0, qSize * 0.35, th.fonts.display, qSize, th.colors.accent, 'center');
    ctx.restore();
    const y0 = L.P.y + L.pad + qSize * 1.45 + L.size * 0.6;
    L.wrap.lines.forEach((ln, i) => text(ctx, ln, cx, y0 + i * L.size * 1.2, th.fonts.display, L.size, th.colors.text, 'center'));
    ctx.restore();
  },
};
