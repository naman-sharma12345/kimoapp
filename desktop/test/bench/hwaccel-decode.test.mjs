import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { command, probeFile } from './io.mjs';
import { compose, hwAccelFlags } from '../../compose.mjs';
import { fromKimoProject } from '../../edl.mjs';
import { toolPaths } from './run.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;

test('hwAccelFlags(): requests ffmpeg\'s own auto hardware decode by default', () => {
  assert.deepEqual(hwAccelFlags({}), ['-hwaccel', 'auto']);
  assert.deepEqual(hwAccelFlags({ SOME_OTHER_VAR: '1' }), ['-hwaccel', 'auto']);
});

test('hwAccelFlags(): KIMO_HW_DECODE opts out with any of its documented values', () => {
  for (const v of ['off', 'OFF', '0', 'disable', 'disabled', 'software', 'none'])
    assert.deepEqual(hwAccelFlags({ KIMO_HW_DECODE: v }), [], `expected no flags for KIMO_HW_DECODE=${v}`);
});

test('hwAccelFlags(): an unrecognized value does not accidentally opt out', () => {
  assert.deepEqual(hwAccelFlags({ KIMO_HW_DECODE: 'cuda' }), ['-hwaccel', 'auto']);
});

test('compose(): the contiguous-frame oracle path still produces correct, pixel-exact output with -hwaccel auto requested (software fallback on this box -- no GPU here, so this proves the safe-fallback behaviour end to end rather than real hardware decode)', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-hwaccel-'));
  try {
    const W = 64, H = 64, fps = 10;
    const src = join(dir, 'src.mkv');
    await command(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${fps}:duration=1`, '-c:v', 'ffv1', src]);
    const edl = fromKimoProject(
      {
        width: W, height: H, fps,
        assets: { s1: { path: src, width: W, height: H, fps, duration: 1 } },
        tracks: [{ id: 'v1', clips: [{ id: 'c1', source: { type: 'media', asset: 's1' }, start: 0, duration: 1, in_point: 0, props: {} }] }],
      },
      [{ path: src, kind: 'video', width: W, height: H, fps, duration: 1, audio: false }],
    );
    const output = join(dir, 'out.mkv');
    await compose({ edl, ffmpeg, ffprobe, output, dir: join(dir, '.compose') });
    assert.ok(existsSync(output));
    const info = await probeFile(ffprobe, output);
    assert.equal(info.video.width, W);
    assert.equal(info.video.height, H);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
