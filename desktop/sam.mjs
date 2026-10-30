// kimo desktop × Meta SAM 3.1 (Segment Anything): subject tracking, follow
// reframe + punch-ins, text behind the subject, background blur / colour /
// image / cutout, and object blur. Only a downscaled (≤720p, silent) copy of
// the clip segment being processed goes to the kimo proxy (which holds the
// Meta key); masks come back and every pixel of the real render is made here
// with the bundled FFmpeg.
import { spawnBackground as spawn, execFileBackground as execFile } from './resources.cjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { decodeMaskToRaster, parseImageStream, parseVideoStream } from '@meta-sam/parser';

export const SAM_URL =
  process.env.KIMO_SAM_URL || (process.env.KIMO_AI_URL || 'https://api.getkimo.tech/v1/desktop/ai').replace(/\/ai$/, '/sam');
/** Longest segment sent per request (seconds); longer clips are trimmed to it. */
export const SAM_MAX_SECONDS = 60;
/** Shake limit (px per frame at 1080 px) for the SAM render's own check. */
export const SAM_JITTER_MAX = 2;
export const SAM_EFFECTS = ['reframe', 'text_behind', 'bg_blur', 'bg_color', 'bg_image', 'cutout', 'redact'];
const ASPECTS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] };

const run = (bin, args, { timeout = 15 * 60_000, signal, cwd } = {}) =>
  new Promise((done, fail) => {
    const child = spawn(bin, ['-nostdin', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'));
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-3000)));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('exit', (code) => {
      clearTimeout(timer);
      code === 0 ? done() : fail(new Error(`ffmpeg: ${err.split(/\r?\n/).filter((l) => l.trim() && !/Task finished|Terminating thread|Nothing was written|received no packets/.test(l)).join(' | ')}`.slice(0, 900)));
    });
  });
const probeJson = (ffprobe, path) =>
  new Promise((done) =>
    execFile(ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_packets:stream_side_data=rotation:format=duration', '-of', 'json', path],
      { windowsHide: true, timeout: 60_000 }, (err, out) => {
        if (err) return done(null);
        try {
          const j = JSON.parse(out);
          const s = j.streams?.[0] ?? {};
          // phones write variable frame rate: when r_frame_rate is far above the average rate, use the average
          const fr = (x) => String(x ?? '').split('/').map(Number);
          let [a, b] = fr(s.r_frame_rate || '30/1');
          const [aa, ab] = fr(s.avg_frame_rate);
          if (aa && ab && b && a / b > (aa / ab) * 1.5) [a, b] = [aa, ab];
          done({ width: s.width, height: s.height, rate: b ? `${a}/${b}` : String(a), fps: b ? a / b : a, frames: Number(s.nb_read_packets) || 0, duration: Number(j.format?.duration) || 0 });
        } catch {
          done(null);
        }
      }));

async function call(path, init, signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    try {
      r = await fetch(`${SAM_URL}${path}`, { ...init, headers: { 'X-Kimo-Desktop': '1', ...init.headers }, signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)].filter(Boolean)) });
    } catch (e) {
      if (signal?.aborted) throw new Error('cancelled');
      if (attempt === 2) throw new Error(`can't reach kimo SAM (${e.message}); check your internet`);
      continue;
    }
    if (r.ok) return r;
    const body = await r.json().catch(() => ({}));
    const message = body?.error?.message || `kimo SAM answered ${r.status}`;
    if (r.status < 500 || attempt === 2) throw new Error(message);
    await new Promise((res) => setTimeout(res, 2500 * (attempt + 1)));
  }
  throw new Error('kimo SAM is unavailable');
}

/** Server-sent events → the event objects @meta-sam/parser reads. */
async function* sseEvents(body, onDelta) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      let ev;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'response.output_text.delta') onDelta?.(ev.delta);
      yield ev;
    }
    if (done) break;
  }
}

/** Downscaled, silent, faststart H.264 copy of [start, start+duration) for SAM. */
export async function makeProxy({ ffmpeg, ffprobe, input, start = 0, duration, fps, out, signal }) {
  const vf = [`fps=${fps}`, "scale='trunc(min(1280,iw*min(1,720/ih))/2)*2':-2"].join(',');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', input, '-t', String(duration), '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { signal });
  const p = await probeJson(ffprobe, out);
  if (!p?.frames) throw new Error('could not make the SAM proxy clip');
  return { ...p, path: out, bytes: statSync(out).size };
}

/** Segments a proxy clip by a noun phrase. Returns per-object tracks (proxy pixels). */
export async function segmentVideo({ proxy, prompt, signal, onProgress }) {
  const up = await (await call('/file', { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: readFileSync(proxy.path) }, signal)).json();
  try {
    const r = await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, file_id: up.file_id, frames: proxy.frames }) }, signal);
    let lines = 0;
    const parsed = parseVideoStream(sseEvents(r.body, (d) => {
      lines += (String(d).match(/<\d+f>/g) ?? []).length;
      onProgress?.(Math.min(1, lines / proxy.frames));
    }));
    const result = await parsed.finalResult;
    return { ...tracksOf(result.records, proxy), fileBytes: up.bytes, billedFrames: Math.max(50, proxy.frames) };
  } finally {
    call('/file/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: up.file_id }) }, null).catch(() => undefined);
  }
}

