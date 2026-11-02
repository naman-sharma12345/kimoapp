import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  criticalGates,
  enforceGates,
  performanceReport,
} from '../quality-gates.mjs';
import { inputPolicy, prepareInputs, standardRate } from '../input-media.mjs';
import {
  saveCheckpoint,
  readCheckpoint,
  folderBytes,
  clearCache,
  cleanPartials,
} from '../project-state.mjs';
import { probe } from '../engine.mjs';
import { toolPaths } from './bench/run.mjs';
import { run } from '../audio/process.mjs';
import { verifyRelease } from './verify-release.mjs';
import { createHash } from 'node:crypto';
import { analysisWorkers, mapPool } from '../worker-pool.mjs';

test('release feed uses the real updater parser and rejects altered installer bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-feed-'));
  try {
    const data = Buffer.from('installer-fixture'),
      name = 'kimo-Setup-0.4.0.exe',
      sha = createHash('sha512').update(data).digest('base64');
    await writeFile(join(dir, name), data);
    await writeFile(join(dir, name + '.blockmap'), 'blockmap-fixture');
    await writeFile(
      join(dir, 'latest.yml'),
      `version: 0.4.0\nfiles:\n  - url: ${name}\n    sha512: ${sha}\n    size: ${data.length}\npath: ${name}\nsha512: ${sha}\n`,
    );
    assert.equal((await verifyRelease(dir)).upgradeFrom, '0.3.2');
    await writeFile(join(dir, name), 'tampered');
    await assert.rejects(verifyRelease(dir), /SHA512/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('analysis pool preserves order and its concurrency bound while the default stays low CPU', async () => {
  let active = 0,
    peak = 0;
  const output = await mapPool(
    [3, 1, 2, 4],
    async (n) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 2;
    },
    2,
  );
  assert.deepEqual(output, [6, 2, 4, 8]);
  assert.equal(peak, 2);
  assert.equal(analysisWorkers({}, 4), 1);
  assert.equal(analysisWorkers({ KIMO_PERFORMANCE_PROFILE: 'ci' }, 4), 3);
});

test(
  'hosted rotation, PQ, HLG and 4K60 ten-bit fixtures normalize without losing metadata semantics',
  { skip: process.env.KIMO_ROBUSTNESS_CI !== '1', timeout: 120000 },
  async () => {
    const tools = toolPaths(),
      root = await mkdtemp(join(tmpdir(), 'kimo-hosted-inputs-'));
    try {
      const base = join(root, 'base.mp4'),
        rotated = join(root, 'rotated.mp4');
      await run(tools.ffmpeg, [
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=96x64:r=30:d=0.2',
        '-c:v',
        'libx264',
        base,
      ]);
      await run(tools.ffmpeg, [
        '-display_rotation',
        '90',
        '-i',
        base,
        '-c',
        'copy',
        rotated,
      ]);
      assert.equal(
        Math.abs((await probe(tools.ffprobe, rotated)).rotation),
        90,
        'fixture must contain a real display matrix',
      );
      const [rotation] = await prepareInputs(
        [await probe(tools.ffprobe, rotated)],
        { dir: root, ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe, probe },
      );
      assert.equal(rotation.width, 64);
      assert.equal(rotation.height, 96);
      assert.equal(rotation.rotation, 0);
      for (const trc of ['smpte2084', 'arib-std-b67']) {
        const path = join(root, trc + '.mkv');
        await run(tools.ffmpeg, [
          '-f',
          'lavfi',
          '-i',
          'testsrc2=s=96x64:r=30:d=0.2',
          '-vf',
          `format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=${trc}:colorspace=bt2020nc`,
          '-c:v',
          'ffv1',
          path,
        ]);
        const source = await probe(tools.ffprobe, path);
        assert.equal(source.color.trc, trc);
        const [sdr] = await prepareInputs([source], {
          dir: root,
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe,
          probe,
        });
        assert.equal(sdr.color.trc, 'bt709');
        assert.equal(sdr.pix_fmt, 'yuv420p');
      }
      const path = join(root, '4k60-10bit.mkv');
      await run(tools.ffmpeg, [
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=3840x2160:r=60',
        '-frames:v',
        '1',
        '-vf',
        'format=yuv420p10le',
        '-c:v',
        'ffv1',
        path,
      ]);
      const [fourK] = await prepareInputs([await probe(tools.ffprobe, path)], {
        dir: root,
        ffmpeg: tools.ffmpeg,
        ffprobe: tools.ffprobe,
        probe,
      });
      assert.equal(fourK.width, 3840);
      assert.equal(fourK.height, 2160);
      assert.equal(fourK.fps, 60);
      assert.equal(fourK.pix_fmt, 'yuv420p');
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);

const good = {
  repeated_frames: 0,
  frame_match_coverage: 1,
  jitter_px: 0.1,
  true_peak: -1.5,
  caption_safe: true,
  dead_air_ratio: 0.02,
  first_speech_s: 0.2,
};
test('critical gates are strict, distinguish missing evidence and never accept low frame coverage', () => {
  assert.equal(criticalGates(good).passed, true);
  for (const [key, value] of Object.entries({
    repeated_frames: 1,
    jitter_px: 1.01,
    true_peak: -0.99,
    caption_safe: false,
    dead_air_ratio: 0.061,
    first_speech_s: 1.01,
  }))
    assert.equal(criticalGates({ ...good, [key]: value }).red, true, key);
  assert.equal(criticalGates({}).passed, false);
  assert.equal(
    criticalGates({ ...good, frame_match_coverage: 0.1 }).unverified,
    true,
  );
  const noSpeech = criticalGates(
    { repeated_frames: 0, frame_match_coverage: 1, jitter_px: 0.1 },
    { speech: false, captions: false, audio: false },
  );
  assert.equal(noSpeech.passed, true);
});
test('one retry per failing stage; permanent failures and errors remain red', async () => {
  let calls = 0;
  const attempts = [];
  const result = await enforceGates({
    measure: async () => ({
      metrics: { ...good, repeated_frames: 2, caption_safe: false },
    }),
    repair: async (stage) => {
      attempts.push(stage);
      if (stage === 'captions') throw Error('layout failed');
      calls++;
    },
  });
  assert.deepEqual(attempts, ['compose', 'captions']);
  assert.equal(calls, 1);
  assert.equal(result.gates.red, true);
  assert.equal(result.gates.retries.length, 2);
  let fixed = false;
  const repaired = await enforceGates({
    measure: async () => ({
      metrics: { ...good, true_peak: fixed ? -1.5 : 0 },
    }),
    repair: async () => {
      fixed = true;
    },
  });
  assert.equal(repaired.gates.passed, true);
  assert.equal(repaired.gates.retries.length, 1);
});
test('input policy, durations and stage performance budgets have explicit bounds', () => {
  assert.throws(() => inputPolicy({ duration: 28800 }), /3 hours/);
  assert.equal(standardRate(29.98), 30000 / 1001);
  for (const sample of [
    { rotation: 90 },
    { vfr: true },
    { color: { trc: 'arib-std-b67' } },
    { pix_fmt: 'yuv420p10le' },
    { width: 321, height: 181 },
  ])
    assert.equal(
      inputPolicy({ width: 320, height: 180, fps: 30, ...sample }).needed,
      true,
    );
  const p = performanceReport(
    [{ tool: 'transcribe', phase: 'end', ms: 46000 }],
    241000,
    { sourceSeconds: 60 },
  );
  assert.equal(p.representative, true);
  assert.equal(p.checks.find((c) => c.stage === 'transcript').ok, false);
  assert.equal(p.checks.at(-1).ok, false);
});
test('atomic checkpoints survive interrupted writes and cache cleaning preserves projects and ledgers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimo-quality-state-'));
  try {
    await saveCheckpoint(root, 'compiled', { edl: { id: 1 } });
    await writeFile(join(root, 'checkpoint.json.partial'), 'broken');
    assert.equal((await readCheckpoint(root)).edl.id, 1);
    await mkdir(join(root, 'cache'));
    await writeFile(join(root, 'cache', 'cached.txt'), '123');
    await writeFile(join(root, 'spend.json'), 'reserved');
    assert.equal(await folderBytes(join(root, 'cache')), 3);
    await assert.rejects(clearCache(root, root), /outside/);
    await clearCache(join(root, 'cache'), root);
    assert.equal(await folderBytes(join(root, 'cache')), 0);
    await cleanPartials(root);
    assert.equal(await readFile(join(root, 'spend.json'), 'utf8'), 'reserved');
    assert.equal((await readCheckpoint(root)).stage, 'compiled');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('real tiny non-ASCII VFR/odd/no-audio input becomes even SDR CFR and cancellation stops promptly', async () => {
  const tools = toolPaths(),
    root = await mkdtemp(join(tmpdir(), 'kimo-परीक्षण-🎬-'));
  try {
    const path = join(root, 'क्लिप.mkv');
    await run(tools.ffmpeg, [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=98x64:r=30:d=0.4',
      '-vf',
      "crop=97:63:exact=1,select='not(eq(n,2))'",
      '-fps_mode',
      'vfr',
      '-c:v',
      'ffv1',
      path,
    ]);
    const file = await probe(tools.ffprobe, path);
    file.vfr = true;
    const [ready] = await prepareInputs([file], {
      dir: root,
      ffmpeg: tools.ffmpeg,
      ffprobe: tools.ffprobe,
      probe,
    });
    assert.equal(ready.width % 2, 0);
    assert.equal(ready.height % 2, 0);
    assert.equal(ready.rotation, 0);
    assert.equal(ready.audio, false);
    assert.equal(ready.vfr, false);
    const cancel = new AbortController(),
      start = Date.now();
    const pending = run(
      tools.ffmpeg,
      [
        '-re',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=96x64:r=30',
        '-t',
        '60',
        '-f',
        'null',
        '-',
      ],
      { signal: cancel.signal },
    );
    setTimeout(() => cancel.abort(), 100);
    await assert.rejects(pending, /cancel/);
    assert.ok(
      Date.now() - start < 1100,
      'stop must finish within one second after cancellation',
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
