// Node side of the graphics engine: themes, layout (with the bundled fonts'
// metrics), and rendering an element to a transparent video the compositor
// overlays. Backends, best first:
//   host  - the app's hidden offscreen Electron BrowserWindow (graphics/render.html),
//           registered by main.cjs with setGraphicsHost(); Chromium canvas.
//   soft  - the pure-JS canvas (raster.mjs) in this process: unit tests, the
//           headless bench, and the fallback when no offscreen window exists.
// The bench can register a Playwright Chromium page as the host (same page).
// Frames are drawn at exact times n/fps and piped as raw RGBA into FFmpeg
// (qtrle, alpha kept), cached by content hash.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontMetrics, bundledFontsDir } from '../fonts.mjs';
import { ELEMENTS } from './elements/index.mjs';
import { STICKERS } from './elements/sticker.mjs';
import { FONT_FACES, pixelBox } from './kit.mjs';
import { drawFrame, fontKey, GRAPHICS_VERSION } from './core.mjs';
import { createSoftCanvas } from './raster.mjs';
import { FontBook } from './glyphs.mjs';
import { decodePng } from './png.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
/** The graphics directory (unpacked copy inside a packaged app, like the fonts). */
export function graphicsDir() {
  const unpacked = HERE.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  return existsSync(unpacked) ? unpacked : HERE;
}
export const emojiDir = () => join(graphicsDir(), 'emoji');

// ---------------------------------------------------------------- themes
let THEMES = null;
export function themes() {
  THEMES ??= JSON.parse(readFileSync(fileURLToPath(new URL('../data/graphics-themes.json', import.meta.url)), 'utf8'));
  return THEMES;
}
/** Theme for a template id (auto → kimo); the caption accent can override the accent colour. */
export function themeFor(template, { accent } = {}) {
  const all = themes();
  const base = all[template] ?? all.kimo;
  const t = structuredClone(base);
  t.id = all[template] ? template : 'kimo';
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) t.colors.accent = accent;
  return t;
}

// ---------------------------------------------------------------- metrics
const faceFile = (f) => {
  const fam = FONT_FACES.filter((x) => x.family.toLowerCase() === String(f.family).toLowerCase());
  if (!fam.length) return null;
  const style = f.style ?? 'normal';
  return [...fam].sort((a, b) => (a.style === style ? 0 : 1000) + Math.abs(a.weight - (f.weight ?? 400)) - ((b.style === style ? 0 : 1000) + Math.abs(b.weight - (f.weight ?? 400))))[0].file;
};
const metricCache = new Map();
/** {capHeight, ascent, descent} as fractions of the em for a font spec. */
export function fontRatios(f, dir = bundledFontsDir()) {
  const key = fontKey(f);
  if (metricCache.has(key)) return metricCache.get(key);
  const file = faceFile(f);
  let out = { capHeight: 0.7, ascent: 0.92, descent: -0.24 };
  if (file && existsSync(join(dir, file))) {
    const m = fontMetrics(join(dir, file));
    const buf = readFileSync(join(dir, file));
    // OS/2 sCapHeight (version ≥ 2)
    const n = buf.readUInt16BE(4);
    let cap = m.ascent * 0.7;
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      if (buf.toString('latin1', o, o + 4) === 'OS/2') {
        const off = buf.readUInt32BE(o + 8);
        if (buf.readUInt16BE(off) >= 2) cap = buf.readInt16BE(off + 88);
      }
    }
    out = { capHeight: cap / m.unitsPerEm, ascent: m.ascent / m.unitsPerEm, descent: m.descent / m.unitsPerEm };
  }
  metricCache.set(key, out);
  return out;
}
/** Advance width in px (no kerning; Chromium kerns slightly tighter, the layouts leave room). */
export function measureText(text, f, size, spacing = 0, dir = bundledFontsDir()) {
  const file = faceFile(f);
  const n = [...String(text)].length;
  if (!file || !existsSync(join(dir, file))) return n * size * 0.6 + spacing * n;
  const m = fontMetrics(join(dir, file));
  let units = 0;
  for (const ch of String(text)) {
    const g = m.cmap.get(ch.codePointAt(0));
    units += g != null ? m.advances[Math.min(g, m.advances.length - 1)] : m.unitsPerEm * 0.6;
  }
  return (units * size) / m.unitsPerEm + spacing * n;
}
/** The layout env elements get in Node. */
export function layoutEnv(theme) {
  return { theme, measure: (text, f, size, spacing = 0) => measureText(text, f, size, spacing), metrics: (f) => fontRatios(f) };
}
const themeFonts = (theme) => Object.values(theme.fonts);

