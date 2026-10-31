// The user's own assets first: the project's assets/ folder, files dropped
// on the project, and the global "My assets" folder (logos, saved memes,
// screenshots, photos). Matched by file name and a cached one-line vision
// caption (the proxy's `describe` kind, owner sign-in or BYOK only). Never
// leaves the PC except as a 256 px thumbnail for that caption.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { sha } from '../assets.mjs';

export const name = 'library';
const PICTURE = /\.(png|jpe?g|webp|gif)$/i;
const words = (s) => String(s ?? '').toLowerCase().replace(/[_\-.]+/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

/** Lists pictures in the folders (not recursive beyond one level). */
export function listLibrary(dirs = []) {
  const out = [];
  for (const d of dirs) {
    if (!d || !existsSync(d)) continue;
    const walk = (dir, depth) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        const st = statSync(p);
        if (st.isDirectory() && depth < 1) walk(p, depth + 1);
        else if (st.isFile() && PICTURE.test(n) && st.size < 30 * 1024 * 1024) out.push({ path: p, name: basename(n, extname(n)), size: st.size });
      }
    };
    walk(d, 0);
  }
  return out.slice(0, 400);
}

/**
 * Captions the library once (cached by file hash) through describe(text,
 * images) when given; returns [{path, name, caption, safe}].
 */
export async function captionLibrary(items, { cache, describe, thumbOf }) {
  const out = [];
  const todo = [];
  for (const it of items) {
    const key = sha({ lib: it.path, size: it.size });
    const hit = cache.getJson(key);
    if (hit) out.push({ ...it, ...hit });
    else todo.push({ ...it, key });
  }
  if (describe && todo.length) {
    for (let i = 0; i < todo.length; i += 12) {
      const chunk = todo.slice(i, i + 12).map((it) => ({ it, url: thumbOf(it.path) })).filter((x) => x.url);
      if (!chunk.length) continue;
      const rec = await describe('caption these images', chunk.map((x, k) => ({ label: `L${i + k + 1} ${x.it.name}`.slice(0, 80), url: x.url }))).catch(() => null);
      for (const [k, x] of chunk.entries()) {
        const c = (rec?.captions ?? []).find((y) => String(y.label ?? '').startsWith(`L${i + k + 1} `)) ?? rec?.captions?.[k];
        const v = { caption: String(c?.caption ?? '').slice(0, 120), safe: c?.safe !== false };
        cache.putJson(x.it.key, v);
        out.push({ ...x.it, ...v });
      }
    }
  }
  for (const it of todo) if (!out.some((o) => o.path === it.path)) out.push({ ...it, caption: '', safe: true });
  return out;
}

/** Word-overlap score of a query against a library item (name + caption). */
export function score(query, item) {
  const q = new Set(words(query));
  if (!q.size) return 0;
  const hay = new Set([...words(item.name), ...words(item.caption)]);
  let n = 0;
  for (const w of q) if (hay.has(w) || hay.has(w.replace(/s$/, ''))) n++;
  return n / q.size;
}

/** search(query, {library}) → the best user assets as candidates. */
export function search(query, { library = [], limit = 3 } = {}) {
  return library
    .filter((x) => x.safe !== false)
    .map((x) => ({ x, s: score(query, x) }))
    .filter((r) => r.s >= 0.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ x }) => ({ source: name, path: x.path, title: x.name, caption: x.caption, license: 'own', creator: 'you' }));
}
