// Full-resolution raw-footage timing companions. The clean quality outputs remain separate.
import { readFile, mkdir, copyFile, unlink } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnBackground, workerThreads } from '../../resources.cjs';
import { compose } from '../../compose.mjs';
import { youtubeMaster, measure } from '../../engine.mjs';
import {
  ROOT,
  DATA_ROOT,
  command,
  readJson,
  writeJson,
  hashFile,
  isMain,
} from './io.mjs';
import { toolPaths } from './run.mjs';

const rate = (v) => {
  const [n, d = 1] = String(v).split('/').map(Number);
  return n / d;
};
export function rawBarcodeFilter(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 15)
    throw new Error('Invalid barcode slot');
  const filters = [
    'drawbox=x=720:y=4:w=480:h=24:color=black:t=fill',
    'drawbox=x=720:y=4:w=16:h=24:color=white:t=fill',
    'drawbox=x=1184:y=4:w=16:h=24:color=white:t=fill',
  ];
  for (let bit = 0; bit < 16; bit++)
    filters.push(
      `drawbox=x=${744 + bit * 26}:y=4:w=26:h=24:color=white:t=fill:enable='mod(floor((n+${slot * 4096})/${2 ** bit}),2)'`,
    );
  return filters.join(',');
}
export async function readRawBarcodes(ffmpeg, path, canvas, fault = false) {
  const scale = Math.max(canvas.w / 1920, canvas.h / 1080);
  const w = Math.round((480 * scale) / 2) * 2,
    h = Math.ceil((24 * scale) / 2) * 2;
  const vf = `crop=${w}:${h}:(iw-${w})/2:${Math.round(4 * scale)}:exact=1,scale=480:24:flags=area,format=gray${fault ? ',shuffleframes=0 0 2 3 4' : ''}`;
  const child = spawnBackground(
    ffmpeg,
    [
      '-v',
      'error',
      '-threads',
      String(workerThreads()),
      '-filter_threads',
      '1',
      '-i',
      path,
      '-an',
      '-vf',
      vf,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let error = '';
  child.stderr.on('data', (d) => {
    error = (error + d).slice(-2000);
  });
  const complete = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code ? reject(new Error(error)) : resolve(),
    );
  });
  complete.catch(() => {});
  const frames = [];
  let buffered = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    buffered = Buffer.concat([buffered, chunk]);
    let at = 0;
    while (at + 480 * 24 <= buffered.length) {
      const picture = buffered.subarray(at, at + 480 * 24);
      at += 480 * 24;
      const sample = (x) => {
        let sum = 0;
        for (let y = 8; y < 16; y++)
          for (let dx = -2; dx <= 2; dx++)
            sum += picture[y * 480 + Math.round(x) + dx];
        return sum / 40;
      };
      let id = null;
      if (sample(8) > 128 && sample(472) > 128) {
        id = 0;
        for (let bit = 0; bit < 16; bit++)
          if (sample(37 + bit * 26) > 128) id |= 1 << bit;
      }
      frames.push(id);
    }
    buffered = Buffer.from(buffered.subarray(at));
  }
  await complete;
  if (buffered.length) throw new Error('Partial barcode frame');
  return frames;
}
function expectedIds(e, sourceCounts, slots, count) {
  // Independent oracle: never call framePlan/frameCount or any production selection helper.
  const fps = rate(e.canvas.fps),
    clips = e.video.flatMap((t) => t.clips);
  return Array.from({ length: count }, (_, n) => {
    const clip = clips
      .filter(
        (c) =>
          n >= Math.ceil(c.at * fps - 1e-7) &&
          n < Math.ceil((c.at + (c.out - c.in) / (c.speed ?? 1)) * fps - 1e-7),
      )
      .at(-1);
    if (!clip) return null;
    const source = e.sources.find((s) => s.id === clip.src);
    const frame = Math.min(
      sourceCounts.get(source.id) - 1,
      Math.max(
        0,
        Math.round(
          ((n / fps - clip.at) * (clip.speed ?? 1) + clip.in) *
            rate(source.fps),
        ),
      ),
    );
    return slots.get(source.id) * 4096 + frame;
  });
}
function compare(observed, expected) {
  let mismatches = Math.abs(observed.length - expected.length),
    repeats = 0,
    skips = 0;
  const faults = [];
  for (let n = 0; n < Math.min(observed.length, expected.length); n++) {
    if (observed[n] !== expected[n]) {
      mismatches++;
      if (faults.length < 8)
        faults.push({ frame: n, observed: observed[n], expected: expected[n] });
    }
    if (
      n &&
      expected[n] != null &&
      expected[n - 1] != null &&
      Math.floor(expected[n] / 4096) === Math.floor(expected[n - 1] / 4096)
    ) {
      const planned = expected[n] - expected[n - 1],
        actual =
          observed[n] != null && observed[n - 1] != null
            ? observed[n] - observed[n - 1]
            : null;
      if (planned > 0 && actual === 0) repeats++;
      if (actual != null && actual > planned) skips += actual - planned;
    }
  }
  return {
    mismatches,
    repeated_frames: repeats,
    skipped_frames: skips,
    faults,
  };
}
async function run() {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
  )
    throw new Error(
      'Full raw instrumentation requires a standard hosted runner',
    );
  const id = process.env.BENCH_CLIP,
    tools = toolPaths();
  const models = (
    await readJson(join(ROOT, 'clips/raw-v2/calibration-models.json'))
  ).cases.filter((c) => c.id === id);
  if (models.length !== 2)
    throw new Error('Expected both frozen aspect models');
  const media = join(DATA_ROOT, 'raw-v2/media', id),
    root = join(DATA_ROOT, 'raw-v2-instrumented', id);
  const prepared = await readJson(join(media, 'prepared.json'));
  if (prepared.dataset !== 'raw-v2' || prepared.case !== id)
    throw new Error('Wrong prepared dataset');
  for (const s of prepared.segments)
    if ((await hashFile(join(media, s.file))) !== s.sha256)
      throw new Error('Prepared video bytes changed');
  if (
    prepared.music &&
    (await hashFile(join(media, prepared.music.file))) !== prepared.music.sha256
  )
    throw new Error('Prepared music bytes changed');
  await mkdir(root, { recursive: true });
  await copyFile(join(media, 'CREDITS.txt'), join(root, 'CREDITS.txt'));
  await copyFile(
    join(media, 'prepared.json'),
    join(root, 'prepared-original.json'),
  );
  const ledger = await readFile(join(ROOT, 'cache/spend.json')),
    originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    throw new Error('Raw timing instrumentation is offline');
  };
  const stamped = new Map(),
    provenance = [],
    results = [];
  const scope =
    'Full-resolution temporary copies of the frozen raw footage with a 480x24 source-frame/asset-ID stripe at top centre. Actual saved timelines, source rates, original audio and real picture content retained. These instrumented outputs certify timing only; clean unmodified outputs retain separate visual reviews/Creator Scores and natural-picture matching limitations.';
  try {
    for (const item of models) {
      const e = structuredClone(item.edl),
        dir = join(root, item.aspect),
        counts = new Map(),
        slots = new Map();
      await mkdir(dir, { recursive: true });
      await copyFile(join(media, 'CREDITS.txt'), join(dir, 'CREDITS.txt'));
      let slot = 0;
      for (const s of e.sources) {
        const original = join(media, basename(s.originalPath || s.path));
        if (s.kind === 'audio' || !s.w) {
          s.path = original;
          continue;
        }
        if (
          s.w !== 1920 ||
          s.h !== 1080 ||
          !(s.calibrationFrames > 0 && s.calibrationFrames < 4096)
        )
          throw new Error('Frozen raw barcode geometry/count mismatch');
        slots.set(s.id, slot);
        counts.set(s.id, s.calibrationFrames);
        const path = join(root, `stamped-${slot}.mp4`);
        if (!stamped.has(original)) {
          console.log(
            'Stamping frozen raw source',
            id,
            slot,
            s.calibrationFrames,
          );
          await command(tools.ffmpeg, [
            '-v',
            'error',
            '-y',
            '-threads',
            String(workerThreads()),
            '-filter_threads',
            '1',
            '-i',
            original,
            '-map',
            '0:v:0',
            '-map',
            '0:a?',
            '-vf',
            rawBarcodeFilter(slot),
            '-fps_mode',
            'passthrough',
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '18',
            '-threads',
            String(workerThreads()),
            '-pix_fmt',
            'yuv420p',
            '-colorspace',
            'bt709',
            '-color_trc',
            'bt709',
            '-color_primaries',
            'bt709',
            '-color_range',
            'tv',
            '-c:a',
            'copy',
            path,
          ]);
          const metadata = JSON.parse(
            (
              await command(tools.ffprobe, [
                '-v',
                'error',
                '-select_streams',
                'v:0',
                '-show_entries',
                'stream=nb_frames,avg_frame_rate',
                '-of',
                'json',
                path,
              ])
            ).stdout.toString(),
          ).streams?.[0];
          if (
            Number(metadata?.nb_frames) !== s.calibrationFrames ||
            Math.abs(rate(metadata.avg_frame_rate) - rate(s.fps)) > 1e-6
          )
            throw new Error('Stamping changed source frame count/rate');
          stamped.set(original, path);
          provenance.push({
            slot,
            source: s.id,
            originalSha256: await hashFile(original),
            stampedSha256: await hashFile(path),
            frames: s.calibrationFrames,
            fps: s.fps,
          });
        }
        s.path = stamped.get(original);
        s.frames = s.calibrationFrames;
        slot++;
      }
      for (const c of e.video.flatMap((t) => t.clips))
        for (const k of c.camera ?? [])
          if (k.zoom !== 1 || k.x !== 0.5 || k.y !== 0.5)
            throw new Error(
              'Only the frozen fixed-centre raw cameras are instrumented; independent punch tests remain separate',
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
        emit: (op) => {
          appendFileSync(join(dir, 'ops.jsonl'), JSON.stringify(op) + '\n');
        },
      });
      await youtubeMaster({
        ffmpeg: tools.ffmpeg,
        input: master,
        output: final,
        P: { width: e.canvas.w, height: e.canvas.h },
        m: await measure(tools.ffmpeg, tools.ffprobe, master),
        encoder: null,
      });
      await unlink(master);
      const ends = [
        ...e.video.flatMap((t) =>
          t.clips.map((c) => c.at + (c.out - c.in) / (c.speed ?? 1)),
        ),
        ...e.overlays.map((o) => o.at + o.dur),
        ...e.audio.flatMap((t) =>
          t.clips.map((c) => c.at + (c.dur ?? (c.out - c.in) / (c.speed ?? 1))),
        ),
      ];
      const expectedFrames = Math.ceil(
        Math.max(...ends) * rate(e.canvas.fps) - 1e-7,
      );
      const observed = await readRawBarcodes(tools.ffmpeg, final, e.canvas),
        expected = expectedIds(e, counts, slots, expectedFrames);
      const measured = compare(observed, expected);
      const negative = compare(
        await readRawBarcodes(tools.ffmpeg, final, e.canvas, true),
        expected,
      );
      const result = {
        id,
        aspect: item.aspect,
        scope,
        originalEdlSha256: item.originalEdlSha256,
        originalRun: item.originalRun,
        finalSha256: await hashFile(final),
        frames: observed.length,
        independentlyExpectedFrames: expectedFrames,
        ...measured,
        strategy: composed.strategy,
        injectedRepeatControl: {
          mismatches: negative.mismatches,
          repeated_frames: negative.repeated_frames,
          detected: negative.mismatches > 0 && negative.repeated_frames > 0,
        },
        networkAttempts: attempts,
        reservedUsdDelta: 0,
        pass:
          measured.mismatches === 0 &&
          measured.repeated_frames === 0 &&
          measured.skipped_frames === 0 &&
          observed.length === composed.frames &&
          observed.length === expectedFrames &&
          negative.mismatches > 0 &&
          negative.repeated_frames > 0,
      };
      await writeJson(join(dir, 'observed-ids.json'), { observed, expected });
      await writeJson(join(dir, 'result.json'), result);
      results.push(result);
      console.log(JSON.stringify(result));
    }
    await writeJson(join(root, 'summary.json'), {
      id,
      scope,
      sources: provenance,
      cases: results,
      pass: results.every((r) => r.pass),
      networkAttempts: attempts,
      reservedUsdDelta: 0,
    });
    if (results.some((r) => !r.pass)) process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
    if (
      attempts ||
      !ledger.equals(await readFile(join(ROOT, 'cache/spend.json')))
    )
      throw new Error('Offline/budget invariant violated');
  }
}
if (isMain(import.meta.url))
  run().catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
