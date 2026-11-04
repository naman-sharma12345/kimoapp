import { isCaptionChunk, editCaptionChunk, captionBounds } from './caption-edits.mjs';
import { isExplain, editExplain, deleteExplain } from './explain/edit.mjs';
// App-owned, versioned edit decisions. This module is also safe in the renderer.
const TRANSITION_KINDS = ['cut', 'dip', 'whip', 'zoom', 'morph'];
export function rate(value) {
  if (!/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(String(value)))
    throw new Error(`Invalid frame rate: ${value}`);
  const [n, d = 1] = String(value).split('/').map(Number);
  if (!(n > 0 && d > 0 && Number.isFinite(n / d)))
    throw new Error(`Invalid frame rate: ${value}`);
  return n / d;
}
export function rationalRate(value) {
  const n = rate(value);
  for (const [a, b] of [
    [24000, 1001],
    [30000, 1001],
    [60000, 1001],
  ])
    if (Math.abs(n - a / b) < 0.0006) return `${a}/${b}`;
  return String(value).includes('/') ? String(value) : n;
}
export const duration = (edl) =>
  Math.max(
    0,
    ...edl.video.flatMap((t) =>
      t.clips.map((c) => c.at + (c.out - c.in) / (c.speed ?? 1)),
    ),
    ...edl.overlays.map((o) => o.at + o.dur),
    ...edl.audio.flatMap((t) =>
      t.clips.map((c) => c.at + (c.dur ?? (c.out - c.in) / (c.speed ?? 1))),
    ),
  );
export const frameCount = (edl) =>
  Math.ceil(duration(edl) * rate(edl.canvas.fps) - 1e-7);
export function curveValue(curve, time, fallback = 0, preparedKeys) {
  if (typeof curve === 'number') return curve;
  const keys =
    preparedKeys ??
    (curve?.keys ?? [])
      .map((k) => ({ t: k.t ?? k.time, v: k.v ?? k.value, ease: k.ease }))
      .toSorted((a, b) => a.t - b.t);
  let value = Number(curve?.base ?? fallback);
  if (keys.length && time >= keys[0].t) {
    let lo = 0,
      hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (keys[mid].t > time) hi = mid;
      else lo = mid + 1;
    }
    const index = lo < keys.length ? lo : -1;
    if (index < 0) value = keys.at(-1).v;
    else {
      const a = keys[index - 1],
        b = keys[index];
      let u = (time - a.t) / (b.t - a.t);
      const ease = a.ease ?? 'linear';
      if (ease === 'hold') u = 0;
      else if (/out.*quart/.test(ease)) u = 1 - (1 - u) ** 4;
      else if (ease === 'cubic' || /in_out|smooth/.test(ease))
        u = u * u * (3 - 2 * u);
      else if (/out.*cubic/.test(ease)) u = 1 - (1 - u) ** 3;
      else if (/in.*cubic/.test(ease) && !/out/.test(ease)) u = u ** 3;
      else if (/out_back/.test(ease)) {
        const x = u - 1;
        u = 1 + 2.70158 * x ** 3 + 1.70158 * x * x;
      }
      value = a.v + (b.v - a.v) * u;
    }
  }
  for (const expr of curve?.expr ?? []) {
    if (expr.op !== 'bezier') continue;
    let u =
      expr.duration > 0
        ? Math.max(0, Math.min(1, (time - expr.t0) / expr.duration))
        : time < (expr.t0 ?? 0)
          ? 0
          : 1;
    if (u > 0 && u < 1) {
      const bez = (t, a, b) =>
        3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (bez(mid, expr.x1 ?? 0, expr.x2 ?? 1) < u) lo = mid;
        else hi = mid;
      }
      u = bez((lo + hi) / 2, expr.y1 ?? 0, expr.y2 ?? 1);
    }
    const result = expr.from + (expr.to - expr.from) * u;
    value =
      expr.combine === 'mul'
        ? value * result
        : expr.combine === 'add'
          ? value + result
          : result;
  }
  return value;
}
export function curveSampler(curve, fallback = 0) {
  const keys = (curve?.keys ?? [])
    .map((k) => ({ t: k.t ?? k.time, v: k.v ?? k.value, ease: k.ease }))
    .sort((a, b) => a.t - b.t);
  return (time) => curveValue(curve, time, fallback, keys);
}
/**
 * Speed ramp (Phase 4): clip-local playback rate 1 → min → 1 over
 * [at, at+dur] with a sin² bell. Returns the source seconds consumed (at
 * speed 1) by clip-local time t. The clip keeps its timeline length; a ramp
 * consumes less source than its in/out range allows.
 */
