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
  private locks = new Set<string>();
  private deferred: Op[] = [];
  onSuggestion?: (clipId: string, content: string) => void;
  onRemoved?: (clipId: string) => void;
  onAgentBatch?: (
    project: SessionSnapshot['project'],
    ops: Op[],
    actionId?: string,
  ) => void;
  lock(ids: string[]) {
    for (const id of ids) this.locks.add(id);
  }
  unlock(discardTextFor?: string) {
    this.locks.clear();
    const work = this.queue.then(() => {
      const current = this.get();
      const pending = this.deferred.splice(0).flatMap((op) => {
        if (op.op === 'text.update' && op.clipId === discardTextFor) return [];
        if (
          op.op === 'clip.update' &&
          op.id === discardTextFor &&
          op.patch.text
        ) {
          const { text, ...patch } = op.patch;
          void text;
          return Object.keys(patch).length ? [{ ...op, patch }] : [];
        }
        return [op];
      });
      if (pending.length)
        this.replace({
          ...current,
          project: applyOps(current.project, pending, current.project.version),
        });
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
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
  private protectFresh(
    fresh: SessionSnapshot,
    current: SessionSnapshot,
  ): SessionSnapshot {
    const clips = { ...fresh.project.clips };
    for (const id of this.locks) {
      const latest = clips[id];
      const local = current.project.clips[id];
      if (!latest) {
        this.locks.delete(id);
        this.deferred = this.deferred.filter(
          (op) => ('clipId' in op ? op.clipId : 'id' in op ? op.id : '') !== id,
        );
        this.onRemoved?.(id);
      } else if (local) {
        const { id: clipId, ...patch } = latest;
        this.deferred.push({ op: 'clip.update', id: clipId, patch });
        clips[id] = local;
      }
    }
    return {
      ...fresh,
      project: applyOps({ ...fresh.project, clips }, [], fresh.project.version),
    };
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
        this.replace(
          this.protectFresh(await this.client.session(this.sessionId), current),
        );
        return;
      }
      if (event.actionId !== 'user')
        this.onAgentBatch?.(current.project, event.ops, event.actionId);
      const immediate = event.ops.filter((op) => {
        const id =
          'clipId' in op
            ? op.clipId
            : 'id' in op && op.op.startsWith('clip.')
              ? op.id
              : undefined;
        if (!id || !this.locks.has(id) || event.actionId === 'user')
          return true;
        if (op.op === 'clip.remove') {
          this.locks.delete(id);
          this.deferred = this.deferred.filter(
            (item) =>
              ('clipId' in item ? item.clipId : 'id' in item ? item.id : '') !==
              id,
          );
          this.onRemoved?.(id);
          return true;
        }
        this.deferred.push(op);
        if (op.op === 'text.update') this.onSuggestion?.(id, op.content);
        if (op.op === 'clip.update' && op.patch.text)
          this.onSuggestion?.(id, op.patch.text.content);
        return false;
      });
      this.replace({
        ...current,
        project: applyOps(current.project, immediate, event.version),
      });
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  whenIdle() {
    return this.queue;
  }
  edit(
    ops: Op[],
    onBefore?: (project: SessionSnapshot['project']) => void,
  ): Promise<void> {
    const work = this.queue.then(async () => {
      const before = this.get();
      const optimistic = applyOps(before.project, ops);
      onBefore?.(before.project);
      this.replace({ ...before, project: optimistic });
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
          onBefore?.(fresh.project);
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
