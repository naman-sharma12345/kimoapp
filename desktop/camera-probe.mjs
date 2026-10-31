// Measurements the camera director reads (Phase 4): where the head is (SAM
// track when one is cached, else a motion heuristic, else centre) and where
// the action is on screen recordings. Local FFmpeg only: tiny grey frames, no
// network, no paid calls. Every result is cached by file signature.
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnBackground as spawn } from './resources.cjs';

const PROBE_W = 96;

/** Grey frames of [from, to) at `fps`, `w` px wide: {frames: Uint8Array[], w, h}. */
export function greyFrames(ffmpeg, input, { from = 0, to, fps = 3, w = PROBE_W, aspect, signal, max = 240 } = {}) {
  const h = Math.max(8, Math.round(w / (aspect || 16 / 9) / 2) * 2);
  return new Promise((done) => {
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', Math.max(0, from).toFixed(3), ...(to > from ? ['-t', (to - from).toFixed(3)] : []), '-i', input, '-an', '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, '-frames:v', String(max), '-f', 'rawvideo', 'pipe:1'];
    let child;
    try {
      child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], signal });
    } catch {
      return done(null);
    }
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', () => done(null));
    child.on('exit', () => {
      const b = Buffer.concat(chunks);
      const n = Math.floor(b.length / (w * h));
      const frames = Array.from({ length: n }, (_, i) => new Uint8Array(b.buffer, b.byteOffset + i * w * h, w * h));
      done(n ? { frames, w, h, fps } : null);
    });
  });
}

/**
 * Head heuristic from motion: people move their head and mouth while the room
 * stays still. Per window of frame differences, the top of the moving region
 * is the head top, the moving columns in the band below it are the head, the
 * whole moving region is the body. Gaze = head offset from the body centre.
 * Returns a head track {fps, cx[], eyes[], top[], chin[], gaze[], source} or
 * null when the motion is too weak or too spread out to trust.
 */
export function headTrackFromFrames({ frames, w, h, fps }, { window = 2 } = {}) {
  if (!frames || frames.length < 3) return null;
  const per = Math.max(2, Math.round(window * fps));
  const out = { cx: [], eyes: [], top: [], chin: [], gaze: [] };
  let trusted = 0;
  const windows = Math.max(1, Math.floor((frames.length - 1) / per));
  for (let k = 0; k < windows; k++) {
    const acc = new Float32Array(w * h);
    for (let i = k * per + 1; i <= Math.min(frames.length - 1, (k + 1) * per); i++) {
      const a = frames[i - 1];
      const b = frames[i];
      for (let p = 0; p < w * h; p++) acc[p] += Math.abs(a[p] - b[p]);
    }
    const sorted = Float32Array.from(acc).sort();
    const thr = Math.max(sorted[Math.floor(sorted.length * 0.5)] * 3 + 1, 6 * per, sorted[sorted.length - 1] * 0.2);
    const rows = new Float32Array(h);
    const cols = new Float32Array(w);
    let total = 0;
    let mx = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = acc[y * w + x] > thr ? 1 : 0;
        rows[y] += v;
        cols[x] += v;
        total += v;
        if (v) mx += x;
      }
    const frac = total / (w * h);
    if (frac < 0.004 || frac > 0.35) {
      out.cx.push(NaN);
      continue;
    }
    const rmax = Math.max(...rows);
    let top = rows.findIndex((r) => r >= rmax * 0.25);
    if (top < 0) top = 0;
    const band = Math.max(2, Math.round(h * 0.18));
    let sx = 0;
    let n = 0;
    let x0 = w;
    let x1 = 0;
    for (let y = top; y < Math.min(h, top + band); y++)
      for (let x = 0; x < w; x++)
        if (acc[y * w + x] > thr) {
          sx += x;
          n++;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
    if (n < 3 || (x1 - x0) / w > 0.5 || top / h > 0.6) {
      out.cx.push(NaN);
      continue;
    }
    const headW = (x1 - x0 + 1) / w;
    const headH = Math.min(0.55, (headW * w * 1.3) / h);
    const cx = sx / n / w;
    const body = mx / total / w;
    // one person: a head-sized blob above a body roughly under it, not frame-wide motion
    if (headW > 0.35 || headW < 0.03 || Math.abs(cx - body) > 0.15 || cx < 0.08 || cx > 0.92 || top / h + headH * 0.45 > 0.62) {
      out.cx.push(NaN);
      continue;
    }
    out.cx.push(cx);
    out.top.push(top / h);
    out.eyes.push(top / h + headH * 0.45);
    out.chin.push(top / h + headH);
    out.gaze.push(Math.max(-1, Math.min(1, (cx - body) / 0.08)) * (Math.abs(cx - body) > 0.02 ? 1 : 0));
    trusted++;
  }
  if (trusted < Math.max(1, Math.ceil(windows * 0.5))) return null;
  // fill untrusted windows from neighbours
  const fill = (arr) => {
    let last = arr.find((v) => Number.isFinite(v));
    return arr.map((v) => (Number.isFinite(v) ? (last = v) : last));
  };
  const cx = fill(out.cx);
  const idx = out.cx.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
  const spread = (k) => idx.map((_, j) => out[k][j]);
  const expand = (k) => {
    const vals = spread(k);
    let j = 0;
    return out.cx.map((v) => (Number.isFinite(v) ? vals[j++] : vals[Math.max(0, j - 1)] ?? vals[0]));
  };
  return { fps: 1 / window, cx, eyes: expand('eyes'), top: expand('top'), chin: expand('chin'), gaze: expand('gaze'), source: 'heuristic', t0: window / 2 };
}

