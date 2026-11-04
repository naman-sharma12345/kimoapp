import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectGpu, listEncoders, vaapiDevicePath } from '../../engine.mjs';

const FAKE_FFMPEG = fileURLToPath(new URL('./fixtures/fake-ffmpeg.mjs', import.meta.url));

function env(encoders, working) {
  return {
    ...process.env,
    FAKE_FFMPEG_ENCODERS: encoders.join(','),
    FAKE_FFMPEG_WORKING: working.join(','),
  };
}

// detectGpu reads process.env directly inside execFileBackground's spawn path,
// so each case sets the env, calls, then restores it -- matching how the
// existing codebase already drives FFmpeg through resources.cjs.
async function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(vars))
      prev[k] === undefined ? delete process.env[k] : (process.env[k] = prev[k]);
  }
}

test('listEncoders parses ffmpeg -encoders output for each vendor name', async () => {
  await withEnv(
    { FAKE_FFMPEG_ENCODERS: 'h264_nvenc,h264_qsv,h264_amf,h264_videotoolbox,h264_vaapi', FAKE_FFMPEG_WORKING: '' },
    async () => {
      const found = await listEncoders(FAKE_FFMPEG);
      for (const enc of ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox', 'h264_vaapi'])
        assert.ok(found.has(enc), `expected ${enc} to be listed`);
      assert.equal(found.has('h264_vp9'), false);
    },
  );
});

test('detectGpu picks NVENC when it is both built and a real trial encode succeeds', async () => {
  await withEnv(
    { FAKE_FFMPEG_ENCODERS: 'h264_nvenc,h264_qsv', FAKE_FFMPEG_WORKING: 'h264_nvenc,h264_qsv' },
    async () => {
      const found = await detectGpu(FAKE_FFMPEG, { refresh: true });
      assert.equal(found, 'h264_nvenc'); // first in HARDWARE_ENCODERS order
    },
  );
});

test('detectGpu falls through to the next vendor when the first built encoder fails its trial encode (driver present, encode broken)', async () => {
  await withEnv(
    { FAKE_FFMPEG_ENCODERS: 'h264_nvenc,h264_qsv,h264_amf', FAKE_FFMPEG_WORKING: 'h264_amf' },
    async () => {
      const found = await detectGpu(FAKE_FFMPEG, { refresh: true });
      assert.equal(found, 'h264_amf');
    },
  );
});

test('detectGpu never picks an encoder this FFmpeg build does not even list', async () => {
  await withEnv(
    // amf "works" per the mock, but this build does not list it -- must not be picked.
    { FAKE_FFMPEG_ENCODERS: 'h264_qsv', FAKE_FFMPEG_WORKING: 'h264_amf,h264_qsv' },
    async () => {
      const found = await detectGpu(FAKE_FFMPEG, { refresh: true });
      assert.equal(found, 'h264_qsv');
    },
  );
});

test('detectGpu returns null (CPU fallback) when no hardware encoder actually works', async () => {
  await withEnv(
    { FAKE_FFMPEG_ENCODERS: 'h264_nvenc,h264_qsv,h264_amf,h264_videotoolbox,h264_vaapi', FAKE_FFMPEG_WORKING: '' },
    async () => {
      const found = await detectGpu(FAKE_FFMPEG, { refresh: true });
      assert.equal(found, null);
    },
  );
});

test('detectGpu caches its result per FFmpeg binary instead of re-probing for every master', async () => {
  const marker = FAKE_FFMPEG;
  await withEnv({ FAKE_FFMPEG_ENCODERS: 'h264_qsv', FAKE_FFMPEG_WORKING: 'h264_qsv' }, async () => {
    assert.equal(await detectGpu(marker, { refresh: true }), 'h264_qsv');
  });
  // Flip the mock to "nothing works" -- a cached detectGpu must NOT re-probe.
  await withEnv({ FAKE_FFMPEG_ENCODERS: 'h264_qsv', FAKE_FFMPEG_WORKING: '' }, async () => {
    assert.equal(await detectGpu(marker), 'h264_qsv', 'stale cache, as documented');
    assert.equal(await detectGpu(marker, { refresh: true }), null, 'refresh re-probes');
  });
});

test('VAAPI is only picked when both the encoder is built AND a real render node exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-vaapi-'));
  try {
    const realNode = join(dir, 'renderD128');
    await writeFile(realNode, '');
    // No node present: must not pick VAAPI even though it is "built" and "works".
    await withEnv({ FAKE_FFMPEG_ENCODERS: 'h264_vaapi', FAKE_FFMPEG_WORKING: 'h264_vaapi' }, async () => {
      assert.equal(
        await detectGpu(FAKE_FFMPEG, { refresh: true, vaapiCandidates: [join(dir, 'does-not-exist')] }),
        null,
      );
    });
    // Node present: VAAPI is now a real candidate.
    await withEnv({ FAKE_FFMPEG_ENCODERS: 'h264_vaapi', FAKE_FFMPEG_WORKING: 'h264_vaapi' }, async () => {
      assert.equal(
        await detectGpu(FAKE_FFMPEG, { refresh: true, vaapiCandidates: [realNode] }),
        'h264_vaapi',
      );
    });
    assert.equal(await vaapiDevicePath([join(dir, 'nope'), realNode]), realNode);
    assert.equal(await vaapiDevicePath([join(dir, 'nope')]), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the hardware-encoder order tries NVENC, QSV, AMF, VideoToolbox, then VAAPI, CPU last of all', async () => {
  // Every vendor built and "working": NVENC (first in the list) should win.
  await withEnv(
    { FAKE_FFMPEG_ENCODERS: 'h264_nvenc,h264_qsv,h264_amf,h264_videotoolbox,h264_vaapi', FAKE_FFMPEG_WORKING: 'h264_nvenc,h264_qsv,h264_amf,h264_videotoolbox,h264_vaapi' },
    async () => {
      assert.equal(await detectGpu(FAKE_FFMPEG, { refresh: true }), 'h264_nvenc');
    },
  );
});
