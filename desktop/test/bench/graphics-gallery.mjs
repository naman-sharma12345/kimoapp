// Gallery video of the motion-graphics kit: every element of a theme, one
// after another, over a synthetic moving background, rendered through the real
// compositor (EDL graphic overlays -> compose.mjs) at 9:16, 16:9, 1:1 and 4:5.
// text_behind is skipped (it needs a SAM matte, a paid call); cta is 16:9 only.
// Writes test/bench/out/graphics-gallery/<theme>-<aspect>.mp4 (gitignored).
// Usage: node test/bench/graphics-gallery.mjs [--theme kimo] [--aspects 9x16,16x9,1x1,4x5] [--playwright]
import { mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENT_KINDS } from '../../graphics/elements/index.mjs';
import { setGraphicsHost, backendName } from '../../graphics/renderer.mjs';
import { compose } from '../../compose.mjs';
import { toolPaths } from './run.mjs';

const OUT = fileURLToPath(new URL('./out/graphics-gallery/', import.meta.url));
const args = process.argv.slice(2);
const pick = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ASPECTS = { '9x16': { w: 540, h: 960 }, '16x9': { w: 960, h: 540 }, '1x1': { w: 720, h: 720 }, '4x5': { w: 576, h: 720 } };

const SAMPLE = (c) => ({
  hook_title: { text: 'I tried every AI video editor' },
  lower_third: { name: 'Naman Sharma', role: 'Founder, kimo' },
  stat: { value: '50%', label: 'less editing' },
  callout: { kind: 'circle', target: { x: c.w * 0.58, y: c.h * 0.62, w: c.w * 0.18, h: c.h * 0.06 }, label: 'Export' },
  screen_zoom: {},
  progress: {},
  chapter: { title: 'Why the old way breaks', index: 2 },
  sticker: { emoji: 'rocket' },
  cta: { text: 'Subscribe', line: 'new tutorials every week' },
});

export async function gallery({ theme = 'kimo', aspects = Object.keys(ASPECTS), ffmpeg = toolPaths().ffmpeg, ffprobe = toolPaths().ffprobe } = {}) {
  mkdirSync(OUT, { recursive: true });
  const written = [];
  for (const name of aspects) {
    const c = ASPECTS[name];
    const kinds = ELEMENT_KINDS.filter((k) => k !== 'text_behind' && (k !== 'cta' || name === '16x9'));
    const slot = 2.6;
    const total = kinds.length * slot + (kinds.includes('cta') ? 2.6 : 0);
    const bg = join(OUT, `bg-${name}.mp4`);
    // a soft moving gradient so motion and alpha edges are visible
    const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `gradients=s=${c.w}x${c.h}:r=30:d=${total.toFixed(2)}:speed=0.01:c0=0x3b4f66:c1=0x16202b`, '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', total.toFixed(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', bg]);
    if (r.status) throw new Error(String(r.stderr));
    let at = 0;
    const overlays = kinds.map((kind, i) => {
      const dur = kind === 'cta' ? 5 : 2.4;
      const o = { id: `g${i + 1}`, kind: 'graphic', at: +at.toFixed(3), dur, track: 'graphics', props: { element: kind, theme, ...SAMPLE(c)[kind] } };
      at += kind === 'cta' ? 5.2 : slot;
      return o;
    });
    const edl = {
      edl_version: 1,
      canvas: { ...c, fps: 30 },
      sources: [{ id: 'bg', path: bg.replaceAll('\\', '/'), kind: 'video' }],
      video: [{ track: 'V1', clips: [{ id: 'c1', src: 'bg', in: 0, out: total, at: 0, speed: 1, fit: 'cover' }] }],
      audio: [],
      overlays,
      master: { lufs: -14, true_peak: -1 },
    };
    const output = join(OUT, `${theme}-${name}.mp4`);
    const warnings = [];
    await compose({ edl, ffmpeg, ffprobe, output, dir: join(OUT, `work-${name}`), emit: (e) => e.t === 'op' && e.warning && warnings.push(e.title) });
    written.push({ file: output, bytes: statSync(output).size, elements: kinds, warnings });
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
    const out = await gallery({ theme: pick('--theme', 'kimo'), aspects: pick('--aspects', Object.keys(ASPECTS).join(',')).split(',') });
    console.log(JSON.stringify({ backend: backendName(), out }, null, 2));
  } finally {
    await host?.close();
  }
}
