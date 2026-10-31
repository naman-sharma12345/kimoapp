// Hook title: 2–6 words in the first second. Big, top third on vertical
// canvases, centred on 16:9. Words pop in 3 frames apart with a back-out
// overshoot, an optional marker swipe on the key word, out with a 6-frame
// fade/slide. Effects from Naman's reference reel: echo-slide (stretched slide
// with fading echoes), gold-sweep (metallic fill with a true diagonal light
// sweep) and decay (letters resolve from a blur, then erode one by one).
import { safeArea, isVertical, isWide, fontCss, applyCase, envelope, graphicEase, clamp01, lerp, setShadow, clearShadow, withAlpha, roundRectPath, rng, drawText } from '../kit.mjs';

const MAX_WORDS = 6;
const STAGGER = 3; // frames between words
const POP = 6; // frames per word pop
const OUT = 6;

function splitLines(widths, space, maxW, maxLines) {
  const n = widths.length;
  const total = widths.reduce((a, b) => a + b, 0) + space * (n - 1);
  if (total <= maxW && (n <= 3 || maxLines === 1)) return [n];
  let best = null;
  for (let k = 1; k < n; k++) {
    const a = widths.slice(0, k).reduce((x, y) => x + y, 0) + space * (k - 1);
    const b = widths.slice(k).reduce((x, y) => x + y, 0) + space * (n - k - 1);
    // balanced, slightly bottom-heavy (creator titles read top-short, bottom-long)
    const cost = Math.max(a, b) + (a > b ? (a - b) * 0.15 : 0);
    if (!best || cost < best.cost) best = { k, cost };
  }
  return best ? [best.k, n - best.k] : [n];
}

export default {
  kind: 'hook_title',
  label: 'Hook title',
  defaults: { dur: 2.4, underline: 'marker' },
  layout(canvas, props, env) {
    const theme = env.theme;
    const safe = safeArea(canvas);
    const font = theme.fonts.display;
    const serif = /serif/i.test(font.family);
    const words = applyCase(String(props.text ?? '').trim(), theme.case).split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
    if (!words.length) return null;
    const vertical = isVertical(canvas);
    const wide = isWide(canvas);
    let size = canvas.h * (vertical ? 0.068 : wide ? 0.1 : 0.08) * (serif ? 1.22 : 1);
    const maxW = safe.maxW * (vertical ? 1 : 0.9);
    let lines;
    let widths;
    let space;
    for (let tries = 0; tries < 12; tries++) {
      widths = words.map((w) => env.measure(w, font, size));
      space = env.measure(' ', font, size) * (serif ? 0.9 : 1);
      lines = splitLines(widths, space, maxW, 2);
      let k = 0;
      const lw = lines.map((n) => {
        const w = widths.slice(k, k + n).reduce((a, b) => a + b, 0) + space * (n - 1);
        k += n;
        return w;
      });
      if (Math.max(...lw) <= maxW) break;
      size *= 0.92;
    }
    const m = env.metrics(font);
    const capH = m.capHeight * size;
    const lineH = size * (serif ? 1.0 : 1.04);
    const blockH = capH + lineH * (lines.length - 1);
    const cx = safe.cx - (vertical ? (canvas.w * 0.85 - safe.x1) * 0 : 0);
    // shorts: the top third; 16:9 / square: centred horizontally, above the eye line (never over the face)
    const cy = vertical ? safe.y0 + canvas.h * 0.1 : Math.max(safe.y0 + blockH / 2 + size * 0.2, canvas.h * (wide ? 0.27 : 0.25));
    const key = (() => {
      const want = String(props.key ?? '').toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, '');
      const i = want ? words.findIndex((w) => w.toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, '') === want) : -1;
      if (i >= 0) return i;
      if (props.key === false) return -1;
      let best = -1;
      words.forEach((w, j) => {
        if (/^\d/.test(w) || w.replace(/[^\p{L}]/gu, '').length >= 4) if (best < 0 || w.length > words[best].length || /^\d/.test(w)) best = j;
      });
      return best;
    })();
    const placed = [];
    let k = 0;
    lines.forEach((n, li) => {
      const ws = words.slice(k, k + n);
      const wsW = widths.slice(k, k + n);
      const lineW = wsW.reduce((a, b) => a + b, 0) + space * (n - 1);
      let x = cx - lineW / 2;
      const baseline = cy - blockH / 2 + capH + li * lineH;
      ws.forEach((w, i) => {
        const letters = [];
        let lx = 0;
        for (const ch of w) {
          letters.push({ ch, x: lx });
          lx += env.measure(ch, font, size);
        }
        placed.push({ text: w, x, baseline, w: wsW[i], index: k + i, letters });
        x += wsW[i] + space;
      });
      k += n;
    });
    const x0 = Math.min(...placed.map((p) => p.x));
    const x1 = Math.max(...placed.map((p) => p.x + p.w));
    const y0 = cy - blockH / 2;
    const y1 = cy + blockH / 2 + size * 0.22;
    const margin = size * 0.45 + (theme.stroke ?? 0) * size;
    return {
      size,
      capH,
      font,
      words: placed,
      key,
      safeBox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      box: { x: x0 - margin - ((props.effect ?? theme.hook) === 'echo-slide' ? size * 0.6 : 0), y: y0 - margin, w: x1 - x0 + 2 * margin + ((props.effect ?? theme.hook) === 'echo-slide' ? size * 1.2 : 0), h: y1 - y0 + 2 * margin },
    };
  },
  draw(ctx, t, props, L, env) {
    const effect = props.effect ?? env.theme.hook ?? 'pop';
    if (effect === 'echo-slide') return drawEcho(ctx, t, props, L, env);
    if (effect === 'gold-sweep') return drawGold(ctx, t, props, L, env);
    if (effect === 'decay') return drawDecay(ctx, t, props, L, env);
    return drawPop(ctx, t, props, L, env);
  },
};

