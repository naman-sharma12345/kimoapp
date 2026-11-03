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
  frameCount,
  publicEdl,
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
  bad((e) => (e.canvas.fps = '25/1/garbage'), /canvas.fps/);
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

test('omitted speed consistently means normal playback through validation, planning and timeline', () => {
  const e = fromKimoProject(project());
  delete e.video[0].clips[0].speed;
  validate(e);
  assert.equal(frameCount(e), 60);
  assert.equal(toTimeline(e).tracks_bottom_to_top[0].clips[0].end, 2);
  assert.equal(
    framePlan(e.video[0].clips[0], e.sources[0], e.canvas.fps).indices.length,
    60,
  );
});

test('native title background shapes stay ordered, editable and resumable', () => {
  const p = project();
  p.tracks.push({
    id: 'T',
    clips: [
      {
        id: 'shape',
        source: {
          type: 'shape',
          shape: 'rect',
          width: 120,
          height: 30,
          fill: [0, 0, 0],
          corner_radius: 5,
        },
        start: 0,
        duration: 1,
        props: { y: { base: -20 } },
      },
    ],
  });
  const e = fromKimoProject(p);
  assert.equal(e.overlays[0].props.primitive, 'rect');
  assert.equal(
    toTimeline(e).tracks_bottom_to_top.find((t) => t.track_id === 'T').clips[0]
      .src,
    'generated',
  );
  const changed = applyEdits(e, [
    { tool: 'move_clip', args: { clip_id: 'shape', start: 0.2 } },
  ]);
  assert.equal(toKimoProject(changed).tracks[1].clips[0].source.shape, 'rect');
  assert.equal(toKimoProject(changed).tracks[1].clips[0].start, 0.2);
  assert.throws(
    () =>
      applyEdits(e, [
        { tool: 'edit_caption', args: { clip_id: 'shape', text: 'wrong' } },
      ]),
    /Unsupported EDL edit/,
  );
});

test('timeline IPC preserves editing data without serializing renderer graphs', () => {
  const full = fromKimoProject(project()),
    view = publicEdl(full);
  assert.deepEqual(toTimeline(view), toTimeline(full));
  assert.ok(JSON.stringify(view).length < JSON.stringify(full).length / 4);
  const before = full.video[0].clips[0].at;
  view.video[0].clips[0].at = 7;
  assert.equal(full.video[0].clips[0].at, before);
  assert.equal(view.native_project, undefined);
});

test('native transitions map to EDL kinds and audio tracks get VOICE/MUSIC/SFX roles with a music duck', async () => {
  const { nativeTransition, assignAudioRoles } = await import('../edl.mjs');
  const reported = [];
  assert.deepEqual(nativeTransition({ type: 'Cross Dissolve', duration: 0.3 }), { kind: 'morph', dur: 0.3 });
  assert.deepEqual(nativeTransition({ kind: 'whip', dur: 0.2 }), { kind: 'whip', dur: 0.2 });
  assert.equal(nativeTransition({ kind: 'cut' }), null);
  assert.equal(nativeTransition({ kind: 'spiral', dur: 1 }, (v) => reported.push(v)), null);
  assert.equal(reported.length, 1);
  const audio = assignAudioRoles([
    { track: 't1', clips: [{ id: 'a:audio', linked: 'a', in: 0, out: 5, at: 0 }] },
    { track: 't2', name: 'Music', clips: [{ id: 'm', in: 0, out: 30, at: 0, native_audio: {} }] },
    { track: 't3', clips: [{ id: 'w', in: 0, out: 0.4, at: 2 }] },
    { track: 't4', clips: [{ id: 'm2', in: 0, out: 20, at: 0, native_audio: { volume: { keys: [{ t: 0, v: 0.2 }] } } }] },
  ]);
  assert.deepEqual(audio.map((t) => t.role), ['VOICE', 'MUSIC', 'SFX', 'MUSIC']);
  assert.equal(audio[1].clips[0].duck.under, 'VOICE');
  assert.equal(audio[3].clips[0].duck, undefined, 'planner-written envelope is respected');
});