/** Segments one still (data URL) by a noun phrase: for the mask preview. */
export async function segmentImage({ image, prompt, width, height, signal }) {
  const r = await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, image }) }, signal);
  const result = await parseImageStream(sseEvents(r.body)).finalResult;
  return tracksOf(result.records, { width, height, frames: 1 });
}

/** Records → { objects: Map(id → { frames: Map(frame → {box, mask}) }) }. */
export function tracksOf(records, proxy) {
  const objects = new Map();
  for (const rec of records) {
    if (rec.kind !== 'mask') continue;
    const f = rec.frame?.frameIndex ?? 0;
    const o = objects.get(rec.objectId) ?? { id: rec.objectId, frames: new Map() };
    o.frames.set(f, { box: rec.bounds, mask: rec.mask });
    objects.set(rec.objectId, o);
  }
  const W = proxy.width;
  const H = proxy.height;
  // main subject: present longest, largest, nearest the centre
  let main = null;
  let best = -1;
  for (const o of objects.values()) {
    let score = 0;
    for (const { box } of o.frames.values()) {
      const area = ((box.right - box.left) * (box.bottom - box.top)) / (W * H);
      const cx = (box.left + box.right) / 2 / W;
      score += Math.sqrt(Math.max(0, area)) * (1 - 0.5 * Math.abs(cx - 0.5));
    }
    if (score > best) [best, main] = [score, o.id];
  }
  return { width: W, height: H, frames: proxy.frames, fps: proxy.fps, objects, main };
}

// ---- smooth camera ("gimbal") maths: everything is float, zero-phase and
// evaluated per output frame, so nothing is ever rounded to a whole pixel ----

/** Zero-phase Gaussian smoothing (edge-held), sigma in samples. */
export function gauss(x, sigma, odd = false) {
  if (!(sigma > 0.01) || x.length < 2) return x.slice();
  const r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-0.5 * ((i - r) / sigma) ** 2));
  const ks = k.reduce((s, v) => s + v, 0);
  const n = x.length;
  return x.map((_, i) => {
    let s = 0;
    for (let j = -r; j <= r; j++) {
      const q = i + j;
      // edge-held (camera holds) or odd-reflected (a steady pan stays steady: for measuring)
      s += k[j + r] * (q < 0 ? (odd ? 2 * x[0] - x[Math.min(n - 1, -q)] : x[0]) : q >= n ? (odd ? 2 * x[n - 1] - x[Math.max(0, 2 * (n - 1) - q)] : x[n - 1]) : x[q]);
    }
    return s / ks;
  });
}
const median = (x, r) => x.map((_, i) => x.slice(Math.max(0, i - r), i + r + 1).sort((a, b) => a - b)[Math.min(i, r, Math.floor((Math.min(x.length, i + r + 1) - Math.max(0, i - r)) / 2))]);
const clampAll = (x, lo, hi) => x.map((v) => Math.max(lo, Math.min(hi, v)));

/**
 * Gimbal-style camera path for one axis (any units), sampled at `fps`:
 * outlier-proof median → light smoothing → dead zone (the camera holds still
 * while the subject wanders inside it) → speed limit → heavy zero-phase
 * smoothing (eased starts and stops) → bounds → re-smoothed so a stop at a
 * frame edge is eased too.
 */
export function gimbalPath(target, { fps, dead, maxSpeed, lo, hi, sigma = 0.5 }) {
  const n = target.length;
  if (!n) return [];
  let s = gauss(median(target, Math.max(1, Math.round(fps * 0.08))), fps * 0.12);
  // dead zone, run forward and backward and averaged so the lag is symmetric
  const hold = (arr) => {
    const out = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      const d = arr[i] - out[i - 1];
      out.push(Math.abs(d) <= dead ? out[i - 1] : arr[i] - Math.sign(d) * dead);
    }
    return out;
  };
  const f = hold(s);
  const b = hold(s.slice().reverse()).reverse();
  s = f.map((v, i) => (v + b[i]) / 2);
  // speed limit (units per second)
  const vmax = maxSpeed / fps;
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.max(-vmax, Math.min(vmax, s[i] - s[i - 1]));
  s = clampAll(gauss(s, fps * sigma), lo, hi);
  return clampAll(gauss(s, fps * 0.2), lo, hi);
}

/** Subject centre per proxy frame (proxy pixels): cx, cy (upper third of the box), box height; gaps held. */
export function subjectPath(tracks, id = tracks.main) {
  const o = tracks.objects.get(id);
  const n = tracks.frames;
  const raw = Array.from({ length: n }, (_, f) => {
    const b = o?.frames.get(f)?.box;
    return b ? { cx: (b.left + b.right) / 2, cy: b.top + (b.bottom - b.top) * 0.3, h: b.bottom - b.top } : null;
  });
  let last = raw.find(Boolean) ?? { cx: tracks.width / 2, cy: tracks.height / 2, h: tracks.height };
  const filled = raw.map((p) => (p ? (last = p) : last));
  return { cx: filled.map((p) => p.cx), cy: filled.map((p) => p.cy), h: filled.map((p) => p.h), seen: raw.filter(Boolean).length };
}