function baseStyle(L, env, colour) {
  const th = env.theme;
  const s = L.size;
  return {
    font: L.font,
    size: s,
    fill: colour,
    stroke: th.stroke ? th.colors.ink : null,
    strokeWidth: (th.stroke ?? 0) * s * 2,
    shadow: [withAlpha(th.colors.shadow, 0.55), s * 0.16, 0, s * 0.05],
  };
}

function drawPop(ctx, t, props, L, env) {
  const { fps, dur, theme } = env;
  const f = t * fps;
  const s = L.size;
  const out = envelope(t, dur, fps, { outFrames: OUT }).out;
  const n = L.words.length;
  const marker = props.underline !== 'none' && L.key >= 0;
  const swipeStart = (n - 1) * STAGGER + POP - 1;
  const swipe = graphicEase('expo_out')(clamp01((f - swipeStart) / 8));
  const lift = out * s * 0.35;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  for (const w of L.words) {
    const p = clamp01((f - w.index * STAGGER) / POP);
    if (p <= 0) continue;
    const a = clamp01((f - w.index * STAGGER) / 3);
    const sc = lerp(0.55, 1, graphicEase('back_out')(p));
    const dy = (1 - graphicEase('cubic_out')(p)) * s * 0.22 - lift;
    const cx = w.x + w.w / 2;
    const cy = w.baseline - L.capH / 2 + dy;
    const isKey = w.index === L.key;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);
    if (isKey && marker && swipe > 0) {
      // marker swipe behind the key word (slightly skewed highlighter)
      const padX = s * 0.07;
      const hh = L.capH * 1.32;
      const bx = w.x - padX;
      const by = w.baseline + dy - L.capH - (hh - L.capH) / 2;
      const bw = (w.w + 2 * padX) * swipe;
      ctx.save();
      clearShadow(ctx);
      ctx.fillStyle = theme.colors.accent;
      ctx.beginPath();
      const sk = hh * 0.09;
      ctx.moveTo(bx + sk, by);
      ctx.lineTo(bx + bw + sk, by);
      ctx.lineTo(bx + bw - sk, by + hh);
      ctx.lineTo(bx - sk, by + hh);
      ctx.closePath();
      setShadow(ctx, withAlpha(theme.colors.shadow, 0.35), s * 0.12, 0, s * 0.04);
      ctx.fill();
      ctx.restore();
      const st = baseStyle(L, env, theme.colors.text);
      const edge = bx + bw;
      // not yet swiped: the normal word (outline and shadow)
      if (swipe < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(edge, by - s, w.w + s * 2, hh + 2 * s);
        ctx.clip();
        drawText(ctx, w.text, w.x, w.baseline + dy, st);
        ctx.restore();
      }
      // the swiped part turns ink on the marker, no outline (marker look)
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx - sk - s, by - s, edge - bx + sk + s, hh + 2 * s);
      ctx.clip();
      drawText(ctx, w.text, w.x, w.baseline + dy, { ...st, fill: theme.colors.ink, stroke: null, shadow: null });
      ctx.restore();
    } else {
      drawText(ctx, w.text, w.x, w.baseline + dy, baseStyle(L, env, isKey && !marker ? theme.colors.accent : theme.colors.text));
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawEcho(ctx, t, props, L, env) {
  const { fps, dur, theme } = env;
  const f = t * fps;
  const s = L.size;
  const out = envelope(t, dur, fps, { outFrames: OUT }).out;
  const block = L.safeBox;
  const cx = block.x + block.w / 2;
  const copies = [
    { lag: 6, a: 0.16 },
    { lag: 4, a: 0.3 },
    { lag: 2, a: 0.48 },
    { lag: 0, a: 1 },
  ];
  for (const c of copies) {
    const p = clamp01((f - c.lag) / 9);
    if (p <= 0) continue;
    const e = graphicEase('expo_out')(p);
    const sx = lerp(1.6, 1, e);
    const dx = (1 - e) * s * 1.4;
    ctx.save();
    ctx.globalAlpha = c.a * clamp01(p * 3) * (1 - out) * (c.lag ? 1 - clamp01((f - 14 - c.lag) / 6) : 1);
    ctx.translate(cx + dx, 0);
    ctx.scale(sx, 1);
    ctx.translate(-cx, 0);
    for (const w of L.words) {
      const st = baseStyle(L, env, w.index === L.key ? theme.colors.accent : theme.colors.text);
      if (c.lag) {
        st.shadow = null;
        st.stroke = null;
      }
      drawText(ctx, w.text, w.x, w.baseline - out * s * 0.3, st);
    }
    ctx.restore();
  }
}

/** Metallic gold fill + a diagonal light band sweeping left → right (source-atop on a text layer). */
function drawGold(ctx, t, props, L, env) {
  const { fps, dur, theme } = env;
  const f = t * fps;
  const s = L.size;
  const inn = envelope(t, dur, fps, { inFrames: 10, outFrames: OUT });
  const block = L.safeBox;
  const layer = env.layer();
  const lc = layer.getContext('2d');
  lc.translate(-env.origin.x, -env.origin.y);
  const top = block.y - s * 0.1;
  const bot = block.y + block.h;
  const g = lc.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, '#FFF3C4');
  g.addColorStop(0.42, theme.colors.accent2 ?? '#F6D77F');
  g.addColorStop(0.55, theme.colors.accent);
  g.addColorStop(1, '#8A6420');
  const dy = (1 - inn.in) * s * 0.18 - inn.out * s * 0.2;
  for (const w of L.words) drawText(lc, w.text, w.x, w.baseline + dy, { font: L.font, size: s, fill: g });
  // the light band: a 30° diagonal gradient stripe, only where the text is
  const sweep = clamp01((f - 6) / (fps * 0.9));
  if (sweep > 0 && sweep < 1) {
    const span = block.w + block.h * 2 + s * 2;
    const x = block.x - block.h - s + span * graphicEase('sine')(sweep);
    const bw = s * 0.9;
    const band = lc.createLinearGradient(x - bw, top, x + bw, top + (bot - top) * 0.6);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,0.92)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    lc.globalCompositeOperation = 'source-atop';
    lc.fillStyle = band;
    lc.fillRect(block.x - s, top - s, block.w + 2 * s, bot - top + 2 * s);
    lc.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.globalAlpha = inn.in * (1 - inn.out);
  setShadow(ctx, withAlpha(theme.colors.shadow, 0.6), s * 0.18, 0, s * 0.05);
  ctx.drawImage(layer, env.origin.x, env.origin.y);
  ctx.restore();
}

