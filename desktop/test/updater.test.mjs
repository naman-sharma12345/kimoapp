import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { reconstruct, checkedManifest } = require('../distribution/delta.cjs');
const { incrementalUpdater } = require('../updater-policy.cjs');
const {
  computeOperations,
} = require('electron-updater/out/differentialDownloader/downloadPlanBuilder.js');
const sha = (b, algorithm = 'sha512', encoding = 'base64') =>
  createHash(algorithm).update(b).digest(encoding);
const block = (chunks) =>
  gzipSync(
    JSON.stringify({
      version: '2',
      files: [
        {
          name: 'file',
          offset: 0,
          sizes: chunks.map((c) => c.length),
          checksums: chunks.map((c) => sha(c, 'sha256', 'hex')),
        },
      ],
    }),
  );
async function fixture(mode = 'normal') {
  const root = await mkdtemp(join(tmpdir(), 'kimo-delta-'));
  const a = Buffer.alloc(65536, 1),
    b = Buffer.alloc(65536, 2),
    c = Buffer.alloc(65536, 3),
    x = Buffer.alloc(65536, 4);
  const old = Buffer.concat([a, b, c]),
    chunks = mode === 'large' ? [x, x, x] : [a, x, c],
    next = Buffer.concat(chunks);
  const maps = { '0.4.2': block([a, b, c]), '0.4.3': block(chunks) };
  const baseFile = join(root, 'installer.exe'),
    output = join(root, 'next.exe');
  await writeFile(baseFile, old);
  let rangeCalls = 0;
  const rangeUrls = [];
  const request = async (url, options = {}) => {
    if (url.endsWith('.blockmap'))
      return new Response(maps[url.includes('/v0.4.2/') ? '0.4.2' : '0.4.3']);
    rangeCalls++;
    rangeUrls.push(url);
    if (mode === 'ignored') return new Response(next, { status: 200 });
    const [, start, end] = /^bytes=(\d+)-(\d+)$/
      .exec(options.headers.Range)
      .map(Number);
    const data = Buffer.from(next.subarray(start, end + 1));
    if (
      (mode === 'disconnect' && rangeCalls === 1) ||
      mode === 'disconnect-always'
    ) {
      let sent = false;
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (!sent) {
              sent = true;
              controller.enqueue(data.subarray(0, 8192));
            } else
              controller.error(
                new TypeError('terminated', {
                  cause: { code: 'UND_ERR_SOCKET' },
                }),
              );
          },
        }),
        {
          status: 206,
          headers: { 'Content-Range': `bytes ${start}-${end}/${next.length}` },
        },
      );
    }
    if (mode === 'corrupt') data[0] ^= 1;
    return new Response(data, {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${next.length}` },
    });
  };
  return {
    root,
    old,
    next,
    baseFile,
    output,
    maps,
    rangeUrls,
    get rangeCalls() {
      return rangeCalls;
    },
    args: {
      manifest: {
        version: '0.4.3',
        file: 'kimo-Setup-0.4.3.exe',
        bytes: next.length,
        sha512: sha(next),
        primary:
          'https://downloads.getkimo.tech/desktop/v0.4.3/kimo-Setup-0.4.3.exe',
      },
      fromVersion: '0.4.2',
      resources: root,
      cacheDir: root,
      baseFile,
      output,
      computeOperations,
      request,
    },
    async clean() {
      assert(root.startsWith(join(tmpdir(), 'kimo-delta-')));
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('incremental installer downloads changed bytes and reuses the unchanged base', async () => {
  const f = await fixture();
  try {
    const proof = await reconstruct(f.args);
    assert.equal(proof.downloadBytes, 65536);
    assert.equal(proof.reusedBytes, 131072);
    assert.equal(
      proof.networkBytes,
      65536 + f.maps['0.4.2'].length + f.maps['0.4.3'].length,
    );
    assert.deepEqual(await readFile(f.output), f.next);
    assert.deepEqual(await readFile(f.baseFile), f.old);
  } finally {
    await f.clean();
  }
});
test('interrupted range retries only that range through the pinned backup', async () => {
  const f = await fixture('disconnect');
  try {
    const fallback =
      'https://github.com/naman-sharma12345/kimoapp/releases/download/v0.4.3/kimo-Setup-0.4.3.exe';
    const proof = await reconstruct({
      ...f.args,
      manifest: { ...f.args.manifest, fallback },
    });
    assert.equal(f.rangeCalls, 2);
    assert.deepEqual(f.rangeUrls, [f.args.manifest.primary, fallback]);
    assert.equal(proof.retryRequests, 1);
    assert.equal(
      proof.networkBytes,
      65536 + 8192 + f.maps['0.4.2'].length + f.maps['0.4.3'].length,
    );
    assert.deepEqual(await readFile(f.output), f.next);
    assert.deepEqual(await readFile(f.baseFile), f.old);
    assert.throws(
      () =>
        checkedManifest({
          ...f.args.manifest,
          fallback: 'https://attacker.test/full.exe',
        }),
      /backup update server/,
    );
  } finally {
    await f.clean();
  }
});
test('persistent range disconnects stop after three attempts and preserve the old base', async () => {
  const f = await fixture('disconnect-always');
  try {
    await assert.rejects(reconstruct(f.args), /terminated/);
    assert.equal(f.rangeCalls, 3);
    await assert.rejects(stat(f.output), { code: 'ENOENT' });
    await assert.rejects(stat(f.output + '.partial'), { code: 'ENOENT' });
    assert.deepEqual(await readFile(f.baseFile), f.old);
  } finally {
    await f.clean();
  }
});
for (const mode of ['ignored', 'corrupt', 'large'])
  test(`incremental installer rejects ${mode} response without a full fallback`, async () => {
    const f = await fixture(mode);
    try {
      await assert.rejects(
        reconstruct(f.args),
        mode === 'ignored'
          ? /bounded range/
          : mode === 'corrupt'
            ? /checksum/
            : /small incremental/,
      );
      await assert.rejects(stat(f.output), { code: 'ENOENT' });
      await assert.rejects(stat(f.output + '.partial'), { code: 'ENOENT' });
      assert.deepEqual(await readFile(f.baseFile), f.old);
      if (mode === 'large') assert.equal(f.rangeCalls, 0);
    } finally {
      await f.clean();
    }
  });
test('missing cached base never downloads the installer', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      reconstruct({ ...f.args, baseFile: join(f.root, 'missing.exe') }),
      { code: 'ENOENT' },
    );
    assert.equal(f.rangeCalls, 0);
  } finally {
    await f.clean();
  }
});
test('release-specific incremental limit is bounded and checked before payload requests', async () => {
  const f = await fixture();
  try {
    for (const maxDeltaBytes of [0, -1, 1.5, 128 * 1024 * 1024 + 1])
      assert.throws(
        () => checkedManifest({ ...f.args.manifest, maxDeltaBytes }),
        /byte limit/,
      );
    const manifest = { ...f.args.manifest, maxDeltaBytes: 65535 };
    await assert.rejects(
      reconstruct({ ...f.args, manifest }),
      /small incremental/,
    );
    assert.equal(f.rangeCalls, 0);
    const proof = await reconstruct({
      ...f.args,
      manifest: { ...manifest, maxDeltaBytes: 65536 },
    });
    assert.equal(proof.downloadBytes, 65536);
    assert.deepEqual(await readFile(f.output), f.next);
  } finally {
    await f.clean();
  }
});
test('release limit cannot bypass the minimum reuse requirement', async () => {
  const f = await fixture('large');
  try {
    await assert.rejects(
      reconstruct({
        ...f.args,
        manifest: { ...f.args.manifest, maxDeltaBytes: 128 * 1024 * 1024 },
      }),
      /small incremental/,
    );
    assert.equal(f.rangeCalls, 0);
  } finally {
    await f.clean();
  }
});
test('background updater permits a full download only after explicit consent', async () => {
  class Base {}
  const info = { info: { size: 369000000, sha512: 'test' } },
    options = { updateInfoAndProvider: { info: { version: '0.4.3' } } };
  for (const allow of [false, true]) {
    let asked = 0;
    const Update = incrementalUpdater(Base, {
      reconstructUpdate: async () => {
        throw Error('missing base');
      },
      confirmFull: async () => {
        asked++;
        return allow;
      },
    });
    const u = new Update();
    u.app = { version: '0.4.2' };
    u.downloadedUpdateHelper = { cacheDir: 'unused' };
    u.emit = () => {};
    if (allow)
      assert.equal(
        await u.differentialDownloadInstaller(info, options, 'unused'),
        true,
      );
    else
      await assert.rejects(
        u.differentialDownloadInstaller(info, options, 'unused'),
        /postponed/,
      );
    assert.equal(asked, 1);
  }
});
test('successful background delta bypasses the full-download branch', async () => {
  const Update = incrementalUpdater(class {}, {
    reconstructUpdate: async () => ({ networkBytes: 3, reusedBytes: 366 }),
    confirmFull: async () => assert.fail('unexpected full prompt'),
  });
  const u = new Update();
  u.app = { version: '0.4.2' };
  u.downloadedUpdateHelper = { cacheDir: 'unused' };
  u.emit = () => {};
  assert.equal(
    await u.differentialDownloadInstaller(
      { info: { size: 369, sha512: 'test' } },
      { updateInfoAndProvider: { info: { version: '0.4.3' } } },
      'unused',
    ),
    false,
  );
});