/** Value of a per-sample series at fractional index `x` (Catmull-Rom, C1-smooth). */
export function sampleAt(series, x) {
  const n = series.length;
  const i = Math.max(0, Math.min(n - 1, Math.floor(x)));
  const u = Math.max(0, Math.min(1, x - i));
  const p = (j) => series[Math.max(0, Math.min(n - 1, j))];
  const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

/** Piecewise-cubic Catmull-Rom through every `step`-th sample (the last sample is always a knot). */
function spline(series, step) {
  const n = series.length;
  const knots = [];
  for (let i = 0; i < n; i += step) knots.push(i);
  if (knots.at(-1) !== n - 1) knots.push(n - 1);
  const K = knots.map((f) => series[f]);
  const p = (j) => K[Math.max(0, Math.min(K.length - 1, j))];
  const segs = [];
  for (let s = 0; s + 1 < knots.length; s++) {
    const [p0, p1, p2, p3] = [p(s - 1), p(s), p(s + 1), p(s + 2)];
    segs.push({ a: knots[s], len: knots[s + 1] - knots[s], c: [p1, 0.5 * (p2 - p0), 0.5 * (2 * p0 - 5 * p1 + 4 * p2 - p3), 0.5 * (-p0 + 3 * p1 - 3 * p2 + p3)].map((x) => +x.toFixed(4)) });
  }
  return segs;
}
const evalSeg = ({ a, len, c }, f) => {
  const u = (f - a) / len;
  return c[0] + u * (c[1] + u * (c[2] + u * c[3]));
};

/**
 * Per-frame series → FFmpeg expression of the frame index `v`: piecewise cubic
 * through keys every few frames, no rounding anywhere. Keys get sparser only
 * while the curve stays within `tol` px of the exact series.
 */
export function splineExpr(series, v = 'in', tol = 0.05) {
  const n = series.length;
  if (n === 1 || series.every((x) => Math.abs(x - series[0]) < 1e-3)) return series[0].toFixed(3);
  let segs = null;
  for (const s of [12, 8, 6, 4, 3, 2, 1]) {
    segs = spline(series, s);
    let worst = 0;
    for (const g of segs) for (let f = g.a; f <= g.a + g.len; f++) worst = Math.max(worst, Math.abs(evalSeg(g, f) - series[f]));
    if (worst <= tol) break;
  }
  // balanced if() tree on the frame index: FFmpeg's expression parser refuses
  // long a+b+c chains (~100 terms), and if() only evaluates the branch taken
  const poly = (g, last) => {
    const u = last ? `min(1,(${v}-${g.a})/${g.len})` : `(${v}-${g.a})/${g.len}`;
    return `${g.c[0]}+${u}*(${g.c[1]}+${u}*(${g.c[2]}+${u}*${g.c[3]}))`;
  };
  const tree = (lo, hi) => {
    if (hi - lo === 1) return poly(segs[lo], hi === segs.length);
    const mid = (lo + hi) >> 1;
    return `if(lt(${v},${segs[mid].a}),${tree(lo, mid)},${tree(mid, hi)})`;
  };
  return tree(0, segs.length);
}

/** Smootherstep 0→1. */
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
/** Punch-in envelope at time t: eases in and out instead of jumping. */
export function zoomAt(t, punches) {
  let z = 1;
  for (const p of punches) {
    const ramp = Math.min(0.45, (p.end - p.start) / 3);
    const e = ease((t - p.start) / ramp) * ease((p.end - t) / ramp);
    z = Math.max(z, 1 + (p.zoom - 1) * e);
  }
  return z;
}

/**
 * Exact (float) source rectangle per output frame for the follow-reframe plus
 * punch-ins: [x, y, w, h] in source pixels.
 */
export function cameraRects({ tracks, path, src, cw, ch, frames, fps, punches, duration, strong = false }) {
  const k = src.width / tracks.width;
  const tf = tracks.fps || fps;
  // subject path resampled to output frames (smooth spline, not steps)
  const at = (series, f) => sampleAt(series, Math.min(series.length - 1, (f / fps) * tf)) * k;
  const sx = Array.from({ length: frames }, (_, f) => at(path.cx, f));
  const sy = Array.from({ length: frames }, (_, f) => at(path.cy, f));
  const camX = cw < src.width
    ? gimbalPath(sx.map((x) => x - cw / 2), { fps, dead: cw * (strong ? 0.1 : 0.06), maxSpeed: cw * (strong ? 0.45 : 0.7), lo: 0, hi: src.width - cw, sigma: strong ? 0.8 : 0.5 })
    : Array(frames).fill(0);
  const camY = ch < src.height
    ? gimbalPath(sy.map((y) => y - ch * 0.38), { fps, dead: ch * (strong ? 0.09 : 0.05), maxSpeed: ch * (strong ? 0.4 : 0.6), lo: 0, hi: src.height - ch, sigma: strong ? 0.8 : 0.5 })
    : Array(frames).fill(0);
  // where a punch-in is centred: the subject, followed smoothly (no dead zone)
  const ax = gauss(sx, fps * (strong ? 0.7 : 0.45));
  const ay = gauss(sy, fps * (strong ? 0.7 : 0.45));
  const rects = [];
  for (let f = 0; f < frames; f++) {
    const t = Math.min(duration, f / fps);
    const z = zoomAt(t, punches);
    const w = cw / z;
    const h = ch / z;
    const p = (z - 1) / Math.max(1e-6, Math.max(...punches.map((q) => q.zoom - 1), 1e-6));
    const cx = camX[f] + cw / 2 + (Math.max(camX[f] + w / 2, Math.min(camX[f] + cw - w / 2, ax[f])) - (camX[f] + cw / 2)) * p;
    const cy = camY[f] + ch / 2 + (Math.max(camY[f] + h / 2, Math.min(camY[f] + ch - h / 2, ay[f] + h * 0.12)) - (camY[f] + ch / 2)) * p;
    const x = Math.max(0, Math.min(src.width - w, cx - w / 2));
    const y = Math.max(0, Math.min(src.height - h, cy - h / 2));
    rects.push([x, y, w, h]);
  }
  return rects;
}

/** FFmpeg `perspective` filter that cuts the exact float rectangle per frame (bicubic, no pixel rounding). */
export function rectFilter(rects) {
  // perspective counts its first input frame as 1; EDL arrays start at 0.
  const L = splineExpr(rects.map((r) => r[0]), '(in-1)');
  const T = splineExpr(rects.map((r) => r[1]), '(in-1)');
  const R = splineExpr(rects.map((r) => r[0] + r[2]), '(in-1)');
  const B = splineExpr(rects.map((r) => r[1] + r[3]), '(in-1)');
  return `perspective=x0='${L}':y0='${T}':x1='${R}':y1='${T}':x2='${L}':y2='${B}':x3='${R}':y3='${B}':interpolation=cubic:sense=source:eval=frame`;
}

/**
 * Residual high-frequency motion of a rect path in output px per frame
 * (what the old integer path would show as shake; used by tests).
 */
export function pathJitter(rects, OW) {
  const cx = rects.map((r) => r[0] + r[2] / 2);
  const cy = rects.map((r) => r[1] + r[3] / 2);
  const fx = savgol7(cx);
  const fy = savgol7(cy);
  return Math.sqrt(rects.reduce((s, r, i) => s + ((cx[i] - fx[i]) ** 2 + (cy[i] - fy[i]) ** 2) * (OW / r[2]) ** 2, 0) / rects.length);
}

/** Writes the selected objects' masks as a lossless grey video at proxy size and fps. */
export function writeMaskVideo({ ffmpeg, tracks, ids, out, dilate = 0, soft = false, signal }) {
  const W = tracks.width;
  const H = tracks.height;
  /** Binary (0/1) mask of frame f; frames outside the clip hold the nearest one. */
  const binary = (f) => {
    const frame = new Uint8Array(W * H);
    f = Math.max(0, Math.min(tracks.frames - 1, f));
    for (const id of ids) {
      const rec = tracks.objects.get(id)?.frames.get(f);
      if (!rec) continue;
      const { box, mask } = rec;
      const raster = decodeMaskToRaster(mask);
      const mw = mask.width;
      for (let y = 0; y < mask.height; y++) {
        const fy = box.top + y;
        if (fy < 0 || fy >= H) continue;
        const row = fy * W;
        for (let x = 0; x < mw; x++) if (raster[y * mw + x]) {
          const fx = box.left + x;
          if (fx >= 0 && fx < W) frame[row + fx] = 1;
        }
      }
    }
    return frame;
  };
  return new Promise((done, fail) => {
    const vf = dilate ? ['-vf', Array(dilate).fill('dilation').join(',')] : [];
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-r', String(tracks.fps), '-i', 'pipe:0', ...vf, '-c:v', 'ffv1', '-pix_fmt', 'gray', out], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'));
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-1500)));
    child.on('exit', (code) => (code === 0 ? done(out) : fail(new Error(`mask video failed: ${err}`))));
    child.stdin.on('error', () => undefined);
    (async () => {
      // soft: centred 1-2-1 blend of neighbouring frames, so edges don't shimmer
      // frame to frame (no lag: the window looks one frame back and one ahead)
      let prev = soft ? binary(-1) : null;
      let cur = soft ? binary(0) : null;
      for (let f = 0; f < tracks.frames; f++) {
        const frame = Buffer.alloc(W * H);
        if (soft) {
          const next = binary(f + 1);
          for (let i = 0; i < frame.length; i++) frame[i] = Math.min(255, Math.round(((prev[i] + 2 * cur[i] + next[i]) * 255) / 4));
          prev = cur;
          cur = next;
        } else {
          const b = binary(f);
          for (let i = 0; i < frame.length; i++) frame[i] = b[i] * 255;
        }
        if (!child.stdin.write(frame)) await new Promise((r) => child.stdin.once('drain', r));
      }
      child.stdin.end();
    })().catch(fail);
  });
}

