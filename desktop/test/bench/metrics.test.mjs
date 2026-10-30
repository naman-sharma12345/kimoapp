import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as m from './metrics.mjs';
import { sourceResidualJitter, registerTranslation } from './registration.mjs';
import { command, probeFile, filterPath, readJson } from './io.mjs';
import {
  projectEdl,
  whisperWords,
  sampledColour,
  visibleSourceSegments,
} from './analyze.mjs';

const words = (list) =>
  list.map(([text, start, end]) => ({ text, start, end }));

test('source-referenced camera estimate cancels capture motion, brightness and masked captions but detects injected shake', () => {
  const width = 64,
    height = 48,
    count = 80;
  const picture = (x, y, t) =>
    110 +
    24 * Math.sin(x * 0.31 + t * 0.17) +
    19 * Math.cos(y * 0.29 - t * 0.09) +
    12 * Math.sin((x + y) * 0.19 + t * 0.07);
  const references = [],
    clean = [],
    shaken = [],
    masks = [];
  for (let t = 0; t < count; t++) {
    const reference = new Float64Array(width * height),
      output = new Float64Array(reference.length),
      shake = new Float64Array(reference.length),
      mask = new Uint8Array(reference.length).fill(1);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        reference[k] = picture(x, y, t);
        output[k] = reference[k] * 1.1 + 3;
        shake[k] = picture(x + (t % 2 ? 0.12 : -0.12), y, t) * 1.1 + 3;
        if (y > 34) {
          mask[k] = 0;
          output[k] = (x + t) % 2 ? 255 : 0;
          shake[k] = output[k];
        }
      }
    references.push(reference);
    clean.push(output);
    shaken.push(shake);
    masks.push(mask);
  }
  const options = {
    width,
    height,
    outputWidth: 1920,
    outputHeight: 1080,
    masks,
  };
  const baseline = sourceResidualJitter(clean, references, options),
    bad = sourceResidualJitter(shaken, references, options);
  assert.equal(baseline.coverage, 1);
  assert.ok(baseline.jitter_px < 0.001, JSON.stringify(baseline));
  assert.equal(bad.coverage, 1);
  assert.ok(bad.jitter_px > 0.5, JSON.stringify(bad));
  const fit = registerTranslation(
    shaken[25],
    references[25],
    width,
    height,
    masks[25],
  );
  assert.ok(Math.abs(fit.dx - 0.12) < 0.02, JSON.stringify(fit));
});

