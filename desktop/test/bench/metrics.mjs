import { command, probeFile } from './io.mjs';

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const clamp = (n) => Math.max(0, Math.min(1, n));
const tokens = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/u)
    .filter(Boolean);
const ordered = (words) =>
  words
    .filter(
      (w) =>
        Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start,
    )
    .toSorted((a, b) => a.start - b.start);

export const firstSpeech = (words) => ordered(words)[0]?.start ?? null;
export function hookText(elements) {
  return elements.some(
    (e) =>
      e.start < 3 &&
      e.end > 0 &&
      tokens(e.text).length > 0 &&
      tokens(e.text).length <= 6,
  );
}
export function deadAirRatio(words) {
  const w = ordered(words);
  if (!w.length) return null;
  const span = w.at(-1).end - w[0].start;
  let end = w[0].end;
  let gaps = 0;
  for (const word of w.slice(1)) {
    if (word.start - end > 0.35) gaps += word.start - end;
    end = Math.max(end, word.end);
  }
  return span > 0 ? gaps / span : 0;
}
export function fillerCount(words) {
  const w = ordered(words);
  let count = 0;
  for (let i = 0; i < w.length; i++) {
    const t = tokens(w[i].text)[0];
    if (
      [
        'um',
        'uh',
        'erm',
        'umm',
        'uhh',
        'matlab',
        'na',
        'toh',
        'मतलब',
        'ना',
        'तो',
      ].includes(t)
    )
      count++;
    else if (t === 'you' && tokens(w[i + 1]?.text)[0] === 'know') {
      count++;
      i++;
    } else if (
      t === 'so' &&
      (i === 0 ||
        w[i].start - w[i - 1].end > 0.35 ||
        /[.!?]$/.test(w[i - 1].text))
    )
      count++;
    // Conservative contextual estimate: do not count "I like it" or comparisons.
    else if (
      t === 'like' &&
      i > 0 &&
      w[i].start - w[i - 1].end > 0.15 &&
      (w[i + 1]?.start ?? Infinity) - w[i].end > 0.15
    )
      count++;
  }
  return count;
}
export function textSimilarity(a, b) {
  const x = tokens(a).join(' '),
    y = tokens(b).join(' ');
  if (!x.length || !y.length) return 0;
  let row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 0; i < x.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < y.length; j++)
      next.push(
        Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (x[i] === y[j] ? 0 : 1)),
      );
    row = next;
  }
  return 1 - row[y.length] / Math.max(x.length, y.length);
}
export function repeatTakes(words) {
  const sentences = [];
  let current;
  for (const w of ordered(words)) {
    if (current && w.start - current.end > 0.7) {
      sentences.push(current);
      current = null;
    }
    current ??= { start: w.start, end: w.end, text: '' };
    current.text += ` ${w.text}`;
    current.end = w.end;
    if (/[.!?]$/.test(w.text)) {
      sentences.push(current);
      current = null;
    }
  }
  if (current) sentences.push(current);
  return sentences.filter(
    (s, i) =>
      tokens(s.text).length >= 3 &&
      sentences
        .slice(0, i)
        .some(
          (p) =>
            s.start - p.start <= 20 && textSimilarity(s.text, p.text) >= 0.8,
        ),
  ).length;
}
export function shotCadence(events, duration, sceneCuts = []) {
  const edl = events.flatMap((e) =>
    ['cut', 'punch', 'graphic'].includes(e.kind) ? [e.start, e.end] : [],
  );
  const times = [0, ...edl, ...sceneCuts, duration]
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= duration)
    .sort((a, b) => a - b);
  const distinct = times.filter((t, i) => !i || t - times[i - 1] > 0.08);
  const spans = distinct
    .slice(1)
    .map((t, i) => t - distinct[i])
    .sort((a, b) => a - b);
  const middle = spans.length >> 1;
  return {
    median_shot_s: spans.length
      ? spans.length % 2
        ? spans[middle]
        : (spans[middle - 1] + spans[middle]) / 2
      : null,
    max_static_s: spans.length ? Math.max(...spans) : null,
    edl_boundaries: edl,
    scene_cuts: sceneCuts,
  };
}
export function framingVariety(events, duration) {
  if (!(duration > 0)) return null;
  const windows = [];
  for (let t = 0; t < duration; t += 30) {
    const buckets = new Set(
      events
        .filter(
          (e) =>
            ['cut', 'punch'].includes(e.kind) && e.start < t + 30 && e.end > t,
        )
        .map((e) =>
          e.zoom >= 1.25 ? 'tight' : e.zoom >= 1.1 ? 'medium' : 'wide',
        ),
    );
    windows.push(buckets.size);
  }
  return mean(windows);
}
export function captionMinWord(elements) {
  const durations = elements.flatMap((e) =>
    e.words?.length
      ? e.words.map((w) => w.end - w.start)
      : tokens(e.text).map(() => e.end - e.start),
  );
  return durations.length ? Math.min(...durations) : null;
}
export function captionSafe(elements, aspect = '9:16') {
  if (!elements.length) return false;
  return elements.every(
    (e) =>
      e.box &&
      e.box.x >= 0 &&
      e.box.y >= (aspect === '9:16' ? 0.12 : 0.05) &&
      e.box.x + e.box.w <= (aspect === '9:16' ? 0.85 : 0.95) &&
      e.box.y + e.box.h <= (aspect === '9:16' ? 0.78 : 0.95),
  );
}
const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function captionFaceOverlap(elements, subjects, fps = 30) {
  if (!elements.length || !subjects.length) return null;
  let overlap = 0,
    total = 0;
  for (const e of elements)
    for (let f = Math.ceil(e.start * fps); f < e.end * fps; f++) {
      const boxes = subjects.filter(
        (s) => s.start <= f / fps && s.end > f / fps,
      );
      if (!boxes.length || !e.box) continue;
      total++;
      if (boxes.some((s) => intersects(e.box, s.box))) overlap++;
    }
  return total ? (overlap / total) * 100 : null;
}
export function parseEbur128(log) {
  const summaries = [
    ...log.matchAll(
      /Integrated loudness:\s*I:\s*(-?[\d.]+) LUFS[\s\S]*?Loudness range:\s*LRA:\s*([\d.]+) LU[\s\S]*?True peak:\s*Peak:\s*(-?[\d.]+) dBFS/g,
    ),
  ];
  const m = summaries.at(-1);
  return m
    ? { lufs: +m[1], lra: +m[2], true_peak: +m[3] }
    : { lufs: null, lra: null, true_peak: null };
}
export function duckDepthDb(musicWindows) {
  const voice = musicWindows
    .filter((w) => w.voice && Number.isFinite(w.rmsDb))
    .map((w) => w.rmsDb);
  const gaps = musicWindows
    .filter((w) => !w.voice && Number.isFinite(w.rmsDb))
    .map((w) => w.rmsDb);
  return voice.length && gaps.length ? mean(gaps) - mean(voice) : null;
}
export const sfxPerMinute = (events, duration) =>
  duration > 0
    ? (events.filter((e) => e.kind === 'sfx').length * 60) / duration
    : null;

