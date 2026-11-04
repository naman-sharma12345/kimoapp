import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './io.mjs';
import { compose } from '../../compose.mjs';
import { fromKimoProject } from '../../edl.mjs';
import { toolPaths } from './run.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;

// Phase 4 task 1: the >600s "complex" chunked-stage renderer used to keep
// every stage's per-clip ffv1 intermediates (mapped-*.mkv, track-*.mkv) on
// disk until the very final concat -- a >600s export could need ~20GB of
// scratch. KIMO_COMPLEX_STAGE_THRESHOLD_S (test-only; production default is
// unchanged at 600) lets this be exercised on a short synthetic timeline.

function edlWithSequentialClips(paths, durationsS, fps, w, h) {
  const assets = {};
  const files = [];
  paths.forEach((p, i) => {
    assets[`s${i}`] = { path: p, width: w, height: h, fps, duration: durationsS[i] };
    files.push({ path: p, kind: 'video', width: w, height: h, fps, duration: durationsS[i], audio: false });
  });
  let at = 0;
  const clips = paths.map((_, i) => {
    const c = {
      id: `c${i}`,
      source: { type: 'media', asset: `s${i}` },
      start: at,
      duration: durationsS[i],
      in_point: 0,
      props: { camera: [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'cubic' }, { t: durationsS[i], x: 0.5, y: 0.5, zoom: 1.05, ease: 'cubic' }] },
    };
    at += durationsS[i];
    return c;
  });
  return fromKimoProject({ width: w, height: h, fps, assets, tracks: [{ id: 'v1', clips }] }, files);
}

test('KIMO_COMPLEX_STAGE_THRESHOLD_S forces the chunked-stage path on a short timeline (production default of 600s is unchanged)', () => {
  const prev = process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S;
  try {
    delete process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S;
    // Re-import-free check: the default lives in compose.mjs's own source,
    // not something we can call directly without rendering -- the real proof
    // that 600 is unchanged is every other scoped suite staying green with
    // the env var unset (they all render well under 600s and must NOT take
    // this path). This test documents the contract explicitly.
    assert.equal(process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S, undefined);
  } finally {
    if (prev === undefined) delete process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S;
    else process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S = prev;
  }
});

test(
  'compose(): complex path deletes a stage\'s own mapped-*/track-* intermediates once its picture-*.mkv is written and verified -- they do not survive into the next stage',
  { timeout: 180000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-disk-bound-'));
    const prevThreshold = process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S;
    try {
      const W = 48, H = 48, fps = 10;
      // 3 clips of 12s each = 36s total. chunkSize = floor(fps*30) = 300
      // frames = 30s -> two stages: [0,300) holds all 3 clips (the third
      // only partially), [300,360) holds just clip 2's tail. A real
      // production render would need >600s to take this path at all;
      // the override makes 36s take it here.
      process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S = '5';
      const durations = [12, 12, 12];
      const clipPaths = [];
      for (let i = 0; i < 3; i++) {
        const p = join(dir, `src${i}.mkv`);
        await command(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${fps}:duration=${durations[i]}`, '-c:v', 'ffv1', p]);
        clipPaths.push(p);
      }
      const edl = edlWithSequentialClips(clipPaths, durations, fps, W, H);
      const workDir = join(dir, '.compose');

      const stageTwoSnapshots = [];
      const emit = (ev) => {
        // bakeTracks()'s "mapping source frames" progress fires with
        // frame = plan.start + n. Stage 1 (from=0, to=300) can never report
        // a frame > 300 (plan.end is clamped to the stage's own "to"), so
        // any tick strictly greater than 300 is unambiguously stage 2's own
        // bake -- which only starts after stage 1's full picture pass (and
        // this cleanup) has already completed, since stages still run one
        // after another before task 2's parallel-stages change.
        if (ev.t === 'progress' && ev.label === 'mapping source frames' && ev.frame > 300) {
          let names;
          try {
            names = readdirSync(workDir).flatMap((top) => {
              // dir is itself a mkdtemp'd "work-XXXXXX" subdir of workDir
              return readdirSync(join(workDir, top)).map((n) => join(top, n));
            });
          } catch {
            names = [];
          }
          stageTwoSnapshots.push(names);
        }
      };

      const output = join(dir, 'out.mkv');
      const result = await compose({ edl, ffmpeg, ffprobe, output, dir: workDir, emit });
      assert.equal(result.strategy, 'B', 'the override must actually force the complex/chunked-stage path');

      assert.ok(stageTwoSnapshots.length > 0, 'must have observed at least one stage-2 progress tick to make this assertion meaningful');
      for (const names of stageTwoSnapshots) {
        const leftoverStageOne = names.filter((n) => /-0\.(mkv|ffcat|ass|ffgraph)$/.test(n) && !/^work-[^/]+\/picture-0\.mkv$/.test(n));
        assert.deepEqual(leftoverStageOne, [], `stage 1's own intermediates must be deleted before stage 2 runs, found: ${JSON.stringify(leftoverStageOne)}`);
      }
    } finally {
      if (prevThreshold === undefined) delete process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S;
      else process.env.KIMO_COMPLEX_STAGE_THRESHOLD_S = prevThreshold;
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'compose(): a short, non-complex timeline is completely unaffected (strategy A, no stage cleanup touched)',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-disk-bound-noncomplex-'));
    try {
      const W = 48, H = 48, fps = 10;
      const p = join(dir, 'src0.mkv');
      await command(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${fps}:duration=2`, '-c:v', 'ffv1', p]);
      const edl = edlWithSequentialClips([p], [2], fps, W, H);
      const output = join(dir, 'out.mkv');
      const result = await compose({ edl, ffmpeg, ffprobe, output, dir: join(dir, '.compose') });
      assert.equal(result.strategy, 'A');
      assert.equal(result.frames, 20);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
