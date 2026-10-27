import type { Asset } from '@kimo/client';

const cached = new Map<
  string,
  { sessionId: string; video: HTMLVideoElement }
>();
/** Preloaded elements stay alive across the warm-up to Studio route transition. */
export function preloadVideoAssets(
  sessionId: string,
  assets: readonly Asset[],
) {
  if (typeof document === 'undefined') return;
  clearVideoAssets(sessionId, true);
  for (const asset of assets
    .filter((item) => item.kind === 'video')
    .slice(0, 3)) {
    if (cached.has(asset.id)) continue;
    const video = document.createElement('video');
    video.hidden = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.dataset.compositorPreload = asset.id;
    video.src = asset.url;
    document.body.append(video);
    video.load();
    cached.set(asset.id, { sessionId, video });
  }
}
export function getPreloadedVideo(assetId: string) {
  return cached.get(assetId)?.video;
}
export function clearVideoAssets(sessionId: string, keepMatching = false) {
  for (const [id, entry] of cached) {
    if ((entry.sessionId === sessionId) === keepMatching) continue;
    entry.video.pause();
    entry.video.removeAttribute('src');
    entry.video.load();
    entry.video.remove();
    cached.delete(id);
  }
}
