import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './io.mjs';
import { compose, stageConcurrency } from '../../compose.mjs';
import { toolPaths } from './run.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;

test('stageConcurrency: sized by cores and RAM, capped at 4, forced serial under background profile', () => {
  // Measured on the real 700s/21,184-frame target on THIS 4-core/8GB box:
  // stages serial (with bakeTracks' own full segment concurrency) beat
  // stages at concurrency 2 (with inner concurrency forced to 1) -- 1253.0s
  // vs 1358.1s compose time -- so this box must resolve to 1, not 2; see
  // stageConcurrency()'s own comment for the measurement and reasoning.
  assert.equal(stageConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 10 }), 1);
  assert.equal(stageConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 1 }), 1);
  assert.equal(stageConcurrency({ parallelism: 32, totalMemGB: 4, jobCount: 10 }), 1);
  // A machine with real spare cores still gets real stage concurrency.
  assert.equal(stageConcurrency({ parallelism: 8, totalMemGB: 16, jobCount: 10 }), 2);
  assert.equal(stageConcurrency({ parallelism: 64, totalMemGB: 256, jobCount: 50 }), 4);
  const prev = process.env.KIMO_PERFORMANCE_PROFILE;
  process.env.KIMO_PERFORMANCE_PROFILE = 'background';
  try {
    assert.equal(stageConcurrency({ parallelism: 16, totalMemGB: 64, jobCount: 20 }), 1);
  } finally {
    if (prev === undefined) delete process.env.KIMO_PERFORMANCE_PROFILE;
    else process.env.KIMO_PERFORMANCE_PROFILE = prev;
  }
});

test('stageConcurrency: KIMO_STAGE_CONCURRENCY is an explicit override, bounded by job count', () => {
  const prev = process.env.KIMO_STAGE_CONCURRENCY;
  process.env.KIMO_STAGE_CONCURRENCY = '3';
  try {
    assert.equal(stageConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 10 }), 3);
    assert.equal(stageConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 2 }), 2);
  } finally {
    if (prev === undefined) delete process.env.KIMO_STAGE_CONCURRENCY;
    else process.env.KIMO_STAGE_CONCURRENCY = prev;
  }
});

// Builds a 90s / 3-clip-stage timeline with one image overlay PER stage (to
// exercise the overlayCursor "before-" z-order branch inside each stage
// independently) and scattered caption_word_group text overlays throughout
// (the plain ass text pass) -- the proof task 2 asks for: captions/overlays
// must land on the SAME frames whether stages render serially or in
// parallel.
async function buildEdl(dir) {
  const W = 64, H = 64, fps = 10;
  const raw = join(dir, 'solid.rgba');
  const makeClip = async (name, color) => {
    const p = join(dir, `${name}.mkv`);
    await command(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${W}x${H}:rate=${fps}:duration=30`, '-c:v', 'ffv1', p]);
    return p;
  };
  const clip0 = await makeClip('c0', 'red'),
    clip1 = await makeClip('c1', 'green'),
    clip2 = await makeClip('c2', 'blue');

  // A tiny solid PNG for the image overlay (one per stage).
  const png = join(dir, 'overlay.png');
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = 255; buf[i * 4 + 1] = 255; buf[i * 4 + 3] = 255; }
  await writeFile(raw, buf);
  await command(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', raw, '-frames:v', '1', png]);

  const overlays = [
    // one image overlay inside each 30s stage window
    { id: 'img-0', kind: 'image', src: 'png', at: 5, dur: 2, props: {} },
    { id: 'img-1', kind: 'image', src: 'png', at: 35, dur: 2, props: {} },
    { id: 'img-2', kind: 'image', src: 'png', at: 65, dur: 2, props: {} },
    // scattered captions across the whole timeline (the plain ass text pass)
    ...Array.from({ length: 18 }, (_, i) => ({
      id: `cap-${i}`,
      kind: 'caption_word_group',
      at: i * 5 + 1,
      dur: 1,
      props: { text: `word ${i}`, font: 'DejaVu Sans', size: 10, x: 0.5, y: 0.85, color: '#ffffff' },
    })),
  ];

  return {
    edl_version: 1,
    canvas: { w: W, h: H, fps, bg: '#000000' },
    sources: [
      { id: 's0', path: clip0, w: W, h: H, fps, duration: 30 },
      { id: 's1', path: clip1, w: W, h: H, fps, duration: 30 },
      { id: 's2', path: clip2, w: W, h: H, fps, duration: 30 },
      { id: 'png', path: png, w: W, h: H, fps },
    ],
    video: [{
      track: 'V1',
      clips: [
        { id: 'c0', src: 's0', at: 0, in: 0, out: 30, speed: 1 },
        { id: 'c1', src: 's1', at: 30, in: 0, out: 30, speed: 1 },
        { id: 'c2', src: 's2', at: 60, in: 0, out: 30, speed: 1 },
      ],
    }],
    overlays,
    audio: [],
  };
}

test(
  'compose(): parallel stages (complex path) produce byte-identical output to forcing stage concurrency=1 (serial) -- captions and overlays land on the same frames',
  { timeout: 180000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-parallel-stages-'));
    const prevStageConc = process.env.KIMO_STAGE_CONCURRENCY;
    try {
      const edl = await buildEdl(dir);

      process.env.KIMO_STAGE_CONCURRENCY = '1';
      const seqOut = join(dir, 'seq.mkv');
      const seqResult = await compose({ edl: structuredClone(edl), ffmpeg, ffprobe, output: seqOut, dir: join(dir, '.seq'), strategy: 'B' });

      process.env.KIMO_STAGE_CONCURRENCY = '3';
      const parOut = join(dir, 'par.mkv');
      const parResult = await compose({ edl: structuredClone(edl), ffmpeg, ffprobe, output: parOut, dir: join(dir, '.par'), strategy: 'B' });

      if (prevStageConc === undefined) delete process.env.KIMO_STAGE_CONCURRENCY;
      else process.env.KIMO_STAGE_CONCURRENCY = prevStageConc;

      assert.equal(seqResult.strategy, 'B');
      assert.equal(parResult.strategy, 'B');
      assert.equal(seqResult.frames, parResult.frames, 'same frame count');

      const decode = async (p) => (await command(ffmpeg, ['-v', 'error', '-i', p, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])).stdout;
      const a = await decode(seqOut), b = await decode(parOut);
      assert.equal(a.length, b.length, 'frame count must match between serial and parallel stage rendering');
      assert.ok(a.equals(b), 'parallel-stage output must be pixel-identical to serial -- captions/overlays must land on the same frames');
    } finally {
      if (prevStageConc === undefined) delete process.env.KIMO_STAGE_CONCURRENCY;
      else process.env.KIMO_STAGE_CONCURRENCY = prevStageConc;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
