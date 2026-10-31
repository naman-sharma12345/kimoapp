// The graphics render page (Chromium): loads the bundled fonts and emoji,
// then renders jobs frame by frame at exact times through the same element
// modules the soft canvas uses. Driven by the app's hidden offscreen
// BrowserWindow (main.cjs) or by Playwright Chromium (bench / CI path).
import { drawFrame } from './core.mjs';
import { FONT_FACES } from './kit.mjs';

const state = { ready: null, emojiBase: './emoji', images: new Map() };

async function init({ fontsBase, emojiBase } = {}) {
  state.emojiBase = emojiBase ?? state.emojiBase;
  const base = fontsBase ?? '../fonts';
  state.ready = Promise.all(
    FONT_FACES.map(async (f) => {
      const face = new FontFace(f.family, `url("${base}/${f.file}")`, { weight: String(f.weight), style: f.style });
      try {
        await face.load();
        document.fonts.add(face);
        return f.file;
      } catch {
        return null;
      }
    }),
  );
  const loaded = (await state.ready).filter(Boolean);
  return { fonts: loaded.length, of: FONT_FACES.length };
}

async function image(name) {
  if (!state.images.has(name))
    state.images.set(
      name,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`emoji ${name} failed to load`));
        img.src = `${state.emojiBase}/${name}.png`;
      }),
    );
  return state.images.get(name);
}

async function asset(url) {
  if (!state.images.has(url))
    state.images.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`asset ${url} failed to load`));
        img.src = url;
      }),
    );
  return state.images.get(url);
}

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Renders frames of a job; returns RGBA per frame (raw typed arrays or base64 strings). */
async function render(job, frames, encoding = 'base64') {
  if (!state.ready) await init();
  await state.ready;
  const canvas = document.createElement('canvas');
  canvas.width = job.box.w;
  canvas.height = job.box.h;
  // willReadFrequently keeps the canvas on the CPU rasteriser: deterministic and fast to read back
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const images = job.kind === 'sticker' && job.props?.emoji ? { [job.props.emoji]: await image(job.props.emoji) } : {};
  // Phase 7 explainer assets ({key, url} file URLs of prepared PNGs, or bundled emoji by name)
  for (const a of Array.isArray(job.props?.assets) ? job.props.assets : []) {
    try {
      images[a.key] = a.emoji ? await image(a.emoji) : await asset(a.url);
    } catch {
      /* missing asset: the family draws its placeholder */
    }
  }
  const layer = () => {
    const c = document.createElement('canvas');
    c.width = job.box.w;
    c.height = job.box.h;
    return c;
  };
  const out = [];
  for (const f of frames) {
    drawFrame(ctx, job, f, { layer, images });
    const data = ctx.getImageData(0, 0, job.box.w, job.box.h).data;
    out.push(encoding === 'raw' ? new Uint8Array(data.buffer.slice(0)) : base64(new Uint8Array(data.buffer)));
  }
  return out;
}

window.kimoGraphics = { init, render, ready: true };
