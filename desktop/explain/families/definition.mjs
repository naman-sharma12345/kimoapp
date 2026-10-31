// definition: a dictionary-style card: the term in Instrument Serif, a
// part-of-speech tag and a ≤ 12-word definition taken from the speech.
import { drawPanel, visualAlpha, reveal, fitText, wrapLines, text, scale, panelLayout, fitPanel, withAlpha } from './common.mjs';
import { panelOf } from '../panel.mjs';

export default {
  kind: 'ex_definition',
  label: 'Definition',
  defaults: { dur: 3.5 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, title, body } = scale(P, canvas);
    const term = fitText(env, props.term ?? '', env.theme.fonts.serif, title * 1.8, P.w - 2 * pad, title);
    const def = String(props.definition ?? '').split(/\s+/).slice(0, 12).join(' ');
    const lines = wrapLines(env, def, env.theme.fonts.body, body * 0.85, P.w - 2 * pad, 3);
    const contentH = pad * 2 + term.size * 0.9 + body * 0.85 * (2.6 + (lines.lines.length - 1) * 1.3) + body * 0.4;
    return panelLayout(props.mode === 'full' || props.mode === 'pip' ? P : fitPanel(P, contentH, props.mode), canvas, { pad, term, lines, body: body * 0.85, overflow: term.truncated || lines.truncated });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    const y = L.P.y + L.pad + L.term.size * 0.9;
    text(ctx, L.term.text, L.P.x + L.pad, y, th.fonts.serif, L.term.size, th.colors.text);
    if (props.pos) text(ctx, String(props.pos).toLowerCase(), L.P.x + L.pad, y + L.body * 1.2, th.fonts.serif_italic ?? th.fonts.serif, L.body * 0.9, withAlpha(th.colors.text, 0.6));
    const r = reveal(t, props.items?.[0]?.t ?? 0.3, fps);
    ctx.globalAlpha = a * r;
    L.lines.lines.forEach((ln, i) => text(ctx, ln, L.P.x + L.pad, y + L.body * (2.6 + i * 1.3) + (1 - r) * 18, th.fonts.body, L.body, th.colors.text));
    ctx.fillStyle = th.colors.accent;
    ctx.fillRect(L.P.x + L.pad, y + L.body * 1.6, 60 * r, 4);
    ctx.restore();
  },
};
