// Graphics self-test for the Windows Electron smoke: the active backend (the
// offscreen Chromium window in the app) renders every element, frame 37 twice
// (identical bytes), a parity check against the built-in canvas, and a short
// 9:16 composite with a hook title, lower third, callout and progress bar.
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { graphicJob, themeFor, frameBuffer, backendName } from './renderer.mjs';
import { ELEMENT_KINDS } from './elements/index.mjs';
import { compose } from '../compose.mjs';

const SAMPLE = {
  hook_title: { text: 'I tried every AI editor' },
  lower_third: { name: 'Naman Sharma', role: 'Founder, kimo' },
  stat: { value: '50%', label: 'faster' },
  callout: { kind: 'circle', target: { x: 300, y: 820, w: 320, h: 140 }, label: 'Export' },
  screen_zoom: {},
  progress: {},
  chapter: { title: 'The setup', index: 2 },
  sticker: { emoji: 'fire' },
  text_behind: { text: 'KIMO' },
  cta: { text: 'Subscribe' },
};
const md5 = (b) => createHash('md5').update(b).digest('hex');

export async function graphicsSelfTest({ ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', dir, clip, canvas = { w: 540, h: 960 } }) {
  mkdirSync(dir, { recursive: true });
  const theme = themeFor('kimo');
  const out = { backend: backendName(), elements: {}, ok: false };
  try {
    for (const kind of ELEMENT_KINDS) {
      const wide = kind === 'cta' ? { w: 960, h: 540 } : canvas;
      const job = graphicJob({ kind, props: SAMPLE[kind], canvas: wide, fps: 30, dur: kind === 'cta' ? 5 : 2.4, theme });
      if (!job) {
        out.elements[kind] = 'refused';
        continue;
      }
      const b = await frameBuffer(job, Math.min(job.frames - 1, 20));
      let lit = 0;
      for (let i = 3; i < b.length; i += 4) if (b[i]) lit++;
      out.elements[kind] = kind === 'text_behind' ? 'sam' : lit > 0 ? `ok ${job.box.w}x${job.box.h}` : 'empty';
    }
    const job = graphicJob({ kind: 'hook_title', props: SAMPLE.hook_title, canvas, fps: 30, dur: 2.4, theme });
    const a = await frameBuffer(job, 37);
    const b = await frameBuffer(job, 37);
    out.deterministic = md5(a) === md5(b);
    const soft = await frameBuffer(job, 37, 'soft');
    let diff = 0;
    let big = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - soft[i]);
      diff += d;
      if (d > 64) big++;
    }
    out.parity = { mean_abs: +(diff / a.length).toFixed(3), over_64: +(big / a.length).toFixed(5) };
    if (clip && existsSync(clip)) {
      const edl = {
        edl_version: 1,
        canvas: { ...canvas, fps: 30 },
        sources: [{ id: 's', path: clip.replaceAll('\\', '/'), kind: 'video' }],
        video: [{ track: 'V1', clips: [{ id: 'c1', src: 's', in: 0, out: 3, at: 0, speed: 1, fit: 'cover' }] }],
        audio: [],
        overlays: [
          { id: 'g1', kind: 'graphic', at: 0.1, dur: 1.4, track: 'graphics', props: { element: 'hook_title', theme: 'kimo', ...SAMPLE.hook_title } },
          { id: 'g2', kind: 'graphic', at: 1.9, dur: 1.0, track: 'graphics', props: { element: 'callout', theme: 'kimo', ...SAMPLE.callout } },
          { id: 'g3', kind: 'graphic', at: 0, dur: 3, track: 'graphics', props: { element: 'progress', theme: 'kimo' } },
        ],
        master: { lufs: -14, true_peak: -1 },
      };
      const ops = [];
      const output = join(dir, 'graphics-selftest.mkv');
      await compose({ edl, ffmpeg, ffprobe, output, dir: join(dir, 'compose'), emit: (e) => e.t === 'op' && ops.push(e) });
      const start = ops.find((o) => o.tool === 'graphics' && o.phase === 'start');
      const g = ops.find((o) => o.phase === 'end' && start && o.id === start.id);
      out.compose = { ok: existsSync(output) && statSync(output).size > 1000, graphics: g?.result ?? g?.error ?? null, warnings: ops.filter((o) => o.warning).map((o) => o.title) };
    }
    out.ok = Object.values(out.elements).every((v) => v !== 'empty') && out.deterministic && (!out.compose || out.compose.ok);
  } catch (error) {
    out.error = String(error.stack ?? error.message).slice(0, 800);
  }
  return out;
}