/** CIEDE2000, Sharma et al. supplementary test pairs are in metrics.test.mjs. */
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = (a) => (a * Math.PI) / 180,
    deg = (a) => (a * 180) / Math.PI;
  const c1 = Math.hypot(a1, b1),
    c2 = Math.hypot(a2, b2),
    c = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7)));
  const A1 = (1 + g) * a1,
    A2 = (1 + g) * a2;
  const C1 = Math.hypot(A1, b1),
    C2 = Math.hypot(A2, b2);
  const h = (a, b) => (deg(Math.atan2(b, a)) + 360) % 360;
  const h1 = h(A1, b1),
    h2 = h(A2, b2);
  const dL = L2 - L1,
    dC = C2 - C1;
  let dh = h2 - h1;
  if (!C1 || !C2) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
  const l = (L1 + L2) / 2,
    C = (C1 + C2) / 2;
  const H =
    !C1 || !C2
      ? h1 + h2
      : Math.abs(h1 - h2) <= 180
        ? (h1 + h2) / 2
        : (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2;
  const T =
    1 -
    0.17 * Math.cos(rad(H - 30)) +
    0.24 * Math.cos(rad(2 * H)) +
    0.32 * Math.cos(rad(3 * H + 6)) -
    0.2 * Math.cos(rad(4 * H - 63));
  const SL = 1 + (0.015 * (l - 50) ** 2) / Math.sqrt(20 + (l - 50) ** 2),
    SC = 1 + 0.045 * C,
    SH = 1 + 0.015 * C * T;
  const RT =
    -2 *
    Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7)) *
    Math.sin(rad(60 * Math.exp(-(((H - 275) / 25) ** 2))));
  return Math.sqrt(
    (dL / SL) ** 2 +
      (dC / SC) ** 2 +
      (dH / SH) ** 2 +
      RT * (dC / SC) * (dH / SH),
  );
}
export function rgbToLab(rgb) {
  const [r, g, b] = rgb
    .map((n) => n / 255)
    .map((n) => (n > 0.04045 ? ((n + 0.055) / 1.055) ** 2.4 : n / 12.92));
  const f = (n) =>
    n > 216 / 24389 ? Math.cbrt(n) : ((24389 / 27) * n + 16) / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047),
    y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b),
    z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export const clipDeltaE = (colours) =>
  colours.length >= 2
    ? mean(
        colours
          .slice(1)
          .map((c, i) => deltaE2000(rgbToLab(colours[i]), rgbToLab(c))),
      )
    : null;
