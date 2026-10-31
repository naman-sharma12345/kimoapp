// list: a title, then items reveal one by one on their spoken word (slide 24 px
// + fade, 7 frames, cubic-out). The item being talked about is in the accent
// colour; earlier items dim to 60 %. Number badges. Max 5 per page (more → pages).
import { drawPanel, reveal, activeIndex, visualAlpha, fitText, text, badge, scale, panelLayout, fitPanel, SLIDE_PX, withAlpha } from './common.mjs';
import { panelOf } from '../panel.mjs';

export const PAGE = 5;
export default {
  kind: 'ex_list',
  label: 'List',
  defaults: { dur: 4 },
  layout(canvas, props, env) {
    const P0 = panelOf(canvas, props);
    const { pad, title, body, s } = scale(P0, canvas);
    const items = (props.items ?? []).slice(0, 12);
    const rows = Math.min(PAGE, Math.max(1, items.length));
    const titleFit = props.title ? fitText(env, props.title, env.theme.fonts.serif, title * 1.25, P0.w - 2 * pad) : null;
    const head = titleFit ? titleFit.size * 1.5 : 0;
    const rowH0 = Math.min(body * 2.2, (P0.h - 2 * pad - head) / rows);
    const P = props.mode === 'full' || props.mode === 'pip' ? P0 : fitPanel(P0, pad * 2 + head + rowH0 * rows, props.mode);
    const top = P.y + pad + head;
    const rowH = Math.min(body * 2.2, (P.y + P.h - pad - top) / rows);
    const badgeR = Math.min(rowH * 0.32, body * 0.62);
    const textX = P.x + pad + badgeR * 2 + 18 * s;
    const fits = items.map((it) => fitText(env, it.text, env.theme.fonts.body, Math.min(body, rowH * 0.5), P.x + P.w - pad - textX, body * 0.55));
    return panelLayout(P, canvas, { pad, titleFit, top, rowH, badgeR, textX, fits, overflow: fits.some((f) => f.truncated) || Boolean(titleFit?.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const items = (props.items ?? []).slice(0, 12);
    const a = visualAlpha(t, dur, fps);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    if (L.titleFit) text(ctx, L.titleFit.text, L.P.x + L.pad, L.P.y + L.pad + L.titleFit.size * 0.85, th.fonts.serif, L.titleFit.size, th.colors.text);
    const k = activeIndex(items, t);
    const page = Math.max(0, Math.floor(Math.max(0, k) / PAGE));
    for (let i = page * PAGE; i < Math.min(items.length, (page + 1) * PAGE); i++) {
      const r = reveal(t, items[i].t ?? 0, fps);
      if (r <= 0) continue;
      const row = i - page * PAGE;
      const cy = L.top + L.rowH * (row + 0.5);
      const on = i === k;
      ctx.save();
      ctx.globalAlpha = a * r * (on ? 1 : 0.6);
      ctx.translate(0, (1 - r) * SLIDE_PX * (L.rowH / 80));
      badge(ctx, i + 1, L.P.x + L.pad + L.badgeR, cy, L.badgeR, th, on);
      const f = L.fits[i];
      text(ctx, f.text, L.textX, cy + f.size * 0.36, th.fonts.body, f.size, on ? th.colors.accent : th.colors.text);
      ctx.restore();
    }
    if (items.length > PAGE) {
      const pages = Math.ceil(items.length / PAGE);
      for (let p = 0; p < pages; p++) {
        ctx.beginPath();
        ctx.arc(L.P.x + L.P.w - L.pad - (pages - 1 - p) * 16, L.P.y + L.P.h - L.pad * 0.6, 4, 0, Math.PI * 2);
        ctx.fillStyle = p === page ? th.colors.accent : withAlpha(th.colors.text, 0.3);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};