export function fontFor(fontsDir) {
  return [fontsDir && join(fontsDir, 'Anton-Regular.ttf'), fontsDir && join(fontsDir, 'BebasNeue-Regular.ttf'), 'C:/Windows/Fonts/impact.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
    .find((p) => p && existsSync(p));
}

/**
 * One SAM effect on one file: proxy → SAM → masks/track → FFmpeg render.
 * opts: { prompt, effect, aspect, text, color, image, punch, start, duration }
 */
export async function samEffect({ ffmpeg, ffprobe, input, dir, opts, fontsDir, signal, step }) {
  mkdirSync(dir, { recursive: true });
  const effect = SAM_EFFECTS.includes(opts.effect) ? opts.effect : 'reframe';
  const prompt = String(opts.prompt || (effect === 'redact' ? 'face' : 'person')).trim().slice(0, 80);
  const src = await probeJson(ffprobe, input);
  if (!src?.width) throw new Error('SAM effects need a video file');
  const start = Math.max(0, Number(opts.start) || 0);
  const duration = Math.min(SAM_MAX_SECONDS, Math.max(0.5, Number(opts.duration) || src.duration - start || 1));
  const needMask = effect !== 'reframe';
  // tracking alone needs only ~12 fps; masks follow the real frame rate (≤30)
  const fps = needMask ? Math.min(30, Math.round(src.fps) || 30) : 12;
  const proxy = await step('sam_proxy', `downscaled copy · ${duration.toFixed(1)} s at ${fps} fps`, () =>
    makeProxy({ ffmpeg, ffprobe, input, start, duration, fps, out: join(dir, 'sam-proxy.mp4'), signal }),
  (p) => `${p.width}x${p.height} · ${p.frames} frames · ${(p.bytes / 1e6).toFixed(1)} MB`);
  // tracks are cached per clip, segment, rate and object: trying another effect or text costs nothing
  const st = statSync(input);
  const key = createHash('sha1').update(JSON.stringify([input, st.size, st.mtimeMs, start, duration, fps, prompt.toLowerCase()])).digest('hex').slice(0, 16);
  const cacheFile = join(dir, `sam-tracks-${key}.json`);
  const cached = loadTracks(cacheFile);
  const tracks = await step('sam_track', `SAM 3.1 "${prompt}" · ${proxy.frames} frames${cached ? ' · cached' : ''}`, async (progress) => {
    if (cached) return cached;
    const t = await segmentVideo({ proxy, prompt, signal, onProgress: progress });
    saveTracks(cacheFile, t);
    return t;
  },
  (t) => `${t.objects.size} object${t.objects.size === 1 ? '' : 's'} · main #${t.main ?? '-'} seen on ${t.objects.get(t.main)?.frames.size ?? 0}/${t.frames} frames · ${t.cached ? 'no SAM cost (cached)' : `~$${(t.billedFrames * 0.0002).toFixed(3)}`}`);
  if (!tracks.objects.size) throw new Error(`SAM found no "${prompt}" in this clip; try another word`);
  const ids = effect === 'redact' ? [...tracks.objects.keys()] : [tracks.main];

  // ---- reframe window (source pixels) ----
  const [OW, OH] = (Array.isArray(opts.size) && opts.size.length === 2 ? opts.size.map((v) => Math.round(Number(v) / 2) * 2) : null) ?? ASPECTS[opts.aspect] ?? [src.width, src.height];
  const outAspect = OW / OH;
  const reframe = Math.abs(outAspect - src.width / src.height) > 0.02;
  let cw = src.width;
  let ch = src.height;
  if (reframe) {
    if (outAspect < src.width / src.height) cw = Math.floor((src.height * outAspect) / 2) * 2;
    else ch = Math.floor(src.width / outAspect / 2) * 2;
  }
  const path = subjectPath(tracks);
  // punch-ins: eased zoom moves centred on the subject inside the window
  const punches = (Array.isArray(opts.punch) ? opts.punch : opts.punch ? autoPunches(duration) : [])
    .map((p) => ({ start: Number(p.start), end: Number(p.end), zoom: Math.min(1.6, Math.max(1.05, Number(p.zoom) || 1.2)) }))
    .filter((p) => p.end > p.start);
  // constant frame rate at the source's own rate: no duplicated or dropped frames
  const rate = src.rate || String(src.fps || 30);
  const outFps = src.fps || 30;
  const frames = Math.max(1, Math.round(duration * outFps));
  const moves = reframe || punches.length > 0;
  const geometry = (strong) => {
    if (!moves) return { geo: `scale=${OW}:${OH}:flags=lanczos,setsar=1`, path: 0, rects: null };
    // one exact float rectangle per output frame, cut bicubically (no whole-pixel steps)
    const rects = cameraRects({ tracks, path, src, cw, ch, frames, fps: outFps, punches, duration, strong });
    return { geo: `${rectFilter(rects)},scale=${OW}:${OH}:flags=lanczos,setsar=1`, path: +pathJitter(rects, OW).toFixed(3), rects };
  };
  let G = geometry(false);

  // ---- graph ----
  let mask = null;
  if (needMask) {
    mask = await step('sam_mask', `masks → soft lossless matte (${tracks.width}x${tracks.height}, edge-smoothed over 3 frames)`, () =>
      writeMaskVideo({ ffmpeg, tracks, ids, out: join(dir, 'sam-matte.mkv'), dilate: effect === 'redact' ? 3 : 0, soft: true, signal }), () => 'matte ready');
  }
  const kmask = src.width / tracks.width;
  // a big upscale (a 9:16 window cut from small footage) gets a light lanczos-friendly unsharp so it isn't soft
  const upscale = OW / (G.rects ? Math.min(...G.rects.map((r) => r[2])) : src.width);
  const sharpen = upscale > 1.6 ? `,unsharp=5:5:${Math.min(0.8, 0.25 * upscale).toFixed(2)}:5:5:0` : '';
  // video and matte go through the identical float camera, so the cut-out never slides against the picture
  const head = (geo) => [
    `[0:v]setpts=PTS-STARTPTS,fps=${rate},format=yuv420p,${geo}${sharpen}[v]`,
    ...(mask ? [`[1:v]setpts=PTS-STARTPTS,fps=${rate},scale=${src.width}:${src.height}:flags=bicubic,format=gray,gblur=sigma=${Math.max(0.8, 0.9 * kmask).toFixed(2)},${geo},gblur=sigma=${effect === 'redact' ? 6 : 1}[m]`] : []),
  ];
  const g = [];
  const inputs = ['-ss', String(start), '-t', String(duration), '-i', input];
  if (mask) inputs.push('-i', mask);
  const extra = [];
  let outLabel = '[v]';
  let alpha = false;
  if (effect === 'text_behind') {
    const font = fontFor(fontsDir);
    const text = String(opts.text || 'KIMO').toUpperCase().slice(0, 40);
    writeFileSync(join(dir, 'sam-text.txt'), text);
    if (font) copyFileSync(font, join(dir, 'sam-font.ttf'));
    let fs = Math.round(Math.min(OH * 0.26, (OW * 0.9) / (0.58 * Math.max(3, text.length))));
    // placement: the title sits just above the subject's head, so the head overlaps only the lower part
    // of the letters and the word stays readable (a fixed 16% put it straight behind the head)
    let ty = Math.round(OH * 0.16);
    const head = headTops({ tracks, rects: G.rects, src, OH, frames, fps: outFps, from: Number(opts.text_start) || 0, to: Number(opts.text_end) || duration });
    if (opts.text_y != null) ty = Math.round(OH * Number(opts.text_y));
    else if (head != null) {
      // the head covers the lower ~45% of the letters: clearly behind, still readable
      const top = OH * 0.035;
      const fit = (head - top) / (ANTON_BOX * 0.55);
      fs = Math.round(Math.max(fs * 0.8, Math.min(fs, fit)));
      ty = Math.round(Math.max(top, head - fs * ANTON_BOX * 0.55));
    }
    const a = Number(opts.text_start) || 0;
    const b = Number(opts.text_end) || duration;
    g.push('[v]split[v1][v2]');
    g.push(`[v1]drawtext=textfile=sam-text.txt${font ? ':fontfile=sam-font.ttf' : ''}:fontsize=${fs}:fontcolor=${opts.color || 'white'}:x=(w-text_w)/2:y=${ty}:shadowcolor=black@0.35:shadowx=0:shadowy=${Math.round(fs / 30)}:alpha='min(1,max(0,(t-${a})/0.35))':enable='between(t,${a},${b})'[bg]`);
    g.push('[v2][m]alphamerge[fg]', '[bg][fg]overlay=format=auto,format=yuv420p[out]');
    outLabel = '[out]';
  } else if (effect === 'bg_blur' || effect === 'bg_color' || effect === 'bg_image') {
    g.push('[v]split[v1][v2]');
    if (effect === 'bg_blur') g.push(`[v1]gblur=sigma=${Math.round(Math.min(OW, OH) / 40)}[bg]`);
    else if (effect === 'bg_color') g.push(`[v1]drawbox=x=0:y=0:w=iw:h=ih:color=${/^#?[0-9a-f]{6}$/i.test(opts.color || '') ? `0x${opts.color.replace('#', '')}` : '0x111111'}@1:t=fill[bg]`);
    else {
      if (!opts.image || !existsSync(opts.image)) throw new Error('pick a background image');
      extra.push('-loop', '1', '-i', opts.image);
      g.push(`[2:v]scale=${OW}:${OH}:force_original_aspect_ratio=increase,crop=${OW}:${OH},setsar=1,format=yuv420p[img]`, '[v1][img]overlay=shortest=1[bg]');
    }
    g.push('[v2][m]alphamerge[fg]', '[bg][fg]overlay=format=auto,format=yuv420p[out]');
    outLabel = '[out]';
  } else if (effect === 'redact') {
    g.push('[v]split[v1][v2]', `[v1]gblur=sigma=${Math.round(Math.min(OW, OH) / 30)}[bl]`, '[bl][m]alphamerge[fg]', '[v2][fg]overlay=format=auto,format=yuv420p[out]');
    outLabel = '[out]';
  } else if (effect === 'cutout') {
    g.push('[v][m]alphamerge,format=yuva444p10le[out]');
    outLabel = '[out]';
    alpha = true;
  }
  const out = join(dir, `sam-${effect}${alpha ? '.mov' : '.mp4'}`);
  const script = join(dir, 'sam-graph.txt');
  const graph = (geo) => writeFileSync(script, [...head(geo), ...g].join(';\n'));
  const enc = alpha
    ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  if (effect === 'text_behind') writeFileSync(join(dir, 'sam-font-used.txt'), String(fontFor(fontsDir) ?? 'none (fontconfig default)'));
  const render = (geo, title) => {
    graph(geo);
    return step('sam_render', title, () =>
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, ...extra, '-/filter_complex', script, '-map', outLabel, '-map', '0:a?', ...enc, '-c:a', alpha ? 'pcm_s16le' : 'aac', '-b:a', '192k', '-shortest', out], { signal, cwd: dir }),
    () => `${(statSync(out).size / 1e6).toFixed(1)} MB · ${frames} frames CFR ${+outFps.toFixed(3)} fps${moves ? ` · float camera, path shake ${G.path} px/frame` : ''}`);
  };
  await render(G.geo, `${effect.replace('_', ' ')} · ${OW}x${OH}${punches.length ? ` · ${punches.length} eased punch-in${punches.length === 1 ? '' : 's'}` : ''}${reframe ? ' · gimbal follow' : ''}`);
  // measured camera smoothness of what was just rendered; one stronger-smoothing re-render when it shakes
  let motion = null;
  if (!alpha) {
    motion = await step('sam_qa', `measuring camera smoothness (shake px/frame, repeated frames)`, () => motionJitter(ffmpeg, out, { signal }),
      (q) => (q ? `shake ${q.jitter} px/frame (p95 ${q.p95}) · ${q.dup} repeated frames · limit ${SAM_JITTER_MAX}` : 'not measured'));
    if (motion && moves && (motion.jitter > SAM_JITTER_MAX || motion.dup > 1)) {
      G = geometry(true);
      await render(G.geo, `re-render with stronger gimbal smoothing (shake was ${motion.jitter} px/frame)`);
      motion = await step('sam_qa', 'measuring camera smoothness again', () => motionJitter(ffmpeg, out, { signal }),
        (q) => (q ? `shake ${q.jitter} px/frame (p95 ${q.p95}) · ${q.dup} repeated frames` : 'not measured'));
    }
  }
  return { output: out, width: OW, height: OH, duration, effect, prompt, tracks: { objects: tracks.objects.size, main: tracks.main, seen: path.seen, frames: tracks.frames, fps: tracks.fps }, billedFrames: tracks.cached ? 0 : tracks.billedFrames, punches, fps: outFps, motion, proxy: { width: proxy.width, height: proxy.height, bytes: proxy.bytes } };
}

