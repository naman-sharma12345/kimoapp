import type { Asset, ServerEvent } from '@kimo/client';
export type ActionStart = Extract<ServerEvent, { t: 'agent.action.start' }>;
export type AgentAction = ActionStart & {
  started: number;
  status: 'running' | 'done' | 'failed';
  durationMs?: number;
  error?: string;
  note?: string;
  pct?: number;
  groupId: string;
};
export type FeedEntry =
  | {
      type: 'user';
      id: string;
      text: string;
      at: number;
      assets: Asset[];
      pending?: boolean;
      read?: boolean;
      sentAt: number;
    }
  | {
      type: 'agent';
      id: string;
      text: string;
      at: number;
      kind: 'say' | 'ask_review' | 'ask_choice';
      choices?: string[];
      stream?: boolean;
    }
  | {
      type: 'group';
      id: string;
      actions: string[];
      at: number;
      response: boolean;
      stopped?: boolean;
    }
  | { type: 'system'; id: string; text: string; at: number }
  | {
      type: 'images';
      id: string;
      assets: Asset[];
      actionId?: string;
      at: number;
    }
  | { type: 'sam'; id: string; clipId: string; assetId: string; at: number }
  | { type: 'error'; id: string; text: string; actionId?: string; at: number };
export type FeedState = {
  entries: FeedEntry[];
  actions: Record<string, AgentAction>;
  runningId?: string;
  ackMs?: number;
  revision: number;
};
export class AgentFeed {
  private state: FeedState = { entries: [], actions: {}, revision: 0 };
  private listeners = new Set<() => void>();
  private group?: string;
  private response = false;
  private interrupted?: string;
  private sequence = 0;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private id() {
    return `feed-${++this.sequence}`;
  }
  private publish(
    entries: FeedEntry[],
    actions = this.state.actions,
    extra: Partial<FeedState> = {},
  ) {
    this.state = {
      ...this.state,
      ...extra,
      entries,
      actions,
      revision: this.state.revision + 1,
    };
    for (const listener of this.listeners) listener();
  }
  system(text: string) {
    this.group = undefined;
    this.publish([
      ...this.state.entries,
      { type: 'system', id: this.id(), text, at: Date.now() },
    ]);
  }
  error(text: string, actionId?: string) {
    this.publish([
      ...this.state.entries,
      { type: 'error', id: this.id(), text, actionId, at: Date.now() },
    ]);
  }
  user(text: string, assets: Asset[], interrupt: boolean) {
    if (interrupt) this.interrupted = this.group;
    this.group = undefined;
    this.publish([
      ...this.state.entries,
      {
        type: 'user',
        id: this.id(),
        text,
        assets,
        at: Date.now(),
        sentAt: performance.now(),
        pending: interrupt,
      },
    ]);
  }
  receive(event: ServerEvent) {
    const entries = [...this.state.entries];
    const actions = { ...this.state.actions };
    if (event.t === 'agent.action.start') {
      if (actions[event.id]) return;
      let group = this.group;
      let item = entries.find(
        (entry) => entry.type === 'group' && entry.id === group,
      );
      if (!item || item.type !== 'group') {
        group = this.id();
        item = {
          type: 'group',
          id: group,
          actions: [],
          at: Date.now(),
          response: this.response,
        };
        this.response = false;
        entries.push(item);
        this.group = group;
      }
      if (item.type === 'group')
        entries[entries.indexOf(item)] = {
          ...item,
          actions: [...item.actions, event.id],
        };
      const prior = this.state.runningId
        ? actions[this.state.runningId]
        : undefined;
      if (prior?.status === 'running')
        actions[prior.id] = {
          ...prior,
          status: 'done',
          durationMs: Math.max(0, Date.now() - prior.started),
        };
      actions[event.id] = {
        ...event,
        started: Date.now(),
        status: 'running',
        groupId: group ?? '',
      };
      this.publish(entries, actions, { runningId: event.id });
      return;
    }
    if (event.t === 'agent.action.progress' && actions[event.id]) {
      actions[event.id] = {
        ...(actions[event.id] as AgentAction),
        note: event.note,
        pct: event.pct,
      };
      this.publish(entries, actions);
      return;
    }
    if (event.t === 'agent.action.end' && actions[event.id]) {
      actions[event.id] = {
        ...(actions[event.id] as AgentAction),
        status: event.ok ? 'done' : 'failed',
        durationMs: event.durationMs,
        error: event.error,
      };
      this.publish(entries, actions, {
        runningId:
          this.state.runningId === event.id ? undefined : this.state.runningId,
      });
      if (!event.ok) this.error(event.error ?? 'this step failed', event.id);
      return;
    }
    if (event.t === 'agent.message') {
      this.group = undefined;
      const entry: FeedEntry = {
        type: 'agent',
        id: event.id,
        text: event.text,
        at: Date.now(),
        kind: event.kind,
        choices: event.choices,
        stream: event.stream,
      };
      const index = entries.findIndex(
        (item) => item.type === 'agent' && item.id === event.id,
      );
      if (index >= 0) entries[index] = entry;
      else entries.push(entry);
      this.publish(entries);
      return;
    }
    if (
      event.t === 'agent.status' &&
      event.state === 'thinking' &&
      event.label === 'reading your note'
    ) {
      let ack: number | undefined;
      const updated = entries.map((entry) => {
        if (entry.type === 'user' && entry.pending) {
          ack = performance.now() - entry.sentAt;
          return { ...entry, pending: false, read: true };
        }
        if (entry.type === 'group' && entry.id === this.interrupted)
          return { ...entry, stopped: true };
        return entry;
      });
      this.response = true;
      this.group = undefined;
      this.publish(updated, actions, { ackMs: ack ?? this.state.ackMs });
      return;
    }
    if (event.t === 'asset.added' && event.asset.source === 'web') {
      const actionId = event.actionId ?? this.state.runningId;
      const index = entries.findIndex(
        (entry) => entry.type === 'images' && entry.actionId === actionId,
      );
      const prior = entries[index];
      if (prior?.type === 'images')
        entries[index] = {
          ...prior,
          assets: [
            ...prior.assets.filter((asset) => asset.id !== event.asset.id),
            event.asset,
          ],
        };
      else
        entries.push({
          type: 'images',
          id: this.id(),
          assets: [event.asset],
          actionId,
          at: Date.now(),
        });
      this.publish(entries);
      return;
    }
    if (event.t === 'sam.mask') {
      if (
        !entries.some(
          (entry) =>
            entry.type === 'sam' && entry.assetId === event.maskAssetId,
        )
      )
        entries.push({
          type: 'sam',
          id: this.id(),
          clipId: event.clipId,
          assetId: event.maskAssetId,
          at: Date.now(),
        });
      this.publish(entries);
      return;
    }
    if (event.t === 'error') this.error(event.message);
  }
}
