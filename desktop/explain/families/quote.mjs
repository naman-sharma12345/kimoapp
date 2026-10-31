// quote: a large quote card with the attribution; words highlight as they
// are spoken (karaoke-like, props.words[i].t).
import { drawPanel, visualAlpha, text, scale, panelLayout, fitPanel, withAlpha } from './common.mjs';
import { panelOf } from '../panel.mjs';
import { fontCss } from '../../graphics/kit.mjs';

export default {
  kind: 'ex_quote',
  label: 'Quote',
  defaults: { dur: 4 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, title, body } = scale(P, canvas);
    const words = (props.words ?? String(props.quote ?? '').split(/\s+/).filter(Boolean).map((w) => ({ w }))).slice(0, 30);
    let size = title * 1.25;
    let lines;
    for (let tries = 0; tries < 10; tries++) {
      lines = [[]];
      let w = 0;
      const space = env.measure(' ', env.theme.fonts.serif, size);
      for (let i = 0; i < words.length; i++) {
        const ww = env.measure(words[i].w, env.theme.fonts.serif, size);
        if (w + ww > P.w - 2 * pad - size && lines.at(-1).length) {
          lines.push([]);
          w = 0;
        }
        lines.at(-1).push({ i, x: w });
        w += ww + space;
      }
      if (lines.length * size * 1.25 <= P.h - pad * 2 - body * 1.8) break;
      size *= 0.9;
    }
    const Pf = props.mode === 'full' || props.mode === 'pip' ? P : fitPanel(P, pad * 2 + size * (0.4 + lines.length * 1.25) + body * 1.8, props.mode);
    return panelLayout(Pf, canvas, { pad, size, lines, words, attrSize: body * 0.7, overflow: lines.length * size * 1.25 > P.h - pad * 2 - body * 1.8 });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    text(ctx, '“', L.P.x + L.pad * 0.6, L.P.y + L.pad + L.size * 0.9, th.fonts.serif, L.size * 2, withAlpha(th.colors.accent, 0.9));
    ctx.font = fontCss(th.fonts.serif, L.size);
    L.lines.forEach((line, li) => {
      for (const { i, x } of line) {
        const w = L.words[i];
        const said = w.t == null || t >= w.t;
        text(ctx, w.w, L.P.x + L.pad + L.size * 0.6 + x, L.P.y + L.pad + L.size * (1.1 + li * 1.25), th.fonts.serif, L.size, said ? th.colors.text : withAlpha(th.colors.text, 0.35));
      }
    });
    if (props.author) text(ctx, `— ${props.author}`, L.P.x + L.P.w - L.pad, L.P.y + L.P.h - L.pad, th.fonts.label, L.attrSize, th.colors.accent, 'right');
    ctx.restore();
  },
};
