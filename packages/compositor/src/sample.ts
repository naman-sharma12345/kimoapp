import type { Asset, KimoProject } from '@kimo/client';
import { CompositorController } from './controller.ts';

export interface SampledFrame {
  t: number;
  image: string;
  luma: number;
}

/** Times worth checking: an even spread, every text clip and every cut. */
export function sampleTimes(project: KimoProject, max = 14): number[] {
  const duration = project.duration;
  if (!duration) return [];
  const picks = new Set<number>();
  const add = (time: number) =>
    picks.add(
      Math.round(Math.min(Math.max(time, 0), duration - 0.05) * 10) / 10,
    );
  for (const clip of Object.values(project.clips)) {
    if (clip.kind === 'text')
      add(clip.start + Math.min(0.4, clip.duration / 2));
  }
  const cuts = Object.values(project.clips)
    .filter((clip) => clip.kind === 'video')
    .map((clip) => clip.start)
    .filter((time) => time > 0.2);
  for (const time of cuts) add(time + 0.1);
  const even = Math.max(4, Math.ceil(max / 2));
  for (let i = 0; i < even; i++) add(((i + 0.5) / even) * duration);
  const sorted = [...picks].sort((a, b) => a - b);
  if (sorted.length <= max) return sorted;
  const step = sorted.length / max;
  return Array.from(
    { length: max },
    (_, i) => sorted[Math.floor(i * step)] ?? 0,
  );
}

async function brightness(image: string): Promise<number> {
  const bitmap = new Image();
  bitmap.src = image;
  await bitmap.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 18;
  const context = canvas.getContext('2d');
  if (!context) return 128;
  context.drawImage(bitmap, 0, 0, 32, 18);
  const data = context.getImageData(0, 0, 32, 18).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4)
    sum +=
      0.2126 * (data[i] ?? 0) +
      0.7152 * (data[i + 1] ?? 0) +
      0.0722 * (data[i + 2] ?? 0);
  return sum / (data.length / 4);
}

/**
 * Renders frames of the cut in a hidden canvas with the same compositor the
 * preview and export use, for the AI's render check. Stays in the tab.
 */
export async function renderSamples(
  project: KimoProject,
  assets: readonly Asset[],
  times: number[],
  onFrame: (done: number, total: number) => void = () => undefined,
): Promise<SampledFrame[]> {
  const scale = 640 / Math.max(project.width, project.height);
  const width = Math.max(2, Math.round((project.width * scale) / 2) * 2);
  const height = Math.max(2, Math.round((project.height * scale) / 2) * 2);
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
    {
      size: [width, height],
    },
  );
  const frames: SampledFrame[] = [];
  try {
    await controller.mount();
    for (const [index, time] of times.entries()) {
      try {
        const raw = await controller.captureFrame(time);
        const image = raw.startsWith('data:image/jpeg;base64,')
          ? raw
          : `data:image/jpeg;base64,${raw.replace(/^data:[^,]*,/, '')}`;
        frames.push({ t: time, image, luma: await brightness(image) });
      } catch {
        // A frame that will not draw is skipped; the rest still get checked.
      }
      onFrame(index + 1, times.length);
    }
  } finally {
    controller.destroy();
    canvas.remove();
  }
  return frames;
}
