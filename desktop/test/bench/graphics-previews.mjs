// Preview contact sheets of the motion-graphics kit: every element of a theme
// at its hold frame over a synthetic scene (gradient + talking-head
// silhouette), at 9:16 and 16:9. Writes graphics/previews/<theme>-<aspect>.png.
// Usage: node test/bench/graphics-previews.mjs [--themes kimo,energetic] [--playwright]
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENT_KINDS } from '../../graphics/elements/index.mjs';
import { graphicJob, themeFor, themes, frameBuffer, setGraphicsHost } from '../../graphics/renderer.mjs';
import { createSoftCanvas } from '../../graphics/raster.mjs';
import { FontBook } from '../../graphics/glyphs.mjs';
import { toolPaths } from './run.mjs';

const OUT = fileURLToPath(new URL('../../graphics/previews/', import.meta.url));
const args = process.argv.slice(2);
const pick = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const THEMES = pick('--themes', Object.keys(themes()).join(',')).split(',');
const SAMPLE = (c) => ({
  hook_title: { text: 'I tried every AI video editor' },
  lower_third: { name: 'Naman Sharma', role: 'Founder, kimo' },
  stat: { value: '50%', label: 'less editing', face: { x0: c.w * 0.36, x1: c.w * 0.64, y0: c.h * 0.3, y1: c.h * 0.52 } },
  callout: { kind: 'circle', target: { x: c.w * 0.58, y: c.h * 0.62, w: c.w * 0.18, h: c.h * 0.06 }, label: 'Export' },
  screen_zoom: {},
  progress: {},
  chapter: { title: 'Why the old way breaks', index: 2 },
  sticker: { emoji: 'rocket' },
  cta: { text: 'Subscribe', line: 'new tutorials every week' },
});
const HOLD = { hook_title: 1.2, lower_third: 1.4, stat: 1.0, callout: 1.0, screen_zoom: 1.0, progress: 1.4, chapter: 1.0, sticker: 0.7, cta: 2.2 };

function scene(c, book) {
  const cv = createSoftCanvas(c.w, c.h, book);
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, c.w, c.h);
  g.addColorStop(0, '#3b4f66');
  g.addColorStop(1, '#16202b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.w, c.h);
  ctx.fillStyle = '#2a2420';
  ctx.beginPath();
  ctx.ellipse(c.w / 2, c.h * 0.41, c.w * 0.11, c.h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.w / 2, c.h * 0.8, c.w * 0.3, c.h * 0.26, 0, 0, Math.PI * 2);
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

export async function previews({ themesList = THEMES, ffmpeg = toolPaths().ffmpeg } = {}) {
  mkdirSync(OUT, { recursive: true });
  const book = new FontBook();
  const written = [];
  for (const th of themesList) {
    const theme = themeFor(th);
    for (const [name, c] of Object.entries({ '9x16': { w: 540, h: 960 }, '16x9': { w: 960, h: 540 } })) {
      const base = scene(c, book);
      const tiles = [];
      for (const kind of ELEMENT_KINDS.filter((k) => k !== 'text_behind')) {
        const job = graphicJob({ kind, props: SAMPLE(c)[kind], canvas: c, fps: 30, dur: kind === 'cta' ? 5 : 2.4, theme });
        if (!job) continue;
        const rgba = await frameBuffer(job, Math.round(HOLD[kind] * 30));
        tiles.push({ kind, raw: kind === 'screen_zoom' ? base : over(base, c, job, rgba) });
      }
      const file = join(OUT, `${th}-${name}.png`);
      const cols = name === '9x16' ? 5 : 3;
      const rows = Math.ceil(tiles.length / cols);
      // one raw stream of all tiles, tiled by FFmpeg
      const stream = Buffer.concat(tiles.map((t) => t.raw));
      const scale = name === '9x16' ? 270 : 480;
      const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${c.w}x${c.h}`, '-i', 'pipe:0', '-vf', `scale=${scale}:-2:flags=lanczos,tile=${cols}x${rows}:padding=4:color=0x111111`, '-frames:v', '1', file], { input: stream, maxBuffer: 1 << 26 });
      if (r.status) throw new Error(String(r.stderr));
      written.push(file);
    }
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
    for (const f of await previews()) console.log(f);
  } finally {
    await host?.close();
  }
}
