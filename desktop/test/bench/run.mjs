import { existsSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ROOT,
  DATA_ROOT,
  options,
  readJson,
  writeJson,
  safeName,
  isMain,
  hashFile,
  command,
  sha256,
  bindCommandSignal,
} from './io.mjs';
import { ProxyCache } from './cache.mjs';
import { measureRun, retainFinal, transcribe } from './analyze.mjs';
import { reviewMedia, writeReview, summaryTable } from './report.mjs';
import { acquireExclusive, lowerPriority } from '../../resources.cjs';
import { relocatePaths } from './portable.mjs';

export function toolPaths() {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const installed =
    process.env.LOCALAPPDATA &&
    join(process.env.LOCALAPPDATA, 'Programs/kimo/resources/vendor');
  const vendor =
    process.env.KIMO_BENCH_VENDOR ||
    (existsSync(join(ROOT, '../../vendor/kimo/bin', 'kimo-mcp' + suffix))
      ? resolve(ROOT, '../../vendor')
      : installed || resolve(ROOT, '../../vendor'));
  const tool = (env, relative, fallback) =>
    process.env[env] ||
    (existsSync(join(vendor, relative)) ? join(vendor, relative) : fallback);
  const paths = {
    vendor,
    bin: tool(
      'KIMO_MCP_BIN',
      `kimo/bin/kimo-mcp${suffix}`,
      'kimo-mcp' + suffix,
    ),
    ffmpeg: tool('KIMO_FFMPEG', `ffmpeg/ffmpeg${suffix}`, 'ffmpeg'),
    ffprobe: tool('KIMO_FFPROBE', `ffmpeg/ffprobe${suffix}`, 'ffprobe'),
    whisper: tool(
      'KIMO_WHISPER_BIN',
      `whisper/whisper-cli${suffix}`,
      'whisper-cli' + suffix,
    ),
    model: tool('KIMO_WHISPER_MODEL', 'models/ggml-small-q5_1.bin', ''),
  };
  paths.env = {
    PATH: `${join(vendor, 'ffmpeg')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    KIMO_FONTS: join(vendor, 'kimo/fonts'),
    KIMO_WHISPER_BIN: paths.whisper,
    KIMO_WHISPER_MODEL: paths.model,
    KIMO_MODELS: join(vendor, 'models'),
    KIMO_TOOLS: 'director',
    KIMO_SPECTATOR: 'off',
  };
  return paths;
}
export async function run(args) {
  const release = acquireExclusive('benchmark');
  lowerPriority(process.pid);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const unbind = bindCommandSignal(controller.signal);
  try {
    return await runExclusive(args, controller.signal);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    unbind();
    release();
  }
}
async function runExclusive(args, signal) {
  const allowed = [
    'clips',
    'template',
    'aspect',
    'label',
    'replay-cache',
    'record-cache',
    'mode',
    'max-requests',
    'max-usd',
    'analyze-existing',
  ];
  for (const key of Object.keys(args))
    if (!allowed.includes(key)) throw new Error(`Unknown --${key}`);
  if (args['replay-cache'] && args['record-cache'])
    throw new Error('Choose replay or record');
  const template = args.template ?? 'default';
  if (!['default', 'shorts-punchy'].includes(template))
    throw new Error(
      `Unknown template ${template}; Phase 1 does not add editing templates`,
    );
  const mode = args.mode ?? 'ai';
  if (!['ai', 'captions'].includes(mode))
    throw new Error('Mode must be ai or captions');
  const label = safeName(args.label ?? 'v0.3.2');
  const aspects =
    args.aspect === 'both' ? ['9:16', '16:9'] : [args.aspect ?? '9:16'];
  if (aspects.some((a) => !['9:16', '16:9'].includes(a)))
    throw new Error('Aspect must be 9:16, 16:9 or both');
  const manifest = await readJson(join(ROOT, 'clips/clips.json'));
  const ids = args.clips
    ? args.clips.split(',')
    : manifest.clips.map((c) => c.id);
  if (ids.some((id) => !manifest.clips.some((c) => c.id === id)))
    throw new Error('Unknown clip id');
  const tools = toolPaths();
  await command(tools.ffmpeg, ['-version']);
  const { runEdit, probe } = await import('../../engine.mjs');
  const { motionJitter } = await import('../../sam.mjs');
  const directory = join(DATA_ROOT, 'out', label);
  await mkdir(directory, { recursive: true });
  const ledgerPath = join(ROOT, 'cache/spend.json');
  const ledger = await readJson(ledgerPath).catch((e) => {
    if (e.code === 'ENOENT') return { reservedUsd: 0, networkRequests: 0 };
    throw e;
  });
  const maxUsd = Number(args['max-usd'] ?? ledger.authorizedUsd ?? 0.49);
  const authorizedUsd = Number(ledger.authorizedUsd ?? 0.49);
  if (!(maxUsd > 0 && maxUsd <= authorizedUsd))
    throw new Error(
      `--max-usd must be >0 and <=${authorizedUsd}, the recorded user authorization`,
    );
  const maxRequests = Number(args['max-requests'] ?? 200);
  if (!Number.isInteger(maxRequests) || maxRequests < 0)
    throw new Error('Invalid --max-requests');
  const rows = [];
  let buildModel;
  if (args['record-cache']) {
    const response = await fetch('https://api.getkimo.tech/v1/ai/status', {
      signal,
    });
    if (!response.ok) throw new Error(`AI status ${response.status}`);
    const status = await response.json();
    if (!status.available) throw new Error('AI proxy unavailable');
    buildModel = status.model;
    await writeJson(join(directory, 'proxy-status.json'), {
      ...status,
      checkedAt: new Date().toISOString(),
    });
  }
  clipsLoop: for (const clip of manifest.clips.filter((c) =>
    ids.includes(c.id),
  ))
    for (const aspect of aspects.filter((a) => clip.aspects.includes(a))) {
      const name = `${clip.id}-${aspect.replace(':', 'x')}`;
      const dir = join(directory, name);
      await mkdir(dir, { recursive: true });
      console.log(
        `${label}/${name}: ${mode}, ${args['record-cache'] ? 'record (budget capped)' : 'replay (offline)'}`,
      );
      const row = { id: clip.id, aspect, mode };
      const ops = [];
      const paths = clip.segments.map((_, i) =>
        join(DATA_ROOT, 'clips/media', clip.id, `${i + 1}.mp4`),
      );
      const cache = new ProxyCache({
        directory: join(ROOT, 'cache'),
        replay: !args['record-cache'],
        aliases: [
          ...paths.map((p, i) => [p, `@SOURCE-${clip.id}-${i + 1}@`]),
          [dir, `@RUN-${clip.id}-${aspect}@`],
        ],
        maxRequests: Math.max(0, maxRequests - ledger.networkRequests),
        maxEstimatedUsd: Math.max(0, maxUsd - ledger.reservedUsd),
        buildModel,
        onReserve: async (reserve) => {
          ledger.reservedUsd += reserve;
          ledger.networkRequests++;
          await writeJson(ledgerPath, ledger);
        },
      });
      const restore = cache.install();
      try {
        for (const path of paths)
          if (!existsSync(path))
            throw new Error(
              `Missing media: run fetch-clips.mjs --clips ${clip.id}`,
            );
        const files = await Promise.all(
          paths.map((path) => probe(tools.ffprobe, path)),
        );
        if (files.some((f) => !f)) throw new Error('Source probe failed');
        const fingerprints = await Promise.all(paths.map(hashFile));
        cache.directory = join(ROOT, 'cache', sha256(fingerprints.join('\n')));
        let result;
        let recordedRoot;
        if (args['analyze-existing']) {
          const recorded = await readJson(join(dir, 'run.json'));
          if (
            JSON.stringify(recorded.sourceHashes) !==
            JSON.stringify(fingerprints)
          )
            throw new Error('Source bytes changed since render');
          result = await readJson(join(dir, 'pipeline.json'));
          recordedRoot =
            recorded.dataRoot ??
            (await readJson(join(dir, 'record-root.json')).catch(() => ({})))
              .dataRoot;
          result.output = join(dir, 'final.mp4');
          result.projectFile = join(dir, 'project.kimo.json');
        } else {
          // v0.3.2 has no creator template data yet: named bench aliases use its existing styles.
          await writeFile(join(dir, 'ops.jsonl'), '');
          result = await runEdit({
            ...tools,
            signal,
            dir,
            files,
            preset: aspect === '9:16' ? 'shorts' : 'youtube',
            style: template === 'shorts-punchy' ? 'energetic' : 'auto',
            mode,
            note: '',
            emit: (event) => {
              const record = { ...event };
              if (record.image) record.image = '[image omitted from text log]';
              ops.push(record);
              // Serialize each log write synchronously at emission; avoids reordering/truncation.
              logOp(join(dir, 'ops.jsonl'), record);
              if (event.t === 'status' || event.t === 'say')
                console.log(`${name}: ${event.text}`);
            },
          });
          await writeJson(join(dir, 'pipeline.json'), result);
          await writeJson(join(dir, 'run.json'), {
            label,
            clip: clip.id,
            aspect,
            mode,
            template,
            sourceCommit: (await command('git', ['rev-parse', 'HEAD'])).stdout
              .toString()
              .trim(),
            pipelineHashes: {
              engine: await hashFile(join(ROOT, '../../engine.mjs')),
              sam: await hashFile(join(ROOT, '../../sam.mjs')),
            },
            sourceHashes: fingerprints,
            dataRoot: DATA_ROOT,
            at: new Date().toISOString(),
            cacheComplete: !cache.failures.length,
            cache: {
              hits: cache.hits,
              networkRequests: cache.requests,
              reservedUsd: cache.estimatedUsd,
            },
          });
        }
        const output = join(dir, 'final.mp4');
        await retainFinal(result.output, output);
        if (!result.projectFile || !existsSync(result.projectFile))
          throw new Error('Pipeline did not save a project');
        const savedProject = await readJson(result.projectFile);
        const project = recordedRoot
          ? relocatePaths(savedProject, recordedRoot, DATA_ROOT)
          : savedProject;
        const words = clip.speech
          ? await transcribe({
              ...tools,
              input: output,
              directory: join(DATA_ROOT, 'transcripts'),
            })
          : [];
        await writeJson(join(dir, 'words.json'), words);
        const jitter = await motionJitter(tools.ffmpeg, output, { signal });
        row.metrics = await measureRun({
          ...tools,
          output,
          project,
          words,
          quality: result.quality.checks,
          aspect,
          speech: clip.speech,
          jitter,
        });
        await writeJson(join(dir, 'metrics.json'), row.metrics);
        await writeJson(join(dir, 'analysis.json'), {
          measuredAt: new Date().toISOString(),
          measurementCommit: (
            await command('git', ['rev-parse', 'HEAD'])
          ).stdout
            .toString()
            .trim(),
          finalSha256: await hashFile(output),
          projectSha256: await hashFile(result.projectFile),
          analysisOnly: Boolean(args['analyze-existing']),
          networkRequests: cache.requests,
        });
        await reviewMedia({
          ffmpeg: tools.ffmpeg,
          output,
          directory: dir,
          duration: result.duration,
          font: existsSync(join(tools.env.KIMO_FONTS, 'DejaVuSans.ttf'))
            ? join(tools.env.KIMO_FONTS, 'DejaVuSans.ttf')
            : undefined,
        });
        const recordedOps = ops.length
          ? ops
          : (await readFile(join(dir, 'ops.jsonl'), 'utf8'))
              .trim()
              .split('\n')
              .filter(Boolean)
              .map(JSON.parse);
        await writeReview(dir, {
          title: `${label} / ${name} / ${mode}`,
          metrics: row.metrics,
          ops: recordedOps,
        });
        console.log(
          `${name}: Creator Score ${row.metrics.creator.score}; ${cache.requests} network calls`,
        );
        // Preserve measured evidence even if the app swallowed a failed AI review.
        // The run still fails loudly and cannot satisfy cache replay acceptance.
        cache.assertClean();
      } catch (e) {
        row.error = e.message;
        await writeJson(join(dir, 'failure.json'), {
          error: e.message,
          at: new Date().toISOString(),
          cacheFailures: cache.failures,
        });
        console.error(`${name}: FAILED ${e.message}`);
      } finally {
        restore();
      }
      rows.push(row);
      await writeJson(join(directory, 'summary.json'), rows);
      await writeFile(
        join(directory, 'summary.md'),
        `# ${label}\n\n${summaryTable(rows)}`,
      );
      if (signal.aborted) break clipsLoop;
    }
  const now = new Date().toISOString();
  await appendFile(
    join(ROOT, 'RESULTS.md'),
    `\n## ${label} - ${now}\n\nTemplate: ${template}. ${args['record-cache'] ? 'Record' : 'Replay'}; mode ${mode}. ${ledger.networkRequests} cumulative network requests; reserved upper-bound USD ${ledger.reservedUsd.toFixed(4)} (not a billing statement).\n\n${summaryTable(rows)}\nOutputs: out/${label}/<clip>-<aspect>/review.html. Failed runs have no claimed score.\n`,
  );
  if (rows.some((r) => r.error)) process.exitCode = 1;
  return rows;
}
import { appendFileSync } from 'node:fs';
function logOp(path, record) {
  appendFileSync(path, JSON.stringify(record) + '\n');
}
if (isMain(import.meta.url))
  run(options(process.argv.slice(2))).catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