export function rampOffset(ramp, t) {
  if (!ramp || !(ramp.dur > 0) || !(ramp.min > 0 && ramp.min < 1)) return t;
  const a = ramp.at ?? 0;
  const d = ramp.dur;
  const u = Math.max(0, Math.min(1, (t - a) / d));
  // ∫0^u sin²(πv) dv = u/2 − sin(2πu)/(4π)
  const bell = d * (u / 2 - Math.sin(2 * Math.PI * u) / (4 * Math.PI));
  return t - (1 - ramp.min) * bell;
}
// Per-frame source-index rounding was computed independently for every
// output frame (division then multiplication, then Math.round(), freshly
// for each i) instead of incrementally. When the clip's canvas-to-source
// rate (speed * sourceFps / canvasFps) is a whole number -- same fps on
// both sides at speed 1, or a clean N:1 ratio like 60fps on a 30fps canvas
// -- the *true* source index is mathematically an exact arithmetic
// progression: index(i) = index(0) + i*stride, with no rounding ambiguity
// at all once index(0) is fixed. But computing index(i) independently via
// ((start+i)/f - at)*speed*s + in*s means every i takes its own trip
// through floating-point division and multiplication, and when the clip's
// cut point (in/at) happens to land its ideal fractional offset within
// ~1e-13 of exactly .5 -- a half-source-frame boundary relative to the
// canvas grid, which ordinary whole-second or whole-frame cut points on a
// differently-phased timeline hit often -- that per-frame noise crosses the
// rounding boundary on some frames and not others, breaking what should be
// a perfectly constant stride. That silently disqualifies the clip from
// compose()'s single-ffmpeg direct-read path (plan.arithmetic) and routes
// it through the much slower per-frame JS decode/re-encode compositor.
//
// The fix is exact integer math, not a rounding fudge: when the rate is
// (to within float noise) an integer, round only index(0) -- with the
// original, unbiased formula, so it still matches every existing caller
// that reasons about a single sampled frame the same way (e.g. test
// oracles) -- and derive every later index by exact integer addition of
// the stride. That can never produce an inconsistent stride, and it
// changes nothing for any clip whose rate isn't a clean integer ratio
// (speed changes, VFR sources, fps conversions that drop or duplicate
// frames): those still take the original per-frame path untouched, because
// they are genuinely not arithmetic and must not be detected as if they
// were.
const INTEGER_RATE_EPS = 1e-6;
export function framePlan(clip, source, fps, from = 0, to = Infinity) {
  const f = rate(fps),
    s = rate(source.fps || fps),
    speed = clip.speed ?? 1;
  const start = Math.max(from, Math.ceil(clip.at * f - 1e-7));
  const end = Math.min(
    to,
    Math.ceil((clip.at + (clip.out - clip.in) / speed) * f - 1e-7),
  );
  const length = Math.max(0, end - start);
  const bound =
    source.frames > 0
      ? source.frames - 1
      : source.duration > 0
        ? Math.ceil(source.duration * s - 1e-7) - 1
        : Infinity;
  const sampleAt = (i) =>
    (clip.ramp
      ? rampOffset(clip.ramp, (start + i) / f - clip.at)
      : (start + i) / f - clip.at) *
      speed *
      s +
      clip.in * s;
  const rawStride = (speed * s) / f;
  const roundedStride = Math.round(rawStride);
  // Only images (index is always 0), ramps (non-linear by definition) and a
  // genuinely non-integer rate fall back to the original independent
  // per-frame rounding; everything else is built as an exact progression.
  const exact =
    source.kind !== 'image' &&
    !clip.ramp &&
    length > 0 &&
    roundedStride > 0 &&
    Math.abs(rawStride - roundedStride) < INTEGER_RATE_EPS;
  let indices;
  if (exact) {
    const first = Math.min(bound, Math.round(sampleAt(0)));
    indices = Array.from({ length }, (_, i) =>
      Math.min(bound, first + i * roundedStride),
    );
  } else {
    indices = Array.from({ length }, (_, i) =>
      source.kind === 'image' ? 0 : Math.min(bound, Math.round(sampleAt(i))),
    );
  }
  const stride = indices.length > 1 ? indices[1] - indices[0] : 1;
  return {
    start,
    end,
    indices,
    stride,
    arithmetic:
      stride > 0 &&
      indices.every((n, i) => !i || n - indices[i - 1] === stride),
  };
}
export function validate(edl) {
  const fail = (where, message) => {
    throw new Error(`EDL ${where}: ${message}`);
  };
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  if (edl?.edl_version !== 1) fail('edl_version', 'expected 1');
  if (
    !edl.canvas ||
    !Number.isInteger(edl.canvas.w) ||
    !Number.isInteger(edl.canvas.h) ||
    edl.canvas.w < 2 ||
    edl.canvas.h < 2
  )
    fail('canvas', 'positive integer dimensions >=2 required');
  try {
    rate(edl.canvas.fps);
  } catch {
    fail('canvas.fps', 'positive finite rate required');
  }
  for (const key of ['sources', 'video', 'audio', 'overlays'])
    if (!Array.isArray(edl[key])) fail(key, 'array required');
  const sources = new Map();
  for (const [i, s] of edl.sources.entries()) {
    if (typeof s.id !== 'string' || !s.id || sources.has(s.id))
      fail(`sources[${i}].id`, 'unique nonempty id required');
    if (typeof s.path !== 'string' || !s.path)
      fail(`sources[${i}].path`, 'asset path required');
    sources.set(s.id, s);
  }
  const ids = new Set();
  for (const family of ['video', 'audio'])
    for (const [ti, t] of edl[family].entries()) {
      if (!Array.isArray(t.clips))
        fail(`${family}[${ti}].clips`, 'array required');
      let end = -Infinity;
      for (const [ci, c] of [...t.clips]
        .sort((a, b) => a.at - b.at)
        .entries()) {
        const at = `${family}[${ti}].clips[${ci}](${c.id ?? ''})`;
        if (!c.id || ids.has(c.id)) fail(at + '.id', 'unique clip id required');
        ids.add(c.id);
        const s = sources.get(c.src);
        if (
          !s &&
          (family === 'video' || typeof c.asset !== 'string' || !c.asset)
        )
          fail(at + '.src', `unknown asset ${c.src}`);
        if (!finite(c.at) || c.at < 0)
          fail(at + '.at', 'nonnegative time required');
        const speed = c.speed ?? 1;
        if (!finite(speed) || speed <= 0)
          fail(at + '.speed', 'positive speed required');
        if (c.gain_db != null && !finite(c.gain_db))
          fail(at + '.gain_db', 'finite gain required');
        const d = c.dur ?? (c.out - c.in) / speed;
        if (!finite(d) || d <= 0) fail(at, 'duration must be > 0');
        if (
          c.src &&
          (!finite(c.in) || c.in < 0 || !finite(c.out) || c.out <= c.in)
        )
          fail(at, 'in/out must define a positive source range');
        if (
          s?.duration > 0 &&
          s.kind !== 'image' &&
          c.out > s.duration + (1 / rate(s.fps || edl.canvas.fps)) * 0.51
        )
          fail(at + '.out', `exceeds source duration ${s.duration}`);
        if (family === 'video' && c.at < end - 1e-6)
          fail(
            at + '.at',
            'clips overlap on the same track; use a separate layer',
          );
        end = c.at + d;
        if (family === 'video') {
          const tr = c.transition_in;
          if (tr != null) {
            const kind = String(tr.kind ?? tr.type ?? 'cut');
            if (!TRANSITION_KINDS.includes(kind))
              fail(at + '.transition_in', `unknown transition ${kind}`);
            const td = tr.dur ?? tr.duration ?? 0;
            if (!finite(td) || td < 0)
              fail(at + '.transition_in.dur', 'nonnegative seconds required');
          }
          if (
            c.mask != null &&
            c.mask.shape != null &&
            (!['rect', 'ellipse'].includes(c.mask.shape) ||
              ['x', 'y', 'w', 'h', 'radius', 'feather'].some(
                (k) =>
                  c.mask[k] != null && (!finite(c.mask[k]) || (k !== 'x' && k !== 'y' && c.mask[k] < 0)),
              ))
          )
            fail(
              at + '.mask',
              'rect/ellipse shape with finite x/y and nonnegative w/h/radius/feather required',
            );
          if (
            typeof c.opacity === 'number' &&
            !(finite(c.opacity) && c.opacity >= 0 && c.opacity <= 1)
          )
            fail(at + '.opacity', 'opacity must be between 0 and 1');
        }
        if (c.duck != null) {
          const under = c.duck.under ?? 'VOICE';
          if (
            !edl.audio.some(
              (t) => t !== edl[family][ti] && (t.track === under || t.role === under),
            )
          )
            fail(at + '.duck.under', `no audio track or role ${under}`);
          for (const k of ['depth_db', 'attack_ms', 'release_ms'])
            if (c.duck[k] != null && !(finite(c.duck[k]) && c.duck[k] >= 0))
              fail(at + `.duck.${k}`, 'nonnegative number required');
        }
        if (
          c.ramp != null &&
          !(
            finite(c.ramp.at) &&
            c.ramp.at >= 0 &&
            finite(c.ramp.dur) &&
            c.ramp.dur > 0 &&
            finite(c.ramp.min) &&
            c.ramp.min > 0 &&
            c.ramp.min <= 1
          )
        )
          fail(at + '.ramp', 'at >= 0, dur > 0 and 0 < min <= 1 required');
        for (const [ki, k] of (c.camera ?? []).entries())
          if (
            !finite(k.t) ||
            k.t < 0 ||
            !finite(k.x) ||
            !finite(k.y) ||
            !finite(k.zoom) ||
            k.zoom <= 0
          )
            fail(
              `${at}.camera[${ki}]`,
              'finite t/x/y and positive zoom required',
            );
      }
    }
  for (const [i, o] of edl.overlays.entries()) {
    if (!o.id || ids.has(o.id)) fail(`overlays[${i}].id`, 'unique id required');
    ids.add(o.id);
    if (
      ![
        'hook_title',
        'lower_third',
        'caption_word_group',
        'callout',
        'progress',
        'image',
        'text_behind',
        'graphic',
        'pip',
      ].includes(o.kind)
    )
      fail(`overlays[${i}].kind`, `unknown overlay kind ${o.kind}`);
    if (o.kind === 'image' && !o.src)
      fail(`overlays[${i}].src`, 'image source required');
    if (o.kind === 'pip' && (!o.src || !o.props?.pip || !(o.props.pip.w > 0 && o.props.pip.h > 0)))
      fail(`overlays[${i}].props.pip`, 'picture-in-picture source and bubble rect required');
    if (o.kind === 'graphic' && (typeof o.props?.element !== 'string' || !o.props.element))
      fail(`overlays[${i}].props.element`, 'graphic element kind required');
    if (o.kind !== 'image' && (!o.props || typeof o.props !== 'object'))
      fail(`overlays[${i}].props`, 'overlay properties required');
    if (
      o.props?.primitive &&
      ![o.props.width, o.props.height].every((v) => finite(v) && v > 0)
    )
      fail(`overlays[${i}].props`, 'positive finite shape dimensions required');
    if (!finite(o.at) || o.at < 0 || !finite(o.dur) || o.dur <= 0)
      fail(`overlays[${i}]`, 'nonnegative at and duration > 0 required');
    if (o.src && !sources.has(o.src))
      fail(`overlays[${i}].src`, `unknown asset ${o.src}`);
  }
  if (edl.master != null)
    for (const k of ['lufs', 'true_peak'])
      if (edl.master[k] != null && !finite(edl.master[k]))
        fail(`master.${k}`, 'finite number required');
  if (!frameCount(edl)) fail('timeline', 'at least one frame required');
  return edl;
}
const clone = (value) => structuredClone(value);
const meaningful = (v) =>
  v != null &&
  v !== false &&
  v !== 0 &&
  v !== '' &&
  (!Array.isArray(v) || v.length > 0) &&
  (!(v && typeof v === 'object' && !Array.isArray(v)) ||
    Object.keys(v).length > 0);
