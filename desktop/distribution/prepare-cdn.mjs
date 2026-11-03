// Hosted runner only: verify the original release, then split for the free
// Static Assets 25 MiB/file limit. The public byte stream remains identical.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const p = JSON.parse(
  await readFile(process.argv[4] ?? join(here, 'payload.json'), 'utf8'),
);
const body = await readFile(resolve(process.argv[2]));
if (
  body.length !== p.bytes ||
  createHash('sha512').update(body).digest('base64') !== p.sha512
)
  throw Error('CDN source differs from the qualified release');
const out = join(here, 'cdn/assets');
await mkdir(join(out, 'pieces/v' + p.version), { recursive: true });
const chunks = [],
  size = 20_000_000;
for (let start = 0; start < body.length; start += size) {
  const chunk = body.subarray(start, start + size);
  const hash = createHash('sha256').update(chunk).digest('hex');
  const path = `/pieces/v${p.version}/${String(chunks.length).padStart(2, '0')}-${hash}.bin`;
  await writeFile(join(out, path), chunk);
  chunks.push({ path, start, bytes: chunk.length, sha256: hash });
}
const manifest = {
  version: p.version,
  file: p.file,
  bytes: p.bytes,
  sha512: p.sha512,
  chunks,
};
const previous = JSON.parse(
  await readFile(join(out, 'manifest.json'), 'utf8').catch((e) => {
    if (e.code !== 'ENOENT') throw e;
    return '{"releases":{}}';
  }),
);
if (!previous.releases)
  throw Error('Expected a versioned distribution manifest');
previous.releases[p.version] = manifest;
await writeFile(
  join(out, 'manifest.json'),
  JSON.stringify(previous, null, 2) + '\n',
);
await writeFile(
  join(out, '_headers'),
  '/pieces/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n/desktop/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n',
);
const target = join(out, 'desktop/v' + p.version);
await mkdir(target, { recursive: true });
const blockmapPath = resolve(process.argv[2]) + '.blockmap';
const blockmap = await readFile(blockmapPath);
if (
  blockmap.length > 2 * 1024 * 1024 ||
  (p.blockmapSha256 &&
    createHash('sha256').update(blockmap).digest('hex') !== p.blockmapSha256)
)
  throw Error('Invalid CDN update block map');
await copyFile(blockmapPath, join(target, p.file + '.blockmap'));
if (process.argv[3]) {
  const online = resolve(process.argv[3]);
  const proof = JSON.parse(
    await readFile(join(online, 'online-verification.json'), 'utf8'),
  );
  if (
    proof.fixture ||
    proof.version !== p.version ||
    proof.file !== `kimo-Online-Setup-${p.version}.exe` ||
    proof.bytes > 2_000_000
  )
    throw Error('Invalid published online setup manifest');
  const body = await readFile(join(online, proof.file));
  if (
    body.length !== proof.bytes ||
    createHash('sha256').update(body).digest('hex') !== proof.sha256 ||
    proof.payload.sha512 !== p.sha512
  )
    throw Error('Published online setup failed verification');
  await copyFile(join(online, proof.file), join(target, proof.file));
  await copyFile(
    join(online, 'online-verification.json'),
    join(target, 'online-verification.json'),
  );
}
console.log(
  `Prepared ${chunks.length} immutable pieces, exact ${body.length} bytes`,
);
