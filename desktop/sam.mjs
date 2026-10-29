// kimo desktop × Meta SAM 3.1 (Segment Anything): subject tracking, follow
// reframe + punch-ins, text behind the subject, background blur / colour /
// image / cutout, and object blur. Only a downscaled (≤720p, silent) copy of
// the clip segment being processed goes to the kimo proxy (which holds the
// Meta key); masks come back and every pixel of the real render is made here
// with the bundled FFmpeg.
import { spawn, execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { decodeMaskToRaster, parseImageStream, parseVideoStream } from '@meta-sam/parser';

export const SAM_URL =
  process.env.KIMO_SAM_URL || (process.env.KIMO_AI_URL || 'https://api.getkimo.tech/v1/desktop/ai').replace(/\/ai$/, '/sam');
/** Longest segment sent per request (seconds); longer clips are trimmed to it. */
export const SAM_MAX_SECONDS = 60;
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
    execFile(ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_packets:stream_side_data=rotation:format=duration', '-of', 'json', path],
      { windowsHide: true, timeout: 60_000 }, (err, out) => {
        if (err) return done(null);
        try {
          const j = JSON.parse(out);
          const s = j.streams?.[0] ?? {};
          const [a, b] = String(s.r_frame_rate ?? '30/1').split('/').map(Number);
          done({ width: s.width, height: s.height, fps: b ? a / b : a, frames: Number(s.nb_read_packets) || 0, duration: Number(j.format?.duration) || 0 });
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

/** Smoothed subject path (proxy pixels) per proxy frame: cx, cy, box height. */
export function subjectPath(tracks, id = tracks.main) {
  const o = tracks.objects.get(id);
  const n = tracks.frames;
  const raw = Array.from({ length: n }, (_, f) => {
    const b = o?.frames.get(f)?.box;
    return b ? { cx: (b.left + b.right) / 2, cy: b.top + (b.bottom - b.top) * 0.3, h: b.bottom - b.top } : null;
  });
  // fill gaps: hold the nearest known position (centre when never seen)
  let last = raw.find(Boolean) ?? { cx: tracks.width / 2, cy: tracks.height / 2, h: tracks.height };
  const filled = raw.map((p) => (p ? (last = p) : last));
  // smooth: centred moving average (~0.7 s) then a dead zone so small jitter never moves the camera
  const win = Math.max(1, Math.round((tracks.fps || 12) * 0.35));
  const avg = (key) => filled.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) (s += filled[j][key], c++);
    return s / c;
  });
  const cx = avg('cx');
  const cy = avg('cy');
  const h = avg('h');
  const dead = tracks.width * 0.015;
  for (let i = 1; i < n; i++) if (Math.abs(cx[i] - cx[i - 1]) < dead * 0.15 && Math.abs(cx[i] - cx[0]) < dead) cx[i] = cx[i - 1];
  return { cx, cy, h, seen: raw.filter(Boolean).length };
}

/** Piecewise-linear FFmpeg expression of `v` over time `t` (no nesting). */
export function lerpExpr(times, values, tv = 't', maxKeys = 120) {
  const step = Math.max(1, Math.ceil(times.length / maxKeys));
  const ts = [];
  const vs = [];
  for (let i = 0; i < times.length; i += step) (ts.push(times[i]), vs.push(values[i]));
  if (ts.at(-1) !== times.at(-1)) (ts.push(times.at(-1)), vs.push(values.at(-1)));
  let e = `${vs[0].toFixed(1)}`;
  for (let i = 0; i + 1 < ts.length; i++) {
    const d = vs[i + 1] - vs[i];
    if (Math.abs(d) < 0.05) continue;
    e += `+${d.toFixed(1)}*clip((${tv}-${ts[i].toFixed(3)})/${Math.max(0.001, ts[i + 1] - ts[i]).toFixed(3)},0,1)`;
  }
  return e;
}

/** Writes the selected objects' masks as a lossless grey video at proxy size and fps. */
export function writeMaskVideo({ ffmpeg, tracks, ids, out, dilate = 0, signal }) {
  const W = tracks.width;
  const H = tracks.height;
  return new Promise((done, fail) => {
    const vf = dilate ? ['-vf', Array(dilate).fill('dilation').join(',')] : [];
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-r', String(tracks.fps), '-i', 'pipe:0', ...vf, '-c:v', 'ffv1', '-pix_fmt', 'gray', out], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'));
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-1500)));
    child.on('exit', (code) => (code === 0 ? done(out) : fail(new Error(`mask video failed: ${err}`))));
    child.stdin.on('error', () => undefined);
    (async () => {
      for (let f = 0; f < tracks.frames; f++) {
        const frame = Buffer.alloc(W * H);
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
              if (fx >= 0 && fx < W) frame[row + fx] = 255;
            }
          }
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
  const k = src.width / tracks.width;
  const path = subjectPath(tracks);
  const times = path.cx.map((_, i) => i / tracks.fps);
  const xs = path.cx.map((x) => Math.max(0, Math.min(src.width - cw, x * k - cw / 2)));
  const ys = path.cy.map((y) => Math.max(0, Math.min(src.height - ch, y * k - ch * 0.38)));
  const cropX = reframe && cw < src.width ? lerpExpr(times, xs) : '0';
  const cropY = reframe && ch < src.height ? lerpExpr(times, ys) : '0';
  const crop = reframe ? `crop=w=${cw}:h=${ch}:x='${cropX}':y='${cropY}',` : '';
  // punch-ins: hard zoom segments centred on the subject inside the window
  const punches = (Array.isArray(opts.punch) ? opts.punch : opts.punch ? autoPunches(duration) : [])
    .map((p) => ({ start: Number(p.start), end: Number(p.end), zoom: Math.min(1.6, Math.max(1.05, Number(p.zoom) || 1.2)) }))
    .filter((p) => p.end > p.start);
  let size;
  if (punches.length) {
    const z = punches.map((p) => `between(it,${p.start.toFixed(2)},${p.end.toFixed(2)})*${(p.zoom - 1).toFixed(2)}`).join('+');
    const relX = lerpExpr(times, path.cx.map((x, i) => Math.max(0, Math.min(1, (x * k - (reframe ? xs[i] : 0)) / cw))), 'it');
    const relY = lerpExpr(times, path.cy.map((y, i) => Math.max(0, Math.min(1, (y * k - (reframe && ch < src.height ? ys[i] : 0)) / ch))), 'it');
    size = `zoompan=z='1+${z}':x='max(0,min(iw-iw/zoom,(${relX})*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,(${relY})*ih-ih/zoom/2))':d=1:s=${OW}x${OH}:fps=${src.fps.toFixed(3)}`;
  } else size = `scale=${OW}:${OH}:flags=lanczos`;
  const geo = `${crop}${size},setsar=1`;

  // ---- graph ----
  let mask = null;
  if (needMask) {
    mask = await step('sam_mask', `masks → lossless matte (${tracks.width}x${tracks.height})`, () =>
      writeMaskVideo({ ffmpeg, tracks, ids, out: join(dir, 'sam-matte.mkv'), dilate: effect === 'redact' ? 3 : 0, signal }), () => 'matte ready');
  }
  const g = [`[0:v]setpts=PTS-STARTPTS,format=yuv420p,${geo}[v]`];
  if (mask) g.push(`[1:v]setpts=PTS-STARTPTS,scale=${src.width}:${src.height}:flags=bilinear,${geo},format=gray,gblur=sigma=${effect === 'redact' ? 6 : 1.4}[m]`);
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
    const fs = Math.round(Math.min(OH * 0.26, (OW * 0.9) / (0.58 * Math.max(3, text.length))));
    const ty = Math.round(OH * (Number(opts.text_y) || 0.16));
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
  writeFileSync(script, g.join(';\n'));
  const enc = alpha
    ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  if (effect === 'text_behind') writeFileSync(join(dir, 'sam-font-used.txt'), String(fontFor(fontsDir) ?? 'none (fontconfig default)'));
  await step('sam_render', `${effect.replace('_', ' ')} · ${OW}x${OH}${punches.length ? ` · ${punches.length} punch-in${punches.length === 1 ? '' : 's'}` : ''}`, () =>
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, ...extra, '-/filter_complex', script, '-map', outLabel, '-map', '0:a?', ...enc, '-c:a', alpha ? 'pcm_s16le' : 'aac', '-b:a', '192k', '-shortest', out], { signal, cwd: dir }),
  () => `${(statSync(out).size / 1e6).toFixed(1)} MB`);
  return { output: out, width: OW, height: OH, duration, effect, prompt, tracks: { objects: tracks.objects.size, main: tracks.main, seen: path.seen, frames: tracks.frames, fps: tracks.fps }, billedFrames: tracks.cached ? 0 : tracks.billedFrames, punches, proxy: { width: proxy.width, height: proxy.height, bytes: proxy.bytes } };
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
