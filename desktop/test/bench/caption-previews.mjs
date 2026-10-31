// Caption style previews: one still per style (and a contact sheet) rendered
// through the real caption model + ASS renderer + bundled fonts with the
// bundled/system FFmpeg. Synthetic background and subject silhouette (no
// footage, no network). Writes desktop/data/caption-styles/previews/<id>.png
// (committed) and bench/out/caption-styles/contact.png.
//   node test/bench/caption-previews.mjs [--out dir] [--check-fonts]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AssDocument, tag, drawing } from '../../ass.mjs';
import { captionStyles, captionOverlays } from '../../captions.mjs';
import { drawCaptions } from '../../caption-render.mjs';
import { bundledFontsDir, filterPath, checkFonts } from '../../fonts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ffmpeg = process.env.KIMO_FFMPEG || 'ffmpeg';
const argOut = process.argv.indexOf('--out');
const previews = argOut > 0 ? process.argv[argOut + 1] : join(here, '..', '..', 'data', 'caption-styles', 'previews');
const work = join(here, 'out', 'caption-styles');
mkdirSync(previews, { recursive: true });
mkdirSync(work, { recursive: true });

const SCRIPT = {
  en: 'This one trick made three million views. And honestly, nobody talks about it!',
  hi: 'यह ट्रिक सच में काम करती है',
  title: 'Nobody talks about this',
};
/** Synthetic word timings (~3.3 words/s, a pause after punctuation). */
export function sampleWords(text, t0 = 0.2) {
  let t = t0;
  return text.split(/\s+/).map((w) => {
    const d = 0.18 + Math.min(0.22, w.length * 0.025);
    const r = { w, start: +t.toFixed(3), end: +(t + d).toFixed(3) };
    t += d + (/[.,!?]$/.test(w) ? 0.28 : 0.06);
    return r;
  });
}

function canvasFor(style) {
  return style.id === 'mkbhd' || style.id === 'doc-subtitle' ? { w: 1920, h: 1080, fps: 30 } : { w: 1080, h: 1920, fps: 30 };
}
function faceFor(canvas) {
  // a centred talking head: top 18 %, chin 46 % of the frame height on shorts; 16:9 head a bit smaller
  const v = canvas.h > canvas.w;
  const top = canvas.h * (v ? 0.2 : 0.18);
  const chin = canvas.h * (v ? 0.46 : 0.6);
  const hw = (chin - top) * 0.8;
  return { x0: canvas.w / 2 - hw / 2, x1: canvas.w / 2 + hw / 2, y0: top, y1: chin, mouthY0: chin - (chin - top) * 0.36 };
}

