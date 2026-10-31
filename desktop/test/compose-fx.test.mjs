import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './bench/io.mjs';
import { toolPaths } from './bench/run.mjs';
import { compose } from '../compose.mjs';
import {
  planTransitions,
  transitionEnvelope,
  maskExpression,
  frameRanges,
} from '../compose-fx.mjs';
import { validate } from '../edl.mjs';

const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;
const W = 64,
  H = 64,
  FPS = 25;

async function solid(dir, name, colour, seconds = 2) {
  const path = join(dir, `${name}.mkv`);
  await command(ffmpeg, [
    '-v', 'error', '-y', '-f', 'lavfi', '-i',
    `color=c=${colour}:s=${W}x${H}:r=${FPS}`,
    '-t', String(seconds), '-c:v', 'ffv1', '-pix_fmt', 'yuv444p', path,
  ]);
  return path;
}
async function lumaPerFrame(path) {
  const raw = (
    await command(ffmpeg, [
      '-v', 'error', '-i', path, '-an', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1',
    ])
  ).stdout;
  const size = W * H,
    out = [];
  for (let o = 0; o + size <= raw.length; o += size) {
    let sum = 0;
    for (let i = o; i < o + size; i++) sum += raw[i];
    out.push(sum / size);
  }
  return { raw, out };
}
const base = (sources, clips, extra = {}) => ({
  edl_version: 1,
  canvas: { w: W, h: H, fps: FPS, bg: 'black' },
  sources,
  video: [{ track: 'V1', clips }],
  overlays: [],
  audio: [],
  master: { lufs: -14, true_peak: -1 },
  ...extra,
});

test('transitions split across the cut and shape the envelope', () => {
  const edl = base(
    [{ id: 's', path: 'x' }],
    [
      { id: 'a', src: 's', in: 0, out: 1, at: 0 },
      { id: 'b', src: 's', in: 0, out: 1, at: 1, transition_in: { kind: 'dip', dur: 0.4 } },
      { id: 'c', src: 's', in: 0, out: 1, at: 2.5, transition_in: { type: 'zoom', duration: 0.2 } },
      { id: 'd', src: 's', in: 0, out: 1, at: 3.5, transition_in: { kind: 'morph', dur: 0.2 } },
    ],
  );
  const warnings = planTransitions(edl, FPS);
  const [a, b, c, d] = edl.video[0].clips;
  assert.deepEqual(a._fx.out, { kind: 'dip', d: 0.2 });
  assert.deepEqual(b._fx.in, { kind: 'dip', d: 0.2 });
  assert.deepEqual(c._fx.in, { kind: 'zoom', d: 0.2 }, 'gap before: whole duration on incoming');
  assert.equal(d._fx.in.kind, 'dip');
  assert.match(warnings.join(), /morph/);
  assert.equal(transitionEnvelope(b._fx, 0, 1).alpha, 0);
  assert.equal(transitionEnvelope(b._fx, 0.5, 1).alpha, 1);
  assert.equal(transitionEnvelope(a._fx, 1, 1).alpha, 0);
  assert.ok(transitionEnvelope(c._fx, 0, 1).zoom > 1.29);
  assert.equal(transitionEnvelope(c._fx, 0.3, 1).zoom, 1);
  const whip = { in: { kind: 'whip', d: 0.2 } };
  assert.ok(transitionEnvelope(whip, 0, 1).blur > 0.9);
  assert.ok(transitionEnvelope(whip, 0, 1).dx < 0);
  assert.equal(frameRanges([1, 0.5, 0.5, 1, 0.2], (v) => v < 1), 'between(n,1,2)+between(n,4,4)');
  assert.equal(frameRanges([1, 1], (v) => v < 1), null);
});