// ---------------------------------------------------------------- layout
/**
 * Layout of one graphic on a canvas: {layout, box (integer pixel box the frames
 * cover), safeBox} or null when the element refuses (e.g. CTA on shorts).
 */
export function layoutGraphic(kind, props, canvas, theme) {
  const el = ELEMENTS[kind];
  if (!el) throw new Error(`unknown graphic ${kind}`);
  const L = el.layout(canvas, { ...el.defaults, ...props }, layoutEnv(theme));
  if (!L) return null;
  return { layout: L, box: pixelBox(L.box, canvas), safeBox: L.safeBox, edge: Boolean(L.edge) };
}

/** Render job for one graphic (also what the Chromium page receives). */
export function graphicJob({ kind, props = {}, canvas, fps, dur, theme }) {
  const el = ELEMENTS[kind];
  const merged = { ...el.defaults, ...props };
  const laid = layoutGraphic(kind, merged, canvas, theme);
  if (!laid) return null;
  const metrics = Object.fromEntries(themeFonts(theme).map((f) => [fontKey(f), fontRatios(f)]));
  const rate = typeof fps === 'number' ? fps : Number(String(fps).split('/')[0]) / Number(String(fps).split('/')[1] ?? 1);
  return { v: GRAPHICS_VERSION, kind, props: merged, layout: laid.layout, theme, canvas: { w: canvas.w, h: canvas.h }, fps: rate, fpsText: String(fps), dur, box: laid.box, safeBox: laid.safeBox, metrics, frames: Math.max(1, Math.round(dur * rate)) };
}

// ---------------------------------------------------------------- backends
let HOST = null;
/** Registers a Chromium host ({render(job, frames) → Promise<Buffer[] RGBA>, name}). main.cjs and the Playwright bench do. */
export function setGraphicsHost(host) {
  HOST = host;
}
export const graphicsHost = () => HOST;

let BOOK = null;
const IMAGES = new Map();
function softImages(kind, props) {
  const out = {};
  if (kind === 'sticker' && STICKERS.includes(props.emoji)) {
    if (!IMAGES.has(props.emoji)) IMAGES.set(props.emoji, decodePng(join(emojiDir(), `${props.emoji}.png`)));
    out[props.emoji] = IMAGES.get(props.emoji);
  }
  // Phase 7 explainer assets: PNGs prepared by explain/assets.mjs ({key, path, url}); bundled emoji by name
  for (const a of Array.isArray(props.assets) ? props.assets : []) {
    const path = a.emoji && STICKERS.includes(a.emoji) ? join(emojiDir(), `${a.emoji}.png`) : a.path;
    if (!path || !existsSync(path)) continue;
    if (!IMAGES.has(path)) {
      if (IMAGES.size > 64) IMAGES.clear();
      IMAGES.set(path, decodePng(path));
    }
    out[a.key] = IMAGES.get(path);
  }
  return out;
}
/** Soft backend: renders frames in this process. */
export function softFrame(job, frame) {
  BOOK ??= new FontBook();
  const canvas = createSoftCanvas(job.box.w, job.box.h, BOOK);
  const ctx = canvas.getContext('2d');
  drawFrame(ctx, job, frame, { layer: () => createSoftCanvas(job.box.w, job.box.h, BOOK), images: softImages(job.kind, job.props) });
  return Buffer.from(ctx.getImageData(0, 0, job.box.w, job.box.h).data.buffer);
}
/** All frames of a job as RGBA buffers, in batches from the host or the soft canvas. */
export async function* jobFrames(job, { backend = 'auto', batch = 12, signal } = {}) {
  const host = backend === 'soft' ? null : HOST;
  if (backend === 'host' && !host) throw new Error('no graphics host registered');
  for (let n = 0; n < job.frames; n += batch) {
    if (signal?.aborted) throw new Error('cancelled');
    const list = Array.from({ length: Math.min(batch, job.frames - n) }, (_, i) => n + i);
    if (host) {
      const out = await host.render(job, list);
      for (const b of out) yield Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.byteLength ?? b.length);
    } else for (const f of list) yield softFrame(job, f);
  }
}
/** One frame of a job as an RGBA buffer. */
export async function frameBuffer(job, frame, backend = 'auto') {
  const host = backend === 'soft' ? null : HOST;
  if (!host) return softFrame(job, frame);
  const [b] = await host.render(job, [frame]);
  return Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.byteLength ?? b.length);
}
export const backendName = (backend = 'auto') => (backend !== 'soft' && HOST ? HOST.name ?? 'chromium' : 'soft');

