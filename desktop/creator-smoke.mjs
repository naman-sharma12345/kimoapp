// Explicit offline CLI fixture entry point. Not reachable from product IPC.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { defaultPlan } from './planner.mjs';
import { getTemplate } from './planner/templates.mjs';
import { plannerContext, compilePlan } from './planner/compile.mjs';
import { buildTranscript, analyzeAudio, transcribe } from './transcript.mjs';
import { run } from './audio/process.mjs';
import { runEdit, probe, canvasFps } from './engine.mjs';
import { headTrack } from './camera-probe.mjs';
import { applyCaptions } from './captions.mjs';

export async function runCreatorSmoke(
  config,
  { ffmpeg, ffprobe, env, bin, emit = () => {} },
) {
  if (process.env.CI !== 'true')
    throw new Error('Creator release smoke runs only on a hosted CI runner');
  const start = Date.now(),
    dir = config.directory;
  await mkdir(dir, { recursive: true });
  const files = [],
    clips = [],
    timings = {};
  for (const [i, input] of config.inputs.entries()) {
    const f = await probe(ffprobe, input.path);
    if (!f) throw new Error('Fixture source is unreadable');
    files.push(f);
    let transcript = null;
    if (f.audio) {
      const t = Date.now();
      if (config.coldTranscript) {
        transcript = await transcribe({
          ffmpeg,
          whisper: env.KIMO_WHISPER_BIN,
          model: env.KIMO_WHISPER_MODEL,
          input: f.path,
          src: `f${i}`,
          workDir: join(dir, 'transcript'),
          cacheDir: join(dir, 'cache'),
          onProgress: () => {},
        });
      } else if (input.words) {
        const words = JSON.parse(await readFile(input.words, 'utf8')),
          pcm = await run(
            ffmpeg,
            [
              '-i',
              f.path,
              '-vn',
              '-ar',
              '16000',
              '-ac',
              '1',
              '-f',
              'f32le',
              '-',
            ],
            { binary: true, title: 'fixture transcript alignment' },
          ),
          samples = Float32Array.from(
            { length: pcm.stdout.length / 4 },
            (_, i) => pcm.stdout.readFloatLE(i * 4),
          );
        transcript = buildTranscript({
          words: words.map((w) => ({ ...w, w: w.w ?? w.text })),
          whisperLang: 'en',
          analysis: analyzeAudio(samples),
          src: `f${i}`,
        });
      }
      timings.transcript = (timings.transcript ?? 0) + (Date.now() - t) / 1000;
    }
    clips.push({
      src: `f${i}`,
      file: f,
      duration: f.duration,
      kind: transcript?.words.length ? 'speech' : 'broll',
      transcript,
    });
  }
  const P = config.canvas ?? {
      width:
        config.template.startsWith('shorts') ||
        config.template === 'podcast-clips'
          ? 1080
          : 1920,
      height:
        config.template.startsWith('shorts') ||
        config.template === 'podcast-clips'
          ? 1920
          : 1080,
    },
    context = plannerContext({
      template: getTemplate(config.template),
      files,
      clips,
      P,
      note: config.note ?? '',
    }),
    plan = defaultPlan(context);
  if (config.staticCamera) {
    if (!context.sentences.length)
      plan.graphics = [
        { kind: 'hook_title', text: 'moving subject', at: 0.1, dur: 2 },
      ];
  }
  const heads = {};
  for (const file of files.filter((f) => f.kind === 'video'))
    heads[file.path.replaceAll('\\', '/')] = await headTrack({
      ffmpeg,
      file,
      cacheDir: join(dir, 'cache'),
    });
  const { edl } = compilePlan({
    plan,
    context,
    files,
    clips,
    P,
    fps: canvasFps(files),
    heads,
  });
  if (config.staticCamera)
    for (const track of edl.video)
      for (const c of track.clips) {
        c.camera = [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'hold' }];
        // The director's follow/drift are independent of its camera keys.
        // Remove both for this explicitly fixed-camera frame-matching fixture.
        delete c.follow;
        delete c.drift;
        c.camera_by = 'CI fixed-centre fixture';
      }
  if (config.staticCamera)
    applyCaptions(
      edl,
      {
        enabled: plan.captions.enabled,
        style: plan.captions.style,
        position: 'bottom',
      },
      edl.camera_plan,
    );
  await writeFile(
    join(dir, 'fixture-plan.json'),
    JSON.stringify(
      {
        origin: 'deterministic offline fixture; not recorded provider output',
        context,
        plan,
      },
      null,
      2,
    ),
  );
  const controller = new AbortController();
  const previousFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    throw new Error('Network disabled in creator replay smoke');
  };
  let result;
  try {
    result = await runEdit({
      files,
      dir,
      mode: 'manual',
      preset: P.height > P.width ? 'shorts' : 'youtube',
      style: config.template,
      edl,
      ffmpeg,
      ffprobe,
      bin,
      env: {
        ...env,
        KIMO_CREATOR_REPLAY: '1',
        KIMO_CACHE_DIR: join(dir, 'cache'),
      },
      signal: controller.signal,
      emit,
      preview: config.preview === true,
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
  if (attempts) throw new Error('Replay attempted a network request');
  const metrics = JSON.parse(await readFile(join(dir, 'metrics.json'), 'utf8'));
  metrics.performance.seconds.transcript = timings.transcript ?? 0;
  metrics.performance.seconds.total = (Date.now() - start) / 1000;
  metrics.performance.checks = Object.entries(metrics.performance.budgets).map(
    ([stage, max]) => ({
      stage,
      max,
      seconds: metrics.performance.seconds[stage],
      ok: metrics.performance.seconds[stage] <= max,
    }),
  );
  metrics.replay = {
    networkAttempts: attempts,
    paidCalls: 0,
    mode: 'saved deterministic plan replay',
    providerAdherence: false,
    staticCamera: !!config.staticCamera,
  };
  await writeFile(join(dir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  return { ...result, replay: metrics.replay };
}
