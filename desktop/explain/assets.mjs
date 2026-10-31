// Phase 7.5c asset cache and preparation. Node only.
//
// Every fetched asset and every search answer is cached on disk by content
// hash (default %APPDATA%/kimo/asset-cache, LRU-trimmed to 2 GB), so a
// re-render makes no network call. Pictures are converted once to a PNG the
// graphics renderer decodes (≤ 1280 px) and a 256 px JPEG thumbnail for the
// director's second (vision) pass. Licence and attribution travel with each
// asset record and end up in the EDL and ATTRIBUTIONS.txt.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

export const CACHE_LIMIT_BYTES = 2 * 1024 ** 3;
export const MAX_SEARCHES = 25;
export const USER_AGENT = 'kimo-desktop/0.3 (https://getkimo.tech; hello@getkimo.tech)';
/** Licences a fetched asset may carry (bundled assets: see THIRD_PARTY_NOTICES.md). */
export const OK_LICENCES = new Set(['cc0', 'pdm', 'pd', 'by']);

export const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 32);

/** Default cache folder: %APPDATA%/kimo/asset-cache (Windows), ~/.cache/kimo/asset-cache elsewhere. */
export function defaultAssetCache() {
  if (process.env.KIMO_ASSET_CACHE) return process.env.KIMO_ASSET_CACHE;
  if (process.env.APPDATA) return join(process.env.APPDATA, 'kimo', 'asset-cache');
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'kimo', 'asset-cache');
}

/**
 * Disk cache with a byte cap (LRU by access time, touched on every hit).
 * Also counts network use per run: {searches, fetches, network, hits}.
 */
