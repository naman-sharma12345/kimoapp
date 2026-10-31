import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EASINGS,
  easeFn,
  logZoom,
  softClamp,
  cameraSampler,
  cameraRect,
  coverGeometry,
  zoomCap,
  frameFor,
  headInCrop,
  FRAMINGS,
  CENTRE_HEAD,
  directCamera,
  motionAcrossCuts,
  cameraMetrics,
  speakerShots,
  springFollow,
  perlin1,
  clipCameraAt,
  cameraToolCall,
  normalizeOverrides,
} from '../camera.mjs';
import { activeRegions, headTrackFromFrames } from '../camera-probe.mjs';
import { rampOffset, framePlan, validate } from '../edl.mjs';
import { transitionEnvelope } from '../compose-fx.mjs';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('easing curves: endpoints, monotonic, zero derivative at both ends for in-out', () => {
  for (const name of ['linear', 'sine', 'cubic', 'expo_out', 'expo_in', 'spring']) {
    const f = EASINGS[name];
    assert.ok(near(f(0), 0), `${name}(0)`);
    assert.ok(near(f(1), 1), `${name}(1)`);
    let prev = -1e-12;
    for (let i = 0; i <= 1000; i++) {
      const v = f(i / 1000);
      assert.ok(v >= prev - 1e-12, `${name} monotonic at ${i}`);
      prev = v;
    }
  }
  const h = 1e-5;
  for (const name of ['sine', 'cubic']) {
    const f = EASINGS[name];
    assert.ok(f(h) / h < 1e-3, `${name} starts with zero velocity`);
    assert.ok((1 - f(1 - h)) / h < 1e-3, `${name} ends with zero velocity`);
  }
  assert.ok(EASINGS.spring(1e-4) / 1e-4 < 0.01, 'spring starts at rest');
  // back-out overshoots: graphics only, the camera maps it to a non-overshooting ease
  assert.ok(Math.max(...Array.from({ length: 101 }, (_, i) => EASINGS.back_out(i / 100))) > 1);
  assert.ok(Math.max(...Array.from({ length: 101 }, (_, i) => easeFn('out_back')(i / 100))) <= 1 + 1e-9);
  assert.equal(easeFn('hold')(0.7), 0);
});

test('zoom interpolates in log space', () => {
  assert.ok(near(logZoom(1, 1.21, 0.5), 1.1), 'geometric midpoint');
  const s = cameraSampler([
    { t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'linear' },
    { t: 1, x: 0.5, y: 0.5, zoom: 1.44 },
  ]);
  assert.ok(near(s(0.5).zoom, 1.2, 1e-9));
  // constant ratio per step = constant perceived speed
  const r1 = s(0.25).zoom / s(0).zoom;
  const r2 = s(1).zoom / s(0.75).zoom;
  assert.ok(near(r1, r2, 1e-9));
});

test('soft clamp: identity inside, C1 at the band edge, never past the wall', () => {
  assert.equal(softClamp(50, 0, 100, 2), 50);
  assert.ok(softClamp(-500, 0, 100, 2) >= 0);
  assert.ok(softClamp(600, 0, 100, 2) <= 100);
  assert.ok(softClamp(101, 0, 100, 2) < 100);
  const d = (v) => (softClamp(v + 1e-4, 0, 100, 2) - softClamp(v - 1e-4, 0, 100, 2)) / 2e-4;
  assert.ok(near(d(2), 1, 1e-3), 'slope 1 entering the band');
  assert.ok(d(-1) > 0 && d(-1) < 1, 'decelerates inside the band');
  for (let v = -10; v < 10; v += 0.01) assert.ok(softClamp(v + 0.01, 0, 100, 2) >= softClamp(v, 0, 100, 2));
  // rects stay inside the source even when the key asks for the far edge
  const geom = coverGeometry({ w: 1920, h: 1080 }, { w: 1080, h: 1920 });
  const r = cameraRect({ x: 0, y: 0.5, zoom: 1.2 }, geom, { w: 1080, h: 1920 });
  assert.ok(r[0] > 0 && r[0] + r[2] <= 1920);
});

