// Draws kimo caption chunks (EDL caption_word_group overlays) and styled hook
// titles into an AssDocument: one Dialogue per word state, chunk-level
// pop/bounce/fade carried across states with time-shifted \t transforms,
// karaoke \kf sweeps, a sliding vector highlight box, a reveal pill, and the
// title effects (echo slide, gold light sweep, decay). Pure: no I/O.
import { tag, roundedRect, colour } from './ass.mjs';
import { captionStyle, CAPTION_ENGINE, fontSize, measureChunk, layoutFor, chunkWords, normalizeWords, isDevanagari } from './captions.mjs';

const ms = (s) => Math.round(s * 1000);
const fontOf = (style, lang) => (lang === 'hi' && style.font_devanagari ? style.font_devanagari : style.font);

/** Deterministic pseudo-random in [-1, 1] for a chunk index (rotations, jitter). */
export function jitter(i, salt = 0) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Registers the style's ASS styles on the document (idempotent). */
export function registerStyle(doc, style, canvas) {
  const name = `kc-${style.id}`;
  if (doc.hasStyle(name)) return name;
  const size = fontSize(style, canvas);
  const c = style.colors;
  doc.style({
    name,
    font: style.font.family,
    size,
    primary: c.text,
    secondary: c.text,
    outline: c.outline,
    back: c.shadow ?? '#000000',
    backOpacity: style.shadow_opacity ?? 0.5,
    outlineWidth: (style.outline ?? 0) * canvas.w,
    shadow: (style.shadow ?? 0) * canvas.w,
    spacing: (style.letter_spacing ?? 0) * size * 10,
    align: 5,
  });
  // auto-contrast variant: same look on a soft translucent box (BorderStyle 3)
  doc.style({
    name: `${name}-boxed`,
    font: style.font.family,
    size,
    primary: c.text,
    secondary: c.text,
    outline: '#000000',
    outlineOpacity: 0.55,
    back: '#000000',
    backOpacity: 0,
    borderStyle: 3,
    outlineWidth: size * 0.18,
    shadow: 0,
    spacing: (style.letter_spacing ?? 0) * size * 10,
    align: 5,
  });
  return name;
}

const cased = (style, w) => (style.case === 'upper' && !isDevanagari(w) ? w.toUpperCase() : w);

/**
 * Text parts of a chunk with per-word colour/opacity: colourOf(wi) and
 * opacityOf(wi) pick each word's fill; Devanagari words switch font.
 */
function textParts(style, chunk, { colourOf, opacityOf = () => 1, extra = () => [] }) {
  const parts = [];
  let k = 0;
  const lines = chunk.lines?.length ? chunk.lines : [chunk.words.length];
  lines.forEach((n, li) => {
    for (let j = 0; j < n; j++, k++) {
      const w = chunk.words[k];
      if (!w) break;
      const font = fontOf(style, w.lang ?? (isDevanagari(w.w) ? 'hi' : 'latin'));
      parts.push({ tags: [tag.fn(font.family), tag.c(colourOf(k)), tag.a1(opacityOf(k)), ...extra(k)] });
      parts.push({ text: cased(style, w.w) + (j + 1 < n ? ' ' : '') });
    }
    if (li + 1 < lines.length) parts.push({ text: '\n' });
  });
  return parts;
}

