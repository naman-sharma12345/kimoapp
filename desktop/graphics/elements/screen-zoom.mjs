// Screen zoom ("Screen Studio" look) for screen recordings: the recording sits
// on a card with rounded corners and a soft drop shadow over a blurred copy of
// itself, and the camera eases 1.6–2.5× onto the region being talked about.
// The camera move and the card are compositor work (graphics/plan.mjs writes
// the keys and clip.screen_card); this element draws the card's shadow layer.
import { unit, roundRectPath, setShadow, withAlpha, envelope } from '../kit.mjs';

/** Card rectangle (canvas px) for a canvas: inset 7 % (vertical 5 %), corner radius 1.6 % of the short side. */
export function cardRect(canvas, inset) {
  const k = inset ?? (canvas.h > canvas.w ? 0.05 : 0.07);
  const w = Math.round(canvas.w * (1 - 2 * k));
  const h = Math.round(canvas.h * (1 - 2 * k));
  return { x: Math.round((canvas.w - w) / 2), y: Math.round((canvas.h - h) / 2), w, h, radius: Math.round(Math.min(canvas.w, canvas.h) * 0.016), scale: 1 - 2 * k };
}

export default {
  kind: 'screen_zoom',
  label: 'Screen zoom',
  defaults: { dur: 3 },
  layout(canvas, props) {
    const card = props.card ?? cardRect(canvas, props.inset);
    const u = unit(canvas);
    const m = 90 * u;
    return { card, safeBox: card, box: { x: card.x - m, y: card.y - m, w: card.w + 2 * m, h: card.h + 2 * m }, edge: true };
  },
  draw(ctx, t, props, L, env) {
    const { theme: th, fps, dur } = env;
    const u = (L.card.x - L.box.x) / 90;
    const e = envelope(t, dur, fps, { inFrames: props.fade ? 6 : 0.0001, outFrames: props.fade ? 6 : 0.0001 });
    ctx.save();
    ctx.globalAlpha = props.fade ? e.in * (1 - e.out) : 1;
    setShadow(ctx, withAlpha(th.colors.shadow, 0.55), 70 * u, 0, 26 * u);
    ctx.fillStyle = th.colors.ink;
    roundRectPath(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.card.radius);
    ctx.fill();
    ctx.restore();
  },
};