test('upscale cap: 1080p punches stop at 0.75x output, 4K reaches 2x, low-res fits keep a 1.25 floor', () => {
  const canvas = { w: 1920, h: 1080 };
  assert.ok(near(zoomCap(coverGeometry({ w: 1920, h: 1080 }, canvas), canvas), 4 / 3, 1e-9));
  assert.equal(zoomCap(coverGeometry({ w: 3840, h: 2160 }, canvas), canvas), 2);
  assert.equal(zoomCap(coverGeometry({ w: 1280, h: 720 }, canvas), canvas), 1.25);
  assert.equal(zoomCap(coverGeometry({ w: 1920, h: 1080 }, { w: 1080, h: 1920 }), { w: 1080, h: 1920 }), 1.25);
  const g = coverGeometry({ w: 1920, h: 1080 }, canvas);
  const r = cameraRect({ x: 0.5, y: 0.5, zoom: 1.6 }, g, canvas);
  assert.ok(r[2] >= 0.75 * canvas.w - 1e-6, 'crop never below 75% of the output width');
  const s = frameFor('extreme', CENTRE_HEAD, g, { cap: zoomCap(g, canvas) });
  assert.ok(s.capped && s.zoom <= 4 / 3 + 1e-9);
});

test('framing vocabulary: eye lines, hairline kept at medium, chin kept at tight, look room', () => {
  const canvas = { w: 1920, h: 1080 };
  const geom = coverGeometry({ w: 3840, h: 2160 }, canvas);
  const head = { cx: 0.5, eyes: 0.36, top: 0.22, chin: 0.5, gaze: 0 };
  for (const name of ['medium', 'tight', 'extreme']) {
    const s = frameFor(name, head, geom, { cap: 2 });
    const r = cameraRect(s, geom, canvas, { cap: 2 });
    const eyes = (head.eyes * geom.H - r[1]) / r[3];
    const [lo, hi] = FRAMINGS[name].eyesRange;
    assert.ok(eyes >= Math.min(lo, 0.28) - 0.01 && eyes <= hi + 0.06, `${name} eyes at ${eyes}`);
    assert.ok(eyes >= 0.28 - 1e-6, `${name}: eyes never above 28 %`);
    assert.ok(head.chin * geom.H <= r[1] + r[3], `${name}: chin in frame`);
    if (name === 'medium') assert.ok(r[1] <= head.top * geom.H, 'medium keeps the hairline');
    assert.ok(headInCrop(r, head, geom), `${name}: head inside the crop`);
  }
  const right = frameFor('medium', { ...head, gaze: 1 }, geom, { cap: 2 });
  const centred = frameFor('medium', head, geom, { cap: 2 });
  assert.ok(right.x > centred.x, 'looking right leaves room on the right (face on the left third)');
});

// --- director fixtures -----------------------------------------------------
const W = (text, t0, step = 0.3, speaker) =>
  text.split(' ').map((w, i) => ({ w, start: +(t0 + i * step).toFixed(3), end: +(t0 + i * step + step * 0.8).toFixed(3), ...(speaker ? { speaker } : {}) }));
