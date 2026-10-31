// tweet / news card re-typeset in our own design from the text the speaker
// names or the user pastes: name, handle, text, date (tweet) or outlet,
// headline, date (news). No screenshots of third-party UI, no logos.
import { drawPanel, visualAlpha, fitText, wrapLines, text, scale, panelLayout, fitPanel, graphicEase, clamp01, withAlpha } from './common.mjs';
import { panelOf } from '../panel.mjs';

export default {
  kind: 'ex_post',
  label: 'Tweet / news card',
  defaults: { dur: 3.5 },
  layout(canvas, props, env) {
    const P = panelOf(canvas, props);
    const { pad, body, small, title } = scale(P, canvas);
    const news = props.variant === 'news';
    const head = fitText(env, news ? (props.outlet ?? '') : (props.name ?? ''), env.theme.fonts.label, body * 0.8, P.w - 2 * pad - body * 2, small);
    const sub = fitText(env, news ? (props.date ?? '') : `${props.handle ?? ''}${props.date ? ` · ${props.date}` : ''}`, env.theme.fonts.body, small * 0.85, P.w - 2 * pad - body * 2, small * 0.6);
    const size = news ? title * 1.05 : body * 0.9;
    const lines = wrapLines(env, String(props.text ?? '').slice(0, 280), news ? env.theme.fonts.serif : env.theme.fonts.body, size, P.w - 2 * pad, news ? 3 : 5);
    const avatar = body * 1.6;
    const contentH = pad * 2 + Math.max(avatar, head.size + sub.size * 1.6) + pad * 0.6 + size * (0.5 + lines.lines.length * 1.25);
    return panelLayout(props.mode === 'full' || props.mode === 'pip' ? P : fitPanel(P, contentH, props.mode), canvas, { pad, head, sub, lines, size, news, avatar, overflow: lines.truncated });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    const pop = graphicEase('cubic_out')(clamp01((t * fps) / 9));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - pop) * 30);
    drawPanel(ctx, L.P, { ...th, colors: { ...th.colors, panel: '#FBF8F2' } }, canvas, { alpha: 0.98 });
    const ink = '#141210';
    const x = L.P.x + L.pad;
    let y = L.P.y + L.pad;
    if (!L.news) {
      ctx.beginPath();
      ctx.arc(x + L.avatar / 2, y + L.avatar / 2, L.avatar / 2, 0, Math.PI * 2);
      ctx.fillStyle = th.colors.accent;
      ctx.fill();
      text(ctx, String(props.name ?? '?').slice(0, 1).toUpperCase(), x + L.avatar / 2, y + L.avatar * 0.68, th.fonts.display, L.avatar * 0.5, '#FFFFFF', 'center');
    }
    const hx = L.news ? x : x + L.avatar + L.pad * 0.5;
    text(ctx, L.head.text, hx, y + L.head.size, th.fonts.label, L.head.size, L.news ? th.colors.accent : ink, 'left', L.news ? 2 : 0);
    text(ctx, L.sub.text, hx, y + L.head.size + L.sub.size * 1.4, th.fonts.body, L.sub.size, withAlpha(ink, 0.55));
    y += Math.max(L.avatar, L.head.size + L.sub.size * 1.6) + L.pad * 0.6;
    L.lines.lines.forEach((ln, i) => text(ctx, ln, x, y + L.size * (0.9 + i * 1.25), L.news ? th.fonts.serif : th.fonts.body, L.size, ink));
    ctx.restore();
  },
};
