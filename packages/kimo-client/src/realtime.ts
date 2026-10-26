import {
  clientEventSchema,
  serverEventSchema,
  type ClientEvent,
  type Op,
  type SessionSnapshot,
  type ServerEvent,
} from './schema.ts';
import { applyOps } from './ops.ts';
import { KimoApiError, type KimoClient } from './rest.ts';

/** Native browser WebSocket. Consumers own reconnection/backoff and dispose explicitly. */
export function connectRealtime(
  url: string,
  onEvent: (event: ServerEvent) => void,
  onError: (error: Error) => void,
) {
  const socket = new WebSocket(url);
  socket.addEventListener('message', (message: MessageEvent<unknown>) => {
    try {
      if (typeof message.data !== 'string')
        throw new Error('Expected a JSON text message');
      onEvent(serverEventSchema.parse(JSON.parse(message.data)));
    } catch (error) {
      onError(
        error instanceof Error ? error : new Error('Invalid WebSocket event'),
      );
    }
  });
  socket.addEventListener('error', () =>
    onError(new Error('WebSocket connection failed')),
  );
  return {
    socket,
    send(event: ClientEvent) {
      socket.send(JSON.stringify(clientEventSchema.parse(event)));
    },
    dispose() {
      socket.close(1000, 'client disposed');
    },
  };
}

/** Serializes incoming batches, refetching snapshots on gaps. */
export class ProjectSync {
  private queue: Promise<void> = Promise.resolve();
  private readonly client: KimoClient;
  private readonly sessionId: string;
  private readonly get: () => SessionSnapshot;
  private readonly replace: (snapshot: SessionSnapshot) => void;
  constructor(
    client: KimoClient,
    sessionId: string,
    get: () => SessionSnapshot,
    replace: (snapshot: SessionSnapshot) => void,
  ) {
    this.client = client;
    this.sessionId = sessionId;
    this.get = get;
    this.replace = replace;
  }
  receive(
    event: Extract<ServerEvent, { t: 'project.ops' | 'hello' }>,
  ): Promise<void> {
    const work = this.queue.then(async () => {
      const current = this.get();
      if (event.version <= current.project.version) return;
      if (
        event.t === 'hello' ||
        event.version !== current.project.version + 1
      ) {
        this.replace(await this.client.session(this.sessionId));
        return;
      }
      this.replace({
        ...current,
        project: applyOps(current.project, event.ops, event.version),
      });
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  edit(ops: Op[]): Promise<void> {
    const work = this.queue.then(async () => {
      const before = this.get();
      this.replace({ ...before, project: applyOps(before.project, ops) });
      try {
        await this.client.ops(this.sessionId, {
          ops,
          baseVersion: before.project.version,
        });
      } catch (error) {
        if (error instanceof KimoApiError && error.status === 409) {
          const fresh = await this.client.session(this.sessionId);
          this.replace(fresh);
          const optimistic = applyOps(fresh.project, ops);
          this.replace({ ...fresh, project: optimistic });
          try {
            await this.client.ops(this.sessionId, {
              ops,
              baseVersion: fresh.project.version,
            });
          } catch (retryError) {
            this.replace(await this.client.session(this.sessionId));
            throw retryError;
          }
        } else {
          this.replace(await this.client.session(this.sessionId));
          throw error;
        }
      }
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}