function saveTracks(file, t) {
  const objects = [...t.objects.values()].map((o) => ({ id: o.id, frames: [...o.frames.entries()] }));
  try {
    writeFileSync(file, JSON.stringify({ ...t, objects }));
  } catch {
    /* cache is optional */
  }
}
function loadTracks(file) {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return { ...j, cached: true, objects: new Map(j.objects.map((o) => [o.id, { id: o.id, frames: new Map(o.frames) }])) };
  } catch {
    return null;
  }
}

/** drawtext box height / font size for the bundled display fonts (Anton). */
const ANTON_BOX = 1.2;

/**
 * Where the subject's head is in the output while the title shows: the median
 * of the matte's top edge, in output pixels.
 */
export function headTops({ tracks, rects, src, OH, frames, fps, from, to }) {
  const o = tracks.objects.get(tracks.main);
  if (!o) return null;
  const k = src.height / tracks.height;
  const tops = [];
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    if (t < from || t > to) continue;
    const b = o.frames.get(Math.min(tracks.frames - 1, Math.round(t * (tracks.fps || fps))))?.box;
    if (!b) continue;
    const r = rects?.[f] ?? [0, 0, src.width, src.height];
    tops.push(((b.top * k - r[1]) * OH) / r[3]);
  }
  if (tops.length < 3) return null;
  tops.sort((a, b) => a - b);
  return tops[Math.floor(tops.length * 0.5)];
}

