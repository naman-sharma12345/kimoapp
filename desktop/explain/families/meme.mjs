// meme: licence-clean meme formats rebuilt from scratch in canvas with our
// own layout and emoji instead of copyrighted photos: expectation_reality,
// nobody_me ("nobody: / me:"), two_choice (drake-style two rows),
// this_is_fine (text + emoji parody). Top/bottom text ≤ 8 words, written by
// the model in the speaker's language. A user's own meme image can fill a
// row (props.assets).
import { drawPanel, visualAlpha, fitText, wrapLines, text, scale, panelLayout, graphicEase, clamp01, withAlpha, roundRectPath, reveal } from './common.mjs';
import { panelOf } from '../panel.mjs';

export const MEME_FORMATS = ['expectation_reality', 'nobody_me', 'two_choice', 'this_is_fine'];
const EMOJI = { expectation_reality: ['star', 'x'], nobody_me: ['eyes', 'laugh'], two_choice: ['x', 'check'], this_is_fine: ['fire', 'thinking'] };
const cap8 = (s) => String(s ?? '').split(/\s+/).filter(Boolean).slice(0, 8).join(' ');

export default {
  kind: 'ex_meme',
  label: 'Meme',
  defaults: { dur: 2.8 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, body } = scale(P, canvas);
    const rowH = (P.h - pad * 3) / 2;
    const textW = P.w - pad * 3 - rowH;
    const rows = [cap8(props.top), cap8(props.bottom)].map((s) => wrapLines(env, s, env.theme.fonts.display, body * 0.95, textW, 3));
    return panelLayout(P, canvas, { pad, rowH, textW, rows, size: body * 0.95, overflow: rows.some((r) => r.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    const format = MEME_FORMATS.includes(props.format) ? props.format : 'nobody_me';
    const tags = { expectation_reality: ['EXPECTATION', 'REALITY'], nobody_me: ['NOBODY:', 'ME:'], two_choice: ['', ''], this_is_fine: ['', ''] }[format];
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, { ...th, colors: { ...th.colors, panel: '#FFFFFF' } }, canvas, { alpha: 0.97 });
    for (let i = 0; i < 2; i++) {
      const r = reveal(t, props.items?.[i]?.t ?? i * 0.6, fps, 8, 'back_out');
      if (r <= 0) continue;
      const y = L.P.y + L.pad + i * (L.rowH + L.pad);
      const ex = L.P.x + L.pad;
      ctx.save();
      ctx.globalAlpha = a * clamp01(r * 1.6);
      roundRectPath(ctx, ex, y, L.rowH, L.rowH, L.rowH * 0.12);
      ctx.fillStyle = i === 0 ? '#F2EEE6' : withAlpha(th.colors.accent, 0.18);
      ctx.fill();
      const key = props.assets?.[i]?.key ?? EMOJI[format][i];
      const img = env.images?.[key];
      if (img) {
        const s = L.rowH * 0.74 * (0.6 + 0.4 * r);
        ctx.drawImage(img, ex + (L.rowH - s) / 2, y + (L.rowH - s) / 2, s, s);
      }
      const tx = ex + L.rowH + L.pad;
      if (tags[i]) text(ctx, tags[i], tx, y + L.size * 0.9, th.fonts.label, L.size * 0.62, '#141210', 'left', 2);
      L.rows[i].lines.forEach((ln, k) => text(ctx, ln, tx, y + L.size * (tags[i] ? 2.1 : 1.1) + k * L.size * 1.15, th.fonts.display, L.size, '#141210'));
      ctx.restore();
    }
    ctx.restore();
  },
};
