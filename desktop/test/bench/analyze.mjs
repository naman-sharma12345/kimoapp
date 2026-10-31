import { join } from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { ROOT, command, hashFile, readJson, probeFile } from './io.mjs';
import * as metric from './metrics.mjs';
import { sourceResidualJitter } from './registration.mjs';
import { workerThreads } from '../../resources.cjs';
import { rectFilter } from '../../sam.mjs';
import { curveValue, curveSampler } from '../../edl.mjs';

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
          : source.type !== 'media'
            ? 'graphic'
            : asset?.width > 0
              ? 'cut'
              : /sfx|whoosh|impact|pop|click/i.test(
                    `${asset?.path} ${track.name}`,
                  )
                ? 'sfx'
                : 'music';
      const zoom = curveValue(c.props?.scale, 0, 1);
      const event = {
        id: c.id,
        track: track.id,
        kind,
        start: c.start,
        end: c.start + c.duration,
        text: source.text,
        path: asset?.path,
        sourceFps: asset?.fps,
        sourceWidth: asset?.width,
        sourceHeight: asset?.height,
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
      if (source.type === 'shape') {
        const zoom = curveValue(c.props?.scale, 0, 1),
          w = (Number(source.width) * zoom) / project.width,
          h = (Number(source.height) * zoom) / project.height;
        event.box =
          Number.isFinite(w) && Number.isFinite(h)
            ? {
                x: 0.5 + curveValue(c.props?.x, 0) / project.width - w / 2,
                y: 0.5 + curveValue(c.props?.y, 0) / project.height - h / 2,
                w,
                h,
              }
            : null;
        event.geometry = 'native shape extent';
        if (
          ['x', 'y', 'scale', 'rotation'].some(
            (k) => c.props?.[k]?.keys?.length || c.props?.[k]?.expr?.length,
          )
        )
          event.box = null;
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
  ffprobe = process.env.KIMO_FFPROBE ||
    ffmpeg.replace(/ffmpeg(?=\.exe$|$)/i, 'ffprobe'),
) {
  let repeats = 0,
    skips = 0,
    compared = 0,
    total = Math.max(0, Math.round(duration * fps) - 1);
  const details = [];
  const metadata = new Map();
  let cameraSquared = 0,
    cameraMeasured = 0,
    cameraEligible = total;
  // Segments keep their EDL time mapping; never treat an intentional jump cut as a drop.
  for (const e of visibleSourceSegments(events, duration)) {
    const c = e.raw;
    const duration = e.end - e.start;
    const firstOutput = Math.ceil(e.start * fps - 1e-7);
    const lastOutput = Math.ceil(e.end * fps - 1e-7);
    const transform = {};
    let animated = false;
    for (const key of ['x', 'y', 'scale', 'rotation', 'opacity']) {
      const at = curveSampler(
        c.props?.[key],
        ['scale', 'opacity'].includes(key) ? 1 : 0,
      );
      transform[key] = at(firstOutput / fps - c.start);
      for (let frame = firstOutput + 1; frame < lastOutput; frame++)
        if (Math.abs(at(frame / fps - c.start) - transform[key]) > 1e-7) {
          animated = true;
          break;
        }
    }
    if (
      !e.path ||
      !e.sourceFps ||
      transform.scale < 1 ||
      transform.x ||
      transform.y ||
      Math.abs(transform.opacity - 1) > 1e-7 ||
      curveValue(c.props?.fit, 0, 1) === 0 ||
      animated ||
      c.speed_curve ||
      c.motion_path ||
      transform.rotation
    ) {
      details.push({
        id: e.id,
        unavailable: 'nonlinear/animated source mapping',
      });
      continue;
    }
    const size = 108 * 192;
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
    // Spatial alignment must match the floating-point source rectangle. An
    // integer post-scale crop can favor an adjacent moving source frame.
    const sw = e.sourceWidth,
      sh = e.sourceHeight,
      aspect = width / height;
    if (!(sw > 0 && sh > 0)) {
      details.push({ id: e.id, unavailable: 'source dimensions missing' });
      continue;
    }
    const cropW = (sw / sh > aspect ? sh * aspect : sw) / transform.scale,
      cropH = (sw / sh > aspect ? sh : sw / aspect) / transform.scale;
    const vf = `scale=out_color_matrix=bt709:out_range=tv,format=yuva444p,${rectFilter([[(sw - cropW) / 2, (sh - cropH) / 2, cropW, cropH]])},scale=${width}:${height}:flags=lanczos+accurate_rnd+full_chroma_int,scale=108:192:flags=area,format=gray`;
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
    if (!metadata.has(e.path))
      metadata.set(e.path, await probeFile(ffprobe, e.path));
    const recordedFrames = Number(metadata.get(e.path).video?.nb_frames);
    const sourceLast = recordedFrames > 0 ? recordedFrames - 1 : Infinity;
    const expected = outputFrames.map(
      (_, i) =>
        Math.min(
          sourceLast,
          Math.round(
            (((firstOutput + i) / fps - e.start) * e.speed + e.in_point) *
              e.sourceFps,
          ),
        ) - firstSource,
    );
    // New captions are not present in the source. Exclude conservative envelopes
    // from BOTH sides rather than letting changing words select a nearby frame.
    const text = events.filter(
      (v) =>
        (v.text || v.kind === 'graphic') && v.start < e.end && v.end > e.start,
    );
    const masks = text.length
      ? outputFrames.map((_, i) => {
          const time = (firstOutput + i) / fps;
          const mask = new Uint8Array(size).fill(1);
          for (const event of text.filter(
            (v) => v.start <= time && v.end > time,
          )) {
            if (!event.box) {
              mask.fill(0);
              break;
            }
            const b = event.box,
              x = b.x + b.w / 2,
              y = b.y + b.h / 2;
            const x0 = Math.max(0, Math.floor((x - b.w * 0.8 - 0.02) * 108)),
              x1 = Math.min(108, Math.ceil((x + b.w * 0.8 + 0.02) * 108));
            const y0 = Math.max(0, Math.floor((y - b.h - 0.02) * 192)),
              y1 = Math.min(192, Math.ceil((y + b.h + 0.02) * 192));
            for (let row = y0; row < y1; row++)
              mask.fill(0, row * 108 + x0, row * 108 + x1);
          }
          return mask;
        })
      : undefined;
    const matched = metric.matchFrames(outputFrames, sourceFrames, expected, {
      masks,
      photometric: true,
    });
    const camera = sourceResidualJitter(
      outputFrames,
      expected.map((index) => sourceFrames[index]),
      {
        width: 108,
        height: 192,
        outputWidth: width,
        outputHeight: height,
        masks,
      },
    );
    // Exclude only the six SG boundary samples per measured segment; unsupported
    // segments still lower global coverage. Never fill missing registration with zero.
    cameraEligible -= Math.min(6, outputFrames.length);
    if (camera.jitter_px != null) {
      cameraSquared += camera.jitter_px ** 2 * camera.measured;
      cameraMeasured += camera.measured;
    }
    repeats += matched.repeated_frames ?? 0;
    skips += matched.skipped_frames ?? 0;
    compared += matched.compared;
    details.push({ id: e.id, ...matched, indices: undefined, camera });
  }
  return {
    repeated_frames: compared ? repeats : null,
    skipped_frames: compared ? skips : null,
    frame_match_coverage: total ? compared / total : 0,
    frame_match: details,
    jitter_px:
      cameraMeasured && cameraMeasured / Math.max(1, cameraEligible) >= 0.95
        ? Math.sqrt(cameraSquared / cameraMeasured)
        : null,
    camera_registration_coverage: cameraMeasured / Math.max(1, cameraEligible),
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
    ffprobe,
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
    content_motion_jitter_px: jitter?.jitter ?? null,
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
    version: 3,
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
        '108x192 grey affine-photometric MAD +/-3 source frames (best/second cost ratio <=0.9 and absolute separation >=0.02) with float perspective alignment; no integer crop approximation. EDL cuts are excluded. Text envelopes are masked on both source and output; unknown animated geometry is unmeasured. Expected indices use the global grid, source rate and speed, clamped to exact ffprobe nb_frames when available. Intended EOF/rate-conversion/slow-motion holds are not judder. Animated mappings and ambiguous static frames reduce coverage.',
      camera:
        'Source-referenced small-translation least squares with affine brightness fit on 108x192 decoded grey frames; masked overlay envelopes and gradient neighbours. SG7 high-frequency residual normalized to 1080 short side. Flat/aperture/poor fits are unavailable; requires 95% eligible coverage. Physical source motion cancels against the same expected source frame. This estimate does not certify source-frame identity. The old whole-picture measure remains content_motion_jitter_px. Compare measurement version-3 before and after only.',
      delivery:
        'Format qualityChecks (excluding whole-content motion) plus ffprobe codec, BT.709 and audio bitrate; trace_headers verifies IDR keyframes and ffprobe timestamps verify CFR. Motion retains its separate source-referenced gates.',
    },
    events: events.map(({ raw, ...e }) => e),
    analysis: { frozen: a.frozen, silences: a.silences },
  };
}

export async function retainFinal(source, output) {
  if (source !== output) await copyFile(source, output);
}
