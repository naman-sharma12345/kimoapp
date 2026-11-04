import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './io.mjs';
import { toolPaths } from './run.mjs';
import { measure } from '../../engine.mjs';
import { jitterAccumulator, JITTER_SCALE_WIDTH } from '../../sam.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;

// Builds a ~3s 25fps clip with: a black segment (0-0.4s), a silent gap in the
// audio (1.0-1.8s), and simple motion (a moving box), so blackdetect,
// silencedetect/loudnorm and the motion-jitter pass all have something real to
// find -- a regression in any one of them would show up here.
async function fixture(dir) {
  const path = join(dir, 'source.mp4');
  await command(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=25:d=0.4',
    '-f', 'lavfi', '-i', "testsrc2=size=320x240:rate=25:duration=2.6",
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.0:sample_rate=48000',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=0.8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2:sample_rate=48000',
    '-filter_complex',
    '[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a][3:a][4:a]concat=n=3:v=0:a=1[a]',
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    path,
  ]);
  return path;
}

test('measure(): one ffmpeg decode finds blackdetect, silencedetect/loudnorm and motion-jitter together (no second full decode)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-measure-'));
  try {
    const path = await fixture(dir);
    const m = await measure(ffmpeg, ffprobe, path);
    // blackdetect: the opening black segment was found
    assert.ok(m.black.length >= 1, 'expected a detected black segment');
    assert.ok(m.black[0][0] < 0.1, `black segment should start near 0, got ${JSON.stringify(m.black)}`);
    // silencedetect: the mid-clip silent gap was found
    assert.ok(m.silences.length >= 1, 'expected a detected silence gap');
    // loudnorm ran (audio measured)
    assert.ok(m.acodec === 'aac');
    assert.ok(Number.isFinite(m.lufs), 'expected measured LUFS from the single-pass loudnorm');
    // motion-jitter ran in the same pass (moving testsrc2 content after the black)
    assert.ok(Number.isFinite(m.jitter), 'expected a jitter reading');
    assert.ok(m.frames > 0, 'expected a frame count from the jitter accumulator');
    // ~3s at 25fps == ~75 frames; well under the 90s cap so none are dropped
    assert.ok(m.frames >= 60 && m.frames <= 80, `expected ~75 frames, got ${m.frames}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('measure(): a video with no audio still runs blackdetect + jitter in one pass (no [0:a] branch requested)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-measure-noaudio-'));
  try {
    const path = join(dir, 'silent.mp4');
    await command(ffmpeg, [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path,
    ]);
    const m = await measure(ffmpeg, ffprobe, path);
    assert.equal(m.acodec, undefined);
    assert.equal(m.silences.length, 0);
    assert.ok(Number.isFinite(m.jitter));
    assert.ok(m.frames > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('jitterAccumulator: feeding frames incrementally (as a streaming ffmpeg pipe would) matches a known-still clip (near-zero jitter)', () => {
  const w = 240, h = 136; // matches scale=240:-2 from a 16:9 source (h rounds to an even number)
  const acc = jitterAccumulator(426, 240); // arbitrary real source dims -> derives AH itself
  assert.equal(acc.AW, JITTER_SCALE_WIDTH);
  assert.ok(acc.valid);
  const frameSize = acc.AW * acc.AH;
  // 10 identical gray frames: zero motion, zero jitter, no false "duplicate frame" judder
  // flag (duplicate detection needs surrounding motion to fire; a fully static clip never sets it).
  const frame = Buffer.alloc(frameSize, 128);
  for (let i = 0; i < 10; i++) acc.feed(Buffer.from(frame));
  const result = acc.finish();
  assert.ok(result);
  assert.equal(result.frames, 10);
  assert.equal(result.jitter, 0);
});
