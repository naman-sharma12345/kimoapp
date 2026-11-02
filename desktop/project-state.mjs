import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  lstat,
  rm,
} from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export async function saveCheckpoint(dir, stage, state) {
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'checkpoint.json');
  await writeFile(
    path + '.partial',
    JSON.stringify({
      version: 1,
      stage,
      at: new Date().toISOString(),
      ...state,
    }),
  );
  await rename(path + '.partial', path);
}
export async function readCheckpoint(dir) {
  try {
    return JSON.parse(await readFile(join(dir, 'checkpoint.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export function inputFingerprint(files, note, style, preset) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        files: files.map((f) => [f.path, f.bytes, f.duration, f.mtimeMs]),
        note,
        style,
        preset,
      }),
    )
    .digest('hex');
}
export async function folderBytes(dir) {
  let bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  })) {
    const p = join(dir, e.name),
      s = await lstat(p);
    if (s.isSymbolicLink()) continue;
    bytes += s.isDirectory() ? await folderBytes(p) : s.size;
  }
  return bytes;
}
/** Only the named disposable cache; never project EDLs, history, source proxies or ledgers. */
export async function clearCache(cache, root) {
  const target = resolve(cache),
    base = resolve(root);
  if (target !== join(base, 'cache') || !target.startsWith(base + sep))
    throw new Error('Cache target outside the application cache');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
}
export async function cleanPartials(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) await cleanPartials(path);
    else if (/\.partial(?:\.[a-z0-9]+)?$/i.test(e.name))
      await rm(path, { force: true });
  }
}