test('source-referenced jitter rejects flat/aperture images and insufficient registration coverage', () => {
  const width = 64,
    height = 48,
    flat = new Uint8Array(width * height).fill(100);
  const stripes = Uint8Array.from(
    flat,
    (_, k) => 100 + 40 * Math.sin((k % width) * 0.3),
  );
  assert.equal(registerTranslation(flat, flat, width, height), null);
  assert.equal(registerTranslation(stripes, stripes, width, height), null);
  const result = sourceResidualJitter(
    Array(20).fill(flat),
    Array(20).fill(flat),
    { width, height, outputWidth: 1920, outputHeight: 1080 },
  );
  assert.equal(result.jitter_px, null);
  assert.equal(result.coverage, 0);
});
test('speech onset and union of internal gaps, never padding', () => {
  const w = words([
    ['Hi', 0.2, 0.5],
    ['there', 1, 1.5],
    ['friend', 1.6, 2],
  ]);
  assert.equal(m.firstSpeech(w), 0.2);
  assert.ok(Math.abs(m.deadAirRatio(w) - 0.5 / 1.8) < 1e-9);
  assert.equal(m.firstSpeech([]), null);
  assert.equal(m.deadAirRatio([]), null);
});
test('hook must be visible before three seconds, at most six words', () => {
  assert.equal(
    m.hookText([{ start: 0, end: 2, text: 'Build better videos' }]),
    true,
  );
  assert.equal(m.hookText([{ start: 3, end: 4, text: 'Too late' }]), false);
  assert.equal(
    m.hookText([
      { start: 0, end: 2, text: 'one two three four five six seven' },
    ]),
    false,
  );
});
test('fillers count phrases once and distinguish ordinary like / so', () => {
  const w = words([
    ['So', 0, 0.1],
    ['um', 0.1, 0.2],
    ['you', 0.3, 0.4],
    ['know', 0.4, 0.6],
    ['I', 0.7, 0.8],
    ['like', 0.8, 1],
    ['it.', 1, 1.2],
    ['matlab', 1.4, 1.5],
    ['na', 1.6, 1.7],
    ['toh', 1.8, 1.9],
  ]);
  assert.equal(m.fillerCount(w), 6);
});
test('repeat takes use normalized edit distance and 20s window', () => {
  assert.ok(m.textSimilarity('This is my point.', 'this is my point') > 0.99);
  const w = words([
    ['This is my point.', 0, 2],
    ['This is my point!', 5, 7],
    ['This is my point.', 30, 32],
  ]);
  assert.equal(m.repeatTakes(w), 1);
});
test('cadence excludes audio/caption boundaries and includes scene detection', () => {
  const v = m.shotCadence(
    [
      { kind: 'cut', start: 0, end: 6 },
      { kind: 'caption', start: 1, end: 1.2 },
    ],
    6,
    [2, 4],
  );
  assert.equal(v.median_shot_s, 2);
  assert.equal(v.max_static_s, 2);
  assert.equal(m.shotCadence([], 10).max_static_s, 10);
});
test('framing counts distinct buckets in each 30s window', () => {
  assert.equal(
    m.framingVariety(
      [1, 1.15, 1.3].map((zoom) => ({ kind: 'cut', start: 0, end: 30, zoom })),
      30,
    ),
    3,
  );
});
test('caption lifetime, safe area, known face boxes, missing evidence', () => {
  const caption = {
    start: 0,
    end: 1,
    text: 'hello there',
    box: { x: 0.1, y: 0.65, w: 0.7, h: 0.1 },
    words: [
      { start: 0, end: 0.2 },
      { start: 0.2, end: 1 },
    ],
  };
  assert.equal(m.captionMinWord([caption]), 0.2);
  assert.equal(m.captionSafe([caption]), true);
  assert.equal(
    m.captionSafe([{ ...caption, box: { x: 0.1, y: 0.9, w: 0.7, h: 0.1 } }]),
    false,
  );
  assert.equal(
    m.captionFaceOverlap([caption], [{ start: 0, end: 1, box: caption.box }]),
    100,
  );
  assert.equal(m.captionFaceOverlap([caption], []), null);
  assert.equal(m.captionSafe([{ ...caption, box: null }]), null);
  assert.equal(m.captionSafe([caption, { ...caption, box: null }]), null);
  assert.equal(
    m.captionFaceOverlap(
      [caption, { ...caption, box: null }],
      [{ start: 0, end: 1, box: caption.box }],
    ),
    null,
  );
});
test('EBU summary is final measurement, not intermediate log', () => {
  assert.deepEqual(
    m.parseEbur128(
      'Integrated loudness:\n I: -14.1 LUFS\n Threshold: -24 LUFS\nLoudness range:\n LRA: 5.2 LU\nTrue peak:\n Peak: -1.2 dBFS',
    ),
    { lufs: -14.1, lra: 5.2, true_peak: -1.2 },
  );
  assert.equal(m.parseEbur128('').lufs, null);
});
test('duck depth needs music stem levels in both speech and gaps', () => {
  assert.equal(
    m.duckDepthDb([
      { voice: true, rmsDb: -36 },
      { voice: false, rmsDb: -20 },
    ]),
    16,
  );
  assert.equal(m.duckDepthDb([]), null);
  assert.equal(m.sfxPerMinute([{ kind: 'sfx' }, { kind: 'cut' }], 30), 2);
});
test('missing-stem fallback estimates the saved music envelope and ignores muted beds', () => {
  const events = [
    {
      kind: 'music',
      start: 0,
      end: 2,
      raw: {
        audio: {
          volume: { base: 1 },
          duck_gain: {
            keys: [
              { t: 0, v: 0.1 },
              { t: 0.99, v: 0.1 },
              { t: 1, v: 1 },
              { t: 2, v: 1 },
            ],
          },
        },
      },
    },
  ];
  assert.ok(
    Math.abs(m.estimateDuckDepth(events, [{ start: 0, end: 0.99 }], 2) - 20) <
      0.1,
  );
  assert.equal(
    m.estimateDuckDepth(
      [{ ...events[0], muted: true }],
      [{ start: 0, end: 1 }],
      2,
    ),
    null,
  );
  assert.equal(m.estimateDuckDepth(events, [], 2), null);
});
test('CIEDE2000 matches published Sharma reference pairs', () => {
  for (const [a, b, expected] of [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  ])
    assert.ok(Math.abs(m.deltaE2000(a, b) - expected) < 0.0001);
  assert.ok(
    m.clipDeltaE([
      [125, 100, 90],
      [125, 100, 90],
    ]) < 1e-9,
  );
  assert.equal(m.clippedPct([0, 50, 120, 255]), 50);
});
test('source matching distinguishes repeats/skips from correct and static frames', () => {
  const source = Array.from({ length: 12 }, (_, i) => Buffer.alloc(24, i * 20));
  const expected = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(
    m.matchFrames(source.slice(0, 10), source, expected).repeated_frames,
    0,
  );
  const mapping = [0, 1, 2, 2, 4, 5, 6, 7, 8, 9];
  const result = m.matchFrames(
    mapping.map((i) => source[i]),
    source,
    expected,
  );
  assert.equal(result.repeated_frames, 1);
  assert.equal(result.skipped_frames, 1);
  assert.equal(
    m.matchFrames(
      source.map(() => source[0]),
      source.map(() => source[0]),
      source.map((_, i) => i),
    ).coverage,
    0,
  );
});

