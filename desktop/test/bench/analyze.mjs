import { join } from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { ROOT, command, hashFile, readJson } from './io.mjs';
import * as metric from './metrics.mjs';
import { workerThreads } from '../../resources.cjs';

const base = (clip, key, fallback = 0) =>
  Number(clip.props?.[key]?.base ?? fallback);
export function projectEdl(project) {
  const captionIds = new Set(
    JSON.stringify(project.editorial?.captions ?? {}).match(/clip\d+/g) ?? [],
  );
  const events = [];
  for (const track of project.tracks ?? [])
    for (const c of track.clips ?? []) {
      const asset = project.assets?.[c.source?.asset];
      const source = c.source ?? {};
      const kind =
        source.type === 'text'
          ? captionIds.has(c.id)
            ? 'caption'
            : 'graphic'
          : asset?.width > 0
            ? 'cut'
            : /sfx|whoosh|impact|pop|click/i.test(
                  `${asset?.path} ${track.name}`,
                )
              ? 'sfx'
              : 'music';
      const zoom = base(c, 'scale', 1);
      const event = {
        id: c.id,
        track: track.id,
        kind,
        start: c.start,
        end: c.start + c.duration,
        text: source.text,
        path: asset?.path,
        sourceFps: asset?.fps,
        in_point: c.in_point ?? 0,
        speed: c.speed ?? 1,
        zoom,
        raw: c,
        muted: Boolean(track.muted || c.audio?.mute),
        music:
          kind === 'music' ||
          /music|soundtrack|score|bed/i.test(track.name ?? '') ||
          (c.audio?.duck_gain?.keys ?? []).some(
            (k) => Number(k.value ?? k.v ?? k[1]) < 0.95,
          ),
      };
      if (source.type === 'text') {
        const size = Number(source.size) || 48;
        const lines = String(source.text).split('\n');
        const w =
          (Math.max(...lines.map((s) => [...s].length)) * size * 0.62) /
          project.width;
        const h = (lines.length * size * 1.25) / project.height;
        event.box = {
          x: 0.5 + base(c, 'x') / project.width - w / 2,
          y: 0.5 + base(c, 'y') / project.height - h / 2,
          w,
          h,
        };
        event.geometry = 'estimated font envelope, not raster bounds';
        if (
          ['x', 'y', 'rotation'].some(
            (k) => c.props?.[k]?.keys?.length || c.props?.[k]?.expr?.length,
          ) ||
          base(c, 'rotation')
        ) {
          event.box = null;
          event.geometry = 'unavailable: animated/rotated text';
        }
      }
      events.push(event);
      if (kind === 'cut') {
        const keys = c.props?.scale?.keys ?? [];
        for (const k of keys) {
          const t = Number(k.time ?? k.t);
          const value = Number(k.value ?? k.v);
          if (Number.isFinite(t) && Number.isFinite(value))
            events.push({
              id: `${c.id}-punch-${t}`,
              kind: 'punch',
              start: c.start + t,
              end: c.start + c.duration,
              zoom: value,
            });
        }
        if (zoom > 1.01) events.push({ ...event, kind: 'punch' });
      }
    }
  return events;
}

