// Progress bar (shorts, optional): a 4–6 px accent bar at the very top (or
// bottom), linear over the whole video. An edge element by design: it sits
// outside the caption safe area, in the strip platform UI leaves alone at the top.
import { unit, withAlpha } from '../kit.mjs';

export default {
  kind: 'progress',
  label: 'Progress bar',
  defaults: { dur: null, position: 'top' },
  layout(canvas, props) {
    const h = Math.max(4, Math.min(6, Math.round(5 * unit(canvas))));
    const y = props.position === 'bottom' ? canvas.h - h : 0;
    const box = { x: 0, y, w: canvas.w, h };
    return { bar: box, safeBox: box, box, edge: true };
  },
  draw(ctx, t, props, L, env) {
    const { theme: th, dur, fps } = env;
    const B = L.bar;
    ctx.fillStyle = withAlpha('#FFFFFF', 0.2);
    ctx.fillRect(B.x, B.y, B.w, B.h);
    // linear over the full duration; the last frame shows the bar full
    const k = Math.min(1, (t + 1 / fps) / dur);
    ctx.fillStyle = th.colors.accent;
    ctx.fillRect(B.x, B.y, B.w * k, B.h);
  },
};
