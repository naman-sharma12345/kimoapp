// Bundled caption fonts (OFL, desktop/fonts): where they live on disk, their
// advance widths (pure-JS TrueType reader, so caption boxes and highlight
// slides can be laid out without a font engine), FFmpeg filter-path escaping
// and a libass font-fallback check.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/** desktop/fonts, or its unpacked copy inside a packaged app (FFmpeg cannot read app.asar). */
export function bundledFontsDir() {
  if (process.env.KIMO_CAPTION_FONTS && existsSync(process.env.KIMO_CAPTION_FONTS)) return process.env.KIMO_CAPTION_FONTS;
  const here = fileURLToPath(new URL('./fonts', import.meta.url));
  const unpacked = here.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  return existsSync(unpacked) ? unpacked : here;
}

/** The bundled faces: file → family name libass matches (full name, Bold 0). */
export const BUNDLED_FONTS = Object.freeze({
  'Montserrat-ExtraBold.ttf': 'Montserrat ExtraBold',
  'Montserrat-Black.ttf': 'Montserrat Black',
  'Geist-Black.ttf': 'Geist Black',
  'Geist-Bold.ttf': 'Geist Bold',
  'Geist-SemiBold.ttf': 'Geist SemiBold',
  'Bangers-Regular.ttf': 'Bangers',
  'NotoSansDevanagari-Bold.ttf': 'Noto Sans Devanagari Bold',
  'NotoSansDevanagari-Black.ttf': 'Noto Sans Devanagari Black',
});
/** PostScript names libass reports when it picks a bundled face. */
export const BUNDLED_POSTSCRIPT = Object.freeze(Object.keys(BUNDLED_FONTS).map((f) => f.replace(/\.ttf$/, '')));

/**
 * A path as an FFmpeg filter option value inside a filtergraph (script or -vf).
 * Two parsers unescape it: the graph parser (quotes) and the option parser
 * (backslash before : \ '). Windows drive letters need the \: or the filter
 * reads "C" as the value and "/Users/..." as the next option.
 */
