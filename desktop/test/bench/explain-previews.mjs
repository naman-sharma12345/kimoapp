// Preview contact sheets of the Phase 7 explainer families: every family at a
// mid-beat frame (items already revealed) over a synthetic talking-head
// scene, per aspect. Writes explain/previews/<aspect>.png (not shipped).
// Usage: node test/bench/explain-previews.mjs [--aspects 16x9,9x16] [--playwright]
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { graphicJob, themeFor, frameBuffer, setGraphicsHost } from '../../graphics/renderer.mjs';
import { createSoftCanvas } from '../../graphics/raster.mjs';
import { FontBook } from '../../graphics/glyphs.mjs';
import { panelRect, pipRect } from '../../explain/panel.mjs';
import { findIcon, findBrand } from '../../explain/icons.mjs';
import { mapProps } from '../../explain/geo.mjs';
import { toolPaths } from './run.mjs';

const OUT = fileURLToPath(new URL('../../explain/previews/', import.meta.url));
const args = process.argv.slice(2);
const pick = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ASPECTS = { '16x9': { w: 960, h: 540 }, '9x16': { w: 540, h: 960 }, '1x1': { w: 720, h: 720 }, '4x5': { w: 720, h: 900 } };

/** A test picture for the image card (FFmpeg test pattern → RGBA PNG). */
export function testPicture(ffmpeg = toolPaths().ffmpeg) {
  const file = join(tmpdir(), 'kimo-explain-test-picture.png');
  spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x400:d=1', '-frames:v', '1', '-pix_fmt', 'rgba', file]);
  return file;
}

/** Sample props for every family (times in seconds from the visual's start). */
export function samples(c, picture) {
  const face = { x0: c.w * 0.4, x1: c.w * 0.6, y0: c.h * 0.28, y1: c.h * 0.5 };
  const mode = c.h > c.w ? 'top' : 'side';
  const P = panelRect(c, mode, { face });
  const O = panelRect(c, 'overlay', { face });
  const F = panelRect(c, 'full');
  const icon = findIcon('rocket launch');
  const brand = findBrand('github');
  return [
    ['ex_list', { mode, panel: P, title: '3 reasons it failed', items: [{ text: 'No users', t: 0.2 }, { text: 'Too slow', t: 0.6 }, { text: 'Ran out of money', t: 1.0 }] }, 1.3],
    ['ex_stat', { mode: 'overlay', panel: O, value: 40, unit: '%', label: 'of startups fail here', items: [{ t: 0.6 }] }, 1.4],
    ['ex_stat', { mode: 'overlay', panel: O, value: 250000, prefix: '₹', locale: 'en-IN', label: 'per month', items: [{ t: 0.6 }] }, 1.4],
    ['ex_chart', { mode: 'full', panel: F, title: 'Views per video', chart: 'bar', items: [{ label: 'Before', value: 10000, t: 0.2 }, { label: 'After', value: 1000000, t: 0.7 }] }, 1.6],
    ['ex_chart', { mode, panel: P, title: 'Subscribers', chart: 'line', trend: true, items: [{ label: '2022', value: 1, t: 0.2 }, { label: '2023', value: 8, t: 0.5 }, { label: '2024', value: 40, t: 0.8 }, { label: '2025', value: 120, t: 1.1 }] }, 1.8],
    ['ex_compare', { mode, panel: P, left: { title: 'Before', points: [{ text: '4 hrs edit', t: 0.2 }] }, right: { title: 'After', points: [{ text: '10 min', t: 0.6 }] }, winner: 'right', winner_t: 0.9 }, 1.5],
    ['ex_flow', { mode, panel: P, items: [{ text: 'Record', t: 0.2 }, { text: 'kimo edits', t: 0.6 }, { text: 'Post', t: 1.0 }], cycle: true, cycle_t: 1.3 }, 1.9],
    ['ex_timeline', { mode, panel: P, items: [{ when: '2019', text: 'first video', t: 0.2 }, { when: '2021', text: '100k subs', t: 0.6 }, { when: '2024', text: 'quit job', t: 1.0 }] }, 1.5],
    ['ex_definition', { mode, panel: P, term: 'Compound interest', pos: 'noun', definition: 'interest you earn on your interest, again and again', items: [{ t: 0.3 }] }, 1.4],
    ['ex_map', { mode: 'full', panel: F, map: mapProps([{ name: 'Delhi', t: 0.4 }, { name: 'Bengaluru', t: 1.0 }], { route: true }) }, 2.2],
    ['ex_icon', { mode: 'overlay', panel: O, label: 'Launch', icon: { d: icon?.d, kind: 'line' }, items: [{ t: 0.1 }] }, 1.0],
    ['ex_icon', { mode: 'overlay', panel: O, label: 'GitHub', icon: { d: brand?.d, kind: 'brand', hex: brand?.hex }, items: [{ t: 0.1 }] }, 1.0],
    ['ex_name_card', { name: 'Naman Sharma', descriptor: 'founder, kimo' }, 1.2],
    ['ex_code', { mode, panel: P, lang: 'bash', items: [{ text: 'npm install kimo', t: 0.1 }, { text: 'npx kimo edit talk.mp4', t: 0.7 }] }, 1.6],
    ['ex_ui_callout', { style: 'circle', target: { x: c.w * 0.62, y: c.h * 0.2, w: c.w * 0.14, h: c.h * 0.06 }, label: 'Settings', items: [{ t: 0.1 }] }, 1.0],
    ['ex_quote', { mode, panel: P, author: 'Naval', words: 'Play long term games with long term people'.split(' ').map((w, i) => ({ w, t: 0.2 + i * 0.25 })) }, 1.3],
    ['ex_metaphor', { mode, panel: P, keyword: 'compounding', metaphor: 'grow-curve', items: [{ t: 0.2 }] }, 1.6],
    ['ex_metaphor', { mode, panel: P, keyword: 'focus', metaphor: 'spotlight', items: [{ t: 0.2 }] }, 1.6],
    ['ex_question', { mode, panel: P, question: 'But why does this happen?' }, 1.0],
    ['ex_image', { mode, panel: P, caption: 'Taj Mahal at sunrise', credit: 'Photo: Jane Doe, CC BY 2.0 (Openverse)', assets: [{ key: 'pic', path: picture, url: pathToFileURL(picture).href }] }, 1.2],
    ['ex_meme', { mode, panel: P, format: 'expectation_reality', top: 'one quick edit', bottom: 'six hours later', items: [{ t: 0.1 }, { t: 0.5 }], assets: [{ key: 'star', emoji: 'star' }, { key: 'x', emoji: 'x' }] }, 1.2],
    ['ex_post', { mode, panel: P, name: 'Naman', handle: '@ven_ai_lab', date: 'Oct 2026', text: 'shipped the explainer engine today. the screen now shows what you say.' }, 1.0],
    ['ex_pip', { rect: pipRect(c) }, 1.0],
  ];
}