const NATIVE_TRANSITIONS = {
  cut: 'cut',
  none: 'cut',
  dip: 'dip',
  dip_to_black: 'dip',
  fade: 'dip',
  fade_black: 'dip',
  whip: 'whip',
  whip_pan: 'whip',
  slide: 'whip',
  push: 'whip',
  zoom: 'zoom',
  zoom_in: 'zoom',
  punch: 'zoom',
  morph: 'morph',
  dissolve: 'morph',
  crossfade: 'morph',
  cross_dissolve: 'morph',
};
/** Native transition → EDL transition; unknown kinds are reported, not guessed. */
export function nativeTransition(t, report = () => {}) {
  if (!t || typeof t !== 'object') return null;
  const raw = String(t.kind ?? t.type ?? t.name ?? 'cut')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const kind = NATIVE_TRANSITIONS[raw];
  const dur = Number(t.dur ?? t.duration ?? 0);
  if (!kind || !(Number.isFinite(dur) && dur >= 0)) {
    report(t);
    return null;
  }
  return kind === 'cut' ? null : { kind, dur };
}
/**
 * Tags native audio tracks with the EDL roles VOICE / MUSIC / SFX (track ids
 * stay native so planner resumes still match). Music beds get a sidechain duck
 * under VOICE unless the planner already wrote its own level/duck envelope.
 */
