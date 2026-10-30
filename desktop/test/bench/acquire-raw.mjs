// Candidate acquisition/inspection only. Never invokes the editor or AI transport.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  ROOT,
  DATA_ROOT,
  readJson,
  writeJson,
  hashFile,
  command,
} from './io.mjs';
import { toolPaths } from './run.mjs';
import { transcribe } from './analyze.mjs';

const manifest = await readJson(join(ROOT, 'clips/raw-v2/candidates.json'));
const source = manifest.candidates.find((c) => c.id === process.env.BENCH_CLIP);
if (!source) throw new Error('BENCH_CLIP must select a staged raw candidate');
const tools = toolPaths();
const ledgerPath = join(ROOT, 'cache/spend.json');
const ledger = await readFile(ledgerPath);
const dir = join(DATA_ROOT, 'raw-v2-candidates', source.id);
await mkdir(dir, { recursive: true });
const original = join(dir, 'source.media');
const allowed = new Set(['upload.wikimedia.org', 'studio.blender.org']);
if (!existsSync(original)) {
  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'kimo-benchmark/1.0 (licensed raw footage inspection)',
    },
    signal: AbortSignal.timeout(12 * 60_000),
  });
  if (!response.ok)
    throw new Error(`Candidate download HTTP ${response.status}`);
  if (!allowed.has(new URL(response.url).hostname))
    throw new Error('Unexpected candidate download host');
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body),
    new Transform({
      transform(chunk, _, done) {
        bytes += chunk.length;
        done(
          bytes > 500 * 1024 * 1024
            ? new Error('Candidate exceeds 500 MiB')
            : null,
          chunk,
        );
      },
    }),
    createWriteStream(original + '.part'),
  );
  await rename(original + '.part', original);
}
const { size: bytes } = await stat(original);
if (bytes > 500 * 1024 * 1024) throw new Error('Candidate exceeds 500 MiB');
const sha1 = createHash('sha1');
for await (const chunk of createReadStream(original)) sha1.update(chunk);
const published = sha1.digest('hex');
if (source.publishedSha1 && published !== source.publishedSha1)
  throw new Error('Candidate does not match the published SHA1');
const sourceHash = await hashFile(original);
if (source.sha256 && source.sha256 !== sourceHash)
  throw new Error('Candidate does not match the pinned SHA256');
const { stdout } = await command(tools.ffprobe, [
  '-v',
  'error',
  '-show_streams',
  '-show_format',
  '-of',
  'json',
  original,
]);
const metadata = JSON.parse(stdout.toString());
if (Number(metadata.format.duration) < source.start + source.duration)
  throw new Error('Candidate interval exceeds source duration');
const prior = existsSync(join(dir, 'provenance.json'))
  ? await readJson(join(dir, 'provenance.json'))
  : null;
await writeJson(join(dir, 'provenance.json'), {
  ...source,
  bytes,
  sha1: published,
  sha256: sourceHash,
  acquiredAt: prior?.acquiredAt ?? new Date().toISOString(),
  inspectedAt: new Date().toISOString(),
  seedRun: process.env.BENCH_SEED_RUN || null,
  accepted: false,
  status: 'Candidate downloaded; actual content/licence review still required',
  metadata,
});
const common = [
  '-v',
  'error',
  '-y',
  '-ss',
  String(source.start),
  '-i',
  original,
  '-an',
];
await command(tools.ffmpeg, [
  ...common,
  '-t',
  String(source.duration),
  '-vf',
  `trim=duration=${source.duration},setpts=PTS-STARTPTS,fps=1/5,scale=320:-2,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{pts\\:hms}':fontsize=14:fontcolor=white:box=1:boxcolor=black@0.7,tile=6x3:padding=2:margin=2`,
  '-frames:v',
  '1',
  join(dir, 'candidate-sheet.jpg'),
]);
await command(tools.ffmpeg, [
  ...common,
  '-t',
  '1',
  '-vf',
  'trim=duration=1,setpts=PTS-STARTPTS,fps=10,scale=240:-2,tile=5x2:padding=2:margin=2',
  '-frames:v',
  '1',
  join(dir, 'candidate-first-second.jpg'),
]);
const preview = join(dir, 'candidate-preview.mp4');
await command(tools.ffmpeg, [
  '-v',
  'error',
  '-y',
  '-ss',
  String(source.start),
  '-i',
  original,
  '-t',
  String(source.duration),
  '-vf',
  'scale=640:-2:flags=lanczos',
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '20',
  '-pix_fmt',
  'yuv420p',
  '-fps_mode',
  'passthrough',
  '-c:a',
  'aac',
  '-ar',
  '48000',
  '-movflags',
  '+faststart',
  preview,
]);
const words = await transcribe({
  ...tools,
  input: preview,
  directory: join(dir, 'transcripts'),
});
await writeJson(join(dir, 'candidate-words.json'), words);
if (!ledger.equals(await readFile(ledgerPath)))
  throw new Error('Spending ledger changed');
console.log(
  JSON.stringify({
    id: source.id,
    bytes,
    sha256: await hashFile(original),
    accepted: false,
  }),
);
