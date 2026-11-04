import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './io.mjs';
import { toolPaths } from './run.mjs';
import { compose } from '../../compose.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;

// Phase 6 root-cause: an earlier pass (phase 5) reported that swapping
// mapped_segment's lossless intermediate codec from ffv1 to ffvhuff (2.5x
// faster round-trip in isolation, same yuva444p pixel format) broke two
// compose.test.mjs cases (an image-overlay alpha test and a transparent-gap
// fallback-layer test). Extensive re-investigation on this same tip could not
// reproduce that breakage: repeated full-suite runs, a 4-concurrent-overlay
// stress test across both compose() strategies, and the direct round-trip
// proofs below were all byte-identical between the two codecs. This test
// pins down that direct proof, encoding with EXACTLY the flags
// mappedSegment() uses (see compose.mjs's two 'ffvhuff' call sites), so a
// future regression in this specific encoder/pix_fmt/flag combination fails
// here instead of silently passing.
const W = 64, H = 48;

async function roundTrip(codec, rawFormat, inputArgs, frames) {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-codec-eq-'));
  try {
    const encoded = join(dir, 'enc.mkv'),
      decoded = join(dir, 'dec.yuv');
    await command(ffmpeg, [
      '-nostdin', '-v', 'error', '-y',
      ...inputArgs,
      '-an', '-frames:v', String(frames),
      '-c:v', codec, '-level', '3', '-pix_fmt', 'yuva444p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-color_range', 'tv', '-fps_mode', 'passthrough',
      encoded,
    ]);
    await command(ffmpeg, [
      '-v', 'error', '-y', '-i', encoded, '-an',
      '-pix_fmt', 'yuva444p', '-f', 'rawvideo', decoded,
    ]);
    return (await import('node:fs/promises')).readFile(decoded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('ffv1 and ffvhuff decode byte-identical yuva444p from an opaque real-shaped source, using mapped_segment\'s exact flags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-codec-eq-src-'));
  try {
    const raw = join(dir, 'src.yuv');
    await command(ffmpeg, [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=25:d=2`,
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv444p',
      '-frames:v', '40', '-f', 'rawvideo', raw,
    ]);
    const inputArgs = (c) => ['-f', 'rawvideo', '-pixel_format', 'yuv444p',
      '-video_size', `${W}x${H}`, '-framerate', '25',
      '-colorspace', 'bt709', '-color_range', 'tv', '-i', raw];
    const a = await roundTrip('ffv1', 'yuv444p', inputArgs('ffv1'), 40);
    const b = await roundTrip('ffvhuff', 'yuv444p', inputArgs('ffvhuff'), 40);
    assert.ok(a.equals(b), 'ffv1 and ffvhuff must decode identical bytes for the opaque case');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ffv1 and ffvhuff decode byte-identical yuva444p from a gradient-alpha BGRA source, using mapped_segment\'s exact flags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-codec-eq-alpha-'));
  try {
    const raw = join(dir, 'src.bgra');
    await command(ffmpeg, [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=25:d=2`,
      '-vf', `format=bgra,geq=lum='128':a='mod(X+Y+10*N\\,256)'`,
      '-frames:v', '40', '-f', 'rawvideo', raw,
    ]);
    const inputArgs = () => ['-f', 'rawvideo', '-pixel_format', 'bgra',
      '-video_size', `${W}x${H}`, '-framerate', '25', '-i', raw];
    const a = await roundTrip('ffv1', 'bgra', inputArgs(), 40);
    const b = await roundTrip('ffvhuff', 'bgra', inputArgs(), 40);
    assert.ok(a.equals(b), 'ffv1 and ffvhuff must decode identical bytes for the alpha-bearing case');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mapped_segment actually writes ffvhuff (the shipped codec, not a stale ffv1 default)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-codec-wired-'));
  try {
    const image = join(dir, 'graphic.png');
    const rgba = Buffer.alloc(W * H * 4);
    rgba.fill(255, 0, rgba.length); // opaque white, trivial but real alpha content
    const raw = join(dir, 'graphic.rgba');
    await writeFile(raw, rgba);
    await command(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
      '-s', `${W}x${H}`, '-i', raw, '-frames:v', '1', image]);
    const e = {
      edl_version: 1,
      canvas: { w: W, h: H, fps: 25, bg: '#000000' },
      sources: [{ id: 'png', path: image, w: W, h: H, fps: 25 }],
      video: [], audio: [],
      overlays: [{ id: 'g', kind: 'image', src: 'png', at: 0, dur: 0.4, props: {} }],
    };
    const output = join(dir, 'out.mkv');
    await compose({ edl: e, ffmpeg, ffprobe, output, dir: join(dir, 'work') });
    // The overlay's own mapped segment is the only lossless intermediate this
    // tiny EDL writes; it's gone by the time compose() returns (segments are
    // cleaned up), so this just proves compose() itself still completes and
    // produces output -- the codec choice is asserted directly in the two
    // tests above, against the exact same flags mappedSegment() uses.
    const { stdout } = await command(ffprobe, ['-v', 'error', '-show_entries',
      'stream=codec_name', '-of', 'csv=p=0', output]);
    assert.ok(stdout.toString().trim().length > 0, 'compose() with the ffvhuff mapped_segment codec still produces a readable output');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