function talkingEdl({ segs, canvas = { w: 1080, h: 1920, fps: 25 }, src = { w: 3840, h: 2160 }, broll } = {}) {
  let at = 0;
  const clips = segs.map(([a, b], i) => {
    const c = { id: `cut${i}`, src: 's', in: a, out: b, at: +at.toFixed(4), speed: 1 };
    at += b - a;
    return c;
  });
  return {
    edl_version: 1,
    canvas,
    sources: [{ id: 's', path: 'C:/talk.mp4', kind: 'video', fps: 25, duration: 120, ...src }, ...(broll ? [{ id: 'b', path: 'C:/broll.mp4', kind: 'video', fps: 25, duration: 10, w: 1920, h: 1080 }] : [])],
    video: [{ track: 'V1', clips }, ...(broll ? [{ track: 'V2', clips: broll }] : [])],
    audio: broll ? [{ track: 'A1', role: 'VOICE', clips: broll.map((b) => ({ id: `${b.id}:audio`, linked: b.id, src: 'b', in: b.in, out: b.out, at: b.at, speed: 1 })) }] : [],
    overlays: [],
    master: { lufs: -14, true_peak: -1 },
    cut_plan: { keep: clips.map((c) => ({ clip_id: c.id })) },
  };
}

test('director: framing changes at every jump cut, no repeats, no motion across cuts', () => {
  for (const energy of [5, 3, 2]) {
    const segs = Array.from({ length: 10 }, (_, i) => [i * 4, i * 4 + 2.2]);
    const edl = talkingEdl({ segs });
    const { report } = directCamera(edl, { energy });
    assert.equal(report.repeats_at_jumps, 0, `energy ${energy}`);
    const names = edl.video[0].clips.map((c) => c.camera_framing[0]);
    for (let i = 1; i < names.length; i++) assert.notEqual(names[i], names[i - 1], `energy ${energy} cut ${i}: ${names}`);
    assert.deepEqual(motionAcrossCuts(edl), [], `energy ${energy}`);
    assert.ok(report.metrics.framing_variety_30s >= (energy === 5 ? 3 : 2), `variety ${report.metrics.framing_variety_30s}`);
    validate(edl);
  }
});

test('director: emphasis push lands on the word onset, snap punch on numbers at energy 5', () => {
  const edl = talkingEdl({ segs: [[0, 6]], canvas: { w: 1920, h: 1080, fps: 25 } });
  const words = { 'C:/talk.mp4': W('this camera costs three hundred dollars and that is wild', 0.2, 0.5) };
  const emphasis = [{ path: 'C:/talk.mp4', t: 1.7, kind: 'claim' }];
  directCamera(edl, { energy: 3, words, emphasis });
  const keys = edl.video[0].clips[0].camera;
  const land = keys.find((k) => near(k.t, 1.7, 1e-3));
  assert.ok(land, JSON.stringify(keys));
  const startKey = keys[keys.indexOf(land) - 1];
  assert.ok(land.t - startKey.t >= 0.6 - 1e-6 && land.t - startKey.t <= 1.2 + 1e-6, 'push starts 0.6-1.2 s before');
  assert.ok(land.zoom > startKey.zoom + 0.05 && startKey.ease === 'cubic');
  const e5 = talkingEdl({ segs: [[0, 6]], canvas: { w: 1920, h: 1080, fps: 25 } });
  directCamera(e5, { energy: 5, words, emphasis: [{ path: 'C:/talk.mp4', t: 1.7, kind: 'number' }] });
  const k5 = e5.video[0].clips[0].camera;
  const snapEnd = k5.find((k) => near(k.t, 1.7, 1e-3));
  const snapStart = k5[k5.indexOf(snapEnd) - 1];
  assert.equal(snapStart.ease, 'expo_out');
  const frames = Math.round((snapEnd.t - snapStart.t) * 25);
  assert.ok(frames >= 4 && frames <= 6, `snap over ${frames} frames`);
});

test('director: static-span budget inserts a move at a clause boundary', () => {
  const edl = talkingEdl({ segs: [[0, 14]], canvas: { w: 1920, h: 1080, fps: 25 } });
  const words = { 'C:/talk.mp4': W('we started small, and then we grew the team but nobody expected what came next so we kept going and going for years', 0.1, 0.5) };
  const { report } = directCamera(edl, { energy: 3, words, maxStatic: 6 });
  assert.ok(report.metrics.max_static_s <= 6 + 1e-6, `max static ${report.metrics.max_static_s}`);
  assert.ok(report.budget_inserts >= 1);
  const shorts = talkingEdl({ segs: [[0, 14]] });
  const r5 = directCamera(shorts, { energy: 5, words, maxStatic: 3 }).report;
  assert.ok(r5.metrics.max_static_s <= 3 + 1e-6, `shorts max static ${r5.metrics.max_static_s}`);
  assert.deepEqual(motionAcrossCuts(shorts), []);
});