export function whisperWords(json) {
  const result = [];
  for (const segment of json.transcription ?? []) {
    for (const token of segment.tokens ?? []) {
      if (
        /^\[_|^<\|/.test(token.text) ||
        !(token.offsets?.to > token.offsets?.from)
      )
        continue;
      const word = {
        text: token.text,
        start: token.offsets.from / 1000,
        end: token.offsets.to / 1000,
      };
      const previous = result.at(-1);
      if (
        previous &&
        !/^\s/u.test(word.text) &&
        word.start <= previous.end + 0.05
      ) {
        previous.text += word.text;
        previous.end = word.end;
      } else result.push({ ...word, text: word.text.trim() });
    }
  }
  return result.filter((w) => w.text);
}
export async function transcribe({ ffmpeg, input, whisper, model, directory }) {
  if (!whisper || !model)
    throw new Error(
      'Whisper binary/model required for final-audio word metrics',
    );
  const [mediaHash, modelHash] = await Promise.all([
    hashFile(input),
    hashFile(model),
  ]);
  const key = `${mediaHash}-${modelHash}`;
  await mkdir(directory, { recursive: true });
  const path = join(directory, key + '.json');
  try {
    return whisperWords(await readJson(path));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const wav = join(directory, key + '.wav');
  await command(ffmpeg, [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-i',
    input,
    '-vn',
    '-ar',
    '16000',
    '-ac',
    '1',
    wav,
  ]);
  await command(whisper, [
    '-m',
    model,
    '-f',
    wav,
    '-ojf',
    '-of',
    join(directory, key),
    '-l',
    'auto',
    '-ml',
    '1',
    '-sow',
    '-t',
    String(workerThreads()),
    '-ng',
  ]);
  return whisperWords(await readJson(path));
}
const split = (data, size) =>
  Array.from({ length: Math.floor(data.length / size) }, (_, i) =>
    data.subarray(i * size, (i + 1) * size),
  );
export function visibleSourceSegments(events, duration) {
  const cuts = events.filter((e) => e.kind === 'cut');
  const times = [
    ...new Set([0, duration, ...cuts.flatMap((e) => [e.start, e.end])]),
  ]
    .filter((t) => t >= 0 && t <= duration)
    .sort((a, b) => a - b);
  const segments = [];
  for (let i = 1; i < times.length; i++) {
    const start = times[i - 1],
      end = times[i];
    const e = cuts.findLast((c) => c.start <= start && c.end >= end);
    if (!e) continue;
    const previous = segments.at(-1);
    if (previous?.id === e.id && previous.end === start) previous.end = end;
    else
      segments.push({
        ...e,
        start,
        end,
        in_point: e.in_point + (start - e.start) * e.speed,
      });
  }
  return segments;
}
export async function frameSourceMetrics(
  ffmpeg,
  output,
  events,
  fps,
  width,
  height,
  duration,
) {
  let repeats = 0,
    skips = 0,
    compared = 0,
    total = Math.max(0, Math.round(duration * fps) - 1);
  const details = [];
  // Segments keep their EDL time mapping; never treat an intentional jump cut as a drop.
  for (const e of visibleSourceSegments(events, duration)) {
    const c = e.raw;
    const duration = e.end - e.start;
    const animated = ['x', 'y', 'scale', 'rotation'].some(
      (k) => c.props?.[k]?.keys?.length || c.props?.[k]?.expr?.length,
    );
    if (
      !e.path ||
      !e.sourceFps ||
      e.zoom < 1 ||
      base(c, 'x') ||
      base(c, 'y') ||
      animated ||
      c.speed_curve ||
      c.motion_path ||
      base(c, 'rotation')
    ) {
      details.push({
        id: e.id,
        unavailable: 'nonlinear/animated source mapping',
      });
      continue;
    }
    const size = 108 * 192;
    const firstOutput = Math.ceil(e.start * fps - 1e-7);
    const lastOutput = Math.ceil(e.end * fps - 1e-7);
    const firstSource = Math.max(0, Math.round(e.in_point * e.sourceFps) - 4);
    const offset = Math.max(0, (firstSource - 0.5) / e.sourceFps);
    const out = await command(ffmpeg, [
      '-nostdin',
      '-v',
      'error',
      '-i',
      output,
      '-an',
      '-vf',
      `trim=start_frame=${firstOutput}:end_frame=${lastOutput},scale=108:192:flags=area,format=gray`,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      'pipe:1',
    ]);
    const zoom = e.zoom;
    const cropW = Math.min(width / zoom, width),
      cropH = Math.min(height / zoom, height);
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},crop=${Math.floor(cropW / 2) * 2}:${Math.floor(cropH / 2) * 2},scale=108:192:flags=area,format=gray`;
    const src = await command(ffmpeg, [
      '-nostdin',
      '-v',
      'error',
      '-ss',
      String(offset),
      '-i',
      e.path,
      '-t',
      String(duration * e.speed + 8 / e.sourceFps),
      '-an',
      '-vf',
      vf,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      'pipe:1',
    ]);
    const outputFrames = split(out.stdout, size),
      sourceFrames = split(src.stdout, size);
    const expected = outputFrames.map(
      (_, i) =>
        Math.round(
          (((firstOutput + i) / fps - e.start) * e.speed + e.in_point) *
            e.sourceFps,
        ) - firstSource,
    );
    const matched = metric.matchFrames(outputFrames, sourceFrames, expected);
    repeats += matched.repeated_frames ?? 0;
    skips += matched.skipped_frames ?? 0;
    compared += matched.compared;
    details.push({ id: e.id, ...matched, indices: undefined });
  }
  return {
    repeated_frames: compared ? repeats : null,
    skipped_frames: compared ? skips : null,
    frame_match_coverage: total ? compared / total : 0,
    frame_match: details,
  };
}

/** Sampled midtones/skin heuristic; explicitly not a trained face detector. */
export async function sampledColour(ffmpeg, path, duration, events) {
  const W = 192,
    H = 108;
  const { stdout } = await command(ffmpeg, [
    '-nostdin',
    '-v',
    'error',
    '-i',
    path,
    '-an',
    '-vf',
    `fps=1,scale=${W}:${H},format=rgb24`,
    '-f',
    'rawvideo',
    'pipe:1',
  ]);
  const frames = split(stdout, W * H * 3),
    colours = [],
    subjects = [];
  const byClip = new Map();
  for (let t = 0; t < frames.length; t++) {
    const f = frames[t],
      rgb = [0, 0, 0];
    let n = 0,
      skin = 0,
      x0 = W,
      y0 = H,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3,
          r = f[i],
          g = f[i + 1],
          b = f[i + 2];
        if (r > 35 && r < 225 && g > 25 && g < 225 && b > 20 && b < 225) {
          rgb[0] += r;
          rgb[1] += g;
          rgb[2] += b;
          n++;
        }
        if (
          x > W * 0.15 &&
          x < W * 0.85 &&
          y < H * 0.65 &&
          r > 95 &&
          g > 40 &&
          b > 20 &&
          r > g &&
          r > b &&
          Math.max(r, g, b) - Math.min(r, g, b) > 15
        ) {
          skin++;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    if (skin > W * H * 0.005)
      subjects.push({
        start: t,
        end: Math.min(duration, t + 1),
        box: {
          x: x0 / W,
          y: y0 / H,
          w: (x1 - x0 + 1) / W,
          h: (y1 - y0 + 1) / H,
        },
      });
    const clip = events.findLast(
      (e) => e.kind === 'cut' && t >= e.start && t < e.end,
    );
    if (clip && n) {
      const list = byClip.get(clip.id) ?? [];
      list.push(rgb.map((v) => v / n));
      byClip.set(clip.id, list);
    }
  }
  for (const list of byClip.values())
    colours.push(
      [0, 1, 2].map((k) => list.reduce((s, c) => s + c[k], 0) / list.length),
    );
  // LUT operates on expanded full-range luma, preserving every pixel/frame.
  const { stderr } = await command(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-nostats',
    '-i',
    path,
    '-an',
    '-vf',
    "scale=in_range=auto:out_range=full,format=yuv444p,lutyuv=y='if(eq(val,0)+eq(val,255),255,0)':u=128:v=128,signalstats,metadata=print",
    '-f',
    'null',
    '-',
  ]);
  const values = [...stderr.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map(
    (m) => (+m[1] / 255) * 100,
  );
  return {
    clip_delta_e: metric.clipDeltaE(colours),
    clipped_pct: values.length
      ? values.reduce((s, v) => s + v, 0) / values.length
      : null,
    subjects,
  };
}
export async function measureRun({
  ffmpeg,
  ffprobe,
  output,
  project,
  words,
  quality,
  aspect,
  speech,
  jitter,
  musicStem,
}) {
  const a = await metric.analyzeMedia(ffmpeg, ffprobe, output);
  const events = projectEdl(project);
  const captions = events.filter((e) => e.kind === 'caption');
  const colour = await sampledColour(ffmpeg, output, a.info.duration, events);
  const frame = await frameSourceMetrics(
    ffmpeg,
    output,
    events,
    a.info.fps,
    a.info.video.width,
    a.info.video.height,
    a.info.duration,
  );
  const delivery = await metric.inspectDelivery(
    ffmpeg,
    ffprobe,
    output,
    a.info.fps,
  );
  const values = {
    aspect,
    duration_s: a.info.duration,
    first_speech_s: speech ? metric.firstSpeech(words) : null,
    hook_text: metric.hookText(events.filter((e) => e.text)),
    dead_air_ratio: speech ? metric.deadAirRatio(words) : null,
    filler_count: speech ? metric.fillerCount(words) : null,
    repeat_takes: speech ? metric.repeatTakes(words) : null,
    ...metric.shotCadence(events, a.info.duration, a.sceneCuts),
    framing_variety: metric.framingVariety(events, a.info.duration),
    jitter_px: jitter?.jitter ?? null,
    ...frame,
    caption_min_word_s: metric.captionMinWord(captions),
    caption_safe: metric.captionSafe(captions, aspect),
    caption_face_overlap: metric.captionFaceOverlap(
      captions,
      colour.subjects,
      a.info.fps,
    ),
    lufs: a.lufs,
    true_peak: a.true_peak,
    lra: a.lra,
    duck_depth_db: musicStem
      ? await metric.measureDuckDepth(ffmpeg, musicStem, words)
      : metric.estimateDuckDepth(events, words, a.info.duration),
    sfx_count_per_min: metric.sfxPerMinute(events, a.info.duration),
    clip_delta_e: colour.clip_delta_e,
    clipped_pct: colour.clipped_pct,
    ...delivery,
    delivery_ok:
      metric.deliveryOk(quality, a.info) &&
      delivery.closed_gop &&
      delivery.cfr_ok,
  };
  const weights = await readJson(join(ROOT, 'score.json'));
  const spec = await readJson(join(ROOT, 'creator-spec.json'));
  const checks = metric.assessMetrics(values, spec, {
    speech,
    music: events.some((e) => e.kind === 'music' || e.music),
  });
  if (!musicStem) {
    const duck = checks.find((check) => check.name === 'duck_depth_db');
    if (duck) duck.estimated = true;
  }
  return {
    version: 1,
    values,
    checks,
    creator: metric.creatorScore(values, weights, {
      speech,
      music: events.some((e) => e.kind === 'music' || e.music),
    }),
    evidence: {
      speech:
        'Whisper full token timestamps on FINAL audio; token join and filler context are estimates',
      captions:
        'Engine editorial caption ids; conservative font envelopes; skin/centre subject heuristic at 1 fps. Not face-detector certification.',
      colour:
        'CIEDE2000 on per-clip sampled midtone RGB means; full-frame full-range luma clipping.',
      duck: musicStem
        ? 'RMS music-stem level under speech versus gaps.'
        : 'Estimated from saved music/background-audio volume and duck-gain envelopes; source dynamics are unknown. Unavailable if no bed or speech/gap windows exist.',
      frame:
        '108x192 grey MAD +/-3 source frames, EDL cuts excluded. Expected source indices use the global output grid, source rate and clip speed. Intentional rate-conversion/slow-motion holds are not judder. Animated mappings explicitly reduce coverage; ambiguous static frames remain unmeasured.',
      delivery:
        'qualityChecks plus ffprobe codec, BT.709 and audio bitrate; trace_headers verifies IDR keyframes and ffprobe timestamps verify CFR.',
    },
    events: events.map(({ raw, ...e }) => e),
    analysis: { frozen: a.frozen, silences: a.silences },
  };
}

export async function retainFinal(source, output) {
  if (source !== output) await copyFile(source, output);
}