/** Default punch-ins: in for ~1.6 s every ~4 s, starting after the hook. */
export function autoPunches(duration) {
  const out = [];
  for (let t = 2.2; t + 1.2 < duration; t += 4) out.push({ start: t, end: Math.min(duration, t + 1.6), zoom: 1.2 });
  return out;
}

/** JPEG preview of one frame with the SAM masks tinted on it (for the manual UI / op log). */
export async function maskPreview({ ffmpeg, ffprobe = 'ffprobe', input, time = 1, dir, prompt, signal }) {
  mkdirSync(dir, { recursive: true });
  const still = join(dir, 'sam-still.jpg');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', input, '-frames:v', '1', '-vf', "scale='trunc(min(1280,iw*min(1,720/ih))/2)*2':-2", '-q:v', '4', still], { signal });
  const sz = await new Promise((done) => execFile(ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', still], { windowsHide: true }, (err, out) => done(err ? null : out.trim().split(',').map(Number))));
  const [width, height] = sz ?? [1280, 720];
  const image = `data:image/jpeg;base64,${readFileSync(still).toString('base64')}`;
  const tracks = await segmentImage({ image, prompt, width, height, signal });
  const fake = { ...tracks, frames: 1, fps: 1 };
  const matte = join(dir, 'sam-still-matte.mkv');
  if (tracks.objects.size) await writeMaskVideo({ ffmpeg, tracks: fake, ids: [...tracks.objects.keys()], out: matte, signal });
  const tinted = join(dir, 'sam-still-masks.jpg');
  if (tracks.objects.size)
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', still, '-i', matte, '-filter_complex', '[0:v]format=rgb24,split[a][b];[b]colorchannelmixer=rr=0.2:gg=0.6:bb=1.6[c];[1:v]format=gray,geq=lum=\'p(X,Y)*0.6\'[m];[c][m]alphamerge[t];[a][t]overlay=format=auto', '-frames:v', '1', '-q:v', '4', tinted], { signal });
  const shown = existsSync(tinted) && tracks.objects.size ? tinted : still;
  return { image: `data:image/jpeg;base64,${readFileSync(shown).toString('base64')}`, objects: tracks.objects.size, boxes: [...tracks.objects.values()].map((o) => o.frames.get(0)?.box).filter(Boolean), width, height };
}