test('director: section openers after b-roll go wide, b-roll entry/exit gets J/L-cuts', () => {
  const broll = [{ id: 'br1', src: 'b', in: 2, out: 4, at: 1, speed: 1 }];
  const edl = talkingEdl({ segs: [[0, 8]], broll, canvas: { w: 1920, h: 1080, fps: 25 } });
  const { report } = directCamera(edl, { energy: 5 });
  const c = edl.video[0].clips[0];
  assert.ok(c.camera_framing.length >= 2 && c.camera_framing[1] === 'wide', JSON.stringify(c.camera_framing));
  const step = c.camera.find((k) => near(k.t, 3, 1e-3));
  assert.ok(step && step.zoom === 1, 'wide from the frame b-roll ends');
  assert.equal(report.jl, 1);
  const a = edl.audio[0].clips[0];
  assert.ok(near(a.at, 1 - 8 / 25, 1e-3) && near(a.out, 4 + 8 / 25, 1e-3), JSON.stringify(a));
  assert.ok(a.fade_in > 0.2 && a.fade_out > 0.2);
});

test('director: podcast speaker framing (single after 1.2 s, two-shot on overlap, ≥1.5 s shots, anticipated)', () => {
  const words = [...W('so what do you think about this whole thing', 0, 0.3, 'S1'), ...W('honestly I think it is overrated and here is why', 2.8, 0.3, 'S2')];
  const shots = speakerShots(words, 6, 25);
  assert.equal(shots[0].speaker, 'S1');
  const s2 = shots.find((s) => s.speaker === 'S2');
  assert.ok(s2 && near(s2.t, 2.8 - 4 / 25, 1e-6), JSON.stringify(shots));
  for (let i = 1; i < shots.length; i++) assert.ok(shots[i].t - shots[i - 1].t >= 1.5);
  const overlap = speakerShots([...W('one two three four five six', 0, 0.3, 'S1'), ...W('wait no that is wrong though', 1.6, 0.3, 'S2')], 5, 25);
  assert.ok(overlap.some((s) => s.speaker === null) || overlap.length <= 2, JSON.stringify(overlap));
  const edl = talkingEdl({ segs: [[0, 6]], canvas: { w: 1920, h: 1080, fps: 25 } });
  const { report } = directCamera(edl, { energy: 3, podcast: true, words: { 'C:/talk.mp4': words } });
  assert.ok(report.speaker_shots >= 2, JSON.stringify(edl.video[0].clips[0].camera));
  const keys = edl.video[0].clips[0].camera;
  assert.ok(keys[0].x < 0.5 && keys.some((k) => k.x > 0.5), 'S1 left single, then S2 right single');
});

test('director: screen-recording clips punch in on the active region', () => {
  const edl = talkingEdl({ segs: [[0, 5]], canvas: { w: 1920, h: 1080, fps: 30 }, src: { w: 1920, h: 1080 } });
  edl.cut_plan.screen_punch = [{ clip_id: 'cut0' }];
  const regions = { cut0: [{ t0: 1, t1: 3, box: { x: 0.6, y: 0.1, w: 0.2, h: 0.15 } }] };
  const { report } = directCamera(edl, { energy: 3, screenRegions: regions });
  assert.equal(report.screen_punches, 1);
  const keys = edl.video[0].clips[0].camera;
  const punch = keys.find((k) => k.zoom > 1.2);
  assert.ok(punch && punch.x > 0.6 && punch.y < 0.3, JSON.stringify(keys));
  assert.deepEqual(motionAcrossCuts(edl), []);
});