// ---------------------------------------------------------------- video
/** Content hash of a job + backend (the cache key of its rendered video). */
export function jobKey(job, backend = 'auto') {
  return createHash('sha256').update(JSON.stringify({ ...job, backend: backendName(backend) })).digest('hex').slice(0, 24);
}

/**
 * Renders a graphic to a transparent QuickTime RLE video at the canvas rate
 * (cached by content hash). Returns {path, w, h, x, y, frames, duration, cached, backend}.
 */
export async function renderGraphicVideo({ job, ffmpeg = 'ffmpeg', dir, signal, backend = 'auto', onProgress }) {
  mkdirSync(dir, { recursive: true });
  const name = backendName(backend);
  const key = jobKey(job, backend);
  const out = join(dir, `g-${job.kind}-${key}.mov`);
  const meta = { path: out, w: job.box.w, h: job.box.h, x: job.box.x, y: job.box.y, frames: job.frames, duration: job.frames / job.fps, backend: name };
  if (existsSync(out) && statSync(out).size > 0) return { ...meta, cached: true };
  const tmp = `${out}.part.mov`;
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${job.box.w}x${job.box.h}`, '-framerate', job.fpsText ?? String(job.fps), '-i', 'pipe:0', '-c:v', 'qtrle', '-pix_fmt', 'argb', '-f', 'mov', tmp];
  const child = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let err = '';
  child.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`graphics encode failed (${code}): ${err.trim().slice(-400)}`))));
  });
  const kill = () => child.kill();
  signal?.addEventListener('abort', kill, { once: true });
  try {
    let n = 0;
    for await (const frame of jobFrames(job, { backend, signal })) {
      if (!child.stdin.write(frame)) await new Promise((r) => child.stdin.once('drain', r));
      onProgress?.(++n / job.frames);
    }
    child.stdin.end();
    await done;
    renameSync(tmp, out);
  } catch (error) {
    try {
      child.stdin.destroy();
      child.kill();
    } catch {
      /* gone */
    }
    rmSync(tmp, { force: true });
    throw error;
  } finally {
    signal?.removeEventListener('abort', kill);
  }
  return { ...meta, cached: false };
}

/** Writes one frame of a job as a PNG (previews and the gallery). */
export async function graphicFramePng({ job, frame, ffmpeg = 'ffmpeg', out, backend = 'auto', background = null }) {
  const rgba = await frameBuffer(job, frame, backend);
  const bg = background ? ['-f', 'lavfi', '-i', `color=c=${background}:s=${job.box.w}x${job.box.h}`] : [];
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${job.box.w}x${job.box.h}`, '-i', 'pipe:0', ...bg, ...(background ? ['-filter_complex', '[1:v][0:v]overlay=format=auto'] : []), '-frames:v', '1', out];
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => (code ? reject(new Error(err.slice(-400))) : resolve()));
    child.stdin.end(rgba);
  });
  return out;
}
