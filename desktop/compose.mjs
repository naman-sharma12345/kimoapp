import {
  mkdir,
  writeFile,
  rename,
  mkdtemp,
  rm,
  readdir,
  copyFile,
} from 'node:fs/promises';
import { existsSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve, sep, basename } from 'node:path';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { spawnBackground, execFileBackground } from './resources.cjs';
import { mixSound } from './audio/mix.mjs';
import {
  validate,
  rate,
  frameCount,
  framePlan,
  curveValue,
  curveSampler,
} from './edl.mjs';
import { rectFilter, splineExpr } from './sam.mjs';
import { coverGeometry, zoomCap, cameraRect, clipCameraAt } from './camera.mjs';
import { subtitles } from './compose-text.mjs';
import { AssDocument } from './ass.mjs';
import { drawCaptions, isKimoCaption, isStyledHook } from './caption-render.mjs';
import { captionStyle, blockBox } from './captions.mjs';
import { bundledFontsDir, filterPath, fontFiles } from './fonts.mjs';
import {
  planTransitions,
  transitionEnvelope,
  frameRanges,
  maskFilter,
  normalizeMask,
} from './compose-fx.mjs';
import { prepareGraphics } from './compose-graphics.mjs';

const stop = (signal) => {
  if (signal?.aborted) throw new Error('cancelled');
};
const safe = (n) => (Number.isFinite(n) ? Number(n.toFixed(9)) : 0);
const BASE_CACHE_VERSION = 1;
const scriptOptions = new Map();
async function scriptOption(ffmpeg) {
  if (!scriptOptions.has(ffmpeg))
    scriptOptions.set(
      ffmpeg,
      new Promise((resolve, reject) => {
        const child = spawnBackground(ffmpeg, ['-version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let text = '';
        child.stdout.on('data', (d) => {
          text += d;
        });
        child.once('error', reject);
        child.once('close', (code) =>
          code
            ? reject(new Error('FFmpeg version check failed'))
            : resolve(
                /ffmpeg version [0-6]\./.test(text)
                  ? '-filter_complex_script'
                  : '-/filter_complex',
              ),
        );
      }),
    );
  return scriptOptions.get(ffmpeg);
}
function processDone(child, signal, onProgress) {
  let errors = '',
    text = '';
  child.stderr?.on('data', (d) => {
    errors = (errors + d.toString()).slice(-16000);
  });
  child.stdout?.on('data', (d) => {
    text += d.toString();
    let end;
    while ((end = text.indexOf('\n')) >= 0) {
      const line = text.slice(0, end).trim();
      text = text.slice(end + 1);
      const [key, value] = line.split('=');
      if (key === 'frame') onProgress?.(+value);
    }
  });
  const abort = () => child.kill('SIGTERM');
  signal?.addEventListener('abort', abort, { once: true });
  return new Promise((res, rej) => {
    child.once('error', rej);
    child.once('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) rej(new Error('cancelled'));
      else if (code)
        rej(new Error(`compose FFmpeg exited ${code}: ${errors.slice(-6000)}`));
      else res();
    });
  });
}
async function ffmpegRun(ffmpeg, args, { signal, onProgress, cwd } = {}) {
  stop(signal);
  const child = spawnBackground(
    ffmpeg,
    [
      '-nostdin',
      '-hide_banner',
      '-nostats',
      '-y',
      ...args.slice(0, -1),
      '-progress',
      'pipe:1',
      args.at(-1),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], cwd },
  );
  await processDone(child, signal, onProgress);
}
/**
 * One float crop rectangle per planned output frame: camera keys sampled per
 * frame (eased, log-space zoom), subject follow and micro drift, the upscale
 * cap, a soft clamp to the source, then the transition envelope (camera.mjs).
 */
