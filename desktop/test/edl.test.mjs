import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromKimoProject,
  validate,
  framePlan,
  applyEdits,
  toKimoProject,
  toTimeline,
  curveValue,
} from '../edl.mjs';
const project = () => ({
  width: 192,
  height: 128,
  fps: 29.97,
  assets: {
    s1: {
      path: 'C:\\media\\one.mp4',
      width: 192,
      height: 128,
      fps: 29.97,
      duration: 10,
    },
  },
  tracks: [
    {
      id: 'V1',
      clips: [
        {
          id: 'c1',
          source: { type: 'media', asset: 's1' },
          start: 0,
          duration: 2,
          in_point: 1,
          speed: 1,
          props: {
            scale: {
              base: 1,
              keys: [
                { t: 0, v: 1, ease: 'cubic' },
                { t: 1, v: 1.2 },
              ],
            },
          },
          audio: { volume: { base: 0.5 } },
        },
      ],
    },
  ],
});
test('native conversion retains rational rate, camera and linked sound; edits resume the planner', () => {
  const p = project(),
    edl = fromKimoProject(p);
  assert.equal(edl.edl_version, 1);
  assert.equal(edl.canvas.fps, '30000/1001');
  assert.equal(edl.video[0].clips[0].camera.find((k) => k.t === 1).zoom, 1.2);
  assert.equal(edl.sources[0].path, 'C:/media/one.mp4');
  const changed = applyEdits(edl, [
    { tool: 'move_clip', args: { clip_id: 'c1', start: 0.5 } },
    { tool: 'trim_clip', args: { clip_id: 'c1', in_point: 2, duration: 1 } },
  ]);
  assert.equal(changed.audio[0].clips[0].at, 0.5);
  assert.equal(changed.audio[0].clips[0].out, 3);
  assert.equal(toKimoProject(changed).tracks[0].clips[0].in_point, 2);
  assert.equal(toTimeline(changed).tracks_bottom_to_top[0].clips[0].end, 1.5);
  assert.equal(p.tracks[0].clips[0].in_point, 1);
});
test('validator reports exact range, unknown asset, overlap and zero-duration locations', () => {
  const e = fromKimoProject(project());
  const bad = (edit, re) => {
    const copy = structuredClone(e);
    edit(copy);
    assert.throws(() => validate(copy), re);
  };
  bad((e) => (e.video[0].clips[0].src = 'missing'), /unknown asset missing/);
  bad((e) => (e.video[0].clips[0].out = 100), /exceeds source duration/);
  bad((e) => (e.video[0].clips[0].out = 1), /duration must be > 0/);
  bad(
    (e) =>
      e.video[0].clips.push({ ...e.video[0].clips[0], id: 'other', at: 1 }),
    /overlap/,
  );
});
test('unmapped properties produce warning ops rather than disappearing', () => {
  const p = project(),
    ops = [];
  p.tracks[0].clips[0].unknown_effect = { strength: 1 };
  const e = fromKimoProject(p, [], { emit: (o) => ops.push(o) });
  assert.match(e.warnings[0], /V1.c1.unknown_effect/);
  assert.equal(ops[0].tool, 'edl_warning');
  assert.deepEqual(e.video[0].clips[0].native.unknown_effect, { strength: 1 });
});
test('source indices follow the global output grid, including non-frame-aligned cuts and slow motion', () => {
  const c = { at: 0.013, in: 0.07, out: 0.57, speed: 0.5 },
    p = framePlan(c, { fps: 25 }, '30000/1001');
  assert.equal(p.start, 1);
  assert.deepEqual(
    p.indices,
    p.indices.map((_, i) =>
      Math.round(((i + 1) / (30000 / 1001) - 0.013) * 0.5 * 25 + 0.07 * 25),
    ),
  );
  assert.equal(
    curveValue(
      {
        keys: [
          { t: 0, v: 0, ease: 'cubic' },
          { t: 1, v: 1 },
        ],
      },
      0.5,
    ),
    0.5,
  );
});
test('native Bezier punch expressions survive conversion, including zero-duration constant punches', () => {
  const p = project();
  p.tracks[0].clips[0].props.scale = {
    base: 1,
    keys: [],
    expr: [
      { op: 'bezier', from: 1, to: 1.15, t0: 0, duration: 0, combine: 'mul' },
    ],
  };
  const edl = fromKimoProject(p);
  assert.equal(edl.video[0].clips[0].camera[0].zoom, 1.15);
  assert.ok(!edl.warnings.length);
  assert.ok(
    Math.abs(
      curveValue(
        {
          base: 1,
          expr: [
            {
              op: 'bezier',
              from: 1,
              to: 1.2,
              t0: 0,
              duration: 1,
              x1: 0.65,
              y1: 0,
              x2: 0.35,
              y2: 1,
              combine: 'mul',
            },
          ],
        },
        0.5,
      ) - 1.1,
    ) < 0.00001,
  );
});

test('slow motion at source EOF holds the final real frame', () => {
  const p = framePlan(
    { at: 0, in: 0, out: 1, speed: 0.5 },
    { fps: 25, duration: 1 },
    25,
  );
  assert.equal(p.indices.at(-1), 24);
  assert.ok(p.indices.every((n) => n < 25));
});

test('native transform sampling preserves independent curves and translation under zoom', () => {
  const p = project(),
    clip = p.tracks[0].clips[0];
  clip.props.x = {
    base: 0,
    keys: [
      { t: 0, v: 0, ease: 'linear' },
      { t: 1, v: 8 },
    ],
  };
  clip.props.y = { base: 12 };
  const e = fromKimoProject(p),
    camera = e.video[0].clips[0].camera;
  const atOne = camera.find((k) => k.t === 1);
  assert.ok(Math.abs(atOne.x - (0.5 - 8 / (192 * 1.2))) < 1e-10);
  assert.ok(Math.abs(atOne.y - (0.5 - 12 / (128 * 1.2))) < 1e-10);
  const sample = camera.find((k) => k.t > 0 && k.t < 1),
    t = sample.t;
  const z = 1 + 0.2 * t * t * (3 - 2 * t);
  assert.ok(Math.abs(sample.zoom - z) < 1e-10);
  assert.ok(Math.abs(sample.x - (0.5 - (8 * t) / (192 * z))) < 1e-10);
  assert.equal(
    sample.ease,
    'linear',
    'dense EDL samples must not ease the native curve twice',
  );
});