export const clippedPct = (values) =>
  values.length
    ? (values.filter((n) => n === 0 || n === 255).length * 100) / values.length
    : null;

/** Matches local source indices, excluding intentional cuts/speed changes at call sites. */
export function matchFrames(
  output,
  source,
  expected,
  { radius = 3, maxMad = 24 } = {},
) {
  const indices = [],
    errors = [];
  for (let i = 0; i < output.length; i++) {
    let best = null,
      cost = Infinity,
      second = Infinity;
    const target = expected[i];
    const candidates = Array.from(
      { length: radius * 2 + 1 },
      (_, j) => target + j - radius,
    )
      .filter((j) => j >= 0 && j < source.length)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    for (const j of candidates) {
      let sum = 0;
      for (let k = 0; k < output[i].length; k++)
        sum += Math.abs(output[i][k] - source[j][k]);
      const mad = sum / output[i].length;
      if (mad < cost - 0.001) {
        second = cost;
        cost = mad;
        best = j;
      } else second = Math.min(second, mad);
    }
    indices.push(cost <= maxMad && second - cost >= 0.02 ? best : null);
    errors.push(cost);
  }
  let repeated = 0,
    skipped = 0,
    compared = 0;
  for (let i = 1; i < indices.length; i++) {
    if (
      indices[i] == null ||
      indices[i - 1] == null ||
      expected[i] - expected[i - 1] !== 1
    )
      continue;
    compared++;
    if (indices[i] === indices[i - 1]) repeated++;
    if (indices[i] - indices[i - 1] > 1)
      skipped += indices[i] - indices[i - 1] - 1;
  }
  return {
    repeated_frames: compared ? repeated : null,
    skipped_frames: compared ? skipped : null,
    compared,
    total: output.length,
    coverage: output.length > 1 ? compared / (output.length - 1) : 0,
    indices,
    mean_mad: mean(errors),
  };
}
export function deliveryOk(checks, streams) {
  if (!checks?.length || !streams?.video) return false;
  const v = streams.video,
    a = streams.audio;
  return (
    checks.every((c) => c.ok || c.warn) &&
    v.codec_name === 'h264' &&
    v.profile === 'High' &&
    v.color_space === 'bt709' &&
    v.color_transfer === 'bt709' &&
    v.color_primaries === 'bt709' &&
    (!a ||
      (a.codec_name === 'aac' &&
        +a.sample_rate === 48000 &&
        +a.bit_rate >= 320000))
  );
}
export function creatorScore(m, weights, { speech = true, music = true } = {}) {
  const upper = (n, target, fail) =>
    Number.isFinite(n) ? clamp((fail - n) / (fail - target)) : 0;
  const lower = (n, target) => (Number.isFinite(n) ? clamp(n / target) : 0);
  const band = (n, lo, hi) =>
    Number.isFinite(n)
      ? clamp(1 - Math.max(lo - n, n - hi, 0) / Math.max(1, hi - lo))
      : 0;
  const groups = {
    hook: mean([
      ...(speech ? [upper(m.first_speech_s, 0.4, 2)] : []),
      m.hook_text === true ? 1 : 0,
    ]),
    dead_air: speech ? upper(m.dead_air_ratio, 0.03, 0.3) : null,
    filler: speech
      ? mean([upper(m.filler_count, 0, 8), upper(m.repeat_takes, 0, 3)])
      : null,
    cadence: mean([
      band(m.median_shot_s, 1.5, 4),
      upper(m.max_static_s, 6, 20),
    ]),
    framing: lower(m.framing_variety, 3),
    motion: mean([
      upper(m.jitter_px, 0.5, 6),
      m.repeated_frames === 0 &&
      m.skipped_frames === 0 &&
      m.frame_match_coverage >= 0.95
        ? 1
        : 0,
    ]),
    captions: speech
      ? mean([
          lower(m.caption_min_word_s, 0.18),
          m.caption_safe === true ? 1 : 0,
          upper(m.caption_face_overlap, 2, 50),
        ])
      : null,
    sound: mean([
      band(m.lufs, -15, -13),
      upper(m.true_peak, -1, 0),
      band(m.lra, 4, 9),
      ...(music && speech ? [band(m.duck_depth_db, 12, 20)] : []),
      band(
        m.sfx_count_per_min,
        m.aspect === '9:16' ? 6 : 3,
        m.aspect === '9:16' ? 20 : 10,
      ),
    ]),
    colour: mean([upper(m.clip_delta_e, 4, 20), upper(m.clipped_pct, 0.5, 10)]),
  };
  const active = Object.entries(groups).filter(([, v]) => v !== null);
  const totalWeight = active.reduce((s, [k]) => s + weights[k], 0);
  return {
    score:
      Math.round(
        (active.reduce((s, [k, v]) => s + weights[k] * v, 0) / totalWeight) *
          1000,
      ) / 10,
    groups,
    missing: Object.entries(m)
      .filter(([, v]) => v === null)
      .map(([k]) => k),
    policy:
      'Unavailable applicable measurements score zero; explicitly speech-free groups are excluded and weights renormalized. Delivery is a separate gate.',
  };
}