/** Renders one style; returns {png, stats, ass}. */
export function renderPreview(style, { dir = work, at } = {}) {
  const canvas = canvasFor(style);
  const face = faceFor(canvas);
  const words = [...sampleWords(SCRIPT.en), ...sampleWords(SCRIPT.hi, 6.2)];
  const built = captionOverlays(words, { style: style.id, canvas, fps: canvas.fps, total: 9, emphasis: [{ word: 'trick' }], faceAt: () => face });
  const edl = { canvas, overlays: built.overlays, captions: style.kind === 'title' ? { hook_style: style.id } : null };
  const doc = new AssDocument({ w: canvas.w, h: canvas.h, title: `preview ${style.id}` });
  doc.style({ name: 'bg', font: 'Geist Bold', size: 40, primary: '#3B4652', outline: '#000000', outlineWidth: 0, shadow: 0, align: 7 });
  // subject silhouette: shoulders + head, so face-aware placement is visible
  const hw = face.x1 - face.x0;
  const hh = face.y1 - face.y0;
  doc.event({ layer: 0, start: 0, end: 9, style: 'bg', parts: [{ tags: [tag.an(7), tag.pos(face.x0, face.y0), tag.c('#C9A58C'), tag.bord(0), tag.shad(0)] }, { draw: drawing([['m', hw / 2, 0], ['b', hw * 1.05, 0, hw, hh * 0.75, hw / 2, hh], ['b', 0, hh * 0.75, -hw * 0.05, 0, hw / 2, 0]]) }] });
  doc.event({ layer: 0, start: 0, end: 9, style: 'bg', parts: [{ tags: [tag.an(7), tag.pos(face.x0 - hw * 0.9, face.y1 + hh * 0.08), tag.c('#2E5E8C'), tag.bord(0), tag.shad(0)] }, { draw: drawing([['m', hw * 0.6, 0], ['l', hw * 2.2, 0], ['b', hw * 2.6, 0, hw * 2.8, hh * 0.6, hw * 2.8, hh * 2], ['l', 0, hh * 2], ['b', 0, hh * 0.6, hw * 0.2, 0, hw * 0.6, 0]]) }] });
  if (style.kind === 'title') edl.overlays.unshift({ id: 'hook', kind: 'hook_title', at: 0, dur: 2.6, props: { text: SCRIPT.title, x: 0.5, y: canvas.h > canvas.w ? 0.17 : 0.2, size: 80 } });
  drawCaptions(doc, edl, canvas.fps);
  const ass = join(dir, `${style.id}.ass`);
  writeFileSync(ass, doc.toString());
  const caps = built.overlays.filter((o) => !o.props.hidden);
  // a moment mid-chunk where a word is active (titles: mid-sweep / just landed)
  const pickAt = at ?? (style.kind === 'title' ? 0.45 : (() => {
    const c = caps.find((o) => o.props.words.length >= 2) ?? caps[0];
    return c ? Math.min(c.at + c.dur - 0.05, (c.props.words[1]?.at ?? c.at) + 0.16) : 1;
  })());
  const png = join(previews, `${style.id}.png`);
  const scaleW = canvas.w > canvas.h ? 960 : 540;
  const vf = `ass=filename=${filterPath(ass)}:fontsdir=${filterPath(bundledFontsDir())}:shaping=complex,scale=${scaleW}:-2:flags=lanczos`;
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `gradients=s=${canvas.w}x${canvas.h}:c0=0x1d2733:c1=0x6f7f8f:x0=0:y0=0:x1=${canvas.w}:y1=${canvas.h}:d=9:r=${canvas.fps}`, '-ss', String(pickAt), '-vf', vf, '-frames:v', '1', '-update', '1', png], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`preview ${style.id}: ${r.stderr}`);
  return { png, ass, at: pickAt, stats: built.stats, canvas };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = [];
  for (const style of captionStyles().values()) {
    const r = renderPreview(style);
    let fonts = null;
    if (process.argv.includes('--check-fonts')) fonts = await checkFonts({ ffmpeg, ass: r.ass, size: `${r.canvas.w / 4}x${r.canvas.h / 4}`, duration: 9 });
    results.push({ id: style.id, png: r.png, at: r.at, stats: r.stats, fonts: fonts && { ok: fonts.ok, selected: [...new Set(fonts.selected.map((s) => s.postscript))], foreign: fonts.foreign, missing: fonts.missing } });
    console.log(style.id, JSON.stringify(results.at(-1).stats), fonts ? `fonts ${fonts.ok ? 'ok' : 'FALLBACK'} ${[...new Set(fonts.selected.map((s) => s.postscript))].join(' ')}` : '');
  }
  // contact sheet (shorts row + wide row), for review only
  const shorts = results.filter((r) => !/mkbhd|doc-subtitle/.test(r.id)).map((r) => r.png);
  const sheet = join(work, 'contact.png');
  const inputs = shorts.flatMap((p) => ['-i', p]);
  const cols = Math.min(5, shorts.length);
  const layout = shorts.map((_, i) => `${(i % cols) * 540}_${Math.floor(i / cols) * 960}`).join('|');
  const s = spawnSync(ffmpeg, ['-v', 'error', '-y', ...inputs, '-filter_complex', `${shorts.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${shorts.length}:layout=${layout}:fill=black,scale=iw/2:-2`, '-frames:v', '1', '-update', '1', sheet], { encoding: 'utf8' });
  if (s.status !== 0) console.error('contact sheet failed', s.stderr);
  writeFileSync(join(work, 'previews.json'), JSON.stringify(results, null, 1));
  if (process.argv.includes('--check-fonts') && results.some((r) => !r.fonts?.ok)) {
    console.error('font fallback in', results.filter((r) => !r.fonts?.ok).map((r) => r.id).join(', '));
    process.exitCode = 1;
  }
  if (!existsSync(sheet)) process.exitCode = process.exitCode || 0;
}