export function cameraRectsForClip(clip, source, canvas, plan, onCap) {
  const geom = coverGeometry(source, canvas, clip.fit);
  const cap = zoomCap(geom, canvas);
  const at = clipCameraAt(clip, geom);
  const length = (clip.out - clip.in) / (clip.speed ?? 1);
  let capped = false;
  const rects = plan.indices.map((_, i) => {
    const t = (plan.start + i) / rate(canvas.fps) - clip.at,
      env = transitionEnvelope(clip._fx, t, length),
      s = at(t);
    if (s.zoom > cap + 1e-6) capped = true;
    return cameraRect(s, geom, canvas, { cap, zoomMul: env.zoom, dx: env.dx });
  });
  if (capped) onCap?.(cap, geom);
  return rects;
}
function geometry(clip, source, canvas, plan) {
  // Normalize before resampling in both strategies. Otherwise RGB sources can
  // be transformed before conversion in A but after conversion in B.
  const filters = [
    'scale=out_color_matrix=bt709:out_range=tv',
    'format=yuva444p',
    'setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
  ];
  const rotation = (((source.rotation ?? 0) % 360) + 360) % 360;
  if (rotation === 90) filters.push('transpose=clock');
  else if (rotation === 270) filters.push('transpose=cclock');
  else if (rotation === 180) filters.push('hflip', 'vflip');
  if (clip.place) {
    // a rendered graphic: its frames are already at canvas scale; pad to the canvas at its box
    const p = clip.place;
    if (source.w !== p.w || source.h !== p.h)
      filters.push(`scale=${p.w}:${p.h}:flags=lanczos+accurate_rnd+full_chroma_int`);
    filters.push(`pad=${canvas.w}:${canvas.h}:${Math.round(p.x)}:${Math.round(p.y)}:color=black@0`);
  } else if (clip.fit === 'contain') {
    filters.push(
      'format=yuva444p',
      `scale=${canvas.w}:${canvas.h}:force_original_aspect_ratio=decrease:flags=lanczos+accurate_rnd+full_chroma_int`,
      `pad=${canvas.w}:${canvas.h}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    );
    filters.push(
      rectFilter(
        cameraRectsForClip(
          { ...clip, fit: 'cover' },
          { w: canvas.w, h: canvas.h, rotation: 0 },
          canvas,
          plan,
        ),
      ),
      `scale=${canvas.w}:${canvas.h}:flags=lanczos+accurate_rnd+full_chroma_int`,
    );
  } else
    filters.push(
      rectFilter(cameraRectsForClip(clip, source, canvas, plan)),
      `scale=${canvas.w}:${canvas.h}:flags=lanczos+accurate_rnd+full_chroma_int`,
    );
  // Phase 7 picture-in-picture: the speaker, already framed on the canvas, is
  // centre-cropped to the bubble's aspect, scaled into the bubble and padded
  // to the canvas (its rounded corners come from the clip mask)
  if (clip._pip) {
    const k = clip._pip;
    const even = (v) => Math.max(2, Math.round(v / 2) * 2);
    let cw = canvas.w;
    let ch = cw * (k.h / k.w);
    if (ch > canvas.h) {
      ch = canvas.h;
      cw = ch * (k.w / k.h);
    }
    const z = Math.max(1, Math.min(2.5, k.zoom ?? 1));
    cw = even(cw / z);
    ch = even(ch / z);
    const cx = Math.max(0, Math.min(canvas.w - cw, Math.round((k.fx ?? 0.5) * canvas.w - cw / 2)));
    const cy = Math.max(0, Math.min(canvas.h - ch, Math.round((k.fy ?? 0.5) * canvas.h - ch / 2)));
    filters.push(
      `crop=${cw}:${ch}:${cx}:${cy}`,
      `scale=${k.w}:${k.h}:flags=lanczos+accurate_rnd+full_chroma_int`,
      `pad=${canvas.w}:${canvas.h}:${Math.round(k.x)}:${Math.round(k.y)}:color=black@0`,
    );
  }
  // screen card: the recording inset onto the card (its rounded corners come from the clip mask)
  if (clip._card) {
    const k = clip._card;
    filters.push(
      `scale=${k.w}:${k.h}:flags=lanczos+accurate_rnd+full_chroma_int`,
      `pad=${canvas.w}:${canvas.h}:${k.x}:${k.y}:color=black@0`,
    );
  }
  // screen card backdrop: a blurred, dimmed copy of the recording
  if (clip.blur > 0) filters.push(`gblur=sigma=${safe(clip.blur)}:steps=2`);
  if (clip.dim > 0)
    filters.push(`lutyuv=y='16+(val-16)*${safe(1 - Math.min(0.9, clip.dim))}'`);
  const angles = plan.indices.map(
    (_, i) =>
      (curveValue(
        clip.rotation,
        (plan.start + i) / rate(canvas.fps) - clip.at,
      ) *
        Math.PI) /
      180,
  );
  if (angles.some((a) => Math.abs(a) > 1e-9))
    filters.push(
      `rotate='${splineExpr(angles, 'n', 0.000001)}':fillcolor=black@0`,
    );
  for (const effect of clip.grade?.effects ?? []) {
    if (effect.kind !== 'primaries') continue;
    const p = effect.params ?? {},
      v = (key, fallback) => curveValue(p[key], 0, fallback);
    const channel = (key) =>
      `clip(pow(max(0,(val/255+${safe(v('lift_' + key, 0) + v('lift_m', 0))})*${safe(v('gain_' + key, 1) * v('gain_m', 1))}+${safe(v('offset_' + key, 0) + v('offset_m', 0))}),${safe(1 / Math.max(0.001, v('gamma_' + key, 1) * v('gamma_m', 1)))}),0,1)*255`;
    filters.push(
      'format=gbrp',
      `lutrgb=r='${channel('r')}':g='${channel('g')}':b='${channel('b')}'`,
      `eq=contrast=${safe(v('contrast', 1))}:saturation=${safe(v('saturation', 1))}`,
      'scale=out_color_matrix=bt709:out_range=tv',
      'format=yuva444p',
      'setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    );
  }
  filters.push(
    'setsar=1',
    'format=yuva444p',
    'setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
  );
  const length = (clip.out - clip.in) / (clip.speed ?? 1);
  const envelopes = plan.indices.map((_, i) =>
    transitionEnvelope(
      clip._fx,
      (plan.start + i) / rate(canvas.fps) - clip.at,
      length,
    ),
  );
  // Whip transitions streak horizontally only on their own frames.
  const blurFrames = frameRanges(envelopes, (e) => e.blur > 0.15);
  if (blurFrames)
    filters.push(
      `avgblur=sizeX=${Math.max(2, Math.round(canvas.w / 40))}:sizeY=1:enable='${blurFrames}'`,
    );
  // Zoom-through: radial-ish blur from a Gaussian on its strongest frames on top of the eased scale.
  const zoomStrong = frameRanges(envelopes, (e) => e.zblur > 0.5),
    zoomLight = frameRanges(envelopes, (e) => e.zblur > 0.12 && e.zblur <= 0.5);
  if (zoomStrong)
    filters.push(
      `gblur=sigma=${safe(Math.max(1, canvas.h / 90))}:steps=2:enable='${zoomStrong}'`,
    );
  if (zoomLight)
    filters.push(
      `gblur=sigma=${safe(Math.max(0.6, canvas.h / 260))}:steps=1:enable='${zoomLight}'`,
    );
  // Dip to white lifts the picture toward white on its own frames only.
  const whites = plan.indices.map((_, i) => envelopes[i].white);
  const whiteFrames = frameRanges(whites, (v) => v > 0.001);
  if (whiteFrames) {
    const k = splineExpr(whites, 'N', 0.001);
    filters.push(
      `geq=lum='lum(X,Y)+(235-lum(X,Y))*(${k})':cb='cb(X,Y)+(128-cb(X,Y))*(${k})':cr='cr(X,Y)+(128-cr(X,Y))*(${k})':a='alpha(X,Y)':enable='${whiteFrames}'`,
    );
  }
  const opacity = plan.indices.map((_, i) =>
    Math.max(
      0,
      Math.min(
        1,
        curveValue(
          clip.opacity,
          (plan.start + i) / rate(canvas.fps) - clip.at,
          1,
        ) * envelopes[i].alpha,
      ),
    ),
  );
  // geq is per-pixel; evaluate it only on frames that are actually translucent.
  const translucent = frameRanges(opacity, (v) => v < 1);
  if (translucent)
    filters.push(
      `geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${splineExpr(opacity, 'N', 0.001)})':enable='${translucent}'`,
    );
  const label = createHash('sha1')
    .update(`${clip.id}:${plan.start}:${plan.end}`)
    .digest('hex')
    .slice(0, 10);
  const mask = maskFilter(clip.mask, canvas, label);
  return filters.join(',') + (mask ?? '');
}
async function* frames(stream, size) {
  let frame = Buffer.allocUnsafe(size),
    offset = 0;
  for await (const data of stream) {
    let i = 0;
    while (i < data.length) {
      const count = Math.min(size - offset, data.length - i);
      data.copy(frame, offset, i, i + count);
      offset += count;
      i += count;
      if (offset === size) {
        yield frame;
        frame = Buffer.allocUnsafe(size);
        offset = 0;
      }
    }
  }
  if (offset) throw new Error('compose decoder returned a partial frame');
}
/** Strict JS sampling for nonintegral speed/rate ratios, including deliberate slow-motion holds. */
async function mappedSegment({
  ffmpeg,
  source,
  clip,
  canvas,
  plan,
  output,
  signal,
  onProgress,
}) {
  const first = plan.indices[0],
    last = plan.indices.at(-1),
    fps = rate(source.fps || canvas.fps);
  const rawFormat = source.alpha ? 'bgra' : 'yuv444p',
    rawSize = source.w * source.h * (source.alpha ? 4 : 3);
  const seek = source.kind === 'image' ? 0 : Math.max(0, (first - 0.5) / fps);
  const decoder = spawnBackground(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-noautorotate',
      '-ss',
      String(seek),
      '-accurate_seek',
      '-i',
      source.path,
      '-map',
      '0:v:0',
      '-an',
      '-vf',
      `trim=end_frame=${last - first + 1}${source.alpha ? '' : ',scale=out_color_matrix=bt709:out_range=tv'},format=${rawFormat}`,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let decodeError = '';
  decoder.stderr.on('data', (d) => {
    decodeError = (decodeError + d.toString()).slice(-4000);
  });
  const decoderClosed = new Promise((resolve) =>
    decoder.once('close', resolve),
  );
  decoder.once('error', (error) => {
    decodeError = error.message;
    decoder.stdout.destroy(error);
  });
  const encoder = spawnBackground(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pixel_format',
      rawFormat,
      '-video_size',
      `${source.w}x${source.h}`,
      '-framerate',
      String(canvas.fps),
      ...(source.alpha ? [] : ['-colorspace', 'bt709', '-color_range', 'tv']),
      '-i',
      'pipe:0',
      '-an',
      '-vf',
      geometry(clip, source, canvas, plan),
      '-frames:v',
      String(plan.indices.length),
      '-c:v',
      'ffv1',
      '-level',
      '3',
      '-pix_fmt',
      'yuva444p',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
      '-fps_mode',
      'passthrough',
      output,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  encoder.stdin.on('error', () => {});
  const completed = processDone(encoder, signal);
  // Attach a rejection handler immediately, before pumping the decoder.
  completed.catch(() => {});
  const abort = () => {
    decoder.kill('SIGTERM');
    encoder.kill('SIGTERM');
  };
  signal?.addEventListener('abort', abort, { once: true });
  let index = first,
    next = 0;
  try {
    for await (const frame of frames(decoder.stdout, rawSize)) {
      stop(signal);
      while (next < plan.indices.length && plan.indices[next] === index) {
        if (!encoder.stdin.write(frame))
          await Promise.race([
            once(encoder.stdin, 'drain'),
            completed.then(() => {
              throw new Error(
                'Frame encoder stopped before consuming its input',
              );
            }),
          ]);
        next++;
        onProgress?.(next);
      }
      if (next === plan.indices.length) break;
      index++;
    }
    if (next !== plan.indices.length)
      throw new Error(
        `compose source ${source.id} ended at frame ${index}; wanted ${plan.indices[next]}. ${decodeError}`,
      );
    encoder.stdin.end();
    await completed;
  } catch (error) {
    abort();
    throw error;
  } finally {
    decoder.kill('SIGTERM');
    await decoderClosed;
    await completed.catch(() => {});
    signal?.removeEventListener('abort', abort);
  }
}
const lossless = [
  '-c:v',
  'ffv1',
  '-level',
  '3',
  '-pix_fmt',
  'yuv444p',
  '-colorspace',
  'bt709',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-color_range',
  'tv',
  '-fps_mode',
  'passthrough',
];
/**
 * The libass pass. One ass filter (complex shaping, so Devanagari conjuncts
 * form) with the script and fonts dir given as absolute, escaped filter paths
 * (C\\:/… on Windows; a bare drive letter splits the option).
 */
export function textFilter(path, fontsDir, script) {
  if (!script.includes('\nDialogue:')) return 'format=yuv444p';
  // FFmpeg 6's ASS draw context uses a fixed YUV matrix. Composite its RGB
  // colours in RGB instead, then explicitly return to the BT.709 4:4:4 graph.
  return `scale=in_color_matrix=bt709:in_range=tv,format=rgb24,setparams=range=full:colorspace=gbr,ass=filename=${filterPath(resolve(path))}${fontsDir ? `:fontsdir=${filterPath(resolve(fontsDir))}` : ''}:shaping=complex,scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709`;
}
/**
 * The final text pass script: planner/legacy overlays (compose-text) plus
 * kimo captions and styled hook titles (caption-render) in one ASS document.
 */
export function finalScript(edl, overlays, from, to) {
  const legacy = subtitles({ ...edl, overlays }, from, to);
  if (!edl.overlays.some((o) => isKimoCaption(o) || o._kimoText)) return legacy;
  const doc = new AssDocument({ w: edl.canvas.w, h: edl.canvas.h });
  doc.rawDialogue(legacy.split('\n').filter((l) => l.startsWith('Dialogue:')));
  drawCaptions(doc, edl, rate(edl.canvas.fps), from, to);
  return doc.toString();
}
const relLum = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const hexLum = (hex) => {
  const [r, g, b] = String(hex).replace('#', '').match(/../g).map((h) => parseInt(h, 16));
  return 0.2126 * relLum(r) + 0.7152 * relLum(g) + 0.0722 * relLum(b);
};
/** Styles without a box or a real outline get the background contrast check. */
const needsContrast = (style, canvas) => !style.box && (style.outline ?? 0) * canvas.w < 3;
/**
 * Auto-contrast: mean luminance of the base composite behind each caption
 * block (one small grey frame per chunk); below 4.5:1 against the text
 * colour, the chunk renders on a soft translucent box. Mutates the overlays.
 */
async function contrastPass(edl, { ffmpeg, base, from, to, signal }) {
  const fps = rate(edl.canvas.fps);
  const caps = edl.overlays.filter((o) => isKimoCaption(o) && !o.props.hidden && needsContrast(captionStyle(o.props.style), edl.canvas)).map((o) => ({ o, n: Math.round((o.at + o.dur / 2) * fps) - from })).filter((x) => x.n >= 0 && x.n < to - from);
  if (!caps.length) return 0;
  const W = 160;
  const H = Math.max(2, Math.round((W * edl.canvas.h) / edl.canvas.w / 2) * 2);
  const frames = [...new Set(caps.map((c) => c.n))].sort((a, b) => a - b);
  const buf = await new Promise((done) =>
    execFileBackground(ffmpeg, ['-v', 'error', '-i', base, '-vf', `select='${frames.map((n) => `eq(n,${n})`).join('+')}',scale=${W}:${H},format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: frames.length * W * H + 65536, signal }, (error, stdout) => done(error ? null : stdout)),
  );
  if (!buf || !Buffer.isBuffer(buf) || buf.length < W * H) return 0;
  let boosted = 0;
  for (const c of caps) {
    const fi = frames.indexOf(c.n);
    if ((fi + 1) * W * H > buf.length) continue;
    const style = captionStyle(c.o.props.style);
    const b = blockBox(style, { words: c.o.props.words, lines: c.o.props.lines, place: c.o.props.place }, edl.canvas, c.o.props.place.cy, c.o.props.place.cx);
    const sx = W / edl.canvas.w;
    const sy = H / edl.canvas.h;
    let sum = 0;
    let n = 0;
    for (let y = Math.max(0, Math.floor(b.y0 * sy)); y < Math.min(H, Math.ceil(b.y1 * sy)); y++)
      for (let x = Math.max(0, Math.floor(b.x0 * sx)); x < Math.min(W, Math.ceil(b.x1 * sx)); x++) {
        sum += relLum(Math.max(0, Math.min(255, ((buf[fi * W * H + y * W + x] - 16) * 255) / 219)));
        n++;
      }
    if (!n) continue;
    const bg = sum / n;
    const fg = hexLum(style.colors.text);
    const ratio = (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
    c.o.props.contrast_ratio = +ratio.toFixed(2);
    if (ratio < 4.5) {
      c.o.props.contrast = 'boost';
      boosted++;
    }
  }
  return boosted;
}
async function bakeTracks(edl, { ffmpeg, dir, from, to, signal, emit }) {
  const fps = rate(edl.canvas.fps),
    layers = [],
    sources = [];
  for (const [ti, track] of edl.video.entries()) {
    const pieces = [];
    let cursor = from;
    const blank = async (count) => {
      if (!count) return;
      const path = join(dir, `transparent-${count}.mkv`);
      if (!existsSync(path))
        await ffmpegRun(
          ffmpeg,
          [
            '-f',
            'lavfi',
            '-i',
            `color=black@0:s=${edl.canvas.w}x${edl.canvas.h}:r=${edl.canvas.fps},format=yuva444p`,
            '-frames:v',
            String(count),
            '-an',
            '-c:v',
            'ffv1',
            '-level',
            '3',
            '-pix_fmt',
            'yuva444p',
            '-colorspace',
            'bt709',
            '-color_primaries',
            'bt709',
            '-color_trc',
            'bt709',
            '-color_range',
            'tv',
            path,
          ],
          { signal },
        );
      pieces.push(path);
    };
    for (const clip of [...track.clips].sort((a, b) => a.at - b.at)) {
      const source = edl.sources.find((s) => s.id === clip.src),
        plan = framePlan(clip, source, edl.canvas.fps, from, to);
      if (!plan.indices.length) continue;
      await blank(plan.start - cursor);
      const path = join(
        dir,
        `mapped-${ti}-${clip.id.replace(/[^a-z0-9_-]/gi, '_')}-${from}.mkv`,
      );
      await mappedSegment({
        ffmpeg,
        source,
        clip,
        canvas: edl.canvas,
        plan,
        output: path,
        signal,
        onProgress: (n) =>
          emit({
            t: 'progress',
            phase: 'compose',
            label: 'mapping source frames',
            frame: plan.start + n,
            total: frameCount(edl),
            f: (plan.start + n) / frameCount(edl),
          }),
      });
      pieces.push(path);
      cursor = plan.end;
    }
    if (!pieces.length) continue;
    await blank(to - cursor);
    const path = join(dir, `track-${ti}-${from}.mkv`),
      list = join(dir, `track-${ti}-${from}.ffcat`);
    await writeFile(
      list,
      pieces.map((p) => `file '${basename(p)}'`).join('\n'),
    );
    await ffmpegRun(
      ffmpeg,
      ['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', path],
      { signal },
    );
    const id = `baked-${ti}`;
    sources.push({
      id,
      path,
      w: edl.canvas.w,
      h: edl.canvas.h,
      fps: edl.canvas.fps,
      duration: (to - from) / fps,
      kind: 'video',
    });
    layers.push({
      id,
      src: id,
      in: 0,
      out: (to - from) / fps,
      at: from / fps,
      speed: 1,
      _baked: true,
      _overlayIndex: track._overlayIndex,
    });
  }
  return { clips: layers, sources };
}
async function inspect(ffprobe, path) {
  const child = spawnBackground(
    ffprobe,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let text = '',
    error = '';
  child.stdout.on('data', (d) => {
    text += d;
  });
  child.stderr.on('data', (d) => {
    error += d;
  });
  const [code] = await once(child, 'close');
  if (code) throw new Error(`Cannot probe ${path}: ${error}`);
  return JSON.parse(text);
}
function volumeExpression(curve, fallback = 1) {
  const keys = (curve?.keys ?? [])
    .map((k) => ({ t: k.t ?? k.time, v: k.v ?? k.value }))
    .sort((a, b) => a.t - b.t);
  if (!keys.length) return String(curve?.base ?? fallback);
  let expr = String(keys.at(-1).v);
  for (let i = keys.length - 2; i >= 0; i--) {
    const a = keys[i],
      b = keys[i + 1];
    expr = `if(lt(t,${safe(b.t)}),${safe(a.v)}+(t-${safe(a.t)})*${safe((b.v - a.v) / (b.t - a.t))},${expr})`;
  }
  return `if(lt(t,${safe(keys[0].t)}),${safe(curve?.base ?? keys[0].v)},${expr})`;
}
async function audioMix(edl, { ffmpeg, dir, signal, totalFrames, emit }) {
  const fps = rate(edl.canvas.fps),
    seconds = totalFrames / fps,
    samples = Math.round(seconds * 48000);
  if(edl.sound?.enabled) return mixSound(edl,{ffmpeg,dir:edl.sound.stem_dir,signal,duration:seconds,emit});
  const args = [],
    filters = [],
    labels = [],
    entries = [];
  for (const track of edl.audio)
    for (const c of track.clips) {
      const s = edl.sources.find((s) => s.id === c.src) ?? {
        path: c.asset,
        audio: true,
      };
      if (!s.audio) continue;
      const input = labels.length,
        argsIndex = input;
      args.push(
        '-ss',
        String(c.in ?? 0),
        '-t',
        String(c.out != null ? c.out - (c.in ?? 0) : (c.dur ?? seconds)),
        '-i',
        s.path,
      );
      const length = c.dur ?? (c.out - c.in) / (c.speed ?? 1),
        a = c.native_audio ?? {};
      const chain = [
        'aresample=48000',
        'aformat=sample_fmts=fltp:channel_layouts=stereo',
      ];
      let speed = c.speed ?? 1;
      while (speed > 2) {
        chain.push('atempo=2');
        speed /= 2;
      }
      while (speed < 0.5) {
        chain.push('atempo=0.5');
        speed *= 2;
      }
      if (Math.abs(speed - 1) > 1e-9) chain.push(`atempo=${safe(speed)}`);
      if (a.highpass > 0) chain.push(`highpass=f=${safe(a.highpass)}`);
      if (a.lowpass > 0) chain.push(`lowpass=f=${safe(a.lowpass)}`);
      if (a.compress)
        chain.push('acompressor=threshold=0.125:ratio=3:attack=5:release=80');
      const gain = a.volume
        ? `(${volumeExpression(a.volume)})*(${volumeExpression(a.duck_gain)})`
        : String(10 ** ((c.gain_db ?? 0) / 20));
      chain.push(
        `volume='${gain}':eval=frame`,
        `atrim=end_sample=${Math.round(length * 48000)}`,
        'asetpts=PTS-STARTPTS',
      );
      // 10 ms equal-power edges; J/L-cut audio fades over its lead/trail
      const edge = (v) => (v > 0.01 ? Math.min(v, length / 2) : Math.min(0.01, length / 3)),
        fadeIn = edge(c.fade_in),
        fadeOut = edge(c.fade_out);
      chain.push(
        `afade=t=in:st=0:d=${safe(fadeIn)}:curve=qsin`,
        `afade=t=out:st=${safe(length - fadeOut)}:d=${safe(fadeOut)}:curve=qsin`,
        `adelay=${Math.round(c.at * 48000)}S:all=1`,
      );
      filters.push(`[${argsIndex}:a:0]${chain.join(',')}[a${input}]`);
      labels.push(`[a${input}]`);
      entries.push({ label: `[a${input}]`, track, clip: c });
      for (const k of ['effects', 'pitch', 'denoise', 'echo', 'reverse'])
        if (Array.isArray(a[k]) ? a[k].length : a[k])
          emit({
            t: 'op',
            tool: 'compose_warning',
            phase: 'end',
            warning: true,
            ok: true,
            title: `Audio ${c.id}: retained native ${k}; Phase 7 chain is not implemented`,
            at: Date.now(),
          });
    }
  // MUSIC (or any clip) with `duck` is sidechain-compressed by the bus of the
  // track/role it ducks under, so it dips only while that bus is speaking.
  const finalLabels = [],
    consumed = new Set();
  const unders = [
    ...new Set(
      entries.filter((e) => e.clip.duck).map((e) => e.clip.duck.under ?? 'VOICE'),
    ),
  ];
  for (const [gi, under] of unders.entries()) {
    const voices = entries.filter(
      (e) =>
        !e.clip.duck &&
        !consumed.has(e) &&
        (e.track.track === under || e.track.role === under),
    );
    const duckers = entries.filter(
      (e) => e.clip.duck && (e.clip.duck.under ?? 'VOICE') === under,
    );
    if (!voices.length) {
      emit({
        t: 'op',
        tool: 'compose_warning',
        phase: 'end',
        warning: true,
        ok: true,
        title: `Audio duck under ${under}: no unducked clips on that track; mixed without ducking`,
        at: Date.now(),
      });
      continue;
    }
    for (const v of voices) consumed.add(v);
    const bus = `[vbus${gi}]`,
      taps = duckers.map((_, j) => `[vsc${gi}_${j}]`);
    filters.push(
      `${voices.map((v) => v.label).join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,asplit=${taps.length + 1}${bus}${taps.join('')}`,
    );
    finalLabels.push(bus);
    duckers.forEach((d, j) => {
      const duck = d.clip.duck,
        depth = duck.depth_db ?? 14;
      // Speech sits near -24 dBFS before mastering; with ratio 20 the gain
      // reduction is ~(level - threshold) * 0.95, i.e. about depth_db.
      const threshold = Math.min(
        1,
        Math.max(0.000976563, 10 ** ((-24 - depth / 0.95) / 20)),
      );
      const out = `[ducked${gi}_${j}]`;
      // sidechaincompress ends at the first input EOF and drops whatever the
      // other input still has buffered (decoder frame sizes differ), so give
      // both inputs a second of slack and trim back to the picture clock.
      const slack = samples + 48000;
      filters.push(
        `${taps[j]}apad=whole_len=${slack}[vscp${gi}_${j}]`,
        `${d.label}apad=whole_len=${slack}[vmain${gi}_${j}]`,
        `[vmain${gi}_${j}][vscp${gi}_${j}]sidechaincompress=threshold=${safe(threshold)}:ratio=20:knee=4:attack=${safe(Math.max(0.01, duck.attack_ms ?? 60))}:release=${safe(Math.max(0.01, duck.release_ms ?? 350))}:makeup=1:detection=rms:link=maximum,atrim=end_sample=${samples}${out}`,
      );
      consumed.add(d);
      finalLabels.push(out);
    });
  }
  for (const e of entries) if (!consumed.has(e)) finalLabels.push(e.label);
  if (!finalLabels.length) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    filters.push(`[0:a]atrim=end_sample=${samples}[mix]`);
  } else
    filters.push(
      `${finalLabels.join('')}amix=inputs=${finalLabels.length}:normalize=0:duration=longest,apad,atrim=end_sample=${samples}[mix]`,
    );
  const script = join(dir, 'audio.ffgraph'),
    output = join(dir, 'audio.wav');
  await writeFile(script, filters.join(';\n'));
  await ffmpegRun(
    ffmpeg,
    [
      ...args,
      await scriptOption(ffmpeg),
      script,
      '-map',
      '[mix]',
      '-c:a',
      'pcm_s24le',
      output,
    ],
    { signal },
  );
  return output;
}
/**
 * Speed ramps slow b-roll to `min` speed. When the source has fewer than 2x
 * the canvas frames per second, the ramped range is motion-interpolated once
 * (minterpolate mci/aobmc/vsbmc) to an integer multiple of the source rate, so
 * the original frames stay exact and only the slow part gets new frames.
 * Otherwise the real frames are used.
 */
async function interpolateRamps(edl, { ffmpeg, ffprobe, dir, signal, emit, warn }) {
  const canvasFps = rate(edl.canvas.fps);
  for (const track of edl.video)
    for (const clip of track.clips) {
      if (!clip.ramp || !(clip.ramp.min < 1)) continue;
      const source = edl.sources.find((s) => s.id === clip.src);
      if (!source || source.kind === 'image') continue;
      const srcFps = rate(source.fps);
      if (srcFps >= 2 * canvasFps) continue;
      const k = Math.max(2, Math.ceil(canvasFps / clip.ramp.min / srcFps - 1e-9));
      const [num, den = 1] = String(source.fps).split('/').map(Number);
      const outRate = `${num * k}/${den}`;
      const from = Math.max(0, clip.in - 1 / srcFps),
        length = clip.out - clip.in + 2 / srcFps;
      const path = join(dir, `ramp-${clip.id.replace(/[^a-z0-9_-]/gi, '_')}.mkv`);
      const opId = randomUUID().slice(0, 8),
        t0 = Date.now();
      emit({ t: 'op', id: opId, opId, tool: 'speed_ramp', phase: 'start', title: `speed_ramp ${clip.id} · 1 → ${clip.ramp.min} → 1 · minterpolate ${srcFps.toFixed(2)} → ${(srcFps * k).toFixed(2)} fps`, why: 'slow motion needs real in-between frames when the source rate is low', at: t0 });
      try {
        await ffmpegRun(ffmpeg, ['-ss', String(from), '-t', String(length), '-i', source.path, '-an', '-vf', `minterpolate=fps=${outRate}:mi_mode=mci:mc_mode=aobmc:vsbmc=1,format=yuv444p`, '-c:v', 'ffv1', '-level', '3', path], { signal });
        const info = await inspect(ffprobe, path);
        const video = info.streams.find((s) => s.codec_type === 'video');
        const id = `${source.id}#ramp:${clip.id}`;
        edl.sources.push({ ...source, id, path, fps: outRate, frames: Number(video?.nb_frames) || undefined, duration: Number(info.format?.duration) || length, rotation: 0, w: video?.width ?? source.w, h: video?.height ?? source.h, signature: `${statSync(path).size}:${statSync(path).mtimeMs}` });
        clip.in = +(clip.in - from).toFixed(9);
        clip.out = +(clip.out - from).toFixed(9);
        clip.src = id;
        emit({ t: 'op', id: opId, phase: 'end', ok: true, ms: Date.now() - t0, result: `${k}x interpolated frames for the slow part` });
      } catch (error) {
        if (signal?.aborted) throw error;
        emit({ t: 'op', id: opId, phase: 'end', ok: false, ms: Date.now() - t0, error: String(error.message).slice(0, 200) });
        warn(`${clip.id}: motion interpolation failed; the ramp holds real frames`);
      }
    }
}
export async function compose({
  edl,
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  output,
  dir,
  signal,
  emit = () => {},
  strategy = 'auto',
  frame = null,
  fontsDir,
  assetRoot,
  cacheDir,
}) {
  // Work on a private normalized copy; IPC/saved EDLs stay immutable.
  edl = structuredClone(edl);
  // styled hook titles are drawn by the caption renderer, not the legacy text pass
  for (const o of edl.overlays) if (isStyledHook(edl, o)) o._kimoText = true;
  for (const source of edl.sources)
    if (/\.(png|jpe?g|webp)$/i.test(source.path)) source.kind ??= 'image';
  for (const [ti, track] of edl.audio.entries())
    for (const [ci, clip] of track.clips.entries()) {
      clip.id ??= `audio-${ti}-${ci}`;
      clip.speed ??= 1;
      clip.in ??= 0;
      if (!clip.asset) continue;
      clip.asset = resolve(assetRoot ?? resolve(output, '..'), clip.asset);
      if (!existsSync(clip.asset))
        throw new Error(`EDL audio ${clip.id}: missing asset ${clip.asset}`);
      const info = await inspect(ffprobe, clip.asset);
      if (!info.streams.some((s) => s.codec_type === 'audio'))
        throw new Error(`EDL audio ${clip.id}: asset has no audio stream`);
      const length = Number(info.format?.duration);
      clip.dur ??= ((clip.out ?? length) - clip.in) / clip.speed;
      clip.out ??= clip.in + clip.dur * clip.speed;
      if (length > 0 && clip.out > length + 1 / 48000)
        throw new Error(
          `EDL audio ${clip.id}.out: exceeds asset duration ${length}`,
        );
    }
  // Phase 6: kit graphics → transparent clips (cached), screen cards → backdrop + shadow tracks
  {
    const fps0 = rate(edl.canvas.fps);
    const workspace0 = resolve(dir ?? join(resolve(output, '..'), '.compose'));
    const seen = new Set();
    await prepareGraphics(edl, {
      ffmpeg,
      dir: join(cacheDir ?? workspace0, 'graphics'),
      signal,
      emit,
      frameTime: frame == null ? null : frame / fps0,
      warn: (title) => {
        if (seen.has(title)) return;
        seen.add(title);
        emit({ t: 'op', tool: 'compose_warning', phase: 'end', warning: true, ok: true, title, at: Date.now() });
      },
    });
  }
  for (const [overlayIndex, overlay] of edl.overlays.entries()) {
    if (!['image', 'text_behind', 'graphic', 'pip'].includes(overlay.kind) || !overlay.src)
      continue;
    const p = overlay.kind === 'graphic' ? {} : overlay.props ?? {};
    edl.video.push({
      track: 'overlay:' + overlay.id,
      _overlayIndex: overlayIndex,
      clips: [
        {
          id: 'picture:' + overlay.id,
          _overlayIndex: overlayIndex,
          src: overlay.src,
          at: overlay.at,
          in: p.in ?? 0,
          out: (p.in ?? 0) + overlay.dur * (p.speed ?? 1),
          speed: p.speed ?? 1,
          fit: p.fit ?? 'contain',
          camera: p.camera,
          opacity: p.opacity ?? 1,
          mask: p.mask,
          rotation: p.rotation,
          ...(overlay._place ? { place: overlay._place, fit: 'cover' } : {}),
          // Phase 7 speaker bubble: a copy of the talking track inset over a full-screen explainer
          ...(overlay.kind === 'pip' && p.pip ? { _pip: p.pip, fit: 'cover' } : {}),
        },
      ],
    });
  }
  validate(edl);
  stop(signal);
  const warnOnce = new Set();
  const warn = (title) => {
    if (warnOnce.has(title)) return;
    warnOnce.add(title);
    emit({
      t: 'op',
      tool: 'compose_warning',
      phase: 'end',
      warning: true,
      ok: true,
      title,
      at: Date.now(),
    });
  };
  for (const message of planTransitions(edl, rate(edl.canvas.fps)))
    warn(message);
  for (const clip of edl.video.flatMap((t) => t.clips)) {
    if (clip.mask && !normalizeMask(clip.mask))
      warn(
        `${clip.id}: mask ${JSON.stringify(clip.mask).slice(0, 80)} is not a rect/ellipse EDL mask; rendered unmasked`,
      );
    if (clip.blend && clip.blend !== 'normal')
      warn(`${clip.id}: blend ${clip.blend} not implemented; rendered normal`);
    if (clip.grade?.native)
      warn(`${clip.id}: native grade graph retained in EDL; not rendered yet`);
    if (clip.grade?.look)
      warn(`${clip.id}: grade look ${clip.grade.look} not rendered yet`);
    for (const effect of clip.grade?.effects ?? [])
      if (effect.kind !== 'primaries')
        warn(`${clip.id}: effect ${effect.kind} retained in EDL; not rendered`);
  }
  dir = dir ?? join(resolve(output, '..'), '.compose');
  await mkdir(dir, { recursive: true });
  const workspace = resolve(dir);
  dir = await mkdtemp(join(workspace, 'work-'));
  const id = randomUUID().slice(0, 8),
    started = Date.now(),
    total = frameCount(edl),
    fps = rate(edl.canvas.fps);
  emit({
    t: 'op',
    id,
    opId: id,
    tool: 'compose',
    phase: 'start',
    title:
      frame == null
        ? `compose ${total} frames at ${edl.canvas.fps} fps`
        : `compose frame ${frame}`,
    why: 'frame-exact picture from the EDL at the source frame rate',
    at: started,
  });
  try {
    let fontDir = null;
    const kimoText = edl.overlays.some((o) => isKimoCaption(o) || o._kimoText);
    const copied = new Set();
    const copyFont = async (from, file) => {
      if (copied.has(file.toLowerCase())) return;
      if (!fontDir) await mkdir((fontDir = join(dir, 'fonts')));
      await copyFile(join(from, file), join(fontDir, file));
      copied.add(file.toLowerCase());
    };
    if (fontsDir && existsSync(fontsDir)) {
      const families = edl.overlays
        .map((o) =>
          String(o.props?.font ?? '')
            .replace(/[^a-z0-9]/gi, '')
            .toLowerCase(),
        )
        .filter(Boolean);
      const files = (await readdir(fontsDir)).filter(
        (n) =>
          /\.(ttf|otf)$/i.test(n) &&
          (families.some((f) =>
            n
              .replace(/[^a-z0-9]/gi, '')
              .toLowerCase()
              .includes(f),
          ) ||
            /dejavu/i.test(n)),
      );
      for (const file of files) await copyFont(fontsDir, file);
    }
    // kimo captions and title effects use the bundled OFL faces (desktop/fonts)
    if (kimoText) for (const file of fontFiles(bundledFontsDir())) await copyFont(bundledFontsDir(), file);
    const used = new Set(
      [...edl.video, ...edl.audio].flatMap((t) => t.clips.map((c) => c.src)),
    );
    for (const source of edl.sources.filter((s) => used.has(s.id))) {
      if (!existsSync(source.path))
        throw new Error(`EDL source ${source.id} is missing: ${source.path}`);
      const info = await inspect(ffprobe, source.path);
      const video = info.streams.find((s) => s.codec_type === 'video');
      source.kind ??= /\.(png|jpe?g|webp)$/i.test(source.path)
        ? 'image'
        : video
          ? 'video'
          : 'audio';
      source.fps ||=
        video?.r_frame_rate && video.r_frame_rate !== '0/0'
          ? video.r_frame_rate
          : edl.canvas.fps;
      source.audio = info.streams.some((s) => s.codec_type === 'audio');
      if (video) {
        source.w = video.width;
        source.h = video.height;
        source.frames = Number(video.nb_frames) || source.frames;
        source.alpha =
          source.alpha ??
          /^(yuva|rgba|bgra|argb|abgr|gbrap|pal8)/.test(video.pix_fmt ?? '');
        // Display-matrix rotation is counterclockwise; geometry uses clockwise.
        const rotation = video.side_data_list?.find((s) =>
          Number.isFinite(s.rotation),
        )?.rotation;
        if (rotation != null) source.rotation = -rotation;
        else if (video.tags?.rotate)
          source.rotation = Number(video.tags.rotate);
      }
      source.duration ||= Number(info.format?.duration) || undefined;
      const st = statSync(source.path);
      source.signature = `${st.size}:${st.mtimeMs}`;
    }
    for (const clip of edl.video.flatMap((t) => t.clips)) {
      const source = edl.sources.find((s) => s.id === clip.src);
      if (!source || !clip.camera?.length) continue;
      const geom = coverGeometry(source, edl.canvas, clip.fit);
      if (Math.max(...clip.camera.map((k) => k.zoom)) > zoomCap(geom, edl.canvas) + 1e-6)
        warn(
          `tight punch limited: source is ${Math.round(Math.min(geom.W, geom.H))}p (crop kept at or above 75% of the output)`,
        );
    }
    await interpolateRamps(edl, { ffmpeg, ffprobe, dir, signal, emit, warn });
    const clips = edl.video.flatMap((t) => t.clips);
    // Caption/shape cues share ASS passes; they are not separate graph nodes.
    // Count conservative source/transform stacks and the ASS passes around images.
    const estimatedNodes =
      7 +
      clips.reduce(
        (nodes, clip) =>
          nodes +
          18 +
          (clip.fit === 'contain' ? 3 : 0) +
          (normalizeMask(clip.mask) ? 6 : 0) +
          (clip.grade?.effects?.filter((e) => e.kind === 'primaries').length ??
            0) *
            6,
        0,
      ) +
      (clips.filter((c) => c._overlayIndex != null).length + 1) * 7;
    const [clockN, clockD = 1] = String(edl.canvas.fps).split('/').map(Number);
    const complex =
      strategy === 'B' || estimatedNodes > 200 || total / fps > 600;
    const chunkSize = complex ? Math.max(1, Math.floor(fps * 30)) : total;
    const begin = frame == null ? 0 : Math.max(0, Math.min(total - 1, frame)),
      finish = frame == null ? total : begin + 1;
    const outputs = [];
    const baseFiles = new Set();
    let boosted = 0;
    for (let from = begin; from < finish; from += chunkSize) {
      const to = Math.min(finish, from + chunkSize),
        length = to - from,
        args = [
          '-f',
          'lavfi',
          '-i',
          `color=c=${edl.canvas.bg ?? 'black'}:s=${edl.canvas.w}x${edl.canvas.h}:r=${edl.canvas.fps},format=rgb24`,
        ],
        graph = [
          `[0:v]trim=end_frame=${length},settb=1/${clockN},setpts=N*${clockD},scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709[base0]`,
        ];
      let input = 1,
        layer = 0,
        base = 'base0';
      // Overlay-only re-render: the base composite (every layer below the final
      // text pass) is cached by content; a caption edit re-runs only libass.
      const cacheable = Boolean(cacheDir) && frame == null && kimoText && !complex;
      let baseFile = null;
      let reused = false;
      let overlayCursor = 0;
      const pictureCursor = () => {
        let cursor = 0;
        for (const clip of clips)
          if (clip._overlayIndex != null && framePlan(clip, edl.sources.find((s) => s.id === clip.src), edl.canvas.fps, from, to).indices.length) cursor = Math.max(cursor, clip._overlayIndex + 1);
        return cursor;
      };
      if (cacheable) {
        const cursor = pictureCursor();
        const key = createHash('sha256')
          .update(
            JSON.stringify([
              BASE_CACHE_VERSION,
              edl.canvas,
              edl.video,
              edl.sources.map((s) => [s.id, s.path, s.signature, s.fps, s.w, s.h, s.rotation]),
              edl.overlays.slice(0, cursor),
              from,
              to,
              [...copied].sort(),
            ]),
          )
          .digest('hex')
          .slice(0, 24);
        await mkdir(cacheDir, { recursive: true });
        baseFile = join(cacheDir, `base-${key}.mkv`);
        baseFiles.add(baseFile);
        reused = existsSync(baseFile) && statSync(baseFile).size > 0;
        if (reused) {
          overlayCursor = cursor;
          emit({ t: 'op', id: `${id}-base`, opId: `${id}-base`, tool: 'caption_pass', phase: 'start', title: 'captions only · base picture reused from cache', why: 'a caption change re-renders the text layer, not the picture', at: Date.now() });
          emit({ t: 'op', id: `${id}-base`, opId: `${id}-base`, tool: 'caption_pass', phase: 'end', ok: true, ms: 0, result: `${length} cached base frames`, at: Date.now() });
        }
      }
      if (!reused) {
        const baked = complex
          ? await bakeTracks(edl, { ffmpeg, dir, from, to, signal, emit })
          : null;
        const activeClips = baked?.clips ?? clips,
          activeSources = baked?.sources ?? edl.sources;
        let pass = 0;
        for (const clip of activeClips) {
          const source = activeSources.find((s) => s.id === clip.src),
            plan = framePlan(clip, source, edl.canvas.fps, from, to);
          if (!plan.indices.length) continue;
          // The overlay array is ordered, including text underneath later images.
          if (clip._overlayIndex != null) {
            const ass = join(dir, `before-${from}-${clip._overlayIndex}.ass`);
            const text = subtitles(
              {
                ...edl,
                overlays: edl.overlays.slice(overlayCursor, clip._overlayIndex),
              },
              from,
              to,
            );
            await writeFile(ass, text);
            const textBase = `textBefore${clip._overlayIndex}`;
            graph.push(
              `[${base}]${textFilter(ass, fontDir, text)}[${textBase}]`,
            );
            base = textBase;
            overlayCursor = clip._overlayIndex + 1;
          }
          let vf;
          if (clip._baked) {
            args.push('-i', source.path);
            vf =
              'setpts=PTS-STARTPTS,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709';
          } else if (!plan.arithmetic) {
            const key = createHash('sha256')
                .update(
                  JSON.stringify([
                    clip,
                    source,
                    edl.canvas,
                    plan.start,
                    plan.end,
                  ]),
                )
                .digest('hex')
                .slice(0, 20),
              segment = join(dir, `segment-${key}.mkv`);
            if (!existsSync(segment))
              await mappedSegment({
                ffmpeg,
                source,
                clip,
                canvas: edl.canvas,
                plan,
                output: segment,
                signal,
                onProgress: (n) =>
                  emit({
                    t: 'progress',
                    phase: 'compose',
                    label: 'mapping source frames',
                    frame: plan.start + n,
                    total,
                    f: (plan.start + n) / total,
                    fps: n / Math.max(0.001, (Date.now() - started) / 1000),
                  }),
              });
            args.push('-i', segment);
            vf =
              'setpts=PTS-STARTPTS,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709';
          } else {
            const first = plan.indices[0],
              last = plan.indices.at(-1),
              seek =
                source.kind === 'image'
                  ? 0
                  : Math.max(0, (first - 0.5) / rate(source.fps));
            if (source.kind === 'image')
              args.push('-loop', '1', '-framerate', String(edl.canvas.fps));
            args.push(
              '-noautorotate',
              '-ss',
              String(seek),
              '-accurate_seek',
              '-i',
              source.path,
            );
            vf = `trim=end_frame=${last - first + 1}${plan.stride > 1 ? `,select='not(mod(n,${plan.stride}))'` : ''},trim=end_frame=${plan.indices.length},setpts=N/(${fps}*TB),${geometry(clip, source, edl.canvas, plan)}`;
          }
          const name = `clip${layer}`,
            next = `base${layer + 1}`;
          graph.push(
            `[${input}:v]${vf},settb=1/${clockN},setpts=N*${clockD}+${(plan.start - from) * clockD}[${name}]`,
          );
          let top = name;
          graph.push(
            `[${base}][${top}]overlay=eof_action=pass:repeatlast=0:format=auto:enable='gte(t,${safe((plan.start - from - 0.25) / fps)})*lt(t,${safe((plan.end - from - 0.25) / fps)})',setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709[${next}]`,
          );
          base = next;
          input++;
          layer++;
          if (layer === 20) {
            const stage = join(dir, `layers-${from}-${pass}.mkv`),
              stageScript = join(dir, `layers-${from}-${pass}.ffgraph`);
            pass++;
            graph.push(`[${base}]format=yuv444p[staged]`);
            await writeFile(stageScript, graph.join(';\n'));
            await ffmpegRun(
              ffmpeg,
              [
                ...args,
                await scriptOption(ffmpeg),
                stageScript,
                '-map',
                '[staged]',
                '-an',
                '-frames:v',
                String(length),
                ...lossless,
                stage,
              ],
              { signal, cwd: dir },
            );
            args.length = 0;
            args.push('-i', stage);
            graph.length = 0;
            graph.push(
              `[0:v]settb=1/${clockN},setpts=N*${clockD},format=yuv444p[base0]`,
            );
            base = 'base0';
            input = 1;
            layer = 0;
          }
        }
        if (cacheable) {
          // keep the base composite for fast caption re-renders, then draw text on top of it
          graph.push(`[${base}]format=yuv444p[staged]`);
          const stageScript = join(dir, `base-${from}.ffgraph`);
          await writeFile(stageScript, graph.join(';\n'));
          const partial = baseFile + '.partial.mkv';
          await ffmpegRun(ffmpeg, [...args, await scriptOption(ffmpeg), stageScript, '-map', '[staged]', '-an', '-frames:v', String(length), ...lossless, partial], { signal, cwd: dir });
          await rename(partial, baseFile);
        }
      }
      if (cacheable) {
        args.length = 0;
        args.push('-i', baseFile);
        graph.length = 0;
        graph.push(`[0:v]settb=1/${clockN},setpts=N*${clockD},format=yuv444p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709[base0]`);
        base = 'base0';
        boosted += await contrastPass(edl, { ffmpeg, base: baseFile, from, to, signal });
      }
      const ass = join(dir, `overlays-${from}.ass`);
      const text = finalScript(edl, edl.overlays.slice(overlayCursor), from, to);
      await writeFile(ass, text);
      graph.push(`[${base}]${textFilter(ass, fontDir, text)}[composed]`);
      const script = join(dir, `picture-${from}.ffgraph`),
        chunk = join(dir, `picture-${from}.mkv`);
      await writeFile(script, graph.join(';\n'));
      await ffmpegRun(
        ffmpeg,
        [
          ...args,
          await scriptOption(ffmpeg),
          script,
          '-map',
          '[composed]',
          '-an',
          '-frames:v',
          String(length),
          ...lossless,
          chunk,
        ],
        {
          signal,
          cwd: dir,
          onProgress: (n) => {
            const elapsed = (Date.now() - started) / 1000,
              done = from + n;
            emit({
              t: 'progress',
              id,
              opId: id,
              tool: 'compose',
              phase: 'compose',
              label: `compositing frame ${done}/${total} · ${(done / Math.max(0.001, elapsed)).toFixed(1)} fps`,
              frame: done,
              total,
              f: done / total,
              fps: done / Math.max(0.001, elapsed),
              eta: done ? (elapsed * (total - done)) / done : null,
            });
          },
        },
      );
      outputs.push(chunk);
    }
    if (cacheDir && baseFiles.size) {
      // one cached base per edit: drop stale composites of earlier versions
      for (const name of readdirSync(cacheDir))
        if (/^base-[0-9a-f]+\.mkv(\.partial\.mkv)?$/.test(name) && !baseFiles.has(join(cacheDir, name)))
          try {
            unlinkSync(join(cacheDir, name));
          } catch {
            /* in use; next render */
          }
    }
    if (frame != null) {
      await ffmpegRun(ffmpeg, ['-i', outputs[0], '-frames:v', '1', output], {
        signal,
      });
    } else {
      let picture = outputs[0];
      if (outputs.length > 1) {
        const list = join(dir, 'concat.ffcat');
        await writeFile(
          list,
          outputs.map((p) => `file '${basename(p)}'`).join('\n'),
        );
        picture = join(dir, 'picture.mkv');
        await ffmpegRun(
          ffmpeg,
          ['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', picture],
          { signal },
        );
      }
      if(edl.sound?.enabled) edl.sound.stem_dir=resolve(output,'..','audio');
      const audio = await audioMix(edl, {
        ffmpeg,
        dir,
        signal,
        totalFrames: total,
        emit,
      });
      const partial = output + '.partial.mkv';
      await ffmpegRun(
        ffmpeg,
        [
          '-i',
          picture,
          '-i',
          audio,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c',
          'copy',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          '-colorspace',
          'bt709',
          '-color_range',
          'tv',
          partial,
        ],
        { signal },
      );
      await rename(partial, output);
    }
    emit({
      t: 'op',
      id,
      opId: id,
      tool: 'compose',
      phase: 'end',
      ok: true,
      ms: Date.now() - started,
      result: `${frame == null ? total : 1} exact frames${boosted ? ` · ${boosted} caption${boosted === 1 ? '' : 's'} given a contrast box` : ''}`,
      at: Date.now(),
    });
    return {
      output,
      duration: total / fps,
      frames: total,
      strategy: complex ? 'B' : 'A',
    };
  } catch (error) {
    emit({
      t: 'op',
      id,
      opId: id,
      tool: 'compose',
      phase: 'end',
      ok: false,
      ms: Date.now() - started,
      error: error.message,
      at: Date.now(),
    });
    throw error;
  } finally {
    if (process.env.KIMO_COMPOSE_KEEP_WORK !== '1') {
      const target = resolve(dir);
      if (!target.startsWith(workspace + sep))
        throw new Error(
          'Refusing compositor cleanup outside its private workspace',
        );
      await rm(target, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  }
}
