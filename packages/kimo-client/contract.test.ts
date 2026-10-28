import { afterAll, beforeAll, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockServer } from '../mock-server/src/server';
import { KimoClient, serverEventSchema, type ServerEvent } from './src/index';

let client: KimoClient;
let local: ReturnType<typeof createMockServer> | undefined;
let directory: string | undefined;
beforeAll(async () => {
  let base = process.env.KIMO_CONTRACT_API;
  if (!base) {
    directory = await mkdtemp(join(tmpdir(), 'kimo-contract-'));
    local = createMockServer({ port: 0, speed: 200, dataDir: directory });
    base = await local.start();
  }
  client = new KimoClient(base);
});
afterAll(async () => {
  await local?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('parses the complete edit and delivery lifecycle against the selected URL', async () => {
  expect((await client.auth()).remaining).toBeGreaterThanOrEqual(0);
  const uploaded = await client.uploads({
    files: [{ name: 'contract.txt', mime: 'text/plain', size: 4 }],
  });
  const target = uploaded.uploads[0];
  if (!target || !('putUrl' in target))
    throw new Error('Expected a single upload');
  const renewed = (await client.renewUpload(target.assetId)).uploads[0];
  if (!renewed || !('putUrl' in renewed))
    throw new Error('Expected a renewed upload');
  expect(
    (
      await fetch(renewed.putUrl, {
        method: 'PUT',
        body: 'test',
        headers: renewed.headers,
      })
    ).ok,
  ).toBe(true);
  const created = await client.createSession({
    prompt: 'make a calm travel reel',
    aspect: '16:9',
    assetIds: [target.assetId],
  });
  const configuredWs = process.env.KIMO_CONTRACT_WS;
  const url = configuredWs ? new URL(configuredWs) : new URL(created.wsUrl);
  if (configuredWs) url.searchParams.set('sessionId', created.sessionId);
  const socket = new WebSocket(url);
  const events: ServerEvent[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Contract stream did not reach review')),
        60000,
      );
      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('message', (raw) => {
        try {
          const event = serverEventSchema.parse(JSON.parse(raw.toString()));
          events.push(event);
          if (event.t === 'agent.message' && event.kind === 'ask_review') {
            clearTimeout(timer);
            resolve();
          }
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
    for (const type of [
      'hello',
      'warmup.step',
      'project.ops',
      'agent.status',
      'agent.action.start',
      'agent.action.end',
      'agent.message',
    ])
      expect(
        events.some((e) => e.t === type),
        type,
      ).toBe(true);
    const snapshot = await client.session(created.sessionId);
    const edit = {
      ops: [
        {
          op: 'marker.add' as const,
          marker: { id: 'contract-marker', time: 1, label: 'contract' },
        },
      ],
      baseVersion: snapshot.project.version,
      mutationId: 'contract-idempotency',
    };
    const result = await client.ops(created.sessionId, edit);
    expect(await client.ops(created.sessionId, edit)).toEqual(result);
    await client.attachAssets(created.sessionId, [target.assetId]);
    await client.detachAsset(created.sessionId, target.assetId);
    const approved = await client.approve(created.sessionId, {
      resolution: '720p',
      format: 'webm',
      alsoVertical: true,
    });
    const deadline = Date.now() + 60000;
    let rendered = await client.render(approved.renderId);
    while (rendered.status !== 'done' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      rendered = await client.render(approved.renderId);
    }
    expect(rendered.status).toBe('done');
    if (!rendered.videoId) throw new Error('Missing delivered video');
    const video = await client.video(rendered.videoId);
    expect(video.width).toBe(1280);
    expect(video.format).toBe('webm');
    expect(
      (await fetch(video.url, { headers: { Range: 'bytes=0-31' } })).status,
    ).toBe(206);
    expect((await fetch(client.renderFrameUrl(approved.renderId, 1))).ok).toBe(
      true,
    );
    if (video.captionsSrtUrl)
      expect((await fetch(video.captionsSrtUrl)).ok).toBe(true);
    if (video.alternateVideoId)
      expect((await client.video(video.alternateVideoId)).height).toBe(1280);
    await client.reopenSession(created.sessionId);
    const cancel = await client.approve(created.sessionId);
    await client.cancelRender(cancel.renderId);
    expect((await client.render(cancel.renderId)).status).toBe('cancelled');
    await client.message(created.sessionId, { text: 'make it slower' });
    await client.cancelSession(created.sessionId);
  } finally {
    socket.close();
  }
}, 180000);
