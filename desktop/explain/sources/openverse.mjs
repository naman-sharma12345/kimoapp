// Openverse (keyless, CC images): only CC0, Public Domain Mark and CC BY,
// non-mature results. https://api.openverse.org/v1/
import { USER_AGENT, OK_LICENCES } from '../assets.mjs';

export const name = 'openverse';
export const API = 'https://api.openverse.org/v1/images/';

/** search(query, {cache, signal}) → candidates [{url, thumb, w, h, license, license_version, license_url, creator, title, landing, source}] */
export async function search(query, { cache, signal, limit = 3 } = {}) {
  const q = String(query ?? '').trim().slice(0, 120);
  if (!q) return [];
  return cache.search(name, q, async () => {
    const url = `${API}?${new URLSearchParams({ q, license: 'cc0,pdm,by', page_size: '8', mature: 'false' })}`;
    const r = await cache.fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal });
    if (!r.ok) throw new Error(`Openverse answered ${r.status}`);
    const body = await r.json();
    return (body.results ?? [])
      .filter((x) => OK_LICENCES.has(String(x.license).toLowerCase()) && !x.mature && /^https:/.test(x.url ?? ''))
      .filter((x) => !/svg|gif/i.test(x.filetype ?? ''))
      .slice(0, limit)
      .map((x) => ({ source: name, url: x.url, thumb: x.thumbnail ?? null, w: x.width ?? null, h: x.height ?? null, license: String(x.license).toLowerCase(), license_version: x.license_version ?? null, license_url: x.license_url ?? null, creator: x.creator ?? null, title: x.title ?? null, landing: x.foreign_landing_url ?? null }));
  });
}