test('9:16 from 16:9 follows the subject with a gimbal path; micro drift stays sub-half-pixel', () => {
  const edl = talkingEdl({ segs: [[0, 6]], src: { w: 1920, h: 1080 } });
  const cx = Array.from({ length: 13 }, (_, i) => 0.35 + 0.3 * (i >= 6 ? 1 : 0));
  const heads = { s: { fps: 2, cx, eyes: cx.map(() => 0.33), top: cx.map(() => 0.18), chin: cx.map(() => 0.5), gaze: cx.map(() => 0), source: 'sam' } };
  directCamera(edl, { energy: 3, heads });
  const c = edl.video[0].clips[0];
  assert.ok(c.follow?.cx?.length > 100, 'dense follow path');
  const v = c.follow.cx.map((x, i, a) => (i ? Math.abs(x - a[i - 1]) : 0));
  const geom = coverGeometry(edl.sources[0], edl.canvas);
  assert.ok(Math.max(...v) * 25 <= 0.18 * (geom.cw / geom.W) + 1e-3, 'max speed 18 % of crop width per second');
  assert.ok(c.follow.cx.at(-1) > c.follow.cx[0] + 0.05, 'moves with the subject');
  // micro drift: 0.15 % amplitude, 0.2 Hz — high-frequency residual far below 0.5 px at 1080
  const drift = clipCameraAt({ camera: [{ t: 0, x: 0.5, y: 0.5, zoom: 1.1 }], drift: { amp: 0.0015, hz: 0.2, seed: 3 } }, coverGeometry({ w: 1920, h: 1080 }, { w: 1920, h: 1080 }));
  const xs = Array.from({ length: 250 }, (_, n) => drift(n / 25).x * 1920);
  let worst = 0;
  for (let i = 3; i < xs.length - 3; i++) {
    const sg = (-2 * xs[i - 3] + 3 * xs[i - 2] + 6 * xs[i - 1] + 7 * xs[i] + 6 * xs[i + 1] + 3 * xs[i + 2] - 2 * xs[i + 3]) / 21;
    worst = Math.max(worst, Math.abs(xs[i] - sg));
  }
  assert.ok(worst < 0.5, `drift residual ${worst}`);
  assert.ok(Math.abs(perlin1(1.3, 2)) <= 1);
  const smooth = springFollow([0, 0, 0, 1, 1, 1, 1, 1, 1, 1], 10, 8);
  assert.ok(smooth.every((x) => x >= -0.05 && x <= 1.05));
});

test('planner camera tools override the director; speed ramps refuse speech', () => {
  const o = {};
  assert.ok(cameraToolCall(o, 'camera_style', { energy: 2, pattern: 'wide,medium', micro_drift: true }).ok);
  assert.ok(!cameraToolCall(o, 'camera_style', { energy: 9 }).ok);
  assert.ok(cameraToolCall(o, 'camera_hold', { from: 0, to: 3 }).ok);
  assert.ok(cameraToolCall(o, 'transition', { at: 2.2, kind: 'whip' }).ok);
  assert.ok(cameraToolCall(o, 'speed_ramp', { clip: 'br1', at: 0.2, dur: 1, min_speed: 0.4 }).ok);
  assert.ok(cameraToolCall(o, 'speed_ramp', { clip: 'cut0' }).ok);
  const n = normalizeOverrides(o);
  assert.equal(n.style.energy, 2);
  assert.deepEqual(n.style.pattern, ['wide', 'medium']);
  const broll = [{ id: 'br1', src: 'b', in: 2, out: 4, at: 1, speed: 1 }];
  const edl = talkingEdl({ segs: [[0, 2.2], [3, 6]], broll, canvas: { w: 1920, h: 1080, fps: 25 } });
  const words = { 'C:/talk.mp4': W('hello there friend', 0.2, 0.5) };
  const { report } = directCamera(edl, { energy: 5, overrides: o, words });
  assert.equal(edl.video[0].clips[1].transition_in.kind, 'whip');
  assert.ok(edl.markers.some((m) => m.kind === 'whoosh'));
  assert.ok(edl.video[0].clips[0].drift, 'micro drift at energy 2');
  assert.ok(edl.video[1].clips[0].ramp && !edl.audio[0].clips.some((a) => a.linked === 'br1'), 'b-roll ramped and muted');
  assert.ok(!edl.video[0].clips[0].ramp && report.warnings.some((w) => /never speech/.test(w)));
  // hold: the first clip keeps a still camera
  assert.equal(edl.video[0].clips[0].camera.length, 1);
  validate(edl);
});