test('source matching permits planned slow-motion holds and frame-rate conversion skips', () => {
  const source = Array.from({ length: 12 }, (_, i) => Buffer.alloc(24, i * 20));
  for (const expected of [
    [0, 0, 1, 1, 2, 2, 3],
    [0, 1, 2, 4, 5, 6, 8],
  ]) {
    const result = m.matchFrames(
      expected.map((i) => source[i]),
      source,
      expected,
    );
    assert.equal(result.repeated_frames, 0);
    assert.equal(result.skipped_frames, 0);
    assert.equal(result.incorrect_frames, 0);
    assert.equal(result.coverage, 1);
  }
});

test('changing caption pixels cannot choose the previous source frame when masked', () => {
  const source = Array.from({ length: 10 }, (_, i) => Buffer.alloc(24, i * 20));
  const expected = [0, 1, 2, 3, 4, 5, 6];
  const output = expected.map((i) => Buffer.from(source[i]));
  output[3].fill(40, 1);
  assert.equal(m.matchFrames(output, source, expected).repeated_frames, 1);
  const masks = output.map(() =>
    Uint8Array.from({ length: 24 }, (_, i) => (i === 0 ? 1 : 0)),
  );
  const measured = m.matchFrames(output, source, expected, { masks });
  assert.equal(measured.repeated_frames, 0);
  assert.equal(measured.skipped_frames, 0);
  assert.equal(measured.incorrect_frames, 0);
  assert.equal(measured.coverage, 1);
});
test('delivery gate checks metadata and mandatory audio rate', () => {
  const streams = {
    video: {
      codec_name: 'h264',
      profile: 'High',
      color_space: 'bt709',
      color_transfer: 'bt709',
      color_primaries: 'bt709',
    },
    audio: { codec_name: 'aac', sample_rate: 48000, bit_rate: 384000 },
  };
  assert.equal(m.deliveryOk([{ ok: true }], streams), true);
  assert.equal(m.deliveryOk([{ ok: false }], streams), false);
  assert.equal(
    m.deliveryOk([{ ok: true }], {
      ...streams,
      audio: { ...streams.audio, bit_rate: 128000 },
    }),
    false,
  );
});
test('Creator Score weights and unavailable values cannot become green', async () => {
  const weights = await readJson(new URL('./score.json', import.meta.url));
  assert.equal(
    Object.values(weights).reduce((a, b) => a + b),
    100,
  );
  const values = {
    first_speech_s: 0.2,
    hook_text: true,
    dead_air_ratio: 0.01,
    filler_count: 0,
    repeat_takes: 0,
    median_shot_s: 2,
    max_static_s: 4,
    framing_variety: 3,
    jitter_px: 0.1,
    repeated_frames: 0,
    skipped_frames: 0,
    frame_match_coverage: 1,
    caption_min_word_s: 0.2,
    caption_safe: true,
    caption_face_overlap: 0,
    lufs: -14,
    true_peak: -1.2,
    lra: 6,
    duck_depth_db: 16,
    sfx_count_per_min: 10,
    clip_delta_e: 2,
    clipped_pct: 0.1,
    aspect: '9:16',
  };
  assert.equal(m.creatorScore(values, weights).score, 100);
  assert.ok(
    m.creatorScore(
      { ...values, first_speech_s: null, caption_face_overlap: null },
      weights,
    ).score < 100,
  );
  assert.ok(m.creatorScore({ ...values, lufs: -30 }, weights).score < 100);
});
test('actual project schema maps source time and caption membership', () => {
  const p = {
    width: 1080,
    height: 1920,
    assets: { asset1: { path: 'in.mp4', width: 1920 } },
    editorial: { captions: { cues: [{ clip_id: 'clip3' }] } },
    tracks: [
      {
        id: 'track1',
        clips: [
          {
            id: 'clip2',
            source: { type: 'media', asset: 'asset1' },
            start: 0,
            duration: 4,
            in_point: 5,
            props: { scale: { base: 1.2 } },
          },
          {
            id: 'clip3',
            source: { type: 'text', text: 'hello', size: 72 },
            start: 0,
            duration: 1,
          },
        ],
      },
    ],
  };
  const edl = projectEdl(p);
  assert.equal(edl[0].in_point, 5);
  assert.equal(edl[1].kind, 'punch');
  assert.equal(edl[2].kind, 'caption');
});
test('Whisper token join preserves word timings and punctuation', () => {
  assert.deepEqual(
    whisperWords({
      transcription: [
        {
          tokens: [
            { text: ' Hello', offsets: { from: 100, to: 300 } },
            { text: '.', offsets: { from: 300, to: 320 } },
            { text: ' world', offsets: { from: 400, to: 700 } },
          ],
        },
      ],
    }),
    [
      { text: 'Hello.', start: 0.1, end: 0.32 },
      { text: 'world', start: 0.4, end: 0.7 },
    ],
  );
});
test('Windows filter paths escape drive letters, spaces and apostrophes', () => {
  assert.equal(
    filterPath("C:\\my clips\\it's.ttf"),
    "C\\:/my clips/it'\\''s.ttf",
  );
});
test('closed GOP requires IDR on every keyframe; CFR rejects a skipped timestamp', () => {
  assert.equal(
    m.closedGop(
      'Packet: 100 bytes, key frame\nnal_unit_type 00101 = 5\nPacket: 90 bytes\nnal_unit_type 00001 = 1',
    ),
    true,
  );
  assert.equal(
    m.closedGop('Packet: 100 bytes, key frame\nnal_unit_type 00001 = 1'),
    false,
  );
  assert.equal(m.constantFrameRate([0, 0.1, 0.2, 0.3], 10), true);
  assert.equal(m.constantFrameRate([0, 0.1, 0.3], 10), false);
});
test('visible source mapping excludes occluded video and preserves re-entry source time', () => {
  const cuts = [
    { id: 'talk', kind: 'cut', start: 0, end: 10, in_point: 5, speed: 1 },
    { id: 'broll', kind: 'cut', start: 3, end: 6, in_point: 20, speed: 1 },
  ];
  assert.deepEqual(
    visibleSourceSegments(cuts, 10).map(({ id, start, end, in_point }) => ({
      id,
      start,
      end,
      in_point,
    })),
    [
      { id: 'talk', start: 0, end: 3, in_point: 5 },
      { id: 'broll', start: 3, end: 6, in_point: 20 },
      { id: 'talk', start: 6, end: 10, in_point: 11 },
    ],
  );
});
test('target checks distinguish absent evidence, failures and speech-free cases', async () => {
  const spec = await readJson(new URL('./creator-spec.json', import.meta.url));
  const checks = m.assessMetrics(
    { first_speech_s: 0.6, repeated_frames: 0, frame_match_coverage: 0.4 },
    spec,
  );
  assert.equal(checks.find((c) => c.name === 'first_speech_s').status, 'fail');
  assert.equal(
    checks.find((c) => c.name === 'repeated_frames').status,
    'unavailable',
  );
  assert.equal(
    m
      .assessMetrics({}, spec, { speech: false, music: false })
      .find((c) => c.name === 'first_speech_s').status,
    'not applicable',
  );
});