export class AssetCache {
  constructor(dir = defaultAssetCache(), { limit = CACHE_LIMIT_BYTES, maxSearches = MAX_SEARCHES, fetch: f = (...a) => fetch(...a) } = {}) {
    this.dir = dir;
    this.limit = limit;
    this.maxSearches = maxSearches;
    this.fetch = f;
    this.stats = { searches: 0, fetches: 0, network: 0, hits: 0, refused: 0 };
    mkdirSync(join(dir, 'json'), { recursive: true });
    mkdirSync(join(dir, 'files'), { recursive: true });
  }
  path(kind, key, ext = '') {
    return join(this.dir, kind, `${key}${ext}`);
  }
  touch(p) {
    try {
      const now = new Date();
      utimesSync(p, now, now);
    } catch {
      /* best effort */
    }
  }
  getJson(key) {
    const p = this.path('json', key, '.json');
    if (!existsSync(p)) return null;
    this.touch(p);
    this.stats.hits++;
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }
  putJson(key, value) {
    writeFileSync(this.path('json', key, '.json'), JSON.stringify(value));
    this.trim();
    return value;
  }
  /** One cached search: fn() runs only on a miss and counts against the per-video cap. */
  async search(source, query, fn) {
    const key = sha({ source, query });
    const hit = this.getJson(key);
    if (hit) return hit;
    if (this.stats.searches >= this.maxSearches) {
      this.stats.refused++;
      return [];
    }
    this.stats.searches++;
    this.stats.network++;
    return this.putJson(key, await fn());
  }
  /** Downloads a URL once (by URL hash); returns the local path. */
  async download(url, { signal, maxBytes = 25 * 1024 * 1024 } = {}) {
    const ext = (extname(new URL(url).pathname).toLowerCase().match(/^\.(png|jpe?g|webp|gif|svg)$/) ?? ['.img'])[0];
    const file = this.path('files', sha(url), ext);
    if (existsSync(file) && statSync(file).size > 0) {
      this.touch(file);
      this.stats.hits++;
      return file;
    }
    if (!/^https:\/\//.test(url)) throw new Error('only https assets are fetched');
    this.stats.fetches++;
    this.stats.network++;
    const r = await this.fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal });
    if (!r.ok) throw new Error(`asset answered ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) throw new Error('asset too large');
    writeFileSync(file, buf);
    this.trim();
    return file;
  }
  /** Stores bytes under a key (AI images, screenshots); returns the path. */
  putFile(key, buf, ext = '.png') {
    const file = this.path('files', key, ext);
    writeFileSync(file, buf);
    this.trim();
    return file;
  }
  hasFile(key, ext = '.png') {
    const file = this.path('files', key, ext);
    if (!existsSync(file)) return null;
    this.touch(file);
    this.stats.hits++;
    return file;
  }
  /** LRU trim to the byte cap (oldest access first). */
  trim() {
    const all = [];
    let total = 0;
    for (const sub of ['json', 'files', 'png']) {
      const d = join(this.dir, sub);
      if (!existsSync(d)) continue;
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        const st = statSync(p);
        total += st.size;
        all.push({ p, size: st.size, at: st.atimeMs || st.mtimeMs });
      }
    }
    if (total <= this.limit) return 0;
    all.sort((a, b) => a.at - b.at);
    let freed = 0;
    for (const f of all) {
      if (total - freed <= this.limit * 0.9) break;
      rmSync(f.p, { force: true });
      freed += f.size;
    }
    return freed;
  }
}

/**
 * Converts any picture to the renderer's PNG (≤ maxPx on the long side) and
 * a 256 px JPEG thumbnail. Cached by the input file's hash. Returns {png,
 * thumb, w, h} or null when FFmpeg cannot read it.
 */
export function preparePicture(file, { ffmpeg = 'ffmpeg', cache, maxPx = 1280 } = {}) {
  const key = sha(readFileSync(file));
  const dir = join(cache?.dir ?? join(file, '..'), 'png');
  mkdirSync(dir, { recursive: true });
  const png = join(dir, `${key}.png`);
  const thumb = join(dir, `${key}.thumb.jpg`);
  const scale = (px) => `scale='if(gt(iw,ih),min(${px},iw),-2)':'if(gt(iw,ih),-2,min(${px},ih))'`;
  if (!existsSync(png)) {
    const r = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', file, '-frames:v', '1', '-vf', `${scale(maxPx)},format=rgba`, '-f', 'image2', '-c:v', 'png', png], { windowsHide: true });
    if (r.status !== 0 || !existsSync(png)) return null;
  }
  if (!existsSync(thumb)) spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', png, '-frames:v', '1', '-vf', `${scale(256)},format=yuvj420p`, '-q:v', '5', thumb], { windowsHide: true });
  const probe = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', '-i', png], { encoding: 'utf8', windowsHide: true });
  const m = /, (\d{2,5})x(\d{2,5})/.exec(probe.stderr ?? '');
  return { png, thumb: existsSync(thumb) ? thumb : null, w: m ? Number(m[1]) : null, h: m ? Number(m[2]) : null };
}

/** data:image/jpeg URL of a thumbnail (for the vision pass). */
export const thumbDataUrl = (thumb) => (thumb && existsSync(thumb) ? `data:image/jpeg;base64,${readFileSync(thumb).toString('base64')}` : null);

/** Human licence name: cc0 → CC0, by + 4.0 → CC BY 4.0, pdm → Public Domain. */
export function licenceName(lic, version) {
  const l = String(lic ?? '').toLowerCase();
  if (!l) return '';
  if (l === 'cc0') return 'CC0';
  if (l === 'pdm' || l === 'pd') return 'Public Domain';
  return `CC ${l.toUpperCase()}${version ? ` ${version}` : ''}`;
}
const SOURCE_NAME = { openverse: 'Openverse', wikimedia: 'Wikimedia Commons' };

/** One line of credit for a fetched asset ("Jane Doe, CC BY 2.0 (Openverse)"). */
export function creditLine(a) {
  if (!a || a.source === 'library') return '';
  if (a.source === 'ai') return 'AI image';
  if (a.source === 'screenshot') return `Screenshot: ${a.host ?? a.title ?? ''}`.trim();
  const lic = licenceName(a.license, a.license_version);
  return `${a.creator || 'unknown author'}${lic ? `, ${lic}` : ''}${SOURCE_NAME[a.source] ? ` (${SOURCE_NAME[a.source]})` : ''}`;
}

/** Does a licence require on-screen / description attribution? */
export const needsCredit = (lic) => String(lic ?? '').toLowerCase().startsWith('by');

/**
 * ATTRIBUTIONS.txt text for an export: every fetched asset with licence and
 * source, the bundled data that asks for credit (map data, icon sets) when
 * used, and the SFX note. Also usable as a YouTube description block.
 */
export function attributionsText(records = [], { title = 'kimo video' } = {}) {
  const lines = [`Credits for "${title}"`, ''];
  const seen = new Set();
  for (const a of records) {
    const k = `${a.source}|${a.url ?? a.title ?? a.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (a.text) {
      lines.push(`- ${a.text}`);
      continue;
    }
    const lic = licenceName(a.license, a.license_version) || 'licence unknown';
    lines.push(`- ${a.title ? `"${a.title}"` : 'Image'} by ${a.creator ?? 'unknown author'}, ${lic}${a.license_url ? ` (${a.license_url})` : ''}${a.landing ? `, ${a.landing}` : a.url ? `, ${a.url}` : ''}${a.source === 'ai' ? ' — AI-generated' : ''}`);
  }
  if (lines.length === 2) lines.push('- No third-party assets that need credit.');
  lines.push('', 'Edited with kimo (https://getkimo.tech).');
  return `${lines.join('\n')}\n`;
}
