import { rememberDerivedMedia } from '@kimo/compositor';
import type { MediaCache } from './types';

/**
 * Picked files and their previews live only in this tab's memory. Nothing
 * is written to IndexedDB, OPFS or a server, so a refresh or a closed tab
 * forgets them and a reopened project asks for the clips again.
 */
const media = new Map<string, MediaCache>();

export async function readMedia(
  localId: string,
): Promise<MediaCache | undefined> {
  return media.get(localId);
}
export async function saveMedia(localId: string, patch: Partial<MediaCache>) {
  const next = { ...media.get(localId), ...patch, localId } as MediaCache;
  media.set(localId, next);
  const assetId = next.target?.assetId;
  if (assetId && (next.filmstrip?.length || next.timelineWaveform))
    rememberDerivedMedia(assetId, {
      filmstrip: next.filmstrip,
      timelineWaveform: next.timelineWaveform,
    });
}
export async function deleteMedia(localId: string) {
  media.delete(localId);
}