test(
  'FFmpeg synthetic pauses, scene cuts, clipping and frame repeats',
  { timeout: 120000 },
  async (t) => {
    const ffmpeg = process.env.KIMO_FFMPEG || 'ffmpeg';
    const ffprobe = process.env.KIMO_FFPROBE || 'ffprobe';
    try {
      await command(ffmpeg, ['-version']);
    } catch (e) {
      if (process.env.KIMO_BENCH_REQUIRE_FFMPEG) throw e;
      t.skip('FFmpeg unavailable; CI requires it');
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'kimo-metrics-'));
    try {
      const path = join(dir, 'fixture.mp4');
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=192x108:r=10:d=3',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3:sample_rate=48000',
        '-vf',
        "drawbox=enable='gte(t,1.5)':color=white:t=fill",
        '-af',
        "volume=enable='between(t,0,0.5)+between(t,1,1.5)':volume=0",
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-shortest',
        path,
      ]);
      const analysis = await m.analyzeMedia(ffmpeg, ffprobe, path);
      assert.ok(
        analysis.silences.some(
          (s) => s.kind === 'end' && Math.abs(s.time - 0.5) < 0.1,
        ),
      );
      assert.ok(analysis.sceneCuts.some((n) => Math.abs(n - 1.5) < 0.2));
      assert.ok(Number.isFinite(analysis.lufs));
      assert.equal((await probeFile(ffprobe, path)).fps, 10);
      const colour = await sampledColour(ffmpeg, path, 3, [
        { kind: 'cut', id: 'a', start: 0, end: 3 },
      ]);
      assert.ok(colour.clipped_pct > 20);
      const raw = join(dir, 'source.gray');
      const frames = Array.from({ length: 20 }, (_, i) =>
        Buffer.alloc(32 * 32, i * 10),
      );
      await writeFile(raw, Buffer.concat(frames));
      const repeated = join(dir, 'repeat.mkv');
      const altered = join(dir, 'altered.gray');
      await writeFile(
        altered,
        Buffer.concat(frames.map((f, i) => (i === 8 ? frames[7] : f))),
      );
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        '-s',
        '32x32',
        '-r',
        '10',
        '-i',
        altered,
        '-c:v',
        'ffv1',
        repeated,
      ]);
      const decoded = await command(ffmpeg, [
        '-v',
        'error',
        '-i',
        repeated,
        '-pix_fmt',
        'gray',
        '-f',
        'rawvideo',
        'pipe:1',
      ]);
      const out = Array.from({ length: decoded.stdout.length / 1024 }, (_, i) =>
        decoded.stdout.subarray(i * 1024, (i + 1) * 1024),
      );
      const match = m.matchFrames(
        out,
        frames,
        out.map((_, i) => i),
      );
      assert.ok(match.repeated_frames >= 1);
      assert.ok(match.skipped_frames >= 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'decoded lossless camera calibration detects subpixel shake independently of moving source content',
  { timeout: 120000 },
  async (t) => {
    const ffmpeg = process.env.KIMO_FFMPEG || 'ffmpeg';
    try {
      await command(ffmpeg, ['-version']);
    } catch (e) {
      if (process.env.KIMO_BENCH_REQUIRE_FFMPEG) throw e;
      t.skip('FFmpeg unavailable');
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'kimo-registration-'));
    try {
      const width = 64,
        height = 48,
        count = 32;
      const image = (x, y, t) =>
        Math.round(
          120 +
            30 * Math.sin(x * 0.31 + t * 0.14) +
            22 * Math.cos(y * 0.29 - t * 0.12),
        );
      const references = [],
        encoded = [];
      for (let t = 0; t < count; t++) {
        const source = Buffer.alloc(width * height),
          shifted = Buffer.alloc(source.length);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            source[y * width + x] = image(x, y, t);
            shifted[y * width + x] = image(x + (t % 2 ? 0.12 : -0.12), y, t);
          }
        references.push(source);
        encoded.push(shifted);
      }
      const raw = join(dir, 'input.gray'),
        video = join(dir, 'encoded.mkv');
      await writeFile(raw, Buffer.concat(encoded));
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pixel_format',
        'gray',
        '-video_size',
        `${width}x${height}`,
        '-framerate',
        '24',
        '-i',
        raw,
        '-c:v',
        'ffv1',
        video,
      ]);
      const result = await command(ffmpeg, [
        '-v',
        'error',
        '-i',
        video,
        '-pix_fmt',
        'gray',
        '-f',
        'rawvideo',
        'pipe:1',
      ]);
      const frames = Array.from({ length: count }, (_, i) =>
        result.stdout.subarray(i * width * height, (i + 1) * width * height),
      );
      const measured = sourceResidualJitter(frames, references, {
        width,
        height,
        outputWidth: 1920,
        outputHeight: 1080,
      });
      assert.equal(measured.coverage, 1);
      assert.ok(measured.jitter_px > 0.5, JSON.stringify(measured));
      const clean = sourceResidualJitter(references, references, {
        width,
        height,
        outputWidth: 1920,
        outputHeight: 1080,
      });
      assert.equal(clean.jitter_px, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
