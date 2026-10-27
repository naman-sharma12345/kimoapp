import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadManager, UPLOAD_BACKOFF } from '../lib/uploads/manager';
import {
  MULTIPART_THRESHOLD,
  UPLOAD_PART_BYTES,
  type UploadTarget,
} from '@kimo/client';
import type { MediaCache } from '../lib/uploads/types';
import type { prepareTimeline } from '../lib/uploads/probe';
import { useSessionStore } from '../stores/session';

class FakeXHR {
  static requests: FakeXHR[] = [];
  upload: {
    onprogress?: (event: {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    }) => void;
  } = {};
  status = 0;
  url = '';
  blob?: Blob;
  aborted = false;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  onloadend?: () => void;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  getResponseHeader() {
    return 'etag';
  }
  send(blob: Blob) {
    this.blob = blob;
    FakeXHR.requests.push(this);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
    this.onloadend?.();
  }
  progress(value: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: value * (this.blob?.size ?? 0),
      total: this.blob?.size ?? 0,
    });
  }
  finish(status = 200) {
    this.status = status;
    this.onload?.();
    this.onloadend?.();
  }
}
const flush = async () => {
  for (let index = 0; index < 40; index++) await Promise.resolve();
};
function sizedFile(name: string, size: number) {
  const file = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size });
  Object.defineProperty(file, 'slice', {
    value: (start: number, end: number) =>
      Object.defineProperty(new Blob([]), 'size', {
        value: Math.max(0, end - start),
      }),
  });
  return file;
}
function setup() {
  const cache = new Map<string, MediaCache>();
  const api = {
    uploads: vi.fn(
      async ({ files }: { files: { name: string; size: number }[] }) => ({
        uploads: files.map((file): UploadTarget =>
          file.size > MULTIPART_THRESHOLD
            ? {
                assetId: file.name,
                headers: {},
                parts: Array.from(
                  { length: Math.ceil(file.size / UPLOAD_PART_BYTES) },
                  (_, index) => ({
                    partNumber: index + 1,
                    putUrl: `http://mock/${file.name}/${index + 1}`,
                  }),
                ),
              }
            : {
                assetId: file.name,
                headers: {},
                putUrl: `http://mock/${file.name}`,
              },
        ),
      }),
    ),
    completeUpload: vi.fn(async (assetId: string) => ({ assetId })),
    renewUpload: vi.fn(async () => ({ uploads: [] as UploadTarget[] })),
    detachAsset: vi.fn(async () => undefined),
  };
  const manager = new UploadManager({
    api,
    probe: async () => ({ meta: {} }),
    timeline: async () => undefined,
    cache: {
      read: async (id) => cache.get(id),
      save: async (id, patch) => {
        cache.set(id, {
          ...cache.get(id),
          ...patch,
          localId: id,
        } as MediaCache);
      },
      delete: async (id) => {
        cache.delete(id);
      },
    },
  });
  return { manager, api, cache };
}
beforeEach(() => {
  FakeXHR.requests = [];
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => {
  useSessionStore.getState().reset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('upload manager', () => {
  it('persists canceled assets while offline and detaches them when back online', async () => {
    const { manager, api } = setup();
    const { localIds } = manager.add([sizedFile('a.txt', 10)]);
    const assetLocalMap = await manager.start(localIds);
    useSessionStore.getState().startSession({
      sessionId: 'session',
      prompt: 'keep it',
      assetLocalMap,
      aspect: 'auto',
      attachments: [],
    });
    manager.setOnline(false);
    manager.cancel(localIds[0] ?? '');
    await flush();
    expect(api.detachAsset).not.toHaveBeenCalled();
    expect(useSessionStore.getState().saved?.pendingRemovals).toEqual([
      'a.txt',
    ]);
    manager.setOnline(true);
    await flush();
    expect(api.detachAsset).toHaveBeenCalledWith('session', 'a.txt');
    expect(useSessionStore.getState().saved?.pendingRemovals).toEqual([]);
    manager.reset();
  });
  it('batches registration and uploads three files at a time, smallest first', async () => {
    const { manager, api } = setup();
    const { localIds } = manager.add(
      [50, 10, 40, 20, 30].map((size) => sizedFile(`${size}.txt`, size)),
    );
    const mapping = await manager.start(localIds);
    await flush();
    expect(Object.keys(mapping)).toHaveLength(5);
    expect(api.uploads).toHaveBeenCalledTimes(1);
    expect(FakeXHR.requests.map((request) => request.url)).toEqual([
      'http://mock/10.txt',
      'http://mock/20.txt',
      'http://mock/30.txt',
    ]);
    FakeXHR.requests[0]?.progress(0.5);
    expect(
      manager.store.getState().items.find((item) => item.file.name === '10.txt')
        ?.bytesSent,
    ).toBe(5);
    FakeXHR.requests[0]?.finish();
    await flush();
    expect(FakeXHR.requests[3]?.url).toBe('http://mock/40.txt');
    expect(
      manager.store
        .getState()
        .items.filter((item) => item.status === 'uploading'),
    ).toHaveLength(3);
    manager.reset();
  });
  it('splits multipart data, runs four parts and completes only after every part', async () => {
    const { manager, api } = setup();
    const size = 150 * 1024 ** 2;
    const { localIds } = manager.add([sizedFile('large.txt', size)]);
    await manager.start(localIds);
    await flush();
    expect(FakeXHR.requests).toHaveLength(4);
    expect(
      FakeXHR.requests.every(
        (request) => request.blob?.size === UPLOAD_PART_BYTES,
      ),
    ).toBe(true);
    for (let offset = 0; offset < 10; offset++) {
      FakeXHR.requests[offset]?.finish();
      await flush();
    }
    expect(FakeXHR.requests).toHaveLength(10);
    expect(FakeXHR.requests[9]?.blob?.size).toBe(6 * 1024 ** 2);
    expect(api.completeUpload).toHaveBeenCalledOnce();
    expect(manager.store.getState().items[0]?.status).toBe('done');
    expect(manager.store.getState().items[0]?.bytesSent).toBe(size);
    manager.reset();
  });
  it('retries three times at 1, 3, and 9 seconds, then supports explicit retry', async () => {
    vi.useFakeTimers();
    const { manager } = setup();
    const { localIds } = manager.add([sizedFile('a.txt', 10)]);
    await manager.start(localIds);
    await flush();
    for (let attempt = 0; attempt < 3; attempt++) {
      FakeXHR.requests[attempt]?.finish(503);
      await flush();
      expect(FakeXHR.requests).toHaveLength(attempt + 1);
      await vi.advanceTimersByTimeAsync(UPLOAD_BACKOFF[attempt] ?? 0);
      await flush();
    }
    FakeXHR.requests[3]?.finish(503);
    await flush();
    expect(manager.store.getState().items[0]?.status).toBe('error');
    await manager.retry(localIds[0] ?? '');
    await flush();
    FakeXHR.requests[4]?.finish();
    await flush();
    expect(manager.store.getState().items[0]?.status).toBe('done');
    manager.reset();
  });
  it('aborts canceled uploads, removes them from the list, and frees a slot', async () => {
    const { manager } = setup();
    const { localIds } = manager.add(
      [1, 2, 3, 4].map((size) => sizedFile(`${size}.txt`, size)),
    );
    await manager.start(localIds);
    manager.cancel(localIds[0] ?? '');
    await flush();
    expect(FakeXHR.requests[0]?.aborted).toBe(true);
    expect(manager.store.getState().items[0]?.status).toBe('canceled');
    expect(FakeXHR.requests[3]?.url).toBe('http://mock/4.txt');
    manager.reset();
  });
  it('renews expired URLs while retaining the session asset ID', async () => {
    vi.useFakeTimers();
    const { manager, api } = setup();
    api.renewUpload.mockResolvedValue({
      uploads: [
        { assetId: 'a.txt', headers: {}, putUrl: 'http://mock/renewed' },
      ],
    });
    const { localIds } = manager.add([sizedFile('a.txt', 10)]);
    await manager.start(localIds);
    FakeXHR.requests[0]?.finish(403);
    await flush();
    expect(api.renewUpload).toHaveBeenCalledWith('a.txt');
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(FakeXHR.requests[1]?.url).toBe('http://mock/renewed');
    FakeXHR.requests[1]?.finish();
    await flush();
    expect(manager.store.getState().items[0]?.assetId).toBe('a.txt');
    manager.reset();
  });
  it('pauses on offline, keeps completed multipart parts, and resumes automatically', async () => {
    const { manager } = setup();
    const { localIds } = manager.add([sizedFile('large.txt', 150 * 1024 ** 2)]);
    await manager.start(localIds);
    FakeXHR.requests[0]?.finish();
    await flush();
    manager.setOnline(false);
    await flush();
    const before = FakeXHR.requests.length;
    expect(manager.store.getState().items[0]?.status).toBe('queued');
    manager.setOnline(true);
    await flush();
    expect(FakeXHR.requests.length).toBeGreaterThan(before);
    expect(
      FakeXHR.requests
        .slice(before)
        .every((request) => !request.url.endsWith('/1')),
    ).toBe(true);
    manager.reset();
  });
  it('restores cached uploads after a reload and does not upload completed files again', async () => {
    const { manager, cache } = setup();
    const { localIds } = manager.add([sizedFile('a.txt', 10)]);
    await manager.start(localIds);
    FakeXHR.requests[0]?.finish();
    await flush();
    const { manager: restored } = setup();
    // Seed a new manager's cache through its public persistence boundary.
    const storage = {
      read: async (id: string) => cache.get(id),
      save: async () => undefined,
      delete: async () => undefined,
    };
    const reloaded = new UploadManager({
      cache: storage,
      probe: async () => ({ meta: {} }),
      timeline: async () => undefined,
    });
    await reloaded.restore(localIds);
    expect(reloaded.store.getState().items[0]?.status).toBe('done');
    expect(FakeXHR.requests).toHaveLength(1);
    restored.reset();
    manager.reset();
    reloaded.reset();
  });
  it('resumes unfinished filmstrip preparation even when the file upload already completed', async () => {
    const file = new File(['video'], 'ready.mp4', { type: 'video/mp4' });
    const timeline = vi.fn<typeof prepareTimeline>(
      async (_file, _kind, _meta, save) => {
        await save({
          filmstrip: Array.from({ length: 8 }, () => new Blob(['frame'])),
        });
      },
    );
    const manager = new UploadManager({
      timeline,
      cache: {
        read: async () => ({ localId: 'ready', file, meta: {}, done: true }),
        save: async () => undefined,
        delete: async () => undefined,
      },
    });
    await manager.restore(['ready']);
    await flush();
    expect(timeline).toHaveBeenCalledOnce();
    expect(manager.store.getState().items[0]?.meta.filmstrip).toHaveLength(8);
    manager.reset();
  });
});