/** Head track from cached SAM person tracks (tracksOf format), normalised source coords. */
export function headTrackFromSam(tracks, step = 3) {
  const o = tracks?.objects?.get?.(tracks.main);
  if (!o) return null;
  const cx = [];
  const top = [];
  const eyes = [];
  const chin = [];
  for (let f = 0; f < tracks.frames; f += step) {
    const b = o.frames.get(f)?.box;
    if (!b) {
      cx.push(NaN);
      continue;
    }
    const bw = (b.right - b.left) / tracks.width;
    const bh = (b.bottom - b.top) / tracks.height;
    const headH = Math.min(bw * 0.55 * (tracks.width / tracks.height), bh * 0.4);
    cx.push((b.left + b.right) / 2 / tracks.width);
    top.push(b.top / tracks.height);
    eyes.push(b.top / tracks.height + headH * 0.45);
    chin.push(b.top / tracks.height + headH);
  }
  if (!top.length) return null;
  let last = cx.find(Number.isFinite);
  const filled = cx.map((v) => (Number.isFinite(v) ? (last = v) : last));
  const at = (arr) => {
    let j = 0;
    let prev = arr[0];
    return cx.map((v) => (Number.isFinite(v) ? (prev = arr[j++]) : prev));
  };
  return { fps: (tracks.fps || 12) / step, cx: filled, top: at(top), eyes: at(eyes), chin: at(chin), gaze: filled.map(() => 0), source: 'sam' };
}

/**
 * Active region of a screen recording per window: the bounding box (5–95 %
 * percentiles) of changed pixels between frames. Windows where nothing or
 * nearly everything changed (scrolls, slide changes) are skipped.
 */
export function activeRegions({ frames, w, h, fps }, { window = 1, from = 0 } = {}) {
  const per = Math.max(1, Math.round(window * fps));
  const out = [];
  for (let k = 0; k * per + 1 < frames.length; k++) {
    const xs = [];
    const ys = [];
    for (let i = k * per + 1; i <= Math.min(frames.length - 1, (k + 1) * per); i++) {
      const a = frames[i - 1];
      const b = frames[i];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (Math.abs(a[y * w + x] - b[y * w + x]) > 24) {
            xs.push(x);
            ys.push(y);
          }
    }
    const frac = xs.length / (w * h * per);
    if (frac < 0.0008 || frac > 0.45) continue;
    xs.sort((p, q) => p - q);
    ys.sort((p, q) => p - q);
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
    const x0 = q(xs, 0.05) / w;
    const x1 = (q(xs, 0.95) + 1) / w;
    const y0 = q(ys, 0.05) / h;
    const y1 = (q(ys, 0.95) + 1) / h;
    const pad = 0.04;
    const box = { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: Math.min(1, x1 - x0 + 2 * pad), h: Math.min(1, y1 - y0 + 2 * pad) };
    if (box.w > 0.8 && box.h > 0.8) continue;
    const t0 = from + (k * per) / fps;
    const last = out.at(-1);
    // merge neighbouring windows that look at the same place
    if (last && Math.abs(last.t1 - t0) < 1e-6 && Math.abs(last.box.x + last.box.w / 2 - (box.x + box.w / 2)) < 0.08 && Math.abs(last.box.y + last.box.h / 2 - (box.y + box.h / 2)) < 0.08) last.t1 = t0 + per / fps;
    else out.push({ t0, t1: t0 + per / fps, box });
  }
  return out;
}

const signature = (path) => {
  try {
    const st = statSync(path);
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return 'missing';
  }
};
function cached(cacheDir, kind, key, fn) {
  const file = cacheDir ? join(cacheDir, 'camera', `${kind}-${createHash('sha1').update(key).digest('hex').slice(0, 16)}.json`) : null;
  if (file && existsSync(file))
    try {
      return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      /* re-measure */
    }
  return Promise.resolve(fn()).then((v) => {
    if (file && v !== undefined)
      try {
        mkdirSync(join(cacheDir, 'camera'), { recursive: true });
        writeFileSync(file, JSON.stringify(v));
      } catch {
        /* cache is optional */
      }
    return v;
  });
}

/** Head track for one source file: SAM track if supplied, else the motion heuristic, else null (centre). */
export async function headTrack({ ffmpeg, file, samTracks, cacheDir, signal }) {
  if (samTracks) {
    const t = headTrackFromSam(samTracks);
    if (t) return t;
  }
  if (!(file?.width > 0 && file?.height > 0) || !(file.duration > 0)) return null;
  const rotated = Math.abs(file.rotation ?? 0) % 180 === 90;
  const aspect = rotated ? file.height / file.width : file.width / file.height;
  const seconds = Math.min(file.duration, 120);
  return cached(cacheDir, 'head', JSON.stringify([file.path, signature(file.path), seconds, 1]), async () => {
    const g = await greyFrames(ffmpeg, file.path, { from: 0, to: seconds, fps: 3, aspect, signal, max: 360 });
    return g ? headTrackFromFrames(g) : null;
  });
}

/** Active screen regions per screen-recording clip, clip-local seconds. */
export async function screenRegions({ ffmpeg, clips, cacheDir, signal }) {
  const out = {};
  for (const c of clips) {
    if (!(c.out > c.in)) continue;
    const aspect = c.width > 0 && c.height > 0 ? c.width / c.height : 16 / 9;
    const regions = await cached(cacheDir, 'screen', JSON.stringify([c.path, signature(c.path), c.in, c.out, 1]), async () => {
      const g = await greyFrames(ffmpeg, c.path, { from: c.in, to: c.out, fps: 4, w: 160, aspect, signal, max: 600 });
      return g ? activeRegions(g, { from: 0 }) : [];
    });
    out[c.clip_id] = (regions ?? []).map((r) => ({ ...r, t0: r.t0 / (c.speed ?? 1), t1: r.t1 / (c.speed ?? 1) }));
  }
  return out;
}
