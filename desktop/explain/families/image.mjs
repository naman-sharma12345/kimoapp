// image_asset / photo / screenshot / AI image: a framed card with a slow Ken
// Burns push (screenshots: a device frame and a slow scroll), the caption and,
// when the licence requires it, a small on-screen attribution. AI images are
// labelled "AI image". The picture is props.assets[0] (a prepared PNG).
import { drawPanel, visualAlpha, fitText, text, scale, panelLayout, graphicEase, clamp01, withAlpha, roundRectPath } from './common.mjs';
import { panelOf } from '../panel.mjs';

export default {
  kind: 'ex_image',
  label: 'Image card',
  defaults: { dur: 3 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, small, body } = scale(P, canvas);
    const caption = props.caption ? fitText(env, props.caption, env.theme.fonts.label, body * 0.7, P.w - 2 * pad, small * 0.7) : null;
    const credit = props.credit ? fitText(env, props.credit, env.theme.fonts.body, small * 0.6, P.w - 2 * pad, small * 0.45) : null;
    const pic = { x: P.x + pad * 0.5, y: P.y + pad * 0.5, w: P.w - pad, h: P.h - pad - (caption ? caption.size * 1.8 : 0) - (credit ? credit.size * 1.4 : 0) };
    return panelLayout(P, canvas, { pad, caption, credit, pic, overflow: Boolean(caption?.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    const img = env.images?.[props.assets?.[0]?.key];
    const pop = graphicEase('cubic_out')(clamp01((t * fps) / 9));
    ctx.save();
    ctx.globalAlpha = a;
    const cx = L.P.x + L.P.w / 2;
    const cy = L.P.y + L.P.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(0.94 + 0.06 * pop, 0.94 + 0.06 * pop);
    ctx.rotate((((props.tilt ?? -1.5) * (1 - pop * 0.4)) * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    drawPanel(ctx, L.P, th, canvas, { alpha: 0.96 });
    const R = L.pic;
    ctx.save();
    roundRectPath(ctx, R.x, R.y, R.w, R.h, L.pad * 0.3);
    ctx.clip();
    if (img) {
      // cover fit + Ken Burns (1.0 → 1.08 push; screenshots scroll down slowly instead)
      const ir = img.width / img.height;
      const rr = R.w / R.h;
      const u = clamp01(t / Math.max(0.5, dur));
      const zoom = props.screenshot ? 1 : 1 + 0.08 * u;
      let w = ir > rr ? R.h * ir : R.w;
      let h = ir > rr ? R.h : R.w / ir;
      w *= zoom;
      h *= zoom;
      const x = R.x + (R.w - w) / 2 + (props.pan_x ?? 0.3) * 20 * u;
      const y = props.screenshot ? R.y - (h - R.h) * 0.4 * u : R.y + (R.h - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.fillStyle = withAlpha(th.colors.text, 0.08);
      ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    ctx.restore();
    if (props.ai) {
      const s = L.pad * 0.45;
      roundRectPath(ctx, R.x + s, R.y + s, s * 6.4, s * 1.8, s * 0.5);
      ctx.fillStyle = withAlpha(th.colors.ink, 0.8);
      ctx.fill();
      text(ctx, 'AI image', R.x + s * 1.6, R.y + s * 2.25, th.fonts.label, s * 1.05, th.colors.text);
    }
    let y = R.y + R.h;
    if (L.caption) {
      y += L.caption.size * 1.45;
      text(ctx, L.caption.text, L.P.x + L.pad * 0.5, y, th.fonts.label, L.caption.size, th.colors.text);
    }
    if (L.credit) {
      y += L.credit.size * 1.4;
      text(ctx, L.credit.text, L.P.x + L.pad * 0.5, y, th.fonts.body, L.credit.size, withAlpha(th.colors.text, 0.55));
    }
    ctx.restore();
  },
};
