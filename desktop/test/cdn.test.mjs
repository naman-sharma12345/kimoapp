import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, parseRange } from '../distribution/cdn/stream.mjs';

const data = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
const manifest = {
  file: 'app.exe',
  version: '0.4.0',
  bytes: data.length,
  sha512: 'test',
  chunks: [
    { path: '/a', start: 0, bytes: 10 },
    { path: '/b', start: 10, bytes: 10 },
    { path: '/c', start: 20, bytes: 16 },
  ],
};
function harness(fail = false) {
  const waits = [],
    calls = [];
  return {
    calls,
    waits,
    ctx: {
      waitUntil(p) {
        waits.push(p);
      },
    },
    env: {
      ASSETS: {
        async fetch(req) {
          calls.push(req.url);
          if (fail) return new Response('gone', { status: 404 });
          const c = manifest.chunks.find(
            (c) => c.path === new URL(req.url).pathname,
          );
          const r = parseRange(req.headers.get('Range'), c.bytes);
          const body = data.subarray(c.start + r.start, c.start + r.end + 1);
          return new Response(body, {
            status: r.partial ? 206 : 200,
            headers: { 'Content-Length': String(body.length) },
          });
        },
      },
    },
  };
}
const handler = createHandler(manifest, () => new TransformStream());
async function get(headers, method = 'GET', fail = false) {
  const h = harness(fail);
  const r = await handler(
    new Request('https://downloads.getkimo.tech/desktop/v0.4.0/app.exe', {
      headers,
      method,
    }),
    h.env,
    h.ctx,
  );
  const body = Buffer.from(await r.arrayBuffer());
  await Promise.all(h.waits);
  return { r, body, calls: h.calls };
}
test('full response streams every byte in order', async () => {
  const { r, body, calls } = await get({});
  assert.equal(r.status, 200);
  assert.deepEqual(body, data);
  assert.equal(calls.length, 3);
});
test('asset binding may omit Content-Length and ignore Range', async () => {
  const waits = [];
  const env = {
    ASSETS: {
      async fetch(req) {
        const c = manifest.chunks.find(
          (c) => c.path === new URL(req.url).pathname,
        );
        return new Response(data.subarray(c.start, c.start + c.bytes));
      },
    },
  };
  const r = await handler(
    new Request('https://downloads.getkimo.tech/desktop/v0.4.0/app.exe', {
      headers: { Range: 'bytes=8-22' },
    }),
    env,
    {
      waitUntil(p) {
        waits.push(p);
      },
    },
  );
  assert.equal(r.status, 206);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), data.subarray(8, 23));
  await Promise.all(waits);
});
test('resume across chunk boundaries, clamping, suffix and single byte', async () => {
  for (const [range, start, end] of [
    ['bytes=8-22', 8, 22],
    ['bytes=33-', 33, 35],
    ['bytes=-4', 32, 35],
    ['bytes=0-0', 0, 0],
    ['bytes=34-999', 34, 35],
  ]) {
    const { r, body } = await get({ Range: range });
    assert.equal(r.status, 206);
    assert.deepEqual(body, data.subarray(start, end + 1));
    assert.equal(
      r.headers.get('Content-Range'),
      `bytes ${start}-${end}/${data.length}`,
    );
  }
});
test('HEAD, ETag, If-Range, invalid ranges, methods and failed asset', async () => {
  assert.equal((await get({}, 'HEAD')).calls.length, 0);
  assert.equal((await get({ 'If-None-Match': '"sha512-test"' })).r.status, 304);
  assert.deepEqual(
    (await get({ Range: 'bytes=8-9', 'If-Range': 'stale' })).body,
    data,
  );
  for (const Range of [
    'bytes=99-',
    'bytes=3-2',
    'bytes=0-1,4-5',
    'bytes=-0',
    'bytes=-',
    'other=1-2',
  ])
    assert.equal((await get({ Range })).r.status, 416);
  assert.equal((await get({}, 'POST')).r.status, 405);
  assert.equal((await get({}, 'GET', true)).r.status, 503);
});