test('validator reports bad transitions, masks, ducks and master values', () => {
  const ok = () =>
    base(
      [{ id: 's', path: 'x' }],
      [{ id: 'a', src: 's', in: 0, out: 1, at: 0 }],
    );
  const bad = (mutate, pattern) => {
    const e = ok();
    mutate(e);
    assert.throws(() => validate(e), pattern);
  };
  bad((e) => (e.video[0].clips[0].transition_in = { kind: 'spin', dur: 0.2 }), /transition_in.*unknown transition spin/);
  bad((e) => (e.video[0].clips[0].transition_in = { kind: 'dip', dur: -1 }), /transition_in.*dur/);
  bad((e) => (e.video[0].clips[0].mask = { shape: 'ellipse', w: -1 }), /mask/);
  bad((e) => (e.video[0].clips[0].opacity = 2), /opacity/);
  bad((e) => (e.master.lufs = 'loud'), /master\.lufs/);
  bad(
    (e) =>
      e.audio.push({
        track: 'MUSIC',
        clips: [{ id: 'm', asset: 'm.wav', at: 0, dur: 1, duck: { under: 'NOPE' } }],
      }),
    /duck\.under.*NOPE/,
  );
  validate(ok());
});

test('mask expressions cover rect and ellipse centres and corners', () => {
  const canvas = { w: 100, h: 100, fps: 25 };
  assert.match(maskExpression({ shape: 'ellipse', w: 0.5, h: 0.5 }, canvas), /hypot/);
  assert.match(maskExpression({ shape: 'rect', radius: 0.1, invert: true }, canvas), /^255-/);
  assert.equal(maskExpression({ path: 'native-bezier' }, canvas), null);
});

test(
  'dip, whip and zoom transitions and an ellipse B-roll mask render in both strategies',
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-fx-'));
    try {
      const white = await solid(dir, 'white', 'white'),
        grey = await solid(dir, 'grey', 'gray');
      const sources = [
        { id: 'w', path: white },
        { id: 'g', path: grey },
      ];
      const edl = base(sources, [
        { id: 'a', src: 'w', in: 0, out: 1, at: 0 },
        { id: 'b', src: 'g', in: 0, out: 1, at: 1, transition_in: { kind: 'dip', dur: 0.4 } },
        { id: 'c', src: 'w', in: 0, out: 0.6, at: 2, transition_in: { kind: 'whip', dur: 0.24 } },
        { id: 'd', src: 'g', in: 0, out: 0.6, at: 2.6, transition_in: { kind: 'zoom', dur: 0.24 } },
      ]);
      edl.video.push({
        track: 'BROLL',
        clips: [
          {
            id: 'r', src: 'w', in: 0, out: 0.4, at: 3.2,
            mask: { shape: 'ellipse', x: 0.5, y: 0.5, w: 0.5, h: 0.5, feather: 0.02 },
          },
        ],
      });
      // Put the masked B-roll above a black stretch so the shape is measurable.
      edl.video[0].clips.push({ id: 'e', src: 'g', in: 0, out: 0.4, at: 3.2, opacity: 0 });
      const ops = [];
      const a = await compose({
        edl, ffmpeg, ffprobe, output: join(dir, 'a.mkv'), dir: join(dir, 'wa'),
        emit: (e) => ops.push(e),
      });
      const b = await compose({
        edl, ffmpeg, ffprobe, output: join(dir, 'b.mkv'), dir: join(dir, 'wb'), strategy: 'B',
      });
      assert.equal(a.strategy, 'A');
      assert.equal(b.strategy, 'B');
      const A = await lumaPerFrame(a.output),
        B = await lumaPerFrame(b.output);
      assert.equal(A.out.length, 90);
      assert.equal(B.out.length, A.out.length);
      for (let i = 0; i < A.out.length; i++)
        assert.ok(Math.abs(A.out[i] - B.out[i]) < 2, `frame ${i} differs between strategies`);
      // Dip: bright before, dark at the cut (frame 25 = 1.0 s), grey after.
      assert.ok(A.out[15] > 200, 'white before dip');
      assert.ok(A.out[24] < 40 && A.out[25] < 40, 'dip reaches black at the cut');
      assert.ok(Math.abs(A.out[40] - A.out[45]) < 2 && A.out[40] > 90, 'grey settles after dip');
      // Mask: centre lit, corners black on the B-roll frames.
      const size = W * H,
        frame = 3.3 * FPS;
      const px = (x, y) => A.raw[Math.round(frame) * size + y * W + x];
      assert.ok(px(32, 32) > 200, 'mask centre shows B-roll');
      assert.ok(px(1, 1) < 30, 'mask corner is transparent');
      assert.ok(!ops.some((o) => /transition|mask/.test(o.title ?? '') && o.warning));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

