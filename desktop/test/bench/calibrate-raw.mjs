// Independent observed frame IDs for the frozen real timelines. No natural-picture metric is replaced.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawnBackground } from '../../resources.cjs';
import { compose } from '../../compose.mjs';
import { youtubeMaster, measure } from '../../engine.mjs';
import { ROOT, DATA_ROOT, command, readJson, writeJson } from './io.mjs';
import { toolPaths } from './run.mjs';

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
)
  throw new Error('Hosted runners only');
const tools = toolPaths(),
  root = join(DATA_ROOT, 'raw-v2-calibration');
const ledger = await readFile(join(ROOT, 'cache/spend.json'));
const fixtures = await readJson(
  join(ROOT, 'clips/raw-v2/calibration-models.json'),
);
await mkdir(root, { recursive: true });
let attempts = 0;
globalThis.fetch = async () => {
  attempts++;
  throw new Error('Calibration is offline');
};
const numberRate = (v) => {
  const [n, d = 1] = String(v).split('/').map(Number);
  return n / d;
};
const cache = new Map(),
  W = 192,
  H = 108;
const done = (child) =>
  new Promise((resolve, reject) => {
    let error = '';
    child.stderr.on('data', (d) => {
      error = (error + d).slice(-2000);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code ? reject(new Error(error)) : resolve(),
    );
  });
async function sourceVideo(fps, count, slot) {
  if (!(count > 0 && count < 4096 && slot < 16))
    throw new Error('Barcode range exceeded');
  const key = `${fps}-${count}-${slot}`.replaceAll('/', '_');
  if (cache.has(key)) return cache.get(key);
  const path = join(root, `counter-${key}.mp4`),
    child = spawnBackground(
      tools.ffmpeg,
      [
        '-v',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pixel_format',
        'rgb24',
        '-video_size',
        `${W}x${H}`,
        '-framerate',
        String(fps),
        '-i',
        'pipe:0',
        '-frames:v',
        String(count),
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-colorspace',
        'bt709',
        '-color_trc',
        'bt709',
        '-color_primaries',
        'bt709',
        path,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
  const complete = done(child);
  complete.catch(() => {});
  child.stdin.on('error', () => {});
  for (let n = 0; n < count; n++) {
    const frame = Buffer.alloc(W * H * 3),
      code = slot * 4096 + n;
    for (let bit = 0; bit < 16; bit++)
      if (code & (1 << bit))
        frame.fill(255, (2 + bit * 3) * W * 3, (5 + bit * 3) * W * 3);
    frame.fill(255, 53 * W * 3, 56 * W * 3);
    frame.fill(255, 58 * W * 3, 61 * W * 3);
    if (!child.stdin.write(frame)) await once(child.stdin, 'drain');
  }
  child.stdin.end();
  await complete;
  cache.set(key, path);
  return path;
}
const report = [];
for (const item of fixtures.cases) {
  const e = structuredClone(item.edl),
    dir = join(root, item.id, item.aspect);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'CREDITS.txt'),
    await readFile(join(ROOT, 'clips/raw-v2/prepared', item.id, 'CREDITS.txt')),
  );
  e.canvas.w = Math.round(e.canvas.w / 10 / 2) * 2;
  e.canvas.h = Math.round(e.canvas.h / 10 / 2) * 2;
  let slot = 0;
  for (const s of e.sources) {
    if (s.kind === 'audio' || !s.w) {
      continue;
    }
    s.calibrationSlot = slot;
    s.path = await sourceVideo(s.fps, s.calibrationFrames, slot++);
    s.frames = s.calibrationFrames;
    s.w = W;
    s.h = H;
    s.audio = false;
  }
  const silence = join(root, 'silence.flac');
  if (!cache.has('silence')) {
    await command(tools.ffmpeg, [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-t',
      '180',
      '-c:a',
      'flac',
      silence,
    ]);
    cache.set('silence', silence);
  }
  for (const s of e.sources) if (s.kind === 'audio' || !s.w) s.path = silence;
  for (const t of e.audio)
    for (const c of t.clips) if (c.asset) c.asset = silence;
  const clips = e.video.flatMap((t) => t.clips);
  for (const c of clips)
    for (const k of c.camera ?? [])
      if (
        Math.abs(k.zoom - 1) > 1e-8 ||
        Math.abs(k.x - 0.5) > 1e-8 ||
        Math.abs(k.y - 0.5) > 1e-8
      )
        throw new Error(
          'Companion decoder requires the fixed centre cameras in this dataset; punch calibration remains in the independent seven-rate tests',
        );
  const master = join(dir, 'master.mkv'),
    final = join(dir, 'final.mp4');
  const composed = await compose({
    ...tools,
    edl: e,
    output: master,
    dir: join(dir, 'work'),
    fontsDir: tools.env.KIMO_FONTS,
    assetRoot: dir,
    emit: () => {},
  });
  await youtubeMaster({
    ffmpeg: tools.ffmpeg,
    input: master,
    output: final,
    P: { width: e.canvas.w, height: e.canvas.h },
    m: await measure(tools.ffmpeg, tools.ffprobe, master),
    encoder: null,
  });
  const fps = numberRate(e.canvas.fps),
    expectedFrames = Math.ceil(
      Math.max(...clips.map((c) => c.at + (c.out - c.in) / (c.speed ?? 1))) *
        fps -
        1e-7,
    ),
    faults = [];
  let n = 0,
    mismatches = 0,
    repeats = 0,
    skips = 0,
    previous = null,
    previousExpected = null;
  const child = spawnBackground(
    tools.ffmpeg,
    [
      '-v',
      'error',
      '-i',
      final,
      '-an',
      '-pix_fmt',
      'gray',
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const complete = done(child);
  complete.catch(() => {});
  let buffered = Buffer.alloc(0);
  const size = e.canvas.w * e.canvas.h;
  for await (const chunk of child.stdout) {
    buffered = Buffer.concat([buffered, chunk]);
    let at = 0;
    while (at + size <= buffered.length) {
      const picture = buffered.subarray(at, at + size);
      at += size;
      const row = (y) => {
        const r = Math.min(e.canvas.h - 1, Math.floor((y / H) * e.canvas.h));
        let total = 0;
        for (let x = 2; x < e.canvas.w - 2; x++)
          total += picture[r * e.canvas.w + x];
        return total / (e.canvas.w - 4);
      };
      let observed = null;
      if (row(54) > 128 && row(59) > 128) {
        observed = 0;
        for (let bit = 0; bit < 16; bit++)
          if (row(3.5 + bit * 3) > 128) observed |= 1 << bit;
      }
      // Oracle deliberately does not call framePlan/frameCount or any production source-index helper.
      const active = clips
        .filter(
          (c) =>
            n >= Math.ceil(c.at * fps - 1e-7) &&
            n <
              Math.ceil((c.at + (c.out - c.in) / (c.speed ?? 1)) * fps - 1e-7),
        )
        .at(-1);
      let expected = null;
      if (active) {
        const source = e.sources.find((s) => s.id === active.src),
          id = Math.min(
            source.calibrationFrames - 1,
            Math.max(
              0,
              Math.round(
                (n / fps - active.at) *
                  (active.speed ?? 1) *
                  numberRate(source.fps) +
                  active.in * numberRate(source.fps),
              ),
            ),
          );
        expected = source.calibrationSlot * 4096 + id;
      }
      if (observed !== expected) {
        mismatches++;
        if (faults.length < 8) faults.push({ frame: n, observed, expected });
      }
      if (
        expected != null &&
        previousExpected != null &&
        Math.floor(expected / 4096) === Math.floor(previousExpected / 4096)
      ) {
        const planned = expected - previousExpected,
          actual =
            observed == null || previous == null ? null : observed - previous;
        if (planned > 0 && actual === 0) repeats++;
        if (actual != null && actual > planned) skips += actual - planned;
      }
      previous = observed;
      previousExpected = expected;
      n++;
    }
    buffered = Buffer.from(buffered.subarray(at));
  }
  await complete;
  if (buffered.length) throw new Error('Partial decoded calibration frame');
  const summary = {
    id: item.id,
    aspect: item.aspect,
    originalEdlSha256: item.originalEdlSha256,
    scope: fixtures.scope,
    canvas: e.canvas,
    fps: e.canvas.fps,
    decodedFrames: n,
    plannedFrames: composed.frames,
    independentlyExpectedFrames: expectedFrames,
    mismatches,
    repeated_frames: repeats,
    skipped_frames: skips,
    pass:
      mismatches === 0 &&
      n === expectedFrames &&
      n === composed.frames &&
      repeats === 0 &&
      skips === 0,
    faults,
    strategy: composed.strategy,
    networkAttempts: attempts,
    reservedUsdDelta: 0,
  };
  report.push(summary);
  await writeJson(join(dir, 'result.json'), summary);
  console.log(JSON.stringify(summary));
}
await writeJson(join(root, 'summary.json'), {
  scope: fixtures.scope,
  cases: report,
  pass: report.every((r) => r.pass),
  networkAttempts: attempts,
  reservedUsdDelta: 0,
});
if (attempts || !ledger.equals(await readFile(join(ROOT, 'cache/spend.json'))))
  throw new Error('Offline/budget invariant violated');
if (report.some((r) => !r.pass)) process.exitCode = 1;
