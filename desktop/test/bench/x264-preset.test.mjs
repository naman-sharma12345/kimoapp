import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { youtubeMaster } from '../../engine.mjs';

const CAPTURE_FFMPEG = fileURLToPath(new URL('./fixtures/capture-ffmpeg.mjs', import.meta.url));

async function captured(args, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-capture-'));
  const captureOut = join(dir, 'argv.jsonl');
  const prev = process.env.CAPTURE_OUT;
  process.env.CAPTURE_OUT = captureOut;
  try {
    await fn(dir);
    const { readFile } = await import('node:fs/promises');
    const lines = (await readFile(captureOut, 'utf8')).trim().split('\n');
    return lines.map((l) => JSON.parse(l));
  } finally {
    captureOut === prev ? delete process.env.CAPTURE_OUT : (process.env.CAPTURE_OUT = prev);
    await rm(dir, { recursive: true, force: true });
  }
}

const value = (args, flag) => args[args.indexOf(flag) + 1];

test('youtubeMaster uses the veryfast preset (not medium) for the real CPU delivery encode, at a 12% higher bitrate target', async () => {
  const [args] = await captured({}, async (dir) => {
    await youtubeMaster({
      ffmpeg: CAPTURE_FFMPEG,
      input: 'in.mkv',
      output: join(dir, 'out.mp4'),
      P: { width: 1280, height: 720 },
      m: { fps: 30, duration: 20, acodec: null },
      encoder: null,
      preview: false,
    });
  });
  assert.equal(value(args, '-c:v'), 'libx264');
  assert.equal(value(args, '-preset'), 'veryfast');
  // recommendedMbps(1280,720,30) = 8; 8 * 1.12 = 8.96
  assert.equal(value(args, '-b:v'), '8.96M');
  assert.equal(value(args, '-maxrate'), '13M'); // round(8.96*1.5)
  assert.equal(value(args, '-bufsize'), '18M'); // round(8.96*2)
});

test('youtubeMaster keeps "ultrafast" for a quick preview, with no bitrate bump', async () => {
  const [args] = await captured({}, async (dir) => {
    await youtubeMaster({
      ffmpeg: CAPTURE_FFMPEG,
      input: 'in.mkv',
      output: join(dir, 'out.mp4'),
      P: { width: 1280, height: 720 },
      m: { fps: 30, duration: 20, acodec: null },
      encoder: null,
      preview: true,
    });
  });
  assert.equal(value(args, '-preset'), 'ultrafast');
  assert.equal(value(args, '-b:v'), '8M'); // unbumped
});

test('youtubeMaster does not bump the bitrate for a GPU encoder (not a preset/bitrate tradeoff the way x264 is)', async () => {
  const [args] = await captured({}, async (dir) => {
    await youtubeMaster({
      ffmpeg: CAPTURE_FFMPEG,
      input: 'in.mkv',
      output: join(dir, 'out.mp4'),
      P: { width: 1280, height: 720 },
      m: { fps: 30, duration: 20, acodec: null, vcodec: 'h264', pix_fmt: 'yuv420p' },
      encoder: 'h264_nvenc',
      preview: false,
    });
  });
  // the first attempt is the hardwareDecode nvenc plan
  assert.equal(value(args, '-c:v'), 'h264_nvenc');
  assert.equal(value(args, '-b:v'), '8M');
});