function scene(c, book) {
  const cv = createSoftCanvas(c.w, c.h, book);
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, c.w, c.h);
  g.addColorStop(0, '#5a6b7c');
  g.addColorStop(1, '#2a3440');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.w, c.h);
  ctx.fillStyle = '#c9a98c';
  ctx.beginPath();
  ctx.ellipse(c.w / 2, c.h * 0.39, c.w * 0.08, c.h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20262c';
  ctx.beginPath();
  ctx.ellipse(c.w / 2, c.h * 0.82, c.w * 0.26, c.h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  return Buffer.from(ctx.getImageData().data.buffer);
}
function over(base, c, job, rgba) {
  const out = Buffer.from(base);
  for (let y = 0; y < job.box.h; y++)
    for (let x = 0; x < job.box.w; x++) {
      const s = (y * job.box.w + x) * 4;
      const a = rgba[s + 3] / 255;
      if (!a) continue;
      const d = ((y + job.box.y) * c.w + x + job.box.x) * 4;
      for (let k = 0; k < 3; k++) out[d + k] = Math.round(rgba[s + k] * a + out[d + k] * (1 - a));
    }
  return out;
}

export async function explainPreviews({ aspects = pick('--aspects', '16x9,9x16').split(','), ffmpeg = toolPaths().ffmpeg, theme = 'kimo' } = {}) {
  mkdirSync(OUT, { recursive: true });
  const book = new FontBook();
  const picture = testPicture(ffmpeg);
  const written = [];
  for (const name of aspects) {
    const c = ASPECTS[name];
    const base = scene(c, book);
    const tiles = [];
    for (const [kind, props, at] of samples(c, picture)) {
      const job = graphicJob({ kind, props, canvas: c, fps: 30, dur: 3, theme: themeFor(theme) });
      if (!job) continue;
      const rgba = await frameBuffer(job, Math.round(at * 30));
      tiles.push(over(base, c, job, rgba));
    }
    const file = join(OUT, `${theme}-${name}.png`);
    const cols = c.h > c.w ? 6 : 4;
    const rows = Math.ceil(tiles.length / cols);
    const scale = c.h > c.w ? 270 : 480;
    const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${c.w}x${c.h}`, '-i', 'pipe:0', '-vf', `scale=${scale}:-2:flags=lanczos,tile=${cols}x${rows}:padding=4:color=0x111111`, '-frames:v', '1', file], { input: Buffer.concat(tiles), maxBuffer: 1 << 28 });
    if (r.status) throw new Error(String(r.stderr));
    written.push(file);
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let host = null;
  if (args.includes('--playwright')) {
    const { playwrightHost } = await import('./graphics-playwright.mjs');
    host = await playwrightHost({ args: (process.env.KIMO_CHROMIUM_ARGS ?? '').split(' ').filter(Boolean) });
    setGraphicsHost(host);
  }
  try {
    for (const f of await explainPreviews()) console.log(f);
  } finally {
    await host?.close();
  }
  void writeFileSync;
}
