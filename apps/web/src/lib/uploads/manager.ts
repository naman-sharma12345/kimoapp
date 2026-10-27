'use client';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import {
  KimoClient,
  KimoApiError,
  putUploadPart,
  uploadParts,
  type UploadTarget,
} from '@kimo/client';
import { fileKind, uploadMime, validateFiles } from '../landing-files';
import { useSessionStore } from '../../stores/session';
import { readMedia, saveMedia, deleteMedia } from './cache';
import { probeMedia, prepareTimeline } from './probe';
import type { MediaCache, MediaMeta, UploadItem } from './types';

export const UPLOAD_CONCURRENCY = 3;
export const PART_CONCURRENCY = 4;
export const UPLOAD_BACKOFF = [1000, 3000, 9000] as const;
interface UploadState {
  items: UploadItem[];
  online: boolean;
  restoring: boolean;
  cacheError: boolean;
}
type Dependencies = {
  api: Pick<
    KimoClient,
    'uploads' | 'renewUpload' | 'completeUpload' | 'detachAsset'
  >;
  upload: typeof putUploadPart;
  probe: typeof probeMedia;
  timeline: typeof prepareTimeline;
  cache: {
    read: typeof readMedia;
    save: typeof saveMedia;
    delete: typeof deleteMedia;
  };
  wait: (ms: number, signal: AbortSignal) => Promise<void>;
};
const wait: Dependencies['wait'] = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Canceled', 'AbortError'));
      return;
    }
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Canceled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
export class UploadManager {
  readonly store = createStore<UploadState>(() => ({
    items: [],
    online: true,
    restoring: false,
    cacheError: false,
  }));
  private readonly deps: Dependencies;
  private targets = new Map<string, UploadTarget>();
  private probes = new Map<string, Promise<void>>();
  private active = new Map<string, AbortController>();
  private completed = new Map<string, Map<number, string>>();
  private prepared = new Set<string>();
  private registration: Promise<void> | undefined;
  private removals = new Map<string, { sessionId: string; assetId: string }>();
  private removing = new Set<string>();
  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      api: new KimoClient(),
      upload: putUploadPart,
      probe: probeMedia,
      timeline: prepareTimeline,
      cache: { read: readMedia, save: saveMedia, delete: deleteMedia },
      wait,
      ...deps,
    };
  }
  private item(localId: string) {
    return this.store.getState().items.find((item) => item.localId === localId);
  }
  private update(localId: string, patch: Partial<UploadItem>) {
    this.store.setState((state) => ({
      items: state.items.map((item) =>
        item.localId === localId ? { ...item, ...patch } : item,
      ),
    }));
  }
  private save(localId: string, patch: Partial<MediaCache>) {
    return this.deps.cache.save(localId, patch).catch(() => {
      this.store.setState({ cacheError: true });
    });
  }
  add(files: File[]) {
    const current = this.store
      .getState()
      .items.filter((item) => item.status !== 'canceled');
    const { accepted, rejected } = validateFiles(
      current.map((item) => item.file),
      files,
    );
    const items = accepted.map((file): UploadItem => ({
      localId: crypto.randomUUID(),
      file,
      kind: fileKind(file) ?? 'doc',
      status: 'probing',
      progress: 0,
      bytesSent: 0,
      meta: {},
    }));
    this.store.setState({ items: [...current, ...items] });
    for (const item of items) {
      const probing = (async () => {
        await this.save(item.localId, { file: item.file, meta: {} });
        const result = await this.deps
          .probe(item.file, item.kind)
          .catch(() => ({ meta: { previewAfterUpload: true } }));
        if (this.item(item.localId)?.status === 'canceled') return;
        const thumbnail = 'thumbnail' in result ? result.thumbnail : undefined;
        const meta = {
          ...result.meta,
          thumbBlobUrl: thumbnail ? URL.createObjectURL(thumbnail) : undefined,
        };
        this.update(item.localId, { meta, status: 'queued' });
        await this.save(item.localId, { meta: result.meta, thumbnail });
      })();
      this.probes.set(item.localId, probing);
    }
    return { localIds: items.map((item) => item.localId), rejected };
  }
  async start(localIds: string[]) {
    await Promise.all(localIds.map((id) => this.probes.get(id)));
    // Serialize batches so rapid retries never register duplicate asset IDs.
    if (this.registration) await this.registration;
    const missing = localIds
      .map((id) => this.item(id))
      .filter((item): item is UploadItem =>
        Boolean(item && item.status !== 'canceled' && !item.assetId),
      );
    if (missing.length) {
      this.registration = (async () => {
        while (true) {
          if (!this.store.getState().online) await this.whenOnline();
          try {
            const response = await this.deps.api.uploads({
              files: missing.map(({ file }) => ({
                name: file.name,
                size: file.size,
                mime: uploadMime(file),
              })),
            });
            if (response.uploads.length !== missing.length)
              throw new Error('Upload registration mismatch');
            await Promise.all(
              response.uploads.map(async (target, index) => {
                const item = missing[index];
                if (!item || this.item(item.localId)?.status === 'canceled')
                  return;
                this.targets.set(item.localId, target);
                this.update(item.localId, {
                  assetId: target.assetId,
                  status: 'queued',
                  error: undefined,
                });
                await this.save(item.localId, { target });
              }),
            );
            return;
          } catch (error) {
            if (!this.store.getState().online) continue;
            for (const item of missing)
              if (this.item(item.localId)?.status !== 'canceled')
                this.update(item.localId, {
                  status: 'error',
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Upload registration failed',
                });
            throw error;
          }
        }
      })();
      try {
        await this.registration;
      } finally {
        this.registration = undefined;
      }
    }
    this.pump();
    return Object.fromEntries(
      localIds.flatMap((id) => {
        const item = this.item(id);
        return item?.assetId && item.status !== 'canceled'
          ? [[id, item.assetId]]
          : [];
      }),
    );
  }
  private whenOnline() {
    return new Promise<void>((resolve) => {
      if (this.store.getState().online) {
        resolve();
        return;
      }
      const unsubscribe = this.store.subscribe((state) => {
        if (state.online) {
          unsubscribe();
          resolve();
        }
      });
    });
  }
  setOnline(online: boolean) {
    this.store.setState({ online });
    if (!online)
      for (const controller of this.active.values()) controller.abort();
    else {
      this.pump();
      this.flushRemovals();
    }
  }
  flushRemovals() {
    const saved = useSessionStore.getState().saved;
    for (const assetId of saved?.pendingRemovals ?? [])
      this.removals.set(`${saved?.sessionId}/${assetId}`, {
        sessionId: saved?.sessionId ?? '',
        assetId,
      });
    if (!this.store.getState().online) return;
    for (const [key, entry] of this.removals) {
      if (this.removing.has(key)) continue;
      this.removing.add(key);
      const finish = () => {
        this.removals.delete(key);
        useSessionStore
          .getState()
          .acknowledgeRemoval(entry.sessionId, entry.assetId);
      };
      void this.deps.api
        .detachAsset(entry.sessionId, entry.assetId)
        .then(finish, (error: unknown) => {
          if (error instanceof KimoApiError && error.status === 404) finish();
        })
        .finally(() => this.removing.delete(key));
    }
  }
  cancel(localId: string) {
    const item = this.item(localId);
    if (!item) return;
    this.update(localId, { status: 'canceled' });
    this.active.get(localId)?.abort();
    if (item.meta.thumbBlobUrl) URL.revokeObjectURL(item.meta.thumbBlobUrl);
    for (const url of item.meta.filmstrip ?? []) URL.revokeObjectURL(url);
    void this.deps.cache.delete(localId).catch(() => undefined);
    this.targets.delete(localId);
    this.completed.delete(localId);
    useSessionStore.getState().removeAttachment(localId);
    this.flushRemovals();
  }
  async retry(localId: string) {
    const item = this.item(localId);
    if (!item || item.status !== 'error') return;
    this.update(localId, { status: 'queued', error: undefined });
    try {
      await this.start([localId]);
    } catch {
      /* Registration failure is visible on the chip. */
    }
  }
  async restore(localIds: string[]) {
    this.store.setState({ restoring: true });
    try {
      for (const localId of localIds) {
        if (this.item(localId)) continue;
        const cached = await this.deps.cache.read(localId);
        if (!cached?.file) {
          this.store.setState({ cacheError: true });
          continue;
        }
        if (cached.target) this.targets.set(localId, cached.target);
        this.completed.set(
          localId,
          new Map(
            cached.completedParts?.map((part) => [part.partNumber, part.etag]),
          ),
        );
        const meta = {
          ...cached.meta,
          thumbBlobUrl: cached.thumbnail
            ? URL.createObjectURL(cached.thumbnail)
            : undefined,
          filmstrip: cached.filmstrip?.map((blob) => URL.createObjectURL(blob)),
        };
        const item: UploadItem = {
          localId,
          file: cached.file,
          kind: fileKind(cached.file) ?? 'doc',
          meta,
          assetId: cached.target?.assetId,
          status: cached.done ? 'done' : 'queued',
          progress: cached.done ? 1 : 0,
          bytesSent: cached.done ? cached.file.size : 0,
        };
        this.store.setState((state) => ({ items: [...state.items, item] }));
        if (
          cached.done &&
          ((item.kind === 'video' &&
            (!cached.filmstrip?.length ||
              ((cached.meta.durationSec ?? 0) <= 600 &&
                !cached.meta.waveform))) ||
            (item.kind === 'audio' && !cached.meta.waveform))
        )
          this.prepare(item);
      }
    } catch {
      this.store.setState({ cacheError: true });
    } finally {
      this.store.setState({ restoring: false });
      this.pump();
    }
  }
  private pump() {
    if (!this.store.getState().online) return;
    const next = this.store
      .getState()
      .items.filter(
        (item) =>
          item.status === 'queued' &&
          this.targets.has(item.localId) &&
          !this.active.has(item.localId),
      )
      .sort((a, b) => a.file.size - b.file.size);
    for (const item of next) {
      if (this.active.size >= UPLOAD_CONCURRENCY) break;
      const controller = new AbortController();
      this.active.set(item.localId, controller);
      this.update(item.localId, { status: 'uploading' });
      void this.run(item, controller.signal).finally(() => {
        this.active.delete(item.localId);
        this.pump();
      });
    }
  }
  private prepare(item: UploadItem) {
    const { localId, file } = item;
    if (!this.prepared.has(localId)) {
      this.prepared.add(localId);
      void this.deps
        .timeline(file, item.kind, item.meta, async (patch) => {
          if (this.item(localId)?.status === 'canceled') return;
          const current = this.item(localId);
          if (!current) return;
          const meta: MediaMeta = {
            ...current.meta,
            ...patch.meta,
            filmstrip:
              patch.filmstrip?.map((blob) => URL.createObjectURL(blob)) ??
              current.meta.filmstrip,
          };
          this.update(localId, { meta });
          await this.save(localId, patch);
        })
        .catch(() => undefined);
    }
  }
  private async run(item: UploadItem, signal: AbortSignal) {
    const { localId, file } = item;
    const target = this.targets.get(localId);
    if (!target) return;
    this.prepare(item);
    const complete = this.completed.get(localId) ?? new Map<number, string>();
    this.completed.set(localId, complete);
    const parts =
      'parts' in target
        ? uploadParts(file.size)
        : [{ partNumber: 1, start: 0, end: file.size }];
    const sent = new Map(
      parts.map((part) => [
        part.partNumber,
        complete.has(part.partNumber) ? part.end - part.start : 0,
      ]),
    );
    const progress = (number: number, value: number, size: number) => {
      sent.set(number, Math.round(value * size));
      const bytesSent = Math.min(
        file.size,
        [...sent.values()].reduce((a, b) => a + b, 0),
      );
      if (this.item(localId)?.status === 'uploading')
        this.update(localId, {
          bytesSent,
          progress: file.size ? bytesSent / file.size : 1,
        });
    };
    const put = async (part: (typeof parts)[number]) => {
      if (complete.has(part.partNumber)) return;
      for (let attempt = 0; ; attempt++) {
        if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
        try {
          const current = this.targets.get(localId);
          if (!current) throw new DOMException('Canceled', 'AbortError');
          const url =
            'parts' in current
              ? current.parts.find((p) => p.partNumber === part.partNumber)
                  ?.putUrl
              : current.putUrl;
          if (!url) throw new Error('Missing upload part');
          const etag = await this.deps.upload(
            url,
            file.slice(part.start, part.end, file.type),
            current.headers,
            (value) => progress(part.partNumber, value, part.end - part.start),
            signal,
          );
          if (signal.aborted || this.item(localId)?.status === 'canceled')
            throw new DOMException('Canceled', 'AbortError');
          complete.set(part.partNumber, etag);
          await this.save(localId, {
            completedParts: [...complete].map(([partNumber, etag]) => ({
              partNumber,
              etag,
            })),
          });
          return;
        } catch (error) {
          if (signal.aborted) throw error;
          progress(part.partNumber, 0, part.end - part.start);
          if (attempt >= UPLOAD_BACKOFF.length) throw error;
          if (error instanceof KimoApiError && error.status === 403) {
            const renewed = await this.deps.api.renewUpload(target.assetId);
            const replacement = renewed.uploads[0];
            if (replacement) {
              this.targets.set(localId, replacement);
              await this.save(localId, { target: replacement });
            }
          }
          await this.deps.wait(UPLOAD_BACKOFF[attempt] ?? 9000, signal);
        }
      }
    };
    try {
      let cursor = 0;
      const errors: unknown[] = [];
      await Promise.all(
        Array.from(
          {
            length:
              'parts' in target ? Math.min(PART_CONCURRENCY, parts.length) : 1,
          },
          async () => {
            while (cursor < parts.length && !errors.length) {
              const part = parts[cursor++];
              if (!part) return;
              try {
                await put(part);
              } catch (error) {
                errors.push(error);
              }
            }
          },
        ),
      );
      if (errors.length) throw errors[0];
      if ('parts' in target)
        await this.deps.api.completeUpload(target.assetId, {
          parts: [...complete]
            .map(([partNumber, etag]) => ({ partNumber, etag }))
            .sort((a, b) => a.partNumber - b.partNumber),
        });
      if (this.item(localId)?.status === 'canceled') return;
      this.update(localId, {
        status: 'done',
        progress: 1,
        bytesSent: file.size,
        error: undefined,
      });
      await this.save(localId, { done: true });
    } catch (error) {
      if (this.item(localId)?.status === 'canceled') return;
      if (!this.store.getState().online || signal.aborted)
        this.update(localId, { status: 'queued' });
      else
        this.update(localId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        });
    }
  }
  reset() {
    for (const item of this.store.getState().items) {
      if (item.status !== 'done') {
        this.cancel(item.localId);
        continue;
      }
      if (item.meta.thumbBlobUrl) URL.revokeObjectURL(item.meta.thumbBlobUrl);
      for (const url of item.meta.filmstrip ?? []) URL.revokeObjectURL(url);
      void this.deps.cache.delete(item.localId).catch(() => undefined);
    }
    this.probes.clear();
    this.prepared.clear();
    this.targets.clear();
    this.completed.clear();
    this.store.setState({ items: [], cacheError: false });
  }
  pruneCanceled() {
    for (const item of this.store.getState().items)
      if (item.status === 'canceled') {
        this.probes.delete(item.localId);
        this.prepared.delete(item.localId);
      }
    this.store.setState((state) => ({
      items: state.items.filter((item) => item.status !== 'canceled'),
    }));
  }
}
export const uploadManager = new UploadManager();
export function useUploads<T>(selector: (state: UploadState) => T) {
  return useStore(uploadManager.store, selector);
}
