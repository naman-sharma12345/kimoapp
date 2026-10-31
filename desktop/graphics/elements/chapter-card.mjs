// Chapter / section card: on 16:9 the section title in Instrument Serif over
// the wide opener (a soft scrim behind it), or a full-screen card for docs.
// The label and an accent rule draw on, the title rises word by word from a
// line mask, then the whole card fades.
import { safeArea, isVertical, unit, envelope, clamp01, graphicEase, withAlpha, drawText } from '../kit.mjs';

export default {
  kind: 'chapter',
  label: 'Chapter card',
  defaults: { dur: 1.8, variant: 'over' },
  layout(canvas, props, env) {
    const th = env.theme;
    const title = String(props.title ?? '').trim();
    if (!title) return null;
    const u = unit(canvas);
    const safe = safeArea(canvas);
    const vertical = isVertical(canvas);
    const full = props.variant === 'full';
    const font = th.fonts.serif;
    let size = (vertical ? 104 : full ? 132 : 112) * u;
    const maxW = (safe.x1 - safe.x0) * (full || vertical ? 0.86 : 0.62);
    const words = title.split(/\s+/).slice(0, 10);
    let lines;
    for (let i = 0; i < 10; i++) {
      const space = env.measure(' ', font, size);
      lines = [];
      let cur = [];
      let w = 0;
      for (const word of words) {
        const ww = env.measure(word, font, size);
        if (cur.length && w + space + ww > maxW) {
          lines.push(cur);
          cur = [];
          w = 0;
        }
        cur.push({ text: word, w: ww });
        w += (cur.length > 1 ? space : 0) + ww;
      }
      if (cur.length) lines.push(cur);
      if (lines.length <= 2) break;
      size *= 0.9;
    }
    const space = env.measure(' ', font, size);
    const cap = env.metrics(font).capHeight * size;
    const lineH = size * 1.02;
    const labelSize = 24 * u;
    const label = `CHAPTER ${String(props.index ?? 1).padStart(2, '0')}`;
    const labelSpacing = labelSize * 0.32;
    const labelW = env.measure(label, th.fonts.label, labelSize, labelSpacing);
    const labelCap = env.metrics(th.fonts.label).capHeight * labelSize;
    const gap = 30 * u;
    const blockH = labelCap + gap + cap + lineH * (lines.length - 1) + size * 0.22;
    const centred = full || vertical;
    const lineWs = lines.map((l) => l.reduce((a, x) => a + x.w, 0) + space * (l.length - 1));
    const blockW = Math.max(labelW, ...lineWs);
    const x = centred ? canvas.w / 2 : safe.x0 + 0.03 * canvas.w;
    const top = (centred ? canvas.h * 0.5 : canvas.h * 0.52) - blockH / 2;
    const placed = [];
    lines.forEach((l, li) => {
      let lx = centred ? x - lineWs[li] / 2 : x;
      const baseline = top + labelCap + gap + cap + li * lineH;
      l.forEach((w, wi) => {
        placed.push({ text: w.text, x: lx, baseline, line: li, i: placed.length, w: w.w });
        lx += w.w + space;
      });
    });
    const bx = centred ? x - blockW / 2 : x;
    return {
      full,
      centred,
      size,
      cap,
      font,
      words: placed,
      label: { text: label, x: centred ? x : x, baseline: top + labelCap, size: labelSize, spacing: labelSpacing, w: labelW },
      rule: { x: centred ? x - 36 * u : x, y: top + labelCap + gap * 0.45, w: 72 * u, h: 3 * u },
      safeBox: { x: bx, y: top, w: blockW, h: blockH },
      box: full ? { x: 0, y: 0, w: canvas.w, h: canvas.h } : { x: 0, y: Math.max(0, top - 160 * u), w: Math.min(canvas.w, centred ? canvas.w : bx + blockW + 0.25 * canvas.w), h: Math.min(canvas.h, blockH + 320 * u) },
      edge: full,
    };
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const f = t * fps;
    const e = envelope(t, dur, fps, { inFrames: 10, outFrames: 8 });
    const fade = 1 - e.out;
    ctx.save();
    if (L.full) {
      ctx.globalAlpha = clamp01(f / 6) * fade;
      ctx.fillStyle = th.colors.panel;
      ctx.fillRect(0, 0, canvas.w, canvas.h);
    } else {
      // soft scrim behind the text so the serif reads over any wide shot
      const B = L.box;
      const g = ctx.createLinearGradient(B.x, 0, B.x + B.w, 0);
      g.addColorStop(0, withAlpha(th.colors.shadow, 0.55));
      g.addColorStop(0.65, withAlpha(th.colors.shadow, 0.25));
      g.addColorStop(1, withAlpha(th.colors.shadow, 0));
      ctx.globalAlpha = graphicEase('sine')(clamp01(f / 8)) * fade;
      ctx.fillStyle = L.centred ? withAlpha(th.colors.shadow, 0.42) : g;
      ctx.fillRect(B.x, B.y, B.w, B.h);
      // feather the scrim's top and bottom edges (no hard band)
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      const v = ctx.createLinearGradient(0, B.y, 0, B.y + B.h);
      v.addColorStop(0, 'rgba(0,0,0,1)');
      v.addColorStop(0.38, 'rgba(0,0,0,0)');
      v.addColorStop(0.62, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = v;
      ctx.fillRect(B.x, B.y, B.w, B.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = fade;
    const lp = graphicEase('expo_out')(clamp01(f / 10));
    ctx.fillStyle = th.colors.accent;
    const R = L.rule;
    ctx.fillRect(L.centred ? R.x + (R.w * (1 - lp)) / 2 : R.x, R.y, R.w * lp, R.h);
    ctx.globalAlpha = lp * fade;
    drawText(ctx, L.label.text, L.label.x, L.label.baseline - (1 - lp) * L.label.size * 0.5, { font: th.fonts.label, size: L.label.size, align: L.centred ? 'center' : 'left', fill: th.colors.accent, spacing: L.label.spacing });
    // title words rise from a line mask, 2 frames apart
    for (const w of L.words) {
      const p = graphicEase('expo_out')(clamp01((f - 3 - w.i * 2) / 10));
      if (p <= 0) continue;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.rect(w.x - L.size * 0.2, w.baseline - L.cap - L.size * 0.25, w.w + L.size * 0.4, L.cap + L.size * 0.55);
      ctx.clip();
      drawText(ctx, w.text, w.x, w.baseline + (1 - p) * L.size * 0.9, { font: L.font, size: L.size, fill: th.colors.text, shadow: L.full ? null : [withAlpha(th.colors.shadow, 0.5), L.size * 0.12, 0, L.size * 0.03] });
      ctx.restore();
    }
    ctx.restore();
  },
};
