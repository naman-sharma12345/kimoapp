'use client';
import type { AssetAnalysis } from '@kimo/client';

/**
 * How each clip in this tab is getting ready: read from disk, a poster
 * frame, then its sound measured. Nothing here leaves the device.
 */
export type ClipStage = 'reading' | 'thumbnails' | 'analysing' | 'ready';
export type ClipPrep = {
  assetId: string;
  name: string;
  stage: ClipStage;
  /** 0 to 1 across all stages. */
  progress: number;
};

export const STAGE_LABEL: Record<ClipStage, string> = {
  reading: 'reading',
  thumbnails: 'thumbnails',
  analysing: 'analysing audio',
  ready: 'ready',
};
export const STAGE_ORDER: readonly ClipStage[] = [
  'reading',
  'thumbnails',
  'analysing',
  'ready',
];
const SPAN: Record<ClipStage, [number, number]> = {
  reading: [0, 0.2],
  thumbnails: [0.2, 0.3],
  analysing: [0.3, 1],
  ready: [1, 1],
};

/** A clip's overall progress from its stage and how far into it it is. */
export function clipProgress(stage: ClipStage, within = 0) {
  const [from, to] = SPAN[stage];
  return from + (to - from) * Math.min(1, Math.max(0, within));
}

let clips: ClipPrep[] = [];
const listeners = new Set<() => void>();
function publish(next: ClipPrep[]) {
  clips = next;
  for (const listener of listeners) listener();
}

export function subscribeClipPrep(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const clipPrepSnapshot = () => clips;
export const clipPrepServerSnapshot = (): ClipPrep[] => [];

export function setClipStage(
  assetId: string,
  name: string,
  stage: ClipStage,
  within = 0,
) {
  const entry = { assetId, name, stage, progress: clipProgress(stage, within) };
  const index = clips.findIndex((clip) => clip.assetId === assetId);
  if (index < 0) publish([...clips, entry]);
  else {
    const previous = clips[index];
    // Skip updates too small to see.
    if (
      previous &&
      previous.stage === entry.stage &&
      Math.abs(previous.progress - entry.progress) < 0.005
    )
      return;
    publish(clips.map((clip, i) => (i === index ? entry : clip)));
  }
}

export function resetClipPrep() {
  publish([]);
}

export function isPreparing(list: readonly ClipPrep[] = clips) {
  return list.some((clip) => clip.stage !== 'ready');
}

export function overallProgress(list: readonly ClipPrep[]) {
  if (!list.length) return 1;
  return list.reduce((sum, clip) => sum + clip.progress, 0) / list.length;
}

type Deps = {
  thumbnail: (file: File) => Promise<unknown>;
  analyze: (
    bytes: ArrayBuffer,
    onProgress: (value: number) => void,
  ) => Promise<AssetAnalysis | undefined>;
};

const READ_CHUNK = 4 * 1024 ** 2;
function readSlice(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Reads a file's bytes in 4 MB slices, reporting real progress. */
export async function readWithProgress(
  file: Blob,
  onProgress: (value: number) => void,
): Promise<ArrayBuffer> {
  const out = new Uint8Array(file.size);
  for (let offset = 0; offset < file.size; offset += READ_CHUNK) {
    const part = await readSlice(file.slice(offset, offset + READ_CHUNK));
    out.set(new Uint8Array(part), offset);
    onProgress(Math.min(1, (offset + part.byteLength) / file.size));
  }
  onProgress(1);
  return out.buffer;
}

/** Takes one clip from reading to ready, publishing each stage. */
export async function prepareClip(
  asset: { id: string; name: string; kind: 'video' | 'audio' },
  file: File,
  deps: Deps,
) {
  const stage = (next: ClipStage, within = 0) =>
    setClipStage(asset.id, asset.name, next, within);
  try {
    stage('reading');
    const bytes = await readWithProgress(file, (value) =>
      stage('reading', value),
    );
    stage('thumbnails');
    if (asset.kind === 'video') await deps.thumbnail(file).catch(() => null);
    stage('analysing');
    return await deps.analyze(bytes, (value) => stage('analysing', value));
  } catch {
    return undefined;
  } finally {
    stage('ready');
  }
}

/**
 * Whether the landing prompt can run as the first AI edit: there is one,
 * the AI is on, it has not run yet, and every clip is here and ready.
 */
export function firstPromptGate({
  prompt,
  aiReady,
  alreadyRun,
  missingClips,
  preparing,
}: {
  prompt?: string;
  aiReady: boolean;
  alreadyRun: boolean;
  missingClips: number;
  preparing: boolean;
}): 'run' | 'wait' | 'skip' {
  if (!prompt || alreadyRun || !aiReady) return 'skip';
  if (missingClips > 0 || preparing) return 'wait';
  return 'run';
}

export const CLIPS_WAIT_NOTE = 'waiting for clips to be ready';
export const CLIP_PREP_TITLE =
  'getting your clips ready, they stay on this device';
