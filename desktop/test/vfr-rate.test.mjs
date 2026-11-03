import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effectiveRate, parseRate } from '../vfr-rate.mjs';
import { probe } from '../engine.mjs';

// A fake ffprobe binary: ignores its arguments, always answers the same
// synthetic ffprobe JSON. Lets us exercise the REAL probe()/compose.mjs code
// path (not just the helper in isolation) against a fixture where
// r_frame_rate is far above avg_frame_rate -- the exact phone-VFR shape
// (desktop/compose.mjs used to read r_frame_rate with no such guard; see
// ~L1163 before the V8.12.x-era VFR fix).
async function fakeFfprobe(json) {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-fake-ffprobe-'));
  const path = join(dir, 'ffprobe');
  // probe() statSync()s the media path itself (mtimeMs, bytes), so it must
  // really exist even though our fake ffprobe never reads its bytes.
  await writeFile(join(dir, 'dummy.mp4'), '');
  await writeFile(
    path,
    `#!/bin/sh
cat <<'EOF'
${JSON.stringify(json)}
EOF
`,
  );
  await chmod(path, 0o755);
  return { ffprobe: path, dummyMedia: join(dir, 'dummy.mp4') };
}

const VFR_FIXTURE = {
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1080,
      height: 1920,
      r_frame_rate: '600/1',
      avg_frame_rate: '30/1',
      nb_frames: '900',
      pix_fmt: 'yuv420p',
    },
  ],
  format: { duration: '30.000000' },
};

test('effectiveRate: a synthetic ffprobe fixture with r_frame_rate 600/1 and avg_frame_rate 30/1 (phone VFR) trusts the average', () => {
  const eff = effectiveRate('600/1', '30/1');
  assert.equal(eff.rate, '30/1');
  assert.equal(eff.fps, 30);
  assert.equal(eff.guarded, true, 'r_frame_rate (600) is > 1.5x avg_frame_rate (30): must substitute the average');
  assert.equal(eff.vfr, true, 'the two rates disagree by more than 0.01fps: this clip is genuinely VFR');
});

test('effectiveRate: matching r_frame_rate/avg_frame_rate is left alone (no VFR, no guard)', () => {
  const eff = effectiveRate('30/1', '30/1');
  assert.equal(eff.rate, '30/1');
  assert.equal(eff.fps, 30);
  assert.equal(eff.guarded, false);
  assert.equal(eff.vfr, false);
});

test('effectiveRate: a mild mismatch under the 1.5x threshold keeps r_frame_rate (not every VFR clip should be overridden)', () => {
  // 29.97 vs 30: a completely ordinary NTSC rounding mismatch, not a phone bug.
  const eff = effectiveRate('30000/1001', '30/1');
  assert.equal(eff.guarded, false);
  assert.equal(eff.rate, '30000/1001');
});

test('effectiveRate: falls back cleanly when both fields are unreadable', () => {
  const eff = effectiveRate('0/0', undefined, '24/1');
  assert.equal(eff.rate, '24/1');
  assert.equal(eff.fps, 24);
  assert.equal(eff.vfr, false);
});

test('parseRate: "0/0", empty and garbage all parse to 0, not NaN or Infinity', () => {
  assert.equal(parseRate('0/0'), 0);
  assert.equal(parseRate(''), 0);
  assert.equal(parseRate(undefined), 0);
  assert.equal(parseRate('30'), 30);
});

test('engine.mjs probe(): a real synthetic ffprobe JSON with r_frame_rate=600/1, avg_frame_rate=30/1 resolves fps to 30, not 600 (regression: engine.mjs already guarded this; the shared helper must preserve it)', async () => {
  const { ffprobe, dummyMedia } = await fakeFfprobe(VFR_FIXTURE);
  const info = await probe(ffprobe, dummyMedia);
  assert.ok(info, 'probe() must parse the fixture and return a result');
  assert.equal(info.fps, 30, 'must trust avg_frame_rate, not the bogus 600/1 r_frame_rate');
  assert.equal(info.rate, '30/1');
  assert.equal(info.vfr, true);
});

test('engine.mjs probe(): an ordinary CFR fixture is unaffected by the guard', async () => {
  const cfr = JSON.parse(JSON.stringify(VFR_FIXTURE));
  cfr.streams[0].r_frame_rate = '30/1';
  const { ffprobe, dummyMedia } = await fakeFfprobe(cfr);
  const info = await probe(ffprobe, dummyMedia);
  assert.equal(info.fps, 30);
  assert.equal(info.rate, '30/1');
  assert.equal(info.vfr, false);
});
