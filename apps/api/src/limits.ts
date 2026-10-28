import type { Asset, KimoProject } from '@kimo/client';
import { HttpError } from './http.ts';

/** Free-plan size limits for one timeline (edit metadata only). */
export const LIMITS = {
  clips: 400,
  tracks: 16,
  markers: 200,
  textChars: 1000,
  projectBytes: 400_000,
  durationSec: 4 * 60 * 60,
  sessionAssets: 60,
  filesPerRequest: 30,
  fileBytes: 2 * 1024 ** 3,
  opsPerBatch: 200,
} as const;

/** Throws a 413 when an edited project grows past the free-plan limits. */
export function checkProjectLimits(project: KimoProject) {
  const clips = Object.values(project.clips);
  const tooBig = () => {
    throw new HttpError(413, 'too_large', 'This timeline is too large');
  };
  if (clips.length > LIMITS.clips) tooBig();
  if (project.tracks.length > LIMITS.tracks) tooBig();
  if (project.markers.length > LIMITS.markers) tooBig();
  if (project.duration > LIMITS.durationSec) tooBig();
  if ((project.notes?.length ?? 0) > LIMITS.textChars) tooBig();
  for (const clip of clips)
    if ((clip.text?.content.length ?? 0) > LIMITS.textChars) tooBig();
  if (JSON.stringify(project).length > LIMITS.projectBytes) tooBig();
}

/** True when every media clip stays inside its source file's duration. */
export function withinSources(project: KimoProject, assets: Asset[]) {
  const durations = new Map(
    assets.map((asset) => [asset.id, asset.durationSec]),
  );
  return Object.values(project.clips).every((clip) => {
    if (!clip.assetId || (clip.kind !== 'video' && clip.kind !== 'audio'))
      return true;
    const length = durations.get(clip.assetId);
    return !length || clip.in + clip.duration * clip.speed <= length + 0.05;
  });
}