/** Chunk-level entrance/exit tags shifted so they run continuously across word-state events. */
function chunkMotion(style, { offset, dur, scale, fps, index, out = true }) {
  const a = style.animation ?? {};
  const inA = a.in ?? {};
  const outA = a.out ?? {};
  const fr = (n) => (n * 1000) / fps;
  const s = 100 * scale;
  const tags = [];
  const o = ms(offset);
  if (inA.type === 'pop' && inA.frames > 0) {
    const t1 = fr(Math.max(1, Math.round(inA.frames * 0.6)));
    const t2 = fr(inA.frames);
    if (o < t2) tags.push(tag.fsc(s * (inA.from ?? 0.7)), tag.t(-o, t1 - o, tag.fsc(s * (inA.peak ?? 1.08))), tag.t(t1 - o, t2 - o, tag.fsc(s)));
    else tags.push(tag.fsc(s));
  } else if (inA.type === 'bounce' && inA.frames > 0) {
    const f = inA.frames;
    const k = [0.35, 0.65, 1].map((x) => fr(Math.round(f * x)));
    if (o < k[2])
      tags.push(
        tag.fscx(s * 1.25), tag.fscy(s * (inA.from ?? 0.6)),
        tag.t(-o, k[0] - o, tag.fscx(s * 0.9), tag.fscy(s * (inA.peak ?? 1.15))),
        tag.t(k[0] - o, k[1] - o, tag.fscx(s * 1.04), tag.fscy(s * 0.95)),
        tag.t(k[1] - o, k[2] - o, tag.fsc(s)),
      );
    else tags.push(tag.fsc(s));
  } else tags.push(tag.fsc(s));
  const inMs = inA.type === 'fade' ? inA.ms ?? fr(inA.frames ?? 3) : 0;
  const outMs = outA.type === 'fade' || outA.type === 'decay' ? outA.ms ?? fr(outA.frames ?? 3) : 0;
  if (inMs > 0 && o < inMs) tags.push(tag.alpha(0), tag.t(-o, inMs - o, tag.alpha(1)));
  if (out && outMs > 0 && outA.type === 'fade') tags.push(tag.t(ms(dur) - outMs - o, ms(dur) - o, tag.alpha(0)));
  const rot = style.word_fx?.rotate;
  if (rot) tags.push(tag.frz(jitter(index, 3) * rot));
  return tags;
}

