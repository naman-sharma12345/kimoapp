import type { Asset, Clip } from '@kimo/client';

type CachedMedia = {
  target?: { assetId: string };
  filmstrip?: Blob[];
  timelineWaveform?: Float32Array;
};
async function cachedFile(assetId: string): Promise<CachedMedia | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  return new Promise((resolve) => {
    const request = indexedDB.open('kimo-media', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('media'))
        request.result.createObjectStore('media', { keyPath: 'localId' });
    };
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('media')) {
        db.close();
        resolve(undefined);
        return;
      }
      const read = db
        .transaction('media', 'readonly')
        .objectStore('media')
        .getAll();
      read.onerror = () => {
        db.close();
        resolve(undefined);
      };
      read.onsuccess = () => {
        const result = (read.result as CachedMedia[]).find(
          (item) => item.target?.assetId === assetId,
        );
        db.close();
        resolve(result);
      };
    };
  });
}
export async function filmstripFor(
  clip: Clip,
  asset: Asset,
  width: number,
): Promise<Blob[]> {
  const cached = await cachedFile(asset.id);
  if (cached?.filmstrip?.length) return cached.filmstrip;
  if (asset.kind !== 'video' || typeof document === 'undefined') return [];
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.src = asset.proxyUrl ?? asset.url;
  const wait = (event: 'loadeddata' | 'seeked') =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 5000);
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener('error', failed);
      };
      const done = () => {
        cleanup();
        resolve(true);
      };
      const failed = () => {
        cleanup();
        resolve(false);
      };
      video.addEventListener(event, done, { once: true });
      video.addEventListener('error', failed, { once: true });
    });
  try {
    if (!(await wait('loadeddata'))) return [];
    const count = Math.max(1, Math.min(12, Math.ceil(width / 96)));
    const canvas = new OffscreenCanvas(192, 108);
    const context = canvas.getContext('2d');
    if (!context) return [];
    const result: Blob[] = [];
    for (let index = 0; index < count; index++) {
      const target = Math.min(
        Math.max(0, video.duration - 0.04),
        clip.in + (clip.duration * clip.speed * index) / count,
      );
      if (Math.abs(video.currentTime - target) > 0.01) {
        const ready = wait('seeked');
        video.currentTime = target;
        if (!(await ready)) continue;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      result.push(
        await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }),
      );
    }
    return result;
  } catch {
    return [];
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
export async function cachedWaveform(asset: Asset) {
  const stored = (await cachedFile(asset.id))?.timelineWaveform;
  if (stored || (asset.kind !== 'audio' && asset.kind !== 'video'))
    return stored;
  if (asset.durationSec && asset.durationSec > 600) return undefined;
  const context = new AudioContext();
  try {
    const response = await fetch(asset.proxyUrl ?? asset.url);
    if (!response.ok) return undefined;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const samplesPerBin = Math.max(1, Math.round(buffer.sampleRate * 0.01));
    const bins = new Float32Array(Math.ceil(buffer.length / samplesPerBin));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < bins.length; index++) {
        let peak = bins[index] ?? 0;
        const end = Math.min(data.length, (index + 1) * samplesPerBin);
        for (let sample = index * samplesPerBin; sample < end; sample++)
          peak = Math.max(peak, Math.abs(data[sample] ?? 0));
        bins[index] = peak;
      }
    }
    return bins;
  } catch {
    return undefined;
  } finally {
    await context.close();
  }
}