export function assignAudioRoles(audio) {
  const length = (c) => c.dur ?? (c.out - c.in) / (c.speed ?? 1);
  for (const t of audio) {
    const label = `${t.track} ${t.name ?? ''}`;
    if (t.role) continue;
    if (/music|bgm|song|score|\bbed\b/i.test(label)) t.role = 'MUSIC';
    else if (/sfx|fx\b|foley|whoosh/i.test(label)) t.role = 'SFX';
    else if (t.clips.every((c) => c.linked)) t.role = 'VOICE';
    else if (t.clips.some((c) => length(c) >= 8)) t.role = 'MUSIC';
    else t.role = 'SFX';
  }
  if (!audio.some((t) => t.role === 'VOICE')) return audio;
  for (const t of audio) {
    if (t.role !== 'MUSIC') continue;
    for (const c of t.clips) {
      const a = c.native_audio ?? {};
      if (c.duck || a.duck_gain?.keys?.length || a.volume?.keys?.length)
        continue;
      c.duck = { under: 'VOICE', depth_db: 16, attack_ms: 60, release_ms: 350 };
    }
  }
  return audio;
}
export function fromKimoProject(
  project,
  supplied = [],
  { emit = () => {} } = {},
) {
  const warnings = [];
  const warn = (path, value) => {
    const message = `Unmapped kimo property ${path}: ${JSON.stringify(value).slice(0, 160)}`;
    warnings.push(message);
    emit({
      t: 'op',
      phase: 'end',
      tool: 'edl_warning',
      title: message,
      warning: true,
      ok: true,
      at: Date.now(),
    });
  };
  const sources = Object.entries(project.assets ?? {}).map(([id, a]) => {
    const extra =
      supplied.find(
        (s) =>
          s.id === id ||
          s.path?.replaceAll('\\', '/') === a.path?.replaceAll('\\', '/'),
      ) ?? {};
    const image = /\.(png|jpe?g|webp|gif)$/i.test(a.path ?? '');
    return {
      id,
      path: a.path?.replaceAll('\\', '/'),
      fps: extra.rate || extra.fps || a.fps || project.fps,
      w: extra.width || a.width || 0,
      h: extra.height || a.height || 0,
      rotation: extra.rotation ?? 0,
      color: extra.color ?? { primaries: 'bt709', trc: 'bt709' },
      duration: extra.duration ?? a.duration,
      audio: extra.audio ?? null,
      kind: image ? 'image' : a.width > 0 ? 'video' : 'audio',
      native: clone(a),
    };
  });
  const video = [],
    audio = [],
    overlays = [];
  const capIds = new Set(
    JSON.stringify(project.editorial?.captions ?? {}).match(/clip\d+/g) ?? [],
  );
  const pictureEnd = Math.max(
    0,
    ...(project.tracks ?? []).flatMap((t) =>
      t.clips
        .filter(
          (c) =>
            c.source?.type === 'media' &&
            (sources.find((s) => s.id === c.source.asset)?.w ?? 0) > 0,
        )
        .map((c) => c.start + c.duration),
    ),
  );
  const known = new Set([
    'id',
    'source',
    'start',
    'duration',
    'in_point',
    'speed',
    'speed_curve',
    'props',
    'effects',
    'grade_graph',
    'blend',
    'mask',
    'time_mode',
    'corners',
    'audio',
    'motion_blur',
    'echo',
    'motion_path',
    'posterize_fps',
    'text_fx',
    'transition_in',
    'name',
    'tags',
  ]);
  const main =
    sources.find((s) => s.kind === 'video' && s.audio) ||
    sources.find((s) => s.kind === 'video');
  const canvas = {
    w: project.width,
    h: project.height,
    fps: rationalRate(main?.fps || project.fps),
    bg: '#000000',
  };
  for (const track of project.tracks ?? []) {
    for (const [key, value] of Object.entries(track))
      if (!['id', 'name', 'clips', 'muted'].includes(key) && meaningful(value))
        warn(`tracks.${track.id}.${key}`, value);
    const vt = { track: track.id, name: track.name ?? '', clips: [] },
      at = { track: track.id, name: track.name ?? '', clips: [] };
    for (const c of track.clips ?? []) {
      const path = `tracks.${track.id}.${c.id}`;
      for (const [k, v] of Object.entries(c))
        if (!known.has(k) && meaningful(v)) warn(`${path}.${k}`, v);
      for (const k of [
        'speed_curve',
        'motion_path',
        'motion_blur',
        'echo',
        'posterize_fps',
        'corners',
      ])
        if (meaningful(c[k])) warn(`${path}.${k}`, c[k]);
      if (c.time_mode?.mode && c.time_mode.mode !== 'normal')
        warn(`${path}.time_mode`, c.time_mode);
      for (const [k, v] of Object.entries(c.props ?? {})) {
        if (
          !['fit', 'opacity', 'reveal', 'rotation', 'scale', 'x', 'y'].includes(
            k,
          )
        )
          warn(`${path}.props.${k}`, v);
        if (v?.expr?.some((e) => e.op !== 'bezier'))
          warn(`${path}.props.${k}.expr`, v.expr);
      }
      const props = c.props ?? {};
      // Native masks use the engine's own geometry; never reinterpret them.
      if (meaningful(c.mask)) warn(`${path}.mask`, c.mask);
      if (
        props.reveal &&
        (curveValue(props.reveal, 0, 1) !== 1 ||
          props.reveal.keys?.length ||
          props.reveal.expr?.length)
      )
        warn(`${path}.props.reveal`, props.reveal);
      if (
        c.source.type === 'shape' &&
        ['rect', 'ellipse', 'polygon'].includes(c.source.shape)
      ) {
        const dur = Math.min(
          c.duration,
          Math.max(0, (pictureEnd || Infinity) - c.start),
        );
        if (dur > 0)
          overlays.push({
            id: c.id,
            kind: 'callout',
            at: c.start,
            dur,
            track: track.id,
            props: {
              ...clone(c.source),
              primitive: c.source.shape,
              x: 0.5 + curveValue(props.x, 0) / canvas.w,
              y: 0.5 + curveValue(props.y, 0) / canvas.h,
              reference: { w: canvas.w, h: canvas.h },
              curves: clone(props),
            },
            anim: { in: 'native', out: 'native' },
            native: clone(c),
          });
        continue;
      }
      if (c.source.type === 'text') {
        const dur = Math.min(
          c.duration,
          Math.max(0, (pictureEnd || Infinity) - c.start),
        );
        if (!(dur > 0)) continue;
        overlays.push({
          id: c.id,
          kind: capIds.has(c.id) ? 'caption_word_group' : 'hook_title',
          at: c.start,
          dur,
          track: track.id,
          props: {
            ...clone(c.source),
            x: 0.5 + curveValue(props.x, 0) / canvas.w,
            y: 0.5 + curveValue(props.y, 0) / canvas.h,
            reference: { w: canvas.w, h: canvas.h },
            curves: clone(props),
            text_fx: clone(c.text_fx ?? {}),
          },
          anim: { in: 'native', out: 'native' },
          native: clone(c),
        });
        continue;
      }
      const source = sources.find((s) => s.id === c.source.asset);
      if (!source) {
        warn(`${path}.source`, c.source);
        continue;
      }
      const speed = c.speed ?? 1,
        input = c.in_point ?? 0;
      const end =
        source.kind === 'image'
          ? input + c.duration * speed
          : Math.min(input + c.duration * speed, source.duration ?? Infinity);
      if (!(end > input)) continue;
      const common = {
        id: c.id,
        src: source.id,
        in: input,
        out: end,
        at: c.start,
        speed,
        native: clone(c),
      };
      if (source.w > 0) {
        const times = [
          ...new Set([
            0,
            ...(['x', 'y', 'scale'].some((k) => props[k]?.keys?.length)
              ? Array.from(
                  { length: Math.ceil(c.duration * rate(canvas.fps)) + 1 },
                  (_, i) =>
                    Math.min(
                      c.duration,
                      Math.max(
                        0,
                        (Math.ceil(c.start * rate(canvas.fps)) + i) /
                          rate(canvas.fps) -
                          c.start,
                      ),
                    ),
                )
              : []),
            ...['x', 'y', 'scale'].flatMap((k) =>
              (props[k]?.keys ?? []).map((q) => q.t ?? q.time),
            ),
            ...['x', 'y', 'scale'].flatMap((k) =>
              (props[k]?.expr ?? [])
                .filter((e) => e.op === 'bezier')
                .flatMap((e) =>
                  e.duration > 0
                    ? Array.from(
                        {
                          length: Math.ceil(e.duration * rate(canvas.fps)) + 2,
                        },
                        (_, i) =>
                          Math.min(
                            c.duration,
                            Math.max(
                              0,
                              (Math.ceil((c.start + e.t0) * rate(canvas.fps)) +
                                i) /
                                rate(canvas.fps) -
                                c.start,
                            ),
                          ),
                      )
                    : [Math.max(0, e.t0 ?? 0)],
                ),
            ),
          ]),
        ].sort((a, b) => a - b);
        const fit = curveValue(props.fit, 0, 1) === 0 ? 'contain' : 'cover';
        const rotated = Math.abs(source.rotation ?? 0) % 180 === 90;
        const sourceW = rotated ? source.h : source.w,
          sourceH = rotated ? source.w : source.h;
        const sourceAspect = sourceW / sourceH,
          canvasAspect = canvas.w / canvas.h;
        const cropW =
          sourceAspect > canvasAspect ? sourceH * canvasAspect : sourceW;
        const cropH =
          sourceAspect > canvasAspect ? sourceH : sourceW / canvasAspect;
        const camera = times.map((t) => {
          const zoom = curveValue(props.scale, t, 1);
          return {
            t,
            x:
              0.5 -
              (curveValue(props.x, t) / (canvas.w * zoom)) *
                (fit === 'contain' ? 1 : cropW / sourceW),
            y:
              0.5 -
              (curveValue(props.y, t) / (canvas.h * zoom)) *
                (fit === 'contain' ? 1 : cropH / sourceH),
            zoom,
            ease: 'linear',
          };
        });
        vt.clips.push({
          ...common,
          camera,
          reframe: { mode: 'manual' },
          fit,
          opacity: clone(props.opacity ?? { base: 1 }),
          rotation: clone(props.rotation ?? { base: 0 }),
          grade: {
            native: clone(c.grade_graph),
            effects: clone(c.effects ?? []),
          },
          mask: null,
          blend: c.blend ?? 'normal',
          transition_in: nativeTransition(c.transition_in, (v) =>
            warn(`${path}.transition_in`, v),
          ),
        });
      }
      if (!track.muted && !c.audio?.mute && source.kind !== 'image')
        at.clips.push({
          ...common,
          id: source.w > 0 ? `${c.id}:audio` : c.id,
          ...(source.w > 0 ? { linked: c.id } : {}),
          gain_db:
            20 * Math.log10(Math.max(1e-9, curveValue(c.audio?.volume, 0, 1))),
          chain: 'native',
          native_audio: clone(c.audio ?? {}),
        });
    }
    // Native tracks may contain overlaps. Preserve their order as explicit layers.
    const lanes = [];
    for (const c of vt.clips) {
      let lane = lanes.find((l) =>
        l.every(
          (p) =>
            c.at >= p.at + (p.out - p.in) / (p.speed ?? 1) - 1e-6 ||
            c.at + (c.out - c.in) / (c.speed ?? 1) <= p.at + 1e-6,
        ),
      );
      if (!lane) {
        lane = [];
        lanes.push(lane);
      }
      lane.push(c);
    }
    lanes.forEach((clips, i) =>
      video.push({
        ...vt,
        track: i ? `${vt.track}:layer${i}` : vt.track,
        clips,
      }),
    );
    if (at.clips.length) audio.push(at);
  }
  assignAudioRoles(audio);
  for (const [key, value] of Object.entries(project))
    if (
      ![
        'kimo',
        'grade_scopes',
        'editorial',
        'lights',
        'materials',
        'occluders',
        'ocio_view_delivery',
        'color_pipeline',
        'camera',
        'name',
        'width',
        'height',
        'fps',
        'assets',
        'tracks',
        'markers',
      ].includes(key) &&
      meaningful(value)
    )
      warn(key, value);
  for (const key of [
    'lights',
    'materials',
    'occluders',
    'camera',
    'ocio_view_delivery',
    'color_pipeline',
  ])
    if (meaningful(project[key])) warn(key, project[key]);
  const edl = {
    edl_version: 1,
    canvas,
    sources,
    video,
    overlays,
    audio,
    master: { lufs: -14, true_peak: -1 },
    warnings,
    native_project: clone(project),
  };
  return validate(edl);
}
export function toTimeline(edl) {
  const paths = new Map(edl.sources.map((s) => [s.id, s.path]));
  const tracks = edl.video.map((t) => ({
    track_id: t.track,
    name: t.name,
    clips: t.clips.map((c) => ({
      id: c.id,
      src: paths.get(c.src),
      start: c.at,
      end: c.at + (c.out - c.in) / (c.speed ?? 1),
      in: c.in,
      speed: c.speed,
    })),
  }));
  for (const o of edl.overlays) {
    let t = tracks.find((t) => t.track_id === o.track);
    if (!t) {
      t = { track_id: o.track ?? 'overlays', clips: [] };
      tracks.push(t);
    }
    t.clips.push({
      id: o.id,
      src: o.kind === 'pip' ? 'speaker bubble' : o.kind === 'graphic' ? `graphic: ${String(o.props.element).replace('_', ' ')}${[o.props.text, o.props.name, o.props.value, o.props.title, o.props.emoji].find((v) => typeof v === 'string' && v) ? ` · ${[o.props.text, o.props.name, o.props.value, o.props.title, o.props.emoji].find((v) => typeof v === 'string' && v).replaceAll('.', '·')}` : ''}` : o.props.primitive ? 'generated' : `text: ${o.props.text ?? ''}`,
      start: o.at,
      end: o.at + o.dur,
      ...(isCaptionChunk(o) ? { caption: true } : {}),
      // Phase 7 explainer beats: family, layout and item ticks (seconds from the beat start) for the GFX track
      ...(o.props?.explain ? { explain: { beat: o.props.explain.beat, kind: o.props.explain.kind, mode: o.props.mode ?? null, ticks: (o.props.items ?? o.props.map?.places ?? []).map((i) => i?.t).filter(Number.isFinite) } } : {}),
    });
  }
  for (const t of edl.audio) {
    const clips = t.clips
      .filter((c) => !c.linked)
      .map((c) => ({
        id: c.id,
        src: paths.get(c.src) ?? c.asset,
        start: c.at,
        end: c.at + (c.dur ?? (c.out - c.in) / (c.speed ?? 1)),
        in: c.in,
      }));
    if (clips.length || t.role==='MUSIC') tracks.push({ track_id: t.track, name:t.name, role:t.role, clips });
  }
  return {
    edl_version: 1,
    duration: duration(edl),
    tracks_bottom_to_top: tracks,
  };
}
export function applyEdits(original, ops) {
  const edl = clone(original);
  for (const op of ops) {
    const c =
      edl.video
        .flatMap((t) => t.clips)
        .find((c) => c.id === op.args?.clip_id) ??
      edl.overlays.find((c) => c.id === op.args?.clip_id) ??
      edl.audio
        .flatMap((t) => t.clips)
        .find((c) => !c.linked && c.id === op.args?.clip_id);
    if (!c) throw new Error(`EDL edit: unknown clip ${op.args?.clip_id}`);
    const linked = edl.audio
      .flatMap((t) => t.clips)
      .filter((a) => a.linked === c.id);
    if (isCaptionChunk(c) && op.tool !== 'delete_clip') {
      // kimo caption chunks: word-boundary snapping, no overlaps, word timings kept
      editCaptionChunk(edl, c, op);
      continue;
    }
    if (isExplain(c)) {
      // Phase 7 explainer beats: inline edits, and their speaker bubble / ring follow
      if (op.tool === 'delete_clip') deleteExplain(edl, c);
      else if (op.tool === 'move_clip') editExplain(edl, Object.assign(c, { at: op.args.start }), {});
      else if (op.tool === 'trim_clip') editExplain(edl, Object.assign(c, { dur: op.args.duration }), {});
      else if (op.tool === 'edit_explain' || op.tool === 'edit_caption') editExplain(edl, c, op.tool === 'edit_caption' ? { text: op.args.text } : op.args);
      else throw new Error(`Unsupported EDL edit: ${op.tool}`);
      continue;
    }
    if (op.tool === 'delete_clip') {
      for (const t of edl.video) t.clips = t.clips.filter((x) => x.id !== c.id);
      for (const t of edl.audio)
        t.clips = t.clips.filter((x) => x.linked !== c.id && x.id !== c.id);
      edl.overlays = edl.overlays.filter((x) => x.id !== c.id);
    } else if (op.tool === 'move_clip') {
      for (const x of [c, ...linked]) x.at = op.args.start;
    } else if (op.tool === 'trim_clip')
      for (const x of [c, ...linked]) {
        if (x.props) x.dur = op.args.duration;
        else {
          if (op.args.in_point != null) x.in = op.args.in_point;
          x.out = x.in + op.args.duration * (x.speed ?? 1);
        }
      }
    else if (op.tool === 'edit_caption' && typeof c.props?.text === 'string') {
      c.props.text = op.args.text;
      if (c.props.text_fx) c.props.text_fx.animators = [];
    } else throw new Error(`Unsupported EDL edit: ${op.tool}`);
  }
  return validate(edl);
}
export function publicEdl(edl) {
  if (!edl) return edl;
  // The window edits IDs/ranges/text through whitelisted operations, never full
  // renderer graphs. Keep dense camera samples and word animators off IPC and
  // the frequently saved library; edit.edl.json retains the complete model.
  const pick = (value, keys) =>
    Object.fromEntries(
      keys.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]),
    );
  const clip = (c) => ({...pick(c, [
      'id',
      'src',
      'in',
      'out',
      'at',
      'speed',
      'asset',
      'dur',
      'linked',
      'gain_db',
    ]),...(edl.creator_plan&&c.camera?{camera:c.camera.map(k=>pick(k,['t','x','y','zoom','ease'])),camera_by:c.camera_by,camera_framing:[...(c.camera_framing??[])]}:{}),...(edl.creator_plan&&c.sound_sfx?{sound_sfx:{...c.sound_sfx}}:{})});
  const tracks = (family) =>
    edl[family].map((t) => ({
      ...pick(t, ['track', 'name', 'role']),
      clips: t.clips.map(clip),
    }));
  return {
    edl_version: edl.edl_version,
    canvas: { ...edl.canvas },
    sources: edl.sources.map((s) =>
      pick(s, [
        'id',
        'path',
        'fps',
        'w',
        'h',
        'duration',
        'kind',
        'audio',
        'rotation',
      ]),
    ),
    video: tracks('video'),
    audio: tracks('audio'),
    overlays: edl.overlays.map((o) => ({
      ...pick(o, ['id', 'kind', 'at', 'dur', 'track', 'src']),
      props: pick(o.props ?? {}, ['text', 'primitive', 'width', 'height', 'engine', 'style', 'edited', 'hidden', 'element',
        // Phase 7 explainer beats: what the Studio beat editor shows and edits (no panel geometry, assets or paths)
        'explain', 'explain_plan', 'mode', 'title', 'items', 'label', 'question', 'term', 'keyword', 'caption', 'quote','words','lines','place','accent_color']),
    })),
    ...(edl.captions ? { captions: { style: edl.captions.style, hook_style: edl.captions.hook_style ?? null, bounds: captionBounds(edl), stats: edl.captions.stats } } : {}),
    master: { ...edl.master },
    ...(edl.creator_plan?{creator_settings:edl.creator_settings??{template:edl.creator_plan.template,energy:edl.creator_plan.camera.energy,pause:edl.creator_context.template.cut.max_pause,captions:edl.creator_plan.captions,music:edl.creator_plan.music,levels:edl.studio?.levels??{voice:0,music:0,sfx:0},accent:edl.studio?.accent??'template'},studio:{tracks:edl.studio?.tracks??{},warnings:edl.studio?.warnings??[]},removed:(edl.cut_plan?.removed??[]).map((r,index)=>({index,reason:r.reason,dur:r.out-r.in,text:r.text,at:edl.cut_plan.keep.find(k=>k.src===r.src&&k.in>=r.out-.04)?.at??duration(edl)}))}:{}),
    ...(edl.color_finish?{color_finish:pick(edl.color_finish,['version','enabled','look','strength','grain','vignette','sharpen','locked'])}:{}),
    ...(edl.sound?{sound:{version:edl.sound.version,enabled:edl.sound.enabled,target_lufs:edl.sound.target_lufs,music_id:edl.sound.music_id,sfx_count:edl.sound.sfx_count,master:edl.sound.report?.master}}:{}),
  };
}
export function toKimoProject(edl) {
  const project = clone(edl.native_project);
  if (!project) throw new Error('EDL has no planner project to resume');
  const clips = new Map(
    [
      ...edl.video.flatMap((t) => t.clips),
      ...edl.overlays,
      ...edl.audio.flatMap((t) => t.clips).filter((c) => !c.linked),
    ].map((c) => [c.id, c]),
  );
  for (const t of project.tracks)
    t.clips = t.clips.flatMap((old) => {
      const c = clips.get(old.id);
      if (!c) return [];
      const n = clone(old);
      n.start = c.at;
      n.duration = c.dur ?? (c.out - c.in) / (c.speed ?? 1);
      if (c.props) {
        if (typeof c.props.text === 'string') n.source.text = c.props.text;
        if (c.props.text_fx) n.text_fx = clone(c.props.text_fx);
      } else {
        n.in_point = c.in;
        n.speed = c.speed;
      }
      return [n];
    });
  return project;
}
