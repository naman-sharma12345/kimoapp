import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProxyCache, CacheMiss } from './cache.mjs';
import { sha256 } from './io.mjs';
import { downloadVerified } from './fetch-clips.mjs';
import { escapeHtml, reviewHtml } from './report.mjs';
import { relocatePaths } from './portable.mjs';
import { ai } from '../../engine.mjs';

test('real AI transport sends long contact-sheet labels within the proxy contract', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-label-'));
  const imageUrl = 'data:image/jpeg;base64,YQ==';
  const cache = new ProxyCache({
    directory: dir,
    replay: false,
    maxRequests: 1,
    upstream: async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.kind, 'review');
      assert.equal(body.images[0].url, imageUrl);
      assert.equal(body.images[0].label.length, 80);
      return Response.json({ record: { verdict: 'clean' } });
    },
  });
  const restore = cache.install();
  try {
    assert.deepEqual(
      await ai('review', 'review this render', [
        { label: 'contact sheet '.repeat(8), url: imageUrl },
      ]),
      { verdict: 'clean' },
    );
    cache.assertClean();
    assert.equal(cache.requests, 1);
  } finally {
    restore();
    await rm(dir, { recursive: true, force: true });
  }
});

test('real AI transport does not retry permanent HTTP failures through the recorder', async () => {
  let calls = 0;
  const cache = new ProxyCache({
    directory: tmpdir(),
    replay: false,
    maxRequests: 3,
    upstream: async () => {
      calls++;
      return Response.json(
        { error: { code: 'invalid_request', message: 'contract rejected' } },
        { status: 400 },
      );
    },
  });
  const restore = cache.install();
  try {
    await assert.rejects(
      ai('review', 'permanent HTTP failure regression fixture'),
      /contract rejected/,
    );
    assert.equal(calls, 1);
    assert.equal(cache.requests, 1);
    assert.throws(() => cache.assertClean(), /Proxy 400/);
  } finally {
    restore();
  }
});

test('downloaded project paths relocate without changing identifiers or sibling prefixes', () => {
  const project = {
    assets: [{ path: 'D:\\runner\\data\\clips\\1.mp4', id: 'asset-1' }],
    output: 'D:/runner/data/out/final.mp4',
    unrelated: 'D:/runner/database/file',
    text: 'saved in D:/runner/data',
  };
  const moved = relocatePaths(project, 'D:/runner/data', 'C:\\local\\bench');
  assert.equal(moved.assets[0].path, 'C:/local/bench/clips/1.mp4');
  assert.equal(moved.output, 'C:/local/bench/out/final.mp4');
  assert.equal(moved.assets[0].id, 'asset-1');
  assert.equal(moved.unrelated, project.unrelated);
  assert.equal(moved.text, project.text);
  assert.equal(project.assets[0].path, 'D:\\runner\\data\\clips\\1.mp4');
});

