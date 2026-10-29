import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
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
  'strip.mp4',
  'review.html',
  'pipeline.json',
  'run.json',
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
for (const aspect of ['9x16', '16x9'])
  for (const file of names)
    await copy(
      join(DATA_ROOT, 'out', label, `${clip}-${aspect}`, file),
      join('data/out', label, `${clip}-${aspect}`, file),
    );
await copy(join(DATA_ROOT, 'clips/media'), 'data/clips/media');
await copy(join(ROOT, 'cache'), 'repo/cache');
await copy(join(ROOT, 'RESULTS.md'), 'repo/RESULTS.md');
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
