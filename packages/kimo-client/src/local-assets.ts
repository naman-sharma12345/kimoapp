import type { Asset } from './schema.ts';

/**
 * Media never leaves the browser tab. The API describes a user's clip with a
 * `kimo-local://asset/<id>` address, and the open tab swaps that for an
 * in-memory object URL of the File the user picked. Nothing is fetched from,
 * or stored on, a server or the device's disk.
 */
export const LOCAL_ASSET_PREFIX = 'kimo-local://asset/';
export function localAssetUrl(assetId: string) {
  return `${LOCAL_ASSET_PREFIX}${encodeURIComponent(assetId)}`;
}
export function isLocalAssetUrl(url: string | undefined) {
  return Boolean(url?.startsWith(LOCAL_ASSET_PREFIX));
}
type Resolver = (asset: Asset) => Asset;
let resolver: Resolver = (asset) => asset;
/** The web app registers how local addresses become object URLs. */
export function setAssetResolver(next: Resolver) {
  resolver = next;
}
export function resolveAsset(asset: Asset): Asset {
  return resolver(asset);
}
export function resolveAssets(assets: readonly Asset[]): Asset[] {
  return assets.map((asset) => resolver(asset));
}
