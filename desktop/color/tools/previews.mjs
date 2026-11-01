// Offline still-only preview/evidence builder; never opens the full source videos.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { run } from '../../audio/process.mjs';
import { LOOK_IDS } from '../looks.mjs';
import { frameStats, aggregateFrames } from '../analyze.mjs';
import { makeCorrection, writeLut } from '../lut.mjs';
import { colorFilters } from '../filters.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const ffmpeg = process.env.KIMO_FFMPEG ?? 'ffmpeg';
const output = resolve(
  process.env.KIMO_COLOR_OUT ??
    join(process.env.LOCALAPPDATA ?? root, 'kimo/color-phase09'),
);
const previews = join(root, 'data/looks/previews');
await mkdir(output, { recursive: true });
await mkdir(previews, { recursive: true });
const source = {
  pixel_format: 'rgb24',
  color: { space: 'gbr', range: 'pc', primaries: 'bt709', trc: 'bt709' },
};
const input = join(
  root,
  'test/bench/clips/raw-v2/review/TH-1/candidate-first-second.jpg',
);
const before = join(output, 'TH-1-before.png');
await run(ffmpeg, [
  '-i',
  input,
  '-vf',
  'crop=240:134:2:2,scale=480:268:flags=lanczos',
  '-frames:v',
  '1',
  before,
]);
async function stats(path, faceBox) {
  const { stdout } = await run(
    ffmpeg,
    [
      '-i',
      path,
      '-vf',
      'scale=480:268,format=rgb24',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-',
    ],
    { binary: true },
  );
  return aggregateFrames([frameStats(stdout, 480, 268, { faceBox })]);
}
const analysis = await stats(before, [0.35, 0.02, 0.4, 0.72]),
  correction = makeCorrection(analysis),
  results = [];
for (const look of LOOK_IDS) {
  const lut = await writeLut(join(output, 'luts'), {
    correction,
    look,
    strength: 1,
  });
  const after = join(output, `TH-1-${look}.png`),
    strip = join(previews, look + '.webp');
  await run(ffmpeg, [
    '-i',
    before,
    '-vf',
    colorFilters(source, { lut: lut.path }),
    '-frames:v',
    '1',
    after,
  ]);
  await run(ffmpeg, [
    '-i',
    before,
    '-i',
    after,
    '-filter_complex',
    '[0:v]scale=240:134[a];[1:v]scale=240:134[b];[a][b]hstack=inputs=2',
    '-frames:v',
    '1',
    '-c:v',
    'libwebp',
    '-quality',
    '85',
    strip,
  ]);
  const a = await stats(after, [0.35, 0.02, 0.4, 0.72]);
  results.push({
    clip: 'TH-1',
    look,
    input: { p50: analysis.p50, skin: analysis.skin },
    output: {
      p50: a.p50,
      skin: a.skin,
      clipped_pct: a.clipped_low_pct + a.clipped_high_pct,
    },
    limitation: 'one existing first-second still; not a full-clip benchmark',
  });
}
// Small before/after stills for every other golden, retaining original dataset limitations.
for (const name of ['TH-2', 'TUT-1', 'POD-1', 'MUSIC-1', 'VLOG-1']) {
  const candidate = join(
    root,
    `test/bench/clips/raw-v2/review/${name}/candidate-first-second.jpg`,
  );
  const path = existsSync(candidate)
    ? candidate
    : join(root, `test/bench/clips/raw-v2/prepared/${name}/review-1/hook.jpg`);
  try {
    const tile = join(output, `${name}-before.png`);
    await run(ffmpeg, [
      '-i',
      path,
      '-vf',
      'crop=iw/5-2:ih/2-2:1:1,scale=480:268',
      '-frames:v',
      '1',
      tile,
    ]);
    const a = await stats(tile, null);
    if (name === 'TUT-1') a.screen = true;
    const c = makeCorrection(a);
    for (const look of LOOK_IDS) {
      const lut = await writeLut(join(output, 'luts'), {
          correction: c,
          look,
          strength: 1,
        }),
        out = join(output, `${name}-${look}.png`);
      await run(ffmpeg, [
        '-i',
        tile,
        '-vf',
        colorFilters(source, { lut: lut.path }),
        '-frames:v',
        '1',
        out,
      ]);
      const measured = await stats(out, null);
      results.push({
        clip: name,
        look,
        output: {
          clipped_pct: measured.clipped_low_pct + measured.clipped_high_pct,
        },
        limitation:
          'one existing contact-sheet tile; skin localisation unavailable; not a full-clip benchmark',
      });
    }
  } catch (error) {
    results.push({ clip: name, available: false, reason: error.message });
  }
}
const names = ['TH-1', 'TH-2', 'TUT-1', 'POD-1', 'MUSIC-1', 'VLOG-1'],
  rows = [],
  credits = [];
for (const name of names) {
  const paths = [
    join(output, `${name}-before.png`),
    ...LOOK_IDS.map((look) => join(output, `${name}-${look}.png`)),
  ];
  if (!paths.every(existsSync)) continue;
  const filters = paths.map((_, i) => `[${i}:v]scale=240:134[p${i}]`);
  filters.push(
    `${paths.map((_, i) => `[p${i}]`).join('')}hstack=inputs=8[row]`,
  );
  const row = join(output, `${name}-row.png`);
  await run(ffmpeg, [
    ...paths.flatMap((p) => ['-i', p]),
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[row]',
    '-frames:v',
    '1',
    row,
  ]);
  rows.push(row);
  const credit = join(
    root,
    `test/bench/clips/raw-v2/prepared/${name}/credits.txt`,
  );
  if (existsSync(credit)) credits.push(await readFile(credit, 'utf8'));
}
await run(ffmpeg, [
  ...rows.flatMap((p) => ['-i', p]),
  '-filter_complex',
  `vstack=inputs=${rows.length}`,
  '-frames:v',
  '1',
  '-c:v',
  'libwebp',
  '-quality',
  '90',
  join(output, 'stills.webp'),
]);
await writeFile(
  join(output, 'ATTRIBUTIONS.txt'),
  credits.join('\n\n') +
    '\nCropped, resized and colour-corrected reference stills for kimo Phase 9. No endorsement implied.\n',
);
await writeFile(
  join(output, 'still-metrics.json'),
  JSON.stringify(results, null, 2),
);
console.log(output);
