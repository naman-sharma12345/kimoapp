import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { decodeMaskToRaster } from '@meta-sam/parser';
import { cachedPersonTracks } from '../sam.mjs';
import { run } from '../audio/process.mjs';
import { inputFilters } from './filters.mjs';
import { clamp, luma, chroma, saturation, skinClass } from './math.mjs';

export const COLOR_ANALYSIS_VERSION = 4;
export function frameStats(
  rgb,
  w,
  h,
  { faceBox = null, subjectMask = null } = {},
) {
  const histogram = Array(256).fill(0),
    skinHistogram = Array(256).fill(0),
    mid = [0, 0, 0],
    grey = [0, 0, 0],
    skin = [0, 0, 0],
    samples = [];
  let pixels = 0,
    dark = 0,
    bright = 0,
    sat = 0,
    midCount = 0,
    greyCount = 0,
    skinCount = 0;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      const p = (y * w + x) * 3,
        c = [rgb[p] / 255, rgb[p + 1] / 255, rgb[p + 2] / 255],
        Y = luma(c),
        S = saturation(c),
        classified = skinClass(c);
      const inFace =
        faceBox &&
        x / w >= faceBox[0] &&
        x / w <= faceBox[0] + faceBox[2] &&
        y / h >= faceBox[1] &&
        y / h <= faceBox[1] + faceBox[3];
      const inSubject = subjectMask?.(x / w, y / h) ?? false,
        isSkin = classified && (inSubject || inFace);
      pixels++;
      histogram[Math.round(Y * 255)]++;
      sat += S;
      if (Y <= 1 / 255) dark++;
      if (Y >= 254 / 255) bright++;
      if (Y > 0.15 && Y < 0.8) {
        midCount++;
        for (let k = 0; k < 3; k++) mid[k] += c[k];
      }
      if (S < 0.16 && Y > 0.08 && Y < 0.9 && !classified) {
        greyCount++;
        for (let k = 0; k < 3; k++) grey[k] += c[k];
      }
      if (isSkin) {
        skinCount++;
        skinHistogram[Math.round(Y * 255)]++;
        for (let k = 0; k < 3; k++) skin[k] += c[k];
      }
      if (
        samples.length < 256 &&
        pixels % Math.max(1, Math.floor((w * h) / 4 / 256)) === 0
      )
        samples.push(c);
    }
  const percentile = (p) => {
    let n = 0;
    for (let i = 0; i < 256; i++) {
      n += histogram[i];
      if (n >= pixels * p) return i / 255;
    }
    return 1;
  };
  return {
    pixels,
    histogram,
    p1: percentile(0.01),
    p10: percentile(0.1),
    p50: percentile(0.5),
    p90: percentile(0.9),
    p99: percentile(0.99),
    clipped_low_pct: (100 * dark) / Math.max(1, pixels),
    clipped_high_pct: (100 * bright) / Math.max(1, pixels),
    saturation_mean: sat / Math.max(1, pixels),
    mid: { rgb: mid.map((v) => v / Math.max(1, midCount)), count: midCount },
    grey: {
      rgb: grey.map((v) => v / Math.max(1, greyCount)),
      count: greyCount,
    },
    skin: {
      rgb: skin.map((v) => v / Math.max(1, skinCount)),
      count: skinCount,
      histogram: skinHistogram,
      region: subjectMask
        ? 'cached SAM subject'
        : faceBox
          ? 'face box'
          : 'unavailable',
    },
    samples,
  };
}
export function aggregateFrames(frames) {
  const accepted = frames.filter(
    (s) =>
      s.p99 > 0.025 && !(s.p90 - s.p10 < 0.04 && (s.p50 < 0.1 || s.p50 > 0.92)),
  );
  if (!accepted.length)
    return {
      version: COLOR_ANALYSIS_VERSION,
      available: false,
      frames: 0,
      skipped: frames.length,
      reason: 'all sampled frames are black, white or fade-like',
    };
  const histogram = Array(256).fill(0);
  let n = 0;
  for (const s of accepted) {
    n += s.pixels;
    for (let i = 0; i < 256; i++) histogram[i] += s.histogram[i];
  }
  const percentile = (p) => {
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += histogram[i];
      if (sum >= n * p) return i / 255;
    }
    return 1;
  };
  const weighted = (group) => {
    const count = accepted.reduce((a, s) => a + s[group].count, 0);
    return {
      count,
      rgb: [0, 1, 2].map(
        (k) =>
          accepted.reduce((a, s) => a + s[group].rgb[k] * s[group].count, 0) /
          Math.max(1, count),
      ),
    };
  };
  const result = {
    version: COLOR_ANALYSIS_VERSION,
    available: true,
    frames: accepted.length,
    skipped: frames.length - accepted.length,
    p1: percentile(0.01),
    p10: percentile(0.1),
    p50: percentile(0.5),
    p90: percentile(0.9),
    p99: percentile(0.99),
    clipped_low_pct:
      accepted.reduce((a, s) => a + s.clipped_low_pct * s.pixels, 0) / n,
    clipped_high_pct:
      accepted.reduce((a, s) => a + s.clipped_high_pct * s.pixels, 0) / n,
    saturation_mean:
      accepted.reduce((a, s) => a + s.saturation_mean * s.pixels, 0) / n,
    mid: weighted('mid'),
    grey: weighted('grey'),
    skin: {
      ...weighted('skin'),
      region: [...new Set(accepted.map((s) => s.skin.region))].join(', '),
    },
    samples: accepted.flatMap((s) => s.samples).slice(0, 3072),
  };
  result.contrast = result.p90 - result.p10;
  result.log_like =
    result.contrast < 0.28 && result.saturation_mean < 0.2 && result.p99 < 0.85;
  if (result.skin.count) {
    let n = 0;
    for (let i = 0; i < 256; i++) {
      n += accepted.reduce((sum, f) => sum + (f.skin.histogram?.[i] ?? 0), 0);
      if (n >= result.skin.count / 2) {
        result.skin.p50 = i / 255;
        break;
      }
    }
  }
  result.mid.chroma = chroma(result.mid.rgb);
  result.skin.chroma = result.skin.count ? chroma(result.skin.rgb) : null;
  return result;
}
function regionAt(head, time, aspect = 1) {
  if (!head?.cx?.length) return null;
  if (!(head.fps > 0) || time > (head.t0 ?? 0) + head.cx.length / head.fps)
    return null;
  const i = clamp(
      Math.round((time - (head.t0 ?? 0)) * head.fps),
      0,
      head.cx.length - 1,
    ),
    cx = head.cx[i],
    top = head.top?.[i],
    chin = head.chin?.[i];
  if (!Number.isFinite(cx + top + chin) || chin <= top) return null;
  const height = clamp((chin - top) * 1.2, 0.05, 0.6),
    width = clamp((height * 0.85) / aspect, 0.04, 0.55);
  return [clamp(cx - width / 2), clamp(top), width, height];
}
function maskAt(tracks, time) {
  const object = tracks?.objects?.get(tracks.main);
  if (!object) return null;
  if (time >= tracks.frames / (tracks.fps ?? 12)) return null;
  const index = clamp(
      Math.round(time * (tracks.fps ?? 12)),
      0,
      tracks.frames - 1,
    ),
    record = object.frames.get(index) ?? object.frames.get(index - 1);
  if (!record?.mask) return null;
  let pixels;
  try {
    pixels = decodeMaskToRaster(record.mask);
  } catch {
    return null;
  }
  const box = record.box,
    width = record.mask.width,
    height = record.mask.height;
  return (x, y) => {
    const px = x * tracks.width,
      py = y * tracks.height;
    if (px < box.left || px >= box.right || py < box.top || py >= box.bottom)
      return false;
    const xx = Math.min(
        width - 1,
        Math.floor(((px - box.left) / (box.right - box.left)) * width),
      ),
      yy = Math.min(
        height - 1,
        Math.floor(((py - box.top) / (box.bottom - box.top)) * height),
      );
    return pixels[yy * width + xx] > 0;
  };
}
export async function analyzeClip({
  ffmpeg,
  source,
  clip,
  cacheDir,
  samDir,
  head,
  signal,
  emit = () => {},
  count = 12,
  width = 480,
}) {
  const st = statSync(source.path),
    tracks = samDir
      ? (cachedPersonTracks(samDir, source.path, source.duration) ??
        (process.platform === 'win32'
          ? cachedPersonTracks(
              samDir,
              source.path.replaceAll('/', '\\'),
              source.duration,
            )
          : null))
      : null;
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        COLOR_ANALYSIS_VERSION,
        source.path,
        st.size,
        st.mtimeMs,
        source.color,
        source.rotation,
        clip.in,
        clip.out,
        count,
        width,
        head,
        Boolean(tracks),
      ]),
    )
    .digest('hex')
    .slice(0, 24);
  await mkdir(cacheDir, { recursive: true });
  const path = join(cacheDir, key + '.json');
  if (existsSync(path))
    return { ...JSON.parse(await readFile(path, 'utf8')), cached: true, key };
  const id = randomUUID().slice(0, 8),
    start = Date.now();
  emit({
    t: 'op',
    id,
    opId: id,
    tool: 'color_analysis',
    phase: 'start',
    title: `colour: analysing ${clip.id}`,
    why: 'sampled exposure, white balance and skin; no AI calls',
    at: start,
  });
  try {
    const frames = [],
      length = Math.max(0.001, clip.out - clip.in),
      n = source.kind === 'image' ? 1 : count;
    const rotated = Math.abs(source.rotation ?? 0) % 180 === 90,
      aspect = rotated ? source.h / source.w : source.w / source.h;
    const height = Math.max(2, Math.round(width / aspect / 2) * 2);
    if (!(height > 0) || height > 1920)
      throw new Error('Colour analysis dimensions are invalid');
    for (let i = 0; i < n; i++) {
      signal?.throwIfAborted();
      const at = (clip.in ?? 0) + (length * (i + 0.5)) / n;
      const { stdout } = await run(
        ffmpeg,
        [
          '-ss',
          String(source.kind === 'image' ? 0 : at),
          '-i',
          source.path,
          '-frames:v',
          '1',
          '-an',
          '-vf',
          `${inputFilters(source)},scale=${width}:${height}:flags=area,format=rgb24`,
          '-f',
          'rawvideo',
          '-',
        ],
        { signal, binary: true, limit: width * height * 3 + 65536 },
      );
      if (stdout.length !== width * height * 3) continue;
      frames.push(
        frameStats(stdout, width, height, {
          faceBox: regionAt(head, at, aspect),
          subjectMask: maskAt(tracks, at),
        }),
      );
      emit({
        t: 'progress',
        phase: 'colour',
        label: `analysing colour · ${clip.id}`,
        f: (i + 1) / n,
      });
    }
    const result = {
      ...aggregateFrames(frames),
      key,
      source_signature: `${st.size}:${st.mtimeMs}`,
      sample_width: width,
      requested_frames: n,
      sampled_frames: frames.length,
    };
    await writeFile(path, JSON.stringify(result));
    emit({
      t: 'op',
      id,
      phase: 'end',
      ok: true,
      ms: Date.now() - start,
      result: `${result.frames} usable frames${result.log_like ? ' · flat/log-like profile' : ''}${result.skin?.count ? ' · skin sampled' : ''}`,
    });
    return result;
  } catch (error) {
    emit({
      t: 'op',
      id,
      phase: 'end',
      ok: false,
      ms: Date.now() - start,
      error: error.message,
    });
    throw error;
  }
}
