// Lower third: name + role when someone is introduced ("I'm Naman, ...").
// Panel reveals from the left in 8 frames (expo-out), text slides in behind
// the accent bar, holds ~3 s, exits left in 6 frames. Safe-area aware.
import { safeArea, isVertical, unit, applyCase, envelope, clamp01, graphicEase, lerp, roundRectPath, setShadow, clearShadow, withAlpha, drawText } from '../kit.mjs';

export default {
  kind: 'lower_third',
  label: 'Lower third',
  defaults: { dur: 3.4 },
  layout(canvas, props, env) {
    const th = env.theme;
    const name = String(props.name ?? '').trim();
    if (!name) return null;
    const role = String(props.role ?? '').trim();
    const u = unit(canvas);
    const safe = safeArea(canvas);
    const vertical = isVertical(canvas);
    let nameSize = (vertical ? 54 : 48) * u;
    let roleSize = (vertical ? 30 : 27) * u;
    const nameText = applyCase(name, th.case === 'upper' ? 'upper' : 'as-is');
    const roleText = role ? role.toUpperCase() : '';
    const roleSpacing = roleSize * 0.12;
    const padX = 30 * u;
    const padY = 22 * u;
    const bar = 9 * u;
    const gap = 10 * u;
    const maxW = (safe.x1 - safe.x0) * (vertical ? 0.92 : 0.6);
    let nameW;
    let roleW;
    for (let i = 0; i < 10; i++) {
      nameW = env.measure(nameText, th.fonts.label, nameSize);
      roleW = roleText ? env.measure(roleText, th.fonts.body, roleSize, roleSpacing) : 0;
      if (Math.max(nameW, roleW) + 2 * padX + bar <= maxW) break;
      nameSize *= 0.92;
      roleSize *= 0.92;
    }
    const nm = env.metrics(th.fonts.label);
    const rm = env.metrics(th.fonts.body);
    const nameCap = nm.capHeight * nameSize;
    const roleCap = rm.capHeight * roleSize;
    const w = Math.max(nameW, roleW) + 2 * padX + bar;
    const h = padY * 2 + nameCap + (roleText ? gap + roleCap + 6 * u : 0);
    const x = safe.x0 + (vertical ? 0 : 0.01 * canvas.w);
    const y = vertical ? safe.y1 - h - 0.03 * canvas.h : safe.y1 - h - 0.06 * canvas.h;
    const panel = { x, y, w, h };
    return {
      panel,
      bar,
      name: { text: nameText, x: x + bar + padX, baseline: y + padY + nameCap, size: nameSize },
      role: roleText ? { text: roleText, x: x + bar + padX, baseline: y + padY + nameCap + gap + roleCap + 6 * u, size: roleSize, spacing: roleSpacing } : null,
      radius: Math.min(h / 2, th.radius * canvas.h),
      safeBox: panel,
      box: { x: x - 40 * u, y: y - 40 * u, w: w + 80 * u, h: h + 80 * u },
    };
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th } = env;
    const e = envelope(t, dur, fps, { inFrames: 8, outFrames: 6, inEase: 'expo_out', outEase: 'cubic_in' });
    const f = t * fps;
    const P = L.panel;
    const u = L.bar / 9;
    // panel width reveals from the left; exit slides it back out
    const reveal = e.in * (1 - e.out);
    if (reveal <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x - 60 * u, P.y - 60 * u, (P.w + 120 * u) * reveal, P.h + 120 * u);
    ctx.clip();
    setShadow(ctx, withAlpha(th.colors.shadow, 0.35), 28 * u, 0, 10 * u);
    ctx.fillStyle = withAlpha(th.colors.panel, th.colors.panel_alpha ?? 0.86);
    roundRectPath(ctx, P.x, P.y, P.w, P.h, L.radius);
    ctx.fill();
    clearShadow(ctx);
    // accent bar grows top → bottom in the first 5 frames
    const barH = P.h * graphicEase('cubic_out')(clamp01(f / 5));
    ctx.fillStyle = th.colors.accent;
    roundRectPath(ctx, P.x, P.y, L.bar, barH, Math.min(L.bar / 2, L.radius));
    ctx.fill();
    // text slides in from behind the bar, 2 frames after the panel
    const tp = graphicEase('expo_out')(clamp01((f - 2) / 8));
    const dx = (1 - tp) * -40 * u - e.out * 30 * u;
    ctx.globalAlpha = tp * (1 - e.out);
    ctx.beginPath();
    ctx.rect(P.x + L.bar, P.y, P.w - L.bar, P.h);
    ctx.clip();
    drawText(ctx, L.name.text, L.name.x + dx, L.name.baseline, { font: th.fonts.label, size: L.name.size, fill: th.colors.text });
    if (L.role) {
      const rp = graphicEase('expo_out')(clamp01((f - 4) / 8));
      ctx.globalAlpha = rp * (1 - e.out);
      drawText(ctx, L.role.text, L.role.x + (1 - rp) * -30 * u + dx * 0.3, L.role.baseline, { font: th.fonts.body, size: L.role.size, fill: th.colors.muted, spacing: L.role.spacing });
    }
    ctx.restore();
    void lerp;
  },
};