test('framePlan(): the fast arithmetic path survives floating-point rounding noise across realistic multi-clip timeline offsets', () => {
  // Regression for the framePlan() fast-path bug: every output frame's source
  // index used to be rounded independently (division, then multiplication,
  // then Math.round(), freshly per frame) instead of incrementally. When a
  // clip's rate (speed * sourceFps / canvasFps) is an integer -- the common
  // case of the same fps on both sides at speed 1 -- the true index sequence
  // is mathematically an exact arithmetic progression, but per-frame float
  // noise (~1e-13) used to flip Math.round() across frames whenever the cut
  // point's ideal fractional offset sat within that noise of exactly .5 (a
  // half-source-frame boundary relative to the canvas grid). That silently
  // disqualified the clip from compose()'s single-ffmpeg direct-read path
  // and routed it through the much slower per-frame JS compositor -- on a
  // real benchmark this was measured as 74% of total export time.
  const source = { fps: 30, kind: 'video', frames: 1_000_000 };
  // Six clips at realistic timeline positions (whole seconds plus one odd,
  // non-frame-aligned start), each with its source cut point intentionally
  // misaligned by exactly half a source frame relative to its own `at` --
  // a perfectly ordinary, perfectly contiguous 1:1 mapping that floating
  // point must round the SAME way for every single frame.
  const starts = [0, 20.0, 40.0, 60.0, 80.0, 100.0, 33.366];
  for (const at of starts) {
    const inPoint = at + 0.5 / 30;
    const plan = framePlan(
      { at, in: inPoint, out: inPoint + 20 },
      source,
      30,
      0,
      Infinity,
    );
    assert.equal(plan.indices.length, 600, `clip at ${at}: expected 600 frames`);
    assert.equal(plan.stride, 1, `clip at ${at}: expected stride 1`);
    assert.equal(
      plan.arithmetic,
      true,
      `clip at ${at}: a same-fps, speed-1 clip must take the fast direct-read path`,
    );
  }
  // The exact case found while investigating the bug: two timeline positions
  // whose difference, scaled by fps, lands within float noise of a half
  // integer (70.727 - 41.377 = 29.35; 29.35 * 30 = 880.5 exactly).
  const found = framePlan(
    { at: 70.727, in: 41.377, out: 61.377 },
    source,
    30,
    0,
    Infinity,
  );
  assert.equal(found.arithmetic, true);
  assert.equal(found.stride, 1);
});

test('framePlan(): a clean N:1 source/canvas rate (e.g. 60fps on a 30fps canvas) still takes the fast path with the right stride', () => {
  const source = { fps: 60, kind: 'video', frames: 1_000_000 };
  const plan = framePlan({ at: 0, in: 0, out: 20 }, source, 30, 0, Infinity);
  assert.equal(plan.stride, 2);
  assert.equal(plan.arithmetic, true);
  assert.deepEqual(plan.indices.slice(0, 5), [0, 2, 4, 6, 8]);
});

test('framePlan(): genuinely non-contiguous plans still take the slow path -- speed ramps', () => {
  const source = { fps: 30, kind: 'video', frames: 1_000_000 };
  const plan = framePlan(
    { at: 0, in: 0, out: 20, ramp: { at: 5, dur: 5, min: 0.2 } },
    source,
    30,
    0,
    Infinity,
  );
  assert.equal(
    plan.arithmetic,
    false,
    'a speed ramp is non-linear by construction and must not be fast-pathed',
  );
});

test('framePlan(): genuinely non-contiguous plans still take the slow path -- an fps conversion that does not divide evenly (24fps source on a 30fps canvas)', () => {
  const source = { fps: 24, kind: 'video', frames: 1_000_000 };
  const plan = framePlan({ at: 0, in: 0, out: 20 }, source, 30, 0, Infinity);
  assert.equal(
    plan.arithmetic,
    false,
    '24fps on 30fps must duplicate frames unevenly, never a single constant stride',
  );
  // Frame-exact against the oracle formula used throughout the rest of the
  // suite (the same math compose.mjs's own callers and tests rely on) --
  // the fix must not change what a genuinely non-arithmetic plan produces.
  const expected = plan.indices.map((_, i) =>
    Math.min(
      source.frames - 1,
      Math.round((i / 30 - 0) * 1 * 24 + 0 * 24),
    ),
  );
  assert.deepEqual(plan.indices, expected);
});

test('framePlan(): genuinely non-contiguous plans still take the slow path -- slow motion (0.5x) duplicates frames', () => {
  const source = { fps: 30, kind: 'video', frames: 1_000_000 };
  const plan = framePlan(
    { at: 0, in: 0, out: 10, speed: 0.5 },
    source,
    30,
    0,
    Infinity,
  );
  assert.equal(plan.arithmetic, false);
  assert.ok(
    plan.indices.some((n, i) => i > 0 && n === plan.indices[i - 1]),
    'slow motion must repeat at least one source frame',
  );
});

test('framePlan(): a clean 2x speed-up (even frame drop) is frame-exact to the independent per-frame oracle and may take the fast path', () => {
  const source = { fps: 30, kind: 'video', frames: 1_000_000 };
  const plan = framePlan(
    { at: 0, in: 0, out: 40, speed: 2 },
    source,
    30,
    0,
    Infinity,
  );
  assert.equal(plan.stride, 2);
  const expected = plan.indices.map((_, i) =>
    Math.round((i / 30 - 0) * 2 * 30 + 0 * 30),
  );
  assert.deepEqual(
    plan.indices,
    expected,
    'whatever the fast path produces must be frame-exact to the slow-path formula',
  );
});