export function filterPath(path) {
  const value = String(path).replaceAll('\\', '/').replace(/[\\:']/g, (c) => `\\${c}`);
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// ---------------------------------------------------------------- TrueType metrics
const cache = new Map();

function tables(buf) {
  const n = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    out[buf.toString('latin1', o, o + 4)] = { offset: buf.readUInt32BE(o + 8), length: buf.readUInt32BE(o + 12) };
  }
  return out;
}

function readCmap(buf, t) {
  const base = t.offset;
  const count = buf.readUInt16BE(base + 2);
  let best = null;
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt16BE(base + 4 + i * 8);
    const e = buf.readUInt16BE(base + 6 + i * 8);
    const off = base + buf.readUInt32BE(base + 8 + i * 8);
    const format = buf.readUInt16BE(off);
    const score = format === 12 ? 3 : format === 4 && (p === 3 || p === 0) ? 2 : format === 4 ? 1 : 0;
    if (score && (!best || score > best.score)) best = { off, format, score, e };
  }
  const map = new Map();
  if (!best) return map;
  const o = best.off;
  if (best.format === 4) {
    const segs = buf.readUInt16BE(o + 6) / 2;
    const ends = o + 14;
    const starts = ends + segs * 2 + 2;
    const deltas = starts + segs * 2;
    const ranges = deltas + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = buf.readUInt16BE(ends + s * 2);
      const start = buf.readUInt16BE(starts + s * 2);
      const delta = buf.readInt16BE(deltas + s * 2);
      const range = buf.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (!range) g = (c + delta) & 0xffff;
        else {
          const at = ranges + s * 2 + range + (c - start) * 2;
          g = buf.readUInt16BE(at);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  } else {
    const groups = buf.readUInt32BE(o + 12);
    for (let i = 0; i < groups; i++) {
      const start = buf.readUInt32BE(o + 16 + i * 12);
      const end = buf.readUInt32BE(o + 20 + i * 12);
      const g0 = buf.readUInt32BE(o + 24 + i * 12);
      for (let c = start; c <= end && c - start < 70000; c++) map.set(c, g0 + c - start);
    }
  }
  return map;
}

/** Advance widths and vertical metrics of a TrueType/OpenType font file. */
export function fontMetrics(file) {
  if (cache.has(file)) return cache.get(file);
  const buf = readFileSync(file);
  const t = tables(buf);
  const unitsPerEm = buf.readUInt16BE(t.head.offset + 18);
  const hhea = t.hhea.offset;
  const ascent = buf.readInt16BE(hhea + 4);
  const descent = buf.readInt16BE(hhea + 6);
  const nH = buf.readUInt16BE(hhea + 34);
  let winAscent = ascent;
  let winDescent = -descent;
  if (t['OS/2']) {
    winAscent = buf.readUInt16BE(t['OS/2'].offset + 74);
    winDescent = buf.readUInt16BE(t['OS/2'].offset + 76);
  }
  const advances = new Uint16Array(nH);
  for (let i = 0; i < nH; i++) advances[i] = buf.readUInt16BE(t.hmtx.offset + i * 4);
  const cmap = readCmap(buf, t.cmap);
  const m = { file, unitsPerEm, ascent, descent, winAscent, winDescent, advances, cmap };
  cache.set(file, m);
  return m;
}

/**
 * Width in pixels of text at ASS font size `size` (libass scales a face so its
 * Windows ascent+descent spans the font size). Unknown glyphs count as 0.6 em.
 */
export function textWidth(metrics, text, size, { spacing = 0, scaleX = 1 } = {}) {
  const m = metrics;
  const px = size / Math.max(1, m.winAscent + m.winDescent);
  let units = 0;
  let n = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp === 0x2060 || cp === 0x200b || cp === 0x200c || cp === 0x200d) continue;
    const g = m.cmap.get(cp);
    units += g != null ? m.advances[Math.min(g, m.advances.length - 1)] : m.unitsPerEm * 0.6;
    n++;
  }
  return (units * px + spacing * Math.max(0, n - 1)) * scaleX;
}
/** Cap-height-ish box of a line at a font size: [ascent px, descent px] (libass line box). */
export function lineBox(metrics, size) {
  const px = size / Math.max(1, metrics.winAscent + metrics.winDescent);
  return [metrics.winAscent * px, metrics.winDescent * px];
}
/** Metrics for a bundled face by file name, or null when the file is missing. */
export function bundledMetrics(file, dir = bundledFontsDir()) {
  const p = join(dir, file);
  return existsSync(p) ? fontMetrics(p) : null;
}
/** True when every code point of text has a glyph in the face. */
export function covers(metrics, text) {
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x21 || cp === 0x2060) continue;
    if (!metrics.cmap.has(cp)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- fallback check
/**
 * Renders an ASS script (low frame rate) with libass verbose logging and reports
 * which faces it selected. fallback = a face outside the bundled set, or a
 * glyph libass had to look for in another font.
 */
export function checkFonts({ ffmpeg = 'ffmpeg', ass, fontsDir = bundledFontsDir(), size = '320x180', duration = 10, fps = 4, cwd, signal }) {
  // every frame at a low rate across the script, so each face in use is selected (and logged) at least once
  const args = ['-hide_banner', '-nostdin', '-v', 'verbose', '-f', 'lavfi', '-i', `color=c=gray:s=${size}:r=${fps}:d=${Math.max(0.5, duration)}`, '-vf', `ass=filename=${filterPath(ass)}:fontsdir=${filterPath(fontsDir)}:shaping=complex`, '-f', 'null', '-'];
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, args, { cwd, windowsHide: true, signal });
    let log = '';
    child.stderr.on('data', (d) => {
      log += d;
      if (log.length > 4e6) log = log.slice(-2e6);
    });
    child.on('error', (error) => resolve({ ok: false, error: error.message, selected: [], fallback: true }));
    child.on('close', (code) => {
      const selected = [...log.matchAll(/fontselect: \((.*?), (\d+), (\d+)\) -> ([^,\r\n]*), (\d+), ([^\r\n]*)/g)].map((m) => ({ family: m[1], weight: +m[2], file: m[4].trim(), postscript: m[6].trim() }));
      const missing = [...log.matchAll(/Glyph 0x([0-9A-F]+) not found/gi)].map((m) => m[1]);
      const foreign = selected.filter((s) => !BUNDLED_POSTSCRIPT.includes(s.postscript) && !BUNDLED_POSTSCRIPT.some((p) => s.file.includes(p)));
      const failed = /Error (parsing|initializing|opening)|No such filter|Invalid argument/i.test(log) && code !== 0;
      resolve({ ok: code === 0 && !failed && !foreign.length && !missing.length && selected.length > 0, code, selected, foreign, missing, fallback: Boolean(foreign.length || missing.length), log: code ? log.slice(-1200) : undefined });
    });
  });
}

/** Font files in a directory that libass would load (ttf/otf only). */
export function fontFiles(dir = bundledFontsDir()) {
  try {
    return readdirSync(dir).filter((n) => /\.(ttf|otf)$/i.test(n));
  } catch {
    return [];
  }
}
