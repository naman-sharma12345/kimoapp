// Recompose a genuine saved AI edit without rerunning the model or native renderer.
import { appendFileSync, existsSync } from 'node:fs';
import { mkdir, readFile, copyFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { compose } from '../../compose.mjs';
import { fromKimoProject } from '../../edl.mjs';
import { measure, qualityChecks, probe, youtubeMaster } from '../../engine.mjs';
import { motionJitter } from '../../sam.mjs';
import { toolPaths } from './run.mjs';
import {
  DATA_ROOT,
  ROOT,
  readJson,
  writeJson,
  hashFile,
  command,
} from './io.mjs';
import { relocatePaths } from './portable.mjs';
import { measureRun, transcribe } from './analyze.mjs';
import { reviewMedia } from './report.mjs';

const tools = toolPaths(),
  aspect = '16:9';
const source = join(DATA_ROOT, 'out/v0.3.2-baseline/TH-1-16x9');
const dir = join(DATA_ROOT, 'out/phase02-record/TH-1-16x9');
await mkdir(dir, { recursive: true });
const record = await readJson(join(source, 'run.json'));
const originalProject = join(source, 'project.kimo.json');
const recordedRoot =
  record.dataRoot ??
  (await readJson(join(source, 'record-root.json'))).dataRoot;
const project = relocatePaths(
  await readJson(originalProject),
  recordedRoot,
  DATA_ROOT,
);
const input = join(DATA_ROOT, 'clips/media/TH-1/1.mp4');
const sourceHashes = [await hashFile(input)];
if (JSON.stringify(sourceHashes) !== JSON.stringify(record.sourceHashes))
  throw new Error('Original prepared source hash changed');
const edl = fromKimoProject(project, [await probe(tools.ffprobe, input)], {
  emit: (e) => appendFileSync(join(dir, 'ops.jsonl'), JSON.stringify(e) + '\n'),
});
for (const s of edl.sources)
  if (!existsSync(s.path))
    throw new Error(
      'Original edit source missing; cannot substitute: ' + s.path,
    );
await writeJson(join(dir, 'edit.edl.json'), edl);
await copyFile(originalProject, join(dir, 'original-project.kimo.json'));
const ledger = await readFile(join(ROOT, 'cache/spend.json'));
let attempts = 0;
const fetch = globalThis.fetch;
globalThis.fetch = async () => {
  attempts++;
  throw new Error('Saved-project recompose is offline');
};
try {
  const master = join(dir, 'master.mkv'),
    output = join(dir, 'after.mp4'),
    before = join(source, 'final.mp4');
  await compose({
    ...tools,
    edl,
    output: master,
    dir: join(dir, 'work'),
    fontsDir: tools.env.KIMO_FONTS,
    emit: (e) =>
      appendFileSync(join(dir, 'ops.jsonl'), JSON.stringify(e) + '\n'),
  });
  const P = { width: edl.canvas.w, height: edl.canvas.h };
  await youtubeMaster({
    ffmpeg: tools.ffmpeg,
    input: master,
    output,
    P,
    m: await measure(tools.ffmpeg, tools.ffprobe, master),
    encoder: null,
  });
  await unlink(master);
  for (const [label, path] of [
    ['before', before],
    ['after', output],
  ]) {
    const target = join(dir, label);
    await mkdir(target, { recursive: true });
    const words = await transcribe({
      ...tools,
      input: path,
      directory: join(DATA_ROOT, 'transcripts'),
    });
    const final = await measure(tools.ffmpeg, tools.ffprobe, path);
    const quality = qualityChecks(final, P, { final: true, sourceAudio: true });
    const metrics = await measureRun({
      ...tools,
      output: path,
      project,
      words,
      quality,
      aspect,
      speech: true,
      jitter: await motionJitter(tools.ffmpeg, path),
    });
    await writeJson(join(target, 'metrics.json'), metrics);
    await writeJson(join(target, 'words.json'), words);
    await reviewMedia({
      ffmpeg: tools.ffmpeg,
      output: path,
      directory: target,
      duration: final.duration,
    });
  }
  await copyFile(before, join(dir, 'before.mp4'));
  await writeJson(join(dir, 'comparison.json'), {
    scope:
      'Genuine Phase 1 TH-1 landscape AI edit, same project and exact prepared source, app-owned recompose; no new planner or SAM requests',
    recordRun: 40891223587,
    commit: (await command('git', ['rev-parse', 'HEAD'])).stdout
      .toString()
      .trim(),
    originalProjectHash: await hashFile(originalProject),
    sourceHashes,
    beforeHash: await hashFile(before),
    afterHash: await hashFile(output),
    networkAttempts: attempts,
    reservedUsdDelta: 0,
  });
} catch (error) {
  await writeJson(join(dir, 'failure.json'), { error: error.stack });
  throw error;
} finally {
  globalThis.fetch = fetch;
  if (
    attempts ||
    !ledger.equals(await readFile(join(ROOT, 'cache/spend.json')))
  )
    throw new Error('Offline/budget invariant violated');
}