/** Letters resolve from a blur in a shuffled stagger, then erode one by one with jitter and ghosts. */
function drawDecay(ctx, t, props, L, env) {
  const { fps, dur, theme } = env;
  const f = t * fps;
  const s = L.size;
  const total = dur * fps;
  const r = rng(`decay:${props.text}`);
  const letters = L.words.flatMap((w) => w.letters.map((l) => ({ ...l, x: w.x + l.x, baseline: w.baseline, key: w.index === L.key })));
  const order = letters.map((_, i) => ({ i, k: r() })).sort((a, b) => a.k - b.k);
  const inDelay = new Map(order.map((o, j) => [o.i, (j / Math.max(1, letters.length)) * 8]));
  const outStart = total * 0.62;
  const outDelay = new Map(letters.map((_, i) => [i, outStart + r() * (total - outStart - 10)]));
  const jit = letters.map(() => [r() - 0.5, r()]);
  letters.forEach((l, i) => {
    const pin = clamp01((f - inDelay.get(i)) / 8);
    if (pin <= 0) return;
    const pout = clamp01((f - outDelay.get(i)) / 10);
    const blur = (1 - graphicEase('cubic_out')(pin)) * s * 0.12 + graphicEase('cubic_in')(pout) * s * 0.1;
    // a slow per-letter wobble, not per-frame noise
    const jx = (jit[i][0] * s * 0.08 + Math.sin(f * 0.9 + i) * s * 0.012) * pout;
    const jy = -pout * s * (0.1 + jit[i][1] * 0.15);
    const alpha = pin * (1 - pout);
    if (alpha <= 0.002) return;
    const st = { font: L.font, size: s, fill: l.key ? theme.colors.accent : theme.colors.text, shadow: [withAlpha(theme.colors.shadow, 0.5), s * 0.14, 0, s * 0.04] };
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    drawText(ctx, l.ch, l.x + jx, l.baseline + jy, st);
    ctx.restore();
    if (pout > 0.05) {
      // ghost copy drifting off (the Vox-style decay)
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - pout);
      ctx.filter = `blur(${(s * 0.04 + pout * s * 0.08).toFixed(2)}px)`;
      drawText(ctx, l.ch, l.x + jx * 3 + s * 0.04, l.baseline + jy * 1.8, { font: L.font, size: s, fill: theme.colors.text });
      ctx.restore();
    }
  });
}
export const _hookInternals = { splitLines, roundRectPath, fontCss };
