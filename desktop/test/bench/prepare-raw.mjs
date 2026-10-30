// Preparation is deliberately restricted to hosted runners: never render this on the user's PC.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ROOT,
  DATA_ROOT,
  command,
  hashFile,
  readJson,
  writeJson,
  probeFile,
} from './io.mjs';
import { toolPaths } from './run.mjs';
import { reviewMedia } from './report.mjs';
import { transcribe } from './analyze.mjs';

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
)
  throw new Error('Raw preparation requires a standard GitHub-hosted runner');
const manifest = await readJson(join(ROOT, 'clips/raw-v2/clips.json'));
const clip = manifest.clips.find((c) => c.id === process.env.BENCH_CLIP);
if (!clip) throw new Error('Unknown raw case');
const ledger = await readFile(join(ROOT, 'cache/spend.json'));
const tools = toolPaths();
const dir = join(DATA_ROOT, 'raw-v2/media', clip.id);
await mkdir(dir, { recursive: true });
const prepared = [];
const credits = new Set();
for (let i = 0; i < clip.segments.length; i++) {
  const segment = clip.segments[i];
  const source = manifest.sources[segment.source];
  const input = join(
    DATA_ROOT,
    'raw-v2-candidates',
    segment.source,
    'source.media',
  );
  if ((await hashFile(input)) !== source.sha256)
    throw new Error(`Source changed: ${segment.source}`);
  const metadata = await probeFile(tools.ffprobe, input);
  if (
    segment.start < 0 ||
    segment.duration <= 0 ||
    segment.start + segment.duration > metadata.duration
  )
    throw new Error('Selected interval outside acquired source');
  const output = join(dir, `${i + 1}.mp4`);
  // Preserve source rate; standardise only the raster and audio. Prepare exactly once and reuse bytes.
  const rate = metadata.video.avg_frame_rate;
  await command(tools.ffmpeg, [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-threads',
    '2',
    '-ss',
    String(segment.start),
    '-i',
    input,
    '-t',
    String(segment.duration),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
    '-r',
    rate,
    '-fps_mode',
    'cfr',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-preset',
    'fast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    output,
  ]);
  const words = clip.speech
    ? await transcribe({
        ...tools,
        input: output,
        directory: join(DATA_ROOT, 'raw-v2/transcripts'),
      })
    : [];
  await writeJson(join(dir, `${i + 1}-words.json`), words);
  const review = join(dir, `review-${i + 1}`);
  await mkdir(review, { recursive: true });
  await reviewMedia({
    ffmpeg: tools.ffmpeg,
    output,
    directory: review,
    duration: segment.duration,
  });
  // Full short source preview for visual/audio review, separate from the unmodified prepared input.
  await command(tools.ffmpeg, [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-i',
    output,
    '-vf',
    'scale=640:-2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-preset',
    'fast',
    '-crf',
    '26',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    join(review, 'source-preview.mp4'),
  ]);
  prepared.push({
    ...segment,
    file: `${i + 1}.mp4`,
    sha256: await hashFile(output),
    sourceSha256: source.sha256,
    metadata: await probeFile(tools.ffprobe, output),
    wordEntries: words.length,
  });
  credits.add(
    `${source.credit}\n${source.title}\n${source.page}\n${source.licence}\n${source.licenceUrl}`,
  );
}
if (clip.music) {
  const source = manifest.sources[clip.music.source];
  const input = join(
    DATA_ROOT,
    'raw-v2-candidates',
    clip.music.source,
    source.music.file,
  );
  if ((await hashFile(input)) !== source.music.sha256)
    throw new Error('Music source changed');
  await copyFile(input, join(dir, 'music-bed.wav'));
  credits.add(
    `${source.music.credit}\n${source.music.title}\n${source.music.page}\n${source.music.licence}\n${source.music.licenceUrl}`,
  );
}
await writeFile(join(dir, 'CREDITS.txt'), [...credits].join('\n\n') + '\n');
await writeJson(join(dir, 'prepared.json'), {
  dataset: 'raw-v2',
  case: clip.id,
  preparedAt: new Date().toISOString(),
  commit: (await command('git', ['rev-parse', 'HEAD'])).stdout
    .toString()
    .trim(),
  segments: prepared,
  music: clip.music ? manifest.sources[clip.music.source].music : null,
  notes: clip.notes,
  accepted: false,
  scope:
    'Frozen preparation bytes; final source review and renderer acceptance remain separate',
});
if (!ledger.equals(await readFile(join(ROOT, 'cache/spend.json'))))
  throw new Error('Budget ledger changed');
