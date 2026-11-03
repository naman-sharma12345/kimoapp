import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command, probeFile } from './io.mjs';
import { compose } from '../../compose.mjs';
import { segmentConcurrency } from '../../compose.mjs';
import { fromKimoProject } from '../../edl.mjs';
import { toolPaths } from './run.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;

test('segmentConcurrency: sized by cores and RAM, capped, never below 1', () => {
  // This box: 4 cores, 8GB -> at most 2 concurrent (the task's own number).
  assert.equal(segmentConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 10 }), 2);
  // A single clip never gets more "concurrency" than there is work.
  assert.equal(segmentConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 1 }), 1);
  // Low memory caps concurrency even with many cores.
  assert.equal(segmentConcurrency({ parallelism: 32, totalMemGB: 4, jobCount: 10 }), 1);
  // A bigger machine auto-scales up, but stays at a sane ceiling (8).
  assert.equal(segmentConcurrency({ parallelism: 64, totalMemGB: 256, jobCount: 50 }), 8);
  // A single core never goes to zero.
  assert.equal(segmentConcurrency({ parallelism: 1, totalMemGB: 1, jobCount: 5 }), 1);
});

test('segmentConcurrency: KIMO_PERFORMANCE_PROFILE=background forces serial (same as before this change)', () => {
  const prev = process.env.KIMO_PERFORMANCE_PROFILE;
  process.env.KIMO_PERFORMANCE_PROFILE = 'background';
  try {
    assert.equal(segmentConcurrency({ parallelism: 16, totalMemGB: 64, jobCount: 20 }), 1);
  } finally {
    if (prev === undefined) delete process.env.KIMO_PERFORMANCE_PROFILE;
    else process.env.KIMO_PERFORMANCE_PROFILE = prev;
  }
});

test('segmentConcurrency: KIMO_SEGMENT_CONCURRENCY is an explicit override, bounded by job count', () => {
  const prev = process.env.KIMO_SEGMENT_CONCURRENCY;
  process.env.KIMO_SEGMENT_CONCURRENCY = '3';
  try {
    assert.equal(segmentConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 10 }), 3);
    assert.equal(segmentConcurrency({ parallelism: 4, totalMemGB: 8, jobCount: 2 }), 2);
  } finally {
    if (prev === undefined) delete process.env.KIMO_SEGMENT_CONCURRENCY;
    else process.env.KIMO_SEGMENT_CONCURRENCY = prev;
  }
});

function edlWithClips(paths, fps, w, h) {
  const assets = {};
  const files = [];
  paths.forEach((p, i) => {
    assets[`s${i}`] = { path: p, width: w, height: h, fps, duration: 1 };
    files.push({ path: p, kind: 'video', width: w, height: h, fps, duration: 1, audio: false });
  });
  const clips = paths.map((_, i) => ({
    id: `c${i}`,
    source: { type: 'media', asset: `s${i}` },
    start: i * 1,
    duration: 1,
    in_point: 0,
    props: { camera: [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'cubic' }, { t: 1, x: 0.5, y: 0.5, zoom: 1.1, ease: 'cubic' }] },
  }));
  return fromKimoProject({ width: w, height: h, fps, assets, tracks: [{ id: 'v1', clips }] }, files);
}

test('compose(): parallel segment pre-render produces byte-identical output to forcing concurrency=1 (sequential)', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-parallel-compose-'));
  try {
    const W = 64, H = 64, fps = 10;
    const clipPaths = [];
    for (let i = 0; i < 4; i++) {
      const p = join(dir, `src${i}.mkv`);
      await command(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${fps}:duration=1`, '-c:v', 'ffv1', p]);
      clipPaths.push(p);
    }
    const edl = edlWithClips(clipPaths, fps, W, H);

    const prevConc = process.env.KIMO_SEGMENT_CONCURRENCY;

    process.env.KIMO_SEGMENT_CONCURRENCY = '1';
    const seqOut = join(dir, 'seq.mkv');
    await compose({ edl, ffmpeg, ffprobe, output: seqOut, dir: join(dir, '.seq') });

    process.env.KIMO_SEGMENT_CONCURRENCY = '3';
    const parOut = join(dir, 'par.mkv');
    await compose({ edl: structuredClone(edl), ffmpeg, ffprobe, output: parOut, dir: join(dir, '.par') });

    if (prevConc === undefined) delete process.env.KIMO_SEGMENT_CONCURRENCY;
    else process.env.KIMO_SEGMENT_CONCURRENCY = prevConc;

    const decode = async (p) => (await command(ffmpeg, ['-v', 'error', '-i', p, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])).stdout;
    const a = await decode(seqOut), b = await decode(parOut);
    assert.equal(a.length, b.length, 'frame count must match between sequential and parallel runs');
    assert.ok(a.equals(b), 'parallel segment pre-render must produce pixel-identical output to the sequential path');

    const pa = await probeFile(ffprobe, seqOut), pb = await probeFile(ffprobe, parOut);
    assert.equal(pa.video.r_frame_rate, pb.video.r_frame_rate);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
