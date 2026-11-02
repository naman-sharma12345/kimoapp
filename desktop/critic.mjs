import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { duration, rate } from './edl.mjs';
import { outputWords } from './captions.mjs';
import { cameraMetrics } from './camera.mjs';
import { run } from './audio/process.mjs';
import {
  firstSpeech,
  deadAirRatio,
  fillerCount,
  repeatTakes,
  creatorScore,
  duckDepthDb,
} from './test/bench/metrics.mjs';
import { applyPlanPatches, affectedPasses } from './planner/patch.mjs';
const weights = {
  hook: 10,
  dead_air: 15,
  filler: 10,
  cadence: 10,
  framing: 10,
  motion: 15,
  captions: 15,
  sound: 10,
  colour: 5,
};
export function refreshMeasurements(previous, patch, { music = true } = {}) {
  const metrics = { ...previous.metrics, ...patch };
  return {
    ...previous,
    ...creatorScore(metrics, weights, { speech: previous.speech, music }),
    metrics,
  };
}
export function reviewTimes(edl) {
  const total = duration(edl),
    fps = rate(edl.canvas.fps),
    cuts =
      edl.video[0]?.clips
        .slice(1, 4)
        .flatMap((c) => [c.at - 1 / fps, c.at + 1 / fps]) ?? [];
  const graphics = [...edl.overlays.filter((o) => o.kind === 'graphic')]
    .sort(
      (a, b) =>
        (b.props.box?.w ?? 0) * (b.props.box?.h ?? 0) -
        (a.props.box?.w ?? 0) * (a.props.box?.h ?? 0),
    )
    .slice(0, 3)
    .map((o) => o.at + Math.min(0.5, o.dur / 2));
  const times = [
    0,
    0.5,
    1,
    2,
    ...cuts,
    ...graphics,
    Math.max(0, total - 1 / fps),
  ];
  for (let i = 0; times.length < 12; i++) times.push((total * (i + 1)) / 13);
  return times
    .slice(0, 16)
    .map((t) => Math.max(0, Math.min(total - 1 / fps, t)));
}
/** Sparse, seeked frames only. No whole-footage vision pass. */
export async function contactSheet({ ffmpeg, path, edl, dir, signal }) {
  await mkdir(dir, { recursive: true });
  const times = reviewTimes(edl),
    paths = [];
  for (const [i, t] of times.entries()) {
    const output = join(dir, `frame-${i}.jpg`);
    await run(
      ffmpeg,
      [
        '-y',
        '-ss',
        String(t),
        '-i',
        path,
        '-frames:v',
        '1',
        '-vf',
        'scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2',
        '-q:v',
        '5',
        output,
      ],
      { signal, title: 'creator: sampling review frames' },
    );
    paths.push(output);
  }
  const columns = 4,
    rows = Math.ceil(paths.length / columns),
    sheet = join(dir, 'contact.jpg');
  await run(
    ffmpeg,
    [
      '-y',
      '-framerate',
      '1',
      '-start_number',
      '0',
      '-i',
      join(dir, 'frame-%d.jpg'),
      '-frames:v',
      '1',
      '-vf',
      `tile=${columns}x${rows}`,
      '-q:v',
      '5',
      sheet,
    ],
    { signal, title: 'creator: assembling review contact sheet' },
  );
  return {
    path: sheet,
    times,
    image: {
      label: times
        .map((t, i) => `${i}:${t.toFixed(2)}s`)
        .join(' ')
        .slice(0, 80),
      url: `data:image/jpeg;base64,${(await readFile(sheet)).toString('base64')}`,
    },
  };
}
export async function lightweightMetrics(edl, { ffmpeg, dir, signal } = {}) {
  const ws = outputWords(edl, edl.camera_plan),
    words = ws.map((w) => ({ ...w, text: w.w })),
    caps = edl.captions?.stats ?? {},
    cam = cameraMetrics(edl),
    master = edl.sound?.report?.master ?? {},
    measured = master.after ?? master.measured ?? master;
  let duck = null;
  if (ffmpeg && words.length && edl.sound?.music_id)
    try {
      const { stdout } = await run(
        ffmpeg,
        [
          '-t',
          '10',
          '-i',
          join(dir, 'creator-audio', 'music.wav'),
          '-vn',
          '-ac',
          '1',
          '-ar',
          '8000',
          '-f',
          'f32le',
          'pipe:1',
        ],
        {
          signal,
          binary: true,
          title: 'creator: checking first ten seconds of music ducking',
        },
      );
      const windows = [];
      for (let i = 0; i < stdout.length; i += 3200) {
        const end = Math.min(stdout.length, i + 3200);
        let power = 0;
        for (let j = i; j + 4 <= end; j += 4)
          power += stdout.readFloatLE(j) ** 2;
        windows.push({
          voice: words.some((w) => w.start < end / 32000 && w.end > i / 32000),
          rmsDb: 10 * Math.log10(power / Math.max(1, (end - i) / 4)),
        });
      }
      duck = duckDepthDb(windows);
    } catch (error) {
      signal?.throwIfAborted();
    }

  const clips = edl.video[0]?.clips ?? [],
    lengths = clips
      .map((c) => (c.out - c.in) / (c.speed ?? 1))
      .sort((a, b) => a - b);
  const metrics = {
    first_speech_s: firstSpeech(words),
    hook_text: edl.overlays.some(
      (o) => o.at < 3 && o.props?.element === 'hook_title',
    ),
    dead_air_ratio: deadAirRatio(words),
    filler_count: words.length ? fillerCount(words) : null,
    repeat_takes: words.length ? repeatTakes(words) : null,
    median_shot_s: lengths.length
      ? lengths[Math.floor(lengths.length / 2)]
      : null,
    max_static_s: cam.max_static_s ?? null,
    framing_variety: cam.framing_variety_30s ?? null,
    jitter_px: null,
    repeated_frames: null,
    skipped_frames: null,
    frame_match_coverage: null,
    caption_min_word_s: caps.caption_min_word_s ?? null,
    caption_safe: caps.caption_safe ?? null,
    caption_face_overlap:
      Object.values(edl.camera_plan?.heads ?? {}).some(Boolean) &&
      caps.caption_face_overlap != null
        ? caps.caption_face_overlap * 100
        : null,
    lufs: measured.lufs ?? null,
    true_peak: measured.true_peak_db ?? null,
    lra: measured.lra ?? null,
    duck_depth_db: duck,
    sfx_count_per_min:
      ((edl.sound?.sfx_count ?? 0) / Math.max(0.001, duration(edl))) * 60,
    aspect: edl.canvas.h > edl.canvas.w ? '9:16' : '16:9',
    clip_delta_e: null,
    clipped_pct: null,
  };
  const speech =
      words.length > 0 ||
      edl.audio.some((t) => t.role === 'VOICE' && t.clips.length),
    score = creatorScore(metrics, weights, {
      speech,
      music: !!edl.sound?.music_id,
    });
  return {
    ...score,
    metrics,
    scope:
      'Lightweight EDL/audio checks. Pixel jitter, source-frame matching and colour Delta E unavailable in this review; missing applicable metrics score zero. No full benchmark.',
    speech,
  };
}
export function criticResponse(response, plan, context) {
  if (
    !response ||
    !Array.isArray(response.problems) ||
    response.problems.length > 5 ||
    Object.keys(response).some((k) => k !== 'problems')
  )
    throw new Error('Critic must return at most five problems');
  const problems = response.problems.map((p) => {
    if (
      !['low', 'medium', 'high'].includes(p.severity) ||
      typeof p.message !== 'string' ||
      p.message.length > 500 ||
      !Number.isFinite(p.at) ||
      p.at < 0 ||
      p.at > context.duration ||
      !Array.isArray(p.patches) ||
      p.patches.length > 8
    )
      throw new Error('Invalid critic problem');
    return p;
  });
  const patches = problems.flatMap((p) => p.patches);
  return {
    problems,
    patches,
    plan: applyPlanPatches(plan, patches, context),
    pass: affectedPasses(patches),
  };
}
export async function critique({
  plan,
  context,
  edl,
  path,
  ffmpeg,
  dir,
  calls,
  signal,
}) {
  const measurements = await lightweightMetrics(edl, { ffmpeg, dir, signal }),
    sheet = await contactSheet({
      ffmpeg,
      path,
      edl,
      dir: join(dir, 'creator-review'),
      signal,
    });
  const response = await calls.call(
    'critic',
    `CREATOR CRITIC v1. Inspect these rendered frames with captions visible. Return only {"problems":[{"severity":"low|medium|high","at":0,"message":"specific observed issue","patches":[{"op":"replace","path":"/captions/font_scale","value":0.9}]}]}. At most five problems and eight patches per problem. Do not invent pixel metrics, facts or unavailable media. Only patch existing structured plan fields. No new paths or commands. Prioritize the hook, clarity, safe readable captions, restrained graphics, sound and colour. Empty problems is allowed; metrics are measured independently. Do not claim a missing measurement passed. Frames are row-major at ${JSON.stringify(sheet.times)}.\n${JSON.stringify({ measurements, plan, sentences: context.sentences })}`,
    [sheet.image],
  );
  return {
    ...criticResponse(response, plan, context),
    measurements,
    sheet: sheet.path,
  };
}
