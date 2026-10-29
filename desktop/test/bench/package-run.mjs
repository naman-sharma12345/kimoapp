import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, join, sep, relative } from 'node:path';
import {
  ROOT,
  DATA_ROOT,
  options,
  safeName,
  readJson,
  writeJson,
} from './io.mjs';

const args = options(process.argv.slice(2));
const destination = resolve(args.destination);
const clip = safeName(args.clip);
const label = safeName(args.label);
const names = [
  'final.mp4',
  'project.kimo.json',
  'ops.jsonl',
  'metrics.json',
  'words.json',
  'sheet.jpg',
  'hook.jpg',
  'strip.mp4',
  'review.html',
  'pipeline.json',
  'run.json',
  'analysis.json',
  'failure.json',
];
async function copy(source, relative) {
  const target = resolve(destination, relative);
  if (!target.startsWith(destination + sep))
    throw new Error('Artifact path escaped bundle');
  if (!(await stat(source).catch(() => null))) return;
  await mkdir(resolve(target, '..'), { recursive: true });
  await cp(source, target, { recursive: true });
}
for (const aspect of ['9x16', '16x9']) {
  for (const file of names)
    await copy(
      join(DATA_ROOT, 'out', label, `${clip}-${aspect}`, file),
      join('data/out', label, `${clip}-${aspect}`, file),
    );
  const project = await readJson(
    join(DATA_ROOT, 'out', label, `${clip}-${aspect}`, 'project.kimo.json'),
  ).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  // Keep derived SAM/audio assets that are referenced by the saved project.
  for (const asset of Object.values(project?.assets ?? {})) {
    if (!asset.path) continue;
    const source = resolve(asset.path);
    if (source.startsWith(DATA_ROOT + sep))
      await copy(source, join('data', relative(DATA_ROOT, source)));
  }
}
await copy(join(DATA_ROOT, 'clips/media'), 'data/clips/media');
await copy(join(ROOT, 'cache'), 'repo/cache');
await copy(join(ROOT, 'RESULTS.md'), 'repo/RESULTS.md');
await copy(join(ROOT, 'CREDITS.md'), 'repo/CREDITS.md');
await copy(
  join(DATA_ROOT, 'out', label, 'proxy-status.json'),
  join('data/out', label, 'proxy-status.json'),
);
const info = {
  version: 1,
  clip,
  label,
  createdAt: new Date().toISOString(),
  ledger: await readJson(join(ROOT, 'cache/spend.json')),
  dataRoot: DATA_ROOT,
};
await writeJson(join(destination, 'bundle.json'), info);
console.log(
  `Packaged ${clip}: ${destination}; ${info.ledger.reservedUsd.toFixed(4)} USD reserved`,
);
