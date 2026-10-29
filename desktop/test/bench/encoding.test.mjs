import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  videoEncoderArgs,
  encodingAttempts,
  encodeWithFallback,
} from '../../encoding.mjs';
import { command, probeFile } from './io.mjs';
import { inspectDelivery } from './metrics.mjs';

test('high-quality NVENC settings keep work on video hardware with bounded surfaces', () => {
  const args = videoEncoderArgs('h264_nvenc');
  const value = (key) => args[args.indexOf(key) + 1];
  assert.equal(value('-preset'), 'p6');
  assert.equal(value('-tune'), 'hq');
  assert.equal(value('-cq'), '18');
  assert.equal(value('-multipass'), 'qres');
  assert.equal(value('-surfaces'), '32');
  assert.deepEqual(
    encodingAttempts('h264_nvenc', { vcodec: 'h264', pix_fmt: 'yuv420p' }),
    [
      { encoder: 'h264_nvenc', hardwareDecode: true },
      { encoder: 'h264_nvenc', hardwareDecode: false },
      { encoder: 'libx264', hardwareDecode: false },
    ],
  );
  assert.equal(
    encodingAttempts('h264_nvenc', { pix_fmt: 'yuv420p10le' })[0]
      .hardwareDecode,
    false,
  );
  assert.throws(() => videoEncoderArgs('unknown'), /Unsupported/);
});
test('decode failure retries GPU encoding before resorting to CPU; cancellation never restarts', async () => {
  const attempts = [],
    fallbacks = [];
  const result = await encodeWithFallback({
    preferred: 'h264_nvenc',
    measured: { vcodec: 'h264', pix_fmt: 'yuv420p' },
    attempt: async (p) => {
      attempts.push(p);
      if (p.hardwareDecode) throw Error('decoder unavailable');
      return { output: 'out.mp4' };
    },
    onFallback: (f) => fallbacks.push(f),
  });
  assert.equal(result.encoder, 'h264_nvenc');
  assert.equal(result.cpuFallback, false);
  assert.equal(attempts.length, 2);
  assert.equal(fallbacks.length, 1);
  const cpu = await encodeWithFallback({
    preferred: 'h264_amf',
    attempt: async (p) => {
      if (p.encoder !== 'libx264') throw Error('driver unavailable');
      return {};
    },
  });
  assert.equal(cpu.encoder, 'libx264');
  assert.equal(cpu.cpuFallback, true);
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    encodeWithFallback({
      preferred: 'h264_nvenc',
      signal: controller.signal,
      attempt: async () => {
        calls++;
        controller.abort();
        throw Error('stopped');
      },
    }),
    /stopped/,
  );
  assert.equal(calls, 1);
});
test(
  '1.2-second master smoke preserves delivery format; uses NVDEC/NVENC when available',
  { timeout: 60000 },
  async (t) => {
    const ffmpeg = process.env.KIMO_FFMPEG || 'ffmpeg',
      ffprobe = process.env.KIMO_FFPROBE || 'ffprobe';
    try {
      await command(ffmpeg, ['-version']);
    } catch (e) {
      if (process.env.KIMO_BENCH_REQUIRE_FFMPEG) throw e;
      t.skip('FFmpeg unavailable');
      return;
    }
    const { youtubeMaster, detectGpu, measure } =
      await import('../../engine.mjs');
    const dir = await mkdtemp(join(tmpdir(), 'kimo-encode-test-'));
    try {
      const input = join(dir, 'input.mp4'),
        output = join(dir, 'master.mp4');
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=256x144:r=30:d=1.2',
        '-f',
        'lavfi',
        '-i',
        'anoisesrc=color=white:amplitude=0.08:sample_rate=48000:duration=1.2',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        input,
      ]);
      const m = await measure(ffmpeg, ffprobe, input);
      const preferred = await detectGpu(ffmpeg);
      const result = await youtubeMaster({
        ffmpeg,
        input,
        output,
        P: { width: 256, height: 144 },
        m,
        encoder: preferred,
        onFallback: ({ error }) => t.diagnostic(error.message),
      });
      const info = await probeFile(ffprobe, output);
      assert.equal(info.video.codec_name, 'h264');
      assert.equal(info.video.profile, 'High');
      assert.equal(info.video.width, 256);
      assert.equal(info.video.height, 144);
      assert.equal(info.video.pix_fmt, 'yuv420p');
      assert.equal(info.video.color_space, 'bt709');
      assert.equal(info.audio.codec_name, 'aac');
      assert.equal(+info.audio.sample_rate, 48000);
      assert.equal(info.audio.channels, 2);
      assert.deepEqual(await inspectDelivery(ffmpeg, ffprobe, output, 30), {
        closed_gop: true,
        cfr_ok: true,
      });
      if (preferred === 'h264_nvenc') {
        assert.equal(result.encoder, 'h264_nvenc');
        assert.equal(typeof result.hardwareDecode, 'boolean');
      } else
        assert.ok(['libx264', 'h264_qsv', 'h264_amf'].includes(result.encoder));
      t.diagnostic(
        `encoder=${result.encoder}, hardwareDecode=${result.hardwareDecode}; tiny synthetic fixture only`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
