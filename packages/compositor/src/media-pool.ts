import { Texture } from 'pixi.js';
import type { Asset } from '@kimo/client';
import { getPreloadedVideo } from './media-cache.ts';

type VideoEntry = {
  assetId: string;
  element: HTMLVideoElement;
  texture?: Texture;
  used: number;
  seekTarget?: number;
};
type ImageEntry = {
  assetId: string;
  element: HTMLImageElement;
  texture?: Texture;
};

/** Per-clip video decoders and per-asset image textures. */
export class MediaPool {
  private videos = new Map<string, VideoEntry>();
  private images = new Map<string, ImageEntry>();
  private consumedWarm = new WeakSet<HTMLVideoElement>();
  private sequence = 0;
  constructor(
    private readonly invalidate: () => void,
    private readonly onVideo?: (
      video: HTMLVideoElement,
      clipId: string,
    ) => void,
    private readonly onVideoRemoved?: (clipId: string) => void,
  ) {}

  video(
    clipId: string,
    asset: Asset,
    target: number,
    playing: boolean,
    rate: number,
    scrubbing = false,
  ): VideoEntry {
    let entry = this.videos.get(clipId);
    if (entry && entry.assetId !== asset.id) {
      this.removeVideo(clipId);
      entry = undefined;
    }
    if (!entry) {
      if (this.videos.size >= 6) {
        const oldest = [...this.videos.entries()].sort(
          (a, b) => a[1].used - b[1].used,
        )[0];
        if (oldest) this.removeVideo(oldest[0]);
      }
      const candidate = getPreloadedVideo(asset.id);
      const warmed =
        candidate &&
        candidate.getAttribute('src') &&
        !this.consumedWarm.has(candidate) &&
        !asset.proxyUrl
          ? candidate
          : undefined;
      if (warmed) this.consumedWarm.add(warmed);
      const element = warmed ?? document.createElement('video');
      element.crossOrigin = 'anonymous';
      element.playsInline = true;
      element.preload = 'auto';
      if (!warmed) {
        element.src = asset.proxyUrl ?? asset.url;
        element.load();
      }
      entry = { assetId: asset.id, element, used: ++this.sequence };
      const current = entry;
      element.addEventListener('loadeddata', () => {
        if (this.videos.get(clipId) !== current) return;
        current.texture ??= Texture.from(element);
        this.invalidate();
      });
      element.addEventListener('seeked', () => {
        if (this.videos.get(clipId) !== current) return;
        current.seekTarget = undefined;
        if (typeof element.requestVideoFrameCallback === 'function')
          element.requestVideoFrameCallback(() => this.invalidate());
        this.invalidate();
      });
      element.addEventListener('error', () => this.invalidate());
      this.videos.set(clipId, entry);
      this.onVideo?.(element, clipId);
      if (element.readyState >= 2) entry.texture = Texture.from(element);
    }
    entry.used = ++this.sequence;
    const video = entry.element;
    const drift = Math.abs(video.currentTime - target);
    const threshold = playing ? 0.25 : 1 / 60;
    if (
      video.readyState >= 1 &&
      drift > threshold &&
      (!entry.seekTarget || Math.abs(entry.seekTarget - target) > 1 / 60)
    ) {
      entry.seekTarget = target;
      try {
        const next = Math.max(
          0,
          Math.min(
            target,
            Number.isFinite(video.duration)
              ? Math.max(0, video.duration - 0.001)
              : target,
          ),
        );
        if (scrubbing && typeof video.fastSeek === 'function')
          video.fastSeek(next);
        else video.currentTime = next;
      } catch {
        /* Metadata or seekability is still pending. */
      }
    }
    if (video.playbackRate !== rate) video.playbackRate = rate;
    if (playing && video.paused && video.readyState >= 2)
      void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
    return entry;
  }

  image(asset: Asset): ImageEntry {
    const previous = this.images.get(asset.id);
    if (previous) return previous;
    const element = new Image();
    element.crossOrigin = 'anonymous';
    const entry: ImageEntry = { assetId: asset.id, element };
    element.onload = () => {
      entry.texture = Texture.from(element);
      this.invalidate();
    };
    element.onerror = () => this.invalidate();
    element.src = asset.proxyUrl ?? asset.url;
    this.images.set(asset.id, entry);
    return entry;
  }
  retain(active: Set<string>) {
    for (const [id, entry] of this.videos)
      if (!active.has(id)) entry.element.pause();
  }
  pause() {
    for (const { element } of this.videos.values()) element.pause();
  }
  private removeVideo(id: string) {
    const item = this.videos.get(id);
    if (!item) return;
    item.element.pause();
    this.onVideoRemoved?.(id);
    item.texture?.destroy();
    item.element.removeAttribute('src');
    item.element.load();
    this.videos.delete(id);
  }
  destroy() {
    for (const id of [...this.videos.keys()]) this.removeVideo(id);
    for (const image of this.images.values()) image.texture?.destroy();
    this.images.clear();
  }
}
