// Hosted runner only: verify the original release, then split for the free
// Static Assets 25 MiB/file limit. The public byte stream remains identical.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const p = JSON.parse(await readFile(join(here, 'payload.json'), 'utf8'));
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
await writeFile(
  join(out, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
await writeFile(
  join(out, '_headers'),
  '/pieces/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n',
);
console.log(
  `Prepared ${chunks.length} immutable pieces, exact ${body.length} bytes`,
);
