import { spawnBackground as spawn } from '../../resources.cjs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('.', import.meta.url));
// Large generated media must not churn the source checkout's cloud sync.
export const DATA_ROOT = resolve(
  process.env.KIMO_BENCH_DATA ||
    (process.platform === 'win32' && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'kimo', 'bench')
      : ROOT),
);
export const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex');
let commandSignal;
export function bindCommandSignal(signal) {
  const previous = commandSignal;
  commandSignal = signal;
  return () => {
    commandSignal = previous;
  };
}
export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export const readJson = async (path) =>
  JSON.parse(await readFile(path, 'utf8'));
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}
export function command(
  bin,
  args,
  {
    timeout = 30 * 60_000,
    maxBytes = 96 * 1024 * 1024,
    maxStderr = 8_000_000,
    signal = commandSignal,
  } = {},
) {
  return new Promise((done, fail) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });
    const chunks = [];
    let size = 0;
    let stderr = '';
    let failure;
    const timer = setTimeout(() => {
      failure = new Error(`${bin} timed out`);
      child.kill();
    }, timeout);
    child.stdout.on('data', (d) => {
      size += d.length;
      if (size > maxBytes) {
        failure = new Error(`${bin}: output exceeded ${maxBytes} bytes`);
        child.kill();
      } else chunks.push(d);
    });
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-maxStderr);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      fail(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure || code !== 0)
        fail(
          failure ?? new Error(`${bin} exited ${code}: ${stderr.slice(-3000)}`),
        );
      else done({ stdout: Buffer.concat(chunks), stderr });
    });
  });
}
export async function probeFile(ffprobe, path) {
  const { stdout } = await command(ffprobe, [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ]);
  const json = JSON.parse(stdout);
  const video = json.streams.find((s) => s.codec_type === 'video');
  const audio = json.streams.find((s) => s.codec_type === 'audio');
  const rate = (v) => {
    const [a, b = 1] = String(v).split('/').map(Number);
    return a / b;
  };
  return {
    ...json,
    video,
    audio,
    fps: rate(video?.avg_frame_rate),
    duration: Number(json.format.duration),
  };
}
export function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--'))
      throw new Error(`Expected option, got ${argv[i]}`);
    const key = argv[i].slice(2);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate --${key}`);
    result[key] =
      argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return result;
}
export function safeName(value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value))
    throw new Error(`Unsafe name: ${value}`);
  return value;
}
export const isMain = (url) =>
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url);
export const filterPath = (path) =>
  path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "'\\''");