/** Local quadratic fit over 7 frames (Savitzky-Golay): smooth eases pass, frame-level shake is what's left. */
function savgol7(x) {
  const w = [-2, 3, 6, 7, 6, 3, -2].map((v) => v / 21);
  const n = x.length;
  const at = (q) => (q < 0 ? 2 * x[0] - x[Math.min(n - 1, -q)] : q >= n ? 2 * x[n - 1] - x[Math.max(0, 2 * (n - 1) - q)] : x[q]);
  return x.map((_, i) => w.reduce((s, c, j) => s + c * at(i + j - 3), 0));
}

/** Sub-pixel shift between two 1-D profiles (SAD minimum + parabola), in samples. */
function profileShift(a, b, max) {
  const n = a.length;
  const cost = [];
  for (let d = -max; d <= max; d++) {
    let s = 0;
    let c = 0;
    for (let i = Math.max(0, -d) + max; i < Math.min(n, n - d) - max; i++) (s += Math.abs(a[i] - b[i + d]), c++);
    cost.push(c ? s / c : Infinity);
  }
  let k = 0;
  for (let i = 1; i < cost.length; i++) if (cost[i] < cost[k]) k = i;
  let sub = 0;
  if (k > 0 && k < cost.length - 1) {
    const den = cost[k - 1] - 2 * cost[k] + cost[k + 1];
    if (den > 1e-9) sub = (0.5 * (cost[k - 1] - cost[k + 1])) / den;
  }
  return k - max + sub;
}

