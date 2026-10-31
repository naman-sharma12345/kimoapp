// Phase 4 compositor nodes on real FFmpeg: zoom-through blur, dip to white,
// whip, a speed ramp with motion interpolation, and a director-keyed clip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './bench/io.mjs';
import { toolPaths } from './bench/run.mjs';
import { compose } from '../compose.mjs';
import { directCamera, motionAcrossCuts } from '../camera.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;
const W = 96,
  H = 64;

async function src(dir, name, lavfi, rate, seconds) {
  const path = join(dir, `${name}.mkv`);
  await command(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${lavfi}:s=${W}x${H}:r=${rate}`, '-t', String(seconds), '-c:v', 'ffv1', '-pix_fmt', 'yuv444p', path]);
  return path;
}
const luma = async (path, w = W, h = H) => {
  const raw = (await command(ffmpeg, ['-v', 'error', '-i', path, '-an', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'])).stdout;
  const out = [];
  for (let n = 0; n * w * h < raw.length; n++) {
    let s = 0;
    for (let i = 0; i < w * h; i++) s += raw[n * w * h + i];
    out.push(s / (w * h));
  }
  return out;
};

test('transition nodes and a speed ramp render with exact frame counts', { timeout: 120000 }, async (t) => {
  try {
    await command(ffmpeg, ['-version']);
  } catch (e) {
    if (process.env.KIMO_BENCH_REQUIRE_FFMPEG) throw e;
    return t.skip('FFmpeg unavailable');
  }
  const dir = await mkdtemp(join(tmpdir(), 'kimo-camera-render-'));
  try {
    const grey = await src(dir, 'grey', 'color=c=0x404040', 25, 3);
    const moving = await src(dir, 'moving', 'testsrc2=d=3', 12, 3); // low-fps b-roll: ramp interpolates
    const edl = {
      edl_version: 1,
      canvas: { w: W, h: H, fps: 25 },
      sources: [
        { id: 'g', path: grey, kind: 'video' },
        { id: 'm', path: moving, kind: 'video' },
      ],
      video: [
        {
          track: 'V1',
          clips: [
            { id: 'a', src: 'g', in: 0, out: 1, at: 0, speed: 1 },
            { id: 'b', src: 'g', in: 1, out: 2, at: 1, speed: 1, transition_in: { kind: 'dip', dur: 0.48, color: 'white' } },
            { id: 'c', src: 'm', in: 0, out: 1, at: 2, speed: 1, transition_in: { kind: 'zoom', dur: 0.32 }, ramp: { at: 0.2, dur: 0.6, min: 0.4 } },
            { id: 'd', src: 'g', in: 2, out: 2.8, at: 3, speed: 1, transition_in: { kind: 'whip', dur: 0.28 } },
          ],
        },
      ],
      audio: [],
      overlays: [],
      master: { lufs: -14, true_peak: -1 },
    };
    const ops = [];
    const output = join(dir, 'out.mkv');
    await compose({ edl, ffmpeg, ffprobe, output, dir: join(dir, 'work'), emit: (o) => ops.push(o) });
    const y = await luma(output);
    assert.equal(y.length, 95, 'frame count follows the timeline (ramp keeps the clip length)');
    assert.ok(Math.max(...y.slice(22, 29)) > 120, `dip to white lifts the cut frames (${y.slice(22, 29).map(Math.round)})`);
    assert.ok(Math.abs(y[10] - y[40]) < 4, 'grey away from the transitions');
    const started = ops.find((o) => o.tool === 'speed_ramp' && o.phase === 'start');
    assert.ok(started && ops.some((o) => o.id === started.id && o.phase === 'end' && o.ok), 'ramp interpolated with minterpolate');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('director keys render through the float camera on a 9:16 canvas', { timeout: 120000 }, async (t) => {
  try {
    await command(ffmpeg, ['-version']);
  } catch (e) {
    if (process.env.KIMO_BENCH_REQUIRE_FFMPEG) throw e;
    return t.skip('FFmpeg unavailable');
  }
  const dir = await mkdtemp(join(tmpdir(), 'kimo-camera-director-'));
  try {
    const path = await src(dir, 'talk', 'testsrc2=d=4', 25, 4);
    const edl = {
      edl_version: 1,
      canvas: { w: 36, h: 64, fps: 25 },
      sources: [{ id: 's', path, kind: 'video', w: W, h: H, fps: 25 }],
      video: [{ track: 'V1', clips: [{ id: 'c0', src: 's', in: 0, out: 1.2, at: 0, speed: 1 }, { id: 'c1', src: 's', in: 2, out: 3.6, at: 1.2, speed: 1 }] }],
      audio: [],
      overlays: [],
      master: { lufs: -14, true_peak: -1 },
    };
    const { report } = directCamera(edl, { energy: 5 });
    assert.deepEqual(motionAcrossCuts(edl), []);
    assert.notEqual(edl.video[0].clips[0].camera[0].zoom, edl.video[0].clips[1].camera[0].zoom, 'framing changes at the jump cut');
    assert.equal(report.repeats_at_jumps, 0);
    const output = join(dir, 'out.mkv');
    await compose({ edl, ffmpeg, ffprobe, output, dir: join(dir, 'work') });
    assert.equal((await luma(output, 36, 64)).length, 70);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