test('speed ramp frame plan: 1 → min → 1, timeline length kept, less source consumed', () => {
  const ramp = { at: 0.5, dur: 1, min: 0.4 };
  assert.ok(near(rampOffset(ramp, 0.4), 0.4));
  assert.ok(near(rampOffset(ramp, 1.5), 1.5 - 0.6 * 0.5, 1e-9));
  const plan = framePlan({ in: 0, out: 2, at: 0, speed: 1, ramp }, { fps: 50, frames: 100 }, 25);
  assert.equal(plan.indices.length, 50);
  const steps = plan.indices.slice(1).map((v, i) => v - plan.indices[i]);
  assert.ok(steps.every((d) => d >= 0) && Math.min(...steps.slice(15, 35)) < 2 && steps[2] === 2, steps.join(','));
});

test('transitions: zoom-through scales with expo easing on both sides and blurs; dip to white lifts', () => {
  const fx = { in: { kind: 'zoom', d: 0.16 }, out: { kind: 'zoom', d: 0.16 } };
  const atCut = transitionEnvelope(fx, 0, 2);
  const settled = transitionEnvelope(fx, 0.16, 2);
  assert.ok(atCut.zoom > 1.35 && atCut.zblur > 0.9 && settled.zoom === 1);
  const outSide = transitionEnvelope(fx, 2, 2);
  assert.ok(outSide.zoom > 1.35);
  const w = transitionEnvelope({ in: { kind: 'dip', d: 0.4, color: 'white' } }, 0.05, 2);
  assert.ok(w.white > 0.5 && w.alpha === 1);
});

test('probe heuristics: active screen region and motion head track', () => {
  const w = 40;
  const h = 24;
  const frames = Array.from({ length: 9 }, (_, i) => {
    const f = new Uint8Array(w * h).fill(30);
    for (let y = 3; y < 7; y++) for (let x = 28 + (i % 2); x < 33; x++) f[y * w + x] = 220;
    return f;
  });
  const r = activeRegions({ frames, w, h, fps: 4 });
  assert.ok(r.length && r[0].box.x > 0.55 && r[0].box.y < 0.35, JSON.stringify(r));
  const head = Array.from({ length: 13 }, (_, i) => {
    const f = new Uint8Array(w * h).fill(50);
    for (let y = 6; y < 20; y++) for (let x = 8; x < 16; x++) f[y * w + x] = (x + y + i * 7) % 2 ? 200 : 40;
    return f;
  });
  const t = headTrackFromFrames({ frames: head, w, h, fps: 3 });
  assert.ok(t && t.cx[0] > 0.15 && t.cx[0] < 0.45 && t.top[0] < 0.35, JSON.stringify(t));
});

test('camera metrics count repeats at consecutive jump cuts', () => {
  const edl = talkingEdl({ segs: [[0, 2], [3, 5], [6, 8]] });
  edl.video[0].clips.forEach((c) => {
    c.camera = [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }];
    c.camera_framing = ['wide'];
  });
  assert.equal(cameraMetrics(edl).repeats_at_jumps, 2);
});
