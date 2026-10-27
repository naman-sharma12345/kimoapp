import type { FileKind } from '../landing-files';
import type { MediaCache, MediaMeta } from './types';
import { waveformPeaks } from './peaks';

const PROBE_TIMEOUT = 8000;
type Probe = { meta: MediaMeta; thumbnail?: Blob };
async function workerTask<T>(
  data:
    { kind: 'image'; file: File } | { kind: 'peaks'; samples: Float32Array },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./media.worker.ts', import.meta.url));
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Media worker timed out'));
    }, PROBE_TIMEOUT);
    worker.onmessage = (event: MessageEvent<T & { failed?: boolean }>) => {
      clearTimeout(timer);
      worker.terminate();
      if (event.data.failed) reject(new Error('Unsupported media'));
      else resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('Media worker unavailable'));
    };
    worker.postMessage(data);
  });
}
async function imageProbe(file: File): Promise<Probe> {
  try {
    const result = await workerTask<{
      width: number;
      height: number;
      thumbnail: Blob;
    }>({ kind: 'image', file });
    return {
      meta: { width: result.width, height: result.height },
      thumbnail: result.thumbnail,
    };
  } catch {
    const bitmap = await createImageBitmap(file);
    try {
      const ratio = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const thumbnail = await canvasBlob(canvas);
      return {
        meta: { width: bitmap.width, height: bitmap.height },
        thumbnail,
      };
    } finally {
      bitmap.close();
    }
  }
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Thumbnail unavailable')),
      'image/jpeg',
      0.8,
    ),
  );
}
async function videoSource<T>(
  file: File,
  action: (video: HTMLVideoElement) => Promise<T>,
): Promise<T> {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Unsupported video codec')),
        PROBE_TIMEOUT,
      );
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Unsupported video codec'));
      };
      video.src = url;
    });
    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      !video.videoWidth ||
      !video.videoHeight
    )
      throw new Error('Unsupported video');
    return await action(video);
  } finally {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
async function frame(
  video: HTMLVideoElement,
  time: number,
  width: number,
  height: number,
) {
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', finish);
      video.removeEventListener('loadeddata', loaded);
      resolve();
    };
    const loaded = () => {
      if (!video.seeking && video.readyState >= 2) finish();
    };
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', finish);
      video.removeEventListener('loadeddata', loaded);
      reject(new Error('Frame unavailable'));
    }, PROBE_TIMEOUT);
    video.addEventListener('seeked', finish, { once: true });
    video.addEventListener('loadeddata', loaded);
    video.currentTime = Math.max(0, Math.min(time, video.duration - 0.01));
    loaded();
  });
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(video, 0, 0, width, height);
  return canvasBlob(canvas);
}
export async function probeMedia(file: File, kind: FileKind): Promise<Probe> {
  if (kind === 'doc' || kind === 'audio') return { meta: {} };
  try {
    if (kind === 'image') return await imageProbe(file);
    return await videoSource(file, async (video) => ({
      meta: {
        durationSec: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      },
      thumbnail: await frame(
        video,
        Math.min(1, video.duration * 0.1),
        video.videoWidth >= video.videoHeight ? 160 : 90,
        video.videoWidth >= video.videoHeight ? 90 : 160,
      ),
    }));
  } catch {
    return { meta: { previewAfterUpload: true } };
  }
}
export async function prepareTimeline(
  file: File,
  kind: FileKind,
  meta: MediaMeta,
  save: (patch: Partial<MediaCache>) => Promise<void>,
) {
  const tasks: Promise<void>[] = [];
  if (kind === 'video' && !meta.previewAfterUpload)
    tasks.push(
      videoSource(file, async (video) => {
        const filmstrip: Blob[] = [];
        for (let index = 0; index < 8; index++)
          filmstrip.push(
            await frame(
              video,
              (video.duration * (index + 0.5)) / 8,
              Math.max(
                1,
                Math.round((80 * video.videoWidth) / video.videoHeight),
              ),
              80,
            ),
          );
        await save({ filmstrip });
      }),
    );
  if (
    (kind === 'audio' || kind === 'video') &&
    (meta.durationSec === undefined || meta.durationSec <= 600)
  )
    tasks.push(
      (async () => {
        // Metadata and DOM video decoding stay on the main thread; peak reduction runs in a worker.
        const decoder = new OfflineAudioContext(1, 1, 8000);
        const decoded = await decoder.decodeAudioData(await file.arrayBuffer());
        if (decoded.duration > 600) {
          await save({ meta: { ...meta, durationSec: decoded.duration } });
          return;
        }
        const context = new OfflineAudioContext(
          1,
          Math.max(1, Math.ceil(decoded.duration * 8000)),
          8000,
        );
        const source = context.createBufferSource();
        source.buffer = decoded;
        source.connect(context.destination);
        source.start();
        const mono = await context.startRendering();
        const samples = mono.getChannelData(0);
        let peaks: ReturnType<typeof waveformPeaks>;
        try {
          peaks = await workerTask({ kind: 'peaks', samples });
        } catch {
          peaks = waveformPeaks(samples);
        }
        await save({
          meta: {
            ...meta,
            durationSec: decoded.duration,
            waveform: peaks.waveform,
          },
          timelineWaveform: peaks.timeline,
        });
      })(),
    );
  await Promise.allSettled(tasks);
}
