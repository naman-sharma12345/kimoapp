'use client';
import { isLocalAssetUrl, setAssetResolver, type Asset } from '@kimo/client';

/**
 * The clips a user picked, held only in this tab's memory as object URLs.
 * kimo never uploads or saves media: the API knows a clip by name, type and
 * length, and this module swaps its `kimo-local://` address for the File
 * the user chose. A refresh or a new tab starts empty, and the studio asks
 * for the same files again, matched by name and duration.
 */
type Entry = { file: File; url: string };
const files = new Map<string, Entry>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function registerLocalFile(assetId: string, file: File) {
  const previous = files.get(assetId);
  if (previous?.file === file) return;
  if (previous) URL.revokeObjectURL(previous.url);
  files.set(assetId, { file, url: URL.createObjectURL(file) });
  notify();
}

export function localFile(assetId: string) {
  return files.get(assetId)?.file;
}

export function localFileUrl(assetId: string) {
  return files.get(assetId)?.url;
}

export function hasLocalMedia() {
  return files.size > 0;
}

export function onLocalMediaChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** User clips of this project that are not in this tab yet. */
export function missingAssets(assets: readonly Asset[]) {
  return assets.filter(
    (asset) =>
      asset.source === 'user' &&
      asset.kind !== 'doc' &&
      isLocalAssetUrl(asset.url) &&
      !files.has(asset.id),
  );
}

function normalise(name: string) {
  return name.normalize('NFKC').trim().toLowerCase();
}

/** Reads a media file's duration in the browser, without uploading it. */
export function probeDuration(file: File): Promise<number | undefined> {
  if (!/^(video|audio)\//.test(file.type)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const element = document.createElement(
      file.type.startsWith('video/') ? 'video' : 'audio',
    );
    const url = URL.createObjectURL(file);
    const done = (value?: number) => {
      URL.revokeObjectURL(url);
      element.removeAttribute('src');
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), 8000);
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(element.duration) ? element.duration : undefined);
    };
    element.onerror = () => {
      clearTimeout(timer);
      done(undefined);
    };
    element.src = url;
  });
}

export function durationsMatch(expected?: number, actual?: number) {
  if (!expected || !actual) return true;
  return Math.abs(expected - actual) <= Math.max(0.5, expected * 0.01);
}

/**
 * Matches picked files to the project's missing clips by file name, then by
 * kind and length for renamed files. Returns how many were matched and the
 * names of files that matched nothing.
 */
export async function relinkFiles(
  picked: readonly File[],
  assets: readonly Asset[],
) {
  const missing = missingAssets(assets);
  const unmatched: string[] = [];
  let matched = 0;
  const probed = await Promise.all(
    picked.map(async (file) => ({ file, duration: await probeDuration(file) })),
  );
  const taken = new Set<string>();
  const pick = (test: (asset: Asset) => boolean) =>
    missing.find((asset) => !taken.has(asset.id) && test(asset));
  for (const { file, duration } of probed) {
    const kind = file.type.split('/')[0];
    const byName = pick(
      (asset) =>
        normalise(asset.name) === normalise(file.name) &&
        durationsMatch(asset.durationSec, duration),
    );
    const byLength =
      byName ??
      pick(
        (asset) =>
          asset.kind === kind &&
          Boolean(asset.durationSec && duration) &&
          durationsMatch(asset.durationSec, duration),
      );
    if (byLength) {
      taken.add(byLength.id);
      registerLocalFile(byLength.id, file);
      matched++;
    } else unmatched.push(file.name);
  }
  return { matched, unmatched };
}

/** Swaps local clip addresses for this tab's object URLs. */
export function resolveLocalAsset(asset: Asset): Asset {
  if (!isLocalAssetUrl(asset.url)) return asset;
  const url = files.get(asset.id)?.url;
  return url ? { ...asset, url } : asset;
}

setAssetResolver(resolveLocalAsset);
