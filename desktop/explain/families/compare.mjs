// compare: a two-column card (left vs right, ✓/✗ marks); each side's points
// reveal on their words; the winner side gets the accent glow when the
// speaker states it (props.winner_t).
import { drawPanel, visualAlpha, reveal, fitText, text, scale, panelLayout, fitPanel, withAlpha, clamp01, roundRectPath, SLIDE_PX } from './common.mjs';
import { panelOf } from '../panel.mjs';

function mark(ctx, ok, x, y, s, colour) {
  ctx.save();
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.strokeStyle = colour;
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(x - s * 0.4, y);
    ctx.lineTo(x - s * 0.1, y + s * 0.3);
    ctx.lineTo(x + s * 0.45, y - s * 0.35);
  } else {
    ctx.moveTo(x - s * 0.32, y - s * 0.32);
    ctx.lineTo(x + s * 0.32, y + s * 0.32);
    ctx.moveTo(x + s * 0.32, y - s * 0.32);
    ctx.lineTo(x - s * 0.32, y + s * 0.32);
  }
  ctx.stroke();
  ctx.restore();
}
export default {
  kind: 'ex_compare',
  label: 'Compare',
  defaults: { dur: 4 },
  layout(canvas, props, env) {
    const P0 = panelOf(canvas, props);
    const { pad, title, body } = scale(P0, canvas);
    const nPts = Math.max(1, (props.left?.points ?? []).length, (props.right?.points ?? []).length);
    const P = props.mode === 'full' || props.mode === 'pip' ? P0 : fitPanel(P0, pad * 2.4 + title * 1.6 + Math.min(body * 1.9, (P0.h - pad * 2 - title * 1.6) / 4) * nPts, props.mode);
    const colW = (P.w - pad * 3) / 2;
    const side = (s) => ({
      title: fitText(env, s?.title ?? '', env.theme.fonts.serif, title, colW),
      points: (s?.points ?? []).slice(0, 4).map((p) => fitText(env, typeof p === 'string' ? p : p.text, env.theme.fonts.body, body * 0.86, colW - body * 1.1, body * 0.5)),
    });
    const left = side(props.left);
    const right = side(props.right);
    const all = [...left.points, ...right.points, left.title, right.title];
    return panelLayout(P, canvas, { pad, colW, left, right, rowH: Math.min(body * 1.9, (P.h - pad * 2 - title * 1.6) / 4), headH: title * 1.5, overflow: all.some((f) => f.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    const win = props.winner && props.winner_t != null ? clamp01((t - props.winner_t) * fps / 8) : 0;
    for (const [k, sideKey] of [[0, 'left'], [1, 'right']]) {
      const S = L[sideKey];
      const src = props[sideKey] ?? {};
      const x = L.P.x + L.pad + k * (L.colW + L.pad);
      const y = L.P.y + L.pad;
      const isWin = props.winner === sideKey;
      if (isWin && win > 0) {
        ctx.save();
        ctx.globalAlpha = a * win * 0.9;
        roundRectPath(ctx, x - L.pad * 0.4, y - L.pad * 0.4, L.colW + L.pad * 0.8, L.P.h - L.pad * 1.2, L.pad * 0.5);
        ctx.lineWidth = 4;
        ctx.strokeStyle = th.colors.accent;
        ctx.stroke();
        ctx.restore();
      }
      const titleR = reveal(t, src.t ?? (src.points?.[0]?.t ?? 0) - 0.1, fps);
      ctx.save();
      ctx.globalAlpha = a * titleR;
      text(ctx, S.title.text, x, y + S.title.size * 0.85, th.fonts.serif, S.title.size, isWin && win > 0 ? th.colors.accent : th.colors.text);
      ctx.restore();
      S.points.forEach((f, i) => {
        const p = src.points[i];
        const r = reveal(t, (typeof p === 'object' ? p.t : null) ?? 0, fps);
        if (r <= 0) return;
        const cy = y + L.headH + L.rowH * (i + 0.5);
        ctx.save();
        ctx.globalAlpha = a * r;
        ctx.translate(0, (1 - r) * SLIDE_PX);
        const ok = typeof p === 'object' && p.ok != null ? p.ok : sideKey === (props.winner ?? 'right');
        mark(ctx, ok, x + f.size * 0.45, cy, f.size, ok ? th.colors.accent : withAlpha(th.colors.text, 0.6));
        text(ctx, f.text, x + f.size * 1.2, cy + f.size * 0.35, th.fonts.body, f.size, th.colors.text);
        ctx.restore();
      });
    }
    // divider
    ctx.strokeStyle = withAlpha(th.colors.text, 0.15);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L.P.x + L.P.w / 2, L.P.y + L.pad);
    ctx.lineTo(L.P.x + L.P.w / 2, L.P.y + L.P.h - L.pad);
    ctx.stroke();
    ctx.restore();
  },
};
