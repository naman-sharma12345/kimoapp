// Screenshots of things the speaker names (websites, repos, posts, apps):
// Electron's hidden offscreen BrowserWindow (webContents.capturePage) for a
// public https URL the speaker says or the user pastes. The capture host is
// registered by main.cjs; outside the app (tests, bench) there is none and
// the beat falls back to a re-typeset card or an icon.
import { sha } from '../assets.mjs';

export const name = 'screenshot';
let HOST = null;
/** main.cjs registers {capture(url, {w, h}) → Promise<Buffer PNG>}. */
export const setScreenshotHost = (h) => (HOST = h);
export const screenshotHost = () => HOST;

/** Only public https URLs (no localhost / private ranges / file:). */
export function publicUrl(raw) {
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.protocol = 'https:';
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || /^\[|::/.test(h) || h.endsWith('.local') || h.endsWith('.internal')) return null;
  return u.toString();
}

/** search(url) → one candidate (the capture happens on fetch). */
export function search(raw) {
  const url = publicUrl(raw);
  return url ? [{ source: name, url, title: new URL(url).hostname, host: new URL(url).hostname, license: 'screenshot', creator: new URL(url).hostname }] : [];
}

/** Captures (cached by URL) → local PNG path, or null without a host. */
export async function capture(cand, { cache, w = 1280, h = 800 }) {
  const key = sha({ shot: cand.url, w, h });
  const hit = cache.hasFile(key);
  if (hit) return hit;
  if (!HOST) return null;
  cache.stats.network++;
  const png = await HOST.capture(cand.url, { w, h });
  return png?.length ? cache.putFile(key, png) : null;
}
