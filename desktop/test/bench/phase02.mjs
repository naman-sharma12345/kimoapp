// Offline compositor regression. This deliberately makes no editorial AI claims.
import { appendFileSync, existsSync } from 'node:fs';
import { readFile, mkdir, copyFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  runEdit,
  probe,
  Mcp,
  measure,
  youtubeMaster,
  qualityChecks,
  resultJson,
  canvasFps,
} from '../../engine.mjs';
import { toolPaths } from './run.mjs';
import {
  DATA_ROOT,
  ROOT,
  hashFile,
  readJson,
  writeJson,
  command,
  sha256,
} from './io.mjs';
import { measureRun, transcribe } from './analyze.mjs';
import { reviewMedia } from './report.mjs';
import { motionJitter } from '../../sam.mjs';
import { compose } from '../../compose.mjs';
import { fromKimoProject } from '../../edl.mjs';

const tools = toolPaths();
const dataset = process.env.BENCH_DATASET || 'legacy';
if (!['legacy', 'raw-v2'].includes(dataset))
  throw new Error('Unknown benchmark dataset');
if (
  dataset === 'raw-v2' &&
  (process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted')
)
  throw new Error(
    'Full raw comparison requires a standard GitHub-hosted runner',
  );
const manifest = await readJson(
  join(
    ROOT,
    dataset === 'raw-v2' ? 'clips/raw-v2/clips.json' : 'clips/clips.json',
  ),
);
const clip = manifest.clips.find((c) => c.id === process.env.BENCH_CLIP);
if (!clip) throw new Error('BENCH_CLIP must name one of the six golden clips');
const root = join(
  DATA_ROOT,
  dataset === 'raw-v2' ? 'out/phase02-raw-v2' : 'out/phase02',
  clip.id,
);
await mkdir(root, { recursive: true });
const mediaRoot = join(
  DATA_ROOT,
  dataset === 'raw-v2' ? 'raw-v2/media' : 'clips/media',
  clip.id,
);
const paths = clip.segments.map((_, i) => join(mediaRoot, `${i + 1}.mp4`));
if (clip.music) paths.push(join(mediaRoot, 'music-bed.wav'));
const files = await Promise.all(paths.map((p) => probe(tools.ffprobe, p)));
if (files.some((f) => !f)) throw new Error('Exact prepared input is missing');
const sourceHashes = await Promise.all(paths.map(hashFile));
const audioHash = async (path) =>
  sha256(
    (
      await command(tools.ffmpeg, [
        '-v',
        'error',
        '-i',
        path,
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-c:a',
        'pcm_s16le',
        '-f',
        's16le',
        'pipe:1',
      ])
    ).stdout,
  );
if (dataset === 'raw-v2') {
  const prepared = await readJson(join(mediaRoot, 'prepared.json'));
  if (
    prepared.dataset !== dataset ||
    prepared.case !== clip.id ||
    prepared.segments.length !== clip.segments.length
  )
    throw new Error('Wrong prepared dataset artifact');
  for (let i = 0; i < prepared.segments.length; i++)
    if (prepared.segments[i].sha256 !== sourceHashes[i])
      throw new Error('Exact prepared bytes changed');
  if (clip.music && prepared.music.sha256 !== sourceHashes.at(-1))
    throw new Error('Music bed bytes changed');
  await copyFile(join(mediaRoot, 'prepared.json'), join(root, 'prepared.json'));
  await copyFile(join(mediaRoot, 'CREDITS.txt'), join(root, 'CREDITS.txt'));
}
const ledger = await readFile(join(ROOT, 'cache/spend.json'));
// Any accidental network path is a hard failure, including calls swallowed by the editor.
let attempts = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  attempts++;
  throw new Error('Phase 2 is offline; network prohibited');
};
let failed = false;
try {
  for (const aspect of ['9:16', '16:9']) {
    const dir = join(root, aspect.replace(':', 'x'));
    await mkdir(dir, { recursive: true });
    if (dataset === 'raw-v2')
      await copyFile(join(mediaRoot, 'CREDITS.txt'), join(dir, 'CREDITS.txt'));
    const ops = [],
      started = Date.now();
    const log = (e) => {
      const event = { ...e };
      if (event.image) event.image = '[omitted]';
      ops.push(event);
      appendFileSync(join(dir, 'ops.jsonl'), JSON.stringify(event) + '\n');
      if (e.t === 'status') console.log(clip.id, aspect, e.text);
    };
    try {
      const onlyAnalysis = process.env.BENCH_ANALYZE_ONLY === 'true';
      const originalRun = onlyAnalysis
        ? await readJson(join(dir, 'run.json'))
        : null;
      if (
        originalRun &&
        JSON.stringify(originalRun.sourceHashes) !==
          JSON.stringify(sourceHashes)
      )
        throw new Error('Prepared input hashes changed');
      if (
        originalRun &&
        (await hashFile(join(dir, 'final.mp4'))) !== originalRun.finalHash
      )
        throw new Error('Preserved final bytes changed before reanalysis');
      // A declared manual soundtrack fixture imports a separate music stem through the real MCP
      // tools. It then takes the same runEdit manual route users use, without any paid planner.
      let soundtrackProject;
      if (clip.music && !onlyAnalysis) {
        soundtrackProject = join(dir, 'soundtrack.kimo.json');
        const mcp = new Mcp(tools.bin, dir, tools.env);
        try {
          await mcp.start();
          const call = async (name, args) => {
            const reply = await mcp.call(name, args);
            if (reply.isError) throw new Error(JSON.stringify(reply));
            return resultJson(reply);
          };
          await call('project_set', {
            width: aspect === '9:16' ? 1080 : 1920,
            height: aspect === '9:16' ? 1920 : 1080,
            fps: canvasFps(files),
          });
          for (const file of files) {
            const asset = await call('import_media', { path: file.path });
            const track = await call('add_track', {});
            await call('add_clip', {
              track_id: track.track_id,
              source_type: 'media',
              asset_id: asset.asset_id,
              start: 0,
              duration: clip.duration,
              in_point: 0,
              fit: 'cover',
            });
          }
          await call('finish_audio', { target_lufs: -14, keep_ambience: true });
          await call('save_project', { path: soundtrackProject });
        } finally {
          mcp.kill();
        }
      }
      const result = onlyAnalysis
        ? {
            output: join(dir, 'final.mp4'),
            projectFile: join(dir, 'project.kimo.json'),
            edlFile: join(dir, 'edit.edl.json'),
            edl: await readJson(join(dir, 'edit.edl.json')),
            duration: (
              await measure(tools.ffmpeg, tools.ffprobe, join(dir, 'final.mp4'))
            ).duration,
          }
        : await runEdit({
            ...tools,
            files,
            dir,
            preset: aspect === '9:16' ? 'shorts' : 'youtube',
            mode: clip.music ? 'manual' : clip.speech ? 'captions' : 'sam',
            ...(soundtrackProject
              ? { projectFile: soundtrackProject, ops: [] }
              : {}),
            emit: log,
          });
      const elapsedMs = Date.now() - started;
      const project = await readJson(result.projectFile);
      const recomposed = onlyAnalysis && process.env.BENCH_RECOMPOSE === 'true';
      let priorAudioHash = null;
      if (recomposed) {
        const previousHash = await hashFile(result.output);
        if (previousHash !== originalRun.finalHash)
          throw new Error('Recorded final hash changed before recompose');
        if (clip.speech && existsSync(join(dir, 'compose-words.json')))
          priorAudioHash = await audioHash(result.output);
        result.edl = fromKimoProject(project, files, { emit: log });
        await writeJson(result.edlFile, result.edl);
        const master = join(dir, 'recomposed.mkv');
        await compose({
          ...tools,
          edl: result.edl,
          output: master,
          dir: join(dir, 'compose'),
          fontsDir: tools.env.KIMO_FONTS,
          assetRoot: dir,
          emit: log,
        });
        await youtubeMaster({
          ffmpeg: tools.ffmpeg,
          input: master,
          output: result.output,
          P: { width: result.edl.canvas.w, height: result.edl.canvas.h },
          m: await measure(tools.ffmpeg, tools.ffprobe, master),
          encoder: null,
        });
        await unlink(master);
      }
      const analyze = async (output, target, { reuseWords = false } = {}) => {
        // Measure each final's own audio and delivery with identical checks.
        const wordsPath = join(dir, `${target}-words.json`);
        const usingSavedWords = Boolean(
          clip.speech && reuseWords && existsSync(wordsPath),
        );
        const words = clip.speech
          ? usingSavedWords
            ? await readJson(wordsPath)
            : await transcribe({
                ...tools,
                input: output,
                directory: join(DATA_ROOT, 'transcripts'),
              })
          : [];
        await writeJson(wordsPath, words);
        await writeJson(join(dir, `${target}-words-provenance.json`), {
          finalHash: await hashFile(output),
          reused: usingSavedWords,
          basis: !clip.speech
            ? 'Speech-free case; no transcription requested'
            : usingSavedWords
              ? recomposed && target === 'compose'
                ? 'Exact decoded 48k stereo PCM SHA256 unchanged'
                : 'Preserved whole-video SHA256 verified unchanged'
              : 'Local Whisper on this final audio',
          ...(usingSavedWords && priorAudioHash && target === 'compose'
            ? { pcmSha256: priorAudioHash }
            : {}),
        });
        const final = await measure(tools.ffmpeg, tools.ffprobe, output);
        const quality = qualityChecks(
          final,
          { width: result.edl.canvas.w, height: result.edl.canvas.h },
          { final: true, sourceAudio: files.some((f) => f.audio) },
        );
        const jitter = await motionJitter(tools.ffmpeg, output);
        const metrics = await measureRun({
          ...tools,
          output,
          project,
          words,
          quality,
          aspect,
          speech: clip.speech,
          jitter,
        });
        await writeJson(join(dir, `${target}-metrics.json`), metrics);
        if (target === 'legacy') {
          const review = join(dir, 'legacy-review');
          await mkdir(review, { recursive: true });
          await reviewMedia({
            ffmpeg: tools.ffmpeg,
            output,
            directory: review,
            duration: final.duration,
          });
        }
        return metrics;
      };
      if (result.output !== join(dir, 'final.mp4'))
        await copyFile(result.output, join(dir, 'final.mp4'));
      const reuseComposedWords =
        onlyAnalysis &&
        (!recomposed ||
          (priorAudioHash &&
            priorAudioHash === (await audioHash(result.output))));
      await analyze(result.output, 'compose', {
        reuseWords: Boolean(reuseComposedWords),
      });
      await reviewMedia({
        ffmpeg: tools.ffmpeg,
        output: result.output,
        directory: dir,
        duration: result.duration,
      });
      if (!onlyAnalysis)
        await writeJson(join(dir, 'run.json'), {
          commit: (await command('git', ['rev-parse', 'HEAD'])).stdout
            .toString()
            .trim(),
          clip: clip.id,
          dataset,
          aspect,
          mode: clip.music ? 'manual' : clip.speech ? 'captions' : 'sam',
          scope:
            'Full prepared footage, offline editorial control; not a replay of the incomplete Phase 1 AI edit',
          sourceHashes,
          finalHash: await hashFile(result.output),
          elapsedMs,
          networkAttempts: attempts,
          reservedUsdDelta: 0,
          edl: result.edlFile,
          composed: ops.some(
            (e) => e.tool === 'compose' && e.phase === 'end' && e.ok,
          ),
          datasetLimitations: clip.notes,
        });
      if (onlyAnalysis) {
        await writeJson(join(dir, 'analysis.json'), {
          commit: (await command('git', ['rev-parse', 'HEAD'])).stdout
            .toString()
            .trim(),
          at: new Date().toISOString(),
          finalHash: await hashFile(result.output),
          networkAttempts: attempts,
          reservedUsdDelta: 0,
          recomposed,
          priorFinalHash: originalRun.finalHash,
        });
        if (recomposed)
          await writeJson(join(dir, 'run.json'), {
            ...originalRun,
            commit: (await command('git', ['rev-parse', 'HEAD'])).stdout
              .toString()
              .trim(),
            finalHash: await hashFile(result.output),
            priorRender: {
              commit: originalRun.commit,
              finalHash: originalRun.finalHash,
            },
            recomposed: true,
            networkAttempts: attempts,
            reservedUsdDelta: 0,
          });
        const legacy = join(dir, 'legacy-final.mp4');
        if (existsSync(legacy)) {
          const legacyRun = await readJson(join(dir, 'legacy-run.json'));
          if ((await hashFile(legacy)) !== legacyRun.finalHash)
            throw new Error('Preserved native reference bytes changed');
          await analyze(legacy, 'legacy', { reuseWords: true });
        }
      }
      if (
        process.env.BENCH_LEGACY === 'true' &&
        (!onlyAnalysis || process.env.BENCH_RETRY_LEGACY === 'true') &&
        !(
          onlyAnalysis &&
          existsSync(join(dir, 'legacy-final.mp4')) &&
          existsSync(join(dir, 'legacy-run.json'))
        )
      ) {
        const mcp = new Mcp(tools.bin, dir, tools.env),
          start = Date.now();
        try {
          await mcp.start();
          const load = await mcp.call('load_project', {
            path: result.projectFile,
          });
          if (load.isError) throw new Error(JSON.stringify(load));
          // Explicit benchmark-only native picture call on the SAME project.
          const legacy = join(dir, 'legacy.mp4');
          const reply = await mcp.request(
            'tools/call',
            { name: 'export', arguments: { path: legacy } },
            1800000,
          );
          if (reply.error || reply.result?.isError)
            throw new Error(JSON.stringify(reply));
          const nativeMs = Date.now() - start;
          const measured = await measure(tools.ffmpeg, tools.ffprobe, legacy);
          const upload = join(dir, 'legacy-final.mp4');
          await youtubeMaster({
            ffmpeg: tools.ffmpeg,
            input: legacy,
            output: upload,
            P: { width: result.edl.canvas.w, height: result.edl.canvas.h },
            m: measured,
            encoder: null,
          });
          await analyze(upload, 'legacy');
          await writeJson(join(dir, 'legacy-run.json'), {
            nativeMs,
            projectHash: await hashFile(result.projectFile),
            finalHash: await hashFile(upload),
            sameProject: true,
          });
          if (existsSync(join(dir, 'legacy-failure.json')))
            await unlink(join(dir, 'legacy-failure.json'));
        } catch (error) {
          await writeJson(join(dir, 'legacy-failure.json'), {
            error: error.message,
            elapsedMs: Date.now() - start,
          });
        } finally {
          mcp.kill();
        }
      }
    } catch (error) {
      failed = true;
      console.error(clip.id, aspect, error.stack);
      await writeJson(join(dir, 'failure.json'), { error: error.stack });
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  if (
    attempts ||
    !ledger.equals(await readFile(join(ROOT, 'cache/spend.json')))
  )
    throw new Error('Offline/budget invariant violated');
}
if (failed) process.exitCode = 1;
