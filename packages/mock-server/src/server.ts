import { filterAgentOps } from './locks.ts';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import {
  applyOps,
  clientEventSchema,
  serverEventSchema,
  sessionRequestSchema,
  messageRequestSchema,
  opsRequestSchema,
  type Asset,
  type SessionSnapshot,
  type ServerEvent,
} from '@kimo/client';
import {
  editScript,
  emptyProject,
  fixtureAssets,
  type ScriptAction,
} from './fixtures.ts';
import { createUploads } from './uploads.ts';

interface Session extends SessionSnapshot {
  createdAt: number;
  started: boolean;
  sockets: Set<WebSocket>;
  clock: number;
  next: number;
  paused: boolean;
  actions: ScriptAction[];
  interrupts: { due: number; text: string }[];
  records?: Map<string, ScriptAction>;
  active?: { id: string; finish: (stopped?: boolean) => void };
  failInjected?: boolean;
}
interface RenderJob {
  sessionId: string;
  started: number;
  videoId?: string;
}
export interface MockOptions {
  port?: number;
  speed?: number;
  fail?: string;
  dataDir?: string;
}
export function createMockServer(options: MockOptions = {}) {
  const speed = options.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0)
    throw new Error('MOCK_SPEED must be positive');
  const sessions = new Map<string, Session>();
  const renders = new Map<string, RenderJob>();
  const videos = new Map<string, { sessionId: string }>();
  const dataDir = resolve(options.dataDir ?? '.mock-data');
  const uploadService = createUploads(dataDir, options.fail);
  const uploads = uploadService.entries;
  const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
  let base = '';
  const emit = (session: Session, event: ServerEvent) => {
    if (event.t === 'agent.status') session.agentState = event.state;
    const data = JSON.stringify(serverEventSchema.parse(event));
    for (const socket of session.sockets)
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
  };
  const batch = (
    session: Session,
    ops: ScriptAction['ops'],
    actionId: string,
  ) => {
    if (actionId !== 'user') ops = filterAgentOps(session.project, ops);
    if (!ops.length) return;
    session.project = applyOps(session.project, ops);
    emit(session, {
      t: 'project.ops',
      version: session.project.version,
      ops,
      actionId,
    });
  };
  const action = (session: Session, item: ScriptAction) => {
    session.active?.finish();
    const id = randomUUID();
    session.records ??= new Map();
    session.records.set(id, item);
    const first = item.ops[0];
    const clipId = first
      ? 'clipId' in first
        ? first.clipId
        : 'id' in first && first.op.startsWith('clip.')
          ? first.id
          : first.op === 'clip.add'
            ? first.clip.id
            : undefined
      : undefined;
    const target = clipId
      ? { clipId, region: { x: 0, y: 0, w: 1, h: 1 } }
      : undefined;
    emit(session, { t: 'agent.status', state: 'acting', label: item.title });
    emit(session, {
      t: 'agent.action.start',
      id,
      tool: item.tool,
      title: item.title,
      args: { operationCount: item.ops.length },
      target,
    });
    for (const event of item.events ?? []) {
      if (
        event.t === 'asset.added' &&
        !session.assets.some((asset) => asset.id === event.asset.id)
      )
        session.assets.push(event.asset);
      emit(
        session,
        event.t === 'asset.added' ? { ...event, actionId: id } : event,
      );
    }
    try {
      if (options.fail === 'action' && !session.failInjected) {
        session.failInjected = true;
        throw new Error('this step could not be completed');
      }
      batch(session, item.ops, id);
    } catch (error) {
      emit(session, {
        t: 'agent.action.end',
        id,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'The project changed during this action',
        durationMs: 140,
      });
      return;
    }
    emit(session, { t: 'agent.action.progress', id, pct: 1, note: 'ready' });
    let finished = false;
    const started = Date.now();
    const finish = (stopped = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      emit(session, {
        t: 'agent.action.end',
        id,
        ok: !stopped,
        durationMs: Math.max(0, Date.now() - started),
        ...(stopped ? { error: 'stopped' } : {}),
      });
      if (session.active?.id === id) session.active = undefined;
      if (session.paused)
        emit(session, { t: 'agent.status', state: 'idle', label: 'paused' });
    };
    const timer = setTimeout(() => finish(), 140);
    timer.unref();
    session.active = { id, finish };
  };
  const interrupt = (session: Session, text: string) => {
    // Immediate acknowledgement stays inside 400ms even while paused.
    emit(session, {
      t: 'agent.status',
      state: 'thinking',
      label: 'reading your note',
    });
    session.interrupts.push({ due: session.clock + 300, text });
  };
  const json = (response: ServerResponse, status: number, body?: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const fail = (
    response: ServerResponse,
    status: number,
    code: string,
    message: string,
  ) => json(response, status, { code, message });
  const body = async (request: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const raw of request) {
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
      size += chunk.length;
      if (size > 2 ** 20) throw new Error('Request body exceeds 1 MiB');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  };
  const media = async (
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    mime: string,
  ) => {
    const info = await stat(path);
    const range = request.headers.range;
    response.setHeader('Accept-Ranges', 'bytes');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        response.end();
        return;
      }
      const start = Number(match[1]);
      const end = match[2]
        ? Math.min(Number(match[2]), info.size - 1)
        : info.size - 1;
      if (start > end || start >= info.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        response.end();
        return;
      }
      response.writeHead(206, {
        'Content-Type': mime,
        'Content-Range': `bytes ${start}-${end}/${info.size}`,
        'Content-Length': end - start + 1,
      });
      await pipeline(createReadStream(path, { start, end }), response);
    } else {
      response.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': info.size,
      });
      await pipeline(createReadStream(path), response);
    }
  };
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, OPTIONS',
    );
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    response.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Content-Length, ETag',
    );
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    void route(request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        fail(
          response,
          400,
          'invalid_request',
          'The request does not match the contract',
        );
      else if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        fail(response, 404, 'not_found', 'Media not found; run pnpm install');
      else
        fail(
          response,
          400,
          'invalid_operation',
          error instanceof Error ? error.message : 'Invalid request',
        );
    });
  });
  async function route(request: IncomingMessage, response: ServerResponse) {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const method = request.method;
    if (path === '/health') {
      json(response, 200, { ok: true });
      return;
    }
    if (path.startsWith('/fixtures/') && method === 'GET') {
      const name = path.slice('/fixtures/'.length);
      if (
        ![
          'study-1.mp4',
          'study-2.mp4',
          'study-3.mp4',
          'quiet-study.wav',
          'still.png',
          'mask.png',
          'delivery.mp4',
        ].includes(name)
      ) {
        fail(response, 404, 'not_found', 'Unknown fixture');
        return;
      }
      await media(
        request,
        response,
        resolve(fixtures, name),
        name.endsWith('.mp4')
          ? 'video/mp4'
          : name.endsWith('.wav')
            ? 'audio/wav'
            : 'image/png',
      );
      return;
    }
    if (
      await uploadService.handle(request, response, path, base, () =>
        body(request),
      )
    )
      return;
    if (path.startsWith('/assets/') && method === 'GET') {
      const assetId = path.slice('/assets/'.length);
      const upload = uploads.get(assetId);
      if (!upload?.ready) {
        fail(response, 404, 'not_found', 'Unknown asset');
        return;
      }
      await media(request, response, resolve(dataDir, assetId), upload.mime);
      return;
    }
    if (path === '/v1/sessions' && method === 'POST') {
      const input = sessionRequestSchema.parse(await body(request));
      if (input.assetIds.some((id) => !uploads.has(id))) {
        fail(
          response,
          400,
          'upload_incomplete',
          'Register each asset before starting',
        );
        return;
      }
      const id = randomUUID();
      const assets = input.assetIds.map((assetId): Asset => {
        const upload = uploads.get(assetId);
        if (!upload) throw new Error('Unknown upload');
        return {
          id: assetId,
          name: upload.name,
          kind: upload.mime.startsWith('video/')
            ? 'video'
            : upload.mime.startsWith('image/')
              ? 'image'
              : upload.mime.startsWith('audio/')
                ? 'audio'
                : 'doc',
          url: `${base}/assets/${assetId}`,
          source: 'user',
        };
      });
      sessions.set(id, {
        createdAt: Date.now(),
        status: 'warming',
        project: emptyProject(id, input.aspect),
        assets,
        sockets: new Set(),
        clock: 0,
        started: false,
        next: 0,
        paused: false,
        actions: editScript(fixtureAssets(base)),
        interrupts: [],
      });
      json(response, 200, {
        sessionId: id,
        wsUrl: `${base.replace('http', 'ws')}/v1/sessions/${id}/ws`,
      });
      return;
    }
    const attach = /^\/v1\/sessions\/([^/]+)\/assets\/add$/.exec(path);
    if (attach && method === 'POST') {
      const session = sessions.get(attach[1] ?? '');
      if (!session) {
        fail(response, 404, 'not_found', 'Unknown session');
        return;
      }
      const input = z
        .object({ assetIds: z.array(z.string().min(1)).min(1) })
        .strict()
        .parse(await body(request));
      if (input.assetIds.some((id) => !uploads.get(id)?.ready)) {
        fail(
          response,
          400,
          'upload_incomplete',
          'Finish uploading before attaching',
        );
        return;
      }
      const added = input.assetIds.map((id): Asset => {
        const upload = uploads.get(id);
        if (!upload) throw new Error('Unknown upload');
        return {
          id,
          name: upload.name,
          kind: upload.mime.startsWith('video/')
            ? 'video'
            : upload.mime.startsWith('image/')
              ? 'image'
              : upload.mime.startsWith('audio/')
                ? 'audio'
                : 'doc',
          url: `${base}/assets/${id}`,
          source: 'user',
        };
      });
      for (const asset of added) {
        if (!session.assets.some((item) => item.id === asset.id))
          session.assets.push(asset);
        emit(session, { t: 'asset.added', asset });
      }
      json(response, 200, { assets: added });
      return;
    }
    const detach = /^\/v1\/sessions\/([^/]+)\/assets\/remove$/.exec(path);
    if (detach && method === 'POST') {
      const session = sessions.get(detach[1] ?? '');
      if (!session) {
        fail(response, 404, 'not_found', 'Unknown session');
        return;
      }
      const input = z
        .object({ assetId: z.string().min(1) })
        .strict()
        .parse(await body(request));
      session.assets = session.assets.filter(
        (asset) => asset.id !== input.assetId,
      );
      json(response, 202);
      return;
    }
    const match =
      /^\/v1\/sessions\/([^/]+)(?:\/(messages|ops|approve|cancel))?$/.exec(
        path,
      );
    if (match) {
      const id = match[1] ?? '';
      const session = sessions.get(id);
      const operation = match[2];
      if (!session || Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
        fail(response, 404, 'not_found', 'Unknown session');
        return;
      }
      if (!operation && method === 'GET') {
        json(response, 200, {
          status: session.status,
          project: session.project,
          assets: session.assets,
          renderId: session.renderId,
          videoId: session.videoId,
          wsUrl: `${base.replace('http', 'ws')}/v1/sessions/${id}/ws`,
          actionCount: session.next,
          paused: session.paused,
          agentState: session.agentState,
          createdAt: session.createdAt,
        });
        return;
      }
      if (operation === 'cancel' && method === 'POST') {
        session.paused = true;
        session.status = 'failed';
        for (const socket of session.sockets)
          socket.close(1000, 'edit stopped');
        json(response, 202);
        return;
      }
      if (operation === 'messages' && method === 'POST') {
        const input = messageRequestSchema.parse(await body(request));
        if (
          input.attachments?.some((assetId) => !uploads.get(assetId)?.ready)
        ) {
          fail(response, 400, 'upload_incomplete', 'Unknown attachment');
          return;
        }
        interrupt(session, input.text);
        json(response, 202);
        return;
      }
      if (operation === 'ops' && method === 'POST') {
        const input = opsRequestSchema.parse(await body(request));
        if (input.baseVersion !== session.project.version) {
          fail(
            response,
            409,
            'version_conflict',
            'Refetch the session and re-apply your edits',
          );
          return;
        }
        batch(session, input.ops, 'user');
        json(response, 200, { version: session.project.version });
        return;
      }
      if (operation === 'approve' && method === 'POST') {
        if (session.status !== 'awaiting_review') {
          fail(
            response,
            409,
            'not_ready',
            'Wait until the edit is ready for review',
          );
          return;
        }
        const renderId = randomUUID();
        renders.set(renderId, { sessionId: id, started: Date.now() });
        session.status = 'rendering';
        session.renderId = renderId;
        json(response, 200, { renderId });
        return;
      }
    }
    const renderMatch = /^\/v1\/renders\/([^/]+)$/.exec(path);
    if (renderMatch && method === 'GET') {
      const job = renders.get(renderMatch[1] ?? '');
      if (!job) {
        fail(response, 404, 'not_found', 'Unknown render');
        return;
      }
      const progress = Math.min(
        1,
        ((Date.now() - job.started) * speed) / 25000,
      );
      const session = sessions.get(job.sessionId);
      if (options.fail === 'render') {
        if (session) session.status = 'failed';
        json(response, 200, {
          status: 'failed',
          progress: 0,
          frame: 0,
          totalFrames: 720,
          etaSec: 0,
        });
        return;
      }
      if (progress === 1 && !job.videoId) {
        job.videoId = randomUUID();
        videos.set(job.videoId, { sessionId: job.sessionId });
        if (session) {
          session.status = 'done';
          session.videoId = job.videoId;
        }
      }
      json(response, 200, {
        status: progress === 1 ? 'done' : 'rendering',
        progress,
        frame: Math.floor(progress * 720),
        totalFrames: 720,
        etaSec: Math.max(
          0,
          (25000 - (Date.now() - job.started) * speed) / 1000,
        ),
        videoId: job.videoId,
      });
      return;
    }
    const videoMatch = /^\/v1\/videos\/([^/]+)$/.exec(path);
    if (videoMatch && method === 'GET') {
      const video = videos.get(videoMatch[1] ?? '');
      if (!video) {
        fail(response, 404, 'not_found', 'Unknown video');
        return;
      }
      const info = await stat(resolve(fixtures, 'delivery.mp4'));
      json(response, 200, {
        url: `${base}/fixtures/delivery.mp4`,
        posterUrl: `${base}/fixtures/still.png`,
        durationSec: 24,
        width: 1920,
        height: 1080,
        sizeBytes: info.size,
        title: 'a quieter kind of motion',
      });
      return;
    }
    fail(response, 404, 'not_found', 'Unknown endpoint');
  }
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const match = /^\/v1\/sessions\/([^/]+)\/ws$/.exec(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    );
    const session = sessions.get(match?.[1] ?? '');
    if (!session) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      session.sockets.add(ws);
      session.started = true;
      ws.send(JSON.stringify({ t: 'hello', version: session.project.version }));
      if (session.clock > 0 && session.status === 'warming') {
        const index = Math.min(3, Math.floor(session.clock / 1200));
        const step = (['upload', 'probe', 'watch', 'plan'] as const)[index];
        ws.send(
          JSON.stringify({ t: 'warmup.step', step, pct: (index + 1) / 5 }),
        );
      }
      if (options.fail === 'ws') {
        ws.send(
          JSON.stringify({
            t: 'error',
            code: 'ws_failed',
            message: 'Simulated WebSocket failure',
          }),
        );
        ws.close(1011, 'simulated failure');
        return;
      }
      ws.on('close', () => session.sockets.delete(ws));
      ws.on('message', (data) => {
        try {
          const event = clientEventSchema.parse(JSON.parse(data.toString()));
          if (event.t === 'interrupt') interrupt(session, event.text);
          if (event.t === 'pause') {
            session.paused = true;
            session.active?.finish(true);
            emit(session, {
              t: 'agent.status',
              state: 'idle',
              label: 'paused',
            });
          }
          if (event.t === 'resume') {
            session.paused = false;
            emit(session, {
              t: 'agent.status',
              state: 'thinking',
              label: 'continuing',
            });
          }
          if (event.t === 'retry') {
            const item = session.records?.get(event.actionId);
            if (item) action(session, item);
            else
              emit(session, {
                t: 'error',
                code: 'unknown_action',
                message: 'this step is no longer available',
              });
          }
          if (event.t === 'ping')
            ws.send(
              JSON.stringify({ t: 'hello', version: session.project.version }),
            );
        } catch {
          ws.send(
            JSON.stringify({
              t: 'error',
              code: 'invalid_event',
              message: 'Invalid client event',
            }),
          );
        }
      });
    });
  });
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const delta = (now - last) * speed;
    last = now;
    for (const session of sessions.values()) {
      if (
        !session.started ||
        session.paused ||
        session.status === 'done' ||
        session.status === 'failed' ||
        session.status === 'rendering'
      )
        continue;
      const before = session.clock;
      const pending = session.assets.filter(
        (asset) => uploads.has(asset.id) && !uploads.get(asset.id)?.ready,
      );
      if (pending.length) {
        emit(session, {
          t: 'warmup.step',
          step: 'upload',
          pct:
            (session.assets.length - pending.length) /
            Math.max(1, session.assets.length),
        });
        continue;
      }
      session.clock += delta;
      for (const [index, step] of (
        ['upload', 'probe', 'watch', 'plan', 'ready'] as const
      ).entries()) {
        const threshold = (index + 1) * 1200;
        if (before < threshold && session.clock >= threshold) {
          emit(session, { t: 'warmup.step', step, pct: (index + 1) / 5 });
          if (step === 'watch')
            emit(session, {
              t: 'agent.status',
              state: 'thinking',
              label: 'reading every frameâ€¦',
            });
          if (step === 'plan')
            emit(session, {
              t: 'agent.status',
              state: 'thinking',
              label: 'looking for the best momentsâ€¦',
            });
        }
      }
      if (session.clock >= 6000 && session.status === 'warming')
        session.status = 'editing';
      while (
        session.next < session.actions.length &&
        session.clock >= 6000 + session.next * (70000 / session.actions.length)
      ) {
        const item = session.actions[session.next++];
        if (item) action(session, item);
      }
      for (const pending of session.interrupts.filter(
        (item) => item.due <= session.clock,
      )) {
        const clips = Object.values(session.project.clips).filter(
          (clip) => clip.kind === 'video',
        );
        const slower = /slower|slow|longer/i.test(pending.text);
        const music = /music|quiet|loud/i.test(pending.text);
        let cursor = 0;
        for (let index = 0; index < 3; index++) {
          const item = clips[index];
          const ops: ScriptAction['ops'] = item
            ? [
                {
                  op: 'clip.update',
                  id: item.id,
                  patch: slower
                    ? {
                        speed: item.speed * 0.8,
                        duration: item.duration * 1.25,
                        start: cursor,
                      }
                    : {
                        transform: {
                          ...item.transform,
                          scale: item.transform.scale + 0.04,
                        },
                      },
                },
              ]
            : [
                {
                  op: 'marker.add',
                  marker: {
                    id: `note-${randomUUID()}`,
                    time: index,
                    label: pending.text,
                  },
                },
              ];
          if (item) cursor += slower ? item.duration * 1.25 : item.duration;
          action(session, {
            tool: slower ? 'slow_clip' : 'refine_edit',
            title: slower ? 'give the shot more time' : 'respond to your note',
            ops,
          });
        }
        if (music && session.project.clips.music)
          action(session, {
            tool: 'adjust_music',
            title: 'adjust the music level',
            ops: [
              {
                op: 'clip.update',
                id: 'music',
                patch: { volume: /loud/i.test(pending.text) ? 0.6 : 0.15 },
              },
            ],
          });
        if (session.status === 'awaiting_review')
          emit(session, {
            t: 'agent.message',
            id: randomUUID(),
            role: 'agent',
            text: 'your changes are ready. play it through.',
            kind: 'ask_review',
          });
      }
      session.interrupts = session.interrupts.filter(
        (item) => item.due > session.clock,
      );
      if (session.clock >= 76000 && session.status === 'editing') {
        session.status = 'awaiting_review';
        emit(session, {
          t: 'agent.status',
          state: 'waiting_user',
          label: 'ready for your review',
        });
        emit(session, {
          t: 'agent.message',
          id: randomUUID(),
          role: 'agent',
          text: 'the edit is ready. play it through and tell me what you think.',
          kind: 'ask_review',
        });
      }
    }
  }, 25);
  return {
    server,
    async start() {
      await new Promise<void>((resolveStart, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 8787, '127.0.0.1', () => {
          server.off('error', reject);
          resolveStart();
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('No server address');
      base = `http://127.0.0.1:${address.port}`;
      return base;
    },
    async close() {
      clearInterval(timer);
      for (const socket of wss.clients) socket.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
    },
  };
}