const url = 'https://api.getkimo.tech/v1/desktop/ai';
const init = (text = 'make a cut') => ({
  method: 'POST',
  body: JSON.stringify({ kind: 'build', text, images: [] }),
});
test('record/replay preserves JSON escapes and remaps machine paths without network', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-cache-'));
  try {
    let requests = 0;
    const a = 'C:\\old path\\clip.mp4',
      b = 'D:\\new path\\clip.mp4';
    const record = new ProxyCache({
      directory: dir,
      replay: false,
      maxRequests: 1,
      aliases: [[a, '@CLIP@']],
      upstream: async () => {
        requests++;
        return Response.json({
          record: {
            calls: [{ tool: 'import_media', args: { path: a } }],
            message: 'line one\nline two',
          },
        });
      },
    });
    await record.fetch(url, init(a));
    const replay = new ProxyCache({
      directory: dir,
      aliases: [[b, '@CLIP@']],
      upstream: () => {
        throw new Error('NETWORK');
      },
    });
    const body = await (await replay.fetch(url, init(b))).json();
    assert.equal(requests, 1);
    assert.equal(replay.requests, 0);
    assert.equal(replay.hits, 1);
    assert.equal(body.record.calls[0].args.path, b.replaceAll('\\', '/'));
    assert.equal(body.record.message, 'line one\nline two');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('portable cache keys normalize nested Windows histories and object key order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-portable-'));
  try {
    const a = 'D:\\a\\record\\clip.mp4',
      b = 'C:\\other\\replay\\clip.mp4';
    const record = new ProxyCache({
      directory: dir,
      replay: false,
      maxRequests: 1,
      aliases: [[a, '@SOURCE@']],
      upstream: async () => Response.json({ record: { done: true } }),
    });
    const history = (p) =>
      JSON.stringify({
        kind: 'build',
        images: [],
        text: `import_media(${JSON.stringify({ path: p })})`,
      });
    await record.fetch(url, { method: 'POST', body: history(a) });
    const replay = new ProxyCache({
      directory: dir,
      aliases: [[b, '@SOURCE@']],
      upstream: () => {
        throw Error('NETWORK');
      },
    });
    await replay.fetch(url, {
      method: 'POST',
      body: history(b.replaceAll('\\', '/')),
    });
    assert.equal(replay.hits, 1);
    assert.equal(replay.requests, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('cached tool arguments preserve the order used in subsequent planner history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-history-'));
  try {
    const payload = {
      record: {
        calls: [
          {
            tool: 'set_property',
            args: { clip_id: 'clip1', property: 'scale', value: 1.2 },
          },
        ],
      },
    };
    const record = new ProxyCache({
      directory: dir,
      replay: false,
      maxRequests: 1,
      upstream: async () => Response.json(payload),
    });
    const original = await (await record.fetch(url, init())).json();
    const replay = new ProxyCache({ directory: dir });
    const restored = await (await replay.fetch(url, init())).json();
    assert.equal(
      JSON.stringify(restored.record.calls[0].args),
      JSON.stringify(original.record.calls[0].args),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('verified contributor pricing, SAM frame reservations and pre-send accounting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-budget-'));
  try {
    const reservations = [];
    const cache = new ProxyCache({
      directory: dir,
      replay: false,
      maxRequests: 4,
      buildModel: 'muse-spark-1.3-contributor',
      onReserve: (n) => reservations.push(n),
      upstream: async () => Response.json({ record: {} }),
    });
    await cache.fetch(url, init());
    assert.ok(reservations[0] < 0.01);
    await cache.fetch('https://api.getkimo.tech/v1/desktop/sam/file', {
      method: 'POST',
      body: Buffer.from('unique proxy'),
    });
    await cache.fetch('https://api.getkimo.tech/v1/desktop/sam', {
      method: 'POST',
      body: JSON.stringify({ file_id: 'f1', frames: 300 }),
    });
    assert.equal(reservations[1], 0);
    assert.ok(Math.abs(reservations[2] - 0.06) < 1e-10);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('replay miss, corrupt cache, foreign endpoint and budget fail before upstream', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-cache-'));
  try {
    const cache = new ProxyCache({
      directory: dir,
      upstream: () => {
        throw new Error('must never call');
      },
    });
    await assert.rejects(cache.fetch(url, init()), CacheMiss);
    assert.throws(() => cache.assertClean(), /cache miss/);
    await assert.rejects(cache.fetch('https://example.org', init()), /forbids/);
    const record = new ProxyCache({
      directory: dir,
      replay: false,
      maxRequests: 0,
      upstream: () => {
        throw new Error('must never call');
      },
    });
    await assert.rejects(record.fetch(url, init()), /budget/);
    assert.equal(record.requests, 0);
    const good = new ProxyCache({
      directory: dir,
      replay: false,
      maxRequests: 1,
      upstream: async () => Response.json({ record: {} }),
    });
    await good.fetch(url, init());
    const path = join(dir, (await readdir(dir))[0]);
    const entry = JSON.parse(await readFile(path, 'utf8'));
    entry.body += 'x';
    await writeFile(path, JSON.stringify(entry));
    await assert.rejects(cache.fetch(url, init()), /Corrupt/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('SAM upload / SSE / cleanup replay all pass through the offline gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-cache-'));
  try {
    const cache = new ProxyCache({ directory: dir });
    for (const [path, body] of [
      ['/file', Buffer.from('video')],
      ['', '{"prompt":"person","file_id":"f1"}'],
      ['/file/delete', '{"file_id":"f1"}'],
    ])
      await assert.rejects(
        cache.fetch('https://api.getkimo.tech/v1/desktop/sam' + path, {
          method: 'POST',
          body,
        }),
        CacheMiss,
      );
    assert.equal(cache.requests, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('download manifest verifies cached and freshly downloaded bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-clips-'));
  try {
    const bytes = Buffer.from('licensed fixture bytes');
    const source = { url: 'https://example.org/clip', sha256: sha256(bytes) };
    const path = await downloadVerified(
      source,
      dir,
      async () => new Response(bytes),
    );
    assert.deepEqual(await readFile(path), bytes);
    await writeFile(path, 'corrupt');
    await assert.rejects(downloadVerified(source, dir), /SHA256 mismatch/);
    await assert.rejects(
      downloadVerified({ ...source, sha256: '' }, dir),
      /Missing pinned/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('offline HTML escapes user text and includes only local media', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  const html = reviewHtml({
    title: '<svg onload=alert(1)>',
    metrics: {
      values: { duration_s: 3, first_speech_s: null },
      creator: { score: 0 },
      events: [],
      evidence: {},
    },
    ops: [{ text: '</summary><script>alert(1)</script>' }],
  });
  assert.ok(html.includes('src="final.mp4"'));
  assert.ok(html.includes('unavailable'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('https://'));
});
