import {
  mkdir,
  writeFile,
  rename,
  mkdtemp,
  rm,
  readdir,
  copyFile,
} from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, resolve, sep, basename } from 'node:path';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { spawnBackground } from './resources.cjs';
import {
  validate,
  rate,
  frameCount,
  framePlan,
  curveValue,
  curveSampler,
} from './edl.mjs';
import { rectFilter, splineExpr } from './sam.mjs';
import { subtitles } from './compose-text.mjs';

const stop = (signal) => {
  if (signal?.aborted) throw new Error('cancelled');
};
const safe = (n) => (Number.isFinite(n) ? Number(n.toFixed(9)) : 0);
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
export function cameraRectsForClip(clip, source, canvas, plan) {
  const W = Math.abs(source.rotation ?? 0) % 180 === 90 ? source.h : source.w,
    H = Math.abs(source.rotation ?? 0) % 180 === 90 ? source.w : source.h;
  const aspect = canvas.w / canvas.h;
  let cw = W,
    ch = H;
  if (clip.fit !== 'contain') {
    if (W / H > aspect) cw = H * aspect;
    else ch = W / aspect;
  }
  const keys = clip.camera?.length
    ? clip.camera
    : [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'cubic' }];
  const curve = (key) => ({
    base: keys[0][key],
    keys: keys.map((k) => ({ t: k.t, v: k[key], ease: k.ease ?? 'cubic' })),
  });
  const zoomAt = curveSampler(curve('zoom'), 1),
    xAt = curveSampler(curve('x'), 0.5),
    yAt = curveSampler(curve('y'), 0.5);
  return plan.indices.map((_, i) => {
    const t = (plan.start + i) / rate(canvas.fps) - clip.at,
      z = zoomAt(t),
      w = cw / z,
      h = ch / z;
    const x = xAt(t) * W - w / 2,
      y = yAt(t) * H - h / 2;
    return [
      Math.max(0, Math.min(W - w, x)),
      Math.max(0, Math.min(H - h, y)),
      w,
      h,
    ];
  });
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
  if (clip.fit === 'contain') {
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
  const opacity = plan.indices.map((_, i) =>
    Math.max(
      0,
      Math.min(
        1,
        curveValue(
          clip.opacity,
          (plan.start + i) / rate(canvas.fps) - clip.at,
          1,
        ),
      ),
    ),
  );
  if (opacity.some((v) => v < 1))
    filters.push(
      `geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${splineExpr(opacity, 'N', 0.001)})'`,
    );
  return filters.join(',');
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
  const args = [],
    filters = [],
    labels = [];
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
      const fade = Math.min(0.01, length / 3);
      chain.push(
        `afade=t=in:st=0:d=${safe(fade)}:curve=qsin`,
        `afade=t=out:st=${safe(length - fade)}:d=${safe(fade)}:curve=qsin`,
        `adelay=${Math.round(c.at * 48000)}S:all=1`,
      );
      filters.push(`[${argsIndex}:a:0]${chain.join(',')}[a${input}]`);
      labels.push(`[a${input}]`);
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
  if (!labels.length) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    filters.push(`[0:a]atrim=end_sample=${samples}[mix]`);
  } else
    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,atrim=end_sample=${samples}[mix]`,
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
}) {
  // Work on a private normalized copy; IPC/saved EDLs stay immutable.
  edl = structuredClone(edl);
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
  for (const [overlayIndex, overlay] of edl.overlays.entries()) {
    if (!['image', 'text_behind'].includes(overlay.kind) || !overlay.src)
      continue;
    const p = overlay.props ?? {};
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
        },
      ],
    });
  }
  validate(edl);
  stop(signal);
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
    at: started,
  });
  try {
    let localFonts = false;
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
      if (files.length) {
        await mkdir(join(dir, 'fonts'));
        for (const file of files)
          await copyFile(join(fontsDir, file), join(dir, 'fonts', file));
        localFonts = true;
      }
    }
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
    const clips = edl.video.flatMap((t) => t.clips),
      estimatedNodes = clips.length * 7 + edl.overlays.length * 2;
    const [clockN, clockD = 1] = String(edl.canvas.fps).split('/').map(Number);
    const complex =
      strategy === 'B' || estimatedNodes > 200 || total / fps > 600;
    const chunkSize = complex ? Math.max(1, Math.floor(fps * 30)) : total;
    const begin = frame == null ? 0 : Math.max(0, Math.min(total - 1, frame)),
      finish = frame == null ? total : begin + 1;
    const outputs = [];
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
      const baked = complex
        ? await bakeTracks(edl, { ffmpeg, dir, from, to, signal, emit })
        : null;
      const activeClips = baked?.clips ?? clips,
        activeSources = baked?.sources ?? edl.sources;
      let pass = 0;
      let overlayCursor = 0;
      for (const clip of activeClips) {
        const source = activeSources.find((s) => s.id === clip.src),
          plan = framePlan(clip, source, edl.canvas.fps, from, to);
        if (!plan.indices.length) continue;
        // The overlay array is ordered, including text underneath later images.
        if (clip._overlayIndex != null) {
          const ass = join(dir, `before-${from}-${clip._overlayIndex}.ass`);
          await writeFile(
            ass,
            subtitles(
              {
                ...edl,
                overlays: edl.overlays.slice(overlayCursor, clip._overlayIndex),
              },
              from,
              to,
            ),
          );
          const textBase = `textBefore${clip._overlayIndex}`;
          graph.push(
            `[${base}]subtitles=filename='${basename(ass)}'${localFonts ? ":fontsdir='fonts'" : ''}[${textBase}]`,
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
        if (
          clip.mask ||
          (clip.blend && clip.blend !== 'normal') ||
          clip.grade?.native ||
          clip.grade?.effects?.length ||
          clip.transition_in
        )
          emit({
            t: 'op',
            tool: 'compose_warning',
            phase: 'end',
            warning: true,
            ok: true,
            title: `${clip.id}: native grade/mask/blend/transition retained in EDL; unsupported effects require an explicit compositor implementation`,
            at: Date.now(),
          });
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
      const ass = join(dir, `overlays-${from}.ass`);
      await writeFile(
        ass,
        subtitles(
          { ...edl, overlays: edl.overlays.slice(overlayCursor) },
          from,
          to,
        ),
      );
      graph.push(
        `[${base}]subtitles=filename='${basename(ass)}'${localFonts ? ":fontsdir='fonts'" : ''},format=yuv444p[composed]`,
      );
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
              phase: 'compose',
              label: 'compositing picture',
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
      result: `${frame == null ? total : 1} exact frames`,
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
