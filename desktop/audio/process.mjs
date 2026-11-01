import { spawnBackground } from '../resources.cjs';
import { randomUUID } from 'node:crypto';

/** Bounded, cancellable audio jobs. No shell, foreground workers or paid services. */
export async function run(
  ffmpeg,
  args,
  {
    signal,
    emit = () => {},
    title = 'audio',
    binary = false,
    duration,
    limit = 16 * 1024 * 1024,
  } = {},
) {
  signal?.throwIfAborted();
  const id = randomUUID().slice(0, 8),
    start = Date.now();
  emit({ t: 'op', id, tool: 'sound_design', phase: 'start', title, at: start });
  return new Promise((resolve, reject) => {
    const progress = !binary && duration > 0 && args.includes('-i');
    const child = spawnBackground(
      ffmpeg,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        ...(progress ? ['-progress', 'pipe:2'] : []),
        ...args,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '',
      bytes = 0,
      overflow = false;
    const chunks = [];
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (c) => {
      bytes += c.length;
      if (bytes > limit) {
        overflow = true;
        child.kill();
      } else chunks.push(c);
    });
    child.stderr.on('data', (c) => {
      const chunk = c.toString();
      stderr = (stderr + chunk).slice(-160000);
      if (progress) {
        const at = [...chunk.matchAll(/out_time_us=(\d+)/g)].at(-1);
        if (at)
          emit({
            t: 'progress',
            phase: 'audio',
            label: title,
            f: Math.min(1, Number(at[1]) / 1e6 / duration),
          });
      }
    });
    child.once('error', finish);
    child.once('close', (code) =>
      finish(
        signal?.aborted
          ? new Error('cancelled')
          : overflow
            ? new Error('Audio analysis output exceeded its bound')
            : code
              ? new Error(`${title} (FFmpeg ${code}): ${stderr.slice(-3500)}`)
              : null,
      ),
    );
    let finished = false;
    function finish(error) {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      emit({
        t: 'op',
        id,
        tool: 'sound_design',
        phase: 'end',
        ok: !error,
        ms: Date.now() - start,
        ...(error ? { error: error.message } : { result: title }),
      });
      if (error) reject(error);
      else
        resolve({
          stderr,
          stdout: binary
            ? Buffer.concat(chunks)
            : Buffer.concat(chunks).toString(),
        });
    }
  });
}

export function loudnessJson(stderr) {
  const matches = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if (!matches.length)
    throw new Error('FFmpeg did not return loudness measurements');
  return JSON.parse(matches.at(-1)[0]);
}
export async function measureLoudness(
  ffmpeg,
  input,
  options = {},
  target = -14,
) {
  const result = await run(
    ffmpeg,
    [
      '-i',
      input,
      '-vn',
      '-af',
      `loudnorm=I=${target}:TP=-1:LRA=7:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    { ...options, title: options.title ?? 'measuring audio loudness' },
  );
  return loudnessJson(result.stderr);
}
export const number = (v, fallback = 0) =>
  Number.isFinite(Number(v)) ? Number(v) : fallback;
export const db = (v) => 20 * Math.log10(Math.max(1e-10, v));
export const amp = (v) => 10 ** (v / 20);
const scriptOptions = new Map();
export async function scriptOption(ffmpeg) {
  if (!scriptOptions.has(ffmpeg))
    scriptOptions.set(
      ffmpeg,
      run(ffmpeg, ['-version']).then(({ stdout }) =>
        /ffmpeg version [0-6]\./.test(stdout)
          ? '-filter_complex_script'
          : '-/filter_complex',
      ),
    );
  return scriptOptions.get(ffmpeg);
}
export function tempo(speed = 1) {
  if (!(speed > 0) || !Number.isFinite(speed))
    throw new Error('Invalid audio speed');
  const filters = [];
  while (speed > 2) {
    filters.push('atempo=2');
    speed /= 2;
  }
  while (speed < 0.5) {
    filters.push('atempo=0.5');
    speed *= 2;
  }
  if (Math.abs(speed - 1) > 1e-8) filters.push(`atempo=${speed}`);
  return filters;
}
