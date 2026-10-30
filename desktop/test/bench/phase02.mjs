// Offline compositor regression. This deliberately makes no editorial AI claims.
import { appendFileSync } from 'node:fs';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runEdit, probe, Mcp, measure, youtubeMaster } from '../../engine.mjs';
import { toolPaths } from './run.mjs';
import {
  DATA_ROOT,
  ROOT,
  hashFile,
  readJson,
  writeJson,
  command,
} from './io.mjs';
import { measureRun, transcribe } from './analyze.mjs';
import { reviewMedia } from './report.mjs';
import { motionJitter } from '../../sam.mjs';

const tools = toolPaths();
const manifest = await readJson(join(ROOT, 'clips/clips.json'));
const clip = manifest.clips.find((c) => c.id === process.env.BENCH_CLIP);
if (!clip) throw new Error('BENCH_CLIP must name one of the six golden clips');
const root = join(DATA_ROOT, 'out/phase02', clip.id);
await mkdir(root, { recursive: true });
const paths = clip.segments.map((_, i) =>
  join(DATA_ROOT, 'clips/media', clip.id, `${i + 1}.mp4`),
);
const files = await Promise.all(paths.map((p) => probe(tools.ffprobe, p)));
if (files.some((f) => !f)) throw new Error('Exact prepared input is missing');
const sourceHashes = await Promise.all(paths.map(hashFile));
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
      const result = await runEdit({
        ...tools,
        files,
        dir,
        preset: aspect === '9:16' ? 'shorts' : 'youtube',
        mode: clip.speech ? 'captions' : 'sam',
        emit: log,
      });
      const elapsedMs = Date.now() - started;
      const project = await readJson(result.projectFile);
      const words = clip.speech
        ? await transcribe({
            ...tools,
            input: result.output,
            directory: join(DATA_ROOT, 'transcripts'),
          })
        : [];
      await writeJson(join(dir, 'words.json'), words);
      const analyze = async (output, quality, target) => {
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
        return metrics;
      };
      await copyFile(result.output, join(dir, 'final.mp4'));
      await analyze(result.output, result.quality.checks, 'compose');
      await reviewMedia({
        ffmpeg: tools.ffmpeg,
        output: result.output,
        directory: dir,
        duration: result.duration,
      });
      await writeJson(join(dir, 'run.json'), {
        commit: (await command('git', ['rev-parse', 'HEAD'])).stdout
          .toString()
          .trim(),
        clip: clip.id,
        aspect,
        mode: clip.speech ? 'captions' : 'sam',
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
      if (process.env.BENCH_LEGACY === 'true') {
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
            600000,
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
          await analyze(upload, [], 'legacy');
          await writeJson(join(dir, 'legacy-run.json'), {
            nativeMs,
            projectHash: await hashFile(result.projectFile),
            finalHash: await hashFile(upload),
            sameProject: true,
          });
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
