import { clientEventSchema, type ServerEvent } from '@kimo/client';
import type { Env } from './env.ts';
import { HttpError } from './http.ts';
import { createEditing } from './editing.ts';

/**
 * One SessionRoom Durable Object per editing session (SQLite-backed, which
 * Workers Free allows). It only fans realtime events out to the open tabs
 * of the session's owner; the timeline itself lives in D1. The Worker
 * authenticates every socket (cookie + Origin) before forwarding it here,
 * and Durable Objects are not reachable from the internet directly.
 */
interface SocketLike {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface RoomState {
  acceptWebSocket(socket: SocketLike, tags?: string[]): void;
  getWebSockets(tag?: string): SocketLike[];
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
  };
}
declare const WebSocketPair: {
  new (): { 0: SocketLike; 1: SocketLike };
};

const MAX_SOCKETS = 8;
const MAX_MESSAGE = 8_000;

export class SessionRoom {
  constructor(
    private readonly state: RoomState,
    private readonly env: Env,
  ) {}

  private async version() {
    return (await this.state.storage.get<number>('version')) ?? 0;
  }

  private async setVersion(version: number) {
    if (Number.isInteger(version) && version > (await this.version()))
      await this.state.storage.put('version', version);
  }

  private send(socket: SocketLike, event: ServerEvent) {
    try {
      socket.send(JSON.stringify(event));
    } catch {
      // Closed sockets are dropped by the runtime.
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = (await request.json()) as {
        version?: number;
        events?: ServerEvent[];
      };
      if (typeof body.version === 'number') await this.setVersion(body.version);
      for (const socket of this.state.getWebSockets())
        for (const event of body.events ?? []) this.send(socket, event);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/connect') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return new Response('expected websocket', { status: 426 });
      const userId = request.headers.get('X-Kimo-User') ?? '';
      const sessionId = request.headers.get('X-Kimo-Session') ?? '';
      if (!userId || !sessionId)
        return new Response('forbidden', { status: 403 });
      if (this.state.getWebSockets().length >= MAX_SOCKETS)
        return new Response('too many connections', { status: 429 });
      await this.setVersion(Number(request.headers.get('X-Kimo-Version')));
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server, [userId]);
      server.serializeAttachment({ userId, sessionId });
      this.send(server, { t: 'hello', version: await this.version() });
      return new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit & { webSocket: SocketLike });
    }
    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(socket: SocketLike, raw: string | ArrayBuffer) {
    const attachment = socket.deserializeAttachment() as {
      userId: string;
      sessionId: string;
    } | null;
    if (!attachment) return socket.close(1008, 'unknown');
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE)
      return this.send(socket, {
        t: 'error',
        code: 'invalid_event',
        message: 'Message is not valid',
      });
    let event;
    try {
      event = clientEventSchema.parse(JSON.parse(raw));
    } catch {
      return this.send(socket, {
        t: 'error',
        code: 'invalid_event',
        message: 'Message is not valid',
      });
    }
    if (event.t === 'ping')
      return this.send(socket, { t: 'hello', version: await this.version() });
    if (event.t === 'pause')
      return this.send(socket, {
        t: 'agent.status',
        state: 'idle',
        label: 'paused',
      });
    if (event.t === 'resume')
      return this.send(socket, {
        t: 'agent.status',
        state: 'idle',
        label: 'continuing',
      });
    if (event.t === 'retry')
      return this.send(socket, {
        t: 'agent.status',
        state: 'idle',
        label: 'ready',
      });
    // interrupt: the note goes through the same validated AI edit path.
    const editing = createEditing({
      now: () => new Date(),
      fetcher: (input, init) => fetch(input, init),
      // Already inside this session's room: send to the sockets directly.
      broadcast: async (_env, _session, version, events) => {
        await this.setVersion(version);
        for (const open of this.state.getWebSockets())
          for (const item of events) this.send(open, item);
      },
    });
    try {
      await editing.aiEdit(
        this.env,
        attachment.userId,
        attachment.sessionId,
        event.text,
      );
    } catch (error) {
      this.send(socket, {
        t: 'error',
        code: error instanceof HttpError ? error.code : 'internal',
        message:
          error instanceof HttpError ? error.message : 'Something went wrong',
      });
    }
  }

  webSocketClose(socket: SocketLike, code: number) {
    try {
      socket.close(code === 1005 ? 1000 : code, 'closing');
    } catch {
      // Already closed.
    }
  }
}
