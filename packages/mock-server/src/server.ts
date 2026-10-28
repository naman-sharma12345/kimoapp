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
  approveRequestSchema,
  type KimoProject,
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
  mutations?: Map<string, number>;
  active?: { id: string; finish: (stopped?: boolean) => void };
  failInjected?: boolean;
  renderFailed?: boolean;
  history?: { summary: string; stepCount: number }[];
  historyOpen?: boolean;
}
interface RenderJob {
  sessionId: string;
  started: number;
  videoId?: string;
  project: KimoProject;
  title: string;
  burnInCaptions: boolean;
  resolution?: '1080p' | '720p';
  format?: 'mp4' | 'webm';
  alternate?: RenderJob;
  history: { summary: string; stepCount: number }[];
  cancelled?: boolean;
  failed?: boolean;
}
export interface MockOptions {
  port?: number;
  speed?: number;
  fail?: string;
  dataDir?: string;
}
export function createMockServer(options: MockOptions = {}) {
  const speed = options.speed ?? 1;
  const appOrigins = (process.env.MOCK_APP_ORIGINS ?? '')
    .split(',')
    .filter(Boolean);
  const allowedApp = (origin: string) =>
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    appOrigins.includes(origin);
  if (!Number.isFinite(speed) || speed <= 0)
    throw new Error('MOCK_SPEED must be positive');
  const sessions = new Map<string, Session>();
  const visitors = new Map<
    string,
    { day: string; count: number; signedIn: boolean }
  >();
  const renders = new Map<string, RenderJob>();
  const videos = new Map<string, RenderJob>();
  const dataDir = resolve(options.dataDir ?? '.mock-data');
  const uploadService = createUploads(dataDir, options.fail);
  const uploads = uploadService.entries;
  const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
  let base = '';
  const emit = (session: Session, event: ServerEvent) => {
    if (event.t === 'agent.status') session.agentState = event.state;
    if (event.t === 'agent.message') session.historyOpen = false;
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
    session.history ??= [];
    const group = session.history.at(-1);
    if (session.historyOpen && group) {
      group.summary = item.title;
      group.stepCount++;
    } else session.history.push({ summary: item.title, stepCount: 1 });
    session.historyOpen = true;
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
    if (session.status === 'awaiting_review') session.paused = false;
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
    const origin = request.headers.origin;
    if (origin && allowedApp(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
    } else response.setHeader('Access-Control-Allow-Origin', '*');
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
    const cookie = /(?:^|; )kimo_mock=([a-zA-Z0-9-]+)/.exec(
      request.headers.cookie ?? '',
    )?.[1];
    const visitorId = cookie ?? randomUUID();
    const day = new Date().toISOString().slice(0, 10);
    let visitor = visitors.get(visitorId);
    if (!visitor || visitor.day !== day) {
      visitor = { day, count: 0, signedIn: visitor?.signedIn ?? false };
      visitors.set(visitorId, visitor);
    }
    if (!cookie)
      response.setHeader(
        'Set-Cookie',
        `kimo_mock=${visitorId}; HttpOnly; ${process.env.MOCK_COOKIE_SECURE === '1' ? 'Secure; SameSite=None' : 'SameSite=Lax'}; Path=/; Max-Age=86400`,
      );
    if (path === '/v1/auth/session' && method === 'GET') {
      json(response, 200, {
        signedIn: visitor.signedIn,
        remaining: visitor.signedIn ? 999 : Math.max(0, 1 - visitor.count),
        mock: true,
      });
      return;
    }
    if (path === '/v1/auth/google' && method === 'GET') {
      const target =
        new URL(request.url ?? '/', base).searchParams.get('returnTo') ??
        'http://localhost:3000/';
      if (!allowedApp(new URL(target).origin)) {
        fail(response, 400, 'invalid_return', 'invalid return address');
        return;
      }
      // Demo only: no Google credentials or identity claims are involved.
      visitor.signedIn = true;
      response.writeHead(302, { Location: target });
      response.end();
      return;
    }
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
          'sprite.jpg',
          'sprite-vertical.jpg',
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
      if (!visitor.signedIn && visitor.count >= 1) {
        fail(response, 429, 'anonymous_limit', 'sign in to keep making videos');
        return;
      }
      if (input.assetIds.some((id) => !uploads.has(id))) {
        fail(
          response,
          400,
          'upload_incomplete',
          'Register each asset before starting',
        );
        return;
      }
      if (
        input.assetIds.length > 30 ||
        input.assetIds.reduce(
          (sum, id) => sum + (uploads.get(id)?.size ?? 0),
          0,
        ) >
          5 * 1024 ** 3
      ) {
        fail(response, 413, 'upload_too_large', 'upload limits exceeded');
        return;
      }
      visitor.count++;
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
      const combined = new Set([
        ...session.assets.map((a) => a.id).filter((id) => uploads.has(id)),
        ...input.assetIds,
      ]);
      if (
        combined.size > 30 ||
        [...combined].reduce(
          (sum, id) => sum + (uploads.get(id)?.size ?? 0),
          0,
        ) >
          5 * 1024 ** 3
      ) {
        fail(response, 413, 'upload_too_large', 'upload limits exceeded');
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
      /^\/v1\/sessions\/([^/]+)(?:\/(messages|ops|approve|cancel|reopen))?$/.exec(
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
      if (operation === 'reopen' && method === 'POST') {
        session.status = 'awaiting_review';
        session.paused = true;
        session.renderId = undefined;
        session.videoId = undefined;
        session.agentState = 'waiting_user';
        json(response, 202);
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
        const previousMutation = input.mutationId
          ? session.mutations?.get(input.mutationId)
          : undefined;
        if (previousMutation !== undefined) {
          json(response, 200, { version: previousMutation });
          return;
        }
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
        if (input.mutationId) {
          session.mutations ??= new Map();
          session.mutations.set(input.mutationId, session.project.version);
        }
        json(response, 200, { version: session.project.version });
        return;
      }
      if (operation === 'approve' && method === 'POST') {
        if (
          session.status !== 'awaiting_review' &&
          !(
            session.project.duration > 0 &&
            ['editing', 'failed', 'done'].includes(session.status)
          )
        ) {
          fail(
            response,
            409,
            'not_ready',
            'Wait until the edit is ready for review',
          );
          return;
        }
        const input = approveRequestSchema.parse(await body(request));
        session.paused = true;
        session.active?.finish(true);
        const previous = Array.from(renders.values()).findLast(
          (job) => job.sessionId === id,
        );
        const renderId = randomUUID();
        const failed = options.fail === 'render' && !session.renderFailed;
        if (failed) session.renderFailed = true;
        renders.set(renderId, {
          sessionId: id,
          started: Date.now(),
          project: structuredClone(session.project),
          title: input.title ?? previous?.title ?? 'a quieter kind of motion',
          burnInCaptions:
            input.burnInCaptions ??
            previous?.burnInCaptions ??
            Object.values(session.project.clips).some(
              (clip) =>
                Boolean(clip.text?.words?.length) ||
                Boolean(clip.text?.style.startsWith('caption')),
            ),
          resolution: input.resolution ?? previous?.resolution ?? '1080p',
          format: input.format ?? previous?.format ?? 'mp4',
          history: structuredClone(session.history ?? []),
          failed,
        });
        const job = renders.get(renderId);
        if (!job) throw new Error('render not created');
        if (input.alsoVertical && job.project.width >= job.project.height) {
          const reframed = applyOps(job.project, [
            { op: 'project.update', patch: { width: 1080, height: 1920 } },
          ]);
          emit(session, {
            t: 'agent.message',
            id: randomUUID(),
            role: 'agent',
            kind: 'say',
            text: 'preparing a 9:16 version · demo reframe',
          });
          job.alternate = {
            ...job,
            project: reframed,
            title: `${job.title} · 9:16`,
          };
        }
        session.status = 'rendering';
        session.renderId = renderId;
        json(response, 200, { renderId });
        return;
      }
    }
    const renderResource = /^\/v1\/renders\/([^/]+)\/(frame.jpg|cancel)$/.exec(
      path,
    );
    if (renderResource) {
      const job = renders.get(renderResource[1] ?? '');
      if (!job) {
        fail(response, 404, 'not_found', 'Unknown render');
        return;
      }
      if (renderResource[2] === 'cancel' && method === 'POST') {
        job.cancelled = true;
        const session = sessions.get(job.sessionId);
        if (session && session.renderId === renderResource[1]) {
          session.status = 'awaiting_review';
          session.paused = true;
          session.agentState = 'waiting_user';
          session.renderId = undefined;
        }
        json(response, 202);
        return;
      }
      if (renderResource[2] === 'frame.jpg' && method === 'GET') {
        const n = Number(
          new URL(request.url ?? '/', base).searchParams.get('n') ?? 0,
        );
        if (
          !Number.isInteger(n) ||
          n < 0 ||
          n > Math.ceil(job.project.duration * 30)
        ) {
          fail(response, 400, 'invalid_frame', 'Invalid frame');
          return;
        }
        const index = Math.min(
          8,
          Math.floor((n / Math.max(1, job.project.duration * 30)) * 8) + 1,
        );
        response.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        await media(
          request,
          response,
          resolve(
            fixtures,
            `render-${job.project.width < job.project.height ? 'vertical-' : ''}${String(index).padStart(2, '0')}.jpg`,
          ),
          'image/jpeg',
        );
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
      const totalFrames = Math.max(1, Math.ceil(job.project.duration * 30));
      if (job.failed || job.cancelled) {
        if (session && !job.cancelled) session.status = 'failed';
        json(response, 200, {
          status: job.cancelled ? 'cancelled' : 'failed',
          error: job.failed
            ? 'the encoder stopped before finishing'
            : undefined,
          sessionId: job.sessionId,
          title: job.title,
          burnInCaptions: job.burnInCaptions,
          width: job.project.width,
          height: job.project.height,
          progress: 0,
          frame: 0,
          totalFrames,
          etaSec: 0,
        });
        return;
      }
      if (progress === 1 && !job.videoId) {
        job.videoId = randomUUID();
        videos.set(job.videoId, job);
        if (job.alternate) {
          job.alternate.videoId = randomUUID();
          videos.set(job.alternate.videoId, job.alternate);
        }
        if (session) {
          session.status = 'done';
          session.videoId = job.videoId;
        }
      }
      json(response, 200, {
        status: progress === 1 ? 'done' : 'rendering',
        progress,
        frame: Math.floor(progress * totalFrames),
        totalFrames,
        sessionId: job.sessionId,
        title: job.title,
        burnInCaptions: job.burnInCaptions,
        width: job.project.width,
        height: job.project.height,
        etaSec: Math.max(
          0,
          (25000 / speed - (Date.now() - job.started)) / 1000,
        ),
        videoId: job.videoId,
      });
      return;
    }
    const subtitles = /^\/v1\/videos\/([^/]+)\/captions.srt$/.exec(path);
    if (subtitles && method === 'GET') {
      const video = videos.get(subtitles[1] ?? '');
      if (!video) {
        fail(response, 404, 'not_found', 'unknown video');
        return;
      }
      const stamp = (t: number) =>
        new Date(Math.max(0, t) * 1000)
          .toISOString()
          .slice(11, 23)
          .replace('.', ',');
      const text = Object.values(video.project.clips)
        .filter(
          (c) =>
            c.text &&
            (c.text.style.startsWith('caption') || c.text.words?.length),
        )
        .sort((a, b) => a.start - b.start)
        .map(
          (c, i) =>
            `${i + 1}\n${stamp(c.start)} --> ${stamp(c.start + c.duration)}\n${(c.text?.content ?? '').replace(/\r?\n/g, ' ')}\n`,
        )
        .join('\n');
      response.writeHead(200, {
        'Content-Type': 'application/x-subrip; charset=utf-8',
        'Content-Disposition': 'attachment; filename="captions.srt"',
      });
      response.end(text);
      return;
    }
    const videoFile = /^\/v1\/videos\/([^/]+)\/file$/.exec(path);
    if (videoFile && method === 'GET') {
      const job = videos.get(videoFile[1] ?? '');
      if (!job) {
        fail(response, 404, 'not_found', 'Unknown video');
        return;
      }
      const slug =
        job.title
          .normalize('NFKD')
          .toLowerCase()
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'video';
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${slug}-kimo-${job.resolution ?? '1080p'}.${job.format ?? 'mp4'}"`,
      );
      await media(
        request,
        response,
        resolve(fixtures, exportFixture(job)),
        job.format === 'webm' ? 'video/webm' : 'video/mp4',
      );
      return;
    }
    const videoMatch = /^\/v1\/videos\/([^/]+)$/.exec(path);
    if (videoMatch && method === 'GET') {
      const video = videos.get(videoMatch[1] ?? '');
      if (!video) {
        fail(response, 404, 'not_found', 'Unknown video');
        return;
      }
      const vertical = video.project.width < video.project.height;
      const info = await stat(resolve(fixtures, exportFixture(video)));
      const session = sessions.get(video.sessionId);
      json(response, 200, {
        url: `${base}/v1/videos/${videoMatch[1]}/file`,
        posterUrl: `${base}/v1/renders/${Array.from(renders).find(([, job]) => job === video)?.[0] ?? ''}/frame.jpg?n=0`,
        durationSec: 24,
        width:
          video.resolution === '720p'
            ? vertical
              ? 720
              : 1280
            : vertical
              ? 1080
              : 1920,
        height:
          video.resolution === '720p'
            ? vertical
              ? 1280
              : 720
            : vertical
              ? 1920
              : 1080,
        format: video.format ?? 'mp4',
        resolution: video.resolution ?? '1080p',
        alternateVideoId: video.alternate?.videoId,
        captionsSrtUrl: Object.values(video.project.clips).some(
          (c) => c.text?.style.startsWith('caption') || c.text?.words?.length,
        )
          ? `${base}/v1/videos/${videoMatch[1]}/captions.srt`
          : undefined,
        sizeBytes: info.size,
        title: video.title,
        sessionId: video.sessionId,
        sessionExpiresAt: (session?.createdAt ?? 0) + 86400000,
        madeInSec: Math.max(
          0,
          (video.started - (session?.createdAt ?? video.started)) / 1000,
        ),
        fps: 30,
        sprite: {
          url: `${base}/fixtures/${vertical ? 'sprite-vertical.jpg' : 'sprite.jpg'}`,
          tileWidth: 160,
          tileHeight: 90,
          columns: 4,
          intervalSec: 3,
        },
        actionGroups: video.history,
        models: ['muse spark 1.3', 'sam 3.1', 'muse voice transcribe'],
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

function exportFixture(job: RenderJob) {
  const vertical = job.project.width < job.project.height;
  if (
    (job.resolution ?? '1080p') === '1080p' &&
    (job.format ?? 'mp4') === 'mp4'
  )
    return vertical ? 'delivery-vertical.mp4' : 'delivery-final.mp4';
  return `delivery-${vertical ? 'vertical' : 'horizontal'}-${job.resolution ?? '1080p'}.${job.format ?? 'mp4'}`;
}
