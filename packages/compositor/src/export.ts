import type { Asset, KimoProject } from '@kimo/client';
import { CompositorController } from './controller.ts';

/**
 * In-browser export. The same compositor that draws the preview plays the
 * project once into a hidden canvas while MediaRecorder captures the canvas
 * and the Web Audio mix. Nothing is uploaded: the result is a Blob in the
 * open tab that the user downloads. Real time, so a 30 second edit takes
 * about 30 seconds, and the tab should stay visible while it runs.
 */
export interface ExportFormat {
  mimeType: string;
  extension: 'mp4' | 'webm';
}
export interface ExportProgress {
  time: number;
  duration: number;
  frame?: string;
}
export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  width: number;
  height: number;
  durationSec: number;
}

const CANDIDATES: ExportFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

/** The best recorder format this browser supports, preferring `prefer`. */
export function pickExportFormat(
  prefer: 'mp4' | 'webm' = 'mp4',
): ExportFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const ordered = [
    ...CANDIDATES.filter((item) => item.extension === prefer),
    ...CANDIDATES.filter((item) => item.extension !== prefer),
  ];
  return (
    ordered.find((item) => MediaRecorder.isTypeSupported(item.mimeType)) ?? null
  );
}

export function exportSize(
  project: Pick<KimoProject, 'width' | 'height'>,
  resolution: '1080p' | '720p' = '1080p',
): [number, number] {
  const scale = resolution === '720p' ? 2 / 3 : 1;
  const even = (value: number) =>
    Math.max(2, Math.round((value * scale) / 2) * 2);
  return [even(project.width), even(project.height)];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function exportProject(
  project: KimoProject,
  assets: readonly Asset[],
  options: {
    resolution?: '1080p' | '720p';
    prefer?: 'mp4' | 'webm';
    onProgress?: (progress: ExportProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ExportResult> {
  if (!project.duration) throw new Error('nothing to export yet');
  const format = pickExportFormat(options.prefer);
  if (!format) throw new Error('this browser cannot record video');
  const [width, height] = exportSize(project, options.resolution);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '-200vw',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  });
  document.body.append(canvas);
  const controller = new CompositorController(
    canvas,
    project,
    assets,
    () => undefined,
    { size: [width, height] },
  );
  let recorder: MediaRecorder | undefined;
  try {
    await controller.mount();
    // Wait for the first frame's media so the export does not open on black.
    await controller.captureFrame(0).catch(() => undefined);
    const audio = await controller.audioStream().catch(() => undefined);
    const video = canvas.captureStream(project.fps);
    const stream = new MediaStream([
      ...video.getVideoTracks(),
      ...(audio?.getAudioTracks() ?? []),
    ]);
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond:
        width * height >= 1920 * 1080 ? 10_000_000 : 6_000_000,
      audioBitsPerSecond: 192_000,
    });
    const active = recorder;
    active.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      active.onstop = () => resolve();
      active.onerror = () => reject(new Error('recording failed'));
    });
    controller.seek(0);
    active.start(1000);
    await controller.play();
    let lastFrame = 0;
    while (true) {
      if (options.signal?.aborted) {
        active.stop();
        await stopped.catch(() => undefined);
        throw new DOMException('Export cancelled', 'AbortError');
      }
      await wait(150);
      const time = Math.min(project.duration, controller.current);
      let frame: string | undefined;
      if (performance.now() - lastFrame > 1500) {
        lastFrame = performance.now();
        frame = await controller.snapshot().catch(() => undefined);
      }
      options.onProgress?.({ time, duration: project.duration, frame });
      if (!controller.isPlaying) break;
    }
    // Let the last frames and audio reach the recorder.
    await wait(250);
    active.stop();
    await stopped;
    const blob = new Blob(chunks, { type: format.mimeType.split(';')[0] });
    if (!blob.size) throw new Error('the export came out empty');
    return {
      blob,
      format,
      width,
      height,
      durationSec: project.duration,
    };
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    controller.destroy();
    canvas.remove();
  }
}
