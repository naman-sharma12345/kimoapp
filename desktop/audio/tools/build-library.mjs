// Original procedural scores and foley, dedicated to CC0. Offline maintenance tool;
// not run at application startup. Uses only Node and the bundled FFmpeg.
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnBackground, lowerPriority } from '../../resources.cjs';
import { once } from 'node:events';
import { hash } from '../sfx.mjs';

lowerPriority(process.pid);
const root = fileURLToPath(new URL('../../', import.meta.url));
const ffmpeg = process.env.KIMO_FFMPEG ?? 'ffmpeg';
const sr = 24000,
  tau = 2 * Math.PI;
const configs = [
  ['warm-notebook', 96, 'C major', 'warm', 2, [0, 7, 9, 5]],
  ['bright-steps', 120, 'D major', 'upbeat', 4, [2, 9, 11, 7]],
  ['quiet-document', 80, 'A minor', 'documentary', 1, [9, 5, 0, 7]],
  ['neon-free-drive', 112, 'E minor', 'energetic', 5, [4, 0, 7, 2]],
  ['soft-focus', 88, 'F major', 'calm', 1, [5, 0, 2, 10]],
  ['curious-mechanism', 108, 'D minor', 'curious', 3, [2, 10, 5, 0]],
  ['wide-horizon', 100, 'G major', 'cinematic', 3, [7, 2, 4, 0]],
  ['late-morning', 116, 'C major', 'playful', 4, [0, 5, 9, 7]],
];
await mkdir(join(root, 'audio/music'), { recursive: true });
await mkdir(join(root, 'audio/sfx'), { recursive: true });
await mkdir(join(root, 'data'), { recursive: true });
function noise(seed) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2147483648 - 1;
  };
}
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
async function encode(path, seconds, sample, filters, codec) {
  const child = spawnBackground(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      's16le',
      '-ar',
      String(sr),
      '-ac',
      '2',
      '-i',
      'pipe:0',
      '-af',
      filters,
      '-ar',
      '48000',
      ...codec,
      path,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let err = '';
  child.stderr.on('data', (c) => (err += c));
  child.stdin.on('error', () => {});
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => (code ? reject(new Error(err)) : resolve()));
  });
  const total = Math.round(seconds * sr);
  for (let from = 0; from < total; from += 4096) {
    const count = Math.min(4096, total - from),
      buf = Buffer.alloc(count * 4);
    for (let i = 0; i < count; i++) {
      const [l, r] = sample((from + i) / sr);
      buf.writeInt16LE(
        Math.round(Math.max(-0.99, Math.min(0.99, l)) * 32767),
        i * 4,
      );
      buf.writeInt16LE(
        Math.round(Math.max(-0.99, Math.min(0.99, r)) * 32767),
        i * 4 + 2,
      );
    }
    if (!child.stdin.write(buf)) await once(child.stdin, 'drain');
  }
  child.stdin.end();
  await done;
}
const music = [];
for (const [id, bpm, key, mood, energy, roots] of configs) {
  const beat = 60 / bpm,
    bars = Math.ceil(120 / (beat * 4) / 8) * 8,
    duration = bars * beat * 4,
    rand = noise(hash(id));
  await encode(
    join(root, `audio/music/${id}.opus`),
    duration,
    (t) => {
      const b = t / beat,
        bar = Math.floor(b / 4),
        rootNote = roots[Math.floor(bar / 2) % 4],
        minor = key.includes('minor'),
        pos = b % 1;
      const chord = [0, minor ? 3 : 4, 7];
      let l = 0,
        r = 0;
      for (let j = 0; j < 3; j++) {
        const f = hz(48 + rootNote + chord[j]),
          env = 0.025 * (0.7 + 0.3 * Math.sin((Math.PI * (b % 8)) / 8));
        l += env * Math.sin(tau * f * t);
        r += env * Math.sin(tau * f * 1.0004 * t);
      }
      const bass =
        0.075 * Math.exp(-pos * 5) * Math.sin(tau * hz(36 + rootNote) * t);
      const step = Math.floor(b * 2),
        p = (b * 2) % 1,
        note = 60 + rootNote + chord[step % 3] + (step % 8 === 7 ? 12 : 0);
      const melody =
        0.07 *
        Math.exp(-p * 6) *
        (Math.sin(tau * hz(note) * t) + 0.2 * Math.sin(tau * hz(note) * 2 * t));
      const kick =
        energy > 1
          ? 0.14 *
            Math.exp(-pos * 25) *
            Math.sin(tau * (45 * t + 3 * (1 - Math.exp(-pos * 20))))
          : 0;
      const snare =
        energy > 2 && (Math.floor(b) % 4) % 2 === 1
          ? rand() * 0.065 * Math.exp(-pos * 35)
          : 0;
      const hat = energy > 1 ? rand() * 0.025 * Math.exp(-p * 55) : 0;
      const fade = Math.min(1, t / 0.03, (duration - t) / 0.03);
      return [
        (l + bass + melody * 0.8 + kick + snare + hat) * fade,
        (r + bass + melody + kick + snare - hat * 0.3) * fade,
      ];
    },
    'highpass=f=30,loudnorm=I=-16:TP=-2:LRA=7,aresample=48000',
    ['-c:a', 'libopus', '-b:a', '128k'],
  );
  music.push({
    id,
    title: id.replaceAll('-', ' '),
    path: `audio/music/${id}.opus`,
    bpm,
    key,
    mood,
    energy,
    duration,
    loop_start: 0,
    loop_end: duration - 4 * beat,
    beat_offset: 0,
    license: 'CC0-1.0',
    creator: 'kimo original procedural score',
    source:
      'https://github.com/naman-sharma12345/kimoapp/blob/main/desktop/audio/tools/build-library.mjs',
  });
}
const kinds = [
  ['whoosh', 6, 0.6],
  ['swish', 4, 0.35],
  ['pop', 5, 0.14],
  ['click', 4, 0.07],
  ['riser', 3, 2],
  ['impact', 3, 0.9],
  ['ding', 3, 0.6],
  ['shutter', 2, 0.16],
  ['keyboard', 3, 0.25],
  ['glitch', 3, 0.2],
  ['paper', 2, 0.4],
  ['tap', 2, 0.12],
];
const sfx = [];
for (const [kind, count, duration] of kinds)
  for (let v = 0; v < count; v++) {
    const id = `${kind}-${v + 1}`,
      rand = noise(hash(id)),
      freq = 400 + v * 170;
    let smooth = 0;
    const path = join(root, `audio/sfx/${id}.wav`);
    await encode(
      path,
      duration,
      (t) => {
        const x = t / duration,
          edge = Math.min(1, t / 0.005, (duration - t) / 0.01);
        smooth = smooth * 0.85 + rand() * 0.15;
        let value;
        if (/whoosh|swish|paper/.test(kind))
          value = smooth * Math.sin(Math.PI * x) ** 2 * 0.8;
        else if (kind === 'riser')
          value =
            (smooth + 0.12 * Math.sin(tau * (80 * t + 400 * t * t))) *
            x *
            x *
            0.5;
        else if (kind === 'impact')
          value =
            (0.5 * Math.sin(tau * (45 + v * 9) * t) + smooth) *
            Math.exp(-x * 9);
        else if (kind === 'keyboard' || kind === 'shutter' || kind === 'glitch')
          value =
            rand() *
            Math.exp(-((x * (kind === 'keyboard' ? 5 : 1)) % 1) * 12) *
            0.3;
        else
          value =
            Math.sin(tau * (freq + (kind === 'pop' ? 500 * (1 - x) : 0)) * t) *
            Math.exp(-x * 8) *
            0.4;
        return [value * edge, value * edge];
      },
      'loudnorm=I=-20:TP=-3:LRA=7,aresample=48000',
      ['-c:a', 'pcm_s16le'],
    );
    // Peak is read from the actual normalized file, never assumed from loudnorm's target.
    const child = spawnBackground(
      ffmpeg,
      [
        '-hide_banner',
        '-i',
        path,
        '-af',
        'astats=metadata=0:reset=0',
        '-f',
        'null',
        '-',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let log = '';
    child.stderr.on('data', (c) => (log += c));
    await once(child, 'close');
    const peak = Number(
      [...log.matchAll(/Peak level dB:\s*(-?[\d.]+)/g)].at(-1)?.[1],
    );
    sfx.push({
      id,
      kind,
      intensity: 1 + (v % 3),
      duration,
      path: `audio/sfx/${id}.wav`,
      peak_db: Number.isFinite(peak) ? peak : -3,
      license: 'CC0-1.0',
      creator: 'kimo original synthesized foley',
      source:
        'https://github.com/naman-sharma12345/kimoapp/blob/main/desktop/audio/tools/build-library.mjs',
    });
  }
await writeFile(
  join(root, 'data/music.json'),
  JSON.stringify(music, null, 2) + '\n',
);
await writeFile(
  join(root, 'data/sfx.json'),
  JSON.stringify(sfx, null, 2) + '\n',
);
let mb = 0;
for (const a of [...music, ...sfx])
  mb += (await stat(join(root, a.path))).size / 1048576;
console.log(
  `${music.length} original CC0 scores, ${sfx.length} CC0 sounds; ${mb.toFixed(2)} MiB`,
);