/** Places and clips an event to the window [from, to) (output seconds) and the chunk's visible range. */
function emit(doc, e, win) {
  const start = Math.max(e.start, win.from, win.visible?.[0] ?? -Infinity);
  const end = Math.min(e.end, win.to, win.visible?.[1] ?? Infinity);
  if (!(end > start + 1e-6)) return;
  const shift = start - e.start;
  // tags were written for the event's own start: keep them in step when the window trims it
  const parts = shift > 1e-6 ? e.parts.map((p) => (p.tags ? { tags: p.tags.map((t) => shiftTag(t, shift)) } : p)) : e.parts;
  doc.event({ ...e, start: start - win.from, end: end - win.from, parts });
}
/** Re-times \t, \move and \fad arguments when an event's start is moved later by `shift` seconds. */
function shiftTag(t, shift) {
  const d = ms(shift);
  return t
    .replace(/\\t\((-?\d+),(-?\d+),/g, (_, a, b) => `\\t(${+a - d},${+b - d},`)
    .replace(/\\move\(([^,]+),([^,]+),([^,]+),([^,]+),(-?\d+),(-?\d+)\)/g, (_, a, b, c, e, t1, t2) => `\\move(${a},${b},${c},${e},${+t1 - d},${+t2 - d})`);
}

function wordStates(chunk) {
  const ws = chunk.words;
  return ws.map((w, k) => ({ k, start: k === 0 ? chunk.at : Math.max(chunk.at, w.at), end: k + 1 < ws.length ? Math.max(chunk.at, ws[k + 1].at) : chunk.at + chunk.dur })).filter((s) => s.end > s.start + 1e-6);
}

/** Draws one caption chunk overlay into the document. */
export function drawChunk(doc, overlay, canvas, fps, win = { from: 0, to: Infinity }) {
  const p = overlay.props;
  if (p.hidden) return;
  const style = captionStyle(p.style);
  const sname = registerStyle(doc, style, canvas);
  const chunk = { at: overlay.at, dur: overlay.dur, words: p.words, lines: p.lines, index: p.index ?? 0 };
  const scale = p.place?.scale ?? 1;
  const cx = p.place?.cx ?? canvas.w / 2;
  const cy = p.place?.cy ?? canvas.h * 0.7;
  const c = style.colors;
  const size = fontSize(style, canvas) * scale;
  const mm = measureChunk(style, chunk, size);
  const boost = p.contrast === 'boost';
  const styleName = boost ? `${sname}-boxed` : sname;
  const w = { ...win, visible: p.visible };
  const base = [tag.an(5), tag.pos(cx, cy)];
  const motion = (offset) => chunkMotion(style, { offset, dur: overlay.dur, scale, fps, index: chunk.index });
  const accentOr = (k, fallback) => (chunk.words[k].accent ? c.accent : fallback);
  const layerBase = 10; // captions sit above planner text (layers 0..9)
  const end = overlay.at + overlay.dur;
  switch (style.highlight) {
    case 'active-colour': {
      for (const s of wordStates(chunk))
        emit(doc, { layer: layerBase + 2, start: s.start, end: s.end, style: styleName, parts: [{ tags: [...base, ...motion(s.start - overlay.at)] }, ...textParts(style, chunk, { colourOf: (k) => (k === s.k ? (chunk.words[k].accent ? c.accent : c.active) : accentOr(k, c.text)) })] }, w);
      break;
    }
    case 'none': {
      if (style.word_fx?.stroke_cycle) {
        // MrBeast: white fill, cycling coloured stroke over a fat black stroke, bounce, small rotation
        const cyc = style.word_fx.stroke_cycle;
        const stroke = cyc[chunk.index % cyc.length];
        const bord = (style.outline ?? 0) * canvas.w;
        const parts = (outline, b, layer) => ({ layer, start: overlay.at, end, style: styleName, parts: [{ tags: [...base, ...motion(0), tag.c3(outline), tag.bord(b)] }, ...textParts(style, chunk, { colourOf: (k) => accentOr(k, c.text) })] });
        emit(doc, parts(style.word_fx.outer_stroke ?? '#000000', bord * (style.word_fx.outer_scale ?? 2), layerBase), w);
        emit(doc, parts(stroke, bord, layerBase + 1), w);
      } else {
        const extra = style.blur ? [tag.blur(0)] : [];
        emit(doc, { layer: layerBase + 2, start: overlay.at, end, style: styleName, parts: [{ tags: [...base, ...motion(0), ...extra] }, ...textParts(style, chunk, { colourOf: (k) => accentOr(k, c.text) })] }, w);
        if (style.blur && (style.shadow ?? 0) > 0)
          // soft shadow: a blurred dark copy under the text
          emit(doc, { layer: layerBase + 1, start: overlay.at, end, style: styleName, parts: [{ tags: [...base, ...motion(0), tag.c(c.shadow ?? '#000000'), tag.alpha(style.shadow_opacity ?? 0.6), tag.shad(0), tag.bord(size * 0.04), tag.c3(c.shadow ?? '#000000'), tag.blur(style.blur * 2 + 2)] }, ...textParts(style, chunk, { colourOf: () => c.shadow ?? '#000000', opacityOf: () => style.shadow_opacity ?? 0.6 })] }, w);
      }
      break;
    }
    case 'reveal': {
      const b = style.box;
      if (b) {
        const bw = mm.width + 2 * b.pad_x * size;
        const bh = mm.height + 2 * b.pad_y * size;
        emit(doc, { layer: layerBase, start: overlay.at, end, style: styleName, parts: [{ tags: [tag.an(5), tag.pos(cx, cy), tag.c(b.color), tag.alpha(b.opacity), tag.bord(0), tag.shad(0), ...motion(0).filter((t) => !t.startsWith('\\fsc'))] }, { draw: roundedRect(bw, bh, b.radius * size) }] }, w);
      }
      for (const s of wordStates(chunk)) emit(doc, { layer: layerBase + 2, start: s.start, end: s.end, style: styleName, parts: [{ tags: [...base, ...motion(s.start - overlay.at)] }, ...textParts(style, chunk, { colourOf: (k) => accentOr(k, c.text), opacityOf: (k) => (k <= s.k ? 1 : style.reveal_opacity ?? 0.4) })] }, w);
      break;
    }
    case 'karaoke': {
      // full chunk; \kf sweeps the fill (primary = active) over each word from its onset to the next onset
      const parts = [{ tags: [...base, ...motion(0), tag.c2(c.text)] }];
      let k = 0;
      let cursor = overlay.at;
      const lines = chunk.lines?.length ? chunk.lines : [chunk.words.length];
      lines.forEach((n, li) => {
        for (let j = 0; j < n; j++, k++) {
          const word = chunk.words[k];
          const lead = Math.max(0, word.at - cursor);
          const until = k + 1 < chunk.words.length ? chunk.words[k + 1].at : Math.min(end, word.at + 1.2);
          const font = fontOf(style, word.lang ?? (isDevanagari(word.w) ? 'hi' : 'latin'));
          if (lead > 0.005) parts.push({ tags: [tag.k(lead * 100)] }, { text: '' });
          parts.push({ tags: [tag.fn(font.family), tag.c(word.accent ? c.accent : c.active), tag.kf(Math.max(1, (until - Math.max(cursor, word.at)) * 100))] }, { text: cased(style, word.w) + (j + 1 < n ? ' ' : '') });
          cursor = Math.max(cursor, until);
        }
        if (li + 1 < lines.length) parts.push({ text: '\n' });
      });
      emit(doc, { layer: layerBase + 2, start: overlay.at, end, style: styleName, parts }, w);
      break;
    }
    case 'box': {
      const hb = style.highlight_box ?? { color: c.accent, radius: 0.2, pad_x: 0.15, pad_y: 0.06, slide_frames: 3 };
      const top = cy - mm.height / 2;
      const pos = mm.lines.flatMap((line, li) => line.words.map((lw) => ({ index: lw.index, x: cx - line.width / 2 + lw.x + lw.width / 2, y: top + li * mm.lineH + mm.lineH / 2 - (mm.asc - mm.desc) * 0.06, w: lw.width })));
      const at = (k) => pos.find((x) => x.index === k);
      const slide = ((hb.slide_frames ?? 3) * 1000) / fps;
      const states = wordStates(chunk);
      for (const [si, s] of states.entries()) {
        const cur = at(s.k);
        const prev = si ? at(states[si - 1].k) : cur;
        if (!cur) continue;
        const bw = cur.w + 2 * hb.pad_x * size;
        const bh = (mm.asc + mm.desc) * 0.86 + 2 * hb.pad_y * size;
        const fromScale = prev ? (100 * (prev.w + 2 * hb.pad_x * size)) / bw : 100;
        const boxTags = [tag.an(5), tag.c(hb.color), tag.alpha(1), tag.bord(0), tag.shad(0)];
        if (si && prev && (prev.x !== cur.x || prev.y !== cur.y)) boxTags.push(tag.move(prev.x, prev.y, cur.x, cur.y, 0, slide), tag.fscx(fromScale), tag.t(0, slide, tag.fscx(100)));
        else boxTags.push(tag.pos(cur.x, cur.y), ...(si ? [] : motion(0)));
        emit(doc, { layer: layerBase, start: s.start, end: s.end, style: styleName, parts: [{ tags: boxTags }, { draw: roundedRect(bw, bh, hb.radius * size) }] }, w);
        emit(doc, { layer: layerBase + 2, start: s.start, end: s.end, style: styleName, parts: [{ tags: [...base, ...motion(s.start - overlay.at)] }, ...textParts(style, chunk, { colourOf: (k) => (k === s.k ? c.active : accentOr(k, c.text)), extra: (k) => (k === s.k ? [tag.bord(0)] : [tag.bord((style.outline ?? 0) * canvas.w)]) })] }, w);
      }
      break;
    }
    case 'echo':
    case 'gold':
    case 'decay':
      drawTitleEffect(doc, style, { at: overlay.at, end, cx, cy, chunk, size, mm, styleName, canvas, fps, layer: layerBase, index: chunk.index }, w);
      break;
    default:
      throw new Error(`caption style ${style.id}: unknown highlight ${style.highlight}`);
  }
}

/** Echo slide, gold light sweep and decay: the reference-reel title looks, built from stacked ASS copies. */
export function drawTitleEffect(doc, style, o, win) {
  const { at, end, cx, cy, chunk, size, mm, styleName, canvas, fps, layer } = o;
  const c = style.colors;
  const a = style.animation ?? {};
  const fr = (n) => (n * 1000) / fps;
  const dur = end - at;
  const text = (colourOf, opacityOf) => textParts(style, chunk, { colourOf, opacityOf });
  const fadeOut = a.out?.type === 'fade' ? [tag.t(ms(dur) - fr(a.out.frames ?? 3), ms(dur), tag.alpha(0))] : [];
  if (style.highlight === 'echo') {
    const e = a.in ?? {};
    const slideMs = fr(e.frames ?? 7);
    const dx = (e.offset ?? 0.14) * canvas.w;
    const stretch = 100 * (e.stretch ?? 1.6);
    const copies = e.copies ?? 3;
    const delay = fr(e.delay_frames ?? 2);
    for (let i = copies; i >= 0; i--) {
      const d = i * delay;
      const tags = [tag.an(5), tag.move(cx + dx, cy, cx, cy, d, d + slideMs), tag.fscx(stretch), tag.fscy(100), tag.t(d, d + slideMs, 0.45, tag.fscx(100))];
      if (i === 0) tags.push(tag.alpha(0), tag.t(0, Math.min(90, slideMs), tag.alpha(1)), ...fadeOut);
      else {
        const op = 0.55 - (i - 1) * 0.15;
        // echoes trail, then fade out once the main text has landed
        tags.push(tag.alpha(0), tag.t(d, d + 40, tag.alpha(op)), tag.t(d + slideMs, d + slideMs + fr(4), tag.alpha(0)), tag.blur(1.5 + i), tag.bord(0));
      }
      emit(doc, { layer: layer + (copies - i), start: at, end: i ? Math.min(end, at + (d + slideMs + fr(5)) / 1000) : end, style: styleName, parts: [{ tags }, ...text((k) => (i ? c.echo ?? c.accent : chunk.words[k].accent ? c.accent : c.text), () => 1)] }, win);
    }
    return;
  }
  if (style.highlight === 'gold') {
    const pop = chunkMotion(style, { offset: 0, dur, scale: size / fontSize(style, canvas), fps, index: o.index, out: false });
    const top = cy - mm.height / 2;
    const left = cx - mm.width / 2 - size * 0.1;
    const right = cx + mm.width / 2 + size * 0.1;
    // base: dark-gold full text (outline + shadow), then a lighter top band clipped above the midline
    emit(doc, { layer, start: at, end, style: styleName, parts: [{ tags: [tag.an(5), tag.pos(cx, cy), ...pop, ...fadeOut] }, ...text(() => c.gold_bottom ?? c.text)] }, win);
    // per line: the upper ~55 % of each line in the lighter gold (two-band metallic fill)
    mm.lines.forEach((_, li) => {
      const y0 = top + li * mm.lineH + (mm.lineH - (mm.asc + mm.desc)) / 2;
      const yMid = y0 + mm.asc * 0.62;
      emit(doc, { layer: layer + 1, start: at, end, style: styleName, parts: [{ tags: [tag.an(5), tag.pos(cx, cy), ...pop, tag.clip(0, li ? y0 : 0, canvas.w, yMid), tag.bord(0), tag.shad(0), ...fadeOut] }, ...text(() => c.gold_top ?? c.text)] }, win);
    });
    const sw = a.sweep ?? { delay_ms: 120, ms: 650, band: 0.22 };
    const band = Math.max(size * 0.4, mm.width * (sw.band ?? 0.22));
    const y0 = top - size * 0.3;
    const y1 = top + mm.height + size * 0.3;
    const t1 = sw.delay_ms ?? 120;
    const t2 = t1 + (sw.ms ?? 650);
    if (t1 / 1000 < dur)
      emit(doc, { layer: layer + 2, start: at, end: Math.min(end, at + (t2 + 60) / 1000), style: styleName, parts: [{ tags: [tag.an(5), tag.pos(cx, cy), ...pop, tag.bord(0), tag.shad(0), tag.blur(size * 0.03), tag.clip(left - band, y0, left, y1), tag.t(t1, t2, tag.clip(right, y0, right + band, y1))] }, ...text(() => c.shine ?? '#FFFFFF', () => 0.9)] }, win);
    return;
  }
  // decay: resolve from blur, hold, then erode with growing blur, shrinking outline and jittered ghosts
  const inA = a.in ?? {};
  const outA = a.out ?? {};
  const inMs = fr(inA.frames ?? 6);
  const outMs = Math.min(fr(outA.frames ?? 9), Math.max(0, ms(dur) - inMs));
  const bord = (style.outline ?? 0) * canvas.w;
  const tOut = ms(dur) - outMs;
  emit(doc, { layer: layer + 2, start: at, end, style: styleName, parts: [{ tags: [tag.an(5), tag.pos(cx, cy), tag.blur(inA.blur ?? 8), tag.alpha(0.35), tag.fsc(104), tag.t(0, inMs, 0.6, tag.blur(0), tag.alpha(1), tag.fsc(100)), tag.t(tOut, ms(dur), 1.6, tag.blur(outA.blur ?? 7), tag.bord(0), tag.alpha(0), tag.fscy(96))] }, ...text((k) => (chunk.words[k].accent ? c.accent : c.text))] }, win);
  const ghosts = outA.ghosts ?? 3;
  const jit = (outA.jitter ?? 0.004) * canvas.w;
  for (let g = 1; g <= ghosts; g++) {
    const gStart = at + (tOut + (g - 1) * (outMs / (ghosts + 1))) / 1000;
    const dx = jitter(o.index * 7 + g, 1) * jit * (1 + g * 0.6);
    const dy = jitter(o.index * 7 + g, 2) * jit;
    emit(doc, { layer: layer + 1, start: gStart, end, style: styleName, parts: [{ tags: [tag.an(5), tag.pos(cx + dx, cy + dy), tag.bord(bord * 0.4), tag.blur(2 + g), tag.alpha(0.45 / g), tag.t(0, Math.max(40, outMs / 2), tag.alpha(0), tag.blur(6 + g * 2))] }, ...text(() => c.text)] }, win);
  }
}

/**
 * Hook title with a title effect: wraps the title into ≤ 2 lines at the
 * style's wide/shorts char limit and draws it at the overlay's centre.
 */
export function drawHookTitle(doc, overlay, canvas, fps, styleId, win = { from: 0, to: Infinity }) {
  const style = captionStyle(styleId);
  const sname = registerStyle(doc, style, canvas);
  const text = String(overlay.props?.text ?? '').trim();
  if (!text) return;
  let t = 0;
  const raw = text.split(/\s+/).map((w) => {
    const r = { w, start: overlay.at + t, end: overlay.at + t + 0.2 };
    t += 0.2;
    return r;
  });
  const words = normalizeWords(raw, style);
  const layout = { ...layoutFor(style, canvas), max_words: Math.max(6, words.length), max_lines: 2 };
  const chunks = chunkWords(words.map((w) => ({ ...w, sentenceEnd: false })), layout);
  const lines = chunks.length === 1 ? chunks[0].lines : [Math.ceil(words.length / 2), words.length - Math.ceil(words.length / 2)];
  const chunk = { words: words.map((w) => ({ ...w, at: overlay.at, accent: false })), lines, index: 0 };
  let size = fontSize(style, canvas) * 1.15;
  let mm = measureChunk(style, chunk, size);
  const maxW = canvas.w * (canvas.h > canvas.w ? 0.8 : 0.84);
  if (mm.width > maxW) {
    size *= maxW / mm.width;
    mm = measureChunk(style, chunk, size);
  }
  const p = overlay.props;
  const cx = canvas.w * (p.x ?? 0.5);
  const cy = Math.max(canvas.h * 0.14 + mm.height / 2, Math.min(canvas.h * 0.78 - mm.height / 2, canvas.h * (p.y ?? 0.3)));
  const scale = size / fontSize(style, canvas);
  const end = overlay.at + overlay.dur;
  if (style.kind === 'title' || ['echo', 'gold', 'decay'].includes(style.highlight)) {
    drawTitleEffect(doc, style, { at: overlay.at, end, cx, cy, chunk, size, mm, styleName: sname, canvas, fps, layer: 20, index: 0 }, win);
    return;
  }
  emit(doc, { layer: 22, start: overlay.at, end, style: sname, parts: [{ tags: [tag.an(5), tag.pos(cx, cy), ...chunkMotion(style, { offset: 0, dur: overlay.dur, scale, fps, index: 0 })] }, ...textParts(style, chunk, { colourOf: () => style.colors.text })] }, win);
}

/** True for overlays this module draws (kimo captions and restyled hook titles). */
export const isKimoCaption = (o) => o?.props?.engine === CAPTION_ENGINE;
/** Hook titles that take the edit's title effect (first 3 s, planner text titles). */
export const isStyledHook = (edl, o) => Boolean(edl.captions?.hook_style) && o.kind === 'hook_title' && !o.props?.primitive && typeof o.props?.text === 'string' && o.at < 3;

/** All kimo caption and hook-title events of an EDL inside [from, to) frames into doc. */
export function drawCaptions(doc, edl, fps, from = 0, to = Infinity) {
  const win = { from: from / fps, to: to / fps };
  for (const o of edl.overlays) {
    if (o.at >= win.to || o.at + o.dur <= win.from) continue;
    if (isKimoCaption(o)) drawChunk(doc, o, edl.canvas, fps, win);
    else if (isStyledHook(edl, o)) drawHookTitle(doc, o, edl.canvas, fps, edl.captions.hook_style, win);
  }
  return doc;
}

export { colour };
