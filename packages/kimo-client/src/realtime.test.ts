import { describe, expect, it, vi } from 'vitest';
import { KimoClient } from './rest';
import { ProjectSync } from './realtime';
import type { SessionSnapshot } from './schema';
import { project, clip as sampleClip } from './samples';

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

describe('per-clip editing locks', () => {
  it('queues only the edited clip while unrelated updates advance the version', async () => {
    let snapshot: SessionSnapshot = {
      status: 'editing',
      project: structuredClone(project),
      assets: [],
    };
    const sync = new ProjectSync(
      new KimoClient(),
      'session',
      () => snapshot,
      (next) => {
        snapshot = next;
      },
    );
    sync.lock(['clip']);
    await sync.receive({
      t: 'project.ops',
      version: 1,
      actionId: 'agent',
      ops: [
        { op: 'clip.update', id: 'clip', patch: { duration: 4 } },
        { op: 'track.update', id: 'video', patch: { name: 'agent picture' } },
      ],
    });
    expect(snapshot.project.clips.clip?.duration).toBe(8);
    expect(snapshot.project.tracks[0]?.name).toBe('agent picture');
    expect(snapshot.project.version).toBe(1);
    await sync.unlock();
    expect(snapshot.project.clips.clip?.duration).toBe(4);
    expect(snapshot.project.version).toBe(1);
  });
  it('immediately removes a soft-locked clip and discards its queued updates', async () => {
    let snapshot: SessionSnapshot = {
      status: 'editing',
      project: structuredClone(project),
      assets: [],
    };
    const sync = new ProjectSync(
      new KimoClient(),
      'session',
      () => snapshot,
      (next) => {
        snapshot = next;
      },
    );
    const removed = vi.fn();
    sync.onRemoved = removed;
    sync.lock(['clip']);
    await sync.receive({
      t: 'project.ops',
      version: 1,
      ops: [{ op: 'clip.update', id: 'clip', patch: { duration: 4 } }],
    });
    await sync.receive({
      t: 'project.ops',
      version: 2,
      ops: [{ op: 'clip.remove', id: 'clip' }],
    });
    expect(removed).toHaveBeenCalledWith('clip');
    expect(snapshot.project.clips.clip).toBeUndefined();
    await sync.unlock();
    expect(snapshot.project.clips.clip).toBeUndefined();
  });
});

describe('text suggestion resolution', () => {
  it('keeps user text without dropping a queued transform', async () => {
    let snapshot: SessionSnapshot = {
      status: 'editing',
      assets: [],
      project: {
        ...structuredClone(project),
        clips: {
          clip: {
            ...sampleClip,
            text: { content: 'mine', style: 'caption-clean' },
          },
        },
      },
    };
    const sync = new ProjectSync(
      new KimoClient(),
      'session',
      () => snapshot,
      (next) => {
        snapshot = next;
      },
    );
    sync.lock(['clip']);
    const clip = snapshot.project.clips.clip;
    if (!clip) throw new Error('Missing clip');
    await sync.receive({
      t: 'project.ops',
      version: 1,
      actionId: 'agent',
      ops: [
        {
          op: 'clip.update',
          id: 'clip',
          patch: {
            text: { content: 'suggestion', style: 'caption-clean' },
            transform: { ...clip.transform, x: 100 },
          },
        },
      ],
    });
    expect(snapshot.project.clips.clip?.text?.content).toBe('mine');
    await sync.unlock('clip');
    expect(snapshot.project.clips.clip?.text?.content).toBe('mine');
    expect(snapshot.project.clips.clip?.transform.x).toBe(100);
  });
});
