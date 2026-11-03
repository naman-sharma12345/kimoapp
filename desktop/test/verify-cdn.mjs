import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const here = dirname(fileURLToPath(import.meta.url));
const p = JSON.parse(
  await readFile(join(here, '../distribution/payload.json'), 'utf8'),
);
const url = `https://downloads.getkimo.tech/desktop/v${p.version}/${p.file}`;
const source = await readFile(process.argv[2]);
const started = performance.now();
const response = await fetch(url, { signal: AbortSignal.timeout(240000) });
assert.equal(response.status, 200);
assert.equal(Number(response.headers.get('Content-Length')), p.bytes);
const hash = createHash('sha512');
let bytes = 0;
for await (const chunk of response.body) {
  bytes += chunk.length;
  hash.update(chunk);
}
assert.equal(bytes, p.bytes);
assert.equal(hash.digest('base64'), p.sha512);
const seconds = (performance.now() - started) / 1000;
const ranges = [];
for (const [start, end] of [
  [0, 999999],
  [19999950, 20000049],
  [p.bytes - 4096, p.bytes - 1],
]) {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  assert.equal(r.status, 206);
  assert.equal(
    r.headers.get('Content-Range'),
    `bytes ${start}-${end}/${p.bytes}`,
  );
  assert.deepEqual(
    Buffer.from(await r.arrayBuffer()),
    source.subarray(start, end + 1),
  );
  ranges.push({ start, end, status: r.status });
}
const head = await fetch(url, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(Number(head.headers.get('Content-Length')), p.bytes);
const bad = await fetch(url, { headers: { Range: `bytes=${p.bytes}-` } });
assert.equal(bad.status, 416);
const proof = {
  at: new Date().toISOString(),
  url,
  bytes,
  sha512: p.sha512,
  seconds,
  megabytesPerSecond: bytes / 1e6 / seconds,
  cfRay: response.headers.get('cf-ray'),
  note: 'Hosted runner route; not a regional or user-connection speed guarantee',
  ranges,
  head: head.status,
  invalidRange: bad.status,
};
await mkdir('distribution-evidence', { recursive: true });
await writeFile(
  'distribution-evidence/cdn-verification.json',
  JSON.stringify(proof, null, 2) + '\n',
);
console.log(JSON.stringify(proof));