/**
 * Measured camera smoothness of a rendered file: per-frame global shift from
 * row/column intensity profiles (sub-pixel), the residual frame-to-frame shake
 * left after a 7-frame quadratic fit (px per frame, at the file's own size),
 * and frames that repeat the previous one while the picture is moving (judder
 * from frame-rate conversion). Robust to cuts: frames around a cut are skipped.
 */
export function motionJitter(ffmpeg, path, { signal, seconds = 90 } = {}) {
  const AW = 240;
  return new Promise((done) => {
    const child = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-t', String(seconds), '-i', path, '-an', '-vf', `scale=${AW}:-2:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'));
    let AH = 0;
    let buf = Buffer.alloc(0);
    let prev = null;
    const dx = [];
    const dy = [];
    const diff = [];
    const profiles = (f) => {
      const cols = new Float64Array(AW);
      const rows = new Float64Array(AH);
      for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
        const v = f[y * AW + x];
        cols[x] += v / AH;
        rows[y] += v / AW;
      }
      return { cols, rows, f };
    };
    const take = (p) => {
      if (prev) {
        let d = 0;
        for (let i = 0; i < p.f.length; i += 3) d += Math.abs(p.f[i] - prev.f[i]);
        diff.push((d * 3) / p.f.length);
        dx.push(profileShift(prev.cols, p.cols, 12));
        dy.push(profileShift(prev.rows, p.rows, 12));
      }
      prev = p;
    };
    // the output height comes from ffprobe-free maths: read the first frame size from the stream length later
    execFile(ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace('ffmpeg', 'ffprobe')), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path], { windowsHide: true }, (err, out) => {
      const [w, h] = String(out || '').trim().split(',').map(Number);
      AH = w && h ? Math.round((AW * h) / w / 2) * 2 : 0;
      if (!AH) {
        child.kill('SIGKILL');
        return done(null);
      }
      const size = AW * AH;
      child.stdout.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= size) {
          take(profiles(buf.subarray(0, size)));
          buf = buf.subarray(size);
        }
      });
      child.on('exit', () => {
        const n = dx.length;
        if (n < 8) return done({ jitter: 0, dup: 0, frames: n + 1 });
        const scale = w / AW;
        const med = [...diff].sort((a, b) => a - b)[n >> 1];
        // cuts: a frame difference far above the clip's usual
        const cut = diff.map((d) => d > Math.max(12, med * 6));
        const px = [];
        const py = [];
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < n; i++) (px.push((sx += cut[i] ? 0 : dx[i])), py.push((sy += cut[i] ? 0 : dy[i])));
        const fx = savgol7(px);
        const fy = savgol7(py);
        const res = [];
        for (let i = 3; i < n - 3; i++) {
          let near = false;
          for (let j = i - 3; j <= i + 3; j++) near ||= cut[j];
          if (!near) res.push(Math.hypot(px[i] - fx[i], py[i] - fy[i]) * scale);
        }
        let dup = 0;
        for (let i = 1; i < n - 1; i++) if (diff[i] < 0.08 && diff[i - 1] > 0.6 && diff[i + 1] > 0.6) dup++;
        const rms = res.length ? Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length) : 0;
        const p95 = res.length ? [...res].sort((a, b) => a - b)[Math.floor(res.length * 0.95)] : 0;
        // reported against a 1080 px short side so every canvas is judged the same
        const norm = 1080 / Math.min(w, h);
        done({ jitter: +(rms * norm).toFixed(2), p95: +(p95 * norm).toFixed(2), dup, frames: n + 1, cuts: cut.filter(Boolean).length });
      });
    });
  });
}
