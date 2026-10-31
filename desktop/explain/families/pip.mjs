// The speaker bubble's ring and shadow for the pip layout (the speaker
// picture itself is the A-roll inset by the compositor at props.rect).
import { panelLayout, withAlpha, roundRectPath, setShadow, clearShadow, unit, visualAlpha } from './common.mjs';

export default {
  kind: 'ex_pip',
  label: 'Speaker bubble ring',
  defaults: { dur: 3 },
  layout(canvas, props) {
    const R = props.rect ?? { x: canvas.w * 0.7, y: canvas.h * 0.65, w: canvas.w * 0.24, h: canvas.h * 0.3, radius: 24 };
    return { ...panelLayout(R, canvas), R };
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const u = unit(canvas);
    const R = L.R;
    ctx.save();
    ctx.globalAlpha = visualAlpha(t, dur, fps, 6, 6);
    setShadow(ctx, withAlpha('#000000', 0.5), 30 * u, 0, 10 * u);
    roundRectPath(ctx, R.x - 4 * u, R.y - 4 * u, R.w + 8 * u, R.h + 8 * u, (R.radius ?? 24) + 4 * u);
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = th.colors.accent;
    ctx.stroke();
    clearShadow(ctx);
    ctx.restore();
  },
};
