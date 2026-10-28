import { describe, expect, it } from 'vitest';
import { createMockServer } from '../../mock-server/src/server';
import { KimoClient } from './rest';
import { ProjectSync, type PendingEdit, type EditOutbox } from './realtime';
import type { SessionSnapshot } from './schema';

describe('durable edits against the mock', () => {
  it('survives a reload, flushes in order, and deduplicates a lost acknowledgement', async () => {
    const server = createMockServer({ port: 0 });
    const base = await server.start();
    let online = true;
    let dropAcknowledgement = false;
    const client = new KimoClient(base, async (url, init) => {
      if (!online) throw new TypeError('offline');
      const response = await fetch(url, init);
      if (dropAcknowledgement && String(url).endsWith('/ops')) {
        dropAcknowledgement = false;
        throw new TypeError('response lost');
      }
      return response;
    });
    const saved = new Map<string, PendingEdit[]>();
    const outbox: EditOutbox = {
      read: async (id) => structuredClone(saved.get(id) ?? []),
      write: async (id, edits) => {
        saved.set(id, structuredClone(edits));
      },
    };
    try {
      const { sessionId } = await client.createSession({
        prompt: 'test',
        aspect: '16:9',
        assetIds: [],
      });
      let snapshot: SessionSnapshot = await client.session(sessionId);
      const sync = new ProjectSync(
        client,
        sessionId,
        () => snapshot,
        (next) => {
          snapshot = next;
        },
        outbox,
      );
      online = false;
      await sync.edit([
        { op: 'marker.add', marker: { id: 'a', time: 1, label: 'first' } },
      ]);
      await sync.edit([
        { op: 'marker.add', marker: { id: 'b', time: 2, label: 'second' } },
      ]);
      expect(saved.get(sessionId)).toHaveLength(2);
      expect(snapshot.project.markers.map((m) => m.id)).toEqual(['a', 'b']);
      await expect(sync.whenIdle()).rejects.toThrow('Reconnect');
      online = true;
      snapshot = await client.session(sessionId);
      const restored = new ProjectSync(
        client,
        sessionId,
        () => snapshot,
        (next) => {
          snapshot = next;
        },
        outbox,
      );
      dropAcknowledgement = true;
      await expect(restored.restore()).rejects.toThrow('response lost');
      await restored.restore();
      expect(saved.get(sessionId)).toEqual([]);
      expect(
        (await client.session(sessionId)).project.markers.map((m) => m.id),
      ).toEqual(['a', 'b']);
      await restored.whenIdle();
    } finally {
      await server.close();
    }
  });
});