export async function analyzeMedia(ffmpeg, ffprobe, path) {
  const info = await probeFile(ffprobe, path);
  const filter =
    '[0:v]scdet=t=10,freezedetect=n=-50dB:d=0.1,signalstats,metadata=print[v]' +
    (info.audio
      ? ';[0:a]silencedetect=n=-40dB:d=0.35,ebur128=peak=true[a]'
      : '');
  const { stderr } = await command(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-nostats',
    '-i',
    path,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    ...(info.audio ? ['-map', '[a]'] : []),
    '-f',
    'null',
    '-',
  ]);
  const sceneCuts = [...stderr.matchAll(/lavfi\.scd\.time=([\d.]+)/g)].map(
    (m) => +m[1],
  );
  const frozen = [...stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map(
    (m) => +m[1],
  );
  const silences = [...stderr.matchAll(/silence_(start|end):\s*([\d.]+)/g)].map(
    (m) => ({ kind: m[1], time: +m[2] }),
  );
  return { info, sceneCuts, frozen, silences, ...parseEbur128(stderr) };
}

export function closedGop(log) {
  const packets = log.split(/Packet:/).slice(1);
  const keys = packets.filter((p) => /^[^\n]*key frame/.test(p));
  return (
    keys.length > 0 && keys.every((p) => /nal_unit_type\s+[01]+ = 5\b/.test(p))
  );
}
export function constantFrameRate(times, fps) {
  return (
    times.length > 1 &&
    fps > 0 &&
    times.slice(1).every((t, i) => Math.abs(t - times[i] - 1 / fps) <= 0.0015)
  );
}
export async function inspectDelivery(ffmpeg, ffprobe, path, fps) {
  const frames = await command(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'frame=best_effort_timestamp_time',
    '-of',
    'json',
    path,
  ]);
  const times = JSON.parse(frames.stdout).frames.map((f) =>
    Number(f.best_effort_timestamp_time),
  );
  const trace = await command(
    ffmpeg,
    [
      '-nostdin',
      '-hide_banner',
      '-i',
      path,
      '-an',
      '-c:v',
      'copy',
      '-bsf:v',
      'trace_headers',
      '-f',
      'null',
      '-',
    ],
    { maxStderr: 128 * 1024 * 1024 },
  );
  return {
    closed_gop: closedGop(trace.stderr),
    cfr_ok: constantFrameRate(times, fps),
  };
}
export async function measureDuckDepth(ffmpeg, stem, words) {
  const { stdout } = await command(ffmpeg, [
    '-nostdin',
    '-v',
    'error',
    '-i',
    stem,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '8000',
    '-f',
    'f32le',
    'pipe:1',
  ]);
  const samples = new Float32Array(
    stdout.buffer.slice(
      stdout.byteOffset,
      stdout.byteOffset + stdout.byteLength,
    ),
  );
  const windows = [];
  for (let i = 0; i < samples.length; i += 800) {
    const end = Math.min(samples.length, i + 800);
    let power = 0;
    for (let j = i; j < end; j++) power += samples[j] ** 2;
    const rmsDb = 10 * Math.log10(power / (end - i));
    windows.push({
      voice: words.some((w) => w.start < end / 8000 && w.end > i / 8000),
      rmsDb,
    });
  }
  return duckDepthDb(windows);
}
export function assessMetrics(
  values,
  spec,
  { speech = true, music = true } = {},
) {
  return Object.entries(spec.metrics).map(([name, rule]) => {
    const value = values[name];
    const applicable = !(
      (rule.speechOnly && !speech) ||
      (rule.musicOnly && !music)
    );
    const lowCoverage =
      rule.requiresCoverage &&
      values.frame_match_coverage < rule.requiresCoverage;
    const unavailable =
      value == null ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      lowCoverage;
    const min =
      values.aspect === '16:9' ? (rule.landscapeMin ?? rule.min) : rule.min;
    const max =
      values.aspect === '16:9' ? (rule.landscapeMax ?? rule.max) : rule.max;
    const pass =
      !unavailable &&
      (!Object.hasOwn(rule, 'equals') || value === rule.equals) &&
      (min == null || value >= min) &&
      (max == null || value <= max) &&
      (rule.maxExclusive == null || value < rule.maxExclusive);
    return {
      name,
      value,
      status: !applicable
        ? 'not applicable'
        : unavailable
          ? 'unavailable'
          : pass
            ? 'pass'
            : 'fail',
      target: rule,
      estimated: [
        'filler_count',
        'repeat_takes',
        'caption_safe',
        'caption_face_overlap',
        'clip_delta_e',
      ].includes(name),
    };
  });
}
