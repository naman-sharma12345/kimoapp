import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KimoClient,
  MULTIPART_THRESHOLD,
  UPLOAD_PART_BYTES,
  serverEventSchema,
  type ServerEvent,
} from '@kimo/client';
import { createMockServer } from './server';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup(fail?: string, speed = 200) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kimo-mock-test-'));
  cleanups.push(() => rm(dataDir, { recursive: true, force: true }));
  const server = createMockServer({ port: 0, speed, fail, dataDir });
  const base = await server.start();
  cleanups.push(() => server.close());
  return { client: new KimoClient(base), base };
}
function stream(url: string) {
  const socket = new WebSocket(url);
  const events: ServerEvent[] = [];
  socket.on('message', (data) => {
    events.push(serverEventSchema.parse(JSON.parse(data.toString())));
  });
  const wait = async (
    predicate: (events: ServerEvent[]) => boolean,
    timeout = 5000,
  ) => {
    const deadline = Date.now() + timeout;
    while (!predicate(events)) {
      if (Date.now() > deadline)
        throw new Error(
          `Event timeout; last: ${JSON.stringify(events.at(-1))}`,
        );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  return { socket, events, wait };
}
describe('mock backend end-to-end contract', () => {
  it('assembles multipart uploads, validates completion and serves byte ranges', async () => {
    const { client, base } = await setup();
    const size = MULTIPART_THRESHOLD + 1;
    const prepared = await client.uploads({
      files: [{ name: 'large.bin', size, mime: 'application/octet-stream' }],
    });
    const target = prepared.uploads[0];
    if (!target || !('parts' in target)) throw new Error('Expected multipart');
    expect(target.parts).toHaveLength(7);
    const session = await client.createSession({
      prompt: 'make a film',
      assetIds: [target.assetId],
      aspect: 'auto',
    });
    expect((await client.session(session.sessionId)).status).toBe('warming');
    await expect(
      client.completeUpload(target.assetId, {
        parts: [{ partNumber: 1, etag: 'missing' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const parts: { partNumber: number; etag: string }[] = [];
    for (const part of target.parts) {
      const bytes = Buffer.alloc(
        Math.min(
          UPLOAD_PART_BYTES,
          size - (part.partNumber - 1) * UPLOAD_PART_BYTES,
        ),
        part.partNumber,
      );
      const response = await fetch(part.putUrl, {
        method: 'PUT',
        headers: target.headers,
        body: bytes,
      });
      expect(response.status).toBe(200);
      parts.push({
        partNumber: part.partNumber,
        etag: response.headers.get('ETag') ?? '',
      });
    }
    await client.completeUpload(target.assetId, { parts });
    const response = await fetch(`${base}/assets/${target.assetId}`, {
      headers: { Range: `bytes=${size - 1}-${size - 1}` },
    });
    expect(response.status).toBe(206);
    expect(new Uint8Array(await response.arrayBuffer())[0]).toBe(7);
    expect((await client.renewUpload(target.assetId)).uploads[0]?.assetId).toBe(
      target.assetId,
    );
  });
  it('accepts registered uploads before their bytes arrive', async () => {
    const { client, base } = await setup();
    const { uploads } = await client.uploads({
      files: [{ name: 'pending.txt', size: 4, mime: 'text/plain' }],
    });
    const upload = uploads[0];
    if (!upload || !('putUrl' in upload)) throw new Error('No single upload');
    const session = await client.createSession({
      prompt: 'make a film',
      assetIds: [upload.assetId],
      aspect: 'auto',
    });
    expect(
      (await client.session(session.sessionId)).assets.some(
        (asset) => asset.id === upload.assetId,
      ),
    ).toBe(true);
    expect((await fetch(`${base}/assets/${upload.assetId}`)).status).toBe(404);
    expect(
      (
        await fetch(upload.putUrl, {
          method: 'PUT',
          headers: upload.headers,
          body: 'note',
        })
      ).status,
    ).toBe(200);
    expect(await (await fetch(`${base}/assets/${upload.assetId}`)).text()).toBe(
      'note',
    );
  });
  it('handles uploads, every edit event, conflicts, approval, render, video and range requests', async () => {
    const { client, base } = await setup();
    const prepared = await client.uploads({
      files: [{ name: 'note.txt', size: 4, mime: 'text/plain' }],
    });
    const upload = prepared.uploads[0];
    if (!upload || !('putUrl' in upload)) throw new Error('No single upload');
    expect(
      (
        await fetch(upload.putUrl, {
          method: 'PUT',
          headers: upload.headers,
          body: 'note',
        })
      ).status,
    ).toBe(200);
    const created = await client.createSession({
      prompt: 'make a quiet film',
      assetIds: [upload.assetId],
      aspect: '9:16',
    });
    const ws = stream(created.wsUrl);
    await ws.wait((events) =>
      events.some(
        (event) => event.t === 'agent.message' && event.kind === 'ask_review',
      ),
    );
    expect(
      ws.events.filter((event) => event.t === 'agent.action.start'),
    ).toHaveLength(45);
    expect(ws.events.filter((event) => event.t === 'warmup.step')).toHaveLength(
      5,
    );
    expect(ws.events.some((event) => event.t === 'sam.mask')).toBe(true);
    const snapshot = await client.session(created.sessionId);
    expect(snapshot.status).toBe('awaiting_review');
    expect(snapshot.project.version).toBe(45);
    expect(snapshot.project.width).toBe(1080);
    expect(snapshot.project.height).toBe(1920);
    expect(
      snapshot.assets.some((asset) => asset.attribution?.license === 'CC0-1.0'),
    ).toBe(true);
    expect(snapshot.assets.some((asset) => asset.id === upload.assetId)).toBe(
      true,
    );
    expect(await (await fetch(`${base}/assets/${upload.assetId}`)).text()).toBe(
      'note',
    );
    const ops = [
      {
        op: 'marker.add' as const,
        marker: { id: 'user', time: 1, label: 'user note' },
      },
    ];
    await expect(
      client.ops(created.sessionId, { baseVersion: 0, ops }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await client.ops(created.sessionId, { baseVersion: 45, ops })).version,
    ).toBe(46);
    const approved = await client.approve(created.sessionId);
    const initial = await client.render(approved.renderId);
    expect(initial.progress).toBeLessThan(1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const rendered = await client.render(approved.renderId);
    expect(rendered.status).toBe('done');
    if (!rendered.videoId) throw new Error('Missing video ID');
    const video = await client.video(rendered.videoId);
    expect(video.sizeBytes).toBeGreaterThan(0);
    const media = await fetch(video.url, { headers: { Range: 'bytes=0-15' } });
    expect(media.status).toBe(206);
    expect((await media.arrayBuffer()).byteLength).toBe(16);
    expect(
      (await fetch(video.url, { headers: { Range: 'bytes=999999999-' } }))
        .status,
    ).toBe(416);
    expect((await client.session(created.sessionId)).status).toBe('done');
    ws.socket.close();
  });
  it('acknowledges interrupts in 400ms, changes pacing, supports messages, pause and resume', async () => {
    const { client } = await setup();
    const session = await client.createSession({
      prompt: 'edit',
      assetIds: [],
      aspect: 'auto',
    });
    const ws = stream(session.wsUrl);
    await ws.wait((events) =>
      events.some((event) => event.t === 'agent.message'),
    );
    const before = await client.session(session.sessionId);
    const start = Date.now();
    ws.socket.send(JSON.stringify({ t: 'interrupt', text: 'make it slower' }));
    await ws.wait((events) =>
      events.some(
        (event) =>
          event.t === 'agent.status' && event.label === 'reading your note',
      ),
    );
    expect(Date.now() - start).toBeLessThan(400);
    await ws.wait(
      (events) =>
        events.filter((event) => event.t === 'agent.action.start').length >= 48,
    );
    expect(
      (await client.session(session.sessionId)).project.clips['clip-2']
        ?.duration,
    ).toBeGreaterThan(before.project.clips['clip-2']?.duration ?? 0);
    await client.message(session.sessionId, { text: 'quieter music' });
    await ws.wait((events) =>
      events.some(
        (event) =>
          event.t === 'agent.action.start' && event.tool === 'adjust_music',
      ),
    );
    expect(
      (await client.session(session.sessionId)).project.clips.music?.volume,
    ).toBe(0.15);
    ws.socket.send(JSON.stringify({ t: 'ping' }));
    ws.socket.send(JSON.stringify({ t: 'pause' }));
    ws.socket.send(JSON.stringify({ t: 'resume' }));
    await ws.wait(
      (events) => events.filter((event) => event.t === 'hello').length >= 2,
    );
    ws.socket.close();
  });
  it('rejects malformed requests, unknown resources, unfinished uploads and early approvals', async () => {
    const { client, base } = await setup(undefined, 1);
    expect(
      (await fetch(`${base}/v1/sessions`, { method: 'POST', body: '{}' }))
        .status,
    ).toBe(400);
    expect(
      (await fetch(`${base}/health`, { method: 'OPTIONS' })).headers.get(
        'Access-Control-Allow-Methods',
      ),
    ).toContain('PUT');
    await expect(client.session('missing')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      client.createSession({
        prompt: 'edit',
        assetIds: ['missing'],
        aspect: 'auto',
      }),
    ).rejects.toMatchObject({ status: 400 });
    const session = await client.createSession({
      prompt: 'edit',
      assetIds: [],
      aspect: '1:1',
    });
    await expect(client.approve(session.sessionId)).rejects.toMatchObject({
      status: 409,
    });
    expect((await client.session(session.sessionId)).project.width).toBe(1080);
    expect((await fetch(`${base}/fixtures/not-a-fixture.mp4`)).status).toBe(
      404,
    );
  });
  it('pauses the script and survives a user removing a clip during an edit', async () => {
    const { client } = await setup(undefined, 20);
    const session = await client.createSession({
      prompt: 'edit',
      assetIds: [],
      aspect: 'auto',
    });
    const ws = stream(session.wsUrl);
    await ws.wait((events) =>
      events.some(
        (event) =>
          event.t === 'agent.action.start' && event.tool === 'import_clip',
      ),
    );
    ws.socket.send(JSON.stringify({ t: 'pause' }));
    ws.socket.send(JSON.stringify({ t: 'ping' }));
    await ws.wait(
      (events) => events.filter((event) => event.t === 'hello').length === 2,
    );
    const before = await client.session(session.sessionId);
    await client.ops(session.sessionId, {
      baseVersion: before.project.version,
      ops: [{ op: 'clip.remove', id: 'clip-1' }],
    });
    const paused = await client.session(session.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await client.session(session.sessionId)).project.version).toBe(
      paused.project.version,
    );
    ws.socket.send(JSON.stringify({ t: 'resume' }));
    await ws.wait((events) =>
      events.some(
        (event) => event.t === 'agent.message' && event.kind === 'ask_review',
      ),
    );
    expect(
      ws.events.some((event) => event.t === 'agent.action.end' && !event.ok),
    ).toBe(true);
    expect((await client.session(session.sessionId)).status).toBe(
      'awaiting_review',
    );
    ws.socket.close();
  });
  it('retries a failed action and hard stop cancels active work without advancing the project', async () => {
    const { client } = await setup('action', 20);
    const session = await client.createSession({
      prompt: 'edit',
      assetIds: [],
      aspect: 'auto',
    });
    const ws = stream(session.wsUrl);
    await ws.wait((events) =>
      events.some((event) => event.t === 'agent.action.end' && !event.ok),
    );
    const failed = ws.events.find(
      (event) => event.t === 'agent.action.end' && !event.ok,
    );
    if (failed?.t !== 'agent.action.end')
      throw new Error('Missing failed action');
    ws.socket.send(JSON.stringify({ t: 'pause' }));
    await ws.wait((events) =>
      events.some(
        (event) => event.t === 'agent.status' && event.label === 'paused',
      ),
    );
    ws.socket.send(JSON.stringify({ t: 'retry', actionId: failed.id }));
    await ws.wait(
      (events) =>
        events.filter((event) => event.t === 'agent.action.start').length === 2,
    );
    const retried = ws.events
      .filter((event) => event.t === 'agent.action.start')
      .at(-1);
    if (retried?.t !== 'agent.action.start') throw new Error('Missing retry');
    await ws.wait((events) =>
      events.some(
        (event) =>
          event.t === 'agent.action.end' && event.id === retried.id && event.ok,
      ),
    );
    expect(
      (await client.session(session.sessionId)).project.tracks.length,
    ).toBeGreaterThan(0);
    ws.socket.send(JSON.stringify({ t: 'resume' }));
    await ws.wait(
      (events) =>
        events.filter((event) => event.t === 'agent.action.start').length >= 3,
    );
    const active = ws.events
      .filter((event) => event.t === 'agent.action.start')
      .at(-1);
    ws.socket.send(JSON.stringify({ t: 'pause' }));
    await ws.wait((events) =>
      events.some(
        (event) =>
          event.t === 'agent.action.end' &&
          event.id === active?.id &&
          event.error === 'stopped',
      ),
    );
    const stopped = await client.session(session.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await client.session(session.sessionId)).project.version).toBe(
      stopped.project.version,
    );
    expect(stopped.paused).toBe(true);
    ws.socket.close();
  });
  it('captures a render snapshot, serves preview JPEGs and cancels without losing the edit', async () => {
    const { client, base } = await setup(undefined, 20);
    const created = await client.createSession({
      prompt: 'edit',
      assetIds: [],
      aspect: '16:9',
    });
    const ws = stream(created.wsUrl);
    await ws.wait((events) =>
      events.some(
        (event) =>
          event.t === 'agent.action.start' && event.tool === 'import_clip',
      ),
    );
    ws.socket.send(JSON.stringify({ t: 'pause' }));
    await ws.wait((events) =>
      events.some(
        (event) => event.t === 'agent.status' && event.label === 'paused',
      ),
    );
    const before = await client.session(created.sessionId);
    const approved = await client.approve(created.sessionId, {
      title: 'Manali Trip!',
      burnInCaptions: false,
    });
    const initial = await client.render(approved.renderId);
    expect(initial.sessionId).toBe(created.sessionId);
    expect(initial.totalFrames).toBe(Math.ceil(before.project.duration * 30));
    const frame = await fetch(client.renderFrameUrl(approved.renderId, 0));
    expect(frame.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await frame.arrayBuffer()).slice(0, 2)).toEqual(
      new Uint8Array([255, 216]),
    );
    expect(
      (await fetch(`${base}/v1/renders/${approved.renderId}/frame.jpg?n=-1`))
        .status,
    ).toBe(400);
    await client.cancelRender(approved.renderId);
    expect((await client.render(approved.renderId)).status).toBe('cancelled');
    const restored = await client.session(created.sessionId);
    expect(restored.project).toEqual(before.project);
    expect(restored.status).toBe('awaiting_review');
    expect(restored.renderId).toBeUndefined();
    ws.socket.close();
  });
  it('retries a failed render, delivers portrait metadata/history and reopens the saved edit', async () => {
    const { client } = await setup('render');
    const created = await client.createSession({
      prompt: 'edit',
      assetIds: [],
      aspect: '9:16',
    });
    const ws = stream(created.wsUrl);
    await ws.wait((events) =>
      events.some(
        (event) => event.t === 'agent.message' && event.kind === 'ask_review',
      ),
    );
    const first = await client.approve(created.sessionId, {
      title: 'Manali Trip!',
      burnInCaptions: true,
    });
    expect(await client.render(first.renderId)).toMatchObject({
      status: 'failed',
      error: 'the encoder stopped before finishing',
    });
    const second = await client.approve(created.sessionId, {
      title: 'Manali Trip!',
      burnInCaptions: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await client.render(second.renderId);
    if (!result.videoId) throw new Error('Missing delivered video');
    const video = await client.video(result.videoId);
    expect(video).toMatchObject({
      width: 1080,
      height: 1920,
      title: 'Manali Trip!',
      sessionId: created.sessionId,
      fps: 30,
    });
    expect(
      video.actionGroups?.reduce((sum, group) => sum + group.stepCount, 0),
    ).toBe(45);
    expect(video.models).toContain('sam 3.1');
    const download = await fetch(video.url, {
      headers: { Range: 'bytes=0-15' },
    });
    expect(download.status).toBe(206);
    expect(download.headers.get('content-disposition')).toContain(
      'manali-trip-kimo-1080p.mp4',
    );
    await client.reopenSession(created.sessionId);
    expect((await client.session(created.sessionId)).status).toBe(
      'awaiting_review',
    );
    expect((await fetch(video.posterUrl)).status).toBe(200);
    expect((await client.video(result.videoId)).title).toBe('Manali Trip!');
    ws.socket.close();
  });
  it.each(['upload', 'ws', 'render'])(
    'simulates MOCK_FAIL=%s',
    async (failure) => {
      const { client } = await setup(failure);
      if (failure === 'upload') {
        const uploads = await client.uploads({
          files: [{ name: 'a', mime: 'text/plain', size: 1 }],
        });
        const upload = uploads.uploads[0];
        if (!upload || !('putUrl' in upload))
          throw new Error('No single upload');
        expect(
          (await fetch(upload.putUrl, { method: 'PUT', body: 'a' })).status,
        ).toBe(503);
        return;
      }
      const session = await client.createSession({
        prompt: 'edit',
        assetIds: [],
        aspect: 'auto',
      });
      const ws = stream(session.wsUrl);
      if (failure === 'ws') {
        await ws.wait((events) =>
          events.some(
            (event) => event.t === 'error' && event.code === 'ws_failed',
          ),
        );
        return;
      }
      await ws.wait((events) =>
        events.some((event) => event.t === 'agent.message'),
      );
      const approved = await client.approve(session.sessionId);
      expect((await client.render(approved.renderId)).status).toBe('failed');
      expect((await client.session(session.sessionId)).status).toBe('failed');
      ws.socket.close();
    },
  );
});

describe('adding session assets after warmup', () => {
  it('attaches a completed upload to a running session', async () => {
    const { client } = await setup();
    const session = await client.createSession({
      prompt: 'edit',
      assetIds: [],
      aspect: 'auto',
    });
    const registered = await client.uploads({
      files: [{ name: 'extra.txt', size: 4, mime: 'text/plain' }],
    });
    const upload = registered.uploads[0];
    if (!upload || !('putUrl' in upload)) throw new Error('Missing upload');
    await expect(
      client.attachAssets(session.sessionId, [upload.assetId]),
    ).rejects.toMatchObject({ status: 400 });
    const response = await fetch(upload.putUrl, {
      method: 'PUT',
      headers: upload.headers,
      body: 'note',
    });
    expect(response.ok).toBe(true);
    const result = await client.attachAssets(session.sessionId, [
      upload.assetId,
    ]);
    expect(result.assets[0]?.name).toBe('extra.txt');
    expect(
      (await client.session(session.sessionId)).assets.some(
        (asset) => asset.id === upload.assetId,
      ),
    ).toBe(true);
  });
});
