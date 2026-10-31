// Wikimedia Commons (keyless): file search with licence metadata; only CC0,
// public domain and CC BY (no share-alike / non-commercial / no-derivatives).
import { USER_AGENT } from '../assets.mjs';

export const name = 'wikimedia';
export const API = 'https://commons.wikimedia.org/w/api.php';
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Commons licence code → {license, version} or null when not allowed. */
export function commonsLicence(code, short = '') {
  const c = String(code ?? short).toLowerCase().replace(/\s+/g, '-');
  if (c === 'cc0' || c.startsWith('cc-zero')) return { license: 'cc0', version: '1.0' };
  if (c.startsWith('pd') || c.startsWith('public-domain')) return { license: 'pd', version: null };
  const m = /^cc-by-(\d(?:\.\d)?)$/.exec(c);
  return m ? { license: 'by', version: m[1] } : null;
}

export async function search(query, { cache, signal, limit = 3 } = {}) {
  const q = String(query ?? '').trim().slice(0, 120);
  if (!q) return [];
  return cache.search(name, q, async () => {
    const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1024', format: 'json', formatversion: '2' });
    const r = await cache.fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal });
    if (!r.ok) throw new Error(`Wikimedia answered ${r.status}`);
    const body = await r.json();
    const out = [];
    for (const p of [...(body.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime ?? '')) continue;
      const md = ii.extmetadata ?? {};
      const lic = commonsLicence(md.License?.value, md.LicenseShortName?.value);
      if (!lic) continue;
      out.push({ source: name, url: ii.thumburl ?? ii.url, thumb: ii.thumburl ?? null, w: ii.thumbwidth ?? ii.width ?? null, h: ii.thumbheight ?? ii.height ?? null, license: lic.license, license_version: lic.version, license_url: md.LicenseUrl?.value ?? null, creator: strip(md.Artist?.value) || null, title: String(p.title ?? '').replace(/^File:/, '').replace(/\.\w+$/, ''), landing: ii.descriptionurl ?? null });
      if (out.length >= limit) break;
    }
    return out;
  });
}
