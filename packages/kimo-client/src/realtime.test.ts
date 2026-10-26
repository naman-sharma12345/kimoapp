import { describe, expect, it, vi } from 'vitest';
import { KimoClient } from './rest';
import { ProjectSync } from './realtime';
import type { SessionSnapshot } from './schema';
import { project } from './samples';

describe('project version synchronization', () => {
  it('applies consecutive batches, ignores duplicates and refetches on gaps', async () => {
    let snapshot: SessionSnapshot = {
      status: 'editing',
      project: structuredClone(project),
      assets: [],
    };
    const client = new KimoClient();
    const refetch = vi
      .spyOn(client, 'session')
      .mockResolvedValue({ ...snapshot, project: { ...project, version: 8 } });
    const sync = new ProjectSync(
      client,
      'session',
      () => snapshot,
      (next) => {
        snapshot = next;
      },
    );
    await sync.receive({
      t: 'project.ops',
      version: 1,
      ops: [{ op: 'marker.add', marker: { id: 'one', time: 0, label: 'one' } }],
    });
    expect(snapshot.project.version).toBe(1);
    await sync.receive({ t: 'project.ops', version: 1, ops: [] });
    expect(snapshot.project.markers).toHaveLength(1);
    await sync.receive({ t: 'project.ops', version: 8, ops: [] });
    expect(refetch).toHaveBeenCalledOnce();
    expect(snapshot.project.version).toBe(8);
  });
  it('optimistically edits and rebases once on HTTP 409', async () => {
    let snapshot: SessionSnapshot = {
      status: 'editing',
      project: structuredClone(project),
      assets: [],
    };
    const requests: { baseVersion: number }[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      if (init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as {
          baseVersion: number;
        };
        requests.push(payload);
        expect(snapshot.project.markers).toHaveLength(1);
        return requests.length === 1
          ? Response.json(
              { code: 'version_conflict', message: 'refetch' },
              { status: 409 },
            )
          : Response.json({ version: 5 });
      }
      return Response.json({
        ...snapshot,
        project: { ...project, version: 4 },
      });
    };
    const sync = new ProjectSync(
      new KimoClient('http://localhost:8787', fetcher),
      'session',
      () => snapshot,
      (next) => {
        snapshot = next;
      },
    );
    await sync.edit([
      { op: 'marker.add', marker: { id: 'note', time: 0, label: 'note' } },
    ]);
    expect(requests.map((request) => request.baseVersion)).toEqual([0, 4]);
    expect(snapshot.project.version).toBe(5);
  });
  it('restores the server snapshot when an edit fails', async () => {
    let snapshot: SessionSnapshot = {
      status: 'editing',
      project: structuredClone(project),
      assets: [],
    };
    const client = new KimoClient();
    vi.spyOn(client, 'ops').mockRejectedValue(new Error('offline'));
    vi.spyOn(client, 'session').mockResolvedValue(structuredClone(snapshot));
    const sync = new ProjectSync(
      client,
      'session',
      () => snapshot,
      (next) => {
        snapshot = next;
      },
    );
    await expect(
      sync.edit([
        { op: 'marker.add', marker: { id: 'note', time: 0, label: 'note' } },
      ]),
    ).rejects.toThrow('offline');
    expect(snapshot.project.version).toBe(0);
    expect(snapshot.project.markers).toHaveLength(0);
  });
});
