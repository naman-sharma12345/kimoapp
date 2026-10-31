// Opt-in AI illustration (off by default): one image from the proxy's
// /v1/desktop/image route, which answers only an owner token or the user's
// own OpenAI-compatible key (BYOK never falls back to kimo's key). Hard cap
// per video (default 3) and per month (default 30), cached forever by prompt
// hash, shown in the UI and credits as "AI image".
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_BASE, aiHeaders, proxyError } from '../../kimo-auth.mjs';
import { sha } from '../assets.mjs';

export const name = 'ai';
export const PER_VIDEO = 3;
export const PER_MONTH = 30;

function monthLedger(cache) {
  const file = join(cache.dir, 'ai-images.json');
  const month = new Date().toISOString().slice(0, 7);
  let led = { month, count: 0 };
  try {
    if (existsSync(file)) led = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    /* fresh */
  }
  if (led.month !== month) led = { month, count: 0 };
  return { led, save: () => writeFileSync(file, JSON.stringify(led)) };
}

/** Generates (or reuses) one illustration. budget: {used} per video. Returns a local PNG path or null. */
export async function generate(prompt, { cache, style = 'clean flat editorial illustration', budget, signal, fetch: f = (...a) => fetch(...a), perVideo = PER_VIDEO, perMonth = PER_MONTH }) {
  const p = String(prompt ?? '').trim().slice(0, 600);
  if (p.length < 3) return null;
  const key = sha({ ai: p, style });
  const hit = cache.hasFile(key);
  if (hit) return hit;
  if ((budget?.used ?? 0) >= perVideo) return null;
  const { led, save } = monthLedger(cache);
  if (led.count >= perMonth) return null;
  const headers = { 'Content-Type': 'application/json', ...(await aiHeaders()) };
  cache.stats.network++;
  const r = await f(`${API_BASE}/v1/desktop/image`, { method: 'POST', headers, body: JSON.stringify({ prompt: p, style }), signal });
  if (!r.ok) throw await proxyError(r, 'kimo AI images');
  const body = await r.json();
  const m = /^data:image\/png;base64,(.+)$/.exec(body.image ?? '');
  if (!m) return null;
  if (budget) budget.used = (budget.used ?? 0) + 1;
  led.count++;
  save();
  return cache.putFile(key, Buffer.from(m[1], 'base64'));
}
