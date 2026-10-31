// stat: a big count-up to the value over 0.5 s, landing exactly on the
// spoken number (the count starts 0.5 s before the word's entry time); unit and
// label beneath; a ring fills to the % value. Currency formatting by locale
// (₹ with lakh/crore grouping when spoken that way, $ with commas).
import { drawPanel, visualAlpha, fitText, text, scale, panelLayout, graphicEase, clamp01, withAlpha } from './common.mjs';
import { panelOf } from '../panel.mjs';

export const COUNT_S = 0.5;
/** Indian grouping: 1234567 → 12,34,567. */
export function groupIndian(n) {
  const [i, d] = String(n).split('.');
  const last = i.slice(-3);
  const rest = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (rest ? `${rest},${last}` : last) + (d ? `.${d}` : '');
}
/** Formats a value for display: prefix (₹, $), grouping by locale, unit (%, x, K, lakh, crore). */
export function formatValue(v, { decimals = 0, prefix = '', unit = '', locale = 'en-US' } = {}) {
  const fixed = Number(v).toFixed(decimals);
  const grouped = Math.abs(Number(v)) >= 1000 ? (locale === 'en-IN' ? groupIndian(fixed) : Number(fixed).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) : fixed;
  const u = /^[a-z]{2,}$/i.test(unit) ? ` ${unit}` : unit;
  return `${prefix}${grouped}${u}`;
}
export default {
  kind: 'ex_stat',
  label: 'Stat',
  defaults: { dur: 2.6 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, title, small, s } = scale(P, canvas);
    const final = formatValue(props.value, props);
    const ring = props.unit === '%' && props.value > 0 && props.value <= 100;
    const ringR = ring ? Math.min(P.h * 0.32, P.w * 0.2) : 0;
    const big = fitText(env, final, env.theme.fonts.display, title * 2.4, P.w - 2 * pad - (ring ? ringR * 2.4 : 0), title);
    const label = props.label ? fitText(env, props.label, env.theme.fonts.label, small * 1.7, P.w - 2 * pad - (ring ? ringR * 2.5 : 0), small, small * 0.14) : null;
    return panelLayout(P, canvas, { pad, big, label, ring, ringR, s, overflow: big.truncated || Boolean(label?.truncated) });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    const t0 = (props.items?.[0]?.t ?? COUNT_S) - COUNT_S;
    const c = graphicEase('expo_out')(clamp01((t - t0) / COUNT_S));
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip', glow: c });
    const cx = L.ring ? L.P.x + L.pad + L.ringR * 1.15 : L.P.x + L.P.w / 2;
    const cy = L.P.y + L.P.h * 0.46;
    if (L.ring) {
      ctx.lineWidth = L.ringR * 0.18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, L.ringR, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(th.colors.text, 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, L.ringR, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * props.value * c) / 100);
      ctx.strokeStyle = th.colors.accent;
      ctx.stroke();
    }
    const tx = L.ring ? L.P.x + L.pad + L.ringR * 2.5 + (L.P.w - L.pad - (L.pad + L.ringR * 2.5)) / 2 : cx;
    const shown = formatValue(Number(props.value) * c, props);
    text(ctx, shown, tx, cy + L.big.size * 0.35 - (L.label ? L.label.size * 0.6 : 0), th.fonts.display, L.big.size, th.colors.accent, 'center');
    if (L.label) {
      ctx.globalAlpha = a * clamp01((t - t0 - 0.2) * 4);
      text(ctx, L.label.text, tx, cy + L.big.size * 0.35 + L.label.size * 1.1, th.fonts.label, L.label.size, th.colors.text, 'center', L.label.size * 0.08);
    }
    ctx.restore();
  },
};
