import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import {
  ROOT,
  DATA_ROOT,
  command,
  hashFile,
  isMain,
  options,
  readJson,
  safeName,
  sha256,
} from './io.mjs';

export async function downloadVerified(source, directory, fetcher = fetch) {
  if (!/^[a-f0-9]{64}$/.test(source.sha256))
    throw new Error(`Missing pinned SHA256 for ${source.url}`);
  await mkdir(directory, { recursive: true });
  const path = join(directory, sha256(source.url) + '.media');
  if (await stat(path).catch(() => null)) {
    if ((await hashFile(path)) === source.sha256) return path;
    throw new Error(
      `SHA256 mismatch in ${path}; remove the corrupt download and retry`,
    );
  }
  const temporary = path + '.part';
  for (let attempt = 0; attempt < 2; attempt++)
    try {
      const url = new URL(source.url);
      if (attempt) url.searchParams.set('kimo_retry', '1');
      const response = await fetcher(String(url), {
        headers: { 'User-Agent': 'kimo-benchmark/1.0 (licensed test media)' },
        signal: AbortSignal.timeout(15 * 60_000),
      });
      if (!response.ok) {
        const error = new Error(`Download ${response.status}: ${source.url}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(temporary),
      );
      if ((await hashFile(temporary)) !== source.sha256)
        throw new Error(`SHA256 mismatch: ${source.url}`);
      await rename(temporary, path);
      return path;
    } catch (error) {
      if (
        attempt ||
        error.retryable === false ||
        /SHA256 mismatch/.test(error.message)
      )
        throw error;
      console.log(`Download delayed; one retry for pinned source`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } finally {
      await rm(temporary, { force: true });
    }
}

export async function fetchClips({
  ids,
  ffmpeg = process.env.KIMO_FFMPEG || 'ffmpeg',
} = {}) {
  const manifest = await readJson(join(ROOT, 'clips/clips.json'));
  const selected = ids ?? manifest.clips.map((c) => c.id);
  for (const id of selected)
    if (!manifest.clips.some((c) => c.id === id))
      throw new Error(`Unknown clip ${id}`);
  for (const clip of manifest.clips.filter((c) => selected.includes(c.id))) {
    const dir = join(DATA_ROOT, 'clips/media', safeName(clip.id));
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < clip.segments.length; i++) {
      const segment = clip.segments[i];
      const path = await downloadVerified(
        manifest.sources[segment.source],
        join(DATA_ROOT, 'clips/.sources'),
      );
      const output = join(dir, `${i + 1}.mp4`);
      console.log(
        `${clip.id} ${i + 1}/${clip.segments.length}: verify, trim ${segment.duration}s`,
      );
      await command(ffmpeg, [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        String(segment.start),
        '-i',
        path,
        '-t',
        String(segment.duration),
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        output,
      ]);
    }
  }
}
if (isMain(import.meta.url)) {
  const args = options(process.argv.slice(2));
  fetchClips({ ids: args.clips?.split(','), ffmpeg: args.ffmpeg }).catch(
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
}
