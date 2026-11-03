import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
const here = dirname(fileURLToPath(import.meta.url));
const p = JSON.parse(
  await readFile(
    process.argv[4] ?? join(here, '../distribution/payload.json'),
    'utf8',
  ),
);
const url = `https://downloads.getkimo.tech/desktop/v${p.version}/${p.file}`;
const source = await readFile(process.argv[2]);
// Worker and asset versions can reach edge locations a few seconds apart.
// Retry only unavailable headers; byte/hash/range assertions remain strict.
async function available(url, options = {}) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(240000),
    });
    if (![404, 503].includes(response.status) || attempt === 23)
      return response;
    await response.body?.cancel();
    await new Promise((r) => setTimeout(r, 5000));
  }
}
const mapResponse = await available(url + '.blockmap');
assert.equal(mapResponse.status, 200);
const mapBytes = Buffer.from(await mapResponse.arrayBuffer());
assert(mapBytes.length < 2 * 1024 * 1024);
if (p.blockmapSha256)
  assert.equal(
    createHash('sha256').update(mapBytes).digest('hex'),
    p.blockmapSha256,
  );
assert.equal(
  JSON.parse(gunzipSync(mapBytes, { maxOutputLength: 16 * 1024 * 1024 })).files
    .length,
  1,
);
// A newly created custom domain can take a short time to resolve and issue TLS.
let ready = false;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });
    if (
      r.status === 200 &&
      Number(r.headers.get('Content-Length')) === p.bytes
    ) {
      ready = true;
      break;
    }
  } catch {
    /* DNS/TLS provisioning only; full-byte validation below is strict. */
  }
  await new Promise((r) => setTimeout(r, 5000));
}
assert(ready, 'CDN domain did not become ready');
const started = performance.now();
const response = await available(url);
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
if (process.argv[3]) {
  const expected = JSON.parse(
    await readFile(join(process.argv[3], 'online-verification.json'), 'utf8'),
  );
  const launcherUrl = `https://downloads.getkimo.tech/desktop/v${p.version}/${expected.file}`;
  const r = await fetch(launcherUrl);
  assert.equal(r.status, 200);
  const body = Buffer.from(await r.arrayBuffer());
  assert.equal(body.length, expected.bytes);
  assert.equal(
    createHash('sha256').update(body).digest('hex'),
    expected.sha256,
  );
  proof.launcher = {
    url: launcherUrl,
    bytes: body.length,
    sha256: expected.sha256,
  };
}
await mkdir('distribution-evidence', { recursive: true });
await writeFile(
  `distribution-evidence/cdn-verification-${p.version}.json`,
  JSON.stringify(proof, null, 2) + '\n',
);
console.log(JSON.stringify(proof));
